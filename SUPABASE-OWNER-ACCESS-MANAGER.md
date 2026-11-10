# Owner Access Manager migration

The application must not be released until this migration has been reviewed, applied, and verified. Do not execute it before owner approval.

## Migration

Review [`supabase/migrations/20261110000001_owner_access_manager.sql`](./supabase/migrations/20261110000001_owner_access_manager.sql). It depends on the existing `public.account_entitlements` table created by [`20261110000000_account_entitlements.sql`](./supabase/migrations/20261110000000_account_entitlements.sql).

The migration adds a single-owner allowlist with no client table grants, owner-checked RPCs, and a durable access-change audit table. It does not alter customer/build/quote/component data or modify existing entitlement rows.

## Apply and authorize the owner

1. In Supabase Dashboard → **SQL Editor**, review and run the complete migration once. It is transactional and safe to re-run.
2. Find the intended owner’s auth user UUID in SQL Editor. Do not put an owner email or UUID in frontend code:

   ```sql
   select id, email, created_at
   from auth.users
   where lower(email) = lower('<owner email>');
   ```

3. After confirming the exact account, authorize it through this trusted SQL Editor statement, replacing the placeholder with that account’s UUID:

   ```sql
   insert into public.klabs_access_admins (user_id, role)
   values ('<confirmed-owner-auth-user-uuid>'::uuid, 'owner');
   ```

   The table has no grants for `anon` or `authenticated`, and only one owner row is permitted. Do not create an owner-management RPC or grant direct table access.
4. Verify the owner row and function permissions:

   ```sql
   select a.user_id, u.email, a.role, a.created_at
   from public.klabs_access_admins a
   join auth.users u on u.id = a.user_id;

   select proname, prosecdef, proacl
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and proname in (
       'klabs_is_owner', 'admin_list_builders', 'admin_list_access_audit',
       'admin_set_complimentary_access', 'admin_revoke_complimentary_access',
       'admin_extend_builder_trial'
     )
   order by proname;

   select grantee, table_name, privilege_type
   from information_schema.table_privileges
   where table_schema = 'public'
     and table_name in ('klabs_access_admins', 'klabs_access_audit_log')
   order by table_name, grantee, privilege_type;
   ```

   Confirm that the owner identity is the intended account; all listed RPCs are `SECURITY DEFINER`; and there are no `anon` or `authenticated` table privileges on either administration table.

## Enforcement and verification

- `admin_list_builders` returns only account email, creation time, effective entitlement state, write eligibility and entitlement dates. It does not query customer, build, quote, component or business-profile data.
- Every list, audit and mutation RPC checks the trusted owner allowlist. Direct table access is revoked. Never rely on the hidden Settings entry as authorization.
- Mutations require a reason and transactionally record administrator, target, action, previous row state, new row state and timestamp.
- The owner account, grandfathered access and paid access cannot be changed through this panel. Complimentary revocation sets access to expired while preserving trial dates and customer records. Trial extension only changes the expiry of a still-active trial; it does not reset trial history.
- The panel does not claim that a payment occurred or cancel a subscription. Payment and cancellation remain unavailable until Stripe is integrated.

### Safe permission checks

The migration has been applied to production and the owner allowlist was verified by the operator. Anonymous REST requests to each client-callable administration RPC (`klabs_is_owner`, `admin_list_builders`, `admin_list_access_audit`, `admin_set_complimentary_access`, `admin_revoke_complimentary_access`, and `admin_extend_builder_trial`) must fail with an authorization response. These calls are non-mutating: every admin RPC checks the authenticated owner before reading or changing records.

On 2026-11-10, an unauthenticated production REST probe returned HTTP 401 for all six RPCs above. This confirms anonymous callers cannot invoke them; it does not establish the authenticated non-owner denial or owner access.

An anonymous rejection does not prove the authenticated non-owner case or the owner's signed-in experience. Verify those with separate owner and non-owner test accounts (preferably in a non-production project):

1. Sign in as the non-owner and invoke each of the five `admin_*` RPCs. Confirm each returns SQLSTATE `42501` / HTTP 403, and confirm the owner screen remains unavailable.
2. Sign in as the owner and confirm `klabs_is_owner` returns `true`, and builder search/filter and audit reads work.
3. If mutation workflows need verification, use disposable test accounts in a non-production project. Confirm grant, revoke, and active-trial extension write the expected audit entries while leaving customer data unchanged.
4. Confirm a fresh sign-in receives the updated effective access.

No separate authenticated owner or non-owner test credentials are stored in the repository or available to this verification run. Do not request or share passwords. Until those account-level checks are run, report them as unverified. Never test mutation workflows against a production customer account or alter a real entitlement to simulate expiry.
