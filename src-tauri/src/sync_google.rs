//! Respaldo y sincronización con Google Drive — escritorio.
//!
//! Este módulo es el wrapper desktop que implementa:
//! - Token storage usando keyring del sistema
//! - OAuth con loopback (abre navegador + TCP listener)
//!
//! Toda la lógica compartida (Drive API, merge, estado) está en `sync_core.rs`.
//!
//! Diseño y decisiones en `docs/sincronizacion-google.md` (spike aprobado
//! `spikes/gdrive-sync/spike.mjs`: OAuth desktop PKCE + loopback, refresh
//! token en el keyring del sistema, un solo archivo
//! `adhan-companion-backup.json` invisible en Drive).

use std::io::Read;
use std::net::TcpListener;
use std::sync::atomic::Ordering;

use crate::sync_core::{
    self, auth_url, b64url, client_id, client_secret, error_token, token_load, token_save,
    Callback, TokensJson, CLIENT_ID_FALLBACK, CANCELADO, OAUTH_TIMEOUT_SECS, TOKEN_URL,
};

// --------------------------------------------------------------- keyring ---

const KEYRING_SERVICE: &str = "adhan-companion-google-refresh";
const KEYRING_USER: &str = "oauth";

/// Err(None) = sin entrada (sin sesión); Err(Some(msg)) = keyring falló de verdad.
pub fn token_del_keyring() -> Result<String, Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| Some(format!("keyring no disponible: {e}")))?;
    match entry.get_password() {
        Ok(t) if !t.trim().is_empty() => Ok(t),
        Ok(_) => Err(None),
        Err(keyring::Error::NoEntry) => Err(None),
        Err(e) => Err(Some(format!("keyring: {e}"))),
    }
}

pub fn guardar_token(refresh: &str) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring no disponible: {e}"))?;
    entry
        .set_password(refresh.trim())
        .map_err(|e| format!("guardar token en el keyring: {e}"))
}

pub fn borrar_token() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("keyring no disponible: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("borrar token del keyring: {e}")),
    }
}

// ------------------------------------------------------------------ OAuth ---

/// Abre el navegador del sistema (desktop: Linux/Windows).
pub fn abrir_navegador(url: &str) -> bool {
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

/// Servidor loopback efímero: escucha el callback del navegador. No bloquea:
/// revisa cada 150 ms el límite de 5 min y el pedido de cancelar. Responde 404
/// y sigue escuchando ante pedidos que no son el callback (favicon, conexiones
/// adelantadas del navegador). Se llama dentro de `spawn_blocking`.
pub fn esperar_callback(listener: TcpListener, state_esperado: &str) -> Result<Callback, String> {
    let límite = std::time::Instant::now() + std::time::Duration::from_secs(OAUTH_TIMEOUT_SECS);
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("puerto de retorno: {e}"))?;
    loop {
        if CANCELADO.load(Ordering::SeqCst) {
            return Err("conexión cancelada".into());
        }
        if std::time::Instant::now() > límite {
            return Err("se pasó el tiempo esperando la autorización (5 min)".into());
        }
        let mut stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(std::time::Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(format!("puerto de retorno: {e}")),
        };
        // una conexión que no manda nada no puede trabar la espera
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(3)));
        let mut buf = [0u8; 8192];
        let n = match stream.read(&mut buf) {
            Ok(n) if n > 0 => n,
            _ => continue,
        };
        let primera = String::from_utf8_lossy(&buf[..n]);
        let request = primera.split("\r\n").next().unwrap_or("");
        // GET /?code=...&state=... HTTP/1.1
        let Some(destino) = request.split_whitespace().nth(1) else { continue };
        let query = destino.split_once('?').map(|(_, q)| q).unwrap_or("");
        let mut code = None;
        let mut error_param = None;
        let mut state = None;
        for par in query.split('&') {
            let (k, v) = par.split_once('=').unwrap_or((par, ""));
            match k {
                "code" => code = Some(self::sync_core::urldecode(v)),
                "error" => error_param = Some(self::sync_core::urldecode(v)),
                "state" => state = Some(self::sync_core::urldecode(v)),
                _ => {}
            }
        }
        if code.is_none() && error_param.is_none() {
            responder(&mut stream, "404 Not Found", "ruta desconocida");
            continue;
        }
        if state.as_deref() != Some(state_esperado) {
            responder(
                &mut stream,
                "400 Bad Request",
                "La autorización no corresponde a este pedido y se descartó. Volvé a la app y conectá de nuevo.",
            );
            return Err("la respuesta de Google no coincide con el pedido (state) y se descartó".into());
        }
        if let Some(error) = error_param {
            responder(
                &mut stream,
                "200 OK",
                "Autorización rechazada. Podés cerrar esta pestaña y volver a la app.",
            );
            return Ok(Callback {
                code: None,
                error: Some(error),
            });
        }
        responder(
            &mut stream,
            "200 OK",
            "Autorización recibida. Podés cerrar esta pestaña y volver a la app.",
        );
        return Ok(Callback { code, error: None });
    }
}

fn responder(stream: &mut std::net::TcpStream, status: &str, cuerpo: &str) {
    use std::io::Write;
    let pag = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{cuerpo}",
        cuerpo.len()
    );
    let _ = stream.write_all(pag.as_bytes());
    let _ = stream.flush();
}

