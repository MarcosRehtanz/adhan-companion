#!/usr/bin/env python3
"""
Genera src-tauri/tests/data/qibla_reference.json — la referencia del rumbo
a la Qaaba contra la API de alAdhan (endpoint qibla), para el test
tests/validate_qibla.rs. Sin red en el test (fixtures vendidos).

Uso: python3 scripts/fetch_qibla.py
"""
import json
import os
import urllib.request

BASE = "https://api.aladhan.com/v1/qibla"
CITIES = [
    ("Buenos Aires", -34.61, -58.38),
    ("Makkah", 21.42, 39.83),
    ("Istanbul", 41.01, 28.98),
    ("New York", 40.71, -74.01),
    ("Cairo", 30.04, 31.24),
    ("Jakarta", -6.21, 106.85),
    ("London", 51.51, -0.13),
    ("Sydney", -33.87, 151.21),
    ("Karachi", 24.86, 67.01),
    ("Tromso", 69.65, 18.96),
]


def main() -> None:
    out = []
    for (city, lat, lon) in CITIES:
        url = f"{BASE}/{lat}/{lon}"
        req = urllib.request.Request(url, headers={"User-Agent": "adhan-companion-validation/0.1"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
        out.append({
            "city": city, "lat": lat, "lon": lon,
            "direction": round(data["data"]["direction"], 4),
        })
    target = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "tests", "data", "qibla_reference.json")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"fixtures de qibla generados: {len(out)} en {target}")


if __name__ == "__main__":
    main()
