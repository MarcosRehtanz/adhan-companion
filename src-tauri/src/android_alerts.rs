//! Puente Android: AlarmManager/MediaPlayer viven fuera de la WebView.
use std::sync::OnceLock;
use tauri::Wry;
use tauri::plugin::{PluginHandle, TauriPlugin};
static HANDLE: OnceLock<PluginHandle<Wry>> = OnceLock::new();

pub fn init() -> TauriPlugin<Wry> {
    tauri::plugin::Builder::new("adhan-android")
        .setup(|_, api| {
            let handle = api.register_android_plugin(
                "io.github.marcosrehtanz.adhancompanion.experimental",
                "AdhanPlugin",
            )?;
            let _ = HANDLE.set(handle);
            Ok(())
        })
        .build()
}
pub fn call(command: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
    HANDLE
        .get()
        .ok_or("El servicio Android todavía no está listo.")?
        .run_mobile_plugin(command, args)
        .map_err(|e| e.to_string())
}
pub fn sync(cfg: &crate::config::Config) -> Result<(), String> {
    call(
        "sync",
        serde_json::json!({
            "config": serde_json::to_string(cfg).map_err(|e| e.to_string())?,
            // El recordatorio consulta el registro desde el receptor de alarmas, sin Tauri.
            "registro": crate::registro::registro_path().to_string_lossy(),
        }),
    )?;
    Ok(())
}

/// ¿Ese rezo ya está marcado? Lo usa el recordatorio de PrayerAlarms antes de avisar. Sin
/// unwrap: en release `panic = "abort"`, así que cualquier error responde «no marcado».
#[unsafe(no_mangle)]
pub extern "system" fn Java_io_github_marcosrehtanz_adhancompanion_experimental_PrayerNative_marked(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    path: jni::objects::JString,
    date: jni::objects::JString,
    prayer: jni::objects::JString,
) -> jni::sys::jboolean {
    let mut leer = |s: &jni::objects::JString| -> Option<String> { env.get_string(s).ok().map(Into::into) };
    match (leer(&path), leer(&date), leer(&prayer)) {
        (Some(p), Some(d), Some(r)) => crate::registro::marked_in(std::path::Path::new(&p), &d, &r) as jni::sys::jboolean,
        _ => 0,
    }
}

// Un receiver puede cargar la biblioteca sin arrancar Tauri. Esta función pura
// reutiliza PrayTimes C y no accede al directorio/configuración de la UI.
#[unsafe(no_mangle)]
pub extern "system" fn Java_io_github_marcosrehtanz_adhancompanion_experimental_PrayerNative_calculate(
    mut env: jni::JNIEnv,
    _class: jni::objects::JClass,
    json: jni::objects::JString,
    year: jni::sys::jint,
    month: jni::sys::jint,
    day: jni::sys::jint,
    offset: jni::sys::jdouble,
) -> jni::sys::jstring {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(
        || -> Result<String, String> {
            let input: String = env.get_string(&json).map_err(|e| e.to_string())?.into();
            let cfg: crate::config::Config =
                serde_json::from_str(&input).map_err(|e| e.to_string())?;
            crate::location::Coordinates::validated(cfg.lat, cfg.lon)?;
            cfg.audio.validate()?;
            chrono::NaiveDate::from_ymd_opt(year, month as u32, day as u32)
                .ok_or("Fecha inválida")?;
            if !offset.is_finite() || offset.abs() > 24.0 {
                return Err("Zona inválida".into());
            }
            let times = crate::prayer::calc_times(
                year,
                month,
                day,
                cfg.lat,
                cfg.lon,
                offset,
                &(&cfg).into(),
            );
            let seconds: Vec<Option<i64>> = crate::prayer::PRAYER_INDICES
                .iter()
                .map(|&i| {
                    times[i]
                        .is_finite()
                        .then(|| (times[i] * 3600.0).floor() as i64)
                })
                .collect();
            serde_json::to_string(&seconds).map_err(|e| e.to_string())
        },
    ));
    match result {
        Ok(Ok(json)) => env
            .new_string(json)
            .map(|s| s.into_raw())
            .unwrap_or(std::ptr::null_mut()),
        _ => {
            let _ = env.throw_new(
                "java/lang/IllegalStateException",
                "No se pudieron calcular los horarios locales.",
            );
            std::ptr::null_mut()
        }
    }
}
