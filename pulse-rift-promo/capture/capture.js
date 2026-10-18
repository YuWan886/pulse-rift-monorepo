const { chromium } = require('playwright');
const { start } = require('./server');

const PORT = 8125;
const URL = `http://127.0.0.1:${PORT}/pulse-rift/index.html`;

async function main() {
  const server = await start(PORT);
  const browser = await chromium.launch({
    channel: 'chrome',
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', m => console.log('PAGE:', m.text()));
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(URL);
  await page.waitForTimeout(1500);

  const clip = process.argv[2] || 'boss';
  const result = await page.evaluate(async ({ clip, PORT }) => {
    const g = PR.game;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    await g.ensureAudio();
    g.debugSetGod(true);
    if (clip === 'boss') {
      await g.debugStart(10);
      g.debugAddUpgrade('split', 2);
      g.debugAddUpgrade('echo', 1);
      g.debugAddUpgrade('homing', 1);
      g.debugAddUpgrade('silver', 2);
      g.debugAddUpgrade('amp', 2);
      g.debugAddUpgrade('resonance', 1);
      g.debugSpawnBoss('maestro');
    } else if (clip === 'ostinato') {
      await g.debugStart(5);
      g.debugAddUpgrade('split', 2);
      g.debugAddUpgrade('crit', 2);
      g.debugAddUpgrade('homing', 1);
      g.debugSpawnBoss('ostinato');
    } else {
      await g.debugStart(4);
      g.debugAddUpgrade('split', 2);
      g.debugAddUpgrade('homing', 1);
      g.debugAddUpgrade('echo', 1);
      g.debugAddUpgrade('amp', 1);
    }
    // hide tutorial toasts
    if (g.run) g.run.tutorialIndex = 999;
    g.ui.toastEl && g.ui.toastEl.classList.add('hidden');
    document.getElementById('toast')?.classList.add('hidden');

    const canvas = g.canvas;
    const stream = canvas.captureStream(60);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 45_000_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    const DURATION = 14;
    let startBeat = 0;
    let lastShotBeat = -1;
    let dashBeat = -1;
    let angle = 0;
    let overdriveTried = false;
    let frames = 0;

    function nearestTarget() {
      if (g.boss) return { x: g.boss.x, y: g.boss.y };
      let best = null, bd = 1e9;
      for (const e of g.enemies) {
        const d = Math.hypot(e.x - g.player.x, e.y - g.player.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best || { x: 640, y: 320 };
    }

    function drive() {
      frames++;
      if (g.state === 'playing' && g.player && !g.player.dead) {
        const b = g.audio.beat();
        // aim smoothly at nearest target
        const t = nearestTarget();
        g.mouse.x += (t.x - g.mouse.x) * 0.18;
        g.mouse.y += (t.y - g.mouse.y) * 0.18;

        // orbit path around center
        angle += 0.012;
        const cx = 640 + Math.cos(angle * 0.7) * 260;
        const cy = 400 + Math.sin(angle) * 130;
        const dx = cx - g.player.x, dy = cy - g.player.y;
        g.keys.delete('KeyW'); g.keys.delete('KeyA'); g.keys.delete('KeyS'); g.keys.delete('KeyD');
        if (dx > 12) g.keys.add('KeyD'); else if (dx < -12) g.keys.add('KeyA');
        if (dy > 12) g.keys.add('KeyS'); else if (dy < -12) g.keys.add('KeyW');

        // shoot on each beat
        const nb = Math.round(b);
        if (nb !== lastShotBeat && Math.abs(b - nb) < 0.12) {
          lastShotBeat = nb;
          g.tryShoot();
        }
        // dash every 8 beats
        const db = Math.floor(b / 8) * 8;
        if (db !== dashBeat && b - db < 0.1 && b > 2) {
          dashBeat = db;
          g.tryDash();
        }
        // overdrive in the second half
        if (!overdriveTried && b - startBeat > 7) {
          overdriveTried = true;
          g.gainSync(100);
          g.activateOverdrive();
        }
      }
      if (rec.state === 'recording') requestAnimationFrame(drive);
    }

    // wait for a clean beat to start
    while (g.audio.beat() < 2) await sleep(30);
    startBeat = g.audio.beat();
    rec.start(1000);
    requestAnimationFrame(drive);
    await sleep(DURATION * 1000);
    rec.stop();
    await new Promise(r => rec.onstop = r);
    const blob = new Blob(chunks, { type: mime });
    await fetch(`http://127.0.0.1:${PORT}/upload?name=${clip}.webm`, { method: 'POST', body: blob });
    return { size: blob.size, frames, beat: g.audio.beat(), startBeat, state: g.state, mime };
  }, { clip, PORT });

  console.log('RESULT', JSON.stringify(result));
  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
