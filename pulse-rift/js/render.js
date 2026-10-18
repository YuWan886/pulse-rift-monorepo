/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — renderer
   Everything is drawn procedurally. Glow sprites are pre-baked.
   ═══════════════════════════════════════════════════════════════ */
(function (PR) {
  'use strict';
  const U = PR.U;
  const C = PR.C;
  const W = 1280;
  const H = 720;
  const TAU = U.TAU;

  const FONT_D = '"Orbitron", "Chakra Petch", "Microsoft YaHei", sans-serif';
  const FONT_U = '"Chakra Petch", "Microsoft YaHei", "PingFang SC", sans-serif';

  function font(size, weight = 600, family = FONT_D) {
    return `${weight} ${size}px ${family}`;
  }

  function text(ctx, str, x, y, size, color, opts = {}) {
    ctx.save();
    ctx.font = font(size, opts.weight ?? 600, opts.family || FONT_D);
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'alphabetic';
    if (opts.spacing) ctx.letterSpacing = opts.spacing;
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.fillStyle = color;
    if (opts.glow) {
      ctx.shadowColor = opts.glowColor || color;
      ctx.shadowBlur = opts.glow;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function cutPath(ctx, x, y, w, h, cut = 10) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
  }

  function poly(ctx, pts, close = true) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }

  function diamond(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  }

  function hex(ctx, r, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function arc(ctx, x, y, r, a0, a1) {
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1);
  }

  const Render = {
    frame(g) {
      const ctx = g.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#020107';
      ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);

      const { dpr, scale, ox, oy } = g.view;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      ctx.save();
      const shakeAmt = g.shake * (g.settings.shake / 100);
      if (shakeAmt > 0.2) ctx.translate(U.rand(-shakeAmt, shakeAmt), U.rand(-shakeAmt, shakeAmt));

      this.background(g);

      if (g.state === 'title') {
        this.titleScene(g);
        ctx.restore();
        this.overlays(g);
        if (g.debugMode) this.debug(g);
        return;
      }

      this.portals(g);
      this.pickups(g);
      this.beamWarnings(g);
      this.enemies(g);
      this.boss(g);
      this.afterimages(g);
      this.player(g);
      this.playerBullets(g);
      this.enemyBullets(g);
      this.beamActive(g);
      this.particles(g);
      this.rings(g);
      this.bossDeathCore(g);
      this.floaters(g);
      this.judgement(g);
      ctx.restore();

      const showHud = ['playing', 'interlude', 'waveclear', 'paused', 'dying', 'victoryPending'].includes(g.state);
      if (showHud) {
        this.hud(g);
        this.banners(g);
        if (g.state === 'interlude') this.interludeOverlay(g);
        if (g.state === 'victoryPending') this.victoryCinematic(g);
        if (g.state === 'dying') this.dyingOverlay(g);
      }
      if (['playing', 'interlude', 'waveclear'].includes(g.state) && g.player) this.reticle(g);
      this.overlays(g);
      if (g.debugMode) this.debug(g);
    },

    // ══════════════════════════ BACKGROUND ══════════════════════
    background(g) {
      const ctx = g.ctx;
      const sector = g.sector || PR.SECTORS[0];
      const phase = U.mod(g.beatNow, 1);
      const pulse = Math.pow(1 - phase, 2.2);

      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, sector.bg);
      grd.addColorStop(0.55, '#04010c');
      grd.addColorStop(1, '#020008');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      const rg = ctx.createRadialGradient(W / 2, H * 0.52, 20, W / 2, H * 0.52, 640);
      rg.addColorStop(0, U.withAlpha(sector.accent, 0.06 + pulse * 0.05));
      rg.addColorStop(0.45, U.withAlpha(sector.tint, 0.035 + pulse * 0.025));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);

      // slow drifting nebula masses for depth
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n1 = ctx.createRadialGradient(
        W * 0.22 + Math.sin(g.animTime * 0.035) * 90,
        H * 0.32 + Math.cos(g.animTime * 0.028) * 60,
        0,
        W * 0.22 + Math.sin(g.animTime * 0.035) * 90,
        H * 0.32 + Math.cos(g.animTime * 0.028) * 60,
        460
      );
      n1.addColorStop(0, U.withAlpha(sector.accent, 0.032));
      n1.addColorStop(0.55, U.withAlpha(sector.accent, 0.012));
      n1.addColorStop(1, 'transparent');
      ctx.fillStyle = n1;
      ctx.fillRect(0, 0, W, H);
      const n2 = ctx.createRadialGradient(
        W * 0.8 + Math.cos(g.animTime * 0.03) * 100,
        H * 0.68 + Math.sin(g.animTime * 0.024) * 70,
        0,
        W * 0.8 + Math.cos(g.animTime * 0.03) * 100,
        H * 0.68 + Math.sin(g.animTime * 0.024) * 70,
        520
      );
      n2.addColorStop(0, U.withAlpha(sector.tint, 0.03));
      n2.addColorStop(0.55, U.withAlpha('#6a2bd0', 0.015));
      n2.addColorStop(1, 'transparent');
      ctx.fillStyle = n2;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // beat rings expanding from center
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const f = U.mod(phase + i / 3, 1);
        const radius = 150 + f * 570;
        const alpha = (1 - f) * 0.078;
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.52, radius, 0, TAU);
        ctx.strokeStyle = U.withAlpha(i % 2 ? sector.accent : sector.tint, alpha);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // dot matrix
      const spacing = 68;
      const offY = U.mod(g.animTime * 5, spacing);
      const offX = Math.sin(g.animTime * 0.1) * 16;
      ctx.fillStyle = U.withAlpha(sector.grid, 0.24 + pulse * 0.17);
      for (let y = -spacing; y < H + spacing; y += spacing) {
        for (let x = -spacing; x < W + spacing; x += spacing) {
          ctx.fillRect(x + offX, y + offY, 1.6, 1.6);
        }
      }

      // sweeping scan bar
      const scanY = U.mod(g.animTime * 36, H + 200) - 100;
      const sg = ctx.createLinearGradient(0, scanY - 70, 0, scanY + 70);
      sg.addColorStop(0, 'transparent');
      sg.addColorStop(0.5, U.withAlpha(sector.tint, 0.03));
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY - 70, W, 140);

      // stars
      for (const s of g.stars) {
        ctx.globalAlpha = s.alpha * (0.7 + pulse * 0.5);
        ctx.fillStyle = '#cfefff';
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
      ctx.globalAlpha = 1;

      // subtle cross beams at edges
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const leftBeam = ctx.createLinearGradient(0, 0, 180, H);
      leftBeam.addColorStop(0, U.withAlpha(sector.tint, 0.035));
      leftBeam.addColorStop(1, 'transparent');
      ctx.fillStyle = leftBeam;
      ctx.fillRect(0, 0, 220, H);
      const rightBeam = ctx.createLinearGradient(W, 0, W - 200, H);
      rightBeam.addColorStop(0, U.withAlpha(sector.accent, 0.028));
      rightBeam.addColorStop(1, 'transparent');
      ctx.fillStyle = rightBeam;
      ctx.fillRect(W - 240, 0, 240, H);
      ctx.restore();

      // equalizer along the bottom, behind the HUD
      this.equalizer(g, sector, pulse);

      // arena frame
      ctx.save();
      ctx.strokeStyle = U.withAlpha(sector.tint, 0.12 + pulse * 0.06);
      ctx.lineWidth = 1;
      ctx.strokeRect(12.5, 12.5, W - 25, H - 25);
      ctx.strokeStyle = U.withAlpha(sector.accent, 0.08);
      ctx.strokeRect(20.5, 20.5, W - 41, H - 41);
      ctx.fillStyle = U.withAlpha(sector.tint, 0.55);
      const b = 30;
      const m = 18;
      const corners = [
        [m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]
      ];
      for (const [x, y, dx, dy] of corners) {
        ctx.fillRect(dx > 0 ? x : x - b, y, b, 1.5);
        ctx.fillRect(x, dy > 0 ? y : y - b, 1.5, b);
      }
      ctx.restore();

      // low life ambience
      if (g.player && g.state === 'playing' && g.player.hp < g.player.maxHp * 0.35) {
        const heart = Math.pow(1 - phase, 4);
        const lr = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.7);
        lr.addColorStop(0, 'transparent');
        lr.addColorStop(1, `rgba(120, 4, 20, ${0.07 + heart * 0.1})`);
        ctx.fillStyle = lr;
        ctx.fillRect(0, 0, W, H);
      }
    },

    equalizer(g, sector, pulse) {
      const ctx = g.ctx;
      const spec = g.audio.spectrum();
      const bars = 48;
      const bw = W / bars;
      const colors = [sector.tint, sector.accent];
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < bars; i++) {
        let v;
        if (spec) {
          const idx = Math.floor((i / bars) * spec.length * 0.72);
          v = spec[idx] / 255;
        } else {
          v = 0.22 + 0.18 * Math.sin(g.animTime * 2.4 + i * 0.35) + 0.12 * Math.sin(g.animTime * 4.1 + i * 0.8);
          v = U.clamp(v, 0.05, 0.7);
        }
        const beatBoost = 0.3 + pulse * 0.7;
        const h = 5 + v * 60 * beatBoost;
        const x = i * bw;
        const col = U.mixColor(colors[0], colors[1], i / bars);
        ctx.fillStyle = U.withAlpha('#ffffff', 0.03);
        ctx.fillRect(x + 2, H - h - 8, bw - 4, h);
        ctx.fillStyle = U.withAlpha(col, 0.3);
        ctx.fillRect(x + 2, H - h - 8, bw - 4, h * 0.55);
        ctx.fillStyle = U.withAlpha('#ffffff', 0.32);
        ctx.fillRect(x + 2, H - h - 8, bw - 4, 1);
      }
      ctx.restore();
    },

    // ══════════════════════════ TITLE ═══════════════════════════
    titleScene(g) {
      const ctx = g.ctx;
      const t = g.titleTime;
      const phase = U.mod(g.beatNow, 1);
      const pulse = Math.pow(1 - phase, 2.5);
      const sector = PR.SECTORS[0];
      const cx = W / 2;
      const cy = H * 0.43;

      // perspective floor
      ctx.save();
      const horizon = H * 0.63;
      const vp = W / 2;
      const floorGrad = ctx.createLinearGradient(0, horizon - 40, 0, H);
      floorGrad.addColorStop(0, 'rgba(30, 6, 44, 0)');
      floorGrad.addColorStop(0.45, U.withAlpha(sector.accent, 0.05));
      floorGrad.addColorStop(1, U.withAlpha(sector.tint, 0.09));
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, horizon - 40, W, H - horizon + 40);
      ctx.lineWidth = 1;
      for (let i = -16; i <= 16; i++) {
        ctx.beginPath();
        ctx.moveTo(vp, horizon);
        ctx.lineTo(vp + i * 110, H + 40);
        ctx.strokeStyle = U.withAlpha(i % 2 ? sector.accent : sector.tint, 0.045);
        ctx.stroke();
      }
      for (let k = 0; k < 16; k++) {
        const f = U.mod(k / 16 + t * 0.022, 1);
        const y = horizon + Math.pow(f, 2.3) * (H - horizon + 60);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.strokeStyle = U.withAlpha(k % 2 ? sector.tint : sector.accent, f * 0.13);
        ctx.stroke();
      }
      ctx.restore();

      // huge orbital rings behind the logo
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const radius = 250 + k * 92 + pulse * (6 + k * 2);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TAU);
        ctx.strokeStyle = U.withAlpha(k % 2 ? sector.accent : sector.tint, 0.055 - k * 0.012);
        ctx.lineWidth = k === 0 ? 1.6 : 1;
        ctx.stroke();
      }
      for (let k = 0; k < 2; k++) {
        const dir = k === 0 ? 1 : -1;
        const rot = t * 0.06 * dir + k * 1.2;
        const radius = 350 + k * 70;
        for (let i = 0; i < 5; i++) {
          const a0 = rot + i * (TAU / 5);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, a0, a0 + 0.42);
          ctx.strokeStyle = U.withAlpha(k ? sector.tint : sector.accent, 0.14);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      // central faint glow
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 330);
      cg.addColorStop(0, U.withAlpha(sector.accent, 0.055 + pulse * 0.035));
      cg.addColorStop(0.6, 'transparent');
      cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // vertical light columns
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, col, a] of [[W * 0.16, sector.tint, 0.035], [W * 0.84, sector.accent, 0.03]]) {
        const lg = ctx.createLinearGradient(x - 80, 0, x + 80, 0);
        lg.addColorStop(0, 'transparent');
        lg.addColorStop(0.5, U.withAlpha(col, a + pulse * 0.015));
        lg.addColorStop(1, 'transparent');
        ctx.fillStyle = lg;
        ctx.fillRect(x - 80, 0, 160, H);
      }
      ctx.restore();

      // floating glyphs
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const speed = 7 + (i % 4) * 3;
        const x = U.mod(i * 197 + t * speed, W + 160) - 80;
        const y = H * 0.24 + Math.sin(t * 0.22 + i * 1.7) * 180 + (i % 3) * 38;
        const alpha = 0.045 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.5 + i));
        ctx.font = font(14 + (i % 3) * 7, 500, FONT_D);
        ctx.fillStyle = U.withAlpha(i % 3 === 0 ? sector.accent : sector.tint, alpha);
        ctx.fillText(i % 2 ? '♪' : '♫', x, y);
      }
      ctx.restore();

      // occasional glitch strip
      if (Math.sin(t * 0.9) > 0.985) {
        const gy = U.rand(H * 0.15, H * 0.8);
        ctx.fillStyle = U.withAlpha(sector.tint, 0.07);
        ctx.fillRect(0, gy, W, U.rand(1, 3));
        ctx.fillStyle = U.withAlpha(sector.accent, 0.05);
        ctx.fillRect(0, gy + 4, W, 1);
      }

      // horizon line
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const hgrad = ctx.createLinearGradient(0, 0, W, 0);
      hgrad.addColorStop(0, 'transparent');
      hgrad.addColorStop(0.2, U.withAlpha(sector.tint, 0.32));
      hgrad.addColorStop(0.5, U.withAlpha('#ffffff', 0.36 + pulse * 0.2));
      hgrad.addColorStop(0.8, U.withAlpha(sector.accent, 0.32));
      hgrad.addColorStop(1, 'transparent');
      ctx.fillStyle = hgrad;
      ctx.fillRect(0, horizon - 0.5, W, 1.2);
      ctx.restore();
    },

    // ══════════════════════════ WORLD ═══════════════════════════
    portals(g) {
      if (!g.spawnQueue || !g.spawnQueue.length) return;
      const ctx = g.ctx;
      const b = g.beatNow;
      for (let i = 0; i < g.spawnQueue.length; i++) {
        const entry = g.spawnQueue[i];
        const d = entry.beat - b;
        if (d < 0 || d > 1.15) continue;
        const p = 1 - U.clamp(d / 1.15, 0, 1);
        const color = entry.elite ? C.gold : (PR.ENEMIES[entry.type]?.color || C.magenta);
        const r = 34 - p * 12;
        ctx.save();
        ctx.translate(entry.x, entry.y);
        ctx.rotate(g.animTime * 1.4 + i);
        ctx.strokeStyle = U.withAlpha(color, 0.25 + p * 0.55);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, r + 8, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = U.withAlpha(color, 0.4 + p * 0.5);
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(0, 0, r + k * 4, k * 2.1, k * 2.1 + 0.75);
          ctx.stroke();
        }
        ctx.rotate(-(g.animTime * 1.4 + i) * 2);
        diamond(ctx, 7 + p * 3);
        ctx.fillStyle = U.withAlpha(color, 0.25 + p * 0.6);
        ctx.fill();
        ctx.strokeStyle = U.withAlpha('#ffffff', 0.35 + p * 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        U.drawGlow(ctx, color, 0, 0, 55 + p * 25, 0.18 + p * 0.3);
        ctx.restore();
      }
    },

    pickups(g) {
      const ctx = g.ctx;
      for (const pk of g.pickups) {
        const bob = Math.sin(g.animTime * 3 + pk.phase) * 4;
        const fade = pk.life < 2 ? Math.max(0.2, pk.life / 2) : 1;
        ctx.save();
        ctx.translate(pk.x, pk.y + bob);
        U.drawGlow(ctx, C.green, 0, 0, 34, 0.35 * fade);
        ctx.rotate(g.animTime * 1.2 + pk.phase);
        diamond(ctx, 11);
        ctx.fillStyle = 'rgba(4, 22, 14, 0.86)';
        ctx.fill();
        ctx.strokeStyle = U.withAlpha(C.green, 0.8 * fade);
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.rotate(-(g.animTime * 1.2 + pk.phase));
        ctx.fillStyle = U.withAlpha(C.green, 0.9 * fade);
        ctx.fillRect(-1.5, -6, 3, 12);
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.restore();
      }
    },

    enemies(g) {
      const ctx = g.ctx;
      for (const e of g.enemies) {
        if (e.dead) continue;
        this.drawEnemyTelegraph(g, e);
        this.drawEnemy(g, e);
      }
    },

    drawEnemyTelegraph(g, e) {
      const ctx = g.ctx;
      const b = g.beatNow;
      if (e.charging && (e.type === 'sniper' || e.type === 'stinger')) {
        const len = 1500;
        const alpha = 0.1 + 0.35 * (1 - U.clamp(e.nextFireBeat - b, 0, 1)) + 0.08 * Math.sin(g.animTime * 20);
        ctx.save();
        ctx.setLineDash([7, 9]);
        ctx.lineDashOffset = -g.animTime * 60;
        ctx.strokeStyle = U.withAlpha(e.type === 'sniper' ? C.enemyFast : C.gold, alpha);
        ctx.lineWidth = e.type === 'sniper' ? 1.3 : 1;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.lockedAngle) * len, e.y + Math.sin(e.lockedAngle) * len);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        U.drawGlow(ctx, e.type === 'sniper' ? C.enemyFast : C.gold, e.x + Math.cos(e.lockedAngle) * e.r, e.y + Math.sin(e.lockedAngle) * e.r, 24, 0.25);
      }
    },

    drawEnemy(g, e) {
      const ctx = g.ctx;
      const b = g.beatNow;
      const def = PR.ENEMIES[e.type];
      const spawnP = U.clamp(1 - e.spawnT / 0.45, 0, 1);
      const scale = e.spawnT > 0 ? U.lerp(1.5, 1, U.easeOutBack(spawnP)) : 1;
      const hit = e.hitFlash > 0;
      const charge = e.nextFireBeat !== undefined ? U.clamp(1 - (e.nextFireBeat - b), 0, 1) : 0;
      let strokeColor = hit ? '#ffffff' : e.color;
      let fillColor = hit ? U.withAlpha('#ffffff', 0.24) : U.withAlpha(e.color, 0.1);

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(scale, scale);
      U.drawGlow(ctx, e.color, 0, 0, e.r * (2.2 + charge * 0.55), 0.16 + charge * 0.22 + (e.elite ? 0.1 : 0));

      if (e.elite) {
        ctx.save();
        ctx.rotate(g.animTime * 0.8);
        ctx.strokeStyle = U.withAlpha(C.gold, 0.5);
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 8, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.lineWidth = 2;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;

      switch (e.type) {
        case 'drone': {
          ctx.save();
          ctx.rotate(e.angle + b * 0.8);
          diamond(ctx, e.r);
          ctx.fill();
          ctx.stroke();
          ctx.rotate(- (e.angle + b * 0.8) * 2);
          poly(ctx, [[0, -e.r * 0.52], [e.r * 0.5, e.r * 0.3], [-e.r * 0.5, e.r * 0.3]]);
          ctx.strokeStyle = U.withAlpha('#ffffff', 0.55);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(0, 0, e.r * (0.24 + charge * 0.12), 0, TAU);
          ctx.fillStyle = U.withAlpha(charge > 0.7 ? C.gold : e.color, 0.9);
          ctx.fill();
          break;
        }
        case 'weaver': {
          const flap = Math.sin(b * Math.PI + e.phase) * 0.35;
          ctx.save();
          ctx.rotate(e.angle + Math.PI / 2);
          for (const side of [-1, 1]) {
            ctx.save();
            ctx.rotate(side * (0.6 + flap));
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(e.r * 0.9, -e.r * 0.35, e.r * 1.5, 0);
            ctx.quadraticCurveTo(e.r * 0.8, e.r * 0.5, 0, 0);
            ctx.fillStyle = U.withAlpha(e.color, 0.16);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.36, 0, TAU);
          ctx.fillStyle = U.withAlpha(e.color, 0.4);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'orbiter': {
          ctx.save();
          ctx.rotate(e.angle + b * 0.4);
          for (let k = 0; k < 2; k++) {
            ctx.beginPath();
            ctx.arc(0, 0, e.r * (0.6 + k * 0.32), k * 1.8, k * 1.8 + 3.2);
            ctx.strokeStyle = U.withAlpha(e.color, 0.7 - k * 0.2);
            ctx.lineWidth = 2 - k * 0.5;
            ctx.stroke();
          }
          for (let k = 0; k < 4; k++) {
            const a = k * (TAU / 4) + b * 0.8;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * e.r * 0.92, Math.sin(a) * e.r * 0.92, 2.2, 0, TAU);
            ctx.fillStyle = U.withAlpha(e.color, 0.85);
            ctx.fill();
          }
          ctx.restore();
          diamond(ctx, e.r * 0.42);
          ctx.fillStyle = U.withAlpha(e.color, 0.5);
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.stroke();
          break;
        }
        case 'sniper': {
          ctx.save();
          ctx.rotate(e.charging ? e.lockedAngle : e.angle);
          poly(ctx, [[e.r * 1.5, 0], [-e.r * 0.4, -e.r * 0.55], [-e.r * 0.95, 0], [-e.r * 0.4, e.r * 0.55]]);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.4, 0);
          ctx.lineTo(e.r * 0.9, 0);
          ctx.strokeStyle = U.withAlpha(C.enemyFast, 0.55 + charge * 0.4);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.22, 0, TAU);
          ctx.fillStyle = U.withAlpha(charge > 0.7 ? C.gold : C.enemyFast, 0.95);
          ctx.fill();
          break;
        }
        case 'brute': {
          ctx.save();
          ctx.rotate(e.angle * 0.4 + b * 0.15);
          hex(ctx, e.r);
          ctx.fillStyle = U.withAlpha(e.color, 0.13);
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 3;
          ctx.stroke();
          hex(ctx, e.r * 0.72);
          ctx.strokeStyle = U.withAlpha(e.color, 0.45);
          ctx.lineWidth = 1.4;
          ctx.stroke();
          for (let k = 0; k < 3; k++) {
            const a = -0.5 + k * 1.0;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * e.r * 0.5, Math.sin(a) * e.r * 0.5);
            ctx.lineTo(Math.cos(a) * e.r * 0.9, Math.sin(a) * e.r * 0.9);
            ctx.strokeStyle = U.withAlpha('#ffdbe1', 0.2);
            ctx.stroke();
          }
          ctx.restore();
          ctx.beginPath();
          ctx.arc(0, e.r * 0.05, e.r * 0.2, 0, TAU);
          ctx.fillStyle = U.withAlpha(charge > 0.8 ? C.gold : e.color, 0.9);
          ctx.fill();
          break;
        }
        case 'splitter': {
          ctx.save();
          ctx.rotate(e.angle + Math.sin(b * 1.2 + e.phase) * 0.3);
          ctx.beginPath();
          const points = 9;
          for (let k = 0; k < points; k++) {
            const a = (k / points) * TAU;
            const rr = e.r * (0.78 + 0.2 * Math.sin(k * 2.7 + g.animTime * 3));
            if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = U.withAlpha(e.color, 0.4);
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.4, 0);
          ctx.lineTo(e.r * 0.4, 0);
          ctx.stroke();
          for (let k = -1; k <= 1; k += 2) {
            ctx.beginPath();
            ctx.arc(k * e.r * 0.3, 0, e.r * 0.18, 0, TAU);
            ctx.fillStyle = U.withAlpha('#ffffff', 0.28);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case 'shard': {
          const a = Math.atan2(e.vy, e.vx);
          ctx.save();
          ctx.rotate(a);
          poly(ctx, [[e.r * 1.5, 0], [-e.r, -e.r * 0.65], [-e.r * 0.35, 0], [-e.r, e.r * 0.65]]);
          ctx.fillStyle = U.withAlpha(e.color, 0.3);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'prism': {
          ctx.save();
          ctx.rotate(e.angle * 0.3 + b * 0.2);
          poly(ctx, [[0, -e.r * 1.3], [e.r * 0.7, -e.r * 0.2], [0, e.r * 1.05], [-e.r * 0.7, -e.r * 0.2]]);
          ctx.fillStyle = U.withAlpha(e.color, 0.14);
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -e.r * 1.15);
          ctx.lineTo(0, e.r * 0.9);
          ctx.strokeStyle = U.withAlpha('#ffffff', 0.2);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.55, -e.r * 0.1);
          ctx.lineTo(e.r * 0.55, -e.r * 0.1);
          ctx.stroke();
          ctx.restore();
          const orbit = b * 1.4;
          ctx.beginPath();
          ctx.arc(Math.cos(orbit) * (e.r + 8), Math.sin(orbit) * (e.r + 8), 2.5, 0, TAU);
          ctx.fillStyle = U.withAlpha(e.color, 0.8);
          ctx.fill();
          break;
        }
        case 'stinger': {
          const look = e.charging ? e.lockedAngle : e.angle;
          ctx.save();
          ctx.rotate(look);
          poly(ctx, [[e.r * 1.8, 0], [-e.r * 0.2, -e.r * 0.7], [-e.r * 1, -e.r * 0.2], [-e.r * 0.7, 0], [-e.r * 1, e.r * 0.2], [-e.r * 0.2, e.r * 0.7]]);
          ctx.fillStyle = U.withAlpha(e.color, 0.2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-e.r * 0.7, 0);
          ctx.lineTo(e.r * 1.2, 0);
          ctx.strokeStyle = U.withAlpha(C.gold, 0.4 + charge * 0.4);
          ctx.stroke();
          if (e.lungeTime > 0) {
            for (let k = 1; k <= 3; k++) {
              ctx.beginPath();
              ctx.moveTo(-e.r * (1 + k * 0.9), 0);
              ctx.lineTo(-e.r * (1.5 + k * 0.9), 0);
              ctx.strokeStyle = U.withAlpha(C.gold, 0.2 / k);
              ctx.stroke();
            }
          }
          ctx.restore();
          break;
        }
      }

      // incoming attack marker
      if (e.nextFireBeat !== undefined && charge > 0.6 && e.type !== 'sniper' && e.type !== 'stinger' && e.type !== 'prism') {
        ctx.save();
        ctx.rotate(g.animTime * 2);
        ctx.strokeStyle = U.withAlpha(C.enemyFast, (charge - 0.6) * 1.2);
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 7, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      ctx.restore();

      // health bar (world aligned)
      if (e.hp < e.maxHp || e.elite) {
        const w = Math.max(28, e.r * 2);
        const hx = e.x - w / 2;
        const hy = e.y - e.r - (e.elite ? 19 : 12);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(hx, hy, w, 3);
        ctx.fillStyle = e.elite ? C.gold : U.withAlpha(e.color, 0.8);
        ctx.fillRect(hx, hy, w * U.clamp(e.hp / e.maxHp, 0, 1), 3);
      }
    },

    boss(g) {
      const boss = g.boss;
      if (!boss) return;
      const ctx = g.ctx;
      const b = g.beatNow;
      const introT = U.clamp((b - boss.introStart) / 8, 0, 1);
      const alpha = U.clamp(introT * 1.4, 0, 1);
      const hit = boss.hitFlash > 0;
      const phase = boss.phase;
      const pulse = 0.5 + 0.5 * Math.sin(g.animTime * 4);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(boss.x, boss.y);

      // warp beam during intro
      if (!boss.active) {
        const bg = ctx.createLinearGradient(0, -boss.y - 120, 0, 0);
        bg.addColorStop(0, U.withAlpha(boss.color, 0));
        bg.addColorStop(1, U.withAlpha(boss.accent, 0.15));
        ctx.fillStyle = bg;
        ctx.fillRect(-boss.r * 0.4, -boss.y - 120, boss.r * 0.8, boss.y + 120);
      }

      U.drawGlow(ctx, boss.color, 0, 0, boss.r * (3.4 + pulse * 0.2), 0.26 + (phase === 3 ? 0.1 : 0));
      U.drawGlow(ctx, boss.accent, 0, 0, boss.r * 1.6, 0.12);

      if (boss.key === 'ostinato') {
        this.drawOstinato(ctx, g, boss, hit, phase, pulse, introT);
      } else {
        this.drawMaestro(ctx, g, boss, hit, phase, pulse, introT);
      }
      ctx.restore();

      // boss subtitle under body
      if (!boss.active) {
        ctx.save();
        ctx.globalAlpha = introT;
        text(ctx, 'SIGNAL FORMING', boss.x, boss.y + boss.r + 26, 9, U.withAlpha(boss.accent, 0.7), { align: 'center', spacing: '3px' });
        ctx.restore();
      }
    },

    drawOstinato(ctx, g, boss, hit, phase, pulse, introT) {
      const r = boss.r;
      const rot = g.animTime * 0.4 + boss.seed;
      const main = hit ? '#ffffff' : boss.color;
      const accent = hit ? '#ffffff' : boss.accent;

      ctx.save();
      ctx.rotate(rot);
      // outer dashed rings
      for (let k = 0; k < 3; k++) {
        const rr = r * (1.36 - k * 0.18);
        const dir = k % 2 === 0 ? 1 : -1;
        ctx.save();
        ctx.rotate(dir * g.animTime * (0.25 + k * 0.1));
        ctx.setLineDash([rr * 0.5, rr * 0.22]);
        ctx.lineDashOffset = g.animTime * 24 * dir;
        ctx.strokeStyle = U.withAlpha(k === 1 ? accent : main, 0.3 - k * 0.05);
        ctx.lineWidth = 3 - k * 0.7;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // spokes / blade nodes
      const spokes = 6 + phase;
      for (let i = 0; i < spokes; i++) {
        const a = rot * 0.4 + (i / spokes) * TAU;
        const inner = r * 0.7;
        const outer = r * 1.18;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
        ctx.strokeStyle = U.withAlpha(main, 0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(Math.cos(a) * outer, Math.sin(a) * outer, 4 + (i % 2) * 2, 0, TAU);
        ctx.fillStyle = U.withAlpha(accent, 0.55);
        ctx.fill();
      }
      ctx.restore();

      // body
      ctx.save();
      ctx.rotate(-rot * 0.25);
      hex(ctx, r * 0.78, Math.PI / 6);
      ctx.fillStyle = 'rgba(20, 3, 14, 0.88)';
      ctx.fill();
      ctx.strokeStyle = main;
      ctx.lineWidth = 3;
      ctx.stroke();
      hex(ctx, r * 0.52, Math.PI / 6);
      ctx.strokeStyle = U.withAlpha(accent, 0.5);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // inner segments
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28);
        ctx.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
        ctx.strokeStyle = U.withAlpha(main, 0.4);
        ctx.stroke();
      }
      ctx.restore();

      // eye
      const eyePulse = 0.85 + 0.15 * Math.sin(g.animTime * 3.4);
      const eg = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 0.48);
      eg.addColorStop(0, U.withAlpha('#ffffff', 0.95));
      eg.addColorStop(0.25, U.withAlpha(accent, 0.95));
      eg.addColorStop(0.6, U.withAlpha(main, 0.55));
      eg.addColorStop(1, 'transparent');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45 * eyePulse, 0, TAU);
      ctx.fill();
      ctx.fillStyle = U.withAlpha('#07000a', 0.85);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.055, r * 0.25, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = U.withAlpha('#ffffff', 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.31, g.animTime, g.animTime + 2.4);
      ctx.stroke();

      // phase 2+ halo orbs
      if (phase >= 2) {
        const n = phase === 3 ? 8 : 5;
        for (let i = 0; i < n; i++) {
          const a = -g.animTime * 0.7 + (i / n) * TAU;
          const rr = r * 1.55;
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr;
          U.drawGlow(ctx, accent, x, y, 18, 0.35);
          ctx.beginPath();
          ctx.arc(x, y, 3.5, 0, TAU);
          ctx.fillStyle = U.withAlpha('#ffffff', 0.8);
          ctx.fill();
        }
      }

      // attack telegraph
      if (boss.active && boss.telegraph < 0.65) {
        const p = 1 - U.clamp(boss.telegraph / 0.65, 0, 1);
        ctx.strokeStyle = U.withAlpha(C.laser, 0.25 + p * 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.7 - p * 0.3), 0, TAU);
        ctx.stroke();
      }

      // shield during intro
      if (!boss.active) {
        ctx.save();
        ctx.rotate(g.animTime * 0.5);
        ctx.strokeStyle = U.withAlpha(boss.accent, 0.4 + introT * 0.3);
        ctx.setLineDash([6, 10]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.55, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (hit) {
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },

    drawMaestro(ctx, g, boss, hit, phase, pulse, introT) {
      const r = boss.r;
      const main = hit ? '#ffffff' : boss.color;
      const accent = hit ? '#ffffff' : boss.accent;
      const rot = g.animTime * 0.3 + boss.seed;

      // connecting energy to satellites
      for (const s of boss.sats) {
        const sx = Math.cos(s.angle) * (r + 58);
        const sy = Math.sin(s.angle) * (r + 58);
        ctx.save();
        ctx.setLineDash([5, 8]);
        ctx.lineDashOffset = -g.animTime * 40;
        ctx.strokeStyle = U.withAlpha(accent, 0.28 + phase * 0.06);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(sx * 0.5 + Math.sin(g.animTime + s.angle) * 14, sy * 0.5, sx, sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // central spire
      ctx.save();
      ctx.rotate(rot * 0.4);
      poly(ctx, [[0, -r * 1.25], [r * 0.62, -r * 0.18], [r * 0.4, r * 0.9], [0, r * 1.16], [-r * 0.4, r * 0.9], [-r * 0.62, -r * 0.18]]);
      ctx.fillStyle = 'rgba(13, 3, 18, 0.9)';
      ctx.fill();
      ctx.strokeStyle = main;
      ctx.lineWidth = 3;
      ctx.stroke();
      poly(ctx, [[0, -r * 0.94], [r * 0.36, -r * 0.08], [0, r * 0.75], [-r * 0.36, -r * 0.08]]);
      ctx.strokeStyle = U.withAlpha(accent, 0.5);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // crown rays
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.32;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5 - r * 0.6);
        ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85 - r * 0.6);
        ctx.strokeStyle = U.withAlpha(accent, 0.35);
        ctx.stroke();
      }
      ctx.restore();

      // rotating rings
      ctx.save();
      ctx.rotate(-g.animTime * 0.25);
      ctx.setLineDash([r * 0.6, r * 0.2]);
      ctx.strokeStyle = U.withAlpha(main, 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = U.withAlpha(accent, 0.35);
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * TAU;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.4, a0, a0 + 0.8);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.restore();

      // eye
      const eg = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.3);
      eg.addColorStop(0, U.withAlpha('#ffffff', 0.98));
      eg.addColorStop(0.4, U.withAlpha(accent, 0.92));
      eg.addColorStop(1, 'transparent');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = U.withAlpha('#060008', 0.8);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.045, r * 0.17, 0, 0, TAU);
      ctx.fill();

      // satellites
      for (const s of boss.sats) {
        const sx = Math.cos(s.angle) * (r + 58);
        const sy = Math.sin(s.angle) * (r + 58);
        U.drawGlow(ctx, accent, sx, sy, 32, 0.3);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-s.angle * 2);
        diamond(ctx, r * 0.19);
        ctx.fillStyle = 'rgba(20, 8, 4, 0.85)';
        ctx.fill();
        ctx.strokeStyle = main;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 2.4, 0, TAU);
        ctx.fillStyle = U.withAlpha(accent, 0.9);
        ctx.fill();
        ctx.restore();
      }

      // phase 3 crown
      if (phase === 3) {
        ctx.save();
        ctx.rotate(g.animTime * 0.6);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.9);
          ctx.lineTo(Math.cos(a + 0.1) * r * 1.55, Math.sin(a + 0.1) * r * 1.3);
          ctx.strokeStyle = U.withAlpha(C.laser, 0.3);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        ctx.restore();
      }

      // telegraph
      if (boss.active && boss.telegraph < 0.65) {
        const p = 1 - U.clamp(boss.telegraph / 0.65, 0, 1);
        ctx.strokeStyle = U.withAlpha(C.laser, 0.25 + p * 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.8 - p * 0.3), 0, TAU);
        ctx.stroke();
      }

      if (!boss.active) {
        ctx.save();
        ctx.rotate(g.animTime * 0.4);
        ctx.strokeStyle = U.withAlpha(accent, 0.4 + introT * 0.25);
        ctx.setLineDash([5, 9]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (hit) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },

    // ══════════════════════════ PLAYER ══════════════════════════
    afterimages(g) {
      const ctx = g.ctx;
      for (const a of g.afterimages) {
        ctx.save();
        ctx.globalAlpha = (a.life / a.maxLife) * 0.22;
        ctx.translate(a.x, a.y);
        ctx.rotate(a.angle);
        ctx.strokeStyle = a.perfect ? C.gold : C.cyan;
        ctx.lineWidth = 1.3;
        this.shipPath(ctx, 0.85);
        ctx.stroke();
        ctx.restore();
      }
    },

    shipPath(ctx, scale = 1) {
      ctx.beginPath();
      ctx.moveTo(20 * scale, 0);
      ctx.lineTo(4 * scale, -6 * scale);
      ctx.lineTo(-6 * scale, -13 * scale);
      ctx.lineTo(-13 * scale, -5 * scale);
      ctx.lineTo(-8 * scale, 0);
      ctx.lineTo(-13 * scale, 5 * scale);
      ctx.lineTo(-6 * scale, 13 * scale);
      ctx.lineTo(4 * scale, 6 * scale);
      ctx.closePath();
    },

    player(g) {
      const p = g.player;
      if (!p || p.dead) return;
      const ctx = g.ctx;
      const b = g.beatNow;
      const phase = U.mod(b, 1);
      const beatPulse = Math.pow(1 - phase, 2);
      const blink = p.invuln > 0 && Math.floor(g.animTime * 18) % 2 === 0;
      const alpha = blink ? 0.45 : 1;

      ctx.save();
      ctx.translate(p.x, p.y);

      // aim tether
      const aim = p.aimAngle;
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(Math.cos(aim) * 22, Math.sin(aim) * 22);
      ctx.lineTo(g.mouse.x - p.x, g.mouse.y - p.y);
      ctx.stroke();
      ctx.restore();

      // under-ring sync indicator
      const syncAngle = g.run.overdrive
        ? TAU * U.clamp((g.run.overdriveEndBeat - b) / Math.max(1, (g.run.overdriveEndBeat - (g.run.overdriveStartBeat || 0))), 0, 1)
        : TAU * (g.run.sync / 100);
      const syncColor = g.run.overdrive || g.run.sync >= 99.9 ? C.gold : C.cyan;
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = U.withAlpha(syncColor, 0.55);
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, 25 + beatPulse * 2, -Math.PI / 2, -Math.PI / 2 + syncAngle);
      ctx.stroke();
      ctx.strokeStyle = U.withAlpha('#ffffff', 0.1);
      ctx.beginPath();
      ctx.arc(0, 0, 25 + beatPulse * 2, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // shield ring
      if (p.shield > 0) {
        ctx.save();
        ctx.rotate(g.animTime * 0.8);
        ctx.strokeStyle = U.withAlpha(C.shield, 0.55);
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, 22, i * (TAU / 3), i * (TAU / 3) + 0.9);
          ctx.stroke();
        }
        ctx.restore();
      }

      U.drawGlow(ctx, g.run.overdrive ? C.gold : C.player, 0, 0, 50 + beatPulse * 10, 0.5 * alpha);
      U.drawGlow(ctx, '#ffffff', 0, 0, 16, 0.14 * alpha);

      // engine flame
      const flick = 0.7 + 0.3 * Math.sin(g.animTime * 40) + beatPulse * 0.3;
      ctx.save();
      ctx.rotate(aim);
      const flame = ctx.createLinearGradient(-12, 0, -32, 0);
      flame.addColorStop(0, U.withAlpha(C.cyanSoft, 0.75));
      flame.addColorStop(0.5, U.withAlpha(C.cyan, 0.35));
      flame.addColorStop(1, 'transparent');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-11, -4);
      ctx.lineTo(-24 - 8 * flick, 0);
      ctx.lineTo(-11, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = U.withAlpha(g.run.overdrive ? C.gold : C.cyanSoft, 0.8);
      ctx.beginPath();
      ctx.moveTo(-10, -2);
      ctx.lineTo(-18 - 6 * flick, 0);
      ctx.lineTo(-10, 2);
      ctx.closePath();
      ctx.fill();

      // hull
      ctx.globalAlpha = alpha;
      this.shipPath(ctx);
      ctx.fillStyle = 'rgba(4, 25, 34, 0.96)';
      ctx.fill();
      ctx.strokeStyle = g.run.overdrive ? C.gold : C.cyan;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.2 + beatPulse * 0.12;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.8;
      this.shipPath(ctx, 1.08);
      ctx.stroke();
      ctx.restore();

      // inner accents
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-3, -4.5);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-3, 4.5);
      ctx.closePath();
      ctx.fillStyle = U.withAlpha(g.run.overdrive ? C.gold : C.cyan, 0.26);
      ctx.fill();
      ctx.strokeStyle = U.withAlpha('#ffffff', 0.45);
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-5, -10);
      ctx.lineTo(-10, -4);
      ctx.moveTo(-5, 10);
      ctx.lineTo(-10, 4);
      ctx.strokeStyle = U.withAlpha(C.magenta, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // cockpit
      ctx.beginPath();
      ctx.arc(5, 0, 2.6, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, 0, 4.4, 0, TAU);
      ctx.strokeStyle = U.withAlpha(C.cyanSoft, 0.5);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // true hitbox marker
      ctx.beginPath();
      ctx.arc(0, 0, 2.1, 0, TAU);
      ctx.fillStyle = 'rgba(5, 18, 24, 0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 1.15, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // overshield
      if (p.shield > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.2 * beatPulse;
        ctx.strokeStyle = U.withAlpha(C.shield, 0.7);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    },

    playerBullets(g) {
      const ctx = g.ctx;
      if (!g.playerBullets.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const bu of g.playerBullets) {
        const isGold = bu.perfect || bu.crit;
        const spr = U.glowSprite(isGold ? C.gold : C.cyan);
        const rr = (bu.r + 2) * 6;
        ctx.globalAlpha = bu.echo ? 0.3 : (isGold ? 0.7 : 0.6);
        ctx.drawImage(spr, bu.x - rr, bu.y - rr, rr * 2, rr * 2);
      }
      ctx.restore();

      ctx.save();
      ctx.lineCap = 'round';
      for (const bu of g.playerBullets) {
        const isGold = bu.perfect || bu.crit;
        const sp = Math.hypot(bu.vx, bu.vy) || 1;
        const tx = bu.x - (bu.vx / sp) * (bu.crit ? 22 : 15);
        const ty = bu.y - (bu.vy / sp) * (bu.crit ? 22 : 15);
        ctx.globalAlpha = bu.echo ? 0.5 : 0.95;
        ctx.strokeStyle = isGold ? C.gold : C.cyanSoft;
        ctx.lineWidth = bu.r * 1.5;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(bu.x, bu.y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = Math.max(1, bu.r * 0.65);
        ctx.beginPath();
        ctx.moveTo(tx + (bu.x - tx) * 0.4, ty + (bu.y - ty) * 0.4);
        ctx.lineTo(bu.x, bu.y);
        ctx.stroke();
      }
      ctx.restore();
    },

    enemyBullets(g) {
      const ctx = g.ctx;
      if (!g.enemyBullets.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowScale = g.enemyBullets.length > 220 ? 0.8 : 1;
      for (const bu of g.enemyBullets) {
        const spr = U.glowSprite(bu.color);
        const rr = bu.r * (5.2 + bu.glow) * glowScale;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(spr, bu.x - rr, bu.y - rr, rr * 2, rr * 2);
      }
      ctx.restore();

      ctx.save();
      for (const bu of g.enemyBullets) {
        const sp = Math.hypot(bu.vx, bu.vy) || 1;
        const tx = bu.x - (bu.vx / sp) * (bu.r * 2.2);
        const ty = bu.y - (bu.vy / sp) * (bu.r * 2.2);
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = bu.color;
        ctx.lineWidth = bu.r * 1.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(bu.x, bu.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (bu.shape === 'diamond') {
          ctx.save();
          ctx.translate(bu.x, bu.y);
          ctx.rotate(g.animTime * 3);
          diamond(ctx, bu.r);
          ctx.fillStyle = '#fff6fa';
          ctx.fill();
          ctx.strokeStyle = bu.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(bu.x, bu.y, bu.r * 0.82, 0, TAU);
          ctx.fillStyle = '#fff2f8';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bu.x, bu.y, bu.r, 0, TAU);
          ctx.strokeStyle = U.withAlpha(bu.color, 0.85);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
      ctx.restore();
    },

    beamWarnings(g) {
      if (!g.beams.length) return;
      const ctx = g.ctx;
      const b = g.beatNow;
      for (const bm of g.beams) {
        if (b >= bm.activeStart) continue;
        const chargeStart = bm.activeStart - (bm.charge || 2);
        const p = U.clamp((b - chargeStart) / Math.max(0.1, bm.activeStart - chargeStart), 0, 1);
        const len = 1600;
        const ex = bm.x + Math.cos(bm.angle) * len;
        const ey = bm.y + Math.sin(bm.angle) * len;
        ctx.save();
        ctx.setLineDash([8, 10]);
        ctx.lineDashOffset = -g.animTime * 80;
        ctx.strokeStyle = U.withAlpha(C.laser, 0.12 + p * 0.35);
        ctx.lineWidth = 1.2 + p * 1.6;
        ctx.beginPath();
        ctx.moveTo(bm.x, bm.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.25 + p * 0.35;
        U.drawGlow(ctx, C.laser, bm.x, bm.y, 26, 0.4 + p * 0.3);
        const t = 0.6;
        ctx.beginPath();
        ctx.arc(bm.x + Math.cos(bm.angle) * 500, bm.y + Math.sin(bm.angle) * 500, 4 + p * 3, 0, TAU);
        ctx.fillStyle = U.withAlpha(C.laser, 0.6);
        ctx.fill();
        ctx.restore();
      }
    },

    beamActive(g) {
      if (!g.beams.length) return;
      const ctx = g.ctx;
      const b = g.beatNow;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const bm of g.beams) {
        if (b < bm.activeStart || b >= bm.activeEnd) continue;
        const len = 1900;
        const ex = bm.x + Math.cos(bm.angle) * len;
        const ey = bm.y + Math.sin(bm.angle) * len;
        const flick = 0.8 + 0.2 * Math.sin(g.animTime * 45 + bm.angle * 3);
        ctx.strokeStyle = U.withAlpha(bm.color, 0.28 * flick);
        ctx.lineWidth = bm.width * 2.4;
        ctx.beginPath();
        ctx.moveTo(bm.x, bm.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = U.withAlpha(bm.color, 0.6 * flick);
        ctx.lineWidth = bm.width;
        ctx.beginPath();
        ctx.moveTo(bm.x, bm.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = U.withAlpha('#ffffff', 0.95 * flick);
        ctx.lineWidth = Math.max(2, bm.width * 0.24);
        ctx.beginPath();
        ctx.moveTo(bm.x, bm.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        U.drawGlow(ctx, bm.color, bm.x, bm.y, bm.width * 4.5, 0.55);
        U.drawGlow(ctx, '#ffffff', bm.x, bm.y, bm.width * 1.8, 0.5);
      }
      ctx.restore();
    },

    particles(g) {
      const ctx = g.ctx;
      if (!g.particles.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of g.particles) {
        const t = p.life / p.maxLife;
        const alpha = U.clamp(t, 0, 1);
        const size = p.size * (0.55 + 0.45 * t);
        if (p.glow) {
          const spr = U.glowSprite(p.color);
          ctx.globalAlpha = alpha * 0.7;
          ctx.drawImage(spr, p.x - size * 5, p.y - size * 5, size * 10, size * 10);
        }
        if (p.shape === 'spark') {
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(0.7, size * 0.6);
          const dx = Math.cos(p.angle || 0) * size * 3;
          const dy = Math.sin(p.angle || 0) * size * 3;
          ctx.beginPath();
          ctx.moveTo(p.x - dx, p.y - dy);
          ctx.lineTo(p.x + dx, p.y + dy);
          ctx.stroke();
        } else if (p.shape !== 'note') {
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
        }
      }
      ctx.restore();

      // notes and other unlit particles
      ctx.save();
      for (const p of g.particles) {
        if (p.shape !== 'note') continue;
        const t = p.life / p.maxLife;
        ctx.globalAlpha = U.clamp(t, 0, 1) * 0.8;
        ctx.font = font(Math.round(p.size * 1.3), 600, FONT_D);
        ctx.fillStyle = p.color;
        ctx.textAlign = 'center';
        ctx.fillText(p.char || '♪', p.x, p.y);
      }
      ctx.restore();
    },

    rings(g) {
      const ctx = g.ctx;
      if (!g.rings.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const r of g.rings) {
        const t = U.clamp(r.t / r.life, 0, 1);
        const radius = U.lerp(r.radius === undefined ? 10 : r.width, r.radius, U.easeOutCubic(t));
        const alpha = (1 - t) * 0.7;
        ctx.strokeStyle = U.withAlpha(r.color, alpha);
        ctx.lineWidth = Math.max(1, (1 - t) * 3);
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },

    bossDeathCore(g) {
      if (g.state !== 'victoryPending' || !g.bossDeathPos) return;
      const ctx = g.ctx;
      const pos = g.bossDeathPos;
      const p = 1 - U.clamp(g.victoryTimer / 3, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const pul = 0.5 + 0.5 * Math.sin(g.animTime * 14);
      U.drawGlow(ctx, C.gold, pos.x, pos.y, 80 + p * 90, 0.6 * (1 - p * 0.5));
      U.drawGlow(ctx, C.white, pos.x, pos.y, 24 + pul * 12, 0.9);
      ctx.strokeStyle = U.withAlpha(C.gold, 0.5 * (1 - p));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 40 + p * 300, 0, TAU);
      ctx.stroke();
      ctx.restore();
    },

    floaters(g) {
      const ctx = g.ctx;
      for (const f of g.floaters) {
        const t = f.life / f.maxLife;
        text(ctx, f.text, f.x, f.y, f.size, f.color, {
          align: 'center',
          weight: 700,
          alpha: U.clamp(t * 1.2, 0, 1),
          spacing: '1px'
        });
      }
    },

    judgement(g) {
      if (!g.judgement) return;
      const age = g.animTime - g.judgement.time;
      if (age < 0 || age > 0.6 || !g.player) return;
      const j = g.judgement;
      const ctx = g.ctx;
      const p = g.player;
      const t = age / 0.6;
      const alpha = 1 - t;
      const pop = 1 + 0.35 * Math.pow(1 - Math.min(1, age / 0.12), 2);
      const labels = { perfect: 'PERFECT', good: 'GOOD', off: 'OFF-BEAT' };
      let label = labels[j.quality] || '';
      if (j.dash) label = 'PHASE';
      const colors = { perfect: C.gold, good: C.cyan, off: C.red };
      const color = colors[j.quality] || C.ink;

      ctx.save();
      ctx.translate(p.x, p.y - 54 - age * 30);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = font(j.dash ? 15 : 17, 800, FONT_D);
      ctx.letterSpacing = j.dash ? '3px' : '2px';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillText(label, 0, 0);
      ctx.shadowBlur = 0;
      if (!j.dash) {
        const offMs = Math.round(j.offset * 500);
        const side = Math.abs(offMs) < 12 ? 'LOCKED' : (offMs > 0 ? 'LATE' : 'EARLY');
        ctx.font = font(8, 500, FONT_D);
        ctx.letterSpacing = '2px';
        ctx.globalAlpha = alpha * 0.62;
        ctx.fillStyle = U.withAlpha(color, 0.9);
        ctx.fillText(`${side} ${offMs >= 0 ? '+' : ''}${offMs}ms`, 0, 13);
      }
      ctx.restore();
    },

    // ══════════════════════════ HUD ═════════════════════════════
    hud(g) {
      const ctx = g.ctx;
      if (!g.run || !g.player) return;
      const run = g.run;
      const p = g.player;
      const displayWave = g.state === 'interlude' ? g.pendingWave : Math.max(1, run.wave);
      const sector = PR.sectorFor(displayWave);
      const phase = U.mod(g.beatNow, 1);
      const pulse = Math.pow(1 - phase, 2);
      const ratio = U.clamp(p.hp / p.maxHp, 0, 1);
      const hpColor = ratio > 0.55 ? C.cyan : ratio > 0.28 ? C.gold : C.red;

      // ── top-left integrity panel
      const px = 24, py = 24, pw = 320, ph = 94;
      ctx.save();
      cutPath(ctx, px, py, pw, ph, 12);
      ctx.fillStyle = 'rgba(3, 8, 16, 0.55)';
      ctx.fill();
      ctx.strokeStyle = U.withAlpha(sector.tint, 0.16);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      text(ctx, 'INTEGRITY // 生命', px + 18, py + 23, 8, U.withAlpha(sector.tint, 0.55), { spacing: '2px' });
      text(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, px + pw - 18, py + 24, 13, U.withAlpha('#ffffff', 0.85), { align: 'right', family: FONT_U, weight: 700 });

      const bx = px + 18;
      const by = py + 33;
      const bw = pw - 36;
      const bh = 10;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(bx, by, bw, bh);
      const segs = 24;
      const gap = 2;
      const segW = (bw - gap * (segs - 1)) / segs;
      for (let i = 0; i < segs; i++) {
        const filled = i / segs < ratio;
        const x = bx + i * (segW + gap);
        ctx.fillStyle = filled ? U.withAlpha(hpColor, 0.7 + 0.3 * pulse) : 'rgba(255,255,255,0.045)';
        ctx.fillRect(x, by, segW, bh);
      }
      ctx.save();
      ctx.strokeStyle = U.withAlpha(hpColor, 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 1.5, by - 1.5, bw + 3, bh + 3);
      ctx.restore();

      // shields
      for (let i = 0; i < p.maxShield; i++) {
        const sx = bx + 4 + i * 15;
        const sy = by + bh + 12;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = i < p.shield ? U.withAlpha(C.shield, 0.9) : 'rgba(255,255,255,0.08)';
        ctx.fillRect(-3.5, -3.5, 7, 7);
        if (i < p.shield) U.drawGlow(ctx, C.shield, 0, 0, 12, 0.4);
        ctx.restore();
      }

      text(ctx, `WAVE ${U.padNum(displayWave)}`, px + 18, py + 78, 16, '#f0fdff', { spacing: '1.5px', family: FONT_U, weight: 700 });
      text(ctx, `${sector.name} · ${sector.cn}`, px + pw - 18, py + 78, 8, U.withAlpha(sector.accent, 0.62), { align: 'right', family: FONT_U, spacing: '1px' });

      // ── top-right score panel
      const rw = 282;
      const rx = W - 24 - rw;
      const ry = 24;
      const rh = 112;
      ctx.save();
      cutPath(ctx, rx, ry, rw, rh, 12);
      ctx.fillStyle = 'rgba(3, 8, 16, 0.55)';
      ctx.fill();
      ctx.strokeStyle = U.withAlpha(sector.tint, 0.14);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      text(ctx, 'SCORE', rx + rw - 18, ry + 23, 8, U.withAlpha(sector.tint, 0.78), { align: 'right', spacing: '2px' });
      text(ctx, U.formatScore(run.score), rx + rw - 18, ry + 50, 27, '#f2feff', { align: 'right', spacing: '1px', family: FONT_U, weight: 700 });

      text(ctx, 'COMBO', rx + rw - 18, ry + 73, 8, U.withAlpha(C.gold, 0.8), { align: 'right', spacing: '2px' });
      const comboScale = 1 + g.comboPulse * 0.18;
      const comboColor = run.combo > 0 ? C.gold : 'rgba(255,255,255,0.18)';
      const comboTxt = String(run.combo);
      ctx.save();
      ctx.font = font(34, 700, FONT_U);
      const comboNumW = ctx.measureText(comboTxt).width * comboScale;
      ctx.restore();
      ctx.save();
      ctx.translate(rx + rw - 18, ry + 102);
      ctx.scale(comboScale, comboScale);
      ctx.textAlign = 'right';
      ctx.font = font(34, 700, FONT_U);
      ctx.letterSpacing = '1px';
      ctx.fillStyle = comboColor;
      if (run.combo > 0) { ctx.shadowColor = C.gold; ctx.shadowBlur = 16; }
      ctx.fillText(comboTxt, 0, 0);
      ctx.restore();
      const mult = 1 + Math.min(run.combo, 100) * 0.01;
      text(ctx, `×${mult.toFixed(2)}`, rx + rw - 30 - comboNumW, ry + 101, 10, U.withAlpha(run.combo > 0 ? C.cyan : 'rgba(255,255,255,0.18)', 0.95), { align: 'right', spacing: '0.5px' });

      // ── hostiles / boss bar
      if (g.boss) {
        this.bossBar(g);
      } else {
        const hostiles = g.spawnQueue.length + g.enemies.length;
        text(ctx, 'HOSTILES', W / 2 - 32, 28, 8, U.withAlpha(sector.tint, 0.45), { align: 'right', spacing: '2px' });
        text(ctx, String(hostiles).padStart(2, '0'), W / 2 + 32, 29, 12, hostiles > 0 ? '#ffffff' : U.withAlpha(C.green, 0.8), { align: 'left', family: FONT_U, weight: 700 });
        ctx.fillStyle = U.withAlpha(sector.tint, 0.18);
        ctx.fillRect(W / 2 - 24, 22, 1, 10);
      }

      // ── bottom-left dash panel
      const dx = 24, dy = H - 88, dw = 190, dh = 62;
      ctx.save();
      cutPath(ctx, dx, dy, dw, dh, 10);
      ctx.fillStyle = 'rgba(3, 8, 16, 0.5)';
      ctx.fill();
      ctx.strokeStyle = U.withAlpha(sector.tint, 0.12);
      ctx.stroke();
      ctx.restore();
      const dashReady = p.dashCd <= 0;
      text(ctx, 'DASH', dx + 16, dy + 23, 8, U.withAlpha(C.cyan, 0.55), { spacing: '2px' });
      text(ctx, dashReady ? 'READY' : 'COOLING', dx + 16, dy + 43, 13, dashReady ? C.cyan : U.withAlpha('#ffffff', 0.4), { spacing: '1px' });
      const dashMax = 1.65 * g.stats.dashCdMul;
      const dashRatio = 1 - U.clamp(p.dashCd / Math.max(0.3, dashMax), 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(dx + 88, dy + 38, dw - 104, 4);
      ctx.fillStyle = U.withAlpha(dashReady ? C.cyan : C.gold, 0.8);
      ctx.fillRect(dx + 88, dy + 38, (dw - 104) * dashRatio, 4);
      text(ctx, 'SPACE', dx + dw - 16, dy + 23, 8, U.withAlpha('#ffffff', 0.3), { align: 'right', spacing: '1px' });

      // ── bottom-right stats
      const sx = W - 24 - 210;
      const sy = H - 88;
      ctx.save();
      cutPath(ctx, sx, sy, 210, 62, 10);
      ctx.fillStyle = 'rgba(3, 8, 16, 0.5)';
      ctx.fill();
      ctx.strokeStyle = U.withAlpha(sector.tint, 0.12);
      ctx.stroke();
      ctx.restore();
      text(ctx, 'GRAZE', sx + 16, sy + 23, 8, U.withAlpha(C.cyanSoft, 0.5), { spacing: '2px' });
      text(ctx, U.padNum(run.grazes, 3), sx + 16, sy + 44, 15, '#eafdff', { family: FONT_U, weight: 700 });
      text(ctx, 'PERFECT', sx + 110, sy + 23, 8, U.withAlpha(C.gold, 0.5), { spacing: '2px' });
      text(ctx, U.padNum(run.perfect, 3), sx + 110, sy + 44, 15, '#fff4d5', { family: FONT_U, weight: 700 });

      // ── sync bar
      const sw = 350;
      const sbx = W / 2 - sw / 2;
      const sby = H - 55;
      const segs2 = 20;
      const sw2 = (sw - (segs2 - 1) * 2) / segs2;
      let syncFrac = run.overdrive
        ? U.clamp(1 - (g.beatNow - (run.overdriveStartBeat ?? 0)) / Math.max(0.1, (run.overdriveEndBeat - (run.overdriveStartBeat ?? 0))), 0, 1)
        : U.clamp(run.sync / 100, 0, 1);
      if (!run.overdrive && run.overdriveEndBeat && g.beatNow < run.overdriveEndBeat) syncFrac = U.clamp(run.sync / 100, 0, 1);
      const ready = run.sync >= 99.9 && !run.overdrive;
      const syncColor = run.overdrive ? C.gold : ready ? C.gold : C.cyan;
      ctx.save();
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < segs2; i++) {
        const filled = i / segs2 < syncFrac;
        ctx.fillStyle = filled ? U.withAlpha(syncColor, 0.88) : 'rgba(255,255,255,0.085)';
        ctx.fillRect(sbx + i * (sw2 + 2), sby, sw2, 8);
      }
      if (ready) {
        U.drawGlow(ctx, C.gold, W / 2, sby + 4, sw * 0.32, 0.09 + pulse * 0.06);
      }
      ctx.restore();
      text(ctx, run.overdrive ? 'OVERDRIVE' : 'SYNC', sbx, sby - 12, 8, U.withAlpha(syncColor, 0.72), { spacing: '2.5px' });
      if (run.overdrive) {
        const rem = Math.max(0, Math.ceil(run.overdriveEndBeat - g.beatNow));
        text(ctx, `OVERDRIVE · ${rem} BEATS`, sbx + sw, sby - 12, 8, C.gold, { align: 'right', spacing: '2px', family: FONT_U, weight: 700 });
      } else if (ready) {
        text(ctx, 'E // OVERDRIVE READY', sbx + sw, sby - 12, 8, C.gold, { align: 'right', spacing: '2px', glow: 8, glowColor: C.gold });
      } else {
        text(ctx, 'PERFECT HITS BUILD SYNC', sbx + sw, sby - 12, 8, U.withAlpha('#ffffff', 0.2), { align: 'right', spacing: '1.5px' });
      }
      // beat diamonds
      const beatInBar = ((Math.floor(Math.max(g.beatNow, 0)) % 4) + 4) % 4;
      for (let i = 0; i < 4; i++) {
        const bx2 = W / 2 - 27 + i * 18;
        const by2 = sby + 22;
        ctx.save();
        ctx.translate(bx2, by2);
        ctx.rotate(Math.PI / 4);
        const active = i === beatInBar;
        ctx.fillStyle = active ? U.withAlpha(i === 0 ? C.gold : C.cyan, 0.9) : 'rgba(255,255,255,0.12)';
        ctx.fillRect(-2.5, -2.5, 5, 5);
        if (active) U.drawGlow(ctx, i === 0 ? C.gold : C.cyan, 0, 0, 12, 0.5);
        ctx.restore();
      }

      // boss warning arrows? skip.

      if (p.hp / p.maxHp < 0.3) {
        const heart = Math.pow(1 - U.mod(g.beatNow, 1), 4);
        text(ctx, 'CRITICAL INTEGRITY', W / 2, H - 104, 8, U.withAlpha(C.red, 0.45 + heart * 0.3), { align: 'center', spacing: '3px' });
      }

      // popup for damage on low hp screen shake handled elsewhere.
      // pause/debug are separate.
    },

    bossBar(g) {
      const boss = g.boss;
      const ctx = g.ctx;
      const w = 540;
      const x = W / 2 - w / 2;
      const y = 24;
      const frac = U.clamp(boss.hp / boss.maxHp, 0, 1);
      const alpha = boss.active ? 1 : U.clamp((g.beatNow - boss.introStart) / 4, 0.25, 1);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(3, 4, 12, 0.62)';
      cutPath(ctx, x - 12, y - 10, w + 24, 54, 10);
      ctx.fill();
      ctx.strokeStyle = U.withAlpha(boss.color, 0.2);
      ctx.stroke();

      ctx.save();
      ctx.font = font(13, 600, FONT_D);
      const bossNameW = ctx.measureText(boss.name).width;
      ctx.restore();
      text(ctx, boss.name, x, y + 8, 13, '#fff1f6', { spacing: '2px' });
      text(ctx, boss.cn, x + bossNameW + 30, y + 8, 8, U.withAlpha(boss.accent, 0.7), { family: FONT_U, spacing: '2px' });
      text(ctx, `PHASE ${boss.phase}`, x + w, y + 8, 8, U.withAlpha(boss.accent, 0.65), { align: 'right', spacing: '2px' });

      const by = y + 19;
      const bh = 9;
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, by, w, bh);
      for (let i = 0; i < 36; i++) {
        const segW = w / 36 - 2;
        const filled = i / 36 < frac;
        ctx.fillStyle = filled ? U.withAlpha(i % 6 === 0 ? boss.accent : boss.color, 0.75) : 'rgba(255,255,255,0.035)';
        ctx.fillRect(x + i * (w / 36), by, segW, bh);
      }
      ctx.strokeStyle = U.withAlpha(boss.color, 0.35);
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1.5, by - 1.5, w + 3, bh + 3);
      // phase notches
      for (const f of [0.33, 0.66]) {
        ctx.fillStyle = U.withAlpha('#ffffff', 0.35);
        ctx.fillRect(x + w * f, by - 2, 1, bh + 4);
      }
      text(ctx, `${Math.ceil(boss.hp)} / ${Math.ceil(boss.maxHp)}`, x + w, by + bh + 14, 9, U.withAlpha('#ffffff', 0.45), { align: 'right', spacing: '1px', family: FONT_U, weight: 600 });
      if (!boss.active) {
        text(ctx, 'SIGNAL FORMING · 信号成型中', x, by + bh + 14, 8, U.withAlpha(boss.accent, 0.55), { spacing: '1.5px', family: FONT_U });
      } else {
        text(ctx, boss.subtitle, x, by + bh + 14, 8, U.withAlpha(boss.accent, 0.4), { spacing: '1.5px' });
      }
      ctx.restore();
    },

    // ══════════════════════════ BANNERS ══════════════════════════
    banners(g) {
      if (!g.banner) return;
      const ctx = g.ctx;
      const banner = g.banner;
      const span = banner.endBeat - banner.startBeat;
      const p = (g.beatNow - banner.startBeat) / span;
      if (p < 0 || p > 1.08) return;
      const inA = U.clamp(p / 0.14, 0, 1);
      const outA = U.clamp((1.02 - p) / 0.22, 0, 1);
      const alpha = Math.min(inA, outA);
      const ease = U.easeOutCubic(U.clamp(p / 0.35, 0, 1));
      const rise = (1 - ease) * 22;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';

      if (banner.kind === 'wave') {
        // side lines
        const lineW = 420 * ease;
        const ly = H * 0.35;
        const lgrad = ctx.createLinearGradient(W / 2 - lineW, 0, W / 2, 0);
        lgrad.addColorStop(0, 'transparent');
        lgrad.addColorStop(1, U.withAlpha(banner.color, 0.65));
        ctx.fillStyle = lgrad;
        ctx.fillRect(W / 2 - lineW, ly, lineW, 1);
        ctx.save();
        ctx.scale(-1, 1);
        ctx.fillStyle = lgrad;
        ctx.fillRect(-W / 2 - lineW, ly, lineW, 1);
        ctx.restore();

        text(ctx, `SECTOR // ${g.sector.name}`, W / 2, ly - 46 + rise, 9, U.withAlpha(banner.color, 0.72), { align: 'center', spacing: '5px' });
        ctx.save();
        ctx.font = font(58, 900, FONT_D);
        ctx.letterSpacing = '5px';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(banner.title, W / 2 + 3, ly - 2 + rise + 3);
        const tg = ctx.createLinearGradient(0, ly - 60, 0, ly);
        tg.addColorStop(0, '#ffffff');
        tg.addColorStop(0.55, U.mixColor('#ffffff', banner.color, 0.45));
        tg.addColorStop(1, banner.color);
        ctx.fillStyle = tg;
        ctx.shadowColor = banner.color;
        ctx.shadowBlur = 26;
        ctx.fillText(banner.title, W / 2, ly - 2 + rise);
        ctx.restore();
        text(ctx, banner.subtitle, W / 2, ly + 24 + rise * 0.5, 10, U.withAlpha('#ffffff', 0.55), { align: 'center', spacing: '3px', family: FONT_U });
      } else if (banner.kind === 'boss') {
        // warning bands
        const bandH = 64 + Math.sin(Math.min(p * 3, Math.PI)) * 10;
        const cg = ctx.createLinearGradient(0, H * 0.27 + rise, 0, H * 0.27 + bandH + rise);
        cg.addColorStop(0, 'rgba(30, 0, 10, 0)');
        cg.addColorStop(0.5, U.withAlpha(C.red, 0.12));
        cg.addColorStop(1, 'rgba(30,0,10,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(0, H * 0.27 + rise - 40, W, bandH + 45);

        for (let i = 0; i < 2; i++) {
          const y = H * 0.3 + i * 52 + rise;
          const lg = ctx.createLinearGradient(0, 0, W, 0);
          lg.addColorStop(0, 'transparent');
          lg.addColorStop(0.2, U.withAlpha(C.red, 0.4));
          lg.addColorStop(0.5, U.withAlpha(C.gold, 0.5));
          lg.addColorStop(0.8, U.withAlpha(C.red, 0.4));
          lg.addColorStop(1, 'transparent');
          ctx.fillStyle = lg;
          ctx.fillRect(W * 0.5 - 300 * ease, y, 600 * ease, 1);
        }
        text(ctx, '⚠ WARNING · BOSS SIGNAL', W / 2, H * 0.3 - 24 + rise, 9, U.withAlpha(C.red, 0.85), { align: 'center', spacing: '6px' });
        ctx.save();
        ctx.font = font(64, 900, FONT_D);
        ctx.letterSpacing = '4px';
        ctx.fillStyle = '#fff3f6';
        ctx.shadowColor = C.red;
        ctx.shadowBlur = 32;
        ctx.fillText(banner.title, W / 2, H * 0.3 + 34 + rise);
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = C.magenta;
        ctx.fillText(banner.title, W / 2 + 5, H * 0.3 + 32 + rise);
        ctx.restore();
        text(ctx, banner.subtitle, W / 2, H * 0.3 + 64 + rise, 10, U.withAlpha(banner.color, 0.8), { align: 'center', spacing: '3px', family: FONT_U });
      } else if (banner.kind === 'clear') {
        const ly = H * 0.3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        U.drawGlow(ctx, C.gold, W / 2, ly + 12, 360, 0.07);
        ctx.restore();
        text(ctx, 'SIGNAL CLEAR', W / 2, ly + rise, 44, C.gold, {
          align: 'center', spacing: '7px', weight: 900, glow: 24, glowColor: C.gold
        });
        text(ctx, banner.subtitle, W / 2, ly + 30 + rise * 0.5, 10, U.withAlpha('#ffe9b0', 0.75), { align: 'center', spacing: '3px' });
      }
      ctx.restore();
    },

    interludeOverlay(g) {
      if (!g.player) return;
      const remaining = g.pendingStartBeat - g.beatNow;
      if (remaining < -0.2) return;
      const alpha = U.clamp(remaining / 1.5, 0, 1) * 0.8;
      text(g.ctx, `SYNCING // WAVE ${U.padNum(g.pendingWave)}`, W / 2, H * 0.24, 9, U.withAlpha(C.cyan, 0.45 * alpha), {
        align: 'center', spacing: '4px'
      });
    },

    victoryCinematic(g) {
      const ctx = g.ctx;
      const t = 1 - U.clamp(g.victoryTimer / 3, 0, 1);
      const alpha = Math.min(1, t * 2.4);
      ctx.save();
      ctx.globalAlpha = alpha;
      const rg = ctx.createRadialGradient(W / 2, H * 0.4, 80, W / 2, H * 0.4, 620);
      rg.addColorStop(0, 'rgba(255, 209, 102, 0.09)');
      rg.addColorStop(0.6, 'rgba(255, 46, 136, 0.045)');
      rg.addColorStop(1, 'transparent');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      text(ctx, 'FINAL CADENCE', W / 2, H * 0.27, 42, '#fff7dc', {
        align: 'center', spacing: '6px', weight: 900, glow: 30, glowColor: C.gold
      });
      text(ctx, '裂隙正在闭合 · 节拍仍在继续', W / 2, H * 0.27 + 30, 10, U.withAlpha(C.gold, 0.55), { align: 'center', spacing: '3px', family: FONT_U });
      ctx.restore();
    },

    dyingOverlay(g) {
      const ctx = g.ctx;
      const alpha = U.clamp((1.7 - g.deathTimer) / 0.4, 0, 1) * 0.7;
      const rg = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 720);
      rg.addColorStop(0, 'transparent');
      rg.addColorStop(1, `rgba(120, 0, 20, ${alpha * 0.55})`);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    },

    // ══════════════════════════ CURSOR ══════════════════════════
    reticle(g) {
      const ctx = g.ctx;
      const mx = g.mouse.x;
      const my = g.mouse.y;
      const phase = U.mod(g.beatNow, 1);
      const pwindow = g.stats ? g.stats.perfectWindow : 0.18;
      const nearBeat = Math.min(phase, 1 - phase) <= pwindow;
      const ringR = 38 - 26 * U.easeOutCubic(phase);
      const color = nearBeat ? C.gold : C.cyan;
      const pulse = Math.pow(1 - phase, 3);

      // line from ship
      if (g.player && !g.player.dead) {
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = C.cyan;
        ctx.setLineDash([2, 8]);
        ctx.beginPath();
        ctx.moveTo(g.player.x, g.player.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(mx, my);
      U.drawGlow(ctx, color, 0, 0, 34, nearBeat ? 0.28 : 0.15);
      ctx.strokeStyle = U.withAlpha(color, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = U.withAlpha(color, nearBeat ? 0.85 : 0.4);
      ctx.lineWidth = nearBeat ? 1.8 : 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(10, ringR), 0, TAU);
      ctx.stroke();
      // ticks
      ctx.strokeStyle = U.withAlpha(color, 0.5);
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16);
        ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
        ctx.stroke();
      }
      // small rotating accents
      ctx.rotate(g.animTime * 0.8);
      ctx.strokeStyle = U.withAlpha(color, 0.3);
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 26, i * Math.PI, i * Math.PI + 0.6);
        ctx.stroke();
      }
      ctx.rotate(-g.animTime * 0.8);
      ctx.fillStyle = U.withAlpha('#ffffff', 0.85);
      ctx.fillRect(-1, -1, 2, 2);
      // beat flash
      if (phase < 0.1) {
        ctx.globalAlpha = (1 - phase / 0.1) * 0.35;
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 42 + (1 - phase / 0.1) * 12, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },

    // ══════════════════════════ OVERLAYS ═════════════════════════
    overlays(g) {
      const ctx = g.ctx;
      const cw = g.canvas.width;
      const ch = g.canvas.height;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // hurt / low health vignette
      if (g.state !== 'title') {
        const lowPulse = g.player ? Math.pow(1 - U.mod(g.beatNow, 1), 4) * (g.player.hp < g.player.maxHp * 0.3 ? 0.08 : 0) : 0;
        if (g.hurtVignette > 0.01 || lowPulse > 0.005) {
          const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.22, cw / 2, ch / 2, Math.max(cw, ch) * 0.65);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, `rgba(255, 20, 60, ${Math.min(0.5, g.hurtVignette * 0.42 + lowPulse)})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, cw, ch);
        }
      }

      // overdrive edge
      if (g.run && g.run.overdrive) {
        const pulse = Math.pow(1 - U.mod(g.beatNow, 1), 2);
        const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.28, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.75, `rgba(255, 190, 70, ${0.035 + pulse * 0.025})`);
        grad.addColorStop(1, `rgba(255, 160, 40, ${0.11 + pulse * 0.05})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
      }

      // flash
      if (g.flash > 0.005) {
        ctx.globalAlpha = g.flash;
        ctx.fillStyle = g.flashColor;
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalAlpha = 1;
      }

      // letterbox tint — everything here is in device pixels
      const dpr = g.view.dpr;
      const arenaW = W * g.view.scale * dpr;
      const arenaH = H * g.view.scale * dpr;
      const ox = g.view.ox * dpr;
      const oy = g.view.oy * dpr;
      if (arenaW < cw - 1 || arenaH < ch - 1) {
        ctx.fillStyle = '#010005';
        ctx.fillRect(0, 0, cw, Math.max(0, oy));
        ctx.fillRect(0, oy + arenaH, cw, ch - (oy + arenaH));
        ctx.fillRect(0, oy, Math.max(0, ox), arenaH);
        ctx.fillRect(ox + arenaW, oy, cw - (ox + arenaW), arenaH);
      }
      ctx.restore();
    },

    debug(g) {
      const ctx = g.ctx;
      ctx.save();
      ctx.font = '10px Consolas, monospace';
      ctx.fillStyle = 'rgba(120, 255, 200, 0.6)';
      ctx.textAlign = 'left';
      const lines = [
        `FPS ${g.fps.toFixed(0)}  BEAT ${g.beatNow.toFixed(2)}`,
        `STATE ${g.state}  LAT ${(g.audio.latency * 1000).toFixed(0)}ms  OFFSET ${g.settings.offset}ms`,
        `ENEMIES ${g.enemies.length}  EB ${g.enemyBullets.length}  PB ${g.playerBullets.length}  P ${g.particles.length}`,
        `COMBO ${g.run ? g.run.combo : 0}  SYNC ${g.run ? g.run.sync.toFixed(1) : 0}  HP ${g.player ? Math.ceil(g.player.hp) : 0}`
      ];
      lines.forEach((line, i) => ctx.fillText(line, 24, 150 + i * 14));
      ctx.restore();
    }
  };

  PR.Render = Render;
})(window.PR = window.PR || {});
