//! Self-updater (leve, sin plugins externos): consulta la API de Releases de
//! GitHub con `curl` del sistema y, si hay versión nueva, informa en la UI.
//! Sobre AppImage descarga, sustituye y relanza. Con el paquete .deb y en
//! Windows descarga el paquete, lo verifica contra `SHA256SUMS` y lo instala:
//! `pkexec apt-get install` (pide la contraseña del sistema) o el instalador
//! NSIS en modo actualización (`/P /UPDATE /R`: sin páginas, sin desinstalar).
//!
//! Trade-off documentado: sin verificación minisign (el updater oficial de
//! tauri está atascado: todo el árbol zip 4.x está yanked y sus versiones lo
//! requieren). La integridad queda dada por HTTPS + GitHub, la comparación
//! de versión semántica y, en Windows, el SHA-256 publicado en la release.

#[cfg(any(target_os = "linux", target_os = "windows"))]
use crate::log;
use serde::Deserialize;
use std::sync::Mutex;
use std::sync::OnceLock;

pub const REPO: &str = "MarcosRehtanz/adhan-companion";
pub const URL_RELEASES: &str = "https://github.com/MarcosRehtanz/adhan-companion/releases/latest";

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct Disponible {
    /// versión nueva (sin 'v'; ej "0.1.6")
    pub version: String,
    /// Página del release para descargas manuales.
    pub url: String,
    /// nombre del asset AppImage si la release lo ofrece, con su URL
    pub appimage: Option<String>,
    /// instalador NSIS de Windows si el release lo ofrece
    pub windows_installer: Option<String>,
    /// paquete .deb de Linux si el release lo ofrece
    pub deb: Option<String>,
    /// `SHA256SUMS` de la release: verifica el paquete antes de instalarlo
    pub checksums: Option<String>,
    /// artistas: notas del release (primera línea)
    pub notas: String,
}

/// Último chequeo — consulta la banda de Actualizaciones en la UI
pub static ESTADO: OnceLock<Mutex<Option<Disponible>>> = OnceLock::new();
pub fn estado() -> &'static Mutex<Option<Disponible>> {
    ESTADO.get_or_init(|| Mutex::new(None))
}

pub fn versión_actual() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn semver_parse(v: &str) -> Option<(u32, u32, u32)> {
    let t = v.trim().trim_start_matches('v');
    let mut it = t.split('.');
    let a = it.next()?.parse().ok()?;
    let b = it.next()?.parse().ok()?;
    let c = it.next()?.parse().ok()?;
    Some((a, b, c))
}

/// true si `nueva` es mayor que `actual`
fn es_mas_nueva(nueva: &str, actual: &str) -> bool {
    match (semver_parse(nueva), semver_parse(actual)) {
        (Some(n), Some(a)) => n > a,
        _ => false,
    }
}

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    assets: Vec<Asset>,
}

#[derive(Debug, Deserialize)]
struct Asset {
    name: String,
    #[serde(rename = "browser_download_url")]
    url: String,
}

/// `curl` del sistema sin abrir una consola en Windows (la app es de subsistema GUI).
fn curl() -> std::process::Command {
    #[allow(unused_mut)]
    let mut command = std::process::Command::new("curl");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
}

/// Consulta el último release (API de GitHub con curl del sistema)
fn fetch_latest() -> Result<Release, String> {
    let out = curl()
        .args([
            "-fsSL",
            "--connect-timeout", "5",
            "--max-time", "15",
            "-H",
            "Accept: application/vnd.github+json",
            &format!("https://api.github.com/repos/{REPO}/releases/latest"),
        ])
        .output()
        .map_err(|e| format!("curl no disponible: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "GitHub API: HTTP {}",
            out.status.code().unwrap_or(0)
        ));
    }
    serde_json::from_slice::<Release>(&out.stdout)
        .map_err(|e| format!("JSON del release inválido: {e}"))
}

