// Entry point de la app: `run()` es el factory real del core (main.rs solo delega).

#[cfg(desktop)]
pub mod audio;
#[cfg(mobile)]
#[path = "mobile_audio.rs"]
pub mod audio;
#[cfg(target_os = "android")]
mod android_alerts;
pub mod config;
#[cfg(desktop)]
mod desktop;
pub mod location;
#[cfg(mobile)]
mod mobile;
pub mod prayer;
pub mod qibla;
pub mod quran;
#[cfg(any(desktop, target_os = "android"))]
pub mod quran_audio;
pub mod registro;
pub mod scheduler;
pub mod updater;
#[cfg(desktop)]
pub mod sync_google;

use std::sync::mpsc;

use chrono::Datelike;
#[cfg(desktop)]
use tauri::Manager;
#[cfg(desktop)]
use tauri::WindowEvent;

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
fn get_schedule(
    state: tauri::State<'_, scheduler::SharedState>,
) -> Result<scheduler::Schedule, String> {
    let st = state
        .lock()
        .map_err(|e| format!("estado envenenado: {e}"))?;
    Ok(st.schedule.clone())
}

/// Solo interpreta el punto solicitado; no modifica ni persiste la ubicación.
#[tauri::command]
async fn parse_google_maps_location(input: String) -> Result<location::Coordinates, String> {
    tauri::async_runtime::spawn_blocking(move || location::resolve(&input))
        .await
        .map_err(|_| {
            "No se pudo leer la ubicación. Probá copiando las coordenadas del punto.".to_string()
        })?
}

#[tauri::command]
async fn preview_alert(
    audio: config::AudioConfig,
    prayer: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    audio.validate()?;
    if !scheduler::PRAYERS
        .iter()
        .any(|p| p.to_lowercase() == prayer)
    {
        return Err("Rezo desconocido.".into());
    }
    audio::stop_adhan();
    if cfg!(desktop) && audio.alert(&prayer).mode == config::AlertMode::Notification {
        scheduler::notify_standard(
            &app,
            "Prueba de aviso",
            &format!("{prayer} — solo notificación"),
        );
    }
    audio::play_alert(&audio, &prayer)
}
#[tauri::command]
async fn stop_alert() -> Result<(), String> {
    #[cfg(target_os = "android")]
    android_alerts::call("stop", serde_json::json!({}))?;
    #[cfg(not(target_os = "android"))]
    audio::stop_adhan();
    Ok(())
}

#[tauri::command]
async fn alert_playback_status() -> Result<Option<bool>, String> {
    #[cfg(desktop)]
    { Ok(Some(audio::is_playing())) }
    #[cfg(target_os = "android")]
    { Ok(android_alerts::call("control", serde_json::json!({"action":"status"}))?.get("playing").and_then(|x| x.as_bool())) }
    #[cfg(all(mobile, not(target_os = "android")))]
    { Ok(None) }
}

// Contrato IPC del spec: test de audio — el futuro botón "Probar" de la tab Audio
// Toca el muecín que sonaría en el PRÓXIMO rezo (test del ciclo completo real);
// sin próximo (día pasado) cae al default embebido.
#[tauri::command]
async fn test_adhan(
    muecin: Option<String>,
    state: tauri::State<'_, SharedConfig>,
    sched: tauri::State<'_, scheduler::SharedState>,
) -> Result<(), String> {
    let cfg = state
        .read()
        .map(|c| c.clone())
        .map_err(|e| format!("config: {e}"))?;
    // muecin None → el adhan del próximo rezo (ciclo real del día); Some →
    // preview de una fila específica de la tab Audio (el muecín asignado a ese rezo)
    let muecin = muecin.or_else(|| proximo_rezo(&sched));
    let estado = audio::toggle_adhan(cfg.audio.volume as f32 / 100.0, muecin.as_deref())?;
    log!(
        "test_adhan: {estado} (muecín '{}')",
        muecin.unwrap_or_else(|| "default".into())
    );
    Ok(())
}

