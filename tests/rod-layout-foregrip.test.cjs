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

function model(specs){
  const c={
    quote:{buildSpecifications:specs},
    state:{firstGuide:0,guideCount:0,targetStripper:0},
    workshopToolsState:{spiral:{guides:[]}},
    normalizeBuildLayout:()=>({rodLengthMm:2000,reelSeat:{lengthMm:130},reelSeatPositionRef:'rear'}),
    calcGuideLayout:()=>({rows:[]}),
    formatGuideListMeasurement:(mm)=>`${mm} mm`,
    parseMeasurementInputValue:(text)=>Number(text),
    parseImperialInchesInput:Number,
    inchesToMm:(v)=>v*25.4,
    reelSeatComponentLabel:()=>'',
    specificationValue:(v)=>String(v||'').trim()
  };
  vm.createContext(c);
  vm.runInContext(`${fn('buildSpecMeasurementMm')}\n${fn('rodLayoutModel')}`,c);
  return c.rodLayoutModel();
}

const base={rearGripLength:'280 mm',gripBelowReelSeatLength:'90 mm',reelSeatPosition:'350 mm'};
const keys=(m)=>m.items.map((item)=>item.key);

test('grip inputs are ordered Rear, Lower, Fore',()=>{
  const at=(id)=>html.indexOf(`id="${id}"`);
  assert.ok(at('quoteSpecRearGripLength')<at('quoteSpecGripBelowReelSeatLength'));
  assert.ok(at('quoteSpecGripBelowReelSeatLength')<at('quoteSpecForeGripLength'));
  assert.match(html,/<span>Rear Grip<\/span>/);
});

test('blank and zero foregrip omit the foregrip item without prompts or NaN',()=>{
  for(const fore of [undefined,'','   ','0','0 mm','0.0','0cm']){
    const m=model({...base,foreGripLength:fore});
    assert.deepEqual([...keys(m)].sort(),['lowerGrip','reelSeat','rearGrip'].sort(),String(fore));
    assert.ok(!keys(m).includes('foreGrip'),String(fore));
    assert.equal(m.prompts.length,0,String(fore));
    assert.equal(m.waiting.length,0,String(fore));
    assert.ok(m.items.every((item)=>Number.isFinite(item.startMm)&&Number.isFinite(item.endMm)&&item.endMm>item.startMm));
    assert.ok(Number.isFinite(m.scaleMm));
  }
});

test('positive foregrip still renders from the front of the reel seat',()=>{
  const m=model({...base,foreGripLength:'70 mm'});
  const seat=m.items.find((item)=>item.key==='reelSeat');
  const fore=m.items.find((item)=>item.key==='foreGrip');
  assert.ok(fore);
  assert.equal(fore.startMm,seat.endMm);
  assert.equal(fore.endMm,seat.endMm+70);
  assert.ok(m.items.some((item)=>item.key==='rearGrip'));
  assert.ok(m.items.some((item)=>item.key==='lowerGrip'));
});

test('unreadable foregrip text and zero rear/lower grips are still flagged',()=>{
  assert.equal(model({...base,foreGripLength:'abc'}).prompts.length,1);
  const m=model({...base,rearGripLength:'0',gripBelowReelSeatLength:'0',foreGripLength:''});
  assert.equal(m.prompts.length,2);
});

test('grip summaries omit a blank or zero foregrip but keep positive values',()=>{
  const summaries=(specs)=>{
    const c={
      quote:{buildSpecifications:specs},
      specificationValue:(v)=>String(v||'').trim(),
      customerSafeText:(v)=>String(v||'').trim(),
      parseMeasurementInputValue:(text)=>Number(text),
      parseImperialInchesInput:Number,
      inchesToMm:(v)=>v*25.4
    };
    vm.createContext(c);
    vm.runInContext(`${fn('buildSpecMeasurementMm')}\n${fn('customerGripConfigurationValue')}\n${fn('customerGripFeatureSummary')}`,c);
    return [c.customerGripConfigurationValue(),c.customerGripFeatureSummary()];
  };
  for(const fore of ['','0','0 mm']){
    const [internal,customer]=summaries({rearGripLength:'280 mm',gripBelowReelSeatLength:'90 mm',foreGripLength:fore});
    assert.equal(internal,'Rear 280 mm \u2022 Lower 90 mm');
    assert.doesNotMatch(customer,/fore/i);
  }
  const [internal,customer]=summaries({rearGripLength:'280 mm',gripBelowReelSeatLength:'90 mm',foreGripLength:'70 mm'});
  assert.match(internal,/Fore 70 mm/);
  assert.match(customer,/fore grip 70 mm/);
  assert.match(summaries({rearGripLength:'',foreGripLength:'0'})[1],/^$/);
});
