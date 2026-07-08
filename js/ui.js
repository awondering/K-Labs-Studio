const $=id=>document.getElementById(id);
let state=Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0});
const DEFAULT_COMPONENT_NAMES=['Blank','Reel Seat','Rear Grip','Fore Grip','Butt Cap','Guides','Tip Top','Hook Keeper','Thread','Trim Rings','Winding Checks','Decals','Epoxy','Cork','EVA Grip','Carbon Grip','Miscellaneous'];
const CUSTOM_COMPONENT_STORAGE_KEY='klabs-workshop-custom-components';
let quote=normalizeQuote(Store.get('klabs-workshop-quote-current',null)||newQuoteTemplate());
const blanks=[{maker:'K-Labs',model:"7'2 Softbait",fg:105,gc:9,ts:1260},{maker:'CD',model:'Haku PE3–6',fg:110,gc:10,ts:1350},{maker:'K-Labs',model:"7'0 Softbait",fg:100,gc:9,ts:1240}];
const controlMeta={guideCount:{key:'guideCount',min:5,max:20,step:1},firstGuide:{key:'firstGuide',min:50,max:300,step:1},targetStripper:{key:'targetStripper',min:500,max:2500,step:1}};
let holdTimer=null;

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
    labourRate:0,labourHours:0,marginPercent:0,includeGst:true
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
function normalizeQuote(inputQuote){
  const base=newQuoteTemplate();
  const merged={...base,...(inputQuote||{})};
  const components=Array.isArray(inputQuote&&inputQuote.components)&&inputQuote.components.length?inputQuote.components:[{name:'',supplier:'',cost:0,qty:1}];
  merged.components=components.map(normalizeComponent);
  merged.includeGst=(inputQuote&&typeof inputQuote.includeGst==='boolean')?inputQuote.includeGst:true;
  return merged;
}
function quoteMaths(){
  const blankCost=numberOrZero(quote.blankCost);
  const componentCost=quote.components.reduce((sum,item)=>sum+(numberOrZero(item.cost)*numberOrZero(item.qty)),0);
  const materialCost=blankCost+componentCost;
  const labourCost=numberOrZero(quote.labourRate)*numberOrZero(quote.labourHours);
  const costBeforeMargin=materialCost+labourCost;
  const marginAmount=costBeforeMargin*(numberOrZero(quote.marginPercent)/100);
  const subtotal=costBeforeMargin+marginAmount;
  const gst=(quote.includeGst!==false)?(subtotal*0.15):0;
  const total=subtotal+gst;
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
function normalizeNameKey(name){
  return String(name||'').trim().toLowerCase();
}
function allComponentNameOptions(){
  const defaults=DEFAULT_COMPONENT_NAMES.slice();
  const defaultKeys=new Set(defaults.map(normalizeNameKey));
  const customs=getCustomComponentNames().filter((name)=>!defaultKeys.has(normalizeNameKey(name)));
  return defaults.concat(customs);
}
function renderComponentNameOptions(){
  const options=$('quoteComponentNameOptions');
  if(!options)return;
  options.innerHTML=allComponentNameOptions().map((name)=>`<option value="${escapeHtml(name)}"></option>`).join('');
}
function renderQuoteComponents(){
  const componentsList=$('quoteComponentsList');
  if(!componentsList)return;
  componentsList.innerHTML=quote.components.map((item,i)=>`
      <div class="quote-component-row">
        <label class="quote-component-name"><span>Component Name</span><div class="quote-component-name__controls"><input data-component-index="${i}" data-component-key="name" type="text" list="quoteComponentNameOptions" value="${escapeHtml(item.name||'')}" placeholder="Type or select component" /><button class="quote-mini-btn" data-component-action="save-name" data-component-index="${i}" type="button" aria-label="Save component name">+</button><button class="quote-mini-btn" data-component-action="delete-name" data-component-index="${i}" type="button" aria-label="Delete custom component name">-</button></div></label>
        <label><span>Supplier</span><input data-component-index="${i}" data-component-key="supplier" type="text" value="${escapeHtml(item.supplier||'')}" placeholder="Supplier" /></label>
        <label><span>Cost</span><input data-component-index="${i}" data-component-key="cost" type="number" min="0" step="0.01" value="${numberOrZero(item.cost)}" /></label>
        <label><span>Quantity</span><input data-component-index="${i}" data-component-key="qty" type="number" min="0" step="1" value="${numberOrZero(item.qty)}" /></label>
      </div>
    `).join('');
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
  const componentsList=$('quoteComponentsList');
  if(componentsList){
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
      if(!actionButton)return;
      const i=Number(actionButton.getAttribute('data-component-index'));
      const component=quote.components[i];
      if(!component)return;
      const name=(component.name||'').trim();
      if(!name)return;
      const action=actionButton.getAttribute('data-component-action');
      const customNames=getCustomComponentNames();
      const customKeys=new Set(customNames.map(normalizeNameKey));
      const defaultKeys=new Set(DEFAULT_COMPONENT_NAMES.map(normalizeNameKey));
      if(action==='save-name'){
        if(!defaultKeys.has(normalizeNameKey(name)) && !customKeys.has(normalizeNameKey(name))){
          customNames.push(name);
          saveCustomComponentNames(customNames);
          renderComponentNameOptions();
        }
      }
      if(action==='delete-name'){
        const nextNames=customNames.filter((value)=>normalizeNameKey(value)!==normalizeNameKey(name));
        saveCustomComponentNames(nextNames);
        renderComponentNameOptions();
      }
    });
  }
  const addComponentBtn=$('addComponentBtn');
  if(addComponentBtn){
    addComponentBtn.addEventListener('click',()=>{
      quote.components.push({name:'',supplier:'',cost:0,qty:1});
      saveQuoteCurrent();
      renderQuoteComponents();
      updateQuoteSummary();
    });
  }
  const removeComponentBtn=$('removeComponentBtn');
  if(removeComponentBtn){
    removeComponentBtn.addEventListener('click',()=>{
      if(quote.components.length>1){quote.components.pop();}
      else{quote.components[0]={name:'',supplier:'',cost:0,qty:1};}
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
    btn.addEventListener('click',()=>alert('Coming soon'));
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
  renderComponentNameOptions();
  const activeElement=document.activeElement;
  const isEditingComponent=!!(activeElement&&activeElement.closest&&activeElement.closest('#quoteComponentsList'));
  if(!isEditingComponent){renderQuoteComponents();}
  updateQuoteSummary();
}
function updateQuoteSummary(){
  const math=quoteMaths();
  if($('quoteLabourCost'))$('quoteLabourCost').value=currency(math.labourCost);
  if($('quoteMaterialCost'))$('quoteMaterialCost').value=currency(math.materialCost);
  if($('quoteCostBeforeMargin'))$('quoteCostBeforeMargin').value=currency(math.costBeforeMargin);
  if($('quoteSummaryLabourCost'))$('quoteSummaryLabourCost').value=currency(math.labourCost);
  if($('quoteSubtotal'))$('quoteSubtotal').value=currency(math.subtotal);
  if($('quoteGst'))$('quoteGst').value=currency(math.gst);
  if($('quoteTotal'))$('quoteTotal').value=currency(math.total);
  if($('quoteProfit'))$('quoteProfit').value=currency(math.profit);
  const gstField=$('quoteGstField');
  const gstStatus=$('quoteGstStatus');
  if(gstField){gstField.classList.toggle('quote-field--muted',quote.includeGst===false);}
  if(gstStatus){gstStatus.textContent=quote.includeGst===false?'GST excluded from total.':'GST included in total.';}
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
