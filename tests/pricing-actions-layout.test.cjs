// Pricing & Actions iPhone layout (custom builds and repairs). Runs the REAL ui.js functions (tests/helpers/job-record-loader.cjs)
// against a small fake DOM, with every save, sync and document builder replaced by a counting spy. Synthetic data only.
// Checks: which controls show at Quote / Active / Complete, the delivery rules under Customer collects, the one payment
// form (add, or tap a payment to edit it), and that opening or closing any control makes zero saves, syncs or documents.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');
const uiSource=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const asyncSource=(name)=>{const at=uiSource.indexOf(`async function ${name}(`);return uiSource.slice(at,uiSource.indexOf('\n}',at)+2);};

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const plain=(v)=>JSON.parse(JSON.stringify(v));
const section=html.slice(html.indexOf('<article id="workshopPricingSection"'),html.indexOf('</article>',html.indexOf('<article id="workshopPricingSection"')));
const layoutCss=css.slice(css.indexOf('/* Pricing & Actions, iPhone layout'),css.indexOf('#workshopScreen .workshop-build-actions-row.workshop-build-actions-row--status'));

const job=(extra={})=>({id:'build-synthetic-layout',quoteNumber:'Q-4001',quoteStatus:'quote',customerName:'Synthetic Customer',jobType:'build',
  components:[{category:'Guide',description:'Fuji ring',quantity:2,unitPrice:50,cost:10}],labourRate:0,labourHours:0,pricingDriver:'price',
  priceAdjustment:0,deliveryEntryMode:'breakdown',freight:0,packaging:0,payments:[],...extra});

// A fake element: enough for the layout functions (attributes, hidden, value, text, focus, containment).
function makeDom(){
  const els={};
  const el=(id)=>els[id]||(els[id]={id,attrs:{},hidden:false,value:'',textContent:'',innerHTML:'',max:'',focused:false,children:[],
    setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k];},removeAttribute(k){delete this.attrs[k];},
    classList:{toggle(){}},focus(){this.focused=true;},contains(node){return node===this||this.children.includes(node);},
    querySelector:()=>null,addEventListener(){}});
  el('quoteDeliveryFields').children.push(el('quoteFreight'),el('quotePackaging'));
  const document={querySelector:()=>null,querySelectorAll:()=>[]};
  return {els,el,document};
}

