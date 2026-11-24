/* Builds the rebuild package (rebuild/) from the reference implementation (app/core.js + data/).
 *
 *   rebuild/model/vt17-taxatierapport.json, vt15-...   the part of data/appdata-*.json that the Taxatierapport generator and
 *                                                     the input checks need (same format; no business rules, no other data
 *                                                     products, only the fields the generator uses)
 *   rebuild/template.xlsx                             the Excel template (Taxatierapport only)
 *   rebuild/acceptance/scenarios.xlsx                 the acceptance scenarios (source: tools/rebuild_scenarios.json)
 *   rebuild/acceptance/expected/<test>.json           what a rebuilt generator must produce for each scenario
 *   rebuild/acceptance/reference/<file>.xbrl          reference output of some scenarios (generated values will differ)
 *
 * node tools/export_rebuild.js [--files <dir>]   CI runs it and fails when rebuild/ is not up to date. --files also writes the
 *                                               generated file of every row to <dir> (for tools/check_acceptance.py).
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'rebuild');
const Core = require(path.join(ROOT, 'app/core.js'));
const X = require(path.join(ROOT, 'app/xlsx.js'));
const TODAY = new Date(Date.UTC(2026, 11, 1)); // the acceptance run uses today = 2026-12-01
const SEEDS = 8;                               // runs per scenario: values that differ between runs are generated ("*")
const EP = 'Taxatierapport';
const DIM_VBO = 'frc-vt-dim:BAGVBOIDAxis';
const FILES = process.argv.includes('--files') ? process.argv[process.argv.indexOf('--files') + 1] : null;
if (FILES) fs.mkdirSync(FILES, { recursive: true });

// ---------------------------------------------------------------- 1. slim models
const FIELD_KEYS = ['Opdrachtinformatie › Referentie', 'Opdrachtgever › Referentie', 'Opdrachtgever › Referentie toegekend door',
  'Opdrachtgever › Omschrijving van de referentie', 'Opdrachtnemer › Referentie', 'Opdrachtnemer › Referentie toegekend door',
  'Informatie taxatierapport › Scope taxatie', 'Hoofdadres › Postcode', 'Hoofdadres › Huisnummertoevoeging', 'Hoofdadres › Straatnaam',
  'Hoofdadres › Huisnummer', 'Waarde › Getaxeerde waarde', 'Waarde › Waardepeildatum', 'Waarde › Waarde begrip',
  'Taxatieorganisatie › KvK-nummer', 'Opdrachtnemer › KvK-nummer'];
const KPI = ["KPI's van het taxatieresultaat commercieel", "KPI's van het taxatieresultaat residentieel"];
function fieldKeys(m) {
  const want = new Set(FIELD_KEYS);
  const ct = Core.defaultCaseTarget(m, EP); if (ct) want.add(ct);
  const sk = m.keyOf(EP, 'frc-vt-i:ScopeValuation'); if (sk) want.add(sk);
  for (const sec of KPI) { const k = m.keyOf(EP, 'frc-vt-i:MarketValueAfterTransferCostRounded', sec); if (k) want.add(k); }
  return want;
}
function slim(app) {
  const m = new Core.Model(app), E = app.eps[EP];
  const want = fieldKeys(m);
  const keys = E.keys.filter(k => want.has(k[0]));
  const roles = {};
  for (const r of E.roles) roles[r] = app.roles[r];
  const used = new Set();
  for (const r of Object.values(roles)) { r.i.forEach(c => used.add(c)); r.x.forEach(a => used.add(a.a)); }
  for (const f of E.base.facts.concat(...Object.values(E.ext || {}).map(x => x.facts))) { used.add(f.c); f.d.forEach(x => used.add(x[0])); }
  keys.forEach(k => used.add(k[2]));
  const concepts = {};
  for (const q of Object.keys(app.concepts).sort()) if (used.has(q)) concepts[q] = app.concepts[q];
  return { tax: app.tax, version: app.version, ns: app.ns, concepts, roles,
    eps: { [EP]: { href: E.href, roles: E.roles, keys, base: E.base, ext: E.ext || {}, req: [], cond: [] } } };
}

// ---------------------------------------------------------------- 2. check ids (see rebuild/FUNCTIONAL_SPEC.md, "Input checks")
const INPUT_CHECKS = [
  ['E01', /^Unknown taxonomy "/], ['E02', /^Unknown data product "/], ['E03', /^Agricultural is only available for VT17/],
  ['W01', /^VBO ID \d+: ".*" is not possible for a VBO ID/], ['W02', /^VBO ID .+ appears more than once/],
  ['W03', /^VBO ID ".*" is not in the 16-digit BAG format/], ['W04', /^Use ".*" not recognised/],
  ['W05', /^Use VBO \d+: "Mixed use" is a report-level choice/], ['W06', /^Use VBO \d+ ".*" not recognised/],
  ['W07', /^Mixed use with only one VBO/], ['W08', /^Use \(report\) is .+ but the VBOs are/],
  ['W09', /^Valuation date .+ is in the future/], ['W10', /^Valuation date ".*" is not a valid date/],
  ['W11', /^Process ID ".*" \(from VBO ID 1\) is not 12 digits/], ['W12', /^Column ".*" does not apply/],
  ['W13', /: ".*" is not a valid date; value kept as is/], ['W14', /is not a valid code \(allowed/],
  ['W15', /is not a valid number; value kept as is/], ['W16', /is not a whole number\.$/],
  ['W17', /^Market value VBO \d+ ".*" is not a number/], ['W18', /^Market value VBO \d+ is negative/],
  ['W19', /^Case \/ Reference ID is not written/],
];
function inputCheckIds(msgs) {
  return msgs.map(m => {
    const hit = INPUT_CHECKS.find(([, re]) => re.test(m));
    if (!hit) throw new Error('No input check id for message: ' + m);
    return hit[0];
  }).sort();
}
const FACETS = [[/is not a valid xs:date/, 'date'], [/is not a valid year/, 'gYear'], [/is not a valid duration/, 'duration'], [/is not a whole number/, 'integer'],
  [/is not a valid number/, 'number'], [/is not an allowed code/, 'enum'], [/is not a boolean/, 'boolean'], [/is not an allowed value|contains a value that is not allowed/, 'enumeration'],
  [/is below the minimum/, 'minInclusive'], [/is above the maximum/, 'maxInclusive'], [/text longer than/, 'maxLength'], [/text shorter than/, 'minLength'],
  [/does not match the pattern/, 'pattern']];
function deviations(v, facts) {
  const q = (local) => { const hit = [...new Set(facts.filter(f => f.c.split(':')[1] === local).map(f => f.c))]; return hit.length === 1 ? hit[0] : local; };
  const out = [];
  for (const e of v.errors) {
    let m;
    if ((m = /^(\S+): concept does not exist/.exec(e))) out.push({ check: 'F01', concept: m[1] });
    else if ((m = /\((\w+)\): dimension combination not allowed/.exec(e))) out.push({ check: 'F02', concept: q(m[1]) });
    else if ((m = /\((\w+)\): (numeric fact without a unit|unit on a non-numeric fact|unit .* does not fit a monetary amount)/.exec(e))) out.push({ check: 'F03', concept: q(m[1]) });
    else if ((m = /\((\w+)\): empty value for typed dimension/.exec(e))) out.push({ check: 'F06', concept: q(m[1]) });
    else if ((m = /^(\w+): (appears twice with different values|duplicate fact)/.exec(e))) out.push({ check: 'F07', concept: q(m[1]) });
    else if ((m = /\((\w+)\): (.*)\.$/.exec(e))) {
      const facet = (FACETS.find(([re]) => re.test(m[2])) || [])[1];
      if (!facet) throw new Error('Unknown value check: ' + e);
      out.push({ check: 'F04', concept: q(m[1]), facet });
    } else throw new Error('Unknown deviation: ' + e);
  }
  for (const w of v.warnings) {
    const m = /\((\w+)\): empty text value/.exec(w);
    if (!m) throw new Error('Unknown deviation warning: ' + w);
    out.push({ check: 'F05', concept: q(m[1]) });
  }
  return out.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
}

// ---------------------------------------------------------------- 3. fact lines with "*" for generated values
// Realistic filler: any valid value is accepted unless the fact holds a value from the Excel row (see FUNCTIONAL_SPEC.md)
const FREE = new Set(['FirstName', 'FamilyName', 'Prefix', 'Initials', 'JobTitle', 'OrganisationName', 'LegalEntityName', 'ShortName',
  'ChamberOfCommerceRegistrationNumber', 'EmailAddressFull', 'TelephoneNumber', 'StreetNameNL', 'StreetNameNLFull', 'HouseNumberNL',
  'HouseNumberAddition', 'PostalCodeNL', 'PlaceOfResidenceNL', 'DescriptionLocationNL', 'LandRegister', 'LandRegisterCode', 'LandRegisterSection',
  'LandRegisterNumber', 'LandRegisterReference', 'OwnerAccordingToLandRegister', 'FileName', 'MimeType', 'SoftwareUsed', 'SoftwareUsedReference',
  'Reference', 'BusinessNames', 'NameComplex', 'PropertyName', 'UnitNameDescriptive', 'KVKnumber', 'NameValuationReport', 'ValuationAmount',
  'UsableFloorArea', 'MarketRent', 'BAGPANDID', 'BAGOTHERID']);
function mappedFields(m) {
  const out = [];
  for (const k of fieldKeys(m)) {
    const fr = m.resolveField(EP, k);
    if (!fr.error) out.push({ key: k, role: m.APP.roles[fr.role], c: fr.c, vbo1: k.startsWith('Hoofdadres ›') });
  }
  return out;
}
const fitsRole = (f, role) => role.x.length === f.d.length && role.x.every(a => {
  const x = f.d.find(y => y[0] === a.a);
  return x && (a.t ? x[1] === 't' : (x[1] === 'e' && a.m.indexOf(x[2]) >= 0));
});
const dimsStr = (d) => d.slice().sort((a, b) => a[0] < b[0] ? -1 : 1).map(x => x[0] + '=' + x[2]).join(';');
function factLines(m, runs) {
  const base = runs[0].facts, mapped = mappedFields(m);
  for (const r of runs) {
    if (r.facts.length !== base.length || r.facts.some((f, i) => f.c !== base[i].c || f.d.length !== base[i].d.length)) throw new Error('fact order differs between runs');
  }
  const vbo1 = runs[0].vbos[0];
  const lines = base.map((f, i) => {
    const all = runs.map(r => r.facts[i]);
    const d = f.d.slice().sort((a, b) => a[0] < b[0] ? -1 : 1).map(x => [x[0], all.every(g => (g.d.find(y => y[0] === x[0]) || [])[2] === x[2]) ? x[2] : '*']);
    const fromExcel = mapped.some(mf => mf.c === f.c && fitsRole(f, mf.role) && (!mf.vbo1 || (f.d.find(x => x[0] === DIM_VBO) || [])[2] === vbo1));
    const same = all.every(g => String(g.v) === String(f.v));
    const v = !same || (FREE.has(f.c.split(':')[1]) && !fromExcel) ? '*' : String(f.v);
    if (/[|\n]/.test(v)) throw new Error('value with | or newline: ' + v);
    return [f.c, d.map(x => x.join('=')).join(';'), (f.u || []).join('*'), v].join('|');
  });
  return lines.sort();
}

// ---------------------------------------------------------------- run
function main() {
  const full = { VT17: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/appdata-vt17.json'), 'utf8')), VT15: JSON.parse(fs.readFileSync(path.join(ROOT, 'data/appdata-vt15.json'), 'utf8')) };
  const slimApp = { VT17: slim(full.VT17), VT15: slim(full.VT15) };
  fs.mkdirSync(path.join(OUT, 'model'), { recursive: true });
  for (const t of ['VT17', 'VT15']) fs.writeFileSync(path.join(OUT, 'model', `${t.toLowerCase()}-taxatierapport.json`), JSON.stringify(slimApp[t], null, 0) + '\n');
  const models = { VT17: new Core.Model(slimApp.VT17), VT15: new Core.Model(slimApp.VT15) };
  const fullModels = { VT17: new Core.Model(full.VT17), VT15: new Core.Model(full.VT15) };

  // Excel files (build_template.py with the slim VT17 model: the data product list holds only the Taxatierapport)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebuild-'));
  const slimPath = path.join(tmp, 'slim-vt17.json');
  fs.writeFileSync(slimPath, JSON.stringify(slimApp.VT17));
  const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'rebuild_scenarios.json'), 'utf8'));
  const writeXlsx = (rows, title, out) => {
    const rj = path.join(tmp, 'rows.json');
    fs.writeFileSync(rj, JSON.stringify({ title, rows }));
    cp.execFileSync('python3', [path.join(ROOT, 'build/build_template.py'), slimPath, out, rj], { stdio: 'pipe' });
  };
  fs.mkdirSync(path.join(OUT, 'acceptance', 'expected'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'acceptance', 'reference'), { recursive: true });
  const examples = set.rows.filter(r => ['ACC17-01', 'ACC17-04', 'ACC15-01'].includes(r.case)).map(r => Object.assign({}, r, { case: r.case.replace('ACC', 'CASE-'), expected: 'No deviations' }));
  writeXlsx(examples, 'Test XBRL Generator · Taxatierapport', path.join(OUT, 'template.xlsx'));

  const scenariosOf = async (file) => X.rowsToScenarios(await X.readFirstSheet(fs.readFileSync(file)));
  const accXlsx = path.join(OUT, 'acceptance', 'scenarios.xlsx');
  const LABEL = { ok: 'No deviations', deviations: 'Deviations', failed: 'Not generated' };
  return (async () => {
    writeXlsx(set.rows, 'Acceptance scenarios', accXlsx);
    let scenarios = await scenariosOf(accXlsx);
    const first = scenarios.map(sc => statusOf(Core.generate(models, sc, { today: TODAY })));
    writeXlsx(set.rows.map((r, i) => Object.assign({}, r, { expected: LABEL[first[i]] })), 'Acceptance scenarios', accXlsx);
    scenarios = await scenariosOf(accXlsx);
    const summary = [];
    for (const sc of scenarios) {
      const runs = [];
      for (let k = 0; k < SEEDS; k++) runs.push(Core.generate(models, Object.assign({}, sc, { id: k ? sc.id + '~' + k : sc.id }), { today: TODAY }));
      const r = runs[0], status = statusOf(r);
      // the slim model must give exactly what the full model gives (without the business rules of the full model)
      const rf = Core.generate(fullModels, sc, { today: TODAY });
      const strip = (x, id) => (x.xml || '').split(String(id)).join('<process id>');
      if (r.ok !== rf.ok || (r.ok && strip(r, r.procesId) !== strip(rf, rf.procesId)) || JSON.stringify(r.warnings) !== JSON.stringify(rf.warnings) || JSON.stringify(r.errors) !== JSON.stringify(rf.errors)) {
        if (!(sc.dataproduct !== EP && !r.ok)) throw new Error(`${sc.id}: the slim model gives another result than the full model`);
      }
      const checks = inputCheckIds(r.ok ? r.warnings : r.errors.concat(r.warnings));
      for (const x of runs) if (JSON.stringify(inputCheckIds(x.ok ? x.warnings : x.errors.concat(x.warnings))) !== JSON.stringify(checks)) throw new Error(sc.id + ': input checks differ between runs');
      const exp = { test: sc.id, description: sc.omschrijving, row: sc.row, taxonomy: sc.taxonomy, status, inputChecks: checks };
      if (r.ok) {
        const m = models[r.tax];
        Object.assign(exp, { file: Core.fileNameFor(sc, r), contextDate: r.peildatum, entityScheme: m.APP.eps[EP].base.entity[0],
          deviations: deviations(r.validation, r.facts), facts: factLines(m, runs) });
        if (['ACC17-01', 'ACC17-04', 'ACC17-06', 'ACC15-01', 'ACC15-03'].includes(sc.id)) fs.writeFileSync(path.join(OUT, 'acceptance', 'reference', exp.file), r.xml);
      }
      fs.writeFileSync(path.join(OUT, 'acceptance', 'expected', sc.id + '.json'), JSON.stringify(exp, null, 1) + '\n');
      if (FILES && r.ok) fs.writeFileSync(path.join(FILES, exp.file), r.xml);
      summary.push(`${sc.id.padEnd(9)} ${status.padEnd(10)} ${checks.join(',') || '-'}  ${(exp.deviations || []).map(d => d.check + ' ' + d.concept.split(':')[1] + (d.facet ? ' ' + d.facet : '')).join(', ')}  ${exp.facts ? exp.facts.length + ' facts, ' + exp.facts.filter(l => l.endsWith('|*') || l.includes('=*')).length + ' with generated values' : ''}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(summary.join('\n'));
    console.log(`rebuild/: 2 models, template, ${scenarios.length} acceptance scenarios`);
  })();
}
function statusOf(r) { return !r.ok || !r.xml ? 'failed' : r.validation.errors.length ? 'deviations' : 'ok'; }

main().catch(e => { console.error(e); process.exit(1); });
