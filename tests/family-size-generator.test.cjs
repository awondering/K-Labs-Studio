// Components -> family -> Generate Sizes: one ordinary component per size, each with its own Buy/Sell price.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const plain=(value)=>JSON.parse(JSON.stringify(value));
function body(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`Missing ${name}`);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
const NAMES=[
  'numberOrZero','normalizeNameKey','componentPriceProblem','explicitBrandForSubcategory',
  'familySizeGeneratorLabels','familySizeGeneratorComponentName','familySizeGeneratorProblem','commitFamilySizeGenerator',
];

function harness({saveThrows=false,notifyThrows=false}={}){
  const store=new Map();
  const errors=[];
  const calls=[];
  const existing=[
    {id:'a1',name:'Alconite 6 mm',category:'Guides',categoryId:'guides',subcategory:'Alconite',cost:2,unitCost:2,unitPrice:5,stockOnHand:9,sizeOptions:[]},
    {id:'s1',name:'Seat 16',category:'Reel Seats',categoryId:'seats',subcategory:'Fuji',cost:10,unitCost:10,unitPrice:20,stockOnHand:3,sizeOptions:['16','18']},
  ];
  store.set('records',plain(existing));
  const ctx={
    FAMILY_SIZE_GENERATOR_MAX:50,
    studioFamilySizeGeneratorState:null,
    studioComponentDraft:{},studioLibraryEditor:{type:'component'},studioLibraryPath:{level:'category'},
    studioComponentTaxonomyState:{categories:[{id:'guides',name:'Guides',subcategories:[{id:'alc',name:'Alconite'}]},{id:'seats',name:'Reel Seats',subcategories:[{id:'fuji',name:'Fuji'}]}]},
    Store:{get:(k,f)=>store.has(k)?plain(store.get(k)):f,set:(k,v)=>store.set(k,plain(v))},
    componentLibraryStorageKey:()=> 'records',
    componentLibraryRecords:()=>plain(store.get('records')||[]),
    saveComponentLibraryRecords:(records)=>{
      store.set('records',plain(records.map((r,i)=>({...r,id:r.id||`new-${i}`}))));
      ctx.window.KLABS_SYNC.notifyComponentsChanged();
      if(saveThrows)throw new Error('quota exceeded');
    },
    window:{KLABS_SYNC:{notifyComponentsChanged(){calls.push('notify');if(notifyThrows)throw new Error('offline');}}},
    $:(id)=>id==='studioFamilySizeStatus'?{set textContent(v){if(v)errors.push(v);},dataset:{}}:null,
    familySizeGeneratorError:(m)=>{if(m)errors.push(m);},
    closeFamilySizeGeneratorSheet:()=>calls.push('close'),
    renderStudioComponentsLibrary:()=>calls.push('render'),
    openInfoDialog:(...a)=>calls.push(['info',...a]),
  };
  ctx.studioCategoryById=(id)=>ctx.studioComponentTaxonomyState.categories.find((c)=>c.id===id);
  vm.createContext(ctx);
  for(const name of NAMES)vm.runInContext(body(name),ctx);
  return {ctx,store,errors,calls,existing};
}
const rows=(sizes,buy='2.50',sell='6')=>sizes.map((size)=>({size,buy,sell}));

test('a numeric range makes unit-suffixed sizes; a comma list is used as typed and de-duplicated',()=>{
  const {ctx}=harness();
  assert.deepEqual(plain(ctx.familySizeGeneratorLabels('','6','10','2','mm')),{labels:['6 mm','8 mm','10 mm']});
  assert.deepEqual(plain(ctx.familySizeGeneratorLabels('','0.5','0.7','0.1','in')),{labels:['0.5 in','0.6 in','0.7 in']});
  assert.deepEqual(plain(ctx.familySizeGeneratorLabels(' 5.5, 6 ,6, ,8 mm','1','99','1','mm')),{labels:['5.5','6','8 mm']});
});

test('ranges and lists are capped at 50 and bad input is rejected without NaN sizes',()=>{
  const {ctx}=harness();
  assert.equal(ctx.familySizeGeneratorLabels('','1','50','1','mm').labels.length,50);
  assert.match(ctx.familySizeGeneratorLabels('','1','51','1','mm').error,/51 components\. The limit is 50/);
  assert.match(ctx.familySizeGeneratorLabels(Array.from({length:51},(_,i)=>i+1).join(','),'','','','mm').error,/limit is 50/);
  for(const args of [['','','10',''],['','1','','1'],['','1','10','0'],['','a','10','1'],['','1','10','-1']]){
    assert.ok(ctx.familySizeGeneratorLabels(...args,'mm').error,JSON.stringify(args));
  }
});

