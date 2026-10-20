//! El adhan que suena: `rodio` 0.23 con stream propio y
//! volumen separado del sistema.
//!
//! Formato del spec: **WAV mono 22.05 kHz** — mismo formato que LittleFS del
//! nodo (el archivo se reutiliza entre app y firmware).
//!
//! Biblioteca de muecines: **asignación fija por rezo** (2026-10-15, decisión
//! de producto: sin selector) — cada oración suena el adhan de su propia hora
//! de la colección Doha (`fajr.wav` → Fajr, `maghrib.wav` → Maghrib, etc.).
//! resolución en runtime con prioridad
//!   1. carpeta de usuario (`config_dir()/muecines/<nombre>.wav`)
//!   2. muecines incluidos en el paquete (resources → `$RESOURCE/assets/muecin`)
//!   3. default.wav embebido en el binario (grabación Doha, Public Domain —
//!      ver `assets/muecin/CREDITS.md`) — fallback universal, siempre existe

use std::io::{BufReader, Cursor};use std::path::PathBuf;

use std::sync::{Arc, Mutex, OnceLock};

/// Adhan default embebido (WAV mono 22.05 kHz)
const ADHAN_DEFAULT: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/muecin/default.wav"));

/// Directorio de muecines incluidos en el paquete — lo instancia el
/// setup de lib.rs resolviendo `BaseDirectory::Resource`; en dev puede quedar
/// None y la resolución cae en el default embebido. Ver `dirs()`.
static RESOURCE_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

pub fn set_resource_dir(dir: PathBuf) {
    let _ = RESOURCE_DIR.set(Some(dir));
}

/// Directorios a escanear para la biblioteca, en orden de prioridad:
/// usuario primero (agregar sin recompilar), luego los instalados.
fn dirs() -> Vec<PathBuf> {
    vec![
        crate::config::config_dir().join("muecines"),
        RESOURCE_DIR
            .get()
            .and_then(|o| o.as_ref().cloned())
            .unwrap_or_else(PathBuf::new),
    ]
}

/// Normaliza un nombre: sin extensión y sin espacios raros.
fn nombre_norm(nombre: &str) -> String {
    nombre
        .trim()
        .trim_end_matches(".wav")
        .trim_end_matches(".WAV")
        .trim()
        .to_string()
}

/// Fuente del WAV: bytes embebidos (default, siempre disponible) o archivo de
/// disco. `SeekableSend` = Read + Seek + Send + Sync + 'static: los bounds
/// exactos de `rodio::Decoder::new` (el player vive en un thread propio).
trait SeekableSend: std::io::Read + std::io::Seek + Send + Sync + 'static {}
impl<T: std::io::Read + std::io::Seek + Send + Sync + 'static + ?Sized> SeekableSend for T {}
type MediaSrc = Box<dyn SeekableSend>;

/// (reservado — la resolución de fuentes vive en `fuente_de`)

/// Resuelve el muecín por nombre (con o sin `.wav`). `None` / nombre vacío /
/// `"default"` → el embebido. Si el archivo no aparece, degrada al default
/// (la regla del QoS del spec: nunca queda sin adhan por un config roto).
fn fuente_de(nombre: Option<&str>) -> MediaSrc {
    if let Some(nombre) = nombre.map(nombre_norm) {
        if !nombre.is_empty() && !nombre.eq_ignore_ascii_case("default") {
            let file_name = format!("{nombre}.wav");
            for dir in dirs() {
                let path = dir.join(&file_name);
                if let Ok(f) = std::fs::File::open(&path) {
                    crate::log!("[audio] muecín por disco: {}", path.display());
                    return Box::new(BufReader::new(f));
                }
            }
            crate::log!("[audio] muecín '{}' no encontrado; uso default", nombre);
        }
    }
    Box::new(Cursor::new(ADHAN_DEFAULT))
}

fn current() -> &'static Mutex<Option<Arc<rodio::Player>>> {
    static C: OnceLock<Mutex<Option<Arc<rodio::Player>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(None))
}



pub(crate) fn is_playing() -> bool {
    current().lock().unwrap().is_some()
}

