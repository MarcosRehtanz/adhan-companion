package io.github.marcosrehtanz.adhancompanion.experimental

import android.net.Uri

/**
 * Callback pendiente del flujo OAuth de Google (compartido entre MainActivity y
 * AdhanPlugin). El navegador del sistema redirige al scheme de la app; MainActivity
 * registra el URI acá y el Rust lo consulta/consume por polling
 * (AdhanPlugin.oauthConsume) cada 500 ms mientras espera la autorización.
 *
 * El scheme: Google bloqueó los custom schemes propios en Android, así que el
 * redirect válido es el auto-registrado `com.googleusercontent.apps.<client-id>:`
 * (notación invertida del client ID, que sale del placeholder `oauthScheme` del
 * manifest). Se acepta también el scheme del package como fallback; el chequeo
 * de seguridad de verdad es el `state` que valida el Rust.
 */
object OauthLogin {
    @Volatile var pendiente: Uri? = null

    /** Registra la vuelta del navegador si es un redirect del flujo OAuth. */
    fun registrar(data: Uri?, nombrePackage: String?) {
        val scheme = data?.scheme ?: return
        if (scheme.startsWith("com.googleusercontent.apps.") ||
            (nombrePackage != null && scheme == nombrePackage)
        ) {
            pendiente = data
        }
    }
}
