const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function model(layout){
  const c={
    quote:{buildSpecifications:{reelSeatPosition:'350 mm',gripBelowReelSeatLength:'90 mm',layout:{rodLengthMm:2000,reelSeat:{lengthMm:130},...layout}}},
    state:{},workshopToolsState:{spiral:{guides:[]}},
    calcGuideLayout:()=>({rows:[]}),
    buildGuideView:()=>null,
    formatGuideListMeasurement:(mm)=>`${mm} mm`,
    parseMeasurementInputValue:Number,
    parseImperialInchesInput:Number,
    inchesToMm:(v)=>v*25.4,
    reelSeatComponentLabel:()=>'',
    specificationValue:(v)=>String(v||'').trim(),
  };
  vm.createContext(c);
  vm.runInContext(['buildLayoutLength','normalizeBuildLayout','buildSpecMeasurementMm','rodLayoutModel'].map(fn).join('\n'),c);
  return c.rodLayoutModel();
}

test('Reel Seat Position is followed by the reference selector, labelled from the butt',()=>{
  const seat=html.indexOf('id="quoteSpecReelSeatPosition"');
  const ref=html.indexOf('id="quoteSpecReelSeatRef"');
  const rear=html.indexOf('id="quoteSpecRearGripLength"');
  assert.ok(seat>0 && seat<ref && ref<rear);
  assert.doesNotMatch(html,/quoteSpecHookKeeperPosition/);
  assert.match(html,/Measured from the rod butt to the/);
  assert.match(fn('rodLayoutSeatRefLabels'),/Rear of seat.*Centre of seat.*Front of seat/);
});

test('the selector is not duplicated in Rod Build Layout',()=>{
  assert.equal((source.match(/rodLayoutSeatRefChoice\(/g)||[]).length,2);
  assert.doesNotMatch(fn('rodLayoutReadout')+fn('rodLayoutPromptsMarkup'),/rodLayoutSeatRefChoice/);
  assert.doesNotMatch(fn('rodLayoutModel'),/choice:true/);
});

test('rod layout still positions the seat and lower grip from the chosen reference',()=>{
  const rear=model({reelSeatPositionRef:'rear'});
  const centre=model({reelSeatPositionRef:'centre'});
  const front=model({reelSeatPositionRef:'front'});
  const start=(m)=>m.items.find((item)=>item.key==='reelSeat').startMm;
  assert.equal(start(rear),350);
  assert.equal(start(centre),285);
  assert.equal(start(front),220);
  assert.equal(front.items.find((item)=>item.key==='lowerGrip').endMm,220);
});

test('a saved build without a reference is not assigned one and is prompted in Build Details',()=>{
  const m=model({});
  assert.equal(m.items.some((item)=>item.key==='reelSeat'),false);
  const prompt=m.prompts.find((entry)=>/Reel seat position/.test(entry.label));
  assert.equal(prompt.spec,'reelSeatPosition');
  assert.equal(prompt.choice,undefined);
});

test('only new builds default to Rear of seat, and the default alone is not draft content',()=>{
  assert.match(fn('newQuoteTemplate'),/layout:\{reelSeatPositionRef:'rear'\}/);
  const c={specificationValue:(v)=>String(v||'').trim()};
  vm.createContext(c);
  vm.runInContext(['buildLayoutLength','normalizeBuildLayout','buildSpecsHaveContent'].map(fn).join('\n'),c);
  assert.equal(c.buildSpecsHaveContent({reelSeatPosition:'',layout:{reelSeatPositionRef:'rear'}}),false);
  assert.equal(c.buildSpecsHaveContent({layout:{reelSeatPositionRef:'centre'}}),true);
  assert.equal(c.buildSpecsHaveContent({layout:{reelSeatPositionRef:'rear',rodLengthMm:2000}}),true);
  assert.equal(c.buildSpecsHaveContent({reelSeatPosition:'350 mm'}),true);
});

test('bottom SAVE TO BUILD & RETURN sits above the disclaimer, uses the same function, shows only from a build',()=>{
  const button=html.indexOf('id="layoutSaveToBuildBtn"');
  assert.ok(button>0 && button<html.indexOf('id="layoutGuideNotice"'));
  assert.match(html,/id="layoutSaveToBuildBtn" class="primary-action" type="button" hidden>SAVE TO BUILD &amp; RETURN/);
  assert.match(source,/saveToBuildBtn\.addEventListener\('click',\(\)=>\{\s*if\(layoutEntryOrigin==='build'\)returnToOriginatingBuildFromGuideLayout\(\);/);
  const nodes={layoutSaveToBuildBtn:{hidden:true}};
  const top={querySelector:()=>({textContent:''}),setAttribute(){}};
  const c={layoutEntryOrigin:'build',document:{querySelector:()=>top},$:(id)=>nodes[id]};
  vm.createContext(c);
  vm.runInContext(fn('syncLayoutReturnControl'),c);
  c.syncLayoutReturnControl();
  assert.equal(nodes.layoutSaveToBuildBtn.hidden,false);
  c.layoutEntryOrigin='';
  c.syncLayoutReturnControl();
  assert.equal(nodes.layoutSaveToBuildBtn.hidden,true);
});

test('Hook Keeper Position is hidden from the form and customer output but its stored value is still normalised',()=>{
  assert.match(source,/key:'hookKeeperPosition',label:'Hook Keeper Position',visibility:'stored'/);
  assert.match(fn('normalizeBuildSpecifications'),/BUILD_SPEC_FIELDS\.forEach/);
});
