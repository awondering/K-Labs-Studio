-- Owner Administration v204 security and account status support.
-- Apply only after 20261110000001_owner_access_manager.sql.
begin;

do $$
declare
  table_name text;
  required_tables text[] := array[
    'account_entitlements', 'builds', 'components',
    'component_taxonomy', 'studio_settings', 'quote_number_counters',
    'klabs_access_admins', 'klabs_access_audit_log'
  ];
begin
  foreach table_name in array required_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required table public.% is missing', table_name;
    end if;
  end loop;
end;
$$;

create table if not exists public.klabs_access_blocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  blocked_by uuid not null,
  reason text not null,
  blocked_at timestamptz not null default now(),
  previous_auth_banned_until timestamptz
);

alter table public.klabs_access_blocks enable row level security;
revoke all on public.klabs_access_blocks from public, anon, authenticated;

do $$
declare
  table_name text;
  cascade_tables text[] := array[
    'account_entitlements', 'builds', 'components',
    'component_taxonomy', 'studio_settings', 'quote_number_counters',
    'klabs_access_admins', 'klabs_access_blocks'
  ];
begin
  foreach table_name in array cascade_tables loop
    if not exists (
      select 1
      from pg_constraint c
      where c.contype = 'f'
        and c.conrelid = to_regclass(format('public.%I', table_name))
        and c.confrelid = 'auth.users'::regclass
        and c.confdeltype = 'c'
    ) then
      raise exception 'Expected an ON DELETE CASCADE foreign key from public.% to auth.users', table_name;
    end if;
  end loop;
end;
$$;

alter table public.klabs_access_audit_log
  drop constraint if exists klabs_access_audit_log_action_check;
alter table public.klabs_access_audit_log
  add constraint klabs_access_audit_log_action_check
  check (action in (
    'grant_complimentary', 'restore_complimentary',
    'revoke_complimentary', 'extend_trial',
    'block_builder', 'unblock_builder',
    'invite_builder', 'delete_builder_started', 'delete_builder_completed'
  ));

