# Account entitlement migration

The frontend must not be published until this migration has been reviewed, applied, and its checks have passed. Do not execute it against production before review.

## Prerequisites

In the target Supabase project, confirm that `public.builds`, `public.components`, `public.component_taxonomy`, `public.studio_settings`, and `public.quote_number_counters` exist and have their existing per-user ownership policies. The migration deliberately fails if a required table is missing. It does not delete or rewrite business records.

## Apply

1. Review [`supabase/migrations/20261110000000_account_entitlements.sql`](./supabase/migrations/20261110000000_account_entitlements.sql).
2. In the Supabase Dashboard, open **SQL Editor**, create a new query, paste the complete file, and run it once. The transaction is atomic and the migration is idempotent.
3. Do not publish the frontend unless the query completes successfully.

## Verify in SQL Editor

Run these read-only checks and confirm:

```sql
select access_state, count(*)
from public.account_entitlements
group by access_state
order by access_state;

select tablename, policyname, permissive, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('builds', 'components', 'component_taxonomy', 'studio_settings')
order by tablename, cmd, policyname;

select proname, prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('get_account_entitlement', 'start_account_trial',
                  'klabs_entitlement_can_write', 'allocate_quote_number')
order by proname;
```

Existing accounts should be `grandfathered`; new accounts should be `trial_eligible`. Each business table must retain its own-row `SELECT` policy and have restrictive `INSERT`, `UPDATE`, and `DELETE` entitlement policies. All four functions should report `prosecdef = true`.

After the frontend is released, verify activation and expiry with a disposable, email-verified account: registration alone must remain eligible, Explore Mode must show fictional data only, explicit trial confirmation must return a seven-day expiry, and an expired test entitlement must still allow SELECT while rejecting INSERT/UPDATE/DELETE and quote-number allocation. Do not change a real customer entitlement to simulate this test.

The public bootstrap caches only the last verified entitlement per signed-in user for offline startup; it does not read Studio business records. If no entitlement has yet been cached, a returning session may open its local Studio data view-only until it can verify access online. Cached trial expiry is evaluated locally, and the database remains authoritative for all online writes.

## Administrative grants

Only a trusted project administrator should grant complimentary or paid access by updating that account's entitlement row. Set `access_state` to `complimentary` or `paid`, set `access_expires_at` to `NULL` for unrestricted duration or a future timestamp for a limited grant, and update `updated_at = now()`. Do not reset a consumed trial to `trial_eligible`.
