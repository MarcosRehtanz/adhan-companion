# RDD de recitación en audio del Qur’an

**Tipo:** documento de investigación y diseño (Research and Design Document).
**Fecha:** 18 de octubre de 2026.
**Estado:** propuesta documentada; implementación pendiente.
**Versión de referencia:** v0.1.8, con lector de texto offline.
**Plataformas:** Linux y Windows.

La propuesta es incorporar la recitación de **Shahriar Parhizgar mediante Al Quran Cloud**, con reproducción por aleya, continuidad dentro de una sura y descarga opcional por sura. El audio acompañará al lector existente y funcionará desde el core Rust, incluso con la ventana cerrada. Los avisos sonoros de rezo tendrán prioridad.

Este RDD reúne la recomendación y su diseño inicial. La [investigación de proveedores](investigacion-audio-quran.md) conserva el detalle de las fuentes y las condiciones consultadas. La documentación no asigna una versión de entrega ni modifica la app.

## Objetivo y contexto

El [lector actual](lector-quran.md) contiene texto árabe Tanzil Uthmani, traducción española de Bórnez, marcadores y punto de lectura persistente. La ampliación permitirá escuchar el árabe mientras se sigue el texto, retomar una escucha y conservar suras para usarlas sin conexión.

Se mantienen las decisiones de producto: funcionamiento local primero, cálculo de horarios independiente de la red, control desde el tray y preferencias en modo lectura con edición explícita. El usuario confirmó que la app es sin fines de lucro.

## Selección de recitador y proveedor

### Propuesta principal

Usar **Shahriar Parhizgar**, edición por aleya `ar.parhizgar` del catálogo de Al Quran Cloud. La edición y sus archivos concretos se verificarán antes de integrar el reproductor.

