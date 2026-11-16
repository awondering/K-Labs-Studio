// Thread Design Studio integration into the Workshop: wiring, isolation, offline precache, host behaviour.
// The studio's own engine suite (thread-studio/src/tests.js) is run here too so one command covers both.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
const read=(...p)=>fs.readFileSync(path.join(root,...p),'utf8');
const html=read('index.html');
const ui=read('js','ui.js');
const css=read('css','studio.css');
const worker=read('service-worker.js');
const bootstrap=read('js','public-entry.js');
const Host=require('../js/thread-studio-host.js');

test('one Workshop entry: the Thread Design Studio replaces the Thread Wrap Designer launcher, which is reached from inside it',()=>{
  const list=html.match(/<div id="workshopToolsList"[\s\S]*?<\/div>\s*<article/)[0];
  assert.equal((list.match(/data-workshop-tool-open="thread-studio"/g)||[]).length,1);
  assert.equal(list.includes('data-workshop-tool-open="thread-wrap"'),false,'no second thread launcher');
  assert.match(list,/Thread Design Studio<\/span>/);
  assert.doesNotMatch(list.match(/<button[^>]*data-workshop-tool-open="thread-studio"[^>]*>/)[0],/\shidden/);
  assert.match(html,/<article id="workshopToolThreadWrap"[^>]*hidden>/,'tapered-blank designer kept, hidden until opened');
  const card=html.match(/<article id="workshopToolThreadStudio"[\s\S]*?<\/article>/)[0];
  assert.match(card,/class="layout-control-card workshop-tool-card thread-studio-card"[^>]*hidden/);
  assert.ok(card.includes('data-workshop-tool-back'));
  assert.ok(card.includes('id="threadStudioHost"'));
  ['guide-spacing','grip','diameter'].forEach((tool)=>assert.ok(list.includes(`data-workshop-tool-open="${tool}"`),tool));
});

test('script order, service worker precache and cache version',()=>{
  assert.ok(bootstrap.indexOf('js/thread-studio-host.js')>bootstrap.indexOf('js/guide-train.js') && bootstrap.indexOf('js/thread-studio-host.js')<bootstrap.indexOf('js/ui.js'));
  const handlers={};
  const context={URL,self:{registration:{scope:'https://example.test/'},addEventListener:(n,f)=>{handlers[n]=f;}}};
  vm.runInNewContext(worker+';globalThis.assets=APP_SHELL_ASSETS;',context);
  for(const asset of ['js/thread-studio-host.js','thread-studio/index.html']){
    assert.ok(context.assets.includes(asset),`${asset} precached`);
    assert.ok(fs.existsSync(path.join(root,asset)),`${asset} exists`);
  }
  assert.equal((worker.match(/build148-v\d+/g)||[]).length,1);
});

test('ui.js wiring: open mapping, visibility, focus return and render hook',()=>{
  assert.match(ui,/tool==='thread-studio'\?'thread-studio':tool==='kr-guide'\?'kr-guide':'diameter'/);
  assert.match(ui,/threadStudioCard\.hidden=activeTool!=='thread-studio'/);
  assert.match(ui,/workshopLandingReturnFocusTool==='thread-studio'/);
  assert.match(ui,/renderGuideTrainTool\(\);\s*renderThreadStudioTool\(\);\s*renderKrGuideTool\(\);/);
  assert.match(ui,/onOpenTaperDesigner:\(\)=>openWorkshopTool\('thread-wrap'\)/);
});

