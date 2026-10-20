# Recitación del Qur’an

Implementación incorporada al release v0.1.9, desarrollada desde el 19/10/2026. Disponible en el lector de Linux y Windows. Desde v0.1.11 también en Android, con un reproductor nativo comprobado en el J7 (ver [Android](#android)).

## Uso

En **Qur’an**, una barra compacta al pie del lector mantiene visibles la sura, la aleya, Parhizgar y los controles al desplazarse. **Opciones** despliega encima el volumen, la última escucha, las descargas y las fuentes. El panel se cierra con su botón o Escape; cerrar descarta una edición de volumen no guardada.

Controles:

- **Escuchar desde aquí** en una aleya inicia su recitación y continúa hasta el final de esa sura. Allí se detiene.
- **Pausar**, **Reanudar**, **Anterior**, **Siguiente** y **Detener** controlan el reproductor del core. Cerrar la ventana mantiene la reproducción; salir de la app la detiene.
- **Pulsar la sura/aleya de la barra** encuadra el pasaje sin guardar otro punto de lectura. La aleya de la sesión se resalta cuando está visible; no se cambia de página automáticamente.
- **Seguimiento:** desde el 20/10/2026, la vista acompaña con un desplazamiento suave a la aleya que suena, dentro de la sura en pantalla. Desplazarse a mano, tocar otra aleya o navegar lo suspende. **Seguir la recitación** o cualquier acción de escucha lo retoma. Detalle en el [lector](lector-quran.md#lectura-y-navegación).
- **Opciones → Retomar escucha** comienza desde el principio de la última aleya cargada para escuchar. No se reproduce automáticamente al iniciar la app.
- **Opciones → Volumen → Editar** abre la edición con Guardar y Cancelar. El volumen es propio de la recitación y se combina con el volumen del sistema.
- El tray permite **Detener recitación del Qur’an** con la ventana oculta.

La escucha no modifica marcadores, punto de lectura ni registros de rezos. Los archivos pueden incluir pausas; esta primera implementación carga una aleya a la vez, sin precarga ni promesa de reproducción sin separación entre archivos.

## Convivencia con Adhan y tonos

El mismo coordinador de audio interviene en avisos automáticos y pruebas manuales. Antes de iniciar un Adhan o tono, pausa la recitación. Al terminar el aviso, la recitación sigue pausada hasta una acción del usuario. Iniciar o reanudar recitación mientras hay un aviso sonoro activo muestra un error.

Los preavisos y los avisos configurados como solo notificación no pausan la recitación. El scheduler no espera a la red ni a la descarga del audio del Qur’an.

## Descargas y almacenamiento

La interfaz aplica la [lógica de estados acordada](estados-interfaz.md): una sura completa muestra «Disponible sin conexión» y «Eliminar audio», sin botón Descargar. Las parciales permiten completar; las operaciones activas muestran progreso/cancelación; la eliminación confirmada vuelve al estado sin descargar. La disponibilidad se reconstruye desde los archivos al abrir el lector.

**Descargar sura** conserva un MP3 por aleya, con progreso por archivos completos y tamaño real. Una sola descarga de sura puede estar activa; se realiza en un hilo distinto del reproductor. Cancelar conserva las aleyas ya verificadas, y **Completar descarga** vuelve a comprobarlas antes de continuar. Tras reiniciar, la disponibilidad se reconstruye desde los archivos y sus manifiestos; una descarga parcial sigue siendo incompleta.

**Eliminar audio de esta sura** elimina sus MP3 y manifiestos, sin tocar los datos del lector. Durante una descarga se debe cancelar y esperar a que termine antes de eliminar archivos. Si la sura está sonando, la aleya actual permanece en memoria y las siguientes pueden necesitar conexión después de eliminar el audio.

Límites de esta implementación: 12 MiB por aleya, 300 MiB por sura y 1 GiB de biblioteca local, con descargas secuenciales moderadas. Cada transferencia tiene límites de conexión y duración; no admite URLs arbitrarias ni sigue redirecciones. Usa HTTPS del CDN documentado y `curl` del sistema (también utilizado por el actualizador de escritorio).

Los archivos temporales se eliminan al terminar o cancelar; los de un proceso interrumpido se limpian al inicializar el reproductor. El instalador no contiene MP3 del Qur’an. Escuchar con conexión conserva solo la aleya actual en memoria y utiliza antes un archivo local cuando existe.

Rutas relativas al directorio de configuración de cada plataforma:

| Ruta | Contenido |
| --- | --- |
| `quran-audio.json` | Edición, última sura/aleya escuchada y volumen. |
| `quran-audio/ar.parhizgar/sura-N/A.mp3` | Grabación original de una aleya descargada explícitamente. |
| `quran-audio/ar.parhizgar/sura-N/A.json` | Procedencia, identidad, tamaño y SHA-256 local del archivo. |
| `quran-audio/ar.parhizgar/provenance.json` | Proveedor, edición y condiciones consultadas. |

Las escrituras se publican mediante temporales y reemplazo. Un estado de escucha ilegible se conserva y bloquea la función con un error; no se sustituye silenciosamente por valores por defecto. Un archivo descargado inconsistente no se salta ni sustituye silenciosamente: se informa el error para eliminar y volver a descargar la sura. El tamaño se consulta para el estado de almacenamiento y el SHA-256 se vuelve a comprobar antes de usar un archivo. Ese hash detecta cambios posteriores, no autentica por sí solo la grabación del proveedor.

## Procedencia y condiciones

Recitador inicial: **Shahriar Parhizgar**, edición `ar.parhizgar` por aleya, obtenida de **Al Quran Cloud / Islamic Network** mediante el [patrón documentado del CDN](https://alquran.cloud/cdn). La API de la [aleya 1 de esa edición](https://api.alquran.cloud/v1/ayah/1/ar.parhizgar) identifica Parhizgar y devuelve el endpoint de calidad publicada 48 kbps. La tabla ilustrativa de la página del CDN tiene una etiqueta contradictoria para este identificador; se tomó como referencia la edición de la API, no esa fila ilustrativa.

Las [condiciones del proveedor](https://alquran.cloud/terms-and-conditions), consultadas el 19/10/2026 y con fecha de actualización 14/06/2026, describen redistribución gratuita no comercial a las tasas publicadas y reproducción, integración y descarga personal o educativa. Los derechos permanecen con los recitadores o sus herederos y pueden existir solicitudes de retirada. Estas condiciones son independientes de MIT y de las licencias del texto y la traducción.

`public/quran/audio-provenance.json` conserva las referencias y las mediciones de muestras. La consulta comprobó los identificadores de 1:1, 2:1, 9:1 y 112:2 contra los metadatos locales y sus respuestas API. Las muestras son MP3; se midieron 22.050 Hz estéreo en las tres primeras y 11.025 Hz mono en 112:2, con tasa variable respecto de la calidad publicada. Se conservan los originales sin conversión, agregados de basmala ni reconstrucción de voz.

## Estado de comprobación

- Compilación de TypeScript/Vite y `cargo check` de escritorio Linux completados con soporte MP3.
- Identificadores, URLs y formato de las cuatro muestras comprobados técnicamente; no equivale a una revisión auditiva o religiosa de su contenido.
- Pendientes: escucha de las muestras y sus basmalas, transiciones, revisión funcional en la app nativa de Linux y Windows, cierre/reapertura, reinicio, descargas offline, cancelaciones y convivencia audible con Adhan y tonos.
- Los instaladores de v0.1.9 incluyen recitación en escritorio; el APK de v0.1.9 mantiene solo el lector escrito. La integración de Android se describe abajo.

## Android

Desarrollada el 20/10/2026, con las mismas pantallas y el mismo contrato (`quran_audio_status` y `quran_audio_control`). El core en Rust conserva lo común: descargas, límites, manifiestos con SHA-256 y el punto de escucha. No usa rodio en Android.

- **Reproducción:** `QuranPlayer.kt` reproduce aleya por aleya con `MediaPlayer` hasta el final de la sura. Lo sostiene `QuranAudioService`, un servicio en primer plano de tipo `mediaPlayback`. Para cada aleya, Rust indica por JNI (`QuranNative.resolve`) el archivo descargado y verificado o, si no está descargada, la URL del proveedor, que se escucha sin guardarse. Al empezar cada aleya, `QuranNative.listened` guarda la última escuchada.
- **Notificación obligatoria:** por decisión del usuario, escuchar requiere tener permitidas las notificaciones de la app. Sin ese permiso, el reproductor muestra el aviso y el botón **Permitir notificaciones**. La notificación, silenciosa y de canal propio, muestra la aleya y tiene **Pausar/Reanudar** y **Detener**.
- **Segundo plano:** sigue con la pantalla apagada. Durante la carga y la reproducción mantiene la CPU y el Wi-Fi activos entre aleyas. Por decisión del usuario, quitar la app de recientes no la detiene; se detiene desde la notificación.
- **Convivencia:** un Adhan o tono, incluida la prueba de sonido, pausa la recitación y la marca como pausada por aviso. No se reanuda sola. Mientras suena un aviso no se puede iniciar ni reanudar. Una llamada u otra app con audio la pausan; un sonido breve solo baja el volumen.
- **Descargas:** **Descargar sura** usa `QuranFetch.kt`, con las mismas reglas que escritorio. Solo admite HTTPS al host del proveedor, sin redirecciones. Las conexiones tienen 10 s y 45 s de límite y cada archivo, 12 MiB. Rust comprueba que el resultado sea un MP3, calcula el SHA-256 y lo guarda con su manifiesto. En esta primera versión, por decisión del usuario, la descarga de una sura requiere tener la app abierta.

### Comprobación en el J7 — 20/10/2026

El código Rust exclusivo de Android se verificó con `cargo check` en un crate aislado; el Kotlin, en la CI del PR #3, que compiló y firmó los APK ARMv7 y ARM64. El APK ARMv7 1011100, con el mismo certificado que v0.1.10, se distribuyó en una prerelease de prueba sin índice de actualización y se instaló como actualización en el J7 SM-J710MN/Android 8.1.

El usuario confirmó:
- El lector, Escuchar, el seguimiento con desplazamiento y la notificación con Pausar/Detener.
- Que sigue sonando con la pantalla apagada y al quitar la app de recientes, y que se detiene desde la notificación.
- Que **Probar** el Adhan durante la recitación la pausa y no se reanuda sola.
- La descarga de una sura y su escucha en modo avión.

Sin comprobar: llamada entrante, cancelar o eliminar descargas, y otros dispositivos o versiones de Android.

El [RDD](rdd-recitacion-quran.md) mantiene las decisiones y los criterios de aceptación pendientes; la [investigación de proveedores](investigacion-audio-quran.md) conserva las alternativas.

La [revisión funcional de estados en Linux](revision-estados-escritorio.md) comprobó controles, descargas, errores/reintentos, reinicio y prioridad de avisos, con confirmación audible del usuario. Windows sigue pendiente de revisión física.
