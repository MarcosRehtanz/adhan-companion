"""Escritura coránica para el árabe de las notas del usuario (decisión del usuario, 23/10/2026: las
palabras y el orden son los de sus notas; la escritura se ajusta al Corán de la app).

1. Frases: la secuencia más larga de palabras de las notas que aparece seguida en una aleya
   (Tanzil Uthmani, public/quran/quran-uthmani.txt) se toma tal cual, con sus signos.
2. Palabras sueltas: la forma del Corán con las mismas letras y vocales compatibles (las del usuario
   incluidas en las del Corán), la más frecuente; con «وَ»/«فَ» delante, se prueba sin ella.
3. Una palabra del Corán en otro caso (otra vocal final) toma su escritura con la vocal de las notas
   (صَلَاةَ → صَلَوٰةَ, como «صَلَوٰةِ ٱلْفَجْرِ» de 24:58). Lo que no está en el Corán queda como en las notas,
   con la alif del artículo como ٱ y la ya final sin puntos (ى), como en todo el texto.
4. Signos que dependen de la palabra siguiente, con las reglas del mismo texto: madda de «lā» antes
   de hamza, alif pequeña sobre ى (ىٰ) salvo antes de ٱ, y marca del pronombre (هُۥ, هِۦ) salvo antes de ٱ.
Nunca agrega ni cambia palabras: el resultado lo revisa y aprueba el usuario en la planilla.

Uso: python3 scripts/escritura-coranica.py "<árabe de las notas>"
"""
import re, sys, unicodedata
from pathlib import Path
from collections import Counter

DAGA = "ٰ"
MARCAS = set(chr(c) for c in range(0x064B, 0x0656)) | {DAGA}
ANOTACIONES = re.compile("[ۖ-ۭ]")

def letras(w, variante=0, notas=False):
    # En el Corán, la madda de «لَآ» va como signo aparte (ا + ٓ) y no se compone: es un signo de
    # recitación. En las notas, «آ» al escribir «آل» es hamza + ā, que el Corán escribe ءَا.
    if notas: w = unicodedata.normalize('NFC', w).replace('\u0622', '\u0621\u064E\u0627')
    else: w = unicodedata.normalize('NFC', w).replace('\u0622', '\u0627\u0653')
    w = w.replace('\u0640', '')
    w = ANOTACIONES.sub("", w)
    out = []
    for ch in w:
        if ch == DAGA:
            if out and out[-1][0] in ("و", "ي"):
                if variante == 1: out[-1][0] = "ا"
                continue
            out.append(["ا", set()]); continue
        if ch in MARCAS:
            if out: out[-1][1].add(ch)
            continue
        out.append([{"ٱ": "ا", "ى": "ي"}.get(ch, ch), set()])
    return out

def clave(ls): return "".join(b for b, _ in ls)
def compatible(n, q):
    if len(n) != len(q): return False
    for (b1, m1), (b2, m2) in zip(n, q):
        if b1 != b2: return False
        m1 = m1 - {"ْ"}  # la sukūn del usuario puede no estar escrita en el mushaf
        m2 = m2 - {"ْ", "ٓ"}  # ni la madda, que es un signo de recitación
        if not m1 <= m2: return False
    return True

VERSOS, FREC, INDICE = [], Counter(), {}
for l in open(Path(__file__).resolve().parents[1] / "public" / "quran" / "quran-uthmani.txt", encoding="utf-8"):
    if not l.strip() or l.startswith("#"): continue
    s, a, t = l.rstrip("\n").split("|", 2)
    ws = [w for w in t.split(" ") if re.search("[ء-يٱ]", w)]
    VERSOS.append((f"{s}:{a}", ws, [letras(w) for w in ws], [letras(w, 1) for w in ws]))
    for w in ws:
        FREC[w] += 1
        for v in (0, 1): INDICE.setdefault(clave(letras(w, v)), set()).add(w)

def igual(n, verso, k):
    return compatible(n, verso[2][k]) or compatible(n, verso[3][k])

def frase(palabras, i):
    """Secuencia más larga (≥2) desde i que aparece seguida en el Corán: (largo, formas, aleya)."""
    ns = [letras(w, notas=True) for w in palabras]
    mejor = (0, None, None)
    for verso in VERSOS:
        q = verso[1]
        for k in range(len(q)):
            if not igual(ns[i], verso, k): continue
            j = 1
            while i + j < len(ns) and k + j < len(q) and igual(ns[i + j], verso, k + j): j += 1
            if j >= 2 and j > mejor[0]: mejor = (j, q[k:k + j], verso[0])
    return mejor

