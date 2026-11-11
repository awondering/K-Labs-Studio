-- DRAFT ONLY: requires separate approval. This restores the verified v208
-- baseline, where these guard functions and triggers did not exist.
-- Pause every writer first. The two-account build freeze must remain active.
-- Do not deploy v208 or resume writes until the separate recovery procedure
-- has preserved upgraded clients' journals and explicitly accepted the loss
-- of server-side conflict protection.
begin;

lock table public.builds in access exclusive mode;

do $$
declare
  item record;
  function_oid oid;
begin
  for item in
    select * from (values
      ('public.klabs_build_guard_version()', '101ae94b5c6da3fa9122a65a0470e525', 'sql', false, 's'),
      ('public.klabs_guard_build_update()', '207a793cf0d815079f1a852bbbe36a1b', 'plpgsql', false, 'v'),
      ('public.klabs_guard_build_delete()', 'f30c2ac20d0fe9fab92e52cec47ff457', 'plpgsql', false, 'v'),
      ('public.klabs_delete_build_if_revision(text,timestamp with time zone)', 'ea6581b76230bb91fa8dca7f0fe36735', 'plpgsql', true, 'v'),
      ('public.klabs_temporary_build_write_freeze()', '1c64e08fbe3b45d97c4141493e799477', 'plpgsql', false, 'v')
    ) as expected(signature, body_hash, language, security_definer, volatility)
  loop
    function_oid := to_regprocedure(item.signature);
    if function_oid is null or not exists (
      select 1 from pg_proc p join pg_language l on l.oid = p.prolang
      where p.oid = function_oid and md5(p.prosrc) = item.body_hash
        and l.lanname = item.language and p.prosecdef = item.security_definer
        and p.provolatile = item.volatility
        and p.proconfig = array['search_path=public, pg_temp']
    ) then
      raise exception 'Guard or freeze function missing or changed: %', item.signature;
    end if;
  end loop;

  for item in
    select * from (values
      ('klabs_guard_build_update', 'public.klabs_guard_build_update()', 23),
      ('klabs_guard_build_delete', 'public.klabs_guard_build_delete()', 11),
      ('klabs_temporary_build_write_freeze', 'public.klabs_temporary_build_write_freeze()', 31),
      ('klabs_temporary_build_truncate_freeze', 'public.klabs_temporary_build_write_freeze()', 34)
    ) as expected(name, signature, trigger_type)
  loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.builds'::regclass
        and tgname = item.name and not tgisinternal
        and tgenabled in ('O', 'A')
        and tgfoid = to_regprocedure(item.signature)
        and tgtype = item.trigger_type and tgnargs = 0 and tgqual is null
    ) then
      raise exception 'Guard or freeze trigger missing, disabled or changed: %', item.name;
    end if;
  end loop;

  if (select count(*) from pg_trigger where tgrelid = 'public.builds'::regclass
      and not tgisinternal) <> 4 then
    raise exception 'Unexpected build triggers; verify the baseline before rollback.';
  end if;
end;
$$;

drop trigger klabs_guard_build_update on public.builds;
drop trigger klabs_guard_build_delete on public.builds;
drop function public.klabs_delete_build_if_revision(text,timestamp with time zone);
drop function public.klabs_build_guard_version();
drop function public.klabs_guard_build_update();
drop function public.klabs_guard_build_delete();

commit;
