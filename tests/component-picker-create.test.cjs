const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

// Isolated state: no real storage, DOM or build screen is touched.
function harness({failSave=false,records=[],picker}={}){
  const list={innerHTML:''};
  const search={value:''};
  const nameInput={value:'Fuji Tip Top',focus(){}};
  const c={
    list,search,nameInput,failSave,records,
    calls:[],
    quote:{components:[{category:'',unitPrice:0,cost:0,quantity:1,custom:'keep'}]},
    studioScreenView:'workflow',
    $:(id)=>id==='choicePickerList'?list:id==='choicePickerSearch'?search:id==='choicePickerTitle'?{textContent:''}:null,
    document:{activeElement:{id:'opener',isConnected:true},querySelectorAll:()=>[],querySelector:()=>null},
    escapeHtml:(v)=>String(v),
    openChoicePicker(type,index,opener){c.calls.push(['open',type,index,opener&&opener.id]);c.activeChoicePicker={type,index,stage:'category',categoryName:'',subcategoryName:'',brandName:''};},
    closeComponentSheet(){c.calls.push(['close']);c.activeChoicePicker={type:'category',index:-1,stage:'category',categoryName:'',subcategoryName:''};},
    syncComponentPickerBackButton(){},
    choicePickerTitle:()=>'Add Component',
    renderChoicePickerOptions(q){c.calls.push(['render',q]);},
    renderStudioScreenMode(){c.calls.push(['screen',c.studioScreenView]);},
    renderStudioComponentsLibrary(){},
    studioComponentNameInput:()=>nameInput,
    studioSubcategorySelectionByName:()=>null,
    explicitBrandForSubcategory:()=>'',
    UNASSIGNED_COMPONENT_CATEGORY:'Unassigned',
    normalizeNameKey:(n)=>String(n||'').trim().toLowerCase(),
    hideChoicePickerMenu(){},
    componentPickerStageOptions:()=>c.options||[],
    componentPickerLeafSecondaryText:()=>'',
    componentDisplayIdentity:(x)=>x.category,
    choiceOptionIsSelected:()=>false,
    clearStudioComponentSavedTimer(){},
    openInfoDialog(){},
    NON_COMPONENT_LINE_ITEM_NAMES:[],
    findComponentLibraryRecordByName:(n)=>c.records.find((r)=>r.name.toLowerCase()===String(n).toLowerCase())||null,
    componentLibraryRecords:()=>c.records,
    currentStudioComponentRecord:()=>c.studioComponentDraft,
    normalizeComponentSizeOptions:(v)=>v||[],
    activeTrackComponentStock:()=>false,
    removeComponentLibraryRecord(){},
    ensureStudioComponentTaxonomyLoaded:()=>c.taxonomy,
    taxonomy:{categories:[{id:'cat-g',name:'Guides',subcategories:[{id:'sub-f',name:'Fuji Tips'}]}]},
    studioCategoryByName:(n)=>c.taxonomy.categories.find((x)=>x.name.toLowerCase()===String(n).toLowerCase()),
    studioComponentTaxonomyState:null,
    studioTaxonomyId:(p)=>`${p}-x`,
    saveStudioComponentTaxonomy(){},
    syncStudioComponentSaveButtonState(){},
    window:{setTimeout:()=>1},
    upsertComponentLibraryRecord(name,rec){
      if(c.failSave)throw new Error('quota');
      c.records.push({...rec,id:rec.id||'new-id',name});
    },
    studioComponentDetailPayloadFromDom:()=>({name:'Fuji Tip Top',description:'',brand:'Fuji',category:'Guides',subcategory:'Fuji Tips',cost:1,unitPrice:25,stockOnHand:undefined,sizeOptions:[]}),
    studioComponentPayloadSignature:(p)=>JSON.stringify(p),
    studioComponentsSearch:'x',
    studioLibraryPath:{level:'component',categoryId:'',subcategoryId:''},
    studioLibraryEditor:{type:'',mode:'',targetName:''},
    studioComponentDraft:null,
    componentPickerReturnContext:null,
    studioSelectedComponentRef:null,
    studioSelectedComponentKey:'',
    studioComponentDetailContext:{isAddMode:true,baseline:'',savedTimer:0,savedFlash:false},
    activeChoicePicker:picker||{type:'category',index:0,stage:'component',categoryName:'Guides',subcategoryName:'Fuji Tips',brandName:'Fuji'},
  };
  c.studioComponentTaxonomyState=c.taxonomy;
  vm.createContext(c);
  const names=['resolveComponentPickerDestination','startComponentCreateFromPicker','returnToComponentPicker','componentPickerReturnActive','beginStudioComponentAdd','renderComponentPickerCascadeOptions','commitStudioComponentDetails'];
  // Top-level `let` bindings are not exposed as context properties, so access them via runInContext.
  vm.runInContext(`var __state={};${names.map(functionSource).join('\n')}`,c);
  return c;
}
const get=(c,expr)=>vm.runInContext(expr,c);

