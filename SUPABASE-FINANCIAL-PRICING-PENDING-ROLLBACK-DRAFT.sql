-- Q6 rollback for supabase/migrations/20261120000000_financial_pricing_pending.sql (DRAFT - review before use). Removes only the pricing-pending refusal; no data is changed.
begin;
drop trigger if exists klabs_refuse_pending_financials on public.builds;
drop function if exists public.klabs_refuse_pending_financials();
commit;
