//! Respaldo y sincronización con Google Drive (`appDataFolder`) — escritorio.
//!
//! Diseño y decisiones en `docs/sincronizacion-google.md` (spike aprobado
//! `spikes/gdrive-sync/spike.mjs`: OAuth desktop PKCE + loopback, refresh
//! token en el keyring del sistema, un solo archivo
//! `adhan-companion-backup.json` invisible en Drive).
//!
//! # Estados y transiciones (regla de producto: estados antes que acciones)
//!
//! **Sesión** (fuente de verdad: el keyring del sistema; el access token vive
//! sólo en memoria):
//! - `sin_sesion` → "Conectar con Google" → `conectando`.
//! - `conectando` (esperando callback del navegador, máx. 5 min): aceptar →
//!   `activa`; rechazar/timeout → `sin_sesion` con mensaje. Cancelable.
//! - `activa` → "Sincronizar ahora", "Cerrar sesión" y chequeo al arrancar.
//! - `activa → sin_sesion` sólo por logout, revocación (`invalid_grant`) o
//!   keyring suelto; siempre avisado, nunca silencioso.
//!
//! **Datos** (fuente de verdad: archivos locales + respaldo de Drive):
//! - registro (append-only): **unión por evento** segura por diseño — se
//!   agregan los eventos del respaldo que faltan; nunca se pierde un rezo.
//! - config / estado del lector: **LWW con consulta**: si difieren los datos
//!   locales del respaldo, el sync se detiene en `conflicto` hasta elección
//!   del usuario (`local` / `remota`).
//! - `restaurar_propuesta`: registro local vacío con historial remoto →
//!   oferta explícita; nunca se aplica sola.
//! - `error`: de red/cupo/keyring → mensaje + Reintentar. Un fallo del sync
//!   **jamás** bloquea la app ni borra nada local (local-first).
//!
//! Persistencia (v0.1.16): conflicto/restauración viven en memoria y se
//! reconstruyen del respaldo real; la fecha persistida de última sync llega
//! en v0.1.17 con la subida diferida.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read as _;
use std::io::Write as _;
use std::sync::{Mutex, OnceLock};
use tauri::Manager as _;

use crate::config::{self, Config, SharedConfig};
use crate::registro::{self, RegistroEntry};
use crate::{log, scheduler};

pub const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const DRIVE_FILES: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
pub const BACKUP_NAME: &str = "adhan-companion-backup.json";
/// Mismo service string que documentó el spike (trazabilidad del desarrollo)
const KEYRING_SERVICE: &str = "adhan-companion-google-refresh";
const KEYRING_USER: &str = "oauth";
const OAUTH_TIMEOUT_SECS: u64 = 300;
const HTTP_TIMEOUT_SECS: u64 = 30;
const CLIENT_ID_FALLBACK: &str = "credencial-no-configurada.apps.googleusercontent.com";

/// `client_id` de la credencial tipo Desktop (público por diseño). En
/// desarrollo lo exporta `build.rs` desde `.oauth.local` (fuera de Git);
/// una build sin credencial compila igual y lo informa en claro.
fn client_id() -> &'static str {
    option_env!("GOOGLE_OAUTH_CLIENT_ID").unwrap_or(CLIENT_ID_FALLBACK)
}

fn client_secret() -> Option<&'static str> {
    option_env!("GOOGLE_OAUTH_CLIENT_SECRET").filter(|s| !s.is_empty())
}

// ---------------------------------------------------------------- estado ---

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Sesion {
    SinSesion,
    Conectando,
    Activa,
}

#[derive(Debug, Clone, Serialize)]
pub struct InfoRespaldo {
    pub fecha: String,
    pub dispositivo: String,
    pub version_app: String,
    pub bytes: usize,
    pub rezos: usize,
}

/// Conflicto pendiente de elección del usuario (config o lector).
#[derive(Debug, Clone, Serialize)]
pub struct Conflicto {
    pub fecha: String,
    pub dispositivo: String,
    pub config_difiere: bool,
    pub lector_difiere: bool,
    /// qué cambió de comportamiento (para elegir con información)
    pub config_detalles: Vec<String>,
}

/// Oferta de restauración (primera vez en una máquina, registro local vacío).
#[derive(Debug, Clone, Serialize)]
pub struct RestaurarInfo {
    pub fecha: String,
    pub dispositivo: String,
    pub rezos: usize,
}

#[derive(Debug, Default, Clone)]
struct Estado {
    conectando: bool,
    respaldo: Option<InfoRespaldo>,
    conflicto: Option<Conflicto>,
    restaurar: Option<RestaurarInfo>,
    restaurar_descartada: bool,
    url_autorizacion: Option<String>,
    ultimo_error: Option<String>,
    /// ISO de la última operación completada en esta ejecución
    ultima_sync: Option<String>,
}

static ESTADO: OnceLock<Mutex<Estado>> = OnceLock::new();
fn estado() -> &'static Mutex<Estado> {
    ESTADO.get_or_init(|| Mutex::new(Estado::default()))
}

fn set_estado(f: impl FnOnce(&mut Estado)) {
    f(&mut estado().lock().unwrap());
}

/// Lo que ve el UI. La sesión se lee del keyring real (reconstruye estado al reabrir).
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct EstadoIpc {
    pub sesion: Sesion,
    pub respaldo: Option<InfoRespaldo>,
    pub conflicto: Option<Conflicto>,
    pub restaurar: Option<RestaurarInfo>,
    pub url_autorizacion: Option<String>,
    pub ultimo_error: Option<String>,
    pub ultima_sync: Option<String>,
}

