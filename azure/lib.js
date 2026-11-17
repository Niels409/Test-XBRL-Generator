/* VT17/VT15 test generator — server-side entry point (same generator code as the desktop app).
 * generateFromXlsx(buffer) -> { files: [{ name, xml, valid, deviations, warnings, processId }], failed: [...], summary }
 */
'use strict';
const Core = require('./core.js');
const Xlsx = require('./xlsx.js');
const models = { VT17: new Core.Model(require('./appdata.json')), VT15: new Core.Model(require('./appdata-vt15.json')) };

const safe = (s) => String(s || '').replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

async function generateFromXlsx(buffer, opts) {
  opts = opts || {};
  const rows = await Xlsx.readFirstSheet(buffer);
  const scenarios = Xlsx.rowsToScenarios(rows);
  if (opts && opts.maxRows && scenarios.length > opts.maxRows) return { tooMany: scenarios.length };
  if (!scenarios.length) throw new Error('No tests found. Fill in at least the Data product.');
  const today = opts.today || Core.todayUTC();
  const files = [], failed = [];
  for (const sc of scenarios) {
    let r;
    try { r = Core.generate(models, sc, { today }); }
    catch (e) { r = { ok: false, errors: ['Unexpected error: ' + (e.message || e)] }; }
    if (!r.ok || !r.xml) { failed.push({ test: sc.id, row: sc.row, errors: r.errors }); continue; }
    files.push({
      name: [safe(sc.id), r.tax === 'VT15' ? 'VT15' : '', safe(r.ep)].filter(Boolean).join('_') + '.xbrl',
      taxonomy: r.tax,
      xml: r.xml,
      row: sc.row,
      dataProduct: r.ep,
      caseId: sc.caseId,
      processId: r.procesId,
      valid: r.validation.errors.length === 0,
      deviations: r.validation.errors,
      warnings: (r.warnings || []).concat(r.validation.warnings || []),
    });
  }
  const valid = files.filter(f => f.valid).length;
  return {
    files, failed,
    summary: `${files.length} XBRL file(s) generated` +
      (valid ? `, ${valid} valid against their taxonomy` : '') +
      (files.length - valid ? `, ${files.length - valid} with taxonomy deviations` : '') +
      (failed.length ? `, not generated: ${failed.map(f => f.test).join(', ')}` : ''),
  };
}

module.exports = { generateFromXlsx, templateBase64: () => require('fs').readFileSync(require('path').join(__dirname, 'template.xlsx')).toString('base64') };
