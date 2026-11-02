// Synthesized UI sound effects (WebAudio only, no audio files).
// Click voices are ported from the Theoraux engine: a bandpassed noise transient plus a
// low sine body thump, varied per hit, behind a compressor and a per second voice budget.
const STORAGE_KEY = 'rcdbc-muted';
const MASTER_GAIN = 0.2;
const COMP_THRESHOLD_DB = -14;
const COMP_RATIO = 4;
// The legacy tone/noise voices were tuned for a 0.35 master with no compressor.
const LEGACY_SCALE = 0.35 / MASTER_GAIN;
const HOVER_THROTTLE_MS = 70;
const MAX_VOICES_PER_SEC = 12;
const BUDGET_WINDOW_MS = 1000;
const VARIATION = 0.06;
// A press voice requested again this soon is the same activation echoing (e.g. a click handler).
const PRESS_ECHO_MS = 250;
// A release only follows a press that played this recently.
const RELEASE_WINDOW_MS = 3000;
const LEAD_S = 0.005;

let ctx = null;
let master = null;
let noiseBuffer = null;
let burstBuffer = null;
let lastHover = 0;
let lastPressAt = -Infinity;
let downAt = null;
let downRecipe = null;
let muted = readMuted();
const budget = createVoiceBudget(MAX_VOICES_PER_SEC, BUDGET_WINDOW_MS);

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/** Stored choice wins; with no choice, sound starts muted under reduced motion. */
function readMuted() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch (_) {
    /* storage unavailable; fall through to the default */
  }
  return prefersReducedMotion();
}

function writeMuted(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch (_) {
    /* storage unavailable; keep in memory only */
  }
}

/** At most `max` voice starts in any sliding window. */
function createVoiceBudget(max, windowMs) {
  let log = [];
  return {
    take(nowMs) {
      log = log.filter((t) => t > nowMs - windowMs);
      if (log.length >= max) return false;
      log = [...log, nowMs];
      return true;
    },
  };
}

/** Scale base by up to plus or minus pct, randomly per hit. */
function vary(base, pct = VARIATION) {
  return base * (1 + (Math.random() * 2 - 1) * pct);
}

const MOUSE_BASE = Object.freeze({
  noiseHz: 4000, noiseGain: 1, noiseDecay: 0.015,
  body0: 220, body1: 90, bodyGain: 0.42, bodyDur: 0.025,
});

/** Press voice per variant: primary deeper and firmer, link lighter, toggle nudged by direction. */
function pressRecipe(kind, dir) {
  switch (kind) {
    case 'primary':
      return { ...MOUSE_BASE, noiseHz: 3300, noiseGain: 1.1, body0: 180, body1: 70, bodyGain: 0.6, bodyDur: 0.03 };
    case 'link':
      return { ...MOUSE_BASE, noiseHz: 4600, noiseGain: 0.8, body0: 260, body1: 120, bodyGain: 0.25, bodyDur: 0.02 };
    case 'toggle': {
      const k = dir === 'down' ? 0.95 : 1.05;
      return { ...MOUSE_BASE, body0: MOUSE_BASE.body0 * k, body1: MOUSE_BASE.body1 * k, toggle: true };
    }
    default:
      return MOUSE_BASE;
  }
}

/** Release: 40 percent as loud, a touch higher; toggles wait slightly longer. */
function releaseRecipe(r) {
  return {
    noiseHz: r.noiseHz * 1.25, noiseGain: r.noiseGain * 0.4, noiseDecay: 0.01,
    body0: r.body0 * 1.4, body1: r.body1 * 1.5, bodyGain: r.bodyGain * 0.4, bodyDur: 0.015,
    delay: r.toggle ? 0.03 : 0,
  };
}

function ready() {
  return !muted && ctx !== null && ctx.state === 'running' && !document.hidden;
}

function getNoise() {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 1.2);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** One short noise buffer shared by every transient, started at a random offset. */
function getBurstNoise() {
  if (burstBuffer) return burstBuffer;
  const length = Math.floor(ctx.sampleRate * 0.25);
  burstBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = burstBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return burstBuffer;
}

// Play one enveloped oscillator tone.
function tone({ type = 'sine', freq, endFreq, start = 0, dur, gain, attack = 0.005 }) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain * LEGACY_SCALE, t0 + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Play a filtered noise burst with an optional filter sweep.
function noise({ dur, gain, filter = 'bandpass', from, to, q = 1, attack = 0.01, start = 0 }) {
  const t0 = ctx.currentTime + start;
  const src = ctx.createBufferSource();
  const biquad = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = getNoise();
  biquad.type = filter;
  biquad.Q.value = q;
  biquad.frequency.setValueAtTime(from, t0);
  if (to) biquad.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain * LEGACY_SCALE, t0 + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(biquad).connect(amp).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/** Instant attack noise transient through a bandpass with exponential decay; optional sweep to `toHz`. */
function burst(hz, q, peak, decay, t0, toHz) {
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = getBurstNoise();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(hz, t0);
  if (toHz) bp.frequency.exponentialRampToValueAtTime(toHz, t0 + decay);
  amp.gain.setValueAtTime(peak, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
  src.connect(bp).connect(amp).connect(master);
  src.start(t0, Math.random() * Math.max(0, 0.25 - decay - 0.02));
  src.stop(t0 + decay + 0.01);
}

/** Low body thump: sine sweeping f0 down to f1, 1ms attack then exponential decay. */
function thump(f0, f1, dur, peak, t0) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.linearRampToValueAtTime(peak, t0 + 0.001);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.005);
}

