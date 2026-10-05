const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const functions=[
  'numberOrZero','normalizeComponentSizeOptions','normalizeStudioComponentTaxonomy',
  'normalizeNameKey','compareTaxonomyDisplayNames','sortTaxonomyEntriesForDisplay',
  'sortComponentRecordsByName','explicitBrandForSubcategory','escapeAttributeValue',
  'studioCategoryNamesForLibrary','studioSubcategoryNamesForLibrary',
  'studioComponentRecordsForCategory','studioComponentRecordsForSubcategory',
  'beginStudioComponentAdd','studioComponentLibrarySelectionData','currentStudioComponentRecord',
  'studioComponentReference','studioComponentRecordByReference','studioComponentListRowMarkup',
  'closeStudioLibraryContextMenu','openStudioLibraryContextMenu','isStudioLibraryContextMenuOpen',
  'studioCategorySelectionById','studioSubcategorySelectionByName',
  'studioCategoryContextMenuMarkup','studioSubcategoryContextMenuMarkup',
  'studioCategoryListRowMarkup','studioSubcategoryListRowMarkup','studioComponentMatchesSearch',
  'renderStudioComponentsLibrary','bindStudioComponentsPanel',
  'studioTaxonomySectionMarkupCategories','studioTaxonomySectionMarkupSubcategories',
  'componentPickerSubcategoryStageOptions','componentPickerComponentStageOptions',
  'commitStudioComponentDuplicate','duplicateStudioSubcategory','commitStudioComponentDetails',
  'studioComponentPayloadSignature',
  'renderComponentDuplicateSheet',
  'compareComponentSizeLabels','componentSizeOptionsForDisplay','componentRecordSizeOptions',
  'studioComponentSizeChipMarkup','studioComponentSizesSectionMarkup','refreshStudioComponentSizeList',
  'addStudioComponentSizeFromInput','generateStudioComponentSizeRange','removeStudioComponentSize',
];