// ---------------------------------------------------------------- keyring ---

/// Err(None) = sin entrada (sin sesión); Err(Some(msg)) = keyring falló de verdad.
fn token_del_keyring() -> Result<String, Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| Some(format!("keyring no disponible: {e}")))?;
    match entry.get_password() {
        Ok(t) if !t.trim().is_empty() => Ok(t),
        Ok(_) => Err(None),
        Err(keyring::Error::NoEntry) => Err(None),
        Err(e) => Err(Some(format!("keyring: {e}"))),
    }
}

fn guardar_token(refresh: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring no disponible: {e}"))?;
    entry.set_password(refresh.trim()).map_err(|e| format!("guardar token en el keyring: {e}"))
}

fn borrar_token() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring no disponible: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("borrar token del keyring: {e}")),
    }
}

// ------------------------------------------------------------------- HTTP ---

fn cliente_http() -> &'static reqwest::Client {
    static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENTE.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .expect("cliente HTTP válido")
    })
}

#[derive(Debug, Default, Deserialize)]
struct TokensJson {
    access_token: Option<String>,
    refresh_token: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

 struct Access {
    token: String,
}

async fn refresh_access(refresh: &str) -> Result<Access, String> {
    let mut pares: Vec<(&str, String)> = vec![
        ("client_id", client_id().to_string()),
        ("refresh_token", refresh.to_string()),
        ("grant_type", "refresh_token".to_string()),
    ];
    if let Some(sec) = client_secret() {
        pares.push(("client_secret", sec.to_string()));
    }
    let resp = cliente_http()
        .post(TOKEN_URL)
        .form(&pares)
        .send()
        .await
        .map_err(|e| format!("conexión con Google: {e}"))?;
    let tokens = resp.json::<TokensJson>().await.map_err(|e| format!("respuesta de Google ilegible: {e}"))?;
    match (&tokens.access_token, &tokens.error) {
        (Some(at), _) => Ok(Access { token: at.clone() }),
        (None, Some(e)) => Err(error_token(e, tokens.error_description.as_deref())),
        (None, None) => Err("Google no devolvió access token".into()),
    }
}

/// Errores típicos del endpoint de tokens, traducidos a mensajes accionables.
fn error_token(error: &str, detalle: Option<&str>) -> String {
    match error {
        "invalid_grant" => "el acceso venció o fue revocado — conectá la cuenta de nuevo".into(),
        "invalid_client" => "credencial de Google inválida (client_id/secret)".into(),
        "access_denied" => "Google rechazó la autorización (revisá permisos de la cuenta)".into(),
        other => match detalle {
            Some(d) => format!("Google: {other} — {d}"),
            None => format!("Google: {other}"),
        },
    }
}

// ------------------------------------------------------------------- OAuth ---

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn azar(n: usize) -> Result<Vec<u8>, String> {
    let mut buf = vec![0u8; n];
    getrandom::fill(&mut buf).map_err(|e| format!("entropía del sistema: {e}"))?;
    Ok(buf)
}

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn auth_url(challenge: &str, state: &str, redirect: &str) -> String {
    format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}&code_challenge={}&code_challenge_method=S256",
        urlencode(client_id()),
        urlencode(redirect),
        urlencode(SCOPE),
        urlencode(state),
        urlencode(challenge),
    )
}

/// Abre el navegador del sistema (desktop: Linux/Windows).
#[cfg(desktop)]
fn abrir_navegador(url: &str) -> bool {
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = url;
        false
    }
}

struct Callback {
    code: Option<String>,
    error: Option<String>,
}

/// Servidor loopback efímero: escucha el callback del navegador. Los requests
/// sin código (favicon, etc.) se responden 404 y se sigue escuchando. Runs
/// bloqueante — se llama dentro de `spawn_blocking`.
fn esperar_callback(listener: std::net::TcpListener, state_esperado: &str) -> Result<Callback, String> {
    let límite = std::time::Instant::now() + std::time::Duration::from_secs(OAUTH_TIMEOUT_SECS);
    loop {
        if std::time::Instant::now() > límite {
            return Err("se pasó el tiempo esperando la autorización (5 min)".into());
        }
        let (mut stream, _) = match listener.accept() {
            Ok(c) => c,
            Err(e) => return Err(format!("puerto de retorno: {e}")),
        };
        let mut buf = [0u8; 8192];
        let n = match stream.read(&mut buf) {
            Ok(n) if n > 0 => n,
            _ => continue,
        };
        let primera = String::from_utf8_lossy(&buf[..n]);
        let request = primera.split("\r\n").next().unwrap_or("");
        // GET /?code=...&state=... HTTP/1.1
        let Some(destino) = request.split_whitespace().nth(1) else { continue };
        if !destino.starts_with('/') {
            responder(&mut stream, "404 Not Found", "ruta desconocida");
            continue;
        }
        let query = destino.split_once('?').map(|(_, q)| q).unwrap_or("");
        let mut code = None;
        let mut error_param = None;
        let mut state_ok = false;
        for par in query.split('&') {
            let (k, v) = par.split_once('=').unwrap_or((par, ""));
            match k {
                "code" => code = Some(urldecode(v)),
                "error" => error_param = Some(urldecode(v)),
                "state" => state_ok = urldecode(v) == state_esperado,
                _ => {}
            }
        }
        let mensaje = if !state_ok && code.is_some() {
            "state no coincide — posible CSRF; la autorización se descartó."
        } else if error_param.is_some() {
            "Autorización rechazada — puede cerrar esta pestaña y volver a la app."
        } else {
            "Autorización recibida — puede cerrar esta pestaña y volver a la app."
        };
        responder(&mut stream, "200 OK", mensaje);
        if error_param.is_some() {
            return Ok(Callback { code: None, error: error_param });
        }
        if !state_ok {
            return Err("state no coincide (posible CSRF) — descartado".into());
        }
        return Ok(Callback { code, error: None });
    }
}

