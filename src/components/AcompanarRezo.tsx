// Acompañar el rezo: se elige cómo avanzar, después una pantalla completa sigue el rezo y al final
// se puede marcar en el registro.
//
// Estados y transiciones (los maneja GuiaRezo):
// - guía → preparar: la hoja «Antes de empezar» (modo de avance y lo que va debajo del árabe).
//   Cancelar, Escape o tocar fuera vuelven a la guía sin cambiar nada.
// - preparar → rezando: «tocar» recorre los pasos visibles de a uno; «contador» solo cuenta rakʿas.
//   La posición no se guarda: si la app se cierra, el rezo se vuelve a empezar desde la guía.
//   «Terminar» (o Escape) sale sin marcar. El modo y las opciones quedan en localStorage.
// - rezando → fin: el último toque (tocar) o «Terminé» (contador).
// - fin: marcar usa mark_prayed, que en el core alterna (si ya estaba marcado, lo desmarca) y
//   rechaza rezos cuyo horario no llegó. Por eso el botón solo aparece si el rezo de hoy no está
//   marcado y su horario ya llegó; el éxito se muestra cuando el core confirma la escritura.
//   Combinar (si la escuela lo permite) vuelve a preparar con el rezo siguiente.
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Corpus } from "../lib/quran";
import type { Schedule } from "../types";
import { prayerReached } from "../lib/prayers";
import { COMBINAR, ESCUELAS, pasosEnOrden, REZOS, visible, type Avance, type Escuela, type Paso, type Rezo, type RezoArmado, type TextoFormula } from "../lib/guia";
import { CorpusBloque, FormulaBloque, PosturaIcono } from "./GuiaBloques";

export interface Debajo { tr: boolean; es: boolean }

/** Mantiene la pantalla encendida donde el WebView lo permite; si no, no hace nada. */
function usePantallaEncendida() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null, vivo = true;
    const pedir = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(l => { if (vivo) lock = l; else void l.release(); }).catch(() => {});
    };
    pedir();
    document.addEventListener("visibilitychange", pedir);
    return () => { vivo = false; document.removeEventListener("visibilitychange", pedir); void lock?.release().catch(() => {}); };
  }, []);
}

/** Abre el dialog como modal al montarse: el resto de la app queda inerte mientras tanto. Con
 *  `enfocar`, el foco queda en el dialog y no en su primer botón (si no, la barra espaciadora
 *  activaría «Terminar» en vez de avanzar). */
function useModal(enfocar = false) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) { d.showModal(); if (enfocar) d.focus(); } }, [enfocar]);
  return ref;
}

export function PrepararHoja({ armado, escuela, completo, android, avance, debajo, onAvance, onDebajo, onCancelar, onEmpezar }: {
  armado: RezoArmado; escuela: Escuela; completo: boolean; android: boolean; avance: Avance; debajo: Debajo;
  onAvance: (a: Avance) => void; onDebajo: (d: Debajo) => void; onCancelar: () => void; onEmpezar: () => void;
}) {
  const ref = useModal();
  const modos: { id: Avance | "sensor"; nombre: string; tipo: string; texto: string }[] = [
    { id: "tocar", nombre: "Tocar para avanzar", tipo: "manual", texto: "Un toque en cualquier parte de la pantalla pasa al paso siguiente." },
    { id: "contador", nombre: "Contador de rakʿas", tipo: "manual", texto: "Solo el número de la rakʿa, grande. Un toque suma una al levantarte." },
    ...(android ? [{ id: "sensor" as const, nombre: "Sensor de proximidad", tipo: "automático", texto: "Todavía no está disponible en esta versión." }] : []),
  ];
  return <dialog ref={ref} className="guia-hoja" aria-labelledby="guia-hoja-titulo"
    onCancel={e => { e.preventDefault(); onCancelar(); }} onClick={e => { if (e.target === e.currentTarget) onCancelar(); }}>
    <h2 id="guia-hoja-titulo">Antes de empezar</h2>
    <p className="guia-detalle">{REZOS[armado.rezo].nombre} · {armado.total} rakʿas · {ESCUELAS[escuela].nombre}{escuela === "jafari" ? " (Sistani)" : ""} · {completo ? "completo" : "solo lo obligatorio"}</p>
    <p className="guia-hoja-grupo" id="guia-hoja-avance">Cómo avanza</p>
    <div className="guia-modos" role="radiogroup" aria-labelledby="guia-hoja-avance">
      {modos.map(m => {
        const disponible = m.id !== "sensor";
        return <label key={m.id} className={"guia-modo" + (avance === m.id ? " elegido" : "") + (disponible ? "" : " no-disponible")}>
          <input type="radio" name="guia-avance" checked={avance === m.id} disabled={!disponible} onChange={() => { if (m.id !== "sensor") onAvance(m.id); }} />
          <span><b>{m.nombre}<span className="guia-modo-tipo">{m.tipo}</span></b>{m.texto}</span>
        </label>;
      })}
    </div>
    <p className="guia-hoja-grupo">Debajo del árabe</p>
    <div className="guia-selector">
      <button className="guia-chip" aria-pressed={debajo.tr} onClick={() => onDebajo({ ...debajo, tr: !debajo.tr })}>Transliteración</button>
      <button className="guia-chip" aria-pressed={debajo.es} onClick={() => onDebajo({ ...debajo, es: !debajo.es })}>Traducción</button>
    </div>
    {!("wakeLock" in navigator) && <p className="guia-pendiente">Este equipo puede apagar la pantalla durante el rezo.</p>}
    <div className="guia-hoja-acciones">
      <button className="guia-boton secundario" onClick={onCancelar}>Cancelar</button>
      <button className="guia-boton" onClick={onEmpezar}>Empezar</button>
    </div>
  </dialog>;
}

