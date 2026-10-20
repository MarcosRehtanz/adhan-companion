# Estados y acciones de la interfaz

Regla de producto acordada el 19/10/2026: antes de implementar o modificar un apartado, analizar sus estados y transiciones. La interfaz debe reflejar lo que existe y lo que está ocurriendo, con acciones que tengan sentido en ese momento.

## Análisis de cada apartado

1. **Elemento y fuente de verdad:** qué se administra y dónde reside su estado real (core, archivos, dispositivo o respuesta remota).
2. **Estados:** cuáles existen en esa función y cómo se distinguen consulta inicial, ausencia, disponibilidad, operación activa, parcial, éxito y error.
3. **Transiciones:** qué evento cambia el estado y qué confirmación permite darlo por terminado.
4. **Acciones:** cuáles se ofrecen, cuáles se ocultan y cuáles deben esperar; validarlas también en el core.
5. **Persistencia y concurrencia:** qué se recupera al volver a abrir o reiniciar, y qué ocurre si cambia el elemento mientras llega una respuesta anterior.
6. **Fallos y recuperación:** conservar datos válidos y edición no guardada; explicar qué puede hacer el usuario para continuar.

No todos los apartados necesitan todos los estados. Se documentan los que correspondan a su comportamiento. Esta regla se aplica a futuras tareas y a los apartados que se modifiquen; no implica que todo el sistema anterior haya sido auditado ya.

## Descarga de recitación por sura

Fuente de verdad: archivos y manifiestos persistidos en el core para la sura seleccionada, junto con la operación de descarga actual. Un resultado histórico de «descarga completa» no prueba que los archivos sigan presentes después de eliminarlos.

| Estado | Presentación | Acciones |
| --- | --- | --- |
| Consulta inicial o cambio de sura | Consultando archivos | Esperar a la respuesta de esa sura. |
| Consulta fallida | No se pudo consultar | Volver a consultar; no asumir que faltan los archivos. |
| Sin archivos | Sin descargar | Descargar sura. |
| Iniciando o descargando | Progreso por aleyas | Cancelar; no volver a descargar ni eliminar durante la operación. |
| Cancelando | Cancelando descarga | Esperar confirmación de que el trabajador terminó. |
| Cancelada | Cancelada; cantidad conservada | Descargar o completar según los archivos que quedaron; eliminar si hay archivos. |
| Parcial | Descarga incompleta | Completar descarga o eliminar audio. |
| Error de descarga | Error y cantidad conservada | Reintentar descarga; eliminar si quedaron archivos. |
| Archivo o manifiesto dañado | Error de integridad/almacenamiento | Eliminar audio dañado y volver a descargar. |
| Completa | Disponible sin conexión, tamaño y aleyas | Eliminar audio; no mostrar Descargar. |
| Eliminando | Eliminando audio | Esperar confirmación; después reconstruir desde disco. |

Si otra sura se está descargando, se muestran su progreso y cancelación; no se permite iniciar otra descarga ni eliminar audio hasta que termine. La disponibilidad de la sura seleccionada sigue mostrándose por separado.

El core rechaza descargar una sura que ya está completa y elimina el resultado histórico de su descarga al borrarla. Al abrir el lector o reiniciar, la disponibilidad se reconstruye desde archivos/manifiestos. El tamaño se consulta para presentar disponibilidad y el SHA-256 se comprueba al usar los archivos; un fallo se informa para recuperar el contenido sin modificar el lector.

Los estados y acciones se derivan en `src/lib/quran-audio-state.ts`. La consulta inicial y los errores de consulta no habilitan acciones basadas en una copia obsoleta de otra sura. Los estados transitorios no sustituyen una confirmación del core.

## Edición de preferencias

Vista con valor guardado → Editar → borrador → Guardar o Cancelar. Durante el guardado se bloquean envíos duplicados; el éxito vuelve al valor confirmado por el core. Si falla, se conserva el borrador y se ofrece recuperación. Cancelar descarta solo el borrador.

