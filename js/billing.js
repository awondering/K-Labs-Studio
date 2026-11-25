// Q40: Studio subscription interface (subscribe, manage billing, subscription status).
// Payment status is NEVER taken from the browser: Studio only opens when the server's entitlement says so, and the
// server only grants it from a verified Stripe webhook. This file only starts Stripe Checkout / the Customer Portal
// (through the billing-checkout and billing-portal Edge Functions) and describes the account's own subscription row.
(function () {
  const PLANS = Object.freeze({
    nzd: Object.freeze({ symbol: "NZ$", monthly: 34, annual: 299 }),
    usd: Object.freeze({ symbol: "US$", monthly: 19, annual: 169 })
  });
  // Stripe-hosted pages only; anything else returned by the server is refused.
  const CHECKOUT_ORIGIN = "https://checkout.stripe.com";
  const PORTAL_ORIGIN = "https://billing.stripe.com";
  const LIVE_STATUSES = ["active", "past_due", "trialing"];
  let currency = "nzd";
  let busy = false;

  const client = () => window.KLABS_SUPABASE_CLIENT;

  function formatDate(iso) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
  }
  function price(currencyCode, plan) {
    const p = PLANS[currencyCode];
    return p ? `${p.symbol}${p[plan]}` : "";
  }
  function planLabel(sub) {
    if (!PLANS[sub?.currency] || !["monthly", "annual"].includes(sub?.plan)) return "Subscription";
    return `${price(sub.currency, sub.plan)} ${sub.plan === "annual" ? "per year" : "per month"}`;
  }

  // The signed-in account's own subscription row (row-level security returns only this account's row).
  async function loadSubscription() {
    const { data, error } = await client().from("billing_subscriptions")
      .select("status, plan, currency, paid_through, cancel_at_period_end, renewal_state, stripe_customer_id")
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  function hasLiveSubscription(sub) {
    return !!sub && LIVE_STATUSES.includes(sub.status);
  }

  // Customer-facing description. Access itself is decided only by the server.
  function describe(sub, access) {
    const state = access?.access_state;
    if (hasLiveSubscription(sub)) {
      const plan = planLabel(sub);
      if (sub.renewal_state === "failed") {
        return `${plan}. Your renewal payment did not go through. Update your card in Manage billing; access returns as soon as Stripe confirms payment.`;
      }
      if (sub.renewal_state === "action_required") {
        return `${plan}. Your bank needs you to confirm the renewal payment. Use the link in Stripe's email, or update your card in Manage billing.`;
      }
      if (sub.renewal_state === "pending") return `${plan}. Confirming your renewal payment with Stripe…`;
      if (sub.paid_through && access?.can_write) {
        return sub.cancel_at_period_end
          ? `${plan}. Cancelled — access continues until ${formatDate(sub.paid_through)}, then ends.`
          : `${plan}. Renews automatically on ${formatDate(sub.paid_through)}.`;
      }
      return `${plan}. Waiting for Stripe to confirm payment.`;
    }
    if (state === "grandfathered") return "Owner-granted access with no end date.";
    if (state === "complimentary") {
      return access.access_expires_at ? `Complimentary access until ${formatDate(access.access_expires_at)}.` : "Complimentary access.";
    }
    if (state === "trial" && access?.can_write) {
      return `Your trial ends ${formatDate(access.trial_expires_at)}. Subscribe to keep working in Studio after it ends.`;
    }
    if (sub?.status) return "Your subscription has ended. Subscribe again to continue — your records are kept safely and return as soon as payment is confirmed.";
    if (state === "expired") return "Your Studio access has ended. Subscribe to continue — your records are kept safely and return as soon as payment is confirmed.";
    return "Subscribe to start working in Studio. Explore Mode stays free.";
  }

  async function invoke(name, body) {
    const { data, error } = await client().functions.invoke(name, { body: body || {} });
    if (error) {
      let message = "";
      try { message = (await error.context?.json?.())?.error || ""; } catch { message = ""; }
      throw new Error(message || "The billing service could not be reached. Check your connection and try again.");
    }
    return data;
  }
  function goTo(url, origin) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("Billing returned an invalid address. Please try again."); }
    if (parsed.origin !== origin) throw new Error("Billing returned an unexpected address. Please try again.");
    window.location.assign(parsed.href);
  }
  async function startCheckout(plan) {
    if (!["monthly", "annual"].includes(plan)) throw new Error("Choose a monthly or annual plan.");
    const data = await invoke("billing-checkout", { plan, currency });
    goTo(data?.url, CHECKOUT_ORIGIN);
  }
  async function openPortal() {
    const data = await invoke("billing-portal");
    goTo(data?.url, PORTAL_ORIGIN);
  }

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === "className") node.className = value;
      else node.setAttribute(key, value);
    });
    if (text) node.textContent = text;
    return node;
  }

  // Draws the subscription panel into `container`: status, plan choice (NZD/USD, monthly/annual) when there is no
  // live subscription, and Manage billing once the account has a Stripe customer.
  // `quiet`: on the access screen the heading already says "subscribe" / "access has ended", so the status line is
  // shown there only when it adds something (a live subscription's payment state, a trial or an owner grant).
  function render(container, { sub, access, showPlans = true, quiet = false } = {}) {
    if (!container) return;
    container.replaceChildren();
    container.classList.add("billing-panel");
    const status = el("p", { className: "billing-status", "data-billing-status": "" }, describe(sub, access));
    if (quiet && !hasLiveSubscription(sub) && !["trial", "grandfathered", "complimentary"].includes(access?.access_state)) status.hidden = true;
    container.appendChild(status);
    const error = el("p", { className: "billing-error", role: "alert", "aria-live": "polite" });
    const run = async (button, action) => {
      if (busy) return;
      busy = true;
      button.disabled = true;
      error.textContent = "";
      const label = button.textContent;
      button.textContent = "OPENING STRIPE…";
      try {
        await action();
      } catch (problem) {
        error.textContent = problem?.message || "Billing could not open. Please try again.";
        button.textContent = label;
        button.disabled = false;
      } finally {
        busy = false;
      }
    };
    const ownerGrant = ["grandfathered"].includes(access?.access_state) || (access?.access_state === "complimentary" && !access.access_expires_at);
    if (showPlans && !hasLiveSubscription(sub) && !ownerGrant) {
      const plans = el("div", { className: "billing-plans" });
      const toggle = el("div", { className: "billing-currency", role: "group", "aria-label": "Currency" });
      const buttons = [];
      const monthly = el("button", { type: "button", className: "account-access-primary billing-plan", "data-billing-plan": "monthly" });
      const annual = el("button", { type: "button", className: "account-access-primary billing-plan", "data-billing-plan": "annual" });
      const label = () => {
        monthly.textContent = `SUBSCRIBE · ${price(currency, "monthly")} / MONTH`;
        annual.textContent = `SUBSCRIBE · ${price(currency, "annual")} / YEAR`;
        buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.billingCurrency === currency)));
      };
      ["nzd", "usd"].forEach((code) => {
        const b = el("button", { type: "button", className: "billing-currency__option", "data-billing-currency": code }, code.toUpperCase());
        b.addEventListener("click", () => { currency = code; label(); });
        buttons.push(b);
        toggle.appendChild(b);
      });
      monthly.addEventListener("click", () => run(monthly, () => startCheckout("monthly")));
      annual.addEventListener("click", () => run(annual, () => startCheckout("annual")));
      label();
      plans.append(toggle, monthly, annual, el("p", { className: "account-access-detail" },
        "Renews automatically. Cancel any time and keep access to the end of the period you have paid for. Payment is by card through Stripe."));
      container.appendChild(plans);
    }
    if (sub?.stripe_customer_id) {
      const manage = el("button", { type: "button", className: "account-access-secondary billing-manage", "data-billing-manage": "" }, "MANAGE BILLING");
      manage.addEventListener("click", () => run(manage, openPortal));
      container.appendChild(manage);
    }
    container.appendChild(error);
  }

  // After Stripe Checkout returns, wait for the SERVER to confirm access (the webhook), never the browser.
  async function waitForAccess(fetchEntitlement, { timeoutMs = 90000, intervalMs = 2000, wait = (ms) => new Promise((r) => window.setTimeout(r, ms)) } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const access = await fetchEntitlement();
        if (access?.can_write === true) return access;
      } catch (problem) {
        console.warn("[K-Labs Studio] Could not check subscription access yet:", problem);
      }
      if (Date.now() + intervalMs > deadline) return null;
      await wait(intervalMs);
    }
  }

  window.KLABS_BILLING = { PLANS, loadSubscription, describe, render, startCheckout, openPortal, waitForAccess, hasLiveSubscription,
    setCurrency(code) { if (PLANS[code]) currency = code; } };
})();
