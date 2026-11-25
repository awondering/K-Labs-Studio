const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,`Missing ${name}`);
  const next=source.indexOf('\nfunction ',start+1);
  return source.slice(start,next<0?source.length:next);
}
function harness(){
  const elements={};
  for(const id of ['quoteDepositReceivedStatus','quoteRecordPaymentBtn','quotePaymentFormTitle','quotePaymentRemoveBtn',
    'quotePaymentTotalReceived','quotePaymentBalanceOwing','quotePaymentBalanceLabel','quotePaymentHistory','quotePaymentHistoryDetails',
    'workshopPricingSection','quotePricingSummaryBtn','quotePricingSummaryValue','quoteBalanceReceivedError',
    'quoteBalanceReceivedForm','quoteBalanceReceivedAmount','quoteBalanceReceivedDate']){
    elements[id]={hidden:false,value:'',textContent:'',innerHTML:'',setAttribute(name,value){this[name]=value;},
      getAttribute(name){return this[name];},contains(){return false;},querySelector(){return null;}};
  }
  const quote={id:'unique-123',buildNumber:'BUILD-902',customerName:'<script>Customer</script>',buildName:'Rod & reel',
    includeGst:true,payments:[{id:'p1',type:'deposit',amount:1180.75,date:'2026-11-10'},{id:'p2',type:'balance',amount:100,date:'2026-11-12'}]};
  const context=vm.createContext({
    customerIncludedParts:()=>[],customerSafeText:(v)=>String(v==null?'':v),
    quote,elements,businessProfile:{businessName:'K-Labs',gstNumber:'123'},TextEncoder,
    window:{KLABS_ACCOUNT_ID:'account-a'},document:{querySelector:()=>null,querySelectorAll:()=>[]},currentBuildLifecycleStatus:()=>'active',
    CSS:{escape:String},currency:value=>`$${Number(value).toFixed(2)}`,rodPricingFigures:()=>({rodExclusive:2173.91}),
    $:id=>elements[id]||null,
    numberOrZero:value=>Number(value)||0,
    currencyWithCode:value=>`$${Number(value).toFixed(2)} NZD`,
    formatDateDisplay:value=>String(value).slice(0,10),
    localDateInputValue:()=>'2026-11-15',
    activeAccountKey:()=>'account-a',
    activeCurrencyCode:()=>'NZD',
    activeTaxRegistrationLabel:()=>'GST Number',
    roundMoney:value=>Math.round(value*100)/100,
    specificationValue:value=>String(value||'').trim(),
    customerSafeText:value=>value,
    normalizeNameKey:value=>String(value||'').trim().toLowerCase(),
    isBlankCategory:value=>String(value||'').toLowerCase()==='blank',
    pendingComponentDraftRows:new Set(),customerComponentExcludedFromCopy:()=>false,
    componentRowLibraryCategoryName:item=>item.category,savedComponentDisplayLabel:item=>item.description||item.category,
    customerAddressLines:()=>['A & B Street'],
    customerQuoteBusinessLines:()=>['GST Number: 123'],
    customerDocumentLabels:()=>({defaultRodName:'Custom Rod Build'}),
    quoteTaxAvailable:()=>true,activeTaxName:()=>'GST',
    escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    depositMaths:()=>{
      const amountReceived=quote.payments.reduce((sum,p)=>sum+p.amount,0);
      return {total:2500,gst:326.09,taxRate:15,amountReceived,balanceOwing:Math.max(0,2500-amountReceived),
        depositPayment:quote.payments[0]||null,depositReceivedAmount:quote.payments[0]?.amount||0,
        depositReceivedDate:quote.payments[0]?.date||'',depositEnabled:false,depositOutstanding:false};
    },
  });
  context.quoteMaths=()=>context.depositMaths();
  vm.runInContext("let paymentFormBuildKey='';let editingPaymentId='';let pricingSummaryOpen=false;",context);
  for(const name of ['paymentTypeLabel','paymentEntriesMarkup','paymentFormElement','paymentFormHome','placePaymentForm',
    'newPaymentType','updatePaymentFormTitle','openRecordPaymentForm','invoiceNumberForBuild','invoiceRodDescription','buildInvoiceSnapshot','issuedInvoiceForDisplay','roundMoney','numberOrZero','customerPaymentLabels','customerPaymentStatus','customerTaxName','customerTotalLabel','paidInFullAcknowledgement','invoiceDocumentMarkup','readableInvoiceNumberForJob','invoiceDisplayNumber','issuedInvoiceRecordsForReadableNumber','customerInvoicePreviewMarkup',
    'closeBalanceReceivedForm','updatePaymentBlock','syncPricingLayoutState','normalizeJobType','normalizeJobKind','isComponentsJob','quotePricePending','blockedByPendingPricing'])vm.runInContext(extract(name),context);
  return {context,elements,quote};
}

