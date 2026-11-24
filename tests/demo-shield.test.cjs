// Q18 Phase 1 amendment: visitor interaction shield, director-only writes, blocked outputs and the director proof.
// Synthetic data and a minimal document only; the real screens are exercised in the WebKit trial.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const demoSource = read('js/demo-mode.js');
const directorSource = read('js/demo-director.js');
const html = read('index.html');
const ui = read('js/ui.js');
const css = read('css/studio.css');

// A browser-like page: real-behaving Storage, a window that keeps capture listeners in order, and elements that know
// whether they sit inside the demonstration's own controls ([data-demo-player]).
function page(search = '?demo', { shieldStyle = { position: 'fixed', pointerEvents: 'auto' }, withShield = true, withHead = true } = {}) {
  const nativeWrites = [];
  class Storage { constructor(name) { this._name = name; this._data = new Map(); } }
  Storage.prototype.getItem = function (k) { return this._data.has(String(k)) ? this._data.get(String(k)) : null; };
  Storage.prototype.setItem = function (k, v) { nativeWrites.push([this._name, 'set', k]); this._data.set(String(k), String(v)); };
  Storage.prototype.removeItem = function (k) { nativeWrites.push([this._name, 'remove', k]); this._data.delete(String(k)); };
  Storage.prototype.clear = function () { nativeWrites.push([this._name, 'clear']); this._data.clear(); };
  Storage.prototype.key = function (i) { return [...this._data.keys()][i] ?? null; };
  Object.defineProperty(Storage.prototype, 'length', { configurable: true, get() { return this._data.size; } });
  const listeners = [];
  const outputs = [];
  const blurred = [];
  const element = (id, { player = false, anchor = '' } = {}) => ({
    id, hidden: true, player, anchor, style: {}, nodeType: 1,
    closest(selector) {
      if (selector === '[data-demo-player]') return this.player ? this : null;
      if (/^a\[/.test(selector)) return this.anchor ? this : null;
      return null;
    },
    blur() { blurred.push(this.id); },
  });
  const elements = {
    demoShield: withShield ? Object.assign(element('demoShield'), { style: shieldStyle }) : undefined,
    studioInput: element('studioInput'),
    studioButton: element('studioButton'),
    startButton: element('demoStartBtn', { player: true }),
    exitButton: element('demoModeExitBtn', { player: true }),
    pdfLink: element('pdfLink', { anchor: 'download' }),
  };
  const classes = new Set();
  let cookieJar = '';
  // Controls that would leave the app (email drafts, print, external links): present now, or added later by Studio.
  const outputControl = (id) => ({ id, hidden: false, disabled: false, tabIndex: 0, attributes: {}, setAttribute(n, v) { this.attributes[n] = String(v); } });
  const outputControls = [outputControl('invoicePreviewPrint'), outputControl('viewQuoteEmailBtn')];
  const queried = [];
  const styles = [];
  const observers = [];
  const document = {
    documentElement: { classList: { add: (c) => classes.add(c) }, nodeType: 1 },
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => ({ tag, textContent: '', setAttribute(n, v) { this[n] = v; } }),
    querySelectorAll: (selector) => { queried.push(selector); return outputControls.slice(); },
    head: withHead ? { appendChild: (el) => { styles.push(el); return el; } } : null,
  };
  document.body = { nodeType: 1, id: 'body' };
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => cookieJar, set: (v) => { cookieJar = v; } });
  class IDBFactory {}
  IDBFactory.prototype.open = function () { return {}; };
  IDBFactory.prototype.deleteDatabase = function () { return {}; };
  const window = {
    location: { search, origin: 'https://studio.example', href: `https://studio.example/${search}`, pathname: '/', hash: '' },
    Storage, localStorage: new Storage('local'), sessionStorage: new Storage('session'), IDBFactory, indexedDB: new IDBFactory(), document,
    navigator: { sendBeacon: () => true, share: async () => { outputs.push('share'); }, canShare: () => true },
    fetch: async () => ({ ok: true }), XMLHttpRequest: function () {},
    print() { outputs.push('print'); }, open(url) { outputs.push(`open ${url}`); return {}; },
    getComputedStyle: (el) => el.style,
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe(target, options) { this.target = target; this.options = options; } },
    addEventListener(type, fn, options) { listeners.push({ type, fn, capture: options === true || !!(options && options.capture), passive: !!(options && options.passive) }); },
    DOMException: class extends Error { constructor(m, n) { super(m); this.name = n; } },
  };
  window.window = window;
  const context = vm.createContext({ window, document, URL, URLSearchParams, Storage, Promise, Error, TypeError, JSON, Map, Set, Object, String, Number, Math, Date, Array, console, MutationObserver: window.MutationObserver });
  vm.runInContext(demoSource, context);
  // Delivers an event the way the browser would: window capture listeners first, in the order they were added.
  const dispatch = (type, target, { isTrusted = true, cancelable = true } = {}) => {
    const event = { type, target, isTrusted, cancelable, defaultPrevented: false, stopped: false,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    for (const listener of listeners.filter((l) => l.type === type && l.capture)) {
      listener.fn(event);
      if (event.stopped) break;
    }
    return event;
  };
  return { window, document, elements, listeners, dispatch, outputs, blurred, nativeWrites, classes, outputControls, outputControl, queried, styles, observers };
}

