/* Uitvoerige testset: genereert scenario's en controleert de XBRL onafhankelijk van de generator.
 * node deep.js [filter]      (filter = deel van de testnaam)
 */
'use strict';
const fs = require('fs'), path = require('path');
const Core = require('../app/core.js');
const D17 = process.env.APP17 || path.join(__dirname, '../data/appdata-vt17.json');
const D15 = process.env.APP15 || path.join(__dirname, '../data/appdata-vt15.json');
const M = { VT17: new Core.Model(JSON.parse(fs.readFileSync(D17, 'utf8'))) };
if (fs.existsSync(D15)) M.VT15 = new Core.Model(JSON.parse(fs.readFileSync(D15, 'utf8')));
const OUT = path.join(__dirname, 'deep_out'); fs.mkdirSync(OUT, { recursive: true });
const TODAY = new Date(Date.UTC(2026, 10, 16));

// ------------------------------------------------------------------ onafhankelijke XBRL-parser
function parseX(xml) {
  const ctx = {}, units = {}, facts = [];
  const ctxIds = [];
  for (const m of xml.matchAll(/<xbrli:context id="([^"]+)">([\s\S]*?)<\/xbrli:context>/g)) {
    const b = m[2], dims = [];
    for (const e of b.matchAll(/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)<\/xbrldi:explicitMember>/g)) dims.push({ a: e[1], k: 'e', m: e[2] });
    for (const t of b.matchAll(/<xbrldi:typedMember dimension="([^"]+)">\s*<([^>\s]+)>([^<]*)<\/[^>]+>\s*<\/xbrldi:typedMember>/g)) dims.push({ a: t[1], k: 't', m: t[3] });
    const inst = (b.match(/<xbrli:instant>([^<]+)</) || [])[1], end = (b.match(/<xbrli:endDate>([^<]+)</) || [])[1], start = (b.match(/<xbrli:startDate>([^<]+)</) || [])[1];
    const ident = (b.match(/<xbrli:identifier scheme="([^"]+)">([^<]+)</) || []);
    ctxIds.push(m[1]);
    ctx[m[1]] = { dims, inst, start, end, scheme: ident[1], id: ident[2] };
  }
  for (const m of xml.matchAll(/<xbrli:unit id="([^"]+)">([\s\S]*?)<\/xbrli:unit>/g)) units[m[1]] = [...m[2].matchAll(/<xbrli:measure>([^<]+)</g)].map(x => x[1]);
  for (const m of xml.matchAll(/<((?:frc-vt-i|nl-cd|frc-vt-enum-i)[^:\s>]*:[A-Za-z0-9_]+)\s+([^>]*?)(\/?)>(?:([\s\S]*?)<\/\1>)?/g)) {
    const attrs = m[2];
    const g = (n) => (attrs.match(new RegExp(n + '="([^"]*)"')) || [])[1];
    facts.push({ c: m[1], ctx: g('contextRef'), unit: g('unitRef'), dec: g('decimals'), nil: /xsi:nil="true"/.test(attrs), v: unesc(m[4] || '') });
  }
  const schema = (xml.match(/<link:schemaRef[^>]*xlink:href="([^"]+)"/) || [])[1];
  return { ctx, ctxIds, units, facts, schema };
}
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const loc = (q) => String(q).split(':').pop();
const dimsOf = (X, f) => X.ctx[f.ctx] ? X.ctx[f.ctx].dims : [];
const hasAxis = (X, f, ax) => dimsOf(X, f).some(d => loc(d.a) === ax);
const member = (X, f, ax) => (dimsOf(X, f).find(d => loc(d.a) === ax) || {}).m;
const onlyDims = (X, f, spec) => { const ds = dimsOf(X, f); return ds.length === Object.keys(spec).length && ds.every(d => spec[loc(d.a)] !== undefined && (spec[loc(d.a)] === '*' || loc(d.m) === spec[loc(d.a)] || d.m === spec[loc(d.a)])); };
const get = (X, concept, spec) => X.facts.filter(f => loc(f.c) === concept && (!spec || onlyDims(X, f, spec)));

