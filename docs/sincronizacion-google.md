# Sincronización de datos con Google

**Estado: spike completo y aprobado (2026-10-22) — listo para implementar en v0.1.16.** Fecha: 2026-10-21. Decisiones aprobadas por el usuario; alimenta la decisión de producto del spec del vault: *sincronizar datos con la cuenta de Google: sí; distribuir la app por Google: no*.

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

- Tipo de cliente OAuth: **Desktop app** de Google (redirect a `127.0.0.1` con puerto efímero — Google lo permite para clientes de tipo desktop). El canje del código sí pide el `client_secret`, que en un cliente Desktop no es secreto: Google lo considera público y va incrustado en la app.
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
| `registro.jsonl` | Por cada (fecha, rezo) gana la **última acción del usuario** (`rezado` / `desmarcado`) según su hora (`ts`, desde v0.1.16). Si gana la del respaldo, se agrega ese evento al final del archivo con su hora original: el log sigue siendo append-only y last-wins. Sin hora (eventos anteriores) gana la marca. Los eventos automáticos (`adhan`, `perdido`) son de cada máquina y no viajan. |
| `config.json` | **Tres vías** contra la base del último sync (`sync-estado.json`, local): por grupo (la ubicación son ciudad, coordenadas y zona horaria juntas; el resto, cada clave), lo que cambió de un solo lado se toma solo. Si el mismo grupo cambió en las dos computadoras y quedó distinto, se consulta. |
| `quran-reader.json` | **Tres vías** igual: el punto de lectura y las preferencias (idioma y tamaño) se consultan solo si cambiaron en las dos. Los **marcadores** se unen: se suman las altas y se aplican las bajas de cada lado, sin consulta. |

En conflicto real, la app muestra **qué cambió en las dos** («preaviso: acá 5 min, en Drive 15 min») y el usuario elige local o Drive para eso. Lo demás ya quedó mezclado. Nunca se destruyen datos sin confirmación. Sin base (primer sync en una máquina que ya tiene datos), cualquier diferencia se consulta una vez.

## Ciclo de sincronización

1. **Primer arranque con sesión activa**: si existe respaldo y los datos locales están vacíos o recién instalados, ofrecer **«Restaurar respaldo del <fecha> (cuenta Google)»** — pregunta explícita, nunca automático silencioso en la primera restauración.
2. **Después de cambios locales**: subida diferida (debounce ~10 s tras el último cambio).
3. **Al arrancar** (si hay sesión): comparar `actualizado` del respaldo con el último sync local; si Drive es más nuevo, descargar y mergear con las reglas de arriba.
4. **Manual**: botón «Sincronizar ahora» en Configuración → Respaldo y sincronización (muestra cuenta, última sync y estado de error).
5. Errores de red/cupo: reintento con backoff exponencial; el fallo del sync **jamás** bloquea la app ni el registro local.

## Resultado del spike (2026-10-22) — COMPLETO ✔

Corrida contra la cuenta real del usuario con `spikes/gdrive-sync/spike.mjs`:

| Paso | Resultado |
|---|---|
| OAuth instalado: PKCE + callback loopback, `prompt=consent` | ✅ `code → tokens`, scope `drive.appdata` concedido solo |
| Renovación con refresh token | ✅ nuevo access en 3599 s — el acceso offline funciona |
| GNOME Keyring (libsecret vía `python3-gi`) | ✅ round-trip `store → lookup` verificado; la corrida `--resume` toma el token del keyring y renueva **sin abrir navegador** (la ruta diaria de la app) |
| Drive `appDataFolder`: subir → listar → descargar → sobrescribir → borrar | ✅ archivo de 267 bytes, contenido verificado al descargar |

Gotchas confirmados en la práctica:

