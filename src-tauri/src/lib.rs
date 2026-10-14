// Entry point de la app: `run()` es el factory real del core (main.rs solo delega).

pub mod audio;
pub mod config;
pub mod prayer;
pub mod registro;
pub mod scheduler;

use std::sync::mpsc;

use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

use config::SharedConfig;

/// Logs con prefijo para depurar el tray/AppIndicator fácilmente (solo debug)
#[cfg(debug_assertions)]
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => { println!("[adhan] {}", format_args!($($arg)*)) };
}
#[cfg(not(debug_assertions))]
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {};
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Contrato IPC del spec: el frontend pide el schedule actual.
// Error → String: MVP plano y depurable (se endurece cuando haya errores de dominio)
#[tauri::command]
fn get_schedule(state: tauri::State<scheduler::SharedState>) -> Result<scheduler::Schedule, String> {
    let st = state.lock().map_err(|e| format!("estado envenenado: {e}"))?;
    Ok(st.schedule.clone())
}

// Contrato IPC del spec: test de audio — el futuro botón "Probar" de la tab Audio
#[tauri::command]
fn test_adhan() -> Result<(), String> {
    log!("test_adhan (IPC): reproduce el beep del spike");
    audio::play_mock_adhan(audio::MOCK_VOLUME)
}

// Contrato IPC del spec: marcar rezado — index 0..4 sobre los 5 del schedule
#[tauri::command]
fn mark_prayed(
    idx: usize,
    sched_tx: tauri::State<mpsc::Sender<scheduler::Trigger>>,
) -> Result<String, String> {
    if idx >= scheduler::PRAYERS.len() {
        return Err(format!("rezo idx {idx} fuera de rango"));
    }
    sched_tx
        .send(scheduler::Trigger::Pray(idx))
        .map_err(|e| format!("scheduler no disponible: {e}"))?;
    Ok(scheduler::PRAYERS[idx].to_string())
}

// Contracts IPC de config (Spike de config): leer y guardar hot-reload
#[tauri::command]
fn get_config(state: tauri::State<SharedConfig>) -> Result<config::Config, String> {
    state.read().map(|c| c.clone()).map_err(|e| format!("config envenenado: {e}"))
}

#[tauri::command]
fn set_config(
    cfg: config::Config,
    state: tauri::State<SharedConfig>,
    sched_tx: tauri::State<mpsc::Sender<scheduler::Trigger>>,
) -> Result<config::Config, String> {
    log!("set_config: guardar + recalcular en caliente");
    config::save(&cfg)?;
    *state.write().map_err(|e| format!("config envenenado: {e}"))? = cfg.clone();
    let _ = sched_tx.send(scheduler::Trigger::ConfigChanged);
    Ok(cfg)
}

// Toggle real de autostart del plugin (checkbox de la tab Avanzado)
#[tauri::command]
fn set_autostart(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| format!("autostart enable: {e}"))
    } else {
        autostart.disable().map_err(|e| format!("autostart disable: {e}"))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Una segunda instancia enfoca a la viva, nunca duplica el tray
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log!("segunda instancia detectada; enfocando la viva");
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // Autostart declarado (el enable() del usuario llega con la config real)
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            greet, get_schedule, test_adhan, get_config, set_config, set_autostart, mark_prayed
        ])
        // Tray-first: cerrar la ventana NO mata la app — el core sigue de fondo
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                log!("close interceptado: la ventana se esconde, el core sigue");
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            // Menú según el spec: countdown arriba, los 5 horarios (clic = marcar rezado),
            // test de audio, configuración y salir
            let countdown = MenuItem::with_id(
                app,
                "countdown",
                "Fajr — en 00:00:00",
                false, // no clickable: es info, no acción
                None::<&str>,
            )?;
            let mut prayer_items = Vec::new();
            for (idx, name) in scheduler::PRAYERS.iter().enumerate() {
                let mi = MenuItem::with_id(
                    app,
                    &format!("pray:{idx}"),
                    format!("{name}"),
                    true, // clic → marca rezado (el texto lo refresca el scheduler con hhmm/✓)
                    None::<&str>,
                )?;
                prayer_items.push(((*name).to_string(), mi));
            }
            let test_adhan =
                MenuItem::with_id(app, "test_adhan", "Reproducir adhan ahora (test)", true, None::<&str>)?;
            let config = MenuItem::with_id(app, "config", "Configuración…", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;

            let mut menu = MenuBuilder::new(app)
                .item(&countdown)
                .separator();
            for (_, mi) in &prayer_items {
                menu = menu.item(mi);
            }
            let menu = menu
                .separator()
                .item(&test_adhan)
                .item(&config)
                .separator()
                .item(&salir)
                .build()?;

            // canal de triggers del scheduler: existe ANTES del tray para que
            // el handler del menú pueda mandar Pray
            let (tx, rx) = mpsc::channel::<scheduler::Trigger>();
            let pray_tx = tx.clone();
            app.manage(tx.clone());

            let tray = TrayIconBuilder::with_id("tray")
                .icon(scheduler::icon_for(32, scheduler::AZUL))
                .menu(&menu)
                .tooltip("Adhan Companion")
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "test_adhan" => {
                        match crate::audio::play_mock_adhan(crate::audio::MOCK_VOLUME) {
                            Ok(()) => log!("adhan (test) desde el menú: audio por ALSA ok"),
                            Err(e) => log!("audio falló: {e}"),
                        }
                    }
                    "config" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "exit" => {
                        log!("salir desde el tray");
                        app.exit(0);
                    }
                    id if id.starts_with("pray:") => {
                        // marcar rezado — el scheduler lo procesa y registra
                        if let Ok(idx) = id["pray:".len()..].parse::<usize>() {
                            // el closure es move: usa el pray_tx poseído
                            if let Err(e) = pray_tx.send(scheduler::Trigger::Pray(idx)) {
                                log!("marcado no entrego al scheduler: {e}");
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, ev| {
                    // GNOME/AppIndicator unifica el clic: abrirá el menú igual;
                    // registramos que el evento llega para depurar
                    if matches!(ev, tauri::tray::TrayIconEvent::Click { .. }) {
                        log!("clic sobre el icono del tray");
                    }
                })
                .build(app)?;

            // Estado compartido scheduler ↔ IPC + config persistente
            let cfg = config::load_or_init();
            let config_state: SharedConfig = std::sync::Arc::new(std::sync::RwLock::new(cfg.clone()));
            app.manage(config_state.clone());

            let state: scheduler::SharedState =
                std::sync::Arc::new(std::sync::Mutex::new(
                    scheduler::SharedStateInner::new(&cfg),
                ));
            app.manage(state.clone());

            // scheduler (tick 1 s) + watcher del login1 (trigger resume del sleep)
            scheduler::spawn_login1_watcher(tx);
            let app2 = app.handle().clone();
            std::thread::spawn(move || {
                scheduler::run(scheduler::SchedulerLoop {
                    app: app2,
                    tray,
                    countdown_item: countdown,
                    prayer_items,
                    rx,
                    state,
                    config: config_state,
                });
            });

            log!("setup ok: tray + scheduler + config ({}) corriendo", config::config_path().display());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
