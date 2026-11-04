const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const Engine=require('../js/guide-train.js');

function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const lineEnd=source.indexOf('\n',start);
  const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
  return source.slice(start,end);
}

// The Guide Train block of studio.css, bounded by its own start and end comments.
const cssStart=css.indexOf('/* Guide Train Designer (Workshop)');
const cssEnd=css.indexOf('/* End Guide Train Designer */');
const trainCss=css.slice(cssStart,cssEnd);

// The Guide Train functions in ui.js, from the engine accessor to the end of the drag helper chain.
const uiStart=source.indexOf('function guideTrainEngine(');
const uiEnd=source.indexOf('function bindGuideTrainControls(');
const trainSource=source.slice(uiStart,uiEnd);

function harness({unit='metric'}={}){
  const state={
    unit,imperialDisplay:'decimal',rodLengthMm:2130,buttOdMm:14,tipOdMm:2.4,spoolLipMm:560,spoolDiameterMm:40,
    reelHeightMm:36,reelAngleDeg:0,reductionCount:5,stripperIdMm:30,tipTopIdMm:5,tipTopHeightMm:4,
    flareAngleDeg:1.5,settledLineMm:4,clearancePct:25,guides:[],selected:0,invalid:{},notice:'',
  };
  const c=vm.createContext({
    KLabsGuideTrain:Engine,
    workshopToolsState:{activeTool:'guide-train',guideTrain:state},
    activeMeasurementUnits:()=>state.unit,
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3,decimalsImperial:3,forceDecimal:true},
  });
  for(const name of [
    'numberOrZero','mmToInches','inchesToMm','trimTrailingZeroes','formatDecimal','gcd','formatImperialFractionInches',
    'parseImperialInchesInput','normalizeWorkshopUnit','normalizeWorkshopImperialDisplay','workshopUnitSuffix',
    'parseWorkshopMeasurementMm','formatWorkshopMeasurementNumber','formatWorkshopMeasurementValue','escapeHtml',
    'guideTrainEngine','guideTrainFormatter','readGuideTrainMeasurement','readGuideTrainNumber','guideTrainRequest',
    'guideTrainStatus','guideTrainCardsMarkup','guideTrainDragPosition','setGuideTrainOverride','commitGuideTrainEdit',
  ]){
    vm.runInContext(extract(name),c);
  }
  const design=()=>c.KLabsGuideTrain.designGuideTrain(c.guideTrainRequest(state),c.guideTrainFormatter(state));
  return {c,state,design};
}
const xs=(d)=>d.guides.map((g)=>Math.round(g.xMm*10)/10);

test('UI defaults equal the engine defaults, so the first render matches the documented example',()=>{
  const {state}=harness();
  const d=Engine.DEFAULTS;
  for(const key of Object.keys(d)){
    if(key==='guides')continue;
    assert.equal(state[key],d[key],`default ${key}`);
  }
  const block=source.slice(source.indexOf('  guideTrain:{'),source.indexOf('  guideTrain:{')+700);
  for(const key of ['rodLengthMm','buttOdMm','tipOdMm','spoolLipMm','spoolDiameterMm','reelHeightMm','reelAngleDeg','reductionCount','stripperIdMm','tipTopIdMm','tipTopHeightMm','flareAngleDeg','settledLineMm','clearancePct']){
    const match=block.match(new RegExp(`${key}:([-\\d.]+)`));
    assert.ok(match,`state declares ${key}`);
    assert.equal(Number(match[1]),d[key],`ui.js default ${key} equals the engine`);
  }
});

test('state maps to an engine request without altering any value',()=>{
  const {c,state}=harness();
  state.guides=[null,{positionMm:1000}];
  const request=JSON.parse(JSON.stringify(c.guideTrainRequest(state)));
  assert.equal(request.rodLengthMm,2130);
  assert.equal(request.spoolDiameterMm,40);
  assert.equal(request.reductionCount,5);
  assert.deepEqual(request.guides,[null,{positionMm:1000}]);
  assert.equal(Object.prototype.hasOwnProperty.call(request,'unit'),false);
});

test('measurement reading: empty is missing, bad text is invalid, units convert',()=>{
  const {c}=harness();
  assert.equal(c.readGuideTrainMeasurement('','metric'),null);
  assert.equal(c.readGuideTrainMeasurement('   ','metric'),null);
  assert.ok(Number.isNaN(c.readGuideTrainMeasurement('abc','metric')));
  assert.ok(Number.isNaN(c.readGuideTrainMeasurement('-3','metric')));
  assert.equal(c.readGuideTrainMeasurement('40','metric'),40);
  assert.ok(Math.abs(c.readGuideTrainMeasurement('1','imperial')-25.4)<1e-9);
  assert.equal(c.readGuideTrainNumber(''),null);
  assert.equal(c.readGuideTrainNumber('5'),5);
  assert.ok(Number.isNaN(c.readGuideTrainNumber('x')));
});

