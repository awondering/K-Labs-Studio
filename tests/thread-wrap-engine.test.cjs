const assert=require('node:assert/strict');
const {test}=require('node:test');
const T=require('../js/thread-wrap.js');

const base={lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,accentThreads:1,mainColour:'black',accentColour:'gold'};
const design=(overrides)=>T.designDiamondWrap({...base,...overrides});
const close=(actual,expected,tolerance,label)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label||'value'}: ${actual} vs ${expected} (±${tolerance})`);
const rel=(actual,expected)=>Math.abs(actual-expected)/Math.abs(expected);

// Published worked example: John Sturm's Taper Offset Spacing spreadsheet (Rod Guild), cached values for
// butt 4.94 mm, mid 4.37 mm, tip 3.80 mm, 12 repeats, 100 %. The spacing list is column C (rows 8-19).
const STURM_SPACING=[12.144672215858082,12.354850892280005,12.576265496446423,12.809950254384125,13.057077377379018,13.318981614149173,13.597190351513119,13.893460806260268,14.209826367159229,14.548654866886748,14.912722584074329,15.305309241728567];
const STURM_NOMINAL_LENGTH=164.74511875424875;

test('constant-diameter blank: every row, repeat and angle is identical and positions are linear',()=>{
  const d=design({lengthMm:300,buttDiameterMm:20,tipDiameterMm:20,repeats:6});
  assert.equal(d.ok,true);
  assert.equal(d.summary.rowCount,12);
  d.rows.forEach((row,j)=>{
    close(row.positionMm,j*25,1e-9,`row ${j}`);
    close(row.circumferenceMm,Math.PI*20,1e-9);
  });
  d.repeats.forEach((repeat)=>close(repeat.lengthMm,50,1e-9));
  const angle=Math.atan2(Math.PI*20/2,25)*180/Math.PI;
  d.segments.forEach((segment)=>close(segment.angleDeg,angle,1e-9));
  assert.equal(d.summary.taperDirection,'constant');
  close(d.summary.minGapMm,d.summary.maxGapMm,1e-9);
});

test('tapered blank: gaps change monotonically toward the thinner end, rows span exactly the wrap length',()=>{
  const thin=design({repeats:5});
  const gapsThin=thin.rows.slice(1).map((row)=>row.gapMm);
  gapsThin.forEach((gap,i)=>{if(i>0)assert.ok(gap>gapsThin[i-1],'gaps must grow toward the thinner tip'); });
  assert.equal(thin.summary.taperDirection,'thinner-to-tip');
  const thick=design({buttDiameterMm:15.3,tipDiameterMm:16.9,repeats:5});
  const gapsThick=thick.rows.slice(1).map((row)=>row.gapMm);
  gapsThick.forEach((gap,i)=>{if(i>0)assert.ok(gap<gapsThick[i-1],'gaps must shrink toward a thicker tip'); });
  assert.equal(thick.summary.taperDirection,'thicker-to-tip');
  for(const d of [thin,thick]){
    assert.equal(d.rows[0].positionMm,0);
    assert.equal(d.rows[d.rows.length-1].positionMm,250);
    d.rows.forEach((row,j)=>{if(j>0)assert.ok(row.positionMm>d.rows[j-1].positionMm);});
  }
});

test('equal-area invariant holds across a sweep of lengths, tapers, axes and repeats',()=>{
  let seed=12345;
  const rand=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
  let checked=0;
  for(let i=0;i<300;i+=1){
    const length=60+rand()*600;
    const butt=4+rand()*30;
    const tip=Math.max(1.5,butt*(0.55+rand()*0.5));
    const axes=T.AXIS_OPTIONS[Math.floor(rand()*3)];
    const repeats=T.suggestRepeats({lengthMm:length,buttDiameterMm:butt,tipDiameterMm:tip,axes});
    const d=T.designDiamondWrap({lengthMm:length,buttDiameterMm:butt,tipDiameterMm:tip,axes,repeats});
    if(!d.ok)continue;
    checked+=1;
    const areas=d.segments.map((s)=>s.areaMm2);
    areas.forEach((area)=>assert.ok(rel(area,areas[0])<1e-9,'every row has the same surface area'));
    d.repeats.forEach((repeat)=>assert.ok(rel(repeat.areaMm2,d.repeats[0].areaMm2)<1e-9,'every repeat has the same surface area'));
    // area × repeat count equals the cone surface of the whole wrap
    close(d.repeats.reduce((s,r)=>s+r.areaMm2,0),Math.PI*(butt+tip)/2*length,1e-6*length*butt);
    assert.equal(d.rows[d.rows.length-1].positionMm,length);
  }
  assert.ok(checked>200,`only ${checked} configurations were valid`);
});

test('marking positions agree with independent numerical integration of the cone surface',()=>{
  const d=design({repeats:7,buttDiameterMm:17.8,tipDiameterMm:12.1,lengthMm:320});
  const diameter=(z)=>17.8+(12.1-17.8)*(z/320);
  const area=(z)=>{ // composite Simpson, 2000 panels
    const n=2000,h=z/n;let sum=Math.PI*diameter(0)+Math.PI*diameter(z);
    for(let i=1;i<n;i+=1)sum+=Math.PI*diameter(i*h)*(i%2?4:2);
    return sum*h/3;
  };
  const total=area(320);
  d.rows.forEach((row)=>{
    close(area(row.positionMm)/total,row.index/d.summary.rowCount,1e-9,`area fraction at row ${row.index}`);
  });
});

test('worked example: matches John Sturm\'s published Taper Offset Spacing spreadsheet within 0.4 %',()=>{
  const length=STURM_SPACING.reduce((s,v)=>s+v,0);
  const butt=4.94, tipNominal=3.80;
  // The spreadsheet tapers the circumference linearly over its nominal length (G4); sample that taper at the
  // total of the 12 spacings it actually produced so both models cover the same wrap.
  const tipAtLength=butt-(butt-tipNominal)*length/STURM_NOMINAL_LENGTH;
  const d=T.designDiamondWrap({lengthMm:length,buttDiameterMm:butt,tipDiameterMm:tipAtLength,axes:2,repeats:12});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  assert.equal(d.repeats.length,12);
  d.repeats.forEach((repeat,i)=>{
    assert.ok(rel(repeat.lengthMm,STURM_SPACING[i])<0.004,`repeat ${i+1}: ${repeat.lengthMm} vs ${STURM_SPACING[i]}`);
  });
  // The published method gives a repeat close to one circumference at 45°.
  assert.ok(d.summary.meanAngleDeg>43 && d.summary.meanAngleDeg<47,`mean angle ${d.summary.meanAngleDeg}`);
});

test('worked example: Ehler\'s Rod Guild chart (linear from tip circumference at the butt end to butt circumference at the tip end) agrees within 3.5 %',()=>{
  const length=STURM_SPACING.reduce((s,v)=>s+v,0);
  const butt=4.94, tip=butt-(butt-3.80)*length/STURM_NOMINAL_LENGTH;
  const d=T.designDiamondWrap({lengthMm:length,buttDiameterMm:butt,tipDiameterMm:tip,axes:2,repeats:12});
  const cButt=Math.PI*butt, cTip=Math.PI*tip;
  const ehler=Array.from({length:12},(_,k)=>cTip+(cButt-cTip)*k/11);
  ehler.forEach((spacing,k)=>{
    assert.ok(rel(d.repeats[k].lengthMm,spacing)<0.035,`repeat ${k+1}: ${d.repeats[k].lengthMm} vs Ehler ${spacing}`);
    if(k>0)assert.ok(spacing>ehler[k-1]);
  });
});

test('worked example: Rodhouse 250 mm wrap with 53 mm butt and 48 mm tip perimeters',()=>{
  const d=T.designDiamondWrap({lengthMm:250,buttDiameterMm:53/Math.PI,tipDiameterMm:48/Math.PI,axes:2});
  assert.equal(d.ok,true);
  assert.equal(d.suggestedRepeats,5,'about 250 / 50 repeats');
  assert.equal(d.input.repeats,5);
  assert.ok(d.summary.meanAngleDeg>44.5 && d.summary.meanAngleDeg<46,`mean angle ${d.summary.meanAngleDeg}`);
  assert.equal(d.warnings.length,0);
  // Documented: a repeat is about one circumference long, and repeats lengthen toward the thinner end.
  d.repeats.forEach((repeat,i)=>{
    const meanCircumference=T.circumferenceAt(d.input,(repeat.startMm+repeat.endMm)/2);
    assert.ok(Math.abs(repeat.lengthMm/meanCircumference-1)<0.1,`repeat ${i+1} length ${repeat.lengthMm}`);
    if(i>0)assert.ok(repeat.lengthMm>d.repeats[i-1].lengthMm);
  });
  close(d.repeats.reduce((s,r)=>s+r.lengthMm,0),250,1e-9);
});

test('suggested repeats follow the 45° rule for each axis count and are clamped',()=>{
  const circumference=Math.PI*(base.buttDiameterMm+base.tipDiameterMm)/2;
  assert.equal(T.suggestRepeats({...base,axes:2}),Math.round(250/circumference));
  assert.equal(T.suggestRepeats({...base,axes:4}),Math.round(4*250/(2*circumference)));
  assert.equal(T.suggestRepeats({...base,axes:6}),Math.round(6*250/(2*circumference)));
  assert.equal(T.suggestRepeats({...base,lengthMm:1000,axes:6,buttDiameterMm:2,tipDiameterMm:2}),T.LIMITS.repeats.max);
  assert.equal(T.suggestRepeats({...base,lengthMm:20,buttDiameterMm:40,tipDiameterMm:40}),T.LIMITS.repeats.min);
  assert.equal(T.suggestRepeats({}),null);
  for(const axes of T.AXIS_OPTIONS){
    const d=design({axes});
    assert.ok(d.summary.meanAngleDeg>40 && d.summary.meanAngleDeg<50,`axes ${axes}: ${d.summary.meanAngleDeg}`);
  }
});

test('axis, row and pass structure: every crossing has exactly one clockwise and one anticlockwise thread',()=>{
  for(const axes of T.AXIS_OPTIONS){
    for(const repeats of [1,2,5,9]){
      const d=design({axes,repeats,lengthMm:400,buttDiameterMm:20,tipDiameterMm:17});
      if(!d.ok)continue;
      const R=2*repeats;
      assert.equal(d.axes.length,axes);
      d.axes.forEach((axis,k)=>close(axis.angleDeg,360*k/axes,1e-9));
      assert.equal(d.axes[0].isReference,true);
      assert.equal(d.passes.length,axes);
      assert.equal(d.passes.filter((p)=>p.hand==='clockwise').length,axes/2);
      assert.equal(d.passes.filter((p)=>p.hand==='anticlockwise').length,axes/2);
      const seen=new Map();
      d.passes.forEach((pass)=>{
        assert.equal(pass.nodes.length,R+1);
        assert.equal(pass.turns,R/axes);
        assert.equal(pass.startAxisNumber%2,1,'passes start on odd-numbered axes at row 0');
        pass.nodes.forEach((node)=>{
          assert.ok(d.rows[node.row].axisNumbers.includes(node.axisNumber),`row ${node.row} axis ${node.axisNumber}`);
          const key=`${node.row}:${node.axisNumber}`;
          const entry=seen.get(key)||{clockwise:0,anticlockwise:0};
          entry[pass.hand]+=1;
          seen.set(key,entry);
        });
        // consecutive nodes advance exactly one axis in the pass direction
        for(let j=0;j<R;j+=1){
          const delta=(pass.nodes[j+1].axisNumber-pass.nodes[j].axisNumber+axes)%axes;
          assert.equal(delta,pass.hand==='clockwise'?1:axes-1);
        }
      });
      let expectedNodes=0;
      d.rows.forEach((row)=>{expectedNodes+=row.axisNumbers.length;assert.equal(row.axisNumbers.length,axes/2);});
      assert.equal(seen.size,expectedNodes);
      for(const entry of seen.values())assert.deepEqual(entry,{clockwise:1,anticlockwise:1});
    }
  }
});

test('even rows use axes 1,3,5 and odd rows use 2,4,6',()=>{
  const d=design({axes:6,repeats:15});
  assert.equal(d.ok,true);
  assert.deepEqual(d.rows[0].axisNumbers,[1,3,5]);
  assert.deepEqual(d.rows[1].axisNumbers,[2,4,6]);
  assert.deepEqual(d.rows[2].axisNumbers,[1,3,5]);
  const two=design({axes:2,repeats:3});
  assert.deepEqual(two.rows.map((r)=>r.axisNumbers),[[1],[2],[1],[2],[1],[2],[1]]);
});

test('invalid inputs are rejected with field-specific, readable messages',()=>{
  const bad=(overrides,field,code)=>{
    const d=design(overrides);
    assert.equal(d.ok,false,JSON.stringify(overrides));
    const found=d.errors.find((e)=>e.field===field && (!code || e.code===code));
    assert.ok(found,`${field}/${code} in ${JSON.stringify(d.errors)}`);
    assert.ok(found.message.length>15 && /[A-Za-z]/.test(found.message));
    return d;
  };
  bad({lengthMm:null},'lengthMm','length-missing');
  bad({lengthMm:''},'lengthMm','length-missing');
  bad({lengthMm:NaN},'lengthMm','length-invalid');
  bad({lengthMm:undefined,buttDiameterMm:undefined},'buttDiameterMm','butt-missing');
  bad({buttDiameterMm:NaN},'buttDiameterMm','butt-invalid');
  bad({tipDiameterMm:Infinity},'tipDiameterMm','tip-invalid');
  bad({lengthMm:'250'},'lengthMm','length-invalid');
  bad({lengthMm:0},'lengthMm','length-range');
  bad({lengthMm:-5},'lengthMm','length-range');
  bad({lengthMm:19.9},'lengthMm','length-range');
  bad({lengthMm:1000.1},'lengthMm','length-range');
  bad({buttDiameterMm:0},'buttDiameterMm','butt-range');
  bad({buttDiameterMm:-1},'buttDiameterMm','butt-range');
  bad({buttDiameterMm:81},'buttDiameterMm','butt-range');
  bad({tipDiameterMm:null},'tipDiameterMm','tip-missing');
  bad({tipDiameterMm:0.5},'tipDiameterMm','tip-range');
  bad({axes:3},'axes','axes-invalid');
  bad({axes:8},'axes','axes-invalid');
  bad({repeats:0},'repeats','repeats-invalid');
  bad({repeats:2.5},'repeats','repeats-invalid');
  bad({repeats:41},'repeats','repeats-invalid');
  bad({repeats:NaN},'repeats','repeats-invalid');
  bad({accentThreads:4},'accentThreads','accent-invalid');
  bad({accentThreads:1.5},'accentThreads','accent-invalid');
  bad({accentThreads:-1},'accentThreads','accent-invalid');
  bad({mainColour:'pink'},'mainColour','colour-invalid');
  bad({accentColour:'#fff'},'accentColour','colour-invalid');
  bad({lengthMm:100,buttDiameterMm:40,tipDiameterMm:10},'tipDiameterMm','taper-too-steep');
  assert.equal(T.designDiamondWrap(undefined).ok,false);
  assert.equal(T.designDiamondWrap(null).ok,false);
  assert.equal(T.designDiamondWrap({}).ok,false);
  assert.equal(T.validateInputs({}).ok,false);
  assert.equal(T.validateInputs(base).ok,true);
});

test('angle limits refuse impractical repeat counts and suggest a workable value',()=>{
  const many=design({repeats:30});
  assert.equal(many.ok,false);
  const steep=many.errors.find((e)=>e.code==='angle-too-steep');
  assert.ok(steep);
  assert.match(steep.message,/Use fewer repeats/);
  assert.match(steep.message,/Try about 5 repeats/);
  assert.equal(many.suggestedRepeats,5);
  const few=design({repeats:1});
  const shallow=few.errors.find((e)=>e.code==='angle-too-shallow');
  assert.ok(shallow);
  assert.match(shallow.message,/Use more repeats/);
  const unusual=design({repeats:8});
  assert.equal(unusual.ok,true);
  assert.ok(unusual.warnings.some((w)=>w.code==='angle-unusual'));
});

test('an extreme taper is blamed on the taper, not on the repeat count, when the suggested count is already used',()=>{
  const d=design({tipDiameterMm:2});
  assert.equal(d.ok,false);
  const issue=d.errors.find((e)=>e.code==='angle-taper-spread');
  assert.ok(issue);
  assert.equal(issue.field,'tipDiameterMm');
  assert.match(issue.message,/too uneven to wrap neatly\. Shorten the wrap/);
  assert.doesNotMatch(issue.message,/Try about/);
  // a moderate taper stays valid but reports the real angle range
  const moderate=design({buttDiameterMm:14,tipDiameterMm:8,lengthMm:300});
  assert.equal(moderate.ok,true);
  assert.ok(moderate.summary.maxAngleDeg>moderate.summary.minAngleDeg+5);
});

test('warnings: tip larger than butt, steep taper and very tight rows',()=>{
  assert.ok(design({buttDiameterMm:15.3,tipDiameterMm:16.9}).warnings.some((w)=>w.code==='tip-larger'));
  assert.ok(design({lengthMm:100,buttDiameterMm:16,tipDiameterMm:10,repeats:2}).warnings.some((w)=>w.code==='taper-steep'));
  const tight=T.designDiamondWrap({lengthMm:100,buttDiameterMm:3,tipDiameterMm:3,axes:6,repeats:40});
  assert.equal(tight.ok,true,JSON.stringify(tight.errors));
  assert.ok(tight.summary.minGapMm<T.LIMITS.tightRowMm);
  assert.ok(tight.warnings.some((w)=>w.code==='rows-tight'));
  assert.ok(!design({repeats:5}).warnings.some((w)=>w.code==='rows-tight'));
});

test('thread colour changes alter only the colours, never the geometry',()=>{
  const a=design({repeats:5,mainColour:'black',accentColour:'gold'});
  const b=design({repeats:5,mainColour:'red',accentColour:'silver'});
  assert.deepEqual(a.rows,b.rows);
  assert.deepEqual(a.passes,b.passes);
  assert.deepEqual(a.summary,b.summary);
  assert.equal(b.colours.main.id,'red');
  assert.equal(b.colours.accent.id,'silver');
  const svgA=T.buildPreviewSvg(a,{width:340});
  const svgB=T.buildPreviewSvg(b,{width:340});
  assert.ok(svgA.includes(T.colourById('black').hex) && svgA.includes(T.colourById('gold').hex));
  assert.ok(svgB.includes(T.colourById('red').hex) && svgB.includes(T.colourById('silver').hex));
  assert.ok(!svgB.includes(T.colourById('gold').hex));
  assert.equal(new Set(T.THREAD_COLOURS.map((c)=>c.id)).size,T.THREAD_COLOURS.length);
  T.THREAD_COLOURS.forEach((c)=>assert.match(c.hex,/^#[0-9a-f]{6}$/i));
  assert.ok(T.THREAD_COLOURS.length>=6 && T.THREAD_COLOURS.length<=10);
});

function parseSvg(svg){
  const attr=(tag,name)=>{const m=tag.match(new RegExp(`${name}="([^"]*)"`));return m?m[1]:null;};
  const tags=(cls)=>svg.match(new RegExp(`<[a-z]+ class="${cls}[ "][^>]*>`,'g'))||[];
  return {attr,tags,viewBox:svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number)};
}

