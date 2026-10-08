/**
 * Interface layer: navigation, drawers, the enquiry basket, the chat widget,
 * scroll reveals, counters and form validation.
 *
 * Kept free of Three.js so it can be reasoned about (and reused) on its own.
 */

import { clamp, lerp, prefersReducedMotion } from './lib.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ======================================================================== */
/*  Small shared helpers                                                    */
/* ======================================================================== */

let toastTimer = 0;
export function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-up'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove('is-up');
    window.setTimeout(() => {
      el.hidden = true;
    }, 450);
  }, 2800);
}

export const inr = (n) =>
  '₹' + Math.round(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });

/** Trap Tab focus inside a container while it is open. */
function trapFocus(container, e) {
  const focusables = $$(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    container,
  ).filter((el) => el.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/* ======================================================================== */
/*  Overlays: drawers, mobile nav, chat                                     */
/* ======================================================================== */

export function createOverlays() {
  const scrim = $('#scrim');
  let openPanel = null;
  let lastFocus = null;

  function open(panel) {
    if (openPanel === panel) return;
    close();
    lastFocus = document.activeElement;
    panel.hidden = false;
    scrim.hidden = false;
    // Force a reflow so the transform transition actually runs.
    void panel.offsetWidth;
    panel.classList.add('is-open');
    scrim.classList.add('is-open');
    document.body.classList.add('no-scroll');
    openPanel = panel;
    panel.querySelector('button, input, a, textarea')?.focus();
  }

  function close() {
    if (!openPanel) return;
    const panel = openPanel;
    openPanel = null;
    panel.classList.remove('is-open');
    scrim.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    window.setTimeout(() => {
      panel.hidden = true;
      scrim.hidden = true;
    }, 480);
    lastFocus?.focus?.();
  }

  scrim.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab' && openPanel) trapFocus(openPanel, e);
  });

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      e.preventDefault();
      const panel = document.getElementById(
        opener.dataset.open === 'cart' ? 'cartDrawer' : `${opener.dataset.open}Drawer`,
      );
      if (panel) open(panel);
      return;
    }
    if (e.target.closest('[data-close]')) {
      e.preventDefault();
      close();
    }
  });

  return { open, close, get isOpen() { return Boolean(openPanel); } };
}

export function createMobileNav() {
  const burger = $('#burger');
  const nav = $('#mobileNav');
  if (!burger || !nav) return { close() {} };
  let open = false;

  function set(next) {
    if (next === open) return;
    open = next;
    if (next) {
      nav.hidden = false;
      requestAnimationFrame(() => nav.classList.add('is-open'));
      document.body.classList.add('no-scroll');
    } else {
      nav.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
      window.setTimeout(() => {
        if (!open) nav.hidden = true;
      }, 450);
    }
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  burger.addEventListener('click', () => set(!open));
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) set(false);
  });

  return { close: () => set(false), toggle: () => set(!open) };
}

/* ======================================================================== */
/*  Header state + scroll spy                                               */
/* ======================================================================== */

export function createScrollSpy(sectionIds, { onSection, onScroll } = {}) {
  const header = $('#header');
  const navLinks = $$('.nav__link');
  const dotHost = $('#dots');
  let current = '';

  // Build the side dots once.
  if (dotHost) {
    dotHost.innerHTML = sectionIds
      .map((id) => {
        const label = document.getElementById(id)?.dataset.label || id;
        return `<button type="button" data-target="${id}"><span>${label}</span></button>`;
      })
      .join('');
    dotHost.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-target]');
      if (btn) document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: 'smooth' });
    });
  }

  function setCurrent(id) {
    if (id === current) return;
    current = id;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
    $$('#dots button').forEach((b) => b.classList.toggle('is-active', b.dataset.target === id));
    onSection?.(id);
  }

  let ticking = false;
  function read() {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;

    header?.classList.toggle('is-stuck', y > 40);

    // The active section is whichever one covers the middle of the viewport.
    let active = sectionIds[0];
    let best = Infinity;
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const centre = el.offsetTop + el.offsetHeight / 2 - vh * 0.42;
      const d = Math.abs(centre - y);
      if (d < best) {
        best = d;
        active = id;
      }
    }
    setCurrent(active);
    onScroll?.({ y, progress: y / Math.max(1, document.body.scrollHeight - vh) });
  }

  function onScrollEvent() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(read);
  }

  window.addEventListener('scroll', onScrollEvent, { passive: true });
  window.addEventListener('resize', onScrollEvent, { passive: true });
  read();

  return { setCurrent, get current() { return current; } };
}

