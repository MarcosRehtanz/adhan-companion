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
| Adhan, tonos y preavisos | Integración nativa experimental: AlarmManager, notificaciones y MediaPlayer con servicio visible y acción Detener. Activación manual y permisos; validación en el J7 pendiente. |
| Actualizaciones | Instalación manual de APK de prueba; el actualizador de escritorio no se ejecuta. |

La app muestra una indicación de **Android experimental**. El hilo que actualiza la consulta de horarios puede suspenderse junto con el proceso; los avisos se programan por separado en Android y no dependen de la WebView. El usuario confirmó que el menú hamburguesa funciona en el J7 con la compilación anterior a esta integración de audio.

## Estado de la primera compilación

El 18 de octubre de 2026 se completaron la compilación de la interfaz, la comprobación del core de Linux y la generación local del APK Android ARM64 de depuración. El APK inicial ocupa unos 165 MiB e identifica la app como `io.github.marcosrehtanz.adhancompanion.experimental`, versión 0.1.8. En esa primera compilación, la instalación y la revisión funcional en un teléfono real todavía estaban pendientes.

El usuario confirmó después la instalación de la variante ARMv7 en su J7 con Android 8.1.0 y reportó que el sidebar permanecía visible. La revisión del CSS de producción encontró reglas transformadas a `(width <= 720px)`, incompatibles con WebViews anteriores a Chromium 104. La versión exacta del WebView del teléfono no está confirmada. El build ahora fija `target` y `cssTarget` a `chrome80` para conservar `max-width`; la compilación local confirmó esa salida. El diseño completo todavía requiere revisión en el teléfono.

## Interfaz móvil

- En Android siempre se usa un botón hamburguesa con los nombres completos de todas las secciones; el sidebar de escritorio no se renderiza. En escritorio, se conserva el sidebar y se sustituye por el menú hasta 720 píxeles de ancho.
- El diálogo mantiene el foco en el menú y devuelve el foco al cerrarlo; permite cerrar con su botón o tocando el fondo.
- El menú tiene desplazamiento vertical y altura de respaldo en `vh` para WebViews sin soporte de `dvh`.
- El contenido usa todo el ancho disponible, adapta tarjetas y formularios y contempla las áreas seguras de la pantalla.
- Los controles principales tienen al menos 44 píxeles de altura. Los calendarios conservan sus siete columnas.
- El registro presenta los cinco rezos como filas para facilitar el marcado táctil.
- La barra de guardar aparece cuando hay una edición, cambios pendientes o un mensaje de estado.
- Las preferencias siguen mostrando primero un resumen y abren los campos mediante **Editar**, con **Guardar** y **Cancelar**.

La adaptación también se aplica a ventanas pequeñas de escritorio. Las comprobaciones visuales en un teléfono real siguen pendientes.

