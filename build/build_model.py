"""Bouwt een compact JSON-model van de VT17-taxonomie voor de testgenerator.

Gebruik: python3 build_model.py <pad naar uitgepakte package-root> <uitvoer.json>
"""
import json, os, re, sys, glob
from collections import defaultdict
from lxml import etree

ROOT = sys.argv[1]
OUT = sys.argv[2]
VER = sys.argv[3] if len(sys.argv) > 3 else 'vt17'
if VER == 'vt15':
    BASE = os.path.join(ROOT, 'taxonomie/www.sbrnexus.nl/vt15/frc/20210421')
    URLBASE = 'https://www.sbrnexus.nl/vt15/frc/20210421/'
    NLCD_NS = 'http://www.nltaxonomie.nl/nt15/sbr/20200301/dictionary/nl-common-data'
else:
    BASE = os.path.join(ROOT, 'taxonomie/www.sbrnexus.nl/vt17/frc/20240131')
    URLBASE = 'https://www.sbrnexus.nl/vt17/frc/20240131/'
    NLCD_NS = 'http://www.nltaxonomie.nl/nt17/sbr/20220301/dictionary/nl-common-data'

NS = {
    'xs': 'http://www.w3.org/2001/XMLSchema',
    'link': 'http://www.xbrl.org/2003/linkbase',
    'xlink': 'http://www.w3.org/1999/xlink',
    'xbrli': 'http://www.xbrl.org/2003/instance',
    'xbrldt': 'http://xbrl.org/2005/xbrldt',
    'gen': 'http://xbrl.org/2008/generic',
    'label': 'http://xbrl.org/2008/label',
}
XL = '{http://www.w3.org/1999/xlink}'

PREFIX_BY_FILE = {
    'frc-vt-data.xsd': 'frc-vt-i',
    'frc-vt-enum-data.xsd': 'frc-vt-enum-i',
    'frc-vt-axes.xsd': 'frc-vt-dim',
    'frc-vt-domains.xsd': 'frc-vt-dm',
    'frc-vt-enum-domains.xsd': 'frc-vt-enum-dm',
}

namespaces = {
    'xbrli': 'http://www.xbrl.org/2003/instance',
    'link': 'http://www.xbrl.org/2003/linkbase',
    'xlink': 'http://www.w3.org/1999/xlink',
    'xbrldi': 'http://xbrl.org/2006/xbrldi',
    'iso4217': 'http://www.xbrl.org/2003/iso4217',
    'utr': 'http://www.xbrl.org/2009/utr',
    'nl-cd': NLCD_NS,
}

def parse(p):
    return etree.parse(p)

def frag_to_qname(href):
    """'../dictionary/frc-vt-data.xsd#frc-vt-i_Reference' -> 'frc-vt-i:Reference'"""
    frag = href.split('#')[-1]
    for pfx in ('frc-vt-enum-dm', 'frc-vt-enum-i', 'frc-vt-dim', 'frc-vt-dm', 'frc-vt-i', 'nl-cd', 'sbr-dim', 'frc-vt-lr'):
        if frag.startswith(pfx + '_'):
            return pfx + ':' + frag[len(pfx) + 1:]
    return frag

# ---------------------------------------------------------------- schema's
concepts = {}
for fname, pfx in PREFIX_BY_FILE.items():
    if not os.path.exists(os.path.join(BASE, 'dictionary', fname)):
        continue
    t = parse(os.path.join(BASE, 'dictionary', fname))
    namespaces[pfx] = t.getroot().get('targetNamespace')
    for el in t.getroot().findall('xs:element', NS):
        q = pfx + ':' + el.get('name')
        concepts[q] = {
            'type': el.get('type'),
            'periodType': el.get('{http://www.xbrl.org/2003/instance}periodType'),
            'abstract': el.get('abstract') == 'true',
            'subst': el.get('substitutionGroup'),
        }
        tdr = el.get('{http://xbrl.org/2005/xbrldt}typedDomainRef')
        if tdr:
            concepts[q]['typedMember'] = frag_to_qname(tdr)
        # enumeration-set attributes (enum2)
        for k, v in el.attrib.items():
            if k.endswith('}domain') or k.endswith('}linkrole') or k.endswith('}headUsable'):
                concepts[q].setdefault('enum2', {})[k.split('}')[-1]] = v

