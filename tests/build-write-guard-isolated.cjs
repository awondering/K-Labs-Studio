// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// The database is in memory; this test never connects to production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

async function main(){
  if(!process.env.PGLITE_MODULE)throw new Error('Set PGLITE_MODULE to the @electric-sql/pglite module path.');
  const {PGlite}=require(process.env.PGLITE_MODULE);
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.klabs_entitlement_can_write(p_user_id uuid) returns boolean language sql stable
        as $$ select p_user_id=auth.uid()
          and coalesce(current_setting('test.can_write',true),'true')='true'
          and coalesce(current_setting('test.blocked',true),'false')='false' $$;
      create table public.builds (
        user_id uuid not null, client_id text not null, build_number text not null default '', payload jsonb not null,
        updated_at timestamptz not null default now(), primary key(user_id,client_id)
      );
      alter table public.builds enable row level security;
      create policy own_builds on public.builds to authenticated
        using (user_id=auth.uid())
        with check (user_id=auth.uid());
      grant usage on schema auth to authenticated;
      grant select,insert,update,delete on public.builds to authenticated;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname,'..','SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'),'utf8'));
    const accountA='aaaaaaaa-0000-0000-0000-000000000001';
    const accountB='bbbbbbbb-0000-0000-0000-000000000002';
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${accountA}';`);
    await assert.rejects(db.query(
      'insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
      [accountA,'stale-recreate',{payments:[{amount:10}]}]),/Update Studio before creating/);
    const insert=await db.query(
      'insert into builds(user_id,client_id,payload) values ($1,$2,$3) returning updated_at::text,payload',
      [accountA,'same-id',{payments:[{id:'p1',amount:100}],_expectedBuildRevision:'irrelevant',_buildGuardCreate:1}]);
    assert.equal(insert.rows[0].payload._expectedBuildRevision,undefined);
    assert.equal(insert.rows[0].payload._buildGuardCreate,undefined);
    const revision=insert.rows[0].updated_at;
    const update=(payload)=>db.query(
      'update builds set payload=$1 where user_id=$2 and client_id=$3 returning updated_at::text,payload',
      [payload,accountA,'same-id']);

    await assert.rejects(update({payments:[]}),/Build changed on another device/);
    await assert.rejects(db.query(
      'insert into builds(user_id,client_id,payload) values ($1,$2,$3) on conflict (user_id,client_id) do update set payload=excluded.payload',
      [accountA,'same-id',{payments:[]}]),/Update Studio before creating/);
    await assert.rejects(db.query(
      'insert into builds(user_id,client_id,payload) values ($1,$2,$3) on conflict (user_id,client_id) do update set payload=excluded.payload',
      [accountA,'same-id',{payments:[{id:'p1',amount:100}],_expectedBuildRevision:revision,_buildGuardCreate:1}]),
    /Build changed on another device/);
    const first=await update({
      payments:[{id:'p1',amount:100},{id:'p2',amount:50}],
      _expectedBuildRevision:revision,
    });
    assert.equal(first.rows.length,1);
    assert.equal(first.rows[0].payload._expectedBuildRevision,undefined);
    await assert.rejects(update({
      payments:[{id:'p1',amount:100},{id:'p3',amount:20}],
      _expectedBuildRevision:revision,
    }),/Build changed on another device/);
    const invoice={number:'INV-same-id',payments:[{id:'p1',amount:100}]};
    const issued=await update({
      payments:first.rows[0].payload.payments,issuedInvoice:invoice,
      _expectedBuildRevision:first.rows[0].updated_at,
    });
    await assert.rejects(update({
      payments:issued.rows[0].payload.payments,issuedInvoice:{...invoice,number:'different'},
      _expectedBuildRevision:issued.rows[0].updated_at,
    }),/issued invoice cannot be changed/);
    const correction=await update({
      payments:[{id:'p1',amount:110},{id:'p2',amount:50}],issuedInvoice:invoice,
      _expectedBuildRevision:issued.rows[0].updated_at,
    });
    assert.equal(correction.rows[0].payload.payments[0].amount,110);
    assert.deepEqual(correction.rows[0].payload.issuedInvoice,invoice);
    await assert.rejects(update({
      payments:correction.rows[0].payload.payments,
      _expectedBuildRevision:correction.rows[0].updated_at,
    }),/issued invoice cannot be changed/);

    const competing=await Promise.allSettled([
      update({payments:[{id:'p1',amount:120}],issuedInvoice:invoice,_expectedBuildRevision:correction.rows[0].updated_at}),
      update({payments:[{id:'p1',amount:130}],issuedInvoice:invoice,_expectedBuildRevision:correction.rows[0].updated_at}),
    ]);
    assert.equal(competing.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(competing.filter(result=>result.status==='rejected').length,1);
    assert.match(competing.find(result=>result.status==='rejected').reason.message,/Build changed on another device/);

    await assert.rejects(db.query('delete from builds where user_id=$1 and client_id=$2',[accountA,'same-id']),
      /Update Studio before deleting/);
    const last=await db.query('select updated_at::text from builds where user_id=$1 and client_id=$2',[accountA,'same-id']);
    const staleDelete=await db.query('select klabs_delete_build_if_revision($1,$2) as deleted',['same-id',revision]);
    assert.equal(staleDelete.rows[0].deleted,false);

    await db.exec(`set request.jwt.claim.sub='${accountB}';`);
    const other=await db.query('select * from builds where user_id=$1',[accountA]);
    assert.equal(other.rows.length,0);
    await assert.rejects(db.query(
      'insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
      [accountA,'other-id',{_buildGuardCreate:1}]),/row-level security/);
    await db.query('insert into builds(user_id,client_id,payload) values ($1,$2,$3)',
      [accountB,'same-id',{payments:[{id:'b1',amount:7}],_buildGuardCreate:1}]);
    const b=await db.query('select payload from builds where client_id=$1',['same-id']);
    assert.equal(b.rows.length,1);
    assert.equal(b.rows[0].payload.payments[0].amount,7);
    const crossDelete=await db.query('select klabs_delete_build_if_revision($1,$2) as deleted',['same-id',last.rows[0].updated_at]);
    assert.equal(crossDelete.rows[0].deleted,false);
    await db.exec(`set request.jwt.claim.sub='${accountA}';`);
    await db.exec(`set test.can_write='false';`);
    await assert.rejects(db.query('select klabs_delete_build_if_revision($1,$2)',['same-id',last.rows[0].updated_at]),
      /cannot delete builds/);
    await db.exec(`set test.can_write='true'; set test.blocked='true';`);
    await assert.rejects(db.query('select klabs_delete_build_if_revision($1,$2)',['same-id',last.rows[0].updated_at]),
      /cannot delete builds/);
    await db.exec(`set test.blocked='false';`);
    const stillPresent=await db.query('select payload from builds where user_id=$1 and client_id=$2',[accountA,'same-id']);
    assert.equal(stillPresent.rows.length,1);
    const validDelete=await db.query('select klabs_delete_build_if_revision($1,$2) as deleted',['same-id',last.rows[0].updated_at]);
    assert.equal(validDelete.rows[0].deleted,true);
    const window={};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','js','guarded-build-transport.js'),'utf8'),{window});
    const transport=window.KLABS_GUARDED_BUILD_TRANSPORT;
    const client={
      from(){
        let action,row;
        const filters={};
        const query={
          insert(value){action='insert';row=value;return query;},
          update(value){action='update';row=value;return query;},
          eq(key,value){filters[key]=value;return query;},
          async select(){
            try{
              const sql=action==='insert'
                ?'insert into builds(user_id,client_id,payload) values ($1,$2,$3) returning user_id,client_id,payload,updated_at::text as updated_at'
                :'update builds set payload=$3 where user_id=$1 and client_id=$2 and updated_at=$4 returning user_id,client_id,payload,updated_at::text as updated_at';
              const args=action==='insert'
                ?[row.user_id,row.client_id,row.payload]
                :[filters.user_id,filters.client_id,row.payload,filters.updated_at];
              return {data:(await db.query(sql,args)).rows,error:null};
            }catch(error){return {data:null,error};}
          },
        };
        return query;
      },
      async rpc(name,args){
        assert.equal(name,'klabs_delete_build_if_revision');
        try{
          const result=await db.query('select klabs_delete_build_if_revision($1,$2) as deleted',
            [args.p_client_id,args.p_revision]);
          return {data:result.rows[0].deleted,error:null};
        }catch(error){return {data:null,error};}
      },
    };
    const context={userId:accountA,isCurrent:()=>true};
    const created=await transport.save(client,context,{id:'transport-id',payments:[{amount:10}]},null);
    const initialRevision=created.updated_at;
    const saved=await transport.save(client,context,{id:'transport-id',payments:[{amount:10},{amount:5}]},initialRevision);
    await assert.rejects(transport.save(client,context,{id:'transport-id',payments:[{amount:99}]},initialRevision),/Review both versions/);
    await assert.rejects(transport.remove(client,context,'transport-id',initialRevision),/Review before deleting/);
    const kept=await db.query('select payload from builds where user_id=$1 and client_id=$2',[accountA,'transport-id']);
    assert.equal(kept.rows[0].payload.payments.length,2);
    await transport.remove(client,context,'transport-id',saved.updated_at);
    const absent=await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,'transport-id']);
    assert.equal(absent.rows.length,0);
    let online=true,guardAvailable=true,loseNextResponse=false;
    const integratedClient={
      from(){
        let action,row,start=0,end=499;
        const filters={};
        const query={
          select(){
            if(action){
              return (async()=>{
                if(!online)return {data:null,error:{message:'offline'}};
                try{
                  const sql=action==='insert'
                    ?'insert into builds(user_id,client_id,build_number,payload) values ($1,$2,$3,$4) returning user_id,client_id,build_number,payload,updated_at::text as updated_at'
                    :'update builds set build_number=$3,payload=$4 where user_id=$1 and client_id=$2 and updated_at=$5 returning user_id,client_id,build_number,payload,updated_at::text as updated_at';
                  const args=[row.user_id,row.client_id,row.build_number,row.payload];
                  if(action==='update')args.push(filters.updated_at);
                  const rows=(await db.query(sql,args)).rows;
                  if(loseNextResponse){loseNextResponse=false;return {data:null,error:{message:'response lost'}};}
                  return {data:rows,error:null};
                }catch(error){return {data:null,error};}
              })();
            }
            action='select';
            return query;
          },
          insert(value){action='insert';row=value;return query;},
          update(value){action='update';row=value;return query;},
          eq(key,value){filters[key]=value;return query;},
          order(){return query;},
          range(first,last){start=first;end=last;return query;},
          then(resolve,reject){
            const read=async()=>{
              if(!online)return {data:null,error:{message:'offline'}};
              try{
                const rows=(await db.query('select user_id,client_id,build_number,payload,updated_at::text as updated_at from builds where user_id=$1 order by client_id',[filters.user_id])).rows;
                return {data:rows.slice(start,end+1),count:rows.length,error:null};
              }
              catch(error){return {data:null,error};}
            };
            return read().then(resolve,reject);
          },
        };
        return query;
      },
      async rpc(name,args){
        if(!online)return {data:null,error:{message:'offline'}};
        if(name==='klabs_build_guard_version'){
          if(!guardAvailable)return {data:null,error:{code:'PGRST202',message:'guard missing'}};
          const result=await db.query('select public.klabs_build_guard_version() as version');
          return {data:result.rows[0].version,error:null};
        }
        return client.rpc(name,args);
      },
    };
    function device(storage=new Map()){
      let builds=[];
      const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
      const w={localStorage,KLABS_SUPABASE_CLIENT:integratedClient,KLABS_CAN_WRITE:()=>true,
        savedBuildRecords:()=>builds,saveBuildRecords:value=>{builds=value;},KLABS_UI:{refreshBuildViews(){}}};
      const scope={window:w,console,setTimeout:()=>1,clearTimeout(){}};
      for(const file of ['build-sync-journal.js','guarded-build-transport.js','build-sync.js'])
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','js',file),'utf8'),scope);
      return {w,storage,get builds(){return builds;},set builds(value){builds=value;}};
    }
    const d1=device(),d2=device();
    await d1.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    const initial={id:'integrated',buildNumber:'BUILD-902',payments:[{amount:100}],issuedInvoice:{number:'INV-1'}};
    d1.builds=[initial];
    d1.w.KLABS_BUILD_SYNC.notifyBuildSaved(initial);
    await d1.w.KLABS_BUILD_SYNC.retry();
    assert.equal(d1.w.KLABS_BUILD_SYNC.getStatus(),'synced');
    await d2.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    const remoteEdit={...initial,payments:[{amount:100},{amount:50}]};
    d2.builds=[remoteEdit,...d2.builds.filter(r=>r.id!=='integrated')];
    d2.w.KLABS_BUILD_SYNC.notifyBuildSaved(remoteEdit);
    await d2.w.KLABS_BUILD_SYNC.retry();
    online=false;
    const localEdit={...initial,payments:[{amount:100},{amount:25}]};
    d1.builds=[localEdit,...d1.builds.filter(r=>r.id!=='integrated')];
    d1.w.KLABS_BUILD_SYNC.notifyBuildSaved(localEdit);
    await d1.w.KLABS_BUILD_SYNC.retry();
    assert.equal(d1.w.KLABS_BUILD_SYNC.getStatus(),'error');
    online=true;
    await d1.w.KLABS_BUILD_SYNC.retry();
    const conflict=d1.w.KLABS_BUILD_SYNC.getConflicts().integrated;
    assert.deepEqual(JSON.parse(JSON.stringify(conflict.local.payments)),localEdit.payments);
    assert.deepEqual(JSON.parse(JSON.stringify(conflict.cloud.payments)),remoteEdit.payments);
    assert.deepEqual(JSON.parse(JSON.stringify(conflict.local.issuedInvoice)),initial.issuedInvoice);
    const restarted=device(d1.storage);
    restarted.builds=d1.builds;
    await restarted.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    assert.ok(restarted.w.KLABS_BUILD_SYNC.getConflicts().integrated);
    await restarted.w.KLABS_BUILD_SYNC.resolveConflict('integrated','cloud',conflict.revision);
    assert.deepEqual(JSON.parse(JSON.stringify(restarted.builds.find(r=>r.id==='integrated').payments)),remoteEdit.payments);
    assert.equal(JSON.parse(d1.storage.get(`klabs-build-sync-journal:${accountA}`)).archive.length,1);
    const del1={id:'delete-normal',buildNumber:'BUILD-902',payments:[{amount:10}]};
    restarted.builds=[del1,...restarted.builds];
    restarted.w.KLABS_BUILD_SYNC.notifyBuildSaved(del1);
    await restarted.w.KLABS_BUILD_SYNC.retry();
    restarted.w.KLABS_BUILD_SYNC.notifyBuildDeleted(del1);
    restarted.builds=restarted.builds.filter(r=>r.id!==del1.id);
    restarted.w.KLABS_BUILD_SYNC.confirmBuildDeleted(del1.id);
    await restarted.w.KLABS_BUILD_SYNC.retry();
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,del1.id])).rows.length,0);
    await d2.w.KLABS_BUILD_SYNC.retry();
    const currentBuild=d2.builds.find(r=>r.id==='integrated');
    const concurrent={...currentBuild,payments:[...currentBuild.payments,{amount:12}]};
    d2.builds=[concurrent,...d2.builds.filter(r=>r.id!==concurrent.id)];
    d2.w.KLABS_BUILD_SYNC.notifyBuildSaved(concurrent);
    await d2.w.KLABS_BUILD_SYNC.retry();
    const deleting=restarted.builds.find(r=>r.id==='integrated');
    restarted.w.KLABS_BUILD_SYNC.notifyBuildDeleted(deleting);
    restarted.builds=restarted.builds.filter(r=>r.id!=='integrated');
    restarted.w.KLABS_BUILD_SYNC.confirmBuildDeleted('integrated');
    await restarted.w.KLABS_BUILD_SYNC.retry();
    const deleteConflict=restarted.w.KLABS_BUILD_SYNC.getConflicts().integrated;
    assert.equal(deleteConflict.operation,'delete');
    assert.equal(deleteConflict.cloud.payments.length,3);
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,'integrated'])).rows.length,1);
    await restarted.w.KLABS_BUILD_SYNC.resolveConflict('integrated','cloud',deleteConflict.revision);
    assert.equal(restarted.builds.find(r=>r.id==='integrated').payments.length,3);
    assert.equal(JSON.parse(d1.storage.get(`klabs-build-sync-journal:${accountA}`)).archive.length,2);
    const interrupted={id:'lost-response',buildNumber:'BUILD-902',payments:[{amount:42}]};
    restarted.builds=[interrupted,...restarted.builds];
    restarted.w.KLABS_BUILD_SYNC.notifyBuildSaved(interrupted);
    guardAvailable=false;
    await restarted.w.KLABS_BUILD_SYNC.retry();
    assert.equal(restarted.w.KLABS_BUILD_SYNC.getStatus(),'error');
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,interrupted.id])).rows.length,0);
    guardAvailable=true;
    loseNextResponse=true;
    await restarted.w.KLABS_BUILD_SYNC.retry();
    assert.equal(restarted.w.KLABS_BUILD_SYNC.getStatus(),'error');
    await restarted.w.KLABS_BUILD_SYNC.retry();
    assert.equal(restarted.w.KLABS_BUILD_SYNC.getStatus(),'synced');
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,interrupted.id])).rows.length,1);
    restarted.w.KLABS_BUILD_SYNC.notifyBuildDeleted(interrupted);
    await restarted.w.KLABS_BUILD_SYNC.retry();
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,interrupted.id])).rows.length,1);
    restarted.w.KLABS_BUILD_SYNC.notifyBuildDeleted(interrupted);
    restarted.builds=restarted.builds.filter(r=>r.id!==interrupted.id);
    const afterCrash=device(d1.storage);
    afterCrash.builds=restarted.builds;
    await afterCrash.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,interrupted.id])).rows.length,0);
    const readOnly=device();
    readOnly.w.KLABS_CAN_WRITE=()=>false;
    await db.exec(`set test.can_write='false';`);
    await readOnly.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    assert.ok(readOnly.builds.some(r=>r.id==='integrated'));
    assert.equal(readOnly.w.KLABS_BUILD_SYNC.notifyBuildSaved({id:'no-write'}),false);
    assert.equal(readOnly.w.KLABS_BUILD_SYNC.notifyBuildDeleted(readOnly.builds[0]),false);
    await assert.rejects(readOnly.w.KLABS_BUILD_SYNC.resolveConflict('integrated','cloud',null),/read-only/);
    await db.exec(`set test.can_write='true';`);
    await db.exec(`set request.jwt.claim.sub='${accountB}';`);
    await db.query(`insert into builds(user_id,client_id,build_number,payload)
      select $1,'page-'||g,'B-'||g,jsonb_build_object('id','page-'||g,'_buildGuardCreate',1)
      from generate_series(1,501) g`,[accountB]);
    const accountBDevice=device(d1.storage);
    await accountBDevice.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountB}});
    assert.equal(accountBDevice.builds.length,502);
    assert.equal(accountBDevice.builds.some(r=>r.id==='integrated'),false);
    assert.ok(d1.storage.has(`klabs-build-sync-journal:${accountA}`));
    assert.ok(d1.storage.has(`klabs-build-sync-journal:${accountB}`));
    const sharedBrowser=device();
    const accountRecords={};
    sharedBrowser.w.savedBuildRecords=()=>accountRecords[sharedBrowser.w.KLABS_ACCOUNT_ID]||[];
    sharedBrowser.w.saveBuildRecords=value=>{accountRecords[sharedBrowser.w.KLABS_ACCOUNT_ID]=value;};
    await db.exec(`set request.jwt.claim.sub='${accountA}';`);
    sharedBrowser.w.KLABS_ACCOUNT_ID=accountA;
    await sharedBrowser.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    online=false;
    const offlineBuild={id:'shared-offline',buildNumber:'BUILD-902',payments:[{amount:13}]};
    accountRecords[accountA]=[offlineBuild,...accountRecords[accountA]];
    sharedBrowser.w.KLABS_BUILD_SYNC.notifyBuildSaved(offlineBuild);
    await sharedBrowser.w.KLABS_BUILD_SYNC.retry();
    sharedBrowser.w.KLABS_ACCOUNT_ID=accountB;
    await db.exec(`set request.jwt.claim.sub='${accountB}';`);
    online=true;
    await sharedBrowser.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountB}});
    assert.equal(accountRecords[accountB].some(r=>r.id===offlineBuild.id),false);
    sharedBrowser.w.KLABS_ACCOUNT_ID=accountA;
    await db.exec(`set request.jwt.claim.sub='${accountA}';`);
    await sharedBrowser.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountA,offlineBuild.id])).rows.length,1);
    await db.exec(`set request.jwt.claim.sub='${accountB}';`);
    assert.equal((await db.query('select * from builds where user_id=$1 and client_id=$2',[accountB,offlineBuild.id])).rows.length,0);
    await db.exec(`set request.jwt.claim.sub='${accountA}';`);
    const opened=device();
    await opened.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    let active=true;
    opened.w.KLABS_UI.isBuildOpen=id=>active&&id==='integrated';
    sharedBrowser.w.KLABS_ACCOUNT_ID=accountA;
    await sharedBrowser.w.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:accountA}});
    const activeUpdate={...accountRecords[accountA].find(r=>r.id==='integrated'),note:'updated elsewhere'};
    accountRecords[accountA]=[activeUpdate,...accountRecords[accountA].filter(r=>r.id!=='integrated')];
    sharedBrowser.w.KLABS_BUILD_SYNC.notifyBuildSaved(activeUpdate);
    await sharedBrowser.w.KLABS_BUILD_SYNC.retry();
    await opened.w.KLABS_BUILD_SYNC.retry();
    const openConflict=opened.w.KLABS_BUILD_SYNC.getConflicts().integrated;
    assert.ok(openConflict);
    assert.equal(opened.builds.find(r=>r.id==='integrated').note,undefined);
    await assert.rejects(opened.w.KLABS_BUILD_SYNC.resolveConflict('integrated','cloud',openConflict.revision),/Open another build/);
    active=false;
    await opened.w.KLABS_BUILD_SYNC.resolveConflict('integrated','cloud',openConflict.revision);
    assert.equal(opened.builds.find(r=>r.id==='integrated').note,'updated elsewhere');
    console.log('Integrated sync: normal deletion and conflicting deletion with recovery verified.');
    console.log('Integrated sync: missing guard, lost response, interrupted deletion and read-only access verified.');
    console.log('Integrated sync: account-scoped journals and 502-record paginated pull verified.');
    console.log('Integrated sync: same-browser offline account switching verified.');
    console.log('Integrated sync: active editors protected from cloud hydration and conflict resolution.');
    console.log('Integrated sync: guarded saves, offline conflict, restart and explicit cloud resolution verified.');
    console.log('Isolated guard: outdated and stale writes rejected; valid writes, immutable invoices and account isolation verified.');
  }finally{
    await db.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
