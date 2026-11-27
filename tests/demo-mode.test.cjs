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

// Phase 3 review: the build every demonstration file carries is the app shell's (service-worker.js).
const BUILD = /const APP_SHELL_VERSION='([^']+)'/.exec(read('service-worker.js'))[1];
const OLD = 'build148-v100';
// public-entry.js startDemo with a minimal document.
// Phase 3 review change (harness): each demonstration file reports its build (stale: which one is an older copy);
// search: the page address; a service-worker registration records update() (was: no builds, no service worker).
function entry({ isolated = true, extraGlobal = '', shield = 'ok', player = true, stale = '', search = '?demo' } = {}) {
  const scripts = [];
  const elements = {};
  const build = (part) => (stale === part ? OLD : BUILD);
  const el = (id) => elements[id] || (elements[id] = { id, hidden: true, style: {}, listeners: {}, textContent: '', addEventListener(e, f) { this.listeners[e] = f; }, focus() {}, setAttribute() {}, removeAttribute() {},
    getAttribute: (name) => (id === 'demoModeBar' && name === 'data-demo-build' ? build('page') : null) });
  const sw = { updates: 0 };
  const classes = new Set();
  const store = { get() {}, set() { return false; } };
  const seeded = [];
  const opened = [];
  const order = [];
  const director = Object.freeze({ run: async (f) => f() });
  const window = {
    KLABS_DEMO: { active: true, isolated, failure: isolated ? '' : 'probe failed', accountId: 'klabs-demo', store, exitUrl: () => '/', enterUrl: () => '/?demo', build: build('guard'), seed: (d) => seeded.push(d),
      installShield: () => { order.push('shield'); if (shield === 'fail') throw new Error('The visitor shield could not be installed.'); return true; },
      claimDirector: () => { order.push('director'); if (shield === 'claimed') throw new Error('The demonstration director is already in use.'); return director; } },
    location: { hash: '', pathname: '/', search, replace(u) { this.replaced = u; } },
    navigator: { onLine: true, serviceWorker: { getRegistration: async () => ({ update: async () => { sw.updates += 1; } }), addEventListener() {} } }, addEventListener() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, scrollTo() {},
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
      if (s.src === 'js/demo-data.js') window.KLABS_DEMO_DATA = { store: {}, build: build('data') };
      if (s.src === 'js/ui.js') window.KLABS_UI = { openSavedJobById: (id) => opened.push(id) };
      if (s.src === 'js/demo-director.js' && player) window.KLABS_DEMO_PLAYER = { build: build('player'), open: (d) => { order.push('player'); opened.push(d); } };
      if (extraGlobal && s.src === 'js/app.js') window[extraGlobal] = {};
      queueMicrotask(s.onload);
    } },
  };
  vm.runInNewContext(entrySource, { window, document, Promise, Error, Date, JSON, console: { warn() {}, error() {} }, AbortController, queueMicrotask, Set });
  return { window, scripts, elements, classes, seeded, opened, order, director, sw };
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
  // Local quote-number stand-in (2A): numbers come from the demonstration business's own sequence, in memory only.
  assert.deepEqual({ ...(await h.window.KLABS_QUOTE_NUMBERS.peek()) }, { userId: 'klabs-demo', nextNumber: null });
  assert.equal(await h.window.KLABS_QUOTE_NUMBERS.allocate(1046), 1046);
  assert.equal(await h.window.KLABS_QUOTE_NUMBERS.allocate(1046), 1047, 'never hands out the same number twice');
  assert.equal(await h.window.KLABS_QUOTE_NUMBERS.allocate(1050), 1050, 'respects Studio\'s floor');
  assert.deepEqual({ ...(await h.window.KLABS_QUOTE_NUMBERS.peek()) }, { userId: 'klabs-demo', nextNumber: 1051 });
  assert.doesNotMatch(entrySource.slice(entrySource.indexOf('window.KLABS_QUOTE_NUMBERS = {'), entrySource.indexOf('for (const src of demoScripts)')), /fetch|rpc|supabase|Store|localStorage/i,
    'no server, no device storage');
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
  // Demo Mode returns before any sign-in restore or emailed-link handling (Q43 moved the restore into klabsRestoreSession).
  const demo = ready.indexOf('KLABS_PUBLIC_ENTRY?.startDemo(klabsApplyAuthState)');
  for (const call of ['klabsRestoreSession();', 'klabsHandleAuthLink(passwordSetup)']) assert.ok(demo > 0 && demo < ready.indexOf(call), call);
  assert.match(clientSource, /function klabsRestoreSession\(\) \{\n  klabsCheckLogin\(\)\.catch/);
  assert.match(clientSource, /const KLABS_AUTH_LINK_ERROR = \(function klabsReadAuthLink\(\) \{\n  if \(window\.KLABS_DEMO\?\.active\) return "";/);
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
  // 2B change (was: a fixed list of View Quote, Close and the fulfilment choice, for any click, with invoices blocked):
  // the journey's controls - now including Confirm Build, the payment form, Mark Complete, the invoice preview's Issue
  // and Close and Studio's own confirmation - are allowed for the director only (a person's click is never allowed);
  // printing, email, statements, More documents and every other build action stay blocked. Behaviour is tested in
  // tests/demo-shield.test.cjs.
  assert.match(clientSource, /const demoJourneyControl = demo && !event\.isTrusted && control\.matches\(DEMO_DIRECTOR_CONTROLS\);/);
  assert.match(clientSource, /if \(demo\) \{\s*if \(demoJourneyControl \|\| \(!demoVisitorOnJourney && !blockedOffline && !blockedDemo\)\) return;/);
  const allowed = /const DEMO_DIRECTOR_CONTROLS = \[([\s\S]*?)\]\.join/.exec(clientSource);
  assert.ok(allowed, 'one list of the director\'s controls');
  // Q44: the one exception by name is Grip Wrap's Print Cut Template, which only opens the on-screen template preview;
  // that preview's Print Template stays hidden and disabled (js/demo-mode.js OUTPUT_CONTROLS) and printing itself is
  // replaced on every demo page.
  const listed = allowed[1].replace(/\/\/[^\n]*/g, '').replace('"#workshopGripPrintTemplateBtn"', '');
  assert.doesNotMatch(listed, /print|email|Email|statement|more-document|MoreDocuments|delete|retry/i, 'printing, email, statements and More documents are never allowed');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'demo-mode.js'), 'utf8'), /OUTPUT_CONTROLS = \[[^\]]*'\[data-grip-template-action="print"\]'/);
});

