import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

type Candidate = { version_code: number; version_name: string; size: number; tag: string };
type Status = { phase: string; error: string; received: number; candidate: Candidate | null; installed_code: number; installed_version: string; abi: string; can_install: boolean };
const labels: Record<string, string> = { checking: "Buscando actualizaciones…", downloading: "Descargando APK…", verifying: "Verificando el paquete…", installing: "Preparando el instalador…", cancelling: "Cancelando…", up_to_date: "Tenés la última compilación disponible.", available: "Hay una actualización disponible.", ready: "Descarga verificada. Lista para instalar." };
const busyPhases = ["checking", "downloading", "verifying", "installing", "cancelling"];
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function AndroidUpdates() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (document.hidden) return;
      invoke<Status>("android_update", { action: "status" }).then(s => { if (alive) setStatus(s); }).catch(e => { if (alive) setError(String(e)); });
    };
    refresh();
    const timer = window.setInterval(refresh, 1500);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  async function action(action: string) {
    setSending(true); setError("");
    try { setStatus(await invoke<Status>("android_update", { action })); }
    catch (e) { setError(String(e)); }
    finally { setSending(false); }
  }
  const busy = sending || !!status && busyPhases.includes(status.phase);
  const candidate = status?.candidate;
  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Actualizaciones</h2><p>Canal Android experimental</p></div>
      <button className="secondary-button" disabled={busy || !status} onClick={() => action("check")}>{status?.phase === "checking" ? "Buscando…" : "Buscar actualizaciones"}</button>
    </div>
    {status && <p>Versión {status.installed_version} · compilación {status.installed_code} · {status.abi === "arm64-v8a" ? "ARM de 64 bits" : "ARM de 32 bits"}</p>}
    <p role="status" aria-live="polite">{status ? labels[status.phase] ?? "Buscá una nueva compilación para este teléfono." : "Consultando versión instalada…"}</p>
    {candidate && <div className="update-card">
      <b>Versión {candidate.version_name} · compilación {candidate.version_code}</b>
      <p>{mb(candidate.size)} · {candidate.tag}</p>
      {status?.phase === "downloading" && <><progress className="android-update-progress" aria-label="Descarga del APK" max={candidate.size} value={status.received} /><p>{mb(status.received)} de {mb(candidate.size)}</p></>}
      <div className="editor-actions android-update-actions">
        {status?.phase === "available" && <button className="secondary-button" disabled={busy} onClick={() => action("download")}>Descargar actualización</button>}
        {status?.phase === "ready" && <>
          {!status.can_install && <button className="secondary-button" disabled={busy} onClick={() => action("permission")}>Permitir instalar actualizaciones</button>}
          <button className="secondary-button" disabled={busy || !status.can_install} onClick={() => action("install")}>Instalar actualización</button>
        </>}
      </div>
    </div>}
    {status && ["checking", "downloading", "verifying"].includes(status.phase) && <button className="secondary-button" disabled={sending} onClick={() => action("cancel")}>Cancelar</button>}
    {status?.phase === "ready" && <p className="nota">Android te pedirá confirmar la instalación. Si abriste los permisos, volvé a esta pantalla y pulsá Instalar actualización. Si cancelás el instalador, podés abrirlo de nuevo.</p>}
    {(error || status?.error) && <p role="alert">{error || status?.error}</p>}
    <p className="nota">La búsqueda y la descarga usan Internet. Mantené la app abierta durante la descarga; si se interrumpe, podés volver a descargar. La app verifica el paquete y su firma antes de abrir el instalador.</p>
    <button className="secondary-button" onClick={() => openUrl("https://github.com/MarcosRehtanz/adhan-companion/releases").catch(e => setError(String(e)))}>Ver versiones publicadas</button>
  </section>;
}
