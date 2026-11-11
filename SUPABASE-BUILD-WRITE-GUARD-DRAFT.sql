-- DRAFT ONLY: do not apply until the matching client and rollout are verified.
-- Applying this now would block existing clients from saving build changes while they may still report a local save.
-- Existing rows are not rewritten.
-- Older clients cannot update builds until they load the guarded client.
-- An already-running v208 client does not reliably warn when its cloud write fails;
-- offline or dormant sessions cannot be forced to refresh by this migration.
-- The matching client must use separate INSERT and UPDATE statements, not UPSERT:
-- the INSERT trigger removes transient tokens before an ON CONFLICT UPDATE sees them.
begin;

create or replace function public.klabs_build_guard_version()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$ select 2 $$;
revoke all on function public.klabs_build_guard_version() from public, anon;
grant execute on function public.klabs_build_guard_version() to authenticated;

create or replace function public.klabs_guard_build_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  expected_revision timestamptz;
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' and new.payload->'_buildGuardCreate' is distinct from '1'::jsonb then
      raise exception 'Update Studio before creating a build.'
        using errcode = 'P0001';
    end if;
    new.payload := new.payload - '_expectedBuildRevision' - '_buildGuardCreate';
    return new;
  end if;
  if current_user = 'authenticated' then
    begin
      expected_revision := nullif(new.payload->>'_expectedBuildRevision', '')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Invalid build revision; reload and review the build.'
        using errcode = 'P0001';
    end;
    if expected_revision is null or expected_revision <> old.updated_at then
      raise exception 'Build changed on another device; reload and review the build.'
        using errcode = 'P0001';
    end if;
    if old.payload ? 'issuedInvoice' and new.payload->'issuedInvoice' is distinct from old.payload->'issuedInvoice' then
      raise exception 'An issued invoice cannot be changed.'
        using errcode = 'P0001';
    end if;
  end if;
  new.payload := new.payload - '_expectedBuildRevision' - '_buildGuardCreate';
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

drop trigger if exists klabs_guard_build_update on public.builds;
create trigger klabs_guard_build_update
before insert or update on public.builds
for each row execute function public.klabs_guard_build_update();

create or replace function public.klabs_guard_build_delete()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    raise exception 'Update Studio before deleting a build.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists klabs_guard_build_delete on public.builds;
create trigger klabs_guard_build_delete
before delete on public.builds
for each row execute function public.klabs_guard_build_delete();

create or replace function public.klabs_delete_build_if_revision(p_client_id text, p_revision timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  deleted_count integer;
begin
  if caller is null or p_client_id is null or p_revision is null then
    raise exception 'A signed-in account and build revision are required.'
      using errcode = '42501';
  end if;
  if not coalesce(public.klabs_entitlement_can_write(caller), false) then
    raise exception 'This account cannot delete builds.'
      using errcode = '42501';
  end if;
  delete from public.builds
    where user_id=caller and client_id=p_client_id and updated_at=p_revision;
  get diagnostics deleted_count = row_count;
  return deleted_count=1;
end;
$$;
revoke all on function public.klabs_delete_build_if_revision(text,timestamptz) from public, anon;
grant execute on function public.klabs_delete_build_if_revision(text,timestamptz) to authenticated;

commit;
