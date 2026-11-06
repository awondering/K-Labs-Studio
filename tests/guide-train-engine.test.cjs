const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const G=require('../js/guide-train.js');

const base={...G.DEFAULTS,runnerCount:0};
const design=(overrides,fmt)=>G.designGuideTrain({...base,...overrides},fmt);
const close=(actual,expected,tolerance,label)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label||'value'}: ${actual} vs ${expected} (+/-${tolerance})`);
const rad=(d)=>d*Math.PI/180;
const code=(result)=>result.errors.map((e)=>e.code);
const warnCodes=(result)=>result.warnings.map((w)=>w.code);

// Independent restatement of the documented formulas, written separately from the engine.
function reference(v){
  const tanA=Math.tan(rad(v.flareAngleDeg));
  const fit=1+v.clearancePct/100;
  const dOf=(s)=>Math.max(v.settledLineMm,v.spoolDiameterMm-2*s*tanA);
  const sOf=(d)=>(v.spoolDiameterMm-d)/(2*tanA);
  const s1=sOf(v.stripperIdMm/fit);
  const x1=v.spoolLipMm+s1*Math.cos(rad(v.reelAngleDeg));
  const sChoke=sOf(v.settledLineMm);
  return {tanA,fit,dOf,sOf,s1,x1,sChoke,chokeId:v.settledLineMm*fit};
}

test('engine source is pure ASCII and behaves identically under a Latin-1 decode',()=>{
  const bytes=fs.readFileSync(path.join(__dirname,'..','js','guide-train.js'));
  assert.equal([...bytes].findIndex((b)=>b>127),-1);
  const load=(enc)=>{const sb={module:{exports:{}}};vm.runInNewContext(bytes.toString(enc),sb);return sb.module.exports;};
  const a=load('utf8'),b=load('latin1');
  assert.equal(JSON.stringify(b.designGuideTrain(base)),JSON.stringify(a.designGuideTrain(base)));
  assert.equal(b.buildSideViewSvg(b.designGuideTrain(base),{width:340}),a.buildSideViewSvg(a.designGuideTrain(base),{width:340}));
  assert.equal(JSON.stringify([b.METHOD_STEPS,b.ASSUMPTIONS,b.LIMITATIONS]),JSON.stringify([a.METHOD_STEPS,a.ASSUMPTIONS,a.LIMITATIONS]));
});

test('the example measurements produce a valid design with the stripper first and the tip-top last',()=>{
  const d=design({});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.deepEqual(d.warnings,[]);
  assert.equal(d.guides.length,base.reductionCount+2);
  assert.deepEqual(d.guides.map((g)=>g.role),['stripper','reduction','reduction','reduction','reduction','choke','tip-top']);
  assert.equal(d.guides[0].label,'Stripper');
  assert.equal(d.guides[5].label,'Guide 5 (choke)');
  assert.equal(d.guides[6].label,'Tip-top');
  assert.equal(d.guides[6].xMm,base.rodLengthMm);
  assert.equal(d.guides[6].fromTipMm,0);
});

test('stripper position follows the documented envelope-fit formula',()=>{
  for(const overrides of [{},{reelAngleDeg:2},{reelAngleDeg:-1.5,clearancePct:40},{flareAngleDeg:2.5,spoolDiameterMm:50,stripperIdMm:34}]){
    const v={...base,...overrides};
    const r=reference(v);
    const d=G.designGuideTrain(v);
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    close(d.guides[0].xMm,r.x1,1e-9,'stripper x');
    close(d.guides[0].heightMm,v.reelHeightMm-r.s1*Math.sin(rad(v.reelAngleDeg)),1e-9,'stripper height is on the reel-axis ray');
    close(d.guides[0].envelopeMm,v.stripperIdMm/r.fit,1e-9,'envelope at the stripper');
    close(d.summary.axisOffsetMm,0,1e-9,'no axis offset when untouched');
  }
});

test('reduction train: constant ring-size ratio, last guide at the geometric choke, sizes strictly decrease',()=>{
  for(const n of [1,2,3,5,8,12]){
    const v={...base,reductionCount:n};
    const r=reference(v);
    const d=G.designGuideTrain(v);
    assert.equal(d.ok,true,`n=${n} ${JSON.stringify(d.errors)}`);
    const rho=Math.pow(r.chokeId/v.stripperIdMm,1/n);
    close(d.summary.reductionRatio,rho,1e-12,'rho');
    for(let k=1;k<=n;k+=1){
      close(d.guides[k].requiredIdMm,v.stripperIdMm*Math.pow(rho,k),1e-7,`required ID at guide ${k}`);
      assert.ok(d.guides[k].requiredIdMm<d.guides[k-1].requiredIdMm);
      assert.ok(d.guides[k].xMm>d.guides[k-1].xMm);
      assert.ok(d.guides[k].fits,`guide ${k} proposed ring fits`);
      assert.ok(d.guides[k].idMm>=d.guides[k].requiredIdMm-1e-9);
      assert.ok(d.guides[k].idMm-d.guides[k].requiredIdMm<0.5+1e-9,'rounded up by less than 0.5 mm');
      assert.equal(d.guides[k].idMm*2,Math.round(d.guides[k].idMm*2),'half-millimetre steps');
    }
    // constant ratio between successive required sizes
    for(let k=2;k<=n;k+=1)close(d.guides[k].requiredIdMm/d.guides[k-1].requiredIdMm,rho,1e-9,'ratio');
    // the last reduction guide is the geometric choke
    close(d.guides[n].xMm,d.choke.xMm,1e-7,'choke guide x');
    close(d.guides[n].envelopeMm,v.settledLineMm,1e-9,'envelope at the choke equals the settled line');
    close(d.summary.chokeGuideOffsetMm,0,1e-7);
  }
});

test('geometric choke distance and envelope function match the documented formulas',()=>{
  const v={...base,flareAngleDeg:1.8,spoolDiameterMm:46,settledLineMm:5};
  const r=reference(v);
  const d=G.designGuideTrain(v);
  close(d.params.sChokeMm,(46-5)/(2*Math.tan(rad(1.8))),1e-9);
  close(d.summary.coneLengthMm,r.sChoke,1e-9);
  const m=G.buildModel(v);
  close(m.envelope(0),46,1e-12);
  close(m.envelope(r.sChoke),5,1e-9);
  close(m.envelope(r.sChoke*3),5,1e-12,'stays at the settled diameter after the choke');
  close(m.envelope(r.sChoke/2),(46+5)/2,1e-9,'linear in between');
  for(const e of d.envelope)close(e.diameterMm,m.envelope(e.sMm),1e-9,'envelope breakpoint');
  assert.ok(d.envelope.some((e)=>Math.abs(e.sMm-r.sChoke)<1e-6),'choke is an envelope breakpoint');
});

test('coordinates are consistent: from-tip plus from-butt equals the rod length for every guide',()=>{
  const d=design({reductionCount:7,reelAngleDeg:1});
  d.guides.forEach((g)=>{
    close(g.fromTipMm+g.fromButtMm,base.rodLengthMm,1e-9);
    close(g.fromButtMm,g.xMm,1e-12);
  });
  close(d.summary.chokeFromTipMm+d.summary.chokeFromButtMm,base.rodLengthMm,1e-9);
  close(d.summary.stripperFromTipMm+d.summary.stripperFromButtMm,base.rodLengthMm,1e-9);
  for(let i=1;i<d.guides.length;i+=1)assert.ok(d.guides[i].xMm>d.guides[i-1].xMm);
});

test('uniformly scaling every length scales every position and ring size and keeps every angle',()=>{
  const k=1.3;
  const scaled={...base};
  for(const key of ['rodLengthMm','buttOdMm','tipOdMm','spoolLipMm','spoolDiameterMm','reelHeightMm','stripperIdMm','tipTopIdMm','tipTopCentreHeightMm','settledLineMm'])scaled[key]=base[key]*k;
  const a=G.designGuideTrain(base),b=G.designGuideTrain(scaled);
  assert.equal(b.ok,true,JSON.stringify(b.errors));
  a.guides.forEach((g,i)=>{
    close(b.guides[i].xMm,g.xMm*k,1e-7,`x ${i}`);
    close(b.guides[i].heightMm,g.heightMm*k,1e-7,`height ${i}`);
    close(b.guides[i].requiredIdMm,g.requiredIdMm*k,1e-7,`required ${i}`);
  });
  close(b.summary.maxDeflectionDeg,a.summary.maxDeflectionDeg,1e-9);
  close(b.summary.reductionRatio,a.summary.reductionRatio,1e-12);
});

test('parameter sensitivity: flare, clearance, spool size and reduction count move things the right way',()=>{
  const ref=design({});
  const wide=design({flareAngleDeg:2.5});
  assert.ok(wide.summary.coneLengthMm<ref.summary.coneLengthMm,'steeper flare gathers sooner');
  assert.ok(wide.summary.stripperFromButtMm<ref.summary.stripperFromButtMm);
  const roomy=design({clearancePct:50});
  assert.ok(roomy.summary.stripperFromButtMm>ref.summary.stripperFromButtMm,'more clearance needs a gentler cone at the stripper');
  assert.ok(roomy.guides[5].requiredIdMm>ref.guides[5].requiredIdMm);
  const bigSpool=design({spoolDiameterMm:50,reelHeightMm:40});
  assert.ok(bigSpool.summary.coneLengthMm>ref.summary.coneLengthMm,'a bigger spool needs more distance to gather');
  const few=design({reductionCount:2}),many=design({reductionCount:9});
  close(few.summary.chokeFromTipMm,many.summary.chokeFromTipMm,1e-7,'choke does not depend on the guide count');
  assert.equal(few.guides.length,4);
  assert.equal(many.guides.length,11);
});

test('reel axis offset adds twice the perpendicular distance to the stripper requirement',()=>{
  const v={...base,reelAngleDeg:1.2};
  const probe=G.designGuideTrain(v);
  const lift=6;
  const o=G.designGuideTrain({...v,guides:[{positionMm:probe.guides[0].xMm,centreHeightMm:probe.guides[0].centreHeightMm+lift}]});
  assert.equal(o.ok,true,JSON.stringify(o.errors));
  const dx=o.guides[0].xMm-v.spoolLipMm,dy=o.guides[0].heightMm-v.reelHeightMm;
  const expected=Math.abs(dx*Math.sin(rad(1.2))+dy*Math.cos(rad(1.2)));
  close(o.summary.axisOffsetMm,expected,1e-9,'perpendicular offset');
  close(o.guides[0].requiredIdMm,o.guides[0].envelopeMm*1.25+2*expected,1e-9);
  assert.ok(expected>0 && expected<lift+0.5);
  assert.ok(o.guides[0].marginMm<probe.guides[0].marginMm);
});

test('path length and arc positions are the polyline through the ring centres',()=>{
  const d=design({reelAngleDeg:0.8});
  let total=0;
  for(let i=0;i<d.path.length-1;i+=1){
    total+=Math.hypot(d.path[i+1].xMm-d.path[i].xMm,d.path[i+1].yMm-d.path[i].yMm);
    close(d.guides[i].sMm,total,1e-9,`arc to guide ${i}`);
  }
  close(d.summary.pathLengthMm,total,1e-9);
  assert.equal(d.path.length,d.guides.length+1);
  assert.deepEqual(d.path[0],{xMm:base.spoolLipMm,yMm:base.reelHeightMm});
});

test('blank clearance: reported minimum matches a brute-force scan along the line path',()=>{
  for(const overrides of [{},{reelAngleDeg:2},{tipTopCentreHeightMm:2.6},{buttOdMm:20,reelHeightMm:40}]){
    const d=design(overrides);
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    const v=d.input;
    let minimum=Infinity;
    const N=4000;
    for(let i=0;i<=N;i+=1){
      const s=d.summary.pathLengthMm*i/N;
      let j=0;
      const arcs=[0,...d.guides.map((g)=>g.sMm)];
      while(j<arcs.length-2 && arcs[j+1]<s)j+=1;
      const t=(s-arcs[j])/(arcs[j+1]-arcs[j]);
      const x=d.path[j].xMm+(d.path[j+1].xMm-d.path[j].xMm)*t;
      const y=d.path[j].yMm+(d.path[j+1].yMm-d.path[j].yMm)*t;
      const cosPsi=(d.path[j+1].xMm-d.path[j].xMm)/Math.hypot(d.path[j+1].xMm-d.path[j].xMm,d.path[j+1].yMm-d.path[j].yMm);
      const half=(G.buildModel(v).envelope(s)/2)/cosPsi;
      minimum=Math.min(minimum,(y-half)-G.bladeRadius(v,x));
    }
    assert.ok(d.summary.minBlankClearanceMm<=minimum+1e-6,`reported ${d.summary.minBlankClearanceMm} vs scan ${minimum}`);
    assert.ok(minimum-d.summary.minBlankClearanceMm<0.05,'scan agrees with the exact breakpoint minimum');
  }
});

test('user edits recalculate from the entered values and keep the proposal for comparison',()=>{
  const ref=design({});
  const moved=G.designGuideTrain({...base,guides:[null,{positionMm:ref.guides[1].xMm+12},{idMm:18},{centreHeightMm:ref.guides[3].centreHeightMm+3}]});
  assert.equal(moved.ok,true,JSON.stringify(moved.errors));
  assert.equal(moved.guides[1].moved,true);
  close(moved.guides[1].xMm,ref.guides[1].xMm+12,1e-9);
  close(moved.guides[1].proposed.xMm,ref.guides[1].xMm,1e-9,'proposal is preserved');
  assert.equal(moved.guides[1].fromTipMm,base.rodLengthMm-moved.guides[1].xMm);
  assert.equal(moved.guides[2].idMm,18);
  assert.equal(moved.guides[2].proposed.idMm,18,'a measured ring size is a constraint, so the proposal uses it');
  assert.ok(moved.guides[2].xMm<ref.guides[2].xMm,'a larger ring fits the line cone earlier, so it is proposed nearer the reel');
  close(moved.guides[3].centreHeightMm,ref.guides[3].centreHeightMm+3,1e-9);
  assert.equal(moved.guides[3].measured.height,true);
  assert.equal(moved.guides[0].moved,false);
  assert.ok(Math.abs(moved.guides[4].xMm-ref.guides[4].xMm)<2,'later guides are recalculated around the constraint');
  // The stripper and tip-top take measured ring sizes and heights too; the tip-top position stays at the tip.
  const taken=G.designGuideTrain({...base,guides:[{idMm:28},null,null,null,null,null,{idMm:6,positionMm:10,centreHeightMm:3.5}]});
  assert.equal(taken.ok,true,JSON.stringify(taken.errors));
  assert.equal(taken.guides[0].idMm,28);
  assert.equal(taken.guides[6].idMm,6);
  assert.equal(taken.guides[6].xMm,base.rodLengthMm);
  close(taken.guides[6].centreHeightMm,3.5,1e-12);
  close(taken.guides[6].heightMm,G.bladeRadius(taken.input,base.rodLengthMm)+3.5,1e-12);
});

test('invalid or missing main measurements are rejected with a field and a plain-English message',()=>{
  for(const field of G.FIELDS){
    for(const bad of [null,undefined,'']){
      const d=design({[field.key]:bad});
      assert.equal(d.ok,false,field.key);
      const e=d.errors.find((x)=>x.field===field.key);
      assert.ok(e && e.code==='missing' && e.message.startsWith('Enter the '),`${field.key}: ${JSON.stringify(d.errors)}`);
    }
    for(const bad of [NaN,Infinity,'12']){
      const e=design({[field.key]:bad}).errors.find((x)=>x.field===field.key);
      assert.ok(e && e.code==='invalid' && /is not a valid number\.$/.test(e.message),`${field.key} ${bad}`);
    }
    const outOfRange=field.kind==='int'?[field.min-1,field.max+1]:[field.min-0.01*Math.max(1,field.min),field.max+0.01*Math.max(1,field.max)];
    for(const bad of outOfRange){
      const e=design({[field.key]:bad}).errors.find((x)=>x.field===field.key);
      assert.ok(e && e.code==='range' && /between|whole number/.test(e.message),`${field.key} ${bad}: ${JSON.stringify(e)}`);
    }
  }
  assert.ok(code(design({reductionCount:2.5})).includes('range'));
  assert.equal(G.designGuideTrain(undefined).ok,false);
  assert.equal(G.designGuideTrain(null).ok,false);
  assert.equal(G.designGuideTrain({}).errors.length,G.FIELDS.length);
});

test('physically impossible measurements are rejected',()=>{
  assert.ok(code(design({spoolLipMm:2100})).includes('spool-beyond-tip'));
  assert.ok(code(design({reelHeightMm:12})).includes('spool-in-blank'),'spool would overlap the blank');
  assert.ok(code(design({spoolDiameterMm:15,settledLineMm:15})).includes('settled-too-big'));
  assert.ok(code(design({stripperIdMm:70})).includes('stripper-too-big'));
  assert.ok(code(design({stripperIdMm:5,settledLineMm:4,clearancePct:25})).includes('not-reducing'));
  assert.ok(code(design({spoolLipMm:1950,flareAngleDeg:0.2,rodLengthMm:2130})).includes('stripper-beyond-tip'));
  const big=design({reelHeightMm:12});
  assert.match(big.errors[0].message,/overlap the blank/);
  assert.equal(big.guides,undefined,'no design is drawn for impossible input');
});

test('invalid guide edits are rejected',()=>{
  const ref=design({});
  const withGuides=(guides)=>G.designGuideTrain({...base,guides});
  assert.ok(code(withGuides([null,{positionMm:NaN}])).includes('guide-invalid'));
  assert.ok(code(withGuides([null,null,{idMm:0.4}])).includes('guide-range'));
  assert.ok(code(withGuides([null,null,{idMm:81}])).includes('guide-range'));
  assert.ok(code(withGuides([null,null,null,{centreHeightMm:-1}])).includes('guide-range'));
  assert.ok(code(withGuides([{positionMm:base.spoolLipMm-5}])).includes('guide-before-reel'));
  assert.ok(code(withGuides([null,{positionMm:base.rodLengthMm+1}])).includes('guide-beyond-tip'));
  assert.ok(code(withGuides([null,{positionMm:ref.guides[2].xMm+5}])).includes('guide-order'));
  const order=withGuides([null,{positionMm:ref.guides[2].xMm+5}]);
  assert.equal(order.ok,false);
  assert.ok(order.suggested && order.suggested.length===ref.guides.length,'the proposal is still offered');
  assert.match(order.errors.find((e)=>e.code==='guide-order').message,/must sit closer to the tip than/);
});

test('design warnings: ring too small, train not reducing, ring overlapping the blank, line touching the blank',()=>{
  const ref=design({});
  const small=G.designGuideTrain({...base,guides:[null,null,{positionMm:ref.guides[2].xMm,idMm:9}]});
  assert.equal(small.ok,true);
  const w=small.warnings.find((x)=>x.code==='ring-too-small');
  assert.ok(w && w.field==='guide2.idMm');
  assert.match(w.message,/Guide 2: the 9 mm ring is [\d.]+ mm short of the [\d.]+ mm this position needs\./);
  assert.equal(small.guides[2].fits,false);
  assert.ok(small.guides[2].marginMm<0);
  const rising=G.designGuideTrain({...base,guides:[null,null,{idMm:ref.guides[1].idMm+4}]});
  assert.ok(warnCodes(rising).includes('id-not-reducing'));
  const low=G.designGuideTrain({...base,guides:[null,null,null,{centreHeightMm:4}]});
  assert.ok(warnCodes(low).includes('ring-overlaps-blank'));
  const touching=G.designGuideTrain({...base,guides:[null,{centreHeightMm:4},{centreHeightMm:3.2},{centreHeightMm:2.8},{centreHeightMm:2.4},{centreHeightMm:2.1}]});
  assert.ok(warnCodes(touching).includes('blank-contact'),JSON.stringify(touching.warnings));
  assert.ok(touching.summary.minBlankClearanceMm<0);
  assert.ok(!warnCodes(ref).includes('blank-contact'));
  // the tip-top ring is exempt from the ring-overlaps-blank rule (it sits beyond the end of the blank)
  const tt=design({tipTopCentreHeightMm:0.5,tipTopIdMm:5});
  assert.ok(!tt.warnings.some((x)=>x.code==='ring-overlaps-blank' && x.field==='guide6.centreHeightMm'));
});

test('choke beyond the tip: warned, and the reduction chain is compressed to end before the tip-top',()=>{
  const d=design({flareAngleDeg:0.4});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.ok(warnCodes(d).includes('choke-beyond-tip'));
  assert.equal(d.summary.chokeBeyondTip,true);
  assert.equal(d.choke.beyondTip,true);
  assert.ok(d.summary.chokeFromTipMm<0,'reported as a negative distance from the tip');
  assert.equal(d.summary.chainCompressed,true);
  const x1=d.guides[0].xMm,L=base.rodLengthMm;
  const lastReduction=d.guides[d.guides.length-2];
  assert.ok(lastReduction.xMm<=L-0.05*(L-x1)+1e-6 && lastReduction.xMm>x1);
  for(let i=1;i<d.guides.length;i+=1)assert.ok(d.guides[i].xMm>d.guides[i-1].xMm);
  assert.ok(!warnCodes(design({})).includes('choke-beyond-tip'));
});

test('measurements use the supplied unit formatter',()=>{
  const fmt={length:(mm)=>`${(mm/25.4).toFixed(3)} in`,degrees:(d)=>`${d.toFixed(1)} deg`};
  const w=G.designGuideTrain({...base,guides:[null,null,{positionMm:design({}).guides[2].xMm,idMm:9}]},fmt).warnings.find((x)=>x.code==='ring-too-small');
  assert.match(w.message,/the 0\.354 in ring is/);
  assert.ok(!/ mm\b/.test(w.message));
  assert.match(design({reelHeightMm:12},fmt).errors[0].message,/overlap the blank/);
  assert.match(design({rodLengthMm:100},fmt).errors.find((e)=>e.field==='rodLengthMm').message,/between 23\.622 in and 157\.480 in\./);
  assert.match(design({reelAngleDeg:40},fmt).errors.find((e)=>e.field==='reelAngleDeg').message,/between -15\.0 deg and 15\.0 deg\./);
});

function svgParts(svg){
  const attr=(tag,name)=>{const m=tag.match(new RegExp(`${name}="([^"]*)"`));return m?m[1]:null;};
  const tags=(cls)=>svg.match(new RegExp(`<[a-z]+ class="${cls}[ "][^>]*>`,'g'))||[];
  const texts=(cls)=>[...svg.matchAll(new RegExp(`<text class="${cls}"[^>]*>([^<]*)</text>`,'g'))].map((m)=>m[1]);
  return {attr,tags,texts,viewBox:svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number)};
}

