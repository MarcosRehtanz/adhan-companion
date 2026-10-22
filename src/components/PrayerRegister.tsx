import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check } from "lucide-react";
import type { Schedule, MarkedDay, PrayerSlot } from "../types";
import { prayerReached } from "../lib/prayers";
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function PrayerRegister({ schedule }: { schedule: Schedule | null }) {
  const today = schedule?.date ?? iso(new Date());
  const [cursor, setCursor] = useState(() => new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1));
  const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const [selected, setSelected] = useState(today);
  const [records, setRecords] = useState<{ month: string; values: Map<string, Set<string>> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [hours, setHours] = useState<{ date: string; values: Record<string, string> } | null>(null);
  const [hoursError, setHoursError] = useState("");
  const [hoursRetry, setHoursRetry] = useState(0);
  const seq = useRef(0);
  const lock = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; seq.current++; }; }, []);
  // `background`: refresca sin ocultar el mes que ya se ve (después de marcar o por un aviso del core).
  const reload = useCallback(async (background = false) => {
    const id = ++seq.current;
    if (!background) { setLoading(true); setLoadError(""); }
    try {
      const days = await invoke<MarkedDay[]>("get_marked", { month });
      if (mounted.current && id === seq.current) { setRecords({ month, values: new Map(days.map(d => [d.date, new Set(d.prayers)])) }); setLoadError(""); }
    } catch (e) { if (mounted.current && id === seq.current) setLoadError(String(e)); }
    finally { if (mounted.current && id === seq.current) setLoading(false); }
  }, [month]);
  useEffect(() => { void reload(); return () => { seq.current++; }; }, [reload]);
  useEffect(() => {
    let active = true;
    const un = listen("schedule_changed", () => { if (active) void reload(true); });
    return () => { active = false; void un.then(f => f()).catch(() => {}); };
  }, [reload]);
  useEffect(() => {
    if (selected === schedule?.date) { setHours(null); setHoursError(""); return; }
    let active = true; setHours(null); setHoursError("");
    invoke<PrayerSlot[]>("get_schedule_for", { date: selected }).then(slots => { if (active) setHours({ date: selected, values: Object.fromEntries(slots.map(s => [s.name, s.hhmm])) }); }).catch(e => { if (active) setHoursError(String(e)); });
    return () => { active = false; };
  }, [selected, schedule?.date, hoursRetry]);
  const ready = !loading && !loadError && records?.month === month;
  const marked = (date: string) => records?.month === month ? records.values.get(date) ?? new Set<string>() : new Set<string>();
  async function toggle(prayer: string) {
    if (lock.current || !ready || selected > today) return;
    lock.current = true; setPending(prayer); setSaveError("");
    try {
      await invoke("mark_prayed", { date: selected, prayer });
      // El core confirmó: el día cambia ya y el mes se refresca sin ocultarse.
      if (mounted.current) setRecords(current => {
        if (!current || current.month !== month) return current;
        const values = new Map(current.values), day = new Set(values.get(selected) ?? []);
        if (day.has(prayer)) day.delete(prayer); else day.add(prayer);
        values.set(selected, day);
        return { month, values };
      });
      if (mounted.current) void reload(true);
    } catch (e) { if (mounted.current) setSaveError(`No se pudo guardar el registro: ${e}`); }
    finally { lock.current = false; if (mounted.current) setPending(null); }
  }
  const blanks = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const selectedCount = ready ? marked(selected).size : null;
  const atToday = selected === today && month === today.slice(0, 7);
  function move(delta: number) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next); setSelected(iso(next)); setSaveError("");
  }
  return <>
    <div className="cal-nav"><button className="test" disabled={!!pending} onClick={() => move(-1)} aria-label="Mes anterior">‹</button><span className="cal-tit">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span><button className="test" disabled={!!pending || month >= today.slice(0, 7)} onClick={() => move(1)} aria-label="Mes siguiente">›</button>{!atToday && <button className="test" disabled={!!pending} onClick={() => { setCursor(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1)); setSelected(today); setSaveError(""); }}>Volver a hoy</button>}</div>
    {loading && <p role="status">Consultando registros…</p>}
    {loadError && <div role="alert"><p>No se pudo leer el historial: {loadError}</p><button className="secondary-button" disabled={!!pending} onClick={() => void reload()}>Reintentar consulta</button></div>}
    <div className="cal-grid" aria-busy={loading}>{["L", "M", "X", "J", "V", "S", "D"].map((d, i) => <span className="cal-dow" key={i}>{d}</span>)}{Array.from({ length: blanks }, (_, i) => <span className="cal-cell vacio" key={`b${i}`} />)}{Array.from({ length: days }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`; const n = ready ? marked(date).size : null;
      return <button key={date} className={`cal-cell ${n === 5 ? "full" : n ? "parcial" : ""} ${date === selected ? "sel" : ""} ${date === today ? "hoy" : ""}`} disabled={date > today || !!pending} onClick={() => { setSelected(date); setSaveError(""); }} aria-pressed={date === selected} title={n === null ? "Registro sin consultar" : n === 5 ? "Día completo" : `${n}/5 registrados`}>{i + 1}</button>;
    })}</div>
    <div className="cal-dia"><div className="cal-dia-tit">{new Date(`${selected}T12:00:00`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}</div>{selectedCount !== null && <p role="status">{selectedCount === 0 ? "Sin rezos registrados en esta fecha." : selectedCount === 5 ? "Día completo: 5 de 5 registrados." : `${selectedCount} de 5 registrados.`}</p>}
      <div className="seg-lista">{PRAYERS.map(name => {
        const isMarked = ready && marked(selected).has(name);
        // Hoy, un rezo se marca desde su horario (la misma regla valida el core).
        const early = !isMarked && !prayerReached(schedule, selected, name);
        const time = selected === schedule?.date ? schedule.prayers.find(s => s.name === name)?.hhmm : hours?.date === selected ? hours.values[name] : null;
        return <button key={name} className={`seg-fila ${isMarked ? "on" : ""}`} disabled={!ready || !!pending || selected > today || early} aria-pressed={isMarked} aria-label={early ? `Todavía no es la hora de ${name}` : `${isMarked ? "Desmarcar" : "Marcar realizado"} ${name}`} onClick={() => void toggle(name)}><span className="seg-nombre">{name}</span><span className="seg-hora">{pending === name ? "Guardando…" : time ?? "—"}</span><span className={`seg-check ${isMarked ? "on" : ""}`}>{isMarked && <Check size={13} />}</span></button>;
      })}</div>
      {hoursError && <div role="alert"><p>No se pudieron consultar los horarios: {hoursError}</p><button className="link-button" onClick={() => setHoursRetry(n => n + 1)}>Reintentar horarios</button></div>}
      {saveError && <p role="alert">{saveError} El estado mostrado conserva la última lectura confirmada.</p>}
    </div><p className="nota">No se pueden registrar fechas futuras; hoy, cada rezo se habilita desde su horario. Las marcas cambian cuando el core confirma la escritura; podés corregir días anteriores.</p>
  </>;
}
