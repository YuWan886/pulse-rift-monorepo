/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — procedural soundtrack
   120 BPM · F minor · 48 bars · everything synthesized in code
   ═══════════════════════════════════════════════════════════════ */
import {
  BEAT, BARS, TOTAL_BEATS, DURATION, PERFECT_BEATS,
  chordAtBeat, midiToFreq, EVENTS
} from './timeline.js';

/* segment window (seconds, local to the offline context) */
let SEG_OFFSET = 0;          // absolute seconds subtracted from every event
let SEG_LIMIT = DURATION;    // local end of the segment
function live(t, dur = 0) {
  return t >= 0 && t <= SEG_LIMIT + 0.02 && (t + dur) > 0;
}

/* deterministic rng for noise textures */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function driveCurve(amount = 3, n = 1024) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function makeImpulse(ctx, seconds = 3.2, decay = 3.5) {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = mulberry32(1234 + ch * 77);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // sparse early reflections + dense exponential tail
      let v = (rnd() * 2 - 1) * Math.pow(1 - t, decay);
      if (i < sr * 0.08 && rnd() < 0.002) v += (rnd() * 2 - 1) * 1.8;
      data[i] = v;
    }
    // gentle low-pass shaping of the tail
    let prev = 0;
    for (let i = 0; i < len; i++) {
      prev = prev * 0.28 + data[i] * 0.72;
      data[i] = prev;
    }
  }
  return buf;
}

function setup(ctx) {
  const R = {};

  R.master = ctx.createGain();
  R.master.gain.value = 0.08;

  R.comp = ctx.createDynamicsCompressor();
  R.comp.threshold.value = -8;
  R.comp.knee.value = 22;
  R.comp.ratio.value = 1.8;
  R.comp.attack.value = 0.02;
  R.comp.release.value = 0.25;

  R.limiter = ctx.createWaveShaper();
  R.limiter.curve = driveCurve(0.9);
  R.limiter.oversample = '4x';

  R.analyser = null;

  R.hp = ctx.createBiquadFilter();
  R.hp.type = 'highpass'; R.hp.frequency.value = 30; R.hp.Q.value = 0.7;
  const RAW = typeof location !== 'undefined' && location.search.includes('raw=1');
  R.master.connect(R.hp);
  if (RAW) {
    R.hp.connect(ctx.destination);
  } else {
    R.hp.connect(R.comp);
    R.comp.connect(R.limiter);
    R.limiter.connect(ctx.destination);
  }

  // ── buses ───────────────────────────────────────────────
  R.drums = ctx.createGain(); R.drums.gain.value = 1.0; R.drums.connect(R.master);
  R.bass = ctx.createGain();  R.bass.gain.value = 1.0;
  R.music = ctx.createGain(); R.music.gain.value = 1.0;
  R.lead = ctx.createGain();  R.lead.gain.value = 0.9; R.lead.connect(R.master);
  R.fx = ctx.createGain();    R.fx.gain.value = 1.0; R.fx.connect(R.master);

  R.duck = ctx.createGain(); R.duck.gain.value = 1;
  R.bass.connect(R.duck);

  // subtle stereo widening for pads / arps / choir
  const mSplit = ctx.createChannelSplitter(2);
  const mL = ctx.createGain(); mL.gain.value = 1.0;
  const mR = ctx.createGain(); mR.gain.value = 0.95;
  const mDelay = ctx.createDelay(0.05); mDelay.delayTime.value = 0.0075;
  const mMerge = ctx.createChannelMerger(2);
  R.music.connect(mSplit);
  mSplit.connect(mL, 0, 0);
  mSplit.connect(mR, 1, 0);
  mR.connect(mDelay);
  mL.connect(mMerge, 0, 0);
  mDelay.connect(mMerge, 0, 1);
  mMerge.connect(R.duck);
  R.duck.connect(R.master);

  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  if (q.has('nodrums')) R.drums.gain.value = 0;
  if (q.has('nobass')) R.bass.gain.value = 0;
  if (q.has('nomusic')) R.music.gain.value = 0;
  if (q.has('nolead')) R.lead.gain.value = 0;
  if (q.has('nofx')) R.fx.gain.value = 0;

  // ── reverb : algorithmic (Freeverb-style) ──────────────
  // A dense feedback-delay network. Much cheaper offline than
  // convolution, and it gives the score its long neon tail.
  R.reverbIn = ctx.createGain(); R.reverbIn.gain.value = 1;
  R.reverbOut = ctx.createGain(); R.reverbOut.gain.value = 0.62;
  R.reverbHP = ctx.createBiquadFilter(); R.reverbHP.type = 'highpass'; R.reverbHP.frequency.value = 220;
  R.reverbIn.connect(R.reverbHP);

  const srR = ctx.sampleRate;
  const combDelays = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const allpassDelays = [556, 441, 341, 225];
  for (let ch = 0; ch < 2; ch++) {
    const sum = ctx.createGain(); sum.gain.value = 0.16;

    // parallel comb bank
    for (let i = 0; i < combDelays.length; i++) {
      const delay = ctx.createDelay(0.12);
      delay.delayTime.value = (combDelays[i] + ch * 23) / srR;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass'; damp.frequency.value = 3200 + i * 140;
      damp.Q.value = 0.15;
      const fb = ctx.createGain(); fb.gain.value = 0.74;
      R.reverbHP.connect(delay);
      delay.connect(damp); damp.connect(fb); fb.connect(delay);
      delay.connect(sum);
    }
    // series diffusion
    let node = sum;
    for (let i = 0; i < allpassDelays.length; i++) {
      const delay = ctx.createDelay(0.06);
      delay.delayTime.value = (allpassDelays[i] + ch * 23) / srR;
      const fb = ctx.createGain(); fb.gain.value = 0.55;
      const dry = ctx.createGain(); dry.gain.value = 0.65;
      const wet = ctx.createGain(); wet.gain.value = 0.65;
      node.connect(delay); delay.connect(fb); fb.connect(delay);
      delay.connect(wet); node.connect(dry);
      const next = ctx.createGain();
      wet.connect(next); dry.connect(next);
      node = next;
    }
    const p = ctx.createStereoPanner(); p.pan.value = ch === 0 ? -0.55 : 0.55;
    node.connect(p); p.connect(R.reverbOut);
  }
  R.reverbOut.connect(R.master);
  if (q.has('noreverb')) R.reverbOut.gain.value = 0;

  // ── ping-pong delay (dotted eighth) ─────────────────────
  R.delayIn = ctx.createGain(); R.delayIn.gain.value = 1;
  R.delayL = ctx.createDelay(2); R.delayL.delayTime.value = BEAT * 0.75;
  R.delayR = ctx.createDelay(2); R.delayR.delayTime.value = BEAT * 1.5;
  R.delayFb = ctx.createGain(); R.delayFb.gain.value = 0.34;
  R.delayFilter = ctx.createBiquadFilter(); R.delayFilter.type = 'lowpass'; R.delayFilter.frequency.value = 2600;
  R.delayOut = ctx.createGain(); R.delayOut.gain.value = 0.3;
  const pL = ctx.createStereoPanner(); pL.pan.value = -0.7;
  const pR = ctx.createStereoPanner(); pR.pan.value = 0.7;
  R.delayIn.connect(R.delayL);
  R.delayL.connect(pL); pL.connect(R.delayOut);
  R.delayL.connect(R.delayR);
  R.delayR.connect(pR); pR.connect(R.delayOut);
  R.delayR.connect(R.delayFilter); R.delayFilter.connect(R.delayFb); R.delayFb.connect(R.delayL);
  R.delayOut.connect(R.master);
  if (q.has('nodelay')) R.delayOut.gain.value = 0;
  R.delayOut.connect(R.reverbIn);

  // ── noise / textures ────────────────────────────────────
  const sr = ctx.sampleRate;
  const noiseLen = Math.floor(sr * 4);
  R.noise = ctx.createBuffer(2, noiseLen, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = mulberry32(99 + ch * 13);
    const d = R.noise.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < noiseLen; i++) {
      const w = rnd() * 2 - 1;
      // pinkish noise
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
  }
  R.noiseSrc = (t, dur, offset = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = R.noise;
    s.loop = true;
    s.start(t, (offset % 3.5));
    s.stop(t + dur + 0.05);
    return s;
  };

  return R;
}

