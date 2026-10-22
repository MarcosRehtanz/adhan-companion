#!/usr/bin/env python3
"""Pasa a public/rezo/formulas.json las fórmulas listas de la planilla de transcripción.

Uso: python3 scripts/planilla-formulas.py <planilla.xlsx> [--comprobar]

Una fila está lista cuando tiene el árabe, la transliteración y la traducción revisadas
y las iniciales de quien revisó (la misma regla que la columna «Estado» de la planilla).
No transcribe, corrige ni completa texto: copia lo que tipeó la persona que revisa.
Con --comprobar solo informa, sin escribir. Solo usa la biblioteca estándar.
"""
from pathlib import Path
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'p': 'http://schemas.openxmlformats.org/package/2006/relationships'}
HOJA = 'Fórmulas'
COLUMNAS = {'id': 'Id (para la app)', 'fuente': 'Referencia', 'ar': 'Árabe (transcribir)',
            'tr': 'Transliteración revisada', 'es': 'Traducción revisada', 'reviso': 'Revisó'}
REPO = Path(__file__).resolve().parents[1]
SALIDA = REPO / 'public' / 'rezo' / 'formulas.json'


def texto(nodo):
    return ''.join(t.text or '' for t in nodo.iter('{%s}t' % NS['m']))


def leer_hoja(ruta):
    with zipfile.ZipFile(ruta) as z:
        libro = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        hoja = next((h for h in libro.iterfind('m:sheets/m:sheet', NS) if h.get('name') == HOJA), None)
        if hoja is None:
            raise SystemExit(f'La planilla no tiene la hoja «{HOJA}».')
        destino = next(r.get('Target') for r in rels.iterfind('p:Relationship', NS)
                       if r.get('Id') == hoja.get('{%s}id' % NS['r']))
        destino = destino.lstrip('/') if destino.startswith('/') else 'xl/' + destino
        compartidos = []
        if 'xl/sharedStrings.xml' in z.namelist():
            compartidos = [texto(si) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iterfind('m:si', NS)]
        filas = {}
        for c in ET.fromstring(z.read(destino)).iterfind('m:sheetData/m:row/m:c', NS):
            col, fila = re.fullmatch(r'([A-Z]+)(\d+)', c.get('r')).groups()
            tipo, v = c.get('t'), c.find('m:v', NS)
            if tipo == 'inlineStr':
                valor = texto(c.find('m:is', NS))
            elif v is None:
                continue
            elif tipo == 's':
                valor = compartidos[int(v.text)]
            else:
                valor = v.text or ''
            filas.setdefault(int(fila), {})[col] = valor
    return filas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    comprobar = '--comprobar' in sys.argv[1:]
    if len(args) != 1:
        raise SystemExit(__doc__.strip())
    filas = leer_hoja(args[0])
    encabezado = {v.strip(): k for k, v in filas.get(1, {}).items()}
    faltan = [n for n in COLUMNAS.values() if n not in encabezado]
    if faltan:
        raise SystemExit('Faltan columnas en la fila 1: ' + ', '.join(faltan))
    col = {k: encabezado[n] for k, n in COLUMNAS.items()}
    # Ids que usa la guía: cualquier cadena entre comillas de src/lib/guia.ts.
    conocidos = set(re.findall(r'"([a-z][a-z0-9_]*)"', (REPO / 'src' / 'lib' / 'guia.ts').read_text(encoding='utf-8')))

    formulas, pendientes, errores, avisos = {}, [], [], []
    for n in sorted(filas)[1:]:
        celdas = {k: unicodedata.normalize('NFC', filas[n].get(c, '')).strip() for k, c in col.items()}
        fid = celdas['id']
        if not fid or fid == 'ejemplo':
            continue
        if fid not in conocidos:
            errores.append(f'fila {n}: el id «{fid}» no aparece en src/lib/guia.ts')
        if fid in formulas or fid in pendientes:
            errores.append(f'fila {n}: el id «{fid}» está repetido')
        if not all(celdas[k] for k in ('ar', 'tr', 'es', 'reviso')):
            pendientes.append(fid)
            continue
        if not celdas['fuente'] or celdas['fuente'].startswith('Falta'):
            errores.append(f'fila {n} ({fid}): falta la referencia de la fuente')
        ar = celdas['ar']
        if not re.search('[ء-ي]', ar):
            errores.append(f'fila {n} ({fid}): la columna del árabe no tiene letras árabes')
        if re.search('[A-Za-z]', ar):
            errores.append(f'fila {n} ({fid}): la columna del árabe tiene letras latinas')
        if re.search('[کی]', ar):
            avisos.append(f'fila {n} ({fid}): el árabe usa la kaf o la ye persas (U+06A9, U+06CC); revisar si es a propósito')
        formulas[fid] = {k: celdas[k] for k in ('ar', 'tr', 'es', 'fuente', 'reviso')}

    for a in avisos:
        print('Aviso:', a)
    if errores:
        for e in errores:
            print('Error:', e, file=sys.stderr)
        raise SystemExit(f'{len(errores)} errores; no se escribió {SALIDA.relative_to(REPO)}.')
    print(f'{len(formulas)} listas, {len(pendientes)} pendientes.')
    if comprobar:
        return
    SALIDA.write_text(json.dumps({'schema': 1, 'formulas': formulas}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Escrito', SALIDA.relative_to(REPO))


if __name__ == '__main__':
    main()
