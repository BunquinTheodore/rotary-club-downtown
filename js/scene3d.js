// Interactive three.js background: procedural gold Rotary wheel plus a GPU particle field that reacts to a pointer trail.
// Hardened for mid range phones: frame and idle caps, FPS teardown, adaptive resolution, context loss handling.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWheelGeometry, radialTexture } from './fx/wheel3d.js';
import { buildField } from './fx/field3d.js';
import { PointerTrail } from './fx/trail3d.js';
import { createFrameGovernor } from './fx/harness3d.js';
import { isInAppBrowser, yieldToMain } from './fx/capabilities.js';

const GOLD = 0xf7a81b;
const SKY = 0x00a2e0;
const MOBILE_QUERY = '(max-width: 768px)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const CAMERA_Z = 6;
const FOV = 45;
const DPR_DESKTOP = 1.5;
const DPR_MOBILE = 1.25;
const PARTICLES_DESKTOP = 1200;
const PARTICLES_MOBILE = 500;
const SECTION_COUNT = 6;
const TOOTH = (Math.PI * 2) / 24;
const MAX_DT = 0.1;
const RESIZE_DEBOUNCE_MS = 150;
const SMALL_HEIGHT_PX = 160; // mobile URL bar show and hide
const POINTER_IDLE_MS = 8000;
const KICK_ACTIVE_MS = 3000;
const SECTION_WIPE_MS = 1100; // matches the deck transition; the scene renders at a lower cap meanwhile
const INTRO_S = 2.4;
const INTRO_SAFETY_MS = 20000;
const EDGE_INTRO = 0.55;
const EDGE_REST_DESKTOP = 0.2;
const EDGE_REST_MOBILE = 0;
const RESTORE_TIMEOUT_MS = 3000;
const MAX_CONTEXT_LOSSES = 2;
const LIGHT_HOME = new THREE.Vector3(-2, 2, 3);

// x, y are fractions of the visible half width / half height. s scale, o opacity, g glow, spin rad/s, calm particle energy.
const LAYOUTS = {
  desktop: [
    { x: 0.5, y: 0.1, s: 1.25, o: 1, g: 1, spin: 0.16, calm: 1 },
    { x: 0.86, y: 0.66, s: 0.42, o: 0.95, g: 0.7, spin: 0.22, calm: 0.9 },
    { x: -1.18, y: 0.0, s: 1.6, o: 0.55, g: 0.5, spin: 0.1, calm: 0.9 },
    { x: 0.97, y: -0.5, s: 0.4, o: 0.75, g: 0.6, spin: 0.18, calm: 0.85 },
    { x: 0.9, y: 0.9, s: 0.04, o: 0, g: 0, spin: 0.1, calm: 0.3 },
    { x: 0.0, y: 0.04, s: 1.75, o: 0.32, g: 1.4, spin: 0.14, calm: 1.1 },
  ],
  mobile: [
    { x: 0.55, y: 0.66, s: 0.6, o: 0.18, g: 0.35, spin: 0.12, calm: 0.8 },
    { x: 0.82, y: 0.9, s: 0.26, o: 0.4, g: 0.4, spin: 0.2, calm: 0.7 },
    { x: -1.05, y: 0.2, s: 1.1, o: 0.45, g: 0.5, spin: 0.1, calm: 0.7 },
    { x: 0.6, y: -0.58, s: 0.6, o: 0.5, g: 0.5, spin: 0.16, calm: 0.7 },
    { x: 0.9, y: 0.9, s: 0.04, o: 0, g: 0, spin: 0.1, calm: 0.25 },
    { x: 0.0, y: 0.16, s: 1.0, o: 0.25, g: 1.0, spin: 0.14, calm: 0.9 },
  ],
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const debugOn = () => { try { return new URLSearchParams(location.search).has('debug'); } catch (err) { return false; } };

const NOOP_CONTROLLER = Object.freeze({
  mode: 'off',
  setSection() {}, setPointer() {}, release() {}, impulse() { return false; }, intro() {},
  pause() {}, resume() {}, dispose() {},
});

function markNo3d(canvas) {
  canvas.hidden = true;
  canvas.classList.remove('is-ready');
  document.documentElement.classList.add('no-3d');
}

function createRenderer(canvas, mobile) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !mobile, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  return renderer;
}

function addLights(scene) {
  const key = new THREE.DirectionalLight(0xfff1d6, 2.4);
  key.position.set(3, 4, 5);
  // Warm rim: a cyan rim on gold metal reads as green.
  const rim = new THREE.DirectionalLight(0xffe2b0, 1.6);
  rim.position.set(-4, -1, -3);
  // Gold fill that follows the pointer, so highlights slide across the metal.
  const fill = new THREE.PointLight(0xffc766, 6, 12, 2);
  fill.position.copy(LIGHT_HOME);
  scene.add(key, rim, fill, new THREE.AmbientLight(0x1a2f5c, 0.6));
  return fill;
}