function harness({realSave=false}={}){
  const elements=new Map();
  function element(id){
    if(elements.has(id))return elements.get(id);
    const item={
      id,value:'',hidden:false,innerHTML:'',textContent:'',dataset:{},attributes:{},listeners:{},
      addEventListener(type,handler){this.listeners[type]=handler;},
      getAttribute(name){return this.attributes[name]||null;},
      setAttribute(name,value){this.attributes[name]=value;},
      closest(){return null;},querySelector(){return null;},querySelectorAll(){return [];},
      focus(){},select(){},click(){this.listeners.click?.({target:this});},
    };
    elements.set(id,item);
    return item;
  }
  [
    'studioComponentsPanel','studioComponentsList','studioComponentDetails','studioComponentsAddBtn',
    'studioComponentsBackBtn','studioComponentsBackLabel','studioComponentsTitle','studioComponentsSubtitle',
    'studioComponentsSearch','studioLibraryCategoryName','studioLibrarySubcategoryName',
    'studioComponentDuplicateName','studioComponentName','studioComponentOriginalName',
    'studioComponentDuplicateSheet','studioComponentDuplicateSubcategory',
    'studioComponentDuplicateCategory','studioComponentDuplicateNote',
    'studioComponentSizeList','studioComponentSizeInput','studioComponentSizeFrom',
    'studioComponentSizeTo','studioComponentSizeStep',
  ].forEach(element);
  let sequence=0;
  const store=new Map();
  const calls=[];
  const context=vm.createContext({
    Intl,Set,Map,console,
    $:id=>elements.get(id)||null,
    document:{addEventListener(){}},
    window:{setTimeout:()=>1},
    UNASSIGNED_COMPONENT_CATEGORY:'Unassigned',
    STUDIO_COMPONENT_NAME_COLLATOR:new Intl.Collator(undefined,{sensitivity:'base',numeric:true}),
    studioComponentTaxonomyState:{categories:[
      {id:'winding',name:'Winding Checks',subcategories:[{id:'silver',name:'Silver'},{id:'black',name:'black'}]},
      {id:'seats',name:'Reel Seats',subcategories:[{id:'fuji',name:'Fuji'}]},
    ],suppliers:[],brands:[{id:'brand',name:'Fuji'}]},
    records:[
      {id:'silver-item',name:'zeta',category:'Winding Checks',categoryId:'winding',subcategory:'Silver',brand:'Fuji',supplier:'Parts',cost:3.5,unitPrice:8,stockOnHand:12,sizeOptions:['2','10'],notes:'keep',buildRef:'build-1'},
      {id:'black-item',name:'Alpha',category:'Winding Checks',categoryId:'winding',subcategory:'black',brand:'Maker',supplier:'Parts',cost:4,unitPrice:9,stockOnHand:7,sizeOptions:['3']},
      ...['Black Silver','Gunmetal Hexy Duplicate','Hex'].map((name,index)=>({
        id:`direct-${index}`,name,category:'Winding Checks',categoryId:'winding',subcategory:'',
        brand:'Maker',supplier:'Parts',cost:2,unitPrice:6,stockOnHand:5,sizeOptions:['5','6'],
      })),
    ],
    studioLibraryPath:{level:'category',categoryId:'Winding Checks',subcategoryId:''},
    studioLibraryEditor:{type:'',mode:'',targetName:''},
    studioLibraryContextMenu:{type:'',key:''},
    studioComponentDraft:null,studioSelectedComponentKey:'',studioSelectedComponentRef:null,
    studioComponentsSearch:'',studioComponentTaxonomySelection:{category:'winding',subcategory:'black'},
    studioComponentDuplicateState:null,activeChoicePicker:{brandName:''},
    studioComponentDetailContext:{isAddMode:false,baseline:'',savedTimer:0,savedFlash:false},
    studioComponentSizeDraft:[],
    measurementUnitSuffix:()=> 'mm',
    Store:{get:(key,fallback)=>store.has(key)?plain(store.get(key)):fallback,set:(key,value)=>store.set(key,plain(value))},
    componentLibraryStorageKey:()=> 'records',
    componentTaxonomyStorageKey:()=> 'taxonomy',
    CUSTOM_SUPPLIER_STORAGE_KEY:'suppliers',
    studioTaxonomyId:prefix=>`${prefix}-test-${++sequence}`,
    escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
    isInvalidLibraryCategoryName:name=>name==='Category Missing',
    activeTrackComponentStock:()=>true,
    componentLibraryStockValue:record=>record.stockOnHand,
    studioTaxonomySectionMode:()=> 'edit',
    clearStudioComponentSavedTimer(){},
    syncStudioComponentSaveButtonState(){},
    studioComponentNameInput:()=>element('studioComponentName'),
    studioComponentDetailPayloadFromDom:()=>context.payload,
    closeComponentDuplicateSheet(){context.studioComponentDuplicateState=null;},
    componentDuplicateSheetError:message=>calls.push(['error',message]),
    openInfoDialog:(...args)=>calls.push(['info',...args]),
    renderStudioComponentDetails:(record)=>calls.push(['details',plain(record)]),
    refreshStudioComponentAndTaxonomyViews:()=>context.renderStudioComponentsLibrary(),
    studioRejectInvalidCategoryName:()=>false,
    runExplicitSave:(_button,action)=>action(),
    studioRenameCategoryById:(id,_old,name)=>context.records.forEach(record=>{if(record.categoryId===id)record.category=name;}),
    studioRenameSubcategory:(category,old,name)=>context.records.forEach(record=>{if(record.category===category && record.subcategory===old)record.subcategory=name;}),
    openSubcategoryDuplicateSheet:(category,family)=>calls.push(['family-duplicate',category.id,family.id]),
    openComponentMoveSheet:()=>calls.push(['component-move',context.currentStudioComponentRecord().id]),
    openComponentDuplicateSheet:()=>calls.push(['component-duplicate',context.currentStudioComponentRecord().id]),
    requestDeleteStudioComponent:record=>calls.push(['component-delete',record.id]),
    handleStudioTaxonomyAction:action=>calls.push(['taxonomy-action',action]),
  });
  Object.assign(context,{
    ensureStudioComponentTaxonomyLoaded:()=>context.studioComponentTaxonomyState,
    componentLibraryRecords:()=>context.records,
    studioCategoryByName:name=>context.studioComponentTaxonomyState.categories.find(row=>row.name.toLowerCase()===String(name).toLowerCase()),
    studioCategoryById:id=>context.studioComponentTaxonomyState.categories.find(row=>row.id===id),
    saveStudioComponentTaxonomy:()=>store.set('taxonomy',plain(context.studioComponentTaxonomyState)),
    saveComponentLibraryRecords:records=>{
      context.records=records.map(record=>({...plain(record),id:record.id||`component-test-${++sequence}`}));
      store.set('records',plain(context.records));
    },
    upsertComponentLibraryRecord:(name,record)=>{
      context.saveComponentLibraryRecords([{...record,name},...context.records]);
    },
    findComponentLibraryRecordByName:name=>context.records.find(record=>record.name===name),
    NON_COMPONENT_LINE_ITEM_NAMES:['freight'],
  });
  const selectedFunctions=realSave?functions.concat([
    'componentLibraryCostValue','componentLibraryUnitCostValue','componentLibraryUnitPriceValue',
    'componentLibraryStockValue','componentLibraryCategoryValue','saveComponentLibraryRecords',
  ]):functions;
  for(const name of selectedFunctions){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,`Missing ${name}`);
    const firstLineEnd=source.indexOf('\n',start);
    const end=source.slice(start,firstLineEnd).trimEnd().endsWith('}')?firstLineEnd:source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),context,{filename:`ui.js:${name}`});
  }
  if(realSave){
    const save=context.saveComponentLibraryRecords;
    context.saveComponentLibraryRecords=records=>{
      save(records);
      context.records=plain(store.get('records'));
    };
    context.saveComponentLibraryRecords(context.records);
  }
  function click(id,attributes={}){
    const target={
      getAttribute:name=>attributes[name]||null,
      closest(selector){
        if(selector===`#${attributes.id}`)return this;
        const match=selector.match(/^\[([^=\]]+)\]$/);
        return match && Object.hasOwn(attributes,match[1])?this:null;
      },
    };
    return element(id).listeners.click({target,preventDefault(){},stopPropagation(){}});
  }
  context.bindStudioComponentsPanel();
  return {context,element,click,calls,store};
}

