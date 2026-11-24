// Q36: a component change saved moments before the app is reloaded or closed is not lost.
// The push runs 0.7 s after a save. Before Q36, a reload inside that window let startup's merge keep the cloud copy
// (the edit was lost and deleted components came back). Real Studio in WebKit (iPhone-like: touch, 390 px), with an
// in-memory account cloud that behaves like PostgREST (an upsert changes only the columns sent; updated_at per write).
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... node tests/component-reload-sync-browser.cjs
const path = require('node:path');
const h = require('./helpers/studio-pglite-harness.cjs');

let passed = 0;
let failed = 0;
function ck(name, ok, detail) {
  if (ok) { passed++; console.log('PASS', name); } else { failed++; console.log('FAIL', name, '\n     ', JSON.stringify(detail)); }
}

const root = path.join(__dirname, '..');
const stamp = (() => { let t = Date.parse('2026-11-24T00:00:00Z'); return () => new Date(t += 1000).toISOString(); })();

function cloudHandler(base, cloud) {
  return async (raw) => {
    const s = JSON.parse(raw);
    if ((s.table === 'components' || s.table === 'component_taxonomy') && cloud.down) {
      return JSON.stringify({ data: null, error: { code: 'NETWORK', message: 'offline (test)' } });
    }
    if (s.table === 'components') {
      const ins = Object.fromEntries((s.ins || []).map(([c, v]) => [c, new Set(v)]));
      const match = (r) => (s.filters || []).every(([c, v]) => r[c] === v) && Object.entries(ins).every(([c, set]) => set.has(r[c]));
      if (s.op === 'select') { const rows = [...cloud.rows.values()].filter(match); return JSON.stringify({ data: rows, count: rows.length, error: null }); }
      if (s.op === 'upsert' || s.op === 'insert') {
        (Array.isArray(s.values) ? s.values : [s.values]).forEach((r) => cloud.rows.set(r.client_id, { size_prices: {}, ...(cloud.rows.get(r.client_id) || {}), ...r, updated_at: stamp() }));
        return JSON.stringify({ data: [], error: null });
      }
      if (s.op === 'delete') { [...cloud.rows.values()].filter(match).forEach((r) => cloud.rows.delete(r.client_id)); return JSON.stringify({ data: [], error: null }); }
    }
    if (s.table === 'component_taxonomy') {
      if (s.op === 'select') return JSON.stringify({ data: cloud.taxonomy, error: null });
      cloud.taxonomy = { ...(Array.isArray(s.values) ? s.values[0] : s.values) };
      return JSON.stringify({ data: [cloud.taxonomy], error: null });
    }
    return base(raw);
  };
}

const START = [
  { id: 'wc8', name: 'Probe Winding Check 8 mm', category: 'Winding Checks', subcategory: 'Probe Checks', cost: 2.5, unitCost: 2.5, unitPrice: 6 },
  { id: 'wc10', name: 'Probe Winding Check 10 mm', category: 'Winding Checks', subcategory: 'Probe Checks', cost: 2.75, unitCost: 2.75, unitPrice: 6.5 },
  { id: 'kcc', name: 'Probe K Series CC', category: 'Guides', subcategory: 'Probe Guides', cost: 4, unitCost: 4, unitPrice: 9, sizeOptions: ['6', '8', '10'] },
];

