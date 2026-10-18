/* Build a gameplay feature clip from a captured take.
   usage: node capture/edit_clip.js <specName>
*/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CAP = path.resolve(__dirname);
const OUT = path.join(ROOT, 'out');
const TMP = path.join(CAP, 'edit');
const GRADE = "eq=saturation=1.10:gamma=1.15,unsharp=5:5:0.35:5:5:0.0,vignette=angle=PI/5,noise=alls=3:allf=t+u";
const CARD_DUR = 2.0, END_DUR = 2.4, CONTENT0 = 0.09;

function run(args, opts = {}) {
  try { execFileSync(args[0], args.slice(1), { stdio: 'inherit', ...opts }); }
  catch (e) { console.error('FAILED', args.join(' ')); throw e; }
}
const frames = (dur) => Math.round(dur * 60);

function buildSegment(spec, seg, idx, dir) {
  const out = path.join(dir, 'seg' + String(idx).padStart(2, '0') + '.mp4');
  const N = frames(seg.dur);
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '11', '-pix_fmt', 'yuv420p',
    '-r', '60', '-video_track_timescale', '60000', '-an', '-frames:v', String(N), '-y', out];

  if (seg.type === 'card') {
    const vf = `scale=2560:1440,zoompan=z='1+${seg.zoom || 0.035}*on/${N}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=60,${GRADE}`;
    run(['ffmpeg', '-v', 'error', '-loop', '1', '-framerate', '60', '-t', String(seg.dur + 1), '-i', seg.png, '-vf', vf, ...enc]);
    return out;
  }

  if (seg.type === 'take' || seg.type === 'page') {
    const src = seg.type === 'take' ? path.join(CAP, spec.take + '_video.mp4') : path.join(CAP, spec.page);
    let ss = seg.type === 'take' ? spec.flash + seg.in : seg.in - spec.pageOffset;
    ss = Math.max(0, ss);
    let vf = 'fps=60';
    if (seg.crop) vf += `,crop=${seg.crop.w}:${seg.crop.h}:${seg.crop.x}:${seg.crop.y}`;
    vf += ',scale=1920:1080,' + GRADE;
    run(['ffmpeg', '-v', 'error', '-ss', String(ss), '-t', String(seg.dur + 0.2), '-i', src,
      '-vf', vf, ...enc]);
    return out;
  }
  throw new Error('bad segment type ' + seg.type);
}

function overlayCaption(base, cap, idx, dir, totalN) {
  const out = path.join(dir, 'cap' + String(idx).padStart(2, '0') + '.mp4');
  const t0 = CARD_DUR + (cap.t0 - CONTENT0);
  const t1 = CARD_DUR + (cap.t1 - CONTENT0);
  const dur = t1 - t0;
  const fc = `[1:v]scale=1920:1080,format=rgba,fade=t=in:st=${t0.toFixed(3)}:d=0.4:alpha=1,fade=t=out:st=${(t1 - 0.4).toFixed(3)}:d=0.4:alpha=1[c];[0:v][c]overlay=0:0:format=auto:enable='between(t,${t0.toFixed(3)},${t1.toFixed(3)})'[v]`;
  run(['ffmpeg', '-v', 'error', '-y', '-i', base,
    '-loop', '1', '-framerate', '60', '-t', String(totalN / 60 + 2), '-i', path.join(ROOT, 'cards', cap.png),
    '-filter_complex', fc, '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '60',
    '-video_track_timescale', '60000', '-an', '-frames:v', String(totalN), out]);
  return out;
}

function buildAudio(spec, dir, total, gameDur, endStart) {
  const out = path.join(dir, 'audio.wav');
  const webmAudio = path.join(CAP, spec.take + '_audio.webm');
  const takeAudio = path.join(dir, 'take.wav');
  // decode first: the MediaRecorder webm header declares a short duration
  run(['ffmpeg', '-v', 'error', '-y', '-i', webmAudio, '-ar', '48000', '-ac', '2', takeAudio]);
  const a0 = spec.tone + CONTENT0;
  const a1 = spec.tone + spec.lastContent;
  const fadeOutStart = Math.max(0, gameDur - 0.7);
  const fmt = 'aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo';
  run(['ffmpeg', '-v', 'error', '-y', '-i', path.join(ROOT, 'audio_sfx', 'card_bed.wav'),
    '-af', `atrim=0:${CARD_DUR},asetpts=PTS-STARTPTS,volume=1.0,${fmt}`, path.join(dir, 'a_card.wav')]);
  run(['ffmpeg', '-v', 'error', '-y', '-i', takeAudio,
    '-af', `atrim=start=${a0}:end=${a1},asetpts=PTS-STARTPTS,volume=12dB,alimiter=limit=0.89:attack=5:release=80:level=disabled,afade=t=in:st=0:d=0.12,afade=t=out:st=${fadeOutStart}:d=0.7,${fmt}`, path.join(dir, 'a_game.wav')]);
  run(['ffmpeg', '-v', 'error', '-y', '-i', path.join(ROOT, 'audio_sfx', 'end_bed.wav'),
    '-af', `volume=0.95,asetpts=PTS-STARTPTS,${fmt}`, path.join(dir, 'a_end.wav')]);
  const alist = path.join(dir, 'alist.txt');
  fs.writeFileSync(alist, ['a_card.wav', 'a_game.wav', 'a_end.wav'].map(f => `file '${f}'`).join('\n') + '\n');
  const joined = path.join(dir, 'joined.wav');
  run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', alist, '-c:a', 'pcm_s16le', joined]);
  run(['ffmpeg', '-v', 'error', '-y', '-i', joined,
    '-af', `loudnorm=I=-16:TP=-1.5:LRA=11,alimiter=limit=0.89,afade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6,atrim=0:${total.toFixed(3)}`,
    '-ar', '48000', '-ac', '2', out]);
  return out;
}

