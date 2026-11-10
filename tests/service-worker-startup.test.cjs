const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','app.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness({readyState='loading',local=false,controlled=false}={}){
  const windowListeners={};
  const documentListeners={};
  const workerListeners={};
  const registrationListeners={};
  const calls={register:[],updates:0,waiting:0,reloads:0,unregister:0,renders:0};
  const labels={offlineReadyStatus:{textContent:''},settingsOfflineStatus:{textContent:''}};
  const registration={
    waiting:{postMessage(message){assert.equal(message.type,'SKIP_WAITING');calls.waiting++;}},
    addEventListener(name,fn){registrationListeners[name]=fn;},
    update(){calls.updates++;return Promise.resolve();},
    unregister(){calls.unregister++;return Promise.resolve();},
  };
  const worker={
    controller:controlled?{}:null,
    register(url,options){calls.register.push({url,options});return Promise.resolve(registration);},
    getRegistrations(){return Promise.resolve([registration]);},
    addEventListener(name,fn){workerListeners[name]=fn;},
    ready:Promise.resolve(registration),
  };
  const session=new Map();
  const location={protocol:'https:',hostname:local?'localhost':'studio.klabs.co.nz',href:'https://studio.klabs.co.nz/',reload(){calls.reloads++;},replace(){calls.reloads++;}};
  const window={addEventListener(name,fn){(windowListeners[name] ||= []).push(fn);}};
  const document={readyState,visibilityState:'visible',getElementById:id=>labels[id]||null,
    addEventListener(name,fn){(documentListeners[name] ||= []).push(fn);}};
  const sandbox={window,document,navigator:{serviceWorker:worker},location,sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},
    KLABS_UI:{buildWheels(){calls.renders++;},renderBlanks(){calls.renders++;},render(){calls.renders++;}},Promise};
  vm.runInNewContext(source,sandbox);
  return {calls,registration,registrationListeners,workerListeners,windowListeners,documentListeners,labels,document};
}

for(const readyState of ['loading','complete']){
  test(`service worker initializes once with document ${readyState}`,async()=>{
    const h=harness({readyState,controlled:true});
    assert.equal(h.calls.renders,3);
    if(readyState==='loading'){
      assert.equal(h.calls.register.length,0);
      assert.equal(h.windowListeners.load.length,1);
      h.windowListeners.load[0]();
      h.windowListeners.load[0]();
    }else{
      assert.equal(h.windowListeners.load,undefined);
    }
    await settle();
    assert.equal(h.calls.register.length,1);
    assert.equal(h.calls.register[0].url,'./service-worker.js');
    assert.equal(h.calls.register[0].options.updateViaCache,'none');
    assert.equal(h.calls.updates,1);
    assert.equal(h.calls.waiting,1);
    assert.equal(h.labels.offlineReadyStatus.textContent,'OFFLINE READY');
    let onStateChange;
    h.registration.installing={state:'installing',addEventListener(name,fn){assert.equal(name,'statechange');onStateChange=fn;}};
    h.registrationListeners.updatefound();
    h.registration.installing.state='installed';
    onStateChange();
    assert.equal(h.calls.waiting,2);
    assert.equal(h.documentListeners.visibilitychange.length,1);
    assert.equal(h.windowListeners.focus.length,1);
    h.document.visibilityState='hidden';
    h.documentListeners.visibilitychange[0]();
    assert.equal(h.calls.updates,1);
    h.document.visibilityState='visible';
    h.documentListeners.visibilitychange[0]();
    h.windowListeners.focus[0]();
    assert.equal(h.calls.updates,3);
    h.workerListeners.controllerchange();
    h.workerListeners.controllerchange();
    assert.equal(h.calls.reloads,1);
  });
}

test('first controller does not trigger a reload',async()=>{
  const h=harness({readyState:'complete'});
  await settle();
  h.workerListeners.controllerchange();
  assert.equal(h.calls.reloads,0);
});

test('late local development startup still unregisters workers and reloads once',async()=>{
  const h=harness({readyState:'complete',local:true});
  await settle();
  assert.equal(h.calls.unregister,1);
  assert.equal(h.calls.reloads,1);
  assert.equal(h.calls.register.length,0);
});