fn responder(stream: &mut std::net::TcpStream, status: &str, cuerpo: &str) {
    let pag = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{cuerpo}",
        cuerpo.len()
    );
    let _ = stream.write_all(pag.as_bytes());
    let _ = stream.flush();
}

fn urldecode(s: &str) -> String {
    let mut v = Vec::with_capacity(s.len());
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hex: String = chars.by_ref().take(2).map(|h| h as char).collect();
            match u8::from_str_radix(&hex, 16) {
                Ok(h) => v.push(h),
                Err(_) => {
                    v.push(b'%');
                    v.extend(hex.bytes());
                }
            }
        } else if b == b'+' {
            v.push(b' ');
        } else {
            v.push(b);
        }
    }
    String::from_utf8_lossy(&v).into_owned()
}

// ------------------------------------------------------------------ Drive ---

#[derive(Debug, Deserialize)]
struct DriveFile {
    id: String,
    #[allow(dead_code)]
    name: String,
}

#[derive(Debug, Default, Deserialize)]
struct DriveList {
    #[serde(default)]
    files: Vec<DriveFile>,
}

async fn drive_buscar_respaldo(token: &str) -> Result<Option<String>, String> {
    let resp = cliente_http()
        .get(DRIVE_FILES)
        .query(&[
            ("spaces", "appDataFolder"),
            ("fields", "files(id,name)"),
        ])
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("listando respaldo: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(explicar_http_403(status, body, "listando respaldo"));
    }
    let list = resp.json::<DriveList>().await.map_err(|e| format!("listado ilegible: {e}"))?;
    Ok(list.files.into_iter().find(|f| f.name == BACKUP_NAME).map(|f| f.id))
}

/// El 403 con `access_denied` lleva al instructivo real (test user / publicación).
fn explicar_http_403(status: reqwest::StatusCode, body: String, contexto: &str) -> String {
    if status.as_u16() == 403 && body.contains("access_denied") {
        format!(
            "{contexto}: HTTP 403 access_denied — la cuenta no tiene permiso sobre la app de Google \
             (en Pruebas: agregar la cuenta como usuario de prueba; en producción: publicar el cliente)"
        )
    } else {
        format!("{contexto}: HTTP {status}")
    }
}

async fn drive_bajar(token: &str, id: &str) -> Result<String, String> {
    let resp = cliente_http()
        .get(format!("{DRIVE_FILES}/{id}?alt=media"))
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("bajando respaldo: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("bajando respaldo: HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("respaldo ilegible: {e}"))
}

/// multipart/related con metadata + contenido, exacto al formato del spike.
fn multipart_cuerpo(metadata: &str, contenido: &str) -> (String, Vec<u8>) {
    let boundary = format!(
        "adhan-boundary-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let mut bytes = Vec::new();
    bytes.extend_from_slice(format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n").as_bytes());
    bytes.extend_from_slice(format!("--{boundary}\r\nContent-Type: application/json\r\n\r\n{contenido}\r\n").as_bytes());
    bytes.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    (format!("multipart/related; boundary={boundary}"), bytes)
}

/// `None` → crea (POST); `Some(id)` → actualiza (PATCH sobre el /upload —
/// POST a esa ruta con id existente devuelve 404, como probó el spike).
async fn drive_subir(token: &str, id: Option<&str>, contenido: &str) -> Result<String, String> {
    let metadata = match id {
        None => format!(r#"{{"name":"{BACKUP_NAME}","parents":["appDataFolder"]}}"#),
        Some(_) => "{}".to_string(),
    };
    let (ctype, cuerpo) = multipart_cuerpo(&metadata, contenido);
    let url = match id {
        None => format!("{DRIVE_UPLOAD}?uploadType=multipart"),
        Some(id) => format!("{DRIVE_UPLOAD}/{id}?uploadType=multipart"),
    };
    let request = match id {
        None => cliente_http().post(&url),
        Some(_) => cliente_http().patch(&url),
    };
    let resp = request
        .header("Content-Type", &ctype)
        .bearer_auth(token)
        .body(cuerpo)
        .send()
        .await
        .map_err(|e| format!("subiendo respaldo: {e}"))?;
    let status = resp.status();
    let texto = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        // si el archivo desapareció en el medio (404), el caller crea uno nuevo
        return Err(format!("subiendo respaldo: HTTP {status} — {}", texto_corto(&texto)));
    }
    #[derive(Deserialize)]
    struct Subido {
        id: String,
    }
    serde_json::from_str::<Subido>(&texto)
        .map(|s| s.id)
        .map_err(|e| format!("respuesta de subida ilegible: {e}"))
}

/// Sube actualizando; si el archivo ya no existe (404/403 al hacer PATCH), crea.
async fn drive_subir_o_crear(token: &str, id: Option<&str>, contenido: &str) -> Result<String, String> {
    match id {
        Some(id) => match drive_subir(token, Some(id), contenido).await {
            Ok(nuevo_id) => Ok(nuevo_id),
            Err(e) if e.contains("HTTP 404") || e.contains("HTTP 403") => drive_subir(token, None, contenido).await,
            Err(e) => Err(e),
        },
        None => drive_subir(token, None, contenido).await,
    }
}

fn texto_corto(s: &str) -> String {
    s.chars().take(300).collect()
}

// ------------------------------------------------------------------ datos ---

#[derive(Debug, Serialize, Deserialize)]
struct Respaldo {
    schema: u32,
    actualizado: String,
    dispositivo: String,
    version_app: String,
    datos: Datos,
}

#[derive(Debug, Serialize, Deserialize)]
struct Datos {
    config: serde_json::Value,
    #[serde(default)]
    lector: Option<serde_json::Value>,
    #[serde(default)]
    registro: Vec<RegistroEntry>,
}

fn quran_reader_path() -> std::path::PathBuf {
    config::config_dir().join("quran-reader.json")
}

fn ahora_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    dias_civiles_iso(secs)
}

/// epoch-secs → "YYYY-MM-DDTHH:MM:SSZ" (civiles puros, sin dependencias).
fn dias_civiles_iso(secs: u64) -> String {
    let dias = (secs / 86_400) as i64;
    let resto = secs % 86_400;
    // Howard Hinnant civil_from_days: días desde 1970-01-01 → (y, m, d)
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        resto / 3600,
        (resto % 3600) / 60,
        resto % 60
    )
}

