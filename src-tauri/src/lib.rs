// Entry point de la app: `run()` es el factory real del core (main.rs solo delega).

pub mod scheduler;

use std::sync::mpsc;

use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    Manager, WindowEvent,
};

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
        .invoke_handler(tauri::generate_handler![greet, get_schedule])
        // Tray-first: cerrar la ventana NO mata la app — el core sigue de fondo
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                log!("close interceptado: la ventana se esconde, el core sigue");
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            // Menú según el spec: countdown arriba (info, no acción), luego acciones
            let countdown = MenuItem::with_id(
                app,
                "countdown",
                "Fajr — en 00:00:00",
                false, // no clickable: es info, no acción
                None::<&str>,
            )?;
            let config = MenuItem::with_id(app, "config", "Configuración…", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;

            let menu = MenuBuilder::new(app)
                .item(&countdown)
                .separator()
                .item(&config)
                .separator()
                .item(&salir)
                .build()?;

            let tray = TrayIconBuilder::with_id("tray")
                .icon(scheduler::icon_for(32, scheduler::AZUL))
                .menu(&menu)
                .tooltip("Adhan Companion")
                .on_menu_event(|app, ev| match ev.id().as_ref() {
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

            // Estado compartido scheduler ↔ IPC
            let state: scheduler::SharedState =
                std::sync::Arc::new(std::sync::Mutex::new(scheduler::SharedStateInner::new()));
            app.manage(state.clone());

            // scheduler (tick 1 s) + watcher del login1 (trigger resume del sleep)
            let (tx, rx) = mpsc::channel::<scheduler::Trigger>();
            scheduler::spawn_login1_watcher(tx);
            let app2 = app.handle().clone();
            std::thread::spawn(move || {
                scheduler::run(scheduler::SchedulerLoop {
                    app: app2,
                    tray,
                    countdown_item: countdown,
                    rx,
                    state,
                });
            });

            log!("setup ok: tray + scheduler con triggers (medianoche/resume) corriendo");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
