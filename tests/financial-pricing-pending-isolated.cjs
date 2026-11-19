// Q6: invoices and payments are refused while a Components job's saved pricing is still to be confirmed. Tested against
// the real schema SQL in an in-memory PostgreSQL database. Synthetic data only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module. Pass --without to show today's gap.
const root = path.join(__dirname, '..');
const migration = 'supabase/migrations/20261120000000_financial_pricing_pending.sql';
const rollback = 'SUPABASE-FINANCIAL-PRICING-PENDING-ROLLBACK-DRAFT.sql';
const withMigration = process.argv.includes('--without') ? '0' : '1';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); } catch (error) { results.push(['FAIL', name, error.message.split('\n')[0]]); }
};
async function main() {
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  const other = 'bbbbbbbb-0000-0000-0000-000000000002';
  let opn = 0;
  const op = () => `00000000-0000-4000-8000-${String(++opn).padStart(12, '0')}`;
  await db.exec(`
    create role authenticated; create role anon; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.klabs_entitlement_can_write(uuid) returns boolean language sql stable as $$ select $1 = auth.uid() $$;
    create table public.builds(user_id uuid not null, client_id text not null, build_number text not null default '',
      payload jsonb not null, updated_at timestamptz not null default now(), primary key(user_id,client_id));
    alter table public.builds enable row level security;
    create policy own_builds on public.builds to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
    grant usage on schema auth to authenticated;
    grant select,insert,update,delete on public.builds to authenticated;
  `);
  const sql = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(root, f), 'utf8');
  await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
  await db.exec(sql('supabase/migrations/20261111000000_financial_safeguards.sql'));
  // Existing financial history created BEFORE the migration (must survive untouched).
  const as = (uid) => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${uid}'`);
  await as(account);
  const row = async (id) => (await db.query('select payload, updated_at::text as rev from builds where client_id=$1', [id])).rows[0];
  const create = (id, payload) => db.query('insert into builds(user_id,client_id,payload) values($1,$2,$3)', [account, id, { id, ...payload, _buildGuardCreate: 1 }]);
  const save = async (id, change) => { const r = await row(id); return db.query('update builds set payload=$1 where client_id=$2', [{ ...r.payload, ...change, _expectedBuildRevision: r.rev }, id]); };
  const fin = async (id, kind, data, opId = op()) => { const r = await row(id); return (await db.query('select klabs_financial_operation($1,$2,$3,$4,$5) as result', [id, r.rev, opId, kind, data])).rows[0].result; };
  const invoiceFor = async (id) => { const r = await row(id); return { invoice: { number: `INV-${account.replaceAll('-', '')}-${Buffer.from(id).toString('hex')}`, issuedDate: '2026-11-20', total: r.payload.finalCustomerPrice, payments: r.payload.payments || [] } }; };
  const pay = (id, type, amount, date = '2026-11-20') => ({ id, type, amount, date });
  const components = (lines, extra = {}) => ({ jobType: 'build', jobKind: 'components', quoteStatus: 'Quote', components: lines, ...extra });

  // Pre-existing records (before the migration).
  await create('legacy-invoiced', components([{ name: 'Guide set', unitPrice: 80, quantity: 1 }], { finalCustomerPrice: 80, pricePending: false }));
  await fin('legacy-invoiced', 'add_payment', pay('dep-legacy', 'deposit', 30));
  await fin('legacy-invoiced', 'issue_invoice', await invoiceFor('legacy-invoiced'));
  const legacyBefore = JSON.stringify((await row('legacy-invoiced')).payload);
  await create('legacy-pending-paid', components([{ name: 'Grip', unitPrice: 50, quantity: 1 }], { finalCustomerPrice: 50, pricePending: false }));
  await fin('legacy-pending-paid', 'add_payment', pay('dep-lp', 'deposit', 20));
  await save('legacy-pending-paid', { components: [{ name: 'Grip', unitPrice: 50, quantity: 1 }, { name: 'Tip top', unitPrice: 0, quantity: 1 }], pricePending: true });

  if (withMigration === '1') {
    await db.exec('reset role');
    await db.exec(sql(migration));
    await as(account);
  }

  await check('existing invoice and payments are unchanged by the migration', async () => {
    assert.equal(JSON.stringify((await row('legacy-invoiced')).payload), legacyBefore);
    assert.equal((await row('legacy-pending-paid')).payload.payments.length, 1);
  });
  // Pending Components job (as v263 saves it: one priced line, one $0.00 line, marker true, partial total).
  await create('pending', components([{ name: 'Blank', unitPrice: 120, quantity: 1 }, { name: 'Reel seat', unitPrice: 0, quantity: 1 }], { finalCustomerPrice: 120, pricePending: true }));
  await check('pending: deposit refused', () => assert.rejects(fin('pending', 'add_payment', pay('dep-p', 'deposit', 40)), /Pricing to be confirmed/));
  await check('pending: balance refused', () => assert.rejects(fin('pending', 'add_payment', pay('bal-p', 'balance', 120)), /Pricing to be confirmed/));
  await check('pending: invoice at the partial total refused', async () => assert.rejects(fin('pending', 'issue_invoice', await invoiceFor('pending')), /Pricing to be confirmed/));
  await check('pending: correcting a payment taken before it became pending refused', () =>
    assert.rejects(fin('legacy-pending-paid', 'correct_payment', { ...pay('dep-lp', 'deposit', 25), reason: 'Wrong amount' }), /Pricing to be confirmed/));
  await check('pending: refused operation leaves no record (payments, invoice, ledger)', async () => {
    const r = (await row('pending')).payload;
    assert.deepEqual(r.payments || [], []); assert.equal(r.issuedInvoice, undefined);
    await db.exec('reset role');
    const n = (await db.query("select count(*)::int n from klabs_financial_operations where build_id='pending'")).rows[0].n;
    await as(account); assert.equal(n, 0);
  });
  await check('pending: ordinary sync edits (notes, prices, status) still save', async () => {
    await save('pending', { notes: 'Customer called' });
    assert.equal((await row('pending')).payload.notes, 'Customer called');
  });
  await check('pending: marker string "true" also refused', async () => {
    await create('pending-string', components([{ name: 'X', unitPrice: 0 }], { finalCustomerPrice: 10, pricePending: 'true' }));
    await assert.rejects(fin('pending-string', 'add_payment', pay('d-s', 'deposit', 5)), /Pricing to be confirmed/);
  });
  await check('confirmed: after pricing is saved (marker false) deposit, balance and invoice are accepted', async () => {
    await save('pending', { components: [{ name: 'Blank', unitPrice: 120, quantity: 1 }, { name: 'Reel seat', unitPrice: 45, quantity: 1 }], finalCustomerPrice: 165, pricePending: false });
    await fin('pending', 'add_payment', pay('dep-p', 'deposit', 40));
    await fin('pending', 'add_payment', pay('bal-p', 'balance', 125));
    const issued = await fin('pending', 'issue_invoice', await invoiceFor('pending'));
    assert.equal(issued.payload.issuedInvoice.total, 165);
  });
  await check('a refused operation id can be used again once pricing is confirmed (no stale ledger entry)', async () => {
    await create('retry', components([{ name: 'Y', unitPrice: 0 }], { finalCustomerPrice: 30, pricePending: true }));
    const id = op();
    await assert.rejects(fin('retry', 'add_payment', pay('d-r', 'deposit', 10), id), /Pricing to be confirmed/);
    await save('retry', { components: [{ name: 'Y', unitPrice: 30 }], pricePending: false });
    assert.equal((await fin('retry', 'add_payment', pay('d-r', 'deposit', 10), id)).payload.payments.length, 1);
  });
  await check('rod build and repair (no marker): payments and invoice unchanged', async () => {
    for (const [id, payload] of [['rod', { jobType: 'build', finalCustomerPrice: 450 }], ['repair', { jobType: 'repair', finalCustomerPrice: 90 }], ['components-done', components([{ name: 'Z', unitPrice: 60 }], { finalCustomerPrice: 60, pricePending: false })]]) {
      await create(id, payload);
      await fin(id, 'add_payment', pay('d-' + id, 'deposit', 20));
      await fin(id, 'correct_payment', { ...pay('d-' + id, 'deposit', 25), reason: 'Adjusted deposit' });
      await fin(id, 'issue_invoice', await invoiceFor(id));
      assert.ok((await row(id)).payload.issuedInvoice, id);
    }
  });
  await check('older client (v242): keeps the stored marker, cannot invoice a partly priced job; a current save clears it', async () => {
    // v242 preserves unknown fields (Stage 1 compatibility tests) but does not recompute pricePending.
    await create('old-client', components([{ name: 'A', unitPrice: 70 }, { name: 'B', unitPrice: 0 }], { finalCustomerPrice: 70, pricePending: true }));
    await save('old-client', { notes: 'edited on v242' });
    await assert.rejects(fin('old-client', 'issue_invoice', await invoiceFor('old-client')), /Pricing to be confirmed/);
    await assert.rejects(fin('old-client', 'add_payment', pay('d-o', 'deposit', 20)), /Pricing to be confirmed/);
    // v242 fills in the price; the marker stays stale (true) -> still refused (safe direction) until a current save.
    await save('old-client', { components: [{ name: 'A', unitPrice: 70 }, { name: 'B', unitPrice: 25 }], finalCustomerPrice: 95 });
    await assert.rejects(fin('old-client', 'add_payment', pay('d-o', 'deposit', 20)), /Pricing to be confirmed/);
    await save('old-client', { pricePending: false });
    await fin('old-client', 'add_payment', pay('d-o', 'deposit', 20));
  });
  await check('existing protections unchanged: direct payment edits by the app still refused', async () => {
    await assert.rejects(save('rod', { payments: [] }), /acknowledged financial operation/);
  });
  await check('account isolation unchanged: another account cannot touch these jobs', async () => {
    await as(other);
    const visible = (await db.query("select count(*)::int n from builds")).rows[0].n;
    await assert.rejects(db.query('select klabs_financial_operation($1,now(),$2,$3,$4)', ['rod', op(), 'add_payment', pay('x', 'balance', 1)]), /not found/);
    await as(account);
    assert.equal(visible, 0);
  });
  await check('deleting an invoiced job is still refused; deleting a pending job without invoice unaffected', async () => {
    await assert.rejects(db.query("delete from builds where client_id='legacy-invoiced'"));
    const r = await row('pending-string');
    await db.query('select klabs_delete_build_if_revision($1,$2)', ['pending-string', r.rev]);
    assert.equal(await row('pending-string'), undefined);
  });
  if (withMigration === '1' && rollback) {
    await check('rollback removes only the refusal; records unchanged', async () => {
      const before = JSON.stringify((await db.query('select client_id,payload from builds order by client_id')).rows);
      await db.exec('reset role'); await db.exec(sql(rollback)); await as(account);
      assert.equal(JSON.stringify((await db.query('select client_id,payload from builds order by client_id')).rows), before);
      await create('after-rollback', components([{ name: 'Q', unitPrice: 0 }], { finalCustomerPrice: 15, pricePending: true }));
      await fin('after-rollback', 'add_payment', pay('d-ar', 'deposit', 5));
    });
  }
  for (const r of results) console.log(r.join(' | '));
  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`financial pricing pending isolated: ${results.length - failed} pass, ${failed} fail`);
  if (failed && withMigration === '1') process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