function labels(markup){
  return [...markup.matchAll(/<strong>([^<]+)<\/strong>/g)].map(match=>match[1]);
}

test('category rendering uses explicit families and a virtual bucket, without altering records',()=>{
  const {context:c,element:e}=harness();
  const before=plain(c.records);
  c.renderStudioComponentsLibrary();
  const markup=e('studioComponentsList').innerHTML;
  assert.deepEqual(labels(markup),['black','Silver','Unassigned']);
  assert.doesNotMatch(markup,/Black Silver|Gunmetal Hexy Duplicate|>Hex</);
  assert.doesNotMatch(markup,/<span>/);
  assert.match(markup,/data-studio-library-menu-toggle="subcategory"/);
  c.studioLibraryPath={level:'subcategory',categoryId:'Winding Checks',subcategoryId:'Unassigned'};
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['Black Silver','Gunmetal Hexy Duplicate','Hex']);
  assert.match(e('studioComponentsList').innerHTML,/<span>Maker/);
  assert.deepEqual(plain(c.records),before);
  assert.deepEqual(plain(c.componentPickerSubcategoryStageOptions('Winding Checks','')).map(row=>row.name),['black','Silver','Unassigned']);
  assert.deepEqual(plain(c.componentPickerComponentStageOptions('Winding Checks','Unassigned','')).map(row=>row.id),['direct-0','direct-1','direct-2']);
});

test('supplier browse follows the same hierarchy, Brand display and controls',()=>{
  const {context:c,element:e}=harness();
  c.studioLibraryPath={level:'supplier-category',supplierName:'Parts',categoryId:'Winding Checks',subcategoryId:''};
  e('studioComponentDetails').hidden=false;
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['black','Silver','Unassigned']);
  assert.equal(e('studioComponentDetails').hidden,true);
  assert.equal(e('studioComponentsAddBtn').hidden,true);
  assert.equal(e('studioComponentsTitle').textContent,'WINDING CHECKS');
  c.studioLibraryPath.level='supplier-subcategory';
  c.studioLibraryPath.subcategoryId='Unassigned';
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['Black Silver','Gunmetal Hexy Duplicate','Hex']);
  assert.match(e('studioComponentsList').innerHTML,/<span>Maker<\/span>/);
});

