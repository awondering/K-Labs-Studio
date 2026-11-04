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
const R=(x,v=base)=>G.bladeRadius(v,x);
const ref=design({});
const guidesWith=(entries)=>{const list=[];Object.keys(entries).forEach((index)=>{list[Number(index)]=entries[index];});for(let i=0;i<list.length;i+=1)if(list[i]===undefined)list[i]=null;return list;};
const withGuides=(entries,extra)=>G.designGuideTrain({...base,...(extra||{}),guides:guidesWith(entries)});

test('the illustrative default is unchanged: same positions, ring sizes and line path as before measured geometry existed',()=>{
  assert.equal(ref.ok,true,JSON.stringify(ref.errors));
  assert.deepEqual(ref.warnings,[]);
  assert.deepEqual(ref.guides.map((g)=>Math.round(g.fromTipMm*10)/10),[1264.5,1126.5,1030.1,962.7,915.6,882.7,644.7,442.4,270.4,124.2,0]);
  assert.deepEqual(ref.guides.map((g)=>g.idMm),[30,21,15,10.5,7.5,5,5,5,5,5,5]);
  assert.deepEqual(ref.guides.map((g)=>Math.round(g.heightMm*100)/100),[36,32.51,30.07,28.36,27.17,26.34,20.32,15.2,10.84,7.14,4]);
  assert.equal(ref.summary.mode,'illustrative');
  assert.equal(ref.summary.measuredCount,0);
  assert.equal(ref.summary.totalGuides,11);
  ref.guides.forEach((g)=>{
    assert.equal(g.source,'illustrative');
    assert.deepEqual(g.measured,{id:false,height:false});
    assert.equal(g.proposalSolved,true);
  });
});

test('the three measurements are separate, and the ring centre sits at blank radius + centre height above the blank',()=>{
  const cases=[{},{reductionCount:3,runnerCount:6},{buttOdMm:20,tipOdMm:4,rodLengthMm:2400,spoolLipMm:640},{reelAngleDeg:2}];
  cases.forEach((extra)=>{
    const d=design(extra);
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    d.guides.forEach((g)=>{
      close(g.heightMm,R(g.xMm,d.input)+g.centreHeightMm,1e-9,`${g.label}: axis height = r(x) + centre height`);
      if(g.ringTopClearanceMm!==null)close(g.ringTopClearanceMm,g.centreHeightMm-g.idMm/2,1e-9,`${g.label}: ring clearance = centre height - ID/2`);
      assert.ok(Number.isFinite(g.idMm) && Number.isFinite(g.centreHeightMm) && Number.isFinite(g.xMm));
    });
  });
  // The same guide on a thicker part of the blank sits higher above the axis but the same height above the blank.
  const a=G.designGuideTrain({...base,guides:guidesWith({3:{centreHeightMm:20,positionMm:1130}})});
  const b=G.designGuideTrain({...base,guides:guidesWith({3:{centreHeightMm:20,positionMm:1190}})});
  close(a.guides[3].centreHeightMm,20,1e-12);
  close(b.guides[3].centreHeightMm,20,1e-12);
  close(a.guides[3].heightMm-b.guides[3].heightMm,R(1130)-R(1190),1e-9,'axis height follows the taper');
  assert.ok(a.guides[3].heightMm>b.guides[3].heightMm);
});

test('moving an illustrative guide keeps its height above the blank, so the ring follows the taper instead of floating',()=>{
  const g=ref.guides[2];
  const moved=withGuides({2:{positionMm:g.xMm+60}});
  assert.equal(moved.ok,true,JSON.stringify(moved.errors));
  const m=moved.guides[2];
  assert.equal(m.moved,true);
  assert.equal(m.source,'illustrative','moving a guide does not make it measured');
  close(m.centreHeightMm,g.centreHeightMm,1e-9,'height above the blank is kept');
  close(m.heightMm,R(m.xMm)+g.centreHeightMm,1e-9);
  close(m.ringTopClearanceMm,g.ringTopClearanceMm,1e-9,'clearance to the blank does not change when it moves');
  // The proposal comparison still shows the original illustrative spot.
  close(m.proposed.xMm,g.xMm,1e-9);
  close(m.proposed.centreHeightMm,g.centreHeightMm,1e-9);
});

