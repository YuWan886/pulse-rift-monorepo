/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — procedural film timeline
   Everything is locked to a 120 BPM grid. 48 bars, 96 seconds.
   ═══════════════════════════════════════════════════════════════ */

export const BPM = 120;
export const BEAT = 60 / BPM;                 // 0.5 s
export const BAR = BEAT * 4;                  // 2 s
export const TOTAL_BARS = 48;
export const TOTAL_BEATS = TOTAL_BARS * 4;    // 192
export const DURATION = TOTAL_BEATS * BEAT;   // 96 s

export const C = {
  bg: '#05020c',
  ink: '#e9fbff',
  cyan: '#37f5ff',
  gold: '#ffd166',
  magenta: '#ff2e88',
  violet: '#b26bff',
  green: '#5dffa8',
  red: '#ff4e64',
  orange: '#ff8a3d'
};

/* ── sections ─────────────────────────────────────────────── */
export const SECTIONS = [
  { name: 'overture',  start: 0,   end: 16,  cn: '序曲',       en: 'OVERTURE' },
  { name: 'assembly',  start: 16,  end: 32,  cn: '装配',       en: 'ASSEMBLY' },
  { name: 'drop',      start: 32,  end: 64,  cn: '第一次心跳', en: 'FIRST HEARTBEAT' },
  { name: 'breakdown', start: 64,  end: 80,  cn: '降速',       en: 'HALF TIME' },
  { name: 'dodge',     start: 80,  end: 96,  cn: '相位',       en: 'PHASE' },
  { name: 'gallery',   start: 96,  end: 112, cn: '构筑',       en: 'BUILD' },
  { name: 'boss',      start: 112, end: 144, cn: '指挥家',     en: 'THE MAESTRO' },
  { name: 'overdrive', start: 144, end: 160, cn: '超频',       en: 'OVERDRIVE' },
  { name: 'outro',     start: 160, end: 176, cn: '余响',       en: 'AFTERIMAGE' },
  { name: 'endcard',   start: 176, end: 192, cn: '终曲',       en: 'FINALE' }
];

export function sectionAt(beat) {
  for (const s of SECTIONS) if (beat >= s.start && beat < s.end) return s;
  return SECTIONS[SECTIONS.length - 1];
}

/* ── harmony : one chord per bar (4 beats) ────────────────── */
// midi roots. F minor world, lifted to G minor for the climax.
const CHORD_DEFS = [
  // 0-3  overture : Fm pedal
  ['Fm', 'Fm', 'Fm', 'Fm'],
  // 4-7  assembly
  ['Fm', 'Db', 'Ab', 'Eb'],
  // 8-11 drop A
  ['Fm', 'Db', 'Ab', 'Eb'],
  // 12-15 drop B
  ['Fm', 'Db', 'Ab', 'C'],
  // 16-19 half time
  ['Bbm', 'Db', 'Ab', 'Eb'],
  // 20-23 phase build
  ['Bbm', 'Db', 'Ab', 'C'],
  // 24-27 gallery build
  ['Fm', 'Db', 'Ab', 'C'],
  // 28-31 boss approach
  ['Fm', 'Bbm', 'Db', 'C'],
  // 32-35 boss
  ['Fm', 'Ab', 'Bbm', 'C'],
  // 36-39 overdrive (whole step up -> G minor)
  ['Gm', 'Eb', 'Bb', 'F'],
  // 40-43 outro
  ['Fm', 'Db', 'Ab', 'Eb'],
  // 44-47 endcard
  ['Fm', 'Db', 'Ab', 'Fm']
].flat();

const CHORDS = {
  Fm:  { root: 53, tones: [0, 3, 7],  ninth: 10 }, // F3 root
  Db:  { root: 49, tones: [0, 4, 7],  ninth: 9 },  // Db3
  Ab:  { root: 56, tones: [0, 4, 7],  ninth: 9 },  // Ab3
  Eb:  { root: 51, tones: [0, 4, 7],  ninth: 10 }, // Eb3
  Bbm: { root: 46, tones: [0, 3, 7],  ninth: 10 }, // Bb2
  Bb:  { root: 46, tones: [0, 4, 7],  ninth: 9 },  // Bb2 (major)
  C:   { root: 48, tones: [0, 4, 7],  ninth: 9 },  // C3
  Gm:  { root: 55, tones: [0, 3, 7],  ninth: 10 }, // G3
  F:   { root: 53, tones: [0, 4, 7],  ninth: 9 }   // F3
};

