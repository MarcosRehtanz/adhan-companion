// Guía del rezo: cada rezo obligatorio paso a paso, según la escuela. Muestra lo obligatorio y, en
// el modo completo, lo recomendado. En ja'fari hay dos perfiles: «Mi práctica» (el orden con que se
// aprende, con adhan, iqama y taʿqībāt, sin estatus) y Sistani completo (con estatus y fuentes). Las fórmulas aparecen a medida que se transcriben y revisan
// (public/rezo/formulas.json); mientras tanto, cada una muestra su lugar y su referencia.
import { useEffect, useMemo, useState } from "react";
import { loadQuran, type Corpus } from "../lib/quran";
import {
  armarRezo, cargarFormulas, COMBINAR, ESCUELAS, ESCUELAS_VISIBLES, MENSTRUACION, MUJER, notaMujer, REZOS, VIAJE, visible,
  type Avance, type Escuela, type Paso, type Perfil, type Postura, type Rezo, type TextoFormula,
} from "../lib/guia";
import type { Schedule } from "../types";
import { AcompanarRezo, PrepararHoja, type Debajo } from "./AcompanarRezo";
import { Aviso, ClaveTransliteracion, CorpusBloque, Estado, FormulaBloque, Fuente, guardado, NOMBRES_POSTURA, PosturaIcono } from "./GuiaBloques";

