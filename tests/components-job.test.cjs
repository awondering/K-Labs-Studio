// Job 9: customer Components jobs with pricing pending. Runs the REAL ui.js functions (tests/helpers/job-record-loader.cjs).
// A Components job is jobType 'build' + jobKind 'components' (understood by every app version) and starts with pricePending.
// While pending: unknown prices are never shown as $0.00, documents say "To be confirmed", and no invoice or payment can be
// recorded. Confirm Pricing names any $0.00 Sell Prices first. Rod builds and repairs are unaffected. Synthetic data only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');

const plain=(v)=>v==null?v:JSON.parse(JSON.stringify(v));
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const tip=(extra={})=>({category:'Tip Top',description:'Tip 5.5',quantity:2,unitPrice:0,unitCost:3,cost:3,libraryComponentId:'comp-tip-55',...extra});
const componentsJob=(extra={})=>({id:'build-synthetic-supply',quoteNumber:'Q-2001',quoteStatus:'quote',customerName:'Synthetic Customer',
  jobType:'build',jobKind:'components',pricePending:true,components:[tip()],labourHours:0,payments:[],...extra});
const rodBuild=(extra={})=>({id:'build-synthetic-rod',quoteNumber:'Q-2002',quoteStatus:'quote',customerName:'Synthetic Customer',
  jobType:'build',components:[{category:'Guide',description:'Fuji ring',quantity:8,unitPrice:6,cost:3}],payments:[],...extra});

function app(env={}){
  const calls={confirm:[],info:[],saved:0,dirty:0,rendered:0,summary:0};
  const c=loadRecordFunctions(['normalizeQuote','quoteForPersistence','customerQuoteSummaryMarkup','customerEmailLines',
    'confirmQuotePricing','blockedByPendingPricing','componentSellPriceInputAttributes','zeroPricedComponentLabels','jobTypeLabel','isComponentsJob'],{
    Store:{get:(k,f)=>f,set:()=>true},window:{},businessProfile:{businessName:'Synthetic Rods'},
    currentBuildLifecycleStatus:()=>env.status||'quote',activeEmailIncludeSignature:()=>false,currentBusinessLogo:()=>'',
    openConfirmDialog:(spec,cb)=>{calls.confirm.push(spec);cb(env.answer||'confirm');},
    openInfoDialog:(title,message)=>calls.info.push({title,message}),
    saveQuoteCurrent:()=>{calls.saved+=1;},markQuoteDirty:()=>{calls.dirty+=1;},
    renderQuoteComponents:()=>{calls.rendered+=1;},updateQuoteSummary:()=>{calls.summary+=1;},
  });
  return {c,calls,open:(record)=>{c.quote=c.normalizeQuote(plain(record));return c.quote;}};
}
const saveAndReopen=(c,record)=>plain(c.normalizeQuote(plain(c.quoteForPersistence(c.normalizeQuote(plain(record))))));

// ---------- save, reopen and edit ----------
test('a Components job saves and reopens with its kind and pending pricing, and with no prices entered',()=>{
  const {c}=app();
  const saved=saveAndReopen(c,componentsJob());
  assert.equal(saved.jobType,'build','every app version understands the stored job type');
  assert.equal(saved.jobKind,'components');
  assert.equal(saved.pricePending,true);
  assert.equal(saved.components.filter((line)=>line.description).length,1,'the one recorded line (the form also keeps its usual blank draft line)');
  assert.equal(saved.components[0].quantity,2);
  assert.equal(saved.components[0].unitPrice,0);
});

test('quantities, components, prices, freight and notes can all be edited later; pricing stays pending until confirmed',()=>{
  const {c}=app();
  const first=saveAndReopen(c,componentsJob());
  const edited={...first,notes:'Customer will collect',freight:12,
    components:[{...first.components[0],quantity:3,unitPrice:9},tip({category:'Guide',description:'Fuji ring',libraryComponentId:'comp-guide-6',quantity:1})]};
  const again=saveAndReopen(c,edited);
  assert.equal(again.components[0].quantity,3);
  assert.equal(again.components[0].unitPrice,9);
  assert.equal(again.components[1].description,'Fuji ring');
  assert.equal(again.freight,12);
  assert.equal(again.notes,'Customer will collect');
  assert.equal(again.pricePending,true,'editing prices does not silently confirm them');
});