# codelijsten (enumeraties) uit frc-vt-codes.xsd en beperkingen uit frc-vt-types.xsd
codes = {}
code_ids = {}
for fname, pfx in (('frc-vt-codes.xsd', 'frc-vt-codes'), ('frc-vt-types.xsd', 'frc-vt-types')):
    t = parse(os.path.join(BASE, 'dictionary', fname))
    for ct in t.getroot().findall('xs:complexType', NS):
        r = ct.find('xs:simpleContent/xs:restriction', NS)
        info = {'base': r.get('base'), 'enum': []}
        for f in r:
            tag = etree.QName(f).localname
            if tag == 'enumeration':
                info['enum'].append({'v': f.get('value'), 'id': f.get('id')})
            elif tag in ('minInclusive', 'maxInclusive', 'maxLength', 'minLength', 'pattern', 'totalDigits', 'fractionDigits'):
                info[tag] = f.get('value')
        codes[pfx + ':' + ct.get('name')] = info

# labels
def read_labels(path, generic=False):
    t = parse(path)
    out = {}
    for lk in t.getroot():
        if not isinstance(lk.tag, str):
            continue
        locs, res, arcs = {}, {}, []
        for e in lk:
            if not isinstance(e.tag, str):
                continue
            ln = etree.QName(e).localname
            typ = e.get(XL + 'type')
            if typ == 'locator':
                locs[e.get(XL + 'label')] = e.get(XL + 'href')
            elif typ == 'resource':
                res.setdefault(e.get(XL + 'label'), []).append((e.get(XL + 'role'), (e.text or '').strip()))
            elif typ == 'arc':
                arcs.append((e.get(XL + 'from'), e.get(XL + 'to')))
        for fr, to in arcs:
            if fr in locs and to in res:
                key = locs[fr].split('#')[-1]
                for role, txt in res[to]:
                    out.setdefault(key, {})[role.split('/')[-1]] = txt
    return out

D = os.path.join(BASE, 'dictionary')
lab_nl = read_labels(os.path.join(D, 'frc-vt-data-lab-nl.xml'))
doc_nl = read_labels(os.path.join(D, 'frc-vt-data-documentation-lab-nl.xml'))
for f in ('frc-vt-axes-lab-nl.xml', 'frc-vt-domains-lab-nl.xml', 'frc-vt-enum-data-lab-nl.xml', 'frc-vt-enum-domains-lab-nl.xml'):
    if not os.path.exists(os.path.join(D, f)):
        continue
    for k, v in read_labels(os.path.join(D, f)).items():
        lab_nl.setdefault(k, {}).update(v)
code_lab = read_labels(os.path.join(D, 'frc-vt-codes-generic-lab-nl.xml'))
lr_lab = read_labels(os.path.join(D, 'frc-vt-linkroles-generic-lab-nl.xml'))

def std_label(frag):
    d = lab_nl.get(frag, {})
    return d.get('label') or d.get('terseLabel') or next(iter(d.values()), None)

for q, c in concepts.items():
    frag = q.replace(':', '_')
    c['label'] = std_label(frag) or q.split(':')[1]
    if frag in doc_nl:
        c['doc'] = next(iter(doc_nl[frag].values()))

for q, info in codes.items():
    for e in info['enum']:
        l = code_lab.get(e['id'], {})
        e['l'] = l.get('label') or next(iter(l.values()), e['v'])

# linkrole URIs -> labels (via linkroles.xsd roleType ids)
t = parse(os.path.join(D, 'frc-vt-linkroles.xsd'))
lr_uri_by_id, lr_label = {}, {}
for rt in t.getroot().iter('{http://www.xbrl.org/2003/linkbase}roleType'):
    lr_uri_by_id[rt.get('id')] = rt.get('roleURI')
    l = lr_lab.get(rt.get('id'), {})
    lr_label[rt.get('roleURI')] = l.get('label') or next(iter(l.values()), rt.get('roleURI'))

