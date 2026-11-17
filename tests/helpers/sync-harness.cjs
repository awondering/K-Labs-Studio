// Shared harness for the synchronisation reliability tests. Runs the REAL build-sync.js, build-sync-journal.js and
// guarded-build-transport.js (from SYNC_SRC_DIR, default this repository) against an in-memory cloud that mimics the
// database guards (revision check, no direct payment/issued-invoice changes). Synthetic data only.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=process.env.SYNC_SRC_DIR||path.join(__dirname,'..','..');
const read=(f)=>fs.readFileSync(path.join(root,'js',f),'utf8');
const SRC={journal:read('build-sync-journal.js'),transport:read('guarded-build-transport.js'),sync:read('build-sync.js')};
const clone=(v)=>v==null?v:JSON.parse(JSON.stringify(v));
const settle=async()=>{for(let i=0;i<4;i++)await new Promise((r)=>setImmediate(r));};

function makeCloud(){
  let tick=0;const users={};
  const failures={read:null,auth:null,dropAck:0,network:false};
  const rows=(u)=>users[u]||(users[u]=new Map());
  const stamp=()=>new Date(Date.UTC(2026,10,1,0,0,++tick)).toISOString();
  const cloud={users,failures,rows,stamp,writes:[],
    seed(u,id,payload){const row={user_id:u,client_id:id,build_number:String(payload.buildNumber||''),payload:clone(payload),updated_at:stamp()};rows(u).set(id,row);return row;},
    // Server-side financial operation: the only path that may change payments (mirrors klabs_financial_operation).
    pay(u,id,payment){const row=rows(u).get(id);const p=clone(row.payload);p.payments=[...(p.payments||[]),payment];rows(u).set(id,{...row,payload:p,updated_at:stamp()});return rows(u).get(id);},
    ids:(u)=>[...rows(u).keys()].sort(),
    get:(u,id)=>clone(rows(u).get(id)),
  };
  return cloud;
}

