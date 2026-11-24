// Components -> family -> Sizes & Prices (Q35; was Generate Sizes): one ordinary component per size, each with its own
// Buy/Sell price. Opens on the family's existing sizes; adds new ones without touching them; edits and removals in one save.
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
  'familySizeExistingProblem','familySizeRowChanged','familySizeEditorDirty','addFamilySizeRows',
  'familySizeBaseName','familySizeRowLabel','familySizePriceText','familySizeExistingRows',
  'componentRecordBuyPrice','normalizeComponentSizeOptions','compareComponentSizeLabels',
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
  assert.match(errors.at(-1),/Nothing was changed/);
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
  assert.match(commit,/saveComponentLibraryRecords\(\[\.\.\.created,\.\.\.kept\]\)/);
  assert.equal((commit.match(/saveComponentLibraryRecords\(/g)||[]).length,1,'one write');
  assert.doesNotMatch(commit,/sizePrices|localStorage|fetch\(/);
  const sync=fs.readFileSync(path.join(__dirname,'..','js','component-sync.js'),'utf8');
  assert.doesNotMatch(sync,/familySize/);
});

test('Sizes & Prices sits beside Duplicate Family and Duplicate Family is not rerouted',()=>{
  assert.match(html,/id="studioComponentsDuplicateFamilyBtn"[^>]*>Duplicate Family<\/button>\s*<button id="studioComponentsGenerateSizesBtn"[^>]*hidden>Sizes &amp; Prices<\/button>/);
  assert.match(source,/openSubcategoryDuplicateSheet\(category,family\);\n    \}\);\n  \}\n  const generateSizesButton/);
  assert.doesNotMatch(body('duplicateStudioSubcategory'),/familySize/);
  assert.doesNotMatch(body('commitStudioComponentDuplicate'),/familySize/);
});

function tableHarness(state,values={}){
  const fields={studioFamilySizeList:{value:''},studioFamilySizeFrom:{value:''},studioFamilySizeTo:{value:''},studioFamilySizeStep:{value:''},
    studioFamilySizeBuy:{value:''},studioFamilySizeSell:{value:''},studioFamilySizeRows:{innerHTML:''},studioFamilySizeConfirm:{disabled:true},
    studioFamilySizeStatus:{textContent:'',dataset:{}}};
  Object.entries(values).forEach(([id,value])=>{fields[id].value=value;});
  const ctx={FAMILY_SIZE_GENERATOR_MAX:50,$:(id)=>fields[id]||null,measurementUnitSuffix:()=> 'mm',
    escapeHtml:(v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),escapeAttributeValue:(v)=>String(v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),
    studioFamilySizeGeneratorState:state};
  vm.createContext(ctx);
  for(const name of ['normalizeNameKey','familySizeGeneratorLabels','familySizeGeneratorComponentName','familySizeRowChanged','familySizeEditorDirty','addFamilySizeRows',
    'familySizeGeneratorError','familySizeGeneratorNote','syncFamilySizeSaveButton','renderFamilySizeGeneratorRows','buildFamilySizeGeneratorRows','toggleFamilySizeRow'])vm.runInContext(body(name),ctx);
  return {ctx,fields};
}
const existingRow=(id,name,label,buy,sell)=>({id,name,label,sizes:0,buy,sell,savedBuy:buy,savedSell:sell,removed:false});

