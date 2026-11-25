-- Q40: record the K-Labs Studio OWNER account (run by the owner in the Supabase SQL editor; never by the app).
-- Replace OWNER_USER_ID with the verified Supabase Auth user ID (Authentication -> Users), in both places.
-- Safe to run more than once. It refuses if a DIFFERENT account is already the owner, and changes no other data.
begin;

do $$
declare
  wanted uuid := 'OWNER_USER_ID';
  existing uuid;
begin
  if not exists (select 1 from auth.users u where u.id = wanted) then
    raise exception 'No Supabase Auth user has the ID %', wanted;
  end if;
  select a.user_id into existing from public.klabs_access_admins a where a.role = 'owner';
  if existing is not null and existing <> wanted then
    raise exception 'A different account (%) is already the owner. Nothing changed.', existing;
  end if;
  insert into public.klabs_access_admins (user_id, role) values (wanted, 'owner')
  on conflict (user_id) do nothing;
end;
$$;

-- Check (read only): exactly one owner, and it is the intended account.
select a.user_id, a.role, a.created_at, u.email, u.email_confirmed_at is not null as email_verified
from public.klabs_access_admins a join auth.users u on u.id = a.user_id;

commit;
