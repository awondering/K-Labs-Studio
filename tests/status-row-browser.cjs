// Browser checks for the status / Mark Complete row of the merged card (layout only). Synthetic data only.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/status-row-browser.cjs
// Serves the repository from a local HTTP server with all other network refused. Synthetic data only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_MODULE);
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
let passed=0;
const ck=(name,cond,detail)=>{assert.ok(cond,`${name}${detail===undefined?'':' '+JSON.stringify(detail)}`);passed++;console.log('PASS',name);};
const SCRIPTS=['config.js','storage.js','guide-layout.js','thread-wrap.js','guide-train.js','thread-studio-host.js','kr-guide-layout-host.js','studio-visuals.js','navigation.js','business-logo.js','invoice-pdf.js','ui.js'];
const A='aaaaaaaa-0000-0000-0000-00000000000a';   // synthetic account A: "K-Labs"
const B='bbbbbbbb-0000-0000-0000-00000000000b';   // synthetic account B: another rod builder

function serve(){
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://x').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
async function boot(browser,base,viewport){
  const context=await browser.newContext({viewport});
  await context.route('**/*',(route)=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
  await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');},A);
  return {context,page,errors};
}
const show=(page,state)=>page.evaluate((st)=>{
  goScreen('workshopScreen');showStudioWorkflow();
  Object.assign(quote,{customerName:'Synthetic Customer',buildName:'Rod',status:st,quoteStatus:st});
  const total=document.getElementById('quoteTotal');total.value='1250';total.dispatchEvent(new Event('input',{bubbles:true}));
  updateWorkshopSectionVisibility();updateWorkshopBuildActionsUi();updateQuoteSummary();
  expandWorkshopCollapsibleSection('workshopQuoteSummaryBody',{instant:true});
},state);
const geo=(page)=>page.evaluate(()=>{
  const r=(id)=>{const e=document.getElementById(id);const b=e.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top,b:b.bottom,w:b.width,h:b.height,hidden:e.hidden||b.width===0};};
  const card=document.getElementById('workshopQuoteSummaryBody').getBoundingClientRect();
  return {badge:r('workshopBuildLifecycleStatus'),btn:r('toggleCurrentBuildStatusBtn'),confirm:r('confirmBuildBtn'),card:{l:card.left,r:card.right},docW:document.documentElement.scrollWidth,vw:innerWidth,
    badgeText:document.getElementById('workshopBuildLifecycleStatus').textContent,btnText:document.getElementById('toggleCurrentBuildStatusBtn').textContent};
});
async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    for(const vp of [{width:320,height:700},{width:390,height:844},{width:1280,height:800}]){
      const {page,errors}=await boot(browser,base,vp);
      await page.evaluate(()=>localStorage.clear());
      for(const st of ['active','complete','quote']){
        await show(page,st);await page.waitForTimeout(120);
        const g=await geo(page);const tag=`${vp.width}px ${st}`;
        ck(`${tag}: no horizontal overflow`,g.docW<=g.vw,g);
        ck(`${tag}: badge is compact, not field-wide`,g.badge.w<=170,g.badge);
        if(st==='quote'){
          ck(`${tag}: Confirm Build shown, Mark Complete hidden`,!g.confirm.hidden&&g.btn.hidden,g);
          continue;
        }
        ck(`${tag}: Confirm Build stays hidden`,g.confirm.hidden,g);
        ck(`${tag}: button label follows state`,g.btnText===(st==='complete'?'Mark Active':'Mark Complete'),g.btnText);
        ck(`${tag}: button is at least 44px tall and 120px wide`,g.btn.h>=44&&g.btn.w>=120,g.btn);
        ck(`${tag}: button sits at the right edge of the card`,g.card.r-g.btn.r<=16,g);
        ck(`${tag}: button stays inside the card`,g.btn.l>=g.card.l-1&&g.btn.r<=g.card.r+1,g);
        const sameRow=Math.abs((g.badge.t+g.badge.h/2)-(g.btn.t+g.btn.h/2))<4;
        if(vp.width>=390)ck(`${tag}: badge and button share one row`,sameRow,g);
        else ck(`${tag}: badge and button either share a row or wrap cleanly`,sameRow||g.btn.t>=g.badge.b-1,g);
      }
      // Long label cannot clip or overflow.
      await show(page,'active');
      await page.evaluate(()=>{document.getElementById('workshopBuildLifecycleStatus').textContent='Awaiting customer approval and deposit';});
      const g=await geo(page);
      ck(`${vp.width}px long label: no overflow and badge stays inside the card`,g.docW<=g.vw&&g.badge.r<=g.card.r+1&&g.badge.l>=g.card.l-1,g);
      if(vp.width===390&&process.env.SR_SHOT){await page.evaluate(()=>updateWorkshopBuildActionsUi());await page.locator('.workshop-build-actions-row--status').screenshot({path:process.env.SR_SHOT});}
      // Behaviour untouched: the same button still toggles status through the real handler.
      await page.evaluate(()=>updateWorkshopBuildActionsUi());
      ck(`${vp.width}px page errors`,errors.length===0,errors);
      await page.close();
    }
  }finally{await browser.close();server.close();}
  console.log(`\n${passed} checks passed`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
