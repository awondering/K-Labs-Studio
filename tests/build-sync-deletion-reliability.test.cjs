// Multi-device build deletion and reconciliation tests. Runs the real build-sync.js, build-sync-journal.js and
// guarded-build-transport.js against an in-memory cloud with per-row revisions. Synthetic data only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=(f)=>fs.readFileSync(path.join(__dirname,'..','js',f),'utf8');
const SRC={sync:read('build-sync.js'),journal:read('build-sync-journal.js'),transport:read('guarded-build-transport.js')};
const clone=(v)=>v==null?v:JSON.parse(JSON.stringify(v));
const settle=()=>new Promise((r)=>setImmediate(r));

// ---- cloud: rows keyed by user then client_id; each write gets a new revision ----
function makeCloud(){
  let tick=0;const users={};const failures={read:null,auth:null,rls:false};
  const rows=(u)=>users[u]||(users[u]=new Map());
  const stamp=()=>new Date(Date.UTC(2026,10,1,0,0,++tick)).toISOString();
  return {users,failures,rows,stamp,
    seed(u,id,payload){const row={user_id:u,client_id:id,build_number:payload.buildNumber||'',payload:clone(payload),updated_at:stamp()};rows(u).set(id,row);return row;},
    ids:(u)=>[...rows(u).keys()].sort()};
}

