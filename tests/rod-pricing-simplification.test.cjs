// Rod pricing. Pricing redesign (23 Nov 2026): Components cost, Rod price (entered EXCLUDING tax), Your return
// ("Before overheads and income tax."), then Advanced pricing (collapsed) with two methods - Return $ and Margin % -
// that only propose a Rod price. Saved jobs keep exactly the same figures and documents (golden snapshot from v271).
// Uses the real ui.js functions through tests/helpers/job-record-loader.cjs. Synthetic data only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');
const {snapshotFixtures,loadFixtures,LEGACY_DRIVER_JOBS}=require('./helpers/pricing-snapshot.cjs');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const plain=(value)=>value==null?value:JSON.parse(JSON.stringify(value));
const near=(a,b,tol=0.005)=>Math.abs(Number(a)-Number(b))<=tol;
const golden=JSON.parse(fs.readFileSync(path.join(root,'tests','fixtures','q23-pricing-golden-v271.json'),'utf8')).jobs;

// ---------- 1. Saved jobs are byte-identical ----------
const current=snapshotFixtures(loadFixtures());
for(const name of Object.keys(golden)){
  test(`saved job "${name}": figures, deposit, quote/Build Summary, invoice and email are identical to v271`,()=>{
    assert.ok(current[name],'job is still snapshotted');
    for(const key of ['maths','deposit','quoteDocument','invoicePreview','email','savedQuote']){
      assert.deepEqual(current[name][key],golden[name][key],`${name}.${key}`);
    }
  });
}
test('the golden snapshot covers labour with Required Profit, Margin %, tax off, shipping, deposits and an issued invoice',()=>{
  assert.deepEqual(Object.keys(LEGACY_DRIVER_JOBS).sort(),['legacyMarginDriverTaxOff','legacyMarginDriverWithLabour','legacyProfitDriverWithLabourShipping']);
  assert.equal(Object.keys(golden).length,7);
  assert.ok(Object.values(golden).every((job)=>Object.values(job).every((value)=>!(typeof value==='string'&&value.startsWith('ERROR')))));
});

// ---------- 2. Pricing behaviour (real quoteMaths and the new helpers) ----------
function pricing(job,settings={}){
  const studioSettings={taxRate:15,taxEnabled:true,taxType:'gst',currency:'NZD',defaultLabourRate:85,...settings};
  const c=loadRecordFunctions(['normalizeQuote','quoteMaths','rodPricingFigures','applyManualRodPrice','rodPriceTaxMultiplier',
    'applyManualRodPriceExclusive','keepRodPriceExclusive','advancedRodPrice','rodPriceLabel','jobPriceNote','legacyLabourLineText',
    'paymentTypeLabel','paymentEntriesMarkup'],{
    studioSettings,
    activeTaxEnabled:()=>studioSettings.taxEnabled!==false,
    activeTaxRate:()=>studioSettings.taxRate,
    activeDefaultLabourRate:()=>studioSettings.defaultLabourRate,
    window:{},
    document:{activeElement:null,getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},
    $:()=>null,
    Store:{get:(key,fallback)=>fallback,set:()=>true},
  });
  c.quote=c.normalizeQuote(plain(job));
  return c;
}
const newBuild=(extra={})=>({id:'build-q23-new',jobType:'build',quoteStatus:'quote',customerName:'Synthetic New',
  components:[{category:'Blank',description:'Synthetic blank',cost:150,unitCost:150,unitPrice:210,quantity:1},
    {category:'Guides',description:'Synthetic guides',cost:60,unitCost:60,unitPrice:90,quantity:1}],
  labourRate:85,labourHours:0,priceAdjustment:0,pricingDriver:'price',includeGst:true,gstRate:15,fulfilmentMethod:'collection',
  payments:[],...extra}); // as a new build starts: the template's zero price adjustment, priced from the Sell Prices
const figures=(c)=>c.rodPricingFigures(c.quoteMaths());

