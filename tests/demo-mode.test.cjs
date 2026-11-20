// Q18 Demo Mode foundation: isolation guards, in-memory data, start-up and fail-safe behaviour. Synthetic data only.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const demoSource = read('js/demo-mode.js');
const entrySource = read('js/public-entry.js');
const clientSource = read('js/supabase-client.js');
const html = read('index.html');
const css = read('css/studio.css');

// A browser-like window with real-behaving Storage objects that record every native write.
function browser(search, { breakStorage = false } = {}) {
  const nativeWrites = [];
  class Storage {
    constructor(name) { this._name = name; this._data = new Map(); }
  }
  Storage.prototype.getItem = function (k) { return this._data.has(String(k)) ? this._data.get(String(k)) : null; };
  Storage.prototype.setItem = function (k, v) { nativeWrites.push([this._name, 'set', k]); this._data.set(String(k), String(v)); };
  Storage.prototype.removeItem = function (k) { nativeWrites.push([this._name, 'remove', k]); this._data.delete(String(k)); };
  Storage.prototype.clear = function () { nativeWrites.push([this._name, 'clear']); this._data.clear(); };
  Storage.prototype.key = function (i) { return [...this._data.keys()][i] ?? null; };
  Object.defineProperty(Storage.prototype, 'length', { configurable: true, get() { return this._data.size; } });
  if (breakStorage) Object.freeze(Storage.prototype);
  const localStorage = new Storage('local');
  const sessionStorage = new Storage('session');
  localStorage._data.set('klabs-workshop-builds:real-account', '[{"customerName":"Real customer"}]');
  localStorage._data.set('sb-project-auth-token', '{"access_token":"real"}');
  sessionStorage._data.set('klabs-session-note', 'real');
  const network = [];
  class IDBFactory {}
  IDBFactory.prototype.open = function () { network.push('idb-open'); return {}; };
  IDBFactory.prototype.deleteDatabase = function () { return {}; };
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function (m, u) { this.target = `${m} ${u}`; };
  XMLHttpRequest.prototype.send = function () { network.push(`xhr ${this.target}`); };
  const classes = new Set();
  const document = { cookie: '', documentElement: { classList: { add: (c) => classes.add(c) } } };
  let cookieJar = '';
  Object.defineProperty(document, 'cookie', { configurable: true, get: () => cookieJar, set: (v) => { cookieJar = v; } });
  const window = {
    location: { search, origin: 'https://studio.example', href: `https://studio.example/${search}`, pathname: '/', hash: '', assign(u) { this.assigned = u; } },
    Storage, localStorage, sessionStorage, IDBFactory, indexedDB: new IDBFactory(), XMLHttpRequest, document,
    navigator: { sendBeacon: (u) => { network.push(`beacon ${u}`); return true; } },
    WebSocket: function () { network.push('ws'); }, EventSource: function () { network.push('sse'); },
    fetch: async (input, init) => { network.push(`fetch ${(init && init.method) || 'GET'} ${input}`); return { ok: true }; },
    DOMException: class extends Error { constructor(m, n) { super(m); this.name = n; } },
  };
  window.window = window;
  const context = vm.createContext({ window, document, URL, URLSearchParams, Storage, Promise, Error, TypeError, JSON, Map, Object, String, Number, Math, Date, Array, console });
  vm.runInContext(demoSource, context);
  return { window, document, classes, nativeWrites, network, localStorage, sessionStorage, context };
}

test('Q18: outside Demo Mode nothing is changed (no guards, no store, no account)', () => {
  const b = browser('');
  assert.equal(b.window.KLABS_DEMO.active, false);
  assert.equal(b.window.KLABS_DEMO.isolated, false);
  assert.equal(b.window.Store, undefined);
  assert.equal(b.window.KLABS_ACCOUNT_ID, undefined);
  assert.equal(b.localStorage.getItem('sb-project-auth-token'), '{"access_token":"real"}', 'real storage still readable');
  b.localStorage.setItem('x', '1');
  assert.deepEqual(b.nativeWrites, [['local', 'set', 'x']]);
  assert.equal(b.classes.size, 0);
  assert.equal(b.window.KLABS_DEMO.enterUrl(), '/?demo');
  assert.equal(b.window.KLABS_DEMO.exitUrl(), '/');
});

