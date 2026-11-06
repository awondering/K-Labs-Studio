const assert=require('node:assert/strict');
const {test}=require('node:test');
const G=require('../js/guide-train.js');

// Physical-guide rules: a guide is a rigid frame. The engine works around the guides in use and never invents
// guide dimensions to make the line geometry work.
const base={...G.DEFAULTS};
const design=(overrides,guides)=>G.designGuideTrain({...base,...(overrides||{}),...(guides?{guides}:{})});
const close=(a,b,tol,label)=>assert.ok(Math.abs(a-b)<=tol,`${label||'value'}: ${a} vs ${b}`);
const runnersOf=(d)=>d.guides.filter((g)=>g.role==='runner');
const codes=(d)=>d.warnings.map((w)=>w.code);
const slot=(index,entry)=>{const list=[];list[index]=entry;for(let i=0;i<index;i+=1)if(!list[i])list[i]=null;return list;};

test('identical runners keep identical ring size and frame height, whatever the rod, taper, count or spacing',()=>{
  const cases=[
    {},
    {runnerCount:1},{runnerCount:5},{runnerCount:12,runnerMinGapMm:20},
    {rodLengthMm:2400,spoolLipMm:640,buttOdMm:20,tipOdMm:1.8},
    {runnerRatio:0.6},{runnerRatio:1.4},
    {reductionCount:3,spoolDiameterMm:48},
    {runnerIdMm:6,runnerCentreHeightMm:7.5},
  ];
  cases.forEach((extra)=>{
    const d=design(extra);
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    const runners=runnersOf(d);
    const wantId=extra.runnerIdMm||base.runnerIdMm;
    const wantHeight=extra.runnerCentreHeightMm||base.runnerCentreHeightMm;
    assert.equal(runners.length,extra.runnerCount||base.runnerCount);
    runners.forEach((g)=>{
      assert.equal(g.idMm,wantId,`${JSON.stringify(extra)} ${g.label} ring size`);
      assert.equal(g.centreHeightMm,wantHeight,`${JSON.stringify(extra)} ${g.label} centre height`);
      assert.deepEqual(g.measured,{id:false,height:false});
    });
  });
});

test('runner dimensions are not calculated from the line path: they do not depend on spool, flare or reel',()=>{
  const a=design({});
  const b=design({spoolDiameterMm:48,flareAngleDeg:2.5,reelHeightMm:50,reelAngleDeg:3,stripperIdMm:34});
  assert.equal(b.ok,true,JSON.stringify(b.errors));
  assert.deepEqual(runnersOf(b).map((g)=>[g.idMm,g.centreHeightMm]),runnersOf(a).map((g)=>[g.idMm,g.centreHeightMm]));
});

test('moving a runner changes its position only, never its ring size or height above the blank',()=>{
  const ref=design({});
  const r2=ref.guides[7];
  [-60,35,90].forEach((shift)=>{
    const d=design({},slot(7,{positionMm:r2.xMm+shift}));
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    const moved=d.guides[7];
    assert.equal(moved.moved,true);
    close(moved.xMm,r2.xMm+shift,1e-9,'position');
    assert.equal(moved.idMm,r2.idMm);
    assert.equal(moved.centreHeightMm,r2.centreHeightMm);
    close(moved.heightMm,G.bladeRadius(d.input,moved.xMm)+r2.centreHeightMm,1e-9,'axis height follows only the taper');
    assert.equal(moved.source,'illustrative','a moved runner is still the shared illustrative runner');
    runnersOf(d).forEach((g)=>assert.equal(g.centreHeightMm,r2.centreHeightMm));
  });
});

test('blank taper moves a runner relative to the blank centreline but not its height from the blank surface',()=>{
  const straight=design({buttOdMm:10,tipOdMm:10});
  const tapered=design({buttOdMm:24,tipOdMm:1.5});
  const steep=runnersOf(tapered);
  assert.equal(new Set(steep.map((g)=>g.centreHeightMm)).size,1,'one surface height on a steep taper');
  for(let i=1;i<steep.length;i+=1){
    assert.ok(steep[i].heightMm<steep[i-1].heightMm,'axis height drops with the narrowing blank');
  }
  steep.forEach((g)=>close(g.heightMm-G.bladeRadius(tapered.input,g.xMm),base.runnerCentreHeightMm,1e-9,'height from the blank surface'));
  const flat=runnersOf(straight);
  const axisHeights=new Set(flat.map((g)=>Math.round(g.heightMm*1e6)));
  assert.equal(axisHeights.size,1,'a parallel blank gives equal axis heights too');
  steep.forEach((g)=>close(g.ringTopClearanceMm,g.centreHeightMm-g.idMm/2,1e-9,'ring clearance to the blank is taper independent'));
});

test('a runner differs from the others only where the builder explicitly chooses it',()=>{
  const d=design({},slot(8,{idMm:6,centreHeightMm:8}));
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  const runners=runnersOf(d);
  runners.forEach((g,i)=>{
    if(i===2){
      assert.equal(g.idMm,6);assert.equal(g.centreHeightMm,8);assert.equal(g.source,'measured');
    }else{
      assert.equal(g.idMm,base.runnerIdMm);assert.equal(g.centreHeightMm,base.runnerCentreHeightMm);assert.equal(g.source,'illustrative');
    }
  });
});