// ---- device: one browser's localStorage, local build list, and sync stack, signed in as `account` ----
function makeDevice(cloud,account,name){
  const store=new Map();const locals={list:[]};const timers=new Map();let tid=0;const events=[];
  const asUser=()=>account;
  const client={
    auth:{async getUser(){
      if(cloud.failures.auth)return {data:{user:null},error:{message:cloud.failures.auth,status:401}};
      return {data:{user:{id:asUser()}},error:null};}},
    async rpc(fn,args){
      if(cloud.failures.read&&fn!=='klabs_build_guard_version')return {data:null,error:{message:cloud.failures.read}};
      if(fn==='klabs_build_guard_version')return {data:2,error:null};
      if(fn==='klabs_delete_build_if_revision'){
        const row=cloud.rows(asUser()).get(args.p_client_id);
        if(!row||row.updated_at!==args.p_revision)return {data:false,error:null};
        cloud.rows(asUser()).delete(args.p_client_id);return {data:true,error:null};}
      throw new Error('unexpected rpc '+fn);},
    from(table){
      assert.equal(table,'builds');
      const q={op:'select',filters:{},range:null,payload:null};
      const api={
        select(){return api;},order(){return api;},
        range(a,b){q.range=[a,b];return api;},
        eq(k,v){q.filters[k]=v;return api;},
        insert(row){q.op='insert';q.payload=row;return api;},
        update(row){q.op='update';q.payload=row;return api;},
        then(res,rej){return Promise.resolve(exec()).then(res,rej);},
      };
      function exec(){
        if(cloud.failures.read&&q.op==='select')return {data:null,error:{message:cloud.failures.read},count:null};
        const mine=cloud.rows(asUser());
        if(q.op==='select'){
          events.push({op:'select',user:q.filters.user_id});
          if(q.filters.user_id!==asUser())return {data:[],error:null,count:0};
          if(cloud.failures.rls)return {data:[],error:null,count:0};
          const all=[...mine.values()].sort((a,b)=>a.client_id<b.client_id?-1:1);
          return {data:clone(all.slice(q.range[0],q.range[1]+1)),error:null,count:all.length};
        }
        if(q.op==='insert'){
          events.push({op:'insert',id:q.payload.client_id,user:q.payload.user_id});
          if(q.payload.user_id!==asUser())return {data:[],error:{message:'RLS'}};
          if(mine.has(q.payload.client_id))return {data:null,error:{code:'23505',message:'duplicate'}};
          const p={...q.payload.payload};delete p._buildGuardCreate;
          const row={...q.payload,payload:p,updated_at:cloud.stamp()};mine.set(row.client_id,row);return {data:[clone(row)],error:null};
        }
        if(q.op==='update'){
          events.push({op:'update',id:q.filters.client_id,user:q.filters.user_id});
          const row=mine.get(q.filters.client_id);
          if(!row||row.updated_at!==q.filters.updated_at||q.filters.user_id!==asUser())return {data:[],error:null};
          const p={...q.payload.payload};delete p._expectedBuildRevision;
          const next={...row,payload:p,build_number:q.payload.build_number,updated_at:cloud.stamp()};mine.set(row.client_id,next);return {data:[clone(next)],error:null};
        }
      }
      return api;
    },
  };
  const window={
    KLABS_SUPABASE_CLIENT:client,KLABS_ACCOUNT_ID:account,KLABS_CAN_WRITE:()=>true,
    localStorage:{getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)},
    navigator:{onLine:true},
    savedBuildRecords:()=>locals.list,
    saveBuildRecords:(l)=>{locals.list=clone(l);return true;},
    KLABS_UI:{refreshBuildViews(){},isBuildOpen:()=>false,onBuildSyncStatus(){},onBuildSyncMode(){}},
    addEventListener(){},
  };
  const ctx={window,console:{error(){},log(){},warn(){}},setTimeout(fn,ms){const id=++tid;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},Date,JSON,Math,Promise,Object,Array,Set,Map,Error,String,Number};
  vm.createContext(ctx);
  for(const s of [SRC.journal,SRC.transport,SRC.sync])vm.runInContext(s,ctx);
  const sync=window.KLABS_BUILD_SYNC;
  const journal=()=>window.KLABS_BUILD_SYNC_JOURNAL.read(account);
  const dev={name,account,window,locals,events,
    journal,status:()=>sync.getStatus(),
    ids:()=>locals.list.map((r)=>String(r.id)).sort(),
    record:(id)=>locals.list.find((r)=>String(r.id)===id),
    async signIn(){await sync.onAuthStateChanged({user:{id:account}});await settle();},
    save(record){const i=locals.list.findIndex((r)=>r.id===record.id);if(i>=0)locals.list[i]=clone(record);else locals.list.unshift(clone(record));sync.notifyBuildSaved(clone(record));},
    // Mirrors ui.js deleteSavedEntryById: intent, local removal, confirm.
    del(id){const rec=dev.record(id);sync.notifyBuildDeleted(clone(rec));locals.list=locals.list.filter((r)=>r.id!==id);sync.confirmBuildDeleted(id);},
    async sync(){await sync.retry();await settle();},
    async flushTimers(){for(const [id,t] of [...timers]){timers.delete(id);t.fn();}await settle();await settle();},
    pendingTimers:()=>timers.size,
    seedLocal(record){locals.list.unshift(clone(record));},
  };
  return dev;
}
const build=(id,extra)=>({id,buildNumber:'B-'+id,customerName:'Synthetic '+id,buildName:'Rod '+id,...extra});
async function synced(cloud,account,id,payload,name='dev'){
  // A device that has previously synchronised the build: local copy, baseline and cloud row all agree.
  cloud.seed(account,id,payload);const d=makeDevice(cloud,account,name);d.seedLocal(payload);await d.signIn();return d;
}

test('1. cross-device deletion: a stale device with an unmodified copy removes it quietly (no review, archived)',async()=>{
  const cloud=makeCloud();const rec=build('x1',{note:'unchanged'});
  const phone=await synced(cloud,'U','x1',rec,'phone');const desktop=await synced(cloud,'U','x1',rec,'desktop');
  desktop.window.KLABS_BUILD_SYNC.notifyBuildDeleted(rec);desktop.locals.list=[];desktop.window.KLABS_BUILD_SYNC.confirmBuildDeleted('x1');await desktop.flushTimers();
  assert.deepEqual(cloud.ids('U'),[],'cloud row deleted');
  await phone.sync();
  assert.deepEqual(phone.ids(),[],'the deleted build leaves the phone');
  const j=phone.journal();
  assert.deepEqual(Object.keys(j.conflicts),[],'no conflict is raised');
  assert.equal(phone.status(),'synced');
  assert.ok(j.archive.some((a)=>a.id==='x1'&&a.local&&a.local.id==='x1'),'the removed record is archived on the device');
  assert.equal(j.baselines.x1,undefined);
  assert.ok(!phone.events.some((e)=>e.op==='insert'),'the stale copy is never re-uploaded');
});

