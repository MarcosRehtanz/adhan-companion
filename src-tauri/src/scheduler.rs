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
#[cfg(desktop)]
use std::time::Duration;

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Timelike};
use serde::Serialize;
#[cfg(desktop)]
use tauri::Emitter;

#[cfg(desktop)]
use crate::config::SharedConfig;
use crate::prayer::PRAYER_INDICES;

/// Los 5 rezos del schema del spec (sin sunrise/sunset, índices 0..4)
pub const PRAYERS: [&str; 5] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

/// Duración del estado "verde" (adhan sonando) en el spike
#[cfg(desktop)]
const ADHAN_SECS: i64 = 60;

#[derive(Debug, Clone, Serialize)]
pub struct PrayerSlot {
    pub name: String,
    /// Horas decimales (ej. 5.5 = 05:30) — igual que el `out[7]` del contrato praytimes.h
    pub dec: f64,
    pub hhmm: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NextPrayer {
    pub name: String,
    pub date: String,
    pub hhmm: String,
    /// Instante absoluto en segundos Unix, con el offset local de esa fecha.
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Schedule {
    pub date: String,
    pub prayers: Vec<PrayerSlot>,
    /// Próximo evento futuro, independiente de los horarios y registros de hoy.
    pub next: Option<NextPrayer>,
    /// Segundos hasta el próximo evento, aunque corresponda al día siguiente.
    pub countdown_secs: Option<i64>,
    /// Rezos de hoy marcados como rezados (copia del registro.jsonl del día)
    pub marked: Vec<String>,
    /// Salida y puesta del sol en horas decimales locales (recorrido del sol en Hoy).
    /// `None` si no se pueden calcular (latitudes extremas).
    pub sunrise: Option<f64>,
    pub sunset: Option<f64>,
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
        #[cfg(desktop)]
        let mut schedule = schedule;
        let now = chrono::Local::now();
        let now_h = now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0;
        #[cfg(desktop)]
        let fired = align_after_recompute(&mut schedule, now_h);
        #[cfg(mobile)]
        let fired = first_future_prayer(&schedule, now_h);
        Self { schedule, fired }
    }
}

/// Al arrancar o realinear el scheduler, nunca reproducir un rezo cuyo horario
/// ya pasó. La ventana de 60 s solo aplica a un scheduler que estaba vivo cuando
/// llegó el horario; no a un reinicio, resume o cambio de configuración.
fn first_future_prayer(schedule: &Schedule, now_h: f64) -> usize {
    schedule
        .prayers
        .iter()
        .position(|p| p.dec > now_h)
        .unwrap_or(PRAYERS.len())
}

/// Alinea el índice después de boot/resume/config. Los horarios anteriores se
/// registran como perdidos si no hay ya un evento para ese rezo; no se disparan
/// tarde aunque hayan pasado menos de ADHAN_SECS.
#[cfg(desktop)]
fn align_after_recompute(schedule: &mut Schedule, now_h: f64) -> usize {
    let fired = first_future_prayer(schedule, now_h);
    for slot in schedule.prayers.iter().take(fired) {
        if crate::registro::last_status_for(&schedule.date, &slot.name).is_none() {
            if let Err(e) = crate::registro::append(&schedule.date, &slot.name, "perdido") {
                crate::log!("no se pudo registrar {} como perdido: {e}", slot.name);
            }
        }
    }
    fired
}

/// Convierte un horario civil en un evento fechado. La zona resuelve el offset
/// para el día del evento, que puede diferir del actual por DST.
fn future_prayer<Tz: TimeZone>(
    date: NaiveDate,
    prayers: &[PrayerSlot],
    now: &DateTime<Tz>,
) -> Option<NextPrayer> {
    prayers
        .iter()
        .filter_map(|slot| {
            if !slot.dec.is_finite() || !(0.0..24.0).contains(&slot.dec) {
                return None;
            }
            let civil = date
                .and_hms_opt(0, 0, 0)?
                .checked_add_signed(chrono::Duration::seconds((slot.dec * 3600.0) as i64))?;
            let at = now.timezone().from_local_datetime(&civil).earliest()?;
            (at.timestamp() > now.timestamp()).then(|| NextPrayer {
                name: slot.name.clone(),
                date: date.to_string(),
                hhmm: slot.hhmm.clone(),
                timestamp: at.timestamp(),
            })
        })
        .min_by_key(|event| event.timestamp)
}

/// Después del último horario se calcula mañana una vez; se reutiliza el evento
/// hasta medianoche. Boot, resume y cambios de config/TZ crean un schedule nuevo.
fn refresh_next(
    schedule: &mut Schedule,
    cfg: &crate::config::Config,
    now: &DateTime<chrono::Local>,
) -> bool {
    let today = now.date_naive();
    let previous = schedule.next.clone();
    let next = future_prayer(today, &schedule.prayers, now).or_else(|| {
        let tomorrow = today.succ_opt()?;
        if let Some(cached) = &schedule.next {
            if cached.date == tomorrow.to_string() && cached.timestamp > now.timestamp() {
                return Some(cached.clone());
            }
        }
        let prayers = prayer_slots_for(
            tomorrow.year(),
            tomorrow.month() as i32,
            tomorrow.day() as i32,
            cfg,
        );
        future_prayer(tomorrow, &prayers, now)
    });
    schedule.countdown_secs = next.as_ref().map(|event| event.timestamp - now.timestamp());
    schedule.next = next;
    previous != schedule.next
}

/// Snapshot seguro del config (panics en poison nunca deben pisar el tray)
#[cfg(desktop)]
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
    Pray { date: String, prayer: String, reply: Option<std::sync::mpsc::Sender<Result<(), String>>> },
}

