-- Allow the designated owner to administer access for every builder account.
-- Apply only after 20261110000002_owner_administration.sql.
begin;

do $$
declare
  required_tables text[] := array[
    'account_entitlements', 'klabs_access_admins', 'klabs_access_audit_log',
    'klabs_access_blocks'
  ];
  table_name text;
begin
  foreach table_name in array required_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required table public.% is missing', table_name;
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
    'revoke_complimentary', 'revoke_access', 'extend_trial',
    'block_builder', 'unblock_builder', 'invite_builder',
    'delete_builder_started', 'delete_builder_completed'
  ));

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

create or replace function public.admin_extend_builder_trial(
  p_target_user_id uuid,
  p_trial_expires_at timestamptz,
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
  if before_row.access_state <> 'trial'
    or before_row.trial_expires_at is null
    or before_row.trial_expires_at <= now() then
    raise exception 'Only an active trial can be extended';
  end if;
  if p_trial_expires_at is null or p_trial_expires_at <= before_row.trial_expires_at then
    raise exception 'The new trial expiry must be later than its current expiry';
  end if;

  update public.account_entitlements
  set trial_expires_at = p_trial_expires_at,
      updated_at = now()
  where user_id = p_target_user_id
  returning * into after_row;

  insert into public.klabs_access_audit_log (
    admin_user_id, target_user_id, action, previous_state, new_state, reason
  ) values (
    auth.uid(), p_target_user_id, 'extend_trial',
    to_jsonb(before_row), to_jsonb(after_row), clean_reason
  );
  return to_jsonb(after_row);
end;
$$;

revoke all on function public.admin_set_complimentary_access(uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_builder_access(uuid, text) from public, anon;
revoke all on function public.admin_extend_builder_trial(uuid, timestamptz, text) from public, anon;
grant execute on function public.admin_set_complimentary_access(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_revoke_builder_access(uuid, text) to authenticated;
grant execute on function public.admin_extend_builder_trial(uuid, timestamptz, text) to authenticated;

comment on function public.admin_revoke_builder_access(uuid, text) is
  'Owner-only revocation of any active entitlement; preserves trial history and customer records.';

commit;
