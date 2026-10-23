// Piezas de la guía del rezo que también usa el acompañamiento: la postura, el estatus de un paso,
// las fórmulas (con su texto revisado o como pendientes) y las suras del lector.
import type { ReactNode } from "react";
import type { Corpus } from "../lib/quran";
import { esObligatorio, ETIQUETAS, type Caso, type Estatus, type Formula, type Postura, type TextoFormula } from "../lib/guia";

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
  return <div className="guia-aviso"><b>{titulo}</b>{caso && <p>{caso.texto}</p>}{children}{caso && <Fuente caso={caso} />}</div>;
}

/** Una fórmula con su árabe y, debajo, lo que se elija (en la guía, las dos líneas). */
export function FormulaBloque({ f, textos, tr = true, es = true }: { f: Formula; textos: Record<string, TextoFormula>; tr?: boolean; es?: boolean }) {
  const t = f.id ? textos[f.id] : undefined;
  const meta = <div className="guia-formula-meta"><Estado estatus={f.estatus} />{f.veces && <span>{f.veces}</span>}{f.nota && <span>{f.nota}</span>}</div>;
  if (!t) return <div className={"guia-formula pendiente" + (esObligatorio(f.estatus) ? "" : " recomendada")}>{meta}
    <p className="guia-pendiente">{f.pendiente ?? "Fórmula pendiente de revisión: se muestra cuando esté transcrita y revisada."}</p>
  </div>;
  return <div className={"guia-formula" + (esObligatorio(f.estatus) ? "" : " recomendada")}>{meta}
    <p className="guia-ar" lang="ar" dir="rtl">{t.ar}</p>
    {tr && t.tr && <p className="guia-tr">{t.tr}</p>}
    {es && t.es && <p className="guia-es">{t.es}</p>}
    <p className="guia-fuente">{t.fuente} · revisó {t.reviso}</p>
  </div>;
}

export function CorpusBloque({ id, corpus, es = true }: { id: "fatiha" | "ikhlas"; corpus: Corpus | null; es?: boolean }) {
  const sura = id === "fatiha" ? 1 : 112;
  const versos = corpus?.suras[sura - 1];
  return <div className="guia-formula corpus">
    <div className="guia-formula-meta"><span>{id === "fatiha" ? "Al-Fatiha" : "Al-Ikhlas (u otra sura)"}</span></div>
    {versos ? <>
      <p className="guia-ar" lang="ar" dir="rtl">{versos.map(v => v.arabic).join(" ۝ ")}</p>
      {es && <p className="guia-es">{versos.map(v => v.translation).join(" ")}</p>}
      <p className="guia-fuente">Tanzil Uthmani 1.1 · traducción de Raúl González Bórnez (la del lector)</p>
    </> : <p className="guia-pendiente">Abriendo el texto del lector…</p>}
  </div>;
}
