"""Acceptance check of generated XBRL files against rebuild/acceptance/expected (FUNCTIONAL_SPEC.md section 8).

python3 tools/check_acceptance.py <folder with the generated .xbrl files> [<expected folder>]

Checks per row: a file exists exactly when the status is not "failed"; for a file: the file name, the context dates, the
entity scheme and the facts (multiset of "concept|dimensions|unit|value" lines, "*" matches any value or member).
Status, input checks and deviations are messages of the generator itself; a rebuilt generator compares those in its own test.
CI runs this on the output of the reference implementation; it also serves as an example for a rebuild.
"""
import glob, json, os, sys
import xml.etree.ElementTree as ET

XBRLI = '{http://www.xbrl.org/2003/instance}'
XBRLDI = '{http://xbrl.org/2006/xbrldi}'
out_dir = sys.argv[1]
exp_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'rebuild', 'acceptance', 'expected')


def qname(clark, nsmap):
    ns, local = clark[1:].split('}')
    return nsmap[ns] + ':' + local


def fact_lines(path):
    nsmap = {uri: prefix for _, (prefix, uri) in ET.iterparse(path, events=['start-ns'])}
    root = ET.parse(path).getroot()
    ctx, units, dates, scheme = {}, {}, set(), set()
    for c in root.iter(XBRLI + 'context'):
        dims = []
        for m in c.iter(XBRLDI + 'explicitMember'):
            dims.append((m.get('dimension'), m.text.strip()))
        for m in c.iter(XBRLDI + 'typedMember'):
            dims.append((m.get('dimension'), (list(m)[0].text or '').strip()))
        ctx[c.get('id')] = ';'.join(f'{a}={v}' for a, v in sorted(dims))
        scheme.add(c.find(f'{XBRLI}entity/{XBRLI}identifier').get('scheme'))
        for tag in ('instant', 'startDate', 'endDate'):
            for d in c.iter(XBRLI + tag):
                dates.add(d.text.strip())
    for u in root.iter(XBRLI + 'unit'):
        units[u.get('id')] = '*'.join(m.text.strip() for m in u.iter(XBRLI + 'measure'))
    lines = []
    for el in root:
        if el.get('contextRef') is None:
            continue
        lines.append('|'.join([qname(el.tag, nsmap), ctx[el.get('contextRef')], units.get(el.get('unitRef'), ''), el.text or '']))
    return lines, dates, scheme


def matches(exp, got):
    e, g = exp.split('|'), got.split('|')
    if len(e) != 4 or len(g) != 4 or e[0] != g[0] or e[2] != g[2]:
        return False
    if e[3] != '*' and e[3] != g[3]:
        return False
    ed, gd = [x for x in e[1].split(';') if x], [x for x in g[1].split(';') if x]
    if len(ed) != len(gd):
        return False
    for a, b in zip(ed, gd):
        (aa, am), (ba, bm) = a.split('=', 1), b.split('=', 1)
        if aa != ba or (am != '*' and am != bm):
            return False
    return True


def compare(expected, got):
    """Multiset match: exact lines first, then the lines with a wildcard. Returns (missing, unexpected)."""
    left = list(got)
    rest = []
    for line in expected:
        if '*' not in line and line in left:
            left.remove(line)
        else:
            rest.append(line)
    missing = []
    for line in rest:
        hit = next((i for i, g in enumerate(left) if matches(line, g)), None)
        if hit is None:
            missing.append(line)
        else:
            left.pop(hit)
    return missing, left


bad = 0
files = {os.path.basename(p): p for p in glob.glob(os.path.join(out_dir, '*.xbrl'))}
for p in sorted(glob.glob(os.path.join(exp_dir, '*.json'))):
    e = json.load(open(p, encoding='utf-8'))
    problems = []
    if e['status'] == 'failed':
        if any(f.startswith(e['test'] + '_') for f in files):
            problems.append('a file was written for a failed row')
    elif e['file'] not in files:
        problems.append(f"file {e['file']} missing")
    else:
        lines, dates, scheme = fact_lines(files[e['file']])
        if dates != {e['contextDate']}:
            problems.append(f"context dates {sorted(dates)}, expected {e['contextDate']}")
        if scheme != {e['entityScheme']}:
            problems.append(f'entity scheme {scheme}')
        missing, unexpected = compare(e['facts'], lines)
        problems += [f'missing: {x}' for x in missing[:5]] + [f'unexpected: {x}' for x in unexpected[:5]]
        if len(missing) > 5 or len(unexpected) > 5:
            problems.append(f'({len(missing)} missing and {len(unexpected)} unexpected facts in total)')
    print(f"{'PASS' if not problems else 'FAIL'} {e['test']}")
    for x in problems:
        print('     ' + x)
    bad += bool(problems)
print(f'{bad} of {len(glob.glob(os.path.join(exp_dir, "*.json")))} rows failed')
sys.exit(1 if bad else 0)
