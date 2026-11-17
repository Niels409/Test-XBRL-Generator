/* Test XBRL Generator — server-side entry point (same generator code as the desktop app).
 * generateFromXlsx(buffer, {maxRows, today, source}) ->
 *   { files: [{ name, xml, valid, deviations, warnings, processId, ... }], failed: [...], report: { name, contentBase64 }, summary }
 */
'use strict';
const Core = require('./core.js');
const Xlsx = require('./xlsx.js');
const models = { VT17: new Core.Model(require('./appdata.json')), VT15: new Core.Model(require('./appdata-vt15.json')) };

async function generateFromXlsx(buffer, opts) {
  opts = opts || {};
  const rows = await Xlsx.readFirstSheet(buffer);
  const scenarios = Xlsx.rowsToScenarios(rows);
  if (opts.maxRows && scenarios.length > opts.maxRows) return { tooMany: scenarios.length };
  if (!scenarios.length) throw new Error('No tests found. Fill in at least the Data product.');
  const { items, report } = Core.runBatch(models, scenarios, { today: opts.today || Core.todayUTC(), source: opts.source || '' });
  const files = [], failed = [];
  for (const { sc, r, name, status } of items) {
    if (status === 'failed') { failed.push({ test: sc.id, row: sc.row, errors: r.errors }); continue; }
    files.push({
      name, taxonomy: r.tax, xml: r.xml, row: sc.row, dataProduct: r.ep, caseId: sc.caseId, processId: r.procesId,
      valid: status === 'ok', deviations: r.validation.errors, warnings: (r.warnings || []).concat(r.validation.warnings || []),
      expected: sc.verwacht || '',
    });
  }
  const reportBlob = Xlsx.writeXlsx(report.sheets);
  const valid = files.filter(f => f.valid).length;
  return {
    generator: `${Core.APP_NAME} v${Core.VERSION}`,
    files, failed,
    report: { name: `Test report ${report.stamp.replace(':', '')}.xlsx`, contentBase64: Buffer.from(await reportBlob.arrayBuffer()).toString('base64') },
    summary: `${files.length} XBRL file(s) generated` +
      (valid ? `, ${valid} valid against their taxonomy` : '') +
      (files.length - valid ? `, ${files.length - valid} with taxonomy deviations` : '') +
      (failed.length ? `, not generated: ${failed.map(f => f.test).join(', ')}` : '') +
      (report.mismatches ? `, ${report.mismatches} not as expected` : ''),
  };
}

module.exports = { generateFromXlsx, templateBase64: () => require('fs').readFileSync(require('path').join(__dirname, 'template.xlsx')).toString('base64') };