test('a new build starts at the components\' Sell Prices; Your Return = rod price excl. tax - components cost',()=>{
  const f=figures(pricing(newBuild()));
  assert.ok(near(f.componentsCost,210));
  assert.ok(near(f.rodPrice,300),'Sell Prices 210 + 90 (stored including tax)');
  assert.ok(near(f.rodExclusive,300/1.15));
  assert.ok(near(f.yourReturn,300/1.15-210));
  assert.equal(f.labourCost,0);
});

test('the Rod price is entered excluding tax; the stored customer price still includes it',()=>{
  const c=pricing(newBuild());
  c.applyManualRodPriceExclusive('600');
  const math=c.quoteMaths();
  const f=c.rodPricingFigures(math);
  assert.ok(near(f.rodExclusive,600));
  assert.ok(near(math.gst,90));
  assert.ok(near(math.total,690),'collection: the customer pays the rod price plus GST');
  assert.ok(near(c.quote.finalCustomerPrice,690),'stored model unchanged: tax included');
  assert.ok(near(f.yourReturn,390));
  assert.equal(c.quote.pricingDriver,'price');
});

test('ex-tax entry round-trips to the cent at 15% and 20%',()=>{
  for(const [rate,settings] of [[15,{}],[20,{taxRate:20,taxType:'vat'}]]){
    for(const cents of [1,33,99,12345,78001,99999]){
      const c=pricing(newBuild({gstRate:rate}),settings);
      const value=(cents/100).toFixed(2);
      c.applyManualRodPriceExclusive(value);
      assert.equal(Math.round(figures(c).rodExclusive*100),cents,`${rate}% ${value}`);
    }
  }
});

test('with tax off the Rod price has no tax in it',()=>{
  const c=pricing(newBuild({includeGst:false}));
  c.applyManualRodPriceExclusive('500');
  const f=figures(c);
  assert.ok(near(f.rodPrice,500));
  assert.ok(near(f.rodExclusive,500));
  assert.ok(near(f.yourReturn,290));
});

test('delivery is charged on top of the Rod price and leaves Your return unchanged',()=>{
  const c=pricing(newBuild({fulfilmentMethod:'shipping',deliveryEntryMode:'breakdown',freight:18,packaging:12}));
  c.applyManualRodPriceExclusive('600');
  const math=c.quoteMaths();
  const f=c.rodPricingFigures(math);
  assert.ok(near(f.rodExclusive,600));
  assert.ok(near(math.total,690+30*1.15),'delivery recovered including tax');
  assert.ok(near(f.yourReturn,390));
});

test('turning tax off or changing the rate keeps the ex-tax Rod price; only tax and total move',()=>{
  const c=pricing(newBuild());
  c.applyManualRodPriceExclusive('600');
  c.keepRodPriceExclusive(()=>{c.quote.includeGst=false;});
  let math=c.quoteMaths();
  assert.ok(near(c.rodPricingFigures(math).rodExclusive,600));
  assert.ok(near(math.total,600));
  c.keepRodPriceExclusive(()=>{c.quote.includeGst=true;c.quote.gstRate=10;});
  math=c.quoteMaths();
  assert.ok(near(c.rodPricingFigures(math).rodExclusive,600));
  assert.ok(near(math.total,660));
  assert.ok(near(c.rodPricingFigures(math).yourReturn,390),'the return never moves with tax');
});

test('Advanced pricing Return $: price = components cost + return wanted',()=>{
  const c=pricing(newBuild());
  assert.deepEqual(plain(c.advancedRodPrice('return','285',495)),{price:780});
  assert.deepEqual(plain(c.advancedRodPrice('return','0',495)),{price:495});
  assert.deepEqual(plain(c.advancedRodPrice('return','12.345',100)),{price:112.35});
});

test('Advanced pricing Margin %: price = cost / (1 - margin), a margin on the selling price, not markup',()=>{
  const c=pricing(newBuild());
  assert.deepEqual(plain(c.advancedRodPrice('percent','50',210)),{price:420});
  assert.deepEqual(plain(c.advancedRodPrice('percent','40',210)),{price:350});
  assert.deepEqual(plain(c.advancedRodPrice('percent','0',210)),{price:210});
});

