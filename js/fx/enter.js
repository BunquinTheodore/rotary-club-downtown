// Per section entrance effects that CSS alone cannot do: scramble decode for [data-decode]
// labels and count up for [data-count] stats. Runs every time a panel becomes active, so the
// effects replay on revisit, and is timed to the CSS reveal (--d * 85ms + 420ms in style.css).
//
// It watches panel classes with a MutationObserver, so main.js only has to call initSectionFx()
// once. enterSection(panel) is exported too for a caller that prefers to drive it directly.

import { decodeIn, cancelDecode } from './decode.js';
import { animateCount, settleCount } from './counter.js';

const REVEAL_BASE_MS = 420;
const REVEAL_STEP_MS = 85;
const DECODE_MS = 700;
const COUNT_LAG_MS = 180;
const LABEL_DECODE_MS = 520;

let reduced = false;

function revealDelay(el) {
  const host = el.closest('[data-reveal]');
  const d = host ? parseFloat(getComputedStyle(host).getPropertyValue('--d')) || 0 : 0;
  return REVEAL_BASE_MS + d * REVEAL_STEP_MS;
}

/** Run the entrance effects for one panel. */
export function enterSection(panel) {
  if (!panel) return;
  const decodes = panel.querySelectorAll('[data-decode]');
  const counts = panel.querySelectorAll('[data-count]');
  if (reduced) {
    counts.forEach(settleCount);
    return;
  }
  decodes.forEach((el) => decodeIn(el, { delay: revealDelay(el), dur: DECODE_MS }));
  counts.forEach((el) => animateCount(el, { delay: revealDelay(el) + COUNT_LAG_MS }));
}

/** Snap a panel's effects to their final state (it is leaving). */
export function leaveSection(panel) {
  if (!panel) return;
  panel.querySelectorAll('[data-decode]').forEach(cancelDecode);
  panel.querySelectorAll('[data-count]').forEach(settleCount);
}

function watchPanels(panels) {
  const active = new Set(panels.filter((p) => p.classList.contains('is-active')));
  active.forEach(enterSection);
  const observer = new MutationObserver(() => {
    panels.forEach((p) => {
      const on = p.classList.contains('is-active');
      if (on && !active.has(p)) { active.add(p); enterSection(p); }
      else if (!on && active.has(p)) { active.delete(p); leaveSection(p); }
    });
  });
  panels.forEach((p) => observer.observe(p, { attributes: true, attributeFilter: ['class'] }));
  return observer;
}

/** Re-decode the HUD label (#counterLabel) whenever main.js changes body[data-section]. */
function watchLabel() {
  const label = document.getElementById('counterLabel');
  if (!label) return null;
  const observer = new MutationObserver(() => {
    if (document.body.classList.contains('is-booting')) return;
    // Read first: main.js has just written the new label, and decodeIn replaces any older run.
    const text = label.textContent.trim();
    decodeIn(label, { text, dur: LABEL_DECODE_MS });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-section'] });
  return observer;
}

/**
 * @param {{reducedMotion?: boolean}} [opts]
 * @returns {{destroy: () => void}}
 */
export function initSectionFx({ reducedMotion = false } = {}) {
  reduced = reducedMotion;
  const panels = Array.from(document.querySelectorAll('#deck .panel'));
  const observers = [watchPanels(panels)];
  if (!reduced) {
    observers.push(watchLabel());
    const splashLabel = document.querySelector('.splash [data-decode]');
    if (splashLabel && !document.getElementById('splash')?.hidden) {
      decodeIn(splashLabel, { delay: 200, dur: 900 });
    }
  }
  return { destroy() { observers.forEach((o) => o && o.disconnect()); } };
}
