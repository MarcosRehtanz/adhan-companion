package io.github.marcosrehtanz.adhancompanion.experimental

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg class ConfigArgs { lateinit var config: String; var registro: String = "" }
@InvokeArg class ControlArgs { var action: String = "status" }
@InvokeArg class PreviewArgs { lateinit var audio: String; lateinit var prayer: String }
@InvokeArg class MapsLinkArgs { lateinit var url: String }
@InvokeArg class AcompanarArgs { var action: String = "status"; var sensor: Boolean = false }
@InvokeArg class QuranArgs {
    var action: String = "state"; var sura: Int = 0; var aya: Int = 0; var count: Int = 0
    var volume: Int = 70; var keep: Boolean = false; var url: String = ""; var path: String = ""; var max: Long = 0
}

@TauriPlugin
class AdhanPlugin(private val activity: Activity) : Plugin(activity) {
    @Command fun mapsRedirect(invoke: Invoke) {
        val url = invoke.parseArgs(MapsLinkArgs::class.java).url
        GoogleMapsLinks.worker.execute {
            try { invoke.resolve(JSObject().put("location", GoogleMapsLinks.redirect(url))) }
            catch (e: Exception) {
                invoke.reject(when (e) {
                    is java.net.SocketTimeoutException -> "Google Maps tardó demasiado. Revisá la conexión y reintentá."
                    is java.io.IOException -> "No se pudo consultar Google Maps. Revisá la conexión y reintentá."
                    else -> e.message ?: "No se pudo leer el enlace de Google Maps."
                })
            }
        }
    }
    private fun background(invoke: Invoke, block: () -> Unit) {
        PrayerAlarms.worker.execute {
            try { block(); invoke.resolve(JSObject(PrayerAlarms.status(activity).toString())) }
            catch (e: Throwable) { PrayerAlarms.failure(activity, e); invoke.reject(e.message ?: "Error Android") }
        }
    }
    @Command fun sync(invoke: Invoke) {
        val args = invoke.parseArgs(ConfigArgs::class.java)
        background(invoke) { PrayerAlarms.sync(activity, args.config, args.registro) }
    }
    @Command fun control(invoke: Invoke) {
        val action = invoke.parseArgs(ControlArgs::class.java).action
        when (action) {
            "notifications" -> {
                launchNotifications()
                invoke.resolve(JSObject(PrayerAlarms.status(activity).toString()))
            }
            "exact" -> {
                if (Build.VERSION.SDK_INT >= 31) activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${activity.packageName}")))
                invoke.resolve(JSObject(PrayerAlarms.status(activity).toString()))
            }
            "battery" -> {
                // Pantalla del sistema «Uso optimizado de batería»: sin permiso declarado y válida de Play.
                try {
                    activity.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                } catch (e: ActivityNotFoundException) {
                    activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}")))
                }
                invoke.resolve(JSObject(PrayerAlarms.status(activity).toString()))
            }
            "enable" -> {
                // Cadena de activación: anota la intención y va por el primer permiso que falta
                // (diálogo de notificaciones o pantalla de alarmas exactas). Al volver a la app,
                // MainActivity llama completePendingEnable: si los permisos ya están, activa y programa.
                val sinNotificaciones = !PrayerAlarms.notifications(activity)
                if (sinNotificaciones || !PrayerAlarms.exact(activity)) {
                    PrayerAlarms.setPendingEnable(activity, true)
                    if (sinNotificaciones) launchNotifications()
                    else if (Build.VERSION.SDK_INT >= 31) activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${activity.packageName}")))
                    invoke.resolve(JSObject(PrayerAlarms.status(activity).toString()))
                } else background(invoke) { PrayerAlarms.enable(activity, true) }
            }
            "disable", "status", "reschedule" -> background(invoke) {
                if (action == "reschedule") PrayerAlarms.reschedule(activity)
                else if (action != "status") PrayerAlarms.enable(activity, false)
            }
            else -> invoke.reject("Acción desconocida")
        }
    }

    /** Diálogo runtime de notificaciones (Android 13+); si ya fue negado, la pantalla de ajustes. */
    private fun launchNotifications() {
        val prefs = activity.getSharedPreferences("native-prayer-alarms", android.content.Context.MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 && !PrayerAlarms.notifications(activity) &&
            (!prefs.getBoolean("notification_requested", false) || ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS))) {
            prefs.edit().putBoolean("notification_requested", true).apply()
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7105)
        } else activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName))
    }
    @Command fun preview(invoke: Invoke) {
        val args = invoke.parseArgs(PreviewArgs::class.java)
        try { PrayerAlarms.play(activity, JSONObject(args.audio), args.prayer, true); invoke.resolve() }
        catch (e: Throwable) { invoke.reject(e.message ?: "No se pudo iniciar el audio") }
    }
    @Command fun stop(invoke: Invoke) {
        activity.stopService(Intent(activity, PrayerAudioService::class.java)); invoke.resolve()
    }
    /** Recitación: Rust conserva descargas y punto de escucha; QuranPlayer reproduce. */
    @Command fun quran(invoke: Invoke) {
        val args = invoke.parseArgs(QuranArgs::class.java)
        val context = activity.applicationContext
        if (args.action == "fetch") {
            QuranFetch.worker.execute {
                try { QuranFetch.fetch(args.url, args.path, args.max); invoke.resolve() }
                catch (e: Throwable) { invoke.reject(e.message ?: "No se pudo descargar la recitación.") }
            }
            return
        }
        try {
            when (args.action) {
                "state" -> {}
                "play" -> QuranPlayer.play(context, args.sura, args.aya, args.count, args.volume, args.keep)
                "pause" -> QuranPlayer.pause()
                "resume" -> QuranPlayer.resume()
                "stop" -> QuranPlayer.stop()
                "volume" -> QuranPlayer.volume(args.volume)
                "cancelFetch" -> QuranFetch.cancel()
                else -> error("Acción de recitación desconocida.")
            }
            invoke.resolve(JSObject(QuranPlayer.state(context).toString()))
        } catch (e: Throwable) { invoke.reject(e.message ?: "No se pudo controlar la recitación.") }
    }
    @Command fun update(invoke: Invoke) {
        try {
            when (val action = invoke.parseArgs(ControlArgs::class.java).action) {
                "status" -> {}
                "check", "download", "cancel" -> AndroidUpdates.start(activity.applicationContext, action)
                "install" -> AndroidUpdates.install(activity)
                "permission" -> AndroidUpdates.permission(activity)
                else -> error("Acción desconocida")
            }
            invoke.resolve(JSObject(AndroidUpdates.status(activity).toString()))
        } catch (e: Exception) { invoke.reject(e.message ?: "No se pudo actualizar") }
    }
    /** Acompañar el rezo: pantalla encendida mientras dura y, si se pide, el sensor de proximidad. */
    @Command fun acompanar(invoke: Invoke) {
        val args = invoke.parseArgs(AcompanarArgs::class.java)
        activity.runOnUiThread {
            try {
                when (args.action) {
                    "status", "read" -> {}
                    "start" -> {
                        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        if (args.sensor) Proximidad.start(activity) else Proximidad.stop()
                    }
                    "stop" -> {
                        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        Proximidad.stop()
                    }
                    else -> error("Acción desconocida")
                }
                invoke.resolve(JSObject(Proximidad.state(activity).toString()))
            } catch (e: Throwable) { invoke.reject(e.message ?: "No se pudo acompañar el rezo.") }
        }
    }

}
