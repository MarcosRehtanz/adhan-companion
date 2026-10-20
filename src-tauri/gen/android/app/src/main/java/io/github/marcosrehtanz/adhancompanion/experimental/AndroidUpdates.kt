package io.github.marcosrehtanz.adhancompanion.experimental

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.provider.Settings
import androidx.core.content.FileProvider
import com.android.apksig.ApkVerifier
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipFile

/** Descarga explícita en el proceso de la app, independiente del executor de las alarmas. */
object AndroidUpdates {
    private const val REPO = "https://github.com/MarcosRehtanz/adhan-companion"
    private const val API = "https://api.github.com/repos/MarcosRehtanz/adhan-companion/releases?per_page=100"
    private const val MAX_APK = 256L * 1024 * 1024
    private val worker = Executors.newSingleThreadExecutor()
    private val cancelled = AtomicBoolean(false)
    @Volatile private var connection: HttpURLConnection? = null
    private var phase = "idle"
    private var error = ""
    private var received = 0L
    private var candidate: JSONObject? = null
    private var ready: File? = null
    private val busy get() = phase in listOf("checking", "downloading", "verifying", "installing", "cancelling")
    private fun directory(c: Context) = File(c.cacheDir, "updates").apply { mkdirs() }
    private fun abi() = if (Process.is64Bit()) "arm64-v8a" else "armeabi-v7a"
    @Suppress("DEPRECATION") private fun code(p: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) p.longVersionCode else p.versionCode.toLong()
    @Suppress("DEPRECATION") private fun installed(c: Context) = c.packageManager.getPackageInfo(c.packageName, PackageManager.GET_SIGNATURES)
    fun canInstall(c: Context) = Build.VERSION.SDK_INT < 26 || c.packageManager.canRequestPackageInstalls()
    @Synchronized fun status(c: Context): JSONObject = JSONObject().put("phase", phase).put("error", error)
        .put("received", received).put("candidate", candidate ?: JSONObject.NULL)
        .put("installed_code", code(installed(c))).put("installed_version", installed(c).versionName)
        .put("abi", abi()).put("can_install", canInstall(c))

