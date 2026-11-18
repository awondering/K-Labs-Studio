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

const setPref=(page,mode)=>page.evaluate((m)=>{const n=measurementDisplaySettings(m);studioSettings.measurementUnits=n.measurementUnits;studioSettings.imperialDisplay=n.imperialDisplay;saveStudioSettings();},mode);
const closeKr=async(page)=>{await page.evaluate(()=>openWorkshopTool('thread-studio'));await page.waitForFunction(()=>!document.querySelector('#krGuideHost iframe'));};
const krUnit=(page)=>page.evaluate(()=>{const d=document.querySelector('#krGuideHost iframe').contentDocument;const c=d.querySelector('#app').cloneNode(true);c.querySelectorAll('button[data-unit=mm],textarea').forEach((x)=>x.remove());
  return {pressed:[...d.querySelectorAll('[data-unit][aria-pressed=true]')].map((x)=>x.dataset.unit).join(),blade:d.querySelector('input[data-k=blade]').value,stem:d.querySelector('input[data-k=stem]').value,first:d.querySelector('.row[data-i="0"] input').value,mmText:/\bmm\b/.test(c.textContent),rows:d.querySelectorAll('.row').length};});
const rawSettings=(page)=>page.evaluate(()=>JSON.stringify(Object.keys(localStorage).filter((k)=>/settings/i.test(k)).sort().map((k)=>[k,localStorage.getItem(k)])));
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
    const pres=await f.locator('body').evaluate(()=>{const app=document.querySelector('#app'),vis=(e)=>e&&e.getBoundingClientRect(),ab=app.querySelector('details.about'),kids=[...app.children];return {heading:app.firstElementChild.tagName,sub:!!app.querySelector('.sub'),notice:!!app.querySelector('.notice'),amber:app.querySelectorAll('[class*=notice],.warn-panel').length,chipsTop:Math.round(vis(app.querySelector('button[data-rod]')).top),firstCardIsRod:/rod and reel/i.test(app.querySelector('section.card').innerText),aboutLast:kids[kids.length-1]===ab,aboutOpen:ab.open,aboutText:ab.textContent,subText:app.querySelector('.sub').textContent};});
    ck('Presentation: heading, short description and rod controls come first; no amber disclaimer panel; rod chips are on the first screen',pres.heading==='H1'&&pres.sub&&!pres.notice&&pres.amber===0&&pres.firstCardIsRod&&pres.chipsTop<260&&pres.subText.length<110,pres);
    ck('About this calculator is last, collapsed, and holds independence/non-endorsement, Fuji attribution, provenance and unverified items',pres.aboutLast&&!pres.aboutOpen&&/not affiliated with or endorsed by Fuji/.test(pres.aboutText)&&/Fuji\u2019s published KR Concept chart/.test(pres.aboutText)&&/transcribed by K-Labs/.test(pres.aboutText)&&/Unverified/.test(pres.aboutText)&&/foot placement/.test(pres.aboutText),pres.aboutText.slice(0,80));
    ck('Tool shows its title, ten guide rows and the independence statement',(await f.locator('h1').innerText())==='KR Guide Layout'&&await f.locator('.row').count()===10&&(await f.locator('#app').textContent()).includes('not affiliated with or endorsed by Fuji'));
    const txt=await f.locator('#app').textContent();
    ck('Calculated results are labelled as such: reference start, Fuji-chart source, unverified guide, ring-centre note, prototype status',/Reference start/i.test(txt)&&/Fuji.s published KR Concept chart/i.test(txt)&&!/invented|demonstration/i.test(txt)&&/unverified/i.test(txt)&&/ring centres/i.test(txt)&&/internal testing/i.test(txt));
    let m=await metrics(page);
    ck('The frame grows to its content: no inner scroll area, no clipped fields, no sideways overflow (390 px)',Math.abs(m.frameH-m.docH)<=2&&!m.pageOver&&!m.frameOver&&m.clipped===0&&m.rows===10,m);
    const row5=async()=>f.locator('.row[data-i="4"] input').inputValue();
    ck('Reference start: guide #5 at 556.3 mm (7 ft chart row, stem at the exact-fit position)',(await row5())==='556.3');
    await f.locator('.row[data-i="4"] button[data-st="1"]').click();
    ck('One tap on + moves the guide by 1 mm, tags it manual and updates its spacing',(await row5())==='557.3'&&(await f.locator('.row[data-i="4"] .tag').innerText())==='adjusted');
    await f.locator('.row[data-i="4"] button[data-st="-1"]').click();
    ck('And one tap on - returns it exactly',(await row5())==='556.3');
    ck('Guide roles: legend lists stripper, reduction, choke, running and tip-top; summary names the stripper, reduction train and choke point',(await f.locator('.legend span').count())===5&&/Stripper[\s\S]*Reduction train[\s\S]*Choke point[\s\S]*Running guides/.test(await f.locator('.sumrow').innerText()));
    const others=await f.locator('.row input').evaluateAll((a)=>a.map((i)=>[i.closest('.row').dataset.i,i.value].join(':')));
    await f.locator('.row[data-i="4"] button[data-st="1"]').click();
    const moved=await f.locator('.row input').evaluateAll((a)=>a.map((i)=>[i.closest('.row').dataset.i,i.value].join(':')));
    ck('Adjusting one guide changes only that guide; every other position is untouched',moved.every((v,i)=>v.startsWith('4:')?v==='4:557.3':v===others[i]),{others,moved});
    await f.locator('.row[data-i="4"] button[data-st="-1"]').click();
    await f.locator('.seg button',{hasText:'Decimal in'}).first().click();
    const inchVal=await f.locator('.row[data-i="4"] input').inputValue();
    ck('Switching to decimal inches converts the displayed positions',inchVal==='21.900',inchVal);
    await f.locator('.seg button',{hasText:'Decimal in'}).first().click();
    await f.locator('button[data-rod]').first().click();
    ck('Choosing the 5\'6" chart rod loads its eight-guide row: reduction 16/8/5.5, stripper at 21.6 in, 8 guides',await f.locator('.row').count()===8&&/KL16H[\s\S]*KL8H/.test(await f.locator('.sumrow').innerText())&&(await f.locator('.row[data-i="0"] input').inputValue())==='33.600'&&(await f.locator('.row[data-i="7"] input').inputValue())==='0.000');
    await f.locator('.seg button',{hasText:'mm'}).first().click();await f.locator('button[data-rod]').nth(3).click();
    await f.locator('input[data-k="stem"]').fill('300');await f.locator('input[data-k="stem"]').press('Enter');await page.waitForTimeout(80);
    const stemFix=await f.locator('.row .num input').evaluateAll((a)=>a.map((i)=>parseFloat(i.value)));
    ck('Workshop: moving the reel stem 102 mm toward the tip recalculates automatically (8 + tip-top, all on the blank, tip-top at 0, labelled K-Labs-calculated)',stemFix.length===9&&stemFix[0]===0&&Math.min(...stemFix)>=0&&/K-Labs-calculated/.test(await f.locator('.warn').textContent())&&(await f.locator('.tag.off').count())===0,stemFix);
    await f.locator('button[data-fit]').click();await page.waitForTimeout(80);
    ck('Workshop: Set stem to fit returns to the published reference (10 rows, all reference)',await f.locator('.row').count()===10&&(await f.locator('.row .tag.published').count())===10);
    await f.locator('.seg button',{hasText:'Decimal in'}).first().click();
    await f.locator('button[data-rod]').nth(3).click();
    for(const [u,label] of [['frac','Fractional in'],['in','Decimal in']]){await f.locator('.seg button',{hasText:label}).first().click();await page.waitForTimeout(60);
      const info=await f.locator('body').evaluate(()=>{const c=document.querySelector('#app').cloneNode(true);c.querySelectorAll('button[data-unit=mm],textarea').forEach((x)=>x.remove());return {mm:(c.textContent.match(/.{20}\bmm\b.{6}/g)||[]).slice(0,2),stem:document.querySelector('input[data-k=stem]').value,blade:document.querySelector('input[data-k=blade]').value,first:document.querySelector('.row[data-i="0"] input').value};});
      ck('Workshop '+label+': no mm anywhere in the tool; blank, stem and stripper position converted',info.mm.length===0&&(u==='frac'?info.blade==='84'&&info.stem==='7 13/16'&&info.first==='48 11/16':info.blade==='84.000'&&info.stem==='7.800'&&info.first==='48.700'),info);}
    await f.locator('.seg button',{hasText:'mm'}).first().click();await page.waitForTimeout(60);
    ck('Workshop: back to mm restores the original values (2133.6 / 198.1 / 1237.0)',(await f.locator('input[data-k="blade"]').inputValue())==='2133.6'&&(await f.locator('input[data-k="stem"]').inputValue())==='198.1'&&(await f.locator('.row[data-i="0"] input').inputValue())==='1237.0');
    await f.locator('.seg button',{hasText:'Decimal in'}).first().click();
    await f.locator('#entrybox > summary').click();
    await f.locator('input[data-e=label]').fill('My 6 ft test');await f.locator('input[data-e=stripper]').fill('26.2');await f.locator('input[data-e=gaps]').fill('10 8 6.5 6 5.4 5 4.8 4.3');
    await f.locator('button[data-applyentry]').click();
    const eg={n:await f.locator('.row').count(),v:await f.locator('.row[data-i="0"] input').inputValue(),e:await f.locator('.err').allInnerTexts()};
    ck('Builder-entered chart measurements build a layout in the Workshop (9 guides; first guide 50 in from the tip)',eg.n===9&&eg.v==='50.000',eg);
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
    for(const [w,two] of [[390,false],[1440,true]]){({context,page,errors}=await boot(browser,base,{width:w,height:900}));await openKr(page);
      const lay=await page.evaluate(()=>{const d=document.querySelector('#krGuideHost iframe').contentDocument,a=d.querySelector('.s-gui').getBoundingClientRect(),b=d.querySelector('.s-sum').getBoundingClientRect();return {sideBySide:b.left>a.right-2,wide:Math.round(d.querySelector('main').getBoundingClientRect().width)};});
      ck(`${w}px: ${two?'desktop uses the width (rod/reel column beside layout and guides)':'phone stays a single compact column'}`,lay.sideBySide===two&&(two?lay.wide>900:lay.wide<=410),lay);await context.close();}
    ck('The layout numbers (positions and spacings) are identical at every size',new Set(snaps).size===1);

    // ---- Studio Settings unit preference reaches the tool; the tool never writes it back ----
    ({context,page,errors}=await boot(browser,base,{width:390,height:844}));
    await page.evaluate(()=>{localStorage.clear();goScreen('workshopLandingScreen');});
    const MATRIX=[['metric','mm','2133.6','198.1','1237.0',false],['decimal-inch','in','84.000','7.800','48.700',true],['fractional-inch','frac','84','7 13/16','48 11/16',true]];
    for(const [mode,unit,blade,stem,first,noMm] of MATRIX){
      await setPref(page,mode);await openKr(page);const u=await krUnit(page);
      ck(`Settings "${mode}" opens KR in ${unit}: blank, stem and stripper converted${noMm?', no mm anywhere':''}`,u.pressed===unit&&u.blade===blade&&u.stem===stem&&u.first===first&&(!noMm||!u.mmText)&&u.rows===10,u);
      await closeKr(page);
    }
    await setPref(page,'decimal-inch');await openKr(page);
    const prefBefore=await rawSettings(page);
    await fr(page).locator('.seg button',{hasText:'Fractional in'}).first().click();
    const local=await krUnit(page);
    ck('Choosing Fractional in inside KR updates KR (blank 84, stem 7 13/16, stripper 48 11/16) ...',local.pressed==='frac'&&local.blade==='84'&&local.first==='48 11/16'&&!local.mmText,local);
    ck('... without changing the global Settings preference (still Decimal in, storage byte-identical)',(await page.evaluate(()=>measurementDisplayMode()))==='decimal-inch'&&(await rawSettings(page))===prefBefore);
    await page.evaluate(()=>{renderWorkshopCalculator();render();});await page.waitForTimeout(80);
    ck('An unrelated Studio render does not override the temporary unit chosen inside KR',(await krUnit(page)).pressed==='frac');
    await closeKr(page);await openKr(page);
    const reopened=await krUnit(page);
    ck('Closing and reopening KR restores the Settings preference (Decimal in)',reopened.pressed==='in'&&reopened.blade==='84.000'&&reopened.first==='48.700',reopened);
    // adjustments and locks survive a Settings change made while KR is open; geometry identical
    await fr(page).locator('.row[data-i="4"] input').fill('22');await fr(page).locator('.row[data-i="4"] input').press('Enter');await fr(page).locator('.row[data-i="5"] button[data-lock]').click();await page.waitForTimeout(60);
    await setPref(page,'metric');await page.evaluate(()=>renderWorkshopCalculator());await page.waitForTimeout(120);
    const afterU=await krUnit(page);
    ck('A Settings change made while KR is open is adopted (mm); guide #5 stays at 558.8 mm, adjusted, #6 stays locked, stripper unchanged',afterU.pressed==='mm'&&afterU.first==='1237.0'&&(await fr(page).locator('.row[data-i="4"] input').inputValue())==='558.8'&&(await fr(page).locator('.row[data-i="4"] .tag').innerText())==='adjusted'&&(await fr(page).locator('.row[data-i="5"] button[data-lock]').getAttribute('aria-pressed'))==='true',afterU);
    await closeKr(page);
    await page.evaluate(()=>{studioSettings.measurementUnits=undefined;studioSettings.imperialDisplay=undefined;});await openKr(page);
    ck('A missing preference opens KR safely in mm',(await krUnit(page)).pressed==='mm');
    ck('No page errors during the Settings unit checks',errors.length===0,errors);
    await context.close();
    ({context,page,errors}=await boot(browser,base,{width:390,height:844},true));
    const cached=await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js');await navigator.serviceWorker.ready;const k=(await caches.keys()).find((x)=>x.startsWith('klabs-studio-app-shell-'));const c=await caches.open(k);return {k,a:!!(await c.match(new URL('kr-guide-layout/index.html',location.href))),b:!!(await c.match(new URL('js/kr-guide-layout-host.js',location.href)))};});
    ck('Service worker precaches the KR document and host script',cached.a&&cached.b&&/build148-v252/.test(cached.k),cached);
    await page.reload({waitUntil:'load'});
    for(const s of SCRIPTS)await page.addScriptTag({url:`${base}/js/${s}`});
    await page.evaluate(()=>{window.KLABS_ACCOUNT_ID='aaaaaaaa-0000-0000-0000-000000000001';document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');});
    await context.setOffline(true);
    await openKr(page);
    ck('Offline: the tool opens from the service-worker cache and calculates',await fr(page).locator('.row').count()===10&&(await fr(page).locator('.row[data-i="4"] input').inputValue())==='556.3');
    await closeKr(page);await setPref(page,'fractional-inch');await openKr(page);
    const offU=await krUnit(page);
    ck('Offline: KR still opens in the Settings unit (fractional inch) from the cached document',offU.pressed==='frac'&&offU.blade==='84'&&offU.first==='48 11/16',offU);
    await context.setOffline(false);await context.close();
  }finally{await browser.close();server.close();}
  console.log(`PASS: ${passed} KR Guide Layout browser integration checks (${process.env.TDS_BROWSER||'chromium'}).`);
}
main().catch((e)=>{console.error(e);process.exitCode=1;});
