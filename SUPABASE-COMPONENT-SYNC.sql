-- K-Labs Studio: Component Library cloud sync — one-time setup.
-- Review before running in the Supabase SQL editor for project fdbklophlxdzuevypqwc.
-- Safe to re-run (idempotent): every statement uses IF NOT EXISTS / DO-block existence checks / GRANT
-- (GRANT is naturally idempotent - re-granting an already-held privilege is a no-op, not an error).
-- Never drops or recreates public.components, and never deletes any existing row.
--
-- Column list below is generated directly from js/component-sync.js's recordToRow()/rowToRecord() mapping
-- and the exact .from()/.select()/.upsert()/.delete()/.eq()/.in()/onConflict calls, not assumed.

-- === components: one row per user-owned component ===
create table if not exists public.components (
  id uuid primary key default gen_random_uuid()
);

alter table public.components add column if not exists user_id uuid;
alter table public.components add column if not exists client_id text;
alter table public.components add column if not exists name text;
alter table public.components add column if not exists category text default '';
alter table public.components add column if not exists category_id text default '';
alter table public.components add column if not exists subcategory text default '';
alter table public.components add column if not exists supplier text default '';
alter table public.components add column if not exists brand text default '';
alter table public.components add column if not exists variant text default '';
alter table public.components add column if not exists description text default '';
alter table public.components add column if not exists customer_label text default '';
alter table public.components add column if not exists unit text default '';
alter table public.components add column if not exists quantity numeric;
alter table public.components add column if not exists unit_cost numeric;
alter table public.components add column if not exists unit_price numeric;
alter table public.components add column if not exists cost numeric;
alter table public.components add column if not exists stock_on_hand numeric;
alter table public.components add column if not exists specifications text default '';
alter table public.components add column if not exists notes text default '';
alter table public.components add column if not exists created_at timestamptz not null default now();
alter table public.components add column if not exists updated_at timestamptz not null default now();

-- If `components` already existed with an incompatible column type for user_id/client_id (unknown prior
-- schema), fix it here. This USING cast is only ever safe because the table is confirmed to have 0 rows
-- right now - if it is re-run later once rows exist, a genuinely incompatible cast would fail loudly rather
-- than silently corrupt data, which is the correct behaviour for a live table.
do $$
declare
  current_type text;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'components' and column_name = 'user_id';
  if current_type is not null and current_type <> 'uuid' then
    execute 'alter table public.components alter column user_id type uuid using user_id::uuid';
  end if;
end $$;

do $$
declare
  current_type text;
begin
  select data_type into current_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'components' and column_name = 'client_id';
  if current_type is not null and current_type <> 'text' then
    execute 'alter table public.components alter column client_id type text using client_id::text';
  end if;
end $$;

-- user_id/client_id/name are required for every row (safe: table currently has 0 rows, confirmed above).
alter table public.components alter column user_id set not null;
alter table public.components alter column client_id set not null;
alter table public.components alter column name set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'components_user_id_fkey') then
    alter table public.components
      add constraint components_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Matches the exact onConflict:"user_id,client_id" used by the components .upsert() call in
-- js/component-sync.js: PostgREST resolves onConflict against a unique constraint/index on those columns.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'components_user_client_unique') then
    alter table public.components
      add constraint components_user_client_unique unique (user_id, client_id);
  end if;
end $$;

create index if not exists components_user_id_idx on public.components (user_id);

alter table public.components enable row level security;

drop policy if exists components_select_own on public.components;
create policy components_select_own on public.components
  for select using (auth.uid() = user_id);

drop policy if exists components_insert_own on public.components;
create policy components_insert_own on public.components
  for insert with check (auth.uid() = user_id);

drop policy if exists components_update_own on public.components;
create policy components_update_own on public.components
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists components_delete_own on public.components;
create policy components_delete_own on public.components
  for delete using (auth.uid() = user_id);

-- Table-level privilege grants: PostgREST/Supabase checks these BEFORE row level security is evaluated, so
-- RLS policies alone are not sufficient if the `authenticated` role has no grant on the table. Only the
-- `authenticated` role is granted - `anon`/`public` receive nothing, so unauthenticated requests are refused
-- at the privilege layer regardless of RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.components to authenticated;

-- === component_taxonomy: one JSON row per user holding categories/subcategories/suppliers ===
create table if not exists public.component_taxonomy (
  user_id uuid primary key references auth.users(id) on delete cascade,
  taxonomy jsonb not null default '{"categories":[],"suppliers":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.component_taxonomy enable row level security;

drop policy if exists component_taxonomy_select_own on public.component_taxonomy;
create policy component_taxonomy_select_own on public.component_taxonomy
  for select using (auth.uid() = user_id);

drop policy if exists component_taxonomy_insert_own on public.component_taxonomy;
create policy component_taxonomy_insert_own on public.component_taxonomy
  for insert with check (auth.uid() = user_id);

drop policy if exists component_taxonomy_update_own on public.component_taxonomy;
create policy component_taxonomy_update_own on public.component_taxonomy
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists component_taxonomy_delete_own on public.component_taxonomy;
create policy component_taxonomy_delete_own on public.component_taxonomy
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.component_taxonomy to authenticated;