test('Q18 2A: one dock at the top identifies Demo Mode, holds the player and the way out, and never covers Studio\'s sheets', () => {
  const dock = html.slice(html.indexOf('<div id="demoModeBar"'), html.indexOf('<!-- /demoModeBar -->'));
  // Phase 3 review change: the dock also carries the demonstration files' build (data-demo-build), checked at start-up.
  assert.match(dock, /^<div id="demoModeBar" class="demo-dock" data-demo-player data-demo-build="build148-v\d+" hidden>/);
  assert.match(dock, /<strong class="demo-dock__tag">DEMO<\/strong>\s*<span id="demoModeMessage" class="demo-dock__message">Fictional data\. Nothing here is saved, sent or synced\.<\/span>\s*<button id="demoModeExitBtn" type="button" class="ghost-action demo-dock__exit">Exit demo<\/button>/);
  assert.match(dock, /<div id="demoPlayer" class="demo-player" hidden>/);
  for (const id of ['demoCaption', 'demoChapterLabel', 'demoPlayPauseBtn', 'demoReplayBtn']) assert.match(dock, new RegExp(`id="${id}"`), id);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) assert.match(dock, new RegExp(`data-demo-chapter="${n}"`), `chapter ${n}`);
  assert.doesNotMatch(dock, /data-demo-chapter="11"/);
  assert.ok(html.indexOf('<div id="demoModeBar"') > html.indexOf('</main>') || html.indexOf('<div id="demoModeBar"') > html.lastIndexOf('id="app"'), 'outside the app layout');
  assert.match(entrySource, /getElementById\("demoModeExitBtn"\)\.addEventListener\("click", \(\) => window\.KLABS_DEMO\?\.exit\(\)\)/);
  // Fixed at the top; the page and every sheet are moved down by the dock's height so titles and close buttons stay clear.
  assert.match(css, /html\.klabs-demo #demoModeBar \{[^}]*position:fixed;[^}]*top:0;/);
  assert.match(css, /html\.klabs-demo body \{[^}]*padding-top:var\(--demo-dock-height,0px\)/);
  assert.match(css, /html\.klabs-demo \.component-sheet \{[^}]*padding-top:calc\(var\(--demo-dock-height,0px\) \+ 8px\) !important;/);
  assert.match(css, /html\.klabs-demo \.component-sheet \.component-sheet__panel \{[^}]*max-height:min\(100%,var\(--component-sheet-panel-max-height,100%\)\) !important;/,
    'every sheet panel (including the customer quote) fits in the space below the dock');
  assert.match(read('js/demo-director.js'), /--demo-dock-height/);
});

