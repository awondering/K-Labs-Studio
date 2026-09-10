-- K-Labs Studio: Build library cloud sync — one-time setup (Builds ONLY, NOT klabs-workshop-quotes).
-- Review before running in the Supabase SQL editor for project fdbklophlxdzuevypqwc.
-- Safe to re-run (idempotent): IF NOT EXISTS / DO-block existence checks / GRANT everywhere.
-- Never drops/recreates public.builds and never deletes any existing row.
--
-- Mirrors the exact shape used by js/build-sync.js recordToRow()/rowToRecord() and its
-- .from()/.select()/.upsert()/.delete()/.eq()/.in()/onConflict calls.
-- One row per Build record. `payload` holds the FULL existing build object as-is (same fields
-- newQuoteTemplate()/normalizeQuote() already produce in js/ui.js) - kept as one jsonb column
-- deliberately, instead of one SQL column per field, to keep this table simple and future-proof
-- against new build fields without further schema changes.

create table if not exists public.builds (
  id uuid primary key default gen_random_uuid()
);

alter table public.builds add column if not exists user_id uuid;
alter table public.builds add column if not exists client_id text;
alter table public.builds add column if not exists build_number text default '';
alter table public.builds add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.builds add column if not exists created_at timestamptz not null default now();
alter table public.builds add column if not exists updated_at timestamptz not null default now();

-- user_id/client_id are required for every row (safe: run this before any row exists in a fresh table).
alter table public.builds alter column user_id set not null;
alter table public.builds alter column client_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'builds_user_id_fkey') then
    alter table public.builds
      add constraint builds_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Matches the exact onConflict:"user_id,client_id" used by the builds .upsert() call in js/build-sync.js.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'builds_user_client_unique') then
    alter table public.builds
      add constraint builds_user_client_unique unique (user_id, client_id);
  end if;
end $$;

create index if not exists builds_user_id_idx on public.builds (user_id);

alter table public.builds enable row level security;

drop policy if exists builds_select_own on public.builds;
create policy builds_select_own on public.builds
  for select using (auth.uid() = user_id);

drop policy if exists builds_insert_own on public.builds;
create policy builds_insert_own on public.builds
  for insert with check (auth.uid() = user_id);

drop policy if exists builds_update_own on public.builds;
create policy builds_update_own on public.builds
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists builds_delete_own on public.builds;
create policy builds_delete_own on public.builds
  for delete using (auth.uid() = user_id);

-- Table-level privilege grants: PostgREST checks these BEFORE RLS, so RLS alone is not sufficient.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.builds to authenticated;
