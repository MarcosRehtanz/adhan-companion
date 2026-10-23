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
- Navegación desde el 21/10/2026: las mismas páginas en el celular y en escritorio, con dos marcos. En Android y ventanas de hasta 720 px, barra inferior (Hoy, Registro, Qur’an y Más) sin sidebar; las subpantallas de «Más» entran al historial, para que el botón atrás vuelva. En la ventana ancha, barra lateral (Hoy, Registro, Calendario islámico, Qur’an y Configuración); Configuración es la misma lista con subpantallas, y «Horarios» pasó a «Ubicación y cálculo» dentro de ella. Hoy (`src/components/Today.tsx`) es el mismo componente en las dos vistas. Maqueta y decisiones en `docs/maquetas/movil/`. Un rezo de hoy se marca desde su horario: lo valida `scheduler::check_mark_time` en el core y la interfaz lo refleja con `src/lib/prayers.ts`. Conservar `build.target` y `build.cssTarget` en `chrome80`: la minificación predeterminada de Vite transforma `max-width` en media queries de rango que WebViews antiguos pueden ignorar. El objetivo de compilación no sustituye la revisión nativa ni añade polyfills de API.

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
- Preferencias y ediciones se presentan primero en modo lectura, con **Editar**, **Guardar** y **Cancelar**. Conservar la edición y explicar el error si guardar falla. **Única excepción, decidida por el usuario el 21/10/2026:** el panel «Lectura» del lector del Qur’an (idioma y tamaño del texto) se edita directo y guarda cada cambio; si un guardado falla, vuelve a lo confirmado por el core. No convertirlo en borrador. Ver `docs/lector-quran.md`.
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

- Tests: 36 en `src-tauri/` (`cargo test`) — 6 paridad (`ffi_praytimes`), 1 horarios vs alAdhan (`validate_official`, ±60s), 1 qibla (`validate_qibla`, ±0.5°), 4 unit de stats/rachas, 8 regresiones del próximo rezo (día siguiente, medianoche, fechas y realineación), 10 de importación de ubicaciones desde Google Maps y 6 del sync con Google (unión del registro, orden conservador, multipart Drive, traducción de errores de token, fechas civiles ISO). El workflow de release ejecuta la suite en Linux y Windows antes de empaquetar y publicar.
- El `README.md` está en español y mantiene el estado del proyecto al público (no dejarlo volver a boilerplate).
- Progreso: el checkout está en **v0.1.15**. Incluye próximo rezo entre días, importación de ubicación Google Maps, avisos discretos por rezo, calendario islámico tabular con ajuste manual, temas/acentos y lector del Qur’an offline con marcadores y última lectura, además de tray, scheduler, adhan con confirmación, calendario retroactivo, notificaciones + preaviso, FFI a PrayTimes C, qibla, rachas/stats, colección Doha con asignación fija por rezo y updater de escritorio (`updater.rs`). Windows está preparado con ruta de config `%APPDATA%\Adhan Companion`, D-Bus limitado a Linux, build NSIS. «Actualizar ahora» instala AppImage, el `.deb` (verifica contra `SHA256SUMS` y usa `pkexec apt-get install`, que pide la contraseña) y Windows (verifica contra `SHA256SUMS` y ejecuta el NSIS con `/P /UPDATE /R`). Sin `/UPDATE`, el NSIS de Tauri propone por defecto «Desinstalar antes de instalar»; los datos de `%APPDATA%\Adhan Companion` no se borran. El workflow `.github/workflows/release.yml` construye para Linux y Windows; solo publica los artefactos al subir un tag `vX.Y.Z`, ejecuta tests en ambas plataformas, comprueba versiones/notas y publica también SHA256SUMS. La ejecución manual genera artefactos sin publicar. Ver `docs/publicar-release.md`. Restante de producto: Ramadán (imsak/iftar), MQTT agente (bloqueado en hardware) y spot-checks de portales oficiales.

