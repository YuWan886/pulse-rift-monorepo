/* Real-gameplay capture: WebCodecs video (VP8) + MediaRecorder audio */
const { chromium } = require('playwright');
const { start } = require('./server');
const path = require('path');

const W = parseInt(process.env.GW || '1920', 10);
const H = parseInt(process.env.GH || '1080', 10);
const VBR = parseInt(process.env.VBR || '25000000', 10);
const MAX_SEC = parseFloat(process.env.MAX_SEC || '60');
const NAME = process.env.NAME || 'gp';
const VCODEC = process.env.VCODEC || 'vp8';
const PUMP = process.env.PUMP || 'raf';
const THROTTLE = parseFloat(process.env.THROTTLE || '0');
const IW = parseInt(process.env.IW || '0', 10);
const IH = parseInt(process.env.IH || '0', 10);

function bot() {
  const g = window.PR.game;
  const keys = g.keys;
  let lastShot = -1, lastDash = -1, lastOd = -1;
  const setKeys = (w, a, s, d) => {
    [['KeyW', w], ['KeyA', a], ['KeyS', s], ['KeyD', d]].forEach(([k, on]) => {
      if (on) keys.add(k); else keys.delete(k);
    });
  };
  window.__bot = { shots: 0, dashes: 0, od: 0 };
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
    requestAnimationFrame(tick);
  }
  tick();
}

