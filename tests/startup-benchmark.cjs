// Startup benchmark for K-Labs Studio (optional; needs Playwright, like the other *-browser.cjs checks).
//   PLAYWRIGHT_MODULE=/path/to/playwright node tests/startup-benchmark.cjs [repoRoot] [label] [runsPerScenario]
//   Environment: PROFS=lan,4g  ONLY=auth-repeat,...  WF=1 (print one run's request waterfall)  BENCH_OUT=dir for the JSON result.
// It serves the checkout from a local server that behaves like the production host (gzip, ETag, revalidate-always caching)
// and replaces Supabase with a local stub (fixed 120 ms latency, synthetic signed-in session, no real account or data).
// Profile "4g" adds 100 ms round trip + 1.5 MB/s to EVERY response (page and service-worker traffic) and a 4x CPU slowdown.
// These are emulated conditions in desktop Chromium. They are for comparing two builds under identical conditions and are
// NOT measurements of a real iPhone or of Safari.
// Local static server with gzip + validators (like a typical static host), CDP network + CPU throttling, stubbed Supabase with fixed latency.
const fs=require('fs'),path=require('path'),http=require('http'),zlib=require('zlib'),os=require('os'),crypto=require('crypto');
const pw=require(process.env.PLAYWRIGHT_MODULE);
const root=path.resolve(process.argv[2]||path.join(__dirname,'..')),label=process.argv[3]||'run',RUNS=+(process.argv[4]||3);
const SB_MS=120;
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.webmanifest':'application/json'};
const PROFILES={lan:null,'4g':{rtt:100,bw:1.5e6,cpu:4}};   // 4g: every response (page AND service-worker traffic) delayed by 100 ms RTT + size/1.5 MB/s, 4x CPU slowdown
let NETDELAY=null;   // 4g: 100 ms RTT, 12 Mbps, 4x CPU slowdown (mid-range phone)
const served=[];let BUMP=false;const sbCalls=[];const SBMS=SB_MS;
function serve(){return new Promise(r=>{const s=http.createServer(async(q,res0)=>{const u=new URL(q.url,'http://x');let p=decodeURIComponent(u.pathname);
  const res={writeHead:(...a)=>res0.writeHead(...a),end:b=>{const n=b?b.length:0;const d=NETDELAY?NETDELAY.rtt+n/NETDELAY.bw*1000:0;setTimeout(()=>res0.end(b),d);}};
  if(p.startsWith('/__sb/')){const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-max-age':'7200'};
    if(q.method==='OPTIONS'){await new Promise(r=>setTimeout(r,NETDELAY?NETDELAY.rtt:0));res0.writeHead(204,cors);return res0.end();}
    sbCalls.push(q.method+' '+p.slice(5));await new Promise(r=>setTimeout(r,SBMS));const last=p.split('/').pop();
    const j=b=>{res.writeHead(200,{'content-type':'application/json',...cors});res.end(JSON.stringify(b));};
    if(last==='get_account_entitlement')return j({access_state:'paid',can_write:true,email_verified:true,server_time:new Date().toISOString()});
    if(last==='klabs_account_is_blocked')return j(false);return j([]);}
  if(p.endsWith('/'))p+='index.html';
  let f=path.resolve(root,'.'+p);if(!fs.existsSync(f)&&p==='/js/vendor/supabase-2.119.0.js')f=path.join(__dirname,'..','js','vendor','supabase-2.119.0.js');   // pre-intro checkouts loaded it from a CDN
  if(!(f.startsWith(root+path.sep)||f.startsWith(path.join(__dirname,'..','js','vendor')+path.sep))||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
  let buf=fs.readFileSync(f);
  if(p==='/js/supabase-config.js')buf=Buffer.from(buf.toString().replace(/url:\s*"[^"]*"/,'url: "http://'+q.headers.host.replace('127.0.0.2','127.0.0.3')+'/__sb"'));
  if(p==='/index.html')buf=Buffer.from(buf.toString().replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','js/vendor/supabase-2.119.0.js'));
  if(p==='/service-worker.js'&&BUMP)buf=Buffer.from(buf.toString().replace(/build148-v222/g,'build148-bumped'));
  const etag='"'+crypto.createHash('md5').update(buf).digest('hex')+'"';served.push(p);
  const h={'content-type':types[path.extname(f)]||'application/octet-stream','etag':etag,'cache-control':'public,max-age=0,must-revalidate','vary':'accept-encoding'};
  if(q.headers['if-none-match']===etag){res.writeHead(304,h);return res.end();}
  if(/\.(html|js|css|svg|json)$/.test(f)&&/gzip/.test(q.headers['accept-encoding']||'')){h['content-encoding']='gzip';res.writeHead(200,h);return res.end(zlib.gzipSync(buf,{level:6}));}
  res.writeHead(200,h);res.end(buf);});s.listen(0,'0.0.0.0',()=>r(s));});}
const uid='aaaaaaaa-0000-0000-0000-000000000001';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const session=()=>{const exp=Math.floor(Date.now()/1000)+3000;const jwt=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:uid,exp,role:'authenticated',email:'bench@example.test'})+'.sig';
  return {access_token:jwt,token_type:'bearer',expires_in:3000,expires_at:exp,refresh_token:'r',user:{id:uid,aud:'authenticated',email:'bench@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}}};};
let OFFLINE=false;
const INIT=`(()=>{const m={};window.__perf=m;try{sessionStorage.__n=(+sessionStorage.__n||0)+1;}catch{}const t=()=>Math.round(performance.now());
 new PerformanceObserver(l=>{for(const e of l.getEntries()){if(e.name==='first-contentful-paint')m.fcp=Math.round(e.startTime);}}).observe({type:'paint',buffered:true});
 let lt=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())lt+=e.duration;m.longTaskMs=Math.round(lt);}).observe({type:'longtask',buffered:true});}catch{}
 const check=()=>{const b=document.body,a=document.getElementById('app'),au=document.getElementById('authScreen');if(!b||!a)return;
  const vis=e=>e&&e.style.display!=='none'&&!e.hidden;
  if(!m.publicHome&&b.classList.contains('klabs-logged-out')&&vis(a)&&!b.classList.contains('klabs-auth-resolving')){const btn=document.getElementById('publicSignInBtn');if(btn&&btn.getBoundingClientRect().width>0)m.publicHome=t();}
  if(!m.appReady&&!b.classList.contains('klabs-logged-out')&&!b.classList.contains('klabs-auth-resolving')&&vis(a)&&window.KLABS_UI&&window.KLABS_ACCOUNT_ID){m.appReady=t();try{sessionStorage.__abs=performance.timeOrigin+performance.now();}catch{}}};
 const mo=new MutationObserver(check);const go=()=>{if(!document.documentElement)return;mo.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:['class','style','hidden']});check();};
 document.addEventListener('readystatechange',go);go();setInterval(check,20);})();`;
async function once(browser,profileName,{auth,warm,offline,update}){
  const prof=PROFILES[profileName];const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bench-'));
  const srv=await serve();const port=srv.address().port,base='http://127.0.0.2:'+port+'/';
  const ctx=await pw.chromium.launchPersistentContext(dir,{headless:true,viewport:{width:390,height:844},serviceWorkers:'allow',args:['--no-proxy-server']});
  try{await ctx.addInitScript(INIT);
   if(auth)await ctx.addInitScript(`try{if(!localStorage.getItem('sb-127-auth-token'))localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session()))});}catch{}`);
   const open=async(throttle)=>{const pg=await ctx.newPage();const cdp=await ctx.newCDPSession(pg);
     NETDELAY=throttle&&prof?prof:null;if(throttle&&prof){await cdp.send('Emulation.setCPUThrottlingRate',{rate:prof.cpu});}
     return {pg,cdp};};
   if(warm){ // visit once (unthrottled) so the HTTP cache and, when authenticated, the service worker are populated, then settle
     const {pg}=await open(false);await pg.goto(base,{waitUntil:'load'});
     if(auth)await pg.waitForFunction(()=>window.__perf&&window.__perf.appReady,null,{timeout:60000}).catch(()=>{});
     await pg.evaluate(()=>navigator.serviceWorker&&navigator.serviceWorker.getRegistration().then(r=>r&&navigator.serviceWorker.ready)).catch(()=>{});
     await pg.waitForTimeout(auth?2500:300);await pg.close();}
   served.length=0;sbCalls.length=0;
   BUMP=!!update;OFFLINE=!!offline;if(offline)await ctx.setOffline(true);
   const {pg}=await open(true);const t0=Date.now();globalThis.t0=t0;const errs=[];pg.on('pageerror',e=>errs.push(e.message));if(process.env.WF)pg.on('framenavigated',f=>{if(f===pg.mainFrame())console.log('  NAV',Date.now()-t0,f.url().slice(-30));});if(process.env.WF)pg.on('console',c=>console.log('  console',c.type(),c.text().slice(0,160)));
   await pg.goto(base,{waitUntil:'commit'}).catch(()=>{});
   const want=auth?'appReady':'publicHome';
   await pg.waitForFunction(k=>window.__perf&&window.__perf[k],want,{timeout:offline?5000:40000}).catch(()=>{});
   let settled=null;
   if(update){await pg.waitForFunction(()=>+sessionStorage.__n>=2&&window.__perf&&window.__perf.appReady,null,{timeout:15000}).catch(()=>{});
     const T0=t0;settled=await pg.evaluate(()=>({n:+sessionStorage.__n,abs:+sessionStorage.__abs})).then(x=>({n:x.n,ms:Math.round(x.abs-T0)}),()=>null);}
   const wall=Date.now()-t0;
   await pg.waitForLoadState('load').catch(()=>{});await pg.waitForTimeout(auth?1200:500);
   const m=await pg.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0]||{};const r=performance.getEntriesByType('resource');
     return {...window.__perf,ttfb:Math.round(n.responseStart),dcl:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd),reqs:r.length,kb:Math.round(r.reduce((a,e)=>a+(e.transferSize||0),0)/1024),
       sw:!!navigator.serviceWorker.controller};}).catch(()=>({}));
   if(process.env.WF){const wf=await pg.evaluate(()=>performance.getEntriesByType('resource').map(e=>[e.name.replace(location.origin,''),Math.round(e.startTime),Math.round(e.responseEnd),e.transferSize,e.initiatorType]).sort((a,b)=>a[1]-b[1]));
     console.log('WATERFALL');wf.forEach(r=>console.log(String(r[1]).padStart(5),String(r[2]).padStart(5),String(r[3]).padStart(7),r[0].slice(0,60)));
     const lg=await pg.evaluate(()=>window.__logs||[]);console.log(lg.join('\n'));}
   m.wall=wall;m.settled=settled&&settled.ms;m.navs=settled&&settled.n;m.errors=errs.length;m.server=served.length;m.sb=sbCalls.length;return m;
  }finally{await ctx.close();srv.close();fs.rmSync(dir,{recursive:true,force:true});}}