const VISITOR_EVENTS = ['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend',
  'keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'change', 'paste', 'cut', 'drop', 'dragstart', 'submit'];

test('Q18 amendment: the shield turns away every genuine visitor action aimed at Studio', () => {
  const p = page();
  assert.equal(p.window.KLABS_DEMO.isolated, true, p.window.KLABS_DEMO.failure);
  assert.equal(p.window.KLABS_DEMO.installShield(p.document), true);
  assert.equal(p.window.KLABS_DEMO.shielded, true);
  assert.equal(p.elements.demoShield.hidden, false, 'the visible shield covers Studio');
  for (const type of VISITOR_EVENTS) {
    for (const target of [p.elements.studioInput, p.elements.studioButton, p.document.body]) {
      const event = p.dispatch(type, target);
      assert.equal(event.stopped, true, `${type} on ${target.id} never reaches Studio`);
      if (type !== 'touchstart') assert.equal(event.defaultPrevented, true, `${type} on ${target.id} has no default effect (focus, typing, submit)`);
    }
  }
  const touch = p.dispatch('touchstart', p.elements.studioInput);
  assert.equal(touch.defaultPrevented, false, 'page scrolling still works');
  for (const type of VISITOR_EVENTS) {
    assert.ok(p.listeners.some((l) => l.type === type && l.capture && !l.passive), `${type} is watched in the capture phase and can be cancelled`);
  }
});

test('Q18 amendment: the demonstration controls (Start, Exit demo) still work for the visitor', () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  for (const target of [p.elements.startButton, p.elements.exitButton]) {
    for (const type of ['pointerdown', 'mousedown', 'click', 'keydown', 'touchend']) {
      const event = p.dispatch(type, target);
      assert.equal(event.stopped, false, `${type} on ${target.id}`);
      assert.equal(event.defaultPrevented, false, `${type} on ${target.id}`);
    }
  }
});

test('Q18 amendment: actions performed by the director (not by a person) pass through to the real Studio controls', () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  for (const type of ['click', 'input', 'change', 'pointerdown']) {
    const event = p.dispatch(type, p.elements.studioButton, { isTrusted: false });
    assert.equal(event.stopped, false, type);
    assert.equal(event.defaultPrevented, false, type);
  }
});

test('Q18 amendment: focus can never stay on a Studio field, so no keyboard opens on iPhone', () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  p.dispatch('focusin', p.elements.studioInput, { isTrusted: true });
  p.dispatch('focusin', p.elements.studioButton, { isTrusted: false });
  assert.deepEqual(p.blurred, ['studioInput', 'studioButton']);
  p.dispatch('focusin', p.elements.startButton);
  p.dispatch('focusin', p.document.body);
  assert.deepEqual(p.blurred, ['studioInput', 'studioButton'], 'the demonstration controls and the page itself keep focus');
});

