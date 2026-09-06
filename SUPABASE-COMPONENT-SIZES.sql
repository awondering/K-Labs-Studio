-- K-Labs Studio: Component Library "Available Sizes" — schema top-up for an EXISTING database.
--
-- Run this ONCE in the Supabase SQL editor for the existing project BEFORE deploying/syncing the app
-- build that adds reusable component size options. SUPABASE-COMPONENT-SYNC.sql already contains this
-- column for fresh installations; this file exists only because that script has already been run in
-- production and is not re-executed there.
--
-- Safe to re-run (idempotent): ADD COLUMN IF NOT EXISTS is a no-op when the column already exists.
-- Adds one column only. Never drops, recreates or rewrites public.components, never deletes a row,
-- never changes RLS policies, grants, constraints or any other column.
--
-- Column contract (must match js/component-sync.js recordToRow()/rowToRecord()):
--   size_options  jsonb  a JSON array of plain size label strings, e.g. ["9 mm","10 mm","11 mm"]
--                        empty array [] means "this component has no selectable sizes"
--                        NOT NULL with a '[]' default so existing rows stay valid and readable.

alter table public.components
  add column if not exists size_options jsonb not null default '[]'::jsonb;

-- Belt-and-braces for the case where the column already existed as nullable from an earlier partial run:
-- backfill any NULLs to an empty array, then enforce the NOT NULL contract the app relies on.
update public.components set size_options = '[]'::jsonb where size_options is null;

alter table public.components
  alter column size_options set default '[]'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'components'
      and column_name = 'size_options'
      and is_nullable = 'YES'
  ) then
    alter table public.components alter column size_options set not null;
  end if;
end
$$;

-- Verification (optional): should return one row with data_type = 'jsonb' and is_nullable = 'NO'.
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'components' and column_name = 'size_options';
