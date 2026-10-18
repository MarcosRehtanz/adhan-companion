//! config.json — `~/.config/adhan-companion/config.json` con schema
//! compatible con `casa/adhan/config` del nodo.

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use chrono::{Local, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use crate::prayer::{HighLatRule, Madhab, Method};

/// directorio del config: el spec fija `~/.config/adhan-companion/` (no el
/// appid de Tauri) para que el schema del config sea idéntico al nodo
pub fn config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            return PathBuf::from(app_data).join("Adhan Companion");
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return PathBuf::from(profile)
                .join("AppData")
                .join("Roaming")
                .join("Adhan Companion");
        }
        return std::env::temp_dir().join("Adhan Companion");
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".config").join("adhan-companion")
    }
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Variante por nombre del config schema del nodo: "MWL", "Shafi", "AqrabAlAyyam"…"
impl Serialize for Method {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let repr = match self {
            Method::Mwl => "MWL",
            Method::Isna => "ISNA",
            Method::Egypt => "Egypt",
            Method::Makkah => "Makkah",
            Method::Karachi => "Karachi",
            Method::Tehran => "Tehran",
            Method::Jafari => "Jafari",
            Method::Custom => "Custom",
        };
        s.serialize_str(repr)
    }
}

impl<'de> Deserialize<'de> for Method {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let repr = String::deserialize(d)?;
        Ok(match repr.as_str() {
            "MWL" => Method::Mwl,
            "ISNA" => Method::Isna,
            "Egypt" => Method::Egypt,
            "Makkah" => Method::Makkah,
            "Karachi" => Method::Karachi,
            "Tehran" => Method::Tehran,
            "Jafari" => Method::Jafari,
            "Custom" => Method::Custom,
            _ => Method::Mwl,
        })
    }
}

impl Serialize for Madhab {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let repr = match self {
            Madhab::Shafi => "Shafi",
            Madhab::Hanafi => "Hanafi",
        };
        s.serialize_str(repr)
    }
}

impl<'de> Deserialize<'de> for Madhab {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let repr = String::deserialize(d)?;
        Ok(match repr.as_str() {
            "Hanafi" => Madhab::Hanafi,
            _ => Madhab::Shafi,
        })
    }
}

impl Serialize for HighLatRule {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let repr = match self {
            HighLatRule::None => "None",
            HighLatRule::MiddleOfNight => "MiddleOfNight",
            HighLatRule::AngleBased => "AngleBased",
            HighLatRule::AqrabAlAyyam => "AqrabAlAyyam",
            HighLatRule::AqrabAlBilad => "AqrabAlBilad",
            HighLatRule::OneSeventh => "OneSeventh",
            HighLatRule::FixedAngle => "FixedAngle",
        };
        s.serialize_str(repr)
    }
}

impl<'de> Deserialize<'de> for HighLatRule {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let repr = String::deserialize(d)?;
        Ok(match repr.as_str() {
            "None" => HighLatRule::None,
            "MiddleOfNight" => HighLatRule::MiddleOfNight,
            "AngleBased" => HighLatRule::AngleBased,
            "AqrabAlAyyam" => HighLatRule::AqrabAlAyyam,
            "AqrabAlBilad" => HighLatRule::AqrabAlBilad,
            "OneSeventh" => HighLatRule::OneSeventh,
            "FixedAngle" => HighLatRule::FixedAngle,
            _ => HighLatRule::AqrabAlAyyam,
        })
    }
}