- **403 `access_denied` con app en modo Pruebas si la cuenta no está en "usuarios de prueba"** — el dueño del proyecto **no** está exento. Alta del test user y 1-2 min de propagación. (Para producción: no hace falta web propia todavía; alcanza una política de privacidad estática, ej. en el repo o Portfolio. Queda como tarea previa a publicar la app Google.)
- **La sobrescritura del archivo es `PATCH` a `/upload/drive/v3/files/{id}?uploadType=multipart`** — `POST` a esa ruta da 404; `POST /upload/.../files` sólo sirve para crear.
- Tras `server.close()` en Node, `server.address()` devuelve `null`: el puerto del loopback hay que capturarse antes de cerrar, porque el `redirect_uri` del canje debe coincidir exacto.
- Con app en Pruebas el refresh token **caduca a los 7 días**: alcanza para el desarrollo, pero obliga a publicar la app antes de distribuir el sync.

Con esto, el diseño de arriba queda validado de punta a punta; nada de esta doc cambió. Hilo de implementación v0.1.16 abierto.

## Implementación v0.1.16 (2026-10-22) — Código hecho, validación física pendiente

Módulo `src-tauri/src/sync_google.rs` (desktop-only) con el ciclo completo del diseño:

| Pieza | Implementación |
|---|---|
| OAuth PKCE + loopback | `TcpListener` efímero propio (no plugin), **no bloqueante**: el límite de 5 min se cumple aunque nadie responda, y «Cancelar» (`sync_cancelar`) corta la espera. Callback con `state` (CSRF); las conexiones que no son el callback (favicon, conexiones adelantadas del navegador) reciben 404 y no traban la espera. Un segundo «Conectar» no abre otra espera. URL copiable si `xdg-open` no abre |
| Refresh token | keyring del sistema (`keyring` 4: libsecret Linux, Credential Manager Windows), servicio `adhan-companion-google-refresh`; access sólo en memoria |
| Renovación + errores | `reqwest` (0.13, rustls) en el core; `invalid_grant` → sesión limpia + "conectá de nuevo"; 403 `access_denied` → instructivo explícito |
| Drive | list/create(PATCH+POST multipart)/download sobre `appDataFolder`; sobrescripción PATCH (formato exacto del spike) |
| Respaldo | un archivo `adhan-companion-backup.json` (schema 1): config raw, lector raw, registro completo |
| Registro | gana la última acción del usuario por (fecha, rezo) según `ts`; se agrega solo el evento ganador, con su hora (`registro::append_entry`). Al agregar, el scheduler recalcula los marcados de hoy |
| Config / lector | **tres vías** contra `sync-estado.json` (config y lector tal como quedaron iguales en el último sync; se guarda después de cada subida y se borra al cerrar sesión). Solo los grupos que cambiaron en las dos detienen el sync en `conflicto`; `sync_resolver` aplica la salida elegida, ya mezclada con lo demás. El config que llega se adopta con `config::validar` (las mismas reglas de `set_config`), estado compartido y scheduler, y la ventana recibe `sync_aplicado` para releer |
| Restauración | registro local vacío + historial remoto → oferta explícita; "descartar" no re-oferta en la ejecución |
| Estados UI | Panel **Configuración → Respaldo y sincronización** (`GoogleSync.tsx`): sin sesión, conectando (con la dirección para copiar y Cancelar), activa, operación en curso, error con reintento (todos los errores quedan en `ultimo_error`), aviso de lo que se trajo, conflicto con el detalle y restauración con elección |
| Credencial | `build.rs` exporta `GOOGLE_OAUTH_CLIENT_ID[/_SECRET]` desde `.oauth.local` (fuera de Git); builds sin credencial compilan con marcador y, desde v0.1.15, no muestran el panel ni consultan el keyring al arrancar (`runtime_info.google_sync`). Las dependencias del sync van en la sección de escritorio de `Cargo.toml`: Android no las compila |

Tests de unidad (`sync_google`, 6): el registro agrega solo lo que falta, gana la acción más reciente, sin hora gana la marca, formato multipart de Drive, errores de token y fechas ISO. Suite: **36 verdes**. Los arreglos del 22/10 (hora por evento, tres vías, login cancelable, errores visibles) se hicieron después de la revisión del código, que encontró que cualquier cambio local terminaba en conflicto y que volver a marcar un rezo no se propagaba. Android queda para fase posterior (Posterior: integración nativa con Play Services), el módulo es `cfg(desktop)`.

