package io.github.marcosrehtanz.adhancompanion.experimental

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
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
