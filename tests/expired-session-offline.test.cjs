// Q17: an expired sign-in that cannot be renewed (no network or an unresponsive server) opens the saved records
// view-only after about 3 s instead of hanging or signing out. Synthetic accounts and records only.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','js','supabase-client.js'),'utf8');
const KEY='sb-test-auth-token';
const USER='q17-account';

function harness({expiresIn=-60,stored=true,getSession}={}){
  const timers=[];
  const calls={offline:[],online:[],sync:0,admin:0,builds:0,settings:0,fetch:[],reloads:0};
  const storage=new Map();
  if(stored)storage.set(KEY,JSON.stringify({access_token:'a',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+expiresIn,user:{id:USER,email:'q17@example.test'}}));
  const listeners={};
  const els={};
  const el=(id)=>els[id]||(els[id]={id,style:{},hidden:false,textContent:'',attrs:{},listeners:{},
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(n,f){this.listeners[n]=f;},
    querySelector(){return this.span||(this.span={textContent:''});},querySelectorAll(){return [];}});
  const classes=new Set();
  let authListener=null;
  let createOptions=null;
  const window={
    supabase:{createClient:(url,key,options)=>{createOptions=options;return {auth:{storageKey:KEY,
      getSession:()=>getSession?getSession():Promise.resolve({data:{session:null},error:null}),
      onAuthStateChange:(fn)=>{authListener=fn;},signOut:async()=>({error:null})}};}},
    KLABS_SUPABASE:{url:'https://example.test',publishableKey:'k'},
    localStorage:{getItem:(k)=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},
    fetch:(input,init)=>{calls.fetch.push({input,init});return Promise.resolve({ok:true});},
    location:{reload(){calls.reloads++;}},
    KLABS_PUBLIC_ENTRY:{applyOfflineSession:async(...args)=>{calls.offline.push(args);},applySession:async(...args)=>{calls.online.push(args);},
      showHome(){},isLoading:()=>true},
    KLABS_UI:{onAccountChange(){}},
    KLABS_SYNC:{onAuthStateChanged(){calls.sync++;}},KLABS_ADMIN_ACCESS:{onAuthStateChanged(){calls.admin++;}},
    KLABS_BUILD_SYNC:{onAuthStateChanged(){calls.builds++;}},KLABS_SETTINGS_SYNC:{onAuthStateChanged(){calls.settings++;}},
  };
  const document={
    body:{classList:{add:(...c)=>c.forEach(x=>classes.add(x)),remove:(...c)=>c.forEach(x=>classes.delete(x)),contains:(c)=>classes.has(c),toggle:(c,on)=>on?classes.add(c):classes.delete(c)}},
    getElementById:el,
    addEventListener:(n,f)=>{(listeners[n]||(listeners[n]=[])).push(f);},
  };
  const context=vm.createContext({window,document,console:{error(){},warn(){},log(){}},Promise,Date,JSON,Number,Error,AbortController,setImmediate});
  vm.runInContext(source,context);
  return {context,window,document,calls,timers,classes,els,listeners,storage,createOptions:()=>createOptions,authListener:()=>authListener};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Q17: only the sign-in renewal request is bounded (10 s); every other request passes through unchanged',async()=>{
  const h=harness();
  assert.equal(typeof h.createOptions().global.fetch,'function','the client uses the bounded fetch');
  const plainInit={method:'GET',headers:{a:'1'}};
  await h.context.klabsFetch('https://example.test/rest/v1/builds?select=*',plainInit);
  await h.context.klabsFetch('https://example.test/auth/v1/token?grant_type=password',plainInit);
  await h.context.klabsFetch('https://example.test/rest/v1/rpc/get_account_entitlement',plainInit);
  assert.ok(h.calls.fetch.every(c=>c.init===plainInit),'data, sign-in and RPC requests untouched');
  assert.equal(h.timers.length,0);
  await h.context.klabsFetch('https://example.test/auth/v1/token?grant_type=refresh_token',{method:'POST'});
  const renewal=h.calls.fetch.at(-1);
  assert.equal(renewal.init.method,'POST');
  assert.equal(h.timers.length,1);
  assert.equal(h.timers[0].ms,10000);
  assert.equal(renewal.init.signal.aborted,false);
  h.timers[0].fn();
  assert.equal(renewal.init.signal.aborted,true,'a renewal that never answers is ended');
});

test('Q17: an expired sign-in whose renewal does not answer opens view-only after 3 s, with the account id only',async()=>{
  let renewal;
  const h=harness({getSession:()=>(renewal=new Promise(()=>{}))});
  const startup=h.context.klabsCheckLogin();
  await tick();
  assert.equal(h.calls.offline.length,0,'nothing before the limit');
  const wait=h.timers.find(t=>t.ms===3000);
  assert.ok(wait,'bounded at 3 seconds');
  wait.fn();
  await startup;
  assert.equal(h.calls.offline.length,1);
  const [stored,apply,pending]=h.calls.offline[0];
  assert.deepEqual(JSON.parse(JSON.stringify(stored)),{user:{id:USER,email:'q17@example.test'}},'no tokens handed on');
  assert.equal(apply,h.context.klabsApplyAuthState);
  assert.equal(pending,renewal,'the renewal keeps running so it can restore normal operation');
  assert.equal(h.calls.online.length,0);
});

