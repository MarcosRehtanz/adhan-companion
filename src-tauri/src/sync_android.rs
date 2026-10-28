//! Respaldo y sincronización con Google Drive — Android.
//!
//! Este módulo implementa el token storage para Android usando un archivo privado
//! en el directorio de datos de la app (similar a como se maneja el config).
//!
//! La lógica compartida (Drive API, merge, estado) está en `sync_core.rs`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// --------------------------------------------------------------- paths ---

/// Ruta del archivo donde guardamos el refresh token (privado, solo accesible por la app).
fn token_file_path() -> PathBuf {
    crate::config::config_dir().join("google-oauth.json")
}

/// Estructura para serializar/deserializar el token.
#[derive(Debug, Serialize, Deserialize)]
struct TokenData {
    refresh_token: String,
}

// --------------------------------------------------------------- keyring ---

/// Carga el refresh token del archivo privado.
/// - `Ok(token)` = hay sesión activa
/// - `Err(None)` = no hay token guardado
/// - `Err(Some(msg))` = error de lectura
pub fn token_from_file() -> Result<String, Option<String>> {
    let path = token_file_path();
    if !path.exists() {
        return Err(None); // No hay token todavía
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<TokenData>(&content) {
            Ok(data) if !data.refresh_token.trim().is_empty() => Ok(data.refresh_token),
            Ok(_) => Err(None), // Archivo vacío o token vacío
            Err(e) => Err(Some(format!("token ilegible: {e}"))),
        },
        Err(e) => Err(Some(format!("leyendo token: {e}"))),
    }
}

/// Guarda el refresh token en el archivo privado.
pub fn token_to_file(refresh: &str) -> Result<(), String> {
    let path = token_file_path();
    let data = TokenData {
        refresh_token: refresh.trim().to_string(),
    };
    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("serializando token: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("guardando token: {e}"))
}

/// Borra el refresh token del archivo privado.
pub fn token_delete_file() -> Result<(), String> {
    let path = token_file_path();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("borrando token: {e}"))
    } else {
        Ok(()) // Ya no existía
    }
}

// TODO: Fase 3 - Implementar OAuth con Custom Tab
// - Plugin Kotlin para abrir Custom Tab con URL de autorización
// - Interceptación del custom scheme redirect
// - Canje del código por tokens
// - sync_login() y sync_cancelar() para Android
