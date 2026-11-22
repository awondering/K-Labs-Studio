// Browser integration check for the Thread Design Studio inside the Workshop.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/thread-studio-browser.cjs   (Chromium; set TDS_BROWSER=webkit for Safari-engine)
// Serves the repository from a local HTTP server, with all other network refused. Uses synthetic data only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_MODULE);
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
const A='aaaaaaaa-0000-0000-0000-000000000001',B='bbbbbbbb-0000-0000-0000-000000000002';
let passed=0;
const ck=(name,cond,detail)=>{assert.ok(cond,`${name}${detail===undefined?'':' '+JSON.stringify(detail)}`);passed++;console.log('PASS',name);};

function serve(){
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://x');const p=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const file=path.resolve(root,'.'+p);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
const SCRIPTS=['config.js','storage.js','guide-layout.js','thread-wrap.js','guide-train.js','thread-studio-host.js','studio-visuals.js','navigation.js','invoice-pdf.js','ui.js'];

async function boot(browser,base,viewport,opts={}){
  const context=await browser.newContext({viewport,serviceWorkers:opts.sw?'allow':'block'});
  await context.route('**/*',(route)=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
  await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');},A);
  return {context,page,errors};
}
const open=async(page)=>{await page.evaluate(()=>openWorkshopTool('thread-studio'));await page.waitForSelector('#threadStudioHost[data-thread-studio-state=ready] iframe');};
const frame=(page)=>page.frameLocator('#threadStudioHost iframe');

async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    // ---- phone
    let {context,page,errors}=await boot(browser,base,{width:390,height:844});
    await page.evaluate(()=>{localStorage.clear();goScreen('workshopLandingScreen');});
    const launchers=await page.evaluate(()=>[...document.querySelectorAll('#workshopToolsList [data-workshop-tool-open]:not([hidden])')].map((b)=>b.getAttribute('data-workshop-tool-open')+'|'+b.querySelector('.workshop-tool-launch__title').textContent.trim()));
    ck('Workshop list shows one Thread Design Studio entry and no separate Thread Wrap Designer entry',launchers.includes('thread-studio|Thread Design Studio')&&!launchers.some((l)=>l.startsWith('thread-wrap')),launchers);
    // synthetic Studio data that must survive untouched
    await page.evaluate((a)=>{localStorage.setItem('klabs-workshop-builds:'+a,JSON.stringify([{id:'synthetic-build',buildNumber:'T-1',customerName:'Synthetic'}]));},A);
    const before=await page.evaluate(()=>JSON.stringify(Object.keys(localStorage).filter((k)=>!k.startsWith('ktds.')).sort().map((k)=>[k,localStorage.getItem(k)])));
    await page.click('#workshopToolsList [data-workshop-tool-open=thread-studio]');
    await page.waitForSelector('#threadStudioHost[data-thread-studio-state=ready] iframe');
    ck('Tapping the launcher opens the studio in the Workshop (card visible, list hidden, frame titled)',await page.evaluate(()=>!document.getElementById('workshopToolThreadStudio').hidden&&document.getElementById('workshopToolsList').hidden&&document.querySelector('#threadStudioHost iframe').title==='Thread Design Studio'));
    const f=frame(page);
    await f.locator('[data-act=gallery]').waitFor();
    ck('Studio start screen is shown with its four choices plus the tapered-blank hand-off',await f.locator('.choice').count()===5&&await f.locator('[data-act=taper]').count()===1);
    // geometry: frame fits the visible area above the bottom navigation, no page overflow
    const g=await page.evaluate(()=>{const h=document.getElementById('threadStudioHost').getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect();return {bottom:h.bottom,navTop:n.top,w:h.width,over:document.documentElement.scrollWidth>innerWidth};});
    ck('Phone: the studio sits above the bottom navigation and the page does not overflow sideways',g.bottom<=g.navTop+1&&!g.over&&g.w>300,g);
    // choose a design and a custom one
    await f.locator('[data-act=gallery]').click();await f.locator('[data-pat=wovendiamond]').click();
    await f.locator('#rod').waitFor();
    ck('A design opens with the rod preview and Start Wrapping',await f.locator('#rod').count()===1&&await f.locator('[data-act=start]').count()===1);
    for(let i=0;i<3&&await f.locator('[data-act=custom]').count()===0;i++)await f.locator('.top [data-act=home],.top [data-act=design]').first().click();
    await f.locator('[data-act=custom]').click();await f.locator('[data-tpl=symbol]').click();await f.locator('#gridc').waitFor();
    await f.locator('summary:has-text("More options")').click();await f.locator('#dname').fill('Synthetic Logo');await f.locator('[data-act=save]').click();
    const keys=await page.evaluate(()=>Object.keys(localStorage).filter((k)=>k.startsWith('ktds.')).sort());
    ck('Studio data is stored under account-scoped keys only',keys.length>=1&&keys.every((k)=>k.endsWith(':'+'aaaaaaaa-0000-0000-0000-000000000001')),keys);
    ck('Saved custom design is account-compatible JSON (grid rows, colours, name)',await page.evaluate((a)=>{const l=JSON.parse(localStorage.getItem('ktds.library.v1:'+a));const d=l[0].design;return l.length===1&&d.pattern==='wovencustom'&&Array.isArray(d.art.rows)&&d.art.rows.length===d.art.h&&Array.isArray(d.slots)&&d.name==='Synthetic Logo';},A));
    const after=await page.evaluate(()=>JSON.stringify(Object.keys(localStorage).filter((k)=>!k.startsWith('ktds.')).sort().map((k)=>[k,localStorage.getItem(k)])));
    ck('Studio use leaves every other Studio storage key (builds, customers, quotes, settings) byte-identical',after===before);
    // account isolation
    await page.evaluate(()=>openWorkshopTool('list'));
    await page.evaluate((b)=>{window.KLABS_ACCOUNT_ID=b;openWorkshopTool('thread-studio');},B);
    await page.waitForSelector('#threadStudioHost[data-thread-studio-scope="'+B+'"][data-thread-studio-state=ready] iframe');
    await frame(page).locator('[data-act=custom]').click();
    ck('A different account on the same device does not see the first account\'s designs',await frame(page).locator('[data-lib]').count()===0);
    await page.evaluate(()=>openWorkshopTool('list'));
    await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;openWorkshopTool('thread-studio');},A);
    await page.waitForSelector('#threadStudioHost[data-thread-studio-scope="'+A+'"][data-thread-studio-state=ready] iframe');
    await frame(page).locator('[data-act=custom]').click();
    ck('Returning to the first account restores its saved design after a remount',await frame(page).locator('[data-lib]').count()===1&&(await frame(page).locator('#app').innerText()).includes('Synthetic Logo'));
    // back to workshop
    await page.click('#workshopToolThreadStudio [data-workshop-tool-back]');
    ck('The Workshop back control returns to the tool list and unmounts the studio',await page.evaluate(()=>!document.getElementById('workshopToolsList').hidden&&document.getElementById('threadStudioHost').children.length===0&&!document.getElementById('threadStudioHost').dataset.threadStudioState));
    // taper hand-off and the existing designer
    await page.click('#workshopToolsList [data-workshop-tool-open=thread-studio]');
    await page.waitForSelector('#threadStudioHost[data-thread-studio-state=ready] iframe');
    await frame(page).locator('[data-act=taper]').click();
    await page.waitForSelector('#workshopToolThreadWrap:not([hidden])');
    ck('The tapered-blank link opens the existing Thread Wrap Designer and unmounts the studio',await page.evaluate(()=>document.getElementById('workshopToolThreadStudio').hidden&&document.getElementById('threadStudioHost').children.length===0));
    await page.fill('#workshopThreadWrapLength','600');await page.fill('#workshopThreadWrapButtDiameter','12');await page.fill('#workshopThreadWrapTipDiameter','6');
    await page.dispatchEvent('#workshopThreadWrapTipDiameter','change');
    await page.waitForFunction(()=>(document.getElementById('threadWrapSumRepeats')||{}).textContent&&/rows/.test(document.getElementById('threadWrapSumRepeats').textContent));
    ck('The existing Thread Wrap Designer still calculates taper-aware rows',await page.evaluate(()=>/\d+ \(\d+ rows\)/.test(document.getElementById('threadWrapSumRepeats').textContent)));
    ck('No page errors on the phone flow',errors.length===0,errors);
    await context.close();

    // ---- tablet / desktop: widened shell and the studio's two-column workspace
    for(const [name,vw] of [['iPad portrait',{width:768,height:1024}],['tablet landscape',{width:1024,height:768}],['Mac / Windows',{width:1440,height:900}]]){
      ({context,page,errors}=await boot(browser,base,vw));
      await page.evaluate(()=>{localStorage.clear();});
      await open(page);
      const fr=frame(page);await fr.locator('[data-act=gallery]').click();await fr.locator('[data-pat=wovendiamond]').click();await fr.locator('#rod').waitFor();
      const m=await page.evaluate(()=>{const h=document.getElementById('threadStudioHost').getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect();const d=document.querySelector('#threadStudioHost iframe').contentDocument;const rod=d.querySelector('#rod').getBoundingClientRect(),cols=getComputedStyle(d.querySelector('main')).display;return {hw:h.width,bottom:h.bottom,navTop:n.top,over:document.documentElement.scrollWidth>innerWidth,rodW:rod.width,mainDisplay:cols,innerW:d.documentElement.clientWidth};});
      ck(`${name}: studio fits above the navigation without overflow`,m.bottom<=m.navTop+1&&!m.over,m);
      ck(`${name}: studio gets a wider working area than the 410px phone column`,m.hw>=Math.min(vw.width-40,700)&&m.innerW>420,m);
      const plan=await fr.locator('body').evaluate(()=>JSON.stringify([window.__ts.L.M,window.__ts.L.g,window.__ts.L.rows,window.__ts.L.warpQty]));
      (globalThis.plans=globalThis.plans||[]).push(plan);
      ck(`${name}: no page errors`,errors.length===0,errors);
      await context.close();
    }
    ck('The weave plan is identical at every size',new Set(globalThis.plans).size===1,globalThis.plans);

    // ---- offline: the service worker serves the studio and the host with the network gone
    ({context,page,errors}=await boot(browser,base,{width:390,height:844},{sw:true}));
    const reg=await page.evaluate(async()=>{const r=await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;return !!r;});
    await page.waitForFunction(()=>navigator.serviceWorker.controller||true);
    const cached=await page.evaluate(async()=>{const keys=await caches.keys();const c=await caches.open(keys.find((k)=>k.startsWith('klabs-studio-app-shell-')));const r=await c.match(new URL('thread-studio/index.html',location.href));const h=await c.match(new URL('js/thread-studio-host.js',location.href));return !!r&&!!h&&keys.filter((k)=>k.startsWith('klabs-studio-app-shell-')).join();});
    ck('Service worker precaches the studio document and host script',reg&&!!cached&&/build148-v276/.test(cached),cached);
    await page.reload({waitUntil:'load'});
    for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
    await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');},A);
    await context.setOffline(true);
    await open(page);
    await frame(page).locator('[data-act=gallery]').waitFor();
    ck('Offline: the studio opens from the service-worker cache and is usable',await frame(page).locator('[data-act=gallery]').count()===1);
    await frame(page).locator('[data-act=gallery]').click();await frame(page).locator('[data-pat=chevronwrap]').click();
    ck('Offline: a design previews on the rod',await frame(page).locator('#rod').count()===1);
    await context.setOffline(false);await context.close();
  }finally{await browser.close();server.close();}
  console.log(`PASS: ${passed} Thread Design Studio browser integration checks (${process.env.TDS_BROWSER||'chromium'}).`);
}
main().catch((e)=>{console.error(e);process.exitCode=1;});
