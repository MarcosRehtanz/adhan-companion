# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### En desarrollo
- Modo Ramadán (cálculo de Imsak e Iftar, ajustes litúrgicos).
- Conexión MQTT con el nodo de hardware ESP32.
- Soporte extendido para macOS e iOS.

---

## [v0.1.26] - 2026-11-15

### Añadido
- **Ganchos personalizados en el instalador y desinstalador de Windows (NSIS):** incorporación de `src-tauri/windows/hooks.nsh` con la macro `KillAdhanCompanion` ejecutada en `.onInit` y `un.onInit` (`taskkill /F /IM ... /T`), resolviendo de raíz el bloqueo *"Failed to kill Adhan Companion"* al actualizar o desinstalar la app tray-first en Windows.
- **Suite de verificación de ciclo de vida en CI:** nuevo paso automatizado en `.github/workflows/release.yml` sobre runners reales `windows-2025-vs2026` que valida instalación limpia, actualización sobre proceso activo y desinstalación completa sin dejar residuos.
- Ver [notas completas de la versión v0.1.26](docs/releases/v0.1.26.md).

---

## [v0.1.25] - 2026-11-14

### Añadido
- **Reloj en tiempo real (`TextClock`) en widgets de Android:** integración del reloj del sistema en las cabeceras de los widgets 4×2 y 4×1 con cero impacto en la batería.
- **Actualización automática periódica y configurable:** nueva estructura `WidgetConfig` con intervalos de 1 min, 5 min, 15 min o inteligente, y alarmas RTC exactas con `AlarmManager`.
- **Nuevo panel «Widgets de inicio»:** pantalla en configuración para personalizar frecuencia y visualización del reloj con persistencia y sincronización.
- **Previsualizaciones en el selector de widgets:** recursos PNG en todas las densidades de pantalla (`mdpi` a `xxxhdpi`) y `previewLayout`.
- **Corrección de recorte vertical en Android:** pesos flexibles (`layout_weight="1"`) y espaciados optimizados para evitar cortes en pantallas compactas.
- Ver [notas completas de la versión v0.1.25](docs/releases/v0.1.25.md).

---

## [v0.1.24] - 2026-11-13

### Añadido
- **Ubicación de alta precisión por GPS nativo en Android y desktop:** lectura directa de coordenadas geográficas mediante APIs nativas de geolocalización.
- **Geocodificación inversa automática:** resolución del nombre de localidad sin requerir servicios de pago de terceros.
- Ver [notas completas de la versión v0.1.24](docs/releases/v0.1.24.md).

---

## [v0.1.23] - 2026-11-13

### Añadido
- **Widgets solares nativos para la pantalla de inicio en Android:** widget completo (4×2) con representación del arco solar y tiempos restantes, y widget compacto (4×1).
- **Logotipo oficial integrado:** incorporación de la identidad visual oficial en lanzadores y sistema operativo.
- Ver [notas completas de la versión v0.1.23](docs/releases/v0.1.23.md).

---

## [v0.1.22] - 2026-11-12

### Corregido
- **Flujo de autenticación OAuth en Android:** corrección de verificación de certificados raíz con `webpki-roots`, estabilización del intercambio de tokens y eliminación del bucle de redirección en navegadores móviles.
- Ver [notas completas de la versión v0.1.22](docs/releases/v0.1.22.md).

---

## [v0.1.21] - 2026-11-09

### Corregido
- Robustez en la autorización de Google Drive en Android 14 (validación de parámetro `state` y gestión de intents de retorno).
- Ver [notas completas de la versión v0.1.21](docs/releases/v0.1.21.md).

---

## [v0.1.20] - 2026-11-08

### Añadido
- **Sincronización automática periódica en segundo plano con Google Drive:** respaldo diferido con guard atómico `EnVuelo` y debounce de 90 segundos entre plataformas.
- Ver [notas completas de la versión v0.1.20](docs/releases/v0.1.20.md).

---

## [v0.1.19] - 2026-11-02

### Mejorado
- Unificación del esquema de credenciales OAuth de Google Drive entre Android y escritorio mediante `build.rs`.
- Ver [notas completas de la versión v0.1.19](docs/releases/v0.1.19.md).

---

## [v0.1.18] - 2026-11-02

### Añadido
- **Respaldo y sincronización con Google Drive en Android (Wave 2):** módulo central desacoplado `sync_core.rs` (1.476 líneas) con fusión en tres vías de configuración, unión append-only del registro de rezos por timestamp y respaldo en `appDataFolder`.
- Ver [notas completas de la versión v0.1.18](docs/releases/v0.1.18.md).

---

## [v0.1.17] - 2026-10-27