fn nombre_dispositivo() -> String {
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/etc/hostname")
            .ok()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "escritorio-linux".into())
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "escritorio-windows".into())
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        std::env::consts::OS.to_string()
    }
}

/// Equivale a config_diferencias en la dirección contraria: qué cambió de
/// comportamiento entre el config local y el del respaldo. Vacío = compatible.
fn config_diferencias(local: &Config, remota: &Config) -> Vec<String> {
    let mut d = Vec::new();
    if local.city != remota.city {
        d.push(format!("ciudad: {} → {}", local.city, remota.city));
    }
    if (local.lat - remota.lat).abs() > 1e-9 || (local.lon - remota.lon).abs() > 1e-9 {
        d.push(format!("coordenadas: ({:.4}, {:.4}) → ({:.4}, {:.4})", local.lat, local.lon, remota.lat, remota.lon));
    }
    if local.tz != remota.tz {
        d.push(format!("zona horaria: {} → {}", local.tz, remota.tz));
    }
    if local.method != remota.method {
        d.push(format!("método: {} → {}", enum_str(&local.method), enum_str(&remota.method)));
    }
    if local.madhab != remota.madhab {
        d.push(format!("escuela Asr: {} → {}", enum_str(&local.madhab), enum_str(&remota.madhab)));
    }
    if local.highLatRule != remota.highLatRule {
        d.push(format!("latitud alta: {} → {}", enum_str(&local.highLatRule), enum_str(&remota.highLatRule)));
    }
    if local.offsets != remota.offsets {
        d.push("ajustes por rezo".into());
    }
    if local.notice.minutes_before != remota.notice.minutes_before {
        d.push(format!("preaviso: {} → {} min", local.notice.minutes_before, remota.notice.minutes_before));
    }
    if local.audio != remota.audio {
        d.push("sonido/volumen por rezo".into());
    }
    if local.calendar.adjustment_days != remota.calendar.adjustment_days {
        d.push(format!("ajuste del calendario: {} → {} día(s)", local.calendar.adjustment_days, remota.calendar.adjustment_days));
    }
    d
}

fn respaldo_contenido() -> Result<String, String> {
    let config_texto = std::fs::read_to_string(config::config_path())
        .map_err(|e| format!("leyendo config para el respaldo: {e}"))?;
    let config_json: serde_json::Value = serde_json::from_str(&config_texto)
        .map_err(|e| format!("config ilegible para el respaldo: {e}"))?;
    let lector = std::fs::read_to_string(quran_reader_path())
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());
    let resp = Respaldo {
        schema: 1,
        actualizado: ahora_iso(),
        dispositivo: nombre_dispositivo(),
        version_app: env!("CARGO_PKG_VERSION").to_string(),
        datos: Datos {
            config: config_json,
            lector,
            registro: registro::load_all(),
        },
    };
    serde_json::to_string(&resp).map_err(|e| format!("serializando respaldo: {e}"))
}

fn parsear_respaldo(texto: &str) -> Result<Respaldo, String> {
    let r: Respaldo = serde_json::from_str(texto).map_err(|e| format!("respaldo ilegible: {e}"))?;
    if r.schema != 1 {
        return Err(format!("respaldo con schema {} desconocido (versión de la app desactualizada?)", r.schema));
    }
    Ok(r)
}

fn info_de(r: &Respaldo, bytes: usize) -> InfoRespaldo {
    InfoRespaldo {
        fecha: r.actualizado.clone(),
        dispositivo: r.dispositivo.clone(),
        version_app: r.version_app.clone(),
        bytes,
        rezos: r.datos.registro.iter().filter(|e| e.status == "rezado").count(),
    }
}

/// El string serde de un enum sin Display (como se representa en config/UI)
fn enum_str<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_value(v)
        .ok()
        .and_then(|j| j.as_str().map(String::from))
        .unwrap_or_default()
}

// --------------------------------------------------- reglas de resolución ---

