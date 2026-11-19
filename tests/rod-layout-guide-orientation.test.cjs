// Q13: Rod Build Layout side view draws each guide from its saved orientation. 0 deg is the reel side (underneath for
// spinning, on top for casting or no rod style), 180 deg the opposite side; spirals turn around the blank. Display only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
function renderer(){
  const c={rodLayoutSelection:'',escapeHtml:(v)=>String(v),activeMeasurementUnits:()=>'metric',Math,Number,String};
  vm.createContext(c);
  vm.runInContext(['numberOrZero','clampSpiralAngle','normalizeRodStyle','trimTrailingZeroes','formatDecimal','rodLayoutGuidePose','rodLayoutSvg'].map(fn).join('\n'),c);
  return c;
}
// Guides as rodLayoutModel builds them: G1 nearest the tip, the stripper furthest; angles from the saved layout.
function model(rodStyle,angles,{withAngles=true}={}){
  const guides=angles.map((angle,index)=>({key:`guide:${index}`,label:`Guide ${index+1}`,number:index+1,type:'guide',
    atMm:1900-(index*150),fromTipMm:100+(index*150),isStripper:index===angles.length-1,guide:withAngles?{angleDeg:angle}:null}));
  return {rodLength:2000,scaleMm:2000,items:[],guides,guideView:{rodStyle,method:'progressive',direction:'left',angles}};
}
// Per guide: 'up' / 'down' with the stem length, or 'ring' (seen face-on), read from the SVG.
function stems(svg,mid){
  const out=[];
  for(const m of svg.matchAll(/data-layout-item="guide:(\d+)"[\s\S]*?<\/g>/g)){
    const g=m[0];
    if(/<circle class="rl-guide/.test(g)){out[+m[1]]={dir:'ring'};continue;}
    const y2=Number(/<line class="rl-guide[^"]*" x1="[^"]*" y1="[^"]*" x2="[^"]*" y2="([^"]*)"/.exec(g)[1]);
    out[+m[1]]={dir:y2>mid?'down':'up',len:Math.abs(y2-mid)};
  }
  return out;
}
const detail=(c,m)=>c.rodLayoutSvg(m,{detail:true,width:1500});
const tipLabelY=(svg)=>Number(/<text class="rl-label" x="[^"]*" y="([^"]*)" text-anchor="end">TIP TOP/.exec(svg)[1]);

test('Q13: Standard Spinning draws every guide below the blank, labels below, tip-top label moved above',()=>{
  const c=renderer();const svg=detail(c,model('spinning',[0,0,0,0,0]));
  const s=stems(svg,30);
  assert.equal(s.length,5);
  assert.ok(s.every((g)=>g.dir==='down'),JSON.stringify(s));
  assert.equal(s[4].len,17,'stripper stem keeps its longer length');
  assert.equal(s[0].len,13);
  for(const m of svg.matchAll(/rl-label--guide" x="[^"]*" y="([^"]*)"/g))assert.ok(Number(m[1])>30,'guide label under the blank');
  assert.ok(tipLabelY(svg)<30,'TIP TOP label above the blank');
});

test('Q13: Standard Casting and no chosen rod style draw every guide above the blank, as before',()=>{
  for(const style of ['casting','']){
    const c=renderer();const svg=detail(c,model(style,[0,0,0,0,0]));
    const s=stems(svg,30);
    assert.ok(s.every((g)=>g.dir==='up'),style+' '+JSON.stringify(s));
    assert.deepEqual(s.map((g)=>g.len),[13,13,13,13,17]);
    assert.ok(tipLabelY(svg)>30,'TIP TOP label stays under the blank');
  }
});

test('Q13: a casting spiral turns around the blank following the saved angles (reel side -> side -> opposite)',()=>{
  // tip -> stripper: running guides opposite (180), transition 135 / 90 / 45, stripper on the reel side (0)
  const c=renderer();const s=stems(detail(c,model('casting',[180,180,135,90,45,0])),30);
  assert.deepEqual(s.map((g)=>g.dir),['down','down','down','ring','up','up']);
  assert.ok(Math.abs(s[2].len-13*Math.SQRT1_2)<0.02,'135 deg: shortened stem below');
  assert.ok(Math.abs(s[4].len-13*Math.SQRT1_2)<0.02,'45 deg: shortened stem above');
  assert.equal(s[0].len,13);assert.equal(s[5].len,17);
});

test('Q13: acute layout (0 / 90 / 180) shows stripper on top, the next guide side-on, the rest underneath',()=>{
  const c=renderer();const s=stems(detail(c,model('casting',[180,180,180,90,0])),30);
  assert.deepEqual(s.map((g)=>g.dir),['down','down','down','ring','up']);
});

test('Q13: near-sideways angles (75-105 deg) are drawn as a ring on the blank, never a vanishing stem',()=>{
  const c=renderer();
  for(const angle of [76,85,90,95,104]){
    const pose=c.rodLayoutGuidePose({guide:{angleDeg:angle}},{rodStyle:'casting'});
    assert.equal(pose.sideways,true,String(angle));
  }
  for(const angle of [70,110])assert.equal(c.rodLayoutGuidePose({guide:{angleDeg:angle}},{rodStyle:'casting'}).sideways,false,String(angle));
});

test('Q13: guides without saved angles are drawn on the reel side (0 deg): above for casting, below for spinning',()=>{
  const c=renderer();
  assert.ok(stems(detail(c,model('casting',[0,0,0],{withAngles:false})),30).every((g)=>g.dir==='up'));
  assert.ok(stems(detail(c,model('spinning',[0,0,0],{withAngles:false})),30).every((g)=>g.dir==='down'));
});

test('Q13: compact overview follows the same orientation and stays inside its 40-unit height',()=>{
  const c=renderer();const svg=c.rodLayoutSvg(model('spinning',[0,0,0,0,0]),{detail:false});
  const s=stems(svg,20);
  assert.ok(s.every((g)=>g.dir==='down'));
  for(const m of svg.matchAll(/class="rl-guide[^"]*" x1="[^"]*" y1="[^"]*" x2="[^"]*" y2="([^"]*)"/g))assert.ok(Number(m[1])<=40);
});

test('Q13: display only - rendering does not change the model, guide positions or saved angles',()=>{
  const c=renderer();const m=model('casting',[180,180,135,90,45,0]);const before=JSON.stringify(m);
  detail(c,m);c.rodLayoutSvg(m,{detail:false});
  assert.equal(JSON.stringify(m),before);
  assert.doesNotMatch(fn('rodLayoutGuidePose'),/Store\.|save|persist|quote\./,'no storage or job access');
});
