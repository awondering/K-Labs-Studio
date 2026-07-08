const $=id=>document.getElementById(id);
let state=Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0});
const DEFAULT_COMPONENT_NAMES=['Reel Seat','Rear Grip','Fore Grip','Butt Cap','Guides','Tip Top','Hook Keeper','Thread','Trim Rings','Winding Checks','Decals','Epoxy','Cork','EVA Grip','Carbon Grip','Miscellaneous'];
const DEFAULT_SUPPLIER_NAMES=['K-Labs','CD Rods','Fuji','Batson Enterprises','Pacific Bay','Alps','Seahawk','Generic'];
const CUSTOM_COMPONENT_STORAGE_KEY='klabs-workshop-custom-components';
const CUSTOM_SUPPLIER_STORAGE_KEY='klabs-workshop-custom-suppliers';
let quote=normalizeQuote(Store.get('klabs-workshop-quote-current',null)||newQuoteTemplate());
const blanks=[{maker:'K-Labs',model:"7'2 Softbait",fg:105,gc:9,ts:1260},{maker:'CD',model:'Haku PE3–6',fg:110,gc:10,ts:1350},{maker:'K-Labs',model:"7'0 Softbait",fg:100,gc:9,ts:1240}];
const controlMeta={guideCount:{key:'guideCount',min:5,max:20,step:1},firstGuide:{key:'firstGuide',min:50,max:300,step:1},targetStripper:{key:'targetStripper',min:500,max:2500,step:1}};
let holdTimer=null;
let activeChoicePicker={type:'component',index:-1};
let shouldAnimateComponentRows=false;