test('measured ring size and centre height are physical constraints: reported exactly as entered, never recalculated',()=>{
  const d=withGuides({2:{idMm:15,centreHeightMm:20},4:{idMm:8.2},8:{centreHeightMm:9.5}});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.equal(d.guides[2].idMm,15);
  assert.equal(d.guides[2].centreHeightMm,20);
  assert.deepEqual(d.guides[2].measured,{id:true,height:true});
  assert.equal(d.guides[4].idMm,8.2);
  assert.deepEqual(d.guides[4].measured,{id:true,height:false});
  assert.equal(d.guides[8].centreHeightMm,9.5);
  assert.deepEqual(d.guides[8].measured,{id:false,height:true});
  assert.equal(d.guides[2].source,'measured');
  assert.equal(d.guides[3].source,'illustrative');
  assert.equal(d.summary.mode,'mixed');
  assert.equal(d.summary.measuredCount,3);
  // The proposal itself carries the measured values, so a reset position never changes them.
  assert.equal(d.guides[2].proposed.idMm,15);
  close(d.guides[2].proposed.centreHeightMm,20,1e-12);
  // Moving a measured guide changes only its position.
  const dragged=withGuides({2:{idMm:15,centreHeightMm:20,positionMm:d.guides[2].xMm+25}});
  assert.equal(dragged.guides[2].idMm,15);
  assert.equal(dragged.guides[2].centreHeightMm,20);
  close(dragged.guides[2].heightMm,R(dragged.guides[2].xMm)+20,1e-9);
});

test('the solver for measured guides agrees with the closed-form illustrative proposal when the measurements equal it',()=>{
  const heights=ref.guides.map((g)=>({centreHeightMm:g.centreHeightMm}));
  const d=G.designGuideTrain({...base,guides:heights});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.deepEqual(d.warnings,[]);
  ref.guides.forEach((g,i)=>close(d.guides[i].xMm,g.xMm,1e-6,`${g.label} position`));
  assert.equal(d.summary.mode,'measured');
});

test('proposed positions are the first position where the fixed ring fits the line cone (independent check)',()=>{
  const m=G.buildModel(base);
  const cases=[{2:{idMm:15,centreHeightMm:20}},{1:{idMm:22,centreHeightMm:14},3:{idMm:10,centreHeightMm:12}},{3:{centreHeightMm:30}},{4:{idMm:9,centreHeightMm:16.5}}];
  cases.forEach((entries)=>{
    const d=withGuides(entries);
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    Object.keys(entries).forEach((key)=>{
      const i=Number(key);
      const g=d.guides[i];
      if(!entries[key].centreHeightMm)return;
      const prev=d.guides[i-1];
      const fitMargin=(x)=>{
        const y=R(x)+g.centreHeightMm;
        const s=prev.sMm+Math.hypot(x-prev.xMm,y-prev.heightMm);
        return g.proposed.targetIdMm-m.envelope(s)*m.fit;
      };
      assert.ok(fitMargin(g.xMm)>=-1e-6,`guide ${i} fits at its proposed position (margin ${fitMargin(g.xMm)})`);
      assert.ok(fitMargin(g.xMm-0.05)<0,`guide ${i} does not fit slightly nearer the reel (so this is the first fit)`);
      assert.equal(g.proposalSolved,true);
      assert.equal(g.fits,true);
    });
  });
});

test('measured ring size alone: a larger ring fits the cone earlier, a smaller one later, and later guides are recalculated around it',()=>{
  const at=(id)=>withGuides({2:{idMm:id}}).guides;
  const small=at(11),mid=at(15),large=at(19);
  assert.ok(large[2].xMm<mid[2].xMm && mid[2].xMm<small[2].xMm);
  assert.equal(small[2].fits,true);assert.equal(large[2].fits,true);
  // Guide 3 is illustrative: it is still placed by its own ring size, wherever guide 2 ended up.
  close(small[3].xMm,ref.guides[3].xMm,1e-6);
  close(large[3].xMm,ref.guides[3].xMm,1e-6);
});

