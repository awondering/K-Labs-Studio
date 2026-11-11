// Synthetic accounts and an in-memory PostgreSQL database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the @electric-sql/pglite module path.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const sql = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const frozen = '56182f95-eba7-4d45-bd9b-95fd223b27e5';
  const testAccount = 'aaaaaaaa-0000-0000-0000-000000000001';
  const payload = { customer: 'Synthetic customer', payments: [{ amount: 125 }], issuedInvoice: { reference: 'TEST' } };
  const rollback = sql('SUPABASE-BUILD-WRITE-GUARD-ROLLBACK-DRAFT.sql');
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.klabs_entitlement_can_write(p uuid) returns boolean language sql stable
        as $$ select p=auth.uid() $$;
      create table public.builds (
        user_id uuid not null, client_id text not null, build_number text not null default '',
        payload jsonb not null, updated_at timestamptz not null default now(), primary key(user_id,client_id)
      );
      alter table public.builds enable row level security;
      alter table public.builds force row level security;
      create policy own_builds on public.builds to authenticated
        using (user_id=auth.uid()) with check (user_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select,insert,update,delete on public.builds to authenticated;
    `);
    for (const id of [frozen, testAccount]) {
      await db.query('insert into public.builds(user_id,client_id,payload) values($1,$2,$3)', [id, 'synthetic', payload]);
    }
    const snapshot = () => db.query('select user_id, client_id, build_number, payload, updated_at::text from public.builds order by user_id');
    const baseline = (await snapshot()).rows;
    const policy = (await db.query("select * from pg_policies where schemaname='public' and tablename='builds'")).rows;
    const grants = (await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='builds' order by grantee,privilege_type")).rows;
    await db.exec(sql('SUPABASE-BUILD-FREEZE-ENABLE-DRAFT.sql'));
    await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));

    await db.exec(`set role authenticated; set request.jwt.claim.sub='${testAccount}';`);
    await assert.rejects(db.query('update builds set payload=$1 where user_id=$2', [payload, testAccount]), /Build changed on another device/);
    await assert.rejects(db.query('delete from builds where user_id=$1', [testAccount]), /Update Studio before deleting/);
    await db.exec('reset role');
    await db.exec(`alter table public.builds disable trigger klabs_temporary_build_write_freeze`);
    await assert.rejects(db.exec(rollback), /trigger missing, disabled or changed/);
    await db.exec('rollback');
    await db.exec(`alter table public.builds enable trigger klabs_temporary_build_write_freeze`);
    await db.exec(`alter function public.klabs_delete_build_if_revision(text,timestamptz) security invoker`);
    await assert.rejects(db.exec(rollback), /function missing or changed/);
    await db.exec('rollback');
    await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
    await db.exec(`create or replace function public.klabs_build_guard_version() returns integer language sql as $$ select 99 $$`);
    await assert.rejects(db.exec(rollback), /function missing or changed/);
    await db.exec('rollback');
    await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
    await db.exec(`create function public.unexpected_trigger() returns trigger language plpgsql as $$ begin return new; end $$;
      create trigger unexpected_trigger before insert on public.builds for each row execute function public.unexpected_trigger();`);
    await assert.rejects(db.exec(rollback), /Unexpected build triggers/);
    await db.exec('rollback');
    await db.exec('drop trigger unexpected_trigger on public.builds; drop function public.unexpected_trigger()');

    assert.deepEqual((await snapshot()).rows, baseline);
    await db.exec(rollback);
    assert.deepEqual((await snapshot()).rows, baseline);
    assert.deepEqual((await db.query("select * from pg_policies where schemaname='public' and tablename='builds'")).rows, policy);
    assert.deepEqual((await db.query("select grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='builds' order by grantee,privilege_type")).rows, grants);
    const functions = await db.query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('klabs_build_guard_version','klabs_guard_build_update','klabs_guard_build_delete','klabs_delete_build_if_revision')`);
    assert.equal(functions.rows[0].n, 0);
    const triggers = await db.query("select tgname from pg_trigger where tgrelid='public.builds'::regclass and not tgisinternal order by tgname");
    assert.deepEqual(triggers.rows.map(row => row.tgname), ['klabs_temporary_build_truncate_freeze', 'klabs_temporary_build_write_freeze']);
    await assert.rejects(db.query('delete from builds where user_id=$1', [frozen]), /temporarily frozen/);
    await assert.rejects(db.exec(sql('SUPABASE-BUILD-FREEZE-DISABLE-DRAFT.sql')), /Revision guard is not fully installed/);
    await db.exec('rollback');
    console.log('PASS: synthetic account, failed-closed rollback, unchanged records/policies/grants, baseline guard removal and retained freeze.');
  } finally {
    await db.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
