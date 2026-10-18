//! El reproductor de escritorio no se instala en Android experimental.
const MESSAGE: &str =
    "El audio y los avisos de rezo todavía no están disponibles en Android experimental.";

pub fn stop_adhan() {}

pub fn play_alert(_config: &crate::config::AudioConfig, _prayer: &str) -> Result<(), String> {
    Err(MESSAGE.into())
}

pub fn toggle_adhan(_volume: f32, _muecin: Option<&str>) -> Result<&'static str, String> {
    Err(MESSAGE.into())
}
