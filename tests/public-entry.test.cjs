const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','js','public-entry.js'),'utf8');

function harness({storage={}}={}){
  const classes=new Set(['klabs-auth-resolving','klabs-logged-out']);
  const events={};
  const scripts=[];
  const preloads=[];
  let entitlementHook=null;
  const heldScripts=new Set();
  const heldScriptCallbacks=new Map();
  let failScript='';
  let rpcError=null;
  let entitlement={access_state:'grandfathered',can_write:true,email_verified:true};
  const elements={};
  let session=null;
  let reloads=0;
  const cachedValues=new Map(Object.entries(storage));
  const demoViews=['overview','customers','builds','quotes','components','workshop'].map(view=>({
    dataset:{demoView:view},attributes:{},listeners:{},
    addEventListener(event,fn){this.listeners[event]=fn;},
    setAttribute(name,value){this.attributes[name]=value;},
    removeAttribute(name){delete this.attributes[name];}
  }));
  const demoPanels=['overview','customers','builds','quotes','components','workshop'].map(view=>({
    dataset:{demoPanel:view},hidden:false
  }));
  for(const id of ['authScreen','app','authEmail','authForm','authShowSignUp','authSignUpForm','homeLivingRod','publicExploreBtn','publicSignInBtn','authBackHome','authMessage','accountAccessScreen','exploreDemoScreen','accountAccessMessage','accountAccessChoices','accountAccessError','accessBillingPanel','enterExploreDemoBtn','verifyEmailContinueBtn','accessSignOutBtn','demoSignOutBtn','demoSubscribeBtn','readOnlyAccessNotice','renewalCheckOverlay','settingsBillingPanel']){
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
      if(script.rel==='preload'){preloads.push({href:script.href,as:script.as});return;}
      scripts.push(script.src);
      const finish=()=>script.src===failScript?script.onerror():script.onload();
      if(heldScripts.has(script.src))heldScriptCallbacks.set(script.src,finish);
      else queueMicrotask(finish);
    }},
  };
  let trialStarts=0;
  const window={scrollTo(){},dispatchEvent(){},addEventListener(){},setInterval(){return 1;},navigator:{onLine:true},
    KLABS_BUILD_TAB_LOCK:{async acquire(){},release(){},owns(){return true;}},
    localStorage:{getItem:key=>cachedValues.get(key)||null,setItem:(key,value)=>cachedValues.set(key,value),key:index=>[...cachedValues.keys()][index]??null,get length(){return cachedValues.size;}},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    setTimeout(fn){window.expiryCallback=fn;return 1;},clearTimeout(){},
    location:{reload(){reloads++;}},KLABS_UI:{startNewBuildFlow(){}},
    KLABS_DEMO:{active:false,entered:0,enter(){this.entered++;},exit(){}},
    KLABS_SUPABASE_CLIENT:{
      auth:{getSession:async()=>({data:{session},error:null}),signOut:async()=>({error:null})},
      rpc:async(name)=>{
        if(name==='get_account_entitlement')return entitlementHook?entitlementHook():{data:entitlement,error:rpcError};
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
  vm.runInNewContext(source,{window,document,Promise,Error,Date,JSON,console,AbortController});
  events.DOMContentLoaded();
  return {window,document,elements,classes,scripts,preloads,events,setEntitlementHook(fn){entitlementHook=fn;},demoViews,demoPanels,setSession(value){session=value;},setEntitlement(value){entitlement=value;},setRpcError(value){rpcError=value;},cache(key,value){cachedValues.set(key,JSON.stringify(value));},trialStarts:()=>trialStarts,reloads:()=>reloads,failScript(value){failScript=value;},holdScript(value){heldScripts.add(value);},releaseScript(value){heldScripts.delete(value);heldScriptCallbacks.get(value)?.();heldScriptCallbacks.delete(value);}};
}

test('public markup does not load private application scripts',()=>{
  assert.match(html,/<script src="js\/public-entry\.js"><\/script>/);
  // Q24: Explore Studio no longer carries the 7-day trial note (was: EXPLORE STUDIO / 7-day trial available).
  assert.match(html,/<button id="publicExploreBtn" class="home-enter-rod-button primary-action" type="button">\s*<span class="home-public-entry__primary-label">EXPLORE STUDIO<\/span>\s*<\/button>/);
  assert.doesNotMatch(html,/7-day trial available|home-public-entry__trial-note/);
  for(const name of ['storage','ui','navigation','component-sync','build-sync','settings-sync','app']){
    assert.doesNotMatch(html,new RegExp(`<script src="js/${name}\\.js">`));
  }
});

test('visitor actions share the authenticated homepage width and preserve its composition',()=>{
  assert.match(html,/<button id="homeEnterRodBtn" class="home-enter-rod-button primary-action" type="button">NEW ROD BUILD<\/button>/);
  assert.match(css,/body\.klabs-logged-out \.home-signed-in-entry,\s*body:not\(\.klabs-logged-out\) \.home-public-entry \{\s*display:none;/);
  assert.match(css,/\.home-public-entry,\s*\.home-signed-in-entry \{\s*display:grid;\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\);[\s\S]*?width:min\(84%,780px\);/);
  assert.match(css,/#homeScreen \.home-public-entry \.home-enter-rod-button,\s*#homeScreen \.home-signed-in-entry \.home-enter-rod-button \{[\s\S]*?min-height:60px;[\s\S]*?gap:3px;[\s\S]*?grid-column:1 \/ -1;/);
  assert.match(css,/\.home-public-entry__secondary,\s*\.home-public-entry__signin \{\s*width:100%;\s*min-height:48px;/);
  assert.match(css,/@media \(max-width:520px\) \{\s*\.home-public-entry,\s*\.home-signed-in-entry \{ width:100%; \}/);
  assert.doesNotMatch(css,/body\.klabs-logged-out #homeScreen \.home-premium-shell|body\.klabs-logged-out #homeScreen \.home-premium-hero h1/);
});

test('signed-out entry and public interactions do not initialize private scripts',async()=>{
  const h=harness();
  await h.window.KLABS_PUBLIC_ENTRY.applySession(null,()=>assert.fail('must not initialize'));
  assert.deepEqual(h.scripts,[]);
  assert.equal(h.elements.app.style.display,'');
  // Q24: Explore Studio opens Demo Mode (its introduction offers Build a Rod | Components Library), not sign-in.
  assert.notEqual(h.elements.publicExploreBtn.hidden,true);
  h.elements.publicExploreBtn.listeners.click();
  assert.equal(h.window.KLABS_DEMO.entered,1);
  assert.notEqual(h.elements.authScreen.style.display,'flex');
  assert.deepEqual(h.scripts,[]);
  // Sign In still opens sign-in, and Back returns home.
  h.elements.publicSignInBtn.listeners.click();
  assert.equal(h.elements.authScreen.style.display,'flex');
  assert.equal(h.window.KLABS_DEMO.entered,1);
  h.elements.authBackHome.listeners.click();
  assert.equal(h.elements.authScreen.style.display,'none');
});

test('Q24: Discover K-Labs Studio is consolidated into Explore Studio - one Explore entry, then Sign In',()=>{
  // Discover's only action was a second EXPLORE STUDIO (which opened sign-in, as Sign In does); Explore Studio now shows
  // Studio itself, so the separate button and its sheet are gone.
  assert.doesNotMatch(html,/publicDiscover|DISCOVER K-LABS STUDIO|public-discover-dialog/);
  assert.doesNotMatch(css,/public-discover-dialog/);
  const entry=html.slice(html.indexOf('<div class="home-public-entry">'),html.indexOf('</div>',html.indexOf('<div class="home-public-entry">')));
  assert.equal((entry.match(/<button /g)||[]).length,2,'Explore Studio and Sign In');
  // Q18 Phase 5 change (was: one EXPLORE STUDIO in the whole page): the account screen's Explore Studio opens the same
  // Demo Mode, so the homepage still has exactly one Explore entry and the page two, both to ?demo.
  assert.equal((entry.match(/EXPLORE STUDIO/g)||[]).length,1,'one Explore entry on the homepage');
  assert.equal((html.match(/EXPLORE STUDIO/g)||[]).length,2,'homepage and account screen');
  assert.match(css,/\.home-public-entry__signin \{[^}]*grid-column:1 \/ -1;/,'Sign In spans the row under Explore Studio');
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

test('Q18 Phase 5: accounts without access see the choice before any private script loads; Explore Studio opens the scripted Demo Mode',async()=>{
  const h=harness();
  const session={user:{id:'eligible-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('private app must not load'));
  assert.deepEqual(h.scripts,[]);
  assert.equal(h.elements.accountAccessScreen.hidden,false);
  h.elements.enterExploreDemoBtn.listeners.click();
  // The same ?demo page as the public homepage's Explore Studio (KLABS_DEMO.enter), not a separate screen.
  assert.equal(h.window.KLABS_DEMO.entered,1);
  assert.equal(h.classes.has('klabs-explore-demo'),false);
  assert.deepEqual(h.scripts,[]);
});

test('unverified accounts cannot subscribe or explore from the account screen until verified',async()=>{
  const h=harness();
  const session={user:{id:'unverified-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:false});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('private app must not load'));
  assert.equal(h.elements.accountAccessChoices.hidden,true);
  assert.equal(h.elements.verifyEmailContinueBtn.hidden,false);
  h.elements.enterExploreDemoBtn.listeners.click();
  assert.match(h.elements.accountAccessError.textContent,/Verify your email/);
  assert.equal(h.window.KLABS_DEMO.entered,0);
  assert.deepEqual(h.scripts,[]);
});

test('Sign Out on the account screen clears the session through Supabase and returns to public entry',async()=>{
  const h=harness();
  const session={user:{id:'demo-signout'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:true,email_verified:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('private app must not load'));
  h.elements.accessSignOutBtn.listeners.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.reloads(),1);
});

test('Q40: the free trial is retired - no trial button or RPC call; a new account is offered a subscription',async()=>{
  assert.doesNotMatch(html,/startTrialBtn|START MY 7-DAY TRIAL|demoStartTrialBtn/);
  assert.doesNotMatch(source,/start_account_trial/);
  const h=harness();
  const session={user:{id:'eligible-b'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:false,email_verified:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('Studio must not open without access'));
  assert.equal(h.elements.accountAccessScreen.hidden,false);
  assert.match(h.elements.accountAccessMessage.textContent,/Subscribe to start working in Studio/);
  assert.deepEqual(h.scripts,[]);
  assert.equal(h.trialStarts(),0);
});

test('Q40: an ended account (expired) stops at the subscription screen; Studio, its records and sync are not loaded',async()=>{
  const h=harness();
  const session={user:{id:'expired-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'expired',can_write:false,trial_available:false,email_verified:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('Studio must not open for an ended account'));
  assert.deepEqual(h.scripts,[]);
  assert.ok(!h.window.KLABS_ACCESS_STATE,'no access state: nothing in Studio can run');
  assert.equal(h.elements.accountAccessScreen.hidden,false);
  assert.match(h.elements.accountAccessMessage.textContent,/records are kept safely/);
  // Explore Studio (the scripted Demo Mode) stays available.
  h.elements.enterExploreDemoBtn.listeners.click();
  assert.equal(h.window.KLABS_DEMO.entered,1);
});

test('Q40: returning from Checkout waits for the SERVER to confirm access; the browser result alone opens nothing',async()=>{
  const h=harness();
  const session={user:{id:'checkout-a'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,trial_available:false,email_verified:true});
  // The return parameter is read once, at load; simulate it through the billing hook the entry uses.
  let polls=0;
  h.window.KLABS_BILLING={loadSubscription:async()=>null,render(){},hasLiveSubscription:()=>false,
    waitForAccess:async(fetch)=>{polls++;const a=await fetch();return a.can_write?a:null;}};
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('not before the server confirms'));
  assert.equal(polls,0,'no checkout return: no waiting');
  assert.deepEqual(h.scripts,[]);
});

test('verified cached entitlement preserves offline startup; an ended saved access does not open Studio (Q40)',async()=>{
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
  // Q40: an access record that has ended (here, offline) no longer opens Studio, not even view-only.
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('an ended account must not open'));
  assert.equal(h.elements.accountAccessScreen.hidden,false);
  assert.equal(h.scripts.includes('js/app.js'),false);
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

test('Q40: an active trial or owner grant closes Studio at its exact end (no wait, no grace)',async()=>{
  const h=harness();
  const session={user:{id:'timed-trial'}};
  h.setSession(session);
  const serverTime=new Date().toISOString();
  h.setEntitlement({
    access_state:'trial',can_write:true,trial_available:false,email_verified:true,
    trial_started_at:serverTime,trial_expires_at:new Date(Date.now()+60_000).toISOString(),server_time:serverTime
  });
  h.window.KLABS_APPLY_AUTH_STATE=()=>{};
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{});
  assert.equal(h.window.KLABS_CAN_WRITE(),true);
  assert.equal(typeof h.window.KLABS_ACCESS_STATE.local_expires_at,'number');
  h.window.expiryCallback();
  assert.equal(h.window.KLABS_ACCESS_STATE.access_state,'expired');
  assert.equal(h.window.KLABS_CAN_WRITE(),false,'no change can be saved from the exact end');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.reloads(),1,'Studio closes to the subscription screen');
});

test('Q40: at the paid-through time Studio covers the records, waits for a confirmed renewal and continues without reloading',async()=>{
  const h=harness();
  const session={user:{id:'renewing'}};
  h.setSession(session);
  const serverTime=new Date().toISOString();
  const endsAt=new Date(Date.now()+60_000).toISOString();
  h.setEntitlement({access_state:'paid',can_write:true,trial_available:false,email_verified:true,access_expires_at:endsAt,server_time:serverTime});
  h.window.KLABS_APPLY_AUTH_STATE=()=>{};
  let checks=0;
  h.window.KLABS_BILLING={render(){},loadSubscription:async()=>({status:'active',cancel_at_period_end:false,renewal_state:'pending'}),
    hasLiveSubscription:(sub)=>!!sub&&['active','past_due','trialing'].includes(sub.status),
    waitForAccess:async(fetch)=>{
      checks++;
      assert.equal(h.elements.renewalCheckOverlay.hidden,false,'records are covered while waiting');
      assert.equal(h.window.KLABS_CAN_WRITE(),false,'nothing can be saved while waiting');
      h.setEntitlement({access_state:'paid',can_write:true,trial_available:false,email_verified:true,
        access_expires_at:new Date(Date.now()+30*24*3600_000).toISOString(),server_time:new Date().toISOString()});
      return fetch();
    }};
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{});
  h.window.expiryCallback();
  for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(checks,1);
  assert.equal(h.reloads(),0,'no reload: the builder continues where they were');
  assert.equal(h.elements.renewalCheckOverlay.hidden,true);
  assert.equal(h.window.KLABS_CAN_WRITE(),true);
  assert.ok(Date.parse(h.window.KLABS_ACCESS_STATE.access_expires_at)>Date.now()+29*24*3600_000);
});

test('Q40: at the paid-through time without a confirmed payment (failed, cancelled or no answer) Studio closes',async()=>{
  for(const [name,sub,expectWait] of [['failed renewal',{status:'past_due',cancel_at_period_end:false,renewal_state:'failed'},false],
    ['bank confirmation needed',{status:'active',cancel_at_period_end:false,renewal_state:'action_required'},false],
    ['cancelled',{status:'active',cancel_at_period_end:true},false],['ended',{status:'canceled'},false],
    ['no confirmation within the wait',{status:'active',cancel_at_period_end:false,renewal_state:'pending'},true]]){
    const h=harness();
    const session={user:{id:'ending-'+name}};
    h.setSession(session);
    const serverTime=new Date().toISOString();
    h.setEntitlement({access_state:'paid',can_write:true,trial_available:false,email_verified:true,access_expires_at:new Date(Date.now()+60_000).toISOString(),server_time:serverTime});
    h.window.KLABS_APPLY_AUTH_STATE=()=>{};
    let waited=false;
    h.window.KLABS_BILLING={render(){},loadSubscription:async()=>sub,
      hasLiveSubscription:(s)=>!!s&&['active','past_due','trialing'].includes(s.status),
      waitForAccess:async()=>{waited=true;return null;}};
    await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{});
    h.window.expiryCallback();
    for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.window.KLABS_CAN_WRITE(),false,name);
    assert.equal(h.reloads(),1,name);
    assert.equal(waited,expectWait,name+': only a live, uncancelled renewal still being charged is waited for');
  }
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

const PRIVATE_APP_FILES=['js/config.js','js/storage.js','js/ui.js','js/app.js','js/admin-panel.js'];

test('signed-out visitors never download or run the private application',async()=>{
  const h=harness();
  await h.window.KLABS_PUBLIC_ENTRY.applySession(null,()=>assert.fail('must not initialize'));
  h.elements.publicExploreBtn.listeners.click();
  assert.deepEqual(h.preloads,[]);
  assert.deepEqual(h.scripts,[]);
});

test('a stored session starts downloading, but does not run, the private application at once',()=>{
  const h=harness({storage:{'sb-example-auth-token':'{}'}});
  const hrefs=h.preloads.map(item=>item.href);
  for(const file of PRIVATE_APP_FILES)assert.ok(hrefs.includes(file),`${file} is preloaded`);
  assert.ok(h.preloads.every(item=>item.as==='script'));
  assert.deepEqual(h.scripts,[],'nothing executes until the account has been verified');
  assert.equal(new Set(hrefs).size,hrefs.length,'each file is requested once');
});

test('private scripts download while the entitlement check is in flight but run only after it passes',async()=>{
  const h=harness();
  const session={user:{id:'synthetic-preload'}};
  h.setSession(session);
  let release;
  h.setEntitlementHook(()=>new Promise(resolve=>{release=()=>resolve({data:{access_state:'grandfathered',can_write:true,email_verified:true},error:null});}));
  let applied=false;
  const startup=h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{applied=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(h.preloads.map(item=>item.href).includes('js/ui.js'),'download has begun');
  assert.deepEqual(h.scripts,[],'no private script runs before the entitlement is verified');
  release();
  await startup;
  assert.equal(applied,true);
  assert.ok(h.scripts.includes('js/app.js'));
  assert.equal(h.preloads.length,new Set(h.preloads.map(item=>item.href)).size,'preloading is not repeated');
});

test('a refused entitlement still never runs private code, even though it was downloaded',async()=>{
  const h=harness({storage:{'sb-example-auth-token':'{}'}});
  const session={user:{id:'synthetic-refused'}};
  h.setSession(session);
  h.setEntitlement({access_state:'trial_eligible',can_write:false,email_verified:true,trial_available:true});
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('must not open Studio'));
  assert.deepEqual(h.scripts,[]);
  assert.equal(h.elements.accountAccessScreen.hidden,false);
});

test('supabase-js fetch failures (no error.name, status 0) open Studio from the cached entitlement even when the device reports online',async()=>{
  for(const message of ['TypeError: Failed to fetch','TypeError: Load failed','TypeError: NetworkError when attempting to fetch resource.']){
    const now=Date.now();
    const h=harness();
    const session={user:{id:'weak-signal'}};
    h.setSession(session);
    assert.equal(h.window.navigator.onLine,true);
    h.setEntitlementHook(()=>({data:null,error:{message,details:'',hint:'',code:''},status:0}));
    const serverTime=new Date(now-60*1000).toISOString();
    h.cache('klabs-account-entitlement:weak-signal',{user_id:'weak-signal',saved_at:serverTime,
      entitlement:{access_state:'paid',can_write:true,email_verified:true,access_expires_at:new Date(now+30*24*3600*1000).toISOString(),server_time:serverTime}});
    let state;
    await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{state=h.window.KLABS_ACCESS_STATE;});
    assert.equal(state.access_state,'paid',message);
    assert.equal(state.offline,true,message);
    assert.ok(h.scripts.includes('js/app.js'),message);
  }
});

test('a real server refusal is never treated as offline, whatever its text says',async()=>{
  const h=harness();
  const session={user:{id:'server-refusal'}};
  h.setSession(session);
  h.setEntitlementHook(()=>({data:null,error:{message:'network access denied for this account',code:'42501'},status:403}));
  const serverTime=new Date().toISOString();
  h.cache('klabs-account-entitlement:server-refusal',{user_id:'server-refusal',saved_at:serverTime,
    entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:serverTime}});
  await assert.rejects(h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('must not open Studio')),(error)=>error.code==='42501');
  assert.deepEqual(h.scripts,[]);
});

test('an unreachable server times out the entitlement request instead of holding the launch screen',async()=>{
  const h=harness();
  const session={user:{id:'lie-fi'}};
  h.setSession(session);
  let signal=null;
  let timeout=null;
  const timers=[];
  h.window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};
  h.window.clearTimeout=()=>{};
  const realRpc=h.window.KLABS_SUPABASE_CLIENT.rpc;
  h.window.KLABS_SUPABASE_CLIENT.rpc=(name)=>{
    if(name!=='get_account_entitlement')return realRpc(name);
    // Like a supabase-js builder: a thenable that accepts an abort signal.
    let settle;
    const call=new Promise(resolve=>{settle=resolve;});
    call.abortSignal=(value)=>{signal=value;value.addEventListener('abort',()=>settle({data:null,error:{message:'AbortError: signal is aborted without reason'},status:0}));return call;};
    return call;
  };
  const serverTime=new Date().toISOString();
  h.cache('klabs-account-entitlement:lie-fi',{user_id:'lie-fi',saved_at:serverTime,
    entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:serverTime}});
  let state;
  const startup=h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{state=h.window.KLABS_ACCESS_STATE;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(signal,'the request carries an abort signal');
  timeout=timers.find(item=>item.ms===3000);
  assert.ok(timeout,'bounded at 3 seconds (Q16)');
  assert.equal(signal.aborted,false);
  timeout.fn();
  await startup;
  assert.equal(signal.aborted,true);
  assert.equal(state.offline,true);
  assert.equal(state.access_state,'paid');
});

// Q16: the account check gives up after 3 s instead of 8 s; everything else about access is unchanged.
function q16Harness(id){
  const h=harness();
  const session={user:{id}};
  h.setSession(session);
  const timers=[];
  const cleared=[];
  h.window.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};
  h.window.clearTimeout=(handle)=>{cleared.push(handle);};
  const realRpc=h.window.KLABS_SUPABASE_CLIENT.rpc;
  let answer=null;
  let signal=null;
  h.window.KLABS_SUPABASE_CLIENT.rpc=(name)=>{
    if(name!=='get_account_entitlement')return realRpc(name);
    const call=new Promise(resolve=>{answer=resolve;});
    call.abortSignal=(value)=>{signal=value;value.addEventListener('abort',()=>answer({data:null,error:{message:'AbortError: signal is aborted without reason'},status:0}));return call;};
    return call;
  };
  return {h,session,timers,cleared,answer:(value)=>answer(value),get signal(){return signal;}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Q16: the account-check limit is 3 seconds, set in one place and used only for that request',()=>{
  assert.match(source,/const ENTITLEMENT_TIMEOUT_MS = 3000;/);
  assert.equal((source.match(/ENTITLEMENT_TIMEOUT_MS/g)||[]).length,2,'declared once, used once');
  assert.match(source,/rpc\("get_account_entitlement"\);[\s\S]{0,300}setTimeout\(\(\) => controller\.abort\(\), ENTITLEMENT_TIMEOUT_MS\)/);
});

test('Q16 normal start-up: a prompt answer is used, cached for offline use, and the 3 s timer is cleared',async()=>{
  const t=q16Harness('q16-normal');
  let state;
  const startup=t.h.window.KLABS_PUBLIC_ENTRY.applySession(t.session,()=>{state=t.h.window.KLABS_ACCESS_STATE;});
  await tick();
  const serverTime=new Date().toISOString();
  t.answer({data:{access_state:'paid',can_write:true,email_verified:true,server_time:serverTime},error:null,status:200});
  await startup;
  assert.equal(state.offline,undefined,'not treated as offline');
  assert.equal(state.access_state,'paid');
  assert.equal(t.signal.aborted,false,'never aborted');
  assert.ok(t.cleared.includes(t.timers.findIndex(x=>x.ms===3000)+1),'timer cleared');
  assert.equal(JSON.parse(t.h.window.localStorage.getItem('klabs-account-entitlement:q16-normal')).entitlement.access_state,'paid','saved access refreshed');
});

test('Q16 unresponsive connection: after 3 s the launch opens with the saved access, which is not overwritten',async()=>{
  const t=q16Harness('q16-dead');
  const saved={user_id:'q16-dead',saved_at:new Date().toISOString(),
    entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:new Date().toISOString()}};
  t.h.cache('klabs-account-entitlement:q16-dead',saved);
  const before=t.h.window.localStorage.getItem('klabs-account-entitlement:q16-dead');
  let state;
  const startup=t.h.window.KLABS_PUBLIC_ENTRY.applySession(t.session,()=>{state=t.h.window.KLABS_ACCESS_STATE;});
  await tick();
  assert.equal(state,undefined,'nothing opens before the limit');
  assert.ok(!t.h.scripts.includes('js/app.js'),'private app not run before the limit');
  t.timers.find(x=>x.ms===3000).fn();
  await startup;
  assert.equal(t.signal.aborted,true);
  assert.equal(state.offline,true);
  assert.equal(state.access_state,'paid');
  assert.equal(state.can_write,true);
  assert.ok(t.h.scripts.includes('js/app.js'));
  assert.equal(t.h.window.localStorage.getItem('klabs-account-entitlement:q16-dead'),before,'saved access unchanged');
});

test('Q16 fallback keeps trial/subscription expiry: an expired saved trial or subscription does not open Studio (Q40)',async()=>{
  for(const [kind,extra] of [['trial',{trial_expires_at:new Date(Date.now()-60000).toISOString()}],['paid',{access_expires_at:new Date(Date.now()-60000).toISOString()}]]){
    const id='q16-expired-'+kind;
    const t=q16Harness(id);
    const serverTime=new Date(Date.now()-3600000).toISOString();
    t.h.cache('klabs-account-entitlement:'+id,{user_id:id,saved_at:serverTime,
      entitlement:{access_state:kind,can_write:true,trial_available:false,email_verified:true,server_time:serverTime,...extra}});
    const startup=t.h.window.KLABS_PUBLIC_ENTRY.applySession(t.session,()=>assert.fail('an ended account must not open'));
    await tick();
    t.timers.find(x=>x.ms===3000).fn();
    await startup;
    assert.equal(t.h.elements.accountAccessScreen.hidden,false,kind);
    assert.equal(t.h.scripts.includes('js/app.js'),false,kind);
  }
});

test('Q16 fallback without saved access stays view-only; saved access of another account is never used',async()=>{
  const t=q16Harness('q16-none');
  t.h.cache('klabs-account-entitlement:q16-none',{user_id:'someone-else',saved_at:new Date().toISOString(),
    entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:new Date().toISOString()}});
  let state;
  const startup=t.h.window.KLABS_PUBLIC_ENTRY.applySession(t.session,()=>{state=t.h.window.KLABS_ACCESS_STATE;});
  await tick();
  t.timers.find(x=>x.ms===3000).fn();
  await startup;
  assert.equal(state.access_state,'offline_readonly');
  assert.equal(state.can_write,false);
});

test('Q16 a server refusal that arrives within the limit is still a refusal, never the saved access',async()=>{
  const t=q16Harness('q16-refused');
  t.h.cache('klabs-account-entitlement:q16-refused',{user_id:'q16-refused',saved_at:new Date().toISOString(),
    entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:new Date().toISOString()}});
  const startup=t.h.window.KLABS_PUBLIC_ENTRY.applySession(t.session,()=>assert.fail('must not open Studio'));
  await tick();
  t.answer({data:null,error:{message:'permission denied',code:'42501'},status:403});
  await assert.rejects(startup,(error)=>error.code==='42501');
  assert.ok(!t.h.scripts.includes('js/app.js'));
});

// Q17: an expired sign-in that cannot be renewed opens the saved records strictly view-only, for this account only.
const Q17_USER='q17-user';
function q17Harness({cache=true,entitlement}={}){
  const h=harness();
  const rpcCalls=[];
  const realRpc=h.window.KLABS_SUPABASE_CLIENT.rpc;
  h.window.KLABS_SUPABASE_CLIENT.rpc=(name)=>{rpcCalls.push(name);return realRpc(name);};
  let renewal=()=>new Promise(()=>{});
  let sessionReads=0;
  h.window.KLABS_SUPABASE_CLIENT.auth.getSession=()=>{sessionReads++;return renewal();};
  h.window.KLABS_IS_RENEWAL_NETWORK_FAILURE=(error)=>error?.name==='AuthRetryableFetchError';
  const serverTime=new Date().toISOString();
  if(cache)h.cache(`klabs-account-entitlement:${Q17_USER}`,{user_id:Q17_USER,saved_at:entitlement?.server_time&&Number.isFinite(Date.parse(entitlement.server_time))?entitlement.server_time:serverTime,
    entitlement:entitlement||{access_state:'paid',can_write:true,email_verified:true,server_time:serverTime}});
  const stored={user:{id:Q17_USER,email:'q17@example.test'}};
  return {h,rpcCalls,stored,sessionReads:()=>sessionReads,setRenewal(fn){renewal=fn;}};
}
const q17Tick=()=>new Promise(resolve=>setImmediate(resolve));

test('Q17: an account-matched saved access record opens Studio strictly view-only, with no Supabase data calls',async()=>{
  const t=q17Harness();
  let applied=null;
  await t.h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession(t.stored,(session)=>{applied={session,state:t.h.window.KLABS_ACCESS_STATE};},new Promise(()=>{}));
  assert.equal(applied.session.user.id,Q17_USER);
  assert.equal(applied.session.access_token,undefined,'no token is invented or reused');
  assert.equal(applied.state.access_state,'paid');
  assert.equal(applied.state.offline,true);
  assert.equal(applied.state.offline_session,true);
  assert.equal(applied.state.can_write,false,'view-only even though the saved access can write');
  assert.equal(t.h.window.KLABS_CAN_WRITE(),false);
  t.h.window.KLABS_ACCESS_STATE.can_write=true;
  assert.equal(t.h.window.KLABS_CAN_WRITE(),false,'stays view-only even if can_write is flipped');
  assert.ok(t.h.classes.has('klabs-offline-session'));
  assert.ok(t.h.scripts.includes('js/app.js'));
  assert.deepEqual(t.rpcCalls,[],'no account, entitlement or block RPC');
  assert.equal(t.sessionReads(),0,'does not wait on the stalled renewal again');
});

test('Q17: trial and subscription expiry still apply to the saved access record (an ended record opens nothing, Q40)',async()=>{
  for(const [kind,extra] of [['trial',{trial_expires_at:new Date(Date.now()-60000).toISOString()}],['paid',{access_expires_at:new Date(Date.now()-60000).toISOString()}]]){
    const serverTime=new Date(Date.now()-3600000).toISOString();
    const t=q17Harness({entitlement:{access_state:kind,can_write:true,email_verified:true,server_time:serverTime,...extra}});
    await assert.rejects(t.h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession(t.stored,()=>assert.fail('must not open'),new Promise(()=>{})),/Could not restore your session/);
    assert.equal(t.h.scripts.includes('js/app.js'),false,kind);
  }
});

test('Q17: no saved record, another account\'s record, an unusable record or a trial-eligible account opens nothing',async()=>{
  const now=new Date().toISOString();
  const cases=[
    ['no record',q17Harness({cache:false})],
    ['trial eligible',q17Harness({entitlement:{access_state:'trial_eligible',can_write:false,email_verified:true,server_time:now}})],
    ['unknown state',q17Harness({entitlement:{access_state:'blocked',can_write:false,email_verified:true,server_time:now}})],
    ['bad time',q17Harness({entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:'not a time'}})],
  ];
  const other=q17Harness({cache:false});
  other.h.cache(`klabs-account-entitlement:${Q17_USER}`,{user_id:'someone-else',saved_at:now,entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:now}});
  other.h.cache('klabs-account-entitlement:someone-else',{user_id:'someone-else',saved_at:now,entitlement:{access_state:'paid',can_write:true,email_verified:true,server_time:now}});
  cases.push(['other account',other]);
  for(const [name,t] of cases){
    await assert.rejects(t.h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession(t.stored,()=>assert.fail(name),new Promise(()=>{})),undefined,name);
    assert.ok(!t.h.scripts.includes('js/app.js'),name+': private app not run');
    assert.equal(t.h.window.KLABS_ACCESS_STATE??null,null,name);
    assert.ok(!t.h.classes.has('klabs-offline-session'),name);
  }
  await assert.rejects(q17Harness().h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession({user:{id:''}},()=>assert.fail('empty id'),null));
});

test('Q17 recovery: a renewal that later succeeds, or is refused, restarts Studio; a network failure keeps waiting',async()=>{
  for(const [name,result,reload] of [
    ['renewed',{data:{session:{user:{id:Q17_USER}}},error:null},1],
    ['refused',{data:{session:null},error:{name:'AuthApiError',status:400}},1],
    ['still offline',{data:{session:null},error:{name:'AuthRetryableFetchError',status:0}},0],
  ]){
    const t=q17Harness();
    let finish;
    await t.h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession(t.stored,()=>{},new Promise(resolve=>{finish=resolve;}));
    assert.equal(t.h.reloads(),0);
    finish(result);await q17Tick();
    assert.equal(t.h.reloads(),reload,name);
  }
  const none=q17Harness({cache:false});
  let finish;
  await assert.rejects(none.h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession(none.stored,()=>{},new Promise(resolve=>{finish=resolve;})));
  finish({data:{session:{user:{id:Q17_USER}}},error:null});await q17Tick();
  assert.equal(none.h.reloads(),1,'nothing opened: a later renewal restarts normally');
});

test('Q17: the periodic account check retries only the sign-in renewal while view-only, never the block RPC',async()=>{
  const t=q17Harness();
  await t.h.window.KLABS_PUBLIC_ENTRY.applyOfflineSession(t.stored,()=>{},new Promise(()=>{}));
  t.h.document.visibilityState='visible';
  t.setRenewal(async()=>({data:{session:null},error:{name:'AuthRetryableFetchError',status:0}}));
  await t.h.events.visibilitychange();await q17Tick();
  assert.equal(t.sessionReads(),1);
  assert.deepEqual(t.rpcCalls,[],'klabs_account_is_blocked is not called with an unrenewed sign-in');
  assert.equal(t.h.reloads(),0);
  t.setRenewal(async()=>({data:{session:{user:{id:Q17_USER}}},error:null}));
  await t.h.events.visibilitychange();await q17Tick();
  assert.equal(t.h.reloads(),1,'renewed: restart with normal authentication and sync');
});

test('Q17: a valid sign-in is unaffected - normal start-up still verifies access with the server and may write',async()=>{
  const h=harness();
  const session={user:{id:'q17-valid'}};
  h.setSession(session);
  h.setEntitlement({access_state:'paid',can_write:true,email_verified:true,server_time:new Date().toISOString()});
  let state;
  await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{state=h.window.KLABS_ACCESS_STATE;});
  assert.equal(state.offline_session,undefined);
  assert.equal(h.window.KLABS_CAN_WRITE(),true);
  assert.ok(!h.classes.has('klabs-offline-session'));
});

test('Q24: the public entry is Explore Studio (opens Demo Mode) and Sign In; Demo Mode still also opens at ?demo', () => {
  // Was (Q18 Phase 3 correction): Explore Studio with its trial note, Discover K-Labs Studio and Sign In, both Explore
  // buttons opening sign-in.
  assert.ok(html.includes(`          <button id="publicExploreBtn" class="home-enter-rod-button primary-action" type="button">
            <span class="home-public-entry__primary-label">EXPLORE STUDIO</span>
          </button>
          <button id="publicSignInBtn" class="home-public-entry__signin" type="button">SIGN IN</button>`));
  const css = fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
  const js = fs.readFileSync(path.join(__dirname,'..','js','public-entry.js'),'utf8');
  assert.doesNotMatch(css, /#publicExploreBtn/);
  assert.ok(js.includes('document.getElementById("publicExploreBtn").addEventListener("click", () => window.KLABS_DEMO.enter());'));
  assert.ok(js.includes('document.getElementById("publicSignInBtn").addEventListener("click", () => showAuth(""));'));
  assert.match(fs.readFileSync(path.join(__dirname,'..','js','demo-mode.js'),'utf8'), /function enterUrl\(\)/);
});

test('Q40: a monthly or annual subscription never ends early - long expiry waits are armed in steps no longer than a day',async()=>{
  for(const days of [31,366]){
    const h=harness();
    const session={user:{id:'long-'+days}};
    h.setSession(session);
    const delays=[];
    h.window.setTimeout=(fn,ms)=>{delays.push(ms);h.window.expiryCallback=fn;return delays.length;};
    h.setEntitlement({access_state:'paid',can_write:true,trial_available:false,email_verified:true,
      access_expires_at:new Date(Date.now()+days*24*3600_000).toISOString(),server_time:new Date().toISOString()});
    h.window.KLABS_APPLY_AUTH_STATE=()=>{};
    await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>{});
    const expiryDelays=delays.filter((ms)=>ms>=60_000);
    assert.ok(expiryDelays.length>=1,days);
    assert.ok(expiryDelays.every((ms)=>ms<=24*3600_000),`${days} days: ${expiryDelays}`);
    // The first step only re-arms the wait: access is unchanged.
    h.window.expiryCallback();
    assert.equal(h.window.KLABS_CAN_WRITE(),true,days);
    assert.equal(h.window.KLABS_ACCESS_STATE.access_state,'paid',days);
  }
});

// Q40 owner access: the server's "owner" state (20261128000000_q40_owner_access.sql) must be accepted by the app, online
// and when restoring offline - otherwise the owner would be locked out of Studio by the app itself.
test('the app accepts the server owner state online and offline', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'public-entry.js'), 'utf8');
  const list = (name) => JSON.parse(source.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))[1]);
  assert.ok(list('allowedStates').includes('owner'));
  assert.ok(list('openable').includes('owner'));
  const migration = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'supabase', 'migrations', '20261128000000_q40_owner_access.sql'), 'utf8');
  // The server reports the owner as 'grandfathered' (accepted by every released app version, so no cached older app
  // can reject it); the app also tolerates an 'owner' state defensively.
  assert.match(migration, /select 'grandfathered'::text, true, false, null::timestamptz, null::timestamptz, null::timestamptz/);
});

