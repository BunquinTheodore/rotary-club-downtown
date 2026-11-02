// Eased count up for stat numbers. parseCountable and formatCount are ported from
// Theoraux src/lib/countUp.ts; the easing and duration follow Mazal components/Counter.tsx.
// Markup: <dd class="stat-num" data-count="43" data-final="43"><span class="stat-val">43</span></dd>
// The final value is in the markup, so the number is correct without JS or under reduced motion.

const NUMBER_RE = /^(\D{0,3})(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(.{0,14})$/;
const COUNT_MS = 1400;
const SAFETY_MS = 400;

const runs = new WeakMap();

/** "₱3.1M+" gives { prefix: "₱", value: 3.1, decimals: 1, suffix: "M+", grouping: false }. */
export function parseCountable(text) {
  const m = NUMBER_RE.exec(String(text).trim());
  if (!m) return null;
  const [, prefix, int, frac = '', suffix] = m;
  if (/\d/.test(suffix)) return null;
  const grouping = int.includes(',');
  const value = Number(int.replace(/,/g, '') + frac);
  if (!Number.isFinite(value)) return null;
  return { prefix, value, decimals: frac ? frac.length - 1 : 0, suffix, grouping };
}

export function formatCount(parts, current) {
  const fixed = Math.max(0, current).toFixed(parts.decimals);
  const dot = fixed.indexOf('.');
  const int = dot === -1 ? fixed : fixed.slice(0, dot);
  const rest = dot === -1 ? '' : fixed.slice(dot);
  const shown = parts.grouping ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int;
  return parts.prefix + shown + rest + parts.suffix;
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const target = (el) => el.querySelector('.stat-val') || el;

/** Write the final value immediately (reduced motion, or a panel that left mid count). */
export function settleCount(el) {
  const run = runs.get(el);
  if (run) {
    clearTimeout(run.timer);
    clearTimeout(run.safety);
    cancelAnimationFrame(run.raf);
    runs.delete(el);
  }
  const parts = parseCountable(el.dataset.count);
  if (parts) target(el).textContent = formatCount(parts, parts.value);
}

/**
 * Count el from 0 to its data-count value.
 * @param {HTMLElement} el
 * @param {{delay?: number, dur?: number}} [opts]
 */
export function animateCount(el, opts = {}) {
  const parts = parseCountable(el.dataset.count);
  if (!parts) return;
  settleCount(el);
  const out = target(el);
  const dur = opts.dur || COUNT_MS;
  out.textContent = formatCount(parts, 0);
  const run = { timer: 0, safety: 0, raf: 0 };
  runs.set(el, run);
  const delay = Math.max(0, opts.delay || 0);
  // Safety net: rAF does not run in hidden tabs, so the final value is written regardless.
  run.safety = setTimeout(() => { if (runs.get(el) === run) settleCount(el); }, delay + dur + SAFETY_MS);
  run.timer = setTimeout(() => {
    const start = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - start) / dur);
      out.textContent = formatCount(parts, parts.value * easeOutCubic(p));
      if (p < 1) run.raf = requestAnimationFrame(frame);
      else settleCount(el);
    };
    run.raf = requestAnimationFrame(frame);
  }, delay);
}
