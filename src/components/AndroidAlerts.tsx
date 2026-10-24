import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
type Status = { enabled: boolean; exact: boolean; notifications: boolean; battery: boolean; next: number; next_pre: number; error: string };
export function AndroidAlerts() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(false);
  async function action(action = "status") {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const value = await invoke<Status>("android_alert_status", { action }); if (mounted.current) { setStatus(value); setError(""); } }
    catch (e) { if (mounted.current) setError(String(e)); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { if (!document.hidden) void action(); };
    refresh(); window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { mounted.current = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  const known = !!status && !error;
  const permissions = !!status?.exact && !!status?.notifications;
  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Avisos en este teléfono</h2><p>Revisá tu ubicación y los horarios antes de activar los avisos.</p></div></div>
    {!status && !error && <p role="status">Consultando permisos y programación…</p>}
    {known && status && <>
      <div className="read-grid"><div><span>Estado</span><b>{status.error ? "Requieren atención" : !status.enabled ? "Desactivados" : !permissions ? "Faltan permisos" : status.next ? "Programados" : "Sin programación"}</b></div><div><span>Notificaciones</span><b>{status.notifications ? "Permitidas" : "Sin permiso"}</b></div><div><span>Alarmas exactas</span><b>{status.exact ? "Permitidas" : "Sin permiso"}</b></div><div><span>Batería</span><b>{status.battery ? "Sin optimización" : "Optimizada"}</b></div><div><span>Próximo aviso de rezo</span><b>{status.enabled && permissions && !status.error && status.next ? new Date(status.next).toLocaleString() : "—"}</b></div></div>
      <div className="editor-actions">
        {!status.enabled && <button className="secondary-button" disabled={busy} onClick={() => void action("enable")}>{busy ? "Aplicando…" : "Activar avisos"}</button>}
        {status.enabled && <button className="secondary-button" disabled={busy} onClick={() => void action("disable")}>{busy ? "Aplicando…" : "Desactivar avisos"}</button>}
        {!status.notifications && <button className="secondary-button" disabled={busy} onClick={() => void action("notifications")}>Permitir notificaciones</button>}
        {!status.exact && <button className="secondary-button" disabled={busy} onClick={() => void action("exact")}>Permitir alarmas exactas</button>}
        {!status.battery && <button className="secondary-button" disabled={busy} onClick={() => void action("battery")}>Dejar de optimizar la batería</button>}
        {status.enabled && permissions && (!status.next || !!status.error) && <button className="secondary-button" disabled={busy} onClick={() => void action("reschedule")}>Reintentar programación</button>}
        <button className="secondary-button" disabled={busy} onClick={() => void action()}>Actualizar estado</button>
      </div>
      {!permissions && <p className="nota">Al activar los avisos, la app pide los permisos que falten y completa la activación al volver.</p>}
      {!status.battery && <p className="nota">«Optimizada» en la lista de batería hace que Samsung, Xiaomi y otros retrasen los avisos: tocá Adhan Companion ahí y elegí «No optimizar».</p>}
      {status.error && <p role="alert">Último problema: {status.error}</p>}
    </>}
    {error && <div role="alert"><p>No se pudo confirmar el estado de los avisos: {error}</p><button className="secondary-button" disabled={busy} onClick={() => void action()}>Reintentar consulta</button></div>}
    <p className="nota">El Adhan y los tonos combinan el volumen de alarmas del teléfono y el de la app. El preaviso usa su canal de notificación.</p>
    <p className="nota">Android muestra el próximo rezo como una alarma del sistema. Si forzás la detención de la app, abrila para reprogramar los avisos. En Samsung, permití la actividad en segundo plano si el ahorro de batería los bloquea.</p>
  </section>;
}