create or replace function public.klabs_account_is_blocked(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and p_user_id = auth.uid()
    and exists (
      select 1 from public.klabs_access_blocks b
      where b.user_id = auth.uid()
    );
$$;

create or replace function public.admin_target_is_owner(p_target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.klabs_require_owner();
  return exists (
    select 1 from public.klabs_access_admins a
    where a.user_id = p_target_user_id and a.role = 'owner'
  );
end;
$$;

create or replace function public.admin_email_available(
  p_email text,
  p_exclude_user_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  clean_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform public.klabs_require_owner();
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  return not exists (
    select 1 from auth.users u
    where lower(u.email) = clean_email
      and (p_exclude_user_id is null or u.id <> p_exclude_user_id)
  );
end;
$$;

create or replace function public.admin_record_account_action(
  p_target_user_id uuid,
  p_action text,
  p_previous_state jsonb,
  p_new_state jsonb,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  audit_id bigint;
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null then
    raise exception 'A builder account is required';
  end if;
  if p_action not in (
    'invite_builder', 'delete_builder_started', 'delete_builder_completed'
  ) then
    raise exception 'Unsupported administration audit action';
  end if;
  if exists (
    select 1 from public.klabs_access_admins a
    where a.user_id = p_target_user_id and a.role = 'owner'
  ) then
    raise exception 'The owner account cannot be changed through Owner Administration'
      using errcode = '42501';
  end if;
  if clean_reason = '' or length(clean_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters';
  end if;

  insert into public.klabs_access_audit_log (
    admin_user_id, target_user_id, action, previous_state, new_state, reason
  ) values (
    auth.uid(), p_target_user_id, p_action,
    coalesce(p_previous_state, '{}'::jsonb),
    coalesce(p_new_state, '{}'::jsonb),
    clean_reason
  )
  returning id into audit_id;
  return audit_id;
end;
$$;

create or replace function public.admin_set_builder_block(
  p_target_user_id uuid,
  p_reason text,
  p_previous_auth_banned_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  result jsonb;
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null
    or p_target_user_id = auth.uid()
    or exists (
      select 1 from public.klabs_access_admins a
      where a.user_id = p_target_user_id and a.role = 'owner'
    ) then
    raise exception 'The owner account cannot be blocked' using errcode = '42501';
  end if;
  if clean_reason = '' or length(clean_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target_user_id) then
    raise exception 'Builder account was not found';
  end if;

  insert into public.klabs_access_blocks (
    user_id, blocked_by, reason, previous_auth_banned_until
  ) values (
    p_target_user_id, auth.uid(), clean_reason, p_previous_auth_banned_until
  )
  on conflict (user_id) do nothing;
  if not found then
    raise exception 'Builder account is already blocked';
  end if;

  select jsonb_build_object(
    'user_id', b.user_id,
    'reason', b.reason,
    'blocked_at', b.blocked_at,
    'previous_auth_banned_until', b.previous_auth_banned_until
  ) into result
  from public.klabs_access_blocks b
  where b.user_id = p_target_user_id;

  insert into public.klabs_access_audit_log (
    admin_user_id, target_user_id, action, previous_state, new_state, reason
  ) values (
    auth.uid(), p_target_user_id, 'block_builder',
    '{}'::jsonb, result, clean_reason
  );
  return result;
end;
$$;

create or replace function public.admin_get_builder_block(p_target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform public.klabs_require_owner();
  select jsonb_build_object(
    'user_id', b.user_id,
    'reason', b.reason,
    'blocked_at', b.blocked_at,
    'previous_auth_banned_until', b.previous_auth_banned_until
  ) into result
  from public.klabs_access_blocks b
  where b.user_id = p_target_user_id;
  return result;
end;
$$;

create or replace function public.admin_clear_builder_block(
  p_target_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_reason text := btrim(coalesce(p_reason, ''));
  before_row public.klabs_access_blocks%rowtype;
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null
    or p_target_user_id = auth.uid()
    or exists (
      select 1 from public.klabs_access_admins a
      where a.user_id = p_target_user_id and a.role = 'owner'
    ) then
    raise exception 'The owner account cannot be unblocked through this action'
      using errcode = '42501';
  end if;
  if clean_reason = '' or length(clean_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters';
  end if;

  delete from public.klabs_access_blocks
  where user_id = p_target_user_id
  returning * into before_row;
  if not found then
    raise exception 'Builder account is not blocked';
  end if;

  insert into public.klabs_access_audit_log (
    admin_user_id, target_user_id, action, previous_state, new_state, reason
  ) values (
    auth.uid(), p_target_user_id, 'unblock_builder',
    to_jsonb(before_row), '{}'::jsonb, clean_reason
  );
  return jsonb_build_object(
    'previous_auth_banned_until', before_row.previous_auth_banned_until
  );
end;
$$;

drop function if exists public.admin_list_builders(text, text, integer, integer);
create function public.admin_list_builders(
  p_search text default '',
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  builder_user_id uuid,
  email text,
  email_confirmed boolean,
  account_created_at timestamptz,
  access_state text,
  can_write boolean,
  trial_available boolean,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  access_expires_at timestamptz,
  blocked boolean,
  blocked_at timestamptz,
  block_reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.klabs_require_owner();
  if coalesce(p_status, 'all') not in (
    'all', 'trial_eligible', 'trial', 'expired', 'grandfathered',
    'complimentary', 'paid', 'blocked'
  ) then
    raise exception 'Unsupported access status filter';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.email_confirmed_at is not null,
    u.created_at,
    case
      when e.access_state = 'trial' and e.trial_expires_at <= now() then 'expired'
      when e.access_state in ('grandfathered', 'complimentary', 'paid')
        and e.access_expires_at is not null and e.access_expires_at <= now() then 'expired'
      else e.access_state
    end,
    case
      when b.user_id is not null then false
      when e.access_state in ('grandfathered', 'complimentary', 'paid') then
        e.access_expires_at is null or e.access_expires_at > now()
      when e.access_state = 'trial' then e.trial_expires_at > now()
      else false
    end,
    e.access_state = 'trial_eligible',
    e.trial_started_at,
    e.trial_expires_at,
    e.access_expires_at,
    b.user_id is not null,
    b.blocked_at,
    b.reason
  from auth.users u
  join public.account_entitlements e on e.user_id = u.id
  left join public.klabs_access_blocks b on b.user_id = u.id
  where (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or u.email ilike '%' || btrim(p_search) || '%'
    )
    and (
      coalesce(p_status, 'all') = 'all'
      or (p_status = 'blocked' and b.user_id is not null)
      or (
        p_status <> 'blocked'
        and p_status = case
          when e.access_state = 'trial' and e.trial_expires_at <= now() then 'expired'
          when e.access_state in ('grandfathered', 'complimentary', 'paid')
            and e.access_expires_at is not null and e.access_expires_at <= now() then 'expired'
          else e.access_state
        end
      )
    )
  order by b.user_id is not null desc, u.created_at desc, u.email
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.klabs_account_access(p_user_id uuid default auth.uid())
returns table (access_state text, can_write boolean, trial_available boolean,
  trial_started_at timestamptz, trial_expires_at timestamptz, access_expires_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when e.access_state = 'trial' and e.trial_expires_at <= now() then 'expired'
      when e.access_state in ('grandfathered', 'complimentary', 'paid')
        and e.access_expires_at is not null and e.access_expires_at <= now() then 'expired'
      else e.access_state
    end,
    case
      when e.access_state in ('grandfathered', 'complimentary', 'paid') then
        e.access_expires_at is null or e.access_expires_at > now()
      when e.access_state = 'trial' then e.trial_expires_at > now()
      else false
    end,
    e.access_state = 'trial_eligible',
    e.trial_started_at,
    e.trial_expires_at,
    e.access_expires_at
  from public.account_entitlements e
  where e.user_id = p_user_id
    and p_user_id = auth.uid()
    and not exists (
      select 1 from public.klabs_access_blocks b where b.user_id = p_user_id
    );
$$;

create or replace function public.klabs_entitlement_can_write(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id is not null
    and p_user_id = auth.uid()
    and not public.klabs_account_is_blocked(p_user_id)
    and exists (
      select 1
      from public.klabs_account_access(p_user_id) a
      where a.can_write
    );
$$;

create or replace function public.get_account_entitlement()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  result jsonb;
  email_verified boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.klabs_access_blocks b where b.user_id = caller_id) then
    raise exception 'This account is blocked. Contact K-Labs Studio.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'access_state', access_state,
    'can_write', can_write,
    'trial_available', trial_available,
    'trial_started_at', trial_started_at,
    'trial_expires_at', trial_expires_at,
    'access_expires_at', access_expires_at,
    'server_time', now()
  )
  into result
  from public.klabs_account_access(caller_id);

  if result is null then
    raise exception 'Verified account entitlement is unavailable' using errcode = '42501';
  end if;
  select (u.email_confirmed_at is not null) into email_verified
  from auth.users u where u.id = caller_id;
  result := result || jsonb_build_object('email_verified', coalesce(email_verified, false));
  return result;
end;
$$;

create or replace function public.allocate_quote_number(p_minimum_next bigint default 1)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  safe_floor bigint := greatest(coalesce(p_minimum_next, 1), 1);
  allocated_number bigint;
begin
  if caller_id is null then
    raise exception 'Authentication required to allocate a quote number'
      using errcode = '42501';
  end if;
  if public.klabs_account_is_blocked(caller_id) then
    raise exception 'This account is blocked; quote numbers cannot be allocated'
      using errcode = '42501';
  end if;
  if not public.klabs_entitlement_can_write(caller_id) then
    raise exception 'This account is read-only; quote numbers cannot be allocated'
      using errcode = '42501';
  end if;
  if safe_floor >= 9223372036854775807 then
    raise exception 'Quote number sequence exhausted'
      using errcode = '22003';
  end if;

  insert into public.quote_number_counters as counter (user_id, next_number, updated_at)
  values (caller_id, safe_floor + 1, now())
  on conflict (user_id) do update
    set next_number = greatest(counter.next_number, safe_floor) + 1,
        updated_at = now()
    where greatest(counter.next_number, safe_floor) < 9223372036854775807
  returning next_number - 1 into allocated_number;

  if allocated_number is null then
    raise exception 'Quote number sequence exhausted'
      using errcode = '22003';
  end if;

  return allocated_number;
end;
$$;

create or replace function public.start_account_trial()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  changed_rows integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if exists (select 1 from public.klabs_access_blocks b where b.user_id = caller_id) then
    raise exception 'This account is blocked. Contact K-Labs Studio.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users
    where id = caller_id and email_confirmed_at is not null
  ) then
    raise exception 'Verify your email before starting a trial' using errcode = '42501';
  end if;

  update public.account_entitlements
  set access_state = 'trial',
      trial_started_at = now(),
      trial_expires_at = now() + interval '7 days',
      updated_at = now()
  where user_id = caller_id and access_state = 'trial_eligible'
    and not exists (
      select 1 from public.klabs_access_blocks b where b.user_id = caller_id
    );
  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    raise exception 'This account is not eligible to start another trial' using errcode = '42501';
  end if;
  return public.get_account_entitlement();
end;
$$;

do $$
declare
  table_name text;
  target_tables text[] := array[
    'account_entitlements', 'builds', 'components', 'component_taxonomy',
    'studio_settings', 'quote_number_counters'
  ];
begin
  foreach table_name in array target_tables loop
    execute format('drop policy if exists klabs_account_block_read_guard on public.%I', table_name);
    execute format(
      'create policy klabs_account_block_read_guard on public.%I as restrictive for select to authenticated using (not public.klabs_account_is_blocked(auth.uid()))',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
  operation text;
  write_tables text[] := array[
    'builds', 'components', 'component_taxonomy',
    'studio_settings', 'quote_number_counters'
  ];
begin
  foreach table_name in array write_tables loop
    foreach operation in array array['insert', 'update', 'delete'] loop
      execute format(
        'drop policy if exists klabs_account_block_%s_guard on public.%I',
        operation, table_name
      );
      if operation = 'insert' then
        execute format(
          'create policy klabs_account_block_%s_guard on public.%I as restrictive for insert to authenticated with check (not public.klabs_account_is_blocked(auth.uid()))',
          operation, table_name
        );
      elsif operation = 'update' then
        execute format(
          'create policy klabs_account_block_%s_guard on public.%I as restrictive for update to authenticated using (not public.klabs_account_is_blocked(auth.uid())) with check (not public.klabs_account_is_blocked(auth.uid()))',
          operation, table_name
        );
      else
        execute format(
          'create policy klabs_account_block_%s_guard on public.%I as restrictive for delete to authenticated using (not public.klabs_account_is_blocked(auth.uid()))',
          operation, table_name
        );
      end if;
    end loop;
  end loop;
end;
$$;

revoke all on function public.klabs_account_is_blocked(uuid) from public, anon;
revoke all on function public.klabs_entitlement_can_write(uuid) from public, anon;
revoke all on function public.allocate_quote_number(bigint) from public, anon;
revoke all on function public.admin_target_is_owner(uuid) from public, anon;
revoke all on function public.admin_email_available(text, uuid) from public, anon;
revoke all on function public.admin_record_account_action(uuid, text, jsonb, jsonb, text) from public, anon;
revoke all on function public.admin_set_builder_block(uuid, text, timestamptz) from public, anon;
revoke all on function public.admin_get_builder_block(uuid) from public, anon;
revoke all on function public.admin_clear_builder_block(uuid, text) from public, anon;
revoke all on function public.admin_list_builders(text, text, integer, integer) from public, anon;
revoke all on function public.get_account_entitlement() from public, anon;
revoke all on function public.start_account_trial() from public, anon;

grant execute on function public.klabs_account_is_blocked(uuid) to authenticated;
grant execute on function public.klabs_entitlement_can_write(uuid) to authenticated;
grant execute on function public.allocate_quote_number(bigint) to authenticated;
grant execute on function public.admin_target_is_owner(uuid) to authenticated;
grant execute on function public.admin_email_available(text, uuid) to authenticated;
grant execute on function public.admin_record_account_action(uuid, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.admin_set_builder_block(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_get_builder_block(uuid) to authenticated;
grant execute on function public.admin_clear_builder_block(uuid, text) to authenticated;
grant execute on function public.admin_list_builders(text, text, integer, integer) to authenticated;
grant execute on function public.get_account_entitlement() to authenticated;
grant execute on function public.start_account_trial() to authenticated;

comment on table public.klabs_access_blocks is
  'Owner-managed account blocks; restrictive RLS denies blocked users access to all Studio business tables.';
comment on function public.klabs_account_is_blocked(uuid) is
  'Returns block status only for auth.uid(); used by restrictive row security policies.';

commit;