/* ── primitive voices ───────────────────────────────────── */
function env(ctx, node, t, a, peak, d, sustain = 0.0001, hold = 0) {
  const g = node.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) g.setValueAtTime(peak, t + hold);
  g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + hold + d);
}

function pan(ctx, node, p) {
  const s = ctx.createStereoPanner();
  s.pan.value = p;
  node.connect(s);
  return s;
}

function send(ctx, R, node, amount, delay = 0) {
  if (amount <= 0 && delay <= 0) return;
  if (amount > 0) {
    const g = ctx.createGain(); g.gain.value = amount;
    node.connect(g); g.connect(R.reverbIn);
  }
  if (delay > 0) {
    const g = ctx.createGain(); g.gain.value = delay;
    node.connect(g); g.connect(R.delayIn);
  }
}

/* ── drums ──────────────────────────────────────────────── */
function kick(ctx, R, t, vel = 1) {
  if (!live(t, 0.4)) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  const g = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(2.2);
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.075);
  o.frequency.exponentialRampToValueAtTime(41, t + 0.3);
  env(ctx, g, t, 0.002, 0.95 * vel, 0.3, 0.0001);
  o.connect(g); g.connect(shaper); shaper.connect(R.drums);
  o.start(t); o.stop(t + 0.36);

  // transient click
  const n = R.noiseSrc(t, 0.02, t * 7 + 0.3);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
  const ng = ctx.createGain(); env(ctx, ng, t, 0.001, 0.22 * vel, 0.018);
  n.connect(hp); hp.connect(ng); ng.connect(R.drums);
}

function snare(ctx, R, t, vel = 1) {
  if (!live(t, 0.3)) return;
  const n = R.noiseSrc(t, 0.3, t * 3.1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 620;
  const g = ctx.createGain(); env(ctx, g, t, 0.001, 0.34 * vel, 0.18, 0.0001);
  n.connect(bp); bp.connect(hp); hp.connect(g);
  send(ctx, R, g, 0.22);
  g.connect(R.drums);

  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
  const og = ctx.createGain(); env(ctx, og, t, 0.002, 0.22 * vel, 0.11);
  o.connect(og); og.connect(R.drums);
  o.start(t); o.stop(t + 0.16);
}

function clap(ctx, R, t, vel = 1) {
  if (!live(t, 0.1)) return;
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.011;
    const n = R.noiseSrc(tt, 0.16, tt * 5 + i);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const g = ctx.createGain(); env(ctx, g, tt, 0.001, (0.2 - i * 0.03) * vel, 0.1 - i * 0.015);
    n.connect(bp); bp.connect(hp); hp.connect(g);
    send(ctx, R, g, 0.32);
    g.connect(R.drums);
  }
}

function hat(ctx, R, t, vel = 0.3, open = false) {
  const dur = open ? 0.3 : 0.045;
  if (!live(t, dur)) return;
  const n = R.noiseSrc(t, dur, t * 11 + 0.7);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = open ? 6500 : 8200;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 11500; bp.Q.value = 0.6;
  const g = ctx.createGain(); env(ctx, g, t, 0.001, vel * (open ? 0.16 : 0.13), dur, 0.0001);
  n.connect(hp); hp.connect(bp); bp.connect(g);
  pan(ctx, g, (Math.random() * 0.5 + 0.25) * (Math.random() < 0.5 ? -1 : 1)).connect(R.drums);
}

function crash(ctx, R, t, vel = 0.5) {
  if (!live(t, 2.0)) return;
  const n = R.noiseSrc(t, 2.2, t * 2.3);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
  const g = ctx.createGain(); env(ctx, g, t, 0.002, vel, 1.9, 0.0001);
  n.connect(hp); hp.connect(g);
  send(ctx, R, g, 0.45);
  g.connect(R.drums);
}

function tom(ctx, R, t, vel = 0.4, freq = 120) {
  if (!live(t, 0.3)) return;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
  const g = ctx.createGain(); env(ctx, g, t, 0.002, vel * 0.4, 0.25);
  o.connect(g); send(ctx, R, g, 0.16); g.connect(R.drums);
  o.start(t); o.stop(t + 0.3);
}

/* ── tonal voices ───────────────────────────────────────── */
function bassNote(ctx, R, t, dur, midi, vel = 0.5, cutoff = 500) {
  if (!live(t, dur)) return;
  const f = midiToFreq(midi);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f; o1.detune.value = -6;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 1.005; o2.detune.value = 4;
  const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = f / 2;

  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
  lp.frequency.setValueAtTime(cutoff * 2.6, t);
  lp.frequency.exponentialRampToValueAtTime(cutoff * 0.55, t + 0.18);

  const g = ctx.createGain();
  env(ctx, g, t, 0.005, vel * 0.32, dur * 0.8, 0.0001, dur * 0.15);

  const gSub = ctx.createGain();
  env(ctx, gSub, t, 0.006, vel * 0.26, dur * 0.75, 0.0001, dur * 0.1);

  const shaper = ctx.createWaveShaper(); shaper.curve = driveCurve(2.4);
  o1.connect(lp); o2.connect(lp); lp.connect(shaper); shaper.connect(g);
  sub.connect(gSub);
  g.connect(R.bass); gSub.connect(R.bass);
  o1.start(t); o2.start(t); sub.start(t);
  [o1, o2, sub].forEach(o => o.stop(t + dur + 0.15));
}

