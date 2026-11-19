// Q12: downloaded jobs are applied to the local job list in ONE save and ONE redraw per sync run, with exactly the result
// the previous one-save-per-job code gave. Each scenario runs against the real build-sync.js and against the pre-change
// copy (tests/fixtures/build-sync-v256.js, build148-v256) on identical devices and compares everything observable:
// local job list (contents and order), sync journal, cloud rows, Supabase calls, status and open-job refreshes.
// Synthetic data only; in-memory cloud, no network.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=(f)=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const SRC={current:read('js/build-sync.js'),v256:read('tests/fixtures/build-sync-v256.js'),journal:read('js/build-sync-journal.js'),transport:read('js/guarded-build-transport.js')};
const clone=(v)=>v==null?v:JSON.parse(JSON.stringify(v));
const settle=async()=>{for(let i=0;i<5;i++)await new Promise((r)=>setImmediate(r));};
const NOW=Date.UTC(2026,10,19,4,0,0);
class FixedDate extends Date{constructor(...a){if(a.length)super(...a);else super(NOW);}static now(){return NOW;}}

function makeCloud(){
  let tick=0;const users={};
  const rows=(u)=>users[u]||(users[u]=new Map());
  const stamp=()=>new Date(Date.UTC(2026,10,1,0,0,++tick)).toISOString();
  return {rows,stamp,seed(u,id,payload){const row={user_id:u,client_id:id,build_number:payload.buildNumber||'',payload:clone(payload),updated_at:stamp()};rows(u).set(id,row);return row;},
    snapshot:(u)=>[...rows(u).values()].map(clone).sort((a,b)=>a.client_id<b.client_id?-1:1)};
}
function makeDevice(cloud,account,impl,opts={}){
  const store=new Map();const locals={list:[]};const timers=new Map();let tid=0;
  const calls=[];const saves=[];const refreshOpen=[];let views=0;const open={id:null,unsaved:false};let failSaves=0;
  const client={
    auth:{async getUser(){calls.push('auth.getUser');if(opts.onGetUser)opts.onGetUser(window);return {data:{user:{id:account}},error:null};}},
    async rpc(fn,args){calls.push('rpc '+fn+(args?' '+JSON.stringify(args):''));
      if(fn==='klabs_build_guard_version')return {data:2,error:null};
      if(fn==='klabs_delete_build_if_revision'){const row=cloud.rows(account).get(args.p_client_id);if(!row||row.updated_at!==args.p_revision)return {data:false,error:null};cloud.rows(account).delete(args.p_client_id);return {data:true,error:null};}
      throw new Error('unexpected rpc '+fn);},
    from(table){
      assert.equal(table,'builds');
      const q={op:'select',filters:{},range:null,payload:null};
      const api={select(){return api;},order(){return api;},range(a,b){q.range=[a,b];return api;},eq(k,v){q.filters[k]=v;return api;},
        insert(row){q.op='insert';q.payload=row;return api;},update(row){q.op='update';q.payload=row;return api;},then(res,rej){return Promise.resolve(exec()).then(res,rej);}};
      function exec(){
        calls.push(q.op+' '+JSON.stringify(q.filters)+(q.payload?' '+q.payload.client_id:''));
        const mine=cloud.rows(account);
        if(q.op==='select'){const all=[...mine.values()].sort((a,b)=>a.client_id<b.client_id?-1:1);return {data:clone(all.slice(q.range[0],q.range[1]+1)),error:null,count:all.length};}
        if(q.op==='insert'){if(mine.has(q.payload.client_id))return {data:null,error:{code:'23505',message:'duplicate'}};const p={...q.payload.payload};delete p._buildGuardCreate;const row={...q.payload,payload:p,updated_at:cloud.stamp()};mine.set(row.client_id,row);return {data:[clone(row)],error:null};}
        if(q.op==='update'){const row=mine.get(q.filters.client_id);if(!row||row.updated_at!==q.filters.updated_at)return {data:[],error:null};const p={...q.payload.payload};delete p._expectedBuildRevision;const next={...row,payload:p,build_number:q.payload.build_number,updated_at:cloud.stamp()};mine.set(row.client_id,next);return {data:[clone(next)],error:null};}
      }
      return api;
    },
  };
  const window={
    KLABS_SUPABASE_CLIENT:client,KLABS_ACCOUNT_ID:account,KLABS_CAN_WRITE:()=>opts.canWrite!==false,
    localStorage:{getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)},
    navigator:{onLine:true},
    savedBuildRecords:()=>clone(locals.list),
    saveBuildRecords:(l)=>{saves.push({ids:l.map((r)=>r.id),hydration:!!window.KLABS_SYNC_HYDRATION});if(failSaves>0){failSaves--;return false;}locals.list=clone(l);return true;},
    KLABS_UI:{refreshBuildViews(){views++;},refreshOpenBuild(id,record){refreshOpen.push([id,clone(record)]);},isBuildOpen:(id)=>open.id===id,hasUnsavedEdits:(id)=>open.id===id&&open.unsaved,onBuildSyncStatus(){},onBuildSyncMode(){}},
    addEventListener(){},
  };
  const ctx={window,console:{error(){},log(){},warn(){}},setTimeout(fn,ms){const id=++tid;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},Date:FixedDate,JSON,Math,Promise,Object,Array,Set,Map,Error,String,Number};
  vm.createContext(ctx);
  for(const s of [SRC.journal,SRC.transport,SRC[impl]])vm.runInContext(s,ctx);
  const sync=window.KLABS_BUILD_SYNC;
  return {window,locals,calls,saves,refreshOpen,open,views:()=>views,
    failNextSaves(n){failSaves=n;},
    journal:()=>clone(window.KLABS_BUILD_SYNC_JOURNAL.read(account)),
    status:()=>sync.getStatus(),
    seedLocal(record){locals.list.unshift(clone(record));},
    async signIn(){await sync.onAuthStateChanged({user:{id:account}});await settle();},
    async sync(){await sync.retry();await settle();},
    save(record){const i=locals.list.findIndex((r)=>r.id===record.id);if(i>=0)locals.list[i]=clone(record);else locals.list.unshift(clone(record));sync.notifyBuildSaved(clone(record));},
    async flushTimers(){for(const [id,t] of [...timers]){timers.delete(id);t.fn();}await settle();},
  };
}
const build=(id,extra)=>({id,buildNumber:'B-'+id,customerName:'Synthetic '+id,buildName:'Rod '+id,...extra});

