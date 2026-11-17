// Browser integration for synchronisation: the real UI scripts, sync engine and review dialog against an in-memory cloud.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/sync-review-browser.cjs
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
const SCRIPTS=['config.js','storage.js','guide-layout.js','thread-wrap.js','guide-train.js','thread-studio-host.js','kr-guide-layout-host.js','studio-visuals.js','navigation.js','business-logo.js','invoice-pdf.js','ui.js','build-sync-journal.js','guarded-build-transport.js','build-sync.js','build-sync-diff.js','build-sync-review.js'];
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
const ACCT=A;
const install=(page)=>page.evaluate((acct)=>{
  window.KLABS_BUILD_TAB_LOCK={owns:()=>true,async acquire(){},release(){}};   // this test page is the only tab
  window.__cloud=new Map();let rev=0;const stamp=()=>new Date(Date.UTC(2026,10,1,0,0,++rev)).toISOString();
  window.__put=(id,payload)=>{window.__cloud.set(id,{user_id:acct,client_id:id,build_number:String(payload.buildNumber||''),payload:JSON.parse(JSON.stringify(payload)),updated_at:stamp()});return window.__cloud.get(id);};
  window.KLABS_SUPABASE_CLIENT={
    auth:{async getUser(){return {data:{user:{id:acct}},error:null};}},
    async rpc(fn){return fn==='klabs_build_guard_version'?{data:2,error:null}:{data:true,error:null};},
    from(){const q={f:{}};const api={select(){return api;},order(){return api;},range(){return api;},eq(k,v){q.f[k]=v;return api;},
      update(row){q.op='update';q.row=row;return api;},insert(row){q.op='insert';q.row=row;return api;},
      then(res,rej){return Promise.resolve().then(exec).then(res,rej);}};
      function exec(){
        if(!q.op){const all=[...window.__cloud.values()];return {data:JSON.parse(JSON.stringify(all)),error:null,count:all.length};}
        if(q.op==='insert'){const p={...q.row.payload};delete p._buildGuardCreate;const r=window.__put(q.row.client_id,p);return {data:[JSON.parse(JSON.stringify(r))],error:null};}
        const cur=window.__cloud.get(q.f.client_id);if(!cur||cur.updated_at!==q.f.updated_at)return {data:[],error:null};
        const p={...q.row.payload};delete p._expectedBuildRevision;const r=window.__put(q.f.client_id,p);return {data:[JSON.parse(JSON.stringify(r))],error:null};}
      return api;}};
},ACCT);
const rec=(extra)=>({id:'X',buildNumber:'B-1',customerName:'Synthetic Customer',buildName:'Rod X',quoteStatus:'active',savedAt:'2026-11-13T21:16:48.680Z',updatedAt:'2026-11-13T21:16:48.680Z',notes:'',payments:[],...extra});
const startSync=(page)=>page.evaluate(async(acct)=>{await window.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:acct}});await window.KLABS_BUILD_SYNC.retry();},ACCT);
const state=(page)=>page.evaluate(()=>({status:window.KLABS_BUILD_SYNC.getStatus(),conflicts:Object.keys(window.KLABS_BUILD_SYNC.getConflicts()),notes:quote.notes,noticeHidden:document.getElementById('buildSyncNotice').hidden}));
async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    // ---- A/B: the real open-build hooks ----
    let {context,page,errors}=await boot(browser,base,{width:390,height:844});
    await page.evaluate(()=>localStorage.clear());await install(page);
    await page.evaluate((r)=>{reloadBusinessProfileForAccount();Store.set(buildsStorageKey(),[r]);quote=normalizeQuote(r);saveQuoteCurrent();window.__put('X',r);},rec());
    await startSync(page);
    ck('first synchronisation of an identical build is synced',(await state(page)).status==='synced');
    ck('the build is treated as open but not as being edited',await page.evaluate(()=>window.KLABS_UI.isBuildOpen('X')&&!window.KLABS_UI.hasUnsavedEdits('X')));
    await page.evaluate((r)=>window.__put('X',r),rec({notes:'phone tweak',savedAt:'2026-11-16T23:41:23.111Z',updatedAt:'2026-11-16T23:41:23.111Z'}));
    await page.evaluate(()=>window.KLABS_BUILD_SYNC.retry());
    let st=await state(page);
    ck('unedited open build takes the newer cloud version: no conflict, in-memory build refreshed',st.status==='synced'&&!st.conflicts.length&&st.notes==='phone tweak'&&st.noticeHidden,st);
    ck('the saved local copy matches as well',await page.evaluate(()=>savedBuildRecords().find((r)=>r.id==='X').notes)==='phone tweak');
    // typing in progress: never overwritten
    await page.evaluate(()=>{hasUnsavedQuoteChanges=true;quote.notes='typed but not saved yet';});
    await page.evaluate((r)=>window.__put('X',r),rec({notes:'another phone edit',savedAt:'2026-11-17T00:10:00.000Z',updatedAt:'2026-11-17T00:10:00.000Z'}));
    await page.evaluate(()=>window.KLABS_BUILD_SYNC.retry());
    st=await state(page);
    ck('typing that is not saved yet is never overwritten and does not conflict',st.notes==='typed but not saved yet'&&!st.conflicts.length,st);
    await page.evaluate(()=>{hasUnsavedQuoteChanges=false;});

    // ---- C: a genuine conflict is explained field by field ----
    await context.close();
    ({context,page,errors}=await boot(browser,base,{width:390,height:844}));
    await page.evaluate(()=>localStorage.clear());await install(page);
    await page.evaluate((r)=>{reloadBusinessProfileForAccount();Store.set(buildsStorageKey(),[r]);window.__put('X',r);},rec({payments:[{id:'p1',type:'deposit',amount:816,date:'2026-11-13'}]}));
    await startSync(page);
    // Another device changes the notes and the build status; this one changes the notes too.
    await page.evaluate((r)=>window.__put('X',r),rec({payments:[{id:'p1',type:'deposit',amount:816,date:'2026-11-13'}],notes:'phone note',quoteStatus:'complete',savedAt:'2026-11-17T00:20:00.000Z'}));
    await page.evaluate((r)=>{const l=Store.get(buildsStorageKey(),[]);l[0]={...l[0],notes:'mac note',savedAt:'2026-11-17T00:21:00.000Z'};Store.set(buildsStorageKey(),l);window.KLABS_BUILD_SYNC.notifyBuildSaved(l[0]);},rec());
    await page.evaluate(()=>window.KLABS_BUILD_SYNC.retry());
    st=await state(page);
    ck('same-field edit on two devices is a real conflict and shows the notice',st.status==='error'&&st.conflicts.length===1&&!st.noticeHidden,st);
    await page.evaluate(()=>{document.getElementById('buildSyncReviewButton').click();});
    const dialog=await page.evaluate(()=>{const d=document.getElementById('buildSyncReview');return {open:d.open,pre:d.querySelectorAll('pre').length,text:d.innerText,rows:[...d.querySelectorAll('.build-sync-review__table tr')].map((r)=>r.innerText.replace(/\s+/g,' ')),buttons:[...d.querySelectorAll('.build-sync-review__choice button')].map((b)=>({t:b.textContent,disabled:b.disabled}))};});
    if(process.env.SYNC_SHOT)await page.screenshot({path:process.env.SYNC_SHOT});
    ck('the review dialog opens and shows no raw JSON',dialog.open&&dialog.pre===0&&!/[{}]"|"id":/.test(dialog.text),dialog.text.slice(0,200));
    ck('it names the build by customer and build name',/Synthetic Customer — Rod X/.test(dialog.text));
    ck('it lists the differing fields with both values and who changed them',dialog.rows.some((r)=>/Notes/.test(r)&&/mac note/.test(r)&&/phone note/.test(r)&&/both/.test(r)),dialog.rows);
    ck('status change made only in the cloud is attributed to the cloud',dialog.rows.some((r)=>/Status/.test(r)&&/complete/.test(r)&&/cloud/.test(r)),dialog.rows);
    ck('both resolution choices are explained and enabled',dialog.buttons.length===2&&dialog.buttons.every((b)=>!b.disabled)&&/archived/.test(dialog.text),dialog.buttons);
    const report=await page.evaluate(()=>{const c=Object.values(window.KLABS_BUILD_SYNC.getConflicts())[0];return window.KLABS_BUILD_SYNC_DIFF.redactedReport(c,window.KLABS_BUILD_SYNC.getConflictContext()[c.id]);});
    ck('the diagnostics report contains no customer text',!/Synthetic|phone note|mac note/.test(report)&&/changedBy/.test(report),report.slice(0,160));
    await page.evaluate(()=>{window.confirm=()=>true;});
    await page.locator('.build-sync-review__choice button').first().click();   // "Use the cloud version"
    await page.waitForFunction(()=>!Object.keys(window.KLABS_BUILD_SYNC.getConflicts()).length);
    const after=await page.evaluate(()=>({notes:savedBuildRecords().find((r)=>r.id==='X').notes,archived:JSON.parse(localStorage.getItem('klabs-build-sync-journal:'+window.KLABS_ACCOUNT_ID)).archive.filter((a)=>a.choice==='cloud').length,msg:document.getElementById('buildSyncReviewMessage').textContent}));
    ck('choosing the cloud version resolves it, keeps the cloud text and archives both versions',after.notes==='phone note'&&after.archived===1&&/Nothing needs review/.test(after.msg),after);
    await context.close();

    // ---- D: financial differences never allow "keep this device" ----
    ({context,page,errors}=await boot(browser,base,{width:390,height:844}));
    await page.evaluate(()=>localStorage.clear());await install(page);
    await page.evaluate((r)=>{reloadBusinessProfileForAccount();Store.set(buildsStorageKey(),[r]);window.__put('X',r);},rec());
    await startSync(page);
    await page.evaluate((r)=>window.__put('X',r),rec({payments:[{id:'p1',type:'deposit',amount:816,date:'2026-11-13'}],notes:'c'}));
    await page.evaluate(()=>{const l=Store.get(buildsStorageKey(),[]);l[0]={...l[0],notes:'d',payments:[{id:'pz',type:'deposit',amount:5,date:'2026-11-17'}]};Store.set(buildsStorageKey(),l);window.KLABS_BUILD_SYNC.notifyBuildSaved(l[0]);});
    await page.evaluate(()=>window.KLABS_BUILD_SYNC.retry());
    await page.evaluate(()=>{document.getElementById('buildSyncReviewButton').click();});
    const fin=await page.evaluate(()=>({text:document.getElementById('buildSyncReview').innerText,buttons:[...document.querySelectorAll('#buildSyncReview .build-sync-review__choice button')].map((b)=>({t:b.textContent,disabled:b.disabled}))}));
    ck('payment differences are flagged and "keep this device" is disabled with the reason',/Payment, price or invoice details differ/.test(fin.text)&&fin.buttons[1].disabled&&!fin.buttons[0].disabled&&/recording a payment or invoice/.test(fin.text),fin);
    ck('no page errors',errors.length===0,errors);
    await context.close();
  }finally{await browser.close();server.close();}
  console.log(`\n${passed} checks passed`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
