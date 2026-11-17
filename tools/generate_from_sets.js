/* Generates every scenario of the scenario sets (Excel files) as XBRL files.
 * node tools/generate_from_sets.js <dir with set .xlsx files> <out dir>
 * Writes <out>/<set>/<file>.xbrl and <out>/expected.json: { "<set>/<file>": { expected, own, test, description } }
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const Core = require(path.join(ROOT, 'app/core.js'));
const X = require(path.join(ROOT, 'app/xlsx.js'));
const M = {
  VT17: new Core.Model(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/appdata-vt17.json'), 'utf8'))),
  VT15: new Core.Model(JSON.parse(fs.readFileSync(path.join(ROOT, 'data/appdata-vt15.json'), 'utf8'))),
};
const [setsDir, outDir] = process.argv.slice(2);
if (!setsDir || !outDir) { console.error('usage: node tools/generate_from_sets.js <sets dir> <out dir>'); process.exit(2); }
const norm = (t) => { t = String(t || '').toLowerCase(); return /^not generated/.test(t) ? 'failed' : /^no deviation/.test(t) ? 'ok' : /^deviation/.test(t) ? 'deviations' : ''; };
(async () => {
  const expected = {};
  let n = 0;
  for (const f of fs.readdirSync(setsDir).filter(f => f.endsWith('.xlsx')).sort()) {
    const set = f.replace(/\.xlsx$/, '');
    const scenarios = X.rowsToScenarios(await X.readFirstSheet(fs.readFileSync(path.join(setsDir, f))));
    const { items } = Core.runBatch(M, scenarios, { source: f });
    fs.mkdirSync(path.join(outDir, set), { recursive: true });
    for (const it of items) {
      const key = set + '/' + (it.name || it.sc.id + '.not-generated');
      expected[key] = { test: it.sc.id, description: it.sc.omschrijving || '', expected: norm(it.sc.verwacht), own: it.status,
        ownDeviations: it.status === 'failed' ? it.r.errors : it.r.validation.errors };
      if (it.name) { fs.writeFileSync(path.join(outDir, set, it.name), it.r.xml); n++; }
    }
  }
  fs.writeFileSync(path.join(outDir, 'expected.json'), JSON.stringify(expected, null, 1));
  console.log(`${n} XBRL files written to ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
