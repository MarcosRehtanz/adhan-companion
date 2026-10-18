import { useEffect, useState } from "react";
import { HIJRI_MONTHS, civilDay, civilLabel, fromCivil, hijriLabel, monthLength, toCivil } from "../lib/hijri";
export interface CalendarConfig { adjustment_days: number }
export function IslamicCalendar({ today, config, editing, onEdit, onCancel, onChange }: {
  today: string; config: CalendarConfig; editing: boolean; onEdit: () => void; onCancel: () => void; onChange: (config: CalendarConfig) => void;
}) {
  const current = fromCivil(today, config.adjustment_days);
  const [view, setView] = useState({ year: current.year, month: current.month });
  const [selected, setSelected] = useState(today);
  // Un ajuste puede mover el día actual a otro mes; volver a la consulta actual evita ambigüedades.
  useEffect(() => { const h = fromCivil(today, config.adjustment_days); setView({ year: h.year, month: h.month }); setSelected(today); }, [today, config.adjustment_days]);
  const first = toCivil({ ...view, day: 1 }, config.adjustment_days);
  const weekday = (new Date(civilDay(first) * 86_400_000).getUTCDay() + 6) % 7;
  const length = monthLength(view.year, view.month);
  function move(delta: number) {
    const index = (view.year - 1) * 12 + view.month - 1 + delta;
    if (index < 0 || index >= 3000 * 12) return;
    const next = { year: Math.floor(index / 12) + 1, month: index % 12 + 1 };
    setView(next); setSelected(toCivil({ ...next, day: 1 }, config.adjustment_days));
  }
  return <div className="page-stack">
    <section className="panel">
      <div className="panel-heading"><div><h2>Calendario islámico</h2><p>Hoy: {hijriLabel(today, config.adjustment_days)} · {civilLabel(today)}</p></div><button className="secondary-button" onClick={() => { setView({ year: current.year, month: current.month }); setSelected(today); }}>Volver a hoy</button></div>
      <div className="hijri-navigation"><button className="secondary-button" aria-label="Mes anterior" disabled={view.year === 1 && view.month === 1} onClick={() => move(-1)}>←</button><h3 aria-live="polite">{HIJRI_MONTHS[view.month - 1]} · {view.year} H</h3><button className="secondary-button" aria-label="Mes siguiente" disabled={view.year === 3000 && view.month === 12} onClick={() => move(1)}>→</button></div>
      <div className="hijri-year-navigation"><button className="link-button" disabled={view.year === 1} onClick={() => move(-12)}>Año anterior</button><button className="link-button" disabled={view.year === 3000} onClick={() => move(12)}>Año siguiente</button></div>
      <div className="hijri-grid" aria-label="Fechas del mes islámico">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(day => <span className="hijri-weekday" key={day}>{day}</span>)}
        {Array.from({ length: weekday }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length }, (_, i) => {
          const date = toCivil({ ...view, day: i + 1 }, config.adjustment_days);
          return <button key={date} className={`hijri-cell ${date === today ? "is-today" : ""} ${selected === date ? "is-selected" : ""}`} aria-label={`${hijriLabel(date, config.adjustment_days)}; ${civilLabel(date)}`} aria-pressed={selected === date} aria-current={date === today ? "date" : undefined} onClick={() => setSelected(date)}><b>{i + 1}</b><span>{date.slice(8)}/{date.slice(5, 7)}</span></button>;
        })}
      </div>
      <div className="hijri-selection" aria-live="polite"><strong>{hijriLabel(selected, config.adjustment_days)}</strong><span>{civilLabel(selected)}</span></div>
      <p className="nota">Los números grandes muestran el día islámico; debajo, día/mes civil. El borde señala hoy.</p>
    </section>
    <section className="panel setting-panel">
      <div className="panel-heading"><div><h2>Criterio del calendario</h2><p>Tabular civil · cálculo local · cambio de fecha a medianoche local.</p></div>{!editing && <button className="edit-button" onClick={onEdit}>Editar ajuste</button>}</div>
      <p>Es una correspondencia de consulta. Puede diferir de la observación lunar o del calendario de tu comunidad. No determina automáticamente el inicio de Ramadán ni de las festividades.</p>
      {editing ? <div className="editor"><label>Ajuste de la fecha islámica<select value={config.adjustment_days} onChange={e => onChange({ adjustment_days: Number(e.target.value) })}>{[-2, -1, 0, 1, 2].map(n => <option value={n} key={n}>{n > 0 ? "+" : ""}{n} días</option>)}</select></label><p className="nota">+1 adelanta un día la fecha islámica mostrada. Guardar aplica el ajuste; Cancelar restaura el anterior.</p><div className="editor-actions"><button className="secondary-button" onClick={onCancel}>Cancelar</button></div></div> : <p>Ajuste: <b>{config.adjustment_days > 0 ? "+" : ""}{config.adjustment_days} días</b></p>}
      <p className="nota">Este ajuste solo afecta al calendario. Los horarios y el registro de rezos conservan sus fechas civiles.</p>
    </section>
  </div>;
}
