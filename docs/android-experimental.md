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
| Qur’an | Texto árabe y traducción offline, marcadores y punto de lectura locales. Recitación con reproductor nativo en desarrollo desde el 20/10/2026, sin comprobar en el J7 (ver [recitación](recitacion-quran.md#android)). |
| Adhan, tonos y preavisos | Integración nativa experimental: AlarmManager, notificaciones y MediaPlayer con servicio visible y acción Detener. Activación manual y permisos; preaviso y Adhan de Maghrib comprobados en el J7 con pantalla apagada y ahorro de energía (ver ensayo abajo). |
| Actualizaciones | Configuración → Actualizaciones: buscar, descargar el APK compatible, verificarlo y abrir el instalador de Android. Canal experimental separado del escritorio. |

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

`.github/workflows/android-experimental.yml` genera APK de depuración para ARM64 y ARMv7 en jobs separados. Desde v0.1.9 se ejecuta solo manualmente desde GitHub Actions; los APK oficiales se validan en el PR y se publican mediante Release al etiquetar. Entrega los artefactos **android-experimental-arm64** y **android-experimental-armv7**, cada uno con APK, checksum por arquitectura y este documento; se conservan durante 30 días. Antes de subir un APK, comprueba que contenga la biblioteca del core para la arquitectura indicada.

Desde v0.1.9, el workflow Release genera APK de producción firmados para ARMv7 y ARM64 y los incorpora al release oficial junto con Linux y Windows. Este workflow experimental conserva las compilaciones de depuración por separado; no se publica en Google Play.

Al ejecutar manualmente el workflow sobre `main`, la opción **Publicar una prerelease con descarga directa del APK** está activada por defecto. Tras compilar ambas variantes, publica los dos `.apk`, un `SHA256SUMS` conjunto y `LEEME.md` en una prerelease `android-experimental-<commit>`. Los pushes automáticos generan únicamente los artefactos de Actions. Si ya existe una prerelease para el mismo commit, se conservan sus APK originales. Las prereleases no reemplazan la release estable marcada como Latest.

Los APK publicados por CI usan una **clave experimental persistente**, guardada en los secretos de Actions `ANDROID_KEY_BASE64`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. El almacén es PKCS12 y utiliza la misma contraseña para el almacén y la clave. El workflow requiere los tres secretos; si falta alguno o la firma falla, no publica el APK.

La firma se aplica con `apksigner` después de compilar. El archivo privado se reconstruye temporalmente bajo `RUNNER_TEMP`, con permisos restringidos, y se elimina al terminar el paso. Los secretos solo se entregan al paso de firma; Gradle no recibe la clave ni su contraseña. No incluirlos en el código, logs, artefactos o cachés. Conservar un respaldo seguro del almacén y de la contraseña y no reemplazar la clave entre releases. `.gitignore` excluye `.p12`, `.jks` y `.keystore`.

`ANDROID_EXPERIMENTAL_VERSION_CODE` se fija en CI a `10000 + github.run_number`, superior al antiguo código 1008. Ambas arquitecturas comparten el mismo código en cada ejecución; un rerun conserva ese código. Gradle valida su rango y usa el valor de Tauri al compilar localmente sin esa variable. Si se reemplaza el workflow por otro cuyo contador empiece de cero, hay que conservar la monotonía de los códigos antes de publicar.

**Migración inicial:** las compilaciones anteriores a la firma persistente, incluida `1c7dc94`, usaron claves temporales diferentes. Esta nueva clave no permite actualizar sobre ellas conservando automáticamente la instalación. Las compilaciones locales de depuración también mantienen su clave local, salvo que se firmen con la persistente. No desinstalar una copia con datos importantes como solución automática a un conflicto de firma. La búsqueda, descarga y apertura del instalador desde la app están implementadas a partir de la versión que incorpora `AndroidUpdates.kt`. Para obtener esa primera versión hay que instalar su APK una vez desde GitHub.

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

Interfaz, core Linux y Android y código Kotlin compilados. Entrega real de preaviso y Adhan de Maghrib comprobada en el J7 con pantalla apagada, sin USB y ahorro de energía activo (ensayo abajo). Pendiente comprobar: **Probar** Adhan/los tres tonos/solo notificación, volumen y Detener desde la notificación; entregas después de retirar la app de recientes y sin abrirla tras reiniciar; cambio de ubicación/hora, permisos, Doze profundo y otros modos de ahorro. La compatibilidad declarada no sustituye esta revisión en hardware.

La firma experimental persistente y el actualizador dentro de la app están implementados. En el J7 se comprobó la actualización real 10017 → 10018 y la conservación de los datos del ensayo. Las instalaciones con otra firma siguen necesitando una migración manual con respaldo y autorización. La recitación del Qur’an tiene su propio servicio y notificación (`QuranPlayer.kt`); el Adhan la pausa antes de sonar.

Referencias: [alarmas de Android](https://developer.android.com/develop/background-work/services/alarms), [tipos de servicio en primer plano](https://developer.android.com/develop/background-work/services/fgs/service-types) y [plugins móviles de Tauri](https://v2.tauri.app/develop/plugins/develop-mobile/). Android 15+ restringe iniciar reproducción desde BOOT_COMPLETED; por eso el receiver de arranque únicamente reprograma las alarmas.

## Actualizaciones desde la app

**Configuración → Actualizaciones** muestra la versión, el número de compilación y la arquitectura instaladas. **Buscar actualizaciones** consulta las releases públicas del repositorio y considera exclusivamente el canal `android-experimental-*` con `android-update.json`. No utiliza `/releases/latest`, reservado al escritorio estable. Entre las veinte releases Android más recientes de la página de cien releases consultada, elige el mayor `version_code` compatible. Si no hay índices compatibles, muestra un problema; no declara que esté al día sin un índice válido.

El workflow genera un índice por arquitectura desde el APK firmado y combina ambos al publicar. `android-update.json` contiene `schema`, `package_id`, `tag`, `version_code`, `version_name`, `min_sdk` y, por ABI, nombre del APK, tamaño y SHA-256. La publicación comprueba que los índices de ambas arquitecturas coincidan y que los archivos correspondan con sus hashes. El índice solo se publica junto a los APK definitivos.

### Descarga e instalación

1. **Buscar actualizaciones** no descarga automáticamente el APK. Si hay una compilación mayor, muestra su versión y tamaño.
2. **Descargar actualización** obtiene el APK de la arquitectura del proceso (`armeabi-v7a` o `arm64-v8a`), muestra progreso y permite cancelar. La descarga se limita a 256 MiB y diez minutos, con timeouts por conexión/lectura y solo HTTPS desde GitHub y sus hosts de assets. No requiere permisos de almacenamiento compartido.
3. Antes de habilitar la instalación se comprueban tamaño, SHA-256, identificador del paquete, versión superior, mínimo de Android y biblioteca nativa de la arquitectura correspondiente. `ApkVerifier` de Google verifica criptográficamente la firma para el Android del dispositivo y compara los certificados con los de la app instalada. Una firma diferente bloquea la instalación y pide resolver la migración sin desinstalar los datos.
4. En Android 8+ el botón **Permitir instalar actualizaciones** abre el permiso de instalar desde esta fuente. Al volver, hay que pulsar **Instalar actualización**. Se valida otra vez el APK y se concede acceso temporal de lectura al instalador mediante FileProvider, limitado al directorio privado de caché `updates/`.
5. Android muestra su confirmación de instalación. Abrir el instalador no se informa como una instalación exitosa. Si se cancela, se puede volver a abrir; después de actualizar, el nuevo número instalado permite reconocer el resultado. El receiver `MY_PACKAGE_REPLACED` vuelve a programar los avisos nativos.

La descarga utiliza un executor independiente de las alarmas. En esta primera integración no hay servicio de descarga en segundo plano, reanudación parcial ni búsqueda periódica: mantener abierta la app mientras se descarga. Si Android elimina el proceso, se vuelve a buscar y descargar; el próximo intento limpia los archivos incompletos. Los archivos de actualización están en caché privada y Android también puede eliminarlos por falta de espacio. La actualización conserva configuración, registro y lectura al mantener identidad y firma; no desinstala ni borra esos datos.

La primera versión con este flujo debe instalarse desde GitHub sobre la edición con firma persistente. Una vez instalada, puede mostrar que está al día hasta que se publique otra compilación superior. Compilación de frontend, core y Kotlin comprobadas, además del ensayo real 10017 → 10018 en el J7: búsqueda, descarga, verificación, apertura del instalador, confirmación de Android y datos conservados después de actualizar. La compilación 10018, la configuración, el estado del lector y las preferencias de avisos se comprobaron también después de reiniciar el teléfono. Cancelación del instalador y fallos de descarga no ensayados.

Referencias: [PackageManager](https://developer.android.com/reference/android/content/pm/PackageManager), [verificador apksig de Google](https://android.googlesource.com/platform/tools/apksig/+/master/src/main/java/com/android/apksig/ApkVerifier.java) y [API de releases de GitHub](https://docs.github.com/en/rest/releases/releases).

## Ensayo guiado de actualización en el J7

Dispositivo confirmado mediante ADB: **Samsung SM-J710MN**, Android 8.1.0. Antes del ensayo se encontró instalada la compilación antigua **1008**, con un certificado diferente de la firma experimental persistente. Por eso el punto de partida 10017 requiere primero migrar los datos con respaldo y autorización para retirar la copia antigua.

### Respaldo y migración inicial

- Respaldar el APK instalado y todo el directorio privado accesible con `run-as` en esta edición de depuración. El `config.json` de este teléfono está en la raíz privada; copiar únicamente `files/` lo dejaría fuera.
- Mantener las copias y sus manifiestos SHA-256 en `.android-backups.local/`, excluido de Git, con acceso restringido. No publicar archivos privados, valores de configuración ni identificadores únicos del dispositivo.
- Pausar brevemente la app para obtener una copia coherente. Restaurar los archivos propios y preferencias con el UID/GID de la nueva instalación; regenerar cachés y archivos de ejecución de WebView.
- En este teléfono se comprobó la transferencia binaria de restauración con `adb shell -T ... tar -xf -`. No dar por restaurado un archivo porque ADB termine con código cero: volver a leerlo y comparar su SHA-256 antes de abrir la app.
- Conservar el APK original para recuperación. No retirar una instalación con firma distinta sin autorización explícita y un respaldo validado.

### Actualización real desde la app

1. Establecer la compilación **10017** con la firma persistente y confirmar sus datos visibles.
2. Publicar una nueva compilación experimental con número superior, misma identidad y certificado. El número de versión de escritorio puede seguir siendo 0.1.8; el actualizador Android compara `version_code`.
3. Registrar el estado que se va a comprobar: ubicación/preferencias, registro y, si existen, marcadores y última lectura. No crear registros de rezos realizados automáticamente solo para probar.
4. Desde **Configuración → Actualizaciones**, buscar, descargar y abrir el instalador. Comprobar progreso, SHA-256/firma y permiso para instalar desde esta fuente. Cancelación de descarga y de instalador son pasos opcionales previos al intento definitivo.
5. Confirmar la actualización en Android sin desinstalar. Abrir la app, comprobar el nuevo código y comparar los archivos de datos y su significado con el respaldo. Las preferencias nativas de alarmas incluyen fechas de programación que pueden cambiar legítimamente al reabrir; comparar aparte las preferencias elegidas por el usuario.
6. Comprobar también datos y avisos después de reiniciar el teléfono. Esa comprobación requiere coordinar el reinicio con el usuario.

Estado: respaldo privado y recuperación de la instalación original comprobados. Migración a **10017** completada, archivos propios restaurados con hashes idénticos y configuración JSON sin cambios después del arranque; el usuario confirmó que ve sus datos correctamente. Ensayo real **10017 → 10018** completado desde la app: búsqueda de versión superior, descarga y verificación, apertura del instalador y actualización confirmada por Android. El APK descargado e instalado coincidió con el SHA-256 de la release; `config.json` y `quran-reader.json` conservaron sus hashes y las preferencias elegidas de avisos se mantuvieron iguales. El usuario había guardado un marcador y un punto de lectura antes de actualizar. Comprobación posterior al reinicio completada: Android mantiene la compilación 10018, `config.json` y `quran-reader.json` siguen coincidiendo exactamente con el respaldo previo a la actualización y las preferencias elegidas de avisos se conservan. Esto comprueba la persistencia de los datos. La entrega real de preaviso y Adhan con pantalla apagada y ahorro de energía se comprobó después, en el ensayo descrito a continuación. No se ensayaron cancelación de descarga/instalador, falta de espacio ni una firma inválida; no considerar comprobados esos casos por este resultado.


## Ensayo de avisos con pantalla apagada y ahorro de energía

El **19 de octubre de 2026**, en el **Samsung J7 SM-J710MN, Android 8.1.0, compilación 10018**, se aprovechó el horario real de Maghrib sin modificar la ubicación ni los horarios guardados:

- Antes de desconectar, ADB confirmó `mLowPowerModeEnabled=true`, avisos activados y ambas alarmas programadas: preaviso a las **19:38:32** y Adhan a las **19:48:32**, hora local del teléfono.
- El usuario desconectó el USB, dejó la pantalla apagada y confirmó haber escuchado **ambos** avisos en esas condiciones.
- Al reconectar, el ahorro de energía seguía activo. Las preferencias nativas registraban la entrega del preaviso y del rezo de Maghrib, sin error, y la programación del siguiente ciclo.
- El respaldo y las evidencias del ensayo se conservan en el directorio privado de pruebas, excluido de Git.

**Resultado:** entrega audible comprobada para ese ciclo en ese dispositivo. Los identificadores guardados contienen el horario programado, no una medición de la hora efectiva de reproducción: no se midió la latencia exacta. No se identificó el nombre del perfil de ahorro de Samsung ni se verificó entrada en Doze profundo. Quedan por ampliar las pruebas a varios días, otros perfiles de ahorro, tonos discretos, retirada de recientes y arranque sin abrir la app.


### Comprobación de Isha y alcance del ensayo de reinicio

El 19/10/2026 se leyeron por ADB las entregas del preaviso de Isha (20:33:31) y del Adhan (20:43:31), sin error, con el siguiente ciclo programado. El usuario confirmó escuchar ambos sin abrir la app. Sin embargo, el identificador de arranque seguía siendo el de la captura previa de las 20:01 y el tiempo de actividad había aumentado continuamente. Estas evidencias confirman las entregas, pero **no prueban reprogramación después de un nuevo reinicio**. Esa comprobación continúa pendiente: capturar estado, reiniciar, desbloquear una vez sin abrir la app y verificar el cambio de arranque y las alarmas recreadas antes de observar su entrega.


### Reprogramación automática tras un nuevo reinicio comprobado

Después de ese intento se realizó un nuevo reinicio del J7. ADB confirmó cambio del identificador de arranque y un tiempo de actividad de unos 79 segundos. El usuario desbloqueó el teléfono una vez y lo dejó en Inicio sin abrir la app. Inicialmente no había alarmas de la app en AlarmManager: `BOOT_COMPLETED` todavía estaba en la cola ordenada del sistema y `PrayerAlarmReceiver` figuraba pendiente. Al recibirlo, el receiver terminó y Android mostró automáticamente las dos alarmas, sin errores ni apertura manual de la app:

- Preaviso de Fajr: **20/10/2026 04:42:16**, hora de Buenos Aires.
- Adhan de Fajr: **20/10/2026 04:52:16**, hora de Buenos Aires.

**Resultado:** reprogramación después de reiniciar comprobada en el J7 SM-J710MN/Android 8.1, compilación 10018. La demora inicial correspondía a la entrega del broadcast de arranque, no a un fallo confirmado del scheduler. La entrega audible de estas alarmas recién recreadas queda pendiente del siguiente horario real; no confundir el registro en AlarmManager con haber escuchado ya ese ciclo. No se abrió la app ni se simularon broadcasts para obtener este resultado.

## Transición al release oficial v0.1.9

Los APK oficiales son builds release sin depuración, `versionCode` 1010900. Conservan `io.github.marcosrehtanz.adhancompanion.experimental`, el nombre y la firma persistente para actualizar sin reinstalar. No cambiar esta identidad para quitar la palabra experimental: provocaría una app y datos independientes.

La compilación 10018 consulta exclusivamente el canal descrito arriba. El release crea un puente con los mismos APK y un índice compatible en una prerelease de ese canal. El código nuevo admite además tags oficiales `vX.Y.Z`, prioriza esos releases y sigue eligiendo el mayor código compatible. La recitación de Parhizgar se mantiene exclusiva de escritorio hasta su integración nativa móvil. El ensayo del J7 con 10018 no certifica la instalación ni el comportamiento de 1010900; se requiere una comprobación posterior en el dispositivo.

### Comprobación de actualización al release oficial — 20/10/2026

En el J7 SM-J710MN/Android 8.1 se encontró instalada **v0.1.9, compilación 1010900, ARMv7**, al restablecer la conexión ADB. El usuario confirmó que actualizó mediante búsqueda, descarga e instalación desde la app y que conservó ubicación, sonidos/preavisos, registro de rezos, marcadores y punto de lectura del Qur’an.

Se extrajo una copia del APK instalado y se comprobó su SHA-256 contra el oficial publicado: `f9e19d5dbf531d1b393091be469afdced6201d687966398b7dbda08dd7809b45`. Coincide exactamente con el APK release cuya firma persistente, versión, arquitectura, ausencia de depuración y puente JNI se verificaron en la publicación.

**Límite de la comprobación de datos:** la actualización ya había terminado cuando se conectó el teléfono; no se creó un nuevo respaldo inmediatamente anterior a este salto. El APK release no permite `run-as`, por lo que no se compararon hashes de sus archivos privados después de actualizar. La conservación de datos de este ensayo está confirmada por la revisión del usuario en la interfaz, junto con la comprobación técnica del paquete instalado; no equivale a la comparación binaria realizada en el ensayo anterior 10017 → 10018. Los respaldos privados previos se conservan.

AlarmManager mantiene registrados el preaviso de Fajr del 20/10/2026 a las **04:42:16** y el Adhan a las **04:52:16**, hora local del teléfono. Esta observación confirma programación presente después de actualizar; no demuestra por sí sola una nueva reprogramación ni la entrega audible del ciclo. No se reinició, desinstaló ni borró datos del J7 durante esta comprobación.

## Presentación oficial y Google Maps — v0.1.10

El nombre visible pasa a **Adhan Companion**, sin «Experimental», tanto en el launcher como en la actividad. El menú identifica Android y Actualizaciones indica versiones oficiales. La nota de avisos explica cómo activarlos, sin rotular la plataforma como experimental. La identidad técnica `io.github.marcosrehtanz.adhancompanion.experimental`, los nombres de clases JNI, la firma persistente y la compatibilidad del canal anterior se conservan: no representan el nombre visible y cambiarlos rompería actualizaciones/datos.

El importador resuelve los enlaces cortos de Google Maps mediante red nativa y utiliza el pin preciso cuando Google redondea las coordenadas en la ruta. Ver [detalles de ubicación](ubicacion-google-maps.md). Compilación Android oficial: **1011000**. Los APK antiguos sin buscador integrado deben actualizarse manualmente con el APK de su arquitectura y firma, sin desinstalar. Si Android rechaza la instalación, revisar firma/versiones y preparar respaldo antes de cualquier migración; no recomendar borrar los datos como solución.