test('Q18: in Demo Mode device storage is an empty in-memory copy - real records cannot be read or changed', () => {
  const b = browser('?demo');
  assert.equal(b.window.KLABS_DEMO.active, true);
  assert.equal(b.window.KLABS_DEMO.isolated, true, b.window.KLABS_DEMO.failure);
  assert.ok(b.classes.has('klabs-demo'));
  for (const storage of [b.localStorage, b.sessionStorage]) {
    assert.equal(storage.length, 0, 'starts empty');
    assert.equal(storage.key(0), null);
  }
  assert.equal(b.localStorage.getItem('klabs-workshop-builds:real-account'), null, 'real job list not readable');
  assert.equal(b.localStorage.getItem('sb-project-auth-token'), null, 'stored sign-in not readable');
  assert.equal(b.sessionStorage.getItem('klabs-session-note'), null);
  b.localStorage.setItem('klabs-workshop-builds:real-account', '[]');
  b.localStorage.removeItem('sb-project-auth-token');
  b.localStorage.clear();
  b.sessionStorage.setItem('a', '1');
  assert.equal(b.sessionStorage.getItem('a'), '1', 'works in memory for the page');
  assert.deepEqual(b.nativeWrites, [], 'nothing reached the device storage');
  assert.equal(b.localStorage._data.get('klabs-workshop-builds:real-account'), '[{"customerName":"Real customer"}]');
  assert.equal(b.localStorage._data.get('sb-project-auth-token'), '{"access_token":"real"}');
});

test('Q18: IndexedDB, cookies, beacons and sockets are unavailable; only same-origin reads reach the network', async () => {
  const b = browser('?demo');
  const w = b.window;
  assert.equal(w.indexedDB, undefined);
  assert.throws(() => w.IDBFactory.prototype.open.call({}, 'db'), /disabled/);
  w.document.cookie = 'track=1';
  assert.equal(w.document.cookie, '');
  assert.equal(w.navigator.sendBeacon('https://studio.example/x'), false);
  assert.throws(() => new w.WebSocket('wss://x'), /disabled/);
  assert.throws(() => new w.EventSource('https://x'), /disabled/);
  await w.fetch('/js/ui.js');
  await w.fetch('kr-guide-layout/index.html', { method: 'GET' });
  await assert.rejects(w.fetch('https://fdbklophlxdzuevypqwc.supabase.co/rest/v1/builds'), /disabled/);
  await assert.rejects(w.fetch('/js/ui.js', { method: 'POST' }), /disabled/);
  await assert.rejects(w.fetch('https://elsewhere.example/'), /disabled/);
  const xhr = new w.XMLHttpRequest();
  xhr.open('POST', 'https://fdbklophlxdzuevypqwc.supabase.co/rest/v1/builds');
  assert.throws(() => xhr.send('{}'), /disabled/);
  assert.deepEqual(b.network, ['fetch GET /js/ui.js', 'fetch GET kr-guide-layout/index.html'], 'only the two same-origin reads went out');
  assert.ok(w.KLABS_DEMO.refused.length >= 6, 'refusals are recorded');
});

test('Q18: the in-memory Store holds the seeded data, refuses every write outside a director step, and keeps nothing on the device', () => {
  const b = browser('?demo');
  const w = b.window;
  assert.equal(w.Store, w.KLABS_DEMO.store);
  assert.equal(w.KLABS_ACCOUNT_ID, 'klabs-demo');
  w.KLABS_DEMO.seed({ anchor: '2026-11-20', store: { 'klabs-workshop-builds:': [{ id: 'j', savedAt: '2026-11-15T03:30:00.000Z', payments: [{ date: '2026-10-21' }], note: '2026-11-20 is text' }], 'klabs-build-seq': 901 } },
    new Date(2026, 11, 1));
  const jobs = w.Store.get('klabs-workshop-builds:klabs-demo', []);
  assert.equal(jobs[0].savedAt, '2026-11-26T03:30:00.000Z', 'shifted by the 11 days since the anchor');
  assert.equal(jobs[0].payments[0].date, '2026-11-01');
  assert.equal(jobs[0].note, '2026-11-20 is text', 'only whole date values move');
  assert.equal(w.Store.get('klabs-build-seq', 0), 901);
  for (const can_write of [false, true]) {
    w.KLABS_ACCESS_STATE = { can_write, demo: true };
    assert.equal(w.Store.set('klabs-workshop-builds:klabs-demo', []), false, `can_write ${can_write}, no director step: refused`);
    assert.equal(w.Store.get('klabs-workshop-builds:klabs-demo', []).length, 1);
    assert.equal(w.KLABS_ACCESS_STATE.writeBlocked, true);
  }
  assert.ok(w.KLABS_DEMO.refused.some((r) => r.kind === 'store'), 'refused writes are recorded');
  assert.deepEqual(b.nativeWrites, []);
});

