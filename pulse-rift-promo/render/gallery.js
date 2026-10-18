/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — SIGNAL UPGRADE gallery
   Three holographic cards in a hall of staves. Every pick adds
   another instrument to the score.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BEAT } from './timeline.js';
import {
  TAU, clamp, lerp, smoothstep, easeInOut, easeOutCubic,
  rng, makeStarfield, makeNoteSprites, makeGlowSprite,
  cutRectPath, glowTexture, noteTexture
} from './fx.js';
import { makeGate } from './scenes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const aimCamera = (camera, p, target, fov = 50) => {
  camera.position.copy(p); camera.fov = fov; camera.lookAt(target); camera.updateProjectionMatrix();
};

const CARDS = [
  {
    cat: 'POWER', cn: '火力', color: '#ff5c7a', colorHex: 0xff5c7a,
    glyph: '✦', name: 'AMPLIFIER', nameCn: '增幅器',
    desc: '所有射击伤害 +22%。\n简单、粗暴、震耳欲聋。',
    rarity: 'COMMON', track: 'DRIVE'
  },
  {
    cat: 'STREAM', cn: '投射', color: '#37f5ff', colorHex: 0x37f5ff,
    glyph: '◁', name: 'ECHO CHAMBER', nameCn: '回声室',
    desc: '射击在半个节拍后\n追加一轮 60% 伤害的回声。',
    rarity: 'RARE', track: 'ARP'
  },
  {
    cat: 'PHASE', cn: '相位', color: '#b26bff', colorHex: 0xb26bff,
    glyph: '∿', name: 'SYNC OVERFLOW', nameCn: '同步溢出',
    desc: '所有同步率获取 +30%。\n越贴近危险，越接近超频。',
    rarity: 'UNCOMMON', track: 'PERC'
  }
];

function wrapText(ctx, text, maxWidth, lineHeight) {
  const out = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line); line = ch;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

