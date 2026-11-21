// Job 9: customer Components jobs. Runs the REAL ui.js functions (tests/helpers/job-record-loader.cjs). Synthetic data only.
// A Components job is jobType 'build' + jobKind 'components' (understood by every app version).
// - Total = Sell Price x quantity for each component + delivery, with the job's existing tax handling. No labour,
//   Required Profit, Margin or stored price adjustment ever reaches it.
// - Pricing is to be confirmed (worked out, no extra step) while a Quote-stage job has no components or a $0.00 line.
//   Confirm Order (the existing Confirm Build step) names any $0.00 line as supplied at no charge.
// - While pending: no amount, deposit, bank details, invoice or payment; documents read as an enquiry.
// Rod builds and repairs are unaffected.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');

const plain=(v)=>v==null?v:JSON.parse(JSON.stringify(v));
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
const tip=(extra={})=>({category:'Tip Top',description:'Tip 5.5',quantity:2,unitPrice:0,unitCost:3,cost:3,libraryComponentId:'comp-tip-55',...extra});
const guide=(extra={})=>({category:'Guide',description:'Fuji ring',quantity:1,unitPrice:7,unitCost:2,cost:2,libraryComponentId:'comp-guide-6',...extra});
const componentsJob=(extra={})=>({id:'build-synthetic-supply',quoteNumber:'Q-2001',quoteStatus:'quote',customerName:'Synthetic Customer',
  jobType:'build',jobKind:'components',pricePending:true,components:[tip()],labourHours:0,payments:[],...extra});
const rodBuild=(extra={})=>({id:'build-synthetic-rod',quoteNumber:'Q-2002',quoteStatus:'quote',customerName:'Synthetic Customer',
  jobType:'build',components:[{category:'Guide',description:'Fuji ring',quantity:8,unitPrice:6,cost:3}],payments:[],...extra});
const BANK={businessName:'Synthetic Rods',paymentAccountName:'Synthetic Rods Ltd',paymentAccountNumber:'00-0000-0000000-00'};

function app(env={}){
  const calls={confirm:[],info:[],lifecycle:[]};
  const c=loadRecordFunctions(['normalizeQuote','quoteForPersistence','customerQuoteSummaryMarkup','customerEmailLines','customerDocumentLabels',
    'quoteMaths','quotePricePending','blockedByPendingPricing','componentSellPriceInputAttributes','jobTypeLabel','isComponentsJob',
    'zeroPricedComponentLabels','currency','saveBuildLifecycleStatusBySource'],{
    Store:{get:(k,f)=>env.records||f,set:(k,v)=>{env.records=v;return true;}},window:{},buildsStorageKey:()=>'builds',
    businessProfile:env.bank?BANK:{businessName:'Synthetic Rods'},
    activeTaxEnabled:()=>env.tax!==false,
    currentBuildLifecycleStatus:()=>c.quote?c.quote.quoteStatus||'quote':'quote',activeEmailIncludeSignature:()=>false,currentBusinessLogo:()=>'',
    openConfirmDialog:(spec,cb)=>{calls.confirm.push(spec);return cb(env.answer||'confirm');},
    openInfoDialog:(title,message)=>calls.info.push({title,message}),
    hasUnsavedQuoteChanges:false,persistCurrentQuoteRecord:async()=>true,
    setCurrentBuildLifecycle:async(next,options)=>{calls.lifecycle.push({next,message:options&&options.message});return true;},
  });
  // The loader reads plain functions; the async Confirm step is loaded from ui.js directly.
  const at=source.indexOf('async function confirmCurrentBuildAsActive(');
  vm.runInContext(source.slice(at,source.indexOf('\n}',at)+2),c);
  return {c,calls,open:(record)=>{c.quote=c.normalizeQuote(plain(record));return c.quote;}};
}
const saveAndReopen=(c,record)=>plain(c.normalizeQuote(plain(c.quoteForPersistence(c.normalizeQuote(plain(record))))));
const money=(v)=>Math.round(v*100)/100;

