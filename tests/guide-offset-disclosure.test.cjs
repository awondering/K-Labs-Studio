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
  return {c,e:id=>elements.get(id),elements,node,toggle:()=>elements.get('workshopSpiralOffsetsToggle').listeners.click()};
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

test('seven-guide Casting Progressive Placement reveals guides 4–6 through the real stage/render/input path',()=>{
  const {c,e,elements,node,toggle}=harness();
  const treeNode=()=>{
    const result=node();
    result.children=[];
    result.appendChild=child=>{
      if(child.parentElement){
        child.parentElement.children=child.parentElement.children.filter(item=>item!==child);
      }
      result.children.push(child);
      child.parentElement=result;
    };
    result.insertBefore=child=>result.appendChild(child);
    result.querySelectorAll=()=>[];
    return result;
  };
  const screen=treeNode();
  const parent=treeNode();
  const spacing=treeNode();
  const count=treeNode();
  const orientation=e('workshopToolSpiral');
  const visual=treeNode();
  const rod=treeNode();
  const list=treeNode();
  list.appendChild(e('guideSpacingCards'));
  parent.appendChild(spacing);
  parent.appendChild(orientation);
  parent.appendChild(rod);
  parent.appendChild(list);
  spacing.querySelector=()=>count;
  orientation.querySelector=selector=>selector==='.spiral-mapper-visual'?visual:null;
  screen.querySelector=selector=>({
    '.layout-control-card--guide-spacing':spacing,
    '.guide-spacing-panel':list,
  })[selector]||null;
  elements.set('layoutScreen',screen);
  elements.set('studioRodContainer',rod);
  c.document.createElement=()=>{
    const result=treeNode();
    let markup='';
    Object.defineProperty(result,'innerHTML',{
      get:()=>markup,
      set:value=>{
        markup=value;
        const bodyId=value.match(/id="(guideSetupBody\d)"/)?.[1];
        const summaryId=value.match(/id="(guideSetupSummary\d)"/)?.[1];
        if(!bodyId)return;
        const body=treeNode();
        const summary=treeNode();
        const edit=treeNode();
        elements.set(result.id,result);
        elements.set(bodyId,body);
        elements.set(summaryId,summary);
        result.appendChild(summary);
        result.appendChild(body);
        result.querySelector=selector=>selector==='.guide-setup-stage__body'?body:edit;
      },
    });
    return result;
  };
  c.HTMLInputElement=class {
    constructor(index,value){this.index=index;this.value=value;}
    closest(selector){return selector==='[data-spiral-field]'?this:null;}
    getAttribute(name){
      return name==='data-guide-index'?String(this.index):name==='data-spiral-field'?'od':null;
    }
  };
  c.guideSetupStage=0;
  c.guideSetupCompletedStage=-1;
  for(const name of ['initializeGuideSetupStages','renderGuideSetupStages','setGuideSetupStage','renderWorkshopCalculator']){
    const start=source.indexOf(`function ${name}(`);
    const end=source.indexOf('\n}',start)+2;
    vm.runInContext(source.slice(start,end),c);
  }
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js','guide-layout.js'),'utf8'),vm.createContext({window:c}));
  for(const name of ['refreshWorkshopMeasurementLabels','renderWorkshopToolVisibility',
    'renderDiameterCircumferenceTool','renderGripCoveringTool','renderGuideSpecificationSummary']){
    c[name]=()=>{};
  }
  c.state.guideCount=7;
  c.workshopToolsState.spiral.guideCount=7;
  c.workshopToolsState.spiral.guides=[180,180,180,135,90,45,0]
    .map((angleDeg,index)=>({angleDeg,odMm:null,positionMm:100+index*200}));
  const inputBindingStart=source.indexOf("  const spiralRowHost=$('layoutScreen')||spiralCard;");
  const inputBindingEnd=source.indexOf("\n  const gripPrintTemplateBtn=",inputBindingStart);
  c.spiralCard=orientation;
  vm.runInContext(source.slice(inputBindingStart,inputBindingEnd),c);
  c.renderWorkshopCalculator();
  c.setGuideSetupStage(0,true);
  c.setGuideSetupStage(1,true);
  assert.equal(e('guideSetupBody2').hidden,false);
  assert.equal(list.parentElement,e('guideSetupBody2'));
  assert.equal(e('guideSpacingCards').parentElement,list);
  const row=index=>e('guideSpacingCards').innerHTML
    .match(new RegExp(`<article[^>]*data-guide-index="${index}"[^>]*>([\\s\\S]*?)<\\/article>`))[1];
  toggle();
  assert.equal((e('guideSpacingCards').innerHTML.match(/data-spiral-field="od"/g)||[]).length,3);
  for(const index of [3,4,5]){
    assert.match(row(index),new RegExp(`id="guideOffsetDiameter${index}"`));
    assert.match(row(index),/Blank diameter \(mm\)/);
    assert.match(row(index),/Enter blank diameter/);
    assert.doesNotMatch(row(index),/spiral-guide-row__edit|hidden/);
  }
  const before=plain(c.workshopToolsState.spiral.guides);
  for(const [index,value,result] of [[3,'12','14.137'],[4,'10','7.854'],[5,'8','3.142']]){
    screen.listeners.input({target:new c.HTMLInputElement(index,value)});
    assert.match(row(index),new RegExp(`${result.replace('.','\\.')} mm`));
    assert.equal(c.workshopToolsState.spiral.guides[index].odMm,Number(value));
  }
  for(const index of [0,1,2,6]){
    assert.deepEqual(plain(c.workshopToolsState.spiral.guides[index]),before[index]);
  }
  screen.listeners.input({target:new c.HTMLInputElement(4,'invalid')});
  assert.match(row(4),/Enter blank diameter/);
  assert.doesNotMatch(row(4),/7\.854 mm|NaN/);
  screen.listeners.input({target:new c.HTMLInputElement(4,'10')});
  const retained=plain(c.workshopToolsState.spiral.guides);
  toggle();
  assert.doesNotMatch(e('guideSpacingCards').innerHTML,/data-spiral-field="od"|guideOffsetResult/);
  toggle();
  for(const [index,value] of [[3,12],[4,10],[5,8]]){
    assert.match(row(index),new RegExp(`id="guideOffsetDiameter${index}"[^>]*value="${value}"`));
  }
  assert.deepEqual(plain(c.workshopToolsState.spiral.guides),retained);
  assert.equal(c.workshopToolsState.spiral.expandedGuideIndex,-1);
  assert.equal(c.guideSetupStage,2);
  const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
  assert.match(css,/#layoutScreen \.guide-offset-controls\{\s*display:grid;/);
  assert.match(css,/#layoutScreen \.guide-offset-controls input\{[^}]*min-height:44px;/);
});