test('preview shows exactly the marked crossings, rows and ticks in the layout table',()=>{
  for(const axes of T.AXIS_OPTIONS){
    const d=design({axes,repeats:axes===2?5:6});
    assert.equal(d.ok,true);
    const svg=T.buildPreviewSvg(d,{width:420});
    const p=parseSvg(svg);
    const nodes=p.tags('tw-node').filter((t)=>!/data-mirror/.test(t));
    const expected=d.rows.reduce((sum,row)=>sum+row.axisNumbers.length,0);
    assert.equal(nodes.length,expected);
    const padL=44,padR=12,padT=24;
    const plotW=420-padL-padR;
    const plotH=Math.round(Math.min(230,Math.max(120,plotW*0.42)));
    nodes.forEach((tag)=>{
      const row=d.rows[Number(p.attr(tag,'data-row'))];
      const axis=d.axes[Number(p.attr(tag,'data-axis'))-1];
      assert.ok(row.axisNumbers.includes(axis.number));
      close(Number(p.attr(tag,'cx')),padL+row.positionMm/250*plotW,0.01,'marker x');
      close(Number(p.attr(tag,'cy')),padT+axis.angleDeg/360*plotH,0.01,'marker y');
    });
    const rowLines=p.tags('tw-row');
    assert.equal(rowLines.length,d.rows.length);
    rowLines.forEach((tag)=>close(Number(p.attr(tag,'x1')),padL+d.rows[Number(p.attr(tag,'data-row'))].positionMm/250*plotW,0.01));
    const ticks=p.tags('tw-tick');
    assert.equal(ticks.length,d.rows.length);
    ticks.forEach((tag)=>close(Number(p.attr(tag,'x1')),padL+d.rows[Number(p.attr(tag,'data-row'))].positionMm/250*plotW,0.01));
    assert.equal(p.tags('tw-axis').length,axes+1);
    assert.equal(p.tags('tw-main').length,axes);
    assert.equal(p.tags('tw-accent').length,axes*2*1);
  }
});

