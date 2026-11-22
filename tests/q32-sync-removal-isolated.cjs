// Q32: two devices running the real js/build-sync.js (with the guarded transport) against an isolated database that has
// the write guard, the financial safeguards and the Q32 migration. Run with PGLITE_MODULE pointing to @electric-sql/pglite.
// Synthetic account and builds only; nothing leaves the process. Checks:
//  - device A removes a payment entry and the issued invoice by an ordinary save; device B receives both removals;
//  - a corrected invoice is then issued through the existing financial operation and reaches device B;
//  - device B deletes the invoiced build; device A loses it on its next sync and it does not come back on later syncs;
//  - an unrelated build of the same account is untouched on both devices and in the cloud.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const account = 'aaaaaaaa-0000-0000-0000-000000000001';
let opCounter = 0;
const nextOp = () => `00000000-0000-4000-8000-${String(++opCounter).padStart(12, '0')}`;

function fakeClient(db) {
  const rows = (result) => result.rows.map((item) => item.row);
  return {
    // build-sync confirms the live session before it treats a missing cloud row as a deletion.
    auth: { getUser: async () => ({ data: { user: { id: account } }, error: null }) },
    from() {
      const filters = {};
      let action = 'select', payload = null;
      const run = async () => {
        try {
          if (action === 'update') {
            return { data: rows(await db.query(`update builds set payload=$1, build_number=$2
              where user_id=$3 and client_id=$4 and updated_at=$5::timestamptz returning to_jsonb(builds.*) as row`,
            [payload.payload, payload.build_number || '', filters.user_id, filters.client_id, filters.updated_at])), error: null };
          }
          if (action === 'insert') {
            return { data: rows(await db.query(`insert into builds(user_id,client_id,build_number,payload) values ($1,$2,$3,$4)
              returning to_jsonb(builds.*) as row`, [payload.user_id, payload.client_id, payload.build_number || '', payload.payload])), error: null };
          }
          const found = rows(await db.query(`select to_jsonb(b) as row from builds b
            where user_id=$1 and ($2::text is null or client_id=$2) order by client_id`, [filters.user_id, filters.client_id || null]));
          return { data: found, count: found.length, error: null };
        } catch (error) { return { data: null, error: { message: error.message } }; }
      };
      const query = {
        select() { return query; }, order() { return query; }, range() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        update(row) { action = 'update'; payload = row; return query; },
        insert(row) { action = 'insert'; payload = row; return query; },
        then(resolve, reject) { return run().then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, args) {
      try {
        if (name === 'klabs_build_guard_version') return { data: (await db.query('select klabs_build_guard_version() as v')).rows[0].v, error: null };
        if (name === 'klabs_record_removal_version') return { data: (await db.query('select klabs_record_removal_version() as v')).rows[0].v, error: null };
        if (name === 'klabs_delete_build_if_revision') {
          return { data: (await db.query('select klabs_delete_build_if_revision($1,$2::timestamptz) as ok', [args.p_client_id, args.p_revision])).rows[0].ok, error: null };
        }
        if (name === 'klabs_financial_operation') {
          return { data: (await db.query('select klabs_financial_operation($1,$2,$3,$4,$5) as result',
            [args.p_build_id, args.p_revision, args.p_operation_id, args.p_kind, args.p_data])).rows[0].result, error: null };
        }
        return { data: null, error: { code: 'PGRST202', message: `unknown ${name}` } };
      } catch (error) { return { data: null, error: { message: error.message } }; }
    },
  };
}

function device(db, name) {
  let local = [];
  const storage = new Map();
  const window = {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    KLABS_ACCOUNT_ID: account, KLABS_CAN_WRITE: () => true, KLABS_SUPABASE_CLIENT: fakeClient(db),
    navigator: { onLine: true }, crypto: { randomUUID: nextOp },
    savedBuildRecords: () => local, saveBuildRecords: (value) => { local = value; }, KLABS_UI: {},
  };
  const context = { window, console, setTimeout: () => 1, clearTimeout() {} };
  for (const file of ['build-sync-journal.js', 'guarded-build-transport.js', 'build-sync.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
  }
  const sync = window.KLABS_BUILD_SYNC;
  return {
    name, sync,
    local: () => JSON.parse(JSON.stringify(local)),
    find: (id) => local.find((item) => String(item.id) === id),
    // Studio's own save path: write the record into the local list, then tell sync (persistBuildRecord does the same).
    save(record) {
      const next = { ...record, savedAt: new Date().toISOString() };
      local = [next, ...local.filter((item) => String(item.id) !== String(record.id))];
      sync.notifyBuildSaved(next);
    },
    // Studio's delete path (deleteSavedEntryById): announce, remove locally, confirm.
    remove(id) {
      const record = local.find((item) => String(item.id) === id);
      sync.notifyBuildDeleted(record);
      local = local.filter((item) => String(item.id) !== id);
      sync.confirmBuildDeleted(id);
    },
  };
}

async function main() {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  let passed = 0;
  const ok = (label) => { passed++; console.log('PASS', label); };
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.klabs_entitlement_can_write(uuid) returns boolean language sql stable
        as $$ select $1 = auth.uid() $$;
      create table public.builds(user_id uuid not null, client_id text not null,
        build_number text not null default '', payload jsonb not null,
        updated_at timestamptz not null default now(), primary key(user_id,client_id));
      alter table public.builds enable row level security;
      create policy own_builds on public.builds to authenticated using (user_id=auth.uid())
        with check (user_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select,insert,update,delete on public.builds to authenticated;
    `);
    for (const file of ['SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql', 'supabase/migrations/20261111000000_financial_safeguards.sql',
      'supabase/migrations/20261123000000_q32_record_removal.sql']) await db.exec(fs.readFileSync(path.join(root, file), 'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
    const cloud = async (id) => (await db.query('select payload from builds where client_id=$1', [id])).rows[0]?.payload;

    const A = device(db, 'A'), B = device(db, 'B');
    await A.sync.onAuthStateChanged({ user: { id: account } });
    await B.sync.onAuthStateChanged({ user: { id: account } });
    assert.equal(await A.sync.recordRemovalSupported(), true);
    ok('the devices see the server removal marker');

    // Device A: an invoiced build with a deposit, plus an unrelated build.
    A.save({ id: 'job-1', buildNumber: '1', customerName: 'Synthetic Customer', finalCustomerPrice: 500, payments: [] });
    A.save({ id: 'other', buildNumber: '2', customerName: 'Another Customer', finalCustomerPrice: 90, payments: [] });
    await A.sync.retry();
    const deposit = { id: 'dep-1', type: 'deposit', amount: 100, date: '2026-11-20' };
    await A.sync.financialOperation('job-1', 'add_payment', deposit);
    const invoice = (total, payments) => ({ number: `INV-${account.replaceAll('-', '')}-${Buffer.from('job-1').toString('hex')}`,
      displayNumber: 'INV-1', issuedDate: '2026-11-23', total, rod: 'Synthetic rod', payments });
    await A.sync.financialOperation('job-1', 'issue_invoice', { invoice: invoice(500, [deposit]) });
    await B.sync.retry();
    assert.equal(B.find('job-1').issuedInvoice.total, 500); assert.equal(B.find('job-1').payments.length, 1);
    ok('device B receives the invoiced build with its deposit');

    // Device A removes the deposit and the invoice and corrects the price, as ordinary saves.
    const edited = A.find('job-1');
    delete edited.issuedInvoice;
    A.save({ ...edited, payments: [], finalCustomerPrice: 450 });
    await A.sync.retry();
    assert.equal(A.sync.getStatus(), 'synced');
    const removed = await cloud('job-1');
    assert.equal(removed.issuedInvoice, undefined); assert.deepEqual(removed.payments, []); assert.equal(removed.finalCustomerPrice, 450);
    ok('device A removes the deposit and the invoice; the cloud accepts the ordinary save');
    await B.sync.retry();
    assert.equal(B.find('job-1').issuedInvoice, undefined); assert.deepEqual(B.find('job-1').payments, []);
    assert.equal(B.sync.getStatus(), 'synced');
    ok('device B receives both removals with no conflict');

    // A corrected invoice through the existing operation reaches B.
    await A.sync.financialOperation('job-1', 'issue_invoice', { invoice: invoice(450, []) });
    await B.sync.retry();
    assert.equal(B.find('job-1').issuedInvoice.total, 450);
    ok('a corrected invoice is issued and reaches device B');

    // Device B deletes the invoiced build; A loses it and it stays gone.
    B.remove('job-1');
    await B.sync.retry();
    assert.equal(await cloud('job-1'), undefined);
    assert.equal(B.sync.getStatus(), 'synced');
    ok('device B deletes the invoiced build in the cloud');
    await A.sync.retry();
    assert.equal(A.find('job-1'), undefined);
    await A.sync.retry(); await B.sync.retry();
    assert.equal(A.find('job-1'), undefined); assert.equal(B.find('job-1'), undefined); assert.equal(await cloud('job-1'), undefined);
    ok('device A loses the deleted build and it does not come back on later syncs');
    assert.equal(A.find('other').customerName, 'Another Customer'); assert.equal(B.find('other').customerName, 'Another Customer');
    assert.equal((await cloud('other')).customerName, 'Another Customer');
    ok('the unrelated build is untouched on both devices and in the cloud');
    console.log(`q32 sync removal isolated: ${passed} checks passed`);
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
