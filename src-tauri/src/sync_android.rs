//! Respaldo y sincronización con Google Drive — Android.
//!
//! Wrapper Android sobre `sync_core.rs`. Acá vive lo específico de Android:
//! - Token storage: archivo privado `google-oauth.json` junto al config
//!   (consistente con el resto de la app; para leerlo hace falta root).
//! - OAuth: navegador del sistema vía intent VIEW; la vuelta llega al scheme
//!   auto-registrado `com.googleusercontent.apps.<client-id>:/oauth2redirect`
//!   (Google bloqueó los custom schemes propios en Android) a MainActivity,
//!   que entrega el URI al Rust por polling del plugin.
//! - Sin `client_secret`: el cliente Google de tipo «Android» no lo lleva.
//!
//! # Estados y transiciones (idénticos al escritorio, ver sync_google.rs)
//! `sin_sesion` → «Conectar» → `conectando` (custom scheme, máx. 5 min) →
//! `activa`; error o revocación → `sin_sesion` con mensaje. Cancelable.

use std::time::{Duration, Instant};

use crate::sync_core::{token_load, token_save, EstadoIpc, TokensJson};

// ---------------------------------------------------------- token storage ---

fn token_file_path() -> std::path::PathBuf {
    crate::config::config_dir().join("google-oauth.json")
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct TokenData {
    refresh_token: String,
}

/// Carga el refresh token del archivo. Err(None) = sin sesión; Err(Some) = falla real.
pub fn token_from_file() -> Result<String, Option<String>> {
    let path = token_file_path();
    if !path.exists() {
        return Err(None);
    }
    match std::fs::read_to_string(&path) {
        Ok(texto) => match serde_json::from_str::<TokenData>(&texto) {
            Ok(d) if !d.refresh_token.trim().is_empty() => Ok(d.refresh_token),
            Ok(_) => Err(None),
            Err(e) => Err(Some(format!("token ilegible: {e}"))),
        },
        Err(e) => Err(Some(format!("leyendo token: {e}"))),
    }
}

/// Guarda el refresh token (escritura atómica como el resto de la app).
pub fn token_to_file(refresh: &str) -> Result<(), String> {
    let path = token_file_path();
    let data = TokenData { refresh_token: refresh.trim().to_string() };
    let texto = serde_json::to_vec_pretty(&data).map_err(|e| format!("serializando token: {e}"))?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, texto).map_err(|e| format!("guardando token: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("guardando token: {e}")
    })
}

/// Borra el refresh token del archivo.
pub fn token_delete_file() -> Result<(), String> {
    let path = token_file_path();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("borrando token: {e}"))
    } else {
        Ok(())
    }
}

// ---------------------------------------------------------- OAuth Android ---

/// Cada cuánto consulta el plugin si ya llegó la vuelta del navegador.
const POLL_MS: u64 = 500;

/// Abre el navegador del sistema con la pantalla de autorización (la vuelta del
/// navegador la gestiona MainActivity vía custom scheme).
#[cfg(target_os = "android")]
fn abrir_autorizacion(url: &str) -> Result<(), String> {
    crate::android_alerts::call("oauthStart", serde_json::json!({ "url": url }))
        .map(|_| ())
        .map_err(|e| format!("abriendo el navegador: {e} — la URL queda en el panel para copiarla"))
}

/// Espera la vuelta del navegador: consulta el plugin cada POLL_MS hasta que
/// MainActivity registró el URI del redirect (o venció el plazo / se canceló).
#[cfg(target_os = "android")]
fn esperar_callback() -> Result<String, String> {
    let límite = Instant::now() + Duration::from_secs(crate::sync_core::OAUTH_TIMEOUT_SECS);
    loop {
        if crate::sync_core::CANCELADO.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("conexión cancelada".into());
        }
        if Instant::now() > límite {
            return Err("se pasó el tiempo esperando la autorización (5 min)".into());
        }
        if let Some(uri) = crate::android_alerts::call("oauthConsume", serde_json::json!({}))?
            .get("callback")
            .and_then(|c| c.as_str())
            .map(str::to_string)
        {
            return Ok(uri); // MainActivity rellena el hueco; consumirlo lo limpia
        }
        std::thread::sleep(Duration::from_millis(POLL_MS));
    }
}

#[cfg(not(target_os = "android"))]
fn abrir_autorizacion(_url: &str) -> Result<(), String> {
    Err("El flujo OAuth de Android no está disponible fuera de Android.".into())
}

#[cfg(not(target_os = "android"))]
fn esperar_callback() -> Result<String, String> {
    Err("El flujo OAuth de Android no está disponible fuera de Android.".into())
}

/// `pkg:/oauth2redirect?code=...&state=...` → Callback (parseo compartido en sync_core).