function padChord(ctx, R, t, dur, midis, vel = 0.12, bright = 900, width = 1) {
  if (!live(t, dur * 1.3)) return;
  for (let i = 0; i < midis.length; i++) {
    const note = midis[i];
    const f = midiToFreq(note);
    for (let v = 0; v < 2; v++) {
      const o = ctx.createOscillator();
      o.type = v === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f * (v === 0 ? 1 : 2.003);
      o.detune.value = (v === 0 ? -7 : 6) + i * 1.5;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(bright * 0.35, t);
      lp.frequency.linearRampToValueAtTime(bright, t + dur * 0.55);
      const g = ctx.createGain();
      const peak = vel / Math.sqrt(midis.length) * (v === 0 ? 1 : 0.32);
      env(ctx, g, t, dur * 0.18, peak, dur * 0.6, 0.0001, dur * 0.35);
      o.connect(lp); lp.connect(g);
      const p = ctx.createStereoPanner();
      p.pan.value = Math.sin(i * 2.1 + v * 0.9) * 0.55 * width;
      g.connect(p); p.connect(R.music);
      send(ctx, R, g, 0.5);
      o.start(t); o.stop(t + dur * 1.25);
    }
  }
  // airy shimmer
  const shimmer = ctx.createOscillator(); shimmer.type = 'sine';
  shimmer.frequency.value = midiToFreq(midis[midis.length - 1] + 12);
  shimmer.detune.value = 4;
  const sg = ctx.createGain(); env(ctx, sg, t, dur * 0.3, vel * 0.09, dur * 0.7, 0.0001, dur * 0.2);
  shimmer.connect(sg); sg.connect(R.music); send(ctx, R, sg, 0.8);
  shimmer.start(t); shimmer.stop(t + dur * 1.2);
}

function choir(ctx, R, t, dur, midis, vel = 0.08) {
  if (!live(t, dur * 1.3)) return;
  for (let i = 0; i < midis.length; i++) {
    const f = midiToFreq(midis[i]);
    for (let v = 0; v < 3; v++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = (v - 1) * 9 + i * 2;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
      bp.frequency.value = 620 + v * 260 + i * 90;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const g = ctx.createGain();
      env(ctx, g, t, dur * 0.25, vel / Math.sqrt(midis.length), dur * 0.6, 0.0001, dur * 0.3);
      o.connect(bp); bp.connect(lp); lp.connect(g);
      const p = ctx.createStereoPanner(); p.pan.value = (v - 1) * 0.6;
      g.connect(p); p.connect(R.music);
      send(ctx, R, g, 0.75);
      o.start(t); o.stop(t + dur * 1.3);
    }
  }
}

function arpNote(ctx, R, t, dur, midi, vel = 0.2, cutoff = 2600, panV = 0) {
  if (!live(t, dur)) return;
  const f = midiToFreq(midi);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 2; o2.detune.value = 5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3.5;
  lp.frequency.setValueAtTime(cutoff, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(280, cutoff * 0.22), t + dur * 0.9);
  const g = ctx.createGain();
  env(ctx, g, t, 0.003, vel * 0.26, dur * 0.95, 0.0001);
  o1.connect(lp); o2.connect(lp); lp.connect(g);
  const p = ctx.createStereoPanner(); p.pan.value = panV;
  g.connect(p); p.connect(R.music);
  send(ctx, R, g, 0.18, 0.32);
  o1.start(t); o2.start(t);
  o1.stop(t + dur + 0.08); o2.stop(t + dur + 0.08);
}

function leadNote(ctx, R, t, dur, midi, vel = 0.5, bright = 3600, glideFrom = null) {
  if (!live(t, dur)) return;
  const f = midiToFreq(midi);
  const g = ctx.createGain();
  env(ctx, g, t, 0.02, vel * 0.16, Math.max(0.12, dur * 0.9), 0.0001, dur * 0.45);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.2;
  lp.frequency.setValueAtTime(bright * 0.7, t);
  lp.frequency.linearRampToValueAtTime(bright, t + 0.08);
  lp.frequency.exponentialRampToValueAtTime(bright * 0.4, t + dur);
  const vibrato = ctx.createOscillator(); vibrato.frequency.value = 5.4;
  const vg = ctx.createGain(); vg.gain.value = 7;
  vibrato.connect(vg);

  for (let v = 0; v < 2; v++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(glideFrom ? midiToFreq(glideFrom) : f, t);
    if (glideFrom) o.frequency.exponentialRampToValueAtTime(f, t + 0.055);
    o.detune.value = v === 0 ? -8 : 8;
    vg.connect(o.detune);
    o.connect(lp);
    o.start(t); o.stop(t + dur + 0.2);
  }
  const sq = ctx.createOscillator(); sq.type = 'square'; sq.frequency.value = f / 2;
  const sg = ctx.createGain(); sg.gain.value = 0.25; sq.connect(sg); sg.connect(lp);
  sq.start(t); sq.stop(t + dur + 0.2);
  vibrato.start(t); vibrato.stop(t + dur + 0.2);

  lp.connect(g); g.connect(R.lead);
  send(ctx, R, g, 0.3, 0.28);
}

function chime(ctx, R, t, midi, vel = 0.25, bright = 1) {
  if (!live(t, 0.9)) return;
  const f = midiToFreq(midi);
  const car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
  const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 3.01;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(f * 2.2 * bright, t);
  modGain.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.45);
  mod.connect(modGain); modGain.connect(car.frequency);

  const car2 = ctx.createOscillator(); car2.type = 'sine'; car2.frequency.value = f * 2.005;
  const g2 = ctx.createGain(); env(ctx, g2, t, 0.002, vel * 0.28, 0.5);

  const g = ctx.createGain(); env(ctx, g, t, 0.002, vel, 0.75);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
  car.connect(hp); hp.connect(g); car2.connect(g2); g2.connect(g);
  const p = ctx.createStereoPanner(); p.pan.value = (midi % 5 - 2) * 0.16;
  g.connect(p); p.connect(R.lead);
  send(ctx, R, g, 0.38, 0.34);

  car.start(t); mod.start(t); car2.start(t);
  car.stop(t + 0.9); mod.stop(t + 0.5); car2.stop(t + 0.6);
}

/* ── fx ─────────────────────────────────────────────────── */
function impact(ctx, R, t, vel = 1, tone = 46) {
  if (!live(t, 1.3)) return;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(tone, t + 0.5);
  const g = ctx.createGain(); env(ctx, g, t, 0.003, vel * 0.9, 1.1, 0.0001);
  o.connect(g); g.connect(R.fx);
  o.start(t); o.stop(t + 1.3);

  const n = R.noiseSrc(t, 0.8, t * 1.7);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.7);
  const ng = ctx.createGain(); env(ctx, ng, t, 0.003, vel * 0.55, 0.7);
  n.connect(lp); lp.connect(ng); ng.connect(R.fx);
  send(ctx, R, ng, 0.6);
  send(ctx, R, g, 0.3);
}

