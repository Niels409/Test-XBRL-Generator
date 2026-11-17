/* Local test without Azure: node test-local.js <tests.xlsx> [output-folder] */
'use strict';
const fs = require('fs');
const path = require('path');
const { generateFromXlsx } = require('./lib.js');

(async () => {
  const input = process.argv[2] || 'template.xlsx';
  const outDir = process.argv[3] || 'output';
  const res = await generateFromXlsx(fs.readFileSync(input));
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of res.files) {
    fs.writeFileSync(path.join(outDir, f.name), f.xml);
    console.log(`${f.valid ? 'OK ' : 'DEV'} ${f.name}  processId=${f.processId}${f.deviations.length ? '  ' + f.deviations[0] : ''}`);
  }
  for (const f of res.failed) console.log(`ERR ${f.test}: ${f.errors.join('; ')}`);
  if (res.report) fs.writeFileSync(path.join(outDir, res.report.name), Buffer.from(res.report.contentBase64, 'base64'));
  console.log(res.summary);
})().catch(e => { console.error(e.message || e); process.exit(1); });