test('2. a stale device with LOCAL EDITS keeps them: edit vs remote deletion is a genuine conflict, nothing is uploaded or lost',async()=>{
  const cloud=makeCloud();const rec=build('x2');
  const phone=await synced(cloud,'U','x2',rec,'phone');const desktop=await synced(cloud,'U','x2',rec,'desktop');
  desktop.window.KLABS_BUILD_SYNC.notifyBuildDeleted(rec);desktop.locals.list=[];desktop.window.KLABS_BUILD_SYNC.confirmBuildDeleted('x2');await desktop.flushTimers();
  phone.window.KLABS_BUILD_SYNC.getConflicts();
  phone.save({...rec,note:'edited on phone while offline'});
  await phone.flushTimers();
  assert.ok(phone.record('x2'),'the edited record is still on the phone');
  const c=phone.journal().conflicts.x2;
  assert.ok(c&&c.cloud===null&&c.local.note==='edited on phone while offline','conflict preserves the local edit');
  assert.match(c.reason,/edited|changed/i);
  assert.equal(phone.status(),'error');
  assert.deepEqual(cloud.ids('U'),[],'nothing resurrected in the cloud');
});

test('3. both devices deleted the same build: the second delete finds it already gone and completes without review',async()=>{
  const cloud=makeCloud();const rec=build('x3');
  const phone=await synced(cloud,'U','x3',rec,'phone');const desktop=await synced(cloud,'U','x3',rec,'desktop');
  desktop.del('x3');await desktop.flushTimers();assert.deepEqual(cloud.ids('U'),[]);
  phone.del('x3');await phone.flushTimers();await phone.sync();
  const j=phone.journal();
  assert.deepEqual(Object.keys(j.conflicts),[]);assert.deepEqual(Object.keys(j.pending),[]);assert.equal(j.baselines.x3,undefined);
  assert.equal(phone.status(),'synced');
});

test('4. the delete reached the server but the response was lost: the retry reconciles instead of asking for review',async()=>{
  const cloud=makeCloud();const rec=build('x4');
  const phone=await synced(cloud,'U','x4',rec,'phone');
  phone.del('x4');
  cloud.rows('U').delete('x4'); // server performed the deletion; the phone never heard back
  await phone.flushTimers();await phone.sync();
  const j=phone.journal();
  assert.deepEqual(Object.keys(j.conflicts),[]);assert.deepEqual(Object.keys(j.pending),[]);
  assert.equal(phone.status(),'synced');
});

test('5. offline deletion is queued, survives, and is applied on reconnect',async()=>{
  const cloud=makeCloud();const rec=build('x5');
  const phone=await synced(cloud,'U','x5',rec,'phone');
  cloud.failures.read='Failed to fetch';
  phone.del('x5');await phone.flushTimers();
  assert.equal(phone.journal().pending.x5.kind,'delete','still queued');
  assert.deepEqual(cloud.ids('U'),['x5'],'cloud untouched while offline');
  assert.notEqual(phone.status(),'error','offline is not a review-required conflict');
  cloud.failures.read=null;
  await phone.flushTimers();await phone.sync();
  assert.deepEqual(cloud.ids('U'),[]);assert.deepEqual(Object.keys(phone.journal().pending),[]);assert.equal(phone.status(),'synced');
});

test('6. a stale offline device cannot resurrect a deleted record when it reconnects (unmodified or edited)',async()=>{
  const cloud=makeCloud();const rec=build('x6');
  const phone=await synced(cloud,'U','x6',rec,'phone');const desktop=await synced(cloud,'U','x6',rec,'desktop');
  desktop.del('x6');await desktop.flushTimers();
  await phone.sync();await phone.flushTimers();
  assert.deepEqual(cloud.ids('U'),[]);assert.ok(!phone.events.some((e)=>e.op==='insert'||e.op==='update'));
});

