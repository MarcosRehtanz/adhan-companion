// Guía del rezo: pasos de cada rezo obligatorio según la escuela. Las reglas, los estatus y las
// diferencias salen de la investigación de fuentes (docs/investigacion-fuentes-rezo.md): Sistani para
// la práctica ja'fari; dorar.net, al-Jazīrī y Khalīl para las escuelas sunnis. Acá no hay texto de
// fórmulas: cada fórmula es una referencia (`id`) a public/rezo/formulas.json, que solo trae las que
// alguien transcribió y revisó.

export type Escuela = "jafari" | "hanafi" | "maliki" | "shafii" | "hanbali";
export type Rezo = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type Postura = "pie" | "inclinado" | "postrado" | "sentado";
export type Estatus = "pilar" | "obligatorio" | "condicion" | "sunna" | "recomendado";
/** Ja'fari: «Mi práctica» (el orden con que se aprende, sin estatus) o Sistani completo (con estatus y fuentes). */
export type Perfil = "practica" | "sistani";
/** Lo que se recita del Corán desde el texto del lector: Al-Fatiha, Al-Ikhlas o la aleya 2:201 (qunut). */
export type Lectura = "fatiha" | "ikhlas" | "2:201";
export interface Fuente { etiqueta: string; url: string }
export interface Formula {
  /** Id en public/rezo/formulas.json (y en la planilla de transcripción). */
  id?: string;
  /** Qué se muestra mientras la fórmula no esté transcrita. */
  pendiente?: string;
  /** null en «Mi práctica»: se muestra siempre, sin etiqueta. */
  estatus: Estatus | null;
  /** Se dice antes de la recitación del paso (por ejemplo, el taʿawwudh). */
  antes?: boolean;
  veces?: string;
  nota?: string;
}
export interface Paso {
  postura: Postura;
  nombre: string;
  detalle: string;
  estatus: Estatus | null;
  formulas: Formula[];
  formulasDespues?: Formula[];
  /** Lo que se recita del corpus del lector en el paso. */
  corpus?: Lectura[];
  /** Dhikr con cuenta (tasbīḥ de Fátima): el acompañamiento cuenta un toque por repetición. */
  cuenta?: { dice: string; veces: number }[];
  voz?: "alta" | "baja";
  difiere?: string;
  fuente?: Fuente;
  /** Nota que se abre a pedido (por ejemplo, la niyya dicha en voz alta): no forma parte del paso. */
  notaOculta?: { titulo: string; formulas: Formula[] };
}
export interface Opciones { completo: boolean; viajero: boolean; mujer: boolean; combinado?: boolean; perfil?: Perfil }
/** `antes` (adhan e iqama) y `despues` (taʿqībāt) solo existen en ja'fari. */
export interface RezoArmado { rezo: Rezo; total: number; practica: boolean; antes: Paso[]; rakats: { rakat: number; pasos: Paso[] }[]; despues: Paso[] }

export const REZOS: Record<Rezo, { nombre: string; rakats: number; voz: "alta" | "baja" }> = {
  fajr: { nombre: "Fajr", rakats: 2, voz: "alta" },
  dhuhr: { nombre: "Dhuhr", rakats: 4, voz: "baja" },
  asr: { nombre: "Asr", rakats: 4, voz: "baja" },
  maghrib: { nombre: "Maghrib", rakats: 3, voz: "alta" },
  isha: { nombre: "Isha", rakats: 4, voz: "alta" },
};
export const ESCUELAS: Record<Escuela, { nombre: string; detalle: string }> = {
  jafari: { nombre: "Ja'fari", detalle: "Sistani" },
  hanafi: { nombre: "Hanafi", detalle: "sunni" },
  maliki: { nombre: "Maliki", detalle: "sunni" },
  shafii: { nombre: "Shafi'i", detalle: "sunni" },
  hanbali: { nombre: "Hanbali", detalle: "sunni" },
};
/** Escuelas que muestra la guía. Las sunnis siguen en el código, ocultas hasta que alguien revise su
 *  contenido (decisión del 23/10/2026: por ahora, solo la práctica ja'fari). */
export const ESCUELAS_VISIBLES: Escuela[] = ["jafari"];
export const ETIQUETAS: Record<Estatus, string> = { pilar: "pilar", obligatorio: "obligatorio", condicion: "condición", sunna: "sunna", recomendado: "recomendado" };
export const esObligatorio = (e: Estatus | null) => e === "pilar" || e === "obligatorio" || e === "condicion";
/** Lo obligatorio siempre; lo recomendado, solo en el modo completo. */
export const visible = (e: Estatus | null, completo: boolean) => completo || e === null || esObligatorio(e);

const IL = (regla: string, url: string): Fuente => ({ etiqueta: `Sistani, Islamic Laws, regla ${regla}`, url });
const D = (n: number): Fuente => ({ etiqueta: `Mawsūʿa fiqhiyya (dorar.net) ${n}`, url: `https://dorar.net/feqhia/${n}` });
const JZ = (p: number): Fuente => ({ etiqueta: `al-Jazīrī, al-Fiqh ʿalā al-madhāhib al-arbaʿa, p. ${p}`, url: `https://shamela.ws/book/9849/${p}` });
const ORDEN_SUNNI: Escuela[] = ["hanafi", "maliki", "shafii", "hanbali"];
function porEscuela<T>(esc: Escuela, valores: [T, T, T, T]): T { return valores[ORDEN_SUNNI.indexOf(esc)]; }

