# Android experimental

Edición de prueba para teléfonos Android ARM de 32 y 64 bits, basada en v0.1.8. Requiere Android 7.0 o posterior según la configuración de compilación; incluye comprobaciones reales de actualización y avisos en un Samsung J7 SM-J710MN con Android 8.1, descritas en `docs/android-experimental.md`.

## Compilación para comprobar el actualizador

Esta publicación proporciona una compilación superior a **10017** para ensayar la búsqueda, descarga e instalación desde el J7. Mantiene la identidad y la firma persistente y no cambia el esquema de los datos. Antes del ensayo, conservar un respaldo y confirmar el número instalado; no desinstalar como parte de una actualización normal.

## Incluye

- Interfaz móvil con menú de secciones, controles táctiles y formularios adaptados.
- Menú hamburguesa siempre visible en Android, sin sidebar de escritorio, y CSS compilado con reglas `max-width` para WebViews anteriores a Chromium 104.
- Cálculo local de horarios y próximo rezo mediante PrayTimes C.
- Registro manual, calendario islámico con ajuste y personalización de colores.
- Lector del Qur’an offline con marcadores y punto de lectura.
- Adhan, tonos discretos por rezo y preavisos con integración nativa experimental. Activación y permisos en **Adhan y avisos**; audio con acción **Detener** en la notificación.
- Reprogramación al reiniciar o cambiar hora, zona y configuración, reutilizando PrayTimes C.
- Actualizador en **Sistema → Actualizaciones**: búsqueda del canal experimental, descarga compatible con progreso/cancelación, verificación del paquete y apertura del instalador de Android.
- Datos privados e identidad separados de una futura edición estable.

## Descarga e instalación

En **Assets**, descargar el archivo `.apk` y pasarlo al teléfono para instalarlo. Android puede solicitar autorización para instalar desde esa fuente. `SHA256SUMS` contiene el checksum del APK y `LEEME.md` describe el alcance experimental.

| Archivo | Arquitectura |
| --- | --- |
| `…-armv7-….apk` | Android ARM de 32 bits (`armeabi-v7a`). Variante instalada y comprobada en el J7 SM-J710MN con Android 8.1. |
| `…-arm64-….apk` | Android ARM de 64 bits (`arm64-v8a`). |

Los paquetes eliminan los símbolos nativos de depuración al empaquetar para reducir el tamaño de descarga y el espacio de instalación. Android 8.1 cumple el mínimo de versión, pero también debe coincidir la arquitectura del sistema. El mensaje «No se instaló la aplicación» es genérico y no confirma por sí solo una incompatibilidad de arquitectura.

Los avisos empiezan **desactivados**: revisá ubicación y horarios, permití notificaciones y alarmas exactas cuando corresponda y pulsá **Activar avisos**. Probá el audio antes de depender de los avisos. El preaviso y el Adhan de Maghrib se escucharon en el J7 SM-J710MN con pantalla apagada, sin USB y ahorro de energía activo (compilación 10018, 19/10/2026). Esta prueba cubre ese ciclo; Doze profundo y otros modos de ahorro no se comprobaron. Todavía no incluye recitación del Qur’an en audio. Los datos no se sincronizan con el escritorio.

Los APK de esta versión usan una **firma experimental persistente**, compartida por ARMv7 y ARM64, y un número de compilación creciente. Las próximas versiones firmadas con esta misma clave podrán actualizar la instalación sin desinstalar. Esta versión permite buscar y descargar actualizaciones desde la app y abrir el instalador de Android para confirmarlas. Para obtener por primera vez este actualizador, instalá este APK desde GitHub sobre la edición que ya usa firma persistente. El flujo 10017 → 10018 se comprobó en el J7 con configuración y estado del lector conservados; la configuración, el estado del lector y las preferencias de avisos también se conservaron después de reiniciar el teléfono.

Las versiones anteriores, incluida `1c7dc94`, usaron otras claves de prueba: esta firma nueva no permite actualizar sobre ellas automáticamente. **No desinstalar una copia con datos importantes como solución automática**, porque puede eliminar sus datos locales. Conservar la copia hasta resolver su migración.

La distribución estable de Linux y Windows continúa en su propia release.
