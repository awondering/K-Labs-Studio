const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function extract(name,async=false){
  const start=source.indexOf(`${async?'async ':''}function ${name}(`);
  assert.ok(start>=0,`Missing ${name}`);
  const next=source.indexOf('\nfunction ',start+1);
  const nextAsync=source.indexOf('\nasync function ',start+1);
  const ends=[next,nextAsync].filter(index=>index>=0);
  return source.slice(start,ends.length?Math.min(...ends):source.length);
}

function harness(initial={}){
  const listeners=new Map();
  const elements={};
  const document={
    activeElement:null,
    querySelectorAll:()=>[elements.percent,elements.fixed],
  };
  function element(attributes={}){
    return {
      attributes:{...attributes},value:'',validity:{badInput:false},hidden:false,
      getAttribute(name){return this.attributes[name]??null;},
      setAttribute(name,value){this.attributes[name]=String(value);},
      addEventListener(name,fn){listeners.set(`${attributes.id||attributes['data-deposit-type']}:${name}`,fn);},
      dispatch(name){listeners.get(`${attributes.id||attributes['data-deposit-type']}:${name}`)?.();},
      blur(){if(document.activeElement===this){this.dispatch('change');document.activeElement=null;}},
    };
  }
  for(const id of ['quoteDepositValue','quoteDepositValueLabel','quoteDepositValueError','quoteDepositEnabled',
    'quoteDepositTypeField','quoteDepositValueField','quoteBalanceRemainingField','quoteBalanceRemaining','quoteBalanceRemainingLabel']){
    elements[id]=element({id});
  }
  elements.percent=element({'data-deposit-type':'percent'});
  elements.fixed=element({'data-deposit-type':'fixed'});
  const state={writes:0,allocations:0,dirty:0};
  const quote={depositEnabled:true,depositType:'fixed',depositValue:1180.75,
    payments:[{id:'p1',type:'deposit',amount:1180.75,date:'2026-10-18'}],...initial};
  const context=vm.createContext({
    quote,invalidDepositInput:null,document,
    $:id=>elements[id]||null,
    numberOrZero:value=>Number.isFinite(Number(value))?Number(value):0,
    normalizeDepositType:value=>value==='fixed'?'fixed':'percent',
    roundMoney:value=>Math.round(Number(value)*100)/100,
    quoteMaths:()=>({total:state.total??2500}),
    saveQuoteCurrent(){},markQuoteDirty(){state.dirty++;},
    updateQuoteActionPriority(){},updatePaymentBlock(){},syncWorkshopToggleButtons(){},
    activeCurrencyCode:()=>'NZD',currency:value=>`$${value.toFixed(2)}`,
    flashWorkshopStatus(message){state.message=message;},
    ensureCurrentQuoteNumber:async()=>{state.allocations++;},
    nextBuildNumber:()=>'test',
    persistBuildRecord(record){state.writes++;state.saved=JSON.parse(JSON.stringify(record));return {};},
    setActiveSavedBuildRef(){},
  });
  for(const name of ['depositMaths','depositValueValidationMessage','depositValidationMessage',
    'convertedDepositValueForType','bindDepositTypeAndValue','updateDepositFields']){
    vm.runInContext(extract(name),context);
  }
  vm.runInContext(extract('persistCurrentQuoteRecord',true),context);
  context.updateQuoteSummary=()=>context.updateDepositFields();
  context.bindDepositTypeAndValue();
  context.updateDepositFields();
  return {
    context,state,elements,document,
    edit(value){document.activeElement=elements.quoteDepositValue;elements.quoteDepositValue.value=String(value);elements.quoteDepositValue.dispatch('input');},
    switchTo(type){elements[type].dispatch('click');},
  };
}