/// Nombre del próximo rezo (la asignación de muecín es fija por rezo: cada
/// oración suena su propio adhan de la colección — sin selector)
fn proximo_rezo(sched: &tauri::State<'_, scheduler::SharedState>) -> Option<String> {
    let st = sched.lock().ok()?;
    st.schedule
        .next
        .as_ref()
        .map(|next| next.name.to_lowercase())
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
fn ejecutando_deb() -> bool {
    updater::es_deb()
}

#[tauri::command]
async fn check_update() -> Result<Option<updater::Disponible>, String> {
    #[cfg(desktop)]
    {
        tauri::async_runtime::spawn_blocking(updater::verificar).await.map_err(|e| e.to_string())?
    }
    #[cfg(mobile)]
    {
        Err("Consultá las descargas de Android; el actualizador de escritorio no está disponible.".into())
    }
}

#[tauri::command]
async fn instalar_update() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(updater::instalar).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn desktop_update_status() -> Result<serde_json::Value, String> { updater::status() }

// Qibla: rumbo desde el norte hacia la Qaaba, con la ubicación del config real
#[tauri::command]
fn get_qibla(state: tauri::State<'_, SharedConfig>) -> Result<f64, String> {
    let cfg = state
        .read()
        .map(|c| c.clone())
        .map_err(|e| format!("config: {e}"))?;
    Ok(qibla::bearing(cfg.lat, cfg.lon))
}

// Rachas y stats sobre el registro — la pieza v1.2 del spec (App Vida como Juego)
#[tauri::command]
fn get_stats() -> Result<registro::Stats, String> {
    registro::ensure_readable()?;
    Ok(registro::stats())
}

// Contrato IPC del spec: marcar/desmarcar rezado por fecha (toggle, last-wins)
#[tauri::command]
async fn mark_prayed(
    date: String,
    prayer: String,
    sched_tx: tauri::State<'_, mpsc::Sender<scheduler::Trigger>>,
    state: tauri::State<'_, SharedConfig>,
) -> Result<String, String> {
    if !scheduler::PRAYERS.contains(&prayer.as_str()) {
        return Err(format!("rezo desconocido: {prayer}"));
    }
    let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| format!("fecha inválida: {date} (esperado YYYY-MM-DD)"))?;
    registro::ensure_readable()?;
    if parsed > chrono::Local::now().date_naive() {
        return Err("no se pueden marcar rezos de fechas futuras".into());
    }
    #[cfg(mobile)]
    {
        let cfg = state.read().map_err(|e| format!("config: {e}"))?.clone();
        mobile::mark_prayed(&date, &prayer, &cfg)?;
        let _ = sched_tx.send(scheduler::Trigger::ConfigChanged);
        return Ok(prayer);
    }
    #[cfg(desktop)]
    {
        // El scheduler valida el horario con su propia copia de la configuración.
        let _ = state;
        let sender = sched_tx.inner().clone();
        let name = prayer.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let (reply, received) = mpsc::channel();
            sender.send(scheduler::Trigger::Pray { date, prayer: name, reply: Some(reply) })
                .map_err(|e| format!("scheduler no disponible: {e}"))?;
            received.recv().map_err(|_| "El scheduler se cerró antes de confirmar el guardado.".to_string())?
        }).await.map_err(|e| e.to_string())??;
        Ok(prayer)
    }
}

// Estado del mes para el calendario de seguimiento: { date, prayers[] }
#[tauri::command]
fn get_marked(month: String) -> Result<Vec<registro::MarkedDay>, String> {
    registro::ensure_readable()?;
    Ok(registro::marked_for_month(&month))
}

// Horarios de una fecha (pasado) para el calendario retroactivo
#[tauri::command]
fn get_schedule_for(
    date: String,
    state: tauri::State<'_, SharedConfig>,
) -> Result<Vec<scheduler::PrayerSlot>, String> {
    let parsed = chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| format!("fecha inválida: {date} (esperado YYYY-MM-DD)"))?;
    let (y, m, d) = (parsed.year(), parsed.month() as i32, parsed.day() as i32);
    let cfg = state
        .read()
        .map(|c| c.clone())
        .map_err(|e| format!("config: {e}"))?;
    Ok(scheduler::prayer_slots_for(y, m, d, &cfg))
}

