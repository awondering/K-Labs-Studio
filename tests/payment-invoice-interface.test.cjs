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
    quote,elements,businessProfile:{businessName:'K-Labs'},
    $:id=>elements[id]||null,
    numberOrZero:value=>Number(value)||0,
    currencyWithCode:value=>`$${Number(value).toFixed(2)} NZD`,
    formatDateDisplay:value=>String(value).slice(0,10),
    localDateInputValue:()=>'2026-11-15',
    activeAccountKey:()=>'account-a',
    specificationValue:value=>String(value||'').trim(),
    customerSafeText:value=>value,
    customerAddressLines:()=>['A & B Street'],
    customerQuoteBusinessLines:()=>['GST Number: 123'],
    customerDocumentLabels:()=>({defaultRodName:'Custom Rod Build'}),
    quoteTaxAvailable:()=>true,activeTaxName:()=>'GST',
    escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    depositMaths:()=>{
      const amountReceived=quote.payments.reduce((sum,p)=>sum+p.amount,0);
      return {total:2500,gst:326.09,amountReceived,balanceOwing:Math.max(0,2500-amountReceived),
        depositPayment:quote.payments[0]||null,depositReceivedAmount:quote.payments[0]?.amount||0,
        depositReceivedDate:quote.payments[0]?.date||'',depositEnabled:false,depositOutstanding:false};
    },
  });
  vm.runInContext("let paymentFormBuildKey='';",context);
  for(const name of ['paymentHistoryMarkup','customerInvoicePreviewMarkup','closeDepositReceivedForm',
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
test('balance form is an unsaved preview and closes without writing',()=>{
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
  assert.match(html,/balance payment recording is not available/i);
  assert.doesNotMatch(html,/id="quoteBalanceReceivedSave"/);
});
test('invoice preview is escaped, clearly unissued, and includes only customer totals and payments',()=>{
  const {context,quote}=harness();
  const before=JSON.stringify(quote);
  const result=context.customerInvoicePreviewMarkup();
  assert.match(result,/PREVIEW ONLY — NOT AN ISSUED INVOICE/);
  assert.match(result,/&lt;script&gt;Customer&lt;\/script&gt;/);
  assert.match(result,/Rod &amp; reel/);
  assert.match(result,/unique-123/);
  assert.match(result,/GST included<\/dt><dd>\$326\.09 NZD/);
  assert.match(result,/Customer total<\/dt><dd>\$2500\.00 NZD/);
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
  assert.match(preview,/PAID IN FULL/);
  assert.doesNotMatch(preview,/GST included/);
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
test('print preview contains the marked customer-only document before frame insertion',()=>{
  const {context}=harness();
  const markup=context.customerInvoicePreviewMarkup();
  const frame={setAttribute(){},addEventListener(name,fn){this.onLoad=fn;},remove(){this.removed=true;}};
  let printed=false,focusRestored=false,afterPrint;
  frame.contentWindow={addEventListener(name,fn){afterPrint=fn;},focus(){},print(){printed=true;}};
  const sheet={hidden:false,querySelector(){return {focus(){focusRestored=true;}};}};
  context.$=id=>id==='invoicePreviewBody'?{innerHTML:markup}:id==='invoicePreviewSheet'?sheet:null;
  context.document={
    createElement:()=>frame,
    body:{appendChild(element){assert.match(element.srcdoc,/PREVIEW ONLY — NOT AN ISSUED INVOICE/);element.onLoad();}},
  };
  context.window={setTimeout(fn){fn();}};
  vm.runInContext(extract('printInvoicePreview'),context);
  context.printInvoicePreview();
  assert.equal(printed,true);
  assert.match(frame.srcdoc,/\$1219\.25 NZD/);
  assert.doesNotMatch(frame.srcdoc.split('</head>')[1],/profit|margin|labour|purchase cost/i);
  afterPrint();
  assert.equal(frame.removed,true);
  assert.equal(focusRestored,true);
});
