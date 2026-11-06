const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const G=require('../js/guide-train.js');

const base={...G.DEFAULTS};
const design=(overrides,fmt)=>G.designGuideTrain({...base,...overrides},fmt);
const close=(actual,expected,tolerance,label)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label||'value'}: ${actual} vs ${expected} (+/-${tolerance})`);
const code=(result)=>result.errors.map((e)=>e.code);
const warnCodes=(result)=>result.warnings.map((w)=>w.code);
const roles=(d)=>d.guides.map((g)=>g.role);
const gapsOf=(d)=>d.guides.slice(1).map((g,i)=>g.xMm-d.guides[i].xMm);
const sum=(list)=>list.reduce((a,b)=>a+b,0);

// Independent restatement of the documented progression: G_k = G_1 * q^(k-1), summing to the span.
function expectedGaps(span,count,q){
  const n=count+1;
  const first=q===1?span/n:span*(1-q)/(1-Math.pow(q,n));
  return Array.from({length:n},(_,k)=>first*Math.pow(q,k));
}

test('defaults ask for a complete train: stripper, reduction guides, running guides and the tip-top',()=>{
  assert.equal(base.runnerCount,4);
  assert.equal(base.runnerRatio,0.85);
  assert.equal(base.runnerMinGapMm,50);
  const d=design({});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.deepEqual(d.warnings,[]);
  assert.deepEqual(roles(d),['stripper','reduction','reduction','reduction','reduction','choke','runner','runner','runner','runner','tip-top']);
  assert.equal(d.summary.reductionCount,5);
  assert.equal(d.summary.runnerCount,4);
  assert.deepEqual(d.guides.map((g)=>g.label),['Stripper','Guide 1','Guide 2','Guide 3','Guide 4','Guide 5 (choke)','Runner 1','Runner 2','Runner 3','Runner 4','Tip-top']);
  d.guides.forEach((g,i)=>assert.equal(g.index,i));
});

test('default sequence: the documented positions measured from the tip',()=>{
  const d=design({});
  const fromTip=d.guides.map((g)=>Math.round(g.fromTipMm*10)/10);
  assert.deepEqual(fromTip,[1264.5,1126.5,1030.1,962.7,915.6,882.7,644.7,442.4,270.4,124.2,0]);
  d.guides.forEach((g)=>close(g.fromTipMm+g.fromButtMm,base.rodLengthMm,1e-9,'from tip + from butt'));
  assert.deepEqual(d.guides.slice(6,10).map((g)=>g.idMm),[5,5,5,5]);
  d.guides.forEach((g)=>assert.equal(g.fits,true,g.label));
});

test('Phase 1 behaviour is preserved: with no runners the output is the Phase 1 design',()=>{
  const d=design({runnerCount:0});
  assert.deepEqual(roles(d),['stripper','reduction','reduction','reduction','reduction','choke','tip-top']);
  assert.deepEqual(d.guides.map((g)=>Math.round(g.xMm*100)/100),[865.51,1003.48,1099.9,1167.28,1214.36,1247.27,2130]);
  assert.deepEqual(d.guides.map((g)=>g.idMm),[30,21,15,10.5,7.5,5,5]);
  assert.deepEqual(d.guides.map((g)=>Math.round(g.heightMm*100)/100),[36,32.51,30.07,28.36,27.17,26.34,4]);
  assert.equal(d.guides[5].label,'Guide 5 (choke)');
  assert.equal(d.summary.runnerCount,0);
  assert.equal(d.summary.lastRunnerFromTipMm,null);
  assert.equal(design({runnerCount:0,runnerRatio:0.6,runnerMinGapMm:200}).guides.map((g)=>g.xMm).join(),d.guides.map((g)=>g.xMm).join(),'runner settings have no effect without runners');
});

test('adding runners leaves the reduction train, choke and line path exactly as calculated without them',()=>{
  for(const overrides of [{},{reductionCount:3},{reductionCount:8,rodLengthMm:2400},{flareAngleDeg:2},{spoolDiameterMm:46,stripperIdMm:34},{reelAngleDeg:1.5}]){
    const without=design({...overrides,runnerCount:0});
    for(const runnerCount of [1,4,9]){
      const withRunners=design({...overrides,runnerCount});
      assert.equal(withRunners.ok,true,JSON.stringify(withRunners.errors));
      const k=without.summary.reductionCount+1;
      for(let i=0;i<k;i+=1){
        const a=without.guides[i],b=withRunners.guides[i];
        for(const key of ['role','xMm','idMm','heightMm','sMm','requiredIdMm','envelopeMm','marginMm','fits','fromTipMm']){
          assert.equal(b[key],a[key],`${overrides && JSON.stringify(overrides)} runners ${runnerCount} guide ${i} ${key}`);
        }
      }
      assert.equal(withRunners.summary.chokeFromTipMm,without.summary.chokeFromTipMm);
      assert.equal(withRunners.summary.reductionRatio,without.summary.reductionRatio);
      assert.equal(withRunners.summary.coneLengthMm,without.summary.coneLengthMm);
      assert.equal(withRunners.summary.stripperFromTipMm,without.summary.stripperFromTipMm);
      assert.equal(withRunners.guides[withRunners.guides.length-1].role,'tip-top');
      assert.equal(withRunners.guides[withRunners.guides.length-1].xMm,without.guides[without.guides.length-1].xMm);
      assert.equal(withRunners.guides[withRunners.guides.length-1].heightMm,without.guides[without.guides.length-1].heightMm);
    }
  }
});

test('runners sit strictly between the choke guide and the tip-top, in order, at any count',()=>{
  for(let runnerCount=0;runnerCount<=12;runnerCount+=1){
    const d=design({runnerCount});
    assert.equal(d.ok,true,`${runnerCount}: ${JSON.stringify(d.errors)}`);
    assert.equal(d.guides.length,5+runnerCount+2);
    d.guides.slice(1).forEach((g,i)=>assert.ok(g.xMm>d.guides[i].xMm,`order at ${runnerCount} runners, guide ${g.index}`));
    const choke=d.guides.find((g)=>g.role==='choke');
    d.guides.filter((g)=>g.role==='runner').forEach((g)=>{
      assert.ok(g.xMm>choke.xMm && g.xMm<base.rodLengthMm);
      assert.equal(g.label,`Runner ${g.index-choke.index}`);
    });
  }
});

test('spacing progression: gaps follow the documented geometric ratio and add up to the span',()=>{
  for(const q of [0.6,0.75,0.85,1,1.2]){
    for(const runnerCount of [1,2,4,6]){
      const d=design({runnerCount,runnerRatio:q,runnerMinGapMm:10});
      assert.equal(d.ok,true);
      const choke=d.guides.find((g)=>g.role==='choke');
      const span=base.rodLengthMm-choke.xMm;
      const gaps=gapsOf(d).slice(choke.index);
      const want=expectedGaps(span,runnerCount,q);
      assert.equal(gaps.length,runnerCount+1);
      close(sum(gaps),span,1e-9,'gaps add up to the span');
      gaps.forEach((gap,i)=>close(gap,want[i],1e-7,`gap ${i} for q=${q}, ${runnerCount} runners`));
      for(let i=1;i<gaps.length;i+=1)close(gaps[i]/gaps[i-1],q,1e-9,'constant ratio');
      assert.deepEqual(d.summary.runnerGapsMm.map((x)=>Math.round(x*1e6)),gaps.map((x)=>Math.round(x*1e6)));
      close(d.summary.runnerSpanMm,span,1e-9);
    }
  }
  const even=design({runnerRatio:1,runnerMinGapMm:10});
  const evenGaps=gapsOf(even).slice(5);
  evenGaps.forEach((gap)=>close(gap,evenGaps[0],1e-9,'ratio 1 gives equal spacing'));
  const packed=gapsOf(design({runnerRatio:0.7})).slice(5);
  for(let i=1;i<packed.length;i+=1)assert.ok(packed[i]<packed[i-1],'ratio below 1 packs the runners toward the tip');
  const spread=gapsOf(design({runnerRatio:1.2})).slice(5);
  for(let i=1;i<spread.length;i+=1)assert.ok(spread[i]>spread[i-1],'ratio above 1 opens them up toward the tip');
});

test('planRunnerGaps is the same documented progression, exposed for inspection',()=>{
  const plan=G.planRunnerGaps(900,4,0.85,50);
  assert.equal(plan.tipGapRaised,false);
  plan.gaps.forEach((gap,i)=>close(gap,expectedGaps(900,4,0.85)[i],1e-9));
  assert.deepEqual(G.planRunnerGaps(500,0,0.85,50).gaps,[500],'no runners: one gap from the choke guide to the tip-top');
});

test('the last runner keeps a practical distance from the tip-top',()=>{
  const d=design({});
  assert.ok(d.summary.lastRunnerFromTipMm>=base.runnerMinGapMm);
  close(d.summary.lastRunnerFromTipMm,124.2,0.05);
  assert.equal(d.summary.runnerTipGapRaised,false);
  // A steep progression would put the last runner almost on the tip-top; the minimum gap lifts it and the others share the rest.
  const steep=design({runnerCount:8,runnerRatio:0.5,runnerMinGapMm:60});
  assert.equal(steep.ok,true,JSON.stringify(steep.errors));
  assert.equal(steep.summary.runnerTipGapRaised,true);
  close(steep.summary.lastRunnerFromTipMm,60,1e-9,'last runner to tip-top is exactly the minimum gap');
  const choke=steep.guides.find((g)=>g.role==='choke');
  const gaps=gapsOf(steep).slice(choke.index);
  close(sum(gaps),base.rodLengthMm-choke.xMm,1e-9);
  for(let i=1;i<gaps.length-1;i+=1)close(gaps[i]/gaps[i-1],0.5,1e-9,'the other gaps keep the ratio');
  const lifted=design({runnerCount:4,runnerRatio:0.7,runnerMinGapMm:100});
  assert.equal(lifted.summary.runnerTipGapRaised,true);
  close(lifted.summary.lastRunnerFromTipMm,100,1e-9);
  assert.deepEqual(warnCodes(lifted),[],'a raised last gap that leaves every gap at or above the minimum raises no warning');
  // Raising the minimum raises the distance, at any rod length.
  for(const rodLengthMm of [1800,2130,2400,2700]){
    const spoolLipMm=rodLengthMm*560/2130;
    for(const minimum of [30,80,150]){
      const result=design({rodLengthMm,spoolLipMm,runnerMinGapMm:minimum});
      assert.equal(result.ok,true,JSON.stringify(result.errors));
      assert.ok(result.summary.lastRunnerFromTipMm>=minimum-1e-9,`rod ${rodLengthMm} min ${minimum}: ${result.summary.lastRunnerFromTipMm}`);
    }
  }
});

test('different rod lengths and reduction counts: runners always fit the available span',()=>{
  for(const rodLengthMm of [1800,2130,2400,2700]){
    for(const reductionCount of [3,5,7]){
      const d=design({rodLengthMm,spoolLipMm:rodLengthMm*560/2130,reductionCount});
      assert.equal(d.ok,true,JSON.stringify(d.errors));
      const choke=d.guides.find((g)=>g.role==='choke');
      assert.equal(d.guides.length,reductionCount+4+2);
      assert.equal(d.summary.reductionCount,reductionCount);
      close(d.summary.runnerSpanMm,rodLengthMm-choke.xMm,1e-9);
      assert.ok(d.guides.filter((g)=>g.role==='runner').every((g)=>g.xMm>choke.xMm && g.xMm<rodLengthMm));
      assert.deepEqual(warnCodes(d).filter((c)=>c==='runner-gap-tight'),[]);
    }
  }
});

test('a longer rod gives longer runner gaps for the same settings (scaling)',()=>{
  const short=design({rodLengthMm:2000,spoolLipMm:560});
  const long=design({rodLengthMm:2400,spoolLipMm:560});
  assert.ok(long.summary.runnerSpanMm>short.summary.runnerSpanMm);
  long.summary.runnerGapsMm.forEach((gap,i)=>assert.ok(gap>short.summary.runnerGapsMm[i]));
});

test('runner ring sizes are the computed minimum for the line envelope, rounded up to 0.5 mm',()=>{
  const d=design({runnerCount:6});
  d.guides.filter((g)=>g.role==='runner').forEach((g)=>{
    const minimum=g.envelopeMm*d.params.fit;
    assert.ok(g.idMm>=minimum-1e-9 && g.idMm<minimum+0.5+1e-9,`${g.label} ${g.idMm} vs ${minimum}`);
    assert.equal(g.idMm*2,Math.round(g.idMm*2));
    close(g.requiredIdMm,minimum,1e-9);
    assert.equal(g.fits,true);
  });
  const choke=d.guides.find((g)=>g.role==='choke');
  d.guides.filter((g)=>g.role==='runner').forEach((g)=>assert.ok(g.idMm<=choke.idMm));
});

test('runners are physical guides: one shared ring and centre height, never fitted to the line path',()=>{
  const d=design({});
  const runners=d.guides.filter((g)=>g.role==='runner');
  assert.equal(runners.length,4);
  runners.forEach((g)=>{
    assert.equal(g.idMm,base.runnerIdMm,`${g.label} ring size`);
    assert.equal(g.centreHeightMm,base.runnerCentreHeightMm,`${g.label} centre height`);
    close(g.heightMm,G.bladeRadius(d.input,g.xMm)+base.runnerCentreHeightMm,1e-9,`${g.label} axis height follows the taper`);
  });
});

test('edits: runner position, ring size and height recalculate and the proposal is kept for reset',()=>{
  const ref=design({});
  const r2=ref.guides[7];
  const edited=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,null,{positionMm:r2.xMm+20,idMm:7,centreHeightMm:r2.centreHeightMm+2}]});
  assert.equal(edited.ok,true,JSON.stringify(edited.errors));
  const g=edited.guides[7];
  assert.equal(g.label,'Runner 2');
  close(g.xMm,r2.xMm+20,1e-9);
  assert.equal(g.idMm,7);
  close(g.centreHeightMm,r2.centreHeightMm+2,1e-9);
  assert.equal(g.moved,true);
  close(g.proposed.xMm,r2.xMm,1e-9,'proposal kept');
  assert.equal(g.proposed.idMm,7,'the measured ring size is the constraint the proposal is built around');
  close(g.fromTipMm,base.rodLengthMm-(r2.xMm+20),1e-9);
  edited.guides.forEach((other,i)=>{if(i!==7)assert.equal(other.xMm,ref.guides[i].xMm,`guide ${i} unchanged`);});
  // Removing the overrides is the reset: the design returns to the proposal exactly.
  const reset=G.designGuideTrain({...base,guides:[]});
  assert.equal(JSON.stringify(reset.guides.map((x)=>[x.xMm,x.idMm,x.heightMm])),JSON.stringify(ref.guides.map((x)=>[x.xMm,x.idMm,x.heightMm])));
  // The tip-top position stays at the tip whatever is sent for it; its ring and height may be measured.
  const tip=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,null,null,null,null,{positionMm:5,idMm:6,centreHeightMm:3.5}]});
  assert.equal(tip.ok,true,JSON.stringify(tip.errors));
  assert.equal(tip.guides[10].xMm,base.rodLengthMm);
  assert.equal(tip.guides[10].idMm,6);
  assert.equal(tip.guides[10].centreHeightMm,3.5);
});

test('validation: guides must stay in order and keep the minimum gap, so rings never overlap',()=>{
  const ref=design({});
  const at=(index,positionMm)=>{const guides=[];guides[index]=positionMm===null?null:{positionMm};return G.designGuideTrain({...base,guides});};
  // order
  const behind=at(7,ref.guides[6].xMm-5);
  assert.equal(behind.ok,false);
  assert.ok(code(behind).includes('guide-order'));
  assert.match(behind.errors.find((e)=>e.code==='guide-order').message,/Runner 2 must sit closer to the tip than Runner 1/);
  // too close to a neighbour
  const close1=at(7,ref.guides[6].xMm+30);
  assert.equal(close1.ok,false);
  assert.deepEqual(code(close1),['runner-too-close']);
  assert.match(close1.errors[0].message,/Runner 1 and Runner 2 are too close\. Keep running guides at least 50 mm apart/);
  assert.equal(close1.errors[0].field,'guide7.positionMm');
  const closeNext=at(7,ref.guides[8].xMm-30);
  assert.deepEqual(code(closeNext),['runner-too-close']);
  // exactly the minimum gap is allowed
  assert.equal(at(7,ref.guides[6].xMm+50).ok,true);
  assert.equal(at(7,ref.guides[8].xMm-50).ok,true);
  // last runner and the tip-top
  const nearTip=at(9,base.rodLengthMm-30);
  assert.deepEqual(code(nearTip),['runner-too-close']);
  assert.match(nearTip.errors[0].message,/Runner 4 must stay at least 50 mm from the tip-top/);
  assert.equal(at(9,base.rodLengthMm-50).ok,true);
  // beyond the tip, behind the reel
  assert.ok(code(at(9,base.rodLengthMm+5)).includes('guide-beyond-tip'));
  assert.ok(code(at(6,100)).some((c)=>c==='guide-before-reel' || c==='guide-order'));
  // a reduction guide dragged against the first runner is held to the same gap
  const choke=at(5,ref.guides[6].xMm-20);
  assert.deepEqual(code(choke),['runner-too-close']);
  assert.match(choke.errors[0].message,/Guide 5 \(choke\) and Runner 1 are too close/);
  assert.equal(at(5,ref.guides[6].xMm-50).ok,true);
  // moving a reduction guide that is not next to a runner is unaffected by the runner rule (Phase 1 behaviour)
  assert.equal(at(4,ref.guides[5].xMm-1).ok,true);
  // invalid and out-of-range runner values
  const bad=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,{idMm:0.2,centreHeightMm:-3}]});
  assert.deepEqual(code(bad).sort(),['guide-range','guide-range']);
  assert.ok(bad.errors.every((e)=>/^Runner 1:/.test(e.message)));
  const notNumber=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,{idMm:'x'}]});
  assert.deepEqual(code(notNumber),['guide-invalid']);
});

test('validation: running guide settings are checked like every other measurement',()=>{
  for(const key of ['runnerCount','runnerRatio','runnerMinGapMm']){
    for(const bad of [null,undefined,'']){
      const e=design({[key]:bad}).errors.find((x)=>x.field===key);
      assert.ok(e && e.code==='missing' && e.message.startsWith('Enter the '),`${key} ${bad}`);
    }
    for(const bad of [NaN,Infinity,'4']){
      const e=design({[key]:bad}).errors.find((x)=>x.field===key);
      assert.ok(e && e.code==='invalid',`${key} ${bad}`);
    }
  }
  assert.ok(code(design({runnerCount:-1})).includes('range'));
  assert.ok(code(design({runnerCount:13})).includes('range'));
  assert.ok(code(design({runnerCount:2.5})).includes('range'));
  assert.match(design({runnerCount:13}).errors.find((e)=>e.field==='runnerCount').message,/between 0 and 12/);
  assert.match(design({runnerRatio:0.4}).errors.find((e)=>e.field==='runnerRatio').message,/between 0\.5 and 1\.5/);
  assert.ok(code(design({runnerRatio:1.6})).includes('range'));
  assert.ok(code(design({runnerMinGapMm:5})).includes('range'));
  assert.ok(code(design({runnerMinGapMm:400})).includes('range'));
  assert.equal(design({runnerCount:0}).ok,true);
  assert.equal(design({runnerCount:12}).ok,true);
});

test('validation: a span too short for the runners is warned about, never silently overlapped',()=>{
  const crowded=design({runnerCount:12,runnerMinGapMm:150});
  assert.equal(crowded.ok,true);
  assert.ok(warnCodes(crowded).includes('runner-gap-tight'));
  assert.ok(crowded.warnings.find((w)=>w.code==='runner-gap-tight').message.includes('minimum gap'));
  crowded.guides.slice(1).forEach((g,i)=>assert.ok(g.xMm>crowded.guides[i].xMm,'still in order'));
  const compressed=design({flareAngleDeg:0.4});
  assert.equal(compressed.ok,true,JSON.stringify(compressed.errors));
  assert.ok(warnCodes(compressed).includes('choke-beyond-tip'));
  assert.ok(warnCodes(compressed).includes('runner-gap-tight'),'no room for runners when the chain is compressed');
});

test('a runner ring that is too small or larger than the one before it is reported',()=>{
  const small=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,null,{idMm:3}]});
  assert.equal(small.ok,true);
  assert.ok(warnCodes(small).includes('ring-too-small'));
  assert.equal(small.guides[7].fits,false);
  assert.match(small.warnings.find((w)=>w.code==='ring-too-small').message,/^Runner 2:/);
  const bigger=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,null,{idMm:9}]});
  assert.ok(warnCodes(bigger).includes('id-not-reducing'),'runner larger than the one before it');
  const overlap=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,null,null,{centreHeightMm:0.5}]});
  assert.ok(warnCodes(overlap).includes('ring-overlaps-blank'));
});

test('blank clearance is still exact with runners: reported minimum matches a brute-force scan',()=>{
  for(const guides of [[],[null,null,null,null,null,null,{centreHeightMm:20}],[null,null,null,null,null,null,null,null,null,{centreHeightMm:2.5}]]){
    const d=G.designGuideTrain({...base,guides});
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    const v=d.input;
    const arcs=[0,...d.guides.map((g)=>g.sMm)];
    let minimum=Infinity;
    for(let i=0;i<=4000;i+=1){
      const s=d.summary.pathLengthMm*i/4000;
      let j=0;
      while(j<arcs.length-2 && arcs[j+1]<s)j+=1;
      const t=(s-arcs[j])/(arcs[j+1]-arcs[j]);
      const x=d.path[j].xMm+(d.path[j+1].xMm-d.path[j].xMm)*t;
      const y=d.path[j].yMm+(d.path[j+1].yMm-d.path[j].yMm)*t;
      const cosPsi=(d.path[j+1].xMm-d.path[j].xMm)/Math.hypot(d.path[j+1].xMm-d.path[j].xMm,d.path[j+1].yMm-d.path[j].yMm);
      minimum=Math.min(minimum,(y-(G.buildModel(v).envelope(s)/2)/cosPsi)-G.bladeRadius(v,x));
    }
    assert.ok(d.summary.minBlankClearanceMm<=minimum+1e-6);
    assert.ok(minimum-d.summary.minBlankClearanceMm<0.05);
  }
});

test('scaling every length uniformly scales runner positions, and messages follow the unit formatter',()=>{
  const k=1.1;
  const lengths=['rodLengthMm','buttOdMm','tipOdMm','spoolLipMm','spoolDiameterMm','reelHeightMm','stripperIdMm','tipTopIdMm','tipTopCentreHeightMm','settledLineMm','runnerMinGapMm','runnerIdMm','runnerCentreHeightMm'];
  const scaled={...base};
  lengths.forEach((key)=>{scaled[key]=base[key]*k;});
  const a=design({}),b=G.designGuideTrain(scaled);
  assert.equal(b.ok,true,JSON.stringify(b.errors));
  a.guides.forEach((g,i)=>{
    close(b.guides[i].xMm,g.xMm*k,1e-6,`guide ${i} position`);
    close(b.guides[i].heightMm,g.heightMm*k,1e-6,`guide ${i} height`);
  });
  close(b.summary.lastRunnerFromTipMm,a.summary.lastRunnerFromTipMm*k,1e-6);
  assert.equal(b.guides[8].label,'Runner 3');
  const inches=G.designGuideTrain({...base},{length:(mm)=>`${(mm/25.4).toFixed(2)} in`,degrees:(d)=>`${d} deg`});
  assert.equal(inches.ok,true);
  const warned=G.designGuideTrain({...base,runnerCount:12,runnerMinGapMm:150},{length:(mm)=>`${(mm/25.4).toFixed(2)} in`,degrees:(d)=>`${d} deg`});
  assert.match(warned.warnings.find((w)=>w.code==='runner-gap-tight').message,/5\.91 in minimum gap/);
});

function svgParts(svg){
  const attr=(tag,name)=>{const m=tag.match(new RegExp(`${name}="([^"]*)"`));return m?m[1]:null;};
  const tags=(cls)=>svg.match(new RegExp(`<[a-z]+ class="${cls}[ "][^>]*>`,'g'))||[];
  const texts=(cls)=>[...svg.matchAll(new RegExp(`<text class="${cls}"[^>]*>([^<]*)</text>`,'g'))].map((m)=>m[1]);
  return {attr,tags,texts};
}

