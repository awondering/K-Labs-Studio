const $=id=>document.getElementById(id);
function normalizeLayoutState(input){
  const raw=input&&typeof input==='object'?input:{};
  return {
    firstGuide:clampValue(raw.firstGuide,50,300),
    guideCount:clampValue(raw.guideCount,5,20),
    targetStripper:clampValue(raw.targetStripper,500,2500),
    locked:false,
    workshopIndex:Math.max(0,clampValue(raw.workshopIndex,0,1000))
  };
}
let state=normalizeLayoutState(Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0}));
const DEFAULT_CATEGORY_NAMES=['Blank','Reel Seat','Grip','Winding Checks','Butt Cap','Hook Keeper','Guides','Tip Top','Thread & Finish','Epoxy','Clear coat','Freight','Decals','Other'];
const DEFAULT_SUPPLIER_NAMES=['Fuji','CTS','Alps','Batson','American Tackle','PacBay','K-Labs','AliExpress','Other'];
const CUSTOM_CATEGORY_STORAGE_KEY='klabs-workshop-custom-categories';
const CUSTOM_SUPPLIER_STORAGE_KEY='klabs-workshop-custom-suppliers';
const ARCHIVED_CATEGORY_STORAGE_KEY='klabs-workshop-archived-categories';
const ARCHIVED_SUPPLIER_STORAGE_KEY='klabs-workshop-archived-suppliers';
const COMPONENT_LIBRARY_STORAGE_KEY='klabs-workshop-component-library';
const BLANK_LIBRARY_STORAGE_KEY='klabs-blank-library';
const BLANK_LIBRARY_SEARCH_KEY='klabs-blank-library-search';
const SETTINGS_STORAGE_KEY='klabs-studio-settings';
const MEASUREMENT_UNIT_VALUES=['metric','imperial'];
const IMPERIAL_DISPLAY_VALUES=['decimal','fractional'];
const DATE_FORMAT_VALUES=['dd/mm/yyyy','mm/dd/yyyy','yyyy-mm-dd'];
const QUOTE_STATUS_VALUES=['draft','sent','revised','declined','expired','accepted'];
const WORKSHOP_COLLAPSIBLE_SECTION_IDS=['workshopCustomerBody','workshopBuildSpecsBody','workshopQuoteSummaryBody','workshopBuildActionsBody'];
const BUILD_SPEC_FIELDS=[
  {id:'quoteSpecReelSeatPosition',key:'reelSeatPosition',label:'Reel Seat Position',visibility:'customer'},
  {id:'quoteSpecRearGripLength',key:'rearGripLength',label:'Rear Grip Length',visibility:'customer'},
  {id:'quoteSpecGripBelowReelSeatLength',key:'gripBelowReelSeatLength',label:'Grip Below Reel Seat Length',visibility:'customer'},
  {id:'quoteSpecForeGripLength',key:'foreGripLength',label:'Fore Grip Length',visibility:'customer'},
  {id:'quoteSpecHookKeeperPosition',key:'hookKeeperPosition',label:'Hook Keeper Position',visibility:'customer'},
  {id:'quoteSpecBuilderNotes',key:'builderNotes',label:'Builder Notes',visibility:'workshop'}
];
let studioSettings=normalizeStudioSettings(Store.get(SETTINGS_STORAGE_KEY,{}));
let quote=normalizeQuote(Store.get('klabs-workshop-quote-current',null)||newQuoteTemplate());
let blanks=normalizeBlankLibrary(Store.get(BLANK_LIBRARY_STORAGE_KEY,defaultBlankLibrary()));
let blankLibrarySearch=String(Store.get(BLANK_LIBRARY_SEARCH_KEY,'')||'');
let buildsSearch='';
let customerFinderSearch='';
let customerFinderSelectedKey='';
let customerFinderIntent='browse';
let customerFinderNewBuildStep='actions';
let customerBrowserSearch='';
let customerBrowserSelectedKey='';
let customerBrowserEditMode=false;
let selectedBlankEditState=null;
let selectedBlankControlsBound=false;
let hasUnsavedQuoteChanges=false;
let quotePreviewIntent='view';
const controlMeta={guideCount:{key:'guideCount',min:5,max:20,step:1},firstGuide:{key:'firstGuide',min:50,max:300,step:1},targetStripper:{key:'targetStripper',min:500,max:2500,step:1}};
let holdTimer=null;
let holdDelayTimer=null;
let holdContext=null;
let activeChoicePicker={type:'category',index:-1};
let activeChoiceEditor={mode:'add',originalName:''};
let activeChoiceMenu={name:'',id:'',top:0,left:0,open:false};
const choicePickerSessionFavourites={category:new Set(),supplier:new Set()};
const CHOICE_PICKER_FAVOURITES_KEY='klabs-choice-picker-favourites';
let choicePickerCategoryFilter='all';
let shouldAnimateComponentRows=false;
let expandedComponentRowIndex=-1;
let componentRowMenuPointerDown={index:-1,expiresAt:0};
const pendingComponentDraftRows=new WeakSet();
let activeConfirmHandler=null;
let activeBlankEditorId='';
let pendingControlPersist=false;
const layoutFieldOrder=['firstGuide','guideCount','targetStripper'];
const homeRodState={ledCount:9,litCount:0,layoutLitCount:0,componentLitCount:0,ready:false,homeFirstOpen:true,sequenceTimer:null,sequenceAnimating:false,sequenceCompleted:false};
let modalLockDepth=0;
let modalReturnFocusEl=null;
let modalLockedScrollY=0;
let choicePickerViewportBound=false;
let choicePickerViewportRaf=0;
let customerFinderViewportBound=false;
let customerFinderViewportRaf=0;
let workshopKeyboardDismissGuardBound=false;
let workshopInputFocusStabilityBound=false;
let workshopBackToTopBound=false;
let workshopBackToTopRafId=0;
let workshopBackToTopLastScrollY=-1;
let workshopStatusFlashText='';
let workshopStatusFlashPending=false;
let workshopStatusFlashUntil=0;
let workshopStatusFlashTimer=null;
let preserveWorkshopQuoteOnEntry=false;
let activeSavedBuildRef=null;
const workshopKeyboardDismissState={
  suppressNavUntil:0,
  preservedScrollY:0,
};
const choicePickerViewportState={
  keyboardActive:false,
};
const customerFinderViewportState={
  keyboardActive:false,
};
const workshopToolsState={
  activeTool:'list',
  diameter:{
    unit:'metric',
    imperialDisplay:'fractional',
    diameterMm:28,
    lastEdited:'diameter',
  },
  grip:{
    unit:'metric',
    imperialDisplay:'fractional',
    profile:'straight',
    straightDiameterMm:28,
    startDiameterMm:30,
    endDiameterMm:24,
    lengthMm:280,
    coverWidthMm:25,
    allowancePercent:5,
  },
};
let gripCutTemplateSnapshot=null;

