-- DRAFT ONLY: remove the temporary freeze only after the guarded client and guard
-- have both been verified. This does not disable the permanent revision guard.
begin;

do $$
declare
  guard_version integer;
begin
  if to_regprocedure('public.klabs_build_guard_version()') is null
     or to_regprocedure('public.klabs_delete_build_if_revision(text,timestamp with time zone)') is null
     or not exists (
       select 1 from pg_trigger where tgrelid = 'public.builds'::regclass
       and tgname = 'klabs_guard_build_update' and tgenabled in ('O', 'A') and not tgisinternal
     )
     or not exists (
       select 1 from pg_trigger where tgrelid = 'public.builds'::regclass
       and tgname = 'klabs_guard_build_delete' and tgenabled in ('O', 'A') and not tgisinternal
     ) then
    raise exception 'Revision guard is not fully installed; the build freeze remains active.';
  end if;
  execute 'select public.klabs_build_guard_version()' into guard_version;
  if guard_version is distinct from 2 then
    raise exception 'Unexpected revision guard version; the build freeze remains active.';
  end if;
end;
$$;

drop trigger klabs_temporary_build_write_freeze on public.builds;
drop trigger klabs_temporary_build_truncate_freeze on public.builds;
drop function public.klabs_temporary_build_write_freeze();

commit;
