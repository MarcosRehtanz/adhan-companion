//! Spike 3 — el adhan que suena: `rodio` 0.23 por ALSA (`libasound2-dev`)
//! con stream propio y volumen separado del sistema.
//!
//! Formato del spec: **WAV mono 22.05 kHz** — mismo formato que LittleFS del
//! nodo. El muecín real (biblioteca de muecines, licencias) queda para cuando
//! se resuelva el modelo de assets; el spike usa un beep sintético embebido
//! con `include_bytes!`.
//!
//! El `audio.volume` del config (0..100, default 70) mapea a rodio
//! como f32 0..1 — por ahora es constante MOCK hasta que el config.json exista.

use std::io::Cursor;

pub const MOCK_VOLUME: f32 = 0.70;

const TEST_BEEP: &[u8] = include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/spike3-beep.wav"));

/// Reproduce el WAV embebido con stream propio. Non-blocking: despawnea un
/// thread dueño del player+devicesink hasta que termina — el caller queda
/// libre (lo llama el scheduler en el disparo y el comando `test_adhan` del IPC).
pub fn play_mock_adhan(volume: f32) -> Result<(), String> {
    let mut device_sink = rodio::DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("dispositivo de audio: {e}"))?;
    // El drop del sink es intencional (fin del playback); sin esto rodio loguea
    // un "audio playing will stop" que confunde al depurar
    device_sink.log_on_drop(false);
    let player = rodio::Player::connect_new(device_sink.mixer());
    player.set_volume(volume.clamp(0.0, 1.0));

    let src = rodio::Decoder::new(Cursor::new(TEST_BEEP))
        .map_err(|e| format!("decode WAV: {e}"))?;
    player.append(src);

    std::thread::spawn(move || {
        player.sleep_until_end();
        drop(player);
        drop(device_sink); // al soltarlo, el stream cierra limpio
    });
    Ok(())
}
