// The business logo travels inside businessProfile through the existing per-user studio_settings row.
// These tests run the real settings-sync.js against an in-memory cloud to check it stays inside the existing limits.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Logo=require('../js/business-logo.js');
const src=fs.readFileSync(path.join(__dirname,'..','js','settings-sync.js'),'utf8');
const prefix='data:image/png;base64,';
const maxLogo=prefix+'A'.repeat(Logo.MAX_STORED_LENGTH-prefix.length); // the largest value the app will ever store
const session=(id)=>({user:{id}});

function device(cloud,{local={}}={}){
  const values=new Map();const timers=[];const writes=[];const applied=[];let user='';
  const window={
    Store:{get:(k,f)=>values.has(k)?JSON.parse(values.get(k)):f,set:(k,v)=>{values.set(k,JSON.stringify(v));return true;}},
    KLABS_BUSINESS_LOGO:Logo,
    KLABS_SUPABASE_CLIENT:{from(table){
      assert.equal(table,'studio_settings');let id;
      const q={select(){return q;},eq(_k,v){id=v;return q;},
        maybeSingle:async()=>({data:cloud.get(id)||null,error:null}),
        upsert(row){writes.push(JSON.parse(JSON.stringify(row)));cloud.set(row.user_id,JSON.parse(JSON.stringify(row)));return Promise.resolve({error:null});}};
      return q;}},
    readStudioSettingsSyncPayload:()=>({studioSettings:{},businessProfile:local[user]||{}}),
    applyStudioSettingsSyncPayload:(p)=>applied.push(JSON.parse(JSON.stringify(p))),
  };
  vm.runInNewContext(src,{window,console,setTimeout:(fn)=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  return {window,values,writes,applied,
    async signIn(id){user=id;await window.KLABS_SETTINGS_SYNC.onAuthStateChanged(session(id));},
    async change(patch){window.KLABS_SETTINGS_SYNC.notifySettingsChanged(patch);const t=timers.splice(0);for(const fn of t)await fn();await new Promise((r)=>setImmediate(r));}};
}

test('the largest permitted logo uploads intact, well inside request and storage limits',async()=>{
  assert.equal(Logo.sanitise(maxLogo),maxLogo);
  const cloud=new Map();const d=device(cloud);await d.signIn('A');
  await d.change({businessProfile:{logo:maxLogo}});
  const row=d.writes[d.writes.length-1];
  assert.equal(row.user_id,'A');assert.equal(row.payload.businessProfile.logo,maxLogo);
  const bytes=Buffer.byteLength(JSON.stringify(row));
  assert.ok(bytes<110000,`whole settings row is ${bytes} bytes`);
  // The pending patch kept in local storage while offline is the same size again: far below the ~5 MB browser quota.
  const pending=[...d.values.entries()].filter(([k])=>/pending|patch/i.test(k)).reduce((n,[,v])=>n+v.length,0);
  assert.ok(pending<110000,`pending patch ${pending} chars`);
});

test('a value over the cap or not a plain raster data URL is never uploaded',async()=>{
  const cloud=new Map();const d=device(cloud);await d.signIn('A');
  for(const bad of [maxLogo+'A','javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','https://example.com/logo.png']){
    await d.change({businessProfile:{logo:bad}});
    assert.equal(d.writes[d.writes.length-1].payload.businessProfile.logo,'',bad.slice(0,30));
  }
});

test('a second device receives the logo from the account\'s cloud row, and a hostile cloud value is discarded',async()=>{
  const png=prefix+'iVBORw0KGgo=';
  const cloud=new Map([['A',{user_id:'A',payload:{studioSettings:{},businessProfile:{businessName:'Northern Rods',logo:png}}}]]);
  const d=device(cloud);await d.signIn('A');
  assert.equal(d.applied[d.applied.length-1].businessProfile.logo,png);
  const hostile=new Map([['A',{user_id:'A',payload:{businessProfile:{businessName:'X',logo:'javascript:alert(1)'}}}]]);
  const e=device(hostile);await e.signIn('A');
  assert.equal(e.applied[e.applied.length-1].businessProfile.logo,'');
});

test('removing the logo is synchronised and overrides the cloud copy',async()=>{
  const png=prefix+'iVBORw0KGgo=';
  const cloud=new Map([['A',{user_id:'A',payload:{studioSettings:{},businessProfile:{businessName:'Northern Rods',logo:png}}}]]);
  const d=device(cloud);await d.signIn('A');
  await d.change({businessProfile:{logo:''}});
  assert.equal(cloud.get('A').payload.businessProfile.logo,'');
  assert.equal(cloud.get('A').payload.businessProfile.businessName,'Northern Rods','other profile fields are preserved');
});

test('account isolation: A\'s logo is never read, applied or written for B on the same device',async()=>{
  const png=prefix+'iVBORw0KGgo=';
  const cloud=new Map([['A',{user_id:'A',payload:{businessProfile:{businessName:'K-Labs',logo:png}}}]]);
  const d=device(cloud,{local:{B:{businessName:'Northern Rods'}}});
  await d.signIn('A');
  await d.signIn('B');
  assert.deepEqual(d.writes.filter((w)=>w.user_id==='B').map((w)=>w.payload.businessProfile.logo),[''],'B initialises with no logo');
  assert.ok(d.writes.every((w)=>w.user_id!=='B'||!JSON.stringify(w).includes(png)));
  assert.equal(cloud.get('A').payload.businessProfile.logo,png,'A\'s row is untouched');
  assert.equal(d.applied[d.applied.length-1].businessProfile.logo,'');
});
