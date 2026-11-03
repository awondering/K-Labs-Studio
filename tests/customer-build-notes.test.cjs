const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

const PRIVATE='SECRET workshop-only remark';
const profile={businessName:'K-Labs',paymentAccountName:'K-Labs Ltd',paymentAccountNumber:'12-3456-7890123-00'};

function harness({status,notes='',builderNotes=PRIVATE}){
  const quote={customerName:'Bren Pine',quoteNumber:'Q-1001',buildName:'Rod',estimatedCompletionDate:'2026-12-01',
    components:[],payments:[],notes,buildSpecifications:{builderNotes}};
  const c={
    quote,businessProfile:profile,studioSettings:{},
    currentBuildLifecycleStatus:()=>status,
    depositMaths:()=>({total:1000,depositEnabled:false,depositAmount:0,remainingBalance:1000,amountReceived:0,balanceOwing:1000,depositOutstanding:false,depositStillRequired:0}),
    customerIncludedParts:()=>['3 × Two Part Clear Coat'],
    customerSpecificationRows:()=>[],
    customerQuoteDeliveryMarkup:()=>'<div class="view-quote__delivery">DELIVERY-BLOCK</div>',
    customerQuoteBusinessLines:()=>[],
    customerFulfilmentSection:()=>({heading:'Delivery',charge:0,lines:['Collection']}),
    activeEmailIncludeSignature:()=>false,
    customerEmailSignatureLines:()=>[],
    specificationRowsMarkup:()=>'',
    formatDateDisplay:()=>'1 Dec 2026',
    formatCustomerEmailLongDate:()=>'1 December 2026',
    currencyWithCode:(v)=>`$${Number(v).toFixed(2)}`,
    escapeHtml:(v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),
  };
  vm.createContext(c);
  vm.runInContext([
    'specificationValue','normalizeCustomerMeasurements','isLikelyJunkCustomerText','customerSafeText','customerRequestText',
    'normalizeJobType','normalizeFulfilmentMethod','customerDocumentLabels','customerQuoteConfirmationText','customerDocumentConfirmationText',
    'customerIncludedPartsMarkup','customerBuildNotesText','customerBuildNotesMarkup','businessProfileHasPaymentDetails',
    'customerQuoteSummaryMarkup','customerEmailLines',
  ].map(fn).join('\n'),c);
  return c;
}

const STATUSES=[['quote','Customer Quote'],['active','Build Confirmation'],['complete','Build Summary']];
const NOTE='Red thread, silver trim.\nSecond line  with  spacing\n\n- final bullet';

for(const [status,title] of STATUSES){
  test(`${title}: Build Notes sit after "What your rod includes" and before delivery and pricing`,()=>{
    const c=harness({status,notes:NOTE});
    assert.equal(c.customerDocumentLabels().title,title);
    const html=c.customerQuoteSummaryMarkup();
    const parts=html.indexOf('What your rod includes');
    const notes=html.indexOf('<span>Build Notes</span>');
    const delivery=html.indexOf('DELIVERY-BLOCK');
    const pricing=html.indexOf('view-quote__pricing');
    assert.ok(parts>=0&&notes>parts&&delivery>notes&&pricing>notes);
    assert.ok(html.indexOf('</ul></div>',parts)<notes,'notes follow the parts block immediately');
    assert.ok(!html.includes('Customer Notes'));
  });

  test(`${title}: multiline notes are preserved verbatim`,()=>{
    const html=harness({status,notes:`  ${NOTE}  `}).customerQuoteSummaryMarkup();
    assert.ok(html.includes(`<p>${NOTE}</p>`));
  });

  test(`${title}: empty or blank notes omit the Build Notes section`,()=>{
    for(const notes of ['','   \n  ',undefined]){
      const html=harness({status,notes}).customerQuoteSummaryMarkup();
      assert.ok(!html.includes('Build Notes'));
      assert.ok(!html.includes('view-quote__notes'));
    }
  });

  test(`${title}: private Workshop Notes never appear in the document or email`,()=>{
    const c=harness({status,notes:NOTE});
    assert.ok(!c.customerQuoteSummaryMarkup().includes(PRIVATE));
    assert.ok(!c.customerEmailLines().join('\n').includes(PRIVATE));
    const none=harness({status,notes:''});
    assert.ok(!none.customerQuoteSummaryMarkup().includes(PRIVATE));
    assert.ok(!none.customerEmailLines().join('\n').includes(PRIVATE));
  });

  test(`${title}: email draft lists Build Notes after the components and before delivery`,()=>{
    const lines=harness({status,notes:NOTE}).customerEmailLines();
    const body=lines.join('\n');
    const partsAt=body.indexOf('- 3 × Two Part Clear Coat');
    const notesAt=body.indexOf('\nBuild Notes\n');
    const deliveryAt=body.indexOf('\nDelivery\n');
    assert.ok(partsAt>=0&&notesAt>partsAt&&deliveryAt>notesAt);
    assert.ok(body.includes(`\nBuild Notes\n${NOTE}\n`),'multiline note and blank lines are preserved');
    assert.ok(!body.includes('Customer Notes'));
  });

  test(`${title}: email draft omits Build Notes when empty`,()=>{
    const body=harness({status,notes:''}).customerEmailLines().join('\n');
    assert.ok(!body.includes('Build Notes'));
  });
}

test('pricing, status wording and quote number are unaffected by Build Notes',()=>{
  for(const [status] of STATUSES){
    const withNotes=harness({status,notes:NOTE});
    const without=harness({status,notes:''});
    const strip=(s)=>s.replace(/<div class="view-quote__notes">[\s\S]*?<\/div>/,'');
    assert.equal(strip(withNotes.customerQuoteSummaryMarkup()),without.customerQuoteSummaryMarkup());
    const emailStrip=(lines)=>lines.join('\n').replace(/\nBuild Notes\n[\s\S]*?\n\nDelivery/,'\nDelivery');
    assert.equal(emailStrip(withNotes.customerEmailLines()),without.customerEmailLines().join('\n'));
  }
});

test('the customer renderers only read the Build Note field, never builderNotes',()=>{
  assert.ok(fn('customerBuildNotesText').includes('customerRequestText(quote.notes)'));
  const renderers=fn('customerBuildNotesText')+fn('customerBuildNotesMarkup')+fn('customerQuoteSummaryMarkup')+fn('customerEmailLines');
  assert.ok(!/builderNotes|Workshop Notes/.test(renderers));
  assert.ok(css.match(/\.view-quote__notes p\{[^}]*white-space:pre-wrap/));
});
