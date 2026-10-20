import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
export function AutostartSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const alive = useRef(false);
  async function load() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { const v = await invoke<boolean>("get_autostart"); if (alive.current) setEnabled(v); }
    catch (e) { if (alive.current) { setError(String(e)); setEnabled(null); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
  async function toggle() {
    if (lock.current || enabled === null) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await invoke("set_autostart", { enabled: !enabled });
      const actual = await invoke<boolean>("get_autostart");
      if (alive.current) setEnabled(actual);
    } catch (e) { if (alive.current) { setEnabled(null); setError(String(e)); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  return <><div className="system-state"><div><span>Iniciar la app al iniciar sesión</span><b>{busy ? enabled === null ? "Consultando…" : "Aplicando…" : enabled === null ? "Estado no disponible" : enabled ? "Activado" : "Desactivado"}</b></div>{enabled !== null && !error && <button className="edit-button" disabled={busy} onClick={() => void toggle()}>{busy ? "Aplicando…" : enabled ? "Desactivar" : "Activar"}</button>}</div>{error && <div role="alert"><p>{error}</p><button className="secondary-button" disabled={busy} onClick={() => void load()}>Consultar nuevamente</button></div>}</>;
}
