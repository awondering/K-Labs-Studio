-- Q45 rollback: removes complimentary access email notifications and restores the access functions exactly as
-- defined in 20261110000003_owner_admin_all_accounts.sql. Access entitlements and the audit log are not changed.
-- Unsent and sent notification records are deleted. Run in Supabase SQL Editor ONLY with owner approval, and
-- redeploy the previous owner-admin Edge Function and Studio (build148-v298) with it: the v299 admin screen
-- expects these functions and the Edge Function actions. Repeatable.
begin;

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
  return to_jsonb(after_row);
end;
$$;

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
  return to_jsonb(after_row);
end;
$$;

drop function if exists public.admin_list_access_notifications(uuid);
drop function if exists public.klabs_finish_access_notification(uuid, boolean, text, text);
drop function if exists public.klabs_claim_access_notification(uuid);
drop function if exists public.klabs_access_notification_event(public.account_entitlements, public.account_entitlements, boolean);
drop table if exists public.klabs_access_notifications;

commit;