test('Add creates taxonomy only at category level; component Add uses explicit family context',()=>{
  const {context:c,element:e,click}=harness();
  const before=plain(c.records);
  click('studioComponentsAddBtn');
  assert.equal(c.studioLibraryEditor.type,'subcategory');
  e('studioLibrarySubcategoryName').value='Amber';
  click('studioComponentDetails',{'data-studio-library-action':'subcategory-add'});
  assert.equal(c.studioLibraryPath.level,'subcategory');
  assert.equal(c.studioLibraryPath.subcategoryId,'Amber');
  assert.deepEqual(plain(c.records),before);
  click('studioComponentsAddBtn');
  assert.equal(c.studioComponentDraft.category,'Winding Checks');
  assert.equal(c.studioComponentDraft.subcategory,'Amber');
  c.beginStudioComponentAdd('Winding Checks','Unassigned');
  assert.equal(c.studioComponentDraft.subcategory,'');
  c.beginStudioComponentAdd('Reel Seats','Fuji');
  assert.equal(c.studioComponentDraft.brand,'Fuji');
});

test('Unassigned add fixture: saved family retains taxonomy placement in the current category',()=>{
  const {context:c,click}=harness();
  c.studioCategoryById('winding').subcategories.push({id:'real-unassigned',name:'Unassigned'});
  const before=plain(c.studioComponentTaxonomyState);
  const recordsBefore=plain(c.records);
  c.studioLibraryPath={level:'subcategory',categoryId:'Winding Checks',subcategoryId:'unassigned'};
  click('studioComponentsAddBtn');
  assert.equal(c.studioComponentDraft.category,'Winding Checks');
  assert.equal(c.studioComponentDraft.subcategory,'Unassigned');
  assert.equal(c.studioLibraryPath.subcategoryId,'Unassigned');
  assert.equal(c.studioComponentTaxonomySelection.category,'winding');
  assert.equal(c.studioComponentTaxonomySelection.subcategory,'real-unassigned');
  assert.deepEqual(plain(c.studioComponentTaxonomyState),before);
  assert.deepEqual(plain(c.records),recordsBefore);
});

test('Unassigned add fixture: virtual bucket clears placement despite a same-named family elsewhere',()=>{
  const {context:c,click}=harness();
  c.studioCategoryById('seats').subcategories.push({id:'other-unassigned',name:'Unassigned'});
  const before=plain(c.studioComponentTaxonomyState);
  const recordsBefore=plain(c.records);
  c.studioLibraryPath={level:'subcategory',categoryId:'Winding Checks',subcategoryId:'Unassigned'};
  click('studioComponentsAddBtn');
  assert.equal(c.studioComponentDraft.category,'Winding Checks');
  assert.equal(c.studioComponentDraft.subcategory,'');
  assert.equal(c.studioLibraryPath.subcategoryId,'');
  assert.deepEqual(plain(c.studioComponentTaxonomyState),before);
  assert.deepEqual(plain(c.records),recordsBefore);
});

test('sizes editor: chips remain outside a collapsed native disclosure on every entry',()=>{
  const {context:c,element:e}=harness();
  for(const sizes of [[],['10 mm','2 mm','Large']]){
    c.studioComponentSizeDraft=sizes.slice();
    const before=plain(c.studioComponentSizeDraft);
    const markup=c.studioComponentSizesSectionMarkup();
    const disclosure=markup.match(/<details\b[^>]*>/);
    assert.ok(disclosure);
    assert.doesNotMatch(disclosure[0],/\bopen\b/);
    assert.match(markup,/<summary[^>]*>ADD OR EDIT SIZES/);
    assert.ok(markup.indexOf('id="studioComponentSizeList"')<disclosure.index);
    assert.doesNotMatch(markup,/Add selectable sizes|without a size step/);
    assert.match(markup,/<span>From<\/span>[\s\S]*<span>To<\/span>[\s\S]*<span>Step<\/span>[\s\S]*Generate Range/);
    assert.deepEqual(plain(c.studioComponentSizeDraft),before);
  }
  const disclosure={open:false};
  const count={textContent:''};
  const section={disclosure,querySelector:()=>count};
  e('studioComponentSizeList').closest=()=>section;
  c.studioComponentSizeDraft=['10 mm','2 mm'];
  disclosure.open=true;
  c.refreshStudioComponentSizeList();
  assert.equal(disclosure.open,true);
  assert.equal(count.textContent,'2');
  assert.ok(e('studioComponentSizeList').innerHTML.indexOf('>2 mm<')<e('studioComponentSizeList').innerHTML.indexOf('>10 mm<'));
});

