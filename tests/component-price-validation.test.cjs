const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function load(names,extra={}){
  const c=vm.createContext({
    normalizeNameKey:value=>String(value||'').trim().toLowerCase(),
    normalizeComponentSizeOptions:value=>Array.isArray(value)?value.slice():[],
    ...extra,
  });
  for(const name of names){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    const end=source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),c);
  }
  return c;
}
const priceNames=['componentPriceProblem','componentRecordBuyPrice','componentRecordsPriceProblem'];

test('price helper: blank/missing, negative and non-finite rejected; zero and decimals accepted',()=>{
  const c=load(priceNames);
  for(const bad of ['',' ',undefined,null,'abc','-0.01',-1,NaN,Infinity,'Infinity',true]){
    assert.notEqual(c.componentPriceProblem(bad,'Buy Price'),'',String(bad));
  }
  assert.match(c.componentPriceProblem('','Sell Price'),/Sell Price is required/);
  for(const good of ['0','0.00',0,'12.5',' 7 ',19.99])assert.equal(c.componentPriceProblem(good,'Buy Price'),'',String(good));
});

function editorHarness(existing,fields){
  const inputs={};
  for(const [id,value] of Object.entries(fields))inputs[id]={value};
  return load([...priceNames,'studioComponentPriceValidation'],{$:id=>inputs[id]||null,existing});
}

test('new component: blank, negative and invalid prices are reported per field; zero passes',()=>{
  const run=(cost,price)=>editorHarness(null,{studioComponentCost:cost,studioComponentUnitPrice:price})
    .studioComponentPriceValidation(null,false);
  assert.equal(run('','5').id,'studioComponentCost');
  assert.equal(run('5','').id,'studioComponentUnitPrice');
  assert.equal(run('-1','5').id,'studioComponentCost');
  assert.equal(run('5','-2').id,'studioComponentUnitPrice');
  assert.equal(run('abc','5').label,'Buy Price');
  assert.equal(run('0','0'),null);
  assert.equal(run('0.00','12.50'),null);
});

test('editing: legacy missing price must be corrected; valid prices preserved; changed prices validated',()=>{
  const legacy={cost:10,unitPrice:undefined};
  const run=(fields,existing,exempt)=>editorHarness(existing,fields).studioComponentPriceValidation(existing,exempt);
  assert.equal(run({studioComponentCost:'10',studioComponentUnitPrice:''},legacy,false).id,'studioComponentUnitPrice');
  assert.equal(run({studioComponentCost:'10',studioComponentUnitPrice:'0'},legacy,false),null);
  assert.equal(run({studioComponentCost:'10',studioComponentUnitPrice:'15'},legacy,false),null);
  assert.equal(run({studioComponentCost:'',studioComponentUnitPrice:'15'},legacy,false).id,'studioComponentCost');
  assert.equal(run({studioComponentCost:'-3',studioComponentUnitPrice:'15'},legacy,false).id,'studioComponentCost');
});

test('category move (exempt) does not block legacy unpriced component but still validates a changed price',()=>{
  const legacy={cost:undefined,unitPrice:undefined};
  const run=fields=>editorHarness(legacy,fields).studioComponentPriceValidation(legacy,true);
  assert.equal(run({studioComponentCost:'',studioComponentUnitPrice:''}),null);
  assert.equal(run({studioComponentCost:'-1',studioComponentUnitPrice:''}).id,'studioComponentCost');
  const unitCostOnly={unitCost:4,cost:undefined,unitPrice:9};
  const c=editorHarness(unitCostOnly,{studioComponentCost:'4',studioComponentUnitPrice:'9'});
  assert.equal(c.studioComponentPriceValidation(unitCostOnly,true),null);
});

test('rename editor without price inputs is not blocked',()=>{
  const c=load([...priceNames,'studioComponentPriceValidation'],{$:()=>null});
  assert.equal(c.studioComponentPriceValidation({},false),null);
});

function duplicateHarness(sourceRecord){
  const saved=[];
  const errors=[];
  const c=load(['commitStudioComponentDuplicate',...priceNames],{
    studioComponentDuplicateState:{mode:'component',name:''},
    currentStudioComponentRecord:()=>sourceRecord,
    $:id=>id==='studioComponentDuplicateName'?{value:'Copy'}:null,
    componentLibraryRecords:()=>[sourceRecord],
    componentDuplicateSheetError:message=>errors.push(message),
    saveComponentLibraryRecords:records=>saved.push(records),
    isInvalidLibraryCategoryName:()=>false,UNASSIGNED_COMPONENT_CATEGORY:'Unassigned',
    closeComponentDuplicateSheet(){},renderStudioComponentsLibrary(){},
    studioComponentDraft:null,studioLibraryEditor:{},studioSelectedComponentKey:'',studioLibraryPath:{},
  });
  return {c,saved,errors};
}