/* ======================================================================== */
/*  Reveal on scroll + animated counters                                    */
/* ======================================================================== */

export function initReveal() {
  const items = $$('[data-reveal]');
  if (prefersReducedMotion()) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        // Stagger siblings so grids cascade instead of popping as one block.
        const siblings = $$('[data-reveal]', el.parentElement).filter((n) => n.parentElement === el.parentElement);
        const idx = Math.max(0, siblings.indexOf(el));
        el.style.transitionDelay = `${Math.min(idx, 7) * 90}ms`;
        el.classList.add('is-in');
        io.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );

  items.forEach((el) => io.observe(el));
  return io;
}

export function initCounters() {
  const nodes = $$('[data-count]');
  if (!nodes.length) return;

  const run = (el) => {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix ?? '';
    if (el.dataset.plain) {
      // Years must not pick up thousands separators ("2,015").
      el.textContent = String(target);
      return;
    }
    const duration = 1500;
    const start = performance.now();
    const step = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      // easeOutExpo
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      el.textContent = Math.round(target * eased) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        run(entry.target);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.4 },
  );
  nodes.forEach((n) => io.observe(n));
}

/* ======================================================================== */
/*  Enquiry basket                                                          */
/* ======================================================================== */

const STORE_KEY = 'vava.enquiry.v1';

export function createBasket(products, { thumbs = {} } = {}) {
  const itemsHost = $('#cartItems');
  const countEl = $('#cartCount');
  const totalEl = $('#cartTotal');

  let items = load();

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      // Drop anything that is no longer in the catalogue.
      return raw.filter((i) => products.some((p) => p.id === i.id));
    } catch {
      return [];
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(items));
    } catch {
      /* private mode — the basket simply will not persist */
    }
  }

  function add(id, qty = 1) {
    const found = items.find((i) => i.id === id);
    if (found) found.qty += qty;
    else items.push({ id, qty });
    save();
    render();
  }

  function setQty(id, qty) {
    const found = items.find((i) => i.id === id);
    if (!found) return;
    if (qty <= 0) items = items.filter((i) => i.id !== id);
    else found.qty = Math.min(qty, 999);
    save();
    render();
  }

  function total() {
    return items.reduce((sum, i) => {
      const p = products.find((x) => x.id === i.id);
      return sum + (p ? p.price * i.qty : 0);
    }, 0);
  }

  function render() {
    if (!itemsHost) return;

    const count = items.reduce((s, i) => s + i.qty, 0);
    if (countEl) {
      countEl.textContent = String(count);
      countEl.dataset.empty = String(count === 0);
    }
    if (totalEl) totalEl.textContent = inr(total());

    if (!items.length) {
      itemsHost.innerHTML = `
        <div class="empty">
          <svg viewBox="0 0 24 24" stroke-linejoin="round">
            <path d="M16 11V7a4 4 0 0 0-8 0v4" fill="none" stroke-width="1.4"/>
            <path d="M5 9h14l1 12H4L5 9Z" fill="none" stroke-width="1.4"/>
          </svg>
          <p>Your enquiry is empty.<br />Add a spice to get a current lot price.</p>
        </div>`;
      return;
    }

    itemsHost.innerHTML = items
      .map((item) => {
        const p = products.find((x) => x.id === item.id);
        if (!p) return '';
        const thumb = thumbs[p.id];
        return `
          <div class="lineitem">
            ${
              thumb
                ? `<img class="lineitem__thumb" src="${thumb}" alt="" width="54" height="42" />`
                : '<span class="lineitem__thumb" aria-hidden="true"></span>'
            }
            <div>
              <span class="lineitem__name">${p.name}</span>
              <span class="lineitem__meta">${p.origin} · ${p.grade} · ${inr(p.price)}/${p.unit.replace('per ', '')}</span>
              <div class="lineitem__qty">
                <button type="button" data-dec="${p.id}" aria-label="Remove one ${p.name}">−</button>
                <span>${item.qty}</span>
                <button type="button" data-inc="${p.id}" aria-label="Add one ${p.name}">+</button>
              </div>
            </div>
            <span class="lineitem__price">${inr(p.price * item.qty)}</span>
          </div>`;
      })
      .join('');
  }

  itemsHost?.addEventListener('click', (e) => {
    const inc = e.target.closest('[data-inc]');
    const dec = e.target.closest('[data-dec]');
    if (inc) setQty(inc.dataset.inc, (items.find((i) => i.id === inc.dataset.inc)?.qty || 0) + 1);
    if (dec) setQty(dec.dataset.dec, (items.find((i) => i.id === dec.dataset.dec)?.qty || 0) - 1);
  });

  render();

  return {
    add,
    setQty,
    total,
    get count() {
      return items.reduce((s, i) => s + i.qty, 0);
    },
    get items() {
      return items.map((i) => ({ ...i }));
    },
  };
}

