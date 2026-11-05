const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
const specFields=source.match(/const BUILD_SPEC_FIELDS=\[[\s\S]*?\n\];/)[0];
const detailsMarkup=html.slice(html.indexOf('<div id="workshopBuildSpecsBody"'),html.indexOf('<article id="workshopComponentsSection"'));
const PRIVATE='PRIVATE-workshop-only-remark';

/* ---------- the form ---------- */

test('markup: the job type selector is inside Build Details, after Customer Details; every existing field keeps its order',()=>{
  assert.ok(html.indexOf('id="workshopSpecsSection"')<html.indexOf('id="quoteJobTypeGroup"'));
  assert.ok(html.indexOf('id="workshopCustomerSection"')<html.indexOf('id="quoteJobTypeGroup"'));
  const order=['quoteEstimatedCompletionDate','quoteNotes','quoteSpecFinishedRodLength','quoteSpecReelSeatPosition','quoteSpecReelSeatRef','quoteSpecRearGripLength','quoteSpecGripBelowReelSeatLength','quoteSpecForeGripLength','quoteSpecBuilderNotes','editGuideLayoutBtn','guideSpecCount','rodBuildLayout'];
  let at=-1;
  order.forEach((id)=>{
    const next=detailsMarkup.indexOf(`id="${id}"`);
    assert.ok(next>at,`${id} keeps its place (New Build order unchanged)`);
    at=next;
  });
  for(const id of order)assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,`${id} is not duplicated`);
  assert.match(detailsMarkup,/id="workshopBuildSpecsBody" class="quote-grid quote-grid--two quote-section__body build-details" data-job-type="build"/);
});

test('markup: repair-only controls are hidden by default and the rod specifications are optional, collapsed and named',()=>{
  assert.match(detailsMarkup,/<label id="quoteRodIdentificationField"[^>]*class="[^"]*build-details__repair-only[^"]*"[^>]*hidden>/);
  assert.match(detailsMarkup,/<span>Rod Identification &middot; Optional<\/span><input id="quoteSpecRodIdentification" type="text"/);
  assert.match(detailsMarkup,/<button id="buildRodSpecsToggle"[^>]*type="button"[^>]*aria-expanded="false"[^>]*hidden>/);
  assert.match(detailsMarkup,/<span>Rod Specifications<\/span><small id="buildRodSpecsSummary">Optional<\/small>/);
  // the rod, reel seat, grip, guide and layout controls sit in two wrappers; the private notes sit between them, outside both
  const partA=detailsMarkup.slice(detailsMarkup.indexOf('<div id="buildRodSpecsPartA"'),detailsMarkup.indexOf('id="quoteWorkshopNotesField"'));
  const partB=detailsMarkup.slice(detailsMarkup.indexOf('<div id="buildRodSpecsPartB"'));
  for(const id of ['quoteSpecFinishedRodLength','quoteSpecReelSeatPosition','quoteSpecRearGripLength','quoteSpecGripBelowReelSeatLength','quoteSpecForeGripLength'])assert.ok(partA.includes(`id="${id}"`),`${id} in Rod Specifications`);
  for(const id of ['editGuideLayoutBtn','guideSpecCount','rodBuildLayout'])assert.ok(partB.includes(`id="${id}"`),`${id} in Rod Specifications`);
  assert.ok(!partA.includes('quoteSpecBuilderNotes') && !partB.includes('quoteSpecBuilderNotes'),'private workshop notes stay visible in the repair form');
  assert.ok(!partA.includes('quoteEstimatedCompletionDate') && !partA.includes('id="quoteNotes"') && !partB.includes('id="quoteNotes"'));
});

