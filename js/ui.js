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
let hasUnsavedQuoteChanges=false;
const controlMeta={guideCount:{key:'guideCount',min:5,max:20,step:1},firstGuide:{key:'firstGuide',min:50,max:300,step:1},targetStripper:{key:'targetStripper',min:500,max:2500,step:1}};
let holdTimer=null;
let activeChoicePicker={type:'category',index:-1};
let activeChoiceEditor={mode:'add',originalName:''};
let shouldAnimateComponentRows=false;
let activeConfirmHandler=null;
let activeBlankEditorId='';
let modalLockDepth=0;
let modalSavedScrollY=0;
let modalReturnFocusEl=null;

function save(){Store.set('klabs-studio-state',state)}
function saveQuoteCurrent(){Store.set('klabs-workshop-quote-current',quote)}
function numberOrZero(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function currency(value){return '$'+numberOrZero(value).toFixed(2)}
function newQuoteTemplate(){
  return{
    buildNumber:'',
    customerName:'',phone:'',email:'',buildName:'',notes:'',
    blankId:'',blankName:'',blankMaker:'',blankSeries:'',blankLength:'',blankPower:'',blankAction:'',blankPieces:'',blankCost:0,blankSku:'',blankNotes:'',
    buildSpecifications:{reelSeatPosition:'',rearGripLength:'',gripBelowReelSeatLength:'',foreGripLength:'',hookKeeperPosition:'',builderNotes:''},
    components:[{category:'',description:'',supplier:'',cost:0}],
    labourRate:0,labourHours:0,marginPercent:0,includeGst:true,quoteMode:'internal',gstRate:15,quoteStatus:'draft'
  };
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
function lockModalLayer(openerEl){
  if(modalLockDepth===0){
    modalSavedScrollY=window.scrollY||window.pageYOffset||0;
    document.body.style.position='fixed';
    document.body.style.top=`-${modalSavedScrollY}px`;
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
  if(modalLockDepth<=0)return;
  modalLockDepth-=1;
  if(modalLockDepth>0)return;
  const focusTarget=modalReturnFocusEl;
  window.requestAnimationFrame(()=>{
    document.body.style.position='';
    document.body.style.top='';
    document.body.style.left='';
    document.body.style.right='';
    document.body.style.width='';
    document.body.classList.remove('component-sheet-open');
    window.scrollTo(0,modalSavedScrollY);
    if(settings.restoreFocus && focusTarget && typeof focusTarget.focus==='function'){
      try{
        focusTarget.focus({preventScroll:true});
      }catch{
        focusTarget.focus();
      }
    }
    modalReturnFocusEl=null;
  });
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
  if(maker && model)return maker+' '+model;
  return model||maker||'Untitled Blank';
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
  return blanks.filter((blank)=>!blank.archived).map((blank)=>({id:blank.id,name:blankDisplayName(blank),isCustom:true,blank})).filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
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
    const optionButton=event.target.closest('button[data-choice-option]');
    if(optionButton){
      const selectedName=optionButton.getAttribute('data-choice-option')||'';
      const selectedId=optionButton.getAttribute('data-choice-id')||'';
      applyChoiceSelection(selectedName,selectedId);
      closeComponentSheet();
    }
    const deleteButton=event.target.closest('button[data-choice-delete-option]');
    if(deleteButton){
      const optionName=deleteButton.getAttribute('data-choice-delete-option')||'';
      const optionId=deleteButton.getAttribute('data-choice-delete-id')||'';
      requestDeleteChoice(optionName,optionId);
    }
    const renameButton=event.target.closest('button[data-choice-rename-option]');
    if(renameButton){
      const optionName=renameButton.getAttribute('data-choice-rename-option')||'';
      const optionId=renameButton.getAttribute('data-choice-rename-id')||'';
      activeChoiceEditor.blankId=optionId;
      startChoiceEditor('rename',optionName);
    }
  });

  $('choicePickerSearch').addEventListener('input',()=>renderChoicePickerOptions($('choicePickerSearch').value));
  $('choicePickerAdd').addEventListener('click',()=>{
    startChoiceEditor('add','');
  });
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
function applyChoiceSelection(selectedName,selectedId){
  if(activeChoicePicker.type==='blank'){
    const selectedBlank=findBlankById(selectedId) || blanks.find((blank)=>normalizeNameKey(blankDisplayName(blank))===normalizeNameKey(selectedName));
    if(selectedBlank){
      applyBlankToQuote(selectedBlank);
      renderWorkshopQuote();
    }
    return;
  }
  if(activeChoicePicker.index>=0){setChoiceValue(activeChoicePicker.type,activeChoicePicker.index,selectedName);renderQuoteComponents();updateQuoteSummary();}
}
function recordsForChoiceType(type,query){
  if(type==='supplier')return supplierOptionRecords(query).map((record)=>({...record,id:''}));
  if(type==='blank')return blankOptionRecords(query);
  return componentOptionRecords(query).map((record)=>({...record,id:''}));
}
function renderChoicePickerOptions(query){
  const list=$('choicePickerList');
  if(!list)return;
  const options=recordsForChoiceType(activeChoicePicker.type,query).slice(0,50);
  if(!options.length){
    list.innerHTML='<div class="component-sheet__empty">No matching items</div>';
    return;
  }
  list.innerHTML=options.map((item)=>{
    const canEdit=true;
    return `<div class="component-sheet__row"><button class="component-sheet__option" data-choice-option="${escapeHtml(item.name)}" data-choice-id="${escapeHtml(item.id||'')}" type="button" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</button>${canEdit?`<div class="component-sheet__actions"><button class="component-sheet__edit" data-choice-rename-option="${escapeHtml(item.name)}" data-choice-rename-id="${escapeHtml(item.id||'')}" type="button" aria-label="Rename ${activeChoicePicker.type}">Rename</button><button class="component-sheet__delete" data-choice-delete-option="${escapeHtml(item.name)}" data-choice-delete-id="${escapeHtml(item.id||'')}" type="button" aria-label="Delete ${activeChoicePicker.type}">Delete</button></div>`:''}</div>`;
  }).join('');
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
  if($('choicePickerCustomBox'))$('choicePickerCustomBox').hidden=true;
  activeChoiceEditor={mode:'add',originalName:'',blankId:''};
  if($('choicePickerSearch'))$('choicePickerSearch').value='';
  if($('choicePickerTitle'))$('choicePickerTitle').textContent=type==='supplier'?'Select Supplier':type==='blank'?'Select Blank':'Select Category';
  if($('choicePickerAdd'))$('choicePickerAdd').textContent=type==='supplier'?'+ Add Custom Supplier':type==='blank'?'+ Add Blank':'+ Add Custom Category';
  if($('choicePickerCustomInput'))$('choicePickerCustomInput').placeholder=type==='supplier'?'New supplier name':type==='blank'?'New blank name':'New category name';
  renderChoicePickerOptions('');
  if($('choicePickerSearch'))$('choicePickerSearch').focus();
}
function closeComponentSheet(){
  const sheet=$('choicePickerSheet');
  if(!sheet)return;
  sheet.hidden=true;
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
function persistQuoteRecord(currentQuote){
  const savedAt=new Date().toISOString();
  const records=Store.get('klabs-workshop-quotes',[]);
  const record={...currentQuote,savedAt};
  records.unshift(record);
  Store.set('klabs-workshop-quotes',records);
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
function setControlValue(field,rawValue){
  const cfg=controlMeta[field];
  if(!cfg)return;
  const parsed=Number(rawValue);
  if(!Number.isFinite(parsed))return;
  state[cfg.key]=clampValue(parsed,cfg.min,cfg.max);
  save();
  render();
}
function changeControlValue(field,direction){
  const cfg=controlMeta[field];
  if(!cfg)return;
  setControlValue(field,state[cfg.key]+(direction*cfg.step));
}
function stopHold(){if(holdTimer){clearInterval(holdTimer);holdTimer=null;}}
function startHold(field,direction){
  stopHold();
  changeControlValue(field,direction);
  holdTimer=window.setInterval(()=>changeControlValue(field,direction),140);
}
function bindLayoutControls(){
  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(!field || !controlMeta[field])return;
    el.addEventListener('focus',()=>{
      const value=String(state[controlMeta[field].key]);
      if(el.textContent!==value){el.textContent=value;}
    });
    el.addEventListener('blur',()=>{
      const raw=(el.textContent||'').replace(/[^0-9.-]/g,'');
      setControlValue(field,raw);
    });
    el.addEventListener('keydown',(event)=>{
      if(event.key==='Enter'){event.preventDefault();el.blur();}
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
    ['pointerup','pointerleave','pointercancel'].forEach((type)=>button.addEventListener(type,stopHold));
  });
}
function workshopInputMap(){
  return[
    ['quoteCustomerName','customerName'],['quoteCustomerPhone','phone'],['quoteCustomerEmail','email'],['quoteBuildName','buildName'],['quoteNotes','notes'],
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
  const blankPickerTrigger=$('quoteBlankPickerTrigger');
  if(blankPickerTrigger){
    blankPickerTrigger.addEventListener('click',()=>openChoicePicker('blank',-1,blankPickerTrigger));
  }
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
  if($('quoteBlankPickerTriggerValue'))$('quoteBlankPickerTriggerValue').textContent=quote.blankName||'Select blank from library';
  updateQuoteActionPriority();
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
  if($('quotePreviewName'))$('quotePreviewName').textContent='Customer Quote';
  if($('quotePreviewBuild'))$('quotePreviewBuild').textContent=quote.buildNumber||'Unnumbered quote';
  if($('quotePreviewCustomer'))$('quotePreviewCustomer').textContent=[quote.customerName,quote.phone,quote.email].filter(Boolean).join(' • ')||'No customer details entered';
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
  const demoKey='build 032 demo softbait';
  const existing=blanks.find((blank)=>normalizeNameKey(blank&&blank.model)===demoKey);
  const incoming=normalizeBlank({
    id:existing?existing.id:generateId('blank'),
    maker:'K-Labs',
    series:'Demo Series',
    model:'Build 032 Demo Softbait',
    length:"7'4",
    power:'MH',
    action:'Fast',
    pieces:'2',
    cost:438,
    sku:'DEMO-032-SB74',
    notes:'Offline demo blank for BUILD 032 validation.',
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
    buildName:'Build 032 Demo Softbait',
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
  const filtered=blanks.filter((blank)=>blankMatchesSearch(blank,blankLibrarySearch));
  if(!filtered.length){
    host.innerHTML='<div class="empty-card">No blanks match your search.</div>';
    return;
  }
  host.innerHTML=filtered.map((blank)=>{
    const idx=blanks.findIndex((item)=>item.id===blank.id);
    const archiveTag=blank.archived?'<small class="blank-card__archive">Archived</small>':'';
    const actions=blank.archived
      ?`<button class="ghost-action" data-blank-action="restore" data-blank-id="${escapeHtml(blank.id)}" type="button">Restore</button>`
      :`<button class="ghost-action" data-blank-action="load" data-blank-id="${escapeHtml(blank.id)}" data-blank-index="${idx}" type="button">Load</button><button class="ghost-action" data-blank-action="edit" data-blank-id="${escapeHtml(blank.id)}" type="button">Edit</button><button class="ghost-action" data-blank-action="duplicate" data-blank-id="${escapeHtml(blank.id)}" type="button">Duplicate</button><button class="ghost-action" data-blank-action="delete" data-blank-id="${escapeHtml(blank.id)}" type="button">Delete</button>`;
    return `<article class="module-card blank-card"><span>${escapeHtml(blank.maker||'Blank')}</span><strong>${escapeHtml(blankDisplayName(blank))}</strong><em>${escapeHtml(blank.series||'Series n/a')} • ${escapeHtml(blank.length||'Length n/a')} • ${escapeHtml(blank.power||'Power n/a')} • ${escapeHtml(blank.action||'Action n/a')}</em><em>First ${blank.fg} mm • Guides ${blank.gc} • Target ${blank.ts} mm • Cost ${currency(blank.cost)}</em>${archiveTag}<div class="blank-card__actions">${actions}</div></article>`;
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
      const button=event.target.closest('[data-blank-action]');
      if(!button)return;
      const action=button.getAttribute('data-blank-action');
      const blankId=button.getAttribute('data-blank-id')||'';
      const blank=findBlankById(blankId);
      if(!blank)return;
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
  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(field && controlMeta[field]){el.textContent=String(state[controlMeta[field].key]);}
  });
  const guideSpacingCards=$('guideSpacingCards');
  if(guideSpacingCards){
    guideSpacingCards.innerHTML=r.rows.map((row,i)=>`
      <article class="guide-spacing-row" data-guide-index="${i}">
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
  if(statusBadge){statusBadge.textContent='Live';}
  const row=r.rows[Math.max(0,Math.min(state.workshopIndex,r.rows.length-1))]||r.rows[0];
  if($('workshopProgress'))$('workshopProgress').textContent='Guide '+row.g+' of '+state.guideCount;
  if($('workshopGuide'))$('workshopGuide').textContent='Guide '+row.g;
  if($('workshopMeasure'))$('workshopMeasure').textContent=row.cum.toFixed(1);
  if($('workshopSpacing'))$('workshopSpacing').textContent='Spacing from previous: '+row.spacing.toFixed(1)+' mm';
  if(window.StudioVisuals && typeof window.StudioVisuals.update==='function'){window.StudioVisuals.update(r,state);}
  renderWorkshopQuote();
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
bindBlankLibraryControls();
bindSettingsControls();
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks,loadDemoBuild};