«Adhan y avisos» se encuentra dentro de **Configuración**, junto con apariencia, inicio automático y actualizaciones. No aparece como sección independiente en el menú principal ni en el panel responsive. El acceso antes llamado «Sistema» se presenta como «Configuración». El bloque mantiene vista de valores guardados, Editar, Guardar y Cancelar; comparte el bloqueo de edición con apariencia. Si se navega con una edición de sonido pendiente, «Volver a la edición» regresa a Configuración. En Android, la activación y los permisos de avisos también se encuentran allí. Este cambio de organización no altera la configuración persistida ni la programación de rezos.

## Navegación responsive lateral

El menú hamburguesa abre un panel anclado a la izquierda, de altura completa y con desplazamiento propio cuando no caben todas las secciones. Comparte los colores y la sección activa del sidebar de escritorio. El fondo queda atenuado y el foco permanece dentro del panel mediante `dialog.showModal()`; su presentación visual es lateral.

- **Cerrado:** solo se ofrece abrir y `aria-expanded` es falso.
- **Abierto:** se puede elegir una sección, cerrar con X, Escape/solicitud de cancelación del WebView o tocar el fondo exterior. Pulsar el espacio interior no lo cierra. La apertura desplaza el panel desde la izquierda.
- **Cerrando:** termina el desplazamiento de salida antes de cerrar el diálogo y devolver el foco al botón de apertura; no admite nuevas selecciones. Un temporizador asegura el cierre aunque no se emita un evento de animación.
- **Cambio a escritorio:** por encima de 720 px se cierra inmediatamente y libera el foco/fondo. En Android se conserva la navegación hamburguesa a cualquier ancho.
- **Movimiento reducido:** se omiten las animaciones y el cierre se realiza sin espera de transición.

Estado efímero de interfaz, sin persistencia: al abrir la app el panel comienza cerrado. Cerrar o cambiar de sección conserva los borradores de configuración según las reglas comunes de edición. Este cambio no requiere modificar datos ni comandos del core.

## Revisión de los demás apartados — 19/10/2026

Esta revisión aplica a la implementación local de escritorio y a los componentes compartidos. No afirma que los flujos hayan sido probados manualmente en todas las plataformas.