test('Add Sizes fills every new size with the starting prices and renders an editable, escaped Size | Buy | Sell table',()=>{
  const {ctx,fields}=tableHarness({categoryId:'guides',subcategoryId:'alc',baseName:'Fuji <KW>',rows:[]},
    {studioFamilySizeFrom:'8',studioFamilySizeTo:'12',studioFamilySizeStep:'2',studioFamilySizeBuy:' 2.5 ',studioFamilySizeSell:'6'});
  assert.equal(ctx.buildFamilySizeGeneratorRows(),true);
  assert.deepEqual(plain(ctx.studioFamilySizeGeneratorState.rows),[{id:'',size:'8 mm',buy:'2.5',sell:'6',removed:false},{id:'',size:'10 mm',buy:'2.5',sell:'6',removed:false},{id:'',size:'12 mm',buy:'2.5',sell:'6',removed:false}]);
  const markup=fields.studioFamilySizeRows.innerHTML;
  assert.match(markup,/<span>Size<\/span><span>Buy<\/span><span>Sell<\/span>/);
  assert.equal((markup.match(/data-family-size-field="buy"/g)||[]).length,3);
  assert.equal((markup.match(/data-family-size-field="sell"/g)||[]).length,3);
  assert.equal((markup.match(/data-family-size-remove=/g)||[]).length,3);
  assert.match(markup,/Fuji &lt;KW> 10 mm/);
  assert.doesNotMatch(markup,/<KW>/);
  assert.equal(fields.studioFamilySizeConfirm.disabled,false,'new sizes are a change to save');
  assert.equal(fields.studioFamilySizeFrom.value,'','entry fields clear for the next batch');
});

test('opening a family lists its existing sizes, prices filled in, in size order, with the shared base name',()=>{
  const {ctx}=harness();
  const family=[
    {id:'w16',name:'Aluminium Winding Check 16 mm',cost:3.5,unitCost:3.5,unitPrice:8},
    {id:'w8',name:'Aluminium Winding Check 8 mm',cost:2.5,unitCost:2.5,unitPrice:6,sizeOptions:['A','B']},
    {id:'w10',name:'Aluminium Winding Check 10 mm',unitCost:2.75,unitPrice:6.5},
  ];
  const base=ctx.familySizeBaseName(family.map((r)=>r.name),'Grip Winding Checks');
  assert.equal(base,'Aluminium Winding Check');
  const rowsOut=plain(ctx.familySizeExistingRows(family,base));
  assert.deepEqual(rowsOut.map((r)=>[r.id,r.label,r.buy,r.sell,r.sizes]),[['w8','8 mm','2.5','6',2],['w10','10 mm','2.75','6.5',0],['w16','16 mm','3.5','8',0]]);
  assert.equal(ctx.familySizeEditorDirty({rows:rowsOut}),false,'nothing to save on opening');
  assert.equal(ctx.familySizeBaseName(['Fuji KR Guide 30'],'Fuji KR'),'Fuji KR Guide');
  assert.equal(ctx.familySizeBaseName(['Hex Check','Round Check'],'Checks'),'Checks','no shared words: the family name');
  assert.equal(ctx.familySizeBaseName([],'New Family'),'New Family');
  assert.equal(ctx.familySizeRowLabel('Odd Name','Aluminium Winding Check'),'Odd Name','a name outside the base shows whole');
});

test('adding sizes never overwrites an existing size or its prices, and skips duplicates already listed',()=>{
  const state={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:[existingRow('a6','Alconite 6 mm','6 mm','2','5'),existingRow('a8','Alconite 8 mm','8 mm','2.2','5.5')]};
  state.rows[1].buy='2.4';
  const {ctx,fields}=tableHarness(state,{studioFamilySizeList:'8 mm, 10 mm, 6 MM, 12 mm',studioFamilySizeBuy:'3',studioFamilySizeSell:'7'});
  assert.equal(ctx.buildFamilySizeGeneratorRows(),true);
  const out=plain(ctx.studioFamilySizeGeneratorState.rows);
  assert.deepEqual(out.slice(0,2).map((r)=>[r.id,r.buy,r.sell]),[['a6','2','5'],['a8','2.4','5.5']],'existing prices and unsaved edits kept');
  assert.deepEqual(out.slice(2).map((r)=>[r.size,r.buy,r.sell]),[['10 mm','3','7'],['12 mm','3','7']]);
  assert.match(fields.studioFamilySizeStatus.textContent,/Added 2\. Already listed: 8 mm, 6 MM\./);
  fields.studioFamilySizeList.value='10 mm';
  assert.equal(ctx.buildFamilySizeGeneratorRows(),false,'a size added earlier in this session is not added twice');
  assert.equal(ctx.studioFamilySizeGeneratorState.rows.length,4);
});