test('side-view SVG: ASCII only, no invalid numbers, scales to iPhone and MacBook widths',()=>{
  const d=design({});
  for(const width of [100,280,340,390,760,1400]){
    const svg=G.buildSideViewSvg(d,{width});
    assert.ok(/^[\x00-\x7f]*$/.test(svg));
    assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
    const p=svgParts(svg);
    assert.equal(p.viewBox[0],Math.min(1000,Math.max(280,width)));
    assert.ok(p.viewBox[1]>=270 && p.viewBox[1]<=380,`height ${p.viewBox[1]}`);
    assert.match(svg,/role="img"/);
    const plotRight=p.viewBox[0]-16+0.01;
    p.tags('gt-ring').forEach((tag)=>{
      const x=Number(p.attr(tag,'x'))+3;
      assert.ok(x>=10-0.01 && x<=plotRight,`ring x ${x} at width ${width}`);
    });
  }
});

test('side-view SVG shows every guide, its ring height, its hit area and both measurements',()=>{
  const d=design({reductionCount:4});
  const svg=G.buildSideViewSvg(d,{width:420,number:(mm)=>mm.toFixed(0)});
  const p=svgParts(svg);
  assert.equal(p.tags('gt-ring').length,d.guides.length);
  assert.equal(p.tags('gt-hit').length,d.guides.length-1,'the tip-top is fixed so it has no drag target');
  assert.equal(p.tags('gt-guidelabel').length,d.guides.length);
  const geo=G.viewGeometry(d,420);
  d.guides.forEach((g)=>{
    const ring=p.tags('gt-ring').find((t)=>p.attr(t,'data-guide')===String(g.index));
    close(Number(p.attr(ring,'height')),g.idMm*geo.ky,0.01,`ring ${g.index} height scales with its ID`);
    close(Number(p.attr(ring,'y')),geo.padT+(g.heightMm-g.idMm/2-geo.yTop)*geo.ky,0.01,`ring ${g.index} y reflects its centre height`);
    close(Number(p.attr(ring,'x'))+3,geo.padL+(g.xMm-geo.x0)*geo.kx,0.01,`ring ${g.index} x`);
  });
  // Labels that would collide are dropped from the picture (the guide table lists every value), the rest are exact.
  const tipLabels=d.guides.map((g)=>g.fromTipMm.toFixed(0));
  const buttLabels=d.guides.map((g)=>g.fromButtMm.toFixed(0));
  p.texts('gt-tip').forEach((text)=>assert.ok(tipLabels.includes(text),`tip label ${text}`));
  p.texts('gt-butt').forEach((text)=>assert.ok(buttLabels.includes(text),`butt label ${text}`));
  assert.equal(p.tags('gt-tick').length,d.guides.length*2,'every guide has a tick on both rulers');
  const wide=svgParts(G.buildSideViewSvg(design({reductionCount:3}),{width:1000,number:(mm)=>mm.toFixed(0)}));
  const wideDesign=design({reductionCount:3});
  assert.deepEqual(wide.texts('gt-tip'),wideDesign.guides.map((g)=>g.fromTipMm.toFixed(0)),'room for every label on a wide screen');
  assert.deepEqual(wide.texts('gt-butt'),wideDesign.guides.map((g)=>g.fromButtMm.toFixed(0)));
  assert.deepEqual(p.texts('gt-guidelabel'),['S','1','2','3','4','T']);
  assert.equal(p.tags('gt-envelope').length,1);
  assert.equal(p.tags('gt-spool').length,1);
  assert.equal(p.tags('gt-choke').length,1);
  assert.match(svg,/From butt/);assert.match(svg,/From tip/);assert.match(svg,/Vertical scale exaggerated/);
  assert.doesNotMatch(svg,/Vertical x\d/);
});