test('sizes editor: add/remove/range retain draft values, validation and saved build size options',()=>{
  const {context:c,element:e,click,calls}=harness({realSave:true});
  const record=c.records[0];
  const original=plain(record);
  c.studioSelectedComponentKey=record.name.toLowerCase();
  c.studioSelectedComponentRef=c.studioComponentReference(record,c.records);
  c.studioLibraryPath={level:'component',categoryId:record.category,subcategoryId:record.subcategory};
  c.studioComponentSizeDraft=c.componentRecordSizeOptions(record);
  e('studioComponentSizeInput').value='12 mm, Large, 12 MM';
  click('studioComponentDetails',{'data-size-action':'add'});
  assert.deepEqual(plain(c.studioComponentSizeDraft),['2','10','12 mm','Large']);
  assert.equal(e('studioComponentSizeInput').value,'');
  click('studioComponentDetails',{'data-size-action':'remove','data-size-value':'12 MM'});
  assert.deepEqual(plain(c.studioComponentSizeDraft),['2','10','Large']);
  e('studioComponentSizeFrom').value='9';
  e('studioComponentSizeTo').value='11';
  e('studioComponentSizeStep').value='1';
  click('studioComponentDetails',{'data-size-action':'generate'});
  assert.deepEqual(plain(c.studioComponentSizeDraft),['2','10','Large','9 mm','10 mm','11 mm']);
  const valid=plain(c.studioComponentSizeDraft);
  e('studioComponentSizeStep').value='0';
  click('studioComponentDetails',{'data-size-action':'generate'});
  assert.match(calls.at(-1)[2],/Step greater than zero/);
  assert.deepEqual(plain(c.studioComponentSizeDraft),valid);
  assert.deepEqual(plain(c.records[0]),original);
  c.payload={...original,description:'',sizeOptions:c.studioComponentSizeDraft.slice()};
  e('studioComponentName').value=record.name;
  assert.equal(c.commitStudioComponentDetails(),true);
  const saved=c.records.find(row=>row.id===original.id);
  assert.deepEqual(plain(saved.sizeOptions),valid);
  assert.deepEqual(plain(c.componentRecordSizeOptions(saved)),['2','9 mm','10','10 mm','11 mm','Large']);
  assert.equal(c.studioComponentDetailContext.savedFlash,true);
  for(const key of ['id','category','subcategory','brand','cost','unitCost','unitPrice','stockOnHand']){
    assert.deepEqual(plain(saved[key]),original[key]);
  }
});

test('family/component menus and event handlers route by type and identity, not labels',()=>{
  const {context:c,element:e,click,calls}=harness();
  c.openStudioLibraryContextMenu('subcategory','black');
  c.renderStudioComponentsLibrary();
  const familyMarkup=e('studioComponentsList').innerHTML;
  assert.match(familyMarkup,/subcategory-duplicate/);
  assert.doesNotMatch(familyMarkup,/component-delete|category-up|subcategory-up|Move Up|Move Down/);
  click('studioComponentsList',{'data-studio-library-menu-action':'subcategory-duplicate','data-studio-library-name':'black'});
  assert.deepEqual(calls.pop(),['family-duplicate','winding','black']);
  const record=c.records[4];
  const ref=c.studioComponentReference(record,c.records);
  c.openStudioLibraryContextMenu('component',ref);
  const componentMarkup=c.studioComponentListRowMarkup(record,c.records,'<strong>Hex</strong>');
  assert.match(componentMarkup,/component-move/);
  assert.doesNotMatch(componentMarkup,/subcategory-duplicate/);
  click('studioComponentsList',{'data-studio-library-menu-action':'component-move','data-studio-library-component-ref':ref});
  assert.deepEqual(calls.pop(),['component-move','direct-2']);
  assert.equal(c.currentStudioComponentRecord().id,'direct-2');
  click('studioComponentsList',{'data-studio-library-menu-action':'component-duplicate','data-studio-library-component-ref':ref});
  assert.deepEqual(calls.pop(),['component-duplicate','direct-2']);
});