test('Q18 amendment: print, share, new windows and file downloads are blocked for everyone, the director included', async () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  p.window.print();
  assert.equal(p.window.open('https://elsewhere.example/'), null);
  await assert.rejects(p.window.navigator.share({ title: 'Invoice' }), /disabled/);
  assert.equal(p.window.navigator.canShare({}), false);
  assert.deepEqual(p.outputs, [], 'the real print, open and share were never called');
  for (const isTrusted of [true, false]) {
    const event = p.dispatch('click', p.elements.pdfLink, { isTrusted });
    assert.equal(event.stopped, true);
    assert.equal(event.defaultPrevented, true, 'the download link does nothing');
  }
  const kinds = p.window.KLABS_DEMO.refused.map((r) => r.detail);
  for (const kind of ['print', 'open https://elsewhere.example/', 'share', 'download']) assert.ok(kinds.some((d) => d.startsWith(kind)), kind);
});

test('Q18 amendment: fails closed - without the shield element, or if it does not cover the page, the shield is not installed', () => {
  for (const options of [{ withShield: false }, { shieldStyle: { position: 'static', pointerEvents: 'auto' } }, { shieldStyle: { position: 'fixed', pointerEvents: 'none' } }]) {
    const p = page('?demo', options);
    assert.throws(() => p.window.KLABS_DEMO.installShield(p.document), /shield/i);
    assert.equal(p.window.KLABS_DEMO.shielded, false);
  }
  const plain = page('');
  assert.throws(() => plain.window.KLABS_DEMO.installShield(plain.document), /Demo Mode/);
  assert.equal(plain.listeners.length, 0, 'outside Demo Mode nothing is installed');
});

test('Q18 amendment: only the director may change demo data, and only while it is running a step', async () => {
  const p = page();
  const w = p.window;
  w.KLABS_DEMO.seed({ store: { 'klabs-business-profile:': { businessName: 'Harbourline Custom Rods' } } });
  w.KLABS_ACCESS_STATE = { can_write: true, demo: true };
  assert.equal(w.Store.set('klabs-workshop-builds:klabs-demo', [{ customerName: 'Visitor' }]), false, 'editable Studio, but no director step: refused');
  assert.equal(w.KLABS_ACCESS_STATE.writeBlocked, true);
  assert.equal(w.Store.get('klabs-workshop-builds:klabs-demo', null), null);
  const director = w.KLABS_DEMO.claimDirector();
  assert.throws(() => w.KLABS_DEMO.claimDirector(), /already/, 'the director channel can be claimed once only');
  assert.equal(Object.isFrozen(director), true);
  let during = null;
  await director.run(async () => {
    await Promise.resolve();
    during = w.Store.set('klabs-workshop-builds:klabs-demo', [{ customerName: 'Jordan Ellis' }]);
  });
  assert.equal(during, true, 'accepted while the director step runs (including after an await)');
  assert.equal(w.Store.get('klabs-workshop-builds:klabs-demo', [])[0].customerName, 'Jordan Ellis');
  assert.equal(w.Store.set('klabs-workshop-builds:klabs-demo', []), false, 'refused again once the step has finished');
  await assert.rejects(director.run(async () => { throw new Error('step failed'); }), /step failed/);
  assert.equal(w.Store.set('k', 1), false, 'a failed step closes the write window too');
  w.KLABS_ACCESS_STATE.can_write = false;
  assert.equal(await director.run(async () => w.Store.set('k', 1)), false, 'a view-only access state still refuses');
  assert.deepEqual(p.nativeWrites, [], 'nothing reached device storage');
});

const OUTPUT_SELECTORS = ['#viewQuoteEmailBtn', '#workshopGripPrintActions', '[data-grip-template-action="print"]',
  '[data-invoice-preview-action="print"]', '#studioRecoveryExportBtn', 'a[target="_blank"]', 'a[href^="mailto:"]', 'a[href^="tel:"]', 'a[download]',
  // 2B: More documents (hidden, not just blocked).
  '#quoteMoreDocumentsWrap'];