Una [guía de memorización publicada en Al-Islam.org](https://al-islam.org/pursuing-excellence-guide-memorising-holy-quran-sl-al-hakim/part-2-how-memorise-holy-quran) recomienda Parhizgar, Al-Minshawi y Al-Husary para estudiar. Destaca las decisiones de Parhizgar al detener y comenzar la recitación, el ritmo y melodía de Al-Minshawi y el ritmo más lento de Al-Husary para atender a las reglas de recitación. Esta referencia editorial orienta la selección; no establece una elección oficial para todos los shias.

Al Quran Cloud ofrece acceso público sin clave. Sus [condiciones, sección IV](https://alquran.cloud/terms-and-conditions), describen permisos de redistribución gratuita no comercial de las grabaciones en las tasas publicadas y permiten reproducción, integración y descarga para uso personal y educativo. Los derechos permanecen con los recitadores o sus herederos y se contemplan solicitudes de retirada. La propuesta utiliza ese alcance no comercial y conservará la procedencia y condiciones de la edición elegida.

La reproducción por aleya facilita iniciar desde el texto visible y resaltar la aleya actual sin depender de tiempos por palabra. Como contrapartida, habrá que comprobar las transiciones y los posibles silencios entre archivos.

### Alternativas consideradas

| Opción | Ventajas | Límites y decisión propuesta |
| --- | --- | --- |
| Al Quran Cloud / Islamic Network | API sin clave, catálogo por aleya y condiciones no comerciales publicadas. | Primera opción. Verificar grabación, segmentación, basmalas y formato real. |
| EveryAyah | MP3 por aleya, paquetes ZIP y checksums; incluye Parhizgar, Husary y Minshawy. | Reserva técnica: no se localizó permiso explícito de redistribución en las páginas revisadas. |
| Quran Foundation / Quran.com | API de audio y herramientas de sincronización. | La vía SDK documentada requiere credenciales de servidor y tiene condiciones de almacenamiento específicas. Añade complejidad a una app local sin backend. |
| MP3Quran | API documentada y política que permite copiar materiales o usar enlaces. | Alternativa pendiente de comparación del recitador, edición y segmentación concretos. |

La [consulta de ediciones de audio](https://api.alquran.cloud/v1/edition?format=audio&language=ar) identificó `ar.parhizgar` y `ar.husary` por aleya y `ar.shahriarparhizgar` por sura. Algunos registros de Minshawi aparecen clasificados como `translation` pese a ser audio árabe; el campo de tipo no basta para seleccionar contenidos.

El [catálogo de EveryAyah](https://everyayah.com/recitations_ayat.html) etiqueta Parhizgar a 64 kbps, pero enlaza a una [carpeta denominada Parhizgar_48kbps](https://everyayah.com/data/Parhizgar_48kbps/). Esa carpeta anuncia un ZIP de 572 MB. Es información del servidor, no una medición propia ni una estimación del almacenamiento de la edición de Al Quran Cloud.

La documentación de [audio de Quran Foundation](https://api-docs.quran.com/docs/sdk/javascript/audio/), sus [términos](https://api-docs.quran.com/legal/developer-terms/) y su [FAQ](https://api-docs.quran.com/docs/tutorials/faq/) requieren distinguir acceso a URLs, conservación de archivos y redistribución. Los secretos de servidor no se incorporarán al frontend ni al binario distribuido. Para MP3Quran, las referencias son su [API](https://www.mp3quran.net/eng/api/2) y su [política del proveedor](https://apiquran.mp3quran.net/sw/privacy).

## Alcance funcional

### Primera etapa de reproducción

- Un recitador inicial: Parhizgar.
- Acción **Escuchar desde aquí** en una aleya y reproducción continua hasta el final de la sura.
- Controles de reproducir, pausar, detener, aleya anterior y siguiente.
- Identificación visible de recitador, sura y aleya en reproducción, con resaltado de la aleya actual.
- Reproducción con conexión iniciada por el usuario, utilizando primero un archivo local válido cuando exista.
- Conservación del último punto escuchado, separado del punto de lectura.
- Reproducción con la ventana cerrada y acción para detenerla desde el tray.
- Pausa de la recitación cuando comienza un Adhan o tono de rezo, con reanudación manual.

### Segunda etapa de descargas

- Descarga explícita por sura como conjunto de archivos por aleya.
- Progreso, tamaño disponible o estimación identificada como tal, cancelación y eliminación.
- Estado visible por sura: sin descargar, descargando, incompleta o disponible sin conexión.
- Uso offline de las suras completas y verificadas.
- Gestión del almacenamiento desde el lector, conservando los archivos al actualizar la app.

El instalador no incluirá toda la colección de recitaciones. Las descargas de suras requerirán una acción del usuario. Cualquier precarga temporal para enlazar aleyas deberá ser acotada y distinguirse de una descarga permanente.

### Ampliaciones futuras

- Otros recitadores, empezando por evaluar Al-Husary y Al-Minshawi.
- Repetición para estudio, listas y continuidad entre suras.
- Sincronización palabra por palabra mediante tiempos de la grabación exacta.
- Lectura hablada de la traducción española, con fuente y permisos propios.

La voz sintética para reconstruir recitación queda fuera del alcance. Se conservarán los textos existentes y sus condiciones independientes.

## Experiencia de uso

El reproductor vivirá en la sección **Qur’an**, junto al lector. Escuchar una aleya será una acción directa. Los controles de reproducción estarán disponibles mientras haya una sesión activa.

Las preferencias, como el recitador cuando existan alternativas, mostrarán primero su valor vigente. **Editar** abrirá los controles y ofrecerá **Guardar** y **Cancelar**, siguiendo la regla general de la app. Las descargas tendrán acciones propias para descargar, cancelar y eliminar.

El resaltado seguirá la recitación sin cambiar el punto de lectura guardado manualmente. Al abrir nuevamente la ventana, el lector consultará el estado real del core. Una acción explícita permitirá volver a la aleya que está sonando.

Al reiniciar la app se ofrecerá **Retomar escucha**, sin reproducir automáticamente. La primera versión retomará desde el comienzo de la última aleya escuchada; la precisión dentro de una aleya podrá ampliarse después.

### Convivencia con avisos de rezo

| Evento | Comportamiento propuesto |
| --- | --- |
| Comienza Adhan o tono de rezo | Pausar recitación antes de reproducir el aviso y conservar la aleya. |
| Termina o se silencia el aviso | Mantener la recitación pausada hasta que el usuario la reanude. |
| Se intenta iniciar recitación durante el aviso | Informar que hay un aviso activo y mantener la recitación detenida. |
| Aviso configurado como solo notificación | Mantener la recitación; un eventual sonido del sistema depende de la configuración del sistema operativo. |
| Preaviso solo mediante notificación | Mantener la recitación. |
| Cierre de ventana | Continuar desde el core. |
| Salida de la app | Detener y conservar el punto de escucha. |

Escuchar, pausar o detener recitación no modificará el registro de rezos. Las pruebas manuales de Adhan o tono deberán pasar por la misma coordinación de audio para evitar superposiciones.

## Diseño técnico propuesto

### Responsabilidades

| Componente | Responsabilidad |
| --- | --- |
| Core Rust | Reproducción, cola por aleya, coordinación con avisos, descarga, validación de archivos y persistencia. |
| Frontend React | Controles, resaltado, estado de descarga, preferencias y presentación de errores. |
| Adaptador del proveedor | Resolver identificadores y URLs de una edición permitida, sin acoplar el lector a la respuesta externa. |
| Almacenamiento local | Audio descargado, manifiesto de procedencia y estado de escucha. |

Los comandos Tauri expondrán acciones acotadas para consultar estado, reproducir una posición, pausar, detener, navegar y gestionar descargas. Sus permisos se declararán explícitamente. El frontend recibirá cambios del core y podrá reconstruir la sesión mediante una consulta al volver a abrirse.

El core actual utiliza rodio 0.23 con reproducción y WAV. Será necesario habilitar y comprobar el decodificador MP3 apropiado para los archivos elegidos. Se conservará el formato comprimido de origen, evitando convertir toda la biblioteca a WAV.

La coordinación de audio debe dar prioridad a los avisos sin bloquear el scheduler por operaciones de red, descarga o decodificación. Un error del reproductor del Qur’an debe permitir que los avisos de rezo sigan funcionando.

### Identidad y persistencia

La identidad de cada archivo incluirá proveedor, edición, sura y aleya. Cambiar de recitador no reutilizará por error el audio de otra edición.

| Datos | Contenido previsto |
| --- | --- |
| Edición | Proveedor, identificador, recitador, origen y condiciones aplicables. |
| Archivo local | Sura, aleya, formato, tamaño real, hash y estado de validación. |
| Punto de escucha | Edición y última sura/aleya escuchada. |
| Descarga de sura | Archivos esperados, archivos disponibles y estado de completitud. |

El estado de audio será independiente de `quran-reader.json`, de los marcadores y del registro de rezos. Las rutas y el esquema definitivo se fijarán al implementar, usando los directorios de datos de cada plataforma y escrituras atómicas. Un archivo de estado inválido no se sobrescribirá silenciosamente.

Un hash calculado localmente permitirá detectar cambios posteriores del archivo. Solo podrá contrastar el origen si se dispone de un valor de referencia confiable; por sí solo no acredita autenticidad.

### Descarga y errores

- Descargar en temporales, con límites de tamaño, tiempo y redirecciones, y validar antes de publicar el archivo local.
- Resolver rutas desde identificadores validados; no aceptar rutas arbitrarias ni extraer paquetes sin controles de rutas y tamaño.
- Mostrar un error recuperable ante falta de red, espacio insuficiente, formato inválido o recurso retirado.
- Cancelar sin presentar archivos parciales como disponibles. Conservar los archivos completos ya verificados cuando resulte seguro.
- No saltar silenciosamente una aleya con error ni sustituir el recitador. Ofrecer reintentar o detener.
- Eliminar audio sin borrar marcadores ni punto de lectura. Si una grabación desaparece del proveedor, deshabilitar su descarga y revisar las condiciones aplicables a las copias existentes.

Los límites concretos de almacenamiento y precarga quedan pendientes de medir muestras reales y deberán estar definidos antes de implementar las descargas permanentes.

## Contenido y atribución

La licencia del texto de Tanzil y la de la traducción no conceden permisos sobre grabaciones. La inclusión de Parhizgar en el [catálogo de Al-Islam.org](https://al-islam.org/ar/taxonomy/term/651) tampoco constituye por sí sola una autorización para redistribuir sus archivos.

La sección de fuentes del lector mostrará recitador, proveedor y condiciones aplicables. El manifiesto registrará la edición concreta, URLs de procedencia, tasa publicada, fecha de consulta y referencia de los términos. El código MIT y los contenidos conservarán sus condiciones separadas.

Antes de fijar una edición se comprobarán la correspondencia de aleyas con el corpus del lector, los comienzos y finales, las basmalas y las transiciones. Se prestará atención al inicio de Al-Fatiha, al de At-Tawba y a la reproducción desde una aleya intermedia. El comportamiento se basará en la grabación verificada; no se añadirán fragmentos sintetizados ni se duplicará audio para completar supuestos huecos.

## Plan de entrega

1. **Validar la edición:** escuchar muestras de Parhizgar, comprobar URLs, formato, segmentación, tasa, tamaño y condiciones; registrar la procedencia.
2. **Integrar reproducción por aleya:** core, permisos Tauri, controles del lector, resaltado, prioridad de avisos y punto de escucha persistente.
3. **Incorporar descargas por sura:** almacenamiento, progreso, cancelación, eliminación y uso offline.
4. **Revisar Linux y Windows:** reproducción nativa, convivencia con el tray, reinicios, errores de red y conservación de datos al actualizar.
5. **Publicar:** actualizar documentación, créditos y notas de la versión que corresponda.

Cada etapa deberá conservar el lector offline y los datos actuales del usuario.

## Criterios de aceptación para la implementación

- La aleya reproducida corresponde al texto resaltado y a la edición seleccionada.
- Anterior, siguiente, pausa y parada mantienen un estado coherente entre ventana y core.
- La secuencia llega al final de la sura sin omitir ni repetir aleyas por errores de cola; allí se detiene.
- Una sura completamente descargada se reproduce sin conexión y se conserva al reiniciar.
- Una descarga cancelada o fallida no aparece como completa; eliminarla no afecta al lector ni a otras suras.
- Cerrar y reabrir la ventana conserva la reproducción; detener desde el tray funciona con la ventana oculta.
- Un reinicio completo conserva el punto de escucha y requiere una acción para reanudar.
- Adhan y tonos no se superponen con la recitación y esta no se reanuda por sí sola después del aviso.
- El progreso de lectura, los marcadores y los registros de rezos se conservan sin cambios causados por la escucha.
- Los fallos de red o de audio presentan acciones recuperables y no impiden los avisos de rezo.
- Créditos y condiciones de la edición están visibles y registrados con los recursos.
- Los flujos se revisan en la app nativa tanto en Linux como en Windows antes de publicar.

Estos criterios definen la validación futura; no representan pruebas de una función ya implementada.

## Cuestiones pendientes

- Escuchar y confirmar la grabación exacta de Parhizgar antes de fijarla como edición inicial.
- Medir pausas entre aleyas y decidir la precarga temporal necesaria para una continuidad aceptable.
- Definir límites de almacenamiento, simultaneidad de descargas y tratamiento de descargas incompletas al reiniciar.
- Concretar volumen de recitación, esquema persistente, rutas y contratos IPC durante el diseño de implementación.
- Revisar una narración española únicamente si se solicita, con sus propios contenidos y permisos.

## Documentación relacionada

- [Investigación de audio y proveedores](investigacion-audio-quran.md).
- [Lector del Qur’an](lector-quran.md).
- [Revisión nativa y persistencia del lector](revision-lector-quran.md).
- [Avisos por rezo](avisos-por-rezo.md).
- [Roadmap](roadmap.md).
