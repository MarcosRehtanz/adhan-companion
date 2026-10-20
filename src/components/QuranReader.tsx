import { Fragment, memo, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, ChevronDown, ChevronLeft, ChevronRight, MapPin, Maximize, Play, Volume2, X } from "lucide-react";
import { arabicDigits, loadQuran, positionLabel, SURAS, type Corpus, type Position, type ReaderAction, type ReaderState, type Verse } from "../lib/quran";
import { QuranAudio, useQuranAudio } from "./QuranAudio";

type Preferences = Pick<ReaderState, "arabic_size" | "translation_size" | "show_translation">;
type Panel = "indice" | "marcadores" | "preferencias" | "fuentes";
type Listening = "playing" | "paused" | null;
const MAX_BOOKMARKS = 1000;
const END_OF_AYA = "۝";
const PANEL_TITLES: Record<Panel, string> = { indice: "Suras", marcadores: "Marcadores", preferencias: "Preferencias de lectura", fuentes: "Fuentes, versiones y condiciones de uso" };
// Acciones de escucha tras las que la vista vuelve a acompañar a la aleya que suena.
const FOLLOW_ACTIONS = new Set(["play", "resume", "previous", "next", "retake", "retry"]);
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

const same = (a: Position | null | undefined, b: Position | null | undefined) => !!a && !!b && a.sura === b.sura && a.aya === b.aya;
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ'’\-\s]/g, "");
const scrollArea = () => document.getElementById("main-content");

/** El único ornamento del lector: filetes con una estrella de ocho puntas. */
function Ornament() {
  return <div className="quran-filete" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5l2.6 3.2 4.1-.4-.4 4.1 3.2 2.6-3.2 2.6.4 4.1-4.1-.4L12 21.5l-2.6-3.2-4.1.4.4-4.1L2.5 12l3.2-2.6-.4-4.1 4.1.4z" /></svg></div>;
}
/** Marca de fin de aleya (۝ + número arábigo). Es presentación: el texto del corpus no cambia. */
function EndOfAya({ n }: { n: number }) {
  return <>{" "}<span className="quran-fin">{END_OF_AYA + arabicDigits(n)}</span></>;
}
function AyaState({ marked, point, listening }: { marked: boolean; point: boolean; listening: Listening }) {
  if (!marked && !point && !listening) return null;
  return <div className="quran-aleya-estado">
    {listening && <span><Volume2 size={13} />{listening === "playing" ? "Recitando" : "Recitación en pausa"}</span>}
    {point && <span><MapPin size={13} />Punto de lectura</span>}
    {marked && <span className="marcada"><Bookmark size={13} fill="currentColor" />Marcada</span>}
  </div>;
}

interface AyaProps { verse: Verse; current: boolean; marked: boolean; point: boolean; listening: Listening; actions: ReactNode; onSelect: (aya: number) => void }
// Memo: al cambiar la selección solo se vuelven a dibujar la aleya anterior y la nueva.
const AyaBlock = memo(function AyaBlock({ verse, current, marked, point, listening, actions, onSelect }: AyaProps) {
  return <li id={`aleya-${verse.aya}`} data-aya={verse.aya} tabIndex={current ? 0 : -1} aria-current={current ? "true" : undefined}
    className={"quran-aleya" + (current ? " actual" : "")} onClick={() => onSelect(verse.aya)}>
    {(current || marked || point || listening) && <div className="quran-aleya-cabecera"><AyaState marked={marked} point={point} listening={listening} />{actions}</div>}
    <p className="quran-ar" dir="rtl" lang="ar">{verse.arabic}<EndOfAya n={verse.aya} /></p>
    <p className="quran-es" dir="ltr" lang="es"><span className="quran-num">{verse.aya}</span>{verse.translation}</p>
  </li>;
});
const AyaInline = memo(function AyaInline({ verse, current, marked, point, listening, onSelect }: Omit<AyaProps, "actions">) {
  return <span id={`aleya-${verse.aya}`} data-aya={verse.aya} tabIndex={current ? 0 : -1} aria-current={current ? "true" : undefined}
    className={"quran-aya" + (current ? " actual" : "") + (marked ? " marcada" : "") + (point ? " punto" : "") + (listening ? " escuchando" : "")}
    onClick={() => onSelect(verse.aya)}>{verse.arabic}<EndOfAya n={verse.aya} /></span>;
});

