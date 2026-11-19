-- Q6 (DRAFT — not applied anywhere). Refuse invoices and payments on a Components job whose saved pricing is still to be
-- confirmed (payload.pricePending = true). Additive only: one trigger function and one trigger on public.builds.
-- Existing rows, invoices, payments, quote numbering and klabs_financial_operation are not changed.
-- Apply only after reviewing the deployment plan and taking a verified backup.
begin;

create or replace function public.klabs_refuse_pending_financials()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only changes to payments or the issued invoice are checked; every other edit (sync, notes, prices, status,
  -- clearing pricePending itself) passes exactly as before.
  if coalesce(new.payload->'payments', '[]'::jsonb) is not distinct from coalesce(old.payload->'payments', '[]'::jsonb)
     and new.payload->'issuedInvoice' is not distinct from old.payload->'issuedInvoice' then
    return new;
  end if;
  if old.payload->>'pricePending' = 'true' or new.payload->>'pricePending' = 'true' then
    raise exception 'Pricing to be confirmed: save the job with a Sell Price for every component before recording a payment or issuing an invoice.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.klabs_refuse_pending_financials() from public, anon, authenticated;

drop trigger if exists klabs_refuse_pending_financials on public.builds;
create trigger klabs_refuse_pending_financials
before update on public.builds
for each row execute function public.klabs_refuse_pending_financials();

commit;