test('individual duplicate inherits valid prices (including zero) and blocks missing/invalid ones',()=>{
  const base={name:'Ring',category:'Guides',subcategory:'Fuji',stockOnHand:5};
  for(const [cost,unitPrice] of [[10,20],[0,0]]){
    const {c,saved,errors}=duplicateHarness({...base,cost,unitPrice});
    assert.equal(c.commitStudioComponentDuplicate(),true);
    assert.equal(errors.length,0);
    assert.equal(saved[0][0].cost,cost);
    assert.equal(saved[0][0].unitPrice,unitPrice);
    assert.equal(saved[0][0].category,'Guides');
    assert.equal(saved[0][0].subcategory,'Fuji');
    assert.equal(saved[0][0].stockOnHand,0);
  }
  for(const bad of [{cost:undefined,unitPrice:5},{cost:5,unitPrice:undefined},{cost:-1,unitPrice:5},{cost:5,unitPrice:NaN}]){
    const {c,saved,errors}=duplicateHarness({...base,...bad});
    assert.equal(c.commitStudioComponentDuplicate(),false);
    assert.equal(saved.length,0);
    assert.match(errors[0],/Cannot duplicate\. "Ring"/);
  }
});

function familyHarness(records){
  const saved=[];
  const errors=[];
  const category={id:'cat1',name:'Guides',subcategories:[{id:'s1',name:'Fuji'}]};
  const c=load(['duplicateStudioSubcategory',...priceNames],{
    studioCategoryByName:()=>category,
    componentLibraryRecords:()=>records,
    studioSubcategoryNamesForLibrary:()=>['Fuji'],
    ensureStudioComponentTaxonomyLoaded:()=>({categories:[category]}),
    normalizeStudioComponentTaxonomy:value=>JSON.parse(JSON.stringify(value)),
    studioTaxonomyId:prefix=>`${prefix}-new`,
    componentLibraryStorageKey:()=>'k',componentTaxonomyStorageKey:()=>'t',CUSTOM_SUPPLIER_STORAGE_KEY:'s',
    Store:{get:(key,fallback)=>fallback,set(){}},
    window:{},
    saveComponentLibraryRecords:list=>saved.push(list),saveStudioComponentTaxonomy(){},
    studioComponentTaxonomyState:null,studioComponentTaxonomySelection:{},
    studioComponentDraft:null,studioLibraryEditor:{},studioLibraryPath:{},
    closeComponentDuplicateSheet(){},renderStudioComponentsLibrary(){},openInfoDialog(){},
    componentDuplicateSheetError:message=>errors.push(message),
  });
  return {c,saved,errors};
}

test('family duplicate keeps valid prices on every copy and blocks if any source price is invalid',()=>{
  const mk=(name,cost,unitPrice)=>({name,category:'Guides',subcategory:'Fuji',cost,unitPrice,stockOnHand:3,sizeOptions:[]});
  const ok=familyHarness([mk('A',1,2),mk('B',0,0)]);
  assert.equal(ok.c.duplicateStudioSubcategory('Guides','Fuji','Fuji 2'),true);
  const copies=ok.saved[0].filter(record=>record.subcategory==='Fuji 2');
  assert.equal(copies.length,2);
  assert.equal(JSON.stringify(copies.map(record=>[record.cost,record.unitPrice])),'[[1,2],[0,0]]');
  assert.ok(copies.every(record=>record.category==='Guides'&&record.stockOnHand===0));

  const bad=familyHarness([mk('A',1,2),mk('B',3,undefined)]);
  assert.equal(bad.c.duplicateStudioSubcategory('Guides','Fuji','Fuji 2'),false);
  assert.equal(bad.saved.length,0);
  assert.match(bad.errors[0],/Cannot duplicate family\. "B": Sell Price is required/);
});

test('size generation and library save/sync functions carry no price validation',()=>{
  const body=name=>{
    const start=source.indexOf(`function ${name}(`);
    return source.slice(start,source.indexOf('\n}',start));
  };
  for(const name of ['generateStudioComponentSizeRange','addStudioComponentSizeFromInput','saveComponentLibraryRecords','upsertComponentLibraryRecord']){
    assert.doesNotMatch(body(name),/componentPriceProblem|componentRecordsPriceProblem|studioComponentPriceValidation/,name);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','js','component-sync.js'),'utf8'),/componentPriceProblem/);
});

test('library update from a build/quote row validates only at the explicit master update',()=>{
  const start=source.indexOf('async function runLibraryComponentUpdate(');
  const body=source.slice(start,source.indexOf('\n}',start));
  assert.match(body,/componentRecordsPriceProblem\(\[\{name:libraryName,cost:row\.cost,unitPrice:row\.unitPrice\}\]\)/);
  assert.ok(body.indexOf('componentRecordsPriceProblem')<body.indexOf('upsertComponentLibraryRecord'));
  const c=load(priceNames);
  assert.notEqual(c.componentRecordsPriceProblem([{name:'X',cost:'',unitPrice:5}]),'');
  assert.equal(c.componentRecordsPriceProblem([{name:'X',cost:0,unitPrice:0}]),'');
});