### Añadido
- **Consentimiento de permisos guiado en Android:** interfaz explicativa para permisos de notificaciones y alarmas exactas (`SCHEDULE_EXACT_ALARM`).
- Ver [notas completas de la versión v0.1.17](docs/releases/v0.1.17.md).

---

## [v0.1.16] - 2026-10-25

### Añadido
- **Seguimiento y acompañamiento de rezos:**
  - Recordatorio «¿Ya rezaste X?» configurable de 5 a 120 minutos tras el inicio del rezo si no ha sido marcado.
  - Pausa de avisos temporal de 1 a 60 días para viajes o circunstancias personales.
  - Guía completa de la salat con fórmulas en árabe, transliteración y traducción al español.
- Ver [notas completas de la versión v0.1.16](docs/releases/v0.1.16.md).

---

## [v0.1.15] - 2026-10-22

### Mejorado
- Optimización de latencia: el marcado de rezos responde de forma inmediata en la interfaz mientras se confirma la persistencia en el core.
- Ver [notas completas de la versión v0.1.15](docs/releases/v0.1.15.md).

---

## [v0.1.14] - 2026-10-21

### Añadido
- Nuevo panel de lectura en el lector del Qur'an con ajuste de tamaño tipográfico e idioma (árabe, español o ambos).
- Ver [notas completas de la versión v0.1.14](docs/releases/v0.1.14.md).

---

## [v0.1.13] - 2026-10-21

### Mejorado
- Rediseño responsivo unificado para pantallas táctiles de escritorio y dispositivos móviles: barra inferior en pantallas de hasta 720px y barra lateral en escritorio.
- Ver [notas completas de la versión v0.1.13](docs/releases/v0.1.13.md).

---

## [v0.1.12] - 2026-10-21

### Añadido
- Actualizador integrado desde la interfaz para Windows (ejecución de setup con `/P /UPDATE /R`) y Linux (`pkexec apt-get install` verificando `SHA256SUMS`).
- Ver [notas completas de la versión v0.1.12](docs/releases/v0.1.12.md).

---

## [v0.1.11] - 2026-10-21

### Añadido
- Recitación del Qur'an de Shahriar Parhizgar en Android con servicio en segundo plano `QuranPlayer.kt`, control de notificaciones y detención previa a la llamada al Adhan.
- Ver [notas completas de la versión v0.1.11](docs/releases/v0.1.11.md).

---

## [v0.1.10] - 2026-10-20

### Corregido
- Resolución de enlaces cortos de Google Maps en Android sin requerir curl.
- Mayor precisión del pin respecto al centro del mapa.
- Presentación oficial de la versión para Android.
- Ver [notas completas de la versión v0.1.10](docs/releases/v0.1.10.md).

---

## [v0.1.9] - 2026-10-20

### Añadido
- Recitación de Parhizgar para Linux y Windows con descarga de suras sin conexión.
- Publicación de los primeros APKs oficiales ARMv7 y ARM64 firmados en modo release.
- Ver [notas completas de la versión v0.1.9](docs/releases/v0.1.9.md).

---

## [v0.1.8] - 2026-10-18

### Añadido
- Próximo rezo nocturno: avance continuo hacia el Fajr del día siguiente tras Isha.
- Importación de ubicación por enlaces de Google Maps.
- Avisos discretos por rezo (adhan o tonos breves).
- Calendario islámico tabular con ajuste de fecha hijri.
- Lector del Corán offline con traducción al español y fuentes árabes.
- Ver [notas completas de la versión v0.1.8](docs/releases/v0.1.8.md).

---

## [v0.1.7] - 2026-10-18

### Añadido
- Rediseño de la interfaz en secciones: Hoy, Horarios, Adhan y avisos, Registro y Sistema.
- Primer instalador empaquetado para Windows (NSIS).
- Ver [notas completas de la versión v0.1.7](docs/releases/v0.1.7.md).

[Unreleased]: https://github.com/MarcosRehtanz/adhan-companion/compare/v0.1.26...HEAD
[v0.1.26]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.26
[v0.1.25]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.25
[v0.1.24]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.24
[v0.1.23]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.23
[v0.1.22]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.22
[v0.1.21]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.21
[v0.1.20]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.20
[v0.1.19]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.19
[v0.1.18]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.18
[v0.1.17]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.17
[v0.1.16]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.16
[v0.1.15]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.15
[v0.1.14]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.14
[v0.1.13]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.13
[v0.1.12]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.12
[v0.1.11]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.11
[v0.1.10]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.10
[v0.1.9]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.9
[v0.1.8]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.8
[v0.1.7]: https://github.com/MarcosRehtanz/adhan-companion/releases/tag/v0.1.7
