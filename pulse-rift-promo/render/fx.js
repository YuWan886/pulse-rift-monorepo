/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — procedural FX toolkit
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);

export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/* ── sprite textures ────────────────────────────────────── */
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

export function noteTexture(char = '♪', color = '#ffd166', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.font = `${size * 0.72}px "Segoe UI Symbol", "Chakra Petch", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.16;
  ctx.fillStyle = color;
  ctx.fillText(char, size / 2, size / 2 + size * 0.02);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function cutRectPath(ctx, x, y, w, h, cut = 12) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

/* ── starfield / dust ───────────────────────────────────── */
export function makeStarfield(opts = {}) {
  const {
    count = 3000, radius = 160, depth = 160, size = 0.5,
    colors = ['#9dfbff', '#ffffff', '#b26bff', '#ff2e88'],
    opacity = 0.85, seed = 7
  } = opts;
  const rnd = rng(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = rnd() * TAU;
    const r = radius * (0.25 + rnd() * 0.75);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (rnd() - 0.5) * depth;
    pos[i * 3 + 2] = Math.sin(a) * r;
    c.set(colors[Math.floor(rnd() * colors.length)]);
    const b = 0.35 + rnd() * 0.65;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    sizes[i] = size * (0.35 + rnd() * rnd() * 1.6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: opacity }, uMap: { value: glowTexture() }, uScale: { value: 1 } },
    vertexShader: `
      attribute float aSize; uniform float uScale; varying vec3 vColor;
      void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = aSize * uScale * (260.0 / -mv.z); gl_Position = projectionMatrix * mv; }
    `,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uOpacity; varying vec3 vColor;
      void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor, t.a * uOpacity); }
    `,
    vertexColors: true
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/* ── note sprites ───────────────────────────────────────── */
export function makeNoteSprites(count, opts = {}) {
  const { colors = ['#ffd166', '#37f5ff', '#ff2e88'], scale = 0.8, seed = 11 } = opts;
  const rnd = rng(seed);
  const chars = ['♪', '♫', '♩', '♬'];
  const group = new THREE.Group();
  const texs = {};
  for (const ch of chars) for (const col of colors) {
    const key = ch + col;
    texs[key] = noteTexture(ch, col);
  }
  const notes = [];
  for (let i = 0; i < count; i++) {
    const ch = chars[Math.floor(rnd() * chars.length)];
    const col = colors[Math.floor(rnd() * colors.length)];
    const mat = new THREE.SpriteMaterial({
      map: texs[ch + col], color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(scale * (0.6 + rnd() * 0.9));
    sp.userData = {
      seed: rnd() * 100, radius: 4 + rnd() * 18,
      angle: rnd() * TAU, speed: 0.05 + rnd() * 0.14,
      yBase: (rnd() - 0.5) * 14, bob: 0.5 + rnd() * 2
    };
    notes.push(sp); group.add(sp);
  }
  group.userData.notes = notes;
  return group;
}

/* ── bursts : deterministic particle explosions ─────────── */
export class BurstSystem {
  constructor(scene, events, opts = {}) {
    this.scene = scene;
    this.events = events.map((e, i) => this._make(e, i, opts));
  }

  _make(e, index, opts) {
    const count = e.count ?? 140;
    const rnd = rng(1000 + index * 13);
    const pos = new Float32Array(count * 3);
    const dirs = new Float32Array(count * 3);
    const spd = new Float32Array(count);
    const siz = new Float32Array(count);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    const palette = e.colors || ['#ffd166', '#ff2e88', '#37f5ff', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * TAU;
      const s = Math.sqrt(1 - u * u);
      dirs[i * 3] = Math.cos(a) * s;
      dirs[i * 3 + 1] = u;
      dirs[i * 3 + 2] = Math.sin(a) * s;
      spd[i] = (e.speed ?? 6) * (0.25 + Math.pow(rnd(), 1.6) * 1.4);
      siz[i] = (e.size ?? 0.35) * (0.4 + rnd() * 1.4);
      c.set(palette[Math.floor(rnd() * palette.length)]);
      const b = 0.7 + rnd() * 0.6;
      col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 1 }, uMap: { value: glowTexture() } },
      vertexShader: `
        attribute float aSize; varying vec3 vColor;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }
      `,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uOpacity; varying vec3 vColor;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, t.a * uOpacity); }
      `,
      vertexColors: true
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    this.scene.add(points);
    return {
      t: e.t, dur: e.dur ?? 1.8, origin: e.origin,
      dirs, spd, pos, geo, points, mat,
      count, gravity: e.gravity ?? -2.2, drag: e.drag ?? 0.55, index
    };
  }

  update(t) {
    for (const e of this.events) {
      const age = t - e.t;
      const live = age >= 0 && age <= e.dur;
      e.points.visible = live;
      if (!live) continue;
      const p = e.pos;
      const k = Math.exp(-e.drag * age);
      const travel = (1 - Math.exp(-e.drag * age)) / e.drag;
      for (let i = 0; i < e.count; i++) {
        const s = e.spd[i] * travel;
        p[i * 3] = e.origin.x + e.dirs[i * 3] * s;
        p[i * 3 + 1] = e.origin.y + e.dirs[i * 3 + 1] * s + 0.5 * e.gravity * age * age;
        p[i * 3 + 2] = e.origin.z + e.dirs[i * 3 + 2] * s;
      }
      e.geo.attributes.position.needsUpdate = true;
      const lifeT = age / e.dur;
      e.mat.uniforms.uOpacity.value = Math.pow(1 - lifeT, 1.5);
    }
  }
}

/* ── expanding rings ───────────────────────────────────── */
export class RingWaveSystem {
  constructor(scene, events) {
    this.events = events.map((e, i) => {
      const geo = new THREE.RingGeometry(0.985, 1, 160);
      const mat = new THREE.MeshBasicMaterial({
        color: e.color ?? 0xffd166, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(e.origin || new THREE.Vector3());
      mesh.rotation.copy(e.rotation || new THREE.Euler(-Math.PI / 2, 0, 0));
      mesh.visible = false;
      scene.add(mesh);
      return { ...e, mesh, mat, max: e.max ?? 18, dur: e.dur ?? 1.1, index: i };
    });
  }
  update(t) {
    for (const e of this.events) {
      const age = t - e.t;
      const live = age >= 0 && age <= e.dur;
      e.mesh.visible = live;
      if (!live) continue;
      const k = age / e.dur;
      const r = 0.6 + easeOutCubic(k) * e.max;
      e.mesh.scale.setScalar(r);
      e.mat.opacity = Math.pow(1 - k, 1.4) * (e.opacity ?? 0.75);
    }
  }
}

/* ── ship trail ribbon ──────────────────────────────────── */
export class TrailRibbon {
  constructor(scene, color = 0x37f5ff, samples = 46, width = 0.18) {
    this.samples = samples;
    this.width = width;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(samples * 2 * 3);
    this.alpha = new Float32Array(samples * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < samples - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } },
      vertexShader: `
        attribute float aAlpha; varying float vA;
        void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main(){ gl_FragColor = vec4(uColor, vA * uOpacity); }
      `
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(points, up = new THREE.Vector3(0, 1, 0)) {
    const n = Math.min(this.samples, points.length);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(n - 1, i + 1)];
      const dir = new THREE.Vector3().subVectors(prev, next);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();
      const w = this.width * (1 - i / n);
      this.pos[i * 6] = p.x + side.x * w;
      this.pos[i * 6 + 1] = p.y + side.y * w;
      this.pos[i * 6 + 2] = p.z + side.z * w;
      this.pos[i * 6 + 3] = p.x - side.x * w;
      this.pos[i * 6 + 4] = p.y - side.y * w;
      this.pos[i * 6 + 5] = p.z - side.z * w;
      const a = Math.pow(1 - i / n, 1.6);
      this.alpha[i * 2] = a; this.alpha[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

/* ── billboard glow sprite ──────────────────────────────── */
export function makeGlowSprite(color = 0x37f5ff, scale = 4, opacity = 0.6) {
  const mat = new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(scale);
  return s;
}

/* ── camera shake noise ─────────────────────────────────── */
export function shakeNoise(t, seed = 0) {
  return new THREE.Vector3(
    Math.sin(t * 61.7 + seed) * 0.6 + Math.sin(t * 27.3 + seed * 2.1) * 0.4,
    Math.sin(t * 53.1 + seed * 1.7) * 0.6 + Math.sin(t * 31.9 + seed * 3.3) * 0.4,
    Math.sin(t * 47.9 + seed * 2.7) * 0.5
  );
}

/* ── energy beam between two points ─────────────────────── */
export function makeBeam(color = 0xffd166, opacity = 0.9) {
  const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  return mesh;
}

export function orientBeam(mesh, a, b, radius = 1) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 1e-4) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.copy(a);
  mesh.scale.set(radius, len, radius);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}
