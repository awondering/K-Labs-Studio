// Q40 Stage A: unit tests for supabase/functions/_shared/billing-core.mjs with fake Stripe and Supabase clients.
// No network, no Stripe account, no keys: every Stripe response is synthetic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const load = () => import(path.join(root, 'supabase/functions/_shared/billing-core.mjs'));
const SECRET = 'whsec_unit_test_only';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PRICES = { nzd: { monthly: 'price_nzdM', annual: 'price_nzdA' }, usd: { monthly: 'price_usdM', annual: 'price_usdA' } };
const NOW = new Date('2026-12-01T00:00:00Z');
const quiet = { error() {}, warn() {}, log() {} };

async function signed(core, body, { secret = SECRET, at = NOW } = {}) {
  const payload = JSON.stringify(body);
  const t = Math.floor(at.getTime() / 1000);
  const sig = await core.stripeSignature(payload, t, secret);
  return new Request('https://x.test/stripe-webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}` }, body: payload });
}
function subscription(over = {}) {
  return {
    id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { user_id: USER }, cancel_at_period_end: false,
    current_period_start: Date.parse('2026-12-01T00:00:00Z') / 1000, current_period_end: Date.parse('2027-01-01T00:00:00Z') / 1000,
    items: { data: [{ price: { id: 'price_nzdM', currency: 'nzd', recurring: { interval: 'month' } } }] }, latest_invoice: { id: 'in_1', status: 'paid' }, ...over,
  };
}
function fakeStripe(over = {}) {
  const calls = [];
  return {
    calls, testMode: true,
    getSubscription: async (id) => { calls.push(['getSubscription', id]); return over.subscription || subscription({ id }); },
    getPrice: async (id) => { calls.push(['getPrice', id]); return over.price ? over.price(id) : priceFor(id); },
    createCustomer: async (params, key) => { calls.push(['createCustomer', params, key]); return { id: 'cus_new' }; },
    createCheckoutSession: async (params) => { calls.push(['createCheckoutSession', params]); return { url: 'https://checkout.stripe.test/s' }; },
    createPortalSession: async (params) => { calls.push(['createPortalSession', params]); return { url: 'https://billing.stripe.test/p' }; },
  };
}
function priceFor(id) {
  const table = { price_nzdM: ['nzd', 3400, 'month'], price_nzdA: ['nzd', 29900, 'year'], price_usdM: ['usd', 1900, 'month'], price_usdA: ['usd', 16900, 'year'] };
  const [currency, unit_amount, interval] = table[id];
  return { id, active: true, type: 'recurring', currency, unit_amount, recurring: { interval, interval_count: 1 }, livemode: false };
}
function fakeService({ row = null, customerOwner = null, rpcResult = { result: 'access_granted' }, rpcError = null } = {}) {
  const calls = [];
  const client = {
    calls,
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return rpcError ? { data: null, error: { message: rpcError } } : { data: rpcResult, error: null }; },
    from: (table) => {
      const q = { filters: [] };
      const api = {
        select: () => api,
        eq: (c, v) => { q.filters.push([c, v]); return api; },
        maybeSingle: async () => {
          calls.push(['select', table, q.filters]);
          if (q.filters[0][0] === 'stripe_customer_id') return { data: customerOwner ? { user_id: customerOwner } : null, error: null };
          return { data: row, error: null };
        },
        upsert: async (values, opts) => { calls.push(['upsert', table, values, opts]); row = { ...(row || {}), ...values }; return { error: null }; },
      };
      return api;
    },
  };
  return client;
}
const userClient = (user) => () => ({ auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: null, error: { message: 'bad' } }) } });
const VERIFIED = { id: USER, email: 'builder@example.test', email_confirmed_at: '2026-11-01T00:00:00Z' };
const post = (body, auth = 'Bearer token') => new Request('https://x.test/fn', { method: 'POST', headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body) });

