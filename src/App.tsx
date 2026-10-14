// Ventana de configuración + dashboard del día (Adhan Companion)
// Contratos IPC: get_config/set_config (Config), get_schedule (Schedule),
// schedule_changed (evento), test_adhan, set_autostart.

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Schedule } from "./types";
import "./App.css";

const METHOD_OPTIONS = ["MWL", "ISNA", "Egypt", "Makkah", "Karachi", "Tehran", "Jafari", "Custom"];
const MADHAB_OPTIONS = ["Shafi", "Hanafi"];
const HIGH_LAT_OPTIONS = ["None", "MiddleOfNight", "AngleBased", "AqrabAlAyyam", "AqrabAlBilad", "OneSeventh", "FixedAngle"];

type Tabs = "ubicacion" | "calculo" | "audio" | "agente" | "avanzado";
const TABS: [Tabs, string][] = [
  ["ubicacion", "📍 Ubicación"],
  ["calculo", "🧮 Cálculo"],
  ["audio", "🔊 Audio"],
  ["agente", "🛰 Agente"],
  ["avanzado", "⚙️ Avanzado"],
];

interface Config {
  version: number;
  city: string;
  lat: number;
  lon: number;
  tz: string;
  method: string;
  madhab: string;
  highLatRule: string;
  offsets: { fajr: number; dhuhr: number; asr: number; maghrib: number; isha: number };
  audio: { volume: number; enabled: Record<string, boolean>; muecin: Record<string, string> };
  notice: { minutes_before: number };
  agent: { mqtt: boolean; broker: string };
}

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