const NIYYA: Record<Rezo, string> = { fajr: "m_niyya_fajr", dhuhr: "m_niyya_dhuhr", asr: "m_niyya_asr", maghrib: "m_niyya_maghrib", isha: "m_niyya_isha" };
function pasosJafari(rezo: Rezo, r: number, total: number): Paso[] {
  const p: Paso[] = [], primera = r === 1, segunda = r === 2, ultima = r === total, conTashahhud = segunda || ultima;
  const urlQ = "https://www.sistani.org/english/book/48/2233/";
  const tk = (nota: string): Formula => ({ id: "j_takbir", estatus: "recomendado", antes: true, nota });
  if (primera) {
    p.push({ postura: "pie", nombre: "Intención", detalle: `En el corazón: rezar ${REZOS[rezo].nombre} por Allah. No hace falta decirla.`, estatus: "pilar", formulas: [], fuente: IL("929–930", "https://www.sistani.org/english/book/48/2230/"),
      notaOculta: { titulo: "Si la decís en voz alta", formulas: [{ id: NIYYA[rezo], estatus: null }] } });
    p.push({ postura: "pie", nombre: "Takbīrat al-iḥrām", detalle: "De pie y quieto. Levantar las manos hasta las orejas es recomendado.", formulas: [{ id: "j_ya_muhsin", estatus: "recomendado", antes: true }, { id: "j_takbir", estatus: "pilar" }], estatus: "pilar", fuente: IL("934–941", "https://www.sistani.org/english/book/48/2231/") });
  }
  // En la 1.ª y la 2.ª rakʿa, la recitación va en dos pasos (Al-Fatiha y la sura): más cómoda de leer.
  if (r <= 2) p.push({ postura: "pie", nombre: "Qiyām: Al-Fatiha", detalle: "Manos sueltas sobre los muslos.", estatus: "obligatorio", fuente: IL("964", urlQ), voz: REZOS[rezo].voz, corpus: ["fatiha"],
    formulas: primera ? [{ id: "j_taawwudh", estatus: "recomendado", antes: true }] : [],
    formulasDespues: [{ id: "j_hamd", estatus: "recomendado", nota: "tras Al-Fatiha" }] });
  const recitacion: Paso = r <= 2
    ? { postura: "pie", nombre: "Qiyām: sura", detalle: "Una sura completa: Al-Ikhlas u otra.", estatus: "obligatorio", fuente: IL("964", urlQ), voz: REZOS[rezo].voz, corpus: ["ikhlas"],
        formulas: [], formulasDespues: [{ id: "j_kadhalika", estatus: "recomendado", nota: "tras Al-Ikhlas" }] }
    : { postura: "pie", nombre: "Qiyām: recitación", detalle: "Al-Fatiha o al-tasbīḥāt al-arbaʿa (una vez basta; mejor tres). Manos sueltas sobre los muslos.", estatus: "obligatorio", fuente: IL("991–993", urlQ), voz: "baja",
        formulas: [{ id: "j_tasbihat", estatus: "obligatorio", veces: "×1, mejor ×3" }, { id: "j_istighfar", estatus: "recomendado" }] };
  p.push(recitacion);
  if (segunda) p.push({ postura: "pie", nombre: "Qunūt", detalle: "Antes del rukūʿ, con las manos alzadas frente a la cara. Basta cualquier dhikr: Rabbanā ātinā (2:201) o la ṣalawāt.", corpus: ["2:201"], formulas: [{ id: "m_salawat", estatus: "recomendado", nota: "o, más breve" }], estatus: "recomendado", fuente: IL("1103–1105", "https://www.sistani.org/english/book/48/2243/") });
  p.push({ postura: "inclinado", nombre: "Rukūʿ", detalle: "Inclinarse hasta que las manos lleguen a las rodillas y quedarse quieto.", formulas: [tk("de pie y quieto, antes de inclinarse · regla 1029"), { id: "j_ruku", estatus: "obligatorio" }, { id: "j_subhanallah", estatus: "obligatorio", veces: "×3", nota: "en lugar de la anterior", pendiente: "«Subḥāna llāh»: fórmula pendiente de revisión." }], estatus: "pilar", fuente: IL("1008–1015", "https://www.sistani.org/english/book/48/2234/") });
  p.push({ postura: "pie", nombre: "Levantarse del rukūʿ", detalle: "Ponerse de pie y quedarse quieto.", formulas: [{ id: "j_samia", estatus: "recomendado" }], estatus: "obligatorio", fuente: IL("1026, 1029", "https://www.sistani.org/english/book/48/2234/") });
  const sujud = (n: number): Paso => ({ postura: "postrado", nombre: `Sujūd ${n}`, detalle: "Siete apoyos: frente, palmas, rodillas y dedos gordos de los pies. La frente sobre tierra o lo que crece de ella (no comestible ni vestible); lo mejor, la turba.", formulas: [tk(n === 1 ? "de pie y quieto, antes de bajar · regla 1077" : "sentado y quieto, antes de la segunda · regla 1077"), { id: "j_suyud", estatus: "obligatorio" }, { id: "j_subhanallah", estatus: "obligatorio", veces: "×3", nota: "en lugar de la anterior", pendiente: "«Subḥāna llāh»: fórmula pendiente de revisión." }, ...(n === 1 ? [{ id: "j_ya_khayr", estatus: "recomendado" } as Formula] : [])], estatus: "pilar", difiere: "La frente sobre tierra o turba es condición ja'fari; ninguna escuela sunni la exige.", fuente: IL("1031–1035, 1062, 1069", "https://www.sistani.org/english/book/48/2235/") });
  p.push(sujud(1));
  p.push({ postura: "sentado", nombre: "Entre las dos sajdas", detalle: "Sentarse y quedarse quieto.", formulas: [tk("al sentarte, ya quieto · regla 1077"), { id: "j_istighfar", estatus: "recomendado" }], estatus: "obligatorio", fuente: IL("1042, 1077", "https://www.sistani.org/english/book/48/2237/") });
  p.push(sujud(2));
  if (conTashahhud) p.push({ postura: "sentado", nombre: ultima ? "Tashahhud final" : "Tashahhud", detalle: "Sentado y quieto.", formulas: [tk("al sentarte tras la segunda sajda · regla 1077"), { id: "m_hamd", estatus: "recomendado", antes: true }, { id: "j_tashahhud", estatus: "obligatorio" }, { id: "j_taqabbal", estatus: "recomendado" }], estatus: "obligatorio", fuente: IL("1086–1089", "https://www.sistani.org/english/book/48/2239/") });
  if (ultima) p.push({ postura: "sentado", nombre: "Taslīm", detalle: "La salida del rezo.", formulas: [{ id: "j_salam_nabi", estatus: "recomendado", nota: "no es fórmula de salida" }, { id: "j_salam_alayna", estatus: "recomendado", nota: "si se dice, igual se agrega «as-salāmu ʿalaykum»" }, { id: "j_salam", estatus: "obligatorio" }, { id: "j_salam_agregado", estatus: "recomendado", nota: "precaución recomendada" }], estatus: "obligatorio", fuente: IL("1091", "https://www.sistani.org/english/book/48/2240/") });
  else p.push({ postura: "pie", nombre: `Levantarse para la rakʿa ${r + 1}`, detalle: conTashahhud ? "Desde el tashahhud." : "Antes, un breve asiento de descanso (precaución obligatoria).", formulas: [...(conTashahhud ? [] : [tk("al sentarte tras la segunda sajda · regla 1077")]), { id: "j_bihawli", estatus: "recomendado" }], estatus: "obligatorio", fuente: IL("952, 1061", "https://www.sistani.org/english/book/48/2232/") });
  return p;
}