test('signature: valid, tampered, wrong secret, stale, future, extra signatures, missing, zero tolerance', async () => {
  const core = await load();
  const payload = '{"id":"evt_1"}';
  const t = Math.floor(NOW.getTime() / 1000);
  const good = await core.stripeSignature(payload, t, SECRET);
  const opts = { now: () => NOW };
  assert.equal(await core.verifyStripeSignature(payload, `t=${t},v1=${good}`, SECRET, opts), true);
  assert.equal(await core.verifyStripeSignature(payload + ' ', `t=${t},v1=${good}`, SECRET, opts), false);
  assert.equal(await core.verifyStripeSignature(payload, `t=${t},v1=${await core.stripeSignature(payload, t, 'whsec_other')}`, SECRET, opts), false);
  assert.equal(await core.verifyStripeSignature(payload, `t=${t - 301},v1=${await core.stripeSignature(payload, t - 301, SECRET)}`, SECRET, opts), false);
  assert.equal(await core.verifyStripeSignature(payload, `t=${t + 301},v1=${await core.stripeSignature(payload, t + 301, SECRET)}`, SECRET, opts), false);
  assert.equal(await core.verifyStripeSignature(payload, `t=${t},v1=${'0'.repeat(64)},v1=${good},v0=abc`, SECRET, opts), true);
  assert.equal(await core.verifyStripeSignature(payload, '', SECRET, opts), false);
  assert.equal(await core.verifyStripeSignature(payload, `v1=${good}`, SECRET, opts), false);
  await assert.rejects(core.verifyStripeSignature(payload, `t=${t},v1=${good}`, SECRET, { ...opts, toleranceSeconds: 0 }));
  await assert.rejects(core.verifyStripeSignature(payload, `t=${t},v1=${good}`, '', opts));
});

test('Stripe client: refuses non-secret keys, pins the API version, sends idempotency keys, never echoes the key', async () => {
  const core = await load();
  assert.throws(() => core.createStripeApi({ secretKey: 'pk_test_abc' }));
  assert.throws(() => core.createStripeApi({ secretKey: '' }));
  const seen = [];
  const api = core.createStripeApi({ secretKey: 'sk_test_SECRETVALUE', fetchImpl: async (url, init) => { seen.push({ url, init }); return { ok: false, status: 402, json: async () => ({ error: { message: 'card declined' } }) }; } });
  assert.equal(api.testMode, true);
  const err = await api.createCustomer({ email: 'a@b.test', metadata: { user_id: USER } }, 'klabs-customer-x').catch((e) => e);
  assert.match(err.message, /POST \/customers failed \(402\): card declined/);
  assert.ok(!err.message.includes('SECRETVALUE'));
  assert.equal(seen[0].init.headers['Stripe-Version'], core.STRIPE_API_VERSION);
  assert.equal(seen[0].init.headers['Idempotency-Key'], 'klabs-customer-x');
  assert.equal(seen[0].init.body, `email=a%40b.test&metadata%5Buser_id%5D=${USER}`);
  assert.equal(core.formEncode({ line_items: [{ price: 'p', quantity: 1 }], subscription_data: { metadata: { user_id: 'u' } } }).toString(),
    'line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=1&subscription_data%5Bmetadata%5D%5Buser_id%5D=u');
});

test('subscription facts read the period from the subscription or (newer API) its item', async () => {
  const core = await load();
  const f = core.subscriptionFacts(subscription({ customer: { id: 'cus_obj' } }));
  assert.deepEqual([f.customerId, f.plan, f.currency, f.periodStart, f.periodEnd, f.userId], ['cus_obj', 'monthly', 'nzd', '2026-12-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', USER]);
  const s = subscription(); const item = { ...s.items.data[0], current_period_start: s.current_period_start, current_period_end: s.current_period_end };
  delete s.current_period_start; delete s.current_period_end; s.items.data = [item];
  assert.equal(core.subscriptionFacts(s).periodEnd, '2027-01-01T00:00:00.000Z');
});

