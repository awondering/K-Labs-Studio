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
  'workshopToolGuideTrain','gtMessages','gtView','gtResults','gtViewCanvas','gtGenerate','gtReelSize','gtAdjust','gtRunnerId','gtRunnerHeight','gtSumChoke','gtSumCone','gtSumStripper','gtSumRatio',
  'gtSumRunners','gtSumClearance','gtGuidesUnit','gtGuides','gtResetGuides','gtMethodBody','gtRodLength','gtSpoolLip','gtButtOd',
  'gtTipOd','gtSpoolDiameter','gtReelHeight','gtSettledLine','gtRunnerMinGap','gtReelAngle','gtFlareAngle','gtClearance',
  'gtReductionCount','gtRunnerCount','gtRunnerRatio','gtMode','gtCaption','gtSetRows','gtSetAdd','gtCountMinus','gtCountPlus',
  'gtRunnerMinus','gtRunnerPlus',
];

function harness({unit='metric'}={}){
  const elements=new Map();
  const makeElement=(id)=>({
    id,hidden:false,disabled:false,value:'',textContent:'',innerHTML:'',clientWidth:390,attrs:{},listeners:{},
    setAttribute(name,value){this.attrs[name]=String(value);},
    getAttribute(name){return Object.prototype.hasOwnProperty.call(this.attrs,name)?this.attrs[name]:null;},
    hasAttribute(name){return Object.prototype.hasOwnProperty.call(this.attrs,name);},
    addEventListener(type,fn){(this.listeners[type]=this.listeners[type]||[]).push(fn);},
    querySelectorAll:()=>[],
    querySelector:()=>null,
  });
  ELEMENT_IDS.forEach((id)=>elements.set(id,makeElement(id)));
  const state={unit,imperialDisplay:'decimal',reelSize:'medium',spoolDiameterMeasured:false,generated:true,...Engine.DEFAULTS,guides:[],guideSet:[],selected:0,invalid:{},notice:false};
  const c=vm.createContext({
    document:{activeElement:null},
    window:{addEventListener(){},requestAnimationFrame:(fn)=>{fn();return 1;}},
    $:(id)=>elements.get(id)||null,
    KLabsGuideTrain:Engine,
    workshopToolsState:{activeTool:'guide-train',guideTrain:state},
    activeMeasurementUnits:()=>state.unit,
    activeImperialDisplay:()=>'decimal',
    syncStudioCustomSelectTrigger(){},
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3,decimalsImperial:3,forceDecimal:true},
  });
  for(const name of [
    'numberOrZero','mmToInches','inchesToMm','trimTrailingZeroes','formatDecimal','gcd','formatImperialFractionInches',
    'parseImperialInchesInput','normalizeWorkshopUnit','normalizeWorkshopImperialDisplay','workshopUnitSuffix',
    'parseWorkshopMeasurementMm','formatWorkshopMeasurementNumber','formatWorkshopMeasurementValue','workshopMeasurementInputText',
    'syncWorkshopMeasurementInput','bindWorkshopCalculatorInput','escapeHtml','guideTrainEngine','guideTrainFormatter',
    'readGuideTrainMeasurement','readGuideTrainNumber','guideTrainRequest','guideTrainStatus','guideTrainSetEntries',
    'guideTrainSetSignature','guideTrainSpecMatch','guideTrainCardsMarkup','updateGuideTrainCards','renderGuideTrainMethod',
    'resetGuideTrainOverridesForCount','guideTrainSetMarkup','renderGuideTrainSet','guideTrainReelEstimate','renderGuideTrainTool','guideTrainDragPosition',
    'setGuideTrainOverride','guideTrainRefusal','commitGuideTrainEdit','commitGuideTrainSpec','bindGuideTrainControls',
  ]){
    vm.runInContext(extract(name),c);
  }
  vm.runInContext(`${constBlock('GUIDE_TRAIN_MAIN_FIELDS')}\n${constBlock('GUIDE_TRAIN_NUMBER_FIELDS')}\nconst GUIDE_TRAIN_REEL_ESTIMATES={small:32,medium:40,large:48};\nconst GUIDE_TRAIN_SET_MAX=8;`,c);
  const e=(id)=>elements.get(id);
  const design=()=>Engine.designGuideTrain(c.guideTrainRequest(state),c.guideTrainFormatter(state));
  const fire=(id,type,event)=>(e(id).listeners[type]||[]).forEach((fn)=>fn(event||{}));
  c.bindGuideTrainControls();
  const addEntry=(name,id,centre)=>{
    fire('gtSetAdd','click');
    const entry=state.guideSet[state.guideSet.length-1];
    entry.name=name;entry.idMm=id;entry.centreHeightMm=centre;
    c.renderGuideTrainTool();
    return entry;
  };
  const typeInSet=(row,key,value)=>{
    const target={value,getAttribute:(n)=>n==='data-gt-set'?key:null,closest:(sel)=>sel==='.gt-set-row'?{getAttribute:(n)=>n==='data-set'?String(row):null}:null};
    fire('gtSetRows','input',{target});
  };
  const removeEntry=(row)=>{
    const button={getAttribute:(n)=>n==='data-gt-set-remove'?String(row):null};
    fire('gtSetRows','click',{target:{closest:(sel)=>sel==='[data-gt-set-remove]'?button:null}});
  };
  const chooseSpec=(index,value)=>{
    const target={value,getAttribute:(n)=>n==='data-guide'?String(index):null,hasAttribute:(n)=>n==='data-gt-spec'};
    fire('gtGuides','change',{target});
  };
  c.renderGuideTrainTool();
  return {c,state,e,design,fire,addEntry,typeInSet,removeEntry,chooseSpec};
}
const xs=(d)=>d.guides.map((g)=>Math.round(g.xMm*10)/10);
const text=(markup)=>markup.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

