// KR Guide Layout integration into the Workshop: wiring, isolation, offline precache, host behaviour, labelling.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const html=read('index.html');
const ui=read('js','ui.js');
const css=read('css','studio.css');
const worker=read('service-worker.js');
const bootstrap=read('js','public-entry.js');
const bundle=read('kr-guide-layout','index.html');
const Host=require('../js/kr-guide-layout-host.js');

test('KR Guide Layout is its own Workshop entry; Guide Setup, Thread Design Studio and Thread Wrap Designer are still there',()=>{
  const list=html.match(/<div id="workshopToolsList"[\s\S]*?<\/div>\s*<article/)[0];
  assert.equal((list.match(/data-workshop-tool-open="kr-guide"/g)||[]).length,1);
  assert.match(list,/KR Guide Layout<\/span>/);
  assert.doesNotMatch(list.match(/<button[^>]*data-workshop-tool-open="kr-guide"[^>]*>/)[0],/\shidden/);
  ['guide-spacing','grip','diameter','thread-studio'].forEach((tool)=>assert.ok(list.includes(`data-workshop-tool-open="${tool}"`),tool));
  assert.match(html,/<article id="workshopToolThreadWrap"[^>]*hidden>/);
  const card=html.match(/<article id="workshopToolKrGuide"[\s\S]*?<\/article>/)[0];
  assert.match(card,/class="layout-control-card workshop-tool-card kr-guide-card"[^>]*hidden/);
  assert.ok(card.includes('data-workshop-tool-back'));
  assert.ok(card.includes('id="krGuideHost"'));
  assert.equal((html.match(/id="workshopToolKrGuide"/g)||[]).length,1);
});

test('the KR launcher describes the tool without implying endorsement or specifications',()=>{
  const launcher=html.match(/<button[^>]*data-workshop-tool-open="kr-guide"[\s\S]*?<\/button>/)[0];
  assert.doesNotMatch(launcher,/official|endorse|approved|certified|guarantee|exact|spec(?:ification)?\b/i);
  assert.doesNotMatch(launcher,/Fuji/i,'the launcher does not use the manufacturer name as branding');
});

test('script order, service worker precache and cache version',()=>{
  assert.ok(bootstrap.indexOf('js/kr-guide-layout-host.js')>bootstrap.indexOf('js/guide-train.js') && bootstrap.indexOf('js/kr-guide-layout-host.js')<bootstrap.indexOf('js/ui.js'));
  const context={URL,self:{registration:{scope:'https://example.test/'},addEventListener:()=>{}}};
  vm.runInNewContext(worker+';globalThis.assets=APP_SHELL_ASSETS;',context);
  for(const asset of ['js/kr-guide-layout-host.js','kr-guide-layout/index.html','js/thread-studio-host.js','thread-studio/index.html']){
    assert.ok(context.assets.includes(asset),`${asset} precached`);
    assert.ok(fs.existsSync(path.join(root,asset)),`${asset} exists`);
  }
  assert.equal((worker.match(/build148-v\d+/g)||[]).length,1);
});

test('ui.js wiring: open mapping, visibility, focus return and render hook',()=>{
  assert.match(ui,/tool==='kr-guide'\?'kr-guide':'diameter'/);
  assert.match(ui,/krGuideCard\.hidden=activeTool!=='kr-guide'/);
  assert.match(ui,/workshopLandingReturnFocusTool==='kr-guide'/);
  assert.match(ui,/renderThreadStudioTool\(\);\s*renderKrGuideTool\(\);/);
  assert.match(ui,/tool==='thread-studio' \|\| tool==='kr-guide'\s*\?''/,'neither framed tool tries to focus a hidden input');
});

