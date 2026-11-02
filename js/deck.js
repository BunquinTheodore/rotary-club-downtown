// Fullscreen panel deck: one 100dvh panel visible at a time.
// Navigation: wheel (one step per gesture), vertical swipe, keyboard, programmatic go().

const WHEEL_THRESHOLD = 28;
const WHEEL_GESTURE_GAP = 220;
const WHEEL_QUIET_TO_UNLOCK = 170;
const INNER_SCROLL_COOLDOWN = 420;
const SWIPE_MIN = 48;
const EDGE_EPSILON = 2;
const KEY_SCROLL_RATIO = 0.8;

function canScroll(el, dir) {
  if (!(el instanceof Element)) return false;
  if (el.scrollHeight <= el.clientHeight + EDGE_EPSILON) return false;
  const oy = getComputedStyle(el).overflowY;
  if (oy !== 'auto' && oy !== 'scroll') return false;
  if (dir > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - EDGE_EPSILON;
  return el.scrollTop > EDGE_EPSILON;
}

/** Nearest ancestor (inside the deck) that can still scroll in the given direction. */
function innerScroller(target, dir, boundary) {
  let el = target instanceof Element ? target : null;
  while (el && el !== boundary && el !== document.body) {
    if (canScroll(el, dir)) return el;
    el = el.parentElement;
  }
  return null;
}

function scrollableAncestor(target, boundary) {
  let el = target instanceof Element ? target : null;
  while (el && el !== boundary && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + EDGE_EPSILON) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * @param {object} cfg
 * @param {HTMLElement} cfg.deckEl
 * @param {HTMLElement[]} cfg.panels
 * @param {HTMLElement[]} cfg.bgs        background stacks, same order as panels
 * @param {(i:number, prev:number, dir:string)=>void} cfg.onChange
 * @param {()=>boolean} cfg.isBlocked   true while splash or a modal is open
 * @param {boolean} cfg.reducedMotion
 */
export function createDeck({ deckEl, panels, bgs, onChange, isBlocked, reducedMotion }) {
  const ids = panels.map((p) => p.id);
  const duration = reducedMotion ? 350 : 1100;
  const bgRoot = bgs[0] ? bgs[0].parentElement : null;
  let current = -1;
  let started = false;
  let transitioning = false;
  let leaveTimer = 0;

  const setDir = (dir) => {
    deckEl.dataset.dir = dir;
    if (bgRoot) bgRoot.dataset.dir = dir;
  };

  const setInert = (activeIndex) => {
    panels.forEach((p, i) => {
      const on = i === activeIndex && started;
      p.toggleAttribute('inert', !on);
      p.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
  };

  const resolve = (target) => (typeof target === 'string' ? ids.indexOf(target) : target);

  // Panel headings receive focus after keyboard or click navigation so focus is never lost to <body>.
  const headings = panels.map((p) => {
    const h = p.querySelector('h1, h2');
    if (h) h.setAttribute('tabindex', '-1');
    return h;
  });
  const focusPanel = (i) => {
    if (headings[i]) headings[i].focus({ preventScroll: true });
  };

  /** Show a panel background instantly (used under the splash before start). */
  function prime(index) {
    const i = resolve(index);
    if (i < 0) return;
    current = i;
    bgs.forEach((b, k) => b.classList.toggle('is-active', k === i));
    bgs[i].classList.add('is-instant');
    setInert(-1);
  }

  function start() {
    if (started) return;
    started = true;
    if (current < 0) current = 0;
    setDir('next');
    panels[current].classList.add('is-active');
    bgs[current].classList.add('is-active');
    setInert(current);
    onChange(current, -1, 'next');
  }

  /**
   * @param {string|number} target section id or index
   * @param {{focus?: boolean}} [opts] focus: move keyboard focus to the new panel heading
   */
  function go(target, opts = {}) {
    const i = resolve(target);
    if (!started || i < 0 || i >= panels.length || i === current) return false;
    const prev = current;
    const dir = i > prev ? 'next' : 'prev';
    setDir(dir);
    clearTimeout(leaveTimer);

    panels.forEach((p, k) => { if (k !== prev) p.classList.remove('is-leaving'); });
    bgs.forEach((b, k) => { if (k !== prev) b.classList.remove('is-leaving', 'is-instant'); });

    panels[prev].classList.remove('is-active');
    bgs[prev].classList.remove('is-active', 'is-instant');
    panels[prev].classList.add('is-leaving');
    bgs[prev].classList.add('is-leaving');

    // restart entrance animations
    void panels[i].offsetWidth;
    panels[i].classList.add('is-active');
    bgs[i].classList.add('is-active');

    current = i;
    setInert(i);
    if (opts.focus) focusPanel(i);
    transitioning = true;
    leaveTimer = setTimeout(() => {
      panels[prev].classList.remove('is-leaving');
      bgs[prev].classList.remove('is-leaving');
      transitioning = false;
    }, duration);

    try {
      history.replaceState(null, '', '#' + ids[i]);
    } catch (err) {
      // replaceState can fail on file:// in some browsers; navigation still works
    }
    onChange(i, prev, dir);
    return true;
  }

  const step = (delta, opts) => go(Math.max(0, Math.min(panels.length - 1, current + delta)), opts);

  // Wheel: accumulate within a gesture, step once, then stay locked until the wheel goes quiet.
  let acc = 0;
  let lastWheel = 0;
  let innerAt = 0;
  let wheelLocked = false;

  const tryUnlock = () => {
    if (performance.now() - lastWheel < WHEEL_QUIET_TO_UNLOCK) {
      setTimeout(tryUnlock, 80);
    } else {
      wheelLocked = false;
    }
  };

  function onWheel(e) {
    if (!started || isBlocked()) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    if (Math.abs(e.deltaX) > Math.abs(dy)) return;
    const dir = Math.sign(dy);
    if (!dir) return;
    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    if (innerScroller(e.target, dir, deckEl)) {
      acc = 0;
      innerAt = now;
      return;
    }
    if (now - innerAt < INNER_SCROLL_COOLDOWN || wheelLocked) return;
    if (gap > WHEEL_GESTURE_GAP) acc = 0;
    acc += dy;
    if (Math.abs(acc) < WHEEL_THRESHOLD) return;
    acc = 0;
    if (step(dir)) {
      wheelLocked = true;
      setTimeout(tryUnlock, duration * 0.8);
    }
  }

  // Touch: vertical swipe, respecting inner scrollers that were not at their edge.
  let touch = null;
  function onTouchStart(e) {
    if (!started || e.touches.length !== 1 || !deckEl.contains(e.target)) { touch = null; return; }
    const t = e.touches[0];
    const scroller = scrollableAncestor(e.target, deckEl);
    touch = {
      x: t.clientX,
      y: t.clientY,
      time: performance.now(),
      atTop: scroller ? scroller.scrollTop <= EDGE_EPSILON : true,
      atBottom: scroller
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - EDGE_EPSILON
        : true,
    };
  }
  function onTouchEnd(e) {
    if (!touch || isBlocked()) { touch = null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.x;
    const dy = t.clientY - touch.y;
    const quick = performance.now() - touch.time < 900;
    const s = touch;
    touch = null;
    if (!quick || Math.abs(dy) < SWIPE_MIN || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if (dy < 0 && s.atBottom) step(1);
    else if (dy > 0 && s.atTop) step(-1);
  }

  function onKey(e) {
    if (!started || isBlocked() || e.defaultPrevented) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.altKey || e.ctrlKey || e.metaKey) return;
    const focusInDeck = deckEl.contains(document.activeElement);
    if (e.key === 'Home' || e.key === 'End') {
      // Leave Home/End to the browser while focus sits inside a scrollable area.
      if (focusInDeck && scrollableAncestor(document.activeElement, deckEl)) return;
      e.preventDefault();
      go(e.key === 'Home' ? 0 : panels.length - 1, { focus: true });
      return;
    }
    let delta = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') delta = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') delta = -1;
    if (!delta) return;
    if (focusInDeck && innerScroller(document.activeElement, delta, deckEl)) return;
    if (!focusInDeck) {
      // Focus is outside the deck: scroll the active panel's own scroller before changing section.
      const scope = panels[current].querySelector('.scroll-y, .panel-inner');
      const sc = innerScroller(scope, delta, deckEl) || (scope && canScroll(scope, delta) ? scope : null);
      if (sc) {
        e.preventDefault();
        sc.scrollBy({ top: delta * sc.clientHeight * KEY_SCROLL_RATIO });
        return;
      }
    }
    if (transitioning) { e.preventDefault(); return; }
    e.preventDefault();
    step(delta, { focus: true });
  }

  function onHash() {
    const id = location.hash.replace('#', '');
    const i = ids.indexOf(id);
    if (i >= 0 && i !== current) go(i);
  }

  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
  window.addEventListener('keydown', onKey);
  window.addEventListener('hashchange', onHash);

  return {
    prime,
    start,
    go,
    next: (opts) => step(1, opts),
    prev: (opts) => step(-1, opts),
    indexOf: (id) => ids.indexOf(id),
    get index() { return current; },
    get ids() { return ids.slice(); },
  };
}
