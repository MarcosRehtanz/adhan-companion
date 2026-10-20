import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Download, Pause, Play, Square, SkipBack, SkipForward, Volume2, SlidersHorizontal, X, CheckCircle2, LoaderCircle } from "lucide-react";
import { positionLabel, SURAS, type Position } from "../lib/quran";

import { downloadView, type AudioState, type PendingAudioAction } from "../lib/quran-audio-state";

export function useQuranAudio(enabled: boolean, sura: number) {
  const [state, setState] = useState<AudioState | null>(null);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAudioAction | null>(null);
  const active = useRef(false);
  const requested = useRef(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const value = await invoke<AudioState>("quran_audio_status", { sura });
      if (active.current && id === sequence.current) { setState(value); setStatusError(""); if (value.download.phase !== "downloading") setCancelRequested(false); }
    } catch (e) { if (active.current && id === sequence.current) setStatusError(String(e)); }
  }, [sura]);
  useEffect(() => {
    if (!enabled) return;
    active.current = true;
    let pending = false;
    const poll = async () => { if (pending) return; pending = true; try { await refresh(); } finally { pending = false; } };
    void poll();
    const timer = window.setInterval(() => { if (!document.hidden) void poll(); }, 1000);
    return () => { active.current = false; sequence.current++; window.clearInterval(timer); };
  }, [enabled, refresh]);
  const command = useCallback(async (action: string, position?: Position, volume?: number) => {
    if (requested.current) return false;
    requested.current = true; setBusy(true); setPendingAction({ action, sura: position?.sura ?? sura }); setError("");
    if (action === "cancel") setCancelRequested(true);
    try {
      await invoke("quran_audio_control", { action, sura: position?.sura ?? sura, aya: position?.aya, volume });
      await refresh();
      return true;
    } catch (e) { if (active.current) { setError(String(e)); if (action === "cancel") setCancelRequested(false); } return false; }
    finally { requested.current = false; if (active.current) { setBusy(false); setPendingAction(null); } }
  }, [refresh, sura]);
  return { state, error: error || statusError, statusError, pendingAction: cancelRequested ? { action: "cancel", sura } : pendingAction, busy, command, refresh };
}
export type QuranAudioController = ReturnType<typeof useQuranAudio>;
const labels: Record<string, string> = { stopped: "Detenida", loading: "Cargando aleya…", playing: "Reproduciendo", paused: "Pausada", finished: "Sura terminada", error: "No se pudo reproducir" };
const mib = (n: number) => `${(n / 1048576).toFixed(1)} MiB`;
export function QuranAudio({ audio, position, onLocate }: { audio: QuranAudioController; position: Position; onLocate: (position: Position) => void }) {
  const { state, command, busy, error, pendingAction, statusError, refresh } = audio;
  const [volume, setVolume] = useState<number | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const optionsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setSlot(document.getElementById("quran-player-slot")); }, []);
  useEffect(() => { if (optionsOpen) closeButton.current?.focus(); }, [optionsOpen]);
  function closeOptions() {
    setOptionsOpen(false);
    setVolume(null);
    optionsButton.current?.focus();
  }
  const downloading = state?.download.phase === "downloading";
  const currentOffline = state?.offline.sura === position.sura ? state.offline : null;
  const download = downloadView(state, position.sura, pendingAction, statusError);
  const cancelling = pendingAction?.action === "cancel";
  const isPlaying = state?.phase === "playing" || state?.phase === "loading";
  const sessionActive = isPlaying || state?.phase === "paused";
  const hasPlaybackPosition = !!state?.position && (sessionActive || state.phase === "error");
  const shown = hasPlaybackPosition ? state!.position! : position;
  const primaryLabel = isPlaying ? "Pausar recitación" : state?.phase === "paused" ? "Reanudar recitación" : `Escuchar desde ${positionLabel(position)}`;
  const alert = error || state?.error;
  if (!slot) return null;
  return createPortal(<section className="quran-player" aria-label="Reproductor del Qur’an" onKeyDown={event => { if (event.key === "Escape" && optionsOpen) { event.stopPropagation(); closeOptions(); } }}>
    {optionsOpen && <div id="quran-audio-options" className="quran-player-options" role="region" aria-labelledby="quran-audio-options-title">
      <div className="quran-options-heading"><h2 id="quran-audio-options-title">Opciones de recitación</h2><button ref={closeButton} className="quran-player-icon" aria-label="Cerrar opciones de recitación" onClick={closeOptions}><X size={18} /></button></div>
      <div className="quran-options-grid">
        <div className="quran-option-block">
          <h3><Volume2 size={15} /> Escucha</h3>
          <p>Shahriar Parhizgar · recitación en árabe</p>
          {state && (volume === null ? <p>Volumen <b>{state.volume}%</b> <button className="link-button" onClick={() => setVolume(state.volume)}>Editar</button></p> : <div className="editor"><label>Volumen · {volume}%<input type="range" min="0" max="100" value={volume} onChange={e => setVolume(Number(e.target.value))} /></label><div className="editor-actions"><button className="secondary-button" disabled={busy} onClick={() => setVolume(null)}>Cancelar</button><button className="secondary-button" disabled={busy} onClick={async () => { if (await command("volume", undefined, volume)) setVolume(null); }}>Guardar</button></div></div>)}
          {state?.last && <div className="quran-last-listened"><span>Última escucha</span><p>{positionLabel(state.last)}</p><button className="link-button" disabled={busy} onClick={() => void command("retake")}>Retomar escucha</button></div>}
        </div>
        <div className="quran-option-block">
          <h3><Download size={15} /> Audio sin conexión</h3>
          <p><b>{position.sura}. {SURAS[position.sura - 1].name}</b></p>
          <div className={`quran-download-state ${download.kind}`} role="status" aria-live="polite">
            {download.kind === "complete" ? <CheckCircle2 size={16} /> : ["loading", "downloading", "cancelling", "deleting"].includes(download.kind) ? <LoaderCircle size={16} className="quran-state-spinner" /> : null}
            <span>{download.label}</span>
          </div>
          {currentOffline && !["loading", "unavailable", "damaged"].includes(download.kind) && <p className="nota">{currentOffline.completed}/{currentOffline.total} aleyas · {mib(currentOffline.bytes)}</p>}
          {download.kind === "damaged" && <p className="nota">{state?.storage_error}</p>}
          {download.kind === "error" && <p className="nota">{state?.download.error}</p>}
          <div className="quran-audio-actions">
            {download.primary && <button className="secondary-button" disabled={busy} onClick={() => void command("download")}><Download size={15} />{download.primary}</button>}
            {download.removable && <button className="link-button" disabled={busy} onClick={() => void command("delete")}>{download.kind === "damaged" ? "Eliminar audio dañado" : "Eliminar audio"}</button>}
            {download.kind === "unavailable" && <button className="link-button" disabled={busy} onClick={() => void refresh()}>Volver a consultar</button>}
          </div>
          {download.blockedByOther && <p className="nota">Esperá a que termine la descarga actual para modificar esta sura.</p>}
          {downloading && state?.download.sura && <div className="quran-download-status"><p>{SURAS[state.download.sura - 1].name} · {state.download.completed}/{state.download.total} · {mib(state.download.bytes)}</p><progress value={state.download.completed} max={state.download.total} aria-label="Progreso de descarga por aleyas" /><button className="link-button" disabled={busy || cancelling} onClick={() => void command("cancel")}>{cancelling ? "Cancelando…" : "Cancelar descarga"}</button></div>}

        </div>
      </div>
      <details className="quran-audio-sources"><summary>Acerca de la recitación y sus fuentes</summary>
        <p>El audio continúa hasta el final de la sura, también con la ventana cerrada o la pantalla apagada. Puede haber pausas entre aleyas. Los avisos de rezo tienen prioridad; después debés reanudar la escucha manualmente. Escuchar o ver la aleya no cambia tu punto de lectura.</p>
        <p>Las descargas se guardan por sura. Cancelar conserva las aleyas verificadas; eliminar audio conserva marcadores y lectura. Espacio máximo: 300 MiB por sura y 1 GiB en total. Para conservar audio sin conexión, usá Descargar sura.</p>
        <p>Recitador: Shahriar Parhizgar. Edición <code>ar.parhizgar</code> de Al Quran Cloud / Islamic Network. Grabaciones originales, sin agregar basmalas ni voces sintéticas. Calidad publicada: 48 kbps; la tasa real puede variar.</p>
        <p>El proveedor publica permisos para redistribución gratuita no comercial y reproducción y descarga personal o educativa. Los derechos permanecen con los recitadores o sus herederos, que pueden solicitar su retirada. Condiciones independientes de MIT, del texto y de la traducción.</p>
        <p><a href="https://alquran.cloud/terms-and-conditions" target="_blank" rel="noreferrer">Condiciones del proveedor</a> · <a href="https://alquran.cloud/cdn" target="_blank" rel="noreferrer">Procedencia</a> · consultadas el 19/10/2026.</p>
      </details>
    </div>}
    {state?.notifications === false && <div className="quran-player-alert" role="alert"><span>Para escuchar, permití las notificaciones de la app: desde ahí podés pausar o detener la recitación.</span><button className="link-button" disabled={busy} onClick={() => void invoke("android_alert_status", { action: "notifications" }).then(refresh, refresh)}>Permitir notificaciones</button></div>}
    {alert && <div className="quran-player-alert" role="alert"><span>{alert}</span>{state?.phase === "error" && <button className="link-button" disabled={busy} onClick={() => void command("retry")}>Reintentar aleya</button>}</div>}
    <div className="quran-player-bar">
      <div className="quran-player-track"><span className="quran-player-mark" aria-hidden="true"><Volume2 size={19} /></span><div><button className="quran-player-position" title={hasPlaybackPosition ? "Ver aleya de la recitación" : "Ver aleya seleccionada"} onClick={() => onLocate(shown)}><b>{SURAS[shown.sura - 1].name}</b><span>{shown.sura}:{shown.aya}</span></button><p>Parhizgar <span aria-hidden="true">·</span> <span role="status">{state?.interrupted ? "Pausada por aviso de rezo" : !state ? "Conectando…" : sessionActive ? labels[state.phase] : state.phase === "error" ? "Error de reproducción" : "Escuchar desde aquí"}</span></p></div></div>
      <div className="quran-player-controls" role="group" aria-label="Controles de recitación">
        <button className="quran-player-icon" title="Aleya anterior" aria-label="Aleya anterior" disabled={busy || !sessionActive || !state?.position || state.position.aya === 1} onClick={() => void command("previous")}><SkipBack size={17} /></button>
        <button className="quran-player-icon quran-player-play" title={primaryLabel} aria-label={primaryLabel} disabled={busy || !state} onClick={() => void command(isPlaying ? "pause" : state?.phase === "paused" ? "resume" : "play", position)}>{isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        <button className="quran-player-icon" title="Aleya siguiente" aria-label="Aleya siguiente" disabled={busy || !sessionActive || !state?.position || state.position.aya === SURAS[state.position.sura - 1].count} onClick={() => void command("next")}><SkipForward size={17} /></button>
        <button className="quran-player-icon" title="Detener recitación" aria-label="Detener recitación" disabled={busy || !sessionActive} onClick={() => void command("stop")}><Square size={15} /></button>
      </div>
      <button ref={optionsButton} className="quran-player-options-toggle" aria-expanded={optionsOpen} aria-controls="quran-audio-options" onClick={() => optionsOpen ? closeOptions() : setOptionsOpen(true)}><SlidersHorizontal size={16} /><span>Opciones</span>{downloading && <span className="quran-download-dot" title="Descarga en curso" aria-label="Descarga en curso" />}</button>
    </div>
  </section>, slot);
}
