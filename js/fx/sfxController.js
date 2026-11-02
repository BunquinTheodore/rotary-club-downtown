// Global click voicing (ported from Theoraux SfxController and GN Tech Run sfx.js).
// Mouse plays on pointerdown with a release on pointerup. Touch and pen play on pointerup
// only when the finger stayed within TAP_SLOP_PX, so swiping between sections stays silent.
// Enter or Space on a focused control plays its voice; the click that follows is deduped.

const CLICKABLE = [
  'a[href]', 'button', '[role="button"]', '[role="tab"]', 'summary', 'label[for]', 'select',
  'input[type="checkbox"]', 'input[type="radio"]', 'input[type="submit"]',
].join(',');
const KEY_ACTIVATABLE_ENTER = 'a[href],button,[role="button"],[role="tab"],summary';
const KEY_ACTIVATABLE_SPACE = 'button,[role="button"],[role="tab"],summary';
const TEXT_FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]),textarea,select,[contenteditable="true"]';
/** data-sfx values whose sound is played elsewhere (or not at all). */
const SILENT_TAGS = new Set(['none', 'open', 'off']);
const POINTER_GRACE_MS = 600;
const KEY_DEDUPE_MS = 800;
const TAP_SLOP_PX = 10;
const PRIMARY_SEL = '.join-cta, .btn-gold';
const LINK_SEL = '.tabbar a, .dots button, .topnav a';
const DEFAULT_HOVER_SEL = '.topnav a, .dots button, .card, .tl-btn, .chip, .btn, .g-item, .filter, .icon-btn, .join-card, .brand';

function isDisabled(el) {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
}

function isSilenced(el) {
  const own = el.dataset.sfx;
  if (own) return SILENT_TAGS.has(own);
  return el.closest('[data-sfx="none"], [data-sfx="off"]') !== null;
}

/** Nearest voiced control for an event target, or null. */
function clickTarget(target) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(CLICKABLE);
  if (!el || isDisabled(el) || isSilenced(el)) return null;
  return el;
}

function variantFor(el) {
  const tag = el.dataset.sfx;
  if (tag === 'primary' || tag === 'link' || tag === 'toggle') return tag;
  if (el.matches(PRIMARY_SEL)) return 'primary';
  if (el.matches(LINK_SEL)) return 'link';
  const type = el.getAttribute('type');
  if (el.hasAttribute('aria-pressed') || el.getAttribute('role') === 'switch'
    || type === 'checkbox' || type === 'radio') return 'toggle';
  if (el.tagName === 'A') return 'link';
  return 'click';
}

/** Direction after the press: currently on flips down, currently off flips up. */
function toggleDir(el) {
  return el.getAttribute('aria-pressed') === 'true' || el.checked === true ? 'down' : 'up';
}

function voice(sfx, el) {
  const kind = variantFor(el);
  if (kind === 'primary') sfx.primary();
  else if (kind === 'link') sfx.link();
  else if (kind === 'toggle') sfx.toggle(toggleDir(el));
  else sfx.click();
}

/** Enter (links, buttons) or Space (buttons) on a focused control, never inside text fields. */
function keyTarget(e) {
  const isEnter = e.key === 'Enter';
  if (!isEnter && e.key !== ' ') return null;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  const target = e.target;
  if (!(target instanceof Element) || target.closest(TEXT_FIELDS)) return null;
  const el = target.closest(isEnter ? KEY_ACTIVATABLE_ENTER : KEY_ACTIVATABLE_SPACE);
  if (!el || isDisabled(el) || isSilenced(el)) return null;
  return el;
}

/**
 * Wire global UI sounds once. Also unlocks audio on the first real gesture and plays
 * the hover tick for mouse pointers over `hoverSelector`.
 * @param {object} sfx engine from ../sfx.js
 * @param {{ hoverSelector?: string | null }} [options] pass null to skip hover ticks
 * @returns {() => void} teardown
 */
export function initSfxController(sfx, { hoverSelector = DEFAULT_HOVER_SEL } = {}) {
  let lastPointer = -Infinity;
  let lastKey = -Infinity;
  let pressed = false;
  let touch = null;

  const unlock = () => { if (!sfx.isRunning || !sfx.isRunning()) sfx.unlock(); };

  const onPointerDown = (e) => {
    lastPointer = performance.now();
    const el = clickTarget(e.target);
    if (e.pointerType !== 'mouse') {
      // Touch and pen: decided on pointerup, which is also the gesture that may unlock audio.
      touch = el ? { el, x: e.clientX, y: e.clientY } : null;
      return;
    }
    if (e.button !== 0 || e.isPrimary === false) return;
    unlock();
    pressed = el !== null;
    if (el) voice(sfx, el);
  };

  const onPointerUp = (e) => {
    if (e.pointerType !== 'mouse') {
      unlock();
      const t = touch;
      touch = null;
      if (!t || Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP_PX) return;
      lastPointer = performance.now();
      voice(sfx, t.el);
      return;
    }
    if (!pressed) return;
    pressed = false;
    sfx.release();
  };

  const onPointerCancel = () => {
    touch = null;
    pressed = false;
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Escape') unlock();
    const el = keyTarget(e);
    if (!el) return;
    lastKey = performance.now();
    voice(sfx, el);
  };

  // Clicks with no pointer behind them (assistive tech, programmatic) get a voice too.
  const onClick = (e) => {
    if (e.detail !== 0) return;
    const now = performance.now();
    if (now - lastPointer < POINTER_GRACE_MS || now - lastKey < KEY_DEDUPE_MS) return;
    const el = clickTarget(e.target);
    if (el) voice(sfx, el);
  };

  const onPointerOver = (e) => {
    if (e.pointerType !== 'mouse' || !(e.target instanceof Element)) return;
    const el = e.target.closest(hoverSelector);
    if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
    sfx.hover();
  };

  const opts = { capture: true, passive: true };
  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['keydown', onKeyDown],
    ['click', onClick],
    // iOS may only grant audio on touchend, so it unlocks there as well.
    ['touchend', unlock],
  ];
  if (hoverSelector) listeners.push(['pointerover', onPointerOver]);
  listeners.forEach(([type, fn]) => document.addEventListener(type, fn, opts));

  return () => listeners.forEach(([type, fn]) => document.removeEventListener(type, fn, opts));
}
