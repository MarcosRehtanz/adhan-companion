//! Arranque exclusivo de escritorio: tray, audio y scheduler permanente.
use crate::{config, config::SharedConfig, log, scheduler, updater};
use std::sync::mpsc;
use tauri::{
    Manager,
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
};

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Muecines: RESOLUCIÓN POR SANIDAD, no por suposición:
    // - release (.deb instalado): `BaseDirectory::Resource` trae el set completo
    //   (la validación es simple: el dir existe y tiene .wav)
    // - dev: los resources van a `target/debug/assets/muecin` de forma
    //   parciálmente staged (bug del staging de tauri dev) → usamos la
    //   biblioteca del repo vía CARGO_MANIFEST_DIR, que SIEMPRE está completa
    let tiene_wav = |p: &std::path::Path| {
        p.is_dir()
            && std::fs::read_dir(p)
                .map(|rd| {
                    rd.filter_map(Result::ok).any(|e| {
                        e.path()
                            .extension()
                            .is_some_and(|x| x.eq_ignore_ascii_case("wav"))
                    })
                })
                .unwrap_or(false)
    };
    let mut muecines_dir: Option<std::path::PathBuf> = None;
    if let Ok(p) = app
        .path()
        .resolve("assets/muecin", tauri::path::BaseDirectory::Resource)
    {
        if tiene_wav(&p) {
            muecines_dir = Some(p);
        }
    }
    #[cfg(debug_assertions)]
    if muecines_dir.is_none() {
        let repo = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/muecin");
        if tiene_wav(&repo) {
            muecines_dir = Some(repo);
        }
    }
    match muecines_dir {
        Some(p) => {
            crate::log!("muecines dir: {}", p.display());
            crate::audio::set_resource_dir(p);
        }
        None => {
            crate::log!("muecines: sin biblioteca en disco — solo default embebido");
        }
    }

    // auto-check del updater: thread deferrado para no competir con el arranque
    let up = app.handle().clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        match updater::verificar() {
            Ok(Some(info)) => {
                log!("updater: disponible v{}", info.version);
                scheduler::notify_standard(
                    &up,
                    "Actualización disponible",
                    &format!(
                        "v{} está publicada — verificá Activaciones en la app o descargásela de Releases",
                        info.version
                    ),
                );
            }
            Ok(None) => log!("updater: al día"),
            Err(e) => log!("updater: {e}"),
        }
    });

    // sync con Google al arrancar (si hay sesión): el mismo flujo del botón,
    // deferrado ("tras el updater") y sin notificación — los conflictos/la
    // restauración quedan en el estado interno y el UI los consulta al abrir
    // el panel; un fallo de red sólo deja log, la app sigue local
    #[cfg(desktop)]
    let sync_handle = app.handle().clone();
    #[cfg(desktop)]
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(14));
        tauri::async_runtime::block_on(crate::sync_google::al_arrancar(sync_handle));
    });

    // Menú según el spec: countdown arriba, los 5 horarios (clic = marcar rezado),
    // test de audio, configuración y salir
    let countdown = MenuItem::with_id(
        app,
        "countdown",
        "Fajr — en 00:00:00",
        false, // no clickable: es info, no acción
        None::<&str>,
    )?;
    let mut prayer_items = Vec::new();
    for (idx, name) in scheduler::PRAYERS.iter().enumerate() {
        let mi = MenuItem::with_id(
            app,
            &format!("pray:{idx}"),
            format!("{name}"),
            true, // clic → marca rezado (el texto lo refresca el scheduler con hhmm/✓)
            None::<&str>,
        )?;
        prayer_items.push(((*name).to_string(), mi));
    }
    let test_adhan: Option<MenuItem<tauri::Wry>> = {
        #[cfg(debug_assertions)]
        {
            Some(MenuItem::with_id(
                app,
                "test_adhan",
                "Reproducir adhan ahora (test)",
                true,
                None::<&str>,
            )?)
        }
        // dev-tool del spike 3 que quedó en el canal: en prod el usuario
        // prueba su muecín desde la tab Audio (via get_qibla... via
        // test_adhan del IPC — solo para validación dev)
        #[cfg(not(debug_assertions))]
        {
            None
        }
    };
    let stop_quran = MenuItem::with_id(app, "stop_quran", "Detener recitación del Qur’an", true, None::<&str>)?;
    let silenciar = MenuItem::with_id(app, "silence_adhan", "Detener sonido", true, None::<&str>)?;
    let test_notif: Option<MenuItem<tauri::Wry>> = {
        #[cfg(debug_assertions)]
        {
            Some(MenuItem::with_id(
                app,
                "test_notification",
                "Notificación de prueba",
                true,
                None::<&str>,
            )?)
        }
        #[cfg(not(debug_assertions))]
        {
            None
        }
    };
    let config = MenuItem::with_id(app, "config", "Configuración…", true, None::<&str>)?;
    let salir = MenuItem::with_id(app, "exit", "Salir", true, None::<&str>)?;

    let mut menu = MenuBuilder::new(app).item(&countdown).separator();
    for (_, mi) in &prayer_items {
        menu = menu.item(mi);
    }
    menu = menu
        .separator()
        .item(&silenciar)
        .item(&stop_quran)
        .item(&config)
        .separator()
        .item(&salir);
    // Herramientas de dev solo aparecen con debug_assertions; el
    // .deb / the release nunca los ve (cliente prod limpio)
    for extra in [&test_adhan, &test_notif].into_iter().flatten() {
        menu = menu.separator().item(extra);
    }
    let menu = menu.build()?;

    // canal de triggers del scheduler: existe ANTES del tray para que
    // el handler del menú pueda mandar Pray
    let (tx, rx) = mpsc::channel::<scheduler::Trigger>();
    let pray_tx = tx.clone();
    app.manage(tx.clone());

    let tray = TrayIconBuilder::with_id("tray")
        .icon(scheduler::icon_de(scheduler::IconoEstado::Dia))
        .menu(&menu)
        .tooltip("Adhan Companion")
        .on_menu_event(move |app, ev| match ev.id().as_ref() {
            // (los ítems test_adhan/test_notification solo existen en
            // dev — en release estas arm llegan solo si el IPC los
            // dispara directo, no desde el menú)
            "test_adhan" => {
                // mismo criterio que el IPC: el adhan del próximo rezo
                let cfg = app.state::<SharedConfig>().read().ok().map(|c| c.clone());
                let muecin: Option<String> = {
                    let sched = app.state::<scheduler::SharedState>();
                    sched.lock().ok().and_then(|s| {
                        s.schedule
                            .next
                            .as_ref()
                            .map(|next| next.name.to_lowercase())
                    })
                };
                let vol = cfg
                    .as_ref()
                    .map(|c| c.audio.volume as f32 / 100.0)
                    .unwrap_or(0.7);
                match crate::audio::toggle_adhan(vol, muecin.as_deref()) {
                    Ok(estado) => log!(
                        "adhan (test) desde el menú con muecín '{}': {estado}",
                        muecin.unwrap_or_else(|| "default".into())
                    ),
                    Err(e) => log!("audio falló: {e}"),
                }
            }
            "stop_quran" => { crate::quran_audio::stop(); }
            "silence_adhan" => {
                crate::audio::stop_adhan();
                log!("adhan silenciado desde el tray");
            }
            "test_notification" => scheduler::notify_test(app),
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
            id if id.starts_with("pray:") => {
                // marcar rezado (día de hoy) — el scheduler togglea y registra
                if let Ok(idx) = id["pray:".len()..].parse::<usize>() {
                    if let Some(name) = scheduler::PRAYERS.get(idx) {
                        if let Err(e) = pray_tx.send(scheduler::Trigger::Pray {
                            date: String::new(), // hoy
                            reply: None,
                            prayer: (*name).to_string(),
                        }) {
                            log!("marcado no entregó al scheduler: {e}");
                        }
                    }
                }
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

    // Estado compartido scheduler ↔ IPC + config persistente
    let cfg = config::load_or_init();
    let config_state: SharedConfig = std::sync::Arc::new(std::sync::RwLock::new(cfg.clone()));
    app.manage(config_state.clone());

    let state: scheduler::SharedState = std::sync::Arc::new(std::sync::Mutex::new(
        scheduler::SharedStateInner::new(&cfg),
    ));
    app.manage(state.clone());

    // scheduler (tick 1 s) + watcher del login1 (trigger resume del sleep)
    scheduler::spawn_login1_watcher(tx);
    let app2 = app.handle().clone();
    std::thread::spawn(move || {
        scheduler::run(scheduler::SchedulerLoop {
            app: app2,
            tray,
            countdown_item: countdown,
            prayer_items,
            rx,
            state,
            config: config_state,
        });
    });

    log!(
        "setup ok: tray + scheduler + config ({}) corriendo",
        config::config_path().display()
    );
    Ok(())
}
