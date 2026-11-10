const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'css','admin-access.css'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const entry=fs.readFileSync(path.join(root,'js','public-entry.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'js','supabase-client.js'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261110000001_owner_access_manager.sql'),'utf8');
const panel=fs.readFileSync(path.join(root,'js','admin-panel.js'),'utf8');

function adminHarness(isOwner, initialBuilder){
  const elements=new Map();
  const calls=[];
  let owner=isOwner;
  let builder=initialBuilder||{
    builder_user_id:'fictional-builder',
    email:'builder@example.invalid',
    account_created_at:'2026-10-10T00:00:00Z',
    access_state:'trial_eligible',
    can_write:false,
    trial_available:true,
    trial_started_at:null,
    trial_expires_at:null,
    access_expires_at:null
  };
  let audit=[];
  function makeElement(tagName='div'){
    return {
      tagName:tagName.toUpperCase(),children:[],dataset:{},listeners:{},attributes:{},hidden:false,
      value:'',textContent:'',disabled:false,className:'',
      setAttribute(name,value){this.attributes[name]=value;},
      addEventListener(name,fn){this.listeners[name]=fn;},
      append(...items){this.children.push(...items);},
      appendChild(item){this.children.push(item);},
      replaceChildren(...items){this.children=[...items];},
      querySelectorAll(selector){
        if(selector!=='.admin-builder-row')return [];
        return this.children.flatMap((item)=>item.children||[]).filter((item)=>item.className==='admin-builder-row');
      }
    };
  }
  const document={
    getElementById(id){
      if(!elements.has(id))elements.set(id,makeElement());
      return elements.get(id);
    },
    createElement:tag=>makeElement(tag),
    querySelector:()=>null
  };
  const window={
    confirm:()=>true,
    KLABS_NAV:{goScreen(){}},
    KLABS_SUPABASE_CLIENT:{
      async rpc(name,args){
        calls.push({name,args});
        if(name==='klabs_is_owner')return {data:owner,error:null};
        if(name==='admin_list_builders')return {data:[{...builder}],error:null};
        if(name==='admin_list_access_audit')return {data:[...audit],error:null};
        if(name==='admin_set_complimentary_access'){
          builder={...builder,access_state:'complimentary',can_write:true,trial_available:false,access_expires_at:args.p_expires_at};
          audit.unshift({action:'grant_complimentary',created_at:'2026-11-10T00:00:00Z',reason:args.p_reason});
          return {data:{...builder},error:null};
        }
        if(name==='admin_revoke_complimentary_access'){
          builder={...builder,access_state:'expired',can_write:false,access_expires_at:'2026-11-10T00:00:00Z'};
          audit.unshift({action:'revoke_complimentary',created_at:'2026-11-10T00:00:00Z',reason:args.p_reason});
          return {data:{...builder},error:null};
        }
        if(name==='admin_extend_builder_trial'){
          builder={...builder,trial_expires_at:args.p_trial_expires_at};
          audit.unshift({action:'extend_trial',created_at:'2026-11-10T00:00:00Z',reason:args.p_reason});
          return {data:{...builder},error:null};
        }
        throw new Error(`unexpected RPC ${name}`);
      }
    }
  };
  vm.runInNewContext(panel,{window,document,Intl,Date,Promise,Error,String,Number,console});
  return {window,document,elements,calls,setOwner(value){owner=value;},setBuilder(value){builder=value;}};
}

test('owner authorization is a trusted single-owner allowlist with no client table grants',()=>{
  assert.match(migration,/create table if not exists public\.klabs_access_admins/i);
  assert.match(migration,/create unique index if not exists klabs_access_admins_single_owner/i);
  assert.match(migration,/alter table public\.klabs_access_admins enable row level security/i);
  assert.match(migration,/revoke all on public\.klabs_access_admins from public, anon, authenticated/i);
  assert.match(migration,/revoke all on public\.klabs_access_audit_log from public, anon, authenticated/i);
  assert.match(migration,/where a\.user_id = auth\.uid\(\) and a\.role = 'owner'/i);
  assert.match(migration,/raise exception 'Owner administration permission required' using errcode = '42501'/i);
});

