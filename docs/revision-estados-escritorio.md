# Revisión funcional de estados en escritorio

Fecha: 19/10/2026. Versión local: 0.1.8 con cambios sin publicar.

## Entorno y alcance

Aplicación Tauri real en Linux, con el core Rust y los datos locales. Se recorrieron escenarios mediante los controles del WebView nativo, usando su inspector local temporal para accionar y observar la interfaz. No se usaron respuestas simuladas de IPC. Se inspeccionó también una captura del lector a 800 × 600 píxeles lógicos, sin desbordamiento horizontal y con la barra inferior visible.

El usuario confirmó que escuchó tanto el tono de prueba como la recitación de Parhizgar por su salida habitual. Esta comprobación no certifica la correspondencia editorial de todas las grabaciones con el texto.

Antes de comenzar se respaldaron configuración, registro, lector, estado de audio e inicio automático en una carpeta privada ignorada por Git. Las comprobaciones de error de archivo cambiaron permisos temporalmente, con restauración en `finally`; no corrompieron los archivos. Las pruebas de dependencia ausente usaron un PATH exclusivo del proceso de la app, sin cambiar el del sistema.

## Escenarios comprobados

| Apartado | Resultado observado |
| --- | --- |
| Navegación y edición común | Editar sin cambios permite cancelar y no ofrece guardar. Con cambios aparece guardar. No se puede iniciar otro bloque de edición; al navegar se ofrece volver al bloque pendiente. Cancelar restaura los valores. |
| Ubicación Google Maps | Entrada inválida muestra error y recuperación. Coordenadas válidas se incorporan al borrador una sola vez; desaparece la acción de incorporarlas. Cancelar conserva la ubicación original. |
| Apariencia y guardado | Vista previa y cancelación restauran la apariencia. Un fallo real de escritura conserva el borrador, muestra el error y permite guardar después de recuperar permisos. Se guardó y luego se restauró el tema original. |
| Arranque con configuración ilegible | Muestra error de carga y Reintentar, conservando el archivo. Tras restaurar permisos se recupera la aplicación. |
| Calendario islámico | Volver a hoy está deshabilitado en hoy y habilitado al cambiar de mes. Cancelar un ajuste manual descarta el cambio. |
| Registro | Fallar la escritura no cambia la marca confirmada. Marcar y desmarcar actualizan la interfaz después de guardar. Un fallo de lectura muestra error y bloquea las cinco acciones; Reintentar consulta recupera las acciones tras restaurar permisos. |
| Inicio automático | Desactivar y activar producen el estado confirmado correspondiente. Se restauró también el archivo original de inicio automático. |
| Actualizaciones | La búsqueda real muestra Buscando y luego confirma que está al día. Sin curl muestra error y Reintentar búsqueda; al recuperar la dependencia, el reintento termina correctamente. No presenta el fallo como versión actualizada. |
| Pruebas de audio | Un tono activo ofrece detener; al detener desaparece esa acción. La prueba de aviso sin sonido no presenta una reproducción activa. |
| Prioridad del aviso | El tono interrumpe la recitación. Al finalizar/detener el aviso, la recitación permanece pausada hasta reanudarla explícitamente. |
| Controles de recitación | Pausar, reanudar y detener reflejan el core. Anterior se deshabilita en la primera aleya y Siguiente en la última. Tras la corrección, avanzar y retroceder conservan la pausa. |
| Descarga | Una sura sin archivos ofrece descargar. Durante la operación muestra progreso y cancelar. Se observó Cancelando y después Cancelada con una aleya conservada, que se pudo completar. |
| Descarga terminada y persistencia | Con 11/11 aleyas muestra Disponible sin conexión y Eliminar audio, sin Descargar. Se conserva al salir/volver y al reiniciar el proceso nativo. |
| Reproducción con archivos locales | La sura descargada se reproduce aunque curl no esté disponible para el proceso. No se desconectó la red del equipo: esta prueba comprueba el uso del archivo local y no equivale a una prueba física en modo avión. |
| Fallos de recitación/descarga | Sin curl, la reproducción informa error y ofrece Reintentar aleya; la descarga informa que no se completó y ofrece Reintentar descarga. La aleya que falló sigue identificada aunque se seleccione otra sura. Tras recuperar curl, ambos reintentos funcionan: reproducción activa y descarga completa de 8/8 aleyas. |
| Eliminar audio | Vuelve a Sin descargar y reaparece Descargar sura. Se conserva el marcador del lector y no queda una confirmación histórica falsa de descarga completa. |
| Lector | Marcador y punto de lectura sobreviven a navegación y reinicio del proceso. Cancelar el tamaño descarta la vista previa. Escape cierra las opciones, devuelve el foco a Opciones y descarta la edición de volumen. |

## Correcciones encontradas durante esta revisión

1. Avanzar o retroceder una aleya iniciaba reproducción aunque la escucha estuviera pausada. El core conserva ahora la pausa al cambiar de aleya; se comprobó en el binario recompilado.
2. Si fallaba la reproducción y se seleccionaba otra sura, la barra podía atribuir el error a la nueva selección. Conserva ahora la posición de la reproducción fallida, incluyendo la acción para localizarla. Se comprobó con un error real y una selección distinta.

La compilación del core Linux y `pnpm build` finalizaron correctamente después de estas correcciones. No se añadieron tests automatizados a la suite.

## Restauración de datos

Al terminar se cerró el proceso de revisión y se restauraron los archivos originales. Los SHA-256 de `config.json`, `quran-reader.json`, `quran-audio.json` y `registro.jsonl` coinciden con el respaldo inicial. Antes de restaurar el registro se comprobó que solo se habían añadido las dos filas de prueba: marcar y desmarcar Fajr del día de revisión.

El archivo de inicio automático recuperó su contenido y permisos originales. Las suras temporales 93 y 94 se eliminaron desde la interfaz; se conservó la sura 1 que ya estaba descargada antes de comenzar. La app se volvió a abrir con el entorno normal y sin el inspector temporal.

## Límites y pendientes

- No hubo una versión compatible más nueva: no se descargó ni instaló una actualización de escritorio durante esta revisión. Quedan pendientes sus estados de descarga/instalación y errores en ese contexto real.
- No se probaron Windows ni una nueva compilación Android. Estas comprobaciones no certifican el APK instalado en el J7.
- No se inyectaron fallos de cálculo del scheduler, Qibla, estadísticas, sugerencia por IP ni consulta del plugin de inicio automático. Sus rutas de error requieren comprobaciones específicas posteriores.
- No se comprobó el límite de 1000 marcadores, las cuotas máximas de audio ni todos los posibles daños de archivo/manifiesto.
- La persistencia se comprobó reiniciando la aplicación, sin reiniciar la computadora.

Ver la regla general y el análisis de cada apartado en [estados-interfaz.md](estados-interfaz.md).
