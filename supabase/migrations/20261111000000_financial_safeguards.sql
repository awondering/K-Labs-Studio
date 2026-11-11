-- Apply only after reviewing the deployment plan and taking a verified backup.
begin;

create table public.klabs_financial_operations (
  user_id uuid not null,
  operation_id uuid not null,
  build_id text not null,
  kind text not null,
  request jsonb not null,
  previous_payment jsonb,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
alter table public.klabs_financial_operations enable row level security;
alter table public.klabs_financial_operations force row level security;
revoke all on public.klabs_financial_operations from public, anon, authenticated;

create or replace function public.klabs_protect_build_financials()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.payload ? 'issuedInvoice' then
      raise exception 'A build with an issued invoice cannot be deleted.' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if coalesce(new.payload->'payments', '[]'::jsonb) <> '[]'::jsonb
         or new.payload ? 'issuedInvoice' then
        raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
      end if;
    elsif coalesce(new.payload->'payments', '[]'::jsonb) is distinct from coalesce(old.payload->'payments', '[]'::jsonb)
       or new.payload->'issuedInvoice' is distinct from old.payload->'issuedInvoice' then
      raise exception 'Financial records require an acknowledged financial operation.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
create trigger klabs_protect_build_financials
before insert or update or delete on public.builds
for each row execute function public.klabs_protect_build_financials();

create or replace function public.klabs_financial_operation(
  p_build_id text, p_revision timestamptz, p_operation_id uuid, p_kind text, p_data jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  caller uuid := auth.uid();
  previous public.klabs_financial_operations%rowtype;
  build public.builds%rowtype;
  payments jsonb;
  next_payments jsonb;
  payment jsonb;
  existing jsonb;
  invoice jsonb;
  total numeric;
  received numeric;
  amount numeric;
  payment_date date;
  response jsonb;
begin
  if caller is null or p_build_id is null or p_build_id = '' or p_revision is null
     or p_operation_id is null or p_kind is null or p_kind not in ('add_payment', 'correct_payment', 'issue_invoice')
     or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception 'Invalid financial operation.' using errcode = '22023';
  end if;
  if not coalesce(public.klabs_entitlement_can_write(caller), false) then
    raise exception 'This account cannot record financial transactions.' using errcode = '42501';
  end if;
  -- Serialize retries of the same operation before checking the idempotency ledger.
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || p_operation_id::text, 0));
  select * into previous from public.klabs_financial_operations
    where user_id = caller and operation_id = p_operation_id;
  if found then
    if previous.build_id <> p_build_id or previous.kind <> p_kind or previous.request <> p_data then
      raise exception 'Operation ID was already used for a different request.' using errcode = '22023';
    end if;
    return previous.result;
  end if;
  select * into build from public.builds
    where user_id = caller and client_id = p_build_id for update;
  if not found then
    raise exception 'The build was not found.' using errcode = 'P0001';
  end if;
  if build.updated_at <> p_revision then
    raise exception 'The build changed. Synchronise and review it before recording a financial transaction.'
      using errcode = 'P0001';
  end if;
  payments := coalesce(build.payload->'payments', '[]'::jsonb);
  if jsonb_typeof(payments) <> 'array' then
    raise exception 'Existing payments are invalid; review the build before continuing.' using errcode = 'P0001';
  end if;
  if p_kind in ('add_payment', 'correct_payment') then
    if coalesce(p_data->>'id', '') = '' or coalesce(p_data->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(p_data->>'amount', '') !~ '^[0-9]+(\.[0-9]{1,2})?$'
       or coalesce(p_data->>'type', '') not in ('deposit', 'balance') then
      raise exception 'Enter a valid payment amount and date.' using errcode = '22023';
    end if;
    amount := (p_data->>'amount')::numeric;
    payment_date := (p_data->>'date')::date;
    if amount <= 0 or to_char(payment_date, 'YYYY-MM-DD') <> p_data->>'date' then
      raise exception 'Enter a valid payment amount and date.' using errcode = '22023';
    end if;
    payment := jsonb_build_object('id', p_data->>'id', 'type', p_data->>'type',
      'amount', amount, 'date', p_data->>'date');
    select item into existing from jsonb_array_elements(payments) item where item->>'id' = p_data->>'id';
    if p_kind = 'add_payment' then
      if existing is not null or exists (
        select 1 from jsonb_array_elements(payments) item
        where item->>'type' = payment->>'type' and item->>'date' = payment->>'date'
          and (item->>'amount')::numeric = amount
      ) then
        raise exception 'This payment is already recorded; review payment history.' using errcode = 'P0001';
      end if;
      if payment->>'type' = 'deposit' and exists (
        select 1 from jsonb_array_elements(payments) item where item->>'type' = 'deposit'
      ) then
        raise exception 'A deposit is already recorded; correct it instead.' using errcode = 'P0001';
      end if;
      next_payments := payments || jsonb_build_array(payment);
    else
      if existing is null or existing->>'type' <> payment->>'type' or
         (select count(*) from jsonb_array_elements(payments) item where item->>'id' = p_data->>'id') <> 1 or
         length(trim(coalesce(p_data->>'reason', ''))) < 3 then
        raise exception 'A valid payment and correction reason are required.' using errcode = '22023';
      end if;
      if exists (select 1 from jsonb_array_elements(payments) item
        where item->>'id' <> p_data->>'id' and item->>'type' = payment->>'type'
          and item->>'date' = payment->>'date' and (item->>'amount')::numeric = amount) then
        raise exception 'This payment is already recorded; review payment history.' using errcode = 'P0001';
      end if;
      select jsonb_agg(case when item->>'id' = p_data->>'id' then payment else item end order by ordinal)
        into next_payments from jsonb_array_elements(payments) with ordinality as entries(item, ordinal);
    end if;
    total := coalesce((build.payload->'issuedInvoice'->>'total')::numeric,
      (build.payload->>'finalCustomerPrice')::numeric, 0);
    select coalesce(sum((item->>'amount')::numeric), 0) into received from jsonb_array_elements(next_payments) item;
    if total <= 0 or received > total then
      raise exception 'Payments cannot exceed the saved customer price.' using errcode = 'P0001';
    end if;
    build.payload := jsonb_set(build.payload, '{payments}', next_payments, true);
  else
    if build.payload ? 'issuedInvoice' then
      raise exception 'An invoice has already been issued for this build.' using errcode = 'P0001';
    end if;
    invoice := p_data->'invoice';
    if jsonb_typeof(invoice) is distinct from 'object'
       or jsonb_typeof(invoice->'total') is distinct from 'number'
       or coalesce(invoice->>'issuedDate','') !~ '^\d{4}-\d{2}-\d{2}$'
       or invoice->>'number' is distinct from 'INV-' || replace(caller::text, '-', '') || '-' || encode(convert_to(p_build_id, 'UTF8'), 'hex')
       or invoice->'payments' is distinct from payments
       or (invoice->>'total')::numeric is distinct from (build.payload->>'finalCustomerPrice')::numeric then
      raise exception 'Invoice does not match the saved build.' using errcode = 'P0001';
    end if;
    build.payload := jsonb_set(build.payload, '{issuedInvoice}', invoice, true);
  end if;
  update public.builds set payload = build.payload,
    updated_at = greatest(clock_timestamp(), build.updated_at + interval '1 microsecond')
    where user_id = caller and client_id = p_build_id returning to_jsonb(public.builds.*) into response;
  insert into public.klabs_financial_operations(user_id, operation_id, build_id, kind, request, previous_payment, result)
    values (caller, p_operation_id, p_build_id, p_kind, p_data,
      case when p_kind = 'correct_payment' then existing else null end, response);
  return response;
end;
$$;
revoke all on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb) from public, anon;
grant execute on function public.klabs_financial_operation(text,timestamptz,uuid,text,jsonb) to authenticated;

commit;
