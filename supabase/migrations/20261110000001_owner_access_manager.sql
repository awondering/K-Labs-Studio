-- K-Labs Studio owner-only access administration.
-- Apply only after 20261110000000_account_entitlements.sql.
begin;

do $$
begin
  if to_regclass('public.account_entitlements') is null then
    raise exception 'Required table public.account_entitlements is missing; apply the entitlement migration first';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'Required Supabase table auth.users is missing';
  end if;
end;
$$;

create table if not exists public.klabs_access_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'owner'),
  created_at timestamptz not null default now()
);

create unique index if not exists klabs_access_admins_single_owner
  on public.klabs_access_admins (role);

alter table public.klabs_access_admins enable row level security;
revoke all on public.klabs_access_admins from public, anon, authenticated;

create table if not exists public.klabs_access_audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in (
    'grant_complimentary', 'restore_complimentary',
    'revoke_complimentary', 'extend_trial'
  )),
  previous_state jsonb not null,
  new_state jsonb not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.klabs_access_audit_log enable row level security;
revoke all on public.klabs_access_audit_log from public, anon, authenticated;
create index if not exists klabs_access_audit_target_created
  on public.klabs_access_audit_log (target_user_id, created_at desc, id desc);

create or replace function public.klabs_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.klabs_access_admins a
    where a.user_id = auth.uid() and a.role = 'owner'
  );
$$;

create or replace function public.klabs_require_owner()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.klabs_is_owner() then
    raise exception 'Owner administration permission required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_list_builders(
  p_search text default '',
  p_status text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  builder_user_id uuid,
  email text,
  account_created_at timestamptz,
  access_state text,
  can_write boolean,
  trial_available boolean,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  access_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.klabs_require_owner();
  if coalesce(p_status, 'all') not in (
    'all', 'trial_eligible', 'trial', 'expired', 'grandfathered', 'complimentary', 'paid'
  ) then
    raise exception 'Unsupported access status filter';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.created_at,
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
  from auth.users u
  join public.account_entitlements e on e.user_id = u.id
  where (
      nullif(btrim(coalesce(p_search, '')), '') is null
      or u.email ilike '%' || btrim(p_search) || '%'
    )
    and (
      coalesce(p_status, 'all') = 'all'
      or coalesce(p_status, 'all') = case
        when e.access_state = 'trial' and e.trial_expires_at <= now() then 'expired'
        when e.access_state in ('grandfathered', 'complimentary', 'paid')
          and e.access_expires_at is not null and e.access_expires_at <= now() then 'expired'
        else e.access_state
      end
    )
  order by u.created_at desc, u.email
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.admin_list_access_audit(p_target_user_id uuid)
returns table (
  audit_id bigint,
  admin_email text,
  action text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null then
    raise exception 'A builder account is required';
  end if;
  return query
  select l.id, u.email::text, l.action, l.previous_state, l.new_state, l.reason, l.created_at
  from public.klabs_access_audit_log l
  left join auth.users u on u.id = l.admin_user_id
  where l.target_user_id = p_target_user_id
  order by l.created_at desc, l.id desc
  limit 50;
end;
$$;

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
  if p_target_user_id = auth.uid()
    or exists (select 1 from public.klabs_access_admins a where a.user_id = p_target_user_id) then
    raise exception 'The owner account cannot be changed through Access Manager' using errcode = '42501';
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
  if before_row.access_state in ('grandfathered', 'paid') then
    raise exception 'Grandfathered and paid access cannot be changed here';
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
    auth.uid(), p_target_user_id, audit_action, to_jsonb(before_row), to_jsonb(after_row), clean_reason
  );
  return to_jsonb(after_row);
end;
$$;

create or replace function public.admin_revoke_complimentary_access(
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
begin
  perform public.klabs_require_owner();
  if p_target_user_id is null then
    raise exception 'A builder account is required';
  end if;
  if p_target_user_id = auth.uid()
    or exists (select 1 from public.klabs_access_admins a where a.user_id = p_target_user_id) then
    raise exception 'The owner account cannot be changed through Access Manager' using errcode = '42501';
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
  if before_row.access_state <> 'complimentary' then
    raise exception 'Only complimentary access can be revoked here';
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
    auth.uid(), p_target_user_id, 'revoke_complimentary',
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
  if p_target_user_id = auth.uid()
    or exists (select 1 from public.klabs_access_admins a where a.user_id = p_target_user_id) then
    raise exception 'The owner account cannot be changed through Access Manager' using errcode = '42501';
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

revoke all on function public.klabs_is_owner() from public, anon;
revoke all on function public.klabs_require_owner() from public, anon, authenticated;
revoke all on function public.admin_list_builders(text, text, integer, integer) from public, anon;
revoke all on function public.admin_list_access_audit(uuid) from public, anon;
revoke all on function public.admin_set_complimentary_access(uuid, timestamptz, text) from public, anon;
revoke all on function public.admin_revoke_complimentary_access(uuid, text) from public, anon;
revoke all on function public.admin_extend_builder_trial(uuid, timestamptz, text) from public, anon;
grant execute on function public.klabs_is_owner() to authenticated;
grant execute on function public.admin_list_builders(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_access_audit(uuid) to authenticated;
grant execute on function public.admin_set_complimentary_access(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_revoke_complimentary_access(uuid, text) to authenticated;
grant execute on function public.admin_extend_builder_trial(uuid, timestamptz, text) to authenticated;

comment on table public.klabs_access_admins is
  'Trusted owner allowlist. Manage only through the Supabase SQL Editor.';
comment on table public.klabs_access_audit_log is
  'Durable audit trail for owner-initiated entitlement changes.';

commit;
