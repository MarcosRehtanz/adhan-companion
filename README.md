# Adhan Companion

App de escritorio **tray-first** para Ubuntu: el tray es la app — horarios de las 5 rezas en la barra de menú, preaviso + adhan de muecín elegible, marcado de rezos del día. Cálculo 100% local, sin backend.

## Estado

✅ **MVP funcional publicado** — tray con estados, scheduler 24/7 (recalculo al reanudar del sleep), adhan real con confirmación, calendario de seguimiento retroactivo, notificaciones + preaviso, cálculo local por FFI, suite de validación vs alAdhan (70 fixtures), biblioteca de muecines por rezo y **pipeline de releases en CI** (tag → `.deb`/`AppImage` en Releases).

## Instalar (Ubuntu, sin toolchain)

```bash
wget https://github.com/MarcosRehtanz/adhan-companion/releases/download/v0.1.4/Adhan.Companion_0.1.4_amd64.deb
sudo apt install ./Adhan.Companion_0.1.4_amd64.deb
```

Queda como app nativa: tray en el menú, autostart, single-instance y config en `~/.config/adhan-companion/config.json`.

## Publicar una release

```bash
git push && git tag vX.Y.Z && git push origin vX.Y.Z
```

GitHub Actions compila en runner (ubuntu-24.04) y publica el `.deb` + `AppImage`. Zero pasos manuales; deps cacheadas (rust-cache), token con `contents: write` para crear el release.

## Qué hace hoy

- **Cálculo 100% local** de los 5 horarios con [PrayTimes C](https://github.com/crodesrepos/praytimes) compilado en el core Rust por FFI — sin red, mismo código que el firmware del nodo hermano ("Adhan Companion — Alarma de Salat", ESP32-S3).
- **Icono del tray** con estados (silenciado / día / próximo < 15 min / adhan sonando) y menú con countdown + horarios del día.
- **Preaviso + adhan real** con volumen propio; confirmás "ya recé" desde el tray o silenciás.
- **Biblioteca de muecines por rezo**: los 5 adhanes del conjunto Doha (Public Domain Mark 1.0) instalados con el `.deb` + tu carpeta de usuario; cada rezo suena con el muecín que elijas (`audio.muecinPorRezo` en el config).
- **Seguimiento con calendario**: marcá los rezos del día (o de días pasados), registro append-only en `registro.jsonl`.
- Config: ubicación (sugerencia por IP con cadena de 3 proveedores), método (MWL/ISNA/Egypt/…), madhab, offsets, audio por rezo.
- 24/7 real: autostart, single-instance, recálculo a medianoche y al reanudar del sleep.

## Stack

- **Core Rust** ([Tauri 2](https://v2.tauri.app/)): tray, scheduler, audio, FFI — corre siempre, independiente de la ventana.
- **Frontend React/TS**: configuración + dashboard del día en la webview.
- Distribución: `.deb` (Ubuntu).

## Desarrollo

```bash
pnpm install
pnpm tauri dev      # desarrollo (vite :1420 + hot-reload del core)
pnpm tauri build    # produce .deb
```

Prerequisitos Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev pkg-config libasound2-dev` + toolchain Rust.

Las instrucciones para sesiones con agentes de código están en [AGENTS.md](AGENTS.md).

## Licencia

MIT — ver [LICENSE](LICENSE). La librería de cálculo PrayTimes es de dominio público (autor Hamid Zarrabi-Zadeh).
