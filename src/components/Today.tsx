import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, ChevronRight, Compass } from "lucide-react";
import type { PrayerSlot, Schedule } from "../types";
import { ARABIC_NAMES, PRAYER_NAMES, cardinal, hoursOf, prayerReached, remaining } from "../lib/prayers";

type AlertStatus = { enabled: boolean; exact: boolean; notifications: boolean; error: string };

/** Hoy, en el celular y en escritorio: el próximo rezo, el recorrido del sol y los rezos del día para marcar. */
export function Today({ schedule, scheduleError, onRetry, qibla, qiblaError, android, onOpen, onMarked }: {
  schedule: Schedule | null; scheduleError: string; onRetry: () => Promise<void>;
  qibla: number | null; qiblaError: string; android: boolean;
  onOpen: (page: "avisos" | "qibla" | "registro") => void; onMarked: () => void;
}) {
  const [alerts, setAlerts] = useState<AlertStatus | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  // El aviso aparece solo si falta algo; la consulta se repite al volver a la app.
  useEffect(() => {
    if (!android) return;
    const query = () => { invoke<AlertStatus>("android_alert_status", { action: "status" }).then(v => { if (mounted.current) setAlerts(v); }).catch(() => {}); };
    query();
    const onVisible = () => { if (!document.hidden) query(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [android]);

  const now = new Date();
  const next = scheduleError ? undefined : schedule?.next ?? undefined;
  const nextToday = !!next && next.date === schedule?.date;
  const marked = new Set(schedule?.marked ?? []);
  const notice = !alerts ? null : !alerts.enabled ? "Los avisos de rezo están apagados en este teléfono." : !alerts.notifications || !alerts.exact ? "Faltan permisos para que suenen los avisos." : alerts.error ? `No se pudieron programar los avisos: ${alerts.error}` : null;

  async function toggle(name: string) {
    if (lock.current || !schedule) return;
    lock.current = true; setPending(name); setError("");
    try { await invoke("mark_prayed", { date: schedule.date, prayer: name }); onMarked(); }
    catch (e) { if (mounted.current) setError(`No se pudo guardar: ${e}`); }
    finally { lock.current = false; if (mounted.current) setPending(null); }
  }

  return <div className="hoy">
    {notice && <div className="aviso-permisos" role="note"><p>{notice}</p><button className="link-button" onClick={() => onOpen("avisos")}>Revisar avisos</button></div>}

    <section className="proximo" aria-labelledby="proximo-nombre">
      {scheduleError ? <div role="alert"><p>No se pudieron calcular los horarios: {scheduleError}</p><button className="secondary-button" onClick={() => void onRetry()}>Reintentar</button></div>
        : !schedule ? <p role="status">Calculando los horarios…</p>
        : !next ? <p>No hay próximos rezos. Revisá la ubicación y el método de cálculo.</p>
        : <>
          <p className="proximo-rotulo">{nextToday ? "Próximo rezo" : "Próximo rezo, mañana"}</p>
          <div className="proximo-linea">
            <h2 id="proximo-nombre">{next.name} <span lang="ar" dir="rtl">{ARABIC_NAMES[next.name]}</span></h2>
            <p className="proximo-hora">{next.hhmm}</p>
          </div>
          <p className="proximo-falta">Faltan <b>{remaining(Math.max(0, next.timestamp - Math.floor(now.getTime() / 1000)))}</b></p>
          {schedule.sunrise != null && schedule.sunset != null && <SunPath prayers={schedule.prayers} sunrise={schedule.sunrise} sunset={schedule.sunset} now={hoursOf(now)} next={nextToday ? next.name : null} />}
        </>}
    </section>

    {schedule && !scheduleError && <section className="rezos-hoy" aria-labelledby="rezos-titulo">
      <div className="seccion-cabecera"><h2 id="rezos-titulo">Rezos de hoy</h2><span>{marked.size} de 5</span></div>
      <div className="progreso" aria-hidden="true"><span style={{ width: Math.min(marked.size, 5) * 20 + "%" }} /></div>
      <ul className="lista-rezos">{PRAYER_NAMES.map(name => {
        const slot = schedule.prayers.find(s => s.name === name);
        const done = marked.has(name), reached = prayerReached(schedule, schedule.date, name, now), isNext = nextToday && next?.name === name;
        const detail = pending === name ? "Guardando…" : done ? "Rezado" : isNext ? "Siguiente" : !reached ? "Todavía no" : "Sin marcar";
        return <li key={name}><button className={(isNext ? "siguiente" : "") + (!reached && !done ? " futuro" : "")} aria-pressed={done} disabled={!!pending || (!reached && !done)}
          aria-label={`${name}, ${slot?.hhmm ?? "sin horario"}: ${detail}`} onClick={() => void toggle(name)}>
          <span className="marca" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
          <span className="rezo-nombre"><b>{name}</b><small>{detail}</small></span>
          <span className="rezo-hora">{slot?.hhmm ?? "—"}</span>
        </button></li>;
      })}</ul>
      {error && <p role="alert" className="nota-lista">{error}</p>}
      <p className="nota-lista">Marcá cada rezo cuando lo hayas rezado; se habilita desde su horario. Los días anteriores se corrigen en <button className="link-button en-linea" onClick={() => onOpen("registro")}>Registro</button>.</p>
    </section>}

    <button className="fila-enlace" onClick={() => onOpen("qibla")}>
      <Compass size={28} className="icono-fila" />
      <span className="fila-texto"><b>Qibla</b><span>{qiblaError ? "No se pudo calcular la orientación." : qibla == null ? "Calculando…" : `${Math.round(qibla)}° desde el norte, hacia el ${cardinal(qibla)}`}</span></span>
      <ChevronRight size={20} className="chevron" />
    </button>
  </div>;
}

/**
 * Recorrido del sol del día. El horizonte separa el día de la noche: Fajr llega antes
 * de la salida del sol, Dhuhr cerca del punto más alto, Maghrib con la puesta e Isha de noche.
 */
function SunPath({ prayers, sunrise, sunset, now, next }: { prayers: PrayerSlot[]; sunrise: number; sunset: number; now: number; next: string | null }) {
  const valid = prayers.filter(p => Number.isFinite(p.dec));
  if (valid.length < 2 || !(sunset > sunrise)) return null;
  const desde = valid[0].dec, hastaRaw = valid[valid.length - 1].dec, hasta = hastaRaw > desde ? hastaRaw : hastaRaw + 24;
  const x0 = 8, x1 = 334, horizonte = 74, alto = 58;
  const punto = (h: number) => ({ x: x0 + (h - desde) / (hasta - desde) * (x1 - x0), y: horizonte - Math.sin(Math.PI * (h - sunrise) / (sunset - sunrise)) * alto });
  const trazo = (a: number, b: number) => {
    if (b <= a) return "";
    let d = "";
    for (let i = 0; i <= 60; i++) { const p = punto(a + (b - a) * i / 60); d += `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }
    return d;
  };
  const ahora = Math.min(Math.max(now, desde), hasta);
  const sol = punto(ahora);
  const resumen = valid.map(p => `${p.name} ${p.hhmm}`).join(", ");
  return <>
    <svg className="arco-sol" viewBox="0 0 342 100" role="img" aria-label={`Recorrido del sol hoy: ${resumen}.`}>
      <rect className="arco-noche" x="0" y={horizonte} width="342" height="40" />
      <line className="arco-horizonte" x1="0" y1={horizonte} x2="342" y2={horizonte} />
      <path className="arco-pendiente" d={trazo(ahora, hasta)} />
      <path className="arco-recorrido" d={trazo(desde, ahora)} />
      {valid.map(p => {
        const q = punto(p.dec > desde || p === valid[0] ? p.dec : p.dec + 24), pasado = p.dec <= now, esSiguiente = p.name === next;
        return <g key={p.name}>
          <circle className={"arco-rezo" + (pasado ? " pasado" : "") + (esSiguiente ? " siguiente" : "")} cx={q.x} cy={q.y} r={esSiguiente ? 6 : 4} />
          {esSiguiente && <text className="arco-etiqueta" x={q.x + 10} y={q.y - 8}>{p.name}</text>}
        </g>;
      })}
      {now >= desde && now <= hasta && <><circle className="sol-halo" cx={sol.x} cy={sol.y} r="11" /><circle className="sol" cx={sol.x} cy={sol.y} r="6.5" /></>}
    </svg>
    <div className="arco-extremos" aria-hidden="true"><span>{valid[0].name} {valid[0].hhmm}</span><span>{valid[valid.length - 1].name} {valid[valid.length - 1].hhmm}</span></div>
  </>;
}