test('measured reduction-guide dimensions stay exactly as entered, wherever the guide ends up',()=>{
  const cases=[
    {index:2,idMm:15,centreHeightMm:20},
    {index:1,idMm:19.5,centreHeightMm:33},
    {index:5,idMm:8,centreHeightMm:14},
    {index:3,idMm:3,centreHeightMm:10},
  ];
  cases.forEach((c)=>{
    const d=design({},slot(c.index,{idMm:c.idMm,centreHeightMm:c.centreHeightMm}));
    assert.equal(d.ok,true,JSON.stringify(d.errors));
    const g=d.guides[c.index];
    assert.equal(g.idMm,c.idMm,`guide ${c.index} ring size`);
    assert.equal(g.centreHeightMm,c.centreHeightMm,`guide ${c.index} centre height`);
    assert.deepEqual(g.measured,{id:true,height:true});
    close(g.heightMm,G.bladeRadius(d.input,g.xMm)+c.centreHeightMm,1e-9,'axis height from the measured height');
  });
  const tight=design({},slot(3,{idMm:3,centreHeightMm:10}));
  assert.ok(codes(tight).includes('no-fit-position'),'an impossible measured guide is reported, not repaired');
});

test('measured runners are never adjusted to suit the line path',()=>{
  const d=design({},slot(7,{idMm:5,centreHeightMm:2}));
  const g=d.guides[7];
  assert.equal(g.centreHeightMm,2);
  assert.equal(g.idMm,5);
  assert.ok(codes(d).includes('ring-overlaps-blank'),'a 5 mm ring at 2 mm height is flagged');
});

test('choke-to-runner transition: the choke ring is never smaller than the runner ring, and runners sit lower than the choke',()=>{
  const d=design({});
  const choke=d.guides.find((g)=>g.role==='choke');
  const first=runnersOf(d)[0];
  assert.ok(choke.idMm>=first.idMm);
  assert.ok(first.centreHeightMm<choke.centreHeightMm);
  assert.deepEqual(d.warnings,[]);
  const bigger=design({runnerIdMm:7,runnerCentreHeightMm:8});
  assert.equal(bigger.ok,true,JSON.stringify(bigger.errors));
  const chokeBig=bigger.guides.find((g)=>g.role==='choke');
  assert.ok(chokeBig.idMm>=7,'the reduction train ends on a ring at least as large as the runners');
  bigger.guides.slice(1).forEach((g,i)=>assert.ok(g.idMm<=bigger.guides[i].idMm+1e-9,`${g.label} does not grow`));
  assert.ok(!codes(bigger).includes('id-not-reducing'));
});

test('runners taller than the choke guide are warned about, with the dimensions left as set',()=>{
  const d=design({runnerCentreHeightMm:40});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.ok(codes(d).includes('runner-taller-than-choke'));
  assert.match(d.warnings.find((w)=>w.code==='runner-taller-than-choke').message,/higher than the choke guide/);
  runnersOf(d).forEach((g)=>assert.equal(g.centreHeightMm,40));
});

test('invalid physical configurations give one understandable warning and no invented dimensions',()=>{
  const overlap=design({runnerIdMm:12,runnerCentreHeightMm:5});
  assert.equal(overlap.ok,true,JSON.stringify(overlap.errors));
  assert.equal(overlap.warnings.filter((w)=>w.code==='runner-ring-overlaps-blank').length,1,'one message, not one per runner');
  assert.match(overlap.warnings.find((w)=>w.code==='runner-ring-overlaps-blank').message,/needs a centre height of at least 6 mm above the blank, but 5 mm is set/);
  runnersOf(overlap).forEach((g)=>{assert.equal(g.idMm,12);assert.equal(g.centreHeightMm,5);});

  const small=design({runnerIdMm:3});
  assert.equal(small.ok,true,JSON.stringify(small.errors));
  assert.ok(codes(small).includes('ring-too-small'));
  runnersOf(small).forEach((g)=>assert.equal(g.idMm,3,'a too-small ring is flagged, not enlarged'));

  const missing=design({runnerIdMm:''});
  assert.equal(missing.ok,false);
  assert.match(missing.errors[0].message,/Enter the running guide ring inner diameter\./);
  const range=design({runnerCentreHeightMm:500});
  assert.equal(range.ok,false);
  assert.equal(range.errors[0].code,'range');
});

test('with no runners the shared runner settings change nothing',()=>{
  const a=design({runnerCount:0});
  const b=design({runnerCount:0,runnerIdMm:20,runnerCentreHeightMm:50});
  assert.deepEqual(b.guides.map((g)=>[g.xMm,g.idMm,g.heightMm]),a.guides.map((g)=>[g.xMm,g.idMm,g.heightMm]));
});

test('diagram: every illustrative runner is drawn with the same ring height and the same style',()=>{
  const d=design({});
  const svg=G.buildSideViewSvg(d,{width:340});
  const rings=svg.match(/<rect class="gt-ring gt-ring--runner[^>]*>/g)||[];
  assert.equal(rings.length,4);
  const heights=new Set(rings.map((tag)=>tag.match(/ height="([\d.]+)"/)[1]));
  assert.equal(heights.size,1,'one runner ring height in the picture');
  const legs=svg.match(/<line class="gt-leg" data-guide="(6|7|8|9)"[^>]*>/g)||[];
  const legLengths=new Set(legs.map((tag)=>{
    const y1=Number(tag.match(/ y1="([\d.-]+)"/)[1]);
    const y2=Number(tag.match(/ y2="([\d.-]+)"/)[1]);
    return Math.round((y2-y1)*10)/10;
  }));
  assert.ok(legLengths.size<=2,'runner frames are one low-profile height (taper moves them by a fraction of a millimetre)');
});
