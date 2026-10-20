# Adhan Companion

App de escritorio **tray-first** para Linux y Windows: el tray es la app — horarios de los 5 rezos, preaviso + adhan asignado a cada rezo y marcado de rezos del día. Cálculo 100% local, sin backend.

## Estado

✅ **v0.1.10 para Linux, Windows y Android** — interfaz reorganizada, preferencias en modo lectura con edición explícita, tray con estados, scheduler 24/7, calendario de seguimiento, notificaciones + preaviso, cálculo local por FFI y biblioteca fija de muecines por rezo. Descargas: `.deb`, `.AppImage` e instalador de Windows x64 en [Releases](https://github.com/MarcosRehtanz/adhan-companion/releases/latest). Ver [notas de la versión](docs/releases/v0.1.10.md).

## Instalar (Ubuntu, sin toolchain)

```bash
# Descargá el .deb más reciente desde la página de Releases y luego:
sudo apt install "./Adhan.Companion_0.1.10_amd64.deb"
```

Queda como app nativa: tray en el menú, autostart, single-instance y config en `~/.config/adhan-companion/config.json`.

La AppImage está disponible como alternativa: darle permiso de ejecución y abrirla. La consulta y descarga de actualizaciones usa `curl` del sistema. El paquete `.deb` instala esa dependencia y la biblioteca ALSA necesaria para el audio.

## Windows

Descargá el instalador de Windows x64 (`*-setup.exe`) desde [GitHub Releases](https://github.com/MarcosRehtanz/adhan-companion/releases/latest) y ejecutalo. Se instala para el usuario actual. La configuración se guarda en `%APPDATA%\Adhan Companion\config.json`. El instalador gestiona WebView2 cuando falta; esa instalación requiere conexión a Internet.

## Publicar una release

GitHub Actions comprueba las versiones y las notas, ejecuta los tests del core en Ubuntu y Windows y compila los instaladores. Solo publica después de completar Linux, Windows y ambas arquitecturas Android: `.deb`, `.AppImage`, `*-setup.exe`, dos APK release firmados, `android-update.json` y `SHA256SUMS` en el mismo release.

La ejecución manual (`workflow_dispatch`) permite validar los builds y descargar los artefactos sin publicar. El tag `vX.Y.Z` activa la publicación. Los pasos para preparar, validar y publicar están en [Publicar una release](docs/publicar-release.md).

## Qué hace hoy

- **Cálculo 100% local** de los 5 horarios con [PrayTimes C](https://github.com/crodesrepos/praytimes) compilado en el core Rust por FFI — sin red, mismo código que el firmware del nodo hermano ("Adhan Companion — Alarma de Salat", ESP32-S3).
- **Icono del tray** con estados (silenciado / día / próximo < 15 min / adhan sonando) y menú con countdown + horarios del día.
- **Preaviso + adhan real** con volumen propio; confirmás "ya recé" desde el tray o silenciás.
- **Adhan por rezo**: cada oración tiene una asignación fija de la colección Doha (Public Domain Mark 1.0), instalada con el `.deb`; se pueden añadir archivos WAV en la carpeta de usuario.
- **Seguimiento con calendario**: marcá los rezos del día (o de días pasados), registro append-only en `registro.jsonl`.
- Config: ubicación (sugerencia por IP con cadena de 3 proveedores), método (MWL/ISNA/Egypt/…), madhab, offsets, audio por rezo.
- 24/7 real: autostart, single-instance, recálculo a medianoche y al reanudar del sleep.

## Novedades de v0.1.8

- Próximo rezo del día siguiente después de Isha, con fecha y cuenta regresiva correctas.
- [Ubicación mediante Google Maps](docs/ubicacion-google-maps.md): importar coordenadas o enlaces y revisar antes de guardar.
- [Avisos por rezo](docs/avisos-por-rezo.md): adhan, tres tonos discretos o solo notificación, con prueba y detención.
- [Calendario islámico](docs/calendario-islamico.md) tabular local, consulta mensual y ajuste manual de −2 a +2 días.
- Configuración → Apariencia: temas claro, oscuro o del sistema y cinco colores de acento.
- [Lector del Qur'an](docs/lector-quran.md): árabe y español offline, marcadores y punto de lectura. Su contenido tiene condiciones independientes, incluida la restricción no comercial de la traducción.

El lector se [revisó en la app nativa de Linux](docs/revision-lector-quran.md). La [recitación de Parhizgar en escritorio](docs/recitacion-quran.md) incluye controles por aleya, descargas por sura y prioridad de avisos. Ver la [revisión funcional de estados](docs/revision-estados-escritorio.md), el [RDD](docs/rdd-recitacion-quran.md) y el [roadmap](docs/roadmap.md). La revisión visual y auditiva en Windows requiere un equipo Windows.

## Novedades de v0.1.10

- Google Maps: enlaces cortos también en Android, sin curl.
- Ubicación: el pin preciso tiene prioridad sobre las coordenadas redondeadas en la ruta.
- Presentación oficial Android sin rótulos «experimental»; identidad y firma conservadas.

## Novedades de v0.1.9

- Recitación de Parhizgar para Linux y Windows y descarga de audio por sura.
- Estados, errores y reintentos confirmados por el core; ediciones en modo lectura con Editar, Guardar y Cancelar.
- Menú responsive lateral desde la izquierda. Sonidos y preavisos en **Configuración → Adhan y avisos**.
- APK oficiales ARMv7 y ARM64, sin depuración y firmados con la clave persistente existente.

### Android

Descargá el APK **ARMv7** para dispositivos de 32 bits (incluido el J7 probado) o **ARM64** para dispositivos de 64 bits desde el [release oficial](https://github.com/MarcosRehtanz/adhan-companion/releases/latest). Requiere Android 7.0/API 24 o superior. Instalalo sobre la app existente, sin desinstalar ni borrar datos. El nombre visible es Adhan Companion; conserva el identificador técnico y la firma anteriores para preservar los datos y la compatibilidad de actualización.

**Configuración → Actualizaciones** busca, descarga y verifica el APK antes de abrir el instalador de Android; la instalación necesita confirmación del usuario. La compilación 10018 recibe el release mediante una prerelease puente compatible con su actualizador anterior. **Adhan, tonos y preavisos** usan alarmas y audio nativos, con activación y permisos. El J7/Android 8.1 comprobó la compilación anterior con pantalla apagada y ahorro de batería; no generalizar ese resultado a todos los dispositivos ni a este nuevo APK sin probarlo. El lector escrito del Qur’an está incluido; su recitación en Android sigue pendiente. Ver [detalles Android](docs/android-experimental.md).

## Stack

- **Core Rust** ([Tauri 2](https://v2.tauri.app/)): tray, scheduler, audio, FFI — corre siempre, independiente de la ventana.
- **Frontend React/TS**: configuración + dashboard del día en la webview.
- Distribución Linux: `.deb` y `AppImage`; Windows: instalador NSIS. El actualizador propio solo instala actualizaciones al ejecutar una AppImage; `.deb` y Windows se actualizan ejecutando el instalador del release.

## Desarrollo

```bash
pnpm install
pnpm tauri dev      # desarrollo (vite :1420 + hot-reload del core)
pnpm tauri build    # produce .deb + AppImage
pnpm release:check  # comprueba versiones y notas de publicación
# En Windows, desde PowerShell con Rust y Visual Studio C++ Build Tools:
pnpm tauri build --bundles nsis
```

Prerequisitos Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev pkg-config libasound2-dev` + toolchain Rust.

Si hay una versión instalada abierta, cerrala con **Salir** en su tray antes de iniciar `pnpm tauri dev`: la protección de instancia única puede enfocar esa versión anterior. Cerrar la ventana solo la oculta.

Las instrucciones para sesiones con agentes de código están en [AGENTS.md](AGENTS.md).

## Licencia

El código propio se distribuye bajo MIT — ver [LICENSE](LICENSE). El código C de PrayTimes incluido en `src-tauri/native/` declara GNU LGPL v3.0 y conserva su aviso de copyright; su licencia también se incluye en los recursos del paquete. Las grabaciones de audio tienen créditos y fuente en [`src-tauri/assets/muecin/CREDITS.md`](src-tauri/assets/muecin/CREDITS.md). El lector del Qur'an incluye recursos de terceros con condiciones independientes: texto árabe de Tanzil, traducción de Bórnez para uso no comercial, metadatos atribuidos a Tanzil y fuente Amiri Quran bajo SIL OFL 1.1. Ver [`public/quran/README.md`](public/quran/README.md) y los avisos completos incluidos.