// Runs `scenario(cloud, makeDev)` once with each implementation and returns everything observable about the device.
async function runBoth(scenario){
  const out={};
  for(const impl of ['v256','current']){
    const cloud=makeCloud();const devices=[];
    const make=(account,opts)=>{const d=makeDevice(cloud,account,impl,opts);devices.push(d);return d;};
    const dev=await scenario(cloud,make);
    out[impl]={list:clone(dev.locals.list),journal:dev.journal(),cloud:cloud.snapshot('U'),calls:dev.calls.slice(),status:dev.status(),
      refreshOpen:dev.refreshOpen.slice(),saves:dev.saves.slice(),views:dev.views(),dev};
  }
  return out;
}
function assertSameOutcome(r,label){
  for(const k of ['list','journal','cloud','calls','status','refreshOpen'])assert.deepEqual(r.current[k],r.v256[k],label+': '+k+' differs from v256');
}

// A device that has synced before, then reconnects to a cloud changed by another device: every reconcile branch at once.
async function mixedScenario(cloud,make){
  const other=make('U');
  for(const id of ['a','b','c','d','open1'])cloud.seed('U',id,build(id,{note:'v1'}));
  const dev=make('U');
  dev.seedLocal(build('local-only',{note:'never uploaded'}));
  await dev.signIn();                                   // first sync: downloads a,b,c,d,open1; uploads local-only
  // other device: updates b, deletes c, adds e, f, g; this device: edits d (pending), job open1 open with unsaved typing
  cloud.rows('U').get('b').payload.note='v2 from other device';cloud.rows('U').get('b').updated_at=cloud.stamp();
  cloud.rows('U').delete('c');
  for(const id of ['e','f','g'])cloud.seed('U',id,build(id,{note:'new elsewhere'}));
  cloud.rows('U').get('open1').payload.note='cloud edit while open';cloud.rows('U').get('open1').updated_at=cloud.stamp();
  dev.open.id='open1';dev.open.unsaved=true;
  dev.save(build('d',{note:'edited here'}));
  dev.calls.length=0;dev.saves.length=0;dev.refreshOpen.length=0;
  await dev.flushTimers();
  await dev.sync();
  return dev;
}

test('1. same outcome as v256: fresh device downloading 150 jobs (list, order, journal, Supabase calls, status)',async()=>{
  const r=await runBoth(async(cloud,make)=>{for(let i=0;i<150;i++)cloud.seed('U','job-'+String(i).padStart(3,'0'),build('job-'+i,{n:i}));
    const dev=make('U');dev.seedLocal(build('mine',{note:'local before sign-in'}));await dev.signIn();return dev;});
  assertSameOutcome(r,'fresh device');
  assert.equal(r.current.list.length,151);
  assert.equal(r.current.list[0].id,'job-149','last downloaded job first, exactly as before');
  assert.equal(r.current.status,'synced');
});

test('2. same outcome as v256: cloud update, remote deletion, new remote jobs, local pending edit, open job with unsaved typing',async()=>{
  const r=await runBoth(mixedScenario);
  assertSameOutcome(r,'mixed');
  const list=r.current.list,ids=list.map((x)=>x.id);
  assert.ok(!ids.includes('c'),'job deleted on the other device is retired');
  assert.ok(r.current.journal.archive.some((a)=>a.id==='c'),'retired job is archived');
  assert.equal(list.find((x)=>x.id==='b').note,'v2 from other device');
  assert.equal(list.find((x)=>x.id==='d').note,'edited here','local edit kept and uploaded');
  assert.equal(r.current.cloud.find((x)=>x.client_id==='d').payload.note,'edited here');
  assert.equal(list.find((x)=>x.id==='open1').note,'v1','open job with unsaved typing is not overwritten');
  assert.ok(!r.current.refreshOpen.some(([id])=>id==='open1'),'open job with unsaved typing is not refreshed');
  for(const id of ['e','f','g'])assert.ok(ids.includes(id));
});

