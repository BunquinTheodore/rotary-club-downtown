// Entry point: splash and preload, backgrounds, deck, content, 3D scene, sound.
import { sfx } from './sfx.js';
import { SECTIONS, BACKGROUNDS, fullSrc } from './data.js';
import { createDeck } from './deck.js';
import { initContent } from './gallery.js';
import { initFx } from './fx/index.js';
import { resolveMode } from './fx/capabilities.js';
import { initSfxController } from './fx/sfxController.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = matchMedia('(max-width: 768px)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const CROSSFADE_MS = 7000;
const SPLASH_MIN_MS = reducedMotion ? 300 : 1900;
const SPLASH_MAX_MS = 9000;
const FONT_TIMEOUT_MS = 3500;

const INTERACTIVE_SEL = 'a, button, input, textarea, select, label, [role="button"], [role="tab"], dialog';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

let scene = null;
let splashDone = false;

/* ---------------- Text splitting ---------------- */

const escChar = (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c);

function splitChars(el, baseDelay = 0) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text);
  let ci = baseDelay;
  el.innerHTML = text.split(/\s+/).map((word) => {
    const chars = Array.from(word).map((c) => `<span class="c" style="--ci:${ci++}">${escChar(c)}</span>`).join('');
    ci += 1;
    return `<span class="w" aria-hidden="true">${chars}</span>`;
  }).join(' ');
}

function splitAll() {
  $$('[data-split]').forEach((el) => splitChars(el));
  $$('[data-letters]').forEach((el) => splitChars(el));
}

/* ---------------- Photo backgrounds ---------------- */

const bgEls = SECTIONS.map((s) => $(`.scene-bg[data-for="${s.id}"]`));

function buildBackgrounds() {
  bgEls.forEach((bg, i) => {
    const keys = BACKGROUNDS[SECTIONS[i].id] || [];
    bg.innerHTML = keys.map((k, j) => `
      <div class="bg-slide${j === 0 ? ' is-on' : ''}" style="--j:${j}">
        <img alt="" decoding="async" data-src="${fullSrc(k)}" draggable="false">
      </div>`).join('');
  });
}

function loadImg(img) {
  return new Promise((resolve) => {
    if (!img.dataset.src) { resolve(img); return; }
    img.onload = () => { img.closest('.bg-slide')?.classList.add('is-loaded'); resolve(img); };
    img.onerror = () => resolve(img);
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  });
}

const firstLoaded = new Map();
const restLoaded = new Set();
const validBg = (i) => i >= 0 && i < bgEls.length;

/** Only the first (visible on arrival) slide of a panel. */
function loadFirst(i) {
  if (!validBg(i)) return Promise.resolve();
  if (!firstLoaded.has(i)) {
    const img = $('img', bgEls[i]);
    if (img) img.fetchPriority = 'high';
    firstLoaded.set(i, img ? loadImg(img) : Promise.resolve());
  }
  return firstLoaded.get(i);
}

/** Remaining slides, sequentially, after the first one. Only for the active panel. */
async function loadRest(i) {
  if (!validBg(i) || restLoaded.has(i)) return;
  restLoaded.add(i);
  await loadFirst(i);
  for (const im of $$('img', bgEls[i]).slice(1)) {
    im.fetchPriority = 'low';
    await loadImg(im);
  }
}

let fadeTimer = 0;
function startCrossfade() {
  clearInterval(fadeTimer);
  if (reducedMotion) return;
  fadeTimer = setInterval(() => {
    const bg = bgEls[deck.index];
    if (!bg) return;
    const all = $$('.bg-slide', bg);
    if (all.filter((s) => s.classList.contains('is-loaded')).length < 2) return;
    const cur = Math.max(0, all.findIndex((s) => s.classList.contains('is-on')));
    let next = cur;
    for (let step = 1; step <= all.length; step++) {
      const cand = all[(cur + step) % all.length];
      if (cand.classList.contains('is-loaded')) { next = (cur + step) % all.length; break; }
    }
    if (next === cur) return;
    all.forEach((s) => s.classList.remove('is-on'));
    all[next].classList.add('is-on');
  }, CROSSFADE_MS);
}

/* ---------------- Deck and content ---------------- */

const content = initContent({ sfx });
const panels = SECTIONS.map((s) => document.getElementById(s.id));
const lightboxEl = document.getElementById('lightbox');