// Contracts IPC de config (Spike de config): leer y guardar hot-reload
#[tauri::command]
fn get_config(state: tauri::State<'_, SharedConfig>, sched_tx: tauri::State<'_, mpsc::Sender<scheduler::Trigger>>) -> Result<config::Config, String> {
    let cfg = config::read_saved()?;
    let changed = serde_json::to_value(&*state.read().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?
        != serde_json::to_value(&cfg).map_err(|e| e.to_string())?;
    if changed {
        *state.write().map_err(|e| e.to_string())? = cfg.clone();
        let _ = sched_tx.send(scheduler::Trigger::ConfigChanged);
        #[cfg(target_os = "android")]
        android_alerts::sync(&cfg)?;
    }
    Ok(cfg)
}

#[tauri::command]
async fn set_config(
    cfg: config::Config,
    state: tauri::State<'_, SharedConfig>,
    sched_tx: tauri::State<'_, mpsc::Sender<scheduler::Trigger>>,
) -> Result<config::Config, String> {
    location::Coordinates::validated(cfg.lat, cfg.lon)?;
    cfg.audio.validate()?;
    if !(-2..=2).contains(&cfg.calendar.adjustment_days) {
        return Err("El ajuste del calendario debe estar entre -2 y +2 días.".into());
    }
    cfg.follow_up.validar()?;
    log!("set_config: guardar + recalcular en caliente");
    config::save(&cfg)?;
    *state
        .write()
        .map_err(|e| format!("config envenenado: {e}"))? = cfg.clone();
    let _ = sched_tx.send(scheduler::Trigger::ConfigChanged);
    #[cfg(target_os = "android")]
    android_alerts::sync(&cfg)?;
    Ok(cfg)
}

/// Pausa todos los avisos por `days` días (1 a 60) o los reanuda (`None`). Es una acción, no una
/// edición con borrador: guarda solo `follow_up.paused_until` sobre el config vigente.
/// La app no pregunta ni guarda el motivo.
#[tauri::command]
async fn set_pause(
    days: Option<u32>,
    state: tauri::State<'_, SharedConfig>,
    sched_tx: tauri::State<'_, mpsc::Sender<scheduler::Trigger>>,
) -> Result<config::Config, String> {
    let mut cfg = state.read().map_err(|e| format!("config envenenado: {e}"))?.clone();
    cfg.follow_up.paused_until = match days {
        Some(d) if (1..=60).contains(&d) => Some(
            (chrono::Local::now().date_naive() + chrono::Days::new(d.into())).format("%Y-%m-%d").to_string(),
        ),
        Some(_) => return Err("La pausa va de 1 a 60 días.".into()),
        None => None,
    };
    log!("set_pause: {}", if days.is_some() { "avisos en pausa" } else { "avisos reanudados" });
    config::save(&cfg)?;
    *state.write().map_err(|e| format!("config envenenado: {e}"))? = cfg.clone();
    let _ = sched_tx.send(scheduler::Trigger::ConfigChanged);
    #[cfg(target_os = "android")]
    android_alerts::sync(&cfg)?;
    Ok(cfg)
}

#[derive(serde::Serialize)]
struct RuntimeInfo {
    platform: &'static str,
    config_path: String,
    background_alerts: bool,
    audio_preview: bool,
    quran_audio: bool,
    /// El respaldo con Google existe solo en escritorio y con la credencial OAuth en la build.
    google_sync: bool,
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        platform: std::env::consts::OS,
        config_path: config::config_path().display().to_string(),
        background_alerts: cfg!(any(desktop, target_os = "android")),
        audio_preview: cfg!(any(desktop, target_os = "android")),
        quran_audio: cfg!(any(desktop, target_os = "android")),
        #[cfg(desktop)]
        google_sync: sync_google::disponible(),
        #[cfg(not(desktop))]
        google_sync: false,
    }
}

#[cfg(mobile)]
#[tauri::command]
fn set_autostart(_enabled: bool, _app: tauri::AppHandle) -> Result<(), String> {
    Err("El inicio automático de escritorio no está disponible en Android.".into())
}
#[cfg(mobile)]
#[tauri::command]
fn get_autostart(_app: tauri::AppHandle) -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
async fn android_alert_status(action: Option<String>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    { android_alerts::call("control", serde_json::json!({"action": action.unwrap_or_else(|| "status".into())})) }
    #[cfg(not(target_os = "android"))]
    { let _ = action; Err("Solo disponible en Android.".into()) }
}

