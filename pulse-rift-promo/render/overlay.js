/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — 2D broadcast layer
   Captions, HUD, title lockups and the end card are drawn on a
   transparent canvas and composited by the final shader.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BEAT, PERFECT_BEATS, BARS, chordAtBeat, shotAtBeat } from './timeline.js';
import { clamp, lerp, smoothstep, easeOutCubic, easeOutExpo, hash2, cutRectPath, roundRectPath } from './fx.js';

const C = {
  ink: '#e9fbff', white: '#ffffff', cyan: '#37f5ff', cyanSoft: '#9dfbff',
  gold: '#ffd166', magenta: '#ff2e88', violet: '#b26bff', green: '#5dffa8',
  red: '#ff4e64', orange: '#ff8a3d', dim: 'rgba(157,181,196,0.62)'
};
const FD = '"Orbitron", "Chakra Petch", sans-serif';
const FU = '"Chakra Petch", "Microsoft YaHei", "PingFang SC", sans-serif';
const FCN = '"Microsoft YaHei", "PingFang SC", "Chakra Petch", sans-serif';

export class Overlay {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    this.S = width / 1920;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.state = {};
  }

  clear() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.setTransform(this.S, 0, 0, this.S, 0, 0);
  }

  font(ctx, size, weight = 600, family = FD, spacing = 0) {
    ctx.font = `${weight} ${size}px ${family}`;
    try { ctx.letterSpacing = `${spacing}px`; } catch (e) {}
  }

  text(str, x, y, opts = {}) {
    const ctx = this.ctx;
    const {
      size = 16, weight = 600, family = FD, color = C.ink, align = 'left',
      alpha = 1, spacing = 0, glow = 0, glowColor = color, baseline = 'alphabetic'
    } = opts;
    if (alpha <= 0.001) return;
    ctx.save();
    this.font(ctx, size, weight, family, spacing);
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (glow > 0) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = glow;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  line(x1, y1, x2, y2, color = C.cyan, alpha = 0.5, width = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.restore();
  }

  bracket(x, y, w, h, color = C.cyan, alpha = 0.35, len = 18) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len);
    ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
    ctx.moveTo(x + len, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - len);
    ctx.stroke();
    ctx.restore();
  }

  panel(x, y, w, h, opts = {}) {
    const ctx = this.ctx;
    const { cut = 12, fill = 'rgba(5,2,12,0.76)', stroke = 'rgba(55,245,255,0.4)', glow = 0 } = opts;
    ctx.save();
    ctx.beginPath();
    cutRectPath(ctx, x, y, w, h, cut);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
    if (glow) { ctx.shadowColor = stroke; ctx.shadowBlur = glow; ctx.stroke(); }
    ctx.restore();
  }

  /* ── global frame ─────────────────────────────────────── */
  frame(t, beat, shot) {
    const alpha = shot && shot.cap && shot.cap.endcard ? 0.25 : 0.34;
    const hud = !!(shot && shot.hud);
    this.bracket(38, 34, 1844, 1012, C.cyan, alpha * 0.7, 24);
    if (!hud) {
      this.text('PULSE//RIFT', 62, 66, { size: 12, weight: 600, color: C.cyan, alpha: 0.6, spacing: 3, family: FU });
      this.text('PROCEDURAL TRANSMISSION', 62 + 110, 66, { size: 10, weight: 400, color: C.ink, alpha: 0.28, spacing: 2, family: FU });
      const sec = Math.floor(t);
      const frames = Math.floor((t - sec) * 60);
      const tc = `00:${String(sec).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
      this.text(tc, 1858, 66, { size: 11, weight: 500, color: C.ink, alpha: 0.4, align: 'right', spacing: 2, family: FU });
      this.text('SECTOR I–∞', 1858, 1000, { size: 10, weight: 400, color: C.ink, alpha: 0.28, align: 'right', spacing: 2, family: FU });
      this.text('120.00 BPM', 62, 1000, { size: 10, weight: 400, color: C.ink, alpha: 0.3, spacing: 2, family: FU });
    }
    // tiny beat lamps
    const frac = beat % 1;
    for (let i = 0; i < 4; i++) {
      const on = (Math.floor(beat) % 4) === i;
      const a = on ? 0.8 * Math.exp(-frac * 5) + 0.15 : 0.12;
      this.ctx.save();
      this.ctx.globalAlpha = a;
      this.ctx.fillStyle = i === 0 ? C.gold : C.cyan;
      this.ctx.fillRect(170 + i * 14, 993, 7, 7);
      this.ctx.restore();
    }
  }

  /* ── title lockup (3D wordmark is on stage) ───────────── */
  title(t, beat, shot, mode = 'main') {
    const local = beat - shot.a;
    const fade = smoothstep(0, 0.8, local) * smoothstep(shot.b - shot.a, shot.b - shot.a - 0.6, local);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = fade;
    const cx = 960, y = 760;
    // ornament line
    const lp = clamp(local / 2, 0, 1);
    this.line(cx - 260 * lp, y - 74, cx + 260 * lp, y - 74, C.cyan, 0.5, 1);
    this.line(cx - 260 * lp, y - 74, cx - 200 * lp, y - 74, C.gold, 0.9, 2);
    this.text('EVERY SHOT IS A NOTE', cx, y - 94, {
      size: 13, weight: 600, color: C.cyan, align: 'center', alpha: 0.85,
      spacing: 7, family: FU, glow: 10
    });
    this.text('律 动 裂 隙', cx, y + 6, {
      size: 56, weight: 700, color: C.white, align: 'center', spacing: 16,
      family: FCN, glow: 26, glowColor: 'rgba(55,245,255,0.75)'
    });
    this.text('PULSE // RIFT', cx, y + 48, {
      size: 15, weight: 500, color: C.cyanSoft, align: 'center', spacing: 9,
      family: FD, alpha: 0.8
    });
    this.text('在崩坏的声场里，把每一次心跳写成子弹。', cx, y + 100, {
      size: 20, weight: 500, color: C.ink, align: 'center', alpha: 0.72,
      family: FCN, spacing: 2
    });
    ctx.restore();
  }

  /* ── captions ─────────────────────────────────────────── */
  caption(t, beat, shot) {
    const cap = shot.cap;
    if (!cap || !cap.cn || cap.title || cap.endcard) return;
    const len = shot.b - shot.a;
    const local = beat - shot.a;
    const fin = smoothstep(0, 0.65, local);
    const fout = smoothstep(len, len - 0.7, local);
    const alpha = Math.min(fin, fout);
    if (alpha <= 0.001) return;
    const slide = (1 - easeOutCubic(fin)) * 18;
    const x = 138;
    const baseY = 862 + slide;
    const ctx = this.ctx;

    ctx.save();
    ctx.globalAlpha = alpha;
    const bg = ctx.createLinearGradient(90, 0, 1150, 0);
    bg.addColorStop(0, 'rgba(2,1,7,0.72)');
    bg.addColorStop(0.72, 'rgba(2,1,7,0.4)');
    bg.addColorStop(1, 'rgba(2,1,7,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(90, baseY - 96, 1060, 168);
    // left rule
    const ra = smoothstep(0, 0.5, local);
    this.line(x - 28, baseY - 78, x - 28, baseY - 8, C.cyan, ra * 0.65, 2);
    this.line(x - 28, baseY - 78, x - 10, baseY - 78, C.gold, ra * 0.9, 2);

    this.text(cap.kicker || '', x, baseY - 72, {
      size: 12, weight: 600, color: C.cyan, alpha: 0.85, spacing: 4.5, family: FU
    });
    this.text(cap.cn, x, baseY - 14, {
      size: 38, weight: 600, color: C.white, family: FCN, spacing: 2,
      glow: 16, glowColor: 'rgba(55,245,255,0.35)'
    });
    if (cap.en) {
      this.text(cap.en, x, baseY + 28, {
        size: 13, weight: 500, color: C.dim, spacing: 3.4, family: FU
      });
    }
    // index ticks
    this.text('// ' + String(shot.a).padStart(3, '0'), x, baseY + 58, {
      size: 9, weight: 400, color: C.cyan, alpha: 0.36, spacing: 2, family: FU
    });
    ctx.restore();
  }

  /* ── combat HUD ───────────────────────────────────────── */
  hud(t, beat, shot) {
    const ctx = this.ctx;
    const mode = shot.mode || 'arena';
    const local = beat - 40;
    const perfectCount = PERFECT_BEATS.filter(b => b <= beat).length;
    const combo = Math.min(100, Math.max(1, Math.round(perfectCount * 1.6 + 8)));
    const score = 3840 + perfectCount * 125 + Math.round(Math.max(0, beat - 40) * 16);
    const sync = mode === 'overdrive' ? 100 : clamp((beat - 40) * 1.7, 8, 96);
    const integrity = mode === 'boss' ? 84 : mode === 'overdrive' ? 61 : 96;
    const wave = mode === 'arena' ? 'WAVE 03' : 'WAVE 10';
    const sector = mode === 'arena' ? 'SHALLOW ECHO' : 'DEEP PULSE';
    const perfectNow = beat % 1;
    const pulse = Math.exp(-perfectNow * 3);

    // top-left integrity
    this.panel(56, 60, 400, 104, { cut: 14 });
    this.text('INTEGRITY // 生命', 78, 88, { size: 11, weight: 500, color: C.dim, spacing: 2.6, family: FU });
    this.text(`${integrity} / 100`, 434, 88, { size: 12, weight: 700, color: C.ink, align: 'right', spacing: 1.5, family: FD });
    const barW = 354, segs = 24;
    for (let i = 0; i < segs; i++) {
      const on = i < Math.round(segs * integrity / 100);
      ctx.save();
      ctx.globalAlpha = on ? 0.9 : 0.14;
      ctx.fillStyle = integrity < 70 ? C.red : C.cyan;
      ctx.fillRect(78 + i * (barW / segs), 100, barW / segs - 3, 9);
      ctx.restore();
    }
    this.text(wave, 78, 142, { size: 20, weight: 700, color: C.ink, spacing: 3, family: FD, glow: 8 });
    this.text(sector + ' · 深层脉冲', 250, 142, { size: 11, weight: 500, color: mode === 'arena' ? C.cyan : C.magenta, spacing: 2, family: FU, alpha: 0.75 });

    // top-right score
    this.panel(1482, 60, 376, 112, { cut: 14 });
    this.text('SCORE', 1858, 88, { size: 11, weight: 500, color: C.dim, align: 'right', spacing: 3, family: FU });
    this.text(String(score).padStart(6, '0'), 1858, 126, { size: 30, weight: 700, color: C.ink, align: 'right', spacing: 2, family: FD, glow: 6 });
    this.text('COMBO', 1740, 150, { size: 10, weight: 500, color: C.dim, align: 'right', spacing: 2, family: FU });
    this.text('×' + combo, 1858, 154, { size: 18, weight: 700, color: C.gold, align: 'right', spacing: 1, family: FD, glow: 8 });

    // boss bar
    if (mode === 'boss' || mode === 'overdrive') {
      const bossBeat = beat - 112;
      const hp = clamp(1 - bossBeat / 48, 0.08, 1);
      const phase = beat < 128 ? 'PHASE 1' : 'PHASE 2';
      this.panel(586, 52, 748, 84, { cut: 12, stroke: 'rgba(255,46,136,0.5)' });
      this.text('THE MAESTRO', 610, 80, { size: 17, weight: 700, color: C.ink, spacing: 3, family: FD });
      this.text('指挥家', 794, 80, { size: 11, weight: 500, color: C.magenta, spacing: 4, family: FCN, alpha: 0.8 });
      this.text(phase, 1310, 80, { size: 10, weight: 600, color: C.gold, align: 'right', spacing: 3, family: FU });
      const bx = 610, bw = 700, bs = 40;
      for (let i = 0; i < bs; i++) {
        const on = i < Math.round(bs * hp);
        ctx.save();
        ctx.globalAlpha = on ? (i % 5 === 0 ? 0.95 : 0.75) : 0.12;
        ctx.fillStyle = i % 5 === 0 ? C.gold : C.magenta;
        ctx.fillRect(bx + i * (bw / bs), 94, bw / bs - 3, 8);
        ctx.restore();
      }
      this.text('CONDUCTOR OF THE VOID', 610, 122, { size: 9, weight: 500, color: C.dim, spacing: 2.4, family: FU });
      this.text(String(Math.round(8200 * hp)), 1310, 122, { size: 10, weight: 600, color: C.ink, align: 'right', spacing: 1.4, family: FD, alpha: 0.7 });
    }

    // bottom left dash
    this.panel(56, 906, 300, 88, { cut: 12 });
    this.text('DASH', 78, 932, { size: 10, weight: 500, color: C.dim, spacing: 3, family: FU });
    this.text('SPACE', 334, 932, { size: 10, weight: 500, color: C.cyan, align: 'right', spacing: 2, family: FU, alpha: 0.75 });
    const dashReady = (beat % 4) < 2.5;
    this.text(dashReady ? 'READY' : 'SYNCING', 78, 972, {
      size: 20, weight: 700, color: dashReady ? C.cyan : C.dim, spacing: 3, family: FD, glow: dashReady ? 10 : 0
    });
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(220, 965); ctx.lineTo(334, 965); ctx.stroke();
    ctx.restore();

    // bottom center sync
    this.text('SYNC', 700, 936, { size: 10, weight: 500, color: C.dim, spacing: 3, family: FU });
    this.text('PERFECT HITS BUILD SYNC', 960, 936, { size: 9, weight: 500, color: C.dim, align: 'center', spacing: 2.6, family: FU, alpha: 0.7 });
    const sx = 700, sw = 520, sseg = 30;
    for (let i = 0; i < sseg; i++) {
      const on = i < Math.round(sseg * sync / 100);
      ctx.save();
      ctx.globalAlpha = on ? 0.9 : 0.12;
      ctx.fillStyle = mode === 'overdrive' ? C.gold : C.cyan;
      ctx.fillRect(sx + i * (sw / sseg), 954, sw / sseg - 3, 10);
      ctx.restore();
    }
    this.text(String(Math.round(sync)).padStart(3, '0') + '%', 700, 988, { size: 13, weight: 700, color: mode === 'overdrive' ? C.gold : C.cyan, spacing: 1.5, family: FD });
    if (mode === 'overdrive') {
      this.panel(806, 860, 308, 42, { cut: 8, fill: 'rgba(5,2,12,0.72)', stroke: 'rgba(255,209,102,0.4)' });
      this.text('OVERDRIVE', 960, 888, {
        size: 26, weight: 800, color: C.gold, align: 'center', spacing: 14,
        family: FD, glow: 26, alpha: 0.9 + pulse * 0.1
      });
    }

    // bottom right
    this.panel(1564, 906, 300, 88, { cut: 12 });
    this.text('GRAZE', 1586, 932, { size: 10, weight: 500, color: C.dim, spacing: 3, family: FU });
    this.text('PERFECT', 1842, 932, { size: 10, weight: 500, color: C.dim, align: 'right', spacing: 2.4, family: FU });
    this.text(String(Math.round(Math.max(0, beat - 44) * 1.1)).padStart(3, '0'), 1586, 972, { size: 21, weight: 700, color: C.ink, spacing: 2, family: FD });
    this.text(String(perfectCount % 1000).padStart(3, '0'), 1842, 972, { size: 21, weight: 700, color: C.gold, align: 'right', spacing: 2, family: FD, glow: 8 });

    // judgement burst on each perfect
    const beatInt = Math.floor(beat);
    if (PERFECT_BEATS.includes(beatInt) && beat - beatInt < 0.55) {
      const age = beat - beatInt;
      const ps = this.state.perfectScreen;
      const px = ps && ps.visible ? ps.x : 960;
      const py = ps && ps.visible ? ps.y - 56 : 604;
      if (ps && ps.visible) {
        ctx.save();
        ctx.globalAlpha = (1 - age / 0.55) * 0.35;
        ctx.fillStyle = 'rgba(2,1,7,0.7)';
        ctx.fillRect(px - 90, py - 38, 180, 58);
        ctx.restore();
      }
      this.text('PERFECT', px, py - age * 26, {
        size: 26 + (1 - age / 0.55) * 6, weight: 800, color: C.gold, align: 'center',
        spacing: 8, family: FD, glow: 24, alpha: 1 - age / 0.55
      });
      this.text('×2.0', px, py + 30 - age * 26, {
        size: 12, weight: 600, color: C.cyanSoft, align: 'center', spacing: 5,
        family: FU, alpha: (1 - age / 0.55) * 0.8
      });
    }
  }

  /* ── gallery side panel ───────────────────────────────── */
  gallery(t, beat, shot) {
    this.panel(1484, 320, 374, 300, { cut: 16, stroke: 'rgba(178,107,255,0.42)' });
    this.text('SIGNAL UPGRADE', 1508, 354, { size: 11, weight: 600, color: C.violet, spacing: 3, family: FU });
    this.text('重写你的信号', 1508, 386, { size: 20, weight: 600, color: C.ink, spacing: 2, family: FCN });
    const tracks = [
      { name: 'POWER', cn: '火力', track: 'DRIVE', color: C.red, at: 96 },
      { name: 'STREAM', cn: '投射', track: 'ARP', color: C.cyan, at: 100 },
      { name: 'GUARD', cn: '生存', track: 'PAD', color: C.green, at: 104 },
      { name: 'PHASE', cn: '相位', track: 'PERC', color: C.violet, at: 108 }
    ];
    tracks.forEach((tr, i) => {
      const y = 430 + i * 42;
      const on = beat >= tr.at;
      const fill = clamp((beat - tr.at) / 4 + (on ? 1 : 0), 0, 1);
      this.ctx.save();
      this.ctx.globalAlpha = on ? 1 : 0.35;
      this.ctx.fillStyle = tr.color;
      this.ctx.fillRect(1508, y - 12, 5, 24);
      this.ctx.restore();
      this.text(tr.name, 1524, y - 1, { size: 12, weight: 700, color: on ? tr.color : C.dim, spacing: 2, family: FD });
      this.text(tr.cn, 1524, y + 15, { size: 9, weight: 400, color: C.dim, spacing: 2, family: FCN, alpha: 0.7 });
      this.text('→ ' + tr.track, 1836, y + 5, { size: 11, weight: 600, color: on ? C.ink : C.dim, align: 'right', spacing: 2.5, family: FU, alpha: on ? 0.9 : 0.4 });
      this.ctx.save();
      this.ctx.globalAlpha = on ? 0.8 : 0.15;
      this.ctx.fillStyle = tr.color;
      this.ctx.fillRect(1650, y - 2, 130 * fill, 5);
      this.ctx.restore();
    });
    this.text('26 UPGRADES · 4 TRACKS', 1508, 598, { size: 9, weight: 500, color: C.dim, spacing: 2.4, family: FU });
  }

  /* ── end card ─────────────────────────────────────────── */
  endCard(t, beat, shot) {
    const fade = smoothstep(176, 177.4, beat);
    if (fade <= 0.001) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = fade;
    const cx = 960;

    // rotating ring
    const rot = t * 0.12;
    ctx.save();
    ctx.translate(cx, 420);
    ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(55,245,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 286, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2;
      const long = i % 5 === 0;
      ctx.strokeStyle = long ? 'rgba(255,209,102,0.5)' : 'rgba(55,245,255,0.28)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 296, Math.sin(a) * 296);
      ctx.lineTo(Math.cos(a) * (long ? 316 : 304), Math.sin(a) * (long ? 316 : 304));
      ctx.stroke();
    }
    ctx.restore();

    this.text('RHYTHM ROGUELIKE SHOOTER', cx, 286, {
      size: 13, weight: 600, color: C.cyan, align: 'center', spacing: 8, family: FU, alpha: 0.85
    });
    this.line(cx - 230, 306, cx - 60, 306, C.cyan, 0.4, 1);
    this.line(cx + 60, 306, cx + 230, 306, C.cyan, 0.4, 1);

    // crisp logo
    const grad = ctx.createLinearGradient(cx - 320, 0, cx + 10, 0);
    grad.addColorStop(0, '#37f5ff');
    grad.addColorStop(0.6, '#c9feff');
    grad.addColorStop(1, '#ffffff');
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    this.font(ctx, 104, 900, FD, 2);
    ctx.shadowColor = 'rgba(55,245,255,0.8)'; ctx.shadowBlur = 36;
    ctx.fillStyle = grad;
    ctx.fillText('PULSE', cx - 118, 406);
    ctx.fillStyle = C.magenta; ctx.shadowColor = 'rgba(255,46,136,0.9)'; ctx.shadowBlur = 32;
    ctx.fillText('//', cx + 92, 406);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.shadowColor = 'rgba(233,251,255,0.9)'; ctx.shadowBlur = 24;
    ctx.strokeText('RIFT', cx + 300, 406);
    ctx.restore();

    this.text('律 动 裂 隙', cx, 512, {
      size: 44, weight: 700, color: C.white, align: 'center', spacing: 20, family: FCN,
      glow: 22, glowColor: 'rgba(55,245,255,0.6)'
    });
    this.text('你不是在射击。你在作曲。', cx, 578, {
      size: 21, weight: 500, color: C.ink, align: 'center', spacing: 3, family: FCN, alpha: 0.8
    });

    // CTA
    const cw = 392, ch = 78, bx = cx - cw / 2, by = 636;
    ctx.save();
    ctx.beginPath(); cutRectPath(ctx, bx, by, cw, ch, 16);
    ctx.fillStyle = 'rgba(55,245,255,0.10)'; ctx.fill();
    ctx.strokeStyle = 'rgba(55,245,255,0.8)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    this.text('开始潜入', cx + 6, by + 36, { size: 24, weight: 600, color: C.white, align: 'center', spacing: 8, family: FCN });
    this.text('PLAY IN YOUR BROWSER', cx + 6, by + 60, { size: 10, weight: 600, color: C.cyan, align: 'center', spacing: 3.4, family: FU });
    const blink = 0.55 + 0.45 * Math.sin(t * 4);
    this.ctx.save();
    this.ctx.globalAlpha = blink * fade;
    this.ctx.fillStyle = C.gold;
    this.ctx.fillRect(cx - 300, by + 26, 7, 26);
    this.ctx.restore();

    this.text('BROWSER · KEYBOARD + MOUSE · HEADPHONES RECOMMENDED', cx, 744, {
      size: 10, weight: 500, color: C.dim, align: 'center', spacing: 3.2, family: FU
    });
    this.line(cx - 360, 776, cx + 360, 776, C.cyan, 0.12, 1);
    this.text('100% CODE-GENERATED FILM  ·  THREE.JS + WEB AUDIO  ·  120 BPM', cx, 804, {
      size: 9, weight: 500, color: C.dim, align: 'center', spacing: 2.6, family: FU, alpha: 0.55
    });
    ctx.restore();
  }

  /* ── master draw ──────────────────────────────────────── */
  draw(t, beat, shot, extra = {}) {
    this.clear();
    this.frame(t, beat, shot);
    if (shot.hud) this.hud(t, beat, shot);
    if (shot.scene === 'gallery') this.gallery(t, beat, shot);
    if (shot.cap) {
      if (shot.cap.title) this.title(t, beat, shot);
      else if (shot.cap.endcard) this.endCard(t, beat, shot);
      else this.caption(t, beat, shot);
    }
    // extra flare text (e.g. boss name slam)
    if (extra.bigText) {
      this.text(extra.bigText, 960, 500, {
        size: extra.bigSize || 42, weight: 800, color: extra.bigColor || C.gold,
        align: 'center', spacing: 14, family: FD, glow: 30, alpha: extra.bigAlpha ?? 1
      });
    }
    this.texture.needsUpdate = true;
  }
}