// ---------------------------------------------------- antes y después del rezo (ja'fari)

const U_ADHAN = "https://www.sistani.org/english/book/48/2228/", U_TAQIB = "https://www.sistani.org/english/book/48/2245/";
// Frases del adhan y de la iqama, en orden (regla 904). La wilāya va aparte: no es parte del adhan (regla 905).
const ADHAN: [string, string][] = [["j_takbir", "×4"], ["adh_tawhid", "×2"], ["adh_risala", "×2"], ["adh_wilaya", "×2"], ["adh_salat", "×2"], ["adh_falah", "×2"], ["adh_khayr", "×2"], ["j_takbir", "×2"], ["adh_tahlil", "×2"]];
const IQAMA: [string, string][] = [["j_takbir", "×2"], ["adh_tawhid", "×2"], ["adh_risala", "×2"], ["adh_wilaya", "×2"], ["adh_salat", "×2"], ["adh_falah", "×2"], ["adh_khayr", "×2"], ["adh_qad_qamat", "×2"], ["j_takbir", "×2"], ["adh_tahlil", "×1"]];
const frases = (lista: [string, string][], estatus: Estatus | null): Formula[] =>
  lista.map(([id, veces]) => ({ id, veces, estatus, ...(id === "adh_wilaya" ? { nota: "recomendada; no forma parte del adhan" } : {}) }));
const TASBIH_FATIMA: Paso["cuenta"] = [{ dice: "Allāhu akbar", veces: 34 }, { dice: "al-ḥamdu lillāh", veces: 33 }, { dice: "subḥāna llāh", veces: 33 }];

function antesJafari(rezo: Rezo, combinado: boolean, estatus: Estatus | null, fuentes: boolean): Paso[] {
  const p: Paso[] = [];
  if (!combinado) p.push({ postura: "pie", nombre: "Adhān", detalle: "Dieciocho frases, de pie y hacia la qibla. La wilāya no es parte del adhan: es bueno decirla después del testimonio sobre Muḥammad, con la intención de acercarse a Allah.", estatus, formulas: frases(ADHAN, estatus), ...(fuentes ? { fuente: IL("902, 904 y 905", U_ADHAN) } : {}) });
  p.push({ postura: "pie", nombre: "Iqāma", detalle: (combinado ? `Rezás ${REZOS[rezo].nombre} enseguida del anterior: el adhan no se dice y la iqama sí. ` : "Enseguida del adhan, sin una pausa larga. ") + "Diecisiete frases, de pie y con la ablución hecha; después, el rezo sin demora.", estatus, formulas: frases(IQAMA, estatus), ...(fuentes ? { fuente: IL(combinado ? "908, 917 y 919" : "904, 917 y 919", U_ADHAN) } : {}) });
  return p;
}
function despuesJafari(estatus: Estatus | null, completo: boolean): Paso[] {
  const p: Paso[] = [
    { postura: "sentado", nombre: "Tres takbīres", detalle: "Ya fuera del rezo, con las manos alzadas hasta las orejas. Abren la taʿqībāt: no forman parte del rezo, que terminó con el taslīm.", estatus, formulas: [{ id: "j_takbir", estatus, veces: "×3" }], ...(completo ? { difiere: "Costumbre extendida; falta una fuente verificada (no figura en Islamic Laws)." } : {}) },
    { postura: "sentado", nombre: "Tasbīḥ de Fátima", detalle: "Hacia la qibla y antes de levantarte: 34 «Allāhu akbar», 33 «al-ḥamdu lillāh» y 33 «subḥāna llāh». Se puede decir «subḥāna llāh» antes que «al-ḥamdu lillāh», pero es mejor después.", estatus,
      formulas: [{ id: "j_takbir", estatus, veces: "×34" }, { id: "m_hamd", estatus, veces: "×33" }, { id: "j_subhanallah", estatus, veces: "×33" }], cuenta: TASBIH_FATIMA, ...(completo ? { fuente: IL("1108", U_TAQIB) } : {}) },
  ];
  if (completo) p.push({ postura: "postrado", nombre: "Sajdat al-shukr", detalle: "Una postración de agradecimiento. Basta apoyar la frente con esa intención; mejor si se dice «shukran lillāh» cien veces, tres o una.", estatus: "recomendado", formulas: [{ id: "j_shukr", estatus: "recomendado" }], fuente: IL("1109", U_TAQIB) });
  return p;
}

