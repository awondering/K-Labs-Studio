// Q1 Delete Repair: deletion wording follows the job type (Build / Repair / Order). Wording only: the deletion rules,
// including "an issued invoice blocks deletion", are the same for every job type. Synthetic records in mocked storage only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function functionSource(name){
  const start=source.indexOf(`\nfunction ${name}(`)+1;
  assert.ok(start>0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
const plain=(v)=>JSON.parse(JSON.stringify(v));

const BUILDS='klabs-workshop-builds:local';
const KINDS={
  build:{record:{jobType:'build'},noun:'Build'},
  repair:{record:{jobType:'repair'},noun:'Repair'},
  order:{record:{jobType:'build',jobKind:'components'},noun:'Order'},
};

function harness(records){
  const data={[BUILDS]:plain(records)};
  const c={
    data,dialogs:[],info:[],flashes:[],sync:[],finalized:0,renders:[],
    quote:null,activeSavedBuildRef:null,
    Store:{get:(k,f)=>data[k]===undefined?f:plain(data[k]),set(k,v){data[k]=plain(v);return true;}},
    specificationValue:(v)=>String(v==null?'':v).trim(),
    window:{KLABS_BUILD_SYNC:{notifyBuildDeleted:(r)=>c.sync.push(['notify',r&&r.id||r]),confirmBuildDeleted:(id)=>c.sync.push(['confirm',id])}},
    openConfirmDialog(config,handler){c.dialogs.push({config,handler});},
    openInfoDialog(title,message){c.info.push({title,message});},
    flashWorkshopStatus(message){c.flashes.push(message);},
    finalizeDeletedCurrentBuild(){c.finalized+=1;},
    findCurrentSavedBuildTarget:()=>c.target,
    savedBuildRecords:()=>c.Store.get(BUILDS,[]),
    closeSavedBuildRowMenu(){},clearActiveSavedBuildRef(){},
    renderBuilds(){c.renders.push('builds');},renderCustomerFinder(){c.renders.push('finder');},
    console:{error(){}},
  };
  vm.createContext(c);
  vm.runInContext("const BUILDS_STORAGE_KEY='klabs-workshop-builds';const QUOTES_STORAGE_KEY='klabs-workshop-quotes';",c);
  vm.runInContext(['accountScopedStorageKey','buildsStorageKey','quotesStorageKey','activeAccountKey','deleteSavedEntryBySource','deleteSavedEntryById',
    'normalizeJobType','normalizeJobKind','isComponentsJob','deletionNoun','openIssuedInvoiceDeleteBlock',
    'requestDeleteCurrentBuild','requestDeleteSavedBuildRecord'].map(functionSource).join('\n'),c);
  return c;
}
const job=(kind,extra={})=>({id:`job-${kind}`,customerName:'Synthetic Customer',buildName:'',...KINDS[kind].record,...extra});
const openInWorkshop=(c,record)=>{c.target={record:plain(record)};c.quote=plain(record);};

for(const [kind,{noun}] of Object.entries(KINDS)){
  const lower=noun.toLowerCase();

  test(`${kind}: the workshop delete confirmation says "${noun}"`,()=>{
    const c=harness([job(kind)]);
    openInWorkshop(c,job(kind));
    c.requestDeleteCurrentBuild();
    const {config}=c.dialogs[0];
    assert.equal(config.title,`Delete ${noun}`);
    assert.equal(config.message,`Delete this ${lower}? This will permanently delete this saved ${lower} only.`);
    assert.deepEqual(plain(config.actions.map((a)=>`${a.id}:${a.label}:${a.kind}`)),['cancel:Cancel:ghost',`delete:Delete ${noun}:danger`]);
    const named=harness([job(kind,{buildName:'Shimano Spin 7ft'})]);
    openInWorkshop(named,job(kind,{buildName:'Shimano Spin 7ft'}));
    named.requestDeleteCurrentBuild();
    assert.equal(named.dialogs[0].config.message,`Delete Shimano Spin 7ft? This will permanently delete this saved ${lower} only.`);
  });

  test(`${kind}: Cancel deletes nothing; Delete removes the record exactly as before (same storage and sync steps)`,()=>{
    const c=harness([job(kind),{id:'other',jobType:'build'}]);
    openInWorkshop(c,job(kind));
    c.requestDeleteCurrentBuild();
    c.dialogs[0].handler('cancel');
    assert.equal(c.data[BUILDS].length,2);assert.deepEqual(c.sync,[]);assert.equal(c.finalized,0);
    c.requestDeleteCurrentBuild();
    c.dialogs[1].handler('delete');
    assert.deepEqual(c.data[BUILDS].map((r)=>r.id),['other']);
    assert.deepEqual(c.sync,[['notify',`job-${kind}`],['confirm',`job-${kind}`]]);
    assert.equal(c.finalized,1);
  });

  test(`${kind}: an issued invoice still blocks deletion, with "${noun}" wording`,()=>{
    const invoiced=job(kind,{issuedInvoice:{number:'INV-TEST',total:100}});
    const c=harness([invoiced]);
    openInWorkshop(c,invoiced);
    c.requestDeleteCurrentBuild();
    assert.deepEqual(c.info,[{title:`${noun} Cannot Be Deleted`,message:`This ${lower} contains an issued invoice and must be retained.`}]);
    assert.equal(c.dialogs.length,0,'no delete confirmation is offered');
    assert.equal(c.data[BUILDS].length,1);assert.deepEqual(c.sync,[]);
  });

  test(`${kind}: an invoice issued while the confirmation is open still blocks deletion`,()=>{
    const c=harness([job(kind)]);
    openInWorkshop(c,job(kind));
    c.requestDeleteCurrentBuild();
    c.data[BUILDS][0].issuedInvoice={number:'INV-TEST',total:100};
    c.dialogs[0].handler('delete');
    assert.equal(c.info[0].title,`${noun} Cannot Be Deleted`);
    assert.equal(c.data[BUILDS].length,1);assert.deepEqual(c.sync,[]);assert.equal(c.finalized,0);
  });

  test(`${kind}: the saved jobs list confirmation says "Delete this ${lower}?" and an issued invoice blocks it`,()=>{
    const c=harness([job(kind)]);
    c.requestDeleteSavedBuildRecord('build',0);
    assert.equal(c.dialogs[0].config.title,`Delete this ${lower}?`);
    assert.equal(c.dialogs[0].config.message,'This action cannot be undone.');
    c.dialogs[0].handler('delete');
    assert.equal(c.data[BUILDS].length,0,'deletes as before');
    const blocked=harness([job(kind,{issuedInvoice:{number:'INV-TEST',total:100}})]);
    blocked.requestDeleteSavedBuildRecord('build',0);
    assert.equal(blocked.info[0].title,`${noun} Cannot Be Deleted`);
    assert.equal(blocked.dialogs.length,0);assert.equal(blocked.data[BUILDS].length,1);
  });
}

test('an unsaved job asks to be saved first, in its own wording',()=>{
  for(const [kind,{noun}] of Object.entries(KINDS)){
    const c=harness([]);
    c.target=null;c.quote=job(kind);
    c.requestDeleteCurrentBuild();
    assert.deepEqual(c.flashes,[`Save the ${noun.toLowerCase()} before deleting`]);
    assert.equal(c.dialogs.length,0);
  }
});

test('customer history keeps its own "Delete Quote?" wording (options still override the default)',()=>{
  const c=harness([job('repair')]);
  c.requestDeleteSavedBuildRecord('build',0,{title:'Delete Quote?',message:'Delete only this quote/build history record?',confirmLabel:'Delete Quote'});
  assert.equal(c.dialogs[0].config.title,'Delete Quote?');
  assert.equal(c.dialogs[0].config.actions[1].label,'Delete Quote');
});
