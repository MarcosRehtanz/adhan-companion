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

# build de producción → produce .deb (único target declarado)
pnpm tauri build
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
- El tray cicla estados de icono dibujando círculos RGBA con `circle_icon()` en `lib.rs`; los assets reales los reemplazan cuando se defina el set de iconos (matriz estado×icono en el spec).
- Nombre de crate `adhan-companion`, lib `"adhan_companion_lib"` (el sufijo `_lib` es necesario, no renombrar).
- No quitar `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` de `main.rs` (necesario para Windows en release).

## Decisiones vigentes (ver spec para detalle)

- **Local-first**: el cálculo no toca red; la fuente única será **FFI al `praytimes.c`** (mismo C que el firmware ESP32) — plan declarado, no implementado todavía.
- Distribución: **solo .deb**; Flatpak descartado (tray en sandbox), AppImage diferido.
- Identifier: `io.github.marcosrehtanz.adhan-companion` en `src-tauri/tauri.conf.json` — cambiarlo rompe coherencia del tray con el `.desktop`.
- Audio del adhan: WAV mono 22.05 kHz (mismo formato que el firmware del nodo).

## Estado actual

- Tests: **`cargo test --test ffi_praytimes`** (en `src-tauri/`) — suite de precisión ritual: 6 tests + paridad contra PrayTimes.js. CI aún no.
- El `README.md` está en español y mantiene el estado del proyecto al público (no dejarlo volver a boilerplate).
- Progreso: **los 4 spikes cerrados** + hitos de producto: config real con ventana React (`c132801`), marcar rezado + `registro.jsonl` (`5edf97a`), notificaciones + preaviso (`9b34e6e`), **seguimiento con calendario retroactivo + adhan real con confirmación** (`78c0518`). Contratos vivos: `get_schedule`/`get_schedule_for`/`get_marked`/`set_config`/`get_config`/`test_adhan`/`test_notification`/`mark_prayed`/`schedule_changed`. Muecín default = adhan de Doha (dominio público, `assets/muecin/CREDITS.md`); formato WAV mono 22.05 kHz. Restante del MVP: assets/íconos finales (ya regenerados), biblioteca de muecines v1.1, validación CI vs portales, `.deb` release.
