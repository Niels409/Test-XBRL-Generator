"""Zet het taxonomiemodel + voorbeeldberichten om naar compacte app-data (JSON) voor de generator.

Gebruik: python3 build_appdata.py vt17_model.json <map met voorbeeldberichten> appdata.json
"""
import json, sys, os, re
from collections import defaultdict
from lxml import etree

model = json.load(open(sys.argv[1]))
EXDIR = sys.argv[2]
OUT = sys.argv[3]

C = model['concepts']
NSI = 'http://www.xbrl.org/2003/instance'
DI = 'http://xbrl.org/2006/xbrldi'

EP_FILES = {
    'Taxatierapport': 'frc-rpt-vt-taxatierapport.xbrl',
    'Huurinformatie': 'frc-rpt-vt-huurinformatie.xbrl',
    'Gebouwinformatie': 'frc-rpt-vt-gebouwinformatie.xbrl',
    'Opdrachtbrief': 'frc-rpt-vt-opdrachtbrief.xbrl',
    'Duurzaamheidsinformatie': 'frc-rpt-vt-duurzaamheidsinformatie.xbrl',
    'Taxatierapport-Conformiteitsscore': 'frc-rpt-vt-taxatierapport-conformiteitsscore.xbrl',
}

# rollen een korte id geven
role_ids = {}
def rid(uri):
    if uri not in role_ids:
        role_ids[uri] = 'r%d' % len(role_ids)
    return role_ids[uri]

def short_axis(a):
    return a.split(':')[1].replace('Axis', '')

roles = {}
for uri, hc in model['hypercubes'].items():
    axes = []
    for a in hc['axes']:
        if 'typed' in a:
            axes.append({'a': a['axis'], 't': a['typed']})
        else:
            axes.append({'a': a['axis'], 'm': a['members']})
    roles[rid(uri)] = {'l': model['linkroles'].get(uri, uri), 'u': uri, 'x': axes,
                       'i': [c for c in hc['items'] if c in C and not C[c].get('abstract')]}

concepts = {}
for q, c in C.items():
    if c.get('abstract') and not q.startswith('frc-vt-dim') and not q.startswith('frc-vt-dm'):
        continue
    d = {'l': c.get('label', q)}
    if not c.get('abstract'):
        d['k'] = c.get('kind', 'string')
        d['p'] = 'i' if c.get('periodType') == 'instant' else 'd'
        if c.get('enum'):
            d['e'] = [[e['v'], e['l']] for e in c['enum']]
        for k in ('minInclusive', 'maxInclusive', 'maxLength', 'minLength', 'pattern'):
            if k in c:
                d[k] = c[k]
        if c.get('doc'):
            d['doc'] = c['doc'][:300]
    concepts[q] = d

# voorbeeldberichten -> facts
def load_example(path):
    r = etree.parse(path).getroot()
    ctx = {}
    entity = None
    dates = set()
    for c in r.iter('{%s}context' % NSI):
        dims = []
        scen = c.find('{%s}scenario' % NSI)
        if scen is not None:
            for mbr in scen:
                if not isinstance(mbr.tag, str):
                    continue
                ln = etree.QName(mbr).localname
                if ln == 'explicitMember':
                    dims.append([mbr.get('dimension'), 'e', mbr.text.strip()])
                elif ln == 'typedMember':
                    dims.append([mbr.get('dimension'), 't', (mbr[0].text or '').strip()])
        ident = c.find('.//{%s}identifier' % NSI)
        entity = (ident.get('scheme'), ident.text.strip())
        for p in c.iter('{%s}instant' % NSI, '{%s}startDate' % NSI, '{%s}endDate' % NSI):
            dates.add(p.text.strip())
        ctx[c.get('id')] = dims
    units = {}
    for u in r.iter('{%s}unit' % NSI):
        units[u.get('id')] = [m.text.strip() for m in u.iter('{%s}measure' % NSI)]
    facts = []
    for e in r:
        if not isinstance(e.tag, str) or e.get('contextRef') is None:
            continue
        q = e.prefix + ':' + etree.QName(e).localname
        f = {'c': q, 'd': ctx[e.get('contextRef')], 'v': (e.text or '').strip()}
        if e.get('unitRef'):
            f['u'] = units[e.get('unitRef')]
            f['dec'] = e.get('decimals')
        facts.append(f)
    return {'facts': facts, 'entity': entity, 'anchor': max(dates)}

eps = {}
for ep, e in model['entrypoints'].items():
    ex = load_example(os.path.join(EXDIR, EP_FILES[ep]))
    eroles = [rid(u) for u in e['hypercubes']]
    # presentatievolgorde gebruiken waar mogelijk
    pres_order = {u: i for i, u in enumerate(e['presentation'])}
    eroles.sort(key=lambda r: pres_order.get(roles[r]['u'], 9999))
    # veldsleutels
    keys = []
    base = defaultdict(list)
    for r in eroles:
        for c in roles[r]['i']:
            base[(roles[r]['l'], concepts[c]['l'])].append((r, c))
    for (sec, lab), lst in base.items():
        if len(lst) == 1:
            keys.append([f'{sec} › {lab}', lst[0][0], lst[0][1]])
            continue
        byc = defaultdict(list)
        for r, c in lst:
            byc[c].append(r)
        for c, rs in byc.items():
            k = f'{sec} › {lab}'
            if len(byc) > 1:
                k += f' ({c.split(":")[1]})'
            if len(rs) == 1:
                keys.append([k, rs[0], c])
            else:
                for r in rs:
                    axes = '+'.join(short_axis(a['a']) for a in roles[r]['x'])
                    keys.append([f'{k} [{axes}]', r, c])
    seen = {}
    uniq = []
    for k in keys:
        if k[0] in seen:
            # zelfde sectie/concept/assen in een andere rol: dimensioneel gelijkwaardig, eerste volstaat
            if json.dumps(roles[seen[k[0]]]['x'], sort_keys=True) == json.dumps(roles[k[1]]['x'], sort_keys=True):
                continue
            n = 2
            while f'{k[0]} #{n}' in seen:
                n += 1
            k = [f'{k[0]} #{n}', k[1], k[2]]
        seen[k[0]] = k[1]
        uniq.append(k)
    keys = uniq
    eps[ep] = {
        'href': e['href'],
        'roles': eroles,
        'base': ex,
        'keys': keys,
    }

# the formula assertions (value + existence) compiled by build_rules.py, next to the model json
RULES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])), 'rules.json')))
for ep in eps:
    eps[ep]['req'] = RULES['req'].get(ep, [])
    eps[ep]['cond'] = RULES['cond'].get(ep, [])
app = {'ns': model['namespaces'], 'concepts': concepts, 'roles': roles, 'eps': eps,
       'version': 'VT15 (20210421)' if 'vt15' in sys.argv[1] else 'VT17 (20240131, update 20260804)'}
json.dump(app, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('appdata', os.path.getsize(OUT) // 1024, 'kB')
for ep, e in eps.items():
    print(ep, len(e['keys']), 'velden', len(e['base']['facts']), 'voorbeeldfacts', e['base']['anchor'], e['base']['entity'])
