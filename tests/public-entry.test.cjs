const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'..','js','public-entry.js'),'utf8');

function harness(){
  const classes=new Set(['klabs-auth-resolving','klabs-logged-out']);
  const events={};
  const scripts=[];
  let failScript='';
  const elements={};
  let session=null;
  for(const id of ['authScreen','app','authEmail','authForm','authShowSignUp','authSignUpForm','publicDiscoverDialog','homeLivingRod','publicExploreBtn','publicSignInBtn','authBackHome','publicDiscoverBtn','publicDiscoverExploreBtn','publicDiscoverClose','authMessage']){
    elements[id]={style:{setProperty(){}},listeners:{},classList:{add(){},remove(){}},
      addEventListener(event,fn){this.listeners[event]=fn;},focus(){},showModal(){this.open=true;},close(){this.open=false;},
      querySelector(){return {appendChild(){}};}};
  }
  const document={
    body:{classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},contains(x){return classes.has(x);}}},
    getElementById:id=>elements[id],
    addEventListener(event,fn){events[event]=fn;},
    createElement:()=>({style:{setProperty(){}}}),
    querySelector:()=>null,
    head:{appendChild(script){scripts.push(script.src);queueMicrotask(()=>script.src===failScript?script.onerror():script.onload());}},
  };
  const window={scrollTo(){},location:{reload(){}},KLABS_UI:{startNewBuildFlow(){}},
    KLABS_SUPABASE_CLIENT:{auth:{getSession:async()=>({data:{session},error:null})}}};
  vm.runInNewContext(source,{window,document,Promise,Error});
  events.DOMContentLoaded();
  return {window,document,elements,classes,scripts,setSession(value){session=value;},failScript(value){failScript=value;}};
}

test('public markup does not load private application scripts',()=>{
  assert.match(html,/<script src="js\/public-entry\.js"><\/script>/);
  assert.match(html,/<button id="publicExploreBtn"[^>]*>[\s\S]*?<span class="home-public-entry__primary-label">EXPLORE STUDIO<\/span>[\s\S]*?<span class="home-public-entry__trial-note">7-day trial available<\/span>[\s\S]*?<\/button>/);
  assert.doesNotMatch(html,/<p>\s*7-day trial available\s*<\/p>/);
  for(const name of ['storage','ui','navigation','component-sync','build-sync','settings-sync','app']){
    assert.doesNotMatch(html,new RegExp(`<script src="js/${name}\\.js">`));
  }
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