function save(){Store.set('klabs-studio-state',state)}
function saveQuoteCurrent(){Store.set('klabs-workshop-quote-current',quote)}
function numberOrZero(value){const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function currency(value){return '$'+numberOrZero(value).toFixed(2)}
function newQuoteTemplate(){
  return{
    buildNumber:'',
    customerName:'',phone:'',email:'',buildName:'',notes:'',
    blankName:'',blankLength:'',blankPower:'',blankAction:'',blankCost:0,
    components:[{name:'',supplier:'',cost:0,qty:1}],
    labourRate:0,labourHours:0,marginPercent:0,includeGst:true,quoteMode:'internal',gstRate:15
  };
}
function normalizeComponent(component){
  const parsedQty=Number(component&&component.qty);
  return{
    name:(component&&typeof component.name==='string')?component.name:'',
    supplier:(component&&typeof component.supplier==='string')?component.supplier:'',
    cost:numberOrZero(component&&component.cost),
    qty:Number.isFinite(parsedQty)&&parsedQty>=0?parsedQty:1
  };
}
function normalizeQuoteMode(value){
  return String(value||'').toLowerCase()==='customer'?'customer':'internal';
}
function normalizeQuote(inputQuote){
  const base=newQuoteTemplate();
  const merged={...base,...(inputQuote||{})};
  const components=Array.isArray(inputQuote&&inputQuote.components)&&inputQuote.components.length?inputQuote.components:[{name:'',supplier:'',cost:0,qty:1}];
  merged.components=components.map(normalizeComponent);
  merged.includeGst=(inputQuote&&typeof inputQuote.includeGst==='boolean')?inputQuote.includeGst:true;
  merged.quoteMode=normalizeQuoteMode(inputQuote&&inputQuote.quoteMode);
  merged.gstRate=numberOrZero(inputQuote&&inputQuote.gstRate)||15;
  return merged;
}
function quoteMaths(){
  const blankCost=numberOrZero(quote.blankCost);
  const componentCost=quote.components.reduce((sum,item)=>{
    if(normalizeNameKey(item&&item.name)==='blank')return sum;
    return sum+(numberOrZero(item.cost)*numberOrZero(item.qty));
  },0);
  const materialCost=blankCost+componentCost;
  const labourCost=numberOrZero(quote.labourRate)*numberOrZero(quote.labourHours);
  const costBeforeMargin=materialCost+labourCost;
  const marginAmount=costBeforeMargin*(numberOrZero(quote.marginPercent)/100);
  const subtotal=costBeforeMargin+marginAmount;
  const gstRate=numberOrZero(quote.gstRate)||15;
  const gst=(quote.includeGst!==false)?(subtotal-(subtotal/(1+(gstRate/100)))):0;
  const total=subtotal;
  const profit=marginAmount;
  return{materialCost,labourCost,costBeforeMargin,marginAmount,subtotal,gst,total,profit};
}
function escapeHtml(value){
  return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function getCustomComponentNames(){
  const stored=Store.get(CUSTOM_COMPONENT_STORAGE_KEY,[]);
  if(!Array.isArray(stored))return[];
  return Array.from(new Set(stored.map((name)=>String(name||'').trim()).filter(Boolean)));
}
function saveCustomComponentNames(names){
  Store.set(CUSTOM_COMPONENT_STORAGE_KEY,Array.from(new Set(names.map((name)=>String(name||'').trim()).filter(Boolean))));
}
function getCustomSupplierNames(){
  const stored=Store.get(CUSTOM_SUPPLIER_STORAGE_KEY,[]);
  if(!Array.isArray(stored))return[];
  return Array.from(new Set(stored.map((name)=>String(name||'').trim()).filter(Boolean)));
}
function saveCustomSupplierNames(names){
  Store.set(CUSTOM_SUPPLIER_STORAGE_KEY,Array.from(new Set(names.map((name)=>String(name||'').trim()).filter(Boolean))));
}
function normalizeNameKey(name){
  return String(name||'').trim().toLowerCase();
}
function allComponentNameOptions(){
  const defaults=DEFAULT_COMPONENT_NAMES.slice();
  const defaultKeys=new Set(defaults.map(normalizeNameKey));
  const customs=getCustomComponentNames().filter((name)=>!defaultKeys.has(normalizeNameKey(name)));
  return defaults.concat(customs);
}
function componentOptionRecords(query){
  const defaults=DEFAULT_COMPONENT_NAMES.map((name)=>({name,isCustom:false}));
  const customNames=getCustomComponentNames().map((name)=>({name,isCustom:true}));
  const all=defaults.concat(customNames);
  const normalized=normalizeNameKey(query);
  return all.filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
}
function supplierOptionRecords(query){
  const defaults=DEFAULT_SUPPLIER_NAMES.map((name)=>({name,isCustom:false}));
  const customNames=getCustomSupplierNames().map((name)=>({name,isCustom:true}));
  const all=defaults.concat(customNames);
  const normalized=normalizeNameKey(query);
  return all.filter((item)=>!normalized || normalizeNameKey(item.name).includes(normalized));
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
      applyChoiceSelection(selectedName);
      closeComponentSheet();
    }
    const deleteButton=event.target.closest('button[data-choice-delete-option]');
    if(deleteButton){
      deleteCustomChoice(deleteButton.getAttribute('data-choice-delete-option')||'');
      renderChoicePickerOptions($('choicePickerSearch').value);
    }
  });

  $('choicePickerSearch').addEventListener('input',()=>renderChoicePickerOptions($('choicePickerSearch').value));
  $('choicePickerAdd').addEventListener('click',()=>{
    const customBox=$('choicePickerCustomBox');
    const customInput=$('choicePickerCustomInput');
    if(customBox && customInput){customBox.hidden=false;customInput.value='';customInput.focus();}
  });
  $('choicePickerCustomCancel').addEventListener('click',()=>{
    const customBox=$('choicePickerCustomBox');
    if(customBox){customBox.hidden=true;}
  });
  $('choicePickerCustomSave').addEventListener('click',()=>{
    const customInput=$('choicePickerCustomInput');
    const name=(customInput?customInput.value:'').trim();
    if(!name)return;
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
function addCustomChoice(name){
  const normalized=normalizeNameKey(name);
  if(activeChoicePicker.type==='supplier'){
    const defaultKeys=new Set(DEFAULT_SUPPLIER_NAMES.map(normalizeNameKey));
    const customNames=getCustomSupplierNames();
    if(!defaultKeys.has(normalized) && !customNames.some((value)=>normalizeNameKey(value)===normalized)){
      customNames.push(name);
      saveCustomSupplierNames(customNames);
    }
    return;
  }
  const defaultKeys=new Set(DEFAULT_COMPONENT_NAMES.map(normalizeNameKey));
  const customNames=getCustomComponentNames();
  if(!defaultKeys.has(normalized) && !customNames.some((value)=>normalizeNameKey(value)===normalized)){
    customNames.push(name);
    saveCustomComponentNames(customNames);
  }
}
function deleteCustomChoice(optionName){
  if(activeChoicePicker.type==='supplier'){
    const nextNames=getCustomSupplierNames().filter((value)=>normalizeNameKey(value)!==normalizeNameKey(optionName));
    saveCustomSupplierNames(nextNames);
  }else{
    const nextNames=getCustomComponentNames().filter((value)=>normalizeNameKey(value)!==normalizeNameKey(optionName));
    saveCustomComponentNames(nextNames);
  }
  if(activeChoicePicker.index>=0 && quote.components[activeChoicePicker.index] && normalizeNameKey(getChoiceValue(activeChoicePicker.type,quote.components[activeChoicePicker.index]))===normalizeNameKey(optionName)){
    setChoiceValue(activeChoicePicker.type,activeChoicePicker.index,'');
    renderQuoteComponents();
    updateQuoteSummary();
  }
}
function getChoiceValue(type,item){
  return type==='supplier'?(item&&item.supplier)||'':(item&&item.name)||'';
}
function setChoiceValue(type,index,value){
  if(!quote.components[index])return;
  if(type==='supplier'){
    quote.components[index].supplier=value;
  }else{
    quote.components[index].name=value;
  }
  saveQuoteCurrent();
}
function applyChoiceSelection(selectedName){
  if(activeChoicePicker.index>=0){setChoiceValue(activeChoicePicker.type,activeChoicePicker.index,selectedName);renderQuoteComponents();updateQuoteSummary();}
}
function renderChoicePickerOptions(query){
  const list=$('choicePickerList');
  if(!list)return;
  const options=(activeChoicePicker.type==='supplier'?supplierOptionRecords(query):componentOptionRecords(query)).slice(0,30);
  if(!options.length){
    list.innerHTML='<div class="component-sheet__empty">No matching items</div>';
    return;
  }
  list.innerHTML=options.map((item)=>`<div class="component-sheet__row"><button class="component-sheet__option" data-choice-option="${escapeHtml(item.name)}" type="button">${escapeHtml(item.name)}</button>${item.isCustom?`<button class="component-sheet__delete" data-choice-delete-option="${escapeHtml(item.name)}" type="button" aria-label="Delete custom ${activeChoicePicker.type}">Delete</button>`:''}</div>`).join('');
}
function setComponentName(index,name){
  if(!quote.components[index])return;
  quote.components[index].name=name;
  saveQuoteCurrent();
}
function defaultComponentRow(){
  return{name:'',supplier:'',cost:0,qty:1};
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
  renderQuoteComponents();
  updateQuoteSummary();
}
function openComponentSheet(index){
  openChoicePicker('component',index);
}
function openSupplierSheet(index){
  openChoicePicker('supplier',index);
}
function openChoicePicker(type,index){
  ensureChoicePicker();
  activeChoicePicker={type,index};
  const sheet=$('choicePickerSheet');
  if(!sheet)return;
  sheet.hidden=false;
  document.body.classList.add('component-sheet-open');
  if($('choicePickerCustomBox'))$('choicePickerCustomBox').hidden=true;
  if($('choicePickerSearch'))$('choicePickerSearch').value='';
  if($('choicePickerTitle'))$('choicePickerTitle').textContent=type==='supplier'?'Select Supplier':'Select Component';
  if($('choicePickerAdd'))$('choicePickerAdd').textContent=type==='supplier'?'+ Add Custom Supplier':'+ Add Custom Component';
  if($('choicePickerCustomInput'))$('choicePickerCustomInput').placeholder=type==='supplier'?'New supplier name':'New component name';
  renderChoicePickerOptions('');
  if($('choicePickerSearch'))$('choicePickerSearch').focus();
}
function closeComponentSheet(){
  const sheet=$('choicePickerSheet');
  if(!sheet)return;
  sheet.hidden=true;
  activeChoicePicker={type:'component',index:-1};
  document.body.classList.remove('component-sheet-open');
}
function renderQuoteComponents(){
  const componentsList=$('quoteComponentsList');
  if(!componentsList)return;
  const animateClass=shouldAnimateComponentRows?' quote-component-row--shift':'';
  componentsList.innerHTML=quote.components.map((item,i)=>`
      <div class="quote-component-row${animateClass}">
        <label class="quote-component-name"><span>Component Name</span><button class="quote-component-picker__trigger" data-component-action="open-component-sheet" data-component-index="${i}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.name||'Select component')}</span><b>▾</b></button></label>
        <label class="quote-component-name"><span>Supplier</span><button class="quote-component-picker__trigger" data-component-action="open-supplier-sheet" data-component-index="${i}" type="button" aria-haspopup="dialog"><span class="quote-component-picker__value">${escapeHtml(item.supplier||'Select supplier')}</span><b>▾</b></button></label>
        <label><span>Cost</span><input data-component-index="${i}" data-component-key="cost" type="number" min="0" step="0.01" value="${numberOrZero(item.cost)}" /></label>
        <label><span>Quantity</span><input data-component-index="${i}" data-component-key="qty" type="number" min="0" step="1" value="${numberOrZero(item.qty)}" /></label>
        <button class="component-row-delete" data-component-action="delete-row" data-component-index="${i}" type="button" aria-label="Delete component row">✕</button>
      </div>
    `).join('');
  shouldAnimateComponentRows=false;
}
function persistQuoteRecord(currentQuote){
  const savedAt=new Date().toISOString();
  const records=Store.get('klabs-workshop-quotes',[]);
  const record={...currentQuote,savedAt};
  records.unshift(record);
  Store.set('klabs-workshop-quotes',records);
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
    ['quoteBlankName','blankName'],['quoteBlankLength','blankLength'],['quoteBlankPower','blankPower'],['quoteBlankAction','blankAction'],
    ['quoteBlankCost','blankCost'],['quoteLabourRate','labourRate'],['quoteLabourHours','labourHours'],['quoteMarginPercent','marginPercent']
  ];
}
function bindWorkshopQuoteBuilder(){
  workshopInputMap().forEach(([id,key])=>{
    const el=$(id);
    if(!el)return;
    const isNumeric=['blankCost','labourRate','labourHours','marginPercent'].includes(key);
    const onFieldUpdate=()=>{
      quote[key]=isNumeric?numberOrZero(el.value):el.value;
      saveQuoteCurrent();
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
      updateQuoteSummary();
    });
  }
  document.querySelectorAll('[data-quote-mode]').forEach((button)=>{
    button.addEventListener('click',()=>{
      quote.quoteMode=normalizeQuoteMode(button.getAttribute('data-quote-mode'));
      saveQuoteCurrent();
      renderWorkshopQuote();
    });
  });
  const componentsList=$('quoteComponentsList');
  if(componentsList){
    ensureChoicePicker();
    componentsList.addEventListener('input',(event)=>{
      const input=event.target.closest('[data-component-index]');
      if(!input)return;
      const i=Number(input.getAttribute('data-component-index'));
      const key=input.getAttribute('data-component-key');
      if(!quote.components[i] || !key)return;
      quote.components[i][key]=['cost','qty'].includes(key)?numberOrZero(input.value):input.value;
      saveQuoteCurrent();
      updateQuoteSummary();
    });
    componentsList.addEventListener('click',(event)=>{
      const actionButton=event.target.closest('[data-component-action]');
      const action=actionButton?actionButton.getAttribute('data-component-action'):'';
      if(action==='open-component-sheet'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        openComponentSheet(i);
      }
      if(action==='open-supplier-sheet'){
        const i=Number(actionButton.getAttribute('data-component-index'));
        openSupplierSheet(i);
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
      saveQuoteCurrent();
      renderQuoteComponents();
      updateQuoteSummary();
    });
  }
  const saveQuoteBtn=$('saveQuoteBtn');
  if(saveQuoteBtn){
    saveQuoteBtn.addEventListener('click',()=>{
      if(!quote.buildNumber){quote.buildNumber=nextBuildNumber();}
      saveQuoteCurrent();
      persistQuoteRecord(quote);
      alert('Quote saved.');
    });
  }
  const convertToBuildBtn=$('convertToBuildBtn');
  if(convertToBuildBtn){
    convertToBuildBtn.addEventListener('click',()=>{
      if(!quote.buildNumber){quote.buildNumber=nextBuildNumber();}
      saveQuoteCurrent();
      persistQuoteRecord(quote);
      goScreen('layoutScreen');
    });
  }
  ['duplicateQuoteBtn','printQuoteBtn','exportPdfBtn','emailQuoteBtn'].forEach((id)=>{
    const btn=$(id);
    if(!btn)return;
    btn.addEventListener('click',()=>{
      if(id==='emailQuoteBtn' && normalizeQuoteMode(quote.quoteMode)==='customer'){
        openQuotePreviewSheet('email');
        return;
      }
      alert('Coming soon');
    });
  });
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
  if($('quoteBuilderTitle'))$('quoteBuilderTitle').textContent=mode==='customer'?'Customer Quote':'Rod Builder Quote';
  if($('quoteBuilderSubhead'))$('quoteBuilderSubhead').textContent=mode==='customer'?'Customer-ready pricing view • internal figures hidden':'Customer • Blank • Components • Labour • Margin • Quote Summary';
  if($('emailQuoteBtn'))$('emailQuoteBtn').textContent=mode==='customer'?'Preview & Email Quote':'Email Quote';
  const activeElement=document.activeElement;
  const isEditingComponent=!!(activeElement&&activeElement.closest&&activeElement.closest('#quoteComponentsList'));
  if(!isEditingComponent){renderQuoteComponents();}
  updateQuoteSummary();
}
function updateQuoteSummary(){
  const math=quoteMaths();
  const mode=normalizeQuoteMode(quote.quoteMode);
  if($('quoteLabourCost'))$('quoteLabourCost').value=currency(math.labourCost);
  if($('quoteMaterialCost'))$('quoteMaterialCost').value=currency(math.materialCost);
  if($('quoteCostBeforeMargin'))$('quoteCostBeforeMargin').value=currency(math.costBeforeMargin);
  if($('quoteSummaryLabourCost'))$('quoteSummaryLabourCost').value=currency(math.labourCost);
  if($('quoteSubtotal'))$('quoteSubtotal').value=currency(math.subtotal);
  if($('quoteGst'))$('quoteGst').value=currency(math.gst);
  if($('quoteTotal'))$('quoteTotal').value=currency(math.total);
  if($('quoteProfit'))$('quoteProfit').value=currency(math.profit);
  if($('quoteModeLabel'))$('quoteModeLabel').textContent=mode==='customer'?'Customer Quote':'Internal Quote';
  const gstField=$('quoteGstField');
  const gstStatus=$('quoteGstStatus');
  if(gstField){gstField.classList.toggle('quote-field--muted',quote.includeGst===false);gstField.hidden=mode==='customer';}
  if(gstStatus){gstStatus.textContent=quote.includeGst===false?'GST not included in displayed price.':'GST included in displayed price.';gstStatus.hidden=mode==='customer';}
  ['quoteSubtotalField','quoteMaterialCostField','quoteLabourCostField','quoteCostBeforeMarginField','quoteMarginPercentField','quoteProfitField'].forEach((id)=>{const el=$(id);if(el)el.hidden=mode==='customer';});
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
  if($('quotePreviewName'))$('quotePreviewName').textContent='Customer Quote';
  if($('quotePreviewBuild'))$('quotePreviewBuild').textContent=quote.buildNumber||'Unnumbered quote';
  if($('quotePreviewCustomer'))$('quotePreviewCustomer').textContent=[quote.customerName,quote.phone,quote.email].filter(Boolean).join(' • ')||'No customer details entered';
  if($('quotePreviewBuildName'))$('quotePreviewBuildName').textContent=quote.buildName||'No build name entered';
  if($('quotePreviewSummary'))$('quotePreviewSummary').innerHTML=`
    <div><span>Total Quote Price</span><strong>${currency(math.total)}</strong></div>
    <div><span>GST</span><strong>${quote.includeGst===false?'Not Included':currency(math.gst)}</strong></div>
    <div><span>Quote Type</span><strong>${normalizeQuoteMode(quote.quoteMode)==='customer'?'Customer Quote':'Internal Quote'}</strong></div>
  `;
}
function openQuotePreviewSheet(action){
  ensureQuotePreviewSheet();
  renderQuotePreviewSheet();
  const sheet=$('quotePreviewSheet');
  if(!sheet)return;
  sheet.hidden=false;
  document.body.classList.add('component-sheet-open');
}
function closeQuotePreviewSheet(){
  const sheet=$('quotePreviewSheet');
  if(!sheet)return;
  sheet.hidden=true;
  document.body.classList.remove('component-sheet-open');
}
function render(){
  const r=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  document.querySelectorAll('.layout-control-card__value[data-field]').forEach((el)=>{
    const field=el.getAttribute('data-field');
    if(field && controlMeta[field]){el.textContent=String(state[controlMeta[field].key]);}
  });
  const guideSpacingCards=$('guideSpacingCards');
  if(guideSpacingCards){
    guideSpacingCards.innerHTML=r.rows.map((row)=>`
      <article class="guide-spacing-row">
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
  renderWorkshopQuote();
}
function loadBlank(i){
  const b=blanks[i];
  state.firstGuide=b.fg;state.guideCount=b.gc;state.targetStripper=b.ts;state.locked=false;state.workshopIndex=0;
  save();render();goScreen('layoutScreen');
}
function renderBlanks(){$('blankCards').innerHTML=blanks.map((b,i)=>`<button class="module-card" onclick="loadBlank(${i})"><span>${b.maker}</span><strong>${b.model}</strong><em>First ${b.fg} mm • Guides ${b.gc} • Target ${b.ts} mm</em><b>›</b></button>`).join('')}
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
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks};
