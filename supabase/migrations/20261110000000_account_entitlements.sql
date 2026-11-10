-- K-Labs Studio account access.
-- Run only after builds, components, component_taxonomy, studio_settings and
-- quote_number_counters have been installed. See SUPABASE-ENTITLEMENTS-DEPLOYMENT.md.
begin;

create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_state text not null check (access_state in (
    'trial_eligible', 'trial', 'expired', 'grandfathered', 'complimentary', 'paid'
  )),
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_entitlements_trial_dates check (
    (access_state = 'trial' and trial_started_at is not null and trial_expires_at is not null)
    or access_state <> 'trial'
  )
);

alter table public.account_entitlements enable row level security;
drop policy if exists account_entitlements_select_own on public.account_entitlements;
create policy account_entitlements_select_own on public.account_entitlements
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.account_entitlements from public, anon, authenticated;
grant select on public.account_entitlements to authenticated;

create or replace function public.initialize_account_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.account_entitlements (user_id, access_state)
  values (new.id, 'trial_eligible')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_account_entitlement on auth.users;
create trigger initialize_account_entitlement
  after insert on auth.users
  for each row execute function public.initialize_account_entitlement();

-- Create the trigger before the backfill while holding its table lock through commit.
-- This closes the account-creation gap during migration deployment.
insert into public.account_entitlements (user_id, access_state)
select id, 'grandfathered'
from auth.users
on conflict (user_id) do nothing;

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
      when e.access_state in ('grandfathered', 'complimentary') then
        e.access_expires_at is null or e.access_expires_at > now()
      when e.access_state = 'paid' then
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
    and p_user_id = auth.uid();
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
  where user_id = caller_id and access_state = 'trial_eligible';
  get diagnostics changed_rows = row_count;

  if changed_rows = 0 then
    raise exception 'This account is not eligible to start another trial' using errcode = '42501';
  end if;
  return public.get_account_entitlement();
end;
$$;

create or replace function public.klabs_entitlement_can_write(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.klabs_account_access(p_user_id) a
    where a.can_write
  );
$$;

revoke all on function public.initialize_account_entitlement() from public, anon, authenticated;
revoke all on function public.klabs_account_access(uuid) from public, anon, authenticated;
revoke all on function public.klabs_entitlement_can_write(uuid) from public, anon;
revoke all on function public.get_account_entitlement() from public, anon;
revoke all on function public.start_account_trial() from public, anon;
grant execute on function public.klabs_account_access(uuid) to authenticated;
grant execute on function public.klabs_entitlement_can_write(uuid) to authenticated;
grant execute on function public.get_account_entitlement() to authenticated;
grant execute on function public.start_account_trial() to authenticated;

-- Restrictive policies are combined with existing ownership policies using AND.
-- Expired accounts retain SELECT access but cannot write business data.
do $$
declare
  table_name text;
  operation text;
  policy_name text;
  target_tables text[] := array[
    'builds', 'components', 'component_taxonomy', 'studio_settings'
  ];
begin
  if to_regclass('public.quote_number_counters') is null then
    raise exception 'Required table public.quote_number_counters is missing; install its allocator SQL first';
  end if;
  foreach table_name in array target_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required table public.% is missing; install its sync SQL first', table_name;
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);

    foreach operation in array array['insert', 'update', 'delete'] loop
      policy_name := format('klabs_entitlement_%s_write_guard', operation);
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      if operation = 'insert' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated with check (auth.uid() = user_id and public.klabs_entitlement_can_write(user_id))',
          policy_name, table_name
        );
      elsif operation = 'update' then
        execute format(
          'create policy %I on public.%I as restrictive for update to authenticated using (auth.uid() = user_id and public.klabs_entitlement_can_write(user_id)) with check (auth.uid() = user_id and public.klabs_entitlement_can_write(user_id))',
          policy_name, table_name
        );
      else
        execute format(
          'create policy %I on public.%I as restrictive for delete to authenticated using (auth.uid() = user_id and public.klabs_entitlement_can_write(user_id))',
          policy_name, table_name
        );
      end if;
    end loop;
  end loop;
end;
$$;

-- The quote counter is a write path even though allocation is an RPC.
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
    raise exception 'Authentication required to allocate a quote number' using errcode = '42501';
  end if;
  if not public.klabs_entitlement_can_write(caller_id) then
    raise exception 'This account is read-only; quote numbers cannot be allocated' using errcode = '42501';
  end if;
  if safe_floor >= 9223372036854775807 then
    raise exception 'Quote number sequence exhausted' using errcode = '22003';
  end if;

  insert into public.quote_number_counters as counter (user_id, next_number, updated_at)
  values (caller_id, safe_floor + 1, now())
  on conflict (user_id) do update
    set next_number = greatest(counter.next_number, safe_floor) + 1,
        updated_at = now()
    where greatest(counter.next_number, safe_floor) < 9223372036854775807
  returning next_number - 1 into allocated_number;

  if allocated_number is null then
    raise exception 'Quote number sequence exhausted' using errcode = '22003';
  end if;
  return allocated_number;
end;
$$;

revoke all on function public.allocate_quote_number(bigint) from public, anon;
grant execute on function public.allocate_quote_number(bigint) to authenticated;

comment on table public.account_entitlements is
  'Server-authoritative account access. Trial activation is explicit and cannot be reset.';
comment on function public.start_account_trial() is
  'Starts an account''s one seven-day trial only after explicit authenticated user action.';

commit;