test('all admin RPCs enforce the server-side owner check and do not read business records',()=>{
  const protectedFunctions=[
    'admin_list_builders',
    'admin_list_access_audit',
    'admin_set_complimentary_access',
    'admin_revoke_complimentary_access',
    'admin_extend_builder_trial'
  ];
  for(const name of protectedFunctions){
    const start=migration.indexOf(`create or replace function public.${name}(`);
    assert.ok(start>=0,`${name} exists`);
    const end=migration.indexOf('$$;',start);
    assert.ok(end>start,`${name} has a complete body`);
    assert.match(migration.slice(start,end),/perform public\.klabs_require_owner\(\)/i,`${name} checks owner role`);
  }
  assert.doesNotMatch(migration,/from public\.(builds|components|studio_settings)\b/i);
  assert.match(migration,/join auth\.users u on u\.id = l\.admin_user_id/i);
  assert.match(migration,/previous_state jsonb not null/i);
  assert.match(migration,/new_state jsonb not null/i);
  assert.match(migration,/reason text not null/i);
});

test('admin mutations protect owner, grandfathered and paid accounts and preserve trial history',()=>{
  assert.match(migration,/p_target_user_id = auth\.uid\(\)[\s\S]*?The owner account cannot be changed through Access Manager/i);
  assert.match(migration,/before_row\.access_state in \('grandfathered', 'paid'\)/i);
  assert.match(migration,/before_row\.access_state <> 'complimentary'/i);
  assert.match(migration,/before_row\.access_state <> 'trial'[\s\S]*?before_row\.trial_expires_at <= now\(\)/i);
  assert.match(migration,/trial_expires_at = p_trial_expires_at/i);
  assert.doesNotMatch(migration,/set access_state\s*=\s*'trial_eligible'/i);
  assert.match(migration,/set access_state = 'expired',\s*access_expires_at = now\(\)/i);
  assert.match(migration,/on public\.klabs_access_admins \(role\)/i);
});

test('the owner entry is hidden until server authorization and admin code loads only after auth',()=>{
  assert.match(html,/id="settingsAdminEntry" hidden/);
  assert.match(html,/id="adminAccessScreen" hidden/);
  assert.match(entry,/js\/admin-panel\.js/);
  assert.doesNotMatch(html,/<script src="js\/admin-panel\.js"><\/script>/);
  assert.match(auth,/KLABS_ADMIN_ACCESS\?\.onAuthStateChanged\?\.\(session\)/);
  assert.match(panel,/rpc\("klabs_is_owner"\)/);
  assert.match(panel,/data === true/);
  assert.match(panel,/if \(!state\.owner \|\| !adminScreen\) return/);
  assert.match(worker,/'js\/admin-panel\.js'/);
  assert.match(worker,/'css\/admin-access\.css'/);
});

test('the Access Manager exposes entitlement dates and billing limitations without customer data',()=>{
  for(const id of ['adminBuilderSearch','adminBuilderStatusFilter','adminBuilderList','adminBuilderDates','adminComplimentaryControls','adminTrialControls','adminRevokeControls','adminAuditList']){
    assert.match(html,new RegExp(`id="${id}"`));
  }
  assert.match(html,/Payment history, renewals and cancellations are not available here; billing is not connected\./);
  assert.match(panel,/admin_list_builders/);
  assert.match(panel,/admin_list_access_audit/);
  assert.match(panel,/window\.confirm\(confirmation\)/);
  assert.match(panel,/textContent = builder\.email/);
  assert.match(css,/@media \(max-width:520px\)[\s\S]*?\.admin-access-toolbar/);
  assert.match(css,/min-height:44px/);
  assert.match(worker,/const APP_SHELL_VERSION='build148-v203';/);
});

