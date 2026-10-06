const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function harness(){
  const classes=new Set(['quote-section--collapsed']);
  const attributes={'aria-controls':'workshopComponentsBody','aria-expanded':'false'};
  const listeners={};
  const trigger={
    getAttribute:name=>attributes[name],
    setAttribute(name,value){attributes[name]=value;},
    addEventListener(name,handler){listeners[name]=handler;},
    closest:()=>section,
  };
  const section={
    classList:{
      contains:name=>classes.has(name),
      toggle(name,enabled){if(enabled)classes.add(name);else classes.delete(name);},
    },
    querySelector:()=>trigger,
  };
  const body={style:{},scrollHeight:240,offsetHeight:240,closest:()=>section};
  const addListeners={};
  const add={addEventListener(name,handler){addListeners[name]=handler;}};
  const input={value:'Unsaved wrap description',selectionStart:7,selectionEnd:12};
  const record={id:'existing',description:'Unsaved wrap description',cost:12.34,qty:2};
  const calls=[];
  const c=vm.createContext({
    $:id=>id==='workshopComponentsBody'?body:id==='addComponentBtn'?add:null,
    document:{querySelectorAll:()=>[trigger],activeElement:input},
    window:{setTimeout:()=>1,clearTimeout(){}},
    workshopSectionExpandTimers:new Map(),
    scrollWorkshopSectionIntoView(){},
    quote:{components:[record]},
    pendingComponentDraftRows:new Set(),
    componentRowIsEffectivelyEmpty:item=>!item.description,
    pruneComponentDraftRows:index=>({preserveIndex:index,changed:false}),
    defaultComponentRow:()=>({description:'',cost:0}),
    persistComponentDraftCleanup:changed=>calls.push(['persist',changed]),
    renderQuoteComponents:()=>calls.push(['render']),
    updateQuoteSummary:()=>calls.push(['summary']),
    openChoicePicker:(...args)=>calls.push(['picker',...args]),
  });
  const registry=source.match(/const WORKSHOP_COLLAPSIBLE_SECTION_IDS=\[[^\n]+;/);
  assert.ok(registry);
  vm.runInContext(registry[0],c);
  for(const name of ['setWorkshopSectionCollapsed','animateWorkshopSectionBody','expandWorkshopCollapsibleSection','bindWorkshopCollapsibleSections']){
    vm.runInContext(functionSource(name),c);
  }
  c.bindWorkshopCollapsibleSections();
  const start=source.indexOf("  const addComponentBtn=$('addComponentBtn');",source.indexOf('function bindWorkshopQuoteBuilder('));
  const end=source.indexOf("  const toggleStatusBtn=",start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(source.slice(start,end),c);
  return {c,attributes,listeners,addListeners,record,input,body,calls};
}

test('Components uses a separate native heading and Add button within its controlled body',()=>{
  const section=html.slice(html.indexOf('<article id="workshopComponentsSection"'),html.indexOf('<article id="workshopPricingSection"'));
  const heading=section.slice(0,section.indexOf('<div id="workshopComponentsBody"'));
  assert.match(heading,/<button[^>]+type="button"[^>]+data-collapsible-trigger[^>]+aria-expanded="false"[^>]+aria-controls="workshopComponentsBody"/);
  assert.match(heading,/id="workshopComponentsCountText"/);
  assert.match(heading,/class="quote-section__chevron" aria-hidden="true"/);
  assert.doesNotMatch(heading,/id="addComponentBtn"/);
  assert.match(section,/<div id="workshopComponentsBody" class="quote-section__body">\s*<button id="addComponentBtn"[^>]+type="button"[\s\S]+<div id="quoteComponentsList" class="quote-components"><\/div>/);
  assert.match(css,/#workshopScreen #workshopComponentsSection\.quote-section--collapsed #workshopComponentsBody\{\s*display:none;/);
  assert.match(css,/#workshopScreen #addComponentBtn\{[^}]*min-height:44px;/);
  assert.match(css,/#workshopScreen \.quote-section__components-toggle\{\s*min-height:50px;/);
  assert.match(css,/#workshopScreen \.quote-section__components-toggle:focus-visible,\s*#workshopScreen #addComponentBtn:focus-visible\{\s*outline:/);
});

test('Heading toggles expanded state without rendering or discarding unsaved component values',()=>{
  const h=harness();
  const before=JSON.stringify(h.c.quote);
  h.listeners.click();
  assert.equal(h.attributes['aria-expanded'],'true');
  h.listeners.click();
  assert.equal(h.attributes['aria-expanded'],'false');
  h.listeners.click();
  assert.equal(h.attributes['aria-expanded'],'true');
  assert.equal(JSON.stringify(h.c.quote),before);
  assert.equal(h.c.quote.components[0],h.record);
  assert.equal(h.input.value,'Unsaved wrap description');
  assert.equal(h.input.selectionStart,7);
  assert.equal(h.input.selectionEnd,12);
  assert.deepEqual(h.calls,[]);
  assert.equal(h.c.document.activeElement,h.input);
});

test('Add opens the existing category flow once without collapsing or modifying existing records',()=>{
  const h=harness();
  h.listeners.click();
  const before=JSON.stringify(h.record);
  let stopped=0;
  h.addListeners.click({stopPropagation(){stopped++;}});
  assert.equal(stopped,1);
  assert.equal(h.attributes['aria-expanded'],'true');
  assert.equal(h.c.quote.components.length,2);
  assert.equal(h.c.quote.components[1],h.record);
  assert.equal(JSON.stringify(h.record),before);
  assert.equal(h.c.pendingComponentDraftRows.has(h.c.quote.components[0]),true);
  assert.equal(h.c.expandedComponentRowIndex,0);
  assert.deepEqual(h.calls.map(call=>call[0]),['persist','render','summary','picker']);
  assert.deepEqual(h.calls[3],['picker','category',0,h.input]);
  assert.equal(h.input.value,'Unsaved wrap description');
});
