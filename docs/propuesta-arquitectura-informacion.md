# Propuesta de arquitectura de información

**Adhan Companion · revisión de la ventana de configuración**  
Estado: arquitectura acordada e implementada en la interfaz; pendiente de revisión visual.

## Problema que resuelve

La ventana actual presenta seis pestañas del mismo nivel: «Ubicación», «Cálculo», «Audio», «Seguimiento», «Agente» y «Avanzado». Esa estructura mezcla tareas cotidianas, preferencias del adhan, seguimiento y opciones técnicas. También oculta el preaviso en «Avanzado», aunque es parte de la experiencia de avisos, y muestra «Agente» como función disponible cuando MQTT todavía es un placeholder.

El spec describe la app como tray-first y contempla un dashboard del día. La ventana debería abrir en ese dashboard; la navegación restante debería agrupar preferencias por lo que la persona quiere configurar.

## Estructura propuesta

Navegación lateral compacta, con cuatro destinos principales y una entrada secundaria para el sistema:

1. **Hoy** — vista inicial, informativa y de uso diario.
2. **Horarios** — ubicación y criterios que determinan el cálculo.
3. **Adhan y avisos** — sonido, rezos habilitados y preaviso.
4. **Registro** — calendario, marcado retroactivo y estadísticas.
5. **Sistema** — autoinicio, actualizaciones y detalles técnicos de configuración.

«Sistema» se ubica abajo en la barra lateral, separado visualmente de las tareas diarias. No se presenta como otra categoría de preferencias de oración.

## Contenido por destino

### Hoy

- Próximo rezo, hora y cuenta regresiva como contenido principal.
- Los cinco horarios del día, con el próximo destacado.
- Progreso de los rezos del día, si el estado registrado está disponible.
- Qibla como rumbo desde el norte, con la aclaración de que no es una brújula.
- Acceso claro a **Registro** para consultar o corregir días anteriores.

Esta vista sustituye la fila compacta de horarios como único contenido del encabezado. El tray sigue siendo el acceso rápido y el proceso de fondo; abrir la configuración lleva a **Hoy**.

### Horarios

Una sola sección para todo lo que determina cuándo ocurren los rezos, organizada en bloques separados. El primer bloque se llama **Ubicación**:

**Ubicación** muestra inicialmente ciudad, coordenadas y zona horaria como valores de solo lectura. Su botón **Editar ubicación** abre el editor con:

- Ciudad, latitud y longitud.
- Sugerencia de ubicación por IP, identificada como sugerencia y con revisión manual.
- Zona horaria de la ciudad y explicación visible de que el cálculo actual usa la zona local configurada en Ubuntu; ambas deben coincidir.

El bloque **Método de cálculo** muestra inicialmente los valores activos. Su botón **Editar método** abre el editor con:

- Método de cálculo.
- Madhab para Asr.
- Regla de latitud alta.
- Ajustes en minutos por rezo.

La ubicación y el método pertenecen juntos porque son entradas del mismo resultado: los horarios. El campo de zona horaria debe seguir siendo de solo lectura mientras el core dependa de la zona horaria del sistema.

## Regla de interacción para configuración

Las secciones de preferencias abren en **modo lectura**, sin inputs, selects, sliders ni toggles expuestos de entrada. Cada bloque presenta el valor actual y una acción **Editar**; al pulsarla, solo ese bloque pasa a modo edición.

- **Horarios:** tarjetas «Ubicación» y «Método de cálculo», cada una con su propio botón de edición.
- **Adhan y avisos:** resumen legible de volumen, rezos habilitados y minutos de preaviso; botón **Editar sonido y avisos** para revelar controles.
- **Sistema:** mostrar estados actuales como texto (por ejemplo, autoinicio habilitado/deshabilitado); ofrecer una acción explícita para cambiarlos. Las actualizaciones conservan sus botones de acción.
- **Hoy** y **Registro** son vistas de uso y consulta, no formularios de preferencias.

En edición, ofrecer **Cancelar** y mantener el botón global **Guardar cambios** para persistir la configuración, de acuerdo con el comportamiento actual. Cancelar descarta las modificaciones locales de ese bloque; guardar conserva el flujo existente de `set_config`. La pantalla vuelve al modo lectura después de cancelar o guardar.

La vista de lectura debe permitir entender los valores sin abrir el editor. No se usan campos deshabilitados para simular una vista: se presentan etiquetas y valores como contenido normal.

### Adhan y avisos

- Volumen del adhan.
- Activar o silenciar el adhan para cada rezo.
- Prueba de audio por rezo y prueba del próximo adhan.
- Minutos de anticipación del preaviso.
- Ayuda breve sobre el aviso previo y el aviso al llegar la hora.

