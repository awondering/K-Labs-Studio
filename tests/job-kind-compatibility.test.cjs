// Job 9 Stage 1 — compatibility guard for new job kinds (Repair / Refurb, customer Components).
// Characterises the SHIPPED v241 record and sync behaviour, which is exactly how an older client will treat records
// written by a newer one. Uses the real ui.js record functions (via helpers/job-record-loader.cjs) and the real build-sync stack.
// Synthetic data only. Tests marked { todo } describe Stage 2 requirements; they are reported, not counted as failures.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');

const plain=(value)=>value==null?value:JSON.parse(JSON.stringify(value));
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','job-records-v241.json'),'utf8'));
const TIMESTAMPS=['createdAt','savedAt','updatedAt'];
const withoutTimestamps=(record)=>{const copy=plain(record);TIMESTAMPS.forEach((key)=>delete copy[key]);return copy;};
const FINANCIAL_FIELDS=['quoteNumber','quoteStatus','jobType','payments','issuedInvoice','depositEnabled','depositType','depositValue',
  'finalCustomerPrice','priceAdjustment','naturalCustomerPrice','taxEnabled','includeGst','gstRate','labourRate','labourHours',
  'deliveryEntryMode','freight','packaging','deliveryTotal','fulfilmentMethod','components'];

// A Components job as a newer client would write it: jobType stays 'build' (understood by every client) and the new
// meaning lives in top-level fields. pricePending marks a job whose price is not yet known.
const componentsJob=()=>({
  id:'build-synthetic-supply-1',buildNumber:'B-0200',quoteNumber:'Q-1100',quoteStatus:'quote',
  jobType:'build',jobKind:'components',pricePending:true,
  customerName:'Synthetic Supply Customer',notes:'Two replacement rod tips required',
  components:[{category:'Tip Top',description:'Tip 5.5',cost:3,unitCost:3,unitPrice:9,quantity:2,libraryComponentId:'comp-tip-55'}],
  labourRate:60,labourHours:0,priceAdjustment:0,depositEnabled:false,payments:[],
});

// ---------- the shipped (v241) record functions ----------
function recordHarness(){
  const storage=new Map();
  const notified=[];
  const env={
    target:null,
    Store:{get:(key,fallback)=>storage.has(key)?plain(storage.get(key)):fallback,set:(key,value)=>{storage.set(key,plain(value));return true;}},
    buildsStorageKey:()=>'builds',
    findCurrentSavedBuildTarget:()=>env.target,
    reconcileCommittedBuildStock(){},
    window:{KLABS_BUILD_SYNC:{notifyBuildSaved:(record)=>notified.push(plain(record))}},
  };
  const c=loadRecordFunctions(['normalizeQuote','quoteForPersistence','persistBuildRecord','normalizeComponent',
    'normalizeJobType','ensureBuildRecordIdsBackfilled'],env);
  return {c,env,storage,notified};
}
// What v241 does when a saved record is opened, edited and saved again (load -> normalise -> persist).
function olderClientOpenAndSave(record,edit=(q)=>q){
  const {c,env,storage,notified}=recordHarness();
  storage.set('builds',[plain(record)]);
  env.target={source:'build',index:0,record:plain(record)};
  const opened=c.normalizeQuote(plain(record));
  const result=c.persistBuildRecord(edit(opened));
  return {saved:plain(result.record),stored:plain(storage.get('builds')[0]),notified};
}

// The form the app actually stores: open (normalise) then save (persistence shaping), repeated until nothing changes.
function atRest(record){
  const {c}=recordHarness();
  let current=plain(record);
  for(let i=0;i<4;i+=1){
    const next=plain(c.quoteForPersistence(c.normalizeQuote(current)));
    if(JSON.stringify(next)===JSON.stringify(current))return current;
    current=next;
  }
  throw new Error('record did not reach a stable saved form');
}

// ---------- 1. Existing rod builds, repairs, invoices, deposits and payments are unchanged ----------
for(const name of Object.keys(fixtures.raw)){
  test(`v241 snapshot: ${name} saves to exactly the recorded form`,()=>{
    assert.deepEqual(atRest(fixtures.raw[name]),fixtures.canonical[name]);
  });
  test(`v241 snapshot: ${name} is stable when re-opened, re-persisted and saved again`,()=>{
    const {c}=recordHarness();
    const canonical=fixtures.canonical[name];
    assert.deepEqual(plain(c.quoteForPersistence(c.normalizeQuote(plain(canonical)))),canonical,'re-opening and re-saving changes nothing');
    const {saved,stored,notified}=olderClientOpenAndSave(canonical);
    assert.deepEqual(withoutTimestamps(saved),withoutTimestamps(canonical),'open-and-save keeps every business field');
    assert.deepEqual(stored,saved);
    assert.deepEqual(notified,[saved],'exactly one sync notification with the saved record');
    for(const field of FINANCIAL_FIELDS)assert.deepEqual(saved[field],canonical[field],`${name}.${field}`);
  });
}

