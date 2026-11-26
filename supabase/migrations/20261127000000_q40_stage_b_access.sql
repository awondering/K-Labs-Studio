-- Q40 Stage B: subscription access controls that MUST ship together with the Studio app release that shows the
-- subscribe / locked screens (the app no longer opens, or syncs, for an account without access).
--
-- 1. Read lock at expiry. Owner-approved model: when paid access ends, every paid function is locked, including
--    viewing. Records are NEVER deleted or changed: a restrictive SELECT policy only hides them while the account has
--    no access, and they reappear unchanged the moment Stripe confirms a new paid period.
-- 2. The free trial is retired (no free trial; free Demo Mode stays). No new trial can start. Trials already running
--    keep their original end date, and owner grants (complimentary, grandfathered) are unchanged.
-- Additive and idempotent.
begin;

do $$
begin
  if to_regprocedure('public.klabs_entitlement_can_write(uuid)') is null then
    raise exception 'Required function public.klabs_entitlement_can_write is missing; apply the entitlement migrations first';
  end if;
end;
$$;

-- 1. Read lock: the same rule as the write guard, so access is exactly one decision (paid through, owner grant or a
--    running trial). Combined with each table's own ownership policy using AND.
do $$
declare
  table_name text;
  target_tables text[] := array['builds', 'components', 'component_taxonomy', 'studio_settings', 'quote_number_counters'];
begin
  foreach table_name in array target_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required table public.% is missing', table_name;
    end if;
    execute format('drop policy if exists klabs_entitlement_select_guard on public.%I', table_name);
    execute format(
      'create policy klabs_entitlement_select_guard on public.%I as restrictive for select to authenticated using (auth.uid() = user_id and public.klabs_entitlement_can_write(user_id))',
      table_name
    );
  end loop;
end;
$$;

-- 2. Trial retirement.
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
    false,
    e.trial_started_at,
    e.trial_expires_at,
    e.access_expires_at
  from public.account_entitlements e
  where e.user_id = p_user_id
    and p_user_id = auth.uid();
$$;

create or replace function public.start_account_trial()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'K-Labs Studio no longer offers a free trial. Subscribe to continue, or use the free Demo Mode.'
    using errcode = '42501';
end;
$$;

revoke all on function public.klabs_account_access(uuid) from public, anon, authenticated;
grant execute on function public.klabs_account_access(uuid) to authenticated;
revoke all on function public.start_account_trial() from public, anon;
grant execute on function public.start_account_trial() to authenticated;

comment on function public.start_account_trial() is
  'Retired by Q40 (no free trial). Always refuses; existing trials keep their original end date.';

commit;