test('a measured stripper is positioned for the ring fit including its offset from the reel axis',()=>{
  const d=withGuides({0:{idMm:30,centreHeightMm:30}});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  const s=d.guides[0];
  assert.equal(s.idMm,30);
  assert.equal(s.centreHeightMm,30);
  assert.ok(s.fits,JSON.stringify(d.warnings));
  assert.ok(d.summary.axisOffsetMm>0.5,'the stripper centre is off the reel axis, so the offset cost is real');
  close(s.requiredIdMm,s.envelopeMm*d.params.fit+2*d.summary.axisOffsetMm,1e-9);
  assert.ok(s.requiredIdMm<=30+1e-6);
  // First fit: a hair closer to the reel it would not fit.
  const m=G.buildModel(base);
  const margin=(x)=>{const dx=x-base.spoolLipMm,dy=R(x)+30-base.reelHeightMm;return 30-(m.envelope(Math.hypot(dx,dy))*m.fit+2*Math.abs(dx*m.sinT+dy*m.cosT));};
  assert.ok(margin(s.xMm-0.05)<0 && margin(s.xMm)>=-1e-6);
  // The stripper then feeds the rest of the train: later illustrative guides still fit.
  d.guides.forEach((g)=>assert.equal(g.fits,true,g.label));
  assert.equal(d.guides[0].role,'stripper');
});

test('an impossible measurement pair (ring through the blank) is reported, not repaired',()=>{
  const d=withGuides({2:{idMm:15,centreHeightMm:5}});
  assert.equal(d.ok,true);
  const w=d.warnings.find((x)=>x.code==='ring-overlaps-blank');
  assert.ok(w,JSON.stringify(d.warnings));
  assert.equal(w.field,'guide2.centreHeightMm');
  assert.match(w.message,/the measured 15 mm ring needs a centre height of at least 7\.5 mm above the blank, but 5 mm was entered/);
  assert.equal(d.guides[2].idMm,15);
  assert.equal(d.guides[2].centreHeightMm,5);
  assert.ok(d.guides[2].ringTopClearanceMm<0);
  // Exactly touching is not an overlap.
  const touching=withGuides({2:{idMm:15,centreHeightMm:7.5}});
  assert.ok(!warnCodes(touching).includes('ring-overlaps-blank'));
  // An illustrative height that overlaps still uses the generic message.
  const generic=withGuides({3:{centreHeightMm:4}});
  assert.match(generic.warnings.find((x)=>x.code==='ring-overlaps-blank').message,/the ring would overlap the blank\. Increase its centre height\./);
});

test('a ring that no position can make fit is flagged with no-fit-position and the entered values are kept',()=>{
  // 3 mm is below the narrowest line cone (settled line 4 mm + 25% clearance = 5 mm).
  const d=withGuides({2:{idMm:3,centreHeightMm:10}});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  const w=d.warnings.find((x)=>x.code==='no-fit-position');
  assert.ok(w,JSON.stringify(d.warnings));
  assert.equal(w.field,'guide2.idMm');
  assert.match(w.message,/^Guide 2: no position on the rod lets the 3 mm ring at a 10 mm centre height fit the line cone\. Its closest position is 2 mm short\./);
  assert.match(w.message,/the entered values were not changed/);
  assert.equal(d.guides[2].idMm,3);
  assert.equal(d.guides[2].centreHeightMm,10,'no height was invented');
  assert.equal(d.guides[2].proposalSolved,false);
  assert.ok(Math.abs(d.guides[2].proposalShortfallMm-2)<1e-6);
  assert.ok(!d.warnings.some((x)=>x.code==='ring-too-small' && x.field==='guide2.idMm'),'one clear message, not two');
  // Still a complete, ordered train.
  d.guides.slice(1).forEach((g,i)=>assert.ok(g.xMm>d.guides[i].xMm,`${g.label} stays in order`));
  // A guide the builder has deliberately moved is judged by the ordinary rule instead.
  const moved=withGuides({2:{idMm:3,centreHeightMm:10,positionMm:ref.guides[2].xMm}});
  assert.ok(warnCodes(moved).includes('ring-too-small'));
});

test('a measured stripper too low for the reel axis is reported as short of its requirement, with its measurements untouched',()=>{
  const d=withGuides({0:{idMm:24,centreHeightMm:6}});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.equal(d.guides[0].centreHeightMm,6);
  assert.equal(d.guides[0].idMm,24);
  assert.ok(warnCodes(d).includes('no-fit-position') || warnCodes(d).includes('ring-too-small'));
  assert.ok(d.guides[0].marginMm<0 || !d.guides[0].proposalSolved);
});

