const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function load(name,window){
  const source=fs.readFileSync(path.join(__dirname,'..','js',name),'utf8');
  vm.runInNewContext(source,{window,console,setTimeout,clearTimeout});
}
function storage(initial){
  const values=new Map(Object.entries(initial));
  return {values,get:(key,fallback)=>values.has(key)?values.get(key):fallback,set:(key,value)=>values.set(key,value)};
}
const session=(id)=>({user:{id}});

test('anonymous component data remains untouched and is not imported on sign-in or manual import',async()=>{
  const legacy=[{id:'legacy',name:'Private guide',cost:42}];
  const store=storage({'klabs-workshop-component-library':legacy});
  const writes=[];
  let local=[];
  let reads=0;
  const client={from(table){
    const query={
      select(){return query;},
      eq(){return query;},
      maybeSingle(){return Promise.resolve({data:null,error:null});},
      upsert(row){writes.push({table,row});return Promise.resolve({error:null});},
      then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject);},
    };
    return query;
  }};
  const window={
    Store:store,KLABS_SUPABASE_CLIENT:client,
    componentLibraryRecords:()=>local,
    saveComponentLibraryRecords:(records)=>{local=records;},
    KLABS_UI:{
      readAnonymousComponentLibraryRecords:()=>{reads++;return legacy;},
      readAnonymousComponentTaxonomy:()=>{reads++;return {categories:[],suppliers:[]};},
      renderComponentSyncStatus(){},
    },
  };
  load('component-sync.js',window);
  await window.KLABS_SYNC.onAuthStateChanged(session('A'));
  const result=await window.KLABS_SYNC.importLocalLibrary();
  assert.equal(result.ok,false);
  assert.match(result.error,/ownership/i);
  assert.equal(reads,0);
  assert.equal(local.length,0);
  assert.equal(writes.length,0);
  assert.strictEqual(store.values.get('klabs-workshop-component-library'),legacy);
  assert.equal(store.values.has('klabs-component-library-anonymous-owner'),false);
});

test('empty cloud settings are initialized only from the current account and do not claim anonymous settings',async()=>{
  const anonymous={businessProfile:{businessName:'Private legacy business',paymentAccountNumber:'123'}};
  const store=storage({'klabs-studio-settings-anonymous-owner':'A'});
  const writes=[];
  let reads=0;
  let applied;
  const window={
    Store:store,
    KLABS_SUPABASE_CLIENT:{from(){
      const query={
        select(){return query;},
        eq(){return query;},
        maybeSingle:async()=>({data:null,error:null}),
        upsert(row){writes.push(row);return Promise.resolve({error:null});},
      };
      return query;
    }},
    readStudioSettingsSyncPayload:()=>({studioSettings:{taxRate:15},businessProfile:{businessName:'Account B'}}),
    readAnonymousStudioSettingsSyncPayload:()=>{reads++;return anonymous;},
    studioSettingsSyncCacheState:()=>({hasAnonymousBusinessProfile:true}),
    applyStudioSettingsSyncPayload:(payload)=>{applied=payload;},
  };
  load('settings-sync.js',window);
  await window.KLABS_SETTINGS_SYNC.onAuthStateChanged(session('B'));
  assert.equal(reads,0);
  assert.equal(writes.length,1);
  assert.equal(writes[0].user_id,'B');
  assert.equal(writes[0].payload.businessProfile.businessName,'Account B');
  assert.equal(writes[0].payload.businessProfile.paymentAccountNumber,'');
  assert.equal(applied.businessProfile.businessName,'Account B');
  assert.equal(store.values.get('klabs-studio-settings-anonymous-owner'),'A');
});

test('a delayed settings read from A cannot apply or upload after switching to B',async()=>{
  let release;
  const delayed=new Promise((resolve)=>{release=resolve;});
  const store=storage({});
  const writes=[];
  const applied=[];
  let account='A';
  const window={
    Store:store,
    KLABS_SUPABASE_CLIENT:{from(){
      let userId;
      const query={
        select(){return query;},
        eq(key,value){userId=value;return query;},
        maybeSingle(){return userId==='A'?delayed:Promise.resolve({data:null,error:null});},
        upsert(row){writes.push(row);return Promise.resolve({error:null});},
      };
      return query;
    }},
    readStudioSettingsSyncPayload:()=>({businessProfile:{businessName:account}}),
    applyStudioSettingsSyncPayload:(payload)=>{applied.push(payload.businessProfile.businessName);},
  };
  load('settings-sync.js',window);
  const a=window.KLABS_SETTINGS_SYNC.onAuthStateChanged(session('A'));
  window.KLABS_SETTINGS_SYNC.onAuthStateChanged(null);
  account='B';
  await window.KLABS_SETTINGS_SYNC.onAuthStateChanged(session('B'));
  release({data:{payload:{businessProfile:{businessName:'A'}}},error:null});
  await a;
  assert.deepEqual(applied,['B']);
  assert.deepEqual(writes.map((row)=>row.user_id),['B']);
});

test('failed settings uploads keep the same-account pending patch for retry',async()=>{
  const store=storage({});
  let fail=true;
  const timers=[];
  const window={
    Store:store,
    KLABS_SUPABASE_CLIENT:{from(){
      const query={
        select(){return query;},
        eq(){return query;},
        maybeSingle:async()=>({data:{payload:{businessProfile:{businessName:'Before'}}},error:null}),
        upsert(){return Promise.resolve({error:fail?{message:'offline'}:null});},
      };
      return query;
    }},
    readStudioSettingsSyncPayload:()=>({businessProfile:{businessName:'Before'}}),
    applyStudioSettingsSyncPayload(){},
  };
  const source=fs.readFileSync(path.join(__dirname,'..','js','settings-sync.js'),'utf8');
  vm.runInNewContext(source,{window,console:{error(){}},setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){}});
  await window.KLABS_SETTINGS_SYNC.onAuthStateChanged(session('A'));
  window.KLABS_SETTINGS_SYNC.notifySettingsChanged({businessProfile:{businessName:'After'}});
  timers.shift()();
  await new Promise((resolve)=>setImmediate(resolve));
  assert.equal(store.values.get('klabs-studio-settings-pending:A').businessProfile.businessName,'After');
  fail=false;
  await window.KLABS_SETTINGS_SYNC.refreshFromCloud();
  assert.equal(Object.keys(store.values.get('klabs-studio-settings-pending:A')).length,0);
});