/// Todo el flujo de vinculación Android: abre el navegador, espera el callback,
/// canjea el código por tokens y guarda el refresh token en el archivo privado.
#[cfg(target_os = "android")]
async fn crear_sesion() -> Result<(), String> {
    use sha2::{Digest, Sha256};

    use crate::sync_core::{
        auth_url, azar, b64url, error_token, parsear_callback, platform_client_id, redirect_android,
        set_estado,
    };

    // PRIMERO la URL en el panel: si el navegador no abre, queda para copiar.
    // redirect: com.googleusercontent.apps.<client>:/oauth2redirect (auto-registrado).
    let redirect = redirect_android()?;
    let verifier = b64url(&azar(32)?);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = b64url(&azar(16)?);
    let url = auth_url(&challenge, &state, &redirect);
    set_estado(|e| e.url_autorizacion = Some(url.clone()));

    abrir_autorizacion(&url)?;

    // La espera es bloqueante (polling cada 500 ms): fuera del runtime async.
    let uri = tauri::async_runtime::spawn_blocking(esperar_callback)
        .await
        .map_err(|_| "espera de autorización cancelada".to_string())??;

    // El state tiene que ser el mismo que fue en la petición original.
    let cb = parsear_callback(&uri)?;
    if cb.state.as_deref() != Some(state.as_str()) {
        return Err("la respuesta de Google no coincide con el pedido (state) y se descartó".into());
    }
    if let Some(err) = &cb.error {
        return Err(format!("Google rechazó: {err} — podés reintentar"));
    }
    let code = cb.code.ok_or_else(|| "callback sin código de autorización".to_string())?;

    // Canje del código por tokens (sin client_secret: cliente tipo «Android»).
    let pares: Vec<(&str, String)> = vec![
        ("client_id", platform_client_id().to_string()),
        ("code", code),
        ("code_verifier", verifier),
        ("redirect_uri", redirect),
        ("grant_type", "authorization_code".into()),
    ];
    let tokens = crate::sync_core::cliente_http()
        .post(crate::sync_core::TOKEN_URL)
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
    token_save(&refresh)?;
    crate::log!(
        "sync: sesión activa (scope: {})",
        tokens.scope.as_deref().unwrap_or("?")
    );
    Ok(())
}

#[cfg(not(target_os = "android"))]
async fn crear_sesion() -> Result<(), String> {
    Err("El flujo OAuth de Android no está disponible fuera de Android.".into())
}

// --------------------------------------------------------- comandos (UI) ---

/// Estado del sync para el panel (misma contract que el escritorio).
#[tauri::command]
pub async fn sync_estado() -> Result<EstadoIpc, String> {
    crate::sync_core::sync_estado().await
}

/// «Conectar con Google»: abre el navegador y espera la autorización por
/// custom scheme (hasta 5 min). Ya con sesión o esperando, no repite el pedido.
#[tauri::command]
pub async fn sync_login() -> Result<EstadoIpc, String> {
    if token_load().is_ok() || crate::sync_core::estado().lock().unwrap().conectando {
        return Ok(crate::sync_core::snapshot().await); // ya hay sesión o una espera en curso
    }
    if crate::sync_core::sin_credencial() {
        crate::sync_core::set_estado(|e| {
            e.ultimo_error = Some("la credencial de Google no está configurada en esta build".into());
        });
        return Ok(crate::sync_core::snapshot().await);
    }
    crate::sync_core::CANCELADO.store(false, std::sync::atomic::Ordering::SeqCst);
    crate::sync_core::set_estado(|e| {
        e.conectando = true;
        e.ultimo_error = None;
    });
    let resultado = crear_sesion().await;
    let cancelado = crate::sync_core::CANCELADO.swap(false, std::sync::atomic::Ordering::SeqCst);
    crate::sync_core::set_estado(|e| {
        e.conectando = false;
        e.url_autorizacion = None;
        if let Err(falla) = &resultado {
            if !cancelado {
                e.ultimo_error = Some(falla.clone());
            }
        }
    });
    Ok(crate::sync_core::snapshot().await)
}

/// «Cancelar» mientras se espera la autorización en el navegador.
#[tauri::command]
pub async fn sync_cancelar() -> Result<EstadoIpc, String> {
    if crate::sync_core::estado().lock().unwrap().conectando {
        crate::sync_core::CANCELADO.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(crate::sync_core::snapshot().await)
}

/// Cerrar sesión: revoca el token en Google y borra storage + base local.
#[tauri::command]
pub async fn sync_logout() -> Result<EstadoIpc, String> {
    crate::sync_core::sync_logout().await
}

/// «Sincronizar ahora» (manual): baja el respaldo, aplica las reglas y sube.
#[tauri::command]
pub async fn sync_ahora(app: tauri::AppHandle) -> Result<EstadoIpc, String> {
    crate::sync_core::con_registro(crate::sync_core::sync_core(&app).await)
}

/// Resolución del conflicto: «local» o «remota», solo lo que cambió en las dos.
#[tauri::command]
pub async fn sync_resolver(eleccion: String, app: tauri::AppHandle) -> Result<EstadoIpc, String> {
    crate::sync_core::con_registro(crate::sync_core::sync_resolver(eleccion, app).await)
}

/// Restauración aceptada/descartada (registro local vacío con historial remoto).
#[tauri::command]
pub async fn sync_restaurar(acepta: bool, app: tauri::AppHandle) -> Result<EstadoIpc, String> {
    crate::sync_core::con_registro(crate::sync_core::sync_restaurar(acepta, app).await)
}
