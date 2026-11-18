// Pricing & Actions iPhone layout (custom builds and repairs). Runs the REAL ui.js functions (tests/helpers/job-record-loader.cjs)
// against a small fake DOM, with every save, sync and document builder replaced by a counting spy. Synthetic data only.
// Checks: which controls show at Quote / Active / Complete, the delivery rules under Customer Collection, the single
// Record Payment form (Deposit | Balance), and that opening or closing any control makes zero saves, syncs or documents.
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
  const typeButtons=['deposit','balance'].map((type)=>({type,attrs:{'data-payment-type':type},getAttribute(k){return this.attrs[k];},setAttribute(k,v){this.attrs[k]=String(v);}}));
  el('quoteDeliveryFields').children.push(el('quoteFreight'),el('quotePackaging'),el('quoteDeliveryTotal'));
  const document={querySelector:()=>null,querySelectorAll:(q)=>q.includes('data-payment-type')?typeButtons:[]};
  return {els,el,document,typeButtons};
}

function app(record,env={}){
  const dom=makeDom();
  const spy={saves:0,dirty:0,persist:0,financial:[],documents:[],sync:[]};
  const doc=(name)=>(...args)=>{spy.documents.push(name);return '';};
  const sync=new Proxy({},{get:(t,name)=>name==='pendingFinancial'?()=>false:name==='getStatus'?()=>'synced':(...args)=>{spy.sync.push(name);}});
  const c=loadRecordFunctions(['normalizeQuote','updatePaymentBlock','updateWorkshopBuildActionsUi','syncFulfilmentSelector','syncPricingLayoutState',
    'toggleQuotePricingSummary','openDeliveryEdit','closeDeliveryEditOnLeave','openRecordPaymentForm','setRecordPaymentType','closeBalanceReceivedForm',
    'openBalanceCorrection','closeDepositReceivedForm','handleCurrentBuildAction','openCurrentBuildActionsMenu','closeCurrentBuildActionsMenu'],{
    $:dom.el,document:dom.document,Store:{get:(k,f)=>f,set:()=>true},
    window:{KLABS_ACCOUNT_ID:'acct',KLABS_BUILD_SYNC:sync,requestAnimationFrame:()=>{},crypto:{randomUUID:()=>'new-payment-id'}},
    activeAccountKey:()=>'acct',activeTaxEnabled:()=>env.tax!==false,formatDateDisplay:(v)=>String(v),localDateInputValue:()=>'2026-11-18',
    businessProfile:{businessName:'Synthetic Rods'},positionAnchoredActionMenu(){},
    saveQuoteCurrent:()=>{spy.saves++;},markQuoteDirty:()=>{spy.dirty++;},persistCurrentQuoteRecord:async()=>{spy.persist++;return true;},
    commitFinancialOperation:async(kind,data)=>{spy.financial.push({kind,type:data.type,amount:data.amount,id:data.id});},
    customerQuoteSummaryMarkup:doc('quote'),customerEmailLines:doc('email'),buildInvoiceSnapshot:doc('invoiceSnapshot'),
    invoiceDocumentMarkup:doc('invoiceMarkup'),customerInvoicePreviewMarkup:doc('invoicePreview'),
    openInvoicePreview:()=>spy.documents.push('openInvoicePreview'),openPaymentStatement:()=>spy.documents.push('openPaymentStatement'),
    requestDeleteCurrentBuild:()=>{},toggleCurrentBuildLifecycle:()=>{},openInfoDialog:()=>{},updateBuildPricingSummary:()=>{},
  });
  // The loader reads plain functions; the two async save steps are loaded from ui.js directly.
  vm.runInContext(asyncSource('saveFinancialPayment')+'\n'+asyncSource('saveBalanceReceived'),c);
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
  assert.deepEqual(spy.documents,[],`${label}: no document generated`);
};

// ---------- markup ----------
test('one Record Payment button, a Deposit | Balance choice inside the payment form, and no separate deposit/balance buttons',()=>{
  assert.equal((section.match(/id="quoteRecordPaymentBtn"/g)||[]).length,1);
  assert.doesNotMatch(section,/quoteRecordDepositBtn|quoteRecordBalanceBtn|Record Deposit Received|Record Balance Received/);
  const form=section.slice(section.indexOf('id="quoteBalanceReceivedForm"'),section.indexOf('id="quoteBalanceReceivedAmount"'));
  assert.match(form,/id="quotePaymentTypeField"[^>]*hidden[\s\S]*data-payment-type="deposit"[^>]*>DEPOSIT<[\s\S]*data-payment-type="balance"[^>]*>BALANCE</);
});

