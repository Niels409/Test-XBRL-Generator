/* Generates every scenario of the scenario sets (Excel files) as XBRL files, plus the official examples and the mutation corpus.
 * node tools/generate_from_sets.js <dir with set .xlsx files> <out dir> [--no-mutants]
 * Writes <out>/<set>/<file>.xbrl, <out>/baseline/<official examples>.xbrl, <out>/mutants/<taxonomy>/<assertion>.xbrl and
 * <out>/expected.json: { "<path>": { test, description, expected, own, ownDeviations, ownAssertions, target? } }
 * ownAssertions are the assertions (business rules) that the built-in check reports; the Arelle job compares them with Arelle's.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'app/core.js'));
const X = require(path.join(ROOT, 'app/xlsx.js'));
const { makeMutants, makeControls } = require('./mutants.js');
const M = {
  VT17: new Core.Model(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/appdata-vt17.json'), 'utf8'))),
  VT15: new Core.Model(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/appdata-vt15.json'), 'utf8'))),
};
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const withMutants = !process.argv.includes('--no-mutants');
const [setsDir, outDir] = args;
if (!setsDir || !outDir) { console.error('usage: node tools/generate_from_sets.js <sets dir> <out dir> [--no-mutants]'); process.exit(2); }
const norm = (t) => { t = String(t || '').toLowerCase(); return /^not generated/.test(t) ? 'failed' : /^no deviation/.test(t) ? 'ok' : /^deviation/.test(t) ? 'deviations' : ''; };
const write = (rel, xml) => { fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true }); fs.writeFileSync(path.join(outDir, rel), xml); };
(async () => {
  const expected = {}, bases = [];
  let n = 0;
  for (const f of fs.readdirSync(setsDir).filter(f => f.endsWith('.xlsx')).sort()) {
    const set = f.replace(/\.xlsx$/, '');
    const scenarios = X.rowsToScenarios(await X.readFirstSheet(fs.readFileSync(path.join(setsDir, f))));
    const { items } = Core.runBatch(M, scenarios, { source: f });
    for (const it of items) {
      const key = set + '/' + (it.name || it.sc.id + '.not-generated');
      const dev = it.status === 'failed' ? it.r.errors : it.r.validation.errors;
      expected[key] = { test: it.sc.id, description: it.sc.omschrijving || '', expected: norm(it.sc.verwacht), own: it.status, ownDeviations: dev,
        ownAssertions: it.status === 'failed' ? [] : Core.assertionIds(dev) };
      if (it.name) { write(key, it.r.xml); n++; }
      if (it.status === 'ok' && !bases.some(b => b.tax === it.r.tax && b.id === it.sc.id && b.r.ep === it.r.ep)) bases.push({ tax: it.r.tax, id: it.sc.id, r: it.r });
    }
  }
  // baseline: the official SBR Nexus example messages as compiled in data/ (shows what Arelle reports on the official examples)
  for (const [tax, m] of Object.entries(M)) for (const ep of Object.keys(m.APP.eps)) {
    const E = m.APP.eps[ep];
    const name = `baseline/${tax}_${ep}_official-example.xbrl`;
    const facts = E.base.facts.map(f => ({ c: f.c, d: f.d, v: f.v, u: f.u || null, dec: f.dec || null }));
    const v = Core.validate(m, ep, facts, new Date(), E.base.entity[1]);
    write(name, Core.serialize(m.APP, ep, facts, E.base.entity, E.base.anchor));
    expected[name] = { test: `${tax} ${ep} official example`, description: 'Official SBR Nexus example message (baseline)', expected: 'ok',
      own: v.errors.length ? 'deviations' : 'ok', ownDeviations: v.errors, ownAssertions: Core.assertionIds(v.errors) };
    if (!v.errors.length) bases.push({ tax, id: 'official-example', r: { ok: true, tax, ep, facts, entity: E.base.entity[1], peildatum: E.base.anchor, validation: v } });
    n++;
  }
  if (withMutants) {
    const { mutants, coverage } = makeMutants(Core, M, bases);
    for (const mu of mutants.concat(makeControls(Core, M, bases))) {
      const key = 'mutants/' + mu.name;
      write(key, mu.xml);
      expected[key] = { test: mu.target ? `MUT ${mu.tax} ${mu.target}` : `CONTROL ${mu.tax}`, description: mu.how, expected: mu.target ? 'deviations' : '',
        own: mu.errors.length ? 'deviations' : 'ok', ownDeviations: mu.errors, ownAssertions: mu.assertions, target: mu.target, mutant: true };
      n++;
    }
    for (const [tax, c] of Object.entries(coverage)) console.log(`${tax}: ${c.mutated} of ${c.rules} assertions have a mutant; no report to break for ${c.notApplicable.length}`);
    fs.writeFileSync(path.join(outDir, 'mutant-coverage.json'), JSON.stringify(coverage, null, 1));
  }
  fs.writeFileSync(path.join(outDir, 'expected.json'), JSON.stringify(expected, null, 1));
  console.log(`${n} XBRL files written to ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
