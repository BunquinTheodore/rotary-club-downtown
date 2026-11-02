// Scramble decode for short uppercase labels (eyebrows, HUD label, meta keys).
// Port of the seeded hash decode in Portfolio js/scenes/util.js, driven by rAF instead of GSAP.
// Letters lock left to right; unlocked slots show glyphs that change 24 times per second.

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&/<>+=';
const STEPS_PER_SECOND = 24;
const MAX_CHARS = 48;
const SAFETY_MS = 400;

const runs = new WeakMap();

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function frameHtml(text, p, step) {
  const n = text.length;
  let out = '';
  for (let i = 0; i < n; i += 1) {
    const c = text[i];
    if (c === ' ' || p >= (i + 1) / n) {
      out += escapeHtml(c);
    } else {
      const g = GLYPHS[Math.floor(hash(i * 7 + step) * GLYPHS.length)];
      out += `<span class="dc-g">${escapeHtml(g)}</span>`;
    }
  }
  return out;
}

/** Stop a running decode on el and write its final text. */
export function cancelDecode(el) {
  const run = runs.get(el);
  if (!run) return;
  clearTimeout(run.timer);
  clearTimeout(run.safety);
  cancelAnimationFrame(run.raf);
  runs.delete(el);
  el.textContent = run.text;
  run.resolve();
}

/**
 * Decode el's text in place.
 * @param {HTMLElement} el
 * @param {{dur?: number, delay?: number, text?: string}} [opts]
 *   text: final string. Defaults to data-text (cached on first run) or the current text.
 * @returns {Promise<void>} resolves when the final text is written
 */
export function decodeIn(el, opts = {}) {
  if (!el) return Promise.resolve();
  cancelDecode(el);
  if (!el.dataset.text && !opts.text) el.dataset.text = el.textContent.trim();
  const text = (opts.text || el.dataset.text || '').slice(0, MAX_CHARS);
  const dur = Math.max(120, opts.dur || 600);
  const delay = Math.max(0, opts.delay || 0);
  if (!text) return Promise.resolve();

  return new Promise((resolve) => {
    const run = { text, timer: 0, safety: 0, raf: 0, resolve };
    runs.set(el, run);
    // Screen readers get the real text the whole time; the glyph frames are hidden from them.
    const paint = (p, step) => {
      el.innerHTML = `<span class="sr-only">${escapeHtml(text)}</span>`
        + `<span class="dc-frame" aria-hidden="true">${frameHtml(text, p, step)}</span>`;
    };
    paint(0, 0);
    // Safety net: rAF does not run in hidden tabs, so the final text is written regardless.
    run.safety = setTimeout(() => { if (runs.get(el) === run) cancelDecode(el); }, delay + dur + SAFETY_MS);
    run.timer = setTimeout(() => {
      const start = performance.now();
      const frame = (now) => {
        const p = Math.min(1, (now - start) / dur);
        if (p >= 1) {
          cancelDecode(el);
          return;
        }
        paint(p, Math.floor(((now - start) / 1000) * STEPS_PER_SECOND));
        run.raf = requestAnimationFrame(frame);
      };
      run.raf = requestAnimationFrame(frame);
    }, delay);
  });
}