- Qur’an: recursos originales, avisos y manifiesto en `public/quran/`, metadatos de frontend en `src/data/quran-suras.json`. Preparación sin modificar las aleyas: `python3 scripts/prepare-quran.py`. La traducción tiene condiciones no comerciales separadas de MIT. Estado del lector en `quran-reader.json`, separado de configuración y registro de rezos. Ver `docs/lector-quran.md` y la revisión nativa en Linux; Windows visual pendiente. Recitación de Parhizgar publicada en v0.1.9 para escritorio en `quran_audio.rs`: controles, descarga por sura y punto de escucha separado, con prioridad de avisos mediante `audio::COORDINATION`. Revisión nativa y auditiva Linux documentada en `docs/revision-estados-escritorio.md`; Windows pendiente de validación física. Android (desde v0.1.11; el usuario la comprobó en el J7 el 20/10/2026: escucha, seguimiento, pantalla apagada, recientes, pausa por Adhan y sin conexión): `quran_audio.rs` comparte descargas, verificación SHA-256 y punto de escucha; reproduce `QuranPlayer.kt` (servicio `mediaPlayback` propio, foco de audio, notificación con Pausar/Detener), la red de descargas va por `QuranFetch.kt` y Rust expone `QuranNative.resolve/listened` por JNI. No usar rodio en Android. `PrayerAlarms.play` pausa la recitación antes de un Adhan o tono; nunca se reanuda sola. Ver `docs/recitacion-quran.md`.
- **Seguimiento de los rezos (v0.1.16)**: bloque `follow_up` del config (`reminder`, `minutes` 5–120, `paused_until` opcional, validado con `FollowUp::validar`). **Recordatorio:** «¿Ya rezaste X?» si un rezo de hoy sigue sin marcar N minutos después de su horario; una vez por rezo, sin avisar tarde (ventana de 10 min) ni después de que empezó el rezo siguiente. En escritorio lo decide `scheduler::reminders_due` dentro del bucle; en Android es una tercera alarma de `PrayerAlarms` que antes de avisar consulta `PrayerNative.marked` (JNI → `registro::marked_in`, con la ruta del registro que Rust manda en cada `sync`). **Pausa:** acción inmediata `set_pause(days)` (1–60; `None` reanuda), sin borrador ni motivo guardado; calla Adhan, preaviso y recordatorio. En escritorio el disparo se consume sin sonar y esos rezos no se registran como «perdido»; en Android las alarmas se programan desde el día de vuelta. La interfaz pone el recordatorio en la edición de «Adhan y avisos», la pausa en un panel propio (`PauseAlerts.tsx`) y un aviso en Hoy mientras dura. Es la primera parte del acompañamiento de los rezos; la guía espera la resolución de los textos (permiso de The World Federation o transcripción revisada).
- **Guía del rezo (en desarrollo: solo con `import.meta.env.DEV` o en compilaciones de prueba con `VITE_GUIA_REZO=1`)**: pasos por escuela en `src/lib/guia.ts`, pantalla `GuiaRezo.tsx` en Más, con «Rezar con guía» (`AcompanarRezo.tsx`: tocar para avanzar, contador de rakʿas o, en Android, el sensor de proximidad; en Android, pantalla encendida con `android_acompanar` → `AdhanPlugin.acompanar` y `Proximidad.kt`). Por ahora se muestra solo ja'fari: las cuatro sunnis siguen en el código, ocultas por `ESCUELAS_VISIBLES`, hasta que alguien revise su contenido. Ja'fari muestra solo el perfil «Sistani completo» (con estatus y fuentes; decisión del usuario del 23/10): «Mi práctica» sigue en `guia.ts`, oculto, sin selector. La taʿqībāt incluye el tasbīḥ de Fátima con contador. Rezo combinado: `mark_prayed` con `combinado` deja marcar Asr o Isha desde el horario de Dhuhr o Maghrib si el primero ya está marcado (`scheduler::mark_time_rule`). El texto de las fórmulas sale de `public/rezo/formulas.json`, que se genera con `python3 scripts/planilla-formulas.py <planilla.xlsx>` desde la planilla. **Proceso decidido por el usuario el 23/10/2026:** las palabras y el orden de cada fórmula son los de sus notas (columnas «de tus notas» de la planilla). El asistente solo ajusta la escritura árabe al Corán de la app con `scripts/escritura-coranica.py` (palabras y frases tal cual del texto Tanzil; lo que no está, con las mismas reglas de escritura) y la transliteración a la convención estricta, y propone traducciones. No agrega palabras ni inventa fórmulas. El usuario aprueba cada fila (en el chat o en la planilla) y firma «Revisó». Sigue prohibido copiar texto de ediciones con derechos (Sistani, © The World Federation; sunnah.com; dorar.net), y las fórmulas que no están en sus notas no tienen texto hasta que él lo dé. Si se agrega una fórmula a la guía, su `id` tiene que existir también en la planilla. Transliteración estricta (con ẓ; clave en `CLAVE_TRANSLITERACION`). `scripts/planilla-notas.py` solo copia las notas del usuario a columnas de ayuda, nunca a las revisadas. Ver `docs/guia-del-rezo.md`, `public/rezo/README.md` y `docs/investigacion-fuentes-rezo.md`.
- **Respaldo y sincronización con Google (en curso, sin versión asignada; desktop-only)**: módulo `src-tauri/src/sync_google.rs` + panel nuevo «Respaldo y sincronización» (`GoogleSync.tsx`, subpantalla de Configuración). Diseño y decisiones en `docs/sincronizacion-google.md` (spike aprobado). Flujos: OAuth desktop PKCE + loopback propio (sin plugin), refresh token en el keyring del sistema (`keyring`: libsecret Linux / Credential Manager Windows; nunca en `config.json`), un archivo `adhan-companion-backup.json` en `appDataFolder` con config + lector + registro. Reglas: registro en **unión por evento** (append-only intacto, se agrega lo que falta; el orden conservador deja `rezado` último por (fecha, rezo)); config/lector **LWW con consulta** — si difieren, el sync se detiene en `conflicto` y el usuario elige local/Drive; registro local vacío con historial remoto → oferta de restauración explícita. Credenciales: `build.rs` lee `.oauth.local` de la raíz (fuera de Git) y exporta `GOOGLE_OAUTH_CLIENT_ID[/_SECRET]`; sin credencial la build compila con marcador, el panel no se muestra (`runtime_info.google_sync = false`) y el arranque no consulta el keyring: así salen las builds de la CI desde v0.1.15. Las dependencias del sync (`keyring`, `reqwest`, `base64`, `getrandom`) van en la sección de escritorio de `Cargo.toml`; Android no las compila. Los comandos (`sync_*`) están registrados en el bloque `#[cfg(desktop)]`; el arranque deferra el chequeo (desktop.rs, 14 s) con la misma semántica del botón. Los comandos del sync necesitan el permiso propio `google-sync` (`src-tauri/permissions/sync.toml`) declarado en `capabilities/default.json` — sin esa declaración la ventana rechaza la invocación con «sync_estado not allowed» (la regla de capabilities aplica igual a los comandos propios, no solo a plugins). Cuidado: `invoke_handler` **pisa** al anterior — hay un único handler por plataforma (desktop con `sync_*`, mobile sin ellos) y mantener las dos listas sincronizadas. Verificado en esta máquina (22/10, dev): autorización OAuth real, primera subida creada en Drive y sobrescritura por PATCH en el segundo sync. **Pendiente**: cliente OAuth de **producción** (Testing caduca los refresh tokens a los 7 días) y el conflicto/restauración, que requieren una segunda máquina.
- Android: edición experimental en desarrollo con identidad y datos separados, interfaz móvil y workflow propio de APK de depuración ARM64 y ARMv7 (32 bits). Incluye integración nativa experimental de AlarmManager, Adhan, tonos y preavisos; actualización real 10017 → 10018 desde la app comprobada en J7 SM-J710MN/Android 8.1, con conservación de configuración y lector verificada por hashes; conservación de esos datos y de las preferencias de avisos comprobada también después de reiniciar el teléfono. Preaviso y Adhan de Maghrib comprobados en ese J7 con pantalla apagada, USB desconectado y ahorro de energía activo el 19/10/2026; entrega registrada sin error y siguiente ciclo programado. Reprogramación automática tras nuevo reinicio comprobada sin abrir la app: el broadcast BOOT_COMPLETED tardó en llegar por la cola del sistema; luego AlarmManager registró ambas alarmas. Entrega audible de ese ciclo posterior pendiente. No generalizar a Doze profundo, otros modos de ahorro o varios días. `AndroidUpdates.kt` admite releases oficiales y el canal experimental mediante `android-update.json`, descarga en caché privada y verifica SHA-256/versión/identidad/ABI/firma con apksig antes de abrir el instalador; requiere confirmación de Android y permiso de fuente en Android 8+. El executor de descargas es independiente de las alarmas. CI firma ambos APK con la clave PKCS12 persistente de los secretos `ANDROID_KEY_BASE64`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`, usando apksigner fuera de Gradle y de sus cachés. No rotar la clave; los primeros APK con firma temporal requieren migración. `versionCode`: releases oficiales `1000000 + major*1000000 + minor*10000 + patch*100` (1010900 en v0.1.9); workflow experimental `10000 + github.run_number`. El cálculo headless pasa por JNI al mismo PrayTimes C; no duplicarlo en Kotlin. Los avisos empiezan desactivados y requieren activación y permisos. Desde v0.1.9, por pedido explícito del usuario, Release publica también APK release firmados junto con escritorio. Conservar la identidad/firma existente y comunicar el alcance de validación experimental; no certificar otros dispositivos por el ensayo del J7.

## Respaldo de Android durante pruebas

- En el J7 SM-J710MN, `config.json` reside en la raíz privada de la app. Un respaldo de `files/` solamente no conserva la configuración. Incluir archivos propios y `shared_prefs/`; mantener también un APK original cuando se migre desde una firma antigua.
- Los respaldos de pruebas se guardan en `.android-backups.local/`, privado y excluido de Git. Nunca incluirlos en commits o releases.
- Para restaurar mediante ADB, usar un canal binario comprobado (`adb shell -T`) y comparar después los hashes de los archivos leídos del teléfono. Una salida exitosa del comando de transferencia no prueba por sí sola que se hayan escrito los datos. Ajustar UID/GID a la instalación de destino y regenerar las cachés.

## Presentación Android oficial

Desde v0.1.10 no usar «experimental» en el nombre visible, el menú ni el canal mostrado. Conservar el identificador técnico histórico, paquetes Kotlin/JNI y firma para mantener las actualizaciones y datos. Los enlaces cortos de Maps se resuelven por HEAD nativo en un executor independiente de las alarmas; Rust valida cada salto e interpreta el pin. No sustituir un pin preciso por coordenadas redondeadas del nombre del lugar.
