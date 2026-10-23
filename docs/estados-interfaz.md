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

## Resolución de enlaces de Google Maps en Android

Desde v0.1.10, el estado «Leyendo ubicación» espera la resolución nativa de enlaces cortos con límites de tiempo y hasta cuatro saltos validados por el core. Durante la consulta se bloquean envíos repetidos y la entrada; al terminar, se ofrece incorporar el punto encontrado o reintentar el error. El trabajador de red está separado del de alarmas. La consulta no guarda la configuración ni elige el centro del mapa como ubicación. Un pin explícito prevalece sobre su representación redondeada en la ruta.

## Edición de preferencias

Vista con valor guardado → Editar → borrador → Guardar o Cancelar. Durante el guardado se bloquean envíos duplicados; el éxito vuelve al valor confirmado por el core. Si falla, se conserva el borrador y se ofrece recuperación. Cancelar descarta solo el borrador.

**Excepción:** el panel **Lectura** del lector del Qur’an (idioma y tamaño del texto) se edita directo y guarda cada cambio, sin borrador. Si un guardado falla, la vista vuelve al valor confirmado por el core. Ver [lector-quran.md](lector-quran.md).

«Adhan y avisos» se encuentra dentro de **Configuración**, junto con apariencia, inicio automático y actualizaciones. No aparece como sección independiente en el menú principal ni en el panel responsive. El acceso antes llamado «Sistema» se presenta como «Configuración». El bloque mantiene vista de valores guardados, Editar, Guardar y Cancelar; comparte el bloqueo de edición con apariencia. Si se navega con una edición de sonido pendiente, «Volver a la edición» regresa a la subpantalla Adhan y avisos (desde el 21/10/2026, Configuración es una lista con subpantallas). En Android, la activación y los permisos de avisos también se encuentran allí. Este cambio de organización no altera la configuración persistida ni la programación de rezos.

## Navegación responsive lateral

> Reemplazada el 21/10/2026 por la interfaz de celular (barra inferior y subpantallas de «Más»; ver [la maqueta](maquetas/movil/README.md) y la sección siguiente). Se conserva como registro de la versión anterior.

El menú hamburguesa abría un panel anclado a la izquierda, de altura completa y con desplazamiento propio cuando no caben todas las secciones. Comparte los colores y la sección activa del sidebar de escritorio. El fondo queda atenuado y el foco permanece dentro del panel mediante `dialog.showModal()`; su presentación visual es lateral.

- **Cerrado:** solo se ofrece abrir y `aria-expanded` es falso.
- **Abierto:** se puede elegir una sección, cerrar con X, Escape/solicitud de cancelación del WebView o tocar el fondo exterior. Pulsar el espacio interior no lo cierra. La apertura desplaza el panel desde la izquierda.
- **Cerrando:** termina el desplazamiento de salida antes de cerrar el diálogo y devolver el foco al botón de apertura; no admite nuevas selecciones. Un temporizador asegura el cierre aunque no se emita un evento de animación.
- **Cambio a escritorio:** por encima de 720 px se cierra inmediatamente y libera el foco/fondo. En Android se conserva la navegación hamburguesa a cualquier ancho.
- **Movimiento reducido:** se omiten las animaciones y el cierre se realiza sin espera de transición.

Estado efímero de interfaz, sin persistencia: al abrir la app el panel comienza cerrado. Cerrar o cambiar de sección conserva los borradores de configuración según las reglas comunes de edición. Este cambio no requiere modificar datos ni comandos del core.

## Navegación de celular

En Android y en ventanas de hasta 720 px, la barra inferior lleva a Hoy, Registro, Qur’an y Más.

- **Sección activa:** el ícono resaltado y `aria-current="page"`.
- **Subpantallas de Más:** Calendario islámico, Qibla, Ubicación y cálculo, Adhan y avisos, Apariencia, Actualizaciones y Acerca de. Se abren con «‹» en la barra y entran al historial: el botón atrás de Android o «‹» vuelven a Más, y tocar otra pestaña sale de la subpantalla.
- **Cambio de ancho:** las páginas son las mismas; solo cambia el marco. Al ensanchar la ventana, una subpantalla de Más queda como subpantalla de Configuración, y el Calendario islámico pasa a la barra lateral.
- **Ediciones:** las reglas comunes se mantienen. «Volver a la edición» lleva a la subpantalla donde quedó el borrador.
- **Guardado:** mientras se guarda, la barra inferior queda bloqueada.

