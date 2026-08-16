const $=id=>document.getElementById(id);
function normalizeLayoutState(input){
  const raw=input&&typeof input==='object'?input:{};
  return {
    firstGuide:clampMeasurementValue(raw.firstGuide,50,300),
    guideCount:clampValue(raw.guideCount,5,20),
    targetStripper:clampMeasurementValue(raw.targetStripper,500,2500),
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
const COMPONENT_TAXONOMY_STORAGE_KEY='klabs-workshop-component-taxonomy';
// Known singular/plural naming variants for the same logical Components category (e.g. seeded "Grips" vs default "Grip").
const CATEGORY_NAME_ALIAS_GROUPS=[
  ['Blank','Blanks'],
  ['Reel Seat','Reel Seats'],
  ['Grip','Grips'],
  ['Butt Cap','Butt Caps'],
  ['Hook Keeper','Hook Keepers'],
  ['Tip Top','Tip Tops'],
  ['Winding Check','Winding Checks'],
  ['Decal','Decals'],
];
// Business/admin charge names that should never be stored as physical Component library records.
const NON_COMPONENT_LINE_ITEM_NAMES=['freight','shipping','courier','postage','post & packing','post and packing','repair'];
function categoryAliasGroupKeyFor(name){
  const key=normalizeNameKey(name);
  if(!key)return '';
  const group=CATEGORY_NAME_ALIAS_GROUPS.find((variants)=>variants.some((variant)=>normalizeNameKey(variant)===key));
  return group?normalizeNameKey(group[0]):'';
}
function findExistingCategoryByAlias(categoryMap,name){
  const directKey=normalizeNameKey(name);
  if(categoryMap.has(directKey))return categoryMap.get(directKey);
  const aliasGroupKey=categoryAliasGroupKeyFor(name);
  if(!aliasGroupKey)return null;
  for(const [key,category] of categoryMap){
    if(categoryAliasGroupKeyFor(key)===aliasGroupKey)return category;
  }
  return null;
}
const BLANK_LIBRARY_STORAGE_KEY='klabs-blank-library';
const BLANK_LIBRARY_SEARCH_KEY='klabs-blank-library-search';
const SETTINGS_STORAGE_KEY='klabs-studio-settings';
const MEASUREMENT_UNIT_VALUES=['metric','imperial'];
const IMPERIAL_DISPLAY_VALUES=['decimal','fractional'];
const DATE_FORMAT_VALUES=['dd/mm/yyyy','mm/dd/yyyy'];
const UNASSIGNED_COMPONENT_CATEGORY='Unassigned';
const QUOTE_STATUS_VALUES=['draft','sent','revised','declined','expired','accepted'];
const WORKSHOP_COLLAPSIBLE_SECTION_IDS=['workshopCustomerBody','workshopBuildDetailsBody','workshopBuildSpecsBody','workshopQuoteSummaryBody','workshopBuildActionsBody'];
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
let activeBuildRowMenu='';
let customerFinderSearch='';
let customerFinderSelectedKey='';
let customerFinderBrowseView='list';
let customerFinderBuildRowMenu='';
let customerFinderCustomerMenuOpen=false;
let customerFinderIntent='browse';
let customerFinderNewBuildStep='actions';
let activeCustomerRenameContext={key:'',existingName:''};
let selectedBlankEditState=null;
let selectedBlankControlsBound=false;
let hasUnsavedQuoteChanges=false;
const controlMeta={guideCount:{key:'guideCount',min:5,max:20,step:1},firstGuide:{key:'firstGuide',min:50,max:300,step:1},targetStripper:{key:'targetStripper',min:500,max:2500,step:1}};
const CORE_MEASUREMENT_FORMAT={decimalsMetric:3,decimalsImperial:3,forceDecimal:true};
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
let quoteAutosaveTimer=null;
let quoteAutosaveInFlight=false;
let currentBuildActionsMenuOpen=false;
let preserveWorkshopQuoteOnEntry=false;
let studioScreenView='landing';
let studioComponentsSearch='';
let studioSelectedComponentKey='';
let studioComponentDraft=null;
let studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
let studioLibraryEditor={type:'',mode:'',targetName:''};
let studioLibraryContextMenu={type:'',key:''};
let studioTaxonomyManagerSection='categories';
let studioSupplierContextMenu='';
let studioTaxonomyUiState={
  categories:{mode:'browse'},
  subcategories:{mode:'browse'},
  suppliers:{mode:'browse'},
};
let studioComponentTaxonomyState=null;
let studioComponentTaxonomySelection={category:'',subcategory:'',supplier:''};
let studioComponentDetailContext={isAddMode:false,baseline:'',savedTimer:0,savedFlash:false};
let studioSupplierEditContext={baseline:'',savedTimer:0,savedFlash:false};
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
  spiral:{
    unit:'metric',
    imperialDisplay:'fractional',
    method:'progressive',
    direction:'left',
    guideCount:5,
    offsetStartAngle:20,
    showPhysicalOffsets:false,
    expandedGuideIndex:-1,
    guides:[],
  },
};
let gripCutTemplateSnapshot=null;
let workshopLandingReturnFocusTool='';

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
  return 'decimal';
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
  const trackComponentStock=!!(settings&&settings.trackComponentStock);
  const measurementUnits=normalizeMeasurementUnits(settings&&settings.measurementUnits);
  const imperialDisplay=normalizeImperialDisplay(settings&&settings.imperialDisplay);
  const dateFormat=normalizeDateFormat(settings&&settings.dateFormat);
  return {taxRate,taxEnabled,trackComponentStock,measurementUnits,imperialDisplay,dateFormat};
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
function activeTrackComponentStock(){
  return !!(studioSettings&&studioSettings.trackComponentStock);
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
    const decimals=settings.decimalsImperial===undefined?3:settings.decimalsImperial;
    return formatDecimal(inchesValue,decimals);
  }
  return formatDecimal(valueMm,settings.decimalsMetric===undefined?3:settings.decimalsMetric);
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
  if(normalizedUnit==='imperial'){
    const inchesValue=mmToInches(valueMm);
    const decimals=settings.decimalsImperial===undefined?3:settings.decimalsImperial;
    return formatDecimal(inchesValue,decimals);
  }
  return formatDecimal(valueMm,settings.decimalsMetric===undefined?3:settings.decimalsMetric);
}
function formatWorkshopMeasurementValue(valueMm,unit,imperialDisplay,options){
  return `${formatWorkshopMeasurementNumber(valueMm,unit,imperialDisplay,options)} ${workshopUnitSuffix(unit)}`;
}
function workshopMeasurementInputText(valueMm,unit,imperialDisplay){
  return formatWorkshopMeasurementNumber(valueMm,unit,imperialDisplay,CORE_MEASUREMENT_FORMAT);
}
function blankMeasurementInputText(valueMm){
  return formatMeasurementNumber(valueMm,CORE_MEASUREMENT_FORMAT);
}
function parseBlankMeasurementInput(rawValue,fallbackMm){
  const parsed=parseMeasurementInputValue(rawValue);
  return Number.isFinite(parsed)?parsed:fallbackMm;
}
function syncWorkshopToggleButtons(panel,selector,attribute,selectedValue){
  if(!panel)return;
  panel.querySelectorAll(selector).forEach((button)=>{
    const selected=button.getAttribute(attribute)===selectedValue;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
  });
}
function bindWorkshopToggleButtons(panel,selector,handler){
  if(!panel)return;
  panel.querySelectorAll(selector).forEach((button)=>{
    if(button.getAttribute('data-workshop-toggle-bound')==='true')return;
    button.setAttribute('data-workshop-toggle-bound','true');
    button.addEventListener('click',()=>handler(button));
  });
}
function bindWorkshopCalculatorInput(input,onChange){
  if(!input || input.getAttribute('data-workshop-input-bound')==='true')return;
  input.setAttribute('data-workshop-input-bound','true');
  input.addEventListener('input',onChange);
  input.addEventListener('change',onChange);
}
function syncWorkshopMeasurementInput(input,valueMm,unit,imperialDisplay,placeholderMm){
  if(!input)return;
  if(document.activeElement!==input){
    input.value=workshopMeasurementInputText(valueMm,unit,imperialDisplay);
  }
  if(Number.isFinite(placeholderMm)){
    input.placeholder=workshopMeasurementInputText(placeholderMm,unit,imperialDisplay);
  }
}
function refreshWorkshopMeasurementLabels(){
  const suffix=measurementUnitSuffix();
  document.querySelectorAll('[data-measurement-label]').forEach((label)=>{
    const base=label.getAttribute('data-measurement-label')||'';
    label.textContent=`${base} (${suffix})`;
  });
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
function gripCutOffsetMm(cutAngleDeg,materialWidthMm){
  const angle=Math.max(0,numberOrZero(cutAngleDeg));
  const width=Math.max(0.01,numberOrZero(materialWidthMm));
  return Math.tan((angle*Math.PI)/180)*width;
}
function gripCutAngleLabel(cutAngleDeg){
  return `${formatDecimal(cutAngleDeg,1)} deg off square`;
}
function normalizeSpiralMethod(value){
  const next=String(value||'').trim().toLowerCase();
  return next==='acute' || next==='offset'?next:'progressive';
}
function normalizeSpiralDirection(value){
  return String(value||'').trim().toLowerCase()==='right'?'right':'left';
}
function clampSpiralGuideCount(value){
  return Math.max(5,Math.min(20,Math.round(numberOrZero(value)||5)));
}
function clampSpiralAngle(value){
  return Math.max(0,Math.min(180,numberOrZero(value)));
}
function clampSpiralStripperAngle(value){
  const parsed=Number(value);
  return Math.max(0,Math.min(25,Number.isFinite(parsed)?parsed:20));
}
function autoSpiralTransitionGuides(guideCount){
  const total=clampSpiralGuideCount(guideCount);
  return Math.max(0,Math.min(3,total-2));
}
function spiralStripperIndex(guideCount){
  return Math.max(0,clampSpiralGuideCount(guideCount)-1);
}
function spiralGuideFallbackPositionMm(index){
  return Math.max(0,120+(index*180));
}
function setSpiralGuideCount(nextCount){
  const spiral=workshopToolsState.spiral;
  const clamped=clampSpiralGuideCount(nextCount);
  if(spiral.guideCount===clamped)return;
  const existing=Array.isArray(spiral.guides)?spiral.guides:[];
  const layout=calcGuideLayout(+state.firstGuide,clamped,+state.targetStripper);
  const rows=Array.isArray(layout&&layout.rows)?layout.rows:[];
  spiral.guideCount=clamped;
  spiral.guides=rows.map((row,index)=>{
    const previous=existing[index]&&typeof existing[index]==='object'?existing[index]:{};
    return {
      positionMm:Math.max(0,numberOrZero(row&&row.cum)),
      odMm:Math.max(0.01,numberOrZero(previous.odMm)||10),
      angleDeg:180,
    };
  });
  syncSpiralGuidesLength({resetAngles:true});
}
function applySpiralCountDelta(target,delta){
  setSpiralGuideCount(workshopToolsState.spiral.guideCount+delta);
}
function setSpiralGuideAngle(index,nextAngle){
  const spiral=workshopToolsState.spiral;
  if(!Number.isFinite(index) || !spiral.guides[index])return;
  const isStripper=index===spiral.guides.length-1;
  const guide=spiral.guides[index];
  guide.angleDeg=isStripper
    ?clampSpiralStripperAngle(nextAngle)
    :clampSpiralAngle(nextAngle);
  if(isStripper){
    if(spiral.method==='offset'){
      spiral.offsetStartAngle=guide.angleDeg;
    }
    syncSpiralGuidesLength({resetAngles:true});
  }
}
function buildSpiralPresetAngles(method,guideCount,offsetStartAngle,guides){
  const total=clampSpiralGuideCount(guideCount);
  const mode=normalizeSpiralMethod(method);
  const stripperIndex=spiralStripperIndex(total);
  const angles=Array.from({length:total},()=>180);
  const startAngle=mode==='offset'?clampSpiralStripperAngle(offsetStartAngle):0;
  const transitionCount=autoSpiralTransitionGuides(total);
  const segments=Math.max(1,transitionCount+1);
  const transitionEndIndex=Math.max(0,stripperIndex-segments);
  const sourceGuides=Array.isArray(guides)?guides:[];
  const stripperPosition=numberOrZero(sourceGuides[stripperIndex]&&sourceGuides[stripperIndex].positionMm);
  const transitionEndPosition=numberOrZero(sourceGuides[transitionEndIndex]&&sourceGuides[transitionEndIndex].positionMm);
  const transitionLength=Math.abs(stripperPosition-transitionEndPosition);
  const maxTransitionJump=45;
  let previousAngle=startAngle;

  angles[stripperIndex]=startAngle;
  for(let step=1;step<=segments;step+=1){
    const guideIndex=stripperIndex-step;
    if(guideIndex<0)break;
    if(step===segments){
      angles[guideIndex]=180;
      continue;
    }
    const guidePosition=numberOrZero(sourceGuides[guideIndex]&&sourceGuides[guideIndex].positionMm);
    const uniformProgress=step/segments;
    const longitudinalProgress=transitionLength>0
      ?Math.max(0,Math.min(1,Math.abs(stripperPosition-guidePosition)/transitionLength))
      :uniformProgress;
    const progress=(uniformProgress*0.35)+(longitudinalProgress*0.65);
    const desiredAngle=startAngle+((180-startAngle)*progress);
    const remainingSegments=segments-step;
    const minimumAngle=180-(remainingSegments*maxTransitionJump);
    const maximumAngle=previousAngle+maxTransitionJump;
    const nextAngle=Math.max(previousAngle,Math.min(maximumAngle,Math.max(minimumAngle,desiredAngle)));
    angles[guideIndex]=clampSpiralAngle(nextAngle);
    previousAngle=angles[guideIndex];
  }
  return angles.map((value)=>clampSpiralAngle(value));
}
function syncSpiralGuidesLength(options){
  const settings=options&&typeof options==='object'?options:{};
  const spiral=workshopToolsState.spiral;
  spiral.method=normalizeSpiralMethod(spiral.method);
  spiral.direction=normalizeSpiralDirection(spiral.direction);
  const nextCount=clampSpiralGuideCount(spiral.guideCount);
  spiral.guideCount=nextCount;
  spiral.offsetStartAngle=clampSpiralStripperAngle(spiral.offsetStartAngle);
  const current=Array.isArray(spiral.guides)?spiral.guides:[];
  const defaults=buildSpiralPresetAngles(spiral.method,nextCount,spiral.offsetStartAngle,current);
  const next=[];
  for(let index=0;index<nextCount;index+=1){
    const existing=current[index]&&typeof current[index]==='object'?current[index]:{};
    const previous=index>0?next[index-1]:null;
    const fallbackPosition=previous?Math.max(0,numberOrZero(previous.positionMm)+180):spiralGuideFallbackPositionMm(index);
    const existingAngle=Number(existing.angleDeg);
    next.push({
      positionMm:Math.max(0,numberOrZero(existing.positionMm)||fallbackPosition),
      odMm:Math.max(0.01,numberOrZero(existing.odMm)||10),
      angleDeg:settings.resetAngles
        ?defaults[index]
        :Number.isFinite(existingAngle)
          ?clampSpiralAngle(existingAngle)
          :defaults[index],
    });
  }
  spiral.guides=next;
  if(spiral.method==='offset' && spiral.guides.length){
    const stripper=spiral.guides[spiralStripperIndex(spiral.guideCount)];
    if(stripper)spiral.offsetStartAngle=clampSpiralStripperAngle(stripper.angleDeg);
  }
}
function setSpiralMethod(method){
  const spiral=workshopToolsState.spiral;
  const nextMethod=normalizeSpiralMethod(method);
  spiral.method=nextMethod;
  if(nextMethod==='offset' && spiral.guides.length){
    const stripper=spiral.guides[spiralStripperIndex(spiral.guideCount)];
    if(stripper){
      spiral.offsetStartAngle=clampSpiralStripperAngle(stripper.angleDeg||spiral.offsetStartAngle);
    }
  }
  syncSpiralGuidesLength({resetAngles:true});
}
function oppositeSpiralDirection(direction){
  return normalizeSpiralDirection(direction)==='right'?'left':'right';
}
function spiralGuideDirectionForPresentation(direction,options){
  const settings=options&&typeof options==='object'?options:{};
  const normalizedDirection=normalizeSpiralDirection(direction);
  const method=normalizeSpiralMethod(settings.method);
  const angle=clampSpiralAngle(settings.angleDeg);
  if(method==='offset' && settings.isStripper===true && angle<179.95){
    return oppositeSpiralDirection(normalizedDirection);
  }
  return normalizedDirection;
}
function spiralVisualAngleDegrees(angleDeg,direction,options){
  const angle=clampSpiralAngle(angleDeg);
  const renderDirection=spiralGuideDirectionForPresentation(direction,{
    method:options&&options.method,
    isStripper:options&&options.isStripper,
    angleDeg:angle,
  });
  return renderDirection==='right'?(-90+angle):(-90-angle);
}
function spiralOffsetLabel(guide,direction,unit,imperialDisplay,options){
  const settings=options&&typeof options==='object'?options:{};
  const diameterMm=Math.max(0.01,numberOrZero(guide&&guide.odMm));
  const angle=clampSpiralAngle(guide&&guide.angleDeg);
  const circumferenceMm=Math.PI*diameterMm;
  const offsetMm=(circumferenceMm*angle)/360;
  if(angle>=179.95){
    return {
      offsetText:`${formatWorkshopMeasurementValue(offsetMm,unit,imperialDisplay,CORE_MEASUREMENT_FORMAT)} - UNDERSIDE`,
      rotationText:'180 deg - UNDERSIDE',
      directionText:'UNDERSIDE',
    };
  }
  const guideDirection=spiralGuideDirectionForPresentation(direction,{
    method:settings.method,
    isStripper:settings.isStripper,
    angleDeg:angle,
  });
  const side=guideDirection==='right'?'RIGHT':'LEFT';
  return {
    offsetText:`${formatWorkshopMeasurementValue(offsetMm,unit,imperialDisplay,CORE_MEASUREMENT_FORMAT)} ${side} OF TOP LINE`,
    rotationText:`${formatDecimal(angle,1)} deg ${side}`,
    directionText:`${side} SIDE`,
  };
}
function importSpiralFromGuideSpacing(){
  const spiral=workshopToolsState.spiral;
  const layout=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  const rows=Array.isArray(layout&&layout.rows)?layout.rows:[];
  if(!rows.length)return;
  spiral.guideCount=rows.length;
  const existing=Array.isArray(spiral.guides)?spiral.guides:[];
  const defaults=buildSpiralPresetAngles(spiral.method,rows.length,spiral.offsetStartAngle,rows.map((row)=>({positionMm:row&&row.cum})));
  spiral.guides=rows.map((row,index)=>{
    const previous=existing[index]&&typeof existing[index]==='object'?existing[index]:{};
    return {
      positionMm:Math.max(0,numberOrZero(row&&row.cum)),
      odMm:Math.max(0.01,numberOrZero(previous.odMm)||10),
      angleDeg:defaults[index],
    };
  });
}
function syncSpiralGuidePositionsFromLayout(rows){
  const nextRows=Array.isArray(rows)?rows:[];
  if(!nextRows.length)return;
  const spiral=workshopToolsState.spiral;
  const nextCount=nextRows.length;
  const countChanged=spiral.guideCount!==nextCount || !Array.isArray(spiral.guides) || spiral.guides.length!==nextCount;
  spiral.guideCount=nextCount;
  syncSpiralGuidesLength(countChanged?{resetAngles:true}:undefined);
  spiral.guides.forEach((guide,index)=>{
    const row=nextRows[index];
    if(row)guide.positionMm=Math.max(0,numberOrZero(row.cum));
  });
}
function syncSpiralWithGuideLayout(){
  const layout=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  syncSpiralGuidePositionsFromLayout(layout.rows);
}
function captureSpiralGeometry(){
  const spiral=workshopToolsState.spiral;
  return {
    guideCount:spiral.guideCount,
    guides:(Array.isArray(spiral.guides)?spiral.guides:[]).map((guide)=>({
      positionMm:guide.positionMm,
      odMm:guide.odMm,
      angleDeg:guide.angleDeg,
    })),
  };
}
function restoreSpiralGeometry(snapshot){
  if(!snapshot)return;
  const spiral=workshopToolsState.spiral;
  spiral.guideCount=snapshot.guideCount;
  spiral.guides=snapshot.guides.map((guide)=>({...guide}));
  renderSpiralGuideMapper();
}
function renderMeasurementPresentation(){
  const spiralGeometry=captureSpiralGeometry();
  render({preserveSpiralGeometry:true});
  restoreSpiralGeometry(spiralGeometry);
}
function renderSpiralGuideMapper(){
  const card=$('workshopToolSpiral');
  if(!card)return;
  const spiral=workshopToolsState.spiral;
  spiral.unit=activeMeasurementUnits();
  spiral.imperialDisplay=activeImperialDisplay();
  spiral.method=normalizeSpiralMethod(spiral.method);
  spiral.direction=normalizeSpiralDirection(spiral.direction);
  const expandedGuideIndex=Number(spiral.expandedGuideIndex);
  spiral.expandedGuideIndex=Number.isInteger(expandedGuideIndex) && expandedGuideIndex>=0 && expandedGuideIndex<spiral.guides.length
    ?expandedGuideIndex
    :-1;

  const offsetWrap=$('workshopSpiralOffsetStartWrap');
  const offsetInput=$('workshopSpiralOffsetStart');
  const showOffset=spiral.method==='offset';
  if(offsetWrap)offsetWrap.hidden=!showOffset;
  if(offsetInput && document.activeElement!==offsetInput){
    offsetInput.value=formatDecimal(spiral.offsetStartAngle,1);
  }
  if(offsetInput)offsetInput.placeholder='20';

  const guideCountValue=$('workshopSpiralGuideCountValue');
  if(guideCountValue)guideCountValue.textContent=String(spiral.guideCount);

  const showOffsetsToggle=$('workshopSpiralOffsetsToggle');
  const showPhysicalOffsets=!!spiral.showPhysicalOffsets;
  if(showOffsetsToggle){
    showOffsetsToggle.classList.toggle('active',showPhysicalOffsets);
    showOffsetsToggle.setAttribute('aria-pressed',showPhysicalOffsets?'true':'false');
  }

  const canDecreaseGuideCount=spiral.guideCount>1;
  const canIncreaseGuideCount=spiral.guideCount<20;
  const guideDecrement=$('workshopSpiralGuideCountDecrement');
  const guideIncrement=$('workshopSpiralGuideCountIncrement');
  if(guideDecrement)guideDecrement.disabled=!canDecreaseGuideCount;
  if(guideIncrement)guideIncrement.disabled=!canIncreaseGuideCount;

  syncWorkshopToggleButtons(card,'[data-spiral-method]','data-spiral-method',spiral.method);
  syncWorkshopToggleButtons(card,'[data-spiral-direction]','data-spiral-direction',spiral.direction);

  const visualDirection=$('workshopSpiralVisualDirection');
  if(visualDirection){
    visualDirection.textContent=`STRIPPER G1 · ${spiral.direction.toUpperCase()} TRANSITION`;
  }

  renderSpiralMapperVisual(spiral);
  renderSpiralGuideRows(spiral,showPhysicalOffsets);
}
function renderSpiralMapperVisual(spiral){
  const visualCanvas=$('workshopSpiralVisualCanvas');
  if(!visualCanvas)return;
  const guides=Array.isArray(spiral.guides)?spiral.guides:[];
  const stripperIndex=Math.max(0,guides.length-1);
  const undersideIndexes=guides
    .map((guide,index)=>clampSpiralAngle(guide.angleDeg)>=179.95?index:-1)
    .filter((index)=>index>=0);
  const undersideIndexSet=new Set(undersideIndexes);
  const undersideCount=undersideIndexes.length;
  const selectedIndex=Number.isInteger(spiral.expandedGuideIndex)?spiral.expandedGuideIndex:-1;
  const markerPoints=[];
  const markerEntries=guides.map((guide,index)=>{
    const isStripper=index===stripperIndex;
    const isSelected=index===selectedIndex;
    const isUnderside=undersideIndexSet.has(index);
    const visualAngleDegrees=spiralVisualAngleDegrees(guide.angleDeg,spiral.direction,{method:spiral.method,isStripper});
    const visualAngle=(visualAngleDegrees*Math.PI)/180;
    let x=110+(Math.cos(visualAngle)*68);
    let y=110+(Math.sin(visualAngle)*68);
    if(isUnderside){
      x=110;
      y=178;
    }
    markerPoints.push({index,x,y});
    const displayGuideNumber=guides.length-index;
    const markerRotation=visualAngleDegrees+90;
    if(isUnderside){
      return `
        <g class="spiral-map-marker spiral-map-marker--underside-member${isSelected?' spiral-map-marker--selected':''}" data-guide-index="${index}" tabindex="0" role="button" transform="translate(${formatDecimal(x,2)} ${formatDecimal(y,2)})" aria-label="Guide ${displayGuideNumber} running guide at 180 degrees underside" aria-pressed="${isSelected?'true':'false'}"></g>
      `;
    }
    return `
      <g class="spiral-map-marker${isStripper?' spiral-map-marker--stripper':''}${isSelected?' spiral-map-marker--selected':''}" data-guide-index="${index}" tabindex="0" role="button" transform="translate(${formatDecimal(x,2)} ${formatDecimal(y,2)}) rotate(${formatDecimal(markerRotation,2)})" aria-label="Guide ${displayGuideNumber}${isStripper?' stripper':''}" aria-pressed="${isSelected?'true':'false'}">
        <line class="spiral-map-marker__stem" x1="0" y1="7" x2="0" y2="-13"></line>
        <ellipse class="spiral-map-marker__ring" cx="0" cy="-16" rx="7" ry="4.2"></ellipse>
        <circle class="spiral-map-marker__core" cx="0" cy="0" r="${isSelected?'9':'4.5'}"></circle>
        ${isSelected?`<text x="0" y="0.5" transform="rotate(${-markerRotation.toFixed(2)} 0 0.5)" text-anchor="middle" dominant-baseline="middle">${displayGuideNumber}</text>`:''}
      </g>
    `;
  });
  if(selectedIndex>=0 && selectedIndex<markerEntries.length){
    markerEntries.push(markerEntries.splice(selectedIndex,1)[0]);
  }
  const markerSvg=markerEntries.filter(Boolean).join('');

  const progressionPoints=[];
  for(let index=stripperIndex;index>=0;index-=1){
    const found=markerPoints.find((point)=>point.index===index);
    if(found)progressionPoints.push(`${formatDecimal(found.x,2)},${formatDecimal(found.y,2)}`);
  }
  const progressionPolyline=progressionPoints.length>1
    ?`<polyline class="spiral-map-path" points="${progressionPoints.join(' ')}"></polyline>`
    :'';

  const undersideStackMarker=undersideCount
    ?`<g class="spiral-map-underside-stack" transform="translate(110 178)" aria-label="${undersideCount} running guide${undersideCount===1?'':'s'} at 180 degrees underside">
        <line class="spiral-map-marker__stem" x1="0" y1="7" x2="0" y2="-13"></line>
        <ellipse class="spiral-map-marker__ring" cx="0" cy="-16" rx="7" ry="4.2"></ellipse>
        <circle class="spiral-map-marker__core" cx="0" cy="0" r="4.8"></circle>
        ${undersideCount>1?`<text class="spiral-map-underside-count" x="14" y="5">x${undersideCount}</text>`:''}
      </g>`
    :'';
  const selectedUndersideMarker=undersideIndexSet.has(selectedIndex)
    ?`<g class="spiral-map-underside-selection" transform="translate(110 178)">
        <circle cx="0" cy="0" r="9"></circle>
        <text x="0" y=".5" text-anchor="middle" dominant-baseline="middle">${guides.length-selectedIndex}</text>
      </g>`
    :'';

  visualCanvas.innerHTML=`
    <svg viewBox="0 0 220 220" role="img" aria-label="Spiral mapper reference">
      <circle class="spiral-map-ring" cx="110" cy="110" r="80"></circle>
      <line class="spiral-map-axis" x1="110" y1="26" x2="110" y2="194"></line>
      <line class="spiral-map-axis" x1="26" y1="110" x2="194" y2="110"></line>
      <text class="spiral-map-label" x="110" y="14" text-anchor="middle">TOP 0 deg</text>
      <text class="spiral-map-label" x="10" y="66" text-anchor="start">LEFT 90 deg</text>
      <text class="spiral-map-label" x="210" y="66" text-anchor="end">RIGHT 90 deg</text>
      <text class="spiral-map-label spiral-map-label--underside" x="110" y="216" text-anchor="middle">UNDERSIDE 180 deg</text>
      ${progressionPolyline}
      ${markerSvg}
      ${undersideStackMarker}
      ${selectedUndersideMarker}
      <g class="spiral-map-tiptop" aria-label="Tip top at 180 degrees underside">
        <circle cx="110" cy="203" r="4.7"></circle>
        <text x="110" y="201" text-anchor="middle">TIP TOP</text>
      </g>
    </svg>
  `;
  assertSpiralMapperMarkerCount(visualCanvas,guides.length);
}
function assertSpiralMapperMarkerCount(visualCanvas,expectedCount){
  const rendered=visualCanvas.querySelectorAll('.spiral-map-marker').length;
  if(rendered!==expectedCount && typeof console!=='undefined' && console.warn){
    console.warn(`Spiral mapper marker mismatch: rendered ${rendered}, expected ${expectedCount}`);
  }
}
function renderSpiralGuideRows(spiral,showPhysicalOffsets){
  const rowsHost=$('workshopSpiralGuideRows');
  if(rowsHost){
    const guides=Array.isArray(spiral.guides)?spiral.guides:[];
    const stripperIndex=Math.max(0,guides.length-1);
    const focusMemo=captureSpiralRowFocus(rowsHost);
    const displayIndexes=Array.from({length:guides.length},(_,offset)=>stripperIndex-offset);
    rowsHost.innerHTML=displayIndexes.map((index)=>{
      const guide=guides[index];
      if(!guide)return '';
      const isStripper=index===stripperIndex;
      const labels=spiralOffsetLabel(guide,spiral.direction,spiral.unit,spiral.imperialDisplay,{method:spiral.method,isStripper});
      const displayGuideNumber=guides.length-index;
      const angle=clampSpiralAngle(guide.angleDeg);
      const isReferenceAngle=angle<=0.05 || angle>=179.95;
      const showOdField=showPhysicalOffsets && !isReferenceAngle;
      const showOffsetRow=showPhysicalOffsets && !isReferenceAngle;
      const referenceText=angle>=179.95?'UNDERSIDE':'TOP LINE';
      const isExpanded=index===spiral.expandedGuideIndex;
      const guideType=isStripper?'STRIPPER':isReferenceAngle?'RUNNING':'TRANSITION';
      return `
        <article class="spiral-guide-row${isStripper?' spiral-guide-row--stripper':''}${isExpanded?' spiral-guide-row--expanded':''}" data-spiral-row="${index}">
          <button class="spiral-guide-row__summary" type="button" data-spiral-expand-index="${index}" aria-expanded="${isExpanded?'true':'false'}">
            <strong>Guide ${displayGuideNumber}</strong>
            <span>${guideType}</span>
            <span>${formatWorkshopMeasurementValue(guide.positionMm,spiral.unit,spiral.imperialDisplay,CORE_MEASUREMENT_FORMAT)}</span>
            <span>${labels.rotationText}</span>
          </button>
          ${isStripper?'<p class="spiral-guide-row__stripper">STRIPPER</p>':''}
          <div class="spiral-guide-row__edit${isExpanded?'':' spiral-guide-row__edit--collapsed'}">
            <div class="spiral-guide-row__fields${showOdField?'':' spiral-guide-row__fields--basic'}">
            <label>
              <span>Position From Tip (${workshopUnitSuffix(spiral.unit)})</span>
              <input type="text" inputmode="decimal" autocomplete="off" data-spiral-field="position" data-guide-index="${index}" value="${escapeHtml(workshopMeasurementInputText(guide.positionMm,spiral.unit,spiral.imperialDisplay))}" />
            </label>
            ${showOdField?`<label>
              <span>Blank OD</span>
              <input type="text" inputmode="decimal" autocomplete="off" data-spiral-field="od" data-guide-index="${index}" value="${escapeHtml(workshopMeasurementInputText(guide.odMm,spiral.unit,spiral.imperialDisplay))}" />
            </label>`:''}
            <label>
              <span>Rotation</span>
              <div class="spiral-rotation-control" role="group" aria-label="Guide ${displayGuideNumber} rotation control">
                <button class="layout-control-card__button" type="button" data-spiral-angle-action="decrement" data-guide-index="${index}" aria-label="Decrease guide ${displayGuideNumber} rotation by 5 degrees">−</button>
                <div class="spiral-rotation-control__value-wrap">
                  <input class="spiral-rotation-control__value" type="text" inputmode="decimal" autocomplete="off" data-spiral-field="angle" data-guide-index="${index}" value="${escapeHtml(formatDecimal(guide.angleDeg,1))}" aria-label="Guide ${displayGuideNumber} rotation value" />
                  <span class="spiral-rotation-control__unit" aria-hidden="true">°</span>
                </div>
                <button class="layout-control-card__button" type="button" data-spiral-angle-action="increment" data-guide-index="${index}" aria-label="Increase guide ${displayGuideNumber} rotation by 5 degrees">+</button>
              </div>
            </label>
            </div>
            <div class="spiral-guide-row__details">
              ${showOffsetRow?`<div><span>Offset From Top</span><strong>${labels.offsetText}</strong></div>`:''}
              ${showPhysicalOffsets && isReferenceAngle?`<div><span>Reference</span><strong>${referenceText}</strong></div>`:''}
            </div>
          </div>
        </article>
      `;
    }).join('');
    restoreSpiralRowFocus(rowsHost,focusMemo);
  }
}
// Rows are rebuilt on every keystroke so the mapper stays live; keep the caret where the user left it.
function captureSpiralRowFocus(rowsHost){
  const active=document.activeElement;
  if(!active || !rowsHost.contains(active))return null;
  const field=active.getAttribute&&active.getAttribute('data-spiral-field');
  const angleAction=active.getAttribute&&active.getAttribute('data-spiral-angle-action');
  const index=active.getAttribute&&active.getAttribute('data-guide-index');
  if(index===null||index===undefined)return null;
  if(field){
    return {
      selector:`[data-spiral-field="${field}"][data-guide-index="${index}"]`,
      value:active.value,
      start:active.selectionStart,
      end:active.selectionEnd,
    };
  }
  if(angleAction){
    return {selector:`[data-spiral-angle-action="${angleAction}"][data-guide-index="${index}"]`};
  }
  return null;
}
function restoreSpiralRowFocus(rowsHost,memo){
  if(!memo)return;
  const next=rowsHost.querySelector(memo.selector);
  if(!next)return;
  if(typeof memo.value==='string')next.value=memo.value;
  next.focus({preventScroll:true});
  if(Number.isFinite(memo.start) && typeof next.setSelectionRange==='function'){
    try{next.setSelectionRange(memo.start,memo.end);}catch(error){/* unsupported input type */}
  }
}
function renderWorkshopToolVisibility(){
  const list=$('workshopToolsList');
  const diameterCard=$('workshopToolDiameter');
  const gripCard=$('workshopToolGrip');
  const spiralCard=$('workshopToolSpiral');
  const activeTool=workshopToolsState.activeTool;
  if(list)list.hidden=activeTool!=='list';
  if(diameterCard)diameterCard.hidden=activeTool!=='diameter';
  if(gripCard)gripCard.hidden=activeTool!=='grip';
  if(spiralCard)spiralCard.hidden=activeTool!=='spiral';
}
function isWorkshopLandingScreenActive(){
  const workshopLandingScreen=$('workshopLandingScreen');
  return !!(workshopLandingScreen && workshopLandingScreen.classList.contains('active'));
}
function goToWorkshopLandingScreen(){
  workshopLandingReturnFocusTool=workshopToolsState.activeTool;
  workshopToolsState.activeTool='list';
  goScreen('workshopLandingScreen');
}
function prepareWorkshopLandingEntry(){
  workshopLandingReturnFocusTool='';
  workshopToolsState.activeTool='list';
}
function openWorkshopTool(tool){
  if(tool==='guide-spacing'){
    goScreen('layoutScreen');
    return;
  }
  workshopToolsState.activeTool=tool==='grip'?'grip':tool==='spiral'?'spiral':'diameter';
  workshopLandingReturnFocusTool=workshopToolsState.activeTool;
  goScreen('workshopLandingScreen');
  window.setTimeout(()=>{
    renderWorkshopCalculator();
    focusWorkshopToolPrimaryInput(workshopToolsState.activeTool);
  },0);
}
function renderDiameterCircumferenceTool(){
  const diameterInput=$('workshopDcDiameter');
  const circumferenceInput=$('workshopDcCircumference');
  if(!diameterInput || !circumferenceInput)return;

  const state=workshopToolsState.diameter;
  state.unit=activeMeasurementUnits();
  state.imperialDisplay=activeImperialDisplay();
  state.diameterMm=Math.max(0.01,numberOrZero(state.diameterMm));

  const circumferenceMm=state.diameterMm*Math.PI;

  syncWorkshopMeasurementInput(diameterInput,state.diameterMm,state.unit,state.imperialDisplay,28);
  syncWorkshopMeasurementInput(circumferenceInput,circumferenceMm,state.unit,state.imperialDisplay,28*Math.PI);

  const primaryLabel=$('workshopDcPrimaryLabel');
  const primaryValue=$('workshopDcPrimaryValue');
  const showingDiameter=state.lastEdited==='circumference';
  if(primaryLabel)primaryLabel.textContent=showingDiameter?'Diameter':'Circumference';
  if(primaryValue){
    primaryValue.textContent=showingDiameter
      ? formatWorkshopMeasurementValue(state.diameterMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT)
      : formatWorkshopMeasurementValue(circumferenceMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT);
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

}
function buildGripCutEndGuideSvg(options){
  const settings=options&&typeof options==='object'?options:{};
  const title=String(settings.title||'START END').toUpperCase();
  const angle=Math.max(0,numberOrZero(settings.cutAngleDeg));
  const widthMm=Math.max(1,numberOrZero(settings.materialWidthMm));
  const mirror=!!settings.mirror;
  const cutOffsetMm=gripCutOffsetMm(angle,widthMm);
  const segmentLengthMm=Math.max(84,cutOffsetMm+54);
  const padX=10;
  const padY=12;
  const startX=padX+12;
  const topY=padY+10;
  const bottomY=topY+widthMm;
  const endX=startX+segmentLengthMm;
  const cutStartX=mirror?(startX+cutOffsetMm):startX;
  const cutEndX=mirror?startX:(startX+cutOffsetMm);
  const midLabelX=(cutStartX+cutEndX)/2;
  const midLabelY=(topY+bottomY)/2;
  const widthMarkerX=endX-7;
  const arrowY=bottomY+9;
  const arrowStartX=startX+6;
  const arrowEndX=Math.min(endX-6,arrowStartX+36);
  const sheetWidth=padX+segmentLengthMm+20;
  const sheetHeight=bottomY+24;
  const angleLabel=gripCutAngleLabel(angle);

  return `
    <svg class="cut-guide-svg" width="${formatDecimal(sheetWidth,2)}mm" height="${formatDecimal(sheetHeight,2)}mm" viewBox="0 0 ${formatDecimal(sheetWidth,2)} ${formatDecimal(sheetHeight,2)}" role="img" aria-label="${escapeHtml(title)} cut template">
      <defs>
        <marker id="arrowhead-${escapeHtml(String(title).toLowerCase().replace(/\s+/g,'-'))}" markerWidth="3.4" markerHeight="2.8" refX="3.2" refY="1.4" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L3.2,1.4 L0,2.8 Z" fill="#111" />
        </marker>
      </defs>
      <rect x="0.3" y="0.3" width="${formatDecimal(sheetWidth-0.6,2)}" height="${formatDecimal(sheetHeight-0.6,2)}" class="guide-frame"/>
      <text x="${formatDecimal(startX,2)}" y="${formatDecimal(topY-4.8,2)}" class="guide-title">${escapeHtml(title)}</text>

      <line x1="${formatDecimal(startX,2)}" y1="${formatDecimal(topY,2)}" x2="${formatDecimal(endX,2)}" y2="${formatDecimal(topY,2)}" class="guide-edge"/>
      <line x1="${formatDecimal(startX,2)}" y1="${formatDecimal(bottomY,2)}" x2="${formatDecimal(endX,2)}" y2="${formatDecimal(bottomY,2)}" class="guide-edge guide-edge--secondary"/>
      <text x="${formatDecimal(startX,2)}" y="${formatDecimal(topY-1.1,2)}" class="guide-label">MATERIAL EDGE / REFERENCE EDGE</text>

      <line x1="${formatDecimal(cutStartX,2)}" y1="${formatDecimal(topY,2)}" x2="${formatDecimal(cutEndX,2)}" y2="${formatDecimal(bottomY,2)}" class="guide-cut-line"/>
      <text x="${formatDecimal(midLabelX+(mirror?-5:5),2)}" y="${formatDecimal(midLabelY-1.4,2)}" class="guide-label" text-anchor="${mirror?'end':'start'}">CUT LINE</text>

      <line x1="${formatDecimal(widthMarkerX,2)}" y1="${formatDecimal(topY,2)}" x2="${formatDecimal(widthMarkerX,2)}" y2="${formatDecimal(bottomY,2)}" class="guide-width"/>
      <line x1="${formatDecimal(widthMarkerX-2.1,2)}" y1="${formatDecimal(topY,2)}" x2="${formatDecimal(widthMarkerX+2.1,2)}" y2="${formatDecimal(topY,2)}" class="guide-width"/>
      <line x1="${formatDecimal(widthMarkerX-2.1,2)}" y1="${formatDecimal(bottomY,2)}" x2="${formatDecimal(widthMarkerX+2.1,2)}" y2="${formatDecimal(bottomY,2)}" class="guide-width"/>
      <text x="${formatDecimal(widthMarkerX-2.8,2)}" y="${formatDecimal((topY+bottomY)/2,2)}" class="guide-label" text-anchor="end">COVERING WIDTH</text>

      <line x1="${formatDecimal(arrowStartX,2)}" y1="${formatDecimal(arrowY,2)}" x2="${formatDecimal(arrowEndX,2)}" y2="${formatDecimal(arrowY,2)}" class="guide-arrow" marker-end="url(#arrowhead-${escapeHtml(String(title).toLowerCase().replace(/\s+/g,'-'))})"/>
      <text x="${formatDecimal(arrowStartX,2)}" y="${formatDecimal(arrowY-1.6,2)}" class="guide-label">WRAP DIRECTION</text>

      <text x="${formatDecimal(startX,2)}" y="${formatDecimal(bottomY+16.2,2)}" class="guide-angle">${escapeHtml(title)} CUT ANGLE: ${escapeHtml(angleLabel)}</text>
    </svg>
  `;
}
function openGripCutTemplatePrint(){
  if(!gripCutTemplateSnapshot){
    openInfoDialog('Template Unavailable','Enter grip values first to generate a cut template.');
    return;
  }
  const template=gripCutTemplateSnapshot;
  const summaryRows=[
    {label:'Grip Type',value:template.gripTypeLabel},
  ];
  if(template.profile==='tapered'){
    summaryRows.push({label:'Start Diameter',value:template.startDiameterText});
    summaryRows.push({label:'End Diameter',value:template.endDiameterText});
  }else{
    summaryRows.push({label:'Grip Diameter',value:template.gripDiameterText});
  }
  summaryRows.push({label:'Grip Length',value:template.gripLengthText});
  summaryRows.push({label:'Covering Width',value:template.coveringWidthText});
  summaryRows.push({label:'Material Required',value:template.requiredLengthText});
  summaryRows.push({label:'Allowance',value:template.allowanceText});
  summaryRows.push({label:'Start Cut Angle',value:gripCutAngleLabel(template.startCutAngle)});
  if(template.profile==='tapered'){
    summaryRows.push({label:'Finish Cut Angle',value:gripCutAngleLabel(template.finishCutAngle)});
  }
  summaryRows.push({label:'Date',value:template.dateText});

  const summaryHtml=summaryRows.map((row)=>`<div class="summary-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join('');
  const startGuideSvg=buildGripCutEndGuideSvg({
    title:'Start End',
    cutAngleDeg:template.startCutAngle,
    materialWidthMm:template.coverWidthMm,
    mirror:false,
  });
  const finishGuideSvg=template.profile==='tapered'?buildGripCutEndGuideSvg({
    title:'Finish End',
    cutAngleDeg:template.finishCutAngle,
    materialWidthMm:template.coverWidthMm,
    mirror:true,
  }):'';
  const calibrationLengthLabel=template.unit==='imperial'?'50 mm / 1.969 in':'50 mm';
  const calibrationLengthMm=50;
  const calibrationLineHtml=`<div class="calibration"><p><strong>${escapeHtml(calibrationLengthLabel)} CHECK LINE</strong> <span>MEASURE THIS AFTER PRINTING</span></p><div class="calibration-line" style="width:${formatDecimal(calibrationLengthMm,2)}mm"></div></div>`;
  const instructionsHtml=`<ol class="instructions"><li>Print at 100% / Actual Size.</li><li>Measure the calibration line before use; if it is wrong, do not use this template.</li><li>Align your material edge to the REFERENCE EDGE line.</li><li>Mark and cut on the labelled CUT LINE.</li><li>Follow the WRAP DIRECTION arrow when starting the wrap.</li><li>Material Required includes the entered allowance.</li></ol>`;
  const printHtml=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Grip Wrap Cut Template</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    html,body{ margin:0; padding:0; background:#e8e8e8; color:#111; font-family: "Segoe UI", Arial, sans-serif; }
    body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .preview-shell{ min-height:100dvh; padding:14px; display:grid; gap:12px; }
    .preview-controls{ position:sticky; top:0; z-index:3; display:flex; gap:8px; justify-content:flex-end; align-items:center; background:#f3f3f3; border:1px solid #c7c7c7; border-radius:10px; padding:8px; }
    .preview-btn{ border:1px solid #1b1b1b; background:#fff; color:#111; border-radius:8px; min-height:38px; padding:0 14px; font-size:12px; letter-spacing:.04em; text-transform:uppercase; font-weight:700; cursor:pointer; }
    .preview-btn:hover,.preview-btn:focus-visible{ background:#f6f6f6; }
    .preview-tip{ margin:0 auto 0 0; font-size:11px; color:#3a3a3a; }
    .sheet{ width:100%; max-width:180mm; margin:0 auto; display:grid; gap:6mm; }
    h1{ margin:0; font-size:19pt; letter-spacing:.01em; color:#1a1a1a; }
    .brand{ font-size:9.5pt; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#6a2228; }
    .meta{ font-size:9.2pt; color:#202020; }
    .print-instruction{ font-size:8.8pt; font-weight:700; letter-spacing:.04em; text-transform:uppercase; border:1pt solid #1b1b1b; padding:2mm 2.6mm; }
    .summary{ border:1pt solid #1f1f1f; padding:3mm; display:grid; gap:2mm; }
    .summary-row{ display:flex; justify-content:space-between; align-items:baseline; gap:8mm; border-bottom:.4pt solid #bbb; padding-bottom:1.3mm; }
    .summary-row:last-child{ border-bottom:none; padding-bottom:0; }
    .summary-row span{ font-size:7.9pt; text-transform:uppercase; letter-spacing:.08em; color:#3f3f3f; }
    .summary-row strong{ font-size:10pt; text-align:right; font-weight:700; color:#111; }
    .calibration{ border:1pt solid #1f1f1f; padding:2.4mm 3mm; display:grid; gap:1.8mm; }
    .calibration p{ margin:0; font-size:8.6pt; letter-spacing:.03em; text-transform:uppercase; display:flex; justify-content:space-between; gap:6mm; }
    .calibration p strong{ font-weight:800; }
    .calibration p span{ font-weight:600; color:#2a2a2a; }
    .calibration-line{ height:0; border-top:1.4pt solid #111; }
    .guides{ display:grid; gap:4mm; }
    .guide-panel{ border:1pt solid #1f1f1f; padding:2.8mm; }
    .guide-panel h2{ margin:0 0 2mm; font-size:9.2pt; text-transform:uppercase; letter-spacing:.08em; }
    .cut-guide-svg{ display:block; max-width:none; height:auto; }
    .guide-frame{ fill:none; stroke:#d0d0d0; stroke-width:.35; }
    .guide-edge{ stroke:#181818; stroke-width:.52; }
    .guide-edge--secondary{ stroke:#6b6b6b; stroke-dasharray:1.1 1.1; }
    .guide-cut-line{ stroke:#111; stroke-width:.7; }
    .guide-width{ stroke:#111; stroke-width:.32; }
    .guide-arrow{ stroke:#111; stroke-width:.42; }
    .guide-title{ font-size:3.3px; font-weight:800; letter-spacing:.16px; fill:#111; }
    .guide-label{ font-size:2.5px; letter-spacing:.08px; fill:#1a1a1a; }
    .guide-angle{ font-size:2.9px; letter-spacing:.1px; font-weight:700; fill:#111; }
    .instructions{ margin:0; padding-left:4.8mm; display:grid; gap:1.2mm; font-size:8.6pt; color:#161616; }
    .instructions li{ line-height:1.32; }
    @media print{
      html,body{ background:#fff; }
      .preview-shell{ padding:0; gap:0; }
      .preview-controls{ display:none !important; }
    }
  </style>
</head>
<body>
  <div class="preview-shell">
    <div class="preview-controls" aria-label="Template preview actions">
      <p class="preview-tip">Inspect template, then print.</p>
      <button id="previewPrintBtn" class="preview-btn" type="button">Print Template</button>
      <button id="previewCloseBtn" class="preview-btn" type="button">Close / Back to Grip Wrap</button>
    </div>
    <main class="sheet">
      <header>
        <div class="brand">K-Labs Studio</div>
        <h1>Grip Wrap Cut Template</h1>
        <div class="meta">Use this workshop sheet to mark and cut wrap material ends before wrapping.</div>
      </header>
      <div class="print-instruction">PRINT AT 100% / ACTUAL SIZE</div>
      <section class="summary" aria-label="Measurement summary">
        ${summaryHtml}
      </section>
      ${calibrationLineHtml}
      <section class="guides" aria-label="1 to 1 cut geometry guide">
        <article class="guide-panel" aria-label="Start end cut template">
          <h2>Start End Template (1:1)</h2>
          ${startGuideSvg}
        </article>
        ${template.profile==='tapered'?`<article class="guide-panel" aria-label="Finish end cut template"><h2>Finish End Template (1:1)</h2>${finishGuideSvg}</article>`:''}
      </section>
      <section aria-label="Template instructions">
        ${instructionsHtml}
      </section>
    </main>
  </div>
  <script>
    (function(){
      var printBtn=document.getElementById('previewPrintBtn');
      var closeBtn=document.getElementById('previewCloseBtn');
      if(printBtn){
        printBtn.addEventListener('click',function(){
          try{window.focus();}catch(_error){}
          try{window.print();}catch(_error){}
        });
      }
      if(closeBtn){
        closeBtn.addEventListener('click',function(){
          try{ if(window.opener && !window.opener.closed){ window.opener.focus(); } }catch(_error){}
          try{ window.close(); }catch(_error){}
          if(!window.closed){
            try{
              if(window.history.length>1){ window.history.back(); }
            }catch(_error){}
          }
        });
      }
    })();
  </script>
</body>
</html>`;

  const printWindow=window.open('about:blank','_blank','width=980,height=1240');
  if(!printWindow || !printWindow.document){
    openInfoDialog('Print Blocked','Allow pop-ups for this site, then try Print Cut Template again.');
    return;
  }
  try{
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
  }catch(_error){
    try{printWindow.close();}catch{}
    openInfoDialog('Print Unavailable','Could not render the print template window. Check pop-up permissions and try again.');
    return;
  }
  try{printWindow.focus();}catch{}
}
function renderGripCoveringTool(){
  const panel=$('workshopToolsPanel');
  if(!panel)return;
  const state=workshopToolsState.grip;
  state.unit=activeMeasurementUnits();
  state.imperialDisplay=activeImperialDisplay();
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

  const gripDiameterInput=$('workshopGripDiameter');
  const startDiameterInput=$('workshopGripStartDiameter');
  const endDiameterInput=$('workshopGripEndDiameter');
  const gripLengthInput=$('workshopGripLength');
  const coverWidthInput=$('workshopGripCoverWidth');
  const allowanceInput=$('workshopGripAllowance');

  syncWorkshopMeasurementInput(gripDiameterInput,state.straightDiameterMm,state.unit,state.imperialDisplay,28);
  syncWorkshopMeasurementInput(startDiameterInput,state.startDiameterMm,state.unit,state.imperialDisplay,30);
  syncWorkshopMeasurementInput(endDiameterInput,state.endDiameterMm,state.unit,state.imperialDisplay,24);
  syncWorkshopMeasurementInput(gripLengthInput,state.lengthMm,state.unit,state.imperialDisplay,280);
  syncWorkshopMeasurementInput(coverWidthInput,state.coverWidthMm,state.unit,state.imperialDisplay,25);
  if(allowanceInput && document.activeElement!==allowanceInput){
    allowanceInput.value=formatDecimal(state.allowancePercent,1);
  }
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
  // Sanity check only: how much the cut angle actually changes across the taper (not a third angle to cut).
  const cutAngleDifference=Math.abs(startCutAngle-finishCutAngle);

  const requiredEl=$('workshopGripMaterialRequired');
  const revolutionsEl=$('workshopGripRevolutions');
  const spiralEl=$('workshopGripSpiralLength');
  const startCutEl=$('workshopGripStartCutAngle');
  const finishCutEl=$('workshopGripFinishCutAngle');
  const finishCutRow=$('workshopGripFinishCutAngleRow');
  const angleDifferenceEl=$('workshopGripAverageCutAngle');
  const angleDifferenceRow=$('workshopGripAverageCutAngleRow');
  const printActions=$('workshopGripPrintActions');

  if(requiredEl)requiredEl.textContent=formatWorkshopMeasurementValue(requiredMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT);
  if(revolutionsEl)revolutionsEl.textContent=formatDecimal(revolutions,2);
  if(spiralEl)spiralEl.textContent=formatWorkshopMeasurementValue(spiralWrapLengthMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT);
  if(startCutEl)startCutEl.textContent=gripCutAngleLabel(startCutAngle);

  if(finishCutRow)finishCutRow.hidden=!showFinishCutAngle;
  if(finishCutEl)finishCutEl.textContent=gripCutAngleLabel(finishCutAngle);

  if(angleDifferenceRow)angleDifferenceRow.hidden=!showFinishCutAngle;
  if(angleDifferenceEl)angleDifferenceEl.textContent=`${formatDecimal(cutAngleDifference,1)} deg`;

  const hasAngleOutput=state.lengthMm>0 && state.coverWidthMm>0 && Number.isFinite(startCutAngle) && startCutAngle>0;
  if(printActions)printActions.hidden=!hasAngleOutput;
  gripCutTemplateSnapshot=hasAngleOutput?{
    profile:state.profile,
    unit:state.unit,
    imperialDisplay:state.imperialDisplay,
    gripTypeLabel:state.profile==='tapered'?'Tapered Grip':'Straight Grip',
    gripDiameterText:formatWorkshopMeasurementValue(state.straightDiameterMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT),
    startDiameterText:formatWorkshopMeasurementValue(state.startDiameterMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT),
    endDiameterText:formatWorkshopMeasurementValue(state.endDiameterMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT),
    coverWidthMm:state.coverWidthMm,
    startCutAngle,
    finishCutAngle,
    coveringWidthText:formatWorkshopMeasurementValue(state.coverWidthMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT),
    gripLengthText:formatWorkshopMeasurementValue(state.lengthMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT),
    requiredLengthText:formatWorkshopMeasurementValue(requiredMm,state.unit,state.imperialDisplay,CORE_MEASUREMENT_FORMAT),
    allowanceText:`${formatDecimal(state.allowancePercent,1)}%`,
    dateText:formatDateDisplay(new Date(),{includeTime:false}),
  }:null;

  syncWorkshopToggleButtons(panel,'[data-grip-profile]','data-grip-profile',state.profile);
}
function renderWorkshopCalculator(){
  refreshWorkshopMeasurementLabels();
  renderWorkshopToolVisibility();
  renderDiameterCircumferenceTool();
  renderGripCoveringTool();
  renderSpiralGuideMapper();
}
function bindWorkshopCalculatorControls(){
  const panel=$('workshopToolsPanel');
  if(!panel || panel.getAttribute('data-workshop-calculator-bound')==='true')return;
  panel.setAttribute('data-workshop-calculator-bound','true');

  panel.querySelectorAll('[data-workshop-tool-open]').forEach((button)=>{
    button.addEventListener('click',()=>{
      const nextTool=button.getAttribute('data-workshop-tool-open');
      openWorkshopTool(nextTool||'diameter');
    });
  });
  panel.querySelectorAll('[data-workshop-tool-back]').forEach((button)=>{
    button.addEventListener('click',()=>{
      goToWorkshopLandingScreen();
    });
  });

  const diameterInput=$('workshopDcDiameter');
  const circumferenceInput=$('workshopDcCircumference');
  bindWorkshopCalculatorInput(diameterInput,()=>{
    const state=workshopToolsState.diameter;
    state.diameterMm=parseWorkshopMeasurementMm(diameterInput.value,state.unit,state.diameterMm,false);
    state.lastEdited='diameter';
    renderWorkshopCalculator();
  });
  bindWorkshopCalculatorInput(circumferenceInput,()=>{
    const state=workshopToolsState.diameter;
    const circumferenceMm=parseWorkshopMeasurementMm(circumferenceInput.value,state.unit,state.diameterMm*Math.PI,false);
    state.diameterMm=Math.max(0.01,circumferenceMm/Math.PI);
    state.lastEdited='circumference';
    renderWorkshopCalculator();
  });
  const gripDiameterInput=$('workshopGripDiameter');
  const gripStartDiameterInput=$('workshopGripStartDiameter');
  const gripEndDiameterInput=$('workshopGripEndDiameter');
  const gripLengthInput=$('workshopGripLength');
  const coverWidthInput=$('workshopGripCoverWidth');
  const allowanceInput=$('workshopGripAllowance');

  bindWorkshopCalculatorInput(gripDiameterInput,()=>{
    const state=workshopToolsState.grip;
    state.straightDiameterMm=parseWorkshopMeasurementMm(gripDiameterInput.value,state.unit,state.straightDiameterMm,false);
    renderWorkshopCalculator();
  });
  bindWorkshopCalculatorInput(gripStartDiameterInput,()=>{
    const state=workshopToolsState.grip;
    state.startDiameterMm=parseWorkshopMeasurementMm(gripStartDiameterInput.value,state.unit,state.startDiameterMm,false);
    renderWorkshopCalculator();
  });
  bindWorkshopCalculatorInput(gripEndDiameterInput,()=>{
    const state=workshopToolsState.grip;
    state.endDiameterMm=parseWorkshopMeasurementMm(gripEndDiameterInput.value,state.unit,state.endDiameterMm,false);
    renderWorkshopCalculator();
  });
  bindWorkshopCalculatorInput(gripLengthInput,()=>{
    const state=workshopToolsState.grip;
    state.lengthMm=parseWorkshopMeasurementMm(gripLengthInput.value,state.unit,state.lengthMm,true);
    renderWorkshopCalculator();
  });
  bindWorkshopCalculatorInput(coverWidthInput,()=>{
    const state=workshopToolsState.grip;
    state.coverWidthMm=parseWorkshopMeasurementMm(coverWidthInput.value,state.unit,state.coverWidthMm,false);
    renderWorkshopCalculator();
  });
  bindWorkshopCalculatorInput(allowanceInput,()=>{
    const state=workshopToolsState.grip;
    const next=Number(allowanceInput.value);
    if(Number.isFinite(next) && next>=0){
      state.allowancePercent=next;
    }
    renderWorkshopCalculator();
  });

  bindWorkshopToggleButtons(panel,'[data-grip-profile]',(button)=>{
    workshopToolsState.grip.profile=button.getAttribute('data-grip-profile')==='tapered'?'tapered':'straight';
    renderWorkshopCalculator();
  });

  bindWorkshopToggleButtons(panel,'[data-spiral-method]',(button)=>{
    setSpiralMethod(button.getAttribute('data-spiral-method'));
    renderWorkshopCalculator();
  });

  bindWorkshopToggleButtons(panel,'[data-spiral-direction]',(button)=>{
    workshopToolsState.spiral.direction=normalizeSpiralDirection(button.getAttribute('data-spiral-direction'));
    renderWorkshopCalculator();
  });

  const spiralOffsetsToggle=$('workshopSpiralOffsetsToggle');
  if(spiralOffsetsToggle && spiralOffsetsToggle.getAttribute('data-spiral-offset-toggle-bound')!=='true'){
    spiralOffsetsToggle.setAttribute('data-spiral-offset-toggle-bound','true');
    spiralOffsetsToggle.addEventListener('click',()=>{
      workshopToolsState.spiral.showPhysicalOffsets=!workshopToolsState.spiral.showPhysicalOffsets;
      renderWorkshopCalculator();
    });
  }

  const spiralOffsetStartInput=$('workshopSpiralOffsetStart');
  const spiralCountButtons=Array.from(panel.querySelectorAll('[data-spiral-count-action][data-spiral-count-target]'));
  const spiralCountHoldState={delayTimer:0,repeatTimer:0,target:'',delta:0,repeating:false};
  const clearSpiralCountHold=()=>{
    if(spiralCountHoldState.delayTimer){
      clearTimeout(spiralCountHoldState.delayTimer);
      spiralCountHoldState.delayTimer=0;
    }
    if(spiralCountHoldState.repeatTimer){
      clearInterval(spiralCountHoldState.repeatTimer);
      spiralCountHoldState.repeatTimer=0;
    }
    spiralCountHoldState.repeating=false;
  };
  const beginSpiralCountHold=(target,delta)=>{
    clearSpiralCountHold();
    spiralCountHoldState.target=target;
    spiralCountHoldState.delta=delta;
    spiralCountHoldState.delayTimer=window.setTimeout(()=>{
      spiralCountHoldState.repeating=true;
      applySpiralCountDelta(target,delta);
      renderWorkshopCalculator();
      spiralCountHoldState.repeatTimer=window.setInterval(()=>{
        applySpiralCountDelta(target,delta);
        renderWorkshopCalculator();
      },135);
    },500);
  };
  spiralCountButtons.forEach((button)=>{
    if(button.getAttribute('data-spiral-count-bound')==='true')return;
    button.setAttribute('data-spiral-count-bound','true');
    const target=button.getAttribute('data-spiral-count-target')||'guideCount';
    const delta=button.getAttribute('data-spiral-count-action')==='increment'?1:-1;
    let pointerHandled=false;
    button.style.touchAction='manipulation';
    button.addEventListener('pointerdown',(event)=>{
      if(event.button!==0 || !event.isPrimary)return;
      pointerHandled=false;
      event.preventDefault();
      beginSpiralCountHold(target,delta);
    });
    const finishPointer=()=>{
      if(!spiralCountHoldState.repeating){
        applySpiralCountDelta(target,delta);
        renderWorkshopCalculator();
        pointerHandled=true;
      }
      clearSpiralCountHold();
    };
    button.addEventListener('pointerup',finishPointer);
    button.addEventListener('pointercancel',clearSpiralCountHold);
    button.addEventListener('pointerleave',()=>{
      clearSpiralCountHold();
    });
    button.addEventListener('click',(event)=>{
      event.preventDefault();
      if(pointerHandled){
        pointerHandled=false;
        return;
      }
      applySpiralCountDelta(target,delta);
      renderWorkshopCalculator();
    });
    button.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      event.preventDefault();
      applySpiralCountDelta(target,delta);
      renderWorkshopCalculator();
    });
  });
  bindWorkshopCalculatorInput(spiralOffsetStartInput,()=>{
    const spiral=workshopToolsState.spiral;
    const parsed=Number(spiralOffsetStartInput.value);
    if(!Number.isFinite(parsed))return;
    spiral.offsetStartAngle=clampSpiralStripperAngle(parsed);
    if(spiral.method==='offset'){
      syncSpiralGuidesLength({resetAngles:true});
    }
    renderWorkshopCalculator();
  });

  const spiralImportBtn=$('workshopSpiralImportBtn');
  if(spiralImportBtn && spiralImportBtn.getAttribute('data-spiral-import-bound')!=='true'){
    spiralImportBtn.setAttribute('data-spiral-import-bound','true');
    spiralImportBtn.addEventListener('click',()=>{
      importSpiralFromGuideSpacing();
      renderWorkshopCalculator();
    });
  }

  if(panel.getAttribute('data-spiral-row-bound')!=='true'){
    panel.setAttribute('data-spiral-row-bound','true');
    const handleSpiralFieldChange=(target)=>{
      const input=target&&target.closest?target.closest('[data-spiral-field]'):null;
      if(!input)return;
      const index=Number(input.getAttribute('data-guide-index'));
      const field=input.getAttribute('data-spiral-field')||'';
      const spiral=workshopToolsState.spiral;
      if(!Number.isFinite(index) || !spiral.guides[index])return;
      const guide=spiral.guides[index];
      if(field==='position'){
        const next=parseWorkshopMeasurementMm(input.value,spiral.unit,guide.positionMm,true);
        if(Number.isFinite(next))guide.positionMm=Math.max(0,next);
      }else if(field==='od'){
        const next=parseWorkshopMeasurementMm(input.value,spiral.unit,guide.odMm,false);
        if(Number.isFinite(next) && next>0)guide.odMm=next;
      }else if(field==='angle'){
        const raw=String(input.value||'').trim();
        if(raw==='')return;
        const next=Number(raw);
        if(Number.isFinite(next))setSpiralGuideAngle(index,next);
      }
      renderWorkshopCalculator();
    };
    panel.addEventListener('click',(event)=>{
      const marker=event.target.closest('[data-guide-index].spiral-map-marker');
      if(marker){
        const index=Number(marker.getAttribute('data-guide-index'));
        if(Number.isFinite(index)){
          workshopToolsState.spiral.expandedGuideIndex=index;
          renderWorkshopCalculator();
        }
        return;
      }
      const summary=event.target.closest('[data-spiral-expand-index]');
      if(summary){
        const index=Number(summary.getAttribute('data-spiral-expand-index'));
        const spiral=workshopToolsState.spiral;
        spiral.expandedGuideIndex=spiral.expandedGuideIndex===index?-1:index;
        renderWorkshopCalculator();
        return;
      }
      const button=event.target.closest('[data-spiral-angle-action][data-guide-index]');
      if(!button)return;
      const index=Number(button.getAttribute('data-guide-index'));
      const action=button.getAttribute('data-spiral-angle-action')||'';
      const guide=workshopToolsState.spiral.guides[index];
      if(!Number.isFinite(index) || !guide)return;
      const delta=action==='increment'?5:-5;
      setSpiralGuideAngle(index,numberOrZero(guide.angleDeg)+delta);
      renderWorkshopCalculator();
    });
    panel.addEventListener('change',(event)=>handleSpiralFieldChange(event.target));
    panel.addEventListener('input',(event)=>{
      const target=event.target;
      if(!(target instanceof HTMLInputElement))return;
      if(!target.closest('[data-spiral-field]'))return;
      if(target.getAttribute('data-spiral-field')!=='angle')return;
      handleSpiralFieldChange(target);
    });
  }

  const gripPrintTemplateBtn=$('workshopGripPrintTemplateBtn');
  if(gripPrintTemplateBtn){
    gripPrintTemplateBtn.addEventListener('click',()=>{
      openGripCutTemplatePrint();
    });
  }

  bindWorkshopToolEnterFlow(['workshopDcDiameter','workshopDcCircumference']);
  bindWorkshopToolEnterFlow(['workshopGripDiameter','workshopGripStartDiameter','workshopGripEndDiameter','workshopGripLength','workshopGripCoverWidth','workshopGripAllowance']);
  bindWorkshopToolEnterFlow(['workshopSpiralOffsetStart']);

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
    customerName:'',company:'',phone:'',email:'',buildName:'',estimatedCompletionDate:'',notes:'',
    addressLine1:'',addressLine2:'',suburbLocality:'',cityTown:'',regionState:'',postcode:'',country:'New Zealand',
    blankId:'',blankName:'',blankMaker:'',blankSeries:'',blankLength:'',blankPower:'',blankAction:'',blankPieces:'',blankCost:0,blankSku:'',blankNotes:'',
    buildSpecifications:{reelSeatPosition:'',rearGripLength:'',gripBelowReelSeatLength:'',foreGripLength:'',hookKeeperPosition:'',builderNotes:''},
    components:[{category:'',description:'',supplier:'',cost:0}],
    labourRate:0,labourHours:0,markupPercent:0,targetProfit:0,finalCustomerPrice:0,pricingDriver:'markup',taxEnabled:activeTaxEnabled(),includeGst:activeTaxEnabled(),quoteMode:'internal',gstRate:activeTaxRate(),quoteStatus:'active'
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
    subcategory:(component&&typeof component.subcategory==='string')?component.subcategory:'',
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
  return normalized==='complete' || normalized==='accepted'?'complete':'active';
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
  merged.estimatedCompletionDate=String(inputQuote&&inputQuote.estimatedCompletionDate||'').trim();
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
function updateQuoteActionPriority(){
  const statusEl=$('workshopBuildActionsStatus');
  if(statusEl){
    const hasFlash=workshopStatusFlashText && Date.now()<workshopStatusFlashUntil;
    if(hasFlash){
      statusEl.textContent=workshopStatusFlashText;
      statusEl.classList.toggle('is-pending',workshopStatusFlashPending);
    }else{
      const isSaving=quoteAutosaveInFlight||hasUnsavedQuoteChanges;
      statusEl.textContent=isSaving?'Saving...':'All changes saved';
      statusEl.classList.toggle('is-pending',isSaving);
    }
  }
}
function clearQuoteAutosaveTimer(){
  if(!quoteAutosaveTimer)return;
  clearTimeout(quoteAutosaveTimer);
  quoteAutosaveTimer=null;
}
function persistCurrentQuoteRecord(){
  if(!quote.buildNumber){quote.buildNumber=nextBuildNumber();}
  saveQuoteCurrent();
  const savedRef=persistBuildRecord(quote);
  if(savedRef){
    setActiveSavedBuildRef(savedRef.source,savedRef.index,savedRef.record);
  }
  return savedRef||null;
}
function runQuoteAutosave(){
  if(quoteAutosaveInFlight || !hasUnsavedQuoteChanges)return;
  quoteAutosaveInFlight=true;
  updateQuoteActionPriority();
  try{
    persistCurrentQuoteRecord();
    markQuoteSaved();
  }finally{
    quoteAutosaveInFlight=false;
    updateQuoteActionPriority();
  }
}
function scheduleQuoteAutosave(options){
  const settings={immediate:false,...(options||{})};
  clearQuoteAutosaveTimer();
  const delay=settings.immediate?80:520;
  quoteAutosaveTimer=window.setTimeout(()=>{
    quoteAutosaveTimer=null;
    runQuoteAutosave();
  },delay);
}
function markQuoteDirty(){
  hasUnsavedQuoteChanges=true;
  updateQuoteActionPriority();
  scheduleQuoteAutosave();
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
function renderStudioScreenMode(){
  const landing=$('studioLandingPanel');
  const workflow=$('studioWorkflowPanel');
  const components=$('studioComponentsPanel');
  const taxonomy=$('studioTaxonomyPanel');
  const showWorkflow=studioScreenView==='workflow';
  const showComponents=studioScreenView==='components';
  const showTaxonomy=studioScreenView==='taxonomy';
  if(landing)landing.hidden=showWorkflow||showComponents||showTaxonomy;
  if(workflow)workflow.hidden=!showWorkflow;
  if(components)components.hidden=!showComponents;
  if(taxonomy)taxonomy.hidden=!showTaxonomy;
}
function showStudioLanding(){
  studioScreenView='landing';
  renderStudioScreenMode();
}
function showStudioWorkflow(){
  studioScreenView='workflow';
  renderStudioScreenMode();
}
function showStudioComponents(){
  studioScreenView='components';
  studioComponentsSearch='';
  studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
  studioLibraryEditor={type:'',mode:'',targetName:''};
  closeStudioLibraryContextMenu();
  studioComponentDraft=null;
  studioSelectedComponentKey='';
  renderStudioScreenMode();
  renderStudioComponentsLibrary();
}
function showStudioSupplierBrowse(supplierName){
  studioScreenView='components';
  studioComponentsSearch='';
  studioLibraryEditor={type:'',mode:'',targetName:''};
  closeStudioLibraryContextMenu();
  studioComponentDraft=null;
  studioSelectedComponentKey='';
  studioLibraryPath={level:'supplier',supplierName:String(supplierName||'').trim(),categoryId:'',subcategoryId:''};
  renderStudioScreenMode();
  renderStudioComponentsLibrary();
}
function showStudioTaxonomyManager(){
  studioScreenView='taxonomy';
  studioTaxonomyManagerSection='suppliers';
  setStudioTaxonomySectionMode('suppliers','browse');
  renderStudioScreenMode();
  renderStudioTaxonomyManager();
}
function prepareStudioLandingEntry(){
  showStudioLanding();
}
function studioTaxonomyId(prefix){
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
}
function normalizeStudioComponentTaxonomy(input){
  const raw=input&&typeof input==='object'?input:{};
  const seenCategoryIds=new Set();
  const seenCategoryNames=new Set();
  const categories=(Array.isArray(raw.categories)?raw.categories:[])
    .map((category)=>{
      const item=category&&typeof category==='object'?category:{};
      const name=String(item.name||'').trim();
      if(!name)return null;
      const normalizedName=normalizeNameKey(name);
      if(seenCategoryNames.has(normalizedName))return null;
      seenCategoryNames.add(normalizedName);
      let id=String(item.id||'').trim();
      if(!id || seenCategoryIds.has(id)){id=studioTaxonomyId('cat');}
      seenCategoryIds.add(id);
      const seenSubNames=new Set();
      const subcategories=(Array.isArray(item.subcategories)?item.subcategories:[])
        .map((subcategory)=>{
          const row=subcategory&&typeof subcategory==='object'?subcategory:{};
          const subName=String(row.name||'').trim();
          if(!subName)return null;
          const subKey=normalizeNameKey(subName);
          if(seenSubNames.has(subKey))return null;
          seenSubNames.add(subKey);
          const subId=String(row.id||'').trim()||studioTaxonomyId('sub');
          return {id:subId,name:subName};
        })
        .filter(Boolean);
      return {id,name,subcategories};
    })
    .filter(Boolean);
  const seenSupplierIds=new Set();
  const seenSupplierNames=new Set();
  const suppliers=(Array.isArray(raw.suppliers)?raw.suppliers:[])
    .map((supplier)=>{
      const item=supplier&&typeof supplier==='object'?supplier:{};
      const name=String(item.name||'').trim();
      if(!name)return null;
      const normalized=normalizeNameKey(name);
      if(seenSupplierNames.has(normalized))return null;
      seenSupplierNames.add(normalized);
      let id=String(item.id||'').trim();
      if(!id || seenSupplierIds.has(id)){id=studioTaxonomyId('sup');}
      seenSupplierIds.add(id);
      return {id,name};
    })
    .filter(Boolean);
  return {categories,suppliers};
}
function allStudioCategoryNames(taxonomy){
  const values=(taxonomy&&Array.isArray(taxonomy.categories)?taxonomy.categories:[]).map((item)=>String(item.name||'').trim()).filter(Boolean);
  return Array.from(new Set(values.map((name)=>name))).sort((left,right)=>left.localeCompare(right,undefined,{sensitivity:'base'}));
}
function allStudioSupplierNames(taxonomy){
  const values=(taxonomy&&Array.isArray(taxonomy.suppliers)?taxonomy.suppliers:[]).map((item)=>String(item.name||'').trim()).filter(Boolean);
  return Array.from(new Set(values.map((name)=>name))).sort((left,right)=>left.localeCompare(right,undefined,{sensitivity:'base'}));
}
function harvestStudioTaxonomyMapsFromRecords(categoryMap,supplierMap){
  componentLibraryRecords().forEach((record)=>{
    const categoryName=String(record&&record.category||'').trim();
    const categoryKey=normalizeNameKey(categoryName);
    if(categoryKey){
      let category=findExistingCategoryByAlias(categoryMap,categoryName);
      if(!category){
        category={id:studioTaxonomyId('cat'),name:categoryName,subcategories:[]};
        categoryMap.set(categoryKey,category);
      }
      const subName=String(record&&record.subcategory||'').trim();
      const subKey=normalizeNameKey(subName);
      if(subKey && !category.subcategories.some((row)=>normalizeNameKey(row.name)===subKey)){
        category.subcategories.push({id:studioTaxonomyId('sub'),name:subName});
      }
    }
    const supplierName=String(record&&record.supplier||'').trim();
    const supplierKey=normalizeNameKey(supplierName);
    if(supplierKey && !supplierMap.has(supplierKey)){
      supplierMap.set(supplierKey,{id:studioTaxonomyId('sup'),name:supplierName});
    }
  });
  getCustomCategoryNames().forEach((name)=>{
    const key=normalizeNameKey(name);
    if(!key || findExistingCategoryByAlias(categoryMap,name))return;
    categoryMap.set(key,{id:studioTaxonomyId('cat'),name:String(name).trim(),subcategories:[]});
  });
  getCustomSupplierNames().forEach((name)=>{
    const key=normalizeNameKey(name);
    if(!key || supplierMap.has(key))return;
    supplierMap.set(key,{id:studioTaxonomyId('sup'),name:String(name).trim()});
  });
}
function ensureStudioComponentTaxonomyLoaded(){
  if(studioComponentTaxonomyState)return studioComponentTaxonomyState;
  const stored=Store.get(COMPONENT_TAXONOMY_STORAGE_KEY,null);
  const taxonomy=normalizeStudioComponentTaxonomy(stored);
  const categoryMap=new Map(taxonomy.categories.map((item)=>[normalizeNameKey(item.name),item]));
  const supplierMap=new Map(taxonomy.suppliers.map((item)=>[normalizeNameKey(item.name),item]));
  harvestStudioTaxonomyMapsFromRecords(categoryMap,supplierMap);
  studioComponentTaxonomyState=normalizeStudioComponentTaxonomy({categories:Array.from(categoryMap.values()),suppliers:Array.from(supplierMap.values())});
  Store.set(COMPONENT_TAXONOMY_STORAGE_KEY,studioComponentTaxonomyState);
  return studioComponentTaxonomyState;
}
// Re-harvests taxonomy from current component records; used to self-heal a category/supplier lookup miss
// caused by records changing (e.g. via the build-time Select Component flow) after taxonomy was cached in memory.
function resyncStudioComponentTaxonomyWithRecords(){
  const baseline=studioComponentTaxonomyState||normalizeStudioComponentTaxonomy(Store.get(COMPONENT_TAXONOMY_STORAGE_KEY,null));
  const categoryMap=new Map(baseline.categories.map((item)=>[normalizeNameKey(item.name),item]));
  const supplierMap=new Map(baseline.suppliers.map((item)=>[normalizeNameKey(item.name),item]));
  harvestStudioTaxonomyMapsFromRecords(categoryMap,supplierMap);
  studioComponentTaxonomyState=normalizeStudioComponentTaxonomy({categories:Array.from(categoryMap.values()),suppliers:Array.from(supplierMap.values())});
  Store.set(COMPONENT_TAXONOMY_STORAGE_KEY,studioComponentTaxonomyState);
  return studioComponentTaxonomyState;
}
function saveStudioComponentTaxonomy(){
  studioComponentTaxonomyState=normalizeStudioComponentTaxonomy(studioComponentTaxonomyState);
  Store.set(COMPONENT_TAXONOMY_STORAGE_KEY,studioComponentTaxonomyState);
  saveCustomCategoryNames(allStudioCategoryNames(studioComponentTaxonomyState));
  saveCustomSupplierNames(allStudioSupplierNames(studioComponentTaxonomyState));
}
function studioCategoryById(id){
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  return taxonomy.categories.find((item)=>item.id===id)||null;
}
function studioSupplierById(id){
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  return taxonomy.suppliers.find((item)=>item.id===id)||null;
}
function studioCategoryByName(name){
  const key=normalizeNameKey(name);
  if(!key)return null;
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const found=taxonomy.categories.find((item)=>normalizeNameKey(item.name)===key);
  if(found)return found;
  // Self-heal: a visible category row may have come from a component record added after taxonomy was cached.
  const resynced=resyncStudioComponentTaxonomyWithRecords();
  return resynced.categories.find((item)=>normalizeNameKey(item.name)===key)||null;
}
function studioSupplierByName(name){
  const key=normalizeNameKey(name);
  if(!key)return null;
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  return taxonomy.suppliers.find((item)=>normalizeNameKey(item.name)===key)||null;
}
function syncStudioTaxonomySelection(){
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  if(!taxonomy.categories.length){
    studioComponentTaxonomySelection.category='';
    studioComponentTaxonomySelection.subcategory='';
  }else if(!taxonomy.categories.some((item)=>item.id===studioComponentTaxonomySelection.category)){
    studioComponentTaxonomySelection.category=taxonomy.categories[0].id;
    studioComponentTaxonomySelection.subcategory='';
  }
  const currentCategory=studioCategoryById(studioComponentTaxonomySelection.category);
  if(!currentCategory || !currentCategory.subcategories.length){
    studioComponentTaxonomySelection.subcategory='';
  }else if(!currentCategory.subcategories.some((item)=>item.id===studioComponentTaxonomySelection.subcategory)){
    studioComponentTaxonomySelection.subcategory=currentCategory.subcategories[0].id;
  }
  if(!taxonomy.suppliers.length){
    studioComponentTaxonomySelection.supplier='';
  }else if(!taxonomy.suppliers.some((item)=>item.id===studioComponentTaxonomySelection.supplier)){
    studioComponentTaxonomySelection.supplier=taxonomy.suppliers[0].id;
  }
}
function escapeAttributeValue(value){
  return escapeHtml(String(value||''));
}
function categorySubcategoryOptionsMarkup(selectedCategoryName,selectedSubcategoryName){
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const selectedCategory=studioCategoryByName(selectedCategoryName);
  const categoryOptions=['<option value="">Unassigned</option>']
    .concat(taxonomy.categories.map((category)=>`<option value="${escapeAttributeValue(category.name)}"${normalizeNameKey(category.name)===normalizeNameKey(selectedCategoryName)?' selected':''}>${escapeHtml(category.name)}</option>`));
  const sourceSubcategories=selectedCategory&&Array.isArray(selectedCategory.subcategories)?selectedCategory.subcategories:[];
  const subcategoryOptions=['<option value="">Unassigned</option>']
    .concat(sourceSubcategories.map((subcategory)=>`<option value="${escapeAttributeValue(subcategory.name)}"${normalizeNameKey(subcategory.name)===normalizeNameKey(selectedSubcategoryName)?' selected':''}>${escapeHtml(subcategory.name)}</option>`));
  return {categoryOptions:categoryOptions.join(''),subcategoryOptions:subcategoryOptions.join('')};
}
function supplierOptionsMarkup(selectedSupplierName){
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const options=['<option value="">Unassigned</option>']
    .concat(taxonomy.suppliers.map((supplier)=>`<option value="${escapeAttributeValue(supplier.name)}"${normalizeNameKey(supplier.name)===normalizeNameKey(selectedSupplierName)?' selected':''}>${escapeHtml(supplier.name)}</option>`));
  return options.join('');
}
function studioComponentDetailPayloadFromDom(){
  const stockInput=$('studioComponentStockOnHand');
  const rawStock=String(stockInput&&stockInput.value||'').trim();
  const stockOnHand=rawStock===''?undefined:numberOrZero(rawStock);
  return {
    name:String(($('studioComponentName')&&$('studioComponentName').value)||'').trim(),
    category:String(($('studioComponentCategory')&&$('studioComponentCategory').value)||'').trim(),
    subcategory:String(($('studioComponentSubcategory')&&$('studioComponentSubcategory').value)||'').trim(),
    supplier:String(($('studioComponentSupplier')&&$('studioComponentSupplier').value)||'').trim(),
    specifications:String(($('studioComponentSpecifications')&&$('studioComponentSpecifications').value)||'').trim(),
    notes:String(($('studioComponentNotes')&&$('studioComponentNotes').value)||'').trim(),
    cost:studioComponentCurrencyFieldValue('studioComponentCost'),
    unitPrice:studioComponentCurrencyFieldValue('studioComponentUnitPrice'),
    stockOnHand,
  };
}
function studioComponentPayloadSignature(payload){
  return JSON.stringify(payload||{});
}
function clearStudioComponentSavedTimer(){
  if(studioComponentDetailContext.savedTimer){
    clearTimeout(studioComponentDetailContext.savedTimer);
    studioComponentDetailContext.savedTimer=0;
  }
}
function syncStudioComponentSaveButtonState(){
  const button=$('studioComponentSaveBtn');
  if(!button)return;
  if(studioComponentDetailContext.isAddMode){
    button.disabled=false;
    button.textContent='Add Component';
    button.classList.remove('is-saved');
    return;
  }
  const payload=studioComponentDetailPayloadFromDom();
  const dirty=studioComponentPayloadSignature(payload)!==studioComponentDetailContext.baseline;
  if(dirty){
    studioComponentDetailContext.savedFlash=false;
    clearStudioComponentSavedTimer();
  }
  if(studioComponentDetailContext.savedFlash && !dirty){
    button.disabled=true;
    button.textContent='✓ SAVED';
    button.classList.add('is-saved');
    return;
  }
  button.disabled=!dirty;
  button.textContent='Save Changes';
  button.classList.remove('is-saved');
}
function clearStudioSupplierSavedTimer(){
  if(studioSupplierEditContext.savedTimer){
    clearTimeout(studioSupplierEditContext.savedTimer);
    studioSupplierEditContext.savedTimer=0;
  }
}
function syncStudioTaxonomySupplierSaveButtonState(){
  const button=$('studioTaxonomySupplierSaveBtn');
  const input=$('studioTaxonomySupplierName');
  if(!button || !input)return;
  const currentValue=String(input.value||'').trim();
  const dirty=currentValue!=='' && currentValue!==studioSupplierEditContext.baseline;
  if(dirty){
    studioSupplierEditContext.savedFlash=false;
    clearStudioSupplierSavedTimer();
  }
  if(studioSupplierEditContext.savedFlash && !dirty){
    button.disabled=true;
    button.textContent='✓ SAVED';
    button.className='ghost-action studio-taxonomy-editor__save is-saved';
    return;
  }
  button.disabled=!dirty;
  button.textContent='SAVE';
  button.className=dirty?'primary-action studio-taxonomy-editor__save':'ghost-action studio-taxonomy-editor__save';
}
function studioComponentListMeta(record){
  const parts=[String(record&&record.category||'').trim(),String(record&&record.subcategory||'').trim(),String(record&&record.supplier||'').trim()].filter(Boolean);
  return parts.length?parts.join(' • '):'No category or supplier';
}
function studioComponentMatchesSearch(record,queryKey){
  if(!queryKey)return true;
  const haystack=[
    record&&record.name,
    record&&record.category,
    record&&record.subcategory,
    record&&record.supplier,
    record&&record.description,
    record&&record.specifications,
  ].map((value)=>String(value||'').toLowerCase()).join(' ');
  return haystack.includes(queryKey);
}
function studioComponentCurrencyFieldValue(id){
  const input=$(id);
  const raw=String(input&&input.value||'').trim();
  if(raw==='')return undefined;
  return numberOrZero(raw);
}
function studioMergedSpecificationValue(record){
  const specs=String(record&&record.specifications||'').trim();
  const details=String(record&&record.description||'').trim();
  if(specs && details && normalizeNameKey(specs)!==normalizeNameKey(details)){
    return `${details} | ${specs}`;
  }
  return specs || details;
}
function renderStudioComponentDetails(record,options){
  const details=$('studioComponentDetails');
  if(!details)return;
  const isAddMode=!!(options&&options.addMode);
  if(!record){
    studioComponentDetailContext={isAddMode:false,baseline:'',savedTimer:0,savedFlash:false};
    details.innerHTML='<p class="studio-component-details__empty">Select a component to view details.</p>';
    return;
  }
  const name=String(record.name||'').trim();
  const category=String(record.category||'').trim();
  const subcategory=String(record.subcategory||'').trim();
  const supplier=String(record.supplier||'').trim();
  const notes=String(record.notes||'').trim();
  const specifications=studioMergedSpecificationValue(record);
  const stockOnHand=componentLibraryStockValue(record);
  const trackStock=activeTrackComponentStock();
  const optionMarkup=categorySubcategoryOptionsMarkup(category,subcategory);
  const supplierMarkup=supplierOptionsMarkup(supplier);
  details.innerHTML=`
    <div class="studio-component-details__head">
      <p>${isAddMode?'Add this component to your reusable parts library.':'Update this reusable component and save your changes.'}</p>
    </div>
    <input id="studioComponentOriginalName" type="hidden" value="${escapeHtml(name)}" />
    <div class="studio-component-details__fields quote-component-row__fields">
      <label class="quote-component-field"><span>Component Name</span><input id="studioComponentName" type="text" value="${escapeHtml(name)}" placeholder="Component name" /></label>
      <label class="quote-component-field"><span>Category</span><select id="studioComponentCategory">${optionMarkup.categoryOptions}</select></label>
      <label class="quote-component-field"><span>Subcategory</span><select id="studioComponentSubcategory">${optionMarkup.subcategoryOptions}</select></label>
      <label class="quote-component-field"><span>Supplier</span><span class="studio-component-details__select-wrap"><select id="studioComponentSupplier">${supplierMarkup}</select></span></label>
      <label class="quote-component-field quote-component-field--cost"><span>Buy Price</span><input id="studioComponentCost" type="number" inputmode="decimal" step="0.01" min="0" value="${record.cost===undefined?'':escapeHtml(String(numberOrZero(record.cost)))}" placeholder="0.00" /></label>
      <label class="quote-component-field quote-component-field--cost"><span>Sell Price</span><input id="studioComponentUnitPrice" type="number" inputmode="decimal" step="0.01" min="0" value="${record.unitPrice===undefined?'':escapeHtml(String(numberOrZero(record.unitPrice)))}" placeholder="0.00" /></label>
      ${trackStock?`<label class="quote-component-field quote-component-field--cost"><span>In Stock</span><input id="studioComponentStockOnHand" type="number" inputmode="decimal" step="0.01" min="0" value="${stockOnHand===undefined?'':escapeHtml(String(numberOrZero(stockOnHand)))}" placeholder="0" /></label>`:''}
      <label class="quote-component-field quote-component-field--description studio-component-details__field--full"><span>Specifications</span><input id="studioComponentSpecifications" type="text" placeholder="80mm x 28mm x 19mm, ID 9mm, Black EVA" value="${escapeHtml(specifications)}" /></label>
      <label class="quote-component-field quote-component-field--description studio-component-details__field--full"><span>Notes</span><input id="studioComponentNotes" type="text" placeholder="Any extra notes..." value="${escapeHtml(notes)}" /></label>
    </div>
    <div class="studio-component-details__actions">
      <button id="studioComponentSaveBtn" class="primary-action studio-component-details__save" type="button">${isAddMode?'Add Component':'Save Changes'}</button>
      ${isAddMode?'':`<button id="studioComponentDeleteBtn" class="ghost-action studio-component-details__delete" type="button">Delete</button>`}
    </div>
  `;
  studioComponentDetailContext={
    isAddMode,
    baseline:studioComponentPayloadSignature({
      name,
      category,
      subcategory,
      supplier,
      specifications,
      notes,
      cost:record.cost===undefined?undefined:numberOrZero(record.cost),
      unitPrice:record.unitPrice===undefined?undefined:numberOrZero(record.unitPrice),
      stockOnHand:trackStock?(stockOnHand===undefined?undefined:numberOrZero(stockOnHand)):undefined,
    }),
    savedTimer:0,
    savedFlash:false,
  };
  syncStudioComponentSaveButtonState();
}
function saveStudioComponentDetails(){
  const nameInput=$('studioComponentName');
  if(!nameInput)return;
  const nextName=String(nameInput.value||'').trim();
  if(!nextName){
    openInfoDialog('Component Name Required','Enter a component name before saving.');
    nameInput.focus();
    return;
  }
  if(NON_COMPONENT_LINE_ITEM_NAMES.includes(normalizeNameKey(nextName))){
    openInfoDialog('Not a Physical Component','Business charges like Freight, Postage or Repair are not stored as physical Components. Add these directly on the build/quote instead.');
    return;
  }
  const originalName=String(($('studioComponentOriginalName')&&$('studioComponentOriginalName').value)||'').trim();
  const supplierBrowseName=studioLibraryPath.level.startsWith('supplier')?String(studioLibraryPath.supplierName||'').trim():'';
  const payload=studioComponentDetailPayloadFromDom();
  const payloadSignature=studioComponentPayloadSignature(payload);
  if(!studioComponentDetailContext.isAddMode && payloadSignature===studioComponentDetailContext.baseline){
    return;
  }
  const sourceRecord={
    category:payload.category,
    subcategory:payload.subcategory,
    supplier:payload.supplier,
    // Keep legacy description in sync for backward compatibility paths.
    description:payload.specifications,
    specifications:payload.specifications,
    notes:payload.notes,
    cost:payload.cost,
    unitPrice:payload.unitPrice,
    stockOnHand:activeTrackComponentStock()?payload.stockOnHand:undefined,
  };
  if(normalizeNameKey(originalName) && normalizeNameKey(originalName)!==normalizeNameKey(nextName)){
    removeComponentLibraryRecord(originalName);
  }
  upsertComponentLibraryRecord(nextName,sourceRecord);
  ensureStudioComponentTaxonomyLoaded();
  const nextCategoryKey=normalizeNameKey(sourceRecord.category);
  if(nextCategoryKey && !studioCategoryByName(sourceRecord.category)){
    studioComponentTaxonomyState.categories.push({id:studioTaxonomyId('cat'),name:sourceRecord.category,subcategories:[]});
  }
  const targetCategory=studioCategoryByName(sourceRecord.category);
  const subcategoryName=String(sourceRecord.subcategory||'').trim();
  const subcategoryKey=normalizeNameKey(subcategoryName);
  if(targetCategory && subcategoryKey && !targetCategory.subcategories.some((row)=>normalizeNameKey(row.name)===subcategoryKey)){
    targetCategory.subcategories.push({id:studioTaxonomyId('sub'),name:subcategoryName});
  }
  const supplierName=String(sourceRecord.supplier||'').trim();
  const supplierKey=normalizeNameKey(supplierName);
  if(supplierKey && !studioSupplierByName(supplierName)){
    studioComponentTaxonomyState.suppliers.push({id:studioTaxonomyId('sup'),name:supplierName});
  }
  saveStudioComponentTaxonomy();
  studioComponentDraft=null;
  studioLibraryEditor={type:'',mode:'',targetName:''};
  if(supplierBrowseName){
    studioLibraryPath={level:sourceRecord.subcategory?'supplier-component':'supplier-category',supplierName:supplierBrowseName,categoryId:sourceRecord.category,subcategoryId:sourceRecord.subcategory};
  }else if(sourceRecord.category && sourceRecord.subcategory){
    studioLibraryPath={level:'component',categoryId:sourceRecord.category,subcategoryId:sourceRecord.subcategory};
  }else if(sourceRecord.category){
    studioLibraryPath={level:'category',categoryId:sourceRecord.category,subcategoryId:''};
  }else{
    studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
  }
  studioSelectedComponentKey=normalizeNameKey(nextName);
  renderStudioComponentsLibrary();
  studioComponentDetailContext.savedFlash=true;
  clearStudioComponentSavedTimer();
  syncStudioComponentSaveButtonState();
  studioComponentDetailContext.savedTimer=window.setTimeout(()=>{
    studioComponentDetailContext.savedFlash=false;
    studioComponentDetailContext.savedTimer=0;
    syncStudioComponentSaveButtonState();
  },1700);
}
function studioTaxonomySectionMode(section){
  const scope=studioTaxonomyUiState&&studioTaxonomyUiState[section]?studioTaxonomyUiState[section]:null;
  const mode=scope&&scope.mode;
  return (mode==='add' || mode==='edit')?mode:'browse';
}
function setStudioTaxonomySectionMode(section,mode){
  if(!studioTaxonomyUiState || !studioTaxonomyUiState[section])return;
  studioTaxonomyUiState[section].mode=(mode==='add' || mode==='edit')?mode:'browse';
}
function studioTaxonomySectionMarkupCategories(taxonomy){
  const selectedCategory=studioCategoryById(studioComponentTaxonomySelection.category);
  const selectedIndex=taxonomy.categories.findIndex((item)=>item.id===studioComponentTaxonomySelection.category);
  const mode=studioTaxonomySectionMode('categories');
  const recordsMarkup=taxonomy.categories.length
    ?taxonomy.categories.map((category)=>{
      const active=category.id===studioComponentTaxonomySelection.category;
      return `<button class="studio-taxonomy-list__item${active?' is-active':''}" type="button" data-taxonomy-select="category" data-taxonomy-id="${escapeAttributeValue(category.id)}" aria-pressed="${active?'true':'false'}"><strong>${escapeHtml(category.name)}</strong></button>`;
    }).join('')
    :'<p class="studio-taxonomy-list__empty">No categories yet.</p>';
  const addMarkup=mode==='add'?`
    <section class="studio-taxonomy-editor" aria-label="Add category">
      <h3>ADD CATEGORY</h3>
      <label class="studio-taxonomy-form-field"><span>Name</span><input id="studioTaxonomyCategoryName" type="text" placeholder="Category name" /></label>
      <div class="studio-taxonomy-editor__actions">
        <button class="primary-action" type="button" data-taxonomy-action="category-add">ADD CATEGORY</button>
        <button class="ghost-action" type="button" data-taxonomy-ui-action="category-cancel">Cancel</button>
      </div>
    </section>
  `:'';
  const editMarkup=mode==='edit' && selectedCategory?`
    <section class="studio-taxonomy-editor" aria-label="Edit category">
      <h3>${escapeHtml(String(selectedCategory.name||'').toUpperCase())}</h3>
      <label class="studio-taxonomy-form-field"><span>Name</span><input id="studioTaxonomyCategoryName" type="text" value="${escapeHtml(selectedCategory.name)}" /></label>
      <div class="studio-taxonomy-editor__actions">
        <button class="primary-action" type="button" data-taxonomy-action="category-rename">SAVE</button>
      </div>
      <div class="studio-taxonomy-editor__actions studio-taxonomy-editor__actions--secondary">
        <button class="ghost-action" type="button" data-taxonomy-action="category-up"${selectedIndex<=0?' disabled':''}>Move Up</button>
        <button class="ghost-action" type="button" data-taxonomy-action="category-down"${selectedIndex<0 || selectedIndex>=taxonomy.categories.length-1?' disabled':''}>Move Down</button>
        <button class="ghost-action studio-taxonomy-editor__danger" type="button" data-taxonomy-action="category-delete">Delete</button>
      </div>
    </section>
  `:'';
  return `
    <section class="studio-taxonomy-section" aria-label="Categories">
      <div class="studio-taxonomy-section__head">
        <h3>CATEGORIES</h3>
      </div>
      <div class="studio-taxonomy-list" role="listbox" aria-label="Category list">${recordsMarkup}</div>
      ${mode==='browse'?'<button class="ghost-action studio-taxonomy-add-cta" type="button" data-taxonomy-ui-action="category-open-add">+ ADD CATEGORY</button>':''}
      ${addMarkup}
      ${editMarkup}
    </section>
  `;
}
function studioTaxonomySectionMarkupSubcategories(taxonomy){
  const mode=studioTaxonomySectionMode('subcategories');
  const selectedCategory=studioCategoryById(studioComponentTaxonomySelection.category);
  const selectedSubcategory=selectedCategory && selectedCategory.subcategories.find((item)=>item.id===studioComponentTaxonomySelection.subcategory);
  const selectedSubIndex=selectedCategory?selectedCategory.subcategories.findIndex((item)=>item.id===studioComponentTaxonomySelection.subcategory):-1;
  const categoryOptions=['<option value="">Select category</option>']
    .concat(taxonomy.categories.map((category)=>`<option value="${escapeAttributeValue(category.id)}"${category.id===studioComponentTaxonomySelection.category?' selected':''}>${escapeHtml(category.name)}</option>`));
  const subcategoryRows=selectedCategory&&selectedCategory.subcategories.length
    ?selectedCategory.subcategories.map((subcategory)=>{
      const active=subcategory.id===studioComponentTaxonomySelection.subcategory;
      return `<button class="studio-taxonomy-list__item${active?' is-active':''}" type="button" data-taxonomy-select="subcategory" data-taxonomy-id="${escapeAttributeValue(subcategory.id)}" aria-pressed="${active?'true':'false'}"><strong>${escapeHtml(subcategory.name)}</strong></button>`;
    }).join('')
    :'<p class="studio-taxonomy-list__empty">No subcategories in this category yet.</p>';
  const addMarkup=mode==='add'?`
    <section class="studio-taxonomy-editor" aria-label="Add subcategory">
      <h3>ADD SUBCATEGORY</h3>
      <label class="studio-taxonomy-form-field"><span>Parent Category</span><select id="studioTaxonomySubcategoryParentSelectAdd">${categoryOptions.join('')}</select></label>
      <label class="studio-taxonomy-form-field"><span>Name</span><input id="studioTaxonomySubcategoryName" type="text" placeholder="Subcategory name" /></label>
      <div class="studio-taxonomy-editor__actions">
        <button class="primary-action" type="button" data-taxonomy-action="subcategory-add">ADD SUBCATEGORY</button>
        <button class="ghost-action" type="button" data-taxonomy-ui-action="subcategory-cancel">Cancel</button>
      </div>
    </section>
  `:'';
  const editMarkup=mode==='edit' && selectedSubcategory?`
    <section class="studio-taxonomy-editor" aria-label="Edit subcategory">
      <h3>${escapeHtml(String(selectedSubcategory.name||'').toUpperCase())}</h3>
      <label class="studio-taxonomy-form-field"><span>Name</span><input id="studioTaxonomySubcategoryName" type="text" value="${escapeHtml(selectedSubcategory.name)}" /></label>
      <label class="studio-taxonomy-form-field"><span>Parent Category</span><select id="studioTaxonomySubcategoryParentSelectEdit">${categoryOptions.join('')}</select></label>
      <div class="studio-taxonomy-editor__actions">
        <button class="primary-action" type="button" data-taxonomy-action="subcategory-save">SAVE</button>
      </div>
      <div class="studio-taxonomy-editor__actions studio-taxonomy-editor__actions--secondary">
        <button class="ghost-action" type="button" data-taxonomy-action="subcategory-up"${selectedSubIndex<=0?' disabled':''}>Move Up</button>
        <button class="ghost-action" type="button" data-taxonomy-action="subcategory-down"${selectedSubIndex<0 || !selectedCategory || selectedSubIndex>=selectedCategory.subcategories.length-1?' disabled':''}>Move Down</button>
        <button class="ghost-action studio-taxonomy-editor__danger" type="button" data-taxonomy-action="subcategory-delete">Delete</button>
      </div>
    </section>
  `:'';
  return `
    <section class="studio-taxonomy-section" aria-label="Subcategories">
      <div class="studio-taxonomy-section__head">
        <h3>SUBCATEGORIES</h3>
      </div>
      <label class="studio-taxonomy-form-field">
        <span>Parent Category</span>
        <select id="studioTaxonomySubcategoryParentSelectBrowse">${categoryOptions.join('')}</select>
      </label>
      <p class="studio-taxonomy-context">${selectedCategory?`Subcategories under ${escapeHtml(selectedCategory.name)}`:'Select a parent category to view subcategories.'}</p>
      <div class="studio-taxonomy-list" role="listbox" aria-label="Subcategory list">${subcategoryRows}</div>
      ${mode==='browse'?`
      <button class="ghost-action studio-taxonomy-add-cta" type="button" data-taxonomy-ui-action="subcategory-open-add" ${selectedCategory?'':'disabled'}>+ ADD SUBCATEGORY</button>
      `:''}
      ${addMarkup}
      ${editMarkup}
    </section>
  `;
}
function studioTaxonomySectionMarkupSuppliers(taxonomy){
  const selectedSupplier=studioSupplierById(studioComponentTaxonomySelection.supplier);
  const mode=studioTaxonomySectionMode('suppliers');
  const supplierRows=taxonomy.suppliers.length
    ?taxonomy.suppliers.map((supplier,rowIndex)=>{
      const active=supplier.id===studioComponentTaxonomySelection.supplier;
      const menuOpen=studioSupplierContextMenu===supplier.id;
      const canMoveUp=rowIndex>0;
      const canMoveDown=rowIndex<taxonomy.suppliers.length-1;
      const menu=menuOpen?`<div class="studio-taxonomy-supplier-menu" role="menu">
        <button class="studio-components-row-menu__item" type="button" role="menuitem" data-taxonomy-supplier-action="edit" data-taxonomy-id="${escapeAttributeValue(supplier.id)}">Edit / Rename</button>
        <button class="studio-components-row-menu__item" type="button" role="menuitem" data-taxonomy-supplier-action="move-up" data-taxonomy-id="${escapeAttributeValue(supplier.id)}"${canMoveUp?'':' disabled'}>Move Up</button>
        <button class="studio-components-row-menu__item" type="button" role="menuitem" data-taxonomy-supplier-action="move-down" data-taxonomy-id="${escapeAttributeValue(supplier.id)}"${canMoveDown?'':' disabled'}>Move Down</button>
        <button class="studio-components-row-menu__item studio-components-row-menu__item--danger" type="button" role="menuitem" data-taxonomy-supplier-action="delete" data-taxonomy-id="${escapeAttributeValue(supplier.id)}">Delete</button>
      </div>`:'';
      return `<article class="studio-taxonomy-supplier-row"><button class="studio-taxonomy-list__item${active?' is-active':''}" type="button" data-taxonomy-browse-supplier="${escapeAttributeValue(supplier.name)}"><strong>${escapeHtml(supplier.name)}</strong></button><button class="studio-components-list__menu-trigger studio-taxonomy-supplier-row__menu" type="button" aria-label="${escapeAttributeValue(supplier.name)} actions" data-taxonomy-supplier-menu-toggle="${escapeAttributeValue(supplier.id)}" aria-expanded="${menuOpen?'true':'false'}">&hellip;</button>${menu}</article>`;
    }).join('')
    :'<p class="studio-taxonomy-list__empty">No suppliers yet.</p>';
  const addMarkup=mode==='add'?`
    <section class="studio-taxonomy-editor" aria-label="Add supplier">
      <h3>ADD SUPPLIER</h3>
      <label class="studio-taxonomy-form-field"><span>Name</span><input id="studioTaxonomySupplierName" type="text" placeholder="Supplier name" /></label>
      <div class="studio-taxonomy-editor__actions">
        <button class="primary-action" type="button" data-taxonomy-action="supplier-add">ADD SUPPLIER</button>
        <button class="ghost-action" type="button" data-taxonomy-ui-action="supplier-cancel">Cancel</button>
      </div>
    </section>
  `:'';
  const showSaved=mode==='edit' && selectedSupplier && studioSupplierEditContext.savedFlash;
  const saveButtonClass=showSaved?'ghost-action studio-taxonomy-editor__save is-saved':'ghost-action studio-taxonomy-editor__save';
  const saveButtonLabel=showSaved?'✓ SAVED':'SAVE';
  const editMarkup=mode==='edit' && selectedSupplier?`
    <section class="studio-taxonomy-editor" aria-label="Edit supplier">
      <h3>${escapeHtml(String(selectedSupplier.name||'').toUpperCase())}</h3>
      <label class="studio-taxonomy-form-field"><span>Name</span><input id="studioTaxonomySupplierName" type="text" value="${escapeHtml(selectedSupplier.name)}" /></label>
      <div class="studio-taxonomy-editor__actions">
        <button id="studioTaxonomySupplierSaveBtn" class="${saveButtonClass}" type="button" data-taxonomy-action="supplier-rename" disabled>${saveButtonLabel}</button>
        <button class="ghost-action" type="button" data-taxonomy-ui-action="supplier-cancel">Cancel</button>
      </div>
    </section>
  `:'';
  return `
    <section class="studio-taxonomy-section" aria-label="Suppliers">
      <div class="studio-taxonomy-section__head">
        <h3>SUPPLIERS</h3>
      </div>
      <div class="studio-taxonomy-list" role="listbox" aria-label="Supplier list">${supplierRows}</div>
      ${mode==='browse'?'<button class="ghost-action studio-taxonomy-add-cta" type="button" data-taxonomy-ui-action="supplier-open-add">+ ADD SUPPLIER</button>':''}
      ${addMarkup}
      ${editMarkup}
    </section>
  `;
}
function renderStudioTaxonomyManager(){
  const host=$('studioTaxonomyBody');
  const sectionNav=$('studioTaxonomySectionNav');
  if(!host)return;
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  syncStudioTaxonomySelection();
  if(sectionNav){
    sectionNav.hidden=true;
  }
  host.innerHTML=studioTaxonomySectionMarkupSuppliers(taxonomy);
}
function studioUpdateComponents(mutator){
  const records=componentLibraryRecords();
  mutator(records);
  saveComponentLibraryRecords(records);
}
function studioReassignUsedCategoryToUnassigned(categoryName){
  const categoryKey=normalizeNameKey(categoryName);
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.category)!==categoryKey)return;
      record.category='';
      record.subcategory='';
    });
  });
}
function studioReassignUsedSubcategoryToUnassigned(categoryName,subcategoryName){
  const categoryKey=normalizeNameKey(categoryName);
  const subKey=normalizeNameKey(subcategoryName);
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.category)!==categoryKey)return;
      if(normalizeNameKey(record.subcategory)!==subKey)return;
      record.subcategory='';
    });
  });
}
function studioReassignUsedSupplierToUnassigned(supplierName){
  const supplierKey=normalizeNameKey(supplierName);
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.supplier)!==supplierKey)return;
      record.supplier='';
    });
  });
}
function studioCountCategoryUsage(categoryName){
  const key=normalizeNameKey(categoryName);
  return componentLibraryRecords().filter((record)=>normalizeNameKey(record.category)===key).length;
}
function studioCountSubcategoryUsage(categoryName,subcategoryName){
  const categoryKey=normalizeNameKey(categoryName);
  const subKey=normalizeNameKey(subcategoryName);
  return componentLibraryRecords().filter((record)=>normalizeNameKey(record.category)===categoryKey && normalizeNameKey(record.subcategory)===subKey).length;
}
function studioCountSupplierUsage(supplierName){
  const key=normalizeNameKey(supplierName);
  return componentLibraryRecords().filter((record)=>normalizeNameKey(record.supplier)===key).length;
}
function studioRenameCategory(oldName,newName){
  const oldKey=normalizeNameKey(oldName);
  const next=String(newName||'').trim();
  const nextKey=normalizeNameKey(next);
  if(!oldKey || !nextKey || oldKey===nextKey)return false;
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.category)===oldKey){
        record.category=next;
      }
    });
  });
  return true;
}
function studioRenameSubcategory(categoryName,oldSubcategory,newSubcategory){
  const categoryKey=normalizeNameKey(categoryName);
  const oldKey=normalizeNameKey(oldSubcategory);
  const next=String(newSubcategory||'').trim();
  const nextKey=normalizeNameKey(next);
  if(!categoryKey || !oldKey || !nextKey || oldKey===nextKey)return false;
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.category)!==categoryKey)return;
      if(normalizeNameKey(record.subcategory)!==oldKey)return;
      record.subcategory=next;
    });
  });
  return true;
}
function studioRelinkSubcategory(oldCategoryName,oldSubcategory,newCategoryName,newSubcategory){
  const oldCategoryKey=normalizeNameKey(oldCategoryName);
  const oldSubcategoryKey=normalizeNameKey(oldSubcategory);
  const nextCategory=String(newCategoryName||'').trim();
  const nextSubcategory=String(newSubcategory||'').trim();
  if(!oldCategoryKey || !oldSubcategoryKey)return false;
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.category)!==oldCategoryKey)return;
      if(normalizeNameKey(record.subcategory)!==oldSubcategoryKey)return;
      record.category=nextCategory;
      record.subcategory=nextSubcategory;
    });
  });
  return true;
}
function studioRenameSupplier(oldName,newName){
  const oldKey=normalizeNameKey(oldName);
  const next=String(newName||'').trim();
  const nextKey=normalizeNameKey(next);
  if(!oldKey || !nextKey || oldKey===nextKey)return false;
  studioUpdateComponents((records)=>{
    records.forEach((record)=>{
      if(normalizeNameKey(record.supplier)===oldKey){
        record.supplier=next;
      }
    });
  });
  return true;
}
function studioMoveArrayRow(rows,index,direction){
  const target=index+direction;
  if(index<0 || index>=rows.length)return false;
  if(target<0 || target>=rows.length)return false;
  const swapped=rows[target];
  rows[target]=rows[index];
  rows[index]=swapped;
  return true;
}
function refreshStudioComponentAndTaxonomyViews(){
  renderStudioComponentsLibrary();
  if(studioScreenView==='taxonomy'){
    renderStudioTaxonomyManager();
  }
}
function handleStudioTaxonomyAction(action){
  ensureStudioComponentTaxonomyLoaded();
  syncStudioTaxonomySelection();
  const category=studioCategoryById(studioComponentTaxonomySelection.category);
  const categoryNameInput=$('studioTaxonomyCategoryName');
  const nextCategoryName=String(categoryNameInput&&categoryNameInput.value||'').trim();
  const subcategoryNameInput=$('studioTaxonomySubcategoryName');
  const nextSubcategoryName=String(subcategoryNameInput&&subcategoryNameInput.value||'').trim();
  const supplier=studioSupplierById(studioComponentTaxonomySelection.supplier);
  const supplierNameInput=$('studioTaxonomySupplierName');
  const nextSupplierName=String(supplierNameInput&&supplierNameInput.value||'').trim();
  if(action==='category-add'){
    if(!nextCategoryName){openInfoDialog('Category Name Required','Enter a category name to add.');return;}
    if(studioCategoryByName(nextCategoryName)){openInfoDialog('Category Exists','A category with this name already exists.');return;}
    const created={id:studioTaxonomyId('cat'),name:nextCategoryName,subcategories:[]};
    studioComponentTaxonomyState.categories.push(created);
    studioComponentTaxonomySelection.category=created.id;
    studioComponentTaxonomySelection.subcategory='';
    setStudioTaxonomySectionMode('categories','browse');
    saveStudioComponentTaxonomy();
  }
  if(action==='category-rename'){
    if(!category){openInfoDialog('Select Category','Choose a category to rename.');return;}
    if(!nextCategoryName){openInfoDialog('Category Name Required','Enter a new category name.');return;}
    const existing=studioCategoryByName(nextCategoryName);
    if(existing && existing.id!==category.id){openInfoDialog('Category Exists','Another category already uses this name.');return;}
    const oldName=category.name;
    category.name=nextCategoryName;
    studioRenameCategory(oldName,nextCategoryName);
    setStudioTaxonomySectionMode('categories','edit');
    saveStudioComponentTaxonomy();
  }
  if(action==='category-delete'){
    if(!category){openInfoDialog('Select Category','Choose a category to delete.');return;}
    const usage=studioCountCategoryUsage(category.name);
    const deleteNow=()=>{
      studioComponentTaxonomyState.categories=studioComponentTaxonomyState.categories.filter((item)=>item.id!==category.id);
      saveStudioComponentTaxonomy();
      refreshStudioComponentAndTaxonomyViews();
    };
    openConfirmDialog({
      title:usage>0?'Category In Use':'Delete Category',
      message:usage>0
        ?`${usage} component(s) use this category. Continue and set affected components to Unassigned?`
        :'Delete this category?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:usage>0?'Unassign & Delete':'Delete',kind:'danger'}]
    },(choice)=>{
      if(choice!=='delete')return;
      if(usage>0){
        studioReassignUsedCategoryToUnassigned(category.name);
      }
      setStudioTaxonomySectionMode('categories','browse');
      deleteNow();
    });
    return;
  }
  if(action==='category-up' || action==='category-down'){
    if(!category)return;
    const index=studioComponentTaxonomyState.categories.findIndex((item)=>item.id===category.id);
    const moved=studioMoveArrayRow(studioComponentTaxonomyState.categories,index,action==='category-up'?-1:1);
    if(moved)saveStudioComponentTaxonomy();
  }
  if(action==='subcategory-add'){
    const addParent=$('studioTaxonomySubcategoryParentSelectAdd');
    const targetCategoryId=String(addParent&&addParent.value||studioComponentTaxonomySelection.category||'');
    const targetCategory=studioCategoryById(targetCategoryId);
    if(!targetCategory){openInfoDialog('Select Category','Choose a parent category first.');return;}
    if(!nextSubcategoryName){openInfoDialog('Subcategory Name Required','Enter a subcategory name to add.');return;}
    const exists=targetCategory.subcategories.some((item)=>normalizeNameKey(item.name)===normalizeNameKey(nextSubcategoryName));
    if(exists){openInfoDialog('Subcategory Exists','This subcategory already exists for the selected category.');return;}
    const created={id:studioTaxonomyId('sub'),name:nextSubcategoryName};
    targetCategory.subcategories.push(created);
    studioComponentTaxonomySelection.category=targetCategory.id;
    studioComponentTaxonomySelection.subcategory=created.id;
    setStudioTaxonomySectionMode('subcategories','browse');
    saveStudioComponentTaxonomy();
  }
  if(action==='subcategory-save' || action==='subcategory-rename'){
    if(!category){openInfoDialog('Select Category','Choose a parent category first.');return;}
    const subcategory=category.subcategories.find((item)=>item.id===studioComponentTaxonomySelection.subcategory);
    if(!subcategory){openInfoDialog('Select Subcategory','Choose a subcategory to rename.');return;}
    if(!nextSubcategoryName){openInfoDialog('Subcategory Name Required','Enter a new subcategory name.');return;}
    const editParent=$('studioTaxonomySubcategoryParentSelectEdit');
    const targetCategoryId=String(editParent&&editParent.value||studioComponentTaxonomySelection.category||'');
    const targetCategory=studioCategoryById(targetCategoryId);
    if(!targetCategory){openInfoDialog('Select Category','Choose a parent category first.');return;}
    const duplicate=targetCategory.subcategories.some((item)=>item.id!==subcategory.id && normalizeNameKey(item.name)===normalizeNameKey(nextSubcategoryName));
    if(duplicate){openInfoDialog('Subcategory Exists','Another subcategory already uses this name.');return;}
    const oldCategoryName=category.name;
    const oldName=subcategory.name;
    const movingParent=targetCategory.id!==category.id;
    if(movingParent){
      category.subcategories=category.subcategories.filter((item)=>item.id!==subcategory.id);
      targetCategory.subcategories.push(subcategory);
    }
    subcategory.name=nextSubcategoryName;
    if(movingParent){
      studioRelinkSubcategory(oldCategoryName,oldName,targetCategory.name,nextSubcategoryName);
    }else{
      studioRenameSubcategory(category.name,oldName,nextSubcategoryName);
    }
    studioComponentTaxonomySelection.category=targetCategory.id;
    studioComponentTaxonomySelection.subcategory=subcategory.id;
    setStudioTaxonomySectionMode('subcategories','edit');
    saveStudioComponentTaxonomy();
  }
  if(action==='subcategory-delete'){
    if(!category){openInfoDialog('Select Category','Choose a parent category first.');return;}
    const subcategory=category.subcategories.find((item)=>item.id===studioComponentTaxonomySelection.subcategory);
    if(!subcategory){openInfoDialog('Select Subcategory','Choose a subcategory to delete.');return;}
    const usage=studioCountSubcategoryUsage(category.name,subcategory.name);
    const deleteNow=()=>{
      category.subcategories=category.subcategories.filter((item)=>item.id!==subcategory.id);
      saveStudioComponentTaxonomy();
      refreshStudioComponentAndTaxonomyViews();
    };
    openConfirmDialog({
      title:usage>0?'Subcategory In Use':'Delete Subcategory',
      message:usage>0
        ?`${usage} component(s) use this subcategory. Continue and set affected components to Unassigned?`
        :'Delete this subcategory?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:usage>0?'Unassign & Delete':'Delete',kind:'danger'}]
    },(choice)=>{
      if(choice!=='delete')return;
      if(usage>0){
        studioReassignUsedSubcategoryToUnassigned(category.name,subcategory.name);
      }
      setStudioTaxonomySectionMode('subcategories','browse');
      deleteNow();
    });
    return;
  }
  if(action==='subcategory-up' || action==='subcategory-down'){
    if(!category)return;
    const subIndex=category.subcategories.findIndex((item)=>item.id===studioComponentTaxonomySelection.subcategory);
    const moved=studioMoveArrayRow(category.subcategories,subIndex,action==='subcategory-up'?-1:1);
    if(moved)saveStudioComponentTaxonomy();
  }
  if(action==='supplier-add'){
    if(!nextSupplierName){openInfoDialog('Supplier Name Required','Enter a supplier name to add.');return;}
    if(studioSupplierByName(nextSupplierName)){openInfoDialog('Supplier Exists','A supplier with this name already exists.');return;}
    const created={id:studioTaxonomyId('sup'),name:nextSupplierName};
    studioComponentTaxonomyState.suppliers.push(created);
    studioComponentTaxonomySelection.supplier=created.id;
    setStudioTaxonomySectionMode('suppliers','browse');
    saveStudioComponentTaxonomy();
  }
  if(action==='supplier-rename'){
    if(!supplier){openInfoDialog('Select Supplier','Choose a supplier to rename.');return;}
    if(!nextSupplierName){openInfoDialog('Supplier Name Required','Enter a new supplier name.');return;}
    const existing=studioSupplierByName(nextSupplierName);
    if(existing && existing.id!==supplier.id){openInfoDialog('Supplier Exists','Another supplier already uses this name.');return;}
    const oldName=supplier.name;
    supplier.name=nextSupplierName;
    studioRenameSupplier(oldName,nextSupplierName);
    saveStudioComponentTaxonomy();
    studioSupplierEditContext.baseline=nextSupplierName;
    studioSupplierEditContext.savedFlash=true;
    clearStudioSupplierSavedTimer();
    refreshStudioComponentAndTaxonomyViews();
    studioSupplierEditContext.savedTimer=window.setTimeout(()=>{
      studioSupplierEditContext.savedFlash=false;
      studioSupplierEditContext.savedTimer=0;
      setStudioTaxonomySectionMode('suppliers','browse');
      renderStudioTaxonomyManager();
    },700);
    return;
  }
  if(action==='supplier-delete'){
    if(!supplier){openInfoDialog('Select Supplier','Choose a supplier to delete.');return;}
    const usage=studioCountSupplierUsage(supplier.name);
    const deleteNow=()=>{
      studioComponentTaxonomyState.suppliers=studioComponentTaxonomyState.suppliers.filter((item)=>item.id!==supplier.id);
      saveStudioComponentTaxonomy();
      refreshStudioComponentAndTaxonomyViews();
    };
    openConfirmDialog({
      title:usage>0?'Supplier In Use':'Delete Supplier',
      message:usage>0
        ?`${usage} component(s) use this supplier. Continue and set affected components to Unassigned?`
        :'Delete this supplier?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:usage>0?'Unassign & Delete':'Delete',kind:'danger'}]
    },(choice)=>{
      if(choice!=='delete')return;
      if(usage>0){
        studioReassignUsedSupplierToUnassigned(supplier.name);
      }
      setStudioTaxonomySectionMode('suppliers','browse');
      deleteNow();
    });
    return;
  }
  if(action==='supplier-up' || action==='supplier-down'){
    if(!supplier)return;
    const index=studioComponentTaxonomyState.suppliers.findIndex((item)=>item.id===supplier.id);
    const moved=studioMoveArrayRow(studioComponentTaxonomyState.suppliers,index,action==='supplier-up'?-1:1);
    if(moved)saveStudioComponentTaxonomy();
  }
  refreshStudioComponentAndTaxonomyViews();
}
function studioCategoryNamesForLibrary(taxonomy,records){
  const hasUnassignedRecords=(records||[]).some((record)=>!normalizeNameKey(record&&record.category));
  const promotedComponentKeys=new Set((records||[])
    .filter((record)=>!normalizeNameKey(record&&record.category))
    .map((record)=>normalizeNameKey(record&&record.name))
    .filter(Boolean));
  const promotedCategoryKeys=new Set((Array.isArray(Store.get(COMPONENT_LIBRARY_STORAGE_KEY,[]))?Store.get(COMPONENT_LIBRARY_STORAGE_KEY,[]):[])
    .map((record)=>{
      const rawCategory=String(record&&record.category||'').trim();
      return rawCategory && !componentLibraryCategoryValue(record)?normalizeNameKey(rawCategory):'';
    })
    .filter(Boolean));
  const categoryNames=Array.from(new Set(
    (taxonomy&&Array.isArray(taxonomy.categories)?taxonomy.categories:[])
      .map((item)=>String(item.name||'').trim())
      .filter((name)=>{
        const key=normalizeNameKey(name);
        return !promotedComponentKeys.has(key) && !promotedCategoryKeys.has(key);
      })
      .filter(Boolean)
      .concat((records||[]).map((item)=>String(item&&item.category||'').trim()).filter(Boolean))
  ));
  if(hasUnassignedRecords && !categoryNames.some((name)=>normalizeNameKey(name)===normalizeNameKey(UNASSIGNED_COMPONENT_CATEGORY))){
    categoryNames.push(UNASSIGNED_COMPONENT_CATEGORY);
  }
  return categoryNames.sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
function studioSubcategoryNamesForLibrary(taxonomy,records,categoryName){
  const categoryKey=normalizeNameKey(categoryName);
  if(!categoryKey)return [];
  const scopedCategory=(taxonomy&&Array.isArray(taxonomy.categories)?taxonomy.categories:[])
    .find((item)=>normalizeNameKey(item.name)===categoryKey);
  const taxonomySubcategories=(scopedCategory&&Array.isArray(scopedCategory.subcategories)?scopedCategory.subcategories:[])
    .map((item)=>String(item.name||'').trim())
    .filter(Boolean);
  const recordSubcategories=(records||[])
    .filter((item)=>normalizeNameKey(item&&item.category)===categoryKey)
    .map((item)=>String(item&&item.subcategory||'').trim())
    .filter(Boolean);
  return Array.from(new Set(taxonomySubcategories.concat(recordSubcategories)))
    .sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
function currentStudioComponentRecord(){
  if(studioComponentDraft)return studioComponentDraft;
  const key=normalizeNameKey(studioSelectedComponentKey);
  if(!key)return null;
  return componentLibraryRecords().find((item)=>normalizeNameKey(item.name)===key)||null;
}
function closeStudioLibraryContextMenu(){
  studioLibraryContextMenu={type:'',key:''};
}
function openStudioLibraryContextMenu(type,key){
  studioLibraryContextMenu={type:String(type||''),key:String(key||'')};
}
function isStudioLibraryContextMenuOpen(type,key){
  return studioLibraryContextMenu.type===String(type||'') && studioLibraryContextMenu.key===String(key||'');
}
function studioCategorySelectionByName(categoryName){
  const category=studioCategoryByName(categoryName);
  if(!category)return null;
  studioComponentTaxonomySelection.category=category.id;
  studioComponentTaxonomySelection.subcategory='';
  return category;
}
function studioSubcategorySelectionByName(categoryName,subcategoryName){
  const category=studioCategoryByName(categoryName);
  if(!category)return null;
  const subcategory=category.subcategories.find((item)=>normalizeNameKey(item.name)===normalizeNameKey(subcategoryName));
  if(!subcategory)return null;
  studioComponentTaxonomySelection.category=category.id;
  studioComponentTaxonomySelection.subcategory=subcategory.id;
  return {category,subcategory};
}
function studioCategoryContextMenuMarkup(categoryName){
  return `<div class="studio-components-row-menu" role="menu" aria-label="Category actions">
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="category-rename" data-studio-library-name="${escapeAttributeValue(categoryName)}">Rename</button>
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="category-up" data-studio-library-name="${escapeAttributeValue(categoryName)}">Move Up</button>
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="category-down" data-studio-library-name="${escapeAttributeValue(categoryName)}">Move Down</button>
    <button class="studio-components-row-menu__item studio-components-row-menu__item--danger" type="button" role="menuitem" data-studio-library-menu-action="category-delete" data-studio-library-name="${escapeAttributeValue(categoryName)}">Delete</button>
  </div>`;
}
function studioSubcategoryContextMenuMarkup(subcategoryName){
  return `<div class="studio-components-row-menu" role="menu" aria-label="Subcategory actions">
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="subcategory-rename" data-studio-library-name="${escapeAttributeValue(subcategoryName)}">Rename</button>
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="subcategory-parent" data-studio-library-name="${escapeAttributeValue(subcategoryName)}">Change Parent Category</button>
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="subcategory-up" data-studio-library-name="${escapeAttributeValue(subcategoryName)}">Move Up</button>
    <button class="studio-components-row-menu__item" type="button" role="menuitem" data-studio-library-menu-action="subcategory-down" data-studio-library-name="${escapeAttributeValue(subcategoryName)}">Move Down</button>
    <button class="studio-components-row-menu__item studio-components-row-menu__item--danger" type="button" role="menuitem" data-studio-library-menu-action="subcategory-delete" data-studio-library-name="${escapeAttributeValue(subcategoryName)}">Delete</button>
  </div>`;
}
function renderStudioComponentsLibrary(){
  const list=$('studioComponentsList');
  const details=$('studioComponentDetails');
  const searchInput=$('studioComponentsSearch');
  const addBtn=$('studioComponentsAddBtn');
  const utilityBtn=$('studioComponentsUtilityBtn');
  const backLabel=$('studioComponentsBackLabel');
  const title=$('studioComponentsTitle');
  const subtitle=$('studioComponentsSubtitle');
  const listCard=list?list.closest('.studio-components-shell__list-card'):null;
  if(!list || !details)return;

  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const records=componentLibraryRecords();
  const queryRaw=String(studioComponentsSearch||'').trim();
  const queryKey=queryRaw.toLowerCase();
  if(searchInput && searchInput.value!==queryRaw){searchInput.value=queryRaw;}

  const categoryNames=studioCategoryNamesForLibrary(taxonomy,records);
  const validCategory=categoryNames.find((name)=>normalizeNameKey(name)===normalizeNameKey(studioLibraryPath.categoryId))||'';
  const supplierBrowseLevels=['supplier','supplier-category','supplier-subcategory','supplier-component'];
  if(!supplierBrowseLevels.includes(studioLibraryPath.level) && studioLibraryPath.level!=='categories' && !validCategory){
    studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
  }else if(validCategory){
    studioLibraryPath.categoryId=validCategory;
  }

  let scopeSubcategories=[];
  if(studioLibraryPath.level==='category' || studioLibraryPath.level==='subcategory' || studioLibraryPath.level==='component'){
    scopeSubcategories=studioSubcategoryNamesForLibrary(taxonomy,records,studioLibraryPath.categoryId);
  }
  if((studioLibraryPath.level==='subcategory' || studioLibraryPath.level==='component') && normalizeNameKey(studioLibraryPath.categoryId)!==normalizeNameKey(UNASSIGNED_COMPONENT_CATEGORY)){
    const validSubcategory=scopeSubcategories.find((name)=>normalizeNameKey(name)===normalizeNameKey(studioLibraryPath.subcategoryId))||'';
    if(!validSubcategory){
      studioLibraryPath={level:'category',categoryId:studioLibraryPath.categoryId,subcategoryId:''};
    }else{
      studioLibraryPath.subcategoryId=validSubcategory;
    }
  }

  const isCategoryAdd=studioLibraryEditor.type==='category' && studioLibraryEditor.mode==='add';
  const isSubcategoryAdd=studioLibraryEditor.type==='subcategory' && studioLibraryEditor.mode==='add';
  const isCategoryEdit=studioLibraryEditor.type==='category' && studioLibraryEditor.mode==='edit';
  const isSubcategoryEdit=studioLibraryEditor.type==='subcategory' && studioLibraryEditor.mode==='edit';
  const showFormScreen=isCategoryAdd || isSubcategoryAdd || isCategoryEdit || isSubcategoryEdit || studioLibraryPath.level==='component' || studioLibraryPath.level==='supplier-component';

  if(studioLibraryPath.level==='supplier'){
    const supplierKey=normalizeNameKey(studioLibraryPath.supplierName);
    const supplierCategories=Array.from(new Set(records
      .filter((record)=>normalizeNameKey(record&&record.supplier)===supplierKey && normalizeNameKey(record&&record.category))
      .map((record)=>String(record.category||'').trim())
      .filter(Boolean)))
      .filter((name)=>!queryKey || name.toLowerCase().includes(queryKey))
      .sort((left,right)=>left.localeCompare(right,undefined,{sensitivity:'base'}));
    list.innerHTML=supplierCategories.length?supplierCategories.map((name)=>`<button class="studio-components-list__item" type="button" data-studio-supplier-open-category="${escapeAttributeValue(name)}"><strong>${escapeHtml(name)}</strong></button>`).join(''):'<p class="studio-components-list__empty">No components assigned to this supplier.</p>';
    return;
  }

  if(studioLibraryPath.level==='supplier-category'){
    const supplierKey=normalizeNameKey(studioLibraryPath.supplierName);
    const categoryKey=normalizeNameKey(studioLibraryPath.categoryId);
    const supplierRecords=records.filter((record)=>normalizeNameKey(record&&record.supplier)===supplierKey && normalizeNameKey(record&&record.category)===categoryKey && studioComponentMatchesSearch(record,queryKey));
    const subcategories=Array.from(new Set(supplierRecords.map((record)=>String(record.subcategory||'').trim()).filter(Boolean)))
      .sort((left,right)=>left.localeCompare(right,undefined,{sensitivity:'base'}));
    const rows=subcategories.map((name)=>`<button class="studio-components-list__item" type="button" data-studio-supplier-open-subcategory="${escapeAttributeValue(name)}"><strong>${escapeHtml(name)}</strong></button>`);
    const direct=supplierRecords.filter((record)=>!normalizeNameKey(record.subcategory)).map((record)=>`<button class="studio-components-list__item" type="button" data-studio-supplier-open-component="${escapeAttributeValue(record.name)}"><strong>${escapeHtml(record.name)}</strong></button>`);
    list.innerHTML=rows.concat(direct).join('')||'<p class="studio-components-list__empty">No components found in this category.</p>';
    return;
  }

  if(studioLibraryPath.level==='supplier-subcategory'){
    const supplierKey=normalizeNameKey(studioLibraryPath.supplierName);
    const categoryKey=normalizeNameKey(studioLibraryPath.categoryId);
    const subcategoryKey=normalizeNameKey(studioLibraryPath.subcategoryId);
    const scopedRecords=records.filter((record)=>normalizeNameKey(record&&record.supplier)===supplierKey && normalizeNameKey(record&&record.category)===categoryKey && normalizeNameKey(record&&record.subcategory)===subcategoryKey && studioComponentMatchesSearch(record,queryKey));
    list.innerHTML=scopedRecords.length?scopedRecords.map((record)=>`<button class="studio-components-list__item" type="button" data-studio-supplier-open-component="${escapeAttributeValue(record.name)}"><strong>${escapeHtml(record.name)}</strong>${record.supplier?`<span>${escapeHtml(record.supplier)}</span>`:''}</button>`).join(''):'<p class="studio-components-list__empty">No components found in this subcategory.</p>';
    return;
  }

  if(studioLibraryPath.level==='categories'){
    if(backLabel)backLabel.textContent='BACK TO STUDIO';
    if(title)title.textContent='COMPONENTS';
    if(subtitle)subtitle.textContent='Manage the parts used in your builds.';
  }else if(studioLibraryPath.level==='category'){
    if(backLabel)backLabel.textContent='COMPONENTS';
    if(title)title.textContent=String(studioLibraryPath.categoryId||'CATEGORY').toUpperCase();
    if(subtitle)subtitle.textContent='';
  }else if(studioLibraryPath.level==='subcategory'){
    if(backLabel)backLabel.textContent=String(studioLibraryPath.categoryId||'CATEGORY').toUpperCase();
    if(title)title.textContent=String(studioLibraryPath.subcategoryId||'SUBCATEGORY').toUpperCase();
    if(subtitle)subtitle.textContent='';
  }else if(studioLibraryPath.level==='supplier'){
    if(backLabel)backLabel.textContent='SUPPLIERS';
    if(title)title.textContent=String(studioLibraryPath.supplierName||'SUPPLIER').toUpperCase();
    if(subtitle)subtitle.textContent='';
  }else if(studioLibraryPath.level==='supplier-category'){
    if(backLabel)backLabel.textContent=String(studioLibraryPath.supplierName||'SUPPLIER').toUpperCase();
    if(title)title.textContent=String(studioLibraryPath.categoryId||'CATEGORY').toUpperCase();
    if(subtitle)subtitle.textContent='';
  }else if(studioLibraryPath.level==='supplier-subcategory'){
    if(backLabel)backLabel.textContent=String(studioLibraryPath.categoryId||'CATEGORY').toUpperCase();
    if(title)title.textContent=String(studioLibraryPath.subcategoryId||'SUBCATEGORY').toUpperCase();
    if(subtitle)subtitle.textContent='';
  }else{
    const selected=currentStudioComponentRecord();
    if(backLabel)backLabel.textContent=(studioLibraryPath.level==='supplier-component'?String(studioLibraryPath.subcategoryId||studioLibraryPath.categoryId||studioLibraryPath.supplierName||'SUPPLIER'):(normalizeNameKey(studioLibraryPath.categoryId)===normalizeNameKey(UNASSIGNED_COMPONENT_CATEGORY)?UNASSIGNED_COMPONENT_CATEGORY:String(studioLibraryPath.subcategoryId||'SUBCATEGORY'))).toUpperCase();
    if(title)title.textContent=String((selected&&selected.name)||'COMPONENT DETAILS').toUpperCase();
    if(subtitle)subtitle.textContent='';
  }

  if(addBtn){
    addBtn.hidden=studioLibraryPath.level==='component' || studioLibraryPath.level.startsWith('supplier');
    addBtn.disabled=false;
    addBtn.textContent=studioLibraryPath.level==='categories'?'ADD CATEGORY':studioLibraryPath.level==='category'?'ADD SUBCATEGORY':'ADD COMPONENT';
  }
  if(utilityBtn){
    utilityBtn.hidden=studioLibraryPath.level!=='categories';
  }
  if(searchInput){
    searchInput.hidden=studioLibraryPath.level==='component' || studioLibraryPath.level==='supplier-component';
  }
  if(listCard)listCard.hidden=showFormScreen;
  details.hidden=!showFormScreen;

  if(isCategoryAdd){
    details.innerHTML='<div class="studio-component-details__head"><h2>ADD CATEGORY</h2><p>Create a category for your parts library.</p></div><div class="studio-component-details__fields"><label><span>Category Name</span><input id="studioLibraryCategoryName" type="text" placeholder="Category name" /></label></div><div class="studio-component-details__actions"><button class="primary-action studio-component-details__save" type="button" data-studio-library-action="category-add">Add Category</button></div>';
    return;
  }
  if(isSubcategoryAdd){
    details.innerHTML=`<div class="studio-component-details__head"><h2>ADD SUBCATEGORY</h2><p>Create a subcategory under ${escapeHtml(studioLibraryPath.categoryId)}.</p></div><div class="studio-component-details__fields"><label><span>Subcategory Name</span><input id="studioLibrarySubcategoryName" type="text" placeholder="Subcategory name" /></label></div><div class="studio-component-details__actions"><button class="primary-action studio-component-details__save" type="button" data-studio-library-action="subcategory-add">Add Subcategory</button></div>`;
    return;
  }
  if(isCategoryEdit){
    details.innerHTML=`<div class="studio-component-details__head"><h2>RENAME CATEGORY</h2><p>Update the category name.</p></div><div class="studio-component-details__fields"><label><span>Category Name</span><input id="studioLibraryCategoryName" type="text" value="${escapeHtml(studioLibraryEditor.targetName||'')}" /></label></div><div class="studio-component-details__actions"><button class="primary-action studio-component-details__save" type="button" data-studio-library-action="category-rename">Save</button><button class="ghost-action" type="button" data-studio-library-action="editor-cancel">Cancel</button></div>`;
    return;
  }
  if(isSubcategoryEdit){
    const taxonomyCategories=ensureStudioComponentTaxonomyLoaded().categories||[];
    const sourceCategoryName=String(studioLibraryEditor.sourceCategory||studioLibraryPath.categoryId||'').trim();
    const categoryOptions=taxonomyCategories
      .map((category)=>`<option value="${escapeAttributeValue(category.name)}"${normalizeNameKey(category.name)===normalizeNameKey(sourceCategoryName)?' selected':''}>${escapeHtml(category.name)}</option>`)
      .join('');
    details.innerHTML=`<div class="studio-component-details__head"><h2>EDIT SUBCATEGORY</h2><p>Rename or move this subcategory to another category.</p></div><div class="studio-component-details__fields"><label><span>Subcategory Name</span><input id="studioLibrarySubcategoryName" type="text" value="${escapeHtml(studioLibraryEditor.targetName||'')}" /></label><label><span>Parent Category</span><select id="studioLibrarySubcategoryParent">${categoryOptions}</select></label></div><div class="studio-component-details__actions"><button class="primary-action studio-component-details__save" type="button" data-studio-library-action="subcategory-rename">Save</button><button class="ghost-action" type="button" data-studio-library-action="editor-cancel">Cancel</button></div>`;
    return;
  }

  if(studioLibraryPath.level==='categories'){
    const visibleCategories=categoryNames.filter((name)=>!queryKey || name.toLowerCase().includes(queryKey));
    if(!visibleCategories.length){
      list.innerHTML='<p class="studio-components-list__empty">No categories found.</p>';
    }else{
      list.innerHTML=visibleCategories.map((name)=>{
        const menuKey=normalizeNameKey(name);
        const menuOpen=isStudioLibraryContextMenuOpen('category',menuKey);
        return `<article class="studio-components-list__row"><button class="studio-components-list__item" type="button" data-studio-library-open-category="${escapeAttributeValue(name)}"><strong>${escapeHtml(name)}</strong></button><button class="studio-components-list__menu-trigger" type="button" aria-label="Category actions" data-studio-library-menu-toggle="category" data-studio-library-menu-key="${escapeAttributeValue(menuKey)}">&hellip;</button>${menuOpen?studioCategoryContextMenuMarkup(name):''}</article>`;
      }).join('');
    }
    return;
  }

  if(studioLibraryPath.level==='category'){
    if(normalizeNameKey(studioLibraryPath.categoryId)===normalizeNameKey(UNASSIGNED_COMPONENT_CATEGORY)){
      const unassignedRecords=records.filter((record)=>!normalizeNameKey(record&&record.category) && studioComponentMatchesSearch(record,queryKey));
      if(!unassignedRecords.length){
        list.innerHTML='<p class="studio-components-list__empty">No unassigned components found.</p>';
      }else{
        list.innerHTML=unassignedRecords.map((record)=>{
          const name=String(record&&record.name||'').trim();
          const supplier=String(record&&record.supplier||'').trim();
          const specifications=studioMergedSpecificationValue(record);
          const secondary=[supplier,specifications].filter(Boolean).join(' • ');
          return `<button class="studio-components-list__item" type="button" data-studio-library-open-component="${escapeAttributeValue(name)}"><strong>${escapeHtml(name)}</strong>${secondary?`<span>${escapeHtml(secondary)}</span>`:''}</button>`;
        }).join('');
      }
      return;
    }
    const visibleSubcategories=scopeSubcategories.filter((name)=>!queryKey || name.toLowerCase().includes(queryKey));
    if(!visibleSubcategories.length){
      list.innerHTML='<p class="studio-components-list__empty">No subcategories found.</p>';
    }else{
      list.innerHTML=visibleSubcategories.map((name)=>{
        const menuKey=normalizeNameKey(name);
        const menuOpen=isStudioLibraryContextMenuOpen('subcategory',menuKey);
        return `<article class="studio-components-list__row"><button class="studio-components-list__item" type="button" data-studio-library-open-subcategory="${escapeAttributeValue(name)}"><strong>${escapeHtml(name)}</strong></button><button class="studio-components-list__menu-trigger" type="button" aria-label="Subcategory actions" data-studio-library-menu-toggle="subcategory" data-studio-library-menu-key="${escapeAttributeValue(menuKey)}">&hellip;</button>${menuOpen?studioSubcategoryContextMenuMarkup(name):''}</article>`;
      }).join('');
    }
    return;
  }

  if(studioLibraryPath.level==='subcategory'){
    const trackStock=activeTrackComponentStock();
    const scopedRecords=records.filter((item)=>normalizeNameKey(item.category)===normalizeNameKey(studioLibraryPath.categoryId) && normalizeNameKey(item.subcategory)===normalizeNameKey(studioLibraryPath.subcategoryId));
    const visible=scopedRecords.filter((record)=>studioComponentMatchesSearch(record,queryKey));
    if(!visible.length){
      list.innerHTML='<p class="studio-components-list__empty">No components found in this subcategory.</p>';
    }else{
      list.innerHTML=visible.map((record)=>{
        const name=String(record&&record.name||'').trim();
        const supplier=String(record&&record.supplier||'').trim();
        const buyValue=record&&record.unitCost!==undefined?numberOrZero(record.unitCost):(record&&record.cost!==undefined?numberOrZero(record.cost):undefined);
        const sellValue=record&&record.unitPrice!==undefined?numberOrZero(record.unitPrice):undefined;
        const pricingBits=[];
        if(buyValue!==undefined)pricingBits.push(`Buy $${buyValue.toFixed(2)}`);
        if(sellValue!==undefined)pricingBits.push(`Sell $${sellValue.toFixed(2)}`);
        const secondaryParts=[];
        if(supplier)secondaryParts.push(supplier);
        if(pricingBits.length)secondaryParts.push(pricingBits.join(' · '));
        if(trackStock){
          const stockValue=componentLibraryStockValue(record);
          secondaryParts.push(`In Stock ${stockValue===undefined?0:stockValue}`);
        }
        const secondary=secondaryParts.join(' • ');
        return `<button class="studio-components-list__item" type="button" data-studio-library-open-component="${escapeAttributeValue(name)}"><strong>${escapeHtml(name)}</strong>${secondary?`<span>${escapeHtml(secondary)}</span>`:''}</button>`;
      }).join('');
    }
    return;
  }

  const componentRecord=currentStudioComponentRecord();
  if(!componentRecord){
    studioComponentDraft=null;
    studioSelectedComponentKey='';
    studioLibraryPath={level:'subcategory',categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
    renderStudioComponentsLibrary();
    return;
  }
  renderStudioComponentDetails(componentRecord,{addMode:!!studioComponentDraft});
}
function bindStudioComponentsPanel(){
  const panel=$('studioComponentsPanel');
  if(!panel || panel.getAttribute('data-studio-components-bound')==='true')return;
  panel.setAttribute('data-studio-components-bound','true');
  ensureStudioComponentTaxonomyLoaded();

  const backBtn=$('studioComponentsBackBtn');
  if(backBtn){
    backBtn.addEventListener('click',()=>{
      clearStudioComponentSavedTimer();
      if(studioLibraryEditor.type){
        studioLibraryEditor={type:'',mode:'',targetName:''};
        renderStudioComponentsLibrary();
        return;
      }
      if(studioLibraryPath.level==='component'){
        studioComponentDraft=null;
        studioLibraryPath={level:'subcategory',categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
        renderStudioComponentsLibrary();
        return;
      }
      if(studioLibraryPath.level==='supplier-component'){
        studioLibraryPath={level:studioLibraryPath.subcategoryId?'supplier-subcategory':'supplier-category',supplierName:studioLibraryPath.supplierName,categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
        renderStudioComponentsLibrary();
        return;
      }
      if(studioLibraryPath.level==='supplier-subcategory'){
        studioLibraryPath={level:'supplier-category',supplierName:studioLibraryPath.supplierName,categoryId:studioLibraryPath.categoryId,subcategoryId:''};
        renderStudioComponentsLibrary();
        return;
      }
      if(studioLibraryPath.level==='supplier-category'){
        studioLibraryPath={level:'supplier',supplierName:studioLibraryPath.supplierName,categoryId:'',subcategoryId:''};
        renderStudioComponentsLibrary();
        return;
      }
      if(studioLibraryPath.level==='supplier'){
        showStudioTaxonomyManager();
        return;
      }
      if(studioLibraryPath.level==='subcategory'){
        studioLibraryPath={level:'category',categoryId:studioLibraryPath.categoryId,subcategoryId:''};
        renderStudioComponentsLibrary();
        return;
      }
      if(studioLibraryPath.level==='category'){
        studioLibraryPath={level:'categories',categoryId:'',subcategoryId:''};
        renderStudioComponentsLibrary();
        return;
      }
      studioComponentDraft=null;
      showStudioLanding();
    });
  }

  const searchInput=$('studioComponentsSearch');
  if(searchInput){
    searchInput.addEventListener('input',()=>{
      studioComponentsSearch=searchInput.value||'';
      renderStudioComponentsLibrary();
    });
  }

  const addBtn=$('studioComponentsAddBtn');
  if(addBtn){
    addBtn.addEventListener('click',()=>{
      if(studioLibraryPath.level==='categories'){
        studioLibraryEditor={type:'category',mode:'add',targetName:''};
      }else if(studioLibraryPath.level==='category'){
        studioLibraryEditor={type:'subcategory',mode:'add',targetName:''};
      }else if(studioLibraryPath.level==='subcategory'){
        studioComponentDraft={
          name:'',
          category:studioLibraryPath.categoryId,
          subcategory:studioLibraryPath.subcategoryId,
          supplier:'',
          description:'',
          specifications:'',
          cost:undefined,
          unitPrice:undefined,
        };
        studioLibraryEditor={type:'component',mode:'add',targetName:''};
        studioLibraryPath={level:'component',categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
      }
      renderStudioComponentsLibrary();
      const nameInput=$('studioComponentName')||$('studioLibraryCategoryName')||$('studioLibrarySubcategoryName');
      if(nameInput)nameInput.focus();
    });
  }

  const utilityBtn=$('studioComponentsUtilityBtn');
  if(utilityBtn){
    utilityBtn.addEventListener('click',()=>{
      showStudioTaxonomyManager();
    });
  }

  const list=$('studioComponentsList');
  if(list){
    list.addEventListener('click',(event)=>{
      const menuToggle=event.target.closest('[data-studio-library-menu-toggle]');
      if(menuToggle){
        const type=String(menuToggle.getAttribute('data-studio-library-menu-toggle')||'');
        const key=String(menuToggle.getAttribute('data-studio-library-menu-key')||'');
        const isOpen=isStudioLibraryContextMenuOpen(type,key);
        if(isOpen){
          closeStudioLibraryContextMenu();
        }else{
          openStudioLibraryContextMenu(type,key);
        }
        renderStudioComponentsLibrary();
        return;
      }
      const menuActionButton=event.target.closest('[data-studio-library-menu-action]');
      if(menuActionButton){
        const action=String(menuActionButton.getAttribute('data-studio-library-menu-action')||'');
        const name=String(menuActionButton.getAttribute('data-studio-library-name')||'').trim();
        closeStudioLibraryContextMenu();
        if(action.startsWith('category-')){
          const category=studioCategorySelectionByName(name);
          if(!category){openInfoDialog('Category Missing','The selected category was not found.');renderStudioComponentsLibrary();return;}
          if(action==='category-rename'){
            studioLibraryEditor={type:'category',mode:'edit',targetName:category.name};
            renderStudioComponentsLibrary();
            return;
          }
          if(action==='category-up'){handleStudioTaxonomyAction('category-up');return;}
          if(action==='category-down'){handleStudioTaxonomyAction('category-down');return;}
          if(action==='category-delete'){handleStudioTaxonomyAction('category-delete');return;}
        }
        if(action.startsWith('subcategory-')){
          const scoped=studioSubcategorySelectionByName(studioLibraryPath.categoryId,name);
          if(!scoped){openInfoDialog('Subcategory Missing','The selected subcategory was not found.');renderStudioComponentsLibrary();return;}
          if(action==='subcategory-rename' || action==='subcategory-parent'){
            studioLibraryEditor={type:'subcategory',mode:'edit',targetName:scoped.subcategory.name,sourceCategory:scoped.category.name};
            renderStudioComponentsLibrary();
            return;
          }
          if(action==='subcategory-up'){handleStudioTaxonomyAction('subcategory-up');return;}
          if(action==='subcategory-down'){handleStudioTaxonomyAction('subcategory-down');return;}
          if(action==='subcategory-delete'){handleStudioTaxonomyAction('subcategory-delete');return;}
        }
        renderStudioComponentsLibrary();
        return;
      }
      const supplierCategoryButton=event.target.closest('[data-studio-supplier-open-category]');
      if(supplierCategoryButton){
        studioLibraryPath={level:'supplier-category',supplierName:studioLibraryPath.supplierName,categoryId:String(supplierCategoryButton.getAttribute('data-studio-supplier-open-category')||''),subcategoryId:''};
        renderStudioComponentsLibrary();
        return;
      }
      const supplierSubcategoryButton=event.target.closest('[data-studio-supplier-open-subcategory]');
      if(supplierSubcategoryButton){
        studioLibraryPath={level:'supplier-subcategory',supplierName:studioLibraryPath.supplierName,categoryId:studioLibraryPath.categoryId,subcategoryId:String(supplierSubcategoryButton.getAttribute('data-studio-supplier-open-subcategory')||'')};
        renderStudioComponentsLibrary();
        return;
      }
      const supplierComponentButton=event.target.closest('[data-studio-supplier-open-component]');
      if(supplierComponentButton){
        studioSelectedComponentKey=normalizeNameKey(supplierComponentButton.getAttribute('data-studio-supplier-open-component')||'');
        studioLibraryPath={level:'supplier-component',supplierName:studioLibraryPath.supplierName,categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
        renderStudioComponentsLibrary();
        return;
      }
      const openCategoryButton=event.target.closest('[data-studio-library-open-category]');
      if(openCategoryButton){
        closeStudioLibraryContextMenu();
        studioLibraryPath={level:'category',categoryId:String(openCategoryButton.getAttribute('data-studio-library-open-category')||''),subcategoryId:''};
        studioLibraryEditor={type:'',mode:'',targetName:''};
        studioComponentDraft=null;
        renderStudioComponentsLibrary();
        return;
      }
      const openSubcategoryButton=event.target.closest('[data-studio-library-open-subcategory]');
      if(openSubcategoryButton){
        closeStudioLibraryContextMenu();
        studioLibraryPath={level:'subcategory',categoryId:studioLibraryPath.categoryId,subcategoryId:String(openSubcategoryButton.getAttribute('data-studio-library-open-subcategory')||'')};
        studioLibraryEditor={type:'',mode:'',targetName:''};
        studioComponentDraft=null;
        renderStudioComponentsLibrary();
        return;
      }
      const openComponentButton=event.target.closest('[data-studio-library-open-component]');
      if(openComponentButton){
        closeStudioLibraryContextMenu();
        studioComponentDraft=null;
        studioLibraryEditor={type:'',mode:'',targetName:''};
        studioSelectedComponentKey=normalizeNameKey(openComponentButton.getAttribute('data-studio-library-open-component')||'');
        studioLibraryPath={level:'component',categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
        renderStudioComponentsLibrary();
      }
    });
  }

  const details=$('studioComponentDetails');
  if(details){
    details.addEventListener('input',()=>{
      syncStudioComponentSaveButtonState();
    });
    details.addEventListener('change',(event)=>{
      const target=event.target;
      if(target && target.id==='studioComponentCategory'){
        const subcategorySelect=$('studioComponentSubcategory');
        const selectedCategory=String(target.value||'').trim();
        const options=categorySubcategoryOptionsMarkup(selectedCategory,'');
        if(subcategorySelect){
          subcategorySelect.innerHTML=options.subcategoryOptions;
        }
      }
      syncStudioComponentSaveButtonState();
    });
    details.addEventListener('click',(event)=>{
      const libraryActionButton=event.target.closest('[data-studio-library-action]');
      if(libraryActionButton){
        const action=String(libraryActionButton.getAttribute('data-studio-library-action')||'');
        const taxonomy=ensureStudioComponentTaxonomyLoaded();
        if(action==='editor-cancel'){
          studioLibraryEditor={type:'',mode:'',targetName:''};
          renderStudioComponentsLibrary();
          return;
        }
        if(action==='category-add'){
          const input=$('studioLibraryCategoryName');
          const nextName=String(input&&input.value||'').trim();
          if(!nextName){openInfoDialog('Category Name Required','Enter a category name.');return;}
          if(taxonomy.categories.some((item)=>normalizeNameKey(item.name)===normalizeNameKey(nextName))){openInfoDialog('Category Exists','A category with this name already exists.');return;}
          taxonomy.categories.push({id:studioTaxonomyId('cat'),name:nextName,subcategories:[]});
          saveStudioComponentTaxonomy();
          studioLibraryEditor={type:'',mode:'',targetName:''};
          studioLibraryPath={level:'category',categoryId:nextName,subcategoryId:''};
          renderStudioComponentsLibrary();
          return;
        }
        if(action==='category-rename'){
          const sourceName=String(studioLibraryEditor.targetName||'').trim();
          const input=$('studioLibraryCategoryName');
          const nextName=String(input&&input.value||'').trim();
          if(!sourceName)return;
          if(!nextName){openInfoDialog('Category Name Required','Enter a category name.');return;}
          const duplicate=taxonomy.categories.some((item)=>normalizeNameKey(item.name)===normalizeNameKey(nextName) && normalizeNameKey(item.name)!==normalizeNameKey(sourceName));
          if(duplicate){openInfoDialog('Category Exists','A category with this name already exists.');return;}
          const target=taxonomy.categories.find((item)=>normalizeNameKey(item.name)===normalizeNameKey(sourceName));
          if(!target){openInfoDialog('Category Missing','The selected category was not found.');return;}
          target.name=nextName;
          studioRenameCategory(sourceName,nextName);
          if(normalizeNameKey(studioLibraryPath.categoryId)===normalizeNameKey(sourceName))studioLibraryPath.categoryId=nextName;
          saveStudioComponentTaxonomy();
          studioLibraryEditor={type:'',mode:'',targetName:''};
          renderStudioComponentsLibrary();
          return;
        }
        if(action==='subcategory-add'){
          const categoryName=String(studioLibraryPath.categoryId||'').trim();
          if(!categoryName){openInfoDialog('Category Required','Open a category first.');return;}
          const input=$('studioLibrarySubcategoryName');
          const nextName=String(input&&input.value||'').trim();
          if(!nextName){openInfoDialog('Subcategory Name Required','Enter a subcategory name.');return;}
          const category=taxonomy.categories.find((item)=>normalizeNameKey(item.name)===normalizeNameKey(categoryName));
          if(!category){
            taxonomy.categories.push({id:studioTaxonomyId('cat'),name:categoryName,subcategories:[{id:studioTaxonomyId('sub'),name:nextName}]});
          }else{
            const exists=category.subcategories.some((item)=>normalizeNameKey(item.name)===normalizeNameKey(nextName));
            if(exists){openInfoDialog('Subcategory Exists','This subcategory already exists in the selected category.');return;}
            category.subcategories.push({id:studioTaxonomyId('sub'),name:nextName});
          }
          saveStudioComponentTaxonomy();
          studioLibraryEditor={type:'',mode:'',targetName:''};
          studioLibraryPath={level:'subcategory',categoryId:categoryName,subcategoryId:nextName};
          renderStudioComponentsLibrary();
          return;
        }
        if(action==='subcategory-rename'){
          const sourceCategoryName=String(studioLibraryEditor.sourceCategory||studioLibraryPath.categoryId||'').trim();
          const sourceName=String(studioLibraryEditor.targetName||'').trim();
          const nextName=String(($('studioLibrarySubcategoryName')&&$('studioLibrarySubcategoryName').value)||'').trim();
          const nextCategoryName=String(($('studioLibrarySubcategoryParent')&&$('studioLibrarySubcategoryParent').value)||sourceCategoryName).trim();
          if(!sourceCategoryName || !sourceName)return;
          if(!nextName){openInfoDialog('Subcategory Name Required','Enter a subcategory name.');return;}
          const sourceCategory=taxonomy.categories.find((item)=>normalizeNameKey(item.name)===normalizeNameKey(sourceCategoryName));
          const nextCategory=taxonomy.categories.find((item)=>normalizeNameKey(item.name)===normalizeNameKey(nextCategoryName));
          if(!sourceCategory || !nextCategory){openInfoDialog('Category Missing','The selected parent category was not found.');return;}
          const subcategory=sourceCategory.subcategories.find((item)=>normalizeNameKey(item.name)===normalizeNameKey(sourceName));
          if(!subcategory){openInfoDialog('Subcategory Missing','The selected subcategory was not found.');return;}
          const duplicate=nextCategory.subcategories.some((item)=>item.id!==subcategory.id && normalizeNameKey(item.name)===normalizeNameKey(nextName));
          if(duplicate){openInfoDialog('Subcategory Exists','This subcategory already exists in the selected category.');return;}
          const movingParent=nextCategory.id!==sourceCategory.id;
          if(movingParent){
            sourceCategory.subcategories=sourceCategory.subcategories.filter((item)=>item.id!==subcategory.id);
            nextCategory.subcategories.push(subcategory);
            studioRelinkSubcategory(sourceCategory.name,sourceName,nextCategory.name,nextName);
          }else{
            studioRenameSubcategory(sourceCategory.name,sourceName,nextName);
          }
          subcategory.name=nextName;
          saveStudioComponentTaxonomy();
          studioLibraryEditor={type:'',mode:'',targetName:''};
          studioLibraryPath={level:'category',categoryId:nextCategory.name,subcategoryId:''};
          renderStudioComponentsLibrary();
          return;
        }
      }

      const saveButton=event.target.closest('#studioComponentSaveBtn');
      if(saveButton){
        saveStudioComponentDetails();
        return;
      }

      const deleteButton=event.target.closest('#studioComponentDeleteBtn');
      if(deleteButton){
        const record=currentStudioComponentRecord();
        if(!record || !record.name)return;
        openConfirmDialog({
          title:'Delete Component',
          message:`Delete ${record.name}? This removes only this reusable library component.`,
          actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'delete',label:'Delete',kind:'danger'}]
        },(choice)=>{
          if(choice!=='delete')return;
          removeComponentLibraryRecord(record.name);
          studioComponentDraft=null;
          studioSelectedComponentKey='';
          studioLibraryPath={level:'subcategory',categoryId:studioLibraryPath.categoryId,subcategoryId:studioLibraryPath.subcategoryId};
          renderStudioComponentsLibrary();
        });
      }
    });
  }
  document.addEventListener('click',(event)=>{
    if(!studioLibraryContextMenu.type || !studioLibraryContextMenu.key)return;
    if(panel.contains(event.target) && !event.target.closest('.studio-components-row-menu') && !event.target.closest('[data-studio-library-menu-toggle]')){
      closeStudioLibraryContextMenu();
      renderStudioComponentsLibrary();
    }
  });
}
function bindStudioTaxonomyPanel(){
  const panel=$('studioTaxonomyPanel');
  if(!panel || panel.getAttribute('data-studio-taxonomy-bound')==='true')return;
  panel.setAttribute('data-studio-taxonomy-bound','true');

  const backBtn=$('studioTaxonomyBackBtn');
  if(backBtn){
    backBtn.addEventListener('click',()=>{
      showStudioComponents();
    });
  }

  const nav=$('studioTaxonomySectionNav');
  if(nav){
    nav.addEventListener('click',(event)=>{
      const sectionButton=event.target.closest('[data-taxonomy-section]');
      if(!sectionButton)return;
      const nextSection=String(sectionButton.getAttribute('data-taxonomy-section')||'categories');
      if(!['categories','subcategories','suppliers'].includes(nextSection))return;
      studioTaxonomyManagerSection=nextSection;
      renderStudioTaxonomyManager();
    });
  }

  panel.addEventListener('change',(event)=>{
    const browseParent=event.target.closest('#studioTaxonomySubcategoryParentSelectBrowse');
    if(browseParent){
      studioComponentTaxonomySelection.category=String(browseParent.value||'');
      studioComponentTaxonomySelection.subcategory='';
      renderStudioTaxonomyManager();
      return;
    }
    const addParent=event.target.closest('#studioTaxonomySubcategoryParentSelectAdd');
    if(addParent){
      studioComponentTaxonomySelection.category=String(addParent.value||studioComponentTaxonomySelection.category||'');
      return;
    }
  });

  panel.addEventListener('input',(event)=>{
    const supplierNameInput=event.target.closest('#studioTaxonomySupplierName');
    if(supplierNameInput){
      syncStudioTaxonomySupplierSaveButtonState();
    }
  });

  panel.addEventListener('click',(event)=>{
    const browseSupplierButton=event.target.closest('[data-taxonomy-browse-supplier]');
    if(browseSupplierButton){
      const supplierName=String(browseSupplierButton.getAttribute('data-taxonomy-browse-supplier')||'').trim();
      if(supplierName)showStudioSupplierBrowse(supplierName);
      return;
    }
    const supplierMenuToggle=event.target.closest('[data-taxonomy-supplier-menu-toggle]');
    if(supplierMenuToggle){
      const supplierId=String(supplierMenuToggle.getAttribute('data-taxonomy-supplier-menu-toggle')||'');
      studioSupplierContextMenu=studioSupplierContextMenu===supplierId?'':supplierId;
      renderStudioTaxonomyManager();
      return;
    }
    const supplierMenuAction=event.target.closest('[data-taxonomy-supplier-action]');
    if(supplierMenuAction){
      if(supplierMenuAction.disabled)return;
      const action=String(supplierMenuAction.getAttribute('data-taxonomy-supplier-action')||'');
      const supplierId=String(supplierMenuAction.getAttribute('data-taxonomy-id')||'');
      studioSupplierContextMenu='';
      studioComponentTaxonomySelection.supplier=supplierId;
      if(action==='edit'){
        const supplierRecord=studioSupplierById(supplierId);
        studioSupplierEditContext={baseline:supplierRecord?String(supplierRecord.name||''):'',savedTimer:0,savedFlash:false};
        setStudioTaxonomySectionMode('suppliers','edit');
        renderStudioTaxonomyManager();
      }else if(action==='delete'){
        handleStudioTaxonomyAction('supplier-delete');
      }else if(action==='move-up'){
        handleStudioTaxonomyAction('supplier-up');
      }else if(action==='move-down'){
        handleStudioTaxonomyAction('supplier-down');
      }
      return;
    }
    const selectButton=event.target.closest('[data-taxonomy-select]');
    if(selectButton){
      const selectType=String(selectButton.getAttribute('data-taxonomy-select')||'');
      const selectId=String(selectButton.getAttribute('data-taxonomy-id')||'');
      if(selectType==='category'){
        studioComponentTaxonomySelection.category=selectId;
        studioComponentTaxonomySelection.subcategory='';
        setStudioTaxonomySectionMode('categories','edit');
      }else if(selectType==='subcategory'){
        studioComponentTaxonomySelection.subcategory=selectId;
        setStudioTaxonomySectionMode('subcategories','edit');
      }else if(selectType==='supplier'){
        studioComponentTaxonomySelection.supplier=selectId;
        const supplierRecord=studioSupplierById(selectId);
        studioSupplierEditContext={baseline:supplierRecord?String(supplierRecord.name||''):'',savedTimer:0,savedFlash:false};
        setStudioTaxonomySectionMode('suppliers','edit');
      }
      renderStudioTaxonomyManager();
      return;
    }

    const uiActionButton=event.target.closest('[data-taxonomy-ui-action]');
    if(uiActionButton){
      const action=String(uiActionButton.getAttribute('data-taxonomy-ui-action')||'');
      if(action==='category-open-add')setStudioTaxonomySectionMode('categories','add');
      if(action==='category-cancel')setStudioTaxonomySectionMode('categories','browse');
      if(action==='subcategory-open-add')setStudioTaxonomySectionMode('subcategories','add');
      if(action==='subcategory-cancel')setStudioTaxonomySectionMode('subcategories','browse');
      if(action==='supplier-open-add')setStudioTaxonomySectionMode('suppliers','add');
      if(action==='supplier-cancel')setStudioTaxonomySectionMode('suppliers','browse');
      renderStudioTaxonomyManager();
      return;
    }

    const taxonomyActionButton=event.target.closest('[data-taxonomy-action]');
    if(taxonomyActionButton){
      const action=String(taxonomyActionButton.getAttribute('data-taxonomy-action')||'');
      if(action){
        handleStudioTaxonomyAction(action);
      }
    }
  });
}
function openInfoDialog(title,message){
  openConfirmDialog({
    title:title||'Notice',
    message:message||'Please review this information.',
    actions:[{id:'ok',label:'OK',kind:'primary'}]
  },()=>{});
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
  clearQuoteAutosaveTimer();
  closeCurrentBuildActionsMenu();
  clearActiveSavedBuildRef();
  quote=normalizeQuote(newQuoteTemplate());
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  collapseWorkshopSections();
  renderBuilds();
  renderCustomerFinder();
  goScreen('buildsScreen');
}
function requestDeleteCurrentBuild(){
  const target=findCurrentSavedBuildTarget();
  if(!target){
    flashWorkshopStatus('Save the build before deleting',{pending:true,duration:2000});
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
  clearQuoteAutosaveTimer();
  closeCurrentBuildActionsMenu();
  clearActiveSavedBuildRef();
  quote=normalizeQuote(newQuoteTemplate());
  saveQuoteCurrent();
  markQuoteSaved();
  showStudioWorkflow();
  renderWorkshopQuote();
  collapseWorkshopSections();
  focusWorkshopSection(settings.focusSection||'workshopCustomerBody',{scroll:false});
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
  if(Object.prototype.hasOwnProperty.call(source,'country')){
    target.country=String(source.country||'').trim();
  }else{
    target.country=String(target.country||'').trim();
  }
  return target;
}
function startFreshQuoteForCustomer(record,options){
  const settings={...(options||{})};
  const next=newQuoteTemplate();
  applyCustomerFieldsToQuoteFromRecord(next,record);
  clearQuoteAutosaveTimer();
  closeCurrentBuildActionsMenu();
  clearActiveSavedBuildRef();
  quote=normalizeQuote(next);
  saveQuoteCurrent();
  markQuoteSaved();
  showStudioWorkflow();
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
  runNewBuildStartAction(()=>{
    openCustomerFinderSheet('new-build');
  });
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
  blank.fg=clampMeasurementValue(blank.fg,50,300);
  blank.gc=clampValue(blank.gc,5,20);
  blank.ts=clampMeasurementValue(blank.ts,500,2500);
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
  const numberValue=(key)=>escapeHtml(key==='fg' || key==='ts'?blankMeasurementInputText(blank&&blank[key]):String(numberOrZero(blank&&blank[key])));
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
        <label><span>First Guide (${measurementUnitSuffix()})</span><input data-selected-blank-field="fg" type="text" inputmode="decimal" value="${numberValue('fg')}" /></label>
        <label><span>Guide Count</span><input data-selected-blank-field="gc" type="number" min="5" max="20" step="1" value="${numberValue('gc')}" /></label>
        <label class="blank-editor-grid__full"><span>Target Stripper (${measurementUnitSuffix()})</span><input data-selected-blank-field="ts" type="text" inputmode="decimal" value="${numberValue('ts')}" /></label>
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
  if(field==='fg' || field==='ts'){
    selectedBlankEditState.draft[field]=parseBlankMeasurementInput(value,selectedBlankEditState.draft[field]);
    return;
  }
  if(field==='cost' || field==='gc'){
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
    openInfoDialog('Blank Name Required','Enter a blank name before saving.');
    waitForDomRender(()=>{
      const firstField=$('[data-selected-blank-field="model"]');
      if(firstField){
        try{firstField.focus({preventScroll:true});}catch{firstField.focus();}
      }
    });
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
  flashWorkshopStatus('Blank updated');
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
  const previousRecord=target?normalizeQuote(target.record):null;
  const persistedQuote=quoteForPersistence(currentQuote);
  const nowIso=new Date().toISOString();
  if(target){
    const createdAt=specificationValue(target.record&&target.record.createdAt)||specificationValue(target.record&&target.record.savedAt)||nowIso;
    const updatedRecord={
      ...persistedQuote,
      createdAt,
      savedAt:nowIso,
      updatedAt:nowIso,
    };
    records.splice(target.index,1);
    records.unshift(updatedRecord);
    Store.set('klabs-workshop-builds',records);
    reconcileCommittedBuildStock(previousRecord,updatedRecord);
    return {source:'build',index:0,record:updatedRecord};
  }
  const record={...persistedQuote,createdAt:nowIso,savedAt:nowIso,updatedAt:nowIso};
  records.unshift(record);
  Store.set('klabs-workshop-builds',records);
  reconcileCommittedBuildStock(null,record);
  return {source:'build',index:0,record};
}
function componentStockReferenceKey(component){
  const primaryName=specificationValue(component&&component.description);
  const fallbackName=specificationValue(component&&component.category);
  const candidateName=primaryName||fallbackName;
  if(!candidateName)return '';
  const libraryRecord=findComponentLibraryRecordByName(candidateName);
  return normalizeNameKey((libraryRecord&&libraryRecord.name)||candidateName);
}
function componentCommittedStockQuantity(component){
  const parsed=Number(component&&component.quantity);
  return (Number.isFinite(parsed) && parsed>0)?parsed:1;
}
function buildCommittedStockUsageMap(record){
  const normalized=record&&typeof record==='object'?normalizeQuote(record):normalizeQuote({});
  const components=Array.isArray(normalized.components)?normalized.components:[];
  const usage=new Map();
  components.forEach((component)=>{
    if(!componentRowHasMeaningfulData(component))return;
    const key=componentStockReferenceKey(component);
    if(!key)return;
    const quantity=componentCommittedStockQuantity(component);
    usage.set(key,(usage.get(key)||0)+quantity);
  });
  return usage;
}
function reconcileCommittedBuildStock(previousRecord,nextRecord){
  if(!activeTrackComponentStock())return;
  const previousUsage=buildCommittedStockUsageMap(previousRecord);
  const nextUsage=buildCommittedStockUsageMap(nextRecord);
  const allKeys=new Set([...previousUsage.keys(),...nextUsage.keys()]);
  if(!allKeys.size)return;
  const records=componentLibraryRecords();
  let changed=false;
  allKeys.forEach((key)=>{
    const previousQty=numberOrZero(previousUsage.get(key));
    const nextQty=numberOrZero(nextUsage.get(key));
    const delta=nextQty-previousQty;
    if(!delta)return;
    const index=records.findIndex((record)=>normalizeNameKey(record&&record.name)===key);
    if(index<0)return;
    const currentStock=componentLibraryStockValue(records[index]);
    const baseline=currentStock===undefined?0:numberOrZero(currentStock);
    const updatedStock=baseline-delta;
    if(updatedStock===baseline)return;
    records[index]={...records[index],stockOnHand:updatedStock};
    changed=true;
  });
  if(changed){
    saveComponentLibraryRecords(records);
  }
}
function syncMissingComponentLibraryData(currentQuote){
  const sourceQuote=currentQuote&&typeof currentQuote==='object'?currentQuote:{};
  const rows=Array.isArray(sourceQuote.components)?sourceQuote.components:[];
  if(!rows.length)return;
  const mergedByName=new Map();
  rows.forEach((row)=>{
    if(!componentRowHasMeaningfulData(row))return;
    const name=specificationValue(row&&row.description)||specificationValue(row&&row.category);
    if(!name)return;
    const key=normalizeNameKey(name);
    if(!key)return;
    const baseline=mergedByName.get(key)||findComponentLibraryRecordByName(name)||{name};
    const merged=mergeAutoSyncedLibraryRecord(baseline,row,name);
    mergedByName.set(key,merged);
  });
  mergedByName.forEach((record,key)=>{
    if(!record || !key)return;
    upsertComponentLibraryRecord(record.name,record);
  });
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
function componentLibraryStockValue(record){
  const source=record&&typeof record==='object'?record:{};
  if(source.stockOnHand===undefined || source.stockOnHand===null || source.stockOnHand==='')return undefined;
  const parsed=Number(source.stockOnHand);
  return Number.isFinite(parsed)?parsed:undefined;
}
function componentLibraryCategoryValue(record){
  const source=record&&typeof record==='object'?record:{};
  const name=String(source.name||'').trim();
  const category=String(source.category||'').trim();
  const categoryKey=normalizeNameKey(category);
  const componentTextKeys=[
    name,
    source.description,
    source.specifications,
    source.customerLabel,
  ].map(normalizeNameKey).filter(Boolean);
  return componentTextKeys.includes(categoryKey)?'':category;
}
function componentLibraryRecords(){
  const stored=Store.get(COMPONENT_LIBRARY_STORAGE_KEY,[]);
  if(!Array.isArray(stored))return[];
  return stored
    .filter((record)=>record&&typeof record==='object')
    .map((record)=>({
      name:String(record.name||'').trim(),
      category:componentLibraryCategoryValue(record),
      subcategory:String(record.subcategory||'').trim(),
      supplier:String(record.supplier||'').trim(),
      description:String(record.description||'').trim(),
      customerLabel:String(record.customerLabel||'').trim(),
      unit:String(record.unit||'').trim(),
      quantity:Number.isFinite(Number(record.quantity))?Number(record.quantity):undefined,
      unitCost:componentLibraryUnitCostValue(record),
      unitPrice:componentLibraryUnitPriceValue(record),
      stockOnHand:componentLibraryStockValue(record),
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
      category:componentLibraryCategoryValue(record),
      subcategory:String(record.subcategory||'').trim(),
      supplier:String(record.supplier||'').trim(),
      description:String(record.description||'').trim(),
      customerLabel:String(record.customerLabel||'').trim(),
      unit:String(record.unit||'').trim(),
      quantity:Number.isFinite(Number(record.quantity))?Number(record.quantity):undefined,
      unitCost:componentLibraryUnitCostValue(record),
      unitPrice:componentLibraryUnitPriceValue(record),
      stockOnHand:componentLibraryStockValue(record),
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
  // Business/admin charges (Freight, Repair, etc.) are not physical parts and must never enter the Components library.
  if(NON_COMPONENT_LINE_ITEM_NAMES.includes(normalizedKey))return;
  const item=sourceComponent&&typeof sourceComponent==='object'?sourceComponent:{};
  const rowCategory=String(item.category||'').trim();
  const categoryValue=rowCategory;
  const unitCost=componentLibraryUnitCostValue(item);
  const unitPrice=componentLibraryUnitPriceValue(item);
  const rowCost=componentLibraryCostValue(item);
  const resolvedCost=unitCost!==undefined?unitCost:rowCost;
  const nextRecord={
    name:normalizedName,
    category:categoryValue,
    subcategory:String(item.subcategory||'').trim(),
    supplier:String(item.supplier||'').trim(),
    description:String(item.description||'').trim(),
    customerLabel:String(item.customerLabel||'').trim(),
    unit:String(item.unit||'').trim(),
    quantity:Number.isFinite(Number(item.quantity))?Number(item.quantity):undefined,
    unitCost,
    unitPrice,
    stockOnHand:componentLibraryStockValue(item),
    notes:String(item.notes||'').trim(),
    specifications:String(item.specifications||'').trim(),
    cost:resolvedCost,
  };
  const records=componentLibraryRecords();
  const existingIndex=records.findIndex((record)=>normalizeNameKey(record.name)===normalizedKey);
  if(existingIndex>=0){
    if(nextRecord.stockOnHand===undefined){
      nextRecord.stockOnHand=componentLibraryStockValue(records[existingIndex]);
    }
    records[existingIndex]=nextRecord;
  }else{
    if(nextRecord.stockOnHand===undefined && activeTrackComponentStock()){
      nextRecord.stockOnHand=0;
    }
    records.unshift(nextRecord);
  }
  saveComponentLibraryRecords(records);
}
const STARTER_COMPONENTS_SEED_KEY='klabs-studio-starter-components-v1';
const STARTER_COMPONENTS_SUPPLIER_FIX_KEY='klabs-studio-starter-suppliers-v1';
const STARTER_COMPONENTS_SEED_SUPPLIERS=['K-Labs','Fuji','Alps','American Tackle','PacBay','SeaGuide','CTS','Mud Hole','Local Supplier','Unassigned'];
const STARTER_COMPONENTS_SEED_CATEGORIES=[
  {name:'Blanks',subcategory:'Spinning Blanks',products:['7\'0" Light Spin 4-8 kg','7\'0" Medium Spin 6-10 kg','7\'6" Medium Heavy Spin 8-12 kg','6\'6" Casting 6-10 kg','7\'6" Heavy Spin 10-15 kg']},
  {name:'Guides',subcategory:'Spinning Guide Sets',products:['Light Spin Guide Set','Medium Spin Guide Set','Heavy Spin Guide Set','Casting Guide Set','Micro Casting Guide Set']},
  {name:'Tip Tops',subcategory:'Tip Top Guides',products:['FAT 4.5 Tip Top 2.0 mm','FAT 5.5 Tip Top 2.4 mm','FAT 6.0 Tip Top 2.6 mm','Alconite Tip Top 3.0 mm','Heavy Duty Tip Top 3.5 mm']},
  {name:'Reel Seats',subcategory:'Threaded Reel Seats',products:['DPS 16','DPS 18','TVS 16','ACS 17','PTS 17']},
  {name:'Grips',subcategory:'EVA Grips',products:['EVA Straight 25 mm','EVA Tapered 28 mm','EVA Split Grip','Cork Full Grip','Carbon Split Grip']},
  {name:'Butt Caps',subcategory:'Rubber and Aluminium Caps',products:['Rubber Butt Cap 25 mm','Rubber Butt Cap 30 mm','Aluminium Butt Cap 25 mm','Composite Butt Cap 28 mm','Gimbal Butt Cap 30 mm']},
  {name:'Winding Checks',subcategory:'Grip Winding Checks',products:['EVA Winding Check 25 mm','EVA Winding Check 28 mm','Cork Winding Check 30 mm','Aluminium Winding Check 16 mm','Carbon Winding Check 18 mm']},
  {name:'Trim Rings',subcategory:'Decorative Rings',products:['Aluminium Trim Ring 16 mm','Aluminium Trim Ring 18 mm','Carbon Trim Ring 20 mm','Silver Trim Ring 25 mm','Black Trim Ring 28 mm']},
  {name:'Thread',subcategory:'Nylon',products:['NCP Nylon Thread A Black','NCP Nylon Thread A Red','Nylon Thread D Black','Nylon Thread D Blue','Nylon Thread D Metallic Gold']},
  {name:'Epoxy / Finish',subcategory:'Rod Finish',products:['High Build Rod Finish 4 oz','High Build Rod Finish 8 oz','Lite Build Rod Finish 4 oz','Thread Finish Gloss 2 oz','Matte Rod Finish 4 oz']},
  {name:'Arbors',subcategory:'Reel Seat Arbors',products:['Graphite Arbor 16 mm','Graphite Arbor 18 mm','Carbon Arbor 20 mm','Composite Arbor 22 mm','Spiral Arbor 25 mm']},
  {name:'Hook Keepers',subcategory:'Hook Keepers',products:['Wire Hook Keeper Small','Wire Hook Keeper Medium','Fold Down Hook Keeper','Titanium Hook Keeper','Thread-On Hook Keeper']},
  {name:'Decals / Labels',subcategory:'Rod Decals',products:['K-Labs Logo Decal Small','K-Labs Logo Decal Large','Blank Specification Label','Custom Build Label','Warning Label Set']},
  {name:'Ferrules',subcategory:'Ferrule Parts',products:['Spigot Ferrule Sleeve 8 mm','Spigot Ferrule Sleeve 10 mm','Overfit Ferrule 12 mm','Ferrule Alignment Ring 14 mm','Ferrule Reinforcement Wrap']},
  {name:'Gimbals',subcategory:'Fighting Gimbals',products:['Aluminium Gimbal 25 mm','Aluminium Gimbal 30 mm','Deluxe Gimbal 32 mm','Rubber Gimbal 25 mm','Stainless Gimbal 30 mm']},
  {name:'Fighting Butts',subcategory:'Fighting Butt Assemblies',products:['EVA Fighting Butt 30 mm','EVA Fighting Butt 35 mm','Rubber Fighting Butt 32 mm','Short Fighting Butt 28 mm','Heavy Fighting Butt 40 mm']},
  {name:'Shrink Tube',subcategory:'Grip Shrink Tube',products:['Shrink Tube 25 mm Black','Shrink Tube 30 mm Black','Shrink Tube 35 mm Black','Clear Shrink Tube 25 mm','Textured Shrink Tube 30 mm']},
  {name:'Carbon Tubes',subcategory:'Carbon Tube Parts',products:['Carbon Tube 16 mm x 500 mm','Carbon Tube 18 mm x 500 mm','Carbon Tube 20 mm x 500 mm','Carbon Tube 22 mm x 500 mm','Carbon Tube 25 mm x 500 mm']},
  {name:'Adhesives',subcategory:'Rod Building Adhesives',products:['Araldite Slow Cure 24 ml','Two Part Rod Bond 50 ml','Cork and EVA Glue 100 ml','Contact Adhesive 125 ml','5 Minute Epoxy 50 ml']},
  {name:'Miscellaneous',subcategory:'Workshop Accessories',products:['Rod Building Tape 25 mm','Mixing Cups 100 Pack','Disposable Brushes 10 Pack','Hook Keeper Tool','Guide Alignment Tool']},
];
function seedStarterComponentsLibrary(){
  if(Store.get(STARTER_COMPONENTS_SEED_KEY,false))return;
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const categoryMap=new Map(taxonomy.categories.map((item)=>[normalizeNameKey(item.name),item]));
  const supplierMap=new Map(taxonomy.suppliers.map((item)=>[normalizeNameKey(item.name),item]));
  STARTER_COMPONENTS_SEED_SUPPLIERS.forEach((name)=>{
    const key=normalizeNameKey(name);
    if(key && !supplierMap.has(key)){
      const supplier={id:studioTaxonomyId('sup'),name};
      taxonomy.suppliers.push(supplier);
      supplierMap.set(key,supplier);
    }
  });
  STARTER_COMPONENTS_SEED_CATEGORIES.forEach((definition,categoryIndex)=>{
    const categoryKey=normalizeNameKey(definition.name);
    let category=categoryMap.get(categoryKey);
    if(!category){
      category={id:studioTaxonomyId('cat'),name:definition.name,subcategories:[]};
      taxonomy.categories.push(category);
      categoryMap.set(categoryKey,category);
    }
    const subcategoryKey=normalizeNameKey(definition.subcategory);
    if(!category.subcategories.some((item)=>normalizeNameKey(item.name)===subcategoryKey)){
      category.subcategories.push({id:studioTaxonomyId('sub'),name:definition.subcategory});
    }
    definition.products.forEach((name,productIndex)=>{
      if(findComponentLibraryRecordByName(name))return;
      const supplier=STARTER_COMPONENTS_SEED_SUPPLIERS[(categoryIndex+productIndex)%STARTER_COMPONENTS_SEED_SUPPLIERS.length];
      const price=categoryIndex<2?18+(productIndex*7):6+(productIndex*3);
      upsertComponentLibraryRecord(name,{
        category:definition.name,
        subcategory:definition.subcategory,
        supplier,
        cost:price,
        unitPrice:Math.round(price*1.65*100)/100,
        stockOnHand:productIndex===4?6:12-productIndex,
        specifications:categoryIndex===1
          ?`Guide family: ${productIndex<3?'Alconite':'Fuji Concept'}; frame: ${productIndex%2?'black':'smoke'}; ring: ${productIndex%2?'Alconite':'ceramic'}; set sizes and quantities to be confirmed.`
          :`${definition.subcategory}; workshop starter specification for ${name}.`,
        notes:'Starter library record. Edit supplier, pricing, stock and specifications for your shop.',
      });
    });
  });
  studioComponentTaxonomyState=normalizeStudioComponentTaxonomy(taxonomy);
  saveStudioComponentTaxonomy();
  Store.set(STARTER_COMPONENTS_SEED_KEY,true);
}
function starterComponentSupplier(category,name){
  const categoryKey=normalizeNameKey(category);
  const productKey=normalizeNameKey(name);
  if(categoryKey==='blanks' || categoryKey==='ferrules')return 'CTS';
  if(categoryKey==='guides'){
    if(productKey.includes('casting'))return productKey.includes('micro')?'PacBay':'American Tackle';
    return 'Fuji';
  }
  if(categoryKey==='tip tops')return productKey.includes('heavy')?'SeaGuide':'Fuji';
  if(categoryKey==='reel seats'){
    if(productKey.startsWith('acs'))return 'American Tackle';
    if(productKey.startsWith('pts'))return 'PacBay';
    return 'Fuji';
  }
  if(categoryKey==='gimbals')return 'Alps';
  if(categoryKey==='grips')return productKey.includes('carbon')?'K-Labs':productKey.includes('cork')?'Local Supplier':'Mud Hole';
  if(['butt caps','winding checks','trim rings','fighting butts','carbon tubes'].includes(categoryKey))return 'K-Labs';
  if(['thread','epoxy / finish','arbors','decals / labels','shrink tube','adhesives'].includes(categoryKey))return 'Mud Hole';
  if(categoryKey==='hook keepers')return productKey.includes('titanium')?'Alps':'K-Labs';
  return 'Local Supplier';
}
function assignStarterComponentSuppliers(){
  if(Store.get(STARTER_COMPONENTS_SUPPLIER_FIX_KEY,false))return;
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const existingSupplierKeys=new Set(taxonomy.suppliers.map((supplier)=>normalizeNameKey(supplier.name)));
  const seededNames=new Map();
  STARTER_COMPONENTS_SEED_CATEGORIES.forEach((definition)=>definition.products.forEach((name)=>seededNames.set(normalizeNameKey(name),definition.name)));
  const records=componentLibraryRecords();
  let changed=false;
  records.forEach((record)=>{
    const category=seededNames.get(normalizeNameKey(record.name));
    if(!category || String(record.notes||'').trim()!=='Starter library record. Edit supplier, pricing, stock and specifications for your shop.')return;
    const supplier=starterComponentSupplier(category,record.name);
    if(!existingSupplierKeys.has(normalizeNameKey(supplier)))return;
    if(record.supplier===supplier)return;
    record.supplier=supplier;
    changed=true;
  });
  if(changed)saveComponentLibraryRecords(records);
  Store.set(STARTER_COMPONENTS_SUPPLIER_FIX_KEY,true);
}
const CATEGORY_ALIAS_MERGE_STORAGE_KEY='klabs-studio-category-alias-merge-v1';
function mergeDuplicateCategoryAliasesOnce(){
  if(Store.get(CATEGORY_ALIAS_MERGE_STORAGE_KEY,false))return;
  const taxonomy=ensureStudioComponentTaxonomyLoaded();
  const report=[];
  CATEGORY_NAME_ALIAS_GROUPS.forEach((variants)=>{
    const variantKeys=new Set(variants.map(normalizeNameKey));
    const matches=taxonomy.categories.filter((item)=>variantKeys.has(normalizeNameKey(item.name)));
    if(matches.length<2)return;
    // Prefer the variant with real components already assigned; ties break on subcategory count then longer (more descriptive) name.
    const scored=matches.map((item)=>({
      item,
      usage:studioCountCategoryUsage(item.name),
      subCount:Array.isArray(item.subcategories)?item.subcategories.length:0,
    })).sort((a,b)=>(b.usage-a.usage)||(b.subCount-a.subCount)||(b.item.name.length-a.item.name.length));
    const survivor=scored[0].item;
    scored.slice(1).forEach((entry)=>{
      const loser=entry.item;
      const movedCount=studioCountCategoryUsage(loser.name);
      if(movedCount>0)studioRenameCategory(loser.name,survivor.name);
      (loser.subcategories||[]).forEach((sub)=>{
        if(!survivor.subcategories.some((existing)=>normalizeNameKey(existing.name)===normalizeNameKey(sub.name))){
          survivor.subcategories.push(sub);
        }
      });
      taxonomy.categories=taxonomy.categories.filter((row)=>row.id!==loser.id);
      report.push(`Merged category "${loser.name}" into "${survivor.name}" (${movedCount} component(s) preserved).`);
    });
  });
  if(report.length){
    studioComponentTaxonomyState=taxonomy;
    saveStudioComponentTaxonomy();
    console.info('[K-Labs Studio] Category duplicate cleanup:',report.join(' '));
  }
  Store.set(CATEGORY_ALIAS_MERGE_STORAGE_KEY,true);
}
const PLACEHOLDER_COMPONENT_CLEANUP_STORAGE_KEY='klabs-studio-placeholder-cleanup-v1';
// Category-name-shaped component records created by an earlier bug where picking a brand new Build Cost
// category/line-item name also created a matching "component" record using that same name.
const SEEDED_PLACEHOLDER_COMPONENT_NAMES=['reel seats','hook keepers','miscellaneous'];
function componentRecordLooksLikePlaceholder(record){
  if(!record)return false;
  const hasCost=numberOrZero(record.cost)>0;
  const hasUnitPrice=numberOrZero(record.unitPrice)>0;
  const hasStock=record.stockOnHand!==undefined && numberOrZero(record.stockOnHand)>0;
  const hasSpecs=!!String(record.specifications||'').trim();
  const hasNotes=!!String(record.notes||'').trim();
  const hasSupplier=!!String(record.supplier||'').trim();
  const hasSubcategory=!!String(record.subcategory||'').trim();
  return !hasCost && !hasUnitPrice && !hasStock && !hasSpecs && !hasNotes && !hasSupplier && !hasSubcategory;
}
function cleanupPlaceholderComponentRecordsOnce(){
  if(Store.get(PLACEHOLDER_COMPONENT_CLEANUP_STORAGE_KEY,false))return;
  const records=componentLibraryRecords();
  const removed=[];
  const kept=[];
  const next=records.filter((record)=>{
    const nameKey=normalizeNameKey(record.name);
    const isCategoryNamePlaceholder=SEEDED_PLACEHOLDER_COMPONENT_NAMES.includes(nameKey) && nameKey===normalizeNameKey(record.category);
    const isBusinessChargeName=NON_COMPONENT_LINE_ITEM_NAMES.includes(nameKey);
    if(!isCategoryNamePlaceholder && !isBusinessChargeName)return true;
    if(!componentRecordLooksLikePlaceholder(record)){
      kept.push(record.name);
      return true;
    }
    removed.push(record.name);
    return false;
  });
  if(removed.length){
    saveComponentLibraryRecords(next);
    console.info('[K-Labs Studio] Removed seeded placeholder/business-charge component records:',removed.join(', '));
  }
  if(kept.length){
    console.info('[K-Labs Studio] Kept components matching placeholder names because they contain real data:',kept.join(', '));
  }
  Store.set(PLACEHOLDER_COMPONENT_CLEANUP_STORAGE_KEY,true);
}
function componentLibraryTextFieldValue(value){
  return String(value||'').trim();
}
function mergeAutoSyncedLibraryRecord(existingRecord,incomingRecord,componentName){
  const existing=existingRecord&&typeof existingRecord==='object'?existingRecord:{};
  const incoming=incomingRecord&&typeof incomingRecord==='object'?incomingRecord:{};
  const name=componentLibraryTextFieldValue(componentName)||componentLibraryTextFieldValue(existing.name)||componentLibraryTextFieldValue(incoming.name);
  const pickText=(currentValue,nextValue)=>{
    const current=componentLibraryTextFieldValue(currentValue);
    if(current)return current;
    return componentLibraryTextFieldValue(nextValue);
  };
  const existingUnitCost=componentLibraryUnitCostValue(existing);
  const existingUnitPrice=componentLibraryUnitPriceValue(existing);
  const existingCost=componentLibraryCostValue(existing);
  const existingStock=componentLibraryStockValue(existing);
  const incomingUnitCost=componentLibraryUnitCostValue(incoming);
  const incomingUnitPrice=componentLibraryUnitPriceValue(incoming);
  const incomingCost=componentLibraryCostValue(incoming);
  const incomingStock=componentLibraryStockValue(incoming);
  return {
    name,
    category:pickText(existing.category,incoming.category),
    subcategory:pickText(existing.subcategory,incoming.subcategory),
    supplier:pickText(existing.supplier,incoming.supplier),
    description:pickText(existing.description,incoming.description),
    customerLabel:pickText(existing.customerLabel,incoming.customerLabel),
    unit:pickText(existing.unit,incoming.unit),
    // Quantity is generally build-scoped; keep the saved library quantity unless explicitly set there.
    quantity:Number.isFinite(Number(existing.quantity))?Number(existing.quantity):undefined,
    unitCost:existingUnitCost!==undefined?existingUnitCost:incomingUnitCost,
    unitPrice:existingUnitPrice!==undefined?existingUnitPrice:incomingUnitPrice,
    stockOnHand:existingStock!==undefined?existingStock:incomingStock,
    notes:pickText(existing.notes,incoming.notes),
    specifications:pickText(existing.specifications,incoming.specifications),
    cost:existingCost!==undefined?existingCost:(incomingUnitCost!==undefined?incomingUnitCost:incomingCost),
  };
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
  if(specificationValue(record.subcategory))row.subcategory=record.subcategory;
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
  const subcategoryInput=document.querySelector(`#quoteComponentsList [data-component-key="subcategory"][data-component-index="${index}"]`);
  if(subcategoryInput && document.activeElement!==subcategoryInput){
    subcategoryInput.value=String(row.subcategory||'');
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
  return{category:'',subcategory:'',description:'',customerLabel:'',supplier:'',cost:0};
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
  const subcategory=specificationValue(item&&item.subcategory);
  const description=specificationValue(item&&item.description);
  if(category && description && normalizeNameKey(category)!==normalizeNameKey(description)){
    parts.push(category);
  }
  if(subcategory){
    parts.push(subcategory);
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
  return `<div class="quote-component-row__editor"><p class="quote-component-row__scope">Edit This Build Only. Use Update Library Component to save for future builds.</p><div class="quote-component-row__fields"><label class="quote-component-field quote-component-field--category"><span>Category</span><button class="quote-component-picker__trigger" data-component-action="open-component-sheet" data-component-index="${index}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.category||'Select category')}</span><b>▾</b></button></label><label class="quote-component-field quote-component-field--description"><span>Subcategory</span><input data-component-index="${index}" data-component-key="subcategory" type="text" placeholder="e.g. EVA Grips" value="${escapeHtml(item.subcategory||'')}" /></label><label class="quote-component-field quote-component-field--supplier"><span>Supplier</span><button class="quote-component-picker__trigger" data-component-action="open-supplier-sheet" data-component-index="${index}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.supplier||'Select supplier')}</span><b>▾</b></button></label><label class="quote-component-field quote-component-field--description"><span>Component Details</span><input data-component-index="${index}" data-component-key="description" type="text" placeholder="Enter chosen component..." value="${escapeHtml(item.description||'')}" /></label><label class="quote-component-field quote-component-field--cost"><span>Unit Cost</span><input data-component-index="${index}" data-component-key="cost" type="number" min="0" step="0.01" value="${numberOrZero(item.cost)}" /></label><label class="quote-component-field quote-component-field--cost"><span>Unit Price</span><input data-component-index="${index}" data-component-key="unitPrice" type="number" min="0" step="0.01" value="${numberOrZero(item.unitPrice)}" /></label><label class="quote-component-field quote-component-field--description"><span>Specifications</span><input data-component-index="${index}" data-component-key="specifications" type="text" placeholder="Size, model, specs..." value="${escapeHtml(item.specifications||'')}" /></label><label class="quote-component-field quote-component-field--description"><span>Notes</span><input data-component-index="${index}" data-component-key="notes" type="text" placeholder="Library notes" value="${escapeHtml(item.notes||'')}" /></label></div><div class="quote-component-row__actions"><button class="ghost-action" data-component-action="update-library-component" data-component-index="${index}" type="button">Update Library Component</button><button class="ghost-action quote-component-row__delete" data-component-action="request-delete-row" data-component-index="${index}" type="button">Delete Component</button><button class="ghost-action" data-component-action="close-row" data-component-index="${index}" type="button">Done</button></div></div>`;
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
    flashWorkshopStatus('Select a component category first',{pending:true,duration:2000});
    return;
  }
  openConfirmDialog({
    title:'Update Library Component',
    message:'Update this library component for future builds? Existing saved builds will not change.',
    actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'update',label:'Update Library Component',kind:'primary'}]
  },(action)=>{
    if(action!=='update')return;
    upsertComponentLibraryRecord(libraryName,row);
    flashWorkshopStatus('Library component updated');
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
          <button class="quote-component-row__open" data-component-action="open-row" data-component-index="${i}" type="button" aria-expanded="${expandedComponentRowIndex===i?'true':'false'}" aria-label="${expandedComponentRowIndex===i?'Collapse':'Expand'} component details for ${escapeHtml(componentRowItemLabel(item))}">
            <span class="quote-component-row__summary-copy">
              <strong class="quote-component-row__summary-item">${escapeHtml(componentRowItemLabel(item))}</strong>
              ${componentRowSummaryMetaParts(item).length?`<span class="quote-component-row__summary-meta">${componentRowSummaryMetaParts(item).map((part)=>`<span>${escapeHtml(part)}</span>`).join('')}</span>`:''}
            </span>
            <span class="quote-component-row__summary-trailing">
              ${componentRowCostLabel(item)?`<span class="quote-component-row__summary-cost">${escapeHtml(componentRowCostLabel(item))}</span>`:''}
              <span class="quote-component-row__disclosure" aria-hidden="true">›</span>
            </span>
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
  const inComponentSheet=!!target.closest('#choicePickerSheet,#confirmSheet,#blankEditorSheet');
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
function customerSurnameFromRecord(record){
  const source=record&&typeof record==='object'?record:{};
  // Only trust an explicit structured surname field; guessing the last word of a display name can misorder
  // business names, suffixes (Jr/Snr) and multi-part surnames, so unstructured names fall back to full-name sort.
  return specificationValue(source.surname)
    || specificationValue(source.lastName)
    || specificationValue(source.familyName)
    || specificationValue(source.customerLastName)
    || '';
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
      grouped.set(key,{key,name:customerName||'No customer name',entries:[],sortSurname:''});
    }
    const target=grouped.get(key);
    target.entries.push(entry);
    if(customerName && target.name==='No customer name')target.name=customerName;
    if(!target.sortSurname){
      target.sortSurname=customerSurnameFromRecord(record);
    }
  });
  const normalizedSearch=normalizeNameKey(searchValue);
  const groups=Array.from(grouped.values()).map((group)=>{
    const entries=[...group.entries].sort((left,right)=>{
      const leftDate=Date.parse(left.record&&left.record.savedAt||'')||0;
      const rightDate=Date.parse(right.record&&right.record.savedAt||'')||0;
      return rightDate-leftDate;
    });
    const sortSurname=group.sortSurname||customerSurnameFromRecord(entries[0]&&entries[0].record);
    return {
      ...group,
      entries,
      quotes:entries.filter((entry)=>entry.source==='quote'),
      builds:entries.filter((entry)=>entry.source==='build'),
      latestSavedAt:entries[0]&&entries[0].record?entries[0].record.savedAt:'',
      // Reliable structured surname sorts first; otherwise sort by the full display name rather than a guess.
      sortKey:normalizeNameKey(sortSurname||group.name),
    };
  }).filter((group)=>{
    if(!normalizedSearch)return true;
    return normalizeNameKey(group.name).includes(normalizedSearch);
  });
  return groups.sort((left,right)=>{
    const keyCompare=String(left.sortKey||'').localeCompare(String(right.sortKey||''),undefined,{sensitivity:'base'});
    if(keyCompare!==0)return keyCompare;
    return String(left.name||'').localeCompare(String(right.name||''),undefined,{sensitivity:'base'});
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
    return 'Search customer name and open their build history.';
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
    country:String(($('customerFinderNewCountry')&&$('customerFinderNewCountry').value)||'').trim(),
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
  ['customerFinderNewCustomerName','customerFinderNewPhone','customerFinderNewEmail','customerFinderNewAddress1','customerFinderNewAddress2','customerFinderNewSuburb','customerFinderNewCity','customerFinderNewRegion','customerFinderNewPostcode','customerFinderNewCountry'].forEach((id)=>{
    const input=$(id);
    if(input)input.value='';
  });
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
  const rootView=$('customerFinderRootView');
  const browseHead=$('customerFinderBrowseHead');
  const browseAddBtn=$('customerFinderBrowseAddBtn');
  const form=$('customerFinderNewForm');
  const backs=searchBlock?Array.from(searchBlock.querySelectorAll('[data-customer-finder-action="back-to-actions"]')):[];
  const back=backs.length?backs[0]:null;
  if(customerFinderIntent==='new-build'){
    if(startActions)startActions.hidden=customerFinderNewBuildStep!=='actions';
    if(searchBlock)searchBlock.hidden=customerFinderNewBuildStep!=='search';
    if(rootView)rootView.hidden=false;
    if(browseHead)browseHead.hidden=true;
    if(browseAddBtn)browseAddBtn.hidden=true;
    if(form)form.hidden=customerFinderNewBuildStep!=='add';
    if(back)back.hidden=customerFinderNewBuildStep==='actions';
    return;
  }
  if(startActions)startActions.hidden=true;
  if(searchBlock)searchBlock.hidden=false;
  if(rootView)rootView.hidden=customerFinderBrowseView==='detail';
  if(browseHead)browseHead.hidden=false;
  if(browseAddBtn)browseAddBtn.hidden=false;
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
    flashWorkshopStatus('Customer linked');
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
    flashWorkshopStatus('Customer linked');
  });
}
function customerFinderPrimaryRecord(group){
  const selected=(group && Array.isArray(group.entries))?group.entries:[];
  if(!selected.length)return {};
  const sorted=[...selected].sort((left,right)=>{
    const leftDate=Date.parse(left&&left.record&&left.record.savedAt||'')||0;
    const rightDate=Date.parse(right&&right.record&&right.record.savedAt||'')||0;
    return rightDate-leftDate;
  });
  return sorted[0]&&sorted[0].record?sorted[0].record:{};
}
function closeCustomerFinderBuildRowMenu(){
  customerFinderBuildRowMenu='';
}
function customerFinderBuildRowMenuKey(source,index){
  return `${String(source||'build')}::${Number(index)}`;
}
function isCustomerFinderBuildRowMenuOpen(source,index){
  return customerFinderBuildRowMenu===customerFinderBuildRowMenuKey(source,index);
}
function toggleCustomerFinderBuildRowMenu(source,index){
  const key=customerFinderBuildRowMenuKey(source,index);
  customerFinderBuildRowMenu=customerFinderBuildRowMenu===key?'':key;
}
function closeCustomerFinderCustomerMenu(){
  customerFinderCustomerMenuOpen=false;
}
function toggleCustomerFinderCustomerMenu(){
  customerFinderCustomerMenuOpen=!customerFinderCustomerMenuOpen;
}
function customerFinderBuildRowMenuMarkup(entry){
  const lifecycle=buildLifecycleStatusKey(entry&&entry.record);
  const toggleLabel=lifecycle==='complete'?'Mark Active':'Mark Complete';
  const toggleAction=lifecycle==='complete'?'mark-active':'mark-complete';
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  return `<div class="saved-build-card__menu customer-finder__inline-menu" role="menu" aria-label="Build actions"><button class="saved-build-card__menu-item" type="button" role="menuitem" data-customer-build-action="${toggleAction}" data-customer-open-source="${source}" data-customer-open-index="${index}">${toggleLabel}</button><button class="saved-build-card__menu-item" type="button" role="menuitem" data-customer-build-action="rename" data-customer-open-source="${source}" data-customer-open-index="${index}">Rename Build</button><button class="saved-build-card__menu-item saved-build-card__menu-item--danger" type="button" role="menuitem" data-customer-build-action="delete" data-customer-open-source="${source}" data-customer-open-index="${index}">Delete Build</button></div>`;
}
function customerFinderWorkRowMarkup(entry){
  const record=entry&&entry.record?entry.record:{};
  const title=specificationValue(record.buildName)||'Untitled Job';
  const lifecycle=buildLifecycleStatusKey(record);
  const statusLabel=lifecycle==='complete'?'COMPLETE':'ACTIVE';
  const editedAtIso=record.updatedAt||record.savedAt||'';
  const editedAtText=editedAtIso?formatDateDisplay(editedAtIso,{includeTime:true}):'Unknown date';
  const completedAtIso=record.completedAt||record.updatedAt||record.savedAt||'';
  const completedAtText=completedAtIso?formatDateDisplay(completedAtIso,{includeTime:true}):'Unknown date';
  const timelineText=lifecycle==='complete'?`Completed ${completedAtText}`:`Edited ${editedAtText}`;
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  const menuOpen=isCustomerFinderBuildRowMenuOpen(entry.source,index);
  return `<div class="customer-finder__work-row" data-customer-open-source="${source}" data-customer-open-index="${index}" role="button" tabindex="0" aria-label="Open build ${escapeHtml(title)}"><div class="customer-finder__work-copy"><strong>${escapeHtml(title)}</strong><small>${statusLabel}</small><small>${escapeHtml(timelineText)}</small></div><div class="customer-finder__work-actions"><button class="ghost-action customer-finder__work-more" type="button" data-customer-row-action="toggle-menu" data-customer-open-source="${source}" data-customer-open-index="${index}" aria-haspopup="menu" aria-expanded="${menuOpen?'true':'false'}" aria-label="Build actions">&hellip;</button>${menuOpen?customerFinderBuildRowMenuMarkup(entry):''}</div></div>`;
}
function setCustomerRenameValidation(message){
  const error=$('customerRenameNameError');
  if(!error)return;
  const text=String(message||'').trim();
  error.hidden=!text;
  error.textContent=text;
}
function closeCustomerRenameSheet(){
  const sheet=$('customerRenameSheet');
  if(!sheet)return;
  sheet.hidden=true;
  setCustomerRenameValidation('');
  activeCustomerRenameContext={key:'',existingName:''};
  unlockModalLayer({restoreFocus:true});
}
function applyCustomerRename(customerKey,nextName){
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
  flashWorkshopStatus('Customer renamed');
}
function submitCustomerRename(){
  const input=$('customerRenameName');
  if(!input)return;
  const nextName=String(input.value||'').trim();
  if(!nextName){
    setCustomerRenameValidation('Enter a customer name to continue.');
    try{input.focus({preventScroll:true});}catch{input.focus();}
    return;
  }
  const existing=String(activeCustomerRenameContext.existingName||'').trim();
  if(normalizeNameKey(nextName)===normalizeNameKey(existing)){
    closeCustomerRenameSheet();
    return;
  }
  const key=String(activeCustomerRenameContext.key||'');
  closeCustomerRenameSheet();
  applyCustomerRename(key,nextName);
}
function openCustomerRenameSheet(customerKey,currentName){
  ensureCustomerRenameSheet();
  const sheet=$('customerRenameSheet');
  const input=$('customerRenameName');
  if(!sheet || !input)return;
  const existing=currentName==='No customer name'?'':String(currentName||'').trim();
  activeCustomerRenameContext={key:String(customerKey||''),existingName:existing};
  setCustomerRenameValidation('');
  input.value=existing;
  sheet.hidden=false;
  lockModalLayer(document.activeElement);
  try{input.focus({preventScroll:true});}catch{input.focus();}
  if(typeof input.select==='function')input.select();
}
function ensureCustomerRenameSheet(){
  if($('customerRenameSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='customerRenameSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-customer-rename-action="close"></div>
    <section class="component-sheet__panel" role="dialog" aria-modal="true" aria-label="Rename Customer">
      <header class="component-sheet__header">
        <h2>Rename Customer</h2>
        <button class="component-sheet__close" type="button" data-customer-rename-action="close" aria-label="Close rename customer">×</button>
      </header>
      <div class="component-sheet__body">
        <label><span>Customer Name</span><input id="customerRenameName" type="text" placeholder="Customer name" autocomplete="name" /></label>
        <p id="customerRenameNameError" class="customer-finder__field-error" aria-live="polite" hidden></p>
        <div class="quote-preview-actions">
          <button class="ghost-action" type="button" data-customer-rename-action="close">Cancel</button>
          <button class="primary-action" type="button" data-customer-rename-action="save">Save</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);
  sheet.addEventListener('click',(event)=>{
    const actionEl=event.target.closest('[data-customer-rename-action]');
    if(!actionEl)return;
    const action=actionEl.getAttribute('data-customer-rename-action')||'';
    if(action==='save'){
      submitCustomerRename();
      return;
    }
    closeCustomerRenameSheet();
  });
  const input=sheet.querySelector('#customerRenameName');
  if(input){
    input.addEventListener('input',()=>{
      if(specificationValue(input.value))setCustomerRenameValidation('');
    });
    input.addEventListener('keydown',(event)=>{
      if(event.key==='Enter'){
        event.preventDefault();
        submitCustomerRename();
      }
    });
  }
}
function requestRenameCustomer(customerKey,currentName){
  openCustomerRenameSheet(customerKey,currentName);
}
function requestDeleteCustomerGroup(customerKey,customerName){
  const group=customerSavedGroups('').find((entry)=>entry.key===customerKey);
  const refs=group?(group.quotes.length+group.builds.length):0;
  if(refs>0){
    openConfirmDialog({
      title:'Delete Customer',
      message:`This customer has ${refs} build${refs===1?'':'s'}. Delete those records first.`,
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
  const rootView=$('customerFinderRootView');
  if(!resultHost || !detailHost)return;
  const groups=customerSavedGroups(customerFinderSearch);
  if(!groups.length){
    customerFinderSelectedKey='';
    customerFinderBrowseView='list';
    resultHost.innerHTML='<div class="component-sheet__empty">No customers matched that name.</div>';
    detailHost.hidden=true;
    detailHost.innerHTML='';
    if(rootView)rootView.hidden=false;
    return;
  }
  const hasSelected=groups.some((group)=>group.key===customerFinderSelectedKey);
  if(!hasSelected){
    customerFinderSelectedKey=groups[0].key;
  }
  resultHost.innerHTML=groups.map((group)=>{
    const active=group.key===customerFinderSelectedKey;
    const totalJobs=group.quotes.length+group.builds.length;
    const summary=`${totalJobs} build${totalJobs===1?'':'s'}`;
    return `<div class="component-sheet__row customer-finder__customer-row"><button class="component-sheet__option customer-finder__customer-select${active?' is-active-customer':''}" type="button" data-customer-key="${escapeHtml(group.key)}"><span class="customer-finder__customer-name">${escapeHtml(group.name)}</span><small class="customer-finder__customer-meta">${escapeHtml(summary)}</small></button></div>`;
  }).join('');
  if(customerFinderIntent==='new-build'){
    detailHost.hidden=true;
    detailHost.innerHTML='';
    if(rootView)rootView.hidden=false;
    return;
  }
  if(customerFinderBrowseView!=='detail'){
    detailHost.hidden=true;
    detailHost.innerHTML='';
    if(rootView)rootView.hidden=false;
    return;
  }
  const selected=groups.find((group)=>group.key===customerFinderSelectedKey)||groups[0];
  if(!selected){
    detailHost.hidden=true;
    detailHost.innerHTML='';
    if(rootView)rootView.hidden=false;
    return;
  }
  const customerRecord=customerFinderPrimaryRecord(selected);
  const phone=specificationValue(customerRecord.phone);
  const email=specificationValue(customerRecord.email);
  const notes=specificationValue(customerRecord.notes);
  const company=specificationValue(customerRecord.company||customerRecord.companyName||customerRecord.businessName);
  const facts=[
    company?`<small>Company: ${escapeHtml(company)}</small>`:'',
    phone?`<small>Phone: ${escapeHtml(phone)}</small>`:'',
    email?`<small>Email: ${escapeHtml(email)}</small>`:'',
    notes?`<small>Notes: ${escapeHtml(notes)}</small>`:''
  ].filter(Boolean).join('');
  const jobRows=selected.entries.length?selected.entries.map(customerFinderWorkRowMarkup).join(''):'<div class="component-sheet__empty">No builds found for this customer.</div>';
  const customerMenu=customerFinderCustomerMenuOpen?`<div class="saved-build-card__menu customer-finder__inline-menu" role="menu" aria-label="Customer actions"><button class="saved-build-card__menu-item" type="button" role="menuitem" data-customer-detail-action="rename" data-customer-key="${escapeHtml(selected.key)}" data-customer-name="${escapeHtml(selected.name)}">Rename Customer</button><button class="saved-build-card__menu-item saved-build-card__menu-item--danger" type="button" role="menuitem" data-customer-detail-action="delete" data-customer-key="${escapeHtml(selected.key)}" data-customer-name="${escapeHtml(selected.name)}">Delete Customer</button></div>`:'';
  detailHost.hidden=false;
  detailHost.innerHTML=`
    <header class="customer-finder__detail-head">
      <div class="customer-finder__detail-nav">
        <button class="workshop-tool-nav-back" type="button" data-customer-finder-action="back-to-list" aria-label="Return to Customers">
          <span class="workshop-tool-nav-back__arrow" aria-hidden="true">&#x2039;</span>
          <span>Customers</span>
        </button>
        <div class="customer-finder__detail-menu-wrap">
          <button class="ghost-action customer-finder__detail-more" type="button" data-customer-detail-action="toggle-menu" data-customer-key="${escapeHtml(selected.key)}" data-customer-name="${escapeHtml(selected.name)}" aria-haspopup="menu" aria-expanded="${customerFinderCustomerMenuOpen?'true':'false'}" aria-label="Customer actions">&hellip;</button>
          ${customerMenu}
        </div>
      </div>
      <h3>${escapeHtml(selected.name)}</h3>
      ${facts?`<div class="customer-finder__detail-facts">${facts}</div>`:''}
    </header>
    <section class="customer-finder__work-section" aria-label="Build History">
      <h4>Build History</h4>
      <div class="customer-finder__work-list">${jobRows}</div>
    </section>
  `;
  if(rootView)rootView.hidden=true;
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
  customerFinderBrowseView='list';
  customerFinderBuildRowMenu='';
  customerFinderCustomerMenuOpen=false;
  unbindCustomerFinderViewportHandlers();
  unlockModalLayer({restoreFocus:true});
}
function openCustomerFinderSheet(intent){
  ensureCustomerFinderSheet();
  const sheet=$('customerFinderSheet');
  if(!sheet)return;
  customerFinderIntent=intent==='new-build'?'new-build':'browse';
  customerFinderNewBuildStep=customerFinderIntent==='new-build'?'actions':'search';
  customerFinderBrowseView='list';
  customerFinderBuildRowMenu='';
  customerFinderCustomerMenuOpen=false;
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
  if(customerFinderIntent==='new-build' && customerFinderNewBuildStep==='add'){
    const nameInput=$('customerFinderNewCustomerName');
    if(nameInput && !nameInput.hidden){
      try{nameInput.focus({preventScroll:true});}catch{nameInput.focus();}
    }
  }
  scheduleCustomerFinderViewportSync(40);
}
function dismissCustomerFinderKeyboardFocus(){
  const sheet=$('customerFinderSheet');
  if(!sheet)return;
  const activeEl=document.activeElement;
  if(activeEl && sheet.contains(activeEl) && typeof activeEl.blur==='function'){
    activeEl.blur();
  }
  const selection=window.getSelection?window.getSelection():null;
  if(selection && selection.rangeCount>0){
    selection.removeAllRanges();
  }
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
        <p id="customerFinderIntro" class="customer-finder__intro">Search customer name and open their build history.</p>
        <div id="customerFinderStartActions" class="customer-finder__start-actions" hidden>
          <button id="customerFinderSearchExistingAction" class="primary-action" type="button" data-customer-finder-action="search-existing">SEARCH EXISTING CUSTOMER</button>
          <button id="customerFinderAddNewAction" class="ghost-action" type="button" data-customer-finder-action="add-new">ADD NEW CUSTOMER</button>
        </div>
        <div id="customerFinderSearchBlock" hidden>
          <div id="customerFinderRootView" class="customer-finder__root-view">
            <div id="customerFinderBrowseHead" class="customer-finder__browse-head">
              <button class="workshop-tool-nav-back customer-finder__studio-back" type="button" data-customer-finder-action="back-to-studio" aria-label="Return to Studio">
                <span class="workshop-tool-nav-back__arrow" aria-hidden="true">&#x2039;</span>
                <span>Studio</span>
              </button>
              <h3>Customers</h3>
              <p>Find and manage customers.</p>
            </div>
            <div class="customer-finder__root-controls">
              <input id="customerFinderSearch" class="component-sheet__search" type="search" placeholder="Search" autocomplete="off" spellcheck="false" />
              <button id="customerFinderBrowseAddBtn" class="ghost-action" type="button" data-customer-finder-action="browse-add-customer">Add Customer</button>
            </div>
            <div id="customerFinderResults" class="component-sheet__list customer-finder__list" aria-label="Customer matches"></div>
          </div>
          <section id="customerFinderDetail" class="customer-finder__detail customer-finder__detail-pane" aria-live="polite" hidden></section>
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
          <label class="customer-finder__new-form-full"><span>Country</span><input id="customerFinderNewCountry" type="text" placeholder="Country" autocomplete="country-name" /></label>
          <div class="customer-finder__new-form-actions">
            <button class="ghost-action" type="button" data-customer-finder-action="back-to-actions">Back</button>
            <button class="primary-action" type="button" data-customer-finder-action="submit-new">Start Build</button>
          </div>
        </form>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);
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
      if(action==='back-to-studio'){
        closeCustomerFinderSheet();
        return;
      }
      if(action==='back-to-list'){
        customerFinderBrowseView='list';
        closeCustomerFinderBuildRowMenu();
        closeCustomerFinderCustomerMenu();
        renderCustomerFinder();
        return;
      }
      if(action==='browse-add-customer'){
        closeCustomerFinderSheet();
        openCustomerFinderSheet('new-build');
        setCustomerFinderNewBuildStep('add');
        return;
      }
      if(action==='submit-new'){
        handleCreateCustomerFromNewBuildForm();
        return;
      }
    }
    const customerDetailAction=event.target.closest('[data-customer-detail-action]');
    if(customerDetailAction){
      const action=customerDetailAction.getAttribute('data-customer-detail-action')||'';
      const customerKey=customerDetailAction.getAttribute('data-customer-key')||'';
      const customerName=customerDetailAction.getAttribute('data-customer-name')||'';
      if(action==='toggle-menu'){
        toggleCustomerFinderCustomerMenu();
        renderCustomerFinder();
        return;
      }
      closeCustomerFinderCustomerMenu();
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
      customerFinderBrowseView='detail';
      dismissCustomerFinderKeyboardFocus();
      closeCustomerFinderBuildRowMenu();
      closeCustomerFinderCustomerMenu();
      renderCustomerFinder();
      return;
    }
    const rowAction=event.target.closest('[data-customer-row-action]');
    if(rowAction){
      const action=rowAction.getAttribute('data-customer-row-action')||'';
      const source=rowAction.getAttribute('data-customer-open-source')||'quote';
      const index=Number(rowAction.getAttribute('data-customer-open-index'));
      if(action==='toggle-menu'){
        toggleCustomerFinderBuildRowMenu(source,index);
        renderCustomerFinder();
      }
      return;
    }
    const buildActionButton=event.target.closest('[data-customer-build-action]');
    if(buildActionButton){
      const action=buildActionButton.getAttribute('data-customer-build-action')||'';
      const source=buildActionButton.getAttribute('data-customer-open-source')||'quote';
      const index=Number(buildActionButton.getAttribute('data-customer-open-index'));
      if(action==='mark-complete'){
        if(saveBuildLifecycleStatusBySource(source,index,'complete')){
          closeCustomerFinderBuildRowMenu();
          renderCustomerFinder();
          renderBuilds();
          flashWorkshopStatus('Build marked complete');
        }
        return;
      }
      if(action==='mark-active'){
        if(saveBuildLifecycleStatusBySource(source,index,'active')){
          closeCustomerFinderBuildRowMenu();
          renderCustomerFinder();
          renderBuilds();
          flashWorkshopStatus('Build marked active');
        }
        return;
      }
      if(action==='rename'){
        closeCustomerFinderSheet();
        openSavedBuildRecord(source,index,{openAtTop:true});
        window.setTimeout(()=>{
          focusBuildNameField();
          flashWorkshopStatus('Rename build in Build Details section',{pending:true,duration:1900});
        },56);
        return;
      }
      if(action==='delete'){
        closeCustomerFinderBuildRowMenu();
        requestDeleteSavedBuildRecord(source,index);
      }
      return;
    }
    const openRow=event.target.closest('.customer-finder__work-row[data-customer-open-source][data-customer-open-index]');
    if(openRow && !event.target.closest('[data-customer-row-action]') && !event.target.closest('[data-customer-build-action]')){
      const source=openRow.getAttribute('data-customer-open-source')||'quote';
      const index=Number(openRow.getAttribute('data-customer-open-index'));
      closeCustomerFinderSheet();
      openSavedBuildRecord(source,index,{openAtTop:true});
      return;
    }
    if(customerFinderBuildRowMenu || customerFinderCustomerMenuOpen){
      closeCustomerFinderBuildRowMenu();
      closeCustomerFinderCustomerMenu();
      renderCustomerFinder();
    }
  });
  sheet.addEventListener('keydown',(event)=>{
    if(event.key!=='Enter' && event.key!==' ')return;
    const openRow=event.target.closest('.customer-finder__work-row[data-customer-open-source][data-customer-open-index]');
    if(!openRow || event.target.closest('[data-customer-row-action]') || event.target.closest('[data-customer-build-action]'))return;
    event.preventDefault();
    const source=openRow.getAttribute('data-customer-open-source')||'quote';
    const index=Number(openRow.getAttribute('data-customer-open-index'));
    closeCustomerFinderSheet();
    openSavedBuildRecord(source,index,{openAtTop:true});
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
    if(event.key!=='Escape')return;
    if($('customerRenameSheet') && !$('customerRenameSheet').hidden){
      closeCustomerRenameSheet();
      return;
    }
    if($('customerFinderSheet') && !$('customerFinderSheet').hidden){
      closeCustomerFinderSheet();
    }
  });
}
function savedBuildSearchText(entry){
  const record=entry&&entry.record?entry.record:{};
  return [
    record.customerName,
    record.buildName,
    record.buildNumber,
  ]
    .map((value)=>String(value||''))
    .join(' ')
    .toLowerCase();
}
function savedBuildSearchTerms(value){
  return String(value||'')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}
function savedBuildMatchesSearch(entry,terms){
  if(!Array.isArray(terms) || !terms.length)return true;
  const haystack=savedBuildSearchText(entry);
  return terms.every((term)=>haystack.includes(term));
}
function savedBuildDisplayCustomerName(record){
  return specificationValue(record&&record.customerName)||'Unassigned';
}
function buildLifecycleStatusKey(record){
  const rawStatus=specificationValue((record&&record.quoteStatus)||(record&&record.status));
  const normalized=normalizeQuoteStatus(rawStatus);
  return normalized==='complete'?'complete':'active';
}
function savedBuildDisplayStatus(record){
  return buildLifecycleStatusKey(record)==='complete'?'Complete':'Active';
}
function savedBuildDisplayDate(value){
  return formatDateDisplay(value,{includeTime:true});
}
function savedBuildMenuKey(source,index){
  return `${String(source||'build')}::${Number(index)}`;
}
function closeSavedBuildRowMenu(){
  activeBuildRowMenu='';
}
function toggleSavedBuildRowMenu(source,index){
  const key=savedBuildMenuKey(source,index);
  activeBuildRowMenu=activeBuildRowMenu===key?'':key;
}
function isSavedBuildRowMenuOpen(source,index){
  return activeBuildRowMenu===savedBuildMenuKey(source,index);
}
function savedBuildRowMenuMarkup(entry){
  const lifecycle=buildLifecycleStatusKey(entry.record);
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  const toggleLabel=lifecycle==='complete'?'Mark Active':'Mark Complete';
  const toggleAction=lifecycle==='complete'?'mark-active':'mark-complete';
  return `<div class="saved-build-card__menu" role="menu" aria-label="Build actions"><button class="saved-build-card__menu-item" type="button" role="menuitem" data-build-action="${toggleAction}" data-build-source="${source}" data-build-index="${index}">${toggleLabel}</button><button class="saved-build-card__menu-item saved-build-card__menu-item--danger" type="button" role="menuitem" data-build-action="delete" data-build-source="${source}" data-build-index="${index}">Delete</button></div>`;
}
function savedBuildRowMarkup(entry){
  const record=entry.record;
  const customerName=savedBuildDisplayCustomerName(record);
  const statusText=savedBuildDisplayStatus(record);
  const statusKey=buildLifecycleStatusKey(record);
  const statusClass=statusKey?` saved-build-card__status--${escapeHtml(statusKey)}`:'';
  const updatedAtText=savedBuildDisplayDate(record.updatedAt||record.savedAt);
  const estimatedCompletionDate=specificationValue(record.estimatedCompletionDate);
  const estimatedCompletionText=estimatedCompletionDate?formatDateDisplay(estimatedCompletionDate,{includeTime:false}):'';
  const buildName=specificationValue(record.buildName);
  const fallbackTitle=specificationValue(record.blankSeries)||specificationValue(record.blankMaker)||'Untitled Build';
  const buildNameMarkup=`<p class="saved-build-card__title">${escapeHtml(buildName||fallbackTitle)}</p>`;
  const statusMarkup=statusText?`<span class="saved-build-card__status${statusClass}">${escapeHtml(statusText)}</span>`:'';
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  const menuOpen=isSavedBuildRowMenuOpen(entry.source,index);
  return `<article class="saved-build-card" data-build-row data-build-source="${source}" data-build-index="${index}"><button class="saved-build-card__open" type="button" data-build-action="open" data-build-source="${source}" data-build-index="${index}" aria-label="Open active build for ${escapeHtml(customerName)}"><div class="saved-build-card__head"><strong>${escapeHtml(customerName)}</strong>${buildNameMarkup}</div><div class="saved-build-card__meta">${statusMarkup}<small>Edited ${escapeHtml(updatedAtText)}</small>${estimatedCompletionText?`<small>Est. ${escapeHtml(estimatedCompletionText)}</small>`:''}</div></button><div class="saved-build-card__actions"><button class="ghost-action saved-build-card__menu-toggle" data-build-action="toggle-menu" data-build-source="${source}" data-build-index="${index}" type="button" aria-haspopup="menu" aria-expanded="${menuOpen?'true':'false'}" aria-label="Build actions">&hellip;</button>${menuOpen?savedBuildRowMenuMarkup(entry):''}</div></article>`;
}
function isBuildEntryInStatusFilter(entry){
  return buildLifecycleStatusKey(entry&&entry.record)==='active';
}
function saveBuildLifecycleStatusBySource(source,index,nextLifecycle){
  const storageKey=source==='build'?'klabs-workshop-builds':'klabs-workshop-quotes';
  const records=Array.isArray(Store.get(storageKey,[]))?Store.get(storageKey,[]):[];
  const numericIndex=Number(index);
  if(!Number.isInteger(numericIndex) || numericIndex<0 || numericIndex>=records.length)return false;
  const target=records[numericIndex]&&typeof records[numericIndex]==='object'?records[numericIndex]:{};
  const nextStatus=nextLifecycle==='complete'?'complete':'active';
  const nowIso=new Date().toISOString();
  const nextRecord={
    ...target,
    quoteStatus:nextStatus,
    updatedAt:nowIso,
  };
  if(nextLifecycle==='complete'){
    nextRecord.completedAt=nowIso;
  }
  records[numericIndex]=nextRecord;
  Store.set(storageKey,records);
  return true;
}
function buildLifecycleLabel(lifecycle){
  return lifecycle==='complete'?'Complete':'Active';
}
function currentBuildLifecycleStatus(){
  return buildLifecycleStatusKey(quote);
}
function closeCurrentBuildActionsMenu(){
  currentBuildActionsMenuOpen=false;
  const menuButton=$('currentBuildActionsMenuBtn');
  const menu=$('currentBuildActionsMenu');
  if(menuButton){menuButton.setAttribute('aria-expanded','false');}
  if(menu){menu.hidden=true;}
}
function openCurrentBuildActionsMenu(){
  currentBuildActionsMenuOpen=true;
  const menuButton=$('currentBuildActionsMenuBtn');
  const menu=$('currentBuildActionsMenu');
  if(menuButton){menuButton.setAttribute('aria-expanded','true');}
  if(menu){menu.hidden=false;}
}
function toggleCurrentBuildActionsMenu(){
  if(currentBuildActionsMenuOpen){
    closeCurrentBuildActionsMenu();
  }else{
    openCurrentBuildActionsMenu();
  }
}
function updateWorkshopBuildActionsUi(){
  const lifecycle=currentBuildLifecycleStatus();
  const statusLabel=buildLifecycleLabel(lifecycle);
  const statusEl=$('workshopBuildLifecycleStatus');
  if(statusEl){
    statusEl.textContent=statusLabel;
    statusEl.classList.toggle('workshop-build-actions-status-value--complete',lifecycle==='complete');
    statusEl.classList.toggle('workshop-build-actions-status-value--active',lifecycle!=='complete');
  }
  const toggleButton=$('toggleCurrentBuildStatusBtn');
  if(toggleButton){
    toggleButton.textContent=lifecycle==='complete'?'Mark Active':'Mark Complete';
  }
  const menuToggle=$('currentBuildActionsToggleStatus');
  if(menuToggle){
    menuToggle.textContent=lifecycle==='complete'?'Mark Active':'Mark Complete';
  }
}
// Compact at-a-glance strip for an existing build: who/what it is, active/complete, and due date, without opening any section.
function updateWorkshopBuildOverview(){
  const titleEl=$('quoteBuilderTitle');
  const overviewEl=$('quoteBuilderOverview');
  const customerName=specificationValue(quote&&quote.customerName);
  const buildName=specificationValue(quote&&quote.buildName);
  const hasIdentity=!!(customerName||buildName);
  if(titleEl){
    titleEl.textContent=hasIdentity?(customerName&&buildName?`${customerName} — ${buildName}`:(customerName||buildName)):'Studio';
  }
  if(!overviewEl)return;
  overviewEl.hidden=!hasIdentity;
  if(!hasIdentity)return;
  const lifecycle=currentBuildLifecycleStatus();
  const statusEl=$('quoteBuilderOverviewStatus');
  if(statusEl){
    statusEl.textContent=buildLifecycleLabel(lifecycle).toUpperCase();
    statusEl.classList.toggle('saved-build-card__status--complete',lifecycle==='complete');
    statusEl.classList.toggle('saved-build-card__status--active',lifecycle!=='complete');
  }
  const dueEl=$('quoteBuilderOverviewDue');
  if(dueEl){
    const dueRaw=specificationValue(quote&&quote.estimatedCompletionDate);
    dueEl.textContent=dueRaw?`Due ${formatDateDisplay(dueRaw,{includeTime:false})}`:'No due date set';
  }
}
function ensureCurrentBuildReference(){
  const target=findCurrentSavedBuildTarget();
  if(target){
    setActiveSavedBuildRef('build',target.index,target.record);
    return {source:'build',index:target.index,record:normalizeQuote(target.record)};
  }
  if(!quoteHasMeaningfulDraft(quote)){
    flashWorkshopStatus('Add build details first',{pending:true,duration:1800});
    return null;
  }
  const savedRef=persistCurrentQuoteRecord();
  if(!savedRef)return null;
  markQuoteSaved();
  return savedRef;
}
function setCurrentBuildLifecycle(nextLifecycle){
  const target=ensureCurrentBuildReference();
  if(!target)return false;
  if(!saveBuildLifecycleStatusBySource(target.source,target.index,nextLifecycle))return false;
  const refreshed=getSavedEntryBySource(target.source,target.index);
  if(refreshed){
    quote=normalizeQuote(refreshed);
    saveQuoteCurrent();
    setActiveSavedBuildRef(target.source,target.index,refreshed);
  }
  markQuoteSaved();
  renderWorkshopQuote();
  renderBuilds();
  renderCustomerFinder();
  flashWorkshopStatus(nextLifecycle==='complete'?'Build marked complete':'Build marked active');
  return true;
}
function toggleCurrentBuildLifecycle(){
  const current=currentBuildLifecycleStatus();
  return setCurrentBuildLifecycle(current==='complete'?'active':'complete');
}
function focusBuildNameField(){
  const input=$('quoteBuildName');
  if(!input)return;
  setWorkshopSectionCollapsed('workshopBuildDetailsBody',false);
  try{input.focus({preventScroll:false});}catch{input.focus();}
  try{input.select();}catch{}
}
function handleCurrentBuildAction(action){
  if(action==='toggle-status'){
    toggleCurrentBuildLifecycle();
    closeCurrentBuildActionsMenu();
    return;
  }
  if(action==='rename'){
    closeCurrentBuildActionsMenu();
    focusBuildNameField();
    flashWorkshopStatus('Rename build in Build Details section',{pending:true,duration:1900});
    return;
  }
  if(action==='delete'){
    closeCurrentBuildActionsMenu();
    requestDeleteCurrentBuild();
  }
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
  closeSavedBuildRowMenu();
  openConfirmDialog({
    title:'Delete this build?',
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
  });
}
function getSavedEntryBySource(source,index){
  const storageKey=source==='build'?'klabs-workshop-builds':'klabs-workshop-quotes';
  const records=Array.isArray(Store.get(storageKey,[]))?Store.get(storageKey,[]):[];
  const numericIndex=Number(index);
  if(!Number.isInteger(numericIndex) || numericIndex<0 || numericIndex>=records.length)return null;
  return normalizeQuote(records[numericIndex]);
}
function positionWorkshopScreenAtTop(){
  const shell=$('studioWorkflowPanel')||$('workshopScreen');
  window.requestAnimationFrame(()=>{
    window.scrollTo(0,0);
    if(shell && typeof shell.scrollIntoView==='function'){
      shell.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'});
    }
    window.setTimeout(()=>{
      window.scrollTo(0,0);
    },44);
  });
}
function openSavedBuildRecord(source,index,options){
  const settings={openAtTop:false,...(options||{})};
  const selected=getSavedEntryBySource(source,index);
  if(!selected)return;
  clearQuoteAutosaveTimer();
  closeCurrentBuildActionsMenu();
  setActiveSavedBuildRef(source,index,selected);
  quote=normalizeQuote(selected);
  saveQuoteCurrent();
  markQuoteSaved();
  showStudioWorkflow();
  renderWorkshopQuote();
  collapseWorkshopSections();
  preserveWorkshopQuoteOnEntry=true;
  goScreen('workshopScreen');
  if(settings.openAtTop){
    // Land on the collapsed build overview rather than forcing the Customer Details form open.
    window.setTimeout(()=>{
      positionWorkshopScreenAtTop();
    },36);
    return;
  }
  window.setTimeout(()=>focusWorkshopSection(nextWorkshopSectionId()),36);
}
function renderBuilds(){
  const host=$('buildCards');
  if(!host)return;
  const query=String(buildsSearch||'').trim();
  const terms=savedBuildSearchTerms(query);
  const records=savedBuildRecords()
    .map((record,index)=>({source:'build',index,record:normalizeQuote(record)}))
    .sort((left,right)=>{
      const leftDate=Date.parse(left.record&&left.record.updatedAt||left.record&&left.record.savedAt||'')||0;
      const rightDate=Date.parse(right.record&&right.record.updatedAt||right.record&&right.record.savedAt||'')||0;
      return rightDate-leftDate;
    })
    .filter((entry)=>isBuildEntryInStatusFilter(entry))
    .filter((entry)=>savedBuildMatchesSearch(entry,terms));
  if(!records.length){
    closeSavedBuildRowMenu();
    if(query){
      host.innerHTML='<section class="saved-builds-empty"><h3>No builds found.</h3><p>Try another customer or build name.</p><div class="saved-builds-empty__actions"><button id="savedBuildsClearSearchBtn" class="ghost-action" type="button">Clear Search</button><button id="savedBuildsEmptyNewBuildBtn" class="primary-action" type="button">New Build</button></div></section>';
      const clearButton=$('savedBuildsClearSearchBtn');
      if(clearButton){
        clearButton.addEventListener('click',()=>{
          buildsSearch='';
          const input=$('buildsSearchInput');
          if(input){
            input.value='';
            try{input.focus({preventScroll:true});}catch{input.focus();}
          }
          renderBuilds();
        });
      }
    }else{
      host.innerHTML='<section class="saved-builds-empty"><h3>No active builds yet.</h3><p>Create a new build to start tracking workshop work.</p><button id="savedBuildsEmptyNewBuildBtn" class="primary-action" type="button">New Build</button></section>';
    }
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
function clampMeasurementValue(value,min,max){const parsed=Number(value);if(!Number.isFinite(parsed))return min;return Math.min(max,Math.max(min,parsed))}
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
function shouldAvoidWorkshopToolAutoFocus(){
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}
function focusWorkshopToolPrimaryInput(tool){
  const targetId=tool==='grip'
    ?'workshopGripDiameter'
    :tool==='spiral'
      ?'workshopSpiralGuideCountIncrement'
      :'workshopDcDiameter';
  const input=$(targetId);
  if(!input || input.disabled || input.hidden)return;
  if(shouldAvoidWorkshopToolAutoFocus()){
    window.requestAnimationFrame(()=>{
      if(document.activeElement===input){
        input.blur();
      }
      try{
        const end=String(input.value||'').length;
        if(typeof input.setSelectionRange==='function')input.setSelectionRange(end,end);
      }catch{}
      const selection=window.getSelection?window.getSelection():null;
      if(selection && selection.rangeCount>0){
        selection.removeAllRanges();
      }
    });
    return;
  }
  window.requestAnimationFrame(()=>{
    try{input.focus({preventScroll:true});}catch{input.focus();}
  });
}
function bindWorkshopToolEnterFlow(inputIds){
  const inputs=inputIds
    .map((id)=>$(id))
    .filter((el)=>el && !el.disabled);
  inputs.forEach((input,index)=>{
    if(input.getAttribute('data-workshop-enter-flow-bound')==='true')return;
    input.setAttribute('data-workshop-enter-flow-bound','true');
    input.addEventListener('keydown',(event)=>{
      if(event.key!=='Enter')return;
      event.preventDefault();
      for(let next=index+1;next<inputs.length;next+=1){
        const target=inputs[next];
        if(!target || target.disabled || target.hidden)continue;
        try{target.focus({preventScroll:true});}catch{target.focus();}
        if(typeof target.select==='function')target.select();
        return;
      }
      input.blur();
    });
  });
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
  const nextValue=field==='guideCount'
    ?clampValue(parsed,cfg.min,cfg.max)
    :clampMeasurementValue(parsed,cfg.min,cfg.max);
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
  syncSpiralWithGuideLayout();
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
  const returnLandingButton=document.querySelector('[data-workshop-return-landing]');
  if(returnLandingButton && returnLandingButton.getAttribute('data-workshop-return-bound')!=='true'){
    returnLandingButton.setAttribute('data-workshop-return-bound','true');
    returnLandingButton.addEventListener('click',()=>{
      goToWorkshopLandingScreen();
    });
  }

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
      const selected=guideSpacingCards.querySelector(`[data-guide-index="${index}"]`);
      if(selected && typeof selected.scrollIntoView==='function')selected.scrollIntoView({block:'nearest'});
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
      const selected=guideSpacingCards.querySelector(`[data-guide-index="${index}"]`);
      if(selected && typeof selected.scrollIntoView==='function')selected.scrollIntoView({block:'nearest'});
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
      const value=field==='guideCount'?String(stateValue):formatMeasurementNumber(stateValue,CORE_MEASUREMENT_FORMAT);
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
      const disallowed=/[^0-9.-]/;
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
        el.textContent=field==='guideCount'?String(stateValue):formatMeasurementNumber(stateValue,CORE_MEASUREMENT_FORMAT);
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
    ['quoteBuildName','buildName'],['quoteEstimatedCompletionDate','estimatedCompletionDate'],['quoteNotes','notes'],
    ['quoteBlankName','blankName'],['quoteBlankMaker','blankMaker'],['quoteBlankSeries','blankSeries'],['quoteBlankLength','blankLength'],['quoteBlankPower','blankPower'],['quoteBlankAction','blankAction'],['quoteBlankPieces','blankPieces'],
    ['quoteBlankCost','blankCost'],['quoteLabourRate','labourRate'],['quoteLabourHours','labourHours']
  ];
}
function measurementPlaceholderValue(valueMm){
  return formatMeasurementValue(valueMm,CORE_MEASUREMENT_FORMAT);
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
  const landingActions=$('studioLandingActions');
  if(landingActions && landingActions.getAttribute('data-studio-landing-bound')!=='true'){
    landingActions.setAttribute('data-studio-landing-bound','true');
    landingActions.addEventListener('click',(event)=>{
      const button=event.target.closest('[data-studio-action]');
      if(!button)return;
      const action=button.getAttribute('data-studio-action')||'';
      if(action==='new-build'){
        startNewBuildFlow();
        return;
      }
      if(action==='open-builds'){
        goScreen('buildsScreen');
        return;
      }
      if(action==='customers'){
        openCustomerFinderSheet('browse');
        return;
      }
      if(action==='components'){
        studioComponentDraft=null;
        showStudioComponents();
        goScreen('workshopScreen');
      }
    });
  }
  bindStudioComponentsPanel();
  bindStudioTaxonomyPanel();
  const newQuoteEntryBtn=$('newQuoteEntryBtn');
  if(newQuoteEntryBtn && newQuoteEntryBtn.getAttribute('data-new-quote-bound')!=='true'){
    newQuoteEntryBtn.setAttribute('data-new-quote-bound','true');
    newQuoteEntryBtn.addEventListener('click',()=>{
      openCustomerFinderSheet('new-build');
    });
  }
  const findCustomerEntryBtn=$('findCustomerEntryBtn');
  if(findCustomerEntryBtn && findCustomerEntryBtn.getAttribute('data-find-customer-bound')!=='true'){
    findCustomerEntryBtn.setAttribute('data-find-customer-bound','true');
    findCustomerEntryBtn.addEventListener('click',()=>{
      openCustomerFinderSheet('browse');
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
      flashWorkshopStatus('Component added',{
        pending:true,
        duration:1200,
      });
    });
  }
  const toggleStatusBtn=$('toggleCurrentBuildStatusBtn');
  if(toggleStatusBtn && toggleStatusBtn.getAttribute('data-build-status-bound')!=='true'){
    toggleStatusBtn.setAttribute('data-build-status-bound','true');
    toggleStatusBtn.addEventListener('click',()=>{
      toggleCurrentBuildLifecycle();
    });
  }
  const currentBuildActionsMenuBtn=$('currentBuildActionsMenuBtn');
  if(currentBuildActionsMenuBtn && currentBuildActionsMenuBtn.getAttribute('data-build-actions-bound')!=='true'){
    currentBuildActionsMenuBtn.setAttribute('data-build-actions-bound','true');
    currentBuildActionsMenuBtn.addEventListener('click',(event)=>{
      event.preventDefault();
      event.stopPropagation();
      toggleCurrentBuildActionsMenu();
    });
  }
  const currentBuildActionsMenu=$('currentBuildActionsMenu');
  if(currentBuildActionsMenu && currentBuildActionsMenu.getAttribute('data-build-actions-menu-bound')!=='true'){
    currentBuildActionsMenu.setAttribute('data-build-actions-menu-bound','true');
    currentBuildActionsMenu.addEventListener('click',(event)=>{
      const actionButton=event.target.closest('[data-current-build-action]');
      if(!actionButton)return;
      const action=actionButton.getAttribute('data-current-build-action')||'';
      handleCurrentBuildAction(action);
    });
  }
  if(document.body.getAttribute('data-current-build-menu-dismiss-bound')!=='true'){
    document.body.setAttribute('data-current-build-menu-dismiss-bound','true');
    document.addEventListener('click',(event)=>{
      if(!currentBuildActionsMenuOpen)return;
      if(event.target.closest('.workshop-build-actions-menu-wrap'))return;
      closeCurrentBuildActionsMenu();
    });
    document.addEventListener('keydown',(event)=>{
      if(event.key!=='Escape' || !currentBuildActionsMenuOpen)return;
      closeCurrentBuildActionsMenu();
    });
  }
  updateQuoteActionPriority();
  updateWorkshopBuildActionsUi();
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
  updateWorkshopBuildOverview();
  const customerSummaryTextEl=$('quoteCustomerSummaryText');
  if(customerSummaryTextEl){
    const customerName=specificationValue(quote.customerName);
    const locality=specificationValue(quote.cityTown)||specificationValue(quote.suburbLocality);
    const summary=customerName?(locality?`${customerName} • ${locality}`:customerName):'Add customer details';
    customerSummaryTextEl.innerHTML=`<span>${escapeHtml(summary)}</span>`;
  }
  const buildDetailsSummaryTextEl=$('quoteBuildDetailsSummaryText');
  if(buildDetailsSummaryTextEl){
    const buildName=specificationValue(quote.buildName);
    const dueRaw=specificationValue(quote.estimatedCompletionDate);
    const dueText=dueRaw?`Due ${formatDateDisplay(dueRaw,{includeTime:false})}`:'';
    const summary=buildName?(dueText?`${buildName} • ${dueText}`:buildName):(dueText||'Add build name and due date');
    buildDetailsSummaryTextEl.innerHTML=`<span>${escapeHtml(summary)}</span>`;
  }
  updateBuildPricingSummary();
  updateQuoteActionPriority();
  updateWorkshopBuildActionsUi();
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
  const gstField=$('quoteGstField');
  const gstStatus=$('quoteGstStatus');
  if(gstField){gstField.classList.toggle('quote-field--muted',quote.includeGst===false);}
  if(gstStatus){gstStatus.textContent='';}
  ['quoteCostBeforeMarginField','quoteMarkupPercentField','quoteProfitField'].forEach((id)=>{const el=$(id);if(el)el.hidden=false;});
  updateWorkshopSectionVisibility();
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
          <label><span id="blankEditorFgLabel">First Guide (mm)</span><input id="blankEditorFg" type="text" inputmode="decimal" /></label>
          <label><span>Guide Count</span><input id="blankEditorGc" type="number" min="5" max="20" step="1" /></label>
          <label class="blank-editor-grid__full"><span id="blankEditorTsLabel">Target Stripper (mm)</span><input id="blankEditorTs" type="text" inputmode="decimal" /></label>
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
  if($('blankEditorFg'))$('blankEditorFg').value=blankMeasurementInputText(blank.fg);
  if($('blankEditorFgLabel'))$('blankEditorFgLabel').textContent=`First Guide (${measurementUnitSuffix()})`;
  if($('blankEditorGc'))$('blankEditorGc').value=String(blank.gc);
  if($('blankEditorTs'))$('blankEditorTs').value=blankMeasurementInputText(blank.ts);
  if($('blankEditorTsLabel'))$('blankEditorTsLabel').textContent=`Target Stripper (${measurementUnitSuffix()})`;
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
    fg:parseBlankMeasurementInput($('blankEditorFg')&&$('blankEditorFg').value,105),
    gc:$('blankEditorGc')?$('blankEditorGc').value:9,
    ts:parseBlankMeasurementInput($('blankEditorTs')&&$('blankEditorTs').value,1260),
    archived:existing?existing.archived:false,
  });
  if(!blank.model){
    openInfoDialog('Blank Name Required','Enter a blank name before saving.');
    const field=$('blankEditorModel');
    if(field){
      try{field.focus({preventScroll:true});}catch{field.focus();}
    }
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
  flashWorkshopStatus(existing?'Blank updated':'Blank saved');
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
  save();saveQuoteCurrent();syncSpiralWithGuideLayout();render();goScreen('layoutScreen');
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
  syncSpiralWithGuideLayout();
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
      showStudioLanding();
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
    searchInput.addEventListener('keydown',(event)=>{
      if(event.key!=='Escape')return;
      if(!specificationValue(buildsSearch))return;
      event.preventDefault();
      buildsSearch='';
      searchInput.value='';
      renderBuilds();
    });
    searchInput.addEventListener('blur',()=>{
      const normalized=String(searchInput.value||'').trim().replace(/\s+/g,' ');
      if(normalized===String(buildsSearch||'').trim())return;
      searchInput.value=normalized;
      buildsSearch=normalized;
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
      const button=event.target.closest('[data-build-action]');
      if(!button)return;
      const action=button.getAttribute('data-build-action')||'';
      const source=button.getAttribute('data-build-source')||'quote';
      const index=Number(button.getAttribute('data-build-index'));
      if(action==='open'){openSavedBuildRecord(source,index);}
      if(action==='toggle-menu'){
        event.preventDefault();
        event.stopPropagation();
        toggleSavedBuildRowMenu(source,index);
        renderBuilds();
        return;
      }
      if(action==='mark-complete'){
        if(saveBuildLifecycleStatusBySource(source,index,'complete')){
          closeSavedBuildRowMenu();
          renderBuilds();
          renderCustomerFinder();
          flashWorkshopStatus('Build marked complete');
        }
        return;
      }
      if(action==='mark-active'){
        if(saveBuildLifecycleStatusBySource(source,index,'active')){
          closeSavedBuildRowMenu();
          renderBuilds();
          renderCustomerFinder();
          flashWorkshopStatus('Build marked active');
        }
        return;
      }
      if(action==='delete'){requestDeleteSavedBuildRecord(source,index);}
    });
  }
  if(document.body.getAttribute('data-build-menu-dismiss-bound')!=='true'){
    document.body.setAttribute('data-build-menu-dismiss-bound','true');
    document.addEventListener('click',(event)=>{
      if(!activeBuildRowMenu)return;
      if(event.target.closest('.saved-build-card__actions'))return;
      closeSavedBuildRowMenu();
      renderBuilds();
    });
    document.addEventListener('keydown',(event)=>{
      if(event.key!=='Escape' || !activeBuildRowMenu)return;
      closeSavedBuildRowMenu();
      renderBuilds();
    });
  }
}
function onScreenChange(screenId){
  if(screenId!=='workshopScreen'){
    closeCurrentBuildActionsMenu();
  }
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
    closeSavedBuildRowMenu();
    renderBuilds();
  }
  if(screenId==='workshopScreen'){
    closeCurrentBuildActionsMenu();
    renderStudioScreenMode();
    if(preserveWorkshopQuoteOnEntry){
      preserveWorkshopQuoteOnEntry=false;
      renderWorkshopQuote();
      focusWorkshopSection(nextWorkshopSectionId(),{scroll:false});
    }else{
      if(studioScreenView==='components'){
        renderStudioComponentsLibrary();
      }else if(studioScreenView==='taxonomy'){
        renderStudioTaxonomyManager();
      }else if(studioScreenView!=='workflow'){
        showStudioLanding();
      }
    }
    updateWorkshopBuildActionsUi();
  }
  if(screenId==='workshopLandingScreen'){
    renderWorkshopCalculator();
    const selector=workshopLandingReturnFocusTool==='grip'
      ?'[data-workshop-tool-open="grip"]'
      :workshopLandingReturnFocusTool==='spiral'
        ?'[data-workshop-tool-open="spiral"]'
      :workshopLandingReturnFocusTool==='guide-spacing'
        ?'[data-workshop-tool-open="guide-spacing"]'
        :'[data-workshop-tool-open="diameter"]';
    workshopLandingReturnFocusTool='';
    const target=$('workshopToolsList')&&$('workshopToolsList').querySelector(selector);
    if(target){
      window.setTimeout(()=>{
        try{target.focus({preventScroll:true});}catch{target.focus();}
      },0);
    }
  }
  if(screenId==='settingsScreen' && $('settingsTaxRate')){
    $('settingsTaxRate').value=String(activeTaxRate());
    if($('settingsTaxEnabled'))$('settingsTaxEnabled').checked=activeTaxEnabled();
    if($('settingsTrackComponentStock'))$('settingsTrackComponentStock').checked=activeTrackComponentStock();
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
  const trackStockInput=$('settingsTrackComponentStock');
  if(trackStockInput){
    trackStockInput.checked=activeTrackComponentStock();
    const onTrackStockChange=()=>{
      studioSettings.trackComponentStock=trackStockInput.checked;
      saveStudioSettings();
      if(studioScreenView==='components'){
        renderStudioComponentsLibrary();
      }
    };
    trackStockInput.addEventListener('input',onTrackStockChange);
    trackStockInput.addEventListener('change',onTrackStockChange);
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
      renderMeasurementPresentation();
      renderWorkshopQuote();
      renderBlanks();
      renderBuilds();
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
      renderMeasurementPresentation();
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
      renderCustomerFinder();
    });
  });
  syncSettingsPreferenceControls();
}
function render(options){
  const r=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  const nextWorkshopIndex=Math.max(0,Math.min(state.workshopIndex,Math.max(0,r.rows.length-1)));
  if(state.workshopIndex!==nextWorkshopIndex){
    state.workshopIndex=nextWorkshopIndex;
    save();
  }
  const appEl=$('app');
  if(appEl){appEl.classList.toggle('locked',!!state.locked);}
  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(field && controlMeta[field] && document.activeElement!==el){
      const value=state[controlMeta[field].key];
      el.textContent=field==='guideCount'?String(value):formatMeasurementNumber(value,CORE_MEASUREMENT_FORMAT);
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
      <article class="guide-spacing-row${i===state.workshopIndex?' guide-spacing-row--active':''}" data-guide-index="${i}" tabindex="0" role="button" aria-label="Guide ${row.g}. Position ${formatMeasurementValue(row.cum,CORE_MEASUREMENT_FORMAT)}. Spacing ${formatMeasurementValue(row.spacing,CORE_MEASUREMENT_FORMAT)}" aria-current="${i===state.workshopIndex?'true':'false'}">
        <div class="guide-spacing-row__meta">
          <span class="guide-spacing-row__guide-name">Guide ${row.g}</span>
        </div>
        <div class="guide-spacing-row__meta">
          <small>Position</small>
          <span class="guide-spacing-row__position-value">${formatMeasurementValue(row.cum,CORE_MEASUREMENT_FORMAT)}</span>
        </div>
        <div class="guide-spacing-row__spacing">
          <span class="guide-spacing-row__spacing-label">Spacing</span>
          <strong class="guide-spacing-row__spacing-value">${formatMeasurementValue(row.spacing,CORE_MEASUREMENT_FORMAT)}</strong>
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
  if(guideNotice){guideNotice.textContent='Tap a row to inspect spacing quickly. Guide only. Confirm final placement by static testing and builder judgement.';}
  if(window.StudioVisuals && typeof window.StudioVisuals.update==='function'){window.StudioVisuals.update(r,state);}
  const workshopScreen=$('workshopScreen');
  if(workshopScreen && workshopScreen.classList.contains('active')){
    renderStudioScreenMode();
    if(studioScreenView==='workflow'){
      renderWorkshopQuote();
    }else if(studioScreenView==='components'){
      renderStudioComponentsLibrary();
    }else if(studioScreenView==='taxonomy'){
      renderStudioTaxonomyManager();
    }
  }
  const workshopLandingScreen=$('workshopLandingScreen');
  if(workshopLandingScreen && workshopLandingScreen.classList.contains('active')){renderWorkshopCalculator();}
  if($('homeScreen') && $('homeScreen').classList.contains('active')){homeRodRefreshFromState();}
}
seedStarterComponentsLibrary();
assignStarterComponentSuppliers();
mergeDuplicateCategoryAliasesOnce();
cleanupPlaceholderComponentRecordsOnce();
loadChoicePickerFavourites();
bindLayoutControls();
bindWorkshopCalculatorControls();
bindWorkshopQuoteBuilder();
bindWorkshopBackToTopControl();
bindHomeActions();
bindBuildsControls();
bindBlankLibraryControls();
bindSettingsControls();
syncSpiralWithGuideLayout();
window.KLABS_MEASUREMENTS={formatValue:(valueMm)=>formatMeasurementValue(valueMm,CORE_MEASUREMENT_FORMAT)};
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks,renderBuilds,loadDemoBuild,startNewBuildFlow,onScreenChange,openCustomerFinder:(intent)=>{openCustomerFinderSheet(intent==='new-build'?'new-build':'browse');},prepareWorkshopEntry:(mode)=>{preserveWorkshopQuoteOnEntry=(mode==='preserve');},prepareWorkshopLanding:prepareWorkshopLandingEntry,prepareStudioLanding:prepareStudioLandingEntry};