Pendientes para liberar el sync (v0.1.16 en release):
1. **Cliente de producción en Google Cloud** (ahora hay credencial dev en Testing: refresh caduca a 7 días): proyecto propio, Drive API, consentimiento "En producción" + Client ID Desktop incrustado.
2. ~~Validación física del ciclo completo~~ — **parcialmente hecha (22/10, dev en esta máquina)**: autorización OAuth real (loopback + keyring), primera subida creada en Drive y sobrescritura exitosa por PATCH en el segundo sync. **Faltan**: el conflicto con elección y la restauración, que necesitan datos divergentes de una segunda máquina (o el truco de respaldar y vaciar `registro.jsonl` local).

Gotchas verificados en la validación:
- **`invoke_handler` pisa al anterior**: en Tauri 2 una segunda llamada reemplaza el handler completo (síntoma: `runtime_info not found` en todo el frontend). Hay un único handler por plataforma — desktop con los `sync_*`, mobile sin ellos — y las dos listas deben mantenerse sincronizadas a mano.
- **Capabilities también para comandos propios**: los comandos `sync_*` necesitan el permiso `google-sync` (`src-tauri/permissions/sync.toml`) declarado en `capabilities/default.json`; sin eso la ventana rechaza la invocación con «sync_estado not allowed» aunque el comando esté registrado.
- La build dev usa la **misma carpeta de datos** (`~/.config/adhan-companion`) que la instalada: probar en dev toca config y registro reales, y la instancia instalada del tray debe cerrarse antes (singleton).

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
4. **Posterior**: si algún día hay hardware del nodo, la misma estrategia de respaldo para la configuración del nodo.

## Fase Android (propuesta 25/10/2026, a aprobar con el usuario)

Pedido del usuario: sincronizar **Dell Latitude + ThinkPad + Android**. Desktop cubre las dos computadoras con lo ya implementado; Android necesita:

1. **Lógica compartida**: extraer de `sync_google.rs` la parte pura (reglas de unión del registro, tres vías del config/lector, parseo de `Respaldo`, `sync-estado.json`) a un módulo sin `cfg`, compilable también en móvil. El IO de escritorio (loopback, navegador, keyring) queda `cfg(desktop)`. Las dependencias ya son compatibles: `reqwest` va con `rustls` (compila para Android); `keyring` es la única desktop-only.
2. **Auth en Android**: no hay loopback ni client secret en el APK. Client OAuth tipo **Android** (mismo proyecto de GCP, con SHA-1 del certificado de firma `aa4f3f6e…` + paquete) como cliente público, PKCE, redirección por **custom scheme** (`io.github.marcosrehtanz.adhancompanion.experimental:/oauth2`) y Custom Tabs (AndroidX AppAuth Kotlin). Scope igual: `drive.appdata`.
3. **Token en móvil**: archivo en el directorio privado de datos de la app (equivalente móvil del keyring; nunca en `config.json`). Documentar el modelo de amenaza: app privada, no respaldada de fábrica.
4. **Disparadores**: igual escritorio (manual + al abrir la app, diferida); sin servicio en background en la primera etapa.
5. **Google-side**: crear el client Android en el mismo proyecto, publicar la pantalla de consentimiento en **producción** (en Testing los refresh tokens caducan a los 7 días) y una política de privacidad estática como URL.
6. **La misma carpeta `appDataFolder`**: el archivo ya lo comparten las tres plataformas; `sync-estado.json` queda local por dispositivo, como en las dos computadoras.

## Decisiones (aprobadas por el usuario, 2026-10-21)

- **Sincronizar datos con la cuenta de Google: sí. Distribuir la app por Google (Play Store): no.**
- **Ubicación geográfica**: se sincroniza dentro de `config.json` — **una sola ubicación para todas las máquinas** (no por dispositivo).
- **Nombre del dispositivo**: opcional; se pide una vez y por defecto usa el del sistema operativo. Se muestra en la UI de conflicto.
