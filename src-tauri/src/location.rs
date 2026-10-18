//! Importación de puntos de Google Maps. Solo los enlaces cortos usan red;
//! interpretar coordenadas o enlaces completos no consulta Google ni guarda datos.

use std::process::{Command, Stdio};

use percent_encoding::percent_decode_str;
use serde::Serialize;
use tauri::Url;

const INPUT_HELP: &str =
    "Pegá coordenadas decimales, como -34.6037, -58.3816, o un enlace de un punto de Google Maps.";
const POINT_HELP: &str = "El enlace no contiene un punto inequívoco. En Google Maps, hacé clic derecho sobre el lugar y copiá sus coordenadas.";

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Coordinates {
    pub lat: f64,
    pub lon: f64,
}

impl Coordinates {
    pub fn validated(lat: f64, lon: f64) -> Result<Self, String> {
        if !lat.is_finite()
            || !lon.is_finite()
            || !(-90.0..=90.0).contains(&lat)
            || !(-180.0..=180.0).contains(&lon)
        {
            return Err(
                "La latitud debe estar entre -90 y 90, y la longitud entre -180 y 180.".into(),
            );
        }
        Ok(Self { lat, lon })
    }
}

enum Input {
    Point(Coordinates),
    ShortLink(Url),
}

fn coordinate_pair(text: &str) -> Option<Result<Coordinates, String>> {
    let mut parts = text.trim().split(',');
    let lat = parts.next()?.trim().parse::<f64>().ok()?;
    let lon = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(Coordinates::validated(lat, lon))
}

fn maps_host(host: &str) -> bool {
    let domain = host
        .strip_prefix("www.")
        .or_else(|| host.strip_prefix("maps."))
        .unwrap_or(host);
    matches!(
        domain,
        "google.com"
            | "google.com.ar"
            | "google.es"
            | "google.cl"
            | "google.com.uy"
            | "google.com.br"
            | "google.co.uk"
    )
}

fn inspect(input: &str) -> Result<Input, String> {
    let input = input.trim();
    if input.is_empty() || input.len() > 8192 {
        return Err(INPUT_HELP.into());
    }
    if let Some(point) = coordinate_pair(input) {
        return point.map(Input::Point);
    }
    let url = Url::parse(input).map_err(|_| INPUT_HELP.to_string())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err("Usá un enlace HTTPS de Google Maps o copiá las coordenadas del punto.".into());
    }
    let host = url.host_str().unwrap_or_default();
    if (host == "maps.app.goo.gl" && url.path().trim_matches('/').len() > 0)
        || (host == "goo.gl" && url.path().starts_with("/maps/") && url.path().len() > 6)
    {
        return Ok(Input::ShortLink(url));
    }
    if !maps_host(host)
        || !(url.path() == "/maps" || url.path().starts_with("/maps/") || host.starts_with("maps."))
    {
        return Err(
            "Ese enlace no es de Google Maps. Copiá el enlace del punto o sus coordenadas.".into(),
        );
    }
    let pairs: Vec<_> = url.query_pairs().collect();
    if url.path().starts_with("/maps/dir")
        || pairs.iter().any(|(key, value)| {
            matches!(
                key.as_ref(),
                "origin" | "destination" | "waypoints" | "saddr" | "daddr" | "cbll"
            ) || (key == "map_action" && value == "pano")
        })
    {
        return Err("El enlace corresponde a una ruta o vista panorámica. Elegí un único punto y copiá sus coordenadas.".into());
    }
    let path = percent_decode_str(url.path())
        .decode_utf8()
        .map_err(|_| INPUT_HELP.to_string())?;
    let mut pins = Vec::new();
    // Enlaces de un lugar: el pin !3d/!4d puede diferir del centro @lat,lon.
    for data in std::iter::once(path.as_ref()).chain(
        pairs
            .iter()
            .filter(|(key, _)| key == "data")
            .map(|(_, value)| value.as_ref()),
    ) {
        for candidate in data.split("!3d").skip(1) {
            if let Some((lat, rest)) = candidate.split_once("!4d") {
                let lon = rest.split('!').next().unwrap_or_default();
                if let Some(point) = coordinate_pair(&format!("{lat},{lon}")) {
                    pins.push(point?);
                }
            }
        }
    }
    if pins.is_empty() && pairs.iter().any(|(key, _)| key == "query_place_id") {
        return Err(POINT_HELP.into());
    }
    for (_, value) in pairs.iter().filter(|(key, _)| key == "q" || key == "query") {
        if let Some(point) = coordinate_pair(value) {
            pins.push(point?);
        }
    }
    if let Some(place) = path
        .strip_prefix("/maps/place/")
        .and_then(|tail| tail.split('/').next())
    {
        if let Some(point) = coordinate_pair(place) {
            pins.push(point?);
        }
    }
    let point = pins
        .first()
        .copied()
        .ok_or_else(|| POINT_HELP.to_string())?;
    if pins.iter().any(|other| *other != point) {
        return Err("El enlace contiene varios puntos diferentes. Copiá las coordenadas del lugar que querés usar.".into());
    }
    Ok(Input::Point(point))
}