test('browser code never uses an email or client-supplied role as administrator authority',()=>{
  assert.doesNotMatch(panel,/user\.email|auth\.user\(\)\.email|role\s*===\s*["']owner["']/i);
  assert.doesNotMatch(panel,/from\(["'](?:account_entitlements|klabs_access_admins|klabs_access_audit_log)["']\)/);
  assert.match(panel,/admin_set_complimentary_access/);
  assert.match(panel,/admin_revoke_complimentary_access/);
  assert.match(panel,/admin_extend_builder_trial/);
});

test('ordinary accounts stay gated while an owner can grant, revoke, and audit complimentary access',async()=>{
  const h=adminHarness(false);
  await h.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'ordinary-user'}});
  assert.equal(h.window.KLABS_ADMIN_ACCESS.isOwner(),false);
  assert.equal(h.document.getElementById('settingsAdminEntry').hidden,true);
  await h.window.KLABS_ADMIN_ACCESS.open();
  assert.equal(h.calls.some((call)=>call.name==='admin_list_builders'),false);

  h.setOwner(true);
  await h.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'owner-user'}});
  assert.equal(h.window.KLABS_ADMIN_ACCESS.isOwner(),true);
  assert.equal(h.document.getElementById('settingsAdminEntry').hidden,false);
  await h.window.KLABS_ADMIN_ACCESS.open();
  const row=h.document.getElementById('adminBuilderList').children[0].children[0];
  await row.listeners.click();
  assert.equal(h.document.getElementById('adminComplimentaryControls').hidden,false);

  h.document.getElementById('adminComplimentaryReason').value='Approved workshop grant';
  await h.document.getElementById('adminGrantComplimentaryBtn').listeners.click({
    currentTarget:h.document.getElementById('adminGrantComplimentaryBtn')
  });
  const grant=h.calls.find((call)=>call.name==='admin_set_complimentary_access');
  assert.equal(grant.args.p_target_user_id,'fictional-builder');
  assert.equal(grant.args.p_expires_at,null);
  assert.equal(grant.args.p_reason,'Approved workshop grant');
  assert.equal(h.document.getElementById('adminRevokeControls').hidden,false);
  assert.match(h.document.getElementById('adminAuditList').children[0].children[0].textContent,/grant complimentary/i);

  h.document.getElementById('adminRevokeReason').value='Grant period complete';
  await h.document.getElementById('adminRevokeComplimentaryBtn').listeners.click({
    currentTarget:h.document.getElementById('adminRevokeComplimentaryBtn')
  });
  assert.ok(h.calls.some((call)=>call.name==='admin_revoke_complimentary_access'));
  assert.equal(h.document.getElementById('adminBuilderStatus').textContent,'Expired');
  assert.match(h.document.getElementById('adminAuditList').children[0].children[0].textContent,/revoke complimentary/i);
});

test('active trial extension changes only the expiry and keeps existing trial history',async()=>{
  const originalStart='2026-11-03T08:30:00Z';
  const h=adminHarness(true,{
    builder_user_id:'fictional-trial-builder',
    email:'trial-builder@example.invalid',
    account_created_at:'2026-11-01T00:00:00Z',
    access_state:'trial',
    can_write:true,
    trial_available:false,
    trial_started_at:originalStart,
    trial_expires_at:'2026-11-17T08:30:00Z',
    access_expires_at:null
  });
  await h.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'owner-user'}});
  await h.window.KLABS_ADMIN_ACCESS.open();
  await h.document.getElementById('adminBuilderList').children[0].children[0].listeners.click();
  assert.equal(h.document.getElementById('adminTrialControls').hidden,false);
  h.document.getElementById('adminTrialExpiry').value='2026-11-20';
  h.document.getElementById('adminTrialReason').value='Approved trial extension';
  await h.document.getElementById('adminExtendTrialBtn').listeners.click({
    currentTarget:h.document.getElementById('adminExtendTrialBtn')
  });
  const extension=h.calls.find((call)=>call.name==='admin_extend_builder_trial');
  assert.equal(extension.args.p_target_user_id,'fictional-trial-builder');
  assert.match(extension.args.p_trial_expires_at,/^2026-11-20T/);
  assert.equal(extension.args.p_reason,'Approved trial extension');
  assert.equal(h.calls.some((call)=>call.name==='start_account_trial'),false);
  assert.match(h.document.getElementById('adminBuilderDates').children[3].children[1].textContent,/2026/);
  assert.match(h.document.getElementById('adminAuditList').children[0].children[0].textContent,/extend trial/i);
});
