// Ventana de configuración + dashboard del día (Adhan Companion)
// Contratos IPC: get_config/set_config (Config), get_schedule (Schedule),
// schedule_changed (evento), test_adhan, test_notification, set_autostart, mark_prayed.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  Home, Clock3, Volume2, Settings, Play, Pencil, BookOpen, Menu, X,
  Check, LocateFixed, CheckCircle2, AlertCircle, ListChecks, Compass,
  Flame, Trophy, CalendarCheck, type LucideIcon,
} from "lucide-react";
import type { Schedule, MarkedDay, Stats, UpdateDisponible } from "./types";
import { GoogleMapsLocationPicker } from "./components/GoogleMapsLocationPicker";
import { PrayerAlertsSettings, type AudioConfig } from "./components/PrayerAlertsSettings";
import { IslamicCalendar, type CalendarConfig } from "./components/IslamicCalendar";
import { hijriLabel } from "./lib/hijri";
import { AppearanceSettings, useAppearance, DEFAULT_APPEARANCE, type Appearance } from "./components/AppearanceSettings";
import QuranReader from "./components/QuranReader";
import logo from "./assets/logo.png";
import "./App.css";

const METHOD_OPTIONS = ["MWL", "ISNA", "Egypt", "Makkah", "Karachi", "Tehran", "Jafari", "Custom"];
const MADHAB_OPTIONS = ["Shafi", "Hanafi"];
const HIGH_LAT_OPTIONS = ["None", "MiddleOfNight", "AngleBased", "AqrabAlAyyam", "AqrabAlBilad", "OneSeventh", "FixedAngle"];
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

type Page = "quran" | "calendario" | "hoy" | "horarios" | "adhan" | "registro" | "sistema";
type EditBlock = "apariencia" | "calendario" | "ubicacion" | "calculo" | "adhan" | null;
const PAGES: { id: Page; label: string; Icon: LucideIcon }[] = [
  { id: "hoy", label: "Hoy", Icon: Home },
  { id: "horarios", label: "Horarios", Icon: Clock3 },
  { id: "adhan", label: "Adhan y avisos", Icon: Volume2 },
  { id: "calendario", label: "Calendario islámico", Icon: CalendarCheck },
  { id: "quran", label: "Qur’an", Icon: BookOpen },
  { id: "registro", label: "Registro", Icon: ListChecks },
];
const SYSTEM_PAGE: { id: Page; label: string; Icon: LucideIcon } = { id: "sistema", label: "Sistema", Icon: Settings };

interface RuntimeInfo { platform: string; config_path: string; background_alerts: boolean; audio_preview: boolean }

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

