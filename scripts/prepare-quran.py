#!/usr/bin/env python3
"""Prepara metadatos y procedencia a partir de recursos originales ya descargados.
No descarga, modifica ni genera aleyas. Ejecutar desde la raíz del repositorio.
"""
from pathlib import Path
import hashlib
import json
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1] / 'public' / 'quran'
metadata = ET.fromstring((root / 'quran-data.xml').read_bytes())
suras = [dict(number=int(e.attrib['index']), count=int(e.attrib['ayas']),
              name=e.attrib['tname'], arabic_name=e.attrib['name'])
         for e in metadata.find('suras')]
if [s['number'] for s in suras] != list(range(1, 115)) or sum(s['count'] for s in suras) != 6236:
    raise ValueError('Los metadatos no corresponden al corpus esperado.')
keys = [f"{s['number']}|{aya}" for s in suras for aya in range(1, s['count'] + 1)]
for name in ['quran-uthmani.txt', 'es.bornez.txt']:
    rows = []
    for line in (root / name).read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        fields = line.split('|', 2)
        if len(fields) != 3 or not fields[2]:
            raise ValueError('Línea inválida en ' + name)
        rows.append('|'.join(fields[:2]))
    if rows != keys:
        raise ValueError('Faltan aleyas o hay identificadores inesperados en ' + name)
    print(name + ': 6236 aleyas, identificadores completos y ordenados')

(root / 'suras.json').write_text(json.dumps({
    'source': 'https://tanzil.net/res/text/metadata/quran-data.xml',
    'copyright': metadata.attrib['copyright'], 'license': metadata.attrib['license'],
    'version': metadata.attrib['version'], 'suras': suras,
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
# Copia de metadatos para importación JS: Vite no importa módulos desde public/.
frontend_metadata = root.parents[1] / 'src' / 'data' / 'quran-suras.json'
frontend_metadata.parent.mkdir(parents=True, exist_ok=True)
frontend_metadata.write_bytes((root / 'suras.json').read_bytes())
arabic = (root / 'quran-uthmani.txt').read_text(encoding='utf-8')
notice = arabic[arabic.index('# PLEASE DO NOT REMOVE'):]
(root / 'ARABIC-LICENSE.txt').write_text(notice, encoding='utf-8')
urls = {
    'quran-uthmani.txt': 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&marks=true&sajdah=true&tatweel=true&agree=true',
    'es.bornez.txt': 'https://tanzil.net/trans/es.bornez',
    'quran-data.xml': 'https://tanzil.net/res/text/metadata/quran-data.xml',
    'suras.json': 'Metadatos derivados de quran-data.xml; atribución incluida',
    'fonts/AmiriQuran.ttf': 'https://github.com/aliftype/amiri/releases/download/1.003/Amiri-1.003.zip',
    'fonts/OFL.txt': 'https://github.com/aliftype/amiri/releases/download/1.003/Amiri-1.003.zip',
    'ARABIC-LICENSE.txt': 'Aviso reproducido del archivo quran-uthmani.txt',
    'TRANSLATION-TERMS.txt': 'https://tanzil.net/trans/',
}
manifest = {
    'retrieved': '2026-10-18', 'arabic_version': 'Tanzil Uthmani 1.1',
    'translation': 'Raúl González Bórnez · es.bornez · 2014-07-15 (según el archivo Tanzil; ISBN no identificado)',
    'font_version': 'Amiri 1.003',
    'files': [{'path': name, 'source': url, 'bytes': (root / name).stat().st_size,
               'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()}
              for name, url in urls.items()],
}
(root / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Recursos: ' + str(sum(f['bytes'] for f in manifest['files'])) + ' bytes (sin manifiesto ni documentación)')
