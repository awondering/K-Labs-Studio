const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');

function functionSource(name,asyncFn=false){
  const marker=`${asyncFn?'async ':''}function ${name}(`;
  const start=source.indexOf(marker);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

// Mocked library write: no real storage is touched.
function harness({fail=false}={}){
  const row={id:'line-1',libraryComponentId:'lib-1',category:'Reel Seats',subcategory:'Fuji',brand:'Fuji',supplier:'Fuji',cost:10,unitPrice:20,quantity:1,sizeLabel:'16'};
  const c={
    row,fail,writes:[],dialogs:[],flashes:[],
    quote:{components:[row]},
    requestAnimationFrame:(fn)=>setImmediate(fn),
    console:{error(){}},
    specificationValue:(v)=>String(v==null?'':v).trim(),
    isBlankCategory:(v)=>!String(v||'').trim(),
    componentRowSizeLabel:(r)=>r.sizeLabel||'',
    componentLibraryRecordForRow:()=>({id:'lib-1',name:'Reel Seats',category:'Reel Seats',brand:'Fuji',sizeOptions:['16','18'],stockOnHand:4}),
    upsertComponentLibraryRecord(name,src){if(c.fail)throw new Error('quota');c.writes.push({name,src});return true;},
    flashWorkshopStatus(m){c.flashes.push(m);},
    openConfirmDialog(cfg,h){c.dialogs.push({cfg,h});},
    escapeHtml:(v)=>String(v),
    document:{querySelector:()=>null,createElement:()=>({})},
  };
  c.quote=c.quote;
  vm.createContext(c);
  const names=['libraryUpdateSignature','libraryUpdateStatusView','libraryUpdateStatusMarkup','syncLibraryUpdateStatus','libraryUpdateTarget','requestUpdateLibraryComponentFromRow','retryLibraryComponentUpdate'];
  vm.runInContext('const libraryUpdateStatus=new WeakMap();const libraryUpdatesInFlight=new WeakSet();\n'+names.slice(0,5).map((n)=>functionSource(n)).join('\n')+'\n'+functionSource('runLibraryComponentUpdate',true)+'\n'+names.slice(5).map((n)=>functionSource(n)).join('\n'),c);
  return c;
}
const text=(c)=>vm.runInContext('libraryUpdateStatusView(quote.components[0])',c);
const tick=()=>new Promise((r)=>setImmediate(r));

test('pending blocks duplicate submits, success shows only after the write',async()=>{
  const c=harness();
  c.requestUpdateLibraryComponentFromRow(0);
  assert.equal(c.dialogs.length,1);
  c.dialogs[0].h('update');
  assert.equal(text(c).state,'pending');
  assert.equal(c.writes.length,0);
  c.requestUpdateLibraryComponentFromRow(0);
  assert.equal(c.dialogs.length,1,'no second confirmation while pending');
  await tick();await tick();await tick();
  assert.equal(c.writes.length,1);
  assert.equal(text(c).state,'success');
  assert.equal(text(c).text,'\u2713 LIBRARY UPDATED');
  assert.equal(c.writes[0].src.cost,10);
  assert.equal(c.writes[0].src.unitPrice,20);
  assert.equal(c.writes[0].src.brand,'Fuji');
  assert.equal(c.writes[0].src.stockOnHand,4);
  assert.equal(c.writes[0].src.id,'lib-1');
  assert.match(vm.runInContext('libraryUpdateStatusMarkup(quote.components[0],0)',c),/role="status" aria-live="polite" aria-atomic="true">\u2713 LIBRARY UPDATED/);
});

test('failure shows a readable error with retry, keeps values, retry succeeds',async()=>{
  const c=harness({fail:true});
  c.requestUpdateLibraryComponentFromRow(0);
  c.dialogs[0].h('update');
  await tick();await tick();await tick();
  const view=text(c);
  assert.equal(view.state,'error');
  assert.equal(view.retry,true);
  assert.match(view.text,/failed/i);
  assert.equal(c.row.cost,10);
  assert.equal(c.row.unitPrice,20);
  c.fail=false;
  c.retryLibraryComponentUpdate(0);
  assert.equal(text(c).state,'pending');
  await tick();await tick();await tick();
  assert.equal(text(c).state,'success');
  assert.equal(c.dialogs.length,1,'retry does not reopen the confirmation');
  assert.equal(c.writes.length,1);
});

test('editing a relevant field after success clears the indication',async()=>{
  const c=harness();
  c.requestUpdateLibraryComponentFromRow(0);
  c.dialogs[0].h('update');
  await tick();await tick();await tick();
  assert.equal(text(c).state,'success');
  c.row.unitPrice=25;
  assert.equal(text(c).state,'');
  c.row.unitPrice=20;
  assert.equal(text(c).state,'success');
});

test('wiring: live status region, aria-disabled pending, input sync, retry action, 44px retry',()=>{
  assert.match(source,/libraryUpdateStatusMarkup\(item,index\)/);
  assert.match(source,/syncLibraryUpdateStatus\(quote\.components\[i\]\)/);
  assert.match(source,/action==='retry-library-update'/);
  assert.match(css,/quote-component-row__library-retry[\s\S]*min-height:44px/);
});
