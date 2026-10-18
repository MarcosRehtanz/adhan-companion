import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type PrayerAlert = { mode: "adhan" | "tone" | "notification"; tone: "soft" | "double" | "bell"; duration_secs: number };
export type AudioConfig = { volume: number; enabled: Record<string, boolean>; alerts: Record<string, PrayerAlert> };
const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const modes = { adhan: "Adhan", tone: "Tono discreto", notification: "Solo notificación" };
const tones = { soft: "Suave", double: "Doble pulso", bell: "Campana" };
function alertFor(audio: AudioConfig, key: string): PrayerAlert {
  return audio.alerts[key] ?? { mode: audio.enabled[key] === false ? "notification" : "adhan", tone: "soft", duration_secs: 3 };
}
export function PrayerAlertsSettings({ audio, editing, onChange }: { audio: AudioConfig; editing: boolean; onChange: (patch: Partial<AudioConfig>) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function change(key: string, patch: Partial<PrayerAlert>) {
    const alert = { ...alertFor(audio, key), ...patch };
    onChange({ alerts: { ...audio.alerts, [key]: alert }, enabled: { ...audio.enabled, [key]: alert.mode !== "notification" } });
  }
  async function preview(key: string) {
    setBusy(true);
    try {
      await invoke("preview_alert", { audio, prayer: key });
      setMessage(alertFor(audio, key).mode === "notification" ? "Notificación de prueba enviada." : "Reproduciendo la configuración mostrada. Podés detenerla abajo.");
    } catch (error) { setMessage(`No se pudo probar el aviso: ${error}`); }
    finally { setBusy(false); }
  }
  return <div className="prayer-alerts">
    {editing ? <label>Volumen de los avisos · {audio.volume}%<input type="range" min="0" max="100" value={audio.volume} onChange={e => onChange({ volume: +e.target.value })} /></label> : <p>Volumen de los avisos: <b>{audio.volume}%</b></p>}
    <div className="alert-list">{prayers.map(prayer => {
      const key = prayer.toLowerCase(), alert = alertFor(audio, key);
      return <div className="alert-card" key={key}>
        <div className="alert-card-heading"><strong>{prayer}</strong><button type="button" className="secondary-button" disabled={busy} onClick={() => preview(key)}>Probar {prayer}</button></div>
        {editing ? <div className="alert-fields">
          <label>Aviso<select value={alert.mode} onChange={e => change(key, { mode: e.target.value as PrayerAlert["mode"] })}>{Object.entries(modes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          {alert.mode === "tone" && <><label>Tono<select value={alert.tone} onChange={e => change(key, { tone: e.target.value as PrayerAlert["tone"] })}>{Object.entries(tones).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Duración (segundos)<select value={alert.duration_secs} onChange={e => change(key, { duration_secs: +e.target.value })}>{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option value={n} key={n}>{n}</option>)}</select></label></>}
        </div> : <span>{modes[alert.mode]}{alert.mode === "tone" ? ` · ${tones[alert.tone]} · ${alert.duration_secs} s` : ""}</span>}
      </div>;
    })}</div>
    <button type="button" className="secondary-button" onClick={async () => { try { await invoke("stop_alert"); setMessage("Sonido detenido."); } catch (e) { setMessage(`No se pudo detener el sonido: ${e}`); } }}>Detener sonido</button>
    <p role="status" aria-live="polite">{message}</p>
    <p className="nota">El volumen es compartido por el adhan y los tonos. Solo notificación no reproduce audio de la app; el sonido del sistema depende de tus preferencias de notificaciones. Probar no guarda cambios ni marca el rezo.</p>
  </div>;
}