/// Ventana principal: dashboard diario y preferencias en modo lectura por defecto.
/// El estado vive en Rust (core) y se actualiza por IPC/eventos.
export default function App() {
  const menuDialog = useRef<HTMLDialogElement>(null);
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const isAndroid = runtime?.platform === "android";
  const [page, setPage] = useState<Page>("hoy");
  const [editando, setEditando] = useState<EditBlock>(null);
  const [snapshotEdicion, setSnapshotEdicion] = useState<Config | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [guardada, setGuardada] = useState<Config | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [, setTick] = useState(0);
  const [status, setStatus] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  // qibla del config actual (grados desde el norte — referencia)
  const [qibla, setQibla] = useState<number | null>(null);
  // rachas y stats del registro (v1.2 — refetch en cada movimiento del calendario)
  const [stats, setStats] = useState<Stats | null>(null);
  // actualizaciones (self-updater: GitHub Releases + AppImage)
  const [verActual, setVerActual] = useState<string>("");
  const [esAppImage, setEsAppImage] = useState(false);
  const [esWindows, setEsWindows] = useState(false);
  const [update, setUpdate] = useState<UpdateDisponible | null | undefined>(undefined); // undefined = sin chequear
  const [checando, setChecando] = useState(false);

  useAppearance(cfg?.appearance ?? DEFAULT_APPEARANCE);

  useEffect(() => {
    invoke<RuntimeInfo>("runtime_info").then(async info => {
      setRuntime(info);
      const c = await invoke<Config>("get_config");
      setCfg(c); setGuardada(c);
    }).catch(error => setConfigError(String(error)));
    invoke<Schedule>("get_schedule").then(setSchedule).catch(() => {});
    invoke<number>("get_qibla").then(setQibla).catch(() => {});
    invoke<Stats>("get_stats").then(setStats).catch(() => {});
    invoke<string>("version_actual").then(setVerActual).catch(() => {});
    invoke<boolean>("ejecutando_appimage").then(setEsAppImage).catch(() => {});
    invoke<boolean>("ejecutando_windows").then(setEsWindows).catch(() => {});
    const un = listen<Schedule>("schedule_changed", (ev) => {
      setSchedule(ev.payload);
      invoke<Stats>("get_stats").then(setStats).catch(() => {});
    });
    return () => { un.then((f) => f()); };
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
    if (!cfg) return;
    try {
      const saved = await invoke<Config>("set_config", { cfg });
      setCfg(saved);
      setGuardada(saved);
      setEditando(null);
      setSnapshotEdicion(null);
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

  // self-updater: chequeo manual (el arranque ya hace checker automático)
  const verificarUpdates = useCallback(async () => {
    setChecando(true);
    try {
      const r = await invoke<UpdateDisponible | null>("check_update");
      setUpdate(r);
      if (r) flash(`v${r.version} disponible`, "ok");
      else setStatus({ text: "Estás al día", kind: "ok" });
    } catch (e) {
      setStatus({ text: "chequeo falló: " + e, kind: "error" });
    }
    setChecando(false);
    setTimeout(() => setStatus(null), 3000);
  }, [flash]);

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

  if (!cfg) return <div className="cargando">{configError ? <div role="alert"><p>No se pudo cargar la configuración.</p><pre style={{ whiteSpace: "pre-wrap" }}>{configError}</pre><button onClick={() => window.location.reload()}>Reintentar</button></div> : "Cargando configuración…"}</div>;

  const upd = (patch: Partial<Config>) => setCfg({ ...cfg, ...patch });
  const updAudio = (patch: Partial<Config["audio"]>) => setCfg({ ...cfg, audio: { ...cfg.audio, ...patch } });

  const iniciarEdicion = (block: Exclude<EditBlock, null>) => {
    setSnapshotEdicion(cfg);
    setEditando(block);
  };
  const cancelarEdicion = () => {
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

  const calendar = cfg.calendar ?? { adjustment_days: 0 };
  const hoy = schedule?.date ?? "";
  const nextPrayer = schedule?.next;
  const nextIsToday = nextPrayer?.date === hoy;
  const countdown = nextPrayer == null
    ? null
    : Math.max(0, nextPrayer.timestamp - Math.floor(Date.now() / 1000));
  const markedToday = new Set(schedule?.marked ?? []);

  const pageTitle = [...PAGES, SYSTEM_PAGE].find((item) => item.id === page)?.label ?? "Hoy";

  return (
    <div className={"App-root" + (isAndroid ? " platform-android" : "")}>
      <dialog ref={menuDialog} className="mobile-navigation" aria-labelledby="mobile-menu-title" onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="mobile-menu-heading"><h2 id="mobile-menu-title">Adhan Companion</h2><button className="secondary-button" aria-label="Cerrar menú" onClick={() => menuDialog.current?.close()}><X size={22} /></button></div>
        <nav aria-label="Navegación móvil">
          {[...PAGES, SYSTEM_PAGE].map(({ id, label, Icon }) => <button key={id} className={"mobile-menu-item " + (page === id ? "activa" : "")} aria-current={page === id ? "page" : undefined} onClick={() => { setPage(id); menuDialog.current?.close(); }}><Icon size={21} /><span>{label}</span></button>)}
        </nav>
        <p className="nota">v{verActual || "0.1.8"}{isAndroid ? " · Android experimental" : ""}</p>
      </dialog>
      <aside className="sidebar">
        <div className="brand"><img src={logo} className="logo" alt="" /><span>Adhan<br />Companion</span></div>
        <nav className="nav-main" aria-label="Navegación principal">
          {PAGES.map(({ id, label, Icon }) => (
            <button key={id} className={"nav-item " + (page === id ? "activa" : "")} aria-label={label} aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>
              <Icon size={17} strokeWidth={2} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          <button className={"nav-item " + (page === SYSTEM_PAGE.id ? "activa" : "")} aria-label="Sistema" aria-current={page === SYSTEM_PAGE.id ? "page" : undefined} onClick={() => setPage(SYSTEM_PAGE.id)}>
            <Settings size={17} strokeWidth={2} /><span>Sistema</span>
          </button>
          <span className="sidebar-version">v{verActual || "0.1.8"}</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="secondary-button mobile-menu-toggle" aria-label="Abrir menú de navegación" aria-haspopup="dialog" onClick={() => menuDialog.current?.showModal()}><Menu size={24} /></button>
          <div><span className="eyebrow">Adhan Companion</span><h1>{pageTitle}</h1></div>
          <div className="topbar-meta">
            {page === "hoy" && <span className="today-date">{hoy ? fmtBonito(hoy) : "Cargando horarios…"}</span>}
          </div>
        </header>

        <main className="page-content" id="main-content">
          {isAndroid && <aside className="experimental-notice" role="note"><strong>Android experimental</strong><span>Podés consultar horarios, registrar rezos y leer el Qur’an. Los avisos automáticos y el audio todavía no están disponibles.</span></aside>}
          {page === "quran" && <QuranReader />}
          {page === "calendario" && (hoy ? <IslamicCalendar today={hoy} config={calendar} editing={editando === "calendario"} onEdit={() => iniciarEdicion("calendario")} onCancel={cancelarEdicion} onChange={(calendar) => upd({ calendar })} /> : <p>Cargando fecha local…</p>)}
          {page === "hoy" && (
            <div className="page-stack">
              {hoy && <div className="hijri-today"><div><b>{hijriLabel(hoy, calendar.adjustment_days)}</b><span>Tabular civil · medianoche · ajuste {calendar.adjustment_days > 0 ? "+" : ""}{calendar.adjustment_days} días</span></div><button className="link-button" onClick={() => setPage("calendario")}>Ver calendario</button></div>}
              <section className="hero-card">
                <div className="hero-kicker">PRÓXIMO REZO</div>
                <div className="hero-main">
                  <div><h2>{nextPrayer?.name ?? "Sin próximos rezos"}</h2><p>{nextPrayer ? `${nextIsToday ? "Hoy" : "Mañana"} a las ${nextPrayer.hhmm}` : "Se actualizará con el próximo horario"}</p></div>
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
              <section className="qibla-card"><Compass size={19} /><div><b>Qibla</b><span>{qibla == null ? "Calculando…" : qibla.toFixed(1) + "° desde el norte"}</span></div><small>Referencia de orientación; no es una brújula.</small></section>
            </div>
          )}

          {page === "horarios" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Ubicación y cálculo</h2><p>Estos valores determinan los horarios de rezo.</p></div>
              <section className="panel setting-panel">
                <div className="panel-heading"><div><h2>Ubicación</h2><p>Ciudad y coordenadas usadas para calcular los horarios.</p></div>{editando !== "ubicacion" && <button className="edit-button" onClick={() => iniciarEdicion("ubicacion")}><Pencil size={14} />Editar ubicación</button>}</div>
                {editando === "ubicacion" ? <div className="editor">
                  <label>Ciudad<input value={cfg.city} onChange={(e) => upd({ city: e.target.value })} /></label>
                  <div className="fila"><label>Latitud<input type="number" min="-90" max="90" step="0.000001" value={cfg.lat} onChange={(e) => upd({ lat: +e.target.value })} /></label><label>Longitud<input type="number" min="-180" max="180" step="0.000001" value={cfg.lon} onChange={(e) => upd({ lon: +e.target.value })} /></label></div>
                  <GoogleMapsLocationPicker current={{ lat: cfg.lat, lon: cfg.lon }} disabled={detectando} onUse={(point) => upd(point)} />
                  <div className="read-grid"><div><span>Zona horaria de la ciudad</span><b>{cfg.tz}</b></div></div>
                  <button className="test" disabled={detectando} onClick={detectarPorIP}><LocateFixed size={14} />{detectando ? "Detectando…" : "Sugerir ubicación por IP"}</button>
                  <p className="nota">La detección es una sugerencia: revisá ciudad y coordenadas antes de guardar. Para este cálculo, la zona horaria del sistema debe coincidir con la ubicación.</p>
                  <div className="editor-actions"><button className="secondary-button" disabled={detectando} onClick={cancelarEdicion}>Cancelar</button></div>
                </div> : <div className="read-grid"><div><span>Ciudad</span><b>{cfg.city || "Sin configurar"}</b></div><div><span>Coordenadas</span><b>{cfg.lat.toFixed(6)}, {cfg.lon.toFixed(6)}</b></div><div><span>Zona horaria guardada</span><b>{cfg.tz}</b></div><p className="nota read-note">El cálculo usa la zona horaria local del sistema. Asegurate de que coincida con esta ubicación.</p></div>}
              </section>

              <section className="panel setting-panel">
                <div className="panel-heading"><div><h2>Método de cálculo</h2><p>Método, escuela de Asr y ajustes manuales.</p></div>{editando !== "calculo" && <button className="edit-button" onClick={() => iniciarEdicion("calculo")}><Pencil size={14} />Editar método</button>}</div>
                {editando === "calculo" ? <div className="editor">
                  <label>Método<select value={cfg.method} onChange={(e) => upd({ method: e.target.value })}>{METHOD_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  <label>Madhab para Asr<select value={cfg.madhab} onChange={(e) => upd({ madhab: e.target.value })}>{MADHAB_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  <label>Regla de latitud alta<select value={cfg.highLatRule} onChange={(e) => upd({ highLatRule: e.target.value })}>{HIGH_LAT_OPTIONS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  <div className="offsets"><div className="grupo"><div className="grupo-tit">Ajuste por rezo (minutos)</div><div className="fila-5">{PRAYERS.map((p) => { const key = p.toLowerCase() as keyof Config["offsets"]; return <div className="campo" key={p}><label>{p}</label><input type="number" step="1" value={cfg.offsets[key] ?? 0} onChange={(e) => upd({ offsets: { ...cfg.offsets, [key]: +e.target.value } })} /><span className="min">min</span></div>; })}</div></div></div>
                  <div className="editor-actions"><button className="secondary-button" onClick={cancelarEdicion}>Cancelar</button></div>
                </div> : <div className="read-grid read-grid-four"><div><span>Método</span><b>{cfg.method}</b></div><div><span>Madhab para Asr</span><b>{cfg.madhab}</b></div><div><span>Latitud alta</span><b>{cfg.highLatRule}</b></div><div><span>Ajustes manuales</span><b>{PRAYERS.filter((p) => (cfg.offsets[p.toLowerCase() as keyof Config["offsets"]] ?? 0) !== 0).length ? PRAYERS.filter((p) => (cfg.offsets[p.toLowerCase() as keyof Config["offsets"]] ?? 0) !== 0).length + " rezos ajustados" : "Ninguno"}</b></div></div>}
              </section>
            </div>
          )}

          {page === "adhan" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Adhan y avisos</h2><p>Preferencias de sonido y notificaciones para cada rezo.</p></div>
              <section className="panel setting-panel">
                <div className="panel-heading"><div><h2>Sonido y preaviso</h2><p>{isAndroid ? "Preferencias guardadas para una futura integración. En esta versión no se emiten avisos ni audio." : "Elegí cómo recibir cada rezo. Los avisos funcionan con la ventana cerrada."}</p></div>{editando !== "adhan" && <button className="edit-button" onClick={() => iniciarEdicion("adhan")}><Pencil size={14} />Editar sonido y avisos</button>}</div>
                <PrayerAlertsSettings previewAvailable={runtime?.audio_preview ?? false} audio={cfg.audio} editing={editando === "adhan"} onChange={updAudio} />
                {editando === "adhan" ? <div className="editor">
                  <label>Preaviso antes del horario (minutos)<input type="number" min="0" max="120" value={cfg.notice.minutes_before} onChange={(e) => upd({ notice: { minutes_before: +e.target.value } })} /></label>
                  <p className="nota">El preaviso es una notificación independiente. Usá 0 para desactivarlo. Guardar aplica todos los cambios.</p>
                  <div className="editor-actions"><button className="secondary-button" onClick={() => { invoke("stop_alert").catch(() => {}); cancelarEdicion(); }}>Cancelar</button></div>
                </div> : <p>Preaviso: {cfg.notice.minutes_before === 0 ? "desactivado" : `${cfg.notice.minutes_before} min antes`}</p>}
              </section>
            </div>
          )}

          {page === "registro" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Registro</h2><p>Historial, rezos marcados y rachas.</p></div>
              {stats && (
                <div className="stats">
                  <div className="stat-card" title="días consecutivos con los 5 rezos marcados"><Flame size={16} strokeWidth={2.2} /><b>{stats.racha_actual}</b><span>{stats.activa_hoy ? "días — en curso" : "días — la última"}</span></div>
                  <div className="stat-card" title="tu mejor racha histórica"><Trophy size={16} strokeWidth={2.2} /><b>{stats.mejor_racha}</b><span>mejor racha</span></div>
                  <div className="stat-card" title="días completos en todo el historial"><CalendarCheck size={16} strokeWidth={2.2} /><b>{stats.dias_completos}</b><span>días completos</span></div>
                  <div className="stat-card" title="rezos marcados en estado final"><Check size={16} strokeWidth={2.6} /><b>{stats.rezos_marcados}</b><span>rezos marcados</span></div>
                </div>
              )}
              <section className="panel"><Calendario schedule={schedule} onToggle={(date, prayer) => invoke("mark_prayed", { date, prayer }).catch((e) => flash("mark: " + e, "error"))} /></section>
            </div>
          )}

          {page === "sistema" && (
            <div className="page-stack">
              <div className="page-intro"><h2>Sistema</h2><p>{isAndroid ? "Apariencia y datos locales de la aplicación." : "Apariencia, inicio de sesión y mantenimiento de la aplicación."}</p></div>
              <AppearanceSettings value={cfg.appearance ?? DEFAULT_APPEARANCE} editing={editando === "apariencia"} onEdit={() => iniciarEdicion("apariencia")} onCancel={cancelarEdicion} onChange={(appearance) => upd({ appearance })} />
              {!isAndroid && <section className="panel setting-panel"><div className="panel-heading"><div><h2>Inicio de sesión</h2><p>El tray se iniciará automáticamente al iniciar sesión.</p></div></div><AutostartBox /></section>}
              {isAndroid ? <section className="panel setting-panel"><div className="panel-heading"><div><h2>Versión experimental</h2><p>v{verActual} · Las nuevas compilaciones se distribuyen como APK de prueba.</p></div></div><p>La instalación y las actualizaciones se realizan manualmente. Esta edición tiene datos separados de una futura versión estable.</p><button className="secondary-button" onClick={() => openUrl("https://github.com/MarcosRehtanz/adhan-companion/actions/workflows/android-experimental.yml").catch(error => flash(String(error), "error"))}>Ver compilaciones de Android</button></section> : <section className="panel setting-panel"><div className="panel-heading"><div><h2>Actualizaciones</h2><p>Versión instalada: {verActual ? "v" + verActual : "consultando…"}</p></div><button className="test" disabled={checando} onClick={verificarUpdates}>{checando ? "Verificando…" : "Buscar actualizaciones"}</button></div>
                {update === null && !checando && <p className="success-note">La aplicación está al día.</p>}
                {update && <div className="update-card"><b>v{update.version} disponible</b><p>{update.notas}</p>{update.appimage && esAppImage && <button className="test" onClick={() => invoke("instalar_update").catch((e) => flash("instalación: " + e, "error"))}><Play size={13} />Actualizar ahora</button>}{esWindows && <p className="nota">Descargá el instalador de Windows desde <a href={update.windows_installer || update.url} target="_blank" rel="noreferrer">GitHub Releases</a> y ejecutalo para actualizar.</p>}{!esWindows && !esAppImage && <p className="nota">Para actualizar la instalación <code>.deb</code>, descargá el release en <a href={update.url} target="_blank" rel="noreferrer">GitHub Releases</a> e instalalo con <code>dpkg -i</code>. La actualización automática está disponible con AppImage.</p>}{esAppImage && !update.appimage && <p className="nota">Este release no incluye una AppImage descargable.</p>}</div>}
              </section>}
              <section className="panel setting-panel"><div className="panel-heading"><div><h2>Archivo de configuración</h2><p>Preferencias locales de Adhan Companion.</p></div></div><div className="read-grid"><div><span>Ubicación</span><b><code>{runtime?.config_path ?? "Consultando ubicación…"}</code></b></div><div><span>Compatibilidad</span><b>Schema del nodo</b></div></div></section>
            </div>
          )}
        </main>

      {(pendiente || status || editando) && <footer>
        {pendiente && <span className="estado pendiente">Cambios sin guardar</span>}
        {status && (
          <span className={`estado ${status.kind}`}>
            {status.kind === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {status.text}
          </span>
        )}
        <button className="guardar" disabled={!pendiente}
          title={pendiente ? "" : "No hay cambios para guardar"}
          onClick={save}>
          Guardar cambios
        </button>
      </footer>}
      </div>
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
        Los días futuros están deshabilitados (no se puede rezar mañana). Tu historial se guarda localmente; podés corregir los días anteriores.
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

function formatoCuenta(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/// Estado de autoinicio en lectura; la acción actualiza el plugin inmediatamente.
function AutostartBox() {
  const [on, setOn] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    invoke<boolean>("get_autostart").then(setOn).catch((e) => console.error("autostart status:", e)).finally(() => setCargando(false));
  }, []);
  const toggle = () => {
    const v = !on;
    const anterior = on;
    setOn(v);
    setGuardando(true);
    invoke("set_autostart", { enabled: v }).catch((e) => {
      setOn(anterior);
      console.error("autostart:", e);
    }).finally(() => setGuardando(false));
  };
  return (
    <div className="system-state"><div><span>Iniciar sesión automáticamente</span><b>{cargando ? "Consultando estado…" : on ? "Activado" : "Desactivado"}</b></div><button className="edit-button" disabled={cargando || guardando} onClick={toggle}>{guardando ? "Aplicando…" : on ? "Desactivar" : "Activar"}</button></div>
  );
}
