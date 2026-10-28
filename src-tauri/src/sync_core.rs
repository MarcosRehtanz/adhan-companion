//! Lógica compartida de sincronización con Google Drive (platform-agnostic).
//!
//! Este módulo contiene toda la lógica de Drive API, merge, estado y subida diferida.
//! Las operaciones específicas de plataforma (token storage, OAuth flow) están en:
//! - `sync_google.rs` (desktop): keyring + loopback OAuth
//! - `sync_android.rs` (Android, futuro): archivo privado + Custom Tab OAuth

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{Emitter as _, Manager as _};

use crate::config::{self, Config, SharedConfig};
use crate::registro::{self, RegistroEntry};
use crate::{log, scheduler};

// --------------------------------------------------------------- constantes ---

pub const SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const DRIVE_FILES: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3/files";
pub const BACKUP_NAME: &str = "adhan-companion-backup.json";
pub const OAUTH_TIMEOUT_SECS: u64 = 300;
const HTTP_TIMEOUT_SECS: u64 = 30;
pub const CLIENT_ID_FALLBACK: &str = "credencial-no-configurada.apps.googleusercontent.com";
/// Base del último sync (local, no se sube): ver `Base`.
const SYNC_ESTADO: &str = "sync-estado.json";
/// Evento para la ventana: el sync cambió config o lector y hay que releerlos.
pub const EVENTO_APLICADO: &str = "sync_aplicado";

/// `client_id` de la credencial OAuth Desktop (público por diseño). En desarrollo lo
/// exporta `build.rs` desde `.oauth.local` (fuera de Git); una build sin
/// credencial compila igual y lo informa en claro.
pub fn client_id() -> &'static str {
    option_env!("GOOGLE_OAUTH_CLIENT_ID").unwrap_or(CLIENT_ID_FALLBACK)
}

pub fn client_secret() -> Option<&'static str> {
    option_env!("GOOGLE_OAUTH_CLIENT_SECRET").filter(|s| !s.is_empty())
}

/// `client_id` de la credencial OAuth Android. Usa el mismo mecanismo que desktop
/// pero con variables de entorno separadas (`ANDROID_GOOGLE_CLIENT_ID`).
pub fn android_client_id() -> &'static str {
    option_env!("ANDROID_GOOGLE_CLIENT_ID").unwrap_or(CLIENT_ID_FALLBACK)
}

pub fn android_sin_credencial() -> bool {
    android_client_id() == CLIENT_ID_FALLBACK
}

/// Devuelve el client_id correcto según la plataforma actual.
/// Desktop usa `GOOGLE_OAUTH_CLIENT_ID`, Android usa `ANDROID_GOOGLE_CLIENT_ID`.
pub fn platform_client_id() -> &'static str {
    #[cfg(target_os = "android")]
    {
        android_client_id()
    }
    #[cfg(not(target_os = "android"))]
    {
        client_id()
    }
}

/// Devuelve el client_secret correcto según la plataforma actual.
/// Desktop usa `GOOGLE_OAUTH_CLIENT_SECRET`, Android no usa secret.
pub fn platform_client_secret() -> Option<&'static str> {
    #[cfg(target_os = "android")]
    {
        None // Android no usa client_secret
    }
    #[cfg(not(target_os = "android"))]
    {
        client_secret()
    }
}

pub fn sin_credencial() -> bool {
    platform_client_id() == CLIENT_ID_FALLBACK
}

/// Una build sin credencial OAuth (como las de la CI) no ofrece el respaldo:
/// el panel se oculta y no se consulta el keyring al arrancar.
pub fn disponible() -> bool {
    !sin_credencial()
}

// -------------------------------------------------------------------- tipos ---

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

/// Conflicto pendiente de elección del usuario: lo que cambió en las dos
/// computadoras desde el último sync y quedó distinto.
#[derive(Debug, Clone, Serialize)]
pub struct Conflicto {
    pub fecha: String,
    pub dispositivo: String,
    pub config_difiere: bool,
    pub lector_difiere: bool,
    /// «qué: acá X, en Drive Y», para elegir con información
    pub config_detalles: Vec<String>,
    pub lector_detalles: Vec<String>,
}

/// Las dos salidas posibles de un conflicto, ya mezcladas con lo que cambió
/// de un solo lado; `sync_resolver` aplica una y sube.
#[derive(Debug, Clone)]
pub struct Pendiente {
    pub remoto_id: String,
    pub config_local: serde_json::Value,
    pub config_remota: serde_json::Value,
    pub lector_local: Option<serde_json::Value>,
    pub lector_remota: Option<serde_json::Value>,
}

/// Oferta de restauración (primera vez en una máquina, registro local vacío).
#[derive(Debug, Clone, Serialize)]
pub struct RestaurarInfo {
    pub fecha: String,
    pub dispositivo: String,
    pub rezos: usize,
}

#[derive(Debug, Default, Clone)]
pub struct Estado {
    pub conectando: bool,
    pub respaldo: Option<InfoRespaldo>,
    pub conflicto: Option<Conflicto>,
    pub pendiente: Option<Pendiente>,
    pub restaurar: Option<RestaurarInfo>,
    pub restaurar_descartada: bool,
    pub url_autorizacion: Option<String>,
    pub ultimo_error: Option<String>,
    /// qué se trajo del respaldo en el último sync (informativo)
    pub aviso: Option<String>,
    /// ISO de la última operación completada en esta ejecución
    pub ultima_sync: Option<String>,
}

pub static ESTADO: OnceLock<Mutex<Estado>> = OnceLock::new();

pub fn estado() -> &'static Mutex<Estado> {
    ESTADO.get_or_init(|| Mutex::new(Estado::default()))
}

pub fn set_estado(f: impl FnOnce(&mut Estado)) {
    f(&mut estado().lock().unwrap());
}

