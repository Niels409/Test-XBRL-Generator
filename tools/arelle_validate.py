"""Validates generated XBRL files with Arelle (open-source XBRL processor): XML Schema, XBRL 2.1,
dimensions (XDT) and the formula assertions of the taxonomy, and compares the result with the built-in check of the app.

python3 tools/arelle_validate.py --packages vt17.zip vt15.zip --out results [--expected expected.json] [--jobs 4] [--shard i/n] <files or dirs>

Writes results/<file>.log.xml (Arelle log), results/summary.json and results/summary.md.

Per file:
  - valid files must have no Arelle errors, negative tests must have errors (as before);
  - when the expectations contain "ownAssertions" (the business rules the built-in check reports), Arelle must report exactly
    the same assertions: the built-in check may not miss a rule that Arelle reports, nor report one that Arelle does not;
  - for a mutant (a report changed to break one rule), Arelle must report the targeted rule.
Exit code 1 when a file does not meet its expectation.
"""
import argparse, concurrent.futures as cf, glob, json, os, re, subprocess, sys, time
import xml.etree.ElementTree as ET

ap = argparse.ArgumentParser()
ap.add_argument('--packages', nargs='*', default=[])
ap.add_argument('--out', required=True)
ap.add_argument('--expected')
ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
ap.add_argument('--arelle', default='arelleCmdLine')
ap.add_argument('--log-level', default='warning')
ap.add_argument('--extra', default='', help='extra Arelle options, space separated')
ap.add_argument('--shard', default='1/1', help='i/n: validate only every n-th file starting at i (to spread the work over parallel jobs)')
ap.add_argument('paths', nargs='+')
a = ap.parse_args()

files = []
for p in a.paths:
    files += sorted(glob.glob(os.path.join(p, '**', '*.xbrl'), recursive=True)) if os.path.isdir(p) else [p]
si, sn = (int(x) for x in a.shard.split('/'))
files = sorted(files)[si - 1::sn]
if not files:
    sys.exit('No files to validate')
base = os.path.commonpath([os.path.abspath(f) for f in files]) if len(files) > 1 else os.path.dirname(os.path.abspath(files[0]))
if a.expected:  # keys in expected.json are relative to its folder
    base = os.path.dirname(os.path.abspath(a.expected))
os.makedirs(a.out, exist_ok=True)

IGNORE = ('debug',)
ASSERTION = re.compile(r'(?:valueAssertion|existenceAssertion)_([A-Za-z0-9_-]+)')


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
    msgs, assertions, formulaErrors = [], {}, []
    try:
        for e in ET.parse(log).getroot().iter('entry'):
            lvl = (e.get('level') or '').lower()
            code = e.get('code') or ''
            m = e.find('message')
            text = (m.text if m is not None else '') or ''
            refs = [r.get('href') or '' for r in e.iter('ref')]
            if lvl in IGNORE:
                continue
            if code.startswith('message:'):
                # message:<assertion id> carries the text of an unsatisfied assertion; it names the assertion
                mm = ASSERTION.fullmatch(code[8:])
                if mm and lvl in ('error', 'warning', 'fatal', 'critical'):
                    assertions.setdefault(mm.group(1), text[:400])
                continue
            # an error that only points into taxonomy files (not into the instance) is a taxonomy issue, not a problem of the generated file
            where = 'taxonomy' if refs and not code.startswith(('formula:', 'xbrlfe:', 'xfie:', 'xbrlvarinste:')) and not any(os.path.basename(f) in r for r in refs) else 'instance'
            if lvl in ('error', 'fatal', 'critical') and not code.startswith(('formula:assertion', 'xmlSchema', 'xbrl.', 'xbrldie', 'xbrldte')) and \
                    any(ASSERTION.search(r) for r in refs):
                # an exception while evaluating an assertion (not an unsatisfied assertion)
                formulaErrors.append({'code': code, 'assertion': next(ASSERTION.search(r).group(1) for r in refs if ASSERTION.search(r)), 'message': text[:300]})
            msgs.append({'level': lvl, 'code': code, 'message': text, 'where': where, 'refs': refs[:3]})
    except Exception as ex:  # no log written: treat stdout/stderr as the message
        msgs.append({'level': 'error', 'code': 'arelle:noLog', 'message': f'{ex}; exit {pr.returncode}; {pr.stderr[-500:] or pr.stdout[-500:]}', 'where': 'instance', 'refs': []})
    bad = [m for m in msgs if m['level'] in ('error', 'fatal', 'critical')]
    errs = [m for m in bad if m['where'] == 'instance']
    counts = [m['message'] for m in msgs if 'assertionResultCounts' in m['code'] or 'Assertion' in m['code'] and 'count' in m['message'].lower()]
    return rel, {'seconds': round(time.time() - t0, 1), 'errors': errs, 'taxonomyErrors': [m for m in bad if m['where'] == 'taxonomy'],
                 'warnings': [m for m in msgs if m['level'] == 'warning'], 'counts': counts, 'assertions': assertions, 'formulaErrors': formulaErrors}


