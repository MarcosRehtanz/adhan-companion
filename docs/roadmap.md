# Roadmap de mejoras

Solicitudes registradas el 18 de octubre de 2026, después de publicar v0.1.7.

Las seis mejoras están solicitadas. El alcance inicial y el orden que siguen son propuestas de implementación; el estado de cada mejora se indica debajo y las pendientes todavía no tienen una versión publicada asignada.

## Reglas comunes

- Mantener el cálculo de horarios local y el funcionamiento del tray sin depender de la ventana.
- Mostrar las preferencias en modo lectura; revelar sus controles con **Editar** y ofrecer **Guardar** y **Cancelar**.
- Preservar la configuración y el historial existentes al incorporar nuevas preferencias.
- Validar cada función en Linux y Windows antes de publicarla.

## 1. Próximo rezo, incluso al día siguiente

**Solicitud:** mostrar siempre el próximo rezo, aunque corresponda a mañana.

**Estado:** incluido en v0.1.8, validado con tests del core; pendiente de ampliar la revisión manual.

**Limitación de v0.1.7:** al terminar los rezos del día, el scheduler deja `next` y `countdown_secs` vacíos hasta medianoche. La tarjeta de Hoy también busca la hora exclusivamente en la lista del día actual y usa el texto fijo «Hoy a las».

**Propuesta:**

- Después de Isha, calcular el Fajr para la fecha siguiente con la ubicación y los ajustes activos.
- Mostrar nombre, hora, fecha correspondiente y cuenta regresiva: «Fajr · Mañana a las …».
- Compartir ese próximo evento entre Hoy y el tray. Mantener los cinco horarios de hoy y sus registros asociados a su propia fecha.
- Representar el próximo evento con fecha y hora completas; no reutilizar el horario de Fajr de hoy para mañana.
- Mantener el comportamiento de avisos y audio sin disparos duplicados por anticipar visualmente el siguiente día.

**Aceptación:** revisar después de Isha, antes y después de medianoche, cambio de mes/año, cambio de offset horario y reanudación de suspensión. El próximo evento y su cuenta regresiva deben coincidir entre la ventana y el tray.

## 2. Ubicación mediante Google Maps

**Estado:** incluido en v0.1.8; pendiente de revisión manual. Ver [uso y formatos admitidos](ubicacion-google-maps.md).

**Solicitud:** usar Google Maps para obtener una ubicación precisa.

**Ubicación en la app:** Horarios → Ubicación → Editar ubicación.

**Propuesta inicial:**

- Ofrecer una acción para abrir Google Maps y elegir el punto deseado.
- Permitir introducir las coordenadas obtenidas del punto o pegar un enlace de ubicación compatible.
- Presentar las coordenadas interpretadas y la ciudad como una propuesta que el usuario revisa antes de guardar.
- Conservar la entrada manual y la sugerencia por IP como alternativas.
- Calcular los horarios sin conexión una vez guardadas las coordenadas.

**Alcance implementado:** apertura en el navegador; importación local de coordenadas y enlaces completos compatibles; resolución limitada de enlaces cortos. La zona horaria sigue siendo la del sistema y la ciudad se revisa manualmente. No se interpretan rutas ni centros de mapa como un punto seleccionado.

**Aceptación:** validar latitud/longitud, rechazar enlaces ambiguos con una explicación y no modificar la ubicación guardada hasta confirmar. La precisión corresponde al punto seleccionado; la sugerencia por IP no debe presentarse como ubicación exacta.

## 3. Alarmas discretas como alternativa al adhan

**Estado:** incluidas en v0.1.8, pendientes de prueba manual de audio. Ver [avisos por rezo](avisos-por-rezo.md).

**Solicitud:** contar con un aviso sonoro más disimulado.

**Ubicación en la app:** Adhan y avisos.

**Propuesta:**

