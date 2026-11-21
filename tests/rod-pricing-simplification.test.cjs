// Q23 Rod Pricing simplification (approved 22 Nov 2026).
// Simple default: Components Cost, Rod Price (entered including tax), Your Return ("Before overheads and income tax.").
// Advanced Pricing (Settings → Show Advanced Pricing, off by default): Target Return ($), Target Return (% of price excl. tax,
// a margin), optional Build hours → effective hourly return, and a one-line "price from my time" helper.
// Saved jobs keep exactly the same figures and documents (golden snapshot taken from build148-v271 before Q23).
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
  const c=loadRecordFunctions(['normalizeQuote','quoteMaths','rodPricingFigures','applyManualRodPrice','applyManualTargetReturn',
    'applyManualTargetReturnPercent','rodPriceLabel','targetReturnPercentLabel','legacyLabourLineText','effectiveHourlyReturn',
    'timePricingAmount','accountUsesAdvancedPricing','shouldShowAdvancedPricingNote','advancedPricingEnabled',
    'rodPriceHintText','customerTotalLineText','taxAmountLabel'],{
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

test('a new build starts at the components\' Sell Prices; Your Return = rod price excl. tax - components cost',()=>{
  const c=pricing(newBuild());
  const f=c.rodPricingFigures(c.quoteMaths());
  assert.ok(near(f.componentsCost,210));
  assert.ok(near(f.rodPrice,300),'Sell Prices 210 + 90');
  assert.ok(near(f.rodExclusive,300/1.15));
  assert.ok(near(f.yourReturn,300/1.15-210));
  assert.equal(f.labourCost,0);
});

test('Rod Price is entered including tax and Your Return is worked out excluding tax',()=>{
  const c=pricing(newBuild());
  c.applyManualRodPrice('690');
  const math=c.quoteMaths();
  const f=c.rodPricingFigures(math);
  assert.ok(near(f.rodPrice,690));
  assert.ok(near(math.total,690),'collection: the customer pays the rod price');
  assert.ok(near(math.gst,90));
  assert.ok(near(f.yourReturn,600-210));
  assert.equal(c.quote.pricingDriver,'price');
});

test('with tax off the Rod Price has no tax in it',()=>{
  const c=pricing(newBuild({includeGst:false}));
  c.applyManualRodPrice('500');
  const f=c.rodPricingFigures(c.quoteMaths());
  assert.ok(near(f.rodPrice,500));
  assert.ok(near(f.rodExclusive,500));
  assert.ok(near(f.yourReturn,290));
});

test('shipping is charged on top of the Rod Price and leaves Your Return unchanged',()=>{
  const c=pricing(newBuild({fulfilmentMethod:'shipping',deliveryEntryMode:'breakdown',freight:18,packaging:12}));
  c.applyManualRodPrice('690');
  const math=c.quoteMaths();
  const f=c.rodPricingFigures(math);
  assert.ok(near(f.rodPrice,690));
  assert.ok(near(math.total,690+30*1.15),'delivery cost recovered including tax');
  assert.ok(near(f.yourReturn,390));
});

test('Target Return ($) sets the price so Your Return equals it; later cost changes keep the return',()=>{
  const c=pricing(newBuild());
  c.applyManualTargetReturn('400');
  let f=c.rodPricingFigures(c.quoteMaths());
  assert.equal(c.quote.pricingDriver,'profit');
  assert.ok(near(f.yourReturn,400));
  assert.ok(near(f.rodPrice,(210+400)*1.15));
  c.quote.components[0].cost=170;c.quote.components[0].unitCost=170;
  f=c.rodPricingFigures(c.quoteMaths());
  assert.ok(near(f.yourReturn,400),'still 400 after the blank cost changes');
});

test('Target Return (%) is a margin: Your Return as a % of the rod price excluding tax',()=>{
  const c=pricing(newBuild());
  c.applyManualTargetReturnPercent('40');
  const f=c.rodPricingFigures(c.quoteMaths());
  assert.equal(c.quote.pricingDriver,'margin');
  assert.ok(near(f.returnPercent,40,0.01));
  assert.ok(near(f.rodExclusive,210/0.6));
  assert.ok(near(f.yourReturn,f.rodExclusive*0.4));
});

test('a saved build with labour: Your Return includes the labour, and Target Return edits convert exactly',()=>{
  const c=pricing(LEGACY_DRIVER_JOBS.legacyMarginDriverWithLabour);
  const before=c.rodPricingFigures(c.quoteMaths());
  assert.ok(near(before.labourCost,340));
  assert.ok(near(before.yourReturn,before.rodExclusive-210),'labour + profit');
  c.applyManualTargetReturn('600');
  let f=c.rodPricingFigures(c.quoteMaths());
  assert.ok(near(f.yourReturn,600));
  assert.equal(c.quote.labourHours,4,'saved labour is kept');
  assert.equal(c.quote.labourRate,85);
  c.applyManualTargetReturnPercent('55');
  f=c.rodPricingFigures(c.quoteMaths());
  assert.ok(near(f.returnPercent,55,0.01));
});

test('labels: Rod Price uses the Tax Name; tax off has no tax wording; repairs say Repair Price',()=>{
  const c=pricing(newBuild());
  assert.equal(c.rodPriceLabel({taxActive:true,taxName:'GST',jobType:'build'}),'Rod Price (incl. GST)');
  assert.equal(c.rodPriceLabel({taxActive:true,taxName:'VAT',jobType:'build'}),'Rod Price (incl. VAT)');
  assert.equal(c.rodPriceLabel({taxActive:false,taxName:'GST',jobType:'build'}),'Rod Price');
  assert.equal(c.rodPriceLabel({taxActive:true,taxName:'GST',jobType:'repair'}),'Repair Price (incl. GST)');
  assert.equal(c.targetReturnPercentLabel({taxActive:true,taxName:'GST'}),'Target Return (% of price excl. GST)');
  assert.equal(c.targetReturnPercentLabel({taxActive:false,taxName:'GST'}),'Target Return (% of price)');
});

test('the read-only labour line appears only on saved builds that carry labour',()=>{
  const legacy=pricing(LEGACY_DRIVER_JOBS.legacyProfitDriverWithLabourShipping);
  assert.equal(legacy.legacyLabourLineText(legacy.quote),'Includes labour 4 h × $85.00 = $340.00 (saved with this build)');
  const fresh=pricing(newBuild());
  assert.equal(fresh.legacyLabourLineText(fresh.quote),'');
  const components=pricing({...LEGACY_DRIVER_JOBS.legacyProfitDriverWithLabourShipping,jobKind:'components'});
  assert.equal(components.legacyLabourLineText(components.quote),'','never on a Components job');
});

test('build hours give an effective hourly return; the time helper is hours × rate',()=>{
  const c=pricing(newBuild());
  assert.equal(c.effectiveHourlyReturn(390,6.5),60);
  assert.equal(c.effectiveHourlyReturn(390,0),null);
  assert.equal(c.effectiveHourlyReturn(390,''),null);
  assert.equal(c.timePricingAmount(6.5,85),552.5);
  assert.equal(c.timePricingAmount(0,85),0);
  assert.equal(c.timePricingAmount(6,-5),0);
});

test('Advanced Pricing is off by default and follows the Settings switch',()=>{
  assert.equal(pricing(newBuild()).advancedPricingEnabled(),false);
  assert.equal(pricing(newBuild(),{showAdvancedPricing:true}).advancedPricingEnabled(),true);
});

test('the one-time note shows only for accounts whose builds used labour, profit or margin, until dismissed',()=>{
  const c=pricing(newBuild());
  const usesLabour=[{labourRate:85,labourHours:2,pricingDriver:'price'}];
  const usesMargin=[{labourRate:85,labourHours:0,pricingDriver:'margin'}];
  const simple=[{labourRate:85,labourHours:0,pricingDriver:'price'}];
  assert.equal(c.accountUsesAdvancedPricing(usesLabour),true);
  assert.equal(c.accountUsesAdvancedPricing(usesMargin),true);
  assert.equal(c.accountUsesAdvancedPricing([{pricingDriver:'profit'}]),true);
  assert.equal(c.accountUsesAdvancedPricing(simple),false);
  assert.equal(c.accountUsesAdvancedPricing([{labourHours:3,jobKind:'components'}]),false,'Components jobs never count');
  const show=(settings,records,extra={})=>c.shouldShowAdvancedPricingNote({settings,records,componentsJob:false,demo:false,...extra});
  assert.equal(show({},usesLabour),true);
  assert.equal(show({advancedPricingNoteDismissed:true},usesLabour),false);
  assert.equal(show({showAdvancedPricing:true},usesLabour),false);
  assert.equal(show({},simple),false);
  assert.equal(show({},usesLabour,{componentsJob:true}),false);
  assert.equal(show({},usesLabour,{demo:true}),false);
  let reads=0;
  const lazy=()=>{reads+=1;return usesLabour;};
  assert.equal(show({advancedPricingNoteDismissed:true},lazy),false);
  assert.equal(reads,0,'saved builds are not read once the note is dismissed');
  assert.equal(show({},lazy),true);
  assert.equal(reads,1);
});

// ---------- 3. Screen structure ----------
const pricingBlock=html.slice(html.indexOf('id="workshopPricingFields"'),html.indexOf('id="quoteDepositEnabledField"'));
test('the pricing screen order: Components Cost, Rod Price, Your Return, labour line, note, then Advanced Pricing',()=>{
  const order=['quoteCostBeforeMarginField','quoteTotalField','quoteEarningsSummary','quoteLegacyLabourLine','quoteAdvancedPricingNote','quoteAdvancedPricing'];
  const positions=order.map((id)=>pricingBlock.indexOf(`id="${id}"`));
  assert.ok(positions.every((p)=>p>=0),JSON.stringify(positions));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  assert.ok(pricingBlock.indexOf('id="quoteIncludeGstField"')>positions.at(-1),'tax controls stay below');
});
test('Your Return is labelled with the approved note',()=>{
  assert.match(pricingBlock,/<span>Your Return<\/span><strong id="quoteEstimatedEarnings">/);
  assert.match(pricingBlock,/<p>Before overheads and income tax\.<\/p>/);
  assert.doesNotMatch(pricingBlock,/Estimated Earnings|Includes labour and profit/);
});
test('no labour split by default: Labour Rate and Labour Hours are not shown',()=>{
  assert.match(pricingBlock,/<label id="quoteLabourRateField" hidden>/);
  assert.match(pricingBlock,/<label id="quoteLabourHoursField" hidden>/);
});
test('Advanced Pricing holds Target Return ($), Target Return (%), Build hours and the time helper',()=>{
  const advanced=pricingBlock.slice(pricingBlock.indexOf('id="quoteAdvancedPricing"'));
  for(const id of ['quoteProfitField','quoteMarginPercentField','quoteBuildHoursField','quoteEffectiveHourly','quoteTimePricingRow','quoteTimeRate','quoteTimePricingApply']){
    assert.ok(advanced.includes(`id="${id}"`),id);
  }
  assert.match(advanced,/<span id="quoteProfitLabel">Target Return \(\$\)<\/span>/);
  assert.match(advanced,/Price from my time/);
  assert.doesNotMatch(pricingBlock,/Required Profit|Margin %/);
});
test('the one-time note has the approved wording and a dismiss control',()=>{
  assert.match(pricingBlock,/id="quoteAdvancedPricingNote"[^>]*hidden/);
  assert.match(pricingBlock,/Margin and target pricing are now in Settings → Show Advanced Pricing/);
  assert.match(pricingBlock,/id="quoteAdvancedPricingNoteDismiss"/);
});
test('Settings → Pricing & Tax has the Show Advanced Pricing switch, and the tax, labour-rate and currency settings stay',()=>{
  const card=html.slice(html.indexOf('id="settingsPricingTaxCard"'),html.indexOf('id="settingsPaymentDetailsCard"'));
  assert.match(card,/id="settingsShowAdvancedPricingLabel">Show Advanced Pricing</);
  assert.match(card,/<input id="settingsShowAdvancedPricing" type="checkbox"/);
  for(const id of ['settingsTaxEnabled','settingsTaxRate','settingsTaxName','settingsBusinessGstNumber','settingsDefaultLabourRate','settingsCurrency']){
    assert.ok(card.includes(`id="${id}"`),id);
  }
});
test('Components jobs keep their own pricing: the new rod-pricing elements are hidden there',()=>{
  const rule=css.slice(css.indexOf('#workshopPricingSection[data-job-kind="components"] :is('));
  const selector=rule.slice(0,rule.indexOf('{'));
  for(const id of ['quoteLegacyLabourLine','quoteAdvancedPricingNote','quoteAdvancedPricing','quoteRodPriceHint','quoteCustomerTotalLine']){
    assert.ok(selector.includes(`#${id}`),id);
  }
});
test('Advanced Pricing is hidden unless the pricing section says it is on',()=>{
  assert.match(css,/#workshopPricingSection:not\(\[data-advanced-pricing="true"\]\) #quoteAdvancedPricing\{display:none\}/);
});

// ---------- 4. Review fixes (22 Nov 2026): GST clarity, document buttons, one heading style ----------
test('GST: the rod figure, the customer total and the GST Amount box each say what they cover',()=>{
  const c=pricing(newBuild());
  assert.equal(c.rodPriceHintText({currencyCode:'NZD',taxActive:true,taxName:'GST',rodTax:'$117.26',jobType:'build'}),'NZD · GST on the rod $117.26');
  assert.equal(c.rodPriceHintText({currencyCode:'NZD',taxActive:true,taxName:'VAT',rodTax:'$9.00',jobType:'repair'}),'NZD · VAT on the repair $9.00');
  assert.equal(c.rodPriceHintText({currencyCode:'AUD',taxActive:false,taxName:'GST',rodTax:'$0.00',jobType:'build'}),'AUD');
  assert.equal(c.customerTotalLineText({total:'$933.50',totalTax:'$121.76',taxActive:true,taxName:'GST'}),
    'Customer total with delivery: $933.50 (incl. GST $121.76)');
  assert.equal(c.customerTotalLineText({total:'$812.00',totalTax:'$0.00',taxActive:false,taxName:'GST'}),'Customer total with delivery: $812.00');
  assert.equal(c.taxAmountLabel({taxName:'GST',jobType:'build',withDelivery:true}),'GST (rod + delivery)');
  assert.equal(c.taxAmountLabel({taxName:'GST',jobType:'build',withDelivery:false}),'GST (rod)');
  assert.equal(c.taxAmountLabel({taxName:'VAT',jobType:'repair',withDelivery:true}),'VAT (repair + delivery)');
  assert.equal(c.taxAmountLabel({taxName:'GST',componentsJob:true,withDelivery:true}),'GST Amount','Components jobs keep their label');
});
test('the build screen uses one section heading style: Fulfilment Method, Payment Status and Documents',()=>{
  assert.match(html,/<span class="quote-job-type__label build-section-heading">Fulfilment Method<\/span>/);
  assert.match(html,/<h3 class="quote-payment__heading build-section-heading">Payment Status<\/h3>/);
  assert.match(html,/<span class="workshop-build-actions-docs__label build-section-heading">Documents<\/span>/);
  assert.match(css,/#workshopScreen #workshopPricingSection \.build-section-heading\{[^}]*font-size:11px[^}]*\}/);
});
test('Documents are one compact row of secondary buttons; iPhone two per row at 44px; no full-width Customer Invoice',()=>{
  assert.doesNotMatch(css,/#viewInvoicePreviewBtn\{grid-column:1\/-1\}/);
  assert.match(css,/#workshopScreen \.workshop-build-actions-docs__grid\{display:flex;flex-wrap:wrap;gap:8px\}/);
  assert.match(css,/@media \(max-width:640px\)\{[^@]*#workshopPricingSection \.workshop-build-actions-docs__grid > \*\{flex:1 1 calc\(50% - 4px\)[^}]*\}[^@]*min-height:44px/);
});
test('the red active-target marker shows only with Advanced Pricing on (the simple screen has one price)',()=>{
  const src=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
  assert.match(src,/classList\.toggle\('quote-field--active-target',advancedPricingEnabled\(\) && !componentsPricing && pricingDriver===driverName\)/);
});
