-- Q35 per-size prices: one additive column on public.components.
--
-- Apply BEFORE deploying the app build that sends size_prices (build148-v284 and later): that build includes
-- size_prices in every component upsert, and PostgREST rejects an upsert naming a column that does not exist.
-- Older app builds never mention the column, so applying it first is safe for them.
--
-- Effects: adds components.size_prices (jsonb, NOT NULL, default '{}') and a CHECK that it is a JSON object.
-- Every existing row gets '{}' = "no per-size prices": each size keeps using the component's existing shared price.
-- No row, id, price, stock, size list, policy, grant, trigger or other column is changed. Idempotent.
--
-- Column contract (must match js/component-sync.js recordToRow()/rowToRecord()/normalizeSyncSizePrices()):
--   size_prices  jsonb object  { "<size label>": { "cost": <Buy>, "unitPrice": <Sell> }, ... }
--                              keys are labels from size_options; a size without an entry uses cost/unit_price.

alter table public.components
  add column if not exists size_prices jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'components_size_prices_is_object'
      and conrelid = 'public.components'::regclass
  ) then
    alter table public.components
      add constraint components_size_prices_is_object check (jsonb_typeof(size_prices) = 'object');
  end if;
end
$$;

-- Verification (optional): one row, data_type jsonb, is_nullable NO, default '{}'::jsonb.
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'components' and column_name = 'size_prices';