// ---------------------------------------------------- «Mi práctica» (ja'fari)
// El rezo en el orden con que se aprende, con lo recomendado que se acostumbra decir y sin estatus.
// Lo que una nota de estudio resumiría («el segundo sujud, lo mismo») acá se repite, para acompañar.

function pasosPractica(rezo: Rezo, r: number, total: number): Paso[] {
  const p: Paso[] = [], primera = r === 1, segunda = r === 2, ultima = r === total, conTashahhud = segunda || ultima;
  const f = (id: string, extra: Partial<Formula> = {}): Formula => ({ id, estatus: null, ...extra });
  const paso = (postura: Postura, nombre: string, detalle: string, formulas: Formula[], extra: Partial<Paso> = {}): Paso => ({ postura, nombre, detalle, estatus: null, formulas, ...extra });
  if (primera) {
    p.push(paso("pie", "Niyya", "La intención vale en el corazón; la fórmula es orientativa.", [f(NIYYA[rezo])]));
    p.push(paso("pie", "Takbir", "Manos a la altura de las orejas; después, los brazos sueltos a los costados.", [f("j_takbir")]));
  }
  if (r <= 2) {
    p.push(paso("pie", "Al-Fatiha", "", [], { corpus: ["fatiha"], voz: REZOS[rezo].voz }));
    p.push(paso("pie", "Sura al-Ikhlas (u otra)", "", [], { corpus: ["ikhlas"], voz: REZOS[rezo].voz }));
  } else p.push(paso("pie", "Tasbihat arbaʿa", "En lugar de las suras.", [f("j_tasbihat", { veces: "×3" })], { voz: "baja" }));
  if (segunda) p.push(paso("pie", "Qunut", "Antes del ruku, con las manos alzadas.", [f("m_salawat", { nota: "o, más breve" })], { corpus: ["2:201"] }));
  p.push(paso("inclinado", "Ruku", "", [f("j_takbir", { antes: true, nota: "antes de inclinarte" }), f("j_ruku", { veces: "×3" })]));
  p.push(paso("pie", "Levantarse del ruku", "", [f("j_samia"), f("j_takbir", { nota: "antes de bajar al sujud" })]));
  p.push(paso("postrado", "Sujud", "La frente sobre la turba.", [f("j_suyud", { veces: "×3" })]));
  p.push(paso("sentado", "Sentado", "Entre los dos sujud.", [f("j_takbir")]));
  p.push(paso("postrado", "Segundo sujud", "Lo mismo.", [f("j_suyud", { veces: "×3" })]));
  if (conTashahhud) {
    p.push(paso("sentado", ultima ? "Tashahhud final" : "Tashahhud", ultima ? "Sentado." : "Sentado, sin salir del rezo.", [f("j_takbir", { antes: true, nota: "al sentarte" }), f("m_hamd"), f("j_tashahhud")]));
    if (ultima) p.push(paso("sentado", "Taslim", "Un solo saludo, de cara a la qibla.", [f("j_salam_nabi"), f("j_salam_alayna"), f("j_salam"), f("j_salam_agregado")]));
    else p.push(paso("pie", `De pie para la rakʿa ${r + 1}`, `Luego te levantás para la ${r + 1 === 3 ? "tercera" : "siguiente"}.`, []));
  } else p.push(paso("pie", `De pie para la rakʿa ${r + 1}`, "", [f("j_takbir", { nota: "al levantar la cabeza del sujud" })]));
  return p;
}

/** La forma larga del taʿawwudh (Abu Dawud 775) es la hanbali; la corta todavía no tiene fuente verificada. */
function taawwudh(esc: Escuela, antes = false): Formula {
  return esc === "hanbali" ? { id: "s_taawwudh", estatus: "sunna", antes } : { id: "s_taawwudh_corto", pendiente: "Taʿawwudh (fórmula corta): falta una fuente verificada", estatus: "sunna", antes };
}

