// End-to-end UI test in real Chrome with the simulated bootloader in place of navigator.serial.
//   bun install && bun ui.mjs http://localhost:8000/ [file ...]
// The served site needs fw/ for the release list (python3 -I tools/pages_releases.py .).
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const [url = 'http://localhost:8000/', ...files] = process.argv.slice(2);
const fake = readFileSync(new URL('./fakebl.mjs', import.meta.url), 'utf8').replace(/^export /m, '');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
page.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.evaluateOnNewDocument(`${fake}
  Object.defineProperty(navigator, 'serial', { value: {
    requestPort: async () => (window.__bl = fakeBootloader({ menuAfter: 1500 })).port, addEventListener() {} } });`);
await page.goto(url);
const snap = () => page.evaluate(() => ({
  status: document.getElementById('status').textContent,
  analysis: [...document.querySelectorAll('#analysis p')].map(p => p.textContent).join(' | '),
  cls: document.getElementById('analysis').className,
  flashDisabled: document.getElementById('flash').disabled,
}));
try {
  await page.waitForSelector('#release option', { timeout: 5000 });
  await page.waitForSelector('#analysis:not([hidden])', { timeout: 10000 });
  console.log('releases:', await page.$$eval('#release option', os => os.map(o => o.textContent)));
  console.log('selected:', await snap());
} catch { console.log('no release list (fw/ missing?)'); }
if (files.length) {
  await page.click('input[value=file]');
  for (const f of files) {
    await (await page.$('#file')).uploadFile(f);
    await new Promise(r => setTimeout(r, 800));
    console.log(f.split('/').pop() + ':', await snap());
  }
}
if (!(await snap()).flashDisabled) {
  await page.click('#flash');
  await page.waitForFunction(() => /Done|Error|Готово|Ошибка/.test(document.getElementById('status').textContent), { timeout: 60000 });
  const r = await page.evaluate(() => ({ status: document.getElementById('status').textContent, boot: document.getElementById('boot').textContent }));
  console.log('flash:', r.status, '\n' + r.boot);
}
await browser.close();
