/* Synthesize the trailer card beds / stingers (48 kHz stereo, 24-bit WAV). */
const fs = require('fs');
const path = require('path');
const SR = 48000;
const OUT = path.join(__dirname, '..', 'audio_sfx');
fs.mkdirSync(OUT, { recursive: true });

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(0x9e3779b9);
const TAU = Math.PI * 2;

class Buf {
  constructor(sec) { this.n = Math.ceil(sec * SR); this.l = new Float32Array(this.n); this.r = new Float32Array(this.n); }
  add(i, l, r = l) { if (i >= 0 && i < this.n) { this.l[i] += l; this.r[i] += r; } }
  mix(other, gain = 1, offset = 0) {
    const o = Math.floor(offset * SR);
    for (let i = 0; i < other.n; i++) {
      const j = i + o; if (j < 0 || j >= this.n) continue;
      this.l[j] += other.l[i] * gain; this.r[j] += other.r[i] * gain;
    }
  }
}

function sineSweep(buf, t0, dur, f0, f1, amp, curve = 2, pan = 0) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const f = f0 * Math.pow(f1 / f0, u);
    ph += TAU * f / SR;
    const env = Math.pow(1 - u, curve) * Math.min(1, i / (0.004 * SR));
    const v = Math.sin(ph) * env * amp;
    const a = (pan + 1) * 0.5;
    buf.add(i0 + i, v * (1 - a * 0.35), v * (0.65 + a * 0.35));
  }
}

function kick(buf, t0, amp = 0.8) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.42 * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / SR;
    const f = 46 + 90 * Math.exp(-u * 28);
    ph += TAU * f / SR;
    const env = Math.exp(-u * 9) * Math.min(1, i / 40);
    const v = Math.sin(ph) * env * amp;
    buf.add(i0 + i, v);
  }
}

function boom(buf, t0, amp = 1) {
  sineSweep(buf, t0, 1.6, 78, 26, amp, 2.6);
  sineSweep(buf, t0, 0.55, 140, 42, amp * 0.35, 3.2);
  // noise crack
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.35 * SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const x = (rnd() * 2 - 1);
    lp += (x - lp) * 0.28;
    const env = Math.exp(-u * 14);
    buf.add(i0 + i, lp * env * amp * 0.5);
  }
}

function riser(buf, t0, dur, amp = 0.4) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  let ph = 0, lp = 0, hp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fc = 180 * Math.pow(26, u);
    const a = 1 - Math.exp(-TAU * Math.min(fc, 16000) / SR);
    const x = rnd() * 2 - 1;
    lp += (x - lp) * a;
    hp = x - lp;
    const env = Math.pow(u, 2.6) * amp;
    buf.add(i0 + i, (lp * 0.7 + hp * 0.25) * env, (lp * 0.65 + hp * 0.35) * env);
    const f = 110 * Math.pow(8, u);
    ph += TAU * f / SR;
    buf.add(i0 + i, Math.sin(ph) * env * 0.08);
  }
}

function pad(buf, t0, dur, notes, amp = 0.14, bright = 1200) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
  const phases = notes.map(() => rnd() * TAU);
  const det = notes.map(() => 1 + (rnd() - 0.5) * 0.006);
  let lpL = 0, lpR = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const atk = Math.min(1, i / (0.5 * SR));
    const rel = Math.min(1, (n - i) / (0.9 * SR));
    const env = atk * rel;
    let L = 0, R = 0;
    for (let k = 0; k < notes.length; k++) {
      const f = 440 * Math.pow(2, (notes[k] - 69) / 12) * det[k];
      const p = phases[k] + TAU * f * (i / SR);
      L += Math.sin(p) * (k % 2 ? 0.8 : 1);
      R += Math.sin(p + 0.35) * (k % 2 ? 1 : 0.8);
    }
    const a = 1 - Math.exp(-TAU * bright / SR);
    lpL += (L - lpL) * a; lpR += (R - lpR) * a;
    buf.add(i0 + i, lpL * env * amp / notes.length, lpR * env * amp / notes.length);
  }
}

function shimmer(buf, t0, dur, amp = 0.1) {
  const notes = [84, 87, 91, 96, 99];
  notes.forEach((m, idx) => {
    const t = t0 + idx * 0.12;
    const n = Math.floor(dur * SR);
    const i0 = Math.floor(t * SR);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const env = Math.exp(-u * 4) * Math.min(1, i / 300);
      const f = 440 * Math.pow(2, (m - 69) / 12);
      const v = Math.sin(TAU * f * i / SR + Math.sin(i * 0.0007) * 0.6) * env * amp;
      buf.add(i0 + i, v * (0.6 + 0.4 * Math.sin(i / SR * 0.7)));
    }
  });
}

