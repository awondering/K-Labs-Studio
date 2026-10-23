const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function ctx(components,status='quote'){
  const c={
    quote:{components},
    pendingComponentDraftRows:new Set(),
    currentBuildLifecycleStatus:()=>status,
    componentRowHasMeaningfulData:()=>true,
    savedComponentDisplayLabel:(item)=>item.label,
    friendlyComponentCategoryName:(v)=>v||'',
    appendComponentSizeLabel:(v)=>v,
    specificationValue:(v)=>String(v==null?'':v).trim(),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
    customerSafeText:(v)=>String(v==null?'':v),
    escapeHtml:(v)=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;'),
    clampComponentQuantity:(v)=>Math.min(Math.max(1,Math.round(Number(v))),999),
  };
  vm.createContext(c);
  vm.runInContext(['customerIncludedPartLabel','customerComponentExcludedFromCopy','componentRowQuantity','customerIncludedParts','customerIncludedPartsMarkup'].map(fn).join('\n'),c);
  return c;
}

const rows=[
  {category:'Clear Coat',label:'Two Part Clear Coat',quantity:3,cost:99,unitPrice:50},
  {category:'Tip Top',label:'Tip Top · Fuji',quantity:1},
  {category:'Reel Seat',label:'Old Seat'},
];

test('shows saved quantities, defaulting older records to 1',()=>{
  const c=ctx(rows);
  assert.deepEqual([...c.customerIncludedParts()],['3 × Two Part Clear Coat','1 × Tip Top · Fuji','1 × Old Seat']);
});

test('does not alter records or leak costs',()=>{
  const c=ctx(JSON.parse(JSON.stringify(rows)));
  const before=JSON.stringify(c.quote.components);
  const html=c.customerIncludedPartsMarkup(c.customerIncludedParts());
  assert.equal(JSON.stringify(c.quote.components),before);
  assert.doesNotMatch(html,/99|cost/);
});

test('distinct entries stay distinct',()=>{
  const c=ctx([{category:'Guide',label:'Guide A',quantity:2},{category:'Guide',label:'Guide A',quantity:4}]);
  assert.deepEqual([...c.customerIncludedParts()],['2 × Guide A','4 × Guide A']);
});

for(const status of ['quote','active','complete']){
  test(`preview and email share the formatter (${status})`,()=>{
    const c=ctx(rows,status);
    const parts=c.customerIncludedParts();
    const html=c.customerIncludedPartsMarkup(parts);
    parts.forEach((p)=>assert.ok(html.includes(`<li>${p}</li>`)));
    assert.match(source,/const includedParts=customerIncludedParts\(\);[\s\S]*includedParts\.map\(\(part\)=>`- \$\{part\}`\)/);
    assert.match(source,/const parts=customerIncludedParts\(\);/);
  });
}
