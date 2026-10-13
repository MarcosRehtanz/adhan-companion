// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

use tauri::{
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};

/// Spike 1 — logs con prefijo para depurar el tray/AppIndicator fácilmente
#[cfg(debug_assertions)]
macro_rules! log {
    ($($arg:tt)*) => { println!("[adhan] {}", format_args!($($arg)*)) };
}
#[cfg(not(debug_assertions))]
macro_rules! log {
    ($($arg:tt)*) => {};
}

/// Íconos de prueba: círculos RGBA dibujados en memoria (sin assets por ahora).
/// Gris = silenciado, azul = día normal, ámbar = próximo < 15 min, verde = sonando.
fn circle_icon(size: u32, (r, g, b): (u8, u8, u8)) -> tauri::image::Image<'static> {
    let mut rgba = vec![0u8; (size * size * 4) as usize];
    let c = size as f32 / 2.0;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - c;
            let dy = y as f32 + 0.5 - c;
            let d = (dx * dx + dy * dy).sqrt();
            let i = ((y * size + x) as usize) * 4;
            if d >= c {
                continue;
            }
            // borde anti-aliased de 1px
            let a = if d < c - 1.0 { 255u8 } else { ((c - d) * 255.0) as u8 };
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = a;
        }
    }
    tauri::image::Image::new_owned(rgba, size, size)
}

const ESTADOS: &[((u8, u8, u8), &str)] = &[
    ((0x9e, 0x9e, 0x9e), "gris (silenciado)"),
    ((0x21, 0x96, 0xf3), "azul (día normal)"),
    ((0xff, 0x98, 0x00), "ámbar (próximo < 15 min)"),
    ((0x4c, 0xaf, 0x50), "verde (adhan sonando)"),
];

/// Cicla los 4 estados cada 5 s: valida el cambio de icono dinámico
/// en AppIndicator/vía GNOME (el riesgo del Spike 1).
/// El timer real vendrá con la matriz de triggers del spec.
fn iniciar_ciclo_estados(app: AppHandle, tray: tauri::tray::TrayIcon<tauri::Wry>, countdown: MenuItem<tauri::Wry>) {
    std::thread::spawn(move || {
        let mut i = 0usize;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            i = (i + 1) % ESTADOS.len();
            // Cambio de icono + actualización del texto del menú, en el main thread
            let res = app.run_on_main_thread({
                let cd = countdown.clone();
                let tr = tray.clone();
                let n = i;
                move || {
                    let color = ESTADOS[n].0;
                    if let Err(e) = tr.set_icon(Some(circle_icon(32, color))) {
                        log!("set_icon falló: {e}");
                    }
                    let _ = cd.set_text(format!("FAJR — en 00:0{}:{}0", 1 + n % 4, (3 * n) % 10));
                }
            });
            log!("ciclo {}: run_on_main_thread ok={:?}", ESTADOS[i].1, res.is_ok());
        }
    });
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Spike 1: una segunda instancia enfoca a la viva, nunca duplica el tray
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log!("segunda instancia detectada; enfocando la viva");
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // Spike 1: autostart declarado (el enable() del usuario llega con la config real)
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![greet])
        // Tray-first: cerrar la ventana NO mata la app — el core sigue de fondo
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                log!("close interceptado: la ventana se esconde, el core sigue");
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .setup(move |app| {
            // Menú según el spec: countdown arriba (info, no acción), luego acciones
            let countdown = MenuItem::with_id(
                app,
                "countdown",
                "FAJR — en 00:12:31",
                false, // no clickable: es info, no acción
                None::<&str>,
            )?;
            let config = MenuItem::with_id(app, "config", "Configuración…", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;

            let menu = MenuBuilder::new(app)
                .item(&countdown)
                .separator()
                .item(&config)
                .separator()
                .item(&salir)
                .build()?;

            TrayIconBuilder::with_id("tray")
                .icon(circle_icon(32, ESTADOS[0].0))
                .menu(&menu)
                .tooltip("Adhan Companion")
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                    "config" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "exit" => {
                        log!("salir desde el tray");
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, ev| {
                    // GNOME/AppIndicator unifica el clic: abrirá el menú igual;
                    // registramos que el evento llega para depurar
                    if matches!(ev, tauri::tray::TrayIconEvent::Click { .. }) {
                        log!("clic sobre el icono del tray");
                    }
                })
                .build(app)?;

            let tray = app.tray_by_id("tray").expect("tray debería existir tras build");
            iniciar_ciclo_estados(app.handle().clone(), tray, countdown);
            log!("setup ok: tray listo con {} estados cíclicos", ESTADOS.len());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
