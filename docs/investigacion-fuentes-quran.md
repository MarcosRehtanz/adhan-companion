# Fuentes para el lector del Qur'an

Investigación del 18 de octubre de 2026 para Adhan Companion: texto árabe, español, adecuación al enfoque chií y distribución offline en Linux y Windows.

## Alcance confirmado por el usuario

El 18 de octubre de 2026 el usuario confirmó que Adhan Companion es una app sin fines de lucro. La incorporación propuesta de Bórnez se evaluará bajo las condiciones de uso no comercial publicadas por Tanzil. Esta confirmación resuelve la intención del proyecto; no convierte la traducción en contenido MIT ni extiende sus permisos a usos comerciales de terceros.

## Selección autorizada e implementación

Tras confirmar el uso sin fines de lucro, el usuario autorizó avanzar con Tanzil Uthmani y Bórnez. Se incorporaron los archivos digitales originales y sus condiciones no comerciales, identificando la procedencia digital y la limitación respecto del ISBN y notas completas de una edición impresa. Ver [estado del lector y recursos concretos](lector-quran.md). No se enviaron consultas a terceros ni se obtuvo un permiso adicional para uso comercial.

## Resultado y propuesta

La propuesta es usar **Tanzil Uthmani para el árabe**, evaluar **Raúl González Bórnez como primera opción en español** y mantener ambas fuentes identificadas por separado. La adecuación editorial de Bórnez y la autorización para redistribuir una edición concreta son decisiones diferentes. Esta fue la propuesta inicial de la investigación; la selección posterior y el alcance autorizado se registran arriba.

El árabe tiene condiciones públicas de redistribución. Bórnez está disponible en formato procesable, pero falta aclarar la edición de origen y el alcance de la autorización para nuestros instaladores y repositorio. Como alternativa técnica se identificó QuranEnc, cuyas condiciones permiten republicar traducciones con obligaciones específicas; no se ha establecido que sus versiones españolas sean una referencia chií.

## Texto árabe

### Tanzil

