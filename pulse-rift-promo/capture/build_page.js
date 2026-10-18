/* Assemble the page-screencast frames of a take into a CFR 60 fps video.
   usage: node capture/build_page.js <takeName> */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const name = process.argv[2];
if (!name) { console.error('usage: node build_page.js <takeName>'); process.exit(1); }
const dir = path.resolve(__dirname, 'frames_' + name);
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
const fr = meta.frames;
const lines = [];
for (let i = 0; i < fr.length; i++) {
  lines.push(`file '${fr[i].file}'`);
  const dur = i + 1 < fr.length ? (fr[i + 1].wall - fr[i].wall) / 1000 : 0.017;
  lines.push('duration ' + Math.max(dur, 0.001).toFixed(5));
}
lines.push(`file '${fr[fr.length - 1].file}'`);
fs.writeFileSync(path.join(dir, 'concat.txt'), lines.join('\n') + '\n');
const out = path.resolve(__dirname, name + '_page.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'concat.txt'),
  '-vf', 'fps=60,scale=1920:1080', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', out], { stdio: 'inherit' });
const dur = (fr[fr.length - 1].wall - fr[0].wall) / 1000;
console.log('WROTE', out, 'content start', ((fr[0].wall - meta.markerWall) / 1000).toFixed(3), 'duration', dur.toFixed(3));
