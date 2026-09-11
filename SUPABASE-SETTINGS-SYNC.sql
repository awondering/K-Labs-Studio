-- K-Labs Studio: account-level Settings cloud sync — one-time setup.
-- Review before running in the Supabase SQL editor for project fdbklophlxdzuevypqwc.
-- Safe to re-run (idempotent): IF NOT EXISTS / drop+create policy / GRANT everywhere.
-- One row per authenticated user. `payload` stores the existing local settings objects as JSON.
-- Does not touch Components, Builds, Customers, Blanks, current quote drafts, or transient workshop state.

create table if not exists public.studio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.studio_settings enable row level security;

drop policy if exists studio_settings_select_own on public.studio_settings;
create policy studio_settings_select_own on public.studio_settings
  for select using (auth.uid() = user_id);

drop policy if exists studio_settings_insert_own on public.studio_settings;
create policy studio_settings_insert_own on public.studio_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists studio_settings_update_own on public.studio_settings;
create policy studio_settings_update_own on public.studio_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Table-level privilege grants: PostgREST checks these BEFORE RLS, so RLS alone is not sufficient.
grant usage on schema public to authenticated;
grant select, insert, update on public.studio_settings to authenticated;
