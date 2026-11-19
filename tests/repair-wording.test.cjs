// Repair / Refurb wording: the quote confirmation action and the invoice description. Runs the REAL ui.js functions
// (tests/helpers/job-record-loader.cjs) on synthetic records; nothing is issued or synced. Rod builds and Components unchanged.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');

const plain=(v)=>JSON.parse(JSON.stringify(v));
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const fnSource=(name)=>{const at=source.indexOf(`function ${name}(`);const start=source.slice(at-6,at)==='async '?at-6:at;return source.slice(start,source.indexOf('\n}',at)+2);};
const ACCOUNT='00000000-0000-4000-8000-000000000001';
const job=(extra={})=>({id:'build-synthetic-repair',quoteNumber:'Q-3001',quoteStatus:'quote',customerName:'Synthetic Customer',
  jobType:'repair',buildName:'',notes:'',components:[{category:'Guide',description:'Fuji ring',quantity:2,unitPrice:20,cost:5}],
  labourRate:60,labourHours:1,pricingDriver:'price',priceAdjustment:0,payments:[],...extra});

function app(){
  const calls={confirm:[],lifecycle:[]};
  const c=loadRecordFunctions(['normalizeQuote','buildInvoiceSnapshot','invoiceDocumentMarkup','readableInvoiceNumberForJob','invoiceDisplayNumber','issuedInvoiceRecordsForReadableNumber','depositMaths','customerDocumentLabels','zeroPricedComponentLabels','currency'],{
    Store:{get:(k,f)=>f,set:()=>true},window:{KLABS_ACCOUNT_ID:ACCOUNT},TextEncoder,
    businessProfile:{businessName:'Synthetic Rods'},currentBuildLifecycleStatus:()=>c.quote.quoteStatus||'quote',currentBusinessLogo:()=>'',
    localDateInputValue:()=>'2026-11-18',
    openConfirmDialog:(spec,cb)=>{calls.confirm.push(spec);return cb('confirm');},openInfoDialog:()=>{},
    hasUnsavedQuoteChanges:false,persistCurrentQuoteRecord:async()=>true,
    setCurrentBuildLifecycle:async(next,options)=>{calls.lifecycle.push({next,message:options.message});return true;},
  });
  vm.runInContext(fnSource('confirmCurrentBuildAsActive'),c);
  return {c,calls,open:(record)=>{c.quote=c.normalizeQuote(plain(record));return c.quote;}};
}

// ---------- invoice description ----------
test('repair draft invoice: the saved Repair Description is the description, never "Custom Fishing Rod"',()=>{
  const {c,open}=app();
  open(job({notes:'Rewrap all guides\nReplace tip top',buildName:'Shimano Spin 7ft'}));
  const draft=c.buildInvoiceSnapshot(true);
  assert.equal(draft.rod,'Rewrap all guides');
  assert.deepEqual(plain(draft.rodDetails),['Replace tip top','Rod: Shimano Spin 7ft','Guides: Fuji ring'],'then the existing fitted-parts line');
  const markup=c.invoiceDocumentMarkup(draft,draft.payments,false,true);
  assert.match(markup,/DRAFT — NOT ISSUED/);
  assert.match(markup,/<h4 class="invoice-document__label">Description<\/h4><p>Rewrap all guides<\/p><p class="invoice-document__detail">Replace tip top<\/p>/);
  assert.doesNotMatch(markup,/Custom Fishing Rod/);
});

test('repair with no description: "Fishing Rod Repair"',()=>{
  const {c,open}=app();
  for(const notes of ['','   ']){
    open(job({notes}));
    assert.equal(c.buildInvoiceSnapshot(true).rod,'Fishing Rod Repair');
  }
  open(job({buildName:'Synthetic Customer'}));
  const snap=c.buildInvoiceSnapshot(true);
  assert.equal(snap.rod,'Fishing Rod Repair');
  assert.deepEqual(plain(snap.rodDetails),['Guides: Fuji ring'],'a rod name equal to the customer name is still ignored');
});

test('issued repair invoice and its print/PDF document: same wording, numbering and totals (test data, nothing issued)',()=>{
  const {c,open}=app();
  open(job({notes:'Rewrap all guides',payments:[{id:'p1',type:'deposit',amount:30,date:'2026-11-18'}]}));
  const issued=plain(c.buildInvoiceSnapshot(false));
  assert.equal(issued.rod,'Rewrap all guides');
  assert.match(issued.number,/^INV-00000000000040008000000000000001-/);
  assert.equal(issued.number,c.buildInvoiceSnapshot(false).number,'numbering is stable');
  assert.equal(issued.total,c.depositMaths().total);
  assert.equal(issued.total,100,'2 x 20 + 1h labour at 60');
  // Print and the iPhone PDF use this same rendered document; print requires issued=true, no draft banner and the stored number.
  const markup=c.invoiceDocumentMarkup(issued,issued.payments,false);
  assert.match(markup,new RegExp(`data-invoice-issued="true" data-invoice-number="${issued.number}"`));
  assert.doesNotMatch(markup,/DRAFT/);
  assert.match(markup,/<p>Rewrap all guides<\/p>/);
  assert.match(markup,/<dt>Balance due<\/dt><dd>70\.00 [A-Z]{3}<\/dd>|70\.00/);
});