/* ======================================================================== */
/*  Chat widget (scripted demo)                                              */
/* ======================================================================== */

export function createChat() {
  const fab = $('#chatFab');
  const panel = $('#chat');
  const log = $('#chatLog');
  const quick = $('#chatQuick');
  if (!fab || !panel) return;

  const questions = [
    'What is your minimum order?',
    'Do you ship outside Kerala?',
    'Can you supply 8mm cardamom?',
    'How do I get current prices?',
  ];
  const answers = [
    'One kilogram minimum for whole spices, and we can quote pallet volumes for trade orders.',
    'Yes — we ship across India by courier and by freight. Export documentation can be provided on request.',
    'Yes. 8mm bold from the current Idukki season is our standard cardamom grade. Tell us the annual volume.',
    'Use the enquiry form on this page and pick the spices you need. We reply with the current lot price.',
  ];
  let answerAt = 0;

  function say(text, who) {
    const b = document.createElement('div');
    b.className = `bubble bubble--${who}`;
    b.textContent = text;
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
  }

  function openChat() {
    panel.hidden = false;
    fab.classList.add('is-hidden');
    if (!log.children.length) {
      say('Namaskara. You are speaking with the sourcing desk at Vava Spices.', 'bot');
      say('Ask about grades, minimums or sourcing.', 'bot');
    }
    quick.innerHTML = questions
      .map((q, i) => `<button type="button" data-q="${i}">${q}</button>`)
      .join('');
  }

  function closeChat() {
    panel.hidden = true;
    fab.classList.remove('is-hidden');
  }

  fab.addEventListener('click', openChat);
  $('#chatClose')?.addEventListener('click', closeChat);

  quick.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-q]');
    if (!btn) return;
    say(questions[Number(btn.dataset.q)], 'me');
    quick.innerHTML = '';
    const reply = answers[answerAt % answers.length];
    answerAt++;
    window.setTimeout(() => say(reply, 'bot'), 620);
  });

  // The demo chat needs an enquiry route once it closes.
  return { open: openChat, close: closeChat };
}

/* ======================================================================== */
/*  Forms                                                                   */
/* ======================================================================== */

