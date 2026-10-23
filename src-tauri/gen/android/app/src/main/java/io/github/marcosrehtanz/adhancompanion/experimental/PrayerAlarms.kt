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
    /** El registro lo lee Rust: el receptor no duplica la regla «el último evento gana». */
    @JvmStatic external fun marked(registro: String, date: String, prayer: String): Boolean
}

/** Solo persiste una copia privada del contrato Rust. El cálculo siempre pasa por PrayTimes C. */
object PrayerAlarms {
    val worker = Executors.newSingleThreadExecutor()
    val prayers = arrayOf("fajr", "dhuhr", "asr", "maghrib", "isha")
    // Tres alarmas: el rezo, el preaviso y el recordatorio si el rezo no se marcó.
    const val KIND_PRAYER = 0
    const val KIND_PRE = 1
    const val KIND_REMINDER = 2
    private val CODES = intArrayOf(7101, 7102, 7103)
    private val ACTIONS = arrayOf("adhan.PRAYER", "adhan.PRE", "adhan.REMINDER")
    private val KEYS = arrayOf("next", "next_pre", "next_reminder")
    private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    fun isAlarm(action: String?) = action in ACTIONS
    private fun prefs(c: Context) = c.getSharedPreferences("native-prayer-alarms", Context.MODE_PRIVATE)
    private fun manager(c: Context) = c.getSystemService(AlarmManager::class.java)
    fun exact(c: Context) = Build.VERSION.SDK_INT < 31 || manager(c).canScheduleExactAlarms()
    fun notifications(c: Context) = NotificationManagerCompat.from(c).areNotificationsEnabled()
    private fun pending(c: Context, kind: Int, intent: Intent = Intent(c, PrayerAlarmReceiver::class.java)): PendingIntent =
        PendingIntent.getBroadcast(c, CODES[kind], intent.setAction(ACTIONS[kind]), FLAGS)