    private fun open(url: String): HttpURLConnection {
        var current = URL(url)
        repeat(6) {
            check(!cancelled.get()) { "Descarga cancelada." }
            check(current.protocol == "https" && current.userInfo == null && current.port in listOf(-1, 443) &&
                (current.host in listOf("github.com", "api.github.com") || current.host.endsWith(".githubusercontent.com"))) { "Origen de descarga no permitido." }
            val conn = current.openConnection() as HttpURLConnection
            connection = conn
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 15000; conn.readTimeout = 30000
            conn.setRequestProperty("User-Agent", "Adhan-Companion-Android")
            val response = conn.responseCode
            if (response in listOf(301, 302, 303, 307, 308)) {
                val location = conn.getHeaderField("Location") ?: error("Redirección inválida.")
                conn.disconnect(); current = URL(current, location)
            } else {
                if (response != 200) {
                    conn.disconnect()
                    error(if (response == 403 || response == 429) "GitHub limitó las consultas. Volvé a intentar más tarde." else "No se pudo descargar (HTTP $response).")
                }
                return conn
            }
        }
        error("Demasiadas redirecciones.")
    }
    private fun json(url: String, limit: Int): String {
        val conn = open(url)
        try {
            return conn.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream()
                val bytes = ByteArray(8192)
                while (true) {
                    check(!cancelled.get()) { "Descarga cancelada." }
                    val count = input.read(bytes); if (count < 0) break
                    check(output.size() + count <= limit) { "Respuesta de actualización demasiado grande." }
                    output.write(bytes, 0, count)
                }
                output.toString("UTF-8")
            }
        } finally { conn.disconnect(); connection = null }
    }
    @Synchronized fun start(c: Context, action: String) {
        if (action == "cancel") {
            if (busy && phase != "installing") { cancelled.set(true); connection?.disconnect(); phase = "cancelling" }
            return
        }
        check(!busy) { "Ya hay una operación en curso." }
        require(action in listOf("check", "download")) { "Acción desconocida." }
        val selected = candidate?.let { JSONObject(it.toString()) }
        if (action == "download") check(selected != null) { "Primero buscá una actualización." }
        phase = if (action == "check") "checking" else "downloading"
        error = ""; received = 0; cancelled.set(false); ready = null
        if (action == "check") candidate = null
        worker.execute {
            val cache = directory(c)
            try {
                cache.listFiles()?.forEach { it.delete() }
                if (action == "check") find(c) else download(c, selected!!)
            } catch (e: Throwable) {
                synchronized(this) {
                    error = if (cancelled.get()) "Operación cancelada." else e.message ?: "No se pudo actualizar."
                    phase = if (candidate != null) "available" else "error"
                    ready = null
                }
                cache.listFiles()?.forEach { it.delete() }
            } finally { connection?.disconnect(); connection = null }
        }
    }
    private fun find(c: Context) {
        check(abi() in Build.SUPPORTED_ABIS) { "No hay APK para esta arquitectura." }
        val releases = JSONArray(json(API, 4 * 1024 * 1024))
        // Los releases oficiales tienen prioridad; el canal anterior permite migrar sin perder datos.
        val entries = (0 until releases.length()).map { releases.getJSONObject(it) }
            .filter { !it.optBoolean("draft") && (
                !it.optBoolean("prerelease") && it.optString("tag_name").matches(Regex("v[0-9]+\\.[0-9]+\\.[0-9]+")) ||
                !it.optBoolean("draft") && it.optString("tag_name").matches(Regex("android-experimental-[a-f0-9]{7}")) }
            .sortedWith(compareBy<JSONObject> { it.optBoolean("prerelease") }.thenByDescending { it.optString("published_at") })
        var latest: JSONObject? = null
        for (release in entries.take(20)) {
            val assets = release.getJSONArray("assets")
            val all = (0 until assets.length()).map { assets.getJSONObject(it) }
            val index = all.firstOrNull { it.optString("name") == "android-update.json" } ?: continue
            val tag = release.getString("tag_name")
            val prefix = "$REPO/releases/download/$tag/"
            val indexUrl = index.getString("browser_download_url")
            check(indexUrl == prefix + "android-update.json") { "Índice de actualización inválido." }
            val manifest = JSONObject(json(indexUrl, 256 * 1024))
            check(manifest.getInt("schema") == 1 && manifest.getString("package_id") == c.packageName && manifest.getString("tag") == tag) { "Canal de actualización incompatible." }
            check(manifest.getLong("version_code") in 1..2100000000L) { "Número de versión inválido." }
            if (manifest.getInt("min_sdk") > Build.VERSION.SDK_INT) continue
            val packageData = manifest.getJSONObject("packages").optJSONObject(abi()) ?: continue
            val name = packageData.getString("name")
            check(name.matches(Regex("Adhan-Companion-android-experimental-(armv7|arm64)-[a-f0-9]{7}\\.apk")) ||
                name.matches(Regex("Adhan-Companion_[0-9]+\\.[0-9]+\\.[0-9]+_android-(armv7|arm64)\\.apk"))) { "Nombre de APK inválido." }
            check(all.any { it.optString("name") == name && it.optString("browser_download_url") == prefix + name && it.optLong("size") == packageData.getLong("size") }) { "El APK no coincide con la release." }
            check(packageData.getLong("size") in 1..MAX_APK && packageData.getString("sha256").matches(Regex("[a-f0-9]{64}"))) { "Datos de descarga inválidos." }
            val proposed = JSONObject(packageData.toString()).put("url", prefix + name).put("version_code", manifest.getLong("version_code"))
                .put("version_name", manifest.getString("version_name")).put("tag", tag).put("abi", abi())
            if (latest == null || proposed.getLong("version_code") > latest.getLong("version_code")) latest = proposed
        }
        check(latest != null) { "No hay un índice de actualización compatible publicado. Volvé a intentar más tarde." }
        synchronized(this) {
            check(!cancelled.get()) { "Operación cancelada." }
            if (latest.getLong("version_code") > code(installed(c))) { candidate = latest; phase = "available" }
            else phase = "up_to_date"
        }
    }
    private fun digest(file: File): String = file.inputStream().use { input ->
        val hash = MessageDigest.getInstance("SHA-256")
        val bytes = ByteArray(65536)
        while (true) { val count = input.read(bytes); if (count < 0) break; hash.update(bytes, 0, count) }
        hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }
    private fun download(c: Context, selected: JSONObject) {
        val file = File(directory(c), "download.part.apk")
        val conn = open(selected.getString("url"))
        val expected = selected.getLong("size")
        val deadline = SystemClock.elapsedRealtime() + 10 * 60 * 1000
        try {
            check(conn.contentLengthLong == -1L || conn.contentLengthLong == expected) { "Tamaño de descarga inesperado." }
            file.outputStream().use { output -> conn.inputStream.use { input ->
                val bytes = ByteArray(65536)
                while (true) {
                    check(!cancelled.get()) { "Descarga cancelada." }
                    check(SystemClock.elapsedRealtime() < deadline) { "La descarga tardó demasiado. Volvé a intentar." }
                    val count = input.read(bytes); if (count < 0) break
                    synchronized(this) { received += count; check(received <= expected) { "La descarga supera el tamaño publicado." } }
                    output.write(bytes, 0, count)
                }
            } }
        } finally { conn.disconnect(); connection = null }
        synchronized(this) { phase = "verifying" }
        validate(c, file, selected)
        synchronized(this) {
            check(!cancelled.get()) { "Descarga cancelada." }
            val target = File(directory(c), "update.apk")
            check(file.renameTo(target)) { "No se pudo guardar el APK." }
            ready = target; phase = "ready"
        }
    }
    @Suppress("DEPRECATION") private fun validate(c: Context, file: File, selected: JSONObject) {
        check(file.length() == selected.getLong("size") && digest(file) == selected.getString("sha256")) { "La descarga está incompleta o su SHA-256 no coincide. Volvé a descargar." }
        val pkg = c.packageManager.getPackageArchiveInfo(file.absolutePath, 0) ?: error("Android no reconoce el APK.")
        check(pkg.applicationInfo!!.minSdkVersion <= Build.VERSION.SDK_INT) { "El APK requiere un Android más reciente." }
        check(pkg.packageName == c.packageName && code(pkg) == selected.getLong("version_code") && code(pkg) > code(installed(c))) { "El APK no corresponde a una actualización de esta aplicación." }
        ZipFile(file).use { zip -> check(zip.getEntry("lib/${abi()}/libadhan_companion_lib.so") != null) { "El APK no es compatible con esta arquitectura." } }
        val result = ApkVerifier.Builder(file).setMinCheckedPlatformVersion(Build.VERSION.SDK_INT).setMaxCheckedPlatformVersion(Build.VERSION.SDK_INT).build().verify()
        check(result.isVerified) { "La firma del APK no es válida." }
        val actual = result.signerCertificates.map { it.encoded.toList() }.toSet()
        val own = installed(c).signatures?.map { it.toByteArray().toList() }?.toSet() ?: emptySet()
        check(own.isNotEmpty() && actual == own) { "La firma difiere de la app instalada. No desinstales si tenés datos; esta instalación necesita migración." }
    }
    @Synchronized fun install(activity: Activity) {
        check(!busy) { "Esperá a que termine la operación actual." }
        check(canInstall(activity)) { "Permití instalar actualizaciones desde esta aplicación y volvé a pulsar Instalar." }
        val file = ready ?: error("Primero descargá la actualización.")
        val selected = candidate?.let { JSONObject(it.toString()) } ?: error("No hay actualización disponible.")
        phase = "installing"; error = ""; cancelled.set(false)
        worker.execute {
            try {
                validate(activity, file, selected)
                activity.runOnUiThread {
                    try {
                        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
                        activity.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                        synchronized(this) { phase = "ready" }
                    } catch (e: Throwable) { synchronized(this) { phase = "ready"; error = e.message ?: "No se pudo abrir el instalador." } }
                }
            } catch (e: Throwable) { synchronized(this) { phase = "error"; error = e.message ?: "No se pudo verificar el APK."; ready = null }; file.delete() }
        }
    }
    fun permission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= 26) activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
    }
}
