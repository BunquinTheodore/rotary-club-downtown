// Decides how much of the 3D background this device should run. No three.js import here,
// so main.js can call resolveMode() and skip downloading three entirely when it returns 'off'.

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const IN_APP_UA = /FBAN|FBAV|Instagram/i;
const LOW_MEMORY_GB = 2;
const LOW_CORES = 2;

/** True when a WebGL context can be created. The probe context is released straight away. */
export function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch (err) {
    return false;
  }
}

/** Facebook and Instagram in-app browsers: Rotary links are shared there, and they run WebGL slowly. */
export function isInAppBrowser() {
  return IN_APP_UA.test(navigator.userAgent || '');
}

/**
 * 'off'      skip three.js completely (poster fallback, html.no-3d)
 * 'still'    render the scene on demand only, no continuous loop (reduced motion)
 * 'animated' full interactive scene
 * Query overrides for QA: ?bg=off, ?bg=still, ?bg=on (skips the hardware hints, still needs WebGL).
 * Deliberately no "4 cores" cutoff: the wheel is core branding, so slow devices are caught by the FPS guard instead.
 */
export function resolveMode() {
  let forced = '';
  try { forced = new URLSearchParams(location.search).get('bg') || ''; } catch (err) { forced = ''; }
  if (forced === 'off') return 'off';
  if (!hasWebGL()) return 'off';
  const reduced = window.matchMedia(REDUCED_QUERY).matches;
  if (forced === 'still') return 'still';
  if (forced === 'on') return reduced ? 'still' : 'animated';
  const nav = navigator;
  if (nav.connection && nav.connection.saveData === true) return 'off';
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= LOW_MEMORY_GB) return 'off';
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= LOW_CORES) return 'off';
  if (reduced) return 'still';
  return 'animated';
}

/** Lets the browser paint and handle input between heavy startup steps (renderer, env map, shader compile). */
export function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