test('equal component labels retain distinct IDs, fields and component actions',()=>{
  const {context:c,element:e,click,calls}=harness();
  const first={...plain(c.records[0]),id:'same-1',name:'Same',subcategory:'Silver',cost:2};
  const second={...plain(first),id:'same-2',cost:9,stockOnHand:20};
  c.records.push(first,second);
  const before=plain(c.records);
  c.studioLibraryPath={level:'subcategory',categoryId:'Winding Checks',subcategoryId:'Silver'};
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['Same','Same','zeta']);
  const ref=c.studioComponentReference(second,c.records);
  click('studioComponentsList',{'data-studio-library-menu-action':'component-move','data-studio-library-component-ref':ref});
  assert.deepEqual(calls.pop(),['component-move','same-2']);
  assert.equal(c.currentStudioComponentRecord().cost,9);
  assert.deepEqual(plain(c.records),before);
});

test('Add/Rename/Duplicate and reopen display A-Z without sorting stored arrays or merging equal labels',()=>{
  const {context:c,element:e,click}=harness();
  c.studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
  c.studioLibraryEditor={type:'category',mode:'add'};
  e('studioLibraryCategoryName').value='alpha category';
  click('studioComponentDetails',{'data-studio-library-action':'category-add'});
  c.studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['alpha category','Reel Seats','Winding Checks']);
  c.studioLibraryEditor={type:'category',mode:'edit',targetId:'winding',targetName:'Winding Checks'};
  e('studioLibraryCategoryName').value='Beta category';
  click('studioComponentDetails',{'data-studio-library-action':'category-rename'});
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['alpha category','Beta category','Reel Seats']);
  c.studioLibraryPath={level:'category',categoryId:'Beta category',subcategoryId:''};
  c.studioLibraryEditor={type:'subcategory',mode:'edit',targetName:'Silver',sourceCategory:'Beta category'};
  e('studioLibrarySubcategoryName').value='aardvark';
  click('studioComponentDetails',{'data-studio-library-action':'subcategory-rename'});
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['aardvark','black','Unassigned']);
  assert.equal(c.duplicateStudioSubcategory('Beta category','black','Zinc'),true);
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['aardvark','black','Unassigned','Zinc']);
  const storedOrder=plain(c.studioComponentTaxonomyState);
  c.studioComponentTaxonomyState=plain(storedOrder);
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['aardvark','black','Unassigned','Zinc']);
  assert.deepEqual(plain(c.studioComponentTaxonomyState),storedOrder);
  const records=[{id:'a',name:'zeta'},{id:'b',name:'Alpha'},{id:'c',name:'alpha'},{id:'d',name:'Beta'}];
  assert.deepEqual(plain(c.sortComponentRecordsByName(records)).map(row=>row.id),['b','c','d','a']);
  records.push({id:'e',name:'aardvark'});
  records[0].name='amber';
  records.push({id:'f',name:'Beta Copy'});
  assert.deepEqual(plain(c.sortComponentRecordsByName(plain(records))).map(row=>row.id),['e','b','c','a','d','f']);
  assert.equal(records[0].id,'a');
});

test('duplication retains assigned placement, source IDs, data and references; family copies are siblings',()=>{
  const {context:c,element:e}=harness({realSave:true});
  const original=plain(c.records);
  const history={components:original.map(record=>({libraryComponentId:record.id,size:record.sizeOptions[0]}))};
  const historyBefore=plain(history);
  c.studioSelectedComponentKey='zeta';
  c.studioSelectedComponentRef=c.studioComponentReference(c.records[0],c.records);
  c.studioComponentDuplicateState={mode:'component',name:'aardvark'};
  e('studioComponentDuplicateName').value='aardvark';
  assert.equal(c.commitStudioComponentDuplicate(),true);
  const copy=c.records[0];
  assert.notEqual(copy.id,original[0].id);
  assert.equal(copy.subcategory,'Silver');
  assert.equal(copy.category,original[0].category);
  assert.equal(copy.categoryId,'winding');
  assert.equal(copy.stockOnHand,0);
  for(const key of ['cost','unitCost','unitPrice','sizeOptions','brand','notes']){
    assert.deepEqual(plain(copy[key]),original[0][key]);
  }
  assert.deepEqual(plain(c.records.slice(1)),original);
  assert.equal(c.studioLibraryPath.subcategoryId,'Silver');
  assert.equal(c.duplicateStudioSubcategory('Winding Checks','Silver','Amber'),true);
  const familyCopy=c.records.find(record=>record.subcategory==='Amber');
  assert.notEqual(familyCopy.id,original[0].id);
  assert.equal(familyCopy.stockOnHand,0);
  assert.equal(familyCopy.brand,'Fuji');
  assert.equal(familyCopy.categoryId,'winding');
  assert.equal(familyCopy.category,'Winding Checks');
  assert.equal(c.studioCategoryByName('Winding Checks').subcategories.some(row=>row.name==='Amber'),true);
  assert.deepEqual(plain(familyCopy.sizeOptions),original[0].sizeOptions);
  assert.deepEqual(plain(history),historyBefore);
});

