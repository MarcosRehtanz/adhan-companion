import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, BookOpen, Settings } from "lucide-react";
import { loadQuran, positionLabel, SURAS, type Corpus, type Position, type ReaderAction, type ReaderState } from "../lib/quran";
const PAGE_SIZE = 8;
type Preferences = Pick<ReaderState, "arabic_size" | "translation_size" | "show_translation">;

export default function QuranReader() {
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [state, setState] = useState<ReaderState | null>(null);
  const [position, setPosition] = useState<Position>({ sura: 1, aya: 1 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const saving = useRef(false);
  const selected = useRef<HTMLElement>(null);
  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([loadQuran(), invoke<ReaderState>("get_quran_reader")]).then(([text, saved]) => {
      if (!active) return;
      setCorpus(text); setState(saved); setPosition(saved.last ?? { sura: 1, aya: 1 });
    }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    let active = true;
    let frame = 0;
    // La fuente puede cambiar la altura de todas las aleyas. Encuadrar después
    // de cargarla y al guardar tamaños evita perder el punto de lectura.
    if (corpus && state) void document.fonts.ready.then(() => {
      if (active) frame = requestAnimationFrame(() => selected.current?.scrollIntoView({ block: "start" }));
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, [position, corpus, state?.last?.sura, state?.last?.aya, state?.arabic_size, state?.translation_size, state?.show_translation]);

  async function update(action: ReaderAction): Promise<boolean> {
    if (saving.current) return false;
    saving.current = true; setBusy(true); setMessage("");
    try {
      const saved = await invoke<ReaderState>("update_quran_reader", { action });
      setState(saved);
      setMessage(action.kind === "bookmark" ? "Marcadores actualizados." : action.kind === "position" ? "Punto de lectura guardado." : "Preferencias guardadas.");
      return true;
    } catch (e) { setMessage(`No se pudo guardar: ${e}`); return false; }
    finally { saving.current = false; setBusy(false); }
  }
  function go(p: Position) {
    if (saving.current) return;
    setPosition(p);
    void update({ kind: "position", ...p });
  }
  if (error) return <section className="panel" role="alert"><h2>No se pudo abrir el lector</h2><p>{error}</p><button className="secondary-button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></section>;
  if (!corpus || !state) return <p role="status">Abriendo los textos instalados…</p>;
  const preferences = draft ?? state;
  const sura = SURAS[position.sura - 1];
  const start = Math.floor((position.aya - 1) / PAGE_SIZE) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, sura.count);
  const verses = corpus.suras[position.sura - 1].slice(start, end);
  const first = position.sura === 1 && start === 0;
  const last = position.sura === 114 && end === sura.count;
  function nextPage(delta: number) {
    if (delta < 0) go(start > 0 ? { sura: position.sura, aya: start - PAGE_SIZE + 1 } : { sura: position.sura - 1, aya: Math.floor((SURAS[position.sura - 2].count - 1) / PAGE_SIZE) * PAGE_SIZE + 1 });
    else go(end < sura.count ? { sura: position.sura, aya: end + 1 } : { sura: position.sura + 1, aya: 1 });
  }
  return <div className="page-stack quran-reader">
    <section className="panel">
      <div className="panel-heading"><div><h2><BookOpen size={17} /> Lectura del Qur’an</h2><p>Textos instalados · disponibles sin conexión.</p></div></div>
      <div className="quran-navigation">
        <label>Sura<select value={position.sura} disabled={busy} onChange={e => go({ sura: Number(e.target.value), aya: 1 })}>{SURAS.map(s => <option value={s.number} key={s.number}>{s.number}. {s.name} · {s.arabic_name}</option>)}</select></label>
        <label>Aleya<select value={position.aya} disabled={busy} onChange={e => go({ ...position, aya: Number(e.target.value) })}>{Array.from({ length: sura.count }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
      </div>
      <p className="nota">La navegación guarda un punto de lectura por grupo de aleyas. Para recordar una aleya concreta, elegí «Continuar desde aquí».</p>
      {state.last && <p className="quran-last">Último punto guardado: <b>{positionLabel(state.last)}</b><button className="link-button" disabled={busy} onClick={() => go(state.last!)}>Retomar</button></p>}
      <details className="quran-bookmarks"><summary>Mis marcadores ({state.bookmarks.length})</summary>{state.bookmarks.length === 0 ? <p>Todavía no tenés marcadores. Usá «Marcar» en una aleya.</p> : <ul>{state.bookmarks.map(p => <li key={`${p.sura}:${p.aya}`}><button className="link-button" disabled={busy} onClick={() => go(p)}>{positionLabel(p)}</button><button className="secondary-button" disabled={busy} aria-label={`Quitar marcador de ${positionLabel(p)}`} onClick={() => void update({ kind: "bookmark", ...p })}>Quitar</button></li>)}</ul>}</details>
      <p role="status" aria-live="polite" className="quran-message">{message}</p>
    </section>
    <section className="panel setting-panel">
      <div className="panel-heading"><div><h2>Preferencias de lectura</h2><p>{state.show_translation ? "Árabe y traducción de Bórnez" : "Solo árabe"} · árabe {state.arabic_size}px · español {state.translation_size}px</p></div>{!draft && <button className="edit-button" onClick={() => setDraft({ arabic_size: state.arabic_size, translation_size: state.translation_size, show_translation: state.show_translation })}><Settings size={14} />Editar lectura</button>}</div>
      {draft && <div className="editor"><label>Tamaño del árabe · {draft.arabic_size}px<input type="range" min="22" max="48" value={draft.arabic_size} onChange={e => setDraft({ ...draft, arabic_size: Number(e.target.value) })} /></label><label>Tamaño del español · {draft.translation_size}px<input type="range" min="12" max="24" value={draft.translation_size} onChange={e => setDraft({ ...draft, translation_size: Number(e.target.value) })} /></label><label>Traducción<select value={draft.show_translation ? "show" : "hide"} onChange={e => setDraft({ ...draft, show_translation: e.target.value === "show" })}><option value="show">Mostrar español</option><option value="hide">Solo árabe</option></select></label><p className="nota">Vista previa en los textos de abajo.</p><div className="editor-actions"><button className="secondary-button" disabled={busy} onClick={() => setDraft(null)}>Cancelar</button><button className="secondary-button" disabled={busy} onClick={async () => { if (await update({ kind: "preferences", ...draft })) setDraft(null); }}>Guardar preferencias</button></div></div>}
    </section>
    <section className="panel quran-text-panel">
      <div className="panel-heading"><div><h2>{sura.number}. {sura.name}</h2><p>Aleyas {start + 1}–{end} de {sura.count} · el borde identifica tu punto actual.</p></div><span lang="ar" dir="rtl" className="quran-sura-name">{sura.arabic_name}</span></div>
      <p className="nota">Árabe: Tanzil Uthmani 1.1. Español: Raúl González Bórnez, versión es.bornez de Tanzil. La traducción ayuda a comprender el texto y tiene sus propias interpretaciones.</p>
      <div className="quran-verses">{verses.map(v => {
        const marked = state.bookmarks.some(p => p.sura === v.sura && p.aya === v.aya);
        return <article key={v.aya} ref={v.aya === position.aya ? selected : undefined} className={`quran-verse ${v.aya === position.aya ? "current" : ""}`} aria-label={`Sura ${v.sura}, aleya ${v.aya}`}>
          <div className="quran-verse-heading"><b>{v.sura}:{v.aya}</b><div><button className="link-button" disabled={busy} onClick={() => go({ sura: v.sura, aya: v.aya })}>Continuar desde aquí</button><button className="secondary-button" aria-pressed={marked} aria-label={`${marked ? "Quitar marcador" : "Marcar"} ${v.sura}:${v.aya}`} disabled={busy} onClick={() => void update({ kind: "bookmark", sura: v.sura, aya: v.aya })}><Bookmark size={14} fill={marked ? "currentColor" : "none"} />{marked ? "Marcado" : "Marcar"}</button></div></div>
          <p className="quran-arabic" dir="rtl" lang="ar" style={{ fontSize: preferences.arabic_size }}>{v.arabic}</p>
          {preferences.show_translation && <p className="quran-translation" dir="ltr" lang="es" style={{ fontSize: preferences.translation_size }}>{v.translation}</p>}
        </article>;
      })}</div>
      <div className="quran-paging"><button className="secondary-button" disabled={busy || first} onClick={() => nextPage(-1)}>← Anteriores</button><span>{start + 1}–{end} / {sura.count}</span><button className="secondary-button" disabled={busy || last} onClick={() => nextPage(1)}>Siguientes →</button></div>
    </section>
    <details className="panel quran-sources"><summary>Fuentes, versiones y condiciones de uso</summary>
      <p>Árabe: <a href="https://tanzil.net" target="_blank" rel="noreferrer">Tanzil Project</a>, Uthmani 1.1, transmisión Hafs. Se conserva el texto original y su numeración. Las aperturas de basmala vienen dentro de las líneas del archivo: no se añaden ni duplican.</p>
      <p>Traducción: Raúl González Bórnez · es.bornez · actualización indicada por Tanzil: 15/07/2014. La edición impresa de origen y sus notas completas no están identificadas; esta vista muestra el archivo digital publicado por Tanzil. Uso no comercial, separado de la licencia MIT del código. <a href="https://tanzil.net/trans/" target="_blank" rel="noreferrer">Fuente y condiciones</a>.</p>
      <p>Fuente tipográfica: <a href="https://github.com/aliftype/amiri" target="_blank" rel="noreferrer">Amiri Quran 1.003</a> · SIL OFL 1.1. Metadatos de nombres y recuentos: Tanzil, versión 1.0, © 2008–2009 Tanzil.info, aviso cc-by del archivo original.</p>
      <details><summary>Aviso del texto árabe</summary><pre>{corpus.arabicLicense}</pre></details>
      <details><summary>Condiciones de la traducción</summary><pre>{corpus.translationTerms}</pre></details>
      <details><summary>Licencia de Amiri Quran</summary><pre>{corpus.fontLicense}</pre></details>
    </details>
  </div>;
}