export default function QuranReader({ audioAvailable = false }: { audioAvailable?: boolean }) {
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [state, setState] = useState<ReaderState | null>(null);
  const [position, setPosition] = useState<Position>({ sura: 1, aya: 1 });
  const audio = useQuranAudio(audioAvailable, position.sura);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [filter, setFilter] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [visible, setVisible] = useState(1);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const saving = useRef(false);
  // Desplazamiento pendiente: solo la navegación y los cambios de tamaño o modo mueven la vista.
  const scrollTarget = useRef<{ aya: number; top: boolean } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const focusButton = useRef<HTMLButtonElement>(null);
  const exitFocusButton = useRef<HTMLButtonElement>(null);
  // Seguimiento de la recitación: empieza con una acción de escucha y se suspende al desplazarse a mano o navegar.
  const [follow, setFollow] = useState(false);
  const followed = useRef<number | null>(null);
  const recitedRef = useRef<number | null>(null);
  const recitedPos = audio.state?.position && ["playing", "loading"].includes(audio.state.phase) ? audio.state.position : null;
  // Solo se sigue dentro de la sura en pantalla: la recitación no cambia de sura la vista.
  const recitedAya = recitedPos?.sura === position.sura ? recitedPos.aya : null;

  useEffect(() => { setTopbarSlot(document.getElementById("quran-topbar-slot")); }, []);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([loadQuran(), invoke<ReaderState>("get_quran_reader")]).then(([text, saved]) => {
      if (!active) return;
      const start = saved.last ?? { sura: 1, aya: 1 };
      scrollTarget.current = { aya: start.aya, top: start.aya === 1 };
      setCorpus(text); setState(saved); setPosition(start);
    }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [attempt]);

  const preferences = draft ?? state;
  // Aleya a la vista según el desplazamiento: solo informa, no guarda el punto de lectura.
  const measure = useCallback(() => {
    const area = scrollArea(), root = reader.current;
    if (!area || !root) return;
    const items = root.querySelectorAll<HTMLElement>("[data-aya]");
    if (!items.length) return;
    // Línea de lectura algo por debajo del borde: la aleya anterior que apenas asoma no cuenta.
    const top = area.getBoundingClientRect().top + Math.min(96, area.clientHeight / 4);
    let found = Number(items[items.length - 1].dataset.aya);
    for (const item of items) if (item.getBoundingClientRect().bottom > top) { found = Number(item.dataset.aya); break; }
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 4) found = Number(items[items.length - 1].dataset.aya);
    setVisible(found);
  }, []);
  useEffect(() => {
    const area = scrollArea();
    if (!area) return;
    let frame = 0;
    const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    area.addEventListener("scroll", onScroll, { passive: true });
    return () => { area.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [measure]);
  // Los tamaños y el modo cambian la altura de todo el texto: mantener a la vista la aleya elegida (o la que suena, si se la sigue).
  useEffect(() => {
    if (corpus && state && !scrollTarget.current) scrollTarget.current = { aya: follow && recitedAya ? recitedAya : position.aya, top: false };
  }, [preferences?.arabic_size, preferences?.translation_size, preferences?.show_translation]);
  useEffect(() => {
    const target = scrollTarget.current;
    if (!corpus || !state || !target) return;
    let active = true, frame = 0;
    const run = () => {
      const area = scrollArea();
      if (target.top && area) area.scrollTop = 0;
      else document.getElementById(`aleya-${target.aya}`)?.scrollIntoView({ block: preferences?.show_translation ? "start" : "center" });
      measure();
    };
    run();
    // La fuente árabe puede cambiar la altura de todas las aleyas: volver a encuadrar al cargarla.
    void document.fonts.ready.then(() => { if (active) frame = requestAnimationFrame(() => { run(); if (scrollTarget.current === target) scrollTarget.current = null; }); });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [corpus, state, position, preferences?.arabic_size, preferences?.translation_size, preferences?.show_translation, measure]);

  // La vista acompaña a la aleya que suena: al inicio del bloque con traducción, centrada en el texto de corrido.
  useEffect(() => {
    recitedRef.current = recitedAya;
    if (!follow || !recitedAya || followed.current === recitedAya) return;
    // Primero pasa a ser la seleccionada (sus acciones y, en solo árabe, su traducción al pie); se encuadra ya dibujada.
    if (position.aya !== recitedAya) { setPosition(p => p.aya === recitedAya ? p : { sura: p.sura, aya: recitedAya }); return; }
    followed.current = recitedAya;
    const el = document.getElementById(`aleya-${recitedAya}`);
    el?.scrollIntoView({ block: el.tagName === "LI" ? "start" : "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [follow, recitedAya, position.aya]);
  // Desplazarse a mano (rueda, toque, barra de desplazamiento o teclado) deja de seguir la recitación.
  useEffect(() => {
    const area = scrollArea();
    if (!area) return;
    // Leer la traducción larga de la barra del pie no desplaza el texto: no cuenta.
    const manual = (event: Event) => { if (!(event.target as Element).closest("dialog, .quran-contexto")) setFollow(false); };
    const onPointer = (event: PointerEvent) => { if (event.target === area) setFollow(false); };
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as Element;
      if (!SCROLL_KEYS.has(event.key) || (target !== document.body && !area.contains(target))) return;
      if (target.closest(event.key === " " ? "input, textarea, select, dialog, button, a, summary" : "input, textarea, select, dialog")) return;
      setFollow(false);
    };
    area.addEventListener("wheel", manual, { passive: true });
    area.addEventListener("touchmove", manual, { passive: true });
    area.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      area.removeEventListener("wheel", manual); area.removeEventListener("touchmove", manual);
      area.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey);
    };
  }, []);
  function followRecitation() { followed.current = null; setFollow(true); }
  /** Comandos de escucha del lector y del reproductor; escuchar, reanudar o cambiar de aleya vuelve a seguir la recitación. */
  const listen = useCallback(async (action: string, p?: Position, volume?: number) => {
    const ok = await audio.command(action, p, volume);
    if (ok && FOLLOW_ACTIONS.has(action)) followRecitation();
    return ok;
  }, [audio.command]);

  // Modo enfoque: oculta la navegación de la app y el reproductor mientras dure.
  useEffect(() => {
    if (!focusMode) return;
    const root = document.documentElement;
    root.classList.add("quran-enfoque");
    exitFocusButton.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && !dialog.current?.open) exitFocus(); };
    window.addEventListener("keydown", onKey);
    return () => { root.classList.remove("quran-enfoque"); window.removeEventListener("keydown", onKey); };
  }, [focusMode]);
  function exitFocus() { setFocusMode(false); requestAnimationFrame(() => focusButton.current?.focus()); }

  useEffect(() => {
    if (!message || message.error) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  // Paneles (índice, marcadores, preferencias, fuentes) en un único dialog modal.
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (panel && !d.open) d.showModal();
    if (!panel && d.open) d.close();
    if (panel === "indice") {
      const current = d.querySelector<HTMLElement>('[aria-current="true"]');
      current?.focus({ preventScroll: true });
      current?.scrollIntoView({ block: "center" });
    }
  }, [panel]);
  function openPanel(next: Panel) { setFilter(""); setPanel(next); }
  // Cerrar el panel descarta una edición de lectura no guardada.
  function onPanelClosed() { setPanel(null); setDraft(null); }

  async function update(action: ReaderAction): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setMessage(null);
    try {
      const saved = await invoke<ReaderState>("update_quran_reader", { action });
      setState(saved);
      setMessage({ text: action.kind === "bookmark" ? "Marcadores actualizados." : action.kind === "position" ? "Punto de lectura guardado." : "Preferencias guardadas." });
      return true;
    } catch (e) { setMessage({ text: `No se pudo guardar: ${e}`, error: true }); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  /** Guarda el punto de lectura y lo muestra cuando el core lo confirma. */
  function go(p: Position, scroll = true) {
    if (saving.current) return;
    void update({ kind: "position", ...p }).then(ok => {
      if (!ok) return;
      // Navegar es explícito: la vista deja de seguir la recitación hasta pedirlo otra vez.
      if (scroll) { scrollTarget.current = { aya: p.aya, top: p.aya === 1 }; setFollow(false); }
      setPosition({ ...p });
    });
  }
  /** Selecciona una aleya para sus acciones. No guarda nada; elegir otra que la que suena deja de seguir la recitación. */
  const select = useCallback((aya: number) => {
    if (aya !== recitedRef.current) setFollow(false);
    setPosition(p => p.aya === aya ? p : { sura: p.sura, aya });
  }, []);
  /** Encuadra la aleya del reproductor sin guardar; si es la que suena, la vista vuelve a seguirla. */
  function locate(p: Position) { scrollTarget.current = { aya: p.aya, top: false }; followed.current = p.aya; setFollow(true); setPosition({ ...p }); }
  function onKeyNavigate(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (!target.dataset.aya) return;
    const count = SURAS[position.sura - 1].count;
    const next = event.key === "ArrowDown" ? position.aya + 1 : event.key === "ArrowUp" ? position.aya - 1 : event.key === "Home" ? 1 : event.key === "End" ? count : 0;
    if (next < 1 || next > count) return;
    event.preventDefault();
    select(next);
    requestAnimationFrame(() => { const el = document.getElementById(`aleya-${next}`); el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: "nearest" }); });
  }

  const placeholder = topbarSlot && createPortal(<b className="quran-bar-placeholder">Qur’an</b>, topbarSlot);
  if (error) return <>{placeholder}<section className="panel quran-error" role="alert"><h2>No se pudo abrir el lector</h2><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></section></>;
  if (!corpus || !state || !preferences) return <>{placeholder}<p className="quran-loading" role="status">Abriendo los textos instalados…</p></>;

  const sura = SURAS[position.sura - 1];
  const verses = corpus.suras[position.sura - 1];
  const type = corpus.types[sura.number];
  const marks = new Set(state.bookmarks.map(p => `${p.sura}:${p.aya}`));
  const isMarked = (p: Position) => marks.has(`${p.sura}:${p.aya}`);
  const listenPos = audio.state?.position && ["playing", "paused", "loading"].includes(audio.state.phase) ? audio.state.position : null;
  const listening = (aya: number): Listening => listenPos && listenPos.sura === sura.number && listenPos.aya === aya ? (audio.state?.phase === "paused" ? "paused" : "playing") : null;
  const showResume = !!state.last && !same(state.last, position);
  const full = state.bookmarks.length >= MAX_BOOKMARKS;
  const next = sura.number < 114 ? SURAS[sura.number] : null;

  function actions(p: Position) {
    const marked = isMarked(p), point = same(state!.last, p);
    return <div className="quran-acciones" onClick={e => e.stopPropagation()}>
      {audioAvailable && <button className="quran-accion" disabled={audio.busy || !audio.state} title="Escuchar desde esta aleya" onClick={() => void listen("play", p)}><Play size={15} /><span>Escuchar</span></button>}
      <button className="quran-accion" aria-pressed={marked} disabled={busy || (!marked && full)} title={marked ? `Quitar marcador de ${p.sura}:${p.aya}` : full ? "Alcanzaste el máximo de 1000 marcadores" : `Marcar ${p.sura}:${p.aya}`} onClick={() => void update({ kind: "bookmark", ...p })}><Bookmark size={15} fill={marked ? "currentColor" : "none"} /><span>{marked ? "Marcada" : "Marcar"}</span></button>
      <button className="quran-accion" disabled={busy || point} title={point ? "Ya es tu punto de lectura" : "Guardar esta aleya como punto de lectura"} onClick={() => go(p, false)}><MapPin size={15} /><span>Continuar aquí</span></button>
    </div>;
  }

  const bar = <div className="quran-bar">
    <div className="quran-bar-sura">
      <button className="quran-icon" aria-label="Sura anterior" title="Sura anterior" disabled={busy || sura.number === 1} onClick={() => go({ sura: sura.number - 1, aya: 1 })}><ChevronLeft size={19} /></button>
      <button className="quran-bar-title" aria-haspopup="dialog" title="Elegir sura o aleya" onClick={() => openPanel("indice")}><b>{sura.number}. {sura.name}</b><span lang="ar" dir="rtl">{sura.arabic_name}</span><ChevronDown size={14} /></button>
      <button className="quran-icon" aria-label="Sura siguiente" title="Sura siguiente" disabled={busy || !next} onClick={() => go({ sura: sura.number + 1, aya: 1 })}><ChevronRight size={19} /></button>
    </div>
    <div className="quran-bar-progreso" title="Aleya a la vista. Desplazarte no cambia tu punto de lectura.">
      <span>Aleya {visible} de {sura.count}</span>
      <span className="quran-pista" aria-hidden="true"><span style={{ width: `${(visible / sura.count) * 100}%` }} /></span>
    </div>
    {showResume && <button className="quran-chip" disabled={busy} title={`Volver al punto de lectura: ${positionLabel(state.last!)}`} onClick={() => go(state.last!)}>Retomar {state.last!.sura}:{state.last!.aya}</button>}
    <div className="quran-bar-acciones">
      <button className="quran-icon" aria-label={`Marcadores (${state.bookmarks.length})`} title="Marcadores" onClick={() => openPanel("marcadores")}><Bookmark size={18} /></button>
      <button className="quran-icon quran-aa" aria-label="Preferencias de lectura" title="Preferencias de lectura" onClick={() => openPanel("preferencias")}>Aa</button>
      <button ref={focusButton} className="quran-icon" aria-label="Modo enfoque" title="Modo enfoque" onClick={() => setFocusMode(true)}><Maximize size={17} /></button>
    </div>
  </div>;

  const jumpMatch = /^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/.exec(filter.trim());
  const jumpSura = jumpMatch ? SURAS[Number(jumpMatch[1]) - 1] : undefined;
  const jump = jumpMatch && jumpSura && Number(jumpMatch[2]) >= 1 && Number(jumpMatch[2]) <= jumpSura.count ? { sura: jumpSura.number, aya: Number(jumpMatch[2]) } : null;
  const query = normalize(filter);
  const suraList = jump ? [] : SURAS.filter(s => !query || String(s.number) === filter.trim() || normalize(s.name).includes(query) || s.arabic_name.includes(filter.trim()));
  const sortedMarks = [...state.bookmarks].sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  const changed = !!draft && (draft.arabic_size !== state.arabic_size || draft.translation_size !== state.translation_size || draft.show_translation !== state.show_translation);
  function goAndClose(p: Position) { dialog.current?.close(); go(p); }

  const panelBody = panel === "indice" ? <>
    <input className="quran-filtro" type="search" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Sura o sura:aleya (ej. 2:255)" aria-label="Buscar sura o ir a una aleya" />
    {jump && <button className="quran-ir" disabled={busy} onClick={() => goAndClose(jump)}>Ir a <b>{positionLabel(jump)}</b><ChevronRight size={16} /></button>}
    {!jump && suraList.length === 0 && <p className="quran-vacio">No hay suras que coincidan.</p>}
    <ol className="quran-indice">{suraList.map(s => <li key={s.number}><button aria-current={s.number === sura.number ? "true" : undefined} disabled={busy} onClick={() => goAndClose({ sura: s.number, aya: 1 })}>
      <span className="quran-indice-num">{s.number}</span><span className="quran-indice-nombre"><b>{s.name}</b><span>{corpus.types[s.number] ? `${corpus.types[s.number]} · ` : ""}{s.count} aleyas</span></span><span className="quran-indice-ar" lang="ar" dir="rtl">{s.arabic_name}</span>
    </button></li>)}</ol>
  </> : panel === "marcadores" ? (sortedMarks.length === 0 ? <p className="quran-vacio">Todavía no tenés marcadores. Usá «Marcar» en una aleya.</p> : <>
    <ul className="quran-marcadores">{sortedMarks.map(p => <li key={`${p.sura}:${p.aya}`}>
      <span className="quran-marcador-ref">{p.sura}:{p.aya}<span>{SURAS[p.sura - 1].name}, aleya {p.aya}</span></span>
      <button className="secondary-button" disabled={busy} onClick={() => goAndClose(p)}>Ir</button>
      <button className="link-button" disabled={busy} aria-label={`Quitar marcador de ${positionLabel(p)}`} onClick={() => void update({ kind: "bookmark", ...p })}>Quitar</button>
    </li>)}</ul>
    {full && <p className="quran-vacio">Alcanzaste el máximo de 1000 marcadores. Quitá alguno para agregar otro.</p>}
  </>) : panel === "preferencias" ? <div className="quran-prefs">
    {!draft ? <>
      <div className="read-grid"><div><span>Modo</span><b>{state.show_translation ? "Con traducción" : "Solo árabe, de corrido"}</b></div><div><span>Árabe</span><b>{state.arabic_size} px</b></div><div><span>Español</span><b>{state.translation_size} px</b></div></div>
      <p className="nota">Papel o Noche siguen el tema claro u oscuro de Configuración → Apariencia.</p>
      <div className="editor-actions"><button className="edit-button" onClick={() => setDraft({ arabic_size: state.arabic_size, translation_size: state.translation_size, show_translation: state.show_translation })}>Editar lectura</button></div>
    </> : <fieldset className="quran-prefs-editor" disabled={busy}>
      <legend className="visually-hidden">Editar preferencias de lectura</legend>
      <div className="quran-segmentos" role="radiogroup" aria-label="Modo de lectura">
        <label><input type="radio" name="quran-modo" checked={draft.show_translation} onChange={() => setDraft({ ...draft, show_translation: true })} />Con traducción</label>
        <label><input type="radio" name="quran-modo" checked={!draft.show_translation} onChange={() => setDraft({ ...draft, show_translation: false })} />Solo árabe, de corrido</label>
      </div>
      <label>Tamaño del árabe · {draft.arabic_size} px<input type="range" min="22" max="48" value={draft.arabic_size} onChange={e => setDraft({ ...draft, arabic_size: Number(e.target.value) })} /></label>
      <label>Tamaño del español · {draft.translation_size} px<input type="range" min="12" max="24" value={draft.translation_size} onChange={e => setDraft({ ...draft, translation_size: Number(e.target.value) })} /></label>
      <p className="nota">Vista previa en el texto. En «Solo árabe», al tocar una aleya se muestra su traducción al pie.</p>
      <div className="editor-actions"><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancelar</button><button type="button" className="secondary-button" disabled={!changed} onClick={async () => { if (await update({ kind: "preferences", ...draft })) setDraft(null); }}>Guardar preferencias</button></div>
    </fieldset>}
  </div> : panel === "fuentes" ? <div className="quran-fuentes">
    <p>Textos instalados con la app, disponibles sin conexión.</p>
    <p>Árabe: <a href="https://tanzil.net" target="_blank" rel="noreferrer">Tanzil Project</a>, Uthmani 1.1, transmisión Hafs. Se conserva el texto original y su numeración. Las aperturas de basmala vienen dentro de las líneas del archivo: no se añaden ni duplican. La marca ۝ con el número de cada aleya es parte de la presentación, no del texto.</p>
    <p>Traducción: Raúl González Bórnez · es.bornez · actualización indicada por Tanzil: 15/07/2014. La edición impresa de origen y sus notas completas no están identificadas; esta vista muestra el archivo digital publicado por Tanzil. Uso no comercial, separado de la licencia MIT del código. <a href="https://tanzil.net/trans/" target="_blank" rel="noreferrer">Fuente y condiciones</a>.</p>
    <p>Fuente tipográfica: <a href="https://github.com/aliftype/amiri" target="_blank" rel="noreferrer">Amiri Quran 1.003</a> · SIL OFL 1.1. Metadatos de nombres, recuentos y tipo de revelación: Tanzil, versión 1.0, © 2008–2009 Tanzil.info, aviso cc-by del archivo original.</p>
    <details><summary>Aviso del texto árabe</summary><pre>{corpus.arabicLicense}</pre></details>
    <details><summary>Condiciones de la traducción</summary><pre>{corpus.translationTerms}</pre></details>
    <details><summary>Licencia de Amiri Quran</summary><pre>{corpus.fontLicense}</pre></details>
  </div> : null;

  const sizes = { "--quran-ar-size": `${preferences.arabic_size}px`, "--quran-es-size": `${preferences.translation_size}px` } as CSSProperties;
  return <div className="quran-reader" ref={reader} style={sizes}>
    {topbarSlot ? createPortal(bar, topbarSlot) : bar}
    <div className="quran-flotante">
      <p role="status" aria-live="polite" className={"quran-status" + (message?.error ? " error" : "")}>{busy ? "Guardando en el lector…" : message?.text ?? ""}</p>
      {recitedAya && !follow && <button className="quran-seguir" title="Volver a la aleya que se está recitando y acompañarla" onClick={followRecitation}><Volume2 size={14} />Seguir la recitación<span>{position.sura}:{recitedAya}</span></button>}
    </div>

    <header className="quran-cartela">
      <Ornament />
      <h2 lang="ar" dir="rtl">{sura.arabic_name}</h2>
      <p className="quran-cartela-nombre">{sura.number} · {sura.name}</p>
      <p className="quran-cartela-datos">{type ? `${type} · ` : ""}{sura.count} aleyas</p>
      <Ornament />
    </header>

    {preferences.show_translation
      ? <ol className="quran-aleyas" onKeyDown={onKeyNavigate}>{verses.map(v => <AyaBlock key={v.aya} verse={v} current={v.aya === position.aya} marked={isMarked(v)} point={same(state.last, v)} listening={listening(v.aya)} actions={v.aya === position.aya ? actions(v) : null} onSelect={select} />)}</ol>
      : <p className="quran-mushaf" dir="rtl" lang="ar" onKeyDown={onKeyNavigate}>{verses.map(v => <Fragment key={v.aya}><AyaInline verse={v} current={v.aya === position.aya} marked={isMarked(v)} point={same(state.last, v)} listening={listening(v.aya)} onSelect={select} />{" "}</Fragment>)}</p>}

    <section className="quran-fin-sura" aria-label="Fin de la sura">
      <Ornament />
      {next && <button className="quran-continuar" disabled={busy} onClick={() => go({ sura: next.number, aya: 1 })}><span>Continuar con</span><b>{next.number}. {next.name}</b><span className="quran-continuar-ar" lang="ar" dir="rtl">{next.arabic_name}</span><ChevronRight size={16} /></button>}
      <p className="quran-creditos">Árabe: Tanzil Uthmani 1.1. Español: Raúl González Bórnez (es.bornez de Tanzil), uso no comercial. La traducción ayuda a comprender el texto y tiene sus propias interpretaciones. <button className="link-button" onClick={() => openPanel("fuentes")}>Fuentes y condiciones</button></p>
    </section>

    {!preferences.show_translation && <div className="quran-contexto">
      <span className="quran-contexto-ref">{position.sura}:{position.aya}</span>
      <p className="quran-contexto-texto" lang="es">{verses[position.aya - 1]?.translation}</p>
      {actions(position)}
    </div>}

    {audioAvailable && <QuranAudio audio={{ ...audio, command: listen }} position={position} onLocate={locate} />}

    {focusMode && <button ref={exitFocusButton} className="quran-salir-enfoque" onClick={exitFocus}>Salir del enfoque <kbd>Esc</kbd></button>}

    <dialog ref={dialog} className="quran-panel" aria-labelledby="quran-panel-title" onClose={onPanelClosed} onClick={e => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
      {panel && <>
        <div className="quran-panel-cabecera"><h2 id="quran-panel-title">{PANEL_TITLES[panel]}</h2><button className="quran-icon" aria-label="Cerrar" onClick={() => dialog.current?.close()}><X size={18} /></button></div>
        <div className="quran-panel-cuerpo">{panelBody}</div>
      </>}
    </dialog>
  </div>;
}
