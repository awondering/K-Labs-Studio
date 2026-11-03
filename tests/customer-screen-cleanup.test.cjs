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
function sheetMarkup(){
  const start=source.indexOf('function ensureCustomerFinderSheet(');
  return source.slice(start,source.indexOf('document.body.appendChild(sheet)',start));
}
function introFor(intent,view,step){
  const els={};
  const el=()=>({hidden:false,textContent:'',setAttribute(){},querySelectorAll:()=>[],querySelector:()=>null});
  ['customerFinderTitle','customerFinderSheet','customerFinderIntro','customerFinderStartActions','customerFinderSearchBlock','customerFinderRootView','customerFinderBrowseHead','customerFinderBrowseAddBtn','customerFinderNewForm','customerFinderNewBackBtn'].forEach(id=>els[id]=el());
  const ctx={$:id=>els[id]||null,customerFinderIntent:intent,customerFinderBrowseView:view,customerFinderNewBuildStep:step};
  vm.createContext(ctx);
  vm.runInContext(functionSource('customerFinderActionIntroText')+functionSource('updateCustomerFinderIntentUi'),ctx);
  ctx.updateCustomerFinderIntentUi();
  return els.customerFinderIntro;
}

test('browse list and Customer History hide the intro',()=>{
  assert.equal(introFor('browse','list','search').hidden,true);
  assert.equal(introFor('browse','detail','search').hidden,true);
});
test('New Build and Add Customer flows keep their instructions',()=>{
  const actions=introFor('new-build','list','actions');
  assert.equal(actions.hidden,false);
  assert.match(actions.textContent,/attach a customer/);
  assert.equal(introFor('new-build','list','search').hidden,false);
  assert.equal(introFor('new-build','list','add').hidden,false);
  assert.equal(introFor('customer-only','list','search').hidden,false);
});
test('duplicate in-body heading and description are removed, navigation kept',()=>{
  const markup=sheetMarkup();
  assert.ok(!markup.includes('<h3>Customers</h3>'));
  assert.ok(!markup.includes('Find and manage customers.'));
  assert.ok(markup.includes('<h2 id="customerFinderTitle">'));
  assert.ok(markup.includes('data-customer-finder-action="back-to-studio"'));
  assert.ok(markup.includes('data-customer-finder-action="close"'));
  assert.ok(markup.includes('data-customer-finder-action="browse-add-customer"'));
});
test('search placeholder is Search customers',()=>{
  assert.match(sheetMarkup(),/id="customerFinderSearch"[^>]*placeholder="Search customers"/);
});
test('removed heading styles are gone and Build History heading remains',()=>{
  assert.ok(!css.includes('.customer-finder__browse-head h3'));
  assert.ok(!css.includes('.customer-finder__browse-head p'));
  assert.ok(source.includes('<h4>Build History</h4>'));
});
