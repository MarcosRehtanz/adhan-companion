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
  Home, Clock3, Settings, Pencil, BookOpen, Sun, Ellipsis, ChevronLeft, ChevronRight,
  Check, LocateFixed, CheckCircle2, AlertCircle, ListChecks, Compass,
  Flame, Trophy, CalendarCheck, type LucideIcon,
} from "lucide-react";
import type { Schedule, Stats } from "./types";
import { GoogleMapsLocationPicker } from "./components/GoogleMapsLocationPicker";
import { PrayerAlertsSettings, type AudioConfig } from "./components/PrayerAlertsSettings";
import { IslamicCalendar, type CalendarConfig } from "./components/IslamicCalendar";
import { MobileToday } from "./components/MobileToday";
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

// Escritorio: hoy, horarios, calendario, quran, registro, sistema.
// Celular: hoy, registro, quran y mas; desde «Más» se abren las subpantallas.
type Page = "quran" | "calendario" | "hoy" | "horarios" | "registro" | "sistema" | "mas" | "qibla" | "avisos" | "apariencia" | "actualizaciones" | "acerca";
type EditBlock = "apariencia" | "calendario" | "ubicacion" | "calculo" | "adhan" | null;
const PAGES: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "hoy", label: "Hoy", Icon: Home },
  { id: "horarios", label: "Horarios", Icon: Clock3 },
  { id: "calendario", label: "Calendario islámico", Icon: CalendarCheck },
  { id: "quran", label: "Qur’an", Icon: BookOpen },
  { id: "registro", label: "Registro", Icon: ListChecks },
];
const SYSTEM_PAGE: { id: Page; label: string; Icon: LucideIcon } = { id: "sistema", label: "Configuración", Icon: Settings };
const MOBILE_TABS: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "hoy", label: "Hoy", Icon: Sun },
  { id: "registro", label: "Registro", Icon: ListChecks },
  { id: "quran", label: "Qur’an", Icon: BookOpen },
  { id: "mas", label: "Más", Icon: Ellipsis },
];
const SUBPAGE_TITLES: Partial<Record<Page, string>> = {
  calendario: "Calendario islámico", qibla: "Qibla", horarios: "Ubicación y cálculo", avisos: "Adhan y avisos",
  apariencia: "Apariencia", actualizaciones: "Actualizaciones", acerca: "Acerca de",
};
const isSubpage = (page: Page) => page in SUBPAGE_TITLES;
/** Una página del celular en la ventana ancha de escritorio, y viceversa. */
const desktopPage = (page: Page): Page => page === "mas" || page === "avisos" || page === "apariencia" || page === "actualizaciones" || page === "acerca" ? "sistema" : page === "qibla" ? "hoy" : page;
const mobilePage = (page: Page): Page => page === "sistema" ? "mas" : page;

