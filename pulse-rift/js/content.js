/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — game content: palette, enemies, upgrades, waves
   ═══════════════════════════════════════════════════════════════ */
(function (PR) {
  'use strict';
  const U = PR.U;

  const C = {
    bg: '#05020c',
    ink: '#e9fbff',
    white: '#ffffff',
    cyan: '#37f5ff',
    cyanSoft: '#9dfbff',
    gold: '#ffd166',
    magenta: '#ff2e88',
    violet: '#b26bff',
    green: '#5dffa8',
    red: '#ff4e64',
    orange: '#ff8a3d',
    // gameplay readability
    player: '#58f4ff',
    playerCore: '#eaffff',
    perfect: '#ffd166',
    enemy: '#ff3d88',
    enemyFast: '#ff8a3d',
    laser: '#ff3355',
    heal: '#5dffa8',
    shield: '#9dfbff'
  };

  const CAT_COLORS = {
    POWER: '#ff5c7a',
    STREAM: '#37f5ff',
    GUARD: '#5dffa8',
    PHASE: '#b26bff'
  };
  const CAT_CN = { POWER: '火力', STREAM: '投射', GUARD: '生存', PHASE: '相位' };
  const CAT_TRACK = { POWER: 'DRIVE', STREAM: 'ARP', GUARD: 'PAD', PHASE: 'PERC' };
  const RARITY_COLOR = { common: '#9db5c4', uncommon: '#37f5ff', rare: '#b26bff', epic: '#ffd166' };
  const RARITY_CN = { common: '常规', uncommon: '优良', rare: '稀有', epic: '史诗' };

  // ── enemies ──────────────────────────────────────────────────
  const ENEMIES = {
    drone: {
      name: 'DRONE', cn: '脉冲机', hp: 26, r: 15, speed: 60, score: 55,
      color: '#ff528f', contact: 12, fireInterval: 4, fireSpeed: 178
    },
    weaver: {
      name: 'WEAVER', cn: '织律者', hp: 38, r: 17, speed: 78, score: 85,
      color: '#ff8a3d', contact: 12, fireInterval: 4, fireSpeed: 165
    },
    orbiter: {
      name: 'ORBITER', cn: '轨道核', hp: 46, r: 18, speed: 60, score: 110,
      color: '#d95cff', contact: 14, fireInterval: 4, fireSpeed: 150
    },
    sniper: {
      name: 'SNIPER', cn: '切分狙击', hp: 30, r: 14, speed: 52, score: 100,
      color: '#ffd166', contact: 12, fireInterval: 6, fireSpeed: 430
    },
    brute: {
      name: 'BRUTE', cn: '重低音兽', hp: 185, r: 31, speed: 32, score: 300,
      color: '#ff4056', contact: 20, armor: true, fireInterval: 4, fireSpeed: 135
    },
    splitter: {
      name: 'SPLITTER', cn: '分裂酶', hp: 64, r: 20, speed: 56, score: 120,
      color: '#b06bff', contact: 14, fireInterval: 0, fireSpeed: 0
    },
    shard: {
      name: 'SHARD', cn: '碎片', hp: 13, r: 9, speed: 158, score: 25,
      color: '#e0aaff', contact: 10, fireInterval: 0, fireSpeed: 0
    },
    prism: {
      name: 'PRISM', cn: '棱镜塔', hp: 92, r: 23, speed: 0, score: 220,
      color: '#46ffd4', contact: 14, fireInterval: 8, fireSpeed: 0
    },
    stinger: {
      name: 'STINGER', cn: '突刺者', hp: 36, r: 14, speed: 120, score: 95,
      color: '#ffd166', contact: 16, fireInterval: 4, fireSpeed: 0
    }
  };

  // ── bosses ───────────────────────────────────────────────────
  const BOSSES = {
    ostinato: {
      key: 'ostinato', name: 'OSTINATO', cn: '固定音型',
      subtitle: 'THE LOCKED LOOP', hp: 3400, r: 70,
      color: '#ff2e88', accent: '#ffd166', contact: 24
    },
    maestro: {
      key: 'maestro', name: 'THE MAESTRO', cn: '指挥家',
      subtitle: 'CONDUCTOR OF THE VOID', hp: 8200, r: 86,
      color: '#ff2e88', accent: '#ffd166', contact: 26
    }
  };

  // ── sectors ──────────────────────────────────────────────────
  const SECTORS = [
    { name: 'SHALLOW ECHO', cn: '浅层回响', tint: '#37f5ff', accent: '#ff2e88', bg: '#070313', grid: '#1a3d52' },
    { name: 'DEEP PULSE', cn: '深层脉冲', tint: '#b26bff', accent: '#ffd166', bg: '#0a0418', grid: '#37205e' },
    { name: 'ENDLESS HALLS', cn: '无尽回廊', tint: '#ff2e88', accent: '#37f5ff', bg: '#0d0310', grid: '#4d1533' }
  ];
  function sectorFor(wave) {
    if (wave <= 5) return SECTORS[0];
    if (wave <= 10) return SECTORS[1];
    return SECTORS[2];
  }
  function sectorIndexFor(wave) {
    if (wave <= 5) return 0;
    if (wave <= 10) return 1;
    return 2;
  }

  // ── upgrades ─────────────────────────────────────────────────
  const UPGRADES = [
    // POWER
    { id: 'amp', name: 'AMPLIFIER', cn: '增幅器', cat: 'POWER', rarity: 'common', max: 5, glyph: '✦',
      desc: '所有射击伤害 +22%。简单、粗暴、震耳欲聋。' },
    { id: 'resonance', name: 'RESONANCE', cn: '共振腔', cat: 'POWER', rarity: 'rare', max: 3, glyph: '⌁',
      desc: 'PERFECT 射击伤害额外 +30%，并在命中点引发小型声波溅射。' },
    { id: 'silver', name: 'SILVER BULLET', cn: '银弹', cat: 'POWER', rarity: 'uncommon', max: 3, glyph: '◈',
      desc: '子弹可以额外穿透 1 个敌人，弹体更亮更细。' },
    { id: 'crit', name: 'CRITICAL MASS', cn: '临界质量', cat: 'POWER', rarity: 'uncommon', max: 3, glyph: '⚡',
      desc: '每发子弹有 10% 概率造成 2.5 倍伤害的临界暴击。' },
    { id: 'sub', name: 'SUBWOOFER', cn: '低音炮', cat: 'POWER', rarity: 'rare', max: 2, glyph: '☄',
      desc: '每第 8 次 PERFECT 命中释放低音冲击波，造成范围伤害并清除敌弹。' },
    { id: 'reaper', name: 'REAPER PROTOCOL', cn: '收割协议', cat: 'POWER', rarity: 'epic', max: 2, glyph: '✧',
      desc: '击杀敌人时射出 3 枚追踪碎片。再叠一层会变为 5 枚强化碎片。' },

    // STREAM
    { id: 'split', name: 'SPLIT SIGNAL', cn: '分频器', cat: 'STREAM', rarity: 'common', max: 3, glyph: '≋',
      desc: '每次射击 +1 枚子弹，以轻微角度扩散。' },
    { id: 'echo', name: 'ECHO CHAMBER', cn: '回声室', cat: 'STREAM', rarity: 'rare', max: 2, glyph: '◁',
      desc: '射击在半个节拍后追加一轮 60% 伤害的回声。' },
    { id: 'homing', name: 'SEEKING NOTE', cn: '追踪音符', cat: 'STREAM', rarity: 'uncommon', max: 2, glyph: '➤',
      desc: '子弹会缓慢转向最近的敌人。让旋律自己找到听众。' },
    { id: 'ricochet', name: 'REFRACTION', cn: '折射', cat: 'STREAM', rarity: 'uncommon', max: 2, glyph: '↻',
      desc: '子弹碰到战场边界时反弹一次，继续飞行。' },
    { id: 'presto', name: 'PRESTO', cn: '急板', cat: 'STREAM', rarity: 'common', max: 3, glyph: '≫',
      desc: '子弹速度 +25%，射程更远。' },
    { id: 'doublestop', name: 'DOUBLE STOP', cn: '双音', cat: 'STREAM', rarity: 'rare', max: 2, glyph: '⋔',
      desc: 'PERFECT 射击额外发射 3 枚 45% 伤害的小音符。' },

    // GUARD
    { id: 'vitality', name: 'VITALITY', cn: '生命力', cat: 'GUARD', rarity: 'common', max: 4, glyph: '✚',
      desc: '最大生命 +25，并立即回复 25 点生命。' },
    { id: 'capacitor', name: 'CAPACITOR', cn: '电容', cat: 'GUARD', rarity: 'uncommon', max: 3, glyph: '⬡',
      desc: '每波开始时回复 12 点生命。' },
    { id: 'barrier', name: 'BEAT BARRIER', cn: '节拍护盾', cat: 'GUARD', rarity: 'rare', max: 2, glyph: '◇',
      desc: '完美闪避获得 1 层护盾，可抵挡一次伤害。最多叠加 1 层（可强化至 2 层）。' },
    { id: 'nanomed', name: 'NANOMED', cn: '纳米修复', cat: 'GUARD', rarity: 'uncommon', max: 2, glyph: '⌬',
      desc: '每达到 25 连击，回复 4 点生命。' },
    { id: 'undertow', name: 'UNDERCURRENT', cn: '暗流', cat: 'GUARD', rarity: 'epic', max: 1, glyph: '☵',
      desc: '生命低于 40% 时，伤害 +40%。越接近沉默，声音越响。' },
    { id: 'bulwark', name: 'BULWARK', cn: '堡垒', cat: 'GUARD', rarity: 'rare', max: 1, glyph: '▣',
      desc: '受到伤害时清除周围弹幕，并使全场敌弹减速 1.5 拍。' },

    // PHASE
    { id: 'quick', name: 'QUICKSTEP', cn: '疾步', cat: 'PHASE', rarity: 'common', max: 3, glyph: '⟫',
      desc: '闪避冷却时间 -20%。' },
    { id: 'aftershock', name: 'AFTERSHOCK', cn: '相位余波', cat: 'PHASE', rarity: 'uncommon', max: 3, glyph: '◎',
      desc: '完美闪避的冲击波伤害与范围 +80%。' },
    { id: 'overflow', name: 'SYNC OVERFLOW', cn: '同步溢出', cat: 'PHASE', rarity: 'uncommon', max: 3, glyph: '∿',
      desc: '所有同步率获取 +30%。' },
    { id: 'odcore', name: 'OVERCLOCK CORE', cn: '超频核心', cat: 'PHASE', rarity: 'rare', max: 2, glyph: '↯',
      desc: 'OVERDRIVE 持续时间 +4 拍，同时所有伤害 +10%。' },
    { id: 'magnet', name: 'MAGNETIC FIELD', cn: '磁场', cat: 'PHASE', rarity: 'common', max: 2, glyph: '⊛',
      desc: '拾取范围 +120%，敌人掉落生命的概率提高。' },
    { id: 'harvest', name: 'GRAZE HARVEST', cn: '擦弹收割', cat: 'PHASE', rarity: 'rare', max: 2, glyph: '⊚',
      desc: '擦弹获得的同步率与分数 ×2。危险就是资源。' },
    { id: 'sense', name: 'BEAT SENSE', cn: '节拍感知', cat: 'PHASE', rarity: 'uncommon', max: 2, glyph: '◎',
      desc: 'PERFECT 判定窗口 +20%，让你更从容地抓住拍点。' },
    { id: 'momentum', name: 'MOMENTUM', cn: '惯性', cat: 'PHASE', rarity: 'common', max: 3, glyph: '➟',
      desc: '移动速度 +10%，闪避距离 +12%。' }
  ];
  const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

  function rollUpgrades(wave, counts, count = 3) {
    const eligible = UPGRADES.filter((u) => (counts[u.id] || 0) < u.max);
    const rarityWeight = (u) => {
      if (u.rarity === 'common') return 100;
      if (u.rarity === 'uncommon') return wave < 2 ? 0 : 52 + wave * 3;
      if (u.rarity === 'rare') return wave < 4 ? 0 : 20 + wave * 2;
      if (u.rarity === 'epic') return wave < 6 ? 0 : 6 + wave * 1.4;
      return 0;
    };
    const picks = [];
    const usedCats = new Set();
    while (picks.length < count && picks.length < eligible.length) {
      const remaining = eligible.filter((u) => !picks.includes(u));
      const picked = U.weightedPick(remaining, (u) => {
        let w = rarityWeight(u);
        if (w <= 0) return 0;
        if (usedCats.has(u.cat)) w *= 0.72;
        return w;
      });
      if (!picked) break;
      picks.push(picked);
      usedCats.add(picked.cat);
    }
    return picks;
  }

  // ── wave plans ───────────────────────────────────────────────
  const WAVE_PLANS = {
    1: { groups: [
      { bar: 1, type: 'drone', count: 3, formation: 'arc' },
      { bar: 3, type: 'drone', count: 3, formation: 'ring' },
      { bar: 5, type: 'drone', count: 2, formation: 'sides' }
    ] },
    2: { groups: [
      { bar: 1, type: 'drone', count: 4, formation: 'arc' },
      { bar: 3, type: 'weaver', count: 3, formation: 'ring' },
      { bar: 5, type: 'weaver', count: 2, formation: 'edges' },
      { bar: 5, type: 'drone', count: 3, formation: 'edges' }
    ] },
    3: { groups: [
      { bar: 1, type: 'weaver', count: 4, formation: 'ring' },
      { bar: 3, type: 'orbiter', count: 2, formation: 'edges' },
      { bar: 3, type: 'drone', count: 3, formation: 'arc' },
      { bar: 5, type: 'sniper', count: 2, formation: 'edges' },
      { bar: 5, type: 'weaver', count: 3, formation: 'ring' }
    ] },
    4: { groups: [
      { bar: 1, type: 'drone', count: 4, formation: 'arc' },
      { bar: 1, type: 'splitter', count: 2, formation: 'edges' },
      { bar: 3, type: 'brute', count: 1, formation: 'top' },
      { bar: 3, type: 'weaver', count: 3, formation: 'ring' },
      { bar: 5, type: 'splitter', count: 3, formation: 'edges' },
      { bar: 5, type: 'drone', count: 4, formation: 'ring' },
      { bar: 5, type: 'sniper', count: 1, formation: 'edges' }
    ] },
    5: { boss: 'ostinato' },
    6: { groups: [
      { bar: 1, type: 'stinger', count: 4, formation: 'ring' },
      { bar: 3, type: 'weaver', count: 3, formation: 'arc' },
      { bar: 3, type: 'prism', count: 2, formation: 'edges' },
      { bar: 5, type: 'stinger', count: 3, formation: 'edges' },
      { bar: 5, type: 'sniper', count: 2, formation: 'edges' }
    ] },
    7: { groups: [
      { bar: 1, type: 'brute', count: 2, formation: 'top' },
      { bar: 1, type: 'drone', count: 4, formation: 'ring' },
      { bar: 3, type: 'orbiter', count: 3, formation: 'ring' },
      { bar: 3, type: 'sniper', count: 3, formation: 'edges' },
      { bar: 5, type: 'splitter', count: 3, formation: 'edges' },
      { bar: 5, type: 'weaver', count: 4, formation: 'arc' }
    ] },
    8: { groups: [
      { bar: 1, type: 'prism', count: 3, formation: 'edges' },
      { bar: 1, type: 'drone', count: 4, formation: 'ring' },
      { bar: 3, type: 'brute', count: 2, formation: 'top' },
      { bar: 3, type: 'orbiter', count: 3, formation: 'ring' },
      { bar: 5, type: 'sniper', count: 4, formation: 'edges' },
      { bar: 5, type: 'stinger', count: 4, formation: 'ring' }
    ] },
    9: { groups: [
      { bar: 1, type: 'brute', count: 2, formation: 'top', elite: 0.5 },
      { bar: 1, type: 'prism', count: 2, formation: 'edges' },
      { bar: 3, type: 'orbiter', count: 4, formation: 'ring' },
      { bar: 3, type: 'splitter', count: 4, formation: 'edges' },
      { bar: 5, type: 'stinger', count: 4, formation: 'ring' },
      { bar: 5, type: 'sniper', count: 4, formation: 'edges' },
      { bar: 5, type: 'weaver', count: 2, formation: 'arc' }
    ] },
    10: { boss: 'maestro' }
  };

  function generateEndlessPlan(wave) {
    if (wave % 5 === 0) {
      return { boss: wave % 10 === 5 ? 'ostinato' : 'maestro', eliteBoss: true };
    }
    const pool = ['drone', 'weaver', 'orbiter', 'sniper', 'splitter', 'stinger', 'prism', 'brute'];
    const groups = [];
    const tiers = [
      { bar: 1, budget: 1 },
      { bar: 3, budget: 1 },
      { bar: 5, budget: 1 }
    ];
    if (wave >= 13) tiers.push({ bar: 7, budget: 1 });
    for (const tier of tiers) {
      const types = [];
      const wanted = Math.min(2, 1 + Math.floor(U.rand(0, 2.2)));
      for (let i = 0; i < wanted; i++) {
        let type = U.pick(pool);
        let guard = 0;
        while (types.includes(type) && guard++ < 8) type = U.pick(pool);
        types.push(type);
      }
      for (const type of types) {
        let count;
        if (type === 'brute') count = U.randInt(1, 2);
        else if (type === 'prism' || type === 'splitter') count = U.randInt(2, 3);
        else count = U.randInt(3, 4);
        if (wave > 16) count = Math.min(5, count + 1);
        const formations = ['ring', 'arc', 'edges', 'sides', 'top'];
        groups.push({
          bar: tier.bar,
          type,
          count,
          formation: U.pick(formations),
          elite: Math.min(0.45, 0.08 + (wave - 10) * 0.03)
        });
      }
    }
    return { groups };
  }

  function getWavePlan(wave) {
    if (WAVE_PLANS[wave]) return WAVE_PLANS[wave];
    return generateEndlessPlan(wave);
  }

  const TUTORIAL = [
    { at: 3.5, text: '准星圆环闭合的瞬间点击左键 —— 每一枪都是一个音符。' },
    { at: 11, text: 'PERFECT 会累积连击。连击越高，伤害越高，音乐越亮。' },
    { at: 19, text: '在节拍上按 SPACE 闪避：释放相位冲击波，清除周围弹幕。' },
    { at: 28, text: '同步率满格后按 E 进入 OVERDRIVE。踩拍启动可以延长 4 拍。' }
  ];

  const TIPS = [
    '长按左键会自动按拍射击，但只有手动踩点才能累积连击与同步率。',
    '擦弹会积攒同步率 —— 贴着弹幕飞行，比躲得远远的更赚。',
    'PERFECT 枪声的音高来自当前和弦。打得越准，旋律越完整。',
    '每一类强化都会为配乐叠加一条新音轨。',
    '完美闪避同样可以积攒同步率，而且不会打断连击。',
    '护盾可以抵挡一次伤害，但不会保护你的连击。',
    '在节拍上启动 OVERDRIVE，持续时间会从 8 拍变成 12 拍。',
    '生命低于 40% 时，暗流会开始轰鸣。'
  ];

  PR.C = C;
  PR.CAT_COLORS = CAT_COLORS;
  PR.CAT_CN = CAT_CN;
  PR.CAT_TRACK = CAT_TRACK;
  PR.RARITY_COLOR = RARITY_COLOR;
  PR.RARITY_CN = RARITY_CN;
  PR.ENEMIES = ENEMIES;
  PR.BOSSES = BOSSES;
  PR.SECTORS = SECTORS;
  PR.sectorFor = sectorFor;
  PR.sectorIndexFor = sectorIndexFor;
  PR.UPGRADES = UPGRADES;
  PR.UPGRADE_BY_ID = UPGRADE_BY_ID;
  PR.rollUpgrades = rollUpgrades;
  PR.WAVE_PLANS = WAVE_PLANS;
  PR.getWavePlan = getWavePlan;
  PR.TUTORIAL = TUTORIAL;
  PR.TIPS = TIPS;
})(window.PR = window.PR || {});
