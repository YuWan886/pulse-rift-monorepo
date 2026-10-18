/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — COMBAT SET
   The arena, the ship, the crosshair that closes on the beat,
   the bullet notation and the conductor of the void.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BEAT, PERFECT_BEATS } from './timeline.js';
import {
  TAU, clamp, lerp, smoothstep, easeInOut, easeOutCubic, easeOutExpo,
  rng, makeStarfield, makeGlowSprite, makeBeam, orientBeam,
  BurstSystem, RingWaveSystem, TrailRibbon, glowTexture, noteTexture
} from './fx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const aimCamera = (camera, p, target, fov = 50) => {
  camera.position.copy(p); camera.fov = fov; camera.lookAt(target); camera.updateProjectionMatrix();
};
const frac = (x) => x - Math.floor(x);
const pulse = (beat) => Math.exp(-frac(beat) * 5.5);

const ENEMY_DEFS = [
  { type: 'drone',    color: 0xff528f, geo: () => new THREE.OctahedronGeometry(0.95), size: 1.0 },
  { type: 'weaver',   color: 0xff8a3d, geo: () => new THREE.TorusKnotGeometry(0.58, 0.16, 72, 8), size: 1.1 },
  { type: 'orbiter',  color: 0xd95cff, geo: () => new THREE.IcosahedronGeometry(0.88), size: 1.15, ring: true },
  { type: 'sniper',   color: 0xffd166, geo: () => new THREE.ConeGeometry(0.68, 1.7, 4), size: 1.0 },
  { type: 'brute',    color: 0xff4056, geo: () => new THREE.DodecahedronGeometry(1.45), size: 1.2 },
  { type: 'splitter', color: 0xb06bff, geo: () => new THREE.SphereGeometry(0.9, 18, 14), size: 1.0 },
  { type: 'prism',    color: 0x46ffd4, geo: () => new THREE.TetrahedronGeometry(1.12), size: 1.05 },
  { type: 'stinger',  color: 0xffd166, geo: () => new THREE.OctahedronGeometry(0.82), size: 1.0 }
];

const enemyAssets = {};
function getEnemyAssets(def) {
  if (enemyAssets[def.type]) return enemyAssets[def.type];
  const geo = def.geo();
  const solid = new THREE.MeshStandardMaterial({
    color: 0x0b0316, emissive: def.color, emissiveIntensity: 0.22,
    metalness: 0.75, roughness: 0.28, flatShading: true
  });
  const wire = new THREE.MeshBasicMaterial({
    color: def.color, wireframe: true, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  enemyAssets[def.type] = { geo, solid, wire };
  return enemyAssets[def.type];
}

const noteMats = {};
function getNoteMat(char, color) {
  const key = char + color;
  if (noteMats[key]) return noteMats[key];
  noteMats[key] = new THREE.SpriteMaterial({
    map: noteTexture(char, color), transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  return noteMats[key];
}

function makeShip() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x061820, emissive: 0x0a4f5e, emissiveIntensity: 0.9,
    metalness: 0.94, roughness: 0.26, side: THREE.DoubleSide, flatShading: true
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x030d14, emissive: 0x073a46, emissiveIntensity: 0.8,
    metalness: 0.9, roughness: 0.34, side: THREE.DoubleSide, flatShading: true
  });
  const accent = new THREE.MeshBasicMaterial({ color: 0x9ff7ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });

  // faceted dart fuselage
  const fusGeo = new THREE.ConeGeometry(0.5, 3.0, 4, 1);
  const body = new THREE.Mesh(fusGeo, hullMat);
  body.rotation.x = Math.PI / 2;
  body.rotation.y = Math.PI / 4;
  body.scale.set(0.9, 1, 0.58);
  body.position.z = 0.12;
  g.add(body);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(fusGeo),
    new THREE.LineBasicMaterial({ color: 0xd8ffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })
  );
  edges.rotation.copy(body.rotation);
  edges.scale.copy(body.scale);
  edges.position.copy(body.position);
  g.add(edges);

  // swept delta wings
  const wv = new Float32Array([
    0.18, 0.0, 0.78, 1.62, -0.06, -0.02, 1.02, -0.09, -1.02,
    0.18, 0.0, 0.78, 1.02, -0.09, -1.02, 0.18, 0.0, -0.72,
    -0.18, 0.0, 0.78, -1.02, -0.09, -1.02, -1.62, -0.06, -0.02,
    -0.18, 0.0, 0.78, -0.18, 0.0, -0.72, -1.02, -0.09, -1.02
  ]);
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.BufferAttribute(wv, 3));
  wingGeo.computeVertexNormals();
  const wings = new THREE.Mesh(wingGeo, darkMat);
  g.add(wings);

  // leading-edge light strips
  for (const sx of [1, -1]) {
    const pts = [
      V(sx * 0.18, 0.01, 0.78),
      V(sx * 1.62, -0.05, -0.02),
      V(sx * 1.02, -0.08, -1.02)
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x8ff6ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
    );
    g.add(line);
    const tip = makeGlowSprite(sx > 0 ? 0x37f5ff : 0xff2e88, 0.26, 0.7);
    tip.position.set(sx * 1.62, -0.04, -0.02);
    g.add(tip);
  }

  // twin engine nacelles
  const exhausts = [];
  for (const sx of [-1, 1]) {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.145, 0.9, 8), hullMat);
    nac.rotation.x = Math.PI / 2;
    nac.position.set(sx * 0.4, -0.03, -0.98);
    g.add(nac);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.022, 6, 20), accent);
    ring.position.set(sx * 0.4, -0.03, -1.42);
    g.add(ring);
    const exhaust = makeGlowSprite(0x37f5ff, 0.5, 0.7);
    exhaust.position.set(sx * 0.4, -0.03, -1.5);
    g.add(exhaust);
    exhausts.push(exhaust);
  }

  // cockpit canopy
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0x03111a, emissive: 0x0aa7bd, emissiveIntensity: 0.6, metalness: 0.95, roughness: 0.12 })
  );
  cockpit.scale.set(0.26, 0.15, 0.6);
  cockpit.position.set(0, 0.17, 0.2);
  g.add(cockpit);

  // spine + vertical stabilizer
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 1.5), hullMat);
  spine.position.set(0, 0.16, -0.15);
  g.add(spine);
  const finV = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.5, 0.62),
    new THREE.MeshStandardMaterial({ color: 0x04141c, emissive: 0x37f5ff, emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.25 })
  );
  finV.position.set(0, 0.28, -0.92);
  g.add(finV);

  // nose core + hull halo
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  core.position.set(0, 0.02, 0.85);
  g.add(core);
  const halo = makeGlowSprite(0x37f5ff, 0.62, 0.22);
  halo.position.set(0, 0.02, 0.2);
  g.add(halo);
  const engine = makeGlowSprite(0x37f5ff, 1.1, 0.5);
  engine.position.set(0, -0.03, -1.55);
  g.add(engine);
  g.userData = { body, edges, core, halo, engine, cockpit, finV, exhausts };
  g.scale.setScalar(0.82);
  return g;
}

