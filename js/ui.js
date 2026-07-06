const $=id=>document.getElementById(id);
let state=Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0});
const blanks=[{maker:'K-Labs',model:"7'2 Softbait",fg:105,gc:9,ts:1260},{maker:'CD',model:'Haku PE3–6',fg:110,gc:10,ts:1350},{maker:'K-Labs',model:"7'0 Softbait",fg:100,gc:9,ts:1240}];

function save(){Store.set('klabs-studio-state',state)}
function clampValue(value,min,max){const parsed=Number(value);if(!Number.isFinite(parsed))return min;return Math.min(max,Math.max(min,Math.round(parsed)))}
function buildWheels(){return null}
function syncStateFromInputs(){
  const firstGuideInput=$('firstGuideInput');
  const guideCountInput=$('guideCountInput');
  const targetStripperInput=$('targetStripperInput');
  if(firstGuideInput){state.firstGuide=clampValue(firstGuideInput.value,50,300)}
  if(guideCountInput){state.guideCount=clampValue(guideCountInput.value,5,20)}
  if(targetStripperInput){state.targetStripper=clampValue(targetStripperInput.value,500,2500)}
  save();
  render();
}
function render(){
  const r=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  const firstGuideInput=$('firstGuideInput');
  const guideCountInput=$('guideCountInput');
  const targetStripperInput=$('targetStripperInput');
  if(firstGuideInput)firstGuideInput.value=state.firstGuide;
  if(guideCountInput)guideCountInput.value=state.guideCount;
  if(targetStripperInput)targetStripperInput.value=state.targetStripper;
  const guideSpacingCards=$('guideSpacingCards');
  if(guideSpacingCards){
    guideSpacingCards.innerHTML=r.rows.map((row)=>`
      <article class="premium-spacing-row">
        <div class="premium-spacing-row__meta">
          <span>Guide ${row.g}</span>
          <small>Position ${row.cum.toFixed(1)} mm</small>
        </div>
        <strong>${row.spacing.toFixed(1)} mm</strong>
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
}
function loadBlank(i){
  const b=blanks[i];
  state.firstGuide=b.fg;state.guideCount=b.gc;state.targetStripper=b.ts;state.locked=false;state.workshopIndex=0;
  save();render();goScreen('layoutScreen');
}
function renderBlanks(){$('blankCards').innerHTML=blanks.map((b,i)=>`<button class="module-card" onclick="loadBlank(${i})"><span>${b.maker}</span><strong>${b.model}</strong><em>First ${b.fg} mm • Guides ${b.gc} • Target ${b.ts} mm</em><b>›</b></button>`).join('')}
function bindLayoutInputs(){
  ['firstGuideInput','guideCountInput','targetStripperInput'].forEach((id)=>{
    const el=$(id);
    if(!el)return;
    el.addEventListener('input',syncStateFromInputs);
    el.addEventListener('change',syncStateFromInputs);
  });
  const calculateButton=$('calculateLayoutBtn');
  if(calculateButton){calculateButton.addEventListener('click',syncStateFromInputs);} 
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
bindLayoutInputs();
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks};