// ------------------------------------------------------------------ generieke controles (elk bestand)
function genericChecks(X, xml, model, ep, r, fail) {
  const APP = model.APP;
  if (!/^<\?xml version="1.0" encoding="UTF-8"\?>/.test(xml)) fail('XML-declaratie ontbreekt');
  const open = (xml.match(/<[A-Za-z][^>!?]*[^/]>/g) || []).length, close = (xml.match(/<\/[^>]+>/g) || []).length;
  if (open !== close) fail(`ongebalanceerde tags (${open} open, ${close} sluit)`);
  if (X.schema !== APP.eps[ep].href) fail(`schemaRef ${X.schema} ≠ ${APP.eps[ep].href}`);
  if (new Set(X.ctxIds).size !== X.ctxIds.length) fail('dubbele context-id');
  const used = new Set(X.facts.map(f => f.ctx)), usedU = new Set(X.facts.map(f => f.unit).filter(Boolean));
  for (const id of X.ctxIds) if (!used.has(id)) fail(`context ${id} niet gebruikt`);
  for (const id of Object.keys(X.units)) if (!usedU.has(id)) fail(`unit ${id} niet gebruikt`);
  const seen = new Map();
  const ctxKey = (id) => { const c = X.ctx[id]; return c ? JSON.stringify([c.inst, c.start, c.end, c.dims.map(d => d.a + '=' + d.m).sort()]) : id; };
  const ctxSeen = new Map();
  for (const id of X.ctxIds) { const k = ctxKey(id); if (ctxSeen.has(k)) fail(`contexten ${ctxSeen.get(k)} en ${id} zijn identiek`); ctxSeen.set(k, id); }
  for (const f of X.facts) {
    if (!X.ctx[f.ctx]) { fail(`${f.c}: context ${f.ctx} bestaat niet`); continue; }
    const c = APP.concepts[f.c];
    if (!c) { fail(`${f.c}: onbekend concept`); continue; }
    const numeric = ['monetary', 'percent', 'integer', 'decimal', 'area', 'length', 'energy', 'volume'].includes(c.k);
    if (numeric && !f.unit) fail(`${f.c}: numeriek zonder unit`);
    if (!numeric && f.unit) fail(`${f.c}: unit bij niet-numeriek`);
    if (f.unit && !X.units[f.unit]) fail(`${f.c}: unit ${f.unit} bestaat niet`);
    if (numeric && !f.dec) fail(`${f.c}: decimals ontbreekt`);
    if (numeric && !/^-?(\d+(\.\d*)?|\.\d+)$/.test(f.v)) fail(`${f.c}: geen getal "${f.v}"`);
    if (c.k === 'monetary' && f.unit && X.units[f.unit][0] !== 'iso4217:EUR') fail(`${f.c}: monetair niet in EUR`);
    if (c.k === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(f.v)) fail(`${f.c}: datum "${f.v}"`);
    if (c.k === 'gYear' && !/^\d{4}$/.test(f.v)) fail(`${f.c}: jaar "${f.v}"`);
    if (c.e && !c.set && !c.e.some(x => x[0] === f.v)) fail(`${f.c}: "${f.v}" geen toegestane waarde`);
    if (c.maxLength && f.v.length > +c.maxLength) fail(`${f.c}: lengte ${f.v.length} > ${c.maxLength} ("${f.v.slice(0, 30)}")`);
    if (c.minLength && f.v.length < +c.minLength) fail(`${f.c}: lengte ${f.v.length} < ${c.minLength}`);
    if (c.pattern && !new RegExp('^(?:' + c.pattern + ')$').test(f.v)) fail(`${f.c}: "${f.v}" past niet op patroon`);
    if (c.k === 'string' && !f.nil && f.v.trim() === '') fail(`${f.c}: lege tekst`);
    if (/undefined|NaN|\[object|null/.test(f.v)) fail(`${f.c}: verdachte waarde "${f.v}"`);
    if (/^(Tekst|Toelichting|Omschrijving|Naam|Straat|Plaats|BAGVBO-\d+|BAGPAND-\d+|BAGOTHER-\d+|Aanduiding \d+|Type 1|1000AA|xxx|test)$/i.test(f.v.trim()) && !['HouseTypeID'].includes(loc(f.c))) fail(`${f.c}: placeholderwaarde "${f.v}"`);
    const k = f.c + '|' + ctxKey(f.ctx);
    if (seen.has(k)) fail(`${f.c}: dubbel feit in dezelfde context (${member(X, f, 'BAGVBOIDAxis') || f.ctx})`);
    seen.set(k, f.v);
    // datums niet in de toekomst t.o.v. vandaag, behalve vervaldata/einddata
    if (c.k === 'date' && /DocumentCreationDate|ValuationDate|InspectionDate|DateOfSigning/.test(f.c) && f.v > '2026-11-16') fail(`${f.c}: datum in de toekomst ${f.v}`);
  }
  // entiteit overal gelijk
  const ents = new Set(Object.values(X.ctx).map(c => c.scheme + '|' + c.id));
  if (ents.size !== 1) fail('meerdere entity-identifiers');
  // VBO's
  if (ep !== 'Taxatierapport-Conformiteitsscore') for (const v of (r.vbos || [])) if (!get(X, 'BAGVBOID').some(f => f.v === v)) fail(`VBO ${v} niet als BAGVBOID gerapporteerd`);
}

// ------------------------------------------------------------------ gebruiksspecifieke controles (Taxatierapport)
const RES_AX = ['HouseAxis', 'HouseTypeAxis', 'SaleReferenceResidentialAxis'];
const COM_AX = ['UnitAxis', 'LeaseContractAxis', 'LeaseContractItemAxis', 'LeaseReferenceCommercialAxis', 'SaleInvestmentReferencesCommercial', 'LeaseChargesBreakAxis'];
function partsPresent(X, tax) {
  const p = { r: 0, c: 0, a: 0 };
  for (const f of X.facts) for (const d of dimsOf(X, f)) {
    const a = loc(d.a), m = loc(d.m);
    if (RES_AX.includes(a) || m === 'ResidentialPartRealEstateMember' || (tax === 'VT15' && a === 'LeaseReferenceAxis')) p.r++;
    if (COM_AX.includes(a) || m === 'CommercialPartRealEstateMember' || (tax === 'VT15' && (a === 'ContractAxis' || a === 'IndexationAxis'))) p.c++;
    if (m === 'RuralAgriculturalRealEstateMember' || (tax === 'VT17' && (a === 'RealEstatePropertyAxis' || a === 'ActivityAxis'))) p.a++;
  }
  return p;
}
function useChecks(X, sc, r, exp, fail) {
  const tax = r.tax;
  const P = partsPresent(X, tax);
  for (const u of ['r', 'c', 'a']) {
    const want = exp.uses.includes(u);
    if (want && !P[u]) fail(`${NAME[u]} deel ontbreekt`);
    if (!want && P[u]) fail(`${NAME[u]} deel aanwezig (${P[u]} feiten) terwijl het niet hoort`);
  }
  // koppeling VBO -> eenheid
  const links = {};
  for (const f of get(X, 'LinkedBAGVBOID')) {
    const kind = hasAxis(X, f, 'HouseAxis') ? 'r' : hasAxis(X, f, 'UnitAxis') ? 'c' : hasAxis(X, f, 'LeaseContractAxis') || hasAxis(X, f, 'LeaseContractItemAxis') ? 'lease' : 'other';
    (links[f.v] = links[f.v] || []).push({ kind, unit: member(X, f, 'HouseAxis') || member(X, f, 'UnitAxis') });
  }
  const houses = new Set(X.facts.filter(f => hasAxis(X, f, 'HouseAxis')).map(f => member(X, f, 'HouseAxis')));
  const units = new Set(X.facts.filter(f => hasAxis(X, f, 'UnitAxis') && !hasAxis(X, f, 'LeaseContractAxis')).map(f => member(X, f, 'UnitAxis')));
  const objects = tax === 'VT17' ? new Set(X.facts.filter(f => hasAxis(X, f, 'RealEstatePropertyAxis')).map(f => member(X, f, 'RealEstatePropertyAxis'))) : new Set();
  const n = (u) => exp.vboUse.filter(x => x === u).length;
  if (exp.uses.includes('r') && houses.size !== Math.max(1, n('r'))) fail(`aantal Eenheden ${houses.size}, verwacht ${Math.max(1, n('r'))}`);
  if (exp.uses.includes('c') && units.size !== Math.max(1, n('c'))) fail(`aantal Ruimtes ${units.size}, verwacht ${Math.max(1, n('c'))}`);
  if (exp.uses.includes('a') && objects.size !== Math.max(1, n('a'))) fail(`aantal agrarische objecten ${objects.size}, verwacht ${Math.max(1, n('a'))}`);
  const unitOfVbo = {};
  r.vbos.forEach((v, i) => {
    const u = exp.vboUse[i];
    const L = (links[v] || []).filter(x => x.kind === 'r' || x.kind === 'c');
    if (u === 'r') { if (L.length !== 1 || L[0].kind !== 'r') fail(`VBO ${i + 1} (residentieel) moet aan precies 1 Eenheid gekoppeld zijn, gevonden: ${JSON.stringify(L)}`); else unitOfVbo[i] = L[0].unit; }
    if (u === 'c') { if (L.length !== 1 || L[0].kind !== 'c') fail(`VBO ${i + 1} (commercieel) moet aan precies 1 Ruimte gekoppeld zijn, gevonden: ${JSON.stringify(L)}`); else unitOfVbo[i] = L[0].unit; }
    if (u === 'a' || u === 'u') { if (L.length) fail(`VBO ${i + 1} (${NAME[u]}) mag niet aan een Eenheid/Ruimte gekoppeld zijn: ${JSON.stringify(L)}`); }
    if (u === 'u' && (links[v] || []).length) fail(`VBO ${i + 1} (unlinked) komt voor in een koppeling: ${JSON.stringify(links[v])}`);
    // commerciële VBO's: BAGVBOID-as in Adres ruimte
    if (u === 'c' && !X.facts.some(f => hasAxis(X, f, 'UnitAxis') && member(X, f, 'BAGVBOIDAxis') === v)) fail(`VBO ${i + 1}: geen Adres ruimte met BAGVBOID-as`);
    if (u !== 'c' && X.facts.some(f => hasAxis(X, f, 'UnitAxis') && member(X, f, 'BAGVBOIDAxis') === v)) fail(`VBO ${i + 1} (${NAME[u]}) heeft een Adres ruimte`);
  });
  // adres van de gekoppelde eenheid = hoofdadres van hetzelfde VBO; plausibele eenheidsgegevens
  r.vbos.forEach((v, i) => {
    const u = exp.vboUse[i]; if (u !== 'r' && u !== 'c') return;
    const hoofd = (c) => (X.facts.find(f => loc(f.c) === c && onlyDims(X, f, { BAGVBOIDAxis: v })) || {}).v;
    const ax = u === 'r' ? 'HouseAxis' : 'UnitAxis';
    const inUnit = (c) => (X.facts.find(f => loc(f.c) === c && member(X, f, ax) === unitOfVbo[i] && (u === 'r' || member(X, f, 'BAGVBOIDAxis') === v)) || {}).v;
    if (!unitOfVbo[i]) return;
    for (const c of ['PostalCodeNL', 'HouseNumberNL', 'StreetNameNL', 'PlaceOfResidenceNL']) {
      const a1 = hoofd(c), a2 = inUnit(c);
      if (a1 && a2 && a1 !== a2) fail(`VBO ${i + 1}: ${c} in ${u === 'r' ? 'Eenheid' : 'Ruimte'} (${a2}) ≠ hoofdadres (${a1})`);
      if (a1 && !a2 && c !== 'PlaceOfResidenceNL') fail(`VBO ${i + 1}: ${c} ontbreekt in adres ${u === 'r' ? 'eenheid' : 'ruimte'}`);
    }
    const ha = hoofd('HouseNumberAddition'), ua = inUnit('HouseNumberAddition');
    if ((ha || '') !== (ua || '')) fail(`VBO ${i + 1}: huisnummertoevoeging eenheid (${ua}) ≠ hoofdadres (${ha})`);
    if (u === 'r') {
      const gbo = +inUnit('UsableFloorArea'), rent = +inUnit('MarketRent'), mv = +inUnit('MarketValueVHE');
      if (!(gbo >= 20 && gbo <= 500)) fail(`VBO ${i + 1}: GBO ${gbo} m² niet plausibel`);
      if (mv > 0 && !(rent > mv * 0.01 && rent < mv * 0.15)) fail(`VBO ${i + 1}: markthuur ${rent} niet plausibel bij waarde ${mv}`);
      if (!inUnit('HouseTypeID')) fail(`VBO ${i + 1}: HouseTypeID ontbreekt`);
    }
  });
  // VT17: referenties passen bij het gebruik
  if (tax === 'VT17') {
    const rt = X.facts.filter(f => loc(f.c) === 'ReferenceType' && (hasAxis(X, f, 'LeaseReferenceAxis') || hasAxis(X, f, 'SaleInvestmentReferencesAxis')));
    const allowed = exp.uses.map(u => ({ c: '1', r: '2', a: '3' })[u]);
    for (const f of rt) {
      if (!allowed.includes(f.v)) fail(`referentie met Soort referentie ${f.v} past niet bij ${exp.uses.join('+')}`);
      const key = (g) => dimsOf(X, g).map(d => d.a + d.m).join();
      const ipd = X.facts.find(g => loc(g.c) === 'IPDTypeProperty' && key(g) === key(f));
      if (ipd && f.v === '2' && ipd.v !== '5') fail(`residentiële referentie met IPD-type ${ipd.v}`);
      if (ipd && f.v === '1' && !['1', '2', '3', '4'].includes(ipd.v)) fail(`commerciële referentie met IPD-type ${ipd.v}`);
      if (f.v !== '3' && X.facts.some(g => loc(g.c) === 'TypeSaleReferenceRuralAgricultural' && key(g) === key(f))) fail('agrarisch veld bij niet-agrarische referentie');
    }
    if (exp.uses.length > 1 && new Set(rt.map(f => f.v)).size < Math.min(exp.uses.length, rt.length)) fail('referenties dekken de gebruiken niet');
  }
  // marktwaarde per eenheid
  const vhe = get(X, 'MarketValueVHE').filter(f => hasAxis(X, f, 'HouseAxis'));
  r.vbos.forEach((v, i) => {
    const val = sc.vboValues && sc.vboValues[i];
    if (exp.vboUse[i] === 'r' && unitOfVbo[i]) {
      const f = vhe.find(x => member(X, x, 'HouseAxis') === unitOfVbo[i]);
      if (!f) fail(`VBO ${i + 1}: Indicatieve marktwaarde VHE ontbreekt`);
      else if (val !== undefined && val !== '' && +f.v !== +val) fail(`VBO ${i + 1}: marktwaarde VHE ${f.v} ≠ ${val}`);
      // eenheid-adres van VBO 1 = opgegeven adres
      if (i === 0 && sc.fixed && sc.fixed.postcode) {
        const pc = X.facts.find(x => loc(x.c) === 'PostalCodeNL' && member(X, x, 'HouseAxis') === unitOfVbo[i]);
        if (!pc || pc.v !== sc.fixed.postcode) fail(`Adres eenheid VBO 1: postcode ${pc && pc.v} ≠ ${sc.fixed.postcode}`);
      }
    }
  });
  if (vhe.length !== new Set(vhe.map(f => member(X, f, 'HouseAxis'))).size) fail('meerdere marktwaarden VHE per eenheid');
  // totale marktwaarde
  const vals = (sc.vboValues || []).filter(v => v !== '' && v !== undefined && v !== null);
  const allVals = !!(sc.fixed && sc.fixed.marktwaarde) || (sc.vboValues || []).filter(v => v !== '' && v !== undefined && v !== null).length === r.vbos.length;
  const totalExp = sc.fixed && sc.fixed.marktwaarde ? +sc.fixed.marktwaarde : vals.length ? vals.reduce((a, b) => a + +b, 0) : null;
  if (totalExp !== null) {
    const va = X.facts.filter(f => loc(f.c) === 'ValuationAmount' && !hasAxis(X, f, 'PreviousValuationAxis'));
    if (!va.length) fail('Getaxeerde waarde ontbreekt');
    else if (allVals && !va.some(f => +f.v === totalExp)) fail(`Getaxeerde waarde ${va.map(f => f.v)} ≠ ${totalExp}`);
    else if (!allVals && !va.some(f => +f.v >= totalExp)) fail(`Getaxeerde waarde ${va.map(f => f.v)} < som opgegeven waarden ${totalExp}`);
  }
  // scope
  const sv = get(X, 'ScopeValuation');
  if (exp.scope && (!sv.length || sv[0].v !== exp.scope)) fail(`ScopeValuation ${sv.map(f => f.v)} ≠ ${exp.scope}`);
  // VT15: KPI marktwaarde per deel
  if (tax === 'VT15' && totalExp !== null && allVals) {
    for (const [u, mem] of [['r', 'ResidentialPartRealEstateMember'], ['c', 'CommercialPartRealEstateMember']]) {
      if (!exp.uses.includes(u)) continue;
      const f = X.facts.find(x => loc(x.c) === 'MarketValueAfterTransferCostRounded' && loc(member(X, x, 'TypeOfRealEstateAxis') || '') === mem);
      const part = exp.uses.length > 1 ? r.vbos.reduce((a, _, i) => a + (exp.vboUse[i] === u && sc.vboValues[i] !== '' && sc.vboValues[i] != null ? +sc.vboValues[i] : 0), 0) || totalExp : totalExp;
      if (!f) fail(`KPI marktwaarde k.k. afgerond (${NAME[u]}) ontbreekt`);
      else if (+f.v !== part) fail(`KPI marktwaarde k.k. afgerond (${NAME[u]}) ${f.v} ≠ ${part}`);
    }
  }
  // VT17: IPD-type in lijn met gebruik
  if (exp.uses.length === 1 && exp.uses[0] !== 'c') {
    const ipd = X.facts.find(f => loc(f.c) === 'IPDTypeProperty' && loc(member(X, f, 'RealEstatePropertyTaxAxis') || '') === 'RealEstatePropertyTaxMember');
    const lab = ipd && (M[tax].APP.concepts[ipd.c].e.find(e => e[0] === ipd.v) || [])[1];
    if (ipd && !(exp.uses[0] === 'r' ? /woning|residentieel/i : /landelijk|agrar/i).test(lab || '')) fail(`IPD-type ${ipd.v} (${lab}) past niet bij ${NAME[exp.uses[0]]}`);
  }
}
const NAME = { r: 'residentieel', c: 'commercieel', a: 'agrarisch', u: 'unlinked' };

// ------------------------------------------------------------------ veldtoewijzing
function fieldChecks(X, sc, r, fail) {
  const fx = sc.fixed || {};
  const ref = (mem) => X.facts.find(f => loc(f.c) === 'Reference' && dimsOf(X, f).some(d => loc(d.m) === mem));
  const alloc = (mem) => X.facts.find(f => loc(f.c) === 'ReferenceAllocatedByPartyType' && dimsOf(X, f).some(d => loc(d.m) === mem));
  const ep = r.ep;
  if (sc.caseId && ep !== 'Taxatierapport-Conformiteitsscore') {
    const f = ref('AssignmentInformationMember');
    if (f && f.v !== sc.caseId) fail(`Case ID: ${f.v} ≠ ${sc.caseId}`);
    if (!f && ep === 'Taxatierapport') fail('Case ID niet gevonden');
  }
  if (ep === 'Taxatierapport') {
    const pid = ref('ClientMember');
    const expPid = (sc.vbos || []).find(Boolean);
    if (!pid) fail('Process ID (Opdrachtgever › Referentie) ontbreekt');
    else {
      if (expPid && pid.v !== expPid) fail(`Process ID ${pid.v} ≠ VBO 1 ${expPid}`);
      if (!expPid && !/^2000000\d{5}$/.test(pid.v)) fail(`Process ID ${pid.v} niet 12 cijfers beginnend met 2000000`);
      const a = alloc('ClientMember'); if (!a || !['4', 'Geldgever'].includes(a.v)) fail(`Process ID toegekend door ${a && a.v}`);
    }
    if (fx.valuerReportId) { const f = ref('ContractorMember'); if (!f || f.v !== fx.valuerReportId) fail(`Valuer report ID ${f && f.v} ≠ ${fx.valuerReportId}`); const a = alloc('ContractorMember'); if (!a || !['6', 'Taxateur'].includes(a.v)) fail(`Valuer report ID toegekend door ${a && a.v}`); }
    if (fx.valuerKvk) {
      const k = X.facts.filter(f => loc(f.c) === 'ChamberOfCommerceRegistrationNumber' && dimsOf(X, f).some(d => /ContractorMember|EntityInformationRealEstateMember/.test(d.m)));
      if (!k.length || k.some(f => f.v !== fx.valuerKvk)) fail(`KvK taxateur ${k.map(f => f.v)} ≠ ${fx.valuerKvk}`);
    }
    if (fx.waardepeildatum) {
      const iso = fx.waardepeildatum.split('-').reverse().join('-');
      const vd = get(X, 'ValuationDate').filter(f => !hasAxis(X, f, 'PreviousValuationAxis'));
      if (!vd.some(f => f.v === iso)) fail(`Waardepeildatum ${vd.map(f => f.v)} ≠ ${iso}`);
    }
  }
  // hoofdadres VBO 1
  const v1 = (r.vbos || [])[0];
  if (v1 && (fx.straat || fx.postcode)) {
    const at = (c) => X.facts.find(f => loc(f.c) === c && onlyDims(X, f, { BAGVBOIDAxis: v1 }));
    if (fx.straat && at('StreetNameNL') && at('StreetNameNL').v !== fx.straat) fail(`Straat VBO 1 ${at('StreetNameNL').v} ≠ ${fx.straat}`);
    if (fx.postcode && at('PostalCodeNL') && at('PostalCodeNL').v !== fx.postcode) fail(`Postcode VBO 1 ${at('PostalCodeNL').v} ≠ ${fx.postcode}`);
    if (fx.huisnummer && at('HouseNumberNL') && at('HouseNumberNL').v !== String(fx.huisnummer).match(/\d+/)[0]) fail(`Huisnummer VBO 1 ${at('HouseNumberNL').v} ≠ ${fx.huisnummer}`);
    if (ep === 'Taxatierapport' && !at('PostalCodeNL')) fail('Hoofdadres VBO 1 ontbreekt');
  }
}

// ------------------------------------------------------------------ scenario's
const V = (i) => '0363010000' + String(100001 + i);
const ADDR = { straat: 'Oudegracht', huisnummer: '12', postcode: '3511AB', waardepeildatum: '01-11-2026', valuerKvk: '12345678', valuerReportId: 'VR-2026-1' };
const T = [];
const add = (name, sc, exp) => T.push({ name, sc: Object.assign({ dataproduct: 'Taxatierapport', caseId: 'CASE-' + (T.length + 1) }, sc), exp: exp || {} });
const code = (u) => ({ Commercial: 'c', Residential: 'r', Agricultural: 'a', Unlinked: 'u' })[u];
function scen(tax, use, vbos, extra) {
  const uses = vbos.map(v => v[0]), vals = vbos.map(v => v[1]);
  return Object.assign({ taxonomy: tax, vbos: vbos.map((_, i) => V(i)), vboUses: uses, vboValues: vals, fixed: Object.assign({ useType: use }, ADDR) }, extra || {});
}
for (const tax of Object.keys(M)) {
  const ag = tax === 'VT17';
  // 1. residentieel
  add(`${tax} residentieel 1 VBO`, scen(tax, 'Residential', [['Residential', 425000]]), { uses: ['r'], vboUse: ['r'], scope: '2' });
  add(`${tax} residentieel 3 VBO's`, scen(tax, 'Residential', [['Residential', 300000], ['Residential', 275000], ['Residential', 410000]]), { uses: ['r'], vboUse: ['r', 'r', 'r'], scope: '2' });
  add(`${tax} residentieel zonder Use per VBO`, scen(tax, 'Residential', [['', 350000], ['', 360000]]), { uses: ['r'], vboUse: ['r', 'r'], scope: '2' });
  add(`${tax} residentieel + unlinked parkeerplek`, scen(tax, 'Residential', [['Residential', 500000], ['Unlinked', 25000]]), { uses: ['r'], vboUse: ['r', 'u'], scope: '2' });
  add(`${tax} residentieel 5 VBO's`, scen(tax, 'Residential', [['Residential', 1], ['Residential', 2], ['Residential', 3], ['Residential', 4], ['Residential', 5]].map(([u, k]) => [u, 200000 + k * 10000])), { uses: ['r'], vboUse: ['r', 'r', 'r', 'r', 'r'], scope: '2' });
  add(`${tax} residentieel zonder marktwaarden`, scen(tax, 'Residential', [['Residential', ''], ['Residential', '']]), { uses: ['r'], vboUse: ['r', 'r'], scope: '2' });
  // 2. commercieel
  add(`${tax} commercieel 1 VBO`, scen(tax, 'Commercial', [['Commercial', 1800000]]), { uses: ['c'], vboUse: ['c'], scope: '1' });
  add(`${tax} commercieel 3 VBO's`, scen(tax, 'Commercial', [['Commercial', 900000], ['Commercial', 700000], ['Commercial', 400000]]), { uses: ['c'], vboUse: ['c', 'c', 'c'], scope: '1' });
  add(`${tax} commercieel + unlinked grond`, scen(tax, 'Commercial', [['Commercial', 1200000], ['Unlinked', 150000]]), { uses: ['c'], vboUse: ['c', 'u'], scope: '1' });
  // 3. mixed
  add(`${tax} mixed 1 com + 1 res`, scen(tax, 'Mixed use', [['Commercial', 1000000], ['Residential', 400000]]), { uses: ['c', 'r'], vboUse: ['c', 'r'], scope: '3' });
  add(`${tax} mixed res eerst`, scen(tax, 'Mixed use', [['Residential', 350000], ['Commercial', 650000]]), { uses: ['c', 'r'], vboUse: ['r', 'c'], scope: '3' });
  add(`${tax} mixed 2 com + 2 res + unlinked`, scen(tax, 'Mixed use', [['Commercial', 800000], ['Residential', 300000], ['Commercial', 500000], ['Residential', 320000], ['Unlinked', 30000]]), { uses: ['c', 'r'], vboUse: ['c', 'r', 'c', 'r', 'u'], scope: '3' });
  add(`${tax} mixed zonder Use per VBO (VBO1 com, rest res)`, scen(tax, 'Mixed use', [['', 900000], ['', 300000], ['', 310000]]), { uses: ['c', 'r'], vboUse: ['c', 'r', 'r'], scope: '3' });
  add(`${tax} mixed afgeleid (geen report Use)`, scen(tax, '', [['Commercial', 700000], ['Residential', 300000]]), { uses: ['c', 'r'], vboUse: ['c', 'r'], scope: '3' });
  add(`${tax} mixed met 1 VBO (waarschuwing)`, scen(tax, 'Mixed use', [['', 600000]]), { uses: ['c'], vboUse: ['c'], scope: '3', warn: /Mixed use with only one VBO/ });
  // 4. afgeleid / mismatch
  add(`${tax} geen report Use, alleen residentieel`, scen(tax, '', [['Residential', 400000]]), { uses: ['r'], vboUse: ['r'], scope: '2' });
  add(`${tax} mismatch: report commercial, VBO residential`, scen(tax, 'Commercial', [['Residential', 400000]]), { uses: ['r'], vboUse: ['r'], scope: '1', warn: /deliberate mismatch/ });
  add(`${tax} alle VBO's unlinked + report residential`, scen(tax, 'Residential', [['Unlinked', 50000], ['Unlinked', 60000]]), { uses: ['r'], vboUse: ['u', 'u'], scope: '2' });
  add(`${tax} geen VBO's, residential`, Object.assign(scen(tax, 'Residential', []), { vbos: [] }), { uses: ['r'], vboUse: [], scope: '2', noVbo: true });
  add(`${tax} Nederlandse invoer (woning/bedrijf/parkeerplaats)`, scen(tax, 'gemengd', [['bedrijf', 700000], ['woning', 300000], ['parkeerplaats', 20000]]), { uses: ['c', 'r'], vboUse: ['c', 'r', 'u'], scope: '3' });
  add(`${tax} code-invoer Use = 2`, scen(tax, '2', [['', 380000]]), { uses: ['r'], vboUse: ['r'], scope: '2' });
  add(`${tax} lege VBO ID met Use`, Object.assign(scen(tax, 'Residential', [['Residential', 300000], ['Residential', 310000]]), { vbos: [V(0), ''] }), { uses: ['r'], vboUse: ['r', 'r'], scope: '2' });
  add(`${tax} VBO-ID's uit voorbeeldsjabloon (12 cijfers)`, Object.assign(scen(tax, 'Mixed use', [['Commercial', 700000], ['Residential', 300000]]), { vbos: ['200000058298', '200000058299'] }), { uses: ['c', 'r'], vboUse: ['c', 'r'], scope: '3' });
  add(`${tax} lange straatnaam (negatieve test)`, Object.assign(scen(tax, 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', straat: 'Burgemeester de Withstraat' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', expectDev: /StreetNameNL/ });
  add(`${tax} dubbele VBO ID`, Object.assign(scen(tax, 'Residential', [['Residential', 300000], ['Residential', 310000]]), { vbos: [V(0), V(0)] }), { uses: ['r'], vboUse: ['r', 'r'], scope: '2', dup: true });
  if (ag) {
    add(`${tax} agrarisch 1 VBO`, scen(tax, 'Agricultural', [['Agricultural', 2500000]]), { uses: ['a'], vboUse: ['a'], scope: '5' });
    add(`${tax} agrarisch + unlinked grond`, scen(tax, 'Agricultural', [['Agricultural', 2500000], ['Unlinked', 400000], ['Agricultural', 600000]]), { uses: ['a'], vboUse: ['a', 'u', 'a'], scope: '5' });
    add(`${tax} agrarisch + residentieel (boerderij met woning)`, scen(tax, 'Agricultural', [['Agricultural', 2000000], ['Residential', 450000]]), { uses: ['a', 'r'], vboUse: ['a', 'r'], scope: '5', warn: /deliberate mismatch/ });
    add(`${tax} drie gebruiken`, scen(tax, '', [['Commercial', 800000], ['Residential', 400000], ['Agricultural', 900000]]), { uses: ['a', 'c', 'r'], vboUse: ['c', 'r', 'a'], scope: '5' });
  } else {
    add(`${tax} agrarisch → foutmelding`, scen(tax, 'Agricultural', [['Agricultural', 1]]), { error: /only available for VT17/ });
  }
}
// overige dataproducten: veldtoewijzing + generiek
for (const tax of Object.keys(M)) for (const ep of M[tax].dataproducts()) {
  if (ep === 'Taxatierapport') continue;
  add(`${tax} ${ep} met VBO's`, Object.assign(scen(tax, 'Residential', [['Residential', 300000], ['Commercial', 500000]]), { dataproduct: ep }), { other: true });
  add(`${tax} ${ep} leeg (alleen dataproduct)`, { taxonomy: tax, dataproduct: ep, caseId: '', vbos: [], vboUses: [], vboValues: [], fixed: {} }, { other: true });
}
// robuustheid
add('Onbekende taxonomie', { taxonomy: 'VT16', vbos: [V(0)], vboUses: ['Residential'], vboValues: [1], fixed: {} }, { error: /Unknown taxonomy/ });
add('Onbekend dataproduct', { taxonomy: 'VT17', dataproduct: 'Taxatierapportje', vbos: [], fixed: {} }, { error: /./ });
add('Taxonomie "vt 15" (spelling)', Object.assign(scen('vt 15', 'Residential', [['Residential', 300000]])), { uses: ['r'], vboUse: ['r'], scope: '2', tax: 'VT15' });
add('Onbekende Use VBO', scen('VT17', 'Residential', [['Kantoortje?', 300000]]), { uses: ['r'], vboUse: ['r'], scope: '2', warn: /not recognised/ });
add('Marktwaarde met punten/€', scen('VT17', 'Residential', [['Residential', '€ 425.000']]), { uses: ['r'], vboUse: ['r'], scope: '2', valuesRaw: true });
add('Waardepeildatum ongeldig', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', waardepeildatum: '31-02-2026' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', invalidDate: true, expectDev: /ValuationDate/ });

// randgevallen in invoer
add('Speciale tekens in case ID en straat', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { caseId: 'A&B <x> "q" \'s', fixed: Object.assign({}, ADDR, { useType: 'Residential', straat: "Rue d'Été & Co" }) }), { uses: ['r'], vboUse: ['r'], scope: '2' });
add('Waardepeildatum in de toekomst', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', waardepeildatum: '01-01-2030' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', futureDate: true });
add('Waardepeildatum lang geleden', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', waardepeildatum: '15-03-2012' }) }), { uses: ['r'], vboUse: ['r'], scope: '2' });
add('Marktwaarde 0', scen('VT17', 'Residential', [['Residential', 0]]), { uses: ['r'], vboUse: ['r'], scope: '2' });
add('Marktwaarde zeer groot', scen('VT17', 'Commercial', [['Commercial', 950000000]]), { uses: ['c'], vboUse: ['c'], scope: '1' });
add('Marktwaarde negatief', scen('VT17', 'Residential', [['Residential', -5000]]), { uses: ['r'], vboUse: ['r'], scope: '2', negVal: true });
add('Marktwaarde tekst', scen('VT17', 'Residential', [['Residential', 'onbekend']]), { uses: ['r'], vboUse: ['r'], scope: '2', textVal: true, expectDev: /MarketValueVHE/ });
add('Marktwaarde decimalen', scen('VT17', 'Residential', [['Residential', 312500.75]]), { uses: ['r'], vboUse: ['r'], scope: '2', decVal: true });
add('Engels "empty" in KvK', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', valuerKvk: 'empty' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', emptyKvk: true, expectDev: /ChamberOfCommerceRegistrationNumber/ });
add('Nederlands "leeg" in KvK', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', valuerKvk: 'leeg' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', emptyKvk: true, expectDev: /ChamberOfCommerceRegistrationNumber/ });
add('Huisnummer met toevoeging "12-3"', Object.assign(scen('VT17', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', huisnummer: '12-3' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', hn: ['12', '3'] });
add('Postcode met spatie', Object.assign(scen('VT15', 'Residential', [['Residential', 300000]]), { fixed: Object.assign({}, ADDR, { useType: 'Residential', postcode: '3511 ab' }) }), { uses: ['r'], vboUse: ['r'], scope: '2', pcNorm: true });
for (const tax of Object.keys(M)) add(`${tax} Huurinformatie residentieel: geen Ruimtes`, Object.assign(scen(tax, 'Residential', [['Residential', ''], ['Unlinked', '']]), { dataproduct: 'Huurinformatie' }), { other: true, noUnit: 'UnitAxis' });
for (const tax of Object.keys(M)) add(`${tax} Huurinformatie commercieel: geen Eenheden`, Object.assign(scen(tax, 'Commercial', [['Commercial', '']]), { dataproduct: 'Huurinformatie' }), { other: true, noUnit: 'HouseAxis' });

for (const tax of Object.keys(M)) for (const ep of M[tax].dataproducts()) if (ep !== 'Taxatierapport') add(`${tax} ${ep} residentieel: sector type woningen`, Object.assign(scen(tax, 'Residential', [['Residential', 300000]]), { dataproduct: ep }), { other: true });
// willekeurige combinaties (fuzz), verwachting onafhankelijk afgeleid
let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const FUZZ = +(process.env.FUZZ || 300);
for (let k = 0; k < FUZZ; k++) for (const tax of Object.keys(M)) {
  const pool = tax === 'VT17' ? ['Commercial', 'Residential', 'Agricultural', 'Unlinked', ''] : ['Commercial', 'Residential', 'Unlinked', ''];
  const reports = tax === 'VT17' ? ['Commercial', 'Residential', 'Mixed use', 'Agricultural', ''] : ['Commercial', 'Residential', 'Mixed use', ''];
  const n = 1 + rnd(5), rep = reports[rnd(reports.length)];
  const vb = [...Array(n)].map(() => [pool[rnd(pool.length)], rnd(3) ? (100 + rnd(900)) * 1000 : '']);
  const rc = { Commercial: 'c', Residential: 'r', Agricultural: 'a', 'Mixed use': 'm', '': null }[rep];
  const vboUse = vb.map(([u], i) => u ? code(u) : (rc === 'm' ? (i === 0 ? 'c' : 'r') : rc || 'c'));
  let uses = [...new Set(vboUse.filter(u => u !== 'u'))];
  if (!uses.length) uses = rc === 'm' ? ['c', 'r'] : [rc || 'c'];
  const scope = rc ? { c: '1', r: '2', m: '3', a: '5' }[rc] : uses.includes('a') ? '5' : uses.includes('c') && uses.includes('r') ? '3' : uses.includes('r') ? '2' : '1';
  add(`fuzz ${tax} #${k} ${rep || '-'} [${vb.map(v => v[0] || '-').join(',')}]`, scen(tax, rep, vb), { uses: uses.sort(), vboUse, scope, fuzz: true });
}

// ------------------------------------------------------------------ uitvoeren
const filter = process.argv[2];
let pass = 0, failN = 0; const failures = [];
for (const t of T) {
  if (filter && !t.name.includes(filter)) continue;
  const errs = [];
  const fail = (m) => errs.push(m);
  let r;
  try { r = Core.generate(M, JSON.parse(JSON.stringify(t.sc)), { today: TODAY }); } catch (e) { errs.push('CRASH ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  if (r) {
    if (t.exp.error) { if (r.ok || !r.errors.some(e => t.exp.error.test(e))) fail(`verwachte fout ${t.exp.error} niet gekregen (ok=${r.ok}, ${r.errors.join('; ')})`); }
    else if (!r.ok) fail('niet gegenereerd: ' + r.errors.join('; '));
    else {
      if (t.exp.tax && r.tax !== t.exp.tax) fail(`taxonomie ${r.tax} ≠ ${t.exp.tax}`);
      const model = M[r.tax];
      const X = parseX(r.xml);
      fs.writeFileSync(path.join(OUT, t.name.replace(/[^\w]+/g, '_') + '.xbrl'), r.xml);
      genericChecks(X, r.xml, model, r.ep, r, (m) => { if (t.exp.dup && /dubbel feit|identiek|dubbele/.test(m)) return; if (t.exp.expectDev && t.exp.expectDev.test(m)) return; if (t.exp.futureDate && /in de toekomst/.test(m)) return; fail(m); });
      const dev = r.validation.errors;
      if (t.exp.expectDev) { if (!dev.some(e => t.exp.expectDev.test(e))) fail(`verwachte afwijking ${t.exp.expectDev} niet gemeld`); }
      else if (dev.length && !t.exp.dup) fail(`${dev.length} afwijking(en) volgens eigen validator: ${dev[0]}`);
      if (t.exp.warn && !r.warnings.some(w => t.exp.warn.test(w))) fail(`verwachte waarschuwing ${t.exp.warn} ontbreekt (${r.warnings.join(' / ')})`);
      if (t.exp.uses && r.ep === 'Taxatierapport' && !t.exp.dup) {
        const sc2 = t.exp.valuesRaw ? Object.assign({}, t.sc, { vboValues: [425000] }) : (t.exp.negVal || t.exp.textVal) ? Object.assign({}, t.sc, { vboValues: [''] }) : t.exp.decVal ? Object.assign({}, t.sc, { vboValues: [312501] }) : t.exp.pcNorm ? Object.assign({}, t.sc, { fixed: Object.assign({}, t.sc.fixed, { postcode: '3511AB' }) }) : t.sc;
        useChecks(X, sc2, r, t.exp, fail);
      }
      if (!t.exp.emptyKvk && !t.exp.pcNorm) fieldChecks(X, Object.assign({}, t.sc, t.exp.invalidDate || t.exp.futureDate ? { fixed: Object.assign({}, t.sc.fixed, { waardepeildatum: '' }) } : {}), r, fail);
      if (t.exp.futureDate && !r.warnings.some(w => /future|toekomst/i.test(w))) fail('waardepeildatum in de toekomst geeft geen waarschuwing');
      if (t.exp.emptyKvk && X.facts.some(f => loc(f.c) === 'ChamberOfCommerceRegistrationNumber' && dimsOf(X, f).some(d => /ContractorMember/.test(d.m)))) fail('KvK taxateur niet leeg/verwijderd');
      if (t.exp.hn) { const v1 = r.vbos[0]; const hn = X.facts.find(f => loc(f.c) === 'HouseNumberNL' && onlyDims(X, f, { BAGVBOIDAxis: v1 })); const ad = X.facts.find(f => loc(f.c) === 'HouseNumberAddition' && onlyDims(X, f, { BAGVBOIDAxis: v1 })); if (!hn || hn.v !== t.exp.hn[0] || !ad || ad.v !== t.exp.hn[1]) fail(`huisnummer/toevoeging ${hn && hn.v}/${ad && ad.v}`); }
      if (t.exp.other && t.sc.fixed && t.sc.fixed.useType === 'Residential' && !(t.sc.vboUses || []).some(u => u === 'Commercial')) {
        for (const f of X.facts.filter(f => ['IPDTypeProperty', 'ActualUse'].includes(loc(f.c)) && !dimsOf(X, f).some(d => /Unit|House|Reference|TypeOfRealEstate/.test(d.a)))) {
          const lab = (model.APP.concepts[f.c].e.find(e => e[0] === f.v) || [])[1];
          if (!/woning|residentieel/i.test(lab || '')) fail(`${loc(f.c)} = ${lab} bij residentieel`);
        }
      }
      if (t.exp.noUnit && X.facts.some(f => hasAxis(X, f, t.exp.noUnit))) fail(`${t.exp.noUnit} nog aanwezig`);
      if ((t.exp.negVal || t.exp.textVal) && !r.warnings.some(w => /market value/i.test(w))) fail('ongeldige marktwaarde geeft geen waarschuwing');
      if (t.exp.invalidDate && !r.warnings.some(w => /date|datum/i.test(w))) fail('ongeldige datum geeft geen waarschuwing');
      if (t.exp.dup && !r.warnings.some(w => /duplicate|dubbel|twice/i.test(w))) fail('dubbele VBO ID geeft geen waarschuwing');
    }
  }
  if (errs.length) { failN++; failures.push([t.name, errs]); } else pass++;
}
console.log(`\n${pass + failN} tests: ${pass} passed, ${failN} failed\n`);
for (const [n, e] of failures) { console.log('✗ ' + n); [...new Set(e)].slice(0, 8).forEach(x => console.log('    - ' + x)); }
process.exitCode = failN ? 1 : 0;