/// Unión por evento: de `remota` devuelve lo que no está en `local` (por
/// triple date|prayer|status). El archivo local conserva su historial y sólo
/// recibe líneas nuevas — append-only intacto.
pub fn eventos_a_agregar(local: &[RegistroEntry], remota: &[RegistroEntry]) -> Vec<RegistroEntry> {
    let clave = |e: &RegistroEntry| format!("{}|{}|{}", e.date, e.prayer, e.status);
    let presentes: std::collections::HashSet<String> = local.iter().map(&clave).collect();
    remota.iter().filter(|e| !presentes.contains(&clave(e))).cloned().collect()
}

/// Orden conservador dentro del lote nuevo: por (fecha, rezo), los eventos
/// "rezado" van al final (last-wins del log) — un rezo marcado en cualquier
/// máquina nunca desaparece por la unión.
pub fn ordenar_conservador(entries: &mut [RegistroEntry]) {
    let prioridad = |e: &RegistroEntry| if e.status == "rezado" { 1 } else { 0 };
    entries.sort_by(|a, b| {
        a.date
            .cmp(&b.date)
            .then(a.prayer.as_str().cmp(b.prayer.as_str()))
            .then(prioridad(a).cmp(&prioridad(b)))
    });
}

// -------------------------------------------------------------- adopciones ---

/// Adopta el config del respaldo con las MISMAS validaciones y efectos de
/// set_config manual: guardar, actualizar estado compartido y avisar al
/// scheduler para recalcular. Err mantiene el config local intacto.
fn adoptar_config(
    cfg: Config,
    shared: &tauri::State<'_, SharedConfig>,
    sched_tx: &tauri::State<'_, std::sync::mpsc::Sender<scheduler::Trigger>>,
) -> Result<(), String> {
    config::save(&cfg)?;
    *shared.write().map_err(|e| format!("config envenenado: {e}"))? = cfg;
    let _ = sched_tx.send(scheduler::Trigger::ConfigChanged);
    Ok(())
}

// --------------------------------------------------------------- flujos IPC ---

/// Arma el `EstadoIpc`: sesión por keyring real + pendientes en memoria.
async fn snapshot() -> EstadoIpc {
    let hay_token = tauri::async_runtime::spawn_blocking(|| token_del_keyring().is_ok())
        .await
        .unwrap_or(false);
    let e = estado().lock().unwrap().clone();
    let sesion = if hay_token {
        Sesion::Activa
    } else if e.conectando {
        Sesion::Conectando
    } else {
        Sesion::SinSesion
    };
    EstadoIpc {
        sesion,
        respaldo: e.respaldo,
        conflicto: e.conflicto,
        restaurar: e.restaurar,
        url_autorizacion: e.url_autorizacion,
        ultimo_error: e.ultimo_error,
        ultima_sync: e.ultima_sync,
    }
}

#[tauri::command]
pub async fn sync_estado() -> Result<EstadoIpc, String> {
    Ok(snapshot().await)
}

#[cfg(desktop)]
fn sin_credencial() -> bool {
    client_id() == CLIENT_ID_FALLBACK
}

/// Una build sin credencial OAuth (como las de la CI) no ofrece el respaldo:
/// el panel se oculta y no se consulta el keyring al arrancar.
pub fn disponible() -> bool {
    !sin_credencial()
}

/// Inicia la vinculación: abre el navegador con la pantalla de Google, recibe
/// el callback en un puerto efímero y guarda el refresh token en el keyring.
#[tauri::command]
#[cfg(desktop)]
pub async fn sync_login() -> Result<EstadoIpc, String> {
    if token_del_keyring().is_ok() {
        return Ok(snapshot().await); // ya hay sesión — nada que hacer
    }
    if sin_credencial() {
        set_estado(|e| {
            e.ultimo_error = Some("la credencial de Google no está configurada en esta build".into());
        });
        return Ok(snapshot().await);
    }
    set_estado(|e| {
        e.conectando = true;
        e.ultimo_error = None;
    });
    let resultado = crear_sesion().await;
    set_estado(|e| {
        e.conectando = false;
        e.url_autorizacion = None;
        if let Err(falla) = &resultado {
            e.ultimo_error = Some(falla.clone());
        }
    });
    Ok(snapshot().await)
}

#[cfg(desktop)]
async fn crear_sesion() -> Result<(), String> {
    // loopback en puerto efímero: el redirect_uri exacto se captura antes de cerrar
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("no pude abrir el puerto de retorno: {e}"))?;
    let redirect = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
    let verifier = b64url(&azar(32)?);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = b64url(&azar(16)?);
    let url = auth_url(&challenge, &state, &redirect);
    // la UI la muestra para copiar si el navegador no abrió (cae validada en el spike)
    set_estado(|e| e.url_autorizacion = Some(url.clone()));

    // navegador (bloqueante: spawn)
    let abrir = url.clone();
    let abierto = tauri::async_runtime::spawn_blocking(move || abrir_navegador(&abrir))
        .await
        .unwrap_or(false);
    if !abierto {
        log!("sync: el navegador no abrió; la UI muestra la URL de autorización");
    }

    // callback (bloqueante, hasta 5 min) fuera del runtime async
    let cb = tauri::async_runtime::spawn_blocking(move || esperar_callback(listener, &state))
        .await
        .map_err(|_| "espera de autorización cancelada".to_string())?;
    let cb = cb?;
    if let Some(err) = cb.error {
        return Err(format!("Google rechazó: {err} — podés reintentar"));
    }
    let code = cb.code.ok_or_else(|| "callback sin código de autorización".to_string())?;

    // canje del código por tokens (client_secret opcional en Desktop)
    let mut pares: Vec<(&str, String)> = vec![
        ("client_id", client_id().to_string()),
        ("code", code),
        ("code_verifier", verifier),
        ("redirect_uri", redirect),
        ("grant_type", "authorization_code".to_string()),
    ];
    if let Some(sec) = client_secret() {
        pares.push(("client_secret", sec.to_string()));
    }
    let tokens = cliente_http()
        .post(TOKEN_URL)
        .form(&pares)
        .send()
        .await
        .map_err(|e| format!("canje del código: {e}"))?
        .json::<TokensJson>()
        .await
        .map_err(|e| format!("respuesta del canje ilegible: {e}"))?;
    if let Some(e) = &tokens.error {
        return Err(error_token(e, tokens.error_description.as_deref()));
    }
    let refresh = tokens
        .refresh_token
        .ok_or_else(|| "Google no entregó refresh token — reintentar la conexión".to_string())?;
    guardar_token(&refresh)?;
    log!("sync: sesión activa (scope: {})", tokens.scope.as_deref().unwrap_or("?"));
    Ok(())
}

