const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function extract(name,async=false){
  const start=source.indexOf(`${async?'async ':''}function ${name}(`);
  assert.notEqual(start,-1);
  const next=source.slice(start+1).search(/\n(?:async )?function /);
  return source.slice(start,next<0?source.length:start+1+next);
}
test('switching accounts while quote allocation is pending cannot save into the new account',async()=>{
  let release,account='A',writes=0;
  const context=vm.createContext({
    quote:{id:'a',quoteNumber:'A1'},activeAccountKey:()=>account,
    depositValidationMessage:()=>'',ensureCurrentQuoteNumber:()=>new Promise(resolve=>{release=resolve;}),
    saveQuoteCurrent(){writes++;},persistBuildRecord(){writes++;},setActiveSavedBuildRef(){},
  });
  vm.runInContext(extract('persistCurrentQuoteRecord',true),context);
  const pending=context.persistCurrentQuoteRecord();
  account='B';
  context.quote={id:'b',quoteNumber:'B1'};
  release();
  await assert.rejects(pending,/account or build changed/);
  assert.equal(writes,0);
});
test('a late autosave failure does not mark the new account dirty or clear its in-flight save',async()=>{
  let reject,account='A';
  const context=vm.createContext({
    quote:{id:'a'},activeAccountKey:()=>account,hasUnsavedQuoteChanges:true,
    quoteAutosaveInFlight:false,updateQuoteActionPriority(){},markQuoteSaved(){throw Error('unexpected');},
    persistCurrentQuoteRecord:()=>new Promise((resolve,fail)=>{reject=fail;}),
    flashWorkshopStatus(){throw Error('unexpected');},console:{error(){}},
  });
  vm.runInContext(extract('runQuoteAutosave',true),context);
  const pending=context.runQuoteAutosave();
  account='B';
  context.quote={id:'b'};
  context.hasUnsavedQuoteChanges=false;
  context.quoteAutosaveInFlight=true;
  reject(new Error('interrupted'));
  await pending;
  assert.equal(context.hasUnsavedQuoteChanges,false);
  assert.equal(context.quoteAutosaveInFlight,true);
});
