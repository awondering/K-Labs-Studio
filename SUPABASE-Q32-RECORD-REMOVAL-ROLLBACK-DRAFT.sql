-- Q32 ROLLBACK (DRAFT). Restores klabs_protect_build_financials (20261111000000_financial_safeguards.sql) and
-- klabs_guard_build_update (SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql) exactly as before Q32. Data is not changed: builds
-- already deleted, invoices or payments already removed stay removed (restore those from the pre-migration backup if needed).
begin;

create or replace function public.klabs_protect_build_financials()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.payload ? 'issuedInvoice' then
      raise exception 'A build with an issued invoice cannot be deleted.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if coalesce(new.payload->'payments', '[]'::jsonb) <> '[]'::jsonb
         or new.payload ? 'issuedInvoice' then
        raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
      end if;
    elsif coalesce(new.payload->'payments', '[]'::jsonb) is distinct from coalesce(old.payload->'payments', '[]'::jsonb)
       or new.payload->'issuedInvoice' is distinct from old.payload->'issuedInvoice' then
      raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

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

drop function if exists public.klabs_record_removal_version();

commit;
