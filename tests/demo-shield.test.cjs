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
  const outputControls = [outputControl('emailQuoteBtn'), outputControl('viewQuoteEmailBtn')];
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

const OUTPUT_SELECTORS = ['#emailQuoteBtn', '#viewQuoteEmailBtn', '#workshopGripPrintActions', '[data-grip-template-action="print"]',
  '[data-invoice-preview-action="print"]', '#studioRecoveryExportBtn', 'a[target="_blank"]', 'a[href^="mailto:"]', 'a[href^="tel:"]', 'a[download]'];

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
  assert.deepEqual({ ...p.observers[0].options }, { childList: true, subtree: true });
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
  assert.match(intro, /<button id="demoStartBtn" type="button" class="primary-action[^"]*">START DEMONSTRATION<\/button>/);
  assert.match(intro, /<button id="demoIntroExitBtn" type="button"/);
  assert.match(html, /<div id="demoModeBar" class="demo-dock" data-demo-player hidden>/);
  const z = (selector) => Number(new RegExp(`${selector.replace(/[.#]/g, '\\$&')} \\{[^}]*z-index:(\\d+)`).exec(css)?.[1]);
  assert.ok(z('.demo-shield') > 1000, 'above every Studio layer');
  assert.ok(z('.demo-intro') > z('.demo-shield'));
  assert.ok(z('html.klabs-demo #demoModeBar') > z('.demo-shield'), 'Exit demo stays reachable');
  assert.match(css, /\.demo-shield \{[^}]*position:fixed;[^}]*inset:0;/);
});