test('accent thread count controls the number of accent paths',()=>{
  const none=T.buildPreviewSvg(design({repeats:5,accentThreads:0}),{width:340});
  assert.equal(parseSvg(none).tags('tw-accent').length,0);
  for(const k of [1,2,3]){
    const svg=T.buildPreviewSvg(design({repeats:5,axes:4,accentThreads:k}),{width:340});
    assert.equal(parseSvg(svg).tags('tw-accent').length,4*2*k);
  }
});

test('preview scales to iPhone and MacBook widths and keeps every marker inside the plot',()=>{
  const d=design({axes:6,repeats:12,lengthMm:500});
  assert.equal(d.ok,true,JSON.stringify(d.errors));
  for(const width of [100,280,340,390,760,1400]){
    const svg=T.buildPreviewSvg(d,{width});
    const p=parseSvg(svg);
    const expectedWidth=Math.round(Math.min(900,Math.max(260,width)));
    assert.equal(p.viewBox[0],expectedWidth);
    assert.ok(p.viewBox[1]>150 && p.viewBox[1]<400,`height ${p.viewBox[1]}`);
    const plotRight=expectedWidth-12;
    p.tags('tw-node').forEach((tag)=>{
      const cx=Number(p.attr(tag,'cx')),cy=Number(p.attr(tag,'cy'));
      assert.ok(cx>=44-0.01 && cx<=plotRight+0.01,`cx ${cx} at width ${width}`);
      assert.ok(cy>=24-0.01 && cy<=p.viewBox[1],`cy ${cy}`);
    });
    // row numbers thin out so labels cannot collide on narrow screens
    const labels=(svg.match(/class="tw-rowlabel"/g)||[]).length;
    const plotW=expectedWidth-56;
    assert.ok(labels*14<=plotW+14*2,`${labels} row labels in ${plotW}px`);
  }
});