res = {}
with cf.ThreadPoolExecutor(max_workers=a.jobs) as ex:
    for rel, r in ex.map(run, files):
        res[rel] = r
        print(f"{'OK  ' if not r['errors'] else 'ERR '} {rel}  ({len(r['errors'])} errors, {len(r['assertions'])} assertions, "
              f"{len(r['taxonomyErrors'])} taxonomy-level errors, {r['seconds']}s)", flush=True)
        for m in [m for m in r['errors'] if not m['code'].startswith('formula:assertion')][:3]:
            print(f"       [{m['code']}] {m['message'][:300]}")
        for k, t in list(r['assertions'].items())[:4]:
            print(f"       [{k}] {t[:200]}")
        for fe in r['formulaErrors'][:2]:
            print(f"       evaluation error [{fe['code']}] in {fe['assertion']}: {fe['message'][:200]}")

exp = json.load(open(a.expected)) if a.expected else {}
# Verdict per file:
#  PASS      outcome as expected and (where known) the same assertions as the built-in check
#  FAIL      a file that should be valid has Arelle errors, a negative test that neither Arelle nor the built-in check flags,
#            different assertions in Arelle and the built-in check, or a mutant whose targeted rule Arelle does not report
#  STRICTER  expected deviations, Arelle finds none but the built-in check does (the built-in check is stricter than the taxonomy)
bad, rows, codes, taxcodes = [], [], {}, {}
agree = compared = 0
for rel, r in sorted(res.items()):
    for m in r['errors']:
        codes[m['code']] = codes.get(m['code'], 0) + 1
    for m in r['taxonomyErrors']:
        taxcodes[m['code'] + ' ' + m['message'][:120]] = taxcodes.get(m['code'] + ' ' + m['message'][:120], 0) + 1
    e = exp.get(rel.replace(os.sep, '/'), {})
    got = 'deviations' if r['errors'] else 'ok'
    own = e.get('own', '')
    arelleIds = set(r['assertions'])
    diff = None
    if 'ownAssertions' in e:
        compared += 1
        ownIds = set(e['ownAssertions'])
        diff = {'arelleOnly': sorted(arelleIds - ownIds), 'ownOnly': sorted(ownIds - arelleIds)}
        agree += not diff['arelleOnly'] and not diff['ownOnly']
    reasons = []
    if e.get('mutant'):
        if e.get('target') and e['target'] not in arelleIds:
            reasons.append(f"Arelle does not report the targeted rule {e['target']}")
    else:
        want = e.get('expected') or 'ok'
        if want != got and not (want == 'deviations' and got == 'ok' and own == 'deviations'):
            reasons.append(f'expected {want}, Arelle {got}')
    if diff and (diff['arelleOnly'] or diff['ownOnly']):
        reasons.append('different assertions')
    if r['formulaErrors']:
        reasons.append('evaluation error in Arelle')
    verdict = 'FAIL' if reasons else ('STRICTER' if not e.get('mutant') and (e.get('expected') or 'ok') == 'deviations' and got == 'ok' else 'PASS')
    if verdict == 'FAIL':
        bad.append(rel)
    rows.append({'file': rel, 'test': e.get('test', ''), 'description': e.get('description', ''), 'expected': e.get('expected') or ('' if e.get('mutant') else 'ok'),
                 'arelle': got, 'own': own, 'verdict': verdict, 'reasons': reasons, 'errors': len(r['errors']), 'warnings': len(r['warnings']),
                 'arelleAssertions': sorted(arelleIds), 'ownAssertions': e.get('ownAssertions'), 'diff': diff,
                 'arelleMessages': {k: r['assertions'][k] for k in (diff or {}).get('arelleOnly', [])},
                 'ownMessages': [d for d in e.get('ownDeviations', []) if any(d.endswith(f'[{k}]') for k in (diff or {}).get('ownOnly', []))],
                 'formulaErrors': r['formulaErrors'],
                 'first': (r['errors'][0]['code'] + ' ' + r['errors'][0]['message'])[:240] if r['errors'] else ''})

