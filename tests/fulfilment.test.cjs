const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

const money=(v)=>`$${Number(v).toFixed(2)}`;
const profile={businessName:'Woof Rods',contactName:'Kevin',phone:'027 000 0000',email:'k@example.test',website:'www.example.test'};

function ctx(over={},status='quote'){
  const quote={customerName:'Bren Pine',quoteNumber:'Q-1',jobType:'build',payments:[],components:[],country:'New Zealand',freightCharge:0,...over};
  const dialogs=[];
  const c={
    quote,businessProfile:profile,dialogs,
    currentBuildLifecycleStatus:()=>status,
    depositMaths:()=>({total:500,depositEnabled:false,depositAmount:0,remainingBalance:500,amountReceived:0,balanceOwing:500,depositOutstanding:false,depositStillRequired:0}),
    customerIncludedParts:()=>['3 × Two Part Clear Coat'],
    customerQuoteConfirmationText:()=>'text',
    specificationValue:(v)=>String(v==null?'':v).trim(),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
    currencyWithCode:money,
    deliveryAmounts:(q)=>({charge:Number(q.freightCharge)||0}),
    customerAddressLines:()=>{
      const l=[quote.addressLine1,quote.suburbLocality,quote.cityTown,quote.postcode,quote.country].filter(Boolean);
      return l;
    },
    businessProfileHasPaymentDetails:()=>false,
    formatCustomerEmailLongDate:()=>'1 December 2026',
    escapeHtml:(v)=>String(v),
    customerSafeText:(v)=>String(v==null?'':v),
    openInfoDialog:(t,m)=>dialogs.push({type:'info',t,m}),
    openConfirmDialog:(o,cb)=>{dialogs.push({type:'confirm',o});c.confirmCb=cb;},
    markQuoteDirty:()=>{c.dirty=true;},
    saveQuoteCurrent:()=>{},
    $:()=>null,
    document:{querySelectorAll:()=>[]},
  };
  vm.createContext(c);
  vm.runInContext(['normalizeJobType','normalizeFulfilmentMethod','customerDeliveryAddressLines','deliveryAddressIncomplete','customerFulfilmentSection','customerFulfilmentCheck','runWithFulfilmentCheck','fulfilmentStudioNote','syncFulfilmentSelector','setQuoteFulfilmentMethod','jobTypeLabel','customerDocumentLabels','customerEmailSignatureLines','customerEmailLines','customerQuoteDeliveryMarkup'].map(fn).join('\n'),c);
  return c;
}
const full={addressLine1:'5 River Rd',cityTown:'Taupo',postcode:'3330'};
const emailText=(c)=>c.customerEmailLines().body?c.customerEmailLines().body:[].concat(c.customerEmailLines().lines||c.customerEmailLines()).join('\n');

test('normalizeFulfilmentMethod accepts only collection/shipping',()=>{
  const c=ctx();
  assert.equal(c.normalizeFulfilmentMethod('collection'),'collection');
  assert.equal(c.normalizeFulfilmentMethod(' Shipping '),'shipping');
  assert.equal(c.normalizeFulfilmentMethod('x'),'');
  assert.equal(c.normalizeFulfilmentMethod(undefined),'');
});