test('price configuration must be complete and well formed', async () => {
  const core = await load();
  const env = (name) => ({ STRIPE_PRICE_NZD_MONTHLY: 'price_a', STRIPE_PRICE_NZD_ANNUAL: 'price_b', STRIPE_PRICE_USD_MONTHLY: 'price_c', STRIPE_PRICE_USD_ANNUAL: 'price_d' })[name];
  assert.deepEqual(core.readPriceConfig(env), { nzd: { monthly: 'price_a', annual: 'price_b' }, usd: { monthly: 'price_c', annual: 'price_d' } });
  assert.throws(() => core.readPriceConfig((n) => (n === 'STRIPE_PRICE_USD_ANNUAL' ? '' : env(n))), /STRIPE_PRICE_USD_ANNUAL/);
  assert.deepEqual(core.PLAN_AMOUNTS, { nzd: { monthly: 3400, annual: 29900 }, usd: { monthly: 1900, annual: 16900 } });
});

test('webhook: unsigned or mis-signed requests change nothing', async () => {
  const core = await load();
  const stripe = fakeStripe(); const svc = fakeService();
  const handler = core.createStripeWebhookHandler({ serviceClient: svc, stripe, webhookSecret: SECRET, prices: PRICES, now: () => NOW, log: quiet });
  const body = { id: 'evt_1', type: 'customer.subscription.updated', livemode: false, data: { object: { id: 'sub_1' } } };
  assert.equal((await handler(new Request('https://x.test', { method: 'POST', body: JSON.stringify(body) }))).status, 400);
  assert.equal((await handler(await signed(core, body, { secret: 'whsec_wrong' }))).status, 400);
  assert.equal((await handler(await signed(core, body, { at: new Date(NOW.getTime() - 600000) }))).status, 400);
  assert.equal((await handler(new Request('https://x.test', { method: 'GET' }))).status, 405);
  assert.deepEqual([stripe.calls, svc.calls], [[], []]);
});

test('webhook: a verified event re-reads the subscription (with its latest invoice) from Stripe and applies it, no grace', async () => {
  const core = await load();
  const stripe = fakeStripe(); const svc = fakeService();
  const handler = core.createStripeWebhookHandler({ serviceClient: svc, stripe, webhookSecret: SECRET, prices: PRICES, now: () => NOW, log: quiet });
  // The event body claims "canceled"; Stripe's current state (active) is what is applied.
  const res = await handler(await signed(core, { id: 'evt_2', type: 'customer.subscription.updated', livemode: false, data: { object: { id: 'sub_1', status: 'canceled' } } }));
  assert.equal(res.status, 200);
  assert.deepEqual(stripe.calls, [['getSubscription', 'sub_1']]);
  const [, name, args] = svc.calls.find((c) => c[0] === 'rpc');
  assert.equal(name, 'klabs_apply_stripe_subscription');
  assert.deepEqual(args, { p_event_id: 'evt_2', p_event_type: 'customer.subscription.updated', p_user_id: USER, p_customer_id: 'cus_1', p_subscription_id: 'sub_1',
    p_status: 'active', p_plan: 'monthly', p_currency: 'nzd', p_period_start: '2026-12-01T00:00:00.000Z', p_period_end: '2027-01-01T00:00:00.000Z',
    p_cancel_at_period_end: false, p_latest_invoice_paid: true });
});