test('Q17: a quick network failure (AuthRetryableFetchError) also opens view-only; a real rejection never does',async()=>{
  const offline=harness({getSession:async()=>({data:{session:null},error:{name:'AuthRetryableFetchError',status:0,message:'Failed to fetch'}})});
  await offline.context.klabsCheckLogin();
  assert.equal(offline.calls.offline.length,1);
  for(const error of [{name:'AuthApiError',status:400,code:'refresh_token_not_found'},{name:'AuthApiError',status:401},{name:'AuthSessionMissingError',status:400}]){
    const h=harness({getSession:async()=>({data:{session:null},error})});
    await assert.rejects(h.context.klabsCheckLogin(),(e)=>e===error,error.name+' '+error.status);
    assert.equal(h.calls.offline.length,0,'a revoked or invalid sign-in is not treated as offline');
  }
});

test('Q17: a valid or missing sign-in, or a renewal that succeeds in time, takes the normal path unchanged',async()=>{
  const session={user:{id:USER}};
  for(const [name,options] of [
    ['valid token',{expiresIn:3600,getSession:async()=>({data:{session},error:null})}],
    ['no stored sign-in',{stored:false,getSession:async()=>({data:{session:null},error:null})}],
    ['renewed in time',{getSession:async()=>({data:{session},error:null})}],
  ]){
    const h=harness(options);
    await h.context.klabsCheckLogin();
    assert.equal(h.calls.offline.length,0,name);
    assert.equal(h.calls.online.length,1,name);
    if(name!=='renewed in time')assert.equal(h.timers.filter(t=>t.ms===3000).length,0,name+': no wait added');
  }
});

test('Q17: while view-only after a failed renewal, sync, owner checks and settings sync never start',()=>{
  const h=harness();
  h.window.KLABS_ACCESS_STATE={access_state:'paid',can_write:false,offline:true,offline_session:true};
  h.context.klabsApplyAuthState({user:{id:USER,email:'q17@example.test'}});
  assert.deepEqual([h.calls.sync,h.calls.admin,h.calls.builds,h.calls.settings],[0,0,0,0]);
  assert.equal(h.window.KLABS_ACCOUNT_ID,USER,'only this account\'s own saved records are shown');
  assert.ok(h.classes.has('klabs-read-only'));
  assert.match(h.els.readOnlyAccessNotice.span.textContent,/sign-in could not be renewed/);
  const normal=harness();
  normal.window.KLABS_ACCESS_STATE={access_state:'paid',can_write:true};
  normal.context.klabsApplyAuthState({user:{id:USER}});
  assert.deepEqual([normal.calls.sync,normal.calls.admin,normal.calls.builds,normal.calls.settings],[1,1,1,1],'normal start-up unchanged');
});

function clickGuard(h){
  h.listeners.DOMContentLoaded.forEach(f=>f());
  return h.listeners.click[0];
}
function control({text='',id='',closestMatch=null,matchesNav=false}){
  const node={textContent:text,id,getAttribute:()=>'',matches:()=>matchesNav,
    closest:(selector)=>selector.startsWith('#app button')?node:(closestMatch&&selector.includes(closestMatch)?{}:null)};
  return node;
}
function click(guard,node){
  const event={target:{closest:(s)=>node.closest(s)},prevented:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};
  guard(event);
  return event.prevented;
}

test('Q17: view-only after a failed renewal blocks every customer document and job action; navigation still works',()=>{
  const h=harness();
  const guard=clickGuard(h);
  h.classes.add('klabs-read-only');h.classes.add('klabs-offline-session');
  for(const text of ['Customer Invoice','Payment Statement','More documents','View Invoice','Download PDF','Share','Record Payment','View Quote','Print','Save'])assert.equal(click(guard,control({text})),true,text);
  assert.equal(click(guard,control({text:'Open',closestMatch:'.workshop-build-actions-surface'})),true,'job actions area');
  assert.equal(click(guard,control({text:'Open',closestMatch:'[data-current-build-action]'})),true,'••• job actions');
  assert.equal(click(guard,control({text:'Builds',matchesNav:true})),false,'navigation allowed');
  assert.equal(click(guard,control({text:'Open job'})),false,'opening a saved record to view it is allowed');
  assert.match(h.els.readOnlyAccessNotice.span.textContent,/until you reconnect/);
});

test('Q17: the existing read-only (expired trial) guard is unchanged',()=>{
  const h=harness();
  const guard=clickGuard(h);
  h.classes.add('klabs-read-only');
  assert.equal(click(guard,control({text:'Save'})),true);
  assert.equal(click(guard,control({text:'Customer Invoice'})),false,'expired trial behaviour as before');
  assert.equal(click(guard,control({text:'Open',closestMatch:'.workshop-build-actions-surface'})),false);
});

test('Q17 recovery: a renewed (or ended) sign-in while view-only restarts Studio; normal sessions are unaffected',()=>{
  const h=harness();
  clickGuard(h);
  const listener=h.authListener();
  h.window.KLABS_ACCESS_STATE={offline_session:true,offline:true,can_write:false};
  listener('INITIAL_SESSION',null);
  assert.equal(h.calls.reloads,0,'no session yet: keep waiting');
  listener('TOKEN_REFRESHED',{user:{id:USER}});
  assert.equal(h.calls.reloads,1);
  listener('SIGNED_OUT',null);
  assert.equal(h.calls.reloads,2,'a refused renewal signs out through a normal restart');
  h.window.KLABS_ACCESS_STATE={can_write:true};
  h.window.KLABS_ACCOUNT_ID=USER;
  listener('TOKEN_REFRESHED',{user:{id:USER}});
  assert.equal(h.calls.reloads,2,'ordinary token refreshes do not reload');
});
