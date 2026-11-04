const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const Engine=require('../js/guide-train.js');

function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const lineEnd=source.indexOf('\n',start);
  const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
  return source.slice(start,end);
}
const constBlock=(name)=>{
  const start=source.indexOf(`const ${name}=[`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('];',start)+2);
};

const ELEMENT_IDS=[
  'workshopToolGuideTrain','gtMessages','gtView','gtResults','gtViewCanvas','gtSumChoke','gtSumCone','gtSumStripper','gtSumRatio',
  'gtSumRunners','gtSumClearance','gtGuidesUnit','gtGuides','gtResetGuides','gtMethodBody','gtRodLength','gtSpoolLip','gtButtOd',
  'gtTipOd','gtSpoolDiameter','gtReelHeight','gtSettledLine','gtRunnerMinGap','gtReelAngle','gtFlareAngle','gtClearance',
  'gtReductionCount','gtRunnerCount','gtRunnerRatio','gtMode','gtCaption','gtSetRows','gtSetAdd',
];

function harness({unit='metric'}={}){
  const elements=new Map();
  const makeElement=(id)=>({
    id,hidden:false,value:'',textContent:'',innerHTML:'',clientWidth:390,attrs:{},
    setAttribute(name,value){this.attrs[name]=String(value);},
    getAttribute(name){return Object.prototype.hasOwnProperty.call(this.attrs,name)?this.attrs[name]:null;},
    querySelectorAll:()=>[],
  });
  ELEMENT_IDS.forEach((id)=>elements.set(id,makeElement(id)));
  const defaults=Engine.DEFAULTS;
  const state={
    unit,imperialDisplay:'decimal',...defaults,guides:[],guideSet:[],selected:0,invalid:{},notice:false,
  };
  const c=vm.createContext({
    document:{activeElement:null},
    $:(id)=>elements.get(id)||null,
    KLabsGuideTrain:Engine,
    workshopToolsState:{activeTool:'guide-train',guideTrain:state},
    activeMeasurementUnits:()=>state.unit,
    activeImperialDisplay:()=>'decimal',
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3,decimalsImperial:3,forceDecimal:true},
  });
  for(const name of [
    'numberOrZero','mmToInches','inchesToMm','trimTrailingZeroes','formatDecimal','gcd','formatImperialFractionInches',
    'parseImperialInchesInput','normalizeWorkshopUnit','normalizeWorkshopImperialDisplay','workshopUnitSuffix',
    'parseWorkshopMeasurementMm','formatWorkshopMeasurementNumber','formatWorkshopMeasurementValue','workshopMeasurementInputText',
    'syncWorkshopMeasurementInput','escapeHtml','guideTrainEngine','guideTrainFormatter','readGuideTrainMeasurement',
    'readGuideTrainNumber','guideTrainRequest','guideTrainStatus','guideTrainCardsMarkup','updateGuideTrainCards',
    'renderGuideTrainMethod','resetGuideTrainOverridesForCount','guideTrainSetEntries','guideTrainSetSignature','guideTrainSpecMatch','guideTrainSetMarkup','renderGuideTrainSet','renderGuideTrainTool','guideTrainDragPosition',
    'setGuideTrainOverride','guideTrainRefusal','commitGuideTrainEdit','commitGuideTrainSpec',
  ]){
    vm.runInContext(extract(name),c);
  }
  vm.runInContext(`${constBlock('GUIDE_TRAIN_MAIN_FIELDS')}\n${constBlock('GUIDE_TRAIN_NUMBER_FIELDS')}\nconst GUIDE_TRAIN_SET_MAX=8;`,c);
  const design=()=>Engine.designGuideTrain(c.guideTrainRequest(state),c.guideTrainFormatter(state));
  const e=(id)=>elements.get(id);
  return {c,state,design,e};
}
const xs=(d)=>d.guides.map((g)=>Math.round(g.xMm*10)/10);

test('the request sent to the engine carries the three runner settings',()=>{
  const {c,state}=harness();
  const request=JSON.parse(JSON.stringify(c.guideTrainRequest(state)));
  assert.equal(request.runnerCount,4);
  assert.equal(request.runnerRatio,0.85);
  assert.equal(request.runnerMinGapMm,50);
  assert.equal(Object.keys(request).filter((key)=>key!=='guides').sort().join(),Object.keys(Engine.DEFAULTS).sort().join(),'every engine field is mapped, nothing extra');
});

