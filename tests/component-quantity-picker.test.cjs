// Components quantity & multiple-size selection: select once, set quantities (and sizes), add once.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
function harness(records,components){
  const c={
    quote:{components},records,expandedComponentRowIndex:3,pendingComponentDraftRows:new Set(),shouldAnimateComponentRows:false,
    componentPickQuantities:new Map(),saves:0,dirty:0,renders:0,
    numberOrZero:(v)=>{const n=Number(v);return Number.isFinite(n)?n:0;},
    componentLibraryRecords:()=>c.records,
    findComponentLibraryRecordByName:(name)=>c.records.find((r)=>r.name.toLowerCase()===String(name).toLowerCase()),
    saveQuoteCurrent(){c.saves++;},markQuoteDirty(){c.dirty++;},renderQuoteComponents(){c.renders++;},updateQuoteSummary(){},
  };
  vm.createContext(c);
  vm.runInContext(['specificationValue','normalizeNameKey','shouldMergeDuplicateComponentCategory','componentRowIsEffectivelyEmpty','defaultComponentRow',
    'clampComponentQuantity','componentRowQuantity','componentRowLineCost','applyComponentLibraryRecordFields','componentPickKey','componentPickQuantity',
    'setComponentPickQuantity','componentPickTotals','componentLineMatchesPick','addComponentPicksToBuild'].map(functionSource).join('\n'),c);
  return c;
}
const run=(c,code)=>{const v=vm.runInContext(code,c);return v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;};
const grip={id:'lib-grip',name:'EVA Grip 75 mm',subcategory:'EVA Grips',brand:'K-Labs',unitCost:9,cost:9,unitPrice:18};
const checks=[8,10,12].map((mm,i)=>({id:`lib-wc-${mm}`,name:`Aluminium Winding Check ${mm} mm`,subcategory:'Grip Winding Checks',unitCost:2.5+i,cost:2.5+i,unitPrice:6+i}));
const decal={id:'lib-decal',name:'Custom Decal',subcategory:'Rod Decals',unitCost:4,cost:4,unitPrice:12,sizeOptions:['Small','Medium','Large']};
const draft=()=>({category:'',subcategory:'',description:'',customerLabel:'',supplier:'',quantity:1,cost:0});
const lines=(c)=>JSON.parse(JSON.stringify(c.quote.components.map((r)=>[r.category,r.selectedSize||'',r.quantity,r.cost,r.unitPrice])));

test('one component, chosen at the default 1 and raised before adding, becomes one line at that quantity',()=>{
  const c=harness([grip],[draft()]);
  c.pendingComponentDraftRows.add(c.quote.components[0]);
  assert.equal(run(c,"setComponentPickQuantity({id:'lib-grip',name:'EVA Grip 75 mm',size:''},1)"),1);
  run(c,"setComponentPickQuantity({id:'lib-grip',name:'EVA Grip 75 mm',size:''},componentPickQuantity(componentPickKey('lib-grip','EVA Grip 75 mm',''))+1)");
  assert.deepEqual(run(c,'componentPickTotals()'),{lines:1,items:2});
  const result=run(c,'addComponentPicksToBuild(0,Array.from(componentPickQuantities.values()))');
  assert.deepEqual(result,{added:1,increased:0});
  assert.deepEqual(lines(c),[['EVA Grip 75 mm','',2,9,18]]);
  assert.equal(c.quote.components[0].libraryComponentId,'lib-grip');
  assert.equal(c.quote.components[0].brand,'K-Labs');
  assert.equal(c.pendingComponentDraftRows.size,0,'the empty draft line is gone');
  assert.equal(run(c,'componentRowLineCost(quote.components[0])'),18,'cost is Buy x Qty');
  assert.equal(c.saves,1,'one save for the whole add');
  assert.equal(c.expandedComponentRowIndex,-1);
});

