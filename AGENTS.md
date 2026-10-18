# AGENTS.md

## Qué es este repo

App de escritorio **tray-first** para Ubuntu (GNOME/Wayland): "Adhan Companion" — horarios de rezo, preaviso + adhan, registro de rezos. MVP Linux; futuro: agente local de un nodo ESP32 (hermano de hardware).

El **spec de producto vive fuera del repo**, en el vault Obsidian (ahora en un pendrive; el path depende del montaje):
- Principal (pendrive SanDisk): `/run/media/usuario/MARCOSUSB/Obsidian/Ingenieria/Proyectos/Adhan Companion — App de Escritorio.md`
- Fallback (copia en disco): `/home/usuario/Documentos/Obsidian/Ingeniería/Proyectos/Adhan Companion — App de Escritorio.md`
Consultarlo antes de decidir UX/config/scheduler. Nota hermana con gotchas de Tauri: `02 Frameworks/Desktop/Tauri.md` (mismo vault). Si un path no existe (pendrive desmontado), usar el otro.

El **conocimiento de dominio islámico** vive en otro vault (mismo esquema USB + fallback):
- Principal: `/run/media/usuario/MARCOSUSB/Obsidian/Islam`
- Fallback: `/home/usuario/Documentos/Obsidian/Islam`
Relevante para esta app: `08 Práctica/Rezos/` (una ficha por rezo: Fajr/Dhuhr/Asr/Maghrib/Isha), el adhan y el rito en `08 Práctica/Práctica de la salat.md`, y `06 Conceptos/Salat.md`. Leerlo antes de tocar nombres de rezos, textos del adhan o criterios de método/madhab.

## Estructura (Tauri 2 + React/TS)

- `src-tauri/` — **core Rust, corre siempre**: tray, scheduler, audio, FFI. El punto real de la app es `src-tauri/src/lib.rs` (`run()`); `main.rs` solo delega.
- `src/` — frontend React (config + dashboard). Puede morir/crashear sin afectar el core. Solo `Configuración…` del tray abre la ventana.
- `src-tauri/capabilities/` — permisos frontend→core. En Tauri 2 **todo comando/plugin que use el frontend debe estar declarado acá**; si un comando "no responde", revisar capabilities antes que el código.

## Comandos

```bash
# dev (levanta vite en :1420 + el binario con hot-reload del core)
pnpm tauri dev

# solo compilar el core
cd src-tauri && cargo build

# build de producción → produce los bundles de la plataforma actual
pnpm tauri build

# Windows (runner Windows; instalador NSIS)
pnpm tauri build --bundles nsis
```

⚠️ En shells no interactivos `cargo` puede no estar en PATH: `export PATH="$HOME/.cargo/bin:$PATH"` o `source ~/.cargo/env`. Sin esto `pnpm tauri dev` falla con "failed to run cargo metadata".

⚠️ Para cortar el dev: ítem **Salir del tray** o `pkill -f adhan-companion`. **Cerrar la ventana NO mata la app** (tray-first: `CloseRequested → hide + prevent_close` es intencional).

## Gotchas Linux verificados en esta máquina (Ubuntu 26.04 / GNOME 50 / WebKitGTK 2.52)

- Tray via libayatana-appindicator: `set_icon` con RGBA en memoria funciona; **el texto de un menú ya ABIERTO no re-renderiza** (`set_text` aplica al reabrir el menú) — el countdown se lee al abrir, no en vivo.
- El bug DMABUF de WebKitGTK en Wayland NO se manifiesta con 2.52.6; el workaround (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) queda documentado en la nota de vault, aplicar solo si aparece en otras máquinas.
- Deps de compilación (ya instaladas): `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev pkg-config libasound2-dev`.

## Convenciones del código

- Logs Rust con la macro `log!` (prefijo `[adhan]`, solo debug) — no usar `println!` directo.
- rodio 0.23 (API renombrada respecto a ejemplos viejos): `Sink`→`Player`, `OutputStreamBuilder`→`DeviceSinkBuilder::open_default_sink()`, features `["playback","wav"]`. Si el drop del sink es intencional, llamar `log_on_drop(false)` o ensucia el log con un "audio will stop" engañoso.
- El tray cicla estados con los PNG de `src-tauri/assets/tray/`.
- Nombre de crate `adhan-companion`, lib `"adhan_companion_lib"` (el sufijo `_lib` es necesario, no renombrar).
- No quitar `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` de `main.rs` (necesario para Windows en release).

## Decisiones vigentes (ver spec para detalle)

- **Local-first**: el cálculo no toca red; la fuente única es **FFI al PrayTimes C** compartido con el firmware ESP32. La sugerencia de ubicación y la consulta de releases sí usan red.
- Distribución Linux: **.deb y AppImage**; Windows: instalador **NSIS por usuario**. Flatpak descartado (tray en sandbox).
- Identifier: `io.github.marcosrehtanz.adhan-companion` en `src-tauri/tauri.conf.json` — cambiarlo rompe coherencia del tray con el `.desktop`.
- Audio del adhan: WAV mono 22.05 kHz (mismo formato que el firmware del nodo).

## Estado actual

- Tests: 12 en `src-tauri/` (`cargo test`) — 6 paridad (`ffi_praytimes`), 1 horarios vs alAdhan (`validate_official`, ±60s), 1 qibla (`validate_qibla`, ±0.5°) y 4 unit de stats/rachas. El workflow de release ejecuta la suite en Linux y Windows antes de empaquetar y publicar.
- El `README.md` está en español y mantiene el estado del proyecto al público (no dejarlo volver a boilerplate).
- Progreso: el checkout está en **v0.1.7**. Incluye tray, scheduler, adhan con confirmación, calendario retroactivo, notificaciones + preaviso, FFI a PrayTimes C, qibla, rachas/stats, colección Doha con asignación fija por rezo y updater para AppImage. Windows está preparado con ruta de config `%APPDATA%\Adhan Companion`, D-Bus limitado a Linux, build NSIS y descarga manual desde la sección de actualizaciones. El workflow `.github/workflows/release.yml` construye para Linux y Windows; solo publica los artefactos al subir un tag `vX.Y.Z`, ejecuta tests en ambas plataformas, comprueba versiones/notas y publica también SHA256SUMS. La ejecución manual genera artefactos sin publicar. Ver `docs/publicar-release.md`. Restante de producto: Ramadán (imsak/iftar), MQTT agente (bloqueado en hardware) y spot-checks de portales oficiales.
