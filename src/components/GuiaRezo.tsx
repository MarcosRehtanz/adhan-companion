// Guía del rezo: cada rezo obligatorio paso a paso, según la escuela. Muestra lo obligatorio y, en
// el modo completo, lo recomendado. Las fórmulas aparecen a medida que se transcriben y revisan
// (public/rezo/formulas.json); mientras tanto, cada una muestra su lugar y su referencia.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { loadQuran, type Corpus } from "../lib/quran";
import {
  armarRezo, cargarFormulas, COMBINAR, ESCUELAS, esObligatorio, ETIQUETAS, MENSTRUACION, MUJER, notaMujer, REZOS, VIAJE, visible,
  type Caso, type Escuela, type Estatus, type Formula, type Paso, type Postura, type Rezo, type TextoFormula,
} from "../lib/guia";

const POSTURAS: Record<Postura, string> = {
  pie: "M12 7.5v8.5M12 16l-2.2 5.5M12 16l2.2 5.5M12 9.5l-2 5M12 9.5l2 5",
  inclinado: "M7.5 9.5h8M15.5 9.5v11.5M8.5 10l5 5.5",
  postrado: "M7 17.5c2.5-5 6-7 8.5-5.5l2 8M7.5 19.5l3.5 1",
  sentado: "M9 7.5V15l7 1.5-6.5 4M9 10l3 4",
};
const CABEZA: Record<Postura, [number, number]> = { pie: [12, 4.5], inclinado: [5, 8.5], postrado: [4.8, 18.5], sentado: [9, 4.5] };
const NOMBRES_POSTURA: Record<Postura, string> = { pie: "de pie", inclinado: "inclinado", postrado: "postrado", sentado: "sentado" };
/** Pictograma provisorio de la postura. */
export function PosturaIcono({ postura, className = "" }: { postura: Postura; className?: string }) {
  return <svg className={"postura " + className} viewBox="0 0 24 24" aria-hidden="true"><circle cx={CABEZA[postura][0]} cy={CABEZA[postura][1]} r="2" /><path d={POSTURAS[postura]} /></svg>;
}

const guardado = <T extends string>(clave: string, valores: readonly T[], porDefecto: T): T => {
  const v = localStorage.getItem(clave) as T | null;
  return v && valores.includes(v) ? v : porDefecto;
};

function Estado({ estatus }: { estatus: Estatus | null }) {
  if (!estatus) return null;
  return <span className={"guia-estatus " + (esObligatorio(estatus) ? "fuerte" : "suave")}>{ETIQUETAS[estatus]}</span>;
}
function Fuente({ caso, prefijo = "Según" }: { caso: { fuente: { etiqueta: string; url: string } }; prefijo?: string }) {
  return <p className="guia-fuente">{prefijo} <a href={caso.fuente.url} target="_blank" rel="noreferrer">{caso.fuente.etiqueta}</a></p>;
}
function Aviso({ titulo, caso, children }: { titulo: string; caso?: Caso; children?: ReactNode }) {
  return <div className="guia-aviso"><b>{titulo}</b>{caso && <p>{caso.texto}</p>}{children}{caso && <Fuente caso={caso} />}</div>;
}

function FormulaBloque({ f, textos }: { f: Formula; textos: Record<string, TextoFormula> }) {
  const t = f.id ? textos[f.id] : undefined;
  const meta = <div className="guia-formula-meta"><Estado estatus={f.estatus} />{f.veces && <span>{f.veces}</span>}{f.nota && <span>{f.nota}</span>}</div>;
  if (!t) return <div className={"guia-formula pendiente" + (esObligatorio(f.estatus) ? "" : " recomendada")}>{meta}
    <p className="guia-pendiente">{f.pendiente ?? "Fórmula pendiente de revisión: se muestra cuando esté transcrita y revisada."}</p>
  </div>;
  return <div className={"guia-formula" + (esObligatorio(f.estatus) ? "" : " recomendada")}>{meta}
    <p className="guia-ar" lang="ar" dir="rtl">{t.ar}</p>
    {t.tr && <p className="guia-tr">{t.tr}</p>}
    {t.es && <p className="guia-es">{t.es}</p>}
    <p className="guia-fuente">{t.fuente} · revisó {t.reviso}</p>
  </div>;
}

function CorpusBloque({ id, corpus }: { id: "fatiha" | "ikhlas"; corpus: Corpus | null }) {
  const sura = id === "fatiha" ? 1 : 112;
  const versos = corpus?.suras[sura - 1];
  return <div className="guia-formula corpus">
    <div className="guia-formula-meta"><span>{id === "fatiha" ? "Al-Fatiha" : "Al-Ikhlas (u otra sura)"}</span></div>
    {versos ? <>
      <p className="guia-ar" lang="ar" dir="rtl">{versos.map(v => v.arabic).join(" ۝ ")}</p>
      <p className="guia-es">{versos.map(v => v.translation).join(" ")}</p>
      <p className="guia-fuente">Tanzil Uthmani 1.1 · traducción de Raúl González Bórnez (la del lector)</p>
    </> : <p className="guia-pendiente">Abriendo el texto del lector…</p>}
  </div>;
}