def suelta(w):
    n = letras(w, notas=True)
    cands = []
    for v in (0, 1):
        for q in INDICE.get(clave(letras(w, v, notas=True)), ()):
            if compatible(n, letras(q, 0)) or compatible(n, letras(q, 1)): cands.append(q)
    return sorted(set(cands), key=lambda q: -FREC[q])

FINALES = "\u064B\u064C\u064D\u064E\u064F\u0650"
def con_otra_terminacion(w):
    """La misma palabra en el Corán con otro caso (otra vocal final): su escritura, con la vocal de las notas."""
    fin = re.search(f"[{FINALES}]+$", w)
    if not fin: return None
    raiz = w[:fin.start()]
    n = letras(raiz, notas=True)
    cands = []
    for v in (0, 1):
        for q in INDICE.get(clave(letras(raiz, v, notas=True)), ()):
            qr = re.sub(f"[{FINALES}]+$", "", q)
            if compatible(n, letras(qr, 0)) or compatible(n, letras(qr, 1)): cands.append((FREC[q], qr))
    return max(cands)[1] + fin.group(0) if cands else None

def ref(q):
    for v in VERSOS:
        if q in v[1]: return v[0]

def convertir(texto):
    """Devuelve (texto coránico, detalle por tramo)."""
    toks = re.findall(r"[^\s،.]+|[،.]", texto)
    palabras = [t for t in toks if t not in "،."]
    salida, detalle, i = [], [], 0
    while i < len(palabras):
        largo, formas, aleya = frase(palabras, i)
        if largo:
            salida += formas; detalle.append((" ".join(palabras[i:i + largo]), " ".join(formas), f"frase de {aleya}")); i += largo; continue
        w = palabras[i]
        c = suelta(w)
        if c: salida.append(c[0]); detalle.append((w, c[0], f"palabra de {ref(c[0])}"))
        else:
            hecho = False
            for p in ("وَ", "فَ"):
                if w.startswith(p) and (c := suelta(w[len(p):])):
                    salida.append(p + c[0]); detalle.append((w, p + c[0], f"«{p}» + palabra de {ref(c[0])}")); hecho = True; break
            if not hecho and (f := con_otra_terminacion(w)):
                salida.append(f); detalle.append((w, f, "otro caso de una palabra del Corán: su escritura, con tu vocal final")); hecho = True
            if not hecho:
                f = re.sub(r"^(وَ|فَ|بِ)?ال", lambda m: (m.group(1) or "") + "ٱل", w)
                f = re.sub("\u064A(?=[\u064B-\u0652]*$)", "\u0649", f)  # ya final sin puntos, como en todo el texto
                salida.append(f); detalle.append((w, f, "no está en el Corán: tus palabras, con la escritura del Corán" if f != w else "no está en el Corán: queda como en tus notas"))
        i += 1
    # Signos que dependen de la palabra siguiente, con las reglas del mismo texto del Corán:
    # la madda al final de palabra solo antes de hamza; la marca del pronombre -hu/-hi (tras vocal
    # breve; no la h de «Allah») antes de cualquier palabra salvo ٱ, al final y antes de una pausa.
    pausa_tras, k = set(), -1
    for t in toks:
        if t in "،.": pausa_tras.add(k)
        else: k += 1
    for n, w in enumerate(salida):
        sig = salida[n + 1] if n + 1 < len(salida) and n not in pausa_tras else None
        antes_de_hamza = bool(sig and sig[0] in "\u0623\u0625\u0621\u0622")
        if w.endswith("\u0627\u0653") and not antes_de_hamza:
            w = w[:-1]
        elif w.endswith("\u064E\u0627") and antes_de_hamza:
            w = w + "\u0653"  # lā antes de hamza: «لَآ إِلَـٰهَ», como en 37:35
        # ā final escrita ى: lleva alif pequeña (ىٰ) salvo antes de ٱ (1512 y 569 casos en el texto).
        if re.search("\u064E\u0649\u0670?$", w):
            w = w.rstrip("\u0670") + ("" if sig and sig.startswith("\u0671") else "\u0670")
        base = w.rstrip("\u06E5\u06E6")
        if re.search("[\u064E-\u0650]\u0647[\u064F\u0650]$", base) and not clave(letras(base)).endswith("\u0644\u0644\u0647"):
            marca = "\u06E5" if base.endswith("\u064F") else "\u06E6"
            w = base if sig and sig.startswith("\u0671") else base + marca
        salida[n] = w
    # Puntuación del usuario en su lugar
    out, k = [], 0
    for t in toks:
        if t in "،.": out[-1] = out[-1] + t if out else t
        else: out.append(salida[k]); k += 1
    return " ".join(out), detalle


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__.strip())
    texto, detalle = convertir(sys.argv[1].strip())
    print(texto)
    for notas, coran, origen in detalle:
        print(f"  {notas}  →  {coran}   [{origen}]")
