// Q32: Remove Invoice and Remove (payment entry), run from the real js/ui.js functions with mocked storage and dialogs.
// Synthetic build only. Checks that a removal is offered only once the server allows it, asks first, changes only the
// targeted entry, saves through the normal save path (so it syncs) and leaves prices and the rest of the build alone.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function functionSource(name){
  const at=[`\nfunction ${name}(`,`\nasync function ${name}(`].map((head)=>source.indexOf(head)).find((i)=>i>=0);
  assert.ok(at!==undefined,name);
  return source.slice(at+1,source.indexOf('\n}',at+1)+2);
}
const plain=(v)=>JSON.parse(JSON.stringify(v));
const settle=()=>new Promise((resolve)=>setImmediate(resolve));
const deposit={id:'dep-1',type:'deposit',amount:100,date:'2026-11-20'};
const balance={id:'bal-1',type:'balance',amount:150,date:'2026-11-21'};

function harness({supported=true,persist=true}={}){
  const c={
    quote:{id:'job-1',jobType:'build',finalCustomerPrice:500,payments:[plain(deposit),plain(balance)],
      issuedInvoice:{number:'INV-x',displayNumber:'INV-7',total:500,payments:[plain(deposit)]}},
    dialogs:[],info:[],flashes:[],steps:[],
    window:{KLABS_BUILD_SYNC:{recordRemovalSupported:async()=>supported}},
    $:()=>null,
    openConfirmDialog(config,handler){c.dialogs.push({config,handler});},
    openInfoDialog(title,message){c.info.push({title,message});},
    flashWorkshopStatus(message){c.flashes.push(message);},
    markQuoteDirty(){c.steps.push('dirty');},clearQuoteAutosaveTimer(){c.steps.push('timer');},
    saveQuoteCurrent(){c.steps.push('current');},
    persistCurrentQuoteRecord:async()=>{c.steps.push(['persist',plain(c.quote)]);return persist?{source:'build',index:0}:null;},
    markQuoteSaved(){c.steps.push('saved');},updateQuoteSummary(){},updatePaymentBlock(){},unlockModalLayer(){},
    formatDateDisplay:(v)=>v.slice(0,10).split('-').reverse().join('/'),
    currencyWithCode:(v)=>`$${Number(v).toFixed(2)} NZD`,numberOrZero:(v)=>Number(v)||0,
    escapeHtml:(v)=>String(v),
  };
  vm.createContext(c);
  vm.runInContext(['normalizeJobType','normalizeJobKind','isComponentsJob','deletionNoun','invoiceDisplayNumber','recordRemovalReady',
    'saveFinancialRemoval','removeIssuedInvoice','removePaymentEntry','paymentTypeLabel','paymentEntriesMarkup'].map(functionSource).join('\n'),c);
  return c;
}

test('Remove Invoice asks first; Cancel changes nothing; Remove clears only the invoice and saves normally',async()=>{
  const c=harness();
  await c.removeIssuedInvoice();
  assert.equal(c.dialogs.length,1);
  assert.equal(c.dialogs[0].config.title,'Remove Invoice');
  assert.equal(c.dialogs[0].config.message,'Remove invoice INV-7 from this build? The build, its payments and prices stay, so you can correct them and issue a new invoice. Keep your own copy of the removed invoice for your records.');
  c.dialogs[0].handler('cancel');
  assert.ok(c.quote.issuedInvoice);assert.deepEqual(c.steps,[]);
  await c.removeIssuedInvoice();
  c.dialogs[1].handler('remove');
  await settle();
  assert.equal(c.quote.issuedInvoice,undefined);
  assert.equal(c.quote.payments.length,2,'payments stay');assert.equal(c.quote.finalCustomerPrice,500,'price stays');
  assert.deepEqual(c.steps.filter((s)=>typeof s==='string'),['dirty','timer','current','saved']);
  assert.equal(c.steps.find(Array.isArray)[1].issuedInvoice,undefined,'the saved record has no invoice');
  assert.deepEqual(c.flashes,['Invoice removed - correct the build, then issue a new invoice']);
});