function harness(){
  const calls=[];
  const hosts=new Map();
  const host={id:'threadStudioHost'};
  const api={sanitiseScope:Host.sanitiseScope,mountedScope:(h)=>hosts.get(h)||null,
    mount:(h,o)=>{calls.push(['mount',o.scope]);hosts.set(h,o.scope);o.onOpenTaperDesigner&&(harness.taper=o.onOpenTaperDesigner);},
    unmount:(h)=>{calls.push(['unmount']);hosts.delete(h);}};
  const c=vm.createContext({workshopToolsState:{activeTool:'list'},KLabsThreadStudioHost:api,window:{KLABS_ACCOUNT_ID:'acct-1'},
    $:(id)=>id==='threadStudioHost'?host:null,openedTool:null,openWorkshopTool:(t)=>{c.openedTool=t;}});
  for(const name of ['activeAccountKey','renderThreadStudioTool']){
    const start=ui.indexOf(`function ${name}(`);const end=ui.indexOf('\n}',start)+2;
    vm.runInContext(ui.slice(start,end),c);
  }
  return {c,calls};
}
test('renderThreadStudioTool mounts only while its card is open, once per account, and remounts on an account change',()=>{
  const {c,calls}=harness();
  c.renderThreadStudioTool();
  assert.deepEqual(calls,[['unmount']]);
  c.workshopToolsState.activeTool='thread-studio';
  c.renderThreadStudioTool();c.renderThreadStudioTool();
  assert.deepEqual(calls.slice(1),[['mount','acct-1']],'mounted once');
  c.window.KLABS_ACCOUNT_ID='acct-2';
  c.renderThreadStudioTool();
  assert.deepEqual(calls.slice(2),[['mount','acct-2']],'account switch remounts with the new scope');
  c.workshopToolsState.activeTool='grip';
  c.renderThreadStudioTool();
  assert.deepEqual(calls[calls.length-1],['unmount']);
  c.workshopToolsState.activeTool='thread-studio';c.renderThreadStudioTool();
  harness.taper();
  assert.equal(c.openedTool,'thread-wrap','the tapered-blank link opens the Thread Wrap Designer');
});

test('host: scope is sanitised and the srcdoc carries it ahead of the studio scripts',()=>{
  assert.equal(Host.sanitiseScope('aaaaaaaa-0000-0000-0000-000000000001'),'aaaaaaaa-0000-0000-0000-000000000001');
  assert.equal(Host.sanitiseScope(''),'local');
  assert.equal(Host.sanitiseScope('x</script><script>alert(1)'),'xscriptscriptalert1');
  const doc=Host.buildSrcdoc('<!doctype html><html><head><title>t</title></head><body><script>run()</script></body></html>','u1');
  assert.ok(doc.indexOf('__TDS_HOST__')<doc.indexOf('run()'));
  assert.match(doc,/window\.__TDS_HOST__=\{"scope":"u1"\}/);
});

test('host: mount loads the document, mounts a titled frame, relays only the studio\'s own messages, and unmount cleans up',async()=>{
  const listeners=[];
  const mk=()=>{const el={children:[],attrs:{},style:{},className:'',set innerHTML(v){this._h=v;this.children=[];},get innerHTML(){return this._h||'';},
    setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},removeAttribute(k){delete this.attrs[k];},
    appendChild(ch){this.children.push(ch);},querySelector:()=>null};return el;};
  const win={fetch:null,addEventListener:(t,f)=>listeners.push(f),removeEventListener:(t,f)=>{const i=listeners.indexOf(f);if(i>=0)listeners.splice(i,1);}};
  const doc={createElement:()=>({...mk(),contentWindow:{id:'frame'}}),defaultView:win};
  const host=Object.assign(mk(),{ownerDocument:doc});
  let taper=0;
  const fetchImpl=async()=>({ok:true,text:async()=>'<html><head></head><body></body></html>'});
  Host.mount(host,{scope:'acct',fetchImpl,onOpenTaperDesigner:()=>{taper++;}});
  assert.equal(host.getAttribute('data-thread-studio-state'),'loading');
  await new Promise((r)=>setTimeout(r,10));
  assert.equal(host.getAttribute('data-thread-studio-state'),'ready');
  const frame=host.children[0];
  assert.equal(frame.attrs.title,'Thread Design Studio');
  assert.match(frame.srcdoc,/"scope":"acct"/);
  assert.equal(Host.mountedScope(host),'acct');
  assert.equal(listeners.length,1);
  listeners[0]({source:{id:'other'},data:{type:'klabs-thread-studio',action:'open-taper-designer'}});
  listeners[0]({source:frame.contentWindow,data:{type:'something-else',action:'open-taper-designer'}});
  assert.equal(taper,0,'foreign messages ignored');
  listeners[0]({source:frame.contentWindow,data:{type:'klabs-thread-studio',action:'open-taper-designer'}});
  assert.equal(taper,1);
  assert.equal(Host.unmount(host),true);
  assert.equal(listeners.length,0);
  assert.equal(Host.mountedScope(host),null);
  assert.equal(Host.unmount(host),false);
});

