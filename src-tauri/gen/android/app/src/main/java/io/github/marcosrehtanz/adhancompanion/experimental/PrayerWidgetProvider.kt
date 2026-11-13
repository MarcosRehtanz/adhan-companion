package io.github.marcosrehtanz.adhancompanion.experimental

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

open class BasePrayerWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    open fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        // Implementado por subclases
    }

    companion object {
        val PRAYER_NAMES = arrayOf("Fajr", "Dhuhr", "Asr", "Maghrib", "Isha")
        val PRAYER_ARABIC = arrayOf("الفجر", "الظهر", "العصر", "المغرب", "العشاء")

        fun openAppPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getActivity(context, 8001, intent, flags)
        }

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val solarComponent = ComponentName(context, PrayerSolarWidgetProvider::class.java)
            val solarIds = manager.getAppWidgetIds(solarComponent)
            if (solarIds.isNotEmpty()) {
                val solarProvider = PrayerSolarWidgetProvider()
                for (id in solarIds) solarProvider.updateWidget(context, manager, id)
            }

            val compactComponent = ComponentName(context, PrayerCompactWidgetProvider::class.java)
            val compactIds = manager.getAppWidgetIds(compactComponent)
            if (compactIds.isNotEmpty()) {
                val compactProvider = PrayerCompactWidgetProvider()
                for (id in compactIds) compactProvider.updateWidget(context, manager, id)
            }
        }
    }
}

class PrayerSolarWidgetProvider : BasePrayerWidgetProvider() {

    override fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.prayer_widget_solar)
        val pendingIntent = openAppPendingIntent(context)
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

        val prefs = context.getSharedPreferences("native-prayer-alarms", Context.MODE_PRIVATE)
        val configStr = prefs.getString("config", null)

        if (configStr.isNullOrEmpty()) {
            views.setTextViewText(R.id.widget_city, "Adhan Companion")
            views.setTextViewText(R.id.widget_next_name, "Configurar")
            views.setTextViewText(R.id.widget_next_time, "--:--")
            views.setTextViewText(R.id.widget_countdown, "Abrí la app para comenzar")
            appWidgetManager.updateAppWidget(appWidgetId, views)
            return
        }

        try {
            val cfg = JSONObject(configStr)
            val cityName = cfg.optString("city", "Adhan Companion")
            views.setTextViewText(R.id.widget_city, cityName)

            val now = Calendar.getInstance()
            val nowSec = now.get(Calendar.HOUR_OF_DAY) * 3600 + now.get(Calendar.MINUTE) * 60 + now.get(Calendar.SECOND)
            val offset = now.timeZone.getOffset(now.timeInMillis) / 3600000.0

            val rawTimes = PrayerNative.calculate(
                configStr,
                now.get(Calendar.YEAR),
                now.get(Calendar.MONTH) + 1,
                now.get(Calendar.DAY_OF_MONTH),
                offset
            )
            val times = JSONArray(rawTimes)

            val formatTime = { sec: Int ->
                val h = (sec / 3600) % 24
                val m = (sec % 3600) / 60
                String.format(Locale.ROOT, "%02d:%02d", h, m)
            }

            // Tiempos de hoy
            val fajrSec = times.getInt(0)
            val dhuhrSec = times.getInt(1)
            val asrSec = times.getInt(2)
            val maghribSec = times.getInt(3)
            val ishaSec = times.getInt(4)
            val sunriseSec = if (times.length() > 5 && !times.isNull(5)) times.getInt(5) else 0

            val prayerSecs = intArrayOf(fajrSec, dhuhrSec, asrSec, maghribSec, ishaSec)
            val cardIds = intArrayOf(R.id.widget_prayer_0, R.id.widget_prayer_1, R.id.widget_prayer_2, R.id.widget_prayer_3, R.id.widget_prayer_4)
            val nameIds = intArrayOf(R.id.widget_name_0, R.id.widget_name_1, R.id.widget_name_2, R.id.widget_name_3, R.id.widget_name_4)
            val timeIds = intArrayOf(R.id.widget_time_0, R.id.widget_time_1, R.id.widget_time_2, R.id.widget_time_3, R.id.widget_time_4)

            // Determinar próximo rezo
            var nextIndex = -1
            var nextSec = 0
            var isTomorrow = false

            for (i in prayerSecs.indices) {
                if (prayerSecs[i] > nowSec) {
                    nextIndex = i
                    nextSec = prayerSecs[i]
                    break
                }
            }

            if (nextIndex == -1) {
                // Ya pasó Isha: el próximo es Fajr de mañana
                isTomorrow = true
                nextIndex = 0
                val tomorrow = (now.clone() as Calendar).apply { add(Calendar.DATE, 1) }
                val tomTimes = JSONArray(PrayerNative.calculate(
                    configStr,
                    tomorrow.get(Calendar.YEAR),
                    tomorrow.get(Calendar.MONTH) + 1,
                    tomorrow.get(Calendar.DAY_OF_MONTH),
                    offset
                ))
                nextSec = tomTimes.getInt(0) + 86400
            }

            // Resaltar los 5 rezos en la tira
            for (i in 0 until 5) {
                views.setTextViewText(nameIds[i], PRAYER_NAMES[i])
                views.setTextViewText(timeIds[i], formatTime(prayerSecs[i]))
                if (!isTomorrow && i == nextIndex) {
                    views.setInt(cardIds[i], "setBackgroundResource", R.drawable.widget_chip_active)
                    views.setTextColor(nameIds[i], android.graphics.Color.parseColor("#d1fae5"))
                } else {
                    views.setInt(cardIds[i], "setBackgroundResource", R.drawable.widget_chip_inactive)
                    views.setTextColor(nameIds[i], android.graphics.Color.parseColor("#9bb8aa"))
                }
            }

            // Textos del próximo rezo
            val nextName = PRAYER_NAMES[nextIndex]
            val nextArabic = PRAYER_ARABIC[nextIndex]
            views.setTextViewText(R.id.widget_next_name, "$nextName • $nextArabic")
            views.setTextViewText(R.id.widget_next_time, formatTime(nextSec % 86400))

            // Cuenta regresiva
            val diffSec = nextSec - nowSec
            val countdownStr = when {
                diffSec <= 60 -> "¡Es la hora!"
                diffSec < 3600 -> "en ${diffSec / 60} min"
                else -> {
                    val h = diffSec / 3600
                    val m = (diffSec % 3600) / 60
                    if (m > 0) "en ${h}h ${m}m" else "en ${h}h"
                }
            }
            views.setTextViewText(R.id.widget_countdown, countdownStr)

            // Fecha en la cabecera
            val meses = arrayOf("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")
            val dateStr = "${now.get(Calendar.DAY_OF_MONTH)} ${meses[now.get(Calendar.MONTH)]} ${now.get(Calendar.YEAR)}"
            views.setTextViewText(R.id.widget_date, dateStr)

            // Renderizar Bitmap del Arco Solar
            val sunriseStr = if (sunriseSec > 0) formatTime(sunriseSec) else ""
            val sunsetStr = formatTime(maghribSec)
            val arcBitmap = SolarArcRenderer.render(
                context,
                720,
                220,
                sunriseSec,
                maghribSec,
                nowSec,
                sunriseStr,
                sunsetStr
            )
            views.setImageViewBitmap(R.id.widget_solar_arc, arcBitmap)

        } catch (e: Throwable) {
            views.setTextViewText(R.id.widget_next_name, "Adhan Companion")
            views.setTextViewText(R.id.widget_countdown, "Tocá para actualizar")
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }
}