test('Q18 2A: the customer quote shown in the demonstration carries a DEMO watermark (Demo Mode only)', () => {
  assert.match(css, /html\.klabs-demo \.view-quote::after \{[^}]*content:"DEMO";/);
  assert.match(css, /html\.klabs-demo \.view-quote::before \{[^}]*content:"DEMONSTRATION QUOTE[^"]*";/);
  assert.match(css, /html\.klabs-demo \.view-quote \{[^}]*position:relative;/);
  assert.doesNotMatch(css.replace(/html\.klabs-demo [^{]*\{[^}]*\}/g, ''), /content:"DEMO/, 'nothing outside Demo Mode');
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
  // 2A: the parts the demonstration builds with carry realistic New Zealand prices (cost below sell price).
  const library = store['klabs-workshop-component-library:'];
  const part = (name) => library.find((c) => c.name === name);
  const realistic = { "7'0\" Medium Spin 6-10 kg": [150, 300], 'Medium Spin Guide Set': [60, 150], 'DPS 18': [20, 60], 'EVA Split Grip': [15, 50],
    'Aluminium Winding Check 16 mm': [4, 15], 'NCP Nylon Thread A Black': [5, 15] };
  for (const [name, [low, high]] of Object.entries(realistic)) {
    const c = part(name);
    assert.ok(c, name);
    assert.ok(c.unitCost >= low && c.unitCost <= high, `${name} cost ${c.unitCost}`);
    assert.equal(c.cost, c.unitCost, `${name} cost fields agree`);
    assert.ok(c.unitPrice > c.unitCost, `${name} sells above cost`);
  }
  assert.equal(store['klabs-business-profile:'].businessName, 'Harbourline Custom Rods');
  assert.match(store['klabs-business-profile:'].phone, / 555 /);
  assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, 'no real account ids');
  assert.ok(store['klabs-workshop-component-library:'].length >= 50, 'component library');
});

// ---- Phase 2B

// The payment stand-in, with Studio's saved builds in memory (window.savedBuildRecords / saveBuildRecords, as ui.js).
async function financial() {
  const h = entry();
  await h.window.KLABS_PUBLIC_ENTRY.startDemo(() => {});
  let builds = [{ id: 'build-1', customerName: 'Jordan Ellis', finalCustomerPrice: 1155.37, payments: [] }, { id: 'other', customerName: 'Someone' }];
  const saves = [];
  h.window.savedBuildRecords = () => JSON.parse(JSON.stringify(builds));
  h.window.saveBuildRecords = (list) => { saves.push(list); builds = JSON.parse(JSON.stringify(list)); return true; };
  const refreshed = [];
  h.window.KLABS_UI = { refreshBuildViews: () => refreshed.push('views'), refreshOpenBuild: () => refreshed.push('open') };
  return { h, sync: h.window.KLABS_BUILD_SYNC, builds: () => builds, saves, refreshed };
}
const pay = (id, type, amount, date = '2026-11-20') => ({ id, type, amount, date });

test('Q18 2B: deposits and payments go to a local demo-only stand-in for the payment service - frozen, in memory, no server', async () => {
  const f = await financial();
  assert.ok(f.sync && f.sync.demo === true, 'the stand-in is in place once Demo Mode is open');
  assert.equal(Object.isFrozen(f.sync), true);
  assert.deepEqual(Object.keys(f.sync).sort(), ['busy', 'demo', 'financialOperation', 'pendingFinancial', 'retryFinancial']);
  assert.equal(Reflect.set(f.h.window, 'KLABS_BUILD_SYNC', {}), false, 'cannot be overwritten');
  assert.equal(Reflect.deleteProperty(f.h.window, 'KLABS_BUILD_SYNC'), false, 'cannot be removed');
  assert.equal(f.h.window.KLABS_BUILD_SYNC, f.sync, 'cannot be replaced');
  assert.equal(f.sync.pendingFinancial(), null, 'never an unconfirmed transaction');
  await assert.rejects(f.sync.retryFinancial(), /no unconfirmed transaction/);
  const result = await f.sync.financialOperation('build-1', 'add_payment', pay('p1', 'deposit', 300));
  assert.equal(result.conflict, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.record.payments)), [pay('p1', 'deposit', 300)]);
  assert.deepEqual(f.builds()[0].payments, [pay('p1', 'deposit', 300)], 'kept with the saved build, like the real service');
  assert.equal(f.builds()[0].id, 'build-1');
  assert.equal(f.builds().length, 2, 'other builds untouched');
  assert.deepEqual(f.refreshed, ['views'], 'the lists redraw; the open build is left to Studio');
  const block = entrySource.slice(entrySource.indexOf('function demoFinancialService'), entrySource.indexOf('// end demoFinancialService'));
  assert.ok(block.length > 200, 'the stand-in is one function in public-entry.js');
  assert.doesNotMatch(block, /fetch|rpc|supabase|localStorage|XMLHttpRequest|sendBeacon/i, 'no server and no device storage');
});

