# Guía y acompañamiento del rezo

Estado al 23/10/2026: **en desarrollo**. Se ve en `tauri dev` y en las compilaciones de prueba con
`VITE_GUIA_REZO=1`; las oficiales no la incluyen (el código ni entra en el bundle). PR #10, rama
`feat/guia-rezo`.

## Qué hace

- **Aprender** (Más → Guía del rezo): cada rezo obligatorio paso a paso, con su árabe, transliteración
  y traducción a medida que se revisan.
- **Acompañar** («Rezar … con guía»): una pantalla completa sigue el rezo. Se elige antes cómo avanzar:
  tocar para avanzar, contador de rakʿas o, en Android, el sensor de proximidad (ver abajo). En Android
  la pantalla queda encendida mientras dura el acompañamiento, en cualquier modo.
- **Hoy**: si llegó la hora del último rezo y no está marcado, una tarjeta ofrece rezarlo con guía
  (Fajr, solo hasta la salida del sol).
- Al terminar, marcar el rezo en el registro. Con Dhuhr o Maghrib, «Marcar X y seguir con Y» marca el
  primero y abre el siguiente **unido** (solo iqama); el segundo se marca con `mark_prayed` y
  `combinado`, que el core permite desde el horario del primero si el primero ya está marcado
  (`scheduler::mark_time_rule`, el ishtirak ja'fari).

## Sensor de proximidad (Android)

Con el teléfono en el suelo, delante del lugar de la postración. Es un modo híbrido: los toques
siguen avanzando paso a paso y el sensor corrige la posición en cada postración.

- **Postración:** algo cerca durante 0,7 s (una mano que pasa no cuenta) lleva al próximo paso de
  sujūd; si ya está en uno, se queda.
- **Levantarse:** lejos durante 0,4 s después de una postración pasa al paso siguiente (entre las
  sajdas, tashahhud o la rakʿa siguiente).
- Si el teléfono no tiene sensor, la opción aparece deshabilitada y un modo guardado «sensor» vuelve
  a «tocar». Si el sensor falla durante el rezo, el pie lo dice y se sigue con toques.

Nativo: `Proximidad.kt` registra el sensor y guarda si hay algo cerca y desde cuándo; el comando
`acompanar` de `AdhanPlugin.kt` (`android_acompanar` en Rust: `status`, `start`, `read`, `stop`)
pone o quita `FLAG_KEEP_SCREEN_ON` y prende o suelta el sensor. La interfaz lee cada 250 ms y
decide qué es una postración. En el banco de pruebas, `tauri-mock.js` lo simula con `__acercar()`
y `__alejar()`.

## Escuelas y perfiles

- Por ahora se muestra **solo ja'fari** (`ESCUELAS_VISIBLES` en `src/lib/guia.ts`). Las cuatro
  escuelas sunnis siguen en el código, ocultas hasta que alguien revise su contenido.
- Ja'fari muestra **solo «Sistani completo»** (decisión del usuario del 23/10/2026; ya no hay selector).
  «Mi práctica» sigue en el código, oculto. Los dos perfiles:
  - **Mi práctica** (oculto; antes, el perfil por defecto con el subtítulo «como se aprende»): el orden con que el usuario aprendió el
    rezo, tal como está en sus notas de estudio. Adhan e iqama, niyya, takbir, Al-Fatiha y Al-Ikhlas,
    takbires de transición, rukūʿ y sujūd ×3, qunut con Rabbanā ātinā (2:201) o la salawat,
    tashahhud con «Al-ḥamdu lillāh», taslīm con los tres saludos, y la taʿqībāt: tres takbires y el
    tasbīḥ de Fátima con contador (34 · 33 · 33). Sin estatus: todo se muestra.
  - **Sistani completo**: con estatus (pilar, obligatorio, recomendado…) y la fuente de cada paso
    (*Islamic Laws*). Lo recomendado se ve en el modo «Completo»: adhan e iqama (reglas 902–919),
    takbires de transición (1029, 1077), taʿqībāt (1108) y sajdat al-shukr (1109), además de las
    súplicas propias de Sistani.
- Casos de la primera versión: de viaje (rakʿas acortadas), mujer (notas recomendadas por paso y
  menstruación sin guardar datos) y combinar.

## Texto de las fórmulas

- La guía no trae texto religioso propio: cada fórmula es un `id` que se llena desde
  `public/rezo/formulas.json`, generado por `scripts/planilla-formulas.py` a partir de la planilla que
  revisa una persona. Ver `public/rezo/README.md`.
- **Proceso decidido por el usuario el 23/10/2026:** las palabras y el orden de cada fórmula son los de sus notas (columnas «de tus notas» de la planilla). El asistente solo ajusta la escritura árabe al Corán de la app con `scripts/escritura-coranica.py` (palabras y frases tal cual del texto Tanzil; lo que no está, con las mismas reglas de escritura) y la transliteración a la convención estricta, y propone traducciones. No agrega palabras ni inventa fórmulas. El usuario aprueba cada fila (en el chat o en la planilla) y firma «Revisó». Sigue prohibido copiar texto de ediciones con derechos (Sistani, © The World Federation; sunnah.com; dorar.net), y las fórmulas que no están en sus notas no tienen texto hasta que él lo dé.
- Primera tanda (23/10/2026): 19 fórmulas y la transliteración de Al-Fatiha y Al-Ikhlas, revisadas por
  Yaḥyā. La tabla, con las aleyas de donde sale la escritura, también está en el vault del Islam
  («Práctica de la salat chií», sección «Fórmulas en escritura coránica»).
- `scripts/planilla-notas.py` copia, tal cual, el árabe y la transliteración de las notas de estudio del
  usuario a dos columnas de ayuda de la planilla; quien revisa las pasa a las columnas revisadas y firma.
- Al-Fatiha, Al-Ikhlas y 2:201 usan el árabe y la traducción del lector (Tanzil Uthmani y Bórnez).
  Su transliteración viene de la planilla, aleya por aleya (`TRANSLIT_CORAN`, ids `q_<sura>_<aleya>`).
- Transliteración **estricta** (ā ī ū, ḥ, ʿ, ʾ, ṣ ḍ ṭ ẓ, kh, dh, th): la de las notas del usuario y la
  de Sistani en inglés. La guía tiene una clave de pronunciación (`CLAVE_TRANSLITERACION`).
- Transliteración y traducción son interruptores independientes, en la guía y en «Antes de empezar».

## Estados

Ver la fila «Guía y acompañamiento del rezo» de [estados-interfaz.md](estados-interfaz.md).

## Versión de prueba con la guía visible

1. CI manual con la opción «guia»: `gh workflow run release.yml --ref feat/guia-rezo -f guia=true`
   (o «Run workflow» en Actions, marcando la casilla). Define `VITE_GUIA_REZO=1` solo en esa ejecución:
   no hace falta una rama de prueba ni un `.env.production`. Genera `.deb`, AppImage, NSIS y los APK
   firmados con la clave de siempre, sin publicar nada. Los tags y los PR nunca la encienden.
2. Mientras el seguimiento (PR #9) no esté en `main`, la versión de prueba que lo combina con la guía
   sale de una rama que los une y no se mergea (`prueba/seguimiento-y-guia`), con la misma opción.
3. Los paquetes se suben a una prerelease cuyo tag no sigue los patrones de los actualizadores
   (`vX.Y.Z`, `android-experimental-<sha7>`) y sin `android-update.json`: ninguna app la ofrece.
   Se borra al terminar la prueba.
4. En una PC con `.oauth.local`, no compilar localmente la versión de prueba: la compilación local
   activa el sync con Google. Usar los paquetes de la CI.

## Pendiente

- Completar la planilla (68 filas; 37 con texto de las notas en las columnas de ayuda).
- Probar el acompañamiento rezando, en el J7 y en escritorio.
- Probar el sensor de proximidad en el J7: si detecta la cabeza en la postración a la distancia
  real y si 0,7 s / 0,4 s alcanzan.
- Lectura en voz alta de los pasos (a evaluar): reusar la recitación del lector para el Corán; el resto
  necesitaría grabaciones con licencia, y consultar si seguir una grabación durante el rezo afecta su
  validez.