test('an invoice already issued keeps its stored wording (issued invoices are never rewritten)',()=>{
  const {c,open}=app();
  open(job({notes:'Rewrap all guides'}));
  const stored={...plain(c.buildInvoiceSnapshot(false)),rod:'Custom Fishing Rod',rodDetails:[]};
  assert.match(c.invoiceDocumentMarkup(stored,[],false),/<p>Custom Fishing Rod<\/p>/);
});

test('rod build invoice wording is unchanged',()=>{
  const {c,open}=app();
  open(job({jobType:'build',notes:'Rewrap all guides'}));
  assert.equal(c.buildInvoiceSnapshot(true).rod,'Custom Fishing Rod');
  open(job({jobType:'build',buildName:'Coastal 9ft Light Surf'}));
  const snap=c.buildInvoiceSnapshot(true);
  assert.equal(snap.rod,'Coastal 9ft Light Surf');
  assert.equal(snap.rodDetails.some((d)=>/^Rod:/.test(d)),false);
});

// ---------- the confirmation action ----------
test('repair quote: "Confirm Repair" dialog and confirmation; the quote document wording is unchanged',async()=>{
  const {c,calls,open}=app();
  open(job());
  assert.equal(c.customerDocumentLabels().viewLabel,'View Repair Quote');
  await c.confirmCurrentBuildAsActive();
  assert.equal(calls.confirm[0].title,'Confirm Repair');
  assert.equal(calls.confirm[0].message,'Confirm this quote as an active repair?');
  assert.equal(calls.confirm[0].actions[1].label,'Confirm Repair');
  assert.deepEqual(calls.lifecycle,[{next:'active',message:'Repair confirmed — now Active'}],'the same Quote -> Active transition');
});

test('rod builds keep "Confirm Build" and Components keep "Confirm Order"',async()=>{
  const build=app();build.open(job({jobType:'build'}));
  await build.c.confirmCurrentBuildAsActive();
  assert.equal(build.calls.confirm[0].title,'Confirm Build');
  assert.equal(build.calls.confirm[0].message,'Confirm this quote as an active build?');
  assert.deepEqual(build.calls.lifecycle,[{next:'active',message:'Build confirmed — now Active'}]);
  const order=app();order.open(job({jobType:'build',jobKind:'components'}));
  await order.c.confirmCurrentBuildAsActive();
  assert.equal(order.calls.confirm[0].title,'Confirm Order');
});

test('the actions bar labels the main button by job type',()=>{
  const els={};
  const el=(id)=>els[id]||(els[id]={attrs:{},hidden:false,textContent:'',setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(){}}});
  const ctx={$:el,document:{querySelector:()=>null},quote:null,buildLifecycleStatusKey:(r)=>r.quoteStatus,buildLifecycleLabel:(k)=>k,
    customerDocumentLabels:()=>({viewLabel:'View'}),normalizeJobType:(v)=>v==='repair'?'repair':'build',normalizeJobKind:(v)=>v==='components'?'components':''};
  vm.createContext(ctx);
  vm.runInContext(['isComponentsJob','currentBuildLifecycleStatus','syncPricingLayoutState','updateWorkshopBuildActionsUi'].map(fnSource).join('\n'),ctx);
  for(const [record,label] of [[{jobType:'repair'},'Confirm Repair'],[{jobType:'build'},'Confirm Build'],[{jobType:'build',jobKind:'components'},'Confirm Order']]){
    ctx.quote={...record,quoteStatus:'quote',payments:[]};
    ctx.updateWorkshopBuildActionsUi();
    assert.equal(el('confirmBuildBtn').textContent,label);
    assert.equal(el('confirmBuildBtn').hidden,false);
  }
  ctx.quote={jobType:'repair',quoteStatus:'active',payments:[]};
  ctx.updateWorkshopBuildActionsUi();
  assert.equal(el('confirmBuildBtn').hidden,true,'shown only at the Quote stage, as before');
  assert.equal(el('toggleCurrentBuildStatusBtn').textContent,'Mark Complete');
});