function riser(ctx, R, t, dur, vel = 0.35) {
  if (!live(t, dur)) return;
  const n = R.noiseSrc(t, dur, t * 2.1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(260, t);
  bp.frequency.exponentialRampToValueAtTime(9500, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + dur * 0.92);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  n.connect(bp); bp.connect(g); send(ctx, R, g, 0.5); g.connect(R.fx);

  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, t + dur * 0.5);
  o.frequency.exponentialRampToValueAtTime(880, t + dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t + dur * 0.5);
  og.gain.exponentialRampToValueAtTime(vel * 0.22, t + dur * 0.97);
  og.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(og); og.connect(R.fx); send(ctx, R, og, 0.4);
  o.start(t + dur * 0.5); o.stop(t + dur + 0.05);
}

function reverseSwell(ctx, R, t, dur, vel = 0.25) {
  if (!live(t, dur)) return;
  const n = R.noiseSrc(t, dur, t * 3.3);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + dur * 0.98);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.01);
  n.connect(hp); hp.connect(g); send(ctx, R, g, 0.6); g.connect(R.fx);
}

function whoosh(ctx, R, t, dur = 0.5, vel = 0.25, dir = 1) {
  if (!live(t, dur)) return;
  const n = R.noiseSrc(t, dur, t * 4.1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(dir > 0 ? 500 : 6000, t);
  bp.frequency.exponentialRampToValueAtTime(dir > 0 ? 7000 : 400, t + dur);
  const g = ctx.createGain(); env(ctx, g, t, dur * 0.3, vel, dur * 0.7);
  const p = ctx.createStereoPanner();
  p.pan.setValueAtTime(-0.9 * dir, t);
  p.pan.linearRampToValueAtTime(0.9 * dir, t + dur);
  n.connect(bp); bp.connect(g); g.connect(p); p.connect(R.fx);
  send(ctx, R, g, 0.35);
}

function glitch(ctx, R, t, dur = 0.2, vel = 0.14) {
  if (!live(t, dur)) return;
  const rnd = mulberry32(Math.floor(t * 1000));
  let tt = t;
  while (tt < t + dur) {
    const d = 0.012 + rnd() * 0.03;
    const o = ctx.createOscillator();
    o.type = rnd() < 0.5 ? 'square' : 'sawtooth';
    o.frequency.value = 180 + Math.floor(rnd() * 24) * 90;
    const g = ctx.createGain(); env(ctx, g, tt, 0.001, vel * (0.4 + rnd() * 0.6), d * 0.8);
    o.connect(g); g.connect(R.fx);
    o.start(tt); o.stop(tt + d + 0.01);
    tt += d + 0.004 + rnd() * 0.04;
  }
}

function heartbeat(ctx, R, t, vel = 0.5) {
  if (!live(t, 0.4)) return;
  for (let i = 0; i < 2; i++) {
    const tt = t + i * 0.145;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(64, tt);
    o.frequency.exponentialRampToValueAtTime(42, tt + 0.1);
    const g = ctx.createGain(); env(ctx, g, tt, 0.003, vel * (i ? 0.55 : 0.85), 0.16);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    o.connect(lp); lp.connect(g); g.connect(R.drums); send(ctx, R, g, 0.18);
    o.start(tt); o.stop(tt + 0.22);
  }
}

function pulseBoom(ctx, R, t, vel = 0.5) {
  if (!live(t, 0.8)) return;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
  const g = ctx.createGain(); env(ctx, g, t, 0.004, vel, 0.55);
  o.connect(g); g.connect(R.fx); send(ctx, R, g, 0.4);
  o.start(t); o.stop(t + 0.8);
}

function bossRoar(ctx, R, t, dur = 1.8, vel = 0.5) {
  if (!live(t, dur)) return;
  for (let v = 0; v < 3; v++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(44 + v * 3, t);
    o.frequency.linearRampToValueAtTime(36 + v * 2, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.linearRampToValueAtTime(700, t + dur * 0.4);
    lp.frequency.linearRampToValueAtTime(160, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.16, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sh = ctx.createWaveShaper(); sh.curve = driveCurve(3.2);
    o.connect(lp); lp.connect(sh); sh.connect(g); g.connect(R.fx); send(ctx, R, g, 0.5);
    o.start(t); o.stop(t + dur + 0.1);
  }
  const n = R.noiseSrc(t, dur, t * 1.3);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 280; bp.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.2);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(bp); bp.connect(ng); send(ctx, R, ng, 0.6); ng.connect(R.fx);
}

function powerUp(ctx, R, t, dur = 1.6, vel = 0.5, base = 0) {
  if (!live(t, dur)) return;
  const notes = [0, 3, 7, 10, 12, 15, 19, 22, 24];
  for (let i = 0; i < notes.length; i++) {
    const tt = t + dur * (i / notes.length) * 0.9;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.value = midiToFreq(65 + notes[i] + base);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200 + i * 500;
    const g = ctx.createGain(); env(ctx, g, tt, 0.005, vel * 0.12, 0.18);
    o.connect(lp); lp.connect(g); g.connect(R.lead); send(ctx, R, g, 0.3, 0.4);
    o.start(tt); o.stop(tt + 0.3);
  }
  riser(ctx, R, t, dur, vel * 0.6);
}

/* ── arrangement helpers ────────────────────────────────── */
function tAt(beat) { return beat * BEAT - SEG_OFFSET; }

function padForBar(ctx, R, bar, vel = 0.11, bright = 1000, durBeats = 4) {
  const c = BARS[bar];
  const notes = [...c.pad, c.ninth + 12];
  padChord(ctx, R, tAt(c.beat), tAt(c.beat + durBeats) - tAt(c.beat), notes, vel, bright);
}

function arpBar(ctx, R, bar, vel = 0.16, cutoff = 2600, sixteenth = true) {
  const c = BARS[bar];
  const seq = c.arp;
  const n = sixteenth ? 16 : 8;
  const step = 4 / n;
  const order = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2];
  for (let i = 0; i < n; i++) {
    const beat = c.beat + i * step;
    const midi = seq[order[i % order.length] % seq.length];
    const accent = i % 4 === 0 ? 1.15 : 1;
    arpNote(ctx, R, tAt(beat), tAt(step) * 0.82, midi, vel * accent, cutoff, (i % 2 ? 0.35 : -0.35));
  }
}

function bassBar(ctx, R, bar, vel = 0.5, cutoff = 520, sixteenth = false) {
  const c = BARS[bar];
  const root = c.root - 12;
  const pat = sixteenth
    ? [0, 0, 12, 0, 0, 7, 0, 12, 0, 0, 12, 7, 0, 10, 12, 7]
    : [0, 0, 12, 0, 7, 0, 12, 7];
  const n = pat.length;
  const step = 4 / n;
  for (let i = 0; i < n; i++) {
    const accent = i % 2 === 0 ? 1 : 0.72;
    const midi = root + pat[i];
    bassNote(ctx, R, tAt(c.beat + i * step), tAt(step) * 0.86, midi, vel * accent, cutoff);
  }
}

function drumBar(ctx, R, bar, opts = {}) {
  const { kick: useKick = true, clap: useClap = true, hats: useHats = true, open: useOpen = true, vel = 1 } = opts;
  const b0 = bar * 4;
  if (useKick) for (let i = 0; i < 4; i++) {
    kick(ctx, R, tAt(b0 + i), vel);
    duckAt(ctx, R, tAt(b0 + i));
  }
  if (useClap) { clap(ctx, R, tAt(b0 + 1), vel); clap(ctx, R, tAt(b0 + 3), vel); }
  if (useHats) for (let i = 0; i < 16; i++) {
    if (i % 4 === 0) continue;
    hat(ctx, R, tAt(b0 + i * 0.25), (i % 2 === 0 ? 0.34 : 0.22) * vel);
  }
  if (useOpen) for (let i = 0; i < 4; i++) hat(ctx, R, tAt(b0 + i + 0.5), 0.3 * vel, true);
}

function duckAt(ctx, R, t) {
  if (t < 0 || t > SEG_LIMIT + 0.02) return;
  const g = R.duck.gain;
  g.setValueAtTime(1, t);
  g.linearRampToValueAtTime(0.38, t + 0.008);
  g.linearRampToValueAtTime(1, t + 0.17);
}

function snareRoll(ctx, R, b0, b1, vel = 0.5, div = 4) {
  const step = 4 / div;
  for (let b = b0; b < b1; b += step) {
    const prog = (b - b0) / (b1 - b0);
    snare(ctx, R, tAt(b), vel * (0.35 + prog * 0.65));
  }
}

/* ── lead melody ────────────────────────────────────────── */
const MELODY_A = [
  [0, 72, 1.45], [1.5, 68, 0.45], [2, 72, 0.5], [2.5, 75, 1.4],
  [4, 77, 1.4], [5.5, 75, 0.5], [6, 73, 1.9],
  [8, 72, 0.9], [9, 75, 0.9], [10, 72, 0.9], [11, 68, 0.9],
  [12, 70, 1.4], [13.5, 67, 0.5], [14, 75, 1.9]
];
const MELODY_B = [
  [0, 72, 0.7], [0.75, 73, 0.25], [1, 75, 0.9], [2, 77, 0.9], [3, 75, 0.9],
  [4, 77, 0.9], [5, 80, 0.9], [6, 77, 0.9], [7, 75, 0.9],
  [8, 73, 0.9], [9, 72, 0.9], [10, 75, 1.8],
  [12, 79, 0.9], [13, 76, 0.9], [14, 79, 1.8]
];

function playMelody(ctx, R, startBeat, melody, vel = 0.5, transpose = 0, octave = 0) {
  let prev = null;
  for (const [off, midi, dur] of melody) {
    const beat = startBeat + off;
    if (beat >= TOTAL_BEATS) break;
    leadNote(ctx, R, tAt(beat), tAt(dur), midi + transpose + octave * 12, vel, 3400, prev);
    prev = midi + transpose + octave * 12;
  }
}

/* ── the full score ─────────────────────────────────────── */
function schedule(ctx, R) {
  /* ambient wind bed (segment-local, continuous across chunks) */
  const wind = R.noiseSrc(0, SEG_LIMIT, 0.2 + SEG_OFFSET * 0.37);
  const windLP = ctx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 420;
  const windG = ctx.createGain();
  windG.gain.setValueAtTime(SEG_OFFSET === 0 ? 0.0001 : 0.06, 0);
  if (SEG_OFFSET === 0) windG.gain.linearRampToValueAtTime(0.06, 6);
  if (SEG_OFFSET + SEG_LIMIT >= DURATION - 0.01) {
    windG.gain.setValueAtTime(0.06, Math.max(0, SEG_LIMIT - 3));
    windG.gain.linearRampToValueAtTime(0.0001, SEG_LIMIT);
  }
  wind.connect(windLP); windLP.connect(windG); windG.connect(R.master);
  send(ctx, R, windG, 0.3);

  /* ── 0-32 · overture / assembly ───────────────────────── */
  // sub drone (only chunks that overlap the overture)
  if (SEG_OFFSET < 32) {
    const drone = ctx.createOscillator(); drone.type = 'sine';
    drone.frequency.value = midiToFreq(29);
    const drone2 = ctx.createOscillator(); drone2.type = 'sine';
    drone2.frequency.value = midiToFreq(41); drone2.detune.value = 3;
    const droneG = ctx.createGain();
    droneG.gain.setValueAtTime(SEG_OFFSET === 0 ? 0.0001 : 0.22, 0);
    if (SEG_OFFSET === 0) droneG.gain.linearRampToValueAtTime(0.22, 5);
    if (SEG_OFFSET + SEG_LIMIT > 30) {
      const fadeAt = Math.max(0, Math.min(SEG_LIMIT, 30 - SEG_OFFSET));
      droneG.gain.setValueAtTime(0.22, fadeAt);
      droneG.gain.linearRampToValueAtTime(0.0001, Math.min(SEG_LIMIT, 32.2 - SEG_OFFSET));
    }
    drone.connect(droneG); drone2.connect(droneG); droneG.connect(R.master);
    drone.start(0); drone2.start(0);
    const stopAt = Math.min(SEG_LIMIT + 0.3, 32.5 - SEG_OFFSET);
    drone.stop(stopAt); drone2.stop(stopAt);
  }

  // heartbeat + intro percussion
  for (let bar = 0; bar < 8; bar++) {
    heartbeat(ctx, R, tAt(bar * 4), bar < 4 ? 0.42 : 0.55);
    if (bar >= 4) heartbeat(ctx, R, tAt(bar * 4 + 2), 0.3);
  }
  for (let b = 0; b < 16; b += 0.5) {
    hat(ctx, R, tAt(b), b % 4 === 0 ? 0.28 : 0.14);
  }
  for (let bar = 4; bar < 8; bar++) {
    for (let b = 0; b < 4; b += 0.5) {
      hat(ctx, R, tAt(bar * 4 + b), b === 0 ? 0.3 : 0.16);
    }
  }
  // sparse overture bells — high-frequency beacons in the void
  for (const [b, m] of [[0, 77], [4, 72], [8, 80], [12, 75], [16, 79], [20, 72], [24, 80], [28, 77]]) {
    chime(ctx, R, tAt(b), m, 0.085, 0.5);
  }

  // pads & arp grow
  for (let bar = 0; bar < 8; bar++) {
    const fade = bar < 4 ? 0.06 + bar * 0.012 : 0.085 + (bar - 4) * 0.012;
    padForBar(ctx, R, bar, fade, 900 + bar * 180);
  }
  for (let bar = 2; bar < 4; bar++) arpBar(ctx, R, bar, 0.045, 560, false);
  for (let bar = 4; bar < 8; bar++) arpBar(ctx, R, bar, 0.07 + (bar - 4) * 0.018, 500 + (bar - 4) * 260, false);

  reverseSwell(ctx, R, tAt(24), tAt(8), 0.2);
  riser(ctx, R, tAt(24), tAt(8), 0.32);
  snareRoll(ctx, R, 28, 32, 0.42, 4);
  reverseSwell(ctx, R, tAt(29), tAt(3), 0.32);
  for (let b = 30; b < 32; b += 0.25) tom(ctx, R, tAt(b), 0.3, 100 - (b - 30) * 18);

  /* ── 32-64 · drop A ───────────────────────────────────── */
  impact(ctx, R, tAt(32), 1.0, 38);
  crash(ctx, R, tAt(32), 0.55);

  for (let bar = 8; bar < 16; bar++) {
    drumBar(ctx, R, bar, { vel: 1 });
    bassBar(ctx, R, bar, 0.52, 560, false);
    padForBar(ctx, R, bar, 0.12, 1300);
    arpBar(ctx, R, bar, 0.15, 1800 + (bar - 8) * 130, true);
  }
  // fills every 4 bars
  snareRoll(ctx, R, 46.5, 48, 0.35, 4);
  snareRoll(ctx, R, 62, 64, 0.5, 4);
  for (let b = 63; b < 64; b += 0.25) tom(ctx, R, tAt(b), 0.35, 95 - (b - 63) * 20);

  playMelody(ctx, R, 40, MELODY_A, 0.5, 0, 0);
  playMelody(ctx, R, 56, MELODY_B, 0.52, 0, 0);

  // shot-note chimes
  for (const b of PERFECT_BEATS) {
    if (b < 32 || b >= 64) continue;
    chime(ctx, R, tAt(b), shotNote(b), 0.2, 1);
  }

  // sparkle arps over the drop
  for (let bar = 12; bar < 16; bar++) {
    const c = BARS[bar];
    for (let i = 0; i < 8; i++) {
      const tt = tAt(c.beat + i * 0.5);
      chime(ctx, R, tt, c.arp[(i * 3) % c.arp.length] + 12, 0.045, 0.6);
    }
  }

  /* ── 64-80 · breakdown / half time ────────────────────── */
  impact(ctx, R, tAt(64), 0.65, 34);
  for (let bar = 16; bar < 20; bar++) {
    padForBar(ctx, R, bar, 0.15, 900);
    choir(ctx, R, tAt(bar * 4), tAt(4) * 0.98, BARS[bar].pad, 0.07);
    if (bar < 18) {
      heartbeat(ctx, R, tAt(bar * 4), 0.42);
      heartbeat(ctx, R, tAt(bar * 4 + 2), 0.28);
    }
  }
  for (let bar = 18; bar < 20; bar++) {
    kick(ctx, R, tAt(bar * 4), 0.75); duckAt(ctx, R, tAt(bar * 4));
    kick(ctx, R, tAt(bar * 4 + 2), 0.65); duckAt(ctx, R, tAt(bar * 4 + 2));
    snare(ctx, R, tAt(bar * 4 + 2), 0.4);
    for (let i = 0; i < 8; i++) hat(ctx, R, tAt(bar * 4 + i * 0.5), i % 2 ? 0.1 : 0.16);
  }
  for (const b of PERFECT_BEATS) {
    if (b < 64 || b >= 80) continue;
    chime(ctx, R, tAt(b), shotNote(b), 0.19, 0.9);
  }
  // slow lead fragments
  leadNote(ctx, R, tAt(66), tAt(2), 72, 0.3, 2200);
  leadNote(ctx, R, tAt(70), tAt(2.2), 75, 0.3, 2200);
  leadNote(ctx, R, tAt(74), tAt(1.5), 73, 0.28, 2100);
  leadNote(ctx, R, tAt(76), tAt(3.5), 72, 0.32, 2400);

  riser(ctx, R, tAt(72), tAt(8), 0.26);
  snareRoll(ctx, R, 76, 80, 0.34, 4);
  reverseSwell(ctx, R, tAt(77), tAt(3), 0.3);

  /* ── 80-96 · phase / dodge ────────────────────────────── */
  impact(ctx, R, tAt(80), 0.8, 36);
  crash(ctx, R, tAt(80), 0.4);
  for (let bar = 20; bar < 24; bar++) {
    padForBar(ctx, R, bar, 0.14, 1100);
    choir(ctx, R, tAt(bar * 4), tAt(4) * 0.98, BARS[bar].pad, 0.07);
    bassBar(ctx, R, bar, bar >= 22 ? 0.4 : 0.24, bar >= 22 ? 620 : 320, false);
    arpBar(ctx, R, bar, bar >= 22 ? 0.13 : 0.07, bar >= 22 ? 2200 : 700, true);
    if (bar >= 22) {
      for (let i = 0; i < 4; i++) { kick(ctx, R, tAt(bar * 4 + i), 0.8); duckAt(ctx, R, tAt(bar * 4 + i)); }
      clap(ctx, R, tAt(bar * 4 + 1), 0.55); clap(ctx, R, tAt(bar * 4 + 3), 0.55);
    } else {
      heartbeat(ctx, R, tAt(bar * 4), 0.35);
    }
  }
  for (const b of [88, 89, 90, 91]) {
    // shockwave hits
    pulseBoom(ctx, R, tAt(b), 0.35);
  }
  for (const b of PERFECT_BEATS) {
    if (b < 80 || b >= 96) continue;
    chime(ctx, R, tAt(b), shotNote(b), 0.18, 0.9);
  }
  snareRoll(ctx, R, 92, 96, 0.45, 4);
  riser(ctx, R, tAt(92), tAt(4), 0.34);
  reverseSwell(ctx, R, tAt(93), tAt(3), 0.34);

  /* ── 96-112 · gallery / build ─────────────────────────── */
  impact(ctx, R, tAt(96), 0.85, 40);
  crash(ctx, R, tAt(96), 0.45);
  for (let bar = 24; bar < 28; bar++) {
    padForBar(ctx, R, bar, 0.12, 1200 + (bar - 24) * 160);
    bassBar(ctx, R, bar, 0.4 + (bar - 24) * 0.05, 500 + (bar - 24) * 90, false);
    arpBar(ctx, R, bar, 0.12 + (bar - 24) * 0.02, 1500 + (bar - 24) * 300, true);
    if (bar >= 25) {
      for (let i = 0; i < 4; i++) { kick(ctx, R, tAt(bar * 4 + i), 0.8); duckAt(ctx, R, tAt(bar * 4 + i)); }
      clap(ctx, R, tAt(bar * 4 + 1), 0.5); clap(ctx, R, tAt(bar * 4 + 3), 0.5);
      for (let i = 0; i < 16; i++) hat(ctx, R, tAt(bar * 4 + i * 0.25), i % 4 === 0 ? 0.2 : 0.1);
    }
  }
  for (const b of PERFECT_BEATS) {
    if (b < 96 || b >= 112) continue;
    chime(ctx, R, tAt(b), shotNote(b), 0.17, 1);
  }
  // upgrade UI blips
  for (const b of [96, 100, 104, 108]) chime(ctx, R, tAt(b), BARS[Math.floor(b / 4)].root + 36, 0.14, 0.7);
  snareRoll(ctx, R, 108, 112, 0.5, 4);
  riser(ctx, R, tAt(104), tAt(8), 0.34);
  reverseSwell(ctx, R, tAt(109), tAt(3), 0.34);

  /* ── 112-144 · boss ───────────────────────────────────── */
  impact(ctx, R, tAt(112), 1.0, 32);
  crash(ctx, R, tAt(112), 0.6);
  bossRoar(ctx, R, tAt(112), tAt(6), 0.75);
  for (let bar = 28; bar < 36; bar++) {
    const heavy = bar >= 32;
    drumBar(ctx, R, bar, { vel: heavy ? 1.05 : 0.95, open: true });
    bassBar(ctx, R, bar, heavy ? 0.6 : 0.5, heavy ? 700 : 600, true);
    padForBar(ctx, R, bar, 0.1, 900);
    choir(ctx, R, tAt(bar * 4), tAt(4) * 0.98, BARS[bar].pad, heavy ? 0.08 : 0.06);
    arpBar(ctx, R, bar, 0.13, 2400, true);
    // orchestral stabs on offbeats
    const c = BARS[bar];
    for (const off of [1.5, 3.5]) {
      const tt = tAt(c.beat + off);
      if (!live(tt, 0.3)) continue;
      for (const n of c.pad) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiToFreq(n + 12);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 2;
        const g = ctx.createGain(); env(ctx, g, tt, 0.004, 0.05, 0.16);
        o.connect(lp); lp.connect(g); g.connect(R.music); send(ctx, R, g, 0.3);
        o.start(tt); o.stop(tt + 0.25);
      }
    }
    if (heavy) {
      for (let i = 0; i < 16; i += 2) hat(ctx, R, tAt(bar * 4 + i * 0.25), 0.12);
      for (let i = 0; i < 4; i++) tom(ctx, R, tAt(bar * 4 + i + 0.75), 0.16, 110);
    }
  }
  playMelody(ctx, R, 120, MELODY_A, 0.38, -12, 1);
  playMelody(ctx, R, 128, MELODY_B, 0.4, -12, 1);
  // boss lead high counterline
  for (let bar = 32; bar < 36; bar++) {
    const c = BARS[bar];
    leadNote(ctx, R, tAt(bar * 4), tAt(1.5), c.pad[2] + 24, 0.2, 3000);
    leadNote(ctx, R, tAt(bar * 4 + 2), tAt(1), c.pad[1] + 24, 0.18, 3000);
  }
  for (const b of PERFECT_BEATS) {
    if (b < 112 || b >= 160) continue;
    chime(ctx, R, tAt(b), shotNote(b), 0.2, 1.1);
  }
  // build to overdrive
  snareRoll(ctx, R, 140, 143, 0.5, 4);
  riser(ctx, R, tAt(138), tAt(6), 0.38);
  reverseSwell(ctx, R, tAt(141), tAt(3), 0.4);
  // pre-drop gap
  if (live(tAt(143), 1.5)) {
    R.music.gain.setValueAtTime(1, tAt(143));
    R.music.gain.linearRampToValueAtTime(0.12, tAt(143.5));
    R.music.gain.setValueAtTime(1, tAt(144));
  }

  /* ── 144-160 · overdrive (G minor) ────────────────────── */
  impact(ctx, R, tAt(144), 1.15, 36);
  crash(ctx, R, tAt(144), 0.7);
  powerUp(ctx, R, tAt(144), tAt(4), 0.55, 0);
  for (let bar = 36; bar < 40; bar++) {
    drumBar(ctx, R, bar, { vel: 1.1 });
    for (let i = 0; i < 4; i++) {
      kick(ctx, R, tAt(bar * 4 + i + 0.5), 0.55);
      duckAt(ctx, R, tAt(bar * 4 + i + 0.5));
    }
    bassBar(ctx, R, bar, 0.62, 820, true);
    padForBar(ctx, R, bar, 0.13, 1600);
    choir(ctx, R, tAt(bar * 4), tAt(4) * 0.98, BARS[bar].pad, 0.09);
    arpBar(ctx, R, bar, 0.17, 3200, true);
  }
  playMelody(ctx, R, 144, MELODY_B, 0.55, 2, 0);
  playMelody(ctx, R, 152, MELODY_A, 0.5, 2, 1);
  for (const b of PERFECT_BEATS) {
    if (b < 144) continue;
    chime(ctx, R, tAt(b), shotNote(b), 0.22, 1.2);
  }
  // boss death & explosion
  bossRoar(ctx, R, tAt(156), tAt(3), 0.8);
  riser(ctx, R, tAt(155), tAt(3.5), 0.4);
  snareRoll(ctx, R, 156, 158, 0.55, 4);
  impact(ctx, R, tAt(159), 1.25, 28);
  crash(ctx, R, tAt(159), 0.85);
  // brief silence before outro pad
  if (live(tAt(158.5), 2)) {
    R.music.gain.setValueAtTime(0.1, tAt(158.5));
    R.music.gain.linearRampToValueAtTime(1, tAt(160.2));
  }

  /* ── 160-176 · outro ──────────────────────────────────── */
  for (let bar = 40; bar < 44; bar++) {
    padForBar(ctx, R, bar, 0.12, 800);
    choir(ctx, R, tAt(bar * 4), tAt(4), BARS[bar].pad, 0.055);
    heartbeat(ctx, R, tAt(bar * 4), 0.36);
    heartbeat(ctx, R, tAt(bar * 4 + 2), 0.24);
  }
  for (let bar = 40; bar < 44; bar++) {
    arpBar(ctx, R, bar, 0.08, 900, false);
  }
  // soft bell reprise
  const reprise = [[0, 72], [2, 75], [4, 77], [6, 75], [8, 72], [10, 68], [12, 70], [14, 67]];
  for (const [off, m] of reprise) chime(ctx, R, tAt(160 + off), m, 0.16, 0.7);
  chime(ctx, R, tAt(164), 84, 0.2, 1.0);
  chime(ctx, R, tAt(168), 80, 0.18, 1.0);
  reverseSwell(ctx, R, tAt(162), tAt(2), 0.2);
  pulseBoom(ctx, R, tAt(164), 0.35);
  reverseSwell(ctx, R, tAt(168), tAt(2), 0.22);
  impact(ctx, R, tAt(168), 0.55, 42);

  /* ── 176-192 · end card ───────────────────────────────── */
  for (let bar = 44; bar < 48; bar++) {
    padForBar(ctx, R, bar, 0.1, 700);
    heartbeat(ctx, R, tAt(bar * 4), 0.3);
  }
  chime(ctx, R, tAt(176), 77, 0.18, 1.1);
  chime(ctx, R, tAt(180), 72, 0.16, 0.9);
  chime(ctx, R, tAt(184), 75, 0.16, 0.9);
  chime(ctx, R, tAt(188), 68, 0.14, 0.8);
  pulseBoom(ctx, R, tAt(190), 0.5);
  const fT = tAt(190);
  if (fT >= 0 && fT < SEG_LIMIT) {
    const finalOsc = ctx.createOscillator(); finalOsc.type = 'sine';
    finalOsc.frequency.value = midiToFreq(41);
    const finalG = ctx.createGain();
    finalG.gain.setValueAtTime(0.0001, fT);
    finalG.gain.linearRampToValueAtTime(0.18, fT + 0.2);
    finalG.gain.exponentialRampToValueAtTime(0.0001, Math.min(SEG_LIMIT, fT + 2));
    finalOsc.connect(finalG); finalG.connect(R.master);
    finalOsc.start(fT); finalOsc.stop(Math.min(SEG_LIMIT + 0.05, fT + 2));
  }

  /* ── transitions & ear candy ──────────────────────────── */
  const cuts = [40, 48, 56, 64, 72, 76, 88, 96, 100, 104, 108, 120, 128, 136, 148, 152, 156, 164, 168, 176, 184];
  for (const b of cuts) whoosh(ctx, R, tAt(b) - 0.18, 0.55, 0.16, b % 8 === 0 ? 1 : -1);
  for (const b of [48, 56, 76, 100, 104, 128, 140, 156]) glitch(ctx, R, tAt(b), 0.22, 0.09);
  for (const b of [80, 84, 88, 92]) pulseBoom(ctx, R, tAt(b), 0.32);
  for (const b of [32, 64, 80, 96, 112, 144, 160, 176]) {
    reverseSwell(ctx, R, tAt(b) - 1.2, 1.2, 0.2);
  }
}

