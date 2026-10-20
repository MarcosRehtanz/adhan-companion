# Lector del Qur'an

Incluido en v0.1.8, con revisión nativa en Linux completada el 18 de octubre de 2026; pendiente de revisión en Windows. El usuario autorizó avanzar con Tanzil y Bórnez para esta app sin fines de lucro.

## Lectura y navegación

La sección **Qur’an** abre los textos instalados sin conexión:

- Árabe Tanzil Uthmani 1.1, transmisión Hafs.
- Español de Raúl González Bórnez, archivo digital `es.bornez` publicado por Tanzil, con actualización indicada 15/07/2014.
- 114 suras y 6.236 aleyas por idioma. La navegación usa los identificadores originales.

Se elige sura y aleya o se avanza por grupos de ocho aleyas. La navegación guarda el punto seleccionado. **Continuar desde aquí** fija una aleya concreta como punto de lectura; **Retomar** vuelve al último punto guardado. Abrir por primera vez no crea automáticamente un historial. El desplazamiento con la rueda no cambia por sí solo el punto guardado.

**Marcar** agrega o quita una aleya. **Mis marcadores** permite volver a ella o quitarla. No se registra ni se modifica ningún rezo al leer o guardar marcadores.

**Editar lectura** habilita el tamaño del árabe (22–48 px), el español (12–24 px) y la visibilidad de la traducción. La vista previa se aplica a los textos; **Guardar preferencias** persiste y **Cancelar** descarta esa edición. Estas preferencias pertenecen al lector y se guardan por separado de la configuración general. Al salir de la sección se descarta una edición de lectura no guardada.

## Datos locales

`quran-reader.json`, junto al archivo de configuración de la app, contiene el punto de lectura, hasta 1000 marcadores y las preferencias. El core valida sura/aleya y rangos, serializa las escrituras y reemplaza el archivo mediante un temporal. Las mutaciones parten del estado actual en disco, para no perder marcadores al actualizar otra preferencia.

Si el estado no se puede leer o está dañado, se muestra un error con Reintentar y se conserva el archivo; no se sobrescribe con valores predeterminados. Un error de guardado se muestra en el lector. Los permisos de Tauri autorizan expresamente `get_quran_reader` y `update_quran_reader` para la ventana principal.

## Corpus y distribución

Los originales están en `public/quran/`; se copian al frontend de producción con Vite. No se requiere una API ni conexión para leerlos. La atribución, las condiciones de uso y la licencia tipográfica también están disponibles sin conexión en **Fuentes, versiones y condiciones de uso**.

El texto árabe conserva su aviso original completo, reproducido además en `ARABIC-LICENSE.txt`. La traducción conserva el pie original y sus términos no comerciales en `TRANSLATION-TERMS.txt`. La fuente Amiri Quran 1.003 incluye su SIL OFL 1.1. Estas condiciones son independientes de MIT, que cubre el código propio.

La edición impresa de origen de `es.bornez` no está identificada y no se promete el aparato completo de notas de una publicación impresa. Se presenta explícitamente como el archivo digital de Tanzil. Las condiciones no comerciales siguen aplicándose a las redistribuciones de ese archivo. Ver [investigación de fuentes y permisos](investigacion-fuentes-quran.md).

Los originales no se normalizan, recortan, corrigen ni reconstruyen con IA. La vista conserva la basmala tal como llega en las líneas del corpus, sin agregar una segunda apertura. Árabe y español se renderizan como texto, respectivamente RTL y LTR, sin ejecutar HTML del corpus.

Los nombres y recuentos derivan del XML original de Tanzil, versión 1.0, cuyo aviso identifica `(C) 2008-2009 Tanzil.info` y `license="cc-by"`. El XML y las atribuciones se conservan. No se utilizan sus categorías de sajdah para emitir indicaciones rituales.

## Preparación y actualización

`python3 scripts/prepare-quran.py` prepara los metadatos de nombres/recuentos para Rust y frontend, reproduce el aviso árabe y genera el manifiesto SHA-256. Verifica la estructura y la secuencia completa de identificadores en ambos originales antes de preparar los datos; no altera las aleyas ni descarga recursos. El cargador de la app también rechaza archivos incompletos, líneas inválidas o identificadores fuera de orden.

`public/quran/manifest.json` registra fuentes, versiones, fecha de descarga, tamaños y hashes. Al incorporar una actualización deben revisarse otra vez sus condiciones y actualizarse los datos de procedencia del script. No hay actualización automática del corpus en esta versión. Los marcadores se conservan por sura/aleya.

Los recursos del manifiesto suman **2.513.410 bytes**, aproximadamente 2,4 MiB, antes de la compresión del instalador y sin contar el propio manifiesto ni la documentación.

## Comprobaciones y pendientes

La importación comprobó los 6.236 identificadores ordenados de cada idioma contra las 114 suras del XML original, sin faltantes, duplicados ni texto vacío. Compilación TypeScript/Vite y Rust completada; los recursos están incluidos en `dist/quran/`.

La [revisión nativa en Linux del 18 de octubre de 2026](revision-lector-quran.md) comprobó muestras árabe/español, temas claro/oscuro, tamaños, navegación y persistencia de marcadores, eliminación y punto de lectura en dos reinicios reales. Se corrigió el encuadre de la aleya tras cargar la fuente o guardar tamaños.

Pendientes: revisión nativa en Windows, ampliación del muestreo de signos y recuperación de errores de almacenamiento. La concordancia estructural y visual no sustituye una revisión textual o religiosa.

La [recitación de Parhizgar en escritorio](recitacion-quran.md) está implementada en desarrollo local, pendiente de revisión nativa y publicación. No forma parte de la release v0.1.8 ya publicada. Búsqueda avanzada y notas externas siguen fuera del alcance actual.