test('renderKrGuideTool mounts only while its card is open, once, and unmounts when another tool opens',()=>{
  const calls=[];let mounted=false;const host={};
  const opts=[];let mode='decimal-inch';
  const api={isMounted:()=>mounted,mount:(h,o)=>{calls.push('mount');opts.push(o);mounted=true;},unmount:()=>{calls.push('unmount');mounted=false;},syncMode:(h,m)=>{calls.push('sync:'+m);}};
  const c=vm.createContext({workshopToolsState:{activeTool:'list'},KLabsKrGuideLayoutHost:api,measurementDisplayMode:()=>mode,$:(id)=>id==='krGuideHost'?host:null});
  const start=ui.indexOf('function renderKrGuideTool(');vm.runInContext(ui.slice(start,ui.indexOf('\n}',start)+2),c);
  c.renderKrGuideTool();c.workshopToolsState.activeTool='kr-guide';c.renderKrGuideTool();c.renderKrGuideTool();
  c.workshopToolsState.activeTool='thread-studio';c.renderKrGuideTool();
  assert.deepEqual(calls,['unmount','mount','sync:decimal-inch','unmount']);
  assert.equal(JSON.stringify(opts),'[{"mode":"decimal-inch"}]','the Settings measurement mode is passed at mount');
});

test('host: frame styles are injected ahead of the tool and content height is measured from the document',()=>{
  const doc=Host.buildSrcdoc('<!doctype html><html><head><title>t</title></head><body></body></html>');
  assert.match(doc,/<head><script>window\.__KR_HOST__=\{"unit":"mm"\};<\/script><style>html,body\{min-height:0!important/);
  const fake={documentElement:{scrollHeight:900},body:{getBoundingClientRect:()=>({bottom:880})},querySelector:()=>({getBoundingClientRect:()=>({bottom:910.2})})};
  assert.equal(Host.contentHeight(fake),911);
  assert.equal(Host.contentHeight(null),0);
});

test('host: Settings mode maps to the tool unit, anything else is metric, and the unit is embedded in the document',()=>{
  assert.equal(Host.unitForMode('metric'),'mm');assert.equal(Host.unitForMode('decimal-inch'),'in');assert.equal(Host.unitForMode('fractional-inch'),'frac');
  for(const bad of [undefined,null,'',' ','imperial','FRAC',42,{}])assert.equal(Host.unitForMode(bad),'mm',String(bad));
  const html='<!doctype html><html><head></head><body></body></html>';
  assert.match(Host.buildSrcdoc(html,'in'),/__KR_HOST__=\{"unit":"in"\}/);
  assert.match(Host.buildSrcdoc(html,'frac'),/__KR_HOST__=\{"unit":"frac"\}/);
  assert.match(Host.buildSrcdoc(html,'</script><b>'),/__KR_HOST__=\{"unit":"mm"\}/,'unknown values cannot inject markup');
});

test('host: syncMode pushes only when the Settings preference changed, never for an unrelated render',()=>{
  const sent=[];const state={unit:'in',frame:{contentWindow:{postMessage:(m)=>sent.push(m)}}};const host={__krGuide:state};
  assert.equal(Host.syncMode(host,'decimal-inch'),false);assert.equal(sent.length,0);
  assert.equal(Host.syncMode(host,'metric'),true);assert.deepEqual(sent,[{type:'klabs-kr-guide',action:'set-unit',unit:'mm'}]);
  assert.equal(Host.syncMode(host,'metric'),false);assert.equal(sent.length,1);
  assert.equal(Host.syncMode({},'metric'),false);
});

function fakeHost(){
  const mk=()=>({attrs:{},children:[],listeners:{},set innerHTML(v){this._h=v;this.children=[];},get innerHTML(){return this._h||'';},
    setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},removeAttribute(k){delete this.attrs[k];},
    appendChild(c){this.children.push(c);},addEventListener(t,f){this.listeners[t]=f;},querySelector:()=>null,style:{}});
  const win={fetch:null};
  const doc={createElement:()=>Object.assign(mk(),{contentWindow:null,contentDocument:null}),defaultView:win};
  return Object.assign(mk(),{ownerDocument:doc});
}
test('host: mount loads the document into a titled frame that does not scroll on its own; unmount cleans up',async()=>{
  const host=fakeHost();
  Host.mount(host,{fetchImpl:async()=>({ok:true,text:async()=>'<html><head></head><body></body></html>'})});
  assert.equal(host.getAttribute('data-kr-guide-state'),'loading');
  await new Promise((r)=>setTimeout(r,10));
  assert.equal(host.getAttribute('data-kr-guide-state'),'ready');
  const frame=host.children[0];
  assert.equal(frame.attrs.title,'KR Guide Layout');
  assert.equal(frame.attrs.scrolling,'no');
  assert.match(frame.srcdoc,/min-height:0!important/);
  assert.equal(Host.isMounted(host),true);
  assert.equal(Host.unmount(host),true);
  assert.equal(Host.isMounted(host),false);
  assert.equal(Host.unmount(host),false);
});
test('host: a failed load shows a plain message with Try again, not a blank card',async()=>{
  const host=fakeHost();
  Host.mount(host,{fetchImpl:async()=>{throw new Error('offline');}});
  await new Promise((r)=>setTimeout(r,10));
  assert.equal(host.getAttribute('data-kr-guide-state'),'error');
  assert.match(host.innerHTML,/could not load/);
  assert.match(host.innerHTML,/data-kr-guide-retry/);
});