test('guide cards: runners are built as editable cards, labelled and styled apart from reduction guides',()=>{
  const {c,design}=harness();
  const d=design();
  const markup=c.guideTrainCardsMarkup(d);
  assert.equal((markup.match(/class="gt-guide[ "]/g)||[]).length,11);
  assert.equal((markup.match(/class="gt-guide gt-guide--runner"/g)||[]).length,4);
  assert.equal((markup.match(/ disabled/g)||[]).length,1,'only the tip-top position is fixed');
  for(const n of [1,2,3,4]){
    for(const field of ['from tip','ring id','centre height above the blank']){
      assert.ok(markup.includes(`aria-label="Runner ${n}: ${field}"`),`Runner ${n} ${field}`);
    }
  }
  assert.ok(markup.includes('aria-label="Tip-top: from tip"'));
  assert.ok(markup.indexOf('Guide 5 (choke)')<markup.indexOf('Runner 1') && markup.indexOf('Runner 4')<markup.indexOf('Tip-top'));
});

test('runner edits are stored from the butt, move only that runner, and clearing a field resets it',()=>{
  const {c,state,design}=harness();
  const before=xs(design());
  assert.equal(c.commitGuideTrainEdit(7,'position','500'),true);
  assert.equal(state.guides[7].positionMm,1630,'500 mm from the tip is 1630 mm from the butt');
  const after=xs(design());
  assert.equal(after[7],1630);
  after.forEach((x,i)=>{if(i!==7)assert.equal(x,before[i],`guide ${i} unchanged`);});
  assert.equal(c.commitGuideTrainEdit(7,'id','7'),true);
  assert.equal(state.guides[7].idMm,7);
  assert.equal(c.commitGuideTrainEdit(7,'height','14'),true);
  assert.equal(state.guides[7].centreHeightMm,14);
  assert.equal(c.commitGuideTrainEdit(7,'position',''),true);
  assert.equal(state.guides[7].positionMm,undefined);
  assert.deepEqual(xs(design()),before);
});

test('runner edits next to a neighbour: the minimum gap and the order are enforced',()=>{
  const {c,state,design}=harness();
  const before=xs(design());
  const runner1FromTip=2130-before[6];
  assert.equal(c.commitGuideTrainEdit(7,'position',String(runner1FromTip-20)),false);
  assert.match(state.invalid['7.position'],/Runner 1 and Runner 2 are too close\. Keep running guides at least 50 mm apart/);
  assert.equal(c.commitGuideTrainEdit(7,'position',String(runner1FromTip+20)),false);
  assert.match(state.invalid['7.position'],/must sit closer to the tip than Runner 1/);
  assert.equal(c.commitGuideTrainEdit(9,'position','30'),false);
  assert.match(state.invalid['9.position'],/Runner 4 must stay at least 50 mm from the tip-top/);
  assert.equal(c.commitGuideTrainEdit(9,'position','abc'),false);
  assert.match(state.invalid['9.position'],/not a valid number/);
  assert.equal(c.commitGuideTrainEdit(9,'position','50'),true,'exactly the minimum gap is allowed');
  assert.equal(state.guides.filter(Boolean).length,1,'refused edits stored nothing');
  assert.equal(c.commitGuideTrainEdit(5,'position',String(2130-before[6]+20)),false,'the choke guide is held to the same gap from Runner 1');
  assert.match(state.invalid['5.position'],/Guide 5 \(choke\) and Runner 1 are too close/);
});

test('the tip-top is the last guide: its measured ring and height are overrides at the last index, wherever the runners end',()=>{
  const {c,state}=harness();
  assert.equal(c.commitGuideTrainEdit(10,'id','6'),true);
  assert.equal(state.guides[10].idMm,6);
  assert.equal(c.commitGuideTrainEdit(10,'height','3.5'),true);
  assert.equal(state.guides[10].centreHeightMm,3.5);
  assert.equal(c.commitGuideTrainEdit(9,'id','5.5'),true);
  assert.equal(state.guides[9].idMm,5.5);
  assert.equal(state.tipTopIdMm,5,'the illustrative default is untouched');
  const none=harness();
  none.state.runnerCount=0;
  assert.equal(none.c.commitGuideTrainEdit(6,'id','6'),true);
  assert.equal(none.state.guides[6].idMm,6,'with no runners the tip-top is index reductionCount + 1, as in Phase 1');
});

