/* Scripted gameplay take: 1080p60 AVC canvas recording + optional page screencast + live game audio.
   Env:
     NAME      output basename
     WAVE      starting wave
     UPGRADES  id:count,id:count
     DUR       seconds to record
     MODE      canvas | page | both
     BOT       normal | graze | storm
     ACTIONS   path to JSON [{at, fn, arg}] (seconds from marker)
     PREROLL   seconds of gameplay before the marker (default 0)
     GOD       1/0
*/
const { chromium } = require('playwright');
const { start } = require('./server');
const fs = require('fs');
const path = require('path');

const NAME = process.env.NAME || 'scene';
const WAVE = parseInt(process.env.WAVE || '3', 10);
const DUR = parseFloat(process.env.DUR || '20');
const MODE = process.env.MODE || 'canvas';
const BOT = process.env.BOT || 'normal';
const GOD = process.env.GOD !== '0';
const PREROLL = parseFloat(process.env.PREROLL || '0');
const THROTTLE = parseFloat(process.env.THROTTLE || '60');
const SC_AT = parseFloat(process.env.SC_AT || '0');
const SC_OFF = parseFloat(process.env.SC_OFF || '999');
const SC_PAUSE_AT = process.env.SC_PAUSE_AT !== undefined ? parseFloat(process.env.SC_PAUSE_AT) : NaN;
const VBR = parseInt(process.env.VBR || '28000000', 10);
const UPGRADES = (process.env.UPGRADES || '').split(',').filter(Boolean).map(s => {
  const [id, n] = s.split(':');
  return [id, parseInt(n || '1', 10)];
});
const ACTIONS = process.env.ACTIONS ? JSON.parse(fs.readFileSync(process.env.ACTIONS, 'utf8').replace(/^﻿/, '')) : [];
const CLICKS = process.env.CLICKS ? JSON.parse(process.env.CLICKS) : [];
const FRAME_DIR = path.resolve(__dirname, 'frames_' + NAME);

function botScript(mode) {
  const g = window.PR.game;
  const keys = g.keys;
  const setKeys = (w, a, s, d) => {
    [['KeyW', w], ['KeyA', a], ['KeyS', s], ['KeyD', d]].forEach(([k, on]) => {
      if (on) keys.add(k); else keys.delete(k);
    });
  };
  window.__bot = { shots: 0, dashes: 0, od: 0, grazes: 0 };
  let lastShot = -1, lastDash = -1, lastOd = -1;
  let t0 = performance.now();
  function tick() {
    if (!g.player || (g.state !== 'playing' && g.state !== 'interlude')) {
      setKeys(false, false, false, false);
      return requestAnimationFrame(tick);
    }
    const b = g.audio.beat();
    let target = null, best = 1e9;
    if (g.boss && !g.boss.dead) target = g.boss;
    else for (const e of g.enemies) {
      if (e.dead) continue;
      const d = (e.x - g.player.x) ** 2 + (e.y - g.player.y) ** 2;
      if (d < best) { best = d; target = e; }
    }
    if (target) {
      const lead = mode === 'storm' ? 0 : 0.06;
      g.mouse.x = target.x + (target.vx || 0) * lead * 10;
      g.mouse.y = target.y + (target.vy || 0) * lead * 10 - 4;
    }
    const p = g.player;
    const t = (performance.now() - t0) / 1000;
    let dx = 0, dy = 0;
    if (mode === 'storm') {
      // aggressive sweep across the lower two thirds
      const cx = 640 + Math.sin(t * 0.9) * 300 + Math.sin(t * 2.3) * 60;
      const cy = 430 + Math.sin(t * 1.7 + 1.1) * 120 + Math.cos(t * 0.7) * 45;
      dx += cx - p.x; dy += cy - p.y;
    } else {
      const ang = b * 0.2;
      dx += (640 + Math.cos(ang) * 250) - p.x;
      dy += (420 + Math.sin(ang) * 165) - p.y;
    }
    const radius = mode === 'graze' ? 62 : 118;
    const force = mode === 'graze' ? 150 : 320;
    for (const bu of g.enemyBullets) {
      const rx = p.x - bu.x, ry = p.y - bu.y;
      const d2 = rx * rx + ry * ry;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) + 0.1;
        const w = (radius - d) / radius;
        dx += (rx / d) * w * force;
        dy += (ry / d) * w * force;
      }
      // graze bait: slide along nearby bullets
      if (mode === 'graze' && d2 < 48 * 48 && d2 > 30 * 30) {
        const d = Math.sqrt(d2) + 0.1;
        dx += (-ry / d) * 90;
        dy += (rx / d) * 90;
      }
    }
    if (g.boss) {
      const rx = p.x - g.boss.x, ry = p.y - g.boss.y;
      const d = Math.hypot(rx, ry) + 0.1;
      if (d < 110) { dx += (rx / d) * 420; dy += (ry / d) * 420; }
    }
    // keep the player inside the cinematic safe frame
    const bx0 = 170, bx1 = 1110, by0 = 150, by1 = 590;
    if (p.x < bx0) dx += (bx0 - p.x) * 3.2;
    if (p.x > bx1) dx += (bx1 - p.x) * 3.2;
    if (p.y < by0) dy += (by0 - p.y) * 3.2;
    if (p.y > by1) dy += (by1 - p.y) * 3.2;
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
    if (g.run) window.__bot.grazes = g.run.grazes;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function pollDownbeat(page, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate(() => {
      const g = PR.game;
      if (!g.audio || !g.audio.ctx) return false;
      const b = g.audio.beat();
      return (b % 4) < 0.025 || (b % 4) > 3.975;
    }).catch(() => false);
    if (ok) return true;
    await page.waitForTimeout(6);
  }
  return false;
}