test('Q18 2A: controls that leave the app (email draft, print/PDF, share, external links) are hidden and disabled, not just guarded', () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  assert.equal(p.styles.length, 1, 'one Demo Mode stylesheet');
  const rule = p.styles[0].textContent;
  for (const selector of OUTPUT_SELECTORS) assert.ok(rule.includes(selector), `${selector} is hidden`);
  assert.match(rule, /\{\s*display:\s*none\s*!important;?\s*\}/);
  for (const control of p.outputControls) {
    assert.equal(control.hidden, true, control.id);
    assert.equal(control.disabled, true, control.id);
    assert.equal(control.tabIndex, -1, control.id);
    assert.equal(control.attributes['aria-hidden'], 'true', control.id);
  }
  for (const selector of OUTPUT_SELECTORS) assert.ok(p.queried.some((q) => q.includes(selector)), `${selector} is looked for`);
  // Studio builds some of these later (the customer quote sheet, the invoice preview): they are caught as they appear.
  assert.equal(p.observers.length, 1);
  // 2B change: the observer also watches the hidden/disabled attributes (was: added elements only), because Studio
  // shows the invoice's PDF again by itself once an invoice is issued.
  assert.deepEqual(JSON.parse(JSON.stringify(p.observers[0].options)), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled'] });
  const later = p.outputControl('viewQuoteEmailBtn');
  p.outputControls.splice(0, p.outputControls.length, later);
  p.observers[0].fn([]);
  assert.equal(later.hidden, true);
  assert.equal(later.disabled, true);
});

test('Q18 2A: fails closed - if the outgoing controls cannot be hidden, the shield is not installed', () => {
  const p = page('?demo', { withHead: false });
  assert.throws(() => p.window.KLABS_DEMO.installShield(p.document), /outgoing controls/i);
  assert.equal(p.window.KLABS_DEMO.shielded, false);
});

test('Q18 amendment: introduction screen explains the demonstration and starts it; the shield sits under the controls', () => {
  assert.match(html, /<div id="demoShield" class="demo-shield" hidden aria-hidden="true"><\/div>/);
  const intro = html.slice(html.indexOf('<section id="demoIntro"'), html.indexOf('</section>', html.indexOf('<section id="demoIntro"')));
  assert.match(intro, /data-demo-player/);
  assert.match(intro, /role="dialog"/);
  assert.match(intro, /<h2 id="demoIntroTitle">/);
  assert.match(intro, /fictional/i);
  assert.match(intro, /nothing is saved/i);
  // Q24: the introduction offers two demonstrations, Build a Rod | Components Library (was one START DEMONSTRATION).
  assert.match(intro, /<button id="demoStartBtn" type="button" class="primary-action[^"]*">BUILD A ROD<\/button>/);
  assert.match(intro, /<button id="demoStartComponentsBtn" type="button" class="primary-action[^"]*">COMPONENTS LIBRARY<\/button>/);
  assert.match(intro, /<button id="demoIntroExitBtn" type="button"/);
  // Phase 3 review change: the dock also carries the demonstration files' build (data-demo-build), checked at start-up.
  assert.match(html, /<div id="demoModeBar" class="demo-dock" data-demo-player data-demo-build="build148-v\d+" hidden>/);
  const z = (selector) => Number(new RegExp(`${selector.replace(/[.#]/g, '\\$&')} \\{[^}]*z-index:(\\d+)`).exec(css)?.[1]);
  assert.ok(z('.demo-shield') > 1000, 'above every Studio layer');
  assert.ok(z('.demo-intro') > z('.demo-shield'));
  assert.ok(z('html.klabs-demo #demoModeBar') > z('.demo-shield'), 'Exit demo stays reachable');
  assert.match(css, /\.demo-shield \{[^}]*position:fixed;[^}]*inset:0;/);
});

// ---- Phase 2B

test('Q18 2B: an outgoing control Studio shows again by itself (the issued invoice\'s PDF) is hidden and disabled again at once', () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  const print = p.outputControls[0];
  assert.equal(print.hidden, true);
  print.hidden = false;
  print.disabled = false;
  p.observers[0].fn([{ type: 'attributes', target: print, attributeName: 'hidden' }]);
  assert.equal(print.hidden, true);
  assert.equal(print.disabled, true);
  // Locking an already locked control changes nothing, so the observer never sets itself off again.
  let writes = 0;
  const locked = p.outputControls[1];
  for (const key of ['hidden', 'disabled', 'tabIndex']) {
    let value = locked[key];
    Object.defineProperty(locked, key, { get: () => value, set: (v) => { writes++; value = v; } });
  }
  const setAttribute = locked.setAttribute;
  locked.getAttribute = (n) => locked.attributes[n] ?? null;
  locked.setAttribute = function (n, v) { writes++; setAttribute.call(this, n, v); };
  p.observers[0].fn([]);
  assert.equal(writes, 0);
});

