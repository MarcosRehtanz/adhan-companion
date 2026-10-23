// Acompañar el rezo: se elige cómo avanzar, después una pantalla completa sigue el rezo y al final
// se puede marcar en el registro.
//
// Estados y transiciones (los maneja GuiaRezo):
// - guía → preparar: la hoja «Antes de empezar» (modo de avance y lo que va debajo del árabe).
//   Cancelar, Escape o tocar fuera vuelven a la guía sin cambiar nada.
// - preparar → rezando: «tocar» recorre los pasos visibles de a uno (en ja'fari, desde el adhan y la
//   iqama hasta la taʿqībāt); «contador» solo cuenta rakʿas y, con «Terminé», sigue con la taʿqībāt.
//   Un paso con cuenta (tasbīḥ de Fátima) suma un toque por repetición y avanza al completarla.
//   La posición no se guarda: si la app se cierra, el rezo se vuelve a empezar desde la guía.
//   «Terminar» (o Escape) sale sin marcar. El modo y las opciones quedan en localStorage.
//   «sensor» (solo Android) avanza con toques como «tocar» y, además, cada postración detectada
//   lleva al próximo sujūd y levantarse pasa al paso siguiente. Estados del sensor: apagado,
//   activando, lejos, postración detectada, error (sigue con toques). En Android la pantalla
//   queda encendida mientras dura el acompañamiento, en cualquier modo; al salir se suelta.
// - rezando → fin: el último toque (tocar) o «Terminé» (contador).
// - fin: marcar usa mark_prayed, que en el core alterna (si ya estaba marcado, lo desmarca) y
//   rechaza rezos cuyo horario no llegó. Por eso el botón solo aparece si el rezo de hoy no está
//   marcado y su horario ya llegó; el éxito se muestra cuando el core confirma la escritura.
//   Combinar (si la escuela lo permite): «Marcar X y seguir con Y» marca el primero y vuelve a
//   preparar con el siguiente, unido (solo iqama). El segundo se marca con `combinado`: el core lo
//   permite desde el horario del primero si el primero ya está marcado.
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Corpus } from "../lib/quran";
import type { Schedule } from "../types";
import { prayerReached } from "../lib/prayers";
import { COMBINAR, ESCUELAS, pasosEnOrden, REZOS, visible, type Avance, type Escuela, type Paso, type Rezo, type RezoArmado, type TextoFormula } from "../lib/guia";

import { CorpusBloque, FormulaBloque, PosturaIcono } from "./GuiaBloques";

/** El rezo al que se une Asr o Isha (el mismo par que valida el core). */
const UNIDO_A: Partial<Record<string, string>> = { Asr: "Dhuhr", Isha: "Maghrib" };

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

type Sensor = { estado: "apagado" | "activando" | "lejos" | "cerca" } | { estado: "error"; mensaje: string };
interface Lectura { near: boolean; since: number; elapsed: number }
// Cerca durante 0,7 s es una postración (no una mano que pasa); lejos 0,4 s después, levantarse.
const CERCA_MS = 700, LEJOS_MS = 400, LECTURA_MS = 250;

/** En Android: pantalla encendida mientras dura el acompañamiento y, con el sensor, avisos de cada
 *  postración y de cada vez que la persona se levanta. Al desmontarse suelta las dos cosas. */
function useAcompanarAndroid(android: boolean, conSensor: boolean, alPostrarse: () => void, alLevantarse: () => void): Sensor {
  const [sensor, setSensor] = useState<Sensor>({ estado: android && conSensor ? "activando" : "apagado" });
  const avisos = useRef({ alPostrarse, alLevantarse });
  avisos.current = { alPostrarse, alLevantarse };
  useEffect(() => {
    if (!android) return;
    let vivo = true, timer = 0, leyendo = false, postrado: number | null = null, levantado: number | null = null;
    const fallar = (e: unknown) => { if (!vivo) return; window.clearInterval(timer); setSensor({ estado: "error", mensaje: String(e) }); };
    const leer = () => {
      if (leyendo) return;
      leyendo = true;
      invoke<Lectura>("android_acompanar", { action: "read" }).then(r => {
        if (!vivo) return;
        if (r.near && r.elapsed >= CERCA_MS && postrado !== r.since) { postrado = r.since; avisos.current.alPostrarse(); }
        else if (!r.near && r.elapsed >= LEJOS_MS && postrado !== null && r.since > postrado && levantado !== r.since) { levantado = r.since; avisos.current.alLevantarse(); }
        setSensor({ estado: r.near && postrado === r.since ? "cerca" : "lejos" });
      }).catch(fallar).finally(() => { leyendo = false; });
    };
    invoke("android_acompanar", { action: "start", sensor: conSensor })
      .then(() => { if (vivo && conSensor) timer = window.setInterval(leer, LECTURA_MS); })
      .catch(e => { if (conSensor) fallar(e); });
    return () => { vivo = false; window.clearInterval(timer); void invoke("android_acompanar", { action: "stop" }).catch(() => {}); };
  }, [android, conSensor]);
  return sensor;
}

