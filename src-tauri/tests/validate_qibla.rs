//! Validación del rumbo de qibla contra la referencia (alAdhan, endpoint
//! `qibla`): fixtures vendidos en tests/data/qibla_reference.json, tolerancia
//! ±0.5° sin red. Fila Makkah excluida por degenerada (estás EN la Qaaba —
//! el vector no tiene dirección visible; el API referencia su fórmula).

use std::sync::OnceLock;

use adhan_companion_lib::qibla::bearing;
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    city: String,
    lat: f64,
    lon: f64,
    direction: f64,
}

fn fixtures() -> &'static Vec<Fixture> {
    static F: OnceLock<Vec<Fixture>> = OnceLock::new();
    F.get_or_init(|| {
        serde_json::from_str(include_str!("data/qibla_reference.json"))
            .expect("fixtures de qibla inválidos")
    })
}

#[test]
fn rumbo_qibla_vs_referencia() {
    const TOLERANCIA: f64 = 0.5; // grados

    let mut fuera = 0usize;
    println!("qibla (grados desde el norte) [tolerancia ±{TOLERANCIA}°]:");
    println!("{:<13} {:>9} {:>9} {:>8}", "ciudad", "ref", "nuestro", "diff");

    for f in fixtures() {
        let degenerada = f.city == "Makkah"; // estás EN la Qaaba: vector ~cero
        let our = bearing(f.lat, f.lon);
        let diff = (our - f.direction).abs();
        let diff_corta = diff.min(360.0 - diff); // circular: 359° ≈ 1°
        if degenerada {
            println!(
                "{:<13} {:>9.2} {:>9.2} {:>8.2} DOC (degenerado: ciudad = Qaaba)",
                f.city, f.direction, our, diff_corta
            );
            continue;
        }
        if diff_corta > TOLERANCIA {
            fuera += 1;
            println!(
                "{:<13} {:>9.2} {:>9.2} {:>8.2} FUERA",
                f.city, f.direction, our, diff_corta
            );
        } else {
            println!(
                "{:<13} {:>9.2} {:>9.2} {:>8.2} ok",
                f.city, f.direction, our, diff_corta
            );
        }
    }

    println!("\nfilas fuera de tolerancia: {fuera} (excluida Makkah por degenerada)");
    assert!(fuera == 0, "{fuera} filas de qibla por encima de ±{TOLERANCIA}°");
}
