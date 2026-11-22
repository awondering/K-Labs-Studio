-- Q32 (DRAFT — NOT APPLIED to production; owner approval and a verified backup required first).
-- Lets a builder REMOVE their own records: delete a build that has an issued invoice, remove an issued invoice from a
-- build, and remove a payment entry. No new tables. Two existing functions are replaced and one read-only marker added:
--   * klabs_protect_build_financials (supabase/migrations/20261111000000_financial_safeguards.sql)
--   * klabs_guard_build_update       (SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql)
--   * klabs_record_removal_version() returns 1 — Studio only offers the Remove actions once this exists, so they
--     never fail against a server without this change.
-- What stays protected: adding or changing a payment, and issuing an invoice, still only go through
-- klabs_financial_operation; an issued invoice can be removed but never altered in place; revision checks unchanged.
-- The server log public.klabs_financial_operations is not touched, so every issue/payment request stays on record.
-- Rollback: SUPABASE-Q32-RECORD-REMOVAL-ROLLBACK-DRAFT.sql (repository root)
begin;

create or replace function public.klabs_protect_build_financials()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  old_payments jsonb;
  new_payments jsonb;
begin
  if tg_op = 'DELETE' then
    -- Q32: a builder may delete their own build, including one with an issued invoice (with confirmation in Studio).
    return old;
  end if;
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if coalesce(new.payload->'payments', '[]'::jsonb) <> '[]'::jsonb
         or new.payload ? 'issuedInvoice' then
        raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
      end if;
    else
      old_payments := coalesce(old.payload->'payments', '[]'::jsonb);
      new_payments := coalesce(new.payload->'payments', '[]'::jsonb);
      -- Q32: an ordinary save may only REMOVE payment entries (each remaining entry unchanged).
      if new_payments is distinct from old_payments and (
           jsonb_typeof(new_payments) is distinct from 'array'
           or jsonb_typeof(old_payments) is distinct from 'array'
           or jsonb_array_length(new_payments) >= jsonb_array_length(old_payments)
           or exists (select 1 from jsonb_array_elements(new_payments) item
                      where not (old_payments @> jsonb_build_array(item)))) then
        raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
      end if;
      -- Q32: an ordinary save may REMOVE the issued invoice, never add or alter one.
      if new.payload->'issuedInvoice' is distinct from old.payload->'issuedInvoice'
         and new.payload ? 'issuedInvoice' then
        raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
      end if;
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
    -- Q32: removing the issued invoice is allowed; altering it in place is not.
    if old.payload ? 'issuedInvoice' and new.payload ? 'issuedInvoice'
       and new.payload->'issuedInvoice' is distinct from old.payload->'issuedInvoice' then
      raise exception 'An issued invoice cannot be changed.'
        using errcode = 'P0001';
    end if;
  end if;
  new.payload := new.payload - '_expectedBuildRevision' - '_buildGuardCreate';
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create or replace function public.klabs_record_removal_version()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$ select 1 $$;
revoke all on function public.klabs_record_removal_version() from public, anon;
grant execute on function public.klabs_record_removal_version() to authenticated;

commit;
