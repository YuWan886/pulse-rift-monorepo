const { chromium } = require('playwright');
const { start } = require('./server');
(async () => {
  const server = await start(8127);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('PAGE:', m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto('http://127.0.0.1:8127/pulse-rift-promo/render/audio.html?raw=1&float=1');
  await page.waitForFunction(() => window.__audioDone, null, { timeout: 600000 });
  const info = await page.evaluate(() => window.__audioDone);
  console.log(JSON.stringify(info));
  await browser.close(); server.close();
  if (!info.ok) process.exit(1);
})();