/// Rezos (los 5) calculados para una fecha concreta con el config dado.
/// Reutilizado por el schedule del día (hoy) y por `get_schedule_for` (pasado).
/// Los siete tiempos de PrayTimes C: Fajr, salida del sol, Dhuhr, Asr, puesta, Maghrib, Isha.
fn day_times(y: i32, m: i32, d: i32, cfg: &crate::config::Config) -> [f64; 7] {
    let pcfg = crate::prayer::PrayerConfig::from(cfg);
    crate::prayer::calc_times(
        y, m, d,
        cfg.lat, cfg.lon, crate::config::Config::tz_offset_hours_for_date(y, m, d),
        &pcfg,
    )
}

pub fn prayer_slots_for(y: i32, m: i32, d: i32, cfg: &crate::config::Config) -> Vec<PrayerSlot> {
    slots_from(&day_times(y, m, d, cfg))
}

fn slots_from(times7: &[f64; 7]) -> Vec<PrayerSlot> {
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
    let date = now.format("%Y-%m-%d").to_string();
    let marked = PRAYERS
        .iter()
        .filter(|n| crate::registro::is_prayer_marked(&date, n))
        .cloned()
        .map(String::from)
        .collect();
    let mut schedule = schedule_at(cfg_snapshot, &now);
    schedule.marked = marked;
    schedule
}

/// Un rezo de hoy se puede marcar desde su horario, no antes. Los días anteriores
/// y desmarcar no se limitan. Si el horario no se puede calcular, o si Isha cae
/// pasada la medianoche, no se bloquea.
pub fn check_mark_time(date: &str, prayer: &str, cfg: &crate::config::Config) -> Result<(), String> {
    let now = chrono::Local::now();
    if date != now.date_naive().to_string() {
        return Ok(());
    }
    let slots = prayer_slots_for(now.year(), now.month() as i32, now.day() as i32, cfg);
    let Some(slot) = slots.iter().find(|s| s.name == prayer) else { return Ok(()) };
    let dhuhr = slots.iter().find(|s| s.name == "Dhuhr").map_or(12.0, |s| s.dec);
    if !slot.dec.is_finite() || (prayer != "Fajr" && slot.dec < dhuhr) {
        return Ok(());
    }
    let now_h = now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0;
    if now_h < slot.dec {
        return Err(format!("Todavía no es la hora de {prayer} ({}).", slot.hhmm));
    }
    Ok(())
}

/// Actualiza el próximo evento desde los horarios cacheados mientras la app
/// móvil está abierta. Una realineación vuelve a calcular la fecha completa.
#[cfg(mobile)]
pub fn refresh_mobile_schedule(schedule: &mut Schedule, cfg: &crate::config::Config) {
    refresh_next(schedule, cfg, &chrono::Local::now());
}