- Elegir por rezo entre adhan, tono discreto o solo notificación (sin audio propio de la app; el sistema controla el sonido de sus notificaciones).
- Incluir una selección pequeña de tonos breves, con prueba de sonido, volumen y duración.
- Mantener el preaviso configurable y aclarar qué sonido se usa al llegar la hora.
- Conservar la asignación fija de muecín para quienes elijan adhan.
- Permitir detener el sonido desde el tray. Cambiar o silenciar un aviso no equivale a marcar el rezo como realizado.

**Aceptación:** cada rezo utiliza únicamente el modo elegido; las pruebas respetan volumen y duración; funciona con la ventana cerrada. Una configuración existente conserva su comportamiento al actualizar.

## 4. Calendario islámico

**Estado:** incluido en v0.1.8; pendiente de revisión visual. Ver [criterio y uso](calendario-islamico.md).

**Solicitud:** incorporar un calendario islámico a la app.

**Propuesta inicial:**

- Mostrar la fecha islámica junto a la fecha civil en Hoy.
- Ofrecer consulta mensual y correspondencia entre ambas fechas.
- Distinguir la consulta del calendario del historial de rezos de Registro.
- Relacionarlo con la [propuesta de modo Ramadán](propuesta-modo-ramadan.md), sin activar automáticamente funciones de ayuno todavía no acordadas.

