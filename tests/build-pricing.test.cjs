const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function extractFunction(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`Missing function ${name}`);
  const next=source.indexOf('\nfunction ',start+1);
  return source.slice(start,next<0?source.length:next);
}

function pricingHarness(overrides={}){
  const context=vm.createContext({
    quote:{
      components:[{cost:40,unitPrice:70,quantity:1},{cost:60,unitPrice:90,quantity:1}],
      labourRate:25,
      labourHours:2,
      deliveryEntryMode:'breakdown',
      freight:12,
      packaging:3,
      deliveryTotal:15,
      freightCost:0,
      freightCharge:0,
      pricingDriver:'profit',
      targetProfit:20,
      marginPercent:0,
      markupPercent:0,
      finalCustomerPrice:0,
      priceAdjustment:0,
      gstRate:15,
      includeGst:true,
      taxEnabled:true,
      ...overrides,
    },
    taxAvailable:true,
    globalTaxEnabled:true,
    numberOrZero:value=>{
      const parsed=Number(value);
      return Number.isFinite(parsed)?parsed:0;
    },
    roundMoney:value=>Math.round((value+Number.EPSILON)*100)/100,
    freightAmount:value=>Math.max(0,Number.isFinite(Number(value))?Number(value):0),
    deliveryAmounts:null,
    normalizePricingDriver:value=>value==='profit'||value==='margin'?value:'price',
    enforceSingleSourceComponents(){},
    syncQuoteBlankFromComponents(){},
    componentRowsForTotals(){return context.quote.components;},
    componentRowLineCost:item=>item.cost*item.quantity,
    componentRowSellValue:item=>(Number(item.unitPrice)||0)*(Number(item.quantity)||1),
    quoteTaxAvailable:()=>context.taxAvailable&&context.quote.taxEnabled!==false,
    activeTaxEnabled:()=>context.globalTaxEnabled,
    activeDefaultLabourRate:()=>25,
    activeTaxRate:()=>15,
    normalizeUniqueComponents:items=>items,
    normalizeBuildSpecifications:()=>({}),
    normalizeGuideSpecification:()=>({}),
    normalizeAddressText:value=>String(value||'').trim(),
    normalizeQuoteMode:value=>value==='customer'?'customer':'internal',
    normalizeQuoteStatus:value=>value||'quote',
    normalizeDepositType:value=>value==='fixed'?'fixed':'percent',
    specificationValue:value=>String(value||'').trim(),
    migrateBlankWorkflow(){},
  });
  ['deliveryAmounts','naturalCustomerPrice','quoteMaths','setDeliveryBreakdown','setDeliveryTotal','applyManualFinalCustomerPrice','depositMaths']
    .forEach(name=>vm.runInContext(extractFunction(name),context));
  return context;
}

function assertClose(actual,expected){
  assert.ok(Math.abs(actual-expected)<0.01,`Expected ${actual} to be close to ${expected}`);
}

test('Required Profit and Margin drive rod pricing without delivery profit',()=>{
  const context=pricingHarness();
  let math=context.quoteMaths();
  assert.equal(math.total,212.75);
  assert.equal(math.gst,27.75);
  assert.equal(math.rodProfit,20);
  assertClose(math.rodMarginPercent,11.76);
  assertClose(math.exclusiveRevenue-math.materialCost-math.freightCost,70);

  context.quote.pricingDriver='margin';
  context.quote.marginPercent=20;
  math=context.quoteMaths();
  assertClose(math.rodMarginPercent,20);
  assertClose(math.freightCharge,17.25);
  assertClose(math.exclusiveRevenue-math.materialCost-math.freightCost,87.5);
});

test('Price driver and labour edits recalculate while delivery leaves rod targets unchanged',()=>{
  const context=pricingHarness({pricingDriver:'price',priceAdjustment:5});
  let math=context.quoteMaths();
  context.quote.labourHours=3;
  math=context.quoteMaths();
  assertClose(math.total,257.25);
  assertClose(math.exclusiveRevenue-math.materialCost-math.freightCost,108.7);
  context.quote.labourRate=30;
  math=context.quoteMaths();
  assertClose(math.total,272.25);
  assertClose(math.exclusiveRevenue-math.materialCost-math.freightCost,121.74);
  const originalRodProfit=math.rodProfit;
  const originalEarnings=math.exclusiveRevenue-math.materialCost-math.freightCost;

  context.setDeliveryBreakdown(0,7);
  math=context.quoteMaths();
  assertClose(math.deliveryCharge,8.05);
  context.setDeliveryBreakdown(18,0);
  math=context.quoteMaths();
  assertClose(math.deliveryCharge,20.7);
  context.setDeliveryBreakdown(18,7);
  math=context.quoteMaths();
  assertClose(math.deliveryCharge,28.75);
  assertClose(math.rodProfit,originalRodProfit);
  assertClose(math.exclusiveRevenue-math.materialCost-math.freightCost,originalEarnings);
});