function buildWheel() {
  const placement = new THREE.Group(); // position, scale per section
  const tilt = new THREE.Group(); // pointer tilt
  const spin = new THREE.Group(); // z rotation
  const wheelGeo = buildWheelGeometry();
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0xffb933, metalness: 0.8, roughness: 0.28, envMapIntensity: 1.35, transparent: true,
  });
  spin.add(new THREE.Mesh(wheelGeo, wheelMat));
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(wheelGeo, 22),
    new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false }),
  );
  spin.add(edges);
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.22, 0.006, 8, 180),
    new THREE.MeshBasicMaterial({ color: SKY, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  tilt.add(spin, halo);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture([[0, 'rgba(255,200,90,0.9)'], [0.4, 'rgba(247,168,27,0.28)'], [1, 'rgba(247,168,27,0)']]),
    color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.position.z = -0.4;
  placement.add(glow, tilt);
  return { placement, tilt, spin, wheelMat, edges, edgeCount: edges.geometry.getAttribute('position').count, halo, glow, radius: wheelGeo.boundingSphere.radius };
}

/**
 * initScene(canvas, opts) -> { mode, setSection, setPointer, release, impulse, intro, pause, resume, dispose }
 * opts: mode ('off' | 'still' | 'animated'), mobile, reducedMotion, section, awaitIntro, onDegrade(reason), onWheelHit()
 */
export async function initScene(canvas, opts = {}) {
  if (opts.mode === 'off') { markNo3d(canvas); return NOOP_CONTROLLER; }
  const mobileMq = window.matchMedia(MOBILE_QUERY);
  let mobile = opts.mobile ?? mobileMq.matches;
  const still = opts.mode === 'still' || (opts.reducedMotion ?? window.matchMedia(REDUCED_QUERY).matches);

  const renderer = createRenderer(canvas, mobile);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  camera.position.set(0, 0, CAMERA_Z);
  await yieldToMain();

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const fill = addLights(scene);
  await yieldToMain();

  const W = buildWheel();
  scene.add(W.placement);
  const trail = new PointerTrail();
  const field = buildField(mobile ? PARTICLES_MOBILE : PARTICLES_DESKTOP, trail.uniform);
  scene.add(field.points);
  const gov = createFrameGovernor({ mobile, inApp: isInAppBrowser() });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const sphere = new THREE.Sphere();
  const lightTarget = new THREE.Vector3();
  await yieldToMain();

  const view = { halfW: 1, halfH: 1, w: 0, h: 0 };
  const cur = { x: 0, y: 0, s: still ? 1 : 0.001, o: still ? 1 : 0, g: still ? 1 : 0, calm: 1 };
  let section = clamp(Math.round(opts.section ?? 0), 0, SECTION_COUNT - 1);
  let spinVel = 0.6;
  let spinAngle = 0;
  let tooth = 0;
  let toothTarget = 0;
  let pulse = 0;
  let time = 0;
  let lastKickAt = performance.now();
  let lastSectionAt = 0;
  let introStarted = still || !opts.awaitIntro;
  let introDone = still;
  let introT = 0;
  let raf = 0;
  let userPaused = false;
  let disposed = false;
  let lost = false;
  let lossCount = 0;
  let dirty = true;
  let needsResize = false;
  let needsRescale = false;
  let ready = false;
  let resizeTimer = 0;
  let restoreTimer = 0;
  let introTimer = 0;

  const layout = () => (mobile ? LAYOUTS.mobile : LAYOUTS.desktop)[section];
  const setDebug = (state, extra = {}) => { if (debugOn()) window.__bg3d = { state, mode: still ? 'still' : 'animated', scale: gov.scale, fps: gov.fps, ...extra }; };

  function applyPixelRatio() {
    const pr = Math.min(window.devicePixelRatio || 1, mobile ? DPR_MOBILE : DPR_DESKTOP) * gov.scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(view.w, view.h, false);
    field.setViewport(pr, view.h, camera.aspect);
  }

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    if (opts.mobile === undefined) mobile = mobileMq.matches;
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    view.halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
    view.halfW = view.halfH * camera.aspect;
    applyPixelRatio();
    dirty = true;
  }

  // Debounced, and height only changes under SMALL_HEIGHT_PX are ignored (the canvas stretches by CSS meanwhile).
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === view.w && Math.abs(h - view.h) < SMALL_HEIGHT_PX) return;
      needsResize = true; // applied inside the next frame so the cleared canvas is redrawn before it composites
      invalidate();
    }, RESIZE_DEBOUNCE_MS);
  }

  function stepIntro(dt) {
    if (!introStarted || introDone) return;
    introT += dt;
    if (introT >= INTRO_S) introDone = true;
  }

  function stepWheel(dt, L, hx, hy) {
    const a = still ? 1 : 1 - Math.exp(-dt * 3.2);
    if (introStarted) {
      cur.x += (L.x * view.halfW - cur.x) * a;
      cur.y += (L.y * view.halfH - cur.y) * a;
      cur.s += (L.s - cur.s) * a;
      cur.o += (L.o - cur.o) * a;
      cur.g += (L.g - cur.g) * a;
    } else {
      cur.x = L.x * view.halfW; // waiting behind the splash: sit in place, invisible
      cur.y = L.y * view.halfH;
    }
    cur.calm += (L.calm - cur.calm) * a;
    const solid = introDone ? 1 : smoothstep(0.6, 2.2, introT);
    const draw = introDone ? 1 : smoothstep(0, 1.1, introT);
    const edgeRest = mobile ? EDGE_REST_MOBILE : EDGE_REST_DESKTOP;
    const edgeLevel = introDone ? edgeRest : EDGE_INTRO + (edgeRest - EDGE_INTRO) * smoothstep(1.6, INTRO_S, introT);
    W.placement.position.set(cur.x + hx * 0.18, cur.y + hy * 0.12, 0);
    W.placement.scale.setScalar(Math.max(cur.s, 0.001));
    W.placement.visible = introStarted && cur.o > 0.01;
    W.wheelMat.opacity = cur.o * solid;
    W.edges.material.opacity = cur.o * edgeLevel;
    W.edges.visible = W.edges.material.opacity > 0.005;
    W.edges.geometry.setDrawRange(0, Math.floor((W.edgeCount * draw) / 2) * 2);
    W.halo.material.opacity = 0.4 * cur.o * solid;
    W.glow.material.opacity = clamp(cur.g * cur.o * solid * (0.75 + pulse * 0.5), 0, 1.6);
    W.glow.scale.setScalar(3.6 + cur.g * 0.9);
  }

  function step(dt, nowMs) {
    const L = layout();
    if (!still) trail.update(nowMs / 1000, dt);
    const hx = still ? 0 : trail.x;
    const hy = still ? 0 : trail.y;
    stepIntro(dt);
    stepWheel(dt, L, hx, hy);
    if (still) return;
    spinVel += (L.spin - spinVel) * (1 - Math.exp(-dt * 1.2));
    spinAngle -= spinVel * dt;
    tooth += (toothTarget - tooth) * (1 - Math.exp(-dt * 9));
    W.spin.rotation.z = spinAngle - tooth;
    W.halo.rotation.z += spinVel * 0.6 * dt;
    W.tilt.rotation.x = -hy * 0.32 + Math.sin(time * 0.5) * 0.05;
    W.tilt.rotation.y = hx * 0.42 + Math.cos(time * 0.4) * 0.06;
    field.points.position.set(-hx * 0.45, -hy * 0.3, 0);
    if (trail.seen) lightTarget.set(hx * view.halfW * 0.7, hy * view.halfH * 0.7, 3);
    else lightTarget.copy(LIGHT_HOME);
    fill.position.lerp(lightTarget, 1 - Math.exp(-dt * 4));
    pulse = Math.max(0, pulse - dt * 1.4);
    const u = field.uniforms;
    u.uTime.value = time;
    u.uCalm.value = cur.calm;
    u.uPulse.value = pulse;
    u.uOpacity.value = 0.55 + 0.3 * cur.calm;
  }

  function isActive(now) {
    if (introStarted && !introDone) return true;
    if (now - lastKickAt < KICK_ACTIVE_MS || pulse > 0.01) return true;
    if (trail.active || now - trail.lastMoveAt < POINTER_IDLE_MS) return true;
    const L = layout();
    return Math.abs(L.x * view.halfW - cur.x) + Math.abs(L.y * view.halfH - cur.y) + Math.abs(L.s - cur.s) > 0.01;
  }

  function markReady() {
    if (ready) return;
    ready = true;
    canvas.classList.add('is-ready');
    setDebug('3d');
  }

  function render(now, interval) {
    if (needsResize) { needsResize = false; resize(); }
    if (needsRescale) { needsRescale = false; applyPixelRatio(); }
    const dt = interval ? Math.min(interval / 1000, MAX_DT) : 1 / 60;
    if (!still) time += dt;
    step(dt, now);
    const t0 = performance.now();
    renderer.render(scene, camera);
    dirty = false;
    markReady();
    return performance.now() - t0;
  }

  function frame(now) {
    raf = 0;
    if (disposed || lost || userPaused || document.hidden) return;
    if (still) { if (dirty || needsResize) render(now, 0); return; }
    raf = requestAnimationFrame(frame);
    const wiping = now - lastSectionAt < SECTION_WIPE_MS;
    if (!gov.due(now, isActive(now), needsResize || needsRescale, wiping)) return;
    const interval = gov.begin(now);
    const renderMs = render(now, interval);
    const verdict = gov.end(now, renderMs);
    if (verdict.degrade) degrade(verdict.degrade, verdict.fps);
    else if (verdict.rescale) { needsRescale = true; setDebug('3d'); }
    else if (verdict.measured) setDebug('3d');
  }

  function start() {
    if (disposed || lost || raf || userPaused || document.hidden) return;
    gov.resume();
    raf = requestAnimationFrame(frame);
  }

  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /** Still mode renders on demand; the animated loop picks dirty state up on its own. */
  function invalidate() {
    dirty = true;
    if (still) start();
  }

  function intro() {
    if (disposed || introStarted) return;
    clearTimeout(introTimer);
    introStarted = true;
    introT = 0;
    lastKickAt = performance.now();
    invalidate();
  }

  function hitWheel(nx, ny) {
    if (!W.placement.visible || cur.o < 0.15) return false;
    ndc.set(nx, ny);
    raycaster.setFromCamera(ndc, camera);
    sphere.set(W.placement.position, W.radius * Math.max(cur.s, 0.001));
    return raycaster.ray.intersectsSphere(sphere);
  }

  function rebuildEnvironment() {
    const next = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = next;
    envTex.dispose();
    envTex = next;
  }

  function onLost(event) {
    event.preventDefault();
    lost = true;
    lossCount += 1;
    stop();
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => degrade('context-lost'), RESTORE_TIMEOUT_MS);
  }

  function onRestored() {
    clearTimeout(restoreTimer);
    if (lossCount > MAX_CONTEXT_LOSSES) { degrade('context-unstable'); return; }
    try {
      rebuildEnvironment();
    } catch (err) {
      degrade('context-restore-failed');
      return;
    }
    lost = false;
    needsResize = true;
    invalidate();
    start();
  }

  const onVisibility = () => (document.hidden ? stop() : start());
  const onSplashDone = () => intro();

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    [resizeTimer, restoreTimer, introTimer].forEach(clearTimeout);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('splash:done', onSplashDone);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    envTex.dispose();
    pmrem.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (err) { /* context already gone */ }
  }

  function degrade(reason, fps = null) {
    if (disposed) return;
    dispose();
    markNo3d(canvas);
    setDebug('off', { reason, fps });
    if (typeof opts.onDegrade === 'function') opts.onDegrade(reason);
    document.dispatchEvent(new CustomEvent('scene3d:degrade', { detail: { reason, fps } }));
  }

  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('splash:done', onSplashDone);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  if (!introStarted) introTimer = setTimeout(intro, INTRO_SAFETY_MS);

  resize();
  if (renderer.compileAsync) {
    try { await renderer.compileAsync(scene, camera); } catch (err) { /* compile on first render instead */ }
  }
  if (!disposed) start();

  return {
    mode: still ? 'still' : 'animated',
    setSection(index) {
      if (disposed) return;
      const next = clamp(Math.round(Number(index) || 0), 0, SECTION_COUNT - 1);
      if (next === section) return;
      section = next;
      spinVel += 1.8;
      toothTarget += TOOTH;
      pulse = 1;
      lastKickAt = performance.now();
      lastSectionAt = lastKickAt;
      invalidate();
    },
    /** x, y in -1..1 with y up. touch lowers the trail strength. */
    setPointer(x, y, touch = false) {
      if (disposed || still) return;
      trail.move(clamp(Number(x) || 0, -1, 1), clamp(Number(y) || 0, -1, 1), Boolean(touch));
    },
    /** Pointer left the window or the finger lifted. */
    release() { if (!disposed) trail.release(); },
    /** Tap or click at x, y (-1..1, y up). Ripples the field; returns true when it landed on the wheel. */
    impulse(x, y, touch = false) {
      if (disposed) return false;
      const nx = clamp(Number(x) || 0, -1, 1);
      const ny = clamp(Number(y) || 0, -1, 1);
      const hit = hitWheel(nx, ny);
      if (still) {
        if (hit && typeof opts.onWheelHit === 'function') opts.onWheelHit();
        return hit;
      }
      trail.burst(nx, ny, Boolean(touch));
      lastKickAt = performance.now();
      if (hit) {
        spinVel += 3;
        pulse = 1;
        if (typeof opts.onWheelHit === 'function') opts.onWheelHit();
      } else {
        pulse = Math.max(pulse, 0.35);
      }
      return hit;
    },
    /** Play the wheel draw on. Also triggered by a 'splash:done' document event. */
    intro,
    pause() { userPaused = true; stop(); },
    resume() {
      userPaused = false;
      dirty = true;
      start();
    },
    dispose,
  };
}