function app(record,env={}){
  const dom=makeDom();
  const spy={saves:0,dirty:0,persist:0,removed:[],financial:[],documents:[],sync:[],lifecycle:0};
  const doc=(name)=>(...args)=>{spy.documents.push(name);return '';};
  const sync=new Proxy({},{get:(t,name)=>name==='pendingFinancial'?()=>false:name==='getStatus'?()=>'synced':(...args)=>{spy.sync.push(name);}});
  const c=loadRecordFunctions(['normalizeQuote','updatePaymentBlock','updateWorkshopBuildActionsUi','syncFulfilmentSelector','syncPricingLayoutState',
    'toggleQuotePricingSummary','setQuoteFulfilmentMethod','openRecordPaymentForm','closeBalanceReceivedForm','openPaymentEditor',
    'newPaymentType','paymentFormValues','handleCurrentBuildAction','openCurrentBuildActionsMenu','closeCurrentBuildActionsMenu',
    'toggleMoreDocumentsMenu','handleMoreDocumentsAction'],{
    $:dom.el,document:dom.document,CSS:{escape:String},removePaymentEntry:(id)=>{spy.removed.push(id);},Store:{get:(k,f)=>f,set:()=>true},
    window:{KLABS_ACCOUNT_ID:'acct',KLABS_BUILD_SYNC:sync,requestAnimationFrame:()=>{},crypto:{randomUUID:()=>'new-payment-id'}},
    activeAccountKey:()=>'acct',activeTaxEnabled:()=>env.tax!==false,formatDateDisplay:(v)=>String(v),localDateInputValue:()=>'2026-11-18',
    businessProfile:{businessName:'Synthetic Rods'},positionAnchoredActionMenu(){},
    updateQuoteSummary:()=>c.syncFulfilmentSelector(),saveQuoteCurrent:()=>{spy.saves++;},markQuoteDirty:()=>{spy.dirty++;},persistCurrentQuoteRecord:async()=>{spy.persist++;return true;},
    commitFinancialOperation:async(kind,data)=>{spy.financial.push({kind,type:data.type,amount:data.amount,date:data.date,id:data.id,reason:data.reason});},
    customerQuoteSummaryMarkup:doc('quote'),customerEmailLines:doc('email'),buildInvoiceSnapshot:doc('invoiceSnapshot'),
    invoiceDocumentMarkup:doc('invoiceMarkup'),customerInvoicePreviewMarkup:doc('invoicePreview'),
    openInvoicePreview:()=>spy.documents.push('openInvoicePreview'),openPaymentStatement:()=>spy.documents.push('openPaymentStatement'),
    requestDeleteCurrentBuild:()=>{},toggleCurrentBuildLifecycle:()=>{spy.lifecycle++;},openInfoDialog:()=>{},updateBuildPricingSummary:()=>{},
  });
  // The loader reads plain functions; the two async save steps are loaded from ui.js directly.
  vm.runInContext("var financialOperationInFlight=false;var PAYMENT_EDIT_REASON='Edited in Studio';\n"+asyncSource('saveBalanceReceived'),c);
  c.quote=c.normalizeQuote(plain(record));
  const render=()=>{c.updateWorkshopBuildActionsUi();c.updatePaymentBlock();c.syncFulfilmentSelector();};
  render();
  const attrs=()=>dom.el('workshopPricingSection').attrs;
  return {c,dom,spy,render,attrs,el:dom.el};
}
const noSideEffects=(spy,label)=>{
  assert.equal(spy.saves,0,`${label}: no save`);
  assert.equal(spy.dirty,0,`${label}: no unsaved-change marker`);
  assert.equal(spy.persist,0,`${label}: no record write`);
  assert.deepEqual(spy.sync,[],`${label}: no sync call`);
  assert.deepEqual(spy.financial,[],`${label}: no payment or invoice operation`);
  assert.deepEqual(spy.removed,[],`${label}: nothing removed`);
  assert.deepEqual(spy.documents,[],`${label}: no document generated`);
};

// ---------- markup ----------
test('one Add payment button and one Amount / Date / Save form; no type chooser, no correction wording',()=>{
  assert.equal((section.match(/id="quoteRecordPaymentBtn"/g)||[]).length,1);
  assert.doesNotMatch(section,/quoteRecordDepositBtn|quoteRecordBalanceBtn|Record Deposit Received|Record Balance Received/);
  const form=section.slice(section.indexOf('id="quoteBalanceReceivedForm"'),section.indexOf('class="quote-payment__actions"'));
  assert.match(form,/Amount[\s\S]*id="quoteBalanceReceivedAmount"[\s\S]*Date[\s\S]*id="quoteBalanceReceivedDate"[\s\S]*id="quoteBalanceReceivedSave"[^>]*>Save</);
  assert.doesNotMatch(form,/data-payment-type|quotePaymentTypeField|>DEPOSIT<|>BALANCE<|Correct|[Rr]eason|[Aa]udit/);
  assert.equal((form.match(/primary-action/g)||[]).length,1,'Save is the one primary action');
});

