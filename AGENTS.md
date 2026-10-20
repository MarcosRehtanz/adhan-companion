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
- Android experimental: `src-tauri/src/mobile.rs` inicializa datos privados y consulta/registro; `android_alerts.rs` conecta el plugin Kotlin de alarmas y audio nativos. `desktop.rs` mantiene el tray y el arranque de escritorio. Respetar `cfg(desktop)` / `cfg(mobile)` y no incorporar dependencias de tray, autostart o rodio de escritorio en Android. Ver `docs/android-experimental.md`.
- Frontend Android: siempre menú hamburguesa; no renderizar el sidebar de escritorio. Conservar `build.target` y `build.cssTarget` en `chrome80`: la minificación predeterminada de Vite transforma `max-width` en media queries de rango que WebViews antiguos pueden ignorar. El objetivo de compilación no sustituye la revisión nativa ni añade polyfills de API.

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

# Android experimental ARM64 (requiere JDK 21, SDK/NDK y variables de entorno)
pnpm tauri android build --debug --apk --target aarch64 --ci

# Android ARM de 32 bits (target Rust armv7-linux-androideabi)
pnpm tauri android build --debug --apk --target armv7 --ci
```

⚠️ En shells no interactivos `cargo` puede no estar en PATH: `export PATH="$HOME/.cargo/bin:$PATH"` o `source ~/.cargo/env`. Sin esto `pnpm tauri dev` falla con "failed to run cargo metadata".

⚠️ Para cortar el dev: ítem **Salir del tray** o `pkill -f adhan-companion`. **Cerrar la ventana NO mata la app** (tray-first: `CloseRequested → hide + prevent_close` es intencional).

## Gotchas Linux verificados en esta máquina (Ubuntu 26.04 / GNOME 50 / WebKitGTK 2.52)

- Tray via libayatana-appindicator: `set_icon` con RGBA en memoria funciona; **el texto de un menú ya ABIERTO no re-renderiza** (`set_text` aplica al reabrir el menú) — el countdown se lee al abrir, no en vivo.
- El bug DMABUF de WebKitGTK en Wayland NO se manifiesta con 2.52.6; el workaround (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) queda documentado en la nota de vault, aplicar solo si aparece en otras máquinas.
- Deps de compilación (ya instaladas): `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev pkg-config libasound2-dev`.

## Regla de producto: estados y acciones

Regla solicitada por el usuario: **cada apartado nuevo o modificado debe analizar y manejar explícitamente sus estados antes de diseñar las acciones de la interfaz**. Se aplica a todo el sistema, no solo a las descargas.

- Definir estados, transiciones, fuente de verdad, persistencia, acciones válidas por estado y recuperación ante errores. Documentar esa lógica junto a la función; no copiar una lista de botones fija para todos los estados.
- Contemplar consulta inicial, vacío, disponible, operación en curso, éxito, estado parcial/cancelación y error cuando correspondan. No confundir estado desconocido con vacío ni mostrar éxito antes de que lo confirme el core.
- Mostrar solo acciones pertinentes. Una sura descargada muestra «Disponible sin conexión» y «Eliminar audio»; no ofrece «Descargar» otra vez. Una parcial permite completar; una descarga activa muestra progreso y cancelar; eliminar vuelve a «Sin descargar» después de confirmarse.
- El core también valida las transiciones y bloquea duplicados u operaciones incompatibles; deshabilitar un botón no reemplaza esa validación. Mantener «Cancelando» hasta que la operación realmente termine.
- Reconstruir el estado al abrir, volver a la sección o reiniciar usando datos persistidos y operaciones reales. Los mensajes históricos de éxito no deben contradecir los archivos actuales. Evitar respuestas asíncronas obsoletas al cambiar de elemento.
- Preferencias y ediciones se presentan primero en modo lectura, con **Editar**, **Guardar** y **Cancelar**. Conservar la edición y explicar el error si guardar falla.
- No añadir ni ejecutar tests salvo petición del usuario. La regla de estados sí exige razonar y documentar los casos y transiciones durante la implementación.

Ver [lógica de estados y revisión por apartado](docs/estados-interfaz.md). Revisión local aplicada a configuración, registro, consultas, audio, inicio automático y actualizaciones. `mark_prayed` de escritorio espera confirmación de escritura del scheduler; nunca devolver éxito solo por encolar un pedido. `get_config` consulta el archivo confirmado y las consultas del registro no convierten errores de lectura en historial vacío. No retirar estos contratos.

## Convenciones del código

- Logs Rust con la macro `log!` (prefijo `[adhan]`, solo debug) — no usar `println!` directo.
- rodio 0.23 (API renombrada respecto a ejemplos viejos): `Sink`→`Player`, `OutputStreamBuilder`→`DeviceSinkBuilder::open_default_sink()`, features `["playback","wav","mp3"]` en escritorio (MP3 para recitación). Si el drop del sink es intencional, llamar `log_on_drop(false)` o ensucia el log con un "audio will stop" engañoso.
- El tray cicla estados con los PNG de `src-tauri/assets/tray/`.
- Nombre de crate `adhan-companion`, lib `"adhan_companion_lib"` (el sufijo `_lib` es necesario, no renombrar).
- No quitar `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` de `main.rs` (necesario para Windows en release).

## Decisiones vigentes (ver spec para detalle)

- **Local-first**: el cálculo no toca red; la fuente única es **FFI al PrayTimes C** compartido con el firmware ESP32. La sugerencia de ubicación y la consulta de releases sí usan red.
- Distribución Linux: **.deb y AppImage**; Windows: instalador **NSIS por usuario**. Flatpak descartado (tray en sandbox).
- Identifier: `io.github.marcosrehtanz.adhan-companion` en `src-tauri/tauri.conf.json` — cambiarlo rompe coherencia del tray con el `.desktop`.
- Audio del adhan: WAV mono 22.05 kHz (mismo formato que el firmware del nodo).

## Estado actual

- Tests: 30 en `src-tauri/` (`cargo test`) — 6 paridad (`ffi_praytimes`), 1 horarios vs alAdhan (`validate_official`, ±60s), 1 qibla (`validate_qibla`, ±0.5°), 4 unit de stats/rachas, 8 regresiones del próximo rezo (día siguiente, medianoche, fechas y realineación) y 10 de importación de ubicaciones desde Google Maps. El workflow de release ejecuta la suite en Linux y Windows antes de empaquetar y publicar.
- El `README.md` está en español y mantiene el estado del proyecto al público (no dejarlo volver a boilerplate).
- Progreso: el checkout está en **v0.1.10**. Incluye próximo rezo entre días, importación de ubicación Google Maps, avisos discretos por rezo, calendario islámico tabular con ajuste manual, temas/acentos y lector del Qur’an offline con marcadores y última lectura, además de tray, scheduler, adhan con confirmación, calendario retroactivo, notificaciones + preaviso, FFI a PrayTimes C, qibla, rachas/stats, colección Doha con asignación fija por rezo y updater para AppImage. Windows está preparado con ruta de config `%APPDATA%\Adhan Companion`, D-Bus limitado a Linux, build NSIS y descarga manual desde la sección de actualizaciones. El workflow `.github/workflows/release.yml` construye para Linux y Windows; solo publica los artefactos al subir un tag `vX.Y.Z`, ejecuta tests en ambas plataformas, comprueba versiones/notas y publica también SHA256SUMS. La ejecución manual genera artefactos sin publicar. Ver `docs/publicar-release.md`. Restante de producto: Ramadán (imsak/iftar), MQTT agente (bloqueado en hardware) y spot-checks de portales oficiales.

- Qur’an: recursos originales, avisos y manifiesto en `public/quran/`, metadatos de frontend en `src/data/quran-suras.json`. Preparación sin modificar las aleyas: `python3 scripts/prepare-quran.py`. La traducción tiene condiciones no comerciales separadas de MIT. Estado del lector en `quran-reader.json`, separado de configuración y registro de rezos. Ver `docs/lector-quran.md` y la revisión nativa en Linux; Windows visual pendiente. Recitación inicial de Parhizgar implementada en desarrollo local para escritorio en `quran_audio.rs`: controles, descarga por sura y punto de escucha separado, con prioridad de avisos mediante `audio::COORDINATION`. Revisión nativa y auditiva Linux documentada en `docs/revision-estados-escritorio.md`; Windows pendiente de validación física. Ver `docs/recitacion-quran.md`. No habilitar en Android sin integración nativa de reproducción.
- Android: edición experimental en desarrollo con identidad y datos separados, interfaz móvil y workflow propio de APK de depuración ARM64 y ARMv7 (32 bits). Incluye integración nativa experimental de AlarmManager, Adhan, tonos y preavisos; actualización real 10017 → 10018 desde la app comprobada en J7 SM-J710MN/Android 8.1, con conservación de configuración y lector verificada por hashes; conservación de esos datos y de las preferencias de avisos comprobada también después de reiniciar el teléfono. Preaviso y Adhan de Maghrib comprobados en ese J7 con pantalla apagada, USB desconectado y ahorro de energía activo el 19/10/2026; entrega registrada sin error y siguiente ciclo programado. Reprogramación automática tras nuevo reinicio comprobada sin abrir la app: el broadcast BOOT_COMPLETED tardó en llegar por la cola del sistema; luego AlarmManager registró ambas alarmas. Entrega audible de ese ciclo posterior pendiente. No generalizar a Doze profundo, otros modos de ahorro o varios días. `AndroidUpdates.kt` admite releases oficiales y el canal experimental mediante `android-update.json`, descarga en caché privada y verifica SHA-256/versión/identidad/ABI/firma con apksig antes de abrir el instalador; requiere confirmación de Android y permiso de fuente en Android 8+. El executor de descargas es independiente de las alarmas. CI firma ambos APK con la clave PKCS12 persistente de los secretos `ANDROID_KEY_BASE64`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`, usando apksigner fuera de Gradle y de sus cachés. No rotar la clave; los primeros APK con firma temporal requieren migración. `versionCode`: releases oficiales `1000000 + major*1000000 + minor*10000 + patch*100` (1010900 en v0.1.9); workflow experimental `10000 + github.run_number`. El cálculo headless pasa por JNI al mismo PrayTimes C; no duplicarlo en Kotlin. Los avisos empiezan desactivados y requieren activación y permisos. Desde v0.1.9, por pedido explícito del usuario, Release publica también APK release firmados junto con escritorio. Conservar la identidad/firma existente y comunicar el alcance de validación experimental; no certificar otros dispositivos por el ensayo del J7.

## Respaldo de Android durante pruebas

- En el J7 SM-J710MN, `config.json` reside en la raíz privada de la app. Un respaldo de `files/` solamente no conserva la configuración. Incluir archivos propios y `shared_prefs/`; mantener también un APK original cuando se migre desde una firma antigua.
- Los respaldos de pruebas se guardan en `.android-backups.local/`, privado y excluido de Git. Nunca incluirlos en commits o releases.
- Para restaurar mediante ADB, usar un canal binario comprobado (`adb shell -T`) y comparar después los hashes de los archivos leídos del teléfono. Una salida exitosa del comando de transferencia no prueba por sí sola que se hayan escrito los datos. Ajustar UID/GID a la instalación de destino y regenerar las cachés.

## Presentación Android oficial

Desde v0.1.10 no usar «experimental» en el nombre visible, el menú ni el canal mostrado. Conservar el identificador técnico histórico, paquetes Kotlin/JNI y firma para mantener las actualizaciones y datos. Los enlaces cortos de Maps se resuelven por HEAD nativo en un executor independiente de las alarmas; Rust valida cada salto e interpreta el pin. No sustituir un pin preciso por coordenadas redondeadas del nombre del lugar.