test('duplication keeps unassigned sources unassigned with tracking on or off and zero copied stock',()=>{
  for(const tracking of [true,false]){
    for(const category of ['Winding Checks','']){
      const {context:c,element:e}=harness({realSave:true});
      const record=c.records.find(row=>row.id==='direct-2');
      record.category=category;
      record.categoryId=category?'winding':'';
      const original=plain(c.records);
      c.activeTrackComponentStock=()=>tracking;
      c.studioSelectedComponentKey=record.name.toLowerCase();
      c.studioSelectedComponentRef=c.studioComponentReference(record,c.records);
      c.studioComponentDuplicateState={mode:'component',name:'Hex Copy'};
      e('studioComponentDuplicateName').value='Hex Copy';
      assert.equal(c.commitStudioComponentDuplicate(),true);
      const copy=c.records[0];
      assert.notEqual(copy.id,record.id);
      assert.equal(copy.category,category);
      assert.equal(copy.categoryId,record.categoryId);
      assert.equal(copy.subcategory,'');
      assert.equal(copy.stockOnHand,0);
      assert.equal(c.activeTrackComponentStock(),tracking);
      assert.deepEqual(plain(c.records.slice(1)),original);
      assert.equal(c.currentStudioComponentRecord().id,copy.id);
      assert.equal(c.studioLibraryPath.level,'component');
    }
  }
});

test('duplication retains assigned fields when stock tracking is disabled',()=>{
  const {context:c,element:e}=harness({realSave:true});
  const record=c.records[0];
  record.unitCost=4.25;
  const original=plain(c.records);
  c.activeTrackComponentStock=()=>false;
  c.studioSelectedComponentKey=record.name.toLowerCase();
  c.studioSelectedComponentRef=c.studioComponentReference(record,c.records);
  c.studioComponentDuplicateState={mode:'component',name:'zeta Copy'};
  e('studioComponentDuplicateName').value='zeta Copy';
  assert.equal(c.commitStudioComponentDuplicate(),true);
  const copy=c.records[0];
  const expected={...original[0],id:copy.id,name:'zeta Copy',stockOnHand:0};
  assert.deepEqual(plain(copy),expected);
  assert.notEqual(copy.id,record.id);
  assert.equal(c.activeTrackComponentStock(),false);
  assert.deepEqual(plain(c.records.slice(1)),original);
  assert.equal(c.studioLibraryPath.subcategoryId,'Silver');
});

test('duplication sheet describes retained family or genuinely unassigned placement',()=>{
  const {context:c,element:e}=harness();
  c.studioSelectedComponentKey='zeta';
  c.studioSelectedComponentRef=c.studioComponentReference(c.records[0],c.records);
  c.studioComponentDuplicateState={mode:'component',name:'zeta Copy'};
  c.renderComponentDuplicateSheet();
  assert.equal(e('studioComponentDuplicateSubcategory').textContent,'Silver');
  assert.match(e('studioComponentDuplicateNote').textContent,/keeps its category and subcategory/);
  c.studioSelectedComponentKey='hex';
  c.studioSelectedComponentRef=c.studioComponentReference(c.records[4],c.records);
  c.renderComponentDuplicateSheet();
  assert.equal(e('studioComponentDuplicateSubcategory').textContent,'No Subcategory');
  c.studioComponentDuplicateState={mode:'family',category:'Winding Checks',subcategory:'Silver',name:'Amber'};
  c.renderComponentDuplicateSheet();
  assert.equal(e('studioComponentDuplicateSubcategory').textContent,'New Sibling Subcategory');
});

