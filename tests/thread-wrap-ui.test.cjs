const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','studio.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const bootstrap=fs.readFileSync(path.join(root,'js','public-entry.js'),'utf8');
const Engine=require('../js/thread-wrap.js');

function extract(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const lineEnd=source.indexOf('\n',start);
  const end=source.slice(start,lineEnd).trimEnd().endsWith('}')?lineEnd:source.indexOf('\n}',start)+2;
  return source.slice(start,end);
}

const ELEMENT_IDS=[
  'workshopToolThreadWrap','workshopThreadWrapLength','workshopThreadWrapButtDiameter','workshopThreadWrapTipDiameter',
  'workshopThreadWrapRepeats','workshopThreadWrapRepeatsMinus','workshopThreadWrapRepeatsPlus','threadWrapRepeatsNote',
  'threadWrapRepeatsAuto','threadWrapMessages','threadWrapResults','threadWrapSumRepeats','threadWrapSumRepeatLength',
  'threadWrapSumAngle','threadWrapSumCircumference','threadWrapSumThread','threadWrapSumThreadTotal','threadWrapPreview',
  'threadWrapPreviewBlock','threadWrapAxesList','threadWrapTableCaption','threadWrapTableBody','threadWrapSteps','threadWrapMainColours',
  'threadWrapAccentColours','threadWrapAccentGroup','threadWrapMethodBody',
];

function harness({unit='metric',imperialDisplay='decimal'}={}){
  const elements=new Map();
  const toggles=[];
  const makeElement=(id)=>({
    id,hidden:false,value:'',textContent:'',innerHTML:'',clientWidth:0,attrs:{},listeners:{},
    setAttribute(name,value){this.attrs[name]=String(value);},
    getAttribute(name){return Object.prototype.hasOwnProperty.call(this.attrs,name)?this.attrs[name]:null;},
    hasAttribute(name){return Object.prototype.hasOwnProperty.call(this.attrs,name);},
    addEventListener(type,fn){this.listeners[type]=fn;},
  });
  ELEMENT_IDS.forEach((id)=>elements.set(id,makeElement(id)));
  const state={unit,imperialDisplay};
  const c=vm.createContext({
    document:{activeElement:null},
    $:(id)=>elements.get(id)||null,
    KLabsThreadWrap:Engine,
    workshopToolsState:{
      activeTool:'thread-wrap',
      threadWrap:{
        unit:'metric',imperialDisplay:'fractional',lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,
        repeatsMode:'auto',repeats:null,accentThreads:1,mainColour:'black',accentColour:'gold',
      },
    },
    activeMeasurementUnits:()=>state.unit,
    activeImperialDisplay:()=>state.imperialDisplay,
    syncWorkshopToggleButtons:(panel,selector,attribute,value)=>toggles.push({panel:panel&&panel.id,selector,attribute,value}),
    CORE_MEASUREMENT_FORMAT:{decimalsMetric:3,decimalsImperial:3,forceDecimal:true},
    window:{addEventListener(){},requestAnimationFrame:(fn)=>{fn();return 1;}},
  });
  c.renderWorkshopCalculator=()=>c.renderThreadWrapTool();
  for(const name of [
    'numberOrZero','mmToInches','inchesToMm','trimTrailingZeroes','formatDecimal','gcd','formatImperialFractionInches',
    'parseImperialInchesInput','normalizeWorkshopUnit','normalizeWorkshopImperialDisplay','workshopUnitSuffix',
    'parseWorkshopMeasurementMm','formatWorkshopMeasurementNumber','formatWorkshopMeasurementValue',
    'workshopMeasurementInputText','syncWorkshopMeasurementInput','bindWorkshopCalculatorInput','escapeHtml',
    'threadWrapEngine','threadWrapFormatter','readThreadWrapMeasurement','threadWrapRequest','threadWrapEffectiveRepeats',
    'ensureThreadWrapSwatches','renderThreadWrapMethod','renderThreadWrapTool','bindThreadWrapControls',
    'renderWorkshopToolVisibility',
  ]){
    vm.runInContext(extract(name),c);
  }
  const e=(id)=>elements.get(id);
  const click=(attrs)=>{
    const button={
      hasAttribute:(name)=>Object.prototype.hasOwnProperty.call(attrs,name),
      getAttribute:(name)=>attrs[name]===undefined?null:attrs[name],
    };
    e('workshopToolThreadWrap').listeners.click({target:{closest:()=>button}});
  };
  const type=(id,value)=>{e(id).value=value;e(id).listeners.input();};
  c.bindThreadWrapControls();
  c.renderThreadWrapTool();
  return {c,e,state,click,type,toggles,st:()=>c.workshopToolsState.threadWrap,
    setUnit(unit,display){state.unit=unit;state.imperialDisplay=display||state.imperialDisplay;c.renderThreadWrapTool();}};
}

