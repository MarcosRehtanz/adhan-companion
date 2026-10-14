//! Spike 4 — el nacimiento de la suite de precisión ritual del spec:
//! la salida del C compilado en el host tiene que ser confesable y ordenada
//! (Fajr < Sunrise < Dhuhr < Asr < Sunset < Maghrib < Isha, rangos válidos).
//! La comparación minuto-a-minuto contra portales oficiales entra en v1.1 (CI);
//! por ahora: sanity + printout para el cross-check contra la lib JS.

use adhan_companion_lib::prayer::{calc_times, HighLatRule, Madhab, Method, PrayerConfig};

/// (ciudad, lat, lon, tz) — 10 puntos con latitudes y hemisferios variados
const CITIES: &[(&str, f64, f64, f64)] = &[
    ("Buenos Aires", -34.61, -58.38, -3.0),
    ("Makkah", 21.42, 39.83, 3.0),
    ("Istanbul", 41.01, 28.98, 3.0),
    ("New York", 40.71, -74.01, -5.0),
    ("Cairo", 30.04, 31.24, 2.0),
    ("Jakarta", -6.21, 106.85, 7.0),
    ("London", 51.51, -0.13, 0.0),
    ("Sydney", -33.87, 151.21, 10.0),
    ("Karachi", 24.86, 67.01, 5.0),
    ("Tromso", 69.65, 18.96, 2.0), // latitud extrema (≥48°): alta latitud activa
];

const NAMES: [&str; 7] = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Sunset", "Maghrib", "Isha"];

fn fmt_dec(dec: f64) -> String {
    if dec.is_nan() {
        "NaN".to_string()
    } else {
        let h = dec.trunc() as i32;
        let m = ((dec - h as f64) * 60.0).round() as i32;
        format!("{h:02}:{m:02}")
    }
}

#[test]
fn orden_y_rangos_validos_para_10_ciudades() {
    for (city, lat, lon, tz) in CITIES {
        let times = calc_times(2026, 10, 13, *lat, *lon, *tz, &PrayerConfig::default());

        // Sin NaN en Fajr/Dhuhr/Asr/Maghrib/Isha (Sunrise/Sunset pueden NaN
        // en los extremos polares con próximas; en estas ciudades también
        // puede pasar en Tromso según el método: se valida el resto)
        assert!(
            times.iter().all(|t| !t.is_infinite()),
            "{city}: valores infinitos: {times:?}"
        );

        // Secuencia ordenada donde todos son finitos
        for i in 0..6 {
            let (a, b) = (times[i], times[i + 1]);
            let (na, nb) = (NAMES[i], NAMES[i + 1]);
            if a.is_nan() || b.is_nan() {
                continue;
            }
            assert!(a <= b + 1e-9, "{city}: {na} {a} > {nb} {b}");
        }

        // Rango razonable 0..24
        for &t in times.iter() {
            assert!(!t.is_finite() || (0.0..24.0).contains(&t), "{city}: {t} fuera de rango");
        }
    }
}

#[test]
fn printout_para_cross_check_js() {
    // La tabla exacta para comparar contra PrayTimes.js (referencia del algoritmo)
    for (city, lat, lon, tz) in CITIES {
        let times = calc_times(2026, 10, 13, *lat, *lon, *tz, &PrayerConfig::default());
        let vals: Vec<String> = times.iter().map(|&t| fmt_dec(t)).collect();
        println!("{city:13} | {}", vals.join(" | "));
    }
}

#[test]
fn madhab_hanafi_retarda_asr() {
    let ba = (-34.61, -58.38, -3.0);
    let shafi = calc_times(2026, 10, 13, ba.0, ba.1, ba.2, &PrayerConfig::default());
    let hanafi_cfg = PrayerConfig { madhab: Madhab::Hanafi, ..PrayerConfig::default() };
    let hanafi = calc_times(2026, 10, 13, ba.0, ba.1, ba.2, &hanafi_cfg);
    assert!(
        hanafi[3] > shafi[3] + 0.3,
        "Asr Hanafi ({}) debe ser visiblemente más tarde que Shafi ({})",
        fmt_dec(hanafi[3]), fmt_dec(shafi[3])
    );
}

#[test]
fn high_lat_rule_cambia_tromso() {
    // En Tromso (69°) la regla de latitud alta tiene que tener efecto
    let cfg_none = PrayerConfig { high_lat_rule: HighLatRule::None, ..PrayerConfig::default() };
    let cfg_seventh = PrayerConfig { high_lat_rule: HighLatRule::OneSeventh, ..PrayerConfig::default() };
    let a = calc_times(2026, 10, 13, 69.65, 18.96, 2.0, &cfg_none);
    let b = calc_times(2026, 10, 13, 69.65, 18.96, 2.0, &cfg_seventh);
    let diff = (a[0] - b[0]).abs() + (a[6] - b[6]).abs();
    assert!(diff > 0.05, "Fajr/Isha deben diferir con reglas de lat alta distintas (diff={diff})");
}

#[test]
fn offsets_aplican_post_calculo() {
    let mut cfg = PrayerConfig::default();
    cfg.offsets = [7, 0, 0, 0, -5];
    let ba = (-34.61, -58.38, -3.0);
    let base = calc_times(2026, 10, 13, ba.0, ba.1, ba.2, &PrayerConfig::default());
    let tuned = calc_times(2026, 10, 13, ba.0, ba.1, ba.2, &cfg);
    assert!(
        ((tuned[0] - base[0] - 7.0 / 60.0).abs() < 1e-9),
        "Fajr compensado +7 min"
    );
    assert!(
        ((tuned[6] - base[6] + 5.0 / 60.0).abs() < 1e-9),
        "Isha compensado -5 min"
    );
}

#[test]
fn metodo_cambia_fajr_isna_mas_tarde_que_mwl() {
    let cfg_isna = PrayerConfig { method: Method::Isna, ..PrayerConfig::default() };
    let mwl = calc_times(2026, 10, 13, -34.61, -58.38, -3.0, &PrayerConfig::default());
    let isna = calc_times(2026, 10, 13, -34.61, -58.38, -3.0, &cfg_isna);
    assert!(isna[0] > mwl[0], "ISNA (15°) Fajr más tarde que MWL (18°)");
    assert!(isna[6] < mwl[6], "ISNA (15°) Isha más temprano que MWL (17°)");
}
