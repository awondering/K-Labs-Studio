// Browser checks: Administration -> Access status dropdown stays fully visible and selectable above the fixed bottom navigation.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/admin-access-dropdown-browser.cjs
// Chromium only (WebKit/Safari is not available in this environment). Synthetic layout only; all other network refused.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_MODULE);
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
let passed=0;
const ck=(name,cond,detail)=>{assert.ok(cond,`${name}${detail===undefined?'':' '+JSON.stringify(detail)}`);passed++;console.log('PASS',name);};
const OPTIONS=['all','trial_eligible','trial','expired','complimentary','grandfathered','paid','blocked'];
const VIEWPORTS=[['iPhone 390x844',{width:390,height:844}],['iPhone SE 320x568',{width:320,height:568}],['iPhone 375x667',{width:375,height:667}],['Mac 1440x900',{width:1440,height:900}],['Mac 1280x720',{width:1280,height:720}]];
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
function serve(){
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://x').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
(async()=>{
  const server=await serve();const base='http://127.0.0.1:'+server.address().port;
  const browser=await playwright.chromium.launch();
  for(const [name,vp] of VIEWPORTS){
    for(const rows of [0,4]){
      const ctx=await browser.newContext({viewport:vp});
      await ctx.route('**/*',(rt)=>new URL(rt.request().url()).origin===base?rt.continue():rt.abort('blockedbyclient'));
      const page=await ctx.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
      await page.goto(base+'/',{waitUntil:'load'});
      for(const f of ['admin-panel.js'])await page.addScriptTag({url:`${base}/js/${f}`}).catch(()=>{});
      await page.evaluate((n)=>{
        document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');
        document.querySelectorAll('.screen').forEach((s)=>s.classList.remove('active'));
        const s=document.getElementById('adminAccessScreen');s.hidden=false;s.classList.add('active');
        const list=document.getElementById('adminBuilderList');list.innerHTML='';
        for(let i=0;i<n;i++){const d=document.createElement('div');d.style.cssText='height:64px;margin:6px 0';list.appendChild(d);}
        window.scrollTo(0,0);
      },rows);
      const label=`${name}, ${rows} listed builders`;
      // open the way a person does, from the picker's own position
      await page.locator('#adminStatusPicker>summary').click();await sleep(150);
      const geo=await page.evaluate(()=>{
        const nav=document.querySelector('.bottom-nav').getBoundingClientRect();
        const d=document.getElementById('adminStatusPicker');
        const out=[...d.querySelectorAll('[data-admin-status]')].map((b)=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
          return {o:b.dataset.adminStatus,top:r.top,bottom:r.bottom,clickable:hit===b};});
        return {navTop:nav.top,vh:innerHeight,vw:innerWidth,out,pos:getComputedStyle(d.querySelector('.admin-status-picker__options')).position,overflowX:document.documentElement.scrollWidth>innerWidth};
      });
      ck(`${label}: all eight options are listed`,geo.out.map((o)=>o.o).join()===OPTIONS.join());
      ck(`${label}: every option is inside the viewport and above the bottom navigation`,geo.out.every((o)=>o.top>=-1&&o.bottom<=geo.navTop+1),{navTop:geo.navTop,out:geo.out.filter((o)=>o.top<-1||o.bottom>geo.navTop+1)});
      ck(`${label}: every option is the element under its own centre point (not covered)`,geo.out.every((o)=>o.clickable),geo.out.filter((o)=>!o.clickable).map((o)=>o.o));
      ck(`${label}: no horizontal overflow`,!geo.overflowX);
      // choose the lowest option with a real click and confirm the existing filter logic ran
      await page.locator('[data-admin-status="blocked"]').click();await sleep(100);
      const after=await page.evaluate(()=>({value:document.getElementById('adminBuilderStatusFilter').value,label:document.getElementById('adminBuilderStatusValue').textContent,open:document.getElementById('adminStatusPicker').open,
        pressed:document.querySelector('[data-admin-status="blocked"]').getAttribute('aria-pressed')}));
      ck(`${label}: choosing Blocked sets the filter, label and pressed state and closes the list`,after.value==='blocked'&&after.label==='Blocked'&&after.open===false&&after.pressed==='true',after);
      ck(`${label}: no page errors`,errors.length===0,errors);
      await ctx.close();
    }
  }
  const stat=fs.readFileSync(path.join(root,'js','admin-panel.js'),'utf8');
  ck('filter and value logic still reads the hidden select',/byId\("adminBuilderStatusFilter"\)\?\.value \|\| "all"/.test(stat));
  await browser.close();server.close();
  console.log(`PASS: ${passed} Administration access-status dropdown browser checks (chromium).`);
})().catch((e)=>{console.error(e);process.exit(1);});
