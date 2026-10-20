package io.github.marcosrehtanz.adhancompanion.experimental

import android.app.*
import android.content.*
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.concurrent.Executors

object PrayerNative {
    init { System.loadLibrary("adhan_companion_lib") }
    @JvmStatic external fun calculate(config: String, year: Int, month: Int, day: Int, offset: Double): String
}

/** Solo persiste una copia privada del contrato Rust. El cálculo siempre pasa por PrayTimes C. */
object PrayerAlarms {
    val worker = Executors.newSingleThreadExecutor()
    val prayers = arrayOf("fajr", "dhuhr", "asr", "maghrib", "isha")
    private const val PRAYER = 7101
    private const val PRE = 7102
    private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    private fun prefs(c: Context) = c.getSharedPreferences("native-prayer-alarms", Context.MODE_PRIVATE)
    private fun manager(c: Context) = c.getSystemService(AlarmManager::class.java)
    fun exact(c: Context) = Build.VERSION.SDK_INT < 31 || manager(c).canScheduleExactAlarms()
    fun notifications(c: Context) = NotificationManagerCompat.from(c).areNotificationsEnabled()
    private fun pending(c: Context, pre: Boolean, intent: Intent = Intent(c, PrayerAlarmReceiver::class.java)): PendingIntent =
        PendingIntent.getBroadcast(c, if (pre) PRE else PRAYER, intent.setAction(if (pre) "adhan.PRE" else "adhan.PRAYER"), FLAGS)

    @Synchronized fun sync(c: Context, config: String) {
        JSONObject(config) // No aceptar datos parciales/ilegibles.
        val p = prefs(c)
        if (p.getString("config", "") != config) {
            check(p.edit().putString("config", config).putLong("generation", p.getLong("generation", 0) + 1).commit())
        }
        p.edit().remove("error").apply()
        schedule(c)
    }
    @Synchronized fun enable(c: Context, enabled: Boolean) {
        if (enabled) check(exact(c) && notifications(c)) { "Concedé los permisos antes de activar los avisos." }
        val p = prefs(c)
        check(p.edit().putBoolean("enabled", enabled).putLong("generation", p.getLong("generation", 0) + 1).remove("error").commit())
        if (!enabled) c.stopService(Intent(c, PrayerAudioService::class.java))
        schedule(c)
    }
    @Synchronized fun reschedule(c: Context) {
        prefs(c).edit().remove("error").commit()
        schedule(c)
    }
    private data class Event(val prayer: String, val at: Long, val pre: Boolean)

