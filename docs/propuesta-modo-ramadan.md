# Propuesta: modo Ramadán

**Estado:** borrador documentado; no implementado ni cerrado como decisión de producto.  
**Alcance:** definir el comportamiento inicial de los avisos de imsak e iftar en Adhan Companion.

## Objetivo

Durante Ramadán, hacer visibles los momentos relevantes para el ayuno usando los horarios que la app ya calcula para la ubicación y el método configurados. El modo debe ayudar a consultar y recordar esos horarios sin introducir un cálculo religioso independiente ni cambiar la agenda normal de los cinco rezos.

## Comportamiento propuesto

- **Fajr:** mostrar el horario de Fajr como referencia para el comienzo del ayuno, de acuerdo con el método de cálculo seleccionado.
- **Imsak:** ofrecer un aviso opcional antes de Fajr para señalar el final del suhur. El adelanto debe ser configurable y no debe presentarse como un horario universal ni como el comienzo obligatorio del ayuno.
- **Iftar:** mostrar un aviso y una cuenta regresiva asociados al horario de Maghrib que ya calcula la aplicación. No calcular un horario paralelo en esta primera versión.
- **Horarios de oración:** conservar sin cambios las cinco oraciones, el adhan, el registro y sus notificaciones normales.

## Presentación

En **Hoy**, cuando el modo esté activo, añadir una tarjeta de Ramadán con:

1. **Imsak / fin del suhur**, con hora y, si el usuario lo desea, aviso previo.
2. **Fajr / comienzo del ayuno**, claramente separado del aviso de imsak.
3. **Iftar**, vinculado al horario de Maghrib configurado.

La vista no debe dar a entender que imsak es una sexta oración ni que la hora de Fajr se modificó. Los avisos propios del modo se deben poder activar y desactivar sin silenciar los adhanes habituales.

## Reglas y límites

- Reutilizar Fajr y Maghrib del `Schedule` actual; no añadir un segundo motor astronómico.
- Hacer explícito el método activo al mostrar las horas. La relación entre Maghrib e iftar puede variar según el criterio de cálculo elegido; el modo no debe reemplazarlo silenciosamente por una definición distinta de puesta de sol.
- El calendario lunar y la observancia de Ramadán pueden variar por comunidad o autoridad local. No asumir una fecha global ni activar el modo automáticamente sin una decisión específica.
- Mantener el cálculo local. Una eventual sugerencia de fechas no debe convertirse en dependencia de red para calcular horarios.

## Decisiones pendientes

1. **Activación:** interruptor manual, fechas configurables, o ambos. Para una primera versión se recomienda activación manual y visible.
2. **Adelanto de imsak:** valor por defecto y rango permitido. Debe ser optativo y describirse como recordatorio previo a Fajr; no elegir un margen como regla universal.
3. **Aviso de iftar:** si se usa exactamente Maghrib del método activo y si el aviso se integra con la notificación normal de Maghrib o se ofrece como recordatorio adicional.
4. **Método Jafari:** confirmar qué horario ya configurado debe representar Iftar y cómo explicarlo en la interfaz, sin inferir una regla ritual nueva.
5. **Período del modo:** cómo empieza y termina el modo en el calendario local cuando la fecha de Ramadán depende de observación o decisión comunitaria.

## Referencia de significado

El Corán 2:187 describe comer y beber hasta que se distinga el alba y completar el ayuno hasta la noche. Por eso la interfaz debe distinguir Fajr del aviso opcional previo. Dar al-Ifta de Egipto también documenta que algunos calendarios adelantan imsak varios minutos, pero cuestiona tratar ese adelanto como el inicio del ayuno.

- [Al-Baqarah 2:187](https://legacy.quran.com/2/185-187)
- [Dar al-Ifta de Egipto: The beginning of the fasting hours](https://www.dar-alifta.org/en/fatwa/details/8075/the-beginning-of-the-fasting-hours)
- Nota local del vault Islam: `08 Práctica/Ramadán.md`.

Estas referencias dan contexto para la terminología; no resuelven qué criterio debe adoptar la app para todas las comunidades.

## Relación con el roadmap

El roadmap de v1.1 menciona «modo Ramadán (imsak/iftar)». Esta nota concreta una primera propuesta de alcance y deja explícitas las decisiones que deben cerrarse antes de implementarla. Para la arquitectura general de la interfaz, ver [propuesta de arquitectura de información](propuesta-arquitectura-informacion.md).
