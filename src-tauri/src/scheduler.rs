//! Spike 2 — el motor de fondo 24/7 (la "clave de fondo" del spec).
//!
//! - `Schedule` / `PrayerSlot`: los tipos del contrato IPC (embrión de `get_schedule`)
//! - `run_scheduler_loop`: tick por segundo con los triggers del spec:
//!   • medianoche (cambio de fecha local) → recalcular
//!   • resume del sleep (`PrepareForSleep` de login1 vía zbus) → recalcular + realinear
//!   • disparo del adhan (mock) → estado verde 60 s, luego avanza y marca lo salteado
//! - `icon_for`: el círculo RGBA por estado (gris/azul/ámbar/verde del spec)
//!
//! Los horarios son MOCK (now + offsets fijos, elegidos para ver las
//! transiciones en los primeros minutos). El cálculo real entra con el FFI a
//! praytimes.c (Spike 4) — los tipos y el motor son los definitivos.

use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use chrono::Timelike;
use serde::Serialize;
use tauri::Emitter;

/// Los 5 rezos del schema del spec (sin sunrise/sunset, índices 0..4)
pub const PRAYERS: [&str; 5] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

/// Mock: minutos en el futuro al arrancar, elegidos para la demo de transiciones:
/// +2/14 min los primeros disparos, de ahí en adelante estados visibles.
const MOCK_OFFSETS_MIN: [f64; 5] = [2.0, 14.0, 22.0, 40.0, 60.0];

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
}

/// Estado compartido con el mundo IPC (`get_schedule` / `schedule_changed`)
pub type SharedState = Arc<Mutex<SharedStateInner>>;

pub struct SharedStateInner {
    pub schedule: Schedule,
    /// Índice del próximo rezo por disparar (posición dentro de `prayers`)
    pub fired: usize,
}

impl SharedStateInner {
    pub fn new() -> Self {
        let schedule = compute_schedule();
        Self { schedule, fired: 0 }
    }
}

/// Triggers del spec que llegan al loop externo al tick
pub enum Trigger {
    /// login1 reporta el wake (starting=false de PrepareForSleep) → recalcular
    Resume,
}

/// Horarios MOCK: cada rezo a `now + offset`. Tipos y formato definitivos;
/// con el FFI esto se reemplaza por `pt_get_times(...)` y el tz del config.
pub fn compute_schedule() -> Schedule {
    let now = chrono::Local::now();
    let base = now.hour() as f64 + now.minute() as f64 / 60.0;
    let prayers = PRAYERS
        .iter()
        .zip(MOCK_OFFSETS_MIN)
        .map(|(name, off_min)| {
            let dec = base + off_min / 60.0;
            let h = (dec.trunc() as i32) % 24;
            let m = (dec.fract() * 60.0).round() as i32;
            PrayerSlot {
                name: (*name).to_string(),
                dec,
                hhmm: format!("{h:02}:{m:02}"),
                enabled: true,
            }
        })
        .collect();
    Schedule {
        date: now.format("%Y-%m-%d").to_string(),
        prayers,
        next: Some(PRAYERS[0].into()),
        countdown_secs: Some((MOCK_OFFSETS_MIN[0] * 60.0) as i64),
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
pub fn icon_for(size: u32, (r, g, b): (u8, u8, u8)) -> tauri::image::Image<'static> {
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    let c = size as f32 / 2.0;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - c;
            let dy = y as f32 + 0.5 - c;
            let d = (dx * dx + dy * dy).sqrt();
            let i = ((y * size + x) as usize) * 4;
            if d >= c {
                continue;
            }
            let a = if d < c - 1.0 { 255u8 } else { ((c - d) * 255.0) as u8 };
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = a;
        }
    }
    tauri::image::Image::new_owned(rgba, size, size)
}

/// Estados del spec (gris queda para "silenciado", no sale en este spike)
pub const AZUL: (u8, u8, u8) = (0x21, 0x96, 0xf3);
const AMBAR: (u8, u8, u8) = (0xff, 0x98, 0x00);
const VERDE: (u8, u8, u8) = (0x4c, 0xaf, 0x50);

pub struct SchedulerLoop {
    pub app: tauri::AppHandle,
    pub tray: tauri::tray::TrayIcon<tauri::Wry>,
    pub countdown_item: tauri::menu::MenuItem<tauri::Wry>,
    pub rx: mpsc::Receiver<Trigger>,
    pub state: SharedState,
}

pub fn run(s: SchedulerLoop) {
    let mut schedule = compute_schedule();
    let mut fired: usize = 0;
    let mut date = schedule.date.clone();

    loop {
        std::thread::sleep(Duration::from_secs(1));

        // Trigger: resume del sleep
        let mut recal = false;
        while let Ok(t) = s.rx.try_recv() {
            match t {
                Trigger::Resume => {
                    crate::log!("trigger: resume del sleep → recalcular + realinear timers");
                    recal = true;
                }
            }
        }
        if recal {
            schedule = compute_schedule();
            fired = 0;
            date = schedule.date.clone();
            let _ = s.app.emit("schedule_changed", &schedule);
        }

        // Trigger: medianoche (cambió la fecha local)
        let now = chrono::Local::now();
        let today = now.format("%Y-%m-%d").to_string();
        if today != date {
            crate::log!("trigger: medianoche → recalcular el día");
            schedule = compute_schedule();
            fired = 0;
            date = today;
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
            crate::log!("adhan de {} terminó (verde {} s) / o sin ventana vivida → marca en el registro y avanza", PRAYERS[fired], ADHAN_SECS);
            fired += 1;
            let _ = s.app.emit("schedule_changed", &schedule);
            continue;
        }

        // Estados del spec: azul (>15m) → ámbar (≤15m) → verde (adhan sonando ADHAN_SECS)
        let color = if secs < 0 {
            VERDE
        } else if secs <= 15 * 60 {
            AMBAR
        } else {
            AZUL
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
            let _ = tr.set_icon(Some(icon_for(32, color)));
        });

        let mut st = s.state.lock().unwrap();
        st.schedule.next = Some(schedule.prayers[fired].name.clone());
        st.schedule.countdown_secs = Some(secs.max(0));
    }
}
