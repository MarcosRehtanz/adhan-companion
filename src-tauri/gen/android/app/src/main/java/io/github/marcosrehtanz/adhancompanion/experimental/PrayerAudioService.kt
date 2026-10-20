package io.github.marcosrehtanz.adhancompanion.experimental

import android.app.*
import android.content.*
import android.media.*
import android.os.*
import org.json.JSONObject
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

/** Servicio corto, visible y cancelable. No depende de que siga viva la WebView. */
class PrayerAudioService : Service() {
    companion object {
        @Volatile var active = false
            private set
    }
    private var player: MediaPlayer? = null
    private var focus: AudioFocusRequest? = null
    private val handler = Handler(Looper.getMainLooper())
    private val audio by lazy { getSystemService(AudioManager::class.java) }
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()
    private val listener = AudioManager.OnAudioFocusChangeListener { change -> if (change < 0) stopSelf() }
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP" || intent == null) { stopSelf(); return START_NOT_STICKY }
        release()
        try {
            PrayerAlarms.channels(this)
            val prayer = intent.getStringExtra("prayer") ?: error("Falta el rezo")
            val config = JSONObject(intent.getStringExtra("audio") ?: "{}")
            val alert = PrayerAlarms.alert(config, prayer)
            val stop = PendingIntent.getService(this, 7103, Intent(this, PrayerAudioService::class.java).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val notice = PrayerAlarms.builder(this, prayer.replaceFirstChar { it.uppercase() },
                if (intent.getBooleanExtra("preview", false)) "Prueba de sonido" else "Es hora del rezo.")
                .setOngoing(true).setAutoCancel(false).addAction(R.drawable.ic_prayer_notification, "Detener", stop).build()
            startForeground(7104, notice)
            active = true
            val granted = if (Build.VERSION.SDK_INT >= 26) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(listener, handler).build()
                focus = request
                audio.requestAudioFocus(request)
            } else { @Suppress("DEPRECATION") audio.requestAudioFocus(listener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) }
            check(granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Otra aplicación tiene prioridad sobre el audio." }
            val media = MediaPlayer()
            player = media
            media.setAudioAttributes(attributes)
            media.setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
            val volume = config.optInt("volume", 70).coerceIn(0, 100) / 100f
            media.setVolume(volume, volume)
            if (alert.getString("mode") == "tone") media.setDataSource(tone(alert).absolutePath)
            else {
                val file = if (prayer == "dhuhr") "default" else prayer
                assets.openFd("muecin/$file.wav").use { media.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
            }
            media.setOnPreparedListener { if (player === it) it.start() }
            media.setOnCompletionListener { stopSelf() }
            media.setOnErrorListener { _, what, extra -> PrayerAlarms.failure(this, IllegalStateException("Audio Android: $what / $extra")); stopSelf(); true }
            media.prepareAsync()
            handler.postDelayed({ stopSelf() }, if (alert.getString("mode") == "tone") alert.optInt("duration_secs", 3).coerceIn(1, 10) * 1000L + 3000 else 10 * 60 * 1000L)
        } catch (e: Exception) { PrayerAlarms.failure(this, e); stopSelf() }
        return START_NOT_STICKY // Nunca repetir el Adhan si Android recrea el servicio.
    }
    private fun tone(alert: JSONObject): File {
        val seconds = alert.optInt("duration_secs", 3).coerceIn(1, 10)
        val count = 22050 * seconds
        val bytes = ByteBuffer.allocate(44 + count * 2).order(ByteOrder.LITTLE_ENDIAN)
        bytes.put("RIFF".toByteArray()).putInt(36 + count * 2).put("WAVEfmt ".toByteArray()).putInt(16)
            .putShort(1.toShort()).putShort(1.toShort()).putInt(22050).putInt(44100).putShort(2.toShort()).putShort(16.toShort())
            .put("data".toByteArray()).putInt(count * 2)
        val kind = alert.optString("tone", "soft")
        repeat(count) { i ->
            val t = i / 22050.0
            val phase = if (kind == "double") t % 1.0 else t
            val envelope = min(phase / 0.025, 1.0) * ((seconds - t) / 0.1).coerceIn(0.0, 1.0)
            val frequency = if (kind == "bell") 880.0 else if (kind == "double") 660.0 else 440.0
            val decay = if (kind == "double") {
                val pulse = if (phase < 0.22) phase else phase - 0.35
                (pulse / 0.025).coerceIn(0.0, 1.0) * ((0.22 - pulse) / 0.025).coerceIn(0.0, 1.0)
            } else exp(-t * if (kind == "bell") 2.0 else 1.5)
            bytes.putShort((32767 * 0.22 * sin(2 * PI * frequency * t) * envelope * decay).toInt().toShort())
        }
        return File(cacheDir, "prayer-tone.wav").apply { writeBytes(bytes.array()) }
    }
    private fun release() {
        handler.removeCallbacksAndMessages(null)
        player?.release(); player = null
        if (Build.VERSION.SDK_INT >= 26) focus?.let { audio.abandonAudioFocusRequest(it) }
        else { @Suppress("DEPRECATION") audio.abandonAudioFocus(listener) }
        focus = null
    }
    override fun onDestroy() { active = false; release(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy() }
}
