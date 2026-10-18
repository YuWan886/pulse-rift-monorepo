/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — utilities, math, procedural glow sprites
   ═══════════════════════════════════════════════════════════════ */
(function (PR) {
  'use strict';

  PR.VERSION = '1.0.0';
  PR.TAU = Math.PI * 2;
  PR.BEAT_DURATION = 0.5;           // 120 BPM
  PR.STEPS_PER_BEAT = 4;
  PR.STEP_DURATION = 0.125;

  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));
  const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const damp = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const chance = (p) => Math.random() < p;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const dist2 = (x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; };
  const dist = (x1, y1, x2, y2) => Math.sqrt(dist2(x1, y1, x2, y2));
  const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
  const wrapAngle = (a) => {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  };
  const angleDiff = (a, b) => wrapAngle(a - b);
  const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
  const mod = (n, m) => ((n % m) + m) % m;
  const nextMultiple = (value, step) => Math.ceil(value / step) * step;
  const prevMultiple = (value, step) => Math.floor(value / step) * step;

  // distance from point to finite segment
  function pointSegDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0;
    t = clamp(t, 0, 1);
    const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function weightedPick(items, weightFn) {
    let total = 0;
    const weights = items.map((it) => {
      const w = Math.max(0, weightFn(it));
      total += w;
      return w;
    });
    if (total <= 0) return items[0];
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
  const easeInCubic = (t) => t * t * t;
  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function formatScore(n) {
    n = Math.max(0, Math.round(n));
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function padNum(n, width = 2) {
    return String(Math.max(0, Math.floor(n))).padStart(width, '0');
  }
  function pct(v, digits = 0) {
    return (v * 100).toFixed(digits) + '%';
  }

  // ── colours ──────────────────────────────────────────────────
  const colorCache = new Map();
  function parseColor(hex) {
    if (colorCache.has(hex)) return colorCache.get(hex);
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const num = parseInt(h, 16);
    const c = { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    colorCache.set(hex, c);
    return c;
  }
  function withAlpha(hex, a) {
    const c = parseColor(hex);
    return `rgba(${c.r},${c.g},${c.b},${a})`;
  }
  function mixColor(a, b, t) {
    const ca = parseColor(a), cb = parseColor(b);
    const r = Math.round(lerp(ca.r, cb.r, t));
    const g = Math.round(lerp(ca.g, cb.g, t));
    const bl = Math.round(lerp(ca.b, cb.b, t));
    return `rgb(${r},${g},${bl})`;
  }

  // ── procedural radial glow sprites ───────────────────────────
  const glowCache = new Map();
  const GLOW_SIZE = 128;
  function glowSprite(color) {
    if (glowCache.has(color)) return glowCache.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = GLOW_SIZE;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.12, withAlpha(color, 0.92));
    g.addColorStop(0.34, withAlpha(color, 0.42));
    g.addColorStop(0.62, withAlpha(color, 0.11));
    g.addColorStop(1, withAlpha(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    glowCache.set(color, c);
    return c;
  }
  function drawGlow(ctx, color, x, y, radius, alpha = 1) {
    if (alpha <= 0.002 || radius <= 0.2) return;
    const spr = glowSprite(color);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.drawImage(spr, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── storage helpers ─────────────────────────────────────────
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage may be unavailable */ }
  }

  const now = () => performance.now() / 1000;

  // tiny event emitter
  class Emitter {
    constructor() { this._map = new Map(); }
    on(name, fn) {
      if (!this._map.has(name)) this._map.set(name, new Set());
      this._map.get(name).add(fn);
      return () => this._map.get(name).delete(fn);
    }
    emit(name, ...args) {
      const set = this._map.get(name);
      if (!set) return;
      for (const fn of set) { try { fn(...args); } catch (e) { console.error(e); } }
    }
  }

  PR.U = {
    TAU, clamp, lerp, invLerp, smoothstep, damp, rand, randInt, chance, pick, shuffle,
    dist, dist2, angleTo, wrapAngle, angleDiff, lerpAngle, mod, nextMultiple, prevMultiple,
    pointSegDist, weightedPick, easeOutCubic, easeOutQuint, easeInCubic, easeOutBack, easeInOut,
    midiToFreq, formatScore, padNum, pct, parseColor, withAlpha, mixColor,
    glowSprite, drawGlow, loadJSON, saveJSON, now, Emitter
  };
})(window.PR = window.PR || {});
