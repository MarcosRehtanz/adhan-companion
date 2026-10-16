//! Self-updater (leve, sin plugins externos): consulta la API de Releases de
//! GitHub con `curl` del sistema y, si hay versión nueva, informa en la UI
//! (y sobre AppImage: descarga, sustituye y relanza).
//!
//! Trade-off documentado: sin verificación minisign (el updater oficial de
//! tauri está atascado: todo el árbol zip 4.x está yanked y sus versiones lo
//! requieren). La integridad queda dada por HTTPS + GitHub y la comparación
//! de versión semántica.

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
    /// URL mandada al release para descarga manual (.deb)
    pub url: String,
    /// nombre del asset AppImage si la release lo ofrece, con su URL
    pub appimage: Option<String>,
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

/// Consulta el último release (API de GitHub con curl del sistema)
fn fetch_latest() -> Result<Release, String> {
    let out = std::process::Command::new("curl")
        .args([
            "-fsSL",
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
pub fn verificar() -> Result<Option<Disponible>, String> {
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
        notas: release.body.unwrap_or_default().lines().next().unwrap_or("").to_string(),
    };
    *estado().lock().unwrap() = Some(info.clone());
    Ok(Some(info))
}

/// ¿El binario actual corre como AppImage? (decide si el self-update
/// puede sustituirse a sí mismo o hay que mandar al manual)
fn es_appimage() -> bool {
    std::env::var("APPIMAGE")
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}

/// Instalación self-update sobre AppImage: baja el nuevo a /tmp, chmod +x,
/// reemplaza el actual y relanza. En una instalación .deb NO aplica —
/// error manejable en la UI con el instructivo manual.
pub fn instalar() -> Result<(), String> {
    if !es_appimage() {
        return Err(
            "instalación automática solo sobre AppImage — para el .deb descargá el release de \
             GitHub e instalás con dpkg -i"
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
    let n = appimage_url.rsplit('/').next().unwrap_or("adhan-updating.AppImage");
    let tmp = format!("/tmp/{n}");

    descargar(&appimage_url, &tmp)?;

    let exe = std::env::current_exe()
        .map_err(|e| format!("no pude resolvér el binario: {e}"))?;
    let exe = exe.canonicalize().map_err(|e| e.to_string())?;
    std::fs::set_permissions(&tmp, {
        use std::os::unix::fs::PermissionsExt;
        std::fs::Permissions::from_mode(0o755)
    })
    .map_err(|e| format!("chmod del nuevo AppImage: {e}"))?;
    let backup = exe.with_extension("appimage-old");
    if backup.exists() {
        let _ = std::fs::remove_file(&backup);
    }
    std::fs::rename(&exe, &backup).map_err(|e| format!("swap del AppImage: {e}"))?;
    std::fs::rename(&tmp, &exe).map_err(|e| format!("instalar el nuevo AppImage: {e}"))?;

    log!("updater: v{} instalada — relanzando", info.version);
    let _ = std::process::Command::new(&exe).spawn();
    std::process::exit(0);
    #[allow(unreachable_code)]
    Ok(())
}

fn descargar(url: &str, destino: &str) -> Result<(), String> {
    let out = std::process::Command::new("curl")
        .args(["-fL", "-o", destino, url])
        .status()
        .map_err(|e| format!("curl no disponible: {e}"))?;
    if !out.success() {
        return Err(format!("descarga del release: HTTP falla del curl"));
    }
    Ok(())
}
