# Lector del Qur'an

Incluido en v0.1.8, con revisión nativa en Linux completada el 18 de octubre de 2026; pendiente de revisión en Windows. El usuario autorizó avanzar con Tanzil y Bórnez para esta app sin fines de lucro.

## Lectura y navegación

La sección **Qur’an** abre los textos instalados sin conexión:

- Árabe Tanzil Uthmani 1.1, transmisión Hafs.
- Español de Raúl González Bórnez, archivo digital `es.bornez` publicado por Tanzil, con actualización indicada 15/07/2014.
- 114 suras y 6.236 aleyas por idioma. La navegación usa los identificadores originales.

La sura se lee completa, de corrido. En la página del Qur’an, la barra superior de la app muestra la barra del lector: ‹ › para la sura anterior o siguiente, el nombre de la sura (abre el índice), la aleya a la vista («Aleya X de N»), **Retomar** cuando el punto guardado es otro, y los accesos a **Marcadores**, preferencias (**Aa**) y modo enfoque. El índice filtra por número o nombre y acepta `sura:aleya` (por ejemplo, `2:255`) para ir directo.

Navegar (‹ ›, índice, **Continuar con** la siguiente sura, **Retomar** o un marcador) guarda el punto de lectura y lo muestra cuando el core lo confirma. Tocar una aleya solo la selecciona para sus acciones (**Escuchar**, **Marcar**, **Continuar aquí**); **Continuar aquí** fija esa aleya como punto de lectura. El desplazamiento solo actualiza el indicador «Aleya X de N» y no cambia el punto guardado. Con el teclado, ↑/↓, Inicio y Fin mueven la selección. Abrir por primera vez no crea automáticamente un historial.

**Seguimiento de la recitación:** mientras suena una aleya de la sura en pantalla, la vista la acompaña con un desplazamiento suave. Con traducción, la aleya queda al inicio de la pantalla; en solo árabe, centrada. Con el movimiento reducido del sistema, el salto es inmediato. El seguimiento empieza con **Escuchar** y vuelve con reanudar, anterior o siguiente, **Retomar escucha**, reintentar o tocar la aleya del reproductor. La aleya que suena pasa a ser la seleccionada: muestra sus acciones y, en solo árabe, su traducción en la barra del pie. Desplazarse a mano (rueda, toque, barra o teclado), tocar otra aleya o navegar lo suspende. También empieza suspendido si se vuelve al lector con la recitación en curso. Mientras está suspendido, una pastilla **Seguir la recitación** con la referencia de la aleya permite retomarlo. No cambia de sura ni guarda el punto de lectura. Dentro de una aleya muy larga, la vista no avanza: no hay tiempos por palabra.

**Marcar** agrega o quita una aleya. El panel **Marcadores** permite volver a ella o quitarla. No se registra ni se modifica ningún rezo al leer o guardar marcadores.

El botón **عA** abre el panel **Lectura**, con el idioma y el tamaño del texto. Desde el 21/10/2026 se edita directo, sin Editar ni Guardar: es la única excepción a la regla de borrador de la app, porque lo que importa es ver el efecto y cualquier cambio se deshace con otro toque.

- **Idioma:** dos tarjetas con una muestra, **Árabe y español** y **Solo árabe** (de corrido). La muestra son dos aleyas cortas y completas (112:2 y 112:3), para no cortar el texto.
- **Tamaño:** deslizadores para el árabe (22–48 px) y el español (12–24 px). En «Solo árabe», el del español queda desactivado con una nota: la traducción del pie tiene tamaño propio.
- **Guardado:** el idioma se guarda al tocarlo; los deslizadores, al dejar de moverlos (400 ms) o al cerrar el panel. Lo pendiente también se guarda al salir del lector. Al confirmar, la cabecera muestra «Guardado». Si falla, la vista vuelve a lo que confirmó el core y se muestra el error.
- **Restablecer** vuelve a árabe y español, 30 y 16 px, los valores predeterminados del core.
- **Presentación:** en escritorio es un globo junto al botón y en el celular, una hoja inferior. No oscurece el texto, así que el cambio se ve mientras se ajusta. Se cierra con ✕, Esc, tocando afuera o con el mismo botón; con ✕ y Esc el foco vuelve al botón. Abrir otro panel o el modo enfoque lo cierra.

