// Job 9: Repair / Refurb routing for the (not yet activated) signed-in Home actions.
// Runs the real ui.js start-of-job functions in a sandbox: the new-job customer finder must start a Repair when asked,
// and every existing way of starting a job must still start a New Build. Synthetic data only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function fn(name){
  const at=source.indexOf(`function ${name}(`);
  assert.ok(at>=0,name);
  const start=source.slice(Math.max(0,at-6),at)==='async '?at-6:at;
  return source.slice(start,source.indexOf('\n}',at)+2);
}
const FUNCTIONS=['normalizeJobType','normalizeJobKind','isComponentsJob','quotePricePending','normalizeNewJobRequest','applyCustomerFieldsToQuoteFromRecord','runNewBuildStartAction','startNewQuoteFlow','startNewBuildFlow',
  'startNewRepairFlow','startNewComponentsFlow','startFreshQuoteForCustomer','handleCustomerSelectionForNewBuild','commitCreateCustomerFromNewBuildForm'];

function sandbox({unsavedDraft=false,confirm='start',savedJobs=[]}={}){
  const log={finderOpens:[],confirms:[],started:[],timers:[]};
  const ctx={
    console,Date,JSON,Object,String,Number,Array,Math,
    window:{setTimeout:(f)=>{log.timers.push(f);return 1;}},
    quote:{jobType:'build'},hasUnsavedQuoteChanges:unsavedDraft,quoteStartInFlight:false,
    customerFinderIntent:'browse',customerFinderNewBuildStep:'actions',customerFinderNewJobType:'build',customerFinderCreateInFlight:false,
    workflowReturnOrigin:'',workflowCustomerReturnKey:'',preserveWorkshopQuoteOnEntry:false,
    quoteHasMeaningfulDraft:()=>unsavedDraft,
    openConfirmDialog:(spec,cb)=>{log.confirms.push(spec);cb(confirm);},
    openCustomerFinderSheet:(intent)=>{log.finderOpens.push(intent);ctx.customerFinderIntent=intent==='new-build'?'new-build':'browse';},
    closeCustomerFinderSheet:()=>{},
    newQuoteTemplate:()=>({customerName:'',jobType:'build',components:[],payments:[]}),
    normalizeQuote:(q)=>({...q}),
    clearQuoteAutosaveTimer(){},closeCurrentBuildActionsMenu(){},clearActiveSavedBuildRef(){},clearLayoutEntryOrigin(){},clearWorkflowCustomerOrigin(){},
    ensureCurrentQuoteNumber:async()=>{},saveQuoteCurrent:()=>{log.started.push({...ctx.quote});},markQuoteSaved(){},
    showStudioWorkflow(){},renderWorkshopQuote(){},collapseWorkshopSections(){},goScreen(){},focusWorkshopSection(){},nextWorkshopSectionId:()=>'',
    flashWorkshopStatus(){},normalizeNameKey:(v)=>String(v||'').trim().toLowerCase(),specificationValue:(v)=>String(v??'').trim(),
    allSavedEntries:()=>savedJobs.map((record)=>({record})),
    customerFinderMatchesKey:(key,name)=>String(name||'').trim().toLowerCase()===key,
    customerFinderDraftFromForm:()=>({customerName:'Synthetic New Customer',phone:'000'}),
    setCustomerFinderNameValidation(){},$:()=>null,
    saveCustomerRecordFromDraft:(draft)=>({...draft}),
    setCustomerFinderCreateButtonState(){},renderCustomerFinder(){},renderBuilds(){},
    customerFinderSelectedKey:'',
  };
  vm.createContext(ctx);
  vm.runInContext(FUNCTIONS.map(fn).join('\n'),ctx);
  const settle=async()=>{for(let i=0;i<5;i++){await new Promise((r)=>setImmediate(r));while(log.timers.length)log.timers.shift()();}};
  return {ctx,log,settle};
}
const lastStarted=(log)=>log.started[log.started.length-1];

test('Repair / Refurb opens the existing new-job customer finder (no extra menu)',async()=>{
  const {ctx,log}=sandbox();
  ctx.startNewRepairFlow();
  assert.deepEqual(log.finderOpens,['new-build']);
});

test('Repair / Refurb + existing customer: the new job is a repair, with that customer\'s details',async()=>{
  const {ctx,log,settle}=sandbox({savedJobs:[{customerName:'Synthetic Customer',phone:'021 000',jobType:'build',savedAt:'2026-11-01T00:00:00Z'}]});
  ctx.startNewRepairFlow();
  ctx.handleCustomerSelectionForNewBuild('synthetic customer','Synthetic Customer');
  await settle();
  const job=lastStarted(log);
  assert.equal(job.jobType,'repair');
  assert.equal(job.customerName,'Synthetic Customer');
  assert.equal(job.phone,'021 000');
});

