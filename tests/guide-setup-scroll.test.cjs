const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');

// Minimal element stub: enough surface for setGuideSetupStage/renderGuideSetupStages and
// the scroll helpers (getBoundingClientRect, querySelector for the stage heading).
function makeElement(overrides){
  return Object.assign({
    hidden:false,
    textContent:'',
    innerHTML:'',
    attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    getAttribute(name){return this.attributes[name]??null;},
    querySelector(){return null;},
    getBoundingClientRect(){return {top:0,bottom:0,left:0,right:0,height:0,width:0};},
  },overrides);
}

function harness(){
  const rafQueue=[];
  const scrollCalls=[];
  const elements=new Map();
  const heading0=makeElement({className:'guide-setup-stage__head'});
  const heading1=makeElement({className:'guide-setup-stage__head',getBoundingClientRect:()=>({top:400,bottom:460,left:0,right:0,height:60,width:300})});
  const heading2=makeElement({className:'guide-setup-stage__head'});
  const headingsByStage={0:heading0,1:heading1,2:heading2};
  for(let i=0;i<3;i++){
    const edit=makeElement();
    const title=makeElement();
    const heading=headingsByStage[i];
    elements.set(`guideSetupStage${i}`,makeElement({querySelector:(sel)=>sel==='.guide-setup-stage__head'?heading:sel==='[data-guide-stage-edit]'?edit:sel==='h4'?title:null}));
    elements.set(`guideSetupBody${i}`,makeElement());
    elements.set(`guideSetupSummary${i}`,makeElement());
  }
  elements.set('guideSpacingCards',makeElement());
  const topbar=makeElement({hidden:true});
  const documentElement={scrollHeight:2000,style:{getPropertyValue:()=>''}};
  const windowStub={
    innerHeight:800,
    scrollY:0,
    matchMedia:()=>({matches:false}),
    requestAnimationFrame:(cb)=>{rafQueue.push(cb);return rafQueue.length;},
    scrollTo:(opts)=>{scrollCalls.push(opts);windowStub.scrollY=opts.top;},
    setTimeout:()=>{},
    getComputedStyle:()=>({getPropertyValue:()=>'',display:'block',visibility:'visible',position:'static'}),
  };
  const documentStub={
    documentElement,
    scrollingElement:documentElement,
    querySelector:(sel)=>sel==='.topbar'?topbar:null,
    querySelectorAll:()=>[],
  };
  const c=vm.createContext({
    state:{guideCount:5,firstGuide:105,targetStripper:1260},
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3},
    guideSetupStage:0,guideSetupCompletedStage:-1,
    workshopToolsState:{spiral:{guideCount:5,method:'progressive',direction:'left',rodStyle:'casting',
      unit:'metric',imperialDisplay:'decimal',expandedGuideIndex:2,offsetStartAngle:0,
      guides:[12,11,10,9,8].map((odMm,index)=>({odMm,positionMm:100+index*200,angleDeg:index===4?0:90}))}},
    $:id=>elements.get(id),
    window:windowStub,
    document:documentStub,
    requestAnimationFrame:windowStub.requestAnimationFrame,
    getComputedStyle:windowStub.getComputedStyle,
    syncGuideSpacingToggle:()=>false,
    captureSpiralRowFocus:()=>null,restoreSpiralRowFocus(){},
    activeMeasurementUnits:()=> 'metric',
    calcGuideLayout:()=>({rows:c.workshopToolsState.spiral.guides.map((guide,index)=>({g:index+1,cum:guide.positionMm,spacing:200}))}),
    formatGuidePositionMillimetres:value=>`${value} mm`,
    formatGuideListMeasurement:value=>`${value} mm`,
    workshopMeasurementInputText:value=>String(value),
    formatWorkshopMeasurementValue:value=>`${value.toFixed(3)} mm`,
    workshopUnitSuffix:()=> 'mm',
    escapeHtml:String,
    markGuideDataDirty(){},
    numberOrZero:value=>Number.isFinite(value)?value:0,
  });
  for(const name of [
    'trimTrailingZeroes','formatDecimal',
    'setGuideSetupStage','renderGuideSetupStages','normalizeRodStyle','normalizeSpiralMethod',
    'normalizeSpiralDirection','clampSpiralAngle','clampSpiralStripperAngle','clampSpiralGuideCount',
    'autoSpiralTransitionGuides','spiralStripperIndex','spiralGuideFallbackPositionMm',
    'buildSpiralPresetAngles','syncSpiralGuidesLength','setSpiralGuideAngle',
    'spiralGuideRowsExpandable','oppositeSpiralDirection','spiralGuideDirectionForPresentation',
    'spiralOppositeSideLabel','spiralOffsetLabel','renderSpiralGuideRows','syncRodBlankSelectedMarker',
    'syncSpiralGuidePositionsFromLayout','captureSpiralGeometry',
    'waitForDomRender','isDocumentScroller','bottomOverlayDepth','viewportVisibleBottom',
    'safeAreaInsetTop','topOverlayDepth','viewportVisibleTop','nearestScrollableContainer',
    'scrollElementFullyIntoView','workshopTopUiOffset','scrollWorkshopSectionIntoView',
    'scrollGuideSetupStageHeadingIntoView',
  ]){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    const lineEnd=source.indexOf('\n',start);
    const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),c);
  }
  return {c,e:id=>elements.get(id),runRaf:()=>{while(rafQueue.length)rafQueue.shift()();},scrollCalls,windowStub};
}