test('validation blocks names already in the library, repeated names in the batch, and bad prices',()=>{
  const {ctx,existing}=harness();
  assert.equal(ctx.familySizeGeneratorProblem('Alconite',rows(['8 mm','10 mm']),existing),'');
  assert.match(ctx.familySizeGeneratorProblem('alconite',rows(['6 MM']),existing),/"alconite 6 MM" already exists/);
  assert.match(ctx.familySizeGeneratorProblem('Alconite',[{size:'8',buy:'1',sell:'2'},{size:'8 ',buy:'1',sell:'2'}],existing),/more than once/);
  assert.match(ctx.familySizeGeneratorProblem('Alconite',[{size:'8',buy:'',sell:'2'}],existing),/^8: Buy Price is required/);
  assert.match(ctx.familySizeGeneratorProblem('Alconite',[{size:'8',buy:'1',sell:'-1'}],existing),/^8: Sell Price cannot be negative/);
  assert.match(ctx.familySizeGeneratorProblem('  ',rows(['8']),existing),/base name/);
  assert.match(ctx.familySizeGeneratorProblem('Alconite',[],existing),/size list/);
  assert.match(ctx.familySizeGeneratorProblem('A',rows(Array.from({length:51},(_,i)=>String(i))),existing),/limit is 50/);
  assert.equal(ctx.familySizeGeneratorProblem('Alconite',[{size:'8',buy:'0',sell:'0'}],existing),'','0.00 is a valid price');
});

test('saving creates one normal component per size in the existing family with its own prices',()=>{
  const {ctx,store,calls,existing}=harness();
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:[
    {size:'8 mm',buy:'2.50',sell:'6'},{size:'10 mm',buy:'3.10',sell:'7.50'},{size:'12 mm',buy:'0',sell:'9'},
  ]};
  assert.equal(ctx.commitFamilySizeGenerator(),true);
  const saved=store.get('records');
  const created=saved.filter((r)=>!existing.some((e)=>e.id===r.id));
  assert.deepEqual(created.map((r)=>[r.name,r.cost,r.unitCost,r.unitPrice]),[['Alconite 8 mm',2.5,2.5,6],['Alconite 10 mm',3.1,3.1,7.5],['Alconite 12 mm',0,0,9]]);
  for(const r of created){
    assert.equal(r.category,'Guides');assert.equal(r.categoryId,'guides');assert.equal(r.subcategory,'Alconite');
    assert.equal(r.stockOnHand,0);assert.deepEqual(r.sizeOptions,[]);assert.ok(r.id);
  }
  assert.deepEqual(saved.slice(created.length),existing,'existing components, prices, stock and sizes untouched');
  assert.deepEqual(calls.filter((c)=>c==='notify'),['notify'],'sync notified exactly once, after the write');
  assert.deepEqual(plain(ctx.studioLibraryPath),{level:'subcategory',categoryId:'Guides',subcategoryId:'Alconite'});
  assert.equal(ctx.studioFamilySizeGeneratorState===null||calls.includes('close'),true);
});

test('a duplicate name or bad price writes nothing and does not notify sync',()=>{
  const {ctx,store,calls,errors,existing}=harness();
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:rows(['6 mm','8 mm'])};
  assert.equal(ctx.commitFamilySizeGenerator(),false);
  assert.match(errors.at(-1),/already exists/);
  ctx.studioFamilySizeGeneratorState.rows=[{size:'8 mm',buy:'x',sell:'1'}];
  assert.equal(ctx.commitFamilySizeGenerator(),false);
  assert.match(errors.at(-1),/Buy Price must be a valid amount/);
  assert.deepEqual(store.get('records'),existing);
  assert.equal(calls.includes('notify'),false);
});

test('a failed save restores the original library, leaves no partial family and sends no sync',()=>{
  const {ctx,store,calls,errors,existing}=harness({saveThrows:true});
  const realNotify=ctx.window.KLABS_SYNC.notifyComponentsChanged;
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:rows(['8 mm','10 mm'])};
  assert.equal(ctx.commitFamilySizeGenerator(),false);
  assert.deepEqual(store.get('records'),existing);
  assert.match(errors.at(-1),/No components were created/);
  assert.equal(calls.includes('notify'),false);
  assert.equal(ctx.window.KLABS_SYNC.notifyComponentsChanged,realNotify,'sync notifier restored');
});