const tableRows=(h)=>[...h.e('threadWrapTableBody').innerHTML.matchAll(/<tr data-row="(\d+)"[^>]*><th scope="row">\d+(?: <small>\w+<\/small>)?<\/th><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)]
  .map((m)=>({row:Number(m[1]),position:m[2],gap:m[3],axes:m[4]}));

test('opening the tool shows the documented defaults, all sections and a rendered preview',()=>{
  const h=harness();
  assert.equal(h.e('threadWrapResults').hidden,false);
  assert.equal(h.e('threadWrapPreviewBlock').hidden,false);
  assert.equal(h.e('workshopThreadWrapLength').value,'250');
  assert.equal(h.e('workshopThreadWrapButtDiameter').value,'16.9');
  assert.equal(h.e('workshopThreadWrapTipDiameter').value,'15.3');
  assert.equal(h.e('workshopThreadWrapRepeats').value,'5');
  assert.match(h.e('threadWrapRepeatsNote').textContent,/Suggested automatically for about 45°: 5/);
  assert.equal(h.e('threadWrapRepeatsAuto').hidden,true);
  assert.equal(h.e('threadWrapMessages').innerHTML,'');
  assert.match(h.e('threadWrapPreview').innerHTML,/^<svg class="thread-wrap-svg"/);
  assert.equal(h.e('threadWrapPreview').getAttribute('data-preview-width'),'340');
  assert.equal((h.e('threadWrapSteps').innerHTML.match(/<li data-step=/g)||[]).length,7);
  assert.equal(h.e('threadWrapSumRepeats').textContent,'5 (10 rows)');
  assert.match(h.e('threadWrapSumThread').textContent,/^≈ \d+(\.\d)? mm$/);
  assert.equal(h.e('threadWrapAccentGroup').hidden,false);
  assert.equal(h.e('workshopThreadWrapLength').getAttribute('aria-invalid'),'false');
});

test('colour swatches and the method panel are built once from the engine',()=>{
  const h=harness();
  for(const id of ['threadWrapMainColours','threadWrapAccentColours']){
    const markup=h.e(id).innerHTML;
    assert.equal((markup.match(/<button class="thread-wrap-swatch"/g)||[]).length,Engine.THREAD_COLOURS.length);
    Engine.THREAD_COLOURS.forEach((colour)=>assert.ok(markup.includes(`data-colour-id="${colour.id}"`) && markup.includes(`--swatch:${colour.hex}`)));
    assert.ok(markup.includes('aria-pressed="false"'));
  }
  assert.match(h.e('threadWrapMainColours').innerHTML,/aria-label="Main thread: Black"/);
  assert.match(h.e('threadWrapAccentColours').innerHTML,/aria-label="Accent thread: Gold"/);
  const method=h.e('threadWrapMethodBody').innerHTML;
  assert.match(method,/Published practice/);
  assert.match(method,/This tool&rsquo;s own assumptions/);
  assert.match(method,/Needs checking on a real blank/);
  assert.match(method,/rel="noopener noreferrer"/);
  assert.match(method,/<ul class="thread-wrap-sources">/);
  assert.match(method,/\(Ehler, Rod Guild; Barnouin, Rodhouse; Sturm, Rod Guild\)/);
  const before=h.e('threadWrapMainColours').innerHTML;
  h.c.renderThreadWrapTool();
  assert.equal(h.e('threadWrapMainColours').innerHTML,before);
});

test('layout table, preview and instructions all describe the same marks',()=>{
  const h=harness();
  const design=Engine.designDiamondWrap({lengthMm:250,buttDiameterMm:16.9,tipDiameterMm:15.3,axes:2,accentThreads:1,mainColour:'black',accentColour:'gold'});
  const rows=tableRows(h);
  assert.equal(rows.length,design.rows.length);
  rows.forEach((entry,j)=>{
    assert.equal(entry.row,j);
    assert.equal(Number(entry.position),Math.round(design.rows[j].positionMm*10)/10);
    assert.equal(entry.gap,j===0?'—':String(Math.round(design.rows[j].gapMm*10)/10));
    assert.equal(entry.axes,design.rows[j].axisNumbers.join(' · '));
  });
  const preview=h.e('threadWrapPreview').innerHTML;
  assert.equal((preview.match(/class="tw-row[ "]/g)||[]).length,rows.length);
  assert.equal((preview.match(/class="tw-tick"/g)||[]).length,rows.length);
  const steps=h.e('threadWrapSteps').innerHTML;
  assert.ok(steps.includes(`Mark the ${rows.length} crossing points`));
  assert.ok(steps.includes(`Row ${rows.length-1} is the last row`));
  assert.match(h.e('threadWrapTableBody').innerHTML,/<th scope="row">0 <small>start<\/small><\/th>/);
  assert.match(h.e('threadWrapTableBody').innerHTML,new RegExp(`<th scope="row">${rows.length-1} <small>end</small></th><td>250</td>`));
  assert.match(h.e('threadWrapTableCaption').textContent,/^Distances in mm\./);
  assert.match(h.e('threadWrapAxesList').innerHTML,/Axis 1<\/strong><span>0° · reference line<\/span><span>6 crossings/);
  assert.match(h.e('threadWrapAxesList').innerHTML,/Axis 2<\/strong><span>180°<\/span><span>5 crossings/);
});