test('Repair / Refurb + new customer: the new job is a repair',async()=>{
  const {ctx,log,settle}=sandbox();
  ctx.startNewRepairFlow();
  assert.equal(ctx.commitCreateCustomerFromNewBuildForm(),true);
  await settle();
  assert.equal(lastStarted(log).jobType,'repair');
  assert.equal(lastStarted(log).customerName,'Synthetic New Customer');
});

test('New Rod Build is unchanged: existing and new customers start a build',async()=>{
  for(const path of ['existing','new']){
    const {ctx,log,settle}=sandbox({savedJobs:[{customerName:'Synthetic Customer',jobType:'repair',savedAt:'2026-11-01T00:00:00Z'}]});
    ctx.startNewBuildFlow();
    if(path==='existing')ctx.handleCustomerSelectionForNewBuild('synthetic customer','Synthetic Customer');
    else ctx.commitCreateCustomerFromNewBuildForm();
    await settle();
    assert.equal(lastStarted(log).jobType,'build',`${path} customer: a build, even if the customer's last job was a repair`);
  }
});

test('a cancelled Repair / Refurb start never carries over to the next New Rod Build',async()=>{
  const {ctx,log,settle}=sandbox();
  ctx.startNewRepairFlow();                 // finder opened, then closed without choosing a customer
  ctx.startNewBuildFlow();
  ctx.handleCustomerSelectionForNewBuild('nobody','Synthetic Walk-in');
  await settle();
  assert.equal(lastStarted(log).jobType,'build');
});

test('the unsaved-work warning still protects the current job before Repair / Refurb starts',async()=>{
  const kept=sandbox({unsavedDraft:true,confirm:'cancel'});
  kept.ctx.startNewRepairFlow();
  assert.equal(kept.log.confirms.length,1);
  assert.deepEqual(kept.log.finderOpens,[],'cancel keeps the current job and opens nothing');
  const discarded=sandbox({unsavedDraft:true,confirm:'start'});
  discarded.ctx.startNewRepairFlow();
  assert.deepEqual(discarded.log.finderOpens,['new-build']);
});

test('a click event passed by an existing caller still starts a build',async()=>{
  const {ctx,log,settle}=sandbox();
  ctx.startNewQuoteFlow({type:'click'});
  ctx.handleCustomerSelectionForNewBuild('nobody','Synthetic Walk-in');
  await settle();
  assert.equal(lastStarted(log).jobType,'build');
});

test('Components + existing customer: a Components job (jobType build, jobKind components) with pricing pending',async()=>{
  const {ctx,log,settle}=sandbox({savedJobs:[{customerName:'Synthetic Customer',phone:'021 000',jobType:'repair',savedAt:'2026-11-01T00:00:00Z'}]});
  ctx.startNewComponentsFlow();
  assert.deepEqual(log.finderOpens,['new-build'],'the same customer finder, no extra menu');
  ctx.handleCustomerSelectionForNewBuild('synthetic customer','Synthetic Customer');
  await settle();
  const job=lastStarted(log);
  assert.equal(job.jobType,'build');
  assert.equal(job.jobKind,'components');
  assert.equal(job.pricePending,true);
  assert.equal(job.phone,'021 000');
});

test('Components + new customer: a Components job with pricing pending',async()=>{
  const {ctx,log,settle}=sandbox();
  ctx.startNewComponentsFlow();
  ctx.commitCreateCustomerFromNewBuildForm();
  await settle();
  const job=lastStarted(log);
  assert.equal(job.jobKind,'components');
  assert.equal(job.pricePending,true);
});

test('New Rod Build and Repair / Refurb never start pending or as Components, even after a cancelled Components start',async()=>{
  for(const start of ['startNewBuildFlow','startNewRepairFlow']){
    const {ctx,log,settle}=sandbox();
    ctx.startNewComponentsFlow();               // cancelled
    ctx[start]();
    ctx.handleCustomerSelectionForNewBuild('nobody','Synthetic Walk-in');
    await settle();
    const job=lastStarted(log);
    assert.equal('jobKind' in job,false,start);
    assert.equal('pricePending' in job,false,start);
  }
});

test('Home is NOT activated yet: signed-in Home still shows only the current START NEW BUILD button',()=>{
  assert.match(html,/<button id="homeEnterRodBtn" class="home-enter-rod-button primary-action" type="button">START NEW BUILD<\/button>/);
  assert.doesNotMatch(html,/REPAIR \/ REFURB/);
  const home=html.slice(html.indexOf('id="homeScreen"'),html.indexOf('id="workshopLandingScreen"'));
  assert.doesNotMatch(home,/COMPONENTS|REPAIR/,'no new Home buttons yet');
  assert.doesNotMatch(source,/startNewRepairFlow\(\);/,'nothing in the app calls the Repair route yet');
  assert.doesNotMatch(source,/startNewComponentsFlow\(\);/,'nothing in the app calls the Components route yet');
});
