-- K-Labs Studio: template for any NEW public table used through the Supabase Data API.
-- From 2026-10-30 new public tables get NO automatic Data API grants, so every migration must
-- grant explicitly. Copy, rename `example_records`, review, then run manually in the SQL editor.
-- Never put a service_role / secret key in frontend code; the app uses the publishable key only.

create table if not exists public.example_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint example_records_user_client_unique unique (user_id, client_id)
);

create index if not exists example_records_user_id_idx on public.example_records (user_id);

-- 1. RLS first: account isolation by auth.uid().
alter table public.example_records enable row level security;

drop policy if exists example_records_select_own on public.example_records;
create policy example_records_select_own on public.example_records
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists example_records_insert_own on public.example_records;
create policy example_records_insert_own on public.example_records
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists example_records_update_own on public.example_records;
create policy example_records_update_own on public.example_records
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists example_records_delete_own on public.example_records;
create policy example_records_delete_own on public.example_records
  for delete to authenticated using (auth.uid() = user_id);

-- 2. Explicit grants: never anon, and only the verbs the app's .from() calls actually use.
--    Drop the delete/update line (and its policy) if the client never deletes/updates.
revoke all on public.example_records from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.example_records to authenticated;

-- 3. Verify (read-only): authenticated must have grants, anon must have none, RLS must be on.
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'example_records' order by 1, 2;
-- select relrowsecurity from pg_class where oid = 'public.example_records'::regclass;