test('diagram: every guide is drawn, runners are labelled and styled apart from reduction guides',()=>{
  const d=design({});
  const svg=G.buildSideViewSvg(d,{width:420,number:(mm)=>mm.toFixed(0)});
  const p=svgParts(svg);
  assert.ok(/^[\x00-\x7f]*$/.test(svg));
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  assert.equal(p.tags('gt-ring').length,11);
  assert.deepEqual(p.texts('gt-guidelabel'),['S','1','2','3','4','5','R1','R2','R3','R4','T']);
  const runnerRings=p.tags('gt-ring').filter((t)=>/gt-ring--runner/.test(t));
  assert.deepEqual(runnerRings.map((t)=>p.attr(t,'data-guide')),['6','7','8','9']);
  const reductionRings=p.tags('gt-ring').filter((t)=>!/gt-ring--runner/.test(t));
  assert.equal(reductionRings.length,7);
  const colours=new Set(runnerRings.map((t)=>p.attr(t,'stroke')));
  const reductionColours=new Set(reductionRings.map((t)=>p.attr(t,'stroke')));
  assert.equal(colours.size,1);
  assert.ok(![...colours].some((c)=>reductionColours.has(c)),'runner ring colour differs from the reduction ring colour');
  assert.equal(p.tags('gt-legend').length,1);
  assert.match(svg,/>Reduction</);assert.match(svg,/>Runner</);
  assert.match(svg,/aria-label="Side view of the guide train: 5 reduction guides and 4 running guides between the stripper and the tip-top/);
  assert.equal(p.tags('gt-hit').length,10,'drag target for every guide except the tip-top');
  assert.equal(p.tags('gt-choke').length,1);
  const none=svgParts(G.buildSideViewSvg(design({runnerCount:0}),{width:420}));
  assert.equal(none.tags('gt-legend').length,0,'no legend without runners');
  assert.equal(none.tags('gt-ring').filter((t)=>/gt-ring--runner/.test(t)).length,0);
  assert.match(G.buildSideViewSvg(design({runnerCount:0}),{width:420}),/aria-label="Side view of the guide train: 5 reduction guides between/);
});

test('diagram agrees with the guide table: positions, heights, ring sizes and both rulers',()=>{
  const d=design({runnerCount:6});
  const svg=G.buildSideViewSvg(d,{width:760,number:(mm)=>mm.toFixed(0)});
  const p=svgParts(svg);
  const geo=G.viewGeometry(d,760);
  d.guides.forEach((g)=>{
    const ring=p.tags('gt-ring').find((t)=>p.attr(t,'data-guide')===String(g.index));
    close(Number(p.attr(ring,'x'))+3,geo.padL+(g.xMm-geo.x0)*geo.kx,0.01,`${g.label} x`);
    close(Number(p.attr(ring,'y')),geo.padT+(g.heightMm-g.idMm/2-geo.yTop)*geo.ky,0.01,`${g.label} y`);
    close(Number(p.attr(ring,'height')),g.idMm*geo.ky,0.01,`${g.label} ring size`);
  });
  assert.deepEqual(p.texts('gt-tip'),d.guides.map((g)=>g.fromTipMm.toFixed(0)),'room for every tip label on a wide screen');
  assert.deepEqual(p.texts('gt-butt'),d.guides.map((g)=>g.fromButtMm.toFixed(0)));
  assert.equal(p.tags('gt-tick').length,d.guides.length*2);
  assert.deepEqual(p.texts('gt-guidelabel').filter((t)=>/^R/.test(t)),['R1','R2','R3','R4','R5','R6']);
});

test('diagram: a dragged runner shows its proposed position, a selected runner is highlighted, and warnings are flagged',()=>{
  const ref=design({});
  const moved=G.designGuideTrain({...base,guides:[null,null,null,null,null,null,null,{positionMm:ref.guides[7].xMm+30,idMm:3}]});
  const p=svgParts(G.buildSideViewSvg(moved,{width:390,selectedIndex:7}));
  assert.equal(p.tags('gt-proposed').length,1);
  assert.equal(p.attr(p.tags('gt-proposed')[0],'data-guide'),'7');
  const selected=p.tags('gt-ring').filter((t)=>/gt-ring--selected/.test(t));
  assert.equal(selected.length,1);
  assert.equal(p.attr(selected[0],'data-guide'),'7');
  assert.ok(p.tags('gt-ring').some((t)=>/gt-ring--warn/.test(t) && p.attr(t,'data-guide')==='7'));
});

test('diagram: drag zones never overlap with runners, at any width or count, and labels never overlap',()=>{
  for(const runnerCount of [0,1,4,8,12]){
    for(const width of [280,340,390,760]){
      const d=design({runnerCount});
      if(!d.ok)continue;
      const svg=G.buildSideViewSvg(d,{width});
      const zones=[...svg.matchAll(/<rect class="gt-hit" data-guide="(\d+)" x="([\d.]+)" y="[\d.-]+" width="([\d.]+)"/g)]
        .map((m)=>({index:Number(m[1]),left:Number(m[2]),right:Number(m[2])+Number(m[3])}));
      assert.equal(zones.length,d.guides.length-1);
      const geo=G.viewGeometry(d,width);
      zones.forEach((zone,i)=>{
        const gx=geo.padL+(d.guides[zone.index].xMm-geo.x0)*geo.kx;
        assert.ok(zone.left<=gx+0.02 && zone.right>=gx-0.02,`zone ${zone.index} holds its guide`);
        if(i>0)assert.ok(zones[i-1].right<=zone.left+0.02,`zones ${zones[i-1].index} and ${zone.index} overlap (${runnerCount} runners, width ${width})`);
      });
      const p=svgParts(svg);
      assert.equal(p.tags('gt-ring').length,d.guides.length);
      assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
      assert.ok(/^[\x00-\x7f]*$/.test(svg));
      // the legend sits on the bottom row, clear of the "From tip" label and inside the picture
      if(runnerCount){
        const legend=svg.match(/class="gt-legend"[\s\S]*?<\/g>/)[0];
        const lx=Number(legend.match(/<circle class="gt-legend-reduction" cx="([\d.]+)"/)[1])-2.5;
        assert.ok(lx>10+8*5.4+4,`legend clear of the From tip label at width ${width}`);
        assert.ok(lx+106<geo.W-8,`legend inside the picture at width ${width}`);
        const legendY=Number(legend.match(/<text x="[\d.]+" y="([\d.]+)" fill="#e7dfd1">Reduction/)[1]);
        close(legendY,geo.H-6,0.01,'legend baseline shares the From tip row');
      }
    }
  }
});

test('labels: guideLabel names runners and stays Phase 1 compatible without a runner count',()=>{
  assert.equal(G.guideLabel(0,7),'Stripper');
  assert.equal(G.guideLabel(5,7),'Guide 5 (choke)');
  assert.equal(G.guideLabel(6,7),'Tip-top');
  assert.equal(G.guideLabel(5,11,4),'Guide 5 (choke)');
  assert.equal(G.guideLabel(6,11,4),'Runner 1');
  assert.equal(G.guideLabel(9,11,4),'Runner 4');
  assert.equal(G.guideLabel(10,11,4),'Tip-top');
  assert.equal(G.guideLabel(3,11,4),'Guide 3');
});

test('runner explanation is honest: provisional, adjustable, no universal-formula or validation claim',()=>{
  const all=[...G.METHOD_STEPS,...G.ASSUMPTIONS,...G.LIMITATIONS].join('\n');
  assert.match(all,/Running guides:/);
  assert.match(all,/adjustable starting progression, not a formula for the right positions/);
  assert.match(all,/provisional/i);
  assert.match(all,/static-load test/);
  assert.match(all,/blank/);
  assert.match(all,/not physically validated/i);
  assert.doesNotMatch(all,/\b(Fuji|KR|proven|guaranteed|optimal|best|perfect|ideal)\b/i);
  [...G.METHOD_STEPS,...G.ASSUMPTIONS,...G.LIMITATIONS].forEach((line)=>assert.ok(/^[\x00-\x7f]*$/.test(line)));
  const source=fs.readFileSync(path.join(__dirname,'..','js','guide-train.js'),'utf8');
  assert.match(source,/RUNNING GUIDES \(Phase 2, provisional proposal\)/);
  assert.match(source,/NO\s+universal formula/);
  assert.match(source,/static-load test/);
  assert.doesNotMatch(source,/calcGuideLayout|guideSpecification|localStorage|Store\.|fetch\(|supabase|document\.|window\./i);
});

test('the engine stays deterministic and does not mutate its input with runners',()=>{
  const input={...base,guides:[null,null,null,null,null,null,{positionMm:1500,idMm:6}]};
  const before=JSON.stringify(input);
  const a=G.designGuideTrain(input),b=G.designGuideTrain(input);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(a,b);
  assert.equal(a.modelVersion,2);
});
