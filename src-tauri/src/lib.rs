// Entry point de la app: `run()` es el factory real del core (main.rs solo delega).

pub mod audio;
pub mod config;
pub mod location;
pub mod prayer;
pub mod qibla;
pub mod quran;
pub mod registro;
pub mod scheduler;
pub mod updater;

use std::sync::mpsc;

use chrono::Datelike;
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

/// Solo interpreta el punto solicitado; no modifica ni persiste la ubicación.
#[tauri::command]
async fn parse_google_maps_location(input: String) -> Result<location::Coordinates, String> {
    tauri::async_runtime::spawn_blocking(move || location::resolve(&input))
        .await
        .map_err(|_| "No se pudo leer la ubicación. Probá copiando las coordenadas del punto.".to_string())?
}

#[tauri::command]
fn preview_alert(audio: config::AudioConfig, prayer: String, app: tauri::AppHandle) -> Result<(), String> {
    audio.validate()?;
    if !scheduler::PRAYERS.iter().any(|p| p.to_lowercase() == prayer) { return Err("Rezo desconocido.".into()); }
    audio::stop_adhan();
    if audio.alert(&prayer).mode == config::AlertMode::Notification {
        scheduler::notify_standard(&app, "Prueba de aviso", &format!("{prayer} — solo notificación"));
    }
    audio::play_alert(&audio, &prayer)
}
#[tauri::command]
fn stop_alert() { audio::stop_adhan(); }

// Contrato IPC del spec: test de audio — el futuro botón "Probar" de la tab Audio
// Toca el muecín que sonaría en el PRÓXIMO rezo (test del ciclo completo real);
// sin próximo (día pasado) cae al default embebido.
#[tauri::command]
fn test_adhan(
    muecin: Option<String>,
    state: tauri::State<SharedConfig>,
    sched: tauri::State<scheduler::SharedState>,
) -> Result<(), String> {
    let cfg = state.read().map(|c| c.clone()).map_err(|e| format!("config: {e}"))?;
    // muecin None → el adhan del próximo rezo (ciclo real del día); Some →
    // preview de una fila específica de la tab Audio (el muecín asignado a ese rezo)
    let muecin = muecin.or_else(|| proximo_rezo(&sched));
    let estado = audio::toggle_adhan(cfg.audio.volume as f32 / 100.0, muecin.as_deref())?;
    log!("test_adhan: {estado} (muecín '{}')", muecin.unwrap_or_else(|| "default".into()));
    Ok(())
}

/// Nombre del próximo rezo (la asignación de muecín es fija por rezo: cada
/// oración suena su propio adhan de la colección — sin selector)
fn proximo_rezo(sched: &tauri::State<scheduler::SharedState>) -> Option<String> {
    let st = sched.lock().ok()?;
    st.schedule.next.as_ref().map(|next| next.name.to_lowercase())
}

// Notificación de prueba: valida el canal freedesktop UI-agnostic
#[tauri::command]
fn test_notification(app: tauri::AppHandle) -> Result<(), String> {
    log!("test_notification (IPC)");
    // reuso el helper del scheduler
    scheduler::notify_test(&app);
    Ok(())
}

// Actualizador: versión actual + chequeo + instalación (AppImage self-update)
#[tauri::command]
fn version_actual() -> String {
    updater::versión_actual()
}

#[tauri::command]
fn ejecutando_appimage() -> bool {
    updater::es_appimage()
}

#[tauri::command]
fn ejecutando_windows() -> bool {
    updater::es_windows()
}

#[tauri::command]
fn check_update() -> Result<Option<updater::Disponible>, String> {
    updater::verificar()
}

#[tauri::command]
fn instalar_update() -> Result<(), String> {
    updater::instalar()
}

// Qibla: rumbo desde el norte hacia la Qaaba, con la ubicación del config real
#[tauri::command]
fn get_qibla(state: tauri::State<SharedConfig>) -> Result<f64, String> {
    let cfg = state.read().map(|c| c.clone()).map_err(|e| format!("config: {e}"))?;
    Ok(qibla::bearing(cfg.lat, cfg.lon))
}