function pasosSunni(esc: Escuela, rezo: Rezo, r: number, total: number): Paso[] {
  const p: Paso[] = [], primera = r === 1, segunda = r === 2, ultima = r === total, conTashahhud = segunda || ultima;
  if (primera) {
    p.push({ postura: "pie", nombre: "Intención", detalle: porEscuela(esc, ["Condición (shart) del rezo; en el corazón. Pronunciarla: las fuentes hanafis discrepan.", "Pilar; en el corazón. Pronunciarla está permitido, pero es mejor no hacerlo.", "Pilar; en el corazón. Pronunciarla es recomendable.", "Condición del rezo; en el corazón. Pronunciarla es recomendable."]), estatus: porEscuela<Estatus>(esc, ["condicion", "pilar", "pilar", "condicion"]), formulas: [], fuente: D(881) });
    p.push({ postura: "pie", nombre: "Takbīrat al-iḥrām", detalle: `Levantar las manos (sunna) ${porEscuela(esc, ["hasta las orejas (hombres).", "hasta los hombros.", "con las palmas a la altura de los hombros y los pulgares en los lóbulos.", "hasta los hombros o las orejas."])}`, formulas: [{ id: "takbir", estatus: porEscuela<Estatus>(esc, ["obligatorio", "pilar", "pilar", "pilar"]) }], estatus: porEscuela<Estatus>(esc, ["condicion", "pilar", "pilar", "pilar"]), fuente: D(899) });
    const istiftah = porEscuela<string | null>(esc, ["s_subhanaka", null, "s_wajjahtu", "s_subhanaka"]);
    const manos = porEscuela(esc, ["Manos bajo el ombligo (hombres).", "Brazos sueltos a los costados (sadl).", "Manos bajo el pecho, sobre el ombligo.", "Manos bajo el ombligo."]);
    p.push({ postura: "pie", nombre: "Apertura", detalle: manos + (istiftah ? "" : " La súplica de apertura y el taʿawwudh se desaconsejan en el rezo obligatorio."), formulas: istiftah ? [{ id: istiftah, estatus: "sunna" }, taawwudh(esc)] : [], estatus: "sunna", difiere: "Posición de las manos e istiftāḥ según la escuela; la escuela maliki no los usa.", fuente: JZ(225) });
  }
  const rec: Paso = { postura: "pie", nombre: "Qiyām: recitación", estatus: porEscuela<Estatus>(esc, ["obligatorio", "pilar", "pilar", "pilar"]), voz: r <= 2 ? REZOS[rezo].voz : "baja", fuente: D(923), detalle: "", formulas: [] };
  if (r <= 2) {
    rec.detalle = `Al-Fatiha y otra sura (${esc === "hanafi" ? "obligatoria para los hanafis" : "sunna"}).`;
    rec.corpus = ["fatiha", "ikhlas"];
    rec.formulas = esc === "shafii" && !primera ? [taawwudh(esc, true)] : [];
    rec.formulasDespues = esc === "maliki" ? [] : [{ id: "s_amin", estatus: "sunna", nota: esc === "hanafi" ? "en voz baja" : "tras Al-Fatiha" }];
  } else {
    rec.detalle = esc === "hanafi" ? "Al-Fatiha (sunna); también se permite el tasbīḥ tres veces o el silencio." : "Al-Fatiha sola.";
    rec.corpus = ["fatiha"];
    rec.formulas = esc === "shafii" ? [taawwudh(esc, true)] : [];
    rec.formulasDespues = esc === "maliki" ? [] : [{ id: "s_amin", estatus: "sunna" }];
  }
  p.push(rec);
  if (segunda && rezo === "fajr" && esc === "maliki") p.push({ postura: "pie", nombre: "Qunūt", detalle: "Recomendado en fajr, antes del rukūʿ.", formulas: [{ id: "s_qunut_maliki", pendiente: "Qunūt maliki: falta una fuente verificada de la fórmula", estatus: "recomendado" }], estatus: "recomendado", fuente: JZ(304) });
  const dhikr: Estatus = esc === "hanbali" ? "obligatorio" : "sunna";
  p.push({ postura: "inclinado", nombre: "Rukūʿ", detalle: "Inclinarse con las manos en las rodillas y la espalda recta.", formulas: [{ id: "s_ruku", estatus: dhikr, veces: esc === "maliki" ? "sin número fijo" : "×3" }], estatus: "pilar", fuente: D(946) });
  p.push({ postura: "pie", nombre: "Levantarse del rukūʿ", detalle: "Erguirse y quedarse quieto.", formulas: [{ id: "s_samia", estatus: dhikr, nota: "quien reza solo dice las dos frases" }], estatus: null, fuente: D(954) });
  if (segunda && rezo === "fajr" && esc === "shafii") p.push({ postura: "pie", nombre: "Qunūt", detalle: "En fajr, todos los días, después del rukūʿ.", formulas: [{ id: "s_qunut", estatus: "sunna" }], estatus: "sunna", difiere: "Hanafis y hanbalis no lo hacen en el obligatorio, salvo ante calamidades; los malikis, en fajr antes del rukūʿ.", fuente: JZ(305) });
  const sujud = (n: number): Paso => ({ postura: "postrado", nombre: `Sujūd ${n}`, detalle: esc === "maliki" ? "La frente es obligatoria; los demás apoyos, sunna." : esc === "hanafi" ? "Basta parte de la frente, una mano, una rodilla y algo de un pie." : `Siete apoyos: frente${esc === "hanbali" ? " y nariz" : ""}, palmas, rodillas y dedos de los pies.`, formulas: [{ id: "s_suyud", estatus: dhikr, veces: "×3" }], estatus: "pilar", fuente: D(966) });
  p.push(sujud(1));
  p.push({ postura: "sentado", nombre: "Entre las dos sajdas", detalle: `Sentarse ${esc === "hanafi" ? "(sunna para los hanafis)." : "y quedarse quieto."}`, formulas: esc === "hanafi" ? [] : [{ id: "s_entre", estatus: esc === "hanbali" ? "obligatorio" : "sunna" }], estatus: esc === "hanafi" ? "sunna" : "pilar", fuente: D(985) });
  p.push(sujud(2));
  const tash = porEscuela<string[]>(esc, [["s_tash_ibn_masud_1", "s_tash_ibn_masud_2"], ["s_tash_umar"], ["s_tash_ibn_abbas"], ["s_tash_ibn_masud_1", "s_tash_ibn_masud_2"]]);
  if (conTashahhud) {
    const estT = ultima ? porEscuela<Estatus>(esc, ["obligatorio", "sunna", "pilar", "pilar"]) : porEscuela<Estatus>(esc, ["obligatorio", "sunna", "sunna", "obligatorio"]);
    const fs: Formula[] = tash.map(id => ({ id, estatus: estT }));
    if (ultima) fs.push({ id: "s_ibrahimiyya", estatus: porEscuela<Estatus>(esc, ["sunna", "sunna", "pilar", "pilar"]) }, { id: "s_refugios", estatus: "sunna" });
    const tawarruk = "con el pie izquierdo debajo de la pierna derecha (tawarruk).", iftirash = "sobre el pie izquierdo (iftirāsh).";
    p.push({ postura: "sentado", nombre: ultima ? "Tashahhud final" : "Primer tashahhud", detalle: `Sentado ${porEscuela(esc, [iftirash, "apoyando la pierna y la nalga izquierdas en el suelo.", ultima ? tawarruk : iftirash, ultima && total > 2 ? tawarruk : iftirash])}`, formulas: fs, estatus: estT, difiere: "Cada escuela usa su tashahhud: Ibn Masʿūd (hanafi, hanbali), Ibn ʿAbbās (shafi'i), ʿUmar (maliki).", fuente: JZ(212) });
  }
  if (ultima) {
    const est = porEscuela<Estatus>(esc, ["obligatorio", "pilar", "pilar", "pilar"]);
    p.push({ postura: "sentado", nombre: "Taslīm", detalle: porEscuela(esc, ["A la derecha y a la izquierda.", "Una vez, «as-salāmu ʿalaykum».", "A la derecha (pilar) y a la izquierda (sunna).", "A la derecha y a la izquierda; los dos son obligatorios."]), formulas: [{ id: "s_taslim", estatus: est, veces: esc === "maliki" ? "×1" : "×2" }], estatus: est, fuente: D(1022) });
  } else {
    const est: Estatus = esc === "hanbali" ? "obligatorio" : "sunna";
    p.push({ postura: "pie", nombre: `Levantarse para la rakʿa ${r + 1}`, detalle: `Con takbīr (${esc === "hanbali" ? "obligatorio" : "sunna"}).`, formulas: [{ id: "takbir", estatus: est }], estatus: est, fuente: D(903) });
  }
  return p;
}