test('preview contains no text other than numbers and fixed labels (no injected content)',()=>{
  const svg=T.buildPreviewSvg(design({repeats:5}),{width:340});
  const texts=[...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m)=>m[1]);
  texts.forEach((text)=>assert.match(text,/^(\d+|A\d( \d+(\.\d+)?&#176;)?|Butt end|Tip end)$/));
  assert.match(svg,/role="img"/);
  assert.match(svg,/aria-label="Diamond cross-wrap preview: 5 repeats, 2 axes, Black main thread, Gold accent/);
});

test('instructions describe exactly the generated design',()=>{
  for(const axes of T.AXIS_OPTIONS){
    const d=design({axes,repeats:axes===2?5:6,accentThreads:2,mainColour:'red',accentColour:'silver'});
    const steps=T.buildInstructions(d);
    assert.deepEqual(steps.map((s)=>s.id),['axes','check','mark','anchor','passes','accent','finish']);
    const text=steps.map((s)=>s.lines.join('\n')).join('\n');
    const R=d.summary.rowCount;
    assert.ok(steps[2].title.includes(`${R+1} crossing points`));
    assert.ok(steps[0].lines.join(' ').includes('250 mm'));
    d.axes.forEach((axis)=>{if(axes>2)assert.ok(steps[0].lines.join(' ').includes(`Axis ${axis.number}: ${axis.angleDeg}°`));});
    if(axes===2)assert.ok(steps[0].lines.join(' ').includes('180°'));
    assert.equal(steps[4].lines.filter((line)=>/pass \d+:/.test(line)).length,d.passes.length);
    d.passes.forEach((pass)=>{
      const line=steps[4].lines.find((l)=>l.startsWith(`${pass.hand==='clockwise'?'Clockwise':'Anticlockwise'} pass ${pass.number}:`));
      assert.ok(line,pass.id);
      assert.ok(line.includes(`start at Axis ${pass.startAxisNumber}, row 0`));
      assert.ok(line.includes(`finishes on Axis ${pass.endAxisNumber}, row ${R}`));
      assert.ok(line.includes(`after ${pass.turns} turn`));
    });
    assert.ok(steps[4].title.includes(`${axes} red centre-line spirals`));
    assert.ok(steps[5].title.includes('2 silver threads each side'));
    assert.match(steps[5].lines[0],/snugly alongside the established threads, following the developing diamond pattern/);
    assert.match(steps[5].lines[0],/does not need to pass through the exact crossing marks/);
    assert.doesNotMatch(steps[5].lines[0],/through the same marks/);
    assert.ok(steps[5].lines.join(' ').includes(`${2*2*axes} in all`));
    assert.ok(text.includes('The gaps grow from'));
    assert.ok(steps[2].lines.join(' ').includes('Row '+R));
    const evenAxes=d.rows[0].axisNumbers.map((k)=>`Axis ${k}`).join(', ');
    if(axes>2)assert.ok(steps[2].lines.join(' ').includes(evenAxes));
  }
  const noAccent=T.buildInstructions(design({repeats:5,accentThreads:0}));
  assert.match(noAccent[5].title,/none selected/);
  const thick=T.buildInstructions(design({repeats:5,buttDiameterMm:15.3,tipDiameterMm:16.9}));
  assert.match(thick[2].lines.join(' '),/gaps shrink/);
  const flat=T.buildInstructions(design({repeats:5,buttDiameterMm:16,tipDiameterMm:16}));
  assert.match(flat[2].lines.join(' '),/same size at both ends/);
});

test('instructions use the supplied unit formatter for every length',()=>{
  const d=design({repeats:5});
  const fmt={length:(mm)=>`${(mm/25.4).toFixed(2)} in`,degrees:(deg)=>`${deg.toFixed(0)} deg`};
  const text=T.buildInstructions(d,fmt).map((s)=>s.lines.join(' ')).join(' ');
  assert.ok(text.includes(`${(250/25.4).toFixed(2)} in`));
  assert.ok(!/\bmm\b/.test(text));
});

test('thread estimates are positive, not shorter than the wrap, and scale with accent threads',()=>{
  const d=design({repeats:5,accentThreads:2});
  assert.ok(d.summary.threadPerStrandMm>250);
  close(d.summary.mainThreadMm,d.summary.threadPerStrandMm*d.passes.length,1e-9);
  close(d.summary.accentThreadMm,d.summary.mainThreadMm*4,1e-9);
  assert.equal(design({repeats:5,accentThreads:0}).summary.accentThreadMm,0);
});

test('documented practice and assumptions are listed separately with sources',()=>{
  assert.ok(T.DOCUMENTED.length>=6);
  T.DOCUMENTED.forEach((item)=>{
    assert.ok(item.sources.length>0);
    item.sources.forEach((id)=>assert.ok(T.SOURCES.find((s)=>s.id===id),id));
  });
  assert.ok(T.ASSUMPTIONS.some((a)=>a.id==='linear-taper'));
  assert.ok(T.ASSUMPTIONS.some((a)=>a.id==='more-axes'));
  T.SOURCES.forEach((s)=>{assert.match(s.url,/^https:\/\//);assert.ok(s.short.length>3);});
  assert.equal(new Set(T.SOURCES.map((s)=>s.short)).size,T.SOURCES.length,'source labels are distinct');
  assert.ok(T.SOURCES.some((s)=>/rodguild\.com/.test(s.url)) && T.SOURCES.some((s)=>/rodhouse\.com/.test(s.url)));
});

test('the engine does not mutate its input and is deterministic',()=>{
  const input={...base,repeats:5};
  const before=JSON.stringify(input);
  const first=T.designDiamondWrap(input);
  const second=T.designDiamondWrap(input);
  assert.equal(JSON.stringify(input),before);
  assert.deepEqual(first,second);
});