#[tauri::command]
async fn android_update(action: Option<String>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    { android_alerts::call("update", serde_json::json!({"action": action.unwrap_or_else(|| "status".into())})) }
    #[cfg(not(target_os = "android"))]
    { let _ = action; Err("Solo disponible en Android.".into()) }
}

// Contratos comunes: escritorio reproduce con rodio y Android con su servicio nativo.
#[tauri::command]
async fn quran_audio_status(sura: u16) -> Result<serde_json::Value, String> {
    #[cfg(any(desktop, target_os = "android"))]
    { tauri::async_runtime::spawn_blocking(move || quran_audio::status(sura)).await.map_err(|e| e.to_string())? }
    #[cfg(not(any(desktop, target_os = "android")))]
    { let _ = sura; Err("La recitación no está disponible en esta plataforma.".into()) }
}
#[tauri::command]
async fn quran_audio_control(action: String, sura: Option<u16>, aya: Option<u16>, volume: Option<u8>) -> Result<(), String> {
    #[cfg(any(desktop, target_os = "android"))]
    { tauri::async_runtime::spawn_blocking(move || quran_audio::control(&action, sura, aya, volume)).await.map_err(|e| e.to_string())? }
    #[cfg(not(any(desktop, target_os = "android")))]
    { let _ = (action, sura, aya, volume); Err("La recitación no está disponible en esta plataforma.".into()) }
}

// Toggle real de autostart del plugin (checkbox de la tab Avanzado)
#[cfg(desktop)]
#[tauri::command]
fn set_autostart(enabled: bool, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart
            .enable()
            .map_err(|e| format!("autostart enable: {e}"))
    } else {
        autostart
            .disable()
            .map_err(|e| format!("autostart disable: {e}"))
    }
}

#[cfg(desktop)]
#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| format!("autostart status: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Notificaciones freedesktop: preaviso + disparo del adhan (core-side)
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    let builder = builder
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
        ));
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_alerts::init());
    // Un ÚNICO invoke_handler: en Tauri 2 una segunda llamada REEMPLAZA al
    // handler anterior y se pierden los comandos del primer bloque (bug visto
    // en dev: "runtime_info not found"). Mantener ambas listas en sync.
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![

        runtime_info,
        android_alert_status,
        android_update,
        quran_audio_status,
        quran_audio_control,
        quran::get_quran_reader,
        quran::update_quran_reader,
        get_schedule,
        preview_alert,
        alert_playback_status,
        stop_alert,
        parse_google_maps_location,
        test_adhan,
        test_notification,
        get_config,
        set_config,
        set_pause,
        set_autostart,
        get_autostart,
        mark_prayed,
        get_marked,
        get_schedule_for,
        get_qibla,
        get_stats,
        version_actual,
        ejecutando_appimage,
        ejecutando_windows,
        ejecutando_deb,
        check_update,
        desktop_update_status,
        instalar_update,
        sync_google::sync_estado,
        sync_google::sync_login,
        sync_google::sync_logout,
        sync_google::sync_ahora,
        sync_google::sync_resolver,
        sync_google::sync_restaurar
    ]);
    #[cfg(not(desktop))]
    let builder = builder.invoke_handler(tauri::generate_handler![

        runtime_info,
        android_alert_status,
        android_update,
        quran_audio_status,
        quran_audio_control,
        quran::get_quran_reader,
        quran::update_quran_reader,
        get_schedule,
        preview_alert,
        alert_playback_status,
        stop_alert,
        parse_google_maps_location,
        test_adhan,
        test_notification,
        get_config,
        set_config,
        set_pause,
        set_autostart,
        get_autostart,
        mark_prayed,
        get_marked,
        get_schedule_for,
        get_qibla,
        get_stats,
        version_actual,
        ejecutando_appimage,
        ejecutando_windows,
        ejecutando_deb,
        check_update,
        desktop_update_status,
        instalar_update,
    ]);
    #[cfg(desktop)]
    let builder = builder
        // Tray-first: cerrar la ventana NO mata la app — el core sigue de fondo
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                log!("close interceptado: la ventana se esconde, el core sigue");
                let _ = window.hide();
                api.prevent_close();
            }
        });
    builder
        .setup(move |app| {
            #[cfg(desktop)]
            desktop::setup(app)?;
            #[cfg(mobile)]
            mobile::setup(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
