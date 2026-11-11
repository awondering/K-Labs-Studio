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
  for(const id of ['quoteDepositReceivedStatus','quoteRecordDepositBtn','quoteDepositReceivedForm','quoteDepositReceivedError',
    'quotePaymentTotalReceived','quotePaymentBalanceOwing','quotePaymentHistory','quoteRecordBalanceBtn',
    'quoteBalanceReceivedForm','quoteBalanceReceivedAmount','quoteBalanceReceivedDate']){
    elements[id]={hidden:false,value:'',textContent:'',innerHTML:'',setAttribute(name,value){this[name]=value;}};
  }
  const quote={id:'unique-123',buildNumber:'BUILD-902',customerName:'<script>Customer</script>',buildName:'Rod & reel',
    includeGst:true,payments:[{id:'p1',type:'deposit',amount:1180.75,date:'2026-11-10'},{id:'p2',type:'balance',amount:100,date:'2026-11-12'}]};
  const context=vm.createContext({
    quote,elements,businessProfile:{businessName:'K-Labs',gstNumber:'123'},TextEncoder,
    window:{KLABS_ACCOUNT_ID:'account-a'},
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
  vm.runInContext("let paymentFormBuildKey='';",context);
  for(const name of ['paymentHistoryMarkup','invoiceNumberForBuild','invoiceRodDescription','buildInvoiceSnapshot','invoiceDocumentMarkup','customerInvoicePreviewMarkup','closeDepositReceivedForm',
    'closeBalanceReceivedForm','openBalanceReceivedForm','updatePaymentBlock'])vm.runInContext(extract(name),context);
  return {context,elements,quote};
}

test('payment status displays all received payments and balance without changing records',()=>{
  const {context,elements,quote}=harness();
  const before=JSON.stringify(quote.payments);
  context.updatePaymentBlock();
  assert.equal(elements.quotePaymentTotalReceived.textContent,'$1280.75 NZD');
  assert.equal(elements.quotePaymentBalanceOwing.textContent,'$1219.25 NZD');
  assert.match(elements.quotePaymentHistory.innerHTML,/Deposit: \$1180\.75 NZD.*2026-11-10/);
  assert.match(elements.quotePaymentHistory.innerHTML,/Balance: \$100\.00 NZD.*2026-11-12/);
  assert.equal(JSON.stringify(quote.payments),before);
});
test('balance form opens with the outstanding balance and closes without writing',()=>{
  const {context,elements,quote}=harness();
  const before=JSON.stringify(quote);
  context.openBalanceReceivedForm();
  assert.equal(elements.quoteBalanceReceivedAmount.max,'1219.25');
  assert.equal(elements.quoteBalanceReceivedAmount.value,'1219.25');
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
  assert.match(elements.quotePaymentBalanceOwing.textContent,/PAID IN FULL/);
  const preview=context.customerInvoicePreviewMarkup();
  assert.match(preview,/Paid in full/);
  assert.doesNotMatch(preview,/GST/);
});
test('switching accounts closes and clears an unsaved balance form',()=>{
  const {context,elements}=harness();
  context.updatePaymentBlock();
  context.openBalanceReceivedForm();
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
  context.lockModalLayer=()=>{locks++;};
  context.unlockModalLayer=()=>{unlocks++;};
  vm.runInContext(extract('openInvoicePreview'),context);
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
  context.$=id=>id==='invoicePreviewBody'?{querySelector(){return {outerHTML:markup,getAttribute(name){return name==='data-invoice-issued'?'true':quote.issuedInvoice.number;}};}}:id==='invoicePreviewSheet'?sheet:null;
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
  context.$=()=>({querySelector:()=>({outerHTML:markup,getAttribute:()=>'false',querySelector:()=>({})})});
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
  context.$=()=>({querySelector:()=>({getAttribute:()=>'false'})});
  context.openInfoDialog=value=>{title=value;};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(title,'Print Unavailable');
});
test('successful issuance immediately replaces the preview and enables printing',async()=>{
  const {context,quote}=harness();
  const issue={hidden:false},print={hidden:true},body={innerHTML:''};
  const sheet={querySelector(selector){return selector.includes('"issue"')?issue:print;}};
  context.$=id=>id==='invoicePreviewBody'?body:sheet;
  context.openConfirmDialog=(options,callback)=>{context.confirm=callback;};
  context.commitFinancialOperation=async(kind,data)=>{quote.issuedInvoice=data.invoice;};
  context.openInfoDialog=(title)=>{throw new Error(title);};
  vm.runInContext('async '+extract('issueCustomerInvoice'),context);
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
  context.$=()=>({querySelector:()=>({outerHTML:'<article></article>',getAttribute:name=>name==='data-invoice-issued'?'true':quote.issuedInvoice.number})});
  context.document={baseURI:'https://example.test/',createElement:()=>frame,body:{appendChild(){frame.onLoad();}}};
  context.openInfoDialog=value=>{title=value;};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(title,'Print Unavailable');
  assert.equal(frame.removed,true);
  assert.equal(printed,false);
});
