const $=id=>document.getElementById(id);
let state=Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0});
let quote=Store.get('klabs-workshop-quote-current',null)||newQuoteTemplate();
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
    labourRate:0,labourHours:0,marginPercent:0
  };
}
function quoteMaths(){
  const blankCost=numberOrZero(quote.blankCost);
  const componentCost=quote.components.reduce((sum,item)=>sum+(numberOrZero(item.cost)*numberOrZero(item.qty)),0);
  const materialCost=blankCost+componentCost;
  const labourCost=numberOrZero(quote.labourRate)*numberOrZero(quote.labourHours);
  const subtotal=materialCost+labourCost;
  const marginAmount=subtotal*(numberOrZero(quote.marginPercent)/100);
  const sellBeforeGst=subtotal+marginAmount;
  const gst=sellBeforeGst*0.15;
  const total=sellBeforeGst+gst;
  const profit=marginAmount;
  return{materialCost,labourCost,subtotal,gst,total,profit};
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
    el.addEventListener('input',()=>{
      quote[key]=isNumeric?numberOrZero(el.value):el.value;
      saveQuoteCurrent();
      renderWorkshopQuote();
    });
  });
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
      renderWorkshopQuote();
    });
  }
  const addComponentBtn=$('addComponentBtn');
  if(addComponentBtn){
    addComponentBtn.addEventListener('click',()=>{
      quote.components.push({name:'',supplier:'',cost:0,qty:1});
      saveQuoteCurrent();
      renderWorkshopQuote();
    });
  }
  const removeComponentBtn=$('removeComponentBtn');
  if(removeComponentBtn){
    removeComponentBtn.addEventListener('click',()=>{
      if(quote.components.length>1){quote.components.pop();}
      else{quote.components[0]={name:'',supplier:'',cost:0,qty:1};}
      saveQuoteCurrent();
      renderWorkshopQuote();
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
  const componentsList=$('quoteComponentsList');
  if(componentsList){
    componentsList.innerHTML=quote.components.map((item,i)=>`
      <div class="quote-component-row">
        <label><span>Component Name</span><input data-component-index="${i}" data-component-key="name" type="text" value="${(item.name||'').replace(/"/g,'&quot;')}" placeholder="Component" /></label>
        <label><span>Supplier</span><input data-component-index="${i}" data-component-key="supplier" type="text" value="${(item.supplier||'').replace(/"/g,'&quot;')}" placeholder="Supplier" /></label>
        <label><span>Cost</span><input data-component-index="${i}" data-component-key="cost" type="number" min="0" step="0.01" value="${numberOrZero(item.cost)}" /></label>
        <label><span>Quantity</span><input data-component-index="${i}" data-component-key="qty" type="number" min="0" step="1" value="${numberOrZero(item.qty)}" /></label>
      </div>
    `).join('');
  }
  const math=quoteMaths();
  if($('quoteLabourCost'))$('quoteLabourCost').value=currency(math.labourCost);
  if($('quoteMaterialCost'))$('quoteMaterialCost').value=currency(math.materialCost);
  if($('quoteSummaryLabourCost'))$('quoteSummaryLabourCost').value=currency(math.labourCost);
  if($('quoteSubtotal'))$('quoteSubtotal').value=currency(math.subtotal);
  if($('quoteGst'))$('quoteGst').value=currency(math.gst);
  if($('quoteTotal'))$('quoteTotal').value=currency(math.total);
  if($('quoteProfit'))$('quoteProfit').value=currency(math.profit);
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
