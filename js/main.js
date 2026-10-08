/**
 * Vava Spices — bootstrap.
 *
 * Builds the product panel and switcher from the catalogue, hands the 3D stage
 * a scroll narrative, and wires the interface layer.
 */

import { CATALOG, byId } from './spices.js';
import { createStage } from './scene.js';
import {
  createOverlays,
  createMobileNav,
  createScrollSpy,
  createBasket,
  createChat,
  initReveal,
  initCounters,
  initEnquiryForm,
  initAuthForm,
  initSwipe,
  initPriceEditor,
  initContactEditor,
  toast,
  inr,
  $,
  $$,
} from './ui.js';
import { clamp, lerp, prefersReducedMotion } from './lib.js';

const SECTIONS = ['hero', 'story', 'origins', 'collection', 'process', 'standards', 'leadership', 'contact'];

for (const id of SECTIONS) {
  const el = document.getElementById(id);
  if (el) el.dataset.label = el.dataset.section;
}

/* ======================================================================== */
/*  Product panel                                                           */
/* ======================================================================== */

const panel = {
  root: $('#pinfo'),
  latin: $('#pLatin'),
  name: $('#pName'),
  stars: $('#pStars'),
  reviews: $('#pReviews'),
  specs: $('#pSpecs'),
  meters: $('#pMeters'),
  blurb: $('#pBlurb'),
  notes: $('#pNotes'),
  price: $('#pPrice'),
  unit: $('#pUnit'),
};

const STAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8L12 2Z"/></svg>';

function renderPanel(product) {
  panel.latin.textContent = product.latin;
  panel.name.textContent = product.name;

  // Deterministic but varied review scores so the row is not decorative noise.
  const score = 4 + (product.name.length % 2);
  panel.stars.innerHTML = Array.from({ length: 5 }, (_, i) =>
    STAR_SVG.replace('<svg', `<svg class="${i < score ? '' : 'is-empty'}"`),
  ).join('');
  panel.reviews.textContent = 'Reviews';

  panel.specs.innerHTML = product.specs
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join('');

  panel.meters.innerHTML = product.meters
    .map(
      ([label, value]) => `
        <div class="meter">
          <span class="meter__label">${label}</span>
          <span class="meter__track"><i class="meter__fill" data-value="${value}"></i></span>
        </div>`,
    )
    .join('');

  panel.blurb.textContent = product.blurb;
  panel.notes.innerHTML = product.notes.map((n) => `<li>${n}</li>`).join('');
  panel.price.textContent = inr(product.price);
  panel.unit.textContent = product.unit;

  // Animate the flavour meters up from zero. The new elements already render
  // at width 0 from the stylesheet; committing that state with a reflow and
  // then setting the target width makes the transition restart every time,
  // without depending on when the next animation frame lands.
  void panel.meters.offsetWidth;
  $$('.meter__fill', panel.meters).forEach((el) => {
    el.style.width = `${el.dataset.value}%`;
  });
}

/* ======================================================================== */
/*  Switcher + carousel                                                     */
/* ======================================================================== */

const thumbs = {};
let activeId = CATALOG[0].id;
let stage = null;

const switcherHost = $('#switcher');
const dotsHost = $('#carouselDots');

function buildSwitcher() {
  switcherHost.innerHTML = CATALOG.map(
    (p) => `
      <button class="pill" type="button" role="tab" data-id="${p.id}"
              aria-selected="${p.id === activeId}">
        <span class="pill__dot" style="--dot:${p.accent}"></span>
        <span class="pill__label">${p.name}</span>
      </button>`,
  ).join('');

  dotsHost.innerHTML = CATALOG.map(
    (p) => `<button type="button" data-id="${p.id}" aria-label="Show ${p.name}"></button>`,
  ).join('');
}

function buildThumbSlots() {
  $$('.pill', switcherHost).forEach((pill) => {
    const id = pill.dataset.id;
    const img = document.createElement('img');
    img.className = 'pill__thumb';
    img.alt = '';
    img.width = 30;
    img.height = 22;
    img.hidden = true;
    pill.appendChild(img);
  });
}

function markActive(id) {
  activeId = id;
  $$('.pill', switcherHost).forEach((b) => {
    const on = b.dataset.id === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $$('button', dotsHost).forEach((b) => b.classList.toggle('is-active', b.dataset.id === id));
}

let swapTimer = 0;
function selectProduct(id, { fromScroll = false } = {}) {
  if (!CATALOG.some((p) => p.id === id) || id === activeId) return;
  markActive(id);
  stage?.showProduct(id);

  // Fade the copy out, swap the text, fade it back in.
  panel.root.classList.add('is-swapping');
  clearTimeout(swapTimer);
  swapTimer = window.setTimeout(() => {
    renderPanel(byId(id));
    panel.root.classList.remove('is-swapping');
  }, prefersReducedMotion() ? 0 : 260);

  if (!fromScroll) {
    $('#collection')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }
}

const step = (dir) => {
  const i = CATALOG.findIndex((p) => p.id === activeId);
  const next = CATALOG[(i + dir + CATALOG.length) % CATALOG.length];
  selectProduct(next.id, { fromScroll: true });
};

switcherHost?.addEventListener('click', (e) => {
  const btn = e.target.closest('.pill');
  if (btn) selectProduct(btn.dataset.id);
});

dotsHost?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (btn) selectProduct(btn.dataset.id, { fromScroll: true });
});

