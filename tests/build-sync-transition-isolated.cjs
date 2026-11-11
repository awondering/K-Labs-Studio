// Uses only an in-memory PostgreSQL database and synthetic records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  const account = 'aaaaaaaa-0000-0000-0000-000000000001';
  let guarded = false, online = true, failProbe = null, afterProbe = null;
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.klabs_entitlement_can_write(p uuid) returns boolean language sql stable
        as $$ select p=auth.uid() $$;
      create table builds(user_id uuid not null,client_id text not null,build_number text default '',
        payload jsonb not null,updated_at timestamptz not null default now(),primary key(user_id,client_id));
      alter table builds enable row level security;
      create policy own_builds on builds to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select,insert,update,delete on builds to authenticated;
      set role authenticated; set request.jwt.claim.sub='${account}';
    `);
    async function activate() {
      await db.exec('reset role');
      await db.exec(fs.readFileSync(path.join(__dirname, '..', 'SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'), 'utf8'));
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
      guarded = true;
    }
    const client = {
      from() {
        let action, row, start = 0, end = 499;
        const filters = {};
        const query = {
          insert(value) { action = 'insert'; row = value; return query; },
          update(value) { action = 'update'; row = value; return query; },
          delete() { action = 'delete'; return query; },
          eq(key, value) { filters[key] = value; return query; },
          order() { return query; },
          range(first, last) { start = first; end = last; return query; },
          select() {
            if (!action) { action = 'read'; return query; }
            return (async () => {
              if (!online) return { error: { message: 'offline' } };
              try {
                if (afterProbe) { const callback = afterProbe; afterProbe = null; await callback(); }
                const returning = ' returning user_id,client_id,build_number,payload,updated_at::text as updated_at';
                let result;
                if (action === 'insert') result = await db.query(
                  'insert into builds(user_id,client_id,build_number,payload) values($1,$2,$3,$4)' + returning,
                  [row.user_id,row.client_id,row.build_number,row.payload]);
                else if (action === 'update') {
                  const stamp = row.updated_at ? ',updated_at=$6' : '';
                  const args = [row.user_id,row.client_id,row.build_number,row.payload,filters.updated_at];
                  if (row.updated_at) args.push(row.updated_at);
                  result = await db.query('update builds set build_number=$3,payload=$4' + stamp +
                    ' where user_id=$1 and client_id=$2 and updated_at=$5' + returning,args);
                } else result = await db.query(
                  'delete from builds where user_id=$1 and client_id=$2 and updated_at=$3' + returning,
                  [filters.user_id,filters.client_id,filters.updated_at]);
                return { data: result.rows, error: null };
              } catch (error) { return { data: null, error }; }
            })();
          },
          then(resolve, reject) {
            const read = async () => {
              if (!online) return { error: { message: 'offline' } };
              try {
                const result = await db.query('select user_id,client_id,build_number,payload,updated_at::text as updated_at from builds where user_id=$1 order by client_id',[filters.user_id]);
                return { data: result.rows.slice(start,end+1), count: result.rows.length, error: null };
              } catch (error) { return { error }; }
            };
            return read().then(resolve,reject);
          },
        };
        return query;
      },
      async rpc(name,args) {
        if (!online) return { error: { message: 'offline' } };
        if (name === 'klabs_build_guard_version') {
          if (failProbe) return { error: failProbe };
          if (!guarded) return { error: { code: 'PGRST202', message: 'function not found in schema cache' } };
          return { data: (await db.query('select klabs_build_guard_version() as v')).rows[0].v, error: null };
        }
        try {
          const result = await db.query('select klabs_delete_build_if_revision($1,$2) as v',[args.p_client_id,args.p_revision]);
          return { data: result.rows[0].v, error: null };
        } catch (error) { return { error }; }
      },
    };
    function device(storage = new Map()) {
      let builds = [];
      const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value) };
      const window = { localStorage, KLABS_SUPABASE_CLIENT: client, KLABS_CAN_WRITE: () => true,
        savedBuildRecords: () => builds, saveBuildRecords: value => { builds = value; }, KLABS_UI: {} };
      const scope = { window, console, setTimeout: () => 1, clearTimeout() {} };
      for (const file of ['build-sync-journal.js','guarded-build-transport.js','build-sync.js']) {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','js',file),'utf8'),scope);
      }
      return { window, storage, get builds() { return builds; }, set builds(value) { builds = value; } };
    }
    const first = device();
    const sync = first.window.KLABS_BUILD_SYNC;
    await sync.onAuthStateChanged({ user: { id: account } });
    assert.equal(sync.getMode(),'compatibility');
    let record = { id: 'transition', payments: [{ amount: 100 }], issuedInvoice: { reference: 'original' } };
    first.builds = [record];
    sync.notifyBuildSaved(record);
    failProbe = { code:'42501',message:'permission denied' };
    await sync.retry();
    assert.equal(sync.getStatus(),'error');
    assert.ok(first.window.KLABS_BUILD_SYNC_JOURNAL.read(account).pending.transition);
    assert.equal((await db.query('select * from builds where client_id=$1',['transition'])).rows.length,0);
    failProbe = null;
    await sync.retry();
    assert.equal(sync.getStatus(),'synced');
    record = { ...record, payments: [...record.payments,{ amount: 50 }] };
    first.builds = [record];
    sync.notifyBuildSaved(record);
    await sync.retry();
    let cloud = (await db.query('select payload from builds where client_id=$1',['transition'])).rows[0].payload;
    assert.equal(cloud.payments.length,2);
    assert.equal(cloud._expectedBuildRevision,undefined);

    const removable = { id:'compat-delete', payments:[{ amount:9 }] };
    first.builds = [removable,...first.builds];
    sync.notifyBuildSaved(removable);
    await sync.retry();
    sync.notifyBuildDeleted(removable);
    first.builds = first.builds.filter(item => item.id !== removable.id);
    sync.confirmBuildDeleted(removable.id);
    await sync.retry();
    assert.equal((await db.query('select * from builds where client_id=$1',[removable.id])).rows.length,0);

    await db.query('update builds set payload=$1 where user_id=$2 and client_id=$3',
      [{...record,payments:[{amount:777}],note:'v208'},account,record.id]);
    const localAfterOldWrite = {...record,note:'local after v208'};
    first.builds = [localAfterOldWrite];
    sync.notifyBuildSaved(localAfterOldWrite);
    await sync.retry();
    assert.equal(sync.getStatus(),'error');
    let conflict = sync.getConflicts().transition;
    assert.equal(conflict.cloud.payments[0].amount,777);
    assert.equal(conflict.local.payments.length,2);
    await sync.resolveConflict('transition','local',conflict.revision);
    assert.equal(sync.getStatus(),'synced');

    online = false;
    record = { ...record, payments: [...record.payments,{ amount: 25 }] };
    first.builds = [record];
    sync.notifyBuildSaved(record);
    await sync.retry();
    assert.equal(sync.getStatus(),'error');
    const accountB = 'bbbbbbbb-0000-0000-0000-000000000002';
    await db.exec(`set request.jwt.claim.sub='${accountB}'`);
    first.builds = [];
    online = true;
    await sync.onAuthStateChanged({ user: { id: accountB } });
    assert.equal(first.builds.length,0);
    assert.equal((await db.query('select * from builds where user_id=$1',[accountB])).rows.length,0);
    await db.exec(`set request.jwt.claim.sub='${account}'`);
    first.builds = [record];
    await sync.onAuthStateChanged({ user: { id: account } });
    assert.equal(sync.getMode(),'compatibility');
    assert.equal((await db.query('select payload from builds where client_id=$1',[record.id])).rows[0].payload.payments.length,3);
    online = false;
    record = {...record, note:'queued during activation'};
    first.builds = [record];
    sync.notifyBuildSaved(record);
    await sync.retry();
    assert.equal(sync.getStatus(),'error');
    online = true;
    afterProbe = activate;
    await sync.retry();
    assert.equal(sync.getStatus(),'error');
    assert.equal(first.window.KLABS_BUILD_SYNC_JOURNAL.read(account).pending.transition.record.note,'queued during activation');
    await sync.retry();
    assert.equal(sync.getMode(),'guarded');
    assert.equal(sync.getStatus(),'synced');
    cloud = (await db.query('select payload from builds where client_id=$1',['transition'])).rows[0].payload;
    assert.equal(cloud.payments.length,3);
    assert.equal(cloud.issuedInvoice.reference,'original');
    await assert.rejects(db.query('update builds set payload=$1 where user_id=$2 and client_id=$3',
      [{ payments: [] },account,'transition']),/Build changed on another device/);
    failProbe = { code:'PGRST202',message:'stale schema cache' };
    record = { ...record, note:'kept locally' };
    first.builds = [record];
    sync.notifyBuildSaved(record);
    await sync.retry();
    assert.equal(sync.getStatus(),'error');
    assert.equal(first.window.KLABS_BUILD_SYNC_JOURNAL.read(account).pending.transition.record.note,'kept locally');
    failProbe = null;
    await sync.retry();
    assert.equal(sync.getStatus(),'synced');
    console.log('Transition: compatibility saves/deletes, v208 conflict, offline recovery, mid-write activation and no downgrade verified.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
