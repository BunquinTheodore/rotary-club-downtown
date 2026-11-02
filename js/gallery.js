// Content rendering (projects, events, gallery) and the lightbox viewer.
import {
  PROJECTS, EVENTS, GALLERY_ORDER, GROUP_LABELS, FOCUS_AREAS,
  groupKeys, thumbSrc, fullSrc, thumbDims, fullDims,
} from './data.js';

const EXCLUDED = new Set(['plant-12']);
const DRAG_THRESHOLD = 6;
const SWIPE_MIN = 40;
const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const groupOf = (key) => key.replace(/-\d+$/, '');

function thumbImg(key, alt, cls = '', lazyAttr = 'data-src') {
  const [w, h] = thumbDims(key);
  return `<img ${lazyAttr}="${thumbSrc(key)}" width="${w}" height="${h}" alt="${esc(alt)}" class="${cls}" decoding="async">`;
}

/* ---------------- Lightbox ---------------- */

function createLightbox(sfx) {
  const dialog = document.getElementById('lightbox');
  const img = document.getElementById('lbImg');
  const stage = document.getElementById('lbStage');
  const titleEl = document.getElementById('lbTitle');
  const countEl = document.getElementById('lbCount');
  const captionEl = document.getElementById('lbCaption');
  const strip = document.getElementById('lbStrip');
  let keys = [];
  let index = 0;
  let title = '';
  const cache = new Map();

  const preload = (key) => {
    if (!key || cache.has(key)) return;
    const im = new Image();
    im.decoding = 'async';
    im.src = fullSrc(key);
    cache.set(key, im);
  };

  function renderStrip() {
    strip.innerHTML = keys.map((k, i) => {
      const [w, h] = thumbDims(k);
      return `<button type="button" class="lb-thumb" data-i="${i}" aria-label="Photo ${i + 1}">
        <img src="${thumbSrc(k)}" width="${w}" height="${h}" alt="" loading="lazy" decoding="async"></button>`;
    }).join('');
    strip.hidden = keys.length < 2;
  }

  function show(i, dirClass = '') {
    index = (i + keys.length) % keys.length;
    const key = keys[index];
    const [w, h] = fullDims(key);
    const label = GROUP_LABELS[groupOf(key)] || title;
    stage.classList.add('is-loading');
    img.classList.remove('is-in', 'from-left', 'from-right');
    img.onload = () => {
      stage.classList.remove('is-loading');
      void img.offsetWidth;
      img.classList.add('is-in');
      if (dirClass) img.classList.add(dirClass);
    };
    img.onerror = () => stage.classList.remove('is-loading');
    img.width = w;
    img.height = h;
    img.src = fullSrc(key);
    img.alt = `${label}, photo ${index + 1} of ${keys.length}`;
    titleEl.textContent = title;
    countEl.textContent = `${index + 1} / ${keys.length}`;
    captionEl.textContent = label;
    const many = keys.length > 1;
    document.getElementById('lbPrev').hidden = !many;
    document.getElementById('lbNext').hidden = !many;
    strip.querySelectorAll('.lb-thumb').forEach((b, k) => {
      const on = k === index;
      b.classList.toggle('is-active', on);
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    });
    preload(keys[(index + 1) % keys.length]);
    preload(keys[(index - 1 + keys.length) % keys.length]);
  }

  function open(list, start = 0, heading = '') {
    keys = list.filter((k) => !EXCLUDED.has(k));
    if (!keys.length) return;
    title = heading;
    renderStrip();
    if (!dialog.open) {
      dialog.showModal();
      sfx.open();
    }
    show(Math.max(0, keys.indexOf(list[start])), '');
  }

  const close = () => { if (dialog.open) dialog.close(); };
  const next = () => { if (keys.length > 1) { sfx.click(); show(index + 1, 'from-right'); } };
  const prev = () => { if (keys.length > 1) { sfx.click(); show(index - 1, 'from-left'); } };

  document.getElementById('lbClose').addEventListener('click', close);
  document.getElementById('lbNext').addEventListener('click', next);
  document.getElementById('lbPrev').addEventListener('click', prev);
  dialog.addEventListener('close', () => {
    sfx.close();
    img.removeAttribute('src');
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  });
  strip.addEventListener('click', (e) => {
    const b = e.target.closest('.lb-thumb');
    if (b) show(Number(b.dataset.i));
  });

  let sx = 0;
  let sy = 0;
  stage.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next(); else prev();
    }
  }, { passive: true });

  return { open, close, get isOpen() { return dialog.open; } };
}

/* ---------------- Projects ---------------- */