test('rod builds and repairs gain no new fields when saved (existing records unchanged)',()=>{
  const {c}=app();
  for(const record of [rodBuild(),rodBuild({jobType:'repair'})]){
    const saved=saveAndReopen(c,record);
    assert.equal('jobKind' in saved,false);
    assert.equal('pricePending' in saved,false);
  }
});

test('only the exact markers are kept: an unknown kind is dropped and only true means pending',()=>{
  const {c}=app();
  const odd=saveAndReopen(c,componentsJob({jobKind:'supplier-thing',pricePending:'yes'}));
  assert.equal('jobKind' in odd,false);
  assert.equal(odd.pricePending,false);
  assert.equal(c.isComponentsJob(saveAndReopen(c,componentsJob({jobType:'repair'}))),false,'a repair is never a Components job');
});

// ---------- unknown prices are never shown as $0.00 ----------
test('while pending, a $0 Sell Price is shown blank as "To be confirmed"; once confirmed it shows 0',()=>{
  const {c,open}=app();
  open(componentsJob());
  assert.equal(c.componentSellPriceInputAttributes(tip()),'value="" placeholder="To be confirmed"');
  assert.equal(c.componentSellPriceInputAttributes(tip({unitPrice:9})),'value="9"');
  open(componentsJob({pricePending:false}));
  assert.equal(c.componentSellPriceInputAttributes(tip()),'value="0"');
  open(rodBuild());
  assert.equal(c.componentSellPriceInputAttributes(tip()),'value="0"','rod builds unchanged');
});

test('lists and the job header show "Components" for a Components job; builds and repairs keep their labels',()=>{
  const {c}=app();
  assert.equal(c.jobTypeLabel('build','components'),'Components');
  assert.equal(c.jobTypeLabel('build'),'New Build');
  assert.equal(c.jobTypeLabel('repair'),'Repair / Refurbishment');
  assert.equal(c.jobTypeLabel('repair','components'),'Repair / Refurbishment');
});

// ---------- documents ----------
test('pending: the customer quote shows "To be confirmed" for the total, Components wording, and no rod or deposit amounts',()=>{
  const {c,open}=app();
  open(componentsJob({components:[tip({unitPrice:9})],depositEnabled:true,depositType:'percent',depositValue:50}));
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Total Price<\/span><strong>To be confirmed<\/strong>/);
  assert.doesNotMatch(doc,/Deposit Required|Balance Remaining/);
  assert.doesNotMatch(doc,/\$\d/,'no amount at all while pricing is pending');
  assert.match(doc,/<span>Components<\/span><ul><li>2 × Tip Top · Tip 5\.5<\/li><\/ul>/);
  assert.doesNotMatch(doc,/<span>Rod<\/span>|Custom Rod Build/);
});

test('pending: the email draft says "Total: To be confirmed", gives no deposit amounts and uses Components wording',()=>{
  const {c,open}=app();
  open(componentsJob({components:[tip({unitPrice:9})],depositEnabled:true,depositValue:50}));
  const text=c.customerEmailLines().join('\n');
  assert.match(text,/^Total: To be confirmed$/m);
  assert.doesNotMatch(text,/Deposit required|Balance remaining|Once the deposit has been received/);
  assert.doesNotMatch(text,/\$\d/);
  assert.match(text,/Components Order — Q-2001/);
  assert.match(text,/pricing will be confirmed shortly/);
  assert.doesNotMatch(text,/rod build/i);
});

test('confirmed: the same Components quote shows the real total',()=>{
  const {c,open}=app();
  open(componentsJob({pricePending:false,components:[tip({unitPrice:9})]}));
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Total Price<\/span><strong>\$\d+\.\d\d [A-Z]{3}<\/strong>/);
  assert.match(c.customerEmailLines().join('\n'),/^Total: \$\d+\.\d\d [A-Z]{3}$/m);
});

test('rod build documents are unchanged (wording, rod row and total)',()=>{
  const {c,open}=app();
  open(rodBuild());
  const doc=c.customerQuoteSummaryMarkup().replace(/\s+/g,' ');
  assert.match(doc,/<span>Rod<\/span>/);
  assert.match(doc,/<span>Total Price<\/span><strong>\$/);
  assert.doesNotMatch(doc,/To be confirmed<\/strong><\/div><\/div>/);
  assert.match(c.customerEmailLines().join('\n'),/Custom Rod Build — Q-2002/);
});

