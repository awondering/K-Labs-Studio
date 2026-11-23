// Pricing redesign: tap a payment, change it, Save. Studio sends correct_payment with the same id and type and its own
// fixed reason ('Edited in Studio'), so the builder is never asked for one. Runs the real production SQL (build write
// guard, financial safeguards, Q32 removal) in PGlite - no new migration. Synthetic data only.
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  const op = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const root = path.join(__dirname, '..');
  const sql = (file) => fs.readFileSync(path.join(root, file), 'utf8');
  const ui = sql('js/ui.js');
  const reason = /const PAYMENT_EDIT_REASON='([^']+)';/.exec(ui)[1];
  let passed = 0;
  const ok = (label) => { passed++; console.log('PASS', label); };
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
  await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
  await db.exec(sql('supabase/migrations/20261111000000_financial_safeguards.sql'));
  await db.exec(sql('supabase/migrations/20261123000000_q32_record_removal.sql'));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
  const read = async () => (await db.query('select payload,updated_at::text from builds where client_id=$1', ['b1'])).rows[0];
  const call = (revision, n, kind, data) => db.query('select klabs_financial_operation($1,$2,$3,$4,$5) as result',
    ['b1', revision, op(n), kind, data]);

  assert.ok(reason.trim().length >= 3);
  ok(`Studio's edit reason "${reason}" meets the server rule (3+ characters)`);
  await db.query('insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
    [account, 'b1', { id: 'b1', finalCustomerPrice: 897, _buildGuardCreate: 1 }]);
  let row = await read();
  const deposit = { id: 'dep-1', type: 'deposit', amount: 300, date: '2026-11-20' };
  const payment = { id: 'pay-1', type: 'balance', amount: 150, date: '2026-11-21' };
  await call(row.updated_at, 1, 'add_payment', deposit); row = await read();
  await call(row.updated_at, 2, 'add_payment', payment); row = await read();
  assert.equal(row.payload.payments.length, 2);
  ok('a first payment below the total is a deposit; the next is a payment');

  await call(row.updated_at, 3, 'correct_payment', { ...payment, amount: 175, date: '2026-11-22', reason }); row = await read();
  assert.equal(row.payload.payments.length, 2, 'no new payment');
  assert.deepEqual(row.payload.payments[1], { id: 'pay-1', type: 'balance', amount: 175, date: '2026-11-22' });
  assert.deepEqual(row.payload.payments[0], deposit, 'the other payment is untouched');
  ok('editing a payment updates it in place: same id, same type, same position, nothing added');

  await call(row.updated_at, 4, 'correct_payment', { ...deposit, amount: 250, reason }); row = await read();
  assert.equal(row.payload.payments[0].type, 'deposit');
  assert.equal(row.payload.payments[0].amount, 250);
  ok('editing the deposit keeps it the deposit');

  await assert.rejects(call(row.updated_at, 5, 'correct_payment', { ...payment, amount: 175, date: '2026-11-22', type: 'deposit', reason }),
    /correction reason are required/);
  ok('the type of a payment cannot change through an edit (server rule unchanged)');

  await assert.rejects(call(row.updated_at, 6, 'correct_payment', { ...payment, amount: 648, reason }), /cannot exceed/);
  ok('an edit that would take payments over the total price is refused (server cap unchanged)');

  await assert.rejects(db.query('select 1 from klabs_financial_operations'), /permission denied/);
  await db.exec('reset role'); // the history is server-only; read it as the owner
  const log = (await db.query(`select kind, request->>'reason' as reason, previous_payment->>'amount' as before
    from klabs_financial_operations where kind='correct_payment' order by created_at`)).rows;
  assert.deepEqual(log.map((r) => [r.reason, r.before]), [[reason, '150'], [reason, '300']]);
  ok('the server still keeps each edit with the previous amount in its own history');

  console.log(`payment edit isolated: ${passed} checks passed`);
}
main().catch((error) => { console.error(error); process.exit(1); });