test('Q18: if a guard cannot be installed, Demo Mode is not isolated and will not open', () => {
  const b = browser('?demo', { breakStorage: true });
  assert.equal(b.window.KLABS_DEMO.active, true);
  assert.equal(b.window.KLABS_DEMO.isolated, false);
  assert.ok(b.window.KLABS_DEMO.failure);
});

test('Q18: the embedded-tool guard script installs the same protections inside a tool document', () => {
  const b = browser('?demo');
  const script = b.window.KLABS_DEMO.frameGuardScript;
  assert.match(script, /__KLABS_DEMO_FRAME_ISOLATED__=true/);
  const frame = browser('');
  frame.window.document.addEventListener = () => {};
  frame.window.document.open = () => {}; frame.window.document.write = () => {}; frame.window.document.close = () => {};
  frame.window.stop = () => {};
  vm.runInContext(script, frame.context);
  assert.equal(frame.window.__KLABS_DEMO_FRAME_ISOLATED__, true);
  assert.equal(frame.localStorage.getItem('sb-project-auth-token'), null);
  frame.localStorage.setItem('tds-design', 'x');
  assert.deepEqual(frame.nativeWrites, []);
  assert.equal(frame.window.indexedDB, undefined);
});

for (const [file, global] of [['js/thread-studio-host.js', 'KLabsThreadStudioHost'], ['js/kr-guide-layout-host.js', 'KLabsKrGuideLayoutHost']]) {
  test(`Q18: ${file} adds the guard first only on a Demo Mode page`, () => {
    const load = (demo) => {
      const window = { KLABS_DEMO: demo };
      const context = vm.createContext({ window, self: window, JSON, String, Number, Math, Object, Array, Error, RegExp });
      vm.runInContext(read(file), context);
      return window[global] || context.module?.exports;
    };
    const page = '<html><head><title>t</title><script src="app.js"></script></head></html>';
    const plain = load({ active: false }).buildSrcdoc(page, 'mm');
    assert.doesNotMatch(plain, /KLABS_DEMO_GUARD/);
    const guarded = load({ active: true, isolated: true, frameGuardScript: '/*KLABS_DEMO_GUARD*/' }).buildSrcdoc(page, 'mm');
    assert.ok(guarded.indexOf('KLABS_DEMO_GUARD') > 0 && guarded.indexOf('KLABS_DEMO_GUARD') < guarded.indexOf('app.js'), 'guard runs before the tool');
    assert.throws(() => load({ active: true, isolated: false, frameGuardScript: '' }).buildSrcdoc(page, 'mm'), /isolation/);
  });
}

// public-entry.js startDemo with a minimal document.
function entry({ isolated = true, extraGlobal = '', shield = 'ok', player = true } = {}) {
  const scripts = [];
  const elements = {};
  const el = (id) => elements[id] || (elements[id] = { id, hidden: true, style: {}, listeners: {}, textContent: '', addEventListener(e, f) { this.listeners[e] = f; }, focus() {}, setAttribute() {}, removeAttribute() {} });
  const classes = new Set();
  const store = { get() {}, set() { return false; } };
  const seeded = [];
  const opened = [];
  const order = [];
  const director = Object.freeze({ run: async (f) => f() });
  const window = {
    KLABS_DEMO: { active: true, isolated, failure: isolated ? '' : 'probe failed', accountId: 'klabs-demo', store, exitUrl: () => '/', seed: (d) => seeded.push(d),
      installShield: () => { order.push('shield'); if (shield === 'fail') throw new Error('The visitor shield could not be installed.'); return true; },
      claimDirector: () => { order.push('director'); if (shield === 'claimed') throw new Error('The demonstration director is already in use.'); return director; } },
    location: { hash: '', pathname: '/', replace(u) { this.replaced = u; } },
    navigator: { onLine: true }, addEventListener() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, scrollTo() {},
    localStorage: { length: 0, key: () => null }, KLABS_SUPABASE_CLIENT: null,
  };
  window.Store = store;
  window.KLABS_ACCOUNT_ID = 'klabs-demo';
  const document = {
    body: { classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) } },
    getElementById: el, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {} }),
    head: { appendChild(s) {
      if (s.rel === 'preload') return;
      scripts.push(s.src);
      order.push(s.src);
      if (s.src === 'js/demo-data.js') window.KLABS_DEMO_DATA = { store: {} };
      if (s.src === 'js/ui.js') window.KLABS_UI = { openSavedJobById: (id) => opened.push(id) };
      if (s.src === 'js/demo-director.js' && player) window.KLABS_DEMO_PLAYER = { open: (d) => { order.push('player'); opened.push(d); } };
      if (extraGlobal && s.src === 'js/app.js') window[extraGlobal] = {};
      queueMicrotask(s.onload);
    } },
  };
  vm.runInNewContext(entrySource, { window, document, Promise, Error, Date, JSON, console: { warn() {}, error() {} }, AbortController, queueMicrotask, Set });
  return { window, scripts, elements, classes, seeded, opened, order, director };
}

