import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type PrayerAlert = { mode: "adhan" | "tone" | "notification"; tone: "soft" | "double" | "bell"; duration_secs: number };
export type AudioConfig = { volume: number; enabled: Record<string, boolean>; alerts: Record<string, PrayerAlert> };
const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const modes = { adhan: "Adhan", tone: "Tono discreto", notification: "Solo notificación" };
const tones = { soft: "Suave", double: "Doble pulso", bell: "Campana" };
function alertFor(audio: AudioConfig, key: string): PrayerAlert {
  return audio.alerts[key] ?? { mode: audio.enabled[key] === false ? "notification" : "adhan", tone: "soft", duration_secs: 3 };
}
export function PrayerAlertsSettings({ audio, editing, onChange, previewAvailable = true }: { previewAvailable?: boolean; audio: AudioConfig; editing: boolean; onChange: (patch: Partial<AudioConfig>) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<boolean | null>(null);
  const [queryError, setQueryError] = useState("");
  const [queried, setQueried] = useState(false);
  const lock = useRef(false);
  const active = useRef(false);
  const sequence = useRef(0);
  async function refresh() {
    const id = ++sequence.current;
    try { const value = await invoke<boolean | null>("alert_playback_status"); if (active.current && id === sequence.current) { setPlaying(value); setQueryError(""); setQueried(true); } }
    catch (e) { if (active.current && id === sequence.current) { setPlaying(null); setQueried(true); setQueryError(String(e)); } }
  }
  useEffect(() => {
    active.current = true;
    if (!previewAvailable) return () => { active.current = false; };
    let pending = false;
    const poll = async () => { if (pending || document.hidden) return; pending = true; try { await refresh(); } finally { pending = false; } };
    void poll(); const timer = window.setInterval(() => void poll(), 1000);
    return () => { active.current = false; sequence.current++; window.clearInterval(timer); };
  }, [previewAvailable]);
  function change(key: string, patch: Partial<PrayerAlert>) {
    const alert = { ...alertFor(audio, key), ...patch };
    onChange({ alerts: { ...audio.alerts, [key]: alert }, enabled: { ...audio.enabled, [key]: alert.mode !== "notification" } });
  }
  async function preview(key: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      await invoke("preview_alert", { audio, prayer: key });
      await refresh();
      setMessage(alertFor(audio, key).mode === "notification" ? "Notificación de prueba enviada." : "Prueba de sonido iniciada.");
    } catch (error) { setMessage(`No se pudo probar el aviso: ${error}`); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }
  return <div className="prayer-alerts">
    {editing ? <label>Volumen de los avisos · {audio.volume}%<input type="range" min="0" max="100" value={audio.volume} onChange={e => onChange({ volume: +e.target.value })} /></label> : <p>Volumen de los avisos: <b>{audio.volume}%</b></p>}
    <div className="alert-list">{prayers.map(prayer => {
      const key = prayer.toLowerCase(), alert = alertFor(audio, key);
      return <div className="alert-card" key={key}>
        <div className="alert-card-heading"><strong>{prayer}</strong><button type="button" className="secondary-button" disabled={busy || !previewAvailable} onClick={() => preview(key)}>Probar {prayer}</button></div>
        {editing ? <div className="alert-fields">
          <label>Aviso<select value={alert.mode} onChange={e => change(key, { mode: e.target.value as PrayerAlert["mode"] })}>{Object.entries(modes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {alert.mode === "tone" && <><label>Tono<select value={alert.tone} onChange={e => change(key, { tone: e.target.value as PrayerAlert["tone"] })}>{Object.entries(tones).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Duración (segundos)<select value={alert.duration_secs} onChange={e => change(key, { duration_secs: +e.target.value })}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option value={n} key={n}>{n}</option>)}</select></label></>}
        </div> : <span>{modes[alert.mode]}{alert.mode === "tone" ? ` · ${tones[alert.tone]} · ${alert.duration_secs} s` : ""}</span>}
      </div>;
    })}</div>
    {previewAvailable && <p role="status">{!queried ? "Consultando sonido…" : playing === true ? "Aviso sonoro en reproducción." : playing === false ? "No hay un aviso sonoro activo." : "Esta compilación no permite confirmar el estado del sonido."}</p>}
    {previewAvailable && queried && playing !== false && <button type="button" className="secondary-button" disabled={busy} onClick={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setMessage("");
      try { await invoke("stop_alert"); await refresh(); setMessage("Orden de detener enviada."); }
      catch (e) { setMessage(`No se pudo detener el sonido: ${e}`); }
      finally { lock.current = false; if (active.current) setBusy(false); }
    }}>{busy ? "Aplicando…" : "Detener sonido"}</button>}
    {queryError && <div role="alert"><p>{queryError}</p><button className="link-button" disabled={busy} onClick={() => void refresh()}>Consultar sonido</button></div>}
    {!previewAvailable && <p className="nota">Las pruebas de sonido no están disponibles en esta plataforma.</p>}
    <p role="status" aria-live="polite">{message}</p>
    <p className="nota">El volumen es compartido por el adhan y los tonos. Solo notificación no reproduce audio de la app; el sonido del sistema depende de tus preferencias de notificaciones. Probar usa los valores al pulsarlo; no guarda cambios ni marca el rezo.</p>
  </div>;
}