test('remove: a new size is dropped; a saved size is marked (prices reset, locked) and can be kept again',()=>{
  const state={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:[existingRow('a6','Alconite 6 mm','6 mm','2','5'),{id:'',size:'9 mm',buy:'1',sell:'2',removed:false}]};
  const {ctx,fields}=tableHarness(state);
  ctx.toggleFamilySizeRow(1);
  assert.equal(ctx.studioFamilySizeGeneratorState.rows.length,1);
  assert.equal(fields.studioFamilySizeConfirm.disabled,true,'nothing left to save');
  ctx.studioFamilySizeGeneratorState.rows[0].buy='9';
  ctx.toggleFamilySizeRow(0);
  const row=ctx.studioFamilySizeGeneratorState.rows[0];
  assert.equal(row.removed,true);assert.equal(row.buy,'2');
  assert.match(fields.studioFamilySizeRows.innerHTML,/studio-family-size__row--removed/);
  assert.match(fields.studioFamilySizeRows.innerHTML,/data-family-size-field="buy" value="2" disabled/);
  assert.match(fields.studioFamilySizeRows.innerHTML,/aria-label="Keep Alconite 6 mm"/);
  assert.equal(fields.studioFamilySizeConfirm.disabled,false);
  ctx.toggleFamilySizeRow(0);
  assert.equal(ctx.studioFamilySizeGeneratorState.rows[0].removed,false);
  assert.equal(fields.studioFamilySizeConfirm.disabled,true,'back to the saved state');
});

test('one save: edited prices, new sizes and removals together; untouched sizes and every other field kept',()=>{
  const {ctx,store,calls,existing}=harness();
  store.set('records',plain([...existing,
    {id:'a8',name:'Alconite 8 mm',category:'Guides',categoryId:'guides',subcategory:'Alconite',brand:'Fuji',supplier:'PacBay',description:'d',cost:2.2,unitCost:2.2,unitPrice:5.5,stockOnHand:4,sizeOptions:[]},
    {id:'a10',name:'Alconite 10 mm',category:'Guides',categoryId:'guides',subcategory:'Alconite',cost:2.4,unitCost:2.4,unitPrice:6,stockOnHand:1,sizeOptions:[]}]));
  const before=store.get('records');
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:[
    {...existingRow('a1','Alconite 6 mm','6 mm','2','5')},
    {...existingRow('a8','Alconite 8 mm','8 mm','2.2','5.5'),buy:'2.6',sell:'6.25'},
    {...existingRow('a10','Alconite 10 mm','10 mm','2.4','6'),removed:true},
    {id:'',size:'12 mm',buy:'3',sell:'7',removed:false},
  ]};
  assert.equal(ctx.commitFamilySizeGenerator(),true);
  const saved=store.get('records');
  const by=Object.fromEntries(saved.map((r)=>[r.id,r]));
  assert.deepEqual(by.a8,{...before.find((r)=>r.id==='a8'),cost:2.6,unitCost:2.6,unitPrice:6.25},'only Buy/Sell change');
  assert.deepEqual(by.a1,existing[0],'an untouched size is unchanged');
  assert.deepEqual(by.s1,existing[1],'another family is unchanged');
  assert.equal(by.a10,undefined,'the removed size is gone');
  assert.deepEqual(saved.filter((r)=>r.name==='Alconite 12 mm').map((r)=>[r.cost,r.unitCost,r.unitPrice,r.subcategory]),[[3,3,7,'Alconite']]);
  assert.equal(saved.length,4);
  assert.deepEqual(calls.filter((c)=>c==='notify'),['notify'],'one sync notification');
});

