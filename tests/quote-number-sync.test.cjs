const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ui=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const allocatorSource=fs.readFileSync(path.join(__dirname,'..','js','quote-number-allocator.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

const ACCOUNT='56182f95-eba7-4d45-bd9b-95fd223b27e5';
const OTHER='11111111-2222-3333-4444-555555555555';

function functionSource(name,isAsync){
  const start=ui.indexOf(`${isAsync?'async ':''}function ${name}(`);
  assert.ok(start>=0,name);
  return ui.slice(start,ui.indexOf('\n}',start)+2);
}

function deferred(){
  let resolve,reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function allocatorHarness({session=ACCOUNT,accountId=ACCOUNT,row={next_number:9953},queryError=null}={}){
  const calls={rpc:0,from:[],filters:[]};
  const builder={
    select(columns){calls.from.push({select:columns});return builder;},
    eq(column,value){calls.filters.push([column,value]);return builder;},
    async maybeSingle(){return {data:row,error:queryError};},
  };
  const supabase={
    auth:{getSession:async()=>({data:{session:session?{user:{id:session}}:null},error:null})},
    rpc(){calls.rpc+=1;throw new Error('peek must never call the allocation RPC');},
    from(table){calls.from.push({table});return builder;},
  };
  const window={KLABS_SUPABASE_CLIENT:supabase,KLABS_ACCOUNT_ID:accountId};
  vm.runInNewContext(allocatorSource,{window});
  return {window,calls};
}

test('peek reads the signed-in counter row without consuming a number',async()=>{
  const {window,calls}=allocatorHarness();
  const result=await window.KLABS_QUOTE_NUMBERS.peek();
  assert.deepEqual({...result},{userId:ACCOUNT,nextNumber:9953});
  assert.equal(calls.rpc,0);
  assert.deepEqual(calls.from.map((c)=>c.table).filter(Boolean),['quote_number_counters']);
  assert.deepEqual(calls.filters,[['user_id',ACCOUNT]]);
});

test('peek reports an unallocated counter as null and rejects bad, failed or mismatched reads',async()=>{
  assert.equal((await allocatorHarness({row:null}).window.KLABS_QUOTE_NUMBERS.peek()).nextNumber,null);
  await assert.rejects(()=>allocatorHarness({row:{next_number:'abc'}}).window.KLABS_QUOTE_NUMBERS.peek(),/invalid sequence/);
  await assert.rejects(()=>allocatorHarness({queryError:new Error('offline')}).window.KLABS_QUOTE_NUMBERS.peek(),/offline/);
  await assert.rejects(()=>allocatorHarness({accountId:OTHER}).window.KLABS_QUOTE_NUMBERS.peek(),/Sign in/);
  await assert.rejects(()=>allocatorHarness({session:'',accountId:''}).window.KLABS_QUOTE_NUMBERS.peek(),/Sign in/);
});

function uiHarness({accountId=ACCOUNT,localNext=1000,peek}={}){
  const el=()=>({value:'',placeholder:'',readOnly:false,hidden:false,textContent:'',attrs:{},
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}});
  const elements={settingsQuoteNextNumber:el(),settingsQuoteNumberPreview:el(),settingsQuoteNumberStatus:el()};
  const context={
    elements,
    window:{
      KLABS_ACCOUNT_ID:accountId,
      KLABS_QUOTE_NUMBERS:{
        peek:peek||(async()=>({userId:context.window.KLABS_ACCOUNT_ID,nextNumber:9953})),
        allocate(){throw new Error('allocate must not be called by display refreshes');},
      },
    },
    document:{activeElement:null},
    console:{error(){}},
    numberOrZero:(value)=>Number(value)||0,
    $:(id)=>elements[id],
    BUSINESS_PROFILE_TEXT_FIELDS:[],
    businessProfile:{quotePrefix:'KLABS',quoteNextNumber:localNext},
  };
  vm.createContext(context);
  const names=['signedInQuoteNumbering','currentServerQuoteCounter','resetServerQuoteCounter','quoteNumberingPreview','quoteNumberingDirty','syncBusinessProfileControls','formatQuoteNumber'];
  vm.runInContext([
    "let serverQuoteCounter={accountId:'',status:'idle',next:null};let serverQuoteCounterSeq=0;let serverQuoteCounterInFlight=null;",
    ...names.map((name)=>functionSource(name)),
    functionSource('refreshServerQuoteCounter',true),
    'globalThis.api={signedInQuoteNumbering,resetServerQuoteCounter,refreshServerQuoteCounter,quoteNumberingPreview,quoteNumberingDirty,syncBusinessProfileControls,state:()=>serverQuoteCounter};',
  ].join('\n'),context);
  return context;
}

test('a stale local 1000 is never shown as authoritative for a signed-in account',async()=>{
  const c=uiHarness({localNext:1000});
  c.api.resetServerQuoteCounter();
  c.api.syncBusinessProfileControls(true);
  const input=c.elements.settingsQuoteNextNumber;
  assert.equal(input.value,'');
  assert.equal(c.elements.settingsQuoteNumberPreview.textContent,'—');
  assert.match(c.elements.settingsQuoteNumberStatus.textContent,/Checking/);
  await c.api.refreshServerQuoteCounter();
  assert.equal(input.value,'9953');
  assert.equal(c.elements.settingsQuoteNumberPreview.textContent,'KLABS9953');
  assert.equal(c.elements.settingsQuoteNumberStatus.hidden,true);
  assert.equal(c.businessProfile.quoteNextNumber,1000,'display refresh must not rewrite the local counter');
});

test('Next Quote Number is read-only when signed in and editable in anonymous mode',async()=>{
  const signedIn=uiHarness();
  await signedIn.api.refreshServerQuoteCounter();
  assert.equal(signedIn.elements.settingsQuoteNextNumber.readOnly,true);
  assert.equal(signedIn.elements.settingsQuoteNextNumber.attrs['aria-readonly'],'true');
  const anonymous=uiHarness({accountId:'',localNext:1234});
  anonymous.api.syncBusinessProfileControls(true);
  const input=anonymous.elements.settingsQuoteNextNumber;
  assert.equal(input.readOnly,false);
  assert.equal(input.value,'1234');
  assert.equal(anonymous.elements.settingsQuoteNumberPreview.textContent,'KLABS1234');
  assert.equal(await anonymous.api.refreshServerQuoteCounter(),null,'anonymous mode never reads the server');
  assert.equal(anonymous.api.quoteNumberingDirty('KLABS','1300'),true);
  assert.equal(signedIn.api.quoteNumberingDirty('KLABS','1'),false,'signed-in edits to the number are not a pending change');
  assert.equal(signedIn.api.quoteNumberingDirty('KL-','1'),true);
});

test('an unreachable server shows an unavailable state, keeping any last known value flagged as stale',async()=>{
  let fail=false;
  const c=uiHarness({peek:async()=>{if(fail)throw new Error('offline');return {userId:ACCOUNT,nextNumber:9953};}});
  fail=true;
  await c.api.refreshServerQuoteCounter();
  const input=c.elements.settingsQuoteNextNumber;
  assert.equal(input.value,'');
  assert.equal(input.placeholder,'Unavailable');
  assert.equal(c.elements.settingsQuoteNumberPreview.textContent,'—');
  assert.match(c.elements.settingsQuoteNumberStatus.textContent,/unavailable/i);
  fail=false;
  await c.api.refreshServerQuoteCounter();
  assert.equal(input.value,'9953');
  fail=true;
  await c.api.refreshServerQuoteCounter();
  assert.equal(c.api.state().status,'unavailable');
  assert.equal(input.value,'9953');
  assert.match(c.elements.settingsQuoteNumberStatus.textContent,/out of date/);
  assert.equal(c.elements.settingsQuoteNumberStatus.hidden,false);
});

test('an unallocated counter is shown as not yet allocated',async()=>{
  const c=uiHarness({peek:async()=>({userId:ACCOUNT,nextNumber:null})});
  await c.api.refreshServerQuoteCounter();
  assert.equal(c.elements.settingsQuoteNextNumber.value,'');
  assert.equal(c.elements.settingsQuoteNextNumber.placeholder,'Not yet allocated');
  assert.equal(c.elements.settingsQuoteNumberPreview.textContent,'—');
});

test('concurrent refreshes are deduplicated and a forced refresh supersedes an older response',async()=>{
  const pending=[];
  let calls=0;
  const c=uiHarness({peek:()=>{calls+=1;const d=deferred();pending.push(d);return d.promise;}});
  const first=c.api.refreshServerQuoteCounter();
  const duplicate=c.api.refreshServerQuoteCounter();
  assert.equal(calls,1,'focus/visibility/settings triggers share one in-flight read');
  const forced=c.api.refreshServerQuoteCounter({force:true});
  assert.equal(calls,2);
  pending[1].resolve({userId:ACCOUNT,nextNumber:9954});
  await forced;
  pending[0].resolve({userId:ACCOUNT,nextNumber:9953});
  assert.equal(await first,null);
  await duplicate;
  assert.equal(c.api.state().next,9954,'the older, lower response must not overwrite the newer one');
  assert.equal(c.elements.settingsQuoteNextNumber.value,'9954');
});

test('responses that arrive after an account change are discarded',async()=>{
  const d=deferred();
  const c=uiHarness({peek:()=>d.promise});
  const request=c.api.refreshServerQuoteCounter();
  c.window.KLABS_ACCOUNT_ID=OTHER;
  c.api.resetServerQuoteCounter();
  d.resolve({userId:ACCOUNT,nextNumber:9953});
  assert.equal(await request,null);
  assert.equal(c.api.state().accountId,OTHER);
  assert.equal(c.api.state().next,null);
  assert.equal(c.elements.settingsQuoteNextNumber.value,'');

  const failing=deferred();
  const c2=uiHarness({peek:()=>failing.promise});
  const pendingFailure=c2.api.refreshServerQuoteCounter();
  c2.window.KLABS_ACCOUNT_ID='';
  c2.api.resetServerQuoteCounter();
  failing.reject(new Error('late failure'));
  assert.equal(await pendingFailure,null);
  assert.equal(c2.api.state().status,'idle');
});

test('refresh is wired to sign-in, opening Settings and returning to the app',()=>{
  assert.match(functionSource('reloadBusinessProfileForAccount'),/resetServerQuoteCounter\(\);[\s\S]*refreshServerQuoteCounter\(\);\n}/);
  assert.match(functionSource('onScreenChange'),/screenId==='settingsScreen'\)refreshServerQuoteCounter\(\)/);
  assert.match(ui,/addEventListener\('visibilitychange'[\s\S]{0,120}refreshServerQuoteCounter\(\)/);
  assert.match(ui,/window\.addEventListener\('focus',\(\)=>\{refreshServerQuoteCounter\(\);\}\)/);
  assert.match(ui,/onAccountChange:\(\)=>\{reloadBusinessProfileForAccount\(\)/);
  assert.ok(html.includes('id="settingsQuoteNumberStatus"'));
});

test('signed-in Settings cannot write the quote counter and allocation logic is unchanged',()=>{
  const bind=ui.slice(ui.indexOf("const nextNumberInput=$('settingsQuoteNextNumber');\n  if(nextNumberInput && nextNumberInput.getAttribute('data-business-profile-bound')"));
  assert.match(bind,/const commitNextNumber=\(\)=>\{\n\s+if\(signedInQuoteNumbering\(\)\)\{syncBusinessProfileControls\(true\);return;\}/);
  assert.match(bind,/if\(nextNumberInput && !signedInQuoteNumbering\(\)\)businessProfile\.quoteNextNumber=/);
  const assign=functionSource('assignNextQuoteNumber',true);
  assert.ok(assign.includes('await allocator.allocate(historicalQuoteSequenceFloor())'));
  assert.ok(assign.includes('businessProfile.quoteNextNumber=Math.max(historicalQuoteSequenceFloor(),sequence+1)'));
  assert.ok(allocatorSource.includes('rpc("allocate_quote_number", { p_minimum_next: floor })'));
});