// ---------- save, reopen and edit ----------
test('a Components job saves and reopens with its kind, and with no prices entered',()=>{
  const {c}=app();
  const saved=saveAndReopen(c,componentsJob());
  assert.equal(saved.jobType,'build','every app version understands the stored job type');
  assert.equal(saved.jobKind,'components');
  assert.equal(saved.components.filter((line)=>line.description).length,1,'the one recorded line (the form also keeps its usual blank draft line)');
  assert.equal(saved.components[0].quantity,2);
  assert.equal(saved.components[0].unitPrice,0);
});

test('quantities, components, prices, delivery and notes can all be edited later, at any stage',()=>{
  const {c}=app();
  for(const quoteStatus of ['quote','active','complete']){
    const first=saveAndReopen(c,componentsJob({quoteStatus}));
    const again=saveAndReopen(c,{...first,notes:'Customer will collect',freight:12,fulfilmentMethod:'shipping',
      components:[{...first.components[0],quantity:3,unitPrice:9},guide()]});
    assert.equal(again.components[0].quantity,3,quoteStatus);
    assert.equal(again.components[0].unitPrice,9);
    assert.equal(again.components[1].description,'Fuji ring');
    assert.equal(again.freight,12);
    assert.equal(again.notes,'Customer will collect');
    assert.equal(again.quoteStatus,quoteStatus);
  }
});

test('rod builds and repairs gain no new fields when saved (existing records unchanged)',()=>{
  const {c}=app();
  for(const record of [rodBuild(),rodBuild({jobType:'repair'})]){
    const saved=saveAndReopen(c,record);
    assert.equal('jobKind' in saved,false);
    assert.equal('pricePending' in saved,false);
  }
});

test('only the exact kind marker is kept: an unknown kind is dropped, and a repair is never a Components job',()=>{
  const {c}=app();
  const odd=saveAndReopen(c,componentsJob({jobKind:'supplier-thing',pricePending:'yes'}));
  assert.equal('jobKind' in odd,false);
  assert.equal(odd.pricePending,false);
  assert.equal(c.isComponentsJob(saveAndReopen(c,componentsJob({jobType:'repair'}))),false);
});

// ---------- the customer total ----------
test('total = Sell Price x quantity + delivery, with tax on: delivery cost is grossed up and tax is included in the total',()=>{
  const {c,open}=app();
  open(componentsJob({components:[tip({unitPrice:9}),guide()],fulfilmentMethod:'shipping',deliveryEntryMode:'breakdown',freight:10,packaging:2}));
  const math=c.quoteMaths();
  // 2 x 9 + 1 x 7 = 25 (Sell Prices include tax, as for every job); delivery cost 12 -> 13.80 with 15% tax.
  assert.equal(math.total,38.8);
  assert.equal(money(math.gst),money(38.8*15/115));
  assert.equal(c.quote.finalCustomerPrice,38.8,'the saved price is the same total');
});

test('tax off in Settings: the same lines and delivery, no tax added or shown',()=>{
  const {c,open}=app({tax:false});
  open(componentsJob({components:[tip({unitPrice:9}),guide()],deliveryEntryMode:'breakdown',freight:10,packaging:2}));
  const math=c.quoteMaths();
  assert.equal(math.total,37);
  assert.equal(math.gst,0);
});

test('Include Tax unticked on the job: no tax, delivery at cost (the existing per-job control)',()=>{
  const {c,open}=app();
  open(componentsJob({components:[tip({unitPrice:9}),guide()],deliveryEntryMode:'breakdown',freight:10,packaging:2,includeGst:false}));
  const math=c.quoteMaths();
  assert.equal(math.total,37);
  assert.equal(math.gst,0);
});

test('labour, Required Profit, Margin and any stored price adjustment never reach a Components total',()=>{
  const {c,open}=app();
  const legacy={components:[tip({unitPrice:9}),guide()],labourRate:60,labourHours:2,priceAdjustment:307.5};
  for(const pricing of [{pricingDriver:'price'},{pricingDriver:'profit',targetProfit:300},{pricingDriver:'margin',marginPercent:60}]){
    open(componentsJob({...legacy,...pricing}));
    assert.equal(c.quoteMaths().total,25,pricing.pricingDriver);
    assert.equal(c.quote.priceAdjustment,0);
  }
});