test('host: a failed load shows a plain message with Try again, not a blank card',async()=>{
  const mk=()=>({attrs:{},set innerHTML(v){this._h=v;},get innerHTML(){return this._h||'';},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},removeAttribute(){},appendChild(){},querySelector(){return null;}});
  const win={addEventListener(){},removeEventListener(){}};
  const host=Object.assign(mk(),{ownerDocument:{defaultView:win,createElement:mk}});
  Host.mount(host,{scope:'a',fetchImpl:async()=>{throw new Error('offline');}});
  await new Promise((r)=>setTimeout(r,10));
  assert.equal(host.getAttribute('data-thread-studio-state'),'error');
  assert.match(host.innerHTML,/could not load/);
  assert.match(host.innerHTML,/data-thread-studio-retry/);
});

test('isolation: the studio has no network, Supabase, sync or Studio-storage access and only uses its own keys',()=>{
  const dir=path.join(root,'thread-studio','src');
  const code=['engine','crosswrap','weave','art','app'].map((n)=>fs.readFileSync(path.join(dir,`${n}.js`),'utf8')).join('\n');
  assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|supabase|KLABS_|klabs-workshop|indexedDB/i);
  const keys=[...code.matchAll(/'(ktds\.[a-z.0-9]+)'/g)].map((m)=>m[1]);
  assert.ok(keys.length>=2);
  const used=[...code.matchAll(/(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*([A-Za-z_]+)/g)].map((m)=>m[1]);
  assert.ok(used.every((k)=>['KEY','LKEY'].includes(k)),`unexpected storage key use: ${used}`);
  assert.doesNotMatch(read('thread-studio','index.html'),/<link[^>]+https?:|<script[^>]+src=["']https?:/,'no external resources, so it works offline');
});

test('the served bundle thread-studio/index.html is current with its source',()=>{
  const tmp=path.join(require('node:os').tmpdir(),`tds-${process.pid}.html`);
  const r=spawnSync(process.execPath,[path.join(root,'thread-studio','src','build.js')],{env:{...process.env,TDS_OUT:tmp},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(fs.readFileSync(tmp,'utf8'),read('thread-studio','index.html'),'run: node thread-studio/src/build.js');
  fs.unlinkSync(tmp);
});

test('the studio\'s own engine and geometry suite passes (all calculations unchanged)',()=>{
  const r=spawnSync(process.execPath,[path.join(root,'thread-studio','src','tests.js')],{encoding:'utf8',cwd:path.join(root,'thread-studio','src')});
  assert.equal(r.status,0,r.stdout.split('\n').filter((l)=>/^FAIL/.test(l)).join('\n'));
  assert.match(r.stdout,/308\/308 passed/);
});

test('every new style rule is scoped to the Thread Design Studio card so other Workshop tools are untouched',()=>{
  const start=css.indexOf('/* Thread Design Studio (Workshop)');
  const end=css.indexOf('/* Thread Wrap Designer (Workshop)');
  assert.ok(start>0 && end>start);
  const block=css.slice(start,end).replace(/\/\*[\s\S]*?\*\//g,'');
  const selectors=[...block.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m)=>m[2].trim()).filter(Boolean);
  assert.ok(selectors.length>=6);
  for(const group of selectors)for(const sel of group.split(',').map((x)=>x.trim())){
    assert.ok(/thread-studio|ThreadStudio/.test(sel),`unscoped selector: ${sel}`);
  }
});
