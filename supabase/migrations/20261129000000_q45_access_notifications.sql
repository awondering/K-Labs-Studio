-- Q45: complimentary access email notifications.
-- Apply after 20261128000000_q40_owner_access.sql. Repeatable.
--
-- When the owner grants, extends, changes or revokes a builder's complimentary access, the access function records a
-- notification in THE SAME TRANSACTION as the change, so a change that fails or rolls back never leaves anything to
-- send. The owner-admin Edge Function then sends it (Resend API, server-side only) and records the outcome here:
-- 'accepted' means the email service accepted the message; it does not mean the builder received it.
-- An unchanged request (same complimentary expiry) records no notification. Revoking access that was not
-- complimentary (paid, trial, grandfathered) records none: these emails are about complimentary access only.
begin;

do $$
begin
  if to_regprocedure('public.klabs_account_access(uuid)') is null
    or to_regclass('public.klabs_access_audit_log') is null
    or to_regclass('public.account_entitlements') is null then
    raise exception 'Apply the Q40 migrations (through 20261128000000_q40_owner_access.sql) first';
  end if;
end;
$$;

create table if not exists public.klabs_access_notifications (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('granted', 'extended', 'expiry_changed', 'revoked')),
  access_expires_at timestamptz,
  previous_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sending', 'accepted', 'failed')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists klabs_access_notifications_target_idx
  on public.klabs_access_notifications (target_user_id, created_at desc);

-- No browser access: only the security-definer functions below read or change these rows.
alter table public.klabs_access_notifications enable row level security;
revoke all on table public.klabs_access_notifications from public, anon, authenticated;

