// Q40 Stage A: Stripe subscriptions for K-Labs Studio (server side). Shared, testable core of three Edge Functions:
//   billing-checkout  (signed-in user)  -> Stripe Checkout Session for a fixed-currency plan
//   stripe-webhook    (Stripe, signed)  -> verified events -> klabs_apply_stripe_subscription (service role)
//   billing-portal    (signed-in user)  -> Stripe Customer Portal session (card, invoices, cancel at period end)
// Studio access is only ever granted from a VERIFIED webhook, after the subscription is re-read from Stripe; the
// browser's checkout result is never trusted. Secret keys and price ids live only in Edge Function secrets.

export const PLAN_AMOUNTS = Object.freeze({
  nzd: Object.freeze({ monthly: 3400, annual: 29900 }),
  usd: Object.freeze({ monthly: 1900, annual: 16900 })
});
const PLAN_INTERVAL = Object.freeze({ monthly: "month", annual: "year" });
const INTERVAL_PLAN = Object.freeze({ month: "monthly", year: "annual" });
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed"
]);
// Pinned so the subscription shape (current_period_start/end on the subscription) cannot change underneath us.
export const STRIPE_API_VERSION = "2024-06-20";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

// ---------- Stripe webhook signature (https://docs.stripe.com/webhooks#verify-manually) ----------
function hex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function stripeSignature(payload, timestamp, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`)));
}
export async function verifyStripeSignature(payload, header, secret, { toleranceSeconds = 300, now = () => new Date() } = {}) {
  if (typeof secret !== "string" || !secret) throw new Error("The webhook signing secret is not configured.");
  if (!(toleranceSeconds > 0)) throw new Error("A positive signature tolerance is required.");
  if (typeof header !== "string" || !header) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((s) => (s || "").trim());
    if (k === "t" && /^\d+$/.test(v)) timestamp = Number(v);
    if (k === "v1" && /^[0-9a-f]{64}$/.test(v)) signatures.push(v);
  }
  if (timestamp === null || !signatures.length) return false;
  if (Math.abs(now().getTime() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = await stripeSignature(payload, timestamp, secret);
  return signatures.some((s) => constantTimeEqual(s, expected));
}

// ---------- Minimal Stripe REST client (form-encoded; no SDK needed) ----------
export function formEncode(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) value.forEach((item, i) => (typeof item === "object" ? formEncode(item, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(item))));
    else if (typeof value === "object") formEncode(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}
export function createStripeApi({ secretKey, fetchImpl = fetch, apiVersion = STRIPE_API_VERSION }) {
  if (typeof secretKey !== "string" || !/^(sk|rk)_(test|live)_/.test(secretKey)) throw new Error("A Stripe secret key is not configured.");
  const call = async (method, path, params, idempotencyKey) => {
    const headers = { Authorization: `Bearer ${secretKey}`, "Stripe-Version": apiVersion };
    let body;
    if (params) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = formEncode(params).toString(); }
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    const res = await fetchImpl(`https://api.stripe.com/v1${path}`, { method, headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Stripe ${method} ${path.split("?")[0]} failed (${res.status}): ${data?.error?.message || "unknown error"}`);
    return data;
  };
  return {
    testMode: secretKey.includes("_test_"),
    // The latest invoice is expanded: only a PAID invoice confirms the current period (no grace).
    getSubscription: (id) => call("GET", `/subscriptions/${encodeURIComponent(id)}?expand%5B%5D=latest_invoice`),
    getPrice: (id) => call("GET", `/prices/${encodeURIComponent(id)}`),
    createCustomer: (params, idempotencyKey) => call("POST", "/customers", params, idempotencyKey),
    createCheckoutSession: (params) => call("POST", "/checkout/sessions", params),
    createPortalSession: (params) => call("POST", "/billing_portal/sessions", params)
  };
}

// ---------- Subscription facts ----------
const toIso = (seconds) => (Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null);
export function subscriptionFacts(subscription) {
  const item = subscription?.items?.data?.[0] || null;
  const price = item?.price || null;
  // Newer API versions move the period onto the subscription item; read either.
  const periodStart = subscription?.current_period_start ?? item?.current_period_start;
  const periodEnd = subscription?.current_period_end ?? item?.current_period_end;
  return {
    subscriptionId: subscription?.id || "",
    customerId: typeof subscription?.customer === "string" ? subscription.customer : subscription?.customer?.id || "",
    status: subscription?.status || "",
    userId: subscription?.metadata?.user_id || "",
    priceId: price?.id || "",
    plan: INTERVAL_PLAN[price?.recurring?.interval] || null,
    currency: (price?.currency || subscription?.currency || "").toLowerCase() || null,
    periodStart: toIso(periodStart),
    periodEnd: toIso(periodEnd),
    cancelAtPeriodEnd: subscription?.cancel_at_period_end === true,
    // Unexpanded (a bare id) or anything but "paid" counts as not paid.
    latestInvoicePaid: subscription?.latest_invoice?.status === "paid",
    itemCount: subscription?.items?.data?.length || 0
  };
}
function subscriptionIdOf(event) {
  const o = event?.data?.object || {};
  if (event.type === "checkout.session.completed") return o.mode === "subscription" && typeof o.subscription === "string" ? o.subscription : "";
  if (event.type.startsWith("customer.subscription.")) return o.id || "";
  if (event.type.startsWith("invoice.")) return o.subscription || o.parent?.subscription_details?.subscription || "";
  return "";
}