test('an edited existing price is validated; untouched prices (even legacy blanks) are not, and nothing is written on error',()=>{
  const {ctx,store,errors,existing}=harness();
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:[
    {...existingRow('a1','Alconite 6 mm','6 mm','2','5'),sell:''},
  ]};
  assert.equal(ctx.commitFamilySizeGenerator(),false);
  assert.match(errors.at(-1),/^Alconite 6 mm: Sell Price is required/);
  assert.deepEqual(store.get('records'),existing);
  assert.equal(ctx.familySizeExistingProblem([existingRow('x','X 1','1','','')]),'','an unchanged legacy blank is not blocked');
  assert.equal(ctx.familySizeRowChanged({...existingRow('x','X','1','2','5'),buy:' 2 '}),false,'whitespace is not a change');
});

test('a save that fails part-way restores the edited and removed sizes too',()=>{
  const {ctx,store,existing}=harness({saveThrows:true});
  ctx.studioFamilySizeGeneratorState={categoryId:'guides',subcategoryId:'alc',baseName:'Alconite',rows:[
    {...existingRow('a1','Alconite 6 mm','6 mm','2','5'),buy:'9'},
  ]};
  assert.equal(ctx.commitFamilySizeGenerator(),false);
  assert.deepEqual(store.get('records'),existing);
});

test('the editor keeps the Q24 demo hooks and asks before removing or discarding',()=>{
  const sheet=body('ensureFamilySizeGeneratorSheet');
  for(const id of ['studioFamilySizeBase','studioFamilySizeList','studioFamilySizeFrom','studioFamilySizeTo','studioFamilySizeStep','studioFamilySizeBuy','studioFamilySizeSell','studioFamilySizeBuild','studioFamilySizeRows','studioFamilySizeConfirm','studioFamilySizeStatus']){
    assert.match(sheet,new RegExp(`id="${id}"`),id);
  }
  assert.match(sheet,/<h2>Sizes &amp; Prices<\/h2>/);
  assert.match(sheet,/<details class="studio-family-size__range">\s*<summary>Or a range<\/summary>/,'the range is the compact secondary method');
  assert.ok(sheet.indexOf('studioFamilySizeList')<sheet.indexOf('studio-family-size__range'),'comma list first');
  assert.match(body('saveFamilySizeEditor'),/openConfirmDialog\([\s\S]*Remove and Save/);
  assert.match(body('cancelFamilySizeEditor'),/openConfirmDialog\([\s\S]*Discard/);
});

test('a read-only account can view sizes and prices but Save Changes writes nothing (demo, which can write, is unaffected)',()=>{
  const run=(access)=>{
    const status={textContent:'',dataset:{}};
    const calls=[];
    const ctx={FAMILY_SIZE_GENERATOR_MAX:50,window:{KLABS_ACCESS_STATE:access},$:(id)=>id==='studioFamilySizeStatus'?status:{},componentLibraryRecords:()=>[],
      studioFamilySizeGeneratorState:{baseName:'A',rows:[{id:'',size:'8',buy:'1',sell:'2',removed:false}]},
      openConfirmDialog:()=>calls.push('confirm'),runExplicitSave:()=>calls.push('save'),commitFamilySizeGenerator(){}};
    vm.createContext(ctx);
    for(const name of ['normalizeNameKey','numberOrZero','componentPriceProblem','familySizeGeneratorComponentName','familySizeGeneratorProblem','familySizeRowChanged','familySizeEditorDirty','familySizeExistingProblem','familySizeGeneratorError','saveFamilySizeEditor'])vm.runInContext(body(name),ctx);
    ctx.saveFamilySizeEditor();
    return {calls,status:status.textContent};
  };
  const blocked=run({can_write:false});
  assert.deepEqual(blocked.calls,[]);
  assert.match(blocked.status,/read-only/);
  assert.deepEqual(run({can_write:true,demo:true}).calls,['save']);
  assert.deepEqual(run(null).calls,['save']);
});