test('a new layout is clearly labelled as a suggestion, without claiming the numbers are specifications',()=>{
  const {e}=harness();
  assert.equal(e('gtMode').textContent,'Suggested layout');
  assert.equal(e('gtMode').getAttribute('data-mode'),'illustrative');
  assert.match(e('gtGuidesUnit').textContent,/Ring sizes are starting suggestions, not product specifications\./);
  assert.doesNotMatch(e('gtCaption').textContent,/measured/i);
  assert.doesNotMatch(e('gtGuidesUnit').textContent+e('gtMode').textContent,/\b(verified|certified|specified|catalogue|manufacturer)\b/i);
});

test('the first screen generates from rod length and an approximate reel size without replacing a measured spool diameter',()=>{
  const {c,state,e,fire}=harness();
  state.generated=false;
  c.renderGuideTrainTool();
  assert.equal(e('gtView').hidden,true);
  assert.equal(e('gtResults').hidden,true);
  e('gtReelSize').value='large';
  fire('gtReelSize','change');
  assert.equal(state.spoolDiameterMm,48);
  assert.equal(e('gtView').hidden,true);
  fire('gtGenerate','click');
  assert.equal(state.generated,true);
  assert.equal(e('gtView').hidden,false);
  assert.equal(e('gtResults').hidden,false);
  e('gtSpoolDiameter').value='43';
  fire('gtSpoolDiameter','input');
  assert.equal(state.spoolDiameterMeasured,true);
  assert.equal(state.spoolDiameterMm,43);
  e('gtReelSize').value='small';
  fire('gtReelSize','change');
  assert.equal(state.spoolDiameterMm,43,'a reel-size choice must not replace a physical measurement');
  e('gtSpoolDiameter').value='';
  fire('gtSpoolDiameter','input');
  assert.equal(state.spoolDiameterMm,32,'clearing a measurement returns to the selected estimate');
});

