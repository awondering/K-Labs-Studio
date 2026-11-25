-- Q40 ROLLBACK (Stage B database behaviour) — NOT a migration; run only if the v290 release is withdrawn.
-- Restores exactly the pre-Q40 behaviour that the v289 app expects:
--   * removes the read lock (records become readable again, read-only, for accounts without access);
--   * restores klabs_account_access and start_account_trial verbatim from 20261110000002_owner_administration.sql.
-- Deliberately KEPT: billing_subscriptions, stripe_events and klabs_apply_stripe_subscription (Stage A). v289 never
-- reads them; keeping them preserves every subscription and payment record and the access already granted to
-- paying customers in account_entitlements. No row in any table is changed or deleted by this script.
-- Before running: switch the live Stripe webhook endpoint off (Stripe Dashboard) if Stripe billing is also withdrawn.
begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['builds', 'components', 'component_taxonomy', 'studio_settings', 'quote_number_counters'] loop
    execute format('drop policy if exists klabs_entitlement_select_guard on public.%I', table_name);
  end loop;
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

revoke all on function public.klabs_account_access(uuid) from public, anon, authenticated;
grant execute on function public.klabs_account_access(uuid) to authenticated;
revoke all on function public.start_account_trial() from public, anon;
grant execute on function public.start_account_trial() to authenticated;

comment on function public.start_account_trial() is
  'Starts an account''s one seven-day trial only after explicit authenticated user action.';

commit;
