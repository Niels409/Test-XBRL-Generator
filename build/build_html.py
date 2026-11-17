"""Builds the single-file offline app.

python3 build/build_html.py <template.xlsx> <out.html> [--sets <scenario sets dir>] [--vt15 <appdata-vt15.json>]
--vt15 replaces data/appdata-vt15.json (e.g. a local, bank-specific residential VT15 base that is not in the repository).
"""
import argparse, base64, json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'app')
ap = argparse.ArgumentParser()
ap.add_argument('template'); ap.add_argument('out')
ap.add_argument('--sets'); ap.add_argument('--vt15', default=os.path.join(ROOT, 'data', 'appdata-vt15.json'))
a = ap.parse_args()
rd = lambda p: open(p, encoding='utf-8').read()
t = rd(os.path.join(A, 'index.template.html'))
data = rd(os.path.join(ROOT, 'data', 'appdata-vt17.json')).replace('</', '<\\/')
data15 = rd(a.vt15).replace('</', '<\\/')
core = rd(os.path.join(A, 'core.js')); xl = rd(os.path.join(A, 'xlsx.js'))
for s in (core, xl):
    assert '</script' not in s.lower()
sets = []
if a.sets:
    for it in json.load(open(os.path.join(a.sets, 'index.json'), encoding='utf-8')):
        sets.append(dict(it, b64=base64.b64encode(open(os.path.join(a.sets, it['file']), 'rb').read()).decode()))
tpl = base64.b64encode(open(a.template, 'rb').read()).decode()
t = (t.replace('/*__APPDATA__*/', data).replace('/*__APPDATA15__*/', data15).replace('/*__SETS__*/', json.dumps(sets))
      .replace('/*__CORE__*/', core).replace('/*__XLSX__*/', xl).replace('/*__TEMPLATE__*/', tpl))
open(a.out, 'w', encoding='utf-8').write(t)
print(f'{a.out}: {len(t) // 1024} kB, {len(sets)} scenario sets')
