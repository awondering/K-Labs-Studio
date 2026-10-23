const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const plain=(value)=>JSON.parse(JSON.stringify(value));

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const prefix=source.slice(Math.max(0,start-6),start)==='async '?'async ':'';
  return prefix+source.slice(start,source.indexOf('\n}',start)+2);
}

function harness({persist}={}){
  const writes=[];
  const calls={goScreen:[],info:[]};
  const workshop={firstGuide:150,guideCount:12,targetStripper:1800,locked:false,workshopIndex:3};
  const c={
    state:{...workshop},
    quote:{buildNumber:'B-1',guideSpecification:null},
    workshopGuideSnapshot:null,
    layoutEntryOrigin:'build',
    layoutEntryBuildRef:{buildNumber:'B-1'},
    workshopToolsState:{spiral:{method:'offset',direction:'right',offsetStartAngle:45,rodStyle:'spinning',guideCount:12,expandedGuideIndex:-1,
      guides:Array.from({length:12},(_,i)=>({positionMm:100*i,odMm:8,angleDeg:i}))}},
    SPIRAL_MAPPER_DEFAULT_STATE:{method:'progressive',direction:'left',offsetStartAngle:20},
    Store:{set:(key,value)=>writes.push({key,value})},
    numberOrZero:(v)=>Number.isFinite(Number(v))?Number(v):0,
    clampValue:(v,min,max)=>Math.min(max,Math.max(min,Number(v))),
    clampMeasurementValue:(v,min,max)=>Math.min(max,Math.max(min,Number(v))),
    normalizeSpiralMethod:(v)=>v||'progressive',
    normalizeSpiralDirection:(v)=>v||'left',
    normalizeRodStyle:(v)=>v||'',
    clampSpiralAngle:Number,
    clampSpiralStripperAngle:Number,
    calcGuideLayout:(first,count)=>({rows:Array.from({length:count},(_,i)=>({g:i+1,cum:first*(i+1)}))}),
    syncSpiralWithGuideLayout(){
      const spiral=c.workshopToolsState.spiral;
      spiral.guideCount=c.state.guideCount;
      if(spiral.guides.length!==c.state.guideCount)spiral.guides=Array.from({length:c.state.guideCount},(_,i)=>({positionMm:0,odMm:null,angleDeg:i}));
    },
    render(){},
    normalizeNameKey:(v)=>String(v||'').trim().toLowerCase(),
    clearQuoteAutosaveTimer(){},
    markQuoteSaved(){},
    saveQuoteCurrent(){},
    showStudioWorkflow(){},
    renderWorkshopQuote(){},
    focusWorkshopSection(){},
    goScreen:(id)=>calls.goScreen.push(id),
    openInfoDialog:(title,message)=>calls.info.push({title,message}),
    console:{error(){}},
    persistCurrentQuoteRecord:persist||(async()=>({source:'build',index:0})),
  };
  vm.createContext(c);
  vm.runInContext([
    'save','clearLayoutEntryOrigin','applyGuideLayoutDefaults','captureLiveGuideState','beginBuildGuideEdit',
    'endBuildGuideEdit','buildGuideView','captureGuideSpecificationSnapshot','normalizeGuideSpecification',
    'applyGuideSpecificationSnapshot','returnToOriginatingBuildFromGuideLayout',
  ].map(fn).join('\n'),c);
  return {c,writes,calls,workshop};
}

test('new build: no layout is assigned and nothing is captured from Workshop',()=>{
  const {c}=harness();
  assert.equal(c.buildGuideView(),null);
  c.beginBuildGuideEdit(c.quote.guideSpecification);
  assert.equal(c.state.guideCount,9);
  assert.equal(c.state.firstGuide,105);
  assert.equal(c.workshopToolsState.spiral.rodStyle,'');
  assert.equal(c.quote.guideSpecification,null);
  assert.equal(c.buildGuideView(),null);
  assert.doesNotMatch(fn('quoteForPersistence'),/captureGuideSpecificationSnapshot/);
});

test('existing build loads and displays its own saved layout, not Workshop values',()=>{
  const {c}=harness();
  c.quote.guideSpecification={guideCount:7,firstGuideMm:90,targetStripperMm:1100,spiralMethod:'acute',spiralDirection:'left',spiralOffsetStartAngle:20,spiralAngles:[0,0,0,0,0,90,180]};
  const view=c.buildGuideView();
  assert.equal(view.guideCount,7);
  assert.equal(view.rows.length,7);
  assert.equal(view.method,'acute');
  c.beginBuildGuideEdit(c.quote.guideSpecification);
  assert.equal(c.state.guideCount,7);
  assert.equal(c.state.firstGuide,90);
  assert.equal(c.workshopToolsState.spiral.method,'acute');
});

test('Workshop keeps its own last-used settings through a build edit',()=>{
  const {c,writes,workshop}=harness();
  const spiralBefore=plain(c.workshopToolsState.spiral);
  c.beginBuildGuideEdit(null);
  c.state.guideCount=6;
  c.save();
  assert.equal(writes.length,0,'build-context edits are never written as last-used');
  c.clearLayoutEntryOrigin();
  assert.deepEqual(plain(c.state),workshop);
  assert.deepEqual(plain(c.workshopToolsState.spiral),spiralBefore);
  c.save();
  assert.equal(writes.length,1);
  assert.equal(writes[0].value.guideCount,12);
});

test('SAVE TO BUILD & RETURN captures the layout, persists, restores Workshop and returns',async()=>{
  const {c,calls,workshop}=harness();
  c.beginBuildGuideEdit(null);
  c.state.guideCount=8;
  c.state.firstGuide=95;
  c.syncSpiralWithGuideLayout();
  await c.returnToOriginatingBuildFromGuideLayout();
  assert.equal(c.quote.guideSpecification.guideCount,8);
  assert.equal(c.quote.guideSpecification.firstGuideMm,95);
  assert.equal(c.layoutEntryOrigin,'');
  assert.deepEqual(calls.goScreen,['workshopScreen']);
  assert.deepEqual(plain(c.state),workshop);
  assert.match(source,/'SAVE TO BUILD & RETURN'/);
});

test('save failure stays in Guide Setup, keeps entries and the previous layout, and reports an error',async()=>{
  const {c,calls}=harness({persist:async()=>{throw new Error('offline');}});
  c.beginBuildGuideEdit(null);
  c.state.guideCount=8;
  await c.returnToOriginatingBuildFromGuideLayout();
  assert.equal(c.quote.guideSpecification,null);
  assert.equal(c.state.guideCount,8);
  assert.equal(c.layoutEntryOrigin,'build');
  assert.deepEqual(calls.goScreen,[]);
  assert.equal(calls.info.length,1);
  assert.match(calls.info[0].message,/could not be saved/);
});

test('leaving Guide Setup by other navigation clears the Studio return context',()=>{
  assert.match(source,/screenId!=='layoutScreen' && layoutEntryOrigin==='build'\)clearLayoutEntryOrigin\(\)/);
  assert.match(fn('clearLayoutEntryOrigin'),/endBuildGuideEdit\(\)/);
});
