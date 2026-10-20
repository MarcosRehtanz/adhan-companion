# Maqueta: lectura del Qur’an (versión simplificada)

Propuesta visual para el lector, basada en el prototipo generado con Qwen el 20/10/2026 y simplificada. No es código de la app: HTML, CSS y JS sin dependencias que leen el corpus instalado (`public/quran/`) sin modificarlo. El estado vive en memoria y no hay audio.

## Abrir

```bash
cd ~/adhan-companion && python3 -m http.server 8000
# luego: http://localhost:8000/docs/maquetas/lectura-quran/
```

Parámetros opcionales para revisar estados: `sura=2&aleya=255`, `tema=noche`, `modo=arabe`, `punto=36:12` (punto de lectura guardado), `marcas=2:3,2:255`, `escuchando=2:7`, `enfoque=1`, `acento=azul|violeta|rosa|ambar`, `panel=indice|marcadores|preferencias` (con `editar=1`). `captura=1` carga el texto de forma síncrona y solo sirve para capturas sin ventana.

## Qué cambió respecto del prototipo

| Prototipo | Maqueta | Motivo |
|---|---|---|
| Patrón de fondo, esquinas, brillos, degradados y animaciones | Un solo ornamento: la cartela de la sura | El adorno no compite con el texto |
| Dorado en adornos, estados, botones y texto árabe | Dorado solo en la cartela y en ۝; la interacción usa el acento de la app | El dorado vuelve a significar algo |
| Número de aleya dos veces (círculo en el margen y ۝) | ۝ con numerales arábigos en el árabe; número pequeño al inicio de la traducción | Una numeración por idioma |
| Nombre de la sura tres veces (barra, lista lateral, cartela) | Barra compacta y cartela; las 114 suras en un panel de índice | Menos repetición y más espacio para leer |
| Grilla de juz, lista de atajos, navegación flotante, bienvenida | Fuera | No ayudan a leer; juz y página pueden volver con `quran-data.xml` |
| «Solo árabe» con un recuadro por aleya | Texto de corrido, como en un mushaf; al tocar una aleya aparece su traducción con las acciones | Es el modo que más gana visualmente |
| Temas propios; claro y sepia rotos (árabe a 1,08:1) | Papel y Noche, con traducción a 9,9:1 y 11,3:1 | Contraste AA o mejor en todo el texto |
| Basmala agregada antes de cada sura | La del corpus, dentro de la aleya 1 | No duplicar ni alterar el texto |
| Texto y traducción de muestra (8 suras) | Tanzil Uthmani y Bórnez reales, 114 suras | Regla del lector: solo fuentes verificadas |
| Google Fonts y Tailwind 4 (necesita Chrome 111+) | Amiri Quran local; CSS sin media queries de rango, `color-mix`, `:is` ni `inset` | Sin conexión y apto para el WebView antiguo |
| Punto de lectura guardado en cada movimiento | Solo con «Continuar aquí»; al desplazarse cambia el indicador «Aleya X de N», sin guardar | Mismo criterio que la app |
| Acciones visibles solo al pasar el mouse | Siempre visibles en la aleya actual; en táctil solo ahí, sin fila vacía en las demás | En Android no hay hover |
| Sin adaptación a móvil | Barra en dos filas, paneles como hoja inferior, controles de 42–44 px | Android |
| Cuatro recitadores, velocidad y repetición simulados | El reproductor actual (Parhizgar), con la misma estructura | Es lo que existe y tiene permisos |

Se conserva del prototipo: el texto en el centro, la cartela, la marca ۝, la barra con ‹ sura › y progreso, «Retomar», los paneles de marcadores y preferencias, el modo enfoque, «Continuar con la siguiente sura», el interlineado y el ancho de columna.

## Límites

- Revisada en Firefox de escritorio sin ventana, a 1440, 1280 y 390 px (con puntero táctil emulado). No se probó en el WebView del J7 ni en Windows.
- Tema de lectura, ancho, interlineado y modo de corrido serían preferencias nuevas: requieren campos nuevos en `quran-reader.json`.
- Las preferencias siguen la regla de la app (resumen → Editar → Guardar o Cancelar; cerrar el panel descarta el borrador). Los estados de guardado y error del core no se simulan.

## Capturas

`capturas/prototipo-*.png` muestran el prototipo original (antes) y `capturas/maqueta-*.png` esta versión (después).