test('several sizes from one family, each at its own quantity, are added at once as separate lines with their own prices',()=>{
  const c=harness(checks,[draft()]);
  run(c,`[['lib-wc-8',1],['lib-wc-10',2],['lib-wc-12',1]].forEach(([id,q])=>setComponentPickQuantity({id,name:componentLibraryRecords().find(r=>r.id===id).name,size:''},q))`);
  run(c,'addComponentPicksToBuild(0,Array.from(componentPickQuantities.values()))');
  assert.deepEqual(lines(c),[
    ['Aluminium Winding Check 8 mm','',1,2.5,6],
    ['Aluminium Winding Check 10 mm','',2,3.5,7],
    ['Aluminium Winding Check 12 mm','',1,4.5,8]]);
});

test('sizes of one component are separate lines; quantity 0 adds nothing',()=>{
  const c=harness([decal],[draft()]);
  run(c,"setComponentPickQuantity({id:'lib-decal',name:'Custom Decal',size:'Small'},1)");
  run(c,"setComponentPickQuantity({id:'lib-decal',name:'Custom Decal',size:'Large'},3)");
  run(c,"setComponentPickQuantity({id:'lib-decal',name:'Custom Decal',size:'Medium'},2)");
  run(c,"setComponentPickQuantity({id:'lib-decal',name:'Custom Decal',size:'Medium'},0)");
  run(c,'addComponentPicksToBuild(0,Array.from(componentPickQuantities.values()))');
  assert.deepEqual(lines(c),[['Custom Decal','Small',1,4,12],['Custom Decal','Large',3,4,12]]);
});

test('a component already on the build gains the quantity; its edited prices are kept; a different size is never merged',()=>{
  const existing={category:'Custom Decal',libraryComponentId:'lib-decal',selectedSize:'Small',quantity:2,cost:5,unitPrice:15,description:'Gold'};
  const c=harness([decal,grip],[draft(),existing]);
  const result=run(c,`addComponentPicksToBuild(0,[{id:'lib-decal',name:'Custom Decal',size:'Small',quantity:3},{id:'lib-decal',name:'Custom Decal',size:'Large',quantity:1},{id:'lib-grip',name:'EVA Grip 75 mm',size:'',quantity:1}])`);
  assert.deepEqual(result,{added:2,increased:1});
  assert.deepEqual(lines(c),[['Custom Decal','Large',1,4,12],['EVA Grip 75 mm','',1,9,18],['Custom Decal','Small',5,5,15]]);
  assert.equal(c.quote.components[2].description,'Gold');
});

test('an "Other" line and an unlinked line of another component are never merged into',()=>{
  const c=harness([grip],[draft(),{category:'Other',quantity:1,cost:3},{category:'EVA Grip 75 mm',libraryComponentId:'lib-other',quantity:1,cost:9}]);
  run(c,"addComponentPicksToBuild(0,[{id:'lib-grip',name:'EVA Grip 75 mm',size:'',quantity:1},{id:'',name:'Other',size:'',quantity:1}])");
  assert.equal(c.quote.components.filter((r)=>r.category==='EVA Grip 75 mm').length,2);
  assert.equal(c.quote.components.filter((r)=>r.category==='Other').length,2);
});

test('nothing chosen changes nothing',()=>{
  const c=harness([grip],[draft()]);
  assert.deepEqual(run(c,'addComponentPicksToBuild(0,[])'),{added:0,increased:0});
  assert.equal(c.saves,0);
  assert.equal(c.quote.components.length,1);
});

test('quantities stay within 0..999 and a line never exceeds 999',()=>{
  const c=harness([grip],[draft(),{category:'EVA Grip 75 mm',libraryComponentId:'lib-grip',quantity:998,cost:9}]);
  assert.equal(run(c,"setComponentPickQuantity({id:'lib-grip',name:'EVA Grip 75 mm'},-4)"),0);
  assert.equal(run(c,"setComponentPickQuantity({id:'lib-grip',name:'EVA Grip 75 mm'},5000)"),999);
  run(c,"addComponentPicksToBuild(0,[{id:'lib-grip',name:'EVA Grip 75 mm',size:'',quantity:5}])");
  assert.equal(c.quote.components.find((r)=>r.libraryComponentId==='lib-grip').quantity,999);
});