test('invalid measurement changes preserve manual guide adjustments and offer an explicit reset',()=>{
  const {c,state,e}=harness();
  assert.equal(c.commitGuideTrainEdit(2,'position','1000'),true);
  const saved=JSON.parse(JSON.stringify(state.guides));
  state.rodLengthMm=500;
  c.renderGuideTrainTool();
  assert.deepEqual(JSON.parse(JSON.stringify(state.guides)),saved);
  assert.equal(e('gtResetGuides').hidden,false);
  assert.equal(e('gtView').hidden,true);
});

test('the guide set: add, edit, validate and remove entries; units are converted once; nothing is persisted',()=>{
  const {c,state,e,fire,typeInSet,removeEntry}=harness();
  assert.equal(e('gtSetRows').getAttribute('data-count'),'0');
  fire('gtSetAdd','click');
  assert.equal(state.guideSet.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(state.guideSet[0])),{name:'',idMm:null,centreHeightMm:null});
  assert.equal(e('gtSetRows').getAttribute('data-count'),'1');
  assert.match(e('gtSetRows').innerHTML,/data-gt-set="name"/);
  assert.match(e('gtSetRows').innerHTML,/aria-label="Guide 1 ring inner diameter"/);
  assert.match(e('gtSetRows').innerHTML,/aria-label="Guide 1 centre height above the blank"/);
  typeInSet(0,'name','Mid 15');
  typeInSet(0,'id','15');
  typeInSet(0,'height','12');
  assert.deepEqual(JSON.parse(JSON.stringify(state.guideSet[0])),{name:'Mid 15',idMm:15,centreHeightMm:12});
  const entries=c.guideTrainSetEntries(state,Engine,c.guideTrainFormatter(state));
  assert.equal(entries[0].valid,true);
  typeInSet(0,'height','5');
  assert.equal(c.guideTrainSetEntries(state,Engine,c.guideTrainFormatter(state))[0].valid,false);
  assert.match(c.guideTrainSetEntries(state,Engine,c.guideTrainFormatter(state))[0].error,/A 15 mm ring needs a centre height of at least 7\.5 mm above the blank/);
  typeInSet(0,'height','abc');
  assert.match(c.guideTrainSetEntries(state,Engine,c.guideTrainFormatter(state))[0].error,/not a valid number/);
  typeInSet(0,'name','x'.repeat(40));
  assert.equal(state.guideSet[0].name.length,24,'names are kept short');
  removeEntry(0);
  assert.equal(state.guideSet.length,0);
  assert.equal(e('gtSetRows').getAttribute('data-count'),'0');
  // The add button stops at the limit.
  for(let i=0;i<12;i+=1)fire('gtSetAdd','click');
  assert.equal(state.guideSet.length,8);
  assert.equal(e('gtSetAdd').disabled,true);
  // Inches are converted to millimetres exactly once.
  const imperial=harness({unit:'imperial'});
  imperial.fire('gtSetAdd','click');
  imperial.typeInSet(0,'id','0.5');
  imperial.typeInSet(0,'height','0.75');
  assert.ok(Math.abs(imperial.state.guideSet[0].idMm-12.7)<1e-9);
  assert.ok(Math.abs(imperial.state.guideSet[0].centreHeightMm-19.05)<1e-9);
  // The set is session state only: the code never touches storage.
  const code=source.slice(source.indexOf('function guideTrainSetEntries('),source.indexOf('function renderWorkshopCalculator(){'));
  assert.doesNotMatch(code,/localStorage|sessionStorage|Store\.|supabase|fetch\(/i);
});

