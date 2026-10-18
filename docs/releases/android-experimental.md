# Android experimental

Primera edición de prueba para teléfonos Android ARM64, basada en v0.1.8. Requiere Android 7.0 o posterior según la configuración de compilación; la revisión funcional en un teléfono real sigue pendiente.

## Incluye

- Interfaz móvil con menú de secciones, controles táctiles y formularios adaptados.
- Cálculo local de horarios y próximo rezo mediante PrayTimes C.
- Registro manual, calendario islámico con ajuste y personalización de colores.
- Lector del Qur’an offline con marcadores y punto de lectura.
- Datos privados e identidad separados de una futura edición estable.

## Descarga e instalación

En **Assets**, descargar el archivo `.apk` y pasarlo al teléfono para instalarlo. Android puede solicitar autorización para instalar desde esa fuente. `SHA256SUMS` contiene el checksum del APK y `LEEME.md` describe el alcance experimental.

Esta edición **no emite Adhan, tonos ni preavisos automáticos** y todavía no incluye recitación del Qur’an en audio. Los datos no se sincronizan con el escritorio.

El APK utiliza una firma de desarrollo que puede variar entre compilaciones. Una firma diferente puede impedir instalar sobre otra copia experimental. No desinstalar una copia con datos importantes como solución automática: desinstalar puede eliminar sus datos locales. La firma persistente y las actualizaciones que conserven datos siguen pendientes.

La distribución estable de Linux y Windows continúa en su propia release.