function cardTilt(card) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches || prefersReducedMotion()) return;
  // Rect is read once on enter and writes are batched per frame, so pointermove never forces layout.
  let rect = null;
  let x = 0;
  let y = 0;
  let queued = false;
  const flush = () => {
    queued = false;
    card.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
    card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
    card.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
  };
  card.addEventListener('pointerenter', () => { rect = card.getBoundingClientRect(); });
  card.addEventListener('pointermove', (e) => {
    if (!rect) rect = card.getBoundingClientRect();
    x = (e.clientX - rect.left) / rect.width - 0.5;
    y = (e.clientY - rect.top) / rect.height - 0.5;
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  });
  card.addEventListener('pointerleave', () => {
    rect = null;
    x = 0;
    y = 0;
    if (!queued) { queued = true; requestAnimationFrame(flush); }
  });
}

function dragScroll(el) {
  let down = false;
  let moved = false;
  let startX = 0;
  let startLeft = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true;
    moved = false;
    startX = e.clientX;
    startLeft = el.scrollLeft;
  });
  const endDrag = () => {
    if (!down) return;
    down = false;
    el.classList.remove('is-dragging');
    // The click (if any) fires right after pointerup; clear afterwards so a drag that ends elsewhere never eats the next click.
    setTimeout(() => { moved = false; }, 0);
  };
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (e.buttons === 0) { endDrag(); return; } // released outside the window
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > DRAG_THRESHOLD) {
      moved = true;
      el.classList.add('is-dragging');
    }
    if (moved) el.scrollLeft = startLeft - dx;
  });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('blur', endDrag);
  el.addEventListener('click', (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  }, true);
}

const EDGE = 2;

function renderProjects(lightbox, sfx) {
  const el = document.getElementById('projectCarousel');
  el.innerHTML = PROJECTS.map((p, i) => `
    <article class="card" data-project="${p.id}" style="--ci:${i}">
      <div class="card-media">${thumbImg(p.cover, p.title)}</div>
      <div class="card-glare" aria-hidden="true"></div>
      <div class="card-body">
        <span class="card-tag">${esc(p.tag)}</span>
        <h3 class="card-title"><button type="button" class="card-link" data-sfx="open" data-project="${p.id}">${esc(p.title)}</button></h3>
        <p class="card-line">${esc(p.line)}</p>
        <dl class="card-meta">
          <div><dt>When</dt><dd>${esc(p.date)}<br><span>${esc(p.time)}</span></dd></div>
          <div><dt>Where</dt><dd>${esc(p.place)}</dd></div>
        </dl>
        <span class="card-count">${p.images.length} ${p.images.length === 1 ? 'photo' : 'photos'}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
    </article>`).join('');

  el.querySelectorAll('.card').forEach(cardTilt);
  dragScroll(el);
  el.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const p = PROJECTS.find((x) => x.id === card.dataset.project);
    if (p) lightbox.open(p.images, 0, p.title);
  });

  const scrollByCard = (dir) => {
    const card = el.querySelector('.card');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 24;
    const amount = card ? card.getBoundingClientRect().width + gap : el.clientWidth * 0.8;
    el.scrollBy({ left: amount * dir, behavior: 'smooth' });
  };
  document.querySelectorAll('[data-carousel]').forEach((b) => {
    b.addEventListener('click', () => scrollByCard(b.dataset.carousel === 'next' ? 1 : -1));
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrollByCard(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrollByCard(-1); }
  });

  // Progress bar under the carousel.
  const bar = document.querySelector('.carousel-progress span');
  let barQueued = false;
  let atStart = true; // true while the carousel rests at its first card, so enter() can skip a needless reset
  const paintBar = () => {
    barQueued = false;
    const max = el.scrollWidth - el.clientWidth;
    atStart = el.scrollLeft <= EDGE;
    const ratio = max > EDGE ? el.scrollLeft / max : 1;
    if (bar) bar.style.transform = `scaleX(${Math.max(0.08, Math.min(1, ratio))})`;
  };
  el.addEventListener('scroll', () => {
    if (!barQueued) { barQueued = true; requestAnimationFrame(paintBar); }
  }, { passive: true });
  // No paint at boot: reading scrollWidth then forces a whole page layout. CSS seeds the bar at its
  // start value, and refresh() measures once the panel is hydrated.

  // Deck stepper: vertical scroll slides through the cards before the deck moves on.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let targetLeft = null;
  let clearTarget = 0;
  const cardStep = () => {
    const card = el.querySelector('.card');
    const gap = parseFloat(getComputedStyle(el).columnGap) || 24;
    return card ? card.getBoundingClientRect().width + gap : el.clientWidth * 0.8;
  };
  const position = () => (targetLeft ?? el.scrollLeft);
  return {
    refresh() { if (!barQueued) { barQueued = true; requestAnimationFrame(paintBar); } },
    canStep(dir) {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= EDGE) return false;
      const pos = position();
      return dir > 0 ? pos < max - EDGE : pos > EDGE;
    },
    step(dir) {
      const max = el.scrollWidth - el.clientWidth;
      const amount = cardStep();
      let next = Math.round((position() + amount * dir) / amount) * amount;
      if (max - next < amount * 0.5) next = max;
      targetLeft = Math.max(0, Math.min(max, next));
      el.scrollTo({ left: targetLeft, behavior: reduced ? 'auto' : 'smooth' });
      clearTimeout(clearTarget);
      clearTarget = setTimeout(() => { targetLeft = null; }, 700);
      sfx.hover();
    },
    enter(dir) {
      targetLeft = null;
      // A scroll write forces style and layout, so only reset when the position actually changes.
      if (dir !== 'prev' && atStart) return;
      el.scrollTo({ left: dir === 'prev' ? el.scrollWidth : 0, behavior: 'auto' });
    },
  };
}

