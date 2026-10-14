//! registro.jsonl — append-only, {date, prayer, status} según el spec.
//! Estados: adhan (disparó) | rezado (tadas marcados por el usuario) |
//! silenciado (cuando exista mute). Sin base de datos: JSONL con filas.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use chrono::Datelike;

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

/// estado rezado del día: true si el ÚLTIMO evento del rezo es "rezado"
/// (toggle: "desmarcado" deshace un "rezado" previo — append-only, last-wins)
pub fn is_prayer_marked(date: &str, prayer: &str) -> bool {
    last_status_for(date, prayer).as_deref() == Some("rezado")
}

/// último status registrado para un (date, prayer) — nil si nunca hubo evento
pub fn last_status_for(date: &str, prayer: &str) -> Option<String> {
    load_for_date(date)
        .into_iter()
        .rev()
        .find(|(p, _)| p == prayer)
        .map(|(_, s)| s)
}

#[derive(Debug, serde::Serialize)]
pub struct MarkedDay {
    pub date: String,
    pub prayers: Vec<String>,
}

/// Días de un mes ("YYYY-MM") que tienen al menos un rezo marcado hoy,
/// con la lista de rezos marcados (último evento gana) — para el calendario.
pub fn marked_for_month(month: &str) -> Vec<MarkedDay> {
    let parts: Vec<&str> = month.split('-').collect();
    if parts.len() != 2 {
        return Vec::new();
    }
    let Ok(y) = parts[0].parse::<i32>() else { return Vec::new() };
    let Ok(m) = parts[1].parse::<u32>() else { return Vec::new() };
    let days = chrono::NaiveDate::from_ymd_opt(y, m + 1, 1)
        .and_then(|d| d.pred_opt())
        .map(|d| d.day())
        .unwrap_or(30);
    let mut out = Vec::new();
    for d in 1..=days {
        let date = format!("{month}-{d:02}");
        let prayers: Vec<String> = crate::scheduler::PRAYERS
            .iter()
            .filter(|p| is_prayer_marked(&date, p))
            .cloned()
            .map(String::from)
            .collect();
        if !prayers.is_empty() {
            out.push(MarkedDay { date, prayers });
        }
    }
    out
}
