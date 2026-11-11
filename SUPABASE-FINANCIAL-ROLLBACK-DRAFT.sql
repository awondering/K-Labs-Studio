-- DRAFT ONLY. Requires separate approval, a writer pause and a verified backup.
-- This is a protective rollback, not a return to the pre-financial schema:
-- it stops financial RPC writes while retaining the ledger, invoice and
-- payment guards, and the deployed revision guard. Pending operations must
-- be preserved and reconciled before any subsequent re-enablement.
begin;

set local lock_timeout = '10s';
lock table public.builds in access exclusive mode;
lock table public.klabs_financial_operations in access exclusive mode;

do $$
declare
  item record;
  function_oid oid;
begin
  for item in
    select * from (values
      ('public.klabs_build_guard_version()', '101ae94b5c6da3fa9122a65a0470e525', 'sql', false, 's'),
      ('public.klabs_guard_build_update()', '207a793cf0d815079f1a852bbbe36a1b', 'plpgsql', false, 'v'),
      ('public.klabs_guard_build_delete()', 'f30c2ac20d0fe9fab92e52cec47ff457', 'plpgsql', false, 'v'),
      ('public.klabs_delete_build_if_revision(text,timestamp with time zone)', 'ea6581b76230bb91fa8dca7f0fe36735', 'plpgsql', true, 'v'),
      ('public.klabs_protect_build_financials()', 'bd9ed34e7148dae67580cbc4caa1ce0d', 'plpgsql', false, 'v'),
      ('public.klabs_financial_operation(text,timestamp with time zone,uuid,text,jsonb)', '229cfb0b4481510c6c427b169e3b9717', 'plpgsql', true, 'v')
    ) as expected(signature, body_hash, language, security_definer, volatility)
  loop
    function_oid := to_regprocedure(item.signature);
    if function_oid is null or not exists (
      select 1 from pg_proc p join pg_language l on l.oid = p.prolang
      where p.oid = function_oid and md5(p.prosrc) = item.body_hash
        and l.lanname = item.language and p.prosecdef = item.security_definer
        and p.provolatile = item.volatility
        and p.proconfig = array['search_path=public, pg_temp']
    ) then
      raise exception 'Guard or financial function missing or changed: %', item.signature;
    end if;
  end loop;

  for item in
    select * from (values
      ('klabs_guard_build_update', 'public.klabs_guard_build_update()', 23),
      ('klabs_guard_build_delete', 'public.klabs_guard_build_delete()', 11),
      ('klabs_protect_build_financials', 'public.klabs_protect_build_financials()', 31)
    ) as expected(name, signature, trigger_type)
  loop
    if not exists (
      select 1 from pg_trigger where tgrelid = 'public.builds'::regclass
        and tgname = item.name and not tgisinternal and tgenabled in ('O', 'A')
        and tgfoid = to_regprocedure(item.signature) and tgtype = item.trigger_type
        and tgnargs = 0 and tgqual is null
    ) then
      raise exception 'Guard or financial trigger missing, disabled or changed: %', item.name;
    end if;
  end loop;
  if exists (select 1 from pg_trigger where tgrelid='public.builds'::regclass
      and tgname in ('klabs_rollback_protect_financial_history','klabs_rollback_block_build_truncate') and not tgisinternal)
    or exists (select 1 from pg_trigger where tgrelid='public.klabs_financial_operations'::regclass
      and tgname='klabs_rollback_block_ledger_writes' and not tgisinternal) then
    raise exception 'Rollback financial trigger already exists; inspect the current state.';
  end if;
  if not exists (
    select 1 from pg_class where oid='public.builds'::regclass and relrowsecurity and relforcerowsecurity
  ) or not exists (
    select 1 from pg_class where oid='public.klabs_financial_operations'::regclass
      and relrowsecurity and relforcerowsecurity
  ) then
    raise exception 'Build or ledger row security is not enforced.';
  end if;
  if not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Rollback must be executed by a role able to inspect the complete protected ledger.';
  end if;
end;
$$;

revoke execute on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on public.klabs_financial_operations from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    revoke execute on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb) from service_role;
    revoke all on public.klabs_financial_operations from service_role;
  end if;
end;
$$;

create function public.klabs_rollback_protect_financial_history()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.payload->'payments', '[]'::jsonb) <> '[]'::jsonb
       or new.payload ? 'issuedInvoice' then
      raise exception 'Financial history is read-only during financial rollback.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(new.payload->'payments', '[]'::jsonb) is distinct from coalesce(old.payload->'payments', '[]'::jsonb)
       or new.payload->'issuedInvoice' is distinct from old.payload->'issuedInvoice' then
      raise exception 'Financial history is read-only during financial rollback.' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.payload ? 'issuedInvoice'
     or coalesce(old.payload->'payments', '[]'::jsonb) <> '[]'::jsonb
     or exists (select 1 from public.klabs_financial_operations
       where user_id=old.user_id and build_id=old.client_id) then
    raise exception 'A build with financial history cannot be deleted during financial rollback.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke all on function public.klabs_rollback_protect_financial_history() from public, anon, authenticated;
create trigger klabs_rollback_protect_financial_history
before insert or update or delete on public.builds
for each row execute function public.klabs_rollback_protect_financial_history();

create function public.klabs_rollback_block_financial_writes()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'The financial ledger and build truncate are locked during financial rollback.'
    using errcode = 'P0001';
end;
$$;
revoke all on function public.klabs_rollback_block_financial_writes() from public, anon, authenticated;
create trigger klabs_rollback_block_ledger_writes
before insert or update or delete or truncate on public.klabs_financial_operations
for each statement execute function public.klabs_rollback_block_financial_writes();
create trigger klabs_rollback_block_build_truncate
before truncate on public.builds
for each statement execute function public.klabs_rollback_block_financial_writes();

do $$
begin
  if has_function_privilege('authenticated',
    'public.klabs_financial_operation(text,timestamp with time zone,uuid,text,jsonb)', 'execute')
    or has_table_privilege('authenticated', 'public.klabs_financial_operations', 'insert,update,delete,truncate')
    or has_table_privilege('anon', 'public.klabs_financial_operations', 'insert,update,delete,truncate') then
    raise exception 'Financial write access remains through a role grant; rollback aborted.';
  end if;
  if exists (select 1 from pg_roles where rolname='service_role') then
    if has_function_privilege('service_role',
      'public.klabs_financial_operation(text,timestamp with time zone,uuid,text,jsonb)', 'execute')
      or has_table_privilege('service_role', 'public.klabs_financial_operations', 'insert,update,delete,truncate') then
      raise exception 'Financial service write access remains; rollback aborted.';
    end if;
  end if;
  if exists (
    select 1 from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid='public.klabs_financial_operations'::regclass and a.grantee<>c.relowner
      and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  ) or exists (
    select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid='public.klabs_financial_operation(text,timestamp with time zone,uuid,text,jsonb)'::regprocedure
      and a.grantee<>p.proowner and a.privilege_type='EXECUTE'
  ) then
    raise exception 'Unexpected financial write grant remains; rollback aborted.';
  end if;
end;
$$;

commit;
