# Calendario islámico

Incluido en v0.1.8. Pendiente de revisión visual y comparación con el calendario de la comunidad.

**Decisión del usuario del 18 de octubre de 2026:** conservar por ahora el calendario tabular civil con ajuste manual. La integración con una autoridad o comunidad chií queda pendiente; no se ha elegido un marŷaʿ ni una fuente regional.

## Uso

**Hoy** muestra la fecha islámica junto a la fecha civil. **Calendario islámico** permite navegar por meses y años, volver a hoy y seleccionar una fecha para ver su correspondencia civil completa. El número grande corresponde al día islámico; debajo aparece el día/mes civil. El borde identifica hoy y el fondo identifica la selección.

**Criterio del calendario → Editar ajuste** permite desplazar la fecha islámica entre −2 y +2 días. +1 muestra la fecha islámica del día siguiente para la misma fecha civil. La cuadrícula aplica la transformación inversa para mantener ambas fechas consistentes. **Guardar** persiste el ajuste y **Cancelar** restaura el anterior.

## Criterio

Calendario tabular civil (`islamic-civil`), época gregoriana 622-07-19. Alterna meses de 30/29 días; el mes 12 tiene 30 días en los años intercalares 2, 5, 7, 10, 13, 16, 18, 21, 24, 26 y 29 de cada ciclo de 30 años. Implementación aritmética local, sin red ni dependencia del soporte de calendarios del WebView.

Referencias primarias: [tipos de cálculo de Unicode ICU](https://unicode-org.github.io/icu-docs/apidoc/released/icu4j/com/ibm/icu/util/IslamicCalendar.CalculationType.html) y [época y reglas en ICU](https://github.com/unicode-org/icu/blob/main/icu4j/main/core/src/main/java/com/ibm/icu/util/IslamicCalendar.java). Se consultó también la nota de Ramadán del vault de dominio.

La consulta cambia a medianoche de la zona local del sistema, como la fecha civil del scheduler. No implementa cambio de día al ocaso ni observación de la luna. La pantalla indica este criterio y la posible diferencia respecto del calendario de la comunidad. No se determinan automáticamente Ramadán ni las festividades.

`calendar.adjustment_days` se guarda en la configuración existente, con 0 como valor predeterminado y validación en el core. No modifica los horarios de rezo, las fechas del registro, las rachas ni el scheduler. No se activa el modo Ramadán.

## Alcance

Navegación del año 1 al 3000 H. La conversión usa enteros de días y fechas UTC como representación de fechas civiles; no convierte horarios ni depende del horario de verano. La fecha de hoy se toma del scheduler, no de UTC.

Compilación TypeScript/Vite y Rust completada. Quedan pendientes la revisión visual y la comparación manual con el calendario de la comunidad del usuario.


## Relación con una referencia religiosa chií

El calendario implementado no representa un calendario oficial de una autoridad religiosa ni debe describirse como el más aceptado entre los chiíes. Para el chiismo duodecimano, elegir una referencia requiere conocer el marŷaʿ seguido por el usuario y el criterio aplicable a su región.

Según la [oficina de Sistani](https://www.sistani.org/english/qa/01266/), el comienzo del mes se establece mediante el avistamiento del creciente, testimonios u otras pruebas admitidas que produzcan certeza, o al completar treinta días del mes anterior. El alcance de un avistamiento depende también de la compatibilidad de los horizontes de las localidades. La conversión tabular de la app no implementa esas condiciones.

Existen diferencias entre autoridades chiíes sobre el alcance geográfico de los avistamientos. El [Consejo de eruditos chiíes de Norteamérica](https://www.imams.us/principles/) explica los criterios de distintas autoridades, incluido Sistani. Sus anuncios regionales no deben aplicarse automáticamente a Argentina u otra ubicación.

[Umm al-Qura](https://www.ummulqura.org.sa/en) es el calendario oficial de Arabia Saudita. Adoptarlo no resolvería por sí mismo la correspondencia con la autoridad o comunidad chií del usuario. Tampoco debe confundirse la selección de un calendario con el método de cálculo de los horarios de rezo: son preferencias independientes.

### Límites del ajuste manual

El ajuste actual es un desplazamiento global y persistente de la fecha mostrada. Puede alinear el mes actual con el calendario de la comunidad, pero la diferencia puede cambiar en otro mes. No sincroniza anuncios, no confirma avistamientos y no conserva un historial de comienzos de mes: cambiarlo modifica también la correspondencia mostrada para fechas pasadas y futuras. No modifica el registro civil de rezos.

La consulta avanza a medianoche local. Un eventual cambio de día religioso al ocaso requiere una decisión e implementación separadas; actualmente no se utiliza el horario de Maghrib para avanzar la fecha islámica.

## Comprobación de la conversión

El 18 de octubre de 2026 se compararon las 73.414 fechas civiles del período 1900–2100 inclusive con `Intl.DateTimeFormat` usando explícitamente `islamic-civil`: no hubo diferencias. Además, se comprobaron 367.070 conversiones de ida y vuelta para los cinco ajustes permitidos, sin errores.

Estas comprobaciones verifican la concordancia aritmética con ese método y la reversibilidad del ajuste. No validan el calendario contra anuncios religiosos ni prueban la interfaz nativa.

Ejemplo sin ajuste: el 18 de octubre de 2026 corresponde al 6 de Jumada al-awwal de 1448 en el tabular civil y al 7 en Umm al-Qura, según la comparación con `Intl` para ambos métodos. Es un ejemplo de diferencia entre cálculos; no confirma qué fecha corresponde a la comunidad del usuario.

## Trabajo futuro para seguir una autoridad o comunidad

Antes de implementar la integración:

1. Acordar el marŷaʿ o la comunidad de referencia y la región aplicable. No inferirlos por el método de rezo seleccionado.
2. Identificar una fuente autorizada de anuncios y comprobar su alcance geográfico, acceso y condiciones de reutilización.
3. Distinguir en pantalla las fechas calculadas de los comienzos de mes confirmados, mostrando fuente, región y fecha de actualización.
4. Diseñar confirmaciones por mes, con su procedencia e historial, para que una corrección no desplace indiscriminadamente todos los meses.
5. Acordar el cambio de día a medianoche u ocaso y su relación con la ubicación, preservando las fechas civiles del registro y del scheduler.
6. Definir el funcionamiento offline, los anuncios pendientes y cómo resolver discrepancias o correcciones de la fuente.
7. Contrastar fechas y límites de mes con la referencia elegida antes de utilizarlos para Ramadán o festividades.

Esta lista documenta una ampliación futura. La decisión vigente es mantener el cálculo local y el ajuste manual.
