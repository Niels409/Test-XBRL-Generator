"""Compiles all formula assertions of VT17 / VT15 (value and existence assertions) into compact rules for the built-in check.

Usage: python3 build_rules.py <package-root> <rules.json> [vt15]
Output: {"cond": {data product: [value assertion rule, ...]},
         "req":  {data product: [existence assertion rule, ...]},
         "stats": {...}}

Every assertion of the taxonomy must be compiled: the script stops with an error when it meets a filter, test or precondition
it does not support, so a new taxonomy version can never silently lose rules.
Relations that depend on the taxonomy (the children of a concept in a presentation network, the concepts with a given
balance or data type, the value of a formula parameter) are resolved here, so the app only needs concept lists.
"""
import glob, json, os, re, sys
from collections import defaultdict
from lxml import etree

ROOT, OUT = sys.argv[1], sys.argv[2]
VT15 = len(sys.argv) > 3 and sys.argv[3] == 'vt15'
BASE = os.path.join(ROOT, 'taxonomie/www.sbrnexus.nl/vt15/frc/20210421' if VT15 else 'taxonomie/www.sbrnexus.nl/vt17/frc/20240131')
VAL, ENTRY, DICT, PRE = (os.path.join(BASE, d) for d in ('validation', 'entrypoints', 'dictionary', 'presentation'))
XL = '{http://www.w3.org/1999/xlink}'
XBRLI = '{http://www.xbrl.org/2003/instance}'
DF = '{http://xbrl.org/2008/filter/dimension}'
CF = '{http://xbrl.org/2008/filter/concept}'
CRF = '{http://xbrl.org/2010/filter/concept-relation}'
ACF = '{http://xbrl.org/2010/filter/aspect-cover}'
VARNS = '{http://xbrl.org/2008/variable}'
XS = '{http://www.w3.org/2001/XMLSchema}'
PARENT_CHILD = 'http://www.xbrl.org/2003/arcrole/parent-child'


def ln(e):
    return etree.QName(e).localname


def clark(prefixed, el):
    """'num:areaItemType' -> '{http://www.xbrl.org/dtr/type/numeric}areaItemType', using the namespaces in scope of el."""
    p, _, local = prefixed.strip().rpartition(':')
    return '{%s}%s' % (el.nsmap.get(p or None, ''), local)


# ------------------------------------------------------------------ concepts: app prefix, balance, data type
PREFIX_BY_FILE = {'frc-vt-data.xsd': 'frc-vt-i', 'frc-vt-enum-data.xsd': 'frc-vt-enum-i', 'frc-vt-axes.xsd': 'frc-vt-dim',
                  'frc-vt-domains.xsd': 'frc-vt-dm', 'frc-vt-enum-domains.xsd': 'frc-vt-enum-dm'}
balance, ctype = {}, {}
for fname, pfx in PREFIX_BY_FILE.items():
    p = os.path.join(DICT, fname)
    if not os.path.exists(p):
        continue
    for el in etree.parse(p).getroot().findall(XS + 'element'):
        q = pfx + ':' + el.get('name')
        if el.get(XBRLI + 'balance'):
            balance[q] = el.get(XBRLI + 'balance')
        if el.get('type'):
            ctype[q] = clark(el.get('type'), el)

# type derivation: the package's own types, plus the bases of the Nederlandse Taxonomie (NT) types used by the concepts.
# The NT schemas are not part of the package, so the bases that matter for a data-type filter are recorded here and checked
# by the Arelle validation in CI. VT15/VT17 have one such filter: Report_AllMeasureEqualToParam1 on num:areaItemType (2009 DTR).
#  - NT17: area20ItemType does not derive from that type (the official VT17 Huurinformatie example reports Acreage in
#    xbrli:pure and passes Arelle), so in VT17 the rule applies to no concept.
#  - NT15: area20ItemType derives from num:areaItemType, so in VT15 area facts must use utr:sqm.
NT_BASES = {
    'http://www.nltaxonomie.nl/nt17/sbr/20220301/dictionary/nl-types': {'area20ItemType': '{http://www.xbrl.org/dtr/type/2020-01-21}areaItemType'},
    'http://www.nltaxonomie.nl/nt15/sbr/20200301/dictionary/nl-types': {'area20ItemType': '{http://www.xbrl.org/dtr/type/numeric}areaItemType'},
}
type_base = {}
for fname in ('frc-vt-types.xsd', 'frc-vt-codes.xsd'):
    root = etree.parse(os.path.join(DICT, fname)).getroot()
    tns = root.get('targetNamespace')
    for ct in root.findall(XS + 'complexType'):
        r = ct.find(XS + 'simpleContent/' + XS + 'restriction')
        if r is not None and r.get('base'):
            type_base['{%s}%s' % (tns, ct.get('name'))] = clark(r.get('base'), r)