test('the invoiced rod build keeps its issued invoice, deposit and both payments byte-for-byte',()=>{
  const canonical=fixtures.canonical.rodBuildInvoiced;
  const {saved}=olderClientOpenAndSave(canonical);
  assert.deepEqual(saved.issuedInvoice,fixtures.raw.rodBuildInvoiced.issuedInvoice);
  assert.deepEqual(saved.payments,fixtures.raw.rodBuildInvoiced.payments);
  assert.equal(saved.depositEnabled,true);assert.equal(saved.depositType,'percent');assert.equal(saved.depositValue,30);
  assert.equal(saved.finalCustomerPrice,575.1);
  assert.equal(saved.issuedInvoice.total,saved.finalCustomerPrice,'synthetic invoice matches the saved price');
});

test('a repair stays a repair with its rod identification and description',()=>{
  const {saved}=olderClientOpenAndSave(fixtures.canonical.repairQuote);
  assert.equal(saved.jobType,'repair');
  assert.equal(saved.buildSpecifications.rodIdentification,'Example 12ft surf, two piece');
  assert.equal(saved.notes,'Replace broken tip top and rewrap two guides');
});

// Q5 (fixed in build148-v258): v241-v257 turned an empty Guide Setup into 5 / 50 mm / 500 mm, because Number(null) is 0 and
// was clamped to the minimums. Empty stays empty; real layouts and already-saved values are unchanged.
const guideTriple=(record)=>[record.guideSpecification.guideCount,record.guideSpecification.firstGuideMm,record.guideSpecification.targetStripperMm];
test('Q5: a new job without a guide layout keeps its Guide Setup empty through repeated open and save',()=>{
  const {c}=recordHarness();
  let record=plain(c.normalizeQuote(c.newQuoteTemplate()));
  for(let i=0;i<4;i+=1){
    assert.deepEqual(guideTriple(record),[null,null,null],'pass '+i);
    record=plain(c.quoteForPersistence(c.normalizeQuote(record)));
  }
  assert.deepEqual(guideTriple(plain(c.normalizeQuote({id:'g',components:[]}))),[null,null,null]);
});
test('Q5: empty strings and missing values are empty, not 5 / 50 / 500',()=>{
  const {c}=recordHarness();
  for(const spec of [{guideCount:null,firstGuideMm:null,targetStripperMm:null},{guideCount:'',firstGuideMm:'',targetStripperMm:' '},{},undefined]){
    assert.deepEqual(guideTriple(plain(c.normalizeQuote({id:'g',components:[],guideSpecification:spec}))),[null,null,null],JSON.stringify(spec));
  }
  const partial=plain(c.normalizeQuote({id:'g',components:[],guideSpecification:{guideCount:9,firstGuideMm:null,targetStripperMm:''}}));
  assert.deepEqual(guideTriple(partial),[9,null,null],'a real count keeps the other fields empty');
});
test('Q5: real guide layouts are unchanged, including clamping of out-of-range numbers',()=>{
  const {c}=recordHarness();
  const spec=(g,f,t)=>({id:'g',components:[],guideSpecification:{guideCount:g,firstGuideMm:f,targetStripperMm:t}});
  assert.deepEqual(guideTriple(plain(c.normalizeQuote(spec(9,105,1260)))),[9,105,1260]);
  assert.deepEqual(guideTriple(plain(c.normalizeQuote(spec('7','90','1100')))),[7,90,1100],'numeric strings still count');
  assert.deepEqual(guideTriple(plain(c.normalizeQuote(spec(3,20,9000)))),[5,50,2500],'out-of-range numbers clamp as before');
  assert.deepEqual(guideTriple(plain(c.normalizeQuote(spec(0,0,0)))),[5,50,500],'a stored zero is a number and clamps as before');
});
test('Q5: jobs already saved with 5 / 50 / 500 keep those values (no silent change to existing data)',()=>{
  const {c}=recordHarness();
  const saved={id:'old',components:[],guideSpecification:{guideCount:5,firstGuideMm:50,targetStripperMm:500,spiralMethod:'',spiralDirection:'',spiralOffsetStartAngle:0,spiralAngles:[]}};
  const {saved:reSaved}=olderClientOpenAndSave(saved);
  assert.deepEqual(guideTriple(reSaved),[5,50,500]);
  assert.deepEqual(plain(c.normalizeQuote(saved)).guideSpecification,saved.guideSpecification);
});