test('Q18 2B: the director\'s write window closes while the demonstration is paused and reopens on Play', async () => {
  const p = page();
  const w = p.window;
  w.KLABS_DEMO.seed({ store: {} });
  w.KLABS_ACCESS_STATE = { can_write: true, demo: true };
  const director = w.KLABS_DEMO.claimDirector();
  assert.equal(typeof director.suspend, 'function');
  assert.equal(typeof director.resume, 'function');
  const results = [];
  await director.run(async () => {
    results.push(w.Store.set('k', 1));
    director.suspend();
    results.push(w.Store.set('k', 2));
    await Promise.resolve();
    results.push(w.Store.set('k', 3));
    director.suspend();
    director.resume();
    results.push(w.Store.set('k', 4));
    director.suspend();
  });
  assert.deepEqual(results, [true, false, false, true], 'refused while paused, accepted again after Play');
  assert.equal(w.Store.get('k', null), 4);
  // A pause never outlives the step (the step above ended paused, with no Play), and resuming outside a step opens nothing.
  assert.equal(await director.run(async () => w.Store.set('k', 6)), true, 'a new step starts with the window open');
  director.resume();
  assert.equal(w.Store.set('k', 5), false);
  assert.equal(w.KLABS_DEMO.refused.filter((r) => r.kind === 'store').length, 3);
  // Only accepted changes are counted (the player waits for this count to stand still before closing the window).
  assert.equal(w.KLABS_DEMO.writeCount(), 3);
  assert.equal(w.Store.set('k', 7), false);
  assert.equal(w.KLABS_DEMO.writeCount(), 3);
});

// Visitor taps on the controls the director is allowed to use - View Quote, the quote's Close, the fulfilment choice,
// and in 2B Confirm Build, Record Payment, Mark Complete, Customer Invoice and Issue Invoice - are turned away like
// any other tap on Studio; only the demonstration's own controls respond to the visitor.
const DIRECTOR_CONTROLS = ['viewQuoteBtn', 'viewQuoteCloseBtn', 'fulfilmentCollection', 'fulfilmentShipping', 'confirmBuildBtn', 'confirmSheetConfirm',
  'quoteRecordPaymentBtn', 'paymentTypeDeposit', 'quoteBalanceReceivedSave', 'toggleCurrentBuildStatusBtn', 'viewInvoicePreviewBtn', 'invoiceIssue', 'invoiceClose'];
test('Q18 2B: the shield turns away visitor taps on View Quote, Close, the fulfilment choice and every control the director uses in steps 6-10', () => {
  const p = page();
  p.window.KLABS_DEMO.installShield(p.document);
  for (const id of DIRECTOR_CONTROLS) {
    const control = { id, nodeType: 1, closest: () => null, blur() {} };
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'touchend', 'mouseup', 'click', 'keydown']) {
      const event = p.dispatch(type, control);
      assert.equal(event.stopped, true, `visitor ${type} on ${id}`);
    }
    assert.equal(p.dispatch('click', control, { isTrusted: false }).stopped, false, `the director's tap on ${id} goes through`);
  }
});