/// Reproduce el adhan del muecín elegido con stream propio. Non-blocking:
/// despawnea un thread dueño del player+devicesink hasta que termina — el
/// caller queda libre (lo llama el scheduler en el disparo). `volume` en
/// 0.0..1.0. `muecin` None → default embebido.
pub fn play_adhan(volume: f32, muecin: Option<&str>) -> Result<(), String> {
    let source = rodio::Decoder::new(fuente_de(muecin)).map_err(|e| format!("decode WAV: {e}"))?;
    play_source(volume, source)
}

/// Orden común: coordinación → recitación → audio de avisos. Nunca espera a la red.
pub(crate) static COORDINATION: Mutex<()> = Mutex::new(());

fn play_source<S>(volume: f32, source: S) -> Result<(), String>
where S: rodio::Source + Send + 'static {
    let _coordination = COORDINATION.lock().map_err(|_| "No se pudo coordinar el audio.")?;
    crate::quran_audio::interrupt();
    let mut device_sink = rodio::DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("dispositivo de audio: {e}"))?;
    device_sink.log_on_drop(false);
    let player = Arc::new(rodio::Player::connect_new(device_sink.mixer()));
    player.set_volume(volume.clamp(0.0, 1.0));
    // Serializa el reemplazo. Un reproductor anterior nunca borra al nuevo.
    {
        let mut slot = current().lock().unwrap();
        if let Some(previous) = slot.take() { previous.stop(); }
        player.append(source);
        *slot = Some(player.clone());
    }
    std::thread::spawn(move || {
        player.sleep_until_end();
        let mut slot = current().lock().unwrap();
        if slot.as_ref().is_some_and(|p| Arc::ptr_eq(p, &player)) { *slot = None; }
        drop(slot);
        drop(device_sink);
    });
    Ok(())
}

pub fn play_alert(config: &crate::config::AudioConfig, prayer: &str) -> Result<(), String> {
    config.validate()?;
    let alert = config.alert(prayer);
    match alert.mode {
        crate::config::AlertMode::Adhan => play_adhan(config.volume as f32 / 100.0, Some(prayer)),
        crate::config::AlertMode::Tone => {
            let source = rodio::buffer::SamplesBuffer::new(std::num::NonZeroU16::new(1).unwrap(), std::num::NonZeroU32::new(22_050).unwrap(), tone_samples(alert.tone, alert.duration_secs));
            play_source(config.volume as f32 / 100.0, source)
        }
        crate::config::AlertMode::Notification => { stop_adhan(); Ok(()) },
    }
}

// Tonos originales, generados localmente con entrada/salida suave para evitar clics.
fn tone_samples(tone: crate::config::Tone, seconds: u8) -> Vec<f32> {
    use crate::config::Tone;
    let duration = seconds as f32;
    (0..22_050 * seconds as usize).map(|i| {
        let t = i as f32 / 22_050.0;
        let phase = match tone { Tone::Double => t % 1.0, _ => t };
        let envelope = (phase / 0.025).min(1.0) * ((duration - t) / 0.1).clamp(0.0, 1.0);
        let (freq, decay) = match tone {
            Tone::Soft => (440.0, (-t * 1.5).exp()),
            Tone::Double => {
                let pulse = if phase < 0.22 { phase } else { phase - 0.35 };
                (660.0, (pulse / 0.025).clamp(0.0, 1.0) * ((0.22 - pulse) / 0.025).clamp(0.0, 1.0))
            },
            Tone::Bell => (880.0, (-t * 2.0).exp()),
        };
        let wave = (std::f32::consts::TAU * freq * t).sin();
        0.22 * wave * envelope * decay
    }).collect()
}

/// Detiene la reproducción en curso (si hay)
pub fn stop_adhan() {
    if let Some(p) = current().lock().unwrap().take() {
        p.stop();
    }

}

/// Test desde la UI: reproduce o detiene según el estado actual.
pub fn toggle_adhan(volume: f32, muecin: Option<&str>) -> Result<&'static str, String> {
    if is_playing() {
        stop_adhan();
        Ok("detenido")
    } else {
        play_adhan(volume, muecin)?;
        Ok("reproduciendo")
    }
}
