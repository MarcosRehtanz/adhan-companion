# Maqueta: interfaz móvil

Propuesta del 21/10/2026 para que la app en Android se sienta de teléfono y no una versión achicada del escritorio. No es código de la app: HTML, CSS y JS sin dependencias, con datos fijos de ejemplo (Bahía Blanca, 21 de octubre, 15:10) y el estado en memoria. Solo afecta a Android y a ventanas angostas; el escritorio no cambia.

## Abrir

```bash
cd ~/adhan-companion && python3 -m http.server 8000
# luego: http://localhost:8000/docs/maquetas/movil/
```

Para verla en el teléfono: `python3 -m http.server 8000 --bind 0.0.0.0` y abrir `http://<IP de la computadora>:8000/docs/maquetas/movil/` desde el navegador del teléfono, en la misma red. El CSS no usa media queries de rango, `color-mix`, `:is` ni `inset`, así que también funciona en el WebView del J7.

Parámetros: `tema=noche`, `permisos=faltan` (aviso de permisos), `pantalla=hoy|registro|quran|mas`, `#mas/avisos` (subpantalla), `hoja=fajr|dhuhr|asr|maghrib|isha` (hoja de sonido abierta) y `ahora=HH:MM` (otra hora del día).

## Decisiones tomadas

- Barra inferior con **Hoy, Registro, Qur’an y Más**. Calendario islámico, Qibla, Ubicación y cálculo, Adhan y avisos, Apariencia, Actualizaciones y Acerca de pasan a **Más**.
- Los rezos de hoy se **marcan desde Hoy** con un toque. Registro queda para el historial, las rachas y los días anteriores.

## Qué cambia respecto de la versión actual

| Actual (capturas `actual-*`) | Propuesta (capturas `propuesta-*`) | Motivo |
|---|---|---|
| Menú hamburguesa con todas las secciones | Barra inferior con cuatro destinos | Un toque y al alcance del pulgar |
| Encabezado «ADHAN COMPANION / Hoy» de 72 px en todas las páginas | Barra de 56 px; en Hoy, la fecha civil y la hijri | El nombre de la app no informa nada |
| Aviso «Avisos en Android» arriba de cada página, aunque estén activos | Aviso solo en Hoy y solo si falta un permiso o están apagados | Ocupaba un tercio de la pantalla |
| Hoy empieza con la fecha hijri en una tarjeta; el próximo rezo es un recuadro con degradado y un número grande | Primero el próximo rezo: nombre en grande, su nombre árabe, la hora, cuánto falta y el recorrido del sol | Es lo que se busca al abrir la app |
| Los rezos de Hoy solo informan «Realizado» | Fila con un toque para marcar; los que todavía no llegaron no se marcan | Es la acción más frecuente |
| Tarjetas con título, subtítulo y párrafo | Listas nativas con separadores | Menos ruido y más contenido a la vista |
| Configuración: ~2.400 px de paneles con «Editar» y «Guardar» | Más: lista de opciones con su valor actual; cada una abre su pantalla con «‹» y **Guardar** arriba | Patrón de ajustes de Android, con la misma regla de borrador |
| Elegir el sonido de un rezo dentro de un formulario largo | Hoja inferior con las tres opciones, Probar y Listo | Edición puntual sin perder el contexto |
| «Horarios» contenía la configuración de ubicación y cálculo | Ubicación y cálculo en Más; los horarios, en Hoy | El nombre decía otra cosa |
| Rótulos en mayúsculas («PRÓXIMO REZO») | Texto normal | Más legible y menos «panel web» |

**El elemento propio es el recorrido del sol.** Muestra el horizonte: Fajr antes de la salida del sol, Dhuhr en lo más alto, Maghrib con la puesta e Isha de noche. Lo recorrido va en el color de acento y lo que falta, punteado. Explica por qué los rezos caen a esas horas.

El lector del Qur’an no cambia: ya tenía barra propia, paneles como hoja inferior y reproductor abajo. Solo se suma la barra inferior.

## Implementación

**Fase 1, 21/10/2026, en la rama `feat/interfaz-movil`.** Incluye:
- Barra inferior.
- Hoy completo: el recorrido del sol con la salida y la puesta del sol que calcula el core, marcar desde Hoy y el aviso solo si falta algo.
- Registro con la racha.
- Más con las subpantallas, que todavía muestran los paneles de configuración existentes.
- El botón atrás de Android.

La regla del horario para marcar quedó confirmada por el usuario: un rezo se marca desde su propio horario, y el core la valida también en escritorio y en el tray.

**Escritorio, el mismo día, a pedido del usuario:** la ventana ancha usa las mismas páginas con la barra lateral (Hoy, Registro, Calendario islámico, Qur’an y Configuración). Hoy, Registro con la racha y Configuración como lista con subpantallas quedan centrados en una columna de 680 px.

**Fase 2:** pasar cada subpantalla al patrón nativo, con Guardar arriba y hojas inferiores.

## Pendientes para la implementación

- Faltan maquetar Calendario islámico, Qibla, Ubicación y cálculo, Apariencia, Actualizaciones y Acerca de. Siguen el mismo patrón: pantalla propia con «‹» y Guardar.
- El botón «atrás» de Android tiene que volver de una subpantalla a Más y cerrar la hoja inferior antes de salir de la app.
- La qibla con brújula en vivo queda para teléfonos con magnetómetro. El J7 no lo tiene, así que ahí se muestra el rumbo en grados.
