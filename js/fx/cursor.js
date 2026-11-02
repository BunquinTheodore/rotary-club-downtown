// Gold cursor ring for fine pointers (Portfolio #cursor, with a rAF lerp in place of gsap.quickTo).
// The native cursor stays visible underneath, so nothing depends on the ring.

const FOLLOW_RATE = 18;
const SETTLE_PX = 0.15;
const MAX_DT = 0.05;
const POINTABLE = 'a, button, [role="button"], .card, .g-item, .chip, .tl-btn, .filter';

/**
 * @param {{reducedMotion?: boolean}} [opts]
 * @returns {{destroy: () => void} | null} null when the device has no fine pointer
 */
export function initCursor({ reducedMotion = false } = {}) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (reducedMotion || !fine) return null;

  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);

  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let raf = 0;
  let last = 0;
  let shown = false;

  const write = () => { ring.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`; };

  const frame = (now) => {
    const dt = Math.min(MAX_DT, (now - last) / 1000);
    last = now;
    const k = 1 - Math.exp(-dt * FOLLOW_RATE);
    x += (tx - x) * k;
    y += (ty - y) * k;
    write();
    if (Math.abs(tx - x) + Math.abs(ty - y) > SETTLE_PX) raf = requestAnimationFrame(frame);
    else raf = 0;
  };

  const onMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    tx = e.clientX;
    ty = e.clientY;
    if (!shown) {
      shown = true;
      x = tx;
      y = ty;
      write();
      ring.classList.add('is-visible');
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  const onOver = (e) => {
    const el = e.target instanceof Element ? e.target.closest(POINTABLE) : null;
    ring.classList.toggle('is-hover', Boolean(el) && !el.disabled);
  };
  const onDown = (e) => { if (e.pointerType === 'mouse') ring.classList.add('is-down'); };
  const onUp = () => ring.classList.remove('is-down');
  const onLeave = (e) => {
    if (e.relatedTarget) return;
    shown = false;
    ring.classList.remove('is-visible', 'is-hover');
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerover', onOver, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('mouseout', onLeave, { passive: true });

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('mouseout', onLeave);
      ring.remove();
    },
  };
}