test('changing length and diameters updates the suggestion, table and preview consistently',()=>{
  const h=harness();
  h.type('workshopThreadWrapLength','300');
  assert.equal(h.st().lengthMm,300);
  assert.equal(h.e('workshopThreadWrapRepeats').value,'6');
  let rows=tableRows(h);
  assert.equal(rows.length,13);
  assert.equal(rows[12].position,'300');
  assert.equal((h.e('threadWrapPreview').innerHTML.match(/class="tw-node[ "]/g)||[]).length,rows.length+Math.ceil(rows.length/2));
  h.type('workshopThreadWrapButtDiameter','20');
  h.type('workshopThreadWrapTipDiameter','12');
  rows=tableRows(h);
  const gaps=rows.slice(1).map((r)=>Number(r.gap));
  assert.ok(gaps[gaps.length-1]>gaps[0],'gaps grow toward a thinner tip');
  assert.equal(rows[rows.length-1].position,'300');
  const expected=Engine.designDiamondWrap({lengthMm:300,buttDiameterMm:20,tipDiameterMm:12,axes:2,repeats:h.c.threadWrapEffectiveRepeats(h.st())});
  assert.equal(Number(rows[3].position),Math.round(expected.rows[3].positionMm*10)/10);
  h.type('workshopThreadWrapTipDiameter','20');
  const flat=tableRows(h).slice(1).map((r)=>Number(r.gap));
  assert.ok(flat.every((g)=>Math.abs(g-flat[0])<0.11));
});