// Price ids configured in secrets: { nzd: { monthly, annual }, usd: { monthly, annual } }.
export function readPriceConfig(env) {
  const prices = {
    nzd: { monthly: env("STRIPE_PRICE_NZD_MONTHLY"), annual: env("STRIPE_PRICE_NZD_ANNUAL") },
    usd: { monthly: env("STRIPE_PRICE_USD_MONTHLY"), annual: env("STRIPE_PRICE_USD_ANNUAL") }
  };
  for (const currency of Object.keys(prices)) for (const plan of Object.keys(prices[currency])) {
    if (!/^price_[A-Za-z0-9]+$/.test(prices[currency][plan] || "")) throw new Error(`STRIPE_PRICE_${currency.toUpperCase()}_${plan.toUpperCase()} is not configured.`);
  }
  return prices;
}
function knownPrice(prices, priceId) {
  for (const currency of Object.keys(prices)) for (const plan of Object.keys(prices[currency])) {
    if (prices[currency][plan] === priceId) return { currency, plan };
  }
  return null;
}

// ---------- stripe-webhook ----------
export function createStripeWebhookHandler({ serviceClient, stripe, webhookSecret, prices, now = () => new Date(), log = console }) {
  return async function handleStripeWebhook(request) {
    if (request.method !== "POST") return response(405, { error: "Method not allowed." });
    const payload = await request.text();
    let verified = false;
    try {
      verified = await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), webhookSecret, { now });
    } catch (error) {
      log.error("[stripe-webhook] Signature check could not run:", error.message);
      return response(500, { error: "Webhook verification is not configured." });
    }
    if (!verified) return response(400, { error: "Invalid signature." });

    let event;
    try { event = JSON.parse(payload); } catch { return response(400, { error: "Invalid payload." }); }
    if (!event?.id || typeof event.type !== "string") return response(400, { error: "Invalid event." });
    if (!HANDLED_EVENTS.has(event.type)) return response(200, { received: true, result: "ignored" });
    if (stripe.testMode !== (event.livemode === false)) {
      log.error("[stripe-webhook] Event mode does not match the configured key:", event.id);
      return response(400, { error: "Event mode mismatch." });
    }

    const subscriptionId = subscriptionIdOf(event);
    if (!subscriptionId) return response(200, { received: true, result: "no_subscription" });

    try {
      // Always act on Stripe's current state, so duplicate or out-of-order events cannot leave stale access.
      const facts = subscriptionFacts(await stripe.getSubscription(subscriptionId));
      const known = facts.itemCount === 1 ? knownPrice(prices, facts.priceId) : null;
      if (!known) {
        log.warn("[stripe-webhook] Subscription is not a Studio plan:", subscriptionId);
        return response(200, { received: true, result: "unrecognised_price" });
      }
      let userId = facts.userId;
      const reference = event.type === "checkout.session.completed" ? event.data.object.client_reference_id : "";
      if (reference && userId && reference !== userId) {
        log.error("[stripe-webhook] Checkout reference does not match the subscription's account:", event.id);
        return response(200, { received: true, result: "account_mismatch" });
      }
      userId = userId || reference;
      if (!userId) {
        const { data } = await serviceClient.from("billing_subscriptions").select("user_id").eq("stripe_customer_id", facts.customerId).maybeSingle();
        userId = data?.user_id || "";
      }
      const { data, error } = await serviceClient.rpc("klabs_apply_stripe_subscription", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_user_id: userId || null,
        p_customer_id: facts.customerId,
        p_subscription_id: facts.subscriptionId,
        p_status: facts.status,
        p_plan: known.plan,
        p_currency: known.currency,
        p_period_start: facts.periodStart,
        p_period_end: facts.periodEnd,
        p_cancel_at_period_end: facts.cancelAtPeriodEnd,
        p_latest_invoice_paid: facts.latestInvoicePaid
      });
      if (error) throw new Error(error.message || "Access could not be updated.");
      return response(200, { received: true, result: data?.result || "applied" });
    } catch (error) {
      // 5xx: Stripe retries the event automatically.
      log.error("[stripe-webhook] Event could not be applied:", event.id, error.message);
      return response(500, { error: "Event could not be applied." });
    }
  };
}

