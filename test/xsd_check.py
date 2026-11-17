"""Independent check straight from the taxonomy XSDs (not from the app's compiled model):
period type per concept, abstract concepts, typed-dimension element names and max length, namespaces, schemaRef.
python3 xsd_check.py <dir with .xbrl> <vt17 package dir> <vt15 package dir>"""
import sys, re, glob, os
from lxml import etree
XS='{http://www.w3.org/2001/XMLSchema}'
def load(pkg, ver, date):
    base=os.path.join(pkg,'taxonomie/www.sbrnexus.nl',ver,'frc',date,'dictionary')
    con={}; typed={}; dom={}
    for f in glob.glob(base+'/*.xsd'):
        t=etree.parse(f); tns=t.getroot().get('targetNamespace')
        for e in t.iter(XS+'element'):
            n=e.get('name')
            if not n: continue
            con[(tns,n)]={'period':e.get('{http://www.xbrl.org/2003/instance}periodType'),'abstract':e.get('abstract')=='true','type':e.get('type'),'sg':e.get('substitutionGroup')}
            tdr=e.get('{http://xbrl.org/2005/xbrldt}typedDomainRef')
            if tdr: typed[(tns,n)]=tdr.split('#')[1]
            if e.get('id'): dom[e.get('id')]=(tns,n,e.get('type'))
    return con,typed,dom
T={'vt17':load(sys.argv[2],'vt17','20240131'),'vt15':load(sys.argv[3],'vt15','20210421')}
XI='{http://www.xbrl.org/2003/instance}'; XDI='{http://xbrl.org/2006/xbrldi}'
tot=0; files=0; kinds={}
for fn in sorted(glob.glob(sys.argv[1]+'/*.xbrl')):
    files+=1; probs=[]
    try: root=etree.parse(fn).getroot()
    except Exception as e:
        probs.append('XML niet well-formed: '+str(e)[:100]); root=None
    if root is not None:
        href=root.find('{http://www.xbrl.org/2003/linkbase}schemaRef').get('{http://www.w3.org/1999/xlink}href')
        ver='vt17' if '/vt17/' in href else 'vt15'
        con,typed,dom=T[ver]
        if not re.match(r'https://www\.sbrnexus\.nl/'+ver+r'/frc/\d{8}/entrypoints/frc-rpt-vt-[a-z-]+\.xsd$',href): probs.append('schemaRef '+href)
        ctx={}
        for c in root.findall(XI+'context'):
            per=c.find(XI+'period'); kind='instant' if per.find(XI+'instant') is not None else 'duration'
            if kind=='duration':
                s=per.find(XI+'startDate').text; e=per.find(XI+'endDate').text
                if s>e: probs.append(f'context {c.get("id")}: start {s} > eind {e}')
            ctx[c.get('id')]=kind
            for tm in c.iter(XDI+'typedMember'):
                p,l=tm.get('dimension').split(':'); ns=root.nsmap[p]
                want=typed.get((ns,l))
                if not want: probs.append(f'typed dimensie {l} bestaat niet in {ver}'); continue
                ch=tm[0]; q=etree.QName(ch)
                if dom[want][0]!=q.namespace or dom[want][1]!=q.localname: probs.append(f'typed member element {q.localname} ≠ {dom[want][1]} voor {l}')
                v=ch.text or ''
                if 'string255' in (dom[want][2] or '') and len(v)>255: probs.append(f'typed member {l} langer dan 255 tekens')
                if v.strip()=='' : probs.append(f'typed member {l} leeg')
            for em in c.iter(XDI+'explicitMember'):
                p,l=em.get('dimension').split(':')
                if (root.nsmap[p],l) not in con: probs.append(f'dimensie {l} bestaat niet')
                mp,ml=em.text.split(':')
                if (root.nsmap[mp],ml) not in con: probs.append(f'member {ml} bestaat niet')
        for e in root:
            q=etree.QName(e)
            if q.namespace in ('http://www.xbrl.org/2003/instance','http://www.xbrl.org/2003/linkbase'): continue
            k=(q.namespace,q.localname)
            if 'nltaxonomie.nl' in q.namespace:
                want='nt17' if ver=='vt17' else 'nt15'
                if '/'+want+'/' not in q.namespace: probs.append(f'{q.localname}: namespace {q.namespace} hoort niet bij {ver}')
                continue
            c=con.get(k)
            if not c: probs.append(f'{q.localname}: bestaat niet in de {ver}-XSD'); continue
            if c['abstract']: probs.append(f'{q.localname}: abstract concept gerapporteerd')
            if c['period'] and ctx.get(e.get('contextRef'))!=c['period']: probs.append(f'{q.localname}: periodetype {ctx.get(e.get("contextRef"))} ≠ {c["period"]}')
    for p in probs: kinds[re.sub(r'\d+','n',p)[:90]]=kinds.get(re.sub(r'\d+','n',p)[:90],0)+1
    tot+=len(probs)
print(f'{files} bestanden gecontroleerd, {tot} problemen')
for k,v in sorted(kinds.items(),key=lambda x:-x[1])[:15]: print(f'  {v}×  {k}')
