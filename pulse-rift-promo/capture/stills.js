const { chromium } = require('playwright');
const { start } = require('./server');
const fs = require('fs');
const path = require('path');

(async () => {
  const server = await start(8128);
  const outDir = path.join(__dirname, '..', 'stills');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://127.0.0.1:8128/pulse-rift-promo/render/index.html');
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 }).catch(async e => {
    console.log('not ready:', e.message);
    console.log(await page.evaluate(() => document.body.innerText).catch(() => ''));
  });
  const times = process.argv.slice(2).map(Number);
  const list = times.length ? times : [2, 6, 10, 14, 20, 24, 28, 30, 32.6, 36, 38, 55];
  for (const t of list) {
    await page.evaluate(tt => window.renderAt(tt), t);
    const f = path.join(outDir, `t${t.toFixed(2).padStart(5, '0')}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
    console.log('wrote', f);
  }
  await browser.close(); server.close();
})();
