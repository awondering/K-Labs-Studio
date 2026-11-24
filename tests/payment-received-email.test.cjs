// Q39: the customer email for a confirmed rod build that is paid in full acknowledges the payment
// (subject "K-Labs — Payment Received in Full — Q-…"); every other email keeps its wording.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
// A configured currency other than the NZ default, so the test proves the email uses currencyWithCode.
const money=(v)=>`A$${Number(v).toFixed(2)} AUD`;
const profile={businessName:'K-Labs',contactName:'Kevin',phone:'027 000 0000',email:'k@example.test',paymentAccountName:'K-Labs Ltd',paymentAccountNumber:'12-3456'};

function draft({status='active',jobType='build',quote={},p=profile}={}){
  const q={customerName:'Bren Pine',email:'bren@example.test',quoteNumber:'Q-1001',buildName:'Rod',estimatedCompletionDate:'2026-12-01',components:[],payments:[],depositEnabled:false,jobType,...quote};
  const total=q.total??1000;
  const c={
    quote:q,businessProfile:p,studioSettings:{},window:{location:{href:''}},
    currentBuildLifecycleStatus:()=>status,
    runWithFulfilmentCheck:(f)=>f(),
    componentRowsForTotals:()=>[{unitPrice:1000}],numberOrZero:(v)=>Number(v)||0,buildLifecycleStatusKey:()=>status,
    depositMaths:()=>{
      const received=q.payments.reduce((s,x)=>s+x.amount,0);
      const dep=q.depositEnabled?200:0;
      return{total,depositEnabled:q.depositEnabled,depositAmount:dep,remainingBalance:total-dep,amountReceived:received,depositReceivedAmount:q.payments[0]?.amount||0,balanceOwing:Math.max(0,total-received),depositOutstanding:q.depositEnabled&&received<dep,depositStillRequired:Math.max(0,dep-received)};
    },
    customerIncludedParts:()=>['1 × Tip Top · Fuji'],
    specificationValue:(v)=>String(v==null?'':v).trim(),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
    currencyWithCode:money,
    deliveryAmounts:()=>({charge:0}),
    customerAddressLines:()=>['5 Customer Rd','Auckland'],
    businessProfileHasPaymentDetails:()=>!!(p.paymentAccountName&&p.paymentAccountNumber),
    formatCustomerEmailLongDate:(d)=>`D:${new Date(d).toISOString().slice(0,10)}`,
  };
  vm.createContext(c);
  vm.runInContext(['normalizeJobType','normalizeJobKind','isComponentsJob','quotePricePending','normalizeNewJobRequest','normalizeFulfilmentMethod','customerDeliveryAddressLines','customerFulfilmentSection','customerDocumentLabels','activeEmailIncludeSignature','customerEmailSignatureLines','normalizeCustomerMeasurements','isLikelyJunkCustomerText','customerRequestText','customerBuildNotesText','customerEmailLines','emailCurrentQuote'].map(fn).join('\n'),c);
  c.emailCurrentQuote();
  const href=c.window.location.href;
  const params=new URLSearchParams(href.slice(href.indexOf('?')+1));
  return{to:decodeURIComponent(href.slice(7,href.indexOf('?'))),subject:params.get('subject'),body:params.get('body')};
}
const FULL='Payment has been received in full.';

test('fully paid confirmed build: payment subject, statement, Total / Total received / Balance owing in the configured currency',()=>{
  const m=draft({quote:{depositEnabled:true,payments:[{amount:200},{amount:800}]}});
  assert.equal(m.subject,'K-Labs — Payment Received in Full — Q-1001');
  assert.ok(m.body.includes(FULL));
  assert.match(m.body,/Total: A\$1000\.00 AUD\nTotal received: A\$1000\.00 AUD\nBalance owing: A\$0\.00 AUD/);
  // Build reference and customer details stay.
  assert.match(m.body,/^Hi Bren,/);
  assert.match(m.body,/Custom Rod Build — Q-1001/);
  assert.equal(m.to,'bren@example.test');
  assert.ok(m.body.includes('1 × Tip Top · Fuji'));
  assert.ok(m.body.includes('5 Customer Rd'));
  assert.doesNotMatch(m.body,/has been confirmed|Deposit received|Deposit required|Payment Details|Bank account/);
});

test('one single full payment (no deposit) is also acknowledged',()=>{
  const m=draft({quote:{payments:[{amount:1000}]}});
  assert.equal(m.subject,'K-Labs — Payment Received in Full — Q-1001');
  assert.match(m.body,/Total received: A\$1000\.00 AUD\nBalance owing: A\$0\.00 AUD/);
});

test('unpaid confirmed build is unchanged: Build Confirmation',()=>{
  const m=draft({quote:{depositEnabled:true}});
  assert.equal(m.subject,'K-Labs Build Confirmation — Q-1001');
  assert.match(m.body,/has been confirmed\. Thank you for your order\./);
  assert.ok(!m.body.includes(FULL));
  assert.match(m.body,/Deposit required: A\$200\.00 AUD/);
  assert.match(m.body,/Bank account: 12-3456/);
});

test('part-paid confirmed build is unchanged: Build Confirmation with Deposit received and Balance owing',()=>{
  const m=draft({quote:{depositEnabled:true,payments:[{amount:200}]}});
  assert.equal(m.subject,'K-Labs Build Confirmation — Q-1001');
  assert.ok(!m.body.includes(FULL));
  assert.match(m.body,/Deposit received: A\$200\.00 AUD\nBalance owing: A\$800\.00 AUD/);
  assert.match(m.body,/Bank account: 12-3456/);
});

test('quote, completed build, repair and components emails are unchanged when fully paid',()=>{
  const paid={payments:[{amount:1000}]};
  assert.equal(draft({status:'quote',quote:paid}).subject,'K-Labs Custom Rod Build Quote — Q-1001');
  const done=draft({status:'complete',quote:paid});
  assert.equal(done.subject,'K-Labs Build Summary — Q-1001');
  assert.match(done.body,/Balance outstanding: A\$0\.00 AUD/);
  assert.equal(draft({jobType:'repair',quote:paid}).subject,'K-Labs Repair Confirmation — Q-1001');
  assert.equal(draft({quote:{...paid,jobKind:'components'}}).subject,'K-Labs Components Order Confirmation — Q-1001');
  for(const m of [done,draft({status:'quote',quote:paid}),draft({jobType:'repair',quote:paid}),draft({quote:{...paid,jobKind:'components'}})])assert.ok(!m.body.includes(FULL));
});

test('a zero-total build is not described as paid in full; no business name drops the prefix',()=>{
  assert.equal(draft({quote:{total:0,payments:[{amount:0}]}}).subject,'K-Labs Build Confirmation — Q-1001');
  const noName=draft({quote:{payments:[{amount:1000}]},p:{...profile,businessName:''}});
  assert.equal(noName.subject,'Payment Received in Full — Q-1001');
});
