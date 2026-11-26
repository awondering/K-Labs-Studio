-- Q40: permanent Owner access, independent of Stripe (owner requirement, 26 Nov 2026).
--
-- The owner is the single account in public.klabs_access_admins (role 'owner'; the unique index on role allows only
-- one). That account always has full access: klabs_account_access() returns can_write = true and no expiry, BEFORE
-- any entitlement, subscription, trial, payment or expiry rule is considered. It is reported as 'grandfathered' (no
-- expiry), a state every released app version accepts, so an owner device still running an older cached app can
-- never reject the owner's access (a new state name would lock such a device out until it updated). Every server
-- guard decides from this one function (klabs_entitlement_can_write -> the restrictive insert/update/delete policies
-- and the Stage B read policies), so the owner can never be locked out by billing, and a Stripe outage cannot affect
-- it. Nothing here matches e-mail addresses and nothing trusts the app.
--
-- Hardening: klabs_access_admins can be changed only by the database owner (Supabase SQL editor / migrations). It was
-- already closed to anon and authenticated; the service_role (the Edge Functions' key) also loses all rights to it, so
-- not even a leaked server key can create or move the owner. No function inserts into it.
--
-- The owner row itself is NOT created here: it is environment-specific. See supabase/manual/q40_owner_seed.sql.
-- Additive and idempotent. Apply after 20261127000000_q40_stage_b_access.sql.
begin;

do $$
begin
  if to_regclass('public.klabs_access_admins') is null then
    raise exception 'Required table public.klabs_access_admins is missing; apply the owner access manager migration first';
  end if;
  -- Stage B must already be in place: it also replaces klabs_account_access, and applied afterwards it would remove
  -- the owner rule. Stage B's trial retirement is its unmistakable marker.
  if to_regprocedure('public.start_account_trial()') is null
     or position('no longer offers a free trial' in pg_get_functiondef('public.start_account_trial()'::regprocedure)) = 0 then
    raise exception 'Apply 20261127000000_q40_stage_b_access.sql first (it would otherwise overwrite the owner rule)';
  end if;
end;
$$;

revoke all on public.klabs_access_admins from public, anon, authenticated, service_role;

create or replace function public.klabs_account_access(p_user_id uuid default auth.uid())
returns table (access_state text, can_write boolean, trial_available boolean,
  trial_started_at timestamptz, trial_expires_at timestamptz, access_expires_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- 1. The owner: permanent, unconditional access (no entitlement row needed), reported as 'grandfathered'.
  select 'grandfathered'::text, true, false, null::timestamptz, null::timestamptz, null::timestamptz
  where p_user_id = auth.uid()
    and exists (select 1 from public.klabs_access_admins a where a.user_id = p_user_id and a.role = 'owner')
  union all
  -- 2. Everyone else: unchanged from 20261127000000_q40_stage_b_access.sql.
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
    and p_user_id = auth.uid()
    and not exists (select 1 from public.klabs_access_admins a where a.user_id = p_user_id and a.role = 'owner');
$$;

revoke all on function public.klabs_account_access(uuid) from public, anon, authenticated;
grant execute on function public.klabs_account_access(uuid) to authenticated;

commit;
