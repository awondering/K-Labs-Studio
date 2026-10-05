const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

function harness(){
  const elements=new Map();
  const node=()=>({hidden:false,textContent:'',innerHTML:'',setAttribute(){},querySelector(){return null;}});
  for(let i=0;i<3;i++){
    const edit=node();
    elements.set(`guideSetupStage${i}`,{...node(),querySelector:()=>edit});
    elements.set(`guideSetupBody${i}`,node());
    elements.set(`guideSetupSummary${i}`,node());
  }
  elements.set('guideSpacingCards',node());
  const c=vm.createContext({
    state:{guideCount:5,firstGuide:105,targetStripper:1260},
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3},
    guideSetupStage:0,guideSetupCompletedStage:-1,
    workshopToolsState:{spiral:{guideCount:5,method:'progressive',direction:'left',rodStyle:'casting',
      unit:'metric',imperialDisplay:'decimal',expandedGuideIndex:2,offsetStartAngle:0,
      guides:[12,11,10,9,8].map((odMm,index)=>({odMm,positionMm:100+index*200,angleDeg:index===4?0:90}))}},
    $:id=>elements.get(id),
    document:{querySelectorAll:()=>[]},
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
  });
  for(const name of [
    'numberOrZero','trimTrailingZeroes','formatDecimal',
    'setGuideSetupStage','renderGuideSetupStages','normalizeRodStyle','normalizeSpiralMethod',
    'normalizeSpiralDirection','clampSpiralAngle','clampSpiralStripperAngle','clampSpiralGuideCount',
    'autoSpiralTransitionGuides','spiralStripperIndex','spiralGuideFallbackPositionMm',
    'buildSpiralPresetAngles','syncSpiralGuidesLength','setSpiralGuideAngle',
    'spiralGuideRowsExpandable','oppositeSpiralDirection','spiralGuideDirectionForPresentation',
    'spiralOppositeSideLabel','spiralOffsetLabel','renderSpiralGuideRows','syncRodBlankSelectedMarker',
    'syncSpiralGuidePositionsFromLayout','captureSpiralGeometry',
  ]){
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    const lineEnd=source.indexOf('\n',start);
    const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),c);
  }
  return {c,e:id=>elements.get(id)};
}

test('Continue/Edit navigation retains all spacing, orientation and per-guide values',()=>{
  const {c,e}=harness();
  const before=plain({state:c.state,spiral:c.workshopToolsState.spiral});
  c.renderGuideSetupStages();
  assert.equal(e('guideSetupBody0').hidden,false);
  c.setGuideSetupStage(0,true);
  assert.equal(c.guideSetupStage,1);
  assert.equal(e('guideSetupBody0').hidden,true);
  assert.equal(e('guideSetupBody1').hidden,false);
  c.renderGuideSetupStages();
  assert.equal(c.guideSetupStage,1);
  c.setGuideSetupStage(1,true);
  assert.equal(e('guideSetupBody2').hidden,false);
  c.setGuideSetupStage(0,false);
  assert.equal(e('guideSetupBody0').hidden,false);
  assert.equal(e('guideSetupBody2').hidden,true);
  c.setGuideSetupStage(0,true);
  c.setGuideSetupStage(1,true);
  assert.deepEqual(plain({state:c.state,spiral:c.workshopToolsState.spiral}),before);
});

test('selected guide alone opens adjustments and angle/diameter edits update its own offset',()=>{
  const {c,e}=harness();
  const spiral=c.workshopToolsState.spiral;
  const before=plain(spiral.guides);
  c.setSpiralGuideAngle(2,45);
  c.renderSpiralGuideRows(spiral,true);
  const markup=e('guideSpacingCards').innerHTML;
  assert.equal((markup.match(/class="spiral-guide-row__edit"/g)||[]).length,1);
  assert.match(markup,/id="guideAdjustment2"/);
  assert.match(markup,/BLANK DIAMETER \(mm\)/);
  assert.match(markup,/Applied rotation from reel side/);
  assert.match(markup,/3.927 mm/);
  spiral.guides[2].odMm=14;
  c.renderSpiralGuideRows(spiral,true);
  assert.match(e('guideSpacingCards').innerHTML,/5.498 mm/);
  assert.equal(spiral.guides[2].angleDeg,45);
  for(let i=0;i<5;i++){
    assert.equal(spiral.guides[i].odMm,i===2?14:before[i].odMm);
    if(i!==2)assert.deepEqual(plain(spiral.guides[i]),before[i]);
  }
});

test('per-guide diameters survive spacing synchronization and stripper preset recalculation',()=>{
  const {c}=harness();
  const spiral=c.workshopToolsState.spiral;
  const diameters=plain(spiral.guides.map(guide=>guide.odMm));
  c.syncSpiralGuidePositionsFromLayout(spiral.guides.map((guide,index)=>({cum:150+index*210})));
  assert.deepEqual(plain(spiral.guides.map(guide=>guide.odMm)),diameters);
  c.setSpiralGuideAngle(4,20);
  assert.deepEqual(plain(spiral.guides.map(guide=>guide.odMm)),diameters);
  c.syncSpiralGuidesLength({resetAngles:true});
  assert.deepEqual(plain(spiral.guides.map(guide=>guide.odMm)),diameters);
  assert.deepEqual(plain(c.captureSpiralGeometry().guides.map(guide=>guide.odMm)),diameters);
});