test('Advanced pricing rejects blank, non-numeric, negative and impossible values in plain words',()=>{
  const c=pricing(newBuild());
  assert.deepEqual(plain(c.advancedRodPrice('return','',210)),{error:''},'blank is no proposal and no error');
  assert.deepEqual(plain(c.advancedRodPrice('return','abc',210)),{error:'Enter a number.'});
  assert.deepEqual(plain(c.advancedRodPrice('return','-5',210)),{error:'Enter a return of zero or more.'});
  assert.deepEqual(plain(c.advancedRodPrice('percent','-1',210)),{error:'Enter a margin from 0 to 99.'});
  assert.deepEqual(plain(c.advancedRodPrice('percent','100',210)),{error:'Enter a margin from 0 to 99.'});
  assert.deepEqual(plain(c.advancedRodPrice('percent','30',0)),{error:'Add components first.'});
});

test('applying an Advanced proposal sets the Rod price exactly and is reversible (GST, VAT, tax off, delivery)',()=>{
  for(const [name,settings,job] of [
    ['GST 15%',{},{}],
    ['tax off',{taxEnabled:false},{includeGst:false}],
    ['VAT 20%',{taxRate:20,taxType:'vat'},{gstRate:20}],
    ['GST 15% with delivery',{},{fulfilmentMethod:'shipping',deliveryEntryMode:'breakdown',freight:18,packaging:12}],
  ]){
    const c=pricing(newBuild(job),settings);
    c.applyManualRodPriceExclusive('780');
    const a=figures(c);
    const byReturn=c.advancedRodPrice('return',a.yourReturn.toFixed(2),a.componentsCost).price;
    c.applyManualRodPriceExclusive(byReturn);
    assert.ok(near(figures(c).rodExclusive,780),`${name} return`);
    const byMargin=c.advancedRodPrice('percent',a.returnPercent.toFixed(4),a.componentsCost).price;
    c.applyManualRodPriceExclusive(byMargin);
    assert.ok(near(figures(c).rodExclusive,780,0.011),`${name} margin`);
    assert.ok(near(figures(c).yourReturn,a.yourReturn,0.011));
    assert.equal(c.quote.pricingDriver,'price','Advanced pricing never stores a target');
  }
});

test('a saved build with labour keeps it in Your return and shows the read-only labour line',()=>{
  const legacy=pricing(LEGACY_DRIVER_JOBS.legacyProfitDriverWithLabourShipping);
  const before=figures(legacy);
  assert.ok(near(before.labourCost,340));
  assert.equal(legacy.legacyLabourLineText(legacy.quote),'Includes saved labour: 4 h × $85.00 = $340.00');
  legacy.applyManualRodPriceExclusive('900');
  assert.ok(near(figures(legacy).rodExclusive,900));
  assert.equal(legacy.quote.labourHours,4,'saved labour is kept');
  const fresh=pricing(newBuild());
  assert.equal(fresh.legacyLabourLineText(fresh.quote),'');
  const components=pricing({...LEGACY_DRIVER_JOBS.legacyProfitDriverWithLabourShipping,jobKind:'components'});
  assert.equal(components.legacyLabourLineText(components.quote),'','never on a Components job');
});