/** Render a click recipe with per hit variation on every frequency and gain. */
function renderRecipe(r, t0) {
  burst(vary(r.noiseHz), 0.9, vary(r.noiseGain), r.noiseDecay, t0);
  thump(vary(r.body0), vary(r.body1), r.bodyDur, vary(r.bodyGain), t0);
}

/** Run `render` only when sound can play, resuming a context that is still settling after unlock. */
function attempt(render) {
  if (muted || ctx === null || document.hidden) return;
  const play = () => {
    try {
      render();
    } catch (_) {
      /* audio failures must never break the UI */
    }
  };
  if (ready()) { play(); return; }
  // Some browsers (Safari, iOS) report 'suspended' until resume() settles after unlock.
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => { if (ready()) play(); }).catch(() => {});
  }
}

/** Wrap a voice so it is guarded by mute, readiness and the voice budget. */
function voice(fn, { budgeted = true } = {}) {
  return (...args) => attempt(() => {
    if (budgeted && !budget.take(performance.now())) return;
    fn(...args);
  });
}

function press(kind, dir) {
  attempt(() => {
    const nowMs = performance.now();
    if (nowMs - lastPressAt < PRESS_ECHO_MS) return;
    if (!budget.take(nowMs)) return;
    lastPressAt = nowMs;
    const r = pressRecipe(kind, dir);
    renderRecipe(r, ctx.currentTime + LEAD_S);
    downAt = nowMs;
    downRecipe = r;
  });
}

function onVisibility() {
  if (!ctx) return;
  try {
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (!muted) ctx.resume().catch(() => {});
  } catch (_) {
    /* ignore; the next gesture unlock retries */
  }
}

function createContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = COMP_THRESHOLD_DB;
  comp.ratio.value = COMP_RATIO;
  master.connect(comp).connect(ctx.destination);
  document.addEventListener('visibilitychange', onVisibility);
}

export const sfx = {
  unlock() {
    try {
      if (!ctx) createContext();
      if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    } catch (_) {
      ctx = null;
      master = null;
    }
  },

  isRunning() {
    return ctx !== null && ctx.state === 'running';
  },

  click() { press('click'); },
  primary() { press('primary'); },
  link() { press('link'); },
  toggle(dir) { press('toggle', dir === 'down' ? 'down' : 'up'); },

  /** Softer release click; only after a press that played and has not been released. */
  release() {
    attempt(() => {
      const nowMs = performance.now();
      if (downAt === null || !downRecipe || nowMs - downAt >= RELEASE_WINDOW_MS) return;
      const r = releaseRecipe(downRecipe);
      downAt = null;
      renderRecipe(r, ctx.currentTime + LEAD_S + r.delay);
    });
  },

  // Hover ticks are throttled here only and never spend the click budget.
  hover: voice(() => {
    const now = performance.now();
    if (now - lastHover < HOVER_THROTTLE_MS) return;
    lastHover = now;
    tone({ type: 'sine', freq: vary(2600), dur: 0.035, gain: 0.06, attack: 0.002 });
  }, { budgeted: false }),

  whoosh: voice(() => {
    const t = ctx.currentTime + LEAD_S;
    burst(vary(600), 0.7, vary(0.5), 0.25, t, vary(2400));
    thump(vary(140), vary(60), 0.12, vary(0.3), t);
  }),

  open: voice(() => {
    tone({ type: 'sine', freq: 880, dur: 0.28, gain: 0.22 });
    tone({ type: 'sine', freq: 1318.5, start: 0.08, dur: 0.38, gain: 0.2 });
    tone({ type: 'triangle', freq: 2637, start: 0.08, dur: 0.2, gain: 0.04 });
  }),

  close: voice(() => {
    tone({ type: 'sine', freq: 740, endFreq: 370, dur: 0.26, gain: 0.2, attack: 0.01 });
    tone({ type: 'triangle', freq: 554, endFreq: 277, start: 0.04, dur: 0.24, gain: 0.06 });
  }),

  boot: voice(() => {
    const chord = [196, 293.66, 392, 587.33];
    chord.forEach((f, i) => {
      tone({ type: 'sine', freq: f * 0.5, endFreq: f, start: i * 0.06, dur: 1.6, gain: 0.12, attack: 0.5 });
    });
    tone({ type: 'triangle', freq: 1174.7, start: 0.7, dur: 1.1, gain: 0.05, attack: 0.25 });
    noise({ dur: 1.2, gain: 0.08, filter: 'lowpass', from: 400, to: 4000, attack: 0.6 });
  }, { budgeted: false }),

  setMuted(value) {
    muted = Boolean(value);
    writeMuted(muted);
    if (muted) downAt = null;
  },

  toggleMuted() {
    sfx.setMuted(!muted);
    return muted;
  },

  isMuted() {
    return muted;
  },
};