test('documents: the customer document and the Invoice (each opens its preview, where Email or PDF sit), then a More documents menu holding Customer Invoice; ••• keeps Payment Statement and Delete',()=>{
  const docs=section.slice(section.indexOf('workshop-build-actions-docs__grid'),section.indexOf('workshop-build-actions-row--status'));
  // Q33: no separate email button on the build; the email draft is in the document preview.
  assert.deepEqual([...docs.matchAll(/<button id="([^"]+)"/g)].map((m)=>m[1]),['viewQuoteBtn','viewInvoicePreviewBtn','quoteMoreDocumentsBtn']);
  assert.match(docs,/id="viewQuoteBtn"[^>]*>Quote</);
  assert.match(docs,/id="viewInvoicePreviewBtn"[^>]*>Invoice</);
  assert.match(docs,/id="quoteMoreDocumentsBtn"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*>More documents</);
  const more=docs.slice(docs.indexOf('id="quoteMoreDocumentsMenu"'));
  assert.match(more,/^id="quoteMoreDocumentsMenu"[^>]*role="menu"[^>]*hidden>/,'the menu starts closed');
  assert.deepEqual([...more.matchAll(/data-more-document="([^"]+)">([^<]+)</g)].map((m)=>`${m[1]}:${m[2]}`),['invoice:Customer Invoice']);
  assert.doesNotMatch(section,/viewPaymentStatementBtn/);
  const menu=section.slice(section.indexOf('id="currentBuildActionsMenu"'));
  assert.deepEqual([...menu.matchAll(/data-current-build-action="([^"]+)">([^<]+)</g)].map((m)=>`${m[1]}:${m[2]}`),
    ['rename:Rename Build','statement:Payment Statement','delete:Delete Build']);
});

test('the layout rules are screen-only and scoped to the Pricing & Actions section',()=>{
  const rules=layoutCss.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map((r)=>r.trim()).filter(Boolean);
  for(const rule of rules)assert.match(rule,/^(#workshopPricingSection|#workshopScreen )/,rule.slice(0,80));
  assert.match(layoutCss,/\[data-lifecycle="quote"\] #viewInvoicePreviewBtn\{display:none\}/);
  assert.match(layoutCss,/#workshopPricingSection:not\(\[data-lifecycle="quote"\]\) #quoteMoreDocumentsWrap\{display:none\}/,'More documents is Quote-stage only');
  assert.match(layoutCss,/:not\(\[data-invoice-issued="true"\]\) #currentBuildActionsMenu \[data-current-build-action="statement"\]/);
  assert.match(layoutCss,/\[data-paid-in-full="true"\]:not\(\[data-job-kind="components"\]\) #quoteRecordPaymentBtn\{display:none\}/);
  assert.match(layoutCss,/\[data-pricing-collapsed="true"\] #workshopPricingFields > :not\(#quotePricingSummaryBtn\)\{display:none\}/,'Payment stays visible when pricing folds');
});

// ---------- stages ----------
for(const jobType of ['build','repair']){
  test(`${jobType}: Quote shows the full pricing; Active folds it once invoiced; Complete folds it; the line reopens without saving`,()=>{
    const q=app(job({jobType}));
    assert.equal(q.attrs()['data-lifecycle'],'quote');
    assert.equal(q.attrs()['data-pricing-collapsible'],'false');
    assert.equal(q.attrs()['data-invoice-issued'],'false','Payment Statement stays out of ••• until an invoice exists');
    const a=app(job({jobType,quoteStatus:'active'}));
    assert.equal(a.attrs()['data-pricing-collapsed'],'false','Active, not invoiced: pricing stays open');
    const issued=app(job({jobType,quoteStatus:'active',issuedInvoice:{number:'INV-1',total:100,payments:[]}}));
    assert.equal(issued.attrs()['data-invoice-issued'],'true');
    assert.equal(issued.attrs()['data-pricing-collapsed'],'true');
    assert.match(issued.el('quotePricingSummaryValue').textContent,/^\$\d+\.\d\d$/,'the Rod price excl. tax');
    const done=app(job({jobType,quoteStatus:'complete'}));
    assert.equal(done.attrs()['data-pricing-collapsed'],'true');
    done.c.toggleQuotePricingSummary();
    assert.equal(done.attrs()['data-pricing-collapsed'],'false');
    assert.equal(done.el('quotePricingSummaryBtn').attrs['aria-expanded'],'true');
    done.c.toggleQuotePricingSummary();
    assert.equal(done.attrs()['data-pricing-collapsed'],'true');
    noSideEffects(done.spy,'Pricing line');
  });
}

test('paid in full hides Record Payment; money owing or no payment yet keeps it',()=>{
  assert.equal(app(job()).attrs()['data-paid-in-full'],'false');
  assert.equal(app(job({quoteStatus:'complete',payments:[{id:'p1',type:'balance',amount:40,date:'2026-11-18'}]})).attrs()['data-paid-in-full'],'false');
  assert.equal(app(job({quoteStatus:'complete',payments:[{id:'p1',type:'balance',amount:100,date:'2026-11-18'}]})).attrs()['data-paid-in-full'],'true');
});

// ---------- delivery ----------
test('only Courier reveals shipping costs for builds, repairs and Components',()=>{
  for(const kind of [{jobType:'build'},{jobType:'repair'},{jobKind:'components'}]){
    const q=app(job({...kind,fulfilmentMethod:'shipping',freight:10,packaging:2}));
    assert.equal(q.el('quoteDeliveryFields').hidden,false);
    q.c.setQuoteFulfilmentMethod('collection');
    assert.equal(q.el('quoteDeliveryFields').hidden,true);
    assert.match(q.el('quoteFulfilmentNote').textContent,/not charged while the customer collects/);
    assert.deepEqual([q.c.quote.freight,q.c.quote.packaging],[10,2]);
    assert.equal(q.c.depositMaths().total,100);
    q.c.setQuoteFulfilmentMethod('shipping');
    assert.equal(q.el('quoteDeliveryFields').hidden,false);
    assert.equal(q.c.depositMaths().total,113.8);
    assert.equal(q.spy.saves,2);
    assert.equal(q.spy.dirty,2);
    assert.deepEqual(q.spy.financial,[]);
    assert.equal(app(job({...kind,freight:10})).el('quoteDeliveryFields').hidden,true);
  }
});

// ---------- Payments ----------
test('Add payment suggests the requested deposit first, and the first payment below the total is a Deposit',()=>{
  const q=app(job({depositEnabled:true,depositType:'percent',depositValue:30}));
  assert.equal(q.el('quoteRecordPaymentLabel').textContent,'Add Deposit');
  q.c.openRecordPaymentForm();
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,false);
  assert.equal(q.el('quoteBalanceReceivedAmount').value,'30.00');
  assert.equal(q.el('quoteBalanceReceivedDate').value,'2026-11-18');
  assert.equal(q.el('quotePaymentFormTitle').textContent,'New Deposit');
  assert.equal(q.c.newPaymentType(30),'deposit');
  assert.equal(q.c.newPaymentType(100),'balance','paying the whole total at once is a payment');
  noSideEffects(q.spy,'Add payment form');
});

test('Add payment otherwise suggests the balance owing; later payments and Components jobs are Payments',()=>{
  const none=app(job());
  assert.equal(none.el('quoteRecordPaymentLabel').textContent,'Add Payment');
  none.c.openRecordPaymentForm();
  assert.equal(none.el('quoteBalanceReceivedAmount').value,'100.00');
  const paid=app(job({quoteStatus:'active',depositEnabled:true,depositValue:30,payments:[{id:'p1',type:'deposit',amount:30,date:'2026-11-18'}]}));
  paid.c.openRecordPaymentForm();
  assert.equal(paid.el('quoteBalanceReceivedAmount').value,'70.00');
  assert.equal(paid.c.newPaymentType(20),'balance','one deposit only');
  assert.equal(app(job({jobKind:'components'})).c.newPaymentType(20),'balance','Components jobs take no deposit');
});

test('Save adds a payment once through the unchanged operation and closes the form',async()=>{
  const q=app(job({depositEnabled:true,depositValue:30}));
  q.c.openRecordPaymentForm();
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.financial,[{kind:'add_payment',type:'deposit',amount:30,date:'2026-11-18',id:'new-payment-id',reason:undefined}]);
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,true,'closed after saving');
  const b=app(job());
  b.c.openRecordPaymentForm();
  await b.c.saveBalanceReceived();
  assert.deepEqual(b.spy.financial.map((f)=>[f.kind,f.type,f.amount]),[['add_payment','balance',100]]);
});

test('tapping a payment edits that payment: same id and type, a fixed reason, never a new payment',async()=>{
  const q=app(job({quoteStatus:'active',payments:[{id:'p1',type:'deposit',amount:30,date:'2026-11-17'},{id:'p9',type:'balance',amount:40,date:'2026-11-18'}]}));
  q.c.openPaymentEditor('p1');
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,false);
  assert.equal(q.el('quoteBalanceReceivedAmount').value,'30.00');
  assert.equal(q.el('quoteBalanceReceivedDate').value,'2026-11-17');
  assert.equal(q.el('quotePaymentFormTitle').textContent,'Edit Deposit');
  q.el('quoteBalanceReceivedAmount').value='35.00';
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.financial,[{kind:'correct_payment',type:'deposit',amount:35,date:'2026-11-17',id:'p1',reason:'Edited in Studio'}]);
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,true);
});

test('an unchanged edit just closes; an edit above the total is refused in plain words',async()=>{
  const q=app(job({quoteStatus:'active',payments:[{id:'p9',type:'balance',amount:40,date:'2026-11-18'}]}));
  q.c.openPaymentEditor('p9');
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.financial,[]);
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,true);
  q.c.openPaymentEditor('p9');
  q.el('quoteBalanceReceivedAmount').value='100.01';
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.financial,[]);
  assert.equal(q.el('quoteBalanceReceivedError').textContent,'Payments can’t add up to more than the total price.');
  q.el('quoteBalanceReceivedAmount').value='abc';
  await q.c.saveBalanceReceived();
  assert.equal(q.el('quoteBalanceReceivedError').textContent,'Enter an amount, for example 150.00.');
});