test('guide cards are built once per guide with labelled inputs; the tip-top position is fixed',()=>{
  const {c,design}=harness();
  const d=design();
  assert.ok(d.ok);
  const markup=c.guideTrainCardsMarkup(d);
  assert.equal((markup.match(/class="gt-guide"/g)||[]).length,d.guides.length);
  assert.equal((markup.match(/data-gt-field="position"/g)||[]).length,d.guides.length);
  assert.equal((markup.match(/ disabled/g)||[]).length,1,'only the tip-top position is disabled');
  assert.ok(/aria-label="Stripper: from tip"/.test(markup));
  assert.ok(/aria-label="Guide 5 \(choke\): ring id"/.test(markup));
  assert.ok(/aria-label="Tip-top: height"/.test(markup));
});

test('dragging stays between the neighbours and snaps to 0.5 mm',()=>{
  const {c,design}=harness();
  const d=design();
  const g=d.guides;
  assert.equal(c.guideTrainDragPosition(d,2,g[1].xMm-500),Math.ceil((g[1].xMm+0.5)*2)/2,'left clamp');
  assert.equal(c.guideTrainDragPosition(d,2,g[3].xMm+500),Math.floor((g[3].xMm-0.5)*2)/2,'right clamp');
  assert.equal(c.guideTrainDragPosition(d,2,1100.26),1100.5);
  assert.equal(c.guideTrainDragPosition(d,2,1100.2),1100);
  assert.ok(c.guideTrainDragPosition(d,0,0)>=d.reel.lipXMm+1,'the stripper cannot go behind the reel');
});

test('a valid position edit is stored from the butt and moves only that guide',()=>{
  const {c,state,design}=harness();
  const before=xs(design());
  assert.equal(c.commitGuideTrainEdit(2,'position','1000'),true);
  assert.equal(state.guides[2].positionMm,1130,'stored as distance from the butt');
  const after=xs(design());
  assert.equal(after[2],1130);
  after.forEach((x,i)=>{if(i!==2)assert.equal(x,before[i],`guide ${i} unchanged`);});
  assert.equal(state.rodLengthMm,2130,'rod measurements are never edited');
});

test('an edit that would break the order is refused with a message and leaves the design intact',()=>{
  const {c,state,design}=harness();
  const before=xs(design());
  assert.equal(c.commitGuideTrainEdit(2,'position','1200'),false);
  assert.match(state.invalid['2.position'],/must sit closer to the tip than Guide 1/);
  assert.equal(state.guides.length===0||state.guides.every((entry)=>entry===null),true,'nothing stored');
  assert.deepEqual(xs(design()),before);
  assert.equal(c.commitGuideTrainEdit(2,'position','abc'),false);
  assert.match(state.invalid['2.position'],/not a valid number/);
});

test('clearing a field returns the guide to its proposal and removes the stored override',()=>{
  const {c,state,design}=harness();
  const proposal=xs(design());
  c.commitGuideTrainEdit(2,'position','1000');
  c.commitGuideTrainEdit(2,'position','');
  assert.equal(state.guides[2],null);
  assert.deepEqual(xs(design()),proposal);
});

test('stripper and tip-top ring edits update the main inputs, not the guide overrides',()=>{
  const {c,state}=harness();
  assert.equal(c.commitGuideTrainEdit(0,'id','28'),true);
  assert.equal(state.stripperIdMm,28);
  assert.equal(c.commitGuideTrainEdit(6,'id','6'),true);
  assert.equal(state.tipTopIdMm,6);
  assert.equal(c.commitGuideTrainEdit(6,'height','5'),true);
  assert.equal(state.tipTopHeightMm,5);
  assert.equal(state.guides.length,0);
});

test('imperial edits convert to millimetres exactly once',()=>{
  const {c,state}=harness({unit:'imperial'});
  assert.equal(c.commitGuideTrainEdit(3,'id','0.4'),true);
  assert.ok(Math.abs(state.guides[3].idMm-10.16)<1e-9);
});

test('status text distinguishes fitting, short and blank-overlapping rings',()=>{
  const {c,design}=harness();
  const d=design();
  const fmt=c.guideTrainFormatter(harness().state);
  assert.deepEqual(JSON.parse(JSON.stringify(c.guideTrainStatus(d.guides[1],fmt))),{text:'Fits',level:'ok'});
  const short=JSON.parse(JSON.stringify(c.guideTrainStatus({fits:false,marginMm:-5.8,ringTopClearanceMm:1},fmt)));
  assert.equal(short.level,'warn');
  assert.match(short.text,/^Ring 5\.8 mm short$/);
  assert.equal(c.guideTrainStatus({fits:true,marginMm:1,ringTopClearanceMm:-1},fmt).text,'Overlaps blank');
});