    /** Mantiene dos alarmas: próximo rezo y próximo preaviso. Cada entrega programa las siguientes. */
    @Synchronized fun schedule(c: Context) {
        val p = prefs(c)
        manager(c).cancel(pending(c, false)); manager(c).cancel(pending(c, true))
        p.edit().remove("next").remove("next_pre").apply()
        if (!p.getBoolean("enabled", false) || !exact(c) || !notifications(c)) return
        try {
            val config = p.getString("config", null) ?: error("Abrí la app y guardá tu ubicación primero.")
            val cfg = JSONObject(config)
            val before = cfg.getJSONObject("notice").getInt("minutes_before").coerceIn(0, 120)
            val now = System.currentTimeMillis()
            val events = mutableListOf<Event>()
            val date = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 12); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
            repeat(3) {
                val offset = date.timeZone.getOffset(date.timeInMillis) / 3600000.0
                val times = JSONArray(PrayerNative.calculate(config, date.get(Calendar.YEAR), date.get(Calendar.MONTH) + 1, date.get(Calendar.DAY_OF_MONTH), offset))
                prayers.forEachIndexed { i, prayer ->
                    if (!times.isNull(i)) {
                        val second = times.getInt(i)
                        val at = (date.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, second) }.timeInMillis
                        if (at > now) events.add(Event(prayer, at, false))
                        if (before > 0 && at - before * 60000L > now) events.add(Event(prayer, at - before * 60000L, true))
                    }
                }
                date.add(Calendar.DATE, 1)
            }
            for (pre in listOf(false, true)) {
                val e = events.filter { it.pre == pre }.minByOrNull { it.at } ?: continue
                val intent = Intent(c, PrayerAlarmReceiver::class.java)
                    .putExtra("at", e.at).putExtra("prayer", e.prayer).putExtra("pre", pre)
                    .putExtra("generation", p.getLong("generation", 0))
                val operation = pending(c, pre, intent)
                if (pre) manager(c).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, operation)
                else manager(c).setAlarmClock(AlarmManager.AlarmClockInfo(e.at, open(c)), operation)
                p.edit().putLong(if (pre) "next_pre" else "next", e.at).apply()
            }
        } catch (e: Throwable) { failure(c, e) }
    }
    fun failure(c: Context, e: Throwable) {
        prefs(c).edit().putString("error", e.message ?: "No se pudo programar el aviso.").commit()
    }
    fun status(c: Context): JSONObject {
        channels(c)
        val p = prefs(c)
        return JSONObject().put("enabled", p.getBoolean("enabled", false)).put("exact", exact(c))
            .put("notifications", notifications(c)).put("next", p.getLong("next", 0))
            .put("next_pre", p.getLong("next_pre", 0)).put("error", p.getString("error", ""))
            .put("last_event", p.getString("last_event", ""))
            .put("playing", PrayerAudioService.active)
    }
    @Synchronized fun deliver(c: Context, intent: Intent) {
        val p = prefs(c)
        val at = intent.getLongExtra("at", 0)
        val prayer = intent.getStringExtra("prayer") ?: ""
        val pre = intent.getBooleanExtra("pre", false)
        val id = "$prayer:$at:$pre"
        try {
            if (!p.getBoolean("enabled", false) || !notifications(c) || prayer !in prayers ||
                intent.getLongExtra("generation", -1) != p.getLong("generation", 0) ||
                at != p.getLong(if (pre) "next_pre" else "next", 0) ||
                System.currentTimeMillis() - at !in 0..120000L || p.getString("last_$pre", "") == id) return
            // Commit antes de emitir: una entrega duplicada no repite el Adhan.
            check(p.edit().putString("last_$pre", id).putString("last_event", id).commit())
            val cfg = JSONObject(p.getString("config", "{}")!!)
            if (pre) notify(c, prayer, "El rezo comienza en ${cfg.getJSONObject("notice").getInt("minutes_before")} minutos.", true)
            else play(c, cfg.getJSONObject("audio"), prayer, false)
        } catch (e: Throwable) { failure(c, e) }
        finally { schedule(c) }
    }
    fun alert(audio: JSONObject, prayer: String): JSONObject = audio.optJSONObject("alerts")?.optJSONObject(prayer)
        ?: JSONObject().put("mode", if (audio.optJSONObject("enabled")?.optBoolean(prayer, true) == false) "notification" else "adhan").put("tone", "soft").put("duration_secs", 3)
    fun play(c: Context, audio: JSONObject, prayer: String, preview: Boolean) {
        require(prayer in prayers)
        check(notifications(c)) { "Habilitá las notificaciones de la app para usar los avisos y el control Detener." }
        channels(c)
        if (alert(audio, prayer).getString("mode") == "notification") {
            c.stopService(Intent(c, PrayerAudioService::class.java))
            notify(c, prayer, if (preview) "Prueba de aviso" else "Es hora del rezo.", false)
        } else {
            val i = Intent(c, PrayerAudioService::class.java).putExtra("audio", audio.toString()).putExtra("prayer", prayer).putExtra("preview", preview)
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
        }
    }
    fun open(c: Context): PendingIntent = PendingIntent.getActivity(c, 7100, Intent(c, MainActivity::class.java), FLAGS)
    fun channels(c: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val n = c.getSystemService(NotificationManager::class.java)
            n.createNotificationChannel(NotificationChannel("prayer", "Rezos y reproducción", NotificationManager.IMPORTANCE_DEFAULT).apply { setSound(null, null); enableVibration(false) })
            n.createNotificationChannel(NotificationChannel("pre-prayer", "Preavisos", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }
    fun builder(c: Context, title: String, body: String, pre: Boolean = false): NotificationCompat.Builder =
        NotificationCompat.Builder(c, if (pre) "pre-prayer" else "prayer")
            .setSmallIcon(R.drawable.ic_prayer_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(open(c)).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT).apply { if (!pre) setSilent(true) }
    private fun notify(c: Context, prayer: String, body: String, pre: Boolean) {
        channels(c)
        c.getSystemService(NotificationManager::class.java).notify(if (pre) PRE else PRAYER,
            builder(c, prayer.replaceFirstChar { it.uppercase() }, body, pre).build())
    }
}

class PrayerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Programar el siguiente aviso aun si Android inició este proceso sin UI.
        val pending = goAsync()
        PrayerAlarms.worker.execute {
            try {
                if (intent.action == "adhan.PRAYER" || intent.action == "adhan.PRE") PrayerAlarms.deliver(context, intent)
                else PrayerAlarms.schedule(context) // BOOT no inicia reproducción.
            } catch (e: Throwable) { PrayerAlarms.failure(context, e) }
            finally { pending.finish() }
        }
    }
}