// ---------- 2. Older clients keep the new top-level Components fields ----------
test('an older client opening a Components job keeps jobKind, pricePending and jobType build',()=>{
  const {c}=recordHarness();
  let record=componentsJob();
  for(let i=0;i<3;i+=1)record=plain(c.normalizeQuote(record));
  assert.equal(record.jobKind,'components');
  assert.equal(record.pricePending,true);
  assert.equal(record.jobType,'build');
  assert.equal(record.notes,'Two replacement rod tips required');
});

test('an older client editing and saving a Components job keeps the new fields (main build save path)',()=>{
  const {saved,stored,notified}=olderClientOpenAndSave(componentsJob(),(q)=>({...q,phone:'021 000 0099'}));
  for(const record of [saved,stored,notified[0]]){
    assert.equal(record.jobKind,'components');
    assert.equal(record.pricePending,true);
    assert.equal(record.jobType,'build');
    assert.equal(record.phone,'021 000 0099');
  }
});

test('an older client creating-then-saving from a Components record (no existing target) keeps the new fields',()=>{
  const {c,env,storage}=recordHarness();
  env.target=null;
  const result=c.persistBuildRecord(c.normalizeQuote(componentsJob()));
  assert.equal(result.record.jobKind,'components');
  assert.equal(storage.get('builds')[0].pricePending,true);
});

test('the one-time id backfill keeps the new fields',()=>{
  const {c,storage}=recordHarness();
  const record=componentsJob();delete record.id;
  storage.set('builds',[record]);
  c.ensureBuildRecordIdsBackfilled();
  const stored=storage.get('builds')[0];
  assert.ok(stored.id);
  assert.equal(stored.jobKind,'components');
  assert.equal(stored.pricePending,true);
});

// ---------- 3. Why the design avoids a new jobType value and per-line flags ----------
test('UNSAFE (documented): an older client rewrites an unknown jobType value to build',()=>{
  const {c}=recordHarness();
  assert.equal(c.normalizeQuote({...componentsJob(),jobType:'components'}).jobType,'build');
});

test('UNSAFE (documented): an older client drops unknown per-line fields and turns a blank price into 0',()=>{
  const {c}=recordHarness();
  const line=plain(c.normalizeComponent({category:'Tip Top',description:'Unknown tip',quantity:1,unitPrice:'',priceUnknown:true}));
  assert.equal('priceUnknown' in line,false);
  assert.equal(line.unitPrice,0);
  const saved=plain(c.quoteForPersistence({...componentsJob(),components:[{category:'Tip Top',description:'Unknown tip',quantity:1,unitPrice:'',priceUnknown:true}]}));
  assert.equal('priceUnknown' in saved.components[0],false);
});

