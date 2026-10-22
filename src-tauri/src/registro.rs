//! registro.jsonl — append-only, {date, prayer, status} según el spec, más
//! `ts` (desde v0.1.16): el momento del evento, para ordenar los de varias
//! computadoras al sincronizar. Los eventos anteriores no lo tienen.
//! Estados: adhan (disparó) | perdido (la app no estuvo activa al horario) |
//! rezado (marcado por el usuario) | desmarcado (toggle que deshace un rezado) |
//! silenciado (cuando exista mute).
//! Sin base de datos: JSONL con filas; lectura con semántica last-wins.

use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::Datelike;
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
    /// Milisegundos desde 1970 (UTC) en que se registró el evento.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ts: Option<i64>,
}

// append serializado (el scheduler y el IPC comparten el archivo)
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn append(date: &str, prayer: &str, status: &str) -> Result<(), String> {
    append_entry(&RegistroEntry {
        date: date.to_string(),
        prayer: prayer.to_string(),
        status: status.to_string(),
        ts: Some(chrono::Utc::now().timestamp_millis()),
    })
}

/// Agrega un evento tal cual, con su hora original (eventos traídos del respaldo).
pub fn append_entry(entry: &RegistroEntry) -> Result<(), String> {
    let _g = WRITE_LOCK.lock().unwrap();
    let line = serde_json::to_string(entry).map_err(|e| format!("serializar registro: {e}"))?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(registro_path())
        .map_err(|e| format!("abrir registro: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("append registro: {e}"))
}

/// Las consultas IPC distinguen archivo inexistente de lectura fallida o dañada.
pub fn ensure_readable() -> Result<(), String> {
    let _guard = WRITE_LOCK.lock().map_err(|_| "No se pudo acceder al registro.")?;
    let text = match std::fs::read_to_string(registro_path()) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("No se pudo leer el registro; se conserva el archivo: {e}")),
    };
    for (i, line) in text.lines().enumerate() {
        if !line.trim().is_empty() {
            serde_json::from_str::<RegistroEntry>(line).map_err(|e| format!("El registro tiene un error en la línea {}; se conserva sin modificar: {e}", i + 1))?;
        }
    }
    Ok(())
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

/// Todas las entradas del registro en orden de archivo (para stats)
pub fn load_all() -> Vec<RegistroEntry> {
    let _g = WRITE_LOCK.lock().unwrap();
    let path = registro_path();
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    content
        .lines()
        .filter_map(|l| serde_json::from_str::<RegistroEntry>(l).ok())
        .collect()
}

/// ¿El último evento de (date, prayer) en el registro de `path` es "rezado"? Para el receptor de
/// alarmas de Android, que corre sin Tauri y recibe la ruta en vez de usar `config_dir`.
/// Nunca entra en pánico: ante cualquier problema de lectura responde que no está marcado.
pub fn marked_in(path: &std::path::Path, date: &str, prayer: &str) -> bool {
    std::fs::read_to_string(path)
        .map(|content| {
            content
                .lines()
                .filter_map(|l| serde_json::from_str::<RegistroEntry>(l).ok())
                .filter(|e| e.date == date && e.prayer.eq_ignore_ascii_case(prayer))
                .last()
                .is_some_and(|e| e.status == "rezado")
        })
        .unwrap_or(false)
}

/// último status registrado para un (date, prayer) — None si nunca hubo evento
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

/// Días de un mes ("YYYY-MM") que tienen al menos un rezo marcado, con la
/// lista de rezos marcados (último evento gana) — para el calendario.
pub fn marked_for_month(month: &str) -> Vec<MarkedDay> {
    let parts: Vec<&str> = month.split('-').collect();
    if parts.len() != 2 {
        return Vec::new();
    }
    let Ok(y) = parts[0].parse::<i32>() else {
        return Vec::new();
    };
    let Ok(m) = parts[1].parse::<u32>() else {
        return Vec::new();
    };
    if !(1..=12).contains(&m) {
        return Vec::new();
    }
    let (next_y, next_m) = if m == 12 { (y.checked_add(1), 1) } else { (Some(y), m + 1) };
    let days = next_y
        .and_then(|year| chrono::NaiveDate::from_ymd_opt(year, next_m, 1))
        .and_then(|d| d.pred_opt())
        .map(|d| d.day())
        .unwrap_or(0);
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

// ---------------------------------------------------------------- stats ----

/// Rachas y totales derivados del registro (filosofía "App Vida como Juego").
/// Día completo = los 5 rezos con último evento "rezado".
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct Stats {
    /// días consecutivos completos hasta hoy (o hasta ayer si el día de hoy
    /// aún no cerró — `activa_hoy` lo distingue)
    pub racha_actual: u32,
    pub activa_hoy: bool,
    pub mejor_racha: u32,
    /// total de días con los 5 marcados en todo el historial
    pub dias_completos: u32,
    /// rezos marcados en estado final (día×rezo, resuelto last-wins)
    pub rezos_marcados: u32,
}

/// Núcleo puro de stats: sobre entradas ya cargadas y una fecha "hoy" fija
/// (la lectura de archivo vive en `stats()`, usada por el comando IPC)
pub fn stats_from(entries: &[RegistroEntry], hoy: &str) -> Stats {
    use chrono::NaiveDate;

    // estado final por (fecha, rezo): el orden del archivo manda (last-wins)
    let mut resuelto: std::collections::BTreeMap<
        String,
        std::collections::BTreeMap<String, String>,
    > = Default::default();
    for e in entries {
        if e.date.as_str() > hoy {
            continue; // ignora fechas futuras si llegaran a aparecer
        }
        resuelto
            .entry(e.date.clone())
            .or_default()
            .insert(e.prayer.clone(), e.status.clone());
    }

    let completo: std::collections::BTreeMap<&str, bool> = resuelto
        .iter()
        .map(|(d, m)| {
            (
                d.as_str(),
                crate::scheduler::PRAYERS
                    .iter()
                    .all(|p| m.get(*p).map(|s| s.as_str()) == Some("rezado")),
            )
        })
        .collect();

    fn prev_dia(d: NaiveDate) -> Option<NaiveDate> {
        d.pred_opt()
    }

    // racha actual: camina hacia atrás desde hoy, o desde ayer si el día de
    // hoy todavía no finalizó (los 5 pueden acomodarse durante el día)
    let mut racha_actual = 0u32;
    let mut activa_hoy = false;
    if let Ok(h) = NaiveDate::parse_from_str(hoy, "%Y-%m-%d") {
        let hoy_completo = completo.get(hoy).copied().unwrap_or(false);
        let mut cursor = if hoy_completo {
            activa_hoy = true;
            Some(h)
        } else {
            prev_dia(h)
        };
        while let Some(d) = cursor {
            let key = d.format("%Y-%m-%d").to_string();
            if completo.get(key.as_str()).copied().unwrap_or(false) {
                racha_actual += 1;
                cursor = prev_dia(d);
            } else {
                cursor = None;
            }
        }
    }

    // mejor racha + días completos: scan ascendente
    let mut mejor = 0u32;
    let mut run = 0u32;
    let mut dias_completos = 0u32;
    let mut prev_completa = false;
    let mut prev_d: Option<NaiveDate> = None;
    for (d, c) in completo.iter() {
        if *c {
            dias_completos += 1;
            let consecutiva = prev_d
                .and_then(|pp| {
                    pp.succ_opt().map(|p| p.format("%Y-%m-%d").to_string() == *d)
                })
                .unwrap_or(false);
            run = if consecutiva && prev_completa {
                run + 1
            } else {
                1
            };
            mejor = mejor.max(run);
        } else {
            run = 0;
        }
        prev_completa = *c;
        prev_d = NaiveDate::parse_from_str(d, "%Y-%m-%d").ok();
    }

    let rezos_marcados = resuelto
        .values()
        .map(|m| m.values().filter(|s| s.as_str() == "rezado").count())
        .sum::<usize>() as u32;

    Stats {
        racha_actual,
        activa_hoy,
        mejor_racha: mejor,
        dias_completos,
        rezos_marcados,
    }
}

/// Wrapper para el IPC: lee el registro real y calcula con la fecha del sistema
pub fn stats() -> Stats {
    let hoy = chrono::Local::now().format("%Y-%m-%d").to_string();
    stats_from(&load_all(), &hoy)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(date: &str, prayer: &str, status: &str) -> RegistroEntry {
        RegistroEntry {
            date: date.into(),
            prayer: prayer.into(),
            status: status.into(),
            ts: None,
        }
    }

    #[test]
    fn dias_completos_y_totales() {
        // un día completo y un día a medias
        let mut e = Vec::new();
        for p in crate::scheduler::PRAYERS {
            e.push(entry("2026-10-14", p, "rezado"));
        }
        e.push(entry("2026-10-15", "Fajr", "rezado"));
        let s = stats_from(&e, "2026-10-15");
        assert_eq!(s.dias_completos, 1);
        assert_eq!(s.rezos_marcados, 6); // 5 + 1 (hoy a medias)
        assert_eq!(s.mejor_racha, 1);
        // hoy incompleto, ayer completo: la racha vive desde ayer (no cierra hoy)
        assert_eq!(s.racha_actual, 1);
        assert!(!s.activa_hoy);
    }

    #[test]
    fn racha_en_curso_hoy_y_mejor() {
        let mut e = Vec::new();
        for p in crate::scheduler::PRAYERS {
            e.push(entry("2026-10-14", p, "rezado"));
            e.push(entry("2026-10-15", p, "rezado"));
        }
        let s = stats_from(&e, "2026-10-15");
        assert_eq!(s.racha_actual, 2);
        assert!(s.activa_hoy);
        assert_eq!(s.mejor_racha, 2);
        assert_eq!(s.dias_completos, 2);
        assert_eq!(s.rezos_marcados, 10);
    }

    #[test]
    fn desmarcado_rompe_el_dia() {
        let mut e = Vec::new();
        for p in crate::scheduler::PRAYERS {
            e.push(entry("2026-10-15", p, "rezado"));
        }
        e.push(entry("2026-10-15", "Asr", "desmarcado")); // last-wins
        let s = stats_from(&e, "2026-10-15");
        assert_eq!(s.dias_completos, 0); // Asr quedó desmarcado
        assert_eq!(s.rezos_marcados, 4);
        assert_eq!(s.racha_actual, 0);
    }

    #[test]
    fn gap_de_dias_corta_la_racha() {
        let mut e = Vec::new();
        // 2 días consecutivos completos
        for p in crate::scheduler::PRAYERS {
            e.push(entry("2026-10-10", p, "rezado"));
            e.push(entry("2026-10-11", p, "rezado"));
        }
        // día 12 sin registro (gap), el 13 se completa: la mejor sigue 2
        for p in crate::scheduler::PRAYERS {
            e.push(entry("2026-10-13", p, "rezado"));
        }
        let s = stats_from(&e, "2026-10-13");
        assert_eq!(s.mejor_racha, 2);
        assert_eq!(s.racha_actual, 1); // solo hoy (el 13)
        assert_eq!(s.dias_completos, 3);
    }
}