$('#nextBtn')?.addEventListener('click', () => step(1));
$('#prevBtn')?.addEventListener('click', () => step(-1));
$('#pNext')?.addEventListener('click', () => step(1));

/* ======================================================================== */
/*  Interest chips in the enquiry form                                      */
/* ======================================================================== */

$('#fSpice') && ($('#fSpice').innerHTML = CATALOG.map(
  (p) => `<button type="button" class="chip" data-spice="${p.name}">${p.name}</button>`,
).join(''));

$('#fSpice')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const on = chip.classList.toggle('is-on');
  chip.setAttribute('aria-pressed', String(on));
});

/* ======================================================================== */
/*  Scroll narrative                                                        */
/* ======================================================================== */

/**
 * Map scroll position onto the 3D stage. Each section gets a "dim" weight —
 * how far the stage should recede behind the copy — and the collection gets
 * its own progress so the camera dollies in while it is on screen.
 */
function measureScroll() {
  const vh = window.innerHeight;
  const y = window.scrollY;

  const rectOf = (id) => {
    const el = document.getElementById(id);
    return el ? el.getBoundingClientRect() : null;
  };

  const collection = rectOf('collection');
  const story = rectOf('story');

  // 0 when the collection is off screen, 1 when it fills the viewport.
  let collectionT = 0;
  if (collection) {
    const start = vh * 0.95;
    const end = -collection.height + vh * 0.15;
    collectionT = clamp((start - collection.top) / Math.max(1, start - end), 0, 1);
  }

  let storyT = 0;
  if (story) {
    storyT = clamp(1 - Math.abs(story.top) / vh, 0, 1);
  }

  // Text-heavy sections push the stage back.
  let dim = 0;
  for (const id of ['story', 'origins', 'process', 'standards', 'contact']) {
    const r = rectOf(id);
    if (!r) continue;
    // Fade in as the section approaches, out once it has passed.
    const overlap = clamp((vh - r.top) / (vh * 0.7), 0, 1) * clamp((r.bottom) / (vh * 0.7), 0, 1);
    dim = Math.max(dim, overlap);
  }
  // Never fully hide it — some presence is the point.
  dim *= 0.9;

  return {
    y,
    progress: y / Math.max(1, document.body.scrollHeight - vh),
    collection: collectionT,
    story: storyT,
    dim,
  };
}

/* ======================================================================== */
/*  Boot                                                                    */
/* ======================================================================== */  const preloader = $('#preloader');
const preloaderBar = $('#preloaderBar');
const preloaderStatus = $('#preloaderStatus');
const body = document.body;

let progress = 0;
const STATUSES = [
  'Grading the harvest',
  'Sorting by size',
  'Checking moisture',
  'Packing whole',
];
let statusAt = 0;

function setProgress(p) {
  progress = clamp(p, 0, 1);
  if (preloaderBar) preloaderBar.style.width = `${Math.round(8 + progress * 92)}%`;
  const want = Math.min(STATUSES.length - 1, Math.floor(progress * STATUSES.length));
  if (want !== statusAt) {
    statusAt = want;
    if (preloaderStatus) preloaderStatus.textContent = STATUSES[want];
  }
}

function finishLoading() {
  setProgress(1);
  preloader?.classList.add('is-done');
  body.classList.remove('is-loading');
  window.setTimeout(() => preloader?.remove(), 1000);
  // Hero copy can fade in once the curtain is lifting.
  window.setTimeout(() => $$('.hero [data-reveal]').forEach((el) => el.classList.add('is-in')), 260);
}

function failGracefully(message, err) {
  // A dead WebGL context should not leave the user staring at a black page.
  document.querySelector('.stage')?.classList.add('is-fallback');
  body.classList.remove('is-loading');
  preloader?.classList.add('is-done');
  preloader?.remove();
  console.warn('[vava]', message, err || '');
}

