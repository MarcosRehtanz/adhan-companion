package io.github.marcosrehtanz.adhancompanion.experimental

import android.app.*
import android.content.*
import android.media.*
import android.net.wifi.WifiManager
import android.os.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Rust resuelve cada aleya (archivo verificado por SHA-256 o URL) y guarda el punto de escucha. */
object QuranNative {
    init { System.loadLibrary("adhan_companion_lib") }
    @JvmStatic external fun resolve(sura: Int, aya: Int): String
    @JvmStatic external fun listened(sura: Int, aya: Int)
}

/**
 * Recitación por aleya, hasta el final de la sura. El estado se modifica solo en el hilo principal;
 * QuranAudioService mantiene el proceso en primer plano y la notificación con Pausar y Detener.
 * El Adhan tiene prioridad: pausa la escucha y nunca se reanuda sola.
 */
object QuranPlayer {
    const val NOTIFICATION = 7106
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private lateinit var app: Context
    @Volatile private var phase = "stopped"
    @Volatile private var sura = 0
    @Volatile private var aya = 0
    @Volatile private var error = ""
    @Volatile private var interrupted = false
    private var name = ""
    private var count = 0
    private var volume = 70
    private var ducked = false
    private var token = 0
    private var player: MediaPlayer? = null
    private var prepared = false
    private var focus: AudioFocusRequest? = null
    private var wake: PowerManager.WakeLock? = null
    private var wifi: WifiManager.WifiLock? = null
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val audio get() = app.getSystemService(AudioManager::class.java)
    // Una llamada u otra app pausan; un sonido breve solo baja el volumen. Nada reanuda solo.
    private val listener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> { ducked = true; applyVolume() }
            AudioManager.AUDIOFOCUS_GAIN -> { ducked = false; applyVolume() }
            else -> if (change < 0) pauseNow(false)
        }
    }
    val active get() = phase in listOf("loading", "playing", "paused")

    private fun <T> onMain(block: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        var result: Result<T>? = null
        val done = CountDownLatch(1)
        main.post { result = runCatching(block); done.countDown() }
        check(done.await(5, TimeUnit.SECONDS)) { "El reproductor no respondió." }
        return result!!.getOrThrow()
    }

    fun state(c: Context): JSONObject = JSONObject().put("phase", phase)
        .put("position", if (sura > 0) JSONObject().put("sura", sura).put("aya", aya) else JSONObject.NULL)
        .put("error", error).put("interrupted", interrupted)
        .put("notifications", PrayerAlarms.notifications(c))

    fun play(c: Context, sura: Int, aya: Int, count: Int, volume: Int, keep: Boolean) = onMain {
        app = c.applicationContext
        check(PrayerAlarms.notifications(app)) { "Permití las notificaciones de la app para escuchar: desde ahí podés pausar o detener la recitación." }
        check(!PrayerAudioService.active) { "Hay un aviso de rezo activo. Esperá o detenelo antes de escuchar." }
        require(sura in 1..114 && aya in 1..count) { "Aleya inválida." }
        val paused = keep && phase == "paused"
        if (!paused) check(requestFocus()) { "Otra aplicación tiene prioridad sobre el audio." }
        this.sura = sura; this.aya = aya; this.count = count; this.volume = volume.coerceIn(0, 100)
        error = ""
        if (!paused) interrupted = false
        phase = if (paused) "paused" else "loading"
        val intent = Intent(app, QuranAudioService::class.java)
        if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)
        load()
    }
    fun pause() = onMain { pauseNow(false) }
    /** Antes de un Adhan o tono: puede llamarse desde cualquier hilo y no espera. */
    fun interrupt() { main.post { pauseNow(true) } }
    fun resume() = onMain {
        check(!PrayerAudioService.active) { "El aviso de rezo todavía está sonando." }
        if (phase != "paused") return@onMain
        check(requestFocus()) { "Otra aplicación tiene prioridad sobre el audio." }
        interrupted = false
        locks()
        val media = player
        if (prepared && media != null) { media.start(); phase = "playing" } else phase = "loading"
        notifyState()
    }
    fun stop() = onMain { end("stopped") }
    fun volume(value: Int) = onMain { volume = value.coerceIn(0, 100); applyVolume() }

    private fun pauseNow(byAlert: Boolean) {
        if (!active) return
        if (phase != "paused") {
            if (prepared) player?.takeIf { it.isPlaying }?.pause()
            phase = "paused"
        }
        if (byAlert) interrupted = true
        unlock()
        notifyState()
    }
    private fun load() {
        val session = ++token
        player?.release(); player = null; prepared = false
        if (phase != "paused") { phase = "loading"; locks() }
        notifyState()
        val (s, a) = sura to aya
        // SHA-256 del archivo descargado fuera del hilo principal.
        io.execute {
            val source = runCatching { JSONObject(QuranNative.resolve(s, a)) }
            main.post {
                if (session != token) return@post
                source.onSuccess { prepare(it) }.onFailure { fail(it.message ?: "No se pudo preparar la aleya.") }
            }
        }
    }
    private fun prepare(source: JSONObject) {
        name = source.optString("name", "")
        val media = MediaPlayer()
        player = media
        try {
            media.setAudioAttributes(attributes)
            media.setWakeMode(app, PowerManager.PARTIAL_WAKE_LOCK)
            media.setDataSource(source.optString("path").ifEmpty { source.getString("url") })
            media.setOnPreparedListener {
                if (player !== it) return@setOnPreparedListener
                prepared = true
                applyVolume()
                val (s, a) = sura to aya
                io.execute { runCatching { QuranNative.listened(s, a) } }
                if (phase == "loading") { it.start(); phase = "playing" }
                notifyState()
            }
            media.setOnCompletionListener {
                if (player !== it) return@setOnCompletionListener
                if (aya >= count) end("finished") else { aya += 1; load() }
            }
            media.setOnErrorListener { failed, what, extra ->
                if (player === failed) fail("No se pudo reproducir la aleya ($what/$extra). Revisá la conexión y reintentá.")
                true
            }
            media.prepareAsync()
        } catch (e: Exception) { fail(e.message ?: "No se pudo abrir la aleya.") }
    }
    private fun fail(message: String) { error = message; end("error") }
    private fun end(next: String) {
        if (!::app.isInitialized) return
        token++
        phase = next
        if (next == "stopped") interrupted = false
        player?.release(); player = null; prepared = false
        unlock()
        if (Build.VERSION.SDK_INT >= 26) focus?.let { audio.abandonAudioFocusRequest(it) }
        else { @Suppress("DEPRECATION") audio.abandonAudioFocus(listener) }
        focus = null
        app.stopService(Intent(app, QuranAudioService::class.java))
    }
    private fun requestFocus(): Boolean {
        val granted = if (Build.VERSION.SDK_INT >= 26) {
            val request = focus ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(listener, main).build().also { focus = it }
            audio.requestAudioFocus(request)
        } else { @Suppress("DEPRECATION") audio.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) }
        return granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }
    private fun applyVolume() {
        val level = volume / 100f * if (ducked) 0.3f else 1f
        if (prepared) player?.setVolume(level, level)
    }
    // Entre aleyas no suena nada: sin estos bloqueos, con la pantalla apagada Android puede
    // dormir la CPU o el Wi-Fi antes de cargar la siguiente.
    private fun locks() {
        val w = wake ?: app.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "adhan:quran").apply { setReferenceCounted(false) }.also { wake = it }
        w.acquire(20 * 60 * 1000L)
        @Suppress("DEPRECATION")
        val f = wifi ?: (app.getSystemService(Context.WIFI_SERVICE) as WifiManager)
            .createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "adhan:quran").apply { setReferenceCounted(false) }.also { wifi = it }
        f.acquire()
    }
    private fun unlock() {
        wake?.takeIf { it.isHeld }?.release()
        wifi?.takeIf { it.isHeld }?.release()
    }
    fun notification(c: Context): Notification {
        PrayerAlarms.channels(c)
        val playing = phase == "playing" || phase == "loading"
        val status = when (phase) {
            "loading" -> "Cargando aleya…"
            "paused" -> if (interrupted) "Pausada por aviso de rezo" else "Pausada"
            else -> "Recitando"
        }
        return NotificationCompat.Builder(c, "quran")
            .setSmallIcon(R.drawable.ic_prayer_notification)
            .setContentTitle(if (name.isEmpty()) "Qur’an $sura:$aya" else "$name $sura:$aya")
            .setContentText("Parhizgar · $status")
            .setContentIntent(PrayerAlarms.open(c)).setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .addAction(R.drawable.ic_prayer_notification, if (playing) "Pausar" else "Reanudar", action(c, if (playing) "PAUSE" else "RESUME", if (playing) 7107 else 7108))
            .addAction(R.drawable.ic_prayer_notification, "Detener", action(c, "STOP", 7109))
            .build()
    }
    private fun action(c: Context, name: String, code: Int): PendingIntent = PendingIntent.getService(c, code,
        Intent(c, QuranAudioService::class.java).setAction(name), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    private fun notifyState() {
        if (active) runCatching { app.getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification(app)) }
    }
}

