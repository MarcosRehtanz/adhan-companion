# Maqueta: panel «Lectura» y su ícono

Propuesta del 21/10/2026 para el panel donde se eligen el idioma y el tamaño del texto del lector. El usuario la pidió antes de cambiar nada, con dos pedidos:

- El panel de preferencias tenía que dejar editar enseguida, sin pasar por «Editar lectura».
- El ícono «Aa» no lo convencía.

Se armó sobre la app real: el frontend compilado con un sustituto del core y el panel nuevo inyectado. Ese andamiaje quedó fuera del repo, que conserva solo las capturas. El usuario aprobó la recomendación y se implementó en v0.1.14.

## Capturas

- `capturas/iconos.png`: los siete íconos candidatos en la barra del lector, en escritorio y en el celular, con los temas Papel y Noche.
- `capturas/antes-despues-celular.png`: el panel anterior (resumen y edición) junto a la propuesta, en Papel y en Noche con «Solo árabe».
- `capturas/antes-despues-escritorio.png`: el modal anterior, en edición, junto al globo de la propuesta.

## Ícono

| Opción | Lectura |
|---|---|
| Aa (anterior) | Convención de los lectores de libros electrónicos. Se lee como «tamaño de letra» y no sugiere que ahí se elige el idioma |
| **عA (elegido)** | Monograma árabe y latino con la fuente del lector: dice qué controla, el árabe y el español, y su tamaño |
| Libro abierto con texto | «Opciones de lectura»: claro, pero no dice qué se ajusta |
| Idiomas (文A) | El ícono estándar de traducción, pero el carácter chino queda ajeno en un lector del Qur’an |
| T, A/a | Solo hablan de tamaño |
| Controles deslizantes | Se confunde con Configuración |

## Panel

- **Se edita directo**, sin Editar ni Guardar. Es la única excepción a la regla de borrador de la app, porque en lectura lo que importa es ver el efecto y todo se deshace con otro toque.
- **Idioma, primero:** dos tarjetas con una muestra, «Árabe y español» y «Solo árabe».
- **Tamaño:** deslizadores con una letra chica y una grande en las puntas. En «Solo árabe», el del español queda desactivado con una nota, porque la traducción del pie tiene tamaño propio.
- **No oscurece el texto:** en escritorio es un globo junto al botón y en el celular, una hoja inferior más baja que el panel anterior.

## Diferencias con la implementación

- **Muestras:** la maqueta usaba la basmala; la app usa 112:2 y 112:3, que entran completas sin cortar el texto.
- **Hoja del celular:** la app no tiene la rayita de arrastre, porque la hoja no se arrastra.
- **Guardado:** el comportamiento real (cola de guardados, 400 ms después de soltar y vuelta atrás si falla) está en [lector-quran.md](../../lector-quran.md).