/** Los pasos del rezo, rakʿa por rakʿa. De viaje, los rezos de cuatro rakʿas se acortan a dos. */
/** Súplicas de Sistani que no están en las notas del usuario: fuera de la guía por ahora (decisión del
 *  23/10/2026: los textos son los de sus notas). Siguen en los pasos y en la planilla; vuelven si él da
 *  su texto. «Subḥāna llāh» sale solo como alternativa en rukūʿ y sujūd: en el tasbīḥ de Fátima se queda. */
const SIN_TEXTO_PROPIO = new Set(["j_ya_muhsin", "j_taawwudh", "j_hamd", "j_kadhalika", "j_ya_khayr", "j_istighfar", "j_bihawli", "j_taqabbal", "j_shukr", "j_qunut", "j_antes_tash"]);
const conTextoPropio = (f: Formula) => !(f.id && SIN_TEXTO_PROPIO.has(f.id)) && !(f.id === "j_subhanallah" && f.nota === "en lugar de la anterior");
const soloTextoPropio = (pasos: Paso[]): Paso[] => pasos.map(p => ({ ...p, formulas: p.formulas.filter(conTextoPropio), formulasDespues: p.formulasDespues?.filter(conTextoPropio) }));

export function armarRezo(escuela: Escuela, rezo: Rezo, op: Opciones): RezoArmado {
  const total = op.viajero && REZOS[rezo].rakats === 4 ? 2 : REZOS[rezo].rakats;
  const jafari = escuela === "jafari", practica = jafari && op.perfil === "practica", combinado = !!op.combinado;
  const sistani = jafari && !practica, filtro = (p: Paso[]) => sistani ? soloTextoPropio(p) : p;
  const pasos = (r: number) => practica ? pasosPractica(rezo, r, total) : jafari ? pasosJafari(rezo, r, total) : pasosSunni(escuela, rezo, r, total);
  return {
    rezo, total, practica,
    antes: filtro(practica ? antesJafari(rezo, combinado, null, false) : jafari ? antesJafari(rezo, combinado, "recomendado", true) : []),
    rakats: Array.from({ length: total }, (_, i) => ({ rakat: i + 1, pasos: filtro(pasos(i + 1)) })),
    despues: filtro(practica ? despuesJafari(null, false) : jafari ? despuesJafari("recomendado", true) : []),
  };
}

/** Cómo avanza el acompañamiento: un toque por paso, un toque por rakʿa o, en Android, toques más
 *  el sensor de proximidad, que lleva a cada sujūd y pasa al paso siguiente al levantarse. */
export type Avance = "tocar" | "contador" | "sensor";
/** `rakat` es 0 antes del rezo (adhan e iqama) y total + 1 en la taʿqībāt. */
export interface PasoEnCurso { rakat: number; paso: Paso; indice: number; delRakat: Paso[] }
/** Los pasos visibles en el orden en que se rezan, para acompañarlos de a uno. */
export function pasosEnOrden(r: RezoArmado, completo: boolean): PasoEnCurso[] {
  const tramo = (lista: Paso[], rakat: number) => {
    const pasos = lista.filter(p => visible(p.estatus, completo));
    return pasos.map((paso, indice) => ({ rakat, paso, indice, delRakat: pasos }));
  };
  return [...tramo(r.antes, 0), ...r.rakats.flatMap(k => tramo(k.pasos, k.rakat)), ...tramo(r.despues, r.total + 1)];
}

/** Transliteración de lo que se recita del Corán, aleya por aleya (planilla, ids q_<sura>_<aleya>). El árabe y la
 *  traducción son los del lector (Tanzil y Bórnez): estas filas solo aportan la transliteración revisada. */
export const TRANSLIT_CORAN: Record<Lectura, string[]> = {
  fatiha: ["q_1_1", "q_1_2", "q_1_3", "q_1_4", "q_1_5", "q_1_6", "q_1_7"],
  ikhlas: ["q_112_1", "q_112_2", "q_112_3", "q_112_4"],
  "2:201": ["q_2_201"],
};

/** Clave de pronunciación de la transliteración estricta (la de la planilla y la de Sistani). */
export const CLAVE_TRANSLITERACION: [string, string][] = [
  ["ā ī ū", "vocal larga: se alarga, como «aa», «ii», «uu»"],
  ["ʿ", "ʿayn: un sonido apretado en la garganta (ʿalā, ʿaẓīm)"],
  ["ʾ", "hamza: un corte breve de la voz"],
  ["ḥ", "h fuerte desde la garganta, como un suspiro: no raspa (Muḥammad, ḥamd)"],
  ["kh", "como la j castellana (khayr)"],
  ["gh", "g gargarizada, parecida a la r francesa (ghayri)"],
  ["th", "como la z castellana, con la lengua entre los dientes"],
  ["dh", "como la d suave de «cada»: la th del inglés «this» (dhālika)"],
  ["ẓ", "la misma dh, pero enfática, con la lengua más atrás (ʿaẓīm)"],
  ["ṣ ḍ ṭ", "s, d y t enfáticas: más graves, con la boca más cerrada (ṣalāh, ḍāllīn, ṣirāṭ)"],
  ["q", "k desde el fondo de la garganta (qad qāmati)"],
  ["sh", "como la sh del inglés «she» (ash-hadu)"],
  ["j", "como la j del inglés «jam», o la «y» de «yo» bien marcada (rajīm)"],
  ["l- / al-", "el artículo: se une a la palabra siguiente y a veces se asimila (ṣ-ṣalāh = aṣ-ṣalāh)"],
];

