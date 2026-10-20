//! Recitación de escritorio. Red acotada fuera del scheduler y datos separados del lector.
use crate::quran::Position;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};

const EDITION: &str = "ar.parhizgar";
const MAX_FILE: u64 = 12 * 1024 * 1024;
const MAX_SURA: u64 = 300 * 1024 * 1024;
const MAX_LIBRARY: u64 = 1024 * 1024 * 1024;
static STORAGE: Mutex<()> = Mutex::new(());
static TEMP_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Deserialize)]
struct Metadata {
    suras: Vec<Sura>,
}
#[derive(Deserialize)]
struct Sura {
    count: u16,
}
fn counts() -> &'static [Sura] {
    static META: OnceLock<Metadata> = OnceLock::new();
    &META
        .get_or_init(|| {
            serde_json::from_str(include_str!("../../public/quran/suras.json"))
                .expect("metadatos incluidos")
        })
        .suras
}
fn count(sura: u16) -> Result<u16, String> {
    sura.checked_sub(1)
        .and_then(|s| counts().get(s as usize))
        .map(|s| s.count)
        .ok_or_else(|| "Sura inválida.".into())
}
fn number(p: Position) -> Result<u16, String> {
    if p.aya == 0 || p.aya > count(p.sura)? {
        return Err("Aleya inválida.".into());
    }
    Ok(counts()[..p.sura as usize - 1]
        .iter()
        .map(|s| s.count)
        .sum::<u16>()
        + p.aya)
}
fn root() -> PathBuf {
    crate::config::config_dir()
        .join("quran-audio")
        .join(EDITION)
}
fn state_path() -> PathBuf {
    crate::config::config_dir().join("quran-audio.json")
}
fn folder(sura: u16) -> PathBuf {
    root().join(format!("sura-{sura}"))
}
fn file(p: Position) -> PathBuf {
    folder(p.sura).join(format!("{}.mp3", p.aya))
}
fn receipt(p: Position) -> PathBuf {
    folder(p.sura).join(format!("{}.json", p.aya))
}
fn url(p: Position) -> Result<String, String> {
    Ok(format!(
        "https://cdn.islamic.network/quran/audio/48/{EDITION}/{}.mp3",
        number(p)?
    ))
}
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Ruta de audio inválida.")?;
    fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear la carpeta de audio: {e}"))?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| format!("No se pudo guardar el audio: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("No se pudo reemplazar el archivo de audio: {e}")
    })
}
#[derive(Clone, Serialize, Deserialize)]
struct Saved {
    edition: String,
    last: Option<Position>,
    volume: u8,
}
#[derive(Clone, Serialize, Deserialize)]
struct Receipt {
    edition: String,
    sura: u16,
    aya: u16,
    bytes: u64,
    sha256: String,
    source: String,
}
#[derive(Clone, Default, Serialize)]
struct Download {
    sura: Option<u16>,
    phase: String,
    completed: u16,
    total: u16,
    bytes: u64,
    error: String,
}
struct Inner {
    saved: Saved,
    phase: String,
    position: Option<Position>,
    error: String,
    interrupted: bool,
    session: u64,
    player: Option<Arc<rodio::Player>>,
    download: Download,
}
struct Engine {
    inner: Mutex<Inner>,
    cancel: AtomicBool,
}
fn engine() -> Result<&'static Arc<Engine>, String> {
    static ENGINE: OnceLock<Result<Arc<Engine>, String>> = OnceLock::new();
    ENGINE.get_or_init(|| {
        // Solo hay una instancia de escritorio; una transferencia de un proceso anterior
        // no es una descarga utilizable y no debe acumularse entre reinicios.
        if let Ok(entries) = fs::read_dir(root()) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                if name.to_string_lossy().starts_with("transfer-") && name.to_string_lossy().ends_with(".part") {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
        let saved: Saved = match fs::read(state_path()) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("El estado de escucha no es válido; se conservó el archivo: {e}"))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Saved { edition: EDITION.into(), last: None, volume: 70 },
            Err(e) => return Err(format!("No se pudo leer el punto de escucha: {e}")),
        };
        if saved.edition != EDITION || saved.volume > 100 { return Err("El estado de escucha tiene una edición o volumen inválidos; se conservó el archivo.".into()); }
        if let Some(p) = saved.last { number(p)?; }
        Ok(Arc::new(Engine { inner: Mutex::new(Inner { saved, phase: "stopped".into(), position: None, error: String::new(), interrupted: false, session: 0, player: None, download: Download::default() }), cancel: AtomicBool::new(false) }))
    }).as_ref().map_err(Clone::clone)
}
fn save(saved: &Saved) -> Result<(), String> {
    atomic_write(
        &state_path(),
        &serde_json::to_vec_pretty(saved).map_err(|e| e.to_string())?,
    )
}
fn decode(bytes: Vec<u8>) -> Result<rodio::Decoder<Cursor<Vec<u8>>>, String> {
    rodio::Decoder::new(Cursor::new(bytes))
        .map_err(|e| format!("No se pudo decodificar la recitación MP3: {e}"))
}
fn read_receipt(p: Position) -> Result<Option<Receipt>, String> {
    let path = receipt(p);
    match fs::read(&path) {
        Ok(bytes) => {
            if bytes.len() > 4096 {
                return Err(
                    "El manifiesto del audio no es válido; eliminá y descargá esa sura nuevamente."
                        .into(),
                );
            }
            let r: Receipt = serde_json::from_slice(&bytes).map_err(|_| {
                "Manifiesto de audio ilegible; eliminá y descargá esa sura nuevamente."
            })?;
            if r.edition != EDITION
                || r.sura != p.sura
                || r.aya != p.aya
                || r.bytes == 0
                || r.bytes > MAX_FILE
                || r.source != url(p)?
            {
                return Err(
                    "Manifiesto de audio inconsistente; eliminá y descargá esa sura nuevamente."
                        .into(),
                );
            }
            Ok(Some(r))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("No se pudo leer el manifiesto del audio: {e}")),
    }
}
fn cached(p: Position) -> Result<Option<Vec<u8>>, String> {
    let _storage = STORAGE
        .lock()
        .map_err(|_| "Almacenamiento de audio ocupado.")?;
    let Some(r) = read_receipt(p)? else {
        return Ok(None);
    };
    let metadata = fs::metadata(file(p))
        .map_err(|_| "Falta un archivo descargado; eliminá y descargá esa sura nuevamente.")?;
    if metadata.len() != r.bytes {
        return Err("El audio descargado cambió de tamaño; descargá nuevamente la sura.".into());
    }
    let bytes = fs::read(file(p)).map_err(|e| e.to_string())?;
    if format!("{:x}", Sha256::digest(&bytes)) != r.sha256 {
        return Err(
            "El audio descargado no coincide con su SHA-256; descargá nuevamente la sura.".into(),
        );
    }
    Ok(Some(bytes))
}
fn fetch(p: Position, cancelled: impl Fn() -> bool) -> Result<Vec<u8>, String> {
    if cancelled() {
        return Err("Operación cancelada.".into());
    }
    // Una ruta temporal diferente por operación: reproducción y descarga no pisan archivos.
    fs::create_dir_all(root()).map_err(|e| e.to_string())?;
    let temp = root().join(format!(
        "transfer-{}-{}.part",
        std::process::id(),
        TEMP_ID.fetch_add(1, Ordering::Relaxed)
    ));
    let mut command = Command::new("curl");
    command
        .args([
            "--disable",
            "--fail",
            "--silent",
            "--show-error",
            "--proto",
            "=https",
            "--connect-timeout",
            "10",
            "--max-time",
            "45",
            "--max-filesize",
            &MAX_FILE.to_string(),
            "--output",
        ])
        .arg(&temp)
        .arg(url(p)?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let result = (|| {
        let mut child = command
            .spawn()
            .map_err(|e| format!("No se pudo iniciar la descarga (curl): {e}"))?;
        loop {
            if cancelled() || fs::metadata(&temp).is_ok_and(|m| m.len() > MAX_FILE) {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Descarga cancelada o archivo demasiado grande.".into());
            }
            match child.try_wait() {
                Ok(Some(exit)) => {
                    if !exit.success() {
                        return Err(
                            "No se pudo descargar la recitación. Revisá la conexión y reintentá."
                                .into(),
                        );
                    }
                    break;
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(80)),
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("Error de descarga: {e}"));
                }
            }
        }
        let size = fs::metadata(&temp).map_err(|e| e.to_string())?.len();
        if size == 0 || size > MAX_FILE {
            return Err("Tamaño de audio inválido.".into());
        }
        let bytes = fs::read(&temp).map_err(|e| e.to_string())?;
        // No publicar HTML, errores del servidor ni un contenedor que rodio no reconoce.
        let mut decoder = decode(bytes.clone())?;
        if decoder.next().is_none() {
            return Err("La grabación no contiene audio decodificable.".into());
        }
        Ok(bytes)
    })();
    let _ = fs::remove_file(temp);
    result
}
fn storage_size() -> u64 {
    (1..=114)
        .filter_map(|s| fs::read_dir(folder(s)).ok())
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| entry.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}
fn store(p: Position, bytes: &[u8]) -> Result<(), String> {
    let _storage = STORAGE
        .lock()
        .map_err(|_| "Almacenamiento de audio ocupado.")?;
    if storage_size().saturating_sub(fs::metadata(file(p)).map_or(0, |m| m.len()))
        + bytes.len() as u64
        > MAX_LIBRARY
    {
        return Err(
            "Se alcanzó el límite de 1 GiB de audio. Eliminá alguna sura para continuar.".into(),
        );
    }
    let r = Receipt {
        edition: EDITION.into(),
        sura: p.sura,
        aya: p.aya,
        bytes: bytes.len() as u64,
        sha256: format!("{:x}", Sha256::digest(bytes)),
        source: url(p)?,
    };
    atomic_write(&file(p), bytes)?;
    atomic_write(
        &receipt(p),
        &serde_json::to_vec_pretty(&r).map_err(|e| e.to_string())?,
    )?;
    atomic_write(
        &root().join("provenance.json"),
        include_bytes!("../../public/quran/audio-provenance.json"),
    )
}
fn fail(e: &Engine, session: u64, error: String) {
    if let Ok(mut i) = e.inner.lock() {
        if i.session == session {
            i.phase = "error".into();
            i.error = error;
            if let Some(p) = i.player.take() {
                p.stop();
            }
        }
    }
}
fn playback(e: Arc<Engine>, session: u64, mut p: Position) {
    let result = (|| -> Result<(), String> {
        let mut device = rodio::DeviceSinkBuilder::open_default_sink()
            .map_err(|e| format!("Dispositivo de audio: {e}"))?;
        device.log_on_drop(false);
        loop {
            {
                let mut i = e
                    .inner
                    .lock()
                    .map_err(|_| "No se pudo acceder a la escucha.")?;
                if i.session != session {
                    return Ok(());
                }
                i.position = Some(p);
                if i.phase != "paused" {
                    i.phase = "loading".into();
                }
            }
            let bytes = match cached(p)? {
                Some(bytes) => bytes,
                None => fetch(p, || e.inner.lock().map_or(true, |i| i.session != session))?,
            };
            let source = decode(bytes)?;
            let player = Arc::new(rodio::Player::connect_new(device.mixer()));
            {
                let _coordinate = crate::audio::COORDINATION
                    .lock()
                    .map_err(|_| "No se pudo coordinar el audio.")?;
                let mut i = e
                    .inner
                    .lock()
                    .map_err(|_| "No se pudo acceder a la escucha.")?;
                if i.session != session {
                    return Ok(());
                }
                let mut saved = i.saved.clone();
                saved.last = Some(p);
                save(&saved)?;
                i.saved = saved;
                if crate::audio::is_playing() {
                    i.phase = "paused".into();
                    i.interrupted = true;
                }
                if i.phase == "paused" {
                    player.pause();
                } else {
                    i.phase = "playing".into();
                }
                player.set_volume(i.saved.volume as f32 / 100.0);
                player.append(source);
                i.player = Some(player.clone());
            }
            loop {
                std::thread::sleep(Duration::from_millis(100));
                let mut i = e
                    .inner
                    .lock()
                    .map_err(|_| "No se pudo acceder a la escucha.")?;
                if i.session != session {
                    player.stop();
                    return Ok(());
                }
                // No avanzar mientras una pausa coincide con el final de un archivo.
                if i.phase != "paused" && player.empty() {
                    i.player = None;
                    if p.aya == count(p.sura)? {
                        i.phase = "finished".into();
                        return Ok(());
                    }
                    p.aya += 1;
                    break;
                }
            }
        }
    })();
    if let Err(error) = result {
        fail(&e, session, error);
    }
}
fn start(p: Position, preserve_pause: bool) -> Result<(), String> {
    number(p)?;
    let e = engine()?.clone();
    let session = {
        let _coordinate = crate::audio::COORDINATION
            .lock()
            .map_err(|_| "No se pudo coordinar el audio.")?;
        if crate::audio::is_playing() {
            return Err("Hay un aviso de rezo activo. Esperá o detenelo antes de escuchar.".into());
        }
        let mut i = e
            .inner
            .lock()
            .map_err(|_| "No se pudo acceder a la escucha.")?;
        if let Some(player) = i.player.take() {
            player.stop();
        }
        let paused = preserve_pause && i.phase == "paused";
        i.session += 1;
        i.position = Some(p);
        i.phase = if paused { "paused" } else { "loading" }.into();
        i.error.clear();
        if !paused {
            i.interrupted = false;
        }
        i.session
    };
    std::thread::spawn(move || playback(e, session, p));
    Ok(())
}
/// Se invoca bajo el coordinador común antes de comenzar Adhan o tonos.
pub(crate) fn interrupt() {
    if let Ok(e) = engine() {
        if let Ok(mut i) = e.inner.lock() {
            if matches!(i.phase.as_str(), "playing" | "loading" | "paused") {
                if let Some(p) = &i.player {
                    p.pause();
                }
                i.phase = "paused".into();
                i.interrupted = true;
            }
        }
    }
}
pub fn stop() {
    if let Ok(e) = engine() {
        if let Ok(mut i) = e.inner.lock() {
            i.session += 1;
            if let Some(p) = i.player.take() {
                p.stop();
            }
            i.phase = "stopped".into();
            i.interrupted = false;
        }
    }
}
fn download(sura: u16) -> Result<(), String> {
    let total = count(sura)?;
    let e = engine()?.clone();
    {
        let mut i = e
            .inner
            .lock()
            .map_err(|_| "No se pudo acceder a las descargas.")?;
        if i.download.phase == "downloading" {
            return Err("Ya hay una descarga en curso.".into());
        }
        if offline(sura)?.completed == total {
            return Err("Esta sura ya está disponible sin conexión.".into());
        }
        e.cancel.store(false, Ordering::Relaxed);
        i.download = Download {
            sura: Some(sura),
            phase: "downloading".into(),
            total,
            ..Default::default()
        };
    }
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let mut size = 0;
            for aya in 1..=total {
                if e.cancel.load(Ordering::Relaxed) {
                    return Err("Descarga cancelada; se conservaron las aleyas verificadas.".into());
                }
                let p = Position { sura, aya };
                let bytes = match cached(p)? {
                    Some(b) => b,
                    None => fetch(p, || e.cancel.load(Ordering::Relaxed))?,
                };
                size += bytes.len() as u64;
                if size > MAX_SURA {
                    return Err("La sura supera el límite de 300 MiB.".into());
                }
                if e.cancel.load(Ordering::Relaxed) {
                    return Err("Descarga cancelada; se conservaron las aleyas verificadas.".into());
                }
                store(p, &bytes)?;
                if let Ok(mut i) = e.inner.lock() {
                    i.download.completed = aya;
                    i.download.bytes = size;
                }
                // Peticiones secuenciales y moderadas al proveedor.
                std::thread::sleep(Duration::from_millis(150));
            }
            Ok(())
        })();
        if let Ok(mut i) = e.inner.lock() {
            i.download.phase = if result.is_ok() {
                "complete"
            } else if e.cancel.load(Ordering::Relaxed) {
                "cancelled"
            } else {
                "error"
            }
            .into();
            i.download.error = result.err().unwrap_or_default();
        }
    });
    Ok(())
}
#[derive(Serialize)]
struct Offline {
    sura: u16,
    completed: u16,
    total: u16,
    bytes: u64,
}
fn offline(sura: u16) -> Result<Offline, String> {
    let _storage = STORAGE
        .lock()
        .map_err(|_| "Almacenamiento de audio ocupado.")?;
    let mut state = Offline {
        sura,
        completed: 0,
        total: count(sura)?,
        bytes: 0,
    };
    for aya in 1..=state.total {
        let p = Position { sura, aya };
        if let Some(r) = read_receipt(p)? {
            if fs::metadata(file(p)).is_ok_and(|m| m.is_file() && m.len() == r.bytes) {
                state.completed += 1;
                state.bytes += r.bytes;
            }
        }
    }
    Ok(state)
}
pub fn status(sura: u16) -> Result<serde_json::Value, String> {
    let e = engine()?;
    count(sura)?;
    let (offline, storage_error) = match offline(sura) {
        Ok(value) => (value, String::new()),
        Err(error) => (
            Offline {
                sura,
                completed: 0,
                total: count(sura)?,
                bytes: 0,
            },
            error,
        ),
    };
    let i = e
        .inner
        .lock()
        .map_err(|_| "No se pudo acceder a la escucha.")?;
    Ok(
        serde_json::json!({ "phase": i.phase, "position": i.position, "last": i.saved.last, "volume": i.saved.volume, "error": i.error, "interrupted": i.interrupted, "download": i.download, "offline": offline, "storage_error": storage_error }),
    )
}
pub fn control(
    action: &str,
    sura: Option<u16>,
    aya: Option<u16>,
    volume: Option<u8>,
) -> Result<(), String> {
    let e = engine()?;
    match action {
        "play" => start(
            Position {
                sura: sura.ok_or("Falta la sura.")?,
                aya: aya.ok_or("Falta la aleya.")?,
            },
            false,
        ),
        "stop" => {
            stop();
            Ok(())
        }
        "pause" => {
            let mut i = e
                .inner
                .lock()
                .map_err(|_| "No se pudo acceder a la escucha.")?;
            if matches!(i.phase.as_str(), "playing" | "loading") {
                if let Some(p) = &i.player {
                    p.pause();
                }
                i.phase = "paused".into();
            }
            Ok(())
        }
        "resume" => {
            let _coordinate = crate::audio::COORDINATION
                .lock()
                .map_err(|_| "No se pudo coordinar el audio.")?;
            if crate::audio::is_playing() {
                return Err("El aviso de rezo todavía está sonando.".into());
            }
            let mut i = e
                .inner
                .lock()
                .map_err(|_| "No se pudo acceder a la escucha.")?;
            if i.phase == "paused" {
                if let Some(p) = &i.player {
                    p.play();
                    i.phase = "playing".into();
                } else {
                    i.phase = "loading".into();
                }
                i.interrupted = false;
            }
            Ok(())
        }
        "previous" | "next" | "retry" | "retake" => {
            let mut p = {
                let i = e
                    .inner
                    .lock()
                    .map_err(|_| "No se pudo acceder a la escucha.")?;
                if action == "retake" {
                    i.saved.last
                } else {
                    i.position.or(i.saved.last)
                }
            }
            .ok_or("Todavía no hay un punto de escucha.")?;
            if action == "previous" {
                p.aya = p.aya.saturating_sub(1).max(1);
            }
            if action == "next" {
                if p.aya >= count(p.sura)? {
                    return Err("Llegaste al final de la sura.".into());
                }
                p.aya += 1;
            }
            start(p, matches!(action, "previous" | "next"))
        }
        "volume" => {
            let volume = volume
                .filter(|v| *v <= 100)
                .ok_or("Volumen fuera de rango.")?;
            let mut i = e
                .inner
                .lock()
                .map_err(|_| "No se pudo acceder a la escucha.")?;
            let mut saved = i.saved.clone();
            saved.volume = volume;
            save(&saved)?;
            i.saved = saved;
            if let Some(p) = &i.player {
                p.set_volume(volume as f32 / 100.0);
            }
            Ok(())
        }
        "download" => download(sura.ok_or("Falta la sura.")?),
        "cancel" => {
            e.cancel.store(true, Ordering::Relaxed);
            Ok(())
        }
        "delete" => {
            let sura = sura.ok_or("Falta la sura.")?;
            count(sura)?;
            let mut i = e
                .inner
                .lock()
                .map_err(|_| "No se pudo acceder a la escucha.")?;
            if i.download.phase == "downloading" {
                return Err("Esperá o cancelá la descarga antes de eliminar audio.".into());
            }
            let _storage = STORAGE
                .lock()
                .map_err(|_| "Almacenamiento de audio ocupado.")?;
            match fs::remove_dir_all(folder(sura)) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("No se pudo eliminar el audio: {e}")),
            }
            if i.download.sura == Some(sura) {
                i.download = Download::default();
            }
            Ok(())
        }
        _ => Err("Acción de recitación desconocida.".into()),
    }
}
