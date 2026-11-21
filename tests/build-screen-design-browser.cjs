// Q23 review fixes, browser design checks of the build screen (Rod Price, delivery, payment, documents) at Mac and iPhone 13.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright [TDS_BROWSER=webkit] node tests/build-screen-design-browser.cjs
// Serves the repository from a local HTTP server with all other network refused. Synthetic data only; nothing is saved.
// Checks, in Quote (Courier / Shipping), Active and Complete:
//  - GST: the rod figure, the customer total with delivery and the GST Amount box each say what they cover;
//  - Documents: compact secondary buttons in one row on Mac; two per row on iPhone at 44px; no lone half-width button;
//  - Record Payment and Confirm Build at a sensible width on Mac (not edge to edge);
//  - Fulfilment Method, Payment Status and Documents share one heading style;
//  - nothing at the end of the build screen is hidden behind the bottom nav bar; no horizontal overflow; no page errors.
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
const ACCOUNT='cccccccc-0000-0000-0000-00000000000c';   // synthetic account

function serve(){
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://x').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
async function boot(browser,base,options){
  const context=await browser.newContext(options);
  await context.route('**/*',(route)=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  await page.evaluate(()=>localStorage.clear());
  for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
  await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');},ACCOUNT);
  return {context,page,errors};
}
// One synthetic build: $899 rod price, Courier / Shipping with $34.50 delivery charged ($18 freight, $12 packaging, + markup off).
const setState=(page,stage)=>page.evaluate((stage)=>{
  goScreen('workshopScreen');showStudioWorkflow();
  Object.assign(quote,{customerName:'Synthetic Customer',buildName:'Rod',status:stage==='complete'?'complete':'active',quoteStatus:stage});
  setQuoteFulfilmentMethod('shipping');
  for(const [id,value] of [['quoteFreight','18'],['quotePackaging','12'],['quoteTotal','899']]){
    const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  updateWorkshopSectionVisibility();updateWorkshopBuildActionsUi();updateQuoteSummary();
  expandWorkshopCollapsibleSection('workshopQuoteSummaryBody',{instant:true});
},stage);
const measure=(page)=>page.evaluate(()=>{
  const vis=(el)=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const box=(el)=>{const r=el.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom)};};
  const grid=document.querySelector('.workshop-build-actions-docs__grid');
  const docs=[...grid.children].filter(vis).map((el)=>({id:el.id,...box(el)}));
  const style=(el)=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.letterSpacing,s.color,s.textTransform].join('|');};
  const headings=[document.querySelector('#quoteFulfilmentGroup > .build-section-heading'),document.querySelector('#quotePaymentBlock > .build-section-heading'),
    document.querySelector('.workshop-build-actions-docs > .build-section-heading')];
  const t=(id)=>document.getElementById(id)?.textContent||'';
  const surface=document.querySelector('.workshop-build-actions-surface');
  const pay=document.getElementById('quoteRecordPaymentBtn');const confirm=document.getElementById('confirmBuildBtn');
  const se=document.scrollingElement;se.scrollTop=se.scrollHeight;
  const navTop=document.querySelector('.bottom-nav').getBoundingClientRect().top;
  const ends=['confirmBuildBtn','toggleCurrentBuildStatusBtn','workshopBuildActionsStatus','currentBuildActionsMenuBtn'].map((id)=>document.getElementById(id)).filter(vis);
  const lastBottom=Math.max(...ends.map((el)=>el.getBoundingClientRect().bottom));
  return {
    gstLabelOneLine:(()=>{const el=document.getElementById('quoteTaxLabel');if(el.getClientRects().length===0)return true;/* folded away at Complete */return el.getClientRects().length===1&&el.getBoundingClientRect().height<=parseFloat(getComputedStyle(el).lineHeight||'20')*1.5+2;})(),
    rodRed:document.getElementById('quoteTotalField').classList.contains('quote-field--active-target'),
    hint:t('quoteRodPriceHint'),total:t('quoteCustomerTotalLine'),gstLabel:t('quoteTaxLabel'),gst:document.getElementById('quoteGst').value,
    docs,gridW:Math.round(grid.getBoundingClientRect().width),surfaceW:Math.round(surface.getBoundingClientRect().width),
    pay:vis(pay)?box(pay):null,toggle:vis(document.getElementById('toggleCurrentBuildStatusBtn'))?box(document.getElementById('toggleCurrentBuildStatusBtn')):null,confirm:vis(confirm)?box(confirm):null,
    headings:headings.map((el)=>el?style(el):null),
    clearance:Math.round(navTop-lastBottom),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
  };
});
async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'webkit'].launch({headless:true});
  const sizes={mac:{viewport:{width:1280,height:860}},iphone:{...playwright.devices['iPhone 13']}};
  try{
    for(const [size,options] of Object.entries(sizes)){
      const {context,page,errors}=await boot(browser,base,options);
      for(const stage of ['quote','active','complete']){
        await setState(page,stage);await page.waitForTimeout(150);
        const m=await measure(page);const label=`${size} ${stage}`;
        ck(`${label}: the rod figure says it is GST on the rod`,/^NZD · GST on the rod \$\d+\.\d\d$/.test(m.hint),m.hint);
        ck(`${label}: the customer total with delivery shows its own GST, equal to the GST Amount box`,
          m.total===`Customer total with delivery: ${m.total.match(/\$[\d,]+\.\d\d/)?.[0]} (incl. GST ${m.gst})`,[m.total,m.gst]);
        ck(`${label}: the GST box says it covers the rod and the delivery, on one line`,m.gstLabel==='GST (rod + delivery)'&&m.gstLabelOneLine,[m.gstLabel,m.gstLabelOneLine]);
        ck(`${label}: the Rod Price is not marked red on the simple screen`,!m.rodRed,m.rodRed);
        ck(`${label}: Documents has at least two buttons`,m.docs.length>=2,m.docs);
        const rows=[...new Set(m.docs.map((d)=>d.t))].map((top)=>m.docs.filter((d)=>Math.abs(d.t-top)<4));
        if(size==='mac'){
          ck(`${label}: Documents are one row of compact buttons`,rows.length===1&&m.docs.every((d)=>d.w<=m.gridW*0.4),{rows:rows.length,docs:m.docs,gridW:m.gridW});
          ck(`${label}: Document buttons are 40px tall`,m.docs.every((d)=>d.h===40),m.docs);
          if(m.pay)ck(`${label}: Record Payment is a sensible width, not edge to edge, 40px tall`,m.pay.w<=m.surfaceW*0.5&&m.pay.h===40,[m.pay,m.surfaceW]);
          if(m.confirm)ck(`${label}: Confirm Build is a sensible width, not edge to edge, 40px tall`,m.confirm.w<=m.surfaceW*0.5&&m.confirm.h===40,[m.confirm,m.surfaceW]);
          if(m.toggle)ck(`${label}: Mark Complete is 40px tall like the other actions`,m.toggle.h===40,m.toggle);
        }else{
          ck(`${label}: Documents are two per row, and a row with one button spans the full width (no lone half-width button)`,
            rows.every((row)=>row.length===2||(row.length===1&&row[0].w>=m.gridW-1)),{rows,gridW:m.gridW});
          ck(`${label}: Document buttons are 44-48px tall`,m.docs.every((d)=>d.h>=44&&d.h<=48),m.docs);
          if(m.pay)ck(`${label}: Record Payment is at least 44px tall`,m.pay.h>=44&&m.pay.h<=48,m.pay);
        }
        ck(`${label}: Fulfilment Method, Payment Status and Documents share one heading style`,
          m.headings.every((h)=>h&&h===m.headings[0]),m.headings);
        ck(`${label}: the last controls clear the bottom nav bar by at least 16px`,m.clearance>=16,m.clearance);
        ck(`${label}: no horizontal overflow`,!m.overflow);
        if(process.env.BSD_SHOTS){
          await page.evaluate(()=>document.querySelector('.workshop-build-actions-surface').scrollIntoView({block:'start'}));
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-${stage}-actions.png`)});
          await page.evaluate(()=>document.getElementById('quoteTotalField').scrollIntoView({block:'start'}));
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-${stage}-pricing.png`)});
          await page.evaluate(()=>{const se=document.scrollingElement;se.scrollTop=se.scrollHeight;});
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-${stage}-bottom.png`)});
        }
      }
      ck(`${size}: no page errors`,errors.length===0,errors);
      await context.close();
    }
  }finally{await browser.close();server.close();}
  console.log(`\n${passed} checks passed`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
