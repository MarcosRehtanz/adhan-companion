import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateDisponible } from "../types";
type NativeStatus = { phase: Phase; error: string; candidate: UpdateDisponible | null };
type Phase = "loading" | "idle" | "checking" | "current" | "available" | "installing" | "error";
export function DesktopUpdates() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<{ version: string; appimage: boolean; windows: boolean; deb: boolean } | null>(null);
  const [candidate, setCandidate] = useState<UpdateDisponible | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setPhase("loading"); setError("");
    Promise.all([invoke<string>("version_actual"), invoke<boolean>("ejecutando_appimage"), invoke<boolean>("ejecutando_windows"), invoke<boolean>("ejecutando_deb"), invoke<NativeStatus>("desktop_update_status")])
      .then(([version, appimage, windows, deb, status]) => { if (mounted.current) { setInfo({ version, appimage, windows, deb }); setPhase(status.phase); setCandidate(status.candidate); setError(status.error); } })
      .catch(e => { if (mounted.current) { setError(String(e)); setPhase("error"); } });
    return () => { mounted.current = false; };
  }, [retry]);
  useEffect(() => {
    if (!info) return;
    let alive = true; let reading = false;
    const refresh = async () => {
      if (document.hidden || running.current || reading) return;
      reading = true;
      try { const status = await invoke<NativeStatus>("desktop_update_status"); if (alive && !running.current) { setPhase(status.phase); setCandidate(status.candidate); setError(status.error); } }
      catch (e) { if (alive && !running.current) { setPhase("error"); setError(String(e)); } }
      finally { reading = false; }
    };
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [!!info]);
  async function check() {
    if (running.current) return;
    running.current = true; setPhase("checking"); setCandidate(null); setError("");
    try {
      const value = await invoke<UpdateDisponible | null>("check_update");
      if (mounted.current) { setCandidate(value); setPhase(value ? "available" : "current"); }
    } catch (e) { if (mounted.current) { setError(String(e)); setPhase("error"); } }
    finally { running.current = false; }
  }
  async function install() {
    if (running.current || !candidate || !info || !installable(info, candidate)) return;
    running.current = true; setPhase("installing"); setError("");
    try { await invoke("instalar_update"); } // El core relanza al terminar: no afirmar éxito por abrir un proceso.
    catch (e) { if (mounted.current) { setPhase("error"); setError(String(e)); } }
    finally { running.current = false; }
  }
  const busy = ["loading", "checking", "installing"].includes(phase);
  const canInstall = !!info && !!candidate && installable(info, candidate);
  // Qué hace «Actualizar ahora» en esta instalación.
  const how = info?.windows ? "Descarga el instalador, verifica su SHA-256 y lo instala encima, sin desinstalar: la app se cierra y vuelve a abrirse."
    : info?.deb ? "Descarga el paquete, verifica su SHA-256 y lo instala con apt: Ubuntu te va a pedir tu contraseña. Después la app vuelve a abrirse."
    : "Descarga la AppImage nueva, la reemplaza y vuelve a abrir la app.";
  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Actualizaciones</h2><p>{info ? `Versión instalada: v${info.version}` : "Consultando instalación…"}</p></div>{info && phase !== "installing" && <button className="test" disabled={busy} onClick={() => void check()}>{phase === "checking" ? "Buscando…" : phase === "error" ? "Reintentar búsqueda" : "Buscar actualizaciones"}</button>}</div>
    {phase === "idle" && <p className="nota">Buscá una versión para comprobar si esta instalación está actualizada.</p>}
    {phase === "checking" && <p role="status">Consultando versiones publicadas…</p>}
    {phase === "current" && <p className="success-note" role="status">La aplicación está al día.</p>}
    {phase === "available" && candidate && <div className="update-card"><b>v{candidate.version} disponible</b><p>{candidate.notas}</p>{canInstall ? <><p className="nota">{how}</p><button className="test" onClick={() => void install()}>Actualizar ahora</button></> : <p>Descargá el paquete para tu sistema desde <a href={candidate.url} target="_blank" rel="noreferrer">GitHub Releases</a>.{info?.windows && " Al instalar, elegí «No desinstalar» para conservar la instalación actual."}</p>}</div>}
    {phase === "installing" && <p role="status">{info?.deb ? "Descargando y verificando el paquete. Cuando Ubuntu pida tu contraseña, confirmala; después la app se reinicia." : "Descargando y verificando la actualización. La app se cerrará para instalarla y volverá a abrirse; mantenela abierta hasta entonces."}</p>}
    {phase === "error" && <div role="alert"><p>No se pudo completar la operación: {error}</p>{!info && <button className="secondary-button" onClick={() => setRetry(n => n + 1)}>Volver a consultar instalación</button>}</div>}
  </section>;
}
/** La app puede instalar sola: AppImage, el paquete .deb o el instalador de Windows, verificados con SHA256SUMS. */
function installable(info: { appimage: boolean; windows: boolean; deb: boolean }, candidate: UpdateDisponible) {
  if (info.appimage) return !!candidate.appimage;
  if (info.windows) return !!candidate.checksums && !!candidate.windows_installer?.toLowerCase().endsWith("-setup.exe");
  if (info.deb) return !!candidate.checksums && !!candidate.deb;
  return false;
}