test('labels: Job Price for every job type; the tax basis is its own quiet line; tax off has no tax wording',()=>{
  const c=pricing(newBuild());
  // Q33: one selling-price label for New Build, Refurbishment and Components.
  assert.equal(c.rodPriceLabel({taxActive:true,taxName:'GST',jobType:'build'}),'Job Price');
  assert.equal(c.rodPriceLabel({taxActive:true,taxName:'GST',jobType:'repair'}),'Job Price');
  assert.equal(c.jobPriceNote({taxActive:true,taxName:'GST'}),'Excl. GST');
  assert.equal(c.jobPriceNote({taxActive:true,taxName:'VAT'}),'Excl. VAT');
  assert.equal(c.jobPriceNote({taxActive:false,taxName:'GST'}),'');
  assert.equal(c.jobPriceNote({taxActive:true,taxName:'GST',componentsPricing:true}),'From Sell Prices · Excl. GST');
  assert.match(pricingBlock,/<span id="quoteRodPriceLabel">Job Price<\/span><small id="quoteJobPriceNote" hidden><\/small>/);
  assert.doesNotMatch(html,/>Rod price|>Repair price|Customer price \(/);
});

test('payment rows: type, date and amount; tappable to edit only when editable; escaped',()=>{
  const c=pricing(newBuild());
  const money=(v)=>`$${Number(v).toFixed(2)}`;const date=(d)=>`[${d}]`;
  assert.equal(c.paymentEntriesMarkup([],{money,date}),'');
  const list=[{id:'p1',type:'deposit',amount:300,date:'2026-11-22'},{id:'p<2>',type:'balance',amount:633.5,date:'2026-12-10'}];
  const read=c.paymentEntriesMarkup(list,{money,date});
  assert.doesNotMatch(read,/<button|data-edit-payment/);
  const out=c.paymentEntriesMarkup(list,{money,date,editable:true});
  assert.match(out,/data-edit-payment="p1"[^>]*>.*Deposit<\/span><span class="price-flow__payment-date">\[2026-11-22\]<\/span><strong>\$300\.00<\/strong>/);
  assert.match(out,/data-edit-payment="p&lt;2&gt;"[^>]*>.*Payment<\/span>/);
  assert.doesNotMatch(out,/Correct|correction|reason|received/i,'no audit language');
});

// ---------- 3. Screen structure ----------
const pricingBlock=html.slice(html.indexOf('id="workshopPricingFields"'),html.indexOf('class="workshop-build-actions-surface"'));
const actions=html.slice(html.indexOf('class="workshop-build-actions-surface"'),html.indexOf('class="workshop-build-actions-docs"'));
test('the pricing order: Components cost, Rod price, Your return, then Advanced pricing (collapsed)',()=>{
  const order=['quoteRodPricingHead','quoteCostBeforeMarginField','quoteTotalField','quoteEarningsSummary','quoteAdvancedToggle','quoteAdvancedPricing'];
  const at=order.map((id)=>pricingBlock.indexOf(`id="${id}"`));
  assert.ok(at.every((p)=>p>=0)&&at.every((p,n)=>n===0||p>at[n-1]),JSON.stringify(at));
  assert.match(pricingBlock,/id="quoteAdvancedToggle"[^>]*aria-expanded="false"/);
  assert.match(pricingBlock,/id="quoteAdvancedPricing"[^>]*hidden/);
});
test('Your return carries the approved note',()=>{
  assert.match(pricingBlock,/Your Return<small>Before overheads and income tax\.<\/small>/);
  assert.doesNotMatch(pricingBlock,/Estimated Earnings|Includes labour and profit/);
});
test('Advanced pricing has exactly two methods, one value, a proposed price and one Apply',()=>{
  const adv=pricingBlock.slice(pricingBlock.indexOf('id="quoteAdvancedPricing"'));
  assert.equal((adv.match(/data-advanced-method="/g)||[]).length,2);
  assert.match(adv,/data-advanced-method="return"[^>]*>Target Return</);
  assert.match(adv,/data-advanced-method="percent"[^>]*>Target Margin</);
  assert.match(adv,/id="quoteAdvancedTargetLabel">Target Return \(\$\)</,'only the chosen method\'s input, labelled');
  assert.match(adv,/<span>Job Price<\/span><strong id="quoteAdvancedProposed"><\/strong><button id="quoteAdvancedApply"[^>]*>Apply</,'the proposed Job Price and Apply share one row');
  for(const id of ['quoteAdvancedTarget','quoteAdvancedProposed','quoteAdvancedError','quoteAdvancedApply'])assert.ok(adv.includes(`id="${id}"`),id);
  assert.equal((adv.match(/<button[^>]*id="quoteAdvancedApply"/g)||[]).length,1);
});
test('the old modes, targets, build hours and hourly return are gone',()=>{
  for(const id of ['quoteProfit','quoteMarginPercent','quotePricingMethodField','quoteBuildHoursField','quoteEffectiveHourly',
    'quoteTimePricingRow','quoteAdvancedPricingNote','quoteCustomerTotalLine','quoteDeliveryTotal','settingsShowAdvancedPricing'])
    assert.doesNotMatch(html,new RegExp(`id="${id}"`),id);
  assert.doesNotMatch(html,/data-pricing-view=|data-pricing-method=|Required Profit|hourly/i);
  // Q33: "Target Return" / "Target Margin" name the two Advanced Pricing methods only; no target is stored or shown elsewhere.
  const outsideAdvanced=html.replace(/<div id="quoteAdvancedPricing"[\s\S]*?<\/div>\n            <\/div>/,'');
  assert.doesNotMatch(outsideAdvanced,/Target Return|Target Margin/);
  const ui=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
  for(const name of ['applyManualTargetReturn','effectiveHourlyReturn','timePricingAmount','advancedPricingEnabled','setPricingView'])
    assert.doesNotMatch(ui,new RegExp(`function ${name}\\(`),name);
});
test('no labour split: Labour Rate and Labour Hours stay hidden',()=>{
  assert.match(pricingBlock,/<label id="quoteLabourRateField" hidden>/);
  assert.match(pricingBlock,/<label id="quoteLabourHoursField" hidden>/);
});
test('Delivery, Total price and Payments follow in that order; freight and packaging only for sending',()=>{
  const at=['quoteFulfilmentGroup','quoteTotalBlock','quotePaymentBlock'].map((id)=>actions.indexOf(`id="${id}"`));
  assert.ok(at.every((p)=>p>=0)&&at[0]<at[1]&&at[1]<at[2],JSON.stringify(at));
  // Q33: one Delivery row; tapping it shows Collection | Courier / Shipping, and Freight/Packaging only for shipping.
  assert.match(actions,/id="quoteDeliveryToggle"[^>]*aria-expanded="false"[^>]*aria-controls="quoteDeliveryPanel"[^>]*><span id="quoteDeliveryHeading">Delivery<\/span><em id="quoteDeliverySummary"><\/em>/);
  const panel=actions.slice(actions.indexOf('id="quoteDeliveryPanel"'));
  assert.match(panel,/^id="quoteDeliveryPanel"[^>]*hidden>/);
  assert.match(panel,/data-fulfilment-method="collection"[^>]*>Collection</);
  assert.match(panel,/data-fulfilment-method="shipping"[^>]*>Courier \/ Shipping</);
  assert.doesNotMatch(html,/Customer collects|Send to customer/);
  const fields=actions.slice(actions.indexOf('id="quoteDeliveryFields"'));
  assert.match(fields.slice(0,600),/Freight[\s\S]*Packaging/);
  assert.match(actions,/id="quoteTotalPriceRow"[\s\S]*?Total Price<small id="quoteTotalNote" hidden><\/small>[\s\S]*?id="quoteTotalPrice"/);
});
test('one tax row - Include tax, the rate chip, the tax total - with the per-build rate field behind the chip',()=>{
  const row=html.slice(html.indexOf('id="quoteTaxSummaryRow"'),html.indexOf('id="quoteTaxRateField"'));
  const at=(id)=>row.indexOf(`id="${id}"`);
  assert.ok(at('quoteIncludeGstField')>0 && at('quoteIncludeGstField')<at('quoteTaxRateChip') && at('quoteTaxRateChip')<at('quoteGstField'),row);
  assert.match(row,/id="quoteTaxRateChip"[^>]*aria-expanded="false"[^>]*aria-controls="quoteTaxRateField"/);
  assert.match(html,/<label id="quoteTaxRateField"[^>]*hidden>/);
  assert.doesNotMatch(row,/>GST|15%|15\.0/,'no hard-coded tax name or rate');
});
test('Payments: Deposit Required, the payment rows, Payments Received/Balance Owing, then Add Payment; one form for add and edit',()=>{
  const block=html.slice(html.indexOf('id="quotePaymentBlock"'),html.indexOf('class="workshop-build-actions-docs"'));
  const at=(id)=>block.indexOf(`id="${id}"`);
  for(const id of ['quoteDepositTerms','quoteDepositEnabledField','quoteDepositTypeField','quoteDepositValueField','quotePaymentHistory',
    'quotePaymentBalanceOwing','quoteBalanceReceivedForm','quoteBalanceReceivedAmount','quoteBalanceReceivedDate',
    'quoteBalanceReceivedSave','quoteBalanceReceivedCancel','quoteRecordPaymentBtn'])assert.ok(at(id)>0,id);
  // Q33: no separate Remove button; an edited payment saved as $0 asks "Remove this payment?".
  assert.doesNotMatch(block,/quotePaymentRemoveBtn|Remove payment/);
  assert.match(block,/<span>Deposit Required<\/span>/);
  assert.match(block,/<span>Payments Received<\/span>/);
  assert.match(block,/id="quotePaymentBalanceLabel">Balance Owing</);
  assert.match(block,/id="quoteRecordPaymentBtn" class="price-flow__disclosure price-flow__add"[^>]*><span id="quoteRecordPaymentLabel">Add Payment<\/span>/);
  assert.ok(at('quoteDepositTerms')<at('quotePaymentHistory')&&at('quotePaymentHistory')<at('quotePaymentBalanceOwing')&&at('quotePaymentBalanceOwing')<at('quoteRecordPaymentBtn'));
  assert.match(block,/id="quoteBalanceReceivedSave"[^>]*class="[^"]*primary-action/);
  assert.doesNotMatch(block,/Correct|Correction|Reason|quotePaymentTypeField|quoteDepositReceivedForm|quoteBalanceRemaining/);
  assert.doesNotMatch(block,/<summary>/);
});
test('Components jobs keep their own pricing: rod-only elements are hidden there',()=>{
  const rule=css.slice(css.indexOf('#workshopPricingSection[data-job-kind="components"] :is('));
  const selector=rule.slice(0,rule.indexOf('{'));
  for(const id of ['quoteLegacyLabourLine','quoteAdvancedToggle','quoteAdvancedPricing'])assert.ok(selector.includes(`#${id}`),id);
});
test('the build screen uses one section heading style',()=>{
  for(const label of ['Pricing','Payments'])assert.match(html,new RegExp(`build-section-heading[^>]*>${label}<`),label);
  // Q33: Delivery is a row like Advanced Pricing, not a section heading with permanent buttons.
  assert.match(html,/class="price-flow__disclosure price-flow__delivery-toggle"[^>]*><span id="quoteDeliveryHeading">Delivery</);
  assert.match(html,/<span class="workshop-build-actions-docs__label build-section-heading">Documents<\/span>/);
  assert.match(css,/#workshopScreen #workshopPricingSection \.build-section-heading\{[^}]*font-size:11px[^}]*\}/);
});
test('Documents are one compact row of secondary buttons; iPhone two per row at 44px',()=>{
  assert.doesNotMatch(css,/#viewInvoicePreviewBtn\{grid-column:1\/-1\}/);
  assert.match(css,/#workshopScreen \.workshop-build-actions-docs__grid\{display:flex;flex-wrap:wrap;gap:8px\}/);
  assert.match(css,/@media \(max-width:640px\)\{[^@]*#workshopPricingSection \.workshop-build-actions-docs__grid > \*\{flex:1 1 calc\(50% - 4px\)[^}]*\}[^@]*min-height:44px/);
});
test('iPhone: the new rows, inputs and buttons get 44px touch targets',()=>{
  const media=css.slice(css.indexOf('/* iPhone: 44px touch targets; the rows stay slim. */'));
  assert.match(media,/\.price-flow__row,\.price-flow__disclosure,\.price-flow__summary,\.price-flow__switch,\.price-flow__payment\)\{min-height:44px\}/);
  assert.match(media,/height:44px;min-height:44px/);
});
