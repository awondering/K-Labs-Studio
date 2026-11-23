const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const SCOPE='https://studio.example/';

class FakeRequest{
  constructor(input,options={}){
    this.url=typeof input==='string'?input:input.url;
    this.method=input.method||'GET';
    this.mode=options.mode||input.mode||'cors';
    this.cache=options.cache||input.cache||'default';
  }
}
const response=(body,status=200)=>({status,type:'basic',body,clone(){return response(body,status);}});

function harness(){
  const listeners={};
  const store=new Map();
  const puts=[];
  const fetches=[];
  let network=(request)=>Promise.resolve(response(`network:${request.url}`));
  const match=async(request,options={})=>{
    const url=typeof request==='string'?request:request.url;
    if(store.has(url))return store.get(url);
    if(options.ignoreSearch){
      const bare=url.split('?')[0];
      for(const [key,value] of store)if(key.split('?')[0]===bare)return value;
    }
    return undefined;
  };
  const caches={
    open:async()=>({
      put:async(request,value)=>{const url=typeof request==='string'?request:request.url;puts.push({url,value});store.set(url,value);},
      match,
    }),
    match,
    keys:async()=>[],delete:async()=>true,
  };
  const sandbox={
    self:{registration:{scope:SCOPE},addEventListener(name,fn){listeners[name]=fn;},skipWaiting(){},clients:{claim:async()=>{},matchAll:async()=>[]}},
    caches,Request:FakeRequest,URL,Promise,Response:undefined,
    fetch:(request)=>{fetches.push(request);return network(request);},
  };
  vm.runInNewContext(source,sandbox);
  async function dispatch(url,{mode='cors',method='GET'}={}){
    const request=new FakeRequest(url,{mode});request.method=method;
    let responded;let waited=[];
    const event={request,respondWith(value){responded=Promise.resolve(value);},waitUntil(value){waited.push(Promise.resolve(value));}};
    listeners.fetch(event);
    return {handled:responded!==undefined,responded,waited};
  }
  return {dispatch,store,puts,fetches,setNetwork(fn){network=fn;},listeners};
}

// Q33 production regression: v278's page ran v277's ui.js on real devices because each file was refreshed on its own in the
// background. A release is now installed and served as one complete set; nothing refreshes a single file.
test('a cached navigation opens at once from this release, with no network request and no single-file refresh',async()=>{
  const h=harness();
  h.store.set(`${SCOPE}index.html`,response('cached-index'));
  const result=await h.dispatch(SCOPE,{mode:'navigate'});
  assert.equal((await result.responded).body,'cached-index');
  assert.equal(h.fetches.length,0,'no request: the page never changes apart from its code');
  assert.equal(h.puts.length,0,'nothing is rewritten in the release cache');
});

test('a cached script, stylesheet or page is served from this release and never refreshed on its own',async()=>{
  for(const file of ['js/ui.js','css/studio.css','manifest.json','kr-guide-layout/index.html','js/public-entry.js']){
    const h=harness();
    h.store.set(`${SCOPE}${file}`,response(`cached:${file}`));
    const result=await h.dispatch(`${SCOPE}${file}`);
    assert.equal((await result.responded).body,`cached:${file}`);
    assert.equal(h.fetches.length,0,`${file}: no background request`);
    assert.equal(h.puts.length,0,`${file}: the release copy is not replaced`);
  }
});

test('an uncached asset comes from the network and is cached; an uncached asset with no network fails normally',async()=>{
  const h=harness();
  const result=await h.dispatch(`${SCOPE}js/new-file.js`);
  assert.equal((await result.responded).body,`network:${SCOPE}js/new-file.js`);
  await Promise.all(result.waited);
  assert.ok(h.store.has(`${SCOPE}js/new-file.js`));
  const offline=harness();
  offline.setNetwork(()=>Promise.reject(new TypeError('Failed to fetch')));
  const failed=await offline.dispatch(`${SCOPE}js/other.js`);
  assert.equal(await failed.responded,undefined);
});

test('offline navigation falls back to the cached index, including for query strings and deep links',async()=>{
  const h=harness();
  h.store.set(`${SCOPE}index.html`,response('cached-index'));
  h.setNetwork(()=>Promise.reject(new TypeError('Failed to fetch')));
  for(const url of [SCOPE,`${SCOPE}?utm=1`,`${SCOPE}workshop`]){
    const result=await h.dispatch(url,{mode:'navigate'});
    assert.equal((await result.responded).body,'cached-index',url);
  }
});

test('install downloads every file for this release (version in the query, no HTTP cache) and stores each under its own address',async()=>{
  const h=harness();
  let installed;
  h.listeners.install({waitUntil(value){installed=value;}});
  await installed;
  const version=/const APP_SHELL_VERSION='([^']+)'/.exec(source)[1];
  assert.ok(h.fetches.length>40);
  for(const request of h.fetches){
    assert.equal(request.cache,'reload',request.url);
    assert.equal(new URL(request.url).searchParams.get('shell'),version,request.url);
  }
  assert.ok(h.store.has(`${SCOPE}js/ui.js`) && h.store.has(`${SCOPE}index.html`));
  assert.ok(![...h.store.keys()].some((url)=>url.includes('shell=')),'stored under the plain address the page asks for');
});

test('one file that cannot be downloaded fails the whole install and stores nothing, so the previous release keeps running',async()=>{
  const h=harness();
  h.setNetwork((request)=>Promise.resolve(request.url.includes('js/ui.js')?response('server error',500):response(`network:${request.url}`)));
  let installed;
  h.listeners.install({waitUntil(value){installed=value;}});
  await assert.rejects(installed,/ui\.js could not be downloaded/);
  assert.equal(h.puts.length,0);
});

test('requests the worker does not own are left alone',async()=>{
  const h=harness();
  assert.equal((await h.dispatch(`${SCOPE}js/ui.js`,{method:'POST'})).handled,false);
  assert.equal((await h.dispatch('https://other.example/js/ui.js')).handled,false);
});

test('every file the page can load at startup is in the install precache, so cached-first launches are complete',async()=>{
  const h=harness();
  const install=h.listeners.install;
  let installed;
  install({waitUntil(value){installed=value;}});
  await installed;
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const entry=fs.readFileSync(path.join(root,'js','public-entry.js'),'utf8');
  const wanted=new Set();
  for(const match of html.matchAll(/<(?:script src|link rel="stylesheet" href)="([^"]+)"/g))wanted.add(match[1]);
  for(const match of entry.matchAll(/"(js\/[^"]+\.js)"/g))wanted.add(match[1]);
  assert.ok(wanted.size>20);
  for(const file of wanted)assert.ok(h.store.has(`${SCOPE}${file}`),`${file} must be precached`);
});