(async () => {
  const server = await start(8146);
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR', e.stack));
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' || t.startsWith('UPLOAD')) console.log('CONSOLE', t); });
  await page.goto('http://127.0.0.1:8146/pulse-rift/index.html');
  await page.waitForFunction(() => window.PR && window.PR.game, null, { timeout: 30000 });
  if (IW > 0) {
    await page.evaluate(({ iw, ih }) => {
      const g = PR.game;
      g.canvas.width = iw; g.canvas.height = ih;
      g.view.dpr = 1;
      g.view.scale = Math.min(iw / 1280, ih / 720);
      g.view.ox = (iw - 1280 * g.view.scale) / 2;
      g.view.oy = (ih - 720 * g.view.scale) / 2;
    }, { iw: IW, ih: IH });
  }
  if (THROTTLE > 0) {
    await page.evaluate((fps) => {
      const g = PR.game; let last = 0; const orig = g.loop;
      g.loop = function (ts) { if (ts - last < 1000 / fps - 1.5) return requestAnimationFrame(g.loop); last = ts; return orig.call(this, ts); };
    }, THROTTLE);
  }

  await page.evaluate(async ({ W, H, VBR, NAME, VCODEC, PUMP, AVCC }) => {
    const canvas = document.getElementById('game');
    const VW = canvas.width, VH = canvas.height;
    let muxer, codecName, vfile;
    if (VCODEC === 'avc') {
      const M = await import('/pulse-rift-promo/node_modules/mp4-muxer/build/mp4-muxer.mjs');
      muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: 'avc', width: VW, height: VH }, fastStart: 'in-memory' });
      codecName = AVCC || 'avc1.640033'; vfile = 'mp4';
    } else {
      const M = await import('/pulse-rift-promo/node_modules/webm-muxer/build/webm-muxer.mjs');
      muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: 'V_VP8', width: VW, height: VH, frameRate: 60 }, firstTimestampBehavior: 'offset' });
      codecName = 'vp8'; vfile = 'webm';
    }
    const g = PR.game;
    await g.ensureAudio();
    let encErr = null;
    let muxing = false;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (!muxing) return;
        try { muxer.addVideoChunk(chunk, meta); } catch (e) { encErr = e; }
      },
      error: (e) => { encErr = e; console.log('ENC_ERROR', e.message); }
    });
    encoder.configure({ codec: codecName, width: VW, height: VH, bitrate: VBR, framerate: 60, latencyMode: 'realtime' });
    // warm up the encoder so the first recorded frames are not dropped
    for (let i = 0; i < 8; i++) {
      const vf = new VideoFrame(canvas, { timestamp: i * 16666 });
      encoder.encode(vf, { keyFrame: true });
      vf.close();
    }
    await encoder.flush();
    window.__enc = encoder; window.__mux = muxer; window.__wc = { frames: 0, t0: 0, last: 0, encErr: null };
    window.__vfile = vfile;

    const grab = (ts) => {
      if (!window.__recording) return;
      if (!window.__wc.t0) window.__wc.t0 = ts;
      const vf = new VideoFrame(canvas, { timestamp: Math.round((ts - window.__wc.t0) * 1000) });
      encoder.encode(vf, { keyFrame: window.__wc.frames % 120 === 0 });
      vf.close();
      window.__wc.frames++;
    };
    if (PUMP === 'interval') {
      setInterval(() => grab(performance.now()), 16);
    } else {
      function pump(ts) {
        if (window.__recording) {
          if (!window.__wc.t0) window.__wc.t0 = ts;
          if (ts - window.__wc.last >= 1000 / 62 && encoder.encodeQueueSize < 12) {
            grab(ts);
            window.__wc.last = ts;
          }
        }
        requestAnimationFrame(pump);
      }
      requestAnimationFrame(pump);
    }

    // audio branch (post-limiter)
    const dest = g.audio.ctx.createMediaStreamDestination();
    g.audio.limiter.connect(dest);
    const amime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const arec = new MediaRecorder(dest.stream, { mimeType: amime, audioBitsPerSecond: 192000 });
    window.__achunks = [];
    arec.ondataavailable = e => { if (e.data.size) window.__achunks.push(e.data); };
    window.__arec = arec; window.__amime = amime;

    await g.debugStart(10);
    g.debugSetGod(true);
    for (const [id, n] of [['split', 2], ['echo', 1], ['homing', 1], ['ricochet', 1], ['presto', 1], ['momentum', 1],
      ['quick', 1], ['overflow', 1], ['sense', 1], ['odcore', 1], ['aftershock', 1], ['barrier', 1],
      ['vitality', 1], ['harvest', 1]]) {
      g.debugAddUpgrade(id, n);
    }
    // begin recording exactly as the conductor arrives
    while (!g.boss) await new Promise(r => setTimeout(r, 8));
    window.__markerPerf = performance.now();
    muxing = true;
    window.__recording = true;
    arec.start(500);
    try {
      g.flashScreen(0.4, '#ffffff');
      g.audio._sfxNote(1000, g.audio.now(), { type: 'sine', dur: 0.06, vol: 0.05 });
    } catch (e) { console.log('MARKER_ERR', e.message); }
    window.__recMeta = { startBeat: g.audio.beat(), startTime: g.audio.ctx.currentTime, mime: amime, markerPerf: window.__markerPerf };
  }, { W, H, VBR, NAME, VCODEC, PUMP, AVCC: process.env.AVC_CODEC || '' });
  console.log('recording started');
  await page.evaluate(bot);

  const t0 = Date.now();
  let last = null;
  while ((Date.now() - t0) / 1000 < MAX_SEC) {
    await page.waitForTimeout(1000);
    last = await page.evaluate(() => {
      const g = PR.game;
      return {
        state: g.state, beat: +g.audio.beat().toFixed(2), bossHp: g.boss && Math.round(g.boss.hp),
        phase: g.boss && g.boss.phase, sync: g.run && +g.run.sync.toFixed(0),
        combo: g.run && g.run.combo, fps: +g.fps.toFixed(0), frames: window.__wc.frames,
        queue: window.__enc.encodeQueueSize, bot: window.__bot
      };
    });
    if (last.state !== 'playing' && last.state !== 'interlude') break;
  }
  console.log('ending', JSON.stringify(last));
  await page.waitForTimeout(1500);

  await page.evaluate(async (name) => {
    window.__recording = false;
    await window.__enc.flush();
    window.__enc.close();
    window.__mux.finalize();
    const vbuf = window.__mux.target.buffer;
    console.log('VIDEO_BYTES', vbuf.byteLength);
    const vr = await fetch('/upload?name=' + name + '_video.' + window.__vfile, { method: 'POST', body: vbuf });
    window.__mux = null; window.__enc = null;

    const arec = window.__arec;
    const stopped = new Promise(res => { arec.onstop = res; });
    arec.stop();
    await stopped;
    const ablob = new Blob(window.__achunks, { type: window.__amime });
    const abuf = await ablob.arrayBuffer();
    console.log('AUDIO_BYTES', abuf.byteLength);
    const ar = await fetch('/upload?name=' + name + '_audio.webm', { method: 'POST', body: abuf });
    console.log('UPLOADED', vr.ok, ar.ok, JSON.stringify(window.__recMeta), JSON.stringify(window.__wc));
    return null;
  }, NAME);

  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