test('guide ordering holds for any mix of measured guides: positions strictly increase, never past the tip',()=>{
  const sets=[
    {1:{idMm:21,centreHeightMm:25},2:{idMm:12,centreHeightMm:19},3:{idMm:9,centreHeightMm:30}},
    {5:{idMm:5,centreHeightMm:3},6:{idMm:5,centreHeightMm:3},7:{idMm:5,centreHeightMm:3}},
    {0:{idMm:26,centreHeightMm:28},4:{idMm:7,centreHeightMm:40},9:{idMm:5,centreHeightMm:12}},
    {2:{idMm:3,centreHeightMm:6},3:{idMm:3,centreHeightMm:6}},
  ];
  sets.forEach((entries)=>{
    const d=withGuides(entries);
    assert.equal(d.ok,true,JSON.stringify(entries)+JSON.stringify(d.errors));
    d.guides.slice(1).forEach((g,i)=>assert.ok(g.xMm>d.guides[i].xMm,`${JSON.stringify(entries)}: ${g.label}`));
    assert.ok(d.guides[d.guides.length-2].xMm<base.rodLengthMm);
    d.guides.forEach((g)=>close(g.heightMm,R(g.xMm)+g.centreHeightMm,1e-9));
    assert.deepEqual(d.guides.map((g)=>g.role),ref.guides.map((g)=>g.role),'reduction and runner roles are unchanged');
  });
});

test('running guides keep their positions from the spacing progression and take measured dimensions',()=>{
  const d=withGuides({7:{idMm:6,centreHeightMm:16}});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  close(d.guides[7].xMm,ref.guides[7].xMm,1e-9,'runner position comes from the progression');
  assert.equal(d.guides[7].idMm,6);
  assert.equal(d.guides[7].centreHeightMm,16);
  assert.equal(d.guides[7].role,'runner');
  assert.equal(d.guides[7].label,'Runner 2');
  assert.equal(d.guides[7].source,'measured');
  assert.ok(warnCodes(d).includes('id-not-reducing') || d.guides[7].idMm<=d.guides[6].idMm+1e-9);
  // The runner list still reports the same gaps.
  d.summary.runnerGapsMm.forEach((gap,i)=>close(gap,ref.summary.runnerGapsMm[i],1e-9));
});

test('the reduction train mathematics is untouched when nothing is measured, with or without runners',()=>{
  const without=design({runnerCount:0});
  assert.deepEqual(without.guides.map((g)=>Math.round(g.xMm*100)/100),[865.51,1003.48,1099.9,1167.28,1214.36,1247.27,2130]);
  ref.guides.slice(0,6).forEach((g,i)=>{
    assert.equal(g.xMm,without.guides[i].xMm);
    assert.equal(g.idMm,without.guides[i].idMm);
    assert.equal(g.heightMm,without.guides[i].heightMm);
  });
  close(ref.summary.chokeFromTipMm,882.7,0.05);
  close(ref.summary.reductionRatio,0.699,0.001);
});

test('uniform scaling of every length, measured values included, scales the solved positions (unit changes do not alter the geometry)',()=>{
  const k=1.1;
  const lengths=['rodLengthMm','buttOdMm','tipOdMm','spoolLipMm','spoolDiameterMm','reelHeightMm','stripperIdMm','tipTopIdMm','tipTopCentreHeightMm','settledLineMm','runnerMinGapMm'];
  const scaled={...base};
  lengths.forEach((key)=>{scaled[key]=base[key]*k;});
  const entries={0:{idMm:30,centreHeightMm:30},2:{idMm:15,centreHeightMm:20},7:{idMm:6,centreHeightMm:14}};
  const a=withGuides(entries);
  const scaledEntries={};
  Object.keys(entries).forEach((i)=>{scaledEntries[i]={idMm:entries[i].idMm*k,centreHeightMm:entries[i].centreHeightMm*k};});
  const b=G.designGuideTrain({...scaled,guides:guidesWith(scaledEntries)});
  assert.equal(b.ok,true,JSON.stringify(b.errors));
  a.guides.forEach((g,i)=>{
    close(b.guides[i].xMm,g.xMm*k,2e-6,`${g.label} position`);
    close(b.guides[i].centreHeightMm,g.centreHeightMm*k,2e-6,`${g.label} centre height`);
    if(g.measured.id)close(b.guides[i].idMm,g.idMm*k,1e-6,`${g.label} ring size`);
  });
  assert.deepEqual(warnCodes(b),warnCodes(a));
  // Inch display only changes the words, not the numbers.
  const fmt={length:(mm)=>`${(mm/25.4).toFixed(2)} in`,degrees:(d)=>`${d} deg`};
  const imperial=G.designGuideTrain({...base,guides:guidesWith({2:{idMm:3,centreHeightMm:10}})},fmt);
  assert.match(imperial.warnings.find((w)=>w.code==='no-fit-position').message,/the 0\.12 in ring at a 0\.39 in centre height/);
});

