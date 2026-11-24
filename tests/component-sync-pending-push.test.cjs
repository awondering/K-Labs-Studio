// Q36: component changes saved just before a reload/close are resumed at startup, and a push never overwrites a
// component this device did not change. js/component-sync.js in a vm with an in-memory PostgREST-like cloud.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'component-sync.js'), 'utf8');
const PENDING = `klabs-component-cloud-pending-push:${USER}`;
const LINKED = `klabs-component-cloud-linked:${USER}`;
const KNOWN_CONTENT = `klabs-component-cloud-known-content:${USER}`;
const KNOWN_UPDATED = `klabs-component-cloud-known-updated:${USER}`;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One "device": its own storage (survives a reload) and a fresh copy of the sync module per page load.
function device(cloud, store = new Map()) {
  let local = store.get('records') || [];
  const window = {
    Store: { get: (k, f) => (store.has(k) ? store.get(k) : f), set: (k, v) => store.set(k, v) },
    componentLibraryRecords: () => local.map((r) => ({ ...r })),
    saveComponentLibraryRecords: (records) => { local = records.map((r) => ({ ...r })); store.set('records', local); window.KLABS_SYNC.notifyComponentsChanged(); },
    ensureStudioComponentTaxonomyLoaded: () => ({ categories: [], suppliers: [] }),
    KLABS_UI: { applyCloudComponentTaxonomy() {}, refreshComponentLibraryViews() {}, renderComponentSyncStatus() {} },
    KLABS_SUPABASE_CLIENT: {
      from(table) {
        const q = { filters: [], ins: null };
        const run = async (result) => { if (cloud.gate) await cloud.gate; if (cloud.down) return { data: null, error: { message: 'offline (test)' } }; return result(); };
        Object.assign(q, {
          select() { return q; },
          eq(c, v) { q.filters.push([c, v]); return q; },
          in(c, v) { q.ins = [c, new Set(v)]; return q; },
          maybeSingle: () => run(() => ({ data: table === 'component_taxonomy' ? cloud.taxonomy : null, error: null })),
          upsert(rows) {
            return run(() => {
              if (table === 'component_taxonomy') { cloud.taxonomy = rows; return { error: null }; }
              (Array.isArray(rows) ? rows : [rows]).forEach((r) => { cloud.writes.push(r.client_id); cloud.rows.set(r.client_id, { ...(cloud.rows.get(r.client_id) || {}), ...r, updated_at: `t${++cloud.clock}` }); });
              return { error: null };
            });
          },
          delete() { q.del = true; return q; },
          then(resolve, reject) {
            return run(() => {
              const match = (r) => q.filters.every(([c, v]) => r[c] === v) && (!q.ins || q.ins[1].has(r[q.ins[0]]));
              const rows = [...cloud.rows.values()].filter(match);
              if (q.del) { rows.forEach((r) => cloud.rows.delete(r.client_id)); return { data: rows, error: null }; }
              return { data: rows.map((r) => ({ ...r })), error: null };
            }).then(resolve, reject);
          },
        });
        return q;
      },
    },
  };
  vm.runInNewContext(SOURCE, { window, console: { ...console, error() {} }, setTimeout, clearTimeout });
  return { window, store, sync: window.KLABS_SYNC, local: () => local };
}
const newCloud = () => ({ rows: new Map(), taxonomy: null, writes: [], clock: 0, down: false, gate: null });
const settle = async (d) => { for (let i = 0; i < 200 && d.sync.getState().status === 'syncing'; i++) await wait(5); };
async function linkedDevice(cloud, records) {
  const d = device(cloud);
  d.store.set('records', records);
  const fresh = device(cloud, d.store);
  await fresh.sync.onAuthStateChanged({ user: { id: USER } });
  await fresh.sync.copyToAccount();
  assert.equal(fresh.sync.getState().status, 'synced');
  return fresh;
}

const A = { id: 'a', name: 'Winding Check 8 mm', category: 'Winding Checks', cost: 2.5, unitCost: 2.5, unitPrice: 6 };
const B = { id: 'b', name: 'Tip Top', category: 'Guides', cost: 3, unitCost: 3, unitPrice: 7 };

test('a save marks the change as not yet pushed; the confirmed push clears it', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  assert.ok(!d.store.get(PENDING));
  assert.ok(Object.keys(d.store.get(KNOWN_CONTENT)).length === 2, 'content fingerprints stored at sync');
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)));
  assert.ok(d.store.get(PENDING), 'marked before the 0.7 s push');
  await wait(800); await settle(d);
  assert.equal(cloud.rows.get('a').unit_price, 9);
  assert.equal(d.store.get(PENDING), '');
});