test('only valid set entries can be chosen on a guide card, and the choice is hidden until the set has entries',()=>{
  const {c,state,design,addEntry}=harness();
  const none=c.guideTrainCardsMarkup(design(),c.guideTrainSetEntries(state,Engine,c.guideTrainFormatter(state)),c.guideTrainFormatter(state));
  assert.doesNotMatch(none,/data-gt-spec/);
  addEntry('Mid 15',15,12);
  addEntry('Broken',15,5);
  addEntry('Half',null,null);
  const fmt=c.guideTrainFormatter(state);
  const entries=c.guideTrainSetEntries(state,Engine,fmt);
  assert.deepEqual(entries.map((x)=>x.valid),[true,false,false]);
  const markup=c.guideTrainCardsMarkup(design(),entries,fmt);
  assert.equal((markup.match(/data-gt-spec/g)||[]).length,11,'one choice per guide card');
  assert.match(markup,/<option value="">Suggested size<\/option>/);
  assert.match(markup,/<option value="0">Mid 15 \(15 \/ 12\)<\/option>/);
  assert.match(markup,/<option value="1" disabled>Broken \(incomplete\)<\/option>/);
  assert.match(markup,/<option value="2" disabled>Half \(incomplete\)<\/option>/);
  assert.match(markup,/aria-label="Runner 2: choose a measured guide"/);
  assert.equal(c.guideTrainSetSignature(entries,fmt).includes('vMid 15|15/12'),true);
});

test('choosing a guide from the set makes both measurements physical constraints; Illustrative clears them',()=>{
  const {c,state,design,addEntry,chooseSpec}=harness();
  const before=xs(design());
  addEntry('Mid 15',15,20);
  chooseSpec(2,'0');
  assert.deepEqual(JSON.parse(JSON.stringify(state.guides[2])),{idMm:15,centreHeightMm:20});
  let d=design();
  assert.equal(d.guides[2].source,'measured');
  assert.equal(d.guides[2].centreHeightMm,20);
  assert.equal(d.summary.mode,'mixed');
  assert.notEqual(xs(d)[2],before[2],'the guide is repositioned around its measured dimensions');
  const fmt=c.guideTrainFormatter(state);
  assert.equal(c.guideTrainSpecMatch(c.guideTrainSetEntries(state,Engine,fmt),state.guides[2]),0,'the card shows which set entry it uses');
  assert.equal(c.guideTrainSpecMatch(c.guideTrainSetEntries(state,Engine,fmt),{idMm:15,centreHeightMm:19}),-1,'custom values do not match');
  assert.equal(c.guideTrainSpecMatch(c.guideTrainSetEntries(state,Engine,fmt),null),-1);
  // Edits after choosing are custom measured values.
  assert.equal(c.commitGuideTrainEdit(2,'height','19'),true);
  assert.equal(state.guides[2].centreHeightMm,19);
  // Clearing returns the illustrative proposal exactly.
  chooseSpec(2,'');
  d=design();
  assert.deepEqual(xs(d),before);
  assert.equal(d.summary.mode,'illustrative');
  // An invalid entry cannot be applied.
  addEntry('Broken',15,5);
  chooseSpec(3,'1');
  assert.equal(state.guides[3]||null,null);
  // The stripper and tip-top accept measured guides from the set too.
  chooseSpec(0,'0');
  assert.equal(design().guides[0].idMm,15);
  assert.equal(design().ok,true);
  chooseSpec(10,'0');
  assert.equal(design().guides[10].idMm,15);
  assert.equal(design().guides[10].centreHeightMm,20);
});

test('incompatible choices show clear warnings and keep the entered dimensions; they are never silently repaired',()=>{
  const {state,design,e,addEntry,chooseSpec}=harness();
  addEntry('Tiny 3',3,10);
  chooseSpec(2,'0');
  let d=design();
  assert.equal(d.ok,true);
  assert.equal(d.guides[2].idMm,3);
  assert.equal(d.guides[2].centreHeightMm,10);
  assert.equal(d.guides[2].proposalSolved,false);
  assert.match(e('gtMessages').innerHTML,/Guide 2: no position on the rod lets the 3 mm ring at a 10 mm centre height fit the line cone/);
  assert.match(e('gtMessages').innerHTML,/the entered values were not changed/);
  assert.equal(e('gtMode').textContent,'1 measured');
  assert.equal(e('gtMode').getAttribute('data-mode'),'mixed');
  assert.match(e('gtCaption').textContent,/Schematic; vertical scale exaggerated/);
  assert.match(e('gtGuidesUnit').textContent,/Measured guide dimensions are kept as entered\./);
  // Order is always preserved.
  d.guides.slice(1).forEach((g,i)=>assert.ok(g.xMm>d.guides[i].xMm));
  state.guides=[];
});