/// Lo que ve el UI. La sesión se lee del storage real (reconstruye estado al reabrir).
#[derive(Debug, Serialize)]
pub struct EstadoIpc {
    pub sesion: Sesion,
    pub respaldo: Option<InfoRespaldo>,
    pub conflicto: Option<Conflicto>,
    pub restaurar: Option<RestaurarInfo>,
    pub url_autorizacion: Option<String>,
    pub ultimo_error: Option<String>,
    pub aviso: Option<String>,
    pub ultima_sync: Option<String>,
}

pub fn con_registro<T>(r: Result<T, String>) -> Result<T, String> {
    if let Err(e) = &r {
        set_estado(|st| {
            st.ultimo_error = Some(e.clone());
        });
    }
    r
}

// -------------------------------------------------------- token operations ---
// Estas funciones son implementadas por plataforma (desktop usa keyring,
// Android usará archivo privado). Se definen aquí para que sync_core pueda
// usarlas sin saber los detalles de implementación.

/// Carga el refresh token del storage de la plataforma.
/// - `Ok(token)` = hay sesión activa
/// - `Err(None)` = no hay token guardado
/// - `Err(Some(msg))` = error de storage
pub fn token_load() -> Result<String, Option<String>> {
    #[cfg(desktop)]
    {
        crate::sync_google::token_del_keyring()
    }
    #[cfg(target_os = "android")]
    {
        crate::sync_android::token_from_file()
    }
    #[cfg(not(any(desktop, target_os = "android")))]
    {
        Err(Some("Token storage no implementado para esta plataforma".into()))
    }
}

/// Guarda el refresh token en el storage de la plataforma.
pub fn token_save(refresh: &str) -> Result<(), String> {
    #[cfg(desktop)]
    {
        crate::sync_google::guardar_token(refresh)
    }
    #[cfg(target_os = "android")]
    {
        crate::sync_android::token_to_file(refresh)
    }
    #[cfg(not(any(desktop, target_os = "android")))]
    {
        Err("Token storage no implementado para esta plataforma".into())
    }
}

/// Borra el refresh token del storage de la plataforma.
pub fn token_delete() -> Result<(), String> {
    #[cfg(desktop)]
    {
        crate::sync_google::borrar_token()
    }
    #[cfg(target_os = "android")]
    {
        crate::sync_android::token_delete_file()
    }
    #[cfg(not(any(desktop, target_os = "android")))]
    {
        Err("Token storage no implementado para esta plataforma".into())
    }
}

// ------------------------------------------------------------------- HTTP ---

pub fn cliente_http() -> &'static reqwest::Client {
    static CLIENTE: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENTE.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
            .build()
            .expect("cliente HTTP válido")
    })
}