// ---------- 4. Sync: real build-sync stack, in-memory cloud with per-row revisions ----------
const read=(file)=>fs.readFileSync(path.join(__dirname,'..','js',file),'utf8');
const SYNC_SOURCES=[read('build-sync-journal.js'),read('guarded-build-transport.js'),read('build-sync.js')];
const settle=()=>new Promise((resolve)=>setImmediate(resolve));
function makeCloud(){
  let tick=0;const users={};
  const rows=(user)=>users[user]||(users[user]=new Map());
  const stamp=()=>new Date(Date.UTC(2026,10,1,0,0,++tick)).toISOString();
  return {rows,stamp,
    seed(user,id,payload){const row={user_id:user,client_id:id,build_number:payload.buildNumber||'',payload:plain(payload),updated_at:stamp()};rows(user).set(id,row);return row;},
    payload:(user,id)=>plain(rows(user).get(id).payload)};
}
function makeDevice(cloud,account){
  const store=new Map();const locals={list:[]};const timers=new Map();let timerId=0;
  const client={
    auth:{async getUser(){return {data:{user:{id:account}},error:null};}},
    async rpc(fn){if(fn==='klabs_build_guard_version')return {data:2,error:null};throw new Error('unexpected rpc '+fn);},
    from(table){
      assert.equal(table,'builds');
      const q={op:'select',filters:{},range:null,payload:null};
      const api={select(){return api;},order(){return api;},range(a,b){q.range=[a,b];return api;},eq(k,v){q.filters[k]=v;return api;},
        insert(row){q.op='insert';q.payload=row;return api;},update(row){q.op='update';q.payload=row;return api;},
        then(resolve,reject){return Promise.resolve(exec()).then(resolve,reject);}};
      function exec(){
        const mine=cloud.rows(account);
        if(q.op==='select'){
          const all=[...mine.values()].sort((a,b)=>a.client_id<b.client_id?-1:1);
          return {data:plain(all.slice(q.range[0],q.range[1]+1)),error:null,count:all.length};
        }
        if(q.op==='insert'){
          if(mine.has(q.payload.client_id))return {data:null,error:{code:'23505',message:'duplicate'}};
          const payload={...q.payload.payload};delete payload._buildGuardCreate;
          const row={...q.payload,payload,updated_at:cloud.stamp()};mine.set(row.client_id,row);return {data:[plain(row)],error:null};
        }
        const row=mine.get(q.filters.client_id);
        if(!row||row.updated_at!==q.filters.updated_at)return {data:[],error:null};
        const payload={...q.payload.payload};delete payload._expectedBuildRevision;
        const next={...row,payload,build_number:q.payload.build_number,updated_at:cloud.stamp()};mine.set(row.client_id,next);return {data:[plain(next)],error:null};
      }
      return api;
    },
  };
  const window={
    KLABS_SUPABASE_CLIENT:client,KLABS_ACCOUNT_ID:account,KLABS_CAN_WRITE:()=>true,
    localStorage:{getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)},
    navigator:{onLine:true},
    savedBuildRecords:()=>locals.list,
    saveBuildRecords:(list)=>{locals.list=plain(list);return true;},
    KLABS_UI:{refreshBuildViews(){},isBuildOpen:()=>false,onBuildSyncStatus(){},onBuildSyncMode(){}},
    addEventListener(){},
  };
  const ctx={window,console:{error(){},log(){},warn(){}},setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout(id){timers.delete(id);},Date,JSON,Math,Promise,Object,Array,Set,Map,Error,String,Number,Boolean,Symbol,structuredClone};
  vm.createContext(ctx);
  SYNC_SOURCES.forEach((src)=>vm.runInContext(src,ctx));
  const sync=window.KLABS_BUILD_SYNC;
  const device={
    record:(id)=>plain(locals.list.find((r)=>String(r.id)===id)),
    conflicts:()=>Object.keys(window.KLABS_BUILD_SYNC_JOURNAL.read(account).conflicts),
    status:()=>sync.getStatus(),
    async signIn(){await sync.onAuthStateChanged({user:{id:account}});await settle();},
    save(record){const i=locals.list.findIndex((r)=>r.id===record.id);if(i>=0)locals.list[i]=plain(record);else locals.list.unshift(plain(record));sync.notifyBuildSaved(plain(record));},
    async push(){for(const [id,t] of [...timers]){timers.delete(id);t.fn();}await settle();await settle();},
    async pull(){await sync.retry();await settle();},
  };
  return {device,locals};
}
async function twoSyncedDevices(record){
  const cloud=makeCloud();
  cloud.seed('U',record.id,record);
  const a=makeDevice(cloud,'U');a.locals.list=[plain(record)];await a.device.signIn();
  const b=makeDevice(cloud,'U');b.locals.list=[plain(record)];await b.device.signIn();
  return {cloud,newer:a.device,older:b.device};
}
// The older device edits the way v241 does: open (normalise), change, persist.
function olderEdit(record,edit){return olderClientOpenAndSave(record,edit).saved;}

test('sync: an older device editing a non-price field keeps the Components fields in the cloud and on other devices',async()=>{
  const job=atRest(componentsJob());
  const {cloud,newer,older}=await twoSyncedDevices(job);
  older.save(olderEdit(older.record(job.id),(q)=>({...q,phone:'021 000 0123'})));
  await older.push();
  const inCloud=cloud.payload('U',job.id);
  assert.equal(inCloud.jobKind,'components');
  assert.equal(inCloud.pricePending,true);
  assert.equal(inCloud.jobType,'build');
  assert.equal(inCloud.phone,'021 000 0123');
  await newer.pull();
  assert.equal(newer.record(job.id).jobKind,'components');
  assert.equal(newer.record(job.id).phone,'021 000 0123');
  assert.deepEqual(older.conflicts(),[]);
});