// Rachas y stats sobre el registro — la pieza v1.2 del spec (App Vida como Juego)
#[tauri::command]
fn get_stats() -> registro::Stats {
    registro::stats()
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
    let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| format!("fecha inválida: {date} (esperado YYYY-MM-DD)"))?;
    if parsed > chrono::Local::now().date_naive() {
        return Err("no se pueden marcar rezos de fechas futuras".into());
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
    let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| format!("fecha inválida: {date} (esperado YYYY-MM-DD)"))?;
    let (y, m, d) = (parsed.year(), parsed.month() as i32, parsed.day() as i32);
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
    location::Coordinates::validated(cfg.lat, cfg.lon)?;
    cfg.audio.validate()?;
    if !(-2..=2).contains(&cfg.calendar.adjustment_days) {
        return Err("El ajuste del calendario debe estar entre -2 y +2 días.".into());
    }
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

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("autostart status: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Notificaciones freedesktop: preaviso + disparo del adhan (core-side)
        .plugin(tauri_plugin_notification::init())
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
            quran::get_quran_reader, quran::update_quran_reader, get_schedule, preview_alert, stop_alert, parse_google_maps_location, test_adhan, test_notification, get_config, set_config, set_autostart, get_autostart, mark_prayed, get_marked, get_schedule_for, get_qibla, get_stats, version_actual, ejecutando_appimage, ejecutando_windows, check_update, instalar_update
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
            // Muecines: RESOLUCIÓN POR SANIDAD, no por suposición:
            // - release (.deb instalado): `BaseDirectory::Resource` trae el set completo
            //   (la validación es simple: el dir existe y tiene .wav)
            // - dev: los resources van a `target/debug/assets/muecin` de forma
            //   parciálmente staged (bug del staging de tauri dev) → usamos la
            //   biblioteca del repo vía CARGO_MANIFEST_DIR, que SIEMPRE está completa
            let tiene_wav = |p: &std::path::Path| {
                p.is_dir()
                    && std::fs::read_dir(p)
                        .map(|rd| {
                            rd.filter_map(Result::ok).any(|e| {
                                e.path()
                                    .extension()
                                    .is_some_and(|x| x.eq_ignore_ascii_case("wav"))
                            })
                        })
                        .unwrap_or(false)
            };
            let mut muecines_dir: Option<std::path::PathBuf> = None;
            if let Ok(p) = app.path().resolve("assets/muecin", tauri::path::BaseDirectory::Resource) {
                if tiene_wav(&p) {
                    muecines_dir = Some(p);
                }
            }
            #[cfg(debug_assertions)]
            if muecines_dir.is_none() {
                let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/muecin");
                if tiene_wav(&repo) {
                    muecines_dir = Some(repo);
                }
            }
            match muecines_dir {
                Some(p) => {
                    crate::log!("muecines dir: {}", p.display());
                    crate::audio::set_resource_dir(p);
                }
                None => {
                    crate::log!("muecines: sin biblioteca en disco — solo default embebido");
                }
            }

            // auto-check del updater: thread deferrado para no competir con el arranque
            let up = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(8));
                match updater::verificar() {
                    Ok(Some(info)) => {
                        log!("updater: disponible v{}", info.version);
                        scheduler::notify_standard(
                            &up,
                            "Actualización disponible",
                            &format!(
                                "v{} está publicada — verificá Activaciones en la app o descargásela de Releases",
                                info.version
                            ),
                        );
                    }
                    Ok(None) => log!("updater: al día"),
                    Err(e) => log!("updater: {e}"),
                }
            });

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
            let test_adhan: Option<MenuItem<tauri::Wry>> = {
                #[cfg(debug_assertions)]
                {
                    Some(MenuItem::with_id(
                        app,
                        "test_adhan",
                        "Reproducir adhan ahora (test)",
                        true,
                        None::<&str>,
                    )?)
                }
                // dev-tool del spike 3 que quedó en el canal: en prod el usuario
                // prueba su muecín desde la tab Audio (via get_qibla... via
                // test_adhan del IPC — solo para validación dev)
                #[cfg(not(debug_assertions))]
                {
                    None
                }
            };
            let silenciar =
                MenuItem::with_id(app, "silence_adhan", "Detener sonido", true, None::<&str>)?;
            let test_notif: Option<MenuItem<tauri::Wry>> = {
                #[cfg(debug_assertions)]
                {
                    Some(MenuItem::with_id(
                        app,
                        "test_notification",
                        "Notificación de prueba",
                        true,
                        None::<&str>,
                    )?)
                }
                #[cfg(not(debug_assertions))]
                {
                    None
                }
            };
            let config = MenuItem::with_id(app, "config", "Configuración…", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;

            let mut menu = MenuBuilder::new(app)
                .item(&countdown)
                .separator();
            for (_, mi) in &prayer_items {
                menu = menu.item(mi);
            }
            menu = menu
                .separator()
                .item(&silenciar)
                .item(&config)
                .separator()
                .item(&salir);
            // Herramientas de dev solo aparecen con debug_assertions; el
            // .deb / the release nunca los ve (cliente prod limpio)
            for extra in [&test_adhan, &test_notif].into_iter().flatten() {
                menu = menu
                    .separator()
                    .item(extra);
            }
            let menu = menu.build()?;

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
                    // (los ítems test_adhan/test_notification solo existen en
                    // dev — en release estas arm llegan solo si el IPC los
                    // dispara directo, no desde el menú)
                    "test_adhan" => {
                        // mismo criterio que el IPC: el adhan del próximo rezo
                        let cfg = app.state::<SharedConfig>().read().ok().map(|c| c.clone());
                        let muecin: Option<String> = {
                            let sched = app.state::<scheduler::SharedState>();
                            sched.lock().ok().and_then(|s| {
                                s.schedule.next.as_ref().map(|next| next.name.to_lowercase())
                            })
                        };
                        let vol = cfg
                            .as_ref()
                            .map(|c| c.audio.volume as f32 / 100.0)
                            .unwrap_or(0.7);
                        match crate::audio::toggle_adhan(vol, muecin.as_deref()) {
                            Ok(estado) => log!("adhan (test) desde el menú con muecín '{}': {estado}", muecin.unwrap_or_else(|| "default".into())),
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