    @Synchronized fun sync(c: Context, config: String, registro: String) {
        JSONObject(config) // No aceptar datos parciales/ilegibles.
        val p = prefs(c)
        if (p.getString("config", "") != config) {
            check(p.edit().putString("config", config).putLong("generation", p.getLong("generation", 0) + 1).commit())
        }
        val edit = p.edit().remove("error")
        if (registro.isNotEmpty()) edit.putString("registro", registro)
        edit.apply()
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
    private data class Event(val prayer: String, val at: Long, val kind: Int, val day: String)

    /** Medianoche local del día YYYY-MM-DD, o 0 si no hay fecha válida. */
    private fun dayStart(day: String): Long {
        val parts = day.split("-").mapNotNull { it.toIntOrNull() }
        if (parts.size != 3) return 0L
        return Calendar.getInstance().apply { clear(); set(parts[0], parts[1] - 1, parts[2], 0, 0, 0) }.timeInMillis
    }
    private fun dayOf(date: Calendar) = String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", date.get(Calendar.YEAR), date.get(Calendar.MONTH) + 1, date.get(Calendar.DAY_OF_MONTH))

    /**
     * Mantiene tres alarmas: próximo rezo, próximo preaviso y próximo recordatorio. Cada entrega
     * programa las siguientes. Con pausa (`follow_up.paused_until`), nada antes del día en que vuelven.
     */
    @Synchronized fun schedule(c: Context) {
        val p = prefs(c)
        for (kind in CODES.indices) manager(c).cancel(pending(c, kind))
        p.edit().remove(KEYS[0]).remove(KEYS[1]).remove(KEYS[2]).apply()
        if (!p.getBoolean("enabled", false) || !exact(c) || !notifications(c)) return
        try {
            val config = p.getString("config", null) ?: error("Abrí la app y guardá tu ubicación primero.")
            val cfg = JSONObject(config)
            val before = cfg.getJSONObject("notice").getInt("minutes_before").coerceIn(0, 120)
            val followUp = cfg.optJSONObject("follow_up")
            val reminder = followUp?.optBoolean("reminder", false) == true
            val reminderMinutes = (followUp?.optInt("minutes", 30) ?: 30).coerceIn(5, 120)
            val now = System.currentTimeMillis()
            val resume = dayStart(followUp?.optString("paused_until", "") ?: "")
            val from = maxOf(now, resume)
            val events = mutableListOf<Event>()
            val date = Calendar.getInstance().apply {
                if (resume > now) timeInMillis = resume
                set(Calendar.HOUR_OF_DAY, 12); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }
            repeat(3) {
                val offset = date.timeZone.getOffset(date.timeInMillis) / 3600000.0
                val times = JSONArray(PrayerNative.calculate(config, date.get(Calendar.YEAR), date.get(Calendar.MONTH) + 1, date.get(Calendar.DAY_OF_MONTH), offset))
                val day = dayOf(date)
                val atOf = { i: Int -> (date.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, times.getInt(i)) }.timeInMillis }
                // Índice 5: la salida del sol, donde termina el tiempo de Fajr (y su recordatorio).
                val sunrise = if (times.length() > 5 && !times.isNull(5)) atOf(5) else null
                prayers.forEachIndexed { i, prayer ->
                    if (!times.isNull(i)) {
                        val at = atOf(i)
                        if (at > from) events.add(Event(prayer, at, KIND_PRAYER, day))
                        if (before > 0 && at - before * 60000L > from) events.add(Event(prayer, at - before * 60000L, KIND_PRE, day))
                        if (reminder) {
                            // Hasta que empiece el rezo siguiente del mismo día; Fajr, hasta la salida del sol.
                            var next = (i + 1 until prayers.size).firstOrNull { !times.isNull(it) }?.let { atOf(it) } ?: Long.MAX_VALUE
                            if (i == 0 && sunrise != null) next = minOf(next, sunrise)
                            val at2 = at + reminderMinutes * 60000L
                            if (at2 > from && at2 < next) events.add(Event(prayer, at2, KIND_REMINDER, day))
                        }
                    }
                }
                date.add(Calendar.DATE, 1)
            }
            for (kind in CODES.indices) {
                val e = events.filter { it.kind == kind }.minByOrNull { it.at } ?: continue
                val intent = Intent(c, PrayerAlarmReceiver::class.java)
                    .putExtra("at", e.at).putExtra("prayer", e.prayer).putExtra("kind", kind).putExtra("day", e.day)
                    .putExtra("generation", p.getLong("generation", 0))
                val operation = pending(c, kind, intent)
                if (kind == KIND_PRAYER) manager(c).setAlarmClock(AlarmManager.AlarmClockInfo(e.at, open(c)), operation)
                else manager(c).setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, e.at, operation)
                p.edit().putLong(KEYS[kind], e.at).apply()
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
            .put("next_pre", p.getLong("next_pre", 0)).put("next_reminder", p.getLong("next_reminder", 0)).put("error", p.getString("error", ""))
            .put("last_event", p.getString("last_event", ""))
            .put("playing", PrayerAudioService.active)
    }
    @Synchronized fun deliver(c: Context, intent: Intent) {
        val p = prefs(c)
        val at = intent.getLongExtra("at", 0)
        val prayer = intent.getStringExtra("prayer") ?: ""
        val kind = intent.getIntExtra("kind", -1)
        val id = "$prayer:$at:$kind"
        try {
            // El recordatorio tolera algo más de demora (Doze); el Adhan no suena tarde.
            val late = if (kind == KIND_REMINDER) 600000L else 120000L
            if (kind !in CODES.indices || !p.getBoolean("enabled", false) || !notifications(c) || prayer !in prayers ||
                intent.getLongExtra("generation", -1) != p.getLong("generation", 0) ||
                at != p.getLong(KEYS[kind], 0) ||
                System.currentTimeMillis() - at !in 0..late || p.getString("last_$kind", "") == id) return
            // Commit antes de emitir: una entrega duplicada no repite el Adhan.
            check(p.edit().putString("last_$kind", id).putString("last_event", id).commit())
            val cfg = JSONObject(p.getString("config", "{}")!!)
            when (kind) {
                KIND_PRE -> notify(c, prayer, "El rezo comienza en ${cfg.getJSONObject("notice").getInt("minutes_before")} minutos.", true)
                KIND_REMINDER -> {
                    // Solo si sigue sin marcar; sin la ruta del registro no se puede saber y no se avisa.
                    val registro = p.getString("registro", "") ?: ""
                    if (registro.isNotEmpty() && !PrayerNative.marked(registro, intent.getStringExtra("day") ?: "", prayer)) remind(c, prayer)
                }
                else -> play(c, cfg.getJSONObject("audio"), prayer, false)
            }
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
            // Como en escritorio: el Adhan o tono pausa la recitación y se reanuda a mano.
            QuranPlayer.interrupt()
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
            n.createNotificationChannel(NotificationChannel("quran", "Recitación del Qur’an", NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null); enableVibration(false) })
        }
    }
    fun builder(c: Context, title: String, body: String, pre: Boolean = false): NotificationCompat.Builder =
        NotificationCompat.Builder(c, if (pre) "pre-prayer" else "prayer")
            .setSmallIcon(R.drawable.ic_prayer_notification).setContentTitle(title).setContentText(body)
            .setContentIntent(open(c)).setAutoCancel(true).setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT).apply { if (!pre) setSilent(true) }
    private fun notify(c: Context, prayer: String, body: String, pre: Boolean) {
        channels(c)
        c.getSystemService(NotificationManager::class.java).notify(CODES[if (pre) KIND_PRE else KIND_PRAYER],
            builder(c, prayer.replaceFirstChar { it.uppercase() }, body, pre).build())
    }
    private fun remind(c: Context, prayer: String) {
        channels(c)
        c.getSystemService(NotificationManager::class.java).notify(CODES[KIND_REMINDER],
            builder(c, "¿Ya rezaste ${prayer.replaceFirstChar { it.uppercase() }}?", "Marcalo en la app.", true).build())
    }
}

class PrayerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Programar el siguiente aviso aun si Android inició este proceso sin UI.
        val pending = goAsync()
        PrayerAlarms.worker.execute {
            try {
                if (PrayerAlarms.isAlarm(intent.action)) PrayerAlarms.deliver(context, intent)
                else PrayerAlarms.schedule(context) // BOOT no inicia reproducción.
            } catch (e: Throwable) { PrayerAlarms.failure(context, e) }
            finally { pending.finish() }
        }
    }
}