test('validation: measured entries are checked with plain-English messages',()=>{
  const e=(entries)=>withGuides(entries).errors;
  assert.deepEqual(code({errors:e({2:{idMm:0.4}})}),['guide-range']);
  assert.deepEqual(code({errors:e({2:{idMm:81}})}),['guide-range']);
  assert.deepEqual(code({errors:e({2:{centreHeightMm:-1}})}),['guide-range']);
  assert.deepEqual(code({errors:e({2:{centreHeightMm:201}})}),['guide-range']);
  assert.match(e({2:{centreHeightMm:-1}})[0].message,/^Guide 2: the centre height above the blank must be between 0 mm and 200 mm\.$/);
  assert.deepEqual(code({errors:e({2:{idMm:'x'}})}),['guide-invalid']);
  assert.equal(e({2:{centreHeightMm:NaN}})[0].field,'guide2.centreHeightMm');
  // Blank entries mean "illustrative", not an error.
  const blank=withGuides({2:{idMm:null,centreHeightMm:'',positionMm:undefined}});
  assert.equal(blank.ok,true);
  assert.equal(blank.guides[2].source,'illustrative');
  // An ID that makes the stripper impossible is a clear, field-specific error.
  const huge=withGuides({0:{idMm:55}});
  assert.equal(huge.ok,false);
  assert.equal(huge.errors[0].field,'guide0.idMm');
  assert.equal(huge.errors[0].code,'stripper-too-big');
  const tiny=withGuides({0:{idMm:4}});
  assert.equal(tiny.errors[0].code,'not-reducing');
  assert.equal(tiny.errors[0].field,'guide0.idMm');
});

test('validateGuideSpec checks one guide of the builder\'s own set',()=>{
  assert.deepEqual(G.validateGuideSpec({idMm:15,centreHeightMm:12}),{ok:true,errors:[]});
  assert.deepEqual(G.validateGuideSpec({idMm:15,centreHeightMm:7.5}),{ok:true,errors:[]},'exactly touching the blank is allowed');
  const missing=G.validateGuideSpec({idMm:15});
  assert.equal(missing.ok,false);
  assert.deepEqual(missing.errors.map((x)=>[x.field,x.code]),[['centreHeightMm','missing']]);
  assert.match(missing.errors[0].message,/^Enter the centre height above the blank\.$/);
  assert.deepEqual(G.validateGuideSpec({}).errors.map((x)=>x.code),['missing','missing']);
  assert.equal(G.validateGuideSpec(null).ok,false);
  assert.deepEqual(G.validateGuideSpec({idMm:NaN,centreHeightMm:5}).errors.map((x)=>x.code),['invalid']);
  assert.deepEqual(G.validateGuideSpec({idMm:0.5,centreHeightMm:5}).errors.map((x)=>x.code),['range']);
  assert.deepEqual(G.validateGuideSpec({idMm:20,centreHeightMm:300}).errors.map((x)=>x.code),['range']);
  const overlap=G.validateGuideSpec({idMm:15,centreHeightMm:5});
  assert.deepEqual(overlap.errors.map((x)=>x.code),['spec-ring-overlaps-blank']);
  assert.match(overlap.errors[0].message,/^A 15 mm ring needs a centre height of at least 7\.5 mm above the blank\. 5 mm would put the ring through the blank\.$/);
  const fmt={length:(mm)=>`${(mm/25.4).toFixed(2)} in`,degrees:(d)=>`${d}`};
  assert.match(G.validateGuideSpec({idMm:15,centreHeightMm:5},fmt).errors[0].message,/0\.59 in ring needs a centre height of at least 0\.30 in/);
  // A set entry is never written into the design by the validator.
  const input={idMm:15,centreHeightMm:5};
  const before=JSON.stringify(input);
  G.validateGuideSpec(input);
  assert.equal(JSON.stringify(input),before);
});

