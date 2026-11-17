/* Review tests (second round): semantic consistency, validator self-test (mutations), negative-test markers,
 * structure versus the official examples, determinism and uniqueness.
 * node review.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const Core = require('../app/core.js');
const { parseX, loc, dimsOf, hasAxis, member, onlyDims, get } = require('./xparse.js');
const D17 = process.env.APP17 || path.join(__dirname, '../data/appdata-vt17.json');
const D15 = process.env.APP15 || path.join(__dirname, '../data/appdata-vt15.json');
const M = { VT17: new Core.Model(JSON.parse(fs.readFileSync(D17, 'utf8'))), VT15: new Core.Model(JSON.parse(fs.readFileSync(D15, 'utf8'))) };
const TODAY = new Date(Date.UTC(2026, 10, 17)), TODAY_ISO = '2026-11-17';
const V = (i) => '0363010000' + String(300001 + i);
const results = [];
let section = '';
const T = (name, fn) => { const errs = []; try { fn((m) => errs.push(m)); } catch (e) { errs.push('CRASH ' + String(e.stack || e).split('\n').slice(0, 2).join(' | ')); } results.push({ section, name, errs }); };
const gen = (sc) => Core.generate(M, JSON.parse(JSON.stringify(Object.assign({ dataproduct: 'Taxatierapport', caseId: 'RV-1', vbos: [], vboUses: [], vboValues: [], fixed: {} }, sc))), { today: TODAY });
const TAXES = ['VT17', 'VT15'];
const USESETS = { VT17: [['Residential'], ['Commercial'], ['Commercial', 'Residential'], ['Agricultural'], ['Residential', 'Residential', 'Unlinked']], VT15: [['Residential'], ['Commercial'], ['Commercial', 'Residential'], ['Residential', 'Residential', 'Unlinked']] };

// =================================================================== A. inhoudelijke consistentie
section = 'A. Content consistency';
for (const tax of TAXES) for (const us of USESETS[tax]) for (const withVals of [true, false]) {
  const label = `${tax} ${us.join('+')} ${withVals ? 'met' : 'zonder'} marktwaarden`;
  const sc = { taxonomy: tax, vbos: us.map((_, i) => V(i)), vboUses: us, vboValues: us.map((_, i) => withVals ? 300000 + i * 50000 : ''), fixed: { waardepeildatum: '02-11-2026' } };
  const r = gen(sc);
  if (!r.ok) { T(label, (f) => f('niet gegenereerd: ' + r.errors.join('; '))); continue; }
  const X = parseX(r.xml);
  T(label + ' · totaal = som eenheden', (fail) => {
    const va = X.facts.filter(f => loc(f.c) === 'ValuationAmount' && !hasAxis(X, f, 'PreviousValuationAxis'));
    if (!va.length) return fail('Getaxeerde waarde ontbreekt');
    const vhe = get(X, 'MarketValueVHE').filter(f => hasAxis(X, f, 'HouseAxis'));
    const allRes = us.every(u => u === 'Residential');
    if (allRes && vhe.length) { const sum = vhe.reduce((a, f) => a + +f.v, 0); if (!va.some(f => +f.v === sum)) fail(`Getaxeerde waarde ${va.map(f => f.v)} ≠ som marktwaarde per eenheid ${sum}`); }
    if (va.some(f => +f.v <= 0)) fail('Getaxeerde waarde ≤ 0');
    const sumRes = vhe.reduce((a, f) => a + +f.v, 0);
    if (va.every(f => +f.v < sumRes)) fail(`Getaxeerde waarde ${va.map(f => f.v)} < som residentiële eenheden ${sumRes}`);
  });
  T(label + ' · datums', (fail) => {
    const dates = X.facts.filter(f => (M[tax].APP.concepts[f.c] || {}).k === 'date');
    const one = (c) => dates.filter(f => loc(f.c) === c && !hasAxis(X, f, 'PreviousValuationAxis')).map(f => f.v);
    if (!one('DocumentCreationDate').every(v => v === TODAY_ISO)) fail(`DocumentCreationDate ${one('DocumentCreationDate')} ≠ vandaag`);
    if (!one('ValuationDate').includes('2026-11-02')) fail(`ValuationDate ${one('ValuationDate')}`);
    for (const c of ['InspectionDate', 'DateOfInspection', 'ValuationDate', 'DateOfSigning', 'AssignmentDate', 'DateAssignment']) for (const v of one(c)) if (v > TODAY_ISO) fail(`${c} ${v} ligt in de toekomst`);
    for (const f of dates) if (f.v < '1900-01-01' || f.v > '2100-01-01') fail(`${loc(f.c)} ${f.v} onwaarschijnlijk`);
    const pv = dates.filter(f => loc(f.c) === 'ValuationDate' && hasAxis(X, f, 'PreviousValuationAxis'));
    for (const f of pv) if (f.v >= '2026-11-02') fail(`eerdere taxatie ${f.v} niet vóór de waardepeildatum`);
    // contexten: één peildatum
    const insts = new Set(Object.values(X.ctx).map(c => c.inst || c.end));
    if (insts.size !== 1) fail(`contexten hebben ${insts.size} verschillende datums: ${[...insts].slice(0, 4)}`);
    else if (![...insts][0] || [...insts][0] > TODAY_ISO) fail(`contextdatum ${[...insts][0]} in de toekomst`);
    // huurcontract: start < einde
    const byCtx = {}; for (const f of dates) (byCtx[f.ctx] = byCtx[f.ctx] || {})[loc(f.c)] = f.v;
    for (const o of Object.values(byCtx)) { const s = o.LeaseStartDate || o.StartDateLease || o.ContractStartDate, e = o.LeaseEndDate || o.EndDateLease || o.ContractEndDate; if (s && e && s >= e) fail(`huurcontract start ${s} ≥ einde ${e}`); }
  });
  T(label + ' · partijen en contactgegevens', (fail) => {
    const C = M[tax].APP.concepts;
    for (const f of X.facts) {
      const l = loc(f.c);
      if (l === 'EmailAddressFull' && !/^[a-z0-9._-]+@[a-z0-9-]+\.nl$/.test(f.v)) fail(`e-mail "${f.v}"`);
      if (l === 'TelephoneNumber' && !/^0\d{9}$/.test(f.v)) fail(`telefoon "${f.v}"`);
      if (l === 'ChamberOfCommerceRegistrationNumber' && !/^[1-9]\d{7}$/.test(f.v)) fail(`KvK "${f.v}"`);
      if (l === 'PostalCodeNL' && !/^[1-9]\d{3}[A-Z]{2}$/.test(f.v)) fail(`postcode "${f.v}"`);
      if (['FirstName', 'FamilyName', 'OrganisationName', 'LegalEntityName'].includes(l) && f.v.trim().length < 2) fail(`${l} leeg`);
      if ((C[f.c] || {}).k === 'percent' && Math.abs(+f.v) > 1.0001 && !/Index|Growth|Change/.test(l)) fail(`${l} = ${f.v} (percentage > 100%)`);
    }
    const ent = Object.values(X.ctx)[0];
    if (!/^[0-9]{8}$/.test(ent.id)) fail(`entity identifier "${ent.id}"`);
    if (!/kvk/i.test(ent.scheme)) fail(`entity scheme ${ent.scheme}`);
    // partijen hebben verschillende namen
    const names = {}; for (const f of X.facts) if (loc(f.c) === 'OrganisationName' || loc(f.c) === 'LegalEntityName') { const p = (dimsOf(X, f).find(d => /PartyAxis/.test(d.a)) || {}).m; if (p) names[p] = f.v; }
    const vals = Object.values(names); if (vals.length > 1 && new Set(vals).size === 1) fail('alle partijen hebben dezelfde organisatienaam');
  });
  T(label + ' · interne verwijzingen', (fail) => {
    const units = new Set(X.facts.filter(f => hasAxis(X, f, 'UnitAxis') && !hasAxis(X, f, 'LeaseContractAxis')).map(f => member(X, f, 'UnitAxis')));
    for (const f of X.facts) if (hasAxis(X, f, 'UnitAxis') && hasAxis(X, f, 'LeaseContractAxis') && !units.has(member(X, f, 'UnitAxis'))) fail(`huurcontract verwijst naar onbekende ruimte ${member(X, f, 'UnitAxis')}`);
    const bag = new Set(get(X, 'BAGVBOID').map(f => f.v));
    for (const f of get(X, 'LinkedBAGVBOID')) if (!bag.has(f.v)) fail(`LinkedBAGVBOID ${f.v} bestaat niet als BAGVBOID`);
    for (const f of X.facts) { const m = member(X, f, 'BAGVBOIDAxis'); if (m && !bag.has(m)) fail(`BAGVBOID-as ${m} zonder BAGVBOID-feit`); }
    const pands = new Set(get(X, 'BAGPANDID').map(f => f.v));
    for (const f of X.facts) { const m = member(X, f, 'BAGPANDIDAxis'); if (m && pands.size && !pands.has(m)) fail(`BAGPANDID-as ${m} zonder BAGPANDID-feit`); }
    for (const v of bag) if (!/^\d{16}$/.test(v)) fail(`BAGVBOID ${v} geen 16 cijfers`);
    for (const v of pands) if (!/^\d{16}$/.test(v)) fail(`BAGPANDID ${v} geen 16 cijfers`);
  });
}

// =================================================================== B. validator zelftest (mutaties)
section = 'B. Self-test of the built-in check (injected errors must be found)';
for (const tax of TAXES) {
  const r = gen({ taxonomy: tax, vbos: [V(0), V(1)], vboUses: ['Commercial', 'Residential'], vboValues: [900000, 350000] });
  const base = () => r.facts.map(f => ({ c: f.c, d: f.d.map(x => x.slice()), v: f.v, u: f.u ? f.u.slice() : null, dec: f.dec }));
  const val = (facts) => Core.validate(M[tax], 'Taxatierapport', facts, TODAY, r.entity).errors;
  T(`${tax} uitgangspunt zonder afwijkingen`, (fail) => { const e = val(base()); if (e.length) fail(e[0]); });
  const C = M[tax].APP.concepts;
  const pick = (pred) => { const fs_ = base(); const i = fs_.findIndex(pred); return [fs_, i]; };
  const MUT = [
    ['verplicht feit verwijderd', () => { const req = M[tax].APP.eps.Taxatierapport.req[0]; const fs_ = base().filter(f => f.c !== req.c); return fs_; }],
    ['ongeldige enumeratiewaarde', () => { const [fs_, i] = pick(f => C[f.c] && C[f.c].e && !C[f.c].set); fs_[i].v = 'XXX'; return fs_; }],
    ['tekst in bedrag', () => { const [fs_, i] = pick(f => C[f.c] && C[f.c].k === 'monetary'); fs_[i].v = 'veel'; return fs_; }],
    ['verkeerde unit bij bedrag', () => { const [fs_, i] = pick(f => C[f.c] && C[f.c].k === 'monetary'); fs_[i].u = ['utr:sqm']; return fs_; }],
    ['bedrag zonder unit', () => { const [fs_, i] = pick(f => C[f.c] && C[f.c].k === 'monetary'); fs_[i].u = null; return fs_; }],
    ['ongeldige datum', () => { const [fs_, i] = pick(f => C[f.c] && C[f.c].k === 'date'); fs_[i].v = '2026-02-31'; return fs_; }],
    ['onbekend concept', () => { const fs_ = base(); fs_.push({ c: 'frc-vt-i:BestaatNiet', d: [], v: 'x', u: null }); return fs_; }],
    ['onbekende dimensie-member', () => { const [fs_, i] = pick(f => f.d.some(x => x[1] === 'e')); fs_[i].d.find(x => x[1] === 'e')[2] = 'frc-vt-dm:BestaatNietMember'; return fs_; }],
    ['feit in verkeerde dimensie', () => { const [fs_, i] = pick(f => f.c === 'frc-vt-i:ScopeValuation'); fs_[i].d = [['frc-vt-dim:HouseAxis', 't', 'Eenheid 9']]; return fs_; }],
    ['postcode fout formaat', () => { const [fs_, i] = pick(f => f.c === 'nl-cd:PostalCodeNL'); fs_[i].v = '12345'; return fs_; }],
    ['KvK-nummer 7 cijfers', () => { const [fs_, i] = pick(f => f.c === 'nl-cd:ChamberOfCommerceRegistrationNumber'); fs_[i].v = '1234567'; return fs_; }],
    ['straatnaam 30 tekens', () => { const [fs_, i] = pick(f => f.c === 'nl-cd:StreetNameNL'); fs_[i].v = 'A'.repeat(30); return fs_; }],
    ['Eenheid zonder HouseTypeID', () => base().filter(f => !(f.c === 'frc-vt-i:HouseTypeID' && f.d.some(x => x[0] === 'frc-vt-dim:HouseAxis')))],
    ['residentieel deel zonder Eenheden', () => base().filter(f => !f.d.some(x => x[0] === 'frc-vt-dim:HouseAxis'))],
    ['dubbel feit', () => { const fs_ = base(); fs_.push(Object.assign({}, fs_.find(f => f.c === 'frc-vt-i:ScopeValuation'))); return fs_; }],
  ];
  for (const [name, mk] of MUT) T(`${tax} · ${name}`, (fail) => { const e = val(mk()); if (!e.length) fail('NIET gevonden door de controle'); });
}

// =================================================================== C. negatieve tests: EMPTY / REMOVE per veld
section = 'C. Leaving fields out (EMPTY) and invalid input';
const FIELD_CONCEPT = { valuerReportId: ['Reference', 'ContractorMember'], valuerKvk: ['ChamberOfCommerceRegistrationNumber', 'ContractorMember'], useType: ['ScopeValuation', null], postcode: ['PostalCodeNL', 'VBO'], straat: ['StreetNameNL', 'VBO'], huisnummer: ['HouseNumberNL', 'VBO'], waardepeildatum: ['ValuationDate', null] };
for (const tax of TAXES) for (const [field, [concept, where]] of Object.entries(FIELD_CONCEPT)) for (const marker of ['EMPTY', 'leeg']) {
  T(`${tax} ${field} = ${marker}`, (fail) => {
    const r = gen({ taxonomy: tax, vbos: [V(0)], vboUses: ['Residential'], vboValues: [300000], fixed: { useType: 'Residential', straat: 'Oudegracht', huisnummer: '12', postcode: '3511AB', valuerKvk: '12345678', valuerReportId: 'VR-1', waardepeildatum: '02-11-2026', [field]: marker } });
    if (!r.ok) return fail('niet gegenereerd: ' + r.errors.join('; '));
    const X = parseX(r.xml);
    const hit = X.facts.filter(f => loc(f.c) === concept && (where === null ? !hasAxis(X, f, 'PreviousValuationAxis') : where === 'VBO' ? onlyDims(X, f, { BAGVBOIDAxis: V(0) }) : dimsOf(X, f).some(d => loc(d.m) === where)));
    if (hit.length) fail(`${concept} staat er nog (${hit.map(f => f.v)})`);
    if (X.facts.some(f => f.v === marker)) fail(`letterlijke tekst "${marker}" in de XBRL`);
  });
}
T('Case ID = EMPTY', (fail) => { const r = gen({ caseId: 'EMPTY', vbos: [V(0)], vboUses: ['Residential'] }); const X = parseX(r.xml); if (X.facts.some(f => f.v === 'EMPTY')) fail('letterlijke tekst EMPTY als case ID in de XBRL'); });
T('VBO ID = EMPTY', (fail) => { const r = gen({ vbos: ['EMPTY'], vboUses: ['Residential'] }); const X = parseX(r.xml); if (X.facts.some(f => f.v === 'EMPTY') || Object.values(X.ctx).some(c => c.dims.some(d => d.m === 'EMPTY'))) fail('letterlijke tekst EMPTY als VBO ID in de XBRL'); });
T('Marktwaarde VBO = EMPTY', (fail) => { const r = gen({ vbos: [V(0)], vboUses: ['Residential'], vboValues: ['EMPTY'] }); const X = parseX(r.xml); if (X.facts.some(f => f.v === 'EMPTY')) fail('letterlijke tekst EMPTY als marktwaarde'); if (r.validation.errors.length) fail(r.validation.errors[0]); });

// =================================================================== D. structuur t.o.v. officieel voorbeeld
section = 'D. Structure compared with the official examples';
for (const tax of TAXES) for (const ep of M[tax].dataproducts()) {
  T(`${tax} ${ep}: geen velden kwijtgeraakt t.o.v. officieel voorbeeld`, (fail) => {
    const E = M[tax].APP.eps[ep];
    const r = gen({ taxonomy: tax, dataproduct: ep, vbos: [V(0)], vboUses: ep === 'Taxatierapport' ? ['Commercial'] : [], vboValues: [] });
    if (!r.ok) return fail(r.errors.join('; '));
    const sig = (c, d) => c + '|' + d.map(x => x[0] + (x[1] === 'e' ? '=' + x[2] : '')).sort().join(',');
    const have = new Set(r.facts.map(f => sig(f.c, f.d)));
    const missing = [...new Set(E.base.facts.map(f => sig(f.c, f.d)))].filter(s => !have.has(s));
    const allowed = /HouseNumberAddition|IPDSubtype|BuildingBlocks|TypeSaleReferenceRuralAgricultural|CommercialBuildings|Cultiva|HousesAcreage|HousesAmount|RightsAmount|OtherLand/;
    const real = missing.filter(s => !allowed.test(s));
    if (real.length) fail(`${real.length} veld(en) uit het voorbeeld ontbreken: ${real.slice(0, 4).map(s => s.split('|')[0].split(':')[1] + ' [' + s.split('|')[1].replace(/frc-vt-d(im|m):/g, '') + ']').join('; ')}`);
    const X = parseX(r.xml);
    if (X.facts.length !== r.facts.length) fail(`XML bevat ${X.facts.length} feiten, intern ${r.facts.length}`);
  });
}

// =================================================================== E. determinisme en uniciteit
section = 'E. Repeatability and uniqueness';
T('Zelfde regel twee keer → identieke XBRL', (fail) => { const sc = { vbos: [V(0)], vboUses: ['Residential'], vboValues: [300000] }; if (gen(sc).xml !== gen(sc).xml) fail('uitvoer verschilt tussen twee runs'); });
T('Zonder VBO: Process ID 12 cijfers, begint met 2000000', (fail) => { for (let i = 0; i < 50; i++) { const r = gen({ caseId: 'P' + i }); if (!/^2000000\d{5}$/.test(r.procesId)) return fail(`Process ID ${r.procesId}`); } });
T('50 regels → verschillende vuldata per rapport', (fail) => {
  const names = new Set(), kvk = new Set();
  for (let i = 0; i < 50; i++) { const r = gen({ caseId: 'CASE-' + i, id: 'CASE-' + i, vbos: [V(i)], vboUses: ['Residential'] }); const X = parseX(r.xml); names.add(get(X, 'FamilyName').map(f => f.v).join('/')); kvk.add(r.entity); }
  if (names.size < 40) fail(`slechts ${names.size} verschillende namensets op 50 rapporten`);
  if (kvk.size < 45) fail(`slechts ${kvk.size} verschillende KvK-nummers op 50 rapporten`);
});
T('Ander dataproduct, zelfde case → zelfde Case ID in elk bestand', (fail) => {
  for (const tax of TAXES) for (const ep of M[tax].dataproducts()) { const r = gen({ taxonomy: tax, dataproduct: ep, caseId: 'ZELFDE-1', vbos: [V(0)] }); if (!r.xml.includes('>ZELFDE-1<') && !r.warnings.some(w => /Case \/ Reference ID is not written/.test(w))) fail(`${tax} ${ep}: case ID niet gevonden en geen waarschuwing`); if (/Conformiteit/.test(ep)) continue; }
});
T('Datum van vandaag verandert mee (documentdatum)', (fail) => { const r = Core.generate(M, { dataproduct: 'Taxatierapport', caseId: 'X', vbos: [], fixed: {} }, { today: new Date(Date.UTC(2027, 2, 1)) }); if (!r.xml.includes('2027-03-01')) fail('documentdatum volgt de dag van genereren niet'); });
T('Schrikkeldag / jaarwissel als waardepeildatum', (fail) => { for (const d of ['29-02-2024', '31-12-2025', '01-01-2026']) { const r = gen({ vbos: [V(0)], vboUses: ['Residential'], fixed: { waardepeildatum: d } }); if (!r.ok || r.validation.errors.length) fail(`${d}: ${(r.errors.concat(r.validation ? r.validation.errors : []))[0]}`); if (!r.xml.includes(d.split('-').reverse().join('-'))) fail(`${d} niet in XBRL`); } });
T('Datumnotaties (2026-11-02, 2-11-2026, 02/11/2026, Excel-getal)', (fail) => { for (const d of ['2026-11-02', '2-11-2026', '02/11/2026', 46328]) { const r = gen({ vbos: [V(0)], vboUses: ['Residential'], fixed: { waardepeildatum: d } }); const X = parseX(r.xml); const vd = get(X, 'ValuationDate').filter(f => !hasAxis(X, f, 'PreviousValuationAxis')).map(f => f.v); if (!vd.includes('2026-11-02')) fail(`${d} → ${vd}`); } });

// =================================================================== uitvoer
let pass = 0, failN = 0;
const bySec = {};
for (const r of results) { const s = bySec[r.section] = bySec[r.section] || { pass: 0, fail: [] }; if (r.errs.length) { s.fail.push(r); failN++; } else { s.pass++; pass++; } }
for (const [s, o] of Object.entries(bySec)) {
  console.log(`\n${s}: ${o.pass} passed, ${o.fail.length} failed`);
  const grouped = {};
  for (const f of o.fail) for (const e of [...new Set(f.errs)]) { const k = e.replace(/\d{5,}/g, 'N').replace(/\d+/g, 'n'); (grouped[k] = grouped[k] || []).push([f.name, e]); }
  for (const list of Object.values(grouped)) console.log(`  ✗ (${list.length}×) ${list[0][1].slice(0, 230)}   ← ${list[0][0]}`);
}
console.log(`\nTOTAL ${pass + failN}: ${pass} passed, ${failN} failed`);
process.exitCode = failN ? 1 : 0;