/* chime note helper */
function shotNote(beat) {
  const c = chordAtBeat(beat);
  const idx = Math.round(beat) % 8;
  const pattern = [0, 2, 1, 2, 0, 1, 2, 1];
  const tone = c.tones[pattern[idx] % c.tones.length];
  const octave = idx >= 4 ? 12 : 0;
  return tone + 24 + octave;
}

/* ── WAV encoding ───────────────────────────────────────── */
export function bufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, len * numCh * 2, true);
  const chans = [];
  for (let ch = 0; ch < numCh; ch++) chans.push(buffer.getChannelData(ch));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = chans[ch][i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}

export function bufferToWav32(buffer) {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const bytes = 44 + len * numCh * 4;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);          // IEEE float
  view.setUint16(22, numCh, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * numCh * 4, true);
  view.setUint16(32, numCh * 4, true);
  view.setUint16(34, 32, true);
  writeStr(36, 'data');
  view.setUint32(40, len * numCh * 4, true);
  const chans = [];
  for (let ch = 0; ch < numCh; ch++) chans.push(buffer.getChannelData(ch));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      view.setFloat32(off, chans[ch][i], true);
      off += 4;
    }
  }
  return ab;
}

export async function renderSoundtrackWindow(startSec, endSec, sampleRate = 48000) {
  SEG_OFFSET = startSec;
  SEG_LIMIT = endSec - startSec;
  const ctx = new OfflineAudioContext(2, Math.ceil((endSec - startSec) * sampleRate) + 64, sampleRate);
  const R = setup(ctx);
  schedule(ctx, R);
  return await ctx.startRendering();
}