test('CSS: a New Build is untouched (transparent wrappers); every hiding and reordering rule is scoped to repair',()=>{
  assert.match(css,/#workshopScreen \.build-details__rod-specs\{display:contents\}/);
  const start=css.indexOf('/* Build Details, Repair / Refurbishment:');
  const block=css.slice(start,css.indexOf('/* Guide Train Designer (Workshop)',start));
  const rules=[...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m)=>({selector:m[1].trim(),body:m[2]}));
  for(const rule of rules){
    if(/display:none|(?:^|[;{\s])order:\d|display:grid/.test(rule.body) && !/\[hidden\]|rod-specs-(toggle|copy)/.test(rule.selector)){ // the toggle and its inner layout only exist while the button is shown (repair)
      assert.ok(/data-job-type="repair"/.test(rule.selector),`scoped to repair: ${rule.selector}`);
    }
  }
  assert.match(block,/\.build-details\[data-job-type="repair"\] > \.build-details__rod-specs\{display:none\}/);
  assert.match(block,/\[data-job-type="repair"\]\[data-rod-specs-open="true"\] > \.build-details__rod-specs\{\s*display:grid;grid-column:1 \/ -1/);
  assert.match(block,/\.build-details__rod-specs-toggle\{[^}]*min-height:44px/);
  assert.match(block,/#quoteWorkshopNotesField\{order:2\}/);
  assert.match(block,/#buildRodSpecsToggle\{order:3\}/);
  assert.match(block,/#buildRodSpecsPartA\{order:4\}/);
  assert.match(block,/#buildRodSpecsPartB\{order:5\}/);
  assert.match(block,/\.build-details__rod-specs > \.build-details__group:first-child\{margin-top:6px;padding-top:8px;border-top:1px solid/,'the group dividers survive the wrappers');
  assert.doesNotMatch(block,/#[a-zA-Z]*(Pricing|Components|Customer)/,'no pricing, components or customer rule touched');
});

function formHarness({jobType='build',specs={},notes='',due=''}={}){
  const els={};
  const make=(id)=>(els[id]={id,hidden:false,textContent:'',value:'',attrs:{},isConnected:true,getBoundingClientRect:()=>({top:100,bottom:140,height:40}),
    setAttribute(n,v){this.attrs[n]=String(v);},getAttribute(n){return this.attrs[n]===undefined?null:this.attrs[n];}});
  ['workshopBuildSpecsBody','buildDetailsGroupTitle','quoteNotesLabel','quoteNotes','quoteRodIdentificationField','buildRodSpecsToggle','buildRodSpecsSummary','workshopBuildSpecsSummaryText'].forEach(make);
  const buttons=['build','repair'].map((type)=>({type,attrs:{},getAttribute:(n)=>n==='data-job-type'?type:null,setAttribute(n,v){this.attrs[n]=v;}}));
  const c=vm.createContext({
    $:(id)=>els[id]||null,
    document:{querySelectorAll:()=>buttons,activeElement:null},
    window:{scrollY:0,scrollTo(){}},
    quote:{jobType,notes,estimatedCompletionDate:due,buildSpecifications:{reelSeatPosition:'',rearGripLength:'',gripBelowReelSeatLength:'',foreGripLength:'',builderNotes:PRIVATE,rodIdentification:'',...specs}},
    specificationValue:(v)=>String(v==null?'':v).trim(),
    numberOrZero:(v)=>Number(v)||0,
    formatDateDisplay:(v)=>`D(${v})`,
    markQuoteDirty(){c.dirty=true;},
    saveQuoteCurrent(){},
    updateWorkshopBuildOverview(){},
    // the guide-based summary used by a New Build
    firstSavedComponentByCategory:()=>null,firstComponentByCategory:()=>null,buildGuideView:()=>null,guideOrientationMethodLabel:()=>'',
  });
  vm.runInContext(['normalizeJobType','scrollWorkshopWindowTo','holdWorkshopScrollAnchor','workshopVisibleAnchor','runWithWorkshopScrollAnchor','rodSpecsEnteredCount','syncRodSpecsToggleSummary','buildSpecSummaryData','updateBuildSpecSummary','syncJobTypeSelector','setQuoteJobType','toggleRodSpecsSection'].map(fn).join('\n')+'\nlet workshopRodSpecsOpen=false;',c);
  return {c,els,buttons};
}

test('Repair / Refurbishment shows the short form: heading, description wording, rod identification, collapsed Rod Specifications',()=>{
  const {c,els,buttons}=formHarness({jobType:'build'});
  c.syncJobTypeSelector();
  assert.equal(els.workshopBuildSpecsBody.attrs['data-job-type'],'build');
  assert.equal(els.buildDetailsGroupTitle.textContent,'Build');
  assert.equal(els.quoteNotesLabel.textContent,'Build Note \u00B7 Shown on Quote');
  assert.equal(els.quoteNotes.attrs.placeholder,'Thread, trim or finish requests');
  assert.equal(els.quoteRodIdentificationField.hidden,true);
  assert.equal(els.buildRodSpecsToggle.hidden,true);
  c.quote.jobType='repair';
  c.syncJobTypeSelector();
  assert.equal(els.workshopBuildSpecsBody.attrs['data-job-type'],'repair');
  assert.equal(els.workshopBuildSpecsBody.attrs['data-rod-specs-open'],'false','Rod Specifications start collapsed');
  assert.equal(els.buildDetailsGroupTitle.textContent,'Repair');
  assert.equal(els.quoteNotesLabel.textContent,'Repair Description \u00B7 Shown on Quote');
  assert.equal(els.quoteNotes.attrs.placeholder,'What needs repairing or refurbishing');
  assert.equal(els.quoteRodIdentificationField.hidden,false);
  assert.equal(els.buildRodSpecsToggle.hidden,false);
  assert.equal(els.buildRodSpecsToggle.attrs['aria-expanded'],'false');
  assert.deepEqual(buttons.map((b)=>b.attrs['aria-pressed']),['false','true']);
});

test('the Rod Specifications section opens and closes without touching any value; it says how much is entered',()=>{
  const {c,els}=formHarness({jobType:'repair',specs:{rearGripLength:'280 mm',reelSeatPosition:'350 mm'}});
  c.quote.buildSpecifications.layout={rodLengthMm:2130};
  c.syncJobTypeSelector();
  assert.equal(els.buildRodSpecsSummary.textContent,'3 entered');
  const before=JSON.stringify(c.quote);
  c.toggleRodSpecsSection();
  assert.equal(els.workshopBuildSpecsBody.attrs['data-rod-specs-open'],'true');
  assert.equal(els.buildRodSpecsToggle.attrs['aria-expanded'],'true');
  c.toggleRodSpecsSection();
  assert.equal(els.workshopBuildSpecsBody.attrs['data-rod-specs-open'],'false');
  assert.equal(JSON.stringify(c.quote),before,'toggling a section changes no data');
  const empty=formHarness({jobType:'repair'});
  empty.c.syncJobTypeSelector();
  assert.equal(empty.els.buildRodSpecsSummary.textContent,'Optional');
  // a New Build never reports the section as open
  const build=formHarness({jobType:'build'});
  build.c.toggleRodSpecsSection();
  assert.equal(build.els.workshopBuildSpecsBody.attrs['data-rod-specs-open'],'false');
});

test('switching job type never deletes or resets specifications, components, notes or pricing, in either direction',()=>{
  const {c}=formHarness({jobType:'build',notes:'Red thread',due:'2026-12-01',specs:{rearGripLength:'280 mm',reelSeatPosition:'350 mm',rodIdentification:'Sage 9ft'}});
  Object.assign(c.quote,{
    components:[{category:'Guide',quantity:2,cost:9,description:'Fuji ring'}],labourRate:85,labourHours:3.5,finalCustomerPrice:640,
    depositEnabled:true,depositType:'percent',depositValue:30,payments:[{amount:100}],buildName:'Rod',customerName:'Bren Pine',
  });
  c.quote.buildSpecifications.layout={rodLengthMm:2130,reelSeatPositionRef:'rear'};
  const snapshot=(q)=>JSON.stringify({...q,jobType:undefined});
  const before=snapshot(c.quote);
  c.setQuoteJobType('repair');
  assert.equal(c.quote.jobType,'repair');
  assert.equal(snapshot(c.quote),before,'build to repair');
  c.setQuoteJobType('build');
  assert.equal(c.quote.jobType,'build');
  assert.equal(snapshot(c.quote),before,'repair back to build');
  c.setQuoteJobType('repair');c.toggleRodSpecsSection();c.setQuoteJobType('build');c.setQuoteJobType('repair');
  assert.equal(snapshot(c.quote),before,'after any number of switches');
  assert.equal(c.dirty,true);
  // the code that runs on a switch only ever writes quote.jobType
  const body=fn('setQuoteJobType')+fn('syncJobTypeSelector');
  assert.deepEqual([...new Set([...body.matchAll(/quote\.([A-Za-z]+)\s*=[^=]/g)].map((m)=>m[1]))],['jobType']);
  assert.doesNotMatch(body,/\.value\s*=|innerHTML|delete |splice|components\s*=|buildSpecifications\s*=/);
});

test('repair summary line shows the job, due date and rod; a New Build summary is exactly what it was',()=>{
  const repair=formHarness({jobType:'repair',due:'2026-12-01',specs:{rodIdentification:'Sage 9ft'}});
  assert.equal(repair.c.buildSpecSummaryData(),'Repair / Refurbishment \u00B7 Due D(2026-12-01) \u00B7 Sage 9ft');
  assert.equal(formHarness({jobType:'repair'}).c.buildSpecSummaryData(),'Repair / Refurbishment');
  assert.equal(formHarness({jobType:'build'}).c.buildSpecSummaryData(),'Add build details');
  assert.equal(formHarness({jobType:undefined}).c.buildSpecSummaryData(),'Add build details','saved builds without a job type are New Builds');
});

/* ---------- existing records ---------- */

test('existing saved builds load unchanged: legacy quotes are New Builds and the new field defaults to empty',()=>{
  const ctx=vm.createContext({specificationValue:(v)=>String(v==null?'':v).trim(),normalizeBuildLayout:(l)=>l&&Object.keys(l).length?l:null});
  vm.runInContext(`${specFields}\n${fn('normalizeBuildSpecifications')}${fn('normalizeJobType')}`,ctx);
  const legacy={reelSeatPosition:'350 mm',rearGripLength:'280 mm',builderNotes:'old private note',layout:{rodLengthMm:2000}};
  const normalized=ctx.normalizeBuildSpecifications(legacy);
  assert.equal(normalized.reelSeatPosition,'350 mm');
  assert.equal(normalized.rearGripLength,'280 mm');
  assert.equal(normalized.builderNotes,'old private note');
  assert.equal(normalized.rodIdentification,'');
  assert.equal(JSON.stringify(normalized.layout),JSON.stringify({rodLengthMm:2000}));
  const round=ctx.normalizeBuildSpecifications({...normalized,rodIdentification:'Sage 9ft'});
  assert.equal(round.rodIdentification,'Sage 9ft','the new field survives a save and reload');
  assert.equal(ctx.normalizeJobType(undefined),'build');
  assert.match(specFields,/key:'rodIdentification',label:'Rod Identification',visibility:'customer'/);
  const wiring=source.slice(source.indexOf('BUILD_SPEC_FIELDS.forEach((field)=>{'));
  assert.match(wiring,/quote\.buildSpecifications\[field\.key\]=el\.value;/,'every spec field, including the new one, is saved by the existing handler');
});

/* ---------- customer documents ---------- */

function documentHarness(jobType,{notes='Replace the tip-top and re-wrap the guides.',specs={}}={}){
  const q={customerName:'Bren Pine',quoteNumber:'Q-1001',buildName:'Rod',jobType,estimatedCompletionDate:'2026-12-01',components:[],payments:[],notes,
    buildSpecifications:{builderNotes:PRIVATE,rodIdentification:'',...specs}};
  const rows=[];
  const c={
    quote:q,businessProfile:{businessName:'K-Labs'},studioSettings:{},
    currentBuildLifecycleStatus:()=>'quote',
    depositMaths:()=>({total:300,depositEnabled:false,depositAmount:0,remainingBalance:300,amountReceived:0,balanceOwing:300,depositOutstanding:false,depositStillRequired:0}),
    customerIncludedParts:()=>['Re-wrap of 6 guides'],
    customerGripFeatureSummary:()=>'',
    customerQuoteDeliveryMarkup:()=>'',customerQuoteBusinessLines:()=>[],customerFulfilmentSection:()=>null,
    activeEmailIncludeSignature:()=>false,customerEmailSignatureLines:()=>[],
    specificationRowsMarkup:(r)=>r.map((x)=>`<i>${x.label}: ${x.value}</i>`).join(''),
    formatDateDisplay:()=>'1 Dec 2026',formatCustomerEmailLongDate:()=>'1 December 2026',
    currencyWithCode:(v)=>`$${Number(v).toFixed(2)}`,
    escapeHtml:(v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
  };
  vm.createContext(c);
  vm.runInContext(`${specFields}\n`+['specificationValue','normalizeCustomerMeasurements','isLikelyJunkCustomerText','customerSafeText','customerRequestText','appendCustomerSpecRow','buildSpecMeasurementMm',
    'normalizeJobType','normalizeFulfilmentMethod','customerDocumentLabels','customerQuoteConfirmationText','customerDocumentConfirmationText','customerIncludedPartsMarkup',
    'customerBuildNotesText','customerBuildNotesMarkup','customerSpecificationRows','businessProfileHasPaymentDetails','customerQuoteSummaryMarkup','customerEmailLines'].map((name)=>{
    try{return fn(name);}catch(error){return '';}
  }).join('\n'),c);
  c.rows=rows;
  return c;
}

test('a repair quote shows the repair description under its own heading; a new build keeps "Build Notes"',()=>{
  const repair=documentHarness('repair');
  const html=repair.customerQuoteSummaryMarkup();
  assert.ok(html.includes('<span>Repair Description</span><p>Replace the tip-top and re-wrap the guides.</p>'));
  assert.ok(!html.includes('Build Notes'));
  assert.ok(html.includes('Work Included'),'repair wording is unchanged elsewhere');
  const build=documentHarness('build').customerQuoteSummaryMarkup();
  assert.ok(build.includes('<span>Build Notes</span>'));
  assert.ok(!build.includes('Repair Description'));
  assert.ok(documentHarness('repair',{notes:'  '}).customerQuoteSummaryMarkup().indexOf('Repair Description')<0,'no description, no section');
});

test('the repair email lists the description under "Repair Description"; builds still say "Build Notes"',()=>{
  const repair=documentHarness('repair').customerEmailLines().join('\n');
  assert.ok(repair.includes('\nRepair Description\nReplace the tip-top and re-wrap the guides.'));
  assert.ok(!repair.includes('Build Notes'));
  const build=documentHarness('build').customerEmailLines().join('\n');
  assert.ok(build.includes('\nBuild Notes\n'));
  assert.ok(!build.includes('Repair Description'));
});

test('private workshop notes are never on a customer quote or email, for either job type',()=>{
  for(const type of ['repair','build']){
    const c=documentHarness(type,{specs:{rodIdentification:'Sage 9ft'}});
    assert.ok(!c.customerQuoteSummaryMarkup().includes(PRIVATE),`${type} quote`);
    assert.ok(!c.customerEmailLines().join('\n').includes(PRIVATE),`${type} email`);
    assert.ok(!c.customerSpecificationRows().some((row)=>String(row.value).includes(PRIVATE)),`${type} spec rows`);
  }
  assert.match(source,/never read here/);
});

test('rod identification appears on a repair quote only; a new build never shows leftover repair text',()=>{
  const repair=documentHarness('repair',{specs:{rodIdentification:'Sage X 9ft 5wt'}});
  assert.deepEqual(JSON.parse(JSON.stringify(repair.customerSpecificationRows())),[{label:'Rod Identification',value:'Sage X 9ft 5wt'}]);
  assert.ok(repair.customerQuoteSummaryMarkup().includes('Rod Identification: Sage X 9ft 5wt'));
  const build=documentHarness('build',{specs:{rodIdentification:'Sage X 9ft 5wt'}});
  assert.deepEqual(JSON.parse(JSON.stringify(build.customerSpecificationRows())),[]);
  assert.ok(!build.customerQuoteSummaryMarkup().includes('Sage X'));
  assert.deepEqual(JSON.parse(JSON.stringify(documentHarness('repair').customerSpecificationRows())),[],'optional: nothing shown when empty');
});

/* ---------- scrolling ---------- */

function scrollHarness({scrollY=400,tops}){
  const calls=[];
  const makeNode=(id,getTop,height=40)=>({id,hidden:false,isConnected:true,getBoundingClientRect:()=>({top:getTop(),bottom:getTop()+height,height})});
  const state={scrollY,calls};
  const win={get scrollY(){return state.scrollY;},scrollTo(options){calls.push(options);state.scrollY=options.top;}};
  const c=vm.createContext({window:win,document:{querySelectorAll:()=>state.nodes||[]}});
  vm.runInContext(['scrollWorkshopWindowTo','holdWorkshopScrollAnchor','workshopVisibleAnchor','runWithWorkshopScrollAnchor'].map(fn).join('\n'),c);
  return {c,state,calls,makeNode};
}

test('scroll anchoring: content that grows above the reader is cancelled out by scrolling the same distance, instantly',()=>{
  const h=scrollHarness({scrollY:400});
  let shift=0;
  const anchor=h.makeNode('jobType',()=>300+shift);
  h.state.nodes=[anchor];
  h.c.runWithWorkshopScrollAnchor(()=>{shift=52;});
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].top,452);
  assert.equal(h.calls[0].behavior,'auto','never smooth');
  assert.equal(h.state.scrollY,452);
  // shrinking content above scrolls back the other way
  shift=0;h.calls.length=0;h.state.scrollY=400;
  h.c.runWithWorkshopScrollAnchor(()=>{shift=-120;});
  assert.equal(h.calls[0].top,280);
  // no movement, no scroll
  h.calls.length=0;shift=0;
  h.c.runWithWorkshopScrollAnchor(()=>{});
  assert.equal(h.calls.length,0);
  // sub-pixel movement is ignored
  h.c.runWithWorkshopScrollAnchor(()=>{shift=0.3;});
  assert.equal(h.calls.length,0);
  // never scrolls above the top of the page
  shift=0;h.state.scrollY=50;
  h.c.runWithWorkshopScrollAnchor(()=>{shift=-200;});
  assert.equal(h.calls[h.calls.length-1].top,0);
});

test('scroll anchoring: a chosen element (the tapped header or the Job Type buttons) is the fixed point, and at the top of the page nothing moves',()=>{
  const h=scrollHarness({scrollY:400});
  let a=500,b=200;
  const tapped=h.makeNode('tapped',()=>a);
  const other=h.makeNode('other',()=>b);
  h.state.nodes=[other];
  h.c.runWithWorkshopScrollAnchor(()=>{a=560;b=260;},tapped);
  assert.equal(h.calls[0].top,460,'held the tapped element, not the first one on screen');
  h.calls.length=0;
  h.state.scrollY=0;
  h.state.nodes=[other];
  h.c.runWithWorkshopScrollAnchor(()=>{b=300;});
  assert.equal(h.calls.length,0,'at the top there is nothing to hold');
  assert.doesNotThrow(()=>h.c.runWithWorkshopScrollAnchor(()=>{},null));
  assert.doesNotThrow(()=>h.c.holdWorkshopScrollAnchor({isConnected:false},10));
});

test('opening or closing a section no longer scrolls on a timer or smoothly; the Build Details toggle and Job Type switch hold their position',()=>{
  const bind=fn('bindWorkshopCollapsibleSections');
  assert.doesNotMatch(bind,/scrollWorkshopSectionIntoView|smooth|setTimeout/);
  assert.match(bind,/runWithWorkshopScrollAnchor\(\(\)=>\{[\s\S]*?\},trigger\)/);
  assert.match(bind,/expandWorkshopCollapsibleSection\(bodyId,\{instant:true\}\)/);
  assert.match(fn('setQuoteJobType'),/runWithWorkshopScrollAnchor\(\(\)=>\{[\s\S]*?\},\$\('quoteJobTypeGroup'\)\)/);
  assert.match(fn('toggleRodSpecsSection'),/runWithWorkshopScrollAnchor\(syncJobTypeSelector,\$\('buildRodSpecsToggle'\)\)/);
  assert.match(fn('updateWorkshopBuildOverview'),/runWithWorkshopScrollAnchor\(applyWorkshopBuildOverview\)/);
  const focus=fn('focusWorkshopSection');
  assert.doesNotMatch(focus,/setTimeout/);
  assert.match(focus,/\{instant:true\}/);
  const settle=fn('setWorkshopSectionCollapsed');
  assert.match(settle,/body\.style\.transition='none'/);
  assert.match(settle,/instant/);
  assert.match(fn('workshopVisibleAnchor'),/#quoteJobTypeGroup, #workshopScreen \.quote-section/);
  assert.doesNotMatch(fn('workshopVisibleAnchor').replace(/\/\/.*$/gm,''),/quote-builder__head/,'the header, which changes height, is never the fixed point');
});

test('only Build Details, its job type wiring and the shared scroll helpers changed in ui.js; pricing and deposits are untouched',()=>{
  for(const name of ['depositMaths','updateBuildPricingSummary','persistBuildRecord','newQuoteTemplate']){
    assert.doesNotMatch(fn(name),/runWithWorkshopScrollAnchor|rodIdentification|jobType\s*=/,name);
  }
  assert.doesNotMatch(source.slice(source.indexOf('function depositMaths('),source.indexOf('function depositMaths(')+3000),/RodIdentification/);
});

/* ---------- Job Type visibility (Mac Safari regression) ---------- */

test('REGRESSION: the Job Type selector is the first thing inside the Build Details body, so it opens with the section instead of sitting above its header',()=>{
  // The failure: the selector was a separate block ABOVE the Build Details header. Opening Build Details keeps the tapped
  // header in place on screen, so with the header near the top the selector was already scrolled out of sight above it.
  const article=html.slice(html.indexOf('<article id="workshopSpecsSection"'),html.indexOf('<article id="workshopComponentsSection"'));
  const header=article.indexOf('data-collapsible-trigger');
  const body=article.indexOf('id="workshopBuildSpecsBody"');
  const selector=article.indexOf('id="quoteJobTypeGroup"');
  const firstField=article.indexOf('id="quoteEstimatedCompletionDate"');
  assert.ok(header>=0 && body>header && selector>body && firstField>selector,'header, then body, then Job Type, then the fields');
  assert.equal((html.match(/id="quoteJobTypeGroup"/g)||[]).length,1,'one selector, nothing left outside the section');
  assert.equal(html.slice(0,html.indexOf('<article id="workshopSpecsSection"')).includes('quoteJobTypeGroup'),false,'nothing above Build Details');
  // directly inside the grid body, as its first element
  const afterBody=article.slice(article.indexOf('>',body)+1).trimStart();
  assert.ok(afterBody.startsWith('<div id="quoteJobTypeGroup"'),'first element of the body');
  assert.match(article,/data-job-type="build" aria-pressed="true">New Build<[\s\S]*data-job-type="repair" aria-pressed="false">Repair \/ Refurbishment</);
  assert.match(article,/<div id="quoteJobTypeGroup" class="quote-job-type quote-grid__full" role="group" aria-label="Job Type">/);
});

test('REGRESSION: the selector sits first in both layouts and never moves when the job type changes',()=>{
  const start=css.indexOf('/* Build Details, Repair / Refurbishment:');
  const block=css.slice(start,css.indexOf('/* Guide Train Designer (Workshop)',start));
  assert.match(block,/\[data-job-type="repair"\] > #quoteJobTypeGroup,\s*#workshopScreen \.build-details\[data-job-type="repair"\] > #buildDetailsGroupRow\{order:0\}/,'Job Type and its heading keep the top in the repair layout');
  assert.match(block,/\[data-job-type="repair"\] > \*\{order:1\}/);
  // nothing hides, collapses or reorders the selector itself
  assert.doesNotMatch(block,/#quoteJobTypeGroup\s*\{[^}]*(display:none|order:[1-9])/);
  assert.match(css,/#workshopScreen \.quote-job-type__option\{min-height:44px/,'touch targets stay 44px');
  // switching only ever rewrites data-job-type on the body; the selector is not rebuilt or relocated
  const sync=fn('syncJobTypeSelector');
  assert.doesNotMatch(sync,/quoteJobTypeGroup[^;]*(remove|append|insert|hidden)/);
  assert.match(fn('setQuoteJobType'),/\},\$\('quoteJobTypeGroup'\)\)/,'the buttons stay at the same place on screen while the form below changes');
});

test('REGRESSION: opening Build Details with its header held at the top of the screen leaves the Job Type buttons on screen',()=>{
  // Geometry of the failing interaction, using the real click handler. The header is held where it was tapped (59px from the
  // top, as in the Safari report); the selector is below the header, so it can only be visible.
  const classes=new Set(['quote-section--collapsed']);
  const attrs={'aria-controls':'workshopBuildSpecsBody','aria-expanded':'false'};
  const listeners={};
  let docTop=59;           // distance of the header from the top of the screen
  let scrollY=300;
  const sectionBody={style:{},offsetHeight:900,closest:()=>section};
  const trigger={getAttribute:(n)=>attrs[n],setAttribute(n,v){attrs[n]=v;},addEventListener(n,f){listeners[n]=f;},closest:()=>section,
    getBoundingClientRect:()=>({top:docTop-(scrollY-300)})};
  const section={classList:{contains:(n)=>classes.has(n),toggle(n,on){if(on)classes.add(n);else classes.delete(n);}},querySelector:()=>trigger};
  const selectorOffsetBelowHeader=44;          // header height: the selector is the first row of the opened body
  const selector={getBoundingClientRect:()=>({top:docTop-(scrollY-300)+selectorOffsetBelowHeader})};
  const calls=[];
  const c=vm.createContext({
    $:(id)=>id==='workshopBuildSpecsBody'?sectionBody:null,
    document:{querySelectorAll:()=>[trigger],activeElement:null},
    window:{setTimeout:()=>1,clearTimeout(){},get scrollY(){return scrollY;},scrollTo(o){calls.push(o);scrollY=o.top;}},
    workshopSectionExpandTimers:new Map(),workshopTopUiOffset:()=>0,
  });
  vm.runInContext(source.match(/const WORKSHOP_COLLAPSIBLE_SECTION_IDS=\[[^\n]+;/)[0],c);
  vm.runInContext(['scrollWorkshopWindowTo','holdWorkshopScrollAnchor','workshopVisibleAnchor','runWithWorkshopScrollAnchor','setWorkshopSectionCollapsed','animateWorkshopSectionBody','expandWorkshopCollapsibleSection','bindWorkshopCollapsibleSections'].map(fn).join('\n'),c);
  c.bindWorkshopCollapsibleSections();
  listeners.click();
  assert.equal(attrs['aria-expanded'],'true');
  assert.ok(trigger.getBoundingClientRect().top>=0,'the header is on screen');
  assert.ok(selector.getBoundingClientRect().top>=trigger.getBoundingClientRect().top,'the Job Type buttons are below the header, never above it');
  assert.ok(selector.getBoundingClientRect().top>=0,'and on screen');
  assert.equal(calls.filter((o)=>o.behavior!=='auto').length,0,'no smooth scrolling');
});
