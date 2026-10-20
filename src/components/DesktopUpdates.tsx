import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateDisponible } from "../types";
type NativeStatus = { phase: Phase; error: string; candidate: UpdateDisponible | null };
type Phase = "loading" | "idle" | "checking" | "current" | "available" | "installing" | "error";
export function DesktopUpdates() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<{ version: string; appimage: boolean; windows: boolean } | null>(null);
  const [candidate, setCandidate] = useState<UpdateDisponible | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setPhase("loading"); setError("");
    Promise.all([invoke<string>("version_actual"), invoke<boolean>("ejecutando_appimage"), invoke<boolean>("ejecutando_windows"), invoke<NativeStatus>("desktop_update_status")])
      .then(([version, appimage, windows, status]) => { if (mounted.current) { setInfo({ version, appimage, windows }); setPhase(status.phase); setCandidate(status.candidate); setError(status.error); } })
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
    if (running.current || !candidate || !info?.appimage) return;
    running.current = true; setPhase("installing"); setError("");
    try { await invoke("instalar_update"); } // El core relanza al terminar: no afirmar éxito por abrir un proceso.
    catch (e) { if (mounted.current) { setPhase("error"); setError(String(e)); } }
    finally { running.current = false; }
  }
  const busy = ["loading", "checking", "installing"].includes(phase);
  return <section className="panel setting-panel">
    <div className="panel-heading"><div><h2>Actualizaciones</h2><p>{info ? `Versión instalada: v${info.version}` : "Consultando instalación…"}</p></div>{info && phase !== "installing" && <button className="test" disabled={busy} onClick={() => void check()}>{phase === "checking" ? "Buscando…" : phase === "error" ? "Reintentar búsqueda" : "Buscar actualizaciones"}</button>}</div>
    {phase === "idle" && <p className="nota">Buscá una versión para comprobar si esta instalación está actualizada.</p>}
    {phase === "checking" && <p role="status">Consultando versiones publicadas…</p>}
    {phase === "current" && <p className="success-note" role="status">La aplicación está al día.</p>}
    {phase === "available" && candidate && <div className="update-card"><b>v{candidate.version} disponible</b><p>{candidate.notas}</p>{candidate.appimage && info?.appimage && <button className="test" onClick={() => void install()}>Actualizar ahora</button>}{info?.windows && <p>Descargá y ejecutá el instalador de Windows de <a href={candidate.windows_installer || candidate.url} target="_blank" rel="noreferrer">GitHub Releases</a>.</p>}{!info?.windows && !info?.appimage && <p>Descargá el paquete para tu sistema desde <a href={candidate.url} target="_blank" rel="noreferrer">GitHub Releases</a>. La actualización automática está disponible con AppImage.</p>}{info?.appimage && !candidate.appimage && <p>Esta versión no incluye una AppImage descargable.</p>}</div>}
    {phase === "installing" && <p role="status">Descargando e instalando la actualización. La app se reiniciará al terminar; mantenela abierta.</p>}
    {phase === "error" && <div role="alert"><p>No se pudo completar la operación: {error}</p>{!info && <button className="secondary-button" onClick={() => setRetry(n => n + 1)}>Volver a consultar instalación</button>}</div>}
  </section>;
}