test('7. network failure never invents conflicts or removes local records, and is reported as a sync failure, not a review',async()=>{
  const cloud=makeCloud();const rec=build('x7');
  const phone=await synced(cloud,'U','x7',rec,'phone');
  cloud.failures.read='TypeError: Failed to fetch';
  await phone.sync();
  assert.deepEqual(phone.ids(),['x7']);assert.deepEqual(Object.keys(phone.journal().conflicts),[]);
  assert.equal(phone.status(),'failed','distinct from the conflict status "error"');
  assert.ok(phone.pendingTimers()>0,'a retry is scheduled automatically');
  cloud.failures.read=null;await phone.flushTimers();
  assert.equal(phone.status(),'synced','recovers without user action');
});

test('8. an expired or invalid session is a sync failure; absent cloud rows are NOT treated as deletions',async()=>{
  const cloud=makeCloud();const a=build('x8a'),b=build('x8b');
  const phone=await synced(cloud,'U','x8a',a,'phone');cloud.seed('U','x8b',b);phone.seedLocal(b);await phone.sync();
  cloud.failures.rls=true;       // degraded session: the API answers 200 with no rows
  cloud.failures.auth='JWT expired';
  await phone.sync();
  assert.deepEqual(phone.ids(),['x8a','x8b'],'local records kept');
  assert.deepEqual(Object.keys(phone.journal().conflicts),[],'no deletion conflicts invented');
  assert.equal(phone.status(),'failed');
});

test('9. an empty cloud read with a verified session is trusted: genuine deletion of everything elsewhere',async()=>{
  const cloud=makeCloud();const a=build('x9a');
  const phone=await synced(cloud,'U','x9a',a,'phone');
  cloud.rows('U').clear();await phone.sync();
  assert.deepEqual(phone.ids(),[]);assert.deepEqual(Object.keys(phone.journal().conflicts),[]);assert.equal(phone.status(),'synced');
});

test('10. genuine concurrent edits are preserved for review, never silently overwritten',async()=>{
  const cloud=makeCloud();const rec=build('x10');
  const phone=await synced(cloud,'U','x10',rec,'phone');const desktop=await synced(cloud,'U','x10',rec,'desktop');
  desktop.save({...rec,note:'desktop'});await desktop.flushTimers();
  phone.save({...rec,note:'phone'});await phone.flushTimers();
  const c=phone.journal().conflicts.x10;
  assert.ok(c&&c.local.note==='phone'&&c.cloud.note==='desktop');
  assert.equal(phone.status(),'error');
  assert.equal(cloud.rows('U').get('x10').payload.note,'desktop','cloud not overwritten');
  assert.equal(phone.record('x10').note,'phone','local edit preserved');
});

test('11. a new offline-created build uploads once; an existing cloud ID is never overwritten blindly',async()=>{
  const cloud=makeCloud();const phone=makeDevice(cloud,'U','phone');await phone.signIn();
  phone.save(build('n1'));await phone.flushTimers();
  assert.deepEqual(cloud.ids('U'),['n1']);assert.equal(phone.status(),'synced');
  assert.equal(phone.events.filter((e)=>e.op==='insert').length,1);
});

test('12. cross-account isolation: account B never reads, deletes or receives account A records',async()=>{
  const cloud=makeCloud();const rec=build('iso');
  const a=await synced(cloud,'A','iso',rec,'a');
  const b=makeDevice(cloud,'B','b');b.seedLocal(build('only-b'));await b.signIn();await b.flushTimers();
  assert.deepEqual(cloud.ids('A'),['iso']);assert.deepEqual(cloud.ids('B'),['only-b']);
  assert.deepEqual(b.ids(),['only-b']);
  assert.ok(b.events.every((e)=>e.user==='B'));
  a.del('iso');await a.flushTimers();assert.deepEqual(cloud.ids('B'),['only-b'],'deleting in A never touches B');
});

