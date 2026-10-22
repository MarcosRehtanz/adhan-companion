# Sincronización de datos con Google

**Estado: propuesta/spike — pendiente de aprobación.** Fecha: 2026-10-21. Alimenta una decisión de producto registrada en el spec del vault: *sincronizar datos con la cuenta de Google: sí; distribuir la app por Google: no*.

## Objetivo

El usuario usa la app en varias computadoras y necesita configurarla y actualizarla en cada una. Las actualizaciones ya se resuelven con el actualizador integrado (**Actualizar ahora** en Configuración → Actualizaciones). Lo que falta es **sincronizar los datos** para que una máquina nueva se configure sola:

- `config.json` — configuración (ubicación, método de cálculo, avisos, audio, tema…).
- `quran-reader.json` — estado del lector (última lectura, marcadores, preferencias del panel «Lectura»).
- `registro.jsonl` — registro de rezos (base de rachas y estadísticas).

La integración usa la **carpeta privada de app en Google Drive** (`appDataFolder`): cada usuario conecta **su propia** cuenta; los datos del usuario A nunca pasan por servidores nuestros ni se mezclan con los de otro usuario. No hay backend propio.

## Alcance

- **Escritorio** (Linux x64 y Windows x64): sync completo. Android queda para una fase posterior (integración nativa con Play Services), aunque usa la misma carpeta.
- **Datos sincronizados**: los tres archivos de datos. No se sincronizan: audio descargado (grande y reproducible por descarga), ni nada del Qur’an embebido (está en el instalador).
- **El cálculo sigue local-first**: horarios, qibla y la app entera funcionan sin sesión iniciada y sin red. La sincronización es un respaldo/restauración en segundo plano, no una dependencia.

## Autenticación

### Flujo OAuth (escritorio)

