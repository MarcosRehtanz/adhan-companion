# Avisos por rezo

Incluidos en v0.1.8. Pendiente de prueba manual de audio en Linux/Windows.

## Uso

En **Adhan y avisos** se muestran las preferencias de Fajr, Dhuhr, Asr, Maghrib e Isha. **Editar sonido y avisos** habilita los controles. Cada rezo puede usar:

- **Adhan:** conserva su grabación fija de la colección Doha.
- **Tono discreto:** Suave, Doble pulso o Campana, con duración independiente entre 1 y 10 segundos.
- **Solo notificación:** no reproduce audio de la app. El sonido del sistema depende de sus preferencias de notificaciones.

El volumen es compartido por todos los sonidos y es independiente del volumen del sistema. El preaviso sigue siendo una notificación independiente; 0 minutos lo desactiva.

**Probar** utiliza los valores que se ven, incluso antes de guardar. No guarda preferencias ni modifica el registro. **Detener sonido**, en la ventana o en el tray, detiene tanto el adhan como los tonos. **Cancelar** restaura las preferencias de la edición y detiene su sonido. **Guardar** aplica la configuración al core, que continúa funcionando con la ventana cerrada.

## Compatibilidad y funcionamiento

`audio.volume` y `audio.enabled` se conservan. El nuevo mapa `audio.alerts` contiene `mode` (`adhan`, `tone`, `notification`), `tone` (`soft`, `double`, `bell`) y `duration_secs` por clave de rezo en minúsculas. Si no hay una entrada nueva, `enabled=false` resuelve a solo notificación; el resto conserva el adhan. No se reescribe la configuración al iniciar.

Los tonos son originales y se sintetizan localmente como PCM mono a 22.05 kHz. No necesitan descargas. El motor comparte un único reproductor: una prueba sustituye al sonido anterior y la finalización de un sonido viejo no puede borrar el nuevo.

Al llegar el horario se conserva el registro de disparo `adhan` por compatibilidad con el historial, independientemente del modo. Solo marcar **Ya recé** registra el rezo realizado.

## Revisión manual pendiente

Probar los tres tonos, la duración, el volumen y la detención desde el tray. Comprobar Guardar/Cancelar, reinicio y un disparo con ventana cerrada. No se reprodujo audio ni se alteraron los horarios del sistema durante la implementación.