test('payment status displays all received payments and balance without changing records',()=>{
  const {context,elements,quote}=harness();
  const before=JSON.stringify(quote.payments);
  context.updatePaymentBlock();
  assert.equal(elements.quotePaymentTotalReceived.textContent,'$1280.75 NZD');
  assert.equal(elements.quotePaymentBalanceOwing.textContent,'$1219.25 NZD');
  // Pricing redesign: one tappable row per payment - type, date, amount - with no repeated heading.
  assert.match(elements.quotePaymentHistory.innerHTML,/data-edit-payment="p1"[^>]*>.*Deposit<\/span><span class="price-flow__payment-date">2026-11-10<\/span><strong>\$1180\.75<\/strong>/);
  assert.match(elements.quotePaymentHistory.innerHTML,/data-edit-payment="p2"[^>]*>.*Payment<\/span><span class="price-flow__payment-date">2026-11-12<\/span><strong>\$100\.00<\/strong>/);
  assert.equal(elements.quotePaymentHistoryDetails.hidden,false);
  assert.doesNotMatch(elements.quotePaymentHistory.innerHTML,/Payment history/);
  assert.equal(elements.quoteDepositReceivedStatus.textContent,'','the deposit is not repeated in a sentence');
  assert.equal(JSON.stringify(quote.payments),before);
});
test('Add payment opens with the balance owing and today, and closes without writing',()=>{
  const {context,elements,quote}=harness();
  const before=JSON.stringify(quote);
  context.openRecordPaymentForm();
  assert.equal(elements.quoteBalanceReceivedForm.hidden,false);
  assert.equal(elements.quoteBalanceReceivedAmount.value,'1219.25');
  assert.equal(elements.quotePaymentFormTitle.textContent,'New Payment');
  assert.equal(elements.quoteBalanceReceivedDate.value,'2026-11-15');
  elements.quoteBalanceReceivedAmount.value='10.00';
  context.closeBalanceReceivedForm();
  assert.equal(elements.quoteBalanceReceivedForm.hidden,true);
  assert.equal(elements.quoteBalanceReceivedAmount.value,'');
  assert.equal(JSON.stringify(quote),before);
  assert.doesNotMatch(html,/balance payment recording is not available/i);
  assert.match(html,/id="quoteBalanceReceivedSave"/);
});
test('invoice preview is escaped, clearly unissued, and includes only customer totals and payments',()=>{
  const {context,quote}=harness();
  const before=JSON.stringify(quote);
  const result=context.customerInvoicePreviewMarkup();
  assert.match(result,/DRAFT — NOT ISSUED/);
  assert.match(result,/&lt;script&gt;Customer&lt;\/script&gt;/);
  assert.match(result,/Rod &amp; reel/);
  assert.match(result,/BUILD-902/);
  assert.match(result,/GST \(15%\)<\/dt><dd>326\.09 NZD/);
  assert.match(result,/Total including GST<\/dt><dd>2500\.00 NZD/);
  assert.doesNotMatch(result,/Invoice number|Issue date/);
  assert.match(result,/2026-11-10/);
  assert.doesNotMatch(result,/profit|margin|labour|purchase cost/i);
  assert.equal(JSON.stringify(quote),before);
});
test('settled builds show paid in full; tax is omitted when not applicable',()=>{
  const {context,elements,quote}=harness();
  quote.payments.push({id:'p3',type:'balance',amount:1219.25,date:'2026-11-15'});
  quote.includeGst=false;
  context.updatePaymentBlock();
  assert.equal(elements.quotePaymentBalanceOwing.textContent,'Paid in full');
  assert.equal(elements.quotePaymentBalanceLabel.textContent,'Balance');
  const preview=context.customerInvoicePreviewMarkup();
  assert.match(preview,/Paid in full/);
  assert.doesNotMatch(preview,/GST/);
});
test('switching accounts closes and clears an unsaved balance form',()=>{
  const {context,elements}=harness();
  context.updatePaymentBlock();
  context.openRecordPaymentForm();
  elements.quoteBalanceReceivedAmount.value='12.34';
  context.activeAccountKey=()=>'account-b';
  context.updatePaymentBlock();
  assert.equal(elements.quoteBalanceReceivedForm.hidden,true);
  assert.equal(elements.quoteBalanceReceivedAmount.value,'');
});
test('invoice preview takes focus, closes with Escape and avoids duplicate modal locks',()=>{
  const {context}=harness();
  const listeners={};
  const body={scrollTop:42,innerHTML:''};
  let focused=false;
  const close={focus(){focused=true;}};
  const sheet={hidden:true,addEventListener(name,fn){listeners[name]=fn;},
    querySelector(selector){return selector==='.component-sheet__body'?body:close;}};
  let inserted=false,locks=0,unlocks=0;
  context.$=id=>id==='invoicePreviewSheet'?(inserted?sheet:null):id==='invoicePreviewBody'?body:null;
  context.document={activeElement:{},createElement:()=>sheet,body:{appendChild(){inserted=true;}}};
  context.window.addEventListener=()=>{};
  context.updateInvoicePreview=()=>{};
  context.refreshInvoicePreview=()=>{body.scrollTop=0;};
  context.lockModalLayer=()=>{locks++;};
  context.unlockModalLayer=()=>{unlocks++;};
  for(const name of ['normalizeJobType','normalizeJobKind','isComponentsJob','quotePricePending','blockedByPendingPricing'])vm.runInContext(extract(name),context);vm.runInContext(extract('openInvoicePreview'),context);
  context.openInvoicePreview();
  assert.equal(sheet.hidden,false);
  assert.equal(focused,true);
  assert.equal(body.scrollTop,0);
  context.openInvoicePreview();
  assert.equal(locks,1);
  let prevented=false;
  listeners.keydown({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(sheet.hidden,true);
  assert.equal(unlocks,1);
});
test('an issued customer document is printed using the shared stylesheet',()=>{
  const {context,quote}=harness();
  quote.issuedInvoice=context.buildInvoiceSnapshot();
  const markup=context.invoiceDocumentMarkup(quote.issuedInvoice,quote.issuedInvoice.payments,false);
  const frame={setAttribute(){},addEventListener(name,fn){this.onLoad=fn;},remove(){this.removed=true;}};
  let printed=false,focusRestored=false,afterPrint;
  frame.contentWindow={document:{querySelector(selector){return selector.startsWith('link')?{sheet:{}}:{complete:true,naturalWidth:128};}},
    addEventListener(name,fn){afterPrint=fn;},focus(){},print(){printed=true;}};
  const sheet={hidden:false,querySelector(){return {focus(){focusRestored=true;}};}};
  context.$=id=>id==='invoicePreviewBody'?{querySelector(){return {outerHTML:markup,querySelector(){return null;},getAttribute(name){return name==='data-invoice-issued'?'true':quote.issuedInvoice.number;}};}}:id==='invoicePreviewSheet'?sheet:null;
  context.document={
    baseURI:'https://example.test/studio/',
    createElement:()=>frame,
    body:{appendChild(element){assert.doesNotMatch(element.srcdoc,/DRAFT — NOT ISSUED/);element.onLoad();}},
  };
  context.window={setTimeout(fn){fn();}};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(printed,true);
  assert.match(frame.srcdoc,/1219\.25 NZD/);
  assert.match(frame.srcdoc,/css\/invoice-document\.css/);
  assert.doesNotMatch(frame.srcdoc.split('</head>')[1],/profit|margin|labour|purchase cost/i);
  afterPrint();
  assert.equal(frame.removed,true);
  assert.equal(focusRestored,true);
});
test('printing a draft preserves the warning without issuing or writing an invoice',()=>{
  const {context,quote}=harness();
  const before=JSON.stringify(quote);
  const markup=context.customerInvoicePreviewMarkup();
  const frame={setAttribute(){},addEventListener(name,fn){this.onLoad=fn;},remove(){}};
  let printed=false;
  frame.contentWindow={document:{querySelector(selector){return selector.startsWith('link')?{sheet:{}}:{complete:true,naturalWidth:128};}},
    addEventListener(){},focus(){},print(){printed=true;}};
  context.$=()=>({querySelector:()=>({outerHTML:markup,getAttribute:name=>name==='data-invoice-issued'?'false':'',querySelector:()=>({})})});
  context.document={baseURI:'https://example.test/',createElement:()=>frame,body:{appendChild(){frame.onLoad();}}};
  context.openInfoDialog=title=>{throw new Error(title);};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(printed,true);
  assert.match(frame.srcdoc,/DRAFT — NOT ISSUED/);
  assert.doesNotMatch(frame.srcdoc,/Invoice number|Issue date|INV-/);
  assert.equal(JSON.stringify(quote),before);
});
test('a stale draft cannot be printed after invoice issuance',()=>{
  const {context,quote}=harness();
  quote.issuedInvoice=context.buildInvoiceSnapshot();
  let title='';
  context.$=()=>({querySelector:()=>({getAttribute:()=>'false',querySelector:()=>({})})});
  context.openInfoDialog=value=>{title=value;};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(title,'Print Unavailable');
});
test('printing refuses an issued document that contains a draft warning',()=>{
  const {context,quote}=harness();
  quote.issuedInvoice=context.buildInvoiceSnapshot();
  let title='';
  context.$=()=>({querySelector:()=>({
    getAttribute:name=>name==='data-invoice-issued'?'true':quote.issuedInvoice.number,
    querySelector:()=>({}),
  })});
  context.openInfoDialog=value=>{title=value;};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(title,'Print Unavailable');
});
test('successful issuance immediately replaces the preview and enables printing',async()=>{
  const {context,quote}=harness();
  context.refreshInvoicePreview=()=>{};
  const issue={hidden:false},print={hidden:true},body={innerHTML:''};
  const sheet={querySelector(selector){return selector.includes('"issue"')?issue:print;}};
  context.$=id=>id==='invoicePreviewBody'?body:sheet;
  context.openConfirmDialog=(options,callback)=>{context.confirm=callback;};
  context.commitFinancialOperation=async(kind,data)=>{quote.issuedInvoice=data.invoice;};
  context.openInfoDialog=(title)=>{throw new Error(title);};
  for(const name of ['normalizeJobType','normalizeJobKind','isComponentsJob','quotePricePending','blockedByPendingPricing'])vm.runInContext(extract(name),context);vm.runInContext('async '+extract('issueCustomerInvoice'),context);
  await context.issueCustomerInvoice();
  await context.confirm('issue');
  assert.equal(issue.hidden,true);
  assert.equal(print.hidden,false);
  assert.match(body.innerHTML,/data-invoice-issued="true"/);
  assert.doesNotMatch(body.innerHTML,/DRAFT — NOT ISSUED/);
});
test('printing stops with an explicit error if the document stylesheet or logo fails',()=>{
  const {context,quote}=harness();
  quote.issuedInvoice=context.buildInvoiceSnapshot();
  const frame={setAttribute(){},addEventListener(name,fn){this.onLoad=fn;},remove(){this.removed=true;},
    contentWindow:{document:{querySelector(){return null;}}}};
  let title='',printed=false;
  frame.contentWindow.print=()=>{printed=true;};
  context.$=()=>({querySelector:()=>({outerHTML:'<article></article>',querySelector:()=>null,getAttribute:name=>name==='data-invoice-issued'?'true':quote.issuedInvoice.number})});
  context.document={baseURI:'https://example.test/',createElement:()=>frame,body:{appendChild(){frame.onLoad();}}};
  context.openInfoDialog=value=>{title=value;};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(title,'Print Unavailable');
  assert.equal(frame.removed,true);
  assert.equal(printed,false);
});
// Q41 live regression (BUILD-902): an invoice issued before a payment is recorded shows the job's current payments when
// reopened. What was issued (number, date, amount invoiced) stays fixed; the stored invoice is never rewritten.
test('an issued invoice shows payments recorded after it was issued; its number, date and amount stay as issued',()=>{
  const {context,quote}=harness();
  const paid=quote.payments;
  quote.payments=[];
  quote.issuedInvoice=Object.freeze({...context.buildInvoiceSnapshot(),number:'INV-ISSUED',issuedDate:'2026-11-20'});
  const stored=JSON.stringify(quote.issuedInvoice);
  quote.payments=[{id:'full',type:'balance',amount:2500,date:'2026-11-26'}];
  const shown=context.issuedInvoiceForDisplay();
  assert.equal(shown.number,'INV-ISSUED');
  assert.equal(shown.issuedDate,'2026-11-20');
  assert.equal(shown.total,2500);
  assert.deepEqual(JSON.parse(JSON.stringify(shown.payments)),[{id:'full',type:'balance',amount:2500,date:'2026-11-26'}]);
  const html=context.invoiceDocumentMarkup(shown,quote.payments,false);
  assert.match(html,/Paid in full/);
  assert.doesNotMatch(html,/Balance owing|No payments recorded/);
  assert.equal(JSON.stringify(quote.issuedInvoice),stored,'the stored invoice is unchanged');
  quote.payments=paid;
});
test('after a price change the issued invoice keeps the amount invoiced (and its tax); payments still update',()=>{
  const {context,quote}=harness();
  quote.issuedInvoice={...context.buildInvoiceSnapshot(),number:'INV-ISSUED',issuedDate:'2026-11-20',total:2000,
    tax:{name:'GST',rate:15,amount:260.87,registration:''},delivery:0};
  context.quoteMaths=()=>({total:2500});
  const shown=context.issuedInvoiceForDisplay();
  assert.equal(shown.total,2000);
  assert.equal(shown.tax.amount,260.87);
  assert.equal(shown.payments.length,quote.payments.length);
});