/// offsets por rezo — keys lowercase como en el schema del nombre del nodo
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
pub struct Offsets {
    #[serde(default)]
    pub fajr: i32,
    #[serde(default)]
    pub dhuhr: i32,
    #[serde(default)]
    pub asr: i32,
    #[serde(default)]
    pub maghrib: i32,
    #[serde(default)]
    pub isha: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AudioConfig {
    #[serde(default = "default_volume")]
    pub volume: u8,
    #[serde(default)]
    pub enabled: Enabled,
    // asignación de muecín: FIJA por rezo (colección Doha — cada oración suena
    // su propio adhan). Sin selector ni mapas de config — decisión 2026-10-15.
}

impl Default for AudioConfig {
    fn default() -> Self {
        // Defaults del schema del spec: volumen 70 y los 5 rezos habilitados
        Self {
            volume: default_volume(),
            enabled: crate::scheduler::PRAYERS
                .iter()
                .map(|p| (p.to_lowercase(), true))
                .collect(),
        }
    }
}

pub type Enabled = std::collections::BTreeMap<String, bool>;

fn default_volume() -> u8 { 70 }

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Notice {
    #[serde(rename = "minutes_before", default = "default_notice")]
    pub minutes_before: i32,
}

fn default_notice() -> i32 { 10 }

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct AgentConfig {
    #[serde(default)]
    pub mqtt: bool,
    #[serde(default)]
    pub broker: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub version: u8,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub lat: f64,
    #[serde(default)]
    pub lon: f64,
    #[serde(default)]
    pub tz: String,
    #[serde(default = "default_method")]
    pub method: Method,
    #[serde(default)]
    pub madhab: Madhab,
    // nombre camelCase DEL schema compatible MQTT del nodo — no tocar
    #[allow(non_snake_case)]
    #[serde(default)]
    pub highLatRule: HighLatRule,
    #[serde(default)]
    pub offsets: Offsets,
    #[serde(default)]
    pub audio: AudioConfig,
    #[serde(default)]
    pub notice: Notice,
    #[serde(default)]
    pub agent: AgentConfig,
}

fn default_method() -> Method { Method::Mwl }

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            city: String::from("Buenos Aires"),
            lat: -34.61,
            lon: -58.38,
            tz: String::from("America/Argentina/Buenos_Aires"),
            method: Method::Mwl,
            madhab: Madhab::Shafi,
            highLatRule: HighLatRule::AqrabAlAyyam,
            offsets: Offsets::default(),
            audio: AudioConfig::default(),
            notice: Notice { minutes_before: 10 },
            agent: AgentConfig { mqtt: false, broker: String::new() },
        }
    }
}

/// La zona IANA del config se conserva para compatibilidad con el schema del
/// nodo. En desktop el cálculo sigue la zona local del sistema, según el spec.
impl Config {
    /// Offset local del sistema para la fecha calculada. Usar el mediodía de
    /// esa fecha evita aplicar el offset DST de hoy al consultar días pasados.
    pub fn tz_offset_hours_for_date(year: i32, month: i32, day: i32) -> f64 {
        let Some(date) = NaiveDate::from_ymd_opt(year, month as u32, day as u32) else {
            return Local::now().offset().local_minus_utc() as f64 / 3600.0;
        };
        let Some(noon) = date.and_hms_opt(12, 0, 0) else {
            return Local::now().offset().local_minus_utc() as f64 / 3600.0;
        };
        Local
            .from_local_datetime(&noon)
            .earliest()
            .map(|dt| dt.offset().local_minus_utc() as f64 / 3600.0)
            .unwrap_or_else(|| Local::now().offset().local_minus_utc() as f64 / 3600.0)
    }
}

pub type SharedConfig = Arc<RwLock<Config>>;

/// Carga el config si existe; solo crea el archivo cuando todavía no existe.
/// Si está dañado o no se puede leer, usa defaults en memoria y preserva el
/// archivo para que el usuario pueda recuperarlo.
pub fn load_or_init() -> Config {
    let path = config_path();
    match std::fs::read(&path) {
        Ok(bytes) => match serde_json::from_slice::<Config>(&bytes) {
            Ok(cfg) => cfg,
            Err(e) => {
                crate::log!("config inválido en {}: {e}; se usarán defaults sin sobrescribir el archivo", path.display());
                Config::default()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let cfg = Config::default();
            if let Err(save_err) = save(&cfg) {
                crate::log!("no se pudo crear config inicial: {save_err}");
            }
            cfg
        }
        Err(e) => {
            crate::log!("no se pudo leer config {}: {e}; se usarán defaults sin sobrescribir el archivo", path.display());
            Config::default()
        }
    }
}

pub fn save(cfg: &Config) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir del config: {e}"))?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| format!("serializer del config: {e}"))?;
    let tmp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&tmp, json).map_err(|e| format!("write temporal del config: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("reemplazo del config: {e}")
    })
}

impl From<&Config> for crate::prayer::PrayerConfig {
    fn from(cfg: &Config) -> Self {
        crate::prayer::PrayerConfig {
            method: cfg.method,
            madhab: cfg.madhab,
            high_lat_rule: cfg.highLatRule,
            fajr_angle: None,
            isha_angle: None,
            maghrib_angle: None,
            offsets: [cfg.offsets.fajr, cfg.offsets.dhuhr, cfg.offsets.asr, cfg.offsets.maghrib, cfg.offsets.isha],
            dhuhr_minutes: 0,
        }
    }
}