| Apartado | Estados y fuente de verdad | Acciones y corrección |
| --- | --- | --- |
| Arranque/configuración | Consulta, configuración persistida válida o error de archivo/IPC. | No presentar el fallback en memoria como configuración guardada. Consultar el archivo real y conservarlo ante errores; ofrecer reintentar. |
| Hoy y horarios | Consulta inicial, actualizando, resultado con/sin próximo rezo, error. Fuente: scheduler. | Diferenciar «Consultando» de «Sin próximos rezos» y del fallo; reintento visible y respuestas anteriores invalidadas. |
| Qibla | Calculando, orientación disponible, error. Fuente: core. | Reintentar si falla; no quedar en «Calculando…» indefinidamente después de un error. |
| Ubicación manual/Google Maps | Edición, consulta, punto encontrado, incorporado al borrador, error. | Revisar solo cuando hay entrada pendiente; incorporar una sola vez; un punto incorporado muestra confirmación. Errores del navegador separados de errores de entrada. |
| Sugerencia por IP | Consultando con plazo, sugerencia válida pendiente de guardar, cancelada o error. | Validar coordenadas/zona; no mezclar una ciudad nueva con coordenadas anteriores. Cancelar descarta respuestas tardías; guardar espera a terminar la sugerencia. |
| Método, avisos, apariencia y ajuste islámico | Lectura, edición sin cambios, cambios pendientes, guardando, confirmado o error. | Una edición a la vez. No abrir otra encima; conservar borrador al fallar. Durante guardado, bloquear cambios/envíos duplicados. Guardar solo con cambios; Cancelar restaura el bloque. Volver a la edición si se navega a otro apartado. |
| Confirmación parcial de configuración | El archivo puede guardarse y fallar luego la sincronización nativa. | Reconsultar el core después del fallo; distinguir «no guardado» de «guardado con operación posterior fallida». No afirmar que la programación de avisos quedó confirmada. |
| Apariencia predeterminada | Valores actuales o distintos de los predeterminados. | Restablecer solo cuando hay algo que restablecer. Vista previa no equivale a guardado. |
| Calendario islámico | Mes/día consultado, hoy, límites de navegación, ajuste en edición. | Volver a hoy deshabilitado si ya está seleccionado; límites de mes/año conservados. El ajuste sigue el guardado común. |
| Registro y calendario civil | Consultando mes, sin registros, parcial/completo, guardando marca, error de lectura/escritura. Fuente: registro persistido. | No marcar visualmente antes de confirmar escritura. Bloquear dobles toques y navegación durante esa operación; conservar último estado confirmado si falla y reconsultar el mes después del éxito. No pintar el mes anterior como si fuera el nuevo. |
| Horarios de un día histórico | Consulta por fecha, horarios disponibles o error. | Limpiar el resultado al cambiar de fecha, ignorar respuestas antiguas y ofrecer reintento. |
| Estadísticas | Consulta, datos confirmados —incluidos ceros válidos—, error. | Distinguir ausencia real de registros de fallo/archivo ilegible; recuperar con reintento. |
| Pruebas de Adhan/tonos | Estado consultado del core, reproducción activa/inactiva, operación de inicio/parada, error o estado desconocido. | Consultar reproducción real; mostrar Detener cuando hay audio o el estado es desconocido como acción de seguridad. No afirmar «detenido» solo por enviar la orden. No disponible en plataformas sin soporte. |
| Inicio automático | Consultando, activado/desactivado confirmado, aplicando, error/estado desconocido. | No mostrar «Desactivado» si falló la consulta ni cambiar la vista anticipadamente; reconsultar el plugin después de aplicar. |
| Actualizador de escritorio | Sin consultar, buscando, al día, disponible, instalando, error. Fuente: estado del core. | Limpiar candidatos y mensajes viejos al buscar, conservar errores, bloquear operaciones incompatibles y recuperar estado al volver a Sistema. Buscar e instalar no bloquean el hilo de la interfaz. La descarga manual sigue correspondiendo al formato de instalación. |
| Avisos Android | Consulta, desactivados, permisos faltantes, programados, sin programación/error. | Activar solo con permisos, permitir conceder los faltantes, desactivar si estaban activos y reintentar programación si falla. El core también valida permisos. |
| Actualizador Android | Consulta, buscando, disponible, descargando/verificando/cancelando, listo para instalar, error. | Evitar que una consulta vieja pise la respuesta de una acción. Consulta fallida tiene reintento. APK listo muestra permisos/instalar, no descargar de nuevo. Abrir el instalador no equivale a instalación terminada. |
| Lector Qur’an | Cargando, disponible, guardando posición/marcador/preferencias, error. | Confirmar el punto de lectura después del guardado; bloquear edición durante envío; conservar borrador si falla. Al alcanzar 1000 marcadores, permitir quitar y bloquear nuevas altas con explicación. |
| Recitación | Sin sesión, cargando/reproduciendo, pausada, terminada, error. | Anterior, siguiente y detener dependen de una sesión activa; cambiar de aleya conserva la pausa. Pausa por aviso requiere reanudar manualmente. El error identifica la aleya de la sesión fallida aunque cambie la selección. La descarga sigue la máquina de estados detallada arriba. |

### Confirmación real en el registro

En escritorio, `mark_prayed` espera una respuesta del scheduler tras escribir el archivo. El scheduler procesa todos los pedidos recibidos, en vez de conservar solo el último de un mismo ciclo. Un fallo de escritura no cambia el menú ni el estado publicado. Los IPC de historial y estadísticas distinguen archivo inexistente —historial vacío legítimo— de archivo ilegible o con filas JSON dañadas, que se conserva y se informa.

### Límites de esta revisión

- Compilación TypeScript/Vite y del core Linux confirmadas. La revisión funcional en la ventana nativa, sus correcciones y casos pendientes están documentados en [revision-estados-escritorio.md](revision-estados-escritorio.md). No se añadieron tests a la suite.
- El estado de reproducción Android y la acción nativa de reprogramar requieren compilar e instalar un APK nuevo. No se modificó ni reemplazó la compilación 10018 del J7 durante esta revisión.
- El instalador de escritorio sigue las capacidades previas de cada formato; esta tarea no agrega actualización automática a `.deb` o Windows.
- La comprobación de configuración persistida evita presentar un archivo inválido como guardado; no reemplaza una política completa de recuperación del scheduler ante corrupción de configuración.