test('reload before the push: startup pushes the edit instead of keeping the older cloud copy', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)).filter((r) => r.id !== 'b'));
  const next = device(cloud, d.store); // reload: the timer and in-memory state are gone, storage remains
  await next.sync.onAuthStateChanged({ user: { id: USER } });
  await settle(next);
  assert.equal(next.local().find((r) => r.id === 'a').unitPrice, 9);
  assert.equal(cloud.rows.get('a').unit_price, 9);
  assert.ok(!next.local().some((r) => r.id === 'b') && !cloud.rows.has('b'), 'a deleted component stays deleted');
  assert.equal(next.store.get(PENDING), '');
});

test('a save made while a push is in flight keeps its own marker (and is pushed next)', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  let open;
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)));
  cloud.gate = new Promise((resolve) => { open = resolve; });
  await wait(800); // first push has started and is held at the cloud
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'b' ? { ...r, unitPrice: 8 } : r)));
  const second = d.store.get(PENDING);
  cloud.gate = null; open(); await tick(); await settle(d);
  assert.equal(cloud.rows.get('a').unit_price, 9, 'first push landed');
  assert.equal(d.store.get(PENDING), second, 'the first push did not clear the later save\'s marker');
  // Reload before the second push would run: the later save must still be resumed.
  const next = device(cloud, d.store);
  await next.sync.onAuthStateChanged({ user: { id: USER } });
  await settle(next);
  assert.equal(cloud.rows.get('b').unit_price, 8);
  assert.equal(cloud.rows.get('a').unit_price, 9);
});

test('a failed push keeps the marker; the edit is pushed on a later start', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  cloud.down = true;
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)));
  await wait(800); await settle(d);
  assert.equal(d.sync.getState().status, 'error');
  assert.ok(d.store.get(PENDING));
  cloud.down = false;
  const next = device(cloud, d.store);
  await next.sync.onAuthStateChanged({ user: { id: USER } });
  await settle(next);
  assert.equal(cloud.rows.get('a').unit_price, 9);
  assert.equal(next.store.get(PENDING), '');
});

test('a component this device did not change takes the other device\'s change instead of overwriting it', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  cloud.rows.set('b', { ...cloud.rows.get('b'), unit_price: 7.5, updated_at: 'elsewhere-1' });
  cloud.writes.length = 0;
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)));
  await wait(800); await settle(d);
  assert.equal(cloud.rows.get('b').unit_price, 7.5);
  assert.equal(d.local().find((r) => r.id === 'b').unitPrice, 7.5);
  assert.deepEqual(cloud.writes, ['a'], 'only the edited component is uploaded');
});

test('changed on both devices: the existing whole-record rule still decides (unchanged by Q36)', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  cloud.rows.set('a', { ...cloud.rows.get('a'), unit_price: 7, notes: 'set elsewhere', updated_at: 'elsewhere-2' });
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)));
  await wait(800); await settle(d);
  // The cloud side has more filled-in detail (notes), so it wins as a whole - as before.
  assert.equal(cloud.rows.get('a').notes, 'set elsewhere');
  assert.equal(d.local().find((r) => r.id === 'a').notes, 'set elsewhere');
});

test('a device synced by an older build (no content fingerprints) behaves exactly as before', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  d.store.delete(KNOWN_CONTENT);
  cloud.rows.set('b', { ...cloud.rows.get('b'), unit_price: 7.5, updated_at: 'elsewhere-3' });
  d.window.saveComponentLibraryRecords(d.local().map((r) => (r.id === 'a' ? { ...r, unitPrice: 9 } : r)));
  await wait(800); await settle(d);
  assert.equal(cloud.rows.get('a').unit_price, 9);
  // Without a fingerprint the previous whole-record rule applies (tie keeps this device's copy).
  assert.equal(cloud.rows.get('b').unit_price, 7);
  assert.ok(Object.keys(d.store.get(KNOWN_CONTENT)).length === 2, 'fingerprints recorded from this sync on');
  assert.ok(d.store.get(KNOWN_UPDATED));
});

test('no pending change: startup uses the merge as before; linked flag untouched', async () => {
  const cloud = newCloud();
  const d = await linkedDevice(cloud, [A, B]);
  cloud.rows.set('a', { ...cloud.rows.get('a'), unit_price: 11, updated_at: 'elsewhere-4' });
  const next = device(cloud, d.store);
  await next.sync.onAuthStateChanged({ user: { id: USER } });
  await settle(next);
  assert.equal(next.local().find((r) => r.id === 'a').unitPrice, 11);
  assert.equal(next.store.get(LINKED), true);
});