const med=a=>{a=a.filter(x=>typeof x==='number').sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null;};
(async()=>{const out={label,runs:RUNS,results:{}};const browser=null;
 const scen=[['unauth-cold',{auth:0,warm:0}],['unauth-repeat',{auth:0,warm:1}],['unauth-offline',{auth:0,warm:1,offline:1}],['auth-cold',{auth:1,warm:0}],['auth-repeat',{auth:1,warm:1}],['auth-offline',{auth:1,warm:1,offline:1}],['auth-update',{auth:1,warm:1,update:1}]];
 for(const pn of (process.env.PROFS||'lan,4g').split(','))for(const [sn,o] of scen){if(process.env.ONLY&&!process.env.ONLY.split(',').includes(sn))continue;const rows=[];for(let i=0;i<RUNS;i++)rows.push(await once(null,pn,o));
  const keys=['settled','navs','ttfb','fcp','dcl','publicHome','appReady','load','longTaskMs','reqs','kb','server','sb','errors'];const r={};for(const k of keys)r[k]=med(rows.map(x=>x[k]));r.sw=rows.filter(x=>x.sw).length+'/'+rows.length;
  out.results[pn+' '+sn]=r;console.log(pn.padEnd(4),sn.padEnd(15),JSON.stringify(r));}
 fs.writeFileSync(path.join(process.env.BENCH_OUT||os.tmpdir(),`startup-${label}.json`),JSON.stringify(out,null,1));})();