function makeDevice(cloud,account,name,opts={}){
  const store=opts.store||new Map();const locals=opts.locals||{list:[]};const timers=new Map();let tid=0;const events=[];
  const ui={open:new Set(),unsaved:new Set(),refreshed:[]};
  const client={
    auth:{async getUser(){
      if(cloud.failures.auth)return {data:{user:null},error:{message:cloud.failures.auth,status:401}};
      return {data:{user:{id:account}},error:null};}},
    async rpc(fn,args){
      if(cloud.failures.network)throw new Error('network down');
      if(fn==='klabs_build_guard_version')return {data:2,error:null};
      if(fn==='klabs_delete_build_if_revision'){
        const row=cloud.rows(account).get(args.p_client_id);
        if(!row||row.updated_at!==args.p_revision)return {data:false,error:null};
        if(row.payload.issuedInvoice)return {data:null,error:{code:'P0001',message:'A build with an issued invoice cannot be deleted.'}};
        cloud.rows(account).delete(args.p_client_id);return {data:true,error:null};}
      throw new Error('unexpected rpc '+fn);},
    from(table){
      assert.equal(table,'builds');
      const q={op:'select',filters:{},range:null,payload:null};
      const api={select(){return api;},order(){return api;},range(a,b){q.range=[a,b];return api;},
        eq(k,v){q.filters[k]=v;return api;},insert(row){q.op='insert';q.payload=row;return api;},update(row){q.op='update';q.payload=row;return api;},
        then(res,rej){return Promise.resolve().then(exec).then(res,rej);}};
      function exec(){
        if(cloud.failures.network)throw new Error('network down');
        const mine=cloud.rows(account);
        if(q.op==='select'){
          if(cloud.failures.read)return {data:null,error:{message:cloud.failures.read},count:null};
          events.push({op:'select'});
          let all=[...mine.values()].sort((a,b)=>a.client_id<b.client_id?-1:1);
          if(q.filters.client_id)all=all.filter((r)=>r.client_id===q.filters.client_id);
          const slice=q.range?all.slice(q.range[0],q.range[1]+1):all;
          return {data:clone(slice),error:null,count:all.length};
        }
        const dropAck=cloud.failures.dropAck>0&&(cloud.failures.dropAck--,true);   // the write lands, the reply is lost and the connection then stays down
        if(q.op==='insert'){
          events.push({op:'insert',id:q.payload.client_id});cloud.writes.push({op:'insert',id:q.payload.client_id,by:name});
          if(mine.has(q.payload.client_id))return {data:null,error:{code:'23505',message:'duplicate key'}};
          const p={...q.payload.payload};delete p._buildGuardCreate;
          if((p.payments||[]).length||p.issuedInvoice)return {data:null,error:{code:'P0001',message:'Financial records require an acknowledged financial operation.'}};
          const row={...q.payload,payload:p,updated_at:cloud.stamp()};mine.set(row.client_id,row);
          if(dropAck){cloud.failures.network=true;throw new Error('connection lost after the server accepted the write');}
          return {data:[clone(row)],error:null};
        }
        events.push({op:'update',id:q.filters.client_id});cloud.writes.push({op:'update',id:q.filters.client_id,by:name});
        const row=mine.get(q.filters.client_id);
        if(!row||row.updated_at!==q.filters.updated_at)return {data:[],error:null};
        const p={...q.payload.payload};delete p._expectedBuildRevision;
        if(JSON.stringify(p.payments||[])!==JSON.stringify(row.payload.payments||[])||JSON.stringify(p.issuedInvoice)!==JSON.stringify(row.payload.issuedInvoice))
          return {data:null,error:{code:'P0001',message:'Financial records require an acknowledged financial operation.'}};
        const next={...row,payload:p,build_number:q.payload.build_number,updated_at:cloud.stamp()};mine.set(row.client_id,next);
        if(dropAck){cloud.failures.network=true;throw new Error('connection lost after the server accepted the write');}
        return {data:[clone(next)],error:null};
      }
      return api;
    },
  };
  const online={value:true};
  const window={
    KLABS_SUPABASE_CLIENT:client,KLABS_ACCOUNT_ID:account,KLABS_CAN_WRITE:()=>true,crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:(k)=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)},
    navigator:{get onLine(){return online.value;}},
    savedBuildRecords:()=>locals.list,
    saveBuildRecords:(l)=>{locals.list=clone(l);return true;},
    KLABS_UI:{refreshBuildViews(){},onBuildSyncStatus(){},onBuildSyncMode(){},
      isBuildOpen:(id)=>ui.open.has(String(id)),
      hasUnsavedEdits:(id)=>ui.unsaved.has(String(id)),
      refreshOpenBuild:(id,record)=>{ui.refreshed.push({id:String(id),record:clone(record)});return true;}},
    addEventListener(){},
  };
  const ctx={window,console:{error(){},log(){},warn(){}},setTimeout(fn,ms){const id=++tid;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},Date,JSON,Math,Promise,Object,Array,Set,Map,String,Number,Error,RegExp};
  vm.createContext(ctx);
  for(const s of [SRC.journal,SRC.transport,SRC.sync])vm.runInContext(s,ctx);
  const sync=window.KLABS_BUILD_SYNC;
  const dev={name,account,window,locals,events,store,ui,online,cloudRef:cloud,
    journal:()=>window.KLABS_BUILD_SYNC_JOURNAL.read(account),
    status:()=>sync.getStatus(),
    record:(id)=>locals.list.find((r)=>String(r.id)===String(id)),
    ids:()=>locals.list.map((r)=>String(r.id)).sort(),
    async signIn(){await sync.onAuthStateChanged({user:{id:account}});await settle();},
    save(record){const i=locals.list.findIndex((r)=>String(r.id)===String(record.id));if(i>=0)locals.list[i]=clone(record);else locals.list.unshift(clone(record));sync.notifyBuildSaved(clone(record));},
    del(id){const rec=dev.record(id);sync.notifyBuildDeleted(clone(rec));locals.list=locals.list.filter((r)=>String(r.id)!==String(id));sync.confirmBuildDeleted(id);},
    async sync(){await sync.retry();await settle();},
    async flushTimers(){for(const [id,t] of [...timers]){timers.delete(id);t.fn();}await settle();},
    seedLocal(record){locals.list.unshift(clone(record));},
    pendingTimers:()=>timers.size,
    writes:()=>events.filter((e)=>e.op!=='select').length,
    // Browser restart / app upgrade: same storage, brand-new engine instance.
    restart(){return makeDevice(cloud,account,name,{store,locals});},
  };
  return dev;
}
const build=(id,extra)=>({id,buildNumber:'B-'+id,customerName:'Synthetic '+id,buildName:'Rod '+id,quoteStatus:'active',
  savedAt:'2026-11-13T21:16:48.680Z',updatedAt:'2026-11-13T21:16:48.680Z',createdAt:'2026-11-10T00:00:00.000Z',notes:'',...extra});
async function synced(cloud,account,id,payload,name='dev'){
  cloud.seed(account,id,payload);const d=makeDevice(cloud,account,name);d.seedLocal(payload);await d.signIn();return d;
}
// Fields that differ between two records, ignoring nothing.
const diffKeys=(a,b)=>[...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter((k)=>JSON.stringify(a?.[k])!==JSON.stringify(b?.[k])).sort();
// Several devices that have all synchronised the same cloud row (one seed, one revision).
async function sharedRow(cloud,account,id,payload,names){
  cloud.seed(account,id,payload);const out=[];
  for(const n of names){const d=makeDevice(cloud,account,n);d.seedLocal(payload);await d.signIn();out.push(d);}
  return out;
}
module.exports={makeCloud,makeDevice,build,synced,sharedRow,clone,settle,diffKeys,SRC};
