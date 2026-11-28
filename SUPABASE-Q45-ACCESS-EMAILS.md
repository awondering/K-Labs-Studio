# Q45 — Complimentary access email notifications

When the owner grants, extends, changes or revokes a builder's **complimentary** access in Administration, Studio
emails that builder. Nothing here is live until the owner approves and completes the steps below, in order.

## How it works

1. Administration → Grant or Revoke now calls the `owner-admin` Edge Function (actions `set_complimentary` and
   `revoke_access`). The browser no longer changes access directly.
2. The function checks the owner as before, then calls the existing owner-only database function
   (`admin_set_complimentary_access` / `admin_revoke_builder_access`). In the same transaction as the access change
   and its audit record, that function records a notification (`public.klabs_access_notifications`). If the change
   fails or is rolled back, there is nothing to send.
3. Only after the change has committed does the function send the email through the **Resend API**, with the
   notification ID as the idempotency key. It then records the result: `accepted` (Resend accepted the message;
   delivery is not confirmed) or `failed` (with a short reason). A failed email never reverses the access change.
4. The admin sees "Access saved" and whether the email was accepted or not sent. Administration → builder →
   **Access emails** lists each email. **Retry email** appears only on an email that was not sent; an accepted
   email is never sent again.

**Emails:** access granted ("Your K-Labs Studio access is ready"), extended ("Your Studio access has been
extended"), end date changed ("Your K-Labs Studio access end date has changed"), and complimentary access ended
("Your complimentary K-Labs Studio access has ended"). Each email states the exact end date in New Zealand time, or
says that access has no scheduled end date. Each has an "Open K-Labs Studio" button linking to
https://studio.klabs.co.nz/. They never include the owner's reason or any internal detail.

**No email is sent when:**
- the request does not change the builder's complimentary access (the same end date again);
- a revoked account's access was paid, trial or grandfathered rather than complimentary;
- the change is refused.

Trial extension and block, unblock, delete and invite are unchanged.

## Deployment (owner approval required at each step)

1. **Resend:** create an API key with **Sending access** only, limited to the verified domain `notify.klabs.co.nz`
   (the domain already used for Studio's authentication emails). Keep click and open tracking **off**.
2. **Edge Function secrets** (Supabase → Edge Functions → Secrets). Never put these in Studio's code:
   - `RESEND_API_KEY` — the key from step 1.
   - `ACCESS_EMAIL_FROM` — the sender, on the verified domain, for example `K-Labs Studio <studio@notify.klabs.co.nz>`.
     Use the same sender address as the Supabase SMTP settings.
   If either is missing, access changes still save and each email is recorded as **not sent** ("Email sending is
   not configured on the server").
3. **Database:** in the SQL Editor, run `supabase/migrations/20261129000000_q45_access_notifications.sql`. It is
   transactional and repeatable, and it refuses to run before the Q40 migrations. It does not change any
   entitlement, audit row or customer record.
4. **Edge Function:** deploy `owner-admin`. It includes `_shared/owner-admin-core.mjs` and `_shared/access-email.mjs`.
5. **Studio:** release build148-v299 (GitHub Pages).
6. **Live check:** using a TEST builder account whose inbox the owner controls, grant complimentary access with an
   end date. Confirm all of the following:
   - Administration says the email was accepted;
   - Access emails shows it;
   - the email arrives with the correct date and a working link;
   - revoking sends the "ended" email.
   Do not use a customer account.

Order matters. Step 3 must come before step 4, and step 4 before step 5: the v299 admin screen calls the new
function actions. If v299 is released first, Grant and Revoke fail with "Unsupported owner administration action"
until the function is deployed, and no access changes. An older Studio tab that still calls the database functions
directly keeps working: its notifications are recorded but not sent, and they appear under Access emails with
**Retry email**.

## Rollback

Run `supabase/rollback/q45_access_notifications_rollback.sql`. It restores the two access functions exactly as
they were and removes the notification records. Then redeploy the previous `owner-admin` function and Studio
build148-v298. Entitlements and the audit log are not changed.

## Tests (no real email is sent)

- `tests/q45-access-notifications-isolated.cjs`, run with `PGLITE_MODULE=…`: the real schema in PGlite. Covers each
  event, no-ops, refused and rolled-back changes, permissions, exactly-once claiming, the rollback, and that
  existing entitlements are unchanged.
- `tests/q45-access-email.test.cjs`: the Edge Function with the email service mocked and the real network blocked.
- `tests/q45-admin-access-emails-browser.cjs`: Administration at 390 px, 320 px and on desktop (WebKit).