/// Construye el día sin consultar ni modificar el registro (también para tests).
fn schedule_at(cfg: &crate::config::Config, now: &DateTime<chrono::Local>) -> Schedule {
    let times7 = day_times(now.year(), now.month() as i32, now.day() as i32, cfg);
    let mut schedule = Schedule {
        date: now.date_naive().to_string(),
        prayers: slots_from(&times7),
        next: None,
        countdown_secs: None,
        marked: Vec::new(),
        sunrise: Some(times7[1]).filter(|h| h.is_finite()),
        sunset: Some(times7[4]).filter(|h| h.is_finite()),
    };
    refresh_next(&mut schedule, cfg, now);
    schedule
}

/// Círculo RGBA por estado — movido de lib.rs para que scheduler y tray
/// usen el mismo source mientras no existan assets reales.
/// Macro `log!` exportada desde lib.rs; acá se usa como `crate::log!`.
#[cfg(target_os = "linux")]
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

#[cfg(not(target_os = "linux"))]
pub fn spawn_login1_watcher(_tx: mpsc::Sender<Trigger>) {
    // Windows/macOS no exponen login1. El loop del scheduler recalcula en cada tick.
}

#[cfg(target_os = "linux")]
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

/// Notificación del sistema desde el core con texto arbitrario (updater)
pub fn notify_standard(app: &tauri::AppHandle, title: &str, body: &str) {
    notify(app, title, body);
}

/// Notificación de prueba del canal (validación dev)
pub fn notify_test(app: &tauri::AppHandle) {
    notify(app, "Adhan Companion", "Notificación de prueba — así te avisamos el preaviso y el adhan");
}

fn notify(app: &tauri::AppHandle, title: &str, body: &str) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
    crate::log!("notificación: {title} — {body}");
}

#[cfg(desktop)]
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
#[cfg(desktop)]
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
#[cfg(desktop)]
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

#[cfg(desktop)]
fn publish_schedule(s: &SchedulerLoop, schedule: &Schedule) {
    s.state.lock().unwrap().schedule = schedule.clone();
    let _ = s.app.emit("schedule_changed", schedule);
}

#[cfg(desktop)]
fn countdown_label(schedule: &Schedule) -> String {
    let (Some(next), Some(secs)) = (&schedule.next, schedule.countdown_secs) else {
        return "Próximo rezo no disponible".into();
    };
    let day = if next.date == schedule.date {
        ""
    } else {
        "mañana "
    };
    format!(
        "{} — {day}{} — en {:02}:{:02}:{:02}",
        next.name.to_uppercase(),
        next.hhmm,
        secs / 3600,
        (secs % 3600) / 60,
        secs % 60
    )
}

#[cfg(desktop)]
fn refresh_tray(s: &SchedulerLoop, schedule: &Schedule, playing: Option<&str>) {
    let mut label = countdown_label(schedule);
    let state = if let Some(name) = playing {
        label = format!("— REZO — {name} · {label}");
        IconoEstado::Adhan
    } else if schedule.countdown_secs.is_some_and(|secs| secs <= 15 * 60) {
        IconoEstado::Proximo
    } else {
        IconoEstado::Dia
    };
    let cd = s.countdown_item.clone();
    let tray = s.tray.clone();
    let _ = s.app.run_on_main_thread(move || {
        let _ = cd.set_text(label);
        let _ = tray.set_icon(Some(icon_de(state)));
    });
}

