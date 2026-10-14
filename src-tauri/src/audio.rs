//! El adhan que suena: `rodio` 0.23 por ALSA/PipeWire con stream propio y
//! volumen separado del sistema.
//!
//! Formato del spec: **WAV mono 22.05 kHz** — mismo formato que LittleFS del
//! nodo (el archivo se reutiliza entre app y firmware).
//!
//! Muecín actual: un adhan default (grabación Dhuhr de Doha, Public Domain —
//! ver `assets/muecin/CREDITS.md`). La biblioteca por rezo entra en v1.1.

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

/// Adhan default embebido (WAV mono 22.05 kHz)
const ADHAN_DEFAULT: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/muecin/default.wav"));

fn current() -> &'static Mutex<Option<Arc<rodio::Player>>> {
    static C: OnceLock<Mutex<Option<Arc<rodio::Player>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}

static PLAYING: AtomicBool = AtomicBool::new(false);

fn is_playing() -> bool {
    PLAYING.load(Ordering::SeqCst)
}

/// Reproduce el adhan default con stream propio. Non-blocking: despawnea un
/// thread dueño del player+devicesink hasta que termina — el caller queda
/// libre (lo llama el scheduler en el disparo). `volume` en 0.0..1.0.
pub fn play_adhan(volume: f32) -> Result<(), String> {
    let mut device_sink = rodio::DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("dispositivo de audio: {e}"))?;
    device_sink.log_on_drop(false);
    let player = Arc::new(rodio::Player::connect_new(device_sink.mixer()));
    player.set_volume(volume.clamp(0.0, 1.0));

    let src = rodio::Decoder::new(Cursor::new(ADHAN_DEFAULT))
        .map_err(|e| format!("decode WAV: {e}"))?;
    player.append(src);

    *current().lock().unwrap() = Some(player.clone());
    PLAYING.store(true, Ordering::SeqCst);

    std::thread::spawn(move || {
        player.sleep_until_end();
        drop(player);
        drop(device_sink);
        PLAYING.store(false, Ordering::SeqCst);
        *current().lock().unwrap() = None;
    });
    Ok(())
}

/// Detiene la reproducción en curso (si hay)
pub fn stop_adhan() {
    if let Some(p) = current().lock().unwrap().take() {
        p.stop();
    }
    PLAYING.store(false, Ordering::SeqCst);
}

/// Test desde la UI: reproduce o detiene según el estado actual.
pub fn toggle_adhan(volume: f32) -> Result<&'static str, String> {
    if is_playing() {
        stop_adhan();
        Ok("detenido")
    } else {
        play_adhan(volume)?;
        Ok("reproduciendo")
    }
}
