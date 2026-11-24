// Q35 per-size prices: the additive migration and its rollback against the real component SQL, in an in-memory
// PostgreSQL (PGlite). Synthetic records only. Models production: components created by the setup script as it was
// before Q35 (no size_prices), existing rows (a legacy multi-size component, one-component-per-size rows, a standalone
// component), then the migration, v284 and v283 (older) client upserts in PostgREST's upsert form, row security,
// the CHECK, idempotence, and the rollback.
// Usage: PGLITE_MODULE=... node tests/q35-size-prices-isolated.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
const ck = (name, fn) => Promise.resolve(fn()).then(() => { passed++; console.log('PASS', name); });

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const root = path.join(__dirname, '..');
  const sql = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const migration = sql('supabase/migrations/20261125000000_q35_component_size_prices.sql');
  const rollback = sql('SUPABASE-Q35-COMPONENT-SIZE-PRICES-ROLLBACK-DRAFT.sql');
  // The setup script as production ran it: without the Q35 fresh-install line.
  const setup = sql('SUPABASE-COMPONENT-SYNC.sql').split('\n').filter((line) => !/size_prices/.test(line)).join('\n');
  assert.ok(!/size_prices/.test(setup));

  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users(id) values ('${A}'), ('${B}');
  `);
  await db.exec(setup);
  await db.exec(sql('SUPABASE-COMPONENT-SIZES.sql'));
  const as = (user) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${user}'`);
  const asOwner = () => db.exec('reset role');

  // PostgREST upsert (onConflict user_id,client_id): insert the payload's columns; on conflict update exactly those.
  const upsert = async (row) => {
    const cols = Object.keys(row);
    const values = cols.map((c) => (row[c] !== null && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c]));
    const casts = cols.map((c, i) => `$${i + 1}${['size_options', 'size_prices'].includes(c) ? '::jsonb' : ''}`);
    const set = cols.filter((c) => !['user_id', 'client_id'].includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
    return db.query(`insert into public.components (${cols.join(', ')}) values (${casts.join(', ')})
      on conflict (user_id, client_id) do update set ${set}`, values);
  };
  const base = (client_id, name, cost, unit_price, size_options = [], extra = {}) => ({
    user_id: A, client_id, name, category: 'Guides', category_id: 'guides', subcategory: 'Fuji Guides', supplier: 'PacBay', brand: 'Fuji',
    variant: '', description: `${name} details`, customer_label: '', unit: '', quantity: null, unit_cost: cost, unit_price, cost,
    stock_on_hand: 7, specifications: '', notes: 'keep me', size_options, updated_at: '2026-11-01T00:00:00Z', ...extra,
  });
  const SIZES = ['5.5', '6', '7', '8', '10', '12', '16', '20', '25', '30'];
  // Existing data, written by the v283 client (no size_prices column yet).
  await as(A);
  await upsert(base('kcc', 'Fuji K Series Single Foot CC', 4, 9, SIZES));
  await upsert(base('wc8', 'Aluminium Winding Check 8 mm', 2.5, 6));
  await upsert(base('wc10', 'Aluminium Winding Check 10 mm', 2.75, 6.5));
  await upsert(base('tip', 'Fuji Tip Top', 3, 7));
  await as(B);
  await upsert({ ...base('other', 'Other account part', 1, 2), user_id: B });
  await asOwner();
  const snapshot = async () => (await db.query(`select client_id, user_id, name, category, category_id, subcategory, supplier, brand, variant, description,
      customer_label, unit, quantity, unit_cost, unit_price, cost, stock_on_hand, specifications, notes, size_options, id, created_at, updated_at
      from public.components order by client_id`)).rows;
  const before = await snapshot();

  await ck('before the migration, a v284 upsert naming size_prices is refused (so the migration must be applied first)', async () => {
    await as(A);
    await assert.rejects(upsert({ ...base('kcc', 'Fuji K Series Single Foot CC', 4, 9, SIZES), size_prices: {} }), /size_prices/);
    await asOwner();
  });

  await db.exec(migration);
  await ck('migration: adds size_prices jsonb NOT NULL default {} with an object CHECK', async () => {
    const col = (await db.query(`select data_type, is_nullable, column_default from information_schema.columns
      where table_schema='public' and table_name='components' and column_name='size_prices'`)).rows[0];
    assert.deepEqual([col.data_type, col.is_nullable], ['jsonb', 'NO']);
    assert.match(col.column_default, /'\{\}'::jsonb/);
    assert.equal((await db.query(`select count(*)::int n from pg_constraint where conname='components_size_prices_is_object'`)).rows[0].n, 1);
  });
  await ck('migration: every existing row (both accounts) is unchanged - ids, prices, stock, size lists, timestamps - with size_prices {}', async () => {
    assert.deepEqual(await snapshot(), before);
    const prices = (await db.query('select client_id, size_prices from public.components order by client_id')).rows;
    assert.ok(prices.every((r) => JSON.stringify(r.size_prices) === '{}'), JSON.stringify(prices));
  });
  await ck('migration: re-running it is a no-op', async () => {
    await db.exec(migration);
    assert.deepEqual(await snapshot(), before);
  });

  await ck('v284 client: per-size prices for two sizes are stored on the same component (same id, stock, size list, shared price)', async () => {
    await as(A);
    await upsert({ ...base('kcc', 'Fuji K Series Single Foot CC', 4, 9, SIZES, { updated_at: '2026-11-25T00:00:00Z' }),
      size_prices: { 6: { cost: 4.1, unitPrice: 9.4 }, 30: { cost: 7.2, unitPrice: 15.5 } } });
    await asOwner();
    const row = (await db.query(`select * from public.components where client_id='kcc'`)).rows[0];
    const old = before.find((r) => r.client_id === 'kcc');
    assert.deepEqual(row.size_prices, { 6: { cost: 4.1, unitPrice: 9.4 }, 30: { cost: 7.2, unitPrice: 15.5 } });
    for (const key of ['id', 'name', 'unit_cost', 'unit_price', 'cost', 'stock_on_hand', 'size_options', 'notes', 'created_at']) assert.deepEqual(row[key], old[key], key);
  });
  await ck('older v283 client: its upsert (no size_prices) of the same component leaves the per-size prices intact', async () => {
    await as(A);
    await upsert(base('kcc', 'Fuji K Series Single Foot CC', 4, 9.25, SIZES, { updated_at: '2026-11-26T00:00:00Z' }));
    await asOwner();
    const row = (await db.query(`select unit_price, size_prices from public.components where client_id='kcc'`)).rows[0];
    assert.equal(Number(row.unit_price), 9.25);
    assert.deepEqual(row.size_prices, { 6: { cost: 4.1, unitPrice: 9.4 }, 30: { cost: 7.2, unitPrice: 15.5 } });
  });
  await ck('older v283 client: a new component it creates gets size_prices {} (no per-size prices)', async () => {
    await as(A);
    await upsert(base('new283', 'Fuji Guide Set', 50, 100));
    await asOwner();
    assert.deepEqual((await db.query(`select size_prices from public.components where client_id='new283'`)).rows[0].size_prices, {});
  });
  await ck('the CHECK refuses a non-object size_prices', async () => {
    await as(A);
    await assert.rejects(upsert({ ...base('wc8', 'Aluminium Winding Check 8 mm', 2.5, 6), size_prices: ['bad'] }), /components_size_prices_is_object/);
    await asOwner();
  });
  await ck('row security unchanged: another account cannot read or change the per-size prices', async () => {
    await as(B);
    assert.equal((await db.query(`select count(*)::int n from public.components where client_id='kcc'`)).rows[0].n, 0);
    const result = await db.query(`update public.components set size_prices='{}'::jsonb where client_id='kcc'`);
    assert.equal(result.affectedRows || 0, 0);
    await asOwner();
    assert.notDeepEqual((await db.query(`select size_prices from public.components where client_id='kcc'`)).rows[0].size_prices, {});
  });
  await ck('the other components (winding checks, tip top, the other account) are untouched by all of this', async () => {
    const now = (await snapshot()).filter((r) => ['wc8', 'wc10', 'tip', 'other'].includes(r.client_id));
    assert.deepEqual(now, before.filter((r) => ['wc8', 'wc10', 'tip', 'other'].includes(r.client_id)));
  });

  const exported = (await db.query(`select user_id, client_id, name, size_prices from public.components where size_prices <> '{}'::jsonb`)).rows;
  await ck('rollback pre-step: the export query lists exactly the components with per-size prices', async () => {
    assert.deepEqual(exported.map((r) => r.client_id), ['kcc']);
  });
  const beforeRollback = await snapshot();
  await db.exec(rollback);
  await ck('rollback: removes the column and CHECK; every other column of every row is unchanged', async () => {
    assert.equal((await db.query(`select count(*)::int n from information_schema.columns where table_name='components' and column_name='size_prices'`)).rows[0].n, 0);
    assert.equal((await db.query(`select count(*)::int n from pg_constraint where conname='components_size_prices_is_object'`)).rows[0].n, 0);
    assert.deepEqual(await snapshot(), beforeRollback);
  });
  await ck('rollback: an older v283 client syncs normally afterwards', async () => {
    await as(A);
    await upsert(base('wc8', 'Aluminium Winding Check 8 mm', 2.5, 6.1));
    await asOwner();
    assert.equal(Number((await db.query(`select unit_price from public.components where client_id='wc8'`)).rows[0].unit_price), 6.1);
  });
  await ck('re-applying the migration after a rollback works (size_prices back as {})', async () => {
    await db.exec(migration);
    assert.equal((await db.query(`select count(*)::int n from public.components where size_prices = '{}'::jsonb`)).rows[0].n,
      (await db.query('select count(*)::int n from public.components')).rows[0].n);
  });
  console.log(`q35 size_prices database: ${passed} checks passed`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