test('dragging a runner keeps the minimum gap; dragging between reduction guides keeps 0.5 mm',()=>{
  const {c,design}=harness();
  const d=design();
  const g=d.guides;
  assert.equal(c.guideTrainDragPosition(d,7,g[6].xMm-500),Math.ceil((g[6].xMm+50)*2)/2,'runner 2 against runner 1');
  assert.equal(c.guideTrainDragPosition(d,7,g[8].xMm+500),Math.floor((g[8].xMm-50)*2)/2,'runner 2 against runner 3');
  assert.equal(c.guideTrainDragPosition(d,9,5000),Math.floor((2130-50)*2)/2,'the last runner stays clear of the tip-top');
  assert.equal(c.guideTrainDragPosition(d,5,g[6].xMm+500),Math.floor((g[6].xMm-50)*2)/2,'the choke guide against runner 1');
  assert.equal(c.guideTrainDragPosition(d,6,g[5].xMm-500),Math.ceil((g[5].xMm+50)*2)/2,'runner 1 against the choke guide');
  assert.equal(c.guideTrainDragPosition(d,3,g[4].xMm+500),Math.floor((g[4].xMm-0.5)*2)/2,'reduction guides keep the Phase 1 gap');
  assert.equal(c.guideTrainDragPosition(d,7,1700.26),1700.5,'snaps to 0.5 mm');
  // Every position a drag can produce is accepted by the engine.
  for(const target of [0,900,1500,1700,2000,2129,9999]){
    for(const index of [5,6,7,8,9]){
      const request={...c.guideTrainRequest(harness().state),guides:[]};
      request.guides[index]={positionMm:c.guideTrainDragPosition(d,index,target)};
      const result=Engine.designGuideTrain(request);
      assert.equal(result.ok,true,`drag guide ${index} to ${target}: ${JSON.stringify(result.errors)}`);
    }
  }
  // A guide squeezed between neighbours closer than twice the minimum gap stays put rather than jumping to an illegal spot.
  const crowded=Engine.designGuideTrain({...Engine.DEFAULTS,runnerCount:12,runnerMinGapMm:150});
  assert.equal(c.guideTrainDragPosition(crowded,8,0),crowded.guides[8].xMm);
  assert.equal(c.guideTrainDragPosition(crowded,8,5000),crowded.guides[8].xMm);
});

test('changing the counts: a new reduction count clears every override, a new runner count keeps the ones up to the choke',()=>{
  const {c,state}=harness();
  state.guides=[null,{positionMm:1000},{idMm:16},null,{idMm:8},{idMm:5.5},{positionMm:1500},{idMm:6},null,null];
  state.invalid={'2.id':'x','7.position':'y','9.height':'z','5.id':'w'};
  state.selected=8;
  c.resetGuideTrainOverridesForCount(state,'runnerCount');
  assert.equal(state.guides.length,6,'stripper, guides 1-4 and the choke guide are kept');
  assert.deepEqual(JSON.parse(JSON.stringify(state.guides)),[null,{positionMm:1000},{idMm:16},null,{idMm:8},{idMm:5.5}]);
  assert.deepEqual(Object.keys(state.invalid).sort(),['2.id','5.id']);
  assert.equal(state.selected,0);
  c.resetGuideTrainOverridesForCount(state,'reductionCount');
  assert.equal(JSON.stringify(state.guides),'[]');
  assert.equal(JSON.stringify(state.invalid),'{}');
  // After a runner count change the design is valid and the kept overrides still apply.
  const keep=harness();
  keep.state.guides=[null,{positionMm:1000}];
  keep.state.runnerCount=6;
  c.resetGuideTrainOverridesForCount(keep.state,'runnerCount');
  const d=keep.design();
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.equal(d.guides[1].xMm,1000);
  assert.equal(d.guides.length,5+6+2);
});