// ---------- shared: the signed-in user ----------
async function signedInUser(request, createUserClient) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return { error: response(401, { error: "Sign in to continue." }) };
  try {
    const { data, error } = await createUserClient(authorization).auth.getUser();
    if (error || !data?.user?.id) return { error: response(401, { error: "The sign-in session could not be verified." }) };
    return { user: data.user };
  } catch (error) {
    console.error("[billing] Sign-in check failed:", error);
    return { error: response(503, { error: "Sign-in could not be verified. Try again." }) };
  }
}
function appUrl(publicAppUrl) {
  const url = new URL(publicAppUrl);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("PUBLIC_APP_URL must be https.");
  return url.origin;
}

// ---------- billing-checkout ----------
export function createCheckoutHandler({ createUserClient, serviceClient, stripe, prices, publicAppUrl, log = console }) {
  const origin = appUrl(publicAppUrl);
  return async function handleCheckout(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== "POST") return response(405, { error: "Method not allowed." });
    const { user, error: authError } = await signedInUser(request, createUserClient);
    if (authError) return authError;
    if (!user.email_confirmed_at || !user.email) return response(403, { error: "Verify your email address before subscribing." });

    let body;
    try { body = await request.json(); } catch { return response(400, { error: "Choose a plan and currency." }); }
    const plan = body?.plan;
    const currency = typeof body?.currency === "string" ? body.currency.toLowerCase() : "";
    if (!PLAN_AMOUNTS[currency] || !(plan in PLAN_AMOUNTS[currency])) return response(400, { error: "Choose a monthly or annual plan in NZD or USD." });

    try {
      const { data: existing, error: readError } = await serviceClient.from("billing_subscriptions")
        .select("stripe_customer_id, status").eq("user_id", user.id).maybeSingle();
      if (readError) throw new Error(readError.message);
      if (existing && LIVE_STATUSES.has(existing.status)) {
        return response(409, { error: "You already have a subscription. Use Manage billing to change it.", manage: true });
      }
      // The configured price must be exactly the approved plan: right currency, amount and interval, active, recurring.
      const price = await stripe.getPrice(prices[currency][plan]);
      if (!price?.active || price.type !== "recurring" || price.currency !== currency
        || price.unit_amount !== PLAN_AMOUNTS[currency][plan] || price.recurring?.interval !== PLAN_INTERVAL[plan]
        || (price.recurring?.interval_count ?? 1) !== 1 || price.livemode !== !stripe.testMode) {
        log.error("[billing-checkout] Configured price does not match the approved plan:", currency, plan);
        return response(503, { error: "Subscriptions are not available right now. Please try again later." });
      }
      let customerId = existing?.stripe_customer_id || "";
      if (!customerId) {
        const customer = await stripe.createCustomer({ email: user.email, metadata: { user_id: user.id } }, `klabs-customer-${user.id}`);
        customerId = customer.id;
        const { error: insertError } = await serviceClient.from("billing_subscriptions")
          .upsert({ user_id: user.id, stripe_customer_id: customerId }, { onConflict: "user_id", ignoreDuplicates: true });
        if (insertError) throw new Error(insertError.message);
        const { data: stored } = await serviceClient.from("billing_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
        customerId = stored?.stripe_customer_id || customerId;
      }
      const session = await stripe.createCheckoutSession({
        mode: "subscription",
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: price.id, quantity: 1 }],
        subscription_data: { metadata: { user_id: user.id } },
        metadata: { user_id: user.id },
        success_url: `${origin}/?checkout=success`,
        cancel_url: `${origin}/?checkout=cancelled`
      });
      if (!session?.url) throw new Error("Stripe returned no checkout URL.");
      return response(200, { url: session.url });
    } catch (error) {
      log.error("[billing-checkout] Checkout could not start:", error.message);
      return response(502, { error: "Checkout could not start. Please try again." });
    }
  };
}

// ---------- billing-portal ----------
export function createPortalHandler({ createUserClient, serviceClient, stripe, publicAppUrl, log = console }) {
  const origin = appUrl(publicAppUrl);
  return async function handlePortal(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== "POST") return response(405, { error: "Method not allowed." });
    const { user, error: authError } = await signedInUser(request, createUserClient);
    if (authError) return authError;
    try {
      const { data, error } = await serviceClient.from("billing_subscriptions").select("stripe_customer_id").eq("user_id", user.id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data?.stripe_customer_id) return response(404, { error: "There is no billing account yet. Subscribe first." });
      const session = await stripe.createPortalSession({ customer: data.stripe_customer_id, return_url: `${origin}/?billing=return` });
      if (!session?.url) throw new Error("Stripe returned no portal URL.");
      return response(200, { url: session.url });
    } catch (error) {
      log.error("[billing-portal] Portal could not open:", error.message);
      return response(502, { error: "Billing management could not open. Please try again." });
    }
  };
}
