# Android experimental

La primera edición Android comparte el cálculo local y la interfaz React con escritorio. Está destinada a probar consulta de horarios, configuración, registro, calendario islámico, temas y lectura offline del Qur’an. Su implementación parte de v0.1.8 y todavía no tiene una release estable asignada.

## Alcance de esta edición

| Función | Alcance experimental |
| --- | --- |
| Horarios y próximo rezo | Cálculo local con el mismo PrayTimes C; actualización mientras el proceso está activo. |
| Ubicación | Entrada manual, sugerencia por IP y coordenadas o enlaces completos de un punto de Google Maps. Los enlaces cortos requieren abrir Maps y copiar las coordenadas. |
| Registro | Historial local y marcado manual por fecha. No se registran disparos automáticos de Adhan. |
| Calendario islámico | Tabular civil con ajuste manual existente. |
| Apariencia | Temas y acentos con Guardar y Cancelar. |
| Qur’an | Texto árabe y traducción offline, marcadores y punto de lectura locales. Recitación pendiente según su RDD. |
| Adhan, tonos y preavisos | Integración nativa pendiente; no se emiten automáticamente. La prueba de audio aparece deshabilitada. Las preferencias se pueden guardar para una futura integración. |
| Actualizaciones | Instalación manual de APK de prueba; el actualizador de escritorio no se ejecuta. |

La app muestra una indicación de **Android experimental** con las funciones disponibles y la ausencia de avisos y audio. El hilo que actualiza horarios no sustituye a las alarmas de Android y puede suspenderse junto con el proceso.

## Estado de la primera compilación

El 18 de octubre de 2026 se completaron la compilación de la interfaz, la comprobación del core de Linux y la generación local del APK Android ARM64 de depuración. El APK inicial ocupa unos 165 MiB e identifica la app como `io.github.marcosrehtanz.adhancompanion.experimental`, versión 0.1.8. La instalación y revisión funcional en un teléfono real siguen pendientes.

## Interfaz móvil

- Hasta 720 píxeles de ancho, la navegación lateral se sustituye por un botón de menú y un diálogo con los nombres completos de todas las secciones.
- El diálogo mantiene el foco en el menú y devuelve el foco al cerrarlo; permite cerrar con su botón o tocando el fondo.
- El contenido usa todo el ancho disponible, adapta tarjetas y formularios y contempla las áreas seguras de la pantalla.
- Los controles principales tienen al menos 44 píxeles de altura. Los calendarios conservan sus siete columnas.
- El registro presenta los cinco rezos como filas para facilitar el marcado táctil.
- La barra de guardar aparece cuando hay una edición, cambios pendientes o un mensaje de estado.
- Las preferencias siguen mostrando primero un resumen y abren los campos mediante **Editar**, con **Guardar** y **Cancelar**.

La adaptación también se aplica a ventanas pequeñas de escritorio. Las comprobaciones visuales en un teléfono real siguen pendientes.

## Separación de plataformas y datos

El arranque de escritorio está en `src-tauri/src/desktop.rs`; mantiene el tray y el scheduler actuales. El arranque móvil está en `src-tauri/src/mobile.rs`, con actualización de horarios y registro manual, sin tray ni inicio de sesión automático.

Las dependencias de tray, autostart, instancia única y audio de escritorio se limitan a sus plataformas. Android no ejecuta `curl` para resolver enlaces cortos ni para buscar actualizaciones.

La configuración específica de Android usa el identificador `io.github.marcosrehtanz.adhancompanion.experimental` y el nombre **Adhan Companion Experimental**. Configuración, historial y estado del lector se guardan en el directorio privado de datos que entrega Tauri. La ruta real se puede consultar en Sistema. Esta identidad separa la edición experimental de una futura app estable.

Los datos no se sincronizan automáticamente con la instalación de escritorio. Desinstalar Android puede eliminar sus datos locales.

## Compilación local

Requisitos: JDK 21, Android SDK, NDK 27.2.12479018, plataforma Android 36, build tools 36.0.0 y target Rust ARM64. La configuración inicial requiere acceso a Internet para descargar herramientas y dependencias. Ver [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/).

Definir `JAVA_HOME`, `ANDROID_HOME` y `NDK_HOME` con las rutas de la instalación local y agregar Java y Cargo al `PATH`.

```bash
rustup target add aarch64-linux-android
pnpm install --frozen-lockfile
pnpm tauri android build --debug --apk --target aarch64 --ci
```

El proyecto Android generado se conserva en `src-tauri/gen/android/`. Los APK se producen bajo `app/build/outputs/apk/` dentro de ese directorio. Para trabajar con dispositivo o emulador:

```bash
pnpm tauri android dev
```

La compilación inicial se centra en ARM64. Un emulador x86_64 necesita instalar el target Rust correspondiente y compilar para esa arquitectura. Esta edición fija Android 7.0 (API 24) como mínimo de configuración; la compatibilidad efectiva debe revisarse en dispositivos.

## Workflow experimental

`.github/workflows/android-experimental.yml` genera un APK ARM64 de depuración. Se ejecuta manualmente desde GitHub Actions o al subir a `main` cambios en las rutas de la app incluidas en el workflow. Entrega el artefacto **android-experimental-arm64**, con APK, SHA256SUMS y este documento; se conserva durante 30 días.

El workflow estable de Linux y Windows continúa separado. El APK experimental no se incorpora a la release estable ni se publica en Google Play.

El APK de depuración utiliza una firma de desarrollo. Las claves locales y las de distintas ejecuciones de CI pueden diferir: instalar otra compilación sobre la anterior puede fallar por firma incompatible. Antes de distribuir actualizaciones que deban conservar datos, se necesita una clave de firma experimental persistente y su configuración protegida en CI. No desinstalar una copia con datos importantes como solución automática a un conflicto de firma.

Para una distribución estable se prepararán firma persistente, versiones Android y, si se solicita Google Play, AAB. Ver [distribución](https://v2.tauri.app/distribute/google-play/) y [firma Android en Tauri](https://v2.tauri.app/distribute/sign/android/).

## Próxima integración nativa

1. Programar los rezos y preavisos mediante `AlarmManager`, con permisos y reprogramación al reiniciar el teléfono o cambiar fecha, zona o configuración.
2. Incorporar audio y acciones nativas para detener el aviso, revisando su funcionamiento con pantalla apagada y ahorro de batería.
3. Integrar reproducción prolongada del Qur’an con el ciclo de vida y los controles multimedia de Android cuando se implemente el audio.
4. Revisar permisos de notificaciones, persistencia, tamaño de letra, teclado, orientación y navegación Atrás en un dispositivo real.
5. Configurar firma persistente antes de ofrecer actualizaciones instalables sobre la misma app experimental.

Android documenta las [alarmas fuera del ciclo de vida de la app](https://developer.android.com/develop/background-work/services/alarms) y los [servicios en primer plano para reproducción multimedia](https://developer.android.com/develop/background-work/services/fgs/service-types). El scheduler permanente de escritorio no garantiza ese comportamiento en móvil.
