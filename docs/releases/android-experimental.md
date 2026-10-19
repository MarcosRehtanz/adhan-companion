# Android experimental

Edición de prueba para teléfonos Android ARM de 32 y 64 bits, basada en v0.1.8. Requiere Android 7.0 o posterior según la configuración de compilación; la revisión funcional en un teléfono real sigue pendiente.

## Incluye

- Interfaz móvil con menú de secciones, controles táctiles y formularios adaptados.
- Menú hamburguesa siempre visible en Android, sin sidebar de escritorio, y CSS compilado con reglas `max-width` para WebViews anteriores a Chromium 104.
- Cálculo local de horarios y próximo rezo mediante PrayTimes C.
- Registro manual, calendario islámico con ajuste y personalización de colores.
- Lector del Qur’an offline con marcadores y punto de lectura.
- Adhan, tonos discretos por rezo y preavisos con integración nativa experimental. Activación y permisos en **Adhan y avisos**; audio con acción **Detener** en la notificación.
- Reprogramación al reiniciar o cambiar hora, zona y configuración, reutilizando PrayTimes C.
- Datos privados e identidad separados de una futura edición estable.

## Descarga e instalación

En **Assets**, descargar el archivo `.apk` y pasarlo al teléfono para instalarlo. Android puede solicitar autorización para instalar desde esa fuente. `SHA256SUMS` contiene el checksum del APK y `LEEME.md` describe el alcance experimental.

| Archivo | Arquitectura |
| --- | --- |
| `…-armv7-….apk` | Android ARM de 32 bits (`armeabi-v7a`). Probar esta variante en el J7 reportado, pendiente de confirmar su modelo y arquitectura. |
| `…-arm64-….apk` | Android ARM de 64 bits (`arm64-v8a`). |

Los paquetes eliminan los símbolos nativos de depuración al empaquetar para reducir el tamaño de descarga y el espacio de instalación. Android 8.1 cumple el mínimo de versión, pero también debe coincidir la arquitectura del sistema. El mensaje «No se instaló la aplicación» es genérico y no confirma por sí solo una incompatibilidad de arquitectura.

Los avisos empiezan **desactivados**: revisá ubicación y horarios, permití notificaciones y alarmas exactas cuando corresponda y pulsá **Activar avisos**. Probá el audio antes de depender de los avisos. Su funcionamiento con pantalla apagada y ahorro de batería está pendiente de validar en el J7. Todavía no incluye recitación del Qur’an en audio. Los datos no se sincronizan con el escritorio.

Los APK de esta versión usan una **firma experimental persistente**, compartida por ARMv7 y ARM64, y un número de compilación creciente. Las próximas versiones firmadas con esta misma clave podrán actualizar la instalación sin desinstalar. La descarga e instalación desde la app todavía están pendientes.

Las versiones anteriores, incluida `1c7dc94`, usaron otras claves de prueba: esta firma nueva no permite actualizar sobre ellas automáticamente. **No desinstalar una copia con datos importantes como solución automática**, porque puede eliminar sus datos locales. Conservar la copia hasta resolver su migración.

La distribución estable de Linux y Windows continúa en su propia release.
