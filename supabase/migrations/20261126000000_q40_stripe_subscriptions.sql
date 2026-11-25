-- Q40 Stage A: Stripe subscriptions -> Studio access (server side only).
-- Additive and idempotent. Adds the record of each account's Stripe subscription, a log of processed Stripe events
-- (each event applied once), and one function that only the server (service_role, used by the stripe-webhook Edge
-- Function) may call to turn a VERIFIED Stripe subscription into Studio access.
--
-- Access is never granted from the browser: authenticated users can only read their own subscription row.
-- Nothing here changes existing accounts, the trial, the read/write guards or any record. The read lock on expiry and
-- the retirement of the trial ship later, together with the Studio app changes (they must not be applied alone).
--
-- Access rules (owner decision 26 Nov 2026: NO GRACE PERIOD). Access ends exactly when the verified paid-through
-- period ends, unless Stripe confirms a new paid period:
--   paid-through = current_period_end   when the subscription's latest invoice is PAID (Stripe confirmed the period)
--                = current_period_start when it is not (a renewal is waiting or failed: Stripe has already advanced
--                                       the period, so its start is the end of the last PAID period)
--   active / past_due  -> 'paid' until the paid-through time, if that is still in the future; otherwise locked
--   trialing           -> no access (Studio has no free trial; a trial configured in Stripe grants nothing)
--   anything else      -> no access ('expired' if the account had access); records are never touched
--   A later verified payment (invoice paid) restores access automatically to the new paid-through time.
--   Owner grants (complimentary, grandfathered) that last longer are never shortened by Stripe.
begin;

do $$
begin
  if to_regclass('public.account_entitlements') is null then
    raise exception 'Required table public.account_entitlements is missing; apply the entitlement migrations first';
  end if;
end;
$$;

create table if not exists public.billing_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  status text check (status is null or status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  )),
  plan text check (plan is null or plan in ('monthly', 'annual')),
  currency text check (currency is null or currency in ('nzd', 'usd')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  paid_through timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_id text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscriptions force row level security;
drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own on public.billing_subscriptions
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.billing_subscriptions from public, anon, authenticated;
grant select on public.billing_subscriptions to authenticated;
-- Explicit grants: new public tables no longer receive Supabase's default grants (from 30 Oct 2026). The Edge
-- Functions (service_role) read the row and record a new Stripe customer; nothing else writes here.
grant select, insert, update on public.billing_subscriptions to service_role;

create table if not exists public.stripe_events (
  event_id text primary key,
  event_type text not null,
  user_id uuid,
  stripe_subscription_id text,
  result text not null default 'received',
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
alter table public.stripe_events force row level security;
revoke all on public.stripe_events from public, anon, authenticated;
grant select on public.stripe_events to service_role;

create or replace function public.klabs_apply_stripe_subscription(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_status text,
  p_plan text,
  p_currency text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_latest_invoice_paid boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  stored public.billing_subscriptions%rowtype;
  current_access public.account_entitlements%rowtype;
  new_expiry timestamptz;
  outcome text;
begin
  if coalesce(p_event_id, '') = '' or coalesce(p_event_type, '') = '' then
    raise exception 'A Stripe event id and type are required';
  end if;
  if p_status is null or p_status not in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  ) then
    raise exception 'Unsupported Stripe subscription status: %', p_status;
  end if;
  if p_latest_invoice_paid is null then
    raise exception 'Whether the latest invoice is paid is required';
  end if;

  -- Each Stripe event is applied at most once.
  insert into public.stripe_events (event_id, event_type, user_id, stripe_subscription_id)
  values (p_event_id, p_event_type, p_user_id, p_subscription_id)
  on conflict (event_id) do nothing;
  if not found then
    return jsonb_build_object('result', 'duplicate');
  end if;

  if p_user_id is null or not exists (select 1 from auth.users u where u.id = p_user_id) then
    update public.stripe_events set result = 'unknown_user' where event_id = p_event_id;
    return jsonb_build_object('result', 'unknown_user');
  end if;
  if coalesce(p_customer_id, '') = '' or coalesce(p_subscription_id, '') = '' then
    raise exception 'Stripe customer and subscription ids are required';
  end if;

  if exists (select 1 from public.billing_subscriptions b
             where b.stripe_customer_id = p_customer_id and b.user_id <> p_user_id) then
    update public.stripe_events set result = 'customer_mismatch' where event_id = p_event_id;
    return jsonb_build_object('result', 'customer_mismatch');
  end if;
  select * into stored from public.billing_subscriptions where user_id = p_user_id for update;
  if found and stored.stripe_customer_id <> p_customer_id then
    -- One Stripe customer per account: never let another customer's subscription change this account.
    update public.stripe_events set result = 'customer_mismatch' where event_id = p_event_id;
    return jsonb_build_object('result', 'customer_mismatch');
  end if;
  if found and stored.stripe_subscription_id is not null and stored.stripe_subscription_id <> p_subscription_id
    and stored.status in ('active', 'trialing', 'past_due')
    and p_status <> 'active' then
    -- An older or abandoned subscription must not override the account's current live one.
    update public.stripe_events set result = 'ignored_other_subscription' where event_id = p_event_id;
    return jsonb_build_object('result', 'ignored_other_subscription');
  end if;

  -- No grace: access runs exactly to the end of the last period Stripe confirmed as paid.
  new_expiry := case
    when p_status in ('active', 'past_due') then
      case when p_latest_invoice_paid then p_period_end else p_period_start end
    else null
  end;

  insert into public.billing_subscriptions as b (
    user_id, stripe_customer_id, stripe_subscription_id, status, plan, currency,
    current_period_start, current_period_end, paid_through, cancel_at_period_end, last_event_id, last_event_at, updated_at
  ) values (
    p_user_id, p_customer_id, p_subscription_id, p_status, p_plan, lower(p_currency),
    p_period_start, p_period_end, new_expiry, coalesce(p_cancel_at_period_end, false), p_event_id, now(), now()
  )
  on conflict (user_id) do update set
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    plan = excluded.plan,
    currency = excluded.currency,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    paid_through = excluded.paid_through,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_event_id = excluded.last_event_id,
    last_event_at = excluded.last_event_at,
    updated_at = excluded.updated_at;


  select * into current_access from public.account_entitlements where user_id = p_user_id for update;
  if not found then
    insert into public.account_entitlements (user_id, access_state) values (p_user_id, 'trial_eligible')
    returning * into current_access;
  end if;

  if current_access.access_state in ('complimentary', 'grandfathered')
    and (current_access.access_expires_at is null
      or (current_access.access_expires_at > now()
        and current_access.access_expires_at >= coalesce(new_expiry, '-infinity'::timestamptz))) then
    outcome := 'owner_grant_kept';
  elsif new_expiry is not null and new_expiry > now() then
    update public.account_entitlements
      set access_state = 'paid', access_expires_at = new_expiry, updated_at = now()
      where user_id = p_user_id;
    outcome := 'access_granted';
  elsif current_access.access_state in ('paid', 'complimentary', 'grandfathered') then
    update public.account_entitlements
      set access_state = 'expired',
          access_expires_at = least(coalesce(current_access.access_expires_at, now()), now()),
          updated_at = now()
      where user_id = p_user_id;
    outcome := 'access_ended';
  else
    outcome := 'no_access';
  end if;

  update public.stripe_events set result = outcome where event_id = p_event_id;
  return jsonb_build_object('result', outcome, 'access_expires_at', new_expiry);
end;
$$;

revoke all on function public.klabs_apply_stripe_subscription(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.klabs_apply_stripe_subscription(text, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, boolean)
  to service_role;

commit;
