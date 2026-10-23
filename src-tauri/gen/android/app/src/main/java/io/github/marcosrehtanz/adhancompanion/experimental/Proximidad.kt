package io.github.marcosrehtanz.adhancompanion.experimental

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import org.json.JSONObject

/**
 * Sensor de proximidad para acompañar el rezo. Solo registra si hay algo cerca y desde cuándo;
 * la interfaz lo consulta y decide cuándo es una postración (cerca durante un rato) y cuándo
 * la persona se levantó. Se activa al empezar el acompañamiento y se suelta al terminar.
 */
object Proximidad : SensorEventListener {
    private var manager: SensorManager? = null
    @Volatile private var activo = false
    @Volatile private var cerca = false
    @Volatile private var cambio = 0L

    private fun sensor(context: Context): Sensor? =
        (context.getSystemService(Context.SENSOR_SERVICE) as SensorManager).getDefaultSensor(Sensor.TYPE_PROXIMITY)

    fun start(context: Context) {
        if (activo) return
        val m = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val s = m.getDefaultSensor(Sensor.TYPE_PROXIMITY) ?: error("Este teléfono no tiene sensor de proximidad.")
        cerca = false
        cambio = SystemClock.elapsedRealtime()
        if (!m.registerListener(this, s, SensorManager.SENSOR_DELAY_NORMAL)) error("No se pudo activar el sensor de proximidad.")
        manager = m
        activo = true
    }

    fun stop() {
        manager?.unregisterListener(this)
        manager = null
        activo = false
        cerca = false
    }

    // Muchos sensores son binarios: informan 0 (cerca) o su alcance máximo (lejos).
    override fun onSensorChanged(event: SensorEvent) {
        val ahora = event.values[0] < event.sensor.maximumRange
        if (ahora != cerca) {
            cerca = ahora
            cambio = SystemClock.elapsedRealtime()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    /** `since` identifica el tramo actual (cerca o lejos); `elapsed`, cuánto lleva en milisegundos. */
    fun state(context: Context): JSONObject = JSONObject()
        .put("sensor", sensor(context) != null)
        .put("active", activo)
        .put("near", cerca)
        .put("since", cambio)
        .put("elapsed", SystemClock.elapsedRealtime() - cambio)
}