function Formulas({ p, completo, textos, corpus, debajo }: { p: Paso; completo: boolean; textos: Record<string, TextoFormula>; corpus: Corpus | null; debajo: Debajo }) {
  const ver = (lista: Paso["formulas"]) => lista.filter(f => visible(f.estatus, completo));
  return <>
    {ver(p.formulas.filter(f => f.antes)).map((f, i) => <FormulaBloque key={"a" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
    {p.corpus?.map(id => <CorpusBloque key={id} id={id} corpus={corpus} es={debajo.es} />)}
    {ver(p.formulas.filter(f => !f.antes)).map((f, i) => <FormulaBloque key={"p" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
    {ver(p.formulasDespues ?? []).map((f, i) => <FormulaBloque key={"d" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
  </>;
}

type Marca = { estado: "listo" } | { estado: "marcando" } | { estado: "marcado" } | { estado: "error"; mensaje: string };

function MarcarRezo({ nombre, schedule, scheduleError, onMarked }: { nombre: string; schedule: Schedule | null; scheduleError: string; onMarked: () => void }) {
  const [marca, setMarca] = useState<Marca>({ estado: "listo" });
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  if (marca.estado === "marcado") return <p className="acompanar-estado" role="status">{nombre} quedó marcado como rezado.</p>;
  if (scheduleError) return <p className="acompanar-estado" role="alert">No se pudo consultar el registro de hoy: {scheduleError}. Se puede marcar desde Hoy.</p>;
  if (!schedule) return <p className="acompanar-estado" role="status">Consultando el registro de hoy…</p>;
  if (schedule.marked.includes(nombre)) return <p className="acompanar-estado">{nombre} ya está marcado en el registro de hoy.</p>;
  if (!prayerReached(schedule, schedule.date, nombre)) {
    const hora = schedule.prayers.find(s => s.name === nombre)?.hhmm;
    return <p className="acompanar-estado">Todavía no es la hora de {nombre}{hora ? ` (${hora})` : ""}: el registro no deja marcarlo antes. Se puede marcar desde Hoy cuando llegue.</p>;
  }
  async function marcar() {
    if (!schedule || marca.estado === "marcando") return;
    setMarca({ estado: "marcando" });
    try { await invoke("mark_prayed", { date: schedule.date, prayer: nombre }); if (montado.current) setMarca({ estado: "marcado" }); onMarked(); }
    catch (e) { if (montado.current) setMarca({ estado: "error", mensaje: String(e) }); }
  }
  return <>
    <button className="guia-boton" disabled={marca.estado === "marcando"} onClick={() => void marcar()}>{marca.estado === "marcando" ? "Marcando…" : `Marcar ${nombre} como rezado`}</button>
    {marca.estado === "error" && <p className="acompanar-estado" role="alert">No se pudo marcar: {marca.mensaje}</p>}
  </>;
}

export function AcompanarRezo({ armado, escuela, completo, viajero, avance, debajo, textos, corpus, schedule, scheduleError, onMarked, onSalir, onCombinar }: {
  armado: RezoArmado; escuela: Escuela; completo: boolean; viajero: boolean; avance: Avance; debajo: Debajo;
  textos: Record<string, TextoFormula>; corpus: Corpus | null; schedule: Schedule | null; scheduleError: string;
  onMarked: () => void; onSalir: () => void; onCombinar: (siguiente: Rezo) => void;
}) {
  const ref = useModal(true);
  usePantallaEncendida();
  const pasos = useMemo(() => pasosEnOrden(armado, completo), [armado, completo]);
  const [i, setI] = useState(0);
  const [rakat, setRakat] = useState(1);
  const [fin, setFin] = useState(false);
  const nombre = REZOS[armado.rezo].nombre;
  const actual = pasos[Math.min(i, pasos.length - 1)];
  const enRakat = avance === "contador" ? rakat : actual.rakat;

  const siguiente = () => {
    if (fin) return;
    if (avance === "contador") setRakat(n => Math.min(n + 1, armado.total));
    else if (i + 1 < pasos.length) setI(i + 1);
    else setFin(true);
  };
  const anterior = () => { if (avance === "contador") setRakat(n => Math.max(1, n - 1)); else setI(n => Math.max(0, n - 1)); };
  // En escritorio: espacio, Enter o flecha derecha avanzan; flecha izquierda vuelve.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.("button, a, input")) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); siguiente(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); anterior(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const parar = (accion: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); accion(); };
  const puntos = <div className="acompanar-puntos" aria-hidden="true">
    {armado.rakats.map(k => <span key={k.rakat} className={fin || k.rakat < enRakat ? "hecha" : k.rakat === enRakat ? "actual" : ""} />)}
  </div>;
  const sigue: Rezo | null = armado.rezo === "dhuhr" ? "asr" : armado.rezo === "maghrib" ? "isha" : null;
  const c = COMBINAR[escuela];
  const combinar = sigue && (c.puede === true || (c.puede === "causa" && viajero)) ? sigue : null;

  return <dialog ref={ref} tabIndex={-1} className={"acompanar" + (fin ? " fin" : "")} aria-label={`Acompañando ${nombre}`}
    onCancel={e => { e.preventDefault(); onSalir(); }} onClick={siguiente}>
    {fin ? <div className="acompanar-fin">
      {puntos}
      <PosturaIcono postura="sentado" className="acompanar-postura" />
      <h2>{nombre} completo</h2>
      <p>{armado.total} rakʿas · {ESCUELAS[escuela].nombre}</p>
      <div className="acompanar-acciones" onClick={e => e.stopPropagation()}>
        <MarcarRezo nombre={nombre} schedule={schedule} scheduleError={scheduleError} onMarked={onMarked} />
        {combinar && <button className="guia-boton secundario" onClick={() => onCombinar(combinar)}>Seguir con {REZOS[combinar].nombre} (combinar)</button>}
        <button className="guia-boton texto" onClick={onSalir}>Volver a la guía</button>
      </div>
    </div> : <>
      <div className="acompanar-barra">
        <span><b>{nombre}</b> · rakʿa {enRakat} de {armado.total}</span>
        <button className="acompanar-salir" onClick={parar(onSalir)}>Terminar</button>
      </div>
      {puntos}
      {avance === "contador" ? <div className="acompanar-centro contador" aria-live="polite">
        <p className="acompanar-numero">{rakat}</p>
        <p className="acompanar-de">de {armado.total} rakʿas</p>
        <p className="acompanar-detalle">{rakat === armado.total ? "Última rakʿa: tashahhud y taslīm." : rakat === 2 ? "Esta rakʿa termina con el tashahhud. Al levantarte, tocá para sumar una." : "Al levantarte, tocá para sumar una."}</p>
      </div> : <>
        <div className="acompanar-ritmo" aria-hidden="true">
          {actual.delRakat.map((p, j) => <PosturaIcono key={j} postura={p.postura} className={j < actual.indice ? "hecha" : j === actual.indice ? "actual" : ""} />)}
        </div>
        <div className="acompanar-centro" aria-live="polite">
          <PosturaIcono postura={actual.paso.postura} className="acompanar-postura" />
          <p className="acompanar-nombre">{actual.paso.nombre}</p>
          {actual.paso.voz && <p className="acompanar-detalle">en voz {actual.paso.voz}</p>}
          <p className="acompanar-detalle">{actual.paso.detalle}</p>
          <Formulas p={actual.paso} completo={completo} textos={textos} corpus={corpus} debajo={debajo} />
        </div>
      </>}
      <div className="acompanar-pie">
        <button className="acompanar-atras" disabled={avance === "contador" ? rakat === 1 : i === 0} onClick={parar(anterior)}>{avance === "contador" ? "Restar una" : "Paso anterior"}</button>
        <span>{avance === "contador" ? "Tocá en cualquier parte al levantarte" : `Tocá en cualquier parte para seguir · paso ${i + 1} de ${pasos.length}`}</span>
        {avance === "contador" && <button className="acompanar-atras" onClick={parar(() => setFin(true))}>Terminé</button>}
      </div>
    </>}
  </dialog>;
}