# ---------------------------------------------------------------- NT17-concepten (extern, niet in package)
NLCD = {
    'ChamberOfCommerceRegistrationNumber': ('nl-types:chamberOfCommerceRegistrationNumberItemType', 'KvK-nummer'),
    'CountryCodeISO': ('nl-codes:countryCodesISO3166-1Alpha3ItemType', 'Landcode ISO'),
    'DateOfBirth': ('xbrli:dateItemType', 'Geboortedatum'),
    'DescriptionLocationAbroad': ('nl-types:string1000ItemType', 'Locatieomschrijving buitenland'),
    'DescriptionLocationNL': ('nl-types:string1000ItemType', 'Locatieomschrijving'),
    'DocumentCreationDate': ('xbrli:dateItemType', 'Documentcreatiedatum'),
    'EmailAddressFull': ('nl-types:emailItemType', 'E-mailadres'),
    'FamilyName': ('nl-types:string1000ItemType', 'Achternaam'),
    'FirstName': ('nl-types:string1000ItemType', 'Voornaam'),
    'HouseLetterNL': ('nl-types:houseLetterNLItemType', 'Huisletter'),
    'HouseNumberAbroad': ('nl-types:string1000ItemType', 'Huisnummer buitenland'),
    'HouseNumberAddition': ('nl-types:houseNumberAdditionItemType', 'Huisnummertoevoeging'),
    'HouseNumberNL': ('nl-types:houseNumberNLItemType', 'Huisnummer'),
    'Initials': ('nl-types:string1000ItemType', 'Voorletters'),
    'LegalEntityName': ('nl-types:string1000ItemType', 'Naam rechtspersoon'),
    'NameRegion': ('nl-types:string1000ItemType', 'Naam regio'),
    'POBoxNumber': ('nl-types:pOBoxNumberItemType', 'Postbusnummer'),
    'PlaceOfResidenceAbroad': ('nl-types:string1000ItemType', 'Plaats buitenland'),
    'PlaceOfResidenceNL': ('nl-types:string80ItemType', 'Plaats'),
    'PostalCodeAbroad': ('nl-types:string1000ItemType', 'Postcode buitenland'),
    'PostalCodeNL': ('nl-types:postalCodeNLItemType', 'Postcode'),
    'Prefix': ('nl-types:string1000ItemType', 'Voorvoegsel'),
    'SbiBusinessCode': ('sbi:sbiItemType', 'SBI-code'),
    'StreetNameAbroad': ('nl-types:string1000ItemType', 'Straatnaam buitenland'),
    'StreetNameNL': ('nl-types:string24ItemType', 'Straatnaam'),
    'TelephoneNumber': ('nl-types:string1000ItemType', 'Telefoonnummer'),
}
for n, (typ, lab) in NLCD.items():
    concepts['nl-cd:' + n] = {'type': typ, 'periodType': 'duration', 'abstract': False, 'subst': 'xbrli:item', 'label': lab, 'external': True}