test('ruler labels never overlap, at any width or guide count',()=>{
  const widthOf=(text)=>String(text).length*5.4+6;
  for(const count of [1,3,5,8,12]){
    for(const width of [280,340,390,760]){
      const d=design({reductionCount:count});
      if(!d.ok)continue;
      const svg=G.buildSideViewSvg(d,{width,number:(mm)=>mm.toFixed(0)});
      for(const cls of ['gt-butt','gt-tip']){
        const labels=[...svg.matchAll(new RegExp(`<text class="${cls}"[^>]*x="([\\d.]+)" y="([\\d.]+)"[^>]*>([^<]*)</text>`,'g'))]
          .map((m)=>({x:Number(m[1]),y:Number(m[2]),text:m[3]}));
        assert.ok(labels.length>=2,`${cls} keeps at least the stripper and tip-top labels (count ${count}, width ${width})`);
        for(let i=0;i<labels.length;i+=1){
          for(let j=i+1;j<labels.length;j+=1){
            if(labels[i].y!==labels[j].y)continue;
            const gap=Math.abs(labels[i].x-labels[j].x)-(widthOf(labels[i].text)+widthOf(labels[j].text))/2;
            assert.ok(gap>=-0.01,`${cls} labels ${labels[i].text}/${labels[j].text} overlap by ${-gap} (count ${count}, width ${width})`);
          }
        }
      }
    }
  }
  const lanes=G.assignLanes([{x:10,text:'100'},{x:12,text:'200'},{x:14,text:'300'},{x:16,text:'400'}],3);
  assert.deepEqual(lanes,[0,1,2,-1],'a label that fits no lane is dropped');
  assert.deepEqual(G.assignLanes([{x:10,text:'1'},{x:200,text:'2'}],3),[0,0]);
});