/// Chequeo: compara la semver del último release con la versión del binario.
/// `Ok(None)` = al día; `Ok(Some(info))` = hay versión nueva (estado guardado
/// para la UI + notificación hecha por el caller).
#[derive(serde::Serialize, Default)]
struct Operation { phase: String, error: String }
static OPERATION: OnceLock<Mutex<Operation>> = OnceLock::new();
static OPERATION_LOCK: Mutex<()> = Mutex::new(());
fn operation() -> &'static Mutex<Operation> { OPERATION.get_or_init(|| Mutex::new(Operation { phase: "idle".into(), error: String::new() })) }
fn progress(phase: &str, error: String) {
    if let Ok(mut state) = operation().lock() { state.phase = phase.into(); state.error = error; }
}
pub fn status() -> Result<serde_json::Value, String> {
    let op = operation().lock().map_err(|_| "No se pudo consultar el actualizador.")?;
    let candidate = estado().lock().map_err(|_| "No se pudo consultar la versión disponible.")?.clone();
    Ok(serde_json::json!({"phase": op.phase, "error": op.error, "candidate": candidate}))
}
pub fn verificar() -> Result<Option<Disponible>, String> {
    let _lock = OPERATION_LOCK.try_lock().map_err(|_| "Ya hay una operación del actualizador en curso.")?;
    progress("checking", String::new());
    let result = verificar_inner();
    match &result {
        Ok(Some(_)) => progress("available", String::new()),
        Ok(None) => progress("current", String::new()),
        Err(error) => { *estado().lock().map_err(|_| "No se pudo actualizar el estado.")? = None; progress("error", error.clone()); }
    }
    result
}
fn verificar_inner() -> Result<Option<Disponible>, String> {
    let actual = versión_actual();
    let release = fetch_latest()?;
    let nueva = release.tag_name.trim_start_matches('v');
    if !es_mas_nueva(nueva, &actual) {
        *estado().lock().unwrap() = None;
        return Ok(None);
    }
    let info = Disponible {
        version: nueva.to_string(),
        url: URL_RELEASES.to_string(),
        appimage: release
            .assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with(".appimage"))
            .map(|a| a.url.clone()),
        windows_installer: release
            .assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with("-setup.exe"))
            .or_else(|| release.assets.iter().find(|a| a.name.to_lowercase().ends_with(".msi")))
            .map(|a| a.url.clone()),
        deb: release
            .assets
            .iter()
            .find(|a| a.name.to_lowercase().ends_with("_amd64.deb"))
            .map(|a| a.url.clone()),
        checksums: release
            .assets
            .iter()
            .find(|a| a.name == "SHA256SUMS")
            .map(|a| a.url.clone()),
        notas: release.body.unwrap_or_default().lines().next().unwrap_or("").to_string(),
    };
    *estado().lock().unwrap() = Some(info.clone());
    Ok(Some(info))
}

/// ¿El binario actual corre como AppImage? (decide si el self-update
/// puede sustituirse a sí mismo o hay que mandar al manual)
pub fn es_appimage() -> bool {
    std::env::var("APPIMAGE")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}

pub fn es_windows() -> bool {
    cfg!(target_os = "windows")
}

