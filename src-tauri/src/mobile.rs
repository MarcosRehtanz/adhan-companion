//! Android: consulta/registro locales; alarmas y audio delegados al puente nativo.
use crate::{config, registro, scheduler};
use chrono::{Datelike, Timelike};
use std::sync::{Arc, Mutex, RwLock, mpsc};
use std::time::Duration;
use tauri::{Emitter, Manager};

// La respuesta IPC confirma la escritura real. Dos toques concurrentes se
// serializan para conservar la semántica de toggle del registro.
pub fn mark_prayed(date: &str, prayer: &str) -> Result<(), String> {
    static MARK_LOCK: Mutex<()> = Mutex::new(());
    let _guard = MARK_LOCK.lock().map_err(|e| format!("registro: {e}"))?;
    let status = if registro::is_prayer_marked(date, prayer) {
        "desmarcado"
    } else {
        "rezado"
    };
    registro::append(date, prayer, status)
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    config::init_mobile_dir(app.path().app_data_dir()?)?;
    let cfg = config::load_or_init();
    #[cfg(target_os = "android")]
    {
        let initial = cfg.clone();
        std::thread::spawn(move || {
            if let Err(error) = crate::android_alerts::sync(&initial) { crate::log!("alarmas Android: {error}"); }
        });
    }
    let config: config::SharedConfig = Arc::new(RwLock::new(cfg.clone()));
    let state: scheduler::SharedState =
        Arc::new(Mutex::new(scheduler::SharedStateInner::new(&cfg)));
    let (tx, rx) = mpsc::channel::<scheduler::Trigger>();
    app.manage(config.clone());
    app.manage(state.clone());
    app.manage(tx);
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let mut previous = Vec::new();
        let mut clock = String::new();
        // Esta tarea solo actualiza la consulta. AlarmManager mantiene los avisos
        // nativos, incluso sin WebView ni este hilo en ejecución.
        loop {
            let mut changed = false;
            match rx.recv_timeout(Duration::from_secs(1)) {
                Ok(scheduler::Trigger::Pray { date, prayer }) => {
                    let date = if date.is_empty() {
                        chrono::Local::now().format("%Y-%m-%d").to_string()
                    } else {
                        date
                    };
                    if let Err(error) = mark_prayed(&date, &prayer) {
                        crate::log!("registro Android: {error}");
                    }
                    changed = true;
                }
                Ok(_) => changed = true,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                _ => {}
            }
            let cfg = config.read().unwrap_or_else(|e| e.into_inner()).clone();
            let now = chrono::Local::now();
            let key = format!(
                "{}:{}:{}",
                now.num_days_from_ce(),
                now.hour() * 60 + now.minute(),
                now.offset().local_minus_utc()
            );
            let mut schedule = if changed || clock != key {
                clock = key;
                scheduler::compute_schedule(&cfg)
            } else {
                state
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .schedule
                    .clone()
            };
            scheduler::refresh_mobile_schedule(&mut schedule, &cfg);
            state.lock().unwrap_or_else(|e| e.into_inner()).schedule = schedule.clone();
            // El countdown lo dibuja la UI. Emitir solo cambios de contenido
            // evita volver a leer estadísticas e historial cada segundo.
            let content = serde_json::to_vec(&(
                &schedule.date,
                &schedule.prayers,
                &schedule.next,
                &schedule.marked,
            ))
            .unwrap_or_default();
            if content != previous {
                previous = content;
                let _ = handle.emit("schedule_changed", &schedule);
            }
        }
    });
    Ok(())
}
