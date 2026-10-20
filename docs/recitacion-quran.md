# Recitación del Qur’an en escritorio

Implementación incorporada al release v0.1.9, desarrollada desde el 19/10/2026. Disponible en el lector de Linux y Windows. Android conserva el lector escrito: necesita una integración nativa de reproducción antes de habilitar estos controles.

## Uso

En **Qur’an**, una barra compacta al pie del lector mantiene visibles la sura, la aleya, Parhizgar y los controles al desplazarse. **Opciones** despliega encima el volumen, la última escucha, las descargas y las fuentes. El panel se cierra con su botón o Escape; cerrar descarta una edición de volumen no guardada.

Controles:

- **Escuchar desde aquí** en una aleya inicia su recitación y continúa hasta el final de esa sura. Allí se detiene.
- **Pausar**, **Reanudar**, **Anterior**, **Siguiente** y **Detener** controlan el reproductor del core. Cerrar la ventana mantiene la reproducción; salir de la app la detiene.
- **Pulsar la sura/aleya de la barra** encuadra el pasaje sin guardar otro punto de lectura. La aleya de la sesión se resalta cuando está visible; no se cambia de página automáticamente.
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
- Los instaladores de v0.1.9 incluyen recitación en escritorio; el APK mantiene solo el lector escrito. La migración de audio a Android requiere MediaPlayer/servicio nativo, coordinación con las alarmas y controles del sistema.

El [RDD](rdd-recitacion-quran.md) mantiene las decisiones y los criterios de aceptación pendientes; la [investigación de proveedores](investigacion-audio-quran.md) conserva las alternativas.

La [revisión funcional de estados en Linux](revision-estados-escritorio.md) comprobó controles, descargas, errores/reintentos, reinicio y prioridad de avisos, con confirmación audible del usuario. Windows sigue pendiente de revisión física.