const deck = createDeck({
  deckEl: document.getElementById('deck'),
  panels,
  bgs: bgEls,
  reducedMotion,
  isBlocked: () => !splashDone || lightboxEl.open,
  onChange: handleSectionChange,
});

function hydrateAround(i) {
  [i, i + 1, i - 1].forEach((k) => {
    if (k < 0 || k >= SECTIONS.length) return;
    loadFirst(k);
    content.hydrate(SECTIONS[k].id);
  });
}

function updateNavState(i) {
  const id = SECTIONS[i].id;
  $$('[data-go]').forEach((el) => {
    const on = el.dataset.go === id && !el.classList.contains('btn');
    if (on) el.setAttribute('aria-current', 'true');
    else el.removeAttribute('aria-current');
  });
  document.documentElement.style.setProperty('--tab', String(i));
  $('#counterNum').textContent = String(i + 1).padStart(2, '0');
  $('#counterLabel').textContent = SECTIONS[i].label;
  if (splashDone) $('#sectionAnnounce').textContent = `${SECTIONS[i].label} section`;
  document.body.dataset.section = id;
  $('#prevSection').disabled = i === 0;
  $('#nextSection').disabled = i === SECTIONS.length - 1;
}

function handleSectionChange(i, prev) {
  hydrateAround(i);
  if (splashDone) loadRest(i);
  updateNavState(i);
  if (prev >= 0) sfx.whoosh();
  if (scene) scene.setSection(i);
}

/* ---------------- Splash and preload ---------------- */

function preloadImage(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = resolve;
    im.onerror = resolve;
    im.src = src;
  });
}

function fontsReady() {
  if (!document.fonts || !document.fonts.load) return [Promise.resolve()];
  const timeout = new Promise((r) => setTimeout(r, FONT_TIMEOUT_MS));
  return ['700 1em Cinzel', '1em Allura', '400 1em "Open Sans"', '700 1em "Open Sans"']
    .map((f) => Promise.race([document.fonts.load(f).catch(() => null), timeout]));
}

function runSplash(initialIndex) {
  const bar = $('.splash-bar');
  const pct = $('#splashPct');
  const progress = $('.splash-progress');
  const enter = $('#enterBtn');
  const heroKeys = BACKGROUNDS[SECTIONS[initialIndex].id] || [];
  const tasks = [
    ...fontsReady(),
    preloadImage('assets/img/wheel-gold.webp'),
    preloadImage(fullSrc(heroKeys[0])),
  ];
  let done = 0;
  const tick = () => {
    done += 1;
    const p = Math.round((done / tasks.length) * 100);
    bar.style.transform = `scaleX(${p / 100})`;
    pct.textContent = String(p);
    progress.setAttribute('aria-valuenow', String(p));
  };
  tasks.forEach((t) => t.then(tick));

  const minTime = new Promise((r) => setTimeout(r, SPLASH_MIN_MS));
  const maxTime = new Promise((r) => setTimeout(r, SPLASH_MAX_MS));
  Promise.race([Promise.all([...tasks, minTime]), maxTime]).then(() => {
    document.getElementById('splash').classList.add('is-ready');
    enter.disabled = false;
    enter.focus({ preventScroll: true });
    // three.js starts only now, so its download and shader setup never hold up the splash.
    scheduleAfterFirstPaint(load3D);
  });

  // Start the first background under the splash so it is ready when revealed.
  deck.prime(initialIndex);
  loadFirst(initialIndex);
}

function enterSite() {
  if (splashDone) return;
  const enter = $('#enterBtn');
  if (enter.disabled) return;
  splashDone = true;
  sfx.unlock();
  sfx.boot();
  const splash = document.getElementById('splash');
  splash.classList.add('is-out');
  document.body.classList.remove('is-booting');
  setChromeInert(false);
  deck.start();
  if (scene) scene.intro();
  startCrossfade();
  setTimeout(() => { splash.hidden = true; }, reducedMotion ? 200 : 1200);
}

/** Chrome behind the splash must not be reachable while the splash is up. */
function setChromeInert(on) {
  ['#topbar', '.dots', '.step-arrows', '.counter', '#tabbar'].forEach((sel) => {
    const el = $(sel);
    if (el) el.toggleAttribute('inert', on);
  });
}

/* ---------------- 3D scene ---------------- */

