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
const administrationMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261110000002_owner_administration.sql'),'utf8');
const allAccountsMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261110000003_owner_admin_all_accounts.sql'),'utf8');
const entitlementMigrationForTests=fs.readFileSync(path.join(root,'supabase/migrations/20261110000000_account_entitlements.sql'),'utf8');
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
      dispatchEvent(){},
      querySelectorAll(selector){
        if(selector==='[data-admin-status]')return this.children;
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
  const statusOption=document.createElement('button');
  statusOption.dataset.adminStatus='expired';
  statusOption.textContent='Expired';
  document.getElementById('adminStatusPicker').children.push(statusOption);
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
        if(name==='admin_revoke_builder_access'){
          builder={...builder,access_state:'expired',can_write:false,access_expires_at:'2026-11-10T00:00:00Z'};
          audit.unshift({action:'revoke_access',created_at:'2026-11-10T00:00:00Z',reason:args.p_reason});
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
  vm.runInNewContext(panel,{window,document,Intl,Date,Promise,Error,String,Number,Event,console});
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

test('all-account migration keeps trial extension history and permits ordinary access revocation',()=>{
  assert.match(allAccountsMigration,/perform public\.klabs_require_owner\(\)/i);
  assert.match(allAccountsMigration,/before_row\.access_state <> 'trial'[\s\S]*?before_row\.trial_expires_at <= now\(\)/i);
  assert.match(allAccountsMigration,/trial_expires_at = p_trial_expires_at/i);
  assert.doesNotMatch(allAccountsMigration,/set access_state\s*=\s*'trial_eligible'/i);
  assert.match(allAccountsMigration,/set access_state = 'expired',\s*access_expires_at = now\(\)/i);
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
  assert.match(css,/#adminAccessScreen\.active~#offlineReadyStatus\s*\{\s*display:none;\s*\}/);
  assert.match(worker,/const APP_SHELL_VERSION='build148-v206';/);
});

test('browser code never uses an email or client-supplied role as administrator authority',()=>{
  assert.doesNotMatch(panel,/user\.email|auth\.user\(\)\.email|role\s*===\s*["']owner["']/i);
  assert.doesNotMatch(panel,/from\(["'](?:account_entitlements|klabs_access_admins|klabs_access_audit_log)["']\)/);
  assert.match(panel,/admin_set_complimentary_access/);
  assert.match(panel,/admin_revoke_builder_access/);
  assert.match(panel,/admin_extend_builder_trial/);
  assert.match(panel,/functions\.invoke\("owner-admin"/);
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
  assert.ok(h.calls.some((call)=>call.name==='admin_revoke_builder_access'));
  assert.equal(h.document.getElementById('adminBuilderStatus').textContent,'Expired');
  assert.match(h.document.getElementById('adminAuditList').children[0].children[0].textContent,/revoke access/i);
});

test('owner can manage paid and grandfathered accounts while only their own account is protected from block or deletion',async()=>{
  for(const accessState of ['paid','grandfathered']){
    const h=adminHarness(true,{
      builder_user_id:`fictional-${accessState}`,
      email:`${accessState}@example.invalid`,
      account_created_at:'2026-10-10T00:00:00Z',
      access_state:accessState,
      can_write:true,
      blocked:false,
      trial_available:false,
      trial_started_at:null,
      trial_expires_at:null,
      access_expires_at:null
    });
    await h.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'owner-user'}});
    await h.window.KLABS_ADMIN_ACCESS.open();
    await h.document.getElementById('adminBuilderList').children[0].children[0].listeners.click();
    for(const id of ['adminComplimentaryControls','adminRevokeControls','adminBlockControls','adminDeleteControls']){
      assert.equal(h.document.getElementById(id).hidden,false,`${accessState} ${id} is available`);
    }
    h.document.getElementById('adminComplimentaryReason').value='Approved access change';
    await h.document.getElementById('adminGrantComplimentaryBtn').listeners.click({
      currentTarget:h.document.getElementById('adminGrantComplimentaryBtn')
    });
    assert.ok(h.calls.some((call)=>call.name==='admin_set_complimentary_access'));
    h.document.getElementById('adminRevokeReason').value='Approved access revocation';
    await h.document.getElementById('adminRevokeComplimentaryBtn').listeners.click({
      currentTarget:h.document.getElementById('adminRevokeComplimentaryBtn')
    });
    assert.ok(h.calls.some((call)=>call.name==='admin_revoke_builder_access'));
  }

  const blockedPaid=adminHarness(true,{
    builder_user_id:'fictional-blocked-paid',
    email:'blocked-paid@example.invalid',
    account_created_at:'2026-10-10T00:00:00Z',
    access_state:'paid',
    can_write:false,
    blocked:true,
    trial_available:false,
    trial_started_at:null,
    trial_expires_at:null,
    access_expires_at:null
  });
  await blockedPaid.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'owner-user'}});
  await blockedPaid.window.KLABS_ADMIN_ACCESS.open();
  await blockedPaid.document.getElementById('adminBuilderList').children[0].children[0].listeners.click();
  assert.equal(blockedPaid.document.getElementById('adminBlockControls').hidden,true);
  assert.equal(blockedPaid.document.getElementById('adminUnblockControls').hidden,false);
  assert.equal(blockedPaid.document.getElementById('adminDeleteControls').hidden,false);
  assert.equal(blockedPaid.document.getElementById('adminComplimentaryControls').hidden,false);

  const owner=adminHarness(true,{
    builder_user_id:'owner-user',
    email:'owner@example.invalid',
    account_created_at:'2026-10-10T00:00:00Z',
    access_state:'grandfathered',
    can_write:true,
    blocked:false,
    trial_available:false,
    trial_started_at:null,
    trial_expires_at:null,
    access_expires_at:null
  });
  await owner.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'owner-user'}});
  await owner.window.KLABS_ADMIN_ACCESS.open();
  await owner.document.getElementById('adminBuilderList').children[0].children[0].listeners.click();
  assert.equal(owner.document.getElementById('adminComplimentaryControls').hidden,false);
  assert.equal(owner.document.getElementById('adminRevokeControls').hidden,false);
  assert.equal(owner.document.getElementById('adminBlockControls').hidden,true);
  assert.equal(owner.document.getElementById('adminUnblockControls').hidden,true);
  assert.equal(owner.document.getElementById('adminDeleteControls').hidden,true);
});

