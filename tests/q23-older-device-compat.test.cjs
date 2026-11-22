// Q23 compatibility proof: devices still on build148-v270 / v271 keep the new fields Q23 stores.
//   - buildHours (a saved, display-only field on a job) through open / edit / save, the id backfill and two-device sync;
//   - showAdvancedPricing and advancedPricingNoteDismissed (Studio settings) through settings normalisation and settings sync.
// The file uses only the record, sync and settings code next to it, so the SAME file is also run against checkouts of
// 607e308 (v270) and 53c4088 (v271) to prove the older clients' behaviour. Synthetic data only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');
const {makeCloud,synced,makeDevice,clone}=require('./helpers/sync-harness.cjs');

const plain=(value)=>value==null?value:JSON.parse(JSON.stringify(value));
const rodBuild=()=>({id:'build-q23-hours-1',buildNumber:'B-0301',quoteNumber:'Q-1301',quoteStatus:'quote',jobType:'build',
  customerName:'Synthetic Hours Customer',buildName:'Synthetic 7ft spin',notes:'',
  components:[{category:'Blank',description:'Synthetic blank',cost:150,unitCost:150,unitPrice:210,quantity:1}],
  labourRate:85,labourHours:0,buildHours:6.5,pricingDriver:'profit',targetProfit:300,payments:[],depositEnabled:false});

function recordHarness(){
  const storage=new Map();const notified=[];
  const env={target:null,
    Store:{get:(key,fallback)=>storage.has(key)?plain(storage.get(key)):fallback,set:(key,value)=>{storage.set(key,plain(value));return true;}},
    buildsStorageKey:()=>'builds',findCurrentSavedBuildTarget:()=>env.target,reconcileCommittedBuildStock(){},
    window:{KLABS_BUILD_SYNC:{notifyBuildSaved:(record)=>notified.push(plain(record))}}};
  const c=loadRecordFunctions(['normalizeQuote','quoteForPersistence','persistBuildRecord','ensureBuildRecordIdsBackfilled',
    'normalizeStudioSettings','settingsObjectPatch'],env);
  return {c,env,storage,notified};
}

test('an older client opening, editing and saving a build keeps buildHours (main build save path)',()=>{
  const {c,env,storage,notified}=recordHarness();
  storage.set('builds',[rodBuild()]);
  env.target={source:'build',index:0,record:rodBuild()};
  let opened=rodBuild();
  for(let i=0;i<3;i+=1)opened=plain(c.normalizeQuote(opened));
  assert.equal(opened.buildHours,6.5,'opening keeps it');
  const result=c.persistBuildRecord({...c.normalizeQuote(rodBuild()),phone:'021 000 0301'});
  for(const record of [result.record,storage.get('builds')[0],notified[0]]){
    assert.equal(record.buildHours,6.5);
    assert.equal(record.phone,'021 000 0301');
  }
  assert.equal(plain(c.quoteForPersistence(c.normalizeQuote(rodBuild()))).buildHours,6.5,'persistence shaping keeps it');
});

test('the one-time id backfill on an older client keeps buildHours',()=>{
  const {c,storage}=recordHarness();
  const {id,...withoutId}=rodBuild();
  storage.set('builds',[withoutId]);
  c.ensureBuildRecordIdsBackfilled();
  const stored=storage.get('builds')[0];
  assert.equal(stored.id,'build-generated','the backfill really ran');
  assert.equal(stored.buildHours,6.5);
});

test('sync: an older device editing a different field keeps buildHours in the cloud and on the other device',async()=>{
  const cloud=makeCloud();
  const record=rodBuild();
  const newer=await synced(cloud,'U',record.id,record,'newer');
  const older=makeDevice(cloud,'U','older');older.seedLocal(record);await older.signIn();
  // The older device edits the way its own code does (open, change, persist shaping), then saves.
  const {c}=recordHarness();
  const edited=plain(c.quoteForPersistence({...c.normalizeQuote(clone(older.record(record.id))),notes:'Older device note'}));
  older.save(edited);await older.flushTimers();await older.sync();
  const inCloud=cloud.rows('U').get(record.id).payload;
  assert.equal(inCloud.buildHours,6.5,'cloud keeps it');
  assert.equal(inCloud.notes,'Older device note');
  await newer.sync();
  assert.equal(newer.record(record.id).buildHours,6.5,'the other device keeps it');
  assert.equal(newer.record(record.id).notes,'Older device note');
  assert.deepEqual(Object.keys(older.journal().conflicts),[]);
});