function save(){
  Store.set('klabs-studio-state',{
    firstGuide:numberOrZero(state.firstGuide),
    guideCount:numberOrZero(state.guideCount),
    targetStripper:numberOrZero(state.targetStripper),
    locked:false,
    workshopIndex:numberOrZero(state.workshopIndex)
  });
}
function saveQuoteCurrent(){Store.set('klabs-workshop-quote-current',quote)}
function numberOrZero(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function currency(value){return '$'+numberOrZero(value).toFixed(2)}
function normalizeMeasurementUnits(value){
  const next=String(value||'').trim().toLowerCase();
  return MEASUREMENT_UNIT_VALUES.includes(next)?next:'metric';
}
function normalizeDateFormat(value){
  const next=String(value||'').trim().toLowerCase();
  return DATE_FORMAT_VALUES.includes(next)?next:'dd/mm/yyyy';
}
function normalizeImperialDisplay(value){
  const next=String(value||'').trim().toLowerCase();
  return IMPERIAL_DISPLAY_VALUES.includes(next)?next:'fractional';
}
function loadChoicePickerFavourites(){
  const stored=Store.get(CHOICE_PICKER_FAVOURITES_KEY,{});
  const categoryValues=Array.isArray(stored&&stored.category)?stored.category:[];
  const supplierValues=Array.isArray(stored&&stored.supplier)?stored.supplier:[];
  choicePickerSessionFavourites.category=new Set(categoryValues.map(normalizeNameKey).filter(Boolean));
  choicePickerSessionFavourites.supplier=new Set(supplierValues.map(normalizeNameKey).filter(Boolean));
}
function saveChoicePickerFavourites(){
  Store.set(CHOICE_PICKER_FAVOURITES_KEY,{
    category:Array.from(choicePickerSessionFavourites.category||new Set()),
    supplier:Array.from(choicePickerSessionFavourites.supplier||new Set()),
  });
}
function normalizeStudioSettings(settings){
  const taxRate=Math.max(0,numberOrZero(settings&&settings.taxRate)||15);
  const taxEnabled=(settings&&typeof settings.taxEnabled==='boolean')?settings.taxEnabled:true;
  const measurementUnits=normalizeMeasurementUnits(settings&&settings.measurementUnits);
  const imperialDisplay=normalizeImperialDisplay(settings&&settings.imperialDisplay);
  const dateFormat=normalizeDateFormat(settings&&settings.dateFormat);
  return {taxRate,taxEnabled,measurementUnits,imperialDisplay,dateFormat};
}
function saveStudioSettings(){
  Store.set(SETTINGS_STORAGE_KEY,studioSettings);
}
function activeTaxRate(){
  return Math.max(0,numberOrZero(studioSettings&&studioSettings.taxRate)||15);
}
function activeTaxEnabled(){
  return (studioSettings&&typeof studioSettings.taxEnabled==='boolean')?studioSettings.taxEnabled:true;
}
function activeMeasurementUnits(){
  return normalizeMeasurementUnits(studioSettings&&studioSettings.measurementUnits);
}
function activeImperialDisplay(){
  return normalizeImperialDisplay(studioSettings&&studioSettings.imperialDisplay);
}
function activeDateFormat(){
  return normalizeDateFormat(studioSettings&&studioSettings.dateFormat);
}
function roundMoney(value){
  return Math.round(numberOrZero(value)*100)/100;
}
function mmToInches(valueMm){
  return numberOrZero(valueMm)/25.4;
}
function inchesToMm(valueInches){
  return numberOrZero(valueInches)*25.4;
}
function trimTrailingZeroes(text){
  return String(text||'').replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}
function formatDecimal(value,decimals){
  return trimTrailingZeroes(numberOrZero(value).toFixed(Math.max(0,decimals)));
}
function gcd(a,b){
  let x=Math.abs(Math.round(a));
  let y=Math.abs(Math.round(b));
  while(y){
    const next=x%y;
    x=y;
    y=next;
  }
  return x||1;
}
function formatImperialFractionInches(valueInches,maxDenominator){
  const denominator=Math.max(2,Math.round(numberOrZero(maxDenominator)||32));
  const value=numberOrZero(valueInches);
  const negative=value<0;
  const absValue=Math.abs(value);
  let whole=Math.floor(absValue);
  let numerator=Math.round((absValue-whole)*denominator);
  if(numerator===denominator){
    whole+=1;
    numerator=0;
  }
  if(numerator===0){
    return `${negative?'-':''}${whole}`;
  }
  const divisor=gcd(numerator,denominator);
  const reducedNumerator=numerator/divisor;
  const reducedDenominator=denominator/divisor;
  if(whole===0){
    return `${negative?'-':''}${reducedNumerator}/${reducedDenominator}`;
  }
  return `${negative?'-':''}${whole} ${reducedNumerator}/${reducedDenominator}`;
}
function parseImperialInchesInput(rawValue){
  const compact=String(rawValue||'').replace(/inches?|in\.?/gi,' ').trim();
  if(!compact)return NaN;
  if(/^[+-]?\d*(?:\.\d+)?$/.test(compact.replace(/\s+/g,''))){
    const parsed=Number(compact);
    return Number.isFinite(parsed)?parsed:NaN;
  }
  const mixed=compact.match(/^([+-])?\s*(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if(mixed){
    const sign=mixed[1]==='-'?-1:1;
    const whole=Number(mixed[2]);
    const numerator=Number(mixed[3]);
    const denominator=Number(mixed[4]);
    if(!Number.isFinite(whole) || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator===0){
      return NaN;
    }
    return sign*(whole+(numerator/denominator));
  }
  const fraction=compact.match(/^([+-])?\s*(\d+)\s*\/\s*(\d+)$/);
  if(fraction){
    const sign=fraction[1]==='-'?-1:1;
    const numerator=Number(fraction[2]);
    const denominator=Number(fraction[3]);
    if(!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator===0){
      return NaN;
    }
    return sign*(numerator/denominator);
  }
  return NaN;
}
function measurementUnitSuffix(){
  return activeMeasurementUnits()==='imperial'?'in':'mm';
}
function measurementUnitLabel(){
  return activeMeasurementUnits()==='imperial'?'Imperial (in)':'Metric (mm)';
}
function formatMeasurementNumber(valueMm,options){
  const settings=options&&typeof options==='object'?options:{};
  if(activeMeasurementUnits()==='imperial'){
    const inchesValue=mmToInches(valueMm);
    if(activeImperialDisplay()==='fractional' && settings.forceDecimal!==true){
      return formatImperialFractionInches(inchesValue,settings.maxImperialDenominator===undefined?32:settings.maxImperialDenominator);
    }
    const decimals=settings.decimalsImperial===undefined?2:settings.decimalsImperial;
    return numberOrZero(inchesValue).toFixed(Math.max(0,decimals));
  }
  return formatDecimal(valueMm,settings.decimalsMetric===undefined?1:settings.decimalsMetric);
}
function formatMeasurementValue(valueMm,options){
  return `${formatMeasurementNumber(valueMm,options)} ${measurementUnitSuffix()}`;
}
function parseMeasurementInputValue(rawValue){
  if(activeMeasurementUnits()==='imperial'){
    const inches=parseImperialInchesInput(rawValue);
    if(!Number.isFinite(inches))return NaN;
    return inchesToMm(inches);
  }
  const parsed=Number(rawValue);
  return Number.isFinite(parsed)?parsed:NaN;
}
function normalizeWorkshopUnit(value){
  return String(value||'').trim().toLowerCase()==='imperial'?'imperial':'metric';
}
function normalizeWorkshopImperialDisplay(value){
  return String(value||'').trim().toLowerCase()==='decimal'?'decimal':'fractional';
}
function workshopUnitSuffix(unit){
  return normalizeWorkshopUnit(unit)==='imperial'?'in':'mm';
}
function parseWorkshopMeasurementMm(rawValue,unit,fallbackMm,allowZero){
  const normalizedUnit=normalizeWorkshopUnit(unit);
  let parsed=NaN;
  if(normalizedUnit==='imperial'){
    const inches=parseImperialInchesInput(rawValue);
    if(Number.isFinite(inches))parsed=inchesToMm(inches);
  }else{
    const numeric=Number(rawValue);
    if(Number.isFinite(numeric))parsed=numeric;
  }
  if(!Number.isFinite(parsed))return fallbackMm;
  if(allowZero){
    if(parsed<0)return fallbackMm;
  }else if(parsed<=0){
    return fallbackMm;
  }
  return parsed;
}
function formatWorkshopMeasurementNumber(valueMm,unit,imperialDisplay,options){
  const settings=options&&typeof options==='object'?options:{};
  const normalizedUnit=normalizeWorkshopUnit(unit);
  const normalizedImperialDisplay=normalizeWorkshopImperialDisplay(imperialDisplay);
  if(normalizedUnit==='imperial'){
    const inchesValue=mmToInches(valueMm);
    if(normalizedImperialDisplay==='fractional' && settings.forceDecimal!==true){
      return formatImperialFractionInches(inchesValue,settings.maxImperialDenominator===undefined?32:settings.maxImperialDenominator);
    }
    const decimals=settings.decimalsImperial===undefined?2:settings.decimalsImperial;
    return formatDecimal(inchesValue,decimals);
  }
  return formatDecimal(valueMm,settings.decimalsMetric===undefined?1:settings.decimalsMetric);
}
function formatWorkshopMeasurementValue(valueMm,unit,imperialDisplay,options){
  return `${formatWorkshopMeasurementNumber(valueMm,unit,imperialDisplay,options)} ${workshopUnitSuffix(unit)}`;
}
function workshopMeasurementInputText(valueMm,unit,imperialDisplay){
  return formatWorkshopMeasurementNumber(valueMm,unit,imperialDisplay,{decimalsMetric:2,decimalsImperial:2,maxImperialDenominator:32});
}
function taperSpiralWrapLengthMm(startDiameterMm,endDiameterMm,gripLengthMm,materialWidthMm){
  const length=Math.max(0,numberOrZero(gripLengthMm));
  const width=Math.max(0.01,numberOrZero(materialWidthMm));
  const start=Math.max(0.01,numberOrZero(startDiameterMm));
  const end=Math.max(0.01,numberOrZero(endDiameterMm));
  if(length===0)return 0;
  const steps=140;
  const segmentLength=length/steps;
  let total=0;
  for(let i=0;i<steps;i+=1){
    const t=(i+0.5)/steps;
    const diameter=start+((end-start)*t);
    const circumference=Math.PI*diameter;
    total+=(segmentLength/width)*Math.sqrt((circumference*circumference)+(width*width));
  }
  return Math.max(0,total);
}
function gripCutAngleDegrees(circumferenceMm,coverWidthMm){
  const circumference=Math.max(0.01,numberOrZero(circumferenceMm));
  const width=Math.max(0.01,numberOrZero(coverWidthMm));
  return (Math.atan2(width,circumference)*180)/Math.PI;
}
function renderWorkshopToolVisibility(){
  const list=$('workshopToolsList');
  const diameterCard=$('workshopToolDiameter');
  const gripCard=$('workshopToolGrip');
  const activeTool=workshopToolsState.activeTool;
  if(list)list.hidden=activeTool!=='list';
  if(diameterCard)diameterCard.hidden=activeTool!=='diameter';
  if(gripCard)gripCard.hidden=activeTool!=='grip';
}
function renderDiameterCircumferenceTool(){
  const diameterInput=$('workshopDcDiameter');
  const circumferenceInput=$('workshopDcCircumference');
  if(!diameterInput || !circumferenceInput)return;

  const state=workshopToolsState.diameter;
  state.unit=normalizeWorkshopUnit(state.unit);
  state.imperialDisplay=normalizeWorkshopImperialDisplay(state.imperialDisplay);
  state.diameterMm=Math.max(0.01,numberOrZero(state.diameterMm));

  const circumferenceMm=state.diameterMm*Math.PI;

  if(document.activeElement!==diameterInput){
    diameterInput.value=workshopMeasurementInputText(state.diameterMm,state.unit,state.imperialDisplay);
  }
  if(document.activeElement!==circumferenceInput){
    circumferenceInput.value=workshopMeasurementInputText(circumferenceMm,state.unit,state.imperialDisplay);
  }

  const diameterPlaceholder=workshopMeasurementInputText(28,state.unit,state.imperialDisplay);
  const circumferencePlaceholder=workshopMeasurementInputText(28*Math.PI,state.unit,state.imperialDisplay);
  diameterInput.placeholder=diameterPlaceholder;
  circumferenceInput.placeholder=circumferencePlaceholder;

  const primaryLabel=$('workshopDcPrimaryLabel');
  const primaryValue=$('workshopDcPrimaryValue');
  const showingDiameter=state.lastEdited==='circumference';
  if(primaryLabel)primaryLabel.textContent=showingDiameter?'Diameter':'Circumference';
  if(primaryValue){
    primaryValue.textContent=showingDiameter
      ? formatWorkshopMeasurementValue(state.diameterMm,state.unit,state.imperialDisplay,{decimalsMetric:2,decimalsImperial:3,maxImperialDenominator:32})
      : formatWorkshopMeasurementValue(circumferenceMm,state.unit,state.imperialDisplay,{decimalsMetric:2,decimalsImperial:3,maxImperialDenominator:32});
  }

  const metricLine=$('workshopDcMetricLine');
  const imperialDecimalLine=$('workshopDcImperialDecimalLine');
  const imperialFractionalLine=$('workshopDcImperialFractionalLine');
  if(metricLine){
    metricLine.textContent=`D ${formatDecimal(state.diameterMm,2)} mm • C ${formatDecimal(circumferenceMm,2)} mm`;
  }
  if(imperialDecimalLine){
    imperialDecimalLine.textContent=`D ${formatDecimal(mmToInches(state.diameterMm),3)} in • C ${formatDecimal(mmToInches(circumferenceMm),3)} in`;
  }
  if(imperialFractionalLine){
    imperialFractionalLine.textContent=`D ${formatImperialFractionInches(mmToInches(state.diameterMm),32)} in • C ${formatImperialFractionInches(mmToInches(circumferenceMm),32)} in`;
  }

  const imperialDisplayRow=$('workshopDcImperialDisplay');
  if(imperialDisplayRow)imperialDisplayRow.hidden=state.unit!=='imperial';

  const panel=$('workshopToolsPanel');
  if(!panel)return;
  panel.querySelectorAll('[data-dc-unit]').forEach((button)=>{
    const selected=button.getAttribute('data-dc-unit')===state.unit;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  panel.querySelectorAll('[data-dc-imperial-display]').forEach((button)=>{
    const selected=button.getAttribute('data-dc-imperial-display')===state.imperialDisplay;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
}
function buildGripCutTemplateSvg(template){
  const width=760;
  const height=980;
  const originX=Math.round(width*0.32);
  const originY=170;
  const bottomY=890;
  const topY=90;
  const leftLimit=64;
  const rightLimit=width-64;
  const angleRadius=54;
  const labels=[];
  const lines=[];
  const arcs=[];

  const vertical=`<line x1="${originX}" y1="${topY}" x2="${originX}" y2="${bottomY}" class="vertical"/><text x="${originX+16}" y="${topY+22}" class="label">Vertical Reference</text>`;
  const linesToRender=[];
  const startAngle=Math.max(0,numberOrZero(template.startCutAngle));
  linesToRender.push({name:'Start Cut Angle',angle:startAngle,side:1});
  if(template.profile==='tapered'){
    const finishAngle=Math.max(0,numberOrZero(template.finishCutAngle));
    linesToRender.push({name:'Finish Cut Angle',angle:finishAngle,side:-1});
  }

  const polar=(cx,cy,r,deg)=>{
    const radians=(Math.PI/180)*deg;
    return {
      x:cx+(r*Math.cos(radians)),
      y:cy+(r*Math.sin(radians)),
    };
  };

  const arcPath=(cx,cy,r,startDeg,endDeg)=>{
    const start=polar(cx,cy,r,startDeg);
    const end=polar(cx,cy,r,endDeg);
    const largeArc=Math.abs(endDeg-startDeg)>180?1:0;
    const sweep=endDeg>startDeg?1:0;
    return `M ${formatDecimal(start.x,2)} ${formatDecimal(start.y,2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${formatDecimal(end.x,2)} ${formatDecimal(end.y,2)}`;
  };

  linesToRender.forEach((item)=>{
    const safeAngle=Math.max(0,Math.min(85,item.angle));
    const deltaY=bottomY-originY;
    const deltaX=Math.tan((safeAngle*Math.PI)/180)*deltaY;
    const endX=Math.max(leftLimit,Math.min(rightLimit,originX+(item.side*deltaX)));
    const lineClass=item.name==='Finish Cut Angle'?'cut-line cut-line--secondary':'cut-line';
    lines.push(`<line x1="${originX}" y1="${originY}" x2="${formatDecimal(endX,2)}" y2="${bottomY}" class="${lineClass}"/>`);

    const labelX=originX+(endX-originX)*0.62+(item.side>0?14:-14);
    const labelY=originY+(bottomY-originY)*0.62;
    labels.push(`<text x="${formatDecimal(labelX,2)}" y="${formatDecimal(labelY,2)}" class="label" text-anchor="${item.side>0?'start':'end'}">${escapeHtml(item.name)}: ${escapeHtml(formatDecimal(item.angle,1))}&deg; off square</text>`);

    const cutDeg=90-(item.side*safeAngle);
    const startDeg=item.side>0?cutDeg:90;
    const endDeg=item.side>0?90:cutDeg;
    arcs.push(`<path d="${arcPath(originX,originY,angleRadius,startDeg,endDeg)}" class="angle-arc"/>`);
  });

  const angleNote=template.profile==='tapered'
    ?`${formatDecimal(template.startCutAngle,1)} and ${formatDecimal(template.finishCutAngle,1)} deg off square`
    :`${formatDecimal(template.startCutAngle,1)} deg off square`;

  return `
    <svg class="template-visual" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cut angle guide">
      <rect x="1" y="1" width="${width-2}" height="${height-2}" class="frame"/>
      ${vertical}
      <circle cx="${originX}" cy="${originY}" r="2.8" class="origin"/>
      ${lines.join('')}
      ${arcs.join('')}
      ${labels.join('')}
      <text x="${originX+16}" y="${originY-16}" class="label label--muted">Angle shown from the vertical square reference</text>
      <text x="${originX+16}" y="${originY+28}" class="label label--muted">Cut lines originate at the same starting point</text>
      <text x="${Math.round(width*0.5)}" y="${height-36}" text-anchor="middle" class="label">Template reference: ${escapeHtml(angleNote)}</text>
    </svg>
  `;
}
function openGripCutTemplatePrint(){
  if(!gripCutTemplateSnapshot){
    alert('Run Grip Covering values first to generate a cut template.');
    return;
  }
  const template=gripCutTemplateSnapshot;
  const summaryRows=[
    {label:'Grip Type',value:template.gripTypeLabel},
    {label:'Start Cut Angle',value:`${formatDecimal(template.startCutAngle,1)} deg off square`},
  ];
  if(template.profile==='tapered'){
    summaryRows.push({label:'Finish Cut Angle',value:`${formatDecimal(template.finishCutAngle,1)} deg off square`});
    summaryRows.push({label:'Average Cut Angle',value:`${formatDecimal(template.averageCutAngle,1)} deg off square`});
  }
  summaryRows.push({label:'Covering Width / Cord Diameter',value:template.coveringWidthText});
  summaryRows.push({label:'Grip Length',value:template.gripLengthText});
  summaryRows.push({label:'Date',value:template.dateText});

  const summaryHtml=summaryRows.map((row)=>`<div class="summary-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join('');
  const visualSvg=buildGripCutTemplateSvg(template);
  const printWindow=window.open('','_blank','noopener,noreferrer,width=980,height=1240');
  if(!printWindow || !printWindow.document){
    alert('Unable to open print view. Please allow pop-ups for this site and try again.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Grip Covering Cut Template</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    html,body{ margin:0; padding:0; background:#fff; color:#000; font-family: "Segoe UI", Arial, sans-serif; }
    body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet{ width:100%; max-width:180mm; margin:0 auto; display:grid; gap:10mm; }
    h1{ margin:0; font-size:20pt; letter-spacing:.02em; }
    .meta{ font-size:10pt; color:#111; }
    .summary{ border:1.4pt solid #000; padding:4mm; display:grid; gap:2.6mm; }
    .summary-row{ display:flex; justify-content:space-between; align-items:baseline; gap:8mm; border-bottom:.5pt solid #bbb; padding-bottom:1.6mm; }
    .summary-row:last-child{ border-bottom:none; padding-bottom:0; }
    .summary-row span{ font-size:8.5pt; text-transform:uppercase; letter-spacing:.08em; }
    .summary-row strong{ font-size:10.5pt; text-align:right; }
    .visual{ border:1.6pt solid #000; padding:4mm; }
    .template-visual{ width:100%; height:auto; display:block; }
    .frame{ fill:none; stroke:#ddd; stroke-width:1; }
    .vertical{ stroke:#000; stroke-width:4; }
    .cut-line{ stroke:#000; stroke-width:3; }
    .cut-line--secondary{ stroke:#000; stroke-width:2.5; stroke-dasharray:10 7; }
    .angle-arc{ fill:none; stroke:#000; stroke-width:1.8; }
    .origin{ fill:#000; }
    .label{ font-size:20px; fill:#000; }
    .label--muted{ font-size:16px; }
  </style>
</head>
<body>
  <main class="sheet">
    <header>
      <h1>Grip Covering Cut Template</h1>
      <div class="meta">Use this guide to mark first cuts on leather, cork tape, cord, or similar covering materials.</div>
    </header>
    <section class="summary" aria-label="Measurement summary">
      ${summaryHtml}
    </section>
    <section class="visual" aria-label="Visual angle guide">
      ${visualSvg}
    </section>
  </main>
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.onafterprint=()=>{
    printWindow.close();
  };
  window.setTimeout(()=>{
    try{
      printWindow.print();
    }catch(_error){
      // Allow manual printing if automatic print is blocked.
    }
  },120);
}
function renderGripCoveringTool(){
  const panel=$('workshopToolsPanel');
  if(!panel)return;
  const state=workshopToolsState.grip;
  state.unit=normalizeWorkshopUnit(state.unit);
  state.imperialDisplay=normalizeWorkshopImperialDisplay(state.imperialDisplay);
  state.profile=state.profile==='tapered'?'tapered':'straight';
  state.straightDiameterMm=Math.max(0.01,numberOrZero(state.straightDiameterMm));
  state.startDiameterMm=Math.max(0.01,numberOrZero(state.startDiameterMm));
  state.endDiameterMm=Math.max(0.01,numberOrZero(state.endDiameterMm));
  state.lengthMm=Math.max(0,numberOrZero(state.lengthMm));
  state.coverWidthMm=Math.max(0.01,numberOrZero(state.coverWidthMm));
  state.allowancePercent=Math.max(0,numberOrZero(state.allowancePercent));

  const straightFields=$('workshopGripStraightFields');
  const taperedFields=$('workshopGripTaperedFields');
  if(straightFields)straightFields.hidden=state.profile!=='straight';
  if(taperedFields)taperedFields.hidden=state.profile!=='tapered';

  const imperialDisplayRow=$('workshopGripImperialDisplay');
  if(imperialDisplayRow)imperialDisplayRow.hidden=state.unit!=='imperial';

  const gripDiameterInput=$('workshopGripDiameter');
  const startDiameterInput=$('workshopGripStartDiameter');
  const endDiameterInput=$('workshopGripEndDiameter');
  const gripLengthInput=$('workshopGripLength');
  const coverWidthInput=$('workshopGripCoverWidth');
  const allowanceInput=$('workshopGripAllowance');

  if(gripDiameterInput && document.activeElement!==gripDiameterInput){
    gripDiameterInput.value=workshopMeasurementInputText(state.straightDiameterMm,state.unit,state.imperialDisplay);
  }
  if(startDiameterInput && document.activeElement!==startDiameterInput){
    startDiameterInput.value=workshopMeasurementInputText(state.startDiameterMm,state.unit,state.imperialDisplay);
  }
  if(endDiameterInput && document.activeElement!==endDiameterInput){
    endDiameterInput.value=workshopMeasurementInputText(state.endDiameterMm,state.unit,state.imperialDisplay);
  }
  if(gripLengthInput && document.activeElement!==gripLengthInput){
    gripLengthInput.value=workshopMeasurementInputText(state.lengthMm,state.unit,state.imperialDisplay);
  }
  if(coverWidthInput && document.activeElement!==coverWidthInput){
    coverWidthInput.value=workshopMeasurementInputText(state.coverWidthMm,state.unit,state.imperialDisplay);
  }
  if(allowanceInput && document.activeElement!==allowanceInput){
    allowanceInput.value=formatDecimal(state.allowancePercent,1);
  }

  if(gripDiameterInput)gripDiameterInput.placeholder=workshopMeasurementInputText(28,state.unit,state.imperialDisplay);
  if(startDiameterInput)startDiameterInput.placeholder=workshopMeasurementInputText(30,state.unit,state.imperialDisplay);
  if(endDiameterInput)endDiameterInput.placeholder=workshopMeasurementInputText(24,state.unit,state.imperialDisplay);
  if(gripLengthInput)gripLengthInput.placeholder=workshopMeasurementInputText(280,state.unit,state.imperialDisplay);
  if(coverWidthInput)coverWidthInput.placeholder=workshopMeasurementInputText(25,state.unit,state.imperialDisplay);
  if(allowanceInput)allowanceInput.placeholder='5';

  const revolutions=state.coverWidthMm>0?(state.lengthMm/state.coverWidthMm):0;
  let spiralWrapLengthMm=0;
  let startCutAngle=0;
  let finishCutAngle=0;
  let showFinishCutAngle=false;

  if(state.profile==='tapered'){
    spiralWrapLengthMm=taperSpiralWrapLengthMm(state.startDiameterMm,state.endDiameterMm,state.lengthMm,state.coverWidthMm);
    const startCircumferenceMm=Math.PI*state.startDiameterMm;
    const endCircumferenceMm=Math.PI*state.endDiameterMm;
    startCutAngle=gripCutAngleDegrees(startCircumferenceMm,state.coverWidthMm);
    finishCutAngle=gripCutAngleDegrees(endCircumferenceMm,state.coverWidthMm);
    showFinishCutAngle=true;
  }else{
    const circumferenceMm=Math.PI*state.straightDiameterMm;
    const perRevolutionLength=Math.sqrt((circumferenceMm*circumferenceMm)+(state.coverWidthMm*state.coverWidthMm));
    spiralWrapLengthMm=Math.max(0,revolutions*perRevolutionLength);
    startCutAngle=gripCutAngleDegrees(circumferenceMm,state.coverWidthMm);
    finishCutAngle=startCutAngle;
  }

  const requiredMm=spiralWrapLengthMm*(1+(state.allowancePercent/100));
  const averageCutAngle=(startCutAngle+finishCutAngle)/2;

  const requiredEl=$('workshopGripMaterialRequired');
  const revolutionsEl=$('workshopGripRevolutions');
  const spiralEl=$('workshopGripSpiralLength');
  const startCutEl=$('workshopGripStartCutAngle');
  const finishCutEl=$('workshopGripFinishCutAngle');
  const finishCutRow=$('workshopGripFinishCutAngleRow');
  const averageCutEl=$('workshopGripAverageCutAngle');
  const averageCutRow=$('workshopGripAverageCutAngleRow');
  const printActions=$('workshopGripPrintActions');

  if(requiredEl)requiredEl.textContent=formatWorkshopMeasurementValue(requiredMm,state.unit,state.imperialDisplay,{decimalsMetric:1,decimalsImperial:3,maxImperialDenominator:32});
  if(revolutionsEl)revolutionsEl.textContent=formatDecimal(revolutions,2);
  if(spiralEl)spiralEl.textContent=formatWorkshopMeasurementValue(spiralWrapLengthMm,state.unit,state.imperialDisplay,{decimalsMetric:1,decimalsImperial:3,maxImperialDenominator:32});
  if(startCutEl)startCutEl.textContent=`${formatDecimal(startCutAngle,1)} deg`;

  if(finishCutRow)finishCutRow.hidden=!showFinishCutAngle;
  if(finishCutEl)finishCutEl.textContent=`${formatDecimal(finishCutAngle,1)} deg`;

  if(averageCutRow)averageCutRow.hidden=!showFinishCutAngle;
  if(averageCutEl)averageCutEl.textContent=`${formatDecimal(averageCutAngle,1)} deg`;

  const hasAngleOutput=state.lengthMm>0 && state.coverWidthMm>0 && Number.isFinite(startCutAngle) && startCutAngle>0;
  if(printActions)printActions.hidden=!hasAngleOutput;
  gripCutTemplateSnapshot=hasAngleOutput?{
    profile:state.profile,
    gripTypeLabel:state.profile==='tapered'?'Tapered Grip':'Straight Grip',
    startCutAngle,
    finishCutAngle,
    averageCutAngle,
    coveringWidthText:formatWorkshopMeasurementValue(state.coverWidthMm,state.unit,state.imperialDisplay,{decimalsMetric:2,decimalsImperial:3,maxImperialDenominator:32}),
    gripLengthText:formatWorkshopMeasurementValue(state.lengthMm,state.unit,state.imperialDisplay,{decimalsMetric:2,decimalsImperial:3,maxImperialDenominator:32}),
    dateText:formatDateDisplay(new Date(),{includeTime:false}),
  }:null;

  panel.querySelectorAll('[data-grip-unit]').forEach((button)=>{
    const selected=button.getAttribute('data-grip-unit')===state.unit;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  panel.querySelectorAll('[data-grip-imperial-display]').forEach((button)=>{
    const selected=button.getAttribute('data-grip-imperial-display')===state.imperialDisplay;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  panel.querySelectorAll('[data-grip-profile]').forEach((button)=>{
    const selected=button.getAttribute('data-grip-profile')===state.profile;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
}
function renderWorkshopCalculator(){
  renderWorkshopToolVisibility();
  renderDiameterCircumferenceTool();
  renderGripCoveringTool();
}
function bindWorkshopCalculatorControls(){
  const panel=$('workshopToolsPanel');
  if(!panel || panel.getAttribute('data-workshop-calculator-bound')==='true')return;
  panel.setAttribute('data-workshop-calculator-bound','true');

  panel.querySelectorAll('[data-workshop-tool-open]').forEach((button)=>{
    button.addEventListener('click',()=>{
      const nextTool=button.getAttribute('data-workshop-tool-open');
      workshopToolsState.activeTool=nextTool==='grip'?'grip':'diameter';
      renderWorkshopCalculator();
    });
  });
  panel.querySelectorAll('[data-workshop-tool-back]').forEach((button)=>{
    button.addEventListener('click',()=>{
      workshopToolsState.activeTool='list';
      renderWorkshopCalculator();
    });
  });

  const diameterInput=$('workshopDcDiameter');
  const circumferenceInput=$('workshopDcCircumference');
  if(diameterInput){
    const onDiameterChange=()=>{
      const state=workshopToolsState.diameter;
      state.diameterMm=parseWorkshopMeasurementMm(diameterInput.value,state.unit,state.diameterMm,false);
      state.lastEdited='diameter';
      renderWorkshopCalculator();
    };
    diameterInput.addEventListener('input',onDiameterChange);
    diameterInput.addEventListener('change',onDiameterChange);
  }
  if(circumferenceInput){
    const onCircumferenceChange=()=>{
      const state=workshopToolsState.diameter;
      const circumferenceMm=parseWorkshopMeasurementMm(circumferenceInput.value,state.unit,state.diameterMm*Math.PI,false);
      state.diameterMm=Math.max(0.01,circumferenceMm/Math.PI);
      state.lastEdited='circumference';
      renderWorkshopCalculator();
    };
    circumferenceInput.addEventListener('input',onCircumferenceChange);
    circumferenceInput.addEventListener('change',onCircumferenceChange);
  }
  panel.querySelectorAll('[data-dc-unit]').forEach((button)=>{
    button.addEventListener('click',()=>{
      workshopToolsState.diameter.unit=normalizeWorkshopUnit(button.getAttribute('data-dc-unit'));
      renderWorkshopCalculator();
    });
  });
  panel.querySelectorAll('[data-dc-imperial-display]').forEach((button)=>{
    button.addEventListener('click',()=>{
      workshopToolsState.diameter.imperialDisplay=normalizeWorkshopImperialDisplay(button.getAttribute('data-dc-imperial-display'));
      renderWorkshopCalculator();
    });
  });

  const gripDiameterInput=$('workshopGripDiameter');
  const gripStartDiameterInput=$('workshopGripStartDiameter');
  const gripEndDiameterInput=$('workshopGripEndDiameter');
  const gripLengthInput=$('workshopGripLength');
  const coverWidthInput=$('workshopGripCoverWidth');
  const allowanceInput=$('workshopGripAllowance');

  if(gripDiameterInput){
    const onChange=()=>{
      const state=workshopToolsState.grip;
      state.straightDiameterMm=parseWorkshopMeasurementMm(gripDiameterInput.value,state.unit,state.straightDiameterMm,false);
      renderWorkshopCalculator();
    };
    gripDiameterInput.addEventListener('input',onChange);
    gripDiameterInput.addEventListener('change',onChange);
  }
  if(gripStartDiameterInput){
    const onChange=()=>{
      const state=workshopToolsState.grip;
      state.startDiameterMm=parseWorkshopMeasurementMm(gripStartDiameterInput.value,state.unit,state.startDiameterMm,false);
      renderWorkshopCalculator();
    };
    gripStartDiameterInput.addEventListener('input',onChange);
    gripStartDiameterInput.addEventListener('change',onChange);
  }
  if(gripEndDiameterInput){
    const onChange=()=>{
      const state=workshopToolsState.grip;
      state.endDiameterMm=parseWorkshopMeasurementMm(gripEndDiameterInput.value,state.unit,state.endDiameterMm,false);
      renderWorkshopCalculator();
    };
    gripEndDiameterInput.addEventListener('input',onChange);
    gripEndDiameterInput.addEventListener('change',onChange);
  }
  if(gripLengthInput){
    const onChange=()=>{
      const state=workshopToolsState.grip;
      state.lengthMm=parseWorkshopMeasurementMm(gripLengthInput.value,state.unit,state.lengthMm,true);
      renderWorkshopCalculator();
    };
    gripLengthInput.addEventListener('input',onChange);
    gripLengthInput.addEventListener('change',onChange);
  }
  if(coverWidthInput){
    const onChange=()=>{
      const state=workshopToolsState.grip;
      state.coverWidthMm=parseWorkshopMeasurementMm(coverWidthInput.value,state.unit,state.coverWidthMm,false);
      renderWorkshopCalculator();
    };
    coverWidthInput.addEventListener('input',onChange);
    coverWidthInput.addEventListener('change',onChange);
  }
  if(allowanceInput){
    const onChange=()=>{
      const state=workshopToolsState.grip;
      const next=Number(allowanceInput.value);
      if(Number.isFinite(next) && next>=0){
        state.allowancePercent=next;
      }
      renderWorkshopCalculator();
    };
    allowanceInput.addEventListener('input',onChange);
    allowanceInput.addEventListener('change',onChange);
  }

  panel.querySelectorAll('[data-grip-unit]').forEach((button)=>{
    button.addEventListener('click',()=>{
      workshopToolsState.grip.unit=normalizeWorkshopUnit(button.getAttribute('data-grip-unit'));
      renderWorkshopCalculator();
    });
  });
  panel.querySelectorAll('[data-grip-imperial-display]').forEach((button)=>{
    button.addEventListener('click',()=>{
      workshopToolsState.grip.imperialDisplay=normalizeWorkshopImperialDisplay(button.getAttribute('data-grip-imperial-display'));
      renderWorkshopCalculator();
    });
  });
  panel.querySelectorAll('[data-grip-profile]').forEach((button)=>{
    button.addEventListener('click',()=>{
      workshopToolsState.grip.profile=button.getAttribute('data-grip-profile')==='tapered'?'tapered':'straight';
      renderWorkshopCalculator();
    });
  });

  const gripPrintTemplateBtn=$('workshopGripPrintTemplateBtn');
  if(gripPrintTemplateBtn){
    gripPrintTemplateBtn.addEventListener('click',()=>{
      openGripCutTemplatePrint();
    });
  }

  renderWorkshopCalculator();
}
function formatDateDisplay(value,options){
  if(!value)return 'Unknown';
  const settings=options&&typeof options==='object'?options:{};
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return 'Unknown';
  const day=String(date.getDate()).padStart(2,'0');
  const month=String(date.getMonth()+1).padStart(2,'0');
  const year=String(date.getFullYear());
  let dateText='';
  const format=normalizeDateFormat(settings.dateFormat||activeDateFormat());
  if(format==='mm/dd/yyyy')dateText=`${month}/${day}/${year}`;
  else if(format==='yyyy-mm-dd')dateText=`${year}-${month}-${day}`;
  else dateText=`${day}/${month}/${year}`;
  if(!settings.includeTime)return dateText;
  const hours=String(date.getHours()).padStart(2,'0');
  const minutes=String(date.getMinutes()).padStart(2,'0');
  return `${dateText} ${hours}:${minutes}`;
}
function isBlankCategory(category){
  return normalizeNameKey(category)==='blank';
}
function blankComponentFromBlank(blank,currentRow){
  const row=currentRow&&typeof currentRow==='object'?currentRow:{};
  const normalized=blank?normalizeBlank(blank):null;
  const blankName=normalized?blankDisplayName(normalized):String(row.description||row.blankName||'').trim();
  return {
    ...row,
    category:'Blank',
    description:blankName,
    supplier:normalized?String(normalized.maker||''):String(row.supplier||row.blankMaker||''),
    cost:normalized?numberOrZero(normalized.cost):numberOrZero(row.cost),
    blankId:normalized?String(normalized.id||''):String(row.blankId||''),
    blankName:blankName,
    blankMaker:normalized?String(normalized.maker||''):String(row.blankMaker||''),
    blankSeries:normalized?String(normalized.series||''):String(row.blankSeries||''),
    blankLength:normalized?String(normalized.length||''):String(row.blankLength||''),
    blankPower:normalized?String(normalized.power||''):String(row.blankPower||''),
    blankAction:normalized?String(normalized.action||''):String(row.blankAction||''),
    blankPieces:normalized?String(normalized.pieces||''):String(row.blankPieces||''),
    blankSku:normalized?String(normalized.sku||''):String(row.blankSku||''),
    blankNotes:normalized?String(normalized.notes||''):String(row.blankNotes||''),
  };
}
function firstBlankComponentIndex(components){
  return (components||[]).findIndex((item)=>isBlankCategory(item&&item.category));
}
function shouldMergeDuplicateComponentCategory(category){
  const key=normalizeNameKey(category);
  return !!(key && key!=='other');
}
function mergeComponentRecord(primary,secondary){
  const next={...(primary&&typeof primary==='object'?primary:{}),...(secondary&&typeof secondary==='object'?secondary:{})};
  const primaryDescription=specificationValue(primary&&primary.description);
  const secondaryDescription=specificationValue(secondary&&secondary.description);
  next.description=primaryDescription||secondaryDescription;
  const primarySupplier=specificationValue(primary&&primary.supplier);
  const secondarySupplier=specificationValue(secondary&&secondary.supplier);
  next.supplier=primarySupplier||secondarySupplier;
  const primaryLabel=specificationValue(primary&&primary.customerLabel);
  const secondaryLabel=specificationValue(secondary&&secondary.customerLabel);
  next.customerLabel=primaryLabel||secondaryLabel;
  const primaryCost=numberOrZero(primary&&primary.cost);
  const secondaryCost=numberOrZero(secondary&&secondary.cost);
  next.cost=primaryCost>0?primaryCost:secondaryCost;
  ['blankId','blankName','blankMaker','blankSeries','blankLength','blankPower','blankAction','blankPieces','blankSku','blankNotes'].forEach((key)=>{
    const first=specificationValue(primary&&primary[key]);
    const second=specificationValue(secondary&&secondary[key]);
    next[key]=first||second;
  });
  return normalizeComponent(next);
}
function normalizeUniqueComponents(components,options){
  const settings=options&&typeof options==='object'?options:{};
  const keepDraftRows=settings.keepDraftRows===true;
  const rows=Array.isArray(components)?components:[];
  const next=[];
  const dedupeIndexByCategory=new Map();
  rows.forEach((row)=>{
    const normalized=normalizeComponent(row);
    if(!componentRowHasMeaningfulData(normalized)){
      if(keepDraftRows)next.push(normalized);
      return;
    }
    const categoryKey=normalizeNameKey(normalized.category);
    if(shouldMergeDuplicateComponentCategory(categoryKey) && dedupeIndexByCategory.has(categoryKey)){
      const existingIndex=dedupeIndexByCategory.get(categoryKey);
      next[existingIndex]=mergeComponentRecord(next[existingIndex],normalized);
      return;
    }
    const nextIndex=next.length;
    next.push(normalized);
    if(shouldMergeDuplicateComponentCategory(categoryKey)){
      dedupeIndexByCategory.set(categoryKey,nextIndex);
    }
  });
  if(keepDraftRows && !next.some((item)=>!componentRowHasMeaningfulData(item))){
    next.push(normalizeComponent({category:'',description:'',supplier:'',cost:0}));
  }
  return next.length?next:[normalizeComponent({category:'',description:'',supplier:'',cost:0})];
}
function enforceSingleSourceComponents(){
  const before=Array.isArray(quote.components)?quote.components:[];
  const after=normalizeUniqueComponents(before,{keepDraftRows:true});
  const changed=JSON.stringify(before)!==JSON.stringify(after);
  if(!changed)return false;
  quote.components=after;
  if(expandedComponentRowIndex>=quote.components.length){
    expandedComponentRowIndex=quote.components.length-1;
  }
  syncQuoteBlankFromComponents();
  return true;
}
function componentRowsForTotals(){
  return normalizeUniqueComponents(quote.components,{keepDraftRows:false}).filter((item)=>componentRowHasMeaningfulData(item));
}
function clearQuoteBlankSelection(){
  quote.blankId='';
  quote.blankName='';
  quote.blankMaker='';
  quote.blankSeries='';
  quote.blankLength='';
  quote.blankPower='';
  quote.blankAction='';
  quote.blankPieces='';
  quote.blankCost=0;
  quote.blankSku='';
  quote.blankNotes='';
}
function applyBlankComponentToQuote(row){
  if(!row || !isBlankCategory(row.category))return;
  quote.blankId=String(row.blankId||quote.blankId||'');
  quote.blankName=String(row.blankName||row.description||quote.blankName||'').trim();
  quote.blankMaker=String(row.blankMaker||row.supplier||quote.blankMaker||'').trim();
  quote.blankSeries=String(row.blankSeries||quote.blankSeries||'').trim();
  quote.blankLength=String(row.blankLength||quote.blankLength||'').trim();
  quote.blankPower=String(row.blankPower||quote.blankPower||'').trim();
  quote.blankAction=String(row.blankAction||quote.blankAction||'').trim();
  quote.blankPieces=String(row.blankPieces||quote.blankPieces||'').trim();
  quote.blankCost=numberOrZero(row.cost);
  quote.blankSku=String(row.blankSku||quote.blankSku||'').trim();
  quote.blankNotes=String(row.blankNotes||quote.blankNotes||'').trim();
}
function syncQuoteBlankFromComponents(){
  const blankIndex=firstBlankComponentIndex(quote.components);
  if(blankIndex<0){
    clearQuoteBlankSelection();
    return;
  }
  applyBlankComponentToQuote(quote.components[blankIndex]);
}
function migrateBlankWorkflow(merged){
  if(!Array.isArray(merged.components))merged.components=[];
  let blankIndex=firstBlankComponentIndex(merged.components);
  if(blankIndex<0 && (specificationValue(merged.blankId)||specificationValue(merged.blankName)||numberOrZero(merged.blankCost)>0)){
    const row=blankComponentFromBlank(null,{
      category:'Blank',
      description:String(merged.blankName||'').trim(),
      supplier:String(merged.blankMaker||'').trim(),
      cost:numberOrZero(merged.blankCost),
      blankId:String(merged.blankId||''),
      blankName:String(merged.blankName||''),
      blankMaker:String(merged.blankMaker||''),
      blankSeries:String(merged.blankSeries||''),
      blankLength:String(merged.blankLength||''),
      blankPower:String(merged.blankPower||''),
      blankAction:String(merged.blankAction||''),
      blankPieces:String(merged.blankPieces||''),
      blankSku:String(merged.blankSku||''),
      blankNotes:String(merged.blankNotes||''),
    });
    merged.components.unshift(row);
    blankIndex=0;
  }
  if(blankIndex>=0){
    const primaryBlank=blankComponentFromBlank(null,merged.components[blankIndex]);
    merged.components[blankIndex]=primaryBlank;
    merged.components=merged.components.map((row,index)=>{
      if(index===blankIndex)return row;
      if(!isBlankCategory(row&&row.category))return row;
      return {...row,category:'Other',description:(specificationValue(row.description)||'Legacy blank item')};
    });
    merged.blankId=String(primaryBlank.blankId||merged.blankId||'');
    merged.blankName=String(primaryBlank.blankName||primaryBlank.description||merged.blankName||'').trim();
    merged.blankMaker=String(primaryBlank.blankMaker||primaryBlank.supplier||merged.blankMaker||'').trim();
    merged.blankSeries=String(primaryBlank.blankSeries||merged.blankSeries||'').trim();
    merged.blankLength=String(primaryBlank.blankLength||merged.blankLength||'').trim();
    merged.blankPower=String(primaryBlank.blankPower||merged.blankPower||'').trim();
    merged.blankAction=String(primaryBlank.blankAction||merged.blankAction||'').trim();
    merged.blankPieces=String(primaryBlank.blankPieces||merged.blankPieces||'').trim();
    merged.blankCost=numberOrZero(primaryBlank.cost);
    merged.blankSku=String(primaryBlank.blankSku||merged.blankSku||'').trim();
    merged.blankNotes=String(primaryBlank.blankNotes||merged.blankNotes||'').trim();
  }
  if(!merged.components.length){
    merged.components=[{category:'',description:'',supplier:'',cost:0}];
  }
}
function normalizePricingDriver(value){
  const next=String(value||'').trim().toLowerCase();
  if(next==='final' || next==='profit' || next==='markup')return next;
  return 'markup';
}
function syncQuotePricing(driver){
  enforceSingleSourceComponents();
  syncQuoteBlankFromComponents();
  const componentsTotal=componentRowsForTotals().reduce((sum,item)=>sum+numberOrZero(item&&item.cost),0);
  const internalCost=componentsTotal+(numberOrZero(quote.labourRate)*numberOrZero(quote.labourHours));
  const activeDriver=normalizePricingDriver(driver||quote.pricingDriver);
  let finalCustomerPrice=numberOrZero(quote.finalCustomerPrice);
  let targetProfit=numberOrZero(quote.targetProfit);
  let markupPercent=numberOrZero(quote.markupPercent);

  if(activeDriver==='final'){
    finalCustomerPrice=Math.max(0,finalCustomerPrice);
    targetProfit=Math.max(0,finalCustomerPrice-internalCost);
    markupPercent=internalCost>0?(targetProfit/internalCost)*100:0;
  }else if(activeDriver==='profit'){
    targetProfit=Math.max(0,targetProfit);
    finalCustomerPrice=internalCost+targetProfit;
    markupPercent=internalCost>0?(targetProfit/internalCost)*100:0;
  }else{
    markupPercent=Math.max(0,markupPercent);
    targetProfit=internalCost*(markupPercent/100);
    finalCustomerPrice=internalCost+targetProfit;
  }

  quote.pricingDriver=activeDriver;
  quote.markupPercent=roundMoney(markupPercent);
  quote.targetProfit=roundMoney(targetProfit);
  quote.finalCustomerPrice=roundMoney(finalCustomerPrice);
  quote.marginPercent=quote.markupPercent;
}
function homeRodElement(){return $('homeLivingRod');}
function homeRodLedPositions(){
  return[
    {x:8,y:53.5},
    {x:18,y:53.5},
    {x:30,y:53.5},
    {x:43,y:53.5},
    {x:57,y:53.5},
    {x:71,y:53.5},
    {x:84,y:53.5},
    {x:94,y:53.5}
  ];
}
function homeRodClearSequenceTimer(){
  if(homeRodState.sequenceTimer){
    clearTimeout(homeRodState.sequenceTimer);
    homeRodState.sequenceTimer=null;
  }
}
function homePrefersReducedMotion(){
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function homeRodApplyRestingState(){
  const rod=homeRodEnsureLeds();
  if(!rod)return;
  const leds=rod.querySelectorAll('.home-living-rod__led');
  leds.forEach((led)=>{
    led.classList.remove('is-lit');
    led.classList.add('is-resting');
  });
  homeRodState.litCount=homeRodState.ledCount;
  homeRodState.ready=homeRodState.ledCount>0;
}
function homeRodEnsureLeds(){
  const rod=homeRodElement();
  if(!rod)return null;
  let leds=rod.querySelectorAll('.home-living-rod__led');
  if(leds.length===homeRodState.ledCount)return rod;
  const ledMarkup=homeRodLedPositions().map((position)=>`<span class="home-living-rod__led" style="--x:${position.x}%;--y:${position.y}%;"></span>`).join('');
  rod.querySelector('.home-living-rod__leds').innerHTML=ledMarkup;
  leds=rod.querySelectorAll('.home-living-rod__led');
  homeRodState.ledCount=leds.length;
  return rod;
}
function homeBuildCount(){
  return Array.isArray(savedBuildEntries())?savedBuildEntries().length:0;
}
function homeRodSetLitCount(count){
  const rod=homeRodEnsureLeds();
  if(!rod)return;
  const nextCount=Math.max(0,Math.min(homeRodState.ledCount,Math.round(Number(count)||0)));
  homeRodState.litCount=nextCount;
  const leds=rod.querySelectorAll('.home-living-rod__led');
  const threshold=Math.max(0,homeRodState.ledCount-nextCount);
  leds.forEach((led,index)=>{
    const isLit=index>=threshold;
    led.classList.toggle('is-lit',isLit);
    led.classList.toggle('is-resting',false);
  });
  homeRodState.ready=nextCount>0;
}
function homeRodAnimateToLitCount(target){
  const nextCount=Math.max(0,Math.min(homeRodState.ledCount,Math.round(Number(target)||0)));
  if(nextCount===homeRodState.litCount)return;
  const step=nextCount>homeRodState.litCount?1:-1;
  const tick=()=>{
    homeRodSetLitCount(homeRodState.litCount+step);
    if(homeRodState.litCount!==nextCount){
      setTimeout(tick,260);
    }
  };
  tick();
}
function homeRodRunStartupSequence(){
  const rod=homeRodEnsureLeds();
  if(!rod)return;
  homeRodClearSequenceTimer();
  homeRodState.sequenceAnimating=true;
  homeRodState.sequenceCompleted=false;
  if(homePrefersReducedMotion()){
    homeRodApplyRestingState();
    homeRodState.sequenceAnimating=false;
    homeRodState.sequenceCompleted=true;
    return;
  }
  const total=Math.max(1,homeRodState.ledCount);
  homeRodSetLitCount(0);
  const startupDelay=360;
  const staggerDelay=120;
  const settleDelay=220;
  let nextLit=1;
  const tick=()=>{
    homeRodSetLitCount(nextLit);
    if(nextLit<total){
      nextLit+=1;
      homeRodState.sequenceTimer=setTimeout(tick,staggerDelay);
      return;
    }
    homeRodState.sequenceTimer=setTimeout(()=>{
      homeRodApplyRestingState();
      homeRodState.sequenceAnimating=false;
      homeRodState.sequenceCompleted=true;
      homeRodState.sequenceTimer=null;
    },settleDelay);
  };
  homeRodState.sequenceTimer=setTimeout(tick,startupDelay);
}
function homeRodRefreshFromState(triggerSequence){
  const rod=homeRodEnsureLeds();
  const shouldTriggerSequence=triggerSequence===true;
  if(rod && !rod.classList.contains('is-ready')){
    requestAnimationFrame(()=>rod.classList.add('is-ready'));
  }
  if(homeRodState.homeFirstOpen || shouldTriggerSequence){
    homeRodState.homeFirstOpen=false;
    homeRodRunStartupSequence();
  }else{
    if(homeRodState.sequenceCompleted){
      homeRodApplyRestingState();
    }
  }
}
function newQuoteTemplate(){
  return{
    buildNumber:'',
    customerName:'',company:'',phone:'',email:'',buildName:'',notes:'',
    addressLine1:'',addressLine2:'',suburbLocality:'',cityTown:'',regionState:'',postcode:'',country:'New Zealand',
    blankId:'',blankName:'',blankMaker:'',blankSeries:'',blankLength:'',blankPower:'',blankAction:'',blankPieces:'',blankCost:0,blankSku:'',blankNotes:'',
    buildSpecifications:{reelSeatPosition:'',rearGripLength:'',gripBelowReelSeatLength:'',foreGripLength:'',hookKeeperPosition:'',builderNotes:''},
    components:[{category:'',description:'',supplier:'',cost:0}],
    labourRate:0,labourHours:0,markupPercent:0,targetProfit:0,finalCustomerPrice:0,pricingDriver:'markup',taxEnabled:activeTaxEnabled(),includeGst:activeTaxEnabled(),quoteMode:'internal',gstRate:activeTaxRate(),quoteStatus:'draft'
  };
}
function normalizeAddressText(value){
  return String(value||'').trim();
}
function normalizeBuildSpecifications(inputSpecs){
  const normalized={};
  BUILD_SPEC_FIELDS.forEach((field)=>{
    normalized[field.key]=String(inputSpecs&&inputSpecs[field.key]||'');
  });
  if(!normalized.hookKeeperPosition){
    normalized.hookKeeperPosition=String(inputSpecs&&inputSpecs.hookKeeperNotes||inputSpecs&&inputSpecs.hookKeeperPosition||'');
  }
  if(!normalized.gripBelowReelSeatLength){
    normalized.gripBelowReelSeatLength=String(inputSpecs&&inputSpecs.lowerReelSeatGripLength||'');
  }
  return normalized;
}
function specificationValue(value){
  return String(value||'').trim();
}
function appendSpecRow(rows,label,value){
  const text=specificationValue(value);
  if(!text)return;
  rows.push({label,value:text});
}
function normalizeCustomerMeasurements(text){
  return String(text||'').replace(/(\d+(?:\.\d+)?)\s*cm\b/gi,(_,value)=>{
    const mm=Number(value)*10;
    const rendered=Number.isInteger(mm)?String(mm):String(mm.toFixed(1)).replace(/\.0$/,'');
    return `${rendered} mm`;
  });
}
function isLikelyJunkCustomerText(text){
  const normalized=normalizeNameKey(text);
  if(!normalized)return true;
  const blockedExact=new Set(['n a','na','n/a','none','tbd','test','testing','asdf','qwerty','lorem ipsum','junk','xxx']);
  if(blockedExact.has(normalized))return true;
  if(/^(?:[-_\s]+|[?!.]{2,})$/.test(text))return true;
  if(/(^|\b)(asdf|qwerty|lorem|ipsum|junk|foobar|xxx)(\b|$)/i.test(text))return true;
  if(/(^|\b)test(?:ing)?(\b|$)/i.test(text))return true;
  const letterCount=(text.match(/[a-z]/gi)||[]).length;
  const digitCount=(text.match(/[0-9]/g)||[]).length;
  if(!letterCount && digitCount)return true;
  return false;
}
function customerSafeText(value){
  const text=normalizeCustomerMeasurements(specificationValue(value));
  if(!text)return '';
  if(isLikelyJunkCustomerText(text))return '';
  return text;
}
function customerRequestText(value){
  const text=normalizeCustomerMeasurements(specificationValue(value));
  if(!text)return '';
  if(isLikelyJunkCustomerText(text))return '';
  return text;
}
function appendCustomerSpecRow(rows,label,value){
  const safe=customerSafeText(value);
  if(!safe)return;
  rows.push({label,value:safe});
}
function firstComponentByCategory(categoryMatchers){
  if(!Array.isArray(quote.components))return null;
  const matchers=Array.isArray(categoryMatchers)?categoryMatchers:[categoryMatchers];
  return quote.components.find((item)=>{
    const category=normalizeNameKey(item&&item.category);
    if(!category)return false;
    return matchers.some((matcher)=>category.includes(normalizeNameKey(matcher)));
  })||null;
}
function componentDescriptionOrCategory(component){
  if(!component)return '';
  return specificationValue(component.description)||specificationValue(component.category);
}
function firstSavedComponentByCategory(categoryMatchers){
  if(!Array.isArray(quote.components))return null;
  const matchers=Array.isArray(categoryMatchers)?categoryMatchers:[categoryMatchers];
  return quote.components.find((item)=>{
    if(!componentRowHasMeaningfulData(item))return false;
    if(pendingComponentDraftRows.has(item))return false;
    const category=normalizeNameKey(item&&item.category);
    if(!category)return false;
    return matchers.some((matcher)=>category.includes(normalizeNameKey(matcher)));
  })||null;
}
function blankSpecificationSummary(){
  const blankComponent=firstSavedComponentByCategory('blank')||firstComponentByCategory('blank');
  const details=[];
  const blankName=specificationValue(blankComponent&&blankComponent.blankName)||specificationValue(blankComponent&&blankComponent.description)||specificationValue(quote.blankName);
  const blankLength=specificationValue(blankComponent&&blankComponent.blankLength)||specificationValue(quote.blankLength);
  const blankPower=specificationValue(blankComponent&&blankComponent.blankPower)||specificationValue(quote.blankPower);
  const blankAction=specificationValue(blankComponent&&blankComponent.blankAction)||specificationValue(quote.blankAction);
  if(blankName)details.push(blankName);
  if(blankLength)details.push(blankLength);
  if(blankPower)details.push(blankPower);
  if(blankAction)details.push(blankAction);
  return details.join(' • ');
}
function customerPreviewLines(){
  const lines=[];
  const identity=[quote.customerName,quote.phone,quote.email].map(specificationValue).filter(Boolean).join(' • ');
  if(identity)lines.push(identity);

  const addressLine1=specificationValue(quote.addressLine1);
  const addressLine2=specificationValue(quote.addressLine2);
  const suburbLocality=specificationValue(quote.suburbLocality);
  const cityTown=specificationValue(quote.cityTown);
  const regionState=specificationValue(quote.regionState);
  const postcode=specificationValue(quote.postcode);
  const country=specificationValue(quote.country);

  if(addressLine1)lines.push(addressLine1);
  if(addressLine2)lines.push(addressLine2);
  if(suburbLocality)lines.push(suburbLocality);

  const localityLine=[cityTown,regionState,postcode].filter(Boolean).join(', ');
  if(localityLine)lines.push(localityLine);
  if(country)lines.push(country);

  return lines;
}
function customerCardSecondarySummary(){
  const company=specificationValue(quote.company);
  const locality=specificationValue(quote.cityTown)||specificationValue(quote.suburbLocality);
  const phone=specificationValue(quote.phone);
  const email=specificationValue(quote.email);
  return [company,locality,phone,email].filter(Boolean).slice(0,3).join(' • ');
}
function customerGripConfigurationValue(){
  const specs=quote&&quote.buildSpecifications&&typeof quote.buildSpecifications==='object'
    ? quote.buildSpecifications
    : {};
  const direct=specificationValue(
    specs.gripConfiguration
    || specs.gripSetup
    || specs.gripStyle
    || specs.handleConfiguration
    || ''
  );
  if(direct)return direct;
  const parts=[];
  const rear=specificationValue(specs.rearGripLength);
  const lower=specificationValue(specs.gripBelowReelSeatLength);
  const fore=specificationValue(specs.foreGripLength);
  if(rear)parts.push(`Rear ${rear}`);
  if(lower)parts.push(`Lower ${lower}`);
  if(fore)parts.push(`Fore ${fore}`);
  return parts.join(' • ');
}
function customerGripFeatureSummary(){
  const specs=quote&&quote.buildSpecifications&&typeof quote.buildSpecifications==='object'
    ? quote.buildSpecifications
    : {};
  const direct=customerSafeText(
    specs.gripConfiguration
    || specs.gripSetup
    || specs.gripStyle
    || specs.handleConfiguration
    || ''
  );
  if(direct)return `Custom grip layout: ${direct}`;
  const rear=customerSafeText(specs.rearGripLength);
  const lower=customerSafeText(specs.gripBelowReelSeatLength);
  const fore=customerSafeText(specs.foreGripLength);
  if(rear && fore && !lower)return `Split-grip layout with a rear grip of ${rear} and a fore grip of ${fore}.`;
  if(rear && lower && fore)return `Full handle layout with rear grip ${rear}, lower grip ${lower}, and fore grip ${fore}.`;
  if(rear)return `Rear grip layout set at ${rear}.`;
  if(lower)return `Lower grip section set at ${lower}.`;
  if(fore)return `Fore grip section set at ${fore}.`;
  return '';
}
function looksLikeComponentCode(value){
  const text=specificationValue(value);
  if(!text)return false;
  return /^[A-Z0-9][A-Z0-9\-_/]{3,}$/.test(text.trim());
}
function humanizeComponentCode(value){
  const raw=specificationValue(value);
  if(!raw)return '';
  const normalized=raw.replace(/[\-_\/]+/g,' ').replace(/\s+/g,' ').trim();
  const tokens=normalized.split(' ').map((token)=>{
    if(/[0-9]/.test(token))return token.toUpperCase();
    if(token.length<=3)return token.toUpperCase();
    return token.charAt(0).toUpperCase()+token.slice(1).toLowerCase();
  });
  return tokens.join(' ');
}
function savedComponentDisplayLabel(item){
  const customerLabel=specificationValue(item&&item.customerLabel);
  if(customerLabel)return customerLabel;
  const category=specificationValue(item&&item.category);
  const description=specificationValue(item&&item.description);
  if(description && normalizeNameKey(description)!==normalizeNameKey(category)){
    return description;
  }
  return category||description;
}
function friendlyComponentCategoryName(category){
  const key=normalizeNameKey(category);
  if(!key)return '';
  if(key.includes('guide'))return 'Guide system';
  if(key.includes('reel seat'))return 'Reel seat';
  if(key.includes('buttcap') || key.includes('butt cap'))return 'Butt cap trim';
  if(key.includes('tip top'))return 'Tip top guide';
  if(key.includes('thread'))return 'Thread and finish';
  if(key.includes('decal'))return 'Custom decals';
  if(key.includes('winding'))return 'Winding checks';
  if(key.includes('hook keeper'))return 'Hook keeper';
  if(key.includes('grip'))return 'Grip assembly';
  if(key.includes('blank'))return 'Rod blank';
  return specificationValue(category);
}
function customerComponentFeatureValue(component,defaultLabel){
  if(!component)return '';
  const display=customerSafeText(savedComponentDisplayLabel(component));
  if(display)return display;
  return customerSafeText(defaultLabel);
}
function isFinishCategoryKey(categoryKey){
  const key=normalizeNameKey(categoryKey);
  return key.includes('thread') || key.includes('decal') || key.includes('winding');
}
function finishDescriptionText(description){
  return customerSafeText(description);
}
function customerFinishDetailsSummary(){
  if(!Array.isArray(quote.components))return '';
  const details=[];
  quote.components.forEach((item)=>{
    if(!componentRowHasMeaningfulData(item))return;
    if(pendingComponentDraftRows.has(item))return;
    const categoryKey=normalizeNameKey(item&&item.category);
    if(!isFinishCategoryKey(categoryKey))return;
    const detail=finishDescriptionText(item&&item.description) || customerSafeText(specificationValue(item&&item.category));
    if(!detail)return;
    const normalized=normalizeNameKey(detail);
    if(details.some((value)=>normalizeNameKey(value)===normalized))return;
    details.push(detail);
  });
  return details.join(' • ');
}
function customerRodIdentity(){
  const buildName=customerSafeText(quote.buildName);
  const blankSummary=customerSafeText(blankSpecificationSummary());
  if(buildName)return buildName;
  if(blankSummary)return blankSummary;
  return 'Custom Rod Build Confirmation';
}
function customerSpecificationRows(){
  const rows=[];
  appendCustomerSpecRow(rows,'Blank',blankSpecificationSummary());
  appendCustomerSpecRow(rows,'Grip Feature',customerGripFeatureSummary());
  BUILD_SPEC_FIELDS.filter((field)=>field.visibility==='customer' && !['rearGripLength','gripBelowReelSeatLength','foreGripLength'].includes(field.key)).forEach((field)=>{
    appendCustomerSpecRow(rows,field.label,quote.buildSpecifications&&quote.buildSpecifications[field.key]);
  });
  appendCustomerSpecRow(rows,'Customer Requests',customerRequestText(quote.notes));
  return rows;
}
function customerIncludedPartLabel(item){
  const supplier=specificationValue(item&&item.supplier);
  const rawLabel=specificationValue(savedComponentDisplayLabel(item));
  let label=rawLabel;
  if(supplier && label){
    const supplierKey=normalizeNameKey(supplier);
    const labelKey=normalizeNameKey(label);
    if(labelKey===supplierKey){
      label='';
    }else if(labelKey.startsWith(`${supplierKey} `)){
      label=label.slice(supplier.length).trim();
    }
  }
  if(!label){
    label=friendlyComponentCategoryName(item&&item.category);
  }
  return customerSafeText(label);
}
function customerComponentExcludedFromCopy(item){
  const categoryKey=normalizeNameKey(item&&item.category);
  if(!categoryKey)return false;
  return [
    'freight','shipping','courier','postage',
    'labour','labor','markup','margin','profit',
    'gst','tax','discount','admin','overhead','internal'
  ].some((blocked)=>categoryKey.includes(blocked));
}
function customerIncludedParts(){
  if(!Array.isArray(quote.components))return[];
  const parts=[];
  quote.components.forEach((item)=>{
    if(!componentRowHasMeaningfulData(item))return;
    if(pendingComponentDraftRows.has(item))return;
    if(customerComponentExcludedFromCopy(item))return;
    const label=customerIncludedPartLabel(item);
    if(!normalizeNameKey(label))return;
    parts.push(label);
  });
  return parts;
}
function customerIncludedPartsMarkup(parts){
  const safeParts=(Array.isArray(parts)?parts:[]).map(customerSafeText).filter((value)=>specificationValue(value));
  const listItems=safeParts.length
    ? safeParts.map((value)=>`<li>${escapeHtml(value)}</li>`).join('')
    : '<li>Your final component list will be confirmed before build start.</li>';
  return `<div class="quote-preview-parts"><span>What your rod includes</span><ul>${listItems}</ul></div>`;
}
function workshopSpecificationRows(){
  const rows=customerSpecificationRows();
  BUILD_SPEC_FIELDS.filter((field)=>field.visibility==='workshop').forEach((field)=>{
    appendSpecRow(rows,field.label,quote.buildSpecifications&&quote.buildSpecifications[field.key]);
  });
  appendSpecRow(rows,'Internal Product Codes',quote.blankSku);
  appendSpecRow(rows,'Blank Library Notes',quote.blankNotes);
  return rows;
}
function buildSpecificationViews(){
  return{customer:customerSpecificationRows(),workshop:workshopSpecificationRows()};
}
function specificationRowsMarkup(rows){
  const safeRows=Array.isArray(rows)?rows:[];
  if(!safeRows.length){
    return '<div><span>Build Specifications</span><strong>No customer-facing specifications entered yet.</strong></div>';
  }
  return safeRows.map((row)=>`<div><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join('');
}
function normalizeComponent(component){
  const rawCategory=(component&&typeof component.category==='string')?component.category:(component&&typeof component.name==='string')?component.name:'';
  const categoryKey=normalizeNameKey(rawCategory);
  const category=categoryKey==='tip'?'Tip Top':categoryKey==='thread'?'Thread & Finish':rawCategory;
  return{
    category,
    description:(component&&typeof component.description==='string')?component.description:'',
    customerLabel:(component&&typeof component.customerLabel==='string')?component.customerLabel:'',
    supplier:(component&&typeof component.supplier==='string')?component.supplier:'',
    unit:(component&&typeof component.unit==='string')?component.unit:'',
    quantity:Number.isFinite(Number(component&&component.quantity))?Number(component.quantity):undefined,
    unitCost:numberOrZero(component&&component.unitCost),
    unitPrice:numberOrZero(component&&component.unitPrice),
    notes:(component&&typeof component.notes==='string')?component.notes:'',
    specifications:(component&&typeof component.specifications==='string')?component.specifications:'',
    cost:numberOrZero(component&&component.cost),
  };
}
function normalizeQuoteMode(value){
  return String(value||'').toLowerCase()==='customer'?'customer':'internal';
}
function normalizeQuoteStatus(value){
  const normalized=String(value||'').trim().toLowerCase();
  return QUOTE_STATUS_VALUES.includes(normalized)?normalized:'draft';
}
function isAcceptedQuoteStatus(value){
  return normalizeQuoteStatus(value)==='accepted';
}
function hasSavedBuildRecordForCurrentQuote(){
  const buildNumber=specificationValue(quote&&quote.buildNumber);
  if(!buildNumber)return false;
  const records=Store.get('klabs-workshop-builds',[]);
  if(!Array.isArray(records))return false;
  const buildKey=normalizeNameKey(buildNumber);
  return records.some((record)=>normalizeNameKey(record&&record.buildNumber)===buildKey);
}
function normalizeQuote(inputQuote){
  const base=newQuoteTemplate();
  const merged={...base,...(inputQuote||{})};
  const components=Array.isArray(inputQuote&&inputQuote.components)&&inputQuote.components.length?inputQuote.components:[{category:'',description:'',supplier:'',cost:0}];
  merged.components=normalizeUniqueComponents(components,{keepDraftRows:true});
  const hasStoredTaxEnabled=(inputQuote&&typeof inputQuote.taxEnabled==='boolean');
  merged.taxEnabled=hasStoredTaxEnabled?inputQuote.taxEnabled:((inputQuote&&typeof inputQuote==='object')?true:activeTaxEnabled());
  merged.includeGst=(inputQuote&&typeof inputQuote.includeGst==='boolean')?inputQuote.includeGst:activeTaxEnabled();
  merged.quoteMode=normalizeQuoteMode(inputQuote&&inputQuote.quoteMode);
  merged.quoteStatus=normalizeQuoteStatus((inputQuote&&inputQuote.quoteStatus)||(inputQuote&&inputQuote.status));
  const incomingGstRate=(inputQuote&&inputQuote.gstRate);
  merged.gstRate=(incomingGstRate===0 || Number.isFinite(Number(incomingGstRate)))?Math.max(0,numberOrZero(incomingGstRate)):activeTaxRate();
  merged.markupPercent=numberOrZero((inputQuote&&inputQuote.markupPercent)!==undefined?(inputQuote&&inputQuote.markupPercent):(inputQuote&&inputQuote.marginPercent));
  merged.targetProfit=numberOrZero(inputQuote&&inputQuote.targetProfit);
  merged.finalCustomerPrice=numberOrZero(inputQuote&&inputQuote.finalCustomerPrice);
  merged.pricingDriver=normalizePricingDriver(inputQuote&&inputQuote.pricingDriver);
  merged.blankId=String(inputQuote&&inputQuote.blankId||'');
  merged.blankMaker=String(inputQuote&&inputQuote.blankMaker||'');
  merged.blankSeries=String(inputQuote&&inputQuote.blankSeries||'');
  merged.blankPieces=String(inputQuote&&inputQuote.blankPieces||'');
  merged.blankSku=String(inputQuote&&inputQuote.blankSku||'');
  merged.blankNotes=String(inputQuote&&inputQuote.blankNotes||'');
  const legacyAddress=normalizeAddressText(inputQuote&&((inputQuote.addressLine1)||inputQuote.customerAddress||inputQuote.address));
  merged.addressLine1=normalizeAddressText(inputQuote&&inputQuote.addressLine1)||legacyAddress;
  merged.addressLine2=normalizeAddressText(inputQuote&&inputQuote.addressLine2);
  merged.suburbLocality=normalizeAddressText(inputQuote&&inputQuote.suburbLocality);
  merged.cityTown=normalizeAddressText(inputQuote&&inputQuote.cityTown);
  merged.regionState=normalizeAddressText(inputQuote&&inputQuote.regionState);
  merged.postcode=normalizeAddressText(inputQuote&&inputQuote.postcode);
  merged.country=normalizeAddressText(inputQuote&&inputQuote.country)||'New Zealand';
  merged.buildSpecifications=normalizeBuildSpecifications(inputQuote&&inputQuote.buildSpecifications);
  migrateBlankWorkflow(merged);
  const hasFinal=(inputQuote&&inputQuote.finalCustomerPrice)!==undefined;
  const hasProfit=(inputQuote&&inputQuote.targetProfit)!==undefined;
  const internalBuildCost=merged.components.reduce((sum,item)=>sum+numberOrZero(item&&item.cost),0)+(numberOrZero(merged.labourRate)*numberOrZero(merged.labourHours));
  if(!hasFinal && !hasProfit){
    merged.targetProfit=internalBuildCost*(merged.markupPercent/100);
    merged.finalCustomerPrice=internalBuildCost+merged.targetProfit;
    merged.pricingDriver='markup';
  }
  merged.marginPercent=merged.markupPercent;
  return merged;
}
function canConvertToBuild(){
  return isAcceptedQuoteStatus(quote.quoteStatus) && !hasUnsavedQuoteChanges;
}
function updateQuoteActionPriority(){
  const saveQuoteBtn=$('saveQuoteBtn');
  const statusEl=$('workshopBuildActionsStatus');
  if(saveQuoteBtn){
    saveQuoteBtn.classList.add('primary-action');
    saveQuoteBtn.classList.remove('ghost-action');
    const saveDisabled=!hasUnsavedQuoteChanges;
    saveQuoteBtn.disabled=saveDisabled;
    saveQuoteBtn.setAttribute('aria-disabled',String(saveDisabled));
  }
  if(statusEl){
    const hasFlash=workshopStatusFlashText && Date.now()<workshopStatusFlashUntil;
    if(hasFlash){
      statusEl.textContent=workshopStatusFlashText;
      statusEl.classList.toggle('is-pending',workshopStatusFlashPending);
    }else{
      statusEl.textContent=hasUnsavedQuoteChanges?'Unsaved changes':'All changes saved';
      statusEl.classList.toggle('is-pending',hasUnsavedQuoteChanges);
    }
  }
  const customerCopyEnabled=hasSavedBuildRecordForCurrentQuote();
  const customerCopyActions=$('customerCopyActions');
  if(customerCopyActions){
    customerCopyActions.hidden=!customerCopyEnabled;
    if(!customerCopyEnabled)customerCopyActions.removeAttribute('open');
  }
  ['viewCustomerCopyBtn','emailQuoteBtn','printQuoteBtn'].forEach((id)=>{
    const button=$(id);
    if(!button)return;
    button.disabled=!customerCopyEnabled;
    button.setAttribute('aria-disabled',String(!customerCopyEnabled));
  });
}
function markQuoteDirty(){
  hasUnsavedQuoteChanges=true;
  updateQuoteActionPriority();
}
function markQuoteSaved(){
  hasUnsavedQuoteChanges=false;
  updateQuoteActionPriority();
}
function flashWorkshopStatus(message,options){
  const settings={pending:false,duration:1700,...(options||{})};
  workshopStatusFlashText=String(message||'').trim();
  workshopStatusFlashPending=!!settings.pending;
  workshopStatusFlashUntil=Date.now()+Math.max(350,numberOrZero(settings.duration));
  if(workshopStatusFlashTimer){
    clearTimeout(workshopStatusFlashTimer);
    workshopStatusFlashTimer=null;
  }
  updateQuoteActionPriority();
  workshopStatusFlashTimer=window.setTimeout(()=>{
    workshopStatusFlashText='';
    workshopStatusFlashPending=false;
    workshopStatusFlashUntil=0;
    workshopStatusFlashTimer=null;
    updateQuoteActionPriority();
  },Math.max(350,numberOrZero(settings.duration))+40);
}
function setActiveSavedBuildRef(source,index,record){
  const numericIndex=Number(index);
  activeSavedBuildRef={
    source:String(source||'build'),
    index:Number.isInteger(numericIndex)?numericIndex:-1,
    buildNumber:specificationValue(record&&record.buildNumber),
    savedAt:specificationValue(record&&record.savedAt),
  };
}
function clearActiveSavedBuildRef(){
  activeSavedBuildRef=null;
}
function findCurrentSavedBuildTarget(){
  const records=savedBuildRecords();
  if(!records.length)return null;
  if(activeSavedBuildRef && activeSavedBuildRef.source==='build'){
    const indexedRecord=records[activeSavedBuildRef.index];
    if(indexedRecord
      && normalizeNameKey(indexedRecord&&indexedRecord.buildNumber)===normalizeNameKey(activeSavedBuildRef.buildNumber)
      && specificationValue(indexedRecord&&indexedRecord.savedAt)===specificationValue(activeSavedBuildRef.savedAt)){
      return {index:activeSavedBuildRef.index,record:indexedRecord};
    }
    const byRef=records.findIndex((record)=>{
      return normalizeNameKey(record&&record.buildNumber)===normalizeNameKey(activeSavedBuildRef.buildNumber)
        && specificationValue(record&&record.savedAt)===specificationValue(activeSavedBuildRef.savedAt);
    });
    if(byRef>=0)return {index:byRef,record:records[byRef]};
  }
  const currentBuildNumber=normalizeNameKey(quote&&quote.buildNumber);
  if(!currentBuildNumber)return null;
  const byBuildNumber=records.findIndex((record)=>normalizeNameKey(record&&record.buildNumber)===currentBuildNumber);
  if(byBuildNumber<0)return null;
  return {index:byBuildNumber,record:records[byBuildNumber]};
}
function finalizeDeletedCurrentBuild(){
  clearActiveSavedBuildRef();
  quote=normalizeQuote(newQuoteTemplate());
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  collapseWorkshopSections();
  renderBuilds();
  renderCustomerFinder();
  renderCustomerBrowser();
  goScreen('buildsScreen');
}
function requestDeleteCurrentBuild(){
  const target=findCurrentSavedBuildTarget();
  if(!target){
    openConfirmDialog({
      title:'Delete Build',
      message:'This build is not saved yet, so there is nothing to delete.',
      actions:[{id:'ok',label:'OK',kind:'primary'}]
    },()=>{});
    return;
  }
  const displayName=specificationValue(target.record&&target.record.buildName)||'this build';
  openConfirmDialog({
    title:'Delete Build',
    message:`Delete ${displayName}? This will permanently delete this saved build only.`,
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:'Delete Build',kind:'danger'}]
  },(action)=>{
    if(action!=='delete')return;
    const records=savedBuildRecords();
    if(target.index<0 || target.index>=records.length)return;
    records.splice(target.index,1);
    Store.set('klabs-workshop-builds',records);
    finalizeDeletedCurrentBuild();
  });
}
function quoteHasMeaningfulDraft(currentQuote){
  const candidate=normalizeQuote(currentQuote||{});
  const baseline=normalizeQuote(newQuoteTemplate());
  const hasIdentity=[candidate.customerName,candidate.phone,candidate.email,candidate.buildName,candidate.notes,candidate.addressLine1,candidate.addressLine2,candidate.suburbLocality,candidate.cityTown,candidate.regionState,candidate.postcode]
    .some((value)=>!!specificationValue(value));
  const hasCountryOverride=specificationValue(candidate.country)!==specificationValue(baseline.country);
  const hasBuildSpecs=Object.keys(candidate.buildSpecifications||{}).some((key)=>!!specificationValue(candidate.buildSpecifications&&candidate.buildSpecifications[key]));
  const hasBlank=!!(specificationValue(candidate.blankId)||specificationValue(candidate.blankName));
  const hasCosts=numberOrZero(candidate.blankCost)>0 || numberOrZero(candidate.labourRate)>0 || numberOrZero(candidate.labourHours)>0 || numberOrZero(candidate.markupPercent||candidate.marginPercent)>0 || numberOrZero(candidate.targetProfit)>0 || numberOrZero(candidate.finalCustomerPrice)>0;
  const hasComponentData=Array.isArray(candidate.components) && candidate.components.some((item)=>{
    return !!(specificationValue(item&&item.category)||specificationValue(item&&item.description)||specificationValue(item&&item.supplier)||numberOrZero(item&&item.cost)>0);
  });
  return hasIdentity || hasCountryOverride || hasBuildSpecs || hasBlank || hasCosts || hasComponentData;
}
function ensureCustomerSectionExpanded(){
  const body=$('workshopCustomerBody');
  if(!body)return;
  const section=body.closest('.quote-section--collapsible');
  if(!section)return;
  section.classList.remove('quote-section--collapsed');
  const trigger=section.querySelector('[data-collapsible-trigger]');
  if(trigger){trigger.setAttribute('aria-expanded','true');}
}
function setWorkshopSectionCollapsed(sectionId,collapsed){
  const body=$(sectionId);
  if(!body)return;
  const section=body.closest('.quote-section--collapsible');
  if(!section)return;
  section.classList.toggle('quote-section--collapsed',!!collapsed);
  const trigger=section.querySelector('[data-collapsible-trigger]');
  if(trigger){trigger.setAttribute('aria-expanded',String(!collapsed));}
}
function collapseWorkshopSections(){
  WORKSHOP_COLLAPSIBLE_SECTION_IDS.forEach((id)=>{
    setWorkshopSectionCollapsed(id,true);
  });
}
function workshopHasCustomerData(){
  return !!(
    specificationValue(quote&&quote.customerName)
    || specificationValue(quote&&quote.phone)
    || specificationValue(quote&&quote.email)
  );
}
function workshopHasPricingData(){
  return numberOrZero(quote&&quote.finalCustomerPrice)>0
    || numberOrZero(quote&&quote.targetProfit)>0
    || numberOrZero(quote&&quote.markupPercent)>0
    || numberOrZero(quote&&quote.labourRate)>0
    || numberOrZero(quote&&quote.labourHours)>0;
}
function nextWorkshopSectionId(){
  if(!workshopHasCustomerData())return 'workshopCustomerBody';
  if(componentRowsForTotals().length===0)return 'workshopBuildSpecsBody';
  if(!workshopHasPricingData())return 'workshopQuoteSummaryBody';
  return 'workshopBuildActionsBody';
}
function focusWorkshopSection(bodyId,options){
  const targetId=WORKSHOP_COLLAPSIBLE_SECTION_IDS.includes(bodyId)?bodyId:nextWorkshopSectionId();
  WORKSHOP_COLLAPSIBLE_SECTION_IDS.forEach((id)=>{
    setWorkshopSectionCollapsed(id,id!==targetId);
  });
  const settings={scroll:true,...(options||{})};
  if(settings.scroll===false)return;
  const section=$(targetId);
  const panel=section&&section.closest('.quote-section--collapsible');
  if(panel){
    window.setTimeout(()=>scrollWorkshopSectionIntoView(panel),36);
  }
}
function beginFreshQuote(options){
  const settings={navigate:true,...(options||{})};
  clearActiveSavedBuildRef();
  quote=normalizeQuote(newQuoteTemplate());
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  collapseWorkshopSections();
  focusWorkshopSection('workshopCustomerBody',{scroll:false});
  if(settings.navigate){goScreen('workshopScreen');}
}
function applyCustomerFieldsToQuoteFromRecord(targetQuote,record){
  const source=record&&typeof record==='object'?record:{};
  const target=targetQuote&&typeof targetQuote==='object'?targetQuote:{};
  target.customerName=String(source.customerName||'').trim();
  target.company=String(source.company||source.companyName||source.businessName||'').trim();
  target.phone=String(source.phone||'').trim();
  target.email=String(source.email||'').trim();
  target.addressLine1=String(source.addressLine1||'').trim();
  target.addressLine2=String(source.addressLine2||'').trim();
  target.suburbLocality=String(source.suburbLocality||'').trim();
  target.cityTown=String(source.cityTown||'').trim();
  target.regionState=String(source.regionState||'').trim();
  target.postcode=String(source.postcode||'').trim();
  target.country=String(source.country||target.country||'').trim();
  return target;
}
function startFreshQuoteForCustomer(record,options){
  const settings={...(options||{})};
  const next=newQuoteTemplate();
  applyCustomerFieldsToQuoteFromRecord(next,record);
  clearActiveSavedBuildRef();
  quote=normalizeQuote(next);
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  collapseWorkshopSections();
  preserveWorkshopQuoteOnEntry=true;
  goScreen('workshopScreen');
  const targetSection=settings.expandCustomerSection?'workshopCustomerBody':nextWorkshopSectionId();
  window.setTimeout(()=>focusWorkshopSection(targetSection),36);
}
function runNewBuildStartAction(startAction){
  if(typeof startAction!=='function')return;
  if(hasUnsavedQuoteChanges && quoteHasMeaningfulDraft(quote)){
    openConfirmDialog({
      title:'Start New Build',
      message:'Discard the current unsaved build and start a new build?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'start',label:'Start New Build',kind:'primary'}]
    },(action)=>{
      if(action==='start')startAction();
    });
    return;
  }
  startAction();
}
function startNewQuoteFlow(){
  if(hasUnsavedQuoteChanges && quoteHasMeaningfulDraft(quote)){
    openConfirmDialog({
      title:'Start New Build',
      message:'Discard the current unsaved build and start a new build?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'start',label:'Start New Build',kind:'primary'}]
    },(action)=>{
      if(action==='start'){beginFreshQuote();}
    });
    return;
  }
  beginFreshQuote();
}
function startNewBuildFlow(){
  startNewQuoteFlow();
}
function lockModalLayer(openerEl){
  if(modalLockDepth===0){
    modalLockedScrollY=Math.round(window.scrollY||window.pageYOffset||0);
    document.body.style.position='fixed';
    document.body.style.top=`-${modalLockedScrollY}px`;
    document.body.style.left='0';
    document.body.style.right='0';
    document.body.style.width='100%';
    document.body.classList.add('component-sheet-open');
    if(openerEl && typeof openerEl.focus==='function'){
      modalReturnFocusEl=openerEl;
    }else if(document.activeElement && typeof document.activeElement.focus==='function'){
      modalReturnFocusEl=document.activeElement;
    }
  }
  modalLockDepth+=1;
}
function unlockModalLayer(options){
  const settings={restoreFocus:true,...(options||{})};
  const applyUnlock=(focusTarget)=>{
    const lockedScrollY=modalLockedScrollY;
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('left');
    document.body.style.removeProperty('right');
    document.body.style.removeProperty('width');
    document.body.classList.remove('component-sheet-open');
    window.scrollTo(0,Math.max(0,lockedScrollY));
    modalLockedScrollY=0;
    if(settings.restoreFocus && focusTarget && focusTarget.isConnected!==false && typeof focusTarget.focus==='function'){
      try{
        focusTarget.focus({preventScroll:true});
      }catch{
        focusTarget.focus();
      }
    }
    modalReturnFocusEl=null;
  };
  if(modalLockDepth<=0){
    applyUnlock(null);
    return;
  }
  modalLockDepth-=1;
  if(modalLockDepth>0)return;
  const focusTarget=modalReturnFocusEl;
  applyUnlock(focusTarget);
}
function isChoicePickerVisible(){
  const sheet=$('choicePickerSheet');
  return !!(sheet && !sheet.hidden);
}
function clearChoicePickerViewportStyles(){
  const sheet=$('choicePickerSheet');
  if(!sheet)return;
  sheet.style.removeProperty('--component-sheet-vv-left');
  sheet.style.removeProperty('--component-sheet-vv-width');
  sheet.style.removeProperty('--component-sheet-vv-top');
  sheet.style.removeProperty('--component-sheet-vv-height');
  sheet.style.removeProperty('--component-sheet-panel-max-width');
  sheet.style.removeProperty('--component-sheet-panel-max-height');
  sheet.style.removeProperty('--component-sheet-align-items');
}
function scheduleChoicePickerViewportSync(delayMs){
  if(choicePickerViewportRaf){
    cancelAnimationFrame(choicePickerViewportRaf);
    choicePickerViewportRaf=0;
  }
  const runSync=()=>{syncChoicePickerViewport();};
  if(numberOrZero(delayMs)>0){
    window.setTimeout(()=>{
      choicePickerViewportRaf=requestAnimationFrame(runSync);
    },delayMs);
    return;
  }
  choicePickerViewportRaf=requestAnimationFrame(runSync);
}
function syncChoicePickerViewport(){
  const sheet=$('choicePickerSheet');
  if(!sheet || sheet.hidden){
    clearChoicePickerViewportStyles();
    return;
  }
  const searchInput=$('choicePickerSearch');
  const vv=window.visualViewport||null;
  const viewportWidth=Math.max(0,Math.round(vv?vv.width:window.innerWidth));
  const viewportLeft=Math.max(0,Math.round(vv?vv.offsetLeft:0));
  const viewportHeight=Math.max(0,Math.round(vv?vv.height:window.innerHeight));
  const viewportTop=Math.max(0,Math.round(vv?vv.offsetTop:0));
  const searchFocused=!!(searchInput && document.activeElement===searchInput);
  const keyboardDelta=Math.max(0,Math.round(window.innerHeight-viewportHeight-viewportTop));
  const keyboardActive=searchFocused && keyboardDelta>0;
  choicePickerViewportState.keyboardActive=keyboardActive;

  const sideGap=12;
  const panelMaxWidth=Math.min(620,Math.max(240,viewportWidth-(sideGap*2)));
  const panelMaxHeight=Math.max(160,viewportHeight-32);
  sheet.style.setProperty('--component-sheet-vv-left',`${viewportLeft}px`);
  sheet.style.setProperty('--component-sheet-vv-width',`${viewportWidth}px`);
  sheet.style.setProperty('--component-sheet-vv-top',`${viewportTop}px`);
  sheet.style.setProperty('--component-sheet-vv-height',`${viewportHeight}px`);
  sheet.style.setProperty('--component-sheet-panel-max-width',`${panelMaxWidth}px`);
  sheet.style.setProperty('--component-sheet-panel-max-height',`${panelMaxHeight}px`);
  sheet.style.setProperty('--component-sheet-align-items',keyboardActive?'flex-start':'center');
}
function startChoicePickerAddFlow(){
  hideChoicePickerMenu();
  startChoiceEditor('add','');
}
function handleChoicePickerSearchFocus(){
  scheduleChoicePickerViewportSync();
}
function handleChoicePickerSearchBlur(){
  scheduleChoicePickerViewportSync(100);
}
function bindChoicePickerViewportHandlers(){
  if(choicePickerViewportBound)return;
  choicePickerViewportBound=true;
  const vv=window.visualViewport||null;
  if(vv){
    vv.addEventListener('resize',scheduleChoicePickerViewportSync);
    vv.addEventListener('scroll',scheduleChoicePickerViewportSync);
  }
  window.addEventListener('resize',scheduleChoicePickerViewportSync);
  window.addEventListener('orientationchange',scheduleChoicePickerViewportSync);
  const searchInput=$('choicePickerSearch');
  if(searchInput){
    searchInput.addEventListener('focus',handleChoicePickerSearchFocus);
    searchInput.addEventListener('blur',handleChoicePickerSearchBlur);
  }
  scheduleChoicePickerViewportSync();
}
function unbindChoicePickerViewportHandlers(){
  if(!choicePickerViewportBound)return;
  choicePickerViewportBound=false;
  const vv=window.visualViewport||null;
  if(vv){
    vv.removeEventListener('resize',scheduleChoicePickerViewportSync);
    vv.removeEventListener('scroll',scheduleChoicePickerViewportSync);
  }
  window.removeEventListener('resize',scheduleChoicePickerViewportSync);
  window.removeEventListener('orientationchange',scheduleChoicePickerViewportSync);
  const searchInput=$('choicePickerSearch');
  if(searchInput){
    searchInput.removeEventListener('focus',handleChoicePickerSearchFocus);
    searchInput.removeEventListener('blur',handleChoicePickerSearchBlur);
  }
  if(choicePickerViewportRaf){
    cancelAnimationFrame(choicePickerViewportRaf);
    choicePickerViewportRaf=0;
  }
  choicePickerViewportState.keyboardActive=false;
  clearChoicePickerViewportStyles();
}
function quoteMaths(){
  enforceSingleSourceComponents();
  syncQuotePricing();
  const componentTotal=componentRowsForTotals().reduce((sum,item)=>sum+numberOrZero(item&&item.cost),0);
  const materialCost=componentTotal;
  const labourCost=numberOrZero(quote.labourRate)*numberOrZero(quote.labourHours);
  const internalBuildCost=materialCost+labourCost;
  const markupAmount=numberOrZero(quote.targetProfit);
  const subtotal=numberOrZero(quote.finalCustomerPrice);
  const gstRate=Math.max(0,numberOrZero(quote.gstRate));
  const taxActive=(quote.taxEnabled!==false) && (quote.includeGst!==false);
  const gst=taxActive?(subtotal*(gstRate/(100+gstRate))):0;
  const total=subtotal;
  const profit=markupAmount;
  return{materialCost,labourCost,internalBuildCost,markupAmount,subtotal,gst,total,profit,markupPercent:numberOrZero(quote.markupPercent),taxRate:gstRate};
}
function escapeHtml(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function generateId(prefix){
  return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
}
function defaultBlankLibrary(){
  return[
    {id:generateId('blank'),maker:'K-Labs',series:'Softbait',model:"7'2 Softbait",length:"7'2",power:'MH',action:'Fast',pieces:'1',cost:425,sku:'',notes:'',fg:105,gc:9,ts:1260,archived:false},
    {id:generateId('blank'),maker:'CD',series:'Haku',model:'Haku PE3-6',length:"7'6",power:'PE3-6',action:'Fast',pieces:'1',cost:510,sku:'',notes:'',fg:110,gc:10,ts:1350,archived:false},
    {id:generateId('blank'),maker:'K-Labs',series:'Softbait',model:"7'0 Softbait",length:"7'0",power:'M',action:'Fast',pieces:'1',cost:399,sku:'',notes:'',fg:100,gc:9,ts:1240,archived:false},
  ];
}
function normalizeBlank(input){
  const fallback={id:generateId('blank'),maker:'',series:'',model:'',length:'',power:'',action:'',pieces:'',cost:0,sku:'',notes:'',fg:105,gc:9,ts:1260,archived:false};
  const blank={...fallback,...(input||{})};
  blank.id=String(blank.id||generateId('blank'));
  blank.maker=String(blank.maker||'').trim();
  blank.series=String(blank.series||'').trim();
  blank.model=String(blank.model||'').trim();
  blank.length=String(blank.length||'').trim();
  blank.power=String(blank.power||'').trim();
  blank.action=String(blank.action||'').trim();
  blank.pieces=String(blank.pieces||'').trim();
  blank.cost=numberOrZero(blank.cost);
  blank.sku=String(blank.sku||'').trim();
  blank.notes=String(blank.notes||'').trim();
  blank.fg=clampValue(blank.fg,50,300);
  blank.gc=clampValue(blank.gc,5,20);
  blank.ts=clampValue(blank.ts,500,2500);
  blank.archived=!!blank.archived;
  return blank;
}
function normalizeBlankLibrary(records){
  if(!Array.isArray(records))return defaultBlankLibrary().map(normalizeBlank);
  const normalized=records.map(normalizeBlank);
  return normalized.length?normalized:defaultBlankLibrary().map(normalizeBlank);
}
function saveBlankLibrary(){
  Store.set(BLANK_LIBRARY_STORAGE_KEY,blanks.map(normalizeBlank));
}
function findBlankById(blankId){
  return blanks.find((blank)=>blank.id===blankId)||null;
}
function blankDisplayName(blank){
  const maker=String(blank&&blank.maker||'').trim();
  const model=String(blank&&blank.model||'').trim();
  if(maker && model){
    const makerKey=maker.toLowerCase();
    const modelKey=model.toLowerCase();
    if(modelKey.startsWith(makerKey+' '))return model;
    return maker+' '+model;
  }
  return model||maker||'Untitled Blank';
}
function blankModelName(blank){
  const maker=String(blank&&blank.maker||'').trim();
  const model=String(blank&&blank.model||'').trim();
  if(maker && model && model.toLowerCase().startsWith((maker+' ').toLowerCase())){
    return model.slice(maker.length).trim();
  }
  return model||String(quote.blankName||'').trim()||maker||'Untitled Blank';
}
function blankSortName(blank){
  return String(blankModelName(blank)||'').trim().toLowerCase();
}
function favoriteBlankIds(){
  const stored=Store.get('klabs-blank-favourites',Store.get('klabs-blank-favorites',[]));
  if(!Array.isArray(stored))return new Set();
  return new Set(stored.map((value)=>String(value||'').trim()).filter(Boolean));
}
function saveFavoriteBlankIds(ids){
  const values=Array.from(new Set((ids||[]).map((value)=>String(value||'').trim()).filter(Boolean)));
  Store.set('klabs-blank-favourites',values);
}
function choiceRecordKey(type,item){
  if(type==='blank')return String(item&&item.id||'').trim();
  return normalizeNameKey(item&&item.name);
}
function choiceRecordIsFavourite(type,item){
  if(type==='blank')return blankIsFavourite(item&&item.blank?item.blank:item);
  const key=choiceRecordKey(type,item);
  if(!key)return false;
  return choicePickerSessionFavourites[type]&&choicePickerSessionFavourites[type].has(key);
}
function toggleChoiceRecordFavourite(type,item){
  const key=choiceRecordKey(type,item);
  if(!key)return;
  if(type==='blank'){
    const favourites=favoriteBlankIds();
    if(favourites.has(key)){
      favourites.delete(key);
    }else{
      favourites.add(key);
    }
    saveFavoriteBlankIds(Array.from(favourites));
    return;
  }
  if(!choicePickerSessionFavourites[type])return;
  if(choicePickerSessionFavourites[type].has(key)){
    choicePickerSessionFavourites[type].delete(key);
  }else{
    choicePickerSessionFavourites[type].add(key);
  }
  saveChoicePickerFavourites();
}
function compareChoiceNames(left,right){
  return String(left&&left.name||'').localeCompare(String(right&&right.name||''),undefined,{sensitivity:'base'});
}
function sortChoiceRecords(type,records){
  return records.slice().sort((left,right)=>{
    const favouriteDiff=Number(choiceRecordIsFavourite(type,right))-Number(choiceRecordIsFavourite(type,left));
    if(favouriteDiff)return favouriteDiff;
    if(type==='blank'){
      return compareBlankDisplayNames(left.blank,right.blank);
    }
    return compareChoiceNames(left,right);
  });
}
function blankIsFavourite(blank){
  if(!blank)return false;
  if(blank.favorite || blank.favourite || blank.isFavorite || blank.isFavourite)return true;
  return favoriteBlankIds().has(String(blank.id||'').trim());
}
function compareBlankDisplayNames(left,right){
  return blankSortName(left).localeCompare(blankSortName(right),undefined,{sensitivity:'base'});
}
function blankMatchesSearch(blank,query){
  const q=normalizeNameKey(query);
  if(!q)return true;
  const text=[blankDisplayName(blank),blank&&blank.maker,blank&&blank.series,blank&&blank.model,blank&&blank.length,blank&&blank.power,blank&&blank.action,blank&&blank.sku].join(' ').toLowerCase();
  return text.includes(q);
}
function blankReferenceSummary(blank){
  const blankId=String(blank&&blank.id||'');
  const blankName=normalizeNameKey(blankDisplayName(blank));
  const savedQuotes=Array.isArray(Store.get('klabs-workshop-quotes',[]))?Store.get('klabs-workshop-quotes',[]):[];
  const savedBuilds=Array.isArray(Store.get('klabs-workshop-builds',[]))?Store.get('klabs-workshop-builds',[]):[];
  const inCurrent=(quote.blankId===blankId) || (!!blankName && normalizeNameKey(quote.blankName)===blankName);
  const quoteRefs=savedQuotes.filter((record)=>record && (String(record.blankId||'')===blankId || (!!blankName && normalizeNameKey(record.blankName)===blankName))).length;
  const buildRefs=savedBuilds.filter((record)=>record && (String(record.blankId||'')===blankId || (!!blankName && normalizeNameKey(record.blankName)===blankName))).length;
  return{inCurrent,quoteRefs,buildRefs,total:(inCurrent?1:0)+quoteRefs+buildRefs};
}
function applyBlankToQuote(blank){
  if(!blank)return;
  quote.blankId=blank.id;
  quote.blankName=blankDisplayName(blank);
  quote.blankMaker=blank.maker;
  quote.blankSeries=blank.series;
  quote.blankLength=blank.length;
  quote.blankPower=blank.power;
  quote.blankAction=blank.action;
  quote.blankPieces=blank.pieces;
  quote.blankCost=numberOrZero(blank.cost);
  quote.blankSku=blank.sku;
  quote.blankNotes=blank.notes;
  const existingBlankIndex=firstBlankComponentIndex(quote.components);
  if(existingBlankIndex>=0){
    quote.components[existingBlankIndex]=blankComponentFromBlank(blank,quote.components[existingBlankIndex]);
    quote.components=quote.components.map((row,index)=>{
      if(index===existingBlankIndex)return row;
      if(!isBlankCategory(row&&row.category))return row;
      return {...row,category:'Other',description:(specificationValue(row.description)||'Legacy blank item')};
    });
  }else{
    quote.components.unshift(blankComponentFromBlank(blank,defaultComponentRow()));
  }
  saveQuoteCurrent();
  markQuoteDirty();
}
function selectedBlankLibraryRecord(){
  return quote.blankId?findBlankById(quote.blankId):null;
}
function selectedBlankViewModel(){
  const record=selectedBlankLibraryRecord();
  if(!quote.blankId && !record)return null;
  return {
    id:String(quote.blankId||record&&record.id||''),
    model:String(blankModelName(record)||quote.blankName||record&&record.model||'').trim(),
    maker:String(quote.blankMaker||record&&record.maker||'').trim(),
    series:String(quote.blankSeries||record&&record.series||'').trim(),
    length:String(quote.blankLength||record&&record.length||'').trim(),
    power:String(quote.blankPower||record&&record.power||'').trim(),
    action:String(quote.blankAction||record&&record.action||'').trim(),
    pieces:String(quote.blankPieces||record&&record.pieces||'').trim(),
    cost:numberOrZero(typeof quote.blankCost==='number'?quote.blankCost:(record&&record.cost)),
  };
}
function selectedBlankSummaryLines(blank){
  const lines=[];
  const maker=String(blank&&blank.maker||'').trim();
  const details=[blank&&blank.length,blank&&blank.power,blank&&blank.action].map((value)=>String(value||'').trim()).filter(Boolean).join(' • ');
  const pieces=String(blank&&blank.pieces||'').trim();
  const pieceLabel=pieces?`${pieces} Piece${pieces==='1'?'':'s'}`:'';
  const cost=numberOrZero(blank&&blank.cost);
  if(maker)lines.push(maker);
  if(details)lines.push(details);
  if(pieceLabel)lines.push(pieceLabel);
  if(cost>0)lines.push(currency(cost));
  return lines;
}
function selectedBlankSummaryMarkup(blank){
  const lines=selectedBlankSummaryLines(blank);
  const title=escapeHtml(blankModelName(blank)||'Choose Blank');
  const menuButton=blank?`<button id="selectedBlankMenuTrigger" class="component-sheet__menu-trigger selected-blank__menu-trigger" type="button" data-selected-blank-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${escapeHtml(blankModelName(blank)||'selected blank')}">⋯</button>`:'';
  const menu=blank?`<div id="selectedBlankMenu" class="component-picker-menu selected-blank__menu" hidden data-selected-blank-menu><button class="component-picker-menu__item" type="button" data-selected-blank-action="edit">Edit Blank</button><button class="component-picker-menu__item" type="button" data-selected-blank-action="duplicate">Duplicate</button><button class="component-picker-menu__item" type="button" data-selected-blank-action="delete">Delete</button></div>`:'';
  return blank
    ?`<div class="selected-blank-card" data-selected-blank-state="summary"><div class="selected-blank-card__head"><strong class="selected-blank-card__name">${title}</strong></div><div class="selected-blank-card__summary">${lines.map((line)=>`<div>${escapeHtml(line)}</div>`).join('')}</div><div class="selected-blank-card__actions"><button id="quoteBlankPickerTrigger" class="ghost-action selected-blank-card__change" type="button" aria-haspopup="dialog">Change Blank</button>${menuButton}</div>${menu}</div>`
    :`<div class="selected-blank-card selected-blank-card--empty" data-selected-blank-state="empty"><strong class="selected-blank-card__name">Choose Blank</strong><div class="selected-blank-card__actions"><button id="quoteBlankPickerTrigger" class="ghost-action selected-blank-card__change" type="button" aria-haspopup="dialog">Change Blank</button></div></div>`;
}
function selectedBlankEditMarkup(blank){
  const value=(key)=>escapeHtml(String(blank&&blank[key]||''));
  const numberValue=(key)=>escapeHtml(String(numberOrZero(blank&&blank[key])));
  return `
    <div class="selected-blank-card selected-blank-card--edit" data-selected-blank-state="edit">
      <div class="selected-blank-card__head"><p class="eyebrow">SELECTED BLANK</p><strong>Edit Blank</strong></div>
      <div class="blank-editor-grid selected-blank-edit-grid">
        <label class="blank-editor-grid__full"><span>Blank Name</span><input data-selected-blank-field="model" type="text" value="${escapeHtml(String(blankModelName(blank)||''))}" /></label>
        <label><span>Manufacturer</span><input data-selected-blank-field="maker" type="text" value="${value('maker')}" /></label>
        <label><span>Series</span><input data-selected-blank-field="series" type="text" value="${value('series')}" /></label>
        <label><span>Length</span><input data-selected-blank-field="length" type="text" value="${value('length')}" /></label>
        <label><span>Power</span><input data-selected-blank-field="power" type="text" value="${value('power')}" /></label>
        <label><span>Action</span><input data-selected-blank-field="action" type="text" value="${value('action')}" /></label>
        <label><span>Pieces</span><input data-selected-blank-field="pieces" type="text" value="${value('pieces')}" /></label>
        <label><span>Blank Cost</span><input data-selected-blank-field="cost" type="number" inputmode="decimal" min="0" step="0.01" value="${numberValue('cost')}" /></label>
        <label><span>SKU</span><input data-selected-blank-field="sku" type="text" value="${value('sku')}" /></label>
        <label class="blank-editor-grid__full"><span>Notes</span><textarea data-selected-blank-field="notes" rows="2">${value('notes')}</textarea></label>
        <label><span>First Guide (mm)</span><input data-selected-blank-field="fg" type="number" min="50" max="300" step="1" value="${numberValue('fg')}" /></label>
        <label><span>Guide Count</span><input data-selected-blank-field="gc" type="number" min="5" max="20" step="1" value="${numberValue('gc')}" /></label>
        <label class="blank-editor-grid__full"><span>Target Stripper (mm)</span><input data-selected-blank-field="ts" type="number" min="500" max="2500" step="1" value="${numberValue('ts')}" /></label>
      </div>
      <div class="quote-preview-actions selected-blank-card__edit-actions">
        <button type="button" class="ghost-action" data-selected-blank-action="cancel">Cancel</button>
        <button type="button" class="primary-action" data-selected-blank-action="save">Save Blank</button>
      </div>
    </div>
  `;
}
function hideSelectedBlankMenu(){
  document.querySelectorAll('[data-selected-blank-menu]').forEach((menu)=>{menu.hidden=true;});
  const trigger=$('selectedBlankMenuTrigger');
  if(trigger)trigger.setAttribute('aria-expanded','false');
}
function hideSelectedBlankEditState(){
  selectedBlankEditState=null;
  hideSelectedBlankMenu();
}
function handleSelectedBlankAction(action){
  if(action==='edit'){
    hideSelectedBlankMenu();
    beginSelectedBlankEdit();
    return true;
  }
  if(action==='duplicate'){
    hideSelectedBlankMenu();
    const blank=selectedBlankLibraryRecord();
    if(blank){
      duplicateBlank(blank.id);
      renderWorkshopQuote();
    }
    return true;
  }
  if(action==='delete'){
    hideSelectedBlankMenu();
    const blank=selectedBlankLibraryRecord();
    if(blank){
      requestDeleteBlank(blank);
      renderWorkshopQuote();
    }
    return true;
  }
  if(action==='save'){
    saveSelectedBlankEdit();
    return true;
  }
  if(action==='cancel'){
    cancelSelectedBlankEdit();
    return true;
  }
  return false;
}
function toggleSelectedBlankMenu(triggerEl){
  const menu=$('selectedBlankMenu');
  if(!menu || !triggerEl)return;
  const isOpen=!menu.hidden;
  hideSelectedBlankMenu();
  if(isOpen)return;
  if(menu.parentElement!==document.body){
    document.body.appendChild(menu);
  }
  menu.style.position='fixed';
  menu.style.zIndex='80';
  menu.style.visibility='hidden';
  menu.hidden=false;
  const triggerRect=triggerEl.getBoundingClientRect();
  const menuRect=menu.getBoundingClientRect();
  const viewportPadding=8;
  const gap=10;
  const menuWidth=menuRect.width||164;
  const menuHeight=menuRect.height||120;
  const rightSpace=window.innerWidth-triggerRect.right;
  const leftSpace=triggerRect.left;
  const openLeft=rightSpace < menuWidth + gap && leftSpace > menuWidth + gap;
  const desiredLeft=openLeft ? triggerRect.left-menuWidth-gap : triggerRect.right+gap;
  const left=Math.max(viewportPadding,Math.min(window.innerWidth-menuWidth-viewportPadding,desiredLeft));
  const belowSpace=window.innerHeight-triggerRect.bottom;
  const aboveSpace=triggerRect.top;
  const openUp=belowSpace < menuHeight + gap && aboveSpace > menuHeight + gap;
  const desiredTop=openUp ? triggerRect.top-menuHeight-gap : triggerRect.bottom+gap;
  const top=Math.max(viewportPadding,Math.min(window.innerHeight-menuHeight-viewportPadding,desiredTop));
  menu.style.left=`${left}px`;
  menu.style.top=`${top}px`;
  menu.style.visibility='visible';
  triggerEl.setAttribute('aria-expanded','true');
}
function beginSelectedBlankEdit(){
  const blank=selectedBlankViewModel();
  if(!blank)return;
  selectedBlankEditState={id:String(blank.id||''),draft:normalizeBlank({
    id:String(blank.id||''),
    maker:blank.maker,
    series:blank.series,
    model:blank.model,
    length:blank.length,
    power:blank.power,
    action:blank.action,
    pieces:blank.pieces,
    cost:blank.cost,
    sku:selectedBlankLibraryRecord()&&selectedBlankLibraryRecord().sku||'',
    notes:selectedBlankLibraryRecord()&&selectedBlankLibraryRecord().notes||'',
    fg:selectedBlankLibraryRecord()&&selectedBlankLibraryRecord().fg||105,
    gc:selectedBlankLibraryRecord()&&selectedBlankLibraryRecord().gc||9,
    ts:selectedBlankLibraryRecord()&&selectedBlankLibraryRecord().ts||1260,
    archived:selectedBlankLibraryRecord()?selectedBlankLibraryRecord().archived:false,
  })};
  renderWorkshopQuote();
  waitForDomRender(()=>{
    const firstField=$('[data-selected-blank-field="model"]');
    if(firstField){
      try{firstField.focus({preventScroll:true});}catch{firstField.focus();}
      if(typeof firstField.select==='function')firstField.select();
    }
  });
}
function cancelSelectedBlankEdit(){
  hideSelectedBlankEditState();
  renderWorkshopQuote();
}
function updateSelectedBlankDraftField(field,value){
  if(!selectedBlankEditState || !selectedBlankEditState.draft)return;
  if(field==='cost' || field==='fg' || field==='gc' || field==='ts'){
    selectedBlankEditState.draft[field]=numberOrZero(value);
    return;
  }
  selectedBlankEditState.draft[field]=String(value||'');
}
function saveSelectedBlankEdit(){
  if(!selectedBlankEditState || !selectedBlankEditState.draft)return;
  const currentId=String(selectedBlankEditState.id||'');
  const existing=findBlankById(currentId);
  const draft=normalizeBlank({
    ...selectedBlankEditState.draft,
    id:existing?existing.id:currentId||generateId('blank'),
  });
  if(!draft.model){
    alert('Blank name is required.');
    return;
  }
  if(existing){
    const idx=blanks.findIndex((item)=>item.id===existing.id);
    if(idx>=0)blanks[idx]=draft;
  }else{
    blanks.unshift(draft);
  }
  saveBlankLibrary();
  applyBlankToQuote(draft);
  hideSelectedBlankEditState();
  renderBlanks();
  renderWorkshopQuote();
}
function renderSelectedBlankPanel(){
  const host=$('workshopBlankDetailsBody');
  if(!host)return;
  document.querySelectorAll('body > #selectedBlankMenu').forEach((menu)=>{menu.remove();});
  if(selectedBlankEditState && selectedBlankEditState.draft){
    host.innerHTML=selectedBlankEditMarkup(selectedBlankEditState.draft);
    return;
  }
  host.innerHTML=selectedBlankSummaryMarkup(selectedBlankViewModel());
}
function bindSelectedBlankControls(){
  if(selectedBlankControlsBound)return;
  const host=$('workshopBlankDetailsBody');
  if(!host)return;
  selectedBlankControlsBound=true;
  host.addEventListener('click',(event)=>{
    const actionEl=event.target.closest('[data-selected-blank-action]');
    if(actionEl){
      const action=actionEl.getAttribute('data-selected-blank-action')||'';
      if(handleSelectedBlankAction(action))return;
    }
    const menuTrigger=event.target.closest('[data-selected-blank-menu-trigger]');
    if(menuTrigger){
      event.preventDefault();
      toggleSelectedBlankMenu(menuTrigger);
      return;
    }
    const pickerTrigger=event.target.closest('#quoteBlankPickerTrigger');
    if(pickerTrigger){
      event.preventDefault();
      hideSelectedBlankMenu();
      openChoicePicker('blank',-1,pickerTrigger);
      return;
    }
  });
  host.addEventListener('input',(event)=>{
    const field=event.target.closest('[data-selected-blank-field]');
    if(!field || !selectedBlankEditState)return;
    updateSelectedBlankDraftField(field.getAttribute('data-selected-blank-field')||'',field.value);
  });
  host.addEventListener('keydown',(event)=>{
    if(event.key==='Escape' && selectedBlankEditState){
      event.preventDefault();
      cancelSelectedBlankEdit();
    }
  });
  document.addEventListener('click',(event)=>{
    const menuAction=event.target.closest('#selectedBlankMenu [data-selected-blank-action]');
    if(menuAction){
      const action=menuAction.getAttribute('data-selected-blank-action')||'';
      if(handleSelectedBlankAction(action)){
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if(!document.querySelector('[data-selected-blank-menu]:not([hidden])'))return;
    if(event.target.closest('#workshopBlankDetailsBody'))return;
    if(event.target.closest('[data-selected-blank-menu-trigger]'))return;
    if(event.target.closest('[data-selected-blank-menu]'))return;
    hideSelectedBlankMenu();
  },true);
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){
      hideSelectedBlankMenu();
    }
  });
}
function persistBuildRecord(currentQuote){
  syncMissingComponentLibraryData(currentQuote);
  const records=Store.get('klabs-workshop-builds',[]);
  const target=findCurrentSavedBuildTarget();
  const nowIso=new Date().toISOString();
  if(target){
    const createdAt=specificationValue(target.record&&target.record.createdAt)||specificationValue(target.record&&target.record.savedAt)||nowIso;
    const updatedRecord={
      ...quoteForPersistence(currentQuote),
      createdAt,
      savedAt:nowIso,
      updatedAt:nowIso,
    };
    records.splice(target.index,1);
    records.unshift(updatedRecord);
    Store.set('klabs-workshop-builds',records);
    return {source:'build',index:0,record:updatedRecord};
  }
  const record={...quoteForPersistence(currentQuote),createdAt:nowIso,savedAt:nowIso,updatedAt:nowIso};
  records.unshift(record);
  Store.set('klabs-workshop-builds',records);
  return {source:'build',index:0,record};
}
function syncMissingComponentLibraryData(currentQuote){
  // Library updates are explicit via dedicated user actions.
  void currentQuote;
}
function saveBlankLibrarySearch(value){
  blankLibrarySearch=String(value||'');
  Store.set(BLANK_LIBRARY_SEARCH_KEY,blankLibrarySearch);
}
function getCustomCategoryNames(){
  const stored=Store.get(CUSTOM_CATEGORY_STORAGE_KEY,Store.get('klabs-workshop-custom-components',[]));
  if(!Array.isArray(stored))return[];
  return Array.from(new Set(stored.map((name)=>String(name||'').trim()).filter(Boolean)));
}
function saveCustomCategoryNames(names){
  Store.set(CUSTOM_CATEGORY_STORAGE_KEY,Array.from(new Set(names.map((name)=>String(name||'').trim()).filter(Boolean))));
}
function getCustomSupplierNames(){
  const stored=Store.get(CUSTOM_SUPPLIER_STORAGE_KEY,[]);
  if(!Array.isArray(stored))return[];
  return Array.from(new Set(stored.map((name)=>String(name||'').trim()).filter(Boolean)));
}
function saveCustomSupplierNames(names){
  Store.set(CUSTOM_SUPPLIER_STORAGE_KEY,Array.from(new Set(names.map((name)=>String(name||'').trim()).filter(Boolean))));
}
function archivedChoiceStorageKey(type){
  return type==='supplier'?ARCHIVED_SUPPLIER_STORAGE_KEY:ARCHIVED_CATEGORY_STORAGE_KEY;
}
function getArchivedChoiceNames(type){
  const stored=Store.get(archivedChoiceStorageKey(type),[]);
  if(!Array.isArray(stored))return[];
  return Array.from(new Set(stored.map((name)=>String(name||'').trim()).filter(Boolean)));
}
function saveArchivedChoiceNames(type,names){
  Store.set(archivedChoiceStorageKey(type),Array.from(new Set((names||[]).map((name)=>String(name||'').trim()).filter(Boolean))));
}
function normalizeNameKey(name){
  return String(name||'').trim().toLowerCase();
}
function categoryOptionNameOrder(customNames){
  const defaultOther=DEFAULT_CATEGORY_NAMES.find((name)=>normalizeNameKey(name)==='other')||'Other';
  const defaultsWithoutOther=DEFAULT_CATEGORY_NAMES.filter((name)=>normalizeNameKey(name)!=='other');
  const defaultKeys=new Set(DEFAULT_CATEGORY_NAMES.map(normalizeNameKey));
  const safeCustoms=(customNames||[]).filter((name)=>{
    const normalized=normalizeNameKey(name);
    return normalized && normalized!=='other' && !defaultKeys.has(normalized);
  });
  return defaultsWithoutOther.concat(safeCustoms,[defaultOther]);
}
function allComponentNameOptions(){
  return categoryOptionNameOrder(getCustomCategoryNames());
}
function componentOptionRecords(query){
  const orderedNames=categoryOptionNameOrder(getCustomCategoryNames());
  const recordByName=new Map(componentLibraryRecords().map((record)=>[normalizeNameKey(record.name),record]));
  const defaultKeys=new Set(DEFAULT_CATEGORY_NAMES.map(normalizeNameKey));
  const all=orderedNames.map((name)=>{
    const record=recordByName.get(normalizeNameKey(name));
    return {
      name,
      isCustom:!defaultKeys.has(normalizeNameKey(name)),
      category:String(record&&record.category||name).trim(),
      supplier:String(record&&record.supplier||'').trim(),
      description:String(record&&record.description||'').trim(),
    };
  });
  const normalized=normalizeNameKey(query);
  const filterKey=normalizeNameKey(choicePickerCategoryFilter);
  const archived=new Set(getArchivedChoiceNames('category').map(normalizeNameKey));
  const filtered=all
    .filter((item)=>!archived.has(normalizeNameKey(item.name)))
    .filter((item)=>filterKey==='all' || normalizeNameKey(item.category)===filterKey)
    .filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
  return sortChoiceRecords('category',filtered);
}
function supplierOptionRecords(query){
  const defaults=DEFAULT_SUPPLIER_NAMES.map((name)=>({name,isCustom:false}));
  const customNames=getCustomSupplierNames().map((name)=>({name,isCustom:true}));
  const all=defaults.concat(customNames);
  const normalized=normalizeNameKey(query);
  const archived=new Set(getArchivedChoiceNames('supplier').map(normalizeNameKey));
  const filtered=all.filter((item)=>!archived.has(normalizeNameKey(item.name))).filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
  return sortChoiceRecords('supplier',filtered);
}
function blankOptionRecords(query){
  const normalized=normalizeNameKey(query);
  return sortChoiceRecords('blank',blanks
    .filter((blank)=>!blank.archived)
    .map((blank)=>({id:blank.id,name:blankDisplayName(blank),isCustom:true,blank}))
    .filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized)));
}
function ensureChoicePicker(){
  if($('choicePickerSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='choicePickerSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-sheet-action="close"></div>
    <section class="component-sheet__panel" role="dialog" aria-modal="true" aria-label="Select Item">
      <header class="component-sheet__header">
        <h2 id="choicePickerTitle">Select Item</h2>
        <div class="component-sheet__header-actions">
          <button id="choicePickerAdd" class="component-sheet__add component-sheet__add--header" type="button">Add Component</button>
          <button class="component-sheet__close" type="button" data-sheet-action="close" aria-label="Close picker">×</button>
        </div>
      </header>
      <div class="component-sheet__body">
        <input id="choicePickerSearch" class="component-sheet__search" type="text" placeholder="Search components..." autocomplete="off" spellcheck="false" />
        <select id="choicePickerCategoryFilter" class="component-sheet__search component-sheet__filter" hidden>
          <option value="all">All Categories</option>
        </select>
        <div id="choicePickerList" class="component-sheet__list"></div>
        <div id="choicePickerMenu" class="component-picker-menu" hidden>
          <button id="choicePickerMenuSelect" class="component-picker-menu__item" type="button">Select</button>
          <button id="choicePickerMenuRename" class="component-picker-menu__item" type="button">Rename</button>
          <button id="choicePickerMenuDuplicate" class="component-picker-menu__item" type="button">Duplicate</button>
          <button id="choicePickerMenuDelete" class="component-picker-menu__item" type="button">Delete</button>
        </div>
        <div id="choicePickerCustomBox" class="component-sheet__custom" hidden>
          <p id="choicePickerCustomTitle" class="component-sheet__custom-title">Add Component</p>
          <input id="choicePickerCustomInput" class="component-sheet__custom-input" type="text" placeholder="Component name" />
          <button id="choicePickerCustomSave" class="component-sheet__custom-btn" type="button">Save</button>
          <button id="choicePickerCustomCancel" class="component-sheet__custom-btn" type="button">Cancel</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);

  const commitChoiceSelection=(selectedName,selectedId)=>{
    const pickerContext={...activeChoicePicker};
    hideChoicePickerMenu();
    if(pickerContext.type==='blank'){
      applyChoiceSelection(selectedName,selectedId,pickerContext);
      closeComponentSheet();
      return;
    }
    closeComponentSheet();
    applyChoiceSelection(selectedName,selectedId,pickerContext);
  };

  sheet.addEventListener('click',(event)=>{
    const actionEl=event.target.closest('[data-sheet-action]');
    if(actionEl && actionEl.getAttribute('data-sheet-action')==='close'){closeComponentSheet();}
    const menuTrigger=event.target.closest('button[data-choice-menu-option]');
    if(menuTrigger){
      event.preventDefault();
      const optionName=menuTrigger.getAttribute('data-choice-menu-option')||'';
      const optionId=menuTrigger.getAttribute('data-choice-menu-id')||'';
      toggleChoicePickerMenu(menuTrigger,optionName,optionId);
      return;
    }
    const favouriteButton=event.target.closest('button[data-choice-favourite-option]');
    if(favouriteButton){
      event.preventDefault();
      event.stopPropagation();
      const optionName=favouriteButton.getAttribute('data-choice-favourite-option')||'';
      const optionId=favouriteButton.getAttribute('data-choice-favourite-id')||'';
      toggleChoiceRecordFavourite(activeChoicePicker.type,{name:optionName,id:optionId,blank:findBlankById(optionId)});
      renderChoicePickerOptions($('choicePickerSearch')?$('choicePickerSearch').value:'');
      return;
    }
    const optionRow=event.target.closest('.component-sheet__row[data-choice-row]');
    if(optionRow){
      const selectedName=optionRow.getAttribute('data-choice-row')||'';
      const selectedId=optionRow.getAttribute('data-choice-id')||'';
      commitChoiceSelection(selectedName,selectedId);
      return;
    }
    const optionButton=event.target.closest('button[data-choice-option]');
    if(optionButton){
      const selectedName=optionButton.getAttribute('data-choice-option')||'';
      const selectedId=optionButton.getAttribute('data-choice-id')||'';
      commitChoiceSelection(selectedName,selectedId);
      return;
    }
    const deleteButton=event.target.closest('button[data-choice-delete-option]');
    if(deleteButton){
      const optionName=deleteButton.getAttribute('data-choice-delete-option')||'';
      const optionId=deleteButton.getAttribute('data-choice-delete-id')||'';
      hideChoicePickerMenu();
      requestDeleteChoice(optionName,optionId);
      return;
    }
    const renameButton=event.target.closest('button[data-choice-rename-option]');
    if(renameButton){
      const optionName=renameButton.getAttribute('data-choice-rename-option')||'';
      const optionId=renameButton.getAttribute('data-choice-rename-id')||'';
      activeChoiceEditor.blankId=optionId;
      hideChoicePickerMenu();
      startChoiceEditor('rename',optionName);
      return;
    }
    const inlineAddButton=event.target.closest('button[data-choice-add-inline]');
    if(inlineAddButton){
      startChoicePickerAddFlow();
      return;
    }
    if(activeChoiceMenu.open && !event.target.closest('#choicePickerMenu')){
      hideChoicePickerMenu();
    }
  });

  $('choicePickerSearch').addEventListener('input',()=>renderChoicePickerOptions($('choicePickerSearch').value));
  $('choicePickerCategoryFilter').addEventListener('change',()=>{
    const filter=$('choicePickerCategoryFilter');
    choicePickerCategoryFilter=normalizeNameKey(filter&&filter.value)||'all';
    renderChoicePickerOptions($('choicePickerSearch').value);
  });
  $('choicePickerAdd').addEventListener('click',startChoicePickerAddFlow);
  $('choicePickerCustomCancel').addEventListener('click',()=>{
    const customBox=$('choicePickerCustomBox');
    if(customBox){customBox.hidden=true;}
    activeChoiceEditor={mode:'add',originalName:'',blankId:''};
  });
  $('choicePickerCustomSave').addEventListener('click',()=>{
    const customInput=$('choicePickerCustomInput');
    const name=(customInput?customInput.value:'').trim();
    if(!name)return;
    if(activeChoiceEditor.mode==='rename'){
      const renamed=renameCustomChoice(activeChoiceEditor.originalName,name,activeChoiceEditor.blankId||'');
      if(renamed){
        const current=(activeChoicePicker.index>=0 && quote.components[activeChoicePicker.index])?getChoiceValue(activeChoicePicker.type,quote.components[activeChoicePicker.index]):'';
        if(activeChoicePicker.type!=='blank' && normalizeNameKey(current)===normalizeNameKey(activeChoiceEditor.originalName)){setChoiceValue(activeChoicePicker.type,activeChoicePicker.index,name);}
        saveQuoteCurrent();
        renderQuoteComponents();
        updateQuoteSummary();
      }
      const customBox=$('choicePickerCustomBox');
      if(customBox){customBox.hidden=true;}
      activeChoiceEditor={mode:'add',originalName:'',blankId:''};
      renderChoicePickerOptions($('choicePickerSearch').value);
      return;
    }
    const sourceComponent=(activeChoicePicker.index>=0 && quote.components[activeChoicePicker.index])?quote.components[activeChoicePicker.index]:null;
    addCustomChoice(name,{sourceComponent});
    applyChoiceSelection(name);
    closeComponentSheet();
  });

  $('choicePickerMenuRename').addEventListener('click',()=>{
    if(!activeChoiceMenu.open)return;
    if(activeChoicePicker.type==='blank'){
      hideChoicePickerMenu();
      closeComponentSheet();
      beginSelectedBlankEdit();
      return;
    }
    activeChoiceEditor.blankId=activeChoiceMenu.id;
    startChoiceEditor('rename',activeChoiceMenu.name);
    hideChoicePickerMenu();
  });
  $('choicePickerMenuSelect').addEventListener('click',()=>{
    if(!activeChoiceMenu.open)return;
    const selectedName=activeChoiceMenu.name;
    const selectedId=activeChoiceMenu.id;
    commitChoiceSelection(selectedName,selectedId);
  });
  $('choicePickerMenuDuplicate').addEventListener('click',()=>{
    if(!activeChoiceMenu.open)return;
    const selectedName=activeChoiceMenu.name;
    const selectedId=activeChoiceMenu.id;
    hideChoicePickerMenu();
    if(activeChoicePicker.type==='blank'){
      duplicateBlank(selectedId);
    }else{
      const dedupeSet=new Set(recordsForChoiceType(activeChoicePicker.type,'').map((record)=>normalizeNameKey(record.name)));
      const base=`${selectedName||'Component'} Copy`;
      let nextName=base;
      let index=2;
      while(dedupeSet.has(normalizeNameKey(nextName))){
        nextName=`${base} ${index}`;
        index+=1;
      }
      addCustomChoice(nextName,{cloneFromName:selectedName});
    }
    if($('choicePickerSheet') && !$('choicePickerSheet').hidden){
      renderChoicePickerOptions($('choicePickerSearch').value);
    }
  });
  $('choicePickerMenuDelete').addEventListener('click',()=>{
    if(!activeChoiceMenu.open)return;
    requestDeleteChoice(activeChoiceMenu.name,activeChoiceMenu.id);
    hideChoicePickerMenu();
  });

  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape' && $('choicePickerSheet') && !$('choicePickerSheet').hidden){
      closeComponentSheet();
    }
  });
}
function customChoiceNames(type){
  return type==='supplier'?getCustomSupplierNames():getCustomCategoryNames();
}
function saveCustomChoiceNames(type,names){
  if(type==='supplier'){saveCustomSupplierNames(names);return;}
  saveCustomCategoryNames(names);
}
function componentLibraryCostValue(record){
  const source=record&&typeof record==='object'?record:{};
  if(source.cost!==undefined && source.cost!==null && source.cost!=='')return numberOrZero(source.cost);
  if(source.unitCost!==undefined && source.unitCost!==null && source.unitCost!=='')return numberOrZero(source.unitCost);
  if(source.unitPrice!==undefined && source.unitPrice!==null && source.unitPrice!=='')return numberOrZero(source.unitPrice);
  if(source.price!==undefined && source.price!==null && source.price!=='')return numberOrZero(source.price);
  return undefined;
}
function componentLibraryUnitCostValue(record){
  const source=record&&typeof record==='object'?record:{};
  if(source.unitCost!==undefined && source.unitCost!==null && source.unitCost!=='')return numberOrZero(source.unitCost);
  if(source.cost!==undefined && source.cost!==null && source.cost!=='')return numberOrZero(source.cost);
  return undefined;
}
function componentLibraryUnitPriceValue(record){
  const source=record&&typeof record==='object'?record:{};
  if(source.unitPrice!==undefined && source.unitPrice!==null && source.unitPrice!=='')return numberOrZero(source.unitPrice);
  if(source.price!==undefined && source.price!==null && source.price!=='')return numberOrZero(source.price);
  return undefined;
}
function componentLibraryRecords(){
  const stored=Store.get(COMPONENT_LIBRARY_STORAGE_KEY,[]);
  if(!Array.isArray(stored))return[];
  return stored
    .filter((record)=>record&&typeof record==='object')
    .map((record)=>({
      name:String(record.name||'').trim(),
      category:String(record.category||record.name||'').trim(),
      supplier:String(record.supplier||'').trim(),
      description:String(record.description||'').trim(),
      customerLabel:String(record.customerLabel||'').trim(),
      unit:String(record.unit||'').trim(),
      quantity:Number.isFinite(Number(record.quantity))?Number(record.quantity):undefined,
      unitCost:componentLibraryUnitCostValue(record),
      unitPrice:componentLibraryUnitPriceValue(record),
      notes:String(record.notes||'').trim(),
      specifications:String(record.specifications||'').trim(),
      cost:componentLibraryCostValue(record),
    }))
    .filter((record)=>!!normalizeNameKey(record.name));
}
function saveComponentLibraryRecords(records){
  const safeRecords=(Array.isArray(records)?records:[])
    .filter((record)=>record&&typeof record==='object'&&normalizeNameKey(record.name))
    .map((record)=>({
      name:String(record.name||'').trim(),
      category:String(record.category||record.name||'').trim(),
      supplier:String(record.supplier||'').trim(),
      description:String(record.description||'').trim(),
      customerLabel:String(record.customerLabel||'').trim(),
      unit:String(record.unit||'').trim(),
      quantity:Number.isFinite(Number(record.quantity))?Number(record.quantity):undefined,
      unitCost:componentLibraryUnitCostValue(record),
      unitPrice:componentLibraryUnitPriceValue(record),
      notes:String(record.notes||'').trim(),
      specifications:String(record.specifications||'').trim(),
      cost:componentLibraryCostValue(record),
    }));
  Store.set(COMPONENT_LIBRARY_STORAGE_KEY,safeRecords);
}
function findComponentLibraryRecordByName(name){
  const nameKey=normalizeNameKey(name);
  if(!nameKey)return null;
  const records=componentLibraryRecords();
  return records.find((record)=>normalizeNameKey(record.name)===nameKey)||null;
}
function upsertComponentLibraryRecord(name,sourceComponent){
  const normalizedName=String(name||'').trim();
  const normalizedKey=normalizeNameKey(normalizedName);
  if(!normalizedKey)return;
  const item=sourceComponent&&typeof sourceComponent==='object'?sourceComponent:{};
  const rowCategory=String(item.category||'').trim();
  const categoryValue=isBlankCategory(rowCategory)?normalizedName:(rowCategory||normalizedName);
  const unitCost=componentLibraryUnitCostValue(item);
  const unitPrice=componentLibraryUnitPriceValue(item);
  const rowCost=componentLibraryCostValue(item);
  const resolvedCost=unitCost!==undefined?unitCost:rowCost;
  const nextRecord={
    name:normalizedName,
    category:categoryValue,
    supplier:String(item.supplier||'').trim(),
    description:String(item.description||'').trim(),
    customerLabel:String(item.customerLabel||'').trim(),
    unit:String(item.unit||'').trim(),
    quantity:Number.isFinite(Number(item.quantity))?Number(item.quantity):undefined,
    unitCost,
    unitPrice,
    notes:String(item.notes||'').trim(),
    specifications:String(item.specifications||'').trim(),
    cost:resolvedCost,
  };
  const records=componentLibraryRecords();
  const existingIndex=records.findIndex((record)=>normalizeNameKey(record.name)===normalizedKey);
  if(existingIndex>=0){
    records[existingIndex]=nextRecord;
  }else{
    records.unshift(nextRecord);
  }
  saveComponentLibraryRecords(records);
}
function renameComponentLibraryRecord(fromName,toName){
  const fromKey=normalizeNameKey(fromName);
  const toKey=normalizeNameKey(toName);
  if(!fromKey || !toKey)return;
  const records=componentLibraryRecords();
  const targetIndex=records.findIndex((record)=>normalizeNameKey(record.name)===fromKey);
  if(targetIndex<0)return;
  records[targetIndex]={
    ...records[targetIndex],
    name:String(toName||'').trim(),
    category:String(toName||'').trim(),
  };
  saveComponentLibraryRecords(records);
}
function duplicateComponentLibraryRecord(fromName,toName){
  const existing=findComponentLibraryRecordByName(fromName);
  if(!existing)return;
  const toKey=normalizeNameKey(toName);
  const records=componentLibraryRecords().filter((record)=>normalizeNameKey(record.name)!==toKey);
  records.unshift({
    ...existing,
    name:String(toName||'').trim(),
    category:String(toName||'').trim(),
  });
  saveComponentLibraryRecords(records);
}
function removeComponentLibraryRecord(name){
  const targetKey=normalizeNameKey(name);
  if(!targetKey)return;
  const records=componentLibraryRecords().filter((record)=>normalizeNameKey(record.name)!==targetKey);
  saveComponentLibraryRecords(records);
}
function componentPickerCategoryOptions(){
  const categorySet=new Set();
  componentLibraryRecords().forEach((record)=>{
    const category=String(record&&record.category||'').trim();
    if(category)categorySet.add(category);
  });
  DEFAULT_CATEGORY_NAMES.forEach((name)=>{
    if(name)categorySet.add(name);
  });
  return Array.from(categorySet).sort((left,right)=>left.localeCompare(right,undefined,{sensitivity:'base'}));
}
function syncChoicePickerFilterControls(){
  const filter=$('choicePickerCategoryFilter');
  if(!filter)return;
  const showFilter=activeChoicePicker.type==='category';
  filter.hidden=!showFilter;
  if(!showFilter)return;
  const options=['<option value="all">All Categories</option>']
    .concat(componentPickerCategoryOptions().map((name)=>`<option value="${escapeHtml(normalizeNameKey(name))}">${escapeHtml(name)}</option>`));
  filter.innerHTML=options.join('');
  if(!Array.from(filter.options).some((option)=>option.value===choicePickerCategoryFilter)){
    choicePickerCategoryFilter='all';
  }
  filter.value=choicePickerCategoryFilter;
}
function applyComponentLibraryRecordToRow(index,name){
  if(index<0 || !quote.components[index])return;
  const record=findComponentLibraryRecordByName(name);
  if(!record)return;
  const row=quote.components[index];
  if(specificationValue(record.supplier))row.supplier=record.supplier;
  if(specificationValue(record.description))row.description=record.description;
  if(specificationValue(record.customerLabel))row.customerLabel=record.customerLabel;
  if(specificationValue(record.unit))row.unit=record.unit;
  if(Number.isFinite(Number(record.quantity)))row.quantity=Number(record.quantity);
  if(record.unitCost!==undefined)row.unitCost=numberOrZero(record.unitCost);
  if(record.unitPrice!==undefined)row.unitPrice=numberOrZero(record.unitPrice);
  if(specificationValue(record.notes))row.notes=record.notes;
  if(specificationValue(record.specifications))row.specifications=record.specifications;
  if(record.cost!==undefined)row.cost=numberOrZero(record.cost);
  saveQuoteCurrent();
  markQuoteDirty();
}
function syncComponentRowEditorInputs(index){
  const row=quote.components[index];
  if(!row)return;
  const descriptionInput=document.querySelector(`#quoteComponentsList [data-component-key="description"][data-component-index="${index}"]`);
  if(descriptionInput && document.activeElement!==descriptionInput){
    descriptionInput.value=String(row.description||'');
  }
  const costInput=document.querySelector(`#quoteComponentsList [data-component-key="cost"][data-component-index="${index}"]`);
  if(costInput && document.activeElement!==costInput){
    costInput.value=String(numberOrZero(row.cost));
  }
  const unitPriceInput=document.querySelector(`#quoteComponentsList [data-component-key="unitPrice"][data-component-index="${index}"]`);
  if(unitPriceInput && document.activeElement!==unitPriceInput){
    unitPriceInput.value=String(numberOrZero(row.unitPrice));
  }
  const specsInput=document.querySelector(`#quoteComponentsList [data-component-key="specifications"][data-component-index="${index}"]`);
  if(specsInput && document.activeElement!==specsInput){
    specsInput.value=String(row.specifications||'');
  }
  const notesInput=document.querySelector(`#quoteComponentsList [data-component-key="notes"][data-component-index="${index}"]`);
  if(notesInput && document.activeElement!==notesInput){
    notesInput.value=String(row.notes||'');
  }
  const supplierTrigger=document.querySelector(`#quoteComponentsList [data-component-action="open-supplier-sheet"][data-component-index="${index}"] .quote-component-picker__value`);
  if(supplierTrigger){
    supplierTrigger.textContent=String(row.supplier||'').trim()||'Select supplier';
  }
}
function defaultChoiceNameSet(type){
  const defaults=(type==='supplier'?DEFAULT_SUPPLIER_NAMES:DEFAULT_CATEGORY_NAMES).map(normalizeNameKey);
  return new Set(defaults);
}
function startChoiceEditor(mode,originalName){
  const customBox=$('choicePickerCustomBox');
  const customInput=$('choicePickerCustomInput');
  const customTitle=$('choicePickerCustomTitle');
  if(!customBox || !customInput)return;
  activeChoiceEditor={mode,originalName:originalName||'',blankId:activeChoiceEditor.blankId||''};
  customBox.hidden=false;
  customInput.value=mode==='rename'?(originalName||''):'';
  customInput.focus();
  customInput.select();
  if(customTitle){customTitle.textContent=mode==='rename'?'Rename Component':'Add Component';}
}
function choicePickerSupportsContextMenu(){
  return activeChoicePicker.type==='category' || activeChoicePicker.type==='supplier' || activeChoicePicker.type==='blank';
}
function hideChoicePickerMenu(){
  const menu=$('choicePickerMenu');
  if(menu)menu.hidden=true;
  activeChoiceMenu={name:'',id:'',top:0,left:0,open:false};
  hideSelectedBlankMenu();
  hideBlankRowMenu();
}
function positionRowMenu(menuEl,triggerEl,containerEl,menuWidth){
  if(!menuEl || !triggerEl || !containerEl)return;
  const triggerRect=triggerEl.getBoundingClientRect();
  const containerRect=containerEl.getBoundingClientRect();
  const width=menuWidth||144;
  const top=Math.max(8,triggerRect.bottom-containerRect.top+6);
  const left=Math.max(8,Math.min(containerRect.width-width-8,triggerRect.right-containerRect.left-width));
  menuEl.style.top=`${top}px`;
  menuEl.style.left=`${left}px`;
}
function toggleChoicePickerMenu(triggerEl,optionName,optionId){
  const menu=$('choicePickerMenu');
  const panel=triggerEl && triggerEl.closest('.component-sheet__panel');
  if(!menu || !panel)return;
  const alreadyOpen=activeChoiceMenu.open && activeChoiceMenu.name===optionName && activeChoiceMenu.id===optionId;
  if(alreadyOpen){
    hideChoicePickerMenu();
    return;
  }
  const triggerRect=triggerEl.getBoundingClientRect();
  const panelRect=panel.getBoundingClientRect();
  activeChoiceMenu={
    name:optionName,
    id:optionId,
    top:Math.max(8,triggerRect.bottom-panelRect.top+6),
    left:Math.max(8,Math.min(panelRect.width-156,triggerRect.right-panelRect.left-144)),
    open:true,
  };
  positionRowMenu(menu,triggerEl,panel,144);
  menu.hidden=false;
}
function hideBlankRowMenu(){
  document.querySelectorAll('[data-blank-menu]').forEach((menu)=>{menu.hidden=true;});
  document.querySelectorAll('[data-blank-menu-trigger]').forEach((trigger)=>{trigger.setAttribute('aria-expanded','false');});
}
function syncChoicePickerMenuActions(){
  const selectButton=$('choicePickerMenuSelect');
  const renameButton=$('choicePickerMenuRename');
  const duplicateButton=$('choicePickerMenuDuplicate');
  const deleteButton=$('choicePickerMenuDelete');
  if(!selectButton || !renameButton || !duplicateButton || !deleteButton)return;
  const isBlank=activeChoicePicker.type==='blank';
  selectButton.textContent='Select';
  renameButton.textContent='Rename';
  renameButton.setAttribute('aria-label',isBlank?'Rename this blank':'Rename this item');
  duplicateButton.hidden=false;
  deleteButton.textContent='Delete';
  deleteButton.setAttribute('aria-label',isBlank?'Delete this blank':'Delete this item');
}
function toggleBlankRowMenu(triggerEl,blankId){
  const card=triggerEl && triggerEl.closest('.blank-card');
  const menu=card && card.querySelector('[data-blank-menu]');
  if(!card || !menu)return;
  const alreadyOpen=!menu.hidden && menu.getAttribute('data-blank-id')===blankId;
  hideBlankRowMenu();
  if(alreadyOpen)return;
  positionRowMenu(menu,triggerEl,card,164);
  menu.hidden=false;
  triggerEl.setAttribute('aria-expanded','true');
}
function blankRowMenuMarkup(blank){
  const blankId=escapeHtml(blank.id);
  const actions=blank.archived
    ?`<button class="component-picker-menu__item" data-blank-action="restore" data-blank-id="${blankId}" type="button">Restore</button><button class="component-picker-menu__item" data-blank-action="rename" data-blank-id="${blankId}" type="button">Rename</button><button class="component-picker-menu__item" data-blank-action="duplicate" data-blank-id="${blankId}" type="button">Duplicate</button><button class="component-picker-menu__item" data-blank-action="delete" data-blank-id="${blankId}" type="button">Delete</button>`
    :`<button class="component-picker-menu__item" data-blank-action="select" data-blank-id="${blankId}" type="button">Select</button><button class="component-picker-menu__item" data-blank-action="rename" data-blank-id="${blankId}" type="button">Rename</button><button class="component-picker-menu__item" data-blank-action="duplicate" data-blank-id="${blankId}" type="button">Duplicate</button><button class="component-picker-menu__item" data-blank-action="delete" data-blank-id="${blankId}" type="button">Delete</button>`;
  return `<button class="component-sheet__menu-trigger blank-card__menu-trigger" type="button" data-blank-menu-trigger data-blank-id="${blankId}" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${escapeHtml(blankDisplayName(blank))}">⋯</button><div class="component-picker-menu blank-card__menu" hidden data-blank-menu data-blank-id="${blankId}">${actions}</div>`;
}
function addCustomChoice(name,options){
  const context=options&&typeof options==='object'?options:{};
  if(activeChoicePicker.type==='blank'){
    const newBlank=normalizeBlank({id:generateId('blank'),model:name});
    blanks.unshift(newBlank);
    saveBlankLibrary();
    renderBlanks();
    return;
  }
  const normalized=normalizeNameKey(name);
  const type=activeChoicePicker.type;
  const defaultKeys=defaultChoiceNameSet(type);
  const customNames=customChoiceNames(type);
  if(!defaultKeys.has(normalized) && !customNames.some((value)=>normalizeNameKey(value)===normalized)){
    customNames.push(name);
    saveCustomChoiceNames(type,customNames);
    const archived=getArchivedChoiceNames(type).filter((value)=>normalizeNameKey(value)!==normalized);
    saveArchivedChoiceNames(type,archived);
  }
  if(type==='category'){
    if(context.cloneFromName){
      duplicateComponentLibraryRecord(context.cloneFromName,name);
    }else{
      upsertComponentLibraryRecord(name,context.sourceComponent&&typeof context.sourceComponent==='object'?context.sourceComponent:{category:name});
    }
  }
}
function isDefaultChoiceName(type,name){
  const defaults=(type==='supplier'?DEFAULT_SUPPLIER_NAMES:DEFAULT_CATEGORY_NAMES);
  const normalized=normalizeNameKey(name);
  return defaults.some((value)=>normalizeNameKey(value)===normalized);
}
function renameCustomChoice(fromName,toName,blankId){
  const type=activeChoicePicker.type;
  if(type==='blank'){
    const target=findBlankById(blankId);
    if(!target)return false;
    target.model=toName;
    saveBlankLibrary();
    if(String(quote.blankId||'')===target.id){applyBlankToQuote(target);}
    renderBlanks();
    renderWorkshopQuote();
    return true;
  }
  const fromKey=normalizeNameKey(fromName);
  const toKey=normalizeNameKey(toName);
  if(!fromKey || !toKey)return false;
  const names=customChoiceNames(type);
  const index=names.findIndex((value)=>normalizeNameKey(value)===fromKey);
  const archivedNames=getArchivedChoiceNames(type);
  const defaultNames=(type==='supplier'?DEFAULT_SUPPLIER_NAMES:DEFAULT_CATEGORY_NAMES).map(normalizeNameKey);
  const visibleNames=new Set(defaultNames.concat(names.map(normalizeNameKey)));
  if(fromKey!==toKey && visibleNames.has(toKey))return false;
  if(index>=0){
    names[index]=toName;
  }else if(isDefaultChoiceName(type,fromName)){
    const filteredNames=names.filter((value)=>normalizeNameKey(value)!==fromKey);
    filteredNames.push(toName);
    saveCustomChoiceNames(type,filteredNames);
  }else{
    return false;
  }
  if(index>=0){
    saveCustomChoiceNames(type,names);
  }
  const archived=archivedNames.map((name)=>normalizeNameKey(name)===fromKey?toName:name);
  if(isDefaultChoiceName(type,fromName) && !archived.some((value)=>normalizeNameKey(value)===fromKey)){
    archived.push(fromName);
  }
  saveArchivedChoiceNames(type,archived);
  if(type==='category'){
    renameComponentLibraryRecord(fromName,toName);
  }
  return true;
}
function removeCustomChoice(optionName){
  const type=activeChoicePicker.type;
  const optionKey=normalizeNameKey(optionName);
  const nextNames=customChoiceNames(type).filter((value)=>normalizeNameKey(value)!==optionKey);
  saveCustomChoiceNames(type,nextNames);
  const archived=getArchivedChoiceNames(type).filter((value)=>normalizeNameKey(value)!==optionKey);
  if(isDefaultChoiceName(type,optionName) && !archived.some((value)=>normalizeNameKey(value)===optionKey)){
    archived.push(optionName);
  }
  saveArchivedChoiceNames(type,archived);
  if(type==='category'){
    removeComponentLibraryRecord(optionName);
  }
}
function getChoiceValue(type,item){
  return type==='supplier'?(item&&item.supplier)||'':(item&&item.category)||'';
}
function setChoiceValue(type,index,value){
  if(!quote.components[index])return;
  if(type==='supplier'){
    quote.components[index].supplier=value;
  }else{
    const wasBlank=isBlankCategory(quote.components[index].category);
    quote.components[index].category=value;
    if(wasBlank && !isBlankCategory(value)){
      syncQuoteBlankFromComponents();
    }
  }
  enforceSingleSourceComponents();
  saveQuoteCurrent();
  markQuoteDirty();
}
function applyBlankSelectionToBuildCosts(blank,targetIndex){
  const selected=normalizeBlank(blank);
  const existingIndex=firstBlankComponentIndex(quote.components);
  const updateRowAt=(rowIndex)=>{
    if(rowIndex<0 || rowIndex>=quote.components.length)return;
    quote.components[rowIndex]=blankComponentFromBlank(selected,quote.components[rowIndex]);
    applyBlankComponentToQuote(quote.components[rowIndex]);
    saveQuoteCurrent();
    markQuoteDirty();
    renderWorkshopQuote();
  };
  if(existingIndex>=0 && existingIndex!==targetIndex){
    openConfirmDialog({
      title:'Replace Blank',
      message:'Replace the current blank?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'replace',label:'Replace',kind:'primary'}]
    },(action)=>{
      if(action==='replace'){
        updateRowAt(existingIndex);
      }
    });
    return;
  }
  if(Number.isInteger(targetIndex) && targetIndex>=0 && targetIndex<quote.components.length){
    updateRowAt(targetIndex);
    return;
  }
  if(existingIndex>=0){
    updateRowAt(existingIndex);
    return;
  }
  quote.components.unshift(blankComponentFromBlank(selected,defaultComponentRow()));
  applyBlankComponentToQuote(quote.components[0]);
  saveQuoteCurrent();
  markQuoteDirty();
  renderWorkshopQuote();
}
function applyChoiceSelection(selectedName,selectedId,pickerContext){
  const context=pickerContext||activeChoicePicker;
  if(context.type==='blank'){
    const selectedBlank=findBlankById(selectedId) || blanks.find((blank)=>normalizeNameKey(blankDisplayName(blank))===normalizeNameKey(selectedName));
    if(selectedBlank){
      applyBlankSelectionToBuildCosts(selectedBlank,context.index);
    }
    return;
  }
  if(context.index>=0){
    if(context.type==='category' && isBlankCategory(selectedName)){
      openChoicePicker('blank',context.index,document.activeElement);
      return;
    }
    setChoiceValue(context.type,context.index,selectedName);
    if(context.type==='category'){
      applyComponentLibraryRecordToRow(context.index,selectedName);
      syncComponentRowEditorInputs(context.index);
    }
    const action=context.type==='supplier'?'open-supplier-sheet':'open-component-sheet';
    const trigger=document.querySelector(`#quoteComponentsList [data-component-action="${action}"][data-component-index="${context.index}"] .quote-component-picker__value`);
    if(trigger){
      trigger.textContent=selectedName|| (context.type==='supplier'?'Select supplier':'Select component');
    }
    updateQuoteSummary();
  }
}
function recordsForChoiceType(type,query){
  if(type==='supplier')return supplierOptionRecords(query).map((record)=>({...record,id:''}));
  if(type==='blank')return blankOptionRecords(query);
  return componentOptionRecords(query).map((record)=>({...record,id:''}));
}
function choiceOptionSecondaryText(type,item){
  if(type==='blank'){
    const blank=item&&item.blank;
    if(!blank)return '';
    return [blank.maker,blank.series,blank.length,blank.power,blank.action].map((value)=>String(value||'').trim()).filter(Boolean).join(' • ');
  }
  if(type==='category'){
    const bits=[String(item&&item.category||'').trim(),String(item&&item.supplier||'').trim()].filter(Boolean);
    return bits.join(' • ');
  }
  return item&&item.isCustom?'Custom':'';
}
function currentPickerSelectionContext(){
  if(activeChoicePicker.type==='blank'){
    return {
      id:String(quote.blankId||'').trim(),
      name:normalizeNameKey(quote.blankName||'')
    };
  }
  const item=quote.components[activeChoicePicker.index]||null;
  const value=getChoiceValue(activeChoicePicker.type,item);
  return {
    id:'',
    name:normalizeNameKey(value)
  };
}
function choiceOptionIsSelected(item){
  const selection=currentPickerSelectionContext();
  const optionId=String(item&&item.id||'').trim();
  const optionName=normalizeNameKey(item&&item.name);
  if(selection.id && optionId && selection.id===optionId)return true;
  return !!selection.name && selection.name===optionName;
}
function choicePickerTitle(type,index){
  if(type==='blank')return 'Select Blank';
  if(type==='supplier')return 'Select Supplier';
  const row=quote.components[index]||{};
  const category=normalizeNameKey(row.category);
  if(category.includes('reel'))return 'Select Reel Seat';
  if(category.includes('guide'))return 'Select Guide Set';
  if(category.includes('tip'))return 'Select Tip Top';
  if(category.includes('grip'))return 'Select Grip';
  if(category.includes('winding'))return 'Select Winding Checks';
  if(category.includes('hook'))return 'Select Hook Keeper';
  if(category.includes('thread') || category.includes('finish'))return 'Select Thread & Finish';
  if(category.includes('butt'))return 'Select Butt Cap';
  return 'Select Component';
}
function renderChoicePickerOptions(query){
  const list=$('choicePickerList');
  if(!list)return;
  syncChoicePickerFilterControls();
  const records=recordsForChoiceType(activeChoicePicker.type,query);
  const options=activeChoicePicker.type==='blank'?records:records.slice(0,50);
  syncChoicePickerMenuActions();
  hideChoicePickerMenu();
  const hasQuery=!!String(query||'').trim();
  if(!options.length){
    if(hasQuery){
      list.innerHTML='<div class="component-sheet__empty">No matching components</div>';
      return;
    }
    list.innerHTML='<div class="component-sheet__empty-state"><div class="component-sheet__empty-icon" aria-hidden="true">◌</div><p class="component-sheet__empty">No components yet</p><button class="component-sheet__add component-sheet__add--inline" data-choice-add-inline="true" type="button">Add Component</button></div>';
    return;
  }
  const rowsMarkup=options.map((item)=>{
    const hasMenu=choicePickerSupportsContextMenu();
    const secondary=choiceOptionSecondaryText(activeChoicePicker.type,item);
    const selected=choiceOptionIsSelected(item);
    const favourite=choiceRecordIsFavourite(activeChoicePicker.type,item);
    return `<div class="component-sheet__row${selected?' is-selected':''}" data-choice-row="${escapeHtml(item.name)}" data-choice-id="${escapeHtml(item.id||'')}"><button class="component-sheet__option" data-choice-option="${escapeHtml(item.name)}" data-choice-id="${escapeHtml(item.id||'')}" type="button" title="${escapeHtml(item.name)}"><span class="component-sheet__option-title">${escapeHtml(item.name)}</span>${secondary?`<small class="component-sheet__option-meta">${escapeHtml(secondary)}</small>`:''}</button><div class="component-sheet__row-tools"><button class="component-sheet__favorite" data-choice-favourite-option="${escapeHtml(item.name)}" data-choice-favourite-id="${escapeHtml(item.id||'')}" type="button" aria-pressed="${favourite?'true':'false'}" aria-label="${favourite?'Unfavourite':'Favourite'}"><span aria-hidden="true">★</span></button>${hasMenu?`<button class="component-sheet__menu-trigger" data-choice-menu-option="${escapeHtml(item.name)}" data-choice-menu-id="${escapeHtml(item.id||'')}" type="button" aria-label="More actions for ${escapeHtml(item.name)}">⋯</button>`:''}</div></div>`;
  }).join('');
  list.innerHTML=rowsMarkup;
}
function choiceReferences(type,name){
  const normalized=normalizeNameKey(name);
  const savedQuotes=Array.isArray(Store.get('klabs-workshop-quotes',[]))?Store.get('klabs-workshop-quotes',[]):[];
  const savedBuilds=Array.isArray(Store.get('klabs-workshop-builds',[]))?Store.get('klabs-workshop-builds',[]):[];
  const key=type==='supplier'?'supplier':'category';
  const inCurrent=quote.components.some((item)=>normalizeNameKey(item&&item[key])===normalized);
  const inQuotes=savedQuotes.some((record)=>Array.isArray(record&&record.components) && record.components.some((item)=>normalizeNameKey(item&&item[key])===normalized));
  const inBuilds=savedBuilds.some((record)=>Array.isArray(record&&record.components) && record.components.some((item)=>normalizeNameKey(item&&item[key])===normalized));
  return{inCurrent,inQuotes,inBuilds,referenced:inCurrent||inQuotes||inBuilds};
}
function requestDeleteChoice(optionName,optionId){
  if(activeChoicePicker.type==='blank'){
    const blank=findBlankById(optionId);
    if(!blank)return;
    requestDeleteBlank(blank);
    return;
  }
  const refs=choiceReferences(activeChoicePicker.type,optionName);
  if(refs.referenced){
    openConfirmDialog({
      title:'Reference Detected',
      message:'This item is referenced by the current or saved records. Archive it instead to preserve historical integrity.',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'archive',label:'Archive',kind:'primary'}]
    },(action)=>{
      if(action==='archive'){
        const names=getArchivedChoiceNames(activeChoicePicker.type);
        if(!names.some((value)=>normalizeNameKey(value)===normalizeNameKey(optionName))){
          names.push(optionName);
          saveArchivedChoiceNames(activeChoicePicker.type,names);
        }
      }
      renderChoicePickerOptions($('choicePickerSearch').value);
    });
    return;
  }
  openConfirmDialog({
    title:'Delete Component',
    message:'Delete this custom component from the picker list?',
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:'Delete',kind:'danger'}]
  },(action)=>{
    if(action==='delete'){removeCustomChoice(optionName);}
    renderChoicePickerOptions($('choicePickerSearch').value);
  });
}
function setComponentName(index,name){
  if(!quote.components[index])return;
  quote.components[index].category=name;
  saveQuoteCurrent();
}
function defaultComponentRow(){
  return{category:'',description:'',customerLabel:'',supplier:'',cost:0};
}
function componentRowIsEffectivelyEmpty(item){
  return !specificationValue(item&&item.category) && !specificationValue(item&&item.description) && numberOrZero(item&&item.cost)<=0;
}
function componentRowHasMeaningfulData(item){
  return !componentRowIsEffectivelyEmpty(item) && !!(specificationValue(item&&item.category)||specificationValue(item&&item.description)||numberOrZero(item&&item.cost)>0);
}
function componentRowCategoryLabel(item){
  return specificationValue(item&&item.category)||'';
}
function componentRowItemLabel(item){
  const description=specificationValue(item&&item.description);
  if(description)return description;
  const category=specificationValue(item&&item.category);
  if(category && !isBlankCategory(category))return category;
  return isBlankCategory(item&&item.category)?'Choose blank':'New component';
}
function componentRowSupplierLabel(item){
  return specificationValue(item&&item.supplier);
}
function componentRowSummaryMetaParts(item){
  if(componentRowIsEffectivelyEmpty(item))return[];
  const parts=[];
  const category=componentRowCategoryLabel(item);
  const description=specificationValue(item&&item.description);
  if(category && description && normalizeNameKey(category)!==normalizeNameKey(description)){
    parts.push(category);
  }
  return parts;
}
function componentRowCostLabel(item){
  return '';
}
function pruneComponentDraftRows(preserveIndex){
  const keepIndex=Number.isInteger(preserveIndex)?preserveIndex:-1;
  const next=[];
  const indexMap=new Map();
  quote.components.forEach((item,index)=>{
    if(componentRowIsEffectivelyEmpty(item) && index!==keepIndex)return;
    indexMap.set(index,next.length);
    next.push(item);
  });
  const changed=next.length!==quote.components.length;
  quote.components=next;
  expandedComponentRowIndex=indexMap.has(expandedComponentRowIndex)?indexMap.get(expandedComponentRowIndex):-1;
  return {changed,preserveIndex:indexMap.has(keepIndex)?indexMap.get(keepIndex):-1,indexMap};
}
function persistComponentDraftCleanup(changed){
  if(!changed)return;
  saveQuoteCurrent();
  markQuoteDirty();
}
function buildCostsSummaryData(){
  enforceSingleSourceComponents();
  const rows=componentRowsForTotals();
  const componentCount=rows.length;
  const blankComponent=firstSavedComponentByCategory('blank')||firstComponentByCategory('blank');
  const blankName=specificationValue(blankComponent&&blankComponent.description)||specificationValue(blankComponent&&blankComponent.blankName);
  if(blankName && componentCount>0){
    return `${blankName} • ${componentCount} Component${componentCount===1?'':'s'}`;
  }
  if(blankName)return blankName;
  if(componentCount>0)return `${componentCount} Component${componentCount===1?'':'s'} Selected`;
  return 'Select blank and components';
}
function updateBuildCostsSummary(){
  const textEl=$('workshopBuildCostsSummaryText');
  if(!textEl)return;
  textEl.textContent=buildCostsSummaryData();
}
function updateBuildPricingSummary(){
  const summaryEl=$('workshopBuildPricingSummaryText');
  if(!summaryEl)return;
  const price=numberOrZero(quote&&quote.finalCustomerPrice);
  summaryEl.textContent=price>0?`Customer Price NZ$${price.toFixed(2)}`:'Set customer price';
}
function componentRowMenuMarkup(item,index){
  const itemName=componentRowItemLabel(item);
  const deleteLabel=componentRowIsEffectivelyEmpty(item)?'Remove Component':'Delete Component';
  const updateAction=componentRowIsEffectivelyEmpty(item)?'':`<button class="component-picker-menu__item" data-component-action="update-library-component" data-component-index="${index}" type="button">Update Library Component</button>`;
  return `<div class="quote-component-row__menu-wrap"><button class="component-sheet__menu-trigger component-row-menu-trigger" data-component-action="toggle-row-menu" data-component-index="${index}" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${escapeHtml(itemName)}">⋯</button><div class="component-picker-menu quote-component-row__menu" hidden data-component-row-menu="${index}">${updateAction}<button class="component-picker-menu__item" data-component-action="request-delete-row" data-component-index="${index}" type="button">${deleteLabel}</button></div></div>`;
}
function componentRowEditorMarkup(item,index){
  return `<div class="quote-component-row__editor"><p class="quote-component-row__scope">Edit This Build Only. Use Update Library Component to save for future builds.</p><div class="quote-component-row__fields"><label class="quote-component-field quote-component-field--category"><span>Category</span><button class="quote-component-picker__trigger" data-component-action="open-component-sheet" data-component-index="${index}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.category||'Select category')}</span><b>▾</b></button></label><label class="quote-component-field quote-component-field--supplier"><span>Supplier</span><button class="quote-component-picker__trigger" data-component-action="open-supplier-sheet" data-component-index="${index}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.supplier||'Select supplier')}</span><b>▾</b></button></label><label class="quote-component-field quote-component-field--description"><span>Component Details</span><input data-component-index="${index}" data-component-key="description" type="text" placeholder="Enter chosen component..." value="${escapeHtml(item.description||'')}" /></label><label class="quote-component-field quote-component-field--cost"><span>Unit Cost</span><input data-component-index="${index}" data-component-key="cost" type="number" min="0" step="0.01" value="${numberOrZero(item.cost)}" /></label><label class="quote-component-field quote-component-field--cost"><span>Unit Price</span><input data-component-index="${index}" data-component-key="unitPrice" type="number" min="0" step="0.01" value="${numberOrZero(item.unitPrice)}" /></label><label class="quote-component-field quote-component-field--description"><span>Specifications</span><input data-component-index="${index}" data-component-key="specifications" type="text" placeholder="Size, model, specs..." value="${escapeHtml(item.specifications||'')}" /></label><label class="quote-component-field quote-component-field--description"><span>Notes</span><input data-component-index="${index}" data-component-key="notes" type="text" placeholder="Library notes" value="${escapeHtml(item.notes||'')}" /></label></div><div class="quote-component-row__actions"><button class="ghost-action" data-component-action="update-library-component" data-component-index="${index}" type="button">Update Library Component</button><button class="ghost-action quote-component-row__delete" data-component-action="request-delete-row" data-component-index="${index}" type="button">Delete Component</button><button class="ghost-action" data-component-action="close-row" data-component-index="${index}" type="button">Done</button></div></div>`;
}
function hideComponentRowMenu(){
  document.querySelectorAll('[data-component-row-menu]').forEach((menu)=>{menu.hidden=true;});
  document.querySelectorAll('[data-component-action="toggle-row-menu"]').forEach((trigger)=>{trigger.setAttribute('aria-expanded','false');});
}
function toggleComponentRowMenu(triggerEl,index){
  const row=triggerEl&&triggerEl.closest('.quote-component-row');
  const menu=row&&row.querySelector('[data-component-row-menu]');
  if(!row || !menu)return;
  const key=String(index);
  const alreadyOpen=!menu.hidden && menu.getAttribute('data-component-row-menu')===key;
  hideComponentRowMenu();
  if(alreadyOpen)return;
  positionRowMenu(menu,triggerEl,row,164);
  menu.hidden=false;
  triggerEl.setAttribute('aria-expanded','true');
}
function toggleComponentRow(index,options){
  if(index<0 || index>=quote.components.length)return;
  const isClosingCurrent=expandedComponentRowIndex===index;
  let targetIndex=index;
  let draftCleanupChanged=false;
  if(isClosingCurrent){
    const closingRow=quote.components[index];
    if(componentRowIsEffectivelyEmpty(closingRow)){
      const prune=pruneComponentDraftRows(-1);
      draftCleanupChanged=prune.changed;
      if(closingRow)pendingComponentDraftRows.delete(closingRow);
    }else if(closingRow){
      pendingComponentDraftRows.delete(closingRow);
    }
    expandedComponentRowIndex=-1;
    persistComponentDraftCleanup(draftCleanupChanged);
    hideComponentRowMenu();
    renderQuoteComponents();
    updateQuoteSummary();
    return;
  }
  if(expandedComponentRowIndex>=0 && expandedComponentRowIndex<quote.components.length && componentRowIsEffectivelyEmpty(quote.components[expandedComponentRowIndex])){
    const prune=pruneComponentDraftRows(-1);
    draftCleanupChanged=prune.changed;
    targetIndex=prune.indexMap.has(index)?prune.indexMap.get(index):index;
  }
  expandedComponentRowIndex=targetIndex;
  persistComponentDraftCleanup(draftCleanupChanged);
  hideComponentRowMenu();
  renderQuoteComponents();
  waitForDomRender(()=>{
    scrollNewComponentRowIntoView(targetIndex);
    if(options&&options.focusDescription){
      focusNewComponentWithRetry(targetIndex,6);
    }
  });
}
function bindComponentRowMenus(){
  if(document.body.getAttribute('data-component-row-menus-bound')==='true')return;
  document.body.setAttribute('data-component-row-menus-bound','true');
  document.addEventListener('pointerdown',(event)=>{
    const actionButton=event.target.closest('[data-component-action="toggle-row-menu"]');
    if(!actionButton)return;
    const i=Number(actionButton.getAttribute('data-component-index'));
    componentRowMenuPointerDown={index:i,expiresAt:Date.now()+450};
    event.preventDefault();
    event.stopPropagation();
    toggleComponentRowMenu(actionButton,i);
  },true);
  document.addEventListener('click',(event)=>{
    if(event.target.closest('[data-component-action="toggle-row-menu"]'))return;
    if(event.target.closest('[data-component-row-menu]'))return;
    hideComponentRowMenu();
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape')hideComponentRowMenu();
  });
}
function removeComponentRow(index){
  if(index<0 || index>=quote.components.length)return;
  const removedWasBlank=isBlankCategory(quote.components[index]&&quote.components[index].category);
  quote.components.splice(index,1);
  if(expandedComponentRowIndex===index){
    expandedComponentRowIndex=-1;
  }else if(expandedComponentRowIndex>index){
    expandedComponentRowIndex-=1;
  }
  if(removedWasBlank){
    syncQuoteBlankFromComponents();
  }
  shouldAnimateComponentRows=true;
  saveQuoteCurrent();
  markQuoteDirty();
  hideComponentRowMenu();
  renderQuoteComponents();
  updateQuoteSummary();
}
function requestDeleteComponentRow(index){
  if(index<0 || index>=quote.components.length)return;
  const item=quote.components[index];
  const isDraft=componentRowIsEffectivelyEmpty(item);
  hideComponentRowMenu();
  openConfirmDialog({
    title:isDraft?'Remove Component':'Delete Component',
    message:isDraft?'Remove this new component?':'Delete this component?',
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:isDraft?'Remove Component':'Delete Component',kind:'danger'}]
  },(action)=>{
    if(action==='delete'){
      removeComponentRow(index);
    }
  });
}
function requestUpdateLibraryComponentFromRow(index){
  const row=quote.components[index];
  if(!row)return;
  const libraryName=specificationValue(row.category)||specificationValue(row.description);
  if(!libraryName || isBlankCategory(row.category)){
    alert('Select a component category before updating the library.');
    return;
  }
  openConfirmDialog({
    title:'Update Library Component',
    message:'Update this library component for future builds? Existing saved builds will not change.',
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'update',label:'Update Library Component',kind:'primary'}]
  },(action)=>{
    if(action!=='update')return;
    upsertComponentLibraryRecord(libraryName,row);
    alert('Library component updated. This build remains editable independently.');
  });
}
function openComponentSheet(index){
  openChoicePicker('category',index,document.activeElement);
}
function openSupplierSheet(index){
  openChoicePicker('supplier',index,document.activeElement);
}
function openBlankSheet(){
  openChoicePicker('blank',-1,document.activeElement);
}
function openChoicePicker(type,index,openerEl){
  ensureChoicePicker();
  activeChoicePicker={type,index};
  choicePickerCategoryFilter='all';
  const sheet=$('choicePickerSheet');
  if(!sheet)return;
  sheet.hidden=false;
  lockModalLayer(openerEl||document.activeElement);
  hideBlankRowMenu();
  if($('choicePickerCustomBox'))$('choicePickerCustomBox').hidden=true;
  syncChoicePickerMenuActions();
  hideChoicePickerMenu();
  activeChoiceEditor={mode:'add',originalName:'',blankId:''};
  if($('choicePickerSearch'))$('choicePickerSearch').value='';
  if($('choicePickerTitle'))$('choicePickerTitle').textContent=choicePickerTitle(type,index);
  const addButton=$('choicePickerAdd');
  if(addButton){
    addButton.textContent='Add Component';
    addButton.hidden=false;
  }
  if($('choicePickerCustomInput'))$('choicePickerCustomInput').placeholder='Component name';
  syncChoicePickerFilterControls();
  renderChoicePickerOptions('');
  bindChoicePickerViewportHandlers();
  scheduleChoicePickerViewportSync(40);
}
function closeComponentSheet(){
  const sheet=$('choicePickerSheet');
  if(!sheet)return;
  const activeEl=document.activeElement;
  if(activeEl && sheet.contains(activeEl) && typeof activeEl.blur==='function'){
    activeEl.blur();
  }
  hideChoicePickerMenu();
  sheet.hidden=true;
  unbindChoicePickerViewportHandlers();
  if($('choicePickerAdd'))$('choicePickerAdd').hidden=false;
  activeChoicePicker={type:'category',index:-1};
  activeChoiceEditor={mode:'add',originalName:'',blankId:''};
  unlockModalLayer({restoreFocus:true});
}
function renderQuoteComponents(){
  const componentsList=$('quoteComponentsList');
  if(!componentsList)return;
  if(expandedComponentRowIndex>=quote.components.length){
    expandedComponentRowIndex=quote.components.length-1;
  }
  const animateClass=shouldAnimateComponentRows?' quote-component-row--shift':'';
  componentsList.innerHTML=quote.components.map((item,i)=>({item,i})).filter(({item,i})=>!componentRowIsEffectivelyEmpty(item) || expandedComponentRowIndex===i).map(({item,i})=>`
      <article class="quote-component-row${animateClass}${expandedComponentRowIndex===i?' is-expanded':''}" data-component-row-index="${i}" aria-label="Build cost item ${i+1}">
        <div class="quote-component-row__summary">
          <button class="quote-component-row__open" data-component-action="open-row" data-component-index="${i}" type="button" aria-expanded="${expandedComponentRowIndex===i?'true':'false'}">
            <span class="quote-component-row__summary-copy">
              <strong class="quote-component-row__summary-item">${escapeHtml(componentRowItemLabel(item))}</strong>
              ${componentRowSummaryMetaParts(item).length?`<span class="quote-component-row__summary-meta">${componentRowSummaryMetaParts(item).map((part)=>`<span>${escapeHtml(part)}</span>`).join('')}</span>`:''}
            </span>
            ${componentRowCostLabel(item)?`<span class="quote-component-row__summary-cost">${escapeHtml(componentRowCostLabel(item))}</span>`:''}
          </button>
        </div>
        ${expandedComponentRowIndex===i?componentRowEditorMarkup(item,i):''}
      </article>
    `).join('');
  componentsList.querySelectorAll('[data-component-action="request-delete-row"]').forEach((button)=>{
    button.addEventListener('pointerdown',(event)=>{
      const i=Number(button.getAttribute('data-component-index'));
      event.preventDefault();
      event.stopPropagation();
      requestDeleteComponentRow(i);
    });
    button.addEventListener('click',(event)=>{
      const i=Number(button.getAttribute('data-component-index'));
      event.preventDefault();
      event.stopPropagation();
      requestDeleteComponentRow(i);
    });
  });
  const addComponentBtn=$('addComponentBtn');
  if(addComponentBtn){
    addComponentBtn.hidden=expandedComponentRowIndex>=0;
  }
  shouldAnimateComponentRows=false;
}
function waitForDomRender(callback){
  requestAnimationFrame(()=>requestAnimationFrame(callback));
}
function isDocumentScroller(el){
  return el===document.scrollingElement || el===document.documentElement || el===document.body;
}
function bottomOverlayDepth(){
  const selectors=['.bottom-nav','.live-build-status','.offline-ready-status'];
  let depth=0;
  selectors.forEach((selector)=>{
    const el=document.querySelector(selector);
    if(!el || el.hidden)return;
    const style=window.getComputedStyle(el);
    if(style.display==='none' || style.visibility==='hidden')return;
    const rect=el.getBoundingClientRect();
    if(rect.height<=0)return;
    depth=Math.max(depth,Math.max(0,window.innerHeight-rect.top));
  });
  return depth;
}
function viewportVisibleBottom(extraSafeSpace){
  const reservedBottom=bottomOverlayDepth()+Math.max(0,numberOrZero(extraSafeSpace));
  return window.innerHeight-reservedBottom;
}
function nearestScrollableContainer(element){
  let current=element&&element.parentElement;
  while(current && current!==document.body){
    const style=window.getComputedStyle(current);
    const canScrollY=(style.overflowY==='auto' || style.overflowY==='scroll');
    if(canScrollY && current.scrollHeight>current.clientHeight+1){
      return current;
    }
    current=current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
function scrollElementFullyIntoView(container,element){
  if(!container || !element)return;
  const safePad=12;
  const rowBottomSafeSpace=120;
  const elementRect=element.getBoundingClientRect();
  const containerRect=isDocumentScroller(container)
    ? {top:0,bottom:viewportVisibleBottom(rowBottomSafeSpace)}
    : container.getBoundingClientRect();
  const safeBottom=Math.min(containerRect.bottom-safePad,viewportVisibleBottom(rowBottomSafeSpace));
  let delta=0;
  if(elementRect.top<containerRect.top+safePad){
    delta=elementRect.top-(containerRect.top+safePad);
  }else if(elementRect.bottom>safeBottom){
    delta=elementRect.bottom-safeBottom;
  }
  if(!delta)return;

  if(isDocumentScroller(container)){
    window.scrollBy({top:delta,behavior:'smooth'});
    return;
  }
  container.scrollBy({top:delta,behavior:'smooth'});
}
function scrollNewComponentRowIntoView(index){
  const selector=`#quoteComponentsList [data-component-row-index="${index}"]`;
  const row=document.querySelector(selector);
  if(!row)return false;
  const container=nearestScrollableContainer(row);
  scrollElementFullyIntoView(container,row);
  return true;
}
function ensureComponentFieldVisible(field){
  if(!field)return;
  const rect=field.getBoundingClientRect();
  const topBound=88;
  const bottomBound=viewportVisibleBottom(120);
  if(rect.top<topBound || rect.bottom>bottomBound){
    field.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  }
}
function focusNewComponentDescription(index){
  const selector=`#quoteComponentsList [data-component-key="description"][data-component-index="${index}"]`;
  const field=document.querySelector(selector);
  if(!field)return false;
  ensureComponentFieldVisible(field);
  try{
    field.click();
  }catch{}
  try{
    field.focus({preventScroll:true});
  }catch{
    field.focus();
  }
  if(typeof field.setSelectionRange==='function'){
    const end=(field.value||'').length;
    field.setSelectionRange(end,end);
  }
  return document.activeElement===field;
}
function focusNewComponentWithRetry(index,retryCount){
  const focused=focusNewComponentDescription(index);
  if(focused)return;
  if(retryCount>0){
    setTimeout(()=>focusNewComponentWithRetry(index,retryCount-1),40);
    return;
  }
}
function isWorkshopScreenActive(){
  const workshopScreen=$('workshopScreen');
  return !!(workshopScreen && workshopScreen.classList.contains('active'));
}
function markKeyboardDismissWindow(){
  workshopKeyboardDismissState.preservedScrollY=window.scrollY||window.pageYOffset||0;
  workshopKeyboardDismissState.suppressNavUntil=Date.now()+550;
}
function isWorkshopEditableTarget(target){
  if(!target || typeof target.closest!=='function')return false;
  const inWorkshopScreen=!!target.closest('#workshopScreen');
  const inComponentSheet=!!target.closest('#choicePickerSheet,#confirmSheet,#quotePreviewSheet,#blankEditorSheet');
  if(!inWorkshopScreen && !inComponentSheet)return false;
  if(target.matches && target.matches('input, textarea'))return true;
  return !!(target.closest('[contenteditable="true"]'));
}
function bindWorkshopKeyboardDismissGuard(){
  if(workshopKeyboardDismissGuardBound)return;
  workshopKeyboardDismissGuardBound=true;
  document.addEventListener('click',(event)=>{
    if(Date.now()>workshopKeyboardDismissState.suppressNavUntil)return;
    if(!isWorkshopScreenActive())return;
    const navTarget=event.target.closest('[data-nav]');
    const menuOpenTarget=event.target.closest('[data-menu-action="open-menu"]');
    const shouldSuppressNav=!!(navTarget && !navTarget.closest('#navMenuSheet'));
    const shouldSuppressMenuOpen=!!menuOpenTarget;
    if(!shouldSuppressNav && !shouldSuppressMenuOpen)return;
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
    window.requestAnimationFrame(()=>{
      window.scrollTo(0,workshopKeyboardDismissState.preservedScrollY);
    });
  },true);
}
function bindWorkshopInputFocusStability(){
  if(workshopInputFocusStabilityBound)return;
  workshopInputFocusStabilityBound=true;
  document.addEventListener('focusin',(event)=>{
    if(!isWorkshopEditableTarget(event.target))return;
    document.body.classList.add('workshop-input-focus-active');
  });
  document.addEventListener('focusout',(event)=>{
    if(!isWorkshopEditableTarget(event.target))return;
    markKeyboardDismissWindow();
    window.setTimeout(()=>{
      if(document.activeElement && isWorkshopEditableTarget(document.activeElement))return;
      document.body.classList.remove('workshop-input-focus-active');
    },0);
  });
}
function quoteForPersistence(currentQuote){
  const source=currentQuote&&typeof currentQuote==='object'?currentQuote:quote;
  const rawComponents=Array.isArray(source&&source.components)?source.components:[];
  const persistedComponents=normalizeUniqueComponents(rawComponents,{keepDraftRows:false})
    .filter((component)=>componentRowHasMeaningfulData(component) && !pendingComponentDraftRows.has(component))
    .map(normalizeComponent);
  return normalizeQuote({...source,components:persistedComponents});
}
function persistQuoteRecord(currentQuote){
  syncMissingComponentLibraryData(currentQuote);
  const savedAt=new Date().toISOString();
  const records=Store.get('klabs-workshop-quotes',[]);
  const record={...quoteForPersistence(currentQuote),savedAt};
  records.unshift(record);
  Store.set('klabs-workshop-quotes',records);
}
function savedQuoteRecords(){
  const records=Store.get('klabs-workshop-quotes',[]);
  return Array.isArray(records)?records:[];
}
function savedBuildRecords(){
  const records=Store.get('klabs-workshop-builds',[]);
  return Array.isArray(records)?records:[];
}
function allSavedEntries(){
  const quoteEntries=savedQuoteRecords().map((record,index)=>({source:'quote',index,record:normalizeQuote(record)}));
  const buildEntries=savedBuildRecords().map((record,index)=>({source:'build',index,record:normalizeQuote(record)}));
  return quoteEntries.concat(buildEntries);
}
function savedBuildEntries(){
  return allSavedEntries().sort((left,right)=>{
    const leftDate=Date.parse(left.record&&left.record.savedAt||'')||0;
    const rightDate=Date.parse(right.record&&right.record.savedAt||'')||0;
    return rightDate-leftDate;
  });
}
function isValidCustomerName(name){
  const normalized=normalizeNameKey(name).replace(/\s+/g,' ');
  if(!normalized)return false;
  const blockedNames=new Set([
    'no customer name',
    'unknown customer',
    'untitled customer',
    'blank customer'
  ]);
  return !blockedNames.has(normalized);
}
function customerSavedGroups(searchValue,options){
  const settings=options&&typeof options==='object'?options:{};
  const includeInvalidCustomers=settings.includeInvalidCustomers!==false;
  const grouped=new Map();
  allSavedEntries().forEach((entry)=>{
    const record=entry&&entry.record?entry.record:{};
    const customerName=specificationValue(record.customerName);
    if(!includeInvalidCustomers && !isValidCustomerName(customerName))return;
    const key=normalizeNameKey(customerName)||'__no_customer__';
    if(!grouped.has(key)){
      grouped.set(key,{key,name:customerName||'No customer name',entries:[]});
    }
    const target=grouped.get(key);
    target.entries.push(entry);
    if(customerName && target.name==='No customer name')target.name=customerName;
  });
  const normalizedSearch=normalizeNameKey(searchValue);
  const groups=Array.from(grouped.values()).map((group)=>{
    const entries=[...group.entries].sort((left,right)=>{
      const leftDate=Date.parse(left.record&&left.record.savedAt||'')||0;
      const rightDate=Date.parse(right.record&&right.record.savedAt||'')||0;
      return rightDate-leftDate;
    });
    return {
      ...group,
      entries,
      quotes:entries.filter((entry)=>entry.source==='quote'),
      builds:entries.filter((entry)=>entry.source==='build'),
      latestSavedAt:entries[0]&&entries[0].record?entries[0].record.savedAt:'',
    };
  }).filter((group)=>{
    if(!normalizedSearch)return true;
    return normalizeNameKey(group.name).includes(normalizedSearch);
  });
  return groups.sort((left,right)=>{
    const leftDate=Date.parse(left.latestSavedAt||'')||0;
    const rightDate=Date.parse(right.latestSavedAt||'')||0;
    return rightDate-leftDate;
  });
}
function customerFinderMatchesKey(customerKey,name){
  const normalized=normalizeNameKey(name);
  if(customerKey==='__no_customer__')return !normalized;
  return normalized===customerKey;
}
function customerGroupByKey(customerKey){
  return customerSavedGroups('').find((group)=>group.key===customerKey)||null;
}
function customerFinderActionIntroText(){
  if(customerFinderIntent!=='new-build'){
    return 'Search customer name and open their saved jobs.';
  }
  if(customerFinderNewBuildStep==='search'){
    return 'Search and select a customer to start a new build.';
  }
  if(customerFinderNewBuildStep==='add'){
    return 'Enter customer details to start a new build.';
  }
  return 'Select how you want to attach a customer to this new build.';
}
function customerFinderDraftFromForm(){
  return {
    customerName:String(($('customerFinderNewCustomerName')&&$('customerFinderNewCustomerName').value)||'').trim(),
    phone:String(($('customerFinderNewPhone')&&$('customerFinderNewPhone').value)||'').trim(),
    email:String(($('customerFinderNewEmail')&&$('customerFinderNewEmail').value)||'').trim(),
    addressLine1:String(($('customerFinderNewAddress1')&&$('customerFinderNewAddress1').value)||'').trim(),
    addressLine2:String(($('customerFinderNewAddress2')&&$('customerFinderNewAddress2').value)||'').trim(),
    suburbLocality:String(($('customerFinderNewSuburb')&&$('customerFinderNewSuburb').value)||'').trim(),
    cityTown:String(($('customerFinderNewCity')&&$('customerFinderNewCity').value)||'').trim(),
    regionState:String(($('customerFinderNewRegion')&&$('customerFinderNewRegion').value)||'').trim(),
    postcode:String(($('customerFinderNewPostcode')&&$('customerFinderNewPostcode').value)||'').trim(),
    country:String(($('customerFinderNewCountry')&&$('customerFinderNewCountry').value)||'').trim()||'New Zealand',
  };
}
function setCustomerFinderNameValidation(message){
  const feedback=$('customerFinderNewCustomerNameError');
  const input=$('customerFinderNewCustomerName');
  const text=String(message||'').trim();
  if(feedback){
    feedback.textContent=text;
    feedback.hidden=!text;
  }
  if(input){
    input.setAttribute('aria-invalid',text?'true':'false');
  }
}
function resetCustomerFinderNewForm(){
  ['customerFinderNewCustomerName','customerFinderNewPhone','customerFinderNewEmail','customerFinderNewAddress1','customerFinderNewAddress2','customerFinderNewSuburb','customerFinderNewCity','customerFinderNewRegion','customerFinderNewPostcode'].forEach((id)=>{
    const input=$(id);
    if(input)input.value='';
  });
  const country=$('customerFinderNewCountry');
  if(country)country.value='New Zealand';
  setCustomerFinderNameValidation('');
}
function setCustomerFinderNewBuildStep(step){
  customerFinderNewBuildStep=(step==='search' || step==='add')?step:'actions';
  const actions=$('customerFinderStartActions');
  const searchBlock=$('customerFinderSearchBlock');
  const form=$('customerFinderNewForm');
  const back=$('customerFinderSearchBlock')&&$('customerFinderSearchBlock').querySelector('[data-customer-finder-action="back-to-actions"]');
  if(actions)actions.hidden=customerFinderNewBuildStep!=='actions';
  if(searchBlock)searchBlock.hidden=customerFinderNewBuildStep!=='search';
  if(form)form.hidden=customerFinderNewBuildStep!=='add';
  if(back)back.hidden=!(customerFinderIntent==='new-build' && customerFinderNewBuildStep!=='actions');
  updateCustomerFinderIntentUi();
  if(customerFinderNewBuildStep==='search'){
    const search=$('customerFinderSearch');
    if(search){
      try{search.focus({preventScroll:true});}catch{search.focus();}
      search.select();
    }
    renderCustomerFinder();
    scheduleCustomerFinderViewportSync(40);
    return;
  }
  if(customerFinderNewBuildStep==='add'){
    const nameInput=$('customerFinderNewCustomerName');
    if(nameInput){
      try{nameInput.focus({preventScroll:true});}catch{nameInput.focus();}
    }
    scheduleCustomerFinderViewportSync(40);
    return;
  }
  scheduleCustomerFinderViewportSync(40);
}
function updateCustomerFinderIntentUi(){
  const intro=$('customerFinderIntro');
  if(intro)intro.textContent=customerFinderActionIntroText();
  const startActions=$('customerFinderStartActions');
  const searchBlock=$('customerFinderSearchBlock');
  const form=$('customerFinderNewForm');
  const back=searchBlock?searchBlock.querySelector('[data-customer-finder-action="back-to-actions"]'):null;
  if(customerFinderIntent==='new-build'){
    if(startActions)startActions.hidden=customerFinderNewBuildStep!=='actions';
    if(searchBlock)searchBlock.hidden=customerFinderNewBuildStep!=='search';
    if(form)form.hidden=customerFinderNewBuildStep!=='add';
    if(back)back.hidden=customerFinderNewBuildStep==='actions';
    return;
  }
  if(startActions)startActions.hidden=true;
  if(searchBlock)searchBlock.hidden=false;
  if(form)form.hidden=true;
  if(back)back.hidden=true;
}
function handleCustomerSelectionForNewBuild(customerKey,customerName){
  const key=String(customerKey||'');
  const matches=allSavedEntries().filter((entry)=>customerFinderMatchesKey(key,entry&&entry.record&&entry.record.customerName));
  matches.sort((left,right)=>{
    const leftDate=Date.parse(left&&left.record&&left.record.savedAt||'')||0;
    const rightDate=Date.parse(right&&right.record&&right.record.savedAt||'')||0;
    return rightDate-leftDate;
  });
  const sourceRecord=matches[0]&&matches[0].record?matches[0].record:{customerName:String(customerName||'').trim()};
  closeCustomerFinderSheet();
  runNewBuildStartAction(()=>{
    startFreshQuoteForCustomer(sourceRecord);
  });
}
function handleAddCustomerForNewBuild(){
  if(customerFinderIntent==='new-build'){
    setCustomerFinderNewBuildStep('add');
    return;
  }
  closeCustomerFinderSheet();
  runNewBuildStartAction(()=>{
    startFreshQuoteForCustomer({});
  });
}
function handleCreateCustomerFromNewBuildForm(){
  const draft=customerFinderDraftFromForm();
  if(!specificationValue(draft.customerName)){
    setCustomerFinderNameValidation('Enter a customer name to continue.');
    const input=$('customerFinderNewCustomerName');
    if(input){
      try{input.focus({preventScroll:true});}catch{input.focus();}
    }
    return;
  }
  setCustomerFinderNameValidation('');
  closeCustomerFinderSheet();
  runNewBuildStartAction(()=>{
    startFreshQuoteForCustomer(draft);
  });
}
function closeCustomerFinderMenus(){
  document.querySelectorAll('#customerFinderSheet .customer-finder__menu-wrap[open]').forEach((menu)=>{menu.open=false;});
}
function customerFinderCustomerMenuMarkup(group){
  return `<details class="customer-finder__menu-wrap"><summary class="component-sheet__menu-trigger customer-finder__menu-trigger" aria-label="Customer actions">⋯</summary><div class="component-picker-menu customer-finder__menu"><button class="component-picker-menu__item" type="button" data-customer-list-action="rename" data-customer-key="${escapeHtml(group.key)}" data-customer-name="${escapeHtml(group.name)}">Rename Customer</button><button class="component-picker-menu__item" type="button" data-customer-list-action="delete" data-customer-key="${escapeHtml(group.key)}" data-customer-name="${escapeHtml(group.name)}">Delete Customer</button></div></details>`;
}
function customerFinderWorkMenuMarkup(entry){
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  const deleteLabel='Delete Job';
  return `<details class="customer-finder__menu-wrap"><summary class="component-sheet__menu-trigger customer-finder__menu-trigger" aria-label="Saved job actions">⋯</summary><div class="component-picker-menu customer-finder__menu"><button class="component-picker-menu__item" type="button" data-customer-row-action="delete" data-customer-open-source="${source}" data-customer-open-index="${index}">${deleteLabel}</button></div></details>`;
}
function customerFinderWorkRowMarkup(entry){
  const record=entry&&entry.record?entry.record:{};
  const isBuild=entry.source==='build';
  const title=specificationValue(record.buildName)||'Untitled Job';
  const typeLabel=isBuild?'Build job':'Legacy quote';
  const refText=isBuild
    ? (specificationValue(record.buildNumber)?`${typeLabel} ${specificationValue(record.buildNumber)}`:typeLabel)
    : typeLabel;
  const savedAtText=record.savedAt?formatDateDisplay(record.savedAt,{includeTime:true}):'Unknown save time';
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  return `<div class="customer-finder__work-row" data-customer-open-source="${source}" data-customer-open-index="${index}" role="button" tabindex="0" aria-label="Open saved job ${escapeHtml(title)}"><div class="customer-finder__work-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(refText)} • Saved ${escapeHtml(savedAtText)}</small></div>${customerFinderWorkMenuMarkup(entry)}</div>`;
}
function requestRenameCustomer(customerKey,currentName){
  const existing=currentName==='No customer name'?'':String(currentName||'');
  const proposed=window.prompt('Rename customer',existing);
  if(proposed===null)return;
  const nextName=String(proposed||'').trim();
  if(!nextName){
    alert('Customer name is required.');
    return;
  }
  const quoteRecords=savedQuoteRecords();
  const buildRecords=savedBuildRecords();
  let quoteChanged=false;
  let buildChanged=false;
  quoteRecords.forEach((record)=>{
    if(customerFinderMatchesKey(customerKey,record&&record.customerName)){
      record.customerName=nextName;
      quoteChanged=true;
    }
  });
  buildRecords.forEach((record)=>{
    if(customerFinderMatchesKey(customerKey,record&&record.customerName)){
      record.customerName=nextName;
      buildChanged=true;
    }
  });
  if(quoteChanged)Store.set('klabs-workshop-quotes',quoteRecords);
  if(buildChanged)Store.set('klabs-workshop-builds',buildRecords);
  if(customerFinderMatchesKey(customerKey,quote.customerName)){
    quote.customerName=nextName;
    saveQuoteCurrent();
    renderWorkshopQuote();
  }
  customerFinderSelectedKey=normalizeNameKey(nextName)||'__no_customer__';
  renderBuilds();
  renderCustomerFinder();
}
function requestDeleteCustomerGroup(customerKey,customerName){
  const group=customerSavedGroups('').find((entry)=>entry.key===customerKey);
  const refs=group?(group.quotes.length+group.builds.length):0;
  if(refs>0){
    openConfirmDialog({
      title:'Delete Customer',
      message:'This customer has saved jobs. Delete those records first.',
      actions:[{id:'ok',label:'OK',kind:'primary'}]
    },()=>{});
    return;
  }
  openConfirmDialog({
    title:'Delete Customer',
    message:`Delete customer ${customerName||'record'}?`,
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:'Delete Customer',kind:'danger'}]
  },()=>{});
}
function renderCustomerFinder(){
  const resultHost=$('customerFinderResults');
  const detailHost=$('customerFinderDetail');
  if(!resultHost || !detailHost)return;
  const groups=customerSavedGroups(customerFinderSearch);
  if(!groups.length){
    customerFinderSelectedKey='';
    resultHost.innerHTML='<div class="component-sheet__empty">No customers matched that name.</div>';
    detailHost.hidden=true;
    detailHost.innerHTML='';
    return;
  }
  const hasSelected=groups.some((group)=>group.key===customerFinderSelectedKey);
  if(!hasSelected){
    customerFinderSelectedKey=groups[0].key;
  }
  closeCustomerFinderMenus();
  resultHost.innerHTML=groups.map((group)=>{
    const active=group.key===customerFinderSelectedKey;
    const totalJobs=group.quotes.length+group.builds.length;
    const summary=`${totalJobs} saved job${totalJobs===1?'':'s'}`;
    const menuMarkup=customerFinderIntent==='new-build'?'':customerFinderCustomerMenuMarkup(group);
    return `<div class="component-sheet__row customer-finder__customer-row"><button class="component-sheet__option customer-finder__customer-select${active?' is-active-customer':''}" type="button" data-customer-key="${escapeHtml(group.key)}"><span class="customer-finder__customer-name">${escapeHtml(group.name)}</span><small class="customer-finder__customer-meta">${escapeHtml(summary)}</small></button>${menuMarkup}</div>`;
  }).join('');
  if(customerFinderIntent==='new-build'){
    detailHost.hidden=true;
    detailHost.innerHTML='';
    return;
  }
  const selected=groups.find((group)=>group.key===customerFinderSelectedKey)||groups[0];
  if(!selected){
    detailHost.hidden=true;
    detailHost.innerHTML='';
    return;
  }
  const jobRows=selected.entries.length?selected.entries.map(customerFinderWorkRowMarkup).join(''):'<div class="component-sheet__empty">No saved jobs for this customer.</div>';
  detailHost.hidden=false;
  detailHost.innerHTML=`
    <header class="customer-finder__detail-head">
      <h3>${escapeHtml(selected.name)}</h3>
      <p>Saved jobs for this customer.</p>
    </header>
    <section class="customer-finder__work-section" aria-label="Saved Jobs">
      <h4>Saved Jobs</h4>
      <div class="customer-finder__work-list">${jobRows}</div>
    </section>
  `;
}
function clearCustomerFinderViewportStyles(){
  const sheet=$('customerFinderSheet');
  if(!sheet)return;
  sheet.style.removeProperty('--component-sheet-vv-left');
  sheet.style.removeProperty('--component-sheet-vv-width');
  sheet.style.removeProperty('--component-sheet-vv-top');
  sheet.style.removeProperty('--component-sheet-vv-height');
  sheet.style.removeProperty('--component-sheet-panel-max-width');
  sheet.style.removeProperty('--component-sheet-panel-max-height');
  sheet.style.removeProperty('--component-sheet-align-items');
  sheet.style.removeProperty('--customer-finder-keyboard-inset');
}
function scheduleCustomerFinderViewportSync(delayMs){
  if(customerFinderViewportRaf){
    cancelAnimationFrame(customerFinderViewportRaf);
    customerFinderViewportRaf=0;
  }
  const runSync=()=>{syncCustomerFinderViewport();};
  if(numberOrZero(delayMs)>0){
    window.setTimeout(()=>{
      customerFinderViewportRaf=requestAnimationFrame(runSync);
    },delayMs);
    return;
  }
  customerFinderViewportRaf=requestAnimationFrame(runSync);
}
function syncCustomerFinderViewport(){
  const sheet=$('customerFinderSheet');
  if(!sheet || sheet.hidden){
    clearCustomerFinderViewportStyles();
    customerFinderViewportState.keyboardActive=false;
    return;
  }
  const vv=window.visualViewport||null;
  const viewportWidth=Math.max(0,Math.round(vv?vv.width:window.innerWidth));
  const viewportLeft=Math.max(0,Math.round(vv?vv.offsetLeft:0));
  const viewportHeight=Math.max(0,Math.round(vv?vv.height:window.innerHeight));
  const viewportTop=Math.max(0,Math.round(vv?vv.offsetTop:0));
  const sideGap=12;
  const panelMaxWidth=Math.min(920,Math.max(260,viewportWidth-(sideGap*2)));
  const panelMaxHeight=Math.max(220,viewportHeight-24);
  const activeEl=document.activeElement;
  const activeInSheet=!!(activeEl && sheet.contains(activeEl));
  const activeEditable=activeInSheet && !!(activeEl.matches && activeEl.matches('input, textarea, [contenteditable="true"]'));
  const keyboardDelta=Math.max(0,Math.round(window.innerHeight-viewportHeight-viewportTop));
  const keyboardActive=activeEditable && keyboardDelta>0;
  const keyboardInset=keyboardActive?Math.max(0,keyboardDelta+14):0;
  customerFinderViewportState.keyboardActive=keyboardActive;
  sheet.style.setProperty('--component-sheet-vv-left',`${viewportLeft}px`);
  sheet.style.setProperty('--component-sheet-vv-width',`${viewportWidth}px`);
  sheet.style.setProperty('--component-sheet-vv-top',`${viewportTop}px`);
  sheet.style.setProperty('--component-sheet-vv-height',`${viewportHeight}px`);
  sheet.style.setProperty('--component-sheet-panel-max-width',`${panelMaxWidth}px`);
  sheet.style.setProperty('--component-sheet-panel-max-height',`${panelMaxHeight}px`);
  sheet.style.setProperty('--component-sheet-align-items',keyboardActive?'flex-start':'center');
  sheet.style.setProperty('--customer-finder-keyboard-inset',`${keyboardInset}px`);
  if(keyboardActive && activeEl && typeof activeEl.scrollIntoView==='function'){
    activeEl.scrollIntoView({block:'nearest',inline:'nearest'});
  }
}
function handleCustomerFinderFocusIn(){
  scheduleCustomerFinderViewportSync();
}
function handleCustomerFinderFocusOut(){
  scheduleCustomerFinderViewportSync(120);
}
function bindCustomerFinderViewportHandlers(){
  if(customerFinderViewportBound)return;
  const sheet=$('customerFinderSheet');
  if(!sheet)return;
  customerFinderViewportBound=true;
  const vv=window.visualViewport||null;
  if(vv){
    vv.addEventListener('resize',scheduleCustomerFinderViewportSync);
    vv.addEventListener('scroll',scheduleCustomerFinderViewportSync);
  }
  window.addEventListener('resize',scheduleCustomerFinderViewportSync);
  window.addEventListener('orientationchange',scheduleCustomerFinderViewportSync);
  sheet.addEventListener('focusin',handleCustomerFinderFocusIn);
  sheet.addEventListener('focusout',handleCustomerFinderFocusOut);
  scheduleCustomerFinderViewportSync();
}
function unbindCustomerFinderViewportHandlers(){
  if(!customerFinderViewportBound)return;
  customerFinderViewportBound=false;
  const sheet=$('customerFinderSheet');
  const vv=window.visualViewport||null;
  if(vv){
    vv.removeEventListener('resize',scheduleCustomerFinderViewportSync);
    vv.removeEventListener('scroll',scheduleCustomerFinderViewportSync);
  }
  window.removeEventListener('resize',scheduleCustomerFinderViewportSync);
  window.removeEventListener('orientationchange',scheduleCustomerFinderViewportSync);
  if(sheet){
    sheet.removeEventListener('focusin',handleCustomerFinderFocusIn);
    sheet.removeEventListener('focusout',handleCustomerFinderFocusOut);
  }
  if(customerFinderViewportRaf){
    cancelAnimationFrame(customerFinderViewportRaf);
    customerFinderViewportRaf=0;
  }
  customerFinderViewportState.keyboardActive=false;
  clearCustomerFinderViewportStyles();
}
function closeCustomerFinderSheet(){
  const sheet=$('customerFinderSheet');
  if(!sheet)return;
  const activeEl=document.activeElement;
  if(activeEl && sheet.contains(activeEl) && typeof activeEl.blur==='function'){
    activeEl.blur();
  }
  sheet.hidden=true;
  unbindCustomerFinderViewportHandlers();
  unlockModalLayer({restoreFocus:true});
}
function openCustomerFinderSheet(intent){
  ensureCustomerFinderSheet();
  const sheet=$('customerFinderSheet');
  if(!sheet)return;
  customerFinderIntent=intent==='new-build'?'new-build':'browse';
  const hasCustomerHistory=customerSavedGroups('',{includeInvalidCustomers:false}).length>0;
  customerFinderNewBuildStep=customerFinderIntent==='new-build'?(hasCustomerHistory?'search':'add'):'search';
  customerFinderSearch='';
  customerFinderSelectedKey='';
  if($('customerFinderSearch'))$('customerFinderSearch').value='';
  if(customerFinderIntent==='new-build'){
    resetCustomerFinderNewForm();
  }
  updateCustomerFinderIntentUi();
  renderCustomerFinder();
  if(customerFinderIntent==='new-build'){
    setCustomerFinderNewBuildStep(customerFinderNewBuildStep);
  }
  sheet.hidden=false;
  lockModalLayer(document.activeElement);
  bindCustomerFinderViewportHandlers();
  const input=(customerFinderIntent==='new-build' && customerFinderNewBuildStep==='add')?$('customerFinderNewCustomerName'):$('customerFinderSearch');
  if(input && !input.hidden){
    try{input.focus({preventScroll:true});}catch{input.focus();}
  }
  scheduleCustomerFinderViewportSync(40);
}
function ensureCustomerFinderSheet(){
  if($('customerFinderSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='customerFinderSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-customer-finder-action="close"></div>
    <section class="component-sheet__panel customer-finder__panel" role="dialog" aria-modal="true" aria-label="Find Customer">
      <header class="component-sheet__header">
        <h2>Find Customer</h2>
        <button class="component-sheet__close" type="button" data-customer-finder-action="close" aria-label="Close customer search">×</button>
      </header>
      <div class="component-sheet__body customer-finder__body">
        <p id="customerFinderIntro" class="customer-finder__intro">Search customer name and open their saved jobs.</p>
        <div id="customerFinderStartActions" class="customer-finder__start-actions" hidden>
          <button id="customerFinderSearchExistingAction" class="primary-action" type="button" data-customer-finder-action="search-existing">Search Existing Customer</button>
          <button id="customerFinderAddNewAction" class="ghost-action" type="button" data-customer-finder-action="add-new">Add New Customer</button>
        </div>
        <div id="customerFinderSearchBlock" hidden>
          <input id="customerFinderSearch" class="component-sheet__search" type="search" placeholder="Search customer name" autocomplete="off" spellcheck="false" />
          <section class="customer-finder__layout" aria-label="Customer finder layout">
            <aside class="customer-finder__list-pane" aria-label="Customers">
              <div id="customerFinderResults" class="component-sheet__list customer-finder__list" aria-label="Customer matches"></div>
            </aside>
            <section id="customerFinderDetail" class="customer-finder__detail customer-finder__detail-pane" aria-live="polite" hidden></section>
          </section>
          <button class="ghost-action customer-finder__back" type="button" data-customer-finder-action="back-to-actions" hidden>Back</button>
        </div>
        <form id="customerFinderNewForm" class="customer-finder__new-form" hidden>
          <label><span>Customer Name</span><input id="customerFinderNewCustomerName" type="text" placeholder="Customer name" autocomplete="name" /></label>
          <p id="customerFinderNewCustomerNameError" class="customer-finder__field-error" aria-live="polite" hidden></p>
          <label><span>Phone</span><input id="customerFinderNewPhone" type="text" placeholder="Phone" autocomplete="tel" /></label>
          <label><span>Email</span><input id="customerFinderNewEmail" type="email" placeholder="Email" autocomplete="email" /></label>
          <label class="customer-finder__new-form-full"><span>Address Line 1</span><input id="customerFinderNewAddress1" type="text" placeholder="Address line 1" autocomplete="address-line1" /></label>
          <label class="customer-finder__new-form-full"><span>Address Line 2</span><input id="customerFinderNewAddress2" type="text" placeholder="Address line 2" autocomplete="address-line2" /></label>
          <label><span>Suburb / Locality</span><input id="customerFinderNewSuburb" type="text" placeholder="Suburb / locality" autocomplete="address-level3" /></label>
          <label><span>City / Town</span><input id="customerFinderNewCity" type="text" placeholder="City / town" autocomplete="address-level2" /></label>
          <label><span>Region / State</span><input id="customerFinderNewRegion" type="text" placeholder="Region / state" autocomplete="address-level1" /></label>
          <label><span>Postcode / ZIP</span><input id="customerFinderNewPostcode" type="text" placeholder="Postcode / ZIP" autocomplete="postal-code" /></label>
          <label class="customer-finder__new-form-full"><span>Country</span><input id="customerFinderNewCountry" type="text" placeholder="Country" value="New Zealand" autocomplete="country-name" /></label>
          <div class="customer-finder__new-form-actions">
            <button class="ghost-action" type="button" data-customer-finder-action="back-to-actions">Back</button>
            <button class="primary-action" type="button" data-customer-finder-action="submit-new">Start Build</button>
          </div>
        </form>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);
  sheet.addEventListener('toggle',(event)=>{
    const opened=event.target.closest('.customer-finder__menu-wrap');
    if(!opened || !opened.open)return;
    document.querySelectorAll('#customerFinderSheet .customer-finder__menu-wrap[open]').forEach((menu)=>{
      if(menu!==opened)menu.open=false;
    });
  },true);
  sheet.addEventListener('click',(event)=>{
    const actionEl=event.target.closest('[data-customer-finder-action]');
    if(actionEl){
      const action=actionEl.getAttribute('data-customer-finder-action')||'';
      if(action==='close'){
        closeCustomerFinderSheet();
        return;
      }
      if(action==='add-new'){
        handleAddCustomerForNewBuild();
        return;
      }
      if(action==='search-existing'){
        setCustomerFinderNewBuildStep('search');
        return;
      }
      if(action==='back-to-actions'){
        if(customerFinderIntent==='new-build'){
          setCustomerFinderNewBuildStep('actions');
        }
        return;
      }
      if(action==='submit-new'){
        handleCreateCustomerFromNewBuildForm();
        return;
      }
    }
    if(!event.target.closest('.customer-finder__menu-wrap')){
      closeCustomerFinderMenus();
    }
    const customerMenuAction=event.target.closest('[data-customer-list-action]');
    if(customerMenuAction){
      const action=customerMenuAction.getAttribute('data-customer-list-action')||'';
      const customerKey=customerMenuAction.getAttribute('data-customer-key')||'';
      const customerName=customerMenuAction.getAttribute('data-customer-name')||'';
      closeCustomerFinderMenus();
      if(action==='rename'){requestRenameCustomer(customerKey,customerName);}
      if(action==='delete'){requestDeleteCustomerGroup(customerKey,customerName);}
      return;
    }
    const customerButton=event.target.closest('[data-customer-key]');
    if(customerButton){
      const customerKey=customerButton.getAttribute('data-customer-key')||'';
      if(customerFinderIntent==='new-build'){
        const customerName=((customerButton.querySelector('.customer-finder__customer-name')||{}).textContent||'').trim();
        handleCustomerSelectionForNewBuild(customerKey,customerName);
        return;
      }
      customerFinderSelectedKey=customerKey;
      renderCustomerFinder();
      return;
    }
    const rowAction=event.target.closest('[data-customer-row-action]');
    if(rowAction){
      const action=rowAction.getAttribute('data-customer-row-action')||'';
      const source=rowAction.getAttribute('data-customer-open-source')||'quote';
      const index=Number(rowAction.getAttribute('data-customer-open-index'));
      closeCustomerFinderMenus();
      if(action==='delete'){
        requestDeleteSavedBuildRecord(source,index);
      }
      return;
    }
    const openRow=event.target.closest('.customer-finder__work-row[data-customer-open-source][data-customer-open-index]');
    if(openRow && !event.target.closest('.customer-finder__menu-wrap')){
      const source=openRow.getAttribute('data-customer-open-source')||'quote';
      const index=Number(openRow.getAttribute('data-customer-open-index'));
      closeCustomerFinderSheet();
      openSavedBuildRecord(source,index);
      return;
    }
  });
  sheet.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter' && event.key!==' ')return;
    const openRow=event.target.closest('.customer-finder__work-row[data-customer-open-source][data-customer-open-index]');
    if(!openRow || event.target.closest('.customer-finder__menu-wrap'))return;
    event.preventDefault();
    const source=openRow.getAttribute('data-customer-open-source')||'quote';
    const index=Number(openRow.getAttribute('data-customer-open-index'));
    closeCustomerFinderSheet();
    openSavedBuildRecord(source,index);
  });
  const searchInput=sheet.querySelector('#customerFinderSearch');
  if(searchInput){
    searchInput.addEventListener('input',()=>{
      customerFinderSearch=searchInput.value||'';
      customerFinderSelectedKey='';
      renderCustomerFinder();
    });
  }
  const newForm=sheet.querySelector('#customerFinderNewForm');
  if(newForm){
    newForm.addEventListener('submit',(event)=>{
      event.preventDefault();
      handleCreateCustomerFromNewBuildForm();
    });
  }
  const newNameInput=sheet.querySelector('#customerFinderNewCustomerName');
  if(newNameInput){
    newNameInput.addEventListener('input',()=>{
      if(specificationValue(newNameInput.value)){
        setCustomerFinderNameValidation('');
      }
    });
    newNameInput.addEventListener('blur',()=>{
      newNameInput.value=String(newNameInput.value||'').trim();
    });
  }
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape' && $('customerFinderSheet') && !$('customerFinderSheet').hidden){
      closeCustomerFinderSheet();
    }
  });
}
function customerBrowserPrimaryRecord(group){
  if(!group || !Array.isArray(group.entries) || !group.entries.length)return {};
  const sorted=[...group.entries].sort((left,right)=>{
    const leftDate=Date.parse(left&&left.record&&left.record.savedAt||'')||0;
    const rightDate=Date.parse(right&&right.record&&right.record.savedAt||'')||0;
    return rightDate-leftDate;
  });
  return sorted[0]&&sorted[0].record?sorted[0].record:{};
}
function customerBrowserCompanyValue(record){
  if(!record || typeof record!=='object')return '';
  return specificationValue(record.company||record.companyName||record.businessName||'');
}
function customerBrowserAddressValue(record){
  if(!record || typeof record!=='object')return '';
  const line1=specificationValue(record.addressLine1);
  const line2=specificationValue(record.addressLine2);
  const locality=[specificationValue(record.suburbLocality),specificationValue(record.cityTown),specificationValue(record.regionState),specificationValue(record.postcode)].filter(Boolean).join(', ');
  const country=specificationValue(record.country);
  return [line1,line2,locality,country].filter(Boolean).join(' • ');
}
function customerBrowserDetailRows(record){
  const rows=[];
  appendSpecRow(rows,'Customer Name',record&&record.customerName);
  appendSpecRow(rows,'Company',customerBrowserCompanyValue(record));
  appendSpecRow(rows,'Phone',record&&record.phone);
  appendSpecRow(rows,'Email',record&&record.email);
  appendSpecRow(rows,'Address',customerBrowserAddressValue(record));
  return rows;
}
function customerBrowserGroups(){
  const groups=customerSavedGroups('',{includeInvalidCustomers:false}).map((group)=>{
    const primary=customerBrowserPrimaryRecord(group);
    return {
      ...group,
      company:customerBrowserCompanyValue(primary),
    };
  });
  const searchKey=normalizeNameKey(customerBrowserSearch);
  if(!searchKey)return groups;
  return groups.filter((group)=>{
    if(normalizeNameKey(group.name).includes(searchKey))return true;
    if(normalizeNameKey(group.company).includes(searchKey))return true;
    return false;
  });
}
function customerBrowserIsGenericTitle(value){
  const normalized=normalizeNameKey(value);
  return normalized==='untitled job' || normalized==='untitled build';
}
function customerBrowserDisplayTitle(record){
  const buildName=specificationValue(record&&record.buildName);
  if(buildName && !customerBrowserIsGenericTitle(buildName))return buildName;
  const blankName=specificationValue(record&&record.blankName);
  if(blankName)return blankName;
  const maker=specificationValue(record&&record.blankMaker);
  const series=specificationValue(record&&record.blankSeries);
  const rodDescription=[maker,series].filter(Boolean).join(' ').trim();
  if(rodDescription)return rodDescription;
  return 'Saved Job';
}
function customerBrowserStatusLabel(entry,record){
  const source=String(entry&&entry.source||'quote');
  if(source==='build')return 'Saved Build';
  const status=normalizeQuoteStatus((record&&record.quoteStatus)||(record&&record.status));
  const statusMap={
    draft:'Draft Quote',
    sent:'Sent Quote',
    revised:'Revised Quote',
    declined:'Declined Quote',
    expired:'Expired Quote',
    accepted:'Accepted Quote',
  };
  return statusMap[status]||'Saved Quote';
}
function customerBrowserLayoutElement(){
  return document.querySelector('#customersScreen .customers-browser__layout');
}
function setCustomerBrowserEmptyLayout(isEmpty){
  const layout=customerBrowserLayoutElement();
  if(layout)layout.classList.toggle('is-empty',isEmpty);
}
function customerBrowserStartNewCustomer(){
  openCustomerFinderSheet('new-build');
  setCustomerFinderNewBuildStep('add');
}
function customerBrowserClearSearch(){
  customerBrowserSearch='';
  customerBrowserSelectedKey='';
  customerBrowserEditMode=false;
  const searchInput=$('customerBrowserSearchInput');
  if(searchInput)searchInput.value='';
}
function renderCustomerBrowser(){
  const listHost=$('customerBrowserList');
  const detailHost=$('customerBrowserDetail');
  if(!listHost || !detailHost)return;
  const groups=customerBrowserGroups();
  const hasAnyCustomers=customerSavedGroups('',{includeInvalidCustomers:false}).length>0;
  const hasSearchQuery=specificationValue(customerBrowserSearch).length>0;
  if(!groups.length){
    customerBrowserSelectedKey='';
    customerBrowserEditMode=false;
    setCustomerBrowserEmptyLayout(true);
    listHost.innerHTML='';
    detailHost.hidden=false;
    if(hasSearchQuery && hasAnyCustomers){
      detailHost.innerHTML=`
        <section class="customers-browser__empty-state" aria-live="polite">
          <p>No customers matched that search. Try another name or company.</p>
          <div class="customers-browser__empty-actions">
            <button class="ghost-action" type="button" data-customer-browser-action="clear-search">Clear Search</button>
          </div>
        </section>
      `;
      return;
    }
    detailHost.innerHTML=`
      <section class="customers-browser__empty-state" aria-live="polite">
        <p>No customers yet. Start a new build to attach your first customer.</p>
        <div class="customers-browser__empty-actions">
          <button class="primary-action" type="button" data-customer-browser-action="new-build">New Build</button>
        </div>
      </section>
    `;
    return;
  }
  setCustomerBrowserEmptyLayout(false);
  if(!groups.some((group)=>group.key===customerBrowserSelectedKey)){
    customerBrowserSelectedKey=groups[0].key;
    customerBrowserEditMode=false;
  }
  listHost.innerHTML=groups.map((group)=>{
    const isActive=group.key===customerBrowserSelectedKey;
    const companyLine=group.company?`<small class="customers-browser__company">${escapeHtml(group.company)}</small>`:'';
    return `<div class="component-sheet__row customers-browser__row"><button class="component-sheet__option customers-browser__option${isActive?' is-active-customer':''}" type="button" data-customer-browser-select="${escapeHtml(group.key)}"><span class="customers-browser__name">${escapeHtml(group.name)}</span>${companyLine}</button></div>`;
  }).join('');
  const selected=groups.find((group)=>group.key===customerBrowserSelectedKey)||groups[0];
  if(!selected){
    detailHost.hidden=true;
    detailHost.innerHTML='';
    return;
  }
  const primary=customerBrowserPrimaryRecord(selected);
  const detailRows=customerBrowserDetailRows(primary);
  const detailMarkup=detailRows.length
    ? detailRows.map((row)=>`<div class="customers-browser__fact-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join('')
    : '<div class="component-sheet__empty">No customer details available yet.</div>';
  const jobsMarkup=selected.builds.length
    ? selected.builds.map((entry)=>{
      const source='build';
      const index=Number(entry&&entry.index);
      const record=entry&&entry.record?entry.record:{};
      const title=customerBrowserDisplayTitle(record);
      const statusText=customerBrowserStatusLabel(entry,record);
      const savedAt=record.savedAt?formatDateDisplay(record.savedAt,{includeTime:true}):'Unknown save time';
      const meta=[statusText,`Saved ${savedAt}`].join(' • ');
      return `<button class="customers-browser__job-row" type="button" data-customer-browser-open-source="${escapeHtml(source)}" data-customer-browser-open-index="${index}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></button>`;
    }).join('')
    : '<div class="component-sheet__empty">No saved jobs for this customer.</div>';
  detailHost.hidden=false;
  detailHost.innerHTML=`
    <header class="customers-browser__detail-head">
      <h3>${escapeHtml(selected.name)}</h3>
      <p>Customer details and active build history.</p>
    </header>
    <div class="customers-browser__detail-actions">
      <button class="primary-action" type="button" data-customer-browser-action="start-build">New Build for Customer</button>
      <button class="ghost-action" type="button" data-customer-browser-action="toggle-edit">${customerBrowserEditMode?'Cancel Edit':'Edit Details'}</button>
    </div>
    <section class="customers-browser__facts" aria-label="Customer details">${detailMarkup}</section>
    <form id="customerBrowserEditForm" class="customers-browser__edit-form" ${customerBrowserEditMode?'':'hidden'}>
      <label class="customers-browser__edit-full"><span>Company</span><input id="customerBrowserCompany" type="text" value="${escapeHtml(customerBrowserCompanyValue(primary))}" /></label>
      <label><span>Phone</span><input id="customerBrowserPhone" type="text" value="${escapeHtml(primary.phone||'')}" /></label>
      <label><span>Email</span><input id="customerBrowserEmail" type="email" value="${escapeHtml(primary.email||'')}" /></label>
      <label class="customers-browser__edit-full"><span>Address Line 1</span><input id="customerBrowserAddress1" type="text" value="${escapeHtml(primary.addressLine1||'')}" /></label>
      <label class="customers-browser__edit-full"><span>Address Line 2</span><input id="customerBrowserAddress2" type="text" value="${escapeHtml(primary.addressLine2||'')}" /></label>
      <label><span>Suburb / Locality</span><input id="customerBrowserSuburb" type="text" value="${escapeHtml(primary.suburbLocality||'')}" /></label>
      <label><span>City / Town</span><input id="customerBrowserCity" type="text" value="${escapeHtml(primary.cityTown||'')}" /></label>
      <label><span>Region / State</span><input id="customerBrowserRegion" type="text" value="${escapeHtml(primary.regionState||'')}" /></label>
      <label><span>Postcode / ZIP</span><input id="customerBrowserPostcode" type="text" value="${escapeHtml(primary.postcode||'')}" /></label>
      <label class="customers-browser__edit-full"><span>Country</span><input id="customerBrowserCountry" type="text" value="${escapeHtml(primary.country||'New Zealand')}" /></label>
      <div class="customers-browser__edit-actions">
        <button class="ghost-action" type="button" data-customer-browser-action="toggle-edit">Cancel</button>
        <button class="primary-action" type="button" data-customer-browser-action="save-edit">Save Details</button>
      </div>
    </form>
    <section class="customers-browser__jobs" aria-label="Saved builds">
      <h4>Saved Jobs</h4>
      <div class="customers-browser__jobs-list">${jobsMarkup}</div>
    </section>
  `;
}
function customerBrowserCurrentGroup(){
  return customerBrowserGroups().find((group)=>group.key===customerBrowserSelectedKey)||null;
}
function startNewBuildForCustomerBrowserSelection(){
  const group=customerBrowserCurrentGroup();
  if(!group)return;
  const source=customerBrowserPrimaryRecord(group);
  runNewBuildStartAction(()=>{
    startFreshQuoteForCustomer(source);
  });
}
function saveCustomerBrowserDetails(){
  const group=customerBrowserCurrentGroup();
  if(!group)return;
  const customerKey=group.key;
  const nextValues={
    company:String(($('customerBrowserCompany')&&$('customerBrowserCompany').value)||'').trim(),
    phone:String(($('customerBrowserPhone')&&$('customerBrowserPhone').value)||'').trim(),
    email:String(($('customerBrowserEmail')&&$('customerBrowserEmail').value)||'').trim(),
    addressLine1:String(($('customerBrowserAddress1')&&$('customerBrowserAddress1').value)||'').trim(),
    addressLine2:String(($('customerBrowserAddress2')&&$('customerBrowserAddress2').value)||'').trim(),
    suburbLocality:String(($('customerBrowserSuburb')&&$('customerBrowserSuburb').value)||'').trim(),
    cityTown:String(($('customerBrowserCity')&&$('customerBrowserCity').value)||'').trim(),
    regionState:String(($('customerBrowserRegion')&&$('customerBrowserRegion').value)||'').trim(),
    postcode:String(($('customerBrowserPostcode')&&$('customerBrowserPostcode').value)||'').trim(),
    country:String(($('customerBrowserCountry')&&$('customerBrowserCountry').value)||'').trim()||'New Zealand',
  };
  const quoteRecords=savedQuoteRecords();
  const buildRecords=savedBuildRecords();
  let quoteChanged=false;
  let buildChanged=false;
  quoteRecords.forEach((record)=>{
    if(!customerFinderMatchesKey(customerKey,record&&record.customerName))return;
    Object.assign(record,nextValues);
    quoteChanged=true;
  });
  buildRecords.forEach((record)=>{
    if(!customerFinderMatchesKey(customerKey,record&&record.customerName))return;
    Object.assign(record,nextValues);
    buildChanged=true;
  });
  if(quoteChanged)Store.set('klabs-workshop-quotes',quoteRecords);
  if(buildChanged)Store.set('klabs-workshop-builds',buildRecords);
  if(customerFinderMatchesKey(customerKey,quote.customerName)){
    Object.assign(quote,nextValues);
    saveQuoteCurrent();
    renderWorkshopQuote();
  }
  customerBrowserEditMode=false;
  renderCustomerBrowser();
}
function bindCustomerBrowserControls(){
  const searchInput=$('customerBrowserSearchInput');
  if(searchInput){
    searchInput.addEventListener('input',()=>{
      customerBrowserSearch=searchInput.value||'';
      customerBrowserSelectedKey='';
      customerBrowserEditMode=false;
      renderCustomerBrowser();
    });
  }
  const listHost=$('customerBrowserList');
  if(listHost){
    listHost.addEventListener('click',(event)=>{
      const button=event.target.closest('[data-customer-browser-select]');
      if(!button)return;
      customerBrowserSelectedKey=button.getAttribute('data-customer-browser-select')||'';
      customerBrowserEditMode=false;
      renderCustomerBrowser();
    });
  }
  const detailHost=$('customerBrowserDetail');
  if(detailHost){
    detailHost.addEventListener('click',(event)=>{
      const actionButton=event.target.closest('[data-customer-browser-action]');
      if(actionButton){
        const action=actionButton.getAttribute('data-customer-browser-action')||'';
        if(action==='add-new'){
          customerBrowserStartNewCustomer();
          return;
        }
        if(action==='new-build'){
          openCustomerFinderSheet('new-build');
          return;
        }
        if(action==='clear-search'){
          customerBrowserClearSearch();
          renderCustomerBrowser();
          return;
        }
        if(action==='start-build'){
          startNewBuildForCustomerBrowserSelection();
          return;
        }
        if(action==='toggle-edit'){
          customerBrowserEditMode=!customerBrowserEditMode;
          renderCustomerBrowser();
          return;
        }
        if(action==='save-edit'){
          saveCustomerBrowserDetails();
          return;
        }
      }
      const openButton=event.target.closest('[data-customer-browser-open-source][data-customer-browser-open-index]');
      if(openButton){
        const source=openButton.getAttribute('data-customer-browser-open-source')||'quote';
        const index=Number(openButton.getAttribute('data-customer-browser-open-index'));
        openSavedBuildRecord(source,index);
      }
    });
  }
}
function savedBuildSearchText(entry){
  const record=entry&&entry.record?entry.record:{};
  return [record.customerName,record.buildName]
    .map((value)=>String(value||''))
    .join(' ')
    .toLowerCase();
}
function savedBuildDisplayCustomerName(record){
  return specificationValue(record&&record.customerName)||'Unassigned';
}
function savedBuildDisplayStatus(record){
  const rawStatus=specificationValue((record&&record.quoteStatus)||(record&&record.status));
  if(!rawStatus)return '';
  const normalized=normalizeQuoteStatus(rawStatus);
  return normalized==='accepted'?'Accepted':normalized.replace(/^./,(letter)=>letter.toUpperCase());
}
function savedBuildDisplayDate(value){
  return formatDateDisplay(value,{includeTime:true});
}
function savedBuildRowMarkup(entry){
  const record=entry.record;
  const customerName=savedBuildDisplayCustomerName(record);
  const statusText=savedBuildDisplayStatus(record);
  const updatedAtText=savedBuildDisplayDate(record.updatedAt||record.savedAt);
  const buildName=specificationValue(record.buildName);
  const buildNameMarkup=buildName?`<p class="saved-build-card__title">${escapeHtml(buildName)}</p>`:'';
  const statusMarkup=statusText?`<div class="saved-build-card__meta"><span>Status</span><strong>${escapeHtml(statusText)}</strong></div>`:'';
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  return `<article class="saved-build-card" data-build-row data-build-source="${source}" data-build-index="${index}"><button class="saved-build-card__open" type="button" data-build-action="open" data-build-source="${source}" data-build-index="${index}" aria-label="Open saved build for ${escapeHtml(customerName)}"><div class="saved-build-card__head"><strong>${escapeHtml(customerName)}</strong>${buildNameMarkup}</div>${statusMarkup}<div class="saved-build-card__meta"><span>Last Edited</span><strong>${escapeHtml(updatedAtText)}</strong></div></button><div class="saved-build-card__actions">${savedBuildRowMenuMarkup(entry,customerName)}</div></article>`;
}
function savedBuildRowMenuMarkup(entry,title){
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  const sourceLabel=entry.source==='build'?'build':'quote';
  return `<button class="component-sheet__menu-trigger blank-card__menu-trigger" type="button" data-build-menu-trigger data-build-source="${source}" data-build-index="${index}" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${escapeHtml(title||sourceLabel)}">⋯</button><div class="component-picker-menu blank-card__menu" hidden data-build-menu data-build-source="${source}" data-build-index="${index}"><button class="component-picker-menu__item" data-build-action="delete" data-build-source="${source}" data-build-index="${index}" type="button">Delete</button></div>`;
}
function hideSavedBuildRowMenu(){
  document.querySelectorAll('[data-build-menu]').forEach((menu)=>{menu.hidden=true;});
  document.querySelectorAll('[data-build-menu-trigger]').forEach((trigger)=>{trigger.setAttribute('aria-expanded','false');});
}
function toggleSavedBuildRowMenu(triggerEl,source,index){
  const card=triggerEl && triggerEl.closest('[data-build-row]');
  const menu=card && card.querySelector('[data-build-menu]');
  if(!card || !menu)return;
  const activeSource=menu.getAttribute('data-build-source')||'';
  const activeIndex=Number(menu.getAttribute('data-build-index'));
  const alreadyOpen=!menu.hidden && activeSource===String(source||'') && activeIndex===Number(index);
  hideSavedBuildRowMenu();
  if(alreadyOpen)return;
  positionRowMenu(menu,triggerEl,card,164);
  menu.hidden=false;
  triggerEl.setAttribute('aria-expanded','true');
}
function deleteSavedEntryBySource(source,index){
  const storageKey=source==='build'?'klabs-workshop-builds':'klabs-workshop-quotes';
  const records=Array.isArray(Store.get(storageKey,[]))?Store.get(storageKey,[]):[];
  const numericIndex=Number(index);
  if(!Number.isInteger(numericIndex) || numericIndex<0 || numericIndex>=records.length)return false;
  records.splice(numericIndex,1);
  Store.set(storageKey,records);
  return true;
}
function requestDeleteSavedBuildRecord(source,index){
  const selected=getSavedEntryBySource(source,index);
  if(!selected)return;
  const label=source==='build'?'build':'quote';
  openConfirmDialog({
    title:`Delete this ${label}?`,
    message:'This action cannot be undone.',
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:'Delete',kind:'danger'}]
  },(action)=>{
    if(action!=='delete')return;
    if(!deleteSavedEntryBySource(source,index))return;
    if(activeSavedBuildRef && activeSavedBuildRef.source===source && activeSavedBuildRef.index===Number(index)){
      clearActiveSavedBuildRef();
    }
    renderBuilds();
    renderCustomerFinder();
    renderCustomerBrowser();
  });
}
function getSavedEntryBySource(source,index){
  const storageKey=source==='build'?'klabs-workshop-builds':'klabs-workshop-quotes';
  const records=Array.isArray(Store.get(storageKey,[]))?Store.get(storageKey,[]):[];
  const numericIndex=Number(index);
  if(!Number.isInteger(numericIndex) || numericIndex<0 || numericIndex>=records.length)return null;
  return normalizeQuote(records[numericIndex]);
}
function openSavedBuildRecord(source,index){
  const selected=getSavedEntryBySource(source,index);
  if(!selected)return;
  setActiveSavedBuildRef(source,index,selected);
  quote=normalizeQuote(selected);
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  collapseWorkshopSections();
  preserveWorkshopQuoteOnEntry=true;
  goScreen('workshopScreen');
  window.setTimeout(()=>focusWorkshopSection(nextWorkshopSectionId()),36);
}
function duplicateSavedBuildRecord(source,index){
  const selected=getSavedEntryBySource(source,index);
  if(!selected)return;
  clearActiveSavedBuildRef();
  quote=normalizeQuote({
    ...selected,
    buildNumber:'',
    quoteStatus:'draft',
    savedAt:'',
  });
  saveQuoteCurrent();
  markQuoteDirty();
  renderWorkshopQuote();
  collapseWorkshopSections();
  preserveWorkshopQuoteOnEntry=true;
  goScreen('workshopScreen');
  window.setTimeout(()=>focusWorkshopSection(nextWorkshopSectionId()),36);
}
function renderBuilds(){
  const host=$('buildCards');
  if(!host)return;
  hideSavedBuildRowMenu();
  const query=String(buildsSearch||'').trim().toLowerCase();
  const records=savedBuildRecords()
    .map((record,index)=>({source:'build',index,record:normalizeQuote(record)}))
    .sort((left,right)=>{
      const leftDate=Date.parse(left.record&&left.record.updatedAt||left.record&&left.record.savedAt||'')||0;
      const rightDate=Date.parse(right.record&&right.record.updatedAt||right.record&&right.record.savedAt||'')||0;
      return rightDate-leftDate;
    })
    .filter((entry)=>!query || savedBuildSearchText(entry).includes(query));
  if(!records.length){
    host.innerHTML='<section class="saved-builds-empty"><h3>No saved jobs yet.</h3><p>Create a new build to start tracking workshop work.</p><button id="savedBuildsEmptyNewBuildBtn" class="primary-action" type="button">New Build</button></section>';
    const emptyButton=$('savedBuildsEmptyNewBuildBtn');
    if(emptyButton){
      emptyButton.addEventListener('click',()=>{
        startNewBuildFlow();
      });
    }
    return;
  }
  host.innerHTML=records.map(savedBuildRowMarkup).join('');
}
function ensureConfirmSheet(){
  if($('confirmSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='confirmSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-confirm-action="cancel"></div>
    <section class="component-sheet__panel" role="dialog" aria-modal="true" aria-label="Confirmation dialog">
      <header class="component-sheet__header">
        <h2 id="confirmSheetTitle">Confirm</h2>
        <button class="component-sheet__close" type="button" data-confirm-action="cancel" aria-label="Close dialog">×</button>
      </header>
      <div class="component-sheet__body">
        <p id="confirmSheetMessage" class="component-sheet__empty" style="padding:2px 0 10px;text-transform:none;letter-spacing:0;font-size:12px;color:#c9c3b8"></p>
        <div id="confirmSheetActions" class="quote-preview-actions"></div>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);
  sheet.addEventListener('pointerdown',(event)=>{
    const actionButton=event.target.closest('[data-confirm-action]');
    if(!actionButton)return;
    const action=actionButton.getAttribute('data-confirm-action')||'cancel';
    event.preventDefault();
    event.stopPropagation();
    closeConfirmDialog(action);
  },true);
  sheet.addEventListener('click',(event)=>{
    const actionButton=event.target.closest('[data-confirm-action]');
    if(!actionButton)return;
    if(actionButton.getAttribute('data-confirm-action')==='cancel' && event.target.closest('.component-sheet__scrim'))return;
    const action=actionButton.getAttribute('data-confirm-action')||'cancel';
    closeConfirmDialog(action);
  });
}
function openConfirmDialog(config,onAction){
  ensureConfirmSheet();
  const titleEl=$('confirmSheetTitle');
  const messageEl=$('confirmSheetMessage');
  const actionsEl=$('confirmSheetActions');
  if(titleEl)titleEl.textContent=config&&config.title?config.title:'Confirm';
  if(messageEl)messageEl.textContent=config&&config.message?config.message:'Please confirm this action.';
  if(actionsEl){
    const actions=(config&&Array.isArray(config.actions)&&config.actions.length)?config.actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'confirm',label:'Continue',kind:'primary'}];
    actionsEl.innerHTML=actions.map((action)=>`<button type="button" class="${action.kind==='primary'?'primary-action':'ghost-action'}${action.kind==='danger'?' component-sheet__danger':''}" data-confirm-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`).join('');
  }
  activeConfirmHandler=typeof onAction==='function'?onAction:null;
  $('confirmSheet').hidden=false;
  lockModalLayer(document.activeElement);
}
function closeConfirmDialog(action){
  const handler=activeConfirmHandler;
  activeConfirmHandler=null;
  const sheet=$('confirmSheet');
  if(sheet)sheet.hidden=true;
  unlockModalLayer({restoreFocus:true});
  if(handler)handler(action||'cancel');
}
function requestDeleteBlank(blank){
  const refs=blankReferenceSummary(blank);
  if(refs.total>0){
    openConfirmDialog({
      title:'Blank In Use',
      message:'This blank is referenced by current or saved quotes/builds. Deletion is disabled. Archive this blank instead?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'archive',label:'Archive',kind:'primary'}]
    },(action)=>{
      if(action==='archive'){
        blank.archived=true;
        saveBlankLibrary();
        renderBlanks();
        renderChoicePickerOptions($('choicePickerSearch')?$('choicePickerSearch').value:'');
      }
    });
    return;
  }
  openConfirmDialog({
    title:'Delete Blank',
    message:'Delete this blank from the library?',
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:'Delete',kind:'danger'}]
  },(action)=>{
    if(action==='delete'){
      blanks=blanks.filter((item)=>item.id!==blank.id);
      saveBlankLibrary();
      renderBlanks();
      renderChoicePickerOptions($('choicePickerSearch')?$('choicePickerSearch').value:'');
    }
  });
}
function nextBuildNumber(){
  const seq=(Store.get('klabs-build-seq',900)||900)+1;
  Store.set('klabs-build-seq',seq);
  return 'BUILD-'+seq;
}
function clampValue(value,min,max){const parsed=Number(value);if(!Number.isFinite(parsed))return min;return Math.min(max,Math.max(min,Math.round(parsed)))}
function buildWheels(){return null}
function isLayoutLocked(){return !!state.locked;}
function setLayoutLocked(nextLocked){
  const locked=typeof nextLocked==='boolean'?nextLocked:!state.locked;
  if(state.locked===locked)return;
  state.locked=locked;
  save();
  render();
}
function persistLayoutControlState(){
  if(!pendingControlPersist)return;
  pendingControlPersist=false;
  save();
}
function focusLayoutField(field){
  const target=document.querySelector(`.layout-control-card__value[data-field="${field}"]`);
  if(!target || !target.isContentEditable)return;
  target.focus();
}
function clearLayoutFieldFocusSelection(){
  const activeEl=document.activeElement;
  if(activeEl && typeof activeEl.closest==='function' && activeEl.closest('#layoutScreen .layout-control-card__value[data-field]')){
    activeEl.blur();
  }
  const selection=window.getSelection?window.getSelection():null;
  if(selection && selection.rangeCount>0){
    selection.removeAllRanges();
  }
}
function nextLayoutField(field){
  const index=layoutFieldOrder.indexOf(field);
  if(index<0)return layoutFieldOrder[0];
  return layoutFieldOrder[(index+1)%layoutFieldOrder.length];
}
function setControlValue(field,rawValue,options){
  const cfg=controlMeta[field];
  if(!cfg)return;
  const opts=options||{};
  if(isLayoutLocked() && !opts.force)return;
  const parsed=field==='guideCount'?Number(rawValue):parseMeasurementInputValue(rawValue);
  if(!Number.isFinite(parsed))return;
  const nextValue=clampValue(parsed,cfg.min,cfg.max);
  if(state[cfg.key]===nextValue){
    if(opts.persist){save();}
    return;
  }
  state[cfg.key]=nextValue;
  if(opts.persist===false){
    pendingControlPersist=true;
  }else{
    pendingControlPersist=false;
    save();
  }
  render();
}
function changeControlValue(field,direction,options){
  const cfg=controlMeta[field];
  if(!cfg)return;
  setControlValue(field,state[cfg.key]+(direction*cfg.step),options);
}
function stopHold(){
  if(holdDelayTimer){clearTimeout(holdDelayTimer);holdDelayTimer=null;}
  if(holdTimer){clearInterval(holdTimer);holdTimer=null;}
  holdContext=null;
  persistLayoutControlState();
}
function startHold(field,direction,button){
  if(isLayoutLocked())return;
  stopHold();
  holdContext={field,direction,button,repeating:false};
  holdDelayTimer=window.setTimeout(()=>{
    if(!holdContext || holdContext.button!==button)return;
    holdContext.repeating=true;
    changeControlValue(field,direction,{persist:false});
    holdTimer=window.setInterval(()=>changeControlValue(field,direction,{persist:false}),135);
  },500);
}
function bindLayoutControls(){
  const statusBadge=$('layoutStatusBadge');
  if(statusBadge && statusBadge.getAttribute('data-layout-lock-bound')!=='true'){
    statusBadge.setAttribute('data-layout-lock-bound','true');
    statusBadge.setAttribute('role','button');
    statusBadge.setAttribute('tabindex','0');
    statusBadge.setAttribute('aria-pressed',String(!!state.locked));
    statusBadge.addEventListener('click',()=>setLayoutLocked());
    statusBadge.addEventListener('keydown',(event)=>{
      if(event.key==='Enter' || event.key===' '){
        event.preventDefault();
        setLayoutLocked();
      }
    });
  }

  const guideSpacingCards=$('guideSpacingCards');
  if(guideSpacingCards && guideSpacingCards.getAttribute('data-layout-row-bound')!=='true'){
    guideSpacingCards.setAttribute('data-layout-row-bound','true');
    guideSpacingCards.addEventListener('click',(event)=>{
      const row=event.target.closest('[data-guide-index]');
      if(!row)return;
      const index=Number(row.getAttribute('data-guide-index'));
      if(!Number.isFinite(index) || state.workshopIndex===index)return;
      state.workshopIndex=index;
      save();
      render();
    });
    guideSpacingCards.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      const row=event.target.closest('[data-guide-index]');
      if(!row)return;
      event.preventDefault();
      const index=Number(row.getAttribute('data-guide-index'));
      if(!Number.isFinite(index) || state.workshopIndex===index)return;
      state.workshopIndex=index;
      save();
      render();
    });
  }

  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(!field || !controlMeta[field])return;
    const tabOrder=layoutFieldOrder.indexOf(field);
    if(tabOrder>=0){el.tabIndex=tabOrder+1;}
    el.addEventListener('focus',()=>{
      if(isLayoutLocked()){
        el.blur();
        return;
      }
      const stateValue=state[controlMeta[field].key];
      const value=field==='guideCount'?String(stateValue):formatMeasurementNumber(stateValue,{decimalsMetric:1,decimalsImperial:2});
      if(el.textContent!==value){el.textContent=value;}
      const range=document.createRange();
      range.selectNodeContents(el);
      const selection=window.getSelection();
      if(selection){selection.removeAllRanges();selection.addRange(range);}
    });
    el.addEventListener('blur',()=>{
      const raw=(el.textContent||'').trim();
      setControlValue(field,raw,{persist:true});
    });
    el.addEventListener('beforeinput',(event)=>{
      if(event.inputType==='deleteContentBackward' || event.inputType==='deleteContentForward' || event.inputType==='insertFromPaste')return;
      if(!event.data)return;
      if(field==='guideCount'){
        if(/[^0-9]/.test(event.data)){event.preventDefault();}
        return;
      }
      const fractionalActive=activeMeasurementUnits()==='imperial' && activeImperialDisplay()==='fractional';
      const disallowed=fractionalActive?/[^0-9./\s-]/:/[^0-9.-]/;
      if(disallowed.test(event.data)){event.preventDefault();}
    });
    el.addEventListener('keydown',(event)=>{
      if(event.key==='ArrowUp'){event.preventDefault();changeControlValue(field,1,{persist:true});return;}
      if(event.key==='ArrowDown'){event.preventDefault();changeControlValue(field,-1,{persist:true});return;}
      if(event.key==='Enter'){
        event.preventDefault();
        el.blur();
        focusLayoutField(nextLayoutField(field));
      }
      if(event.key==='Escape'){
        event.preventDefault();
        const stateValue=state[controlMeta[field].key];
        el.textContent=field==='guideCount'?String(stateValue):formatMeasurementNumber(stateValue,{decimalsMetric:1,decimalsImperial:2});
        el.blur();
      }
    });
  });
  document.querySelectorAll('.layout-control-card__button[data-action]').forEach((button)=>{
    if(button.getAttribute('data-layout-control-bound')==='true')return;
    button.setAttribute('data-layout-control-bound','true');
    const field=button.getAttribute('data-target-field');
    if(!field || !controlMeta[field])return;
    const direction=button.getAttribute('data-action')==='increment'?1:-1;
    let pointerHandled=false;
    button.style.touchAction='manipulation';
    button.addEventListener('pointerdown',(event)=>{
      if(event.button!==0 || !event.isPrimary)return;
      pointerHandled=false;
      event.preventDefault();
      startHold(field,direction,button);
    });
    const finishPress=(event)=>{
      if(holdContext && holdContext.button===button && !holdContext.repeating){
        if(isLayoutLocked()){
          event.preventDefault();
          stopHold();
          return;
        }
        event.preventDefault();
        pointerHandled=true;
        changeControlValue(field,direction,{persist:true});
      }
      stopHold();
    };
    button.addEventListener('pointerup',finishPress);
    button.addEventListener('pointercancel',stopHold);
    button.addEventListener('pointerleave',(event)=>{
      if(holdContext && holdContext.repeating && holdContext.button===button){
        stopHold();
        return;
      }
      if(holdContext && holdContext.button===button && !holdContext.repeating){
        stopHold();
      }
    });
    button.addEventListener('click',(event)=>{
      event.preventDefault();
      if(pointerHandled){
        pointerHandled=false;
        return;
      }
      if(isLayoutLocked())return;
      changeControlValue(field,direction,{persist:true});
    });
    button.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      event.preventDefault();
      if(isLayoutLocked())return;
      changeControlValue(field,direction,{persist:true});
    });
  });
}
function workshopInputMap(){
  return[
    ['quoteCustomerName','customerName'],['quoteCustomerPhone','phone'],['quoteCustomerEmail','email'],
    ['quoteAddressLine1','addressLine1'],['quoteAddressLine2','addressLine2'],['quoteSuburbLocality','suburbLocality'],['quoteCityTown','cityTown'],['quoteRegionState','regionState'],['quotePostcode','postcode'],['quoteCountry','country'],
    ['quoteBuildName','buildName'],['quoteNotes','notes'],
    ['quoteBlankName','blankName'],['quoteBlankMaker','blankMaker'],['quoteBlankSeries','blankSeries'],['quoteBlankLength','blankLength'],['quoteBlankPower','blankPower'],['quoteBlankAction','blankAction'],['quoteBlankPieces','blankPieces'],
    ['quoteBlankCost','blankCost'],['quoteLabourRate','labourRate'],['quoteLabourHours','labourHours']
  ];
}
function measurementPlaceholderValue(valueMm){
  if(activeMeasurementUnits()==='imperial'){
    if(activeImperialDisplay()==='fractional'){
      return `${formatMeasurementNumber(valueMm,{maxImperialDenominator:32})} in`;
    }
    return `${formatMeasurementNumber(valueMm,{decimalsImperial:2,forceDecimal:true})} in`;
  }
  return `${Math.round(numberOrZero(valueMm))} mm`;
}
function refreshMeasurementPlaceholders(){
  const rearGrip=measurementPlaceholderValue(280);
  const lowerGrip=measurementPlaceholderValue(90);
  const foreGrip=measurementPlaceholderValue(70);
  const reelSeat=measurementPlaceholderValue(350);
  const reelSeatInput=$('quoteSpecReelSeatPosition');
  const rearGripInput=$('quoteSpecRearGripLength');
  const lowerGripInput=$('quoteSpecGripBelowReelSeatLength');
  const foreGripInput=$('quoteSpecForeGripLength');
  if(reelSeatInput)reelSeatInput.placeholder=`e.g. ${reelSeat} from butt`;
  if(rearGripInput)rearGripInput.placeholder=`e.g. ${rearGrip}`;
  if(lowerGripInput)lowerGripInput.placeholder=`e.g. ${lowerGrip}`;
  if(foreGripInput)foreGripInput.placeholder=`e.g. ${foreGrip}`;
}
function bindBuildSpecificationInputs(){
  BUILD_SPEC_FIELDS.forEach((field)=>{
    const el=$(field.id);
    if(!el)return;
    const onSpecUpdate=()=>{
      quote.buildSpecifications[field.key]=el.value;
      saveQuoteCurrent();
      markQuoteDirty();
    };
    el.addEventListener('input',onSpecUpdate);
    el.addEventListener('change',onSpecUpdate);
  });
}
function renderBuildSpecificationInputs(){
  BUILD_SPEC_FIELDS.forEach((field)=>{
    const el=$(field.id);
    if(!el)return;
    if(document.activeElement===el)return;
    el.value=quote.buildSpecifications[field.key]||'';
  });
}
function workshopTopUiOffset(){
  const candidates=['.topbar','.live-build-status','.offline-ready-status'];
  let maxBottom=0;
  candidates.forEach((selector)=>{
    const el=document.querySelector(selector);
    if(!el || el.hidden)return;
    const styles=getComputedStyle(el);
    if(styles.display==='none' || styles.visibility==='hidden')return;
    if(styles.position!=='fixed' && styles.position!=='sticky')return;
    const rect=el.getBoundingClientRect();
    if(rect.bottom<=0)return;
    if(rect.top>4)return;
    maxBottom=Math.max(maxBottom,rect.bottom);
  });
  return maxBottom;
}
function scrollWorkshopSectionIntoView(section){
  if(!section)return;
  const reduceMotion=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const topGap=12;
  const uiOffset=workshopTopUiOffset();
  const targetTop=window.scrollY+section.getBoundingClientRect().top-uiOffset-topGap;
  const maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
  const clamped=Math.max(0,Math.min(targetTop,maxScroll));
  const startY=window.scrollY;
  const useSmooth=!reduceMotion;
  window.scrollTo({top:clamped,behavior:useSmooth?'smooth':'auto'});
  if(useSmooth && Math.abs(clamped-startY)>2){
    window.setTimeout(()=>{
      if(Math.abs(window.scrollY-startY)<1){
        window.scrollTo({top:clamped,behavior:'auto'});
      }
    },180);
  }
}
function updateWorkshopBackToTopVisibility(){
  const button=$('workshopBackToTopBtn');
  if(!button)return;
  const workshop=$('workshopScreen');
  const workshopActive=!!(workshop && workshop.classList.contains('active'));
  const blockedByModal=document.body.classList.contains('component-sheet-open');
  const shouldShow=workshopActive && !blockedByModal && window.scrollY>320;
  button.hidden=!shouldShow;
  button.classList.toggle('is-visible',shouldShow);
}
function scrollToWorkshopTop(){
  const workshop=$('workshopScreen');
  if(!workshop)return;
  const reduceMotion=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uiOffset=workshopTopUiOffset();
  const targetTop=window.scrollY+workshop.getBoundingClientRect().top-uiOffset-8;
  const maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
  const clamped=Math.max(0,Math.min(targetTop,maxScroll));
  const startY=window.scrollY;
  const useSmooth=!reduceMotion;
  window.scrollTo({top:clamped,behavior:useSmooth?'smooth':'auto'});
  if(useSmooth && Math.abs(clamped-startY)>2){
    window.setTimeout(()=>{
      if(Math.abs(window.scrollY-startY)<1){
        window.scrollTo({top:clamped,behavior:'auto'});
      }
    },180);
  }
}
function startWorkshopBackToTopWatcher(){
  if(workshopBackToTopRafId)return;
  const tick=()=>{
    const scrollY=Math.round(window.scrollY||window.pageYOffset||0);
    if(scrollY!==workshopBackToTopLastScrollY){
      workshopBackToTopLastScrollY=scrollY;
      updateWorkshopBackToTopVisibility();
    }
    workshopBackToTopRafId=window.requestAnimationFrame(tick);
  };
  workshopBackToTopRafId=window.requestAnimationFrame(tick);
}
function bindWorkshopBackToTopControl(){
  if(workshopBackToTopBound)return;
  workshopBackToTopBound=true;
  const button=$('workshopBackToTopBtn');
  if(button){
    button.addEventListener('click',()=>{
      scrollToWorkshopTop();
      window.setTimeout(updateWorkshopBackToTopVisibility,260);
    });
  }
  window.addEventListener('scroll',updateWorkshopBackToTopVisibility,{passive:true});
  window.addEventListener('resize',updateWorkshopBackToTopVisibility);
  window.addEventListener('orientationchange',()=>{
    window.setTimeout(updateWorkshopBackToTopVisibility,120);
  });
  startWorkshopBackToTopWatcher();
  updateWorkshopBackToTopVisibility();
}
function bindWorkshopCollapsibleSections(){
  document.querySelectorAll('[data-collapsible-trigger]').forEach((trigger)=>{
    if(trigger.getAttribute('data-collapsible-bound')==='true')return;
    trigger.setAttribute('data-collapsible-bound','true');
    trigger.addEventListener('click',()=>{
      const section=trigger.closest('.quote-section--collapsible');
      if(!section)return;
      const bodyId=trigger.getAttribute('aria-controls')||'';
      const wasCollapsed=section.classList.contains('quote-section--collapsed');
      if(!bodyId)return;
      if(wasCollapsed){
        WORKSHOP_COLLAPSIBLE_SECTION_IDS.forEach((id)=>{
          setWorkshopSectionCollapsed(id,id!==bodyId);
        });
        window.setTimeout(()=>scrollWorkshopSectionIntoView(section),36);
        return;
      }
      setWorkshopSectionCollapsed(bodyId,true);
    });
  });
}
function bindWorkshopQuoteBuilder(){
  bindWorkshopCollapsibleSections();
  bindWorkshopKeyboardDismissGuard();
  bindWorkshopInputFocusStability();
  const newQuoteEntryBtn=$('newQuoteEntryBtn');
  if(newQuoteEntryBtn && newQuoteEntryBtn.getAttribute('data-new-quote-bound')!=='true'){
    newQuoteEntryBtn.setAttribute('data-new-quote-bound','true');
    newQuoteEntryBtn.addEventListener('click',()=>{
      openCustomerFinderSheet('new-build');
    });
  }
  workshopInputMap().forEach(([id,key])=>{
    const el=$(id);
    if(!el)return;
    const isNumeric=['blankCost','labourRate','labourHours'].includes(key);
    const onFieldUpdate=()=>{
      quote[key]=isNumeric?numberOrZero(el.value):el.value;
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    };
    el.addEventListener('input',onFieldUpdate);
    el.addEventListener('change',onFieldUpdate);
  });
  [
    {id:'quoteTotal',key:'finalCustomerPrice',driver:'final'},
    {id:'quoteProfit',key:'targetProfit',driver:'profit'},
    {id:'quoteMarkupPercent',key:'markupPercent',driver:'markup'}
  ].forEach((config)=>{
    const input=$(config.id);
    if(!input)return;
    const onPricingUpdate=()=>{
      quote[config.key]=numberOrZero(input.value);
      syncQuotePricing(config.driver);
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    };
    input.addEventListener('input',onPricingUpdate);
    input.addEventListener('change',onPricingUpdate);
  });
  const includeTaxInput=$('quoteIncludeGst');
  if(includeTaxInput){
    const onTaxToggle=()=>{
      quote.includeGst=includeTaxInput.checked;
      syncQuotePricing();
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    };
    includeTaxInput.addEventListener('input',onTaxToggle);
    includeTaxInput.addEventListener('change',onTaxToggle);
  }
  const quoteTaxRateInput=$('quoteTaxRate');
  if(quoteTaxRateInput){
    const onQuoteTaxRateUpdate=()=>{
      quote.gstRate=Math.max(0,numberOrZero(quoteTaxRateInput.value));
      syncQuotePricing();
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    };
    quoteTaxRateInput.addEventListener('input',onQuoteTaxRateUpdate);
    quoteTaxRateInput.addEventListener('change',onQuoteTaxRateUpdate);
    quoteTaxRateInput.addEventListener('blur',onQuoteTaxRateUpdate);
    quoteTaxRateInput.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      onQuoteTaxRateUpdate();
      quoteTaxRateInput.blur();
    });
  }
  document.querySelectorAll('[data-quote-mode]').forEach((button)=>{
    button.addEventListener('click',()=>{
      quote.quoteMode=normalizeQuoteMode(button.getAttribute('data-quote-mode'));
      saveQuoteCurrent();
      markQuoteDirty();
      renderWorkshopQuote();
    });
  });
  bindBuildSpecificationInputs();
  const componentsList=$('quoteComponentsList');
  if(componentsList){
    ensureChoicePicker();
    document.addEventListener('pointerdown',(event)=>{
      const actionButton=event.target.closest('[data-component-action="request-delete-row"]');
      if(!actionButton || !componentsList.contains(actionButton))return;
      const i=Number(actionButton.getAttribute('data-component-index'));
      event.preventDefault();
      event.stopPropagation();
      requestDeleteComponentRow(i);
    },true);
    componentsList.addEventListener('input',(event)=>{
      const input=event.target.closest('[data-component-index]');
      if(!input)return;
      const i=Number(input.getAttribute('data-component-index'));
      const key=input.getAttribute('data-component-key');
      if(!quote.components[i] || !key)return;
      quote.components[i][key]=['cost','unitPrice'].includes(key)?numberOrZero(input.value):input.value;
      if(isBlankCategory(quote.components[i].category)){
        applyBlankComponentToQuote(quote.components[i]);
      }
      enforceSingleSourceComponents();
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    });
    componentsList.addEventListener('click',(event)=>{
      const actionButton=event.target.closest('[data-component-action]');
      const action=actionButton?actionButton.getAttribute('data-component-action'):'';
      if(action==='open-row' || action==='close-row'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        toggleComponentRow(i,{focusDescription:false});
        return;
      }
      if(action==='open-component-sheet'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        openChoicePicker('category',i,actionButton);
      }
      if(action==='open-supplier-sheet'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        openChoicePicker('supplier',i,actionButton);
      }
      if(action==='update-library-component'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        requestUpdateLibraryComponentFromRow(i);
      }
      if(action==='request-delete-row'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        requestDeleteComponentRow(i);
      }
    });
    componentsList.addEventListener('pointerdown',(event)=>{
      const actionButton=event.target.closest('[data-component-action="request-delete-row"]');
      if(!actionButton)return;
      const i=Number(actionButton.getAttribute('data-component-index'));
      event.preventDefault();
      event.stopPropagation();
      requestDeleteComponentRow(i);
    },true);
  }
  const addComponentBtn=$('addComponentBtn');
  if(addComponentBtn){
    addComponentBtn.addEventListener('click',()=>{
      let draftIndex=quote.components.findIndex((item)=>componentRowIsEffectivelyEmpty(item));
      let changed=false;
      if(draftIndex>=0){
        const prune=pruneComponentDraftRows(draftIndex);
        draftIndex=prune.preserveIndex;
        changed=prune.changed;
        if(draftIndex>=0 && quote.components[draftIndex]){
          pendingComponentDraftRows.add(quote.components[draftIndex]);
        }
      }else{
        const prune=pruneComponentDraftRows(-1);
        changed=prune.changed;
        quote.components.push(defaultComponentRow());
        draftIndex=quote.components.length-1;
        pendingComponentDraftRows.add(quote.components[draftIndex]);
        shouldAnimateComponentRows=true;
        changed=true;
      }
      expandedComponentRowIndex=draftIndex;
      persistComponentDraftCleanup(changed);
      renderQuoteComponents();
      updateQuoteSummary();
      waitForDomRender(()=>{
        scrollNewComponentRowIntoView(draftIndex);
        focusNewComponentWithRetry(draftIndex,6);
      });
    });
  }
  const saveQuoteBtn=$('saveQuoteBtn');
  if(saveQuoteBtn){
    saveQuoteBtn.addEventListener('click',()=>{
      if(saveQuoteBtn.disabled)return;
      if(!quote.buildNumber){quote.buildNumber=nextBuildNumber();}
      saveQuoteCurrent();
      const savedRef=persistBuildRecord(quote);
      if(savedRef){
        setActiveSavedBuildRef(savedRef.source,savedRef.index,savedRef.record);
      }
      markQuoteSaved();
      flashWorkshopStatus('Build saved');
      focusWorkshopSection('workshopBuildActionsBody',{scroll:false});
    });
  }
  const deleteCurrentBuildBtn=$('deleteCurrentBuildBtn');
  if(deleteCurrentBuildBtn){
    deleteCurrentBuildBtn.addEventListener('click',()=>{
      requestDeleteCurrentBuild();
    });
  }
  const convertToBuildBtn=$('convertToBuildBtn');
  if(convertToBuildBtn){
    convertToBuildBtn.addEventListener('click',()=>{
      if(!canConvertToBuild()){
        alert('Only saved Accepted quotes can be converted to a build.');
        return;
      }
      if(!quote.buildNumber){quote.buildNumber=nextBuildNumber();}
      saveQuoteCurrent();
      persistQuoteRecord(quote);
      const savedRef=persistBuildRecord(quote);
      if(savedRef){
        setActiveSavedBuildRef(savedRef.source,savedRef.index,savedRef.record);
      }
      markQuoteSaved();
      goScreen('layoutScreen');
    });
  }
  ['printQuoteBtn','emailQuoteBtn','viewCustomerCopyBtn'].forEach((id)=>{
    const btn=$(id);
    if(!btn)return;
    btn.addEventListener('click',()=>{
      if(id==='emailQuoteBtn'){
        openQuotePreviewSheet('email');
        return;
      }
      if(id==='viewCustomerCopyBtn'){
        openQuotePreviewSheet('view');
        return;
      }
      if(id==='printQuoteBtn'){
        openQuotePreviewSheet('view');
        return;
      }
    });
  });
  updateQuoteActionPriority();
}
function renderWorkshopQuote(){
  workshopInputMap().forEach(([id,key])=>{
    const el=$(id);
    if(!el)return;
    if(document.activeElement===el)return;
    const isNumeric=['blankCost','labourRate','labourHours'].includes(key);
    el.value=isNumeric?(quote[key]??0):(quote[key]??'');
  });
  const mode=normalizeQuoteMode(quote.quoteMode);
  if(mode!=='internal'){
    quote.quoteMode='internal';
    saveQuoteCurrent();
  }
  document.querySelectorAll('[data-internal-only]').forEach((el)=>el.hidden=false);
  document.querySelectorAll('[data-customer-only]').forEach((el)=>el.hidden=true);
  if($('quoteBuilderTitle'))$('quoteBuilderTitle').textContent='Studio';
  if($('quoteBuilderSubhead'))$('quoteBuilderSubhead').textContent='Customer • Rod Specification • Build Pricing';
  if($('emailQuoteBtn'))$('emailQuoteBtn').textContent='Email Customer Copy';
  if($('viewCustomerCopyBtn'))$('viewCustomerCopyBtn').textContent='View Customer Copy';
  const customerSummaryTextEl=$('quoteCustomerSummaryText');
  if(customerSummaryTextEl){
    const customerName=specificationValue(quote.customerName);
    const locality=specificationValue(quote.cityTown)||specificationValue(quote.suburbLocality);
    const summary=customerName?(locality?`${customerName} • ${locality}`:customerName):'Add customer details';
    customerSummaryTextEl.innerHTML=`<span>${escapeHtml(summary)}</span>`;
  }
  updateBuildPricingSummary();
  updateQuoteActionPriority();
  const includeTaxInput=$('quoteIncludeGst');
  if(includeTaxInput && document.activeElement!==includeTaxInput){
    includeTaxInput.checked=quote.includeGst!==false;
  }
  const quoteTaxRateInput=$('quoteTaxRate');
  if(quoteTaxRateInput && document.activeElement!==quoteTaxRateInput){
    quoteTaxRateInput.value=numberOrZero(quote.gstRate).toFixed(1);
  }
  renderBuildSpecificationInputs();
  updateWorkshopSectionVisibility();
  const activeElement=document.activeElement;
  const isEditingComponent=!!(activeElement&&activeElement.closest&&activeElement.closest('#quoteComponentsList'));
  if(!isEditingComponent){renderQuoteComponents();}
  updateQuoteSummary();
  homeRodRefreshFromState();
}
function updateWorkshopSectionVisibility(){
  const pricingSection=$('workshopPricingSection');
  const actionsSection=$('workshopActionsSection');
  if(!pricingSection || !actionsSection)return;
  const hasComponents=componentRowsForTotals().length>0;
  const hasPricingValues=numberOrZero(quote&&quote.finalCustomerPrice)>0 || numberOrZero(quote&&quote.targetProfit)>0 || numberOrZero(quote&&quote.markupPercent)>0 || numberOrZero(quote&&quote.labourRate)>0 || numberOrZero(quote&&quote.labourHours)>0;
  const hasIdentity=!!(specificationValue(quote&&quote.customerName) || specificationValue(quote&&quote.buildName));
  const showPricing=hasComponents || hasPricingValues;
  const showActions=showPricing || hasIdentity;
  pricingSection.hidden=!showPricing;
  actionsSection.hidden=!showActions;
  if(!showPricing){
    setWorkshopSectionCollapsed('workshopQuoteSummaryBody',true);
  }
  if(!showActions){
    setWorkshopSectionCollapsed('workshopBuildActionsBody',true);
  }
}
function updateQuoteSummary(){
  const math=quoteMaths();
  updateBuildCostsSummary();
  updateBuildPricingSummary();
  if($('quoteLabourCost'))$('quoteLabourCost').value=currency(math.labourCost);
  if($('quoteCostBeforeMargin'))$('quoteCostBeforeMargin').value=currency(math.internalBuildCost);
  if($('quoteSubtotal'))$('quoteSubtotal').value=currency(math.subtotal);
  if($('quoteGst'))$('quoteGst').value=currency(math.gst);
  if($('quoteTotal') && document.activeElement!==$('quoteTotal'))$('quoteTotal').value=numberOrZero(math.total).toFixed(2);
  if($('quoteProfit') && document.activeElement!==$('quoteProfit'))$('quoteProfit').value=numberOrZero(math.profit).toFixed(2);
  if($('quoteMarkupPercent') && document.activeElement!==$('quoteMarkupPercent'))$('quoteMarkupPercent').value=numberOrZero(math.markupPercent).toFixed(2);
  if($('quoteTaxLabel'))$('quoteTaxLabel').textContent='Tax Amount';
  if($('quoteTaxRate') && document.activeElement!==$('quoteTaxRate'))$('quoteTaxRate').value=numberOrZero(math.taxRate).toFixed(1);
  const taxAvailable=quote.taxEnabled!==false;
  const showTaxDetails=taxAvailable && quote.includeGst!==false;
  if($('quoteIncludeGstField'))$('quoteIncludeGstField').hidden=!taxAvailable;
  if($('quoteTaxRateField'))$('quoteTaxRateField').hidden=!showTaxDetails;
  if($('quoteGstField'))$('quoteGstField').hidden=!showTaxDetails;
  if($('quoteModeLabel'))$('quoteModeLabel').textContent='Builder view';
  const gstField=$('quoteGstField');
  const gstStatus=$('quoteGstStatus');
  if(gstField){gstField.classList.toggle('quote-field--muted',quote.includeGst===false);}
  if(gstStatus){gstStatus.textContent='';}
  ['quoteCostBeforeMarginField','quoteMarkupPercentField','quoteProfitField'].forEach((id)=>{const el=$(id);if(el)el.hidden=false;});
  updateWorkshopSectionVisibility();
}