/* ---------------- Events ---------------- */

function renderEvents(lightbox, sfx) {
  const list = document.getElementById('eventTimeline');
  const preview = document.getElementById('eventPreview');
  const frame = preview.querySelector('.ep-frame');
  const dateEl = preview.querySelector('.ep-date');
  const titleEl = preview.querySelector('.ep-title');
  const openBtn = preview.querySelector('.ep-open');
  openBtn.dataset.sfx = 'open';
  let active = null;
  let previewReady = false;

  list.innerHTML = EVENTS.map((ev, i) => `
    <li class="tl-item" data-reveal style="--d:${i + 3}">
      <button type="button" class="tl-btn" data-event="${ev.id}" data-sfx="open">
        <span class="tl-date"><b>${esc(ev.day)}</b><small>${esc(ev.month)}</small></span>
        <span class="tl-body">
          <span class="tl-title">${esc(ev.title)}</span>
          <span class="tl-place">${esc(ev.date)}. ${esc(ev.place)}</span>
          <span class="tl-line">${esc(ev.line)}</span>
        </span>
        <span class="tl-thumb">${thumbImg(ev.cover, '')}</span>
      </button>
    </li>`).join('');

  function setPreview(ev) {
    if (!ev || ev === active) return;
    active = ev;
    list.querySelectorAll('.tl-btn').forEach((b) => b.classList.toggle('is-current', b.dataset.event === ev.id));
    dateEl.textContent = ev.date;
    titleEl.textContent = ev.title;
    openBtn.textContent = `View ${ev.images.length} photos`;
    if (!previewReady) return;
    // Responsive source: thumbs for the preview, full size images stay lightbox only on phones and small panes.
    const [w, h] = thumbDims(ev.cover);
    const im = document.createElement('img');
    im.width = w;
    im.height = h;
    im.alt = ev.title;
    im.decoding = 'async';
    im.sizes = '40vw';
    im.srcset = `${thumbSrc(ev.cover)} 640w, ${fullSrc(ev.cover)} 1920w`;
    im.onload = () => {
      im.classList.add('is-in');
      const old = frame.querySelectorAll('img:not(:last-child)');
      setTimeout(() => old.forEach((o) => o.remove()), 900);
    };
    im.onerror = () => im.remove();
    im.src = thumbSrc(ev.cover);
    frame.appendChild(im);
  }

  const findEvent = (target) => {
    const b = target.closest('.tl-btn');
    return b ? EVENTS.find((x) => x.id === b.dataset.event) : null;
  };
  // Hover preview follows real pointer movement only. pointerover also fires when content moves
  // under a resting cursor (panel entrance, list scroll), which would override wheel and arrow steps.
  // Taps are handled by focusin and click.
  list.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || (e.movementX === 0 && e.movementY === 0)) return;
    list.classList.remove('no-hover');
    setPreview(findEvent(e.target));
  }, { passive: true });
  list.addEventListener('focusin', (e) => setPreview(findEvent(e.target)));
  list.addEventListener('click', (e) => {
    const ev = findEvent(e.target);
    if (ev) lightbox.open(ev.images, 0, ev.title);
  });
  openBtn.addEventListener('click', () => { if (active) lightbox.open(active.images, 0, active.title); });

  return {
    hydrate() {
      if (previewReady) return;
      previewReady = true;
      const first = active || EVENTS[0];
      active = null;
      setPreview(first);
    },
    init() { setPreview(EVENTS[0]); },
    // Deck stepper: vertical scroll walks through every event before the deck moves on.
    canStep(dir) {
      const i = EVENTS.indexOf(active);
      return i + dir >= 0 && i + dir < EVENTS.length;
    },
    step(dir) {
      const i = EVENTS.indexOf(active) + dir;
      if (i < 0 || i >= EVENTS.length) return;
      setPreview(EVENTS[i]);
      list.classList.add('no-hover');
      const btn = list.querySelector(`.tl-btn[data-event="${EVENTS[i].id}"]`);
      if (btn) btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      sfx.hover();
    },
    enter(dir) {
      setPreview(dir === 'prev' ? EVENTS[EVENTS.length - 1] : EVENTS[0]);
    },
  };
}