test('a sync notification failure keeps the local save and tells the builder to retry sync',()=>{
  const {ctx,store,calls}=harness({notifyThrows:true});
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:rows(['8 mm'])};
  assert.equal(ctx.commitFamilySizeGenerator(),true);
  assert.ok(store.get('records').some((r)=>r.name==='Alconite 8 mm'));
  assert.ok(calls.some((c)=>Array.isArray(c)&&c[1]==='Saved Locally'));
});

test('a missing family is refused without writing',()=>{
  const {ctx,store,errors,existing}=harness();
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'gone',baseName:'X',rows:rows(['1'])};
  assert.equal(ctx.commitFamilySizeGenerator(),false);
  assert.match(errors.at(-1),/family was not found/);
  assert.deepEqual(store.get('records'),existing);
});

test('the generator adds no new record fields, storage keys or sync changes',()=>{
  const commit=body('commitFamilySizeGenerator');
  assert.match(commit,/saveComponentLibraryRecords\(\[\.\.\.created,\.\.\.records\]\)/);
  assert.doesNotMatch(commit,/sizePrices|localStorage|fetch\(/);
  const sync=fs.readFileSync(path.join(__dirname,'..','js','component-sync.js'),'utf8');
  assert.doesNotMatch(sync,/familySize/);
});

test('Generate Sizes sits beside Duplicate Family and Duplicate Family is not rerouted',()=>{
  assert.match(html,/id="studioComponentsDuplicateFamilyBtn"[^>]*>Duplicate Family<\/button>\s*<button id="studioComponentsGenerateSizesBtn"[^>]*hidden>Generate Sizes<\/button>/);
  assert.match(source,/openSubcategoryDuplicateSheet\(category,family\);\n    \}\);\n  \}\n  const generateSizesButton/);
  assert.doesNotMatch(body('duplicateStudioSubcategory'),/familySize/);
  assert.doesNotMatch(body('commitStudioComponentDuplicate'),/familySize/);
});

test('Create Size List fills every size with the starting prices and renders an editable, escaped price table',()=>{
  const fields={studioFamilySizeList:{value:''},studioFamilySizeFrom:{value:'8'},studioFamilySizeTo:{value:'12'},studioFamilySizeStep:{value:'2'},
    studioFamilySizeBuy:{value:' 2.5 '},studioFamilySizeSell:{value:'6'},studioFamilySizeRows:{innerHTML:''},studioFamilySizeConfirm:{textContent:'',disabled:true}};
  const ctx={FAMILY_SIZE_GENERATOR_MAX:50,$:(id)=>fields[id]||null,measurementUnitSuffix:()=> 'mm',familySizeGeneratorError(){},
    escapeHtml:(v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),escapeAttributeValue:(v)=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
    studioFamilySizeGeneratorState:{categoryId:'guides',subcategoryId:'alc',baseName:'Fuji <KW>',rows:[]}};
  vm.createContext(ctx);
  for(const name of ['familySizeGeneratorLabels','familySizeGeneratorComponentName','renderFamilySizeGeneratorRows','buildFamilySizeGeneratorRows'])vm.runInContext(body(name),ctx);
  assert.equal(ctx.buildFamilySizeGeneratorRows(),true);
  assert.deepEqual(plain(ctx.studioFamilySizeGeneratorState.rows),[{size:'8 mm',buy:'2.5',sell:'6'},{size:'10 mm',buy:'2.5',sell:'6'},{size:'12 mm',buy:'2.5',sell:'6'}]);
  const markup=fields.studioFamilySizeRows.innerHTML;
  assert.equal((markup.match(/data-family-size-field="buy"/g)||[]).length,3);
  assert.equal((markup.match(/data-family-size-field="sell"/g)||[]).length,3);
  assert.match(markup,/Fuji &lt;KW> 10 mm/);
  assert.doesNotMatch(markup,/<KW>/);
  assert.equal(fields.studioFamilySizeConfirm.textContent,'Create 3 Components');
  assert.equal(fields.studioFamilySizeConfirm.disabled,false);
});
