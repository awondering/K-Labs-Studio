const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const start=source.indexOf('function updateQuoteActionPriority(');
const end=source.indexOf('\nfunction ',start+1);
const code=source.slice(start,end);

function run(status,flash='',options={}){
  const element={textContent:'',classList:{toggle(name,value){element.pending=value;}}};
  const context=vm.createContext({
    window:{KLABS_BUILD_SYNC:{getStatus:()=>status}},
    $:()=>element,workshopStatusFlashText:flash,workshopStatusFlashUntil:Date.now()+10000,
    workshopStatusFlashPending:false,quoteAutosaveInFlight:!!options.saving,hasUnsavedQuoteChanges:!!options.dirty,
    depositValidationMessage:()=>options.depositError||'',Date,
  });
  vm.runInContext(code,context);
  context.updateQuoteActionPriority();
  return element;
}

test('sync errors and pending sync cannot be hidden by a local saved flash',()=>{
  assert.equal(run('error','Saved').textContent,'NOT SYNCED — REVIEW REQUIRED');
  assert.equal(run('pending','Saved').textContent,'Saved locally — syncing');
  assert.equal(run('synced').textContent,'✓ Synced');
  assert.equal(run('local').textContent,'Saved locally');
});
test('unsaved draft and validation errors take precedence over a prior synced state or flash',()=>{
  assert.equal(run('synced','Saved',{dirty:true}).textContent,'Saving locally...');
  assert.equal(run('pending','Saved',{depositError:'invalid'}).textContent,'Not saved: correct the deposit requirement');
  assert.equal(run('local','Saved').textContent,'Saved — saved locally');
});