summary = {'files': len(res), 'withErrors': sum(1 for r in res.values() if r['errors']), 'unexpected': bad, 'compared': compared, 'agree': agree,
           'errorCodes': codes, 'taxonomyLevelErrors': taxcodes, 'rows': rows}
json.dump(summary, open(os.path.join(a.out, 'summary.json'), 'w'), indent=1)
ICON = {'PASS': '✅', 'FAIL': '❌', 'STRICTER': 'ℹ️'}
md = [f"### Arelle validation{'' if sn == 1 else f' (part {si} of {sn})'}: {len(res)} files, {sum(1 for r in rows if r['verdict'] == 'PASS')} as expected, "
      f"{sum(1 for r in rows if r['verdict'] == 'STRICTER')} only flagged by the stricter built-in check, {len(bad)} failed", '',
      f"Same business rules reported by Arelle and the built-in check: **{agree} of {compared}** files.", '',
      'Valid files must have no Arelle errors; negative tests must have errors; mutants must make Arelle report the rule they break; '
      'Arelle and the built-in check must report the same rules. ℹ️ = negative test that Arelle accepts but the built-in check flags.', '',
      '| | File | Expected | Arelle | Built-in check | Rules (Arelle) | Problem |', '|---|---|---|---|---|---|---|']
for r in rows:
    if r['verdict'] != 'PASS' or (r['errors'] and not r['file'].startswith('mutants/')):
        md.append(f"| {ICON[r['verdict']]} | {r['file']} | {r['expected']} | {r['arelle']} | {r['own'] or '-'} | {len(r['arelleAssertions'])} | "
                  f"{'; '.join(r['reasons']).replace('|', '/') or r['first'].replace('|', '/')} |")
dis = [r for r in rows if r['diff'] and (r['diff']['arelleOnly'] or r['diff']['ownOnly'])]
if dis:
    md += ['', '#### Different business rules', '']
    for r in dis:
        md.append(f"- **{r['file']}** ({r['description'][:160]})")
        for k in r['diff']['arelleOnly']:
            md.append(f"  - only Arelle: `{k}`: {r['arelleMessages'].get(k, '')[:300]}")
        for k in r['diff']['ownOnly']:
            md.append(f"  - only built-in check: `{k}`: {next((d for d in r['ownMessages'] if d.endswith(f'[{k}]')), '')[:300]}")
fe = [r for r in rows if r['formulaErrors']]
if fe:
    md += ['', '#### Evaluation errors in Arelle', ''] + [f"- {r['file']}: [{x['code']}] {x['assertion']}: {x['message'][:200]}" for r in fe for x in r['formulaErrors'][:3]]
if codes:
    md += ['', '| Error code (in the generated files) | Count |', '|---|---|'] + [f'| {k} | {v} |' for k, v in sorted(codes.items(), key=lambda x: -x[1])]
if taxcodes:
    md += ['', 'Errors located in the taxonomy files themselves (not in the generated files; ignored for the result):', '',
           '| Taxonomy-level message | Files |', '|---|---|'] + [f"| {k.replace('|', '/')} | {v} |" for k, v in sorted(taxcodes.items(), key=lambda x: -x[1])]
open(os.path.join(a.out, 'summary.md'), 'w').write('\n'.join(md) + '\n')
print('\n'.join(md[:3]))
for r in dis:
    print(f"DIFFERENT RULES {r['file']}: only Arelle {r['diff']['arelleOnly']}, only built-in {r['diff']['ownOnly']}")
for r in rows:
    if r['verdict'] == 'FAIL':
        print(f"FAIL {r['file']}: {'; '.join(r['reasons'])}")
sys.exit(1 if bad else 0)