test('tapping the open payment again closes it; saving it as $0 hands the id to the confirmed removal, never a $0 payment',async()=>{
  const q=app(job({quoteStatus:'active',payments:[{id:'p9',type:'balance',amount:40,date:'2026-11-18'}]}));
  q.c.openPaymentEditor('p9');
  q.c.openPaymentEditor('p9');
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,true);
  noSideEffects(q.spy,'open and close a payment');
  for(const zero of ['0','0.00','.0']){
    q.spy.removed.length=0;
    q.c.openPaymentEditor('p9');
    q.el('quoteBalanceReceivedAmount').value=zero;
    await q.c.saveBalanceReceived();
    assert.deepEqual(q.spy.removed,['p9'],`${zero}: removePaymentEntry asks "Remove this payment?" itself`);
    assert.deepEqual(q.spy.financial,[],`${zero}: no correct_payment with a zero amount`);
    assert.equal(q.el('quoteBalanceReceivedError').textContent,'');
    q.c.closeBalanceReceivedForm();
  }
  // A new payment of $0 is simply not valid; nothing is removed or written.
  q.spy.removed.length=0;
  q.c.openRecordPaymentForm();
  q.el('quoteBalanceReceivedAmount').value='0';
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.removed,[]);
  assert.deepEqual(q.spy.financial,[]);
  assert.equal(q.el('quoteBalanceReceivedError').textContent,'Enter an amount, for example 150.00.');
  // An emptied amount on an edit is an error, not a removal.
  q.c.openPaymentEditor('p9');
  q.el('quoteBalanceReceivedAmount').value='';
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.removed,[]);
  assert.equal(q.el('quoteBalanceReceivedError').textContent,'Enter an amount, for example 150.00.');
});

