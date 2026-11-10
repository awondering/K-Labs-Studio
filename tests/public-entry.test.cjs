const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','js','public-entry.js'),'utf8');

function harness(){
  const classes=new Set(['klabs-auth-resolving','klabs-logged-out']);
  const events={};
  const scripts=[];
  const heldScripts=new Set();
  const heldScriptCallbacks=new Map();
  let failScript='';
  let rpcError=null;
  let entitlement={access_state:'grandfathered',can_write:true,email_verified:true};
  const elements={};
  let session=null;
  let reloads=0;
  const cachedValues=new Map();
  const demoViews=['overview','customers','builds','quotes','components','workshop'].map(view=>({
    dataset:{demoView:view},attributes:{},listeners:{},
    addEventListener(event,fn){this.listeners[event]=fn;},
    setAttribute(name,value){this.attributes[name]=value;},
    removeAttribute(name){delete this.attributes[name];}
  }));
  const demoPanels=['overview','customers','builds','quotes','components','workshop'].map(view=>({
    dataset:{demoPanel:view},hidden:false
  }));
  for(const id of ['authScreen','app','authEmail','authForm','authShowSignUp','authSignUpForm','publicDiscoverDialog','homeLivingRod','publicExploreBtn','publicSignInBtn','authBackHome','publicDiscoverBtn','publicDiscoverExploreBtn','publicDiscoverClose','authMessage','accountAccessScreen','exploreDemoScreen','accountAccessMessage','accountAccessChoices','accountAccessError','startTrialBtn','enterExploreDemoBtn','verifyEmailContinueBtn','accessSignOutBtn','demoSignOutBtn','demoStartTrialBtn','readOnlyAccessNotice']){
    elements[id]={style:{display:'',setProperty(){}},listeners:{},classList:{add(){},remove(){}},hidden:false,textContent:'',disabled:false,dataset:{},
      addEventListener(event,fn){this.listeners[event]=fn;},focus(){},showModal(){this.open=true;},close(){this.open=false;},
      querySelector(){return {appendChild(){},textContent:''};},
      setAttribute(){},removeAttribute(){}
    };
  }
  const document={
    body:{classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);},toggle(name,on){on?classes.add(name):classes.delete(name);}}},
    getElementById:id=>elements[id]||(elements[id]={style:{},listeners:{},hidden:false,textContent:'',addEventListener(event,fn){this.listeners[event]=fn;},setAttribute(){},removeAttribute(){}}),
    addEventListener(event,fn){events[event]=fn;},
    createElement:()=>({style:{setProperty(){}}}),
    querySelector:()=>null,
    querySelectorAll(selector){return selector==='[data-demo-view]'?demoViews:selector==='[data-demo-panel]'?demoPanels:[];},
    head:{appendChild(script){
      scripts.push(script.src);
      const finish=()=>script.src===failScript?script.onerror():script.onload();
      if(heldScripts.has(script.src))heldScriptCallbacks.set(script.src,finish);
      else queueMicrotask(finish);
    }},
  };
  let trialStarts=0;
  const window={scrollTo(){},dispatchEvent(){},addEventListener(){},setInterval(){return 1;},navigator:{onLine:true},
    localStorage:{getItem:key=>cachedValues.get(key)||null,setItem:(key,value)=>cachedValues.set(key,value)},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    setTimeout(fn){window.expiryCallback=fn;return 1;},clearTimeout(){},
    location:{reload(){reloads++;}},KLABS_UI:{startNewBuildFlow(){}},
    KLABS_SUPABASE_CLIENT:{
      auth:{getSession:async()=>({data:{session},error:null}),signOut:async()=>({error:null})},
      rpc:async(name)=>{
        if(name==='get_account_entitlement')return {data:entitlement,error:rpcError};
        if(name==='klabs_account_is_blocked')return {data:false,error:null};
        if(name==='start_account_trial'){
          trialStarts++;
          const serverTime=new Date().toISOString();
          entitlement={...entitlement,access_state:'trial',can_write:true,trial_available:false,
            trial_started_at:serverTime,trial_expires_at:new Date(Date.now()+7*24*60*60*1000).toISOString(),server_time:serverTime};
          return {data:entitlement,error:null};
        }
        throw new Error(`unexpected RPC ${name}`);
      }
    }};
  vm.runInNewContext(source,{window,document,Promise,Error,Date,JSON,console});
  events.DOMContentLoaded();
  return {window,document,elements,classes,scripts,demoViews,demoPanels,setSession(value){session=value;},setEntitlement(value){entitlement=value;},setRpcError(value){rpcError=value;},cache(key,value){cachedValues.set(key,JSON.stringify(value));},trialStarts:()=>trialStarts,reloads:()=>reloads,failScript(value){failScript=value;},holdScript(value){heldScripts.add(value);},releaseScript(value){heldScripts.delete(value);heldScriptCallbacks.get(value)?.();heldScriptCallbacks.delete(value);}};
}

