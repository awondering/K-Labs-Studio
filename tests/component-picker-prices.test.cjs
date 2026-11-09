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
    pendingComponentDraftRows:new Set(),
    saves:0,
    specificationValue:(v)=>String(v==null?'':v).trim(),
    numberOrZero:(v)=>{const n=Number(v);return Number.isFinite(n)?n:0;},
    isBlankCategory:(v)=>String(v||'').trim().toLowerCase()==='blank',
    componentLibraryRecords:()=>c.records,
    componentLibraryStockValue:()=>undefined,
    componentSizePickerOptions:()=>[],
    shouldMergeDuplicateComponentCategory:()=>true,
    syncQuoteBlankFromComponents(){},
    saveQuoteCurrent(){c.saves++;if(c.failSaveAt===c.saves)throw new Error('storage failed');},
    markQuoteDirty(){},
    renderQuoteComponents(){},
    updateQuoteSummary(){},
    syncComponentRowEditorInputs(){},
    document:{querySelector:()=>null},
  };
  vm.createContext(c);
  const names=['normalizeNameKey','normalizeComponent','mergeComponentRecord','normalizeUniqueComponents','enforceSingleSourceComponents','componentRowIsEffectivelyEmpty','componentRowHasMeaningfulData','findComponentLibraryRecordByName','applyComponentLibraryRecordToRow','setChoiceValue','applyChoiceSelection','applyComponentSizeSelection','prependComponentDraftRow','applyComponentSizeSelections','defaultComponentRow'];
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

test('adding a draft collapses after saving and its summary can be reopened',()=>{
  const c=harness([decal],[{category:'',quantity:1,cost:0}]);
  c.pendingComponentDraftRows.add(c.quote.components[0]);
  c.expandedComponentRowIndex=0;
  pick(c,'lib-decal','Standard text decal');
  assert.equal(c.expandedComponentRowIndex,-1);
  assert.equal(c.quote.components[0].unitPrice,25);
  assert.equal(c.pendingComponentDraftRows.has(c.quote.components[0]),false);
  Object.assign(c,{
    pruneComponentDraftRows:()=>({changed:false,indexMap:new Map()}),
    persistComponentDraftCleanup(){},hideComponentRowMenu(){},waitForDomRender(){},
  });
  vm.runInContext(functionSource('toggleComponentRow'),c);
  c.toggleComponentRow(0,{focusDescription:false});
  assert.equal(c.expandedComponentRowIndex,0);
  c.toggleComponentRow(0,{focusDescription:false});
  assert.equal(c.expandedComponentRowIndex,-1);
});

test('failed save keeps a new component editor expanded',()=>{
  for(const failSaveAt of [1,2,3]){
    const c=harness([decal],[{category:'',quantity:1,cost:0}]);
    c.pendingComponentDraftRows.add(c.quote.components[0]);
    c.expandedComponentRowIndex=0;
    c.failSaveAt=failSaveAt;
    assert.throws(()=>pick(c,'lib-decal','Standard text decal'),/storage failed/);
    assert.equal(c.expandedComponentRowIndex,0);
  }
});

test('existing component re-selection remains expanded',()=>{
  const c=harness([decal],[{category:'Standard text decal',libraryComponentId:'lib-decal',quantity:1,cost:1,unitPrice:25}]);
  c.expandedComponentRowIndex=0;
  pick(c,'lib-decal','Standard text decal');
  assert.equal(c.expandedComponentRowIndex,0);
});

test('new single and multiple sized selections collapse only after saving',()=>{
  const sized={...decal,sizeOptions:['8','10']};
  const c=harness([sized],[{category:'',quantity:1,cost:0}]);
  c.expandedComponentRowIndex=0;
  c.pendingComponentDraftRows.add(c.quote.components[0]);
  c.applyComponentSizeSelection(0,sized.name,'8',sized.id);
  assert.equal(c.expandedComponentRowIndex,-1);
  assert.equal(c.quote.components[0].selectedSize,'8');
  const multi=harness([sized],[{category:'',quantity:1,cost:0}]);
  multi.expandedComponentRowIndex=0;
  multi.pendingComponentDraftRows.add(multi.quote.components[0]);
  multi.applyComponentSizeSelections(0,sized.name,['8','10'],sized.id);
  assert.equal(multi.expandedComponentRowIndex,-1);
  assert.deepEqual(Array.from(multi.quote.components,row=>row.selectedSize).sort(),['10','8']);
  const failed=harness([sized],[{category:'',quantity:1,cost:0}]);
  failed.expandedComponentRowIndex=0;
  failed.pendingComponentDraftRows.add(failed.quote.components[0]);
  failed.failSaveAt=1;
  assert.throws(()=>failed.applyComponentSizeSelections(0,sized.name,['8','10'],sized.id),/storage failed/);
  assert.notEqual(failed.expandedComponentRowIndex,-1);
});

test('changing the size of an existing component keeps its editor open',()=>{
  const c=harness([decal],[{category:decal.name,libraryComponentId:decal.id,selectedSize:'8',quantity:1,cost:4,unitPrice:40}]);
  c.expandedComponentRowIndex=0;
  c.applyComponentSizeSelection(0,decal.name,'10',decal.id);
  assert.equal(c.expandedComponentRowIndex,0);
  assert.equal(c.quote.components[0].selectedSize,'10');
  assert.equal(c.quote.components[0].unitPrice,40);
});
