# Guía de contribución a Adhan Companion

¡Gracias por tu interés en contribuir a **Adhan Companion**! Este proyecto es un compañero diario de rezo respetuoso, de código abierto, *local-first* y enfocado en la privacidad para **Linux, Windows, Android** y en camino a **macOS e iOS**, acompañado por su sitio web oficial.

---

## Índice

1. [Filosofía y principios del proyecto](#filosofía-y-principios-del-proyecto)
2. [Estructura del repositorio](#estructura-del-repositorio)
3. [Configuración del entorno de desarrollo](#configuración-del-entorno-de-desarrollo)
   - [Linux (Ubuntu / Debian / Fedora / Arch)](#1-linux)
   - [Windows (10 / 11)](#2-windows)
   - [macOS](#3-macos)
   - [Android (móvil)](#4-android)
   - [iOS (móvil)](#5-ios)
4. [Desarrollo de la aplicación](#desarrollo-de-la-aplicación)
5. [Desarrollo del sitio web (`website/`)](#desarrollo-del-sitio-web-website)
6. [Reglas de arquitectura y diseño de interfaz](#reglas-de-arquitectura-y-diseño-de-interfaz)
7. [Documentación de cambios y Changelog](#documentación-de-cambios-y-changelog)
8. [Verificaciones antes de enviar un Pull Request](#verificaciones-antes-de-enviar-un-pull-request)
9. [Flujo de Git y convenciones de commits](#flujo-de-git-y-convenciones-de-commits)

---

## Filosofía y principios del proyecto

* **Local-first y privacidad:** El cálculo de los horarios de rezo, la qibla, el calendario islámico y el seguimiento se realizan 100% de manera local mediante el motor astronómico PrayTimes en C (FFI) compartido con firmware embebido (ESP32). No hay servidores intermedios, rastreadores ni telemetría.
* **Tray-first:** En escritorio (Linux y Windows), la bandeja del sistema (tray) *es* la aplicación. La ventana es solo una interfaz de configuración y consulta que puede abrirse o cerrarse sin interrumpir el scheduler ni las alarmas.
* **Respeto litúrgico y de fuentes:** Todo lo relativo a nombres de rezos, adhan, rito y textos del Corán se rige por fuentes académicas e islámicas verificadas (ver `docs/` y notas de investigación en el proyecto).

---

## Estructura del repositorio

```text
├── src/                 # Frontend de la aplicación (React 19 + TypeScript + Vite)
├── src-tauri/           # Core nativo en Rust (Tauri 2): tray, scheduler, audio, FFI
│   ├── src/             # Módulos Rust (scheduler, audio, config, registro, sync)
│   ├── praytimes/       # Motor de cálculo PrayTimes en C embebido
│   ├── capabilities/    # Permisos de comunicación frontend → core en Tauri 2
│   ├── windows/         # Ganchos NSIS para el instalador de Windows
│   └── gen/android/     # Proyecto nativo Android (Kotlin, AlarmManager, Widgets)
├── website/             # Sitio web oficial estático (HTML5, CSS, JS, SEO)
├── docs/                # Documentación técnica, estados, maquetas y notas de versión
│   └── releases/        # Notas detalladas por versión (vX.Y.Z.md)
├── scripts/             # Scripts Node.js y Python de preparación, verificación y release
└── public/              # Recursos estáticos de la aplicación (Qur'an offline, audio)
```

---

## Configuración del entorno de desarrollo

Prerrequisito común en todos los entornos:
* **Node.js:** Versión LTS 20 o superior.
* **pnpm:** Gestor de paquetes (`npm install -g pnpm` o `corepack enable pnpm`).
* **Rust:** Toolchain estable (`rustup default stable`).

---

### 1. Linux

#### Paquetes del sistema (Ubuntu / Debian):
```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  pkg-config \
  libasound2-dev \
  build-essential \
  curl
```

*(En Fedora: `webkit2gtk4.1-devel gtk3-devel libayatana-appindicator-devel librsvg2-devel alsa-lib-devel`)*

#### Puesta en marcha:
```bash
# 1. Instalar dependencias del frontend
pnpm install

# 2. Levantar la aplicación con recarga en vivo
pnpm tauri dev
```

> [!NOTE]
> En shells no interactivos, asegurate de que `cargo` esté en tu PATH: `source ~/.cargo/env` o `export PATH="$HOME/.cargo/bin:$PATH"`.

---

### 2. Windows

#### Prerrequisitos:
1. **Visual Studio C++ Build Tools:**
   - Descargá el instalador de [Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
   - Durante la instalación, seleccioná la carga de trabajo: **«Desarrollo para el escritorio con C++»** (*Desktop development with C++*).
2. **Rust con toolchain MSVC:**
   - Si no lo tenés, ejecutá en PowerShell:
     ```powershell
     rustup default stable-x86_64-pc-windows-msvc
     ```
3. **WebView2 Runtime:** Viene instalado por defecto en Windows 10 y 11.

#### Puesta en marcha (PowerShell):
```powershell
# 1. Instalar dependencias
pnpm install

# 2. Ejecutar entorno de desarrollo
pnpm tauri dev

# 3. Compilar instalador NSIS (.exe)
pnpm tauri build --bundles nsis
```

> [!IMPORTANT]
> **Gotcha de Windows (Tray-first):**
> Adhan Companion intercepta el evento de cierre de ventana para ocultarse en la bandeja del sistema (junto al reloj). Si cerrás la ventana, el proceso `adhan-companion.exe` sigue en ejecución. Para reiniciar el entorno dev o compilar, salí desde el ícono del tray (**Salir**) o ejecutá:
> ```powershell
> taskkill /F /IM adhan-companion.exe
> ```

---

### 3. macOS

#### Prerrequisitos:
1. **Xcode Command Line Tools:**
   ```bash
   xcode-select --install
   ```
2. **Toolchain de Rust:**
   ```bash
   rustup default stable-aarch64-apple-darwin   # Para Apple Silicon (M1/M2/M3)
   # o bien:
   rustup default stable-x86_64-apple-darwin    # Para procesadores Intel
   ```

#### Puesta en marcha:
```bash
pnpm install
pnpm tauri dev
```

*(El tray y WebKit funcionan sobre las APIs nativas de macOS a través de Tauri 2).*

---

### 4. Android

Adhan Companion incluye una integración nativa en Android con alarmas exactas (`AlarmManager`), recitación del Corán en segundo plano, widgets en la pantalla de inicio y actualización integrada sin Google Play Services.

#### Prerrequisitos:
1. **Java Development Kit (JDK):** Versión 21 recomendada (`openjdk-21-jdk`).
2. **Android Studio / SDK & NDK:**
   - Android SDK Platform 34 o 35.
   - Android NDK (versión r26 o superior).
   - Variables de entorno configuradas:
     ```bash
     export ANDROID_HOME="$HOME/Android/Sdk"
     export NDK_HOME="$ANDROID_HOME/ndk/<versión>"
     export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
     ```
3. **Targets de Rust para Android:**
   ```bash
   rustup target add aarch64-linux-android      # 64-bit (dispositivos modernos)
   rustup target add armv7-linux-androideabi    # 32-bit (dispositivos clásicos)
   ```

#### Comandos de desarrollo móvil:
```bash
# Compilar APK de depuración para ARM64
pnpm tauri android build --debug --apk --target aarch64

# Compilar APK de depuración para ARMv7
pnpm tauri android build --debug --apk --target armv7

# Ejecutar directamente en dispositivo conectado por ADB o emulador
pnpm tauri android dev
```

> [!TIP]
> Para más detalles sobre la arquitectura móvil, consultá [`docs/android-experimental.md`](docs/android-experimental.md).

---

### 5. iOS

Adhan Companion está preparado para la arquitectura móvil de Tauri 2. Para trabajar en la variante de iOS:
1. Requiere un equipo con **macOS** y **Xcode 15+**.
2. Instalar targets de Rust:
   ```bash
   rustup target add aarch64-apple-ios
   rustup target add aarch64-apple-ios-sim
   ```
3. Ejecutar:
   ```bash
   pnpm tauri ios init
   pnpm tauri ios dev
   ```

---

## Desarrollo de la aplicación

### Ejecutar solo el frontend web (Iteración rápida de UI)

Si estás trabajando en estilos, maquetación o componentes React que no requieren llamadas FFI al core de Rust, podés levantar exclusivamente el servidor Vite:

```bash
pnpm dev
```
Abrirá `http://localhost:1420` en tu navegador habitual con recarga ultrarrápida.

### Ejecutar la aplicación completa (Frontend + Rust Core)

```bash
pnpm tauri dev
```

### Ejecutar las pruebas del Core

El core en Rust cuenta con pruebas unitarias, de paridad litúrgica contra alAdhan y de cálculo de Qibla:

```bash
cd src-tauri && cargo test
# O desde la raíz:
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Desarrollo del sitio web (`website/`)

El sitio web oficial de Adhan Companion reside en el directorio `website/`. Es un desarrollo estático optimizado para SEO, carga instantánea y compatibilidad universal:

* `website/index.html`: Página principal con descarga automática según sistema operativo y presentación de funcionalidades.
* `website/style.css`: Estilos modernos con paleta sobria, modo oscuro y adaptable a móviles.
* `website/releases.js`: Lógica ligera del lado del cliente que consulta la última versión disponible en GitHub API y actualiza los enlaces de descarga.
* `website/latest-release.json`: Índice de enlaces estáticos generado en cada versión para navegadores con JavaScript deshabilitado.

### Probar el sitio web localmente:
Podés servir la carpeta con cualquier servidor estático:
```bash
npx serve website
# O con Python:
python3 -m http.server 8080 --directory website
```

### Sincronizar el sitio web con una nueva versión:
Cuando se lanza o prepara una versión, ejecutá:
```bash
node scripts/prepare-website.mjs
```
Este script actualiza automáticamente `website/latest-release.json` y los enlaces estáticos de descarga dentro de `website/index.html`.

---

## Reglas de arquitectura y diseño de interfaz

Todo colaborador debe seguir estos principios de diseño aprobados para el proyecto:

### 1. Regla de oro de estados de interfaz
> **Cada apartado nuevo o modificado debe analizar y manejar explícitamente sus estados antes de diseñar las acciones de la interfaz.**

Para cualquier componente o flujo, contemplar siempre:
1. **Consulta inicial / Carga:** No asumir vacío antes de que el core responda.
2. **Disponible / Reposo:** Mostrar únicamente las acciones válidas en ese estado.
3. **Operación en curso:** Indicar progreso y bloquear acciones duplicadas o incompatibles.
4. **Éxito:** Confirmado por el core; nunca mostrar éxito prematuramente.
5. **Cancelación / Parcial:** Permitir reanudar o completar si corresponde.
6. **Error:** Explicar el motivo del error y permitir reintentar sin perder borradores.

### 2. Formularios en modo Lectura / Edición
Las pantallas de preferencias y ajustes se presentan inicialmente en **modo lectura**, con botones para **Editar**, **Guardar** y **Cancelar**. Si el guardado falla, se conservan los datos editados para que el usuario pueda corregirlos. *(Excepción: el panel «Lectura» del lector del Corán guarda cambios directos).*

### 3. Permisos en Tauri 2 (`capabilities/`)
Cualquier comando nuevo expuesto desde Rust con `#[tauri::command]` debe declararse explícitamente en los archivos de permisos dentro de `src-tauri/capabilities/`. Si un comando no responde en el frontend, revisá primero los permisos.

### 4. Compatibilidad CSS WebViews (`chrome80`)
Mantenemos `build.target: "chrome80"` y `build.cssTarget: "chrome80"` en `vite.config.ts`. No utilices sintaxis de media queries de rango (ej. `@media (width <= 720px)`) ya que rompe la compatibilidad con WebViews más antiguos en dispositivos móviles como Android 8/9.

---

## Documentación de cambios y Changelog

Adhan Companion mantiene un historial transparente y riguroso de cambios:

1. **`CHANGELOG.md`:** Archivo maestro en la raíz siguiendo el formato de [*Keep a Changelog*](https://keepachangelog.com/es-ES/1.0.0/).
2. **`docs/releases/vX.Y.Z.md`:** Documento detallado individual por cada versión publicada.
3. **`README.md`:** Sección `## Novedades de v...` con los puntos sobresalientes de las versiones recientes.

### Cómo documentar tus cambios:
* Al desarrollar una función o corregir un error, agregá la descripción en la sección **`[Unreleased]`** (o *En desarrollo*) de [`CHANGELOG.md`](CHANGELOG.md).
* Si tu cambio afecta la interfaz o los estados, actualizá la documentación correspondiente en `docs/`.

### Cómo se realiza el salto de versión (*bump*):
El repositorio cuenta con un script de automatización que sincroniza todos los archivos de configuración:

```bash
# Sube la versión en package.json, tauri.conf.json, Cargo.toml, Cargo.lock, README, AGENTS y crea la plantilla en docs/releases/
pnpm version:bump 0.1.X

# Valida que versiones y notas estén coherentes
pnpm release:check
```

---

## Verificaciones antes de enviar un Pull Request

Antes de enviar tu código a revisión, ejecutá las siguientes verificaciones locales:

```bash
# 1. Chequeo de tipos de TypeScript y build del frontend
pnpm build

# 2. Suite de pruebas de Rust del core
cargo test --manifest-path src-tauri/Cargo.toml

# 3. Validación de release y coherencia de notas
pnpm release:check
```

Todas las pruebas deben finalizar con éxito (`exit code 0`).

---

## Flujo de Git y convenciones de commits

* **Ramas:**
  - `main`: Rama de producción y versiones publicadas.
  - `feature/<nombre>`: Nuevas características.
  - `fix/<nombre>`: Correcciones de errores.
  - `docs/<nombre>`: Mejoras de documentación.
* **Mensajes de commit:**
  Seguimos la convención de [Conventional Commits](https://www.conventionalcommits.org/es/):
  - `feat: agregar recordatorio de oración para Fajr`
  - `fix: corregir detección de procesos en instalador de Windows`
  - `docs: actualizar guía de desarrollo para macOS`
  - `refactor: desacoplar lógica de sincronización en sync_core.rs`
  - `test: agregar prueba de ciclo de vida del instalador NSIS`

---

Si tenés preguntas o dudas sobre el diseño o el dominio litúrgico de la aplicación, abrí una discusión o issue en el repositorio. ¡Gracias por ayudar a que Adhan Companion sea cada día mejor!
