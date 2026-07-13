const $=id=>document.getElementById(id);
let state=Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0});
const DEFAULT_CATEGORY_NAMES=['Blank','Guides','Tip','Reel Seat','Grip','Butt Cap','Winding Checks','Thread','Decals','Other'];
const DEFAULT_SUPPLIER_NAMES=['Fuji','CTS','Alps','Batson','American Tackle','PacBay','K-Labs','AliExpress','Other'];
const CUSTOM_CATEGORY_STORAGE_KEY='klabs-workshop-custom-categories';
const CUSTOM_SUPPLIER_STORAGE_KEY='klabs-workshop-custom-suppliers';
const ARCHIVED_CATEGORY_STORAGE_KEY='klabs-workshop-archived-categories';
const ARCHIVED_SUPPLIER_STORAGE_KEY='klabs-workshop-archived-suppliers';
const BLANK_LIBRARY_STORAGE_KEY='klabs-blank-library';
const BLANK_LIBRARY_SEARCH_KEY='klabs-blank-library-search';
const QUOTE_STATUS_VALUES=['draft','sent','revised','declined','expired','accepted'];
const BUILD_SPEC_FIELDS=[
  {id:'quoteSpecReelSeatPosition',key:'reelSeatPosition',label:'Reel Seat Position',visibility:'customer'},
  {id:'quoteSpecRearGripLength',key:'rearGripLength',label:'Rear Grip Length',visibility:'customer'},
  {id:'quoteSpecGripBelowReelSeatLength',key:'gripBelowReelSeatLength',label:'Grip Below Reel Seat Length',visibility:'customer'},
  {id:'quoteSpecForeGripLength',key:'foreGripLength',label:'Fore Grip Length',visibility:'customer'},
  {id:'quoteSpecHookKeeperPosition',key:'hookKeeperPosition',label:'Hook Keeper Position',visibility:'customer'},
  {id:'quoteSpecBuilderNotes',key:'builderNotes',label:'Builder Notes',visibility:'workshop'}
];
let quote=normalizeQuote(Store.get('klabs-workshop-quote-current',null)||newQuoteTemplate());
let blanks=normalizeBlankLibrary(Store.get(BLANK_LIBRARY_STORAGE_KEY,defaultBlankLibrary()));
let blankLibrarySearch=String(Store.get(BLANK_LIBRARY_SEARCH_KEY,'')||'');
let buildsSearch='';
let selectedBlankEditState=null;
let selectedBlankControlsBound=false;
let hasUnsavedQuoteChanges=false;
const controlMeta={guideCount:{key:'guideCount',min:5,max:20,step:1},firstGuide:{key:'firstGuide',min:50,max:300,step:1},targetStripper:{key:'targetStripper',min:500,max:2500,step:1}};
let holdTimer=null;
let activeChoicePicker={type:'category',index:-1};
let activeChoiceEditor={mode:'add',originalName:''};
let activeChoiceMenu={name:'',id:'',top:0,left:0,open:false};
let shouldAnimateComponentRows=false;
let activeConfirmHandler=null;
let activeBlankEditorId='';
let pendingControlPersist=false;
const layoutFieldOrder=['firstGuide','guideCount','targetStripper'];
let modalLockDepth=0;
let modalReturnFocusEl=null;
let choicePickerViewportBound=false;
let choicePickerViewportRaf=0;
let workshopKeyboardDismissGuardBound=false;
let workshopInputFocusStabilityBound=false;
const workshopKeyboardDismissState={
  suppressNavUntil:0,
  preservedScrollY:0,
};
const choicePickerViewportState={
  keyboardActive:false,
};