test('isolation: the KR tool has no network, storage, account, Supabase or Studio-data access',()=>{
  const code=['engine','app'].map((n)=>read('kr-guide-layout','src',`${n}.js`)).join('\n');
  assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|supabase|KLABS_|klabs-workshop|document\.cookie/i);
  assert.doesNotMatch(bundle,/<link[^>]+https?:|<script[^>]+src=["']https?:/,'no external resources, so it works offline');
  const hostCode=read('js','kr-guide-layout-host.js');
  assert.doesNotMatch(hostCode,/localStorage|sessionStorage|KLABS_ACCOUNT|supabase/i);
});

test('chart data: the Fuji chart values live only in src/chart-data.js (with provenance); non-endorsement and unverified items stated; no demo values',()=>{
  const dir=path.join(root,'kr-guide-layout');
  const files=[];(function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);e.isDirectory()?walk(f):files.push(f);}})(dir);
  const data=path.join(dir,'src','chart-data.js');assert.ok(fs.existsSync(data));
  const dtext=fs.readFileSync(data,'utf8');
  assert.match(dtext,/Fuji.s data, not a K-Labs specification/);assert.match(dtext,/not\s+affiliated with or endorsed by Fuji/);assert.match(dtext,/only place the chart values live/);
  // Row-value signatures must not be duplicated in hand-written source files (the bundle inlines chart-data.js by design).
  for(const f of files){if(f===data||/index\.html$|VERIFICATION\.md$|tests\.js$/.test(f))continue;const t=fs.readFileSync(f,'utf8');assert.doesNotMatch(t,/6\.6,\s*5\.9,\s*5\.3|27\.5,\s*9\.0/,`${path.relative(root,f)} duplicates chart rows`);}
  assert.doesNotMatch(bundle,/Invented demonstration values|DEMO_REFERENCE|demonstration values/);
  assert.match(bundle,/KR_CHART_DATA/);assert.match(bundle,/data-rod/);assert.match(bundle,/data-applyentry/);
  assert.match(bundle,/independent K-Labs Studio tool. It is not affiliated with or endorsed by Fuji/);
  assert.match(bundle,/K-Labs heuristic, not a Fuji layout/);assert.match(bundle,/Experimental, not Fuji/);
  assert.match(bundle,/unverified/i);assert.match(bundle,/foot placement/);
  assert.match(read('kr-guide-layout','VERIFICATION.md'),/Still unverified/);
});

test('the KR engine suite passes',()=>{
  const dir=path.join(root,'kr-guide-layout','src');
  const r=spawnSync(process.execPath,[path.join(dir,'tests.js')],{encoding:'utf8',cwd:dir});
  assert.equal(r.status,0,r.stdout.split('\n').filter((l)=>/^FAIL/.test(l)).join('\n'));
  assert.match(r.stdout,/95\/95 passed/);
});

test('every new style rule is scoped to the KR Guide Layout card so other Workshop tools are untouched',()=>{
  const start=css.indexOf('/* KR Guide Layout (Workshop)');
  const end=css.indexOf('/* Thread Design Studio (Workshop)');
  assert.ok(start>0 && end>start);
  const block=css.slice(start,end).replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=[...block.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m)=>m[2].trim()).filter(Boolean);
  assert.ok(selectors.length>=6);
  for(const group of selectors)for(const sel of group.split(',').map((x)=>x.trim()))assert.ok(/kr-guide/.test(sel),`unscoped selector: ${sel}`);
});
