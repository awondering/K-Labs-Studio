const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

// Isolated mocked storage: the real Store/localStorage is never touched.
function harness({failWrites=false}={}){
  const data={'klabs-workshop-quotes':[
    {id:'q-alex-1',customerName:'Alex Mason',buildName:''},
    {id:'q-alex-2',customerName:'Alex Mason',buildName:'Second'},
    {id:'q-other',customerName:'Sam',buildName:''},
  ]};
  const context={
    data,failWrites,renders:[],clears:0,dialogs:[],sync:[],
    activeSavedBuildRef:null,
    Store:{get:(k,f)=>data[k]===undefined?f:JSON.parse(JSON.stringify(data[k])),set(k,v){if(context.failWrites)throw new Error('quota');data[k]=v;}},
    specificationValue:(v)=>String(v==null?'':v).trim(),
    window:{KLABS_BUILD_SYNC:{notifyBuildDeleted:(id)=>context.sync.push(id)}},
    closeSavedBuildRowMenu(){},
    clearActiveSavedBuildRef(){context.clears+=1;context.activeSavedBuildRef=null;},
    renderBuilds(){context.renders.push('builds');},
    renderCustomerFinder(){context.renders.push('finder');},
    openConfirmDialog(config,handler){context.dialogs.push({config,handler});},
    console:{error(){}},
  };
  vm.createContext(context);
  vm.runInContext(['deleteSavedEntryBySource','deleteSavedEntryById','requestDeleteSavedBuildRecord'].map(functionSource).join('\n'),context);
  return context;
}

test('Delete Quote asks first; Cancel changes nothing',()=>{
  const c=harness();
  c.requestDeleteSavedBuildRecord('quote',0,{title:'Delete Quote?',confirmLabel:'Delete Quote'});
  assert.equal(c.dialogs.length,1);
  assert.equal(c.dialogs[0].config.actions.map((a)=>a.id).join(),'cancel,delete');
  assert.equal(c.dialogs[0].config.actions[1].kind,'danger');
  c.dialogs[0].handler('cancel');
  assert.equal(c.data['klabs-workshop-quotes'].length,3);
  assert.deepEqual(c.renders,[]);
});

test('Confirm deletes only the selected record by ID, even if the list shifted',()=>{
  const c=harness();
  c.requestDeleteSavedBuildRecord('quote',1,{});
  // Another record is removed before confirmation: the stale index now points at a different row.
  c.data['klabs-workshop-quotes'].splice(0,1);
  c.dialogs[0].handler('delete');
  assert.deepEqual(c.data['klabs-workshop-quotes'].map((r)=>r.id),['q-other']);
  assert.deepEqual(c.renders,['builds','finder']);
});

test('Confirm removes only the selected quote and keeps the others',()=>{
  const c=harness();
  c.requestDeleteSavedBuildRecord('quote',0,{});
  c.dialogs[0].handler('delete');
  assert.deepEqual(c.data['klabs-workshop-quotes'].map((r)=>r.id),['q-alex-2','q-other']);
  assert.deepEqual(c.sync,[]);
});

test('active record handling: deleted active ref is cleared, later refs shift',()=>{
  let c=harness();
  c.activeSavedBuildRef={source:'quote',index:0};
  c.requestDeleteSavedBuildRecord('quote',0,{});
  c.dialogs[0].handler('delete');
  assert.equal(c.activeSavedBuildRef,null);
  c=harness();
  c.activeSavedBuildRef={source:'quote',index:2};
  c.requestDeleteSavedBuildRecord('quote',0,{});
  c.dialogs[0].handler('delete');
  assert.equal(c.activeSavedBuildRef.index,1);
});

test('Failure shows an error, keeps data, and retry succeeds',()=>{
  const c=harness({failWrites:true});
  c.requestDeleteSavedBuildRecord('quote',0,{});
  c.dialogs[0].handler('delete');
  assert.equal(c.data['klabs-workshop-quotes'].length,3);
  assert.equal(c.dialogs.length,2);
  assert.equal(c.dialogs[1].config.error,true);
  assert.equal(c.dialogs[1].config.actions[1].label,'Retry');
  assert.deepEqual(c.renders,[]);
  c.failWrites=false;
  c.dialogs[1].handler('delete');
  assert.deepEqual(c.data['klabs-workshop-quotes'].map((r)=>r.id),['q-alex-2','q-other']);
  assert.deepEqual(c.renders,['builds','finder']);
});

test('Confirmation stacks above the customer sheet with 44px targets and focus return',()=>{
  assert.match(css,/#confirmSheet\{z-index:200\}/);
  assert.match(css,/#confirmSheet \.quote-preview-actions button[\s\S]*min-height:44px/);
  assert.match(functionSource('openConfirmDialog'),/document\.body\.appendChild\(confirmSheetEl\)/);
  assert.match(functionSource('closeConfirmDialog'),/opener\.focus/);
});
