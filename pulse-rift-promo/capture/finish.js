/* concat segments, mux soundtrack, derive 1080p + posters */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const W = parseInt(process.env.W || '2560', 10);
const H = parseInt(process.env.H || '1440', 10);
const FPS = parseInt(process.env.FPS || '60', 10);
const ROOT = path.resolve(__dirname, '..', 'out');
const SEGDIR = path.join(ROOT, `segments_${W}x${H}_${FPS}`);
const AUDIO = path.join(ROOT, 'soundtrack_final.wav');
const MASTER = path.join(ROOT, `PULSE-RIFT_film_${W}x${H}_${FPS}.mp4`);
const MASTER_NOSOUND = path.join(ROOT, 'film_noaudio.mp4');
const H1080 = path.join(ROOT, 'PULSE-RIFT_film_1920x1080_60.mp4');

function ff(args) {
  console.log('ffmpeg', args.join(' '));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
}

for (let i = 0; i < 12; i++) {
  const f = path.join(SEGDIR, `seg_${String(i).padStart(2, '0')}.mp4`);
  if (!fs.existsSync(f) || fs.statSync(f).size < 10000) {
    console.error('missing segment', f); process.exit(1);
  }
}
const list = path.join(SEGDIR, 'concat.txt');
fs.writeFileSync(list, Array.from({ length: 12 }, (_, i) =>
  `file '${path.join(SEGDIR, `seg_${String(i).padStart(2, '0')}.mp4`).replace(/\\/g, '/')}'`).join('\n') + '\n');

ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-an', MASTER_NOSOUND]);
ff(['-y', '-i', MASTER_NOSOUND, '-i', AUDIO,
  '-map', '0:v:0', '-map', '1:a:0',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart', MASTER]);
ff(['-y', '-i', MASTER, '-vf', 'scale=1920:1080:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:a', 'copy', '-movflags', '+faststart', H1080]);

for (const [name, t] of [['poster_title', 18.2], ['poster_boss', 60.5], ['poster_endcard', 89.0]]) {
  ff(['-y', '-ss', String(t), '-i', MASTER, '-frames:v', '1',
    path.join(ROOT, name + '.png')]);
}
for (const f of [MASTER, H1080]) {
  const s = fs.statSync(f);
  console.log(f, (s.size / 1e6).toFixed(1), 'MB');
}
