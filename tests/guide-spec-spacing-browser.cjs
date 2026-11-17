// Browser checks: Build -> Guide Positions & Angles shows per-guide Spacing (presentation only). Synthetic data only.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/guide-spec-spacing-browser.cjs
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
const render=(page,{units,cums,angles})=>page.evaluate(({units,cums,angles})=>{
  goScreen('workshopScreen');showStudioWorkflow();
  studioSettings.measurementUnits=units;
  quote.guideSpecification={guideCount:cums.length,firstGuideMm:cums[0],targetStripperMm:cums[cums.length-1],spiralMethod:'standard',spiralAngles:angles};
  buildGuideView=()=>({firstGuide:cums[0],guideCount:cums.length,targetStripper:cums[cums.length-1],method:'standard',direction:'left',rodStyle:'',angles,rows:cums.map((cum,i)=>({g:i+1,cum}))});
  updateWorkshopSectionVisibility();
  expandWorkshopCollapsibleSection('workshopBuildDetailsBody',{instant:true});
  const d=document.querySelector('.guide-specification__details');d.hidden=false;d.open=true;
  renderGuideSpecificationSummary();
  const rows=[...document.querySelectorAll('#guideSpecRows .guide-specification__row')].map((r)=>[...r.children].map((c)=>c.textContent.trim()));
  const head=document.querySelector('.guide-specification__head');
  const cells=(e)=>[...e.children].map((c)=>{const b=c.getBoundingClientRect();return {l:b.left,r:b.right,w:b.width};});
  const host=document.getElementById('guideSpecRows').getBoundingClientRect();
  const rowBoxes=[...document.querySelectorAll('#guideSpecRows .guide-specification__row')].map((r)=>({h:r.getBoundingClientRect().height,sw:r.scrollWidth,cw:r.clientWidth,cells:cells(r)}));
  return {rows,head:[...head.children].map((c)=>c.textContent.trim()),headCells:cells(head),rowBoxes,host:{l:host.left,r:host.right},docW:document.documentElement.scrollWidth,vw:innerWidth,stored:JSON.stringify(quote.guideSpecification)};
},{units,cums,angles});
async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    for(const vp of [{width:320,height:700},{width:390,height:844},{width:1280,height:800}]){
      const {page,errors}=await boot(browser,base,vp);
      await page.evaluate(()=>localStorage.clear());
      const tag=`${vp.width}px metric`;
      const before=await page.evaluate(()=>0);
      const g=await render(page,{units:'metric',cums:[140,305,501],angles:[0,0,0]});
      ck(`${tag}: rows show Guide / Position / Spacing / Angle for the 140-305-501 example`,JSON.stringify(g.rows)===JSON.stringify([['Guide 1','140','140','0\u00b0'],['Guide 2','305','165','0\u00b0'],['Guide 3','501','196','0\u00b0']]),g.rows);
      ck(`${tag}: header names Spacing (mm) and Position (mm)`,g.head.join('|')==='Guide|Position (mm)|Spacing (mm)|Angle',g.head);
      ck(`${tag}: no horizontal overflow`,g.docW<=g.vw,{docW:g.docW,vw:g.vw});
      ck(`${tag}: header columns line up with the row columns`,g.rowBoxes.every((r)=>r.cells.every((c,i)=>Math.abs(c.r-g.headCells[i].r)<1.5)),{head:g.headCells,row:g.rowBoxes[0].cells});
      ck(`${tag}: cells stay inside the row (no clipped or overflowing text)`,g.rowBoxes.every((r)=>r.sw<=r.cw+1)&&g.rowBoxes.every((r)=>r.cells.every((c)=>c.l>=g.host.l-1&&c.r<=g.host.r+1)),g.rowBoxes[0]);
      ck(`${tag}: rows stay compact`,g.rowBoxes.every((r)=>r.h<=30),g.rowBoxes.map((r)=>r.h));
      ck(`${tag}: nothing extra is stored on the guide specification`,!/spacing/i.test(g.stored),g.stored);
      const many=await render(page,{units:'metric',cums:Array.from({length:12},(_,i)=>100*(i+1)+i*7),angles:Array.from({length:12},(_,i)=>i*3)});
      ck(`${tag}: twelve guides all show a numeric spacing`,many.rows.length===12&&many.rows.every((r)=>/^\d+$/.test(r[2])),many.rows.map((r)=>r[2]));
      const imp=await render(page,{units:'imperial',cums:[127,254,381],angles:[0,0,0]});
      ck(`${vp.width}px imperial: header and cells use inches`,imp.head[1]==='Position (in)'&&imp.head[2]==='Spacing (in)'&&imp.rows.every((r)=>!/mm/.test(r.join(' '))),{head:imp.head,rows:imp.rows});
      ck(`${vp.width}px imperial: first spacing equals first position`,imp.rows[0][1]===imp.rows[0][2],imp.rows);
      ck(`${vp.width}px imperial: no horizontal overflow`,imp.docW<=imp.vw,{docW:imp.docW,vw:imp.vw});
      ck(`${tag}: no page errors`,errors.length===0,errors);
      await page.context().close();
    }
    console.log(`PASS: ${passed} guide spacing browser checks (chromium).`);
  }finally{await browser.close();server.close();}
}
main().catch((e)=>{console.error(e);process.exit(1);});
