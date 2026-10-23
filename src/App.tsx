import { PrayerRegister } from "./components/PrayerRegister";
import { DesktopUpdates } from "./components/DesktopUpdates";
import { AutostartSettings } from "./components/AutostartSettings";
import { AndroidUpdates } from "./components/AndroidUpdates";
import { AndroidAlerts } from "./components/AndroidAlerts";
// Ventana de configuración + dashboard del día (Adhan Companion)
// Contratos IPC: get_config/set_config (Config), get_schedule (Schedule),
// schedule_changed (evento), test_adhan, test_notification, set_autostart, mark_prayed.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Settings, Pencil, BookOpen, Sun, Ellipsis, ChevronLeft, ChevronRight,
  LocateFixed, CheckCircle2, AlertCircle, ListChecks, CalendarCheck, type LucideIcon,
} from "lucide-react";
import type { Schedule, Stats } from "./types";
import { GoogleMapsLocationPicker } from "./components/GoogleMapsLocationPicker";
import { PrayerAlertsSettings, type AudioConfig } from "./components/PrayerAlertsSettings";
import { IslamicCalendar, type CalendarConfig } from "./components/IslamicCalendar";
import { Today } from "./components/Today";
import { PauseAlerts, enPausa, fechaVuelta } from "./components/PauseAlerts";
import { GuiaRezo } from "./components/GuiaRezo";
import type { Rezo } from "./lib/guia";
import { GoogleSync } from "./components/GoogleSync";
import { hijriLabel } from "./lib/hijri";
import { cardinal } from "./lib/prayers";
import { AppearanceSettings, useAppearance, DEFAULT_APPEARANCE, themes, palettes, type Appearance } from "./components/AppearanceSettings";
import QuranReader from "./components/QuranReader";
import logo from "./assets/logo.png";
import "./App.css";

const METHOD_OPTIONS = ["MWL", "ISNA", "Egypt", "Makkah", "Karachi", "Tehran", "Jafari", "Custom"];
const MADHAB_OPTIONS = ["Shafi", "Hanafi"];
const HIGH_LAT_OPTIONS = ["None", "MiddleOfNight", "AngleBased", "AqrabAlAyyam", "AqrabAlBilad", "OneSeventh", "FixedAngle"];
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

// Las mismas páginas en el celular y en escritorio; cambia el marco de navegación.
// Celular (Android y ventanas de hasta 720 px): barra inferior con Hoy, Registro, Qur’an y Más.
// Escritorio: barra lateral con Hoy, Registro, Calendario islámico, Qur’an y Configuración.
type Page = "hoy" | "registro" | "quran" | "mas" | "calendario" | "qibla" | "horarios" | "avisos" | "apariencia" | "inicio" | "respaldo" | "actualizaciones" | "acerca" | "guia";
type EditBlock = "apariencia" | "calendario" | "ubicacion" | "calculo" | "adhan" | null;
const TABS: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "hoy", label: "Hoy", Icon: Sun },
  { id: "registro", label: "Registro", Icon: ListChecks },
  { id: "quran", label: "Qur’an", Icon: BookOpen },
  { id: "mas", label: "Más", Icon: Ellipsis },
];
const SIDEBAR: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "hoy", label: "Hoy", Icon: Sun },
  { id: "registro", label: "Registro", Icon: ListChecks },
  { id: "calendario", label: "Calendario islámico", Icon: CalendarCheck },
  { id: "quran", label: "Qur’an", Icon: BookOpen },
];
const SUBPAGE_TITLES: Partial<Record<Page, string>> = {
  calendario: "Calendario islámico", qibla: "Qibla", horarios: "Ubicación y cálculo", avisos: "Adhan y avisos",
  apariencia: "Apariencia", inicio: "Inicio de sesión", respaldo: "Respaldo y sincronización", guia: "Guía del rezo", actualizaciones: "Actualizaciones", acerca: "Acerca de",
};

interface RuntimeInfo { platform: string; config_path: string; background_alerts: boolean; audio_preview: boolean; quran_audio: boolean; google_sync: boolean }

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
  audio: AudioConfig;
  calendar: CalendarConfig;
  appearance: Appearance;
  notice: { minutes_before: number };
  agent: { mqtt: boolean; broker: string };
  follow_up: { reminder: boolean; minutes: number; paused_until?: string | null };
}