#[derive(Debug, Default, Deserialize)]
pub struct TokensJson {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

pub struct Access {
    pub token: String,
}

pub async fn refresh_access(refresh: &str) -> Result<Access, String> {
    let mut pares: Vec<(&str, String)> = vec![
        ("client_id", platform_client_id().to_string()),
        ("refresh_token", refresh.to_string()),
        ("grant_type", "refresh_token".to_string()),
    ];
    if let Some(sec) = platform_client_secret() {
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
pub fn error_token(error: &str, detalle: Option<&str>) -> String {
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

pub fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn azar(n: usize) -> Result<Vec<u8>, String> {
    let mut buf = vec![0u8; n];
    getrandom::fill(&mut buf).map_err(|e| format!("entropía del sistema: {e}"))?;
    Ok(buf)
}

pub fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn auth_url(challenge: &str, state: &str, redirect: &str) -> String {
    format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}&code_challenge={}&code_challenge_method=S256",
        urlencode(platform_client_id()),
        urlencode(redirect),
        urlencode(SCOPE),
        urlencode(state),
        urlencode(challenge),
    )
}

pub fn urldecode(s: &str) -> String {
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

pub struct Callback {
    pub code: Option<String>,
    pub error: Option<String>,
}

/// «Cancelar» del panel mientras se espera la autorización.
pub static CANCELADO: AtomicBool = AtomicBool::new(false);

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

pub async fn drive_buscar_respaldo(token: &str) -> Result<Option<String>, String> {
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
pub fn explicar_http_403(status: reqwest::StatusCode, body: String, contexto: &str) -> String {
    if status.as_u16() == 403 && body.contains("access_denied") {
        format!(
            "{contexto}: HTTP 403 access_denied — la cuenta no tiene permiso sobre la app de Google \
             (en Pruebas: agregar la cuenta como usuario de prueba; en producción: publicar el cliente)"
        )
    } else {
        format!("{contexto}: HTTP {status}")
    }
}

pub async fn drive_bajar(token: &str, id: &str) -> Result<String, String> {
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
pub fn multipart_cuerpo(metadata: &str, contenido: &str) -> (String, Vec<u8>) {
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
pub async fn drive_subir(token: &str, id: Option<&str>, contenido: &str) -> Result<String, String> {
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

/// Sube actualizando; si el archivo ya no existe (404 al hacer PATCH), crea.
/// Un 403 (permiso o cupo) es un error: crear otro archivo duplicaría el respaldo.
pub async fn drive_subir_o_crear(token: &str, id: Option<&str>, contenido: &str) -> Result<String, String> {
    match id {
        Some(id) => match drive_subir(token, Some(id), contenido).await {
            Ok(nuevo_id) => Ok(nuevo_id),
            Err(e) if e.contains("HTTP 404") => drive_subir(token, None, contenido).await,
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
pub struct Respaldo {
    pub schema: u32,
    pub actualizado: String,
    pub dispositivo: String,
    pub version_app: String,
    pub datos: Datos,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Datos {
    pub config: serde_json::Value,
    #[serde(default)]
    pub lector: Option<serde_json::Value>,
    #[serde(default)]
    pub registro: Vec<RegistroEntry>,
}

pub fn quran_reader_path() -> std::path::PathBuf {
    config::config_dir().join("quran-reader.json")
}

pub fn ahora_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    dias_civiles_iso(secs)
}

/// epoch-secs → "YYYY-MM-DDTHH:MM:SSZ" (civiles puros, sin dependencias).
pub fn dias_civiles_iso(secs: u64) -> String {
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

pub fn nombre_dispositivo() -> String {
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
    #[cfg(target_os = "android")]
    {
        // En Android, usar el modelo del dispositivo
        std::env::var("ro.product.model").unwrap_or_else(|_| "android".into())
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "android")))]
    {
        std::env::consts::OS.to_string()
    }
}

pub fn leer_json(path: &std::path::Path) -> Option<serde_json::Value> {
    std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok())
}

/// Lo que se sube: config y lector tal como están en disco, y el registro completo.
pub fn respaldo_actual() -> Result<Respaldo, String> {
    let config_texto = std::fs::read_to_string(config::config_path())
        .map_err(|e| format!("leyendo config para el respaldo: {e}"))?;
    let config_json: serde_json::Value = serde_json::from_str(&config_texto)
        .map_err(|e| format!("config ilegible para el respaldo: {e}"))?;
    Ok(Respaldo {
        schema: 1,
        actualizado: ahora_iso(),
        dispositivo: nombre_dispositivo(),
        version_app: env!("CARGO_PKG_VERSION").to_string(),
        datos: Datos {
            config: config_json,
            lector: leer_json(&quran_reader_path()),
            registro: registro::load_all(),
        },
    })
}

pub fn parsear_respaldo(texto: &str) -> Result<Respaldo, String> {
    let r: Respaldo = serde_json::from_str(texto).map_err(|e| format!("respaldo ilegible: {e}"))?;
    if r.schema != 1 {
        return Err(format!("respaldo con schema {} desconocido (versión de la app desactualizada?)", r.schema));
    }
    Ok(r)
}

pub fn info_de(r: &Respaldo, bytes: usize) -> InfoRespaldo {
    InfoRespaldo {
        fecha: r.actualizado.clone(),
        dispositivo: r.dispositivo.clone(),
        version_app: r.version_app.clone(),
        bytes,
        rezos: r.datos.registro.iter().filter(|e| e.status == "rezado").count(),
    }
}

// ------------------------------------------------------------------- base ---

/// Config y lector tal como quedaron iguales acá y en Drive en el último sync.
/// Es local (`sync-estado.json`) y no se sube: con ella el sync distingue
/// «cambió acá» de «cambió en la otra computadora».
#[derive(Debug, Serialize, Deserialize)]
pub struct Base {
    pub config: serde_json::Value,
    #[serde(default)]
    pub lector: Option<serde_json::Value>,
    pub fecha: String,
    /// ISO de la última sync completada por ESTA máquina (persiste entre reinicios)
    #[serde(default)]
    pub ultima_sync: Option<String>,
}

pub fn base_path() -> std::path::PathBuf {
    config::config_dir().join(SYNC_ESTADO)
}

pub fn leer_base() -> Option<Base> {
    std::fs::read_to_string(base_path()).ok().and_then(|t| serde_json::from_str(&t).ok())
}

pub fn guardar_base(r: &Respaldo) -> Result<(), String> {
    let base = Base {
        config: r.datos.config.clone(),
        lector: r.datos.lector.clone(),
        fecha: r.actualizado.clone(),
        ultima_sync: Some(ahora_iso()),
    };
    let path = base_path();
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(&base).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, data).map_err(|e| format!("guardando la base del sync: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("guardando la base del sync: {e}")
    })
}

pub fn borrar_base() {
    let _ = std::fs::remove_file(base_path());
}

// --------------------------------------------------- reglas de resolución ---

/// Las acciones del usuario; `adhan` y `perdido` los registra cada máquina.
pub fn del_usuario(e: &RegistroEntry) -> bool {
    e.status == "rezado" || e.status == "desmarcado"
}

/// Última acción del usuario por (fecha, rezo), en orden de archivo (last-wins).
pub fn ultimas_acciones(eventos: &[RegistroEntry]) -> HashMap<(&str, &str), &RegistroEntry> {
    let mut m = HashMap::new();
    for e in eventos.iter().filter(|e| del_usuario(e)) {
        m.insert((e.date.as_str(), e.prayer.as_str()), e);
    }
    m
}

/// Entre dos acciones distintas sobre el mismo rezo gana la más reciente. Sin
/// hora en alguna (eventos anteriores a v0.1.16), la que la tiene es posterior;
/// sin hora en las dos o con la misma, gana la marca: un rezo marcado en
/// cualquier computadora no se pierde.
pub fn gana_remota(local: &RegistroEntry, remota: &RegistroEntry) -> bool {
    if local.status == remota.status {
        return false;
    }
    match (local.ts, remota.ts) {
        (Some(l), Some(r)) if l != r => r > l,
        (None, Some(_)) => true,
        (Some(_), None) => false,
        _ => remota.status == "rezado",
    }
}

/// Eventos del respaldo que hay que agregar al registro local para que cada
/// (fecha, rezo) quede con la acción que gana. El archivo local conserva su
/// historial (append-only) y lo agregado lleva su hora original.
pub fn eventos_a_agregar(local: &[RegistroEntry], remota: &[RegistroEntry]) -> Vec<RegistroEntry> {
    let locales = ultimas_acciones(local);
    let mut nuevos: Vec<RegistroEntry> = ultimas_acciones(remota)
        .into_iter()
        .filter(|(clave, r)| locales.get(clave).map_or(true, |l| gana_remota(l, r)))
        .map(|(_, r)| r.clone())
        .collect();
    nuevos.sort_by(|a, b| a.date.cmp(&b.date).then(a.prayer.cmp(&b.prayer)));
    nuevos
}

pub type Objeto = serde_json::Map<String, serde_json::Value>;

/// Grupos del config que se resuelven juntos (la ubicación son cuatro campos).
/// Las claves que no figuran acá forman un grupo cada una.
pub const GRUPOS_CONFIG: &[&[&str]] = &[
    &["city", "lat", "lon", "tz"],
    &["method"],
    &["madhab"],
    &["highLatRule"],
    &["offsets"],
    &["audio"],
    &["notice"],
    &["calendar"],
    &["appearance"],
];
/// En el lector, la posición y las preferencias; los marcadores se unen aparte.
pub const GRUPOS_LECTOR: &[&[&str]] = &[&["last"], &["arabic_size", "translation_size", "show_translation"]];

/// Resultado de mezclar en tres vías.
pub struct Mezcla {
    /// con lo que cambió de un solo lado; en los grupos en conflicto, lo local
    pub local: Objeto,
    /// lo mismo, pero con lo del respaldo en los grupos en conflicto
    pub remota: Objeto,
    /// grupos que cambiaron en las dos computadoras y quedaron distintos
    pub conflictos: Vec<Vec<String>>,
}

pub fn grupos_de(objetos: [&Objeto; 2], fijos: &[&[&str]]) -> Vec<Vec<String>> {
    let mut grupos: Vec<Vec<String>> = fijos.iter().map(|g| g.iter().map(|k| k.to_string()).collect()).collect();
    for objeto in objetos {
        for k in objeto.keys() {
            if !grupos.iter().any(|g| g.contains(k)) {
                grupos.push(vec![k.clone()]);
            }
        }
    }
    grupos
}

pub fn tomar(objeto: &Objeto, grupo: &[String]) -> Vec<Option<serde_json::Value>> {
    grupo.iter().map(|k| objeto.get(k).cloned()).collect()
}

pub fn poner(objeto: &mut Objeto, grupo: &[String], valores: &[Option<serde_json::Value>]) {
    for (k, v) in grupo.iter().zip(valores) {
        match v {
            Some(v) => {
                objeto.insert(k.clone(), v.clone());
            }
            None => {
                objeto.remove(k);
            }
        }
    }
}

/// Tres vías por grupo: si cambió un solo lado desde la base, gana ese; si
/// cambiaron los dos y quedaron distintos, es conflicto. Sin base (primer sync
/// en esta máquina), cualquier diferencia es conflicto.
pub fn mezclar(local: &Objeto, remota: &Objeto, base: Option<&Objeto>, grupos: &[Vec<String>]) -> Mezcla {
    let mut m = Mezcla {
        local: local.clone(),
        remota: local.clone(),
        conflictos: Vec::new(),
    };
    for g in grupos {
        let (l, r) = (tomar(local, g), tomar(remota, g));
        if l == r {
            continue;
        }
        match base.map(|b| tomar(b, g)) {
            Some(b) if b == l => {
                poner(&mut m.local, g, &r);
                poner(&mut m.remota, g, &r);
            }
            Some(b) if b == r => {}
            _ => {
                poner(&mut m.remota, g, &r);
                m.conflictos.push(g.clone());
            }
        }
    }
    m
}

/// Marcadores: se suman las altas y se aplican las bajas de cada lado. Sin
/// base, se unen.
pub fn unir_marcadores(local: &[serde_json::Value], remota: &[serde_json::Value], base: Option<&[serde_json::Value]>) -> Vec<serde_json::Value> {
    let nuevo_desde_base = |v: &serde_json::Value| base.map_or(true, |b| !b.contains(v));
    let mut unidos: Vec<serde_json::Value> = local
        .iter()
        .filter(|v| remota.contains(v) || nuevo_desde_base(v))
        .cloned()
        .collect();
    for v in remota {
        if !local.contains(v) && nuevo_desde_base(v) {
            unidos.push(v.clone());
        }
    }
    unidos
}

pub fn mezclar_lector(local: &Objeto, remota: &Objeto, base: Option<&Objeto>) -> Mezcla {
    let mut grupos = grupos_de([local, remota], GRUPOS_LECTOR);
    grupos.retain(|g| g.len() != 1 || g[0] != "bookmarks");
    let mut m = mezclar(local, remota, base, &grupos);
    let lista = |o: Option<&Objeto>| o.and_then(|o| o.get("bookmarks")).and_then(|v| v.as_array()).cloned();
    let base_marcadores = lista(base);
    let unidos = serde_json::Value::Array(unir_marcadores(
        &lista(Some(local)).unwrap_or_default(),
        &lista(Some(remota)).unwrap_or_default(),
        base_marcadores.as_deref(),
    ));
    m.local.insert("bookmarks".into(), unidos.clone());
    m.remota.insert("bookmarks".into(), unidos);
    m
}

fn texto(v: &Option<serde_json::Value>) -> String {
    match v {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Null) | None => "—".into(),
        Some(v) => v.to_string(),
    }
}

fn campo(v: &Option<serde_json::Value>, clave: &str) -> String {
    v.as_ref().and_then(|v| v.get(clave)).map(|x| x.to_string()).unwrap_or_else(|| "—".into())
}

fn coordenadas(lat: &Option<serde_json::Value>, lon: &Option<serde_json::Value>) -> String {
    let n = |v: &Option<serde_json::Value>| v.as_ref().and_then(|v| v.as_f64()).map(|x| format!("{x:.4}")).unwrap_or_else(|| "—".into());
    format!("{}, {}", n(lat), n(lon))
}

/// «qué: acá X, en Drive Y» para un grupo del config en conflicto.
pub fn describir_config(grupo: &[String], local: &Objeto, remota: &Objeto) -> String {
    let (l, r) = (tomar(local, grupo), tomar(remota, grupo));
    match grupo[0].as_str() {
        "city" if l[0] == r[0] => format!("ubicación: acá {}, en Drive {}", coordenadas(&l[1], &l[2]), coordenadas(&r[1], &r[2])),
        "city" => format!("ubicación: acá {}, en Drive {}", texto(&l[0]), texto(&r[0])),
        "method" => format!("método de cálculo: acá {}, en Drive {}", texto(&l[0]), texto(&r[0])),
        "madhab" => format!("escuela para Asr: acá {}, en Drive {}", texto(&l[0]), texto(&r[0])),
        "highLatRule" => format!("regla de latitud alta: acá {}, en Drive {}", texto(&l[0]), texto(&r[0])),
        "notice" => format!("preaviso: acá {} min, en Drive {} min", campo(&l[0], "minutes_before"), campo(&r[0], "minutes_before")),
        "calendar" => format!("ajuste del calendario islámico: acá {}, en Drive {} día(s)", campo(&l[0], "adjustment_days"), campo(&r[0], "adjustment_days")),
        "offsets" => "ajustes manuales por rezo".into(),
        "audio" => "sonido y volumen de los avisos".into(),
        "appearance" => "apariencia (tema y acento)".into(),
        otro => otro.to_string(),
    }
}

/// «qué: acá X, en Drive Y» para un grupo del lector en conflicto.
pub fn describir_lector(grupo: &[String], local: &Objeto, remota: &Objeto) -> String {
    let posicion = |v: &Option<serde_json::Value>| {
        v.as_ref()
            .and_then(|v| Some(format!("{}:{}", v.get("sura")?, v.get("aya")?)))
            .unwrap_or_else(|| "sin guardar".into())
    };
    let (l, r) = (tomar(local, grupo), tomar(remota, grupo));
    match grupo[0].as_str() {
        "last" => format!("punto de lectura: acá {}, en Drive {}", posicion(&l[0]), posicion(&r[0])),
        "arabic_size" => "preferencias de lectura (idioma y tamaño)".into(),
        otro => otro.to_string(),
    }
}

// -------------------------------------------------------------- adopciones ---

/// Deja config y lector como `config_nueva` / `lector_nuevo` si difieren de lo
/// que hay en disco. El config pasa por las reglas de `set_config` (validación,
/// estado compartido y scheduler); si no valida, no se toca nada. Avisa a la
/// ventana para que relea. Devuelve qué cambió.
pub fn aplicar(app: &tauri::AppHandle, config_nueva: &serde_json::Value, lector_nuevo: Option<&serde_json::Value>) -> Result<Vec<&'static str>, String> {
    let cfg = if leer_json(&config::config_path()).as_ref() != Some(config_nueva) {
        let cfg: Config = serde_json::from_value(config_nueva.clone()).map_err(|e| format!("config del respaldo ilegible: {e}"))?;
        config::validar(&cfg).map_err(|e| format!("config del respaldo inválido: {e}"))?;
        Some(cfg)
    } else {
        None
    };
    let mut cambios = Vec::new();
    if let Some(lector) = lector_nuevo {
        if leer_json(&quran_reader_path()).as_ref() != Some(lector) {
            crate::quran::reemplazar_state(&serde_json::to_string(lector).map_err(|e| e.to_string())?)
                .map_err(|e| format!("adoptando el lector: {e}"))?;
            cambios.push("lectura");
        }
    }
    if let Some(cfg) = cfg {
        config::save(&cfg)?;
        *app.state::<SharedConfig>().write().map_err(|e| format!("config envenenado: {e}"))? = cfg;
        let _ = app.state::<std::sync::mpsc::Sender<scheduler::Trigger>>().send(scheduler::Trigger::ConfigChanged);
        cambios.push("configuración");
    }
    if !cambios.is_empty() {
        let _ = app.emit(EVENTO_APLICADO, ());
    }
    Ok(cambios)
}

/// Agrega al registro los eventos traídos del respaldo y avisa al scheduler
/// (recalcula los marcados de hoy) y a la ventana.
pub fn agregar_al_registro(app: &tauri::AppHandle, eventos: &[RegistroEntry]) -> Result<(), String> {
    for ev in eventos {
        registro::append_entry(ev).map_err(|e| format!("unir registro: {e}"))?;
    }
    if !eventos.is_empty() {
        let _ = app.state::<std::sync::mpsc::Sender<scheduler::Trigger>>().send(scheduler::Trigger::ConfigChanged);
        let _ = app.emit(EVENTO_APLICADO, ());
    }
    Ok(())
}

pub fn resumen_traido(dispositivo: &str, cambios: &[&str], eventos: usize) -> Option<String> {
    let mut partes: Vec<String> = cambios.iter().map(|c| c.to_string()).collect();
    if eventos > 0 {
        partes.push(format!("{eventos} cambio(s) del registro"));
    }
    (!partes.is_empty()).then(|| format!("Se trajo del respaldo de {dispositivo}: {}.", partes.join(", ")))
}

// --------------------------------------------------------------- flujos IPC ---

/// Arma el `EstadoIpc`: sesión por storage real + pendientes en memoria.
/// Último sync persistido de esta máquina (de `sync-estado.json`); se muestra
/// cuando el panel abre sin haber sincronizado todavía en esta ejecución.
pub fn ultima_persistida() -> Option<String> {
    let v = leer_json(&base_path())?;
    v.get("ultima_sync")?.as_str().map(|s| s.to_owned())
}

pub async fn snapshot() -> EstadoIpc {
    let hay_token = tauri::async_runtime::spawn_blocking(|| token_load().is_ok())
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
        aviso: e.aviso,
        ultima_sync: e.ultima_sync.or_else(ultima_persistida),
    }
}

pub async fn sync_estado() -> Result<EstadoIpc, String> {
    Ok(snapshot().await)
}

/// Token de acceso a partir del refresh del storage. Si Google dice que venció
/// o fue revocado, se cierra la sesión local: hay que conectar de nuevo.
pub async fn acceso() -> Result<String, String> {
    let refresh = match token_load() {
        Ok(t) => t,
        Err(None) => return Err("no hay sesión activa — conectá primero la cuenta de Google".into()),
        Err(Some(e)) => return Err(e),
    };
    match refresh_access(&refresh).await {
        Ok(access) => Ok(access.token),
        Err(e) => {
            if e.contains("venció") {
                let _ = token_delete();
                set_estado(|st| {
                    st.conflicto = None;
                    st.pendiente = None;
                    st.restaurar = None;
                });
            }
            Err(e)
        }
    }
}

/// Cerrar sesión: revoca el token en Google (mejor esfuerzo), borra el storage
/// y la base del último sync (con otra cuenta no sirve).
pub async fn sync_logout() -> Result<EstadoIpc, String> {
    if let Ok(refresh) = token_load() {
        let _revocar = cliente_http().post(REVOKE_URL).form(&[("token", refresh)]).send().await;
    }
    let _ = token_delete();
    borrar_base();
    set_estado(|e| *e = Estado::default());
    log!("sync: sesión cerrada (revocación + storage y base limpios)");
    Ok(snapshot().await)
}

/// Sube el estado local actual, guarda la base del sync y refresca el estado
/// interno. Lo usan el paso normal, las resoluciones y la restauración.
pub async fn subir_respaldo_actual(token: &str, id_previo: Option<&str>) -> Result<(), String> {
    let respaldo = respaldo_actual()?;
    let contenido = serde_json::to_string(&respaldo).map_err(|e| format!("serializando respaldo: {e}"))?;
    let id = drive_subir_o_crear(token, id_previo, &contenido).await?;
    guardar_base(&respaldo)?;
    set_estado(|e| {
        e.respaldo = Some(info_de(&respaldo, contenido.len()));
        e.ultimo_error = None;
        e.ultima_sync = Some(respaldo.actualizado.clone());
    });
    log!("sync: respaldo actualizado ({})", id.chars().take(10).collect::<String>());
    Ok(())
}

/// La lógica principal del sync: baja el respaldo, aplica las reglas y sube.
/// Devuelve el estado para el UI.
pub async fn sync_core(app: &tauri::AppHandle) -> Result<EstadoIpc, String> {
    // Guard único de concurrencia: ningún otro sync (manual, al arrancar o
    // diferido) corre mientras este esté arriba; el guard baja al salir,
    // también por error o panic.
    if EN_VUELO.swap(true, Ordering::SeqCst) {
        return Err("Ya hay una sincronización en curso.".into());
    }
    let _vuelo = EnVuelo;
    set_estado(|st| {
        st.ultimo_error = None;
        st.aviso = None;
    });
    let token = acceso().await?;

    // 1) buscar el respaldo; si no hay, el primero es lo local
    let Some(remoto_id) = drive_buscar_respaldo(&token).await? else {
        subir_respaldo_actual(&token, None).await?;
        log!("sync: primer respaldo creado en Drive");
        return Ok(snapshot().await);
    };

    // 2) bajar y parsear
    let texto = drive_bajar(&token, &remoto_id).await?;
    let remoto = parsear_respaldo(&texto)?;
    set_estado(|e| e.respaldo = Some(info_de(&remoto, texto.len())));

    // 3) RESTAURACIÓN propuesta: registro local vacío con historial remoto
    let local_events = registro::load_all();
    if local_events.is_empty() && !remoto.datos.registro.is_empty() && !estado().lock().unwrap().restaurar_descartada {
        set_estado(|e| {
            e.restaurar = Some(RestaurarInfo {
                fecha: remoto.actualizado.clone(),
                dispositivo: remoto.dispositivo.clone(),
                rezos: remoto.datos.registro.iter().filter(|ev| ev.status == "rezado").count(),
            });
        });
        return Ok(snapshot().await);
    }

    // 4) registro: por (fecha, rezo) gana la última acción del usuario
    let nuevos = eventos_a_agregar(&local_events, &remoto.datos.registro);
    agregar_al_registro(app, &nuevos)?;

    // 5) config y lector en tres vías contra la base del último sync
    let base = leer_base();
    let config_local = leer_json(&config::config_path())
        .unwrap_or_else(|| serde_json::to_value(config::load_or_init()).unwrap_or_default());
    let (Some(cfg_local), Some(cfg_remota)) = (config_local.as_object(), remoto.datos.config.as_object()) else {
        return Err("el config local o el del respaldo no tienen el formato esperado".into());
    };
    let m_cfg = mezclar(cfg_local, cfg_remota, base.as_ref().and_then(|b| b.config.as_object()), &grupos_de([cfg_local, cfg_remota], GRUPOS_CONFIG));
    let config_detalles: Vec<String> = m_cfg.conflictos.iter().map(|g| describir_config(g, cfg_local, cfg_remota)).collect();

    let lector_local = leer_json(&quran_reader_path());
    let base_lector = base.as_ref().and_then(|b| b.lector.as_ref()).and_then(|v| v.as_object());
    let (m_lec, lector_detalles) = match (lector_local.as_ref().and_then(|v| v.as_object()), remoto.datos.lector.as_ref().and_then(|v| v.as_object())) {
        (Some(l), Some(r)) => {
            let m = mezclar_lector(l, r, base_lector);
            let detalles = m.conflictos.iter().map(|g| describir_lector(g, l, r)).collect();
            (Some(m), detalles)
        }
        // sin lector local todavía: se toma el del respaldo
        (None, Some(r)) => (Some(Mezcla { local: r.clone(), remota: r.clone(), conflictos: Vec::new() }), Vec::new()),
        _ => (None, Vec::new()),
    };

    if !config_detalles.is_empty() || !lector_detalles.is_empty() {
        set_estado(|e| {
            e.conflicto = Some(Conflicto {
                fecha: remoto.actualizado.clone(),
                dispositivo: remoto.dispositivo.clone(),
                config_difiere: !config_detalles.is_empty(),
                lector_difiere: !lector_detalles.is_empty(),
                config_detalles,
                lector_detalles,
            });
            e.pendiente = Some(Pendiente {
                remoto_id: remoto_id.clone(),
                config_local: serde_json::Value::Object(m_cfg.local),
                config_remota: serde_json::Value::Object(m_cfg.remota),
                lector_local: m_lec.as_ref().map(|m| serde_json::Value::Object(m.local.clone())),
                lector_remota: m_lec.map(|m| serde_json::Value::Object(m.remota)),
            });
            e.aviso = resumen_traido(&remoto.dispositivo, &[], nuevos.len());
        });
        log!("sync: detenido en conflicto ({} evento(s) del registro ya unidos)", nuevos.len());
        return Ok(snapshot().await);
    }

    // 6) sin conflicto: lo que cambió solo en Drive se toma acá, y se sube
    let lector_final = m_lec.map(|m| serde_json::Value::Object(m.local));
    let cambios = aplicar(app, &serde_json::Value::Object(m_cfg.local), lector_final.as_ref())?;
    subir_respaldo_actual(&token, Some(&remoto_id)).await?;
    set_estado(|e| e.aviso = resumen_traido(&remoto.dispositivo, &cambios, nuevos.len()));
    log!("sync: ok ({} evento(s) del registro, cambios: {:?})", nuevos.len(), cambios);
    Ok(snapshot().await)
}

/// "Sincronizar ahora" (manual): baja el respaldo, aplica las reglas y sube.
pub async fn sync_ahora(app: tauri::AppHandle) -> Result<EstadoIpc, String> {
    con_registro(sync_core(&app).await)
}

/// Resolución del conflicto: "local" deja lo de esta computadora y "remota" lo
/// del respaldo, solo en lo que cambió en las dos; lo demás ya quedó mezclado.
pub async fn sync_resolver(eleccion: String, app: tauri::AppHandle) -> Result<EstadoIpc, String> {
    con_registro(resolver(&eleccion, &app).await)
}

pub async fn resolver(eleccion: &str, app: &tauri::AppHandle) -> Result<EstadoIpc, String> {
    let pendiente = estado().lock().unwrap().pendiente.clone();
    let Some(p) = pendiente else {
        return Err("no hay conflicto pendiente de resolver".into());
    };
    let (config, lector) = match eleccion {
        "local" => (p.config_local, p.lector_local),
        "remota" => (p.config_remota, p.lector_remota),
        otro => return Err(format!("elección desconocida: {otro}")),
    };
    let token = acceso().await?;
    let cambios = aplicar(app, &config, lector.as_ref())?;
    subir_respaldo_actual(&token, Some(&p.remoto_id)).await?;
    set_estado(|e| {
        e.conflicto = None;
        e.pendiente = None;
    });
    log!("sync: conflicto resuelto ({eleccion}; cambios: {cambios:?})");
    Ok(snapshot().await)
}

/// Restauración aceptada: trae config + lector + registro del respaldo y sube.
/// "descartar" no sube nada y no vuelve a ofrecerla en esta ejecución.
pub async fn sync_restaurar(acepta: bool, app: tauri::AppHandle) -> Result<EstadoIpc, String> {
    set_estado(|e| e.restaurar = None);
    if !acepta {
        set_estado(|e| {
            e.restaurar_descartada = true;
            e.ultimo_error = None;
        });
        log!("sync: restauración descartada por el usuario (no se vuelve a ofertar en esta ejecución)");
        return Ok(snapshot().await);
    }
    con_registro(restaurar(&app).await)
}

pub async fn restaurar(app: &tauri::AppHandle) -> Result<EstadoIpc, String> {
    let token = acceso().await?;
    let remoto_id = drive_buscar_respaldo(&token)
        .await?
        .ok_or_else(|| "el respaldo dejó de existir en Drive".to_string())?;
    let texto = drive_bajar(&token, &remoto_id).await?;
    let remoto = parsear_respaldo(&texto)?;
    let cambios = aplicar(app, &remoto.datos.config, remoto.datos.lector.as_ref())?;
    // registro vacío: se copia tal cual (con sus horas); si entretanto se marcó algo, se mezcla
    let local = registro::load_all();
    let traer = if local.is_empty() { remoto.datos.registro.clone() } else { eventos_a_agregar(&local, &remoto.datos.registro) };
    agregar_al_registro(app, &traer)?;
    subir_respaldo_actual(&token, Some(&remoto_id)).await?;
    set_estado(|e| {
        e.restaurar_descartada = false;
        e.aviso = resumen_traido(&remoto.dispositivo, &cambios, traer.len());
    });
    log!("sync: restauración aplicada ({} evento(s) del respaldo)", traer.len());
    Ok(snapshot().await)
}

// --------------------------------------------------- subida diferida ---

const DEBOUNCE_SECS: u64 = 90;
const REINTENTO_SECS: u64 = 60;
const MAX_REINTENTOS: usize = 3;

#[derive(Debug, Default)]
pub struct Agendado {
    pub vence: Option<Instant>,
    pub reintento: usize,
}

pub static DIFERIDA: OnceLock<Mutex<Agendado>> = OnceLock::new();
pub static DIFERIDA_COND: OnceLock<Condvar> = OnceLock::new();
pub static EN_VUELO: AtomicBool = AtomicBool::new(false);
pub static HANDLE_DIFERIDO: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Baja EN_VUELO aun con return/panic en cualquier punto del sync.
pub struct EnVuelo;
impl Drop for EnVuelo {
    fn drop(&mut self) {
        EN_VUELO.store(false, Ordering::SeqCst);
    }
}

/// Un cambio local (marcar/config/lector) agenda o resetea la subida diferida.
pub fn avisar_cambio() {
    if !disponible() {
        return;
    }
    let mut l = DIFERIDA
        .get_or_init(|| Mutex::new(Agendado::default()))
        .lock()
        .unwrap();
    l.vence = Some(Instant::now() + Duration::from_secs(DEBOUNCE_SECS));
    l.reintento = 0;
    DIFERIDA_COND.get_or_init(Condvar::new).notify_all();
}

/// Arranca el worker de la subida diferida (el handle va del setup).
pub fn iniciar_diferido(handle: tauri::AppHandle) {
    let _ = HANDLE_DIFERIDO.set(handle);
    if let Err(e) = std::thread::Builder::new()
        .name("sync-diferido".into())
        .spawn(ciclo_diferido)
    {
        log!("sync diferido: no arrancó el worker: {e}");
    }
}

pub fn ciclo_diferido() {
    let agenda = DIFERIDA.get_or_init(|| Mutex::new(Agendado::default()));
    let cond = DIFERIDA_COND.get_or_init(Condvar::new);
    loop {
        // Espera: sin agenda, dormida con timeout largo; con agenda, hasta vencer
        // (y si entra un aviso nuevo, se re-agenda: el debounce es del último).
        let mut l = agenda.lock().unwrap();
        loop {
            let Some(vence) = l.vence else {
                let (g, _) = cond
                    .wait_timeout(l, Duration::from_secs(600))
                    .unwrap_or_else(|e| e.into_inner());
                l = g;
                continue;
            };
            match vence.checked_duration_since(Instant::now()) {
                Some(d) => {
                    let (g, aviso) = cond
                        .wait_timeout(l, d)
                        .unwrap_or_else(|e| e.into_inner());
                    l = g;
                    if !aviso.timed_out() {
                        continue; // reseteo del debounce: volver a esperar el silencio
                    }
                }
                None => break,
            }
        }
        // Venció el silencio: cierro la agenda antes de decidir.
        l.vence = None;
        let reintento = l.reintento;
        drop(l);
        if !disponible() {
            continue; // sin sesión todavía: la subida queda para el próximo aviso/arranque
        }
        if EN_VUELO.load(Ordering::SeqCst) {
            // Otro sync corre (manual/arranque/login): re-agendar, con tope.
            if reintento >= MAX_REINTENTOS {
                continue;
            }
            let mut l = agenda.lock().unwrap();
            l.reintento = reintento + 1;
            l.vence = Some(Instant::now() + Duration::from_secs(REINTENTO_SECS));
            continue;
        }
        let Some(app) = HANDLE_DIFERIDO.get() else { continue };
        match tauri::async_runtime::block_on(sync_core(app)) {
            Ok(_) => log!("sync diferido: respaldo actualizado"),
            // Sin tocar el estado de nuevo: sync_core ya dejó último_error para el panel.
            Err(e) => log!("sync diferido: {e}"),
        }
    }
}

// ---------------------------------------------------------------- tests ---

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(date: &str, prayer: &str, status: &str, ts: Option<i64>) -> RegistroEntry {
        RegistroEntry { date: date.into(), prayer: prayer.into(), status: status.into(), ts }
    }

    #[test]
    fn union_agrega_solo_lo_que_falta() {
        let local = vec![ev("2026-10-20", "Fajr", "rezado", Some(1)), ev("2026-10-21", "Dhuhr", "rezado", Some(2))];
        let remota = vec![
            ev("2026-10-20", "Fajr", "rezado", Some(1)),   // igual: no se agrega
            ev("2026-10-22", "Maghrib", "rezado", Some(3)), // nueva en remota
            ev("2026-10-22", "Isha", "adhan", Some(4)),     // automático: no viaja
        ];
        let nuevos = eventos_a_agregar(&local, &remota);
        assert_eq!(nuevos.len(), 1);
        assert_eq!(nuevos[0].date, "2026-10-22");
        assert_eq!(nuevos[0].ts, Some(3), "conserva la hora original");
    }

    #[test]
    fn gana_la_accion_mas_reciente() {
        // la otra PC desmarcó y después volvió a marcar: el re-marcado llega
        let local = vec![ev("2026-10-20", "Asr", "rezado", Some(10)), ev("2026-10-20", "Asr", "desmarcado", Some(20))];
        let remota = vec![ev("2026-10-20", "Asr", "rezado", Some(10)), ev("2026-10-20", "Asr", "desmarcado", Some(20)), ev("2026-10-20", "Asr", "rezado", Some(30))];
        let nuevos = eventos_a_agregar(&local, &remota);
        assert_eq!(nuevos.len(), 1);
        assert_eq!(nuevos[0].status, "rezado");
        // una acción local más nueva no se pisa
        let local = vec![ev("2026-10-20", "Asr", "desmarcado", Some(40))];
        assert!(eventos_a_agregar(&local, &remota).is_empty());
    }

    #[test]
    fn sin_hora_gana_la_marca() {
        // eventos anteriores a v0.1.16: un rezo marcado no se pierde
        let local = vec![ev("2026-10-20", "Isha", "rezado", None), ev("2026-10-20", "Isha", "desmarcado", None)];
        let remota = vec![ev("2026-10-20", "Isha", "rezado", None)];
        let nuevos = eventos_a_agregar(&local, &remota);
        assert_eq!(nuevos.len(), 1);
        assert_eq!(nuevos[0].status, "rezado");
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
