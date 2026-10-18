# Recursos del lector del Qur'an

Textos descargados de Tanzil el 18 de octubre de 2026; originales sin modificación.

- `quran-uthmani.txt`: Tanzil Quran Text, Uthmani 1.1. Su aviso completo de derechos está en el propio archivo y en `ARABIC-LICENSE.txt`. Distribución literal, con atribución y enlace a https://tanzil.net. Se mantienen las marcas de pausa, sajdah y tatweel seleccionadas en el formulario oficial.
- `es.bornez.txt`: Raúl González Bórnez, `es.bornez`, actualización 15/07/2014 según el pie de Tanzil. Condiciones no comerciales en `TRANSLATION-TERMS.txt` y https://tanzil.net/trans/. No se ha identificado el ISBN de origen ni se promete la totalidad de las notas de una edición impresa.
- `quran-data.xml`: metadatos originales de Tanzil 1.0; aviso `(C) 2008-2009 Tanzil.info`, `license="cc-by"` en el propio archivo. `suras.json` deriva solo nombres, identificadores y recuentos, conserva la atribución y no cambia el texto de las aleyas.
- `fonts/AmiriQuran.ttf`: fuente original Amiri Quran, release 1.003 de https://github.com/aliftype/amiri. Derechos y licencia SIL OFL 1.1 en `fonts/OFL.txt`.
- `manifest.json`: fuentes, versiones, tamaños y SHA-256 de los archivos empaquetados.

El corpus y la fuente tipográfica tienen sus condiciones propias, separadas de la licencia MIT del código. Las redistribuciones de la traducción deben respetar la restricción no comercial; no se concede permiso comercial mediante el código de esta app.

Para preparar metadatos y procedencia desde los originales: `python3 scripts/prepare-quran.py`. Requiere Python 3 y su biblioteca estándar. Al actualizar recursos se debe revisar su procedencia, versión, condiciones y fecha de descarga antes de ejecutar el script. No usar OCR ni generar o corregir el texto con IA.

Los recursos se copian íntegramente desde `public/` a `dist/` durante el build de Vite y quedan dentro del frontend de la app de escritorio. El lector los abre localmente, sin API externa ni descarga automática.
