import metadata from "../data/quran-suras.json";
export const SURAS = metadata.suras;
export interface Position { sura: number; aya: number }
export interface ReaderState {
  last: Position | null; bookmarks: Position[]; arabic_size: number; translation_size: number; show_translation: boolean;
}
export type ReaderAction = ({ kind: "position" | "bookmark" } & Position) | { kind: "preferences"; arabic_size: number; translation_size: number; show_translation: boolean };
export interface Verse extends Position { arabic: string; translation: string }
export type SuraType = "Mequí" | "Mediní";
export interface Corpus { suras: Verse[][]; types: Partial<Record<number, SuraType>>; arabicLicense: string; translationTerms: string; fontLicense: string }
let loading: Promise<Corpus> | null = null;
async function resource(path: string): Promise<string> {
  const response = await fetch(`/quran/${path}`);
  if (!response.ok) throw new Error(`No se pudo abrir el recurso local ${path}.`);
  return response.text();
}
function parse(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let index = 0;
  const expected = SURAS.flatMap(s => Array.from({ length: s.count }, (_, i) => `${s.number}:${i + 1}`));
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (!match) throw new Error("El archivo del Qur’an no tiene el formato esperado.");
    const key = `${match[1]}:${match[2]}`;
    if (key !== expected[index++]) throw new Error("Las aleyas del archivo están incompletas o fuera de orden.");
    result.set(key, match[3]); // Texto original, sin trim, normalización ni HTML.
  }
  if (index !== 6236) throw new Error("El archivo del Qur’an está incompleto.");
  return result;
}
// Tipo de revelación desde el XML de metadatos de Tanzil ya incluido. Es
// información complementaria: si no se puede leer, el lector sigue sin ella.
function parseTypes(xml: string): Corpus["types"] {
  const types: Corpus["types"] = {};
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  doc.querySelectorAll("suras > sura").forEach(node => {
    const type = node.getAttribute("type");
    if (type === "Meccan" || type === "Medinan") types[Number(node.getAttribute("index"))] = type === "Meccan" ? "Mequí" : "Mediní";
  });
  return types;
}
export function loadQuran(): Promise<Corpus> {
  if (!loading) loading = Promise.all([resource("quran-uthmani.txt"), resource("es.bornez.txt"), resource("ARABIC-LICENSE.txt"), resource("TRANSLATION-TERMS.txt"), resource("fonts/OFL.txt"), resource("quran-data.xml").catch(() => "")]).then(([a, b, arabicLicense, translationTerms, fontLicense, metadata]) => {
    const arabic = parse(a), translation = parse(b);
    let types: Corpus["types"] = {};
    try { if (metadata) types = parseTypes(metadata); } catch { types = {}; }
    return { suras: SURAS.map(s => Array.from({ length: s.count }, (_, i) => ({ sura: s.number, aya: i + 1, arabic: arabic.get(`${s.number}:${i + 1}`)!, translation: translation.get(`${s.number}:${i + 1}`)! }))), types, arabicLicense, translationTerms, fontLicense };
  }).catch(error => { loading = null; throw error; });
  return loading;
}
export function positionLabel(p: Position): string { return `${p.sura}. ${SURAS[p.sura - 1].name} · aleya ${p.aya}`; }
/** Número con dígitos arábigo-índicos, para la marca de fin de aleya (۝). */
export function arabicDigits(n: number): string { return String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]); }