test('drag zones never overlap and each contains its own guide, however crowded the guides are',()=>{
  for(const count of [1,3,5,8,12]){
    for(const width of [280,340,390,760]){
      const d=design({reductionCount:count});
      if(!d.ok)continue;
      const svg=G.buildSideViewSvg(d,{width});
      const zones=[...svg.matchAll(/<rect class="gt-hit" data-guide="(\d+)" x="([\d.]+)" y="[\d.-]+" width="([\d.]+)"/g)]
        .map((m)=>({index:Number(m[1]),left:Number(m[2]),right:Number(m[2])+Number(m[3])}));
      assert.equal(zones.length,d.guides.length-1);
      const geo=G.viewGeometry(d,width);
      zones.forEach((zone,i)=>{
        const gx=geo.padL+(d.guides[zone.index].xMm-geo.x0)*geo.kx;
        assert.ok(zone.left<=gx+0.02 && zone.right>=gx-0.02,`zone ${zone.index} contains its guide (count ${count}, width ${width})`);
        assert.ok(zone.right-zone.left<=28.02,'no wider than 28 units');
        if(i>0)assert.ok(zones[i-1].right<=zone.left+0.02,`zones ${zones[i-1].index} and ${zone.index} overlap (count ${count}, width ${width})`);
      });
    }
  }
});

