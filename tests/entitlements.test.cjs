const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261110000000_account_entitlements.sql'),'utf8');
const entry=fs.readFileSync(path.join(root,'js/public-entry.js'),'utf8');
const storage=fs.readFileSync(path.join(root,'js/storage.js'),'utf8');
const buildSync=fs.readFileSync(path.join(root,'js/build-sync.js'),'utf8');
const componentSync=fs.readFileSync(path.join(root,'js/component-sync.js'),'utf8');
const settingsSync=fs.readFileSync(path.join(root,'js/settings-sync.js'),'utf8');

test('new accounts are eligible without starting a trial; existing accounts are grandfathered',()=>{
  assert.match(migration,/select id,\s*'grandfathered'\s*from auth\.users/i);
  assert.match(migration,/values \(new\.id, 'trial_eligible'\)/i);
  assert.match(migration,/where user_id = caller_id and access_state = 'trial_eligible'/i);
  assert.match(migration,/trial_expires_at = now\(\) \+ interval '7 days'/i);
  assert.match(migration,/email_confirmed_at is not null/i);
});

test('expired access is server read-only and preserves own-row SELECT policies',()=>{
  for(const table of ['builds','components','component_taxonomy','studio_settings']){
    assert.match(migration,new RegExp(`target_tables text\\[\\] := array\\[[\\s\\S]*?'${table}'`));
  }
  assert.match(migration,/as restrictive for insert/i);
  assert.match(migration,/as restrictive for update/i);
  assert.match(migration,/as restrictive for delete/i);
  assert.match(migration,/using \(auth\.uid\(\) = user_id and public\.klabs_entitlement_can_write\(user_id\)\)/i);
  assert.match(migration,/This account is read-only; quote numbers cannot be allocated/i);
});

test('demo path has no private app bootstrap or persistent-store access',()=>{
  const demoStart=entry.indexOf('function showExploreDemo');
  const demoEnd=entry.indexOf('async function signOutFromEntry',demoStart);
  assert.ok(demoStart>=0&&demoEnd>demoStart);
  assert.doesNotMatch(entry.slice(demoStart,demoEnd),/loadPrivateApp|Store\.|localStorage|KLABS_UI/);
  assert.match(entry,/if \(entitlement\.access_state === "trial_eligible"\) \{\s*window\.KLABS_BUILD_TAB_LOCK\?\.release\(\);\s*showAccessChoice\(entitlement\);\s*return;/);
});

test('expired sync paths pull without cloud writes and local Store writes are blocked',()=>{
  assert.match(buildSync,/if \(!canWrite\(\)\) \{ refreshStatus\(state\); return; \}/);
  assert.match(buildSync,/if \(!current\(ctx\) \|\| !canWrite\(\)\) return;/);
  assert.match(componentSync,/if \(!canWrite\(\)\) \{\s*const localById/);
  assert.match(settingsSync,/if \(!canWrite\(\)\) \{\s*if \(cloudRow\) applyLocalPayload/);
  assert.match(storage,/window\.KLABS_CAN_WRITE==="function"\?window\.KLABS_CAN_WRITE\(\)/);

  const values=new Map();
  const events=[];
  const window={KLABS_ACCESS_STATE:{can_write:false},dispatchEvent:event=>events.push(event)};
  const localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  function CustomEvent(type,options){this.type=type;this.detail=options.detail;}
  vm.runInNewContext(storage,{window,localStorage,CustomEvent,JSON});
  assert.equal(window.Store.set('klabs-workshop-builds',[{id:'local'}]),false);
  assert.equal(values.has('klabs-workshop-builds'),false);
  assert.equal(events.length,1);
  window.KLABS_SYNC_HYDRATION=true;
  assert.equal(window.Store.set('klabs-workshop-builds',[{id:'remote'}]),true);
  assert.equal(JSON.parse(values.get('klabs-workshop-builds'))[0].id,'remote');
});

test('deployment instructions require review and distinguish account grants from trial activation',()=>{
  const guide=fs.readFileSync(path.join(root,'SUPABASE-ENTITLEMENTS-DEPLOYMENT.md'),'utf8');
  assert.match(guide,/must not be published until this migration has been reviewed, applied/i);
  assert.match(guide,/disposable, email-verified account/i);
  assert.match(guide,/Do not reset a consumed trial to `trial_eligible`/);
});