- Tipo de cliente OAuth: **Desktop app** de Google (redirect a `127.0.0.1` con puerto efímero — Google lo permite para clientes de tipo desktop; no exige client secret).
- Navegador del sistema (no WebView de la app) abre la pantalla de cuenta de Google; el callback lo recibe un servidor localhost temporal.
- Plugin candidato: [`tauri-plugin-oauth` de FabianLars](https://github.com/FabianLars/tauri-plugin-oauth) (v2, minimalista: solo levanta el servidor localhost y devuelve la URL de callback). PKCE (`S256`) y el intercambio `code → token` se implementan en Rust con `reqwest`, en el core, como el resto de la lógica.
- Alcance pedido: **solo `https://www.googleapis.com/auth/drive.appdata`**. Es un scope **no sensible**: no exige verificación ni auditoría de Google, y sin datos de perfil (ni `email`, ni `profile`) la pantalla de consentimiento no requiere ninguna marca de verificación.
- **Cliente de producción, no de prueba**: Google expira los refresh tokens de apps en estado «Testing» a los 7 días. Con un scope no sensible se puede publicar la pantalla de consentimiento «En producción» sin verificación. Publicar el cliente apenas se cree; dejarlo en Testing es el error clásico que rompe el sync cada semana.

### Almacenamiento del token

- El **refresh token** se guarda en el almacén de credenciales del sistema (crate `keyring`: GNOME Keyring/libsecret en Ubuntu, Credential Manager en Windows), **no** en `config.json` ni en texto plano.
- El access token se renueva en memoria y no se persiste.
- Cerrar sesión = revocar el token en Google + borrar la entrada del keyring.

### Configuración previa (una sola vez)

1. Crear el proyecto en Google Cloud Console.
2. Habilitar la **Google Drive API**.
3. Pantalla de consentimiento externa, scope `drive.appdata`, estado «En producción» (sin verificación: scope no sensible).
4. Crear credencial **OAuth Client ID → Desktop app**; incrustar el `client_id` en la app (es público por diseño en clientes de tipo desktop).

## Almacenamiento en Drive

- Un solo archivo en `appDataFolder`: **`adhan-companion-backup.json`**, con:

  ```json
  {
    "schema": 1,
    "actualizado": "2026-10-21T23:59:00Z",
    "dispositivo": "desktop-linux-marcos",
    "datos": {
      "config": { … contenido de config.json … },
      "lector": { … contenido de quran-reader.json … },
      "registro": [ … eventos de registro.jsonl como array … ]
    }
  }
  ```

- `appDataFolder` es invisible en la UI de Drive, no se puede compartir y solo la app que lo creó (por proyecto de Google Cloud) puede leerlo. En `mi espacio de Drive` no aparece pero **cuenta contra la cuota de Drive del usuario** — irrelevante acá: el archivo completo ronda decenas de KB.
- Estructura mínima de llamadas (REST v3, sin SDK): `files.list` con `spaces=appDataFolder`, `files.create` (multipart) para subir y `files.get?alt=media` para leer. Todo con `reqwest` desde el core.

## Resolución de conflictos

Escenario: dos computadoras usan la app sin sincronizarse entre sí (una offline).

| Dato | Estrategia |
|---|---|
| `registro.jsonl` | **Unión por evento**: cada línea tiene fecha/rezo/timestamp únicos; el merge conserva ambas y deduplica por clave. Nunca se pierde un rezo marcado. |
| `config.json` | **Última escritura gana** (LWW por `actualizado`), con aviso al usuario si el respaldo es más nuevo que lo local y difiere en campos que cambian de comportamiento (ubicación, método, avisos). |
| `quran-reader.json` | **LWW** con los mismos avisos; la última lectura y los marcadores son de una sola cabeza. |

En conflicto real, la app muestra **qué cambió** y el usuario elige (local / Drive) antes de sobrescribir nada. Nunca se destruyen datos sin confirmación.

## Ciclo de sincronización

1. **Primer arranque con sesión activa**: si existe respaldo y los datos locales están vacíos o recién instalados, ofrecer **«Restaurar respaldo del <fecha> (cuenta Google)»** — pregunta explícita, nunca automático silencioso en la primera restauración.
2. **Después de cambios locales**: subida diferida (debounce ~10 s tras el último cambio).
3. **Al arrancar** (si hay sesión): comparar `actualizado` del respaldo con el último sync local; si Drive es más nuevo, descargar y mergear con las reglas de arriba.
4. **Manual**: botón «Sincronizar ahora» en Configuración → Respaldo y sincronización (muestra cuenta, última sync y estado de error).
5. Errores de red/cupo: reintento con backoff exponencial; el fallo del sync **jamás** bloquea la app ni el registro local.

## Cupos y límites de Drive API (2026)

Verificado contra la documentación oficial (`developers.google.com/workspace/drive/api/guides/limits`):

- Cuota desde el 1/5/2026 para proyectos nuevos: **1.000.000 de unidades/min por proyecto**, **325.000/min por usuario** y **1 TB/día de salida**. Nuestro patrón (pocas llamadas por usuario/día, archivos de KB) no se acerca ni remotamente a los umbrales.
- Sin costo mientras no se supere el umbral diario; superarlo exige habilitar billing — escenario imposible para este uso.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Refresh token expira / usuario revoca | Detectar `invalid_grant` → pedir nueva sesión explícita; nunca fallar en silencio. |
| Google cambia la API/cupos | `schema` del respaldo versionado; migración al vuelo. |
| Keyring no disponible (Linux sin GNOME Keyring) | Aviso claro de que el sync no puede iniciar sesión; la app sigue funcionando local. |
| Registro grande a futuro | El registro de un año ~ 2 KB de texto; sin problema. Revisar solo si se agregan datos por aleya/día. |
| Privacidad | Solo scope `appDataFolder`, sin perfil ni correo; nada sale del dispositivo salvo hacia la cuenta del propio usuario. |

## Fases de implementación

1. **Spike (esta doc)**: probar el flujo completo con un `client_id` de desarrollo y el respaldo de un solo archivo en una máquina. Confirmar keyring en Linux.
2. **v0.1.16**: login/logout, sincronización manual y al arrancar, resolución de conflictos con UI de elección.
3. **v0.1.17**: subida diferida después de cambios y estado persistente de última sync.
4. **Posterior**: Android (integración nativa con la misma carpeta) y, si algún día hay hardware del nodo, la misma estrategia de respaldo para la configuración del nodo.

## Decisiones abiertas

- ¿Ubicación geográfica: se sincroniza con `config.json` (una sola ubicación para todas las máquinas) o por dispositivo? El caso del usuario parece ser «una sola ubicación»; se asume eso.
- ¿Nombre del dispositivo para mostrar en la UI de conflicto? Sugerencia: pedirlo opcional la primera vez, default por SO.