test('Remove (payment) removes only that entry and saves; the other entry and the invoice are untouched',async()=>{
  const c=harness();
  await c.removePaymentEntry('bal-1');
  // Q33: one plain question, Cancel | Remove; the same confirmed Q32 removal follows.
  assert.equal(c.dialogs[0].config.title,'Remove this payment?');
  assert.equal(c.dialogs[0].config.message,'Payment of $150.00 NZD received on 21/11/2026.');
  assert.equal(JSON.stringify(c.dialogs[0].config.actions.map((a)=>a.label)),'["Cancel","Remove"]');
  c.dialogs[0].handler('remove');
  await settle();
  assert.deepEqual(plain(c.quote.payments),[deposit]);
  assert.ok(c.quote.issuedInvoice,'the invoice stays');
  assert.deepEqual(c.flashes,['Payment removed']);
  const d=harness();
  await d.removePaymentEntry('dep-1');
  assert.equal(d.dialogs[0].config.title,'Remove this payment?');
  assert.match(d.dialogs[0].config.message,/^Deposit of /);
  d.dialogs[0].handler('remove');await settle();
  assert.deepEqual(plain(d.quote.payments),[balance]);
  assert.deepEqual(d.flashes,['Deposit removed']);
});

test('before the server allows removal, both actions explain and change nothing',async()=>{
  const c=harness({supported:false});
  await c.removeIssuedInvoice();
  await c.removePaymentEntry('dep-1');
  assert.equal(c.dialogs.length,0);
  assert.deepEqual(c.info.map((i)=>i.title),['Not Available Yet','Not Available Yet']);
  assert.match(c.info[0].message,/^Removing an issued invoice needs a Studio server update that has not been installed yet\. Nothing was changed\.$/);
  assert.match(c.info[1].message,/^Removing a payment entry needs/);
  assert.ok(c.quote.issuedInvoice);assert.equal(c.quote.payments.length,2);assert.deepEqual(c.steps,[]);
});

test('a failed save is reported, not announced as done',async()=>{
  const c=harness({persist:false});
  await c.removePaymentEntry('bal-1');
  c.dialogs[0].handler('remove');await settle();
  assert.deepEqual(c.flashes,['Could not save the change - check the build and try again']);
  assert.ok(!c.steps.includes('saved'));
});

test('an unknown payment id or a build without an invoice does nothing',async()=>{
  const c=harness();
  await c.removePaymentEntry('missing');
  delete c.quote.issuedInvoice;
  await c.removeIssuedInvoice();
  assert.equal(c.dialogs.length,0);assert.equal(c.info.length,0);
});

test('a payment is tapped to edit, and saving it as $0 uses the confirmed Q32 removal; the invoice preview offers Remove Invoice',()=>{
  const c=harness();
  // Pricing redesign: one tappable row per payment opens the edit form; Remove lives in that form (no Correct button).
  const markup=c.paymentEntriesMarkup([deposit],{money:c.currencyWithCode,date:(v)=>v,editable:true});
  assert.match(markup,/<button type="button" class="price-flow__payment" data-edit-payment="dep-1"/);
  assert.doesNotMatch(markup,/Correct|data-correct-payment|data-remove-payment/);
  assert.doesNotMatch(c.paymentEntriesMarkup([deposit],{money:c.currencyWithCode,date:(v)=>v}),/data-edit-payment/,'read-only where not editable');
  // Q33: no separate Remove button; Save with $0 asks "Remove this payment?" through the existing confirmed removal.
  assert.doesNotMatch(html,/quotePaymentRemoveBtn/);
  assert.match(source,/function saveBalanceReceived\(\)\{[\s\S]*?removePaymentEntry\(editingPaymentId\);\n    return;/,'$0 goes through the existing confirmed removal');
  assert.match(source,/data-invoice-preview-action="remove" hidden>Remove Invoice<\/button>/);
  assert.match(source,/else if\(selected==='remove'\)removeIssuedInvoice\(\);/);
  assert.match(source,/openInfoDialog\('Invoice Already Issued','To issue a corrected invoice, open the invoice and use Remove Invoice first\.'\)/);
  assert.match(source,/if\(componentsPricing\)parts\.push\('From Sell Prices'\);/);
  assert.doesNotMatch(source,/cannot be deleted/,'no permanent "cannot be deleted" block remains');
  assert.ok(html.includes('id="quotePaymentHistory"'));
});
