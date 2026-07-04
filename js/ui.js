const $=id=>document.getElementById(id);
let state=Store.get('klabs-studio-state',{firstGuide:105,guideCount:9,targetStripper:1260,locked:false,workshopIndex:0});
const blanks=[{maker:'K-Labs',model:"7'2 Softbait",fg:105,gc:9,ts:1260},{maker:'CD',model:'Haku PE3–6',fg:110,gc:10,ts:1350},{maker:'K-Labs',model:"7'0 Softbait",fg:100,gc:9,ts:1240}];
let timers={};
function save(){Store.set('klabs-studio-state',state)}
function wheelStepPx(key){const first=$(KLABS_CONFIG.wheel[key].track).querySelector('.wheel-item');return first?first.getBoundingClientRect().height:40}
function buildWheels(){
  Object.entries(KLABS_CONFIG.wheel).forEach(([key,s])=>{
    const t=$(s.track);let h='';
    for(let v=s.min;v<=s.max;v+=s.step)h+=`<div class="wheel-item" data-value="${v}">${v}</div>`;
    t.innerHTML=h;
    const win=t.parentElement;
    win.addEventListener('scroll',()=>{
      if(state.locked)return;
      markClosestWheelValue(key);
      clearTimeout(timers[key]);
      timers[key]=setTimeout(()=>{
        const px=wheelStepPx(key);
        const idx=Math.round(win.scrollTop/px);
        state[key]=Math.max(s.min,Math.min(s.max,s.min+idx*s.step));
        save();
        snapWheel(key);
        render();
      },70)
    },{passive:true});
  });
  setTimeout(()=>Object.keys(KLABS_CONFIG.wheel).forEach(k=>snapWheel(k,false)),80)
}
function snapWheel(key,smooth=true){
  const s=KLABS_CONFIG.wheel[key],win=$(s.track).parentElement;
  const px=wheelStepPx(key);
  const idx=(state[key]-s.min)/s.step;
  win.scrollTo({top:idx*px,behavior:smooth?'smooth':'auto'});
  highlight();
}
function markClosestWheelValue(key){
  const s=KLABS_CONFIG.wheel[key],track=$(s.track),win=track.parentElement;
  const px=wheelStepPx(key);
  const idx=Math.round(win.scrollTop/px);
  const val=Math.max(s.min,Math.min(s.max,s.min+idx*s.step));
  [...track.children].forEach(el=>el.classList.toggle('selected',Number(el.dataset.value)===Number(val)));
}
function highlight(){
  Object.entries(KLABS_CONFIG.wheel).forEach(([key,s])=>{
    const selected=Number(state[key]);
    [...$(s.track).children].forEach(el=>el.classList.toggle('selected',Number(el.dataset.value)===selected));
  })
}
function render(){
  const r=calcGuideLayout(+state.firstGuide,+state.guideCount,+state.targetStripper);
  $('app').classList.toggle('locked',state.locked);
  $('summaryFirstGuide').textContent=state.firstGuide;
  $('summaryStripper').textContent=r.actual.toFixed(1);
  $('summaryGuides').textContent=state.guideCount;
  const diff=(r.diff>=0?'+':'')+r.diff.toFixed(1)+' mm from target';
  $('summaryDiff').textContent=diff;
  $('summaryDiff').className=Math.abs(r.diff)<=1?'good':'warn';
  $('layoutRows').innerHTML=r.rows.map(x=>`<tr><td>${x.g}</td><td>${x.spacing.toFixed(1)}</td><td>${x.cum.toFixed(1)}</td></tr>`).join('');
  $('lockBtn').textContent=state.locked?'▶ Start Workshop':'Lock Build';
  $('unlockBtn').classList.toggle('hidden',!state.locked);
  $('summaryStatus').textContent=state.locked?'Locked':'Live';
  const row=r.rows[Math.max(0,Math.min(state.workshopIndex,r.rows.length-1))]||r.rows[0];
  $('workshopProgress').textContent='Guide '+row.g+' of '+state.guideCount;
  $('workshopGuide').textContent='Guide '+row.g;
  $('workshopMeasure').textContent=row.cum.toFixed(1);
  $('workshopSpacing').textContent='Spacing from previous: '+row.spacing.toFixed(1)+' mm';
  highlight();
}
function loadBlank(i){
  let b=blanks[i];
  state.firstGuide=b.fg;state.guideCount=b.gc;state.targetStripper=b.ts;state.locked=false;state.workshopIndex=0;
  save();render();Object.keys(KLABS_CONFIG.wheel).forEach(k=>snapWheel(k,false));goScreen('layoutScreen')
}
function renderBlanks(){$('blankCards').innerHTML=blanks.map((b,i)=>`<button class="module-card" onclick="loadBlank(${i})"><span>${b.maker}</span><strong>${b.model}</strong><em>First ${b.fg} mm • Guides ${b.gc} • Target ${b.ts} mm</em><b>›</b></button>`).join('')}
$('lockBtn').onclick=()=>{if(!state.locked){state.locked=true;state.workshopIndex=0;save();render();Object.keys(KLABS_CONFIG.wheel).forEach(k=>snapWheel(k,false));return}goScreen('workshopScreen')};
$('unlockBtn').onclick=()=>{state.locked=false;save();render();Object.keys(KLABS_CONFIG.wheel).forEach(k=>snapWheel(k,false));};
$('nextGuide').onclick=()=>{state.workshopIndex=Math.min(state.workshopIndex+1,state.guideCount-1);save();render()};
$('prevGuide').onclick=()=>{state.workshopIndex=Math.max(state.workshopIndex-1,0);save();render()};
window.loadBlank=loadBlank;window.KLABS_UI={buildWheels,render,renderBlanks};
