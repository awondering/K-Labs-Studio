const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','build-sync.js'),'utf8');
const session=(id)=>id?{user:{id}}:null;
function deferred(){
  let resolve;
  const promise=new Promise((done)=>{resolve=done;});
  return {promise,resolve};
}
function harness(){
  const calls=[];
  const locals={A:[],B:[]};
  const cloud={A:[],B:[]};
  const timers=new Map();
  let timerId=0;
  let account='';
  let intercept=()=>null;
  let refreshes=0;
  const client={from(table){
    assert.equal(table,'builds');
    let action,rows,userId,ids;
    const query={
      select(){action='select';return query;},
      upsert(value){action='upsert';rows=value;return query;},
      delete(){action='delete';return query;},
      eq(key,value){assert.equal(key,'user_id');userId=value;return query;},
      order(){return query;},
      range(){return query;},
      in(key,value){assert.equal(key,'client_id');ids=value;return query;},
      then(resolve,reject){
        if(action==='upsert')userId=rows[0].user_id;
        const call={action,userId,rows,ids};
        calls.push(call);
        const delayed=intercept(call);
        const result=delayed||Promise.resolve({data:cloud[userId]||[],error:null});
        return result.then(value=>resolve({...value,count:value.data?.length}),reject);
      },
    };
    return query;
  }};
  const window={
    KLABS_SUPABASE_CLIENT:client,
    savedBuildRecords:()=>locals[account]||[],
    saveBuildRecords:(records)=>{locals[account]=records;},
    KLABS_UI:{refreshBuildViews:()=>{refreshes+=1;}},
  };
  const journals={};
  window.KLABS_BUILD_SYNC_JOURNAL={
    read(id){return JSON.parse(JSON.stringify(journals[id]||{version:1,baselines:{},pending:{},conflicts:{},archive:[]}));},
    write(id,value){journals[id]=JSON.parse(JSON.stringify(value));},
  };
  window.KLABS_GUARDED_BUILD_TRANSPORT={
    async save(_client,ctx,record,revision){
      const row={user_id:ctx.userId,client_id:record.id,build_number:record.buildNumber||'',payload:record,updated_at:'2026-01-02T00:00:00Z'};
      const call={action:'upsert',userId:ctx.userId,rows:[row],revision};
      calls.push(call);
      const result=await (intercept(call)||Promise.resolve({error:null}));
      if(result.error)throw new Error(result.error.message);
      if(!ctx.isCurrent())throw new Error('account changed');
      cloud[ctx.userId]=[...cloud[ctx.userId].filter(item=>item.client_id!==record.id),row];
      return row;
    },
    async remove(_client,ctx,id,revision){
      const call={action:'delete',userId:ctx.userId,ids:[id],revision};
      calls.push(call);
      const result=await (intercept(call)||Promise.resolve({error:null}));
      if(result.error)throw new Error(result.error.message);
      if(!ctx.isCurrent())throw new Error('account changed');
      cloud[ctx.userId]=cloud[ctx.userId].filter(item=>item.client_id!==id);
    },
  };
  client.rpc=async(name)=>{assert.equal(name,'klabs_build_guard_version');return {data:1,error:null};};
  vm.runInNewContext(source,{window,console,setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  return {
    calls,locals,cloud,window,
    setInterceptor(fn){intercept=fn;},
    switchTo(id){account=id;return window.KLABS_BUILD_SYNC.onAuthStateChanged(session(id));},
    fireTimers(){const pending=[...timers.values()];timers.clear();pending.forEach((fn)=>fn());},
    refreshCount:()=>refreshes,
  };
}
const settle=()=>new Promise((resolve)=>setImmediate(resolve));

test('a delayed account A pull cannot read, upload or replace account B records',async()=>{
  const h=harness();
  h.locals.A=[{id:'a',updatedAt:'2026-01-01'}];
  h.locals.B=[{id:'b',updatedAt:'2026-01-01'}];
  const pending=deferred();
  h.setInterceptor((call)=>call.action==='select'&&call.userId==='A'?pending.promise:null);
  const a=h.switchTo('A');
  await h.switchTo('B');
  const before=h.refreshCount();
  pending.resolve({data:[{client_id:'remote-a',payload:{id:'remote-a'}}],error:null});
  await a;
  assert.deepEqual(Array.from(h.locals.B,(record)=>record.id),['b']);
  assert.equal(h.refreshCount(),before);
  assert.equal(h.calls.some((call)=>call.action==='upsert'&&call.userId==='A'),false);
  assert.deepEqual(h.calls.filter((call)=>call.action==='upsert').map((call)=>call.userId),['B']);
});

test('a delayed account A upsert cannot apply a stale merge to account B',async()=>{
  const h=harness();
  h.locals.A=[{id:'a'}];
  const pending=deferred();
  h.setInterceptor((call)=>call.action==='upsert'&&call.userId==='A'?pending.promise:null);
  const a=h.switchTo('A');
  await settle();
  assert.equal(h.calls.find((call)=>call.action==='upsert').userId,'A');
  h.locals.B=[{id:'b'}];
  await h.switchTo('B');
  const before=h.refreshCount();
  pending.resolve({error:null});
  await a;
  assert.deepEqual(Array.from(h.locals.B,(record)=>record.id),['b']);
  assert.equal(h.refreshCount(),before);
});

test('a delayed deletion cannot send or requeue account A edits under account B',async()=>{
  const h=harness();
  h.cloud.A=[{client_id:'old-a',payload:{id:'old-a'},updated_at:'2026-01-01'}];
  await h.switchTo('A');
  const pending=deferred();
  h.setInterceptor((call)=>call.action==='delete'?pending.promise:null);
  h.window.KLABS_BUILD_SYNC.notifyBuildDeleted({id:'old-a'});
  h.locals.A=h.locals.A.filter(record=>record.id!=='old-a');
  h.window.KLABS_BUILD_SYNC.confirmBuildDeleted('old-a');
  h.window.KLABS_BUILD_SYNC.notifyBuildSaved({id:'new-a'});
  h.fireTimers();
  await settle();
  await h.switchTo('B');
  pending.resolve({error:{message:'offline'}});
  await settle();
  h.window.KLABS_BUILD_SYNC.notifyBuildSaved({id:'new-b'});
  h.fireTimers();
  await settle();
  const writes=h.calls.filter((call)=>call.action==='upsert');
  assert.deepEqual(writes.map((call)=>[call.userId,call.rows[0].client_id]),[['B','new-b']]);
});

test('same-account startup still merges and uploads local records',async()=>{
  const h=harness();
  h.locals.A=[{id:'local',updatedAt:'2026-01-01'}];
  h.cloud.A=[{client_id:'cloud',payload:{id:'cloud'},updated_at:'2026-01-01'}];
  await h.switchTo('A');
  assert.deepEqual(Array.from(h.locals.A,(record)=>record.id).sort(),['cloud','local']);
  assert.deepEqual(h.calls.filter((call)=>call.action==='upsert').map((call)=>[call.userId,call.rows[0].client_id]),[['A','local']]);
  assert.equal(h.refreshCount(),1);
});

test('a same-account auth refresh does not discard an outstanding save',async()=>{
  const h=harness();
  await h.switchTo('A');
  h.window.KLABS_BUILD_SYNC.notifyBuildSaved({id:'new-a'});
  await h.switchTo('A');
  h.fireTimers();
  await settle();
  const writes=h.calls.filter((call)=>call.action==='upsert');
  assert.deepEqual(writes.map((call)=>[call.userId,call.rows[0].client_id]),[['A','new-a']]);
});

test('a failed upload reports not synced and retry never replaces a newer queued edit',async()=>{
  const h=harness();
  await h.switchTo('A');
  const pending=deferred();
  h.setInterceptor((call)=>call.action==='upsert'?pending.promise:null);
  h.window.KLABS_BUILD_SYNC.notifyBuildSaved({id:'build',value:'old'});
  h.fireTimers();
  await settle();
  h.window.KLABS_BUILD_SYNC.notifyBuildSaved({id:'build',value:'new'});
  h.fireTimers();
  pending.resolve({error:{message:'offline'}});
  await settle();
  assert.equal(h.window.KLABS_BUILD_SYNC.getStatus(),'error');
  h.setInterceptor(()=>null);
  h.fireTimers();
  await settle();
  const writes=h.calls.filter((call)=>call.action==='upsert');
  assert.equal(writes.length,2);
  assert.equal(writes[1].rows[0].payload.value,'new');
  assert.equal(h.window.KLABS_BUILD_SYNC.getStatus(),'synced');
});