function reverb(buf, mix = 0.3) {
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map(d => ({ d: Math.floor(d * SR), g: 0.78, b: new Float32Array(Math.floor(d * SR)) }));
  const aps = [0.005, 0.0017].map(d => ({ d: Math.floor(d * SR), g: 0.5, b: new Float32Array(Math.floor(d * SR)) }));
  const wetL = new Float32Array(buf.n), wetR = new Float32Array(buf.n);
  for (const c of combs) {
    let idx = 0;
    for (let i = 0; i < buf.n; i++) {
      const y = c.b[idx];
      c.b[idx] = buf.l[i] + y * c.g;
      idx = (idx + 1) % c.d;
      wetL[i] += y * 0.25;
      wetR[i] += y * 0.22;
    }
  }
  for (const ap of aps) {
    let idx = 0;
    for (let i = 0; i < buf.n; i++) {
      const b = ap.b[idx];
      const y = -wetL[i] + b;
      ap.b[idx] = wetL[i] + b * ap.g;
      idx = (idx + 1) % ap.d;
      wetL[i] = y;
    }
  }
  for (let i = 0; i < buf.n; i++) {
    buf.l[i] += wetL[i] * mix;
    buf.r[i] += wetR[i] * mix;
  }
}

function writeWav(file, buf) {
  const n = buf.n, bytes = 3, ch = 2;
  const dataSize = n * ch * bytes;
  const b = Buffer.alloc(44 + dataSize);
  b.write('RIFF', 0); b.writeUInt32LE(36 + dataSize, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * ch * bytes, 28); b.writeUInt16LE(ch * bytes, 32); b.writeUInt16LE(24, 34);
  b.write('data', 36); b.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const v of [buf.l[i], buf.r[i]]) {
      const s = Math.max(-1, Math.min(1, v));
      const q = Math.round(s * 8388607);
      b.writeIntLE(q, o, 3); o += 3;
    }
  }
  fs.writeFileSync(file, b);
  console.log('wrote', file, (dataSize / 1024 / 1024).toFixed(2) + 'MB');
}

// ── 01 card bed: boom + drone + 120 BPM pulse + riser into the cut ──
{
  const b = new Buf(2.0);
  boom(b, 0, 0.95);
  // drone
  for (let i = 0; i < b.n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.25) * Math.min(1, (2.0 - t) / 0.12);
    const v = (Math.sin(TAU * 55 * t) * 0.11 + Math.sin(TAU * 82.5 * t + 0.7) * 0.06 + Math.sin(TAU * 110 * t + 1.9) * 0.03) * env;
    b.add(i, v, v * 0.96);
  }
  [0.5, 1.0, 1.5].forEach((t, k) => kick(b, t, 0.42 - k * 0.03));
  riser(b, 0.45, 1.55, 0.36);
  reverb(b, 0.18);
  // normalise
  let mx = 0; for (let i = 0; i < b.n; i++) mx = Math.max(mx, Math.abs(b.l[i]), Math.abs(b.r[i]));
  const g = 0.82 / (mx || 1); for (let i = 0; i < b.n; i++) { b.l[i] *= g; b.r[i] *= g; }
  writeWav(path.join(OUT, 'card_bed.wav'), b);
}

// ── 02 end impact ──
{
  const b = new Buf(1.8);
  boom(b, 0, 1.0);
  shimmer(b, 0.02, 1.4, 0.05);
  reverb(b, 0.32);
  let mx = 0; for (let i = 0; i < b.n; i++) mx = Math.max(mx, Math.abs(b.l[i]), Math.abs(b.r[i]));
  const g = 0.82 / (mx || 1); for (let i = 0; i < b.n; i++) { b.l[i] *= g; b.r[i] *= g; }
  writeWav(path.join(OUT, 'impact.wav'), b);
}

// ── 03 end card bed: F minor pad + impact tail ──
{
  const b = new Buf(2.8);
  boom(b, 0, 0.7);
  // F2 C3 Ab3 Eb4
  pad(b, 0.0, 2.8, [41, 48, 56, 63], 0.22, 900);
  pad(b, 0.25, 2.4, [65, 68, 72], 0.08, 1600);
  shimmer(b, 0.15, 1.9, 0.045);
  reverb(b, 0.36);
  let mx = 0; for (let i = 0; i < b.n; i++) mx = Math.max(mx, Math.abs(b.l[i]), Math.abs(b.r[i]));
  const g = 0.8 / (mx || 1);
  for (let i = 0; i < b.n; i++) {
    const fade = Math.min(1, (b.n - i) / (0.7 * SR));
    b.l[i] *= g * fade; b.r[i] *= g * fade;
  }
  writeWav(path.join(OUT, 'end_bed.wav'), b);
}

// ── 04 whoosh (menu -> gameplay) ──
{
  const b = new Buf(0.8);
  riser(b, 0.0, 0.55, 0.5);
  const i0 = 0; for (let i = 0; i < b.n; i++) {
    const u = i / b.n;
    const env = Math.exp(-Math.pow((u - 0.55) / 0.22, 2));
    b.l[i] += (rnd() * 2 - 1) * env * 0.05;
    b.r[i] += (rnd() * 2 - 1) * env * 0.05;
  }
  reverb(b, 0.2);
  let mx = 0; for (let i = 0; i < b.n; i++) mx = Math.max(mx, Math.abs(b.l[i]), Math.abs(b.r[i]));
  const g = 0.75 / (mx || 1); for (let i = 0; i < b.n; i++) { b.l[i] *= g; b.r[i] *= g; }
  writeWav(path.join(OUT, 'whoosh.wav'), b);
}
