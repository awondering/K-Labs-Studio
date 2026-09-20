-- K-Labs Studio: atomic per-account quote-number allocation.
--
-- Run this in the Supabase SQL editor before deploying client code that calls
-- public.allocate_quote_number(bigint). Safe to re-run.
--
-- The client supplies a minimum safe next number derived from its account-local
-- counter and existing historical Build payloads. The database serializes all
-- concurrent allocations for the authenticated user and never moves backward.
-- The numeric sequence is returned; quotePrefix remains a normal synced setting
-- and is applied by the client after allocation.

create table if not exists public.quote_number_counters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_number bigint not null check (next_number >= 1),
  updated_at timestamptz not null default now()
);

alter table public.quote_number_counters enable row level security;

-- Direct reads are useful for diagnostics. Direct writes are intentionally not
-- granted; allocation can only occur through the authenticated RPC below.
drop policy if exists quote_number_counters_select_own on public.quote_number_counters;
create policy quote_number_counters_select_own on public.quote_number_counters
  for select using (auth.uid() = user_id);

revoke all on public.quote_number_counters from public, anon, authenticated;
grant select on public.quote_number_counters to authenticated;

create or replace function public.allocate_quote_number(p_minimum_next bigint default 1)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  safe_floor bigint := greatest(coalesce(p_minimum_next, 1), 1);
  allocated_number bigint;
begin
  if caller_id is null then
    raise exception 'Authentication required to allocate a quote number'
      using errcode = '42501';
  end if;

  if safe_floor >= 9223372036854775807 then
    raise exception 'Quote number sequence exhausted'
      using errcode = '22003';
  end if;

  insert into public.quote_number_counters as counter (user_id, next_number, updated_at)
  values (caller_id, safe_floor + 1, now())
  on conflict (user_id) do update
    set next_number = greatest(counter.next_number, safe_floor) + 1,
        updated_at = now()
    where greatest(counter.next_number, safe_floor) < 9223372036854775807
  returning next_number - 1 into allocated_number;

  if allocated_number is null then
    raise exception 'Quote number sequence exhausted'
      using errcode = '22003';
  end if;

  return allocated_number;
end;
$$;

revoke all on function public.allocate_quote_number(bigint) from public, anon;
grant execute on function public.allocate_quote_number(bigint) to authenticated;

comment on table public.quote_number_counters is
  'One atomic numeric quote sequence per authenticated K-Labs account.';

comment on function public.allocate_quote_number(bigint) is
  'Atomically allocates one numeric quote sequence for auth.uid(), never below p_minimum_next.';

-- Verification after installation (read-only):
-- select user_id, next_number, updated_at
-- from public.quote_number_counters
-- where user_id = auth.uid();
--
-- Do not insert a production row manually. The first RPC call initializes the
-- row atomically from the client-supplied safe floor.