test('Q18: Demo Mode opens the real, editable interface behind the shield - no sign-in, sync, administration or server quote numbers', async () => {
  const h = entry();
  let applied = null;
  assert.equal(await h.window.KLABS_PUBLIC_ENTRY.startDemo((s) => { applied = s; }), true);
  assert.equal(h.scripts[0], 'js/demo-data.js', 'demonstration data first');
  assert.ok(h.scripts.indexOf('js/ui.js') > 0 && h.scripts.indexOf('js/ui.js') < h.scripts.indexOf('js/app.js'));
  for (const excluded of ['js/storage.js', 'js/component-sync.js', 'js/build-sync.js', 'js/build-sync-journal.js', 'js/guarded-build-transport.js',
    'js/build-sync-diff.js', 'js/build-sync-review.js', 'js/settings-sync.js', 'js/studio-recovery-export.js', 'js/quote-number-allocator.js', 'js/admin-panel.js']) {
    assert.ok(!h.scripts.includes(excluded), `${excluded} is not loaded`);
  }
  assert.equal(h.seeded.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), { user: { id: 'klabs-demo', email: 'Demonstration' } });
  assert.equal(h.window.KLABS_ACCESS_STATE.can_write, true, 'Studio is editable; the shield and director-only writes protect it');
  assert.equal(h.window.KLABS_ACCESS_STATE.demo, true);
  assert.equal(h.order[0], 'shield', 'the shield is in place before any Studio script runs');
  assert.ok(h.scripts.includes('js/demo-director.js'));
  assert.ok(h.scripts.indexOf('js/demo-director.js') > h.scripts.indexOf('js/ui.js'));
  assert.deepEqual(h.order.slice(-2), ['director', 'player'], 'the director channel goes straight to the player');
  assert.deepEqual([...h.opened], [h.director], 'no saved job is opened; the player (introduction screen) is given the director');
  assert.equal(h.elements.demoModeBar.hidden, false);
  await assert.rejects(h.window.KLABS_QUOTE_NUMBERS.allocate(1), /not allocated/);
  assert.deepEqual({ ...(await h.window.KLABS_QUOTE_NUMBERS.peek()) }, { userId: 'klabs-demo', nextNumber: null });
  assert.equal(h.window.location.replaced, undefined);
});

test('Q18: fails safe - without confirmed isolation nothing loads and the visitor returns to the public entry with a notice', async () => {
  const h = entry({ isolated: false });
  let applied = false;
  assert.equal(await h.window.KLABS_PUBLIC_ENTRY.startDemo(() => { applied = true; }), false);
  assert.deepEqual(h.scripts, []);
  assert.equal(applied, false);
  assert.equal(h.window.location.replaced, '/#demo-unavailable');
  assert.equal(h.elements.demoModeBar, undefined, 'the demo bar is never shown');
});

test('Q18 amendment: fails safe if the shield cannot be installed, the director is already taken or the player is missing', async () => {
  for (const options of [{ shield: 'fail' }, { shield: 'claimed' }, { player: false }]) {
    const h = entry(options);
    let applied = false;
    assert.equal(await h.window.KLABS_PUBLIC_ENTRY.startDemo(() => { applied = true; }), false, JSON.stringify(options));
    assert.equal(h.window.location.replaced, '/#demo-unavailable');
    if (options.shield === 'fail') {
      assert.deepEqual(h.scripts, [], 'no Studio script runs without the shield');
      assert.equal(applied, false);
    }
    assert.equal(h.opened.length, 0, 'the player is never opened');
  }
});

test('Q18: fails safe if a sync or administration module appears while opening', async () => {
  for (const name of ['KLABS_BUILD_SYNC', 'KLABS_SYNC', 'KLABS_SETTINGS_SYNC', 'KLABS_ADMIN_ACCESS']) {
    const h = entry({ extraGlobal: name });
    let applied = false;
    assert.equal(await h.window.KLABS_PUBLIC_ENTRY.startDemo(() => { applied = true; }), false, name);
    assert.equal(applied, false);
    assert.equal(h.window.location.replaced, '/#demo-unavailable');
  }
});

