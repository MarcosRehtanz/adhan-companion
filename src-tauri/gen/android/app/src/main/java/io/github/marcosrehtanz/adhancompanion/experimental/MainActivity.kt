package io.github.marcosrehtanz.adhancompanion.experimental

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private fun checkPinWidget(i: Intent) {
    if (i.getBooleanExtra("pin_widget", false)) {
      val kind = i.getStringExtra("pin_kind") ?: "solar"
      i.removeExtra("pin_widget")
      if (android.os.Build.VERSION.SDK_INT >= 26) {
        val manager = getSystemService(android.appwidget.AppWidgetManager::class.java)
        if (manager != null && manager.isRequestPinAppWidgetSupported) {
          val cls = if (kind == "compact") PrayerCompactWidgetProvider::class.java else PrayerSolarWidgetProvider::class.java
          manager.requestPinAppWidget(android.content.ComponentName(this, cls), null, null)
        }
      }
    }
  }

  override fun onResume() {
    super.onResume()
    checkPinWidget(intent)
    // Vuelta de Ajustes (alarmas exactas, batería) o del diálogo: completa la cadena pendiente
    // de «Activar avisos» y reprograma. Single-threaded: el orden es determinista.
    PrayerAlarms.worker.execute {
      PrayerAlarms.completePendingEnable(applicationContext)
      PrayerAlarms.schedule(applicationContext)
    }
  }
  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    PrayerAlarms.worker.execute {
      PrayerAlarms.completePendingEnable(applicationContext)
      PrayerAlarms.schedule(applicationContext)
    }
  }
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    checkPinWidget(intent)
    // Vuelta del navegador tras la autorización OAuth (custom scheme, app ya viva).
    OauthLogin.registrar(intent.data, packageName)
    // Limpiar data para que giros de pantalla o recents no re-inyecten el URI consumido
    intent.data = null
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Redirect OAuth con la app muerta (cold start directo al callback).
    OauthLogin.registrar(intent.data, packageName)
    intent.data = null
  }
}
