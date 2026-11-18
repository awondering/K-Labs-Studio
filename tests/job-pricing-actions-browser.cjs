// Browser checks for the merged "Job Pricing & Actions" card (layout only). Synthetic data only.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/job-pricing-actions-browser.cjs
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
const BEFORE=fs.readFileSync(path.join(__dirname,'fixtures-job-pricing-actions-ids.txt'),'utf8').split('\n').filter(Boolean);
// The two old card containers, plus the controls the iPhone layout replaced: one Record Payment button (Deposit | Balance in
// its form) and Payment Statement under the ••• menu.
const REMOVED=['workshopActionsSection','workshopBuildActionsBody','quoteRecordDepositBtn','quoteRecordBalanceBtn','viewPaymentStatementBtn'];
const open=(page)=>page.evaluate(()=>{
  goScreen('workshopScreen');showStudioWorkflow();
  Object.assign(quote,{customerName:'Synthetic Customer',buildName:'Rod',status:'active',quoteStatus:'active'});
  const total=document.getElementById('quoteTotal');total.value='1250';total.dispatchEvent(new Event('input',{bubbles:true}));
  updateWorkshopSectionVisibility();updateWorkshopBuildActionsUi();updateQuoteSummary();
  expandWorkshopCollapsibleSection('workshopQuoteSummaryBody',{instant:true});
});
async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    const {page,errors}=await boot(browser,base,{width:390,height:844});
    await page.evaluate(()=>localStorage.clear());
    await open(page);
    const present=await page.evaluate((ids)=>ids.filter((id)=>!document.getElementById(id)),BEFORE);
    ck('every control id from the old Job Pricing + Job Actions cards still exists',present.every((id)=>REMOVED.includes(id)),present);
    ck('exactly the replaced ids are gone',present.length===REMOVED.length,present);
    ck('one header toggle in the merged card',await page.locator('#workshopPricingSection [data-collapsible-trigger]').count()===1);
    ck('no separate Job Actions card',await page.locator('#workshopActionsSection').count()===0);
    const docs=await page.locator('.workshop-build-actions-docs__grid button').evaluateAll((b)=>b.map((x)=>x.id));
    ck('Documents group holds View, Email and Customer Invoice',JSON.stringify(docs)===JSON.stringify(['viewQuoteBtn','emailQuoteBtn','viewInvoicePreviewBtn']),docs);
    const summary=await page.locator('#workshopBuildPricingSummaryText').textContent();
    ck('collapsed summary shows status, price and amount owing',/Active/.test(summary)&&/1,?250/.test(summary)&&/Owing/.test(summary),summary);
    const geo=await page.evaluate(()=>{
      const r=(id)=>document.getElementById(id).getBoundingClientRect();
      return {docW:document.documentElement.scrollWidth,vw:innerWidth,hs:r('workshopBuildLifecycleStatus'),tg:r('toggleCurrentBuildStatusBtn'),inv:r('viewInvoicePreviewBtn'),menu:r('currentBuildActionsMenuBtn'),sync:r('workshopBuildActionsStatus'),
        pay:r('quoteRecordPaymentBtn'),docsTop:document.querySelector('.workshop-build-actions-docs').getBoundingClientRect().top,payBottom:document.getElementById('quotePaymentBlock').getBoundingClientRect().bottom};
    });
    ck('no horizontal overflow at 390px',geo.docW<=geo.vw,geo);
    ck('status and Mark Complete share a row',Math.abs((geo.hs.top+geo.hs.height/2)-(geo.tg.top+geo.tg.height/2))<6,geo);
    ck('Documents sit below the payment block',geo.docsTop>=geo.payBottom-1,geo);
    ck('touch targets are at least 36px tall',geo.inv.height>=36&&geo.tg.height>=36&&geo.menu.height>=36,geo);
    ck('sync status and menu share the bottom row',Math.abs(geo.sync.top-geo.menu.top)<20,geo);
    await page.evaluate(()=>document.getElementById('currentBuildActionsMenuBtn').click());
    ck('three-dot menu opens with Delete Build',await page.locator('#currentBuildActionsMenu [data-current-build-action="delete"]').isVisible());
    await page.locator('#workshopPricingSection [data-collapsible-trigger]').click();
    ck('header collapses the whole card',await page.locator('#workshopPricingSection').evaluate((e)=>e.classList.contains('quote-section--collapsed')));
    await page.locator('#workshopPricingSection [data-collapsible-trigger]').click();
    ck('header expands it again',await page.locator('#workshopPricingSection [aria-expanded="true"]').count()>=1);
    await page.evaluate(()=>{expandWorkshopCollapsibleSection('workshopQuoteSummaryBody',{instant:true});});
    await page.waitForTimeout(150);
    ck('payment history stays hidden until a payment exists',await page.locator('#quotePaymentHistoryDetails').isHidden());
    await page.evaluate(()=>{quote.payments=[{id:'p1',type:'deposit',amount:200,date:'2026-11-10'}];updatePaymentBlock();});
    ck('payment history appears once a payment exists and expands',await page.locator('#quotePaymentHistoryDetails').isVisible());
    await page.locator('#quotePaymentHistoryDetails > summary').click();
    ck('history entry is readable when expanded',/Deposit/.test(await page.locator('#quotePaymentHistory').innerText()));
    ck('summary reflects the remaining balance after a payment',/Owing/.test(await page.locator('#workshopBuildPricingSummaryText').textContent()),await page.locator('#workshopBuildPricingSummaryText').textContent());
    if(process.env.JPA_SHOT)await page.locator('#workshopPricingSection').screenshot({path:process.env.JPA_SHOT});
    await page.evaluate(()=>{setWorkshopSectionCollapsed('workshopQuoteSummaryBody',true,{instant:true});});
    await page.waitForTimeout(150);
    if(process.env.JPA_SHOT2)await page.locator('#workshopPricingSection').screenshot({path:process.env.JPA_SHOT2});
    ck('no page errors',errors.length===0,errors);
  }finally{await browser.close();server.close();}
  console.log(`\n${passed} checks passed`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