test('sync: an older device with a stale copy cannot silently overwrite a newer priced version (both changed pricing -> review)',async()=>{
  const job=atRest(componentsJob());
  const {cloud,newer,older}=await twoSyncedDevices(job);
  // Newer device resolves the price.
  const priced={...newer.record(job.id),pricePending:false,priceAdjustment:5};
  newer.save(priced);await newer.push();
  const afterNewer=cloud.payload('U',job.id);
  assert.equal(afterNewer.pricePending,false);
  // Older device, still on the old baseline, changes a line price.
  older.save(olderEdit(older.record(job.id),(q)=>({...q,components:q.components.map((line)=>({...line,unitPrice:11}))})));
  await older.push();await older.pull();
  const inCloud=cloud.payload('U',job.id);
  assert.equal(inCloud.pricePending,false,'the newer price decision survives');
  assert.equal(inCloud.priceAdjustment,5);
  assert.equal(inCloud.components[0].unitPrice,9,'the stale price change was not applied');
  assert.deepEqual(older.conflicts(),[job.id],'the older device is asked to review instead of overwriting');
});

test('sync: an older device that changed only contact details merges cleanly with a newer price decision',async()=>{
  const job=atRest(componentsJob());
  const {cloud,newer,older}=await twoSyncedDevices(job);
  newer.save({...newer.record(job.id),pricePending:false,priceAdjustment:5});await newer.push();
  older.save(olderEdit(older.record(job.id),(q)=>({...q,email:'supply@example.test'})));
  await older.push();await older.pull();
  const inCloud=cloud.payload('U',job.id);
  assert.equal(inCloud.pricePending,false);
  assert.equal(inCloud.priceAdjustment,5);
  assert.equal(inCloud.jobKind,'components');
  assert.equal(inCloud.email,'supply@example.test');
  assert.deepEqual(older.conflicts(),[]);
});

test('sync: an unchanged older device simply takes the newer Components version',async()=>{
  const job=atRest(componentsJob());
  const {newer,older}=await twoSyncedDevices(job);
  newer.save({...newer.record(job.id),pricePending:false,priceAdjustment:5});await newer.push();
  await older.pull();
  assert.equal(older.record(job.id).pricePending,false);
  assert.equal(older.record(job.id).jobKind,'components');
  assert.deepEqual(older.conflicts(),[]);
});

test('sync: an invoiced rod build round-trips between devices with its invoice, deposit and payments intact',async()=>{
  const canonical=fixtures.canonical.rodBuildInvoiced;
  const {cloud,newer,older}=await twoSyncedDevices(canonical);
  older.save(olderEdit(older.record(canonical.id),(q)=>({...q,notes:'Gloss black trim, signed'})));
  await older.push();await newer.pull();
  const inCloud=cloud.payload('U',canonical.id);
  const onNewer=newer.record(canonical.id);
  for(const record of [inCloud,onNewer]){
    assert.deepEqual(record.issuedInvoice,canonical.issuedInvoice);
    assert.deepEqual(record.payments,canonical.payments);
    assert.equal(record.finalCustomerPrice,canonical.finalCustomerPrice);
    assert.equal(record.depositValue,canonical.depositValue);
    assert.equal(record.notes,'Gloss black trim, signed');
  }
});

test('sync (documented): pricePending is already protected as a price field by the v241 sync rules',()=>{
  const syncSource=read('build-sync.js');
  const pattern=new RegExp(syncSource.match(/const PRICING_PATTERN = \/(.+)\/i;/)[1],'i');
  assert.ok(pattern.test('pricePending'),'pricePending matches the pricing pattern');
  assert.doesNotMatch(syncSource.match(/const PRICING_KEYS = new Set\(\[([\s\S]*?)\]\)/)[1],/jobKind/,'jobKind is not yet a pricing key');
});

// ---------- 5. Stage 2 requirements (todo: reported, not failures) ----------
test('Stage 2: sync treats jobKind as a price-linked field (never merged field by field)',{todo:true},()=>{
  assert.match(read('build-sync.js').match(/const PRICING_KEYS = new Set\(\[([\s\S]*?)\]\)/)[1],/"jobKind"/);
});
// Done (Q6): supabase/migrations/20261120000000_financial_pricing_pending.sql; behaviour in tests/financial-pricing-pending-isolated.cjs.
test('Stage 2: the server refuses to issue an invoice or record a payment while pricePending is set',()=>{
  const migrations=fs.readdirSync(path.join(__dirname,'..','supabase','migrations')).map((f)=>fs.readFileSync(path.join(__dirname,'..','supabase','migrations',f),'utf8')).join('\n');
  assert.match(migrations,/pricePending/);
});
// Done (Job 9 Stage 3): "To be confirmed" on documents while pricePending and Components wording are tested for real in
// tests/components-job.test.cjs. jobKind is fixed at creation (user decision), so a kind change never needs merging.
