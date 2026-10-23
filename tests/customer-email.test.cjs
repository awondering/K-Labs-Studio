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

const money=(v)=>`$${Number(v).toFixed(2)}`;
const profile={businessName:'K-Labs',contactName:'Kevin',phone:'027 000 0000',email:'k@example.test',website:'www.example.test',addressLine1:'1 Secret St',cityTown:'Town',paymentAccountName:'K-Labs Ltd',paymentAccountNumber:'12-3456-7890123-00'};

function build({status='quote',quote={},profile:p=profile}={}){
  const q={customerName:'Bren Pine',quoteNumber:'Q-1001',buildName:'Rod',estimatedCompletionDate:'2026-12-01',components:[],payments:[],depositEnabled:false,...quote};
  const total=q.total??1000;
  const c={
    quote:q,businessProfile:p,
    currentBuildLifecycleStatus:()=>status,
    depositMaths:()=>{
      const received=q.payments.reduce((s,x)=>s+x.amount,0);
      const dep=q.depositEnabled?200:0;
      return{total,depositEnabled:q.depositEnabled,depositAmount:dep,remainingBalance:total-dep,amountReceived:received,balanceOwing:total-received,depositOutstanding:q.depositEnabled&&received<dep,depositStillRequired:Math.max(0,dep-received)};
    },
    customerIncludedParts:()=>['3 × Two Part Clear Coat','1 × Tip Top · Fuji'],
    specificationValue:(v)=>String(v==null?'':v).trim(),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
    currencyWithCode:money,
    deliveryAmounts:()=>({charge:0}),
    customerAddressLines:()=>['5 Customer Rd','Auckland'],
    businessProfileHasPaymentDetails:()=>!!(p.paymentAccountName&&p.paymentAccountNumber),
    formatCustomerEmailLongDate:(d)=>`D:${new Date(d).toISOString().slice(0,10)}`,
  };
  vm.createContext(c);
  vm.runInContext(['normalizeJobType','normalizeFulfilmentMethod','customerDeliveryAddressLines','customerFulfilmentSection','customerDocumentLabels','customerEmailSignatureLines','customerEmailLines'].map(fn).join('\n'),c);
  return c.customerEmailLines().join('\n');
}

test('greeting first, no profile block or postal address, single signature at bottom',()=>{
  for(const status of ['quote','active','complete']){
    const body=build({status});
    assert.ok(body.startsWith('Hi Bren,'));
    assert.ok(!body.includes('1 Secret St'));
    assert.equal(body.split('027 000 0000').length-1,1);
    assert.equal(body.split('k@example.test').length-1,1);
    assert.match(body,/Kind regards,\nK-Labs\nKevin\n027 000 0000\nk@example\.test\nwww\.example\.test$/);
    assert.ok(body.includes('3 × Two Part Clear Coat\n- 1 × Tip Top · Fuji'));
    assert.ok(body.includes('5 Customer Rd'));
  }
});

test('quote wording does not imply acceptance',()=>{
  const body=build({status:'quote',quote:{depositEnabled:true}});
  assert.match(body,/proposed custom rod build and quotation/);
  assert.doesNotMatch(body,/has been confirmed|is complete/);
  assert.match(body,/Deposit required: \$200\.00/);
  assert.match(body,/Estimated completion: D:2026-12-01/);
  assert.match(body,/Once the deposit has been received/);
  assert.match(body,/Bank account: 12-3456/);
});

test('build confirmation wording',()=>{
  const body=build({status:'active',quote:{payments:[{amount:200}],depositEnabled:true}});
  assert.match(body,/has been confirmed/);
  assert.doesNotMatch(body,/is complete/);
  assert.match(body,/Deposit received: \$200\.00/);
  assert.match(body,/Balance owing: \$800\.00/);
  assert.match(body,/Estimated completion/);
});

test('completed summary: no estimate, no zero deposit, recorded payments only',()=>{
  const body=build({status:'complete',quote:{payments:[{amount:400}],completedAt:'2026-11-05T00:00:00Z'}});
  assert.match(body,/complete\. Below is a summary of your finished build\./);
  assert.doesNotMatch(body,/Estimated completion|Deposit required/);
  assert.match(body,/Total: \$1000\.00\nPayments received: \$400\.00\nBalance outstanding: \$600\.00\nCompleted: D:2026-11-05/);
  assert.match(body,/Bank account/);
});

test('completed with no date or payments, and fully paid',()=>{
  const none=build({status:'complete'});
  assert.doesNotMatch(none,/Completed:|Payments received|Estimated/);
  assert.match(none,/Balance outstanding: \$1000\.00/);
  const paid=build({status:'complete',quote:{payments:[{amount:1000}]}});
  assert.match(paid,/Balance outstanding: \$0\.00/);
  assert.doesNotMatch(paid,/Payment Details|Bank account/);
});

test('missing optional business profile fields are handled',()=>{
  const body=build({status:'quote',profile:{businessName:'',contactName:'',phone:'',email:'',website:'',paymentAccountName:'',paymentAccountNumber:''}});
  assert.ok(body.startsWith('Hi Bren,'));
  assert.doesNotMatch(body,/Kind regards|Payment Details|undefined/);
  const partial=build({profile:{businessName:'K-Labs',contactName:'K-Labs'}});
  assert.match(partial,/Kind regards,\nK-Labs$/);
});

test('customer name fallback',()=>{
  assert.ok(build({quote:{customerName:''}}).startsWith('Hi Customer,'));
});

test('email uses the shared builder and keeps filtering formatter',()=>{
  assert.match(fn('emailCurrentQuote'),/customerEmailLines\(\)/);
  assert.match(fn('customerEmailLines'),/customerIncludedParts\(\)/);
  assert.doesNotMatch(fn('customerEmailLines'),/customerQuoteBusinessLines|\.cost|profit|supplier/);
});
