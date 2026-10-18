/* Real-gameplay capture: headless Chrome + MediaRecorder (canvas + game audio) */
const { chromium } = require('playwright');
const { start } = require('./server');
const fs = require('fs');
const path = require('path');

const W = parseInt(process.env.GW || '1920', 10);
const H = parseInt(process.env.GH || '1080', 10);
const MAX_SEC = parseFloat(process.env.MAX_SEC || '55');
const VBR = parseInt(process.env.VBR || '25000000', 10);
const VCODEC = process.env.VCODEC || 'vp9';
const REQFRAME = process.env.REQFRAME === '1';
const THROTTLE = parseFloat(process.env.THROTTLE || '0');
const VMIME = process.env.VMIME || '';
const OUT = path.resolve(__dirname, '..', 'capture', process.env.OUTNAME || 'gameplay.webm');

function bot() {
  const g = window.PR.game;
  const keys = g.keys;
  let lastShot = -1, lastDash = -1, lastOd = -1;
  const setKeys = (w, a, s, d) => {
    [['KeyW', w], ['KeyA', a], ['KeyS', s], ['KeyD', d]].forEach(([k, on]) => {
      if (on) keys.add(k); else keys.delete(k);
    });
  };
  window.__bot = { shots: 0, dashes: 0, od: 0, perfect: 0 };
  function tick() {
    if (!g.player || g.state !== 'playing') { setKeys(false, false, false, false); return requestAnimationFrame(tick); }
    const b = g.audio.beat();
    let target = null, best = 1e9;
    if (g.boss && !g.boss.dead) target = g.boss;
    else for (const e of g.enemies) {
      if (e.dead) continue;
      const d = (e.x - g.player.x) ** 2 + (e.y - g.player.y) ** 2;
      if (d < best) { best = d; target = e; }
    }
    if (target) { g.mouse.x = target.x; g.mouse.y = target.y - 6; }
    const p = g.player;
    let dx = 0, dy = 0;
    const ang = b * 0.2;
    dx += (640 + Math.cos(ang) * 250) - p.x;
    dy += (420 + Math.sin(ang) * 165) - p.y;
    for (const bu of g.enemyBullets) {
      const rx = p.x - bu.x, ry = p.y - bu.y;
      const d2 = rx * rx + ry * ry;
      if (d2 < 125 * 125) {
        const d = Math.sqrt(d2) + 0.1;
        const w = (125 - d) / 125;
        dx += (rx / d) * w * 320;
        dy += (ry / d) * w * 320;
      }
    }
    if (g.boss) {
      const rx = p.x - g.boss.x, ry = p.y - g.boss.y;
      const d = Math.hypot(rx, ry) + 0.1;
      if (d < 90) { dx += (rx / d) * 400; dy += (ry / d) * 400; }
    }
    const len = Math.hypot(dx, dy) || 1;
    const ax = dx / len, ay = dy / len;
    setKeys(ay < -0.38, ax < -0.38, ay > 0.38, ax > 0.38);
    const nearest = Math.round(b);
    const off = Math.abs(b - nearest);
    if (off < 0.06 && nearest !== lastShot) { lastShot = nearest; g.tryShoot(); window.__bot.shots++; }
    if (nearest !== lastDash && nearest % 8 === 0 && off < 0.05) { lastDash = nearest; g.tryDash(); window.__bot.dashes++; }
    if (nearest !== lastOd && nearest % 4 === 0 && off < 0.05 && g.run.sync >= 99.9 && !g.run.overdrive) {
      lastOd = nearest; g.activateOverdrive(); window.__bot.od++;
    }
    if (g.judgement && g.judgement.quality === 'perfect') window.__bot.perfect++;
    requestAnimationFrame(tick);
  }
  tick();
}

