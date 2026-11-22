// Q32: isolated database check of supabase/migrations/20261123000000_q32_record_removal.sql and its rollback.
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module. Synthetic data only; nothing leaves the process.
// Loads the existing write guard and financial safeguards, then the Q32 migration, and checks as the signed-in builder:
//  - a payment entry can be removed by an ordinary save; adding or altering one that way is still refused;
//  - the issued invoice can be removed by an ordinary save; altering or adding one that way is still refused;
//  - after removal a corrected invoice is issued through the existing klabs_financial_operation;
//  - a build with an issued invoice can be deleted through klabs_delete_build_if_revision (revision still checked);
//  - the server log klabs_financial_operations keeps every operation after the deletion;
//  - another account cannot touch the build; the rollback restores the previous refusals.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  const other = 'bbbbbbbb-0000-0000-0000-000000000002';
  const op = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const root = path.join(__dirname, '..');
  const sql = (file) => fs.readFileSync(path.join(root, file), 'utf8');
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

  const read = async (id) => (await db.query('select payload,updated_at::text from builds where client_id=$1', [id])).rows[0];
  const call = (id, revision, n, kind, data) => db.query('select klabs_financial_operation($1,$2,$3,$4,$5) as result',
    [id, revision, op(n), kind, data]);
  const save = (id, row, payload) => db.query('update builds set payload=$1 where client_id=$2',
    [{ ...payload, _expectedBuildRevision: row.updated_at }, id]);
  const invoiceFor = (id, total, payments) => ({ number: `INV-${account.replaceAll('-', '')}-${Buffer.from(id).toString('hex')}`,
    issuedDate: '2026-11-23', total, rod: 'Synthetic rod', payments });

  assert.equal((await db.query('select klabs_record_removal_version() as v')).rows[0].v, 1);
  ok('the signed-in builder can read the removal marker (Studio offers Remove only when it is 1)');
  // A build with a deposit, a balance payment and an issued invoice, recorded the normal way.
  await db.query('insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
    [account, 'b1', { id: 'b1', finalCustomerPrice: 500, _buildGuardCreate: 1 }]);
  let row = await read('b1');
  const deposit = { id: 'dep-1', type: 'deposit', amount: 100, date: '2026-11-20' };
  const balance = { id: 'bal-1', type: 'balance', amount: 150, date: '2026-11-21' };
  await call('b1', row.updated_at, 1, 'add_payment', deposit); row = await read('b1');
  await call('b1', row.updated_at, 2, 'add_payment', balance); row = await read('b1');
  await call('b1', row.updated_at, 3, 'issue_invoice', { invoice: invoiceFor('b1', 500, row.payload.payments) }); row = await read('b1');
  assert.ok(row.payload.issuedInvoice && row.payload.payments.length === 2);

  // Payments: altering or adding through an ordinary save is still refused.
  await assert.rejects(save('b1', row, { ...row.payload, payments: [{ ...deposit, amount: 1 }, balance] }), /acknowledged financial operation/);
  await assert.rejects(save('b1', row, { ...row.payload, payments: [deposit, balance, { ...balance, id: 'bal-9' }] }), /acknowledged financial operation/);
  await assert.rejects(save('b1', row, { ...row.payload, payments: [{ ...balance, amount: 1 }] }), /acknowledged financial operation/);
  ok('altering, adding or swapping a payment through an ordinary save is still refused');
  // Removing one entry is allowed and leaves the other unchanged.
  await save('b1', row, { ...row.payload, payments: [deposit] }); row = await read('b1');
  assert.deepEqual(row.payload.payments, [deposit]);
  ok('a payment entry can be removed; the remaining entry is unchanged');

  // Issued invoice: altering or replacing in place is still refused; removing it is allowed.
  await assert.rejects(save('b1', row, { ...row.payload, issuedInvoice: { ...row.payload.issuedInvoice, total: 1 } }),
    /issued invoice cannot be changed|acknowledged financial operation/i);
  ok('an issued invoice cannot be altered in place');
  const { issuedInvoice, ...withoutInvoice } = row.payload;
  await save('b1', row, { ...withoutInvoice, finalCustomerPrice: 450 }); row = await read('b1');
  assert.equal(row.payload.issuedInvoice, undefined); assert.equal(row.payload.finalCustomerPrice, 450);
  ok('the issued invoice can be removed (with a price correction in the same save)');
  await assert.rejects(save('b1', row, { ...row.payload, issuedInvoice }), /acknowledged financial operation/);
  ok('an invoice cannot be put back through an ordinary save');
  // A corrected invoice is issued through the existing operation, at the corrected price.
  await call('b1', row.updated_at, 4, 'issue_invoice', { invoice: invoiceFor('b1', 450, row.payload.payments) }); row = await read('b1');
  assert.equal(row.payload.issuedInvoice.total, 450);
  ok('a corrected invoice is issued through klabs_financial_operation after removal');
  // Payments still cannot exceed the (corrected) invoice.
  await assert.rejects(call('b1', row.updated_at, 5, 'add_payment', { id: 'bal-2', type: 'balance', amount: 351, date: '2026-11-22' }), /cannot exceed/);
  ok('payments are still capped at the current invoice total');

  // Another account cannot change or delete the build.
  await db.exec(`set request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('select klabs_delete_build_if_revision($1,$2) as ok', ['b1', row.updated_at])).rows[0].ok, false);
  await db.exec(`set request.jwt.claim.sub='${account}'`);
  assert.ok(await read('b1'));
  ok('another account cannot delete the build');

  // Deleting a build with an issued invoice: a stale revision is refused, the current one deletes it.
  assert.equal((await db.query('select klabs_delete_build_if_revision($1,$2) as ok', ['b1', '2000-01-01T00:00:00Z'])).rows[0].ok, false);
  assert.equal((await db.query('select klabs_delete_build_if_revision($1,$2) as ok', ['b1', row.updated_at])).rows[0].ok, true);
  assert.equal(await read('b1'), undefined);
  ok('a build with an issued invoice deletes with the current revision; a stale revision does not');
  await db.exec('reset role');
  const log = (await db.query(`select kind from klabs_financial_operations where build_id='b1' order by created_at`)).rows.map((r) => r.kind);
  assert.deepEqual(log, ['add_payment', 'add_payment', 'issue_invoice', 'issue_invoice']);
  ok('the server log still holds every payment and invoice operation after the deletion');

  // Rollback restores the previous refusals.
  await db.exec(sql('SUPABASE-Q32-RECORD-REMOVAL-ROLLBACK-DRAFT.sql'));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
  await db.query('insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
    [account, 'b2', { id: 'b2', finalCustomerPrice: 200, _buildGuardCreate: 1 }]);
  row = await read('b2');
  await call('b2', row.updated_at, 10, 'add_payment', { id: 'dep-2', type: 'deposit', amount: 50, date: '2026-11-20' }); row = await read('b2');
  await call('b2', row.updated_at, 11, 'issue_invoice', { invoice: invoiceFor('b2', 200, row.payload.payments) }); row = await read('b2');
  await assert.rejects(save('b2', row, { ...row.payload, payments: [] }), /acknowledged financial operation/);
  const { issuedInvoice: inv2, ...noInv2 } = row.payload;
  await assert.rejects(save('b2', row, noInv2), /issued invoice cannot be changed|acknowledged financial operation/i);
  await assert.rejects(db.query('select klabs_delete_build_if_revision($1,$2)', ['b2', row.updated_at]), /issued invoice cannot be deleted/);
  await assert.rejects(db.query('select klabs_record_removal_version()'), /does not exist/);
  ok('the rollback restores the previous refusals and removes the marker');
  console.log(`q32 record removal isolated: ${passed} checks passed`);
}
main().catch((error) => { console.error(error); process.exit(1); });
