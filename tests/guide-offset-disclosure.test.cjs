const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(){
  const elements=new Map();
  const node=()=>({
    innerHTML:'',textContent:'',hidden:false,attributes:{},listeners:{},
    classList:{toggle(){}},
    getAttribute(name){return this.attributes[name];},
    setAttribute(name,value){this.attributes[name]=value;},
    addEventListener(type,handler){this.listeners[type]=handler;},
    closest(){return null;},querySelector(){return null;},
  });
  for(const id of ['guideSpacingCards','workshopSpiralOffsetsToggle','workshopToolSpiral']){
    elements.set(id,node());
  }
  const c=vm.createContext({
    state:{firstGuide:105,guideCount:5,targetStripper:1260},
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3},
    workshopToolsState:{spiral:{method:'progressive',rodStyle:'casting',direction:'left',guideCount:5,
      expandedGuideIndex:-1,showPhysicalOffsets:false,unit:'metric',imperialDisplay:'decimal',
      guides:[{odMm:null,angleDeg:45},{odMm:10,angleDeg:90},{odMm:-1,angleDeg:135},
        {odMm:8,angleDeg:180},{odMm:12,angleDeg:0}].map((guide,index)=>({...guide,positionMm:100+index*200}))}},
    $:id=>elements.get(id),
    document:{querySelectorAll:()=>[]},
    initializeGuideSetupStages(){},renderGuideSetupStages(){},
    renderSpiralMapperVisual(){},syncWorkshopToggleButtons(){},
    activeMeasurementUnits:()=> 'metric',activeImperialDisplay:()=> 'decimal',
    syncGuideSpacingToggle:()=>false,captureSpiralRowFocus:()=>null,restoreSpiralRowFocus(){},
    calcGuideLayout:()=>({rows:c.workshopToolsState.spiral.guides.map((guide,index)=>({g:index+1,cum:guide.positionMm,spacing:200}))}),
    formatGuidePositionMillimetres:value=>`${value} mm`,formatGuideListMeasurement:value=>`${value} mm`,
    workshopMeasurementInputText:String,workshopUnitSuffix:()=> 'mm',
    formatWorkshopMeasurementValue:value=>`${value.toFixed(3)} mm`,
    SPINNING_STANDARD_NOTE:'Standard',SPIRAL_METHOD_NOTES:{progressive:'Progressive',standard:'Standard'},
    escapeHtml:String,markGuideDataDirty(){},
  });
  for(const name of [
    'numberOrZero','trimTrailingZeroes','formatDecimal','normalizeRodStyle',
    'normalizeSpiralMethod','normalizeSpiralDirection','clampSpiralAngle',
    'spiralGuideRowsExpandable','oppositeSpiralDirection','spiralGuideDirectionForPresentation',
    'spiralOppositeSideLabel','spiralOffsetLabel','renderSpiralGuideRows','syncRodBlankSelectedMarker',
    'renderSpiralGuideMapper','bindSpiralOffsetsToggle','updateSpiralGuideDiameter',
    'normalizeWorkshopUnit','parseWorkshopMeasurementMm',
  ]){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    const lineEnd=source.indexOf('\n',start);
    const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),c);
  }
  c.renderWorkshopCalculator=()=>c.renderSpiralGuideMapper();
  c.bindSpiralOffsetsToggle();
  c.renderWorkshopCalculator();
  return {c,e:id=>elements.get(id),toggle:()=>elements.get('workshopSpiralOffsetsToggle').listeners.click()};
}

test('offset toggle reveals relevant diameter/result pairs without opening rotation editors and retains eligibility',()=>{
  const {c,e,toggle}=harness();
  assert.doesNotMatch(e('guideSpacingCards').innerHTML,/guide-offset-controls/);
  toggle();
  const markup=e('guideSpacingCards').innerHTML;
  assert.equal((markup.match(/class="guide-offset-controls"/g)||[]).length,3);
  assert.equal((markup.match(/data-spiral-field="od"/g)||[]).length,3);
  assert.doesNotMatch(markup,/class="spiral-guide-row__edit"/);
  assert.equal(c.workshopToolsState.spiral.expandedGuideIndex,-1);
  assert.equal(e('workshopSpiralOffsetsToggle').textContent,'SHOW OFFSETS');
  assert.equal(e('workshopSpiralOffsetsToggle').attributes['aria-pressed'],'true');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.equal((html.match(/id="workshopSpiralOffsetsToggle"/g)||[]).length,1);
  assert.match(html,/<div class="guide-spacing-panel__toggles">[\s\S]*?id="guideSpacingToggle"[\s\S]*?id="workshopSpiralOffsetsToggle"[\s\S]*?<\/div>/);
  c.workshopToolsState.spiral.method='standard';
  c.workshopToolsState.spiral.guides.forEach(guide=>{guide.angleDeg=0;});
  c.renderWorkshopCalculator();
  assert.equal(e('workshopSpiralOffsetsToggle').hidden,true);
  assert.equal(c.workshopToolsState.spiral.showPhysicalOffsets,false);
});

test('missing/invalid diameter shows prompt; live updates affect only its guide and survive hiding',()=>{
  const {c,e,toggle}=harness();
  const spiral=c.workshopToolsState.spiral;
  const before=plain(spiral.guides);
  toggle();
  assert.equal((e('guideSpacingCards').innerHTML.match(/Enter blank diameter/g)||[]).length,2);
  for(const invalid of ['','bad','0','-3','Infinity']){
    c.updateSpiralGuideDiameter(0,invalid);
    assert.equal(spiral.guides[0].odMm,null);
    assert.match(e('guideSpacingCards').innerHTML,/id="guideOffsetResult0"[^>]*>[\s\S]*?<strong>Enter blank diameter<\/strong>/);
  }
  c.updateSpiralGuideDiameter(0,'14');
  assert.equal(spiral.guides[0].odMm,14);
  assert.match(e('guideSpacingCards').innerHTML,/id="guideOffsetResult0"[^>]*>[\s\S]*?<strong>5\.498 mm/);
  assert.deepEqual(plain(spiral.guides.slice(1)),before.slice(1));
  const retained=plain(spiral.guides);
  toggle();
  assert.doesNotMatch(e('guideSpacingCards').innerHTML,/guide-offset-controls|data-spiral-field="od"/);
  assert.deepEqual(plain(spiral.guides),retained);
  toggle();
  assert.match(e('guideSpacingCards').innerHTML,/id="guideOffsetDiameter0"[^>]*value="14"/);
  assert.deepEqual(plain(spiral.guides),retained);
});
