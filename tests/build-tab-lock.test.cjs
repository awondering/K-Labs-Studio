const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'build-tab-lock.js'), 'utf8');
const journalSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'build-sync-journal.js'), 'utf8');
const syncSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'build-sync.js'), 'utf8');

function browser() {
  const held = new Set();
  const locks = {
    request(name, options, callback) {
      assert.equal(options.ifAvailable, true);
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name })).finally(() => held.delete(name));
    },
  };
  function tab(available = true) {
    const listeners = {};
    const window = {
      navigator: available ? { locks } : {},
      addEventListener(name, fn) { listeners[name] = fn; },
      location: { reload() { window.reloaded = true; } },
    };
    vm.runInNewContext(source, { window, console });
    return { window, lock: window.KLABS_BUILD_TAB_LOCK, listeners };
  }
  return { tab };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('only one tab can write for an account; another account remains independent', async () => {
  const b = browser(), first = b.tab(), second = b.tab(), other = b.tab();
  const results = await Promise.allSettled([first.lock.acquire('A'), second.lock.acquire('A')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /another tab/);
  await other.lock.acquire('B');
  assert.equal(first.lock.owns('A'), true);
  assert.equal(second.lock.owns('A'), false);
  assert.equal(other.lock.owns('B'), true);
  first.lock.release();
  other.lock.release();
});

test('closing a tab releases its lock and refreshing reacquires it', async () => {
  const b = browser(), first = b.tab(), second = b.tab();
  await first.lock.acquire('A');
  first.listeners.pagehide({ persisted: false });
  await settle();
  await second.lock.acquire('A');
  assert.equal(first.lock.owns('A'), false);
  assert.equal(second.lock.owns('A'), true);
  second.listeners.pagehide({ persisted: false });
  await settle();
  await first.lock.acquire('A');
  first.listeners.pagehide({ persisted: true });
  assert.equal(first.lock.owns('A'), true);
  first.lock.release();
});

test('unsupported browsers fail closed', async () => {
  const tab = browser().tab(false);
  await assert.rejects(tab.lock.acquire('A'), /cannot safely coordinate/);
  assert.equal(tab.lock.owns('A'), false);
});

test('offline pending payments and invoice snapshots survive closure and the next tab', async () => {
  const b = browser(), first = b.tab(), second = b.tab();
  const values = new Map();
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  function install(tab) {
    const w = tab.window;
    w.localStorage = localStorage;
    w.KLABS_ACCOUNT_ID = 'A';
    w.KLABS_CAN_WRITE = () => w.KLABS_BUILD_TAB_LOCK.owns('A');
    w.KLABS_UI = {};
    w.savedBuildRecords = () => JSON.parse(values.get('builds:A') || '[]');
    w.saveBuildRecords = records => { values.set('builds:A', JSON.stringify(records)); };
    w.KLABS_SUPABASE_CLIENT = { from() {
      const q = { select() { return q; }, eq() { return q; }, order() { return q; },
        range() { return Promise.resolve({ error: { message: 'offline' } }); } };
      return q;
    } };
    vm.runInNewContext(journalSource, { window: w });
    vm.runInNewContext(syncSource, { window: w, console, setTimeout() { return 1; }, clearTimeout() {} });
  }
  await first.lock.acquire('A');
  install(first);
  await first.window.KLABS_BUILD_SYNC.onAuthStateChanged({ user: { id: 'A' } });
  const build = { id: 'unique', payments: [{ amount: 1180.75 }], issuedInvoice: { reference: 'immutable' } };
  first.window.saveBuildRecords([build]);
  first.window.KLABS_BUILD_SYNC.notifyBuildSaved(build);
  await assert.rejects(second.lock.acquire('A'), /another tab/);
  first.lock.release();
  await settle();
  await second.lock.acquire('A');
  install(second);
  await second.window.KLABS_BUILD_SYNC.onAuthStateChanged({ user: { id: 'A' } });
  const state = second.window.KLABS_BUILD_SYNC_JOURNAL.read('A');
  assert.equal(state.pending.unique.record.payments[0].amount, 1180.75);
  assert.equal(state.pending.unique.record.issuedInvoice.reference, 'immutable');
  assert.equal(second.window.savedBuildRecords()[0].id, 'unique');
  second.lock.release();
});

test('an interrupted journal write leaves the previous pending data intact', async () => {
  const tab = browser().tab();
  const values = new Map();
  let interrupted = false;
  tab.window.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
      if (interrupted) throw new Error('storage interrupted');
      values.set(key, value);
    },
  };
  vm.runInNewContext(journalSource, { window: tab.window });
  await tab.lock.acquire('A');
  const journal = tab.window.KLABS_BUILD_SYNC_JOURNAL;
  const state = journal.read('A');
  state.pending.one = { record: { id: 'one', payments: [{ amount: 10 }], issuedInvoice: { id: 'invoice' } } };
  journal.write('A', state);
  const next = journal.read('A');
  next.pending.two = { record: { id: 'two' } };
  interrupted = true;
  assert.throws(() => journal.write('A', next), /storage interrupted/);
  assert.equal(journal.read('A').pending.one.record.issuedInvoice.id, 'invoice');
  assert.equal(journal.read('A').pending.two, undefined);
  tab.lock.release();
});