class PrayerCompactWidgetProvider : BasePrayerWidgetProvider() {

    override fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.prayer_widget_compact)
        val pendingIntent = openAppPendingIntent(context)
        views.setOnClickPendingIntent(R.id.widget_compact_root, pendingIntent)

        val prefs = context.getSharedPreferences("native-prayer-alarms", Context.MODE_PRIVATE)
        val configStr = prefs.getString("config", null)

        if (configStr.isNullOrEmpty()) {
            views.setTextViewText(R.id.widget_compact_name, "Adhan Companion")
            views.setTextViewText(R.id.widget_compact_subtext, "Abrí la app para configurar")
            views.setTextViewText(R.id.widget_compact_time, "--:--")
            views.setTextViewText(R.id.widget_compact_countdown, "")
            appWidgetManager.updateAppWidget(appWidgetId, views)
            return
        }

        try {
            val cfg = JSONObject(configStr)
            val cityName = cfg.optString("city", "Adhan Companion")

            val now = Calendar.getInstance()
            val nowSec = now.get(Calendar.HOUR_OF_DAY) * 3600 + now.get(Calendar.MINUTE) * 60 + now.get(Calendar.SECOND)
            val offset = now.timeZone.getOffset(now.timeInMillis) / 3600000.0

            val rawTimes = PrayerNative.calculate(
                configStr,
                now.get(Calendar.YEAR),
                now.get(Calendar.MONTH) + 1,
                now.get(Calendar.DAY_OF_MONTH),
                offset
            )
            val times = JSONArray(rawTimes)

            val formatTime = { sec: Int ->
                val h = (sec / 3600) % 24
                val m = (sec % 3600) / 60
                String.format(Locale.ROOT, "%02d:%02d", h, m)
            }

            val prayerSecs = intArrayOf(times.getInt(0), times.getInt(1), times.getInt(2), times.getInt(3), times.getInt(4))
            var nextIndex = -1
            var nextSec = 0

            for (i in prayerSecs.indices) {
                if (prayerSecs[i] > nowSec) {
                    nextIndex = i
                    nextSec = prayerSecs[i]
                    break
                }
            }

            if (nextIndex == -1) {
                nextIndex = 0
                val tomorrow = (now.clone() as Calendar).apply { add(Calendar.DATE, 1) }
                val tomTimes = JSONArray(PrayerNative.calculate(
                    configStr,
                    tomorrow.get(Calendar.YEAR),
                    tomorrow.get(Calendar.MONTH) + 1,
                    tomorrow.get(Calendar.DAY_OF_MONTH),
                    offset
                ))
                nextSec = tomTimes.getInt(0) + 86400
            }

            val nextName = PRAYER_NAMES[nextIndex]
            val nextArabic = PRAYER_ARABIC[nextIndex]
            views.setTextViewText(R.id.widget_compact_name, "$nextName • $nextArabic")
            views.setTextViewText(R.id.widget_compact_subtext, cityName)
            views.setTextViewText(R.id.widget_compact_time, formatTime(nextSec % 86400))

            val diffSec = nextSec - nowSec
            val countdownStr = when {
                diffSec <= 60 -> "¡Es la hora!"
                diffSec < 3600 -> "en ${diffSec / 60} min"
                else -> {
                    val h = diffSec / 3600
                    val m = (diffSec % 3600) / 60
                    if (m > 0) "en ${h}h ${m}m" else "en ${h}h"
                }
            }
            views.setTextViewText(R.id.widget_compact_countdown, countdownStr)

        } catch (e: Throwable) {
            views.setTextViewText(R.id.widget_compact_name, "Adhan Companion")
            views.setTextViewText(R.id.widget_compact_countdown, "Actualizar")
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }
}
