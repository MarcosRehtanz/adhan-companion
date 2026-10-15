#!/usr/bin/env python3
"""
Genera src-tauri/tests/data/reference.json — la referencia de validación
contra la API de alAdhan (implementación independiente de los métodos).

El test Rust (tests/validate_official.rs) compara nuestra salida C/FFI contra
estos fixtures con tolerancia ±1 min — sin red en CI (fixtures vendidos).

Uso: python3 scripts/fetch_reference.py
"""
import datetime
import json
import os
import urllib.request
import zoneinfo

BASE = "https://api.aladhan.com/v1/timings"
FECHA_API = "15-10-2026"          # DD-MM-YYYY para la API
FECHA_ISO = "2026-10-15"          # para el offset de zona

CITIES = [
    ("Buenos Aires", -34.61, -58.38, "America/Argentina/Buenos_Aires"),
    ("Makkah", 21.42, 39.83, "Asia/Riyadh"),
    ("Istanbul", 41.01, 28.98, "Europe/Istanbul"),
    ("New York", 40.71, -74.01, "America/New_York"),
    ("Cairo", 30.04, 31.24, "Africa/Cairo"),
    ("Jakarta", -6.21, 106.85, "Asia/Jakarta"),
    ("London", 51.51, -0.13, "Europe/London"),
    ("Sydney", -33.87, 151.21, "Australia/Sydney"),
    ("Karachi", 24.86, 67.01, "Asia/Karachi"),
    ("Tromso", 69.65, 18.96, "Europe/Oslo"),
]

# método → código en la API de alAdhan
# "Tehran": la opción Tehran de la UI usa los params oficiales de Tehran
# (fajr 17.7°/maghrib 4.5°/isha 14.1°) — alAdhan method 7 es esa definición
METHODS = [
    ("MWL", 3),
    ("ISNA", 2),
    ("UmmAlQura", 4),
    ("Karachi", 1),
    ("Egypt", 5),
    ("Diyanet", 13),
    ("Tehran", 7),
]

EXIT = ["fajr", "dhuhr", "asr", "maghrib", "isha"]


def fetch(lat: float, lon: float, method_code: int, iana: str) -> dict:
    url = (
        f"{BASE}/{FECHA_API}?latitude={lat}&longitude={lon}"
        f"&method={method_code}&school=0&latitudeAdjustmentMethod=2"
        f"&timezonestring={iana}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "adhan-companion-validation/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read())
    t = data["data"]["timings"]
    # los timings pueden traer "(EET)" etc — limpiar
    clean = lambda s: s.split("(")[0].strip()  # noqa: E731
    return {k: clean(t[k.capitalize() if k != "dhuhr" else "Dhuhr"]) for k in EXIT}


def offset_horas(iso: str, iana: str) -> float:
    dt = datetime.datetime.fromisoformat(f"{iso}T12:00:00")
    off = dt.astimezone(zoneinfo.ZoneInfo(iana)).utcoffset()
    return off.total_seconds() / 3600.0


def main() -> None:
    out = []
    n = 0
    for (city, lat, lon, iana) in CITIES:
        tz_off = round(offset_horas(FECHA_ISO, iana), 4)
        for (method, code) in METHODS:
            times = fetch(lat, lon, code, iana)
            out.append({
                "city": city, "lat": lat, "lon": lon,
                "tz": iana, "tz_offset": tz_off,
                "date": FECHA_ISO, "method": method,
                "times": times,
            })
            n += 1
    target = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "tests", "data", "reference.json")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"fixtures generados: {n} en {target}")


if __name__ == "__main__":
    main()