Estas preferencias pertenecen al lector y se guardan por separado de la configuración general.

## Presentación

Rediseño del 20/10/2026, a partir de la [maqueta simplificada](maquetas/lectura-quran/README.md) de un prototipo externo. Solo cambia la presentación: el corpus, los comandos del core y `quran-reader.json` no cambian.

- **Superficie de lectura:** Papel con el tema claro y Noche con el oscuro de Configuración → Apariencia. La traducción tiene contraste de 9,9:1 (Papel) y 11,3:1 (Noche).
- **Un solo ornamento:** el encabezado de la sura (nombre árabe, nombre, tipo de revelación y cantidad de aleyas) entre filetes. El dorado se reserva para el ornamento y la marca de fin de aleya; los estados y acciones usan el color de acento de la app.
- **Con traducción:** una aleya por bloque, sin tarjetas. La aleya seleccionada lleva un filete de acento y sus acciones; las demás muestran solo sus estados (punto de lectura, marcada, recitando).
- **Solo árabe:** texto de corrido, como en un mushaf: justificado en escritorio y alineado a la derecha en celular (hasta 480 px), para no abrir huecos grandes con pocas palabras por línea. La aleya tocada muestra al pie su referencia, su traducción completa y sus acciones. Una traducción larga ocupa hasta el 30 % de la altura de la pantalla y se desplaza dentro de la barra.
- **Marca de fin de aleya:** ۝ con el número en dígitos arábigo-índicos, compuesta por Amiri Quran. Es presentación: no se agrega al texto ni modifica los originales.
- **Tipo de revelación** (mequí o mediní): se lee del `quran-data.xml` de Tanzil ya incluido. Si no se puede leer, el encabezado lo omite y el lector sigue funcionando.
- **Modo enfoque:** oculta la navegación de la app y el reproductor. Se sale con **Salir del enfoque** o con Esc.
- **Pantallas chicas y Android:** la barra pasa a dos filas y los paneles se abren como hoja inferior. El aviso general de Android no se muestra dentro del lector.
- **Fuentes y condiciones:** al final de cada sura, con un enlace al panel que reúne los avisos completos.

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

El rediseño del 20/10/2026 se comprobó en Firefox con un sustituto del core (sin Tauri), en escritorio de 1440 y 1024 px y en Android simulado a 390 px, con temas claro y oscuro. Se recorrieron ambos modos, el índice con salto `2:255`, Marcar, Continuar aquí, Retomar, edición y cancelación de preferencias, modo enfoque con Esc, navegación con teclado, la aleya en recitación y un error de guardado. La consola quedó sin errores. Compilación TypeScript/Vite completada.

El seguimiento de la recitación se probó con el mismo sustituto, que simula el avance de aleyas. Se comprobaron 15 escenarios:

- Encuadre al inicio con traducción y centrado en solo árabe.
- La selección y la traducción del pie acompañan a la aleya que suena.
- Suspensión por rueda, por teclado, al tocar otra aleya y por navegación a otra sura y de vuelta.
- Pastilla al volver con la recitación en curso y retomar desde ella.
- Retomar con «siguiente» y con la aleya del reproductor.
- En modo enfoque a 390 px, la pastilla no se superpone con «Salir del enfoque».
- El aviso de estado ya no desplaza el texto al aparecer.

El 20/10/2026 el usuario usó el rediseño y el seguimiento en la app nativa de Linux (compilación de desarrollo) y en el J7 con el APK de prueba de v0.1.11. Pendientes: revisión en Windows y una medición específica del rendimiento de suras largas como Al-Baqara en el J7, que ahora se dibuja completa. También la ampliación del muestreo de signos y la recuperación de errores de almacenamiento. La concordancia estructural y visual no sustituye una revisión textual o religiosa.

La [recitación de Parhizgar](recitacion-quran.md) se publicó en v0.1.9 para escritorio y se está integrando en Android. Búsqueda avanzada y notas externas siguen fuera del alcance actual.
