# Q40 — Stripe subscriptions, TEST MODE (Stage A server side + Stage B app and access controls)

Status: implemented and tested locally. **Nothing is deployed to production, no production data is changed, and no real
payment can be taken** (Stripe sandbox only). Stage A and Stage B must reach production together, in one approved release.

## What it contains
| File | Purpose |
|---|---|
| `supabase/migrations/20261126000000_q40_stripe_subscriptions.sql` | Stage A. `billing_subscriptions` (each account reads only its own row; only the server writes), `stripe_events` (each event applied once, outcome logged) and `klabs_apply_stripe_subscription` (service role only). |
| `supabase/migrations/20261127000000_q40_stage_b_access.sql` | Stage B. **Read lock**: an account without access cannot read its builds, components, taxonomy, settings or quote counter (records are hidden, never deleted or changed). **Trial retired**: no new trial can start; running trials keep their end date. |
| `supabase/functions/_shared/billing-core.mjs` | Testable core: Stripe signature check, minimal Stripe client (API `2024-06-20`), webhook, checkout, portal, immediate renewal charge. |
| `supabase/functions/stripe-webhook/index.ts` | Receives Stripe events; the Stripe signature is checked. |
| `supabase/functions/billing-checkout/index.ts` | Signed-in, verified user to a **card-only** Checkout Session (`monthly`/`annual` × `nzd`/`usd`). |
| `supabase/functions/billing-portal/index.ts` | Signed-in user to the Stripe Customer Portal. |
| `js/billing.js`, `js/public-entry.js`, `index.html`, `css/studio.css` | Stage B app: subscription screen, Settings → Account → Subscription, checkout return, renewal cover. |

All three functions verify the caller in code (Stripe signature, or `auth.getUser` for the signed-in user), so they are
deployed with the gateway JWT check off. They read the new publishable/secret keys and fall back to the legacy ones.

## Access rules — NO GRACE PERIOD (owner decision 26 Nov 2026)
- **Access ends exactly when the verified paid-through period ends,** unless Stripe confirms a new paid period.
- **Paid-through:** the period end when the subscription's latest invoice is **paid**; otherwise the period start
  (the end of the last paid period).
- **Renewal continuity (option D):** Stripe drafts the renewal invoice at the period end and would wait about an hour
  before charging. On a verified `invoice.created` that is exactly a Studio renewal (subscription cycle, approved
  price and amount, draft, automatic collection, same customer, matching mode), the server finalises and charges it at
  once, with idempotency keys. Access still comes only from the **paid** invoice. Anything unexpected, or any failure,
  leaves Stripe's own attempt in place.
- **Cancelled at period end:** access to exactly the period end, then locked.
- **Failed renewal (past_due):** locked from the last paid period end; a successful payment restores access.
- **Trialing:** grants nothing. **canceled / unpaid / paused / incomplete_expired:** locked.
- **Owner grants** (complimentary, grandfathered) that last longer are never shortened.
- **Records are never deleted.** While locked they are hidden; they return unchanged when payment is confirmed.
- `renewal_state` (pending / action_required / failed) chooses the customer's message only; it never grants access.

## In the app
- **No access** (new account, or ended): Studio does not open (nothing shown, nothing synced). The subscription screen
  offers NZD or USD, monthly or annual, Manage billing (once a Stripe customer exists), Explore Mode and Sign Out.
- **Subscribe** asks the server for Checkout and only follows a `https://checkout.stripe.com` address (the portal only
  `https://billing.stripe.com`).
- **Back from Checkout:** "Confirming your payment with Stripe…" until the **server** confirms access, then Studio opens.
- **Settings → Account → Subscription:** plan, renewal or end date, payment problems, Manage billing.
- **At the paid-through moment while Studio is open:** nothing can be saved from that instant; the records are covered by
  "Confirming your renewal…"; once the server confirms the renewal (seconds, with option D) Studio continues where the
  builder was. A cancelled, failed or unconfirmed (2 minutes) renewal closes Studio to the subscription screen.
- Also fixed: expiry timers longer than ~24.8 days fired immediately in browsers; long waits are now armed daily.

## Tests (local)
- `tests/billing-core.test.cjs`: 23 unit tests (signatures, client, webhook, checkout, portal, immediate renewal charge
  and its refusals, renewal state, keys).
- `tests/q40-stripe-subscriptions-isolated.cjs`: 36 database checks on the real production schema (PGlite), including the
  exact expiry boundary, renewals awaiting payment, failed renewals, the read lock, trial retirement and records kept.
- `tests/q40-subscription-browser.cjs`: 52 checks in WebKit (iPhone 13 and Mac) on the real Studio page.
- `tests/public-entry.test.cjs`: entry rules (no access → no Studio; renewal wait; long timers).

## Test project (separate FREE Supabase project) — owner steps
1. **Create** a free Supabase project, e.g. `klabs-studio-test` (Supabase → New project). Keep its database password in
   your password manager; it is not needed here.
2. **Create a scoped access token** (Supabase → Account → Access Tokens → new **scoped** token) limited to **that test
   project only**, with: Database (Read-write), Edge Functions (Read-write), Edge Function Secrets (Read-write),
   API Keys (Read), API Key Secrets (Read). Set a short expiry.
3. **Run** `node ~/K-Labs-Stripe-Test/q40-test-setup.mjs` in Terminal. It asks (hidden) for the test project reference,
   the token and the Stripe sandbox secret key; refuses the live project and live keys; asks you to type the project
   name; applies the schema; deploys the three functions; creates the sandbox webhook (8 events) and stores its secret
   directly; sets the function secrets; stores the sandbox key and the test project's secret key in your Keychain.
4. **End-to-end test:** `node ~/K-Labs-Stripe-Test/q40-e2e.mjs` (Stripe test clocks; synthetic accounts and test cards).

Webhook events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.created`,
`invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.