test('3. one save and one redraw per sync run instead of one per job (150 downloaded jobs)',async()=>{
  const r=await runBoth(async(cloud,make)=>{for(let i=0;i<150;i++)cloud.seed('U','job-'+String(i).padStart(3,'0'),build('job-'+i));const dev=make('U');await dev.signIn();return dev;});
  assert.equal(r.v256.saves.length,150,'v256 saved once per job');
  assert.equal(r.current.saves.length,1,'now saved once');
  assert.ok(r.current.saves.every((s)=>s.hydration),'saved as a sync update (allowed for read-only accounts as before)');
  assert.equal(r.current.views,1,'job views redrawn once');
});

test('4. save failure: nothing is recorded as done, the local list is unchanged, and the automatic retry completes it',async()=>{
  const cloud=makeCloud();for(const id of ['x','y','z'])cloud.seed('U',id,build(id));
  const dev=makeDevice(cloud,'U','current');dev.seedLocal(build('keep'));
  dev.failNextSaves(1);
  await dev.signIn();
  assert.deepEqual(dev.locals.list.map((r)=>r.id),['keep'],'no partial write: local list untouched');
  const j=dev.journal();
  assert.deepEqual(Object.keys(j.baselines).filter((id)=>['x','y','z'].includes(id)),[],'no downloaded job is recorded as synced');
  assert.equal(dev.status(),'failed');
  await dev.flushTimers();                              // the retry scheduled by the failure
  assert.deepEqual(dev.locals.list.map((r)=>r.id),['z','y','x','keep']);
  assert.deepEqual(Object.keys(dev.journal().baselines).sort(),['keep','x','y','z']);
  assert.equal(dev.status(),'synced');
});

test('5. save failure behaves as v256 from the caller\'s view: same journal and status, and the retry ends identical',async()=>{
  const r=await runBoth(async(cloud,make)=>{for(const id of ['x','y'])cloud.seed('U',id,build(id));const dev=make('U');dev.failNextSaves(1);await dev.signIn();
    dev.afterFail={journal:dev.journal(),status:dev.status()};await dev.flushTimers();return dev;});
  assert.deepEqual(r.current.dev.afterFail,r.v256.dev.afterFail);
  assertSameOutcome(r,'after retry');
});

test('6. the open job is refreshed with the downloaded version when it has no unsaved typing (same calls as v256)',async()=>{
  const r=await runBoth(async(cloud,make)=>{cloud.seed('U','o',build('o',{note:'v1'}));const dev=make('U');await dev.signIn();
    cloud.rows('U').get('o').payload.note='v2';cloud.rows('U').get('o').updated_at=cloud.stamp();dev.open.id='o';dev.open.unsaved=false;dev.refreshOpen.length=0;await dev.sync();return dev;});
  assertSameOutcome(r,'open job');
  assert.deepEqual(r.current.refreshOpen.map(([id,rec])=>[id,rec.note]),[['o','v2']]);
});

test('7. account isolation: if the account changes during the last check before writing, nothing is written locally or recorded',async()=>{
  for(const impl of ['v256','current']){
    const cloud=makeCloud();for(const id of ['x','gone'])cloud.seed('U',id,build(id));
    let switchNow=false;
    const dev=makeDevice(cloud,'U',impl,{onGetUser:(w)=>{if(switchNow)w.KLABS_ACCOUNT_ID='OTHER';}});
    await dev.signIn();                                 // synced: x, gone
    cloud.rows('U').delete('gone');cloud.seed('U','new',build('new'));   // other device deletes one job, adds one
    switchNow=true;dev.saves.length=0;const before={list:clone(dev.locals.list),journal:dev.journal()};
    await dev.sync();                                   // the deletion makes sync confirm the session; the account switches there
    assert.ok(dev.calls.includes('auth.getUser'),impl+': the session check ran');
    assert.equal(dev.saves.length,0,impl+': nothing written for the old account');
    assert.deepEqual(dev.locals.list,before.list,impl+': local list unchanged');
    assert.deepEqual(dev.journal(),before.journal,impl+': sync record unchanged');
  }
});

test('8. read-only account: downloaded jobs are still applied as a sync update, as before',async()=>{
  const r=await runBoth(async(cloud,make)=>{for(const id of ['r1','r2'])cloud.seed('U',id,build(id));const dev=make('U',{canWrite:false});await dev.signIn();return dev;});
  assertSameOutcome(r,'read-only');
  assert.deepEqual(r.current.list.map((x)=>x.id),['r2','r1']);
});

test('9. nothing to apply: no save and no redraw (unchanged repeat launch)',async()=>{
  const cloud=makeCloud();cloud.seed('U','x',build('x'));
  const dev=makeDevice(cloud,'U','current');await dev.signIn();
  dev.saves.length=0;const before=dev.views();
  await dev.sync();
  assert.equal(dev.saves.length,0);assert.equal(dev.views(),before);
});