test('rendering: summary, provisional note, diagram and cards reflect the runners, and none are drawn when there are none',()=>{
  const {c,state,e}=harness();
  c.renderGuideTrainTool();
  assert.equal(e('gtResults').hidden,false);
  assert.equal(e('gtView').hidden,false);
  assert.equal(e('gtSumRunners').textContent,'4, last 124.2 mm from tip-top');
  assert.equal(e('gtSumChoke').textContent,'882.7 mm from tip');
  assert.match(e('gtGuidesUnit').textContent,/Runner positions are provisional: check them against blank deflection and a static-load test\./);
  assert.match(e('gtGuidesUnit').textContent,/^Distances in mm\./);
  assert.match(e('gtViewCanvas').innerHTML,/gt-ring--runner/);
  assert.equal((e('gtViewCanvas').innerHTML.match(/class="gt-ring[ "]/g)||[]).length,11);
  assert.equal(e('gtGuides').getAttribute('data-layout').split('#')[0],'srrrrcrrrrt');
  assert.equal((e('gtGuides').innerHTML.match(/gt-guide--runner/g)||[]).length,4);
  assert.equal(e('gtRunnerCount').value,'4');
  assert.equal(e('gtRunnerRatio').value,'0.85');
  assert.equal(e('gtRunnerMinGap').value,'50');
  assert.equal(e('gtMessages').innerHTML,'');
  state.runnerCount=0;
  c.renderGuideTrainTool();
  assert.equal(e('gtSumRunners').textContent,'None');
  assert.doesNotMatch(e('gtGuidesUnit').textContent,/provisional/);
  assert.doesNotMatch(e('gtViewCanvas').innerHTML,/gt-ring--runner|gt-legend/);
  assert.equal(e('gtGuides').getAttribute('data-layout').split('#')[0],'srrrrct');
  assert.equal((e('gtGuides').innerHTML.match(/class="gt-guide[ "]/g)||[]).length,7);
});

test('rendering: layout changes rebuild the cards even when the guide count is unchanged',()=>{
  const {c,state,e}=harness();
  c.renderGuideTrainTool();
  assert.equal(e('gtGuides').getAttribute('data-layout').split('#')[0],'srrrrcrrrrt');
  state.reductionCount=6;state.runnerCount=3;
  c.renderGuideTrainTool();
  assert.equal(e('gtGuides').getAttribute('data-layout').split('#')[0],'srrrrrcrrrt');
  assert.ok(e('gtGuides').innerHTML.includes('aria-label="Guide 6 (choke): ring id"'));
  assert.ok(e('gtGuides').innerHTML.includes('aria-label="Runner 3: ring id"'));
  assert.ok(!e('gtGuides').innerHTML.includes('Runner 4'));
});

test('rendering: invalid runner settings show a clear message and hide the design without losing the inputs',()=>{
  const {c,state,e}=harness();
  state.runnerCount=13;
  c.renderGuideTrainTool();
  assert.equal(e('gtResults').hidden,true);
  assert.equal(e('gtView').hidden,true);
  assert.match(e('gtMessages').innerHTML,/Running guide count must be between 0 and 12/);
  assert.equal(e('gtRunnerCount').attrs['aria-invalid'],'true');
  state.runnerCount=4;state.runnerRatio=0.2;
  c.renderGuideTrainTool();
  assert.match(e('gtMessages').innerHTML,/Running guide spacing ratio must be between 0\.5 and 1\.5/);
  assert.equal(e('gtRunnerRatio').attrs['aria-invalid'],'true');
  assert.equal(e('gtRunnerCount').attrs['aria-invalid'],'false');
  state.runnerRatio=0.85;state.runnerMinGapMm=null;
  c.renderGuideTrainTool();
  assert.match(e('gtMessages').innerHTML,/Enter the minimum running guide gap/);
  state.runnerMinGapMm=50;
  c.renderGuideTrainTool();
  assert.equal(e('gtResults').hidden,false);
});

test('rendering: a crowded runner section shows a warning but still draws every guide',()=>{
  const {c,state,e}=harness();
  state.runnerCount=12;state.runnerMinGapMm=150;
  c.renderGuideTrainTool();
  assert.equal(e('gtResults').hidden,false);
  assert.match(e('gtMessages').innerHTML,/guide-train-message--warning/);
  assert.match(e('gtMessages').innerHTML,/closer than the 150 mm minimum gap/);
  assert.equal((e('gtViewCanvas').innerHTML.match(/class="gt-ring[ "]/g)||[]).length,19);
});