test('mode label: all guides measured is reported as such',()=>{
  const {c,state,e}=harness();
  const d=Engine.designGuideTrain(c.guideTrainRequest(state));
  state.guides=d.guides.map((g)=>({centreHeightMm:g.centreHeightMm}));
  c.renderGuideTrainTool();
  assert.equal(e('gtMode').textContent,'Measured guides');
  assert.equal(e('gtMode').getAttribute('data-mode'),'measured');
});

test('changing the counts keeps the guide set, and clearing overrides never clears it',()=>{
  const {c,state,addEntry,chooseSpec,fire,e}=harness();
  addEntry('Mid 15',15,20);
  chooseSpec(2,'0');
  fire('gtRunnerPlus','click');
  assert.equal(state.guideSet.length,1);
  assert.equal(state.guides[2].idMm,15,'overrides up to the choke survive a runner count change');
  fire('gtCountPlus','click');
  assert.equal(state.guides.filter(Boolean).length,0,'a reduction count change renumbers the guides');
  assert.equal(state.guideSet.length,1,'the set is untouched');
  chooseSpec(2,'0');
  e('gtResetGuides').listeners.click.forEach((fn)=>fn());
  assert.equal(state.guides.length,0);
  assert.equal(state.guideSet.length,1);
});

test('edits that break the train are refused: stripper and tip-top measurements included',()=>{
  const {c,state,design}=harness();
  const before=xs(design());
  assert.equal(c.commitGuideTrainEdit(0,'id','55'),false,'a stripper ring as big as the spool cone');
  assert.match(state.invalid['0.id'],/stripper ring is as large as the line cone at the spool/);
  assert.equal(c.commitGuideTrainEdit(0,'id','4'),false);
  assert.match(state.invalid['0.id'],/must be larger than 5 mm/);
  assert.equal(c.commitGuideTrainEdit(2,'height','250'),false);
  assert.match(state.invalid['2.height'],/centre height above the blank must be between/);
  assert.equal(c.commitGuideTrainEdit(2,'height','abc'),false);
  assert.match(state.invalid['2.height'],/Guide 2: the centre height above the blank is not a valid number/);
  assert.equal(state.guides.filter(Boolean).length,0,'nothing was stored');
  assert.deepEqual(xs(design()),before);
  assert.equal(c.commitGuideTrainEdit(2,'height','3'),true,'an overlapping measurement is accepted and warned about, not refused');
  assert.ok(design().warnings.some((w)=>w.code==='ring-overlaps-blank'));
});

test('dragging a measured guide keeps its measurements and its height above the blank',()=>{
  const {c,state,design,addEntry,chooseSpec}=harness();
  addEntry('Mid 15',15,20);
  chooseSpec(2,'0');
  const d=design();
  const target=c.guideTrainDragPosition(d,2,d.guides[2].xMm+30);
  assert.ok(target>d.guides[2].xMm);
  c.commitGuideTrainEdit(2,'position',String(base().rodLengthMm-target));
  const moved=design();
  assert.equal(moved.guides[2].idMm,15);
  assert.equal(moved.guides[2].centreHeightMm,20);
  assert.equal(moved.guides[2].xMm,target);
  assert.equal(moved.guides[2].moved,true);
  state.guides=[];
  function base(){return state;}
});