test('public markup does not load private application scripts',()=>{
  assert.match(html,/<script src="js\/public-entry\.js"><\/script>/);
  assert.match(html,/<button id="publicExploreBtn"[^>]*>[\s\S]*?<span class="home-public-entry__primary-label">EXPLORE STUDIO<\/span>[\s\S]*?<span class="home-public-entry__trial-note">7-day trial available<\/span>[\s\S]*?<\/button>/);
  assert.doesNotMatch(html,/<p>\s*7-day trial available\s*<\/p>/);
  for(const name of ['storage','ui','navigation','component-sync','build-sync','settings-sync','app']){
    assert.doesNotMatch(html,new RegExp(`<script src="js/${name}\\.js">`));
  }
});

test('visitor actions share the authenticated homepage width and preserve its composition',()=>{
  assert.match(html,/<button id="homeEnterRodBtn" class="home-enter-rod-button primary-action" type="button">START NEW BUILD<\/button>/);
  assert.match(css,/body\.klabs-logged-out #homeEnterRodBtn,\s*body:not\(\.klabs-logged-out\) \.home-public-entry \{\s*display:none;/);
  assert.match(css,/\.home-public-entry \{\s*display:grid;\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[\s\S]*?width:min\(84%,780px\);/);
  assert.match(css,/#homeScreen \.home-public-entry \.home-enter-rod-button \{[\s\S]*?min-height:60px;[\s\S]*?gap:3px;[\s\S]*?grid-column:1 \/ -1;/);
  assert.match(css,/\.home-public-entry__secondary,\s*\.home-public-entry__signin \{\s*width:100%;\s*min-height:48px;/);
  assert.match(css,/@media \(max-width:520px\) \{\s*\.home-public-entry \{ width:100%; \}/);
  assert.doesNotMatch(css,/body\.klabs-logged-out #homeScreen \.home-premium-shell|body\.klabs-logged-out #homeScreen \.home-premium-hero h1/);
});

test('signed-out entry and public interactions do not initialize private scripts',async()=>{
  const h=harness();
  await h.window.KLABS_PUBLIC_ENTRY.applySession(null,()=>assert.fail('must not initialize'));
  assert.deepEqual(h.scripts,[]);
  assert.equal(h.elements.app.style.display,'');
  h.elements.publicDiscoverBtn.listeners.click();
  assert.equal(h.elements.publicDiscoverDialog.open,true);
  h.elements.publicDiscoverClose.listeners.click();
  assert.equal(h.elements.publicDiscoverDialog.open,false);
  h.elements.publicExploreBtn.listeners.click();
  assert.equal(h.elements.authScreen.style.display,'flex');
  assert.deepEqual(h.scripts,[]);
  h.elements.authBackHome.listeners.click();
  assert.equal(h.elements.authScreen.style.display,'none');
});

test('Discover sheet presents accurate features and its Explore action opens sign-in',()=>{
  assert.match(html,/DESIGN &amp; MANAGE/);
  assert.match(html,/Build specifications, components and pricing\./);
  assert.match(html,/PRESENT WITH CONFIDENCE/);
  assert.match(html,/Professional quotes and build confirmations\./);
  assert.match(html,/PRECISION WORKSHOP/);
  assert.match(html,/Purpose-built tools for rod builders\./);
  assert.match(html,/Discover a more considered approach to custom rod building\./);
  assert.doesNotMatch(html,/planned for a future release|coming soon/i);

  const h=harness();
  h.elements.publicDiscoverBtn.listeners.click();
  assert.equal(h.elements.publicDiscoverDialog.open,true);
  h.elements.publicDiscoverExploreBtn.listeners.click();
  assert.equal(h.elements.publicDiscoverDialog.open,false);
  assert.equal(h.elements.authScreen.style.display,'flex');
  assert.deepEqual(h.scripts,[]);
});

test('private scripts load only after a session and auth state applies after session recheck',async()=>{
  const h=harness();
  const session={user:{id:'synthetic-a'}};
  h.setSession(session);
  let applied;
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,(value)=>{applied=value;});
  assert.equal(applied,session);
  assert.ok(h.scripts.includes('js/ui.js'));
  assert.ok(h.scripts.indexOf('js/storage.js')<h.scripts.indexOf('js/ui.js'));
  assert.ok(h.scripts.indexOf('js/ui.js')<h.scripts.indexOf('js/app.js'));
});

test('admin script loads in parallel with the private app while auth still waits for both',async()=>{
  const h=harness();
  const session={user:{id:'synthetic-parallel-admin'}};
  h.setSession(session);
  h.holdScript('js/admin-panel.js');
  let applied=false;
  const startup=h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{applied=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(h.scripts.includes('js/admin-panel.js'));
  assert.ok(h.scripts.includes('js/config.js'));
  assert.ok(h.scripts.includes('js/app.js'),'the serialized core scripts continue while admin download is pending');
  assert.equal(applied,false,'authenticated UI remains gated until admin script has loaded');
  h.releaseScript('js/admin-panel.js');
  await startup;
  assert.equal(applied,true);
});

test('trial-eligible accounts see the choice before any private script loads; Explore stays fictional and isolated',async()=>{
  const h=harness();
  const session={user:{id:'eligible-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('private app must not load'));
  assert.deepEqual(h.scripts,[]);
  assert.equal(h.elements.accountAccessScreen.hidden,false);
  h.elements.enterExploreDemoBtn.listeners.click();
  assert.equal(h.elements.exploreDemoScreen.hidden,false);
  assert.equal(h.classes.has('klabs-explore-demo'),true);
  assert.deepEqual(h.scripts,[]);
  h.demoViews[2].listeners.click();
  assert.equal(h.demoPanels[2].hidden,false);
  assert.equal(h.demoPanels[0].hidden,true);
});

test('unverified accounts cannot start or enter Explore Mode',async()=>{
  const h=harness();
  const session={user:{id:'unverified-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:false});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('private app must not load'));
  assert.equal(h.elements.accountAccessChoices.hidden,true);
  assert.equal(h.elements.verifyEmailContinueBtn.hidden,false);
  h.elements.enterExploreDemoBtn.listeners.click();
  assert.match(h.elements.accountAccessError.textContent,/Verify your email/);
  assert.deepEqual(h.scripts,[]);
});

test('Explore sign-out clears the session through Supabase and returns to public entry',async()=>{
  const h=harness();
  const session={user:{id:'demo-signout'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('private app must not load'));
  h.elements.enterExploreDemoBtn.listeners.click();
  h.elements.demoSignOutBtn.listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.reloads(),1);
});

test('explicit trial action calls the one-time RPC, then loads Studio with the returned access state',async()=>{
  const h=harness();
  const session={user:{id:'eligible-b'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:true});
  h.window.KLABS_APPLY_AUTH_STATE=()=>{};
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('trial is not started implicitly'));
  await h.elements.startTrialBtn.listeners.click({currentTarget:h.elements.startTrialBtn});
  assert.equal(h.trialStarts(),1);
  assert.ok(h.scripts.includes('js/app.js'));
  assert.equal(h.window.KLABS_ACCESS_STATE.access_state,'trial');
});

test('expired entitlement opens Studio with read-only state and does not permit the demo path',async()=>{
  const h=harness();
  const session={user:{id:'expired-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'expired',can_write:false,trial_available:false,email_verified:true});
  let applied;
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{applied=true;});
  assert.equal(applied,true);
  assert.equal(h.window.KLABS_ACCESS_STATE.can_write,false);
  assert.ok(h.scripts.includes('js/app.js'));
  assert.equal(h.elements.accountAccessScreen.hidden,true);
});

test('verified cached entitlement preserves offline startup and local expiry becomes read-only',async()=>{
  const now=Date.now();
  const h=harness();
  const session={user:{id:'offline-a'}};
  h.setSession(session);
  h.window.navigator.onLine=false;
  h.setRpcError({name:'TypeError',message:'Failed to fetch'});
  const serverTime=new Date(now-8*24*60*60*1000).toISOString();
  h.cache('klabs-account-entitlement:offline-a',{
    user_id:'offline-a',
    saved_at:serverTime,
    entitlement:{access_state:'trial',can_write:true,trial_available:false,email_verified:true,
      trial_started_at:serverTime,trial_expires_at:new Date(now-24*60*60*1000).toISOString(),server_time:serverTime}
  });
  let applied;
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{applied=h.window.KLABS_ACCESS_STATE;});
  assert.equal(applied.access_state,'expired');
  assert.equal(applied.can_write,false);
  assert.ok(h.scripts.includes('js/app.js'));
});

test('a valid cached login without a cached entitlement opens local Studio view-only while offline',async()=>{
  const h=harness();
  const session={user:{id:'offline-first-launch'}};
  h.setSession(session);
  h.window.navigator.onLine=false;
  h.setRpcError({name:'TypeError',message:'Failed to fetch'});
  let appliedState;
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{appliedState=h.window.KLABS_ACCESS_STATE;});
  assert.equal(appliedState.access_state,'offline_readonly');
  assert.equal(appliedState.can_write,false);
  assert.ok(h.scripts.includes('js/app.js'));
});

test('active trial becomes read-only at the server-calculated expiry deadline',async()=>{
  const h=harness();
  const session={user:{id:'timed-trial'}};
  h.setSession(session);
  const serverTime=new Date().toISOString();
  h.setEntitlement({
    access_state:'trial',can_write:true,trial_available:false,email_verified:true,
    trial_started_at:serverTime,trial_expires_at:new Date(Date.now()+60_000).toISOString(),server_time:serverTime
  });
  let appliedState;
  h.window.KLABS_APPLY_AUTH_STATE=()=>{appliedState=h.window.KLABS_ACCESS_STATE;};
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{});
  assert.equal(h.window.KLABS_CAN_WRITE(),true);
  assert.equal(typeof h.window.KLABS_ACCESS_STATE.local_expires_at,'number');
  h.window.expiryCallback();
  assert.equal(appliedState.access_state,'expired');
  assert.equal(h.window.KLABS_CAN_WRITE(),false);
});

test('a session changed during initialization does not reveal the private application',async()=>{
  const h=harness();
  let reloaded=false;
  h.window.location.reload=()=>{reloaded=true;};
  h.setSession({user:{id:'synthetic-b'}});
  let applied=false;
  await h.window.KLABS_PUBLIC_ENTRY.applySession({user:{id:'synthetic-a'}},()=>{applied=true;});
  assert.equal(reloaded,true);
  assert.equal(applied,false);
  assert.equal(h.classes.has('klabs-auth-resolving'),true);
});

test('a failed private script load leaves the private app hidden and reports an error',async()=>{
  const h=harness();
  const session={user:{id:'synthetic-a'}};
  h.setSession(session);
  h.failScript('js/storage.js');
  await assert.rejects(h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('must not initialize')),/Could not load js\/storage.js/);
  assert.equal(h.elements.app.style.display,'none');
  assert.equal(h.elements.authScreen.style.display,'flex');
  assert.equal(h.classes.has('klabs-auth-resolving'),false);
  assert.equal(h.scripts.includes('js/ui.js'),false);
});