interface RuntimeInfo { platform: string; config_path: string; background_alerts: boolean; audio_preview: boolean; quran_audio: boolean }

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
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NARROW = "(max-width: 720px)";

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
  const [page, setPage] = useState<Page>("hoy");
  useEffect(() => { setPage(current => mobile ? mobilePage(current) : desktopPage(current)); }, [mobile]);
  // Las subpantallas de «Más» entran al historial: el botón atrás de Android vuelve a «Más».
  const mobileRef = useRef(mobile);
  mobileRef.current = mobile;
  useEffect(() => {
    const onPop = () => setPage(current => mobileRef.current && isSubpage(current) ? "mas" : current);
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
  const [scheduleLoading, setScheduleLoading] = useState(true);
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
    setScheduleError(""); setScheduleLoading(true);
    const id = ++resourceSequence.current.schedule;
    try { const value = await invoke<Schedule>("get_schedule"); if (id === resourceSequence.current.schedule) setSchedule(value); } catch (e) { if (id === resourceSequence.current.schedule) setScheduleError(String(e)); }
    finally { if (id === resourceSequence.current.schedule) setScheduleLoading(false); }
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
      resourceSequence.current.schedule++; setSchedule(ev.payload); setScheduleError(""); setScheduleLoading(false);
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
        return { ...actual, audio: snapshotEdicion.audio, notice: snapshotEdicion.notice };
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
  const back = () => { if (window.history.state?.sub) window.history.back(); else setPage("mas"); };

  const editingPage: Page | null = !editando ? null : editando === "ubicacion" || editando === "calculo" ? "horarios" : editando === "calendario" ? "calendario" : !mobile ? "sistema" : editando === "adhan" ? "avisos" : "apariencia";
  const calendar = cfg.calendar ?? { adjustment_days: 0 };
  const hoy = schedule?.date ?? "";
  const nextPrayer = scheduleError ? undefined : schedule?.next;
  const nextIsToday = nextPrayer?.date === hoy;
  const countdown = nextPrayer == null
    ? null
    : Math.max(0, nextPrayer.timestamp - Math.floor(Date.now() / 1000));
  const markedToday = new Set(schedule?.marked ?? []);
  const appearance = cfg.appearance ?? DEFAULT_APPEARANCE;

  const pageTitle = (mobile ? SUBPAGE_TITLES[page] ?? MOBILE_TABS.find(t => t.id === page)?.label : undefined) ?? [...PAGES, SYSTEM_PAGE].find((item) => item.id === page)?.label ?? "Hoy";

  // Bloques compartidos por la ventana de escritorio y las subpantallas del celular.
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
        <div className="editor-actions"><button className="secondary-button" onClick={() => { invoke("stop_alert").catch(() => {}); cancelarEdicion(); }}>Cancelar</button></div>
      </div> : <p>Preaviso: {cfg.notice.minutes_before === 0 ? "desactivado" : `${cfg.notice.minutes_before} min antes`}</p>}
    </section>
  </>;
  const apariencia = <AppearanceSettings disabled={!!editando && editando !== "apariencia"} value={appearance} editing={editando === "apariencia"} onEdit={() => iniciarEdicion("apariencia")} onCancel={cancelarEdicion} onChange={(appearance) => upd({ appearance })} />;
  const inicioSesion = !isAndroid && <section className="panel setting-panel"><div className="panel-heading"><div><h2>Inicio de sesión</h2><p>El tray se iniciará automáticamente al iniciar sesión.</p></div></div><AutostartSettings /></section>;
  const actualizaciones = isAndroid ? <AndroidUpdates /> : <DesktopUpdates />;
  const archivo = <section className="panel setting-panel"><div className="panel-heading"><div><h2>Archivo de configuración</h2><p>Preferencias locales de Adhan Companion.</p></div></div><div className="read-grid"><div><span>Ubicación</span><b><code>{runtime?.config_path ?? "Consultando ubicación…"}</code></b></div><div><span>Compatibilidad</span><b>Schema del nodo</b></div></div></section>;
  const calendario = scheduleError ? <ResourceError message={scheduleError} onRetry={loadSchedule} /> : hoy ? <IslamicCalendar disabled={!!editando && editando !== "calendario"} today={hoy} config={calendar} editing={editando === "calendario"} onEdit={() => iniciarEdicion("calendario")} onCancel={cancelarEdicion} onChange={(calendar) => upd({ calendar })} /> : <p>Cargando fecha local…</p>;
  const quran = <QuranReader audioAvailable={runtime?.quran_audio ?? false} />;
  const quranTopbar = <><h1 className="visually-hidden">{pageTitle}</h1><div id="quran-topbar-slot" className="quran-topbar-slot" /></>;

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

  if (mobile) {
    const tab = isSubpage(page) ? "mas" : page;
    const opciones: { id: Page; label: string; value: string }[][] = [[
      { id: "calendario", label: "Calendario islámico", value: hoy ? hijriLabel(hoy, calendar.adjustment_days) : "Cargando fecha…" },
      { id: "qibla", label: "Qibla", value: qibla == null ? "Calculando…" : `${Math.round(qibla)}° desde el norte` },
      { id: "horarios", label: "Ubicación y cálculo", value: `${cfg.city || "Sin ubicación"}, método ${cfg.method}, Asr ${cfg.madhab}` },
      { id: "avisos", label: "Adhan y avisos", value: cfg.notice.minutes_before === 0 ? "Sonido por rezo, sin preaviso" : `Sonido por rezo, preaviso de ${cfg.notice.minutes_before} min` },
    ], [
      { id: "apariencia", label: "Apariencia", value: `Tema ${themes[appearance.theme].toLowerCase()}, acento ${palettes[appearance.accent].name.toLowerCase()}` },
      { id: "actualizaciones", label: "Actualizaciones", value: `Versión ${verActual || "0.1.12"}` },
      { id: "acerca", label: "Acerca de", value: isAndroid ? "Archivo de configuración" : "Inicio de sesión y archivo de configuración" },
    ]];
    return (
      <div className={"App-root mobile" + (isAndroid ? " platform-android" : "")}>
        <div className="workspace">
          <header className={page === "quran" ? "topbar topbar-quran" : "topbar barra-app" + (isSubpage(page) ? " barra-sub" : "") + (page === "hoy" ? " barra-hoy" : "")}>
            {page === "quran" ? quranTopbar
              : page === "hoy" ? <><div className="encabezado-hoy"><h1 className="fecha-civil">{hoy ? fechaLarga(hoy) : "Hoy"}</h1>{hoy && <p className="fecha-hijri">{hijriLabel(hoy, calendar.adjustment_days)}</p>}</div><span className="ciudad">{cfg.city}</span></>
              : isSubpage(page) ? <><button className="boton-volver" aria-label="Volver a Más" disabled={saving} onClick={back}><ChevronLeft size={26} /></button><h1>{pageTitle}</h1></>
              : <h1>{pageTitle}</h1>}
          </header>
          <main className={"page-content" + (page === "quran" ? " page-quran" : "") + (page === "mas" ? " page-lista" : "")} id="main-content"><fieldset className="page-fields" disabled={saving}>
            {page === "quran" && quran}
            {page === "hoy" && <MobileToday schedule={schedule} scheduleError={scheduleError} onRetry={loadSchedule} qibla={qibla} qiblaError={qiblaError} android={isAndroid} onOpen={go} onMarked={() => { void loadSchedule(); void loadStats(); }} />}
            {page === "registro" && <div className="page-stack">
              {statsError ? <ResourceError message={statsError} onRetry={loadStats} /> : !stats ? <p role="status">Consultando estadísticas…</p> : <div className="racha">
                <p className="racha-numero"><b>{stats.racha_actual}</b> {stats.racha_actual === 1 ? "día seguido" : "días seguidos"}</p>
                <p className="racha-detalle">Mejor racha: {stats.mejor_racha} {stats.mejor_racha === 1 ? "día" : "días"}. En total, {stats.dias_completos} días completos y {stats.rezos_marcados} rezos marcados.</p>
              </div>}
              <section className="panel"><PrayerRegister schedule={schedule} /></section>
            </div>}
            {page === "mas" && opciones.map((grupo, i) => <div key={i}>
              <h2 className="grupo-opciones">{i === 0 ? "Rezo" : "Aplicación"}</h2>
              <ul className="lista-opciones">{grupo.map(o => <li key={o.id}><button onClick={() => go(o.id)}><span className="fila-texto"><b>{o.label}</b><span>{o.value}</span></span><ChevronRight size={20} className="chevron" /></button></li>)}</ul>
            </div>)}
            {page === "calendario" && calendario}
            {page === "qibla" && <section className="qibla-detalle">
              {qiblaError ? <div role="alert"><p>No se pudo calcular la orientación: {qiblaError}</p><button className="secondary-button" onClick={() => void loadQibla()}>Reintentar</button></div>
                : qibla == null ? <p role="status">Calculando…</p>
                : <><svg className="qibla-rosa" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" /><text x="50" y="20" textAnchor="middle">N</text><path transform={`rotate(${qibla} 50 50)`} d="M50 16 L58 54 L50 47 L42 54 Z" /></svg><p className="qibla-grados">{Math.round(qibla)}°</p><p>Desde el norte geográfico, hacia el {cardinal(qibla)}.</p><p className="nota">Con una brújula, girá hasta ese rumbo. Desde {cfg.city || "tu ubicación"}.</p></>}
            </section>}
            {page === "horarios" && <div className="page-stack">{ubicacionYCalculo}</div>}
            {page === "avisos" && <div className="page-stack">{avisos}</div>}
            {page === "apariencia" && <div className="page-stack">{apariencia}</div>}
            {page === "actualizaciones" && <div className="page-stack">{actualizaciones}</div>}
            {page === "acerca" && <div className="page-stack">{inicioSesion}{archivo}<p className="nota">Adhan Companion {verActual || "0.1.12"}{isAndroid ? " para Android" : ""}. Cálculo local con PrayTimes; textos del Qur’an de Tanzil y traducción de Raúl González Bórnez.</p></div>}
          </fieldset></main>
          <div id="quran-player-slot" />
          {footer}
          <nav className="barra-inferior" aria-label="Secciones">
            {MOBILE_TABS.map(({ id, label, Icon }) => <button key={id} aria-current={tab === id ? "page" : undefined} disabled={saving} onClick={() => go(id)}><span className="icono-tab"><Icon size={22} strokeWidth={1.9} /></span><span>{label}</span></button>)}
          </nav>
        </div>
      </div>
    );
  }

  return (
    <div className="App-root">
      <aside className="sidebar">
        <div className="brand"><img src={logo} className="logo" alt="" /><span>Adhan<br />Companion</span></div>
        <nav className="nav-main" aria-label="Navegación principal">
          {PAGES.map(({ id, label, Icon }) => (
            <button key={id} className={"nav-item " + (page === id ? "activa" : "")} aria-label={label} aria-current={page === id ? "page" : undefined} disabled={saving} onClick={() => setPage(id)}>
              <Icon size={17} strokeWidth={2} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          <button className={"nav-item " + (page === SYSTEM_PAGE.id ? "activa" : "")} aria-label={SYSTEM_PAGE.label} aria-current={page === SYSTEM_PAGE.id ? "page" : undefined} disabled={saving} onClick={() => setPage(SYSTEM_PAGE.id)}>
            <Settings size={17} strokeWidth={2} /><span>{SYSTEM_PAGE.label}</span>
          </button>
          <span className="sidebar-version">v{verActual || "0.1.12"}</span>
        </div>
      </aside>

      <div className="workspace">
        <header className={"topbar" + (page === "quran" ? " topbar-quran" : "")}>
          {/* En el Qur’an, la barra del lector ocupa el lugar del título (portal desde QuranReader). */}
          {page === "quran" ? quranTopbar : <>
            <div><span className="eyebrow">Adhan Companion</span><h1>{pageTitle}</h1></div>
            <div className="topbar-meta">
              {page === "hoy" && <span className="today-date">{hoy ? fmtBonito(hoy) : "Cargando horarios…"}</span>}
            </div>
          </>}
        </header>

        <main className={"page-content" + (page === "quran" ? " page-quran" : "")} id="main-content"><fieldset className="page-fields" disabled={saving}>
          {page === "quran" && quran}
          {page === "calendario" && calendario}
          {page === "hoy" && (
            <div className="page-stack">
              {scheduleError && <ResourceError message={scheduleError} onRetry={loadSchedule} />}
              {scheduleLoading && <p role="status">Actualizando horarios…</p>}
              {hoy && <div className="hijri-today"><div><b>{hijriLabel(hoy, calendar.adjustment_days)}</b><span>Tabular civil · medianoche · ajuste {calendar.adjustment_days > 0 ? "+" : ""}{calendar.adjustment_days} días</span></div><button className="link-button" onClick={() => setPage("calendario")}>Ver calendario</button></div>}
              <section className="hero-card">
                <div className="hero-kicker">PRÓXIMO REZO</div>
                <div className="hero-main">
                  <div><h2>{scheduleError ? "Horarios no disponibles" : !schedule ? "Consultando horarios…" : nextPrayer?.name ?? "Sin próximos rezos"}</h2><p>{nextPrayer ? `${nextIsToday ? "Hoy" : "Mañana"} a las ${nextPrayer.hhmm}` : scheduleError ? "Reintentá la consulta de horarios." : !schedule ? "Esperando los horarios del core." : "Revisá la ubicación y el método de cálculo."}</p></div>
                  <div className="countdown">{countdown == null ? "—" : formatoCuenta(countdown)}</div>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading"><div><h2>Horarios de hoy</h2><p>Según la ubicación configurada.</p></div><button className="link-button" onClick={() => setPage("horarios")}>Ver configuración</button></div>
                <div className="prayer-list">
                  {PRAYERS.map((name) => {
                    const slot = schedule?.prayers.find((p) => p.name === name);
                    const isNext = nextIsToday && nextPrayer?.name === name;
                    return <div className={"prayer-row " + (isNext ? "proximo" : "")} key={name}>
                      <span className="prayer-name">{name}</span>
                      <span className="prayer-time">{slot?.hhmm ?? "—"}</span>
                      <span className={"prayer-state " + (markedToday.has(name) ? "hecho" : "")}>{markedToday.has(name) ? "Realizado" : isNext ? "Siguiente" : ""}</span>
                    </div>;
                  })}
                </div>
                <div className="day-progress"><span>{markedToday.size} de 5 rezos registrados</span><div className="progreso-bar"><div className="progreso-fill" style={{ width: Math.min(markedToday.size, 5) * 20 + "%" }} /></div><button className="link-button" onClick={() => setPage("registro")}>Abrir registro</button></div>
              </section>
              <section className="qibla-card"><Compass size={19} /><div><b>Qibla</b><span>{qiblaError ? "No se pudo calcular la orientación." : qibla == null ? "Calculando…" : qibla.toFixed(1) + "° desde el norte"}</span>{qiblaError && <button className="link-button" onClick={() => void loadQibla()}>Reintentar</button>}</div><small>Referencia de orientación; no es una brújula.</small></section>
            </div>
          )}

          {page === "horarios" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Ubicación y cálculo</h2><p>Estos valores determinan los horarios de rezo.</p></div>
              {ubicacionYCalculo}
            </div>
          )}

          {page === "registro" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Registro</h2><p>Historial, rezos marcados y rachas.</p></div>
              {statsLoading && stats && <p role="status">Actualizando estadísticas…</p>}
              {statsError ? <ResourceError message={statsError} onRetry={loadStats} /> : !stats ? <p role="status">Consultando estadísticas…</p> : (
                <div className="stats">
                  <div className="stat-card" title="días consecutivos con los 5 rezos marcados"><Flame size={16} strokeWidth={2.2} /><b>{stats.racha_actual}</b><span>{stats.activa_hoy ? "días — en curso" : "días — la última"}</span></div>
                  <div className="stat-card" title="tu mejor racha histórica"><Trophy size={16} strokeWidth={2.2} /><b>{stats.mejor_racha}</b><span>mejor racha</span></div>
                  <div className="stat-card" title="días completos en todo el historial"><CalendarCheck size={16} strokeWidth={2.2} /><b>{stats.dias_completos}</b><span>días completos</span></div>
                  <div className="stat-card" title="rezos marcados en estado final"><Check size={16} strokeWidth={2.6} /><b>{stats.rezos_marcados}</b><span>rezos marcados</span></div>
                </div>
              )}
              <section className="panel"><PrayerRegister schedule={schedule} /></section>
            </div>
          )}

          {page === "sistema" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Configuración</h2><p>Sonidos, avisos, apariencia, inicio de sesión y mantenimiento de la aplicación.</p></div>
              {avisos}
              {apariencia}
              {inicioSesion}
              {actualizaciones}
              {archivo}
            </div>
          )}
        </fieldset></main>
        <div id="quran-player-slot" />
        {footer}
      </div>
    </div>
  );
}

/// "YYYY-MM-DD" → "13 oct 2026" para el título del día seleccionado
function fmtBonito(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

/// "YYYY-MM-DD" → "Miércoles 21 de octubre" para el encabezado del celular
function fechaLarga(iso: string): string {
  const texto = new Date(`${iso}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatoCuenta(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}


function ResourceError({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return <section className="panel" role="alert"><p>No se pudo consultar la información: {message}</p><button className="secondary-button" onClick={() => void onRetry()}>Reintentar</button></section>;
}