test('Q18 2B: the stand-in keeps the payment service\'s rules - one deposit, no duplicates, never more than the price, valid amounts and dates', async () => {
  const f = await financial();
  await f.sync.financialOperation('build-1', 'add_payment', pay('p1', 'deposit', 300));
  const refusals = [
    [['build-1', 'add_payment', pay('p2', 'deposit', 100)], /deposit is already recorded/],
    [['build-1', 'add_payment', pay('p1', 'balance', 100)], /already recorded/],
    [['build-1', 'add_payment', pay('p3', 'deposit', 300)], /already recorded|deposit is already/],
    [['build-1', 'add_payment', pay('p4', 'balance', 855.38)], /cannot exceed/],
    [['build-1', 'add_payment', pay('p5', 'balance', 0)], /valid payment/],
    [['build-1', 'add_payment', pay('p6', 'balance', 10.123)], /valid payment/],
    [['build-1', 'add_payment', pay('p7', 'balance', 10, '2026-02-30')], /valid payment/],
    [['build-1', 'add_payment', pay('p8', 'refund', 10)], /valid payment/],
    [['build-1', 'add_payment', pay('', 'balance', 10)], /valid payment/],
    [['missing', 'add_payment', pay('p9', 'balance', 10)], /Save this build/],
    [['build-1', 'correct_payment', { ...pay('p1', 'deposit', 200), reason: 'typo' }], /not part of the demonstration/],
  ];
  for (const [args, message] of refusals) await assert.rejects(f.sync.financialOperation(...args), message, JSON.stringify(args));
  assert.deepEqual(f.builds()[0].payments, [pay('p1', 'deposit', 300)], 'nothing changed by a refusal');
  const paid = await f.sync.financialOperation('build-1', 'add_payment', pay('p10', 'balance', 855.37));
  assert.equal(paid.record.payments.reduce((sum, p) => sum + p.amount, 0), 1155.37, 'paid in full exactly');
  assert.equal(f.sync.busy(), false);
});

test('Q18 2B: the final invoice is issued once, only when it matches the saved build (price and payments)', async () => {
  const f = await financial();
  await f.sync.financialOperation('build-1', 'add_payment', pay('p1', 'deposit', 300));
  await f.sync.financialOperation('build-1', 'add_payment', pay('p2', 'balance', 855.37));
  const payments = f.builds()[0].payments;
  const invoice = { number: 'INV-klabsdemo-6275696c642d31', displayNumber: 'INV-1046', issuedDate: '2026-11-20', total: 1155.37, payments };
  for (const [bad, why] of [[{ ...invoice, total: 1000 }, 'price'], [{ ...invoice, payments: payments.slice(0, 1) }, 'payments'], [{ ...invoice, issuedDate: '' }, 'date'], [null, 'missing']]) {
    await assert.rejects(f.sync.financialOperation('build-1', 'issue_invoice', { invoice: bad }), /does not match/, why);
  }
  // Same payments with their fields in another order still match (the service compares content, not layout).
  const reordered = { ...invoice, payments: payments.map((p) => ({ date: p.date, amount: p.amount, type: p.type, id: p.id })) };
  const issued = await f.sync.financialOperation('build-1', 'issue_invoice', { invoice: reordered });
  assert.equal(issued.record.issuedInvoice.displayNumber, 'INV-1046', 'the invoice keeps Studio\'s own demo number');
  assert.equal(f.builds()[0].issuedInvoice.total, 1155.37);
  await assert.rejects(f.sync.financialOperation('build-1', 'issue_invoice', { invoice }), /already been issued/);
  await assert.rejects(f.sync.financialOperation('build-1', 'add_payment', pay('p3', 'balance', 1)), /cannot exceed/, 'nothing can be paid beyond the invoice');
});

