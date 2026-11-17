"""Validates generated XBRL files with Arelle (open-source XBRL processor): XML Schema, XBRL 2.1,
dimensions (XDT) and the formula assertions of the taxonomy.

python3 tools/arelle_validate.py --packages vt17.zip vt15.zip --out results [--expected expected.json] [--jobs 4] <files or dirs>

Writes results/<file>.xml (Arelle log), results/summary.json and results/summary.md.
Exit code 1 when a file has an outcome that differs from the expectation (or, without expectations, when any file has errors).
"""
import argparse, concurrent.futures as cf, glob, json, os, subprocess, sys, time
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('--packages', nargs='*', default=[])
ap.add_argument('--out', required=True)
ap.add_argument('--expected')
ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
ap.add_argument('--arelle', default='arelleCmdLine')
ap.add_argument('--log-level', default='warning')
ap.add_argument('--extra', default='', help='extra Arelle options, space separated')
ap.add_argument('paths', nargs='+')
a = ap.parse_args()

files = []
for p in a.paths:
    files += sorted(glob.glob(os.path.join(p, '**', '*.xbrl'), recursive=True)) if os.path.isdir(p) else [p]
base = os.path.commonpath([os.path.abspath(f) for f in files]) if len(files) > 1 else os.path.dirname(os.path.abspath(files[0]))
os.makedirs(a.out, exist_ok=True)

IGNORE = ('debug',)


def run(f):
    rel = os.path.relpath(os.path.abspath(f), base)
    log = os.path.join(a.out, rel + '.log.xml')
    os.makedirs(os.path.dirname(log), exist_ok=True)
    # unsatisfied formula assertions are reported as errors; result counts per file are logged
    cmd = [a.arelle, '--file', f, '--validate', '--formula', 'run', '--formulaUnsatisfiedAsserError', '--formulaAsserResultCounts',
           '--logFile', log, '--logLevel', a.log_level] + [x for x in a.extra.split(' ') if x]
    if a.packages:
        cmd += ['--packages', '|'.join(os.path.abspath(p) for p in a.packages)]
    t0 = time.time()
    pr = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    msgs = []
    try:
        for e in ET.parse(log).getroot().iter('entry'):
            lvl = (e.get('level') or '').lower()
            if lvl in IGNORE:
                continue
            m = e.find('message')
            refs = [r.get('href') or '' for r in e.iter('ref')]
            # an error that only points into taxonomy files (not into the instance) is a taxonomy issue, not a problem of the generated file
            where = 'taxonomy' if refs and not any(os.path.basename(f) in r for r in refs) else 'instance'
            msgs.append({'level': lvl, 'code': e.get('code') or '', 'message': (m.text if m is not None else '') or '', 'where': where, 'refs': refs[:3]})
    except Exception as ex:  # no log written: treat stdout/stderr as the message
        msgs.append({'level': 'error', 'code': 'arelle:noLog', 'message': f'{ex}; exit {pr.returncode}; {pr.stderr[-500:] or pr.stdout[-500:]}'})
    bad = [m for m in msgs if m['level'] in ('error', 'fatal', 'critical')]
    errs = [m for m in bad if m['where'] == 'instance']
    counts = [m['message'] for m in msgs if 'assertionResultCounts' in m['code'] or 'Assertion' in m['code'] and 'count' in m['message'].lower()]
    return rel, {'seconds': round(time.time() - t0, 1), 'errors': errs, 'taxonomyErrors': [m for m in bad if m['where'] == 'taxonomy'],
                 'warnings': [m for m in msgs if m['level'] == 'warning'], 'info': [m for m in msgs if m['level'] not in ('error', 'fatal', 'critical', 'warning')][:50], 'counts': counts}


res = {}
with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
    for rel, r in ex.map(run, files):
        res[rel] = r
        print(f"{'OK  ' if not r['errors'] else 'ERR '} {rel}  ({len(r['errors'])} errors, {len(r['taxonomyErrors'])} taxonomy-level errors, {len(r['warnings'])} warnings, {r['seconds']}s)", flush=True)
        for m in r['errors'][:4]:
            print(f"       [{m['code']}] {m['message'][:300]}")
        for c in r['counts'][:2]:
            print(f"       counts: {c[:300]}")

exp = json.load(open(a.expected)) if a.expected else {}
bad, rows, codes, taxcodes = [], [], {}, {}
for rel, r in sorted(res.items()):
    for m in r['errors']:
        codes[m['code']] = codes.get(m['code'], 0) + 1
    for m in r['taxonomyErrors']:
        taxcodes[m['code'] + ' ' + m['message'][:120]] = taxcodes.get(m['code'] + ' ' + m['message'][:120], 0) + 1
    e = exp.get(rel.replace(os.sep, '/'), {})
    want = e.get('expected') or ''
    got = 'deviations' if r['errors'] else 'ok'
    match = (not want) or want == got
    if want == '' and r['errors'] and not exp:
        match = False
    if not match or (want == '' and r['errors']):
        bad.append(rel)
    rows.append({'file': rel, 'test': e.get('test', ''), 'description': e.get('description', ''), 'expected': want, 'arelle': got, 'own': e.get('own', ''),
                 'match': match, 'errors': len(r['errors']), 'warnings': len(r['warnings']), 'first': (r['errors'][0]['code'] + ' ' + r['errors'][0]['message'])[:240] if r['errors'] else ''})

summary = {'files': len(res), 'withErrors': sum(1 for r in res.values() if r['errors']), 'unexpected': bad, 'errorCodes': codes, 'taxonomyLevelErrors': taxcodes, 'rows': rows}
json.dump(summary, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1)
md = [f"### Arelle validation: {len(res)} files, {summary['withErrors']} with errors, {len(bad)} not as expected", '',
      '| File | Expected | Arelle | Own check | Errors | First error |', '|---|---|---|---|---|---|']
for r in rows:
    if not r['match'] or r['errors'] or r['expected'] == 'deviations':
        md.append(f"| {'❌' if not r['match'] else '✅'} {r['file']} | {r['expected'] or '-'} | {r['arelle']} | {r['own']} | {r['errors']} | {r['first'].replace('|', '/')} |")
if codes:
    md += ['', '| Error code (in the generated files) | Count |', '|---|---|'] + [f'| {k} | {v} |' for k, v in sorted(codes.items(), key=lambda x: -x[1])]
if taxcodes:
    md += ['', 'Errors located in the taxonomy files themselves (not in the generated files; ignored for the result):', '',
           '| Taxonomy-level message | Files |', '|---|---|'] + [f"| {k.replace('|', '/')} | {v} |" for k, v in sorted(taxcodes.items(), key=lambda x: -x[1])]
open(os.path.join(a.out, 'summary.md'), 'w').write('\n'.join(md) + '\n')
print('\n'.join(md[:3]))
sys.exit(1 if bad else 0)
