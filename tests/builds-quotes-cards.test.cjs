const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function savedBuildMarkup(record){
  const context={
    savedBuildDisplayCustomerName:(value)=>String(value&&value.customerName||'').trim()||'Unassigned',
    savedBuildDisplayStatus:()=> 'Active',
    buildLifecycleStatusKey:()=> 'active',
    escapeHtml:(value)=>String(value).replace(/[&<>"']/g,(character)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[character]),
    savedBuildDisplayDate:()=> '4 Nov 2026, 11:00 am',
    specificationValue:(value)=>String(value||'').trim(),
    formatDateDisplay:()=> '12 Dec 2026',
    isSavedBuildRowMenuOpen:()=>false,
    jobTypeLabel:()=> 'New Build',
    savedBuildRowMenuMarkup:()=> '',
  };
  vm.createContext(context);
  vm.runInContext(functionSource('savedBuildRowMarkup'),context);
  return context.savedBuildRowMarkup({record,source:'build',index:0});
}

test('Builds and Quotes card keeps customer first and clarifies the completion date',()=>{
  const record={
    customerName:'CustomerWithAnUnusuallyLongUnbrokenName',
    buildName:'CustomBuildWithAnUnusuallyLongUnbrokenName',
    quoteStatus:'active',
    jobType:'build',
    updatedAt:'2026-11-04T11:00:00Z',
    estimatedCompletionDate:'2026-12-12',
  };
  const before=JSON.stringify(record);
  const markup=savedBuildMarkup(record);
  assert.ok(markup.indexOf(record.customerName)<markup.indexOf(record.buildName));
  assert.ok(markup.includes(record.customerName));
  assert.ok(markup.includes(record.buildName));
  assert.match(markup,/Est\. completion 12 Dec 2026/);
  assert.doesNotMatch(markup,/<small>Est\. 12 Dec/);
  assert.equal(JSON.stringify(record),before,'rendering must not mutate saved build data');
});

test('Builds card metadata and names can wrap without clipping',()=>{
  assert.match(css,/#buildsScreen \.saved-build-card__meta\{\s*display:flex;\s*flex-wrap:wrap;/);
  assert.match(css,/#buildsScreen \.saved-build-card__meta small\{\s*min-width:0;[\s\S]*?overflow-wrap:anywhere;/);
  assert.match(css,/#buildsScreen \.saved-build-card__head strong,\s*#buildsScreen \.saved-build-card__title\{\s*overflow-wrap:anywhere;/);
});

test('Builds card menus have approximately 44px touch targets',()=>{
  assert.match(css,/#buildsScreen \.saved-build-card__menu-toggle\{\s*min-width:44px;\s*min-height:44px;/);
  assert.match(css,/#buildsScreen \.saved-build-card__menu-item\{\s*min-height:44px;/);
});

test('desktop width expansion is limited to the Builds and Quotes screen',()=>{
  const desktop=css.match(/@media \(min-width:761px\)\{([\s\S]*?)\n\}/);
  assert.ok(desktop,'desktop media query exists');
  assert.match(desktop[1],/\.app-shell:has\(#buildsScreen\.active\)\{\s*width:min\(100%,840px\);/);
  assert.doesNotMatch(desktop[1],/--app-max-width\s*:/);
});
