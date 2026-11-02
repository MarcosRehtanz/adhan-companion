fn main() {
    // Spike 4 — PrayTimes C (LGPL, con parche de portabilidad Windows) compilado y enlazado
    // al core: la fuente única del cálculo ritual compartida con el firmware.
    //
    // TU ÚNICO: praytimes_compat.c incluye prayertimes.h, y ese header define
    // los globales del cálculo (method_params, calc_method, ...) SIN extern.
    // Compilar dos TUs que incluyen el header crea DOS sets de globales —
    // el set que escribe el shim y el que leen las funciones de cálculo
    // divergen silenciosamente (bug de found el día de la validación).
    // El CLI upstream (prayertimes-cli.c, con main()) NO se compila.
    for file in ["native/praytimes_compat.c", "native/praytimes_compat.h", "native/prayertimes.h"] {
        println!("cargo:rerun-if-changed={file}");
    }
    cc::Build::new()
        .file("native/praytimes_compat.c")
        .include("native")
        .define("_DEFAULT_SOURCE", None) // para M_PI en math.h con -std=c99
        .define("_USE_MATH_DEFINES", None) // M_PI en el runtime de Microsoft C
        .flag_if_supported("-std=c99")
        .warnings(false)
        .compile("praytimes");

    // Credenciales OAuth de Google: .oauth.local en la raíz del repo
    // (fuera de Git por *.local). En CI/botella sin credencial la build sigue
    // y la app avisa en claro que falta configuración (client_id marcador).
    //
    // Soporta dos clientes:
    // - Desktop: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
    // - Android: ANDROID_GOOGLE_CLIENT_ID / ANDROID_GOOGLE_CLIENT_SECRET
    let mut ruta = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    ruta.pop();
    let oauth_local = ruta.join(".oauth.local");
    if let Ok(texto) = std::fs::read_to_string(&oauth_local) {
        for linea in texto.lines() {
            if let Some((k, v)) = linea.split_once('=') {
                let (k, v) = (k.trim(), v.trim());
                if !v.is_empty() {
                    match k {
                        "GOOGLE_OAUTH_CLIENT_ID" | "GOOGLE_OAUTH_CLIENT_SECRET"
                        | "ANDROID_GOOGLE_CLIENT_ID" | "ANDROID_GOOGLE_CLIENT_SECRET" => {
                            println!("cargo:rustc-env={k}={v}");
                        }
                        _ => {}
                    }
                }
            }
        }
        println!("cargo:rerun-if-changed={}", oauth_local.display());
    }

    tauri_build::build()
}