function makeCardTexture(card) {
  const W = 1024, H = 1440;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // body
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(14,7,28,0.98)');
  g.addColorStop(0.5, 'rgba(7,3,17,0.98)');
  g.addColorStop(1, 'rgba(12,4,22,0.98)');
  ctx.beginPath(); cutRectPath(ctx, 10, 10, W - 20, H - 20, 54);
  ctx.fillStyle = g; ctx.fill();
  // category aura
  const aura = ctx.createRadialGradient(W / 2, H * 0.36, 40, W / 2, H * 0.36, W * 0.75);
  aura.addColorStop(0, card.color + '33');
  aura.addColorStop(0.55, card.color + '0d');
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = aura;
  ctx.beginPath(); cutRectPath(ctx, 10, 10, W - 20, H - 20, 54); ctx.fill();

  // border
  ctx.strokeStyle = card.color; ctx.lineWidth = 5;
  ctx.shadowColor = card.color; ctx.shadowBlur = 26;
  ctx.beginPath(); cutRectPath(ctx, 10, 10, W - 20, H - 20, 54); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2;
  ctx.beginPath(); cutRectPath(ctx, 32, 32, W - 64, H - 64, 40); ctx.stroke();

  // corner accents
  ctx.strokeStyle = card.color; ctx.lineWidth = 4;
  for (const [x, y, sx, sy] of [[50, 50, 1, 1], [W - 50, 50, -1, 1], [50, H - 50, 1, -1], [W - 50, H - 50, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * 46); ctx.lineTo(x, y); ctx.lineTo(x + sx * 46, y); ctx.stroke();
  }

  // top micro
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '600 26px "Chakra Petch", sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillStyle = 'rgba(233,251,255,0.55)';
  ctx.fillText('SIGNAL UPGRADE', 74, 118);
  ctx.textAlign = 'right';
  ctx.fillStyle = card.color;
  ctx.fillText('// 03', W - 74, 118);

  // category pill
  ctx.textAlign = 'left'; ctx.letterSpacing = '4px';
  ctx.font = '700 28px "Chakra Petch", sans-serif';
  const catText = card.cat + ' // ' + card.cn;
  const tw = ctx.measureText(catText).width;
  ctx.fillStyle = card.color + '22';
  ctx.fillRect(74, 152, tw + 44, 54);
  ctx.strokeStyle = card.color + 'aa'; ctx.lineWidth = 2; ctx.strokeRect(74, 152, tw + 44, 54);
  ctx.fillStyle = card.color;
  ctx.fillText(catText, 96, 189);

  // glyph
  ctx.textAlign = 'center'; ctx.letterSpacing = '0px';
  ctx.font = '300 360px "Segoe UI Symbol", "Chakra Petch", sans-serif';
  ctx.fillStyle = card.color;
  ctx.shadowColor = card.color; ctx.shadowBlur = 70;
  ctx.fillText(card.glyph, W / 2, 610);
  ctx.shadowBlur = 0;

  // name
  ctx.font = '800 68px Orbitron, sans-serif';
  ctx.fillStyle = '#e9fbff';
  ctx.letterSpacing = '3px';
  ctx.fillText(card.name, W / 2, 760);
  ctx.font = '500 40px "Microsoft YaHei", "Chakra Petch", sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillStyle = card.color;
  ctx.fillText(card.nameCn, W / 2, 826);

  // rule
  const lg = ctx.createLinearGradient(170, 0, W - 170, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.5, card.color + 'cc');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(170, 868, W - 340, 2);

  // description
  ctx.textAlign = 'left'; ctx.letterSpacing = '1px';
  ctx.font = '400 34px "Microsoft YaHei", "Chakra Petch", sans-serif';
  ctx.fillStyle = 'rgba(233,251,255,0.82)';
  const lines = wrapText(ctx, card.desc, W - 190, 54);
  lines.forEach((line, i) => ctx.fillText(line, 96, 954 + i * 54));

  // rarity
  ctx.font = '600 24px "Chakra Petch", sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = 'rgba(157,181,196,0.55)';
  ctx.fillText('RARITY', 96, 1190);
  ctx.fillStyle = card.color;
  ctx.fillText(card.rarity, 96, 1232);
  const rank = card.rarity === 'RARE' ? 3 : card.rarity === 'UNCOMMON' ? 2 : 1;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i < rank ? card.color : 'rgba(255,255,255,0.12)';
    ctx.fillRect(96 + i * 34, 1252, 24, 6);
  }
  // track
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(157,181,196,0.55)';
  ctx.fillText('ADDS TRACK', W - 96, 1190);
  ctx.fillStyle = card.color;
  ctx.fillText('→ ' + card.track, W - 96, 1232);

  // bottom waveform
  const rnd = rng(444 + card.name.length);
  ctx.strokeStyle = card.color + '66'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W - 192; x += 6) {
    const y = 1348 + Math.sin(x * 0.05) * 12 * (0.4 + rnd() * 0.8);
    if (x === 0) ctx.moveTo(96 + x, y); else ctx.lineTo(96 + x, y);
  }
  ctx.stroke();

  ctx.textAlign = 'center'; ctx.font = '600 22px "Chakra Petch", sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillStyle = 'rgba(233,251,255,0.4)';
  ctx.fillText('SELECT // 1', W / 2, 1400);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class GalleryScene {
  constructor() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020107);
    scene.fog = new THREE.FogExp2(0x07030f, 0.014);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 400);

    this.stars = makeStarfield({ count: 2600, radius: 120, depth: 120, size: 0.45, opacity: 0.7, seed: 1201 });
    scene.add(this.stars);
    for (const n of [[0xb26bff, 55, -18, 10, -30, 0.06], [0x37f5ff, 40, 16, -8, -26, 0.05]]) {
      const sp = makeGlowSprite(n[0], n[1], n[5]); sp.position.set(n[2], n[3], n[4]); scene.add(sp);
    }

    // floor + aisle light
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 120),
      new THREE.MeshBasicMaterial({ color: 0x04020a })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -3, -20);
    scene.add(floor);
    const grid = new THREE.GridHelper(100, 60, 0x37f5ff, 0x2a1648);
    grid.position.set(0, -2.98, -20);
    grid.material.transparent = true; grid.material.opacity = 0.16;
    scene.add(grid);

    // pillars
    this.pillars = new THREE.Group();
    const prnd = rng(909);
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 12 - Math.floor(i / 2) * 7;
      const h = 10 + prnd() * 12;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, h, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x07030f, metalness: 0.6, roughness: 0.6 })
      );
      box.position.set(side * (11 + prnd() * 3), h / 2 - 3, z);
      this.pillars.add(box);
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(0.09, h * 0.8),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff2e88 : 0x37f5ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
      );
      strip.position.set(box.position.x - side * 0.72, h / 2 - 3, z);
      strip.rotation.y = side * Math.PI / 2;
      this.pillars.add(strip);
    }
    scene.add(this.pillars);

    // staff ribbon hall
    this.staff = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let z = 24; z >= -40; z -= 2) {
        pts.push(V(Math.sin(z * 0.12 + i * 0.7) * 2.6 + (i - 2) * 0.7, 0.4 + i * 0.72 + Math.sin(z * 0.09 + i) * 0.35, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 180, 0.012, 4, false),
        new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffd166 : 0x37f5ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.staff.add(line);
    }
    scene.add(this.staff);
    this.notes = makeNoteSprites(26, { colors: ['#ffd166', '#37f5ff', '#b26bff'], scale: 0.45, seed: 147 });
    scene.add(this.notes);

    // back ring
    this.gate = makeGate({ radii: [6.5, 7.8, 9.2], z: -18, opacity: 0.55 });
    this.gate.position.y = 2.2;
    scene.add(this.gate);

    // track beams
    this.trackBeams = [];
    const trackCols = [0xff5c7a, 0x37f5ff, 0x5dffa8, 0xb26bff];
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 1, 0.22),
        new THREE.MeshBasicMaterial({ color: trackCols[i], transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
      );
      beam.geometry.translate(0, 0.5, 0);
      beam.position.set(-7.5 + i * 5, -2.9, -7);
      beam.userData.color = trackCols[i];
      scene.add(beam); this.trackBeams.push(beam);
      const glow = makeGlowSprite(trackCols[i], 1.4, 0.4);
      glow.position.set(beam.position.x, 1, -7);
      scene.add(glow); beam.userData.glow = glow;
    }

    // cards
    this.cards = [];
    this.cardGroup = new THREE.Group();
    scene.add(this.cardGroup);
    CARDS.forEach((card, i) => {
      const tex = makeCardTexture(card);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 4.85), mat);
      const group = new THREE.Group();
      group.add(mesh);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.85, 5.3),
        new THREE.MeshBasicMaterial({ color: card.colorHex, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      glow.position.z = -0.02;
      group.add(glow);
      const halo = makeGlowSprite(card.colorHex, 4.5, 0.14);
      halo.position.z = -0.5;
      group.add(halo);
      group.position.set((i - 1) * 4.5, 1.35, 0);
      group.rotation.y = (i - 1) * -0.12;
      group.userData = { card, mesh, glow, halo, baseX: (i - 1) * 4.5, index: i };
      this.cardGroup.add(group);
      this.cards.push(group);
    });

    // selection beam
    this.selBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x37f5ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.selBeam.geometry.translate(0, 0.5, 0);
    scene.add(this.selBeam);
    this.selParticles = new THREE.Sprite(makeGlowSprite(0x37f5ff, 3.5, 0).material);
    this.selParticles.material.opacity = 0;
    this.selParticles.position.set(0, 3, -2);
    scene.add(this.selParticles);

    // select burst points
    this.sparkGeo = new THREE.BufferGeometry();
    const N = 180;
    const pos = new Float32Array(N * 3), vel = [];
    const rnd = rng(616);
    for (let i = 0; i < N; i++) {
      const a = rnd() * TAU, u = rnd() * 2 - 1, s = Math.sqrt(1 - u * u);
      vel.push(V(Math.cos(a) * s, u, Math.sin(a) * s).multiplyScalar(2 + rnd() * 5));
    }
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkMat = new THREE.PointsMaterial({
      color: 0x37f5ff, size: 0.12, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture()
    });
    const sparks = new THREE.Points(this.sparkGeo, this.sparkMat);
    sparks.frustumCulled = false;
    scene.add(sparks);
    this.sparkVel = vel;
    this.sparkOrigin = V(0, 1.5, 5.5);
  }

  update(t, beat) {
    this.stars.rotation.y = t * 0.004;
    for (const ring of this.gate.userData.rings) ring.rotation.z += ring.userData.spin * 0.6;
    for (const n of this.notes.userData.notes) {
      const u = n.userData;
      const z = ((t * 5 * u.speed + u.seed * 10) % 34) - 26;
      n.position.set(Math.sin(z * 0.2 + u.seed) * 4, u.yBase * 0.4 + 1.5 + Math.sin(t + u.seed) * 0.5, z);
      n.material.opacity = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.2 + u.seed));
    }
    // cards float
    this.cards.forEach((g, i) => {
      const u = g.userData;
      const pick = smoothstep(104, 105.2, beat);
      const dissolve = smoothstep(105.6, 107, beat);
      g.position.y = u.baseY ?? (u.baseY = 1.35);
      g.position.y += Math.sin(t * 0.9 + i * 1.7) * 0.14;
      g.rotation.y = (i - 1) * -0.12 + Math.sin(t * 0.5 + i) * 0.04;
      g.rotation.x = -0.04 + Math.sin(t * 0.7 + i) * 0.02;
      if (i === 1) {
        g.position.z = pick * 2.2;
        g.position.x = u.baseX * (1 - pick * 0.85);
        g.position.y += pick * 0.25;
        const s = 1 + pick * 0.1;
        g.scale.setScalar(s);
        u.mesh.material.opacity = 1 - dissolve;
        u.glow.material.opacity = 0.08 + pick * 0.22;
        u.halo.material.opacity = 0.14 + pick * 0.35;
        g.visible = dissolve < 0.98;
      } else {
        const fade = smoothstep(104, 105.5, beat);
        u.mesh.material.opacity = 1 - fade;
        u.glow.material.opacity = 0.08 * (1 - fade);
        u.halo.material.opacity = 0.14 * (1 - fade);
        g.position.z = -fade * 2;
        g.visible = fade < 0.98;
      }
    });

    // selection beam and sparks
    const beamOn = smoothstep(105.3, 106.1, beat) * (1 - smoothstep(107.4, 108.2, beat));
    this.selBeam.material.opacity = beamOn * 0.8;
    this.selBeam.visible = beamOn > 0.01;
    if (beamOn > 0.01) {
      const a = V(0, 1.8, 4.2), b = V(0, 9.2, -10);
      const dir = b.clone().sub(a);
      const len = dir.length();
      this.selBeam.position.copy(a);
      this.selBeam.scale.set(1, len, 1);
      this.selBeam.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
    }
    this.selParticles.material.opacity = beamOn * 0.5;
    this.selParticles.position.set(0, 3 + Math.sin(t) * 0.5, 0);

    const sparkA = smoothstep(105.2, 105.8, beat) * (1 - smoothstep(107, 108, beat));
    this.sparkMat.opacity = sparkA * 0.9;
    const arr = this.sparkGeo.attributes.position.array;
    for (let i = 0; i < this.sparkVel.length; i++) {
      const age = Math.max(0, beat - 105.2) * BEAT;
      const v = this.sparkVel[i];
      arr[i * 3] = this.sparkOrigin.x + v.x * age;
      arr[i * 3 + 1] = this.sparkOrigin.y + v.y * age + 0.5 * age * age;
      arr[i * 3 + 2] = this.sparkOrigin.z + v.z * age;
    }
    this.sparkGeo.attributes.position.needsUpdate = true;

    // track beams light up in four stages
    const times = [96, 100, 104, 108];
    this.trackBeams.forEach((b, i) => {
      const on = smoothstep(times[i] - 0.5, times[i] + 0.5, beat);
      const h = 1 + on * (4 + Math.abs(Math.sin(beat * 0.8 + i)) * 3);
      b.scale.set(1, h, 1);
      b.material.opacity = 0.15 + on * 0.6 * (0.6 + 0.4 * Math.exp(-(beat % 1) * 4));
      b.userData.glow.position.y = h;
      b.userData.glow.material.opacity = 0.1 + on * 0.35;
    });

    this.pillars.rotation.y = 0;
    this.staff.position.y = Math.sin(t * 0.25) * 0.12;
  }

  setCamera(cam, t, beat, shot) {
    const camera = this.camera;
    const local = beat - (shot ? shot.a : 96);
    const len = shot ? shot.b - shot.a : 4;
    const k = clamp(local / len, 0, 1);
    if (cam === 'enterHall') {
      const e = easeInOut(k);
      aimCamera(camera, V(lerp(0, 0.6, e), lerp(2.2, 1.6, e), lerp(30, 17, e)), V(0, 1.4, 0), lerp(50, 40, e));
    } else if (cam === 'cardsOrbit') {
      const a = Math.sin(t * 0.22) * 0.42;
      aimCamera(camera, V(Math.sin(a) * 15, 2.1 + Math.sin(t * 0.2) * 0.5, Math.cos(a) * 15), V(0, 1.4, 0), 38);
    } else if (cam === 'selectCard') {
      const e = easeOutCubic(clamp(k * 1.3, 0, 1));
      aimCamera(camera, V(lerp(3.2, 1.0, e), lerp(2.1, 1.7, e), lerp(19, 16.5, e)), V(0, 1.85, 1.4), lerp(43, 40, e));
    } else {
      const e = easeInOut(k);
      aimCamera(camera, V(lerp(0, 0.8, e), lerp(1.2, 1.0, e), lerp(2, -14, e)), V(0, 2.2, -30), lerp(52, 62, e));
    }
    return camera;
  }
}