test('Q18 2B: one transaction at a time, and the stand-in reports when it is busy (so a pause waits for it)', async () => {
  const f = await financial();
  const first = f.sync.financialOperation('build-1', 'add_payment', pay('p1', 'deposit', 300));
  assert.equal(f.sync.busy(), true);
  await assert.rejects(f.sync.financialOperation('build-1', 'add_payment', pay('p2', 'balance', 10)), /already in progress/);
  await first;
  assert.equal(f.sync.busy(), false);
  f.h.window.saveBuildRecords = () => false;
  await assert.rejects(f.sync.financialOperation('build-1', 'add_payment', pay('p3', 'balance', 10)), /could not record/);
  assert.equal(f.sync.busy(), false, 'not left busy after a refusal');
});

test('Q18 2B: the stand-in is put in place only after the isolation check (a real sync module still stops Demo Mode)', () => {
  const start = entrySource.slice(entrySource.indexOf('async function startDemo'), entrySource.indexOf('// Q17: the stored sign-in has expired'));
  const check = start.indexOf('throw new Error("Demo Mode isolation changed while opening.")');
  const install = start.indexOf('Object.defineProperty(window, "KLABS_BUILD_SYNC"');
  assert.ok(check > 0 && install > check, 'installed after the check');
  assert.ok(install < start.indexOf('applyAuthState('), 'before Studio is shown');
  assert.match(start, /if \(window\.KLABS_BUILD_SYNC !== demoFinancial\) throw new Error\("Demo Mode isolation changed while opening\."\);/);
});

test('Q18 2B: every document shown in the demonstration carries a DEMO watermark: quote, build summary and the invoice', () => {
  assert.match(css, /html\.klabs-demo \.view-quote::after \{[^}]*content:"DEMO";/);
  assert.match(css, /html\.klabs-demo #viewQuoteSheet \[aria-label="Build summary"\] \.view-quote::before \{[^}]*content:"DEMONSTRATION BUILD SUMMARY[^"]*";/);
  assert.match(css, /html\.klabs-demo #invoicePreviewSheet \.invoice-preview__page::after \{[^}]*content:"DEMO";/);
  assert.match(css, /html\.klabs-demo #invoicePreviewSheet \.invoice-preview__page \{[^}]*position:relative;/);
  assert.match(css, /html\.klabs-demo #invoicePreviewSheet \.invoice-preview__page::before \{[^}]*content:"DEMONSTRATION INVOICE[^"]*";/);
  assert.doesNotMatch(css.replace(/html\.klabs-demo [^{]*\{[^}]*\}/g, ''), /content:"DEMO/, 'nothing outside Demo Mode');
});

test('Q18 2B: the iPhone strip is slim while playing - caption above one row of controls (DEMO, Pause, Replay, chapters, Exit demo)', () => {
  const dock = html.slice(html.indexOf('<div id="demoModeBar"'), html.indexOf('<!-- /demoModeBar -->'));
  const controls = dock.slice(dock.indexOf('<div class="demo-player__controls">'));
  assert.match(controls, /<strong class="demo-player__tag"[^>]*>DEMO<\/strong>/);
  assert.match(controls, /<button id="demoPlayerExitBtn" type="button" class="ghost-action demo-player__exit">Exit demo<\/button>/);
  const phone = css.slice(css.indexOf('/* Q18 2B: iPhone strip'));
  assert.ok(phone.length > 0);
  const block = phone.slice(0, phone.indexOf('/* end iPhone strip */'));
  assert.match(block, /@media \(max-width:620px\)/);
  // Phase 3 change: the DEMO bar row is hidden while the player is open at every width (see the slim dock test below),
  // so the iPhone block no longer needs its own rule for it (2B: the rule was here, for phones only).
  assert.match(block, /html\.klabs-demo \.demo-dock\[data-player-open="true"\] \.demo-player__caption \{[^}]*-webkit-line-clamp:2;/);
  assert.match(read('js/demo-director.js'), /dock\.setAttribute\("data-player-open", "true"\)/, 'from Start, and still after the end');
});

test('Q18 Phase 3: the Mac dock is slim too - while the player is open the DEMO bar row steps aside at every width and DEMO and Exit demo sit in the controls row', () => {
  const start = css.indexOf('/* Q18 Phase 3: slim dock');
  assert.ok(start > 0, 'slim dock block');
  const block = css.slice(start, css.indexOf('/* end slim dock */'));
  assert.doesNotMatch(block, /@media/, 'every width, not only phones');
  assert.match(block, /html\.klabs-demo \.demo-dock\[data-player-open="true"\] \.demo-dock__bar \{ display:none; \}/);
  assert.match(block, /html\.klabs-demo \.demo-dock\[data-player-open="true"\] \.demo-player__tag \{[^}]*display:block;/);
  assert.match(block, /html\.klabs-demo \.demo-dock\[data-player-open="true"\] \.demo-player__exit \{[^}]*display:block;/);
  assert.ok(css.indexOf('/* Q18 2B: iPhone strip') > start, 'the phone sizes still follow it');
});

test('Q18 Phase 3: the control the director is using is highlighted (a visible outline and glow, Demo Mode only)', () => {
  const rule = /html\.klabs-demo \[data-demo-highlight\] \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'highlight rule');
  // Q23 final correction: a quieter highlight (no heavy glow), still a clearly visible 2px outline.
  assert.match(rule[1], /outline:2px solid/);
  assert.match(rule[1], /box-shadow:/);
  assert.doesNotMatch(css.replace(rule[0], ''), /(^|[^-\w])\[data-demo-highlight\]/m, 'not used outside Demo Mode');
});

// ---- Phase 3 review: no mixed demonstration files.

test('Q18 Phase 3 review: every demonstration file and the page carry the same build as the app shell', () => {
  const builds = {
    page: /<div id="demoModeBar"[^>]*\sdata-demo-build="([^"]+)"/.exec(html)?.[1],
    guard: /\bbuild: "([^"]+)"/.exec(demoSource)?.[1],
    entry: /const DEMO_BUILD = "([^"]+)";/.exec(entrySource)?.[1],
    data: /\bbuild: "([^"]+)"/.exec(read('js/demo-data.js'))?.[1],
    player: /const DEMO_BUILD = "([^"]+)";/.exec(read('js/demo-director.js'))?.[1],
  };
  assert.deepEqual(builds, { page: BUILD, guard: BUILD, entry: BUILD, data: BUILD, player: BUILD });
});

