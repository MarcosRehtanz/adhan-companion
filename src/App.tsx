// Ventana de configuración + dashboard del día (Adhan Companion)
// Contratos IPC: get_config/set_config (Config), get_schedule (Schedule),
// schedule_changed (evento), test_adhan, test_notification, set_autostart, mark_prayed.

import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  MapPin, Calculator, Volume2, Network, Settings, Play,
  Check, LocateFixed, CheckCircle2, AlertCircle, ListChecks, Compass, type LucideIcon,
} from "lucide-react";
import type { Schedule, MarkedDay } from "./types";
import logo from "./assets/logo.png";
import "./App.css";

const METHOD_OPTIONS = ["MWL", "ISNA", "Egypt", "Makkah", "Karachi", "Tehran", "Jafari", "Custom"];
const MADHAB_OPTIONS = ["Shafi", "Hanafi"];
const HIGH_LAT_OPTIONS = ["None", "MiddleOfNight", "AngleBased", "AqrabAlAyyam", "AqrabAlBilad", "OneSeventh", "FixedAngle"];
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

type Tabs = "ubicacion" | "calculo" | "audio" | "seguimiento" | "agente" | "avanzado";
const TABS: { id: Tabs; label: string; Icon: LucideIcon }[] = [
  { id: "ubicacion", label: "Ubicación", Icon: MapPin },
  { id: "calculo", label: "Cálculo", Icon: Calculator },
  { id: "audio", label: "Audio", Icon: Volume2 },
  { id: "seguimiento", label: "Seguimiento", Icon: ListChecks },
  { id: "agente", label: "Agente", Icon: Network },
  { id: "avanzado", label: "Avanzado", Icon: Settings },
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
  audio: { volume: number; enabled: Record<string, boolean>; muecin: Record<string, string>; muecinPorRezo: Record<string, string> };
  notice: { minutes_before: number };
  agent: { mqtt: boolean; broker: string };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/// Componente raíz: header (logo + día + horarios), tabs, y la card del tab activo.
/// El estado vive en Rust (core); acá se lee por IPC (`get_config`, `get_schedule`)
/// y se empuja por eventos (`schedule_changed`).
export default function App() {
  const [tab, setTab] = useState<Tabs>("ubicacion");
  const [cfg, setCfg] = useState<Config | null>(null);
  const [guardada, setGuardada] = useState<Config | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  // qibla del config actual (grados desde el norte — referencia)
  const [qibla, setQibla] = useState<number | null>(null);

  // Catálogo de muecines disponibles (default embebido + disco), para los
  // selectores por rezo de la tab Audio.
  const [muecines, setMuecines] = useState<string[]>([]);

  useEffect(() => {
    invoke<Config>("get_config").then((c) => { setCfg(c); setGuardada(c); }).catch(() => {});
    invoke<Schedule>("get_schedule").then(setSchedule).catch(() => {});
    invoke<number>("get_qibla").then(setQibla).catch(() => {});
    invoke<string[]>("list_muecines").then(setMuecines).catch(() => {});
    const un = listen<Schedule>("schedule_changed", (ev) => setSchedule(ev.payload));
    return () => { un.then((f) => f()); };
  }, []);

  const pendiente = useMemo(
    () => !!cfg && !!guardada && JSON.stringify(cfg) !== JSON.stringify(guardada),
    [cfg, guardada],
  );

  const save = useCallback(async () => {
    if (!cfg) return;
    try {
      const saved = await invoke<Config>("set_config", { cfg });
      setCfg(saved);
      setGuardada(saved);
      invoke<number>("get_qibla").then(setQibla).catch(() => {});
      setStatus({ text: "Guardado", kind: "ok" });
    } catch (e) {
      setStatus({ text: "Error al guardar: " + e, kind: "error" });
    }
    setTimeout(() => setStatus(null), 3000);
  }, [cfg]);

  const flash = useCallback((text: string, kind: "ok" | "error") => {
    setStatus({ text, kind });
    setTimeout(() => setStatus(null), 3000);
  }, []);

  // Sugerencia de ubicación por IP (única pieza de red del spec)
  // Cadena de proveedores: si uno falla o no trae ciudad, se prueba el próximo.
  // Nota de precisión: la geolocalización de IP es a nivel subnet del ISP —
  // a veces devuelve el hub/nodo del proveedor (ej. Buenos Aires) en vez del
  // pueblo/ciudad. Es una *sugerencia*: la revisión manual es parte del diseño.
  const [detectando, setDetectando] = useState(false);
  const detectarPorIP = async () => {
    setDetectando(true);
    try {
      type Rta = { city: string; lat: number; lon: number; tz: string; pais: string };
      const proveedores: { url: string; parse: (j: any) => Rta | null }[] = [
        { // ipwho.is — success explícito, lat/lon numéricos
          url: "https://ipwho.is/",
          parse: (j) =>
            j.success !== false && j.city
              ? { city: String(j.city), lat: Number(j.latitude), lon: Number(j.longitude), tz: String(j.timezone.id), pais: String(j.country) }
              : null,
        },
        { // geojs — json plano sin rate limit duro
          url: "https://get.geojs.io/v1/ip/geo.json",
          parse: (j) =>
            j.city
              ? { city: String(j.city), lat: Number(j.latitude), lon: Number(j.longitude), tz: String(j.timezone), pais: String(j.country) }
              : null,
        },
        { // ipapi.co — el original; a veces rate-limita (HTTP 429)
          url: "https://ipapi.co/json/",
          parse: (j) =>
            j.city && !j.error
              ? { city: String(j.city), lat: Number(j.latitude), lon: Number(j.longitude), tz: String(j.timezone), pais: String(j.country_name) }
              : null,
        },
      ];
      let rta: Rta | null = null;
      let ultimoError: unknown = null;
      for (const p of proveedores) {
        try {
          const res = await fetch(p.url);
          if (!res.ok) throw new Error("HTTP " + res.status);
          const parsed = p.parse(await res.json());
          if (parsed) { rta = parsed; break; }
        } catch (e) { ultimoError = e; }
      }
      if (!rta) throw (ultimoError ?? new Error("ningún proveedor devolvió ciudad"));
      if (!cfg) throw new Error("config aún sin cargar");
      upd({
        city: rta.city,
        lat: Number.isFinite(rta.lat) ? rta.lat : cfg.lat,
        lon: Number.isFinite(rta.lon) ? rta.lon : cfg.lon,
        tz: rta.tz || cfg.tz,
      });
      flash(`Sugerencia por IP: ${rta.city}, ${rta.pais} (${rta.lat.toFixed(3)}, ${rta.lon.toFixed(3)}) — revisá y guardá`, "ok");
    } catch (e) {
      flash("No se pudo detectar: " + e + " — cargá lat/lon manual", "error");
    } finally {
      setDetectando(false);
    }
  };

  if (!cfg) return <div className="cargando">Cargando configuración…</div>;

  const upd = (patch: Partial<Config>) => setCfg({ ...cfg, ...patch });
  const updAudio = (patch: Partial<Config["audio"]>) => setCfg({ ...cfg, audio: { ...cfg.audio, ...patch } });

  const hoy = schedule?.date ?? "";
  const diaLabel = hoy
    ? `Hoy · ${Number(hoy.slice(8))} ${MESES[Number(hoy.slice(5, 7)) - 1]}`
    : "Hoy";

  return (
    <div className="App-root">
      <header>
        <img src={logo} className="logo" alt="" />
        <span className="dia">{diaLabel}</span>
        <div className="resumen-dia">
          <div className="barra-rezos">
            {PRAYERS.map((name) => {
              const slot = schedule?.prayers.find((p) => p.name === name);
              const proximo = schedule?.next === name;
              return (
                <span key={name} className={`rezo ${proximo ? "proximo" : ""}`}>
                  {name} {slot?.hhmm ?? ""}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? "activa" : ""} onClick={() => setTab(id)}>
            <Icon size={15} strokeWidth={2.2} />
            {label}
          </button>
        ))}
      </nav>

      <main>
        {tab === "ubicacion" && (
          <section>
            <h2>Ubicación
              <span className="desc">De acá salen las coordenadas para el cálculo — todo lo demás es local.</span>
            </h2>
            <label>Ciudad
              <input value={cfg.city} onChange={(e) => upd({ city: e.target.value })} />
            </label>
            <div className="fila">
              <label>Latitud
                <input type="number" step="0.001" value={cfg.lat} onChange={(e) => upd({ lat: +e.target.value })} />
              </label>
              <label>Longitud
                <input type="number" step="0.001" value={cfg.lon} onChange={(e) => upd({ lon: +e.target.value })} />
              </label>
            </div>
            <div className="lectura">
              <label>Zona horaria
                <input value={cfg.tz} disabled />
              </label>
              <span className="hint">del sistema</span>
            </div>
            {qibla != null && (
              <p className="nota">
                <Compass size={11} strokeWidth={2.2} style={{ verticalAlign: "-1px" }} />{" "}
                <b>Qibla:</b> {qibla.toFixed(1)}° desde el norte — referencia, no
                una brújula (no hay magnetómetro en la laptop).
              </p>
            )}
            <button className="test" disabled={detectando} onClick={detectarPorIP}>
              <LocateFixed size={14} strokeWidth={2.4} />
              {detectando ? "Detectando…" : "Detectar por IP (sugerencia)"}
            </button>
            <p className="nota">
              El cálculo es 100% local — la red se usa solo para sugerir la
              ubicación. Manual: clic derecho en Google Maps copiá los números;
              latitud con <code>−</code> al sur, longitud con <code>−</code> al oeste.
            </p>
            <p className="nota">
              El cálculo es 100% local — la red se usa solo para sugerir la
              ubicación. Manual: clic derecho en Google Maps copiá los números;
              latitud con <code>−</code> al sur, longitud con <code>−</code> al oeste.
            </p>
          </section>
        )}

        {tab === "calculo" && (
          <section>
            <h2>Cálculo
              <span className="desc">Método y criterio que alimentan el PrayTimes C del core.</span>
            </h2>
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
            <div className="offsets">
              <div className="grupo">
                <div className="grupo-tit">Offsets por rezo (minutos ±)</div>
                <div className="fila-5">
                  {PRAYERS.map((p) => (
                    <div className="campo" key={p}>
                      <label>{p}</label>
                      <input
                        type="number" step="1"
                        value={cfg.offsets[p.toLowerCase() as keyof Config["offsets"]] ?? 0}
                        onChange={(e) => upd({ offsets: { ...cfg.offsets, [p.toLowerCase()]: +e.target.value } })}
                      />
                      <span className="min">min</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "audio" && (
          <section>
            <h2>Audio
              <span className="desc">Adhan de muecín con volumen propio, separado del sistema.</span>
            </h2>
            <label>
              Volumen — {cfg.audio.volume}%
              <input type="range" min="0" max="100" value={cfg.audio.volume}
                onChange={(e) => updAudio({ volume: +e.target.value })} />
            </label>
            <div className="audio-por-rezo">
              <div className="grupo-tit">Adhan por rezo</div>
              <div className="audio-filas">
                {PRAYERS.map((p) => {
                  const key = p.toLowerCase();
                  const elegido = cfg.audio.muecinPorRezo?.[key] ?? "default";
                  const slot = schedule?.prayers.find((s) => s.name === p);
                  const deshabilitado = cfg.audio.enabled[key] === false;
                  return (
                    <div className={`audio-fila ${deshabilitado ? "off" : ""}`} key={p}>
                      <label className="check" title={deshabilitado ? `${p}: adhan silenciado` : `${p}: adhan activo`}>
                        <input type="checkbox" checked={cfg.audio.enabled[key] ?? true}
                          onChange={(e) => updAudio({ enabled: { ...cfg.audio.enabled, [key]: e.target.checked } })} />
                      </label>
                      <span className="audio-rezo">
                        {p}
                        {slot?.hhmm ? <span className="audio-hora">· {slot.hhmm}</span> : null}
                      </span>
                      <select className="audio-select" value={elegido} disabled={deshabilitado}
                        title={deshabilitado ? "silenciado — activá el checkbox" : "muecín que suena en " + p}
                        onChange={(e) => updAudio({ muecinPorRezo: { ...cfg.audio.muecinPorRezo, [key]: e.target.value } })}>
                        {(muecines.length ? muecines : ["default"]).map((m) => (
                          <option key={m} value={m}>{m === "default" ? "Por defecto (embebido)" : m}</option>
                        ))}
                      </select>
                      {!deshabilitado && (
                        <button className="mini-play" title={`Probar el muecín de ${p} (clic de nuevo detiene)`}
                          onClick={() => invoke("test_adhan", { muecin: elegido }).catch((e) => flash("test: " + e, "error"))}>
                          <Play size={13} strokeWidth={2.4} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="test" onClick={() => invoke("test_adhan", { muecin: null }).catch((e) => flash("test: " + e, "error"))}>
              <Play size={14} strokeWidth={2.4} />
              Probar adhan del próximo rezo (clic para reproducir / detener)
            </button>
            <p className="nota">
              Catálogo: muecines instalados con la app (colección Doha, dominio
              público — <code>CREDITS.md</code>) más los tuyos: pegá WAVs{" "}
              <code>mono 22.05&nbsp;kHz</code> en{" "}
              <code>~/.config/adhan-companion/muecines/</code> y reabrí esta
              pestaña para verlos. "Por defecto" es el respaldo embebido que
              suena cuando un rezo no tiene selección (o su archivo no aparece).
            </p>
          </section>
        )}

        {tab === "seguimiento" && (
          <section>
            <h2>Seguimiento
              <span className="desc">Marcá los rezos del día (pasados o hoy) — alimenta tu registro y las rachas de v1.2.</span>
            </h2>
            <Calendario schedule={schedule}
              onToggle={(date, prayer) => invoke("mark_prayed", { date, prayer }).catch((e) => flash("mark: " + e, "error"))} />
          </section>
        )}

        {tab === "agente" && (
          <section>
            <h2>Agente
              <span className="desc">El rol de esta app como agente local del nodo hardware — v1.1.</span>
            </h2>
            <label className="check">
              <input type="checkbox" checked={cfg.agent.mqtt}
                onChange={(e) => upd({ agent: { ...cfg.agent, mqtt: e.target.checked } })} />
              MQTT (agente del nodo — v1.1)
            </label>
            <label>
              Broker
              <input value={cfg.agent.broker} placeholder="casa.local:1883"
                onChange={(e) => upd({ agent: { ...cfg.agent, broker: e.target.value } })} />
            </label>
            <p className="nota">Push de schedule + onboarding del nodo entra con la v1.1.</p>
          </section>
        )}

        {tab === "avanzado" && (
          <section>
            <h2>Avanzado
              <span className="desc">Autostart, preaviso y la ruta real del config.</span>
            </h2>
            <AutostartBox />
            <label>
              Preaviso (min antes)
              <input type="number" value={cfg.notice.minutes_before}
                onChange={(e) => upd({ notice: { minutes_before: +e.target.value } })} />
            </label>
            <p className="nota">
              Config persistido en <code>~/.config/adhan-companion/config.json</code> —
              schema compatible con <code>casa/adhan/config</code> del nodo.
            </p>
          </section>
        )}
      </main>

      <footer>
        {pendiente && <span className="estado pendiente">Cambios sin guardar</span>}
        {!pendiente && status && (
          <span className={`estado ${status.kind}`}>
            {status.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {status.text}
          </span>
        )}
        <button className="guardar" disabled={!pendiente}
          title={pendiente ? "" : "No hay cambios para guardar"}
          onClick={save}>
          Guardar configuración
        </button>
      </footer>
    </div>
  );
}

/// Calendario mensual de seguimiento: grid del mes con indicador de completado,
/// navegación por meses y panel del día seleccionado (los 5 rezos en fila).
/// Marca/desmarca = toggle sobre el registro (último evento gana).
function Calendario({ schedule, onToggle }: {
  schedule: Schedule | null;
  onToggle: (date: string, prayer: string) => void;
}) {
  const hoy = new Date();
  const [cursor, setCursor] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [marcados, setMarcados] = useState<Map<string, Set<string>>>(new Map());
  const [sel, setSel] = useState<string>(fmt(hoy));
  const [horas, setHoras] = useState<Record<string, string> | null>(null);

  const mes = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const mesHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const hoyStr = fmt(hoy);

  const refetch = useCallback(async () => {
    const days = await invoke<MarkedDay[]>("get_marked", { month: mes });
    const m = new Map<string, Set<string>>();
    for (const d of days) m.set(d.date, new Set(d.prayers));
    setMarcados(m);
  }, [mes]);

  useEffect(() => { refetch(); }, [refetch]);
  useEffect(() => {
    const un = listen("schedule_changed", () => refetch());
    return () => { un.then((f) => f()); };
  }, [refetch]);

  // horas del día seleccionado (hoy viene del schedule; pasado se calcula)
  useEffect(() => {
    if (sel === hoyStr) { setHoras(null); return; }
    let vivo = true;
    invoke<{ name: string; hhmm: string }[]>("get_schedule_for", { date: sel })
      .then((slots) => {
        if (vivo) setHoras(Object.fromEntries(slots.map((s) => [s.name, s.hhmm])));
      })
      .catch(() => vivo && setHoras(null));
    return () => { vivo = false; };
  }, [sel, hoyStr]);

  const toggle = (date: string, prayer: string) => {
    onToggle(date, prayer);
    // reflejo local inmediato (el IPC actualiza el registro en background)
    setMarcados((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(date) ?? []);
      if (set.has(prayer)) set.delete(prayer); else set.add(prayer);
      next.set(date, set);
      return next;
    });
  };

  const mover = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };

  const firstWeekday = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const celdas: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const marcadosDe = (fecha: string) => marcados.get(fecha) ?? new Set<string>();

  return (
    <>
      <div className="cal-nav">
        <button className="test" onClick={() => mover(-1)} aria-label="mes anterior">‹</button>
        <span className="cal-tit">
          {MESES[cursor.getMonth()]} {cursor.getFullYear()}
        </span>
        <button className="test" disabled={mes >= mesHoy} onClick={() => mover(1)} aria-label="mes siguiente">›</button>
        <button className="test" onClick={() => { setCursor(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); setSel(hoyStr); }}>Hoy</button>
      </div>

      <div className="cal-grid">
        {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span key={i} className="cal-dow">{d}</span>)}
        {celdas.map((dia, i) => {
          if (dia == null) return <span key={i} className="cal-cell vacio" />;
          const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
          const futuro = fecha > hoyStr;
          const n = marcadosDe(fecha).size;
          const nivel = n === 0 ? "" : n === 5 ? "full" : "parcial";
          return (
            <button
              key={i}
              className={`cal-cell ${nivel} ${fecha === sel ? "sel" : ""} ${fecha === hoyStr ? "hoy" : ""}`}
              disabled={futuro}
              onClick={() => setSel(fecha)}
              title={n === 5 ? "completo" : n > 0 ? `${n}/5` : "sin registrar"}
            >
              {dia}
            </button>
          );
        })}
      </div>

      <div className="cal-dia">
        <div className="cal-dia-tit">{fmtBonito(sel)}</div>
        <div className="seg-lista">
          {PRAYERS.map((name) => {
            const slot = sel === schedule?.date ? schedule.prayers.find((p) => p.name === name) : undefined;
            const marcado = marcadosDe(sel).has(name);
            const hora = slot?.hhmm ?? horas?.[name] ?? (sel === hoyStr ? "—" : "·");
            return (
              <button key={name} className={`seg-fila ${marcado ? "on" : ""}`} onClick={() => toggle(sel, name)}>
                <span className="seg-nombre">{name}</span>
                <span className="seg-hora">{hora}</span>
                <span className={`seg-check ${marcado ? "on" : ""}`}>{marcado && <Check size={13} strokeWidth={3} />}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="nota">
        Los días futuros están deshabilitados (no se puede rezar mañana). El historial queda en
        <code>registro.jsonl</code> append-only, último evento gana.
      </p>
    </>
  );
}

/// "YYYY-MM-DD" local (sin UTC — las fechas son del calendario de seguimiento)
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/// "YYYY-MM-DD" → "13 oct 2026" para el título del día seleccionado
function fmtBonito(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

/// Toggle de autostart (plugin tauri, habilitado por el usuario)
function AutostartBox() {
  const [on, setOn] = useState(false);
  const toggle = (v: boolean) => {
    setOn(v);
    invoke("set_autostart", { enabled: v }).catch((e) => {
      setOn(!v);
      console.error("autostart:", e);
    });
  };
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
      Iniciar sesión automáticamente
    </label>
  );
}
