//! registro.jsonl — append-only, {date, prayer, status} según el spec.
//! Estados: adhan (disparó) | rezado (tadas marcados por el usuario) |
//! silenciado (cuando exista mute). Sin base de datos: JSONL con filas.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// mismo dir que config.json (regla del spec)
pub fn registro_path() -> PathBuf {
    crate::config::config_dir().join("registro.jsonl")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistroEntry {
    pub date: String,
    pub prayer: String,
    pub status: String,
}

// append serializado (el scheduler y el IPC comparten el archivo)
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn append(date: &str, prayer: &str, status: &str) -> Result<(), String> {
    let _g = WRITE_LOCK.lock().unwrap();
    let entry = RegistroEntry {
        date: date.to_string(),
        prayer: prayer.to_string(),
        status: status.to_string(),
    };
    let line = serde_json::to_string(&entry).map_err(|e| format!("serializar registro: {e}"))?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(registro_path())
        .map_err(|e| format!("abrir registro: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("append registro: {e}"))
}

/// pares (prayer, status) registrados para una fecha — para pintar ✓ y para
/// el estado inicial del día (sin rebuild del archivo completo)
pub fn load_for_date(date: &str) -> Vec<(String, String)> {
    let _g = WRITE_LOCK.lock().unwrap();
    let path = registro_path();
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter_map(|l| serde_json::from_str::<RegistroEntry>(l).ok())
        .filter(|e| e.date == date)
        .map(|e| (e.prayer, e.status))
        .collect()
}

/// estado rezado del día: true si hay al menos una entrada "rezado" del rezo
pub fn is_prayer_marked(date: &str, prayer: &str) -> bool {
    load_for_date(date)
        .iter()
        .any(|(p, s)| p == prayer && s == "rezado")
}
