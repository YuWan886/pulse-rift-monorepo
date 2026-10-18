/* ═══════════════════════════════════════════════════════════════
   PULSE//RIFT — procedural film renderer
   renderAt(t) builds the complete frame from the timeline.
   ═══════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { BEAT, DURATION, PERFECT_BEATS, SHOTS, CUTS, shotAtBeat, EVENTS, sectionAt } from './timeline.js';
import { clamp, smoothstep, easeOutExpo, shakeNoise } from './fx.js';
import { VoidScene, LogoScene } from './scenes.js';
import { CombatScene } from './combat.js';
import { GalleryScene } from './gallery.js';
import { OutroScene } from './outro.js';
import { Overlay } from './overlay.js';

const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1920', 10);
const H = parseInt(params.get('h') || '1080', 10);
const SHOT_INDEX = params.has('shot') ? parseInt(params.get('shot'), 10) : null;

/* ── font preload ───────────────────────────────────────── */
async function loadFonts() {
  try {
    await Promise.all([
      document.fonts.load('400 16px Orbitron'),
      document.fonts.load('700 16px Orbitron'),
      document.fonts.load('900 250px Orbitron'),
      document.fonts.load('400 16px "Chakra Petch"'),
      document.fonts.load('600 16px "Chakra Petch"'),
      document.fonts.load('700 16px "Chakra Petch"')
    ]);
    await document.fonts.ready;
  } catch (e) { console.warn('font load', e); }
}
await loadFonts();

/* ── renderer ───────────────────────────────────────────── */
const renderer = new THREE.WebGLRenderer({
  antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance',
  alpha: false, stencil: false
});
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x020107, 1);
document.body.appendChild(renderer.domElement);

/* ── scenes ─────────────────────────────────────────────── */
const scenes = {
  void: new VoidScene(),
  logo: new LogoScene(),
  combat: new CombatScene(),
  gallery: new GalleryScene(),
  outro: new OutroScene()
};
for (const k in scenes) {
  const cam = scenes[k].camera;
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
}

/* ── overlay ────────────────────────────────────────────── */
const overlay = new Overlay(W, H);