(async () => {
  const server = await start(8143);
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
      '--disable-features=CalculateNativeWinOcclusion']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR', e.stack));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || t.startsWith('UPLOAD')) console.log('CONSOLE', t); });
  await page.goto('http://127.0.0.1:8143/pulse-rift/index.html?debug=1');
  await page.waitForFunction(() => window.PR && window.PR.game, null, { timeout: 30000 });
  if (THROTTLE > 0) {
    await page.evaluate((fps) => {
      const g = PR.game; let last = 0;
      const orig = g.loop;
      g.loop = function (ts) {
        if (ts - last < 1000 / fps - 1.5) return requestAnimationFrame(g.loop);
        last = ts;
        return orig.call(this, ts);
      };
    }, THROTTLE);
  }

  // install recorder + start the run
  const started = await page.evaluate(async ({ W, H, VBR, VCODEC, VMIME, REQFRAME }) => {
    const g = PR.game;
    await g.debugStart(10);
    g.debugSetGod(true);
    for (const [id, n] of [['split', 2], ['echo', 1], ['homing', 1], ['ricochet', 1], ['presto', 1], ['momentum', 1],
      ['quick', 1], ['overflow', 1], ['sense', 1], ['odcore', 1], ['aftershock', 1], ['barrier', 1],
      ['vitality', 1], ['harvest', 1]]) {
      g.debugAddUpgrade(id, n);
    }
    const canvas = document.getElementById('game');
    const ac = g.audio.ctx;
    const dest = ac.createMediaStreamDestination();
    g.audio.limiter.connect(dest);
    const vs = canvas.captureStream(REQFRAME ? 0 : 60);
    if (REQFRAME) {
      const track = vs.getVideoTracks()[0];
      let last = 0;
      const pump = (ts) => { if (ts - last >= 15.5) { try { track.requestFrame(); } catch (e) {} last = ts; } requestAnimationFrame(pump); };
      requestAnimationFrame(pump);
    }
    const stream = new MediaStream([...vs.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mimes = VMIME ? [VMIME, 'video/webm;codecs=vp9,opus', 'video/webm'] : ['video/webm;codecs=' + VCODEC + ',opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = mimes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VBR, audioBitsPerSecond: 192000 });
    window.__chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) window.__chunks.push(e.data); };
    window.__rec = rec;
    window.__recInfo = { mimeType, startBeat: g.audio.beat(), startTime: ac.currentTime, canvas: [canvas.width, canvas.height] };
    rec.start(1000);
    return { ...window.__recInfo, state: g.state };
  }, { W, H, VBR, VCODEC, VMIME, REQFRAME });
  console.log('recording', JSON.stringify(started));
  await page.evaluate(bot);

  const t0 = Date.now();
  let last = null;
  while ((Date.now() - t0) / 1000 < MAX_SEC) {
    await page.waitForTimeout(1000);
    last = await page.evaluate(() => {
      const g = PR.game;
      return {
        state: g.state, beat: +g.audio.beat().toFixed(2), bossHp: g.boss && Math.round(g.boss.hp),
        phase: g.boss && g.boss.phase, sync: g.run && +g.run.sync.toFixed(0), fps: +g.fps.toFixed(0),
        combo: g.run && g.run.combo, bot: window.__bot
      };
    });
    if (last.state !== 'playing' && last.state !== 'interlude') break;
  }
  console.log('ending', JSON.stringify(last));
  await page.waitForTimeout(1400);

  await page.evaluate(async (outName) => {
    const rec = window.__rec;
    const stopped = new Promise(res => { rec.onstop = res; });
    rec.stop();
    await stopped;
    const blob = new Blob(window.__chunks, { type: window.__recInfo.mimeType });
    const buf = await blob.arrayBuffer();
    console.log('UPLOAD_START', buf.byteLength);
    const res = await fetch('/upload?name=' + outName, { method: 'POST', body: buf });
    console.log('UPLOADED', res.ok, buf.byteLength, JSON.stringify(window.__recInfo));
    window.__chunks = [];
    return null;
  }, path.basename(OUT));
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
