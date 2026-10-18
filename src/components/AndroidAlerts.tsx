import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Status = { enabled: boolean; exact: boolean; notifications: boolean; next: number; next_pre: number; error: string };
export function AndroidAlerts() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(action = "status") {
    setBusy(true);
    try { setStatus(await invoke<Status>("android_alert_status", { action })); setError(""); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void action(); };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Avisos en este teléfono</h2><p>Revisá tu ubicación y los horarios antes de activar los avisos.</p></div></div>
    {status && <>
      <div className="read-grid"><div><span>Estado</span><b>{!status.enabled ? "Desactivados" : !status.exact || !status.notifications ? "Faltan permisos" : status.next ? "Programados" : "Sin programación"}</b></div><div><span>Notificaciones</span><b>{status.notifications ? "Permitidas" : "Sin permiso"}</b></div><div><span>Alarmas exactas</span><b>{status.exact ? "Permitidas" : "Sin permiso"}</b></div><div><span>Próximo aviso de rezo</span><b>{status.enabled && status.next ? new Date(status.next).toLocaleString() : "—"}</b></div></div>
      <div className="editor-actions">
        <button className="secondary-button" disabled={busy} onClick={() => action(status.enabled ? "disable" : "enable")}>{status.enabled ? "Desactivar avisos" : "Activar avisos"}</button>
        {!status.notifications && <button className="secondary-button" disabled={busy} onClick={() => action("notifications")}>Permitir notificaciones</button>}
        {!status.exact && <button className="secondary-button" disabled={busy} onClick={() => action("exact")}>Permitir alarmas exactas</button>}
        <button className="secondary-button" disabled={busy} onClick={() => action()}>Actualizar estado</button>
      </div>
      {status.error && <p role="alert">Último problema: {status.error}</p>}
    </>}
    <p className="nota">El Adhan y los tonos usan el volumen de alarmas del teléfono junto con el volumen de la app. El preaviso usa su propio canal de notificación. Podés detener el sonido desde la notificación o desde esta pantalla.</p>
    <p className="nota">Android muestra el próximo rezo como una alarma del sistema. Si forzás la detención de la app, abrila de nuevo para reprogramar los avisos. En Samsung, permití la actividad en segundo plano si el ahorro de batería los bloquea.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