En la ventana ancha de escritorio, la barra lateral lleva a Hoy, Registro, Calendario islámico, Qur’an y Configuración. Configuración es la misma lista agrupada, con su valor actual, y suma Inicio de sesión. Cada opción abre una subpantalla con «‹ Volver a Configuración». La sección activa de la barra lateral sigue siendo Configuración mientras se está en una subpantalla.

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
| Registro y calendario civil | Consultando mes, sin registros, parcial/completo, guardando marca, error de lectura/escritura. Fuente: registro persistido. | No marcar visualmente antes de confirmar escritura. Bloquear dobles toques y navegación durante esa operación; conservar último estado confirmado si falla y reconsultar el mes después del éxito. No pintar el mes anterior como si fuera el nuevo. Desde el 21/10/2026, un rezo de hoy se marca desde su horario: antes queda deshabilitado, y el core rechaza la marca con «Todavía no es la hora de …». Desmarcar y corregir días anteriores no se limitan. |
| Horarios de un día histórico | Consulta por fecha, horarios disponibles o error. | Limpiar el resultado al cambiar de fecha, ignorar respuestas antiguas y ofrecer reintento. |
| Estadísticas | Consulta, datos confirmados —incluidos ceros válidos—, error. | Distinguir ausencia real de registros de fallo/archivo ilegible; recuperar con reintento. |
| Pruebas de Adhan/tonos | Estado consultado del core, reproducción activa/inactiva, operación de inicio/parada, error o estado desconocido. | Consultar reproducción real; mostrar Detener cuando hay audio o el estado es desconocido como acción de seguridad. No afirmar «detenido» solo por enviar la orden. No disponible en plataformas sin soporte. |
| Inicio automático | Consultando, activado/desactivado confirmado, aplicando, error/estado desconocido. | No mostrar «Desactivado» si falló la consulta ni cambiar la vista anticipadamente; reconsultar el plugin después de aplicar. |
| Actualizador de escritorio | Sin consultar, buscando, al día, disponible, instalando, error. Fuente: estado del core. | Limpiar candidatos y mensajes viejos al buscar, conservar errores, bloquear operaciones incompatibles y recuperar estado al volver a Sistema. Buscar e instalar no bloquean el hilo de la interfaz. **Actualizar ahora** se ofrece con AppImage, `.deb` y Windows; los dos últimos solo si la release publica `SHA256SUMS`. Antes de instalar se explica qué va a pasar (contraseña de Ubuntu, cierre y reapertura). Un hash distinto, una autorización cancelada o un error de apt dejan la versión instalada sin cambios y muestran el motivo. En otros formatos queda la descarga manual. |
| Avisos Android | Consulta, desactivados, permisos faltantes, programados, sin programación/error. | Activar solo con permisos, permitir conceder los faltantes, desactivar si estaban activos y reintentar programación si falla. El core también valida permisos. |
| Actualizador Android | Consulta, buscando, disponible, descargando/verificando/cancelando, listo para instalar, error. | Evitar que una consulta vieja pise la respuesta de una acción. Consulta fallida tiene reintento. APK listo muestra permisos/instalar, no descargar de nuevo. Abrir el instalador no equivale a instalación terminada. |
| Lector Qur’an | Cargando, disponible, guardando posición/marcador/preferencias, error. Desde el rediseño del 20/10/2026: aleya seleccionada (efímera) separada del punto guardado; panel abierto; modo enfoque; seguimiento de la recitación activo o suspendido. | Confirmar el punto de lectura después del guardado; bloquear edición durante envío. Al alcanzar 1000 marcadores, permitir quitar y bloquear nuevas altas con explicación. Seleccionar una aleya o desplazarse no guarda; navegar sí, y la vista cambia cuando el core confirma. El panel «Lectura» no tiene borrador: guarda cada cambio, guarda lo pendiente al cerrarse y, si falla, vuelve a lo confirmado. El modo enfoque se retira al salir del lector y devuelve el foco al botón que lo abrió. El seguimiento de la recitación mueve la selección a la aleya que suena; se suspende al desplazarse a mano, tocar otra aleya o navegar, y se ofrece retomarlo con «Seguir la recitación»; nunca cambia de sura ni guarda. |
| Recitación | Sin sesión, cargando/reproduciendo, pausada, terminada, error. | Anterior, siguiente y detener dependen de una sesión activa; cambiar de aleya conserva la pausa. Pausa por aviso requiere reanudar manualmente. El error identifica la aleya de la sesión fallida aunque cambie la selección. La descarga sigue la máquina de estados detallada arriba. En Android, sin permiso de notificaciones se muestra el aviso con «Permitir notificaciones» y no se inicia la escucha. |
| Guía y acompañamiento del rezo (solo en desarrollo: `tauri dev` o `VITE_GUIA_REZO=1`) | Guía (lectura) con perfil ja'fari «Mi práctica» o «Sistani completo» y secciones antes del rezo, rakʿas y taʿqībāt; «Antes de empezar» (hoja); rezando: paso a paso (desde el adhan hasta la taʿqībāt), contador de rakʿas o cuenta de un dhikr (tasbīḥ de Fátima: fase en curso, completo); fin. En fin, el marcado: consultando, ya marcado, horario sin llegar, unido sin el primero marcado, disponible, marcando, marcado, error; con combinar, «Marcar X y seguir con Y» (marcando, error). Tarjeta en Hoy: oculta, ofrece el rezo en curso sin marcar. | La posición del rezo y la cuenta no se guardan; el modo, el perfil y lo que va debajo del árabe sí (localStorage). «Terminar» o Escape salen sin marcar. En la cuenta, cada toque suma una repetición; completa, el toque siguiente avanza; «Paso anterior» resta y «Saltar» pasa al paso siguiente. Con el contador de rakʿas, «Terminé» sigue paso a paso con la taʿqībāt si está visible; si no, va al fin. `mark_prayed` alterna en el core, así que «Marcar» solo aparece si el rezo de hoy no está marcado y su horario llegó; unido (`combinado`), Asr o Isha se ofrecen desde el horario de Dhuhr o Maghrib solo si el primero ya está marcado, y el core lo vuelve a validar. «Marcar X y seguir con Y» marca el primero si hace falta (si falla, se queda y explica) y vuelve a «Antes de empezar» con el siguiente unido (solo iqama); elegir otro rezo en la guía quita lo unido. El éxito se muestra cuando el core confirma. Tarjeta de Hoy: el último rezo cuyo horario llegó, si no está marcado (Fajr, solo hasta la salida del sol); abre la guía con ese rezo en «Antes de empezar» y el pedido se descarta al salir de la guía. Ver `src/components/AcompanarRezo.tsx`, `GuiaRezo.tsx` y `Today.tsx`. |

### Confirmación real en el registro

En escritorio, `mark_prayed` espera una respuesta del scheduler tras escribir el archivo. El scheduler procesa todos los pedidos recibidos, en vez de conservar solo el último de un mismo ciclo. Un fallo de escritura no cambia el menú ni el estado publicado. Los IPC de historial y estadísticas distinguen archivo inexistente —historial vacío legítimo— de archivo ilegible o con filas JSON dañadas, que se conserva y se informa.

### Límites de esta revisión

- Compilación TypeScript/Vite y del core Linux confirmadas. La revisión funcional en la ventana nativa, sus correcciones y casos pendientes están documentados en [revision-estados-escritorio.md](revision-estados-escritorio.md). No se añadieron tests a la suite.
- El estado de reproducción Android y la acción nativa de reprogramar requieren compilar e instalar un APK nuevo. No se modificó ni reemplazó la compilación 10018 del J7 durante esta revisión.
- El instalador de escritorio sigue las capacidades previas de cada formato; esta tarea no agrega actualización automática a `.deb` o Windows (agregada después, el 21/10/2026: ver la fila del actualizador).
- La comprobación de configuración persistida evita presentar un archivo inválido como guardado; no reemplaza una política completa de recuperación del scheduler ante corrupción de configuración.