test('record fields: new jobs require a choice; legacy records are not assumed or rewritten',()=>{
  assert.match(fn('newQuoteTemplate'),/fulfilmentMethod:''/);
  assert.match(fn('newQuoteTemplate'),/fulfilmentChoiceRequired:true/);
  assert.match(fn('normalizeQuote'),/fulfilmentMethod=normalizeFulfilmentMethod\(/);
  assert.match(fn('normalizeQuote'),/fulfilmentChoiceRequired===true/);
  assert.ok(!/fulfilmentMethod/.test(fn('applyCustomerFieldsToQuoteFromRecord')),'customer change must not touch method');
});

test('selector markup exists with both options inside the pricing delivery area',()=>{
  assert.match(html,/id="quoteFulfilmentGroup"/);
  assert.match(html,/data-fulfilment-method="collection"/);
  assert.match(html,/data-fulfilment-method="shipping"/);
  assert.ok(html.indexOf('quoteFulfilmentGroup')<html.indexOf('id="quoteDeliveryFields"'));
});

test('collection: shows business name, no address, no Delivery section, build and repair',()=>{
  for(const jobType of ['build','repair']){
    for(const status of ['quote','active','complete']){
      const c=ctx({...full,jobType,fulfilmentMethod:'collection',freightCharge:20},status);
      const text=JSON.stringify(c.customerEmailLines());
      assert.match(text,/Collection/);
      assert.match(text,/Customer to collect from Woof Rods\./);
      assert.ok(!/5 River Rd|Taupo|Delivery/.test(text),`${jobType}/${status}`);
      assert.match(text,/3 × Two Part Clear Coat/);
      const markup=c.customerQuoteDeliveryMarkup();
      assert.match(markup,/Collection/);
      assert.match(markup,/Customer to collect from Woof Rods\./);
      assert.ok(!/Taupo|Delivery/.test(markup));
    }
  }
});

test('collection falls back to K-Labs when no business name saved',()=>{
  const c=ctx({fulfilmentMethod:'collection'});
  c.businessProfile.businessName='';
  assert.match(c.customerFulfilmentSection().lines[0],/K-Labs/);
  profile.businessName='Woof Rods';
});

test('shipping with full address shows Delivery and address in preview and email',()=>{
  for(const jobType of ['build','repair']){
    for(const status of ['quote','active','complete']){
      const c=ctx({...full,jobType,fulfilmentMethod:'shipping'},status);
      const text=JSON.stringify(c.customerEmailLines());
      assert.match(text,/Delivery/);
      assert.match(text,/5 River Rd/);
      assert.match(c.customerQuoteDeliveryMarkup(),/5 River Rd/);
    }
  }
});

test('country-only address is never shown as a delivery address',()=>{
  for(const method of ['shipping','']){
    const c=ctx({fulfilmentMethod:method});
    assert.deepEqual(Array.from(c.customerDeliveryAddressLines()),[]);
    assert.equal(c.customerFulfilmentSection(),null);
    assert.equal(c.customerQuoteDeliveryMarkup(),'');
    assert.ok(!/New Zealand/.test(JSON.stringify(c.customerEmailLines())));
  }
});

test('legacy job without method keeps behaviour: full address and freight still shown, no prompt',()=>{
  const c=ctx({...full,freightCharge:15});
  const s=c.customerFulfilmentSection();
  assert.equal(s.heading,'Delivery');
  assert.equal(s.charge,15);
  assert.ok(s.lines.includes('5 River Rd'));
  assert.deepEqual({...c.customerFulfilmentCheck()},{});
  let ran=false;c.runWithFulfilmentCheck(()=>{ran=true;});
  assert.ok(ran);
  assert.equal(c.dialogs.length,0);
});

test('new job without a method is blocked before a document or email',()=>{
  const c=ctx({fulfilmentChoiceRequired:true});
  let ran=false;c.runWithFulfilmentCheck(()=>{ran=true;});
  assert.ok(!ran);
  assert.equal(c.dialogs[0].type,'info');
  assert.match(c.dialogs[0].m,/Fulfilment Method/);
});

test('shipping with incomplete address warns; continuing proceeds, going back does not',()=>{
  const c=ctx({fulfilmentMethod:'shipping'});
  let ran=0;c.runWithFulfilmentCheck(()=>{ran++;});
  assert.equal(ran,0);
  assert.equal(c.dialogs[0].type,'confirm');
  c.confirmCb('cancel');assert.equal(ran,0);
  c.confirmCb('continue');assert.equal(ran,1);
});

test('shipping with complete address and collection proceed without warning',()=>{
  for(const over of [{...full,fulfilmentMethod:'shipping'},{fulfilmentMethod:'collection'}]){
    const c=ctx(over);
    let ran=false;c.runWithFulfilmentCheck(()=>{ran=true;});
    assert.ok(ran);assert.equal(c.dialogs.length,0);
  }
});

test('Studio notes: collection+freight warning, shipping incomplete, choose prompt',()=>{
  assert.match(ctx({fulfilmentMethod:'collection',freightCharge:12}).fulfilmentStudioNote(),/Freight/);
  assert.equal(ctx({fulfilmentMethod:'collection'}).fulfilmentStudioNote(),'');
  assert.match(ctx({fulfilmentMethod:'shipping'}).fulfilmentStudioNote(),/Delivery details needed/);
  assert.equal(ctx({...full,fulfilmentMethod:'shipping'}).fulfilmentStudioNote(),'');
  assert.match(ctx({fulfilmentChoiceRequired:true}).fulfilmentStudioNote(),/Choose/);
  assert.equal(ctx({}).fulfilmentStudioNote(),'');
});

test('setting the method saves, marks dirty, and leaves freight and money untouched',()=>{
  const c=ctx({...full,freightCharge:25,freightCost:10,payments:[{amount:50}],jobType:'repair'});
  const before=JSON.stringify({...c.quote});
  c.setQuoteFulfilmentMethod('collection');
  assert.equal(c.quote.fulfilmentMethod,'collection');
  assert.ok(c.dirty);
  const after={...c.quote};delete after.fulfilmentMethod;
  const b=JSON.parse(before);
  assert.deepEqual(JSON.parse(JSON.stringify(after)),b);
  c.setQuoteFulfilmentMethod('shipping');
  assert.equal(c.quote.fulfilmentMethod,'shipping');
  assert.equal(c.quote.freightCharge,25);
  assert.equal(c.quote.jobType,'repair');
});

test('method survives normalizeQuote round trip, status changes and customer change',()=>{
  const norm=fn('normalizeQuote');
  assert.match(norm,/merged\.fulfilmentMethod=normalizeFulfilmentMethod\(inputQuote&&inputQuote\.fulfilmentMethod\)/);
  assert.match(fn('saveBuildLifecycleStatusBySource'),/\.\.\.target/);
  const c=ctx({fulfilmentMethod:'collection'},'quote');
  const saved=JSON.parse(JSON.stringify(c.quote));
  assert.equal(c.normalizeFulfilmentMethod(saved.fulfilmentMethod),'collection');
  Object.assign(c.quote,{customerName:'Someone Else',addressLine1:'9 New St'});
  assert.equal(c.quote.fulfilmentMethod,'collection');
});

test('preview and email agree for every method/type/status',()=>{
  for(const method of ['collection','shipping','']){
    for(const jobType of ['build','repair']){
      for(const status of ['quote','active','complete']){
        const c=ctx({...full,jobType,fulfilmentMethod:method},status);
        const s=c.customerFulfilmentSection();
        const text=JSON.stringify(c.customerEmailLines());
        const markup=c.customerQuoteDeliveryMarkup();
        s.lines.forEach((l)=>{assert.ok(text.includes(l));assert.ok(markup.includes(l));});
      }
    }
  }
});

test('guards wired into preview and email entry points',()=>{
  assert.match(fn('openViewQuote'),/runWithFulfilmentCheck\(showViewQuote\)/);
  assert.match(fn('emailCurrentQuote'),/runWithFulfilmentCheck/);
  assert.match(source,/emailCurrentQuote\(\{fromPreview:true\}\)/);
});
