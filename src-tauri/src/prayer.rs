//! Spike 4 — el corazón ritual: FFI a PrayTimes C, la fuente única del
//! cálculo compartida con el firmware (`praytimes.c` del nodo).
//!
//! El estado global del C se serializa con un `Mutex` — el port original
//! es single-thread (ver `native/praytimes_compat.h`).

use std::os::raw::{c_char, c_double, c_int};
use std::sync::Mutex;

/// Métodos — mismo orden que el spec del vault / `PT_METHOD_*` en el C
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method { Mwl, Isna, Egypt, Makkah, Karachi, Tehran, Jafari, Custom }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Madhab { #[default] Shafi, Hanafi }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum HighLatRule { None, MiddleOfNight, AngleBased, #[default] AqrabAlAyyam, AqrabAlBilad, OneSeventh, FixedAngle }

impl Method {
    fn as_c(self) -> c_int { self as i32 } // el orden del enum C ya es el mismo por diseño
}

impl Madhab {
    fn as_c(self) -> c_int { self as i32 }
}

impl HighLatRule {
    fn as_c(self) -> c_int { self as i32 }
}

/// Config del cálculo — todos los parámetros del schema del config.app
#[derive(Debug, Clone, Copy)]
pub struct PrayerConfig {
    pub method: Method,
    pub madhab: Madhab,
    pub high_lat_rule: HighLatRule,
    pub fajr_angle: Option<f64>,
    pub isha_angle: Option<f64>,
    /// offsets por rezo en minutos: Fajr..Isha (post-proceso en Rust)
    pub offsets: [i32; 5],
    /// minutes después del mid-day para Dhuhr (viaja al C vía pt_tune)
    pub dhuhr_minutes: i32,
}

impl Default for PrayerConfig {
    fn default() -> Self {
        Self {
            method: Method::Mwl,
            madhab: Madhab::Shafi,
            high_lat_rule: HighLatRule::AqrabAlAyyam,
            fajr_angle: None,
            isha_angle: None,
            offsets: [0; 5],
            dhuhr_minutes: 0,
        }
    }
}

unsafe extern "C" {
    fn pt_create() -> *mut std::ffi::c_void;
    fn pt_destroy(pt: *mut std::ffi::c_void);
    fn pt_init(pt: *mut std::ffi::c_void, method: c_int);
    fn pt_set_madhab(pt: *mut std::ffi::c_void, madhab: c_int);
    fn pt_set_high_lat_method(pt: *mut std::ffi::c_void, rule: c_int);
    fn pt_tune(pt: *const std::ffi::c_void, name: *const c_char, minutes: c_int);
    fn pt_set_fajr_angle(pt: *mut std::ffi::c_void, angle: c_double);
    fn pt_set_isha_angle(pt: *mut std::ffi::c_void, angle: c_double);
    fn pt_get_times(
        pt: *const std::ffi::c_void,
        year: c_int, month: c_int, day: c_int,
        lat: c_double, lon: c_double, tz_offset: c_double,
        times_out: *mut c_double,
    );
}

/// Nombres de los rezos por índice de `prayers` del contrato `Schedule`
pub const PRAYER_SET: [&str; 5] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/// Índices dentro del out[7] del C: 0=Fajr, 1=Sunrise, 2=Dhuhr, 3=Asr,
/// 4=Sunset, 5=Maghrib, 6=Isha — solo los 5 rezos del schedule
pub const PRAYER_INDICES: [usize; 5] = [0, 2, 3, 5, 6];

/// fix_hour del port (range reduce 0..24)
fn fix_hour(h: f64) -> f64 {
    let h = h - 24.0 * (h / 24.0).floor();
    if h < 0.0 { h + 24.0 } else { h }
}

/// Offsets del config (minutos por rezo) — post-proceso en Rust porque el
/// port C solo maneja dhuhr_minutes; el PrayTimes JS también es post-cálculo
fn apply_offsets(mut times: [f64; 7], offsets: [i32; 5]) -> [f64; 7] {
    for (i, idx) in PRAYER_INDICES.iter().enumerate() {
        if offsets[i] != 0 {
            times[*idx] = fix_hour(times[*idx] + offsets[i] as f64 / 60.0);
        }
    }
    times
}

/// Cálculo con el C real. `(year, month, day)` gregorianos, lat/lon grados,
/// `tz_offset` en horas (regla del spec: nunca se adivina, viene del config).
/// Devuelve el `out[7]` del contrato de praytimes.h (horas decimales).
pub fn calc_times(
    year: i32, month: i32, day: i32,
    lat: f64, lon: f64, tz_offset: f64,
    cfg: &PrayerConfig,
) -> [f64; 7] {
    // el estado global del C es single-thread: serializo la sección crítica
    let _lock = CALC_LOCK.lock().unwrap();

    let times: [f64; 7] = unsafe {
        let pt = pt_create();
        assert!(!pt.is_null(), "pt_create nunca debe fallar (singleton)");
        pt_init(pt, cfg.method.as_c());
        pt_set_madhab(pt, cfg.madhab.as_c());
        pt_set_high_lat_method(pt, cfg.high_lat_rule.as_c());
        if let Some(a) = cfg.fajr_angle {
            pt_set_fajr_angle(pt, a);
        }
        if let Some(a) = cfg.isha_angle {
            pt_set_isha_angle(pt, a);
        }
        if cfg.dhuhr_minutes != 0 {
            let name = b"dhuhr\0".as_ptr() as *const c_char;
            pt_tune(pt, name, cfg.dhuhr_minutes);
        }

        let mut out = [0.0f64; 7];
        pt_get_times(
            pt,
            year, month, day,
            lat, lon, tz_offset,
            out.as_mut_ptr(),
        );
        pt_destroy(pt);
        out
    };
    apply_offsets(times, cfg.offsets)
}

/// Mutex del estado global del C (el port es single-thread)
static CALC_LOCK: Mutex<()> = Mutex::new(());
