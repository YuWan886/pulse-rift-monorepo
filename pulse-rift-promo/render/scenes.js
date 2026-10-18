/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — procedurally built 3D sets
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BEAT, BARS, TOTAL_BEATS, chordAtBeat } from './timeline.js';
import {
  TAU, clamp, lerp, smoothstep, easeInOut, easeOutCubic, easeOutExpo,
  rng, makeStarfield, makeNoteSprites, BurstSystem, RingWaveSystem,
  TrailRibbon, makeGlowSprite, makeBeam, orientBeam, glowTexture, noteTexture,
  shakeNoise
} from './fx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const beatPulse = (beat) => Math.exp(-(beat % 1) * 5.5);
const barPulse = (beat) => Math.exp(-(beat % 4) * 3.2);

function aimCamera(camera, p, target, fov = 50) {
  camera.position.copy(p);
  camera.fov = fov;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

/* ═══════════════════════════════════════════════════════════════
   shared neon gate
   ═══════════════════════════════════════════════════════════════ */
export function makeGate(opts = {}) {
  const {
    radii = [9, 11.4, 14], colors = [0x37f5ff, 0xff2e88, 0xffd166],
    ticks = 48, z = 0, opacity = 1
  } = opts;
  const group = new THREE.Group();
  group.position.z = z;
  radii.forEach((r, i) => {
    const geo = new THREE.TorusGeometry(r, i === 0 ? 0.055 : 0.028, 8, 220);
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length], transparent: true, opacity: 0.46 * opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.userData.spin = (i % 2 ? -1 : 1) * (0.012 + i * 0.01);
    group.add(ring);
  });
  // ticks
  const tickMat = new THREE.MeshBasicMaterial({
    color: colors[0], transparent: true, opacity: 0.28 * opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * TAU;
    const r = radii[radii.length - 1];
    const long = i % 4 === 0;
    const geo = new THREE.BoxGeometry(long ? 0.55 : 0.26, long ? 0.06 : 0.03, 0.02);
    const m = new THREE.Mesh(geo, tickMat);
    m.position.set(Math.cos(a) * (r + 0.5), Math.sin(a) * (r + 0.5), 0);
    m.rotation.z = a;
    group.add(m);
  }
  // four brackets
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const r = radii[radii.length - 1] + 1.4;
    const m = new THREE.Group();
    const g1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.035, 0.02),
      new THREE.MeshBasicMaterial({ color: colors[2], transparent: true, opacity: 0.55 * opacity, blending: THREE.AdditiveBlending }));
    m.add(g1);
    m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    m.rotation.z = a + Math.PI / 4;
    group.add(m);
  }
  group.userData.rings = group.children.filter(c => c.userData.spin);
  return group;
}

/* ═══════════════════════════════════════════════════════════════
   particle wordmark
   ═══════════════════════════════════════════════════════════════ */
