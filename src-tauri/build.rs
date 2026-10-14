fn main() {
    // Spike 4 — PrayTimes C (LGPL, upstream intacto) compilado y enlazado
    // al core: la fuente única del cálculo ritual compartida con el firmware.
    // El CLI del upstream NO se compila (prayertimes-cli.c = referencia).
    cc::Build::new()
        .file("native/prayertimes-build.c")
        .file("native/praytimes_compat.c")
        .include("native")
        .define("_DEFAULT_SOURCE", None) // para M_PI en math.h con -std=c99
        .flag_if_supported("-std=c99")
        .warnings(false)
        .compile("praytimes");

    tauri_build::build()
}