for t in set(ctype.values()):
    ns, local = t[1:].split('}')
    if local in NT_BASES.get(ns, {}):
        type_base[t] = NT_BASES[ns][local]


def derives(t, target):
    seen = set()
    while t and t not in seen:
        if t == target:
            return True
        seen.add(t)
        t = type_base.get(t)
    return False


def frag_to_qname(href):
    """'../dictionary/frc-vt-data.xsd#frc-vt-i_Reference' -> 'frc-vt-i:Reference'"""
    frag = href.split('#')[-1]
    for pfx in ('frc-vt-enum-dm', 'frc-vt-enum-i', 'frc-vt-dim', 'frc-vt-dm', 'frc-vt-i', 'nl-cd', 'sbr-dim', 'frc-vt-lr'):
        if frag.startswith(pfx + '_'):
            return pfx + ':' + frag[len(pfx) + 1:]
    return frag


# ------------------------------------------------------------------ presentation networks (for concept-relation filters)
children = defaultdict(lambda: defaultdict(list))  # linkrole -> parent -> [(order, child)]
role_files = defaultdict(set)                     # linkrole -> presentation linkbases that contribute to it
for p in glob.glob(os.path.join(PRE, '*-pre.xml')):
    for pl in etree.parse(p).getroot():
        if not isinstance(pl.tag, str) or ln(pl) != 'presentationLink':
            continue
        role = pl.get(XL + 'role')
        locs = {e.get(XL + 'label'): frag_to_qname(e.get(XL + 'href')) for e in pl if isinstance(e.tag, str) and e.get(XL + 'type') == 'locator'}
        for e in pl:
            if isinstance(e.tag, str) and e.get(XL + 'type') == 'arc':
                if e.get('use') == 'prohibited':
                    sys.exit(f'{p}: prohibited presentation arcs are not supported')
                children[role][locs[e.get(XL + 'from')]].append((float(e.get('order', 0)), locs[e.get(XL + 'to')]))
                role_files[role].add(os.path.basename(p))

# ------------------------------------------------------------------ formula parameters (global, e.g. $areaUnitRefQName)
params = {}
for p in glob.glob(os.path.join(BASE, '*', '*parameter*.xml')):
    for e in etree.parse(p).getroot().iter(VARNS + 'parameter'):
        m = re.fullmatch(r"xs:QName\('([^']+)'\)", (e.get('select') or '').strip())
        if m:
            params[e.get('name')] = {'qname': m.group(1), 'clark': clark(m.group(1), e)}


def messages(path):
    """assertion id -> English message (without the {...} diagnostics part)."""
    out = {}
    if not os.path.exists(path):
        return out
    for lk in etree.parse(path).getroot():
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
        if any(s['t'] == 'x' for s in subs):
            return {'t': 'x', 'why': 'unsupported filter inside orFilter'}
        return {'t': 'or', 'f': subs, 'not': complement}
    if k == 'conceptRelation':
        src = el.findtext(CRF + 'qname')
        role, arcrole, axis = el.findtext(CRF + 'linkrole'), el.findtext(CRF + 'arcrole'), el.findtext(CRF + 'axis')
        if not src or el.find(CRF + 'variable') is not None or el.get('test') or arcrole != PARENT_CHILD or axis != 'child' \
                or (el.findtext(CRF + 'generations') or '1').strip() != '1' or role not in children:
            return {'t': 'x', 'why': 'concept relation other than the direct children in a presentation network'}
        kids = [c for o, c in sorted(children[role][src.strip()])]
        return {'t': 'c', 'q': kids, 'not': complement, 'rel': {'parent': src.strip(), 'role': role}}
    if k == 'conceptBalance':
        return {'t': 'bal', 'b': el.get('balance'), 'not': complement}
    if k == 'conceptDataType':
        target, strict = clark(el.findtext(CF + 'type/' + CF + 'qname'), el), el.get('strict') == 'true'
        stem = target.split('}')[1].replace('ItemType', '').lower()
        unknown = sorted({t for t in ctype.values() if t.startswith('{http://www.nltaxonomie.nl/') and stem in t.lower() and t not in type_base})
        if not strict and unknown:  # an NT type that looks related but has no recorded base: record it in NT_BASES first
            sys.exit(f'{el.get("id")}: record the base of {", ".join(unknown)} in NT_BASES')
        q = sorted(c for c, t in ctype.items() if (t == target if strict else derives(t, target)))
        return {'t': 'c', 'q': q, 'not': complement, 'type': target}
    return {'t': 'x', 'why': k}