// ---------------------------------------------------- casos especiales (investigacion-mujer-viajero.md)

export interface Caso { texto: string; fuente: Fuente }
const SIS_VIAJE: Fuente = { etiqueta: "Sistani, Islamic Laws, rezo del viajero", url: "https://www.sistani.org/english/book/48/2264/" };

export const VIAJE: Record<Escuela, Caso> = {
  jafari: { texto: "De viaje, Dhuhr, Asr e Isha se rezan de dos rakʿas: es obligatorio. Distancia: 8 farsakh, unos 44 km según la oficina de Sistani, sumando ida y vuelta. Deja de ser viajero con la intención de quedarse 10 días, con 30 días de indecisión o al detenerse en su ciudad. Quien viaja por oficio o muy seguido reza completo. Si el viaje es ilícito, se reza completo.", fuente: SIS_VIAJE },
  hanafi: { texto: "Acortar es obligatorio (wājib). Distancia: tres días de marcha; las fuentes consultadas no dan una equivalencia en km. Deja de ser viajero con la intención de quedarse 15 días. Si el viaje es ilícito, igual se acorta.", fuente: { etiqueta: "al-Jazīrī, p. 425–433", url: "https://shamela.ws/book/9849/425" } },
  maliki: { texto: "Acortar es sunna muʾakkada. Distancia: 48 millas, entre unos 80 y 88 km según la fuente. Deja de ser viajero con la intención de quedarse 4 días completos (20 rezos). Si el viaje es ilícito, igual se acorta.", fuente: { etiqueta: "al-Jazīrī, p. 425–433; dorar.net 1453", url: "https://dorar.net/feqhia/1453" } },
  shafii: { texto: "Acortar está permitido; es mejor si el viaje llega a tres etapas. Distancia: 48 millas, entre unos 80 y 88 km según la fuente. Deja de ser viajero con la intención de quedarse 4 días completos. Si el viaje es ilícito, no se acorta.", fuente: { etiqueta: "al-Jazīrī, p. 425–433; dorar.net 1453", url: "https://dorar.net/feqhia/1453" } },
  hanbali: { texto: "Acortar está permitido. Si es mejor acortar o completar, las fuentes difieren: según Ibn Qudāma (citado en dorar.net 1450), acortar es mejor; al-Jazīrī (p. 426) dice las dos cosas. Distancia: 48 millas, entre unos 80 y 88 km según la fuente. Deja de ser viajero con la intención de quedarse más de 4 días o más de 20 rezos. Si el viaje es ilícito, no se acorta.", fuente: { etiqueta: "dorar.net 1450 y 1453; al-Jazīrī, p. 431–433", url: "https://dorar.net/feqhia/1450" } },
};

export const COMBINAR: Record<Escuela, Caso & { puede: boolean | "causa" }> = {
  jafari: { puede: true, texto: "Se pueden rezar uno tras otro siempre, en orden (primero el del mediodía o el del ocaso). No hace falta una intención especial de combinar, y en el medio se puede rezar la nāfila o hacer súplicas.", fuente: { etiqueta: "Sistani, Islamic Laws, reglas 717, 725 y 908", url: "https://www.sistani.org/english/book/48/2209/" } },
  hanafi: { puede: false, texto: "Solo se combinan en ʿArafa y Muzdalifa, durante la peregrinación.", fuente: { etiqueta: "al-Jazīrī, p. 436", url: "https://shamela.ws/book/9849/436" } },
  maliki: { puede: "causa", texto: "Con causa: viaje, enfermedad, lluvia o barro con oscuridad (Maghrib e Isha, en la mezquita). Rezar algo en el medio es desaconsejado.", fuente: { etiqueta: "al-Jazīrī, p. 437–438", url: "https://shamela.ws/book/9849/437" } },
  shafii: { puede: "causa", texto: "Con causa: viaje de la distancia del acortamiento (adelantando o atrasando) o lluvia (solo adelantando). Al adelantar: primero el rezo del tiempo, intención de combinar en el primero y sin pausa larga ni la sunna rātiba en el medio.", fuente: { etiqueta: "al-Jazīrī, p. 438–439; dorar.net 1510", url: "https://dorar.net/feqhia/1510" } },
  hanbali: { puede: "causa", texto: "Con causa: viaje, enfermedad, istiḥāḍa, lactancia y otras dificultades; lluvia o frío intenso para Maghrib e Isha. El orden es condición; intención en el primer rezo y nada más que la iqāma y una ablución breve en el medio.", fuente: { etiqueta: "al-Jazīrī, p. 440; dorar.net 1510", url: "https://dorar.net/feqhia/1510" } },
};

