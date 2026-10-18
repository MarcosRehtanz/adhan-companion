# Revisión del lector del Qur'an

Revisión del 18 de octubre de 2026 sobre la app real de Tauri en Ubuntu/GNOME/Wayland, con WebKitGTK y ventana de 800 × 600 píxeles CSS. Se usó el checkout local en desarrollo, todavía no publicado.

## Presentación del texto

| Comprobación | Resultado |
| --- | --- |
| Fuente incluida | Amiri Quran cargada en la WebView real. |
| Dirección de lectura | Árabe RTL y español LTR. |
| Temas | Inspección visual de capturas reales en oscuro y claro. |
| Tamaños | Tamaños habituales y máximos de 48 px para árabe y 24 px para español; sin desborde horizontal en los párrafos comprobados. |
| Concordancia con originales | Las siete aleyas seleccionadas coincidieron exactamente con los archivos locales tanto en árabe como en español. |
| Límites de navegación | Anteriores deshabilitado al comienzo y Siguientes deshabilitado al final. |
| Traducción opcional | Ocultarla en vista previa la retira de la vista; Cancelar restaura la presentación anterior. |

Muestras: 1:1, 2:1, 9:1, 95:1, 97:1, 114:6 y 2:282. Cubren la apertura de Al-Fatiha, aperturas de otras suras, la sura 9, el final del corpus y una aleya extensa. Se inspeccionó además 2:255 en una captura del tema oscuro. Los textos se compararon mediante `textContent` contra los originales instalados, sin normalizar ni sustituir caracteres.

La revisión visual de las capturas no mostró recortes de los signos ni caracteres de reemplazo en las muestras observadas. No equivale a una revisión filológica de todo el corpus ni confirma su presentación en otros sistemas operativos.

## Persistencia en reinicios reales

Se respaldó primero `quran-reader.json`. Las acciones se ejecutaron mediante los controles de la ventana nativa, y se contrastó el archivo guardado. No se usó un frontend con datos simulados.

1. Crear dos marcadores temporales, 112:2 y 2:255, y fijar el punto de lectura en 2:255.
2. Terminar el proceso principal de la app y abrir uno nuevo, conservando el directorio de datos real.
3. Abrir Qur’an: se recuperaron ambos marcadores y el punto 2:255; la aleya seguía marcada sin volver a guardarla.
4. Probar la vista previa de tamaños, Cancelar y Guardar preferencias. Se guardaron 48 px / 24 px con traducción visible.
5. Quitar el marcador temporal 112:2 desde Mis marcadores y reiniciar otra vez el proceso.
6. Abrir Qur’an: se mantuvieron el punto 2:255, el marcador restante y los tamaños 48 px / 24 px. El marcador eliminado no reapareció.

**Resultado:** creación y eliminación de marcadores, punto de lectura y tamaños se conservaron en dos reinicios completos. Cerrar únicamente la ventana no se consideró reinicio, porque la app vive en el tray.

## Corrección realizada

Al cambiar la letra, las alturas de las aleyas anteriores podían desplazar el punto seleccionado fuera del área visible. El lector ahora espera a que termine de cargar la fuente y encuadra la aleya seleccionada al navegar, recuperar la lectura o guardar tamaños/visibilidad. La vista previa mantiene los controles de edición disponibles hasta guardar.

Tras corregirlo, la captura del tema claro con letra grande mostró la cabecera de 2:282 encuadrada en la parte superior. En el segundo arranque se comprobó que la aleya seleccionada quedaba a 15 píxeles del inicio del área de contenido. TypeScript y el build de Vite completaron correctamente.

## Restauración de datos y límites

Se restauró byte por byte el archivo original del lector y se verificó que su SHA-256 coincidiera con el respaldo. Se descartó la vista previa de apariencia y se dejó la app abierta con sus preferencias originales. El inspector local usado durante la revisión quedó desactivado.

Pendientes: repetir la revisión nativa en Windows y ampliar el muestreo tipográfico antes de una publicación. La revisión no incluyó una auditoría religiosa del texto, el comportamiento ante cortes de energía ni la corrupción de archivos.