test('Continue triggers a deferred scroll of the newly opened stage heading, not an immediate one',()=>{
  const {c,runRaf,scrollCalls}=harness();
  c.setGuideSetupStage(0,true);
  assert.equal(c.guideSetupStage,1);
  // The scroll must not fire synchronously inside setGuideSetupStage - it waits for the
  // stage collapse/expand to settle first (double rAF), matching "wait until settled".
  assert.equal(scrollCalls.length,0);
  runRaf();
  assert.equal(scrollCalls.length,1);
  assert.equal(scrollCalls[0].top,388);
});

test('Edit reopening an earlier stage scrolls its heading the same way',()=>{
  const {c,runRaf,scrollCalls}=harness();
  c.setGuideSetupStage(0,true);
  runRaf();
  c.setGuideSetupStage(1,true);
  runRaf();
  scrollCalls.length=0;
  c.setGuideSetupStage(0,false);
  assert.equal(c.guideSetupStage,0);
  assert.equal(scrollCalls.length,0);
  runRaf();
  assert.equal(scrollCalls.length,1);
});

test('Calling renderGuideSetupStages directly (ordinary input/result re-render) never scrolls',()=>{
  const {c,runRaf,scrollCalls}=harness();
  c.renderGuideSetupStages();
  c.renderGuideSetupStages();
  runRaf();
  assert.equal(scrollCalls.length,0);
});

test('collapsed summaries are single native controls, outside the input body, with one delegated handler',()=>{
  const start=source.indexOf('function initializeGuideSetupStages(');
  const initialization=source.slice(start,source.indexOf('\nfunction setGuideSetupStage(',start));
  const markup=initialization.match(/stage\.innerHTML=`([^`]+)`;/)[1];
  assert.match(markup,/<button class="guide-setup-stage__reopen" type="button" data-guide-stage-edit=/);
  assert.match(markup,/aria-controls="guideSetupBody\$\{index\}" aria-expanded="false"/);
  assert.match(markup,/<span id="guideSetupSummary\$\{index\}"[^>]*>/);
  assert.match(markup,/guide-setup-stage__chevron" aria-hidden="true"/);
  assert.match(markup,/<\/button><\/header><div id="guideSetupBody/);
  assert.equal((markup.match(/<button\b/g)||[]).length,1);
  assert.equal((initialization.match(/addEventListener\(/g)||[]).length,1);
  assert.doesNotMatch(initialization,/keydown|keyup|>Edit<\/button>/);
});

test('reopening every collapsed stage retains values and updates disclosure state without rerender scrolling',()=>{
  const {c,e,runRaf,scrollCalls}=harness();
  const before=JSON.stringify({state:c.state,spiral:c.workshopToolsState.spiral});
  c.setGuideSetupStage(0,true);
  runRaf();
  c.setGuideSetupStage(1,true);
  runRaf();
  for(const index of [0,1,2]){
    const stage=e(`guideSetupStage${index}`);
    const reopen=stage.querySelector('[data-guide-stage-edit]');
    assert.equal(reopen.hidden,false);
    assert.equal(reopen.getAttribute('aria-expanded'),'false');
    const previousCalls=scrollCalls.length;
    c.setGuideSetupStage(index,false);
    runRaf();
    assert.equal(scrollCalls.length,previousCalls+1);
    assert.equal(reopen.hidden,true);
    assert.equal(reopen.getAttribute('aria-expanded'),'true');
    assert.equal(stage.querySelector('h4').hidden,false);
    assert.equal(e(`guideSetupBody${index}`).hidden,false);
    c.renderGuideSetupStages();
    runRaf();
    assert.equal(scrollCalls.length,previousCalls+1);
    assert.equal(c.guideSetupStage,index);
    assert.equal(JSON.stringify({state:c.state,spiral:c.workshopToolsState.spiral}),before);
  }
});
