"""Leest de voorwaardelijke VT17-regels (value assertions) uit de formula-linkbases.

Gebruik: python3 build_rules.py <package-root> <rules.json>
Uitvoer: {entrypoint-naam: [regel, ...]} met per regel variabelen, filters, precondition en type test.
"""
import glob, json, os, re, sys
from lxml import etree

ROOT, OUT = sys.argv[1], sys.argv[2]
BASE = os.path.join(ROOT, 'taxonomie/www.sbrnexus.nl/vt15/frc/20210421') if (len(sys.argv) > 3 and sys.argv[3] == 'vt15') else os.path.join(ROOT, 'taxonomie/www.sbrnexus.nl/vt17/frc/20240131')
VAL, ENTRY = os.path.join(BASE, 'validation'), os.path.join(BASE, 'entrypoints')
XL = '{http://www.w3.org/1999/xlink}'
DF = '{http://xbrl.org/2008/filter/dimension}'
CF = '{http://xbrl.org/2008/filter/concept}'
ACF = '{http://xbrl.org/2010/filter/aspect-cover}'

def ln(e):
    return etree.QName(e).localname

def messages(path):
    """assertion-id -> Engelse melding (zonder het {…}-diagnosedeel)."""
    out = {}
    if not os.path.exists(path):
        return out
    t = etree.parse(path)
    for lk in t.getroot():
        if not isinstance(lk.tag, str):
            continue
        locs, res, arcs = {}, {}, []
        for e in lk:
            if not isinstance(e.tag, str):
                continue
            ty = e.get(XL + 'type')
            if ty == 'locator':
                locs[e.get(XL + 'label')] = e.get(XL + 'href').split('#')[-1]
            elif ty == 'resource':
                res[e.get(XL + 'label')] = (e.text or '').strip()
            elif ty == 'arc':
                arcs.append((e.get(XL + 'from'), e.get(XL + 'to')))
        for f, to in arcs:
            if f in locs and to in res:
                m = re.split(r'\s*\|\s*\{', res[to])[0].strip()
                m = re.sub(r'`\{[^`]*\}`', '`{m}`', m)
                out[locs[f]] = m
    return out

def parse_filter(el, arcs, res, complement=False):
    k = ln(el)
    if k == 'conceptName':
        return {'t': 'c', 'q': [x.text.strip() for x in el.iter(CF + 'qname')], 'not': complement}
    if k == 'explicitDimension':
        ax = el.find(DF + 'dimension/' + DF + 'qname').text.strip()
        mem = []
        for m in el.findall(DF + 'member'):
            q = m.find(DF + 'qname')
            if q is not None:
                mem.append(q.text.strip())
            if m.find(DF + 'axis') is not None or m.find(DF + 'linkrole') is not None:
                return {'t': 'x', 'why': 'dimension member relation'}
        return {'t': 'e', 'a': ax, 'm': mem, 'not': complement}
    if k == 'typedDimension':
        ax = el.find(DF + 'dimension/' + DF + 'qname').text.strip()
        if el.get('test'):
            return {'t': 'x', 'why': 'typed dimension test'}
        return {'t': 't', 'a': ax, 'not': complement}
    if k == 'aspectCover':
        return {'t': 'cov', 'asp': [(x.text or '').strip() for x in el.findall(ACF + 'aspect')]}
    if k == 'orFilter':
        subs = []
        for a in arcs:
            if a['from'] == el.get(XL + 'label') and a['to'] in res:
                subs.append(parse_filter(res[a['to']], arcs, res, a.get('complement') == 'true'))
        return {'t': 'or', 'f': subs, 'not': complement}
    return {'t': 'x', 'why': k}

