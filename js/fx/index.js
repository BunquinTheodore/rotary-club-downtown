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
  return {
    section: safely(() => initSectionFx({ reducedMotion })),
    iris: safely(() => initIris({ reducedMotion })),
    cursor: safely(() => initCursor({ reducedMotion })),
  };
}
