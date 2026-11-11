const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));

async function setup() {
  const account = 'account-1';
  let cloud = { user_id: account, client_id: 'build-1', build_number: 'BUILD-1',
    payload: { id: 'build-1', buildNumber: 'BUILD-1', finalCustomerPrice: 200, payments: [] }, updated_at: 'revision-1' };
  let records = [], requests = 0, loseResponse = false, changeAfter = false, nextError = null;
  const ledger = new Map(), storage = new Map();
  const client = {
    from() {
      const filters = {};
      const q = {
        select() { return q; }, eq(k, v) { filters[k] = v; return q; }, order() { return q; }, range() { return q; },
        then(resolve, reject) {
          const matches = filters.user_id === account && (!filters.client_id || filters.client_id === cloud.client_id);
          return Promise.resolve({ data: matches ? [clone(cloud)] : [], count: matches ? 1 : 0, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name, args) {
      if (name === 'klabs_build_guard_version') return { data: 2, error: null };
      requests++;
      if (nextError) { const error = nextError; nextError = null; return { error }; }
      let result = ledger.get(args.p_operation_id);
      if (!result) {
        if (args.p_revision !== cloud.updated_at) return { error: { code: 'P0001', message: 'Build changed.' } };
        const payments = [...cloud.payload.payments, clone(args.p_data)];
        cloud = { ...cloud, payload: { ...cloud.payload, payments }, updated_at: 'revision-2' };
        result = clone(cloud);
        ledger.set(args.p_operation_id, result);
      }
      if (loseResponse) { loseResponse = false; return { error: { message: 'connection lost' } }; }
      if (changeAfter) {
        changeAfter = false;
        cloud = { ...cloud, payload: { ...cloud.payload, note: 'other device' }, updated_at: 'revision-3' };
      }
      return { data: clone(result), error: null };
    },
  };
  const localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const window = { localStorage, navigator: { onLine: true }, crypto: { randomUUID: () => 'operation-uuid' },
    KLABS_ACCOUNT_ID: account, KLABS_CAN_WRITE: () => true, KLABS_SUPABASE_CLIENT: client,
    savedBuildRecords: () => records, saveBuildRecords: value => { records = value; }, KLABS_UI: {} };
  const context = { window, console, setTimeout: () => 1, clearTimeout() {} };
  for (const file of ['build-sync-journal.js', 'guarded-build-transport.js', 'build-sync.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
  }
  const sync = window.KLABS_BUILD_SYNC;
  await sync.onAuthStateChanged({ user: { id: account } });
  return { sync, window, storage, get cloud() { return cloud; }, get records() { return records; },
    get requests() { return requests; }, lose() { loseResponse = true; }, concurrent() { changeAfter = true; },
    rejectNext(error) { nextError = error; } };
}
const payment = { id: 'payment-1', type: 'balance', amount: 25, date: '2026-11-11' };

test('financial operations require connectivity and server acknowledgement', async () => {
  const h = await setup();
  h.window.navigator.onLine = false;
  await assert.rejects(h.sync.financialOperation('build-1', 'add_payment', payment), /Connect/);
  assert.equal(h.requests, 0);
  h.window.navigator.onLine = true;
  const result = await h.sync.financialOperation('build-1', 'add_payment', payment);
  assert.equal(result.conflict, false);
  assert.equal(h.records[0].payments[0].amount, 25);
  assert.equal(h.sync.pendingFinancial(), null);
});

test('lost acknowledgement is retried using the same operation without duplicating a payment', async () => {
  const h = await setup();
  h.lose();
  await assert.rejects(h.sync.financialOperation('build-1', 'add_payment', payment), /unconfirmed/);
  assert.equal(h.cloud.payload.payments.length, 1);
  assert.equal(h.records[0].payments.length, 0);
  await assert.rejects(h.sync.financialOperation('build-1', 'add_payment', { ...payment, id: 'different' }), /Retry/);
  const result = await h.sync.retryFinancial();
  assert.equal(result.conflict, false);
  assert.equal(h.requests, 2);
  assert.equal(h.cloud.payload.payments.length, 1);
  assert.equal(h.records[0].payments.length, 1);
});

test('a sync before retrying a lost acknowledgement does not create a false conflict', async () => {
  const h = await setup();
  h.lose();
  await assert.rejects(h.sync.financialOperation('build-1', 'add_payment', payment), /unconfirmed/);
  await h.sync.retry();
  const result = await h.sync.retryFinancial();
  assert.equal(result.conflict, false);
  assert.equal(h.sync.getStatus(), 'synced');
  assert.equal(h.cloud.payload.payments.length, 1);
  assert.equal(h.records[0].payments.length, 1);
  assert.equal(h.sync.pendingFinancial(), null);
});

test('a later cloud edit still creates a conflict after reconciling an unconfirmed payment', async () => {
  const h = await setup();
  h.lose();
  await assert.rejects(h.sync.financialOperation('build-1', 'add_payment', payment), /unconfirmed/);
  await h.sync.retry();
  h.concurrent();
  const result = await h.sync.retryFinancial();
  assert.equal(result.conflict, true);
  assert.equal(h.sync.getStatus(), 'error');
  assert.equal(h.sync.getConflicts()['build-1'].cloud.payments[0].id, payment.id);
  assert.equal(h.sync.getConflicts()['build-1'].cloud.note, 'other device');
});

test('a concurrent cloud edit creates a reviewable conflict without losing the acknowledged payment', async () => {
  const h = await setup();
  h.concurrent();
  const result = await h.sync.financialOperation('build-1', 'add_payment', payment);
  assert.equal(result.conflict, true);
  assert.equal(h.sync.getStatus(), 'error');
  assert.equal(h.sync.getConflicts()['build-1'].cloud.payments[0].id, payment.id);
  assert.equal(h.sync.getConflicts()['build-1'].cloud.note, 'other device');
  assert.equal(h.sync.getConflicts()['build-1'].local.payments.length, 0);
});

test('a later rejection cannot erase an operation whose earlier outcome was uncertain', async () => {
  const h = await setup();
  h.lose();
  await assert.rejects(h.sync.financialOperation('build-1', 'add_payment', payment), /unconfirmed/);
  h.rejectNext({ code: '42501', message: 'Access denied.' });
  await assert.rejects(h.sync.retryFinancial(), /unconfirmed/);
  assert.ok(h.sync.pendingFinancial());
  await h.sync.retryFinancial();
  assert.equal(h.cloud.payload.payments.length, 1);
  assert.equal(h.sync.pendingFinancial(), null);
});
