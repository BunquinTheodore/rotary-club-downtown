// Decides how much of the 3D background this device should run. No three.js import here,
// so main.js can call resolveMode() and skip downloading three entirely when it returns 'off'.

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const IN_APP_UA = /FBAN|FBAV|Instagram/i;
const LOW_MEMORY_GB = 2;
const LOW_CORES = 2;
const MODEST_MEMORY_GB = 4;
const MODEST_CORES = 4;
const COARSE_QUERY = '(hover: none) and (pointer: coarse)';

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
 * Modest touch devices (4 GB or 4 cores or less) get 'still': the wheel is core branding so it is still drawn,
 * but without the continuous loop. Faster slow devices are caught by the FPS guard instead.
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
  if (hintsSayOff(nav)) return 'off';
  if (reduced) return 'still';
  if (isModestTouchDevice(nav)) return 'still';
  return 'animated';
}

/** Data saver, very low memory or very few cores: the scene never runs here. */
function hintsSayOff(nav) {
  if (nav.connection && nav.connection.saveData === true) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= LOW_MEMORY_GB) return true;
  return typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= LOW_CORES;
}

/**
 * Cheap pre check for the 3D prefetch: true when resolveMode() is certain to return 'off'
 * from the query or hardware hints. It skips the WebGL probe, which blocks the main thread.
 */
export function skips3DDownload() {
  let forced = '';
  try { forced = new URLSearchParams(location.search).get('bg') || ''; } catch (err) { forced = ''; }
  if (forced === 'off') return true;
  if (forced === 'still' || forced === 'on') return false;
  return hintsSayOff(navigator);
}

function isModestTouchDevice(nav) {
  if (!window.matchMedia(COARSE_QUERY).matches) return false;
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= MODEST_MEMORY_GB;
  // Core count is only trusted next to deviceMemory (Chromium). iOS Safari reports no memory and a
  // capped core count, so on its own it would put every iPhone and iPad in still mode.
  const fewCores = typeof nav.deviceMemory === 'number'
    && typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= MODEST_CORES;
  return lowMemory || fewCores;
}

/** Lets the browser paint and handle input between heavy startup steps (renderer, env map, shader compile). */
export function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
