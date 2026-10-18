/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — game engine
   A rhythm-locked twin-stick roguelike. Everything moves on 120 BPM.
   ═══════════════════════════════════════════════════════════════ */
(function (PR) {
  'use strict';

  const U = PR.U;
  const C = PR.C;
  const W = 1280;
  const H = 720;
  const TAU = U.TAU;

  const DEFAULT_SETTINGS = {
    master: 80,
    music: 70,
    sfx: 80,
    offset: 0,
    shake: 100,
    flashes: true,
    scanlines: true
  };

  const BASE_DAMAGE = 9;
  const PERFECT_WINDOW = 0.18;   // beats :: 90ms at 120bpm
  const GOOD_WINDOW = 0.34;      // beats :: 170ms
  const DASH_WINDOW = 0.22;
  const COMBO_CAP = 100;
  const PLAYER_R = 13;
  const PLAYER_HIT_R = 4.5;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.W = W;
      this.H = H;

      this.settings = this.loadSettings();
      this.defaultSettings = DEFAULT_SETTINGS;
      this.best = this.loadBest();

      this.audio = new PR.AudioEngine(this.settings);
      this.ui = new PR.UI(this);

      this.mouse = { x: W / 2, y: H * 0.45, down: false, inside: true };
      this.keys = new Set();
      this.view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
      this.debugMode = new URLSearchParams(location.search).has('debug');
      this.godMode = false;

      this.prevFrame = performance.now();
      this.animTime = 0;
      this.titleTime = 0;
      this.fps = 60;
      this.fpsSmooth = 16;

      this.state = 'title';
      this.prevState = 'playing';
      this.player = null;
      this.run = null;
      this.boss = null;
      this.plan = null;
      this.enemies = [];
      this.playerBullets = [];
      this.enemyBullets = [];
      this.beams = [];
      this.pickups = [];
      this.spawnQueue = [];
      this.particles = [];
      this.rings = [];
      this.floaters = [];
      this.queuedShots = [];
      this.afterimages = [];
      this.banner = null;
      this.judgement = null;
      this.bossDeathPos = null;

      this.shake = 0;
      this.flash = 0;
      this.flashColor = '#ffffff';
      this.hurtVignette = 0;
      this.hitstop = 0;
      this.comboPulse = 0;
      this.resultShown = false;

      this.beatNow = 0;
      this.waveStartBeat = 0;
      this.waveFirstSpawnBeat = 0;
      this.waveClearUntilBeat = 0;
      this.clearAtBeat = null;
      this.pendingWave = 1;
      this.pendingStartBeat = 0;
      this.victoryTimer = 0;
      this.victoryBurstTimer = 0;
      this.deathTimer = 0;

      this.lastManualBeat = -99;
      this.autoStep = -99;
      this.scalar = 1;
      this.enemyBulletSlowUntil = 0;
      this.sector = PR.SECTORS[0];

      this.initStars();
      this.bindEvents();
      this.resize();

      this.audioInitPromise = null;
      this.ui.updateBest(this.best);
      this.ui.setAudioStatus('offline');
      this.ui.syncSettingsUI();

      window.PR.game = this;
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    // ── settings & persistence ───────────────────────────────
    loadSettings() {
      const s = U.loadJSON('pulseRift.settings', {});
      return {
        master: U.clamp(Number(s.master ?? DEFAULT_SETTINGS.master), 0, 100),
        music: U.clamp(Number(s.music ?? DEFAULT_SETTINGS.music), 0, 100),
        sfx: U.clamp(Number(s.sfx ?? DEFAULT_SETTINGS.sfx), 0, 100),
        offset: U.clamp(Number(s.offset ?? DEFAULT_SETTINGS.offset), -150, 150),
        shake: U.clamp(Number(s.shake ?? DEFAULT_SETTINGS.shake), 0, 100),
        flashes: s.flashes !== undefined ? !!s.flashes : DEFAULT_SETTINGS.flashes,
        scanlines: s.scanlines !== undefined ? !!s.scanlines : DEFAULT_SETTINGS.scanlines
      };
    }

    loadBest() {
      const b = U.loadJSON('pulseRift.best', null) || {};
      return { score: Math.max(0, Number(b.score) || 0), wave: Math.max(0, Number(b.wave) || 0) };
    }

    applySettings(settings) {
      this.settings = { ...DEFAULT_SETTINGS, ...this.settings, ...settings };
      U.saveJSON('pulseRift.settings', this.settings);
      this.audio.setVolumes(this.settings);
      this.audio.setCalibration(this.settings.offset);
      document.getElementById('fxScanlines').classList.toggle('off', !this.settings.scanlines);
      document.body.classList.toggle('no-flash', !this.settings.flashes);
    }

    async ensureAudio() {
      if (this.audio.ready) {
        this.ui.setAudioStatus('live');
        return true;
      }
      if (!this.audioInitPromise) {
        this.audioInitPromise = this.audio.init().then((ok) => {
          this.ui.setAudioStatus(ok ? 'live' : 'failed');
          if (ok) {
            this.audio.setVolumes(this.settings);
            this.audio.setCalibration(this.settings.offset);
            if (this.state === 'title') this.audio.setMode('menu');
            this.audio.setTracks(this.run ? this.getTracks() : { drive: 0, arp: 0, pad: 0, perc: 0 });
          }
          return ok;
        });
      }
      return this.audioInitPromise;
    }

    // ── input ─────────────────────────────────────────────────
    bindEvents() {
      const firstGesture = () => { this.ensureAudio(); };
      document.addEventListener('pointerdown', firstGesture, { once: true });
      document.addEventListener('keydown', firstGesture, { once: true });

      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
      window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });
      window.addEventListener('resize', () => this.resize());

      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
      this.canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        this.onPointerMove(e);
        this.mouse.down = true;
        this.canvas.setPointerCapture?.(e.pointerId);
        if (this.state === 'playing') this.tryShoot();
      });
      window.addEventListener('pointerup', (e) => {
        if (e.button === 0) this.mouse.down = false;
      });
      this.canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; });
      this.canvas.addEventListener('pointerenter', () => { this.mouse.inside = true; });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden && (this.state === 'playing' || this.state === 'interlude' || this.state === 'waveclear')) {
          this.pauseGame();
        }
      });
    }

    onPointerMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      this.mouse.x = U.clamp((cx - this.view.ox) / this.view.scale, 0, W);
      this.mouse.y = U.clamp((cy - this.view.oy) / this.view.scale, 0, H);
    }

    onKeyDown(e) {
      if (this.ui.handleKey(e)) return;

      const code = e.code;
      if (code === 'Space' || code.startsWith('Arrow')) e.preventDefault();

      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        if (this.state === 'paused') this.resumeGame();
        else if (this.state === 'playing' || this.state === 'interlude' || this.state === 'waveclear') this.pauseGame();
        return;
      }

      if (code === 'KeyM') {
        if (!this.audio.ready) this.ensureAudio();
        const muted = this.audio.toggleMute();
        this.ui.toast(muted ? '已静音 · 再按 M 恢复声场' : '声场已恢复', 1800);
        return;
      }

      if (code === 'Enter') {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === 'BUTTON') return;
        if (this.state === 'title') { e.preventDefault(); this.startRun(); }
        else if (this.state === 'gameover') { e.preventDefault(); this.startRun(); }
        else if (this.state === 'victory') { e.preventDefault(); this.continueEndless(); }
        return;
      }

      if (code === 'KeyR' && this.state === 'gameover') { this.startRun(); return; }

      const movement = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (movement.includes(code)) {
        this.keys.add(code);
        return;
      }

      if (this.state !== 'playing' || !this.player || this.player.dead) return;

      if (code === 'Space') {
        if (!e.repeat) this.tryDash();
      } else if (code === 'KeyJ') {
        this.keys.add(code);
        if (!e.repeat) this.tryShoot();
      } else if (code === 'KeyE') {
        if (!e.repeat) this.activateOverdrive();
      } else if (code === 'F2' && this.debugMode) {
        this.godMode = !this.godMode;
        this.ui.toast(`DEBUG · GOD MODE ${this.godMode ? 'ON' : 'OFF'}`, 1400);
      }
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      const scale = Math.min(w / W, h / H);
      this.view = {
        dpr,
        scale,
        ox: (w - W * scale) / 2,
        oy: (h - H * scale) / 2
      };
    }

    // ── main loop ─────────────────────────────────────────────
    loop(ts) {
      requestAnimationFrame(this.loop);
      const rawDt = (ts - this.prevFrame) / 1000;
      this.prevFrame = ts;
      const dt = U.clamp(rawDt, 0, 0.05);
      this.fpsSmooth = U.lerp(this.fpsSmooth, rawDt * 1000, 0.08);
      this.fps = 1000 / Math.max(1, this.fpsSmooth);

      this.beatNow = this.audio.beat();
      if (this.state !== 'paused') {
        this.animTime += dt;
        this.titleTime += dt;
      }
      this.update(dt);
      PR.Render.frame(this);
    }

    update(dt) {
      if (this.state === 'title') {
        this.updateStars(dt);
        this.updateEffects(dt);
        this.audio.setEnergy(0.4);
        return;
      }
      if (this.state === 'paused') return;

      if (this.state === 'upgrade' || this.state === 'gameover' || this.state === 'victory') {
        this.updateStars(dt);
        this.updateEffects(dt);
        return;
      }

      if (this.state === 'dying') {
        this.updateStars(dt);
        this.updateEffects(dt);
        this.deathTimer -= dt;
        this.shake = Math.max(0, this.shake - dt * 22);
        if (this.deathTimer <= 0) this.finishRun(false);
        return;
      }

      if (this.state === 'victoryPending') {
        this.updateStars(dt);
        this.updateEffects(dt);
        this.victoryTimer -= dt;
        this.victoryBurstTimer -= dt;
        if (this.victoryBurstTimer <= 0 && this.bossDeathPos) {
          this.victoryBurstTimer = 0.22;
          this.burst(
            this.bossDeathPos.x + U.rand(-180, 180),
            this.bossDeathPos.y + U.rand(-100, 100),
            U.chance(0.5) ? C.gold : C.magenta,
            U.randInt(8, 22),
            { speed: [60, 380], life: [0.4, 1.2], size: [1.5, 4], glow: true }
          );
          this.ring(this.bossDeathPos.x + U.rand(-160, 160), this.bossDeathPos.y + U.rand(-90, 90), U.chance(0.5) ? C.gold : C.cyan, 12, 170, 0.8);
        }
        if (this.victoryTimer <= 0) this.finishRun(true);
        return;
      }

      if (this.state === 'interlude') {
        this.updateStars(dt);
        this.updatePlayer(dt, false);
        this.updateEffects(dt);
        this.updateEnergy();
        if (this.beatNow >= this.pendingStartBeat) {
          this.startWave(this.pendingWave);
        }
        return;
      }

      // playing / waveclear
      this.updateStars(dt);
      let d = dt;
      if (this.hitstop > 0) {
        this.hitstop -= dt;
        d *= 0.12;
      }
      this.comboPulse = Math.max(0, this.comboPulse - dt * 5);
      this.hurtVignette = Math.max(0, this.hurtVignette - dt * 1.5);

      if (this.state === 'waveclear') {
        this.updatePlayer(d, false);
        this.updateEffects(d);
        this.updateEnergy();
        if (this.beatNow >= this.waveClearUntilBeat) this.openUpgrade();
        return;
      }

      if (!this.run || !this.player) return;

      this.run.timePlayed += dt;
      this.updatePlayer(d, true);
      if (this.state !== 'playing') return;

      this.updateQueuedShots();
      this.updateAutoFire();
      this.updateSpawnQueue();
      this.updateEnemies(d);
      this.updateBoss(d);
      this.updateBeams(d);
      this.updatePlayerBullets(d);
      this.cleanupEnemies();
      this.updateEnemyBullets(d);
      this.updatePickups(d);
      this.updateTutorial();
      this.updateEnergy();

      if (this.player && this.player.dead) return;

      // delayed wave clear so the last kill can breathe
      if (!this.plan || !this.plan.boss) {
        if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
          if (this.clearAtBeat === null) this.clearAtBeat = this.beatNow + 0.8;
          else if (this.beatNow >= this.clearAtBeat) this.onWaveClear();
        } else {
          this.clearAtBeat = null;
        }
      }

      this.updateEffects(d);
      this.enemyBullets = this.enemyBullets.filter((b) => b.life > 0);
      this.playerBullets = this.playerBullets.filter((b) => b.life > 0);
    }

    updateStars(dt) {
      for (const s of this.stars) {
        s.y += s.speed * dt;
        s.x += Math.sin(this.animTime * 0.12 + s.phase) * 2 * dt;
        if (s.y > H + 10) { s.y = -10; s.x = U.rand(0, W); }
      }
    }

    updateEnergy() {
      let e = 0.36;
      if (this.state === 'playing' && this.run) {
        e = 0.4
          + Math.min(0.18, this.run.wave * 0.016)
          + Math.min(0.2, this.run.combo * 0.0022)
          + (this.run.overdrive ? 0.2 : 0)
          + (this.boss ? 0.06 : 0);
      }
      this.audio.setEnergy(U.clamp(e, 0.3, 1));
    }

    initStars() {
      this.stars = [];
      for (let i = 0; i < 95; i++) {
        const depth = U.rand(0.2, 1);
        this.stars.push({
          x: U.rand(0, W), y: U.rand(0, H),
          speed: 3 + depth * 14,
          size: 0.5 + depth * 1.8,
          alpha: 0.08 + depth * 0.34,
          phase: U.rand(0, TAU)
        });
      }
    }

    // ── run lifecycle ────────────────────────────────────────
    async startRun() {
      if (this.transitioning) return;
      if (!['title', 'gameover', 'victory'].includes(this.state)) return;
      this.transitioning = true;
      await this.ensureAudio();
      this.audio.resume();
      this.resetRun();
      this.ui.beginRun();
      this.ui.hideToast();
      this.state = 'interlude';
      this.pendingWave = 1;
      this.pendingStartBeat = Math.ceil(Math.max(this.audio.beat(), 0) + 1);
      this.audio.setMode('run');
      this.audio.setOverdrive(false);
      this.audio.setTracks(this.getTracks());
      this.audio.setWave(1);
      this.audio.setEnergy(0.45);
      this.audio.setVolumes(this.settings);
      this.resultShown = false;
      this.transitioning = false;
    }

    resetRun() {
      this.run = {
        wave: 0,
        score: 0,
        kills: 0,
        combo: 0,
        maxCombo: 0,
        sync: 0,
        overdrive: false,
        overdriveStartBeat: 0,
        overdriveEndBeat: 0,
        shots: 0,
        perfect: 0,
        good: 0,
        off: 0,
        perfectHits: 0,
        grazes: 0,
        hitsTaken: 0,
        damageDealt: 0,
        timePlayed: 0,
        counts: {},
        upgrades: [],
        endless: false,
        tutorialIndex: 0,
        wave1StartBeat: 0,
        syncReadyShown: false,
        perfectNoteIndex: 0
      };
      this.player = this.createPlayer();
      this.stats = null;
      this.recomputeStats();
      this.player.hp = this.player.maxHp;
      this.player.shield = this.player.maxShield;

      this.enemies = [];
      this.playerBullets = [];
      this.enemyBullets = [];
      this.beams = [];
      this.pickups = [];
      this.spawnQueue = [];
      this.particles = [];
      this.rings = [];
      this.floaters = [];
      this.queuedShots = [];
      this.afterimages = [];
      this.boss = null;
      this.plan = null;
      this.banner = null;
      this.judgement = null;
      this.bossDeathPos = null;
      this.clearAtBeat = null;
      this.waveStartBeat = 0;
      this.lastManualBeat = -99;
      this.autoStep = -99;
      this.enemyBulletSlowUntil = 0;
      this.shake = 0;
      this.flash = 0;
      this.hurtVignette = 0;
      this.hitstop = 0;
      this.comboPulse = 0;
      this.sector = PR.SECTORS[0];
      this.audio.setOverdrive(false);
      this.audio.setTracks({ drive: 0, arp: 0, pad: 0, perc: 0 });
    }

    createPlayer() {
      return {
        x: W / 2,
        y: H * 0.6,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        aimAngle: -Math.PI / 2,
        hp: 100,
        maxHp: 100,
        shield: 0,
        maxShield: 0,
        invuln: 1.2,
        hitFlash: 0,
        dashCd: 0,
        dashTime: 0,
        dashSpeed: 0,
        dashDirX: 0,
        dashDirY: -1,
        dashPerfect: false,
        dead: false,
        engineTimer: 0,
        afterTimer: 0,
        stats: null
      };
    }

    startWave(n) {
      if (!this.run) return;
      this.run.wave = n;
      this.state = 'playing';
      this.plan = PR.getWavePlan(n);
      this.sector = PR.sectorFor(n);
      this.audio.setWave(n);
      this.audio.setMode(this.plan.boss ? 'boss' : 'run');
      this.audio.setOverdrive(false);
      this.audio.setTracks(this.getTracks());
      this.audio.setEnergy(this.plan.boss ? 0.62 : 0.48);

      this.run.overdrive = false;
      this.enemies = [];
      this.playerBullets = [];
      this.enemyBullets = [];
      this.beams = [];
      this.pickups = [];
      this.spawnQueue = [];
      this.queuedShots = [];
      this.clearAtBeat = null;
      this.judgement = null;
      this.banner = null;
      this.lastManualBeat = -99;
      this.autoStep = -99;
      this.pendingStartBeat = 0;

      const b = this.audio.beat();
      this.waveStartBeat = b;
      this.player.invuln = Math.max(this.player.invuln, 0.9);
      if (this.stats.waveHeal > 0) {
        const before = this.player.hp;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.stats.waveHeal);
        if (this.player.hp > before) this.floatText(this.player.x, this.player.y - 34, '+' + (this.player.hp - before), { color: C.green, size: 12 });
      }

      if (this.plan.boss) {
        const def = PR.BOSSES[this.plan.boss];
        this.spawnBoss(this.plan.boss);
        this.banner = {
          kind: 'boss',
          title: this.boss ? this.boss.name : def.name,
          subtitle: `${def.cn} · ${def.subtitle}`,
          startBeat: b,
          endBeat: b + 8,
          color: def.color
        };
        this.audio.bossAlarm();
      } else {
        const anchor = U.nextMultiple(Math.max(b + 2, 2), 4);
        this.waveFirstSpawnBeat = anchor;
        this.buildSpawnQueue(this.plan, anchor, b);
        const sector = this.sector;
        this.banner = {
          kind: 'wave',
          title: `WAVE ${U.padNum(n)}`,
          subtitle: `${sector.name} // ${sector.cn}`,
          startBeat: b,
          endBeat: anchor + 1,
          color: sector.tint
        };
      }

      if (n === 1) {
        this.run.wave1StartBeat = b;
        this.run.tutorialIndex = 0;
      }
      this.spawnBurstAtPlayer();
    }

    buildSpawnQueue(plan, anchor, waveStartBeat) {
      const eliteChance = U.clamp((this.run.wave - 3) * 0.023, 0, 0.22);
      for (const group of plan.groups) {
        const base = anchor + Math.max(0, (group.bar - 1)) * 4;
        const positions = this.makeFormation(group.formation, group.count);
        const gElite = group.elite !== undefined ? group.elite : eliteChance;
        for (let i = 0; i < group.count; i++) {
          const pos = positions[i % positions.length];
          this.spawnQueue.push({
            beat: base + i * 0.5,
            type: group.type,
            x: pos.x,
            y: pos.y,
            elite: Math.random() < gElite
          });
        }
      }
      this.spawnQueue.sort((a, b) => a.beat - b.beat);
    }

    makeFormation(kind, count) {
      const margin = 75;
      const p = this.player || { x: W / 2, y: H / 2 };
      const pts = [];
      const safe = (x, y) => {
        x = U.clamp(x, margin, W - margin);
        y = U.clamp(y, margin, H - margin);
        const d = U.dist(x, y, p.x, p.y);
        if (d < 175) {
          const a = d > 1 ? Math.atan2(y - p.y, x - p.x) : U.rand(0, TAU);
          x = U.clamp(p.x + Math.cos(a) * 200, margin, W - margin);
          y = U.clamp(p.y + Math.sin(a) * 200, margin, H - margin);
        }
        return { x, y };
      };
      if (kind === 'ring') {
        const rot = U.rand(0, TAU);
        for (let i = 0; i < count; i++) {
          const a = rot + (i / Math.max(1, count)) * TAU;
          const rx = U.rand(260, 380);
          const ry = U.rand(200, 290);
          const q = safe(W / 2 + Math.cos(a) * rx, H / 2 + Math.sin(a) * ry);
          pts.push(q);
        }
      } else if (kind === 'arc') {
        const base = U.rand(0, TAU);
        const spread = U.rand(1.5, 2.3);
        for (let i = 0; i < count; i++) {
          const a = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
          const q = safe(p.x + Math.cos(a) * U.rand(280, 360), p.y + Math.sin(a) * U.rand(230, 310));
          pts.push(q);
        }
      } else if (kind === 'edges') {
        for (let i = 0; i < count; i++) {
          const side = U.randInt(0, 3);
          let x, y;
          if (side === 0) { x = U.rand(margin, W - margin); y = margin; }
          else if (side === 1) { x = W - margin; y = U.rand(margin, H - margin); }
          else if (side === 2) { x = U.rand(margin, W - margin); y = H - margin; }
          else { x = margin; y = U.rand(margin, H - margin); }
          pts.push(safe(x, y));
        }
      } else if (kind === 'sides') {
        for (let i = 0; i < count; i++) {
          const left = i % 2 === 0;
          const y = H * ((i + 1) / (count + 1));
          pts.push(safe(left ? 60 : W - 60, y + U.rand(-30, 30)));
        }
      } else if (kind === 'top') {
        for (let i = 0; i < count; i++) {
          pts.push(safe(W * ((i + 1) / (count + 1)) + U.rand(-40, 40), 65));
        }
      } else {
        const corners = [
          { x: 90, y: 90 }, { x: W - 90, y: 90 },
          { x: 90, y: H - 90 }, { x: W - 90, y: H - 90 }
        ];
        for (let i = 0; i < count; i++) pts.push({ ...corners[i % 4] });
      }
      return pts;
    }

    updateSpawnQueue() {
      while (this.spawnQueue.length && this.beatNow >= this.spawnQueue[0].beat) {
        const entry = this.spawnQueue.shift();
        this.spawnEnemy(entry.type, entry.x, entry.y, { elite: entry.elite, portal: true });
      }
    }

    checkWaveClearNow() {
      if (!this.plan || this.plan.boss || this.state !== 'playing') return;
      if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
        if (this.clearAtBeat === null) this.clearAtBeat = this.beatNow + 0.8;
        else if (this.beatNow >= this.clearAtBeat) this.onWaveClear();
      } else {
        this.clearAtBeat = null;
      }
    }

    onWaveClear() {
      if (!this.run || this.state !== 'playing') return;
      this.state = 'waveclear';
      this.endOverdrive(true);
      this.audio.setOverdrive(false);
      const bonus = 300 + this.run.wave * 150;
      this.run.score += bonus;
      const healed = Math.min(8, this.player.maxHp - this.player.hp);
      this.player.hp += healed;
      this.clearEnemyBullets(true);
      this.beams = [];
      this.queuedShots = [];
      this.audio.waveClear();
      this.audio.setEnergy(0.35);
      this.ui.hideToast();
      this.banner = {
        kind: 'clear',
        title: 'SIGNAL CLEAR',
        subtitle: `+ ${U.formatScore(bonus)} SCORE${healed > 0 ? '  ·  +' + healed + ' HP' : ''}`,
        startBeat: this.beatNow,
        endBeat: this.beatNow + 4,
        color: C.gold
      };
      this.waveClearUntilBeat = this.beatNow + 2;
      this.clearAtBeat = null;
      // sweep up any remaining health pickups immediately
      for (const pk of this.pickups) {
        const healed = Math.min(pk.heal, this.player.maxHp - this.player.hp);
        this.player.hp += healed;
        if (healed > 0) this.floatText(this.player.x + U.rand(-18, 18), this.player.y - 40, '+' + healed + ' HP', { color: C.green, size: 11 });
      }
      this.pickups = [];
      this.ring(this.player.x, this.player.y, C.gold, 20, 260, 1.1);
      this.burst(this.player.x, this.player.y, C.gold, 24, { speed: [60, 260], life: [0.4, 1.0], size: [1.5, 3.5], glow: true });
    }

    openUpgrade(force = false) {
      if (!force && this.state !== 'waveclear') return;
      this.state = 'upgrade';
      this.run.rerolls = 1;
      this.currentCards = PR.rollUpgrades(this.run.wave, this.run.counts, 3);
      this.audio.setEnergy(0.3);
      this.lastManualBeat = -99;
      this.autoStep = -99;
      if (!this.currentCards.length) {
        // every card is maxed — go straight to the next wave
        this.ui.hideAllScreens();
        this.ui.setPlaying(true);
        this.ui.hideToast();
        this.pendingWave = this.run.wave + 1;
        this.pendingStartBeat = Math.ceil(this.beatNow + 1.5);
        this.state = 'interlude';
        return;
      }
      this.ui.showUpgrade(this.currentCards, this.run.counts, this.run.wave, 1);
    }

    rerollUpgrades() {
      if (this.state !== 'upgrade' || !this.run || this.run.rerolls <= 0) return;
      this.run.rerolls--;
      this.currentCards = PR.rollUpgrades(this.run.wave, this.run.counts, 3);
      this.ui.showUpgrade(this.currentCards, this.run.counts, this.run.wave, this.run.rerolls);
    }

    chooseUpgrade(index) {
      if (this.state !== 'upgrade') return;
      const card = this.currentCards && this.currentCards[index];
      if (!card) return;
      const catCountsBefore = this.getCategoryCounts();
      const catBefore = catCountsBefore[card.cat] || 0;
      this.run.counts[card.id] = (this.run.counts[card.id] || 0) + 1;
      this.run.upgrades.push(card.id);
      this.recomputeStats();
      if (card.id === 'vitality') {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
      }
      this.player.maxShield = this.stats.shieldMax;
      this.player.shield = Math.min(this.player.shield, this.player.maxShield);
      this.audio.upgrade(card.rarity);
      this.audio.setTracks(this.getTracks());
      this.burst(this.player.x, this.player.y, PR.CAT_COLORS[card.cat], 30, { speed: [60, 300], life: [0.4, 1.1], size: [1.5, 3.5], glow: true });
      this.ring(this.player.x, this.player.y, PR.CAT_COLORS[card.cat], 22, 230, 1.0);

      const catAfter = (this.getCategoryCounts()[card.cat] || 0);
      if (catAfter === 1 && catBefore === 0) {
        this.ui.toast(`♪ 新音轨接入配乐：${PR.CAT_TRACK[card.cat]} — 你能听见自己变强。`, 3600);
      }

      this.ui.hideUpgrade();
      this.ui.setPlaying(true);
      this.state = 'interlude';
      this.pendingWave = this.run.wave + 1;
      this.pendingStartBeat = Math.ceil(this.beatNow + 1.6);
      this.player.invuln = Math.max(this.player.invuln, 1.0);
      this.audio.setMode('run');
      this.audio.setEnergy(0.5);
    }

    recomputeStats() {
      const counts = this.run ? this.run.counts : {};
      const n = (id) => counts[id] || 0;
      const s = {
        damageMul: 1,
        perfectBonus: 0,
        multishot: 0,
        pierce: 0,
        critChance: 0,
        critMul: 2.5,
        homingTurn: 0,
        ricochet: 0,
        bulletSpeedMul: 1,
        echoCount: 0,
        echoDamage: 0.6,
        doubleStop: 0,
        splash: 0,
        splashRadius: 0,
        subEvery: 0,
        subPower: 0,
        maxHpBonus: 0,
        waveHeal: 0,
        shieldMax: 0,
        shieldOnDash: false,
        comboHeal: 0,
        underdog: false,
        bulwark: false,
        dashCdMul: 1,
        dashShockMul: 1,
        dashDistMul: 1,
        syncMul: 1,
        odBeats: 0,
        grazeMul: 1,
        perfectWindowMul: 1,
        speedMul: 1,
        dropMul: 1,
        magnetMul: 1,
        reaperCount: 0,
        reaperDamage: 0,
        perfectWindow: PERFECT_WINDOW,
        goodWindow: GOOD_WINDOW
      };
      s.damageMul *= 1 + 0.22 * n('amp');
      s.perfectBonus = 0.3 * n('resonance');
      s.splash = n('resonance') > 0 ? 1 : 0;
      s.splashRadius = 58 + 12 * n('resonance');
      s.pierce = n('silver');
      s.critChance = 0.1 * n('crit');
      s.subEvery = n('sub') > 0 ? (n('sub') >= 2 ? 6 : 8) : 0;
      s.subPower = n('sub');
      s.reaperCount = n('reaper') > 0 ? (n('reaper') >= 2 ? 5 : 3) : 0;
      s.reaperDamage = n('reaper') > 0 ? 0.42 + n('reaper') * 0.1 : 0;
      s.multishot = n('split');
      s.echoCount = n('echo');
      s.echoDamage = 0.6;
      s.homingTurn = n('homing') > 0 ? 2.3 + n('homing') * 1.4 : 0;
      s.ricochet = n('ricochet');
      s.bulletSpeedMul *= 1 + 0.25 * n('presto');
      s.doubleStop = n('doublestop') * 3;
      s.maxHpBonus = 25 * n('vitality');
      s.waveHeal = 12 * n('capacitor');
      s.shieldMax = n('barrier');
      s.shieldOnDash = n('barrier') > 0;
      s.comboHeal = 4 * n('nanomed');
      s.underdog = n('undertow') > 0;
      s.bulwark = n('bulwark') > 0;
      s.dashCdMul *= Math.max(0.3, 1 - 0.2 * n('quick'));
      s.dashShockMul *= 1 + 0.8 * n('aftershock');
      s.dashDistMul *= 1 + 0.12 * n('momentum');
      s.syncMul *= 1 + 0.3 * n('overflow');
      s.odBeats = 4 * n('odcore');
      s.damageMul *= 1 + 0.1 * n('odcore');
      s.grazeMul *= Math.pow(2, n('harvest'));
      s.perfectWindowMul *= 1 + 0.2 * n('sense');
      s.speedMul *= 1 + 0.1 * n('momentum');
      s.dropMul *= 1 + 0.5 * n('magnet');
      s.magnetMul *= 1 + 1.2 * n('magnet');
      s.perfectWindow = PERFECT_WINDOW * s.perfectWindowMul;
      s.goodWindow = Math.max(s.perfectWindow + 0.08, GOOD_WINDOW * Math.min(1.3, s.perfectWindowMul));
      this.stats = s;
      if (this.player) {
        this.player.stats = s;
        const newMax = 100 + s.maxHpBonus;
        this.player.maxHp = newMax;
        this.player.maxShield = s.shieldMax;
        this.player.hp = Math.min(this.player.hp, newMax);
      }
    }

    getCategoryCounts() {
      const cats = { POWER: 0, STREAM: 0, GUARD: 0, PHASE: 0 };
      if (!this.run) return cats;
      for (const [id, count] of Object.entries(this.run.counts)) {
        const u = PR.UPGRADE_BY_ID[id];
        if (u) cats[u.cat] += count;
      }
      return cats;
    }

    getTracks() {
      const cats = this.getCategoryCounts();
      return {
        drive: cats.POWER,
        arp: cats.STREAM,
        pad: cats.GUARD,
        perc: cats.PHASE
      };
    }

    pauseGame() {
      if (!['playing', 'interlude', 'waveclear'].includes(this.state)) return;
      this.prevState = this.state;
      this.state = 'paused';
      this.audio.pause();
      this.keys.clear();
      this.mouse.down = false;
      this.ui.showPause();
    }

    resumeGame() {
      if (this.state !== 'paused') return;
      this.state = this.prevState || 'playing';
      this.audio.resume();
      this.ui.hidePause();
      this.ui.setPlaying(true);
      this.lastManualBeat = -99;
      this.autoStep = -99;
    }

    quitToTitle() {
      this.keys.clear();
      this.mouse.down = false;
      this.audio.resume();
      this.audio.setMode('menu');
      this.audio.setOverdrive(false);
      this.audio.setEnergy(0.42);
      this.state = 'title';
      this.run = null;
      this.sector = PR.SECTORS[0];
      this.player = null;
      this.boss = null;
      this.enemies = [];
      this.playerBullets = [];
      this.enemyBullets = [];
      this.beams = [];
      this.pickups = [];
      this.spawnQueue = [];
      this.queuedShots = [];
      this.particles = [];
      this.rings = [];
      this.floaters = [];
      this.banner = null;
      this.judgement = null;
      this.ui.hideToast();
      this.ui.closeModal();
      this.ui.showTitle(this.best);
      this.ui.setAudioStatus(this.audio.ready ? 'live' : (this.audio.failed ? 'failed' : 'offline'));
    }

    retry() {
      this.startRun();
    }

    continueEndless() {
      if (this.state !== 'victory' || !this.run) return;
      this.run.endless = true;
      this.resultShown = false;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 40);
      this.player.invuln = Math.max(this.player.invuln, 3);
      this.audio.setMode('run');
      this.audio.setEnergy(0.5);
      this.state = 'waveclear';
      this.victoryTimer = 0;
      this.openUpgrade(true);
    }

    finishRun(victory) {
      if (this.resultShown || !this.run) return;
      this.resultShown = true;
      this.state = victory ? 'victory' : 'gameover';
      this.keys.clear();
      this.mouse.down = false;
      this.player.invuln = 999;
      this.ui.hideToast();
      this.ui.setPlaying(false);
      const isRecord = this.saveBest();
      const stats = this.computeGrade();
      const cells = [
        ['MAX COMBO', String(this.run.maxCombo)],
        ['PERFECT', String(this.run.perfect)],
        ['ACCURACY', Math.round(stats.accuracy * 100) + '%'],
        ['KILLS', String(this.run.kills)],
        ['GRAZES', String(this.run.grazes)],
        ['TIME', this.formatTime(this.run.timePlayed)]
      ];
      const data = {
        wave: this.run.wave,
        score: this.run.score,
        isRecord,
        endless: this.run.endless,
        grade: stats.grade,
        stats: cells
      };
      if (victory) {
        this.audio.setMode('victory');
        if (!this.audio.muted) this.audio.victory();
        this.ui.showVictory(data);
      } else {
        this.audio.setMode('gameover');
        this.audio.gameOver();
        this.ui.showGameOver(data);
      }
    }

    saveBest() {
      const prev = this.best || { score: 0, wave: 0 };
      const isRecord = this.run.score > prev.score || this.run.wave > prev.wave;
      this.best = {
        score: Math.max(prev.score, this.run.score),
        wave: Math.max(prev.wave, this.run.wave)
      };
      U.saveJSON('pulseRift.best', this.best);
      this.ui.updateBest(this.best);
      return isRecord;
    }

    computeGrade() {
      const shots = Math.max(1, this.run.shots);
      const accuracy = (this.run.perfect + this.run.good * 0.5) / shots;
      const waveScore = Math.min(1, this.run.wave / 10);
      const comboScore = Math.min(1, this.run.maxCombo / 80);
      let pts = accuracy * 48 + waveScore * 34 + comboScore * 18 - this.run.hitsTaken * 1.4;
      if (this.run.wave >= 10) pts += 8;
      const grade = pts >= 92 ? 'S' : pts >= 78 ? 'A' : pts >= 58 ? 'B' : pts >= 36 ? 'C' : 'D';
      return { grade, accuracy, points: pts };
    }

    formatTime(sec) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${U.padNum(m)}:${U.padNum(s)}`;
    }

    // ── player ───────────────────────────────────────────────
    updatePlayer(dt, combat) {
      const p = this.player;
      if (!p || p.dead) return;

      p.invuln = Math.max(0, p.invuln - dt);
      p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
      p.dashCd = Math.max(0, p.dashCd - dt);

      let ix = 0, iy = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) ix -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) ix += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) iy -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) iy += 1;
      const ilen = Math.hypot(ix, iy);
      if (ilen > 0) { ix /= ilen; iy /= ilen; }

      if (p.dashTime > 0) {
        p.dashTime -= dt;
        p.x += p.dashDirX * p.dashSpeed * dt;
        p.y += p.dashDirY * p.dashSpeed * dt;
        p.afterTimer -= dt;
        if (p.afterTimer <= 0) {
          p.afterTimer = 0.022;
          this.afterimages.push({ x: p.x, y: p.y, angle: p.angle, life: 0.28, maxLife: 0.28, perfect: p.dashPerfect });
        }
        this.emitDashParticles();
        if (p.dashTime <= 0) {
          p.vx = p.dashDirX * 380;
          p.vy = p.dashDirY * 380;
        }
      } else {
        const accel = 2550;
        const maxSpeed = 325 * this.stats.speedMul;
        if (ilen > 0) {
          p.vx += ix * accel * dt;
          p.vy += iy * accel * dt;
        } else {
          const f = Math.exp(-7.5 * dt);
          p.vx *= f;
          p.vy *= f;
        }
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > maxSpeed) {
          p.vx = (p.vx / sp) * maxSpeed;
          p.vy = (p.vy / sp) * maxSpeed;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      const margin = 24;
      p.x = U.clamp(p.x, margin, W - margin);
      p.y = U.clamp(p.y, margin, H - margin);

      const aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      p.aimAngle = aim;
      p.angle = U.lerpAngle(p.angle, aim, 1 - Math.exp(-14 * dt));

      p.engineTimer -= dt;
      if (p.engineTimer <= 0) {
        p.engineTimer = 0.045;
        if (Math.hypot(p.vx, p.vy) > 60 || p.dashTime > 0) {
          const back = p.angle + Math.PI;
          this.particles.push({
            x: p.x + Math.cos(back) * 13 + U.rand(-3, 3),
            y: p.y + Math.sin(back) * 13 + U.rand(-3, 3),
            vx: Math.cos(back) * U.rand(30, 110) + p.vx * 0.1,
            vy: Math.sin(back) * U.rand(30, 110) + p.vy * 0.1,
            life: 0.28, maxLife: 0.28, size: U.rand(1, 2.2),
            color: U.chance(0.3) ? C.gold : C.cyan, glow: true, drag: 3, shape: 'dot'
          });
        }
      }

      for (let i = this.afterimages.length - 1; i >= 0; i--) {
        this.afterimages[i].life -= dt;
        if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
      }

      if (this.run && this.run.overdrive) {
        if (this.beatNow >= this.run.overdriveEndBeat) this.endOverdrive(false);
      }

      if (combat) {
        // graze tutorial hint / low hp ambience handled by renderer
      }
    }

    getMoveDirection() {
      let x = 0, y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
      const len = Math.hypot(x, y);
      if (len > 0) { x /= len; y /= len; }
      return { x, y };
    }

    tryShoot() {
      if (this.state !== 'playing' || !this.player || this.player.dead) return;
      const b = this.audio.beat();
      if (b < 0.5) return;
      const nearest = Math.round(b);
      if (nearest === this.lastManualBeat) return;
      const offset = b - nearest;
      let quality = 'off';
      if (Math.abs(offset) <= this.stats.perfectWindow) quality = 'perfect';
      else if (Math.abs(offset) <= this.stats.goodWindow) quality = 'good';

      this.lastManualBeat = nearest;
      this.autoStep = Math.floor(b * 2);
      this.fireVolley(quality, offset);
    }

    fireVolley(quality, offset = 0) {
      const p = this.player;
      if (!p || p.dead) return;
      const st = this.stats;
      const run = this.run;

      let comboMult = 1 + Math.min(run.combo, COMBO_CAP) * 0.01;

      if (quality === 'perfect' || quality === 'good') {
        run.combo += 1;
        run.maxCombo = Math.max(run.maxCombo, run.combo);
        this.comboPulse = 1;
        if (run.combo > 0 && run.combo % 25 === 0) {
          this.ring(p.x, p.y, C.gold, 14, 120, 0.7);
          this.floatText(p.x, p.y - 42, `COMBO ${run.combo}`, { color: C.gold, size: 15 });
          if (st.comboHeal > 0 && p.hp < p.maxHp) {
            const heal = Math.min(st.comboHeal, p.maxHp - p.hp);
            p.hp += heal;
            this.floatText(p.x, p.y - 60, '+' + heal + ' HP', { color: C.green, size: 11 });
          }
        }
        comboMult = 1 + Math.min(run.combo, COMBO_CAP) * 0.01;
        if (quality === 'perfect') {
          run.perfect += 1;
          this.gainSync(3.2);
          run.score += Math.round(20 * comboMult);
        } else {
          run.good += 1;
          this.gainSync(0.9);
          run.score += Math.round(5 * comboMult);
        }
        run.shots += 1;
      } else if (quality === 'off') {
        run.off += 1;
        run.shots += 1;
        run.combo = 0;
        comboMult = 1;
      }

      const qMult = quality === 'perfect'
        ? 2.0 * (1 + st.perfectBonus)
        : quality === 'good' ? 1.25
          : quality === 'auto' ? 0.75 : 0.5;
      const odMult = run.overdrive ? 1.7 : 1;
      const underdog = st.underdog && p.hp < p.maxHp * 0.4 ? 1.4 : 1;
      const damage = BASE_DAMAGE * st.damageMul * qMult * comboMult * odMult * underdog;
      const aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      const count = 1 + st.multishot;
      const spread = 0.105;
      const angles = [];
      for (let i = 0; i < count; i++) {
        angles.push(aim + (i - (count - 1) / 2) * spread);
      }

      for (const a of angles) {
        this.spawnPlayerBullet(a, damage, quality, { perfect: quality === 'perfect' });
      }
      if (quality === 'perfect' && st.doubleStop > 0) {
        for (let i = 0; i < st.doubleStop; i++) {
          const a = aim + (i - (st.doubleStop - 1) / 2) * 0.24 + U.rand(-0.03, 0.03);
          this.spawnPlayerBullet(a, damage * 0.45, 'perfect', { small: true, perfect: true });
        }
      }
      if (st.echoCount > 0 && quality !== 'auto') {
        for (let e = 0; e < st.echoCount; e++) {
          this.queuedShots.push({
            due: this.audio.beat() + 0.5 * (e + 1),
            angles: angles.slice(),
            damage: damage * st.echoDamage,
            quality: 'good'
          });
        }
      }

      const muzzleAngle = aim;
      const mx = p.x + Math.cos(muzzleAngle) * 16;
      const my = p.y + Math.sin(muzzleAngle) * 16;
      const col = quality === 'perfect' ? C.perfect : quality === 'good' ? C.cyan : C.cyanSoft;
      this.burst(mx, my, col, quality === 'perfect' ? 9 : 5, {
        speed: [40, 240], life: [0.1, 0.35], size: [1, 2.8], glow: true, drag: 4
      });
      if (quality === 'perfect') {
        this.particles.push({
          x: mx, y: my, vx: Math.cos(aim + Math.PI / 2) * 30, vy: Math.sin(aim + Math.PI / 2) * 30 - 34,
          life: 0.8, maxLife: 0.8, size: 11, color: C.gold, glow: false, drag: 1, shape: 'note', char: U.chance(0.5) ? '♪' : '♫'
        });
        this.addShake(1.6);
      }

      this.audio.shoot(quality, run.perfectNoteIndex);
      if (quality === 'perfect') run.perfectNoteIndex++;
      if (quality !== 'auto') {
        this.judgement = {
          quality,
          offset,
          time: this.animTime,
          x: p.x,
          y: p.y - 36
        };
      }
      if (quality === 'off') {
        this.addShake(1);
        this.floatText(p.x, p.y - 52, OFF_BEAT_LABEL(), { color: C.red, size: 9 });
      }
    }

    updateAutoFire() {
      if (this.state !== 'playing' || !this.player || this.player.dead) return;
      if (!this.mouse.down && !this.keys.has('KeyJ')) return;
      const b = this.audio.beat();
      if (b < 0.5) return;
      const step = Math.floor(b * 2);
      if (step === this.autoStep) return;
      this.autoStep = step;
      const p = this.player;
      const st = this.stats;
      const aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      const underdog = st.underdog && p.hp < p.maxHp * 0.4 ? 1.4 : 1;
      const damage = BASE_DAMAGE * st.damageMul * 0.75 * (this.run.overdrive ? 1.7 : 1) * underdog;
      const count = 1 + st.multishot;
      for (let i = 0; i < count; i++) {
        const a = aim + (i - (count - 1) / 2) * 0.105;
        this.spawnPlayerBullet(a, damage, 'auto', { small: true });
      }
      this.audio.shoot('auto', 0);
      const mx = p.x + Math.cos(aim) * 16;
      const my = p.y + Math.sin(aim) * 16;
      this.burst(mx, my, C.cyanSoft, 3, { speed: [30, 120], life: [0.08, 0.22], size: [0.8, 1.7], glow: true });
    }

    spawnPlayerBullet(angle, damage, quality, opts = {}) {
      const p = this.player;
      const st = this.stats;
      const speed = 960 * st.bulletSpeedMul;
      const crit = Math.random() < st.critChance;
      const finalDamage = crit ? damage * st.critMul : damage;
      const muzzle = 15;
      this.playerBullets.push({
        x: p.x + Math.cos(angle) * muzzle,
        y: p.y + Math.sin(angle) * muzzle,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: opts.small ? 2.6 : 3.8,
        damage: finalDamage,
        quality,
        perfect: quality === 'perfect',
        crit,
        pierce: opts.small ? 0 : st.pierce,
        bounces: opts.small ? 0 : st.ricochet,
        homing: opts.small ? 0 : st.homingTurn,
        hitIds: new Set(),
        hitBoss: false,
        life: 1.5 * (1 + 0.1 * Math.min(3, Math.floor(st.bulletSpeedMul))),
        maxLife: 1.5,
        echo: !!opts.echo,
        angle,
        trailX: p.x,
        trailY: p.y
      });
      if (this.playerBullets.length > 260) this.playerBullets.shift();
    }

    updateQueuedShots() {
      if (!this.queuedShots.length) return;
      const b = this.audio.beat();
      for (let i = this.queuedShots.length - 1; i >= 0; i--) {
        const q = this.queuedShots[i];
        if (b >= q.due) {
          for (const a of q.angles) {
            this.spawnPlayerBullet(a, q.damage, q.quality, { echo: true });
          }
          this.audio.shoot('auto', 0);
          this.queuedShots.splice(i, 1);
        }
      }
    }

    tryDash() {
      if (this.state !== 'playing' || !this.player || this.player.dead) return;
      const p = this.player;
      if (p.dashCd > 0) return;
      const b = this.audio.beat();
      const nearest = Math.round(b);
      const offset = b - nearest;
      const perfect = Math.abs(offset) <= DASH_WINDOW * this.stats.perfectWindowMul;

      let dir = this.getMoveDirection();
      if (!dir.x && !dir.y) {
        const aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
        dir = { x: Math.cos(aim), y: Math.sin(aim) };
      }
      p.dashDirX = dir.x;
      p.dashDirY = dir.y;
      p.dashSpeed = 1560 * this.stats.dashDistMul;
      p.dashTime = 0.16;
      p.dashPerfect = perfect;
      p.dashCd = 1.65 * this.stats.dashCdMul * (perfect ? 0.8 : 1);
      p.invuln = Math.max(p.invuln, perfect ? 0.55 : 0.3);
      p.afterTimer = 0;
      this.audio.dash(perfect);
      this.burst(p.x, p.y, perfect ? C.gold : C.cyan, perfect ? 22 : 10, {
        speed: [50, 320], life: [0.2, 0.55], size: [1, 3], glow: true
      });

      let shockRadius = 55;
      if (perfect) {
        shockRadius = 120 * this.stats.dashShockMul;
        const dmg = 14 * this.stats.dashShockMul;
        this.dashShock(p.x, p.y, shockRadius, dmg);
        this.gainSync(6.5);
        if (this.stats.shieldOnDash && p.shield < p.maxShield) {
          p.shield = Math.min(p.maxShield, p.shield + 1);
          this.floatText(p.x, p.y - 52, 'SHIELD +1', { color: C.shield, size: 11 });
        }
        this.addShake(9);
        this.flashScreen(0.22, C.gold);
        this.judgement = { quality: 'perfect', offset, time: this.animTime, x: p.x, y: p.y - 36, dash: true };
        this.floatText(p.x, p.y - 58, 'PHASE', { color: C.gold, size: 13 });
      } else {
        this.addShake(2.5);
      }
      this.ring(p.x, p.y, perfect ? C.gold : C.cyan, 10, shockRadius, 0.45);
    }

    dashShock(x, y, radius, damage) {
      this.ring(x, y, C.gold, 16, radius, 0.5);
      this.ring(x, y, C.cyan, 8, radius * 0.7, 0.35);
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (U.dist(e.x, e.y, x, y) < radius + e.r) {
          this.damageEnemy(e, damage, { perfect: true, shock: true });
        }
      }
      if (this.boss && this.boss.active && U.dist(this.boss.x, this.boss.y, x, y) < radius + this.boss.r) {
        this.damageBoss(damage, { perfect: true });
      }
      this.clearEnemyBulletsInRadius(x, y, radius);
      this.addShake(5);
    }

    gainSync(amount) {
      if (!this.run || this.run.overdrive) return;
      const before = this.run.sync;
      this.run.sync = U.clamp(this.run.sync + amount * this.stats.syncMul, 0, 100);
      if (before < 100 && this.run.sync >= 100) {
        if (!this.run.syncReadyShown) {
          this.run.syncReadyShown = true;
          this.ui.toast('同步率已满 · 按 E 启动 OVERDRIVE（踩拍启动可延长）', 4200);
        }
        this.audio.syncReady();
        this.ring(this.player.x, this.player.y, C.gold, 18, 200, 0.9);
        this.addShake(4);
      }
    }

    activateOverdrive() {
      if (this.state !== 'playing' || !this.run || !this.player) return;
      if (this.run.overdrive || this.run.sync < 99.9) return;
      const b = this.audio.beat();
      const perfect = Math.abs(b - Math.round(b)) <= DASH_WINDOW;
      const duration = 8 + this.stats.odBeats + (perfect ? 4 : 0);
      this.run.overdrive = true;
      this.run.overdriveStartBeat = b;
      this.run.overdriveEndBeat = b + duration;
      this.run.sync = 100;
      this.audio.setOverdrive(true);
      this.audio.overdriveStart();
      this.audio.setEnergy(1);
      this.clearEnemyBulletsInRadius(this.player.x, this.player.y, 200);
      this.ring(this.player.x, this.player.y, C.gold, 20, 300, 1.2);
      this.ring(this.player.x, this.player.y, C.cyan, 12, 200, 0.8);
      this.addShake(14);
      this.flashScreen(0.5, C.gold);
      this.hitstop = 0.08;
      this.floatText(this.player.x, this.player.y - 70, 'OVERDRIVE', { color: C.gold, size: 22 });
      this.burst(this.player.x, this.player.y, C.gold, 50, { speed: [80, 460], life: [0.4, 1.2], size: [1.5, 4], glow: true });
      if (perfect) this.floatText(this.player.x, this.player.y - 94, 'PERFECT ACTIVATION +4 BEATS', { color: C.cyanSoft, size: 10 });
    }

    endOverdrive(quiet) {
      if (!this.run || !this.run.overdrive) return;
      this.run.overdrive = false;
      this.run.sync = 0;
      this.audio.setOverdrive(false);
      if (!quiet) {
        this.audio.overdriveEnd();
        this.flashScreen(0.15, C.cyan);
      }
    }

    hurtPlayer(amount) {
      const p = this.player;
      if (!p || p.dead || this.state !== 'playing' || this.godMode) return;
      if (p.invuln > 0) return;
      p.hitFlash = 1;
      this.addShake(12);
      this.hurtVignette = 1;
      this.hitstop = 0.06;
      if (p.shield > 0) {
        p.shield -= 1;
        p.invuln = 0.9;
        this.audio.shieldBreak();
        this.ring(p.x, p.y, C.shield, 18, 130, 0.6);
        this.burst(p.x, p.y, C.shield, 22, { speed: [80, 300], life: [0.2, 0.6], size: [1, 3], glow: true });
        this.floatText(p.x, p.y - 42, 'SHIELD BLOCK', { color: C.shield, size: 11 });
        this.flashScreen(0.14, C.shield);
        return;
      }
      p.hp -= amount;
      this.run.hitsTaken += 1;
      this.run.combo = 0;
      this.run.sync = Math.max(0, this.run.sync - 25);
      p.invuln = 1.5;
      this.audio.hurt();
      this.flashScreen(0.34, C.red);
      this.clearEnemyBulletsInRadius(p.x, p.y, 105);
      if (this.stats.bulwark) {
        this.enemyBulletSlowUntil = this.beatNow + 1.5;
        this.clearEnemyBulletsInRadius(p.x, p.y, 190);
      }
      this.floatText(p.x, p.y - 44, '-' + Math.round(amount), { color: C.red, size: 16 });
      this.burst(p.x, p.y, C.red, 26, { speed: [80, 340], life: [0.25, 0.8], size: [1.2, 3.4], glow: true });
      if (p.hp <= 0) {
        p.hp = 0;
        this.die();
      }
    }

    die() {
      if (!this.player || this.player.dead) return;
      this.player.dead = true;
      this.state = 'dying';
      this.deathTimer = 1.7;
      this.endOverdrive(true);
      this.audio.setMode('gameover');
      this.audio.hurt();
      this.addShake(26);
      this.flashScreen(0.45, C.red);
      this.burst(this.player.x, this.player.y, C.cyan, 60, { speed: [60, 460], life: [0.4, 1.5], size: [1.5, 5], glow: true });
      this.burst(this.player.x, this.player.y, C.red, 40, { speed: [60, 360], life: [0.3, 1.2], size: [1, 4], glow: true });
      this.ring(this.player.x, this.player.y, C.cyan, 10, 340, 1.4);
      this.ui.hideToast();
      this.keys.clear();
      this.mouse.down = false;
    }

    // ── enemies ─────────────────────────────────────────────
    spawnEnemy(type, x, y, opts = {}) {
      const def = PR.ENEMIES[type];
      if (!def) return null;
      if (this.enemies.length > 46) return null;
      const wave = this.run.wave;
      const hpScale = 1 + Math.max(0, wave - 1) * 0.14 + Math.max(0, wave - 10) * 0.1;
      const speedScale = 1 + Math.min(0.4, (wave - 1) * 0.012);
      const elite = !!opts.elite;
      const b = this.audio.beat();
      const hp = def.hp * hpScale * (elite ? 1.8 : 1);
      const e = {
        uid: (this._enemyUid = (this._enemyUid || 100) + 1),
        type,
        x, y,
        vx: 0, vy: 0,
        hp, maxHp: hp,
        r: def.r * (elite ? 1.16 : 1),
        color: elite ? C.gold : def.color,
        baseColor: def.color,
        elite,
        armor: !!def.armor,
        contact: def.contact + Math.floor(wave / 4),
        speed: def.speed * speedScale * (elite ? 1.06 : 1),
        score: def.score * (elite ? 1.7 : 1),
        angle: U.rand(0, TAU),
        spin: U.rand(-2, 2),
        phase: U.rand(0, TAU),
        spawnT: 0.45,
        hitFlash: 0,
        dead: false,
        fireSpeed: def.fireSpeed * (1 + Math.min(0.4, (wave - 1) * 0.015)),
        fireInterval: def.fireInterval,
        nextFireBeat: Math.ceil(b) + U.randInt(2, 3),
        charging: false,
        lockedAngle: 0,
        volley: 0,
        orbitAngle: U.rand(0, TAU),
        orbitDir: U.chance(0.5) ? 1 : -1,
        lungeTime: 0,
        lungeDirX: 0,
        lungeDirY: 0,
        beamPhase: 0,
        damageFlash: 0
      };
      if (type === 'prism') e.nextFireBeat = Math.ceil(b) + 3;
      if (type === 'stinger') e.nextFireBeat = Math.ceil(b) + 2;
      if (type === 'splitter' || type === 'shard') e.nextFireBeat = 1e9;
      this.enemies.push(e);
      if (!opts.silent) {
        this.ring(x, y, elite ? C.gold : def.color, 6, 44, 0.4);
        this.burst(x, y, elite ? C.gold : def.color, 10, { speed: [30, 180], life: [0.15, 0.4], size: [1, 2.6], glow: true });
      }
      return e;
    }

    updateEnemies(dt) {
      const p = this.player;
      const b = this.beatNow;
      const speedScale = 1 + Math.min(0.35, (this.run.wave - 1) * 0.01);
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.spawnT = Math.max(0, e.spawnT - dt);
        e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);

        switch (e.type) {
          case 'drone': {
            const desired = 175 + (e.elite ? 25 : 0);
            const radial = (d - desired) * 1.7;
            const tangent = Math.sin(b * Math.PI * 0.5 + e.phase) * 75;
            const speedCap = e.speed * 1.7;
            let tx = Math.cos(ang) * radial + Math.cos(ang + Math.PI / 2) * tangent;
            let ty = Math.sin(ang) * radial + Math.sin(ang + Math.PI / 2) * tangent;
            const tl = Math.hypot(tx, ty);
            if (tl > speedCap) { tx = (tx / tl) * speedCap; ty = (ty / tl) * speedCap; }
            e.vx = U.damp(e.vx, tx, 2.8, dt);
            e.vy = U.damp(e.vy, ty, 2.8, dt);
            if (b >= e.nextFireBeat) {
              if (e.spawnT <= 0) this.fireAimed(e, ang, e.fireSpeed, { spread: 0, count: 1 });
              e.nextFireBeat += e.fireInterval;
            }
            break;
          }
          case 'weaver': {
            const desired = 245;
            const radial = (d - desired) * 1.6;
            const tangent = Math.sin(b * Math.PI * 0.5 + e.phase) * 125;
            const tx = Math.cos(ang) * radial + Math.cos(ang + Math.PI / 2) * tangent;
            const ty = Math.sin(ang) * radial + Math.sin(ang + Math.PI / 2) * tangent;
            e.vx = U.damp(e.vx, tx * speedScale, 3, dt);
            e.vy = U.damp(e.vy, ty * speedScale, 3, dt);
            if (b >= e.nextFireBeat) {
              if (e.spawnT <= 0) this.fireAimed(e, ang, e.fireSpeed, { spread: 0.18, count: 3 });
              e.nextFireBeat += e.fireInterval;
            }
            break;
          }
          case 'orbiter': {
            e.orbitAngle += dt * 0.85 * e.orbitDir;
            const targetR = 205;
            const tx = p.x + Math.cos(e.orbitAngle) * targetR;
            const ty = p.y + Math.sin(e.orbitAngle) * targetR;
            e.x = U.damp(e.x, tx, 2.7, dt);
            e.y = U.damp(e.y, ty, 2.7, dt);
            if (b >= e.nextFireBeat) {
              if (e.spawnT <= 0) {
                const count = 8;
                const off = e.volley * 0.18;
                for (let i = 0; i < count; i++) {
                  const a = off + (i / count) * TAU;
                  this.fireEnemyBullet(e.x, e.y, a, e.fireSpeed, { color: C.enemy, damage: this.enemyBulletDamage() });
                }
                e.volley++;
              }
              e.nextFireBeat += e.fireInterval;
            }
            break;
          }
          case 'sniper': {
            e.vx = U.damp(e.vx, Math.cos(ang) * 28, 1.5, dt);
            e.vy = U.damp(e.vy, Math.sin(ang) * 28, 1.5, dt);
            if (!e.charging && b >= e.nextFireBeat - 1) {
              e.charging = true;
              e.lockedAngle = ang;
            }
            if (e.charging) {
              if (b >= e.nextFireBeat) {
                if (e.spawnT <= 0) {
                  this.fireEnemyBullet(e.x, e.y, e.lockedAngle, e.fireSpeed, {
                    color: C.enemyFast, damage: this.enemyBulletDamage() + 1, r: 5, glow: 1.4
                  });
                  this.burst(e.x + Math.cos(e.lockedAngle) * e.r, e.y + Math.sin(e.lockedAngle) * e.r, C.enemyFast, 7, { speed: [40, 180], life: [0.1, 0.3], size: [1, 2.4], glow: true });
                }
                e.charging = false;
                e.nextFireBeat += e.fireInterval;
              }
            }
            break;
          }
          case 'brute': {
            const desired = 190;
            const radial = (d - desired) * 0.9;
            const tv = U.clamp(radial, -e.speed, e.speed);
            e.vx = U.damp(e.vx, Math.cos(ang) * tv, 1.6, dt);
            e.vy = U.damp(e.vy, Math.sin(ang) * tv, 1.6, dt);
            if (b >= e.nextFireBeat) {
              if (e.spawnT <= 0) {
                const count = 14;
                const gap = ang;
                const gapHalf = 0.4;
                for (let i = 0; i < count; i++) {
                  const a = (i / count) * TAU + e.volley * 0.07;
                  if (Math.abs(U.angleDiff(a, gap)) < gapHalf) continue;
                  this.fireEnemyBullet(e.x, e.y, a, e.fireSpeed, { color: C.enemy, damage: this.enemyBulletDamage() + 1, r: 6.5 });
                }
                e.volley++;
              }
              e.nextFireBeat += e.fireInterval;
            }
            break;
          }
          case 'splitter': {
            const desired = 170;
            const radial = (d - desired) * 1.2;
            const wobble = Math.sin(b * Math.PI * 0.5 + e.phase) * 70;
            e.vx = U.damp(e.vx, Math.cos(ang) * radial + Math.cos(ang + Math.PI / 2) * wobble * 0.35, 2.5, dt);
            e.vy = U.damp(e.vy, Math.sin(ang) * radial + Math.sin(ang + Math.PI / 2) * wobble * 0.35, 2.5, dt);
            break;
          }
          case 'prism': {
            e.angle += dt * 0.5;
            if (e.beamPhase === 0 && b >= e.nextFireBeat - 2) {
              e.beamPhase = 1;
              const charge = Math.max(0.1, e.nextFireBeat - b);
              for (let arm = 0; arm < 2; arm++) {
                this.beams.push({
                  x: e.x, y: e.y,
                  angle: e.angle + arm * Math.PI / 2,
                  rotate: 0.6,
                  width: 13,
                  damage: this.enemyBulletDamage() + 1,
                  activeStart: e.nextFireBeat,
                  activeEnd: e.nextFireBeat + 0.8,
                  lifeEnd: e.nextFireBeat + 1.4,
                  color: C.laser,
                  followBoss: false,
                  charge: charge
                });
              }
            }
            if (e.beamPhase === 1 && b >= e.nextFireBeat) {
              e.beamPhase = 0;
              e.nextFireBeat += 8;
            }
            break;
          }
          case 'stinger': {
            if (e.lungeTime > 0) {
              e.lungeTime -= dt;
              e.x += e.lungeDirX * 740 * dt;
              e.y += e.lungeDirY * 740 * dt;
              if (Math.random() < 0.5) {
                this.particles.push({ x: e.x, y: e.y, vx: -e.lungeDirX * 50, vy: -e.lungeDirY * 50, life: 0.2, maxLife: 0.2, size: 2, color: C.gold, glow: true, drag: 2, shape: 'dot' });
              }
            } else {
              const desired = 260;
              const radial = d - desired;
              e.vx = U.damp(e.vx, Math.cos(ang) * radial * 0.9, 3, dt);
              e.vy = U.damp(e.vy, Math.sin(ang) * radial * 0.9, 3, dt);
              if (!e.charging && b >= e.nextFireBeat - 1) {
                e.charging = true;
                e.lockedAngle = ang;
              }
              if (e.charging && b >= e.nextFireBeat) {
                if (e.spawnT <= 0) {
                  e.charging = false;
                  e.lungeTime = 0.32;
                  e.lungeDirX = Math.cos(e.lockedAngle);
                  e.lungeDirY = Math.sin(e.lockedAngle);
                  this.ring(e.x, e.y, C.gold, 6, 40, 0.3);
                }
                e.nextFireBeat += 4;
              }
            }
            break;
          }
          case 'shard': {
            const wob = Math.sin(b * 3 + e.phase) * 60;
            e.vx = U.damp(e.vx, Math.cos(ang) * e.speed + Math.cos(ang + Math.PI / 2) * wob * 0.3, 4, dt);
            e.vy = U.damp(e.vy, Math.sin(ang) * e.speed + Math.sin(ang + Math.PI / 2) * wob * 0.3, 4, dt);
            break;
          }
        }

        if (e.type !== 'orbiter' && e.type !== 'prism') {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        } else {
          e.x += e.vx * dt * 0.4;
          e.y += e.vy * dt * 0.4;
        }
        e.x = U.clamp(e.x, 24, W - 24);
        e.y = U.clamp(e.y, 24, H - 24);
        e.angle += e.spin * dt;
      }

      this.enemySeparation();

      // Keep ranged enemies from stacking on top of the player. Melee units
      // (stingers mid-lunge and shards) are exempt, and only they can deal
      // contact damage. This keeps the player readable in dense fights.
      if (p && !p.dead) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const melee = e.type === 'shard' || (e.type === 'stinger' && e.lungeTime > 0);
          if (!melee) {
            const minD = 14 + e.r + 30;
            const dx = e.x - p.x;
            const dy = e.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.01 && d < minD) {
              const nx = dx / d;
              const ny = dy / d;
              const push = minD - d;
              e.x += nx * push;
              e.y += ny * push;
              const inward = e.vx * nx + e.vy * ny;
              if (inward < 0) {
                e.vx -= nx * inward;
                e.vy -= ny * inward;
              }
            }
          }
        }
      }

      // contact damage — melee units and anything the player charges into
      if (p && !p.dead) {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0.15) continue;
          const melee = e.type === 'shard' || e.type === 'stinger';
          if (!melee) continue;
          const rr = e.r * 0.72 + PLAYER_HIT_R + 2;
          if (U.dist2(e.x, e.y, p.x, p.y) < rr * rr) {
            this.hurtPlayer(e.contact);
            if (this.state !== 'playing') break;
          }
        }
      }
    }

    enemySeparation() {
      const arr = this.enemies;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (a.dead) continue;
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          if (b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const minD = (a.r + b.r) * 0.82;
          if (d2 > 0.001 && d2 < minD * minD) {
            const d = Math.sqrt(d2);
            const push = (minD - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
          }
        }
      }
    }

    fireAimed(e, ang, speed, opts = {}) {
      const count = opts.count || 1;
      const spread = opts.spread || 0;
      for (let i = 0; i < count; i++) {
        const a = ang + (i - (count - 1) / 2) * spread;
        this.fireEnemyBullet(e.x, e.y, a, speed, { color: C.enemyFast, damage: this.enemyBulletDamage(), r: 5.5, glow: 1.2 });
      }
    }

    enemyBulletDamage() {
      return 8 + Math.floor((this.run ? this.run.wave : 1) / 4);
    }

    fireEnemyBullet(x, y, angle, speed, opts = {}) {
      if (this.enemyBullets.length > 320) return;
      const r = opts.r || 6;
      this.enemyBullets.push({
        x: x + Math.cos(angle) * (opts.offset || 0),
        y: y + Math.sin(angle) * (opts.offset || 0),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
        damage: opts.damage || this.enemyBulletDamage(),
        color: opts.color || C.enemy,
        grazed: false,
        t: 0,
        curve: opts.curve || 0,
        accel: opts.accel || 0,
        maxSpeed: opts.maxSpeed || speed * 1.6,
        life: opts.life || 10,
        glow: opts.glow || 1,
        shape: opts.shape || 'orb'
      });
    }

    updateEnemyBullets(dt) {
      const p = this.player;
      const slow = this.beatNow < this.enemyBulletSlowUntil ? 0.42 : 1;
      let pendingHit = null;
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        const bu = this.enemyBullets[i];
        if (!bu) continue;
        bu.t += dt;
        if (bu.curve) {
          const sp = Math.hypot(bu.vx, bu.vy);
          const a = Math.atan2(bu.vy, bu.vx) + bu.curve * dt;
          bu.vx = Math.cos(a) * sp;
          bu.vy = Math.sin(a) * sp;
        }
        if (bu.accel) {
          const sp = Math.min(bu.maxSpeed, Math.hypot(bu.vx, bu.vy) + bu.accel * dt);
          const a = Math.atan2(bu.vy, bu.vx);
          bu.vx = Math.cos(a) * sp;
          bu.vy = Math.sin(a) * sp;
        }
        bu.x += bu.vx * dt * slow;
        bu.y += bu.vy * dt * slow;
        bu.life -= dt;
        if (bu.life <= 0 || bu.x < -90 || bu.x > W + 90 || bu.y < -90 || bu.y > H + 90) {
          this.enemyBullets.splice(i, 1);
          continue;
        }
        if (!p || p.dead) continue;
        const d = U.dist(bu.x, bu.y, p.x, p.y);
        const hitR = PLAYER_HIT_R + bu.r * 0.82;
        if (d < hitR) {
          // Defer the hit until after the loop: hurtPlayer can clear bullets,
          // which would otherwise mutate this array mid-iteration.
          if (!pendingHit) pendingHit = { x: bu.x, y: bu.y, color: bu.color, damage: bu.damage };
          this.enemyBullets.splice(i, 1);
          continue;
        }
        if (!bu.grazed && d < bu.r + 26) {
          bu.grazed = true;
          this.run.grazes += 1;
          this.gainSync(0.28 * this.stats.grazeMul);
          this.run.score += Math.round(10 * this.stats.grazeMul);
          this.audio.graze();
          this.particles.push({
            x: bu.x, y: bu.y, vx: (p.x - bu.x) * 1.5, vy: (p.y - bu.y) * 1.5,
            life: 0.25, maxLife: 0.25, size: 1.5, color: C.cyanSoft, glow: true, drag: 3, shape: 'spark'
          });
        }
      }
      if (pendingHit) {
        this.hurtPlayer(pendingHit.damage);
        this.burst(pendingHit.x, pendingHit.y, pendingHit.color, 8, { speed: [40, 200], life: [0.12, 0.35], size: [1, 2.3], glow: true });
      }
    }

    updatePlayerBullets(dt) {
      const p = this.player;
      for (let i = this.playerBullets.length - 1; i >= 0; i--) {
        const bu = this.playerBullets[i];
        bu.life -= dt;
        if (bu.life <= 0) { this.playerBullets.splice(i, 1); continue; }
        if (bu.homing > 0) {
          const target = this.nearestTarget(bu.x, bu.y, 460);
          if (target) {
            const ta = Math.atan2(target.y - bu.y, target.x - bu.x);
            const ca = Math.atan2(bu.vy, bu.vx);
            const na = ca + U.clamp(U.angleDiff(ta, ca), -bu.homing * dt, bu.homing * dt);
            const sp = Math.hypot(bu.vx, bu.vy);
            bu.vx = Math.cos(na) * sp;
            bu.vy = Math.sin(na) * sp;
          }
        }
        bu.x += bu.vx * dt;
        bu.y += bu.vy * dt;

        if (bu.bounces > 0) {
          if (bu.x < 10) { bu.x = 10; bu.vx = Math.abs(bu.vx); bu.bounces--; this.ring(bu.x, bu.y, C.cyan, 2, 18, 0.2); }
          else if (bu.x > W - 10) { bu.x = W - 10; bu.vx = -Math.abs(bu.vx); bu.bounces--; this.ring(bu.x, bu.y, C.cyan, 2, 18, 0.2); }
          if (bu.y < 10) { bu.y = 10; bu.vy = Math.abs(bu.vy); bu.bounces--; this.ring(bu.x, bu.y, C.cyan, 2, 18, 0.2); }
          else if (bu.y > H - 10) { bu.y = H - 10; bu.vy = -Math.abs(bu.vy); bu.bounces--; this.ring(bu.x, bu.y, C.cyan, 2, 18, 0.2); }
        }
        if (bu.x < -40 || bu.x > W + 40 || bu.y < -40 || bu.y > H + 40) {
          this.playerBullets.splice(i, 1);
          continue;
        }

        // boss collision
        if (this.boss && this.boss.active && !bu.hitBoss) {
          const rr = this.boss.r * 0.86 + bu.r;
          if (U.dist2(bu.x, bu.y, this.boss.x, this.boss.y) < rr * rr) {
            bu.hitBoss = true;
            this.damageBoss(bu.damage, { perfect: bu.perfect });
            if (bu.perfect) this.onPerfectImpact(bu.x, bu.y, bu.damage);
            this.sparkHit(bu.x, bu.y, bu.perfect, bu.crit);
            if (bu.pierce > 0) bu.pierce--;
            else { this.playerBullets.splice(i, 1); continue; }
          }
        }

        let removed = false;
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (e.dead) continue;
          if (bu.hitIds.has(e.uid)) continue;
          const rr = e.r * 0.9 + bu.r;
          if (U.dist2(bu.x, bu.y, e.x, e.y) < rr * rr) {
            bu.hitIds.add(e.uid);
            this.damageEnemy(e, bu.damage, { perfect: bu.perfect });
            if (bu.perfect) this.onPerfectImpact(bu.x, bu.y, bu.damage);
            this.sparkHit(bu.x, bu.y, bu.perfect, bu.crit);
            if (bu.pierce > 0) {
              bu.pierce--;
            } else {
              this.playerBullets.splice(i, 1);
              removed = true;
              break;
            }
          }
        }
        if (removed) continue;
        if (bu.x < -40 || bu.x > W + 40 || bu.y < -40 || bu.y > H + 40) {
          this.playerBullets.splice(i, 1);
        }
      }
    }

    nearestTarget(x, y, maxDist) {
      let best = null;
      let bd = maxDist * maxDist;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = U.dist2(x, y, e.x, e.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (this.boss && this.boss.active) {
        const d = U.dist2(x, y, this.boss.x, this.boss.y);
        if (d < bd) best = this.boss;
      }
      return best;
    }

    sparkHit(x, y, perfect, crit) {
      const color = crit ? C.gold : perfect ? C.perfect : C.cyan;
      this.burst(x, y, color, crit ? 12 : perfect ? 7 : 4, {
        speed: [30, 220], life: [0.1, 0.35], size: [0.8, 2.4], glow: true, drag: 4
      });
      if (crit) this.floatText(x, y - 8, 'CRIT', { color: C.gold, size: 11 });
      this.audio.hit();
    }

    damageEnemy(e, damage, opts = {}) {
      if (!e || e.dead) return;
      let dmg = damage;
      if (e.armor && !opts.perfect) {
        dmg *= 0.3;
        if (U.chance(0.09)) this.floatText(e.x, e.y - e.r - 10, 'ARMOR', { color: C.muted, size: 9 });
      }
      e.hp -= dmg;
      e.hitFlash = 0.16;
      this.run.damageDealt += dmg;
      this.run.score += Math.round(dmg * 0.6);
      if (e.hp <= 0) this.killEnemy(e, opts);
    }

    onPerfectImpact(x, y, damage) {
      const st = this.stats;
      this.run.perfectHits += 1;
      if (st.splash > 0) {
        for (const other of this.enemies) {
          if (other.dead) continue;
          if (U.dist(other.x, other.y, x, y) < st.splashRadius + other.r) {
            this.damageEnemy(other, damage * 0.3 * st.splash, { perfect: true, splash: true });
          }
        }
        this.ring(x, y, C.gold, 4, st.splashRadius, 0.35);
      }
      if (st.subEvery > 0 && this.run.perfectHits % st.subEvery === 0) {
        const radius = 105 + st.subPower * 32;
        const dmg = 24 + st.subPower * 26;
        this.ring(x, y, C.orange, 16, radius, 0.55);
        this.ring(x, y, C.gold, 9, radius * 0.7, 0.4);
        this.clearEnemyBulletsInRadius(x, y, radius * 0.85);
        for (const other of this.enemies) {
          if (other.dead) continue;
          if (U.dist(other.x, other.y, x, y) < radius + other.r) {
            this.damageEnemy(other, dmg, { perfect: true, shock: true });
          }
        }
        if (this.boss && this.boss.active && U.dist(this.boss.x, this.boss.y, x, y) < radius + this.boss.r) {
          this.damageBoss(dmg, { perfect: true });
        }
        this.addShake(7);
        this.flashScreen(0.12, C.orange);
        this.audio.shieldBreak();
        this.floatText(x, y - 20, 'BASS DROP', { color: C.orange, size: 13 });
      }
    }

    killEnemy(e, opts = {}) {
      if (!e || e.dead) return;
      e.dead = true;
      this.run.kills += 1;
      this.run.score += Math.round(e.score * (1 + Math.min(this.run.combo, COMBO_CAP) * 0.01));
      const elite = e.elite;
      this.burst(e.x, e.y, elite ? C.gold : e.baseColor, elite ? 30 : 16, {
        speed: [40, elite ? 320 : 240], life: [0.2, 0.8], size: [1, elite ? 3.8 : 2.8], glow: true, drag: 2.5
      });
      this.ring(e.x, e.y, elite ? C.gold : e.baseColor, 6, e.r * 3.5, 0.4);
      this.addShake(elite ? 4 : 2);
      this.audio.kill();

      if (e.type === 'splitter') {
        for (let i = 0; i < 2; i++) {
          const a = U.rand(0, TAU);
          this.spawnEnemy('shard', e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, { silent: true });
        }
      }

      const dropChance = (elite ? 0.38 : 0.042) + (this.stats.dropMul - 1) * 0.02;
      if (Math.random() < dropChance) this.spawnPickup(e.x, e.y);

      if (this.stats.reaperCount > 0) {
        const target = this.nearestTarget(e.x, e.y, 520);
        const aim = target ? Math.atan2(target.y - e.y, target.x - e.x) : U.rand(0, TAU);
        for (let i = 0; i < this.stats.reaperCount; i++) {
          const a = aim + (i - (this.stats.reaperCount - 1) / 2) * 0.3;
          this.spawnPlayerBulletFrom(e.x, e.y, a, BASE_DAMAGE * this.stats.damageMul * this.stats.reaperDamage, {
            quality: 'good', homing: 7, speed: 620, life: 1.8, small: true
          });
        }
      }
    }

    spawnPlayerBulletFrom(x, y, angle, damage, opts = {}) {
      const speed = opts.speed || 800;
      this.playerBullets.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: opts.small ? 2.4 : 3.4,
        damage,
        quality: opts.quality || 'good',
        perfect: false,
        crit: false,
        pierce: 0,
        bounces: 0,
        homing: opts.homing || 0,
        hitIds: new Set(),
        hitBoss: false,
        life: opts.life || 1.4,
        maxLife: opts.life || 1.4,
        echo: true,
        angle
      });
    }

    cleanupEnemies() {
      if (!this.enemies.length) return;
      let any = false;
      for (const e of this.enemies) if (e.dead) { any = true; break; }
      if (any) this.enemies = this.enemies.filter((e) => !e.dead);
    }

    clearEnemyBulletsInRadius(x, y, radius) {
      let count = 0;
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        const bu = this.enemyBullets[i];
        if (U.dist2(bu.x, bu.y, x, y) < radius * radius) {
          this.burst(bu.x, bu.y, C.gold, 2, { speed: [20, 90], life: [0.1, 0.25], size: [0.8, 1.8], glow: true });
          this.enemyBullets.splice(i, 1);
          count++;
        }
      }
      if (count > 6) this.run.score += count * 3;
      return count;
    }

    clearEnemyBullets(withEffect = false) {
      if (withEffect) {
        for (const bu of this.enemyBullets) {
          if (Math.random() < 0.3) {
            this.particles.push({ x: bu.x, y: bu.y, vx: U.rand(-40, 40), vy: U.rand(-40, 40), life: 0.35, maxLife: 0.35, size: 1.4, color: C.cyanSoft, glow: true, drag: 2, shape: 'dot' });
          }
        }
      }
      this.enemyBullets = [];
    }

    // ── boss ────────────────────────────────────────────────
    spawnBoss(key) {
      const def = PR.BOSSES[key];
      if (!def) return;
      const wave = this.run.wave;
      const scale = wave > 10 ? 1 + (wave - 10) * 0.3 : 1;
      const elite = wave > 10;
      const hp = def.hp * scale * (elite ? 1.3 : 1);
      const b = this.audio.beat();
      const intro = b;
      const introEnd = b + 8;
      this.boss = {
        uid: 1,
        key,
        name: elite ? def.name + ' Ω' : def.name,
        cn: def.cn,
        subtitle: def.subtitle,
        color: def.color,
        accent: def.accent,
        x: W / 2,
        y: -100,
        r: def.r,
        hp,
        maxHp: hp,
        active: false,
        invuln: true,
        phase: 1,
        introStart: intro,
        introEnd,
        hitFlash: 0,
        angle: 0,
        seed: U.rand(0, 10),
        ringAngle: U.rand(0, TAU),
        spiralAngle: U.rand(0, TAU),
        nextRing: introEnd + 1,
        nextAim: introEnd + 2,
        nextBeam: introEnd + 6,
        nextSpiral: introEnd + 2,
        nextWall: introEnd + 6,
        nextSummon: introEnd + 12,
        sats: [
          { angle: 0, offset: 0, nextFire: introEnd + 2 },
          { angle: Math.PI, offset: Math.PI, nextFire: introEnd + 4 }
        ],
        telegraph: 99,
        phaseFlash: 0,
        elite
      };
      this.bossDeathPos = null;
      this._bossPhaseAnnounced = 1;
    }

    updateBoss(dt) {
      const boss = this.boss;
      if (!boss) return;
      const b = this.beatNow;
      boss.hitFlash = Math.max(0, boss.hitFlash - dt * 4);
      boss.phaseFlash = Math.max(0, boss.phaseFlash - dt * 2);
      boss.angle += dt * 0.35;

      if (!boss.active) {
        const t = U.clamp((b - boss.introStart) / 8, 0, 1);
        const ease = U.easeOutCubic(t);
        boss.y = U.lerp(-110, 175, ease);
        boss.x = W / 2 + Math.sin(b * 0.5) * 90 * ease;
        if (b >= boss.introEnd) {
          boss.active = true;
          boss.invuln = false;
          this.addShake(10);
          this.flashScreen(0.22, boss.color);
          this.ring(boss.x, boss.y, boss.accent, 30, 420, 1.1);
          this.audio.syncReady();
        }
        // satellites orbit visually
        for (const s of boss.sats) {
          s.angle += dt * 0.9;
        }
        return;
      }

      const targetX = W / 2 + Math.sin(b * 0.31 + boss.seed) * (boss.key === 'maestro' ? 220 : 280);
      const targetY = 175 + Math.sin(b * 0.62 + boss.seed) * 32;
      boss.x = U.damp(boss.x, targetX, 1.8, dt);
      boss.y = U.damp(boss.y, targetY, 1.8, dt);

      const ratio = boss.hp / boss.maxHp;
      const newPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      if (newPhase > boss.phase) {
        boss.phase = newPhase;
        boss.phaseFlash = 1;
        this.addShake(14);
        this.flashScreen(0.25, boss.color);
        this.clearEnemyBullets(true);
        this.ring(boss.x, boss.y, boss.accent, 24, 360, 0.9);
        this.burst(boss.x, boss.y, boss.accent, 36, { speed: [80, 360], life: [0.3, 1], size: [1.5, 4], glow: true });
        this.spawnPickup(boss.x, boss.y + boss.r + 24);
        this.floatText(boss.x, boss.y - boss.r - 26, newPhase === 2 ? 'PHASE II' : 'FINAL PHASE', { color: boss.accent, size: 18 });
        this.audio.syncReady();
      }

      // satellite orbs
      for (const s of boss.sats) {
        s.angle += dt * (boss.phase === 3 ? 1.6 : 1.1) * (boss.key === 'maestro' ? 1 : 0.6);
        if (b >= s.nextFire && boss.key === 'maestro') {
          const sx = boss.x + Math.cos(s.angle) * (boss.r + 56);
          const sy = boss.y + Math.sin(s.angle) * (boss.r + 56);
          const aim = Math.atan2(this.player.y - sy, this.player.x - sx);
          for (let i = 0; i < 2; i++) {
            this.fireEnemyBullet(sx, sy, aim + (i - 0.5) * 0.16, 205, { color: C.enemyFast, damage: this.enemyBulletDamage(), r: 5, glow: 1.2 });
          }
          s.nextFire += boss.phase >= 2 ? 3 : 4;
        }
      }

      if (boss.key === 'ostinato') {
        this.updateOstinato(boss, b);
      } else {
        this.updateMaestro(boss, b);
      }

      // contact
      if (this.player && !this.player.dead) {
        const rr = boss.r * 0.7 + PLAYER_HIT_R + 4;
        if (U.dist2(boss.x, boss.y, this.player.x, this.player.y) < rr * rr) {
          this.hurtPlayer(boss.contact);
        }
      }
    }

    updateOstinato(boss, b) {
      boss.telegraph = Math.min(boss.nextRing, boss.nextAim, boss.nextBeam) - b;
      if (b >= boss.nextRing) {
        this.bossRing(boss, boss.phase === 3 ? 5 : 6);
        boss.nextRing += boss.phase === 3 ? 4 : 6;
      }
      if (b >= boss.nextAim) {
        const aim = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
        const n = boss.phase >= 2 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          this.fireEnemyBullet(boss.x, boss.y, aim + (i - (n - 1) / 2) * 0.15, 235 + boss.phase * 12, { color: C.enemyFast, damage: this.enemyBulletDamage() + 1, r: 5.5, glow: 1.3 });
        }
        boss.nextAim += boss.phase === 3 ? 2 : 3;
      }
      if (boss.phase >= 2 && b >= boss.nextBeam) {
        const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
        for (let i = 0; i < 2; i++) {
          this.beams.push({
            x: boss.x, y: boss.y,
            angle: base + (i === 0 ? -0.55 : 0.55),
            rotate: (i === 0 ? 0.38 : -0.38) * (boss.phase === 3 ? 1.4 : 1),
            width: 15,
            damage: this.enemyBulletDamage() + 3,
            activeStart: b + 2,
            activeEnd: b + 3,
            lifeEnd: b + 3.5,
            color: C.laser,
            followBoss: true,
            charge: 2
          });
        }
        this.floatText(boss.x, boss.y + boss.r + 20, 'SWEEP', { color: C.laser, size: 10 });
        boss.nextBeam += boss.phase === 3 ? 8 : 11;
      }
      if (boss.phase >= 3 && b >= boss.nextSpiral) {
        const arms = 3;
        for (let i = 0; i < arms; i++) {
          const a = boss.spiralAngle + (i / arms) * TAU;
          this.fireEnemyBullet(boss.x, boss.y, a, 150, { color: C.enemy, damage: this.enemyBulletDamage(), r: 6 });
        }
        boss.spiralAngle += 0.31;
        boss.nextSpiral += 1;
      }
    }

    bossRing(boss, interval) {
      const n = 20 + boss.phase * 3;
      const speed = 128 + boss.phase * 22;
      const gap = boss.ringAngle;
      const gapHalf = boss.phase === 3 ? 0.28 : 0.34;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        if (Math.abs(U.angleDiff(a, gap)) < gapHalf || Math.abs(U.angleDiff(a, gap + Math.PI)) < gapHalf * 0.8) continue;
        this.fireEnemyBullet(boss.x, boss.y, a, speed, { color: C.enemy, damage: this.enemyBulletDamage(), r: 6.5 });
      }
      boss.ringAngle += 0.62;
      this.ring(boss.x, boss.y, boss.color, 12, boss.r + 80, 0.3);
    }

    updateMaestro(boss, b) {
      boss.telegraph = Math.min(boss.nextSpiral, boss.nextWall, boss.nextBeam, boss.nextSummon) - b;
      if (b >= boss.nextSpiral) {
        const arms = boss.phase === 3 ? 5 : boss.phase === 2 ? 4 : 3;
        for (let i = 0; i < arms; i++) {
          const a = boss.spiralAngle + (i / arms) * TAU;
          this.fireEnemyBullet(boss.x, boss.y, a, 150 + boss.phase * 16, { color: C.enemy, damage: this.enemyBulletDamage(), r: 6 });
        }
        boss.spiralAngle += boss.phase === 3 ? 0.27 : 0.22;
        boss.nextSpiral += boss.phase === 3 ? 0.5 : 1;
      }
      if (b >= boss.nextWall) {
        this.bossWall(boss);
        if (boss.phase === 3) this.bossWall(boss, true);
        boss.nextWall += boss.phase === 3 ? 6 : boss.phase === 2 ? 7 : 8;
      }
      if (b >= boss.nextBeam && boss.phase >= 2) {
        const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
        for (let i = 0; i < 2; i++) {
          this.beams.push({
            x: boss.x, y: boss.y,
            angle: base + Math.PI / 2 + (i === 0 ? 0 : Math.PI),
            rotate: 0.42,
            width: 16,
            damage: this.enemyBulletDamage() + 3,
            activeStart: b + 2,
            activeEnd: b + 3,
            lifeEnd: b + 3.5,
            color: C.laser,
            followBoss: true,
            charge: 2
          });
        }
        boss.nextBeam += 10;
      }
      if (b >= boss.nextSummon) {
        if (this.enemies.length < 5) {
          for (let i = 0; i < 2; i++) {
            const type = U.chance(0.5) ? 'drone' : 'sniper';
            const a = U.rand(0, TAU);
            const e = this.spawnEnemy(type, boss.x + Math.cos(a) * 120, boss.y + Math.sin(a) * 100, { silent: true });
            if (e) {
              this.ring(e.x, e.y, C.gold, 7, 50, 0.4);
              this.burst(e.x, e.y, C.gold, 12, { speed: [30, 160], life: [0.2, 0.5], size: [1, 2.5], glow: true });
            }
          }
        }
        boss.nextSummon += boss.phase === 3 ? 9 : 12;
      }
    }

    bossWall(boss, fromBottom = false) {
      const gapX = U.rand(230, W - 230);
      const gapW = boss.phase === 3 ? 150 : 178;
      const y = fromBottom ? H + 24 : -24;
      const dir = fromBottom ? -Math.PI / 2 : Math.PI / 2;
      const count = 28;
      for (let i = 0; i < count; i++) {
        const x = 20 + (i / (count - 1)) * (W - 40);
        if (Math.abs(x - gapX) < gapW / 2) continue;
        this.fireEnemyBullet(x, y, dir, 118 + boss.phase * 10, { color: C.enemy, damage: this.enemyBulletDamage(), r: 7, life: 12 });
      }
      this.ring(gapX, fromBottom ? H - 4 : 4, C.gold, 4, 90, 0.3);
    }

    updateBeams(dt) {
      const b = this.beatNow;
      for (let i = this.beams.length - 1; i >= 0; i--) {
        const bm = this.beams[i];
        bm.angle += bm.rotate * dt;
        if (bm.followBoss && this.boss) {
          bm.x = this.boss.x;
          bm.y = this.boss.y;
        }
        if (b >= bm.activeStart && b < bm.activeEnd && this.player && !this.player.dead) {
          const ex = bm.x + Math.cos(bm.angle) * 2000;
          const ey = bm.y + Math.sin(bm.angle) * 2000;
          const d = U.pointSegDist(this.player.x, this.player.y, bm.x, bm.y, ex, ey);
          if (d < bm.width * 0.5 + PLAYER_HIT_R) {
            this.hurtPlayer(bm.damage);
          }
          if (Math.random() < 0.6) {
            const t = U.clamp(U.rand(0.1, 1), 0, 1);
            this.particles.push({
              x: bm.x + Math.cos(bm.angle) * 1000 * t,
              y: bm.y + Math.sin(bm.angle) * 1000 * t,
              vx: U.rand(-30, 30), vy: U.rand(-30, 30),
              life: 0.2, maxLife: 0.2, size: 1.5, color: bm.color, glow: true, drag: 1, shape: 'dot'
            });
          }
        }
        if (b >= bm.lifeEnd) this.beams.splice(i, 1);
      }
    }

    damageBoss(damage, opts = {}) {
      const boss = this.boss;
      if (!boss || !boss.active || boss.invuln) return;
      boss.hp -= damage;
      boss.hitFlash = 0.12;
      this.run.damageDealt += damage;
      this.run.score += Math.round(damage * 0.5);
      if (boss.hp <= 0) {
        boss.hp = 0;
        this.killBoss();
      }
    }

    killBoss() {
      const boss = this.boss;
      if (!boss) return;
      const pos = { x: boss.x, y: boss.y };
      this.bossDeathPos = pos;
      const final = (this.run.wave === 10 && !this.run.endless);
      this.boss = null;
      if (this.run) this.run.kills += 1;
      this.audio.crash(this.audio.ctx ? this.audio.ctx.currentTime : 0, 1.2);
      this.addShake(26);
      this.flashScreen(0.55, C.white);
      this.hitstop = 0.16;
      this.burst(pos.x, pos.y, boss.color, 80, { speed: [60, 520], life: [0.4, 1.6], size: [1.5, 5.5], glow: true });
      this.burst(pos.x, pos.y, boss.accent, 50, { speed: [60, 420], life: [0.3, 1.2], size: [1.2, 4], glow: true });
      for (let i = 0; i < 4; i++) this.ring(pos.x, pos.y, i % 2 ? boss.accent : boss.color, 20 + i * 12, 200 + i * 120, 0.7 + i * 0.15);
      this.clearEnemyBullets(true);
      this.beams = [];
      this.queuedShots = [];
      this.enemyBulletSlowUntil = 0;

      for (const e of this.enemies) {
        if (!e.dead) {
          e.dead = true;
          this.burst(e.x, e.y, C.orange, 12, { speed: [40, 200], life: [0.2, 0.6], size: [1, 2.8], glow: true });
        }
      }
      this.enemies = [];
      this.run.score += final ? 20000 : 5000;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);

      if (final) {
        this.state = 'victoryPending';
        this.victoryTimer = 3.0;
        this.victoryBurstTimer = 0;
        this.audio.setMode('victory');
        this.banner = null;
        this.ui.hideToast();
      } else {
        this.onWaveClear();
      }
    }

    // ── pickups & effects ───────────────────────────────────
    spawnPickup(x, y) {
      if (this.pickups.length >= 6) return;
      this.pickups.push({
        x, y,
        vx: U.rand(-40, 40),
        vy: U.rand(-40, 40),
        life: 15,
        phase: U.rand(0, TAU),
        heal: 12
      });
    }

    updatePickups(dt) {
      const p = this.player;
      if (!p) return;
      const magnetR = 85 * this.stats.magnetMul;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pk = this.pickups[i];
        pk.life -= dt;
        const d = U.dist(pk.x, pk.y, p.x, p.y);
        if (d < magnetR || this.state === 'waveclear') {
          const a = Math.atan2(p.y - pk.y, p.x - pk.x);
          const pull = this.state === 'waveclear' ? 900 : U.lerp(300, 900, 1 - U.clamp(d / magnetR, 0, 1));
          pk.vx += Math.cos(a) * pull * dt;
          pk.vy += Math.sin(a) * pull * dt;
        }
        pk.vx *= Math.exp(-1.8 * dt);
        pk.vy *= Math.exp(-1.8 * dt);
        pk.x += pk.vx * dt;
        pk.y += pk.vy * dt;
        pk.x = U.clamp(pk.x, 20, W - 20);
        pk.y = U.clamp(pk.y, 20, H - 20);
        if (d < 24 || (this.state === 'waveclear' && d < 40)) {
          const healed = Math.min(pk.heal, p.maxHp - p.hp);
          p.hp += healed;
          this.run.score += 25;
          this.audio.pickup();
          this.floatText(p.x, p.y - 38, '+' + (healed || pk.heal) + ' HP', { color: C.green, size: 12 });
          this.ring(pk.x, pk.y, C.green, 4, 50, 0.4);
          this.pickups.splice(i, 1);
          continue;
        }
        if (pk.life <= 0) this.pickups.splice(i, 1);
      }
    }

    burst(x, y, color, count, opts = {}) {
      const max = 700;
      const speed = opts.speed || [40, 240];
      const life = opts.life || [0.2, 0.6];
      const size = opts.size || [1, 2.8];
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= max) break;
        const a = U.rand(0, TAU);
        const sp = U.rand(speed[0], speed[1]);
        const lf = U.rand(life[0], life[1]);
        this.particles.push({
          x: x + U.rand(-3, 3),
          y: y + U.rand(-3, 3),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: lf,
          maxLife: lf,
          size: U.rand(size[0], size[1]),
          color,
          glow: !!opts.glow,
          drag: opts.drag ?? 2.5,
          gravity: opts.gravity || 0,
          shape: opts.shape || 'dot',
          angle: U.rand(0, TAU),
          spin: U.rand(-8, 8)
        });
      }
    }

    ring(x, y, color, width, radius, life) {
      if (this.rings.length > 50) this.rings.shift();
      this.rings.push({ x, y, color, width, radius, life, maxLife: life, t: 0 });
    }

    floatText(x, y, text, opts = {}) {
      if (this.floaters.length > 40) this.floaters.shift();
      this.floaters.push({
        x, y, text,
        color: opts.color || C.ink,
        size: opts.size || 12,
        life: opts.life || 0.85,
        maxLife: opts.life || 0.85,
        vy: opts.vy ?? -34
      });
    }

    addShake(v) {
      this.shake = Math.min(30, this.shake + v * (this.settings.shake / 100));
    }

    flashScreen(a, color) {
      if (!this.settings.flashes) return;
      this.flash = Math.min(0.75, Math.max(this.flash, a));
      this.flashColor = color || '#ffffff';
    }

    updateEffects(dt) {
      this.shake *= Math.exp(-7.5 * dt);
      if (this.shake < 0.05) this.shake = 0;
      this.flash *= Math.exp(-6.5 * dt);
      if (this.flash < 0.005) this.flash = 0;
      this.hurtVignette = Math.max(0, this.hurtVignette - dt * 1.4);
      this.comboPulse = Math.max(0, this.comboPulse - dt * 4);
      this.afterimages = this.afterimages.filter((a) => { a.life -= dt; return a.life > 0; });

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        const dr = Math.exp(-(p.drag || 0) * dt);
        p.vx *= dr;
        p.vy *= dr;
        p.vy += (p.gravity || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.spin) p.angle += p.spin * dt;
      }
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.t += dt;
        if (r.t >= r.life) this.rings.splice(i, 1);
      }
      for (let i = this.floaters.length - 1; i >= 0; i--) {
        const f = this.floaters[i];
        f.life -= dt;
        f.y += f.vy * dt;
        f.vy *= Math.exp(-2 * dt);
        if (f.life <= 0) this.floaters.splice(i, 1);
      }
    }

    emitDashParticles() {
      const p = this.player;
      this.particles.push({
        x: p.x + U.rand(-8, 8), y: p.y + U.rand(-8, 8),
        vx: -p.dashDirX * U.rand(20, 90), vy: -p.dashDirY * U.rand(20, 90),
        life: 0.28, maxLife: 0.28, size: U.rand(1.5, 3),
        color: p.dashPerfect ? C.gold : C.cyan, glow: true, drag: 2, shape: 'spark', angle: Math.atan2(p.dashDirY, p.dashDirX), spin: 0
      });
    }

    spawnBurstAtPlayer() {
      if (!this.player) return;
      this.ring(this.player.x, this.player.y, C.cyan, 10, 70, 0.5);
      this.burst(this.player.x, this.player.y, C.cyan, 14, { speed: [30, 170], life: [0.2, 0.5], size: [1, 2.5], glow: true });
    }

    updateTutorial() {
      if (!this.run || this.run.wave !== 1) return;
      const elapsed = (this.beatNow - this.run.wave1StartBeat) * PR.BEAT_DURATION;
      const list = PR.TUTORIAL;
      while (this.run.tutorialIndex < list.length && elapsed >= list[this.run.tutorialIndex].at) {
        this.ui.toast(list[this.run.tutorialIndex].text, 4600);
        this.run.tutorialIndex++;
      }
    }

    refreshBestUI() {
      this.ui.updateBest(this.best);
    }

    // ── debug helpers ───────────────────────────────────────
    async debugStart(wave = 1) {
      await this.ensureAudio();
      this.state = 'interlude';
      this.ui.closeModal();
      this.ui.hideAllScreens();
      this.ui.setPlaying(true);
      this.resetRun();
      this.ui.beginRun();
      this.audio.setMode('run');
      this.startWave(wave);
    }

    debugSetGod(on = true) { this.godMode = !!on; }
    debugKillAll() {
      for (const e of this.enemies) this.killEnemy(e);
      this.enemies = [];
    }
    debugAddUpgrade(id, n = 1) {
      if (!PR.UPGRADE_BY_ID[id] || !this.run) return;
      this.run.counts[id] = (this.run.counts[id] || 0) + n;
      this.recomputeStats();
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
      this.audio.setTracks(this.getTracks());
    }
    debugSpawnBoss(key = 'maestro') {
      if (!this.run) return;
      this.debugKillAll();
      this.boss = null;
      this.plan = { boss: key };
      this.spawnBoss(key);
      this.audio.setMode('boss');
      this.state = 'playing';
    }
  }

  function OFF_BEAT_LABEL() {
    return 'OFF-BEAT';
  }

  PR.Game = Game;

  function boot() {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    new PR.Game(canvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window.PR = window.PR || {});
