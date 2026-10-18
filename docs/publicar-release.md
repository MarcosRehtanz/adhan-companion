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

Después de validar ambos builds y revisar las notas, crear y subir el tag del commit validado:

```bash
git tag -a v0.1.8 -m "Adhan Companion v0.1.8"
git push origin v0.1.8
```

El workflow vuelve a ejecutar tests y builds, comprueba que el tag coincide con las versiones del proyecto y exige un paquete de cada tipo para esa versión. Luego publica los tres instaladores, `SHA256SUMS` y las notas de `docs/releases/v0.1.8.md`.

La consulta de actualizaciones de la app usa la última release pública de GitHub. AppImage permite actualizar desde Sistema; `.deb` y Windows requieren ejecutar el instalador descargado.