test('rod build pricing is unchanged: labour and the stored price adjustment still apply',()=>{
  const {c,open}=app();
  open(rodBuild({components:[tip({unitPrice:9}),guide()],labourRate:60,labourHours:2,pricingDriver:'price',priceAdjustment:10}));
  assert.equal(c.quoteMaths().total,25+120+10);
  open(rodBuild({jobType:'repair',components:[guide()],labourRate:60,labourHours:1,pricingDriver:'price',priceAdjustment:0}));
  assert.equal(c.quoteMaths().total,67);
});

// ---------- pending: worked out, no extra step ----------
test('pending while a Quote has no components or a $0.00 line; fully priced needs no confirmation step',()=>{
  const {c,open}=app();
  open(componentsJob({components:[]}));
  assert.equal(c.quotePricePending(),true,'nothing added yet');
  open(componentsJob({components:[tip(),guide()]}));
  assert.equal(c.quotePricePending(),true,'one line still at $0.00');
  open(componentsJob({components:[tip({unitPrice:9}),guide()]}));
  assert.equal(c.quotePricePending(),false,'every line priced: the total is known');
  c.quoteMaths();
  assert.equal(c.quote.pricePending,false,'the stored marker follows, for v244 devices');
  c.quote.components[0].unitPrice=0;
  c.quoteMaths();
  assert.equal(c.quote.pricePending,true,'clearing a price makes it unknown again');
});

test('after Confirm Order a $0.00 line is genuine; a v244 job confirmed while pending stays pending until priced',()=>{
  const {c,open}=app();
  open(componentsJob({quoteStatus:'active',pricePending:false}));
  assert.equal(c.quotePricePending(),false,'confirmed as supplied at no charge');
  assert.equal(c.quoteMaths().total,0);
  open(componentsJob({quoteStatus:'active',pricePending:true}));
  assert.equal(c.quotePricePending(),true);
  c.quote.components[0].unitPrice=9;
  assert.equal(c.quotePricePending(),false);
  c.quoteMaths();
  assert.equal(c.quote.pricePending,false);
});

test('rod builds and repairs are never pending, even with a $0.00 line or a stray marker',()=>{
  const {c,open}=app();
  for(const record of [rodBuild({components:[tip()]}),rodBuild({jobType:'repair',components:[tip()]}),rodBuild({pricePending:true})]){
    open(record);
    assert.equal(c.quotePricePending(),false);
  }
});

test('while pending a $0 Sell Price is shown blank as "To be confirmed"; otherwise it shows the price',()=>{
  const {c,open}=app();
  open(componentsJob());
  assert.equal(c.componentSellPriceInputAttributes(tip()),'value="" placeholder="To be confirmed"');
  assert.equal(c.componentSellPriceInputAttributes(tip({unitPrice:9})),'value="9"');
  open(componentsJob({quoteStatus:'active',pricePending:false}));
  assert.equal(c.componentSellPriceInputAttributes(tip()),'value="0"');
  open(rodBuild());
  assert.equal(c.componentSellPriceInputAttributes(tip()),'value="0"','rod builds unchanged');
});

test('lists and the job header show "Components"; builds and repairs keep their labels',()=>{
  const {c}=app();
  assert.equal(c.jobTypeLabel('build','components'),'Components');
  assert.equal(c.jobTypeLabel('build'),'New Build');
  assert.equal(c.jobTypeLabel('repair'),'Repair / Refurbishment');
  assert.equal(c.jobTypeLabel('repair','components'),'Repair / Refurbishment');
});

// ---------- Confirm Order ----------
test('Confirm Order names each $0.00 line as supplied at no charge, then confirms the order',async()=>{
  const {c,calls,open}=app();
  open(componentsJob({components:[tip(),guide()]}));
  await c.confirmCurrentBuildAsActive();
  assert.equal(calls.confirm[0].title,'Confirm Order');
  assert.match(calls.confirm[0].message,/Supplied at no charge \(\$0\.00\): Tip Top/);
  assert.doesNotMatch(calls.confirm[0].message,/Fuji ring/,'priced lines are not listed');
  assert.deepEqual(calls.lifecycle,[{next:'active',message:'Order confirmed — now Active'}]);
});

