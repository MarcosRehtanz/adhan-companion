package io.github.marcosrehtanz.adhancompanion.experimental

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onResume() {
    super.onResume()
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