// ---- Q18 Phase 5: one demonstration. The access-routing matrix and the retired static Explore Mode screen.
test('Q18 Phase 5: paid, complimentary and grandfathered accounts open their real Studio and never the demonstration',async()=>{
  const serverTime=new Date().toISOString();
  const endsAt=new Date(Date.now()+30*24*60*60*1000).toISOString();
  for(const entitlement of [
    {access_state:'paid',can_write:true,trial_available:false,email_verified:true,access_expires_at:endsAt,server_time:serverTime},
    {access_state:'complimentary',can_write:true,trial_available:false,email_verified:true,access_expires_at:endsAt,server_time:serverTime},
    {access_state:'complimentary',can_write:true,trial_available:false,email_verified:true,access_expires_at:null,server_time:serverTime},
    {access_state:'grandfathered',can_write:true,trial_available:false,email_verified:true},
  ]){
    const h=harness();
    const session={user:{id:`matrix-${entitlement.access_state}`}};
    h.setSession(session);
    h.setEntitlement(entitlement);
    let applied=null;
    await h.window.KLABS_PUBLIC_ENTRY.applySession(session,(value)=>{applied=value;});
    assert.equal(applied,session,entitlement.access_state);
    assert.ok(h.scripts.includes('js/ui.js'),entitlement.access_state);
    assert.notEqual(h.elements.accountAccessScreen.hidden,false,`${entitlement.access_state}: no access screen`);
    assert.equal(h.window.KLABS_DEMO.entered,0,`${entitlement.access_state}: not sent to the demonstration`);
  }
});

