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

/// Logs con prefijo para depurar el tray/AppIndicator fácilmente (solo debug).
/// Un único macro: en release compila a no-op (conserva el consumo de los
/// argumentos para no generar warnings de variables sin usar).
#[macro_export]
macro_rules! log {
    ($($arg:tt)*) => {{
        #[cfg(debug_assertions)]
        {
            println!("[adhan] {}", format_args!($($arg)*));
        }
        #[cfg(not(debug_assertions))]
        {
            let _ = format_args!($($arg)*);
        }
    }};
}

// Contrato IPC del spec: el frontend pide el schedule actual.
// Error → String: MVP plano y depurable (se endurece cuando haya errores de dominio)
#[tauri::command]
fn get_schedule(state: tauri::State<scheduler::SharedState>) -> Result<scheduler::Schedule, String> {
    let st = state.lock().map_err(|e| format!("estado envenenado: {e}"))?;
    Ok(st.schedule.clone())
}

// Contrato IPC del spec: test de audio — el futuro botón "Probar" de la tab Audio
// Toca el muecín que sonaría en el PRÓXIMO rezo (test del ciclo completo real);
// sin próximo (día pasado) cae al default embebido.
#[tauri::command]
fn test_adhan(
    state: tauri::State<SharedConfig>,
    sched: tauri::State<scheduler::SharedState>,
) -> Result<(), String> {
    log!("test_adhan (IPC): toggle del adhan real");
    let cfg = state.read().map(|c| c.clone()).map_err(|e| format!("config: {e}"))?;
    let muecin = proximo_muecin(&sched, &cfg);
    log!("test con muecín '{}'", muecin.as_deref().unwrap_or("default"));
    let estado = audio::toggle_adhan(cfg.audio.volume as f32 / 100.0, muecin.as_deref())?;
    log!("adhan: {estado}");
    Ok(())
}

/// Nombre del muecín que sonaría en el próximo rezo según `audio.muecinPorRezo`
/// (None o mapping vacío → default embebido).
fn proximo_muecin(
    sched: &tauri::State<scheduler::SharedState>,
    cfg: &config::Config,
) -> Option<String> {
    let st = sched.lock().ok()?;
    let next = st.schedule.next.as_deref()?.to_lowercase();
    cfg.audio.muecinPorRezo.get(&next).cloned()
}

// Catálogo de muecines disponibles: default embebido + disco (usuario y
// resources). Lo consumen los selectores por rezo de la tab Audio.
#[tauri::command]
fn list_muecines() -> Vec<String> {
    audio::list()
}

// Notificación de prueba: valida el canal freedesktop UI-agnostic
#[tauri::command]
fn test_notification(app: tauri::AppHandle) -> Result<(), String> {
    log!("test_notification (IPC)");
    // reuso el helper del scheduler
    scheduler::notify_test(&app);
    Ok(())
}

// Contrato IPC del spec: marcar/desmarcar rezado por fecha (toggle, last-wins)
#[tauri::command]
fn mark_prayed(
    date: String,
    prayer: String,
    sched_tx: tauri::State<mpsc::Sender<scheduler::Trigger>>,
) -> Result<String, String> {
    if !scheduler::PRAYERS.contains(&prayer.as_str()) {
        return Err(format!("rezo desconocido: {prayer}"));
    }
    sched_tx
        .send(scheduler::Trigger::Pray { date, prayer: prayer.clone() })
        .map_err(|e| format!("scheduler no disponible: {e}"))?;
    Ok(prayer)
}

// Estado del mes para el calendario de seguimiento: { date, prayers[] }
#[tauri::command]
fn get_marked(month: String) -> Result<Vec<registro::MarkedDay>, String> {
    Ok(registro::marked_for_month(&month))
}

// Horarios de una fecha (pasado) para el calendario retroactivo
#[tauri::command]
fn get_schedule_for(date: String, state: tauri::State<SharedConfig>) -> Result<Vec<scheduler::PrayerSlot>, String> {
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err(format!("fecha inválida: {date} (esperado YYYY-MM-DD)"));
    }
    let y = parts[0].parse::<i32>().map_err(|_| "año inválido")?;
    let m = parts[1].parse::<i32>().map_err(|_| "mes inválido")?;
    let d = parts[2].parse::<i32>().map_err(|_| "día inválido")?;
    let cfg = state.read().map(|c| c.clone()).map_err(|e| format!("config: {e}"))?;
    Ok(scheduler::prayer_slots_for(y, m, d, &cfg))
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
        // Notificaciones freedesktop: preaviso + disparo del adhan (core-side)
        .plugin(tauri_plugin_notification::init())
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
            get_schedule, test_adhan, test_notification, get_config, set_config, set_autostart, mark_prayed, get_marked, get_schedule_for, list_muecines
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
            // Muecines instalados con el .deb (resources): registro su path
            // una vez para que audio.rs los resuelva. En dev puede no
            // resolverse — la biblioteca queda solo con el default embebido.
            if let Ok(dir) = app.path().resolve("assets/muecin", tauri::path::BaseDirectory::Resource) {
                crate::audio::set_resource_dir(dir);
            }

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
            let silenciar =
                MenuItem::with_id(app, "silence_adhan", "Silenciar adhan", true, None::<&str>)?;
            let test_notif =
                MenuItem::with_id(app, "test_notification", "Notificación de prueba", true, None::<&str>)?;
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
                .item(&silenciar)
                .item(&test_notif)
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
                .icon(scheduler::icon_de(scheduler::IconoEstado::Dia))
                .menu(&menu)
                .tooltip("Adhan Companion")
                .on_menu_event(move |app, ev| match ev.id().as_ref() {
                    "test_adhan" => {
                        // mismo criterio que el IPC: muecín del próximo rezo
                        let cfg = app.state::<SharedConfig>().read().ok().map(|c| c.clone());
                        let muecin = {
                            let sched = app.state::<scheduler::SharedState>();
                            cfg.as_ref()
                                .and_then(|c| proximo_muecin(&sched, c))
                        };
                        let vol = cfg
                            .as_ref()
                            .map(|c| c.audio.volume as f32 / 100.0)
                            .unwrap_or(0.7);
                        match crate::audio::toggle_adhan(vol, muecin.as_deref()) {
                            Ok(estado) => log!("adhan (test) desde el menú: {estado}"),
                            Err(e) => log!("audio falló: {e}"),
                        }
                    }
                    "silence_adhan" => {
                        crate::audio::stop_adhan();
                        log!("adhan silenciado desde el tray");
                    }
                    "test_notification" => scheduler::notify_test(app),
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
                        // marcar rezado (día de hoy) — el scheduler togglea y registra
                        if let Ok(idx) = id["pray:".len()..].parse::<usize>() {
                            if let Some(name) = scheduler::PRAYERS.get(idx) {
                                if let Err(e) = pray_tx.send(scheduler::Trigger::Pray {
                                    date: String::new(), // hoy
                                    prayer: (*name).to_string(),
                                }) {
                                    log!("marcado no entregó al scheduler: {e}");
                                }
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
