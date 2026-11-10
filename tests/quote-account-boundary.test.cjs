const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const ui=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function extract(name){
  const start=ui.indexOf(`async function ${name}(`);
  assert.notEqual(start,-1);
  return ui.slice(start,ui.indexOf('\n}',start)+2);
}
function deferred(){
  let resolve;
  const promise=new Promise((done)=>{resolve=done;});
  return {promise,resolve};
}
function harness(){
  const requests=[];
  let saves=0;
  const context={
    window:{KLABS_ACCOUNT_ID:'A',KLABS_QUOTE_NUMBERS:{allocate(){const pending=deferred();requests.push(pending);return pending.promise;}}},
    businessProfile:{quoteNextNumber:1000,quotePrefix:'A'},
    quote:{quoteNumber:''},
    quoteNumberAllocationPromise:null,
    historicalQuoteSequenceFloor:()=>1000,
    saveBusinessProfile:()=>{saves++;},
    syncBusinessProfileControls(){},
    refreshServerQuoteCounter(){},
    formatQuoteNumber(number){return context.businessProfile.quotePrefix+number;},
    specificationValue:value=>String(value||'').trim(),
  };
  vm.createContext(context);
  vm.runInContext(`${extract('assignNextQuoteNumber')}\n${extract('ensureCurrentQuoteNumber')}`,context);
  return {context,requests,saves:()=>saves};
}

test('a delayed allocation cannot update another account profile after sign-out and switch',async()=>{
  const h=harness();
  const allocation=h.context.assignNextQuoteNumber();
  h.context.window.KLABS_ACCOUNT_ID='';
  h.context.window.KLABS_ACCOUNT_ID='B';
  h.context.businessProfile={quoteNextNumber:2000,quotePrefix:'B'};
  h.requests[0].resolve(1001);
  await assert.rejects(allocation,/Account changed/);
  assert.equal(h.context.businessProfile.quoteNextNumber,2000);
  assert.equal(h.saves(),0);
});

test('returning to the same account does not make an old allocation current again',async()=>{
  const h=harness();
  const allocation=h.context.assignNextQuoteNumber();
  h.context.window.KLABS_ACCOUNT_ID='B';
  h.context.businessProfile={quoteNextNumber:2000,quotePrefix:'B'};
  h.context.window.KLABS_ACCOUNT_ID='A';
  h.context.businessProfile={quoteNextNumber:1000,quotePrefix:'A'};
  h.requests[0].resolve(1001);
  await assert.rejects(allocation,/Account changed/);
  assert.equal(h.context.businessProfile.quoteNextNumber,1000);
  assert.equal(h.saves(),0);
});

test('same-account quote allocation keeps the existing counter and number behaviour',async()=>{
  const h=harness();
  const allocation=h.context.ensureCurrentQuoteNumber();
  h.requests[0].resolve(1001);
  assert.equal(await allocation,'A1001');
  assert.equal(h.context.businessProfile.quoteNextNumber,1002);
  assert.equal(h.context.quote.quoteNumber,'A1001');
  assert.equal(h.saves(),1);
});

test('an old allocation cannot clear a newer in-flight allocation',async()=>{
  const h=harness();
  const first=h.context.ensureCurrentQuoteNumber();
  h.context.quoteNumberAllocationPromise=null;
  h.context.quote={quoteNumber:''};
  const second=h.context.ensureCurrentQuoteNumber();
  h.requests[0].resolve(1001);
  await assert.rejects(first,/Quote changed/);
  assert.ok(h.context.quoteNumberAllocationPromise);
  h.requests[1].resolve(1002);
  assert.equal(await second,'A1002');
  assert.equal(h.context.quoteNumberAllocationPromise,null);
});
