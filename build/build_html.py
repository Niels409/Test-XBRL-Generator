"""Builds the single-file offline app: python3 build/build_html.py <template.xlsx> <out.html>"""
import base64, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, 'app')
t = open(os.path.join(A, 'index.template.html'), encoding='utf-8').read()
data = open(os.path.join(ROOT, 'data', 'appdata-vt17.json'), encoding='utf-8').read().replace('</', '<\\/')
data15 = open(os.path.join(ROOT, 'data', 'appdata-vt15.json'), encoding='utf-8').read().replace('</', '<\\/')
core = open(os.path.join(A, 'core.js'), encoding='utf-8').read(); xl = open(os.path.join(A, 'xlsx.js'), encoding='utf-8').read()
for s in (core, xl): assert '</script' not in s.lower()
tpl = base64.b64encode(open(sys.argv[1], 'rb').read()).decode()
t = t.replace('/*__APPDATA__*/', data).replace('/*__APPDATA15__*/', data15).replace('/*__CORE__*/', core).replace('/*__XLSX__*/', xl).replace('/*__TEMPLATE__*/', tpl)
open(sys.argv[2], 'w', encoding='utf-8').write(t)
print(len(t) // 1024, 'kB')
