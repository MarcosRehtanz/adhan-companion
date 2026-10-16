//! Spike 2→4 — el motor de fondo 24/7 con el cálculo REAL.
//!
//! - `Schedule` / `PrayerSlot`: los tipos del contrato IPC (embrión de `get_schedule`)
//! - `compute_schedule`: FFI a PrayTimes C (config constants default hasta que
//!   exista config.json) — la fuente única del cálculo
//! - `run`: tick por segundo con los triggers del spec:
//!   • medianoche (cambio de fecha local) → recalcular
//!   • resume del sleep (`PrepareForSleep` de login1 vía zbus) → recalcular + realinear
//!   • disparo del adhan (WAV del spike) → estado verde 60 s, luego avanza
//! - estados del icono de acuerdo al tiempo real hasta el próximo rezo

use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use chrono::{Datelike, Timelike};
use serde::Serialize;
use tauri::Emitter;

use crate::config::SharedConfig;
use crate::prayer::PRAYER_INDICES;

/// Los 5 rezos del schema del spec (sin sunrise/sunset, índices 0..4)
pub const PRAYERS: [&str; 5] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

/// Duración del estado "verde" (adhan sonando) en el spike
const ADHAN_SECS: i64 = 60;

#[derive(Debug, Clone, Serialize)]
pub struct PrayerSlot {
    pub name: String,
    /// Horas decimales (ej. 5.5 = 05:30) — igual que el `out[7]` del contrato praytimes.h
    pub dec: f64,
    pub hhmm: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Schedule {
    pub date: String,
    pub prayers: Vec<PrayerSlot>,
    /// Nombre del próximo rezo todavía no disparado hoy; None si ya pasaron los 5
    pub next: Option<String>,
    /// Segundos hasta el próximo rezo; None si no queda ninguno o el adhan ya sonó
    pub countdown_secs: Option<i64>,
    /// Rezos de hoy marcados como rezados (copia del registro.jsonl del día)
    pub marked: Vec<String>,
}

/// Estado compartido con el mundo IPC (`get_schedule` / `schedule_changed`)
pub type SharedState = Arc<Mutex<SharedStateInner>>;

pub struct SharedStateInner {
    pub schedule: Schedule,
    /// Índice del próximo rezo por disparar (posición dentro de `prayers`)
    pub fired: usize,
}

impl SharedStateInner {
    pub fn new(cfg: &crate::config::Config) -> Self {
        let schedule = compute_schedule(cfg);
        let now = chrono::Local::now();
        let now_h = now.hour() as f64 + now.minute() as f64 / 60.0;
        // next = el primer rezo del día todavía no pasado (sino, ya dispararon todos)
        let fired = PRAYERS
            .iter()
            .zip(schedule.prayers.iter())
            .position(|(_, p)| p.dec > now_h)
            .unwrap_or(PRAYERS.len());
        Self { schedule, fired }
    }
}

/// Snapshot seguro del config (panics en poison nunca deben pisar el tray)
fn snapshot(cfg: &SharedConfig) -> crate::config::Config {
    cfg.read().map(|c| c.clone()).unwrap_or_default()
}

/// Triggers del spec que llegan al loop externo al tick
pub enum Trigger {
    /// login1 reporta el wake (starting=false de PrepareForSleep) → recalcular
    Resume,
    /// el config cambió (IPC set_config) → recalcular
    ConfigChanged,
    /// el usuario marcó/desmarcó un rezo (menú del tray o IPC mark_prayed).
    /// `date` vacía = hoy (lo resuelve el scheduler con el schedule del día)
    Pray { date: String, prayer: String },
}

/// Rezos (los 5) calculados para una fecha concreta con el config dado.
/// Reutilizado por el schedule del día (hoy) y por `get_schedule_for` (pasado).
pub fn prayer_slots_for(y: i32, m: i32, d: i32, cfg: &crate::config::Config) -> Vec<PrayerSlot> {
    let pcfg = crate::prayer::PrayerConfig::from(cfg);
    let times7 = crate::prayer::calc_times(
        y, m, d,
        cfg.lat, cfg.lon, cfg.tz_offset_hours(),
        &pcfg,
    );
    PRAYERS
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let dec = times7[PRAYER_INDICES[i]];
            let h = (dec.trunc() as i32) % 24;
            let min = (dec.fract() * 60.0).round() as i32;
            PrayerSlot {
                name: (*name).to_string(),
                dec,
                hhmm: format!("{h:02}:{min:02}"),
                enabled: true,
            }
        })
        .collect()
}

