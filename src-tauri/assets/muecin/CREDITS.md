# Créditos de audio (muecín)

El adhan incluido (`default.wav`) es la grabación **Dhuhr** del conjunto
**"Adhan Recordings from Doha, Qatar"** (grabado 2013–2014), publicado en
Internet Archive bajo **Public Domain Mark 1.0** (dominio público).

- Fuente: https://archive.org/details/adhan.recordings.from.doha.qatar
- Licencia: Public Domain Mark 1.0 — https://creativecommons.org/publicdomain/mark/1.0/
- Archivo original: `Adhan_Doha_Qatar_02_Dhuhr_Adhan.ogg`
- Conversión: a WAV mono 22.05 kHz (formato del spec, reutilizable por el firmware).

## Biblioteca por rezo (v1.1)

Los otros adhanes del **mismo conjunto Doha** (mismo muezzin, mismo registro
2013–2014, misma licencia) vienen embebidos como recursos del `.deb`:

| Archivo | Origen (`archive.org/details/adhan.recordings.from.doha.qatar`) | Licencia |
|---|---|---|
| `fajr.wav` | `Adhan_Doha_Qatar_01_Fajr_Adhan.ogg` | Public Domain Mark 1.0 |
| `asr.wav` | `Adhan_Doha_Qatar_03_Asr_Adhan.ogg` | Public Domain Mark 1.0 |
| `maghrib.wav` | `Adhan_Doha_Qatar_04_Maghrib_Adhan.ogg` | Public Domain Mark 1.0 |
| `isha.wav` | `Adhan_Doha_Qatar_05_Isha_Adhan.ogg` | Public Domain Mark 1.0 |

Todos convertidos a WAV mono 22.05 kHz 16-bit (2.65 MB/min). El usuario puede
agregar más muezzines tipo WAV a `~/.config/adhan-companion/muecines/` — con
prioridad sobre los instalados y el embebido.