test('Confirm Order with every line priced asks once, plainly; cancelling changes nothing',async()=>{
  const priced=app();
  priced.open(componentsJob({components:[tip({unitPrice:9})]}));
  await priced.c.confirmCurrentBuildAsActive();
  assert.equal(priced.calls.confirm[0].message,'Confirm this order?');
  const cancelled=app({answer:'cancel'});
  cancelled.open(componentsJob());
  await cancelled.c.confirmCurrentBuildAsActive();
  assert.deepEqual(cancelled.calls.lifecycle,[]);
});

test('an order with no components cannot be confirmed',async()=>{
  const {c,calls,open}=app();
  open(componentsJob({components:[]}));
  await c.confirmCurrentBuildAsActive();
  assert.equal(calls.confirm.length,0);
  assert.match(calls.info[0].message,/Add the components/);
  assert.deepEqual(calls.lifecycle,[]);
});

test('rod builds keep the unchanged Confirm Build step',async()=>{
  const {c,calls,open}=app();
  open(rodBuild());
  await c.confirmCurrentBuildAsActive();
  assert.equal(calls.confirm[0].title,'Confirm Build');
  assert.equal(calls.confirm[0].message,'Confirm this quote as an active build?');
  assert.deepEqual(calls.lifecycle,[{next:'active',message:'Build confirmed — now Active'}]);
});

test('confirming saves the cleared marker with the status change (Components Quote -> Active only)',()=>{
  const env={records:[componentsJob(),rodBuild({pricePending:true}),componentsJob({quoteStatus:'active'})]};
  const {c}=app(env);
  assert.equal(c.saveBuildLifecycleStatusBySource('build',0,'active'),true);
  assert.equal(env.records[0].quoteStatus,'active');
  assert.equal(env.records[0].pricePending,false);
  c.saveBuildLifecycleStatusBySource('build',1,'active');
  assert.equal(env.records[1].pricePending,true,'rod builds untouched');
  c.saveBuildLifecycleStatusBySource('build',2,'complete');
  assert.equal(env.records[2].pricePending,true,'only the Quote -> Active confirmation clears it');
});

// ---------- documents ----------
test('pending: an Enquiry with "To be confirmed", no amounts, no deposit and no bank details',()=>{
  const {c,open}=app({bank:true});
  open(componentsJob({components:[tip(),guide()],depositEnabled:true,depositType:'percent',depositValue:50}));
  assert.equal(c.customerDocumentLabels().title,'Components Enquiry');
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Total Price<\/span><strong>To be confirmed<\/strong>/);
  assert.doesNotMatch(doc,/Deposit|Balance Remaining|Payment Details|00-0000/);
  assert.doesNotMatch(doc,/\$\d/,'no amount at all while pricing is pending');
  assert.match(doc,/We will confirm pricing shortly/);
  assert.doesNotMatch(doc,/<span>Rod<\/span>|Custom Rod Build/);
});

test('pending: the email draft gives no total, deposit or bank details, and says pricing will follow',()=>{
  const {c,open}=app({bank:true});
  open(componentsJob({components:[tip(),guide()],depositEnabled:true,depositValue:50}));
  const text=c.customerEmailLines().join('\n');
  assert.match(text,/^Total: To be confirmed$/m);
  assert.doesNotMatch(text,/Deposit|Balance remaining|Payment Details|Bank account|00-0000/);
  assert.doesNotMatch(text,/\$\d/);
  assert.match(text,/pricing will be confirmed shortly/);
  assert.doesNotMatch(text,/rod build/i);
});

test('priced quote: the real total and no deposit wording, even if an old deposit setting is stored',()=>{
  const {c,open}=app({bank:true});
  open(componentsJob({components:[tip({unitPrice:9}),guide()],depositEnabled:true,depositValue:50}));
  assert.equal(c.customerDocumentLabels().title,'Components Quote');
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Total Price<\/span><strong>\$25\.00 [A-Z]{3}<\/strong>/);
  assert.doesNotMatch(doc,/Deposit/);
  const text=c.customerEmailLines().join('\n');
  assert.match(text,/^Total: \$25\.00 [A-Z]{3}$/m);
  assert.doesNotMatch(text,/Deposit required|Balance remaining|Once the deposit has been received/);
});

