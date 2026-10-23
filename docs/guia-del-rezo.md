# Guía y acompañamiento del rezo

Estado al 23/10/2026: **en desarrollo**. Se ve en `tauri dev` y en las compilaciones de prueba con
`VITE_GUIA_REZO=1`; las oficiales no la incluyen (el código ni entra en el bundle). PR #10, rama
`feat/guia-rezo`.

## Qué hace

- **Aprender** (Más → Guía del rezo): cada rezo obligatorio paso a paso, con su árabe, transliteración
  y traducción a medida que se revisan.
- **Acompañar** («Rezar … con guía»): una pantalla completa sigue el rezo. Se elige antes cómo avanzar:
  tocar para avanzar, o contador de rakʿas. El sensor de proximidad de Android todavía no está.
- **Hoy**: si llegó la hora del último rezo y no está marcado, una tarjeta ofrece rezarlo con guía
  (Fajr, solo hasta la salida del sol).
- Al terminar, marcar el rezo en el registro. Con Dhuhr o Maghrib, «Marcar X y seguir con Y» marca el
  primero y abre el siguiente **unido** (solo iqama); el segundo se marca con `mark_prayed` y
  `combinado`, que el core permite desde el horario del primero si el primero ya está marcado
  (`scheduler::mark_time_rule`, el ishtirak ja'fari).

## Escuelas y perfiles

- Por ahora se muestra **solo ja'fari** (`ESCUELAS_VISIBLES` en `src/lib/guia.ts`). Las cuatro
  escuelas sunnis siguen en el código, ocultas hasta que alguien revise su contenido.
- Ja'fari tiene dos perfiles:
  - **Mi práctica** (por defecto, subtítulo «como se aprende»): el orden con que el usuario aprendió el
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
- **Un agente no transcribe, corrige ni completa** árabe, transliteración ni traducción, ni copia texto
  de ediciones con derechos (Sistani, © The World Federation; sunnah.com; dorar.net).
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

1. Rama de prueba que no se mergea, con un `.env.production` que define `VITE_GUIA_REZO=1`
   (ejemplo: `prueba/seguimiento-y-guia`, que une el seguimiento del PR #9 con la guía).
2. CI manual: `gh workflow run release.yml --ref <rama>`. Genera `.deb`, AppImage, NSIS y los APK
   firmados con la clave de siempre, sin publicar nada.
3. Los paquetes se suben a una prerelease cuyo tag no sigue los patrones de los actualizadores
   (`vX.Y.Z`, `android-experimental-<sha7>`) y sin `android-update.json`: ninguna app la ofrece.
   Se borra al terminar la prueba.
4. En una PC con `.oauth.local`, no compilar localmente la versión de prueba: la compilación local
   activa el sync con Google. Usar los paquetes de la CI.

## Pendiente

- Completar la planilla (68 filas; 37 con texto de las notas en las columnas de ayuda).
- Probar el acompañamiento rezando, en el J7 y en escritorio.
- Sensor de proximidad en Android.
- Lectura en voz alta de los pasos (a evaluar): reusar la recitación del lector para el Corán; el resto
  necesitaría grabaciones con licencia, y consultar si seguir una grabación durante el rezo afecta su
  validez.
- Antes de publicarla: decidir el nombre «Mi práctica» en una app pública.