fn resolve_with(
    input: &str,
    mut redirect: impl FnMut(&Url) -> Result<Url, String>,
) -> Result<Coordinates, String> {
    let mut current = input.trim().to_string();
    for hop in 0..=4 {
        match inspect(&current)? {
            Input::Point(point) => return Ok(point),
            Input::ShortLink(url) if hop < 4 => current = redirect(&url)?.to_string(),
            Input::ShortLink(_) => return Err("No se pudo resolver el enlace corto. Abrilo en Google Maps y copiá las coordenadas.".into()),
        }
    }
    unreachable!()
}

pub fn resolve(input: &str) -> Result<Coordinates, String> {
    resolve_with(input, |url| {
        let mut command = Command::new("curl");
        command
            .args([
                "--disable",
                "--silent",
                "--show-error",
                "--head",
                "--fail",
                "--proto",
                "=https",
                "--connect-timeout",
                "3",
                "--max-time",
                "5",
                "--url",
            ])
            .arg(url.as_str())
            .stdin(Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // No abrir una consola para curl.
        }
        let response = command.output().map_err(|_| "No se pudo consultar el enlace corto. Podés copiar las coordenadas directamente desde Google Maps.".to_string())?;
        if !response.status.success() {
            return Err("No se pudo resolver el enlace corto. Revisá la conexión o copiá las coordenadas desde Google Maps.".into());
        }
        let headers = String::from_utf8_lossy(&response.stdout);
        let location = headers
            .lines()
            .filter_map(|line| {
                let (key, value) = line.split_once(':')?;
                key.eq_ignore_ascii_case("location").then_some(value.trim())
            })
            .next_back()
            .ok_or_else(|| POINT_HELP.to_string())?;
        // No seguir redirecciones automáticamente: cada destino se valida antes
        // de hacer otra petición, y no se descarga el contenido del mapa.
        url.join(location)
            .map_err(|_| "El enlace corto devolvió una dirección no válida.".into())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn offline(input: &str) -> Result<Coordinates, String> {
        resolve_with(input, |_| {
            panic!("Las coordenadas y los enlaces completos no deben usar red")
        })
    }

    #[test]
    fn decimal_coordinates_preserve_precision_and_zero() {
        assert_eq!(
            offline(" -34.603722, -58.381592 ").unwrap(),
            Coordinates {
                lat: -34.603722,
                lon: -58.381592
            }
        );
        assert_eq!(offline("0,0").unwrap(), Coordinates { lat: 0.0, lon: 0.0 });
        assert!(offline("90,180").is_ok());
    }

    #[test]
    fn refuses_invalid_or_out_of_range_coordinates() {
        for input in [
            "",
            "91,0",
            "0,-181",
            "NaN,0",
            "0,inf",
            "1,2,3",
            "un lugar",
            "34°36′, 58°22′",
        ] {
            assert!(offline(input).is_err(), "{input}");
        }
    }

    #[test]
    fn reads_search_and_legacy_query_links() {
        for input in [
            "https://www.google.com/maps/search/?api=1&query=-34.603722%2C-58.381592",
            "https://maps.google.com/?q=-34.603722,-58.381592",
            "https://www.google.com.ar/maps?q=-34.603722,-58.381592",
        ] {
            assert_eq!(
                offline(input).unwrap(),
                Coordinates {
                    lat: -34.603722,
                    lon: -58.381592
                }
            );
        }
    }

    #[test]
    fn selected_pin_takes_precedence_over_the_viewport() {
        let point = offline("https://www.google.com/maps/place/Un+lugar/@-30,-60,15z/data=!4m6!3m5!1splace!8m2!3d-34.603722!4d-58.381592!16sabc").unwrap();
        assert_eq!(
            point,
            Coordinates {
                lat: -34.603722,
                lon: -58.381592
            }
        );
        assert!(offline("https://www.google.com/maps/@-30,-60,15z").is_err());
        assert!(
            offline("https://www.google.com/maps/?api=1&map_action=map&center=-30,-60").is_err()
        );
    }

    #[test]
    fn reads_coordinates_in_a_place_path_and_percent_encoded_pin() {
        assert_eq!(
            offline("https://www.google.com/maps/place/-34.6%2C-58.3/@-30,-60,15z").unwrap(),
            Coordinates {
                lat: -34.6,
                lon: -58.3
            }
        );
        assert_eq!(
            offline("https://www.google.com/maps/place/Punto/data=%213d-34.6%214d-58.3").unwrap(),
            Coordinates {
                lat: -34.6,
                lon: -58.3
            }
        );
    }

    #[test]
    fn refuses_routes_place_ids_and_ambiguous_points() {
        for input in [
            "https://www.google.com/maps/dir/1,2/3,4",
            "https://www.google.com/maps?origin=1,2&destination=3,4&q=1,2",
            "https://www.google.com/maps/search/?api=1&query=1,2&query_place_id=abc",
            "https://www.google.com/maps?q=1,2&query=3,4",
            "https://www.google.com/maps/place/Punto/data=!3d1!4d2!3d3!4d4",
        ] {
            assert!(offline(input).is_err(), "{input}");
        }
    }

    #[test]
    fn refuses_unrelated_hosts_credentials_and_protocols() {
        for input in [
            "https://www.google.com.ejemplo.com/maps?q=1,2",
            "https://www.google.com@ejemplo.com/maps?q=1,2",
            "https://user:password@www.google.com/maps?q=1,2",
            "http://www.google.com/maps?q=1,2",
            "https://www.google.com:444/maps?q=1,2",
            "https://www.google.com/search?q=1,2",
            "file:///maps?q=1,2",
            "https://goo.gl/otro",
        ] {
            assert!(offline(input).is_err(), "{input}");
        }
    }

    #[test]
    fn resolves_supported_short_links_before_reading_the_pin() {
        for short in [
            "https://maps.app.goo.gl/Example?g_st=ic",
            "https://goo.gl/maps/Example",
        ] {
            let mut calls = 0;
            let point = resolve_with(short, |_| {
                calls += 1;
                Ok(Url::parse("https://www.google.com/maps?q=-34.6,-58.3").unwrap())
            })
            .unwrap();
            assert_eq!(
                point,
                Coordinates {
                    lat: -34.6,
                    lon: -58.3
                }
            );
            assert_eq!(calls, 1);
        }
    }

    #[test]
    fn stops_redirects_to_other_hosts_and_caps_redirect_loops() {
        let mut calls = 0;
        let result = resolve_with("https://maps.app.goo.gl/Example", |_| {
            calls += 1;
            Ok(Url::parse("https://127.0.0.1/maps?q=1,2").unwrap())
        });
        assert!(result.is_err());
        assert_eq!(calls, 1);
        calls = 0;
        let result = resolve_with("https://maps.app.goo.gl/Example", |url| {
            calls += 1;
            Ok(url.clone())
        });
        assert!(result.is_err());
        assert_eq!(calls, 4);
    }

    #[test]
    fn surfaces_short_link_network_errors() {
        let error = resolve_with("https://maps.app.goo.gl/Example", |_| {
            Err("Sin conexión".into())
        })
        .unwrap_err();
        assert_eq!(error, "Sin conexión");
    }
}
