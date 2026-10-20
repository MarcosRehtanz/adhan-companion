import { useEffect, useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, MapPin } from "lucide-react";

interface Coordinates {
  lat: number;
  lon: number;
}

export function GoogleMapsLocationPicker({ current, onUse, disabled = false }: {
  current: Coordinates;
  onUse: (point: Coordinates) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const helpId = useId();
  const alive = useRef(false);
  const lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [browserError, setBrowserError] = useState("");
  const [input, setInput] = useState("");
  const [point, setPoint] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = point !== null && point.lat === current.lat && point.lon === current.lon;

  const openMap = async (url = "https://www.google.com/maps") => {
    setBrowserError("");
    try {
      await openUrl(url);
    } catch {
      setBrowserError("No se pudo abrir el navegador. Podés abrir Google Maps por tu cuenta y pegar las coordenadas aquí.");
    }
  };

  const review = async () => {
    if (!input.trim() || point || lock.current || disabled) return;
    lock.current = true; setLoading(true);
    setError(null);
    setPoint(null);
    try {
      const value = await invoke<Coordinates>("parse_google_maps_location", { input });
      if (alive.current) setPoint(value);
    } catch (cause) {
      if (alive.current) setError(String(cause));
    } finally {
      lock.current = false; if (alive.current) setLoading(false);
    }
  };

  const previewUrl = point
    ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: `${point.lat},${point.lon}` })}`
    : "";

  return (
    <section className="maps-picker" aria-label="Ubicación desde Google Maps">
      <div className="maps-heading">
        <div><h3><MapPin size={15} />Elegir un punto en el mapa</h3><p>Abrí Google Maps y hacé clic derecho sobre el lugar para copiar sus coordenadas.</p></div>
        <button type="button" className="test" disabled={disabled} onClick={() => openMap()}><ExternalLink size={14} />Abrir Google Maps</button>
      </div>
      <div className="maps-import">
        <label htmlFor={inputId}>Coordenadas o enlace de Google Maps</label>
        <div className="maps-input-row">
          <input id={inputId} type="text" value={input} maxLength={8192} disabled={loading || disabled}
            placeholder="-34.603722, -58.381592 o enlace del punto"
            aria-describedby={helpId} aria-invalid={error ? true : undefined}
            onChange={(event) => { setInput(event.target.value); setPoint(null); setError(null); }}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void review(); } }} />
          {!point && <button type="button" className="test" disabled={loading || disabled || !input.trim()} onClick={review}>{loading ? "Leyendo ubicación…" : error ? "Reintentar ubicación" : "Revisar ubicación"}</button>}
        </div>
        <p className="nota" id={helpId}>Podés pegar coordenadas decimales o el enlace de un lugar. Los enlaces cortos de Compartir necesitan Internet; el centro del mapa y las rutas no se usan como ubicación.</p>
      </div>
      <div aria-live="polite" aria-busy={loading}>
        {browserError && <p className="maps-error" role="alert">{browserError}</p>}
        {error && <p className="maps-error" role="alert">{error}</p>}
        {point && <div className="maps-preview">
          <div><span>Punto encontrado</span><strong>{point.lat.toFixed(6)}, {point.lon.toFixed(6)}</strong></div>
          <div className="maps-actions">
            <button type="button" className="link-button" onClick={() => openMap(previewUrl)}>Ver punto en Google Maps <ExternalLink size={12} /></button>
            {used ? <span role="status"><Check size={14} /> Coordenadas incorporadas</span> : <button type="button" className="test" disabled={disabled} onClick={() => onUse(point)}><Check size={14} />Usar estas coordenadas</button>}
          </div>
          <p className="nota">{used ? "Revisá la ciudad y pulsá Guardar cambios para conservar esta ubicación." : "Revisá el punto y elegí Usar estas coordenadas para incorporarlo a la edición."} La ciudad y la zona horaria no se cambian automáticamente.</p>
        </div>}
      </div>
    </section>
  );
}
