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
  const caches={
    open:async()=>({
      put:async(request,value)=>{puts.push({url:request.url,value});store.set(request.url,value);},
      addAll:async(requests)=>{requests.forEach(request=>store.set(request.url,response(`precached:${request.url}`)));},
    }),
    match:async(request,options={})=>{
      const url=typeof request==='string'?request:request.url;
      if(store.has(url))return store.get(url);
      if(options.ignoreSearch){
        const bare=url.split('?')[0];
        for(const [key,value] of store)if(key.split('?')[0]===bare)return value;
      }
      return undefined;
    },
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

test('a cached navigation opens at once without waiting for the network, and refreshes the cache afterwards',async()=>{
  const h=harness();
  h.store.set(`${SCOPE}index.html`,response('cached-index'));
  let finish;
  h.setNetwork(()=>new Promise(resolve=>{finish=()=>resolve(response('fresh-index'));}));
  const result=await h.dispatch(SCOPE,{mode:'navigate'});
  assert.equal((await result.responded).body,'cached-index','served from the cache while the network is still pending');
  assert.equal(h.fetches.length,1);
  assert.equal(h.fetches[0].cache,'no-store','the background refresh bypasses the HTTP cache');
  assert.equal(result.waited.length,1,'the worker stays alive until the refresh completes');
  finish();
  await Promise.all(result.waited);
  assert.equal(h.puts.length,1);
  assert.equal(h.puts[0].value.body,'fresh-index');
});

test('a cached script or stylesheet is served at once and refreshed with revalidation',async()=>{
  for(const file of ['js/ui.js','css/studio.css','manifest.json','kr-guide-layout/index.html']){
    const h=harness();
    h.store.set(`${SCOPE}${file}`,response(`cached:${file}`));
    h.setNetwork(()=>new Promise(()=>{}));
    const result=await h.dispatch(`${SCOPE}${file}`);
    assert.equal((await result.responded).body,`cached:${file}`);
    assert.equal(h.fetches[0].cache,'no-cache',file);
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

test('a failed background refresh keeps serving the cached copy and does not replace it with an error',async()=>{
  const h=harness();
  h.store.set(`${SCOPE}js/app.js`,response('cached-app'));
  h.setNetwork(()=>Promise.resolve(response('server error',500)));
  const result=await h.dispatch(`${SCOPE}js/app.js`);
  assert.equal((await result.responded).body,'cached-app');
  await Promise.all(result.waited);
  assert.equal(h.puts.length,0,'a non-200 response is never cached');
  assert.equal(h.store.get(`${SCOPE}js/app.js`).body,'cached-app');
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