test('invalid input shows helpful feedback, hides results and flags the field',()=>{
  const h=harness();
  h.type('workshopThreadWrapLength','');
  assert.equal(h.st().lengthMm,null);
  assert.equal(h.e('threadWrapResults').hidden,true);
  assert.equal(h.e('threadWrapPreviewBlock').hidden,true,'no stale preview while the input is invalid');
  assert.match(h.e('threadWrapMessages').innerHTML,/thread-wrap-message--error">Enter the wrap length\./);
  assert.equal(h.e('workshopThreadWrapLength').getAttribute('aria-invalid'),'true');
  assert.equal(h.e('workshopThreadWrapButtDiameter').getAttribute('aria-invalid'),'false');
  h.type('workshopThreadWrapLength','abc');
  assert.ok(Number.isNaN(h.st().lengthMm));
  assert.match(h.e('threadWrapMessages').innerHTML,/The wrap length is not a valid number\. Type digits only/);
  h.type('workshopThreadWrapLength','-5');
  assert.ok(Number.isNaN(h.st().lengthMm));
  h.type('workshopThreadWrapLength','5');
  assert.match(h.e('threadWrapMessages').innerHTML,/Wrap length must be between 20 mm and 1000 mm/);
  h.type('workshopThreadWrapLength','250');
  assert.equal(h.e('threadWrapResults').hidden,false);
  assert.equal(h.e('threadWrapMessages').innerHTML,'');
  h.type('workshopThreadWrapButtDiameter','0');
  assert.match(h.e('threadWrapMessages').innerHTML,/Butt-side diameter must be between 1 mm and 80 mm/);
  assert.equal(h.e('workshopThreadWrapButtDiameter').getAttribute('aria-invalid'),'true');
  h.type('workshopThreadWrapButtDiameter','16.9');
  h.type('workshopThreadWrapTipDiameter','2');
  assert.match(h.e('threadWrapMessages').innerHTML,/too uneven to wrap neatly\. Shorten the wrap/);
  assert.doesNotMatch(h.e('threadWrapMessages').innerHTML,/Try about/);
  assert.equal(h.e('workshopThreadWrapTipDiameter').getAttribute('aria-invalid'),'true');
  assert.equal(h.e('threadWrapResults').hidden,true);
});

test('repeats stepper, manual entry, impractical counts and returning to the suggestion',()=>{
  const h=harness();
  h.e('workshopThreadWrapRepeatsPlus').listeners.click();
  assert.equal(h.st().repeatsMode,'manual');
  assert.equal(h.st().repeats,6);
  assert.equal(h.e('workshopThreadWrapRepeats').value,'6');
  assert.equal(h.e('threadWrapRepeatsAuto').hidden,false);
  assert.match(h.e('threadWrapRepeatsNote').textContent,/^Suggested: 5/);
  assert.equal(h.e('threadWrapMessages').innerHTML,'','6 repeats is still a normal thread angle');
  h.type('workshopThreadWrapRepeats','8');
  assert.match(h.e('threadWrapMessages').innerHTML,/thread-wrap-message--warning">The thread angle is about 5\d\.\d° from the rod/);
  h.type('workshopThreadWrapRepeats','6');
  h.e('workshopThreadWrapRepeatsMinus').listeners.click();
  h.e('workshopThreadWrapRepeatsMinus').listeners.click();
  assert.equal(h.st().repeats,4);
  h.type('workshopThreadWrapRepeats','30');
  assert.equal(h.e('threadWrapResults').hidden,true);
  assert.match(h.e('threadWrapMessages').innerHTML,/Use fewer repeats\. Try about 5 repeats\./);
  assert.equal(h.e('workshopThreadWrapRepeats').getAttribute('aria-invalid'),'true');
  h.type('workshopThreadWrapRepeats','2.5');
  assert.match(h.e('threadWrapMessages').innerHTML,/whole number/);
  h.type('workshopThreadWrapRepeats','');
  assert.equal(h.st().repeats,2.5,'clearing the field mid-edit does not change the design');
  h.type('workshopThreadWrapRepeats','1');
  for(let i=0;i<3;i+=1)h.e('workshopThreadWrapRepeatsMinus').listeners.click();
  assert.equal(h.st().repeats,1,'stepper never goes below 1');
  h.st().repeats=40;
  h.e('workshopThreadWrapRepeatsPlus').listeners.click();
  assert.equal(h.st().repeats,40,'stepper never goes above 40');
  h.e('threadWrapRepeatsAuto').listeners.click();
  assert.equal(h.st().repeatsMode,'auto');
  assert.equal(h.e('workshopThreadWrapRepeats').value,'5');
  assert.equal(h.e('threadWrapResults').hidden,false);
});

test('axes, accent count and colour controls update state, toggles, accent visibility and preview colours',()=>{
  const h=harness();
  h.click({'data-thread-wrap-axes':'4'});
  assert.equal(h.st().axes,4);
  assert.equal(h.e('workshopThreadWrapRepeats').value,'10');
  assert.equal(tableRows(h)[0].axes,'1 · 3');
  assert.equal(tableRows(h)[1].axes,'2 · 4');
  h.click({'data-thread-wrap-axes':'6'});
  assert.equal(tableRows(h)[0].axes,'1 · 3 · 5');
  h.click({'data-thread-wrap-axes':'2'});
  h.click({'data-thread-wrap-colour':'main','data-colour-id':'red'});
  h.click({'data-thread-wrap-colour':'accent','data-colour-id':'silver'});
  assert.equal(h.st().mainColour,'red');
  assert.equal(h.st().accentColour,'silver');
  const preview=h.e('threadWrapPreview').innerHTML;
  assert.ok(preview.includes(Engine.colourById('red').hex) && preview.includes(Engine.colourById('silver').hex));
  assert.ok(!preview.includes(Engine.colourById('gold').hex));
  assert.match(h.e('threadWrapSteps').innerHTML,/Lay the 2 red centre-line spirals/);
  assert.match(h.e('threadWrapSteps').innerHTML,/1 silver thread each side/);
  h.click({'data-thread-wrap-accent-count':'0'});
  assert.equal(h.e('threadWrapAccentGroup').hidden,true);
  assert.equal((h.e('threadWrapPreview').innerHTML.match(/class="tw-accent"/g)||[]).length,0);
  assert.match(h.e('threadWrapSteps').innerHTML,/none selected/);
  h.click({'data-thread-wrap-accent-count':'3'});
  assert.equal(h.e('threadWrapAccentGroup').hidden,false);
  assert.equal((h.e('threadWrapPreview').innerHTML.match(/class="tw-accent"/g)||[]).length,2*3*2);
  const last=h.toggles.slice(-4);
  assert.deepEqual(last.map((t)=>t.value),['2','3','red','silver']);
  assert.deepEqual(last.map((t)=>t.selector),['[data-thread-wrap-axes]','[data-thread-wrap-accent-count]','[data-colour-id]','[data-colour-id]']);
  // geometry is untouched by colour and accent changes
  const rowsAfter=tableRows(h);
  h.click({'data-thread-wrap-colour':'main','data-colour-id':'blue'});
  assert.deepEqual(tableRows(h),rowsAfter);
});

test('imperial units: decimal and fractional entry convert to the same millimetre design',()=>{
  const h=harness({unit:'imperial',imperialDisplay:'decimal'});
  assert.equal(h.e('workshopThreadWrapLength').value,'9.843');
  assert.equal(h.e('workshopThreadWrapButtDiameter').value,'0.665');
  assert.match(h.e('threadWrapTableCaption').textContent,/^Distances in in\./);
  h.type('workshopThreadWrapLength','10');
  assert.ok(Math.abs(h.st().lengthMm-254)<1e-9);
  assert.equal(tableRows(h).pop().position,'10');
  h.type('workshopThreadWrapLength','9 7/8');
  assert.ok(Math.abs(h.st().lengthMm-9.875*25.4)<1e-9);
  assert.equal(tableRows(h).pop().position,'9.875');
  h.type('workshopThreadWrapLength','25/32');
  assert.match(h.e('threadWrapMessages').innerHTML,/Wrap length must be between 0\.787 in and 39\.37 in/);
  h.type('workshopThreadWrapLength','9.843');
  const imperialRows=tableRows(h).map((r)=>Number(r.position));
  const metric=Engine.designDiamondWrap({lengthMm:9.843*25.4,buttDiameterMm:h.st().buttDiameterMm,tipDiameterMm:h.st().tipDiameterMm,axes:2,repeats:5});
  imperialRows.forEach((inches,j)=>assert.ok(Math.abs(inches*25.4-metric.rows[j].positionMm)<0.03,`row ${j}`));
  assert.match(h.e('threadWrapSteps').innerHTML,/9\.843 in/);
  assert.ok(!/ mm\b/.test(h.e('threadWrapSteps').innerHTML));
  assert.match(h.e('threadWrapSumThread').textContent,/ in$/);
  h.setUnit('metric','decimal');
  assert.equal(h.e('workshopThreadWrapLength').value,String(Math.round(9.843*25.4*1000)/1000));
  assert.match(h.e('threadWrapTableCaption').textContent,/^Distances in mm\./);
});

test('imperial fractional preference still shows decimal inches in inputs and marking tables so the taper stays visible',()=>{
  const h=harness({unit:'imperial',imperialDisplay:'fractional'});
  assert.equal(h.e('workshopThreadWrapLength').value,'9.843');
  assert.equal(h.e('workshopThreadWrapButtDiameter').value,'0.665');
  assert.equal(h.e('workshopThreadWrapTipDiameter').value,'0.602');
  assert.notEqual(h.e('workshopThreadWrapButtDiameter').value,h.e('workshopThreadWrapTipDiameter').value);
  assert.match(tableRows(h)[1].position,/^\d+\.\d+$/);
  h.type('workshopThreadWrapLength','9 7/8');
  assert.ok(Math.abs(h.st().lengthMm-9.875*25.4)<1e-9,'typed fractions are still understood');
});

test('the renderer does nothing while another Workshop tool is open',()=>{
  const h=harness();
  const before=h.e('threadWrapTableBody').innerHTML;
  h.c.workshopToolsState.activeTool='grip';
  h.e('threadWrapTableBody').innerHTML='sentinel';
  h.c.renderThreadWrapTool();
  assert.equal(h.e('threadWrapTableBody').innerHTML,'sentinel');
  h.c.workshopToolsState.activeTool='thread-wrap';
  h.c.renderThreadWrapTool();
  assert.equal(h.e('threadWrapTableBody').innerHTML,before);
});

test('tool visibility: only the active Workshop tool card is shown, existing tools unchanged',()=>{
  const cards={workshopToolsList:{hidden:false},workshopToolDiameter:{hidden:true},workshopToolGrip:{hidden:true},workshopToolThreadWrap:{hidden:true},workshopToolsPanel:{classList:{toggle(name,on){cards.panelOpen=on;}}}};
  const intro={hidden:false};
  const c=vm.createContext({
    $:(id)=>cards[id]||null,
    document:{querySelector:()=>intro},
    workshopToolsState:{activeTool:'list'},
  });
  vm.runInContext(extract('renderWorkshopToolVisibility'),c);
  const visible=()=>Object.entries(cards).filter(([id,el])=>id.startsWith('workshopTool') && id!=='workshopToolsPanel' && el.hidden===false).map(([id])=>id);
  c.renderWorkshopToolVisibility();
  assert.deepEqual(visible(),['workshopToolsList']);
  for(const [tool,id] of [['diameter','workshopToolDiameter'],['grip','workshopToolGrip'],['thread-wrap','workshopToolThreadWrap']]){
    c.workshopToolsState.activeTool=tool;
    c.renderWorkshopToolVisibility();
    assert.deepEqual(visible(),[id]);
    assert.equal(intro.hidden,true);
    assert.equal(cards.panelOpen,true);
  }
});

test('opening a Workshop tool: thread-wrap is selected, grip and diameter are unchanged, unknown ids fall back to diameter',()=>{
  const calls=[];
  const c=vm.createContext({
    workshopToolsState:{activeTool:'list'},
    workshopLandingReturnFocusTool:'',
    clearLayoutEntryOrigin:()=>calls.push('clear'),
    goScreen:(id)=>calls.push(id),
    window:{setTimeout:()=>0},
  });
  vm.runInContext(extract('openWorkshopTool'),c);
  for(const [input,expected] of [['thread-wrap','thread-wrap'],['grip','grip'],['diameter','diameter'],['bogus','diameter'],['','diameter']]){
    c.openWorkshopTool(input);
    assert.equal(c.workshopToolsState.activeTool,expected,input);
    assert.equal(calls[calls.length-1],'workshopLandingScreen');
  }
  c.openWorkshopTool('guide-spacing');
  assert.equal(calls[calls.length-1],'layoutScreen');
});

test('Workshop wiring: launcher, card, script order, offline cache and render hook are present',()=>{
  const list=html.match(/<div id="workshopToolsList"[\s\S]*?<\/div>\s*<article/)[0];
  assert.ok(list.includes('data-workshop-tool-open="thread-wrap"'));
  assert.ok(list.includes('Thread Wrap Designer'));
  ['guide-spacing','grip','diameter'].forEach((tool)=>assert.ok(list.includes(`data-workshop-tool-open="${tool}"`),tool));
  assert.match(html,/<article id="workshopToolThreadWrap" class="layout-control-card workshop-tool-card"[^>]*hidden>/);
  const card=html.match(/<article id="workshopToolThreadWrap"[\s\S]*?<\/article>/)[0];
  assert.ok(card.includes('data-workshop-tool-back'));
  ['workshopThreadWrapLength','workshopThreadWrapButtDiameter','workshopThreadWrapTipDiameter'].forEach((id)=>{
    assert.match(card,new RegExp(`id="${id}" type="text" inputmode="decimal"`));
  });
  assert.match(card,/data-measurement-label="Wrap Length"/);
  assert.match(card,/data-measurement-label="Butt-side Diameter"/);
  assert.match(card,/data-measurement-label="Tip-side Diameter"/);
  ['2','4','6'].forEach((n)=>assert.match(card,new RegExp(`data-thread-wrap-axes="${n}" aria-pressed="false"`)));
  ['0','1','2','3'].forEach((n)=>assert.match(card,new RegExp(`data-thread-wrap-accent-count="${n}" aria-pressed="false"`)));
  assert.match(card,/id="threadWrapMessages" class="thread-wrap-messages" aria-live="polite"/);
  assert.match(card,/<table id="threadWrapTable"[\s\S]*?<th scope="col">Row<\/th>/);
  assert.match(card,/<details class="thread-wrap-method">/);
  assert.ok(bootstrap.indexOf('js/thread-wrap.js')>bootstrap.indexOf('js/guide-layout.js') && bootstrap.indexOf('js/thread-wrap.js')<bootstrap.indexOf('js/ui.js'));
  assert.ok(worker.includes("'js/thread-wrap.js'"));
  assert.match(source,/renderGripCoveringTool\(\);\s*renderThreadWrapTool\(\);\s*renderSpiralGuideMapper\(\);/);
  assert.match(source,/bindThreadWrapControls\(\);/);
  assert.match(source,/workshopLandingReturnFocusTool==='thread-wrap'/);
});

test('mobile layout: 44px targets, 16px inputs, two-column paired fields and no hidden controls',()=>{
  assert.match(css,/#workshopToolThreadWrap \.workshop-tool-fields input\{[^}]*min-height:44px;[^}]*font-size:16px;/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-segment \.ghost-action\{\s*min-height:44px;/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-swatch\{[^}]*min-height:44px;/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-method summary\{[^}]*min-height:44px;/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-repeats-note \.ghost-action\{[^}]*min-height:44px;/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-sources a\{\s*display:inline-block;\s*padding:12px 0;/);
  assert.match(css,/#workshopToolThreadWrap \.workshop-tool-fields--two\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-swatches\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\);/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-svg\{\s*display:block;\s*width:100%;\s*height:auto;/);
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-table-wrap\{[^}]*overflow-x:auto;/);
  assert.match(css,/#workshopToolThreadWrap input\[aria-invalid="true"\]/);
  // the tool relies on the standard Workshop button and stepper styling rather than introducing a new system
  assert.match(html,/class="component-quantity__step"/);
  assert.match(html,/class="workshop-dc-wraps thread-wrap-repeats"/);
});

test('iPhone order: inputs, then preview, then colours; messages sit beside the inputs',()=>{
  const card=html.match(/<article id="workshopToolThreadWrap"[\s\S]*?<\/article>/)[0];
  const at=(needle)=>{const i=card.indexOf(needle);assert.ok(i>=0,needle);return i;};
  assert.ok(at('id="workshopThreadWrapLength"')<at('id="threadWrapMessages"'));
  assert.ok(at('id="threadWrapMessages"')<at('id="threadWrapPreviewBlock"'));
  assert.ok(at('id="threadWrapPreviewBlock"')<at('id="threadWrapMainColours"'));
  assert.ok(at('id="threadWrapMainColours"')<at('id="threadWrapResults"'));
  assert.ok(at('id="threadWrapResults"')<at('id="threadWrapTable"'));
  assert.ok(at('id="threadWrapTable"')<at('id="threadWrapSteps"'));
  const inputsColumn=card.slice(at('thread-wrap-config__col--inputs'),at('id="threadWrapPreviewBlock"'));
  assert.ok(inputsColumn.includes('id="threadWrapMessages"'));
  assert.match(css,/#workshopToolThreadWrap \.thread-wrap-config\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);\s*grid-template-areas:"inputs colours" "preview preview";/);
});

test('desktop layout: the wider shell applies only while this tool is open, inside the desktop media query',()=>{
  const block=css.slice(css.indexOf('/* Thread Wrap Designer (Workshop)'));
  assert.ok(block.length>1000);
  const media=block.match(/@media \(min-width:761px\)\{([\s\S]*)\}\s*$/);
  assert.ok(media,'desktop media query');
  assert.match(media[1],/\.app-shell:has\(#workshopLandingScreen\.active #workshopToolThreadWrap:not\(\[hidden\]\)\)\{\s*width:min\(100%,840px\);/);
  assert.match(media[1],/#workshopToolThreadWrap \.thread-wrap-config\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);/);
  assert.ok(!/(^|\n)\.app-shell\s*\{/.test(block),'global app-shell is not redefined');
});

test('every new style rule is scoped to the Thread Wrap Designer so other Workshop tools are untouched',()=>{
  const block=css.slice(css.indexOf('/* Thread Wrap Designer (Workshop)')).replace(/\/\*[\s\S]*?\*\//g,'');
  const allowed=['#workshopToolThreadWrap','.app-shell:has(#workshopLandingScreen.active #workshopToolThreadWrap'];
  let checked=0;
  for(const match of block.matchAll(/(^|[}{])\s*([^{}@][^{}]*)\{/g)){
    const selector=match[2].trim();
    if(!selector || selector.startsWith('@') || /^\d/.test(selector))continue;
    // split on commas that are not inside parentheses (e.g. :is(button,input))
    selector.split(/,(?![^(]*\))/).map((part)=>part.trim()).filter(Boolean).forEach((part)=>{
      checked+=1;
      assert.ok(allowed.some((prefix)=>part.startsWith(prefix)),`unscoped selector: ${part}`);
    });
  }
  assert.ok(checked>50,`only ${checked} selectors checked`);
});

test('restrained K-Labs styling: existing design tokens, no new colour system, selected state uses deep red',()=>{
  const block=css.slice(css.indexOf('/* Thread Wrap Designer (Workshop)'));
  assert.match(block,/\.thread-wrap-swatch\[aria-pressed="true"\]\{[^}]*rgba\(var\(--kl-red-rgb\)/);
  assert.match(block,/color:var\(--titanium\)/);
  assert.ok(!/@keyframes|animation:/.test(block),'no decorative animation');
  assert.ok(!/#[0-9a-f]{6}.*gradient.*(#00|#0f)/i.test(block));
});

// Character encoding of everything the UI writes into the page.
const UI_MOJIBAKE=/[\u00C2-\u00F4][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/;
const UI_ALLOWED_GLYPHS=new Set([0x00B0,0x00B7,0x00D7,0x03C0,0x2013,0x2014,0x2019,0x201C,0x201D,0x2026,0x2192,0x2248,0x00E9,0x00F4]);
const OUTPUT_IDS=['threadWrapMessages','threadWrapRepeatsNote','threadWrapSumRepeats','threadWrapSumRepeatLength','threadWrapSumAngle','threadWrapSumCircumference','threadWrapSumThread','threadWrapSumThreadTotal','threadWrapPreview','threadWrapAxesList','threadWrapTableCaption','threadWrapTableBody','threadWrapSteps','threadWrapMainColours','threadWrapAccentColours','threadWrapMethodBody'];
const collectOutput=(h)=>OUTPUT_IDS.map((id)=>[id,String(h.e(id).innerHTML||'')+'\n'+String(h.e(id).textContent||'')]);

test('rendered output has correct characters and no encoding corruption in metric and imperial, for 2, 4 and 6 axes',()=>{
  const seen=new Set();
  for(const [unit,display] of [['metric','decimal'],['imperial','decimal'],['imperial','fractional']]){
    for(const axes of [2,4,6]){
      const h=harness({unit,imperialDisplay:display});
      h.click({'data-thread-wrap-axes':String(axes)});
      for(const [id,text] of collectOutput(h)){
        assert.doesNotMatch(text,UI_MOJIBAKE,`${unit}/${axes}/${id}`);
        assert.ok(!text.includes('\uFFFD'),`replacement character in ${id}`);
        for(const ch of text){
          const code=ch.codePointAt(0);
          if(code>127){
            seen.add(code);
            assert.ok(UI_ALLOWED_GLYPHS.has(code),`${unit}/${axes}/${id}: unexpected U+${code.toString(16).toUpperCase()}`);
          }
        }
      }
      // the SVG preview that the UI injects stays ASCII
      assert.equal([...h.e('threadWrapPreview').innerHTML].filter((ch)=>ch.codePointAt(0)>127).length,0);
    }
  }
  [0x00B0,0x00B7,0x2014,0x2192,0x2248,0x03C0,0x2019].forEach((code)=>assert.ok(seen.has(code),`U+${code.toString(16).toUpperCase()} rendered somewhere`));
});

test('rendered summary, table and preview show the intended symbols',()=>{
  const h=harness();
  assert.match(h.e('threadWrapSumRepeatLength').textContent,/^48\.1 \u2192 52 mm$/);
  assert.match(h.e('threadWrapSumAngle').textContent,/^45\.4\u00B0 \(42\.7\u201347\.8\u00B0\)$/);
  assert.match(h.e('threadWrapSumThread').textContent,/^\u2248 355\.\d mm$/);
  assert.match(h.e('threadWrapSumThreadTotal').textContent,/^main \u2248 \d+(\.\d)? mm \u00B7 accent \u2248 \d+(\.\d)? mm$/);
  assert.match(h.e('threadWrapTableBody').innerHTML,/<td>\u2014<\/td>/);
  assert.match(h.e('threadWrapAxesList').innerHTML,/<span>0\u00B0 \u00B7 reference line<\/span>/);
  assert.match(h.e('threadWrapAxesList').innerHTML,/<span>180\u00B0<\/span>/);
  assert.ok(h.e('threadWrapPreview').innerHTML.includes('>A1 0&#176;</text>'));
  assert.ok(h.e('threadWrapPreview').innerHTML.includes('>A2 180&#176;</text>'));
  assert.match(h.e('threadWrapRepeatsNote').textContent,/about 45\u00B0: 5\.$/);
  assert.ok(h.e('threadWrapSteps').innerHTML.includes('180\u00B0 from Axis 1'));
  assert.ok(h.e('threadWrapSteps').innerHTML.includes('divide that circumference by \u03C0'));
  assert.ok(h.e('threadWrapSteps').innerHTML.includes('\u201CFrom butt end\u201D'));
  assert.ok(h.e('threadWrapSteps').innerHTML.includes('A1 r0 \u2192 A2 r1'));
  const method=h.e('threadWrapMethodBody').innerHTML;
  assert.ok(method.includes('circumference \u00D7 repeat length'));
  assert.ok(method.includes('This tool&rsquo;s own assumptions'));
  assert.ok(method.includes('J\u00E9r\u00F4me'));
  assert.ok(method.includes('(pen turning)'));
});

test('validation messages and warnings render with correct degree signs',()=>{
  const h=harness();
  h.type('workshopThreadWrapRepeats','8');
  assert.match(h.e('threadWrapMessages').innerHTML,/about 5\d\.\d\u00B0 from the rod\. Published methods start near 45\u00B0, so/);
  assert.doesNotMatch(h.e('threadWrapMessages').innerHTML,UI_MOJIBAKE);
  h.type('workshopThreadWrapRepeats','30');
  assert.match(h.e('threadWrapMessages').innerHTML,/about 8\d\.\d\u00B0 from the rod/);
});

test('Thread Wrap is a standard Workshop tool with practical starting-mark guidance',()=>{
  const launcher=html.match(/<button[^>]*data-workshop-tool-open="thread-wrap"[\s\S]*?<\/button>/)[0];
  assert.match(launcher,/<span class="workshop-tool-launch__title">Thread Wrap Designer<\/span>/);
  assert.doesNotMatch(launcher,/Beta|thread-wrap-beta/);
  const card=html.match(/<article id="workshopToolThreadWrap"[\s\S]*?<\/article>/)[0];
  assert.match(card,/<h3>Thread Wrap Designer<\/h3>/);
  assert.match(card,/<p class="workshop-tool-note" role="note">Calculated positions are starting marks for laying out a basic diamond cross-wrap\.<\/p>/);
  assert.doesNotMatch(card,/Beta|thread-wrap-beta/);
});

test('Thread Wrap has no remaining Beta-only styling',()=>{
  assert.doesNotMatch(css,/thread-wrap-beta/);
});