test('diagram: measured rings are drawn apart from illustrative ones, at their true height above the blank',()=>{
  const d=withGuides({2:{idMm:15,centreHeightMm:20},8:{idMm:5,centreHeightMm:9}});
  const svg=G.buildSideViewSvg(d,{width:420});
  const ringTags=svg.match(/<rect class="gt-ring[ "][^>]*>/g);
  assert.equal(ringTags.length,11);
  const measured=ringTags.filter((t)=>/gt-ring--measured/.test(t));
  assert.deepEqual(measured.map((t)=>t.match(/data-guide="(\d+)"/)[1]),['2','8']);
  const fills=new Set(measured.map((t)=>t.match(/fill="([^"]*)"/)[1]));
  const others=new Set(ringTags.filter((t)=>!/gt-ring--measured/.test(t)).map((t)=>t.match(/fill="([^"]*)"/)[1]));
  assert.equal(fills.size,1);
  assert.ok(![...fills].some((f)=>others.has(f)),'measured rings have their own fill');
  const geo=G.viewGeometry(d,420);
  d.guides.forEach((g)=>{
    const tag=ringTags.find((t)=>t.includes(`data-guide="${g.index}"`));
    close(Number(tag.match(/ y="([\d.-]+)"/)[1]),geo.padT+(R(g.xMm)+g.centreHeightMm-g.idMm/2-geo.yTop)*geo.ky,0.01,`${g.label} y from blank radius + centre height`);
  });
  assert.deepEqual(svg.match(/<text class="gt-guidelabel"[^>]*>([^<]*)<\/text>/g).map((t)=>t.replace(/<[^>]*>/g,'')),['S','1','2','3','4','5','R1','R2','R3','R4','T'],'reduction guides and runners stay identifiable');
  assert.equal((svg.match(/class="gt-ring gt-ring--runner/g)||[]).length,4);
  assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
  assert.ok(/^[\x00-\x7f]*$/.test(svg));
  const plain=G.buildSideViewSvg(ref,{width:420});
  assert.doesNotMatch(plain,/gt-ring--measured/);
});

test('documentation is honest: measured vs illustrative, no catalogue, no manufacturer data, no performance claim',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','js','guide-train.js'),'utf8');
  assert.match(source,/THREE SEPARATE GUIDE MEASUREMENTS/);
  assert.match(source,/ILLUSTRATIVE GEOMETRY and MEASURED GUIDES/);
  assert.match(source,/Ring inner diameter\s+idMm/);
  assert.match(source,/Centre height\s+centreHeightMm/);
  assert.match(source,/Mounting position\s+xMm/);
  assert.match(source,/no-fit-position/);
  assert.match(source,/Ring offset from the foot/);
  const all=[...G.METHOD_STEPS,...G.ASSUMPTIONS,...G.LIMITATIONS].join('\n');
  assert.match(all,/Guide geometry:/);
  assert.match(all,/Measured guides:/);
  assert.match(all,/Illustrative guides:/);
  assert.match(all,/not guide specifications/);
  assert.match(all,/There is no guide catalogue and no manufacturer data/);
  assert.match(all,/not physically validated/i);
  assert.doesNotMatch(all,/\b(Fuji|KR|proven|guaranteed|optimal|best|perfect|ideal|verified|certified)\b/i);
  [...G.METHOD_STEPS,...G.ASSUMPTIONS,...G.LIMITATIONS].forEach((line)=>assert.ok(/^[\x00-\x7f]*$/.test(line)));
  assert.ok(/^[\x00-\x7f]*$/.test(source));
  assert.doesNotMatch(source,/calcGuideLayout|guideSpecification|localStorage|Store\.|fetch\(|supabase|document\.|window\./i);
});

test('the engine does not mutate its input and is deterministic with measured guides',()=>{
  const input={...base,guides:guidesWith({2:{idMm:15,centreHeightMm:20},0:{idMm:30,centreHeightMm:30}})};
  const before=JSON.stringify(input);
  const a=G.designGuideTrain(input),b=G.designGuideTrain(input);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(a,b);
  assert.equal(a.modelVersion,2);
});