def var_filters(fs):
    """Concept balance filters are resolved against the concept filter of the same variable (intersection)."""
    bals = [f for f in fs if f['t'] == 'bal']
    if not bals:
        return fs
    conc = [f for f in fs if f['t'] == 'c' and not f['not']]
    if not conc:
        return fs + [{'t': 'x', 'why': 'concept balance filter without a concept filter'}]
    out = []
    for f in fs:
        if f['t'] == 'bal':
            continue
        if f in conc:
            f = dict(f, q=[c for c in f['q'] if all((balance.get(c) == b['b']) != b['not'] for b in bals)], bal=[b['b'] for b in bals])
        out.append(f)
    return out


def has_x(rule):
    return any(f['t'] == 'x' for f in rule['set']) or \
        any(f['t'] == 'x' for n, v in rule['vars'].items() if n != rule.get('items') for f in v['f'])


cond_by_file, req_by_file = {}, {}
stats = {'valueAssertions': 0, 'existenceAssertions': 0}
unsupported = []
ids = set()
for p in sorted(glob.glob(os.path.join(VAL, '*-for.xml'))):
    res, arcs = {}, []
    for lk in etree.parse(p).getroot():
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
    conds, reqs = [], []
    for lab, el in res.items():
        kind = ln(el)
        if kind not in ('valueAssertion', 'existenceAssertion', 'consistencyAssertion', 'formula'):
            continue
        rid = el.get('id')
        if kind not in ('valueAssertion', 'existenceAssertion'):
            unsupported.append(f'{rid}: {kind} is not supported')
            continue
        short = re.sub(r'^(valueAssertion|existenceAssertion)_', '', rid)
        if short in ids:
            sys.exit(f'duplicate assertion id {short}')
        ids.add(short)
        rule = {'id': short, 'msg': msgs.get(rid, ''), 'set': [], 'vars': {}}
        pres = []
        for a in arcs:
            if a['from'] != lab or a['to'] not in res:
                continue
            tgt = res[a['to']]
            if a['arcrole'] == 'variable-set' and ln(tgt) == 'factVariable':
                fs = []
                for b in arcs:
                    if b['from'] == a['to'] and b['arcrole'] == 'variable-filter' and b['to'] in res:
                        fs.append(parse_filter(res[b['to']], arcs, res, b.get('complement') == 'true'))
                rule['vars'][a['name']] = {'fb': tgt.get('fallbackValue') is not None, 'seq': tgt.get('bindAsSequence') == 'true', 'f': var_filters(fs)}
            elif a['arcrole'] == 'variable-set' and ln(tgt) != 'factVariable':
                rule['vars'][a['name']] = {'f': [{'t': 'x', 'why': ln(tgt)}], 'fb': False, 'seq': False}
            elif a['arcrole'] == 'variable-set-filter':
                rule['set'].append(parse_filter(tgt, arcs, res, a.get('complement') == 'true'))
            elif a['arcrole'] == 'variable-set-precondition':
                pres.append(tgt.get('test').strip())
        if kind == 'existenceAssertion':
            stats['existenceAssertions'] += 1
            test = (el.get('test') or '').strip()
            if test and not re.fullmatch(r'\.\s*eq\s*1', test):
                unsupported.append(f'{rid}: existence test {test!r}')
                continue
            if pres or len(rule['vars']) != 1 or has_x(rule):
                unsupported.append(f'{rid}: existence assertion with {len(pres)} preconditions / {len(rule["vars"])} variables / unsupported filter')
                continue
            v = next(iter(rule['vars'].values()))
            out = {'id': short, 'm': rule['msg'], 'f': v['f'], 'set': rule['set'], 'test': 'eq1' if test else None}
            cn = [f for f in v['f'] if f['t'] == 'c' and not f['not']]
            if len(cn) == 1 and len(cn[0]['q']) == 1 and not test:
                out['c'] = cn[0]['q'][0]
            reqs.append(out)
            continue
        stats['valueAssertions'] += 1
        for pt in pres:
            m = re.fullmatch(r"\$(\S+) eq '([^']*)'", pt)
            m2 = re.fullmatch(r"not\(empty\(\$(\S+)\)\) or not\(empty\(\$(\S+)\)\)", pt)
            if m and 'pre' not in rule:
                rule['pre'] = {'v': m.group(1), 'val': m.group(2)}
            elif m2 and 'pre' not in rule:
                rule['pre'] = {'any': [m2.group(1), m2.group(2)]}
            else:
                rule['pre'] = {'unsupported': pt}
        test = el.get('test').strip()
        m1 = re.fullmatch(r"not\(xff:has-fallback-value\(xs:QName\('([^']+)'\)\)\)", test)
        m2 = re.fullmatch(r"xff:has-fallback-value\(xs:QName\('([^']+)'\)\)", test)
        m3 = re.fullmatch(r"\$(\S+) le \$(\S+)", test)
        m4 = re.fullmatch(r"number\(xfi:identifier\(\$(\S+)\)\) eq number\(\$(\S+)\)", test)
        m5 = re.fullmatch(r"\$(\S+) = sum\(\$(\S+)\)", test)
        m6 = re.fullmatch(r"\$(\S+) = - sum\(\$(\S+)\)\s*\+ sum\(\$(\S+)\)", test)
        m7 = re.fullmatch(r"xfi:unit-numerator\(xfi:unit\(\$(\S+)\)\) = \$(\S+)", test)
        if m1:
            rule['test'], rule['concl'] = 'exists', m1.group(1)
        elif m2:
            rule['test'], rule['concl'] = 'notexists', m2.group(1)
        elif m3:
            rule['test'], rule['a'], rule['b'] = 'datele', m3.group(1), m3.group(2)
        elif m4:
            rule['test'], rule['items'], rule['b'] = 'identifier', m4.group(1), m4.group(2)
        elif m5:
            rule['test'], rule['a'], rule['b'] = 'sum', m5.group(1), m5.group(2)
        elif m6:
            rule['test'], rule['a'], rule['cr'], rule['db'] = 'sumdc', m6.group(1), m6.group(2), m6.group(3)
        elif m7 and m7.group(2) in params:
            rule['test'], rule['a'] = 'unit', m7.group(1)
            rule['measure'], rule['measureNs'] = params[m7.group(2)]['qname'], params[m7.group(2)]['clark'].split('}')[0][1:]
        else:
            rule['test'] = None
        if rule['test'] is None or 'unsupported' in rule.get('pre', {}) or has_x(rule):
            why = [f['why'] for f in rule['set'] if f['t'] == 'x'] + [f['why'] for v in rule['vars'].values() for f in v['f'] if f['t'] == 'x']
            unsupported.append(f"{rid}: test {test!r}" if rule['test'] is None else f"{rid}: {rule.get('pre', {}).get('unsupported') or why}")
            continue
        conds.append(rule)
    cond_by_file[os.path.basename(p)] = conds
    req_by_file[os.path.basename(p)] = reqs

