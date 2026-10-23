const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

const money=(v)=>`$${Number(v).toFixed(2)}`;
const profile={businessName:'K-Labs',contactName:'Kevin',phone:'027 000 0000',email:'k@example.test',website:'www.example.test',paymentAccountName:'K-Labs Ltd',paymentAccountNumber:'12-3456-7890123-00'};

function ctx(status,jobType){
  const quote={customerName:'Bren Pine',quoteNumber:'Q-1001',jobType,estimatedCompletionDate:'2026-12-01',payments:[],components:[{category:'Guide',quantity:2,cost:9}]};
  const c={
    quote,businessProfile:profile,
    currentBuildLifecycleStatus:()=>status,
    depositMaths:()=>({total:500,depositEnabled:true,depositAmount:100,remainingBalance:400,amountReceived:0,balanceOwing:500,depositOutstanding:true,depositStillRequired:100}),
    customerIncludedParts:()=>['2 × Guide wrap'],
    customerQuoteConfirmationText:()=>'quote text',
    specificationValue:(v)=>String(v==null?'':v).trim(),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
    currencyWithCode:money,
    deliveryAmounts:()=>({charge:0}),
    customerAddressLines:()=>[],
    businessProfileHasPaymentDetails:()=>true,
    formatCustomerEmailLongDate:()=>'1 December 2026',
    escapeHtml:(v)=>String(v),
    customerSafeText:(v)=>String(v==null?'':v),
    markQuoteDirty:()=>{c.dirty=true;},
    updateWorkshopBuildOverview:()=>{},
    saveQuoteCurrent:()=>{},
    document:{querySelectorAll:()=>[]},
  };
  vm.createContext(c);
  vm.runInContext(['normalizeJobType','normalizeFulfilmentMethod','customerDeliveryAddressLines','customerFulfilmentSection','customerFulfilmentCheck','deliveryAddressIncomplete','runWithFulfilmentCheck','jobTypeLabel','customerDocumentLabels','customerDocumentConfirmationText','customerEmailSignatureLines','customerEmailLines','emailCurrentQuote','customerIncludedPartsMarkup','syncJobTypeSelector','setQuoteJobType','applyCustomerFieldsToQuoteFromRecord'].map(fn).join('\n'),c);
  return c;
}

test('normalizeJobType defaults missing or unknown values to build',()=>{
  const c=ctx('quote');
  assert.equal(c.normalizeJobType(undefined),'build');
  assert.equal(c.normalizeJobType(''),'build');
  assert.equal(c.normalizeJobType('junk'),'build');
  assert.equal(c.normalizeJobType('build'),'build');
  assert.equal(c.normalizeJobType('repair'),'repair');
  assert.equal(c.normalizeJobType(' Repair '),'repair');
});