(async () => {
  const db = await h.createDatabase(root);
  const cloud = { rows: new Map(), taxonomy: null, down: false };
  const handler = cloudHandler(h.makeHandler(db, []), cloud);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await h.playwright.webkit.launch();
  const errors = [];
  try {
    // One device, one account library, synced.
    const A = await h.openDevice(browser, base, handler, { width: 390, name: 'iPhone' });
    A.page.on('pageerror', (e) => errors.push(String(e)));
    await h.launch(A, base);
    const p = A.page;
    await p.evaluate(async (start) => { saveComponentLibraryRecords(start); await window.KLABS_SYNC.copyToAccount(); }, START);
    await p.waitForFunction(() => window.KLABS_SYNC.getState().status === 'synced', null, { timeout: 15000 });
    await p.waitForTimeout(1200);
    const local = (id) => p.evaluate((x) => componentLibraryRecords().find((r) => r.id === x) || null, id);
    const save = (fn) => p.evaluate(`saveComponentLibraryRecords((${fn})(componentLibraryRecords()))`);
    const pending = () => p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('klabs-component-cloud-pending-push')).map((k) => JSON.parse(localStorage.getItem(k))).filter(Boolean).length);
    // Reload immediately (inside the 0.7 s push window) and wait for startup sync to settle.
    const reloadNow = async () => {
      await p.reload();
      await p.waitForFunction(() => window.KLABS_UI && window.KLABS_SYNC && ['synced', 'error', 'local'].includes(window.KLABS_SYNC.getState().status) && window.KLABS_SYNC.getState().status !== 'syncing', null, { timeout: 30000 });
      await p.waitForTimeout(1500);
    };
    ck('setup: three components in the account, nothing pending', cloud.rows.size === 3 && (await pending()) === 0, { rows: cloud.rows.size });

    // 1. Edit a price, reload at once.
    await save((records) => records.map((r) => (r.id === 'wc8' ? { ...r, unitPrice: 9 } : r)));
    ck('a save leaves a durable "not yet pushed" marker until the push lands', (await pending()) === 1);
    await reloadNow();
    ck('edit + immediate reload: the new Sell price is kept on the device and in the account',
      (await local('wc8')).unitPrice === 9 && cloud.rows.get('wc8').unit_price === 9, { local: (await local('wc8')).unitPrice, cloud: cloud.rows.get('wc8').unit_price });
    ck('marker cleared once the push is confirmed', (await pending()) === 0);

    // 2. Delete, reload at once.
    await save((records) => records.filter((r) => r.id !== 'wc10'));
    await reloadNow();
    ck('delete + immediate reload: the component stays deleted (device and account)', !(await local('wc10')) && !cloud.rows.has('wc10'));

    // 3. Add, reload at once.
    await save((records) => records.concat([{ id: 'tip', name: 'Probe Tip Top', category: 'Guides', subcategory: 'Probe Guides', cost: 3, unitCost: 3, unitPrice: 7 }]));
    await reloadNow();
    ck('add + immediate reload: the new component is kept (device and account)', !!(await local('tip')) && cloud.rows.has('tip'));

    // 4. Per-size price (Q35), reload at once.
    await save((records) => records.map((r) => (r.id === 'kcc' ? { ...r, sizePrices: { 8: { cost: 4.4, unitPrice: 9.9 } } } : r)));
    await reloadNow();
    ck('per-size price + immediate reload: kept (device and account)',
      JSON.stringify((await local('kcc')).sizePrices) === JSON.stringify({ 8: { cost: 4.4, unitPrice: 9.9 } })
      && JSON.stringify(cloud.rows.get('kcc').size_prices) === JSON.stringify({ 8: { cost: 4.4, unitPrice: 9.9 } }), { local: (await local('kcc')).sizePrices, cloud: cloud.rows.get('kcc').size_prices });

    // 5. Another device changed a DIFFERENT component meanwhile; this device edits, reloads at once.
    cloud.rows.set('tip', { ...cloud.rows.get('tip'), unit_price: 7.5, updated_at: stamp() });
    await save((records) => records.map((r) => (r.id === 'wc8' ? { ...r, unitPrice: 9.5 } : r)));
    await reloadNow();
    ck('another device\'s change to a different component is kept alongside this device\'s edit',
      (await local('wc8')).unitPrice === 9.5 && cloud.rows.get('wc8').unit_price === 9.5 && (await local('tip')).unitPrice === 7.5 && cloud.rows.get('tip').unit_price === 7.5);

    // 5b. The same without any reload: this device's push (after an unrelated save) must not overwrite it either.
    cloud.rows.set('tip', { ...cloud.rows.get('tip'), unit_price: 7.6, updated_at: stamp() });
    await save((records) => records.map((r) => (r.id === 'wc8' ? { ...r, unitPrice: 9.6 } : r)));
    await p.waitForTimeout(2500);
    ck('no reload: pushing this device\'s edit does not overwrite another device\'s change to a different component',
      cloud.rows.get('wc8').unit_price === 9.6 && cloud.rows.get('tip').unit_price === 7.6 && (await local('tip')).unitPrice === 7.6, { cloudTip: cloud.rows.get('tip').unit_price, localTip: (await local('tip')).unitPrice });

    // 6. Another device added a component meanwhile.
    cloud.rows.set('ring', { ...cloud.rows.get('tip'), client_id: 'ring', name: 'Probe Hook Keeper', unit_price: 4, updated_at: stamp() });
    await save((records) => records.map((r) => (r.id === 'tip' ? { ...r, unitPrice: 7.75 } : r)));
    await reloadNow();
    ck('a component added on another device is pulled in; this device\'s edit kept', !!(await local('ring')) && (await local('tip')).unitPrice === 7.75 && cloud.rows.get('tip').unit_price === 7.75);

    // 7. Same component changed on both devices before either synced: resolves exactly as it does without a reload
    // (the existing in-session rule; whole-record, unchanged by Q36). Device and account end up identical.
    cloud.rows.set('wc8', { ...cloud.rows.get('wc8'), notes: 'changed elsewhere', updated_at: stamp() });
    await save((records) => records.map((r) => (r.id === 'wc8' ? { ...r, unitPrice: 10 } : r)));
    await reloadNow();
    const w = await local('wc8');
    ck('same component on two devices: device and account agree after the reload (no half-applied state)',
      w.unitPrice === cloud.rows.get('wc8').unit_price && String(w.notes || '') === String(cloud.rows.get('wc8').notes || ''), { local: [w.unitPrice, w.notes], cloud: [cloud.rows.get('wc8').unit_price, cloud.rows.get('wc8').notes] });

    // 8. Offline: save, reload while still offline, then reload online.
    cloud.down = true;
    await save((records) => records.map((r) => (r.id === 'tip' ? { ...r, unitPrice: 8 } : r)));
    await p.waitForTimeout(1500);
    await reloadNow();
    const offline = { local: (await local('tip')).unitPrice, cloud: cloud.rows.get('tip').unit_price, pending: await pending() };
    ck('offline save + reload: kept on the device, still marked as not pushed', offline.local === 8 && offline.cloud === 7.75 && offline.pending === 1, offline);
    cloud.down = false;
    await reloadNow();
    ck('back online + reload: the offline edit is pushed, nothing pending', (await local('tip')).unitPrice === 8 && cloud.rows.get('tip').unit_price === 8 && (await pending()) === 0);

    // 9. Nothing pending: startup still merges as before - a change from another device is pulled in.
    cloud.rows.set('wc8', { ...cloud.rows.get('wc8'), unit_price: 11, updated_at: stamp() });
    await reloadNow();
    ck('no pending change: startup pulls another device\'s edit (unchanged behaviour)', (await local('wc8')).unitPrice === 11);

    // 10. Waiting past the push window still works.
    await save((records) => records.map((r) => (r.id === 'wc8' ? { ...r, unitPrice: 12 } : r)));
    await p.waitForTimeout(2500);
    ck('edit without a reload pushes within the window, marker cleared', cloud.rows.get('wc8').unit_price === 12 && (await pending()) === 0);
    await reloadNow();
    ck('...and survives a later reload', (await local('wc8')).unitPrice === 12);

    const unexpected = errors.filter((e) => !e.includes('offline (test)'));
    ck('no page errors', unexpected.length === 0, unexpected);
    await A.context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`component reload sync: ${passed}/${passed + failed} checks passed`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
