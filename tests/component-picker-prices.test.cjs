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

// Mocked library and quote state only; no real storage is touched.
function harness(records,components){
  const c={
    quote:{components},
    records,
    expandedComponentRowIndex:-1,
    saves:0,
    specificationValue:(v)=>String(v==null?'':v).trim(),
    numberOrZero:(v)=>{const n=Number(v);return Number.isFinite(n)?n:0;},
    isBlankCategory:(v)=>String(v||'').trim().toLowerCase()==='blank',
    componentLibraryRecords:()=>c.records,
    componentLibraryStockValue:()=>undefined,
    componentSizePickerOptions:()=>[],
    shouldMergeDuplicateComponentCategory:()=>true,
    syncQuoteBlankFromComponents(){},
    saveQuoteCurrent(){c.saves++;},
    markQuoteDirty(){},
    renderQuoteComponents(){},
    updateQuoteSummary(){},
    syncComponentRowEditorInputs(){},
    document:{querySelector:()=>null},
  };
  vm.createContext(c);
  const names=['normalizeNameKey','normalizeComponent','mergeComponentRecord','normalizeUniqueComponents','enforceSingleSourceComponents','componentRowIsEffectivelyEmpty','componentRowHasMeaningfulData','findComponentLibraryRecordByName','applyComponentLibraryRecordToRow','setChoiceValue','applyChoiceSelection','defaultComponentRow'];
  vm.runInContext(names.map(functionSource).join('\n'),c);
  vm.runInContext('quote.components=quote.components.map((r)=>r);',c);
  return c;
}
const decal={id:'lib-decal',name:'Standard text decal',category:'Decals',subcategory:'Text',brand:'K-Labs',unitCost:1,cost:1,unitPrice:25};
const pick=(c,id,name)=>vm.runInContext(`applyChoiceSelection(${JSON.stringify(name)},${JSON.stringify(id)},{type:'category',index:0})`,c);
test('new component receives library $1 buy / $25 sell',()=>{
  const c=harness([decal],[{category:'',subcategory:'',description:'',customerLabel:'',supplier:'',quantity:1,cost:0}]);
  pick(c,'lib-decal','Standard text decal');
  const row=c.quote.components[0];
  assert.equal(row.cost,1);
  assert.equal(row.unitPrice,25);
  assert.equal(row.libraryComponentId,'lib-decal');
  assert.equal(row.quantity,1);
  assert.equal(row.brand,'K-Labs');
  assert.equal(c.records[0].unitPrice,25,'library untouched');
});

test('legitimate zero library prices stay zero',()=>{
  const c=harness([{...decal,unitCost:0,cost:0,unitPrice:0}],[{category:'',quantity:1,cost:0}]);
  pick(c,'lib-decal','Standard text decal');
  assert.equal(c.quote.components[0].cost,0);
  assert.equal(c.quote.components[0].unitPrice,0);
});

test('re-picking an already bound line keeps its build override',()=>{
  const c=harness([decal],[{category:'Standard text decal',libraryComponentId:'lib-decal',quantity:3,cost:4,unitPrice:40}]);
  pick(c,'lib-decal','Standard text decal');
  const row=c.quote.components[0];
  assert.equal(row.cost,4);
  assert.equal(row.unitPrice,40);
  assert.equal(row.quantity,3);
});

test('picking a component already on another line merges without overwriting its override',()=>{
  const c=harness([decal],[
    {category:'',quantity:1,cost:0},
    {category:'Standard text decal',libraryComponentId:'lib-decal',quantity:2,cost:4,unitPrice:40},
  ]);
  pick(c,'lib-decal','Standard text decal');
  const rows=c.quote.components.filter((r)=>r.category);
  assert.equal(rows.length,1);
  assert.equal(rows[0].cost,4);
  assert.equal(rows[0].unitPrice,40);
});

test('saved row round-trips through normalisation with prices',()=>{
  const c=harness([decal],[{category:'',quantity:1,cost:0}]);
  pick(c,'lib-decal','Standard text decal');
  const reloaded=vm.runInContext('normalizeUniqueComponents(quote.components,{keepDraftRows:false})',c)[0];
  assert.equal(reloaded.cost,1);
  assert.equal(reloaded.unitPrice,25);
});
