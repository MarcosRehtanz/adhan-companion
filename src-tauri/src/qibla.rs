//! Qibla — rumbo inicial (great-circle) desde el norte geográfico hacia la
//! Qaaba de Makkah. Solo matemática pura, sin dependencias: lat/lon vienen
//! del config (regla del spec: el TZ sale de la ciudad — nunca se adivina).
//!
//! En escritorio es *referencia*, no brújula (no hay magnetómetro en la laptop).

/// Coordenadas de la Qaaba, Makkah (21°25′21″N 39°49′35″E — estándar WGS84)
pub const KAABA_LAT: f64 = 21.4225;
pub const KAABA_LON: f64 = 39.826394;

fn deg2rad(d: f64) -> f64 {
    d * std::f64::consts::PI / 180.0
}

fn rad2deg(r: f64) -> f64 {
    r * 180.0 / std::f64::consts::PI
}

/// Rumbo inicial hacia la Qaaba, 0..360° desde el norte (0 = norte, grados
/// horarios). Con puntos separados > 0: en lat/lon ≈ la Qaaba el resultado es
/// degenerado (el vector no tiene dirección definida).
pub fn bearing(lat: f64, lon: f64) -> f64 {
    let (p1, l1) = (deg2rad(lat), deg2rad(lon));
    let (p2, l2) = (deg2rad(KAABA_LAT), deg2rad(KAABA_LON));
    let dl = l2 - l1;
    let y = dl.sin();
    let x = p1.cos() * p2.tan() - p1.sin() * dl.cos();
    rad2deg(y.atan2(x)).rem_euclid(360.0)
}