test('focused input is committed before type conversion; repeated switches preserve payment and cents',()=>{
  const h=harness({depositValue:0});
  h.edit('1180.75');
  for(let i=0;i<20;i++){
    h.switchTo('percent');
    assert.equal(h.context.quote.depositType,'percent');
    assert.equal(h.elements.quoteDepositValue.value,'47.23');
    assert.equal(h.context.depositMaths().balanceOwing,1319.25);
    h.switchTo('fixed');
    assert.equal(h.context.quote.depositValue,1180.75);
    assert.equal(h.elements.quoteDepositValue.value,'1180.75');
  }
  assert.deepEqual(h.context.quote.payments,[{id:'p1',type:'deposit',amount:1180.75,date:'2026-10-18'}]);
});

test('saved build retains exact requirement and payment after reload and switching',async()=>{
  const h=harness({depositValue:1234.56});
  h.switchTo('percent');
  assert.ok(await h.context.persistCurrentQuoteRecord());
  const reopened=harness(JSON.parse(JSON.stringify(h.state.saved)));
  reopened.switchTo('fixed');
  assert.equal(reopened.context.quote.depositValue,1234.56);
  assert.equal(reopened.context.depositMaths().balanceOwing,1319.25);
  assert.equal(reopened.context.quote.payments[0].date,'2026-10-18');
});

test('out-of-range input and changed customer price block autosave without overwriting saved value',async()=>{
  const h=harness();
  h.edit('2500.01');
  assert.equal(h.context.quote.depositValue,1180.75);
  assert.match(h.elements.quoteDepositValueError.textContent,/customer price/);
  h.switchTo('percent');
  assert.equal(h.context.quote.depositType,'fixed');
  assert.equal(await h.context.persistCurrentQuoteRecord(),null);
  assert.equal(h.state.allocations,0);
  assert.equal(h.state.writes,0);
  h.edit('2500');
  assert.ok(await h.context.persistCurrentQuoteRecord());
  h.state.total=2499;
  assert.equal(await h.context.persistCurrentQuoteRecord(),null);
  assert.equal(h.state.writes,1);
  assert.equal(h.context.quote.depositValue,2500);
});

test('invalid saved values remain unchanged and require explicit correction',async()=>{
  const h=harness({depositValue:29518.75});
  assert.equal(h.elements.quoteDepositValue.value,'29518.75');
  assert.match(h.elements.quoteDepositValueError.textContent,/preserved/);
  h.switchTo('percent');
  assert.equal(h.context.quote.depositValue,29518.75);
  assert.equal(h.context.quote.depositType,'fixed');
  assert.equal(await h.context.persistCurrentQuoteRecord(),null);
  h.edit('1180.75');
  assert.ok(await h.context.persistCurrentQuoteRecord());
  assert.equal(h.state.saved.depositValue,1180.75);
  assert.equal(h.state.saved.payments[0].amount,1180.75);
});

test('invalid saved percentages cannot be converted or saved until corrected',async()=>{
  const h=harness({depositType:'percent',depositValue:1180.75});
  h.switchTo('fixed');
  assert.equal(h.context.quote.depositType,'percent');
  assert.equal(h.context.quote.depositValue,1180.75);
  assert.equal(await h.context.persistCurrentQuoteRecord(),null);
  assert.equal(h.state.writes,0);
  h.edit('47.23');
  h.switchTo('fixed');
  assert.equal(h.context.quote.depositValue,1180.75);
  assert.ok(await h.context.persistCurrentQuoteRecord());
});

test('limits cover zero, 100 percent, fixed total, negatives and zero customer price',()=>{
  const h=harness({depositType:'percent',depositValue:100});
  h.switchTo('fixed');
  assert.equal(h.context.quote.depositValue,2500);
  h.switchTo('percent');
  assert.equal(h.context.quote.depositValue,100);
  h.edit('100.01');
  assert.match(h.context.depositValidationMessage(),/between 0 and 100/);
  h.edit('-1');
  assert.match(h.context.depositValidationMessage(),/between 0 and 100/);
  h.edit('0');
  h.switchTo('fixed');
  assert.equal(h.context.quote.depositValue,0);
  h.state.total=0;
  h.edit('0.01');
  assert.match(h.context.depositValidationMessage(),/customer price/);
  h.edit('0');
  h.switchTo('percent');
  assert.equal(h.context.quote.depositValue,0);
});