-- Which email (if any) an access change calls for. Pure; used by both access functions.
create or replace function public.klabs_access_notification_event(
  p_before public.account_entitlements,
  p_after public.account_entitlements,
  p_revoke boolean
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_revoke then
      case when p_before.access_state = 'complimentary' then 'revoked' else null end
    when not (p_before.access_state = 'complimentary'
              and (p_before.access_expires_at is null or p_before.access_expires_at > now())) then 'granted'
    when p_before.access_expires_at is not distinct from p_after.access_expires_at then null
    when p_after.access_expires_at is null then 'extended'
    when p_before.access_expires_at is not null and p_after.access_expires_at > p_before.access_expires_at then 'extended'
    else 'expiry_changed'
  end
$$;
revoke all on function public.klabs_access_notification_event(public.account_entitlements, public.account_entitlements, boolean)
  from public, anon, authenticated;

-- Unchanged from 20261110000003_owner_admin_all_accounts.sql except that it records the notification and returns it.
create or replace function public.admin_set_complimentary_access(
  p_target_user_id uuid,
  p_expires_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row public.account_entitlements%rowtype;
  after_row public.account_entitlements%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  audit_action text;
  notice_event text;
  notice_id uuid;
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null then
    raise exception 'A builder account is required';
  end if;
  if clean_reason = '' or length(clean_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Complimentary access expiry must be in the future';
  end if;

  select * into before_row
  from public.account_entitlements
  where user_id = p_target_user_id
  for update;
  if not found then
    raise exception 'Builder entitlement was not found';
  end if;

  audit_action := case
    when before_row.access_state = 'expired'
      or (before_row.access_state = 'trial' and before_row.trial_expires_at <= now())
      or (before_row.access_expires_at is not null and before_row.access_expires_at <= now())
      then 'restore_complimentary'
    else 'grant_complimentary'
  end;
  update public.account_entitlements
  set access_state = 'complimentary',
      access_expires_at = p_expires_at,
      updated_at = now()
  where user_id = p_target_user_id
  returning * into after_row;

  insert into public.klabs_access_audit_log (
    admin_user_id, target_user_id, action, previous_state, new_state, reason
  ) values (
    auth.uid(), p_target_user_id, audit_action,
    to_jsonb(before_row), to_jsonb(after_row), clean_reason
  );

  notice_event := public.klabs_access_notification_event(before_row, after_row, false);
  if notice_event is not null then
    insert into public.klabs_access_notifications (
      target_user_id, event, access_expires_at, previous_expires_at, created_by
    ) values (
      p_target_user_id, notice_event, after_row.access_expires_at,
      case when before_row.access_state = 'complimentary' then before_row.access_expires_at end, auth.uid()
    ) returning id into notice_id;
  end if;
  return to_jsonb(after_row) || jsonb_build_object('notification_id', notice_id, 'notification_event', notice_event);
end;
$$;

-- Unchanged from 20261110000003_owner_admin_all_accounts.sql except that it records the notification and returns it.
create or replace function public.admin_revoke_builder_access(
  p_target_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row public.account_entitlements%rowtype;
  after_row public.account_entitlements%rowtype;
  clean_reason text := btrim(coalesce(p_reason, ''));
  active_access boolean;
  notice_event text;
  notice_id uuid;
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null then
    raise exception 'A builder account is required';
  end if;
  if clean_reason = '' or length(clean_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters';
  end if;

  select * into before_row
  from public.account_entitlements
  where user_id = p_target_user_id
  for update;
  if not found then
    raise exception 'Builder entitlement was not found';
  end if;

  active_access := case
    when before_row.access_state in ('grandfathered', 'complimentary', 'paid') then
      before_row.access_expires_at is null or before_row.access_expires_at > now()
    when before_row.access_state = 'trial' then
      before_row.trial_expires_at > now()
    else false
  end;
  if active_access is not true then
    raise exception 'Builder account has no active access to revoke';
  end if;

  update public.account_entitlements
  set access_state = 'expired',
      access_expires_at = now(),
      updated_at = now()
  where user_id = p_target_user_id
  returning * into after_row;

  insert into public.klabs_access_audit_log (
    admin_user_id, target_user_id, action, previous_state, new_state, reason
  ) values (
    auth.uid(), p_target_user_id, 'revoke_access',
    to_jsonb(before_row), to_jsonb(after_row), clean_reason
  );

  notice_event := public.klabs_access_notification_event(before_row, after_row, true);
  if notice_event is not null then
    insert into public.klabs_access_notifications (
      target_user_id, event, access_expires_at, previous_expires_at, created_by
    ) values (
      p_target_user_id, notice_event, after_row.access_expires_at, before_row.access_expires_at, auth.uid()
    ) returning id into notice_id;
  end if;
  return to_jsonb(after_row) || jsonb_build_object('notification_id', notice_id, 'notification_event', notice_event);
end;
$$;

-- The Edge Function (service role) takes one notification to send. Returns null when it was already accepted or
-- another attempt is under way, so a retry or a repeated request cannot send it twice. An attempt that stopped
-- mid-send (no outcome recorded for 10 minutes) may be taken again; the email service's idempotency key, which is
-- the notification id, stops that from producing a second email.
create or replace function public.klabs_claim_access_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.klabs_access_notifications%rowtype;
begin
  update public.klabs_access_notifications
  set status = 'sending', attempts = attempts + 1, updated_at = now()
  where id = p_notification_id
    and (status in ('pending', 'failed') or (status = 'sending' and updated_at < now() - interval '10 minutes'))
  returning * into claimed;
  if not found then return null; end if;
  return to_jsonb(claimed);
end;
$$;

-- The Edge Function records the email service's answer for an attempt it claimed.
create or replace function public.klabs_finish_access_notification(
  p_notification_id uuid,
  p_accepted boolean,
  p_provider_message_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  finished public.klabs_access_notifications%rowtype;
begin
  update public.klabs_access_notifications
  set status = case when p_accepted then 'accepted' else 'failed' end,
      provider_message_id = case when p_accepted then left(p_provider_message_id, 200) else provider_message_id end,
      last_error = case when p_accepted then null else left(coalesce(p_error, 'The email could not be sent.'), 300) end,
      accepted_at = case when p_accepted then now() else accepted_at end,
      updated_at = now()
  where id = p_notification_id and status = 'sending'
  returning * into finished;
  if not found then return null; end if;
  return to_jsonb(finished);
end;
$$;

revoke all on function public.klabs_claim_access_notification(uuid) from public, anon, authenticated;
revoke all on function public.klabs_finish_access_notification(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.klabs_claim_access_notification(uuid) to service_role;
grant execute on function public.klabs_finish_access_notification(uuid, boolean, text, text) to service_role;

-- The owner's view of a builder's access emails (Administration → builder → Access emails).
create or replace function public.admin_list_access_notifications(p_target_user_id uuid)
returns table (
  id uuid,
  event text,
  status text,
  access_expires_at timestamptz,
  attempts integer,
  last_error text,
  created_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.klabs_require_owner();
  return query
    select n.id, n.event, n.status, n.access_expires_at, n.attempts, n.last_error, n.created_at, n.accepted_at
    from public.klabs_access_notifications n
    where n.target_user_id = p_target_user_id
    order by n.created_at desc
    limit 20;
end;
$$;
revoke all on function public.admin_list_access_notifications(uuid) from public, anon;
grant execute on function public.admin_list_access_notifications(uuid) to authenticated;

commit;