test('webhook: checkout, invoices (old and new shape), ignored types, user lookup by customer', async () => {
  const core = await load();
  const run = async (body, opts = {}) => {
    const stripe = fakeStripe(opts.stripe); const svc = fakeService(opts.svc);
    const handler = core.createStripeWebhookHandler({ serviceClient: svc, stripe, webhookSecret: SECRET, prices: PRICES, now: () => NOW, log: quiet });
    const res = await handler(await signed(core, { livemode: false, ...body }));
    return { status: res.status, json: await res.json(), stripe, svc, rpc: svc.calls.find((c) => c[0] === 'rpc') };
  };
  const checkout = await run({ id: 'evt_c', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_9', client_reference_id: USER } } });
  assert.equal(checkout.rpc[2].p_subscription_id, 'sub_9');
  const mismatch = await run({ id: 'evt_m', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_9', client_reference_id: OTHER } } });
  assert.deepEqual([mismatch.json.result, mismatch.rpc], ['account_mismatch', undefined]);
  const payment = await run({ id: 'evt_p', type: 'checkout.session.completed', data: { object: { mode: 'payment' } } });
  assert.deepEqual([payment.json.result, payment.stripe.calls.length], ['no_subscription', 0]);
  const invoiceOld = await run({ id: 'evt_i', type: 'invoice.payment_failed', data: { object: { subscription: 'sub_3' } } });
  assert.equal(invoiceOld.rpc[2].p_subscription_id, 'sub_3');
  const invoiceNew = await run({ id: 'evt_j', type: 'invoice.paid', data: { object: { parent: { subscription_details: { subscription: 'sub_4' } } } } });
  assert.equal(invoiceNew.rpc[2].p_subscription_id, 'sub_4');
  const ignored = await run({ id: 'evt_x', type: 'charge.succeeded', data: { object: {} } });
  assert.deepEqual([ignored.status, ignored.json.result, ignored.stripe.calls.length], [200, 'ignored', 0]);
  const lookup = await run({ id: 'evt_l', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } },
    { stripe: { subscription: subscription({ metadata: {}, status: 'canceled' }) }, svc: { customerOwner: OTHER } });
  assert.deepEqual([lookup.rpc[2].p_user_id, lookup.rpc[2].p_status], [OTHER, 'canceled']);
});

test('webhook: non-Studio prices, multi-item subscriptions and live-mode events grant nothing; database errors ask Stripe to retry', async () => {
  const core = await load();
  const run = async (opts = {}, body = {}) => {
    const stripe = { ...fakeStripe(opts.stripe), ...(opts.testMode === false ? { testMode: false } : {}) }; const svc = fakeService(opts.svc);
    const handler = core.createStripeWebhookHandler({ serviceClient: svc, stripe, webhookSecret: SECRET, prices: PRICES, now: () => NOW, log: quiet });
    const res = await handler(await signed(core, { id: 'evt_q', type: 'customer.subscription.updated', livemode: false, data: { object: { id: 'sub_1' } }, ...body }));
    return { status: res.status, json: await res.json(), rpc: svc.calls.find((c) => c[0] === 'rpc') };
  };
  const foreign = await run({ stripe: { subscription: subscription({ items: { data: [{ price: { id: 'price_other', currency: 'nzd', recurring: { interval: 'month' } } }] } }) } });
  assert.deepEqual([foreign.json.result, foreign.rpc], ['unrecognised_price', undefined]);
  const twoItems = await run({ stripe: { subscription: subscription({ items: { data: [subscription().items.data[0], subscription().items.data[0]] } }) } });
  assert.deepEqual([twoItems.json.result, twoItems.rpc], ['unrecognised_price', undefined]);
  const live = await run({}, { livemode: true });
  assert.deepEqual([live.status, live.rpc], [400, undefined]);
  const failing = await run({ svc: { rpcError: 'database unavailable' } });
  assert.equal(failing.status, 500);
});

test('checkout: requires sign-in and a verified email; validates plan and currency', async () => {
  const core = await load();
  const make = (user) => core.createCheckoutHandler({ createUserClient: userClient(user), serviceClient: fakeService(), stripe: fakeStripe(), prices: PRICES, publicAppUrl: 'https://studio.klabs.co.nz', log: quiet });
  assert.equal((await make(VERIFIED)(post({ plan: 'monthly', currency: 'nzd' }, null))).status, 401);
  assert.equal((await make(null)(post({ plan: 'monthly', currency: 'nzd' }))).status, 401);
  assert.equal((await make({ ...VERIFIED, email_confirmed_at: null })(post({ plan: 'monthly', currency: 'nzd' }))).status, 403);
  for (const body of [{ plan: 'weekly', currency: 'nzd' }, { plan: 'monthly', currency: 'aud' }, {}, { plan: 'monthly' }]) {
    assert.equal((await make(VERIFIED)(post(body))).status, 400, JSON.stringify(body));
  }
  assert.throws(() => core.createCheckoutHandler({ createUserClient: userClient(VERIFIED), serviceClient: fakeService(), stripe: fakeStripe(), prices: PRICES, publicAppUrl: 'http://studio.example' }));
});

test('checkout: refuses a second live subscription; refuses a misconfigured price', async () => {
  const core = await load();
  for (const status of ['active', 'past_due', 'trialing']) {
    const stripe = fakeStripe();
    const handler = core.createCheckoutHandler({ createUserClient: userClient(VERIFIED), serviceClient: fakeService({ row: { stripe_customer_id: 'cus_1', status } }), stripe, prices: PRICES, publicAppUrl: 'https://studio.klabs.co.nz', log: quiet });
    const res = await handler(post({ plan: 'monthly', currency: 'nzd' }));
    assert.equal(res.status, 409, status);
    assert.equal((await res.json()).manage, true);
    assert.equal(stripe.calls.length, 0);
  }
  const wrong = [(p) => ({ ...p, unit_amount: 3500 }), (p) => ({ ...p, currency: 'usd' }), (p) => ({ ...p, recurring: { interval: 'year' } }),
    (p) => ({ ...p, active: false }), (p) => ({ ...p, livemode: true }), (p) => ({ ...p, recurring: { interval: 'month', interval_count: 3 } }), (p) => ({ ...p, type: 'one_time' })];
  for (const change of wrong) {
    const stripe = fakeStripe({ price: (id) => change(priceFor(id)) });
    const handler = core.createCheckoutHandler({ createUserClient: userClient(VERIFIED), serviceClient: fakeService(), stripe, prices: PRICES, publicAppUrl: 'https://studio.klabs.co.nz', log: quiet });
    assert.equal((await handler(post({ plan: 'monthly', currency: 'nzd' }))).status, 503);
    assert.ok(!stripe.calls.some((c) => c[0] === 'createCheckoutSession'));
  }
});

test('checkout: new customer (idempotent) and fixed-currency session tied to the account', async () => {
  const core = await load();
  const stripe = fakeStripe(); const svc = fakeService();
  const handler = core.createCheckoutHandler({ createUserClient: userClient(VERIFIED), serviceClient: svc, stripe, prices: PRICES, publicAppUrl: 'https://studio.klabs.co.nz/', log: quiet });
  const res = await handler(post({ plan: 'annual', currency: 'USD' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: 'https://checkout.stripe.test/s' });
  assert.deepEqual(stripe.calls.find((c) => c[0] === 'getPrice'), ['getPrice', 'price_usdA']);
  assert.deepEqual(stripe.calls.find((c) => c[0] === 'createCustomer'), ['createCustomer', { email: 'builder@example.test', metadata: { user_id: USER } }, `klabs-customer-${USER}`]);
  assert.deepEqual(svc.calls.find((c) => c[0] === 'upsert'), ['upsert', 'billing_subscriptions', { user_id: USER, stripe_customer_id: 'cus_new' }, { onConflict: 'user_id', ignoreDuplicates: true }]);
  assert.deepEqual(stripe.calls.find((c) => c[0] === 'createCheckoutSession')[1], {
    mode: 'subscription', customer: 'cus_new', client_reference_id: USER, line_items: [{ price: 'price_usdA', quantity: 1 }],
    subscription_data: { metadata: { user_id: USER } }, metadata: { user_id: USER },
    success_url: 'https://studio.klabs.co.nz/?checkout=success', cancel_url: 'https://studio.klabs.co.nz/?checkout=cancelled',
  });
});

test('checkout: an ended subscription reuses its Stripe customer (reactivation)', async () => {
  const core = await load();
  const stripe = fakeStripe();
  const handler = core.createCheckoutHandler({ createUserClient: userClient(VERIFIED), serviceClient: fakeService({ row: { stripe_customer_id: 'cus_old', status: 'canceled' } }), stripe, prices: PRICES, publicAppUrl: 'https://studio.klabs.co.nz', log: quiet });
  assert.equal((await handler(post({ plan: 'monthly', currency: 'nzd' }))).status, 200);
  assert.ok(!stripe.calls.some((c) => c[0] === 'createCustomer'));
  assert.equal(stripe.calls.find((c) => c[0] === 'createCheckoutSession')[1].customer, 'cus_old');
});

test('portal: only for the signed-in account with a billing customer', async () => {
  const core = await load();
  const make = (row, user = VERIFIED) => { const stripe = fakeStripe(); return { stripe, h: core.createPortalHandler({ createUserClient: userClient(user), serviceClient: fakeService({ row }), stripe, publicAppUrl: 'https://studio.klabs.co.nz', log: quiet }) }; };
  assert.equal((await make(null).h(post({}, null))).status, 401);
  assert.equal((await make(null).h(post({}))).status, 404);
  const { stripe, h } = make({ stripe_customer_id: 'cus_1' });
  const res = await h(post({}));
  assert.deepEqual([res.status, await res.json()], [200, { url: 'https://billing.stripe.test/p' }]);
  assert.deepEqual(stripe.calls[0], ['createPortalSession', { customer: 'cus_1', return_url: 'https://studio.klabs.co.nz/?billing=return' }]);
});

test('no Stripe secrets or price ids are committed; the browser app does not call Stripe', () => {
  const files = ['supabase/functions/_shared/billing-core.mjs', 'supabase/functions/stripe-webhook/index.ts', 'supabase/functions/billing-checkout/index.ts',
    'supabase/functions/billing-portal/index.ts', 'supabase/migrations/20261126000000_q40_stripe_subscriptions.sql'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(text, /sk_(test|live)_[A-Za-z0-9]{8,}|rk_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|price_[A-Za-z0-9]{10,}/, f);
  }
  const app = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
  assert.doesNotMatch(app, /api\.stripe\.com|sk_(test|live)_/);
});

test('no grace: only a PAID latest invoice confirms the current period', async () => {
  const core = await load();
  assert.equal(core.subscriptionFacts(subscription()).latestInvoicePaid, true);
  for (const latest of [{ status: 'draft' }, { status: 'open' }, { status: 'void' }, { status: 'uncollectible' }, 'in_unexpanded', null, undefined]) {
    assert.equal(core.subscriptionFacts(subscription({ latest_invoice: latest })).latestInvoicePaid, false, JSON.stringify(latest));
  }
  // The webhook passes it through, so a renewal waiting for payment does not extend access.
  const stripe = fakeStripe({ subscription: subscription({ latest_invoice: { status: 'open' } }) }); const svc = fakeService();
  const handler = core.createStripeWebhookHandler({ serviceClient: svc, stripe, webhookSecret: SECRET, prices: PRICES, now: () => NOW, log: quiet });
  await handler(await signed(core, { id: 'evt_r', type: 'invoice.payment_failed', livemode: false, data: { object: { subscription: 'sub_1' } } }));
  assert.equal(svc.calls.find((c) => c[0] === 'rpc')[2].p_latest_invoice_paid, false);
  assert.ok(!('p_grace' in svc.calls.find((c) => c[0] === 'rpc')[2]));
});

test('the subscription is fetched from Stripe with its latest invoice expanded', async () => {
  const core = await load();
  const seen = [];
  const api = core.createStripeApi({ secretKey: 'sk_test_x', fetchImpl: async (url) => { seen.push(url); return { ok: true, status: 200, json: async () => ({ id: 'sub_1' }) }; } });
  await api.getSubscription('sub_1');
  assert.equal(seen[0], 'https://api.stripe.com/v1/subscriptions/sub_1?expand%5B%5D=latest_invoice');
});
