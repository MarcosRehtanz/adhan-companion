import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** «jueves 29 de octubre» a partir de YYYY-MM-DD (al mediodía, para no depender de la zona). */
export function fechaVuelta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.toLocaleDateString("es", { weekday: "long" })} ${d.getDate()} de ${d.toLocaleDateString("es", { month: "long" })}`;
}

/** ¿Los avisos están en pausa hoy? `pausedUntil` es el día en que vuelven. */
export const enPausa = (pausedUntil: string | null | undefined, today: string) => !!pausedUntil && !!today && today < pausedUntil;

/**
 * Pausa de todos los avisos (Adhan, preaviso y recordatorio). Es una acción inmediata, no una
 * edición con borrador: el core guarda solo la fecha de vuelta y no pregunta ni guarda el motivo.
 */
export function PauseAlerts({ pausedUntil, today, disabled, onChanged }: {
  pausedUntil?: string | null; today: string; disabled: boolean; onChanged: (saved: unknown) => void;
}) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paused = enPausa(pausedUntil, today);

  async function apply(value: number | null) {
    if (busy) return;
    setBusy(true); setError("");
    try { onChanged(await invoke("set_pause", { days: value })); }
    catch (e) { setError(`No se pudo ${value === null ? "reanudar" : "pausar"} los avisos: ${e}`); }
    finally { setBusy(false); }
  }

  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Pausa</h2><p>Sin Adhan, sin preaviso y sin recordatorio durante unos días. Al terminar, los avisos vuelven solos. La app no pregunta ni guarda el motivo.</p></div></div>
    {paused ? <>
      <p role="status">Los avisos están en pausa. Vuelven el <b>{fechaVuelta(pausedUntil!)}</b>.</p>
      <div className="editor-actions"><button className="secondary-button" disabled={disabled || busy} onClick={() => void apply(null)}>{busy ? "Reanudando…" : "Reanudar ahora"}</button></div>
    </> : <div className="pausa-fila">
      <label>Días<input type="number" min="1" max="60" value={days} disabled={disabled || busy} onChange={e => setDays(Math.max(1, Math.min(60, Math.round(+e.target.value) || 1)))} /></label>
      <button className="secondary-button" disabled={disabled || busy} onClick={() => void apply(days)}>{busy ? "Pausando…" : `Pausar ${days === 1 ? "un día" : `${days} días`}`}</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