test('side-view SVG: pointer positions convert back to millimetres exactly',()=>{
  const d=design({});
  const svg=G.buildSideViewSvg(d,{width:390});
  const p=svgParts(svg);
  const meta={x0:Number(p.attr(svg,'data-gt-x0')),padL:Number(p.attr(svg,'data-gt-padl')),kx:Number(p.attr(svg,'data-gt-kx')),span:Number(p.attr(svg,'data-gt-span')),plotW:Number(p.attr(svg,'data-gt-plotw'))};
  const geo=G.viewGeometry(d,390);
  d.guides.forEach((g)=>{
    const svgX=geo.padL+(g.xMm-geo.x0)*geo.kx;
    close(G.viewXToMm(geo,svgX),g.xMm,1e-9);
    close(G.viewXToMm({...meta},svgX),g.xMm,0.02,'via the attributes written to the SVG');
  });
  close(G.viewXToMm(geo,geo.padL+geo.plotW),base.rodLengthMm,1e-9,'right edge of the plot is the tip');
});

test('side-view SVG: selection, warnings and moved-guide markers',()=>{
  const d=G.designGuideTrain({...base,guides:[null,{positionMm:1010},{positionMm:design({}).guides[2].xMm,idMm:9}]});
  const p=svgParts(G.buildSideViewSvg(d,{width:340,selectedIndex:2}));
  assert.ok(p.tags('gt-ring').some((t)=>/gt-ring--selected/.test(t) && p.attr(t,'data-guide')==='2'));
  assert.ok(p.tags('gt-ring').some((t)=>/gt-ring--warn/.test(t) && p.attr(t,'data-guide')==='2'),'a ring that is too small is flagged');
  assert.deepEqual(p.tags('gt-proposed').map((t)=>p.attr(t,'data-guide')),['1','2'],'each moved guide shows its proposed position');
  const none=svgParts(G.buildSideViewSvg(design({}),{width:340}));
  assert.equal(none.tags('gt-proposed').length,0);
  assert.equal(none.tags('gt-ring').filter((t)=>/gt-ring--selected/.test(t)).length,0);
  const beyond=svgParts(G.buildSideViewSvg(design({flareAngleDeg:0.4}),{width:340}));
  assert.equal(beyond.tags('gt-choke').length,0,'no choke marker when the choke is beyond the tip');
});