test('Q18: demo page wiring - no Supabase client, no sign-in restore, no service worker; the guard script runs first', () => {
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.equal(scripts[0], 'js/demo-mode.js', 'decided before anything else runs');
  assert.match(clientSource, /window\.KLABS_SUPABASE_CLIENT = window\.KLABS_DEMO\?\.active \? null : window\.supabase\.createClient\(/);
  const ready = clientSource.slice(clientSource.indexOf('document.addEventListener("DOMContentLoaded"'));
  assert.ok(ready.indexOf('KLABS_PUBLIC_ENTRY?.startDemo(klabsApplyAuthState)') < ready.indexOf('klabsCheckLogin().catch'));
  assert.match(read('js/app.js'), /if\('serviceWorker' in navigator && !window\.KLABS_DEMO\?\.active\)\{/);
  const worker = read('service-worker.js');
  assert.match(worker, /'js\/demo-mode\.js',/);
  assert.match(worker, /'js\/demo-data\.js',/);
  assert.match(worker, /'js\/demo-director\.js',/);
});

test('Q18: account, sign-out, sync, recovery export, administration and customer documents are not part of the demonstration', () => {
  for (const id of ['settingsAccountCard', 'settingsRecoveryCard', 'settingsAdminEntry', 'adminAccessScreen', 'buildSyncNotice', 'componentSyncStatusLine', 'readOnlyAccessNotice']) {
    assert.match(css, new RegExp(`html\\.klabs-demo #${id}[,\\s]`), id);
  }
  assert.match(clientSource, /#settingsAccountCard, #settingsRecoveryCard, #settingsAdminEntry, #adminAccessScreen, #buildSyncNotice/);
  assert.match(clientSource, /log \?out\|sign \?out\|sync\|admin\|upload\|logo\|increase\|decrease\|e-\?mail\|print\|export\|send/);
  assert.match(clientSource, /const blockedOffline = \(offlineSession \|\| demo\) && \(/, 'customer documents blocked as when offline');
  // The demonstration is editable (for the director), so these controls are blocked in Demo Mode whether or not the
  // page is read-only, and for every click - visitor or director.
  assert.match(clientSource, /if \(!demo && !document\.body\.classList\.contains\("klabs-read-only"\)\) return;/);
  assert.match(clientSource, /if \(demo\) \{\s*if \(!blockedOffline && !blockedDemo\) return;/);
});

test('Q18: one compact bar identifies Demo Mode and offers the way out', () => {
  assert.match(html, /<div id="demoModeBar" class="readonly-access-notice demo-mode-bar" role="status" data-demo-player hidden>\s*<strong>DEMO<\/strong>\s*<span id="demoModeMessage">Fictional data\. Nothing here is saved, sent or synced\.<\/span>\s*<button id="demoModeExitBtn" type="button" class="ghost-action demo-mode-bar__exit">Exit demo<\/button>/);
  assert.match(css, /\.readonly-access-notice\.demo-mode-bar \{ flex-direction:row;/);
  assert.match(entrySource, /getElementById\("demoModeExitBtn"\)\.addEventListener\("click", \(\) => window\.KLABS_DEMO\?\.exit\(\)\)/);
});

test('Q18 amendment: demonstration data is fictional and holds supporting data only - no jobs, customers or finished build', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(read('js/demo-data.js'), context);
  const data = context.window.KLABS_DEMO_DATA;
  const store = data.store;
  assert.deepEqual(Object.keys(store).sort(), ['klabs-business-profile:', 'klabs-studio-settings:', 'klabs-studio-starter-components-v1', 'klabs-studio-starter-suppliers-v1',
    'klabs-workshop-component-library:', 'klabs-workshop-component-taxonomy:', 'klabs-workshop-custom-suppliers'], 'business profile, settings and component library only');
  assert.equal(data.exampleJobId, undefined, 'the demonstration no longer opens on a finished build');
  const text = JSON.stringify(data);
  assert.doesNotMatch(text, /INV-1042|demo-build-coastal|Jordan Ellis|Priya Nair|Tom Hughes|Mere Walker/, 'no pre-made jobs or customers');
  for (const email of text.match(/[\w.+-]+@[\w.-]+/g) || []) assert.match(email, /@example\.com$/, email);
  assert.equal(store['klabs-business-profile:'].businessName, 'Harbourline Custom Rods');
  assert.match(store['klabs-business-profile:'].phone, / 555 /);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, 'no real account ids');
  assert.ok(store['klabs-workshop-component-library:'].length >= 50, 'component library');
});