test('Q18 Phase 5: accounts without access (never subscribed, expired) get Subscribe, Explore Studio and Sign Out; Studio does not load',async()=>{
  for(const entitlement of [
    {access_state:'trial_eligible',can_write:false,trial_available:false,email_verified:true},
    {access_state:'expired',can_write:false,trial_available:false,email_verified:true},
  ]){
    const h=harness();
    const session={user:{id:`noaccess-${entitlement.access_state}`}};
    h.setSession(session);
    h.setEntitlement(entitlement);
    await h.window.KLABS_PUBLIC_ENTRY.applySession(session,()=>assert.fail('Studio must not open without access'));
    assert.deepEqual(h.scripts,[],entitlement.access_state);
    assert.ok(!h.window.KLABS_ACCESS_STATE,'nothing in Studio can run');
    assert.equal(h.elements.accountAccessScreen.hidden,false);
    assert.equal(h.elements.accountAccessChoices.hidden,false,'subscription panel and Explore Studio shown');
    assert.equal(typeof h.elements.accessSignOutBtn.listeners.click,'function','Sign Out wired');
    h.elements.enterExploreDemoBtn.listeners.click();
    assert.equal(h.window.KLABS_DEMO.entered,1);
  }
});

test('Q18 Phase 5: the static Explore Mode screen, its fictional panels, script and styles are gone; the account screen keeps billing and Sign Out',()=>{
  const css=fs.readFileSync(path.join(__dirname,'..','css','studio.css'),'utf8');
  for(const gone of ['exploreDemoScreen','explore-demo','demoSubscribeBtn','demoSignOutBtn','data-demo-view','data-demo-panel','Mara Te Rangi','EXPLORE MODE','EXPLORE WITH DEMONSTRATION DATA']){
    assert.ok(!html.includes(gone),`index.html: ${gone}`);
    assert.ok(!source.includes(gone),`js/public-entry.js: ${gone}`);
  }
  assert.doesNotMatch(css,/explore-demo/);
  const screen=html.slice(html.indexOf('<section id="accountAccessScreen"'),html.indexOf('</section>',html.indexOf('<section id="accountAccessScreen"')));
  assert.match(screen,/<div id="accessBillingPanel" class="billing-panel"><\/div>/);
  assert.match(screen,/<button id="enterExploreDemoBtn" class="account-access-secondary" type="button">EXPLORE STUDIO<\/button>/);
  assert.match(screen,/<button id="accessSignOutBtn" class="account-access-signout" type="button">SIGN OUT<\/button>/);
  assert.match(source,/function showExploreDemo\(\) \{[\s\S]*?window\.KLABS_DEMO\.enter\(\);\s*\}/);
});