/// Horarios REALES vía FFI al C, con el config del usuario (o default).
/// El tz del config es IANA pero el C pide offset decimal: se toma del
/// sistema (chrono) — el cambio de TZ del sistema es otro trigger del spec.
pub fn compute_schedule(cfg_snapshot: &crate::config::Config) -> Schedule {
    let now = chrono::Local::now();
    let prayers = prayer_slots_for(now.year(), now.month() as i32, now.day() as i32, cfg_snapshot);
    let date = now.format("%Y-%m-%d").to_string();
    let marked = PRAYERS
        .iter()
        .filter(|n| crate::registro::is_prayer_marked(&date, n))
        .cloned()
        .map(String::from)
        .collect();
    Schedule {
        date,
        prayers,
        next: Some(PRAYERS[0].into()),
        countdown_secs: None,
        marked,
    }
}

/// Círculo RGBA por estado — movido de lib.rs para que scheduler y tray
/// usen el mismo source mientras no existan assets reales.
/// Macro `log!` exportada desde lib.rs; acá se usa como `crate::log!`.
pub fn spawn_login1_watcher(tx: mpsc::Sender<Trigger>) {
    std::thread::spawn(move || {
        let conn = match zbus::blocking::Connection::system() {
            Ok(c) => c,
            Err(e) => {
                crate::log!("zbus: conexión system falló ({e}) — trigger de resume inerte");
                return;
            }
        };
        let proxy = match zbus::blocking::Proxy::new(
            &conn,
            "org.freedesktop.login1",
            "/org/freedesktop/login1",
            "org.freedesktop.login1.Manager",
        ) {
            Ok(p) => p,
            Err(e) => {
                crate::log!("zbus: proxy login1 falló ({e}) — trigger de resume inerte");
                return;
            }
        };
        log_watcher_ready();

        // PrepareForSleep emite dos veces: starting=true al dormir, starting=false al reanudar.
        // El trigger del spec pasa solo en el resume (starting=false).
        match proxy.receive_signal("PrepareForSleep") {
            Ok(mut stream) => loop {
                match stream.next() {
                    Some(msg) => {
                        let starting: bool = msg.body().deserialize().unwrap_or(true);
                        crate::log!("PrepareForSleep: starting={starting}");
                        if !starting {
                            if let Err(e) = tx.send(Trigger::Resume) {
                                crate::log!("scheduler parado, trigger Resume descartado ({e})");
                                break;
                            }
                        }
                    }
                    None => {
                        crate::log!("zbus: stream de señal terminó");
                        break;
                    }
                }
            },
            Err(e) => {
                crate::log!("zbus: receive_signal falló ({e}) — trigger de resume inerte");
            }
        }
    });
}

fn log_watcher_ready() {
    crate::log!("zbus conectado a login1 — escuchando PrepareForSleep");
}

/// Estados del tray con las specs de la matriz estado×icono:
/// gris (silenciado) / azul (día) / ámbar (próximo < 15 min) / verde (adhan)
#[derive(Debug, Clone, Copy)]
pub enum IconoEstado {
    Silenciado,
    Dia,
    Proximo,
    Adhan,
}

/// PNG 32px por estado, generados por `scripts/gen-icons.py` (mismo glyph
/// que el app icon). Se cargan de assets embebidos — sin dibujo en runtime.
pub fn icon_de(estado: IconoEstado) -> tauri::image::Image<'static> {
    let bytes: &'static [u8] = match estado {
        IconoEstado::Silenciado => include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/tray/silenciado.png")),
        IconoEstado::Dia => include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/tray/dia.png")),
        IconoEstado::Proximo => include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/tray/proximo.png")),
        IconoEstado::Adhan => include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/tray/adhan.png")),
    };
    tauri::image::Image::from_bytes(bytes)
        .expect("PNG del tray debe decodificar (generados por scripts/gen-icons.py)")
}

/// Notificación freedesktop desde el core (plugin notification)
fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
    crate::log!("notificación: {title} — {body}");
}

/// test del canal para el comando IPC / menú
pub fn notify_test(app: &tauri::AppHandle) {
    notify(app, "Adhan Companion", "Notificación de prueba — así te avisamos el preaviso y el adhan");
}

pub struct SchedulerLoop {
    pub app: tauri::AppHandle,
    pub tray: tauri::tray::TrayIcon<tauri::Wry>,
    pub countdown_item: tauri::menu::MenuItem<tauri::Wry>,
    /// ítems del menú por rezo: (nombre, handle) — texto con ✓ si marcado
    pub prayer_items: Vec<(String, tauri::menu::MenuItem<tauri::Wry>)>,
    pub rx: mpsc::Receiver<Trigger>,
    pub state: SharedState,
    pub config: SharedConfig,
}