function PasoBloque({ p, escuela, rezo, completo, mujer, textos, corpus }: { p: Paso; escuela: Escuela; rezo: Rezo; completo: boolean; mujer: boolean; textos: Record<string, TextoFormula>; corpus: Corpus | null }) {
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
      {antes.map((f, i) => <FormulaBloque key={"a" + i} f={f} textos={textos} />)}
      {p.corpus?.map(id => <CorpusBloque key={id} id={id} corpus={corpus} />)}
      {principales.map((f, i) => <FormulaBloque key={"p" + i} f={f} textos={textos} />)}
      {despues.map((f, i) => <FormulaBloque key={"d" + i} f={f} textos={textos} />)}
      {ocultas > 0 && <p className="guia-solo-completo">{ocultas === 1 ? "Hay una recitación recomendada" : `Hay ${ocultas} recitaciones recomendadas`} en el modo completo.</p>}
      {p.difiere && <p className="guia-difiere">{p.difiere}</p>}
      {nota && <p className="guia-difiere guia-mujer"><b>Mujer (recomendado):</b> {nota.texto} <a href={nota.fuente.url} target="_blank" rel="noreferrer">{nota.fuente.etiqueta}</a></p>}
      {p.fuente && <Fuente caso={{ fuente: p.fuente }} />}
    </div>
  </article>;
}

export function GuiaRezo({ escuelaInicial }: { escuelaInicial: Escuela }) {
  const [rezo, setRezo] = useState<Rezo>(() => guardado("guia.rezo", Object.keys(REZOS) as Rezo[], "dhuhr"));
  const [escuela, setEscuela] = useState<Escuela>(() => guardado("guia.escuela", Object.keys(ESCUELAS) as Escuela[], escuelaInicial));
  const [completo, setCompleto] = useState(() => localStorage.getItem("guia.completo") === "1");
  const [viajero, setViajero] = useState(false);
  const [mujer, setMujer] = useState(() => localStorage.getItem("guia.mujer") === "1");
  const [textos, setTextos] = useState<Record<string, TextoFormula>>({});
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  useEffect(() => { void cargarFormulas().then(setTextos); loadQuran().then(setCorpus).catch(() => {}); }, []);
  useEffect(() => { localStorage.setItem("guia.rezo", rezo); localStorage.setItem("guia.escuela", escuela); localStorage.setItem("guia.completo", completo ? "1" : "0"); localStorage.setItem("guia.mujer", mujer ? "1" : "0"); }, [rezo, escuela, completo, mujer]);
  const armado = useMemo(() => armarRezo(escuela, rezo, { completo, viajero, mujer }), [escuela, rezo, completo, viajero, mujer]);
  const revisadas = Object.keys(textos).length;
  const combinar = rezo === "dhuhr" || rezo === "maghrib";
  const m = MENSTRUACION[escuela];

  return <div className="guia">
    <div className="guia-selector" role="group" aria-label="Rezo">{(Object.keys(REZOS) as Rezo[]).map(k => <button key={k} className="guia-chip" aria-pressed={rezo === k} onClick={() => setRezo(k)}>{REZOS[k].nombre}<small>{viajero && REZOS[k].rakats === 4 ? 2 : REZOS[k].rakats}</small></button>)}</div>
    <div className="guia-selector" role="group" aria-label="Escuela">{(Object.keys(ESCUELAS) as Escuela[]).map(k => <button key={k} className="guia-chip" aria-pressed={escuela === k} onClick={() => setEscuela(k)}>{ESCUELAS[k].nombre}{k === "jafari" && <small>Sistani</small>}</button>)}</div>
    <div className="guia-opciones">
      <label><input type="checkbox" checked={completo} onChange={e => setCompleto(e.target.checked)} />Completo (con lo recomendado)</label>
      <label><input type="checkbox" checked={viajero} onChange={e => setViajero(e.target.checked)} />De viaje</label>
      <label><input type="checkbox" checked={mujer} onChange={e => setMujer(e.target.checked)} />Mujer</label>
    </div>
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

    {armado.rakats.map(k => <section key={k.rakat} aria-labelledby={`rakat-${k.rakat}`}>
      <h2 className="guia-rakat" id={`rakat-${k.rakat}`}>Rakʿa {k.rakat} de {armado.total}</h2>
      {k.pasos.filter(p => visible(p.estatus, completo)).map((p, i) => <PasoBloque key={i} p={p} escuela={escuela} rezo={rezo} completo={completo} mujer={mujer} textos={textos} corpus={corpus} />)}
    </section>)}
  </div>;
}