test('picker shows the create action in populated and empty component lists, with useful guidance',()=>{
  const c=harness({picker:{type:'category',index:0,stage:'component',categoryName:'Guides',subcategoryName:'Fuji Tips',brandName:''}});
  c.options=[{name:'Fuji Tip Top',id:'a',isDrill:false,record:{}}];
  c.renderComponentPickerCascadeOptions('');
  assert.match(c.list.innerHTML,/data-choice-create-component="true"[^>]*>\+ CREATE COMPONENT</);
  assert.match(c.list.innerHTML,/data-choice-id="a"/);
  c.options=[];
  c.renderComponentPickerCascadeOptions('');
  assert.match(c.list.innerHTML,/\+ CREATE COMPONENT/);
  assert.doesNotMatch(c.list.innerHTML,/Add components in Components/);
  assert.match(c.list.innerHTML,/Create a component/);
  c.activeChoicePicker.stage='subcategory';
  c.renderComponentPickerCascadeOptions('');
  assert.doesNotMatch(c.list.innerHTML,/CREATE COMPONENT/);
});

test('create from picker preselects category/family, then save returns to the picker without touching the build',()=>{
  const c=harness();
  const buildBefore=JSON.stringify(c.quote);
  c.search.value='tip';
  vm.runInContext('studioComponentDraft=null',c);
  c.startComponentCreateFromPicker();
  assert.deepEqual(c.calls.slice(0,2).map((x)=>x[0]),['close','screen']);
  assert.equal(get(c,'studioScreenView'),'components');
  assert.equal(get(c,'studioComponentDraft.category'),'Guides');
  assert.equal(get(c,'studioComponentDraft.subcategory'),'Fuji Tips');
  assert.equal(get(c,'componentPickerReturnActive()'),true);
  c.calls.length=0;
  assert.equal(c.commitStudioComponentDetails(),true);
  assert.equal(c.records.length,1);
  assert.equal(c.records[0].cost,1);
  assert.equal(c.records[0].unitPrice,25);
  assert.equal(c.records[0].id,'new-id');
  assert.deepEqual(c.calls.find((x)=>x[0]==='open'),['open','category',0,'opener']);
  assert.equal(get(c,'activeChoicePicker.stage'),'component');
  assert.equal(get(c,'activeChoicePicker.categoryName'),'Guides');
  assert.equal(get(c,'activeChoicePicker.subcategoryName'),'Fuji Tips');
  assert.equal(get(c,'studioScreenView'),'workflow');
  assert.equal(get(c,'componentPickerReturnContext'),null);
  assert.equal(c.search.value,'');
  assert.equal(JSON.stringify(c.quote),buildBefore,'new component is not added to the build');
});

test('create from an empty family preselects it and the saved record is listed to select',()=>{
  const c=harness({picker:{type:'category',index:0,stage:'component',categoryName:'Guides',subcategoryName:'Fuji Tips',brandName:''}});
  c.startComponentCreateFromPicker();
  c.commitStudioComponentDetails();
  c.options=c.records.map((r)=>({name:r.name,id:r.id,isDrill:false,record:r}));
  c.renderComponentPickerCascadeOptions('');
  assert.match(c.list.innerHTML,/data-choice-id="new-id"/);
});