test('sync: a buildHours change on one device and a notes change on an older device merge without loss',async()=>{
  const cloud=makeCloud();
  const record=rodBuild();
  const newer=await synced(cloud,'U',record.id,record,'newer');
  const older=makeDevice(cloud,'U','older');older.seedLocal(record);await older.signIn();
  newer.save({...clone(newer.record(record.id)),buildHours:8});await newer.flushTimers();await newer.sync();
  const {c}=recordHarness();
  older.save(plain(c.quoteForPersistence({...c.normalizeQuote(clone(older.record(record.id))),notes:'Merged note'})));
  await older.flushTimers();await older.sync();await older.sync();
  const inCloud=cloud.rows('U').get(record.id).payload;
  assert.equal(inCloud.buildHours,8);
  assert.equal(inCloud.notes,'Merged note');
});

test('settings: an older client keeps showAdvancedPricing and the dismissed note when it normalises settings',()=>{
  const {c}=recordHarness();
  const settings={taxRate:15,taxEnabled:true,currency:'NZD',showAdvancedPricing:true,advancedPricingNoteDismissed:true};
  const normalized=plain(c.normalizeStudioSettings(settings));
  assert.equal(normalized.showAdvancedPricing,true);
  assert.equal(normalized.advancedPricingNoteDismissed,true);
  // An unrelated settings change sends only that key, so the new keys are never overwritten.
  const patch=plain(c.settingsObjectPatch(normalized,{...normalized,taxRate:12.5}));
  assert.deepEqual(Object.keys(patch),['taxRate']);
});

test('settings sync: an older device changing another setting keeps showAdvancedPricing in the cloud',async()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','js','settings-sync.js'),'utf8');
  const Logo=require('../js/business-logo.js');
  const cloud=new Map([['A',{user_id:'A',payload:{studioSettings:{taxRate:15,showAdvancedPricing:true,advancedPricingNoteDismissed:true},businessProfile:{businessName:'Synthetic Rods'}}}]]);
  const values=new Map();const timers=[];
  const window={
    Store:{get:(k,f)=>values.has(k)?JSON.parse(values.get(k)):f,set:(k,v)=>{values.set(k,JSON.stringify(v));return true;}},
    KLABS_BUSINESS_LOGO:Logo,
    KLABS_SUPABASE_CLIENT:{from(table){
      assert.equal(table,'studio_settings');let id;
      const q={select(){return q;},eq(_k,v){id=v;return q;},maybeSingle:async()=>({data:cloud.get(id)||null,error:null}),
        upsert(row){cloud.set(row.user_id,JSON.parse(JSON.stringify(row)));return Promise.resolve({error:null});}};
      return q;}},
    // The older device's local settings do not have the new keys at all.
    readStudioSettingsSyncPayload:()=>({studioSettings:{taxRate:15},businessProfile:{businessName:'Synthetic Rods'}}),
    applyStudioSettingsSyncPayload(){},
  };
  vm.runInNewContext(src,{window,console,setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  await window.KLABS_SETTINGS_SYNC.onAuthStateChanged({user:{id:'A'}});
  window.KLABS_SETTINGS_SYNC.notifySettingsChanged({studioSettings:{taxRate:12.5}});
  for(const fn of timers.splice(0))await fn();
  await new Promise((r)=>setImmediate(r));
  const saved=cloud.get('A').payload.studioSettings;
  assert.equal(saved.taxRate,12.5);
  assert.equal(saved.showAdvancedPricing,true);
  assert.equal(saved.advancedPricingNoteDismissed,true);
});