test('Q18 Phase 3 review: an older copy of any demonstration file is never run with the others - the page refreshes once, after asking for the new version', async () => {
  for (const part of ['page', 'guard', 'data', 'player']) {
    const h = entry({ stale: part });
    let applied = false;
    assert.equal(await h.window.KLABS_PUBLIC_ENTRY.startDemo(() => { applied = true; }), false, part);
    assert.equal(h.window.location.replaced, '/?demo&fresh=1', `${part}: one fresh reload`);
    assert.equal(h.sw.updates, 1, `${part}: the new version was asked for first`);
    assert.equal(applied, false, part);
    assert.equal(h.opened.length, 0, `${part}: the player is never opened`);
    assert.notEqual(h.elements.demoModeBar?.hidden, false, `${part}: the dock is never shown`);
    if (part === 'page' || part === 'guard') assert.deepEqual(h.scripts, [], `${part}: nothing is loaded`);
    if (part === 'data') {
      assert.deepEqual(h.scripts, ['js/demo-data.js'], 'no Studio script runs after older data');
      assert.equal(h.seeded.length, 0, 'older data is never used');
    }
  }
});

test('Q18 Phase 3 review: still mixed after the fresh reload - the visitor returns safely to the public entry with the notice (no reload loop)', async () => {
  for (const part of ['page', 'guard', 'data', 'player']) {
    const h = entry({ stale: part, search: '?demo&fresh=1' });
    assert.equal(await h.window.KLABS_PUBLIC_ENTRY.startDemo(() => {}), false, part);
    assert.equal(h.window.location.replaced, '/#demo-unavailable', part);
    assert.equal(h.opened.length, 0, part);
  }
  // Matching files after the fresh reload: the demonstration opens normally.
  const ok = entry({ search: '?demo&fresh=1' });
  assert.equal(await ok.window.KLABS_PUBLIC_ENTRY.startDemo(() => {}), true);
  assert.deepEqual([...ok.opened], [ok.director]);
  assert.equal(ok.window.location.replaced, undefined);
});