function makeClip(spec) {
  const dir = path.join(TMP, spec.name);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));

  if (spec.page) {
    const fj = path.join(CAP, 'frames_' + spec.take, 'frames.json');
    if (fs.existsSync(fj)) {
      const d = JSON.parse(fs.readFileSync(fj, 'utf8'));
      spec.pageOffset = (d.frames[0].wall - d.markerWall) / 1000;
    }
  }

  const segs = [];
  segs.push({ type: 'card', png: path.join(ROOT, spec.card), dur: CARD_DUR, zoom: spec.cardZoom || 0.035 });
  let lastContent = CONTENT0;
  for (const s of spec.segments) {
    const inT = s.in !== undefined ? s.in : lastContent;
    segs.push({ ...s, in: inT, dur: s.out - inT });
    lastContent = s.out;
  }
  segs.push({ type: 'card', png: path.join(ROOT, 'out', 'poster_endcard.png'), dur: END_DUR, zoom: 0.02 });

  const files = segs.map((s, i) => {
    console.log('segment', i, s.type || 'card', s.dur.toFixed(3));
    return buildSegment(spec, s, i, dir);
  });
  const list = path.join(dir, 'concat.txt');
  fs.writeFileSync(list, files.map(f => `file '${path.basename(f)}'`).join('\n') + '\n');
  let base = path.join(dir, 'base.mp4');
  run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', base]);

  let total = CARD_DUR + (lastContent - CONTENT0) + END_DUR;
  const totalN = frames(total);
  if (spec.captions && spec.captions.length) {
    spec.captions.forEach((c, i) => {
      const next = overlayCaption(base, c, i, dir, totalN);
      base = next;
    });
  }

  const gameDur = lastContent - CONTENT0;
  const endStart = CARD_DUR + gameDur;
  spec.lastContent = lastContent;
  const audio = buildAudio(spec, dir, total, gameDur, endStart);

  const final = path.join(OUT, spec.out);
  run(['ffmpeg', '-v', 'error', '-y', '-i', base, '-i', audio, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
    '-af', 'volume=-1.2dB', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-t', total.toFixed(3),
    '-movflags', '+faststart', final]);
  console.log('WROTE', final, 'duration', total.toFixed(2));
}

const SPECS = {
  core: {
    name: 'core',
    take: 'take_core8',
    flash: 0,
    tone: 0.01,
    card: 'cards/card01.png',
    out: 'PULSE-RIFT_gameplay_01_CORE_LOOP_1920x1080_60.mp4',
    segments: [{ type: 'take', in: 0.09, out: 15.2 }],
    captions: [
      { png: 'cap1.png', t0: 3.1, t1: 6.2 },
      { png: 'cap2.png', t0: 6.7, t1: 9.6 },
      { png: 'cap3.png', t0: 10.0, t1: 12.3 },
      { png: 'cap4.png', t0: 12.5, t1: 15.0 }
    ]
  },
  build: {
    name: 'build',
    take: 'take_build4',
    page: 'take_build4_page.mp4',
    pageOffset: 2.855,
    flash: 0,
    tone: 0.005,
    card: 'cards/card02.png',
    out: 'PULSE-RIFT_gameplay_02_SIGNAL_BUILD_1920x1080_60.mp4',
    whooshAt: 7.62,
    segments: [
      { type: 'take', in: 0.09, out: 2.945 },
      { type: 'page', in: 2.945, out: 3.015 },
      { type: 'page', in: 3.015, out: 7.25, crop: { x: 100, y: 90, w: 1720, h: 968 } },
      { type: 'page', in: 7.25, out: 7.62 },
      { type: 'take', in: 7.62, out: 19.4 }
    ],
    captions: [
      { png: 'cap5.png', t0: 8.9, t1: 12.1 },
      { png: 'cap6.png', t0: 12.8, t1: 15.6 },
      { png: 'cap10.png', t0: 15.9, t1: 18.4 }
    ]
  },
  threats: {
    name: 'threats',
    take: 'take_threat9',
    flash: 0.0451,
    tone: 0.02,
    card: 'cards/card03.png',
    out: 'PULSE-RIFT_gameplay_03_THREATS_1920x1080_60.mp4',
    segments: [{ type: 'take', in: 0.09, out: 18.8 }],
    captions: [
      { png: 'cap7.png', t0: 3.2, t1: 6.0 },
      { png: 'cap8.png', t0: 6.5, t1: 9.2 },
      { png: 'cap10.png', t0: 9.4, t1: 12.0 },
      { png: 'cap9.png', t0: 13.2, t1: 16.0 }
    ]
  },
  boss: {
    name: 'boss',
    take: 'gp_boss',
    flash: 0,
    tone: 0.01,
    card: 'cards/card04.png',
    out: 'PULSE-RIFT_gameplay_04_THE_MAESTRO_1920x1080_60.mp4',
    segments: [{ type: 'take', in: 0.09, out: 32.5 }],
    captions: [
      { png: 'cap11.png', t0: 4.3, t1: 7.3 },
      { png: 'cap12.png', t0: 15.2, t1: 18.0 },
      { png: 'cap13.png', t0: 24.2, t1: 27.0 },
      { png: 'cap10.png', t0: 27.8, t1: 30.2 },
      { png: 'cap14.png', t0: 30.7, t1: 32.5 }
    ]
  }
};

const which = process.argv[2];
if (!which || !SPECS[which]) { console.error('usage: node edit_clip.js core|build|threats|boss'); process.exit(1); }
makeClip(SPECS[which]);
