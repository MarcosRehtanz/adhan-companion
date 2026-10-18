# Ubicación mediante Google Maps

Estado: implementado en el checkout; pendiente de revisión manual y publicación.

## Uso

1. Abrir **Horarios → Editar ubicación**.
2. Elegir **Abrir Google Maps**. Se abre el navegador en Google Maps; no se envían automáticamente las coordenadas guardadas.
3. Buscar el punto y hacer clic derecho para copiar sus coordenadas. También se puede copiar un enlace del lugar o el enlace corto de **Compartir**.
4. Pegar el texto y elegir **Revisar ubicación**.
5. Revisar el punto encontrado. **Ver punto en Google Maps** permite comprobarlo en el navegador. **Usar estas coordenadas** lo incorpora al formulario de edición.
6. Revisar la ciudad y la zona horaria y elegir **Guardar cambios**. **Cancelar** descarta la edición del bloque.

La ciudad y la zona horaria no se infieren del enlace. El cálculo continúa usando la zona horaria del sistema, de acuerdo con el comportamiento actual de la app. Una vez guardadas las coordenadas, el cálculo sigue funcionando sin conexión.

## Formatos admitidos

- Pares decimales en orden latitud, longitud: `-34.603722, -58.381592`.
- Enlaces de búsqueda con `query` o `q` que contengan ese par de coordenadas.
- Enlaces de un lugar con coordenadas en la ruta o con un único pin explícito `!3d…!4d…`.
- Enlaces cortos HTTPS de `maps.app.goo.gl` y `goo.gl/maps`, cuando sus redirecciones permiten obtener un enlace de punto compatible.

Los enlaces completos se interpretan localmente. Para los enlaces cortos se consulta únicamente la redirección de Google; se valida cada destino, se limita el número de saltos y el tiempo de espera, y no se descarga ni analiza el HTML del mapa. Si Google no proporciona una redirección compatible, se solicita copiar las coordenadas directamente.

Los enlaces completos admiten los dominios `google.com`, `google.com.ar`, `google.es`, `google.cl`, `google.com.uy`, `google.com.br` y `google.co.uk`, con sus variantes `www` y `maps`.

## Elección del punto

- El pin del lugar tiene prioridad sobre las coordenadas `@lat,lon` del centro de la vista. Un centro de mapa sin pin no basta para elegir una ubicación.
- Se rechazan rutas, vistas panorámicas, varios puntos diferentes y enlaces que solo identifican un lugar por su ID.
- La latitud debe estar entre −90 y 90, y la longitud entre −180 y 180. No se admiten valores no finitos.
- La importación y la vista previa no guardan datos. El guardado mantiene el flujo existente de configuración y valida también los rangos de las coordenadas manuales.
- La interfaz muestra seis decimales; la configuración conserva los valores numéricos interpretados sin redondearlos a la precisión de visualización.

## Integración

Se usa el plugin oficial de apertura de enlaces de Tauri. Los permisos permiten abrir Google Maps y conservan los enlaces de GitHub Releases usados por las actualizaciones. La interpretación se expone mediante un comando específico con permiso declarado en `src-tauri/permissions/location.toml`.

Fuentes técnicas: [Maps URLs de Google](https://developers.google.com/maps/documentation/urls/get-started) y [plugin Opener de Tauri](https://tauri.app/plugin/opener/). Las rutas con marcadores `!3d/!4d` se admiten como formato de enlace compartido, sin depender de una API de contenido o geocodificación.
