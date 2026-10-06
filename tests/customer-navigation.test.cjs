const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

function functionSource(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function harness(screenId='workshopScreen',studioView='workflow'){
  const elements=new Map();
  const viewportListeners=new Set();
  const scrollCalls=[];
  const groups=[{
    key:'alex mason',name:'Alex Mason',quotes:[],builds:[{}],entries:[],
    records:[{record:{customerName:'Alex Mason',phone:'021 555 1234'}}],
  }];
  let c;
  function node(id,inSheet=false){
    const attributes={};
    const listeners={};
    const styles=new Map();
    const classes=new Set();
    return {
      id,inSheet,hidden:false,value:'',textContent:'',scrollTop:180,isConnected:true,
      style:{setProperty:(name,value)=>styles.set(name,value),removeProperty:name=>styles.delete(name)},
      styles,
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)},
      setAttribute:(name,value)=>attributes[name]=value,
      getAttribute:name=>attributes[name]||'',
      addEventListener:(name,fn)=>{listeners[name]=fn;},
      removeEventListener(){},
      listeners,
      focus(){c.document.activeElement=this;},
      blur(){c.document.activeElement=null;},
      contains:element=>!!(element&&element.inSheet),
      querySelector(selector){
        if(selector.startsWith('#'))return elements.get(selector.slice(1))||null;
        if(selector==='.customer-finder__panel')return elements.get('panel');
        if(selector==='.customer-finder__body')return elements.get('body');
        if(selector==='button[data-customer-finder-action="close"]')return elements.get('close');
        if(selector==='[data-customer-finder-action="back-to-list"]')return elements.get('back');
        if(selector==='[data-customer-finder-action="back-to-studio"]')return elements.get('studio');
        return null;
      },
      querySelectorAll:selector=>selector==='.customer-finder__customer-select'?[elements.get('alex')]:[],
      closest(selector){
        if(selector==='[data-customer-finder-action]' && attributes['data-customer-finder-action'])return this;
        if(selector==='[data-customer-key]' && attributes['data-customer-key'])return this;
        return null;
      },
      set innerHTML(value){
        this.markup=value;
        if(this.id==='customerFinderSheet'){
          for(const id of value.matchAll(/id="([^"]+)"/g)){
            if(!elements.has(id[1]))elements.set(id[1],node(id[1],true));
          }
        }
      },
      get innerHTML(){return this.markup||'';},
    };
  }
  for(const id of ['panel','body','close','back','studio','alex']){
    elements.set(id,node(id,true));
  }
  elements.get('close').setAttribute('data-customer-finder-action','close');
  elements.get('back').setAttribute('data-customer-finder-action','back-to-list');
  elements.get('studio').setAttribute('data-customer-finder-action','back-to-studio');
  elements.get('alex').setAttribute('data-customer-key','alex mason');
  const opener=node('customerFinderReturnBtn');
  elements.set(opener.id,opener);
  const studioTile=node('studioCustomersTile');
  const body=node('documentBody');
  body.appendChild=element=>elements.set(element.id,element);
  const screens=new Map(['workshopScreen','buildsScreen','homeScreen'].map(id=>[id,node(id)]));
  const noSave=()=>{throw new Error('Navigation must not save or discard');};
  c=vm.createContext({
    customerFinderSearch:'',customerFinderSelectedKey:'',customerFinderBrowseView:'list',
    customerFinderBuildRowMenu:'',customerFinderCustomerMenuOpen:false,customerFinderIntent:'browse',
    customerFinderNewBuildStep:'search',customerFinderOrigin:null,
    customerFinderViewportBound:false,customerFinderViewportRaf:0,customerFinderViewportState:{keyboardActive:false},
    workflowReturnOrigin:'customer',workflowCustomerReturnKey:'alex mason',
    studioScreenView:studioView,preserveWorkshopQuoteOnEntry:false,
    modalLockDepth:0,modalLockedScrollY:0,modalReturnFocusEl:null,
    quote:{customerName:'Alex Mason',buildName:'Unsaved build name',notes:'Unsaved notes',components:[{id:'part-1',qty:2}]},
    hasUnsavedQuoteChanges:true,activeSavedBuildRef:{source:'build',index:3,buildNumber:'B-42'},
    $:id=>elements.get(id),
    document:{
      activeElement:opener,body,
      createElement:()=>node('',true),
      addEventListener(){},
      querySelector:selector=>selector==='.screen.active'?screens.get(c.activeScreen):selector==='[data-studio-action="customers"]'?studioTile:null,
    },
    activeScreen:screenId,
    window:{
      scrollY:420,
      scrollTo(x,y){scrollCalls.push(y);this.scrollY=y;},
      removeEventListener(name){viewportListeners.delete(name);},
      KLABS_NAV:{forgetScreenScroll(){}},
    },
    cancelAnimationFrame(){},
    goScreen:id=>{c.activeScreen=id;},
    renderStudioScreenMode(){},
    updateWorkshopBackToTopVisibility(){},
    ensureCustomerFinderSheet:undefined,
    bindCustomerFinderViewportHandlers:()=>{c.customerFinderViewportBound=true;viewportListeners.add('resize');viewportListeners.add('orientationchange');},
    scheduleCustomerFinderViewportSync(){},
    positionCustomerFinderInlineMenu(){},
    handleCustomerFinderFocusIn(){},
    handleCustomerFinderFocusOut(){},
    dismissCustomerFinderKeyboardFocus(){},
    customerSavedGroups:()=>groups,
    customerFinderPrimaryRecord:group=>group.records[0].record,
    customerFinderWorkRowMarkup:()=>'<div>Build fixture</div>',
    specificationValue:value=>String(value||'').trim(),
    escapeHtml:String,
    normalizeNameKey:value=>String(value||'').toLowerCase(),
    saveQuoteCurrent:noSave,persistCurrentQuoteRecord:noSave,markQuoteSaved:noSave,
    openSavedBuildRecord:noSave,
  });
  for(const name of [
    'ensureCustomerFinderSheet','openCustomerFinderSheet','closeCustomerFinderSheet',
    'returnFromCustomersToStudio','focusCustomerFinderView','renderCustomerFinder',
    'customerFinderActionIntroText','updateCustomerFinderIntentUi',
    'closeCustomerFinderBuildRowMenu','closeCustomerFinderCustomerMenu',
    'lockModalLayer','unlockModalLayer','unbindCustomerFinderViewportHandlers',
    'clearCustomerFinderViewportStyles','resetStudioScreenScrollMemory','showStudioLanding',
  ]){
    vm.runInContext(functionSource(name),c);
  }
  const bindStart=source.indexOf('function bindWorkshopQuoteBuilder(');
  const start=source.indexOf("  const customerFinderReturnBtn=$('customerFinderReturnBtn');",bindStart);
  const end=source.indexOf("  const newQuoteEntryBtn=",start);
  assert.ok(start>=0 && end>start);
  vm.runInContext(source.slice(start,end),c);
  return {
    c,e:id=>elements.get(id),groups,opener,studioTile,scrollCalls,viewportListeners,
    returnFromBuild:()=>opener.listeners.click(),
    click:target=>elements.get('customerFinderSheet').listeners.click({target}),
  };
}