test('Payments Received and Balance Owing appear only once there is a payment, and update from the payments',()=>{
  const none=app(job());
  assert.equal(none.el('quotePaymentHistoryDetails').hidden,true);
  const some=app(job({quoteStatus:'active',payments:[{id:'p9',type:'balance',amount:40,date:'2026-11-18'}]}));
  assert.match(some.el('quotePaymentTotalReceived').textContent,/40\.00/);
  assert.match(some.el('quotePaymentBalanceOwing').textContent,/60\.00/);
  assert.equal(some.el('quotePaymentBalanceLabel').textContent,'Balance Owing');
  some.c.quote.payments.push({id:'p10',type:'balance',amount:60,date:'2026-11-19'});
  some.render();
  assert.equal(some.el('quotePaymentBalanceOwing').textContent,'Paid in full');
  assert.equal(some.el('quotePaymentBalanceLabel').textContent,'Balance');
});

// ---------- ••• menu and documents on tap ----------
test('••• opens and closes with no side effects; Customer Invoice and Payment Statement are built only when tapped',()=>{
  const q=app(job());
  q.c.openCurrentBuildActionsMenu();
  q.c.closeCurrentBuildActionsMenu();
  noSideEffects(q.spy,'••• menu');
  q.c.handleCurrentBuildAction('statement');
  assert.deepEqual(q.spy.documents,['openPaymentStatement']);
  assert.equal(q.spy.saves+q.spy.dirty+q.spy.persist+q.spy.sync.length,0);
});

