package io.github.marcosrehtanz.adhancompanion.experimental

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.WindowManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.Locale

@InvokeArg class ConfigArgs { lateinit var config: String; var registro: String = "" }
@InvokeArg class ControlArgs { var action: String = "status" }
@InvokeArg class PreviewArgs { lateinit var audio: String; lateinit var prayer: String }
@InvokeArg class MapsLinkArgs { lateinit var url: String }
@InvokeArg class AcompanarArgs { var action: String = "status"; var sensor: Boolean = false }
@InvokeArg class OauthStartArgs { lateinit var url: String }
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

    @Command fun getGpsLocation(invoke: Invoke) {
        val lm = activity.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (lm == null) {
            invoke.reject("El servicio de ubicación no está disponible en este dispositivo.")
            return
        }

        val hasFine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarse = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

        val startFix = {
            val isFine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val isCoarse = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val isGpsEnabled = try { lm.isProviderEnabled(LocationManager.GPS_PROVIDER) } catch (_: Throwable) { false }
            val isNetEnabled = try { lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) } catch (_: Throwable) { false }

            if (!isGpsEnabled && !isNetEnabled) {
                invoke.reject("El sensor de ubicación (GPS) está desactivado en el teléfono. Activá la ubicación en los ajustes para continuar.")
            } else {
                val mainHandler = Handler(Looper.getMainLooper())
                var responded = false

                val finishWith = fun(loc: Location) {
                    if (responded) return
                    responded = true
                    GoogleMapsLinks.worker.execute {
                        var cityName = ""
                        try {
                            val geocoder = Geocoder(activity, Locale("es"))
                            val addresses = geocoder.getFromLocation(loc.latitude, loc.longitude, 1)
                            val addr = addresses?.firstOrNull()
                            cityName = addr?.locality ?: addr?.subAdminArea ?: addr?.adminArea ?: ""
                        } catch (_: Throwable) {}

                        invoke.resolve(JSObject().apply {
                            put("lat", loc.latitude)
                            put("lon", loc.longitude)
                            put("accuracy", loc.accuracy.toDouble())
                            put("city", cityName)
                        })
                    }
                }

                val lastGps = if (isFine && isGpsEnabled) try { lm.getLastKnownLocation(LocationManager.GPS_PROVIDER) } catch (_: SecurityException) { null } else null
                val lastNet = if ((isFine || isCoarse) && isNetEnabled) try { lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER) } catch (_: SecurityException) { null } else null
                val bestLast = when {
                    lastGps != null && lastNet != null -> if (lastGps.time >= lastNet.time) lastGps else lastNet
                    lastGps != null -> lastGps
                    else -> lastNet
                }

                val nowTime = System.currentTimeMillis()
                if (bestLast != null && (nowTime - bestLast.time) < 15_000 && bestLast.accuracy <= 25f) {
                    finishWith(bestLast)
                } else {
                    val listener = object : LocationListener {
                        override fun onLocationChanged(location: Location) {
                            mainHandler.removeCallbacksAndMessages(null)
                            try { lm.removeUpdates(this) } catch (_: Throwable) {}
                            finishWith(location)
                        }
                        @Deprecated("Deprecated in Java")
                        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                        override fun onProviderEnabled(provider: String) {}
                        override fun onProviderDisabled(provider: String) {}
                    }

                    val timeoutRunnable = Runnable {
                        try { lm.removeUpdates(listener) } catch (_: Throwable) {}
                        if (bestLast != null) {
                            finishWith(bestLast)
                        } else if (!responded) {
                            responded = true
                            invoke.reject("Tiempo de espera agotado sin señal GPS suficiente. Podés reintentar al aire libre o sugerir por IP.")
                        }
                    }
                    mainHandler.postDelayed(timeoutRunnable, 15_000)

                    mainHandler.post {
                        try {
                            if (isGpsEnabled && isFine) {
                                lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 0L, 0f, listener, Looper.getMainLooper())
                            }
                            if (isNetEnabled && (isFine || isCoarse)) {
                                lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 0L, 0f, listener, Looper.getMainLooper())
                            }
                            if (Build.VERSION.SDK_INT >= 31 && lm.allProviders.contains(LocationManager.FUSED_PROVIDER)) {
                                lm.requestLocationUpdates(LocationManager.FUSED_PROVIDER, 0L, 0f, listener, Looper.getMainLooper())
                            }
                        } catch (e: SecurityException) {
                            mainHandler.removeCallbacksAndMessages(null)
                            if (!responded) {
                                responded = true
                                invoke.reject("Permiso de ubicación no concedido: ${e.message}")
                            }
                        }
                    }
                }
            }
        }

        if (!hasFine && !hasCoarse) {
            val wry = activity as? WryActivity
            if (wry != null) {
                wry.requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) { _ ->
                    val nowFine = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    val nowCoarse = ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                    if (nowFine || nowCoarse) {
                        startFix()
                    } else {
                        invoke.reject("Permiso de ubicación denegado. Para obtener la posición exacta del GPS, concedé el permiso en los Ajustes del sistema.")
                    }
                }
            } else {
                invoke.reject("No se pudo iniciar la solicitud de permisos.")
            }
        } else {
            startFix()
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

    /**
     * OAuth Google (sync_android.rs): abre la pantalla de autorización con el
     * navegador del sistema (intent VIEW). La vuelta del navegador llega por
     * custom scheme a esta actividad (OauthLogin.SCHEME ↔ sync_android.rs) y se
     * entrega por polling con oauthConsume. No se bloquea: el Rust espera.
     */
    @Command fun oauthStart(invoke: Invoke) {
        val url = invoke.parseArgs(OauthStartArgs::class.java).url
        try {
            activity.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, Uri.parse(url)))
            invoke.resolve()
        } catch (e: ActivityNotFoundException) {
            invoke.reject("No hay navegador en el dispositivo. La URL de autorización queda en el panel para copiarla.")
        } catch (e: Throwable) {
            invoke.reject(e.message ?: "No se pudo abrir la autorización de Google.")
        }
    }

    /**
     * Consulta/consume el callback pendiente (MainActivity lo dejó en
     * OauthLogin): devuelve {"callback": "<uri>"} o un objeto vacío.
     */
    @Command fun oauthConsume(invoke: Invoke) {
        val r = JSObject()
        OauthLogin.pendiente?.let { r.put("callback", it.toString()) }
        OauthLogin.pendiente = null
        invoke.resolve(r)
    }

}