function ensureQuotePreviewSheet(){
  if($('quotePreviewSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='quotePreviewSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-quote-preview-action="close"></div>
    <section class="component-sheet__panel quote-preview-panel" role="dialog" aria-modal="true" aria-label="Preview customer copy">
      <header class="component-sheet__header">
        <h2>Preview Customer Copy</h2>
        <button class="component-sheet__close" type="button" data-quote-preview-action="close" aria-label="Close preview">×</button>
      </header>
      <div class="component-sheet__body quote-preview-body">
        <div class="quote-preview-card">
          <div class="quote-preview-card__head">
            <strong id="quotePreviewName">Customer Copy</strong>
            <span id="quotePreviewBuild"></span>
          </div>
          <p id="quotePreviewCustomer"></p>
          <p id="quotePreviewBuildName"></p>
          <div id="quotePreviewSpecs" class="quote-preview-summary"></div>
          <div id="quotePreviewIncluded" class="quote-preview-summary quote-preview-summary--parts"></div>
          <div id="quotePreviewSummary" class="quote-preview-summary"></div>
        </div>
        <div class="quote-preview-actions">
          <button id="quotePreviewBackBtn" class="ghost-action" type="button">Back</button>
          <button id="quotePreviewApproveBtn" class="primary-action" type="button">Send Customer Copy</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);
  sheet.addEventListener('click',(event)=>{
    const actionEl=event.target.closest('[data-quote-preview-action]');
    if(actionEl && actionEl.getAttribute('data-quote-preview-action')==='close'){closeQuotePreviewSheet();}
  });
  $('quotePreviewBackBtn').addEventListener('click',closeQuotePreviewSheet);
  $('quotePreviewApproveBtn').addEventListener('click',()=>{
    closeQuotePreviewSheet();
    flashWorkshopStatus('Customer copy ready');
  });
}
function renderQuotePreviewSheet(){
  const math=quoteMaths();
  const specificationViews=buildSpecificationViews();
  const includedParts=customerIncludedParts();
  const customerLines=customerPreviewLines();
  const isEmailIntent=quotePreviewIntent==='email';
  const previewTitle=($('quotePreviewSheet')||document).querySelector('.component-sheet__header h2');
  if(previewTitle){previewTitle.textContent=isEmailIntent?'Email Customer Copy':'View Customer Copy';}
  if($('quotePreviewName'))$('quotePreviewName').textContent=customerRodIdentity();
  if($('quotePreviewBuild'))$('quotePreviewBuild').textContent=quote.buildNumber?`Build ${quote.buildNumber}`:'Build confirmation';
  if($('quotePreviewCustomer'))$('quotePreviewCustomer').innerHTML=customerLines.length?customerLines.map(escapeHtml).join('<br>'):'No customer details entered';
  if($('quotePreviewBuildName'))$('quotePreviewBuildName').textContent='';
  if($('quotePreviewSpecs'))$('quotePreviewSpecs').innerHTML=specificationRowsMarkup(specificationViews.customer);
  if($('quotePreviewIncluded'))$('quotePreviewIncluded').innerHTML=customerIncludedPartsMarkup(includedParts);
  if($('quotePreviewApproveBtn')){
    $('quotePreviewApproveBtn').hidden=!isEmailIntent;
    $('quotePreviewApproveBtn').textContent='Send Customer Copy';
  }
  if($('quotePreviewSummary'))$('quotePreviewSummary').innerHTML=`
    <div><span>Total Customer Price</span><strong>${currency(math.total)}</strong></div>
    ${numberOrZero(math.gst)>0?`<div><span>Tax</span><strong>${currency(math.gst)}</strong></div>`:''}
  `;
}
function openQuotePreviewSheet(action){
  quotePreviewIntent=action==='email'?'email':'view';
  ensureQuotePreviewSheet();
  renderQuotePreviewSheet();
  const sheet=$('quotePreviewSheet');
  if(!sheet)return;
  sheet.hidden=false;
  lockModalLayer(document.activeElement);
}
function closeQuotePreviewSheet(){
  const sheet=$('quotePreviewSheet');
  if(!sheet)return;
  sheet.hidden=true;
  unlockModalLayer({restoreFocus:true});
}
function ensureBlankEditorSheet(){
  if($('blankEditorSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='blankEditorSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-blank-editor-action="close"></div>
    <section class="component-sheet__panel" role="dialog" aria-modal="true" aria-label="Blank editor">
      <header class="component-sheet__header">
        <h2 id="blankEditorTitle">Blank</h2>
        <button class="component-sheet__close" type="button" data-blank-editor-action="close" aria-label="Close blank editor">×</button>
      </header>
      <div class="component-sheet__body">
        <div class="blank-editor-grid">
          <label><span>Manufacturer</span><input id="blankEditorMaker" type="text" /></label>
          <label><span>Series</span><input id="blankEditorSeries" type="text" /></label>
          <label class="blank-editor-grid__full"><span>Blank Name</span><input id="blankEditorModel" type="text" /></label>
          <label><span>Length</span><input id="blankEditorLength" type="text" /></label>
          <label><span>Power</span><input id="blankEditorPower" type="text" /></label>
          <label><span>Action</span><input id="blankEditorAction" type="text" /></label>
          <label><span>Pieces</span><input id="blankEditorPieces" type="text" /></label>
          <label><span>Blank Cost</span><input id="blankEditorCost" type="number" min="0" step="0.01" /></label>
          <label><span>SKU</span><input id="blankEditorSku" type="text" /></label>
          <label class="blank-editor-grid__full"><span>Notes</span><textarea id="blankEditorNotes" rows="2"></textarea></label>
          <label><span>First Guide (mm)</span><input id="blankEditorFg" type="number" min="50" max="300" step="1" /></label>
          <label><span>Guide Count</span><input id="blankEditorGc" type="number" min="5" max="20" step="1" /></label>
          <label class="blank-editor-grid__full"><span>Target Stripper (mm)</span><input id="blankEditorTs" type="number" min="500" max="2500" step="1" /></label>
        </div>
        <div class="quote-preview-actions">
          <button id="blankEditorCancel" type="button" class="ghost-action">Cancel</button>
          <button id="blankEditorSave" type="button" class="primary-action">Save Blank</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);
  sheet.addEventListener('click',(event)=>{
    const action=event.target.closest('[data-blank-editor-action]');
    if(action && action.getAttribute('data-blank-editor-action')==='close'){closeBlankEditor();}
  });
  $('blankEditorCancel').addEventListener('click',closeBlankEditor);
  $('blankEditorSave').addEventListener('click',saveBlankEditor);
}
function openBlankEditor(blankId){
  ensureBlankEditorSheet();
  activeBlankEditorId=blankId||'';
  const editing=findBlankById(activeBlankEditorId);
  const blank=editing?normalizeBlank(editing):normalizeBlank({id:generateId('blank')});
  if($('blankEditorTitle'))$('blankEditorTitle').textContent=editing?'Edit Blank':'Add Blank';
  if($('blankEditorMaker'))$('blankEditorMaker').value=blank.maker;
  if($('blankEditorSeries'))$('blankEditorSeries').value=blank.series;
  if($('blankEditorModel'))$('blankEditorModel').value=blank.model;
  if($('blankEditorLength'))$('blankEditorLength').value=blank.length;
  if($('blankEditorPower'))$('blankEditorPower').value=blank.power;
  if($('blankEditorAction'))$('blankEditorAction').value=blank.action;
  if($('blankEditorPieces'))$('blankEditorPieces').value=blank.pieces;
  if($('blankEditorCost'))$('blankEditorCost').value=String(numberOrZero(blank.cost));
  if($('blankEditorSku'))$('blankEditorSku').value=blank.sku;
  if($('blankEditorNotes'))$('blankEditorNotes').value=blank.notes;
  if($('blankEditorFg'))$('blankEditorFg').value=String(blank.fg);
  if($('blankEditorGc'))$('blankEditorGc').value=String(blank.gc);
  if($('blankEditorTs'))$('blankEditorTs').value=String(blank.ts);
  $('blankEditorSheet').hidden=false;
  lockModalLayer(document.activeElement);
}
function closeBlankEditor(){
  const sheet=$('blankEditorSheet');
  if(!sheet)return;
  sheet.hidden=true;
  activeBlankEditorId='';
  unlockModalLayer({restoreFocus:true});
}
function saveBlankEditor(){
  const existing=findBlankById(activeBlankEditorId);
  const blank=normalizeBlank({
    id:existing?existing.id:generateId('blank'),
    maker:$('blankEditorMaker')?$('blankEditorMaker').value:'',
    series:$('blankEditorSeries')?$('blankEditorSeries').value:'',
    model:$('blankEditorModel')?$('blankEditorModel').value:'',
    length:$('blankEditorLength')?$('blankEditorLength').value:'',
    power:$('blankEditorPower')?$('blankEditorPower').value:'',
    action:$('blankEditorAction')?$('blankEditorAction').value:'',
    pieces:$('blankEditorPieces')?$('blankEditorPieces').value:'',
    cost:$('blankEditorCost')?$('blankEditorCost').value:0,
    sku:$('blankEditorSku')?$('blankEditorSku').value:'',
    notes:$('blankEditorNotes')?$('blankEditorNotes').value:'',
    fg:$('blankEditorFg')?$('blankEditorFg').value:105,
    gc:$('blankEditorGc')?$('blankEditorGc').value:9,
    ts:$('blankEditorTs')?$('blankEditorTs').value:1260,
    archived:existing?existing.archived:false,
  });
  if(!blank.model){
    alert('Blank name is required.');
    return;
  }
  if(existing){
    const idx=blanks.findIndex((item)=>item.id===existing.id);
    if(idx>=0)blanks[idx]=blank;
  }else{
    blanks.unshift(blank);
  }
  saveBlankLibrary();
  renderBlanks();
  if(activeChoicePicker.type==='blank' && $('choicePickerSheet') && !$('choicePickerSheet').hidden){
    renderChoicePickerOptions($('choicePickerSearch')?$('choicePickerSearch').value:'');
  }
  if(existing && String(quote.blankId||'')===existing.id){
    applyBlankToQuote(blank);
    renderWorkshopQuote();
  }
  closeBlankEditor();
}
function duplicateBlank(blankId){
  const source=findBlankById(blankId);
  if(!source)return;
  const copy=normalizeBlank({...source,id:generateId('blank'),model:(source.model||'Blank')+' Copy',archived:false});
  blanks.unshift(copy);
  saveBlankLibrary();
  renderBlanks();
}
function loadBlank(i){
  const b=blanks[i];
  if(!b)return;
  state.firstGuide=b.fg;state.guideCount=b.gc;state.targetStripper=b.ts;state.locked=false;state.workshopIndex=0;
  applyBlankToQuote(b);
  save();saveQuoteCurrent();render();goScreen('layoutScreen');
}
function ensureDemoBlank(){
  const demoKey='demo softbait';
  const existing=blanks.find((blank)=>normalizeNameKey(blank&&blank.model)===demoKey);
  const incoming=normalizeBlank({
    id:existing?existing.id:generateId('blank'),
    maker:'K-Labs',
    series:'Demo Series',
    model:'Demo Softbait',
    length:"7'4",
    power:'MH',
    action:'Fast',
    pieces:'2',
    cost:438,
    sku:'DEMO-0381-SB74',
    notes:'Offline demo blank for validation.',
    fg:108,
    gc:10,
    ts:1330,
    archived:false,
  });
  if(existing){
    Object.assign(existing,incoming);
  }else{
    blanks.unshift(incoming);
  }
  saveBlankLibrary();
  return existing||incoming;
}
function loadDemoBuild(){
  const demoBlank=ensureDemoBlank();
  state.firstGuide=demoBlank.fg;
  state.guideCount=demoBlank.gc;
  state.targetStripper=demoBlank.ts;
  state.locked=false;
  state.workshopIndex=0;
  quote=normalizeQuote({
    ...newQuoteTemplate(),
    customerName:'Demo Angler',
    phone:'021 555 0131',
    email:'demo@klabs.co.nz',
    buildName:'Demo Softbait',
    notes:'Loaded via Settings > Load Demo Build for rapid testing.',
    blankId:demoBlank.id,
    blankName:blankDisplayName(demoBlank),
    blankMaker:demoBlank.maker,
    blankSeries:demoBlank.series,
    blankLength:demoBlank.length,
    blankPower:demoBlank.power,
    blankAction:demoBlank.action,
    blankPieces:demoBlank.pieces,
    blankCost:demoBlank.cost,
    blankSku:demoBlank.sku,
    blankNotes:demoBlank.notes,
    components:[
      {category:'Guides',supplier:'Fuji',description:'Fuji K-Series guide set',cost:96},
      {category:'Reel Seat',supplier:'Alps',description:'Alps triangle reel seat',cost:28},
      {category:'Thread & Finish',supplier:'K-Labs',description:'Thread + finish + trim set',cost:22}
    ],
    labourRate:50,
    labourHours:2,
    markupPercent:20,
    targetProfit:0,
    finalCustomerPrice:0,
    pricingDriver:'markup',
    includeGst:true,
    quoteMode:'internal',
    gstRate:15,
  });
  save();
  saveQuoteCurrent();
  renderBlanks();
  render();
  goScreen('workshopScreen');
}
function renderBlanks(){
  const host=$('blankCards');
  if(!host)return;
  hideBlankRowMenu();
  const filtered=blanks
    .filter((blank)=>!blank.archived)
    .filter((blank)=>blankMatchesSearch(blank,blankLibrarySearch))
    .sort((left,right)=>{
      const favoriteDiff=Number(blankIsFavourite(right))-Number(blankIsFavourite(left));
      if(favoriteDiff)return favoriteDiff;
      return compareBlankDisplayNames(left,right);
    });
  if(!filtered.length){
    host.innerHTML='<div class="empty-card">No blanks match your search.</div>';
    return;
  }
  host.innerHTML=filtered.map((blank)=>{
    const idx=blanks.findIndex((item)=>item.id===blank.id);
    const isFavourite=blankIsFavourite(blank);
    return `<article class="blank-card" data-blank-row data-blank-id="${escapeHtml(blank.id)}" data-blank-index="${idx}"><button class="blank-card__select" data-blank-action="select" data-blank-id="${escapeHtml(blank.id)}" data-blank-index="${idx}" type="button" aria-label="Select blank ${escapeHtml(blankDisplayName(blank))}"><span>${escapeHtml(blank.maker||'Blank')}</span><strong>${escapeHtml(blankDisplayName(blank))}</strong><em>${escapeHtml(blank.length||'Length n/a')} • ${escapeHtml(blank.pieces||'Piece n/a')} • ${escapeHtml(blank.power||'Power n/a')} • ${escapeHtml(blank.action||'Action n/a')}</em></button><div class="blank-card__actions"><button class="component-sheet__favorite" data-blank-favourite-toggle data-blank-id="${escapeHtml(blank.id)}" type="button" aria-label="${isFavourite?'Unfavourite blank':'Favourite blank'}" aria-pressed="${isFavourite?'true':'false'}"><span aria-hidden="true">★</span></button>${blankRowMenuMarkup(blank)}</div></article>`;
  }).join('');
}
function bindBlankLibraryControls(){
  const searchInput=$('blankSearchInput');
  if(searchInput){
    searchInput.value=blankLibrarySearch;
    searchInput.addEventListener('input',()=>{saveBlankLibrarySearch(searchInput.value);renderBlanks();});
  }
  const addBtn=$('blankAddBtn');
  if(addBtn){
    addBtn.addEventListener('click',()=>openBlankEditor(''));
  }
  const host=$('blankCards');
  if(host){
    host.addEventListener('click',(event)=>{
      const favouriteButton=event.target.closest('[data-blank-favourite-toggle]');
      if(favouriteButton){
        event.preventDefault();
        event.stopPropagation();
        const blankId=favouriteButton.getAttribute('data-blank-id')||'';
        const favourites=favoriteBlankIds();
        if(favourites.has(blankId)){
          favourites.delete(blankId);
        }else{
          favourites.add(blankId);
        }
        saveFavoriteBlankIds(Array.from(favourites));
        renderBlanks();
        return;
      }
      const menuTrigger=event.target.closest('[data-blank-menu-trigger]');
      if(menuTrigger){
        event.preventDefault();
        event.stopPropagation();
        toggleBlankRowMenu(menuTrigger,menuTrigger.getAttribute('data-blank-id')||'');
        return;
      }
      const button=event.target.closest('[data-blank-action]');
      if(!button)return;
      const action=button.getAttribute('data-blank-action');
      const blankId=button.getAttribute('data-blank-id')||'';
      const blank=findBlankById(blankId);
      if(!blank)return;
      hideBlankRowMenu();
      if(action==='select' || action==='load'){
        const idx=Number(button.getAttribute('data-blank-index'));
        loadBlank(Number.isFinite(idx)?idx:blanks.findIndex((item)=>item.id===blankId));
      }
      if(action==='rename' || action==='edit'){openBlankEditor(blankId);}
      if(action==='duplicate'){duplicateBlank(blankId);}
      if(action==='delete'){requestDeleteBlank(blank);}
      if(action==='restore'){
        blank.archived=false;
        saveBlankLibrary();
        renderBlanks();
      }
    });
    host.addEventListener('keydown',(event)=>{
      const row=event.target.closest('[data-blank-row]');
      if(!row)return;
      if(event.key!=='Enter' && event.key!==' ')return;
      event.preventDefault();
      const blankId=row.getAttribute('data-blank-id')||'';
      const idx=Number(row.getAttribute('data-blank-index'));
      loadBlank(Number.isFinite(idx)?idx:blanks.findIndex((item)=>item.id===blankId));
    });
  }
  document.addEventListener('click',(event)=>{
    const openMenu=document.querySelector('[data-blank-menu]:not([hidden])');
    if(!openMenu)return;
    if(event.target.closest('[data-blank-menu]'))return;
    if(event.target.closest('[data-blank-menu-trigger]'))return;
    hideBlankRowMenu();
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){hideBlankRowMenu();}
  });
}
function bindHomeActions(){
  const enterBtn=$('homeEnterRodBtn');
  if(enterBtn && enterBtn.getAttribute('data-home-bound')!=='true'){
    enterBtn.setAttribute('data-home-bound','true');
    enterBtn.addEventListener('click',()=>{
      preserveWorkshopQuoteOnEntry=false;
      goScreen('workshopScreen');
    });
  }
}
function bindBuildsControls(){
  const searchInput=$('buildsSearchInput');
  if(searchInput){
    searchInput.addEventListener('input',()=>{
      buildsSearch=searchInput.value||'';
      renderBuilds();
    });
  }
  const newBuildBtn=$('savedBuildsNewBuildBtn');
  if(newBuildBtn && newBuildBtn.getAttribute('data-saved-builds-new-bound')!=='true'){
    newBuildBtn.setAttribute('data-saved-builds-new-bound','true');
    newBuildBtn.addEventListener('click',()=>{
      startNewBuildFlow();
    });
  }
  const host=$('buildCards');
  if(host){
    host.addEventListener('click',(event)=>{
      const menuTrigger=event.target.closest('[data-build-menu-trigger]');
      if(menuTrigger){
        event.preventDefault();
        event.stopPropagation();
        toggleSavedBuildRowMenu(menuTrigger,menuTrigger.getAttribute('data-build-source')||'',menuTrigger.getAttribute('data-build-index'));
        return;
      }
      const button=event.target.closest('[data-build-action]');
      if(!button)return;
      const action=button.getAttribute('data-build-action')||'';
      const source=button.getAttribute('data-build-source')||'quote';
      const index=Number(button.getAttribute('data-build-index'));
      hideSavedBuildRowMenu();
      if(action==='open'){openSavedBuildRecord(source,index);}
      if(action==='duplicate'){duplicateSavedBuildRecord(source,index);}
      if(action==='delete'){requestDeleteSavedBuildRecord(source,index);}
    });
  }
  document.addEventListener('click',(event)=>{
    const openMenu=document.querySelector('[data-build-menu]:not([hidden])');
    if(!openMenu)return;
    if(event.target.closest('[data-build-menu]'))return;
    if(event.target.closest('[data-build-menu-trigger]'))return;
    hideSavedBuildRowMenu();
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){hideSavedBuildRowMenu();}
  });
}
function onScreenChange(screenId){
  clearLayoutFieldFocusSelection();
  if(screenId==='homeScreen'){
    homeRodRefreshFromState(true);
  }else{
    homeRodClearSequenceTimer();
    homeRodState.sequenceAnimating=false;
  }
  if(screenId==='buildsScreen'){
    const searchInput=$('buildsSearchInput');
    if(searchInput && searchInput.value!==buildsSearch){searchInput.value=buildsSearch;}
    renderBuilds();
  }
  if(screenId==='customersScreen'){
    const searchInput=$('customerBrowserSearchInput');
    if(searchInput && searchInput.value!==customerBrowserSearch){
      searchInput.value=customerBrowserSearch;
    }
    renderCustomerBrowser();
  }
  if(screenId==='workshopScreen'){
    if(preserveWorkshopQuoteOnEntry){
      preserveWorkshopQuoteOnEntry=false;
      renderWorkshopQuote();
    }else{
      beginFreshQuote({navigate:false});
    }
  }
  if(screenId==='settingsScreen' && $('settingsTaxRate')){
    $('settingsTaxRate').value=String(activeTaxRate());
    if($('settingsTaxEnabled'))$('settingsTaxEnabled').checked=activeTaxEnabled();
    syncSettingsPreferenceControls();
  }
  updateWorkshopBackToTopVisibility();
}
function syncSettingsPreferenceControls(){
  document.querySelectorAll('[data-settings-units]').forEach((button)=>{
    const selected=button.getAttribute('data-settings-units')===activeMeasurementUnits();
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  const imperialDisplayGroup=$('settingsImperialDisplayGroup');
  if(imperialDisplayGroup){
    imperialDisplayGroup.hidden=activeMeasurementUnits()!=='imperial';
  }
  document.querySelectorAll('[data-settings-imperial-display]').forEach((button)=>{
    const selected=button.getAttribute('data-settings-imperial-display')===activeImperialDisplay();
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
  document.querySelectorAll('[data-settings-date-format]').forEach((button)=>{
    const selected=button.getAttribute('data-settings-date-format')===activeDateFormat();
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
}
function bindSettingsControls(){
  const taxEnabledInput=$('settingsTaxEnabled');
  if(taxEnabledInput){
    taxEnabledInput.checked=activeTaxEnabled();
    const onTaxEnabledChange=()=>{
      studioSettings.taxEnabled=taxEnabledInput.checked;
      saveStudioSettings();
    };
    taxEnabledInput.addEventListener('input',onTaxEnabledChange);
    taxEnabledInput.addEventListener('change',onTaxEnabledChange);
  }
  const taxRateInput=$('settingsTaxRate');
  const taxSavedLabel=$('settingsTaxSaved');
  let taxSavedTimer=null;
  const showTaxSaved=()=>{
    if(!taxSavedLabel)return;
    taxSavedLabel.hidden=false;
    if(taxSavedTimer){clearTimeout(taxSavedTimer);}
    taxSavedTimer=window.setTimeout(()=>{
      taxSavedLabel.hidden=true;
      taxSavedTimer=null;
    },1200);
  };
  if(taxRateInput){
    taxRateInput.value=String(activeTaxRate());
    const saveTaxRate=()=>{
      studioSettings.taxRate=Math.max(0,numberOrZero(taxRateInput.value)||0);
      taxRateInput.value=String(studioSettings.taxRate);
      saveStudioSettings();
      showTaxSaved();
    };
    taxRateInput.addEventListener('change',saveTaxRate);
    taxRateInput.addEventListener('blur',saveTaxRate);
    taxRateInput.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      saveTaxRate();
      taxRateInput.blur();
    });
  }
  document.querySelectorAll('[data-settings-units]').forEach((button)=>{
    if(button.getAttribute('data-settings-bound')==='true')return;
    button.setAttribute('data-settings-bound','true');
    button.addEventListener('click',()=>{
      const next=normalizeMeasurementUnits(button.getAttribute('data-settings-units'));
      if(studioSettings.measurementUnits===next)return;
      studioSettings.measurementUnits=next;
      saveStudioSettings();
      syncSettingsPreferenceControls();
      render();
      renderWorkshopQuote();
      renderBlanks();
      renderBuilds();
      renderCustomerBrowser();
    });
  });
  document.querySelectorAll('[data-settings-imperial-display]').forEach((button)=>{
    if(button.getAttribute('data-settings-bound')==='true')return;
    button.setAttribute('data-settings-bound','true');
    button.addEventListener('click',()=>{
      const next=normalizeImperialDisplay(button.getAttribute('data-settings-imperial-display'));
      if(studioSettings.imperialDisplay===next)return;
      studioSettings.imperialDisplay=next;
      saveStudioSettings();
      syncSettingsPreferenceControls();
      render();
      renderWorkshopQuote();
      renderBlanks();
    });
  });
  document.querySelectorAll('[data-settings-date-format]').forEach((button)=>{
    if(button.getAttribute('data-settings-bound')==='true')return;
    button.setAttribute('data-settings-bound','true');
    button.addEventListener('click',()=>{
      const next=normalizeDateFormat(button.getAttribute('data-settings-date-format'));
      if(studioSettings.dateFormat===next)return;
      studioSettings.dateFormat=next;
      saveStudioSettings();
      syncSettingsPreferenceControls();
      renderBuilds();
      renderCustomerBrowser();
      renderCustomerFinder();
    });
  });
  syncSettingsPreferenceControls();
}
function render(){
  const r=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  const appEl=$('app');
  if(appEl){appEl.classList.toggle('locked',!!state.locked);}
  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(field && controlMeta[field] && document.activeElement!==el){
      const value=state[controlMeta[field].key];
      el.textContent=field==='guideCount'?String(value):formatMeasurementNumber(value,{decimalsMetric:1,decimalsImperial:2});
    }
    const editable=!state.locked;
    el.setAttribute('contenteditable',editable?'true':'false');
    el.setAttribute('aria-readonly',editable?'false':'true');
  });
  const units=measurementUnitSuffix();
  if($('layoutFirstGuideTitle'))$('layoutFirstGuideTitle').textContent=`First Guide From Tip (${units})`;
  if($('layoutTargetStripperTitle'))$('layoutTargetStripperTitle').textContent=`Target Stripper Position (${units})`;
  if($('layoutFirstGuideMeta'))$('layoutFirstGuideMeta').textContent=units;
  if($('layoutTargetStripperMeta'))$('layoutTargetStripperMeta').textContent=units;
  refreshMeasurementPlaceholders();
  renderWorkshopCalculator();
  document.querySelectorAll('.layout-control-card__button[data-action]').forEach((button)=>{
    button.disabled=!!state.locked;
  });
  const guideSpacingCards=$('guideSpacingCards');
  if(guideSpacingCards){
    guideSpacingCards.innerHTML=r.rows.map((row,i)=>`
      <article class="guide-spacing-row${i===state.workshopIndex?' guide-spacing-row--active':''}" data-guide-index="${i}" tabindex="0" role="button" aria-label="Guide ${row.g}. Position ${formatMeasurementValue(row.cum,{decimalsMetric:1,decimalsImperial:2})}. Spacing ${formatMeasurementValue(row.spacing,{decimalsMetric:1,decimalsImperial:2})}" aria-current="${i===state.workshopIndex?'true':'false'}">
        <div class="guide-spacing-row__meta">
          <span>Guide ${row.g}</span>
        </div>
        <div class="guide-spacing-row__meta">
          <small>Position</small>
          <span>${formatMeasurementValue(row.cum,{decimalsMetric:1,decimalsImperial:2})}</span>
        </div>
        <div class="guide-spacing-row__spacing">
          <span class="guide-spacing-row__spacing-label">Spacing</span>
          <strong class="guide-spacing-row__spacing-value">${formatMeasurementValue(row.spacing,{decimalsMetric:1,decimalsImperial:2})}</strong>
        </div>
      </article>
    `).join('');
  }
  const statusBadge=$('layoutStatusBadge');
  if(statusBadge){
    statusBadge.textContent=state.locked?'Locked':'Live';
    statusBadge.setAttribute('aria-pressed',String(!!state.locked));
    statusBadge.setAttribute('title',state.locked?'Locked. Tap to unlock controls.':'Live. Tap to lock controls.');
  }
  const guideNotice=$('layoutGuideNotice');
  if(guideNotice){guideNotice.textContent='Guide only. Confirm final placement by static testing and builder judgement.';}
  const row=r.rows[Math.max(0,Math.min(state.workshopIndex,r.rows.length-1))]||r.rows[0];
  if($('workshopProgress'))$('workshopProgress').textContent='Guide '+row.g+' of '+state.guideCount;
  if($('workshopGuide'))$('workshopGuide').textContent='Guide '+row.g;
  if($('workshopMeasure'))$('workshopMeasure').textContent=formatMeasurementNumber(row.cum,{decimalsMetric:1,decimalsImperial:2});
  if($('workshopSpacing'))$('workshopSpacing').textContent='Spacing from previous: '+formatMeasurementValue(row.spacing,{decimalsMetric:1,decimalsImperial:2});
  if(window.StudioVisuals && typeof window.StudioVisuals.update==='function'){window.StudioVisuals.update(r,state);}
  const workshopScreen=$('workshopScreen');
  if(workshopScreen && workshopScreen.classList.contains('active')){renderWorkshopQuote();}
  if($('homeScreen') && $('homeScreen').classList.contains('active')){homeRodRefreshFromState();}
}
['nextGuide','prevGuide'].forEach((id)=>{
  const el=$(id);
  if(el){
    el.onclick=()=>{
      if(id==='nextGuide'){state.workshopIndex=Math.min(state.workshopIndex+1,state.guideCount-1);}else{state.workshopIndex=Math.max(state.workshopIndex-1,0);} 
      save();render();
    };
  }
});
loadChoicePickerFavourites();
bindLayoutControls();
bindWorkshopCalculatorControls();
bindWorkshopQuoteBuilder();
bindWorkshopBackToTopControl();
bindHomeActions();
bindBuildsControls();
bindCustomerBrowserControls();
bindBlankLibraryControls();
bindSettingsControls();
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks,renderBuilds,loadDemoBuild,startNewBuildFlow,onScreenChange,prepareWorkshopEntry:(mode)=>{preserveWorkshopQuoteOnEntry=(mode==='preserve');}};