export async function renderSoundtrack(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(DURATION * sampleRate), sampleRate);
  const R = setup(ctx);
  schedule(ctx, R);
  const buffer = await ctx.startRendering();
  return buffer;
}

/* Render the score in musical chunks. Each chunk gets a pre-roll
   so reverb, automation and pads carry across the seam; chunks are
   then crossfaded and concatenated into one continuous master.   */
export async function renderSoundtrackSegments(opts = {}) {
  const sampleRate = opts.sampleRate || 48000;
  const segmentSeconds = opts.segmentSeconds || 16;
  const preroll = opts.preroll ?? 4;
  const onProgress = opts.onProgress || (() => {});
  const totalLen = Math.ceil(DURATION * sampleRate);
  const channels = [new Float32Array(totalLen), new Float32Array(totalLen)];
  const fadeLen = Math.floor(0.04 * sampleRate);
  const log = [];

  const starts = [];
  for (let s = 0; s < DURATION - 1e-6; s += segmentSeconds) starts.push(s);

  for (let si = 0; si < starts.length; si++) {
    const start = starts[si];
    const end = Math.min(DURATION, start + segmentSeconds);
    const offset = Math.max(0, start - (si === 0 ? 0 : preroll));
    const limit = end - offset;
    SEG_OFFSET = offset;
    SEG_LIMIT = limit;

    const t0 = performance.now();
    const ctx = new OfflineAudioContext(2, Math.ceil(limit * sampleRate) + 64, sampleRate);
    const R = setup(ctx);
    schedule(ctx, R);
    const rendered = await ctx.startRendering();
    const renderMs = performance.now() - t0;

    const srcStart = Math.round((start - offset) * sampleRate);
    const dstStart = Math.round(start * sampleRate);
    const copyLen = Math.min(
      Math.round((end - start) * sampleRate),
      totalLen - dstStart,
      rendered.length - srcStart
    );
    for (let ch = 0; ch < 2; ch++) {
      const src = rendered.getChannelData(ch);
      const dst = channels[ch];
      for (let i = 0; i < copyLen; i++) {
        let v = src[srcStart + i];
        if (start > 0 && i < fadeLen) {
          const a = i / fadeLen;
          v = dst[dstStart + i] * (1 - a) + v * a;
        }
        dst[dstStart + i] = v;
      }
    }
    log.push({ start, end, offset, renderMs: Math.round(renderMs) });
    onProgress({ done: si + 1, total: starts.length, start, end, renderMs });
  }

  // tiny edge fades
  const edge = Math.floor(0.008 * sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = channels[ch];
    for (let i = 0; i < edge; i++) {
      const a = i / edge;
      d[i] *= a;
      d[totalLen - 1 - i] *= a;
    }
  }

  return {
    numberOfChannels: 2,
    length: totalLen,
    sampleRate,
    duration: DURATION,
    segments: log,
    getChannelData: (ch) => channels[ch]
  };
}
