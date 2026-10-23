# Fórmulas del rezo

`formulas.json` trae el texto de las fórmulas que muestra la guía del rezo, una por `id` (los mismos de `src/lib/guia.ts`):

```json
{ "schema": 1, "formulas": { "j_ruku": { "ar": "…", "tr": "…", "es": "…", "fuente": "Sistani, Islamic Laws, regla 1014", "reviso": "AB" } } }
```

- Solo entran fórmulas **revisadas y firmadas por el usuario** (la planilla marca cada fila como «Lista»). Desde el 23/10/2026: las palabras y el orden de cada fórmula son los de sus notas (columnas «de tus notas» de la planilla). El asistente solo ajusta la escritura árabe al Corán de la app con `scripts/escritura-coranica.py` (palabras y frases tal cual del texto Tanzil; lo que no está, con las mismas reglas de escritura) y la transliteración a la convención estricta, y propone traducciones. No agrega palabras ni inventa fórmulas. El usuario aprueba cada fila (en el chat o en la planilla) y firma «Revisó». Sigue prohibido copiar texto de ediciones con derechos (Sistani, © The World Federation; sunnah.com; dorar.net), y las fórmulas que no están en sus notas no tienen texto hasta que él lo dé.
- El árabe no se copia de ediciones con derechos reservados (por ejemplo, *Islamic Laws* de Sistani, © The World Federation of KSIMC) sin su permiso escrito: la referencia indica la autoridad, no un texto a copiar.
- Transliteración **estricta** (ā ī ū, ḥ, ʿ, ʾ, ṣ ḍ ṭ ẓ…), la de la clave de pronunciación de la guía (`CLAVE_TRANSLITERACION` en `src/lib/guia.ts`): por ejemplo, *subḥāna rabbiya l-ʿaẓīmi wa biḥamdih*, no «adhím». Traducción propia, con «Allah». (Decisión del 22/10/2026: reemplaza la convención «simple».)
- Se genera desde la planilla con `python3 scripts/planilla-formulas.py <planilla.xlsx>` (con `--comprobar` solo revisa). El script copia las filas completas, rechaza ids que no están en la guía, árabe con letras latinas y filas sin referencia, y avisa si aparecen la kaf o la ye persas. No se edita a mano.
- Ayuda para quien revisa: `python3 scripts/planilla-notas.py <planilla.xlsx> <carpeta con los «Texto del…»>` copia, tal cual, el árabe y la transliteración de las notas de estudio del usuario en dos columnas al final de la hoja (las 25 fórmulas de «Mi práctica»). No toca las columnas revisadas: llegan a `formulas.json` solo si una persona las copia y firma. Necesita `openpyxl`.
- La transliteración de Sistani (sistani.org, © The World Federation) tampoco se copia como borrador: las fórmulas que no están en las notas no tienen borrador hasta el permiso.
- Mientras una fórmula no esté acá, la guía muestra su lugar y su referencia, sin texto.
- Este contenido no está bajo la licencia MIT del código: cada fórmula conserva la atribución de su fuente.