rules_by_file = {}
stats = {'total': 0, 'supported': 0}
for p in sorted(glob.glob(os.path.join(VAL, '*-for.xml'))):
    t = etree.parse(p)
    res, arcs = {}, []
    for lk in t.getroot():
        if not isinstance(lk.tag, str):
            continue
        for e in lk:
            if not isinstance(e.tag, str):
                continue
            ty = e.get(XL + 'type')
            if ty == 'resource':
                res[e.get(XL + 'label')] = e
            elif ty == 'arc':
                a = {k.split('}')[-1]: v for k, v in e.attrib.items()}
                a['arcrole'] = a['arcrole'].split('/')[-1]
                arcs.append(a)
    msgs = messages(p.replace('-for.xml', '-for-generic-msg-unsatisfied-en.xml'))
    rules = []
    for lab, el in res.items():
        if ln(el) != 'valueAssertion':
            continue
        stats['total'] += 1
        rid = el.get('id')
        test = el.get('test')
        rule = {'id': rid.replace('valueAssertion_', ''), 'msg': msgs.get(rid, ''), 'set': [], 'vars': {}}
        for a in arcs:
            if a['from'] != lab or a['to'] not in res:
                continue
            tgt = res[a['to']]
            if a['arcrole'] == 'variable-set' and ln(tgt) == 'factVariable':
                fs = []
                for b in arcs:
                    if b['from'] == a['to'] and b['arcrole'] == 'variable-filter' and b['to'] in res:
                        fs.append(parse_filter(res[b['to']], arcs, res, b.get('complement') == 'true'))
                rule['vars'][a['name']] = {'fb': tgt.get('fallbackValue') is not None,
                                          'seq': tgt.get('bindAsSequence') == 'true', 'f': fs}
            elif a['arcrole'] == 'variable-set-filter':
                rule['set'].append(parse_filter(tgt, arcs, res, a.get('complement') == 'true'))
            elif a['arcrole'] == 'variable-set-precondition':
                m = re.fullmatch(r"\$(\S+) eq '([^']*)'", tgt.get('test').strip())
                rule['pre'] = {'v': m.group(1), 'val': m.group(2)} if m else {'unsupported': tgt.get('test')}
        m1 = re.fullmatch(r"not\(xff:has-fallback-value\(xs:QName\('([^']+)'\)\)\)", test)
        m2 = re.fullmatch(r"xff:has-fallback-value\(xs:QName\('([^']+)'\)\)", test)
        m3 = re.fullmatch(r"\$(\S+) le \$(\S+)", test)
        m4 = re.fullmatch(r"number\(xfi:identifier\(\$(\S+)\)\) eq number\(\$(\S+)\)", test)
        if m1:
            rule['test'], rule['concl'] = 'exists', m1.group(1)
        elif m2:
            rule['test'], rule['concl'] = 'notexists', m2.group(1)
        elif m3:
            rule['test'], rule['a'], rule['b'] = 'datele', m3.group(1), m3.group(2)
        elif m4:
            rule['test'], rule['items'], rule['b'] = 'identifier', m4.group(1), m4.group(2)
        else:
            rule['test'] = None
        unsupported = rule['test'] is None or 'unsupported' in rule.get('pre', {}) or \
            any(f['t'] == 'x' for f in rule['set']) or \
            any(f['t'] == 'x' for n, v in rule['vars'].items() if n != rule.get('items') for f in v['f'])
        if unsupported:
            continue
        stats['supported'] += 1
        rules.append(rule)
    rules_by_file[os.path.basename(p)] = rules

EP_KEYS = {
    'frc-rpt-vt-taxatierapport.xsd': 'Taxatierapport',
    'frc-rpt-vt-huurinformatie.xsd': 'Huurinformatie',
    'frc-rpt-vt-gebouwinformatie.xsd': 'Gebouwinformatie',
    'frc-rpt-vt-opdrachtbrief.xsd': 'Opdrachtbrief',
    'frc-rpt-vt-duurzaamheidsinformatie.xsd': 'Duurzaamheidsinformatie',
    'frc-rpt-vt-taxatierapport-conformiteitsscore.xsd': 'Taxatierapport-Conformiteitsscore',
}
out = {}
for fname, key in EP_KEYS.items():
    t = etree.parse(os.path.join(ENTRY, fname))
    lst = []
    for lr in t.getroot().iter('{http://www.xbrl.org/2003/linkbase}linkbaseRef'):
        lst.extend(rules_by_file.get(os.path.basename(lr.get(XL + 'href')), []))
    out[key] = lst
json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('value assertions:', stats, {k: len(v) for k, v in out.items()})