(async () => {
  const server = await start(8155);
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.log('PAGEERROR', e.stack));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' || t.startsWith('UPLOAD') || t.startsWith('EVT')) console.log('CONSOLE', t);
  });
  await page.goto('http://127.0.0.1:8155/pulse-rift/index.html');
  await page.waitForFunction(() => window.PR && window.PR.game, null, { timeout: 30000 });
  if (THROTTLE > 0) {
    await page.evaluate((fps) => {
      const g = PR.game; let last = 0; const orig = g.loop;
      g.loop = function (ts) {
        if (ts - last < 1000 / fps - 1.5) return requestAnimationFrame(g.loop);
        last = ts; return orig.call(this, ts);
      };
    }, THROTTLE);
  }

  await page.evaluate(async () => {
    const g = PR.game;
    await g.ensureAudio();
    g.audio.setVolumes(g.settings);
  });

  // ── install recorders ─────────────────────────────────────
  await page.evaluate(async ({ NAME, MODE, VBR }) => {
    const g = PR.game;
    const canvas = document.getElementById('game');
    const VW = canvas.width, VH = canvas.height;
    window.__recCanvas = MODE !== 'page';

    // video (canvas) via WebCodecs -> mp4
    if (MODE !== 'page') {
      const M = await import('/pulse-rift-promo/node_modules/mp4-muxer/build/mp4-muxer.mjs');
      const muxer = new M.Muxer({ target: new M.ArrayBufferTarget(), video: { codec: 'avc', width: VW, height: VH }, fastStart: 'in-memory' });
      let muxing = false, savedConfig = null, firstChunk = true;
      const encoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta && meta.decoderConfig) savedConfig = meta.decoderConfig;
          if (!muxing) return;
          try {
            if (firstChunk) { firstChunk = false; muxer.addVideoChunk(chunk, { decoderConfig: (meta && meta.decoderConfig) || savedConfig }); }
            else muxer.addVideoChunk(chunk, meta);
          } catch (e) { console.log('MUX_ERR', e.message); }
        },
        error: (e) => console.log('ENC_ERROR', e.message)
      });
      encoder.configure({ codec: 'avc1.640033', width: VW, height: VH, bitrate: VBR, framerate: 60, latencyMode: 'realtime' });
      for (let i = 0; i < 8; i++) {
        const vf = new VideoFrame(canvas, { timestamp: i * 16666 });
        encoder.encode(vf, { keyFrame: true }); vf.close();
      }
      await encoder.flush();
      window.__enc = encoder; window.__mux = muxer; window.__muxing = () => muxing;
      window.__setMuxing = (v) => { muxing = v; };
      window.__wc = { frames: 0, t0: 0 };
      const grab = (ts) => {
        if (!window.__recording || window.__paused) return;
        if (!window.__wc.t0) window.__wc.t0 = ts;
        const vf = new VideoFrame(canvas, { timestamp: Math.round((ts - window.__wc.t0) * 1000) });
        encoder.encode(vf, { keyFrame: window.__wc.frames % 120 === 0 });
        vf.close(); window.__wc.frames++;
      };
      setInterval(() => grab(performance.now()), 16);
    }

    // audio
    const dest = g.audio.ctx.createMediaStreamDestination();
    g.audio.limiter.connect(dest);
    const amime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const arec = new MediaRecorder(dest.stream, { mimeType: amime, audioBitsPerSecond: 192000 });
    window.__achunks = [];
    arec.ondataavailable = e => { if (e.data.size) window.__achunks.push(e.data); };
    window.__arec = arec; window.__amime = amime;

    window.__marker = () => {
      const t = performance.now();
      window.__markerPerf = t;
      window.__recording = true;
      if (window.__setMuxing) window.__setMuxing(true);
      arec.start(500);
      try {
        g.flashScreen(0.55, '#ffffff');
        g.audio._sfxNote(1000, g.audio.now(), { type: 'sine', dur: 0.06, vol: 0.06 });
      } catch (e) { console.log('MARKER_ERR', e.message); }
      window.__recMeta = { startBeat: g.audio.beat(), startTime: g.audio.ctx.currentTime, markerPerf: t, mime: amime };
      return t;
    };
  }, { NAME, MODE, VBR });

  // page screencast
  let cdp = null;
  let frameInfos = [];
  let scOn = false;
  const startSC = async () => {
    if (!cdp || scOn) return;
    scOn = true;
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  };
  const stopSC = async () => {
    if (!cdp || !scOn) return;
    scOn = false;
    await cdp.send('Page.stopScreencast').catch(() => {});
  };
  if (MODE === 'page' || MODE === 'both') {
    fs.mkdirSync(FRAME_DIR, { recursive: true });
    for (const f of fs.readdirSync(FRAME_DIR)) fs.unlinkSync(path.join(FRAME_DIR, f));
    cdp = await page.context().newCDPSession(page);
    let idx = 0;
    cdp.on('Page.screencastFrame', (f) => {
      const i = idx++;
      const file = i.toString().padStart(5, '0') + '.jpg';
      frameInfos.push({ i, file, cdp: f.metadata.timestamp, wall: Date.now() });
      fs.writeFile(path.join(FRAME_DIR, file), Buffer.from(f.data, 'base64'), () => {});
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    if (MODE === 'page' || SC_AT <= 0) await startSC();
  }

  // align to a musical downbeat, start the wave, then mark
  await pollDownbeat(page);
  const markerWall = Date.now();
  const recMeta = await page.evaluate(async ({ WAVE, UPGRADES, GOD }) => {
    const g = PR.game;
    await g.debugStart(WAVE);
    if (GOD) g.debugSetGod(true);
    for (const [id, n] of UPGRADES) g.debugAddUpgrade(id, n);
    const r = window.__marker();
    return { r, meta: window.__recMeta, state: g.state, wave: g.run && g.run.wave };
  }, { WAVE, UPGRADES, GOD });
  console.log('marker', JSON.stringify(recMeta));

  const rel = (s) => Math.max(0, markerWall + s * 1000 - Date.now());
  if (cdp && MODE === 'both' && SC_AT > 0) {
    const pauseAt = Number.isFinite(SC_PAUSE_AT) ? SC_PAUSE_AT : SC_AT - 0.35;
    setTimeout(() => page.evaluate(() => { window.__paused = true; }).catch(() => {}), rel(pauseAt));
    setTimeout(() => { startSC(); }, rel(SC_AT));
    setTimeout(() => { stopSC(); }, rel(SC_OFF));
    setTimeout(() => page.evaluate(() => { window.__paused = false; }).catch(() => {}), rel(SC_OFF - 0.1));
  }

  await page.evaluate(botScript, BOT);

  // schedule actions relative to marker
  await page.evaluate((actions) => {
    window.__events = [];
    for (const a of actions) {
      const delay = Math.max(0, a.at * 1000 - (performance.now() - window.__markerPerf));
      setTimeout(() => {
        const g = PR.game;
        try {
          if (a.fn === 'openUpgrade') g.openUpgrade(true);
          else if (a.fn === 'chooseUpgrade') g.chooseUpgrade(a.arg | 0);
          else if (a.fn === 'reroll') g.rerollUpgrades();
          else if (a.fn === 'upgrade') g.debugAddUpgrade(a.arg, a.n || 1);
          else if (a.fn === 'overdrive') g.activateOverdrive();
          else if (a.fn === 'sync100') g.run.sync = 100;
          else if (a.fn === 'autofire') g.mouse.down = true;
          else if (a.fn === 'stopFire') g.mouse.down = false;
          else if (a.fn === 'dash') g.tryDash();
          else if (a.fn === 'killAll') { g.debugKillAll(); g.spawnQueue = []; }
          else if (a.fn === 'setCards') {
            if (g.state !== 'upgrade') g.openUpgrade(true);
            g.currentCards = a.arg.map(id => PR.UPGRADE_BY_ID[id]);
            g.ui.showUpgrade(g.currentCards, g.run.counts, g.run.wave, g.run.rerolls || 1);
          } else if (a.fn === 'wave') { g.startWave(a.arg); }
          window.__events.push({ at: performance.now() - window.__markerPerf, fn: a.fn, state: g.state });
        } catch (e) { window.__events.push({ at: performance.now() - window.__markerPerf, fn: a.fn, err: e.message }); }
      }, delay);
    }
  }, ACTIONS);

  // real mouse hover + click on upgrade cards (captured by the page screencast)
  for (const c of CLICKS) {
    const mk = (delay, fn) => setTimeout(fn, Math.max(0, markerWall + delay * 1000 - Date.now()));
    mk(c.at - 0.8, async () => {
      try {
        const box = await page.evaluate((i) => {
          const el = document.querySelectorAll('.upgrade-card')[i];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, c.index);
        if (box) await page.mouse.move(box.x, box.y, { steps: 14 });
      } catch (e) { console.log('MOVE_ERR', e.message); }
    });
    mk(c.at, async () => {
      try {
        const box = await page.evaluate((i) => {
          const el = document.querySelectorAll('.upgrade-card')[i];
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, c.index);
        if (box) await page.mouse.click(box.x, box.y);
        await page.waitForTimeout(280);
        const st = await page.evaluate(() => PR.game.state);
        if (st === 'upgrade') await page.evaluate((i) => PR.game.chooseUpgrade(i), c.index);
      } catch (e) { console.log('CLICK_ERR', e.message); }
    });
  }

  const t0 = Date.now();
  let last = null;
  while ((Date.now() - t0) / 1000 < DUR) {
    await page.waitForTimeout(1000);
    last = await page.evaluate(() => {
      const g = PR.game;
      return {
        state: g.state, beat: +g.audio.beat().toFixed(2), wave: g.run && g.run.wave,
        bossHp: g.boss && Math.round(g.boss.hp), phase: g.boss && g.boss.phase,
        sync: g.run && +g.run.sync.toFixed(0), combo: g.run && g.run.combo,
        grazes: g.run && g.run.grazes, fps: +g.fps.toFixed(0),
        frames: window.__wc ? window.__wc.frames : 0, queue: window.__enc ? window.__enc.encodeQueueSize : -1,
        bot: window.__bot, events: window.__events
      };
    });
    if (last.state === 'gameover') break;
  }
  console.log('ending', JSON.stringify(last));
  await page.waitForTimeout(1200);

  if (cdp) {
    await stopSC();
    fs.writeFileSync(path.join(FRAME_DIR, 'frames.json'), JSON.stringify({ markerWall, frames: frameInfos }));
  }

  await page.evaluate(async (name) => {
    window.__recording = false;
    if (window.__enc) {
      await window.__enc.flush();
      window.__enc.close();
      window.__mux.finalize();
      const buf = window.__mux.target.buffer;
      console.log('VIDEO_BYTES', buf.byteLength);
      await fetch('/upload?name=' + name + '_video.mp4', { method: 'POST', body: buf });
    }
    const arec = window.__arec;
    const stopped = new Promise(res => { arec.onstop = res; });
    arec.stop();
    await stopped;
    const blob = new Blob(window.__achunks, { type: window.__amime });
    const buf = await blob.arrayBuffer();
    console.log('AUDIO_BYTES', buf.byteLength);
    await fetch('/upload?name=' + name + '_audio.webm', { method: 'POST', body: buf });
    console.log('UPLOADED', JSON.stringify(window.__recMeta), JSON.stringify(window.__wc || {}), JSON.stringify(window.__events));
    return null;
  }, NAME);

  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
