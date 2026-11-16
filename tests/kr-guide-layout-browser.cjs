// Browser integration check for KR Guide Layout inside the Workshop.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/kr-guide-layout-browser.cjs   (TDS_BROWSER=webkit for the Safari engine)
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
const SCRIPTS=['config.js','storage.js','guide-layout.js','thread-wrap.js','guide-train.js','thread-studio-host.js','kr-guide-layout-host.js','studio-visuals.js','navigation.js','invoice-pdf.js','ui.js'];
function serve(){
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://x').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
async function boot(browser,base,viewport,sw){
  const context=await browser.newContext({viewport,serviceWorkers:sw?'allow':'block'});
  await context.route('**/*',(route)=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
  await page.evaluate(()=>{window.KLABS_ACCOUNT_ID='aaaaaaaa-0000-0000-0000-000000000001';document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');});
  return {context,page,errors};
}
const openKr=async(page)=>{await page.evaluate(()=>openWorkshopTool('kr-guide'));await page.waitForSelector('#krGuideHost[data-kr-guide-state=ready] iframe');await page.waitForFunction(()=>document.querySelector('#krGuideHost iframe').contentDocument.querySelectorAll('.row').length>0);};
const fr=(page)=>page.frameLocator('#krGuideHost iframe');
const metrics=(page)=>page.evaluate(()=>{const f=document.querySelector('#krGuideHost iframe'),d=f.contentDocument,ins=[...d.querySelectorAll('.row input')];
  return {frameH:Math.round(f.getBoundingClientRect().height),docH:Math.ceil(d.documentElement.scrollHeight),pageOver:document.documentElement.scrollWidth>innerWidth,frameOver:d.documentElement.scrollWidth>d.documentElement.clientWidth,
    clipped:ins.filter((i)=>i.scrollWidth>i.clientWidth+1).length,rows:d.querySelectorAll('.row').length,
    snapshot:JSON.stringify([...d.querySelectorAll('.row')].map((r)=>[r.querySelector('input').value,(r.querySelector('.sp')||{}).textContent])),
    minTouch:Math.min(...[...d.querySelectorAll('.row .num button')].map((b)=>Math.min(b.getBoundingClientRect().width,b.getBoundingClientRect().height)))};});

async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    let {context,page,errors}=await boot(browser,base,{width:390,height:844});
    await page.evaluate(()=>{localStorage.clear();goScreen('workshopLandingScreen');});
    const launchers=await page.evaluate(()=>[...document.querySelectorAll('#workshopToolsList [data-workshop-tool-open]:not([hidden])')].map((b)=>b.getAttribute('data-workshop-tool-open')));
    ck('Workshop list shows Guide Setup, KR Guide Layout and Thread Design Studio, each once',['guide-spacing','kr-guide','thread-studio'].every((t)=>launchers.filter((l)=>l===t).length===1),launchers);
    await page.evaluate(()=>{localStorage.setItem('klabs-workshop-builds:aaaaaaaa-0000-0000-0000-000000000001',JSON.stringify([{id:'synthetic',buildNumber:'T-1'}]));});
    const before=await page.evaluate(()=>JSON.stringify(Object.keys(localStorage).sort().map((k)=>[k,localStorage.getItem(k)])));
    await page.click('#workshopToolsList [data-workshop-tool-open=kr-guide]');
    await page.waitForSelector('#krGuideHost[data-kr-guide-state=ready] iframe');
    await page.waitForFunction(()=>document.querySelector('#krGuideHost iframe').contentDocument.querySelectorAll('.row').length>0);
    ck('Tapping the launcher opens the tool in the Workshop (card visible, list hidden, frame titled)',await page.evaluate(()=>!document.getElementById('workshopToolKrGuide').hidden&&document.getElementById('workshopToolsList').hidden&&document.querySelector('#krGuideHost iframe').title==='KR Guide Layout'));
    const f=fr(page);
    ck('Tool shows its title, ten guide rows and the independence statement',(await f.locator('h1').innerText())==='KR Guide Layout'&&await f.locator('.row').count()===10&&(await f.locator('#app').innerText()).includes('not affiliated with or endorsed by Fuji'));
    const txt=await f.locator('#app').innerText();
    ck('Calculated results are labelled as such: reference start, invented demonstration values, unverified guide, ring-centre note, prototype status',/Reference start/i.test(txt)&&/invented/i.test(txt)&&/no manufacturer chart data/i.test(txt)&&/unverified/i.test(txt)&&/ring centres/i.test(txt)&&/internal testing/i.test(txt));
    let m=await metrics(page);
    ck('The frame grows to its content: no inner scroll area, no clipped fields, no sideways overflow (390 px)',Math.abs(m.frameH-m.docH)<=2&&!m.pageOver&&!m.frameOver&&m.clipped===0&&m.rows===10,m);
    const row5=async()=>f.locator('.row[data-i="4"] input').inputValue();
    ck('Reference start: guide #5 at 561.3 mm (invented demonstration values)',(await row5())==='561.3');
    await f.locator('.row[data-i="4"] button[data-st="1"]').click();
    ck('One tap on + moves the guide by 1 mm, tags it manual and updates its spacing',(await row5())==='562.3'&&(await f.locator('.row[data-i="4"] .tag').innerText())==='manual');
    await f.locator('.row[data-i="4"] button[data-st="-1"]').click();
    ck('And one tap on - returns it exactly',(await row5())==='561.3');
    await f.locator('.seg button',{hasText:'Decimal in'}).first().click();
    const inchVal=await f.locator('.row[data-i="4"] input').inputValue();
    ck('Switching to decimal inches converts the displayed positions',inchVal==='22.100',inchVal);
    await f.locator('.seg button',{hasText:'Decimal in'}).first().click();
    await f.locator('input[data-e=label]').fill('My 6 ft test');await f.locator('input[data-e=stripper]').fill('26.2');await f.locator('input[data-e=gaps]').fill('10 8 6.5 6 5.4 5 4.8 4.3');
    await f.locator('button[data-applyentry]').click();
    ck('Builder-entered chart measurements build a layout in the Workshop (9 guides; first guide 50 in from the tip; no restricted data needed)',await f.locator('.row').count()===9&&(await f.locator('.row[data-i="0"] input').inputValue())==='50.000');
    const after=await page.evaluate(()=>JSON.stringify(Object.keys(localStorage).sort().map((k)=>[k,localStorage.getItem(k)])));
    ck('Using the tool leaves all browser storage (builds, customers, settings) byte-identical',after===before);
    await page.click('#workshopToolKrGuide [data-workshop-tool-back]');
    ck('The Workshop back control returns to the tool list and unmounts the tool',await page.evaluate(()=>!document.getElementById('workshopToolsList').hidden&&document.getElementById('krGuideHost').children.length===0));
    // neighbours unaffected
    await page.evaluate(()=>openWorkshopTool('thread-studio'));
    await page.waitForSelector('#threadStudioHost[data-thread-studio-state=ready] iframe');
    ck('Thread Design Studio still opens, and the KR tool is unmounted while it is open',await page.evaluate(()=>document.getElementById('krGuideHost').children.length===0)&&await page.frameLocator('#threadStudioHost iframe').locator('[data-act=gallery]').count()===1);
    await page.evaluate(()=>openWorkshopTool('guide-spacing'));
    ck('Guide Setup still opens its own screen',await page.evaluate(()=>document.getElementById('layoutScreen').classList.contains('active')));
    ck('No page errors on the phone flow',errors.length===0,errors);
    await context.close();

    const sizes=[['Android phone 360',{width:360,height:740}],['iPhone 390',{width:390,height:844}],['iPhone Plus/Max 430',{width:430,height:932}],['iPad portrait 768',{width:768,height:1024}],['tablet landscape 1024',{width:1024,height:768}],['Mac / Windows 1440',{width:1440,height:900}]];
    const snaps=[];
    for(const [name,vw] of sizes){
      ({context,page,errors}=await boot(browser,base,vw));
      await openKr(page);const mm=await metrics(page);snaps.push(mm.snapshot);
      ck(`${name}: no overflow, no clipped position fields, frame matches its content, touch targets 30 px+`,!mm.pageOver&&!mm.frameOver&&mm.clipped===0&&Math.abs(mm.frameH-mm.docH)<=2&&mm.minTouch>=30,mm);
      ck(`${name}: no page errors`,errors.length===0,errors);
      await context.close();
    }
    ck('The layout numbers (positions and spacings) are identical at every size',new Set(snaps).size===1);

    ({context,page,errors}=await boot(browser,base,{width:390,height:844},true));
    const cached=await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;const k=(await caches.keys()).find((x)=>x.startsWith('klabs-studio-app-shell-'));const c=await caches.open(k);return {k,a:!!(await c.match(new URL('kr-guide-layout/index.html',location.href))),b:!!(await c.match(new URL('js/kr-guide-layout-host.js',location.href)))};});
    ck('Service worker precaches the KR document and host script',cached.a&&cached.b&&/build148-v222/.test(cached.k),cached);
    await page.reload({waitUntil:'load'});
    for(const s of SCRIPTS)await page.addScriptTag({url:`${base}/js/${s}`});
    await page.evaluate(()=>{window.KLABS_ACCOUNT_ID='aaaaaaaa-0000-0000-0000-000000000001';document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');});
    await context.setOffline(true);
    await openKr(page);
    ck('Offline: the tool opens from the service-worker cache and calculates',await fr(page).locator('.row').count()===10&&(await fr(page).locator('.row[data-i="4"] input').inputValue())==='561.3');
    await context.setOffline(false);await context.close();
  }finally{await browser.close();server.close();}
  console.log(`PASS: ${passed} KR Guide Layout browser integration checks (${process.env.TDS_BROWSER||'chromium'}).`);
}
main().catch((e)=>{console.error(e);process.exitCode=1;});