function setFieldError(input, message) {
  const field = input.closest('.field');
  const slot = field?.querySelector('.field__error');
  field?.classList.toggle('has-error', Boolean(message));
  if (slot) slot.textContent = message || '';
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

export function validate(form, rules) {
  let firstBad = null;
  for (const [name, check] of Object.entries(rules)) {
    const input = form.elements[name];
    if (!input) continue;
    const problem = check(input.value.trim(), form);
    setFieldError(input, problem);
    if (problem && !firstBad) firstBad = input;
  }
  firstBad?.focus();
  return !firstBad;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function initEnquiryForm() {
  const form = $('#enquiryForm');
  if (!form) return;
  const status = $('#formStatus');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.classList.remove('is-error');
    const ok = validate(form, {
      name: (v) => (v.length >= 2 ? '' : 'Please tell us your name.'),
      email: (v) => (EMAIL.test(v) ? '' : 'Please enter a valid email address.'),
      company: () => '',
      message: (v) => (v.length >= 10 ? '' : 'A little more detail helps us quote accurately.'),
    });

    if (!ok) {
      status.textContent = 'Please fix the highlighted fields.';
      status.classList.add('is-error');
      return;
    }

    const data = new FormData(form);
    const picked = $$('#fSpice .chip.is-on').map((c) => c.dataset.spice);
    status.textContent =
      `Thank you${data.get('name') ? ', ' + data.get('name') : ''}. ` +
      `Your enquiry for ${picked.length ? picked.join(', ') : 'our spices'} is ready to send — ` +
      'this sample form does not submit anywhere yet.';
    toast('Enquiry prepared');
  });

  // Clear a field's error as soon as it is corrected.
  form.addEventListener('input', (e) => {
    if (e.target.closest('.field.has-error')) setFieldError(e.target, '');
  });
}

export function initAuthForm() {
  const form = $('#authForm');
  if (!form) return;
  const status = $('#authStatus');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.classList.remove('is-error');
    const ok = validate(form, {
      aEmail: (v) => (EMAIL.test(v) ? '' : 'Enter a valid email.'),
      aPass: (v) => (v.length >= 6 ? '' : 'Passwords are at least 6 characters.'),
    });
    status.textContent = ok
      ? 'This is a front-end sample — no accounts are created and nothing is sent.'
      : 'Please check the fields above.';
    if (!ok) status.classList.add('is-error');
  });
}

/* ======================================================================== */
/*  Mobile / desktop carousel keyboard support                              */
/* ======================================================================== */

export function initSwipe(host, { onNext, onPrev }) {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  host.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true },
  );

  host.addEventListener(
    'touchend',
    (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Ignore mostly-vertical gestures so scrolling still feels natural.
      if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      dx < 0 ? onNext() : onPrev();
    },
    { passive: true },
  );

  host.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onPrev();
    }
  });
}

export { $ , $$ };

/* ======================================================================== */
/*  Details editor (in-memory, page session only)                           */
/* ======================================================================== */

/**
 * Open or close the contact details editor.
 *
 * This is intentionally in-memory: it edits a snapshot that the page keeps in
 * memory and then refreshes the contact block from it. There is no server
 * write in this version.
 */