La compatibilidad de compilación se basa en las opciones [`build.target` y `build.cssTarget` de Vite](https://vite.dev/config/build-options.html). El cambio de sintaxis de media queries llegó en [Chromium 104](https://blog.chromium.org/2022/06/chrome-104-beta-new-media-query-syntax.html). El objetivo de compilación no añade polyfills para todas las API del navegador ni certifica compatibilidad completa con cualquier WebView antiguo.

## Separación de plataformas y datos

El arranque de escritorio está en `src-tauri/src/desktop.rs`; mantiene el tray y el scheduler actuales. El arranque móvil está en `src-tauri/src/mobile.rs`, con actualización de horarios y registro manual, sin tray ni inicio de sesión automático.

Las dependencias de tray, autostart, instancia única y audio de escritorio se limitan a sus plataformas. Android no ejecuta `curl` para resolver enlaces cortos ni para buscar actualizaciones.

La configuración específica de Android usa el identificador `io.github.marcosrehtanz.adhancompanion.experimental` y el nombre **Adhan Companion Experimental**. Configuración, historial y estado del lector se guardan en el directorio privado de datos que entrega Tauri. La ruta real se puede consultar en Sistema. Esta identidad separa la edición experimental de una futura app estable.

Los datos no se sincronizan automáticamente con la instalación de escritorio. Desinstalar Android puede eliminar sus datos locales.

## Compilación local

Requisitos: JDK 21, Android SDK, NDK 27.2.12479018, plataforma Android 36, build tools 36.0.0 y el target Rust de la arquitectura elegida. La configuración inicial requiere acceso a Internet para descargar herramientas y dependencias. Ver [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/).

Definir `JAVA_HOME`, `ANDROID_HOME` y `NDK_HOME` con las rutas de la instalación local y agregar Java y Cargo al `PATH`.

```bash
rustup target add aarch64-linux-android
pnpm install --frozen-lockfile
pnpm tauri android build --debug --apk --target aarch64 --ci
```

Para ARM de 32 bits, instalar `armv7-linux-androideabi` y compilar con `--target armv7`. La variante ARM64 usa `aarch64-linux-android` y `--target aarch64`.

El proyecto Android generado se conserva en `src-tauri/gen/android/`. Los APK se producen bajo `app/build/outputs/apk/` dentro de ese directorio. Para trabajar con dispositivo o emulador:

```bash
pnpm tauri android dev
```

Se distribuyen APK separados ARM64 (`arm64-v8a`) y ARMv7 (`armeabi-v7a`, 32 bits). La primera compilación solo incluía ARM64; se incorpora ARMv7 tras el fallo de instalación reportado en un J7 con Android 8.1.0. El usuario solo recibe «No se instaló la aplicación», por lo que la causa y el modelo exacto siguen sin confirmar. Android documenta las [arquitecturas nativas y su selección por el instalador](https://developer.android.com/ndk/guides/abis).

Un emulador x86_64 necesita instalar el target Rust correspondiente y compilar para esa arquitectura. Esta edición fija Android 7.0 (API 24) como mínimo de configuración; la compatibilidad efectiva debe revisarse en dispositivos. Al empaquetar se quitan los símbolos nativos de depuración para reducir el tamaño, conservándolos en los productos locales de compilación.

## Workflow experimental

`.github/workflows/android-experimental.yml` genera APK de depuración para ARM64 y ARMv7 en jobs separados. Se ejecuta manualmente desde GitHub Actions o al subir a `main` cambios en las rutas de la app incluidas en el workflow. Entrega los artefactos **android-experimental-arm64** y **android-experimental-armv7**, cada uno con APK, checksum por arquitectura y este documento; se conservan durante 30 días. Antes de subir un APK, comprueba que contenga la biblioteca del core para la arquitectura indicada.

El workflow estable de Linux y Windows continúa separado. El APK experimental no se incorpora a la release estable ni se publica en Google Play.

Al ejecutar manualmente el workflow sobre `main`, la opción **Publicar una prerelease con descarga directa del APK** está activada por defecto. Tras compilar ambas variantes, publica los dos `.apk`, un `SHA256SUMS` conjunto y `LEEME.md` en una prerelease `android-experimental-<commit>`. Los pushes automáticos generan únicamente los artefactos de Actions. Si ya existe una prerelease para el mismo commit, se conservan sus APK originales. Las prereleases no reemplazan la release estable marcada como Latest.

Los APK publicados por CI usan una **clave experimental persistente**, guardada en los secretos de Actions `ANDROID_KEY_BASE64`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. El almacén es PKCS12 y utiliza la misma contraseña para el almacén y la clave. El workflow requiere los tres secretos; si falta alguno o la firma falla, no publica el APK.

La firma se aplica con `apksigner` después de compilar. El archivo privado se reconstruye temporalmente bajo `RUNNER_TEMP`, con permisos restringidos, y se elimina al terminar el paso. Los secretos solo se entregan al paso de firma; Gradle no recibe la clave ni su contraseña. No incluirlos en el código, logs, artefactos o cachés. Conservar un respaldo seguro del almacén y de la contraseña y no reemplazar la clave entre releases. `.gitignore` excluye `.p12`, `.jks` y `.keystore`.

`ANDROID_EXPERIMENTAL_VERSION_CODE` se fija en CI a `10000 + github.run_number`, superior al antiguo código 1008. Ambas arquitecturas comparten el mismo código en cada ejecución; un rerun conserva ese código. Gradle valida su rango y usa el valor de Tauri al compilar localmente sin esa variable. Si se reemplaza el workflow por otro cuyo contador empiece de cero, hay que conservar la monotonía de los códigos antes de publicar.

**Migración inicial:** las compilaciones anteriores a la firma persistente, incluida `1c7dc94`, usaron claves temporales diferentes. Esta nueva clave no permite actualizar sobre ellas conservando automáticamente la instalación. Las compilaciones locales de depuración también mantienen su clave local, salvo que se firmen con la persistente. No desinstalar una copia con datos importantes como solución automática a un conflicto de firma. La actualización descargada desde la propia app todavía está pendiente; los APK siguen instalándose manualmente.

Para una distribución estable se prepararán su identidad y clave de firma propias, versiones Android y, si se solicita Google Play, AAB. Ver [distribución](https://v2.tauri.app/distribute/google-play/) y [firma Android en Tauri](https://v2.tauri.app/distribute/sign/android/).

## Adhan y avisos nativos

En **Adhan y avisos → Avisos en este teléfono**, revisar la ubicación y activar los avisos. La activación es exclusiva de este teléfono y empieza desactivada. El resumen muestra los permisos, el próximo aviso programado y el último problema. Los modos, tonos, volumen y preaviso existentes se editan mediante **Editar**, **Guardar** y **Cancelar**. **Probar** usa lo mostrado sin guardar ni marcar el rezo.

- `PrayerAlarms.kt` conserva una copia privada del contrato de configuración, calculada y sincronizada desde Rust. `PrayerNative.calculate` llama por JNI al mismo PrayTimes C; no hay cálculo de horarios en JavaScript ni una segunda implementación en Kotlin. Utiliza la zona del sistema y el offset al mediodía del día calculado, como escritorio.
- Se mantienen dos alarmas: próximo rezo y próximo preaviso. Cada entrega calcula y programa las siguientes, incluyendo el día posterior a Isha. El rezo usa `setAlarmClock` (visible como próxima alarma de Android); el preaviso usa `setExactAndAllowWhileIdle`.
- Se reprograma al iniciar/reanudar la app, guardar configuración, reiniciar el teléfono, actualizar el paquete y cambiar fecha/zona o conceder acceso a alarmas exactas. El receiver de arranque solo reprograma; no inicia audio.
- Antes de entregar se comprueban la generación de configuración, la alarma vigente y el último identificador entregado. Se descartan entregas con más de 120 segundos de retraso; no se recuperan rezos pasados al abrir la app. Los disparos no se registran como rezos realizados.
- `PrayerAudioService.kt` reproduce los WAV originales incluidos, con asignación fija por rezo (Dhuhr usa `default.wav`), o tonos PCM generados localmente. No requiere Internet. No modifica los archivos originales ni el texto del Adhan.
- El audio usa un servicio `mediaPlayback`, notificación con **Detener**, foco de audio y wake lock durante la reproducción. Se libera al terminar, detener, perder foco o alcanzar el límite de seguridad (10 minutos para Adhan; duración elegida más margen para tonos). No se reinicia automáticamente una reproducción interrumpida.
- El volumen de la app multiplica el volumen de alarmas del sistema. No se cambia el volumen del teléfono ni se solicita saltar No molestar. El canal de rezos es silencioso para evitar duplicar el audio; el de preavisos tiene sus propias preferencias del sistema.

### Permisos y límites

Se declaran notificaciones, alarmas exactas, recepción de arranque, servicio en primer plano de reproducción y wake lock. En Android 13+ se solicita permiso de notificaciones; en Android 12+ se abre el acceso especial a alarmas exactas si falta. No se programa ningún aviso mientras falte alguno. En Android 8.1 las alarmas exactas no tienen ese diálogo especial. Los botones se muestran cuando el permiso correspondiente falta.

Android y los fabricantes pueden restringir actividad de fondo. En Samsung, revisar el ahorro de batería y permitir actividad en segundo plano si bloquea los avisos. Forzar la detención desde Ajustes impide recibir alarmas hasta volver a abrir la app. Los preavisos pueden retrasarse por las cuotas de Doze, especialmente si se configuran muy cerca del rezo; el audio del rezo usa una alarma de reloj separada. No se garantiza comportamiento de despertador certificado.

### Estado de comprobación y siguiente paso

Interfaz, core Linux y Android y código Kotlin compilados. Pendiente comprobar en el J7: **Probar** Adhan/los tres tonos/solo notificación, volumen y Detener desde la notificación; entrega real de rezo y preaviso con pantalla apagada, después de retirar la app de recientes y tras reiniciar; cambio de ubicación/hora, permisos y batería. La compatibilidad declarada no sustituye esta revisión en hardware.

La firma experimental persistente está configurada en CI; pendiente incorporar la búsqueda, descarga e instalación de actualizaciones desde la app y resolver la migración de instalaciones con firmas anteriores. La recitación del Qur’an y sus controles multimedia siguen fuera de esta integración.

Referencias: [alarmas de Android](https://developer.android.com/develop/background-work/services/alarms), [tipos de servicio en primer plano](https://developer.android.com/develop/background-work/services/fgs/service-types) y [plugins móviles de Tauri](https://v2.tauri.app/develop/plugins/develop-mobile/). Android 15+ restringe iniciar reproducción desde BOOT_COMPLETED; por eso el receiver de arranque únicamente reprograma las alarmas.