test('confirmed order: an Order Confirmation with the real total, including a genuine $0.00 line',()=>{
  const {c,open}=app();
  open(componentsJob({quoteStatus:'active',pricePending:false,components:[tip(),guide()]}));
  assert.equal(c.customerDocumentLabels().title,'Order Confirmation');
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Total Price<\/span><strong>\$7\.00 [A-Z]{3}<\/strong>/);
  assert.doesNotMatch(doc,/Total Price<\/span><strong>To be confirmed/);
});

test('rod build and repair documents are unchanged (wording, rod row, deposit lines and total)',()=>{
  const {c,open}=app();
  // Priced, with a deposit required: since v249 a quote with no deposit required omits the deposit lines (tests/quote-email-deposit).
  const withDeposit={priceAdjustment:0,depositEnabled:true,depositType:'percent',depositValue:30};
  open(rodBuild(withDeposit));
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Rod<\/span>/);
  assert.match(doc,/<span>Total Price<\/span><strong>\$/);
  const text=c.customerEmailLines().join('\n');
  assert.match(text,/Custom Rod Build — Q-2002/);
  assert.match(text,/Deposit required: /);
  assert.match(text,/Once the deposit has been received, your build will be confirmed/);
  open(rodBuild({...withDeposit,jobType:'repair'}));
  assert.match(c.customerEmailLines().join('\n'),/Once the deposit has been received, your repair will be confirmed/);
  assert.equal(c.customerDocumentLabels().title,'Repair Quote');
});

