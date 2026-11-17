/* End-to-end test of the offline app in headless Chromium.
 * npm install --no-save playwright && npx playwright install chromium && node test/ui.js
 * (CHROMIUM_PATH=/path/to/chrome to use an existing Chromium)
 */
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const APP = 'file://' + path.join(__dirname, '../dist/Test XBRL Generator.html').replace(/ /g, '%20');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, d) => results.push([!!c, n, d || '']);
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ acceptDownloads: true, viewport: { width: 1320, height: 1000 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let dls = []; p.on('download', d => dls.push(d));
  const genDone = async (n) => { await p.waitForFunction(() => !document.getElementById('files').hidden, null, { timeout: 60000 }); await p.waitForTimeout(n * 450 + 1000); };
  await p.goto(APP);
  ok('Title is "Test XBRL Generator"', (await p.title()) === 'Test XBRL Generator', await p.title());
  ok('Version in the footer', /v\d+\.\d+\.\d+/.test(await p.textContent('#ver')));

  // 1. template -> generate
  await p.click('#btnTemplate'); await p.waitForTimeout(800);
  ok('Template download', dls.length === 1 && dls[0].suggestedFilename() === 'Test XBRL Generator - template.xlsx', dls[0] && dls[0].suggestedFilename());
  const tpl = path.join(OUT, 'template.xlsx'); await dls[0].saveAs(tpl);
  await p.setInputFiles('#file', tpl); await p.waitForSelector('#drop.loaded');
  dls = []; await p.click('#btnGen'); await genDone(5);
  ok('Template examples: 5 XBRL downloads', dls.length === 5, dls.map(d => d.suggestedFilename()).join(', '));
  for (const d of dls) await d.saveAs(path.join(OUT, d.suggestedFilename()));
  ok('All 5 as expected', await p.locator('#fileList .expok').count() === 5);
  ok('Steps 2 and 3 back to the start', !(await p.locator('#drop').evaluate(e => e.classList.contains('loaded'))) && await p.isDisabled('#btnGen'));

  // 2. download one file again = identical
  const first = fs.readFileSync(path.join(OUT, dls[0].suggestedFilename()));
  dls = []; await p.locator('#fileList li.clickable').first().click(); await p.waitForTimeout(600);
  ok('Download again gives the same file', dls[0] && fs.readFileSync(await dls[0].path()).equals(first));

  // 3. test report
  dls = []; await p.click('#btnReport'); await p.waitForTimeout(800);
  ok('Test report download (.xlsx)', dls[0] && /^Test report .*\.xlsx$/.test(dls[0].suggestedFilename()) && fs.readFileSync(await dls[0].path()).slice(0, 2).toString() === 'PK', dls[0] && dls[0].suggestedFilename());

  // 4. scenario library: negative set
  const n = await p.locator('#setSel option').count();
  ok('Scenario library has sets', n >= 8, String(n));
  const neg = await p.locator('#setSel option').evaluateAll(o => o.findIndex(x => /Negative/.test(x.textContent)));
  await p.selectOption('#setSel', { index: neg });
  dls = []; await p.click('#btnSetXlsx'); await p.waitForTimeout(500);
  ok('Scenario set as Excel', dls.length === 1 && /\.xlsx$/.test(dls[0].suggestedFilename()));
  await p.click('#btnSetLoad'); await p.waitForSelector('#drop.loaded');
  dls = []; await p.click('#btnGen'); await genDone(19);
  ok('Negative set: 19 files, 1 refused', dls.length === 19 && await p.locator('#fileList .badmsg').count() === 1, String(dls.length));
  ok('Negative set: every outcome as expected', await p.locator('#fileList .expbad').count() === 0 && await p.locator('#fileList .expok').count() === 20);

  // 5. invalid file
  const bad = path.join(OUT, 'not-excel.xlsx'); fs.writeFileSync(bad, 'not an excel file');
  await p.setInputFiles('#file', bad); await p.waitForTimeout(600);
  ok('Invalid file: clear message, Generate disabled', (await p.textContent('#loadErr')).length > 10 && await p.isDisabled('#btnGen'), await p.textContent('#loadErr'));

  // 6. narrow screens
  for (const w of [390, 768]) { await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(150); const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(`No horizontal scrolling at ${w}px`, sw <= w + 1, String(sw)); }
  ok('No JavaScript errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  for (const [c, nm, d] of results) console.log(`${c ? 'PASS' : 'FAIL'}  ${nm}${d ? ' — ' + d : ''}`);
  const failed = results.filter(r => !r[0]).length;
  console.log(`\n${results.length} checks: ${results.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