**Decisión vigente (18 de octubre de 2026):** conservar el tabular con ajuste manual. La elección de autoridad/comunidad chií y la sincronización de comienzos de mes quedan para una ampliación futura. El ajuste actual es global y puede necesitar revisión cada mes. Los criterios religiosos, las fuentes consultadas y los requisitos futuros están en [la documentación del calendario](calendario-islamico.md#relación-con-una-referencia-religiosa-chií).

**Criterio implementado:** calendario tabular civil con época gregoriana 622-07-19, cambio de fecha a medianoche local y ajuste persistente de −2 a +2 días. Consulta offline; no calcula observación lunar ni determina festividades. El criterio y la posible diferencia con la comunidad se muestran en pantalla. El material de Ramadán del vault se consultó antes de implementar.

**Aceptación:** correspondencia consistente entre fechas, navegación entre meses y años, criterio visible y ajustes persistentes. El calendario no debe cambiar silenciosamente el registro civil de los rezos.

## 5. Personalización de colores

**Estado:** incluida en v0.1.8; pendiente de ampliar la revisión visual.

**Solicitud:** permitir personalizar la apariencia.

**Ubicación:** Sistema → Apariencia.

**Implementación:** temas claro, oscuro o del sistema; acentos verde, azul, violeta, rosa y ámbar. Las preferencias se guardan en `appearance.theme` y `appearance.accent` dentro de la configuración local, con enums validados por el core. Las configuraciones anteriores usan claro/verde sin reescritura al iniciar.

- El modo sistema escucha los cambios de `prefers-color-scheme` mientras la ventana está abierta.
- La edición aplica una vista previa a toda la ventana. Guardar persiste; Cancelar restaura la apariencia anterior. Restablecer predeterminados es parte de la edición y requiere Guardar.
- Los colores se aplican a navegación, próximo rezo, formularios, avisos, calendarios, registro y estados. Las superficies y textos tienen variantes claras/oscuras, y los botones con fondo de acento usan una variante oscura con texto blanco.
- La personalización afecta al contenido de la ventana. El marco nativo, las notificaciones del sistema y los iconos del tray conservan su apariencia propia.
- Compilación TypeScript/Vite y Rust completada. Pendiente de revisión visual de todas las combinaciones, Guardar/Cancelar, reinicio y cambio de tema del sistema.

- Mostrar una vista previa al editar y permitir volver al tema predeterminado.
- Guardar la preferencia localmente y conservarla al actualizar.
- Mantener legibles textos, controles y estados. Los estados del tray deben seguir siendo reconocibles.

**Aceptación:** aplicar el tema en todas las secciones, conservarlo al reiniciar y permitir cancelar una edición sin alterar el tema guardado.

## 6. Qur'an (Corán)

**Estado:** lector implementado y [revisado en la app nativa de Linux](revision-lector-quran.md), incluida persistencia en dos reinicios reales. Incluido en v0.1.8; pendiente de revisión en Windows. [Uso, datos, contenido y condiciones](lector-quran.md).

**Investigación inicial completada (18 de octubre de 2026):** ver [fuentes, comparación y permisos](investigacion-fuentes-quran.md). Selección autorizada: árabe Tanzil Uthmani y versión digital de Bórnez publicada en Tanzil. La edición impresa de origen no está identificada; la app presenta la procedencia digital y conserva los términos no comerciales. Pendiente de revisión editorial. El usuario confirmó que la app es sin fines de lucro: se trabajará con el alcance no comercial de la traducción, manteniendo sus condiciones separadas de la licencia MIT del código.

**Solicitud:** incorporar el Qur'an a la app.

**Ubicación propuesta:** sección propia de lectura, fuera de las preferencias del sistema.

**Propuesta inicial:** lector con navegación por sura y aleya, texto árabe, traducción al español opcional, tamaño de texto, marcadores y última lectura. Priorizar lectura sin conexión una vez instalado el contenido.

**Implementación inicial:** 114 suras, texto árabe y español offline, tamaños de lectura, marcadores y última lectura en archivo separado. Corpus, avisos y fuente tipográfica suman unos 2,4 MiB antes de compresión. Recursos versionados y actualizados con la app; condiciones visibles y separadas de MIT. La [investigación de recitación en audio](investigacion-audio-quran.md), las descargas por sura y las opciones de búsqueda avanzada quedan como ampliaciones de la propuesta inicial. No generar ni reconstruir el texto religioso con IA.

**Aceptación:** contenido contrastado con su fuente, numeración consistente, presentación correcta del árabe, persistencia de marcadores y última lectura, y uso offline para el contenido instalado.

**Recitación en audio:** propuesta documentada en el [RDD de recitación del Qur’an](rdd-recitacion-quran.md), pendiente de implementación y sin versión asignada. Recomienda Parhizgar mediante Al Quran Cloud, primero reproducción por aleya y después descargas por sura. Incluye prioridad del Adhan y tonos, reanudación manual, control desde el tray y progreso de escucha separado de la lectura.

## Android experimental

**Estado:** adaptación inicial en desarrollo, sin release estable asignada. Ver [alcance, compilación y distribución experimental](android-experimental.md).

- Compartir cálculo local, registro, calendario, apariencia y lector offline.
- Adaptar la navegación y los controles para pantallas táctiles.
- Separar el arranque móvil del tray y usar almacenamiento privado de Android.
- Generar APK ARM64 y ARMv7 (32 bits) de prueba en un workflow propio, con prereleases experimentales separadas de las releases estables.
- Integración nativa experimental de AlarmManager, Adhan, tonos por rezo y preavisos implementada; pendiente validación de entregas reales en el J7, permisos y ahorro de batería.
- Firma experimental persistente y número de compilación creciente configurados en CI. Actualizador desde Sistema implementado con búsqueda, descarga compatible, verificación y apertura del instalador. Pendiente validación completa en el J7 y migración desde firmas anteriores.

## Orden sugerido

1. Próximo rezo entre días: corrección incluida en v0.1.8.
2. Ubicación mediante Google Maps: incluida en v0.1.8. Avisos discretos incluidos en v0.1.8; continuar con prueba manual de audio.
3. Calendario islámico y personalización de colores incluidos en v0.1.8. Continuar con revisión visual.
4. Lector del Qur'an revisado en Linux: repetir la revisión nativa en Windows antes de publicar.

El modo Ramadán continúa como propuesta documentada. MQTT/dispositivos continúa condicionado al hardware; estas solicitudes no cambian ese estado.
