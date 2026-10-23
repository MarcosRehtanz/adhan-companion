# Fórmulas del rezo

`formulas.json` trae el texto de las fórmulas que muestra la guía del rezo, una por `id` (los mismos de `src/lib/guia.ts`):

```json
{ "schema": 1, "formulas": { "j_ruku": { "ar": "…", "tr": "…", "es": "…", "fuente": "Sistani, Islamic Laws, regla 1014", "reviso": "AB" } } }
```

- Solo entran fórmulas **transcritas y revisadas por una persona** (la planilla de transcripción marca cada fila como «Lista»). Un modelo de IA no transcribe ni corrige estos textos.
- El árabe no se copia de ediciones con derechos reservados (por ejemplo, *Islamic Laws* de Sistani, © The World Federation of KSIMC) sin su permiso escrito: la referencia indica la autoridad, no un texto a copiar.
- Transliteración **estricta** (ā ī ū, ḥ, ʿ, ʾ, ṣ ḍ ṭ ẓ…), la de la clave de pronunciación de la guía (`CLAVE_TRANSLITERACION` en `src/lib/guia.ts`): por ejemplo, *subḥāna rabbiya l-ʿaẓīmi wa biḥamdih*, no «adhím». Traducción propia, con «Allah». (Decisión del 22/10/2026: reemplaza la convención «simple».)
- Se genera desde la planilla con `python3 scripts/planilla-formulas.py <planilla.xlsx>` (con `--comprobar` solo revisa). El script copia las filas completas, rechaza ids que no están en la guía, árabe con letras latinas y filas sin referencia, y avisa si aparecen la kaf o la ye persas. No se edita a mano.
- Mientras una fórmula no esté acá, la guía muestra su lugar y su referencia, sin texto.
- Este contenido no está bajo la licencia MIT del código: cada fórmula conserva la atribución de su fuente.