test('markup: guide set, mode label and caption exist once; the set sits outside the results so it stays reachable',()=>{
  const card=html.slice(html.indexOf('<article id="workshopToolGuideTrain"'),html.indexOf('</article>',html.indexOf('<article id="workshopToolGuideTrain"')));
  for(const id of ['gtSetRows','gtSetAdd','gtMode','gtCaption'])assert.equal((card.match(new RegExp(`id="${id}"`,'g'))||[]).length,1,id);
  const results=card.slice(card.indexOf('<section id="gtResults"'),card.indexOf('</section>',card.indexOf('<section id="gtResults"')));
  assert.ok(!results.includes('id="gtSetRows"'),'not inside the hidden-when-invalid results');
  assert.ok(results.includes('id="gtMode"'));
  const set=card.slice(card.indexOf('<details class="guide-train-set">'),card.indexOf('</details>',card.indexOf('<details class="guide-train-set">')));
  assert.match(set,/<summary>Measured guide set<\/summary>/);
  assert.match(set,/kept for this session only/);
  assert.match(set,/centre height above the blank surface/);
  assert.equal((html.match(/data-workshop-tool-open="guide-train"/g)||[]).length,1,'no extra screens or launchers');
  assert.equal((html.match(/id="workshopToolGuideTrain"/g)||[]).length,1);
  assert.deepEqual([...card].filter((ch)=>ch.charCodeAt(0)>127),[]);
  // The advanced disclosure still holds the model settings and the method.
  const advanced=card.slice(card.indexOf('<details class="guide-train-advanced">'));
  for(const id of ['gtFlareAngle','gtSettledLine','gtClearance','gtRunnerMinGap','gtMethodBody'])assert.ok(advanced.includes(`id="${id}"`),id);
  assert.ok(advanced.includes('id="gtSetRows"'),'measured guide dimensions are advanced');
  assert.match(card,/<summary>View &amp; Adjust<\/summary>/);
  assert.match(advanced,/<summary>Advanced options<\/summary>/);
});

test('styling: new controls are scoped to the tool, reuse the design tokens and keep 44px targets and 16px text',()=>{
  const start=css.indexOf('/* Guide Train Designer (Workshop)');
  const block=css.slice(start,css.indexOf('/* End Guide Train Designer */'));
  for(const selector of ['.guide-train-mode','.gt-guide__source','.gt-guide__spec select','.guide-train-set','.guide-train-set summary','.gt-set-row input','.gt-set-row .gt-set-remove','.guide-train-set__body > .ghost-action','.guide-train-generate','.guide-train-adjust summary']){
    assert.ok(block.includes(`#workshopToolGuideTrain ${selector}`),selector);
  }
  assert.match(block,/#workshopToolGuideTrain \.gt-guide__spec select\{[^}]*min-height:44px;[^}]*font-size:16px/);
  assert.match(block,/#workshopToolGuideTrain \.gt-set-row input\{[^}]*min-height:44px;[^}]*font-size:16px/);
  assert.match(block,/#workshopToolGuideTrain \.gt-set-row \.gt-set-remove\{\s*min-height:44px/);
  assert.match(block,/#workshopToolGuideTrain \.guide-train-set summary\{[^}]*min-height:44px/);
  assert.match(block,/@media \(max-width:360px\)[\s\S]*\.guide-train-adjust__counts\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(block,/@media \(min-width:761px\)[\s\S]*width:min\(100%,840px\)/);
  assert.deepEqual([...block].filter((ch)=>ch.charCodeAt(0)>127),[]);
});

test('Guide Spacing is untouched and the new UI code never references it',()=>{
  const code=source.slice(source.indexOf('function guideTrainEngine('),source.indexOf('function renderWorkshopCalculator(){'));
  for(const forbidden of ['calcGuideLayout','workshopToolsState.spiral','guideSpecification','KLabsGuideLayout','guideCount']){
    assert.equal(code.includes(forbidden),false,forbidden);
  }
  assert.deepEqual([...code].filter((ch)=>ch.charCodeAt(0)>127),[]);
});
