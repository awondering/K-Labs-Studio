-- Q35 ROLLBACK (DRAFT) for supabase/migrations/20261125000000_q35_component_size_prices.sql.
--
-- ORDER: first redeploy an app build that does NOT send size_prices (build148-v283), and let devices update;
-- only then run this. While a v284+ build is still in use, dropping the column makes its component sync fail
-- (its upserts name size_prices) - local data stays safe on the device, but cloud sync stops until it updates.
--
-- DATA: dropping the column permanently discards every per-size price saved since the migration. Each size then
-- uses its component's shared price again. Ids, shared prices, stock, size lists and build lines are untouched
-- (build lines keep the prices they recorded). Export size_prices first if those prices must be kept:
--   select user_id, client_id, name, size_prices from public.components where size_prices <> '{}'::jsonb;
begin;
alter table public.components drop constraint if exists components_size_prices_is_object;
alter table public.components drop column if exists size_prices;
commit;
