-- DRAFT ONLY: requires explicit production approval. Existing rows are not changed.
-- Blocks build writes for the two specified accounts, including legacy clients and
-- the guarded delete RPC. Other business tables are not frozen by this script.
-- Legacy clients can still falsely report a successful save: keep them disconnected.
begin;

create function public.klabs_temporary_build_write_freeze()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Studio build writes are temporarily frozen.'
      using errcode = 'P0001';
  end if;
  if (tg_op in ('UPDATE', 'DELETE') and old.user_id in
      ('56182f95-eba7-4d45-bd9b-95fd223b27e5'::uuid, 'ce92d438-4156-4464-9527-083f780a135a'::uuid))
     or (tg_op in ('INSERT', 'UPDATE') and new.user_id in
      ('56182f95-eba7-4d45-bd9b-95fd223b27e5'::uuid, 'ce92d438-4156-4464-9527-083f780a135a'::uuid)) then
    raise exception 'Studio build writes are temporarily frozen. Changes have not been synced.'
      using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger klabs_temporary_build_write_freeze
before insert or update or delete on public.builds
for each row execute function public.klabs_temporary_build_write_freeze();

create trigger klabs_temporary_build_truncate_freeze
before truncate on public.builds
for each statement execute function public.klabs_temporary_build_write_freeze();

commit;
