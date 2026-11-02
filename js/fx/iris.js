// Iris transition for nav initiated jumps (tab bar, dots, top nav, CTAs).
// Port of Portfolio main.js addIris(): the next section's photo opens as a circle grown from the
// tapped control, and a thin gold ring expands from the same point. Wheel, swipe and key steps keep
// the directional wipe, because only clicks on [data-go] are marked.
//
// Works without changes to deck.js: a capture phase click listener runs before main.js's
// bubbling [data-go] handler, tags the incoming and outgoing .scene-bg with data attributes,
// and CSS (css/motion.css) switches their animations. A MutationObserver clears the tags once a
// background is no longer active or leaving, so a later wheel step never reuses them.

const CLEANUP_MS = 80;
const RING_MS = 900;

/**
 * @param {{reducedMotion?: boolean}} [opts]
 * @returns {{destroy: () => void} | null}
 */
export function initIris({ reducedMotion = false } = {}) {
  if (reducedMotion) return null;
  const bgs = Array.from(document.querySelectorAll('.scene-bg[data-for]'));
  if (!bgs.length) return null;

  const clearTags = (bg) => {
    bg.removeAttribute('data-iris');
    bg.removeAttribute('data-iris-out');
  };

  const observer = new MutationObserver((records) => {
    records.forEach(({ target }) => {
      if (!target.classList.contains('is-active')) target.removeAttribute('data-iris');
      if (!target.classList.contains('is-leaving') && !target.classList.contains('is-active')) clearTags(target);
    });
  });
  bgs.forEach((bg) => observer.observe(bg, { attributes: true, attributeFilter: ['class'] }));

  const blocked = (id) => document.body.classList.contains('is-booting')
    || document.body.dataset.section === id
    || Boolean(document.querySelector('dialog[open]'));

  function spawnRing(cx, cy) {
    const ring = document.createElement('span');
    ring.className = 'iris-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${cx}px`;
    ring.style.top = `${cy}px`;
    document.body.appendChild(ring);
    const remove = () => ring.remove();
    ring.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, RING_MS + 200);
  }

  function onClick(e) {
    const el = e.target instanceof Element ? e.target.closest('[data-go]') : null;
    if (!el) return;
    const id = el.dataset.go;
    const next = bgs.find((b) => b.dataset.for === id);
    if (!next || blocked(id)) return;

    const r = el.getBoundingClientRect();
    const cx = r.width ? r.left + r.width / 2 : window.innerWidth / 2;
    const cy = r.height ? r.top + r.height / 2 : window.innerHeight / 2;
    const sr = next.getBoundingClientRect();
    next.style.setProperty('--ix', `${(cx - sr.left).toFixed(1)}px`);
    next.style.setProperty('--iy', `${(cy - sr.top).toFixed(1)}px`);

    const current = bgs.find((b) => b.classList.contains('is-active'));
    next.setAttribute('data-iris', '');
    if (current) current.setAttribute('data-iris-out', '');
    spawnRing(cx, cy);

    // If the deck refused the jump (still transitioning, unknown id), drop the tags.
    setTimeout(() => {
      if (!next.classList.contains('is-active')) clearTags(next);
      if (current && current.classList.contains('is-active') && current !== next) clearTags(current);
    }, CLEANUP_MS);
  }

  document.addEventListener('click', onClick, true);

  return {
    destroy() {
      document.removeEventListener('click', onClick, true);
      observer.disconnect();
      bgs.forEach(clearTags);
    },
  };
}
