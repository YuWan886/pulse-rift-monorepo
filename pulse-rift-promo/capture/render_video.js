/* Segmented offline renderer: Playwright frames -> ffmpeg -> concat */
const { chromium } = require('playwright');
const { start } = require('./server');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { once } = require('events');

const W = parseInt(process.env.W || '1920', 10);
const H = parseInt(process.env.H || '1080', 10);
const FPS = parseInt(process.env.FPS || '60', 10);
const SEG_SEC = parseFloat(process.env.SEG_SEC || '8');
const DURATION = 96;
const FORCE = process.env.FORCE === '1';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const OUTDIR = path.resolve(__dirname, '..', 'out', `segments_${W}x${H}_${FPS}`);
const ROOT = path.resolve(__dirname, '..', 'out');
fs.mkdirSync(OUTDIR, { recursive: true });

const segCount = Math.ceil(DURATION / SEG_SEC);
const segPath = (i) => path.join(OUTDIR, `seg_${String(i).padStart(2, '0')}.mp4`);

async function renderSegment(page, i) {
  const startT = i * SEG_SEC;
  const endT = Math.min(DURATION, startT + SEG_SEC);
  const frames = Math.round((endT - startT) * FPS);
  const out = segPath(i);
  const tmp = out + '.tmp.mp4';
  if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 10000) {
    console.log(`skip segment ${i} (exists)`);
    return { skipped: true };
  }
  console.log(`segment ${i}: ${startT}s → ${endT}s (${frames} frames)`);
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-an',
    '-vf', 'scale=in_range=full:out_range=tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '5.2',
    '-g', String(FPS * 2), '-keyint_min', String(FPS), '-sc_threshold', '0',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart',
    tmp
  ];
  const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'inherit'] });
  const done = new Promise((res, rej) => {
    ff.on('close', code => code === 0 ? res() : rej(new Error('ffmpeg exit ' + code)));
    ff.on('error', rej);
  });
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = startT + f / FPS;
    await page.evaluate(tt => window.renderAt(tt), t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (f % (FPS * 2) === 0 && f > 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${i}: ${f}/${frames}  ${(f / el).toFixed(1)} fps`);
    }
  }
  ff.stdin.end();
  await done;
  fs.renameSync(tmp, out);
  const size = (fs.statSync(out).size / 1e6).toFixed(1);
  console.log(`  done ${i}: ${size} MB in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return { size };
}

(async () => {
  const server = await start(8137);
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR:', e.stack));
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  await page.goto(`http://127.0.0.1:8137/pulse-rift-promo/render/index.html?w=${W}&h=${H}`);
  await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
  console.log(`renderer ready ${W}x${H} @ ${FPS}fps`);

  const indices = ONLY || Array.from({ length: segCount }, (_, i) => i);
  for (const i of indices) await renderSegment(page, i);

  // write concat list
  const listPath = path.join(OUTDIR, 'concat.txt');
  const list = Array.from({ length: segCount }, (_, i) => `file '${segPath(i).replace(/\\/g, '/')}'`).join('\n');
  fs.writeFileSync(listPath, list + '\n');
  console.log('all segments rendered. concat list:', listPath);
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