test('duplication family save failure restores original records and taxonomy',()=>{
  const {context:c,store,calls}=harness({realSave:true});
  c.saveStudioComponentTaxonomy();
  const originalRecords=plain(c.records);
  const originalTaxonomy=plain(c.studioComponentTaxonomyState);
  c.saveStudioComponentTaxonomy=()=>{throw new Error('taxonomy write failed');};
  assert.equal(c.duplicateStudioSubcategory('Winding Checks','Silver','Amber'),false);
  assert.deepEqual(store.get('records'),originalRecords);
  assert.deepEqual(store.get('taxonomy'),originalTaxonomy);
  assert.deepEqual(plain(c.studioComponentTaxonomyState),originalTaxonomy);
  assert.match(calls.at(-1)[1],/Original records and taxonomy restored/);
});

test('component saves and rename retain identity/data and render A-Z after reopening',()=>{
  const {context:c,element:e}=harness();
  const sourceRecord=c.records[1];
  const original=plain(sourceRecord);
  c.studioSelectedComponentKey=sourceRecord.name.toLowerCase();
  c.studioSelectedComponentRef=c.studioComponentReference(sourceRecord,c.records);
  c.studioLibraryPath={level:'component',categoryId:sourceRecord.category,subcategoryId:sourceRecord.subcategory};
  c.payload={...plain(sourceRecord),name:'Zinc',description:''};
  e('studioComponentName').value='Zinc';
  assert.equal(c.commitStudioComponentDetails(),true);
  const renamed=c.records.find(record=>record.id===original.id);
  for(const key of ['id','categoryId','subcategory','brand','cost','unitPrice','stockOnHand','sizeOptions']){
    assert.deepEqual(plain(renamed[key]),original[key]);
  }
  c.studioComponentDetailContext.isAddMode=true;
  c.payload={name:'amber',category:'Winding Checks',subcategory:'black',brand:'Maker',cost:1,unitPrice:3,stockOnHand:4,sizeOptions:['7'],description:''};
  e('studioComponentName').value='amber';
  assert.equal(c.commitStudioComponentDetails(),true);
  const stored=plain(c.records);
  c.records=plain(stored);
  c.studioLibraryPath={level:'subcategory',categoryId:'Winding Checks',subcategoryId:'black'};
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['amber','Zinc']);
  assert.deepEqual(plain(c.records),stored);
  assert.equal(c.records.find(record=>record.name==='amber').subcategory,'black');
});

test('taxonomy manager uses A-Z and offers no conflicting category/family reorder actions',()=>{
  const {context:c}=harness();
  assert.deepEqual(labels(c.studioTaxonomySectionMarkupCategories(c.studioComponentTaxonomyState)),['Reel Seats','Winding Checks']);
  assert.deepEqual(labels(c.studioTaxonomySectionMarkupSubcategories(c.studioComponentTaxonomyState)),['black','Silver']);
  for(const markup of [
    c.studioTaxonomySectionMarkupCategories(c.studioComponentTaxonomyState),
    c.studioTaxonomySectionMarkupSubcategories(c.studioComponentTaxonomyState),
    c.studioCategoryContextMenuMarkup('Winding Checks'),
    c.studioSubcategoryContextMenuMarkup('black'),
  ])assert.doesNotMatch(markup,/Move Up|Move Down|category-up|category-down|subcategory-up|subcategory-down/);
});

test('blank/invalid categories remain reachable and Back from a direct duplicate does not show all category components',()=>{
  const {context:c,element:e,click}=harness();
  c.records.push({id:'uncategorized',name:'Loose',category:'',subcategory:'',brand:'Maker'});
  c.records.push({id:'explicit',name:'Explicit',category:'Unassigned',subcategory:'',brand:'Maker'});
  c.records.push({id:'invalid',name:'Invalid',category:'Category Missing',subcategory:'',brand:'Maker'});
  c.studioLibraryPath={level:'category',categoryId:'Unassigned',subcategoryId:''};
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['Unassigned']);
  c.studioLibraryPath={level:'subcategory',categoryId:'Unassigned',subcategoryId:'Unassigned'};
  c.renderStudioComponentsLibrary();
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['Explicit','Invalid','Loose']);
  c.studioLibraryPath={level:'component',categoryId:'Winding Checks',subcategoryId:''};
  click('studioComponentsBackBtn');
  assert.equal(c.studioLibraryPath.subcategoryId,'Unassigned');
  assert.deepEqual(labels(e('studioComponentsList').innerHTML),['Black Silver','Gunmetal Hexy Duplicate','Hex']);
});