/// Cerrar sesión: revoca el token en Google (mejor esfuerzo) y borra el keyring.
#[tauri::command]
pub async fn sync_logout() -> Result<EstadoIpc, String> {
    if let Ok(refresh) = token_del_keyring() {
        let _revocar = cliente_http().post(REVOKE_URL).form(&[("token", refresh)]).send().await;
    }
    let _ = borrar_token();
    set_estado(|e| *e = Estado::default());
    log!("sync: sesión cerrada (revocación + keyring limpio)");
    Ok(snapshot().await)
}

/// "Sincronizar ahora" (manual) y también el chequeo al arrancar: baja el
/// respaldo, aplica las reglas y sube. Devuelve el estado para el UI.
#[tauri::command]
#[cfg(desktop)]
pub async fn sync_ahora(
    shared: tauri::State<'_, SharedConfig>,
    sched_tx: tauri::State<'_, std::sync::mpsc::Sender<scheduler::Trigger>>,
) -> Result<EstadoIpc, String> {
    sync_core(&shared, &sched_tx).await
}

/// Chequeo al arrancar (deferrado; invocado por lib.rs). Mismo flujo que el
/// botón: restauración/conflicto quedan detenido en el estado — la UI los consulta.
#[cfg(desktop)]
pub async fn al_arrancar(app: tauri::AppHandle) {
    if !disponible() {
        return;
    }
    let shared = app.state::<SharedConfig>();
    let sched_tx = app.state::<std::sync::mpsc::Sender<scheduler::Trigger>>();
    match sync_core(&shared, &sched_tx).await {
        // el resultado ya está en el estado interno; no molesta con notificación
        Ok(_) => {}
        Err(e) => log!("sync al arrancar: {e}"),
    }
}

async fn sync_core(
    _shared: &tauri::State<'_, SharedConfig>,
    _sched_tx: &tauri::State<'_, std::sync::mpsc::Sender<scheduler::Trigger>>,
) -> Result<EstadoIpc, String> {
    // 0) sesión real (keyring)
    let refresh = match token_del_keyring() {
        Ok(t) => t,
        Err(None) => return Err("no hay sesión activa — conectá primero la cuenta de Google".into()),
        Err(Some(e)) => return Err(e),
    };
    let access = refresh_access(&refresh).await.map_err(|e| {
        if e.contains("venció") {
            // refresh caducado/revocado: sesión limpia + estado implicado
            let _ = borrar_token();
            set_estado(|st| {
                st.conflicto = None;
                st.restaurar = None;
            });
        }
        set_estado(|st| st.ultimo_error = Some(e.clone()));
        e
    })?;

    // 1) buscar el respaldo en Drive
    let remoto_id = drive_buscar_respaldo(&access.token).await?;

    if remoto_id.is_none() {
        // sin respaldo: primera subida directa (nada que resolver)
        let contenido = respaldo_contenido()?;
        drive_subir(&access.token, None, &contenido).await?;
        let nuevo = parsear_respaldo(&contenido)?;
        set_estado(|e| {
            e.respaldo = Some(info_de(&nuevo, contenido.len()));
            e.ultimo_error = None;
            e.ultima_sync = Some(nuevo.actualizado.clone());
        });
        log!("sync: primer respaldo creado en Drive");
        return Ok(snapshot().await);
    }

    // 2) bajar y parsear
    let texto = drive_bajar(&access.token, &remoto_id.as_ref().unwrap()).await?;
    let remoto = parsear_respaldo(&texto)?;
    set_estado(|e| {
        e.respaldo = Some(info_de(&remoto, texto.len()));
    });

    // 3) RESTAURACIÓN propuesta: registro local vacío con historial remoto
    let local_events = registro::load_all();
    let remote_events = &remoto.datos.registro;
    if local_events.is_empty() && !remote_events.is_empty() && !estado().lock().unwrap().restaurar_descartada {
        set_estado(|e| {
            e.restaurar = Some(RestaurarInfo {
                fecha: remoto.actualizado.clone(),
                dispositivo: remoto.dispositivo.clone(),
                rezos: remote_events.iter().filter(|ev| ev.status == "rezado").count(),
            });
            e.ultimo_error = None;
        });
        return Ok(snapshot().await);
    }

    // 4) registro: unión por evento (append de lo que falta) — siempre seguro
    let nuevos = eventos_a_agregar(&local_events, remote_events);
    let mut agregados = 0usize;
    for ev in &nuevos {
        registro::append(&ev.date, &ev.prayer, &ev.status).map_err(|e| format!("unir registro: {e}"))?;
        agregados += 1;
    }

    // 5) config / lector: LWW con consulta — cualquier diferencia de estado
    //    detiene el sync en `conflicto` hasta elección del usuario
    let local_cfg = config::load_or_init();
    let mut conflicto_config = false;
    let mut conflicto_lector = false;
    let mut detalles: Vec<String> = Vec::new();
    if let Ok(cfg_remota) = serde_json::from_value::<Config>(remoto.datos.config.clone()) {
        detalles = config_diferencias(&local_cfg, &cfg_remota);
        conflicto_config = !detalles.is_empty();
    }
    if let Some(lector_remota) = &remoto.datos.lector {
        let lector_local = std::fs::read_to_string(quran_reader_path())
            .ok()
            .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());
        // el lector es un Value de ambos lados: si difiere en algo, se consulta
        conflicto_lector = lector_local.as_ref() != Some(lector_remota);
    }
    if conflicto_config || conflicto_lector {
        set_estado(|e| {
            e.conflicto = Some(Conflicto {
                fecha: remoto.actualizado.clone(),
                dispositivo: remoto.dispositivo.clone(),
                config_difiere: conflicto_config,
                lector_difiere: conflicto_lector,
                config_detalles: detalles,
            });
            e.ultimo_error = None;
        });
        log!("sync: detenido en conflicto (config={}, lector={})", conflicto_config, conflicto_lector);
        return Ok(snapshot().await);
    }

    // 6) sin consultas pendientes → subir con `actualizado` nuevo
    subir_respaldo_actual(&access.token, remoto_id.as_deref()).await?;
    log!("sync: ok ({} evento(s) nuevos del registro)", agregados);
    Ok(snapshot().await)
}

