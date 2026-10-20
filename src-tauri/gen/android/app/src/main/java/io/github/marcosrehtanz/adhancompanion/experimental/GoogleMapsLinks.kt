package io.github.marcosrehtanz.adhancompanion.experimental

import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.Executors

/** Solo consulta cabeceras; Rust valida cada destino e interpreta el punto. */
object GoogleMapsLinks {
    // La red no ocupa el executor que programa y entrega los avisos de rezo.
    val worker = Executors.newSingleThreadExecutor()

    fun redirect(input: String): String {
        require(input.length <= 8192) { "El enlace de Google Maps es demasiado largo." }
        val uri = URI(input)
        require(uri.scheme == "https" && uri.rawUserInfo == null && uri.port in listOf(-1, 443) && (
            uri.host == "maps.app.goo.gl" && uri.path.trim('/').isNotEmpty() ||
            uri.host == "goo.gl" && uri.path.startsWith("/maps/") && uri.path.length > 6
        )) { "Usá un enlace corto HTTPS de Google Maps." }
        val connection = uri.toURL().openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.requestMethod = "HEAD"
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.setRequestProperty("User-Agent", "Adhan-Companion-Android")
            val status = connection.responseCode
            check(status in listOf(301, 302, 303, 307, 308)) {
                if (status == 200) "El enlace no expone las coordenadas. Abrilo en Google Maps y copiá las del punto."
                else "No se pudo resolver Google Maps (HTTP $status). Revisá la conexión y reintentá."
            }
            val location = connection.getHeaderField("Location")
            check(!location.isNullOrBlank() && location.length <= 8192) { "Google Maps no devolvió un enlace válido del punto." }
            return location
        } finally {
            connection.disconnect()
        }
    }
}
