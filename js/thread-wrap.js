/* K-Labs Studio — Thread Wrap Designer engine (diamond cross-wrap, first version).
   Pure functions only: no DOM access, storage, pricing or network. All lengths are millimetres.

   MODEL (see SOURCES / ASSUMPTIONS below for what is published practice and what is this tool's own maths):
   - The wrap area is a straight-tapered cone between the two entered diameters.
   - Crossing points sit in "rows" along the wrap. Two rows make one pattern repeat (the distance between
     crossings on the same axis).
   - Every row covers the same blank surface area, so the closed pattern has no gaps or overlaps. This is the
     equal-area principle used by published taper-offset-spacing methods, applied exactly to a linear taper.
   - Even rows (0, 2, 4...) sit on axes 1, 3, 5...; odd rows sit on axes 2, 4, 6... One thread spiral per
     odd-numbered axis starts at row 0 and runs each way round the blank, so every crossing is one clockwise plus
     one anticlockwise thread. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.KLabsThreadWrap=api;
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  const MODEL_ID='equal-area-linear-taper';
  const MODEL_VERSION=1;

  const LIMITS={
    lengthMm:{min:20,max:1000},
    diameterMm:{min:1,max:80},
    repeats:{min:1,max:40},
    accentThreads:{min:0,max:3},
    taperRatioWarn:0.05,
    taperRatioMax:0.2,
    angleErrorLow:15,
    angleErrorHigh:75,
    angleWarnLow:30,
    angleWarnHigh:60,
    tightRowMm:5,
    targetAngleDeg:45,
  };
  const AXIS_OPTIONS=[2,4,6];
  const THREAD_COLOURS=[
    {id:'black',label:'Black',hex:'#17191c'},
    {id:'white',label:'White',hex:'#f1eee6'},
    {id:'silver',label:'Silver',hex:'#b8bdc4'},
    {id:'gold',label:'Gold',hex:'#c8a24a'},
    {id:'red',label:'Red',hex:'#b3202e'},
    {id:'blue',label:'Blue',hex:'#2d5fb4'},
    {id:'green',label:'Green',hex:'#2f8a5b'},
    {id:'orange',label:'Orange',hex:'#d9772b'},
  ];
  const DEFAULTS={
    lengthMm:250,
    buttDiameterMm:16.9,
    tipDiameterMm:15.3,
    axes:2,
    repeats:null,
    accentThreads:1,
    mainColour:'black',
    accentColour:'gold',
  };

  const SOURCES=[
    {
      id:'ehler',
      short:'Ehler, Rod Guild',
      title:'Multiple Thread Wraps 11: Taper Off Set Spacing (B.D. Ehler)',
      publisher:'Rod Guild',
      url:'https://rodguild.com/wp-content/uploads/2016/02/Multiple-Thread-Wraps-11-Taper-Off-Set-Spacing.docx',
    },
    {
      id:'sturm',
      short:'Sturm, Rod Guild',
      title:'Taper Offset Spacing spreadsheet and notes (John Sturm)',
      publisher:'Rod Guild',
      url:'https://rodguild.com/how-tos/',
    },
    {
      id:'rodhouse',
      short:'Barnouin, Rodhouse',
      title:'Tutorial: Creating Your First Fish Scale Wrap (Jérôme Barnouin)',
      publisher:'Rodhouse',
      url:'https://rodhouse.com/en/blogs/rodbuilding/how-to-create-your-first-fish-scale-wrap',
    },
    {
      id:'penturners',
      short:'penturners.org (pen turning)',
      title:'Thread Wrapping on the Lathe, Part 2: Cross Wraps (pen turning; geometry concept only)',
      publisher:'penturners.org',
      url:'https://www.penturners.org/resources/thread-wrapping-blanks-part-2.130/download',
    },
  ];

  // Published practice, with the source that states it.
  const DOCUMENTED=[
    {id:'axes',sources:['ehler','rodhouse'],text:'Mark an axis along the blank (Rodhouse aligns it with the spine) and a second axis 180° opposite, then mark where the wrap starts and ends.'},
    {id:'circumference',sources:['ehler','rodhouse'],text:'Measure the blank circumference at both ends of the wrap; the pattern must be adjusted for the taper.'},
    {id:'closed',sources:['ehler','sturm'],text:'On a taper, the spacing between crossing points must change so the closed pattern has no gaps or overlaps. Repeats are shortest at the thicker end and longest at the thinner end.'},
    {id:'equal-area',sources:['sturm'],text:'Each pattern repeat must cover the same surface area: blank circumference × repeat length stays constant.'},
    {id:'forty-five',sources:['ehler','rodhouse','sturm'],text:'A repeat is about one blank circumference long (the thread runs at roughly 45°). Ehler steps a caliper set to the circumference along the axis to count repeats; Sturm uses the mid-wrap circumference.'},
    {id:'both-ways',sources:['penturners'],text:'Spirals run in both directions through every marked point; their intersections are the centre lines of the pattern, and thread colours added each side of them make the design.'},
    {id:'tie-off',sources:['ehler'],text:'Leave room beyond the wrap for the tie-off wraps.'},
    {id:'prep-finish',sources:['rodhouse'],text:'Protect the blank with tape and anchor the thread on double-sided tape; keep every pass tight; finish with colour preserver, then varnish.'},
  ];

  // This tool's own maths and simplifications (NOT published rod-building formulas).
  const ASSUMPTIONS=[
    {id:'linear-taper',text:'The blank tapers in a straight line between the two diameters you enter. Real blanks are often not perfectly linear (Sturm asks for a third, mid-wrap measurement).'},
    {id:'equal-area-rows',text:'Row positions are found by giving every row an equal share of the cone surface area. Sturm\'s spreadsheet and Ehler\'s chart reach nearly the same spacing; this tool solves the equal-area condition exactly for a linear taper.'},
    {id:'straight-between-rows',text:'The thread is drawn as a straight line between consecutive crossing points on the unrolled surface. A taut thread on a slender taper differs from this by a negligible amount.'},
    {id:'more-axes',text:'Published examples use two opposite axes. Four and six axes are an extension of the same equal-area idea and are not covered by a published worked example.'},
    {id:'round-blank',text:'The blank is treated as round: circumference = π × diameter.'},
    {id:'thread-thickness',text:'Thread thickness and build-up are ignored. Thread-length figures are rough estimates before waste.'},
    {id:'angle-limits',text:'The wrap angle is a result, not an input. Angles under 15° or over 75° are refused because the diamonds would be impractical.'},
  ];

  const DEFAULT_FMT={
    length(mm){return `${(Math.round(mm*10)/10).toFixed(1).replace(/\.0$/,'')} mm`;},
    degrees(deg){return `${(Math.round(deg*10)/10).toFixed(1).replace(/\.0$/,'')}°`;},
  };

  function isNumber(value){return typeof value==='number' && Number.isFinite(value);}
  function round(value,places){const f=Math.pow(10,places);return Math.round(value*f)/f;}
  function colourById(id){return THREAD_COLOURS.find((c)=>c.id===id)||null;}
  function circumferenceAt(values,zMm){
    return Math.PI*(values.buttDiameterMm+(values.tipDiameterMm-values.buttDiameterMm)*(zMm/values.lengthMm));
  }

  function suggestRepeats(raw){
    const L=Number(raw&&raw.lengthMm), Db=Number(raw&&raw.buttDiameterMm), Dt=Number(raw&&raw.tipDiameterMm);
    const n=Number(raw&&raw.axes)||DEFAULTS.axes;
    if(![L,Db,Dt].every((v)=>Number.isFinite(v)&&v>0))return null;
    const meanCircumference=Math.PI*(Db+Dt)/2;
    // 45°: one row spans (circumference / axes) along the rod, so two rows (one repeat) span 2C/axes.
    const raw45=n*L/(2*meanCircumference);
    return Math.max(LIMITS.repeats.min,Math.min(LIMITS.repeats.max,Math.round(raw45)));
  }

  // z such that the cone surface area from 0..z is `fraction` of the total (exact for a linear taper).
  function equalAreaPositions(Db,Dt,L,rows){
    const total=L*(Db+Dt)/2;
    const a=(Dt-Db)/(2*L);
    const out=[0];
    for(let j=1;j<rows;j+=1){
      const c=(j/rows)*total;
      out.push(2*c/(Db+Math.sqrt(Db*Db+4*a*c)));
    }
    out.push(L);
    return out;
  }

  function evaluate(raw,fmt){
    const f={...DEFAULT_FMT,...(fmt||{})};
    const src=raw&&typeof raw==='object'?raw:{};
    const errors=[];
    const warnings=[];
    const err=(field,code,message)=>errors.push({field,code,message});
    const warn=(field,code,message)=>warnings.push({field,code,message});

    const lengthMm=src.lengthMm, Db=src.buttDiameterMm, Dt=src.tipDiameterMm;
    const L=LIMITS.lengthMm, D=LIMITS.diameterMm;
    const isBlank=(value)=>value===undefined || value===null || value==='';
    if(isBlank(lengthMm))err('lengthMm','length-missing','Enter the wrap length.');
    else if(!isNumber(lengthMm))err('lengthMm','length-invalid','The wrap length is not a valid number. Type digits only, for example 250.');
    else if(lengthMm<L.min || lengthMm>L.max)err('lengthMm','length-range',`Wrap length must be between ${f.length(L.min)} and ${f.length(L.max)}.`);
    if(isBlank(Db))err('buttDiameterMm','butt-missing','Enter the blank diameter at the butt-side end of the wrap.');
    else if(!isNumber(Db))err('buttDiameterMm','butt-invalid','The butt-side diameter is not a valid number. Type digits only, for example 16.9.');
    else if(Db<D.min || Db>D.max)err('buttDiameterMm','butt-range',`Butt-side diameter must be between ${f.length(D.min)} and ${f.length(D.max)}.`);
    if(isBlank(Dt))err('tipDiameterMm','tip-missing','Enter the blank diameter at the tip-side end of the wrap.');
    else if(!isNumber(Dt))err('tipDiameterMm','tip-invalid','The tip-side diameter is not a valid number. Type digits only, for example 15.3.');
    else if(Dt<D.min || Dt>D.max)err('tipDiameterMm','tip-range',`Tip-side diameter must be between ${f.length(D.min)} and ${f.length(D.max)}.`);

    const axes=src.axes===undefined||src.axes===null?DEFAULTS.axes:src.axes;
    if(!AXIS_OPTIONS.includes(axes))err('axes','axes-invalid',`Choose ${AXIS_OPTIONS.join(', ')} axes.`);
    const accentThreads=src.accentThreads===undefined||src.accentThreads===null?DEFAULTS.accentThreads:src.accentThreads;
    if(!Number.isInteger(accentThreads) || accentThreads<LIMITS.accentThreads.min || accentThreads>LIMITS.accentThreads.max){
      err('accentThreads','accent-invalid',`Threads each side must be a whole number from ${LIMITS.accentThreads.min} to ${LIMITS.accentThreads.max}.`);
    }
    const mainColour=src.mainColour===undefined||src.mainColour===null?DEFAULTS.mainColour:src.mainColour;
    const accentColour=src.accentColour===undefined||src.accentColour===null?DEFAULTS.accentColour:src.accentColour;
    if(!colourById(mainColour))err('mainColour','colour-invalid','Choose a main thread colour from the list.');
    if(!colourById(accentColour))err('accentColour','colour-invalid','Choose an accent thread colour from the list.');

    const basicsOk=errors.length===0;
    let taperRatio=null;
    if(basicsOk){
      taperRatio=Math.abs(Db-Dt)/lengthMm;
      if(taperRatio>LIMITS.taperRatioMax){
        err('tipDiameterMm','taper-too-steep','The two diameters differ too much for this wrap length. This tool only models gentle, blank-style tapers. Check the measurements.');
      }else if(taperRatio>LIMITS.taperRatioWarn){
        warn('tipDiameterMm','taper-steep','This is a steep taper for a rod blank. Re-check both diameters; the layout assumes a straight taper.');
      }
      if(Dt>Db)warn('tipDiameterMm','tip-larger','The tip-side diameter is larger than the butt-side diameter. That is unusual for a rod blank, so double-check which end is which.');
    }

    let suggestedRepeats=null;
    let repeats=src.repeats;
    if(basicsOk && errors.length===0){
      suggestedRepeats=suggestRepeats({lengthMm,buttDiameterMm:Db,tipDiameterMm:Dt,axes});
    }
    const repeatsProvided=!(repeats===undefined || repeats===null);
    if(repeatsProvided){
      if(!Number.isInteger(repeats) || repeats<LIMITS.repeats.min || repeats>LIMITS.repeats.max){
        err('repeats','repeats-invalid',`Pattern repeats must be a whole number from ${LIMITS.repeats.min} to ${LIMITS.repeats.max}.`);
      }
    }else if(suggestedRepeats){
      repeats=suggestedRepeats;
    }else if(basicsOk){
      err('repeats','repeats-missing','Enter the number of pattern repeats.');
    }

    const values={
      lengthMm,buttDiameterMm:Db,tipDiameterMm:Dt,axes,repeats,accentThreads,mainColour,accentColour,
    };
    let geometry=null;
    if(errors.length===0){
      geometry=computeGeometry(values);
      const {minAngleDeg,maxAngleDeg}=geometry.summary;
      const hint=suggestedRepeats && suggestedRepeats!==repeats?` Try about ${suggestedRepeats} repeats.`:'';
      const spread=`${f.degrees(minAngleDeg)} to ${f.degrees(maxAngleDeg)}`;
      if(minAngleDeg<LIMITS.angleErrorLow || maxAngleDeg>LIMITS.angleErrorHigh){
        if(suggestedRepeats===repeats){
          // The repeat count is already the 45° suggestion, so more or fewer repeats cannot fix it: the taper is the cause.
          err('tipDiameterMm','angle-taper-spread',`Over this taper the thread angle would range from ${spread} from the rod, which is too uneven to wrap neatly. Shorten the wrap, or check that both diameters are right.`);
        }else if(minAngleDeg<LIMITS.angleErrorLow){
          err('repeats','angle-too-shallow',`With ${repeats} repeats the thread would run almost straight along the rod (about ${f.degrees(minAngleDeg)} from the rod), which is too shallow to wrap neatly. Use more repeats.${hint}`);
        }else{
          err('repeats','angle-too-steep',`With ${repeats} repeats the thread would run almost straight round the blank (about ${f.degrees(maxAngleDeg)} from the rod), which is too steep to wrap neatly. Use fewer repeats.${hint}`);
        }
      }else if(minAngleDeg<LIMITS.angleWarnLow || maxAngleDeg>LIMITS.angleWarnHigh){
        warn('repeats','angle-unusual',`The thread angle is about ${f.degrees(geometry.summary.meanAngleDeg)} from the rod. Published methods start near 45°, so the diamonds will look ${geometry.summary.meanAngleDeg<LIMITS.targetAngleDeg?'long and narrow':'short and wide'}.${hint}`);
      }
      if(geometry.summary.minGapMm<LIMITS.tightRowMm){
        warn('repeats','rows-tight',`The closest rows are only ${f.length(geometry.summary.minGapMm)} apart, which is very tight to mark and wrap.`);
      }
      if(errors.length)geometry=null;
    }
    return {errors,warnings,values,geometry,suggestedRepeats,taperRatio};
  }

  function computeGeometry(values){
    const {lengthMm:L,buttDiameterMm:Db,tipDiameterMm:Dt,axes:n,repeats}=values;
    const rowCount=2*repeats;
    const positions=equalAreaPositions(Db,Dt,L,rowCount);
    const diameterAt=(z)=>Db+(Dt-Db)*(z/L);
    const axisList=[];
    for(let k=0;k<n;k+=1){
      axisList.push({number:k+1,angleDeg:round(360*k/n,6),isReference:k===0});
    }
    const rows=positions.map((z,j)=>{
      const axisNumbers=[];
      for(let k=0;k<n;k+=1)if(k%2===j%2)axisNumbers.push(k+1);
      return {
        index:j,
        positionMm:z,
        gapMm:j===0?null:z-positions[j-1],
        diameterMm:diameterAt(z),
        circumferenceMm:Math.PI*diameterAt(z),
        axisNumbers,
        isRepeatBoundary:j%2===0,
      };
    });
    const segments=[];
    for(let j=0;j<rowCount;j+=1){
      const h=positions[j+1]-positions[j];
      const arc=Math.PI*diameterAt((positions[j]+positions[j+1])/2)/n;
      segments.push({
        row:j,
        lengthMm:h,
        arcMm:arc,
        angleDeg:Math.atan2(arc,h)*180/Math.PI,
        threadMm:Math.hypot(arc,h),
        areaMm2:Math.PI*(diameterAt(positions[j])+diameterAt(positions[j+1]))/2*h,
      });
    }
    const repeatList=[];
    for(let i=0;i<repeats;i+=1){
      const start=positions[2*i], end=positions[2*i+2];
      repeatList.push({
        index:i+1,startMm:start,endMm:end,lengthMm:end-start,
        areaMm2:segments[2*i].areaMm2+segments[2*i+1].areaMm2,
      });
    }
    const passes=[];
    const makePass=(hand,startIndex)=>{
      const nodes=[];
      for(let j=0;j<=rowCount;j+=1){
        const axisIndex=hand==='clockwise'?(startIndex+j)%n:(((startIndex-j)%n)+n)%n;
        nodes.push({row:j,axisNumber:axisIndex+1});
      }
      const threadMm=segments.reduce((sum,s)=>sum+s.threadMm,0);
      passes.push({
        id:`${hand}-${startIndex/2+1}`,
        hand,
        number:startIndex/2+1,
        startAxisNumber:startIndex+1,
        endAxisNumber:nodes[rowCount].axisNumber,
        turns:rowCount/n,
        nodes,
        threadMm,
      });
    };
    for(let a=0;a<n;a+=2)makePass('clockwise',a);
    for(let a=0;a<n;a+=2)makePass('anticlockwise',a);

    const angles=segments.map((s)=>s.angleDeg);
    const gaps=rows.slice(1).map((r)=>r.gapMm);
    const totalArc=segments.reduce((sum,s)=>sum+s.arcMm,0);
    const strandMm=passes[0].threadMm;
    return {
      axes:axisList,rows,segments,repeats:repeatList,passes,
      summary:{
        rowCount,
        repeatCount:repeats,
        buttCircumferenceMm:Math.PI*Db,
        tipCircumferenceMm:Math.PI*Dt,
        meanCircumferenceMm:Math.PI*(Db+Dt)/2,
        firstRepeatMm:repeatList[0].lengthMm,
        lastRepeatMm:repeatList[repeatList.length-1].lengthMm,
        firstGapMm:gaps[0],
        lastGapMm:gaps[gaps.length-1],
        minGapMm:Math.min(...gaps),
        maxGapMm:Math.max(...gaps),
        meanAngleDeg:Math.atan2(totalArc,L)*180/Math.PI,
        minAngleDeg:Math.min(...angles),
        maxAngleDeg:Math.max(...angles),
        threadPerStrandMm:strandMm,
        mainThreadMm:strandMm*passes.length,
        accentThreadMm:strandMm*passes.length*2*values.accentThreads,
        taperDirection:Dt<Db?'thinner-to-tip':(Dt>Db?'thicker-to-tip':'constant'),
      },
    };
  }

  function validateInputs(raw,fmt){
    const result=evaluate(raw,fmt);
    return {ok:result.errors.length===0,errors:result.errors,warnings:result.warnings,values:result.values,suggestedRepeats:result.suggestedRepeats};
  }

  function designDiamondWrap(raw,fmt){
    const result=evaluate(raw,fmt);
    if(result.errors.length){
      return {ok:false,errors:result.errors,warnings:result.warnings,suggestedRepeats:result.suggestedRepeats};
    }
    return {
      ok:true,
      model:MODEL_ID,
      modelVersion:MODEL_VERSION,
      input:result.values,
      colours:{main:colourById(result.values.mainColour),accent:colourById(result.values.accentColour)},
      suggestedRepeats:result.suggestedRepeats,
      warnings:result.warnings,
      errors:[],
      ...result.geometry,
    };
  }

  function axisLabel(design,number){
    const axis=design.axes[number-1];
    return axis.isReference?`Axis ${number} (${axis.angleDeg}°, reference line)`:`Axis ${number} (${axis.angleDeg}°)`;
  }
  function describePass(design,pass){
    const total=pass.nodes.length;
    const pick=total<=7?pass.nodes:[...pass.nodes.slice(0,3),null,pass.nodes[total-1]];
    return pick.map((node)=>node?`A${node.axisNumber} r${node.row}`:'…').join(' → ');
  }

  function buildInstructions(design,fmt){
    const f={...DEFAULT_FMT,...(fmt||{})};
    const n=design.input.axes;
    const R=design.summary.rowCount;
    const lastRow=design.rows[R];
    const evenAxes=design.rows[0].axisNumbers.map((k)=>`Axis ${k}`).join(', ');
    const oddAxes=design.rows[1].axisNumbers.map((k)=>`Axis ${k}`).join(', ');
    const s=design.summary;
    const gapTrend=s.taperDirection==='thinner-to-tip'
      ?`The gaps grow from about ${f.length(s.firstGapMm)} at the butt-side end to about ${f.length(s.lastGapMm)} at the tip-side end, because the blank gets thinner.`
      :s.taperDirection==='thicker-to-tip'
        ?`The gaps shrink from about ${f.length(s.firstGapMm)} at the butt-side end to about ${f.length(s.lastGapMm)} at the tip-side end, because the blank gets thicker.`
        :`The gaps are all about ${f.length(s.firstGapMm)} because the blank is the same size at both ends.`;
    const axisAngles=design.axes.map((axis)=>`Axis ${axis.number}: ${axis.angleDeg}°`).join(', ');
    const mainName=design.colours.main.label.toLowerCase();
    const accentName=design.colours.accent.label.toLowerCase();
    const k=design.input.accentThreads;

    const steps=[];
    steps.push({
      id:'axes',
      title:'Mark the axes and wrap limits',
      lines:[
        `Draw Axis 1 along the wrap area. The spine line is a good choice if the blank is already marked.`,
        n===2
          ?'Draw Axis 2 on the opposite side of the blank, 180° from Axis 1.'
          :`Divide the blank into ${n} equal parts around its circumference (wrap a paper strip round it, mark the strip into ${n} equal parts, and transfer the marks). Draw ${n} axes at ${axisAngles}. Number them in one direction, clockwise as seen looking from the butt end toward the tip.`,
        `Mark the start line at the butt side, then the end line ${f.length(design.input.lengthMm)} from it toward the tip. Leave room beyond each end for tie-off wraps.`,
      ],
    });
    steps.push({
      id:'check',
      title:'Check the blank size at both ends',
      lines:[
        `Wrap a paper strip round the blank on each limit line and mark where it overlaps. Expect about ${f.length(s.buttCircumferenceMm)} at the butt-side line and ${f.length(s.tipCircumferenceMm)} at the tip-side line.`,
        'If a strip is clearly different, divide that circumference by π (3.1416) to get the diameter, and enter it above so the layout updates.',
      ],
    });
    steps.push({
      id:'mark',
      title:`Mark the ${R+1} crossing points`,
      lines:[
        `Row 0 is the butt-side start line. Measure every row from that line using the “From butt end” column of the layout table (or step along with dividers using the “Gap” column).`,
        n===2
          ?`Put even rows (0, 2, 4…) on Axis 1 and odd rows (1, 3, 5…) on Axis 2.`
          :`Put even rows (0, 2, 4…) on ${evenAxes}, and odd rows (1, 3, 5…) on ${oddAxes}.`,
        `Row ${R} is the last row and lands exactly on the tip-side limit line, ${f.length(lastRow.positionMm)} from the start.`,
        gapTrend,
      ],
    });
    steps.push({
      id:'anchor',
      title:'Protect the blank and anchor the thread',
      lines:[
        'Tape the blank at both ends of the wrap and anchor the thread on double-sided tape over the tape (the method in the Rodhouse tutorial). Use your normal anchoring method if you prefer.',
      ],
    });
    const passLines=[];
    design.passes.forEach((pass)=>{
      const direction=pass.hand==='clockwise'?'clockwise':'anticlockwise';
      passLines.push(`${pass.hand==='clockwise'?'Clockwise':'Anticlockwise'} pass ${pass.number}: start at Axis ${pass.startAxisNumber}, row 0, and spiral toward the tip, ${direction} as seen from the butt end. It crosses ${describePass(design,pass)} (A = axis, r = row) and finishes on Axis ${pass.endAxisNumber}, row ${R}, after ${pass.turns} turn${pass.turns===1?'':'s'}. (About ${f.length(pass.threadMm)} of thread.)`);
    });
    steps.push({
      id:'passes',
      title:`Lay the ${n} ${mainName} centre-line spirals`,
      lines:[
        `Wrap each pass in ${mainName} thread, keeping it tight and passing exactly through the marks. Each pass moves on to the next axis at every row mark.`,
        ...passLines,
        'When finished, every marked crossing point has exactly one clockwise and one anticlockwise thread through it.',
      ],
    });
    steps.push({
      id:'accent',
      title:k===0?'Accent threads (none selected)':`Add ${k} ${accentName} thread${k===1?'':'s'} each side`,
      lines:k===0
        ?['No accent threads were selected, so the diamonds are the single-thread centre lines only. Choose 1 to 3 threads each side to add colour.']
        :[
          `Lay ${k} ${accentName} thread${k===1?'':'s'} tight against each side of every ${mainName} centre line, one pass at a time, in the same direction and through the same marks.`,
          `That is ${k*2} accent strand${k*2===1?'':'s'} for each of the ${n} centre lines (${k*2*n} in all).`,
        ],
    });
    steps.push({
      id:'finish',
      title:'Tie off and finish',
      lines:[
        'Tie off in the space you left beyond the limit lines and trim the thread ends.',
        'Rodhouse applies two coats of colour preserver, allows 24 hours, then two coats of varnish. Follow your own finish manufacturer’s instructions.',
      ],
    });
    return steps;
  }

  function buildPreviewSvg(design,options){
    const opts=options||{};
    const W=Math.round(Math.min(900,Math.max(260,Number(opts.width)||340)));
    const padL=44,padR=12,padT=24,padB=22;
    const plotW=W-padL-padR;
    const plotH=Math.round(Math.min(230,Math.max(120,plotW*0.42)));
    const profileGap=14,profileH=34;
    const H=padT+plotH+profileGap+profileH+padB;
    const L=design.input.lengthMm;
    const n=design.input.axes;
    const k=design.input.accentThreads;
    const px=(v)=>Math.round(v*100)/100;
    const x=(z)=>px(padL+(z/L)*plotW);
    const y=(deg)=>px(padT+(deg/360)*plotH);
    const mainHex=design.colours.main.hex;
    const accentHex=design.colours.accent.hex;
    const clipId='twClip';
    const parts=[];
    parts.push(`<svg class="thread-wrap-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Diamond cross-wrap preview: ${design.summary.repeatCount} repeats, ${n} axes, ${design.colours.main.label} main thread${k?`, ${design.colours.accent.label} accent`:''}. Butt end on the left, tip end on the right.">`);
    parts.push(`<title>Diamond cross-wrap preview (unrolled blank surface, schematic)</title>`);
    parts.push(`<defs><clipPath id="${clipId}"><rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/></clipPath></defs>`);
    parts.push(`<rect class="tw-bg" x="0.5" y="0.5" width="${W-1}" height="${H-1}" rx="10" fill="#101315" stroke="rgba(214,210,200,.16)"/>`);
    parts.push(`<rect class="tw-plot" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#343b41"/>`);

    // Row guide lines and numbers.
    const pxPerRow=plotW/design.summary.rowCount;
    const stride=Math.max(1,Math.ceil(14/pxPerRow));
    design.rows.forEach((row)=>{
      const rx=x(row.positionMm);
      parts.push(`<line class="tw-row${row.isRepeatBoundary?' tw-row--repeat':''}" data-row="${row.index}" x1="${rx}" y1="${padT}" x2="${rx}" y2="${padT+plotH}" stroke="rgba(231,225,213,${row.isRepeatBoundary?'.3':'.16'})" stroke-width="1"/>`);
      if(row.index%stride===0 || row.index===design.summary.rowCount){
        parts.push(`<text class="tw-rowlabel" x="${rx}" y="${padT-8}" text-anchor="middle" font-size="9" fill="rgba(214,210,200,.72)">${row.index}</text>`);
      }
    });
    // Axis lines (the final 360° line repeats Axis 1 so the seam is visible).
    for(let a=0;a<=n;a+=1){
      const ay=y(360*a/n);
      const label=a<n?design.axes[a]:null;
      parts.push(`<line class="tw-axis" data-axis="${a<n?a+1:1}" x1="${padL}" y1="${ay}" x2="${padL+plotW}" y2="${ay}" stroke="rgba(231,225,213,${a===0||a===n?'.6':'.45'})" stroke-width="1" stroke-dasharray="4 4"/>`);
      if(label){
        parts.push(`<text class="tw-axislabel" x="${padL-6}" y="${ay+3}" text-anchor="end" font-size="10" fill="rgba(231,225,213,.86)">A${label.number} ${label.angleDeg}°</text>`);
      }else{
        parts.push(`<text class="tw-axislabel tw-axislabel--seam" x="${padL-6}" y="${ay+3}" text-anchor="end" font-size="10" fill="rgba(214,210,200,.5)">A1</text>`);
      }
    }

    // Thread paths: one path per pass per offset, translated copies only where they intersect the plot.
    const lineSpacing=3.4;
    const buildD=(pass,offsetPx)=>{
      let d='';
      for(let j=0;j<design.summary.rowCount;j+=1){
        const a=pass.nodes[j];
        const dir=pass.hand==='clockwise'?1:-1;
        const startDeg=360*(a.axisNumber-1)/n;
        const endDeg=startDeg+dir*360/n;
        for(const shift of [-360,0,360]){
          const lo=Math.min(startDeg,endDeg)+shift, hi=Math.max(startDeg,endDeg)+shift;
          if(hi<-1e-9 || lo>360+1e-9)continue;
          d+=`M${x(design.rows[j].positionMm)} ${px(y(startDeg+shift)+offsetPx)}L${x(design.rows[j+1].positionMm)} ${px(y(endDeg+shift)+offsetPx)}`;
        }
      }
      return d;
    };
    parts.push(`<g class="tw-threads" clip-path="url(#${clipId})" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
    if(k>0){
      for(let m=1;m<=k;m+=1){
        for(const sign of [-1,1]){
          design.passes.forEach((pass)=>{
            parts.push(`<path class="tw-accent" data-pass="${pass.id}" data-offset="${sign*m}" d="${buildD(pass,sign*m*lineSpacing)}" stroke="${accentHex}" stroke-width="2"/>`);
          });
        }
      }
    }
    design.passes.forEach((pass)=>{
      const d=buildD(pass,0);
      parts.push(`<path class="tw-halo" d="${d}" stroke="rgba(214,210,200,.38)" stroke-width="4.4"/>`);
    });
    design.passes.forEach((pass)=>{
      parts.push(`<path class="tw-main" data-pass="${pass.id}" d="${buildD(pass,0)}" stroke="${mainHex}" stroke-width="3"/>`);
    });
    parts.push('</g>');

    // Crossing markers (one per row/axis; a mirrored copy on the 360° seam is flagged so it is not double counted).
    design.rows.forEach((row)=>{
      row.axisNumbers.forEach((axisNumber)=>{
        const cy=y(design.axes[axisNumber-1].angleDeg);
        parts.push(`<circle class="tw-node" data-row="${row.index}" data-axis="${axisNumber}" cx="${x(row.positionMm)}" cy="${cy}" r="3.3" fill="#0d0f10" stroke="#e7dfd1" stroke-width="1.2"/>`);
        if(axisNumber===1){
          parts.push(`<circle class="tw-node tw-node--seam" data-row="${row.index}" data-axis="1" data-mirror="true" cx="${x(row.positionMm)}" cy="${y(360)}" r="3.3" fill="#0d0f10" stroke="#e7dfd1" stroke-width="1.2"/>`);
        }
      });
    });

    // Blank profile strip with the same row ticks (diameter exaggerated for visibility, relative only).
    const stripTop=padT+plotH+profileGap;
    const mid=stripTop+profileH/2;
    const dMax=Math.max(design.input.buttDiameterMm,design.input.tipDiameterMm);
    const half=(z)=>{
      const d=design.input.buttDiameterMm+(design.input.tipDiameterMm-design.input.buttDiameterMm)*(z/L);
      return px((d/dMax)*profileH/2);
    };
    parts.push(`<polygon class="tw-profile" points="${x(0)},${px(mid-half(0))} ${x(L)},${px(mid-half(L))} ${x(L)},${px(mid+half(L))} ${x(0)},${px(mid+half(0))}" fill="#343b41" stroke="rgba(214,210,200,.34)" stroke-width="1"/>`);
    design.rows.forEach((row)=>{
      const h=half(row.positionMm);
      parts.push(`<line class="tw-tick" data-row="${row.index}" x1="${x(row.positionMm)}" y1="${px(mid-h)}" x2="${x(row.positionMm)}" y2="${px(mid+h)}" stroke="rgba(231,225,213,${row.isRepeatBoundary?'.7':'.4'})" stroke-width="1"/>`);
    });
    parts.push(`<text class="tw-end" x="${x(0)}" y="${px(stripTop+profileH+14)}" text-anchor="start" font-size="10" fill="rgba(214,210,200,.82)">Butt end</text>`);
    parts.push(`<text class="tw-end" x="${x(L)}" y="${px(stripTop+profileH+14)}" text-anchor="end" font-size="10" fill="rgba(214,210,200,.82)">Tip end</text>`);
    parts.push('</svg>');
    return parts.join('');
  }

  return {
    MODEL_ID,MODEL_VERSION,LIMITS,AXIS_OPTIONS,THREAD_COLOURS,DEFAULTS,SOURCES,DOCUMENTED,ASSUMPTIONS,DEFAULT_FMT,
    colourById,circumferenceAt,suggestRepeats,equalAreaPositions,
    validateInputs,designDiamondWrap,buildInstructions,buildPreviewSvg,axisLabel,
  };
});