function save(){Store.set('klabs-studio-state',state)}
function saveQuoteCurrent(){Store.set('klabs-workshop-quote-current',quote)}
function numberOrZero(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function currency(value){return '$'+numberOrZero(value).toFixed(2)}
function newQuoteTemplate(){
  return{
    buildNumber:'',
    customerName:'',phone:'',email:'',buildName:'',notes:'',
    addressLine1:'',addressLine2:'',suburbLocality:'',cityTown:'',regionState:'',postcode:'',country:'New Zealand',
    blankId:'',blankName:'',blankMaker:'',blankSeries:'',blankLength:'',blankPower:'',blankAction:'',blankPieces:'',blankCost:0,blankSku:'',blankNotes:'',
    buildSpecifications:{reelSeatPosition:'',rearGripLength:'',gripBelowReelSeatLength:'',foreGripLength:'',hookKeeperPosition:'',builderNotes:''},
    components:[{category:'',description:'',supplier:'',cost:0}],
    labourRate:0,labourHours:0,marginPercent:0,includeGst:true,quoteMode:'internal',gstRate:15,quoteStatus:'draft'
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
function blankSpecificationSummary(){
  const details=[];
  const blankName=specificationValue(quote.blankName);
  const blankLength=specificationValue(quote.blankLength);
  const blankPower=specificationValue(quote.blankPower);
  const blankAction=specificationValue(quote.blankAction);
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
function customerSpecificationRows(){
  const rows=[];
  appendSpecRow(rows,'Blank',blankSpecificationSummary());
  appendSpecRow(rows,'Guide Train',componentDescriptionOrCategory(firstComponentByCategory('guide')));
  appendSpecRow(rows,'Reel Seat Model',componentDescriptionOrCategory(firstComponentByCategory('reel seat')));
  appendSpecRow(rows,'Grip Configuration',componentDescriptionOrCategory(firstComponentByCategory(['grip','butt cap'])));
  BUILD_SPEC_FIELDS.filter((field)=>field.visibility==='customer').forEach((field)=>{
    appendSpecRow(rows,field.label,quote.buildSpecifications&&quote.buildSpecifications[field.key]);
  });
  appendSpecRow(rows,'Special Customer Requests',quote.notes);
  appendSpecRow(rows,'Decorative Notes',componentDescriptionOrCategory(firstComponentByCategory(['decals','thread','winding checks'])));
  appendSpecRow(rows,'Build Summary',quote.buildName);
  return rows;
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
  return{
    category:(component&&typeof component.category==='string')?component.category:(component&&typeof component.name==='string')?component.name:'',
    description:(component&&typeof component.description==='string')?component.description:'',
    supplier:(component&&typeof component.supplier==='string')?component.supplier:'',
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
function normalizeQuote(inputQuote){
  const base=newQuoteTemplate();
  const merged={...base,...(inputQuote||{})};
  const components=Array.isArray(inputQuote&&inputQuote.components)&&inputQuote.components.length?inputQuote.components:[{category:'',description:'',supplier:'',cost:0}];
  merged.components=components.map(normalizeComponent);
  merged.includeGst=(inputQuote&&typeof inputQuote.includeGst==='boolean')?inputQuote.includeGst:true;
  merged.quoteMode=normalizeQuoteMode(inputQuote&&inputQuote.quoteMode);
  merged.quoteStatus=normalizeQuoteStatus((inputQuote&&inputQuote.quoteStatus)||(inputQuote&&inputQuote.status));
  merged.gstRate=numberOrZero(inputQuote&&inputQuote.gstRate)||15;
  merged.blankId=String(inputQuote&&inputQuote.blankId||'');
  merged.blankMaker=String(inputQuote&&inputQuote.blankMaker||'');
  merged.blankSeries=String(inputQuote&&inputQuote.blankSeries||'');
  merged.blankPieces=String(inputQuote&&inputQuote.blankPieces||'');
  merged.blankSku=String(inputQuote&&inputQuote.blankSku||'');
  merged.blankNotes=String(inputQuote&&inputQuote.blankNotes||'');
  const hasStructuredAddress=!!(
    normalizeAddressText(inputQuote&&inputQuote.addressLine1) ||
    normalizeAddressText(inputQuote&&inputQuote.addressLine2) ||
    normalizeAddressText(inputQuote&&inputQuote.suburbLocality) ||
    normalizeAddressText(inputQuote&&inputQuote.cityTown) ||
    normalizeAddressText(inputQuote&&inputQuote.regionState) ||
    normalizeAddressText(inputQuote&&inputQuote.postcode) ||
    normalizeAddressText(inputQuote&&inputQuote.country)
  );
  const legacyAddress=normalizeAddressText(inputQuote&&((inputQuote.addressLine1)||inputQuote.customerAddress||inputQuote.address));
  merged.addressLine1=normalizeAddressText(inputQuote&&inputQuote.addressLine1)||(hasStructuredAddress?'':legacyAddress);
  merged.addressLine2=normalizeAddressText(inputQuote&&inputQuote.addressLine2);
  merged.suburbLocality=normalizeAddressText(inputQuote&&inputQuote.suburbLocality);
  merged.cityTown=normalizeAddressText(inputQuote&&inputQuote.cityTown);
  merged.regionState=normalizeAddressText(inputQuote&&inputQuote.regionState);
  merged.postcode=normalizeAddressText(inputQuote&&inputQuote.postcode);
  merged.country=normalizeAddressText(inputQuote&&inputQuote.country)||'New Zealand';
  merged.buildSpecifications=normalizeBuildSpecifications(inputQuote&&inputQuote.buildSpecifications);
  return merged;
}
function canConvertToBuild(){
  return isAcceptedQuoteStatus(quote.quoteStatus) && !hasUnsavedQuoteChanges;
}
function updateQuoteActionPriority(){
  const saveQuoteBtn=$('saveQuoteBtn');
  const convertToBuildBtn=$('convertToBuildBtn');
  if(!saveQuoteBtn || !convertToBuildBtn)return;

  const isAccepted=isAcceptedQuoteStatus(quote.quoteStatus);
  const saveIsPrimary=!isAccepted || hasUnsavedQuoteChanges;

  saveQuoteBtn.classList.toggle('primary-action',saveIsPrimary);
  saveQuoteBtn.classList.toggle('ghost-action',!saveIsPrimary);
  convertToBuildBtn.classList.toggle('primary-action',!saveIsPrimary);
  convertToBuildBtn.classList.toggle('ghost-action',saveIsPrimary);

  const convertEnabled=canConvertToBuild();
  convertToBuildBtn.disabled=!convertEnabled;
  convertToBuildBtn.setAttribute('aria-disabled',String(!convertEnabled));
  if(!isAccepted){
    convertToBuildBtn.title='Convert To Build is available only for Accepted quotes.';
    return;
  }
  if(hasUnsavedQuoteChanges){
    convertToBuildBtn.title='Save the Accepted quote before converting to a build.';
    return;
  }
  convertToBuildBtn.title='Convert this Accepted quote to a build.';
}
function markQuoteDirty(){
  hasUnsavedQuoteChanges=true;
  updateQuoteActionPriority();
}
function markQuoteSaved(){
  hasUnsavedQuoteChanges=false;
  updateQuoteActionPriority();
}
function quoteHasMeaningfulDraft(currentQuote){
  const candidate=normalizeQuote(currentQuote||{});
  const hasIdentity=[candidate.customerName,candidate.phone,candidate.email,candidate.buildName,candidate.notes,candidate.addressLine1,candidate.addressLine2,candidate.suburbLocality,candidate.cityTown,candidate.regionState,candidate.postcode,candidate.country]
    .some((value)=>!!specificationValue(value));
  const hasBlank=!!(specificationValue(candidate.blankId)||specificationValue(candidate.blankName));
  const hasCosts=numberOrZero(candidate.blankCost)>0 || numberOrZero(candidate.labourRate)>0 || numberOrZero(candidate.labourHours)>0 || numberOrZero(candidate.marginPercent)>0;
  const hasComponentData=Array.isArray(candidate.components) && candidate.components.some((item)=>{
    return !!(specificationValue(item&&item.category)||specificationValue(item&&item.description)||specificationValue(item&&item.supplier)||numberOrZero(item&&item.cost)>0);
  });
  return hasIdentity || hasBlank || hasCosts || hasComponentData;
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
function beginFreshBuild(){
  quote=normalizeQuote(newQuoteTemplate());
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  ensureCustomerSectionExpanded();
  goScreen('workshopScreen');
  window.requestAnimationFrame(()=>{
    const firstField=$('quoteCustomerName');
    if(firstField && typeof firstField.focus==='function'){
      firstField.focus({preventScroll:true});
    }
  });
}
function startNewBuildFlow(){
  if(hasUnsavedQuoteChanges && quoteHasMeaningfulDraft(quote)){
    openConfirmDialog({
      title:'Start New Build',
      message:'Replace the current unsaved build draft and start a new build?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'start',label:'Start New Build',kind:'primary'}]
    },(action)=>{
      if(action==='start'){beginFreshBuild();}
    });
    return;
  }
  beginFreshBuild();
}
function lockModalLayer(openerEl){
  if(modalLockDepth===0){
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
    document.body.classList.remove('component-sheet-open');
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
  const panelMaxWidth=Math.max(240,viewportWidth-(sideGap*2));
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
  const blankCost=numberOrZero(quote.blankCost);
  const buildCostTotal=quote.components.reduce((sum,item)=>{
    return sum+numberOrZero(item.cost);
  },0);
  const materialCost=blankCost+buildCostTotal;
  const labourCost=numberOrZero(quote.labourRate)*numberOrZero(quote.labourHours);
  const internalBuildCost=materialCost+labourCost;
  const marginAmount=internalBuildCost*(numberOrZero(quote.marginPercent)/100);
  const subtotal=internalBuildCost+marginAmount;
  const gstRate=numberOrZero(quote.gstRate)||15;
  const gst=(quote.includeGst!==false)?(subtotal-(subtotal/(1+(gstRate/100)))):0;
  const total=subtotal;
  const profit=marginAmount;
  return{materialCost,labourCost,internalBuildCost,marginAmount,subtotal,gst,total,profit};
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
  const savedAt=new Date().toISOString();
  const records=Store.get('klabs-workshop-builds',[]);
  const record={...currentQuote,savedAt};
  records.unshift(record);
  Store.set('klabs-workshop-builds',records);
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
function allComponentNameOptions(){
  const defaults=DEFAULT_CATEGORY_NAMES.slice();
  const defaultKeys=new Set(defaults.map(normalizeNameKey));
  const customs=getCustomCategoryNames().filter((name)=>!defaultKeys.has(normalizeNameKey(name)));
  return defaults.concat(customs);
}
function componentOptionRecords(query){
  const defaults=DEFAULT_CATEGORY_NAMES.map((name)=>({name,isCustom:false}));
  const customNames=getCustomCategoryNames().map((name)=>({name,isCustom:true}));
  const all=defaults.concat(customNames);
  const normalized=normalizeNameKey(query);
  const archived=new Set(getArchivedChoiceNames('category').map(normalizeNameKey));
  return all.filter((item)=>!archived.has(normalizeNameKey(item.name))).filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
}
function supplierOptionRecords(query){
  const defaults=DEFAULT_SUPPLIER_NAMES.map((name)=>({name,isCustom:false}));
  const customNames=getCustomSupplierNames().map((name)=>({name,isCustom:true}));
  const all=defaults.concat(customNames);
  const normalized=normalizeNameKey(query);
  const archived=new Set(getArchivedChoiceNames('supplier').map(normalizeNameKey));
  return all.filter((item)=>!archived.has(normalizeNameKey(item.name))).filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
}
function blankOptionRecords(query){
  const normalized=normalizeNameKey(query);
  return blanks
    .filter((blank)=>!blank.archived)
    .map((blank)=>({id:blank.id,name:blankDisplayName(blank),isCustom:true,blank}))
    .filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized))
    .sort((left,right)=>{
      const favoriteDiff=Number(blankIsFavourite(right.blank))-Number(blankIsFavourite(left.blank));
      if(favoriteDiff)return favoriteDiff;
      return compareBlankDisplayNames(left.blank,right.blank);
    });
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
        <button class="component-sheet__close" type="button" data-sheet-action="close" aria-label="Close picker">×</button>
      </header>
      <div class="component-sheet__body">
        <input id="choicePickerSearch" class="component-sheet__search" type="text" placeholder="Search" autocomplete="off" spellcheck="false" />
        <div id="choicePickerList" class="component-sheet__list"></div>
        <div id="choicePickerMenu" class="component-picker-menu" hidden>
          <button id="choicePickerMenuRename" class="component-picker-menu__item" type="button">Rename</button>
          <button id="choicePickerMenuDuplicate" class="component-picker-menu__item" type="button" hidden>Duplicate</button>
          <button id="choicePickerMenuDelete" class="component-picker-menu__item" type="button">Delete</button>
        </div>
        <button id="choicePickerAdd" class="component-sheet__add" type="button">+ Add Custom Item</button>
        <div id="choicePickerCustomBox" class="component-sheet__custom" hidden>
          <p id="choicePickerCustomTitle" class="component-sheet__custom-title">Add Custom Item</p>
          <input id="choicePickerCustomInput" class="component-sheet__custom-input" type="text" placeholder="New item name" />
          <button id="choicePickerCustomSave" class="component-sheet__custom-btn" type="button">Save</button>
          <button id="choicePickerCustomCancel" class="component-sheet__custom-btn" type="button">Cancel</button>
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(sheet);

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
    const optionButton=event.target.closest('button[data-choice-option]');
    if(optionButton){
      const selectedName=optionButton.getAttribute('data-choice-option')||'';
      const selectedId=optionButton.getAttribute('data-choice-id')||'';
      const pickerContext={...activeChoicePicker};
      hideChoicePickerMenu();
      closeComponentSheet();
      applyChoiceSelection(selectedName,selectedId,pickerContext);
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
    addCustomChoice(name);
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
  $('choicePickerMenuDuplicate').addEventListener('click',()=>{
    if(!activeChoiceMenu.open || activeChoicePicker.type!=='blank')return;
    const blankId=activeChoiceMenu.id;
    hideChoicePickerMenu();
    duplicateBlank(blankId);
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
  if(customTitle){customTitle.textContent=mode==='rename'?'Rename Custom Item':'Add Custom Item';}
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
  const renameButton=$('choicePickerMenuRename');
  const duplicateButton=$('choicePickerMenuDuplicate');
  const deleteButton=$('choicePickerMenuDelete');
  if(!renameButton || !duplicateButton || !deleteButton)return;
  const isBlank=activeChoicePicker.type==='blank';
  renameButton.textContent=isBlank?'Edit Blank':'Rename';
  renameButton.setAttribute('aria-label',isBlank?'Edit this blank':'Rename this item');
  duplicateButton.hidden=!isBlank;
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
    ?`<button class="component-picker-menu__item" data-blank-action="restore" data-blank-id="${blankId}" type="button">Restore</button><button class="component-picker-menu__item" data-blank-action="edit" data-blank-id="${blankId}" type="button">Edit Blank</button><button class="component-picker-menu__item" data-blank-action="duplicate" data-blank-id="${blankId}" type="button">Duplicate</button><button class="component-picker-menu__item" data-blank-action="delete" data-blank-id="${blankId}" type="button">Delete</button>`
    :`<button class="component-picker-menu__item" data-blank-action="edit" data-blank-id="${blankId}" type="button">Edit Blank</button><button class="component-picker-menu__item" data-blank-action="duplicate" data-blank-id="${blankId}" type="button">Duplicate</button><button class="component-picker-menu__item" data-blank-action="delete" data-blank-id="${blankId}" type="button">Delete</button>`;
  return `<button class="component-sheet__menu-trigger blank-card__menu-trigger" type="button" data-blank-menu-trigger data-blank-id="${blankId}" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${escapeHtml(blankDisplayName(blank))}">⋯</button><div class="component-picker-menu blank-card__menu" hidden data-blank-menu data-blank-id="${blankId}">${actions}</div>`;
}
function addCustomChoice(name){
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
}
function getChoiceValue(type,item){
  return type==='supplier'?(item&&item.supplier)||'':(item&&item.category)||'';
}
function setChoiceValue(type,index,value){
  if(!quote.components[index])return;
  if(type==='supplier'){
    quote.components[index].supplier=value;
  }else{
    quote.components[index].category=value;
  }
  saveQuoteCurrent();
  markQuoteDirty();
}
function applyChoiceSelection(selectedName,selectedId,pickerContext){
  const context=pickerContext||activeChoicePicker;
  if(context.type==='blank'){
    const selectedBlank=findBlankById(selectedId) || blanks.find((blank)=>normalizeNameKey(blankDisplayName(blank))===normalizeNameKey(selectedName));
    if(selectedBlank){
      applyBlankToQuote(selectedBlank);
      renderWorkshopQuote();
    }
    return;
  }
  if(context.index>=0){
    setChoiceValue(context.type,context.index,selectedName);
    const action=context.type==='supplier'?'open-supplier-sheet':'open-component-sheet';
    const trigger=document.querySelector(`#quoteComponentsList [data-component-action="${action}"][data-component-index="${context.index}"] .quote-component-picker__value`);
    if(trigger){
      trigger.textContent=selectedName|| (context.type==='supplier'?'Select supplier':'Select category');
    }
    updateQuoteSummary();
  }
}
function recordsForChoiceType(type,query){
  if(type==='supplier')return supplierOptionRecords(query).map((record)=>({...record,id:''}));
  if(type==='blank')return blankOptionRecords(query);
  return componentOptionRecords(query).map((record)=>({...record,id:''}));
}
function renderChoicePickerOptions(query){
  const list=$('choicePickerList');
  if(!list)return;
  const records=recordsForChoiceType(activeChoicePicker.type,query);
  const options=activeChoicePicker.type==='blank'?records:records.slice(0,50);
  const includeInlineAdd=activeChoicePicker.type==='blank';
  const addInlineMarkup=includeInlineAdd
    ? '<div class="component-sheet__row component-sheet__row--add"><button class="component-sheet__add component-sheet__add--inline" data-choice-add-inline="true" type="button">+ Add Blank</button></div>'
    : '';
  syncChoicePickerMenuActions();
  hideChoicePickerMenu();
  if(!options.length){
    list.innerHTML=`<div class="component-sheet__empty">No matching items</div>${addInlineMarkup}`;
    return;
  }
  const rowsMarkup=options.map((item)=>{
    const hasMenu=choicePickerSupportsContextMenu();
    return `<div class="component-sheet__row"><button class="component-sheet__option" data-choice-option="${escapeHtml(item.name)}" data-choice-id="${escapeHtml(item.id||'')}" type="button" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>${hasMenu?`<button class="component-sheet__menu-trigger" data-choice-menu-option="${escapeHtml(item.name)}" data-choice-menu-id="${escapeHtml(item.id||'')}" type="button" aria-label="More actions for ${escapeHtml(item.name)}">⋯</button>`:''}</div>`;
  }).join('');
  list.innerHTML=rowsMarkup+addInlineMarkup;
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
    title:'Delete Item',
    message:'Delete this custom item from the picker list?',
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
  return{category:'',description:'',supplier:'',cost:0};
}
function removeComponentRow(index){
  if(index<0 || index>=quote.components.length)return;
  if(quote.components.length>1){
    quote.components.splice(index,1);
  }else{
    quote.components[0]=defaultComponentRow();
  }
  shouldAnimateComponentRows=true;
  saveQuoteCurrent();
  markQuoteDirty();
  renderQuoteComponents();
  updateQuoteSummary();
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
  if($('choicePickerTitle'))$('choicePickerTitle').textContent=type==='supplier'?'Select Supplier':type==='blank'?'Select Blank':'Select Category';
  const addButton=$('choicePickerAdd');
  if(addButton){
    addButton.textContent=type==='supplier'?'+ Add Custom Supplier':type==='blank'?'+ Add Blank':'+ Add Custom Category';
    addButton.hidden=type==='blank';
  }
  if($('choicePickerCustomInput'))$('choicePickerCustomInput').placeholder=type==='supplier'?'New supplier name':type==='blank'?'New blank name':'New category name';
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
  const animateClass=shouldAnimateComponentRows?' quote-component-row--shift':'';
  componentsList.innerHTML=quote.components.map((item,i)=>`
      <article class="quote-component-row${animateClass}" data-component-row-index="${i}" aria-label="Build cost row ${i+1}">
        <div class="quote-component-row__head">
          <p class="quote-component-row__title">Build Cost ${i+1}</p>
          <button class="component-row-delete" data-component-action="delete-row" data-component-index="${i}" type="button" aria-label="Delete build cost row ${i+1}">×</button>
        </div>
        <div class="quote-component-row__fields">
          <label class="quote-component-field quote-component-field--category"><span>Category</span><button class="quote-component-picker__trigger" data-component-action="open-component-sheet" data-component-index="${i}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.category||'Select category')}</span><b>▾</b></button></label>
          <label class="quote-component-field quote-component-field--supplier"><span>Supplier</span><button class="quote-component-picker__trigger" data-component-action="open-supplier-sheet" data-component-index="${i}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.supplier||'Select supplier')}</span><b>▾</b></button></label>
          <label class="quote-component-field quote-component-field--description"><span>Description</span><input data-component-index="${i}" data-component-key="description" type="text" placeholder="Enter description..." value="${escapeHtml(item.description||'')}" /></label>
          <label class="quote-component-field quote-component-field--cost"><span>Cost</span><input data-component-index="${i}" data-component-key="cost" type="number" min="0" step="0.01" value="${numberOrZero(item.cost)}" /></label>
        </div>
      </article>
    `).join('');
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
function persistQuoteRecord(currentQuote){
  const savedAt=new Date().toISOString();
  const records=Store.get('klabs-workshop-quotes',[]);
  const record={...currentQuote,savedAt};
  records.unshift(record);
  Store.set('klabs-workshop-quotes',records);
}
function savedBuildEntries(){
  const savedQuotes=Array.isArray(Store.get('klabs-workshop-quotes',[]))?Store.get('klabs-workshop-quotes',[]):[];
  const savedBuilds=Array.isArray(Store.get('klabs-workshop-builds',[]))?Store.get('klabs-workshop-builds',[]):[];
  const quoteEntries=savedQuotes.map((record,index)=>({source:'quote',index,record:normalizeQuote(record)}));
  const buildEntries=savedBuilds.map((record,index)=>({source:'build',index,record:normalizeQuote(record)}));
  return quoteEntries.concat(buildEntries).sort((left,right)=>{
    const leftDate=Date.parse(left.record&&left.record.savedAt||'')||0;
    const rightDate=Date.parse(right.record&&right.record.savedAt||'')||0;
    return rightDate-leftDate;
  });
}
function savedBuildSearchText(entry){
  const record=entry&&entry.record?entry.record:{};
  return [record.buildNumber,record.customerName,record.buildName,record.blankName,record.blankMaker,record.blankSeries,record.savedAt,entry&&entry.source]
    .map((value)=>String(value||''))
    .join(' ')
    .toLowerCase();
}
function savedBuildRowMarkup(entry){
  const record=entry.record;
  const sourceLabel=entry.source==='build'?'Build':'Quote';
  const title=specificationValue(record.buildName)||specificationValue(record.customerName)||'Untitled Build';
  const buildRef=specificationValue(record.buildNumber)||'Unnumbered';
  const customerRef=specificationValue(record.customerName)||'No customer';
  const blankRef=specificationValue(record.blankName)||'No blank selected';
  const savedAtText=record.savedAt?new Date(record.savedAt).toLocaleString():'Unknown save time';
  const source=escapeHtml(entry.source);
  const index=Number(entry.index);
  return `<article class="module-card blank-card" data-build-row data-build-source="${source}" data-build-index="${index}"><span>${escapeHtml(sourceLabel)}</span><strong>${escapeHtml(title)}</strong><em>${escapeHtml(buildRef)} • ${escapeHtml(customerRef)}</em><em>${escapeHtml(blankRef)} • Saved ${escapeHtml(savedAtText)}</em><div class="blank-card__actions"><button class="ghost-action blank-card__load" type="button" data-build-action="open" data-build-source="${source}" data-build-index="${index}">Open</button><button class="ghost-action blank-card__load" type="button" data-build-action="duplicate" data-build-source="${source}" data-build-index="${index}">Duplicate</button>${savedBuildRowMenuMarkup(entry,title)}</div></article>`;
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
    renderBuilds();
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
  quote=normalizeQuote(selected);
  saveQuoteCurrent();
  markQuoteSaved();
  renderWorkshopQuote();
  ensureCustomerSectionExpanded();
  goScreen('workshopScreen');
}
function duplicateSavedBuildRecord(source,index){
  const selected=getSavedEntryBySource(source,index);
  if(!selected)return;
  quote=normalizeQuote({
    ...selected,
    buildNumber:'',
    quoteStatus:'draft',
    savedAt:'',
  });
  saveQuoteCurrent();
  markQuoteDirty();
  renderWorkshopQuote();
  ensureCustomerSectionExpanded();
  goScreen('workshopScreen');
}
function renderBuilds(){
  const host=$('buildCards');
  if(!host)return;
  hideSavedBuildRowMenu();
  const query=String(buildsSearch||'').trim().toLowerCase();
  const records=savedBuildEntries().filter((entry)=>!query || savedBuildSearchText(entry).includes(query));
  if(!records.length){
    host.innerHTML='<div class="empty-card">No saved builds found.</div>';
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
  sheet.addEventListener('click',(event)=>{
    const actionButton=event.target.closest('[data-confirm-action]');
    if(!actionButton)return;
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
  const parsed=Number(rawValue);
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
  if(holdTimer){clearInterval(holdTimer);holdTimer=null;}
  persistLayoutControlState();
}
function startHold(field,direction){
  if(isLayoutLocked())return;
  stopHold();
  changeControlValue(field,direction,{persist:false});
  holdTimer=window.setInterval(()=>changeControlValue(field,direction,{persist:false}),120);
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
      const value=String(state[controlMeta[field].key]);
      if(el.textContent!==value){el.textContent=value;}
      const range=document.createRange();
      range.selectNodeContents(el);
      const selection=window.getSelection();
      if(selection){selection.removeAllRanges();selection.addRange(range);}
    });
    el.addEventListener('blur',()=>{
      const raw=(el.textContent||'').replace(/[^0-9.-]/g,'');
      setControlValue(field,raw,{persist:true});
    });
    el.addEventListener('beforeinput',(event)=>{
      if(event.inputType==='deleteContentBackward' || event.inputType==='deleteContentForward' || event.inputType==='insertFromPaste')return;
      if(event.data && /[^0-9]/.test(event.data)){event.preventDefault();}
    });
    el.addEventListener('keydown',(event)=>{
      if(event.key==='ArrowUp'){event.preventDefault();changeControlValue(field,1,{persist:true});return;}
      if(event.key==='ArrowDown'){event.preventDefault();changeControlValue(field,-1,{persist:true});return;}
      if(event.key==='Enter'){
        event.preventDefault();
        el.blur();
        focusLayoutField(nextLayoutField(field));
      }
      if(event.key==='Escape'){event.preventDefault();el.textContent=String(state[controlMeta[field].key]);el.blur();}
    });
  });
  document.querySelectorAll('.layout-control-card__button[data-action]').forEach((button)=>{
    const field=button.getAttribute('data-target-field');
    if(!field || !controlMeta[field])return;
    const direction=button.getAttribute('data-action')==='increment'?1:-1;
    button.addEventListener('pointerdown',(event)=>{
      event.preventDefault();
      startHold(field,direction);
    });
    button.addEventListener('click',(event)=>{
      if(isLayoutLocked()){
        event.preventDefault();
        return;
      }
      event.preventDefault();
      changeControlValue(field,direction,{persist:true});
    });
    ['pointerup','pointerleave','pointercancel'].forEach((type)=>button.addEventListener(type,stopHold));
  });
}
function workshopInputMap(){
  return[
    ['quoteCustomerName','customerName'],['quoteCustomerPhone','phone'],['quoteCustomerEmail','email'],
    ['quoteAddressLine1','addressLine1'],['quoteAddressLine2','addressLine2'],['quoteSuburbLocality','suburbLocality'],['quoteCityTown','cityTown'],['quoteRegionState','regionState'],['quotePostcode','postcode'],['quoteCountry','country'],
    ['quoteBuildName','buildName'],['quoteNotes','notes'],
    ['quoteBlankName','blankName'],['quoteBlankMaker','blankMaker'],['quoteBlankSeries','blankSeries'],['quoteBlankLength','blankLength'],['quoteBlankPower','blankPower'],['quoteBlankAction','blankAction'],['quoteBlankPieces','blankPieces'],
    ['quoteBlankCost','blankCost'],['quoteLabourRate','labourRate'],['quoteLabourHours','labourHours'],['quoteMarginPercent','marginPercent'],['quoteGstRate','gstRate']
  ];
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
function bindWorkshopCollapsibleSections(){
  document.querySelectorAll('[data-collapsible-trigger]').forEach((trigger)=>{
    if(trigger.getAttribute('data-collapsible-bound')==='true')return;
    trigger.setAttribute('data-collapsible-bound','true');
    trigger.addEventListener('click',()=>{
      const section=trigger.closest('.quote-section--collapsible');
      if(!section)return;
      const isCollapsed=section.classList.toggle('quote-section--collapsed');
      trigger.setAttribute('aria-expanded',String(!isCollapsed));
    });
  });
}
function bindWorkshopQuoteBuilder(){
  bindWorkshopCollapsibleSections();
  bindWorkshopKeyboardDismissGuard();
  bindWorkshopInputFocusStability();
  bindSelectedBlankControls();
  workshopInputMap().forEach(([id,key])=>{
    const el=$(id);
    if(!el)return;
    const isNumeric=['blankCost','labourRate','labourHours','marginPercent','gstRate'].includes(key);
    const onFieldUpdate=()=>{
      quote[key]=isNumeric?numberOrZero(el.value):el.value;
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    };
    el.addEventListener('input',onFieldUpdate);
    el.addEventListener('change',onFieldUpdate);
  });
  const includeGstInput=$('quoteIncludeGst');
  if(includeGstInput){
    includeGstInput.addEventListener('change',()=>{
      quote.includeGst=includeGstInput.checked;
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
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
    componentsList.addEventListener('input',(event)=>{
      const input=event.target.closest('[data-component-index]');
      if(!input)return;
      const i=Number(input.getAttribute('data-component-index'));
      const key=input.getAttribute('data-component-key');
      if(!quote.components[i] || !key)return;
      quote.components[i][key]=['cost'].includes(key)?numberOrZero(input.value):input.value;
      saveQuoteCurrent();
      markQuoteDirty();
      updateQuoteSummary();
    });
    componentsList.addEventListener('click',(event)=>{
      const actionButton=event.target.closest('[data-component-action]');
      const action=actionButton?actionButton.getAttribute('data-component-action'):'';
      if(action==='open-component-sheet'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        openChoicePicker('category',i,actionButton);
      }
      if(action==='open-supplier-sheet'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        openChoicePicker('supplier',i,actionButton);
      }
      if(action==='delete-row'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        removeComponentRow(i);
      }
    });
  }
  const addComponentBtn=$('addComponentBtn');
  if(addComponentBtn){
    addComponentBtn.addEventListener('click',()=>{
      quote.components.push(defaultComponentRow());
      const newIndex=quote.components.length-1;
      shouldAnimateComponentRows=true;
      saveQuoteCurrent();
      markQuoteDirty();
      renderQuoteComponents();
      updateQuoteSummary();
      waitForDomRender(()=>{
        scrollNewComponentRowIntoView(newIndex);
        setTimeout(()=>focusNewComponentWithRetry(newIndex,6),220);
      });
    });
  }
  const saveQuoteBtn=$('saveQuoteBtn');
  if(saveQuoteBtn){
    saveQuoteBtn.addEventListener('click',()=>{
      if(!quote.buildNumber){quote.buildNumber=nextBuildNumber();}
      saveQuoteCurrent();
      persistQuoteRecord(quote);
      markQuoteSaved();
      alert('Quote saved.');
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
      persistBuildRecord(quote);
      markQuoteSaved();
      goScreen('layoutScreen');
    });
  }
  ['duplicateQuoteBtn','printQuoteBtn','exportPdfBtn','emailQuoteBtn'].forEach((id)=>{
    const btn=$(id);
    if(!btn)return;
    btn.addEventListener('click',()=>{
      if(id==='emailQuoteBtn' && normalizeQuoteMode(quote.quoteMode)==='internal'){
        openConfirmDialog({
          title:'⚠ INTERNAL QUOTE',
          message:'This quote contains confidential build costs and margin information. Do you wish to continue?',
          actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'continue',label:'Continue',kind:'primary'}]
        },(action)=>{
          if(action==='continue'){alert('Coming soon');}
        });
        return;
      }
      if(id==='emailQuoteBtn' && normalizeQuoteMode(quote.quoteMode)==='customer'){
        openQuotePreviewSheet('email');
        return;
      }
      alert('Coming soon');
    });
  });
  updateQuoteActionPriority();
}
function renderWorkshopQuote(){
  workshopInputMap().forEach(([id,key])=>{
    const el=$(id);
    if(!el)return;
    if(document.activeElement===el)return;
    const isNumeric=['blankCost','labourRate','labourHours','marginPercent'].includes(key);
    el.value=isNumeric?(quote[key]??0):(quote[key]??'');
  });
  const includeGstInput=$('quoteIncludeGst');
  if(includeGstInput && document.activeElement!==includeGstInput){includeGstInput.checked=quote.includeGst!==false;}
  const mode=normalizeQuoteMode(quote.quoteMode);
  document.querySelectorAll('[data-quote-mode]').forEach((button)=>button.classList.toggle('active',button.getAttribute('data-quote-mode')===mode));
  document.querySelectorAll('[data-internal-only]').forEach((el)=>el.hidden=mode==='customer');
  document.querySelectorAll('[data-customer-only]').forEach((el)=>el.hidden=mode!=='customer');
  if($('quoteBuilderTitle'))$('quoteBuilderTitle').textContent='Rod Builder Quote';
  if($('quoteBuilderSubhead'))$('quoteBuilderSubhead').textContent=mode==='customer'?'Customer-ready pricing view • internal figures hidden':'Customer • Blank Details • Build Specifications • Build Costs • Labour • Margin • Quote Summary';
  if($('emailQuoteBtn'))$('emailQuoteBtn').textContent=mode==='customer'?'Preview & Email Quote':'Email Quote';
  if($('quoteCustomerSummaryName'))$('quoteCustomerSummaryName').textContent=specificationValue(quote.customerName)||'No customer name entered';
  updateQuoteActionPriority();
  renderSelectedBlankPanel();
  renderBuildSpecificationInputs();
  const activeElement=document.activeElement;
  const isEditingComponent=!!(activeElement&&activeElement.closest&&activeElement.closest('#quoteComponentsList'));
  if(!isEditingComponent){renderQuoteComponents();}
  updateQuoteSummary();
}
function updateQuoteSummary(){
  const math=quoteMaths();
  const mode=normalizeQuoteMode(quote.quoteMode);
  if($('quoteLabourCost'))$('quoteLabourCost').value=currency(math.labourCost);
  if($('quoteCostBeforeMargin'))$('quoteCostBeforeMargin').value=currency(math.internalBuildCost);
  if($('quoteSubtotal'))$('quoteSubtotal').value=currency(math.subtotal);
  if($('quoteGst'))$('quoteGst').value=currency(math.gst);
  if($('quoteTotal'))$('quoteTotal').value=currency(math.total);
  if($('quoteProfit'))$('quoteProfit').value=currency(math.profit);
  if($('quoteModeLabel'))$('quoteModeLabel').textContent=mode==='customer'?'Customer mode':'Internal mode';
  const gstField=$('quoteGstField');
  const gstStatus=$('quoteGstStatus');
  if(gstField){gstField.classList.toggle('quote-field--muted',quote.includeGst===false);}
  if(gstStatus){gstStatus.textContent=quote.includeGst===false?'Tax not included in displayed price.':'Tax included in displayed price.';}
  ['quoteCostBeforeMarginField','quoteMarginPercentField','quoteProfitField'].forEach((id)=>{const el=$(id);if(el)el.hidden=mode==='customer';});
}

function ensureQuotePreviewSheet(){
  if($('quotePreviewSheet'))return;
  const sheet=document.createElement('div');
  sheet.id='quotePreviewSheet';
  sheet.className='component-sheet';
  sheet.hidden=true;
  sheet.innerHTML=`
    <div class="component-sheet__scrim" data-quote-preview-action="close"></div>
    <section class="component-sheet__panel quote-preview-panel" role="dialog" aria-modal="true" aria-label="Preview quote">
      <header class="component-sheet__header">
        <h2>Preview Quote</h2>
        <button class="component-sheet__close" type="button" data-quote-preview-action="close" aria-label="Close preview">×</button>
      </header>
      <div class="component-sheet__body quote-preview-body">
        <div class="quote-preview-card">
          <div class="quote-preview-card__head">
            <strong id="quotePreviewName">Customer Quote</strong>
            <span id="quotePreviewBuild"></span>
          </div>
          <p id="quotePreviewCustomer"></p>
          <p id="quotePreviewBuildName"></p>
          <div id="quotePreviewSpecs" class="quote-preview-summary"></div>
          <div id="quotePreviewSummary" class="quote-preview-summary"></div>
        </div>
        <div class="quote-preview-actions">
          <button id="quotePreviewBackBtn" class="ghost-action" type="button">Back</button>
          <button id="quotePreviewApproveBtn" class="primary-action" type="button">Approve & Send</button>
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
    alert('Quote approved and ready to send.');
  });
}
function renderQuotePreviewSheet(){
  const math=quoteMaths();
  const specificationViews=buildSpecificationViews();
  const customerLines=customerPreviewLines();
  if($('quotePreviewName'))$('quotePreviewName').textContent='Customer Quote';
  if($('quotePreviewBuild'))$('quotePreviewBuild').textContent=quote.buildNumber||'Unnumbered quote';
  if($('quotePreviewCustomer'))$('quotePreviewCustomer').innerHTML=customerLines.length?customerLines.map(escapeHtml).join('<br>'):'No customer details entered';
  if($('quotePreviewBuildName'))$('quotePreviewBuildName').textContent=quote.buildName||'No build name entered';
  if($('quotePreviewSpecs'))$('quotePreviewSpecs').innerHTML=specificationRowsMarkup(specificationViews.customer);
  if($('quotePreviewSummary'))$('quotePreviewSummary').innerHTML=`
    <div><span>Total Customer Price</span><strong>${currency(math.total)}</strong></div>
    <div><span>Tax</span><strong>${quote.includeGst===false?'Not Included':currency(math.gst)}</strong></div>
  `;
}
function openQuotePreviewSheet(action){
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
  const demoKey='build 041 demo softbait';
  const existing=blanks.find((blank)=>normalizeNameKey(blank&&blank.model)===demoKey);
  const incoming=normalizeBlank({
    id:existing?existing.id:generateId('blank'),
    maker:'K-Labs',
    series:'Demo Series',
    model:'Build 041 Demo Softbait',
    length:"7'4",
    power:'MH',
    action:'Fast',
    pieces:'2',
    cost:438,
    sku:'DEMO-0381-SB74',
    notes:'Offline demo blank for BUILD 041 validation.',
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
    buildName:'Build 041 Demo Softbait',
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
      {category:'Thread',supplier:'K-Labs',description:'Thread + finish + trim set',cost:22}
    ],
    labourRate:50,
    labourHours:2,
    marginPercent:20,
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
  const filtered=blanks.filter((blank)=>blankMatchesSearch(blank,blankLibrarySearch));
  if(!filtered.length){
    host.innerHTML='<div class="empty-card">No blanks match your search.</div>';
    return;
  }
  host.innerHTML=filtered.map((blank)=>{
    const idx=blanks.findIndex((item)=>item.id===blank.id);
    const archiveTag=blank.archived?'<small class="blank-card__archive">Archived</small>':'';
    return `<article class="module-card blank-card" data-blank-row data-blank-id="${escapeHtml(blank.id)}" data-blank-index="${idx}" tabindex="0" role="button" aria-label="Load blank ${escapeHtml(blankDisplayName(blank))}"><span>${escapeHtml(blank.maker||'Blank')}</span><strong>${escapeHtml(blankDisplayName(blank))}</strong><em>${escapeHtml(blank.series||'Series n/a')} • ${escapeHtml(blank.length||'Length n/a')} • ${escapeHtml(blank.power||'Power n/a')} • ${escapeHtml(blank.action||'Action n/a')}</em><em>First ${blank.fg} mm • Guides ${blank.gc} mm • Target ${blank.ts} mm • Cost ${currency(blank.cost)}</em>${archiveTag}<div class="blank-card__actions"><button class="ghost-action blank-card__load" data-blank-action="load" data-blank-id="${escapeHtml(blank.id)}" data-blank-index="${idx}" type="button">Load</button>${blankRowMenuMarkup(blank)}</div></article>`;
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
      if(action==='load'){
        const idx=Number(button.getAttribute('data-blank-index'));
        loadBlank(Number.isFinite(idx)?idx:blanks.findIndex((item)=>item.id===blankId));
      }
      if(action==='edit'){openBlankEditor(blankId);}
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
  const newBuildBtn=$('homeNewBuildBtn');
  if(!newBuildBtn)return;
  newBuildBtn.addEventListener('click',()=>{
    startNewBuildFlow();
  });
}
function bindBuildsControls(){
  const searchInput=$('buildsSearchInput');
  if(searchInput){
    searchInput.addEventListener('input',()=>{
      buildsSearch=searchInput.value||'';
      renderBuilds();
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
  if(screenId==='buildsScreen'){
    const searchInput=$('buildsSearchInput');
    if(searchInput && searchInput.value!==buildsSearch){searchInput.value=buildsSearch;}
    renderBuilds();
  }
  if(screenId==='workshopScreen'){
    renderWorkshopQuote();
  }
  if(screenId==='layoutScreen' && !isLayoutLocked()){
    const canAutoFocus=window.matchMedia&&window.matchMedia('(pointer:fine)').matches;
    if(canAutoFocus){
      requestAnimationFrame(()=>focusLayoutField(layoutFieldOrder[0]));
    }
  }
}
function bindSettingsControls(){
  const demoButton=$('loadDemoBuildBtn');
  if(!demoButton)return;
  demoButton.addEventListener('click',()=>{
    openConfirmDialog({
      title:'Load Demo Build',
      message:'Replace the current quote fields with demo data for quick offline and workflow testing?',
      actions:[{id:'cancel',label:'Cancel',kind:'ghost'},{id:'load',label:'Load Demo Build',kind:'primary'}]
    },(action)=>{
      if(action==='load'){
        loadDemoBuild();
      }
    });
  });
}
function render(){
  const r=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  const appEl=$('app');
  if(appEl){appEl.classList.toggle('locked',!!state.locked);}
  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(field && controlMeta[field] && document.activeElement!==el){el.textContent=String(state[controlMeta[field].key]);}
    const editable=!state.locked;
    el.setAttribute('contenteditable',editable?'true':'false');
    el.setAttribute('aria-readonly',editable?'false':'true');
  });
  document.querySelectorAll('.layout-control-card__button[data-action]').forEach((button)=>{
    button.disabled=!!state.locked;
  });
  const guideSpacingCards=$('guideSpacingCards');
  if(guideSpacingCards){
    guideSpacingCards.innerHTML=r.rows.map((row,i)=>`
      <article class="guide-spacing-row${i===state.workshopIndex?' guide-spacing-row--active':''}" data-guide-index="${i}" tabindex="0" role="button" aria-label="Guide ${row.g}. Position ${row.cum.toFixed(1)} millimeters. Spacing ${row.spacing.toFixed(1)} millimeters" aria-current="${i===state.workshopIndex?'true':'false'}">
        <div class="guide-spacing-row__meta">
          <span>Guide ${row.g}</span>
          <small>Pos ${row.cum.toFixed(1)} mm</small>
        </div>
        <div class="guide-spacing-row__meta">
          <small>Position</small>
          <span>${row.cum.toFixed(1)} mm</span>
        </div>
        <strong>Sp ${row.spacing.toFixed(1)} mm</strong>
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
  if($('workshopMeasure'))$('workshopMeasure').textContent=row.cum.toFixed(1);
  if($('workshopSpacing'))$('workshopSpacing').textContent='Spacing from previous: '+row.spacing.toFixed(1)+' mm';
  if(window.StudioVisuals && typeof window.StudioVisuals.update==='function'){window.StudioVisuals.update(r,state);}
  const workshopScreen=$('workshopScreen');
  if(workshopScreen && workshopScreen.classList.contains('active')){renderWorkshopQuote();}
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
bindLayoutControls();
bindWorkshopQuoteBuilder();
bindHomeActions();
bindBuildsControls();
bindBlankLibraryControls();
bindSettingsControls();
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks,renderBuilds,loadDemoBuild,startNewBuildFlow,onScreenChange};
