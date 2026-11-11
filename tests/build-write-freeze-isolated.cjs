// PGLITE_MODULE points to an installed @electric-sql/pglite; no production connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE to the @electric-sql/pglite module path.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const sql = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const kevin = '56182f95-eba7-4d45-bd9b-95fd223b27e5';
  const sales = 'ce92d438-4156-4464-9527-083f780a135a';
  const other = 'aaaaaaaa-0000-0000-0000-000000000001';
  const original = { payments: [{ id: 'payment', amount: 125 }], issuedInvoice: { reference: 'invoice' } };
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.klabs_entitlement_can_write(p_user_id uuid) returns boolean language sql stable
        as $$ select p_user_id=auth.uid() $$;
      create table public.builds (
        user_id uuid not null, client_id text not null, build_number text not null default '',
        payload jsonb not null, updated_at timestamptz not null default now(), primary key(user_id,client_id)
      );
      alter table public.builds enable row level security;
      create policy own_builds on public.builds to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select,insert,update,delete on public.builds to authenticated;
    `);
    for (const id of [kevin, sales, other]) {
      await db.query('insert into public.builds(user_id,client_id,payload) values($1,$2,$3)', [id, 'same-id', original]);
    }
    const before = await db.query('select user_id, client_id, payload, updated_at::text from public.builds order by user_id');
    await db.exec(sql('SUPABASE-BUILD-FREEZE-ENABLE-DRAFT.sql'));
    for (const id of [kevin, sales]) {
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
      await assert.rejects(db.query('insert into builds(user_id,client_id,payload) values($1,$2,$3)', [id, 'new', {}]), /temporarily frozen/);
      await assert.rejects(db.query('insert into builds(user_id,client_id,payload) values($1,$2,$3) on conflict (user_id,client_id) do update set payload=excluded.payload', [id, 'same-id', {}]), /temporarily frozen/);
      await assert.rejects(db.query('update builds set payload=$1 where user_id=$2 and client_id=$3', [{}, id, 'same-id']), /temporarily frozen/);
      await assert.rejects(db.query('delete from builds where user_id=$1 and client_id=$2', [id, 'same-id']), /temporarily frozen/);
      assert.equal((await db.query('select payload from builds where user_id=$1', [id])).rows[0].payload.payments[0].amount, 125);
      await db.exec('reset role');
    }
    await assert.rejects(db.query('update builds set user_id=$1 where user_id=$2', [other, kevin]), /temporarily frozen/);
    await assert.rejects(db.query('update builds set user_id=$1 where user_id=$2', [kevin, other]), /temporarily frozen/);
    await assert.rejects(db.query('truncate public.builds'), /temporarily frozen/);
    assert.deepEqual((await db.query('select user_id, client_id, payload, updated_at::text from public.builds order by user_id')).rows, before.rows);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${other}';`);
    await db.query('update builds set payload=$1 where user_id=$2 and client_id=$3', [{ note: 'other account' }, other, 'same-id']);
    await db.exec('reset role');

    await assert.rejects(db.exec(sql('SUPABASE-BUILD-FREEZE-DISABLE-DRAFT.sql')), /Revision guard is not fully installed/);
    await db.exec('rollback');
    await assert.rejects(db.query('delete from builds where user_id=$1', [kevin]), /temporarily frozen/);
    await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
    for (const id of [kevin, sales]) {
      const current = await db.query('select updated_at::text revision from builds where user_id=$1 and client_id=$2', [id, 'same-id']);
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}';`);
      await assert.rejects(db.query('select public.klabs_delete_build_if_revision($1,$2)', ['same-id', current.rows[0].revision]), /temporarily frozen/);
      await assert.rejects(db.query('update builds set payload=$1 where user_id=$2 and client_id=$3', [{ ...original, _expectedBuildRevision: current.rows[0].revision }, id, 'same-id']), /temporarily frozen/);
      await db.exec('reset role');
    }
    await db.exec(sql('SUPABASE-BUILD-FREEZE-DISABLE-DRAFT.sql'));
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${kevin}';`);
    await assert.rejects(db.query('update builds set payload=$1 where user_id=$2 and client_id=$3', [{}, kevin, 'same-id']), /Build changed on another device/);
    const current = await db.query('select updated_at::text revision from builds where user_id=$1 and client_id=$2', [kevin, 'same-id']);
    const saved = await db.query('update builds set payload=$1 where user_id=$2 and client_id=$3 returning payload', [{ ...original, _expectedBuildRevision: current.rows[0].revision }, kevin, 'same-id']);
    assert.deepEqual(saved.rows[0].payload, original);
    const revision = (await db.query('select updated_at::text revision from builds where user_id=$1 and client_id=$2', [kevin, 'same-id'])).rows[0].revision;
    assert.equal((await db.query('select public.klabs_delete_build_if_revision($1,$2) deleted', ['same-id', revision])).rows[0].deleted, true);
    await db.exec('reset role');
    console.log('PASS: freeze protects both accounts, old writes, upserts, transfers, truncate and guarded RPC; unaffected account and guarded release verified.');
  } finally {
    await db.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