export default function App() {
  const [tab, setTab] = useState<Tabs>("ubicacion");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    invoke<Config>("get_config").then(setCfg).catch((e) => setStatus("config: " + e));
    invoke<Schedule>("get_schedule").then(setSchedule).catch(() => {});
    const un = listen<Schedule>("schedule_changed", (ev) => setSchedule(ev.payload));
    return () => { un.then((f) => f()); };
  }, []);

  const save = useCallback(async (next: Config) => {
    setCfg(next);
    try {
      const saved = await invoke<Config>("set_config", { cfg: next });
      setCfg(saved);
      setStatus("✓ guardado");
      setTimeout(() => setStatus(""), 2500);
    } catch (e) {
      setStatus("error: " + e);
    }
  }, []);

  // Sugerencia de ubicación por IP (única pieza de red del spec)
  const [detectando, setDetectando] = useState(false);
  const detectarPorIP = async () => {
    setDetectando(true);
    setStatus("");
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (!res.ok) throw new Error("ipapi.co HTTP " + res.status);
      const j = await res.json();
      if (!cfg) throw new Error("config aún sin cargar");
      upd({
        city: String(j.city ?? cfg.city),
        lat: Number(j.latitude ?? cfg.lat),
        lon: Number(j.longitude ?? cfg.lon),
        tz: String(j.timezone ?? cfg.tz),
      });
      setStatus(`✓ sugerencia de IP: ${j.city}, ${j.country_name} — revisá y guardá`);
    } catch (e) {
      setStatus("detectar: " + e + " — cargá lat/lon manual");
    } finally {
      setDetectando(false);
    }
  };

  if (!cfg) {
    return <div className="cargando">Cargando configuración…</div>;
  }
  const upd = (patch: Partial<Config>) => setCfg({ ...cfg, ...patch });
  const updAudio = (patch: Partial<Config["audio"]>) => setCfg({ ...cfg, audio: { ...cfg.audio, ...patch } });

  return (
    <div className="app">
      <header>
        <h1>Adhan Companion</h1>
        {schedule && (
          <div className="resumen-dia">
            <span className="proximo">
              {schedule.next ? `${schedule.next}: ${schedule.prayers.find(p => p.name === schedule.next)?.hhmm}` : "Los 5 ya pasaron — hasta medianoche"}
            </span>
            {schedule.countdown_secs != null && schedule.countdown_secs > 0 && (
              <span className="countdown">
                en {Math.floor(schedule.countdown_secs / 3600)}:{String((schedule.countdown_secs % 3600) / 60 | 0).padStart(2, "0")}
              </span>
            )}
          </div>
        )}
        <span className="status">{status}</span>
      </header>

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "activa" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "ubicacion" && (
          <section>
            <button
              className="test"
              disabled={detectando}
              onClick={detectarPorIP}
            >
              {detectando ? "detectando…" : "🌐 Detectar por IP (sugerencia)"}
            </button>
            <p className="nota">
              El cálculo es 100% local — la red se usa solo para esto: sugerir
              la ubicación, no calcula nada. Revisá los datos y guardá.
            </p>
            <label>Ciudad <input value={cfg.city} onChange={(e) => upd({ city: e.target.value })} /></label>
            <div className="fila">
              <label>Latitud <input type="number" step="0.001" value={cfg.lat} onChange={(e) => upd({ lat: +e.target.value })} /></label>
              <label>Longitud <input type="number" step="0.001" value={cfg.lon} onChange={(e) => upd({ lon: +e.target.value })} /></label>
            </div>
            <label>
              Zona horaria (IANA — se aplica con el TZ del sistema)
              <input value={cfg.tz} onChange={(e) => upd({ tz: e.target.value })} disabled />
            </label>
            <p className="nota">
              Manual: en <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Google Maps</a>, clic derecho sobre tu casa y
              copiá las coordenadas — latitud con <code>−</code> si estás al sur, longitud con <code>−</code> si estás al oeste.
            </p>
          </section>
        )}

        {tab === "calculo" && (
          <section>
            <label>Método
              <select value={cfg.method} onChange={(e) => upd({ method: e.target.value })}>
                {METHOD_OPTIONS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>Madhab (Asr)
              <select value={cfg.madhab} onChange={(e) => upd({ madhab: e.target.value })}>
                {MADHAB_OPTIONS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>Regla de latitud alta
              <select value={cfg.highLatRule} onChange={(e) => upd({ highLatRule: e.target.value })}>
                {HIGH_LAT_OPTIONS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <fieldset className="offsets">
              <legend>Offsets por rezo (minutos ±)</legend>
              {PRAYERS.map((p) => (
                <label key={p}>
                  {p}
                  <input
                    type="number" step="1"
                    value={(cfg.offsets[p.toLowerCase() as keyof Config["offsets"]]) ?? 0}
                    onChange={(e) => upd({ offsets: { ...cfg.offsets, [p.toLowerCase()]: +e.target.value } })}
                  />
                </label>
              ))}
            </fieldset>
          </section>
        )}

        {tab === "audio" && (
          <section>
            <label>
              Volumen: {cfg.audio.volume}%
              <input type="range" min="0" max="100" value={cfg.audio.volume}
                onChange={(e) => updAudio({ volume: +e.target.value })} />
            </label>
            <div className="fila">
              {PRAYERS.map((p) => (
                <label key={p} className="check">
                  <input type="checkbox" checked={cfg.audio.enabled[p.toLowerCase()] ?? true}
                    onChange={(e) => updAudio({ enabled: { ...cfg.audio.enabled, [p.toLowerCase()]: e.target.checked } })} />
                  {p}
                </label>
              ))}
            </div>
            <button className="test" onClick={() => invoke("test_adhan").catch((e) => setStatus("test: " + e))}>
              ▶ Probar adhan (beep del spike)
            </button>
            <p className="nota">Biblioteca de muecines: llega en v1.1 (model de assets con licencias abiertas pendiente).</p>
          </section>
        )}

        {tab === "agente" && (
          <section>
            <label className="check">
              <input type="checkbox" checked={cfg.agent.mqtt}
                onChange={(e) => upd({ agent: { ...cfg.agent, mqtt: e.target.checked } })} />
              MQTT (agente del nodo — v1.1)
            </label>
            <label>
              Broker <input value={cfg.agent.broker} placeholder="casa.local:1883"
                onChange={(e) => upd({ agent: { ...cfg.agent, broker: e.target.value } })} />
            </label>
            <p className="nota">El rol agente (push schedule + onboarding del nodo) entra con la v1.1.</p>
          </section>
        )}

        {tab === "avanzado" && (
          <section>
            <AutostartBox />
            <label>
              Preaviso (min antes)
              <input type="number" value={cfg.notice.minutes_before}
                onChange={(e) => upd({ notice: { minutes_before: +e.target.value } })} />
            </label>
            <p className="nota">Config en <code>~/.config/adhan-companion/config.json</code> (schema compatible MQTT del nodo).</p>
          </section>
        )}
      </main>

      <footer>
        <button className="guardar" onClick={() => cfg && save(cfg)}>Guardar configuración</button>
      </footer>
    </div>
  );
}

function AutostartBox() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    // estado real del plugin: leida via get del module; para MVP el estado
    // visual arranca off y setea el toggle
  }, []);
  const toggle = (v: boolean) => {
    setOn(v);
    invoke("set_autostart", { enabled: v }).catch(() => setOn(!v));
  };
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
      Iniciar sesión automáticamente
    </label>
  );
}
