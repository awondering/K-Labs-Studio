const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ui=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const syncSource=fs.readFileSync(path.join(__dirname,'..','js','build-sync.js'),'utf8');
function fn(name){
  const start=ui.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  let depth=0,i=ui.indexOf('{',start);
  for(;i<ui.length;i++){if(ui[i]==='{')depth++;else if(ui[i]==='}'&&--depth===0)break;}
  return ui.slice(start,i+1);
}
const ID_A='aaaaaaaa-0000-0000-0000-000000000001';
const ID_B='bbbbbbbb-0000-0000-0000-000000000002';

// One browser: ONE localStorage-like store shared by every account, exactly like a real device.
function browser({online=true}={}){
  const storage={};
  const cloud={[ID_A]:[],[ID_B]:[]};
  const state={online,upsertAttempts:[]};
  const Store={get:(k,f)=>storage[k]===undefined?f:JSON.parse(storage[k]),set(k,v){storage[k]=JSON.stringify(v);}};
  const window={KLABS_ACCOUNT_ID:''};
  const client={from(){
    let action,rows,userId;
    const q={
      select(){action='select';return q;},
      upsert(v){action='upsert';rows=v;return q;},
      delete(){action='delete';return q;},
      eq(k,v){userId=v;return q;},
      in(){return q;},
      then(res,rej){
        if(action==='upsert')userId=rows[0].user_id;
        if(!state.online){return Promise.resolve({data:null,error:{message:'offline'}}).then(res,rej);}
        if(action==='upsert'){state.upsertAttempts.push({userId,ids:rows.map((r)=>r.client_id)});
          rows.forEach((r)=>{const list=cloud[userId];const i=list.findIndex((x)=>x.client_id===r.client_id);if(i>=0)list[i]=r;else list.push(r);});
          return Promise.resolve({data:rows,error:null}).then(res,rej);}
        return Promise.resolve({data:cloud[userId]||[],error:null}).then(res,rej);
      },
    };
    return q;
  }};
  const ctx={Store,window,console,setTimeout(){return 0;},clearTimeout(){}};
  vm.createContext(ctx);
  vm.runInContext("const BUILDS_STORAGE_KEY='klabs-workshop-builds';const QUOTES_STORAGE_KEY='klabs-workshop-quotes';const QUOTE_CURRENT_STORAGE_KEY='klabs-workshop-quote-current';"+
    ['activeAccountKey','accountScopedStorageKey','buildsStorageKey','quotesStorageKey','quoteCurrentStorageKey','savedBuildRecords'].map(fn).join('\n')+
    "\nwindow.savedBuildRecords=savedBuildRecords;window.saveBuildRecords=(r)=>{Store.set(buildsStorageKey(),Array.isArray(r)?r:[]);};",ctx);
  window.KLABS_SUPABASE_CLIENT=client;
  window.KLABS_UI={refreshBuildViews(){}};
  vm.runInNewContext(syncSource,{window,console,setTimeout(){return 0;},clearTimeout(){}});
  const sync=window.KLABS_BUILD_SYNC;
  return {
    storage,cloud,state,window,
    signIn:async(id)=>{window.KLABS_ACCOUNT_ID=id;await sync.onAuthStateChanged({user:{id}});},
    signOut:async()=>{window.KLABS_ACCOUNT_ID='';await sync.onAuthStateChanged(null);},
    saveLocal:(rec)=>{const list=window.savedBuildRecords();window.saveBuildRecords([rec,...list.filter((r)=>r.id!==rec.id)]);},
    local:()=>Array.from(window.savedBuildRecords(),(r)=>`${r.id}:${r.customerName}`),
  };
}
const build=(id,name,at='2026-11-01T00:00:00Z')=>({id,customerName:name,buildName:'x',updatedAt:at,savedAt:at});