// ---------- Quote stage: More documents (F1) ----------
for(const jobType of ['build','repair']){
  test(`${jobType} quote: opening and closing More documents only shows and hides the menu`,()=>{
    const q=app(job({jobType}));
    const btn=q.el('quoteMoreDocumentsBtn'),menu=q.el('quoteMoreDocumentsMenu');
    menu.hidden=true;
    q.c.toggleMoreDocumentsMenu();
    assert.equal(menu.hidden,false);assert.equal(btn.attrs['aria-expanded'],'true');
    q.c.toggleMoreDocumentsMenu();
    assert.equal(menu.hidden,true);assert.equal(btn.attrs['aria-expanded'],'false');
    noSideEffects(q.spy,'More documents');
    assert.equal(q.spy.lifecycle,0);assert.equal(q.c.quote.quoteStatus,'quote');
  });

  test(`${jobType} quote: Customer Invoice in More documents opens the draft preview once and leaves the job at Quote`,()=>{
    const q=app(job({jobType}));
    q.c.toggleMoreDocumentsMenu();
    q.c.handleMoreDocumentsAction('invoice');
    assert.deepEqual(q.spy.documents,['openInvoicePreview']);
    assert.equal(q.el('quoteMoreDocumentsMenu').hidden,true,'the menu closes');
    assert.equal(q.spy.saves+q.spy.dirty+q.spy.persist+q.spy.sync.length+q.spy.financial.length+q.spy.lifecycle,0);
    assert.equal(q.c.quote.quoteStatus,'quote');
  });
}

test('More documents and ••• close each other, and every ••• close point also closes More documents',()=>{
  const q=app(job());
  q.c.toggleMoreDocumentsMenu();
  q.c.openCurrentBuildActionsMenu();
  assert.equal(q.el('quoteMoreDocumentsMenu').hidden,true);
  assert.equal(q.el('currentBuildActionsMenu').hidden,false);
  q.c.toggleMoreDocumentsMenu();
  assert.equal(q.el('currentBuildActionsMenu').hidden,true,'opening More documents closes •••');
  q.c.closeCurrentBuildActionsMenu();
  assert.equal(q.el('quoteMoreDocumentsMenu').hidden,true);
  noSideEffects(q.spy,'menus');
});

test('More documents is hidden for Components jobs and outside the Quote stage',()=>{
  assert.match(layoutCss,/#workshopPricingSection:not\(\[data-lifecycle="quote"\]\) #quoteMoreDocumentsWrap\{display:none\}/);
  assert.match(css,/#workshopPricingSection\[data-job-kind="components"\] #quoteMoreDocumentsWrap,/);
  assert.match(layoutCss,/\[data-lifecycle="quote"\] #viewInvoicePreviewBtn\{display:none\}/,'the full-width invoice button stays Active/Complete only');
});

test('rendering the section at every stage builds no document and makes no save or sync call',()=>{
  for(const record of [job(),job({jobType:'repair'}),job({quoteStatus:'active',issuedInvoice:{number:'INV-1',total:100,payments:[]}}),
    job({quoteStatus:'complete',fulfilmentMethod:'collection',freight:5})]){
    const q=app(record);
    q.render();q.render();
    noSideEffects(q.spy,`${record.jobType} ${record.quoteStatus}`);
  }
});

test('Components: pricing never folds into one line, and Record Payment is not hidden by the paid-in-full rule',()=>{
  for(const extra of [{quoteStatus:'complete'},{quoteStatus:'active',issuedInvoice:{number:'INV-1',total:100,payments:[]}}]){
    const q=app(job({jobKind:'components',...extra}));
    assert.equal(q.attrs()['data-pricing-collapsible'],'false');
    assert.equal(q.attrs()['data-pricing-collapsed'],'false');
  }
  assert.match(layoutCss,/:not\(\[data-job-kind="components"\]\) #quoteRecordPaymentBtn/);
});

test('the Pricing & Actions ••• button is a 44×44 px touch target, and its fallback menu keeps a gap above it',()=>{
  assert.match(css,/#workshopScreen \.workshop-build-actions-menu-wrap \.saved-build-card__menu-toggle\{\s*min-width:44px;\s*min-height:44px;\s*\}/);
  assert.match(css,/#workshopScreen \.workshop-build-actions-menu\{\s*top:auto;\s*bottom:50px;/);
  assert.doesNotMatch(css,/menu-toggle\{\s*min-width:38px/);
});