/// Texto de un ítem de rezo en el menú: "✓ Fajr 04:47" si marcado
fn prayer_item_text(name: &str, marked: &[String], schedule: &Schedule) -> String {
    let hhmm = schedule
        .prayers
        .iter()
        .find(|p| p.name == name)
        .map(|p| p.hhmm.clone())
        .unwrap_or_default();
    if marked.contains(&name.to_string()) {
        format!("✓ {name} {hhmm}")
    } else {
        format!("{name}  {hhmm}")
    }
}

/// Actualiza los 5 ítems del menú (en el main thread); se llama en
/// recompute, al marcar y al avanzar el día
fn refresh_prayer_items(s: &SchedulerLoop, schedule: &Schedule) {
    let items = s.prayer_items.clone();
    let sched = schedule.clone();
    let _ = s.app.run_on_main_thread(move || {
        for (name, item) in items {
            let text = prayer_item_text(&name, &sched.marked, &sched);
            let _ = item.set_text(text);
        }
    });
}

pub fn run(s: SchedulerLoop) {
    let mut schedule = compute_schedule(&snapshot(&s.config));
    let mut fired: usize = 0;
    let mut date = schedule.date.clone();
    // Edge del disparo: suena una sola vez por rezo al entrar en zona verde
    let mut adhan_announced = false;
    // Edge del preaviso: una sola vez por rezo cuando entra en ventada notice
    let mut notice_announced = false;
    refresh_prayer_items(&s, &schedule);

    loop {
        std::thread::sleep(Duration::from_secs(1));

        // Trigger: resume del sleep / cambio de config (IPC set_config) / marcar rezado
        let mut recal: Option<&str> = None;
        let mut pray: Option<(String, String)> = None;
        while let Ok(t) = s.rx.try_recv() {
            match t {
                Trigger::Resume => {
                    crate::log!("trigger: resume del sleep → recalcular + realinear timers");
                    recal = Some("resume");
                }
                Trigger::ConfigChanged => {
                    crate::log!("trigger: cambio de config → recalcular con el config nuevo");
                    recal = Some("config");
                }
                Trigger::Pray { date, prayer } => pray = Some((date, prayer)),
            }
        }
        if let Some(via) = recal {
            crate::log!("recalculando vía {via}");
            schedule = compute_schedule(&snapshot(&s.config));
            fired = 0;
            adhan_announced = false;
            notice_announced = false;
            date = schedule.date.clone();
            refresh_prayer_items(&s, &schedule);
            let _ = s.app.emit("schedule_changed", &schedule);
        }
        if let Some((date_arg, name)) = pray {
            if PRAYERS.contains(&name.as_str()) {
                let date = if date_arg.is_empty() { schedule.date.clone() } else { date_arg };
                let already = crate::registro::is_prayer_marked(&date, &name);
                let status = if already { "desmarcado" } else { "rezado" };
                let result = crate::registro::append(&date, &name, status);
                crate::log!(
                    "{}: {} ({})",
                    if already { "desmarcado" } else { "marcado rezado" },
                    name,
                    result.is_ok()
                );
                // solo si es el día de hoy se actualiza el estado del schedule/menú
                if date == schedule.date {
                    if already {
                        schedule.marked.retain(|m| m != &name);
                    } else {
                        if !schedule.marked.contains(&name) {
                            schedule.marked.push(name.clone());
                        }
                        // confirmar (ya recé / ya escuché) también corta el adhan si suena
                        crate::audio::stop_adhan();
                    }
                    refresh_prayer_items(&s, &schedule);
                    {
                        let mut st = s.state.lock().unwrap();
                        st.schedule.marked = schedule.marked.clone();
                        st.schedule.next = schedule.next.clone();
                    }
                }
                let _ = s.app.emit("schedule_changed", &schedule);
            }
        }

        // Trigger: medianoche (cambió la fecha local)
        let now = chrono::Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        if today != date {
            crate::log!("trigger: medianoche → recalcular el día");
            schedule = compute_schedule(&snapshot(&s.config));
            fired = 0;
            adhan_announced = false;
            notice_announced = false;
            date = today;
            refresh_prayer_items(&s, &schedule);
            let _ = s.app.emit("schedule_changed", &schedule);
        }

        // Countdown del próximo rezo aún no disparado
        if fired >= PRAYERS.len() {
            let cd = s.countdown_item.clone();
            let _ = s.app.run_on_main_thread(move || {
                let _ = cd.set_text("Los 5 rezos ya pasaron — hasta medianoche");
            });
            {
                let mut st = s.state.lock().unwrap();
                st.schedule.next = None;
                st.schedule.countdown_secs = None;
            }
            continue;
        }
        let target = schedule.prayers[fired].dec;
        let now_h = now.hour() as i64 * 3600 + now.minute() as i64 * 60 + now.second() as i64;
        let secs = (target * 3600.0) as i64 - now_h;

        // Mock del QoS del spec: si el momento pasó estando la app viva o reanudada
        // muy tarde, no se dispara tarde — se marca como perdido y se sigue
        if secs < -(ADHAN_SECS) {
            crate::log!(
                "adhan de {} terminó (verde {} s) / o sin ventana vivida → marca en el registro y avanza",
                PRAYERS[fired], ADHAN_SECS
            );
            fired += 1;
            adhan_announced = false;
            notice_announced = false;
            let _ = s.app.emit("schedule_changed", &schedule);
            continue;
        }

        // Spike 3: disparo real del audio — suena UNA vez al entrar en zona verde.
        // El regla del spec: si la app duerme sobre el rezo, no se dispara tarde
        // (secs < -ADHAN_SECS ya avanzó arriba sin tocar el audio).
        if secs < 0 && !adhan_announced {
            adhan_announced = true;
            // registro del spec: el disparo queda asentado (status "adhan")
            if let Err(e) = crate::registro::append(&schedule.date, PRAYERS[fired], "adhan") {
                crate::log!("registro del disparo falló: {e}");
            }
            notify(
                &s.app,
                "Adhan — hora de orar",
                format!(
                    "{} ({}) — tocá el menú del tray para confirmar (ya recé) o Silenciar para detener",
                    PRAYERS[fired], schedule.prayers[fired].hhmm
                ).as_str(),
            );
            // audio del config: volumen + toggle enabled por rezo + muecín
            // asignación fija del spec: cada rezo suena el adhan de SU hora
            // (colección Doha: fajr.wav para Fajr, maghrib.wav para Maghrib...).
            // Sin selector — decisión de producto 2026-10-15.
            let cfg = snapshot(&s.config);
            let volumen = cfg.audio.volume as f32 / 100.0;
            let habilitado = cfg
                .audio
                .enabled
                .get(&PRAYERS[fired].to_lowercase())
                .copied()
                .unwrap_or(true);
            let muecin = PRAYERS[fired].to_lowercase();
            if habilitado {
                match crate::audio::play_adhan(volumen, Some(&muecin)) {
                    Ok(()) => crate::log!(
                        "adhan por ALSA — muecín '{}' (rezo propio) — volumen {}%",
                        muecin, cfg.audio.volume
                    ),
                    Err(e) => crate::log!("audio falló en el disparo: {e}"),
                }
            } else {
                crate::log!("adhan silenciado para {} (audio.enabled)", PRAYERS[fired]);
            }
        }

        // Preaviso del spec: N min antes (notice.minutes_before del config),
        // UNA vez por rezo (edge), solo si el rezo todavía no disparó
        let notice_secs = snapshot(&s.config).notice.minutes_before as i64 * 60;
        if secs > 0 && secs <= notice_secs && !notice_announced {
            notice_announced = true;
            notify(
                &s.app,
                "Preaviso",
                format!("{} — {} en {} min", PRAYERS[fired].to_uppercase(), schedule.prayers[fired].hhmm, secs / 60).as_str(),
            );
        }
        if secs <= 0 {
            notice_announced = false;
        }

        // Estados del spec: azul (>15m) → ámbar (≤15m) → verde (adhan sonando ADHAN_SECS)
        let estado = if secs < 0 {
            IconoEstado::Adhan
        } else if secs <= 15 * 60 {
            IconoEstado::Proximo
        } else {
            IconoEstado::Dia
        };
        let label = if secs < 0 {
            format!("— ADHAN — {}", PRAYERS[fired])
        } else {
            format!(
                "{} — en {:02}:{:02}:{:02}",
                PRAYERS[fired].to_uppercase(),
                secs / 3600,
                (secs % 3600) / 60,
                secs % 60,
            )
        };

        let cd = s.countdown_item.clone();
        let tr = s.tray.clone();
        let _ = s.app.run_on_main_thread(move || {
            let _ = cd.set_text(label);
            let _ = tr.set_icon(Some(icon_de(estado)));
        });

        let mut st = s.state.lock().unwrap();
        st.schedule.next = Some(schedule.prayers[fired].name.clone());
        st.schedule.countdown_secs = Some(secs.max(0));
    }
}