// ---------- Confirm Pricing ----------
test('Confirm Pricing names every remaining $0.00 Sell Price before clearing pending',()=>{
  const {c,calls,open}=app();
  open(componentsJob({components:[tip(),tip({category:'Guide',description:'Fuji ring',libraryComponentId:'comp-guide-6',unitPrice:7})]}));
  c.confirmQuotePricing();
  assert.equal(calls.confirm.length,1);
  assert.match(calls.confirm[0].message,/Tip Top/);
  assert.doesNotMatch(calls.confirm[0].message,/Fuji ring/,'priced lines are not listed');
  assert.match(calls.confirm[0].message,/deliberately \$0\.00/);
  assert.equal(c.quote.pricePending,false);
  assert.ok(calls.saved>0 && calls.dirty>0 && calls.rendered>0,'saved, synced as an edit and re-shown');
});

test('cancelling Confirm Pricing leaves pricing pending',()=>{
  const {c,open}=app({answer:'cancel'});
  open(componentsJob());
  c.confirmQuotePricing();
  assert.equal(c.quote.pricePending,true);
});

test('Confirm Pricing with every line priced asks once and clears pending',()=>{
  const {c,calls,open}=app();
  open(componentsJob({components:[tip({unitPrice:9})]}));
  c.confirmQuotePricing();
  assert.doesNotMatch(calls.confirm[0].message,/\$0\.00/);
  assert.equal(c.quote.pricePending,false);
});

test('markup: one Confirm Pricing control in the existing Pricing section, hidden until needed, using existing classes',()=>{
  const pricing=html.slice(html.indexOf('id="workshopPricingSection"'),html.indexOf('id="quoteRecordDepositBtn"'));
  assert.equal((html.match(/id="confirmPricingBtn"/g)||[]).length,1);
  assert.match(pricing,/<div id="quotePricePendingBlock" class="quote-grid__full quote-price-pending" hidden><p class="quote-gst-status">[^<]+<\/p><button id="confirmPricingBtn" class="ghost-action" type="button">Confirm Pricing<\/button><\/div>/);
});

// ---------- invoices and payments ----------
test('while pending, invoices, deposits and balance payments are refused with an explanation',()=>{
  const {c,calls,open}=app();
  open(componentsJob());
  assert.equal(c.blockedByPendingPricing('issuing an invoice'),true);
  assert.equal(calls.info[0].title,'Pricing To Be Confirmed');
  for(const name of ['openDepositReceivedForm','openBalanceReceivedForm','issueCustomerInvoice','openInvoicePreview']){
    const start=source.indexOf(`function ${name}(`);
    const head=source.slice(start,source.indexOf('\n',source.indexOf('\n',start)+1)+200);
    assert.match(head,/blockedByPendingPricing\(/,`${name} checks pending pricing first`);
  }
});

test('ordinary rod builds, repairs and confirmed Components jobs are never blocked (deposits keep working)',()=>{
  const {c,calls,open}=app();
  for(const record of [rodBuild(),rodBuild({jobType:'repair'}),componentsJob({pricePending:false})]){
    open(record);
    assert.equal(c.blockedByPendingPricing('recording a deposit'),false);
  }
  assert.equal(calls.info.length,0);
});

test('the financial operation itself refuses a pending job (backstop) and is unchanged otherwise',async()=>{
  const start=source.indexOf('async function commitFinancialOperation(');
  const body=source.slice(start,source.indexOf('\n}',start)+2);
  const run=async(record)=>{
    const ctx={quote:record,financialOperationInFlight:false,window:{navigator:{onLine:false}}};
    vm.createContext(ctx);
    vm.runInContext(`${source.slice(source.indexOf('function quotePricePending('),source.indexOf('\n}',source.indexOf('function quotePricePending('))+2)}\n${body}`,ctx);
    try{await ctx.commitFinancialOperation('add_payment',{});}catch(error){return error.message;}
    return 'no error';
  };
  assert.match(await run(componentsJob()),/Confirm Pricing/);
  assert.match(await run(rodBuild()),/Connect to record payments/,'a rod build reaches the existing checks as before');
});