export const BARS = CHORD_DEFS.map((name, i) => {
  const c = CHORDS[name];
  return {
    bar: i, beat: i * 4, name,
    root: c.root,
    tones: c.tones.map(t => c.root + t),
    ninth: c.root + c.ninth,
    notes: c.tones.map(t => c.root + t),
    // pad voicing a couple of octaves up
    pad: c.tones.map(t => c.root + 12 + t),
    // arp chord tones + octave
    arp: [...c.tones.map(t => c.root + 24 + t), c.root + 36]
  };
});

export function chordAtBeat(beat) {
  const i = Math.max(0, Math.min(TOTAL_BARS - 1, Math.floor(beat / 4)));
  return BARS[i];
}

export function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

/* ── the shot melody ──────────────────────────────────────── */
// The sound of the gun is the sound of the score.
export const MOTIF = [0, 22, 0, 19, 0, 15, 17, 19, 0, 22, 24, 22, 19, 17, 15, 12];

export function shotNoteMidi(beat) {
  const c = chordAtBeat(beat);
  const step = Math.round(beat - c.beat) | 0;
  const idx = ((Math.round(beat) % MOTIF.length) + MOTIF.length) % MOTIF.length;
  const octave = 12 + (idx % 3 === 2 ? 12 : 0);
  return c.root + octave + MOTIF[idx];
}

/* ── perfect-shot beats (visual + chime sync) ─────────────── */
export const PERFECT_BEATS = [];
for (let b = 32; b < 64; b += 2) PERFECT_BEATS.push(b);
for (let b = 64; b < 80; b += 2) PERFECT_BEATS.push(b);
for (let b = 96; b < 112; b += 2) PERFECT_BEATS.push(b);
for (let b = 112; b < 160; b += 2) PERFECT_BEATS.push(b);

/* ── automatic edit : EDL ─────────────────────────────────── */
/* Shot length is chosen from the musical energy. Cuts land on
   the beat grid; downbeat cuts get glitch/flash transitions.     */