test('job type is stored on the quote record, default build, restored via normalizeQuote',()=>{
  assert.match(fn('newQuoteTemplate'),/jobType:'build'/);
  assert.match(fn('normalizeQuote'),/merged\.jobType=normalizeJobType\(inputQuote&&inputQuote\.jobType\)/);
  assert.match(fn('quoteForPersistence'),/normalizeQuote\(/);
});

test('selector markup: two options, build default, after customer details',()=>{
  const group=html.slice(html.indexOf('id="quoteJobTypeGroup"'));
  assert.ok(html.indexOf('id="workshopCustomerSection"')<html.indexOf('id="quoteJobTypeGroup"'));
  assert.match(group,/data-job-type="build" aria-pressed="true">New Build</);
  assert.match(group,/data-job-type="repair" aria-pressed="false">Repair \/ Refurbishment</);
});

test('changing job type only changes jobType and marks dirty',()=>{
  const c=ctx('active','build');
  const before=JSON.stringify({...c.quote,jobType:undefined});
  c.setQuoteJobType('repair');
  assert.equal(c.quote.jobType,'repair');
  assert.equal(JSON.stringify({...c.quote,jobType:undefined}),before);
  assert.equal(c.dirty,true);
});

test('changing customer fields does not reset job type',()=>{
  const c=ctx('active','repair');
  c.applyCustomerFieldsToQuoteFromRecord(c.quote,{customerName:'Other',phone:'1'});
  assert.equal(c.quote.jobType,'repair');
  assert.equal(c.quote.customerName,'Other');
});

test('customer document labels per job type and status',()=>{
  const expected={
    build:{quote:'Customer Quote',active:'Build Confirmation',complete:'Build Summary'},
    repair:{quote:'Repair Quote',active:'Repair Confirmation',complete:'Completed Repair Summary'},
  };
  for(const type of ['build','repair'])for(const status of ['quote','active','complete']){
    const l=ctx(status,type).customerDocumentLabels();
    assert.equal(l.title,expected[type][status],`${type}/${status}`);
    assert.equal(l.key,status);
  }
  assert.equal(ctx('quote',undefined).customerDocumentLabels().title,'Customer Quote');
});

test('repair emails use repair wording, headings and subjects; builds unchanged',()=>{
  const body=(s,t)=>ctx(s,t).customerEmailLines().join('\n');
  assert.match(body('quote','repair'),/Thank you for your enquiry\. Below is the proposed work and quotation for your rod repair\./);
  assert.match(body('active','repair'),/Your rod repair with K-Labs has been confirmed\. Below is a summary of the agreed work\./);
  assert.match(body('complete','repair'),/Your rod repair with K-Labs is complete\. Below is a summary of the work carried out\./);
  for(const s of ['quote','active','complete']){
    const r=body(s,'repair');
    assert.match(r,/Rod Repair — Q-1001/);
    assert.match(r,/Work Included\n- 2 × Guide wrap/);
    assert.doesNotMatch(r,/Components Included|Custom Rod Build/);
    const b=body(s,undefined);
    assert.match(b,/Custom Rod Build — Q-1001/);
    assert.match(b,/Components Included\n- 2 × Guide wrap/);
    assert.doesNotMatch(b,/Work Included|Rod Repair/);
  }
  assert.match(body('quote','repair'),/your repair will be confirmed/);
  assert.match(body('quote','build'),/your build will be confirmed/);
});

test('email subjects',()=>{
  const subject=(s,t)=>{
    const c=ctx(s,t);
    c.window={location:{}};
    vm.runInContext('window.location',c);
    c.emailCurrentQuote();
    return decodeURIComponent(c.window.location.href.match(/subject=([^&]*)/)[1]);
  };
  assert.equal(subject('quote','build'),'K-Labs Custom Rod Build Quote — Q-1001');
  assert.equal(subject('active','build'),'K-Labs Build Confirmation — Q-1001');
  assert.equal(subject('complete','build'),'K-Labs Build Summary — Q-1001');
  assert.equal(subject('quote','repair'),'K-Labs Rod Repair Quote — Q-1001');
  assert.equal(subject('active','repair'),'K-Labs Repair Confirmation — Q-1001');
  assert.equal(subject('complete','repair'),'K-Labs Completed Repair Summary — Q-1001');
});

test('preview heading and confirmation text follow job type; email and preview share parts',()=>{
  assert.match(ctx('quote','repair').customerIncludedPartsMarkup(['1 × Guide']),/<span>Work Included<\/span>/);
  assert.match(ctx('quote','build').customerIncludedPartsMarkup(['1 × Guide']),/<span>What your rod includes<\/span>/);
  assert.match(ctx('complete','repair').customerDocumentConfirmationText(false),/rod repair is complete/);
  assert.match(ctx('active','repair').customerDocumentConfirmationText(false),/rod repair is now proceeding/);
  assert.equal(ctx('quote','build').customerDocumentConfirmationText(false),'quote text');
  assert.match(fn('customerQuoteSummaryMarkup'),/customerIncludedParts\(\)/);
  assert.match(fn('customerEmailLines'),/customerIncludedParts\(\)/);
});

test('repair emails keep customer-safe content',()=>{
  const r=ctx('quote','repair').customerEmailLines().join('\n');
  assert.doesNotMatch(r,/cost|profit|margin|supplier/i);
});

test('job type labels, legacy default, header and list display',()=>{
  const c=ctx('quote');
  assert.equal(c.jobTypeLabel('repair'),'Repair / Refurbishment');
  assert.equal(c.jobTypeLabel('build'),'New Build');
  assert.equal(c.jobTypeLabel(undefined),'New Build');
  assert.match(fn('savedBuildRowMarkup'),/jobTypeLabel\(record\.jobType\)/);
  assert.match(fn('updateWorkshopBuildOverview'),/jobTypeLabel\(quote&&quote\.jobType\)/);
  assert.match(html,/id="quoteBuilderOverviewJobType"/);
});

test('status changes spread the stored record so jobType is preserved',()=>{
  assert.match(fn('saveBuildLifecycleStatusBySource'),/\.\.\.target/);
});

test('email has exactly one signature and no legacy footer',()=>{
  const lines=[];
  for(const t of ['build','repair'])for(const s of ['quote','active','complete']){
    const body=ctx(s,t).customerEmailLines().join('\n');
    assert.equal(body.split('Kind regards,').length-1,1,`${t}/${s}`);
    assert.equal(body.split('027 000 0000').length-1,1);
    assert.ok(body.trimEnd().endsWith('www.example.test'));
  }
  assert.equal(source.split("'Kind regards,'").length-1,1);
});