async function load3D() {
  const canvas = document.getElementById('bg3d');
  const mode = resolveMode();
  if (mode === 'off') {
    // three.js is never downloaded; CSS shows the static fallback.
    canvas.hidden = true;
    document.documentElement.classList.add('no-3d');
    return;
  }
  try {
    const mod = await import('./scene3d.js');
    scene = await mod.initScene(canvas, {
      mode,
      reducedMotion,
      section: Math.max(0, deck.index),
      awaitIntro: !splashDone,
      onDegrade: () => { scene = null; },
      onWheelHit: () => sfx.open(),
    });
    scene.setSection(Math.max(0, deck.index));
    if (splashDone) scene.intro();
    // scene3d adds .is-ready itself after its first real frame.
  } catch (err) {
    scene = null;
    canvas.hidden = true;
    document.documentElement.classList.add('no-3d');
  }
}

function scheduleAfterFirstPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 1200 });
    else setTimeout(fn, 60);
  }));
}

/* ---------------- Pointer forwarding ---------------- */

function wirePointer() {
  const stage = document.getElementById('stageBg');
  let px = 0;
  let py = 0;
  let touch = false;
  let queued = false;
  const flush = () => {
    queued = false;
    if (scene) scene.setPointer(px, py, touch);
    if (finePointer && !reducedMotion) {
      // Written on the one element that moves, so no document wide style recalc.
      stage.style.transform = `translate3d(${(px * -14).toFixed(2)}px, ${(py * 9).toFixed(2)}px, 0)`;
    }
  };
  window.addEventListener('pointermove', (e) => {
    touch = e.pointerType !== 'mouse';
    px = (e.clientX / window.innerWidth) * 2 - 1;
    py = -((e.clientY / window.innerHeight) * 2 - 1);
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (!scene || !splashDone) return;
    if (e.target.closest(INTERACTIVE_SEL)) return;
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -((e.clientY / window.innerHeight) * 2 - 1);
    scene.impulse(x, y, e.pointerType !== 'mouse'); // onWheelHit plays the chime
  }, { passive: true });
  const release = () => { if (scene) scene.release(); };
  window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') release(); }, { passive: true });
  window.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) release(); });
}

/* ---------------- Sound wiring ---------------- */

function renderMute() {
  const btn = $('#muteBtn');
  const muted = sfx.isMuted();
  btn.setAttribute('aria-pressed', String(muted));
  btn.classList.toggle('is-muted', muted);
}

function wireSound() {
  initSfxController(sfx);
  $('#muteBtn').addEventListener('click', () => {
    sfx.toggleMuted();
    renderMute();
    if (!sfx.isMuted()) sfx.click();
  });
  renderMute();
}

/* ---------------- Navigation wiring ---------------- */

function wireNav() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go]');
    if (!el) return;
    e.preventDefault();
    deck.go(el.dataset.go, { focus: true });
  });
  $('#prevSection').addEventListener('click', () => deck.prev());
  $('#nextSection').addEventListener('click', () => deck.next());

  const enter = $('#enterBtn');
  enter.dataset.sfx = 'none';
  $('#lbClose').dataset.sfx = 'none';
  enter.addEventListener('click', enterSite);
  window.addEventListener('keydown', (e) => {
    if (!splashDone && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      enterSite();
    }
  });
}

/** Stop the WebGL loop and photo pans behind the modal lightbox (its backdrop blur would redo them every frame). */
function wireLightboxPause() {
  new MutationObserver(() => {
    const open = lightboxEl.open;
    document.body.classList.toggle('lb-open', open);
    if (!scene) return;
    if (open) scene.pause();
    else if (!document.hidden) scene.resume();
  }).observe(lightboxEl, { attributes: true, attributeFilter: ['open'] });
}

function wireVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(fadeTimer);
      if (scene) scene.pause();
    } else {
      if (splashDone) startCrossfade();
      if (scene && !lightboxEl.open) scene.resume();
    }
  });
}

/* ---------------- Boot ---------------- */

function boot() {
  if (reducedMotion) document.documentElement.classList.add('reduced-motion');
  if (isMobile) document.documentElement.classList.add('is-mobile');
  const total = document.querySelector('.counter-total');
  if (total) total.textContent = `/ ${String(SECTIONS.length).padStart(2, '0')}`;
  splitAll();
  buildBackgrounds();
  initFx({ reducedMotion });
  const fromHash = deck.indexOf(location.hash.replace('#', ''));
  const initial = fromHash >= 0 ? fromHash : 0;
  updateNavState(initial);
  setChromeInert(true);
  wireNav();
  wireSound();
  wirePointer();
  wireVisibility();
  wireLightboxPause();
  runSplash(initial);
}

boot();
