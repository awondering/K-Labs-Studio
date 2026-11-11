// Synthetic records in an in-memory PostgreSQL database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const root = path.join(__dirname, '..');
  const sql = name => fs.readFileSync(path.join(root, name), 'utf8');
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  const payment = { id: 'deposit', type: 'deposit', amount: 25, date: '2026-11-10' };
  const operationId = '00000000-0000-4000-8000-000000000001';
  const invoiceId = '00000000-0000-4000-8000-000000000002';
  const rollback = sql('SUPABASE-FINANCIAL-ROLLBACK-DRAFT.sql');
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.klabs_entitlement_can_write(uuid) returns boolean language sql stable
        as $$ select $1 = auth.uid() $$;
      create table public.builds(user_id uuid not null, client_id text not null,
        build_number text not null default '', payload jsonb not null,
        updated_at timestamptz not null default now(), primary key(user_id, client_id));
      alter table public.builds enable row level security;
      alter table public.builds force row level security;
      create policy own_builds on public.builds to authenticated
        using (user_id=auth.uid()) with check (user_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select,insert,update,delete on public.builds to authenticated;
    `);
    await db.query('insert into public.builds(user_id,client_id,payload) values($1,$2,$3)',
      [account, 'legacy-paid', { id: 'legacy-paid', finalCustomerPrice: 100, payments: [payment] }]);
    await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
    await db.exec(sql('supabase/migrations/20261111000000_financial_safeguards.sql'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
    for (const id of ['invoiced', 'plain', 'ledger-only']) {
      await db.query('insert into builds(user_id,client_id,payload) values($1,$2,$3)',
        [account, id, { id, finalCustomerPrice: 100, payments: [], _buildGuardCreate: 1 }]);
    }
    let revision = (await db.query('select updated_at::text from builds where client_id=$1', ['invoiced'])).rows[0].updated_at;
    const invoke = (id, rev, op, kind, data) => db.query(
      'select klabs_financial_operation($1,$2,$3,$4,$5) as result', [id, rev, op, kind, data]);
    await invoke('invoiced', revision, operationId, 'add_payment', payment);
    revision = (await db.query('select updated_at::text from builds where client_id=$1', ['invoiced'])).rows[0].updated_at;
    const invoice = { number: `INV-${account.replaceAll('-', '')}-696e766f69636564`,
      issuedDate: '2026-11-11', total: 100, payments: [payment] };
    await invoke('invoiced', revision, invoiceId, 'issue_invoice', { invoice });
    await db.exec('reset role');
    await db.query(`insert into public.klabs_financial_operations
      (user_id,operation_id,build_id,kind,request,result) values ($1,$2,$3,$4,$5,$6)`,
    [account, '00000000-0000-4000-8000-000000000003', 'ledger-only', 'synthetic', {}, {}]);
    const snapshot = async () => ({
      builds: (await db.query('select user_id,client_id,build_number,payload,updated_at::text from builds order by client_id')).rows,
      ledger: (await db.query('select user_id,operation_id,build_id,kind,request,previous_payment,result,created_at::text from klabs_financial_operations order by operation_id')).rows,
    });
    const before = await snapshot();
    await db.exec('alter table builds disable trigger klabs_protect_build_financials');
    await assert.rejects(db.exec(rollback), /trigger missing, disabled or changed/);
    await db.exec('rollback');
    await db.exec('alter table builds enable trigger klabs_protect_build_financials');
    await db.exec(`create role extra_writer; grant extra_writer to authenticated;
      grant execute on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb) to extra_writer;`);
    await assert.rejects(db.exec(rollback), /Financial write access remains/);
    await db.exec('rollback');
    await db.exec(`revoke extra_writer from authenticated;
      revoke execute on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb) from extra_writer;
      drop role extra_writer`);
    assert.deepEqual(await snapshot(), before);
    await db.exec(`grant execute on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb) to service_role;
      grant insert,update,delete,truncate on public.klabs_financial_operations to service_role`);
    await db.exec(rollback);
    assert.deepEqual(await snapshot(), before);
    const access = (await db.query(`select
      has_function_privilege('authenticated','public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb)','execute') as auth_rpc,
      has_function_privilege('service_role','public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb)','execute') as service_rpc,
      has_table_privilege('service_role','public.klabs_financial_operations','insert,update,delete,truncate') as service_write,
      (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.klabs_financial_operations'::regclass) as ledger_rls`)).rows[0];
    assert.deepEqual(access, { auth_rpc: false, service_rpc: false, service_write: false, ledger_rls: true });

    await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
    const saved = (await db.query('select payload,updated_at::text from builds where client_id=$1', ['invoiced'])).rows[0];
    await assert.rejects(invoke('invoiced', saved.updated_at, operationId, 'add_payment', payment), /permission denied/);
    await assert.rejects(db.query('select * from public.klabs_financial_operations'), /permission denied/);
    await assert.rejects(db.query('update builds set payload=$1 where client_id=$2', [
      { ...saved.payload, payments: [], _expectedBuildRevision: saved.updated_at }, 'invoiced'
    ]), /financial operation|read-only during financial rollback/);
    await assert.rejects(db.query('update builds set payload=$1 where client_id=$2', [
      { ...saved.payload, issuedInvoice: { ...invoice, total: 1 }, _expectedBuildRevision: saved.updated_at }, 'invoiced'
    ]), /issued invoice cannot be changed|financial operation|read-only during financial rollback/i);
    for (const id of ['invoiced', 'legacy-paid', 'ledger-only']) {
      const current = (await db.query('select updated_at::text from builds where client_id=$1', [id])).rows[0];
      await assert.rejects(db.query('select klabs_delete_build_if_revision($1,$2)', [id, current.updated_at]),
        /issued invoice cannot be deleted|financial history cannot be deleted/i);
    }
    await assert.rejects(db.query('update builds set payload=$1 where client_id=$2', [
      { ...saved.payload, note: 'stale edit', _expectedBuildRevision: '2020-01-01T00:00:00Z' }, 'invoiced'
    ]), /Build changed on another device/);
    const edited = await db.query('update builds set payload=$1 where client_id=$2 returning payload', [
      { ...saved.payload, note: 'guarded edit', _expectedBuildRevision: saved.updated_at }, 'invoiced'
    ]);
    assert.deepEqual(edited.rows[0].payload.issuedInvoice, invoice);
    assert.deepEqual(edited.rows[0].payload.payments, [payment]);
    const plain = (await db.query('select updated_at::text from builds where client_id=$1', ['plain'])).rows[0];
    assert.equal((await db.query('select klabs_delete_build_if_revision($1,$2) as deleted', ['plain', plain.updated_at])).rows[0].deleted, true);
    await db.exec('reset role');
    assert.deepEqual((await snapshot()).ledger, before.ledger);
    await assert.rejects(db.query('update builds set payload=$1 where client_id=$2', [
      { ...saved.payload, payments: [] }, 'invoiced'
    ]), /read-only during financial rollback/);
    await assert.rejects(db.query('delete from builds where client_id=$1', ['legacy-paid']), /financial history cannot be deleted/);
    await assert.rejects(db.exec('delete from public.klabs_financial_operations'), /ledger and build truncate are locked/);
    await assert.rejects(db.exec('update public.klabs_financial_operations set kind=kind'), /ledger and build truncate are locked/);
    await assert.rejects(db.exec('truncate public.klabs_financial_operations'), /ledger and build truncate are locked/);
    await assert.rejects(db.exec('truncate public.builds'), /ledger and build truncate are locked/);
    assert.deepEqual((await snapshot()).ledger, before.ledger);
    await db.exec(sql('SUPABASE-BUILD-FREEZE-ENABLE-DRAFT.sql'));
    await assert.rejects(db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-ROLLBACK-DRAFT.sql')), /Unexpected build triggers/);
    await db.exec('rollback');
    assert.deepEqual((await snapshot()).ledger, before.ledger);
    console.log('PASS: protective rollback retains financial rows and ledger; disables financial writes; preserves revision guard and blocks financial deletion.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