test('documents: View and Email, then Customer Invoice; Payment Statement and the Quote-stage invoice live under •••',()=>{
  const docs=section.slice(section.indexOf('workshop-build-actions-docs__grid'),section.indexOf('workshop-build-actions-row--status'));
  assert.deepEqual([...docs.matchAll(/<button id="([^"]+)"/g)].map((m)=>m[1]),['viewQuoteBtn','emailQuoteBtn','viewInvoicePreviewBtn']);
  assert.doesNotMatch(section,/viewPaymentStatementBtn/);
  const menu=section.slice(section.indexOf('id="currentBuildActionsMenu"'));
  assert.deepEqual([...menu.matchAll(/data-current-build-action="([^"]+)">([^<]+)</g)].map((m)=>`${m[1]}:${m[2]}`),
    ['invoice:Customer Invoice','statement:Payment Statement','delete:Delete Build']);
});

test('the layout rules are screen-only and scoped to the Pricing & Actions section',()=>{
  const rules=layoutCss.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map((r)=>r.trim()).filter(Boolean);
  for(const rule of rules)assert.match(rule,/^(#workshopPricingSection|#workshopScreen )/,rule.slice(0,80));
  assert.match(layoutCss,/\[data-lifecycle="quote"\] #viewInvoicePreviewBtn\{display:none\}/);
  assert.match(layoutCss,/\[data-lifecycle\]:not\(\[data-lifecycle="quote"\]\) #currentBuildActionsMenu \[data-current-build-action="invoice"\]/);
  assert.match(layoutCss,/:not\(\[data-invoice-issued="true"\]\) #currentBuildActionsMenu \[data-current-build-action="statement"\]/);
  assert.match(layoutCss,/\[data-paid-in-full="true"\]:not\(\[data-job-kind="components"\]\) #quoteRecordPaymentBtn\{display:none\}/);
  assert.match(layoutCss,/\[data-pricing-collapsed="true"\] #workshopPricingFields > :not\(#quotePricingSummaryBtn\):not\(#quotePaymentBlock\)\{display:none\}/,'Payment stays visible when pricing folds');
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
    assert.match(issued.el('quotePricingSummaryValue').textContent,/^\$100\.00 [A-Z]{3} incl\. GST$/);
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
test('Customer Collection: empty delivery fields hide; Shipping or no choice shows them (builds and repairs)',()=>{
  for(const jobType of ['build','repair']){
    assert.equal(app(job({jobType,fulfilmentMethod:'collection'})).attrs()['data-delivery'],'hidden');
    assert.equal(app(job({jobType,fulfilmentMethod:'shipping'})).attrs()['data-delivery'],'fields');
    assert.equal(app(job({jobType})).attrs()['data-delivery'],'fields','no choice yet: as today');
  }
});

test('Customer Collection with a delivery charge: the amount stays visible, and Edit reopens the fields in place',()=>{
  const q=app(job({fulfilmentMethod:'collection',freight:10,packaging:2}));
  assert.equal(q.attrs()['data-delivery'],'summary');
  assert.equal(q.el('quoteDeliverySummaryText').textContent,'Delivery included in price: $13.80 NZD incl. GST');
  q.c.openDeliveryEdit();
  assert.equal(q.attrs()['data-delivery'],'fields');
  assert.equal(q.el('quoteFreight').focused,true,'Edit goes straight to Freight');
  q.c.closeDeliveryEditOnLeave({relatedTarget:q.el('quotePackaging')});
  assert.equal(q.attrs()['data-delivery'],'fields','moving between the delivery fields never hides them');
  q.c.closeDeliveryEditOnLeave({relatedTarget:null});
  assert.equal(q.attrs()['data-delivery'],'summary','leaving folds back to the included amount');
  noSideEffects(q.spy,'Delivery Edit');
  assert.equal(q.c.quote.freight,10,'choosing Collection never clears freight');
});

test('tax off: the delivery line shows no tax wording',()=>{
  const q=app(job({fulfilmentMethod:'collection',freight:10,packaging:2}),{tax:false});
  assert.equal(q.el('quoteDeliverySummaryText').textContent,'Delivery included in price: $12.00 NZD');
});

// ---------- Record Payment ----------
test('Record Payment opens the form directly on Deposit when a deposit is required and none is recorded',()=>{
  const q=app(job({depositEnabled:true,depositType:'percent',depositValue:30}));
  q.c.openRecordPaymentForm();
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,false);
  assert.equal(q.el('quotePaymentTypeField').hidden,false,'Deposit | Balance can be switched');
  assert.equal(q.c.recordPaymentType,'deposit');
  assert.equal(q.el('quoteBalanceReceivedAmount').value,'30.00');
  assert.deepEqual(q.dom.typeButtons.map((b)=>b.attrs['aria-pressed']),['true','false']);
  q.c.setRecordPaymentType('balance');
  assert.equal(q.el('quoteBalanceReceivedAmount').value,'100.00','switching refills the suggested amount');
  q.el('quoteBalanceReceivedAmount').value='55.00';
  q.c.setRecordPaymentType('deposit');
  assert.equal(q.el('quoteBalanceReceivedAmount').value,'55.00','a typed amount is never overwritten');
  noSideEffects(q.spy,'Record Payment form');
});

test('Record Payment opens on Balance otherwise: no deposit required, or a deposit already recorded',()=>{
  const none=app(job());
  none.c.openRecordPaymentForm();
  assert.equal(none.c.recordPaymentType,'balance');
  assert.equal(none.el('quoteBalanceReceivedAmount').value,'100.00','the full balance, so paying before confirming is one tap and Save');
  assert.equal(none.el('quotePaymentTypeField').hidden,false,'a deposit can still be chosen');
  const paid=app(job({quoteStatus:'active',depositEnabled:true,depositValue:30,payments:[{id:'p1',type:'deposit',amount:30,date:'2026-11-18'}]}));
  paid.c.openRecordPaymentForm();
  assert.equal(paid.c.recordPaymentType,'balance');
  assert.equal(paid.el('quotePaymentTypeField').hidden,true,'one deposit only: no Deposit choice');
  assert.equal(paid.el('quoteBalanceReceivedAmount').value,'70.00');
  const order=app(job({jobKind:'components'}));
  order.c.openRecordPaymentForm();
  assert.equal(order.el('quotePaymentTypeField').hidden,true,'Components jobs take no deposit');
});

test('Save records the chosen type through the unchanged payment operation; corrections stay balance corrections',async()=>{
  const q=app(job({depositEnabled:true,depositValue:30}));
  q.c.openRecordPaymentForm();
  await q.c.saveBalanceReceived();
  assert.deepEqual(q.spy.financial,[{kind:'add_payment',type:'deposit',amount:30,id:'new-payment-id'}]);
  assert.equal(q.el('quoteBalanceReceivedForm').hidden,true,'closed after saving');
  assert.equal(q.c.recordPaymentType,'balance','reset for next time');
  const b=app(job());
  b.c.openRecordPaymentForm();
  await b.c.saveBalanceReceived();
  assert.deepEqual(b.spy.financial,[{kind:'add_payment',type:'balance',amount:100,id:'new-payment-id'}]);
  const fix=app(job({quoteStatus:'active',payments:[{id:'p9',type:'balance',amount:40,date:'2026-11-18'}]}));
  fix.c.recordPaymentType='deposit';
  fix.c.openBalanceCorrection('p9');
  fix.el('quoteBalanceCorrectionReason').value='Typo';
  await fix.c.saveBalanceReceived();
  assert.deepEqual(fix.spy.financial,[{kind:'correct_payment',type:'balance',amount:40,id:'p9'}]);
});

// ---------- ••• menu and documents on tap ----------
test('••• opens and closes with no side effects; Customer Invoice and Payment Statement are built only when tapped',()=>{
  const q=app(job());
  q.c.openCurrentBuildActionsMenu();
  q.c.closeCurrentBuildActionsMenu();
  noSideEffects(q.spy,'••• menu');
  q.c.handleCurrentBuildAction('invoice');
  assert.deepEqual(q.spy.documents,['openInvoicePreview']);
  q.c.handleCurrentBuildAction('statement');
  assert.deepEqual(q.spy.documents,['openInvoicePreview','openPaymentStatement']);
  assert.equal(q.spy.saves+q.spy.dirty+q.spy.persist+q.spy.sync.length,0);
});

test('rendering the section at every stage builds no document and makes no save or sync call',()=>{
  for(const record of [job(),job({jobType:'repair'}),job({quoteStatus:'active',issuedInvoice:{number:'INV-1',total:100,payments:[]}}),
    job({quoteStatus:'complete',fulfilmentMethod:'collection',freight:5})]){
    const q=app(record);
    q.render();q.render();
    noSideEffects(q.spy,`${record.jobType} ${record.quoteStatus}`);
  }
});

// ---------- Components jobs keep their v245 behaviour ----------
test('Components: Collection with a saved delivery charge keeps the fields editable in place (no summary line), as in v245',()=>{
  const order=(extra)=>job({jobKind:'components',...extra});
  assert.equal(app(order({fulfilmentMethod:'collection',freight:10,packaging:2})).attrs()['data-delivery'],'fields');
  assert.equal(app(order({fulfilmentMethod:'shipping'})).attrs()['data-delivery'],'fields');
  assert.equal(app(order({fulfilmentMethod:'collection'})).attrs()['data-delivery'],'hidden');
  assert.equal(app(order({})).attrs()['data-delivery'],'hidden','no choice and no charge: hidden, as in v245');
  assert.equal(app(order({freight:10})).attrs()['data-delivery'],'fields','a charge with no choice stays visible, as in v245');
  // A custom build in the same situation gets the new summary line.
  assert.equal(app(job({fulfilmentMethod:'collection',freight:10,packaging:2})).attrs()['data-delivery'],'summary');
});

test('Components: pricing never folds into one line, and Record Payment is not hidden by the paid-in-full rule',()=>{
  for(const extra of [{quoteStatus:'complete'},{quoteStatus:'active',issuedInvoice:{number:'INV-1',total:100,payments:[]}}]){
    const q=app(job({jobKind:'components',...extra}));
    assert.equal(q.attrs()['data-pricing-collapsible'],'false');
    assert.equal(q.attrs()['data-pricing-collapsed'],'false');
  }
  assert.match(layoutCss,/:not\(\[data-job-kind="components"\]\) #quoteRecordPaymentBtn/);
});
