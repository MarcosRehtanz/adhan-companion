# Publicar una release

## Preparar

1. Actualizar la versión en `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` y el valor de respaldo de la barra lateral en `src/App.tsx`.
2. Crear `docs/releases/vX.Y.Z.md` con los cambios, descargas e instrucciones de actualización.
3. Instalar dependencias con `pnpm install --frozen-lockfile` y comprobar la versión con `pnpm release:check`.
4. Ejecutar `cargo test --locked --all-targets --manifest-path src-tauri/Cargo.toml` y compilar con `pnpm tauri build --ci --bundles deb,appimage -- --locked` en Linux.
5. Revisar y guardar los cambios en un commit; subir ese commit a la rama que se va a publicar.

## Validar en GitHub Actions

Ejecutar manualmente el workflow **Release** sobre esa rama. Esta ejecución genera artefactos sin crear una release pública.

- **Ubuntu 24.04 x86_64:** tests, compilación, `.deb` y `.AppImage`.
- **Windows x64:** tests, compilación e instalador NSIS por usuario.
- Ambos usan el lockfile de pnpm y ejecutan Cargo con `--locked` para los tests y la compilación.

Descargar los artefactos del workflow y comprobar instalación, arranque, configuración, tray, notificaciones y audio en ambas plataformas. Para Windows, esta comprobación debe hacerse en un equipo Windows; la compilación de Linux no la sustituye.

## Publicar

Después de validar todos los builds y revisar las notas, crear y subir el tag del commit validado:

```bash
git tag -a v0.1.9 -m "Adhan Companion v0.1.9"
git push origin v0.1.9
```

El workflow vuelve a ejecutar tests y builds, comprueba que el tag coincide con las versiones del proyecto y exige un paquete de cada tipo para esa versión. Luego publica los tres instaladores de escritorio, los APK ARMv7/ARM64 firmados, el índice de actualización Android, `SHA256SUMS` y las notas de `docs/releases/v0.1.9.md`.

La consulta de actualizaciones de la app usa la última release pública de GitHub. Desde Configuración → Actualizaciones, **Actualizar ahora** instala la versión nueva en los tres formatos de escritorio:

- **AppImage:** descarga la nueva, reemplaza el archivo y relanza.
- **`.deb`:** descarga el paquete, lo verifica contra `SHA256SUMS` y lo instala con `pkexec apt-get install`. Ubuntu pide la contraseña. Después reabre la app.
- **Windows:** descarga el instalador, lo verifica contra `SHA256SUMS` y lo ejecuta con `/P /UPDATE /R`: sin páginas, sin desinstalar la versión anterior, conservando los accesos directos y el inicio automático. Después reabre la app.

Por eso cada release debe publicar `SHA256SUMS` con los nombres exactos de los assets. El 21/10/2026, antes de publicar v0.1.12, se probó el flujo completo con una compilación de prueba de este código con la versión forzada a 0.1.10: «Actualizar ahora» la llevó a la v0.1.11 oficial en Linux con el `.deb` (contraseña con pkexec y reapertura) y en Windows con el instalador (`/P /UPDATE /R`, sin pasar por la página de desinstalar). Las versiones anteriores a este actualizador requieren instalar a mano. En Windows, el instalador propone por defecto «Desinstalar antes de instalar»: para actualizar hay que elegir **No desinstalar**, o ejecutar `setup.exe /P /UPDATE /R`. Los datos de `%APPDATA%\Adhan Companion` no se borran en ningún caso.

## Android en el release oficial

Desde v0.1.9, Release también compila ambas arquitecturas en modo release (sin `--debug`), comprueba ABI, identidad, versión, SDK mínimo y ausencia de depuración, y firma con los secretos persistentes existentes. La publicación espera estos jobs, además de Linux y Windows. Un fallo impide publicar una versión incompleta. Los PR del propio repositorio validan los cuatro builds; no se expone la firma a PR de forks.

`ANDROID_VERSION_CODE` se deriva de la versión: `1000000 + major*1000000 + minor*10000 + patch*100` (minor y patch menores que 100). v0.1.9 corresponde a 1010900, superior a 10018. No reducirlo, cambiar la identidad ni rotar la clave. El workflow experimental conserva su contador anterior y no debe usarse para sustituir una versión oficial instalada con un código superior.

`scripts/android-release.py` firma/prepara los APK, combina los índices y genera un puente para la compilación 10018. Después del release oficial se crea una prerelease `android-experimental-<commit>` con copias idénticas de los APK y nombres/índice compatibles con el actualizador anterior. No reemplaza Latest. El actualizador nuevo admite releases oficiales y conserva la compatibilidad anterior.

Antes de etiquetar, revisar el PR, los tests Linux/Windows y las compilaciones de las cuatro plataformas/arquitecturas. Tras etiquetar, verificar los cinco paquetes, los hashes del índice y SHA256SUMS y la firma persistente de los APK. La publicación no equivale a haber probado visual/audio/instalación en todos los equipos.