export function initContactEditor() {
  const openBtn = $('#contactEdit');
  const panel = $('#contactEditorPanel');
  const saveBtn = $('#contactSave');
  const cancelBtn = $('#contactCancel');

  if (!openBtn || !panel || !saveBtn || !cancelBtn) return;

  // Pull fresh values from the live DOM each time the editor opens, so the
  // editor always starts from what is currently shown.
  function fillFromDOM() {
    $('#fContactCompany').value = $('#contactCompany')?.textContent ?? '';
    $('#fContactTradingAs').value = $('#contactTradingAs')?.textContent ?? '';
    $('#fContactBasedIn').value = $('#contactBasedIn')?.textContent ?? '';
    $('#fContactEmail').value = $('#contactEmail')?.textContent ?? '';
    $('#fContactPhone').value = $('#contactPhone')?.textContent ?? '';
  }

  function open() {
    fillFromDOM();
    panel.hidden = false;
    openBtn.hidden = true;
    // Focus the first field so keyboard users land inside the form.
    window.setTimeout(() => $('#fContactCompany')?.focus(), 0);
  }

  function close() {
    panel.hidden = true;
    openBtn.hidden = false;
  }

  openBtn.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  cancelBtn.addEventListener('click', close);

  saveBtn.addEventListener('click', () => {
    const company = $('#fContactCompany').value.trim();
    const tradingAs = $('#fContactTradingAs').value.trim();
    const basedIn = $('#fContactBasedIn').value.trim();
    const email = $('#fContactEmail').value.trim();
    const phone = $('#fContactPhone').value.trim();

    // Nothing to save if every field is unchanged from the existing values.
    if (
      company === $('#contactCompany')?.textContent &&
      tradingAs === $('#contactTradingAs')?.textContent &&
      basedIn === $('#contactBasedIn')?.textContent &&
      email === $('#contactEmail')?.textContent &&
      phone === $('#contactPhone')?.textContent
    ) {
      close();
      return;
    }

    const target = window.__vava?.contactDetails;
    if (!target) {
      toast('Details editor isn\'t wired in on this page yet.');
      return;
    }

    // Update the in-memory snapshot.
    target[0][1] = company || target[0][1];
    target[1][1] = tradingAs || target[1][1];
    target[2][1] = basedIn || target[2][1];
    target[3][1] = email || target[3][1];
    target[4][1] = phone || target[4][1];

    // Refresh the live contact block from the same snapshot.
    $('#contactCompany').textContent = target[0][1];
    $('#contactTradingAs').textContent = target[1][1];
    $('#contactBasedIn').textContent = target[2][1];
    $('#contactEmail').textContent = target[3][1];
    $('#contactPhone').textContent = target[4][1];

    close();
    toast('Contact details updated for this session.');
  });
}

/**
 * Refresh the price/editor-safe product panel fields for the current product.
 *
 * This is the hook the price editor uses: it reads the active catalog entry,
 * formats the price, and updates the price block without re-rendering the rest
 * of the panel.
 */
export function refreshPricePanel() {
  const activeId = window.__vava?.activeId;
  if (!activeId) return;

  const product = window.__vava?.catalog?.find((p) => p.id === activeId);
  if (!product) return;

  const priceEl = $('#pPrice');
  const unitEl = $('#pUnit');
  if (!priceEl || !unitEl) return;

  priceEl.textContent = inr(product.price);
  unitEl.textContent = product.unit;
}

/**
 * Open or close the active-product price editor.
 *
 * Kept deliberately narrow for this demo: edit the price, optionally the unit,
 * cancel or save back into the catalog in memory.
 */
export function initPriceEditor() {
  const openBtn = $('#priceEdit');
  const panel = $('#priceEditorPanel');
  const saveBtn = $('#priceSave');
  const cancelBtn = $('#priceCancel');

  if (!openBtn || !panel || !saveBtn || !cancelBtn) return;

  const catalog = window.__vava?.catalog;
  if (!catalog) return;

  function activeProduct() {
    const id = window.__vava?.activeId;
    return id ? catalog.find((p) => p.id === id) : catalog[0] ?? null;
  }

  function fillFromProduct() {
    const p = activeProduct();
    if (!p) return;
    $('#fPrice').value = String(p.price);
    $('#fPriceUnit').value = p.unit ?? '';
  }

  function open() {
    fillFromProduct();
    panel.hidden = false;
    openBtn.hidden = true;
    window.setTimeout(() => $('#fPrice')?.focus(), 0);
  }

  function close() {
    panel.hidden = true;
    openBtn.hidden = false;
  }

  openBtn.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  cancelBtn.addEventListener('click', close);

  saveBtn.addEventListener('click', () => {
    const raw = $('#fPrice').value.trim();
    const product = activeProduct();
    if (!product) return;

    const parsed = Number(raw.replace(/[^\d.\-]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast('Enter a valid price.');
      return;
    }

    const unit = $('#fPriceUnit').value.trim() || product.unit;

    // In-memory update only.
    product.price = Math.round(parsed);
    product.unit = unit;

    // Refresh the live price block and the panel text.
    refreshPricePanel();
    close();
    toast(`Price updated for ${product.name}.`);
  });
}