# a concept-relation filter must use a presentation network that is part of the data product's DTS
EP_KEYS = {
    'frc-rpt-vt-taxatierapport.xsd': 'Taxatierapport',
    'frc-rpt-vt-huurinformatie.xsd': 'Huurinformatie',
    'frc-rpt-vt-gebouwinformatie.xsd': 'Gebouwinformatie',
    'frc-rpt-vt-opdrachtbrief.xsd': 'Opdrachtbrief',
    'frc-rpt-vt-duurzaamheidsinformatie.xsd': 'Duurzaamheidsinformatie',
    'frc-rpt-vt-taxatierapport-conformiteitsscore.xsd': 'Taxatierapport-Conformiteitsscore',
}
cond, req = {}, {}
for fname, key in EP_KEYS.items():
    refs = [os.path.basename(lr.get(XL + 'href')) for lr in etree.parse(os.path.join(ENTRY, fname)).getroot().iter('{http://www.xbrl.org/2003/linkbase}linkbaseRef')]
    lst = []
    for b in refs:
        for r in cond_by_file.get(b, []):
            for v in r['vars'].values():
                for f in v['f']:
                    if 'rel' in f and not role_files[f['rel']['role']] & set(refs):
                        unsupported.append(f"{r['id']}: presentation network {f['rel']['role']} is not in the DTS of {key}")
            lst.append(r)
    cond[key] = lst
    req[key] = [r for b in refs for r in req_by_file.get(b, [])]

stats['compiled'] = sum(map(len, cond_by_file.values())) + sum(map(len, req_by_file.values()))
json.dump({'cond': cond, 'req': req, 'stats': stats}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('assertions:', stats, '| value assertions per data product:', {k: len(v) for k, v in cond.items()}, '| existence:', {k: len(v) for k, v in req.items()})
if unsupported:
    print('NOT SUPPORTED:', *unsupported, sep='\n  ')
    sys.exit(1)
