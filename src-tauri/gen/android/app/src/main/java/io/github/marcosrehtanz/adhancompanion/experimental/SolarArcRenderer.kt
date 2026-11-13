package io.github.marcosrehtanz.adhancompanion.experimental

import android.content.Context
import android.graphics.*
import java.util.Locale

object SolarArcRenderer {

    fun render(
        context: Context,
        width: Int,
        height: Int,
        sunriseSec: Int,
        sunsetSec: Int,
        nowSec: Int,
        sunriseStr: String,
        sunsetStr: String
    ): Bitmap {
        val w = if (width > 0) width else 720
        val h = if (height > 0) height else 220
        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)

        val density = context.resources.displayMetrics.density
        val padX = w * 0.10f
        val horizonY = h * 0.74f
        val topY = h * 0.14f

        // 1. Línea del horizonte (suave y discreta)
        val horizonPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#253d34")
            strokeWidth = 1.5f * density
            style = Paint.Style.STROKE
            pathEffect = DashPathEffect(floatArrayOf(6f * density, 4f * density), 0f)
        }
        canvas.drawLine(w * 0.04f, horizonY, w * 0.96f, horizonY, horizonPaint)

        // 2. Parábola del arco solar
        // y(t) = horizonY - 4 * t * (1 - t) * (horizonY - topY) para t en [0, 1]
        val arcPath = Path()
        val steps = 60
        for (i in 0..steps) {
            val t = i.toFloat() / steps
            val x = padX + t * (w - 2 * padX)
            val y = horizonY - 4f * t * (1f - t) * (horizonY - topY)
            if (i == 0) arcPath.moveTo(x, y) else arcPath.lineTo(x, y)
        }

        val arcBasePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#1f382f")
            strokeWidth = 2.5f * density
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
        }
        canvas.drawPath(arcPath, arcBasePaint)

        // 3. Progreso diurno y posición del sol
        val isDay = nowSec in sunriseSec..sunsetSec && sunsetSec > sunriseSec
        if (isDay) {
            val tNow = ((nowSec - sunriseSec).toFloat() / (sunsetSec - sunriseSec).toFloat()).coerceIn(0f, 1f)

            // Arco recorrido iluminado
            val progPath = Path()
            val progSteps = (steps * tNow).toInt().coerceAtLeast(1)
            for (i in 0..progSteps) {
                val t = (i.toFloat() / steps).coerceAtMost(tNow)
                val x = padX + t * (w - 2 * padX)
                val y = horizonY - 4f * t * (1f - t) * (horizonY - topY)
                if (i == 0) progPath.moveTo(x, y) else progPath.lineTo(x, y)
            }
            val progPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#449f84")
                strokeWidth = 3f * density
                style = Paint.Style.STROKE
                strokeCap = Paint.Cap.ROUND
            }
            canvas.drawPath(progPath, progPaint)

            // Coordenadas actuales del sol
            val sunX = padX + tNow * (w - 2 * padX)
            val sunY = horizonY - 4f * tNow * (1f - tNow) * (horizonY - topY)

            // Resplandor del sol
            val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#38f59e0b")
                style = Paint.Style.FILL
            }
            canvas.drawCircle(sunX, sunY, 14f * density, glowPaint)

            // Núcleo del sol
            val sunPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#fbbf24")
                style = Paint.Style.FILL
            }
            canvas.drawCircle(sunX, sunY, 6f * density, sunPaint)

            val sunBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                strokeWidth = 1.5f * density
                style = Paint.Style.STROKE
            }
            canvas.drawCircle(sunX, sunY, 6f * density, sunBorder)
        } else {
            // Noche: sutil luna en la parte superior izquierda
            val moonX = w * 0.22f
            val moonY = h * 0.32f
            val moonPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.parseColor("#d8ebe2")
                style = Paint.Style.FILL
            }
            // Luna creciente dibujada con diferencia de dos círculos
            val moonPath = Path().apply {
                addCircle(moonX, moonY, 7f * density, Path.Direction.CW)
                op(Path().apply { addCircle(moonX + 3.5f * density, moonY - 1.5f * density, 6f * density, Path.Direction.CW) }, Path.Op.DIFFERENCE)
            }
            canvas.drawPath(moonPath, moonPaint)
        }

        // 4. Textos de salida (Shuruq) y puesta (Ghurub)
        val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.parseColor("#7fa392")
            textSize = 10f * density
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.NORMAL)
        }

        // Salida del sol (izquierda)
        val sunriseLabel = if (sunriseStr.isNotEmpty()) "🌅 $sunriseStr Shuruq" else "🌅 Shuruq"
        canvas.drawText(sunriseLabel, padX * 0.4f, horizonY + 14f * density, textPaint)

        // Puesta del sol (derecha)
        val sunsetLabel = if (sunsetStr.isNotEmpty()) "🌇 $sunsetStr Ghurub" else "🌇 Ghurub"
        val sunsetWidth = textPaint.measureText(sunsetLabel)
        canvas.drawText(sunsetLabel, w - padX * 0.4f - sunsetWidth, horizonY + 14f * density, textPaint)

        return bitmap
    }
}