/// Sube el estado local actual (registro ya unido), estampa `actualizado`
/// nuevo y refresca el estado interno. Es el mismo mecanismo del paso normal
/// y también lo usan las resoluciones/restauración — evita re-detectar
/// diferencias ya decididas por el usuario.
async fn subir_respaldo_actual(token: &str, id_previo: Option<&str>) -> Result<(), String> {
    let contenido = respaldo_contenido()?;
    let id = drive_subir_o_crear(token, id_previo, &contenido).await?;
    let nuevo = parsear_respaldo(&contenido)?;
    set_estado(|e| {
        e.respaldo = Some(info_de(&nuevo, contenido.len()));
        e.ultimo_error = None;
        e.ultima_sync = Some(nuevo.actualizado.clone());
    });
    log!("sync: respaldo actualizado ({})", id.chars().take(10).collect::<String>());
    Ok(())
}

/// Resolución del conflicto: "local" sube lo local tal cual; "remota" adopta
/// config + lector del respaldo con la semántica de set_config y luego sube.
/// El registro ya quedó unido en ambos casos (nunca se pierde nada).
#[tauri::command]
#[cfg(desktop)]
pub async fn sync_resolver(
    eleccion: String,
    shared: tauri::State<'_, SharedConfig>,
    sched_tx: tauri::State<'_, std::sync::mpsc::Sender<scheduler::Trigger>>,
) -> Result<EstadoIpc, String> {
    if estado().lock().unwrap().conflicto.is_none() {
        return Err("no hay conflicto pendiente de resolver".into());
    }
    match eleccion.as_str() {
        "local" => {
            // el registro ya quedó unido; se sube el estado local tal cual
            set_estado(|e| e.conflicto = None);
        }
        "remota" => {
            let refresh = token_del_keyring().map_err(|_| "sin sesión activa".to_string())?;
            let access = refresh_access(&refresh).await?;
            let remoto_id = drive_buscar_respaldo(&access.token).await?
                .ok_or_else(|| "el respaldo dejó de existir en Drive".to_string())?;
            let texto = drive_bajar(&access.token, &remoto_id).await?;
            let remoto = parsear_respaldo(&texto)?;
            // config remota validada con el contrato íntegro de set_config
            let cfg_remota: Config = serde_json::from_value(remoto.datos.config.clone())
                .map_err(|e| format!("config del respaldo ilegible: {e}"))?;
            cfg_remota.audio.validate()?;
            adoptar_config(cfg_remota, &shared, &sched_tx)?;
            if let Some(lector) = &remoto.datos.lector {
                crate::quran::reemplazar_state(
                    &serde_json::to_string(lector).map_err(|e| e.to_string())?,
                )?;
            }
            set_estado(|e| e.conflicto = None);
            log!("sync: conflicto resuelto a favor del respaldo de Drive");
            let _ = remoto_id;
        }
        otro => return Err(format!("elección desconocida: {otro}")),
    }
    // con la decisión tomada, subir el estado resultante (sin re-consultar)
    let refresh = token_del_keyring().map_err(|_| "sin sesión activa".to_string())?;
    let access = refresh_access(&refresh).await?;
    let remoto_id = drive_buscar_respaldo(&access.token).await?;
    subir_respaldo_actual(&access.token, remoto_id.as_deref()).await?;
    Ok(snapshot().await)
}