function draftSnapshot(c){
  return JSON.stringify({quote:c.quote,ref:c.activeSavedBuildRef,dirty:c.hasUnsavedQuoteChanges});
}

function assertUnlocked(h){
  assert.equal(h.e('customerFinderSheet').hidden,true);
  assert.equal(h.c.modalLockDepth,0);
  assert.equal(h.c.document.body.classList.contains('component-sheet-open'),false);
  assert.equal(h.c.document.body.styles.size,0);
  assert.equal(h.c.customerFinderViewportBound,false);
  assert.equal(h.c.customerFinderOrigin,null);
  assert.equal(h.viewportListeners.size,0);
  assert.equal(h.e('customerFinderSheet').styles.size,0);
}

test('build -> history -> Customers -> Studio uses distinct handlers and retains unsaved build edits',()=>{
  const h=harness();
  const before=draftSnapshot(h.c);
  const recordsBefore=JSON.stringify(h.groups);
  h.returnFromBuild();
  assert.equal(h.c.customerFinderBrowseView,'detail');
  assert.equal(h.e('customerFinderRootView').hidden,true);
  assert.equal(h.e('customerFinderTitle').textContent,'Customer History');
  assert.equal(h.e('customerFinderIntro').textContent,'View customer details and build history.');
  assert.equal(h.e('panel').getAttribute('aria-label'),'Customer History');
  assert.equal(h.c.document.activeElement,h.e('back'));
  assert.equal(h.c.modalLockDepth,1);
  h.c.customerFinderBuildRowMenu='build::3';
  h.c.customerFinderCustomerMenuOpen=true;
  h.click(h.e('back'));
  assert.equal(h.c.customerFinderBrowseView,'list');
  assert.equal(h.e('customerFinderRootView').hidden,false);
  assert.equal(h.e('customerFinderDetail').hidden,true);
  assert.equal(h.c.customerFinderBuildRowMenu,'');
  assert.equal(h.c.customerFinderCustomerMenuOpen,false);
  assert.equal(h.e('customerFinderTitle').textContent,'Customers');
  assert.equal(h.c.document.activeElement,h.e('alex'));
  assert.equal(h.e('body').scrollTop,0);
  assert.equal(h.c.modalLockDepth,1);
  h.click(h.e('studio'));
  assertUnlocked(h);
  assert.equal(h.c.activeScreen,'workshopScreen');
  assert.equal(h.c.studioScreenView,'landing');
  assert.equal(h.c.document.activeElement,h.studioTile);
  assert.equal(h.c.window.scrollY,0);
  assert.equal(draftSnapshot(h.c),before);
  assert.equal(JSON.stringify(h.groups),recordsBefore);
});

