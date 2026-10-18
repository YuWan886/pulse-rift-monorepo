/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — aftermath, reformation, end card
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { BEAT } from './timeline.js';
import {
  TAU, clamp, lerp, smoothstep, easeInOut, easeOutCubic,
  rng, makeStarfield, makeNoteSprites, makeGlowSprite,
  BurstSystem, RingWaveSystem, glowTexture
} from './fx.js';
import { LogoParticles, makeGate } from './scenes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const aimCamera = (camera, p, target, fov = 50) => {
  camera.position.copy(p); camera.fov = fov; camera.lookAt(target); camera.updateProjectionMatrix();
};
const pulse = (beat) => Math.exp(-(beat % 1) * 5.5);

export class OutroScene {
  constructor() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020107);
    scene.fog = new THREE.FogExp2(0x04020a, 0.008);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 500);

    this.stars = makeStarfield({ count: 3200, radius: 160, depth: 160, size: 0.5, opacity: 0.75, seed: 1601 });
    scene.add(this.stars);
    for (const n of [[0xb26bff, 55, -20, 10, -35, 0.07], [0xff2e88, 60, 24, -6, -40, 0.05], [0x37f5ff, 40, 0, 14, -30, 0.04]]) {
      const sp = makeGlowSprite(n[0], n[1], n[5]); sp.position.set(n[2], n[3], n[4]); scene.add(sp);
    }

    // debris from the conductor
    const rnd = rng(5150);
    const burstEvents = [{
      t: 159 * BEAT, origin: V(0, 8.4, -5), count: 420, speed: 5.5, dur: 8,
      size: 0.22, colors: ['#ffd166', '#ff2e88', '#37f5ff', '#ffffff'], gravity: -0.12, drag: 0.12
    }];
    const ringEvents = [
      { t: 159 * BEAT, origin: V(0, 8.4, -5), max: 30, dur: 2.2, color: 0xffd166, opacity: 0.6 },
      { t: 164 * BEAT, origin: V(0, 1.8, 0), max: 12, dur: 1.4, color: 0x37f5ff, opacity: 0.3 },
      { t: 168 * BEAT, origin: V(0, 1.8, 0), max: 16, dur: 1.6, color: 0xffd166, opacity: 0.35 },
      { t: 176 * BEAT, origin: V(0, 1.2, -6), max: 22, dur: 2, color: 0x37f5ff, opacity: 0.28 }
    ];
    this.bursts = new BurstSystem(scene, burstEvents);
    this.rings = new RingWaveSystem(scene, ringEvents);

    // broken boss rings tumbling in the void
    this.debris = new THREE.Group();
    const cols = [0xffd166, 0xff2e88, 0x37f5ff];
    for (let i = 0; i < 5; i++) {
      const r = 2 + rnd() * 4.5;
      const arc = Math.PI * (0.25 + rnd() * 1.1);
      const geo = new THREE.TorusGeometry(r, 0.045, 6, 80, arc);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: cols[i % 3], transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending
      }));
      m.position.set((rnd() - 0.5) * 22, 1 + rnd() * 10, -4 - rnd() * 18);
      m.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      m.userData = { spin: (rnd() - 0.5) * 0.4, drift: (rnd() - 0.5) * 0.2 };
      this.debris.add(m);
    }
    scene.add(this.debris);

    // drifting embers / dust
    this.embers = makeStarfield({ count: 500, radius: 26, depth: 30, size: 0.4, opacity: 0.35, colors: ['#ffd166', '#ff2e88', '#37f5ff'], seed: 1611 });
    scene.add(this.embers);

    // gate
    this.gate = makeGate({ radii: [10, 12, 14.5], z: -13, opacity: 0.45 });
    this.gate.position.y = 2.2;
    scene.add(this.gate);

    // staff lines, very faint
    this.staff = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let x = -30; x <= 30; x += 2) {
        pts.push(V(x, -2 + i * 0.6 + Math.sin(x * 0.12 + i) * 0.4, -10));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 160, 0.009, 4, false),
        new THREE.MeshBasicMaterial({ color: i === 2 ? 0xffd166 : 0x37f5ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.staff.add(line);
    }
    scene.add(this.staff);
    this.notes = makeNoteSprites(24, { colors: ['#ffd166', '#37f5ff', '#ff2e88'], scale: 0.5, seed: 1621 });
    scene.add(this.notes);

    // logo reformation
    this.logo = new LogoParticles({ width: 23, assembleStart: 160, assembleEnd: 167.4, slamBeat: 168 });
    scene.add(this.logo.group);

    // final heartbeat core behind the end card
    this.core = new THREE.Group();
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    this.core.add(coreMesh);
    const halo = makeGlowSprite(0xffd166, 3.2, 0.4);
    this.core.add(halo);
    this.core.position.set(0, 1.2, -6);
    scene.add(this.core);
    this.coreHalo = halo;

    // end card framing beams
    this.frameBeams = [];
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 13, 0.05),
        new THREE.MeshBasicMaterial({ color: i ? 0xff2e88 : 0x37f5ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending })
      );
      b.position.set(i ? 9.5 : -9.5, 2.2, -4);
      scene.add(b); this.frameBeams.push(b);
    }
  }

  update(t, beat) {
    this.bursts.update(t);
    this.rings.update(t);
    this.stars.rotation.y = t * 0.003;
    this.embers.rotation.y = -t * 0.006;
    for (const ring of this.gate.userData.rings) ring.rotation.z += ring.userData.spin * 0.5;
    this.gate.rotation.z = Math.sin(t * 0.06) * 0.05;
    this.debris.rotation.y = Math.sin(t * 0.02) * 0.1;
    for (const d of this.debris.children) {
      d.rotation.x += d.userData.spin * 0.01;
      d.rotation.y += d.userData.spin * 0.013;
      d.position.y += Math.sin(t * 0.2 + d.position.x) * 0.002;
    }
    this.staff.position.y = Math.sin(t * 0.15) * 0.1;
    for (const n of this.notes.userData.notes) {
      const u = n.userData;
      const a = u.angle + t * u.speed * 0.4;
      n.position.set(Math.cos(a) * u.radius * 1.7, u.yBase * 0.4 + Math.sin(t * 0.4 + u.seed) * 0.8, Math.sin(a) * u.radius * 0.9 - 8);
      n.material.opacity = 0.12 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.1 + u.seed));
    }

    // logo appears after the blast, fades for the end card
    const logoOpacity = 1 - smoothstep(174.6, 176, beat);
    this.logo.update(beat, { assembleStart: 160, assembleEnd: 167.4, slamBeat: 168, opacity: logoOpacity, crisp: smoothstep(165.5, 168, beat) });
    this.logo.group.visible = logoOpacity > 0.005;
    this.logo.group.scale.setScalar(1 + smoothstep(168, 176, beat) * 0.03);

    const bp = pulse(beat);
    this.coreHalo.material.opacity = 0.25 + bp * 0.4;
    this.coreHalo.scale.setScalar(2.6 + bp * 1.2);
    this.core.scale.setScalar(1 + bp * 0.25);
    for (const b of this.frameBeams) b.material.opacity = 0.1 + bp * 0.12;
  }

  setCamera(cam, t, beat, shot) {
    const camera = this.camera;
    const local = beat - (shot ? shot.a : 160);
    const len = shot ? shot.b - shot.a : 4;
    const k = clamp(local / len, 0, 1);
    if (cam === 'aftermath') {
      const a = 0.25 + t * 0.035;
      aimCamera(camera, V(Math.cos(a) * 15, 4.2 + Math.sin(t * 0.15) * 1.2, 8 + Math.sin(a) * 9), V(0, 4, -6), 50);
    } else if (cam === 'logoReform') {
      const e = easeInOut(k);
      aimCamera(camera, V(lerp(0, 0.5, e), lerp(2.2, 1.6, e), lerp(15, 26, e)), V(0, 0.4, 0), lerp(46, 42, e));
    } else if (cam === 'logoHero') {
      const a = 0.2 + Math.sin(t * 0.1) * 0.3;
      aimCamera(camera, V(Math.sin(a) * 36, 1.9 + Math.sin(t * 0.2) * 0.6, Math.cos(a) * 36), V(0, 0.4, 0), 42);
    } else if (cam === 'pullAway') {
      const e = easeInOut(k);
      aimCamera(camera, V(0, lerp(2, 4, e), lerp(34, 50, e)), V(0, 0.6, 0), lerp(42, 38, e));
    } else if (cam === 'endCard') {
      const e = smoothstep(0, 1, k);
      aimCamera(camera, V(0, 2.2 + Math.sin(t * 0.12) * 0.15, lerp(34, 30, e)), V(0, 1.4, -2), 44);
    } else if (cam === 'endCardClose') {
      const e = smoothstep(0, 1, k);
      aimCamera(camera, V(0, 1.9, lerp(30, 25, e)), V(0, 1.4, -2), 42);
    } else {
      const e = smoothstep(0, 1, k);
      aimCamera(camera, V(0, 2.4, lerp(30, 40, e)), V(0, 1.3, -4), 44);
    }
    return camera;
  }
}
