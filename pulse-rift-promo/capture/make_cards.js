const { chromium } = require('playwright');
const { start } = require('./server');
const fs = require('fs');
const path = require('path');

const IDS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'card01', 'card02', 'card03', 'card04', 'cap1', 'cap2', 'cap3', 'cap4', 'cap5', 'cap6', 'cap7', 'cap8', 'cap9', 'cap10',
  'cap11', 'cap12', 'cap13', 'cap14'
];
const OUT = path.resolve(__dirname, '..', 'cards');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const server = await start(8156);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
  for (const id of IDS) {
    await page.goto('http://127.0.0.1:8156/pulse-rift-promo/capture/cards.html?id=' + id);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
    await page.waitForTimeout(120);
    const isCap = id.startsWith('cap');
    const file = path.join(OUT, id + '.png');
    await page.screenshot({ path: file, omitBackground: isCap, clip: { x: 0, y: 0, width: 2560, height: 1440 } });
    console.log('wrote', file);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