test('outer close returns to recorded build origin, focus and scroll; repeated closing cannot unlock twice',()=>{
  const h=harness();
  const before=draftSnapshot(h.c);
  h.returnFromBuild();
  h.e('customerFinderSheet').style.setProperty('--component-sheet-vv-height','500px');
  h.e('customerFinderSheet').style.setProperty('--customer-finder-keyboard-inset','200px');
  h.c.openCustomerFinderSheet('browse');
  assert.equal(h.c.modalLockDepth,1);
  assert.equal(h.c.customerFinderOrigin.studioView,'workflow');
  h.click(h.e('close'));
  assertUnlocked(h);
  assert.equal(h.c.studioScreenView,'workflow');
  assert.equal(h.c.activeScreen,'workshopScreen');
  assert.equal(h.c.document.activeElement,h.opener);
  assert.equal(h.c.window.scrollY,420);
  const calls=h.scrollCalls.length;
  h.c.closeCustomerFinderSheet();
  assert.equal(h.scrollCalls.length,calls);
  assert.equal(draftSnapshot(h.c),before);
  h.returnFromBuild();
  assert.equal(h.c.customerFinderBrowseView,'detail');
  h.click(h.e('back'));
  h.click(h.e('close'));
  assertUnlocked(h);
  assert.equal(h.c.studioScreenView,'workflow');
});

test('close restores other recorded screens and Studio view, including after an underlying view change',()=>{
  for(const [screen,view] of [['buildsScreen','landing'],['homeScreen','landing'],['workshopScreen','landing']]){
    const h=harness(screen,view);
    const before=draftSnapshot(h.c);
    h.c.openCustomerFinderSheet('browse');
    h.c.activeScreen='workshopScreen';
    h.c.studioScreenView='components';
    h.click(h.e('close'));
    assertUnlocked(h);
    assert.equal(h.c.activeScreen,screen);
    assert.equal(h.c.studioScreenView,view);
    assert.equal(h.c.document.activeElement,h.opener);
    assert.equal(h.c.window.scrollY,420);
    assert.equal(draftSnapshot(h.c),before);
  }
});

test('new-build/add headings and intents stay intact; empty customer list still has a Studio exit',()=>{
  const h=harness();
  h.c.customerFinderIntent='new-build';
  h.c.customerFinderNewBuildStep='actions';
  h.c.ensureCustomerFinderSheet();
  h.c.updateCustomerFinderIntentUi();
  assert.equal(h.e('customerFinderTitle').textContent,'Choose Customer');
  h.c.customerFinderNewBuildStep='search';
  h.c.updateCustomerFinderIntentUi();
  assert.equal(h.e('customerFinderTitle').textContent,'Find Customer');
  h.c.customerFinderNewBuildStep='add';
  h.c.updateCustomerFinderIntentUi();
  assert.equal(h.e('customerFinderTitle').textContent,'Add Customer');
  h.groups.length=0;
  h.c.openCustomerFinderSheet('browse');
  assert.equal(h.e('customerFinderRootView').hidden,false);
  assert.match(h.e('customerFinderResults').innerHTML,/No customers matched/);
  h.click(h.e('studio'));
  assertUnlocked(h);
});
