# Opciones de recitación del Qur'an

Investigación iniciada el 18 de octubre de 2026. El usuario pidió priorizar la actualización del repositorio y el release antes de implementar audio. No se incorporaron grabaciones ni reproducción al lector.

La recomendación y el diseño inicial están documentados en el [RDD de recitación en audio del Qur’an](rdd-recitacion-quran.md): Parhizgar mediante Al Quran Cloud, reproducción por aleya y descargas opcionales por sura. La edición concreta sigue pendiente de validación.

## Recitadores candidatos

Una [guía de memorización publicada en Al-Islam.org](https://al-islam.org/pursuing-excellence-guide-memorising-holy-quran-sl-al-hakim/part-2-how-memorise-holy-quran) propone Al-Minshawi, Parhizgar y Al-Husary para estudiar la recitación y describe diferencias de ritmo y pausas. Es una referencia editorial, no una declaración de aceptación universal por todas las autoridades chiíes.

[Al-Islam.org también incluye a Shahriar Parhizgar en su catálogo](https://al-islam.org/ar/taxonomy/term/651), con treinta grabaciones por juz. Su publicación allí no acredita por sí sola permiso para redistribuir esos archivos.

**Recomendación documentada:** comenzar con Parhizgar y evaluar Al-Husary/Al-Minshawi como alternativas posteriores. Escuchar muestras antes de fijar la grabación; no usar voz sintética para reconstruir la recitación.

## Fuentes y condiciones

| Fuente | Evidencia consultada | Consecuencia para la propuesta |
| --- | --- | --- |
| Al Quran Cloud / Islamic Network | Catálogo público con `ar.parhizgar` y `ar.husary` por aleya; también aparecen versiones de Minshawi y Parhizgar por sura. | Primera vía a evaluar por su acceso sin clave y condiciones publicadas. Comprobar cada edición concreta y la correspondencia de aleyas. |
| EveryAyah | Archivos MP3 por aleya, paquetes ZIP y checksums. Incluye Parhizgar, Husary y Minshawy. | Técnicamente adecuado, pero no se localizó un permiso explícito en las páginas revisadas. Disponibilidad de descarga no se interpreta como dominio público. |
| Quran Foundation / Quran.com | API de audio, recitadores y sincronización, con credenciales de servidor y condiciones específicas. | Mayor complejidad para una app local sin backend. No asumir descarga offline permanente ni empaquetado autorizado. |
| MP3Quran | API documentada y una política del proveedor que permite copiar material o utilizar enlaces. | Alternativa a evaluar tras elegir recitador, edición y segmentación; no se completó la comparación de su catálogo. |

### Al Quran Cloud

La [consulta oficial de ediciones de audio en árabe](https://api.alquran.cloud/v1/edition?format=audio&language=ar) confirmó los identificadores anteriores. Algunos registros de Minshawi llevan una clasificación `translation` pese a estar en árabe y formato audio: no clasificar ni mapear archivos basándose solo en ese campo.

Sus [condiciones publicadas, sección IV](https://alquran.cloud/terms-and-conditions) describen licencias de los recitadores o sus herederos para redistribución gratuita no comercial en las tasas ofrecidas y permiten escuchar, integrar y descargar para uso personal y educativo. Mantienen los derechos de los recitadores y contemplan solicitudes de retirada. La app sin fines de lucro encaja con la vía no comercial descrita; antes de implementar deben registrarse la edición exacta, condiciones y procedencia de sus archivos. No se obtiene la licencia de audio a partir de la licencia de Tanzil.

### EveryAyah y el tamaño

El [catálogo](https://everyayah.com/recitations_ayat.html) etiqueta Parhizgar a 64 kbps, pero su enlace lleva a [Parhizgar_48kbps](https://everyayah.com/data/Parhizgar_48kbps/). El listado de esa carpeta anuncia un ZIP completo de **572 MB**. Es una cifra del sitio, no una descarga ni medición nuestra; debe verificarse la tasa real y la integridad antes de usarlo. La diferencia de nombres es otra razón para identificar una grabación por su procedencia y hash, no únicamente por el recitador.

### Quran Foundation

La [documentación de audio](https://api-docs.quran.com/docs/sdk/javascript/audio/) exige credenciales de backend para la vía SDK documentada; no deben incluirse secretos estáticos dentro del frontend ni de un binario de escritorio distribuido.

Los [términos de desarrolladores](https://api-docs.quran.com/legal/developer-terms/) distinguen reproducción en la app, almacenamiento y redistribución. No autorizan asumir que una API pública permita empaquetar todo su contenido. La [FAQ](https://api-docs.quran.com/docs/tutorials/faq/) aclara que los registros sincronizados de recitación contienen URLs, no los archivos de las grabaciones. Hace falta resolver el permiso concreto de conservación del audio antes de optar por esa vía.

### MP3Quran

Se consultaron la [API para desarrolladores](https://www.mp3quran.net/eng/api/2) y la [política del proveedor con su apartado Copyrights](https://apiquran.mp3quran.net/sw/privacy). Ese apartado permite a visitantes o desarrolladores copiar materiales o usar enlaces. Debe conservarse la evidencia aplicable al recurso elegido; la licencia del código de una API no sustituye las condiciones de las grabaciones.

## Propuesta de integración para retomar

1. Reproducir una aleya y continuar secuencialmente, resaltando la aleya actual. La sincronización palabra por palabra queda para otra etapa y necesita tiempos de esa grabación exacta.
2. Ofrecer descarga explícita por sura, con progreso, tamaño, cancelación y eliminación. Evitar aumentar el instalador con el Qur'an completo en audio.
3. Preferir archivos ya descargados y permitir escuchar con conexión cuando la fuente lo autorice. No iniciar audio ni descargas automáticamente.
4. Mantener en el core reproducción, pausa, parada y estado para que funcionen con la ventana cerrada. Ofrecer detener desde el tray.
5. Dar prioridad al aviso de rezo: pausar la recitación al llegar el adhan o tono y evitar sonidos superpuestos. El RDD propone reanudación manual para la primera versión.
6. Separar progreso de escucha, punto de lectura y registro de rezos. Escuchar no marca una oración como realizada ni sobrescribe silenciosamente la lectura manual.
7. Guardar por edición/recitador y sura/aleya; validar secuencia, basmalas, silencios y límites contra el corpus que muestra el lector.
8. Descargar a temporales y verificar tamaño/integridad antes de habilitar un archivo. Mantener fuente, condiciones, versión y hashes locales. No usar ZIP de terceros sin control de rutas y límites.

El core actual usa rodio 0.23 con funciones WAV/playback. Para MP3 hace falta habilitar y comprobar el decodificador adecuado o elegir otra integración; no convertir toda la colección a WAV por defecto. También habrá que revisar permisos Tauri y almacenamiento de datos en ambas plataformas.

## Pendientes de la investigación

- Escuchar y comparar grabaciones concretas; comprobar basmalas y los puntos de inicio/fin por aleya.
- Confirmar respuesta HTTP, formato, tasa, duración y tamaño de muestras; no se ha medido ni descargado un corpus de audio.
- Revisar cómo resolver inicio de una sura frente a reproducción de una aleya intermedia.
- Elegir proveedor y recitador, conservar sus términos y definir límites del almacenamiento offline.
- Investigar por separado una lectura hablada en español si el usuario la solicita: recitar el árabe y narrar una traducción son contenidos diferentes.

La investigación no modifica la app y no envió comunicaciones a terceros. El lector publicado en v0.1.8 es de texto; la recitación en audio continúa pendiente, sin versión de entrega asignada.