const NARROW = "(max-width: 720px)";
// La guía del rezo va en todas las compilaciones desde v0.1.16 (antes, solo en desarrollo).
const GUIA_REZO = true;

/// Ventana principal: dashboard diario y preferencias en modo lectura por defecto.
/// El estado vive en Rust (core) y se actualiza por IPC/eventos.
export default function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const isAndroid = runtime?.platform === "android";
  // En Android y en ventanas angostas, la interfaz de celular: barra inferior en lugar de barra lateral.
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const change = () => setNarrow(query.matches);
    query.addListener(change); // addEventListener("change") no existe en el WebView del J7.
    return () => query.removeListener(change);
  }, []);
  const mobile = isAndroid || narrow;
  // En escritorio el calendario está en la barra lateral; en el celular, dentro de Más.
  const isSubpage = (p: Page) => p in SUBPAGE_TITLES && !(p === "calendario" && !mobile);
  const [page, setPage] = useState<Page>("hoy");
  // Pedido de la tarjeta de Hoy: abrir la guía con ese rezo. Se descarta al salir de la guía.
  const [guiaPedido, setGuiaPedido] = useState<{ rezo: Rezo; n: number } | null>(null);
  useEffect(() => { if (page !== "guia") setGuiaPedido(null); }, [page]);
  // Las subpantallas de «Más» entran al historial: el botón atrás de Android vuelve a «Más».
  const mobileRef = useRef(mobile);
  mobileRef.current = mobile;
  useEffect(() => {
    const onPop = () => setPage(current => mobileRef.current && current in SUBPAGE_TITLES ? "mas" : current);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [editando, setEditando] = useState<EditBlock>(null);
  const [snapshotEdicion, setSnapshotEdicion] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [guardada, setGuardada] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const editGeneration = useRef(0);
  const ipController = useRef<AbortController | null>(null);
  const resourceSequence = useRef({ schedule: 0, qibla: 0, stats: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [qiblaError, setQiblaError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [, setTick] = useState(0);
  const [status, setStatus] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  // qibla del config actual (grados desde el norte — referencia)
  const [qibla, setQibla] = useState<number | null>(null);
  // rachas y stats del registro (v1.2 — refetch en cada movimiento del calendario)
  const [stats, setStats] = useState<Stats | null>(null);
  // actualizaciones (self-updater: GitHub Releases + AppImage)
  const [verActual, setVerActual] = useState<string>("");

  useAppearance(cfg?.appearance ?? DEFAULT_APPEARANCE);

  const loadSchedule = useCallback(async () => {
    setScheduleError("");
    const id = ++resourceSequence.current.schedule;
    try { const value = await invoke<Schedule>("get_schedule"); if (id === resourceSequence.current.schedule) setSchedule(value); } catch (e) { if (id === resourceSequence.current.schedule) setScheduleError(String(e)); }
  }, []);
  const loadQibla = useCallback(async () => {
    setQiblaError(""); setQibla(null);
    const id = ++resourceSequence.current.qibla;
    try { const value = await invoke<number>("get_qibla"); if (id === resourceSequence.current.qibla) setQibla(value); } catch (e) { if (id === resourceSequence.current.qibla) setQiblaError(String(e)); }
  }, []);
  const loadStats = useCallback(async () => {
    setStatsError(""); setStatsLoading(true);
    const id = ++resourceSequence.current.stats;
    try { const value = await invoke<Stats>("get_stats"); if (id === resourceSequence.current.stats) setStats(value); } catch (e) { if (id === resourceSequence.current.stats) setStatsError(String(e)); }
    finally { if (id === resourceSequence.current.stats) setStatsLoading(false); }
  }, []);

  useEffect(() => {
    invoke<RuntimeInfo>("runtime_info").then(async info => {
      setRuntime(info);
      const c = await invoke<Config>("get_config");
      setCfg(c); setGuardada(c);
    }).catch(error => setConfigError(String(error)));
    void loadSchedule();
    void loadQibla();
    void loadStats();
    invoke<string>("version_actual").then(setVerActual).catch(() => {});
    const un = listen<Schedule>("schedule_changed", (ev) => {
      resourceSequence.current.schedule++; setSchedule(ev.payload); setScheduleError("");
      void loadStats();
    });
    return () => { void un.then((f) => f()).catch(() => {}); };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pendiente = useMemo(
    () => !!cfg && !!guardada && JSON.stringify(cfg) !== JSON.stringify(guardada),
    [cfg, guardada],
  );

  const save = useCallback(async () => {
    if (!cfg || saveLock.current || !pendiente) return;
    saveLock.current = true; setSaving(true); setStatus(null);
    const submitted = cfg;
    try {
      const saved = await invoke<Config>("set_config", { cfg: submitted });
      setCfg(saved); setGuardada(saved); setEditando(null); setSnapshotEdicion(null);
      editGeneration.current++;
      void loadQibla(); void loadSchedule();
      setStatus({ text: "Cambios guardados.", kind: "ok" });
    } catch (e) {
      // Android puede persistir la configuración y fallar luego al sincronizar alarmas.
      // Volver a consultar evita fingir que el disco todavía tiene la versión anterior.
      try {
        const actual = await invoke<Config>("get_config");
        setGuardada(actual);
        if (JSON.stringify(actual) === JSON.stringify(submitted)) {
          setCfg(actual); setEditando(null); setSnapshotEdicion(null);
          setStatus({ text: `La configuración está guardada, pero una operación posterior falló: ${e}. Revisá el estado de los avisos.`, kind: "error" });
        } else setStatus({ text: `No se pudo guardar: ${e}. Se conserva la edición para reintentar.`, kind: "error" });
      } catch { setStatus({ text: `No se pudo confirmar el guardado: ${e}. Se conserva la edición; reintentá para consultar el estado.`, kind: "error" }); }
    } finally { saveLock.current = false; setSaving(false); }
  }, [cfg, pendiente, loadQibla, loadSchedule]);

  const flash = useCallback((text: string, kind: "ok" | "error") => setStatus({ text, kind }), []);

  // Tras una operación del sync (merge de rezos / adopción de config remota):
  // releer config, horarios, qibla y stats — una sola fuente: el core.
  const recargadoDeSync = useCallback(() => {
    invoke<Config>("get_config").then((c) => { setCfg(c); setGuardada(c); }).catch(() => {});
    void loadSchedule(); void loadQibla(); void loadStats();
  }, [loadSchedule, loadQibla, loadStats]);

  // Sugerencia de ubicación por IP (única pieza de red del spec)
  // Cadena de proveedores: si uno falla o no trae ciudad, se prueba el próximo.
  // Nota de precisión: la geolocalización de IP es a nivel subnet del ISP —
  // a veces devuelve el hub/nodo del proveedor (ej. Buenos Aires) en vez del
  // pueblo/ciudad. Es una *sugerencia*: la revisión manual es parte del diseño.
  const [detectando, setDetectando] = useState(false);
  const detectarPorIP = async () => {
    if (detectando || saveLock.current) return;
    const generation = editGeneration.current;
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
          if (generation !== editGeneration.current) return;
          const controller = new AbortController(); ipController.current = controller;
          const timer = window.setTimeout(() => controller.abort(), 10000);
          try {
            const res = await fetch(p.url, { signal: controller.signal });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const parsed = p.parse(await res.json());
            if (parsed && Number.isFinite(parsed.lat) && Math.abs(parsed.lat) <= 90 && Number.isFinite(parsed.lon) && Math.abs(parsed.lon) <= 180 && parsed.tz && parsed.tz !== "undefined") {
              new Intl.DateTimeFormat("es", { timeZone: parsed.tz }).format();
              rta = parsed; break;
            }
          } finally { window.clearTimeout(timer); }
        } catch (e) { ultimoError = e; }
      }
      if (generation !== editGeneration.current) return;
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
      if (generation !== editGeneration.current) return;
      flash("No se pudo detectar: " + e + " — cargá lat/lon manual", "error");
    } finally {
      if (generation === editGeneration.current) setDetectando(false);
    }
  };

  if (!cfg) return <div className="cargando">{configError ? <div role="alert"><p>No se pudo cargar la configuración.</p><pre style={{ whiteSpace: "pre-wrap" }}>{configError}</pre><button onClick={() => window.location.reload()}>Reintentar</button></div> : "Cargando configuración…"}</div>;

  const upd = (patch: Partial<Config>) => { if (!saveLock.current) setCfg(current => current ? { ...current, ...patch } : current); };
  const updAudio = (patch: Partial<Config["audio"]>) => { if (!saveLock.current) setCfg(current => current ? { ...current, audio: { ...current.audio, ...patch } } : current); };

  const iniciarEdicion = (block: Exclude<EditBlock, null>) => {
    if (editando || saveLock.current) return;
    editGeneration.current++;
    setStatus(null); setSnapshotEdicion(cfg); setEditando(block);
  };
  const cancelarEdicion = () => {
    if (saveLock.current) return;
    editGeneration.current++; ipController.current?.abort(); setDetectando(false); setStatus(null);
    if (snapshotEdicion && editando) {
      setCfg((actual) => {
        if (!actual) return actual;
        if (editando === "apariencia") return { ...actual, appearance: snapshotEdicion.appearance ?? DEFAULT_APPEARANCE };
        if (editando === "ubicacion") return { ...actual, city: snapshotEdicion.city, lat: snapshotEdicion.lat, lon: snapshotEdicion.lon, tz: snapshotEdicion.tz };
        if (editando === "calendario") return { ...actual, calendar: snapshotEdicion.calendar };
        if (editando === "calculo") return { ...actual, method: snapshotEdicion.method, madhab: snapshotEdicion.madhab, highLatRule: snapshotEdicion.highLatRule, offsets: snapshotEdicion.offsets };
        // La pausa no es parte del borrador: se conserva la vigente.
        return { ...actual, audio: snapshotEdicion.audio, notice: snapshotEdicion.notice, follow_up: { ...actual.follow_up, reminder: snapshotEdicion.follow_up.reminder, minutes: snapshotEdicion.follow_up.minutes } };
      });
    }
    setEditando(null);
    setSnapshotEdicion(null);
  };

  /** Navegación: en el celular, una subpantalla de «Más» se apila sobre el historial. */
  const go = (next: Page) => {
    if (mobile && isSubpage(next) && !isSubpage(page)) window.history.pushState({ sub: next }, "");
    if (mobile && !isSubpage(next) && isSubpage(page) && window.history.state?.sub) window.history.back();
    setPage(next);
  };
  const back = () => { if (mobile && window.history.state?.sub) window.history.back(); else setPage("mas"); };

  const editingPage: Page | null = !editando ? null : editando === "ubicacion" || editando === "calculo" ? "horarios" : editando === "calendario" ? "calendario" : editando === "adhan" ? "avisos" : "apariencia";
  const calendar = cfg.calendar ?? { adjustment_days: 0 };
  const hoy = schedule?.date ?? "";
  const appearance = cfg.appearance ?? DEFAULT_APPEARANCE;
  const masLabel = mobile ? "Más" : "Configuración";
  const section = isSubpage(page) ? "mas" : page;
  const pageTitle = page === "mas" ? masLabel : SUBPAGE_TITLES[page] ?? TABS.find(t => t.id === page)?.label ?? "Hoy";

  // Contenido de cada página, igual en el celular y en escritorio.
  const ubicacionYCalculo = <>
    <section className="panel setting-panel">
      <div className="panel-heading"><div><h2>Ubicación</h2><p>Ciudad y coordenadas usadas para calcular los horarios.</p></div>{editando !== "ubicacion" && <button disabled={!!editando || saving} className="edit-button" onClick={() => iniciarEdicion("ubicacion")}><Pencil size={14} />Editar ubicación</button>}</div>
      {editando === "ubicacion" ? <div className="editor">
        <label>Ciudad<input disabled={detectando} value={cfg.city} onChange={(e) => upd({ city: e.target.value })} /></label>
        <div className="fila"><label>Latitud<input disabled={detectando} type="number" min="-90" max="90" step="0.000001" value={cfg.lat} onChange={(e) => upd({ lat: +e.target.value })} /></label><label>Longitud<input disabled={detectando} type="number" min="-180" max="180" step="0.000001" value={cfg.lon} onChange={(e) => upd({ lon: +e.target.value })} /></label></div>
        <GoogleMapsLocationPicker current={{ lat: cfg.lat, lon: cfg.lon }} disabled={detectando} onUse={(point) => upd(point)} />
        <div className="read-grid"><div><span>Zona horaria de la ciudad</span><b>{cfg.tz}</b></div></div>
        <button className="test" disabled={detectando} onClick={detectarPorIP}><LocateFixed size={14} />{detectando ? "Detectando…" : "Sugerir ubicación por IP"}</button>
        <p className="nota">La detección es una sugerencia: revisá ciudad y coordenadas antes de guardar. Para este cálculo, la zona horaria del sistema debe coincidir con la ubicación.</p>
        <div className="editor-actions"><button className="secondary-button" onClick={cancelarEdicion}>Cancelar</button></div>
      </div> : <div className="read-grid"><div><span>Ciudad</span><b>{cfg.city || "Sin configurar"}</b></div><div><span>Coordenadas</span><b>{cfg.lat.toFixed(6)}, {cfg.lon.toFixed(6)}</b></div><div><span>Zona horaria guardada</span><b>{cfg.tz}</b></div><p className="nota read-note">El cálculo usa la zona horaria local del sistema. Asegurate de que coincida con esta ubicación.</p></div>}
    </section>
    <section className="panel setting-panel">
      <div className="panel-heading"><div><h2>Método de cálculo</h2><p>Método, escuela de Asr y ajustes manuales.</p></div>{editando !== "calculo" && <button disabled={!!editando || saving} className="edit-button" onClick={() => iniciarEdicion("calculo")}><Pencil size={14} />Editar método</button>}</div>
      {editando === "calculo" ? <div className="editor">
        <label>Método<select value={cfg.method} onChange={(e) => upd({ method: e.target.value })}>{METHOD_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Madhab para Asr<select value={cfg.madhab} onChange={(e) => upd({ madhab: e.target.value })}>{MADHAB_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <label>Regla de latitud alta<select value={cfg.highLatRule} onChange={(e) => upd({ highLatRule: e.target.value })}>{HIGH_LAT_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label>
        <div className="offsets"><div className="grupo"><div className="grupo-tit">Ajuste por rezo (minutos)</div><div className="fila-5">{PRAYERS.map((p) => { const key = p.toLowerCase() as keyof Config["offsets"]; return <div className="campo" key={p}><label>{p}</label><input type="number" step="1" value={cfg.offsets[key] ?? 0} onChange={(e) => upd({ offsets: { ...cfg.offsets, [key]: +e.target.value } })} /><span className="min">min</span></div>; })}</div></div></div>
        <div className="editor-actions"><button className="secondary-button" onClick={cancelarEdicion}>Cancelar</button></div>
      </div> : <div className="read-grid read-grid-four"><div><span>Método</span><b>{cfg.method}</b></div><div><span>Madhab para Asr</span><b>{cfg.madhab}</b></div><div><span>Latitud alta</span><b>{cfg.highLatRule}</b></div><div><span>Ajustes manuales</span><b>{PRAYERS.filter((p) => (cfg.offsets[p.toLowerCase() as keyof Config["offsets"]] ?? 0) !== 0).length ? PRAYERS.filter((p) => (cfg.offsets[p.toLowerCase() as keyof Config["offsets"]] ?? 0) !== 0).length + " rezos ajustados" : "Ninguno"}</b></div></div>}
    </section>
  </>;
  const avisos = <>
    {isAndroid && <AndroidAlerts />}
    <section className="panel setting-panel">
      <div className="panel-heading"><div><h2>Adhan y avisos</h2><p>{isAndroid ? "Elegí el sonido por rezo. Los avisos se programan en Android al guardar; activalos en este teléfono." : "Elegí cómo recibir cada rezo. Los avisos funcionan con la ventana cerrada."}</p></div>{editando !== "adhan" && <button disabled={!!editando || saving} className="edit-button" onClick={() => iniciarEdicion("adhan")}><Pencil size={14} />Editar sonido y avisos</button>}</div>
      <PrayerAlertsSettings previewAvailable={runtime?.audio_preview ?? false} audio={cfg.audio} editing={editando === "adhan"} onChange={updAudio} />
      {editando === "adhan" ? <div className="editor">
        <label>Preaviso antes del horario (minutos)<input type="number" min="0" max="120" value={cfg.notice.minutes_before} onChange={(e) => upd({ notice: { minutes_before: +e.target.value } })} /></label>
        <p className="nota">El preaviso es una notificación independiente. Usá 0 para desactivarlo. Guardar aplica todos los cambios.</p>
        <label className="fila-check"><input type="checkbox" checked={cfg.follow_up.reminder} onChange={(e) => upd({ follow_up: { ...cfg.follow_up, reminder: e.target.checked } })} />Recordarme si no marqué el rezo</label>
        <label>Cuánto después del horario (minutos)<input type="number" min="5" max="120" disabled={!cfg.follow_up.reminder} value={cfg.follow_up.minutes} onChange={(e) => upd({ follow_up: { ...cfg.follow_up, minutes: +e.target.value } })} /></label>
        <p className="nota">Un aviso suave, sin Adhan, si a esa hora el rezo sigue sin marcar. No llega tarde ni cuando ya empezó el rezo siguiente.</p>
        <div className="editor-actions"><button className="secondary-button" onClick={() => { invoke("stop_alert").catch(() => {}); cancelarEdicion(); }}>Cancelar</button></div>
      </div> : <>
        <p>Preaviso: {cfg.notice.minutes_before === 0 ? "desactivado" : `${cfg.notice.minutes_before} min antes`}</p>
        <p>Recordatorio: {cfg.follow_up.reminder ? `a los ${cfg.follow_up.minutes} min, si el rezo sigue sin marcar` : "desactivado"}</p>
      </>}
    </section>
    <PauseAlerts pausedUntil={cfg.follow_up.paused_until} today={hoy} disabled={!!editando || saving} onChanged={(saved) => { setCfg(saved as Config); setGuardada(saved as Config); void loadSchedule(); }} />
  </>;
  const calendario = scheduleError ? <ResourceError message={scheduleError} onRetry={loadSchedule} /> : hoy ? <IslamicCalendar disabled={!!editando && editando !== "calendario"} today={hoy} config={calendar} editing={editando === "calendario"} onEdit={() => iniciarEdicion("calendario")} onCancel={cancelarEdicion} onChange={(calendar) => upd({ calendar })} /> : <p>Cargando fecha local…</p>;
  const opciones: { id: Page; label: string; value: string }[][] = [[
    ...(GUIA_REZO ? [{ id: "guia" as Page, label: "Guía del rezo", value: "Aprender y repasar cada rezo, paso a paso" }] : []),
    ...(mobile ? [{ id: "calendario" as Page, label: "Calendario islámico", value: hoy ? hijriLabel(hoy, calendar.adjustment_days) : "Cargando fecha…" }] : []),
    { id: "qibla", label: "Qibla", value: qibla == null ? "Calculando…" : `${Math.round(qibla)}° desde el norte` },
    { id: "horarios", label: "Ubicación y cálculo", value: `${cfg.city || "Sin ubicación"}, método ${cfg.method}, Asr ${cfg.madhab}` },
    { id: "avisos", label: "Adhan y avisos", value: enPausa(cfg.follow_up.paused_until, hoy) ? `En pausa; vuelven el ${fechaVuelta(cfg.follow_up.paused_until!)}` : cfg.notice.minutes_before === 0 ? "Sonido por rezo, sin preaviso" : `Sonido por rezo, preaviso de ${cfg.notice.minutes_before} min` },
  ], [
    { id: "apariencia", label: "Apariencia", value: `Tema ${themes[appearance.theme].toLowerCase()}, acento ${palettes[appearance.accent].name.toLowerCase()}` },
    ...(!isAndroid ? [{ id: "inicio" as Page, label: "Inicio de sesión", value: "Abrir Adhan Companion en la bandeja al iniciar sesión" }] : []),
    // Solo builds con credencial OAuth; las publicadas por la CI todavía no la tienen.
    ...(runtime?.google_sync ? [{ id: "respaldo" as Page, label: "Respaldo y sincronización", value: "Configuración, rezos y lectura en tu cuenta de Google" }] : []),
    { id: "actualizaciones", label: "Actualizaciones", value: `Versión ${verActual || "0.1.16"}` },
    { id: "acerca", label: "Acerca de", value: "Archivo de configuración y fuentes" },
  ]];

  const content = <>
    {page === "quran" && <QuranReader audioAvailable={runtime?.quran_audio ?? false} />}
    {page === "hoy" && cfg && enPausa(cfg.follow_up.paused_until, hoy) && <div className="aviso-pausa" role="status"><p>Los avisos están en pausa. Vuelven el {fechaVuelta(cfg.follow_up.paused_until!)}.</p><button className="link-button" onClick={() => go("avisos")}>Ver la pausa</button></div>}
    {page === "hoy" && <Today schedule={schedule} scheduleError={scheduleError} onRetry={loadSchedule} qibla={qibla} qiblaError={qiblaError} android={isAndroid} onOpen={go} onMarked={() => { void loadSchedule(); void loadStats(); }}
      onGuia={GUIA_REZO ? prayer => { setGuiaPedido({ rezo: prayer.toLowerCase() as Rezo, n: Date.now() }); go("guia"); } : undefined} />}
    {page === "registro" && <div className="page-stack registro">
      {statsLoading && stats && <p role="status" className="nota">Actualizando estadísticas…</p>}
      {statsError ? <ResourceError message={statsError} onRetry={loadStats} /> : !stats ? <p role="status">Consultando estadísticas…</p> : <div className="racha">
        <p className="racha-numero"><b>{stats.racha_actual}</b> {stats.racha_actual === 1 ? "día seguido" : "días seguidos"}</p>
        <p className="racha-detalle">Mejor racha: {stats.mejor_racha} {stats.mejor_racha === 1 ? "día" : "días"}. En total, {stats.dias_completos} días completos y {stats.rezos_marcados} rezos marcados.</p>
      </div>}
      <section className="panel"><PrayerRegister schedule={schedule} /></section>
    </div>}
    {page === "mas" && <div className="opciones">{opciones.map((grupo, i) => <div key={i}>
      <h2 className="grupo-opciones">{i === 0 ? "Rezo" : "Aplicación"}</h2>
      <ul className="lista-opciones">{grupo.map(o => <li key={o.id}><button onClick={() => go(o.id)}><span className="fila-texto"><b>{o.label}</b><span>{o.value}</span></span><ChevronRight size={20} className="chevron" /></button></li>)}</ul>
    </div>)}</div>}
    {page === "calendario" && calendario}
    {page === "qibla" && <section className="qibla-detalle">
      {qiblaError ? <div role="alert"><p>No se pudo calcular la orientación: {qiblaError}</p><button className="secondary-button" onClick={() => void loadQibla()}>Reintentar</button></div>
        : qibla == null ? <p role="status">Calculando…</p>
        : <><svg className="qibla-rosa" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" /><text x="50" y="20" textAnchor="middle">N</text><path transform={`rotate(${qibla} 50 50)`} d="M50 16 L58 54 L50 47 L42 54 Z" /></svg><p className="qibla-grados">{Math.round(qibla)}°</p><p>Desde el norte geográfico, hacia el {cardinal(qibla)}.</p><p className="nota">Con una brújula, girá hasta ese rumbo. Desde {cfg.city || "tu ubicación"}.</p></>}
    </section>}
    {page === "horarios" && <div className="page-stack">{ubicacionYCalculo}</div>}
    {page === "avisos" && <div className="page-stack">{avisos}</div>}
    {page === "apariencia" && <div className="page-stack"><AppearanceSettings disabled={!!editando && editando !== "apariencia"} value={appearance} editing={editando === "apariencia"} onEdit={() => iniciarEdicion("apariencia")} onCancel={cancelarEdicion} onChange={(appearance) => upd({ appearance })} /></div>}
    {page === "inicio" && <div className="page-stack"><section className="panel setting-panel"><div className="panel-heading"><div><h2>Inicio de sesión</h2><p>El tray se iniciará automáticamente al iniciar sesión.</p></div></div><AutostartSettings /></section></div>}
    {page === "guia" && GUIA_REZO && <div className="page-stack"><GuiaRezo key={guiaPedido?.n ?? 0} rezoInicial={guiaPedido?.rezo} escuelaInicial={cfg?.method === "Jafari" || cfg?.method === "Tehran" ? "jafari" : cfg?.madhab === "Hanafi" ? "hanafi" : "shafii"} schedule={schedule} scheduleError={scheduleError} android={isAndroid} onMarked={() => { void loadSchedule(); void loadStats(); }} /></div>}
    {page === "respaldo" && runtime?.google_sync && <div className="page-stack"><GoogleSync recargado={recargadoDeSync} /></div>}
    {page === "actualizaciones" && <div className="page-stack">{isAndroid ? <AndroidUpdates /> : <DesktopUpdates />}</div>}
    {page === "acerca" && <div className="page-stack">
      <section className="panel setting-panel"><div className="panel-heading"><div><h2>Archivo de configuración</h2><p>Preferencias locales de Adhan Companion.</p></div></div><div className="read-grid"><div><span>Ubicación</span><b><code>{runtime?.config_path ?? "Consultando ubicación…"}</code></b></div><div><span>Compatibilidad</span><b>Schema del nodo</b></div></div></section>
      <p className="nota">Adhan Companion {verActual || "0.1.16"}{isAndroid ? " para Android" : ""}. Cálculo local con PrayTimes; textos del Qur’an de Tanzil y traducción de Raúl González Bórnez.</p>
    </div>}
  </>;

  const header = <header className={page === "quran" ? "topbar topbar-quran" : "topbar barra-app" + (isSubpage(page) ? " barra-sub" : "") + (page === "hoy" ? " barra-hoy" : "")}>
    {/* En el Qur’an, la barra del lector ocupa el lugar del título (portal desde QuranReader). */}
    {page === "quran" ? <><h1 className="visually-hidden">{pageTitle}</h1><div id="quran-topbar-slot" className="quran-topbar-slot" /></>
      : page === "hoy" ? <><div className="encabezado-hoy"><h1 className="fecha-civil">{hoy ? fechaLarga(hoy) : "Hoy"}</h1>{hoy && <p className="fecha-hijri">{hijriLabel(hoy, calendar.adjustment_days)}</p>}</div><span className="ciudad">{cfg.city}</span></>
      : isSubpage(page) ? <><button className="boton-volver" aria-label={`Volver a ${masLabel}`} disabled={saving} onClick={back}><ChevronLeft size={26} /></button><h1>{pageTitle}</h1></>
      : <h1>{pageTitle}</h1>}
  </header>;

  const footer = (pendiente || status || editando) && <footer>
    {pendiente && <span className="estado pendiente">Cambios sin guardar</span>}
    {status && (
      <span className={`estado ${status.kind}`}>
        {status.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
        {status.text}
      </span>
    )}
    {editingPage && editingPage !== page && <button className="secondary-button" disabled={saving} onClick={() => go(editingPage)}>Volver a la edición</button>}
    {editando && <><span className="estado">{saving ? "Guardando cambios…" : pendiente ? "Edición con cambios pendientes" : "Edición sin cambios"}</span><button className="secondary-button" disabled={saving} onClick={cancelarEdicion}>Cancelar edición</button></>}
    {pendiente && <button className="guardar" disabled={saving || detectando} onClick={save}>{saving ? "Guardando…" : "Guardar cambios"}</button>}
    {status && !saving && <button className="secondary-button" aria-label="Cerrar mensaje" onClick={() => setStatus(null)}>Cerrar</button>}
  </footer>;

  const main = <main className={"page-content" + (page === "quran" ? " page-quran" : "") + (page === "mas" ? " page-lista" : "")} id="main-content"><fieldset className="page-fields" disabled={saving}>{content}</fieldset></main>;

  return (
    <div className={"App-root" + (mobile ? " mobile" : "") + (isAndroid ? " platform-android" : "")}>
      {!mobile && <aside className="sidebar">
        <div className="brand"><img src={logo} className="logo" alt="" /><span>Adhan<br />Companion</span></div>
        <nav className="nav-main" aria-label="Navegación principal">
          {SIDEBAR.map(({ id, label, Icon }) => (
            <button key={id} className={"nav-item " + (section === id ? "activa" : "")} aria-label={label} aria-current={section === id ? "page" : undefined} disabled={saving} onClick={() => go(id)}>
              <Icon size={17} strokeWidth={2} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          <button className={"nav-item " + (section === "mas" ? "activa" : "")} aria-label="Configuración" aria-current={section === "mas" ? "page" : undefined} disabled={saving} onClick={() => go("mas")}>
            <Settings size={17} strokeWidth={2} /><span>Configuración</span>
          </button>
          <span className="sidebar-version">v{verActual || "0.1.16"}</span>
        </div>
      </aside>}
      <div className="workspace">
        {header}
        {main}
        <div id="quran-player-slot" />
        {footer}
        {mobile && <nav className="barra-inferior" aria-label="Secciones">
          {TABS.map(({ id, label, Icon }) => <button key={id} aria-current={section === id ? "page" : undefined} disabled={saving} onClick={() => go(id)}><span className="icono-tab"><Icon size={22} strokeWidth={1.9} /></span><span>{label}</span></button>)}
        </nav>}
      </div>
    </div>
  );
}

/// "YYYY-MM-DD" → "Miércoles 21 de octubre" para el encabezado del celular
function fechaLarga(iso: string): string {
  const texto = new Date(`${iso}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function ResourceError({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <section className="panel" role="alert"><p>No se pudo consultar la información: {message}</p><button className="secondary-button" onClick={() => void onRetry()}>Reintentar</button></section>;
}