El preaviso se mueve desde «Avanzado» aquí. El usuario lo ajusta como parte de cuándo y cómo recibe el aviso, no como mantenimiento técnico.

### Registro

- Resumen: racha actual, mejor racha, días completos y rezos marcados.
- Calendario mensual.
- Marcado y desmarcado de rezos para hoy o fechas pasadas.
- Fechas futuras deshabilitadas.

Se conserva el nombre «Registro» porque describe mejor los datos históricos y las estadísticas que «Seguimiento», que suena a una acción continua sin aclarar qué se registra.

### Sistema

- «Iniciar sesión automáticamente».
- Buscar actualizaciones y presentar la acción disponible según el formato instalado (`.deb` o AppImage).
- Ruta del archivo de configuración y detalles del schema, como información secundaria o plegable.

«Avanzado» se reemplaza por «Sistema»: las funciones actuales son integración con el inicio de sesión, actualizaciones y detalles del archivo local.

## Funciones aplazadas

- **Agente / MQTT:** quitar de la navegación principal mientras no conecte ni configure un nodo real. Reconsiderar una sección **Dispositivos** cuando el flujo de conexión y el estado del nodo estén implementados. Los campos existentes pueden conservarse en el archivo de configuración para no descartar compatibilidad futura.
- **Biblioteca de muecines:** no agregar selectores. La asignación fija por rezo es una decisión vigente.
- **Qibla:** mostrarla en **Hoy** como referencia. No crear una sección de configuración separada mientras no haya controles propios.

## Navegación y guardado

- Abrir siempre en **Hoy**; el acceso a configuración desde el tray no debería aterrizar en un formulario de ubicación.
- Usar una barra lateral compacta en lugar de seis pestañas horizontales. En 800 × 600, dejar el área principal para el contenido y permitir que el panel se desplace si una sección excede la altura.
- Mantener un único botón persistente **Guardar cambios** para las preferencias editables. Mostrar **Cambios sin guardar** al modificarlas y confirmación breve al guardar.
- Mostrar las preferencias en lectura por defecto; revelar los controles de edición solo tras una acción explícita **Editar**.
- **Hoy** y **Registro** son vistas de consulta/registro; no deben aparentar ser preferencias que requieren guardado. Las acciones de marcado mantienen su comportamiento inmediato actual.
- No introducir guardado automático en esta revisión: preserva el contrato actual de `set_config` y evita recalcular por cada edición parcial.

## Mapa de traslado

| Actual | Propuesta | Cambio |
|---|---|---|
| Ubicación | Horarios → Ubicación | Se agrupa con método; lectura por defecto y edición explícita |
| Cálculo | Horarios → Método de cálculo | Se agrupa con ubicación; lectura por defecto y edición explícita |
| Audio | Adhan y avisos | Se renombra, recibe el preaviso y pasa a lectura por defecto |
| Seguimiento | Registro | Se renombra; conserva calendario y estadísticas |
| Agente | Aplazado | Sale de la navegación hasta que MQTT sea funcional |
| Avanzado | Sistema | Se renombra; se mueve el preaviso a Adhan y avisos |
| Qibla dentro de Ubicación | Hoy | Pasa a ser referencia del día |
| Horarios en el encabezado | Hoy | Se vuelven parte de la vista principal |

## Orden sugerido de implementación

1. Reorganizar navegación y secciones sin alterar comandos IPC, schema ni cálculos.
2. Crear la vista **Hoy** usando los horarios, estado y qibla ya disponibles; confirmar qué información de progreso puede leerse sin agregar un contrato IPC innecesario.
3. Mover el preaviso y Sistema; retirar el placeholder MQTT de la navegación sin borrar sus datos persistidos.
4. Revisar la distribución a 800 × 600 y el desplazamiento de las secciones largas.

## Criterios para aprobar la propuesta

- Una persona puede encontrar en **Horarios** cualquier ajuste que cambie la hora calculada.
- En **Horarios**, la ciudad, las coordenadas y la zona horaria se encuentran en el bloque **Ubicación**.
- La pantalla inicial de cada preferencia presenta valores de lectura; los controles aparecen tras elegir **Editar**.
- Todo lo que afecta al sonido o al aviso previo está en **Adhan y avisos**.
- **Hoy** responde de inmediato qué rezo sigue, a qué hora y cómo va el día.
- El historial y sus estadísticas están juntos en **Registro**.
- No se presenta MQTT como función disponible mientras siga sin implementar.
- El tray sigue siendo el centro de la app y **Guardar cambios** conserva el comportamiento actual.

## Referencias de estado

- Ventana actual: `src/App.tsx` y `src/App.css`.
- Spec de producto: nota externa «Adhan Companion — App de Escritorio», sección «UX — el tray y la ventana».
- La nota de producto externa no se modifica. La implementación está en `src/App.tsx` y `src/App.css`.