#[cfg(desktop)]
pub fn run(s: SchedulerLoop) {
    let mut cfg = snapshot(&s.config);
    let mut schedule = compute_schedule(&cfg);
    let now = chrono::Local::now();
    let mut last_local_offset = now.offset().local_minus_utc();
    let mut fired = align_after_recompute(
        &mut schedule,
        now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0,
    );
    let mut date = schedule.date.clone();
    // Edge del disparo: suena una sola vez por rezo al entrar en zona verde
    let mut adhan_announced = false;
    // Edge del preaviso: una sola vez por rezo cuando entra en ventada notice
    let mut notice_announced = false;
    refresh_prayer_items(&s, &schedule);
    publish_schedule(&s, &schedule);
    refresh_tray(&s, &schedule, None);

    loop {
        // Tick de 1 s, pero un trigger lo despierta al instante: marcar un rezo
        // espera esta respuesta y no debe tardar hasta un segundo.
        let first = match s.rx.recv_timeout(Duration::from_secs(1)) {
            Ok(t) => Some(t),
            Err(mpsc::RecvTimeoutError::Timeout) => None,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                std::thread::sleep(Duration::from_secs(1));
                None
            }
        };

        // Trigger: resume del sleep / cambio de config (IPC set_config) / marcar rezado
        let mut recal: Option<&str> = None;
        let mut prayers = Vec::new();
        for t in first.into_iter().chain(std::iter::from_fn(|| s.rx.try_recv().ok())) {
            match t {
                Trigger::Resume => {
                    crate::log!("trigger: resume del sleep → recalcular + realinear timers");
                    recal = Some("resume");
                }
                Trigger::ConfigChanged => {
                    crate::log!("trigger: cambio de config → recalcular con el config nuevo");
                    recal = Some("config");
                }
                Trigger::Pray { date, prayer, reply } => prayers.push((date, prayer, reply)),
            }
        }
        if let Some(via) = recal {
            crate::log!("recalculando vía {via}");
            cfg = snapshot(&s.config);
            schedule = compute_schedule(&cfg);
            let now = chrono::Local::now();
            fired = align_after_recompute(
                &mut schedule,
                now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0,
            );
            adhan_announced = false;
            notice_announced = false;
            date = schedule.date.clone();
            refresh_prayer_items(&s, &schedule);
            publish_schedule(&s, &schedule);
        }
        for (date_arg, name, reply) in prayers {
            if PRAYERS.contains(&name.as_str()) {
                let date = if date_arg.is_empty() { schedule.date.clone() } else { date_arg };
                let already = crate::registro::is_prayer_marked(&date, &name);
                if !already {
                    if let Err(error) = check_mark_time(&date, &name, &cfg) {
                        if let Some(reply) = reply { let _ = reply.send(Err(error)); }
                        continue;
                    }
                }
                let status = if already { "desmarcado" } else { "rezado" };
                let result = crate::registro::append(&date, &name, status);
                crate::log!(
                    "{}: {} ({})",
                    if already { "desmarcado" } else { "marcado rezado" },
                    name,
                    result.is_ok()
                );
                if let Err(error) = result {
                    if let Some(reply) = reply { let _ = reply.send(Err(error)); }
                    continue;
                }
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
                }
                publish_schedule(&s, &schedule);
                if let Some(reply) = reply { let _ = reply.send(Ok(())); }
            } else if let Some(reply) = reply { let _ = reply.send(Err("Rezo desconocido.".into())); }
        }

        // Trigger: medianoche (cambió la fecha local)
        let now = chrono::Local::now();
        let local_offset = now.offset().local_minus_utc();
        if local_offset != last_local_offset {
            crate::log!("trigger: cambió el offset local/DST → recalcular horarios");
            cfg = snapshot(&s.config);
            schedule = compute_schedule(&cfg);
            fired = align_after_recompute(
                &mut schedule,
                now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0,
            );
            adhan_announced = false;
            notice_announced = false;
            date = schedule.date.clone();
            last_local_offset = local_offset;
            refresh_prayer_items(&s, &schedule);
            publish_schedule(&s, &schedule);
        }
        let today = now.format("%Y-%m-%d").to_string();
        if today != date {
            crate::log!("trigger: medianoche → recalcular el día");
            cfg = snapshot(&s.config);
            schedule = compute_schedule(&cfg);
            fired = align_after_recompute(
                &mut schedule,
                now.hour() as f64 + now.minute() as f64 / 60.0 + now.second() as f64 / 3600.0,
            );
            adhan_announced = false;
            notice_announced = false;
            date = today;
            refresh_prayer_items(&s, &schedule);
            publish_schedule(&s, &schedule);
        }

        // La información del próximo evento no depende del cursor del audio:
        // Isha puede seguir sonando mientras ya se muestra el Fajr de mañana.
        let changed = refresh_next(&mut schedule, &cfg, &now);
        {
            let mut state = s.state.lock().unwrap();
            state.schedule = schedule.clone();
            state.fired = fired;
        }
        if changed {
            let _ = s.app.emit("schedule_changed", &schedule);
        }

        // Countdown del próximo rezo aún no disparado
        if fired >= PRAYERS.len() {
            refresh_tray(&s, &schedule, None);
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
            if crate::registro::last_status_for(&schedule.date, PRAYERS[fired]).is_none() {
                if let Err(e) = crate::registro::append(&schedule.date, PRAYERS[fired], "perdido") {
                    crate::log!("no se pudo registrar {} como perdido: {e}", PRAYERS[fired]);
                }
            }
            fired += 1;
            adhan_announced = false;
            notice_announced = false;
            publish_schedule(&s, &schedule);
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
                "Hora de orar",
                format!(
                    "{} ({}) — tocá el menú del tray para confirmar (ya recé) o Silenciar para detener",
                    PRAYERS[fired], schedule.prayers[fired].hhmm
                ).as_str(),
            );
            let cfg = snapshot(&s.config);
            if let Err(e) = crate::audio::play_alert(&cfg.audio, &PRAYERS[fired].to_lowercase()) {
                crate::log!("audio falló en el disparo: {e}");
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

        refresh_tray(&s, &schedule, (secs < 0).then_some(PRAYERS[fired]));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, Local};

    fn local(date: &str, h: u32, m: u32, s: u32) -> DateTime<Local> {
        let day = NaiveDate::parse_from_str(date, "%Y-%m-%d").unwrap();
        Local
            .from_local_datetime(&day.and_hms_opt(h, m, s).unwrap())
            .earliest()
            .unwrap()
    }

    fn fixture(date: &str) -> Schedule {
        Schedule {
            date: date.into(),
            prayers: PRAYERS
                .iter()
                .zip([5.0, 12.0, 15.0, 18.0, 20.0])
                .map(|(name, dec)| PrayerSlot {
                    name: (*name).into(),
                    dec,
                    hhmm: format!("{:02}:00", dec as u32),
                    enabled: true,
                })
                .collect(),
            next: None,
            countdown_secs: None,
            marked: vec!["Isha".into()],
            sunrise: Some(6.5),
            sunset: Some(18.0),
        }
    }

    #[test]
    fn after_isha_uses_tomorrows_calculation_and_preserves_today() {
        let cfg = crate::config::Config::default();
        let now = local("2026-10-17", 23, 0, 0);
        let mut schedule = fixture("2026-10-17");
        assert!(refresh_next(&mut schedule, &cfg, &now));
        let expected = future_prayer(
            NaiveDate::from_ymd_opt(2026, 10, 18).unwrap(),
            &prayer_slots_for(2026, 10, 18, &cfg),
            &now,
        )
        .unwrap();
        let next = schedule.next.as_ref().unwrap();
        assert_eq!(next, &expected);
        assert_eq!(next.name, "Fajr");
        assert_eq!(next.date, "2026-10-18");
        assert_eq!(
            schedule.countdown_secs,
            Some(next.timestamp - now.timestamp())
        );
        assert_eq!(schedule.date, "2026-10-17");
        assert_eq!(schedule.prayers[0].hhmm, "05:00");
        assert_eq!(schedule.marked, vec!["Isha"]);
        assert!(countdown_label(&schedule).contains("mañana"));
        // El cursor de audio sigue agotado: mostrar mañana no adelanta disparos.
        assert_eq!(first_future_prayer(&schedule, 23.0), PRAYERS.len());
    }

    #[test]
    fn before_isha_still_shows_today_then_advances_at_its_time() {
        let cfg = crate::config::Config::default();
        let mut schedule = fixture("2026-10-17");
        refresh_next(&mut schedule, &cfg, &local("2026-10-17", 19, 59, 59));
        assert_eq!(schedule.next.as_ref().unwrap().name, "Isha");
        assert_eq!(schedule.next.as_ref().unwrap().date, schedule.date);
        assert_eq!(schedule.countdown_secs, Some(1));
        assert!(!countdown_label(&schedule).contains("mañana"));
        refresh_next(&mut schedule, &cfg, &local("2026-10-17", 20, 0, 0));
        assert_eq!(schedule.next.as_ref().unwrap().name, "Fajr");
        assert_eq!(schedule.next.as_ref().unwrap().date, "2026-10-18");
    }

    #[test]
    fn night_countdown_decreases_without_replacing_the_next_event() {
        let cfg = crate::config::Config::default();
        let mut schedule = fixture("2026-10-17");
        refresh_next(&mut schedule, &cfg, &local("2026-10-17", 23, 0, 0));
        let next = schedule.next.clone();
        let remaining = schedule.countdown_secs.unwrap();
        assert!(!refresh_next(
            &mut schedule,
            &cfg,
            &local("2026-10-17", 23, 0, 1)
        ));
        assert_eq!(schedule.next, next);
        assert_eq!(schedule.countdown_secs, Some(remaining - 1));
    }

    #[test]
    fn midnight_keeps_the_same_fajr_instant_and_loads_the_new_day() {
        let cfg = crate::config::Config::default();
        let before = schedule_at(&cfg, &local("2026-10-17", 23, 59, 59));
        let after = schedule_at(&cfg, &local("2026-10-18", 0, 0, 0));
        assert_eq!(before.next, after.next);
        assert_eq!(after.date, "2026-10-18");
        assert_eq!(after.next.as_ref().unwrap().date, after.date);
        assert_eq!(
            before.countdown_secs.unwrap() - 1,
            after.countdown_secs.unwrap()
        );
        assert_eq!(after.prayers[0].hhmm, after.next.as_ref().unwrap().hhmm);
        assert!(!countdown_label(&after).contains("mañana"));
    }

    #[test]
    fn next_date_rolls_over_month_leap_day_and_year() {
        let cfg = crate::config::Config::default();
        for (today, tomorrow) in [
            ("2026-10-31", "2026-11-01"),
            ("2028-02-28", "2028-02-29"),
            ("2026-12-31", "2027-01-01"),
        ] {
            let mut schedule = fixture(today);
            refresh_next(&mut schedule, &cfg, &local(today, 23, 59, 59));
            assert_eq!(schedule.next.as_ref().unwrap().date, tomorrow);
        }
    }

    #[test]
    fn resume_after_fajr_selects_the_next_future_prayer() {
        let cfg = crate::config::Config::default();
        let mut schedule = fixture("2026-10-18");
        refresh_next(&mut schedule, &cfg, &local("2026-10-18", 6, 0, 0));
        assert_eq!(schedule.next.as_ref().unwrap().name, "Dhuhr");
        assert_eq!(schedule.next.as_ref().unwrap().date, "2026-10-18");
        assert_eq!(first_future_prayer(&schedule, 6.0), 1);
        assert_eq!(schedule.countdown_secs, Some(6 * 3600));
    }

    #[test]
    fn realignment_at_night_recalculates_tomorrow_with_changed_offsets() {
        let mut cfg = crate::config::Config::default();
        let now = local("2026-10-17", 23, 59, 59);
        let original = schedule_at(&cfg, &now);
        cfg.offsets.fajr = 7;
        let recalculated = schedule_at(&cfg, &now);
        assert_eq!(original.next.as_ref().unwrap().date, "2026-10-18");
        assert_eq!(
            recalculated.next.as_ref().unwrap().timestamp
                - original.next.as_ref().unwrap().timestamp,
            7 * 60
        );
    }

    #[test]
    fn countdown_uses_absolute_instants_across_an_offset_change() {
        let before = FixedOffset::west_opt(3 * 3600)
            .unwrap()
            .with_ymd_and_hms(2026, 10, 17, 23, 0, 0)
            .unwrap();
        let after_zone = FixedOffset::west_opt(2 * 3600).unwrap();
        let same_instant = before.with_timezone(&after_zone);
        let schedule = fixture("2026-10-18");
        let next = future_prayer(
            NaiveDate::from_ymd_opt(2026, 10, 18).unwrap(),
            &schedule.prayers,
            &same_instant,
        )
        .unwrap();
        assert_eq!(next.name, "Fajr");
        assert_eq!(next.timestamp - before.timestamp(), 5 * 3600);
    }
}
