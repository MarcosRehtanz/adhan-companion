# Adhan Companion

App de escritorio **tray-first** para Ubuntu: el tray es la app — horarios de las 5 rezas en la barra de menú, preaviso + adhan de muecín elegible, marcado de rezos del día. Cálculo 100% local, sin backend.

## Estado

🚧 En desarrollo (MVP). Actual: tray con estados dinámicos validado en GNOME/Wayland. Pipeline de spikes en curso: scheduler 24/7 → audio → FFI al cálculo ritual.

## Qué va a hacer (MVP)

- **Cálculo local** de los 5 horarios con [PrayTimes C](https://github.com/hamidzz/praytimes) compilado en el core Rust por FFI — sin red, mismo código que el firmware del nodo hermano ([Adhan Companion — Alarma de Salat](https://github.com/search?q=Adhan+Companion)).
- **Icono del tray** con estados (silenciado / día / próximo < 15 min / adhan sonando) y menú con countdown + horarios del día.
- **Preaviso + adhan**: notificación y audio con volumen propio, opción de silenciar.
- **Marcar rezado** con registro local append-only.
- Config: ubicación, método (MWL/ISNA/Egypt/UmmAlQura/Karachi/Diyanet), madhab, offsets — ventana de configuración normal.
- 24/7 real: autostart, single-instance, recálculo al reanudar del sleep.

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
