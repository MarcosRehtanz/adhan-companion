//! Android reproduce con un servicio nativo; nunca instala rodio.
pub fn stop_adhan() {
    #[cfg(target_os = "android")]
    if let Err(error) = crate::android_alerts::call("stop", serde_json::json!({})) {
        crate::log!("detener audio Android: {error}");
    }
}
pub fn play_alert(config: &crate::config::AudioConfig, prayer: &str) -> Result<(), String> {
    config.validate()?;
    #[cfg(target_os = "android")]
    {
        crate::android_alerts::call(
            "preview",
            serde_json::json!({"audio": serde_json::to_string(config).map_err(|e| e.to_string())?, "prayer": prayer}),
        )?;
        Ok(())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = prayer;
        Err("Audio móvil no disponible en esta plataforma.".into())
    }
}
pub fn toggle_adhan(volume: f32, muecin: Option<&str>) -> Result<&'static str, String> {
    let mut config = crate::config::AudioConfig::default();
    config.volume = (volume.clamp(0.0, 1.0) * 100.0).round() as u8;
    play_alert(&config, muecin.unwrap_or("dhuhr"))?;
    Ok("reproduciendo")
}
