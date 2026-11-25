// Q40 Stage A: the Stripe subscription migration against the REAL production schema (every setup script and migration,
// in order) in an in-memory PostgreSQL (PGlite), then the real stripe-webhook core end to end with signed synthetic
// Stripe events. Synthetic accounts only; no Stripe account, keys or network.
// Usage: PGLITE_MODULE=... node tests/q40-stripe-subscriptions-isolated.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
const ck = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
const root = path.join(__dirname, '..');
const sql = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const MIGRATION = 'supabase/migrations/20261126000000_q40_stripe_subscriptions.sql';
const U = {
  A: 'aaaaaaaa-0000-4000-8000-00000000000a', B: 'bbbbbbbb-0000-4000-8000-00000000000b', C: 'cccccccc-0000-4000-8000-00000000000c',
  G: 'dddddddd-0000-4000-8000-00000000000d', N: 'eeeeeeee-0000-4000-8000-00000000000e', X: 'ffffffff-0000-4000-8000-00000000000f',
};
const H = 3600 * 1000;

async function main() {
  if (!process.env.PGLITE_MODULE) throw new Error('Set PGLITE_MODULE.');
  const { PGlite } = require(process.env.PGLITE_MODULE);
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role bypassrls; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant usage on schema public to service_role;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now(),
      last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', banned_until timestamptz, deleted_at timestamptz);
  `);
  // An account that existed before entitlements (grandfathered by the backfill).
  await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${U.G}', 'g@example.test', now())`);
  const setup = ['SUPABASE-BUILD-SYNC.sql', 'SUPABASE-COMPONENT-SYNC.sql', 'SUPABASE-COMPONENT-SIZES.sql', 'SUPABASE-SETTINGS-SYNC.sql', 'SUPABASE-QUOTE-NUMBER-ALLOCATOR.sql'];
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`).filter((f) => f !== MIGRATION);
  for (const f of [...setup, ...migrations]) await db.exec(sql(f));
  for (const id of [U.A, U.B, U.C, U.N]) await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${id}', '${id.slice(0, 1)}@example.test', now())`);
  const reset = () => db.exec('reset role');
  const as = async (user) => { await reset(); await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`); };
  const asService = async () => { await reset(); await db.exec(`set role service_role; set request.jwt.claim.sub=''`); };
  const access = async (user) => { await as(user); const r = (await db.query('select * from public.klabs_account_access($1)', [user])).rows[0]; await reset(); return r; };
  const ent = async (user) => (await db.query('select access_state, access_expires_at from public.account_entitlements where user_id=$1', [user])).rows[0];
  let n = 0;
  const apply = async (o) => {
    await asService();
    try {
    const r = await db.query(`select public.klabs_apply_stripe_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::interval) as r`, [
      o.event ?? `evt_${++n}`, o.type || 'customer.subscription.updated', o.user, o.customer || `cus_${o.user.slice(0, 1)}`, o.sub || `sub_${o.user.slice(0, 1)}`,
      o.status || 'active', o.plan || 'monthly', o.currency || 'nzd', o.start ?? new Date(Date.now() - H), o.end ?? new Date(Date.now() + 30 * 24 * H),
      o.cancel ?? false, o.grace || '24 hours']);
    return r.rows[0].r;
    } finally { await reset(); }
  };
  const writeBuild = async (user, client) => { await as(user); try { await db.query(`insert into public.builds(user_id, client_id, payload) values ($1, $2, '{}'::jsonb)`, [user, client]); return true; } catch (e) { return e.message; } finally { await reset(); } };
  const readBuilds = async (user) => { await as(user); const r = (await db.query('select client_id from public.builds order by client_id')).rows.map((x) => x.client_id); await reset(); return r; };

  await ck('the migration applies on the full production schema and is repeatable', async () => {
    await db.exec(sql(MIGRATION));
    await db.exec(sql(MIGRATION));
    const t = (await db.query(`select to_regclass('public.billing_subscriptions') a, to_regclass('public.stripe_events') b`)).rows[0];
    assert.ok(t.a && t.b);
  });

  await ck('new accounts and the grandfathered account are unchanged by the migration', async () => {
    assert.equal((await ent(U.A)).access_state, 'trial_eligible');
    assert.equal((await ent(U.G)).access_state, 'grandfathered');
  });

  await ck('a signed-in builder cannot grant themselves access, write billing rows or read the event log', async () => {
    await as(U.A);
    await assert.rejects(db.query(`select public.klabs_apply_stripe_subscription('evt_self','x','${U.A}','cus_A','sub_A','active','monthly','nzd',now(),now()+interval '30 days',false)`), /permission denied/);
    await assert.rejects(db.query(`insert into public.billing_subscriptions(user_id, stripe_customer_id) values ('${U.A}','cus_self')`), /permission denied/);
    await assert.rejects(db.query(`update public.account_entitlements set access_state='paid' where user_id='${U.A}'`), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_events'), /permission denied/);
    await reset();
    await db.exec(`set role anon`);
    await assert.rejects(db.query(`select public.klabs_apply_stripe_subscription('evt_anon','x','${U.A}','cus_A','sub_A','active','monthly','nzd',now(),now()+interval '30 days',false)`), /permission denied/);
    await reset();
    assert.equal((await ent(U.A)).access_state, 'trial_eligible');
  });

  await ck('before paying: no write access; an incomplete first payment grants nothing', async () => {
    assert.equal((await access(U.A)).can_write, false);
    assert.equal((await apply({ user: U.A, status: 'incomplete' })).result, 'no_access');
    assert.equal((await access(U.A)).can_write, false);
    assert.notEqual(await writeBuild(U.A, 'a-early'), true);
  });

  await ck('an active subscription grants paid access until the period end + 24 h; the builder can work', async () => {
    const end = new Date(Date.now() + 30 * 24 * H);
    const r = await apply({ user: U.A, end });
    assert.equal(r.result, 'access_granted');
    const e = await ent(U.A);
    assert.equal(e.access_state, 'paid');
    assert.equal(new Date(e.access_expires_at).getTime(), end.getTime() + 24 * H);
    assert.equal((await access(U.A)).can_write, true);
    assert.equal(await writeBuild(U.A, 'a-1'), true);
    assert.deepEqual(await readBuilds(U.A), ['a-1']);
  });

  await ck('the builder can read only their own subscription row', async () => {
    await apply({ user: U.B });
    await as(U.A);
    const rows = (await db.query('select user_id, status, plan, currency from public.billing_subscriptions')).rows;
    await reset();
    assert.deepEqual(rows, [{ user_id: U.A, status: 'active', plan: 'monthly', currency: 'nzd' }]);
  });

  await ck('each Stripe event is applied once', async () => {
    const before = await ent(U.A);
    assert.equal((await apply({ user: U.A, event: 'evt_dupe', end: new Date(Date.now() + 60 * 24 * H) })).result, 'access_granted');
    const after = await ent(U.A);
    assert.equal((await apply({ user: U.A, event: 'evt_dupe', status: 'canceled' })).result, 'duplicate');
    assert.deepEqual(await ent(U.A), after);
    assert.notDeepEqual(before, after);
  });

  await ck('cancelling keeps access exactly to the paid period end (no grace), then ends it', async () => {
    const end = new Date(Date.now() + 10 * 24 * H);
    assert.equal((await apply({ user: U.A, end, cancel: true })).result, 'access_granted');
    assert.equal(new Date((await ent(U.A)).access_expires_at).getTime(), end.getTime());
    assert.equal((await access(U.A)).can_write, true);
    assert.equal((await apply({ user: U.A, status: 'canceled', end })).result, 'access_ended');
    const a = await access(U.A);
    assert.deepEqual([a.access_state, a.can_write], ['expired', false]);
  });

  await ck('at expiry writes are refused and every record is kept', async () => {
    assert.notEqual(await writeBuild(U.A, 'a-2'), true);
    assert.equal((await db.query(`select count(*)::int c from public.builds where user_id='${U.A}'`)).rows[0].c, 1);
  });

  await ck('reactivation (new subscription, same customer) restores access to the same records', async () => {
    assert.equal((await apply({ user: U.A, sub: 'sub_A2' })).result, 'access_granted');
    assert.equal((await access(U.A)).can_write, true);
    assert.deepEqual(await readBuilds(U.A), ['a-1']);
    assert.equal(await writeBuild(U.A, 'a-3'), true);
  });

  await ck('a late event for the old, ended subscription cannot override the live one', async () => {
    assert.equal((await apply({ user: U.A, sub: 'sub_A', status: 'canceled' })).result, 'ignored_other_subscription');
    assert.equal((await access(U.A)).can_write, true);
  });

  await ck('failed renewal (past_due): access only until the previous period end + 24 h, then locked; paid retry restores it', async () => {
    // Renewal failed 2 h ago: still inside the grace.
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'past_due', start: new Date(Date.now() - 2 * H) })).result, 'access_granted');
    const e = await ent(U.A);
    assert.ok(Math.abs(new Date(e.access_expires_at).getTime() - (Date.now() + 22 * H)) < 60000);
    // Renewal failed 30 h ago: grace over (never a free new period).
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'past_due', start: new Date(Date.now() - 30 * H) })).result, 'access_ended');
    assert.equal((await access(U.A)).can_write, false);
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'active' })).result, 'access_granted');
    assert.equal((await access(U.A)).can_write, true);
  });

  await ck('retries exhausted (unpaid / canceled / paused / incomplete_expired) lock access', async () => {
    for (const status of ['unpaid', 'paused', 'incomplete_expired', 'canceled']) {
      await apply({ user: U.A, sub: 'sub_A2', status: 'active' });
      assert.equal((await apply({ user: U.A, sub: 'sub_A2', status })).result, 'access_ended', status);
      assert.equal((await access(U.A)).can_write, false, status);
    }
  });

  await ck('paid access also expires on its own if no further event arrives', async () => {
    await apply({ user: U.A, sub: 'sub_A2', status: 'active' });
    await db.exec(`update public.account_entitlements set access_expires_at = now() - interval '1 minute' where user_id='${U.A}'`);
    const a = await access(U.A);
    assert.deepEqual([a.access_state, a.can_write], ['expired', false]);
  });

  await ck('the server (billing-checkout) can read billing rows and record a new customer, but cannot delete them or touch access directly', async () => {
    await asService();
    try {
      await db.query(`insert into public.billing_subscriptions(user_id, stripe_customer_id) values ($1, 'cus_N') on conflict (user_id) do nothing`, [U.N]);
      assert.equal((await db.query(`select stripe_customer_id from public.billing_subscriptions where user_id=$1`, [U.N])).rows[0].stripe_customer_id, 'cus_N');
      await assert.rejects(db.query(`delete from public.billing_subscriptions where user_id=$1`, [U.N]), /permission denied/);
      await assert.rejects(db.query(`insert into public.stripe_events(event_id, event_type) values ('evt_manual','x')`), /permission denied/);
    } finally { await reset(); }
  });

  await ck('owner grants are never shortened: complimentary without expiry and grandfathered keep access', async () => {
    await db.exec(`update public.account_entitlements set access_state='complimentary', access_expires_at=null where user_id='${U.C}'`);
    assert.equal((await apply({ user: U.C })).result, 'owner_grant_kept');
    assert.equal((await apply({ user: U.C, status: 'canceled' })).result, 'owner_grant_kept');
    assert.deepEqual(await ent(U.C), { access_state: 'complimentary', access_expires_at: null });
    assert.equal((await apply({ user: U.G, status: 'canceled' })).result, 'owner_grant_kept');
    assert.equal((await access(U.G)).can_write, true);
  });

  await ck('a short complimentary grant becomes paid when the subscription lasts longer', async () => {
    await db.exec(`update public.account_entitlements set access_state='complimentary', access_expires_at=now()+interval '2 days' where user_id='${U.N}'`);
    assert.equal((await apply({ user: U.N, customer: 'cus_N' })).result, 'access_granted');
    assert.equal((await ent(U.N)).access_state, 'paid');
  });

  await ck("another account's Stripe customer cannot change this account; unknown accounts change nothing", async () => {
    assert.equal((await apply({ user: U.N, customer: 'cus_B' })).result, 'customer_mismatch');
    assert.equal((await apply({ user: U.X, customer: 'cus_X' })).result, 'unknown_user');
    assert.equal((await db.query(`select count(*)::int c from public.billing_subscriptions where user_id='${U.X}'`)).rows[0].c, 0);
  });

  await ck('bad input is refused', async () => {
    await assert.rejects(apply({ user: U.B, status: 'bogus' }), /Unsupported Stripe subscription status/);
    await assert.rejects(apply({ user: U.B, grace: '8 days' }), /Grace/);
    await assert.rejects(apply({ user: U.B, event: '' }), /event id/);
  });

  await ck('every processed event is logged with its outcome', async () => {
    const rows = (await db.query(`select result, count(*)::int c from public.stripe_events group by result order by result`)).rows;
    const by = Object.fromEntries(rows.map((r) => [r.result, r.c]));
    for (const k of ['access_granted', 'access_ended', 'owner_grant_kept', 'no_access', 'customer_mismatch', 'unknown_user', 'ignored_other_subscription']) assert.ok(by[k] > 0, k);
  });

  // ---- The real webhook core end to end: signed events -> Stripe re-read (synthetic) -> this database ----
  const core = await import(path.join(root, 'supabase/functions/_shared/billing-core.mjs'));
  const SECRET = 'whsec_isolated_test_only';
  const PRICES = { nzd: { monthly: 'price_nzdM', annual: 'price_nzdA' }, usd: { monthly: 'price_usdM', annual: 'price_usdA' } };
  let stripeState;
  const stripe = { testMode: true, getSubscription: async () => stripeState };
  const serviceClient = {
    rpc: async (name, args) => {
      assert.equal(name, 'klabs_apply_stripe_subscription');
      try {
        await asService();
        const r = await db.query(`select public.klabs_apply_stripe_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::interval) as r`, [
          args.p_event_id, args.p_event_type, args.p_user_id, args.p_customer_id, args.p_subscription_id, args.p_status, args.p_plan, args.p_currency,
          args.p_period_start, args.p_period_end, args.p_cancel_at_period_end, args.p_grace]);
        return { data: r.rows[0].r, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; } finally { await reset(); }
    },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: null, error: null }) }),
  };
  const handler = core.createStripeWebhookHandler({ serviceClient, stripe, webhookSecret: SECRET, prices: PRICES, log: { error() {}, warn() {} } });
  const send = async (event, secret = SECRET) => {
    const payload = JSON.stringify({ livemode: false, ...event });
    const t = Math.floor(Date.now() / 1000);
    const res = await handler(new Request('https://x.test', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${await core.stripeSignature(payload, t, secret)}` }, body: payload }));
    return { status: res.status, body: await res.json() };
  };
  const sub = (status, over = {}) => ({ id: 'sub_B9', customer: 'cus_B9', status, metadata: { user_id: U.B }, cancel_at_period_end: false,
    current_period_start: Math.floor(Date.now() / 1000) - 3600, current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400,
    items: { data: [{ price: { id: 'price_usdA', currency: 'usd', recurring: { interval: 'year' } } }] }, ...over });

  await ck('end to end: a forged event is rejected and changes nothing', async () => {
    await db.exec(`delete from public.billing_subscriptions where user_id='${U.B}'; update public.account_entitlements set access_state='trial_eligible', access_expires_at=null where user_id='${U.B}'`);
    stripeState = sub('active');
    const r = await send({ id: 'evt_forged', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_B9', client_reference_id: U.B } } }, 'whsec_attacker');
    assert.equal(r.status, 400);
    assert.equal((await access(U.B)).can_write, false);
  });

  await ck('end to end: checkout completed (USD annual) -> paid access; replay is harmless', async () => {
    stripeState = sub('active');
    const ev = { id: 'evt_e2e_1', type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_B9', client_reference_id: U.B } } };
    assert.deepEqual(await send(ev), { status: 200, body: { received: true, result: 'access_granted' } });
    assert.deepEqual(await send(ev), { status: 200, body: { received: true, result: 'duplicate' } });
    const row = (await db.query(`select plan, currency, status from public.billing_subscriptions where user_id='${U.B}'`)).rows[0];
    assert.deepEqual(row, { plan: 'annual', currency: 'usd', status: 'active' });
    assert.equal((await access(U.B)).can_write, true);
  });

  await ck('end to end: customer cancels in the portal -> access to period end; deleted at period end -> locked', async () => {
    stripeState = sub('active', { cancel_at_period_end: true });
    assert.equal((await send({ id: 'evt_e2e_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_B9' } } })).body.result, 'access_granted');
    assert.equal((await access(U.B)).can_write, true);
    stripeState = sub('canceled', { cancel_at_period_end: true });
    assert.equal((await send({ id: 'evt_e2e_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_B9' } } })).body.result, 'access_ended');
    assert.equal((await access(U.B)).can_write, false);
  });

  await ck('end to end: a subscription for a price that is not a Studio plan grants nothing', async () => {
    stripeState = sub('active', { id: 'sub_B10', items: { data: [{ price: { id: 'price_somethingelse', currency: 'nzd', recurring: { interval: 'month' } } }] } });
    assert.equal((await send({ id: 'evt_e2e_4', type: 'customer.subscription.created', data: { object: { id: 'sub_B10' } } })).body.result, 'unrecognised_price');
    assert.equal((await access(U.B)).can_write, false);
  });

  console.log(`q40 stripe subscriptions isolated: ${passed} checks passed`);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