/* ── post pipeline ──────────────────────────────────────── */
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
const renderPass = new RenderPass(scenes.void.scene, scenes.void.camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.72, 0.55, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    tUI: { value: overlay.texture },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(W, H) },
    uFlash: { value: 0 },
    uCA: { value: 0.0012 },
    uGlitch: { value: 0 },
    uGlitchSeed: { value: 0 },
    uVignette: { value: 0.9 },
    uLetterbox: { value: 0.06 },
    uFade: { value: 0 },
    uGrain: { value: 0.022 },
    uScanlines: { value: 0.35 },
    uOverdrive: { value: 0 },
    uZoom: { value: 0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform sampler2D tUI;
    uniform float uTime, uFlash, uCA, uGlitch, uGlitchSeed, uVignette, uLetterbox, uFade, uGrain, uScanlines, uOverdrive, uZoom;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

    void main(){
      vec2 uv = vUv;
      vec2 block = floor(uv * vec2(36.0, 20.0));
      float gr = hash(block + uGlitchSeed);
      if (uGlitch > 0.001 && gr < uGlitch * 0.5) {
        uv.x += (hash(block + 7.31) - 0.5) * 0.055 * uGlitch;
        uv.y += (hash(block + 2.17) - 0.5) * 0.012 * uGlitch;
      }
      vec2 dir = normalize(uv - 0.5 + vec2(1e-5));
      float ca = uCA + length(uv - 0.5) * 0.0018;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;

      if (uZoom > 0.0005) {
        vec2 dz = uv - 0.5;
        vec3 s1 = texture2D(tDiffuse, 0.5 + dz * (1.0 + uZoom)).rgb;
        vec3 s2 = texture2D(tDiffuse, 0.5 + dz * (1.0 - uZoom * 0.7)).rgb;
        col = col * 0.52 + s1 * 0.3 + s2 * 0.18;
      }

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, 1.06);
      col += vec3(0.012, 0.005, 0.022) * (1.0 - lum);
      col = mix(col, col * vec3(1.025, 1.004, 0.975), uOverdrive);

      vec4 ui = texture2D(tUI, vUv);
      col = mix(col, ui.rgb, ui.a);

      float scan = sin(vUv.y * uResolution.y * 1.35 + uTime * 2.4) * 0.5 + 0.5;
      col *= 1.0 - scan * uScanlines * 0.055;

      float g = hash(vUv * uResolution.xy * 0.5 + fract(uTime) * vec2(37.1, 17.7));
      col += (g - 0.5) * uGrain;

      float v = smoothstep(1.12, 0.28, length(vUv - 0.5));
      col *= mix(1.0, v, uVignette);

      col = mix(col, vec3(1.0, 0.93, 0.78), uFlash);

      float lb = uLetterbox;
      col *= 1.0 - step(vUv.y, lb) - step(1.0 - lb, vUv.y);

      col *= (1.0 - uFade);
      gl_FragColor = vec4(col, 1.0);
    }
  `
};
const finalPass = new ShaderPass(FinalShader);
finalPass.renderToScreen = true;
composer.addPass(finalPass);

/* ── event helpers ──────────────────────────────────────── */
function flashAt(beat) {
  let f = 0;
  const hits = [[32, 0.5], [36, 0.15], [80, 0.15], [96, 0.18], [112, 0.3], [144, 0.35], [158, 0.08], [159, 0.28], [160, 0.32], [168, 0.18]];
  for (const [b, s] of hits) {
    const age = (beat - b) * BEAT;
    if (age >= 0 && age < 0.55) f = Math.max(f, s * Math.exp(-age * 7));
  }
  return f;
}

function zoomAt(beat, shot) {
  let z = 0;
  for (const c of CUTS) {
    const age = (beat - c.beat) * BEAT;
    if (age < 0 || age >= 0.3) continue;
    let s = c.kind === 'flash' ? 0.05 : c.kind === 'glitch' ? 0.038 : 0.02;
    if (shot && shot.scene === 'combat') s *= 1.25;
    z = Math.max(z, s * Math.exp(-age * 16));
  }
  return z;
}

function glitchAt(beat) {
  let g = 0;
  for (const c of CUTS) {
    const age = (beat - c.beat) * BEAT;
    if (age >= 0 && age < 0.22 && c.kind === 'glitch') {
      g = Math.max(g, Math.exp(-age * 15));
    }
  }
  return g;
}

function shakeAmount(beat, shot) {
  const bp = Math.exp(-(beat % 1) * 7);
  const impacts = [[32, 0.7], [80, 0.35], [96, 0.4], [112, 0.65], [144, 0.75], [159, 1.0]];
  let amp = 0.02 + bp * 0.025;
  for (const [b, s] of impacts) {
    const age = (beat - b) * BEAT;
    if (age >= 0 && age < 0.7) amp += s * 0.12 * Math.exp(-age * 6);
  }
  if (shot && shot.scene === 'combat') amp *= 1.5;
  return amp;
}

function letterboxFor(shot) {
  const s = shot.scene;
  if (shot.cap && shot.cap.endcard) return 0.085;
  if (s === 'void') return 0.095;
  if (s === 'logo') return shot.a < 32 ? 0.075 : 0.0;
  if (s === 'combat') return shot.mode === 'overdrive' ? 0 : 0.035;
  if (s === 'gallery') return 0.03;
  if (s === 'outro') return shot.a >= 176 ? 0.085 : 0.06;
  return 0.05;
}

function fadeFor(t, beat, shot) {
  let fade = 0;
  if (t < 0.35) fade = Math.max(fade, 1 - t / 0.35);
  if (beat > 189.5) fade = Math.max(fade, smoothstep(189.5, 192, beat));
  return clamp(fade, 0, 1);
}

/* ── main frame ─────────────────────────────────────────── */
let lastShot = null;
function renderAt(t) {
  t = clamp(t, 0, DURATION - 1e-4);
  const beat = t / BEAT;
  let shot = shotAtBeat(beat);
  if (SHOT_INDEX !== null) shot = SHOTS[clamp(SHOT_INDEX, 0, SHOTS.length - 1)];
  window.__shot = shot;
  const sceneObj = scenes[shot.scene] || scenes.void;
  sceneObj.update(t, beat, shot);
  const camera = sceneObj.setCamera(shot.cam, t, beat, shot);
  camera.aspect = W / H;

  const shake = shakeAmount(beat, shot);
  if (shake > 0.0001) {
    const n = shakeNoise(t, shot.a);
    camera.position.add(new THREE.Vector3(n.x * shake, n.y * shake, n.z * shake * 0.5));
    camera.rotation.z += Math.sin(t * 71.3) * shake * 0.01;
  }
  camera.updateProjectionMatrix();

  if (sceneObj.lateUpdate) sceneObj.lateUpdate(t, beat, shot);
  overlay.state.shot = shot;
  overlay.state.perfectScreen = sceneObj.crossScreen || null;
  overlay.draw(t, beat, shot);
  renderer.initTexture(overlay.texture);

  renderPass.scene = sceneObj.scene;
  renderPass.camera = camera;

  const u = finalPass.uniforms;
  u.uTime.value = t;
  u.uFlash.value = flashAt(beat);
  u.uCA.value = 0.0009 + flashAt(beat) * 0.006 + glitchAt(beat) * 0.004;
  u.uGlitch.value = glitchAt(beat);
  u.uGlitchSeed.value = Math.floor(beat * 6.7) * 1.37;
  u.uLetterbox.value = letterboxFor(shot);
  u.uFade.value = fadeFor(t, beat, shot);
  u.uOverdrive.value = shot.mode === 'overdrive' ? smoothstep(144, 146, beat) : 0;
  u.uZoom.value = zoomAt(beat, shot);
  u.uVignette.value = 0.85;
  u.uGrain.value = 0.02;
  u.uScanlines.value = 0.3;

  const bp = Math.exp(-(beat % 1) * 6);
  let bstr = 0.55;
  if (shot.scene === 'logo') bstr = 0.56;
  if (shot.scene === 'combat') bstr = 0.42;
  if (shot.scene === 'gallery') bstr = 0.55;
  if (shot.scene === 'outro') bstr = 0.62;
  if (shot.mode === 'overdrive') bstr = 0.42;
  bloom.strength = bstr + bp * 0.1;
  bloom.radius = 0.5;
  bloom.threshold = 0.68;

  composer.render();
  lastShot = shot;
}

window.renderAt = renderAt;
window.PR_FILM = { W, H, scenes, renderer, composer, finalPass, overlay };

/* first frame */
renderAt(0);
window.ready = true;