/** Mantiene el proceso en primer plano mientras dura la escucha. Quitar la app de recientes no la detiene. */
class QuranAudioService : Service() {
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Android exige startForeground en cuanto arranca un servicio en primer plano.
        startForeground(QuranPlayer.NOTIFICATION, QuranPlayer.notification(this))
        when (intent?.action) {
            "PAUSE" -> QuranPlayer.pause()
            "RESUME" -> runCatching { QuranPlayer.resume() }
            "STOP" -> QuranPlayer.stop()
        }
        if (!QuranPlayer.active) stopSelf()
        return START_NOT_STICKY // No recrear una escucha si Android mata el proceso.
    }
    override fun onDestroy() { stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy() }
}

/** Descarga de una aleya para escucharla sin conexión. Rust valida, calcula el SHA-256 y la guarda. */
object QuranFetch {
    // La red no ocupa el executor de las alarmas ni el del reproductor.
    val worker = Executors.newSingleThreadExecutor()
    @Volatile private var connection: HttpURLConnection? = null
    @Volatile private var cancelled = false
    fun cancel() { cancelled = true; connection?.disconnect() }
    fun fetch(url: String, path: String, max: Long) {
        cancelled = false
        val source = URL(url)
        require(source.protocol == "https" && source.host == "cdn.islamic.network" && source.port in listOf(-1, 443) && source.userInfo == null) { "Origen de audio no permitido." }
        val target = File(path)
        val conn = source.openConnection() as HttpURLConnection
        connection = conn
        try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 10000; conn.readTimeout = 20000
            conn.setRequestProperty("User-Agent", "Adhan-Companion-Android")
            val response = conn.responseCode
            check(response == 200) { "No se pudo descargar la recitación (HTTP $response). Revisá la conexión y reintentá." }
            check(conn.contentLengthLong <= max) { "Archivo de audio demasiado grande." }
            val deadline = SystemClock.elapsedRealtime() + 45000
            var total = 0L
            target.outputStream().use { output -> conn.inputStream.use { input ->
                val bytes = ByteArray(65536)
                while (true) {
                    check(!cancelled) { "Descarga cancelada." }
                    check(SystemClock.elapsedRealtime() < deadline) { "La descarga tardó demasiado. Revisá la conexión y reintentá." }
                    val n = input.read(bytes); if (n < 0) break
                    total += n
                    check(total <= max) { "Archivo de audio demasiado grande." }
                    output.write(bytes, 0, n)
                }
            } }
        } catch (e: Exception) {
            target.delete()
            throw when {
                cancelled -> IllegalStateException("Descarga cancelada.")
                e is IOException -> IllegalStateException("No se pudo descargar la recitación. Revisá la conexión y reintentá.")
                else -> e
            }
        } finally { conn.disconnect(); connection = null }
    }
}