test('all-account migration authorizes owner RPCs and permits entitlement changes across paid and grandfathered states',()=>{
  const grant=allAccountsMigration.match(/create or replace function public\.admin_set_complimentary_access\([\s\S]*?\n\$\$;/i)?.[0]||'';
  const revoke=allAccountsMigration.match(/create or replace function public\.admin_revoke_builder_access\([\s\S]*?\n\$\$;/i)?.[0]||'';
  const extend=allAccountsMigration.match(/create or replace function public\.admin_extend_builder_trial\([\s\S]*?\n\$\$;/i)?.[0]||'';
  assert.ok(grant && revoke && extend);
  for(const fn of [grant,revoke,extend]){
    assert.match(fn,/perform public\.klabs_require_owner\(\)/i);
    assert.doesNotMatch(fn,/p_target_user_id\s*=\s*auth\.uid\(\)|klabs_access_admins/i);
  }
  assert.doesNotMatch(grant,/grandfathered.*paid|paid.*grandfathered/i);
  assert.match(revoke,/before_row\.access_state in \('grandfathered', 'complimentary', 'paid'\)/i);
  assert.match(revoke,/before_row\.access_state = 'trial'/i);
  assert.match(revoke,/set access_state = 'expired',\s*access_expires_at = now\(\)/i);
  assert.doesNotMatch(revoke,/set[\s\S]*trial_started_at\s*=|trial_expires_at\s*=/i);
  assert.match(allAccountsMigration,/grant execute on function public\.admin_revoke_builder_access\(uuid, text\) to authenticated/i);
  assert.match(allAccountsMigration,/'revoke_access'/i);
  assert.match(administrationMigration,/The owner account cannot be blocked/i);
  assert.match(administrationMigration,/The owner account cannot be unblocked through this action/i);
});

test('custom access-status picker updates the filter and closes after selection',async()=>{
  const h=adminHarness(true);
  await h.window.KLABS_ADMIN_ACCESS.onAuthStateChanged({user:{id:'owner-user'}});
  const picker=h.document.getElementById('adminStatusPicker');
  const option=picker.children[0];
  await option.listeners.click();
  assert.equal(h.document.getElementById('adminBuilderStatusFilter').value,'expired');
  assert.equal(h.document.getElementById('adminBuilderStatusValue').textContent,'Expired');
  assert.equal(picker.open,false);
  assert.equal(option.attributes['aria-pressed'],'true');
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
  assert.match(h.document.getElementById('adminBuilderDates').children[4].children[1].textContent,/2026/);
  assert.match(h.document.getElementById('adminAuditList').children[0].children[0].textContent,/extend trial/i);
});

test('v204 migration blocks blocked accounts from reads, writes, trial activation, and quote allocation',()=>{
  assert.match(administrationMigration,/create table if not exists public\.klabs_access_blocks/i);
  assert.match(administrationMigration,/create or replace function public\.klabs_account_is_blocked/i);
  const accountAccess=administrationMigration.match(/create or replace function public\.klabs_account_access\([\s\S]*?\n\$\$;/i)?.[0]||'';
  const canWrite=administrationMigration.match(/create or replace function public\.klabs_entitlement_can_write\([\s\S]*?\n\$\$;/i)?.[0]||'';
  const startTrial=administrationMigration.match(/create or replace function public\.start_account_trial\(\)[\s\S]*?\n\$\$;/i)?.[0]||'';
  const quoteAllocator=administrationMigration.match(/create or replace function public\.allocate_quote_number\([\s\S]*?\n\$\$;/i)?.[0]||'';

  assert.ok(accountAccess,'v204 replaces account access logic');
  assert.match(accountAccess,/not exists\s*\([\s\S]*?klabs_access_blocks b where b\.user_id = p_user_id/i);
  assert.ok(canWrite,'v204 replaces the entitlement write helper');
  assert.match(canWrite,/p_user_id\s*=\s*auth\.uid\(\)/i);
  assert.match(canWrite,/not public\.klabs_account_is_blocked\(p_user_id\)/i);
  assert.match(canWrite,/a\.can_write/i);

  const readGuardTables=administrationMigration.match(/target_tables text\[\] := array\[([\s\S]*?)\];/)?.[1]||'';
  const writeGuardTables=administrationMigration.match(/write_tables text\[\] := array\[([\s\S]*?)\];/)?.[1]||'';
  for(const table of ['account_entitlements','builds','components','component_taxonomy','studio_settings','quote_number_counters']){
    assert.ok(readGuardTables.includes(`'${table}'`),`${table} has a block read guard`);
  }
  for(const table of ['builds','components','component_taxonomy','studio_settings','quote_number_counters']){
    assert.ok(writeGuardTables.includes(`'${table}'`),`${table} has block write guards`);
  }
  assert.ok(administrationMigration.includes('create policy klabs_account_block_read_guard on public.%I as restrictive for select to authenticated using (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.ok(administrationMigration.includes('create policy klabs_account_block_%s_guard on public.%I as restrictive for insert'));
  assert.ok(administrationMigration.includes('create policy klabs_account_block_%s_guard on public.%I as restrictive for update'));
  assert.ok(administrationMigration.includes('create policy klabs_account_block_%s_guard on public.%I as restrictive for delete'));
  assert.ok(administrationMigration.includes('for insert to authenticated with check (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.ok(administrationMigration.includes('for update to authenticated using (not public.klabs_account_is_blocked(auth.uid())) with check (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.ok(administrationMigration.includes('for delete to authenticated using (not public.klabs_account_is_blocked(auth.uid()))'));
  for(const operation of ['insert','update','delete']){
    assert.match(entitlementMigrationForTests,new RegExp(`as restrictive for ${operation}`, 'i'));
  }
  assert.match(entitlementMigrationForTests,/public\.klabs_entitlement_can_write\(user_id\)/i);

  assert.ok(startTrial,'v204 replaces trial activation');
  assert.match(startTrial,/if exists \(select 1 from public\.klabs_access_blocks b where b\.user_id = caller_id\) then[\s\S]*?This account is blocked/i);
  assert.match(startTrial,/and not exists\s*\([\s\S]*?klabs_access_blocks b where b\.user_id = caller_id/i);
  assert.ok(quoteAllocator,'v204 replaces the quote allocator');
  assert.match(quoteAllocator,/if public\.klabs_account_is_blocked\(caller_id\) then[\s\S]*?quote numbers cannot be allocated/i);
  assert.match(quoteAllocator,/if not public\.klabs_entitlement_can_write\(caller_id\) then/i);
  assert.ok(quoteAllocator.indexOf('klabs_account_is_blocked')<quoteAllocator.indexOf('insert into public.quote_number_counters'));
  assert.match(quoteAllocator,/on conflict \(user_id\) do update/i);
  const quoteAllocatorSql=fs.readFileSync(path.join(root,'SUPABASE-QUOTE-NUMBER-ALLOCATOR.sql'),'utf8');
  assert.match(quoteAllocatorSql,/revoke all on public\.quote_number_counters from public, anon, authenticated/i);
  assert.match(administrationMigration,/revoke all on public\.klabs_access_blocks from public, anon, authenticated/i);
  assert.match(administrationMigration,/This account is blocked\. Contact K-Labs Studio\./);
  assert.match(administrationMigration,/grant execute on function public\.admin_set_builder_block\(uuid, text, timestamptz\) to authenticated/i);
  assert.match(administrationMigration,/perform public\.klabs_require_owner\(\)/i);
});

test('block guards apply to every statement from an already-issued authenticated session',()=>{
  const writeGuardTables=administrationMigration.match(/write_tables text\[\] := array\[([\s\S]*?)\];/)?.[1]||'';
  for(const table of ['builds','components','component_taxonomy','studio_settings','quote_number_counters']){
    assert.ok(writeGuardTables.includes(`'${table}'`),`${table} is covered by block write guards`);
  }
  assert.ok(administrationMigration.includes('create policy klabs_account_block_%s_guard on public.%I as restrictive for insert'));
  assert.ok(administrationMigration.includes('create policy klabs_account_block_%s_guard on public.%I as restrictive for update'));
  assert.ok(administrationMigration.includes('create policy klabs_account_block_%s_guard on public.%I as restrictive for delete'));
  assert.ok(administrationMigration.includes('for insert to authenticated with check (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.ok(administrationMigration.includes('for update to authenticated using (not public.klabs_account_is_blocked(auth.uid())) with check (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.ok(administrationMigration.includes('for delete to authenticated using (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.ok(administrationMigration.includes('create policy klabs_account_block_read_guard on public.%I as restrictive for select to authenticated using (not public.klabs_account_is_blocked(auth.uid()))'));
  assert.match(administrationMigration,/create or replace function public\.klabs_entitlement_can_write\(p_user_id uuid\)[\s\S]*?not public\.klabs_account_is_blocked\(p_user_id\)/i);
  assert.match(administrationMigration,/create or replace function public\.allocate_quote_number[\s\S]*?klabs_account_is_blocked\(caller_id\)[\s\S]*?insert into public\.quote_number_counters/i);
  assert.match(administrationMigration,/create or replace function public\.start_account_trial\(\)[\s\S]*?klabs_access_blocks b where b\.user_id = caller_id/i);
  assert.match(administrationMigration,/create or replace function public\.get_account_entitlement\(\)[\s\S]*?klabs_access_blocks b where b\.user_id = caller_id/i);
  assert.match(administrationMigration,/from public\.klabs_access_blocks b\s+where b\.user_id = auth\.uid\(\)/i);
});

test('the v204 block guards preserve existing entitlement rules for unblocked accounts',()=>{
  const canWrite=administrationMigration.match(/create or replace function public\.klabs_entitlement_can_write\([\s\S]*?\n\$\$;/i)?.[0]||'';
  const quoteAllocator=administrationMigration.match(/create or replace function public\.allocate_quote_number\([\s\S]*?\n\$\$;/i)?.[0]||'';
  assert.match(canWrite,/from public\.klabs_account_access\(p_user_id\) a\s+where a\.can_write/i);
  assert.match(quoteAllocator,/if not public\.klabs_entitlement_can_write\(caller_id\) then/i);
  assert.match(quoteAllocator,/safe_floor bigint := greatest\(coalesce\(p_minimum_next, 1\), 1\)/i);
  assert.match(quoteAllocator,/on conflict \(user_id\) do update[\s\S]*?greatest\(counter\.next_number, safe_floor\) \+ 1/i);
  assert.match(entitlementMigrationForTests,/access_state in \('grandfathered', 'complimentary'\)/i);
  assert.match(entitlementMigrationForTests,/when e\.access_state = 'paid' then/i);
  assert.match(entitlementMigrationForTests,/when e\.access_state = 'trial' then e\.trial_expires_at > now\(\)/i);
});

test('v204 administration preserves entitlement history and audits protected identity actions',()=>{
  assert.match(administrationMigration,/create or replace function public\.admin_clear_builder_block/i);
  assert.match(administrationMigration,/previous_auth_banned_until/);
  assert.match(administrationMigration,/admin_record_account_action/);
  assert.doesNotMatch(administrationMigration,/email_change_(requested|completed|failed)/);
  assert.match(administrationMigration,/invite_builder/);
  assert.match(administrationMigration,/delete_builder_started/);
  assert.match(administrationMigration,/The owner account cannot be blocked/);
  assert.match(administrationMigration,/drop function if exists public\.admin_list_builders/);
  assert.match(administrationMigration,/email_confirmed boolean/);
  assert.match(administrationMigration,/blocked_at timestamptz/);
});

test('owner administration keeps privileged Auth API and service-role use server-side',()=>{
  const edge=fs.readFileSync(path.join(root,'supabase/functions/owner-admin/index.ts'),'utf8');
  const core=fs.readFileSync(path.join(root,'supabase/functions/_shared/owner-admin-core.mjs'),'utf8');
  assert.match(edge,/Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(edge,/Deno\.serve/);
  assert.match(core,/klabs_is_owner/);
  assert.match(core,/inviteUserByEmail/);
  assert.match(core,/updateUserById/);
  assert.match(core,/deleteUser/);
  assert.doesNotMatch(core,/email_confirm: false|case "email"/);
  assert.doesNotMatch(html,/adminEmailControls|adminBuilderEmailInput|adminEmailReason|adminUpdateEmailBtn|Edit registered email/);
  assert.doesNotMatch(panel,/SERVICE_ROLE_KEY|service_role/i);
  assert.match(html,/Type the current email to confirm/);
  assert.match(html,/offline copies cannot be remotely revoked/i);
});
