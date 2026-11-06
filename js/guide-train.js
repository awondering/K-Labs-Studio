/* K-Labs Studio - Guide Train Designer geometry engine (prototype: reduction train, running guides, measured guides).
   Pure functions only: no DOM access, storage, pricing or network. This file is ASCII-only on purpose, so
   no page charset can corrupt it. All lengths are millimetres, all angles are degrees.

   WHAT THIS MODEL IS
   An original, purely geometric side-view model of how spinning-reel line leaves the spool and is gathered by
   a train of guides. It is NOT a casting-performance model, it does not copy any manufacturer's chart or
   formula, and it contains no guide catalogue: every ring size and height is either typed in by the user or
   a computed minimum.

   COORDINATES (side view, everything in one vertical plane through the blank)
     x = distance along the blank axis from the butt end, 0 .. rodLength (the tip is at x = rodLength).
     y = distance BELOW the blank axis (positive = towards the line side). The blank occupies |y| <= r(x),
         where r(x) is half of the blank diameter, linear between the butt and tip diameters.
   Distances "from the tip" are rodLength - x.

   THREE SEPARATE GUIDE MEASUREMENTS (guide geometry)
   A real guide is a rigid frame. Its ring size and the height of its ring above the foot are fixed by the guide;
   only where the foot is wrapped on the blank is chosen by the builder. The model keeps the three apart:
     1. Ring inner diameter  idMm            - a property of the guide.
     2. Centre height        centreHeightMm  - distance from the BLANK SURFACE (where the foot sits) up to the ring
                                               centre, measured square to the blank. A property of the guide.
     3. Mounting position    xMm             - where the guide is mounted along the blank. The builder chooses it.
   The ring centre therefore sits at  y = r(x) + centreHeightMm  (axis-referenced, used for the line path), so a
   guide moved along a tapering blank keeps its own height above the blank surface and its axis height follows
   the taper. Ring clearance to the blank is exactly  centreHeightMm - idMm / 2  and must not be negative.
   Mounting position is taken to be the position of the ring plane. Ring offset from the foot (single-foot frames),
   foot length, wrap thickness and ring wall thickness are NOT modelled.

   ILLUSTRATIVE GEOMETRY and MEASURED GUIDES
   Until a builder enters a guide's measured ring diameter and centre height, that guide is ILLUSTRATIVE: its size and
   height are proposals computed from the line path and are not guide specifications. Once measured values are
   entered (or chosen from the builder's own guide set) they are PHYSICAL CONSTRAINTS: the engine never changes
   them, it moves the guide instead. Mixed trains are allowed, guide by guide.
   Proposed positions around constraints (the first-fit rule): a guide is placed at the first position, going from the
   reel toward the tip, where its ring is large enough for the line cone at that point, using its fixed ring
   diameter and (if measured) its fixed height above the blank, with the line path bending through the actual ring
   centres. The path length to the guide depends on the position through its height, so the position is found by
   scanning and refining (bisection) along the rod. If no position on the rod makes the ring fit, the engine does not
   change the guide: it places it where the shortfall is smallest and reports 'no-fit-position'.

   THE LINE ENVELOPE (the key idea)
   Line leaves a fixed spool in coils. We model the cloud of coils as a cone around the line path:
     D(s) = max( settledLine , spoolDiameter - 2 * s * tan(flareHalfAngle) )
   where s is the distance travelled along the line path from the spool lip. The cone starts at the spool
   diameter at the lip, narrows linearly with the flare half-angle, and stops narrowing once it reaches the
   settled line diameter. The distance where it stops narrowing is the GEOMETRIC CHOKE:
     s_choke = (spoolDiameter - settledLine) / (2 * tan(flareHalfAngle)).
   The flare half-angle and the settled line diameter are ASSUMPTIONS the user can edit; they are not
   industry values and are not derived from measurements.

   THE LINE PATH
   The line is taken to pass through the centre of every guide ring (a taut-line assumption):
     spool lip -> stripper -> reduction guides -> tip-top, as straight segments, with the actual centre heights
   the user enters. The line leaves the spool along the reel axis, so the stripper ring centre should sit near
   that axis: its perpendicular distance e from the reel-axis ray is added to the stripper's required size.

   FIT RULE
   A ring is large enough when its inner diameter is at least the envelope diameter at the ring, plus the user's
   clearance, plus twice any off-axis distance:
     requiredID = D(s_ring) * (1 + clearance) + 2 * e      (e = 0 except for the stripper)

   INITIAL REDUCTION TRAIN (proposal)
     1. Stripper: placed where the envelope just fits its ring:  D(s1) = stripperID / (1 + clearance).
     2. n reduction guides follow, the last one at the geometric choke. Their required ring sizes step down
        by a constant ratio: ID_k = stripperID * rho^k with rho = (chokeID / stripperID)^(1/n), where
        chokeID = settledLine * (1 + clearance). Each guide sits where the envelope equals ID_k / (1 + clearance).
     3. Reduction-guide centre heights are proposed on the line path: on the reel-axis ray at the stripper, then on the
        straight chord from the stripper to the tip-top centre.
     4. If the choke would fall beyond the tip, the chain is compressed to end 5 % of the stripper-to-tip
        distance before the tip-top, and a warning is raised.
   Proposed ring sizes are rounded UP to the next 0.5 mm. They are computed minimums, not product specifications.

   RUNNING GUIDES (Phase 2, provisional proposal)
   Runners fill the span between the last reduction guide (the choke guide) and the tip-top. There is NO
   universal formula for where running guides belong: it depends on the blank's bend, the line and the owner's
   preferences, and it must be settled by a static-load test on the real blank. This engine therefore offers only
   an explicit, adjustable starting progression:
     - r runners create r + 1 gaps between the choke guide, the runners and the tip-top.
     - The gaps form a geometric progression G_k = G_1 * q^(k-1), k = 1..r+1, listed from the choke toward the
       tip, and they add up to the available span S = rodLength - (choke guide position):
         G_1 = S * (1 - q) / (1 - q^(r+1))       (G_1 = S / (r+1) when q = 1).
       q < 1 packs the runners closer together toward the tip, q = 1 spaces them evenly, q > 1 does the opposite.
       The default q is a starting value for the owner to adjust, not an industry value.
     - The last gap (last runner to tip-top) is never allowed below the minimum gap setting. If the progression
       would make it shorter, it is set to the minimum and the other gaps share the remaining span with the same ratio.
     - Runners are physical guides, not line-path points. Every runner shares ONE ring size and ONE ring-centre
       height above the blank surface (editable settings, default illustrative values). Mounting position changes
       only where a runner sits; blank taper changes only its axis height (blank radius + centre height). A runner
       differs from the others only when the builder explicitly chooses a different ring or measured guide for it.
       The line path is then drawn through the actual ring centres, never the other way round.
     - The reduction train ends on a ring no smaller than the runner ring, and a warning is raised when the runners
       are taller than the choke guide or their ring would overlap the blank. Nothing is silently changed.
     - A runner edited by the user must stay at least the minimum gap from its neighbours. Tight proposals are
       reported as warnings.
   The reduction train, the choke and the line path are calculated exactly as in Phase 1; with zero runners the
   output is identical to Phase 1.

   LIMITATIONS (also shown in the app)
     - Guide dimensions are only what the builder enters. There is no guide catalogue and no manufacturer data.
     - Geometry only. It says nothing about casting distance, line friction, rod action, guide weight or
       whether a guide model exists in the sizes proposed.
     - Rod bend under load is ignored (a straight, unloaded blank).
     - Guides are in one plane; spiral or offset guide trains are not modelled.
     - The line envelope is a straight cone; real coil behaviour depends on line, spool fill and technique.
     - Ring wall thickness and frame geometry are ignored.
     - Running-guide positions are a provisional starting progression. They are not derived from blank
       deflection, so they must be checked against the actual blank and a static-load test.
     - Nothing here has been physically validated. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.KLabsGuideTrain=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  const MODEL_ID='line-cone-polyline';
  const MODEL_VERSION=2;

  // key, label (used in messages), kind, min, max
  const FIELDS=[
    {key:'rodLengthMm',label:'rod length',kind:'length',min:600,max:4000},
    {key:'buttOdMm',label:'blank diameter at the butt end',kind:'length',min:0.5,max:60},
    {key:'tipOdMm',label:'blank diameter at the tip end',kind:'length',min:0.3,max:40},
    {key:'spoolLipMm',label:'spool lip position from the butt',kind:'length',min:0,max:4000},
    {key:'spoolDiameterMm',label:'spool diameter',kind:'length',min:15,max:90},
    {key:'reelHeightMm',label:'reel axis height below the blank axis',kind:'length',min:0,max:150},
    {key:'reelAngleDeg',label:'reel axis angle',kind:'angle',min:-15,max:15},
    {key:'reductionCount',label:'reduction guide count',kind:'int',min:1,max:12},
    {key:'stripperIdMm',label:'stripper ring inner diameter',kind:'length',min:5,max:80},
    {key:'tipTopIdMm',label:'tip-top ring inner diameter',kind:'length',min:1,max:30},
    {key:'tipTopCentreHeightMm',label:'tip-top ring centre height above the blank',kind:'length',min:0,max:60},
    {key:'flareAngleDeg',label:'line flare half-angle',kind:'angle',min:0.2,max:8},
    {key:'settledLineMm',label:'settled line diameter',kind:'length',min:0.5,max:15},
    {key:'clearancePct',label:'ring clearance',kind:'percent',min:0,max:100},
    // Phase 2. With runnerCount 0 the design is identical to Phase 1.
    {key:'runnerCount',label:'running guide count',kind:'int',min:0,max:12},
    {key:'runnerRatio',label:'running guide spacing ratio',kind:'ratio',min:0.5,max:1.5},
    {key:'runnerMinGapMm',label:'minimum running guide gap',kind:'length',min:10,max:300},
    // One physical specification shared by every running guide (a builder normally uses identical runners).
    {key:'runnerIdMm',label:'running guide ring inner diameter',kind:'length',min:1,max:80},
    {key:'runnerCentreHeightMm',label:'running guide ring centre height above the blank',kind:'length',min:0,max:200},
  ];
  const FIELD_BY_KEY=FIELDS.reduce((map,field)=>{map[field.key]=field;return map;},{});
  const GUIDE_LIMITS={idMm:{min:1,max:80},centreHeightMm:{min:0,max:200}};
  const PROPOSAL_MIN_STEP_MM=0.2;
  const SCAN_STEP_MM=0.5;
  const FIT_TOLERANCE_MM=1e-9;
  const MIN_GAP_MM=0.1;
  const CHAIN_END_FRACTION=0.05;

  // Example measurements so the prototype opens with a working design. Replace them with your own.
  const DEFAULTS={
    rodLengthMm:2130,
    buttOdMm:14,
    tipOdMm:2.4,
    spoolLipMm:560,
    spoolDiameterMm:40,
    reelHeightMm:36,
    reelAngleDeg:0,
    reductionCount:5,
    stripperIdMm:30,
    tipTopIdMm:5,
    tipTopCentreHeightMm:2.8,
    flareAngleDeg:1.5,
    settledLineMm:4,
    clearancePct:25,
    runnerCount:4,
    runnerRatio:0.85,
    runnerMinGapMm:50,
    runnerIdMm:5,
    runnerCentreHeightMm:6,
  };

  const METHOD_STEPS=[
    'Coordinates: x runs along the blank from the butt, y is the distance below the blank axis. The blank is a straight taper between the two diameters you enter.',
    'Line envelope: line leaves the spool as a cone of coils. Its diameter is D(s) = spool diameter - 2 x s x tan(flare half-angle), where s is the distance along the line from the spool lip, and it stops narrowing at the settled line diameter.',
    'Geometric choke: the distance where the envelope reaches the settled line diameter, s = (spool diameter - settled line) / (2 x tan(flare half-angle)).',
    'Line path: straight segments through the centre of the stripper, each reduction guide and the tip-top, using the heights you enter. The line leaves the spool along the reel axis.',
    'Fit rule: required ring ID = D(s) x (1 + clearance), plus twice the distance the stripper centre sits off the reel axis.',
    'Initial train: the stripper sits where the envelope just fits its ring. Required ring sizes then step down by a constant ratio to the settled-line ring, and each guide sits where the envelope equals its required size. The last reduction guide is at the choke.',
    'Guide geometry: a guide\'s ring size, its ring centre height above the blank surface and its mounting position are separate. Size and height belong to the guide; only the mounting position is chosen. The ring centre sits at the blank radius plus the centre height, so it follows the blank taper.',
    'Measured guides: a ring size or centre height you enter is treated as fixed. The guide is placed at the first point from the reel where its ring is large enough for the line cone, with the line path bending through the actual ring centres. If no position works the entered values are kept and a warning is shown.',
    'Illustrative guides: without measurements, reduction-guide sizes and heights are proposals on the line path (running guides use the shared runner ring and height instead). Edit any size, height or position and everything recalculates from your values.',
    'Running guides: all runners share one ring size and one ring-centre height above the blank, so identical guides stay identical wherever they are mounted. The span from the choke guide to the tip-top is divided into gaps that shrink by a fixed ratio toward the tip, and the last gap is never shorter than the minimum gap. This is an adjustable starting progression, not a formula for the right positions.',
  ];
  const ASSUMPTIONS=[
    'The flare half-angle, the settled line diameter and the ring clearance are modelling assumptions you can edit. They are not industry values.',
    'The line passes through the centre of every guide ring and the envelope is a straight cone.',
    'The blank is straight and unloaded, and all guides lie in one vertical plane.',
    'Ring wall thickness, frame shape and guide weight are ignored.',
    'Proposed ring sizes are computed minimums rounded up to 0.5 mm. They are not product specifications.',
    'The running-guide spacing ratio, minimum gap, ring size and frame height are adjustable starting values, not industry values or product specifications.',
    'Guides without measurements are illustrative: their sizes and heights are proposals, not guide specifications.',
    'Mounting position is taken as the ring plane. Ring offset from the foot, foot length, wraps and ring wall thickness are ignored.',
  ];
  const LIMITATIONS=[
    'Geometry only: nothing here predicts casting distance, friction or rod performance.',
    'Running-guide positions are provisional: check them against the real blank under load and a static-load test, and adjust them there.',
    'Only the guide dimensions you enter are used. There is no guide catalogue and no manufacturer data.',
    'Not physically validated on a real rod.',
  ];

  const DEFAULT_FMT={
    length(mm){return `${(Math.round(mm*10)/10).toFixed(1).replace(/\.0$/,'')} mm`;},
    degrees(deg){return `${(Math.round(deg*10)/10).toFixed(1).replace(/\.0$/,'')} deg`;},
  };

  const rad=(d)=>d*Math.PI/180;
  const deg=(r)=>r*180/Math.PI;
  const isNumber=(v)=>typeof v==='number' && Number.isFinite(v);
  const isBlank=(v)=>v===undefined || v===null || v==='';
  const round=(v,places)=>{const f=Math.pow(10,places);return Math.round(v*f)/f;};
  const ceilHalf=(v)=>Math.ceil(v*2-1e-9)/2;
  const cap=(text)=>text.charAt(0).toUpperCase()+text.slice(1);
  const hypot=Math.hypot;

  function bladeRadius(v,x){
    return (v.buttOdMm+(v.tipOdMm-v.buttOdMm)*(x/v.rodLengthMm))/2;
  }

  function buildModel(v){
    const tanAlpha=Math.tan(rad(v.flareAngleDeg));
    const fit=1+v.clearancePct/100;
    const model={
      tanAlpha,fit,
      cosT:Math.cos(rad(v.reelAngleDeg)),
      sinT:Math.sin(rad(v.reelAngleDeg)),
      spool:v.spoolDiameterMm,
      settled:v.settledLineMm,
      sChoke:(v.spoolDiameterMm-v.settledLineMm)/(2*tanAlpha),
    };
    model.envelope=(s)=>Math.max(model.settled,model.spool-2*Math.max(0,s)*tanAlpha);
    model.sForDiameter=(d)=>(model.spool-d)/(2*tanAlpha);
    return model;
  }

  function checkFields(src,f){
    const errors=[];
    const err=(field,code,message)=>errors.push({field,code,message});
    FIELDS.forEach((field)=>{
      const value=src[field.key];
      if(isBlank(value)){
        err(field.key,'missing',`Enter the ${field.label}.`);
      }else if(!isNumber(value)){
        err(field.key,'invalid',`The ${field.label} is not a valid number.`);
      }else if(field.kind==='int' && !Number.isInteger(value)){
        err(field.key,'range',`The ${field.label} must be a whole number from ${field.min} to ${field.max}.`);
      }else if(value<field.min || value>field.max){
        const range=field.kind==='angle'
          ?`${f.degrees(field.min)} and ${f.degrees(field.max)}`
          :field.kind==='percent'
            ?`${field.min}% and ${field.max}%`
            :field.kind==='int' || field.kind==='ratio'
              ?`${field.min} and ${field.max}`
              :`${f.length(field.min)} and ${f.length(field.max)}`;
        err(field.key,'range',`${cap(field.label)} must be between ${range}.`);
      }
    });
    return errors;
  }

  function checkGeometry(v,f){
    const errors=[];
    const err=(field,code,message)=>errors.push({field,code,message});
    if(v.spoolLipMm>=v.rodLengthMm-50){
      err('spoolLipMm','spool-beyond-tip','The spool lip must sit well before the tip of the rod.');
    }
    if(v.spoolDiameterMm<=v.settledLineMm){
      err('settledLineMm','settled-too-big','The settled line diameter must be smaller than the spool diameter.');
    }
    const spoolTop=v.reelHeightMm-v.spoolDiameterMm/2;
    if(spoolTop<bladeRadius(v,v.spoolLipMm)){
      err('reelHeightMm','spool-in-blank','The spool would overlap the blank. Increase the reel axis height or reduce the spool diameter.');
    }
    return errors;
  }

  // Gaps from the choke guide to the tip-top: a geometric progression (ratio q from one gap to the next toward
  // the tip) that sums to the span, with the last gap raised to the minimum when the progression makes it shorter.
  function planRunnerGaps(spanMm,count,ratio,minGapMm){
    const n=count+1;
    const weights=[];
    for(let k=0;k<n;k+=1)weights.push(Math.pow(ratio,k));
    const total=weights.reduce((a,b)=>a+b,0);
    let gaps=weights.map((w)=>spanMm*w/total);
    let tipGapRaised=false;
    if(count>0 && gaps[n-1]<minGapMm && spanMm>minGapMm){
      const restWeight=total-weights[n-1];
      gaps=weights.slice(0,count).map((w)=>(spanMm-minGapMm)*w/restWeight);
      gaps.push(minGapMm);
      tipGapRaised=true;
    }
    return {gaps,tipGapRaised};
  }

  // Smallest x in [lo,hi] where margin(x) >= 0, found by scanning then bisection. If no x qualifies, the x with the
  // largest margin is returned and solved is false.
  function firstFit(margin,lo,hi){
    const first=margin(lo);
    if(first>=-FIT_TOLERANCE_MM)return {x:lo,margin:first,solved:true};
    if(hi<=lo)return {x:lo,margin:first,solved:false};
    let best={x:lo,margin:first};
    let prev=lo;
    for(let x=lo+SCAN_STEP_MM;;x+=SCAN_STEP_MM){
      const xx=Math.min(x,hi);
      const value=margin(xx);
      if(value>=-FIT_TOLERANCE_MM){
        let a=prev;
        let b=xx;
        for(let i=0;i<60;i+=1){
          const mid=(a+b)/2;
          if(margin(mid)>=-FIT_TOLERANCE_MM)b=mid;else a=mid;
        }
        return {x:b,margin:margin(b),solved:true};
      }
      if(value>best.margin)best={x:xx,margin:value};
      prev=xx;
      if(xx>=hi)break;
    }
    return {x:best.x,margin:best.margin,solved:false};
  }

  // Initial train. constraints[i] may carry the measured idMm and/or centreHeightMm of guide i; those are physical and are
  // never changed here, the guide is moved instead. Returns {ok:false,errors} or {ok:true,model,guides,...}.
  function proposeTrain(v,fmt,constraints){
    const f={...DEFAULT_FMT,...(fmt||{})};
    const m=buildModel(v);
    const errors=[];
    const err=(field,code,message)=>errors.push({field,code,message});
    const con=Array.isArray(constraints)?constraints:[];
    const conAt=(i)=>(con[i] && typeof con[i]==='object'?con[i]:{});
    const measuredId=(i)=>isNumber(conAt(i).idMm);
    const measuredHeight=(i)=>isNumber(conAt(i).centreHeightMm);
    const lastIndex=v.reductionCount+v.runnerCount+1;
    const stripperId=measuredId(0)?conAt(0).idMm:v.stripperIdMm;
    const stripperField=measuredId(0)?'guide0.idMm':'stripperIdMm';
    const tipId=measuredId(lastIndex)?conAt(lastIndex).idMm:v.tipTopIdMm;
    const tipCentre=measuredHeight(lastIndex)?conAt(lastIndex).centreHeightMm:v.tipTopCentreHeightMm;
    const tipY=bladeRadius(v,v.rodLengthMm)+tipCentre;
    const stripperEnvelope=stripperId/m.fit;
    // The reduction train ends on a ring no smaller than the running guides that follow it.
    const runnerFloor=v.runnerCount>0?v.runnerIdMm:0;
    const chokeId=Math.max(v.settledLineMm*m.fit,runnerFloor);
    if(stripperEnvelope>=v.spoolDiameterMm){
      err(stripperField,'stripper-too-big','The stripper ring is as large as the line cone at the spool, so it would have to sit on the spool. Use a smaller stripper ring.');
    }
    if(stripperId<=chokeId){
      err(stripperField,'not-reducing',`The stripper ring must be larger than ${f.length(chokeId)}, the smallest ring the line and the running guides need, otherwise there is nothing to reduce.`);
    }
    if(errors.length)return {ok:false,errors};

    // Stripper: on the reel axis line when illustrative, or at its measured height above the blank.
    let s1;
    let x1;
    let y1;
    let stripperSolved=true;
    let stripperShortfall=0;
    if(!measuredHeight(0)){
      s1=m.sForDiameter(stripperEnvelope);
      x1=v.spoolLipMm+s1*m.cosT;
      y1=v.reelHeightMm-s1*m.sinT;
    }else{
      const centre=conAt(0).centreHeightMm;
      const margin=(x)=>{
        const dx=x-v.spoolLipMm;
        const dy=bladeRadius(v,x)+centre-v.reelHeightMm;
        const off=Math.abs(dx*m.sinT+dy*m.cosT);
        return stripperId-(m.envelope(hypot(dx,dy))*m.fit+2*off);
      };
      const fit=firstFit(margin,v.spoolLipMm+1,v.rodLengthMm-CHAIN_END_FRACTION*(v.rodLengthMm-v.spoolLipMm));
      x1=fit.x;
      y1=bladeRadius(v,x1)+centre;
      s1=hypot(x1-v.spoolLipMm,y1-v.reelHeightMm);
      stripperSolved=fit.solved;
      stripperShortfall=fit.solved?0:-fit.margin;
    }
    if(x1>=v.rodLengthMm){
      return {ok:false,errors:[{field:stripperField,code:'stripper-beyond-tip',message:'With these settings the stripper would fall beyond the tip of the rod. Use a smaller stripper ring or a larger flare angle.'}]};
    }
    const dxc=v.rodLengthMm-x1;
    const dyc=tipY-y1;
    const chord=hypot(dxc,dyc);
    const cosPsi=dxc/chord;
    const chordY=(x)=>y1+(x-x1)*dyc/dxc;
    const chokeX=m.sChoke<=s1?v.spoolLipMm+m.sChoke*m.cosT:x1+(m.sChoke-s1)*cosPsi;
    const endLimit=v.rodLengthMm-CHAIN_END_FRACTION*(v.rodLengthMm-x1);
    let sEnd=m.sChoke;
    let chainCompressed=false;
    if(chokeX>endLimit){
      sEnd=s1+(endLimit-x1)/cosPsi;
      chainCompressed=true;
    }
    const endId=Math.max(m.envelope(sEnd)*m.fit,runnerFloor);
    const rho=Math.pow(endId/stripperId,1/v.reductionCount);
    const guides=[{
      role:'stripper',xMm:x1,idMm:stripperId,heightMm:y1,centreHeightMm:y1-bladeRadius(v,x1),targetIdMm:stripperId,sMm:s1,
      solved:stripperSolved,shortfallMm:stripperShortfall,
    }];
    let prevX=x1;
    let prevY=y1;
    let prevS=s1;
    let onChord=true;
    const noRoom=()=>({ok:false,errors:[{field:'reductionCount',code:'no-room',message:'There is not enough room on the rod for these guides. Use fewer guides or a smaller stripper ring.'}]});
    for(let k=1;k<=v.reductionCount;k+=1){
      const ratioTarget=stripperId*Math.pow(rho,k);
      const target=measuredId(k)?conAt(k).idMm:ratioTarget;
      let xk;
      let yk;
      let sk;
      let solved=true;
      let shortfall=0;
      if(!measuredHeight(k) && onChord){
        sk=m.sForDiameter(target/m.fit);
        xk=x1+(sk-s1)*cosPsi;
        if(target/m.fit<m.settled-FIT_TOLERANCE_MM || xk>endLimit){
          // Even the narrowest line cone cannot pass this ring (or it would fall past the chain end).
          xk=Math.max(prevX+PROPOSAL_MIN_STEP_MM,Math.min(endLimit,xk));
          sk=s1+(xk-x1)/cosPsi;
          shortfall=Math.max(0,m.envelope(sk)*m.fit-target);
          solved=shortfall<=1e-9;
        }else if(xk<prevX+PROPOSAL_MIN_STEP_MM){
          xk=prevX+PROPOSAL_MIN_STEP_MM;
          sk=s1+(xk-x1)/cosPsi;
        }
        yk=chordY(xk);
      }else{
        const heightAt=measuredHeight(k)?(x)=>bladeRadius(v,x)+conAt(k).centreHeightMm:chordY;
        const margin=(x)=>target-m.envelope(prevS+hypot(x-prevX,heightAt(x)-prevY))*m.fit;
        const low=prevX+PROPOSAL_MIN_STEP_MM;
        const fit=firstFit(margin,low,Math.max(low,endLimit));
        xk=fit.x;
        yk=heightAt(xk);
        sk=prevS+hypot(xk-prevX,yk-prevY);
        solved=fit.solved;
        shortfall=fit.solved?0:-fit.margin;
        if(measuredHeight(k))onChord=false;
      }
      if(xk>=v.rodLengthMm-0.5)return noRoom();
      guides.push({
        role:k===v.reductionCount?'choke':'reduction',
        xMm:xk,idMm:measuredId(k)?target:ceilHalf(target),heightMm:yk,centreHeightMm:yk-bladeRadius(v,xk),targetIdMm:target,sMm:sk,
        solved,shortfallMm:shortfall,
      });
      prevX=xk;prevY=yk;prevS=sk;
    }
    const chokeGuideX=guides[guides.length-1].xMm;
    const plan=planRunnerGaps(v.rodLengthMm-chokeGuideX,v.runnerCount,v.runnerRatio,v.runnerMinGapMm);
    let runnerX=chokeGuideX;
    for(let k=0;k<v.runnerCount;k+=1){
      const index=v.reductionCount+1+k;
      runnerX+=plan.gaps[k];
      // A running guide is a physical guide: its ring and frame height come from the shared runner specification (or
      // the builder's own measurement), never from the line path. Only the mounting position varies.
      const target=measuredId(index)?conAt(index).idMm:v.runnerIdMm;
      const centre=measuredHeight(index)?conAt(index).centreHeightMm:v.runnerCentreHeightMm;
      const yk=bladeRadius(v,runnerX)+centre;
      const sk=prevS+hypot(runnerX-prevX,yk-prevY);
      guides.push({
        role:'runner',xMm:runnerX,idMm:target,heightMm:yk,centreHeightMm:centre,
        targetIdMm:target,sMm:sk,solved:true,shortfallMm:0,
      });
      prevX=runnerX;prevY=yk;prevS=sk;
    }
    guides.push({
      role:'tip-top',xMm:v.rodLengthMm,idMm:tipId,heightMm:tipY,centreHeightMm:tipCentre,targetIdMm:tipId,sMm:null,solved:true,shortfallMm:0,
    });
    return {ok:true,model:m,guides,ratio:rho,chainCompressed,stripperArcMm:s1,chokeXMm:chokeX,runnerGapsMm:plan.gaps,tipGapRaised:plan.tipGapRaised,errors:[]};
  }

  // count is the total number of guides; runnerCount (default 0) is how many of them are running guides.
  function guideLabel(index,count,runnerCount){
    const runners=runnerCount||0;
    if(index===0)return 'Stripper';
    if(index===count-1)return 'Tip-top';
    const chokeIndex=count-2-runners;
    if(index>chokeIndex)return `Runner ${index-chokeIndex}`;
    return index===chokeIndex?`Guide ${index} (choke)`:`Guide ${index}`;
  }

  // Full design: validation, proposal, user overrides, evaluation of the actual guides.
  function designGuideTrain(raw,fmt){
    const f={...DEFAULT_FMT,...(fmt||{})};
    const src=raw&&typeof raw==='object'?raw:{};
    const fieldErrors=checkFields(src,f);
    if(fieldErrors.length)return {ok:false,errors:fieldErrors,warnings:[]};
    const v={};
    FIELDS.forEach((field)=>{v[field.key]=src[field.key];});
    const geometryErrors=checkGeometry(v,f);
    if(geometryErrors.length)return {ok:false,errors:geometryErrors,warnings:[]};
    const count=v.reductionCount+v.runnerCount+2;
    const overrides=Array.isArray(src.guides)?src.guides:[];
    const errors=[];
    const warnings=[];
    const err=(field,code,message)=>errors.push({field,code,message});
    const warn=(field,code,message)=>warnings.push({field,code,message});

    // The builder's entries: position, measured ring diameter and measured centre height above the blank. A blank entry
    // means "illustrative" (undefined). A valid ring diameter or centre height is a physical constraint.
    const parsed=[];
    for(let index=0;index<count;index+=1){
      const o=overrides[index] && typeof overrides[index]==='object'?overrides[index]:{};
      const label=guideLabel(index,count,v.runnerCount);
      const pick=(own,key,name,limits)=>{
        if(isBlank(own))return undefined;
        if(!isNumber(own)){
          err(`guide${index}.${key}`,'guide-invalid',`${label}: the ${name} is not a valid number.`);
          return undefined;
        }
        if(limits && (own<limits.min || own>limits.max)){
          err(`guide${index}.${key}`,'guide-range',`${label}: the ${name} must be between ${f.length(limits.min)} and ${f.length(limits.max)}.`);
          return undefined;
        }
        return own;
      };
      parsed.push({
        positionMm:index===count-1?undefined:pick(o.positionMm,'positionMm','position',null),
        idMm:pick(o.idMm,'idMm','ring inner diameter',GUIDE_LIMITS.idMm),
        centreHeightMm:pick(o.centreHeightMm,'centreHeightMm','centre height above the blank',GUIDE_LIMITS.centreHeightMm),
      });
    }
    const proposal=proposeTrain(v,f,parsed);
    if(!proposal.ok)return {ok:false,errors:errors.concat(proposal.errors),warnings:[]};

    const m=proposal.model;
    const guides=proposal.guides.map((proposed,index)=>{
      const p=parsed[index];
      const label=guideLabel(index,count,v.runnerCount);
      const role=proposed.role;
      const fixedPosition=role==='tip-top';
      const xMm=fixedPosition || p.positionMm===undefined?proposed.xMm:p.positionMm;
      const idMm=p.idMm!==undefined?p.idMm:proposed.idMm;
      const heightGiven=p.centreHeightMm!==undefined;
      const moved=!fixedPosition && round(Math.abs(xMm-proposed.xMm),3)>0;
      const centreHeightMm=heightGiven?p.centreHeightMm:proposed.centreHeightMm;
      // The ring keeps its height above the blank surface wherever it is mounted, so its axis height follows the taper.
      const heightMm=(!heightGiven && !moved)?proposed.heightMm:bladeRadius(v,xMm)+centreHeightMm;
      const measured={id:p.idMm!==undefined,height:heightGiven};
      return {
        index,label,role,xMm,idMm,heightMm,centreHeightMm,measured,
        source:measured.id || measured.height?'measured':'illustrative',
        proposed:{xMm:proposed.xMm,idMm:proposed.idMm,heightMm:proposed.heightMm,centreHeightMm:proposed.centreHeightMm,targetIdMm:proposed.targetIdMm},
        proposalSolved:proposed.solved!==false,
        proposalShortfallMm:proposed.shortfallMm||0,
        moved,
      };
    });

    // Physical position checks.
    guides.forEach((g,i)=>{
      if(g.role!=='tip-top'){
        if(g.xMm<=v.spoolLipMm){
          err(`guide${i}.positionMm`,'guide-before-reel',`${g.label} sits at or behind the spool lip. Guides must be on the tip side of the reel.`);
        }else if(g.xMm>=v.rodLengthMm){
          err(`guide${i}.positionMm`,'guide-beyond-tip',`${g.label} sits at or beyond the tip of the rod.`);
        }
      }
      if(i>0 && g.xMm-guides[i-1].xMm<MIN_GAP_MM){
        err(`guide${i}.positionMm`,'guide-order',`${g.label} must sit closer to the tip than ${guides[i-1].label}.`);
      }
    });
    // A guide the user placed next to a running guide must keep the minimum gap, so rings never overlap.
    if(!errors.length){
      for(let i=1;i<guides.length;i+=1){
        const a=guides[i-1];
        const b=guides[i];
        if((a.role==='runner' || b.role==='runner') && (a.moved || b.moved) && b.xMm-a.xMm<v.runnerMinGapMm-1e-6){
          const mover=b.moved?b:a;
          const other=mover===b?a:b;
          err(`guide${mover.index}.positionMm`,'runner-too-close',
            other.role==='tip-top'
              ?`${mover.label} must stay at least ${f.length(v.runnerMinGapMm)} from the tip-top.`
              :`${a.label} and ${b.label} are too close. Keep running guides at least ${f.length(v.runnerMinGapMm)} apart.`);
        }
      }
    }
    if(errors.length)return {ok:false,errors,warnings:[],suggested:proposal.guides};

    // Line path through the guide centres.
    const lip={xMm:v.spoolLipMm,yMm:v.reelHeightMm};
    const pts=[lip,...guides.map((g)=>({xMm:g.xMm,yMm:g.heightMm}))];
    const segs=[];
    let total=0;
    for(let i=0;i<pts.length-1;i+=1){
      const dx=pts[i+1].xMm-pts[i].xMm;
      const dy=pts[i+1].yMm-pts[i].yMm;
      const len=hypot(dx,dy);
      segs.push({lengthMm:len,cosPsi:dx/len,psiDeg:deg(Math.atan2(dy,dx)),startS:total});
      total+=len;
    }
    const sAt=[0];
    segs.forEach((seg)=>sAt.push(seg.startS+seg.lengthMm));
    const tipTopS=sAt[sAt.length-1];

    // Perpendicular offset of the stripper centre from the reel-axis ray.
    const dxs=guides[0].xMm-lip.xMm;
    const dys=guides[0].heightMm-lip.yMm;
    const axisOffsetMm=Math.abs(dxs*m.sinT+dys*m.cosT);

    // Evaluate each guide.
    guides.forEach((g,i)=>{
      g.sMm=sAt[i+1];
      g.envelopeMm=m.envelope(g.sMm);
      g.requiredIdMm=g.envelopeMm*m.fit+(i===0?2*axisOffsetMm:0);
      g.marginMm=g.idMm-g.requiredIdMm;
      g.fits=g.marginMm>=-1e-9;
      g.fromTipMm=v.rodLengthMm-g.xMm;
      g.fromButtMm=g.xMm;
      const inSeg=segs[i];
      const outSeg=segs[i+1];
      g.deflectionDeg=outSeg?Math.abs(outSeg.psiDeg-inSeg.psiDeg):null;
      const r=bladeRadius(v,g.xMm);
      g.blankRadiusMm=r;
      g.ringTopClearanceMm=g.role==='tip-top'?null:(g.heightMm-g.idMm/2)-r;
      g.blankClearanceMm=(g.heightMm-(g.envelopeMm/2)/inSeg.cosPsi)-r;
    });

    // Geometric choke on the actual path.
    let chokeX;
    let chokeY;
    let chokeBeyond=false;
    if(m.sChoke<=tipTopS){
      let j=0;
      while(j<segs.length-1 && sAt[j+1]<m.sChoke)j+=1;
      const t=(m.sChoke-sAt[j])/segs[j].lengthMm;
      chokeX=pts[j].xMm+(pts[j+1].xMm-pts[j].xMm)*t;
      chokeY=pts[j].yMm+(pts[j+1].yMm-pts[j].yMm)*t;
    }else{
      const last=segs[segs.length-1];
      const extra=m.sChoke-tipTopS;
      chokeBeyond=true;
      chokeX=pts[pts.length-1].xMm+extra*last.cosPsi;
      chokeY=pts[pts.length-1].yMm+extra*Math.sin(rad(last.psiDeg));
    }

    // Envelope breakpoints for drawing and the blank-contact check.
    const crumbs=[{sMm:0,xMm:lip.xMm,yMm:lip.yMm,psiDeg:segs[0].psiDeg,seg:0}];
    guides.forEach((g,i)=>crumbs.push({sMm:g.sMm,xMm:g.xMm,yMm:g.heightMm,psiDeg:segs[i].psiDeg,seg:i}));
    if(!chokeBeyond && m.sChoke>0 && m.sChoke<tipTopS && !crumbs.some((c)=>Math.abs(c.sMm-m.sChoke)<1e-6)){
      let j=0;
      while(j<segs.length-1 && sAt[j+1]<m.sChoke)j+=1;
      crumbs.push({sMm:m.sChoke,xMm:chokeX,yMm:chokeY,psiDeg:segs[j].psiDeg,seg:j});
    }
    crumbs.sort((a,b)=>a.sMm-b.sMm);
    const envelope=crumbs.map((c)=>{
      const diameterMm=m.envelope(c.sMm);
      const half=(diameterMm/2)/Math.cos(rad(c.psiDeg));
      const clearanceMm=(c.yMm-half)-bladeRadius(v,c.xMm);
      return {sMm:c.sMm,xMm:c.xMm,yMm:c.yMm,diameterMm,halfHeightMm:half,clearanceMm};
    });
    const minClear=envelope.reduce((best,p)=>p.clearanceMm<best.clearanceMm?p:best,envelope[0]);

    // Warnings (design problems; the design is still drawn).
    let sharedRunnerWarned=false;
    guides.forEach((g)=>{
      const noFitPosition=!g.proposalSolved && !g.moved;
      if(noFitPosition){
        warn(`guide${g.index}.idMm`,'no-fit-position',`${g.label}: no position on the rod lets the ${f.length(g.idMm)} ring at a ${f.length(g.centreHeightMm)} centre height fit the line cone. Its closest position is ${f.length(g.proposalShortfallMm)} short. Use a larger ring or a guide with a different centre height; the entered values were not changed.`);
      }else if(!g.fits){
        warn(`guide${g.index}.idMm`,'ring-too-small',`${g.label}: the ${f.length(g.idMm)} ring is ${f.length(-g.marginMm)} short of the ${f.length(g.requiredIdMm)} this position needs.`);
      }
      const sharedRunner=g.role==='runner' && !g.measured.id && !g.measured.height;
      if(sharedRunner && g.ringTopClearanceMm<-1e-9){
        if(!sharedRunnerWarned){
          sharedRunnerWarned=true;
          warn('runnerCentreHeightMm','runner-ring-overlaps-blank',`The running guides' ${f.length(v.runnerIdMm)} ring needs a centre height of at least ${f.length(v.runnerIdMm/2)} above the blank, but ${f.length(v.runnerCentreHeightMm)} is set. Use a smaller ring or a taller frame; the values were not changed.`);
        }
      }else if(g.ringTopClearanceMm!==null && g.ringTopClearanceMm<-1e-9){
        warn(`guide${g.index}.centreHeightMm`,'ring-overlaps-blank',g.measured.id && g.measured.height
          ?`${g.label}: the measured ${f.length(g.idMm)} ring needs a centre height of at least ${f.length(g.idMm/2)} above the blank, but ${f.length(g.centreHeightMm)} was entered. Check the two measurements.`
          :`${g.label}: the ring would overlap the blank. Increase its centre height.`);
      }
    });
    if(minClear.clearanceMm<-1e-9){
      warn('reelHeightMm','blank-contact',`The line cone touches the blank about ${f.length(v.rodLengthMm-minClear.xMm)} from the tip. Raise the guide heights near there or reduce the flare.`);
    }
    if(chokeBeyond){
      warn('flareAngleDeg','choke-beyond-tip','The line is not fully gathered before the tip-top: the geometric choke falls beyond the end of the rod. The reduction guides were compressed to fit.');
    }
    // The choke guide hands the line to the running guides: they should be no taller than it and no larger.
    const chokeAtIndex=guides.find((g)=>g.role==='choke');
    const firstRunner=guides.find((g)=>g.role==='runner');
    if(chokeAtIndex && firstRunner && firstRunner.centreHeightMm>chokeAtIndex.centreHeightMm+1e-9){
      warn(`guide${firstRunner.index}.centreHeightMm`,'runner-taller-than-choke',`${firstRunner.label}: its ring centre (${f.length(firstRunner.centreHeightMm)} above the blank) is higher than the choke guide's (${f.length(chokeAtIndex.centreHeightMm)}). Running guides are normally lower than the guide that gathers the line.`);
    }
    for(let i=1;i<guides.length;i+=1){
      if(guides[i].idMm>guides[i-1].idMm+1e-9){
        warn(`guide${i}.idMm`,'id-not-reducing',`${guides[i].label}: the ring is larger than the one before it, so the train does not reduce here.`);
      }
    }

    for(let i=1;i<guides.length;i+=1){
      const a=guides[i-1];
      const b=guides[i];
      if((a.role==='runner' || b.role==='runner') && b.xMm-a.xMm<v.runnerMinGapMm-1e-6){
        warn(`guide${i}.positionMm`,'runner-gap-tight',b.role==='tip-top'
          ?`${a.label} is only ${f.length(b.xMm-a.xMm)} from the tip-top, closer than the ${f.length(v.runnerMinGapMm)} minimum gap.`
          :`${b.label} is only ${f.length(b.xMm-a.xMm)} from ${a.label}, closer than the ${f.length(v.runnerMinGapMm)} minimum gap. Use fewer runners or a longer span.`);
      }
    }

    const reductionGuides=guides.filter((g)=>g.role==='reduction' || g.role==='choke');
    const runnerGuides=guides.filter((g)=>g.role==='runner');
    const chokeGuide=guides.find((g)=>g.role==='choke');
    const lastRunner=runnerGuides.length?runnerGuides[runnerGuides.length-1]:null;
    const gapsToTipTop=[];
    for(let i=guides.length-runnerGuides.length-2;i<guides.length-1;i+=1)gapsToTipTop.push(guides[i+1].xMm-guides[i].xMm);
    const deflections=guides.map((g)=>g.deflectionDeg).filter((d)=>d!==null);
    const summary={
      stripperFromTipMm:guides[0].fromTipMm,
      stripperFromButtMm:guides[0].fromButtMm,
      chokeFromTipMm:v.rodLengthMm-chokeX,
      chokeFromButtMm:chokeX,
      chokeBeyondTip:chokeBeyond,
      coneLengthMm:m.sChoke,
      flareAngleDeg:v.flareAngleDeg,
      reductionRatio:proposal.ratio,
      reductionCount:reductionGuides.length,
      runnerCount:runnerGuides.length,
      lastRunnerFromTipMm:lastRunner?lastRunner.fromTipMm:null,
      runnerSpanMm:v.rodLengthMm-chokeGuide.xMm,
      runnerGapsMm:gapsToTipTop,
      runnerMinGapMm:v.runnerMinGapMm,
      runnerTipGapRaised:proposal.tipGapRaised,
      chokeGuideOffsetMm:chokeGuide.xMm-chokeX,
      axisOffsetMm,
      maxDeflectionDeg:deflections.length?Math.max(...deflections):0,
      minBlankClearanceMm:minClear.clearanceMm,
      minBlankClearanceFromTipMm:v.rodLengthMm-minClear.xMm,
      pathLengthMm:tipTopS,
      chainCompressed:proposal.chainCompressed,
      measuredCount:guides.filter((g)=>g.source==='measured').length,
      totalGuides:guides.length,
      mode:guides.every((g)=>g.source==='illustrative')?'illustrative':(guides.every((g)=>g.source==='measured')?'measured':'mixed'),
    };
    return {
      ok:true,model:MODEL_ID,modelVersion:MODEL_VERSION,input:v,errors:[],warnings,
      params:{tanAlpha:m.tanAlpha,fit:m.fit,sChokeMm:m.sChoke},
      reel:{lipXMm:lip.xMm,axisYMm:lip.yMm,spoolDiameterMm:v.spoolDiameterMm,axisAngleDeg:v.reelAngleDeg},
      guides,path:pts,segments:segs,envelope,choke:{xMm:chokeX,yMm:chokeY,sMm:m.sChoke,beyondTip:chokeBeyond},summary,
    };
  }

  // Checks one entry of the builder's own guide set: a measured ring diameter and centre height above the blank.
  function validateGuideSpec(spec,fmt){
    const f={...DEFAULT_FMT,...(fmt||{})};
    const input=spec && typeof spec==='object'?spec:{};
    const errors=[];
    const err=(field,code,message)=>errors.push({field,code,message});
    const read=(key,name,limits)=>{
      const value=input[key];
      if(isBlank(value)){err(key,'missing',`Enter the ${name}.`);return null;}
      if(!isNumber(value)){err(key,'invalid',`The ${name} is not a valid number.`);return null;}
      if(value<limits.min || value>limits.max){
        err(key,'range',`The ${name} must be between ${f.length(limits.min)} and ${f.length(limits.max)}.`);
        return null;
      }
      return value;
    };
    const id=read('idMm','ring inner diameter',GUIDE_LIMITS.idMm);
    const centre=read('centreHeightMm','centre height above the blank',GUIDE_LIMITS.centreHeightMm);
    if(id!==null && centre!==null && centre<id/2-1e-9){
      err('centreHeightMm','spec-ring-overlaps-blank',`A ${f.length(id)} ring needs a centre height of at least ${f.length(id/2)} above the blank. ${f.length(centre)} would put the ring through the blank.`);
    }
    return {ok:errors.length===0,errors};
  }

  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));

  function viewGeometry(design,width){
    const v=design.input;
    const W=Math.round(clamp(Number(width)||340,280,1000));
    const padL=10,padR=16,padT=56,padB=64;
    const plotW=W-padL-padR;
    const x0=Math.max(0,design.reel.lipXMm-0.1*(v.rodLengthMm-design.reel.lipXMm));
    const span=v.rodLengthMm-x0;
    const bladeMax=Math.max(bladeRadius(v,x0),bladeRadius(v,v.rodLengthMm));
    let yBottom=design.reel.axisYMm+design.reel.spoolDiameterMm/2;
    design.guides.forEach((g)=>{yBottom=Math.max(yBottom,g.heightMm+g.idMm/2);});
    const yTop=-bladeMax;
    const plotH=Math.round(clamp(W*0.5,170,260));
    const ky=plotH/((yBottom-yTop)*1.04);
    const kx=plotW/span;
    return {W,padL,padR,padT,padB,plotW,plotH,x0,span,kx,ky,yTop,H:padT+plotH+padB};
  }

  // Converts a horizontal position inside the SVG (in SVG units) back to millimetres from the butt.
  function viewXToMm(meta,svgX){
    return meta.x0+(svgX-meta.padL)/meta.kx;
  }

  // First-fit lane assignment so neighbouring ruler labels never overlap. A label that fits no lane is
  // dropped (its tick stays); the guide table always lists every value.
  function assignLanes(items,maxLanes){
    const right=[];
    return items.map((item)=>{
      const width=String(item.text).length*5.4+6;
      let lane=-1;
      for(let l=0;l<maxLanes;l+=1){
        if(right[l]===undefined || item.x-width/2>=right[l]){lane=l;break;}
      }
      if(lane>=0)right[lane]=item.x+width/2;
      return lane;
    });
  }

  function buildSideViewSvg(design,options){
    const opts=options||{};
    const geo=viewGeometry(design,opts.width);
    const v=design.input;
    const fmtNum=typeof opts.number==='function'?opts.number:(mm)=>String(Math.round(mm));
    const selected=Number.isInteger(opts.selectedIndex)?opts.selectedIndex:-1;
    const px=(n)=>Math.round(n*100)/100;
    const X=(x)=>px(geo.padL+(x-geo.x0)*geo.kx);
    const Y=(y)=>px(geo.padT+(y-geo.yTop)*geo.ky);
    const parts=[];
    const runnerTotal=design.guides.filter((g)=>g.role==='runner').length;
    const reductionTotal=design.guides.length-2-runnerTotal;
    const RUNNER_COLOUR='#aeb9c2';
    const trainSummary=runnerTotal?`${reductionTotal} reduction guides and ${runnerTotal} running guides`:`${reductionTotal} reduction guides`;
    parts.push(`<svg class="guide-train-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geo.W} ${geo.H}" width="${geo.W}" height="${geo.H}" data-gt-width="${geo.W}" data-gt-x0="${px(geo.x0)}" data-gt-span="${px(geo.span)}" data-gt-padl="${geo.padL}" data-gt-plotw="${geo.plotW}" data-gt-kx="${geo.kx}" role="img" aria-label="Side view of the guide train: ${trainSummary} between the stripper and the tip-top. Butt on the left, tip on the right. Vertical scale exaggerated.">`);
    parts.push('<title>Guide train side view (schematic, vertical scale exaggerated)</title>');
    parts.push(`<rect class="gt-bg" x="0.5" y="0.5" width="${geo.W-1}" height="${geo.H-1}" rx="10" fill="#101315" stroke="rgba(214,210,200,.16)"/>`);

    // Blank.
    const r0=bladeRadius(v,geo.x0),r1=bladeRadius(v,v.rodLengthMm);
    parts.push(`<polygon class="gt-blank" points="${X(geo.x0)},${Y(-r0)} ${X(v.rodLengthMm)},${Y(-r1)} ${X(v.rodLengthMm)},${Y(r1)} ${X(geo.x0)},${Y(r0)}" fill="#343b41" stroke="rgba(214,210,200,.34)" stroke-width="1"/>`);
    parts.push(`<line class="gt-axis" x1="${X(geo.x0)}" y1="${Y(0)}" x2="${X(v.rodLengthMm)}" y2="${Y(0)}" stroke="rgba(231,225,213,.34)" stroke-width="1" stroke-dasharray="5 4"/>`);

    // Line envelope and path.
    const upper=design.envelope.map((p)=>`${X(p.xMm)},${Y(p.yMm-p.halfHeightMm)}`);
    const lower=design.envelope.slice().reverse().map((p)=>`${X(p.xMm)},${Y(p.yMm+p.halfHeightMm)}`);
    parts.push(`<polygon class="gt-envelope" points="${upper.concat(lower).join(' ')}" fill="rgba(180,39,54,.2)" stroke="rgba(214,92,103,.7)" stroke-width="1"/>`);
    parts.push(`<polyline class="gt-path" points="${design.path.map((p)=>`${X(p.xMm)},${Y(p.yMm)}`).join(' ')}" fill="none" stroke="#e7dfd1" stroke-width="1.2" stroke-dasharray="3 3"/>`);

    // Reel spool at the lip.
    const spoolTop=Y(design.reel.axisYMm-design.reel.spoolDiameterMm/2);
    const spoolH=px(design.reel.spoolDiameterMm*geo.ky);
    parts.push(`<rect class="gt-spool" x="${px(X(design.reel.lipXMm)-12)}" y="${spoolTop}" width="12" height="${spoolH}" rx="2" fill="#262b2f" stroke="rgba(231,225,213,.7)" stroke-width="1.2"/>`);
    parts.push(`<circle class="gt-reelaxis" cx="${X(design.reel.lipXMm)}" cy="${Y(design.reel.axisYMm)}" r="2.2" fill="#e7dfd1"/>`);
    parts.push(`<text class="gt-label" x="${px(X(design.reel.lipXMm)-6)}" y="${px(spoolTop+spoolH+12)}" text-anchor="middle" font-size="9" fill="rgba(214,210,200,.8)">Spool</text>`);

    // Guides.
    design.guides.forEach((g)=>{
      const gx=X(g.xMm);
      const ringTop=Y(g.heightMm-g.idMm/2);
      const ringH=px(g.idMm*geo.ky);
      const blankBottom=Y(g.blankRadiusMm);
      const warn=!g.fits || (g.ringTopClearanceMm!==null && g.ringTopClearanceMm<-1e-9);
      const isRunner=g.role==='runner';
      const colour=g.index===selected?'#e0525f':(warn?'#e07b86':(isRunner?RUNNER_COLOUR:'#e7dfd1'));
      if(ringTop>blankBottom){
        parts.push(`<line class="gt-leg" data-guide="${g.index}" x1="${gx}" y1="${blankBottom}" x2="${gx}" y2="${ringTop}" stroke="${colour}" stroke-width="1.2"/>`);
      }
      const isMeasured=g.source==='measured';
      parts.push(`<rect class="gt-ring${isRunner?' gt-ring--runner':''}${isMeasured?' gt-ring--measured':''}${warn?' gt-ring--warn':''}${g.index===selected?' gt-ring--selected':''}" data-guide="${g.index}" x="${px(gx-3)}" y="${ringTop}" width="6" height="${ringH}" rx="3" fill="${isMeasured?'rgba(231,225,213,.34)':'rgba(16,19,21,.7)'}" stroke="${colour}" stroke-width="${g.index===selected?2:1.4}"/>`);
      const mark=g.role==='stripper'?'S':(g.role==='tip-top'?'T':(isRunner?`R${g.index-design.guides.findIndex((o)=>o.role==='runner')+1}`:String(g.index)));
      parts.push(`<text class="gt-guidelabel" data-guide="${g.index}" x="${gx}" y="${px(Y(g.heightMm+g.idMm/2)+12)}" text-anchor="middle" font-size="10" fill="${colour}">${mark}</text>`);
      if(g.moved){
        parts.push(`<path class="gt-proposed" data-guide="${g.index}" d="M${X(g.proposed.xMm)} ${px(blankBottom+4)} l-3 6 l6 0 z" fill="none" stroke="rgba(214,210,200,.6)" stroke-width="1"/>`);
      }
      if(g.role!=='tip-top'){
        // Drag zones tile the rod without overlapping: each stops at the midpoint to its neighbours.
        const prevX=design.guides[g.index-1]?X(design.guides[g.index-1].xMm):null;
        const nextX=design.guides[g.index+1]?X(design.guides[g.index+1].xMm):null;
        const left=prevX===null?gx-14:Math.max(gx-14,(gx+prevX)/2);
        const right=nextX===null?gx+14:Math.min(gx+14,(gx+nextX)/2);
        const hitTop=Math.min(blankBottom,ringTop)-4;
        const hitBottom=Y(g.heightMm+g.idMm/2)+16;
        parts.push(`<rect class="gt-hit" data-guide="${g.index}" x="${px(left)}" y="${px(hitTop)}" width="${px(Math.max(0,right-left))}" height="${px(hitBottom-hitTop)}" fill="transparent" style="cursor:ew-resize;touch-action:none"/>`);
      }
    });

    // Geometric choke marker.
    if(!design.choke.beyondTip){
      const cx=X(design.choke.xMm),cy=Y(design.choke.yMm);
      parts.push(`<path class="gt-choke" d="M${cx} ${px(cy-6)} L${px(cx+5)} ${cy} L${cx} ${px(cy+6)} L${px(cx-5)} ${cy} Z" fill="#b42736" stroke="#f0c9c4" stroke-width="1"/>`);
      parts.push(`<text class="gt-label" x="${cx}" y="${px(Y(-Math.max(r0,r1))-6)}" text-anchor="middle" font-size="9" fill="#f0c9c4">Reduction end</text>`);
    }

    // Rulers: from the butt along the top, from the tip along the bottom, with collision-free label lanes.
    const topY=px(geo.padT-14);
    const bottomY=px(geo.padT+geo.plotH+14);
    parts.push(`<line class="gt-ruler" x1="${geo.padL}" y1="${topY}" x2="${px(geo.padL+geo.plotW)}" y2="${topY}" stroke="rgba(214,210,200,.3)" stroke-width="1"/>`);
    parts.push(`<line class="gt-ruler" x1="${geo.padL}" y1="${bottomY}" x2="${px(geo.padL+geo.plotW)}" y2="${bottomY}" stroke="rgba(214,210,200,.3)" stroke-width="1"/>`);
    parts.push(`<text class="gt-label" x="${geo.padL}" y="8" font-size="9" fill="rgba(214,210,200,.72)">From butt</text>`);
    parts.push(`<text class="gt-label" x="${geo.padL}" y="${px(geo.H-6)}" font-size="9" fill="rgba(214,210,200,.72)">From tip</text>`);
    const buttText=design.guides.map((g)=>({x:X(g.xMm),text:fmtNum(g.fromButtMm)}));
    const tipText=design.guides.map((g)=>({x:X(g.xMm),text:fmtNum(g.fromTipMm)}));
    const buttLanes=assignLanes(buttText,3);
    const tipLanes=assignLanes(tipText,3);
    design.guides.forEach((g,i)=>{
      const gx=X(g.xMm);
      parts.push(`<line class="gt-tick" data-guide="${g.index}" x1="${gx}" y1="${px(topY-3)}" x2="${gx}" y2="${px(topY+3)}" stroke="rgba(231,225,213,.7)" stroke-width="1"/>`);
      if(buttLanes[i]>=0){
        parts.push(`<text class="gt-butt" data-guide="${g.index}" x="${gx}" y="${px(topY-6-buttLanes[i]*10)}" text-anchor="middle" font-size="9" fill="rgba(231,225,213,.9)">${buttText[i].text}</text>`);
      }
      parts.push(`<line class="gt-tick" data-guide="${g.index}" x1="${gx}" y1="${px(bottomY-3)}" x2="${gx}" y2="${px(bottomY+3)}" stroke="rgba(231,225,213,.7)" stroke-width="1"/>`);
      if(tipLanes[i]>=0){
        parts.push(`<text class="gt-tip" data-guide="${g.index}" x="${gx}" y="${px(bottomY+13+tipLanes[i]*10)}" text-anchor="middle" font-size="9" fill="rgba(231,225,213,.9)">${tipText[i].text}</text>`);
      }
    });
    if(runnerTotal){
      // Bottom row, right of the "From tip" label, where no ruler label can reach.
      const lx=Math.round(geo.W/2-53);
      const ly=px(geo.H-6);
      parts.push(`<g class="gt-legend" font-size="9"><circle class="gt-legend-reduction" cx="${lx+2.5}" cy="${px(ly-3.2)}" r="2.6" fill="#e7dfd1"/><text x="${lx+8}" y="${ly}" fill="#e7dfd1">Reduction</text><circle class="gt-legend-runner" cx="${lx+68.5}" cy="${px(ly-3.2)}" r="2.6" fill="${RUNNER_COLOUR}"/><text x="${lx+74}" y="${ly}" fill="${RUNNER_COLOUR}">Runner</text></g>`);
    }
    parts.push('</svg>');
    return parts.join('');
  }

  return {
    MODEL_ID,MODEL_VERSION,FIELDS,FIELD_BY_KEY,GUIDE_LIMITS,DEFAULTS,METHOD_STEPS,ASSUMPTIONS,LIMITATIONS,DEFAULT_FMT,
    bladeRadius,buildModel,planRunnerGaps,proposeTrain,designGuideTrain,validateGuideSpec,buildSideViewSvg,viewGeometry,viewXToMm,guideLabel,assignLanes,
  };
});