function PasoBloque({ p, escuela, rezo, completo, mujer, textos, corpus, debajo }: { p: Paso; escuela: Escuela; rezo: Rezo; completo: boolean; mujer: boolean; textos: Record<string, TextoFormula>; corpus: Corpus | null; debajo: Debajo }) {
  const antes = p.formulas.filter(f => f.antes && visible(f.estatus, completo));
  const principales = p.formulas.filter(f => !f.antes && visible(f.estatus, completo));
  const despues = (p.formulasDespues ?? []).filter(f => visible(f.estatus, completo));
  const ocultas = [...p.formulas, ...(p.formulasDespues ?? [])].filter(f => !visible(f.estatus, completo)).length;
  const nota = mujer ? notaMujer(escuela, p, rezo) : null;
  return <article className="guia-paso">
    <PosturaIcono postura={p.postura} />
    <div className="guia-paso-cuerpo">
      <div className="guia-paso-cabecera"><b>{p.nombre}</b><Estado estatus={p.estatus} />{p.voz && <span className="guia-voz">en voz {p.voz}</span>}</div>
      <p className="guia-detalle">{p.detalle}</p>
      {antes.map((f, i) => <FormulaBloque key={"a" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
      {p.corpus?.map(id => <CorpusBloque key={id} id={id} corpus={corpus} es={debajo.es} />)}
      {principales.map((f, i) => <FormulaBloque key={"p" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
      {despues.map((f, i) => <FormulaBloque key={"d" + i} f={f} textos={textos} tr={debajo.tr} es={debajo.es} />)}
      {ocultas > 0 && <p className="guia-solo-completo">{ocultas === 1 ? "Hay una recitación recomendada" : `Hay ${ocultas} recitaciones recomendadas`} en el modo completo.</p>}
      {p.difiere && <p className="guia-difiere">{p.difiere}</p>}
      {nota && <p className="guia-difiere guia-mujer"><b>Mujer (recomendado):</b> {nota.texto} <a href={nota.fuente.url} target="_blank" rel="noreferrer">{nota.fuente.etiqueta}</a></p>}
      {p.fuente && <Fuente caso={{ fuente: p.fuente }} />}
    </div>
  </article>;
}

/** `rezoInicial` (desde la tarjeta de Hoy): abre con ese rezo y directo en «Antes de empezar». */
export function GuiaRezo({ escuelaInicial, rezoInicial, schedule, scheduleError, android, onMarked }: { escuelaInicial: Escuela; rezoInicial?: Rezo; schedule: Schedule | null; scheduleError: string; android: boolean; onMarked: () => void }) {
  const [rezo, setRezo] = useState<Rezo>(() => rezoInicial ?? guardado("guia.rezo", Object.keys(REZOS) as Rezo[], "dhuhr"));
  const [escuela, setEscuela] = useState<Escuela>(() => guardado("guia.escuela", ESCUELAS_VISIBLES, ESCUELAS_VISIBLES.includes(escuelaInicial) ? escuelaInicial : ESCUELAS_VISIBLES[0]));
  const [completo, setCompleto] = useState(() => localStorage.getItem("guia.completo") === "1");
  const [viajero, setViajero] = useState(false);
  const [mujer, setMujer] = useState(() => localStorage.getItem("guia.mujer") === "1");
  const [perfil, setPerfil] = useState<Perfil>(() => guardado("guia.perfil", ["practica", "sistani"], "practica"));
  // Unido al rezo anterior: lo pone «Seguir con…» al final del acompañamiento; elegir otro rezo lo quita.
  const [combinado, setCombinado] = useState(false);
  const [textos, setTextos] = useState<Record<string, TextoFormula>>({});
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [etapa, setEtapa] = useState<"guia" | "preparar" | "acompanar">(rezoInicial ? "preparar" : "guia");
  const [avance, setAvance] = useState<Avance>(() => guardado("guia.avance", ["tocar", "contador"], "tocar"));
  const [debajo, setDebajo] = useState<Debajo>(() => ({ tr: localStorage.getItem("guia.tr") !== "0", es: localStorage.getItem("guia.es") !== "0" }));
  useEffect(() => { void cargarFormulas().then(setTextos); loadQuran().then(setCorpus).catch(() => {}); }, []);
  useEffect(() => { localStorage.setItem("guia.rezo", rezo); localStorage.setItem("guia.escuela", escuela); localStorage.setItem("guia.completo", completo ? "1" : "0"); localStorage.setItem("guia.mujer", mujer ? "1" : "0"); localStorage.setItem("guia.perfil", perfil); }, [rezo, escuela, completo, mujer, perfil]);
  useEffect(() => { localStorage.setItem("guia.avance", avance); localStorage.setItem("guia.tr", debajo.tr ? "1" : "0"); localStorage.setItem("guia.es", debajo.es ? "1" : "0"); }, [avance, debajo]);
  const armado = useMemo(() => armarRezo(escuela, rezo, { completo, viajero, mujer, combinado, perfil }), [escuela, rezo, completo, viajero, mujer, combinado, perfil]);
  const elegirRezo = (k: Rezo) => { setRezo(k); setCombinado(false); };
  const seccion = (clave: string, titulo: string, pasos: Paso[]) => {
    if (!pasos.length) return null;
    const vis = pasos.filter(p => visible(p.estatus, completo));
    return <section key={clave} aria-labelledby={`guia-${clave}`}>
      <h2 className="guia-rakat" id={`guia-${clave}`}>{titulo}</h2>
      {vis.length ? vis.map((p, i) => <PasoBloque key={i} p={p} escuela={escuela} rezo={rezo} completo={completo} mujer={mujer} textos={textos} corpus={corpus} debajo={debajo} />)
        : <p className="guia-solo-completo">{pasos.length === 1 ? "Hay un paso recomendado" : `Hay ${pasos.length} pasos recomendados`} en el modo completo.</p>}
    </section>;
  };
  const revisadas = Object.keys(textos).length;
  const combinar = rezo === "dhuhr" || rezo === "maghrib";
  const m = MENSTRUACION[escuela];

  return <div className="guia">
    <div className="guia-selector" role="group" aria-label="Rezo">{(Object.keys(REZOS) as Rezo[]).map(k => <button key={k} className="guia-chip" aria-pressed={rezo === k} onClick={() => elegirRezo(k)}>{REZOS[k].nombre}<small>{viajero && REZOS[k].rakats === 4 ? 2 : REZOS[k].rakats}</small></button>)}</div>
    {ESCUELAS_VISIBLES.length > 1 && <div className="guia-selector" role="group" aria-label="Escuela">{ESCUELAS_VISIBLES.map(k => <button key={k} className="guia-chip" aria-pressed={escuela === k} onClick={() => setEscuela(k)}>{ESCUELAS[k].nombre}{k === "jafari" && <small>Sistani</small>}</button>)}</div>}
    {escuela === "jafari" && <div className="guia-selector" role="group" aria-label="Perfil">
      <button className="guia-chip" aria-pressed={perfil === "practica"} onClick={() => setPerfil("practica")}>Mi práctica<small>como se aprende</small></button>
      <button className="guia-chip" aria-pressed={perfil === "sistani"} onClick={() => setPerfil("sistani")}>Sistani completo<small>con fuentes</small></button>
    </div>}
    <div className="guia-opciones">
      {!armado.practica && <label><input type="checkbox" checked={completo} onChange={e => setCompleto(e.target.checked)} />Completo (con lo recomendado)</label>}
      <label><input type="checkbox" checked={viajero} onChange={e => setViajero(e.target.checked)} />De viaje</label>
      <label><input type="checkbox" checked={mujer} onChange={e => setMujer(e.target.checked)} />Mujer</label>
      <label><input type="checkbox" checked={debajo.tr} onChange={e => setDebajo({ ...debajo, tr: e.target.checked })} />Transliteración</label>
      <label><input type="checkbox" checked={debajo.es} onChange={e => setDebajo({ ...debajo, es: e.target.checked })} />Traducción</label>
    </div>
    {debajo.tr && <ClaveTransliteracion />}
    <button className="guia-boton guia-empezar" onClick={() => setEtapa("preparar")}>Rezar {REZOS[rezo].nombre} con guía</button>
    {revisadas === 0 && <p className="guia-aviso-preparacion">Guía en preparación: las fórmulas aparecen a medida que se transcriben y revisan. Al-Fatiha y la sura vienen del lector.</p>}
    {viajero && <Aviso titulo="De viaje" caso={VIAJE[escuela]} />}
    {mujer && <>
      <Aviso titulo="Para la mujer" caso={MUJER[escuela]} />
      <Aviso titulo="Durante la menstruación y el posparto">
        <p>No se reza, y esos rezos no se recuperan (en todas las escuelas). Si empieza o termina dentro del tiempo de un rezo, ese rezo puede quedar pendiente.</p>
        <p>Duración máxima según {ESCUELAS[escuela].nombre}: menstruación, {m.hayd}; posparto, {m.nifas}. Para los casos de hábito, conviene consultar.</p>
        {m.extra && <p>{m.extra}</p>}
        <p>Los avisos se pueden pausar desde «Adhan y avisos»; la app no guarda el motivo.</p>
        <Fuente caso={m} />
      </Aviso>
    </>}
    {combinar && <Aviso titulo={`Combinar con ${rezo === "dhuhr" ? "Asr" : "Isha"}`} caso={COMBINAR[escuela]} />}

    <div className="guia-ritmo" aria-label="Ritmo del rezo: las posturas de cada rakʿa">
      {armado.rakats.map(k => {
        const tira: Postura[] = [];
        k.pasos.filter(p => visible(p.estatus, completo)).forEach(p => { if (p.postura !== tira[tira.length - 1] || p.postura === "postrado") tira.push(p.postura); });
        return <div className="guia-ritmo-fila" key={k.rakat}><span className="guia-ritmo-num">{k.rakat}</span>{tira.map((t, i) => <span key={i} title={NOMBRES_POSTURA[t]}><PosturaIcono postura={t} /></span>)}</div>;
      })}
      <p className="guia-ritmo-leyenda">El ritmo del rezo: cada fila es una rakʿa.</p>
    </div>

    {seccion("antes", combinado ? "Antes del rezo · unido al anterior" : "Antes del rezo", armado.antes)}
    {armado.rakats.map(k => seccion(`rakat-${k.rakat}`, `Rakʿa ${k.rakat} de ${armado.total}`, k.pasos))}
    {seccion("despues", "Después del rezo · taʿqībāt", armado.despues)}

    {etapa === "preparar" && <PrepararHoja armado={armado} escuela={escuela} completo={completo} combinado={combinado} android={android} avance={avance} debajo={debajo}
      onAvance={setAvance} onDebajo={setDebajo} onCancelar={() => setEtapa("guia")} onEmpezar={() => setEtapa("acompanar")} />}
    {etapa === "acompanar" && <AcompanarRezo armado={armado} escuela={escuela} completo={completo} combinado={combinado} viajero={viajero} avance={avance} debajo={debajo}
      textos={textos} corpus={corpus} schedule={schedule} scheduleError={scheduleError} onMarked={onMarked} onSalir={() => setEtapa("guia")}
      onCombinar={siguiente => { setRezo(siguiente); setCombinado(true); setEtapa("preparar"); }} />}
  </div>;
}
