// One entry for the visual motion layer. Each effect is isolated so one failure never blocks the deck.
import { initSectionFx } from './enter.js';
import { initIris } from './iris.js';
import { initCursor } from './cursor.js';

function safely(fn) {
  try {
    return fn();
  } catch (err) {
    // Effects are optional; the deck works without them.
    return null;
  }
}

/**
 * Call once from main.js boot(), after splitAll() and before runSplash().
 * @param {{reducedMotion?: boolean}} [opts]
 */
export function initFx({ reducedMotion = false } = {}) {
  // The custom cursor is not needed for the splash, so it waits for an idle moment.
  const idle = window.requestIdleCallback ? window.requestIdleCallback.bind(window) : (fn) => setTimeout(fn, 60);
  idle(() => safely(() => initCursor({ reducedMotion })), { timeout: 1500 });
  return {
    section: safely(() => initSectionFx({ reducedMotion })),
    iris: safely(() => initIris({ reducedMotion })),
  };
}