test('imperial display: runner distances and the minimum gap are shown and read in inches',()=>{
  const {c,state,e}=harness({unit:'imperial'});
  c.renderGuideTrainTool();
  assert.equal(e('gtRunnerMinGap').value,'1.969');
  assert.match(e('gtSumRunners').textContent,/^4, last 4\.892 in from tip-top$/);
  assert.match(e('gtGuidesUnit').textContent,/^Distances in in\./);
  assert.equal(c.commitGuideTrainEdit(7,'position','17'),true);
  assert.ok(Math.abs(state.guides[7].positionMm-(2130-17*25.4))<1e-9);
});

test('runner controls exist in the card, the settings live behind the existing disclosure, and nothing else moved',()=>{
  const card=html.slice(html.indexOf('<article id="workshopToolGuideTrain"'),html.indexOf('</article>',html.indexOf('<article id="workshopToolGuideTrain"')));
  for(const id of ['gtRunnerCount','gtRunnerMinus','gtRunnerPlus','gtRunnerRatio','gtSumRunners','gtRunnerMinGap']){
    assert.equal((card.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
  }
  const details=card.slice(card.indexOf('<details class="guide-train-advanced">'));
  assert.ok(details.includes('id="gtRunnerMinGap"'),'minimum gap is an advanced setting');
  for(const id of ['gtFlareAngle','gtSettledLine','gtClearance','gtMethodBody'])assert.ok(details.includes(`id="${id}"`),`${id} still in the disclosure`);
  const main=card.slice(0,card.indexOf('<details class="guide-train-advanced">'));
  for(const id of ['gtRodLength','gtSpoolLip','gtButtOd','gtTipOd','gtSpoolDiameter','gtReelHeight','gtReelAngle','gtReductionCount','gtCountMinus','gtCountPlus','gtRunnerCount','gtRunnerRatio'])assert.ok(main.includes(`id="${id}"`),id);
  assert.match(card,/id="gtRunnerCount"[^>]*min="0" max="12"/);
  assert.match(card,/aria-label="Fewer running guides"/);
  assert.match(card,/aria-label="More running guides"/);
  assert.ok(/data-measurement-label="Minimum Runner Gap"/.test(card));
  assert.equal((html.match(/data-workshop-tool-open="guide-train"/g)||[]).length,1,'no second designer or launcher');
  assert.equal((html.match(/id="workshopToolGuideTrain"/g)||[]).length,1);
});

test('runner styling reuses the existing design tokens and stays scoped; touch targets are unchanged at 44px',()=>{
  const start=css.indexOf('/* Guide Train Designer (Workshop)');
  const block=css.slice(start,css.indexOf('/* End Guide Train Designer */'));
  assert.match(block,/#workshopToolGuideTrain \.gt-guide--runner:not\(\.is-selected\):not\(\.has-warning\)\{\s*box-shadow:inset 3px 0 0 rgba\(174,185,194,\.6\);/);
  const runnerRules=block.match(/[^{}]*gt-guide--runner[^{}]*\{/g)||[];
  runnerRules.forEach((rule)=>assert.ok(rule.includes('#workshopToolGuideTrain'),rule));
  assert.match(block,/#workshopToolGuideTrain \.guide-train-count :is\(button,input\)\{\s*min-height:44px;/);
  assert.match(block,/#workshopToolGuideTrain \.gt-guide__fields input\{[^}]*min-height:44px;[^}]*font-size:16px;/);
  assert.equal(/gt-guide--runner[^{]*\{[^}]*(font-size|min-height|height)/.test(block),false,'the runner accent changes no sizing');
});

test('runner code is ASCII only and reads no other tool state',()=>{
  const start=source.indexOf('function guideTrainEngine(');
  const end=source.indexOf('function bindGuideTrainControls(');
  const code=source.slice(start,end)+source.slice(end,source.indexOf('function renderWorkshopCalculator(){'));
  assert.deepEqual([...code].filter((ch)=>ch.charCodeAt(0)>127),[]);
  for(const forbidden of ['calcGuideLayout','workshopToolsState.spiral','guideSpecification','KLabsGuideLayout','guideCount']){
    assert.equal(code.includes(forbidden),false,forbidden);
  }
  assert.match(code,/provisional: check them against blank deflection and a static-load test/);
  const cardStart=html.indexOf('<article id="workshopToolGuideTrain"');
  assert.deepEqual([...html.slice(cardStart,html.indexOf('</article>',cardStart))].filter((ch)=>ch.charCodeAt(0)>127),[]);
});