export const SHOTS = [
  // ── overture : 0-16
  { a: 0,  b: 8,  scene: 'void',   cam: 'slowPush',   cap: null },
  { a: 8,  b: 12, scene: 'void',   cam: 'pulseClose', cap: { kicker: 'TEMPO', cn: '120 BPM', en: 'THE ONLY RULE' } },
  { a: 12, b: 16, scene: 'void',   cam: 'wideDrift',  cap: { kicker: 'EVERY SHOT IS A NOTE', cn: '每一次射击，都是一个音符。', en: 'EVERY SHOT IS A NOTE' } },

  // ── assembly : 16-32 (build)
  { a: 16, b: 24, scene: 'logo',   cam: 'orbitFar',   cap: { kicker: 'RHYTHM × ROGUELIKE × TWIN-STICK', cn: '节奏 × 肉鸽 × 双摇杆', en: 'RHYTHM ROGUELIKE SHOOTER' } },
  { a: 24, b: 28, scene: 'logo',   cam: 'pushIn',     cap: null },
  { a: 28, b: 30, scene: 'logo',   cam: 'throughGate',cap: null },
  { a: 30, b: 32, scene: 'logo',   cam: 'slam',       cap: null, trans: 'flash' },

  // ── drop : 32-64
  { a: 32, b: 36, scene: 'logo',   cam: 'hero',       cap: { title: true, kicker: 'EVERY SHOT IS A NOTE', cn: '律 动 裂 隙', en: 'PULSE//RIFT' }, trans: 'flash' },
  { a: 36, b: 40, scene: 'logo',   cam: 'heroClose',  cap: { kicker: 'A RHYTHM ROGUELIKE SHOOTER', cn: '在崩坏的声场里，把每一次心跳写成子弹。', en: 'IN THE BROKEN SOUNDFIELD' } },
  { a: 40, b: 48, scene: 'combat', cam: 'diveIn',     mode: 'arena', hud: true, cap: { kicker: 'FIRE ON THE BEAT', cn: '踩着节拍开火', en: 'FIRE ON THE BEAT' } },
  { a: 48, b: 56, scene: 'combat', cam: 'topDown',    mode: 'arena', hud: true, cap: { kicker: 'PERFECT ×2.0', cn: '准星圆环闭合的瞬间，点击。', en: 'CLICK WHEN THE RING CLOSES' } },
  { a: 56, b: 64, scene: 'combat', cam: 'tracking',   mode: 'arena', hud: true, cap: { kicker: 'COMBO IS DAMAGE', cn: '连击即伤害。最高 +100%。', en: 'UP TO +100% DAMAGE' } },

  // ── breakdown : 64-80
  { a: 64, b: 68, scene: 'combat', cam: 'macroRing',  mode: 'arena', hud: true, cap: { kicker: 'PERFECT ±90 MS', cn: '圆环闭合的瞬间。', en: 'CLICK ON THE CLOSE' } },
  { a: 68, b: 72, scene: 'combat', cam: 'perfectMacro', mode: 'arena', hud: true, cap: { kicker: 'PERFECT', cn: '每一次射击，都是一个音符。', en: 'EVERY SHOT IS A NOTE' } },
  { a: 72, b: 76, scene: 'combat', cam: 'sideNotes',  mode: 'arena', hud: true, cap: { kicker: '120 BPM', cn: '你越准，世界越响。', en: 'THE MORE YOU HIT, THE LOUDER IT GETS' } },
  { a: 76, b: 80, scene: 'combat', cam: 'wideCombo',  mode: 'arena', hud: true, cap: { kicker: 'COMBO 100', cn: '连击，就是你的音量。', en: 'COMBO IS VOLUME' } },

  // ── phase / dodge : 80-96
  { a: 80, b: 84, scene: 'combat', cam: 'slowSwirl',  mode: 'dodge', hud: true, cap: { kicker: 'GRAZE THE VOID', cn: '危险，就是资源。', en: 'DANGER IS THE RESOURCE' } },
  { a: 84, b: 88, scene: 'combat', cam: 'dashClose',  mode: 'dodge', hud: true, cap: { kicker: 'PHASE DASH', cn: '闪避不是逃跑，是节拍动作。', en: 'DODGE IS A RHYTHM ACTION' } },
  { a: 88, b: 92, scene: 'combat', cam: 'shockwave',  mode: 'dodge', hud: true, cap: { kicker: 'PHASE SHOCKWAVE', cn: '在节拍上闪避，清空整片弹幕。', en: 'CLEAR THE FIELD ON THE BEAT' } },
  { a: 92, b: 96, scene: 'combat', cam: 'pullBack',   mode: 'dodge', hud: true, cap: null },

  // ── gallery : 96-112
  { a: 96,  b: 100, scene: 'gallery', cam: 'enterHall',  cap: { kicker: 'SIGNAL UPGRADE', cn: '26 种强化。四类音轨。', en: '26 UPGRADES / 4 TRACKS' } },
  { a: 100, b: 104, scene: 'gallery', cam: 'cardsOrbit', cap: { kicker: 'POWER · STREAM · GUARD · PHASE', cn: '火力 · 投射 · 生存 · 相位', en: 'FOUR SIGNAL CLASSES' } },
  { a: 104, b: 108, scene: 'gallery', cam: 'selectCard', cap: { kicker: 'LIVE ARRANGEMENT', cn: '每选一张，音乐就多一层。', en: 'EVERY PICK ADDS A LAYER' } },
  { a: 108, b: 112, scene: 'gallery', cam: 'staffRush', cap: { kicker: 'THE SCORE IS YOUR BUILD', cn: '你的构筑，就是乐谱。', en: 'YOUR BUILD IS THE SCORE' } },

  // ── boss : 112-144
  { a: 112, b: 116, scene: 'combat', cam: 'bossReveal', mode: 'boss', hud: true, cap: { kicker: 'WAVE 10 // CONDUCTOR OF THE VOID', cn: 'THE MAESTRO · 指挥家', en: 'THE MAESTRO' }, trans: 'flash' },
  { a: 116, b: 120, scene: 'combat', cam: 'bossOrbitLow', mode: 'boss', hud: true, cap: null },
  { a: 120, b: 124, scene: 'combat', cam: 'batonSweep', mode: 'boss', hud: true, cap: { kicker: 'EVERY FIVE WAVES', cn: '每 5 波，一位指挥家登场。', en: 'A CONDUCTOR ARRIVES' } },
  { a: 124, b: 128, scene: 'combat', cam: 'bulletRain', mode: 'boss', hud: true, cap: null },
  { a: 128, b: 132, scene: 'combat', cam: 'metronomeClose', mode: 'boss', hud: true, cap: { kicker: '120 BPM', cn: '所有弹幕，都踩着同一个节拍。', en: 'EVERY BULLET IS ON THE GRID' } },
  { a: 132, b: 136, scene: 'combat', cam: 'dodgeMacro', mode: 'boss', hud: true, cap: null },
  { a: 136, b: 140, scene: 'combat', cam: 'wideChaos', mode: 'boss', hud: true, cap: null },
  { a: 140, b: 144, scene: 'combat', cam: 'buildUp',   mode: 'boss', hud: true, cap: { kicker: 'SYNC 100%', cn: '同步率满格。准备超频。', en: 'OVERDRIVE READY' } },

  // ── overdrive : 144-160
  { a: 144, b: 148, scene: 'combat', cam: 'odActivate', mode: 'overdrive', hud: true, cap: { kicker: 'OVERDRIVE', cn: '超 频', en: 'OVERDRIVE' }, trans: 'flash' },
  { a: 148, b: 152, scene: 'combat', cam: 'odComet',    mode: 'overdrive', hud: true, cap: { kicker: '8 BEATS OF FULL POWER', cn: '8 拍火力全开。', en: '8 BEATS. FULL POWER.' } },
  { a: 152, b: 156, scene: 'combat', cam: 'odShatter',  mode: 'overdrive', hud: true, cap: null },
  { a: 156, b: 160, scene: 'combat', cam: 'odExplosion',mode: 'overdrive', hud: true, cap: null },

  // ── outro : 160-192
  { a: 160, b: 164, scene: 'outro', cam: 'aftermath',  cap: null },
  { a: 164, b: 168, scene: 'outro', cam: 'logoReform', cap: { kicker: 'THE LAST BAR', cn: '你不是在射击。你在作曲。', en: 'YOU ARE NOT SHOOTING. YOU ARE COMPOSING.' } },
  { a: 168, b: 172, scene: 'outro', cam: 'logoHero',   cap: { title: true, kicker: 'EVERY SHOT IS A NOTE', cn: '律 动 裂 隙', en: 'PULSE//RIFT' } },
  { a: 172, b: 176, scene: 'outro', cam: 'pullAway',   cap: { kicker: '120 BPM · GENERATIVE AUDIO · PROCEDURAL VISUALS', cn: '祝你活到最后一小节。', en: 'SURVIVE TO THE LAST BAR' } },
  { a: 176, b: 184, scene: 'outro', cam: 'endCard',    cap: { endcard: true, kicker: 'RHYTHM ROGUELIKE SHOOTER', cn: '律 动 裂 隙', en: 'PULSE//RIFT' } },
  { a: 184, b: 188, scene: 'outro', cam: 'endCardClose', cap: { endcard: true } },
  { a: 188, b: 192, scene: 'outro', cam: 'fadeOut',    cap: { endcard: true } }
];

export function shotAtBeat(beat) {
  for (const s of SHOTS) if (beat >= s.a && beat < s.b) return s;
  return SHOTS[SHOTS.length - 1];
}

/* ── transitions : cuts that deserve a flash / glitch ─────── */
export const CUTS = [];
for (let i = 1; i < SHOTS.length; i++) {
  CUTS.push({
    beat: SHOTS[i].a,
    prev: SHOTS[i - 1],
    next: SHOTS[i],
    kind: SHOTS[i].trans || (SHOTS[i].a % 8 === 0 ? 'glitch' : 'cut')
  });
}

/* ── named visual events consumed by both audio + renderer ── */
export const EVENTS = {
  drop: 32,
  title: 32,
  bossReveal: 112,
  overdrive: 144,
  bossDeath: 158,
  explosion: 159,
  logoReturn: 164,
  endCard: 176,
  finalBeat: 190
};
