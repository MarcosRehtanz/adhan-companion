package io.github.marcosrehtanz.adhancompanion.experimental

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg class ConfigArgs { lateinit var config: String }
@InvokeArg class ControlArgs { var action: String = "status" }
@InvokeArg class PreviewArgs { lateinit var audio: String; lateinit var prayer: String }
@InvokeArg class MapsLinkArgs { lateinit var url: String }

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
        background(invoke) { PrayerAlarms.sync(activity, args.config) }
    }
    @Command fun control(invoke: Invoke) {
        val action = invoke.parseArgs(ControlArgs::class.java).action
        when (action) {
            "notifications" -> {
                val prefs = activity.getSharedPreferences("native-prayer-alarms", android.content.Context.MODE_PRIVATE)
                if (Build.VERSION.SDK_INT >= 33 && !PrayerAlarms.notifications(activity) &&
                    (!prefs.getBoolean("notification_requested", false) || ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS))) {
                    prefs.edit().putBoolean("notification_requested", true).apply()
                    ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7105)
                } else activity.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName))
                invoke.resolve(JSObject(PrayerAlarms.status(activity).toString()))
            }
            "exact" -> {
                if (Build.VERSION.SDK_INT >= 31) activity.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${activity.packageName}")))
                invoke.resolve(JSObject(PrayerAlarms.status(activity).toString()))
            }
            "enable", "disable", "status", "reschedule" -> background(invoke) {
                if (action == "reschedule") PrayerAlarms.reschedule(activity)
                else if (action != "status") PrayerAlarms.enable(activity, action == "enable")
            }
            else -> invoke.reject("Acción desconocida")
        }
    }
    @Command fun preview(invoke: Invoke) {
        val args = invoke.parseArgs(PreviewArgs::class.java)
        try { PrayerAlarms.play(activity, JSONObject(args.audio), args.prayer, true); invoke.resolve() }
        catch (e: Throwable) { invoke.reject(e.message ?: "No se pudo iniciar el audio") }
    }
    @Command fun stop(invoke: Invoke) {
        activity.stopService(Intent(activity, PrayerAudioService::class.java)); invoke.resolve()
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

}