test('same browser: conflicting build ids never cross between accounts, A->B->A',async()=>{
  const b=browser();
  await b.signIn(ID_A);
  b.saveLocal(build('build-1','Alice customer'));
  await b.signIn(ID_B);
  assert.deepEqual(b.local(),[],'B must not see A data');
  b.saveLocal(build('build-1','Bob customer'));
  await b.signIn(ID_A);
  assert.deepEqual(b.local(),['build-1:Alice customer']);
  await b.signIn(ID_B);
  assert.deepEqual(b.local(),['build-1:Bob customer']);
  assert.ok(b.state.upsertAttempts.every((u)=>u.userId===ID_A||u.userId===ID_B));
  b.state.upsertAttempts.forEach((u)=>{});
});

test('same browser: sync uploads each account only its own records',async()=>{
  const b=browser();
  await b.signIn(ID_A);
  b.saveLocal(build('only-a','A only'));
  await b.signIn(ID_A);
  await b.signIn(ID_B);
  assert.deepEqual(b.cloud[ID_B].map((r)=>r.client_id),[]);
  assert.deepEqual(b.cloud[ID_A].map((r)=>r.client_id),['only-a']);
});

test('legacy shared records stay preserved, quarantined, never uploaded or assigned',async()=>{
  const b=browser();
  const legacy=[build('legacy-1','Old shared')];
  b.storage['klabs-workshop-builds']=JSON.stringify(legacy);
  const before=b.storage['klabs-workshop-builds'];
  await b.signIn(ID_A);
  await b.signIn(ID_B);
  await b.signOut();
  await b.signIn(ID_A);
  assert.equal(b.storage['klabs-workshop-builds'],before,'legacy key untouched');
  assert.deepEqual(b.local(),[]);
  assert.deepEqual(b.cloud[ID_A],[]);
  assert.deepEqual(b.cloud[ID_B],[]);
  assert.equal(b.state.upsertAttempts.length,0);
});

test('offline: failed upload stays with the owning account and is not leaked on switch',async()=>{
  const b=browser({online:false});
  await b.signIn(ID_A);
  b.saveLocal(build('off-1','Offline A'));
  await b.signIn(ID_B);
  assert.deepEqual(b.local(),[]);
  b.state.online=true;
  await b.signIn(ID_B);
  assert.deepEqual(b.cloud[ID_A],[]);
  assert.deepEqual(b.cloud[ID_B],[]);
  await b.signIn(ID_A);
  assert.deepEqual(b.local(),['off-1:Offline A']);
  assert.deepEqual(b.cloud[ID_A].map((r)=>r.client_id),['off-1']);
  assert.deepEqual(b.cloud[ID_B],[]);
});

test('sign-out then sign-in: signed-out store is separate from every account',async()=>{
  const b=browser();
  await b.signIn(ID_A);
  b.saveLocal(build('a-1','A'));
  await b.signOut();
  assert.deepEqual(b.local(),[]);
  b.saveLocal(build('anon-1','Anon'));
  await b.signIn(ID_B);
  assert.deepEqual(b.local(),[]);
  assert.deepEqual(b.cloud[ID_B],[]);
  await b.signOut();
  assert.deepEqual(b.local(),['anon-1:Anon']);
  await b.signIn(ID_A);
  assert.deepEqual(b.local(),['a-1:A']);
});

test('quote draft is per account',()=>{
  const b=browser();
  const ctx=vm.createContext({Store:{get:(k,f)=>b.storage[k]===undefined?f:JSON.parse(b.storage[k]),set(k,v){b.storage[k]=JSON.stringify(v);}},window:b.window});
  vm.runInContext("const QUOTE_CURRENT_STORAGE_KEY='klabs-workshop-quote-current';"+['activeAccountKey','accountScopedStorageKey','quoteCurrentStorageKey'].map(fn).join('\n'),ctx);
  b.window.KLABS_ACCOUNT_ID=ID_A;
  assert.equal(vm.runInContext('quoteCurrentStorageKey()',ctx),`klabs-workshop-quote-current:${ID_A}`);
  b.window.KLABS_ACCOUNT_ID=ID_B;
  assert.equal(vm.runInContext('quoteCurrentStorageKey()',ctx),`klabs-workshop-quote-current:${ID_B}`);
});