export const MUJER: Record<Escuela, Caso> = {
  jafari: { texto: "Cobertura: todo el cuerpo, incluidos el cabello y el cuello; no hace falta cubrir el rostro, las manos hasta las muñecas ni los pies hasta los tobillos. Si reza en el mismo cuarto que un hombre, también el esposo, hay una distancia o una separación mínima.", fuente: { etiqueta: "Sistani, Islamic Laws, reglas 776 y 873–874", url: "https://www.sistani.org/english/book/48/2219/" } },
  hanafi: { texto: "Cobertura: todo el cuerpo salvo el rostro, las palmas y los pies. Las diferencias de postura son sunna.", fuente: { etiqueta: "al-Jazīrī, p. 169–170; dorar.net 874", url: "https://dorar.net/feqhia/874" } },
  maliki: { texto: "Cobertura en dos niveles: descubrir la parte grave invalida el rezo; la leve, no. Rostro y manos no se cubren.", fuente: { etiqueta: "al-Jazīrī, p. 169–170", url: "https://shamela.ws/book/9849/169" } },
  shafii: { texto: "Cobertura: todo el cuerpo salvo el rostro y las manos. Las diferencias de postura son sunna.", fuente: { etiqueta: "al-Jazīrī, p. 169–170", url: "https://shamela.ws/book/9849/169" } },
  hanbali: { texto: "Cobertura: todo el cuerpo salvo el rostro; también las manos. Las diferencias de postura son sunna.", fuente: { etiqueta: "al-Jazīrī, p. 169; dorar.net 874", url: "https://dorar.net/feqhia/874" } },
};

const DURACION: Fuente = { etiqueta: "al-Jazīrī, p. 115–120; dorar.net 630", url: "https://shamela.ws/book/9849/115" };
export const MENSTRUACION: Record<Escuela, { hayd: string; nifas: string; fuente: Fuente; extra?: string }> = {
  jafari: { hayd: "entre 3 y 10 días", nifas: "hasta 10 días", fuente: { etiqueta: "Sistani, Islamic Laws, reglas 438, 459, 466 y 497–507", url: "https://www.sistani.org/english/book/48/2172/" },
            extra: "A la hora de cada rezo se recomienda hacer la ablución, sentarse en el lugar de rezo hacia la qibla y dedicarse al dhikr, la súplica y la ṣalawāt; lo mejor, las tasbīḥāt al-arbaʿa." },
  hanafi: { hayd: "entre 3 y 10 días", nifas: "hasta 40 días", fuente: DURACION },
  maliki: { hayd: "hasta 15 días (sin mínimo para el culto)", nifas: "hasta 60 días", fuente: DURACION },
  shafii: { hayd: "de un día y una noche a 15 días", nifas: "hasta 60 días (lo habitual, 40)", fuente: DURACION },
  hanbali: { hayd: "de un día y una noche a 15 días", nifas: "hasta 40 días", fuente: DURACION },
};

/** Notas para la mujer dentro de cada paso: todas recomendadas o sunna, ninguna condición de validez. */
export function notaMujer(escuela: Escuela, paso: Paso, rezo: Rezo): Caso | null {
  const alto = REZOS[rezo].voz === "alta" && paso.voz === "alta";
  const J: Record<string, string> = {
    "Qiyām: recitación": "Pies juntos." + (alto ? " Puede elegir voz alta o baja; en voz baja si la puede oír un hombre no maḥram." : ""),
    "Rukūʿ": "Las manos por encima de las rodillas, sin echar las rodillas hacia atrás.",
    "Sujūd 1": "Baja apoyando primero las rodillas; codos y antebrazos en el suelo, el vientre cerca del suelo y recogida.",
    "Tashahhud": "Muslos juntos.", "Tashahhud final": "Muslos juntos.",
  };
  J["Al-Fatiha"] = J["Qiyām: recitación"]; J["Ruku"] = J["Rukūʿ"]; J["Sujud"] = J["Sujūd 1"];
  const S: Partial<Record<Escuela, Record<string, string | null>>> = {
    hanafi: { "Takbīrat al-iḥrām": "Manos hasta los hombros.", "Apertura": "Manos sobre el pecho (otra fuente hanafi: debajo de los senos).", "Rukūʿ": "Brazos junto al cuerpo; se inclina poco, con las rodillas flexionadas.", "Sujūd 1": "Se baja más, con los antebrazos en el suelo y el vientre pegado a los muslos.", "Primer tashahhud": "Se sienta en tawarruk.", "Tashahhud final": "Se sienta en tawarruk." },
    maliki: { "Sujūd 1": "Recogida.", "Qiyām: recitación": alto ? "Su voz alta es oírse a sí misma." : null },
    shafii: { "Rukūʿ": "Junta los miembros.", "Sujūd 1": "Junta los miembros y el vientre con los muslos.", "Qiyām: recitación": alto ? "La voz alta es sunna si no la oye un hombre ajeno; si no, voz baja." : null },
    hanbali: { "Rukūʿ": "No separa los brazos; se recoge.", "Sujūd 1": "No separa los brazos; se recoge.", "Primer tashahhud": "Se sienta con las piernas hacia la derecha.", "Tashahhud final": "Se sienta con las piernas hacia la derecha.", "Qiyām: recitación": alto ? "La voz alta no es sunna para ella; en voz baja si la oye un hombre ajeno." : null },
  };
  const texto = escuela === "jafari" ? J[paso.nombre] : S[escuela]?.[paso.nombre];
  if (!texto) return null;
  return { texto, fuente: escuela === "jafari" ? IL("963, 980, 1030, 1077 y 1090", "https://www.sistani.org/english/book/48/2237/") : { etiqueta: "al-Jazīrī, p. 217–240; Dar al-Iftāʾ 15495", url: "https://shamela.ws/book/9849/240" } };
}

// ---------------------------------------------------- textos de las fórmulas (public/rezo/formulas.json)

export interface TextoFormula { ar: string; tr: string; es: string; fuente: string; reviso: string }
let cargando: Promise<Record<string, TextoFormula>> | null = null;
/** Solo trae las fórmulas transcritas y revisadas; las demás se muestran como pendientes. */
export function cargarFormulas(): Promise<Record<string, TextoFormula>> {
  // En desarrollo se relee cada vez: lo que se pasa de la planilla se ve al volver a abrir la guía.
  if (!cargando || import.meta.env.DEV) cargando = fetch("/rezo/formulas.json")
    .then(r => (r.ok ? r.json() : { formulas: {} }))
    .then((d: { formulas?: Record<string, TextoFormula> }) => d.formulas ?? {})
    .catch(() => ({}));
  return cargando;
}