export class CombatScene {
  constructor() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020107);
    scene.fog = new THREE.FogExp2(0x06020e, 0.0115);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 600);
    this.t = 0; this.beat = 0; this.mode = 'arena';
    this.rnd = rng(2024);

    this._buildBackdrop();
    this._buildArena();
    this._buildShip();
    this._buildEnemies();
    this._buildBoss();
    this._buildCrosshair();
    this._buildBullets();
    this._buildShots();
    this._buildEffects();
    this._buildBulletEvents();
  }

  /* ── backdrop ─────────────────────────────────────────── */
  _buildBackdrop() {
    const scene = this.scene;
    this.stars = makeStarfield({ count: 3600, radius: 190, depth: 200, size: 0.55, opacity: 0.8, seed: 303 });
    scene.add(this.stars);
    this.dust = makeStarfield({ count: 500, radius: 34, depth: 30, size: 0.36, opacity: 0.35, colors: ['#ffd166', '#37f5ff', '#ff2e88'], seed: 404 });
    scene.add(this.dust);

    // near-camera bokeh motes: soft foreground depth
    this.bokehGroup = new THREE.Group();
    const brnd = rng(717);
    for (let i = 0; i < 30; i++) {
      const cols = [0x37f5ff, 0xff2e88, 0xffd166];
      const sp = makeGlowSprite(cols[i % 3], 1.4 + brnd() * 2.6, 0.035 + brnd() * 0.05);
      const a = brnd() * TAU, r = 17 + brnd() * 14;
      sp.position.set(Math.cos(a) * r, 0.6 + brnd() * 10, Math.sin(a) * r * 0.9 - 6);
      sp.userData = { y0: sp.position.y, seed: brnd() * 10 };
      this.bokehGroup.add(sp);
    }
    scene.add(this.bokehGroup);

    // soft haze veils around the rift gate
    this.shafts = [];
    for (let i = 0; i < 2; i++) {
      const veil = makeGlowSprite(i ? 0xff2e88 : 0x37f5ff, 44, 0.035);
      veil.position.set(i ? -12 : 12, 14, -44);
      scene.add(veil); this.shafts.push(veil);
    }

    // rift gate in the distance
    const gate = new THREE.Group();
    gate.position.set(0, 11, -46);
    const radii = [17, 19.2, 21.8];
    const cols = [0x37f5ff, 0xff2e88, 0xffd166];
    radii.forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, i === 0 ? 0.08 : 0.045, 8, 240),
        new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      gate.add(ring);
    });
    // spiral rift
    this.riftArms = [];
    for (let arm = 0; arm < 3; arm++) {
      const pts = [];
      for (let i = 0; i <= 140; i++) {
        const k = i / 140;
        const r = 2.2 + k * 15.5;
        const a = arm * TAU / 3 + k * 5.4;
        pts.push(V(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: arm === 1 ? 0xff2e88 : 0xb26bff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      gate.add(line); this.riftArms.push(line);
    }
    const riftGlow = makeGlowSprite(0x8b3dff, 36, 0.1);
    riftGlow.position.z = -1;
    gate.add(riftGlow);
    scene.add(gate);
    this.gate = gate;

    // monoliths
    this.monoliths = new THREE.Group();
    const mrnd = rng(555);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + mrnd() * 0.12;
      const r = 42 + mrnd() * 10;
      const h = 10 + mrnd() * 20;
      const w = 2 + mrnd() * 3;
      const geo = new THREE.BoxGeometry(w, h, w);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x070310, metalness: 0.5, roughness: 0.8 }));
      mesh.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
      mesh.rotation.y = a + mrnd();
      this.monoliths.add(mesh);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: i % 3 === 0 ? 0xff2e88 : 0x37f5ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending })
      );
      edge.position.copy(mesh.position); edge.rotation.copy(mesh.rotation);
      this.monoliths.add(edge);
      const cap = makeGlowSprite(i % 3 === 0 ? 0xff2e88 : 0x37f5ff, 1.6, 0.5);
      cap.position.set(mesh.position.x, h - 1.6, mesh.position.z);
      this.monoliths.add(cap);
    }
    scene.add(this.monoliths);

    // staff lines in the back, with drifting notes
    this.staffGroup = new THREE.Group();
    this.staffGroup.position.set(0, 0, -18);
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let x = -30; x <= 30; x += 2) {
        pts.push(V(x, 5.2 + i * 0.72 + Math.sin(x * 0.14 + i * 0.8) * 0.5, Math.sin(x * 0.08 + i) * 0.8));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 160, 0.009, 4, false),
        new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffd166 : 0x37f5ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.staffGroup.add(line);
    }
    scene.add(this.staffGroup);
    this.staffNotes = [];
    const nrnd = rng(808);
    for (let i = 0; i < 22; i++) {
      const sp = new THREE.Sprite(getNoteMat(nrnd() < 0.6 ? '♪' : '♫', nrnd() < 0.5 ? '#ffd166' : '#37f5ff'));
      sp.scale.setScalar(0.35 + nrnd() * 0.3);
      sp.userData = { seed: nrnd() * 10, speed: 0.12 + nrnd() * 0.2, y: 5 + nrnd() * 3.6 };
      this.staffGroup.add(sp); this.staffNotes.push(sp);
    }
  }

  /* ── arena floor + rim ────────────────────────────────── */
  _buildArena() {
    const scene = this.scene;
    const floorGeo = new THREE.CircleGeometry(30, 128);
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uBeat: { value: 0 }, uMode: { value: 0 }, uPulse: { value: 1 },
        uColorA: { value: new THREE.Color(0x37f5ff) },
        uColorB: { value: new THREE.Color(0xff2e88) }
      },
      vertexShader: `
        varying vec2 vP;
        void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        varying vec2 vP;
        uniform float uTime, uBeat, uMode, uPulse;
        uniform vec3 uColorA, uColorB;
        void main(){
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          float ringD = abs(fract(r / 2.2 + 0.5) - 0.5) * 2.2;
          float ring = 1.0 - smoothstep(0.0, 0.06, ringD);
          float spokeD = abs(fract(ang / 6.2831853 * 36.0 + 0.5) - 0.5);
          float spoke = (1.0 - smoothstep(0.0, 0.02, spokeD)) * smoothstep(2.0, 4.0, r);
          float ph = fract(uBeat);
          float pulseR = ph * 26.0;
          float pulse = exp(-pow((r - pulseR) * 0.55, 2.0)) * (1.0 - ph) * uPulse;
          float pulse2 = exp(-pow((r - fract(uBeat * 0.5) * 26.0) * 0.85, 2.0)) * 0.25;
          float core = exp(-r * 0.16);
          float fade = 1.0 - smoothstep(24.0, 30.0, r);
          vec3 base = vec3(0.007, 0.0035, 0.018);
          vec3 col = base + uColorA * (ring * 0.055 + spoke * 0.042 + core * 0.10 + pulse * 0.20)
                   + uColorB * (ring * 0.022 + pulse * 0.055 + pulse2 * 0.045);
          if (uMode > 0.5) col += vec3(0.18, 0.09, 0.012) * (ring * 0.03 + pulse * 0.07);
          col *= fade;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const floor = new THREE.Mesh(floorGeo, this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(26, 0.04, 8, 256),
      new THREE.MeshBasicMaterial({ color: 0x37f5ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.18;
    scene.add(rim);
    this.rim = rim;

    // beat equalizer ring
    const N = 64;
    const geo = new THREE.BoxGeometry(0.16, 1, 0.16);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    this.eq = new THREE.InstancedMesh(geo, mat, N);
    this.eq.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const cA = new THREE.Color(0x37f5ff), cB = new THREE.Color(0xff2e88), cC = new THREE.Color(0xffd166);
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU;
      this.eq.setColorAt(i, i % 4 === 0 ? cC : (i % 2 ? cA : cB));
      const m = new THREE.Matrix4();
      m.compose(V(Math.cos(a) * 29.5, 0.1, Math.sin(a) * 29.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), V(1, 1, 1));
      this.eq.setMatrixAt(i, m);
    }
    this.eq.instanceColor.needsUpdate = true;
    scene.add(this.eq);
    this.eqCount = N;

    // soft lights
    const l1 = new THREE.PointLight(0xff2e88, 120, 120, 2); l1.position.set(-22, 10, -10); scene.add(l1);
    const l2 = new THREE.PointLight(0x37f5ff, 100, 120, 2); l2.position.set(22, 8, -8); scene.add(l2);
    const l3 = new THREE.PointLight(0xffd166, 60, 80, 2); l3.position.set(0, 18, -20); scene.add(l3);
  }

  /* ── ship ─────────────────────────────────────────────── */
  _buildShip() {
    this.ship = makeShip();
    this.scene.add(this.ship);
    this.trail = new TrailRibbon(this.scene, 0x37f5ff, 46, 0.16);
    this.shipPos = V(0, 1.6, 0);
  }

  _shipPosAt(t, modeOverride = null) {
    const mode = modeOverride || this.mode;
    let x = 7.8 * Math.sin(t * 0.72 + 0.4) + 2.1 * Math.sin(t * 1.83 + 1.2);
    let z = 5.4 * Math.cos(t * 0.61) + 2.0 * Math.cos(t * 1.47 + 0.6) - 1;
    let y = 1.65 + 0.28 * Math.sin(t * 2.2);
    if (mode === 'boss' || mode === 'overdrive') {
      x *= 0.85; z = z * 0.85 - 2;
      y = 1.7 + 0.3 * Math.sin(t * 2.6);
    }
    if (mode === 'dodge') {
      x = 6.2 * Math.sin(t * 0.9 + 0.3) + 1.8 * Math.sin(t * 2.3);
      z = 4.5 * Math.cos(t * 0.75) + 1.5 * Math.cos(t * 1.9 + 1);
      y = 1.7 + 0.25 * Math.sin(t * 2.8);
    }
    // beat-dash impulses during the phase section
    if (mode === 'dodge') {
      const dashes = [[84, 1], [88, -1], [92, 1]];
      for (const [b, dir] of dashes) {
        const age = (t - b * BEAT);
        if (age > 0 && age < 0.55) {
          const env = smoothstep(0, 0.1, age) * (1 - smoothstep(0.12, 0.5, age));
          x += dir * env * 4.2;
          z += (b === 88 ? -1 : 1) * env * 2.4;
        }
      }
    }
    return V(x, y, z);
  }

  /* ── enemies ──────────────────────────────────────────── */
  _buildEnemies() {
    this.enemies = [];
    const deaths = PERFECT_BEATS.filter(b => b >= 42 && b <= 78);
    const rnd = rng(901);
    const count = deaths.length + 4;
    for (let i = 0; i < count; i++) {
      const def = ENEMY_DEFS[i % ENEMY_DEFS.length];
      const assets = getEnemyAssets(def);
      const group = new THREE.Group();
      const solid = new THREE.Mesh(assets.geo, assets.solid);
      const wire = new THREE.Mesh(assets.geo, assets.wire);
      group.add(solid); group.add(wire);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      group.add(core);
      const glow = makeGlowSprite(def.color, 1.15, 0.28);
      group.add(glow);
      // orbiting notation ring: gives every enemy a constructed silhouette
      const orbit = new THREE.Group();
      const oMat = new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false });
      const oring = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.016, 6, 64), oMat);
      oring.rotation.x = Math.PI / 2 + 0.55;
      orbit.add(oring);
      const shardGeo = new THREE.OctahedronGeometry(0.11, 0);
      const shardMat = new THREE.MeshBasicMaterial({ color: def.color });
      for (let k = 0; k < 3; k++) {
        const sh = new THREE.Mesh(shardGeo, shardMat);
        const a = k / 3 * TAU;
        sh.position.set(Math.cos(a) * 1.24, 0, Math.sin(a) * 1.24);
        orbit.add(sh);
      }
      group.add(orbit);

      let ring = null;
      if (def.ring) {
        ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.55, 0.035, 6, 80),
          new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
        );
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }
      group.scale.setScalar(def.size);
      this.scene.add(group);
      const deathBeat = i < deaths.length ? deaths[i] : Infinity;
      const e = {
        group, solid, wire, core, glow, ring, orbit, oring, def,
        spawn: 30 + rnd() * 5,
        death: deathBeat,
        radius: 7 + (i % 5) * 2.2 + rnd() * 2.4,
        angle: rnd() * TAU,
        speed: (0.08 + rnd() * 0.11) * (i % 2 ? 1 : -1),
        baseY: 2.2 + rnd() * 3.4,
        seed: rnd() * 10,
        alive: true
      };
      this.enemies.push(e);
      group.visible = false;
    }
  }

  _enemyPosAt(e, beat) {
    const age = beat - e.spawn;
    const a = e.angle + age * e.speed;
    const r = e.radius + Math.sin(age * 0.37 + e.seed) * 0.7;
    return V(
      Math.cos(a) * r,
      e.baseY + Math.sin(age * 0.9 + e.seed) * 0.32,
      -4 + Math.sin(a) * r * 0.78
    );
  }

  _updateEnemies(t, beat) {
    const arenaMode = this.mode === 'arena';
    const b80 = smoothstep(78, 80, beat);
    for (const e of this.enemies) {
      const alive = arenaMode && beat >= e.spawn && beat < e.death && b80 < 0.5;
      e.group.visible = alive;
      if (!alive) continue;
      const p = this._enemyPosAt(e, beat);
      e.group.position.copy(p);
      e.group.rotation.y = t * 0.7 + e.seed;
      e.group.rotation.x = Math.sin(t * 0.5 + e.seed) * 0.5;
      if (e.ring) e.ring.rotation.z = t * 1.3;
      if (e.orbit) {
        e.orbit.rotation.y = t * 0.95 + e.seed;
        e.orbit.rotation.z = Math.sin(t * 0.7 + e.seed) * 0.45;
        e.oring.rotation.z = t * 1.6;
      }
      const s = e.def.size * (1 + pulse(beat) * 0.12);
      e.group.scale.setScalar(s);
    }
  }

  /* ── boss : the maestro ───────────────────────────────── */
  _buildBoss() {
    const g = new THREE.Group();
    g.position.set(0, 8.4, -5);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x12030f, emissive: 0xff2e88, emissiveIntensity: 0.25,
      metalness: 0.85, roughness: 0.2, flatShading: true
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.75, 1), coreMat);
    g.add(core);
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.95, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd166, wireframe: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
    );
    g.add(cage);
    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.25, 2),
      new THREE.MeshBasicMaterial({ color: 0xff2e88 })
    );
    g.add(inner);
    const halo = makeGlowSprite(0xff2e88, 10, 0.35);
    g.add(halo);

    const rings = [];
    const ringCols = [0xffd166, 0x37f5ff, 0xff2e88];
    for (let i = 0; i < 3; i++) {
      const r = 4.3 + i * 1.25;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, i === 0 ? 0.08 : 0.05, 8, 220),
        new THREE.MeshBasicMaterial({ color: ringCols[i], transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.userData.base = new THREE.Euler(1.2 + i * 0.7, 0.6 - i * 0.4, i * 0.5);
      ring.rotation.copy(ring.userData.base);
      g.add(ring); rings.push(ring);
      // tick beads
      const beadGeo = new THREE.SphereGeometry(0.11, 8, 6);
      const beadMat = new THREE.MeshBasicMaterial({ color: ringCols[(i + 1) % 3] });
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * TAU;
        const bead = new THREE.Mesh(beadGeo, beadMat);
        bead.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        ring.add(bead);
      }
    }

    // metronome pendulum
    const pend = new THREE.Group();
    pend.position.set(0, 3.0, 0);
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 7.6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95 })
    );
    rod.position.y = -3.8;
    pend.add(rod);
    const weight = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x1a0a05, emissive: 0xffd166, emissiveIntensity: 1.4, metalness: 0.9, roughness: 0.2 })
    );
    weight.position.y = -7.2;
    pend.add(weight);
    const weightGlow = makeGlowSprite(0xffd166, 1.8, 0.4);
    weightGlow.position.y = -7.2;
    pend.add(weightGlow);
    g.add(pend);

    // baton
    const baton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.03, 11, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x37f5ff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
    );
    baton.geometry.translate(0, 5.5, 0);
    g.add(baton);
    const batonTip = makeGlowSprite(0x37f5ff, 2.6, 0.9);
    g.add(batonTip);

    const satellites = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42, 0),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd166 : 0xff2e88 })
      );
      s.userData.a = i / 6 * TAU;
      g.add(s); satellites.push(s);
      const sg = makeGlowSprite(i % 2 ? 0xffd166 : 0xff2e88, 1.4, 0.6);
      s.add(sg);
    }

    this.boss = g;
    this.bossCore = core;
    this.bossCage = cage;
    this.bossInner = inner;
    this.bossHalo = halo;
    this.bossRings = rings;
    this.bossPendulum = pend;
    this.bossBaton = baton;
    this.bossBatonTip = batonTip;
    this.bossSatellites = satellites;
    g.visible = false;
    this.scene.add(g);
  }

  _updateBoss(t, beat) {
    const show = (this.mode === 'boss' || this.mode === 'overdrive') && beat < 158;
    this.boss.visible = show;
    if (!show) return;
    const od = this.mode === 'overdrive';
    const bp = pulse(beat);
    this.boss.position.set(
      Math.sin(t * 0.45) * 1.2,
      8.4 + Math.sin(t * 0.7) * 0.45,
      -5 + Math.cos(t * 0.37) * 0.6
    );
    this.bossCore.rotation.y = t * 0.35;
    this.bossCore.rotation.x = t * 0.17;
    this.bossCage.rotation.y = -t * 0.5;
    this.bossCage.rotation.z = t * 0.12;
    this.bossInner.scale.setScalar(1 + bp * 0.28 + (od ? 0.18 : 0));
    this.bossInner.material.color.setHex(od ? 0xffd166 : 0xff2e88);
    this.bossHalo.material.color.setHex(od ? 0xffd166 : 0xff2e88);
    this.bossHalo.material.opacity = 0.18 + bp * 0.28;
    this.bossHalo.scale.setScalar(9 + bp * 4);

    for (let i = 0; i < this.bossRings.length; i++) {
      const r = this.bossRings[i];
      const base = r.userData.base;
      const spin = (od ? 2.6 : 1) * (i % 2 ? -1 : 1);
      r.rotation.x = base.x + t * 0.22 * spin;
      r.rotation.y = base.y + t * 0.31 * spin;
      r.rotation.z = base.z + t * 0.17 * spin;
      r.material.color.setHex(od ? (i === 1 ? 0x37f5ff : 0xffd166) : (i === 0 ? 0xffd166 : i === 1 ? 0x37f5ff : 0xff2e88));
    }

    // pendulum keeps the beat
    const swing = 0.92 * Math.sin(beat * Math.PI / 2);
    this.bossPendulum.rotation.z = swing;
    this.bossPendulum.rotation.x = Math.sin(t * 0.4) * 0.15;

    // baton sweep
    const sweep = -0.7 + Math.sin(beat * Math.PI / 4) * 1.5;
    this.bossBaton.rotation.z = sweep;
    this.bossBaton.rotation.x = Math.sin(t * 0.3) * 0.4;
    this.bossBatonTip.position.set(
      Math.sin(sweep) * 10.5,
      Math.cos(sweep) * 10.5,
      0
    );

    for (let i = 0; i < this.bossSatellites.length; i++) {
      const s = this.bossSatellites[i];
      const a = s.userData.a + t * (od ? 1.5 : 0.7);
      const rr = 7.5 + Math.sin(t + i) * 0.6;
      s.position.set(Math.cos(a) * rr, Math.sin(a * 1.3) * 2.2, Math.sin(a) * rr);
      s.rotation.y = t * 2 + i;
    }
  }

  /* ── crosshair ────────────────────────────────────────── */
  _buildCrosshair() {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const mat2 = new THREE.LineBasicMaterial({ color: 0x37f5ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });

    // dashed outer ring
    const segs = [];
    for (let i = 0; i < 72; i++) {
      if (i % 6 === 5) continue;
      const a0 = i / 72 * TAU, a1 = (i + 0.55) / 72 * TAU;
      segs.push(Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    g.add(new THREE.LineSegments(geo, mat2));

    // inner circle
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * TAU;
      pts.push(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0);
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => V(p, 0, 0)).map((_, i) => V(pts[i * 3], pts[i * 3 + 1], 0))), mat));

    // ticks
    const tickPts = [];
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU;
      const long = i % 4 === 0;
      tickPts.push(Math.cos(a) * 0.76, Math.sin(a) * 0.76, 0, Math.cos(a) * (long ? 1.0 : 0.88), Math.sin(a) * (long ? 1.0 : 0.88), 0);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
    g.add(new THREE.LineSegments(tg, mat));

    // brackets
    const br = [];
    for (let q = 0; q < 4; q++) {
      const sx = q < 2 ? 1 : -1;
      const sy = q % 2 ? 1 : -1;
      const r = 1.32;
      br.push(sx * r, sy * r, 0, sx * (r - 0.28), sy * r, 0);
      br.push(sx * r, sy * r, 0, sx * r, sy * (r - 0.28), 0);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(br, 3));
    g.add(new THREE.LineSegments(bg, mat));

    // solid inner ring (lines are always 1px; this carries the "ring closes" read)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd166, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.016, 8, 96), ringMat);
    g.add(innerRing);
    g.userData.innerRing = innerRing;

    const dot = makeGlowSprite(0xffd166, 0.5, 0.95);
    dot.material.depthTest = false;
    g.add(dot);
    g.renderOrder = 20;
    g.visible = false;
    this.cross = g;
    this.scene.add(g);
  }

  _nextTarget(beat) {
    if (this.forceMacroTarget && this.mode === 'arena') {
      let best = null, bd = -1;
      for (const e of this.enemies) {
        if (e.death === Infinity || e.death <= beat + 0.1) continue;
        const p = this._enemyPosAt(e, beat);
        const d = p.distanceToSquared(this.ship.position);
        if (d > bd) { bd = d; best = { e, p }; }
      }
      if (best) return { kind: 'enemy', beat: best.e.death, pos: best.p };
    }
    if (this.mode === 'boss' || this.mode === 'overdrive') {
      const hits = PERFECT_BEATS.filter(b => b >= 112 && b < 158);
      let nb = null;
      for (const b of hits) if (b >= beat) { nb = b; break; }
      if (nb == null) nb = beat + 2;
      return { kind: 'boss', beat: nb, pos: this.boss.position.clone().add(V(0, 0, 0)) };
    }
    if (this.mode === 'dodge') {
      return { kind: 'ship', beat: Math.ceil(beat), pos: this.shipPos.clone() };
    }
    let best = null;
    for (const e of this.enemies) {
      if (e.death > beat + 0.05 && e.death !== Infinity) {
        if (!best || e.death < best.death) best = e;
      }
    }
    if (!best) return null;
    return { kind: 'enemy', beat: best.death, pos: this._enemyPosAt(best, beat) };
  }

  _updateCrosshair(beat, camera) {
    const target = this._nextTarget(beat);
    if (!target) { this.cross.visible = false; return; }
    this.cross.visible = true;
    this.cross.position.copy(target.pos);
    this.cross.quaternion.copy(camera.quaternion);
    const ttl = Math.max(0, target.beat - beat);
    const k = clamp(1 - ttl / 1.15, 0, 1);
    let sc = target.kind === 'boss' ? lerp(7.5, 2.4, easeInOut(k)) : lerp(2.8, 0.85, easeInOut(k));
    if (target.kind === 'ship') sc = lerp(1.8, 0.7, easeInOut(frac(beat)));
    if (this.forceMacroTarget) {
      const dist = camera.position.distanceTo(this.cross.position);
      sc = Math.min(sc, dist * 0.24);
    }
    const flash = ttl < 0.12 ? 1 + (0.12 - ttl) * 3 : 1;
    this.cross.scale.setScalar(sc * flash);
    const matColor = target.kind === 'boss' ? 0x37f5ff : 0xffd166;
    this.cross.children.forEach(c => {
      if (c.material && c.material.color && c.material !== this.cross.children[0].material) {}
    });
    if (target.kind === 'boss') {
      this.cross.children.forEach(c => { if (c.material && c.material.color) c.material.color.setHex(0x37f5ff); });
    } else {
      this.cross.children.forEach(c => { if (c.material && c.material.color) c.material.color.setHex(0xffd166); });
    }
  }

  /* ── bullets ──────────────────────────────────────────── */
  _buildBullets() {
    const geo = new THREE.SphereGeometry(0.11, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bulletMesh = new THREE.InstancedMesh(geo, mat, 700);
    this.bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bulletMesh.count = 0;
    this.bulletMesh.frustumCulled = false;
    this.scene.add(this.bulletMesh);

    const pgeo = new THREE.SphereGeometry(0.09, 8, 6);
    const pmat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.playerBulletMesh = new THREE.InstancedMesh(pgeo, pmat, 200);
    this.playerBulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.playerBulletMesh.count = 0;
    this.playerBulletMesh.frustumCulled = false;
    this.scene.add(this.playerBulletMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._scale = new THREE.Vector3();
  }

  _addBulletEvent(t, origin, vel, colorHex, scale, life, clearAt = null) {
    this.bulletEvents.push({
      t, origin: origin.clone(), vel: vel.clone(),
      color: new THREE.Color(colorHex).multiplyScalar(1.35),
      scale, life, clearAt
    });
  }

  _buildBulletEvents() {
    this.bulletEvents = [];
    const srnd = rng(1313);

    // arena: enemies fire spreads at the ship
    if (this.enemies) {
      for (const e of this.enemies) {
        if (e.death === Infinity) continue;
        for (let b = Math.ceil(e.spawn + 2); b < Math.min(e.death, 80); b += 4) {
          const origin = this._enemyPosAt(e, b);
          const t = b * BEAT;
          const ship = this._shipPosAt(t, 'arena');
          const baseAng = Math.atan2(ship.z - origin.z, ship.x - origin.x);
          for (let k = -1; k <= 1; k++) {
            const a = baseAng + k * 0.13;
            const speed = 5.5 + srnd() * 1.5;
            this._addBulletEvent(t, origin, V(Math.cos(a) * speed, (ship.y - origin.y) * 0.25, Math.sin(a) * speed), e.def.color, 1.0 + srnd() * 0.5, 4.2);
          }
        }
      }
      // ambient rim patterns
      for (let b = 34; b < 96; b += 4) {
        const a0 = srnd() * TAU;
        const origin = V(Math.cos(a0) * 25, 2 + srnd() * 3.5, Math.sin(a0) * 25);
        for (let k = 0; k < 9; k++) {
          const a = a0 + Math.PI + (k / 9) * TAU * 0.55;
          const speed = 3.6 + srnd() * 1.2;
          this._addBulletEvent(b * BEAT, origin, V(Math.cos(a) * speed, (srnd() - 0.5) * 0.3, Math.sin(a) * speed), 0xb26bff, 0.9 + srnd() * 0.5, 4.6);
        }
      }
    }

    // phase section: dense slow swirls, cleared by the dash shockwaves
    for (let b = 80; b < 96; b += 2) {
      const clearAt = b < 88 ? 88 : b < 92 ? 92 : null;
      const a0 = b * 0.62;
      for (let k = 0; k < 18; k++) {
        const a = a0 + k / 18 * TAU;
        const r = 15 + (k % 3) * 2.5;
        const origin = V(Math.cos(a) * r, 1.8 + (k % 5) * 0.7, Math.sin(a) * r * 0.8 - 2);
        const tang = a + Math.PI / 2;
        const speed = 2.4;
        this._addBulletEvent(b * BEAT, origin, V(Math.cos(tang) * speed - Math.cos(a) * 0.9, 0.12, Math.sin(tang) * speed - Math.sin(a) * 0.9), k % 4 === 0 ? 0xffd166 : 0xff2e88, 1.15, 5.5, clearAt);
      }
    }

    // boss patterns
    for (let b = 112; b < 158; b++) {
      const boss = V(0, 8.4, -5);
      const clearAt = 158;
      const od = b >= 144;
      // radial ring
      const n = od ? 14 : 10;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + b * 0.31;
        const speed = 4.2 + (k % 3) * 0.7;
        this._addBulletEvent(b * BEAT, boss, V(Math.cos(a) * speed, Math.sin(a) * speed * 0.45, Math.sin(a) * speed), od ? (k % 2 ? 0xffd166 : 0x37f5ff) : 0xff2e88, 1.1, 4.5, clearAt);
      }
      // spiral arm every second beat
      if (b % 2 === 0) {
        for (let k = 0; k < 6; k++) {
          const a = b * 0.51 + k / 8 * TAU;
          const speed = 6.0;
          this._addBulletEvent(b * BEAT, boss, V(Math.cos(a) * speed, Math.sin(a) * 1.5, Math.sin(a) * speed), od ? 0xffd166 : 0xb26bff, 0.9, 3.5, clearAt);
        }
      }
      // beat wall every 4 beats
      if (b % 4 === 0) {
        for (let k = 0; k < 9; k++) {
          const x = -14 + k * 3.5;
          this._addBulletEvent(b * BEAT, V(x, 5 + (k % 3) * 1.6, -12), V((srnd() - 0.5) * 0.6, 0, 4.2), 0xff2e88, 1.35, 4.8, clearAt);
        }
      }
    }
  }

  _updateBullets(t, beat) {
    let n = 0;
    const mesh = this.bulletMesh;
    const m = this._m, q = this._q, v = this._v;
    for (const b of this.bulletEvents) {
      const age = t - b.t;
      if (age < 0 || age > b.life) continue;
      if (b.clearAt != null && beat >= b.clearAt) continue;
      const x = b.origin.x + b.vel.x * age;
      const y = b.origin.y + b.vel.y * age;
      const z = b.origin.z + b.vel.z * age;
      if (y < 0.25 || x * x + z * z > 2200) continue;
      const cp = this.camera.position;
      const dist = Math.sqrt((x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2);
      const nearFade = smoothstep(1.2, 5.5, dist);
      if (nearFade < 0.02) continue;
      v.set(b.vel.x, b.vel.y, b.vel.z).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
      this._scale.set(b.scale * 0.8 * nearFade, b.scale * 0.8 * nearFade, b.scale * 2.0 * nearFade);
      m.compose(new THREE.Vector3(x, y, z), q, this._scale);
      mesh.setMatrixAt(n, m);
      this._nc = this._nc || new THREE.Color();
      this._nc.copy(b.color).multiplyScalar(0.35 + 0.65 * nearFade);
      mesh.setColorAt(n, this._nc);
      n++;
      if (n >= 700) break;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this._updatePlayerBullets(t, beat);
  }

  _buildPlayerShots() {
    this.playerShotEvents = [];
    const rnd = rng(1717);
    const add = (b) => {
      const t = b * BEAT;
      if (b < 40 || (b > 80 && b < 96) || b > 160) return;
      const pmode = b >= 112 ? 'boss' : (b >= 80 && b < 96 ? 'dodge' : 'arena');
      const origin = this._shipPosAt(t, pmode);
      let target = null;
      if (this.mode === 'boss' || this.mode === 'overdrive') target = V(0, 8.4, -5);
      else {
        let best = null, bd = 1e9;
        for (const e of this.enemies) {
          const p = this._enemyPosAt(e, b);
          const d = p.distanceToSquared(origin);
          if (d < bd) { bd = d; best = p; }
        }
        target = best || V(0, 2, -20);
      }
      const dir = target.clone().sub(origin).normalize();
      for (let k = -1; k <= 1; k++) {
        const a = Math.atan2(dir.z, dir.x) + k * 0.035;
        const speed = 34;
        this.playerShotEvents.push({
          t,
          origin: origin.clone(),
          vel: V(Math.cos(a) * speed, 0, Math.sin(a) * speed),
          color: new THREE.Color(k === 0 ? 0xffd166 : 0x37f5ff).multiplyScalar(1.4),
          scale: 1,
          life: 0.5
        });
      }
    };
    for (let b = 40; b < 80; b += 0.25) add(b);
    for (let b = 96; b < 160; b += 0.25) add(b);
  }

  _updatePlayerBullets(t, beat) {
    const mesh = this.playerBulletMesh;
    const m = this._m, q = this._q, v = this._v;
    let n = 0;
    for (const b of this.playerShotEvents) {
      const age = t - b.t;
      if (age < 0 || age > b.life) continue;
      const x = b.origin.x + b.vel.x * age;
      const z = b.origin.z + b.vel.z * age;
      const y = b.origin.y + 0.05;
      const cp = this.camera.position;
      const dist = Math.sqrt((x - cp.x) ** 2 + (y - cp.y) ** 2 + (z - cp.z) ** 2);
      const nearFade = smoothstep(1.2, 5.0, dist);
      if (nearFade < 0.02) continue;
      v.set(b.vel.x, 0, b.vel.z).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v);
      this._scale.set(0.55 * nearFade, 0.55 * nearFade, 3.1 * nearFade);
      m.compose(new THREE.Vector3(x, y, z), q, this._scale);
      mesh.setMatrixAt(n, m);
      this._nc = this._nc || new THREE.Color();
      this._nc.copy(b.color).multiplyScalar(0.3 + 0.7 * nearFade);
      mesh.setColorAt(n, this._nc);
      n++;
      if (n >= 200) break;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /* ── shot beams and note impacts ──────────────────────── */
  _buildShots() {
    this._buildPlayerShots();
    this.shotEvents = [];
    const srnd = rng(2323);
    const addShot = (b, target, kind) => {
      const from = this._shipPosAt(b * BEAT, kind === 'boss' ? 'boss' : 'arena');
      this.shotEvents.push({
        b, t: b * BEAT, from,
        to: target.clone(),
        kind,
        color: 0xffd166
      });
    };
    for (const b of PERFECT_BEATS) {
      if (b < 42 || b > 78) continue;
      const e = this.enemies.find(en => en.death === b);
      if (!e) continue;
      addShot(b, this._enemyPosAt(e, b), 'enemy');
    }
    for (const b of PERFECT_BEATS) {
      if (b < 112 || b >= 158) continue;
      const jitter = V((srnd() - 0.5) * 1.2, 8.4 + (srnd() - 0.5) * 1.0, -5 + (srnd() - 0.5) * 1.0);
      addShot(b, jitter, 'boss');
    }
    this.beams = [];
    this.beamNotes = [];
    for (let i = 0; i < this.shotEvents.length; i++) {
      const beam = makeBeam(0xffd166, 0.9);
      this.scene.add(beam); this.beams.push(beam);
      const sp = new THREE.Sprite(getNoteMat(i % 3 === 0 ? '♫' : '♪', '#ffd166'));
      sp.scale.setScalar(0.6);
      sp.visible = false;
      this.scene.add(sp); this.beamNotes.push(sp);
    }
  }

  _updateShots(t, beat, camera) {
    for (let i = 0; i < this.shotEvents.length; i++) {
      const ev = this.shotEvents[i];
      const age = t - ev.t;
      const beam = this.beams[i];
      const note = this.beamNotes[i];
      if (age >= 0 && age < 0.28) {
        orientBeam(beam, ev.from, ev.to, 1.1);
        beam.material.opacity = Math.exp(-age * 12) * 0.95;
        beam.material.color.setHex(ev.kind === 'boss' ? 0x37f5ff : 0xffd166);
        const k = clamp(age / 0.22, 0, 1);
        note.visible = true;
        note.position.lerpVectors(ev.from, ev.to, easeOutCubic(k));
        note.material.opacity = 1 - k * 0.7;
        note.scale.setScalar(0.55 + (1 - k) * 0.4);
      } else {
        beam.visible = false;
        note.visible = false;
      }
    }
  }

  /* ── bursts, rings, notes ─────────────────────────────── */
  _buildEffects() {
    const srnd = rng(3131);
    const burstEvents = [];
    const ringEvents = [];
    const noteBursts = [];

    const addDeath = (pos, color, big = false) => {
      burstEvents.push({
        t: 0, origin: pos, count: big ? 220 : 95, speed: big ? 9 : 6,
        dur: big ? 1.8 : 1.25, size: big ? 0.32 : 0.2,
        colors: ['#ffd166', '#37f5ff', '#ffffff', color], gravity: -1.5
      });
      ringEvents.push({ t: 0, origin: pos, max: big ? 16 : 9, dur: big ? 1.4 : 0.9, color: 0xffd166, opacity: 0.8 });
      for (let k = 0; k < (big ? 12 : 6); k++) {
        const a = srnd() * TAU, u = srnd() * 2 - 1;
        const s = Math.sqrt(1 - u * u);
        noteBursts.push({
          t: 0, origin: pos, dir: V(Math.cos(a) * s, u * 0.7 + 0.3, Math.sin(a) * s),
          speed: 2.5 + srnd() * 4, char: srnd() < 0.6 ? '♪' : '♫',
          color: srnd() < 0.6 ? '#ffd166' : '#37f5ff', scale: 0.45 + srnd() * 0.5
        });
      }
    };

    // enemy deaths
    for (const e of this.enemies) {
      if (e.death === Infinity) continue;
      const pos = this._enemyPosAt(e, e.death);
      const t = e.death * BEAT;
      const hex = '#' + e.def.color.toString(16).padStart(6, '0');
      burstEvents.push({ t, origin: pos, count: 90, speed: 6.2, dur: 1.3, size: 0.22, colors: ['#ffd166', '#37f5ff', '#ffffff', hex], gravity: -1.4 });
      ringEvents.push({ t, origin: pos, max: 10, dur: 0.95, color: 0xffd166, opacity: 0.55 });
      for (let k = 0; k < 6; k++) {
        const a = srnd() * TAU, u = srnd() * 2 - 1;
        const s = Math.sqrt(1 - u * u);
        noteBursts.push({
          t, origin: pos, dir: V(Math.cos(a) * s, u * 0.7 + 0.3, Math.sin(a) * s),
          speed: 2.5 + srnd() * 4, char: srnd() < 0.6 ? '♪' : '♫',
          color: srnd() < 0.6 ? '#ffd166' : '#37f5ff', scale: 0.45 + srnd() * 0.5
        });
      }
    }

    // boss hit sparks
    for (const b of PERFECT_BEATS) {
      if (b < 112 || b >= 158) continue;
      const pos = V((srnd() - 0.5) * 3, 8.4 + (srnd() - 0.5) * 3, -5 + (srnd() - 0.5) * 3);
      burstEvents.push({ t: b * BEAT, origin: pos, count: 32, speed: 4.5, dur: 0.8, size: 0.18, colors: ['#ffd166', '#37f5ff', '#ffffff'], gravity: 0 });
      ringEvents.push({ t: b * BEAT, origin: pos, max: 5.5, dur: 0.6, color: 0xffd166, opacity: 0.5 });
    }

    // shockwaves in the phase section
    for (const b of [88, 92]) {
      const pos = this._shipPosAt(b * BEAT, 'dodge');
      burstEvents.push({ t: b * BEAT, origin: pos, count: 160, speed: 11, dur: 1.3, size: 0.28, colors: ['#37f5ff', '#9dfbff', '#ffffff', '#ffd166'], gravity: 0 });
      ringEvents.push({ t: b * BEAT, origin: pos, max: 22, dur: 1.0, color: 0x37f5ff, opacity: 0.7 });
      for (let k = 0; k < 10; k++) {
        const a = srnd() * TAU;
        noteBursts.push({ t: b * BEAT, origin: pos, dir: V(Math.cos(a), 0.25, Math.sin(a)), speed: 5 + srnd() * 5, char: '♪', color: '#37f5ff', scale: 0.5 + srnd() * 0.5 });
      }
    }

    // overdrive activation
    {
      const b = 144, pos = this._shipPosAt(b * BEAT, 'overdrive');
      burstEvents.push({ t: b * BEAT, origin: pos, count: 140, speed: 12, dur: 1.5, size: 0.25, colors: ['#ffd166', '#37f5ff', '#ffffff'], gravity: 0 });
      ringEvents.push({ t: b * BEAT, origin: pos, max: 20, dur: 1.2, color: 0xffd166, opacity: 1 });
    }

    // boss death
    {
      const b = 158, pos = V(0, 8.4, -5);
      burstEvents.push({ t: b * BEAT, origin: pos, count: 260, speed: 16, dur: 2.6, size: 0.3, colors: ['#ffd166', '#ff2e88', '#37f5ff', '#ffffff'], gravity: -0.8 });
      ringEvents.push({ t: b * BEAT, origin: pos, max: 34, dur: 1.8, color: 0xffd166, opacity: 0.75 });
      ringEvents.push({ t: b * BEAT + 0.1, origin: pos, max: 26, dur: 1.5, color: 0xff2e88, opacity: 0.9 });
      for (let k = 0; k < 24; k++) {
        const a = srnd() * TAU, u = srnd() * 2 - 1;
        const s = Math.sqrt(1 - u * u);
        noteBursts.push({ t: b * BEAT, origin: pos, dir: V(Math.cos(a) * s, u, Math.sin(a) * s), speed: 6 + srnd() * 12, char: srnd() < 0.5 ? '♪' : '♫', color: srnd() < 0.6 ? '#ffd166' : '#37f5ff', scale: 0.7 + srnd() * 0.8 });
      }
    }

    this.bursts = new BurstSystem(this.scene, burstEvents);
    this.rings = new RingWaveSystem(this.scene, ringEvents);

    this.noteSprites = noteBursts.map(nb => {
      const sp = new THREE.Sprite(getNoteMat(nb.char, nb.color).clone());
      sp.material.opacity = 0;
      sp.scale.setScalar(nb.scale);
      sp.visible = false;
      this.scene.add(sp);
      return { sp, nb };
    });
  }

  _updateEffects(t) {
    this.bursts.update(t);
    this.rings.update(t);
    for (const { sp, nb } of this.noteSprites) {
      const age = t - nb.t;
      if (age < 0 || age > 1.3) { sp.visible = false; continue; }
      sp.visible = true;
      sp.position.copy(nb.origin).addScaledVector(nb.dir, nb.speed * age);
      sp.position.y += 0.6 * age * age;
      sp.material.opacity = Math.pow(1 - age / 1.3, 1.2);
      sp.material.rotation = age * 2;
    }
  }

  /* ── per-frame ────────────────────────────────────────── */
  update(t, beat, shot) {
    this.t = t; this.beat = beat;
    this.mode = (shot && shot.mode) || 'arena';
    const camera = this.camera;

    // ship path
    const pos = this._shipPosAt(t, this.mode);
    const ahead = this._shipPosAt(t + 0.03, this.mode);
    const dir = ahead.clone().sub(pos);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    this.ship.position.copy(pos);
    this.ship.lookAt(pos.clone().add(dir));
    this.ship.rotation.z += Math.sin(t * 3.1) * 0.12;
    this.shipPos.copy(pos);
    const trailPts = [];
    for (let i = 0; i < 46; i++) trailPts.push(this._shipPosAt(t - i * 0.018, this.mode));
    this.trail.update(trailPts);

    // ship glow / overdrive looks
    const od = this.mode === 'overdrive' || (this.mode === 'boss' && beat >= 144);
    this.ship.userData.body.material.emissive.setHex(od ? 0x9a6410 : 0x0a5566);
    this.ship.userData.edges.material.color.setHex(od ? 0xfff2c4 : 0xd8ffff);
    this.ship.userData.halo.material.color.setHex(od ? 0xffd166 : 0x37f5ff);
    this.ship.userData.engine.material.color.setHex(od ? 0xffd166 : 0x37f5ff);
    for (const ex of this.ship.userData.exhausts) ex.material.color.setHex(od ? 0xffd166 : 0x37f5ff);
    this.trail.mat.uniforms.uColor.value.setHex(od ? 0xffd166 : 0x37f5ff);
    this.trail.mat.uniforms.uOpacity.value = 0.8 + pulse(beat) * 0.2;
    this.ship.scale.setScalar(od ? 0.94 : 0.82);

    this._updateEnemies(t, beat);
    this._updateBoss(t, beat);
    this.floorMat.uniforms.uTime.value = t;
    this.floorMat.uniforms.uBeat.value = beat;
    this.floorMat.uniforms.uMode.value = od ? 1 : 0;
    this.floorMat.uniforms.uColorA.value.setHex(od ? 0xffd166 : this.mode === 'dodge' ? 0x37f5ff : 0x37f5ff);
    this.floorMat.uniforms.uColorB.value.setHex(od ? 0xff2e88 : this.mode === 'boss' ? 0xff2e88 : 0x8b5cf6);
    this.floorMat.uniforms.uPulse.value = 0.85 + pulse(beat) * 0.5;

    // bullets & beams update in lateUpdate, once the camera is final

    // equalizer ring
    const m = this._m;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < this.eqCount; i++) {
      const a = i / this.eqCount * TAU;
      const h = 0.5 + 2.0 * Math.abs(Math.sin(beat * 0.9 + i * 0.55)) * (0.35 + 0.65 * pulse(beat));
      m.compose(V(Math.cos(a) * 29.5, 0.12, Math.sin(a) * 29.5), q.setFromEuler(new THREE.Euler(0, -a, 0)), s.set(1, h, 1));
      this.eq.setMatrixAt(i, m);
    }
    this.eq.instanceMatrix.needsUpdate = true;

    // gate, staff, notes
    this.gate.rotation.z = Math.sin(t * 0.07) * 0.08;
    for (const arm of this.riftArms) arm.rotation.z = t * 0.08;
    this.monoliths.rotation.y = t * 0.006;
    for (const n of this.staffNotes) {
      const u = n.userData;
      const x = ((t * u.speed * 8 + u.seed * 10) % 56) - 28;
      n.position.set(x, u.y + Math.sin(t * 0.6 + u.seed) * 0.35, Math.sin(x * 0.1) * 1.2);
      n.material.opacity = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 1.4 + u.seed));
    }
    this.stars.rotation.y = t * 0.004;
    this.dust.rotation.y = -t * 0.01;
    this.bokehGroup.rotation.y = t * 0.006;
    for (const b of this.bokehGroup.children) {
      b.position.y = b.userData.y0 + Math.sin(t * 0.25 + b.userData.seed) * 0.45;
    }
    for (let i = 0; i < this.shafts.length; i++) {
      this.shafts[i].material.opacity = 0.02 + pulse(beat) * 0.018;
      this.shafts[i].rotation.y = t * (i ? -0.02 : 0.015);
    }

    this.rim.material.opacity = 0.22 + pulse(beat) * 0.22;

    // crosshair needs the camera orientation: set after camera in setCamera
    this._updateEffects(t);
    this._crossUpdate = true;
  }

  lateUpdate(t, beat, shot) {
    this._updateBullets(t, beat);
    this._updateShots(t, beat, this.camera);
  }

  setCamera(cam, t, beat, shot) {
    const camera = this.camera;
    this.forceMacroTarget = cam === 'macroRing' || cam === 'perfectMacro';
    // position the crosshair before the camera switch so macro shots frame the right target
    this._updateCrosshair(beat, camera);
    const local = beat - (shot ? shot.a : 40);
    const len = shot ? shot.b - shot.a : 8;
    const k = clamp(local / len, 0, 1);
    const ship = this.ship.position;
    const boss = this.boss.position;
    const cross = this.cross.position;
    const od = this.mode === 'overdrive';
    const swap = (p) => p;

    switch (cam) {
      case 'diveIn': {
        const e = easeInOut(k);
        aimCamera(camera, V(lerp(0, 2, e), lerp(21, 7.5, e), lerp(36, 19, e)), V(0, 1.8, 0), lerp(56, 50, e));
        break;
      }
      case 'topDown': {
        const a = t * 0.08;
        aimCamera(camera, V(Math.sin(a) * 9, 25, Math.cos(a) * 15), V(0, 0.5, -2), 48);
        break;
      }
      case 'tracking': {
        aimCamera(camera, V(ship.x + 10, ship.y + 4.2, ship.z + 10), V(ship.x, ship.y + 0.4, ship.z), 52);
        break;
      }
      case 'macroRing': {
        const p = this.cross.visible ? cross : ship;
        const away = p.clone().sub(ship);
        if (away.lengthSq() < 0.01) away.set(0, 0, 1);
        away.normalize();
        const camP = p.clone().addScaledVector(away, 5.0).add(V(0, 1.5, 0));
        if (camP.y < 1.4) camP.y = 1.4;
        aimCamera(camera, camP, p.clone(), 33);
        break;
      }
      case 'perfectMacro': {
        const p = this.cross.visible ? cross : ship;
        const away = p.clone().sub(ship);
        if (away.lengthSq() < 0.01) away.set(0, 0, 1);
        away.normalize();
        const camP = p.clone().addScaledVector(away, 7.2).add(V(0, 1.4, 0));
        if (camP.y < 1.6) camP.y = 1.6;
        aimCamera(camera, camP, p.clone(), 32);
        break;
      }
      case 'sideNotes': {
        aimCamera(camera, V(24, 4.4 + Math.sin(t * 0.2) * 1.2, ship.z + 2), V(ship.x, ship.y + 1.2, ship.z), 48);
        break;
      }
      case 'wideCombo': {
        aimCamera(camera, V(0, 21, 26 - k * 4), V(0, 1.5, -4), 50);
        break;
      }
      case 'slowSwirl': {
        const a = t * 0.42;
        aimCamera(camera, V(ship.x + Math.cos(a) * 12, ship.y + 4.5, ship.z + Math.sin(a) * 12), ship.clone(), 50);
        break;
      }
      case 'dashClose': {
        aimCamera(camera, V(ship.x - 5.5, ship.y + 2.6, ship.z + 7), ship.clone().add(V(0, 0.2, 0)), 52);
        break;
      }
      case 'shockwave': {
        aimCamera(camera, V(ship.x + 3, ship.y + 1.5, ship.z + 9), ship.clone(), 58);
        break;
      }
      case 'pullBack': {
        const e = easeInOut(k);
        aimCamera(camera, V(lerp(ship.x + 4, 0, e), lerp(ship.y + 3, 16, e), lerp(ship.z + 8, 26, e)), V(0, 1, -5), lerp(56, 48, e));
        break;
      }
      case 'bossReveal': {
        const e = easeInOut(k);
        aimCamera(camera, V(lerp(0, 3.5, e), lerp(2.5, 5.0, e), lerp(31, 24, e)), V(0, 8.4, -5), lerp(54, 44, e));
        break;
      }
      case 'bossOrbitLow': {
        const a = -0.7 + t * 0.18;
        aimCamera(camera, V(Math.cos(a) * 21, 4.8, -5 + Math.sin(a) * 21), V(0, 8.2, -5), 50);
        break;
      }
      case 'batonSweep': {
        aimCamera(camera, V(15, 9, 7), V(0, 8.4, -5), 42);
        break;
      }
      case 'bulletRain': {
        aimCamera(camera, V(0, 20, 24), V(0, 6.5, -5), 52);
        break;
      }
      case 'metronomeClose': {
        aimCamera(camera, V(9.5, 11.5, 9.5), V(0, 9, -5), 38);
        break;
      }
      case 'dodgeMacro': {
        // low chase angle: ship in the foreground, boss and bullet curtain above
        aimCamera(camera, V(ship.x + 4.2, ship.y + 8.8, ship.z + 14.0), V(ship.x * 0.4, 5.4, ship.z - 3), 56);
        break;
      }
      case 'wideChaos': {
        aimCamera(camera, V(0, 15, 30), V(0, 7, -5), 54);
        break;
      }
      case 'buildUp': {
        const e = easeInOut(k);
        aimCamera(camera, V(lerp(9, 2, e), lerp(10, 8.6, e), lerp(24, 13, e)), V(0, 8.5, -5), lerp(50, 36, e));
        break;
      }
      case 'odActivate': {
        const e = easeOutCubic(k);
        // keep the ship low in frame so the golden bullet curtain fills the sky
        aimCamera(camera, V(ship.x + lerp(10, 5.2, e), ship.y + lerp(6.4, 3.8, e), ship.z + lerp(13, 9, e)), V(ship.x * 0.5, 3.4, ship.z - 2), lerp(50, 44, e));
        break;
      }
      case 'odComet': {
        aimCamera(camera, V(ship.x + 8.5, ship.y + 3.4, ship.z + 9.5), ship.clone().add(V(0, 0.2, -2)), 55);
        break;
      }
      case 'odShatter': {
        aimCamera(camera, V(7.5, 11.5, 8), boss.clone().add(V(0, 0.5, 0)), 34);
        break;
      }
      case 'odExplosion': {
        const e = easeInOut(k);
        aimCamera(camera, V(lerp(7, 0, e), lerp(11, 18, e), lerp(12, 32, e)), V(0, 8.4, -5), lerp(40, 58, e));
        break;
      }
      default: {
        aimCamera(camera, V(0, 16, 26), V(0, 3, 0), 50);
      }
    }
    // crosshair faces the camera
    this._updateCrosshair(beat, camera);
    if (this.cross.visible) {
      const p = this.cross.position.clone().project(camera);
      this.crossScreen = {
        x: (p.x * 0.5 + 0.5) * 1920,
        y: (1 - (p.y * 0.5 + 0.5)) * 1080,
        visible: p.z < 1 && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15
      };
    } else {
      this.crossScreen = null;
    }
    const hideShip = cam === 'macroRing' || cam === 'perfectMacro';
    this.ship.visible = !hideShip;
    this.trail.mesh.visible = !hideShip;
    return camera;
  }
}