test('Workshop wiring: launcher, card, script order and offline asset exist; existing tools are unchanged',()=>{
  assert.equal((html.match(/data-workshop-tool-open="guide-train"/g)||[]).length,1);
  assert.equal((html.match(/id="workshopToolGuideTrain"/g)||[]).length,1);
  assert.match(html,/<article[^>]*id="workshopToolGuideTrain"[^>]*hidden/);
  const engineAt=html.indexOf('<script src="js/guide-train.js"></script>');
  const uiAt=html.indexOf('<script src="js/ui.js"');
  assert.ok(engineAt>0 && uiAt>engineAt,'engine loads before ui.js');
  assert.match(worker,/'js\/guide-train\.js'/);
  for(const tool of ['diameter','grip','thread-wrap']){
    assert.ok(html.includes(`data-workshop-tool-open="${tool}"`),`${tool} launcher kept`);
  }
  assert.ok(/tool==='guide-train'\?'guide-train':'diameter'/.test(source),'open mapping falls back to diameter');
  assert.ok(/activeTool!=='guide-train'/.test(extract('renderWorkshopToolVisibility')));
  for(const id of ['workshopToolDiameter','workshopToolGrip','workshopToolThreadWrap']){
    assert.ok(extract('renderWorkshopToolVisibility').includes(`$('${id}')`),`${id} visibility kept`);
  }
});

test('Guide Train is independent of the Guide Spacing tool',()=>{
  for(const forbidden of ['calcGuideLayout','workshopToolsState.spiral','guideSpecification','guide-layout','guideCount','KLabsGuideLayout']){
    assert.equal(trainSource.includes(forbidden),false,`ui code must not use ${forbidden}`);
    assert.equal(fs.readFileSync(path.join(root,'js','guide-train.js'),'utf8').includes(forbidden),false,`engine must not use ${forbidden}`);
  }
  assert.equal(/guide-layout\.js/.test(fs.readFileSync(path.join(root,'js','guide-train.js'),'utf8')),false);
});

test('CSS is scoped to the tool, keeps 44px targets and 16px inputs, and widens only this tool on desktop',()=>{
  assert.ok(cssStart>=0 && cssEnd>cssStart,'delimited CSS block exists');
  const stripped=trainCss.replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=[];
  const walk=(text)=>{
    const re=/([^{}]+)\{([^{}]*)\}|([^{}]+)\{/g;
    let m;
    while((m=re.exec(text))){
      const head=(m[1]||m[3]).trim();
      if(m[1]!==undefined && !head.startsWith('@'))head.split(/,(?![^(]*\))/).forEach((s)=>selectors.push(s.trim()));
    }
  };
  walk(stripped);
  assert.ok(selectors.length>10);
  for(const selector of selectors){
    assert.ok(/#workshopToolGuideTrain/.test(selector),`selector is scoped: ${selector}`);
  }
  assert.match(trainCss,/min-height:\s*44px/);
  assert.match(trainCss,/font-size:\s*16px/);
  const desktop=trainCss.slice(trainCss.indexOf('@media (min-width:761px)'));
  assert.match(desktop,/#workshopLandingScreen\.active #workshopToolGuideTrain/);
  assert.match(desktop,/width:\s*min\(100%,\s*840px\)/);
  assert.equal(/\.app-shell\s*\{/.test(stripped.replace(/:has\([^)]*\)/g,'')),false,'no unscoped global shell rule');
});

test('Guide Train UI code, markup and CSS are pure ASCII with no mojibake',()=>{
  const nonAscii=(text)=>[...text].filter((ch)=>ch.charCodeAt(0)>127);
  assert.deepEqual(nonAscii(trainSource),[]);
  assert.deepEqual(nonAscii(trainCss),[]);
  const cardStart=html.indexOf('<article id="workshopToolGuideTrain"');
  const cardEnd=html.indexOf('</article>',cardStart);
  assert.deepEqual(nonAscii(html.slice(cardStart,cardEnd)),[]);
  assert.match(html,/<meta charset="utf-?8"/i);
  const {c,design,state}=harness();
  const rendered=c.guideTrainCardsMarkup(design())+c.guideTrainFormatter(state).degrees(1.5);
  assert.equal(/\u00C2|\u00C3|\u00E2\u0080/.test(rendered),false,'no mojibake');
  assert.equal(c.guideTrainFormatter(state).degrees(1.5),'1.5\u00B0');
});
