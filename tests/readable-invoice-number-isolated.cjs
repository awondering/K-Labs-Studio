// Q7: the real server invoice rules accept a readable displayNumber alongside the unchanged internal number, store it
// once, and never allow it to be changed or added afterwards. Synthetic records in an in-memory PostgreSQL database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const root = path.join(__dirname, '..');
  const sql = (name) => fs.readFileSync(path.join(root, name), 'utf8');
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  const payment = { id: 'deposit', type: 'deposit', amount: 25, date: '2026-11-10' };
  const internal = (id) => `INV-${account.replaceAll('-', '')}-${Buffer.from(id).toString('hex')}`;
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.klabs_entitlement_can_write(uuid) returns boolean language sql stable as $$ select $1 = auth.uid() $$;
    create table public.builds(user_id uuid not null, client_id text not null, build_number text not null default '',
      payload jsonb not null, updated_at timestamptz not null default now(), primary key(user_id, client_id));
    alter table public.builds enable row level security;
    alter table public.builds force row level security;
    create policy own_builds on public.builds to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
    grant usage on schema auth to authenticated;
    grant select,insert,update,delete on public.builds to authenticated;
  `);
  await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
  await db.exec(sql('supabase/migrations/20261111000000_financial_safeguards.sql'));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
  for (const id of ['readable', 'legacy', 'wrong']) {
    await db.query('insert into builds(user_id,client_id,payload) values($1,$2,$3)',
      [account, id, { id, quoteNumber: 'Q-1042', finalCustomerPrice: 100, payments: [], _buildGuardCreate: 1 }]);
  }
  const revision = async (id) => (await db.query('select updated_at::text from builds where client_id=$1', [id])).rows[0].updated_at;
  const payload = async (id) => (await db.query('select payload from builds where client_id=$1', [id])).rows[0].payload;
  let op = 10;
  const invoke = async (id, kind, data) => db.query('select klabs_financial_operation($1,$2,$3,$4,$5) as result',
    [id, await revision(id), `00000000-0000-4000-8000-0000000000${op++}`, kind, data]);
  for (const id of ['readable', 'legacy', 'wrong']) await invoke(id, 'add_payment', payment);

  // 1. New invoice with displayNumber: accepted, stored exactly, internal number unchanged.
  const invoice = { number: internal('readable'), displayNumber: 'INV-1042', issuedDate: '2026-11-19', total: 100, payments: [payment] };
  await invoke('readable', 'issue_invoice', { invoice });
  assert.deepEqual((await payload('readable')).issuedInvoice, invoice);

  // 2. A readable number never replaces the internal one: a short `number` is refused by the server.
  await assert.rejects(invoke('wrong', 'issue_invoice', { invoice: { ...invoice, number: 'INV-1042' } }), /Invoice does not match the saved build/);
  assert.equal((await payload('wrong')).issuedInvoice, undefined);

  // 3. Existing invoice (no displayNumber) cannot gain one later, and an issued displayNumber cannot be changed.
  const legacy = { number: internal('legacy'), issuedDate: '2026-11-01', total: 100, payments: [payment] };
  await invoke('legacy', 'issue_invoice', { invoice: legacy });
  await assert.rejects(invoke('legacy', 'issue_invoice', { invoice: { ...legacy, displayNumber: 'INV-1042' } }), /already been issued/);
  const tryUpdate = async (id, change) => {
    const p = await payload(id);
    await db.query('update builds set payload=$1 where client_id=$2', [{ ...p, issuedInvoice: { ...p.issuedInvoice, ...change } }, id]);
  };
  await assert.rejects(tryUpdate('legacy', { displayNumber: 'INV-1042' }));
  await assert.rejects(tryUpdate('readable', { displayNumber: 'INV-9' }));
  assert.deepEqual((await payload('legacy')).issuedInvoice, legacy);
  assert.deepEqual((await payload('readable')).issuedInvoice, invoice);
  console.log('readable invoice number isolated: 3 scenarios passed');
}
main().catch((error) => { console.error(error); process.exit(1); });
