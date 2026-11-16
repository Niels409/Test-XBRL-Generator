/* End-to-end test of the offline app in headless Chromium (npm i playwright; npx playwright install chromium) */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ acceptDownloads: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const dls = []; p.on('download', d => dls.push(d));
  await p.goto('file://' + path.join(__dirname, '../dist/VT Test Generator.html'));
  await p.click('#btnTemplate'); await p.waitForTimeout(800);
  const tpl = path.join(out, 'template.xlsx'); await dls[0].saveAs(tpl);
  await p.setInputFiles('#file', tpl); await p.waitForSelector('#drop.loaded');
  await p.click('#btnGen'); await p.waitForTimeout(3000);
  for (const d of dls.slice(1)) await d.saveAs(path.join(out, d.suggestedFilename()));
  console.log('downloaded:', dls.slice(1).map(d => d.suggestedFilename()));
  console.log('files listed:', await p.locator('#fileList li').count(), '| page errors:', errs);
  await b.close();
})();