/// ¿Instalación del paquete .deb? (el binario de /usr/bin registrado por dpkg)
pub fn es_deb() -> bool {
    #[cfg(target_os = "linux")]
    {
        !es_appimage()
            && std::env::current_exe().is_ok_and(|p| p == std::path::Path::new("/usr/bin/adhan-companion"))
            && std::process::Command::new("dpkg-query")
                .args(["-W", "-f=${Status}", "adhan-companion"])
                .output()
                .is_ok_and(|o| o.status.success() && String::from_utf8_lossy(&o.stdout).ends_with(" installed"))
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

/// Instalación self-update sobre AppImage: baja junto al archivo actual, chmod +x,
/// reemplaza el actual y relanza. En una instalación .deb NO aplica —
/// error manejable en la UI con el instructivo manual.
#[cfg(target_os = "linux")]
pub fn instalar() -> Result<(), String> {
    let _lock = OPERATION_LOCK.try_lock().map_err(|_| "Ya hay una operación del actualizador en curso.")?;
    progress("installing", String::new());
    let result = instalar_inner();
    if let Err(error) = &result { progress("error", error.clone()); }
    result
}
#[cfg(target_os = "linux")]
fn instalar_inner() -> Result<(), String> {
    if es_deb() {
        return instalar_deb();
    }
    if !es_appimage() {
        return Err(
            "instalación automática solo con AppImage o el paquete .deb — para otras instalaciones \
             descargá el release de GitHub"
                .into(),
        );
    }
    let info = estado()
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no hay actualización pendiente de instalar".to_string())?;
    let appimage_url = info
        .appimage
        .ok_or_else(|| "el release no trae AppImage para el auto-update".to_string())?;
    let appimage = std::env::var_os("APPIMAGE")
        .map(std::path::PathBuf::from)
        .ok_or_else(|| "no encuentro la ruta del archivo AppImage actual".to_string())?
        .canonicalize()
        .map_err(|e| format!("no pude resolver la ruta de la AppImage: {e}"))?;
    let tmp = appimage.with_file_name(format!(".adhan-update-{}.AppImage", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    descargar(&appimage_url, &tmp, MAX_DESCARGA)?;

    std::fs::set_permissions(&tmp, {
        #[cfg(unix)]
        {
        use std::os::unix::fs::PermissionsExt;
        std::fs::Permissions::from_mode(0o755)
        }
    })
    .map_err(|e| format!("chmod del nuevo AppImage: {e}"))?;
    let backup = appimage.with_extension("appimage-old");
    if backup.exists() {
        let _ = std::fs::remove_file(&backup);
    }
    std::fs::rename(&appimage, &backup).map_err(|e| format!("respaldo de la AppImage: {e}"))?;
    if let Err(e) = std::fs::rename(&tmp, &appimage) {
        let _ = std::fs::rename(&backup, &appimage);
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("instalar el nuevo AppImage: {e}"));
    }

    log!("updater: v{} instalada — relanzando", info.version);
    if let Err(e) = std::process::Command::new(&appimage).spawn() {
        let _ = std::fs::remove_file(&appimage);
        let _ = std::fs::rename(&backup, &appimage);
        return Err(format!("no pude iniciar la nueva AppImage: {e}"));
    }
    std::process::exit(0);
    #[allow(unreachable_code)]
    Ok(())
}

/// Windows: descarga el instalador NSIS, lo verifica contra `SHA256SUMS` y lo
/// ejecuta en modo actualización. El instalador por defecto ofrece «Desinstalar
/// antes de instalar»; `/UPDATE` instala encima, conserva accesos directos y el
/// inicio automático, `/P` evita las páginas y cierra esta instancia, y `/R`
/// reabre la app al terminar. Los datos viven en `%APPDATA%\Adhan Companion` y
/// no se tocan.
#[cfg(target_os = "windows")]
pub fn instalar() -> Result<(), String> {
    let _lock = OPERATION_LOCK.try_lock().map_err(|_| "Ya hay una operación del actualizador en curso.")?;
    progress("installing", String::new());
    let result = instalar_windows();
    if let Err(error) = &result { progress("error", error.clone()); }
    result
}
#[cfg(target_os = "windows")]
fn instalar_windows() -> Result<(), String> {
    let info = estado()
        .lock()
        .map_err(|_| "No se pudo consultar la versión disponible.")?
        .clone()
        .ok_or("no hay actualización pendiente de instalar")?;
    let url = info
        .windows_installer
        .filter(|u| u.to_lowercase().ends_with("-setup.exe"))
        .ok_or("el release no trae el instalador de Windows")?;
    let sumas = info
        .checksums
        .ok_or("el release no publica SHA256SUMS para verificar el instalador")?;
    let instalador = descargar_verificado(&url, &sumas)?;
    log!("updater: v{} verificada — ejecutando el instalador", info.version);
    std::process::Command::new(&instalador)
        .args(["/P", "/UPDATE", "/R"])
        .spawn()
        .map_err(|e| format!("no se pudo iniciar el instalador: {e}"))?;
    // El instalador reemplaza el ejecutable: esta instancia termina antes.
    std::process::exit(0);
}

/// Paquete .deb: lo verifica y lo instala con `pkexec apt-get install`, que
/// muestra la ventana de contraseña del escritorio y resuelve dependencias.
/// Después reabre la app desde el binario nuevo, cuando esta instancia ya
/// cerró (la app es de instancia única).
#[cfg(target_os = "linux")]
fn instalar_deb() -> Result<(), String> {
    use std::process::{Command, Stdio};
    let info = estado()
        .lock()
        .map_err(|_| "No se pudo consultar la versión disponible.")?
        .clone()
        .ok_or("no hay actualización pendiente de instalar")?;
    let url = info.deb.ok_or("el release no trae el paquete .deb")?;
    let sumas = info
        .checksums
        .ok_or("el release no publica SHA256SUMS para verificar el paquete")?;
    let paquete = descargar_verificado(&url, &sumas)?;
    let salida = Command::new("pkexec")
        .args(["/usr/bin/apt-get", "install", "-y"])
        .arg(&paquete)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("pkexec no disponible: {e}"));
    if let Some(carpeta) = paquete.parent() {
        let _ = std::fs::remove_dir_all(carpeta);
    }
    let salida = salida?;
    match salida.status.code() {
        Some(0) => {}
        Some(126) => return Err("Se canceló la autorización; la versión instalada no cambió.".into()),
        Some(127) => {
            return Err("No se pudo autorizar la instalación (contraseña incorrecta o sin ventana de autenticación del escritorio). \
                        Podés instalar el .deb desde GitHub Releases."
                .into())
        }
        _ => {
            let detalle = String::from_utf8_lossy(&salida.stderr);
            let linea = detalle
                .lines()
                .rev()
                .find(|l| l.starts_with("E:"))
                .or_else(|| detalle.lines().rev().find(|l| !l.trim().is_empty()))
                .unwrap_or("error desconocido");
            return Err(format!("apt no pudo instalar el paquete: {linea}"));
        }
    }
    log!("updater: v{} instalada con apt — reabriendo", info.version);
    Command::new("sh")
        .args(["-c", "sleep 2; exec /usr/bin/adhan-companion"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("instalada, pero no se pudo reabrir la app: {e}"))?;
    std::process::exit(0);
}

/// Descarga `url` y la verifica contra la línea de `SHA256SUMS` con su nombre.
/// Devuelve la ruta del archivo verificado, en una carpeta propia que se vacía
/// en cada intento.
#[cfg(any(target_os = "linux", target_os = "windows"))]
fn descargar_verificado(url: &str, sumas: &str) -> Result<std::path::PathBuf, String> {
    use sha2::{Digest, Sha256};
    let nombre = url
        .rsplit('/')
        .next()
        .filter(|n| !n.is_empty())
        .ok_or("URL de descarga inválida")?
        .to_string();
    let carpeta = carpeta_descarga();
    let _ = std::fs::remove_dir_all(&carpeta);
    let mut crear = std::fs::DirBuilder::new();
    crear.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        crear.mode(0o700);
    }
    crear.create(&carpeta).map_err(|e| format!("carpeta de descarga: {e}"))?;
    let lista = carpeta.join("SHA256SUMS");
    descargar(sumas, &lista, 64 * 1024)?;
    let esperado = std::fs::read_to_string(&lista)
        .map_err(|e| format!("SHA256SUMS ilegible: {e}"))?
        .lines()
        .find_map(|linea| {
            let mut partes = linea.split_whitespace();
            let hash = partes.next()?;
            (partes.next()?.trim_start_matches('*') == nombre).then(|| hash.to_lowercase())
        })
        .ok_or("SHA256SUMS no incluye el paquete de esta plataforma")?;
    let archivo = carpeta.join(&nombre);
    descargar(url, &archivo, MAX_DESCARGA)?;
    let bytes = std::fs::read(&archivo).map_err(|e| format!("paquete descargado: {e}"))?;
    if format!("{:x}", Sha256::digest(&bytes)) != esperado {
        let _ = std::fs::remove_dir_all(&carpeta);
        return Err("El paquete descargado no coincide con su SHA-256; no se instaló.".into());
    }
    Ok(archivo)
}

/// Carpeta de descargas del actualizador: caché del usuario en Linux (no la
/// /tmp compartida) y %TEMP% del usuario en Windows.
#[cfg(any(target_os = "linux", target_os = "windows"))]
fn carpeta_descarga() -> std::path::PathBuf {
    #[cfg(target_os = "linux")]
    let base = std::env::var_os("XDG_CACHE_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".cache")))
        .unwrap_or_else(std::env::temp_dir);
    #[cfg(target_os = "windows")]
    let base = std::env::temp_dir();
    base.join("adhan-companion-update")
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub fn instalar() -> Result<(), String> {
    Err("la actualización automática solo está disponible para AppImage en Linux y en Windows".into())
}

/// Tope de un paquete descargado (AppImage o instalador de Windows).
#[cfg(any(target_os = "linux", target_os = "windows"))]
const MAX_DESCARGA: u64 = 512 * 1024 * 1024;

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn descargar(url: &str, destino: &std::path::Path, max: u64) -> Result<(), String> {
    let out = curl()
        .args(["-fsSL", "--proto", "=https", "--connect-timeout", "5", "--max-time", "300", "--max-filesize"])
        .arg(max.to_string())
        .arg("-o")
        .arg(destino)
        .arg(url)
        .status()
        .map_err(|e| format!("curl no disponible: {e}"))?;
    if !out.success() {
        return Err("No se pudo descargar la actualización. Revisá la conexión y reintentá.".into());
    }
    Ok(())
}
