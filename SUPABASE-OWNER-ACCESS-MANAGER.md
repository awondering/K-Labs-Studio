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

## Owner Administration v204 (awaiting approval)

The v204 application changes must not be deployed until the new migration has been reviewed and applied, and the privileged Edge Function has been reviewed and deployed. The exact migration is [`supabase/migrations/20261110000002_owner_administration.sql`](./supabase/migrations/20261110000002_owner_administration.sql); it depends on the v203 owner migration above.

### What v204 adds

- The existing Administration interface gains invitations, block/unblock, and typed-email deletion actions. Editing a builder's registered email is outside this release.
- Invitations use `auth.admin.inviteUserByEmail` through the configured Supabase Auth email service. The Edge Function reports a delivery failure if Supabase Auth returns an error. Afterward, it looks up the invited Auth UUID through the owner-only list RPC and reports completion only if its entitlement is `trial_eligible` with no trial start. The invitation and eligibility check do not start a trial.
- Blocking adds a private block record, bans future Auth sign-ins, denies business-table reads and writes through RLS, rejects entitlement/trial access, and makes quote allocation fail. Unblock removes only the block and restores any Auth ban that existed before this owner block; it does not change entitlement history.
- Hard deletion calls Supabase Auth user deletion. Repository-defined Auth foreign keys cascade through builds (including customer/quote payloads), components, component taxonomy, settings, quote counters, entitlements, and the block row. The administrative audit has no Auth foreign key so a minimal deletion record survives.
- The service-role key is read only from Edge Function environment variables. It is not included in website code, app-shell assets, or requests from the browser.

### Offline and deletion boundaries

Server access is denied as soon as the block migration is active, including from already-issued JWTs, because the restrictive RLS policies check the block table on every database query. The Auth ban prevents new sign-ins and refreshes. A disconnected device cannot receive a remote block or deletion signal and may retain already-downloaded localStorage data until it reconnects; the UI warns the owner and checks block status every 15 seconds while online. Do not describe remote blocking as erasing offline copies.

The repository contains no Supabase Storage API usage. Before production deletion is enabled, inspect the production foreign keys and storage inventory. Do not deploy the Edge Function if any account-owned tables or objects outside the documented cascade set need deletion handling. The UI explicitly warns that disconnected devices may retain offline copies. The migration and function do not invent deletion handling for unknown storage buckets or future billing records.

### Review and apply the v204 migration

1. Review the entire migration file linked above. Do not execute it until the owner approves it.
2. Before applying it, inspect all foreign keys into `auth.users` and confirm each account-owned application table uses `ON DELETE CASCADE`. Confirm there are no unhandled business-data tables:

   ```sql
   select c.conrelid::regclass as referencing_table,
          c.conname,
          c.confdeltype,
          pg_get_constraintdef(c.oid) as definition
   from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'auth.users'::regclass
   order by c.conrelid::regclass::text, c.conname;
   ```

   For expected application data tables, `confdeltype` must be `c` (cascade). Review any additional referencing table and any Supabase Storage bucket for account-owned objects before proceeding. The normal application tables in the repository are `builds`, `components`, `component_taxonomy`, `studio_settings`, `quote_number_counters`, and `account_entitlements`; v204 adds `klabs_access_blocks`. The access-admin allowlist also references Auth users but the owner account is protected from deletion.
3. After review and approval, run the complete migration in Supabase Dashboard → SQL Editor. It is transactional and intended to be repeatable.
4. Verify:

   ```sql
   select tablename, policyname, permissive, cmd, roles
   from pg_policies
   where schemaname = 'public'
     and policyname like 'klabs_account_block_%_guard'
   order by tablename;

   select proname, prosecdef, proacl
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and proname in (
       'klabs_account_is_blocked', 'klabs_account_access',
       'klabs_entitlement_can_write', 'allocate_quote_number',
       'admin_target_is_owner',
       'admin_email_available', 'admin_record_account_action',
       'admin_set_builder_block', 'admin_get_builder_block',
       'admin_clear_builder_block', 'admin_list_builders',
       'get_account_entitlement', 'start_account_trial'
     )
   order by proname;

   select grantee, table_name, privilege_type
   from information_schema.table_privileges
   where table_schema = 'public'
     and table_name in ('klabs_access_blocks', 'quote_number_counters')
   order by grantee, privilege_type;
   ```

   Confirm the restrictive SELECT block guard exists on `account_entitlements` and all five business tables; each business table has restrictive INSERT, UPDATE, and DELETE block guards; the existing entitlement write guards remain on builds, components, component taxonomy, and settings; the write helper, quote allocator, entitlement functions, and admin RPCs are `SECURITY DEFINER`; and there are no `anon`/`authenticated` direct write privileges on either `klabs_access_blocks` or `quote_number_counters`.

### Review and deploy the privileged Edge Function

The function is [`supabase/functions/owner-admin/index.ts`](./supabase/functions/owner-admin/index.ts) with its testable action handler in [`supabase/functions/_shared/owner-admin-core.mjs`](./supabase/functions/_shared/owner-admin-core.mjs). It re-verifies the bearer session and `klabs_is_owner` for every request. It uses the service-role client only for Auth Admin operations; database changes still use owner-checked RPCs. It must not be deployed until the owner reviews and approves it.

Before deploying, confirm the Supabase Auth email provider is configured to deliver invitations and set the Edge Function environment variable `PUBLIC_APP_URL` to `https://studio.klabs.co.nz/`. The invitation uses Supabase Auth's configured mail service; verify the provider and redirect URL with a disposable account in a non-production project. Supabase supplies its project URL and keys to Edge Functions; verify `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are available in the function environment. Never put the service-role key in the repository or browser.

After approval, deploy `owner-admin` through the linked Supabase project using the Supabase CLI. No production migration or privileged function was applied or deployed as part of local implementation.

### Required non-production verification

Use disposable accounts only in a non-production project for state-changing tests:

1. Verify anonymous and authenticated non-owner calls to every privileged RPC and the Edge Function are rejected; verify owner listing and audit access.
2. Verify invitation delivery using the configured Supabase Auth email service and confirm the invited account remains `trial_eligible` until explicit trial activation. Verify provider errors are reported without a false success.
3. Block a disposable account, then use its still-valid existing JWT to test SELECT, INSERT, UPDATE, DELETE, quote allocation, and trial activation. Each must fail. Confirm fresh sign-in is denied.
4. Unblock it and confirm the original entitlement and expiry are unchanged, including any pre-existing Auth ban.
5. Delete disposable accounts through both delete paths. Confirm Auth identities and every documented account-owned row are gone, the audit remains, and another account's records are unchanged.

No separate test accounts, production Auth Admin credentials, or SQL connection are available in the local development environment. Do not test blocking or deletion on production customer accounts. These authenticated and destructive checks remain unverified until performed in a non-production Supabase project.

### Release gate

Do not commit/push the v204 application or deploy GitHub Pages until the migration is owner-approved and verified, the Edge Function is owner-approved and deployed, and email delivery and non-production account checks have been reviewed. The new service-worker cache is `build148-v204`. The authoritative master To-Do list was not found in this repository; do not create a replacement.
