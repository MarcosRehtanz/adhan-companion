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
use std::sync::atomic::{AtomicBool, Ordering};
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

static PLAYING: AtomicBool = AtomicBool::new(false);

fn is_playing() -> bool {
    PLAYING.load(Ordering::SeqCst)
}

/// Reproduce el adhan del muecín elegido con stream propio. Non-blocking:
/// despawnea un thread dueño del player+devicesink hasta que termina — el
/// caller queda libre (lo llama el scheduler en el disparo). `volume` en
/// 0.0..1.0. `muecin` None → default embebido.
pub fn play_adhan(volume: f32, muecin: Option<&str>) -> Result<(), String> {
    let mut device_sink = rodio::DeviceSinkBuilder::open_default_sink()
        .map_err(|e| format!("dispositivo de audio: {e}"))?;
    device_sink.log_on_drop(false);
    let player = Arc::new(rodio::Player::connect_new(device_sink.mixer()));
    player.set_volume(volume.clamp(0.0, 1.0));

    rodio::Decoder::new(fuente_de(muecin))
        .and_then(|src| {
            player.append(src);
            *current().lock().unwrap() = Some(player.clone());
            PLAYING.store(true, Ordering::SeqCst);
            Ok(())
        })
        .map_err(|e| format!("decode WAV: {e}"))?;

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
pub fn toggle_adhan(volume: f32, muecin: Option<&str>) -> Result<&'static str, String> {
    if is_playing() {
        stop_adhan();
        Ok("detenido")
    } else {
        play_adhan(volume, muecin)?;
        Ok("reproduciendo")
    }
}