test('the engine does not mutate its input, is deterministic, and never depends on other tools',()=>{
  const input={...base,guides:[null,{positionMm:1000,idMm:20}]};
  const before=JSON.stringify(input);
  const a=G.designGuideTrain(input),b=G.designGuideTrain(input);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(a,b);
  const source=fs.readFileSync(path.join(__dirname,'..','js','guide-train.js'),'utf8');
  assert.doesNotMatch(source,/calcGuideLayout|guideSpecification|localStorage|Store\.|fetch\(|supabase|document\.|window\./i);
});

test('method text documents the model honestly: assumptions, limits, no proprietary names or performance claims',()=>{
  const all=[...G.METHOD_STEPS,...G.ASSUMPTIONS,...G.LIMITATIONS];
  assert.ok(G.METHOD_STEPS.length>=6 && G.ASSUMPTIONS.length>=4 && G.LIMITATIONS.length>=3);
  all.forEach((line)=>assert.ok(/^[\x00-\x7f]*$/.test(line)));
  const text=all.join('\n');
  assert.match(text,/not physically validated/i);
  assert.match(text,/Geometry only/);
  assert.match(text,/assumptions you can edit/);
  assert.doesNotMatch(text,/\b(Fuji|KR|proven|guaranteed|optimal|best|perfect)\b/i);
  const source=fs.readFileSync(path.join(__dirname,'..','js','guide-train.js'),'utf8');
  assert.doesNotMatch(source.replace(/does not copy[^.]*\./i,''),/\bFuji\b/i);
  assert.match(source,/GEOMETRIC CHOKE/);
  assert.match(source,/LIMITATIONS/);
});
