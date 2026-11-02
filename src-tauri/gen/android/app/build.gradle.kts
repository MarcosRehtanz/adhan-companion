import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// Scheme del redirect OAuth de Google: notación invertida del ANDROID client ID
// (com.googleusercontent.apps.<client-id>) — Google bloqueó los custom schemes
// propios en Android y solo acepta el auto-registrado. La misma derivación existe
// en Rust (sync_core::redirect_android); tienen que coincidir.
val oauthClientId: String = run {
    val deEnv = System.getenv("ANDROID_GOOGLE_CLIENT_ID")
    if (!deEnv.isNullOrBlank()) return@run deEnv.trim()
    val oauthLocal = rootProject.projectDir.parentFile.resolve("../../.oauth.local")
    if (oauthLocal.exists()) {
        oauthLocal.readLines().firstOrNull { it.startsWith("ANDROID_GOOGLE_CLIENT_ID=") }
            ?.removePrefix("ANDROID_GOOGLE_CLIENT_ID=")?.trim().orEmpty()
    } else ""
}
val oauthScheme: String = if (oauthClientId.endsWith(".apps.googleusercontent.com")) {
    "com.googleusercontent.apps.${oauthClientId.removeSuffix(".apps.googleusercontent.com")}"
} else {
    // Sin credencial Android (build local sin .oauth.local): un scheme marcador
    // que Google rechazaría, pero no rompe la inflación del manifest (el panel
    // de sync se oculta igual con disponible() == false).
    "com.googleusercontent.apps.sin-credencial"
}

android {
    compileSdk = 36
    ndkVersion = "27.2.12479018"
    namespace = "io.github.marcosrehtanz.adhancompanion.experimental"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        manifestPlaceholders["oauthScheme"] = oauthScheme
        applicationId = "io.github.marcosrehtanz.adhancompanion.experimental"
        minSdk = 24
        targetSdk = 36
        // Los releases oficiales usan un código derivado de semver; el canal anterior conserva su contador.
        versionCode = (System.getenv("ANDROID_VERSION_CODE") ?: System.getenv("ANDROID_EXPERIMENTAL_VERSION_CODE"))?.let {
            it.toInt().also { code -> require(code in 1009..2100000000) { "versionCode fuera de rango" } }
        } ?: tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            // Conservar los símbolos en target/, pero usar el strip del NDK
            // al empaquetar para reducir descarga y espacio de instalación.
        }
        getByName("release") {
            isDebuggable = false
            isJniDebuggable = false
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    androidResources { noCompress += "wav" }
    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("generated/adhanAssets").get().asFile)
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("com.android.tools.build:apksig:9.3.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
}

apply(from = file("tauri.build.gradle.kts"))

// WAV originales y sus avisos: disponibles para MediaPlayer sin red ni WebView.
val bundleAdhan by tasks.registering(Sync::class) {
    from("../../../assets/muecin")
    into(layout.buildDirectory.dir("generated/adhanAssets/muecin"))
}
tasks.named("preBuild") { dependsOn(bundleAdhan) }