// -------------------------------------------------------------- comandos ---

/// Inicia la vinculación: abre el navegador con la pantalla de Google, recibe
/// el callback en un puerto efímero y guarda el refresh token en el keyring.
#[tauri::command]
pub async fn sync_login() -> Result<self::sync_core::EstadoIpc, String> {
    use self::sync_core::{set_estado, snapshot, estado};
    
    if token_load().is_ok() || estado().lock().unwrap().conectando {
        return Ok(snapshot().await); // ya hay sesión o una espera en curso
    }
    if client_id() == CLIENT_ID_FALLBACK {
        set_estado(|e| {
            e.ultimo_error =
                Some("la credencial de Google no está configurada en esta build".into());
        });
        return Ok(snapshot().await);
    }
    CANCELADO.store(false, Ordering::SeqCst);
    set_estado(|e| {
        e.conectando = true;
        e.ultimo_error = None;
    });
    let resultado = crear_sesion().await;
    let cancelado = CANCELADO.swap(false, Ordering::SeqCst);
    set_estado(|e| {
        e.conectando = false;
        e.url_autorizacion = None;
        if let Err(falla) = &resultado {
            if !cancelado {
                e.ultimo_error = Some(falla.clone());
            }
        }
    });
    Ok(snapshot().await)
}

/// «Cancelar» mientras se espera la autorización en el navegador.
#[tauri::command]
pub async fn sync_cancelar() -> Result<self::sync_core::EstadoIpc, String> {
    use self::sync_core::{estado, snapshot};
    
    if estado().lock().unwrap().conectando {
        CANCELADO.store(true, Ordering::SeqCst);
    }
    Ok(snapshot().await)
}

async fn crear_sesion() -> Result<(), String> {
    use self::sync_core::cliente_http;
    use sha2::{Digest, Sha256};
    
    // loopback en puerto efímero: el redirect_uri exacto se captura antes de cerrar
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("no pude abrir el puerto de retorno: {e}"))?;
    let redirect = format!(
        "http://127.0.0.1:{}",
        listener.local_addr().map_err(|e| e.to_string())?.port()
    );
    let verifier = b64url(&self::sync_core::azar(32)?);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = b64url(&self::sync_core::azar(16)?);
    let url = auth_url(&challenge, &state, &redirect);
    // la UI la muestra para copiar si el navegador no abrió (cae validada en el spike)
    self::sync_core::set_estado(|e| e.url_autorizacion = Some(url.clone()));

    // navegador (bloqueante: spawn)
    let abrir = url.clone();
    let abierto = tauri::async_runtime::spawn_blocking(move || abrir_navegador(&abrir))
        .await
        .unwrap_or(false);
    if !abierto {
        crate::log!("sync: el navegador no abrió; la UI muestra la URL de autorización");
    }

    // callback (hasta 5 min o «Cancelar») fuera del runtime async
    let cb = tauri::async_runtime::spawn_blocking(move || esperar_callback(listener, &state))
        .await
        .map_err(|_| "espera de autorización cancelada".to_string())?;
    let cb = cb?;
    if let Some(err) = cb.error {
        return Err(format!("Google rechazó: {err} — podés reintentar"));
    }
    let code = cb
        .code
        .ok_or_else(|| "callback sin código de autorización".to_string())?;

    // canje del código por tokens (Google pide el client_secret también en clientes Desktop)
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
    token_save(&refresh)?;
    crate::log!(
        "sync: sesión activa (scope: {})",
        tokens.scope.as_deref().unwrap_or("?")
    );
    Ok(())
}

/// Chequeo al arrancar (deferrado; invocado por desktop.rs). Mismo flujo que el
/// botón: restauración/conflicto quedan detenidos en el estado — la UI los consulta.
pub async fn al_arrancar(app: tauri::AppHandle) {
    use self::sync_core::{con_registro, sync_core, disponible};
    
    if !disponible() {
        return;
    }
    if let Err(e) = con_registro(sync_core(&app).await) {
        crate::log!("sync al arrancar: {e}");
    }
}

// Comandos de Tauri (wrappers que llaman a sync_core)
#[tauri::command]
pub async fn sync_estado() -> Result<self::sync_core::EstadoIpc, String> {
    self::sync_core::sync_estado().await
}

#[tauri::command]
pub async fn sync_logout() -> Result<self::sync_core::EstadoIpc, String> {
    self::sync_core::sync_logout().await
}

#[tauri::command]
pub async fn sync_ahora(app: tauri::AppHandle) -> Result<self::sync_core::EstadoIpc, String> {
    self::sync_core::sync_ahora(app).await
}

#[tauri::command]
pub async fn sync_resolver(eleccion: String, app: tauri::AppHandle) -> Result<self::sync_core::EstadoIpc, String> {
    self::sync_core::sync_resolver(eleccion, app).await
}

#[tauri::command]
pub async fn sync_restaurar(acepta: bool, app: tauri::AppHandle) -> Result<self::sync_core::EstadoIpc, String> {
    self::sync_core::sync_restaurar(acepta, app).await
}

// Re-exportar funciones públicas de sync_core para que otros módulos las usen
pub use self::sync_core::{
    avisar_cambio, disponible, iniciar_diferido,
};
