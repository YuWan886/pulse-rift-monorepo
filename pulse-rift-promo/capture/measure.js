/* Measure marker alignment: white flash in video, 1 kHz tone in audio.
   usage: node capture/measure.js <name>   (expects capture/<name>_video.mp4 and <name>_audio.webm)
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const name = process.argv[2];
if (!name) { console.error('usage: node measure.js <name>'); process.exit(1); }
const cap = path.resolve(__dirname);
const video = path.join(cap, name + '_video.mp4');
const audio = path.join(cap, name + '_audio.webm');
const statsFile = path.join(cap, '_stats_' + name + '.txt');

execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', name + '_video.mp4', '-t', '1.2', '-vf', 'signalstats,metadata=print:file=_stats_' + name + '.txt', '-f', 'null', '-'], { cwd: cap });
const txt = fs.readFileSync(statsFile, 'utf8');
const frames = [];
let cur = null;
for (const line of txt.split(/\r?\n/)) {
  const m = line.match(/^frame:(\d+)\s+pts:(\d+)\s+pts_time:([-\d.]+)/);
  if (m) { cur = { n: +m[1], t: +m[3], y: null }; frames.push(cur); continue; }
  const y = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  if (y && cur) cur.y = +y[1];
}
let flash = null;
if (frames.length) {
  const base = frames[0].y || 16;
  let best = frames[0];
  for (const f of frames) if (f.y !== null && f.y > (best.y || 0)) best = f;
  // first frame that clearly exceeds the dark baseline
  const thresh = Math.max(base + 35, 90);
  const first = frames.find(f => f.y !== null && f.y > thresh);
  flash = (first || best).t;
}
// audio: 1 kHz Goertzel
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', name + '_audio.webm', '-t', '0.8', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'] , { cwd: cap, maxBuffer: 64 * 1024 * 1024 });
const sr = 48000;
const buf = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
const win = 480, hop = 240;
function goertzel(x, start, len, freq) {
  const w = 2 * Math.PI * freq / sr;
  const c = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < len; i++) {
    const v = x[start + i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (len - 1)));
    s0 = v + c * s1 - s2; s2 = s1; s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2);
}
const mags = [];
for (let s = 0; s + win < buf.length && s < sr * 0.6; s += hop) mags.push({ t: s / sr, m: goertzel(buf, s, win, 1000) });
const maxM = Math.max(...mags.map(x => x.m));
const peak = mags.find(x => x.m > maxM * 0.5);
let onset = peak ? peak.t : 0;
if (peak) {
  for (let i = mags.indexOf(peak) - 1; i >= 0; i--) {
    if (mags[i].m < maxM * 0.12) break;
    onset = mags[i].t;
  }
}
console.log(JSON.stringify({ name, flash: +(+flash).toFixed(4), tone: +onset.toFixed(4), delta: +(onset - flash).toFixed(4), frames: frames.length, peak: +maxM.toFixed(3) }));