/* ---------------- Gallery ---------------- */

const GALLERY_STAGGER_CAP = 18;

function createGallery(lightbox) {
  const filtersEl = document.getElementById('galleryFilters');
  const grid = document.getElementById('galleryGrid');
  const scroller = document.getElementById('galleryScroll');
  const all = GALLERY_ORDER.flatMap((g) => groupKeys(g)).filter((k) => !EXCLUDED.has(k));
  let filter = 'all';
  let current = all;
  let rendered = false;

  const groups = [['all', 'All', all.length]].concat(
    GALLERY_ORDER.map((g) => [g, GROUP_LABELS[g], groupKeys(g).filter((k) => !EXCLUDED.has(k)).length]),
  );
  filtersEl.innerHTML = groups.map(([id, label, n]) => `
    <button type="button" class="filter${id === 'all' ? ' is-active' : ''}"
      aria-pressed="${id === 'all'}" data-filter="${id}">${esc(label)} <small>${n}</small></button>`).join('');

  function render() {
    current = filter === 'all' ? all : all.filter((k) => groupOf(k) === filter);
    grid.innerHTML = current.map((k, i) => {
      const label = GROUP_LABELS[groupOf(k)] || '';
      return `<button type="button" class="g-item" data-i="${i}" data-sfx="open" style="--gi:${Math.min(i, 18)}"
        aria-label="Open ${esc(label)} photo ${i + 1} of ${current.length}">${thumbImg(k, label, '', 'src').replace('<img ', '<img loading="lazy" ')}</button>`;
    }).join('');
    grid.querySelectorAll('img').forEach((im) => {
      if (im.complete) im.classList.add('is-loaded');
      else im.addEventListener('load', () => im.classList.add('is-loaded'), { once: true });
    });
    scroller.scrollTop = 0;
    rendered = true;
    markInView();
  }

  // Only the tiles inside the first screen get the staggered entrance; the rest are below the fold.
  // Animating all of them started almost 90 animations at once under the section wipe.
  let io = null;
  function markInView() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window)) {
      grid.querySelectorAll('.g-item').forEach((b) => b.classList.add('g-vis'));
      return;
    }
    io = new IntersectionObserver((entries) => {
      let k = 0;
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('g-vis');
        en.target.style.setProperty('--gi', String(Math.min(k, GALLERY_STAGGER_CAP)));
        k += 1;
      });
      io.disconnect();
      io = null;
    }, { root: scroller });
    grid.querySelectorAll('.g-item').forEach((b) => io.observe(b));
  }

  filtersEl.addEventListener('click', (e) => {
    const b = e.target.closest('.filter');
    if (!b || b.dataset.filter === filter) return;
    filter = b.dataset.filter;
    // Filter changes happen on a visible panel: no need to wait for the section wipe.
    grid.style.setProperty('--g-base', '0ms');
    filtersEl.querySelectorAll('.filter').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-pressed', String(on));
    });
    render();
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.g-item');
    if (!b) return;
    const label = filter === 'all' ? 'Gallery' : GROUP_LABELS[filter];
    lightbox.open(current, Number(b.dataset.i), label);
  });

  return { hydrate() { if (!rendered) render(); } };
}

/* ---------------- Public API ---------------- */

function hydrateImages(panel) {
  panel.querySelectorAll('img[data-src]').forEach((im) => {
    im.addEventListener('load', () => im.classList.add('is-loaded'), { once: true });
    im.src = im.dataset.src;
    im.removeAttribute('data-src');
  });
}

/**
 * Renders all dynamic content and returns hooks for lazy hydration.
 * @param {{ sfx: object }} deps
 */
export function initContent({ sfx }) {
  const chips = document.getElementById('focusChips');
  chips.innerHTML = FOCUS_AREAS.map((f) => `<li class="chip">${esc(f)}</li>`).join('');

  const lightbox = createLightbox(sfx);
  const projects = renderProjects(lightbox, sfx);
  const events = renderEvents(lightbox, sfx);
  events.init();
  const gallery = createGallery(lightbox);
  const hydrated = new Set();

  return {
    lightbox,
    /** Per panel steppers used by the deck: scroll moves through items before changing section. */
    steppers: { projects, events },
    /** Load images for a panel the first time it becomes active or adjacent. */
    hydrate(panelId) {
      if (hydrated.has(panelId)) return;
      hydrated.add(panelId);
      const panel = document.getElementById(panelId);
      if (!panel) return;
      if (panelId === 'gallery') gallery.hydrate();
      if (panelId === 'events') events.hydrate();
      if (panelId === 'projects') projects.refresh();
      hydrateImages(panel);
    },
  };
}