test('cancel returns to the same picker, creates nothing and keeps the build and filters',()=>{
  const c=harness();
  c.search.value='tip';
  const buildBefore=JSON.stringify(c.quote);
  c.startComponentCreateFromPicker();
  c.calls.length=0;
  assert.equal(get(c,'componentPickerReturnActive()'),true);
  get(c,'returnToComponentPicker(null)');
  assert.equal(c.records.length,0);
  assert.equal(get(c,'activeChoicePicker.categoryName'),'Guides');
  assert.equal(get(c,'activeChoicePicker.subcategoryName'),'Fuji Tips');
  assert.equal(get(c,'activeChoicePicker.brandName'),'Fuji');
  assert.equal(c.search.value,'tip');
  assert.equal(JSON.stringify(c.quote),buildBefore);
  assert.match(source,/if\(componentPickerReturnActive\(\)\)\{\s*returnToComponentPicker\(null\);/,'Back wired to cancel');
});

test('save failure keeps the editor and context so retry succeeds',()=>{
  const c=harness({failSave:true});
  c.startComponentCreateFromPicker();
  c.calls.length=0;
  assert.throws(()=>c.commitStudioComponentDetails(),/quota/);
  assert.equal(get(c,'studioScreenView'),'components');
  assert.notEqual(get(c,'studioComponentDraft'),null,'editor draft retained');
  assert.equal(get(c,'componentPickerReturnActive()'),true);
  assert.equal(c.calls.some((x)=>x[0]==='open'),false);
  c.failSave=false;
  assert.equal(c.commitStudioComponentDetails(),true);
  assert.equal(c.records.length,1);
  assert.equal(c.calls.some((x)=>x[0]==='open'),true);
});

test('normal component editor entry outside the picker is unaffected',()=>{
  const c=harness();
  get(c,'beginStudioComponentAdd("Guides","Fuji Tips")');
  assert.equal(get(c,'componentPickerReturnActive()'),false);
  c.calls.length=0;
  assert.equal(c.commitStudioComponentDetails(),true);
  assert.equal(c.calls.some((x)=>x[0]==='open'),false,'no picker return');
  assert.equal(get(c,'studioLibraryPath.level'),'component');
  assert.equal(c.records.length,1);
});

test('a stale return context is ignored once the editor draft is replaced',()=>{
  const c=harness();
  c.startComponentCreateFromPicker();
  get(c,'beginStudioComponentAdd("Guides","Fuji Tips")');
  assert.equal(get(c,'componentPickerReturnActive()'),false);
});

test('create action keeps a 44px target',()=>{
  assert.match(css,/\.component-sheet__add\.component-sheet__add--create\{[^}]*min-height:44px/);
});

test('identically named families under different categories: creation lands in the intended family by id',()=>{
  const c=harness({picker:{type:'category',index:0,stage:'component',categoryId:'cat-r',subcategoryId:'sub-r-fuji',categoryName:'Reel Seats',subcategoryName:'Fuji',brandName:''}});
  c.taxonomy.categories=[
    {id:'cat-g',name:'Guides',subcategories:[{id:'sub-g-fuji',name:'Fuji'}]},
    {id:'cat-r',name:'Reel Seats',subcategories:[{id:'sub-r-fuji',name:'Fuji'}]},
  ];
  c.studioComponentDetailPayloadFromDom=()=>({name:'Fuji Seat',description:'',brand:'',category:get(c,'studioComponentDraft.category'),subcategory:get(c,'studioComponentDraft.subcategory'),cost:1,unitPrice:25,stockOnHand:undefined,sizeOptions:[]});
  // Even if the picker's names were stale/ambiguous, ids decide, and the family is looked up only inside its own category.
  c.activeChoicePicker.categoryName='Guides';
  c.startComponentCreateFromPicker();
  assert.equal(get(c,'studioComponentDraft.category'),'Reel Seats');
  assert.equal(get(c,'studioComponentDraft.subcategory'),'Fuji');
  assert.equal(get(c,'componentPickerReturnContext.categoryId'),'cat-r');
  assert.equal(get(c,'componentPickerReturnContext.subcategoryId'),'sub-r-fuji');
  assert.equal(c.commitStudioComponentDetails(),true);
  assert.equal(c.records[0].category,'Reel Seats');
  assert.equal(c.records[0].categoryId,'cat-r');
  assert.equal(get(c,'activeChoicePicker.categoryId'),'cat-r');
  assert.equal(get(c,'activeChoicePicker.subcategoryId'),'sub-r-fuji');
  assert.equal(get(c,'activeChoicePicker.categoryName'),'Reel Seats');
});