export class LogoParticles {
  constructor(opts = {}) {
    const {
      width = 23, text = 'PULSE//RIFT', step = 2,
      assembleStart = 16, assembleEnd = 30, slamBeat = 32,
      colors = true
    } = opts;
    this.assembleStart = assembleStart;
    this.assembleEnd = assembleEnd;
    this.slamBeat = slamBeat;
    this.group = new THREE.Group();

    const cw = 2800, ch = 720;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const fontSize = 250;
    ctx.font = `900 ${fontSize}px Orbitron, sans-serif`;
    const parts = ['PULSE', '//', 'RIFT'];
    const gap = 10;
    const widths = parts.map(p => ctx.measureText(p).width);
    const totalW = widths.reduce((a, b) => a + b, 0) + gap * 2;
    let x = (cw - totalW) / 2;
    const y = ch / 2 + 6;

    // PULSE — filled cyan gradient
    let grad = ctx.createLinearGradient(x, 0, x + widths[0], 0);
    grad.addColorStop(0, '#00b4e6');
    grad.addColorStop(0.5, '#2fe4ff');
    grad.addColorStop(1, '#c8feff');
    ctx.shadowColor = '#37f5ff'; ctx.shadowBlur = 14;
    ctx.fillStyle = grad;
    ctx.fillText('PULSE', x, y);
    x += widths[0] + gap;

    // // — magenta slashes
    ctx.shadowColor = '#ff2e88'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff2e88';
    ctx.fillText('//', x, y);
    x += widths[1] + gap;

    // RIFT — white outline
    ctx.shadowColor = '#e9fbff'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 9;
    ctx.lineJoin = 'round';
    ctx.strokeText('RIFT', x, y);

    // crisp holographic layer behind the particles
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.crisp = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width * ch / cw),
      new THREE.MeshBasicMaterial({
        map: this.texture, transparent: true, opacity: 0,
        blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide
      })
    );
    this.crisp.position.z = 0.06;
    this.group.add(this.crisp);

    const img = ctx.getImageData(0, 0, cw, ch).data;
    const targets = [], cols = [], seeds = [];
    const col = new THREE.Color();
    for (let py = 0; py < ch; py += step) {
      for (let px = 0; px < cw; px += step) {
        const i = (py * cw + px) * 4;
        const a = img[i + 3];
        if (a < 135) continue;
        const wx = (px - cw / 2) / cw * width;
        const wy = (ch / 2 - py) * (width / cw);
        targets.push(wx, wy, 0);
        const r = img[i] / 255, g = img[i + 1] / 255, b = img[i + 2] / 255;
        const boost = 0.9 + Math.random() * 0.2;
        cols.push(r * boost, g * boost, b * boost);
        seeds.push(Math.random());
      }
    }
    // fallback safety: no random at runtime? strings are deterministic enough
    const count = targets.length / 3;
    this.count = count;

    const pos = new Float32Array(count * 3);
    const tgt = new Float32Array(targets);
    const colArr = new Float32Array(cols);
    const siz = new Float32Array(count);
    const seed = new Float32Array(count);
    const delay = new Float32Array(count);
    const start = new Float32Array(count * 3);
    const rnd = rng(4242);
    for (let i = 0; i < count; i++) {
      const a = rnd() * TAU;
      const u = rnd() * 2 - 1;
      const rad = 12 + rnd() * 22;
      const s = Math.sqrt(1 - u * u);
      start[i * 3] = Math.cos(a) * s * rad;
      start[i * 3 + 1] = u * rad * 0.55;
      start[i * 3 + 2] = Math.sin(a) * s * rad * 0.7 - 6;
      pos[i * 3] = start[i * 3]; pos[i * 3 + 1] = start[i * 3 + 1]; pos[i * 3 + 2] = start[i * 3 + 2];
      tgt[i * 3 + 2] = (rnd() - 0.5) * 0.7;
      siz[i] = 0.04 + Math.pow(rnd(), 2.4) * 0.13;
      seed[i] = rnd();
      delay[i] = rnd() * 0.55;
    }
    this.pos = pos; this.tgt = tgt; this.start = start;
    this.seed = seed; this.delay = delay;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 1 }, uMap: { value: glowTexture() } },
      vertexShader: `
        attribute float aSize; varying vec3 vColor;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (430.0 / -mv.z); gl_Position = projectionMatrix * mv; }
      `,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uOpacity; varying vec3 vColor;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * uOpacity); }
      `,
      vertexColors: true
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.geo = geo;
    this.group.add(this.points);
    this.group.position.y = 0.4;
  }

  update(beat, opts = {}) {
    const { assembleStart = this.assembleStart, assembleEnd = this.assembleEnd, slamBeat = this.slamBeat, opacity = 1 } = opts;
    const prog = smoothstep(0, 1, (beat - assembleStart) / Math.max(0.001, assembleEnd - assembleStart));
    const p = this.pos, tgt = this.tgt, st = this.start, sd = this.seed, dl = this.delay;
    const slamAge = (beat - slamBeat) * BEAT;
    const slamAmp = slamAge > 0 && slamAge < 2 ? Math.exp(-slamAge * 2.6) * 0.55 * Math.sin(slamAge * 26) : 0;
    const breathe = 1 + 0.012 * Math.sin(beat * 0.9);
    for (let i = 0; i < this.count; i++) {
      const q = clamp((prog - dl[i] * 0.45) / (1 - dl[i] * 0.45), 0, 1);
      const e = easeInOut(q);
      const swirl = (1 - e) * 0.8;
      const ang = q * 5 + sd[i] * 12;
      let x = lerp(st[i * 3], tgt[i * 3] * breathe, e) + Math.cos(ang) * swirl;
      let y = lerp(st[i * 3 + 1], tgt[i * 3 + 1] * breathe, e) + Math.sin(ang) * swirl;
      let z = lerp(st[i * 3 + 2], tgt[i * 3 + 2], e) + Math.sin(ang * 0.7) * swirl * 0.6;
      if (slamAmp !== 0) {
        x += (tgt[i * 3]) * slamAmp * (0.4 + sd[i] * 0.6);
        y += (tgt[i * 3 + 1] + 0.001) * slamAmp * (0.4 + sd[i] * 0.6);
        z += (sd[i] - 0.5) * slamAmp * 2;
      }
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mat.uniforms.uOpacity.value = opacity;
    const crisp = opts.crisp ?? 0;
    this.crisp.material.opacity = crisp * opacity;
    this.crisp.visible = crisp * opacity > 0.005;
  }
}

/* ═══════════════════════════════════════════════════════════════
   VOID — overture
   ═══════════════════════════════════════════════════════════════ */
export class VoidScene {
  constructor() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020107);
    scene.fog = new THREE.FogExp2(0x05020c, 0.012);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400);

    this.stars = makeStarfield({ count: 3200, radius: 170, depth: 180, size: 0.55, opacity: 0.9 });
    scene.add(this.stars);
    this.dust = makeStarfield({ count: 420, radius: 30, depth: 40, size: 0.5, opacity: 0.5, colors: ['#ffd166', '#37f5ff', '#ffffff'], seed: 99 });
    scene.add(this.dust);

    // nebula veils
    const nebs = [
      { c: 0xb26bff, s: 60, x: -28, y: 8, z: -55, o: 0.07 },
      { c: 0xff2e88, s: 50, x: 30, y: -10, z: -65, o: 0.055 },
      { c: 0x37f5ff, s: 42, x: 10, y: 15, z: -80, o: 0.045 }
    ];
    for (const n of nebs) {
      const sp = makeGlowSprite(n.c, n.s, n.o);
      sp.position.set(n.x, n.y, n.z);
      scene.add(sp);
    }

    // core
    this.core = new THREE.Group();
    const coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    this.core.add(coreMesh);
    const halo = makeGlowSprite(0xffd166, 2.3, 0.55);
    this.core.add(halo);
    this.halo = halo;
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.82, 1),
      new THREE.MeshBasicMaterial({ color: 0xff2e88, wireframe: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
    );
    this.cage = cage;
    this.core.add(cage);
    scene.add(this.core);

    // beat ring waves
    const ringEvents = [];
    for (let b = 0; b < 40; b++) {
      ringEvents.push({
        t: b * BEAT, origin: V(0, 0, 0), max: 4 + (b % 4) * 1.3,
        dur: 1.15, color: b % 4 === 0 ? 0xffd166 : 0x37f5ff, opacity: 0.26
      });
    }
    this.rings = new RingWaveSystem(scene, ringEvents);

    // gate in the distance
    this.gate = makeGate({ radii: [11, 13.4, 16], z: -26, opacity: 0.7 });
    scene.add(this.gate);

    // staff lines
    this.staff = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let x = -30; x <= 30; x += 2) {
        pts.push(V(x, -8 + i * 0.7 + Math.sin(x * 0.13 + i) * 0.5, -12 - i * 0.1));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 180, 0.008, 4, false);
      const mat = new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffd166 : 0x37f5ff, transparent: true, opacity: 0.06 + i * 0.008, blending: THREE.AdditiveBlending, depthWrite: false });
      const line = new THREE.Mesh(geo, mat);
      this.staff.add(line);
    }
    scene.add(this.staff);

    this.notes = makeNoteSprites(26, { colors: ['#ffd166', '#37f5ff', '#ff2e88'], scale: 0.55, seed: 21 });
    scene.add(this.notes);

    // oscilloscope waveform horizon — the film's "signal"
    const makeWave = (color, z, yOff, opacity) => {
      const n = 260;
      const pos = new Float32Array(n * 2 * 3);
      const idx = [];
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2, b = a + 1, c = (i + 1) * 2, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, depthWrite: false
      }));
      mesh.frustumCulled = false;
      mesh.userData = { z, yOff, pos, n };
      scene.add(mesh);
      return mesh;
    };
    this.wave = makeWave(0x37f5ff, -30, -4.4, 0.5);
    this.wave2 = makeWave(0xff2e88, -33, -5.0, 0.22);

    this.t = 0;
  }

  update(t, beat) {
    this.t = t;
    const bp = beatPulse(beat);
    const scale = 1 + bp * 0.45;
    this.core.scale.setScalar(scale);
    this.halo.material.opacity = 0.3 + bp * 0.38;
    this.halo.scale.setScalar(1.9 + bp * 1.3);
    this.cage.rotation.y = t * 0.3;
    this.cage.rotation.x = t * 0.17;
    this.cage.material.opacity = 0.16 + bp * 0.22;

    this.rings.update(t);
    this.stars.rotation.y = t * 0.005;
    this.dust.rotation.y = -t * 0.012;
    this.dust.position.y = Math.sin(t * 0.1) * 0.3;

    for (const ring of this.gate.userData.rings) ring.rotation.z += ring.userData.spin * 0.5;
    this.gate.rotation.z = Math.sin(t * 0.06) * 0.05;
    this.staff.position.y = Math.sin(t * 0.15) * 0.15;

    const wb = Math.exp(-(beat % 1) * 3.2);
    this._updateWave(this.wave, t, wb, 0);
    this._updateWave(this.wave2, t, wb, 2.1);

    for (const n of this.notes.userData.notes) {
      const u = n.userData;
      const a = u.angle + t * u.speed;
      n.position.set(Math.cos(a) * u.radius, u.yBase + Math.sin(t * 0.4 + u.seed) * u.bob, Math.sin(a) * u.radius * 0.6 - 4);
      n.material.opacity = 0.18 + 0.3 * (0.5 + 0.5 * Math.sin(t + u.seed));
    }
  }

  _updateWave(mesh, t, wb, phase) {
    const { z, yOff, pos, n } = mesh.userData;
    for (let i = 0; i < n; i++) {
      const x = -62 + i / (n - 1) * 124;
      const env = Math.exp(-Math.abs(x) * 0.02);
      const y = yOff
        + Math.sin(x * 0.13 + t * 0.8 + phase) * 0.28 * (0.6 + 0.4 * Math.sin(t * 0.35 + phase))
        + Math.sin(x * 0.9 - t * 6.4 + phase) * 0.55 * wb * env
        + Math.sin(x * 0.31 + t * 2.1) * 0.12;
      const th = 0.05 + wb * 0.07 * env;
      const j = i * 6;
      pos[j] = x; pos[j + 1] = y + th; pos[j + 2] = z;
      pos[j + 3] = x; pos[j + 4] = y - th; pos[j + 5] = z;
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }

  setCamera(cam, t, beat) {
    const camera = this.camera;
    const showWave = cam !== 'wideDrift';
    this.wave.visible = showWave;
    this.wave2.visible = showWave;
    if (cam === 'slowPush') {
      const k = smoothstep(0, 4, t);
      aimCamera(camera, V(Math.sin(t * 0.05) * 2.4, 1.6, lerp(32, 19, k)), V(0, 0, 0), lerp(46, 52, k));
    } else if (cam === 'pulseClose') {
      const k = smoothstep(0, 2, t);
      aimCamera(camera, V(Math.sin(t * 0.2) * 1.4, lerp(1.2, 0.6, k), lerp(8.5, 5.2, k)), V(0, 0, 0), 42);
    } else {
      const a = -0.4 + t * 0.05;
      aimCamera(camera, V(Math.cos(a) * 27, 6 + Math.sin(t * 0.1) * 2, Math.sin(a) * 27), V(0, 0, 0), 48);
    }
    return camera;
  }
}

/* ═══════════════════════════════════════════════════════════════
   LOGO — assembly and title slam
   ═══════════════════════════════════════════════════════════════ */
export class LogoScene {
  constructor() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020107);
    scene.fog = new THREE.FogExp2(0x05020c, 0.008);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 400);

    this.stars = makeStarfield({ count: 3800, radius: 170, depth: 180, size: 0.5, opacity: 0.8 });
    scene.add(this.stars);

    const nebs = [
      { c: 0x37f5ff, s: 55, x: -24, y: 12, z: -45, o: 0.06 },
      { c: 0xff2e88, s: 70, x: 26, y: -14, z: -55, o: 0.06 },
      { c: 0xb26bff, s: 42, x: 4, y: 0, z: -35, o: 0.05 }
    ];
    for (const n of nebs) { const sp = makeGlowSprite(n.c, n.s, n.o); sp.position.set(n.x, n.y, n.z); scene.add(sp); }

    this.gate = makeGate({ radii: [12.5, 15.2, 18.5], z: -10, opacity: 0.9 });
    scene.add(this.gate);
    this.gate2 = makeGate({ radii: [24, 27, 30], z: -34, opacity: 0.4 });
    scene.add(this.gate2);

    this.logo = new LogoParticles({ width: 27, assembleStart: 16, assembleEnd: 27, slamBeat: 32 });
    scene.add(this.logo.group);

    // assembly seed: a bright signal core the particles converge on
    this.seed = new THREE.Group();
    const seedMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.seed.add(seedMesh);
    const seedHalo = makeGlowSprite(0xffd166, 3.4, 0.5);
    this.seed.add(seedHalo);
    const seedCage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.9, 1),
      new THREE.MeshBasicMaterial({ color: 0xff2e88, wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending })
    );
    this.seed.add(seedCage);
    this.seedHalo = seedHalo;
    this.seedCage = seedCage;
    this.seed.position.set(0, 0.4, -1);
    scene.add(this.seed);

    // sweeping light planes
    this.beams = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.PlaneGeometry(60, 0.16);
      const mat = new THREE.MeshBasicMaterial({
        color: i === 1 ? 0xff2e88 : 0x37f5ff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(0, -6 + i * 6, -4);
      m.rotation.z = -0.18 + i * 0.18;
      scene.add(m); this.beams.push(m);
    }

    this.notes = makeNoteSprites(34, { colors: ['#ffd166', '#37f5ff', '#ff2e88', '#ffffff'], scale: 0.7, seed: 31 });
    scene.add(this.notes);

    const ringEvents = [];
    for (let b = 16; b < 42; b++) {
      ringEvents.push({
        t: b * BEAT, origin: V(0, 0, -1), max: b === 32 ? 21 : 9,
        dur: b === 32 ? 1.6 : 1.0, color: b === 32 ? 0xffd166 : 0x37f5ff,
        opacity: b === 32 ? 0.7 : 0.22
      });
    }
    this.rings = new RingWaveSystem(scene, ringEvents);
  }

  update(t, beat) {
    this.logo.update(beat, { crisp: smoothstep(28.6, 31.2, beat) });
    this.rings.update(t);

    // the seed core breathes until the wordmark slams shut
    const seedP = smoothstep(16, 30, beat);
    this.seed.visible = beat < 25;
    if (this.seed.visible) {
      const s = (0.55 + seedP * 1.15 + beatPulse(beat) * 0.18) * (1 - smoothstep(21.5, 24.5, beat));
      this.seed.scale.setScalar(s);
      this.seed.rotation.y = t * 0.6;
      this.seedCage.rotation.y = -t * 0.9;
      this.seedCage.rotation.x = t * 0.4;
      this.seedHalo.material.opacity = 0.32 + beatPulse(beat) * 0.3;
    }
    this.stars.rotation.y = t * 0.004;
    for (const ring of this.gate.userData.rings) ring.rotation.z += ring.userData.spin * 0.6;
    for (const ring of this.gate2.userData.rings) ring.rotation.z -= ring.userData.spin * 0.25;
    this.gate.rotation.z = t * 0.015;
    this.gate2.rotation.z = -t * 0.008;

    const bp = beatPulse(beat);
    for (let i = 0; i < this.beams.length; i++) {
      const m = this.beams[i];
      m.material.opacity = 0.1 + bp * 0.18 * (i === 1 ? 1.4 : 1);
      m.position.y = -7 + i * 6 + Math.sin(t * 0.4 + i) * 0.6;
    }
    for (const n of this.notes.userData.notes) {
      const u = n.userData;
      const a = u.angle + t * u.speed * 0.6;
      n.position.set(Math.cos(a) * u.radius * 1.6, u.yBase * 0.5 + Math.sin(t * 0.5 + u.seed) * 1.2, Math.sin(a) * u.radius * 0.8 - 8);
      n.material.opacity = 0.15 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.3 + u.seed));
    }
  }

  setCamera(cam, t, beat, shot) {
    const camera = this.camera;
    const local = beat - (shot ? shot.a : 16);
    if (cam === 'orbitFar') {
      const a = -0.5 + t * 0.06;
      aimCamera(camera, V(Math.cos(a) * 42, 4.6 + Math.sin(t * 0.11) * 1.4, Math.sin(a) * 42), V(0, 0, 0), 44);
    } else if (cam === 'pushIn') {
      const k = smoothstep(0, 4, t);
      aimCamera(camera, V(lerp(8, 3, k), lerp(4, 2, k), lerp(46, 30, k)), V(0, 0.2, 0), lerp(46, 42, k));
    } else if (cam === 'throughGate') {
      const k = smoothstep(0, 1, t);
      aimCamera(camera, V(lerp(2.5, 0.6, k), lerp(1.8, 1.2, k), lerp(30, 20, k)), V(0, 0.3, 0), lerp(44, 40, k));
    } else if (cam === 'slam') {
      const k = easeOutExpo(clamp(local / 2, 0, 1));
      const kick = Math.exp(-Math.max(0, beat - 32) * 3);
      aimCamera(camera, V(lerp(0.9, 0, k), lerp(1.7, 1.3, k) + kick * 0.18, lerp(27, 21.5, k)), V(0, 0.2, 0), lerp(42, 47, k));
    } else if (cam === 'hero') {
      const a = 0.25 + Math.sin(t * 0.16) * 0.35;
      aimCamera(camera, V(Math.sin(a) * 38, 1.8 + Math.sin(t * 0.2) * 0.7, Math.cos(a) * 38), V(0, 0.4, 0), 42);
    } else if (cam === 'heroClose') {
      const a = -0.25 + Math.sin(t * 0.12) * 0.3;
      aimCamera(camera, V(Math.sin(a) * 27, 1.9, Math.cos(a) * 27), V(0, 0.3, 0), 44);
    } else {
      aimCamera(camera, V(0, 2, 34), V(0, 0, 0), 46);
    }
    return camera;
  }
}

/* ═══════════════════════════════════════════════════════════════
   COMBAT placeholder – implemented below
   ═══════════════════════════════════════════════════════════════ */
export class CombatScene {
  constructor() { this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500); }
  update() {}
  setCamera() { return this.camera; }
}

/* ═══════════════════════════════════════════════════════════════
   GALLERY placeholder
   ═══════════════════════════════════════════════════════════════ */
export class GalleryScene {
  constructor() { this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400); }
  update() {}
  setCamera() { return this.camera; }
}

/* ═══════════════════════════════════════════════════════════════
   OUTRO placeholder
   ═══════════════════════════════════════════════════════════════ */
export class OutroScene {
  constructor() { this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 400); }
  update() {}
  setCamera() { return this.camera; }
}