// js/supabase-client.js's Demo Mode click guard, run on its own: a second layer behind the shield.
function clickGuard() {
  const source = read('js/supabase-client.js');
  const handlers = {};
  const message = { textContent: '' };
  const document = {
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    getElementById: (id) => (id === 'demoModeMessage' ? message : null),
    body: { classList: { contains: () => false, toggle() {} } },
  };
  const window = { KLABS_DEMO: { active: true }, KLABS_SUPABASE: {}, KLABS_ACCESS_STATE: { demo: true, can_write: true }, setTimeout() {}, clearTimeout() {}, location: {} };
  vm.runInNewContext(source, { window, document, console: { error() {}, warn() {} }, AbortController, Promise });
  handlers.DOMContentLoaded.forEach((fn) => fn());
  const click = handlers.click[0];
  // A control: its own simple selectors, its ancestors' selectors, and its label.
  const control = (simple, ancestors, label) => {
    const el = {
      textContent: label, id: (simple.find((s) => s.startsWith('#')) || '').slice(1), getAttribute: () => null,
      matches(selector) { return selector.split(/,(?![^(]*\))/).map((s) => s.trim()).some((part) => { const tokens = part.split(/\s+/); const own = tokens.pop(); return simple.includes(own) && tokens.every((t) => ancestors.includes(t)); }); },
      closest(selector) {
        const parts = selector.split(/,(?![^(]*\))/).map((s) => s.trim());
        if (parts.some((part) => /^button:not\(/.test(part))) return el;
        return parts.some((part) => simple.includes(part) || ancestors.includes(part)) ? el : null;
      },
    };
    return el;
  };
  const press = (el, isTrusted) => {
    const event = { target: el, isTrusted, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    click(event);
    return event.prevented;
  };
  return { control, press, message };
}
const surface = ['.workshop-build-actions-surface'];
const GUARDED = {
  seatReference: [['[data-layout-seat-ref]', 'button'], ['#quoteSpecReelSeatRef'], 'Centre of seat'],
  viewQuote: [['#viewQuoteBtn', 'button'], surface, 'View Quote'],
  viewQuoteClose: [['#viewQuoteCloseBtn', 'button'], ['#viewQuoteSheet'], 'Close'],
  fulfilment: [['[data-fulfilment-method]', 'button'], ['#quoteFulfilmentGroup', ...surface], 'Courier / Shipping'],
  confirmBuild: [['#confirmBuildBtn', 'button'], surface, 'Confirm Build'],
  confirmSheet: [['[data-confirm-action]', 'button'], ['#confirmSheet'], 'Issue Invoice'],
  recordPayment: [['#quoteRecordPaymentBtn', 'button'], ['#quotePaymentBlock'], 'Record Payment'],
  paymentSave: [['#quoteBalanceReceivedSave', 'button'], ['#quoteBalanceReceivedForm'], 'Save'],
  markComplete: [['#toggleCurrentBuildStatusBtn', 'button'], surface, 'Mark Complete'],
  invoice: [['#viewInvoicePreviewBtn', 'button'], surface, 'Customer Invoice'],
  invoiceIssue: [['[data-invoice-preview-action="issue"]', 'button'], ['#invoicePreviewSheet'], 'Issue Invoice'],
  invoiceClose: [['[data-invoice-preview-action="close"]', 'button'], ['#invoicePreviewSheet'], 'Close'],
};
test('Q18 2B: behind the shield, the click guard lets only the director (never a person) use the journey\'s controls', () => {
  const g = clickGuard();
  for (const [name, [simple, ancestors, label]] of Object.entries(GUARDED)) {
    const el = g.control(simple, ancestors, label);
    assert.equal(g.press(el, false), false, `the director can use ${name}`);
    assert.equal(g.press(el, true), true, `a visitor's tap on ${name} is refused even if it got past the shield`);
  }
  // Pricing redesign: there is no Deposit | Balance chooser any more, so it is not on the director's list either.
  const removed = g.control(['[data-payment-type]', 'button'], ['#quotePaymentTypeField', ...surface], 'DEPOSIT');
  assert.equal(g.press(removed, false), true, 'the removed payment-type control is not a journey control');
});

test('Q18 2B: everything else stays blocked for the director too - email, print/PDF, statements, More documents, account and sync', () => {
  const g = clickGuard();
  const blocked = {
    email: [['#viewQuoteEmailBtn', 'button'], ['#viewQuoteSheet'], 'Email Open an email draft'],
    print: [['[data-invoice-preview-action="print"]', 'button'], ['#invoicePreviewSheet'], 'PDF'],
    statement: [['[data-current-build-action="statement"]', 'button'], ['[data-current-build-action]', '#currentBuildActionsMenu'], 'Payment Statement'],
    moreDocuments: [['#quoteMoreDocumentsBtn', 'button'], surface, 'More documents'],
    moreInvoice: [['[data-more-document="invoice"]', 'button'], ['[data-more-document]', ...surface], 'Customer Invoice'],
    deleteBuild: [['[data-current-build-action="delete"]', 'button'], ['[data-current-build-action]', '#currentBuildActionsMenu'], 'Delete Build'],
    signOut: [['#settingsSignOut', 'button'], ['#settingsAccountCard'], 'Sign out'],
    retry: [['#retryFinancialBtn', 'button'], ['#quotePaymentBlock'], 'Confirm Pending Transaction'],
  };
  for (const [name, [simple, ancestors, label]] of Object.entries(blocked)) {
    assert.equal(g.press(g.control(simple, ancestors, label), false), true, `${name} is blocked for the director`);
  }
});