// ---------- invoices and payments ----------
test('while pending, invoices, deposits and balance payments are refused with an explanation',()=>{
  const {c,calls,open}=app();
  open(componentsJob());
  assert.equal(c.blockedByPendingPricing('issuing an invoice'),true);
  assert.equal(calls.info[0].title,'Pricing To Be Confirmed');
  assert.match(calls.info[0].message,/Add a Sell Price to every component, then Confirm Order, before issuing an invoice/);
  for(const name of ['openDepositReceivedForm','openBalanceReceivedForm','issueCustomerInvoice','openInvoicePreview']){
    const start=source.indexOf(`function ${name}(`);
    const head=source.slice(start,source.indexOf('\n',source.indexOf('\n',start)+1)+200);
    assert.match(head,/blockedByPendingPricing\(/,`${name} checks pending pricing first`);
  }
});

test('rod builds, repairs, priced and confirmed Components jobs are never blocked',()=>{
  const {c,calls,open}=app();
  for(const record of [rodBuild(),rodBuild({jobType:'repair'}),componentsJob({components:[tip({unitPrice:9})]}),componentsJob({quoteStatus:'active',pricePending:false})]){
    open(record);
    assert.equal(c.blockedByPendingPricing('recording a payment'),false);
  }
  assert.equal(calls.info.length,0);
});

test('the financial operation itself refuses a pending job (backstop) and is unchanged otherwise',async()=>{
  const start=source.indexOf('async function commitFinancialOperation(');
  const body=source.slice(start,source.indexOf('\n}',start)+2);
  const run=async(record,pending)=>{
    const ctx={quote:record,financialOperationInFlight:false,window:{navigator:{onLine:false}},quotePricePending:()=>pending};
    vm.createContext(ctx);
    vm.runInContext(body,ctx);
    try{await ctx.commitFinancialOperation('add_payment',{});}catch(error){return error.message;}
    return 'no error';
  };
  assert.match(await run(componentsJob(),true),/Pricing to be confirmed/);
  assert.match(await run(rodBuild(),false),/Connect to record payments/,'a rod build reaches the existing checks as before');
});

// ---------- markup and layout (Components only) ----------
test('markup: no separate Confirm Pricing control remains',()=>{
  assert.doesNotMatch(html,/confirmPricingBtn|quotePricePendingBlock|Confirm Pricing/);
  assert.doesNotMatch(source,/confirmQuotePricing|confirmPricingBtn/);
});

test('every new hiding rule applies only to Components jobs, so rod builds and repairs look exactly as before',()=>{
  const start=css.indexOf('/* Components job pricing:');
  const block=css.slice(start,css.indexOf('/* Build Details, Repair / Refurbishment:',start));
  const rules=block.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map((r)=>r.trim()).filter(Boolean);
  assert.equal(rules.length,2);
  for(const rule of rules){
    for(const selector of rule.slice(0,rule.indexOf('{')).split(/,(?![^(]*\))/)){
      assert.match(selector.trim(),/^#workshopPricingSection\[data-job-kind="components"\]/,selector);
    }
    assert.match(rule,/\{display:none$/);
  }
  for(const id of ['quoteLabourRateField','quoteProfitField','quoteMarginPercentField','quoteEarningsSummary','quoteCostBeforeMarginField','quoteDepositEnabledField','quoteTaxRateField'])
    assert.match(block,new RegExp(`#${id}\\b`),id);
  for(const id of ['quoteIncludeGstField','quoteGstField','quoteTotalField','quoteFulfilmentGroup','viewQuoteBtn','emailQuoteBtn','quoteRecordPaymentBtn','confirmBuildBtn'])
    assert.doesNotMatch(block,new RegExp(`#${id}\\b`),`${id} stays visible`);
});

test('the Pricing section is marked with the job kind, stage and delivery choice; labels follow the job kind',()=>{
  const fn=(name)=>{const at=source.indexOf(`function ${name}(`);return source.slice(at,source.indexOf('\n}',at)+2);};
  const els={};
  const el=(id)=>els[id]||(els[id]={id,attrs:{},hidden:false,textContent:'',setAttribute(k,v){this.attrs[k]=String(v);},classList:{toggle(){}}});
  const ctx={$:el,document:{querySelector:(q)=>q.includes('data-current-build-action="delete"')?el('deleteItem'):null,querySelectorAll:()=>[]},quote:null,
    buildLifecycleStatusKey:(r)=>r.quoteStatus,buildLifecycleLabel:(k)=>k,customerDocumentLabels:()=>({viewLabel:'View'}),
    normalizeJobType:(v)=>v==='repair'?'repair':'build',normalizeJobKind:(v)=>v==='components'?'components':'',
    normalizeFulfilmentMethod:(v)=>v==='shipping'||v==='collection'?v:'',deliveryAmounts:(q)=>({charge:Number(q.freight)||0}),fulfilmentStudioNote:()=>'',
    quoteTaxAvailable:()=>true,activeTaxName:()=>'GST',currencyWithCode:(v)=>`$${Number(v).toFixed(2)} NZD`,pricingSummaryOpen:false,deliveryEditOpen:false};
  vm.createContext(ctx);
  vm.runInContext(['isComponentsJob','deletionNoun','currentBuildLifecycleStatus','updateWorkshopBuildActionsUi','syncFulfilmentSelector','syncPricingLayoutState'].map(fn).join('\n'),ctx);
  const section=()=>el('workshopPricingSection').attrs;
  ctx.quote={jobType:'build',jobKind:'components',quoteStatus:'quote',payments:[]};
  ctx.updateWorkshopBuildActionsUi();ctx.syncFulfilmentSelector();
  assert.equal(section()['data-job-kind'],'components');
  assert.equal(section()['data-lifecycle'],'quote');
  assert.equal(el('quoteDeliveryFields').hidden,true,'Components: delivery fields wait for a fulfilment choice');
  assert.equal(el('confirmBuildBtn').textContent,'Confirm Order');
  assert.equal(el('deleteItem').textContent,'Delete Order');
  ctx.quote={...ctx.quote,fulfilmentMethod:'shipping'};ctx.syncFulfilmentSelector();
  assert.equal(el('quoteDeliveryFields').hidden,false,'Courier / Shipping reveals freight and packaging');
  ctx.quote={...ctx.quote,fulfilmentMethod:'collection',freight:5};ctx.syncFulfilmentSelector();
  assert.equal(el('quoteDeliveryFields').hidden,true,'Collection hides saved shipping costs');
  ctx.quote={jobType:'build',quoteStatus:'active',payments:[{amount:1}]};
  ctx.updateWorkshopBuildActionsUi();
  assert.equal(section()['data-job-kind'],'','rod build: no Components rules apply');
  assert.equal(el('confirmBuildBtn').textContent,'Confirm Build');
  assert.equal(el('deleteItem').textContent,'Delete Build');
  ctx.quote={jobType:'repair',quoteStatus:'quote',payments:[]};
  ctx.updateWorkshopBuildActionsUi();
  assert.equal(el('deleteItem').textContent,'Delete Repair','repair: ••• says Delete Repair');
});