test('Customer Price directly drives the full customer total including delivery',()=>{
  const context=pricingHarness({pricingDriver:'price'});
  context.applyManualFinalCustomerPrice(260);
  const math=context.quoteMaths();
  assert.equal(math.total,260);
  assert.equal(context.quote.pricingDriver,'price');
  assertClose(math.freightCharge,17.25);
});

test('Percentage and fixed deposits calculate against Customer Price including delivery',()=>{
  const context=pricingHarness({
    pricingDriver:'profit',
    depositEnabled:true,
    depositType:'percent',
    depositValue:20,
  });
  let math=context.depositMaths();
  assert.equal(math.total,212.75);
  assert.equal(math.depositAmount,42.55);
  assert.equal(math.remainingBalance,170.2);

  context.quote.depositType='fixed';
  context.quote.depositValue=50;
  math=context.depositMaths();
  assert.equal(math.depositAmount,50);
  assert.equal(math.remainingBalance,162.75);
});

test('Approved example matches Customer Price, tax, earnings, and deposit arithmetic',()=>{
  const context=pricingHarness({
    components:[{cost:95,unitPrice:95,quantity:1}],
    labourRate:75,
    labourHours:3,
    targetProfit:450,
    pricingDriver:'profit',
    freight:30,
    packaging:10,
    deliveryTotal:40,
    depositEnabled:true,
    depositType:'percent',
    depositValue:50,
  });
  const math=context.depositMaths();
  assert.equal(math.total,931.5);
  assert.equal(math.gst,121.5);
  assert.equal(math.exclusiveRevenue-math.materialCost-math.freightCost,675);
  assert.equal(math.depositAmount,465.75);
  assert.equal(math.remainingBalance,465.75);
});

test('Total-only and breakdown entry are exclusive; zero delivery contributes nothing',()=>{
  const context=pricingHarness();
  context.setDeliveryTotal(22);
  assert.equal(context.quote.deliveryEntryMode,'total');
  assert.equal(context.quote.freight,0);
  assert.equal(context.quote.packaging,0);
  assert.equal(context.deliveryAmounts(context.quote).cost,22);
  assertClose(context.deliveryAmounts(context.quote).charge,25.3);

  context.setDeliveryBreakdown(9,4);
  assert.equal(context.quote.deliveryEntryMode,'breakdown');
  assert.equal(context.quote.deliveryTotal,13);
  assert.equal(context.deliveryAmounts(context.quote).cost,13);
  assertClose(context.deliveryAmounts(context.quote).charge,14.95);

  context.setDeliveryTotal(0);
  const math=context.quoteMaths();
  assert.equal(math.deliveryCost,0);
  assert.equal(math.deliveryCharge,0);
});

test('Tax disabled retains delivery recovery and legacy freight stays separately stored',()=>{
  const context=pricingHarness({
    deliveryEntryMode:'legacy',
    freightCost:5,
    freightCharge:8,
    pricingDriver:'price',
    priceAdjustment:0,
  });
  let math=context.quoteMaths();
  assert.equal(math.freightCost,5);
  assert.equal(math.freightCharge,8);
  assertClose(math.gst,218*15/115);
  assert.equal(context.quote.freightCost,5);
  assert.equal(context.quote.freightCharge,8);

  context.quote.deliveryEntryMode='breakdown';
  context.quote.freight=12;
  context.quote.packaging=3;
  context.quote.deliveryTotal=15;
  context.quote.includeGst=false;
  context.taxAvailable=false;
  math=context.quoteMaths();
  assert.equal(math.gst,0);
  assertClose(math.exclusiveRevenue-math.materialCost-math.freightCost,110);
});

test('Saved legacy freight and modern delivery entry modes survive normalization',()=>{
  const context=pricingHarness();
  ['newQuoteTemplate','normalizeQuote'].forEach(name=>vm.runInContext(extractFunction(name),context));
  assert.deepEqual({...context.deliveryAmounts({freightCost:5,freightCharge:8})},{cost:5,charge:8});
  const legacy=context.normalizeQuote({
    freightCost:5,
    freightCharge:8,
    finalCustomerPrice:120,
  });
  assert.equal(legacy.deliveryEntryMode,'legacy');
  assert.equal(legacy.freightCost,5);
  assert.equal(legacy.freightCharge,8);
  assert.equal(legacy.finalCustomerPrice,120);

  const totalOnly=context.normalizeQuote({
    deliveryEntryMode:'total',
    deliveryTotal:22,
    freight:9,
    packaging:4,
  });
  assert.equal(totalOnly.freight,0);
  assert.equal(totalOnly.packaging,0);
  assert.equal(totalOnly.deliveryTotal,22);
  assert.equal(totalOnly.deliveryEntryMode,'total');

  const breakdown=context.normalizeQuote({
    deliveryEntryMode:'breakdown',
    freight:9,
    packaging:4,
    deliveryTotal:100,
  });
  assert.equal(breakdown.deliveryTotal,13);
});