async function boot() {
  setProgress(0.06);

  buildSwitcher();
  buildThumbSlots();
  renderPanel(CATALOG[0]);
  markActive(activeId);

  initReveal();
  initCounters();
  initEnquiryForm();
  initAuthForm();
  initPriceEditor();
  initContactEditor();

  const overlays = createOverlays();
  createMobileNav();
  createChat();

  const basket = createBasket(CATALOG);

  // Scroll measurement is shared: the stage consumes it every frame and the
  // scroll spy just marks it stale.
  let queued = { y: 0, progress: 0, collection: 0, story: 0, dim: 0 };
  const pushScroll = () => {
    queued = measureScroll();
  };

  $('#pAdd')?.addEventListener('click', () => {
    const product = byId(activeId);
    basket.add(product.id, 1);
    toast(`${product.name} added to your enquiry`);
    overlays.open(document.getElementById('cartDrawer'));
  });

  $('#cartSend')?.addEventListener('click', () => {
    if (!basket.count) {
      toast('Add a spice first');
      return;
    }
    const list = basket.items
      .map((i) => `${byId(i.id).name} × ${i.qty}`)
      .join(', ');
    document.getElementById('fMessage').value = `Please quote for: ${list}.`;
    overlays.close();
    window.setTimeout(() => {
      $('#contact')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }, 420);
  });

  // --- 3D stage ------------------------------------------------------
  setProgress(0.2);
  const canvas = $('#scene');
  let stageReady = false;

  try {
    stage = createStage({
      canvas,
      products: CATALOG,
      initialId: activeId,
      onReady: () => {
        stageReady = true;
        setProgress(0.8);
      },
    });
  } catch (err) {
    failGracefully('3D stage failed to start', err);
    stage = null;
  }

  if (stage) {
    // Scroll drives the camera; the reads are throttled to one per frame.
    queued = measureScroll();
    window.addEventListener('scroll', pushScroll, { passive: true });
    window.addEventListener('resize', pushScroll, { passive: true });
    stage.setScroll(queued);

    // Feed the freshest measurement to the render loop each frame.
    const loop = () => {
      stage.setScroll(queued);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    initSwipe($('#collection'), {
      onNext: () => step(1),
      onPrev: () => step(-1),
    });

    // Once the first frame is on screen, render the switcher thumbnails.
    stage.prime();

    // Retried on a schedule rather than fired once: on a slow first frame (or
    // a throttled one, e.g. a backgrounded tab) a single attempt would leave
    // the pills with no imagery at all.
    let thumbsTries = 0;
    const renderThumbs = () => {
      if (!stageReady || Object.keys(thumbs).length >= CATALOG.length) return;
      thumbsTries++;
      for (const product of CATALOG) {
        if (thumbs[product.id]) continue;
        const url = stage.thumbnail(product.id);
        if (!url) continue;
        thumbs[product.id] = url;
        const slot = $(`.pill[data-id="${product.id}"] .pill__thumb`);
        if (slot) {
          slot.src = url;
          slot.hidden = false;
        }
      }
      if (thumbsTries < 6 && Object.keys(thumbs).length < CATALOG.length) {
        window.setTimeout(renderThumbs, 900 * thumbsTries);
      }
    };
    window.setTimeout(renderThumbs, 700);
  }

  createScrollSpy(SECTIONS, { onScroll: () => pushScroll() });

  // Small handle for debugging and for driving the page from the console.
  // In-memory contact snapshot for the details editor. The contact block in
  // index.html is still static placeholder markup, so the editor edits this
  // snapshot and then refreshes the DOM from it.
  const contactDetails = [
    ['Company', $('#contactCompany')?.textContent ?? 'Vava Spices (P) Ltd'],
    ['Trading as', $('#contactTradingAs')?.textContent ?? 'Kollarmalil Spices since the 1980s'],
    ['Based in', $('#contactBasedIn')?.textContent ?? 'Kerala, India'],
    ['Email', $('#contactEmail')?.textContent ?? 'sales@vavaspices.example'],
    ['Phone', $('#contactPhone')?.textContent ?? '+91 00000 00000'],
  ];

  window.__vava = {
    get stage() {
      return stage;
    },
    get activeId() {
      return activeId;
    },
    basket,
    catalog: CATALOG,
    contactDetails,
    select: (id) => selectProduct(id, { fromScroll: true }),
    thumbs,
  };

  // Hold the curtain briefly so the entrance reads as intentional, but never
  // trap anyone on a slow connection.
  const minimum = new Promise((r) => window.setTimeout(r, prefersReducedMotion() ? 200 : 1700));
  const maxWait = new Promise((r) => window.setTimeout(r, 5200));

  let crept = 0;
  const creep = window.setInterval(() => {
    crept = Math.min(crept + 0.08, 0.9);
    if (!stageReady) setProgress(Math.max(progress, crept));
  }, 90);

  await Promise.race([Promise.all([minimum, stageReady ? Promise.resolve() : maxWait]), maxWait]);
  window.clearInterval(creep);
  finishLoading();

  $('#year').textContent = String(new Date().getFullYear());
}

window.addEventListener('error', (e) => {
  if (String(e.message || '').includes('WebGL')) failGracefully(e.message);
});

boot();
