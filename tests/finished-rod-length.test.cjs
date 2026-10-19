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

function parser(units){
  const c={
    activeMeasurementUnits:()=>units,
    numberOrZero:(v)=>Number.isFinite(Number(v))?Number(v):0,
    FINISHED_ROD_LENGTH_WARN_BELOW_MM:300
  };
  vm.createContext(c);
  vm.runInContext(`${fn('inchesToMm')}\n${fn('parseImperialInchesInput')}\n${fn('parseMeasurementInputValue')}\n${fn('parseFinishedRodLengthInput')}`,c);
  return c.parseFinishedRodLengthInput;
}

test('13 feet is stored as 3962.4 mm in either unit preference',()=>{
  for(const units of ['metric','imperial']){
    const parse=parser(units);
    for(const text of ['13 ft','13ft','13 feet',"13'",'156 in','156"','156 inches','3962.4 mm','396.24 cm','3.9624 m']){
      const result=parse(text);
      assert.equal(result.state,'ok',`${units} ${text}`);
      assert.equal(result.mm,3962.4,`${units} ${text}`);
    }
  }
  assert.equal(parser('imperial')("7 ft 6 in").mm,2286);
  assert.equal(parser('imperial')("7'6\"").mm,2286);
});

test('bare numbers use the active unit and are never reinterpreted as feet',()=>{
  assert.equal(parser('metric')('13').mm,13);
  assert.equal(parser('metric')('13').state,'small');
  assert.equal(parser('imperial')('156').mm,3962.4);
  assert.equal(parser('imperial')('13').mm,330.2);
  assert.equal(parser('metric')('3962.4').mm,3962.4);
});

test('empty, invalid, zero and negative entries are not accepted as lengths',()=>{
  for(const units of ['metric','imperial']){
    const parse=parser(units);
    assert.equal(parse('').state,'empty');
    assert.equal(parse('   ').state,'empty');
    for(const text of ['abc','1e3','0x10','13 ftt','--5','12 mm mm','NaN','Infinity']){
      assert.equal(parse(text).state,'invalid',`${units} ${text}`);
    }
    for(const text of ['0','-5','0 mm','0 ft','-1 in','0.0']){
      assert.ok(['nonpositive','invalid'].includes(parse(text).state),`${units} ${text}`);
      assert.equal(parse(text).mm,null,`${units} ${text}`);
    }
  }
});

test('unusually short positive lengths need confirmation but short custom rods remain possible',()=>{
  const parse=parser('metric');
  assert.equal(parse('13').state,'small');
  assert.equal(parse('299 mm').state,'small');
  assert.equal(parse('0.5').state,'small');
  assert.equal(parse('300 mm').state,'ok');
  assert.equal(parse('450 mm').state,'ok');
  assert.equal(parse('2134').state,'ok');
});

test('Build Details owns the finished length input and it is not a second stored field',()=>{
  const rodGroup=html.indexOf('<h3>Rod</h3>');
  const field=html.indexOf('id="quoteSpecFinishedRodLength"');
  const reelSeat=html.indexOf('id="quoteSpecReelSeatPosition"');
  assert.ok(rodGroup>0 && field>rodGroup && field<reelSeat);
  assert.match(html,/Finished Rod Length <em id="quoteSpecFinishedRodLengthUnit"/);
  assert.doesNotMatch(source,/key:'finishedRodLength'/);
  assert.match(source,/setBuildLayoutValue\('rodLengthMm',mm\)/);
});

test('Rod Build Layout no longer edits the length and links to Build Details',()=>{
  assert.doesNotMatch(source,/data-layout-commit|rodLayoutFallbackInput|applyBuildLayoutInput|Set length/);
  assert.match(source,/data-layout-edit="finishedLength">Enter in Build Details/);
  assert.match(source,/data-layout-edit="finishedLength">Edit in Build Details/);
  assert.match(fn('editRodLayoutItem'),/FINISHED_ROD_LENGTH_INPUT_ID/);
});
