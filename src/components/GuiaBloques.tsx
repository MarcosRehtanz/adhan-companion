// Piezas de la guía del rezo que también usa el acompañamiento: la postura, el estatus de un paso,
// las fórmulas (con su texto revisado o como pendientes) y las suras del lector.
import type { ReactNode } from "react";
import type { Corpus } from "../lib/quran";
import { CLAVE_TRANSLITERACION, esObligatorio, TRANSLIT_CORAN, ETIQUETAS, type Caso, type Estatus, type Formula, type Paso, type Lectura, type Postura, type TextoFormula } from "../lib/guia";

const POSTURAS: Record<Postura, string> = {
  pie: "M12 7.5v8.5M12 16l-2.2 5.5M12 16l2.2 5.5M12 9.5l-2 5M12 9.5l2 5",
  inclinado: "M16.5 9.5h-8M8.5 9.5v11.5M15.5 10l-5 5.5",
  postrado: "M17 17.5c-2.5-5-6-7-8.5-5.5l-2 8M16.5 19.5l-3.5 1",
  sentado: "M9 7.5V15l7 1.5-6.5 4M9 10l3 4",
};
const CABEZA: Record<Postura, [number, number]> = { pie: [12, 4.5], inclinado: [19, 8.5], postrado: [19.2, 18.5], sentado: [9, 4.5] };
export const NOMBRES_POSTURA: Record<Postura, string> = { pie: "de pie", inclinado: "inclinado", postrado: "postrado", sentado: "sentado" };
/** Pictograma provisorio de la postura. */
export function PosturaIcono({ postura, className = "" }: { postura: Postura; className?: string }) {
  return <svg className={"postura " + className} viewBox="0 0 24 24" aria-hidden="true"><circle cx={CABEZA[postura][0]} cy={CABEZA[postura][1]} r="2" /><path d={POSTURAS[postura]} /></svg>;
}

export const guardado = <T extends string>(clave: string, valores: readonly T[], porDefecto: T): T => {
  const v = localStorage.getItem(clave) as T | null;
  return v && valores.includes(v) ? v : porDefecto;
};

export function Estado({ estatus }: { estatus: Estatus | null }) {
  if (!estatus) return null;
  return <span className={"guia-estatus " + (esObligatorio(estatus) ? "fuerte" : "suave")}>{ETIQUETAS[estatus]}</span>;
}
export function Fuente({ caso, prefijo = "Según" }: { caso: { fuente: { etiqueta: string; url: string } }; prefijo?: string }) {
  return <p className="guia-fuente">{prefijo} <a href={caso.fuente.url} target="_blank" rel="noreferrer">{caso.fuente.etiqueta}</a></p>;
}
export function Aviso({ titulo, caso, children }: { titulo: string; caso?: Caso; children?: ReactNode }) {
  return <div className="guia-aviso"><b>{titulo}</b>{caso && <p>{caso.texto}</p>}{children}</div>;
}

/** Nota que se abre a pedido dentro de un paso (la niyya dicha en voz alta). No avanza el acompañamiento. */
export function NotaOculta({ nota, textos, tr = true, es = true }: { nota: NonNullable<Paso["notaOculta"]>; textos: Record<string, TextoFormula>; tr?: boolean; es?: boolean }) {
  return <details className="guia-nota" onClick={e => e.stopPropagation()}>
    <summary>{nota.titulo}</summary>
    {nota.formulas.map((f, i) => <FormulaBloque key={i} f={f} textos={textos} tr={tr} es={es} />)}
  </details>;
}

/** Una fórmula con su árabe y, debajo, lo que se elija (en la guía, las dos líneas). Sus fuentes van
 *  aparte, en «Fuentes y revisión» al final de la guía (decisión del usuario del 23/10/2026). */
export function FormulaBloque({ f, textos, tr = true, es = true }: { f: Formula; textos: Record<string, TextoFormula>; tr?: boolean; es?: boolean }) {
  const t = f.id ? textos[f.id] : undefined;
  const meta = <div className="guia-formula-meta"><Estado estatus={f.estatus} />{f.veces && <span>{f.veces}</span>}{f.nota && <span>{f.nota}</span>}</div>;
  const suave = f.estatus !== null && !esObligatorio(f.estatus);
  if (!t) return <div className={"guia-formula pendiente" + (suave ? " recomendada" : "")}>{meta}
    <p className="guia-pendiente">{f.pendiente ?? "Fórmula pendiente de revisión: se muestra cuando esté transcrita y revisada."}</p>
  </div>;
  return <div className={"guia-formula" + (suave ? " recomendada" : "")}>{meta}
    <p className="guia-ar" lang="ar" dir="rtl">{t.ar}</p>
    {tr && t.tr && <p className="guia-tr">{t.tr}</p>}
    {es && t.es && <p className="guia-es">{t.es}</p>}
  </div>;
}

/** `desde`: en una aleya que no es toda súplica, la palabra (contada desde 0) donde empieza lo que se dice. */
const LECTURAS: Record<Lectura, { sura: number; aya?: number; desde?: number; nombre: string }> = {
  fatiha: { sura: 1, nombre: "Al-Fatiha" },
  ikhlas: { sura: 112, nombre: "Al-Ikhlas (u otra sura)" },
  "2:201": { sura: 2, aya: 201, desde: 3, nombre: "Rabbanā ātinā (Corán 2:201)" },  // sin «wa minhum man yaqūlu»
};
/** De 2:201 solo se dice la súplica: en la traducción, lo que va entre comillas. */
const soloSuplica = (texto: string) => texto.match(/«(.+)»/)?.[1] ?? texto;

export function CorpusBloque({ id, corpus, textos = {}, tr = true, es = true }: { id: Lectura; corpus: Corpus | null; textos?: Record<string, TextoFormula>; tr?: boolean; es?: boolean }) {
  const l = LECTURAS[id];
  const translit = TRANSLIT_CORAN[id].map(k => textos[k]?.tr).filter(Boolean);
  const sura = corpus?.suras[l.sura - 1];
  const versos = sura && (l.aya ? sura.slice(l.aya - 1, l.aya) : sura);
  return <div className="guia-formula corpus">
    <div className="guia-formula-meta"><span>{l.nombre}</span></div>
    {versos ? <>
      <p className="guia-ar" lang="ar" dir="rtl">{l.desde ? versos[0].arabic.split(" ").slice(l.desde).join(" ") : versos.map(v => v.arabic).join(" ۝ ")}</p>
      {tr && translit.length > 0 && <p className="guia-tr">{translit.join(" · ")}</p>}
      {es && <p className="guia-es">{l.aya ? soloSuplica(versos[0].translation) : versos.map(v => v.translation).join(" ")}</p>}
    </> : <p className="guia-pendiente">Abriendo el texto del lector…</p>}
  </div>;
}

/** Cómo leer la transliteración estricta: un desplegable, solo si la transliteración está visible. */
export function ClaveTransliteracion() {
  return <details className="guia-clave">
    <summary>Cómo leer la transliteración</summary>
    <dl>{CLAVE_TRANSLITERACION.map(([signo, como]) => <div key={signo}><dt>{signo}</dt><dd>{como}</dd></div>)}</dl>
  </details>;
}