/// Restauración aceptada: trae config + lector + registro (unión) del
/// respaldo y sube. "descartar" no sube nada y no reintenta hasta sincronizar
/// manual (de este modo se evita la re-oferta en bucle).
#[tauri::command]
#[cfg(desktop)]
pub async fn sync_restaurar(
    acepta: bool,
    shared: tauri::State<'_, SharedConfig>,
    sched_tx: tauri::State<'_, std::sync::mpsc::Sender<scheduler::Trigger>>,
) -> Result<EstadoIpc, String> {
    set_estado(|e| e.restaurar = None);
    if !acepta {
        set_estado(|e| {
            e.restaurar_descartada = true;
            e.ultimo_error = None;
        });
        log!("sync: restauración descartada por el usuario (no se vuelve a ofertar en esta ejecución)");
        return Ok(snapshot().await);
    }
    let refresh = token_del_keyring().map_err(|_| "sin sesión activa".to_string())?;
    let access = refresh_access(&refresh).await?;
    let remoto_id = drive_buscar_respaldo(&access.token).await?
        .ok_or_else(|| "el respaldo dejó de existir en Drive".to_string())?;
    let texto = drive_bajar(&access.token, &remoto_id).await?;
    let remoto = parsear_respaldo(&texto)?;
    let cfg_remota: Config = serde_json::from_value(remoto.datos.config.clone())
        .map_err(|e| format!("config del respaldo ilegible: {e}"))?;
    cfg_remota.audio.validate()?;
    adoptar_config(cfg_remota, &shared, &sched_tx)?;
    if let Some(lector) = &remoto.datos.lector {
        crate::quran::reemplazar_state(&serde_json::to_string(lector).map_err(|e| e.to_string())?)
            .map_err(|e| format!("adoptando lector: {e}"))?;
    }
    let local = registro::load_all();
    let mut nuevos = eventos_a_agregar(&local, &remoto.datos.registro);
    ordenar_conservador(&mut nuevos);
    for ev in &nuevos {
        registro::append(&ev.date, &ev.prayer, &ev.status).map_err(|e| format!("restaurar registro: {e}"))?;
    }
    set_estado(|e| e.restaurar_descartada = false);
    log!("sync: restauración aplicada ({} evento(s) tomados del respaldo)", nuevos.len());
    subir_respaldo_actual(&access.token, Some(remoto_id.as_str())).await?;
    Ok(snapshot().await)
}

// ---------------------------------------------------------------- tests ---

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(date: &str, prayer: &str, status: &str) -> RegistroEntry {
        RegistroEntry { date: date.into(), prayer: prayer.into(), status: status.into() }
    }

    #[test]
    fn union_deduplica_y_conserva_rezados() {
        let local = vec![ev("2026-10-20", "Fajr", "rezado"), ev("2026-10-21", "Dhuhr", "rezado")];
        let remota = vec![
            ev("2026-10-20", "Fajr", "rezado"), // igual: no se agrega
            ev("2026-10-22", "Maghrib", "rezado"), // nueva en remota
        ];
        let nuevos = eventos_a_agregar(&local, &remota);
        assert_eq!(nuevos.len(), 1);
        assert_eq!(nuevos[0].date, "2026-10-22");
    }

    #[test]
    fn union_no_pierde_rezados_opuestos() {
        // local desmarcó; remota marcó rezado: la unión conserva ambos eventos
        let local = vec![ev("2026-10-20", "Asr", "rezado"), ev("2026-10-20", "Asr", "desmarcado")];
        let remota = vec![ev("2026-10-20", "Asr", "rezado")];
        let nuevos = eventos_a_agregar(&local, &remota);
        assert!(nuevos.is_empty(), "el remoto ya está representado en local");
    }

    #[test]
    fn orden_conservador_deja_rezado_ultimo() {
        let mut lote = vec![
            ev("2026-10-20", "Isha", "rezado"),
            ev("2026-10-20", "Isha", "desmarcado"),
            ev("2026-10-19", "Fajr", "desmarcado"),
        ];
        ordenar_conservador(&mut lote);
        assert_eq!(lote[0].date, "2026-10-19");
        assert_eq!(lote[lote.len() - 1].status, "rezado", "rezado al final para last-wins del log");
    }

    #[test]
    fn formato_multipart_compatible_con_drive() {
        let (ctype, cuerpo) = multipart_cuerpo(r#"{"name":"x.json"}"#, "{}");
        assert!(ctype.starts_with("multipart/related; boundary=adhan-boundary-"));
        let texto = String::from_utf8_lossy(&cuerpo);
        assert!(texto.contains("Content-Type: application/json; charset=UTF-8"));
        assert!(texto.ends_with("--\r\n") || texto.contains("--\r\n"), "cierre del multipart");
        // dos partes + cierre
        let limites = texto.matches("--adhan-boundary-").count();
        assert!(limites >= 3, "apertura, separador y cierre");
    }

    #[test]
    fn errores_de_token_traducen_invalid_grant() {
        assert!(error_token("invalid_grant", None).contains("conectá la cuenta"));
        assert!(error_token("access_denied", Some("más info")).contains("permiso"));
        assert!(error_token("mente_extraña", None).contains("mente_extraña"));
    }

    #[test]
    fn url_civil_iso_corresponde_con_epoch() {
        assert_eq!(dias_civiles_iso(0), "1970-01-01T00:00:00Z");
        // 2026-01-01 00:00:00 UTC = 1767225600
        assert_eq!(dias_civiles_iso(1_767_225_600), "2026-01-01T00:00:00Z");
    }
}