# ---------------------------------------------------------------- types -> soort
NLTYPES = {
    'nl-types:monetary20ItemType': ('monetary', {}),
    'nl-types:nonNegativeMonetary20ItemType': ('monetary', {'minInclusive': '0'}),
    'nl-types:formattedExplanationItemType': ('string', {}),
    'nl-types:string1000ItemType': ('string', {'maxLength': '1000'}),
    'nl-types:string80ItemType': ('string', {'maxLength': '80', 'minLength': '1'}),
    'nl-types:string24ItemType': ('string', {'maxLength': '24', 'minLength': '1'}),
    'nl-types:emailItemType': ('string', {'maxLength': '254', 'minLength': '6', 'pattern': '[^@]+@[^@]+'}),
    'sbi:sbiItemType': ('string', {'pattern': '(' + '|'.join(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sbi_codes.txt')).read().split()) + ')'}),
    'nl-types:percent20ItemType': ('percent', {}),
    'nl-types:nonNegativeInteger20ItemType': ('integer', {'minInclusive': '0'}),
    'nl-types:integer20ItemType': ('integer', {}),
    'nl-types:nonNegative20ItemType': ('string', {}),  # voorbeeldbericht gebruikt geen unit -> niet-numeriek
    'nl-types:decimal20ItemType': ('decimal', {}),
    'nl-types:area20ItemType': ('area', {}),
    'nl-types:imageItemType': ('string', {}),
    'nl-types:chamberOfCommerceRegistrationNumberItemType': ('string', {'pattern': '([1-9][0-9]{7})|([0-9][1-9][0-9]{6})'}),
    'nl-types:emailAddressItemType': ('string', {}),
    'nl-types:houseLetterNLItemType': ('string', {'pattern': '[a-zA-Z]'}),
    'nl-types:houseNumberAdditionItemType': ('string', {'maxLength': '4', 'minLength': '1'}),
    'nl-types:houseNumberNLItemType': ('string', {'pattern': '[0-9]{1,5}'}),
    'nl-types:pOBoxNumberItemType': ('string', {'pattern': '[0-9]{1,5}'}),
    'nl-types:postalCodeNLItemType': ('string', {'pattern': '[1-9][0-9]{3}[A-Z]{2}'}),
    'nl-codes:countryCodesISO3166-1Alpha3ItemType': ('string', {'pattern': '[A-Z]{3}'}),
    'xbrli:dateItemType': ('date', {}),
    'xbrli:gYearItemType': ('gYear', {}),
    'xbrli:durationItemType': ('duration', {}),
    'xbrli:integerItemType': ('integer', {}),
    'xbrli:stringItemType': ('string', {}),
    'xbrli:booleanItemType': ('boolean', {}),
    'dtr-types:lengthItemType': ('length', {}),
    'dtr-types:energyItemType': ('energy', {}),
    'dtr-types:volumeItemType': ('volume', {}),
    'enum2:enumerationSetItemType': ('enumSet', {}),
    'iso4217-enum-sbr:isoCurrencyCodes4217ItemType': ('string', {'enum': [{'v': 'EUR', 'l': 'Euro'}]}),
    'num:percentItemType': ('percent', {}),
    'nl-codes:yesNoItemType': ('enum', {'enum': [{'v': 'Ja', 'l': 'Ja'}, {'v': 'Nee', 'l': 'Nee'}]}),
    'nl-types:string255': ('string', {'maxLength': '255'}),
    'nl-codes:legalItemType': ('string', {}),
}

def resolve_type(typ, depth=0):
    if typ in NLTYPES:
        kind, extra = NLTYPES[typ]
        return kind, dict(extra)
    if typ in codes:
        info = codes[typ]
        kind, extra = resolve_type(info['base'], depth + 1)
        if info['enum']:
            kind = 'enum'
            extra['enum'] = [{'v': e['v'], 'l': e['l']} for e in info['enum']]
        for k in ('minInclusive', 'maxInclusive', 'maxLength', 'minLength', 'pattern'):
            if k in info:
                extra[k] = info[k]
        return kind, extra
    return 'string', {'unknownType': typ}

for q, c in concepts.items():
    if c.get('abstract'):
        continue
    kind, extra = resolve_type(c['type'])
    c['kind'] = kind
    c.update(extra)

# ---------------------------------------------------------------- definitie-linkbases (hypercubes)
VAL = os.path.join(BASE, 'validation')
arcs_by_role = defaultdict(list)  # role -> [(arcrole, from, to, attrs)]
for p in glob.glob(os.path.join(VAL, '*-def.xml')):
    t = parse(p)
    for dl in t.getroot().findall('link:definitionLink', NS):
        role = dl.get(XL + 'role')
        locs = {}
        for e in dl:
            if isinstance(e.tag, str) and e.get(XL + 'type') == 'locator':
                locs[e.get(XL + 'label')] = frag_to_qname(e.get(XL + 'href'))
        for e in dl:
            if isinstance(e.tag, str) and e.get(XL + 'type') == 'arc':
                attrs = {k.split('}')[-1]: v for k, v in e.attrib.items()}
                arcs_by_role[role].append((attrs['arcrole'].split('/')[-1], locs[attrs['from']], locs[attrs['to']], attrs))

def domain_members(role, axis):
    """Bruikbare leden van een expliciete as binnen een (target)role."""
    out = []
    arcs = arcs_by_role.get(role, [])
    dd = [(t, a) for (ar, f, t, a) in arcs if ar == 'dimension-domain' and f == axis]
    stack = []
    for t, a in dd:
        if a.get('usable', 'true') != 'false':
            out.append(t)
        stack.append(t)
    while stack:
        n = stack.pop()
        for (ar, f, t, a) in arcs:
            if ar == 'domain-member' and f == n:
                if a.get('usable', 'true') != 'false':
                    out.append(t)
                stack.append(t)
    return out

hypercubes = {}
for role, arcs in arcs_by_role.items():
    alls = [(f, t, a) for (ar, f, t, a) in arcs if ar == 'all']
    if not alls:
        continue
    for prim, table, a in alls:
        axes = []
        for (ar, f, t, aa) in arcs:
            if ar == 'hypercube-dimension' and f == table:
                ax = {'axis': t, 'order': float(aa.get('order', 0))}
                if 'typedMember' in concepts.get(t, {}):
                    ax['typed'] = concepts[t]['typedMember']
                else:
                    tr = aa.get('targetRole', role)
                    ax['members'] = domain_members(tr, t)
                axes.append(ax)
        axes.sort(key=lambda x: x['order'])
        for ax in axes:
            ax.pop('order')
        items = []
        def walk(n):
            for (ar, f, t, aa) in arcs:
                if ar == 'domain-member' and f == n:
                    items.append(t)
                    walk(t)
        walk(prim)
        hypercubes[role] = {'axes': axes, 'items': items, 'closed': a.get('closed') == 'true'}

# ---------------------------------------------------------------- presentatie per entrypoint
PRE = os.path.join(BASE, 'presentation')
pre_tree = {}
for p in glob.glob(os.path.join(PRE, '*-pre.xml')):
    t = parse(p)
    for pl in t.getroot().findall('link:presentationLink', NS):
        role = pl.get(XL + 'role')
        locs = {}
        for e in pl:
            if isinstance(e.tag, str) and e.get(XL + 'type') == 'locator':
                locs[e.get(XL + 'label')] = frag_to_qname(e.get(XL + 'href'))
        arcs = []
        for e in pl:
            if isinstance(e.tag, str) and e.get(XL + 'type') == 'arc':
                arcs.append((locs[e.get(XL + 'from')], locs[e.get(XL + 'to')], float(e.get('order', 0))))
        children = defaultdict(list)
        tos = set()
        for f, to, o in arcs:
            children[f].append((o, to))
            tos.add(to)
        roots = [f for f in children if f not in tos]
        seq = []
        def walk(n, depth):
            seq.append([n, depth])
            for o, c in sorted(children[n]):
                walk(c, depth + 1)
        for r in roots:
            walk(r, 0)
        pre_tree[role] = seq

# linkrole volgorde
order_rank = {}
for p in glob.glob(os.path.join(PRE, 'frc-generic-linkrole-order_*.xml')):
    t = parse(p)
    for lk in t.getroot():
        if not isinstance(lk.tag, str):
            continue
        for e in lk:
            if isinstance(e.tag, str) and e.get(XL + 'type') == 'resource':
                lab = e.get(XL + 'label')
                try:
                    order_rank.setdefault(lab.replace('_rsc', ''), float((e.text or '0').strip()))
                except ValueError:
                    pass

ENTRY = os.path.join(BASE, 'entrypoints')
EP_KEYS = {
    'frc-rpt-vt-taxatierapport.xsd': 'Taxatierapport',
    'frc-rpt-vt-huurinformatie.xsd': 'Huurinformatie',
    'frc-rpt-vt-gebouwinformatie.xsd': 'Gebouwinformatie',
    'frc-rpt-vt-opdrachtbrief.xsd': 'Opdrachtbrief',
    'frc-rpt-vt-duurzaamheidsinformatie.xsd': 'Duurzaamheidsinformatie',
    'frc-rpt-vt-taxatierapport-conformiteitsscore.xsd': 'Taxatierapport-Conformiteitsscore',
}
entrypoints = {}
for fname, key in EP_KEYS.items():
    t = parse(os.path.join(ENTRY, fname))
    roles_pre, roles_def = [], []
    for lr in t.getroot().iter('{http://www.xbrl.org/2003/linkbase}linkbaseRef'):
        href = lr.get(XL + 'href')
        full = os.path.normpath(os.path.join(ENTRY, href))
        if href.endswith('-pre.xml'):
            tt = parse(full)
            for pl in tt.getroot().findall('link:presentationLink', NS):
                roles_pre.append(pl.get(XL + 'role'))
        elif href.endswith('-def.xml') and not href.endswith('lineitems-def.xml'):
            tt = parse(full)
            for dl in tt.getroot().findall('link:definitionLink', NS):
                if dl.get(XL + 'role') in hypercubes:
                    roles_def.append(dl.get(XL + 'role'))
    def rank(uri):
        rid = next((k for k, v in lr_uri_by_id.items() if v == uri), uri)
        return order_rank.get(rid, 9999)
    roles_pre = sorted(set(roles_pre), key=lambda u: (rank(u), u))
    entrypoints[key] = {
        'href': URLBASE + 'entrypoints/' + fname,
        'presentation': roles_pre,
        'hypercubes': sorted(set(roles_def)),
    }

# ---------------------------------------------------------------- existence-assertions (verplichte velden)
arcattr = {}
def parse_formula(path):
    t = parse(path)
    res = {}
    arcs = []
    for lk in t.getroot():
        if not isinstance(lk.tag, str):
            continue
        for e in lk:
            if not isinstance(e.tag, str):
                continue
            typ = e.get(XL + 'type')
            if typ == 'resource':
                res[e.get(XL + 'label')] = e
            elif typ == 'arc':
                arcs.append((e.get(XL + 'arcrole').split('/')[-1], e.get(XL + 'from'), e.get(XL + 'to')))
                arcattr[(e.get(XL + 'from'), e.get(XL + 'to'))] = {k.split('}')[-1]: v for k, v in e.attrib.items()}
    return res, arcs

def filter_info(el, arc=None):
    if arc and arc.get('complement') == 'true':
        ln = etree.QName(el).localname
        if ln in ('explicitDimension', 'typedDimension'):
            ax = el.find('{http://xbrl.org/2008/filter/dimension}dimension/{http://xbrl.org/2008/filter/dimension}qname')
            mems = [m.text.strip() for m in el.findall('.//{http://xbrl.org/2008/filter/dimension}member/{http://xbrl.org/2008/filter/dimension}qname')]
            return ('not', ax.text.strip() + ('=' + ','.join(mems) if mems else '')) if ax is not None else None
        return None
    ln = etree.QName(el).localname
    if ln == 'conceptName':
        q = el.find('.//{http://xbrl.org/2008/filter/concept}qname')
        return ('concept', q.text.strip()) if q is not None else None
    if ln == 'explicitDimension':
        ax = el.find('{http://xbrl.org/2008/filter/dimension}dimension/{http://xbrl.org/2008/filter/dimension}qname')
        mem = el.find('.//{http://xbrl.org/2008/filter/dimension}member/{http://xbrl.org/2008/filter/dimension}qname')
        if ax is not None:
            return ('explicit', ax.text.strip(), mem.text.strip() if mem is not None else None)
    if ln == 'typedDimension':
        ax = el.find('{http://xbrl.org/2008/filter/dimension}dimension/{http://xbrl.org/2008/filter/dimension}qname')
        if ax is not None:
            return ('typed', ax.text.strip())
    return None

def read_messages(path):
    if not os.path.exists(path):
        return {}
    t = parse(path)
    out = {}
    for lk in t.getroot():
        if not isinstance(lk.tag, str):
            continue
        locs, res, arcs = {}, {}, []
        for e in lk:
            if not isinstance(e.tag, str):
                continue
            typ = e.get(XL + 'type')
            if typ == 'locator':
                locs[e.get(XL + 'label')] = e.get(XL + 'href').split('#')[-1]
            elif typ == 'resource':
                res[e.get(XL + 'label')] = (e.text or '').strip()
            elif typ == 'arc':
                arcs.append((e.get(XL + 'from'), e.get(XL + 'to')))
        for f, to in arcs:
            if f in locs and to in res:
                out[locs[f]] = re.split(r'\s*\|\s*\{', res[to])[0].strip()
    return out

existence = {}
for p in glob.glob(os.path.join(VAL, '*-for.xml')):
    res, arcs = parse_formula(p)
    msgs = read_messages(p.replace('-for.xml', '-for-generic-msg-unsatisfied-nl.xml'))
    rules = []
    for lab, el in res.items():
        if etree.QName(el).localname != 'existenceAssertion':
            continue
        filters = []
        for ar, f, to in arcs:
            if ar == 'variable-set-filter' and f == lab and to in res:
                filters.append(filter_info(res[to], arcattr.get((f, to), {})))
            if ar == 'variable-set' and f == lab and to in res:
                for ar2, f2, to2 in arcs:
                    if ar2 == 'variable-filter' and f2 == to and to2 in res:
                        filters.append(filter_info(res[to2], arcattr.get((f2, to2), {})))
        filters = [x for x in filters if x]
        concept = [x[1] for x in filters if x[0] == 'concept']
        if len(concept) != 1:
            continue
        rule = {'concept': concept[0],
                'explicit': {x[1]: x[2] for x in filters if x[0] == 'explicit'},
                'typed': sorted({x[1] for x in filters if x[0] == 'typed'}),
                'not': sorted({x[1] for x in filters if x[0] == 'not'}),
                'msg': msgs.get(el.get('id'), '')}
        rules.append(rule)
    existence[os.path.basename(p)] = rules

for fname, key in EP_KEYS.items():
    t = parse(os.path.join(ENTRY, fname))
    rules = []
    for lr in t.getroot().iter('{http://www.xbrl.org/2003/linkbase}linkbaseRef'):
        b = os.path.basename(lr.get(XL + 'href'))
        rules.extend(existence.get(b, []))
    entrypoints[key]['required'] = rules

# alleen relevante concepten bewaren
used = set()
for r, hc in hypercubes.items():
    used.update(hc['items'])
    for ax in hc['axes']:
        used.add(ax['axis'])
        used.update(ax.get('members', []))
        if 'typed' in ax:
            used.add(ax['typed'])
for seq in pre_tree.values():
    used.update(n for n, d in seq)

model = {
    'namespaces': namespaces,
    'concepts': {q: c for q, c in concepts.items() if q in used},
    'linkroles': {u: lr_label.get(u, u) for u in set(list(hypercubes) + list(pre_tree))},
    'hypercubes': hypercubes,
    'presentation': pre_tree,
    'entrypoints': entrypoints,
}
json.dump(model, open(OUT, 'w'), ensure_ascii=False, indent=0, sort_keys=True)
unknown = sorted({c.get('unknownType') for c in model['concepts'].values() if c.get('unknownType')})
print('concepten', len(model['concepts']), 'hypercubes', len(hypercubes), 'presentatie', len(pre_tree))
print('onbekende types', unknown)
for k, e in entrypoints.items():
    print(k, len(e['presentation']), 'pres-roles', len(e['hypercubes']), 'hypercubes')
