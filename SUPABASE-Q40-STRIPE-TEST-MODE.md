# Q40 Stage A — Stripe subscriptions (server side), TEST MODE

Status: implemented and tested locally only. Nothing is deployed, no database (production or other) has been changed, and no Stripe object exists yet. **No real payment can be taken by anything in this stage.**

## What Stage A contains
| File | Purpose |
|---|---|
| `supabase/migrations/20261126000000_q40_stripe_subscriptions.sql` | Additive. It creates two tables and one function, described below. Existing accounts, the trial, the read and write guards and every record are unchanged. |
| `supabase/functions/_shared/billing-core.mjs` | Testable core: Stripe signature check (HMAC-SHA256, 5-minute tolerance), a minimal Stripe REST client (pinned API version `2024-06-20`), and the three request handlers. |
| `supabase/functions/stripe-webhook/index.ts` | Receives Stripe events. **Deploy with JWT verification OFF.** Stripe signs each request, and the signature is checked. |
| `supabase/functions/billing-checkout/index.ts` | Signed-in, verified user to a Checkout Session for `monthly`/`annual` × `nzd`/`usd`. Deploy with JWT verification ON. |
| `supabase/functions/billing-portal/index.ts` | Signed-in user to the Stripe Customer Portal. Deploy with JWT verification ON. |

**The migration's tables and function:**
- `billing_subscriptions`: each account sees only its own row; only the server writes to it.
- `stripe_events`: each event is applied once, with an outcome log.
- `klabs_apply_stripe_subscription`: only `service_role` may call it.

**Security properties (tested):**
- **Access is granted only by a verified webhook,** after the subscription is re-read from Stripe. The browser's "payment successful" page is never trusted.
- **Only an exact approved Price can grant access:** NZD 34.00/month, NZD 299.00/year, USD 19.00/month or USD 169.00/year. Checkout refuses any configured price whose amount, currency, interval, mode or active flag differs.
- **No secret is in the repository.** Keys, the webhook secret and price IDs come only from Edge Function secrets.
- **One Stripe customer per account,** and no second live subscription.
- **Test-mode keys accept only test-mode events,** and live keys only live events.

**Access rules:**
- **Active:** paid until the period end + 24 h. The grace allows for the renewal payment to arrive.
- **Cancelled at period end:** paid until exactly the period end.
- **past_due:** paid only until the previous period end + 24 h. A failed renewal never gives a free new period.
- **canceled / unpaid / paused / incomplete_expired:** locked.
- **Owner grants** (complimentary, grandfathered) that last longer are never shortened.
- **Records are never deleted.**

Not in Stage A (Stage B, together with the app):
- the subscribe, renew and manage-billing screens;
- retiring the trial;
- the server-side **read** lock at expiry;
- closing the app at expiry before reads are refused.

The read lock must not ship before the app changes, or open devices could misread "no rows" as deletions.

## Tests
- `tests/billing-core.test.cjs`: 14 unit tests (signatures, Stripe client, webhook, checkout, portal, no secrets committed).
- `tests/q40-stripe-subscriptions-isolated.cjs`: 24 checks. It runs the real production schema plus this migration in PGlite, then the real webhook core end to end with signed synthetic events.

## What the owner must do next (nothing here costs money)
**1. Stripe test mode** (Dashboard, test mode / sandbox; no live activation needed):
- Product "K-Labs Studio" with four **recurring** Prices, using these exact amounts:
  - NZD 34.00 monthly;
  - NZD 299.00 yearly;
  - USD 19.00 monthly;
  - USD 169.00 yearly.
- **Settings → Adaptive Pricing: OFF.** Customers then see and pay the fixed price.
- **Customer Portal:**
  - on: update payment method, invoice history, cancel subscriptions **at end of billing period**;
  - off: plan switching and pausing.
- **Subscriptions → manage failed payments:**
  - Smart Retries on (default);
  - **after all retries fail: cancel the subscription**;
  - customer emails on for failed payments and receipts.
- Send Claude the four **price IDs** (`price_…`). They are not secret. **Never send the secret key (`sk_test_…`) or webhook secret (`whsec_…`) in chat.**

**2. Where to run the test-mode functions** (decision needed). Deploying to the production Supabase project would change production, which is out of scope. The options are:
- **(Recommended)** a separate **free** Supabase project, e.g. "klabs-studio-test" (the Free plan allows two projects), used only for test mode;
- or local Supabase, which needs Docker, the Supabase CLI and more set-up.

**3. Tools** (free; install approval needed):
- the Supabase CLI, to deploy functions and apply migrations to the test project;
- the Stripe CLI (optional), for test clocks that simulate renewals and failed payments quickly.

**4. Secrets, entered by the owner** in the TEST project → Edge Functions → Secrets:
- `STRIPE_SECRET_KEY` (sk_test_…);
- `STRIPE_WEBHOOK_SECRET` (whsec_…, from step 5);
- `STRIPE_PRICE_NZD_MONTHLY`, `STRIPE_PRICE_NZD_ANNUAL`, `STRIPE_PRICE_USD_MONTHLY`, `STRIPE_PRICE_USD_ANNUAL`;
- `PUBLIC_APP_URL`;
- optional `BILLING_GRACE_HOURS` (default 24).

**5. Stripe test webhook:** an endpoint at the test project's `…/functions/v1/stripe-webhook` with these events:
- `checkout.session.completed`;
- `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`;
- `invoice.paid`, `invoice.payment_failed`.
