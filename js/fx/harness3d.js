// Frame governor for the 3D background: frame caps, idle cap, FPS teardown guard and adaptive resolution.
// Pure bookkeeping, no three.js, so the policy is easy to read and tune in one place.

const FPS_CAP_DESKTOP = 60; // also halves the work on 120Hz screens
const FPS_CAP_MOBILE = 30;
const FPS_CAP_IDLE = 24; // slow spin and drift still read smoothly
const FPS_CAP_TRANSITION = 30; // leaves GPU and main thread room for the section wipe
const FPS_CAP_TRANSITION_MOBILE = 20;
const FRAME_SLACK_MS = 2;
const WARMUP_FRAMES = 20;
const MEASURE_FRAMES = 90;
const MIN_FPS = 24;
const MIN_FPS_IN_APP = 30;
const SLOW_RENDER_MS = 18;
const SLOW_STREAK = 3;
const SCALE_STEP = 0.8;
const SCALE_FLOOR = 0.65;

export function createFrameGovernor({ mobile = false, inApp = false } = {}) {
  const minFps = inApp ? MIN_FPS_IN_APP : MIN_FPS;
  const sampleEnd = WARMUP_FRAMES + MEASURE_FRAMES;
  let frames = 0;
  let measureStart = 0;
  let lastRender = 0;
  let slowStreak = 0;
  let scale = 1;
  let fps = null;

  const measuring = () => frames < sampleEnd;

  return {
    get scale() { return scale; },
    get fps() { return fps; },
    get measuring() { return measuring(); },

    /**
     * Should this rAF tick render? The FPS sample runs uncapped so the cap cannot fake a slow reading.
     * busy: a section transition is running, so the scene yields to it with a lower cap.
     */
    due(now, active, force = false, busy = false) {
      if (force || !lastRender || measuring()) return true;
      let cap = active ? (mobile ? FPS_CAP_MOBILE : FPS_CAP_DESKTOP) : FPS_CAP_IDLE;
      if (busy) cap = Math.min(cap, mobile ? FPS_CAP_TRANSITION_MOBILE : FPS_CAP_TRANSITION);
      return now - lastRender >= 1000 / cap - FRAME_SLACK_MS;
    },

    /** Call right before rendering. Returns ms since the previous rendered frame, 0 after a resume. */
    begin(now) {
      const interval = lastRender ? now - lastRender : 0;
      lastRender = now;
      return interval;
    },

    /**
     * Call right after rendering with the time renderer.render took.
     * Returns { degrade, fps } when the device is too slow, { rescale: true } when resolution should drop.
     */
    end(now, renderMs) {
      frames += 1;
      if (frames === WARMUP_FRAMES) measureStart = now;
      if (frames === sampleEnd && now > measureStart) {
        fps = (MEASURE_FRAMES * 1000) / (now - measureStart);
        if (fps < minFps) return { degrade: inApp ? 'low-fps-in-app' : 'low-fps', fps };
        return { measured: true, fps };
      }
      slowStreak = renderMs > SLOW_RENDER_MS ? slowStreak + 1 : Math.max(0, slowStreak - 1);
      if (slowStreak >= SLOW_STREAK && scale > SCALE_FLOOR) {
        scale = Math.max(SCALE_FLOOR, scale * SCALE_STEP);
        slowStreak = 0;
        return { rescale: true };
      }
      return {};
    },

    /** After a pause or hidden tab: rAF stopped, so restart the sample instead of counting the gap as slow. */
    resume() {
      lastRender = 0;
      slowStreak = 0;
      if (measuring()) frames = 0;
    },
  };
}