Tanzil declara que su texto deriva del mushaf de Medina, transmisión Hafs, y se presenta como un proyecto independiente de organizaciones, países y corrientes. Esto describe su procedencia; no equivale a una certificación de una autoridad chií. [FAQ del proyecto](https://tanzil.net/docs/FAQ).

Ofrece Uthmani y variantes de escritura simple. **Propuesta de producto:** Uthmani para lectura, sin reconstruir ni simplificar el texto importado. [Tipos disponibles](https://tanzil.net/docs/quran_text_types).

Su página de licencia identifica CC BY 3.0 y exige además copias literales: no modificar el texto, atribuir Tanzil, enlazar al proyecto y conservar el aviso de derechos en las copias y archivos que contengan una parte sustancial. Al incorporar el archivo, deben conservarse el aviso y las condiciones exactas que lo acompañen. [Licencia oficial](https://tanzil.net/docs/text_license).

**Conclusión:** candidato viable para distribución offline, cumpliendo esas condiciones. La licencia MIT del código no se aplica al corpus.

### Numeración y basmala

Tanzil documenta 6.236 líneas de aleyas y un tratamiento específico de la basmala: en Al-Fatiha tiene número propio; en las otras suras pertinentes viene en la línea de su primera aleya. La sura 9 no lleva apertura de basmala. Recomienda separar visualmente la apertura sin cambiar el archivo original. El importador y la vista deberán respetar esa estructura y evitar duplicaciones o pérdidas. [Nota de Tanzil](https://tanzil.net/docs/a_note_on_bismillah).

Hay metadatos oficiales de suras y divisiones en XML/JavaScript. Antes de redistribuirlos se debe revisar el aviso del archivo concreto; no asumir que tienen automáticamente los mismos términos que el texto. [Metadatos](https://tanzil.net/docs/quran_metadata).

## Comparación de traducciones al español

| Opción | Adecuación para este proyecto | Acceso y condiciones | Estado propuesto |
| --- | --- | --- | --- |
| Raúl González Bórnez | Primera candidata por su relación documentada con la exégesis chií. | Texto `es.bornez` en Tanzil; PDF en Islamoriente; varias ediciones impresas. La vía Tanzil limita el uso a fines no comerciales. | Resolver edición y permisos antes de distribuir. |
| Julio Cortés | Alternativa de consulta filológica; no seleccionada como referencia chií. | Texto `es.cortes` en Tanzil y edición Herder. | No preferida para la primera versión; mismos interrogantes de edición y derechos. |
| Muhammad Isa García | Alternativa técnica; no establecida como referencia chií para el usuario. | Disponible en Tanzil y QuranEnc con condiciones distintas según la fuente. | Opcional si se decide ofrecer otra traducción. |
| Noor International | Alternativa técnica en español de España y Latinoamérica; no establecida como referencia chií. | QuranEnc ofrece ambas variantes y archivos SQLite. | Opcional; requiere revisión editorial. |

### Bórnez y el enfoque chií

En una entrevista publicada en TRANS 19.2 (2015), Bórnez describe su formación en Qum y el uso de Al-Mizan y Nemuneh, entre otras fuentes exegéticas. Reconoce la caracterización de su trabajo como vinculado a la tradición chií iraní. Es fundamento para priorizar su evaluación; no demuestra un respaldo universal de los chiíes ni de un marŷaʿ concreto. [Entrevista, páginas impresas 283–285](https://dialnet.unirioja.es/descarga/articulo/5423575.pdf).

Miraguano identifica una edición de 2006, ISBN 9788478133048, basada en Hafs, y otra de 2021, ISBN 9788478134960. Estas fichas identifican publicaciones, pero no ofrecen en ellas un permiso explícito para integrarlas en software. [Edición 2006](https://www.miraguano-sa.es/libros/coran-el/9788478133048/), [edición 2021](https://www.miraguano-sa.es/libros/coran-el/9788478134960/).

Islamoriente publica una ficha de la versión comentada de 2008 y enlaza un PDF. Se verificó la ficha; el enlace al PDF falló en la consulta, por lo que no se comprobaron su colofón ni sus derechos. No se presume que poder descargarlo permita redistribuirlo. [Ficha de Islamoriente](https://islamoriente.com/content/library/el-sagrado-cor%C3%A1n-versi%C3%B3n-castellana-comentada-de-ra%C3%BAl-gonz%C3%A1lez-b%C3%B3rnez-2008).

El archivo de Tanzil se identifica como `es.bornez`, traductor Raúl González Bórnez, actualización 15 de julio de 2014. El pie consultado no identifica ISBN ni edición impresa. Falta establecer su correspondencia y si incluye las notas necesarias para conservar el sentido de esa edición. [Archivo fuente](https://tanzil.net/trans/es.bornez).

### Condiciones de las traducciones de Tanzil

La página establece uso no comercial; para otros usos remite al traductor o editor. No debe aplicarse a las traducciones la licencia del árabe. Estar en un repositorio MIT o distribuir gratuitamente la app no elimina esta restricción ni prueba el permiso para todas las redistribuciones del proyecto. [Condiciones de traducciones](https://tanzil.net/trans/).

**Alcance acordado:** app sin fines de lucro y distribución del contenido para uso no comercial, conservando sus condiciones por separado de MIT. No se presupone autorización para redistribuciones comerciales de terceros. Antes de empaquetar, verificar la edición disponible, las notas incluidas y los avisos del archivo concreto; cualquier uso que exceda las condiciones publicadas necesita aclaración con la fuente o el titular correspondiente.

### Cortés

Herder identifica la traducción y una edición de 2005. El archivo `es.cortes` de Tanzil indica actualización de agosto de 2014, sin precisar la equivalencia editorial en el pie consultado. No se encontró allí una autorización abierta independiente para redistribuir la edición de Herder. [Ficha editorial](https://encyclopaedia.herdereditorial.com/wiki/Fonte%3AEl_Cor%C3%A1n%2C_1986_1), [archivo Tanzil](https://tanzil.net/trans/es.cortes).

### QuranEnc como alternativa

El catálogo español consultado ofrece `spanish_garcia` versión 1.0.2, `spanish_montada_eu` y `spanish_montada_latin` versión 1.0.1, con enlaces SQLite. Estas versiones pueden cambiar; al importar hay que registrar la versión realmente descargada. [Catálogo oficial](https://quranenc.com/api/v1/translations/list/es?localization=es).

Sus condiciones permiten descarga y republicación sin añadir, quitar ni modificar contenido; exigen atribución al editor y QuranEnc, versión, conservación de la información de la copia, comunicación de observaciones y actualización según la fuente, además de restricciones sobre anuncios inapropiados. Ofrece API por sura/aleya con traducción y notas. El alcance de la obligación de actualización debe quedar resuelto para paquetes offline. [API y condiciones, sección Terms and Policies](https://quranenc.com/nqo/home/api).

No se sustituirá automáticamente Bórnez por estas opciones: su idoneidad para la lectura chií del usuario necesita una decisión editorial.

## Tipografía

**Amiri** es candidata para la presentación árabe. Su repositorio publica SIL Open Font License 1.1, que permite incluir la fuente con software manteniendo el aviso de derechos y la licencia. Al seleccionar una versión debe verificarse la licencia del artefacto exacto. Falta revisar los signos coránicos y la legibilidad en WebKitGTK y Windows; la licencia por sí sola no garantiza la presentación correcta. [Licencia del proyecto](https://raw.githubusercontent.com/aliftype/amiri/main/OFL.txt).

## Requisitos técnicos de la incorporación

Propuestas para la implementación, aún no ejecutadas:

- Conservar originales, fuente, edición, versión, fecha de descarga, aviso de derechos y hash SHA-256 por recurso. No guardar corpus de terceros bajo una licencia que no les corresponda.
- Importar datos estructurados por identificador sura/aleya; evitar OCR si existe texto autorizado. Separar traducción y notas sin reescribirlas ni generar texto religioso con IA.
- Comprobar secuencia, duplicados, faltantes, basmalas y correspondencia entre idiomas, con revisión humana de muestras y pasajes relevantes para el enfoque elegido.
- Renderizar árabe RTL y español LTR como texto, sin ejecutar marcado procedente del corpus. Mantener búsqueda o índices separados del texto original de lectura.
- Incluir contenido autorizado en el paquete o en descargas explícitas, con versión y procedencia visibles. La lectura instalada debe funcionar sin red.
- Mantener marcadores y última lectura por sura/aleya, separados de los archivos del corpus, para conservarlos al actualizar.
- Medir el tamaño real de los archivos seleccionados, incluidos fuente y notas, antes de decidir el paquete final. No se ha descargado ni medido el conjunto completo y no se fija aún un tamaño.
- Recitación en audio fuera de esta selección inicial; grabaciones, licencias y volumen de descarga requieren otra investigación.

## Consulta de permisos preparada para una próxima etapa

Destinatario por confirmar: responsable de derechos de la edición de Bórnez elegida, con Tanzil o la entidad que distribuye esa versión como contacto inicial. Miraguano e Islamoriente son vías identificadas, no titulares confirmados de todos los derechos digitales.

Borrador de consulta:

> Estamos desarrollando Adhan Companion, una aplicación de escritorio con código MIT para Linux y Windows. Deseamos incluir una edición identificada de la traducción de Raúl González Bórnez para lectura offline. ¿Quién puede autorizar su reproducción y redistribución en instaladores y repositorios públicos? ¿El permiso incluye las notas y la conversión a un formato estructurado por sura y aleya sin modificar el contenido? Necesitamos conocer atribución, límites comerciales, condiciones de actualización y la versión autorizada. Agradeceríamos confirmación escrita y, si es posible, el archivo oficial correspondiente.

No se enviaron mensajes a terceros. La implementación posterior incorporó los recursos indicados arriba para el alcance no comercial autorizado; no se amplían los permisos a uso comercial.