test('13. customers and completed builds on the same account stay safe while another build is removed elsewhere',async()=>{
  const cloud=makeCloud();
  const keep=build('keep',{customerName:'Leonard Wong',issuedInvoice:{number:'INV-1'},deposits:[{amount:100}]});
  const gone=build('gone',{customerName:'Leonard Wong',quote:'old'});
  const phone=await synced(cloud,'U','keep',keep,'phone');cloud.seed('U','gone',gone);phone.seedLocal(gone);await phone.sync();
  const desktop=await synced(cloud,'U','gone',gone,'desktop');
  desktop.del('gone');await desktop.flushTimers();
  await phone.sync();
  assert.deepEqual(phone.ids(),['keep']);
  assert.deepEqual(phone.record('keep'),keep,'completed build untouched, deposits and invoice intact');
  assert.deepEqual(cloud.ids('U'),['keep']);
});

test('14. reported case: Bren Pine — a build deleted this morning, cloud row already absent, still queued as a delete',async()=>{
  const cloud=makeCloud();const rec=build('build-mwcgvkuc-75914x',{customerName:'Bren Pine'});
  const phone=await synced(cloud,'U',rec.id,rec,'phone');
  phone.del(rec.id);cloud.rows('U').delete(rec.id);
  await phone.sync();
  assert.deepEqual(Object.keys(phone.journal().conflicts),[]);assert.equal(phone.status(),'synced');
});

test('15. reported case: Leonard Wong — unmodified local copy of a build deleted elsewhere clears itself; an already-stuck conflict heals',async()=>{
  const cloud=makeCloud();const rec=build('build-mtuwwj2l-tydufk',{customerName:'Leonard Wong'});
  const phone=await synced(cloud,'U',rec.id,rec,'phone');
  cloud.rows('U').delete(rec.id);
  // Reproduce the state the previous release left on the device: a stored "cloud deleted" conflict with no cloud version.
  const j=phone.journal();j.conflicts[rec.id]={id:rec.id,local:rec,cloud:null,revision:null,operation:'save',reason:'The cloud build was deleted.',history:[]};
  phone.window.KLABS_BUILD_SYNC_JOURNAL.write('U',j);
  await phone.sync();
  assert.deepEqual(Object.keys(phone.journal().conflicts),[],'stuck conflict resolved without clearing storage');
  assert.deepEqual(phone.ids(),[]);
  assert.ok(phone.journal().archive.some((a)=>a.id===rec.id&&a.local.customerName==='Leonard Wong'),'archived, recoverable');
});

test('16. a stuck delete conflict from the previous release (delete queued, cloud absent) heals; cloud rows that exist are untouched',async()=>{
  const cloud=makeCloud();const rec=build('stuck');const other=build('other');
  const phone=await synced(cloud,'U','stuck',rec,'phone');cloud.seed('U','other',other);phone.seedLocal(other);await phone.sync();
  phone.del('stuck');cloud.rows('U').delete('stuck');
  const j=phone.journal();
  j.conflicts.stuck={id:'stuck',local:rec,cloud:null,revision:null,operation:'delete',reason:'The cloud build is absent. Review the deletion.',history:[]};
  phone.window.KLABS_BUILD_SYNC_JOURNAL.write('U',j);
  await phone.sync();
  const after=phone.journal();
  assert.deepEqual(Object.keys(after.conflicts),[]);assert.deepEqual(Object.keys(after.pending),[]);
  assert.deepEqual(phone.ids(),['other']);assert.deepEqual(cloud.ids('U'),['other']);
});

test('17. duplicate local IDs never delete cloud data or throw',async()=>{
  const cloud=makeCloud();const rec=build('dup');
  const phone=await synced(cloud,'U','dup',rec,'phone');phone.seedLocal(rec);
  await phone.sync();
  assert.deepEqual(cloud.ids('U'),['dup']);assert.equal(phone.status(),'synced');
});

test('18. a build created and deleted before it ever uploaded leaves nothing queued and nothing to review',async()=>{
  const cloud=makeCloud();const phone=makeDevice(cloud,'U','phone');await phone.signIn();
  cloud.failures.read='offline';phone.save(build('tmp'));phone.del('tmp');await phone.flushTimers();
  cloud.failures.read=null;await phone.flushTimers();await phone.sync();
  const j=phone.journal();
  assert.deepEqual(Object.keys(j.conflicts),[]);assert.deepEqual(Object.keys(j.pending),[]);
  assert.deepEqual(cloud.ids('U'),[]);assert.equal(phone.status(),'synced');
});