type Disponible = "consultando" | "si" | "no" | "error";
/** Si este teléfono tiene sensor de proximidad (solo se consulta en Android). */
function useHaySensor(android: boolean): Disponible {
  const [hay, setHay] = useState<Disponible>(android ? "consultando" : "no");
  useEffect(() => {
    if (!android) return;
    let vivo = true;
    invoke<{ sensor: boolean }>("android_acompanar", { action: "status" })
      .then(r => { if (vivo) setHay(r.sensor ? "si" : "no"); })
      .catch(() => { if (vivo) setHay("error"); });
    return () => { vivo = false; };
  }, [android]);
  return hay;
}

/** Abre el dialog como modal al montarse: el resto de la app queda inerte mientras tanto. Con
 *  `enfocar`, el foco queda en el dialog y no en su primer botón (si no, la barra espaciadora
 *  activaría «Terminar» en vez de avanzar). */
function useModal(enfocar = false) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) { d.showModal(); if (enfocar) d.focus(); } }, [enfocar]);
  return ref;
}

export function PrepararHoja({ armado, escuela, completo, combinado, android, avance, debajo, onAvance, onDebajo, onCancelar, onEmpezar }: {
  armado: RezoArmado; escuela: Escuela; completo: boolean; combinado: boolean; android: boolean; avance: Avance; debajo: Debajo;
  onAvance: (a: Avance) => void; onDebajo: (d: Debajo) => void; onCancelar: () => void; onEmpezar: () => void;
}) {
  const ref = useModal();
  const haySensor = useHaySensor(android);
  // Si el modo guardado es el sensor y este teléfono no lo tiene, se vuelve a «tocar».
  useEffect(() => { if (avance === "sensor" && (haySensor === "no" || haySensor === "error")) onAvance("tocar"); }, [avance, haySensor, onAvance]);
  const textoSensor = { consultando: "Consultando si este teléfono tiene sensor…", si: "Con el teléfono en el suelo, delante del lugar de la postración: cada postración lleva al sujūd y, al levantarte, sigue solo. Los demás pasos, con un toque.", no: "Este teléfono no tiene sensor de proximidad.", error: "No se pudo consultar el sensor de este teléfono." }[haySensor];
  const modos: { id: Avance; nombre: string; tipo: string; texto: string; disponible: boolean }[] = [
    { id: "tocar", nombre: "Tocar para avanzar", tipo: "manual", texto: "Un toque en cualquier parte de la pantalla pasa al paso siguiente.", disponible: true },
    { id: "contador", nombre: "Contador de rakʿas", tipo: "manual", texto: "Solo el número de la rakʿa, grande. Un toque suma una al levantarte.", disponible: true },
    ...(android ? [{ id: "sensor" as const, nombre: "Sensor de proximidad", tipo: "automático", texto: textoSensor, disponible: haySensor === "si" }] : []),
  ];
  return <dialog ref={ref} className="guia-hoja" aria-labelledby="guia-hoja-titulo"
    onCancel={e => { e.preventDefault(); onCancelar(); }} onClick={e => { if (e.target === e.currentTarget) onCancelar(); }}>
    <h2 id="guia-hoja-titulo">Antes de empezar</h2>
    <p className="guia-detalle">{REZOS[armado.rezo].nombre} · {armado.total} rakʿas · {ESCUELAS[escuela].nombre}{armado.practica ? " · mi práctica" : `${escuela === "jafari" ? " (Sistani)" : ""} · ${completo ? "completo" : "solo lo obligatorio"}`}{combinado ? " · unido al anterior: solo iqama" : ""}</p>
    <p className="guia-hoja-grupo" id="guia-hoja-avance">Cómo avanza</p>
    <div className="guia-modos" role="radiogroup" aria-labelledby="guia-hoja-avance">
      {modos.map(m => {
        return <label key={m.id} className={"guia-modo" + (avance === m.id ? " elegido" : "") + (m.disponible ? "" : " no-disponible")}>
          <input type="radio" name="guia-avance" checked={avance === m.id} disabled={!m.disponible} onChange={() => onAvance(m.id)} />
          <span><b>{m.nombre}<span className="guia-modo-tipo">{m.tipo}</span></b>{m.texto}</span>
        </label>;
      })}
    </div>
    <p className="guia-hoja-grupo">Debajo del árabe</p>
    <div className="guia-selector">
      <button className="guia-chip" aria-pressed={debajo.tr} onClick={() => onDebajo({ ...debajo, tr: !debajo.tr })}>Transliteración</button>
      <button className="guia-chip" aria-pressed={debajo.es} onClick={() => onDebajo({ ...debajo, es: !debajo.es })}>Traducción</button>
    </div>
    {!android && !("wakeLock" in navigator) && <p className="guia-pendiente">Este equipo puede apagar la pantalla durante el rezo.</p>}
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
    {p.corpus?.map(id => <CorpusBloque key={id} id={id} corpus={corpus} textos={textos} tr={debajo.tr} es={debajo.es} />)}
    {ver(p.formulas.filter(f => !f.antes)).map((f, i) => <FormulaBloque key={"p" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
    {ver(p.formulasDespues ?? []).map((f, i) => <FormulaBloque key={"d" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
  </>;
}

type Marca = { estado: "listo" } | { estado: "marcando" } | { estado: "marcado" } | { estado: "error"; mensaje: string };

function MarcarRezo({ nombre, combinado, secundario = false, schedule, scheduleError, onMarked }: { nombre: string; combinado: boolean; secundario?: boolean; schedule: Schedule | null; scheduleError: string; onMarked: () => void }) {
  const [marca, setMarca] = useState<Marca>({ estado: "listo" });
  const montado = useRef(true);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);
  if (marca.estado === "marcado") return <p className="acompanar-estado" role="status">{nombre} quedó marcado como rezado.</p>;
  if (scheduleError) return <p className="acompanar-estado" role="alert">No se pudo consultar el registro de hoy: {scheduleError}. Se puede marcar desde Hoy.</p>;
  if (!schedule) return <p className="acompanar-estado" role="status">Consultando el registro de hoy…</p>;
  if (schedule.marked.includes(nombre)) return <p className="acompanar-estado">{nombre} ya está marcado en el registro de hoy.</p>;
  const previo = combinado ? UNIDO_A[nombre] : undefined;
  const unido = !!previo && !prayerReached(schedule, schedule.date, nombre);
  if (unido && !schedule.marked.includes(previo!)) return <p className="acompanar-estado">Para marcar {nombre} unido a {previo}, primero tiene que estar marcado {previo}.</p>;
  if (!prayerReached(schedule, schedule.date, unido ? previo! : nombre)) {
    const hora = schedule.prayers.find(s => s.name === nombre)?.hhmm;
    return <p className="acompanar-estado">Todavía no es la hora de {nombre}{hora ? ` (${hora})` : ""}: el registro no deja marcarlo antes. Se puede marcar desde Hoy cuando llegue.</p>;
  }
  async function marcar() {
    if (!schedule || marca.estado === "marcando") return;
    setMarca({ estado: "marcando" });
    try { await invoke("mark_prayed", { date: schedule.date, prayer: nombre, combinado: unido }); if (montado.current) setMarca({ estado: "marcado" }); onMarked(); }
    catch (e) { if (montado.current) setMarca({ estado: "error", mensaje: String(e) }); }
  }
  return <>
    {unido && <p className="acompanar-estado">Lo rezaste unido a {previo}: se marca aunque todavía no sea su hora. En el rito ja'fari los dos comparten el tiempo (ishtirak).</p>}
    <button className={"guia-boton" + (secundario ? " secundario" : "")} disabled={marca.estado === "marcando"} onClick={() => void marcar()}>{marca.estado === "marcando" ? "Marcando…" : secundario ? `Marcar solo ${nombre}` : `Marcar ${nombre} como rezado`}</button>
    {marca.estado === "error" && <p className="acompanar-estado" role="alert">No se pudo marcar: {marca.mensaje}</p>}
  </>;
}

/** «Marcar X y seguir con Y»: marca el primero (si hace falta y se puede) y sigue con el combinado. */
function MarcarYSeguir({ nombre, siguiente, schedule, onMarked, onCombinar }: { nombre: string; siguiente: Rezo; schedule: Schedule | null; onMarked: () => void; onCombinar: (r: Rezo) => void }) {
  const [error, setError] = useState("");
  const [marcando, setMarcando] = useState(false);
  const yaMarcado = !!schedule?.marked.includes(nombre);
  const llego = !!schedule && prayerReached(schedule, schedule.date, nombre);
  async function seguir() {
    if (!schedule || marcando) return;
    if (!yaMarcado) {
      setMarcando(true); setError("");
      try { await invoke("mark_prayed", { date: schedule.date, prayer: nombre }); onMarked(); }
      catch (e) { setError(String(e)); setMarcando(false); return; }
    }
    onCombinar(siguiente);
  }
  if (!schedule || (!yaMarcado && !llego)) return null;
  return <>
    <button className="guia-boton" disabled={marcando} onClick={() => void seguir()}>{marcando ? "Marcando…" : yaMarcado ? `Seguir con ${REZOS[siguiente].nombre}` : `Marcar ${nombre} y seguir con ${REZOS[siguiente].nombre}`}</button>
    {error && <p className="acompanar-estado" role="alert">No se pudo marcar: {error}</p>}
  </>;
}

export function AcompanarRezo({ armado, escuela, completo, combinado, viajero, android, avance: avanceElegido, debajo, textos, corpus, schedule, scheduleError, onMarked, onSalir, onCombinar }: {
  armado: RezoArmado; escuela: Escuela; completo: boolean; combinado: boolean; viajero: boolean; android: boolean; avance: Avance; debajo: Debajo;
  textos: Record<string, TextoFormula>; corpus: Corpus | null; schedule: Schedule | null; scheduleError: string;
  onMarked: () => void; onSalir: () => void; onCombinar: (siguiente: Rezo) => void;
}) {
  const ref = useModal(true);
  usePantallaEncendida();
  const pasos = useMemo(() => pasosEnOrden(armado, completo), [armado, completo]);
  const [i, setI] = useState(0);
  const [rakat, setRakat] = useState(1);
  const [fin, setFin] = useState(false);
  // Con el contador de rakʿas, «Terminé» sigue paso a paso con la taʿqībāt.
  const [enTaqibat, setEnTaqibat] = useState(false);
  const [cuenta, setCuenta] = useState(0);
  const avance: Avance = enTaqibat ? "tocar" : avanceElegido;
  const nombre = REZOS[armado.rezo].nombre;
  const actual = pasos[Math.min(i, pasos.length - 1)];
  const enRakat = avance === "contador" ? rakat : actual.rakat;
  const primeraTaqiba = pasos.findIndex(x => x.rakat > armado.total);
  const fases = actual.paso.cuenta;
  const totalCuenta = fases?.reduce((a, f) => a + f.veces, 0) ?? 0;

  const irA = (n: number) => { setI(n); setCuenta(0); };
  const siguiente = () => {
    if (fin) return;
    if (avance === "contador") setRakat(n => Math.min(n + 1, armado.total));
    else if (fases && cuenta < totalCuenta) setCuenta(c => c + 1);
    else if (i + 1 < pasos.length) irA(i + 1);
    else setFin(true);
  };
  const anterior = () => {
    if (avance === "contador") setRakat(n => Math.max(1, n - 1));
    else if (fases && cuenta > 0) setCuenta(c => c - 1);
    else irA(Math.max(0, i - 1));
  };
  const termine = () => { if (primeraTaqiba >= 0) { setEnTaqibat(true); irA(primeraTaqiba); } else setFin(true); };
  // Sensor: una postración lleva al próximo sujūd (o se queda si ya está en uno); levantarse
  // desde un sujūd pasa al paso siguiente. Los toques siguen funcionando igual.
  const sensor = useAcompanarAndroid(android, avanceElegido === "sensor", () => {
    if (fin) return;
    const destino = pasos.findIndex((x, j) => j >= i && x.paso.postura === "postrado");
    if (destino > i) irA(destino);
  }, () => {
    if (!fin && actual.paso.postura === "postrado") { if (i + 1 < pasos.length) irA(i + 1); else setFin(true); }
  });
  const textoSensor = sensor.estado === "activando" ? "Activando el sensor…" : sensor.estado === "cerca" ? "Postración detectada" : sensor.estado === "lejos" ? "Sensor activo: cada postración avanza sola" : sensor.estado === "error" ? `Sensor sin lectura (${sensor.mensaje}): seguí con toques` : "";
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
        {combinar && <MarcarYSeguir nombre={nombre} siguiente={combinar} schedule={schedule} onMarked={onMarked} onCombinar={onCombinar} />}
        <MarcarRezo nombre={nombre} combinado={combinado} secundario={!!combinar} schedule={schedule} scheduleError={scheduleError} onMarked={onMarked} />
        <button className="guia-boton texto" onClick={onSalir}>Volver a la guía</button>
      </div>
    </div> : <>
      <div className="acompanar-barra">
        <span><b>{nombre}</b> · {enRakat === 0 ? "antes del rezo" : enRakat > armado.total ? "taʿqībāt" : `rakʿa ${enRakat} de ${armado.total}`}</span>
        <button className="acompanar-salir" onClick={parar(onSalir)}>Terminar</button>
      </div>
      {puntos}
      {avance === "contador" ? <div className="acompanar-centro contador" aria-live="polite">
        <p className="acompanar-numero">{rakat}</p>
        <p className="acompanar-de">de {armado.total} rakʿas</p>
        <p className="acompanar-detalle">{rakat === armado.total ? "Última rakʿa: tashahhud y taslīm." : rakat === 2 ? "Esta rakʿa termina con el tashahhud. Al levantarte, tocá para sumar una." : "Al levantarte, tocá para sumar una."}</p>
      </div> : fases ? (() => {
        let f = 0, dentro = Math.min(cuenta, totalCuenta);
        while (f < fases.length - 1 && dentro >= fases[f].veces) { dentro -= fases[f].veces; f++; }
        const listo = cuenta >= totalCuenta;
        return <div className="acompanar-centro contador" aria-live="polite">
          <p className="acompanar-nombre">{actual.paso.nombre}</p>
          <div className="acompanar-fases">{fases.map((x, j) => <span key={j} className={j < f || listo ? "hecha" : j === f ? "actual" : ""}>{x.dice} <b>{x.veces}</b></span>)}</div>
          <p className="acompanar-numero">{listo ? totalCuenta : dentro}</p>
          <p className="acompanar-de">{listo ? "Completo. Tocá para seguir." : `de ${fases[f].veces} · ${fases[f].dice}`}</p>
        </div>;
      })() : <>
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
        <button className="acompanar-atras" disabled={avance === "contador" ? rakat === 1 : i === 0 && cuenta === 0} onClick={parar(anterior)}>{avance === "contador" ? "Restar una" : "Paso anterior"}</button>
        <span>{avance === "contador" ? "Tocá en cualquier parte al levantarte" : fases ? `Un toque por cada dhikr · ${Math.min(cuenta, totalCuenta)} de ${totalCuenta}` : avance === "sensor" ? <><span className={"acompanar-sensor " + sensor.estado} role={sensor.estado === "error" ? "alert" : undefined}>{textoSensor}</span> · paso {i + 1} de {pasos.length}</> : `Tocá en cualquier parte para seguir · paso ${i + 1} de ${pasos.length}`}</span>
        {avance === "contador" && <button className="acompanar-atras" onClick={parar(termine)}>Terminé</button>}
        {fases && <button className="acompanar-atras" onClick={parar(() => { if (i + 1 < pasos.length) irA(i + 1); else setFin(true); })}>Saltar</button>}
      </div>
    </>}
  </dialog>;
}
