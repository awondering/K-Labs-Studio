// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  const other = 'bbbbbbbb-0000-0000-0000-000000000002';
  const op = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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
    const root = path.join(__dirname, '..');
    await db.exec(fs.readFileSync(path.join(root, 'SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261111000000_financial_safeguards.sql'), 'utf8'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
    await assert.rejects(db.query(`insert into builds(user_id,client_id,payload) values ($1,$2,$3)`,
      [account, 'build-1', { id: 'build-1', finalCustomerPrice: 200,
        payments: [{ id: 'deposit-1', type: 'deposit', amount: 50, date: '2026-11-10' }], _buildGuardCreate: 1 }]),
    /acknowledged financial operation/);
    await db.query(`insert into builds(user_id,client_id,payload) values ($1,$2,$3)`,
      [account, 'build-1', { id: 'build-1', finalCustomerPrice: 200, _buildGuardCreate: 1 }]);
    let row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    const call = (revision, id, kind, data) => db.query(
      'select klabs_financial_operation($1,$2,$3,$4,$5) as result', ['build-1', revision, op(id), kind, data]);
    const deposit = { id: 'deposit-1', type: 'deposit', amount: 50, date: '2026-11-10' };
    const first = (await call(row.updated_at, 1, 'add_payment', deposit)).rows[0].result;
    const again = (await call(row.updated_at, 1, 'add_payment', deposit)).rows[0].result;
    assert.deepEqual(again, first);
    await assert.rejects(call(row.updated_at, 1, 'add_payment', { ...deposit, amount: 60 }), /different request/);
    await assert.rejects(call(row.updated_at, 2, 'add_payment', { id: 'balance-1', type: 'balance', amount: 30, date: '2026-11-11' }), /build changed/i);
    row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    await assert.rejects(db.query('update builds set payload=$1 where client_id=$2', [
      { ...row.payload, payments: [], _expectedBuildRevision: row.updated_at }, 'build-1'
    ]), /acknowledged financial operation/);
    await call(row.updated_at, 9, 'correct_payment', { ...deposit, date: '2026-11-09', reason: 'Correct date' });
    row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    assert.equal(row.payload.payments[0].id, 'deposit-1');
    assert.equal(row.payload.payments[0].date, '2026-11-09');
    const partial = { id: 'balance-1', type: 'balance', amount: 30, date: '2026-11-11' };
    await call(row.updated_at, 2, 'add_payment', partial);
    row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    await assert.rejects(call(row.updated_at, 3, 'add_payment', { ...partial, id: 'balance-2' }), /already recorded/);
    await assert.rejects(call(row.updated_at, 3, 'add_payment', { ...partial, id: 'balance-2', amount: 121 }), /cannot exceed/);
    await assert.rejects(call(row.updated_at, 3, 'correct_payment', { ...partial, amount: 40 }), /reason/);
    await call(row.updated_at, 3, 'correct_payment', { ...partial, amount: 40, reason: 'Correct receipt' });
    row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    assert.equal(row.payload.payments[0].amount, 50);
    assert.equal(row.payload.payments[1].amount, 40);
    const invoice = { number: `INV-${account.replaceAll('-', '')}-6275696c642d31`, issuedDate: '2026-11-11', total: 200, payments: row.payload.payments };
    await call(row.updated_at, 4, 'issue_invoice', { invoice });
    row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    await assert.rejects(db.query('update builds set payload=$1 where client_id=$2', [
      { ...row.payload, issuedInvoice: { ...invoice, total: 1 }, _expectedBuildRevision: row.updated_at }, 'build-1'
    ]), /issued invoice cannot be changed|acknowledged financial operation/i);
    await assert.rejects(call(row.updated_at, 7, 'issue_invoice', { invoice }), /already been issued/);
    await call(row.updated_at, 5, 'add_payment', { id: 'balance-2', type: 'balance', amount: 110, date: '2026-11-12' });
    row = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['build-1'])).rows[0];
    assert.deepEqual(row.payload.issuedInvoice, invoice);
    await assert.rejects(db.query('select klabs_delete_build_if_revision($1,$2)', ['build-1', row.updated_at]), /issued invoice cannot be deleted/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    await assert.rejects(call(row.updated_at, 6, 'add_payment', partial), /not found/);
    await db.exec(`set request.jwt.claim.sub='${account}'`);
    await db.query('insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
      [account, 'sync-build', { id: 'sync-build', finalCustomerPrice: 100, payments: [], _buildGuardCreate: 1 }]);
    let local = [], loseResponse = true;
    const storage = new Map();
    const client = {
      from() {
        const filters = {};
        const query = {
          select() { return query; }, eq(key, value) { filters[key] = value; return query; },
          order() { return query; }, range() { return query; },
          then(resolve, reject) {
            return (async () => {
              const found = await db.query(`select to_jsonb(b) as row from builds b
                where user_id=$1 and ($2::text is null or client_id=$2) order by client_id`,
              [filters.user_id, filters.client_id || null]);
              return { data: found.rows.map(item => item.row), count: found.rows.length, error: null };
            })().then(resolve, reject);
          },
        };
        return query;
      },
      async rpc(name, args) {
        if (name === 'klabs_build_guard_version') return { data: 2, error: null };
        try {
          const result = await db.query('select klabs_financial_operation($1,$2,$3,$4,$5) as result',
            [args.p_build_id, args.p_revision, args.p_operation_id, args.p_kind, args.p_data]);
          if (loseResponse) { loseResponse = false; return { error: { message: 'response lost' } }; }
          return { data: result.rows[0].result, error: null };
        } catch (error) { return { error }; }
      },
    };
    const window = {
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key) },
      KLABS_ACCOUNT_ID: account, KLABS_CAN_WRITE: () => true, KLABS_SUPABASE_CLIENT: client,
      navigator: { onLine: true }, crypto: { randomUUID: () => op(8) },
      savedBuildRecords: () => local, saveBuildRecords: value => { local = value; }, KLABS_UI: {},
    };
    const context = { window, console, setTimeout: () => 1, clearTimeout() {} };
    for (const file of ['build-sync-journal.js', 'guarded-build-transport.js', 'build-sync.js']) {
      vm.runInNewContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), context);
    }
    const sync = window.KLABS_BUILD_SYNC;
    await sync.onAuthStateChanged({ user: { id: account } });
    const syncPayment = { id: 'sync-payment', type: 'balance', amount: 25, date: '2026-11-11' };
    await assert.rejects(sync.financialOperation('sync-build', 'add_payment', syncPayment), /unconfirmed/);
    assert.equal(local.find(item => item.id === 'sync-build').payments.length, 0);
    const acknowledged = await sync.retryFinancial();
    assert.equal(acknowledged.conflict, false);
    assert.equal(local.find(item => item.id === 'sync-build').payments.length, 1);
    assert.equal((await db.query('select payload from builds where client_id=$1', ['sync-build'])).rows[0].payload.payments.length, 1);
    await db.exec('reset role');
    const audit = await db.query('select previous_payment,request from public.klabs_financial_operations where operation_id=$1', [op(3)]);
    assert.equal(audit.rows[0].previous_payment.amount, 30);
    assert.equal(audit.rows[0].request.reason, 'Correct receipt');
    const depositAudit = await db.query('select previous_payment from public.klabs_financial_operations where operation_id=$1', [op(9)]);
    assert.equal(depositAudit.rows[0].previous_payment.date, '2026-11-10');
    console.log('PASS: isolated financial migration: idempotency, revision conflicts, corrections, settlement, invoice immutability, deletion protection and isolation.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
