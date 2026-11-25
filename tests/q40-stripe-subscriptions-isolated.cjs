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
    const r = await db.query(`select public.klabs_apply_stripe_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as r`, [
      o.event ?? `evt_${++n}`, o.type || 'customer.subscription.updated', o.user, o.customer || `cus_${o.user.slice(0, 1)}`, o.sub || `sub_${o.user.slice(0, 1)}`,
      o.status || 'active', o.plan || 'monthly', o.currency || 'nzd', o.start ?? new Date(Date.now() - H), o.end ?? new Date(Date.now() + 30 * 24 * H),
      o.cancel ?? false, 'paid' in o ? o.paid : true, o.renewal ?? null]);
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
    await assert.rejects(db.query(`select public.klabs_apply_stripe_subscription('evt_self','x','${U.A}','cus_A','sub_A','active','monthly','nzd',now(),now()+interval '30 days',false,true)`), /permission denied/);
    await assert.rejects(db.query(`insert into public.billing_subscriptions(user_id, stripe_customer_id) values ('${U.A}','cus_self')`), /permission denied/);
    await assert.rejects(db.query(`update public.account_entitlements set access_state='paid' where user_id='${U.A}'`), /permission denied/);
    await assert.rejects(db.query('select * from public.stripe_events'), /permission denied/);
    await reset();
    await db.exec(`set role anon`);
    await assert.rejects(db.query(`select public.klabs_apply_stripe_subscription('evt_anon','x','${U.A}','cus_A','sub_A','active','monthly','nzd',now(),now()+interval '30 days',false,true)`), /permission denied/);
    await reset();
    assert.equal((await ent(U.A)).access_state, 'trial_eligible');
  });

  await ck('before paying: no write access; an incomplete first payment grants nothing', async () => {
    assert.equal((await access(U.A)).can_write, false);
    assert.equal((await apply({ user: U.A, status: 'incomplete' })).result, 'no_access');
    assert.equal((await access(U.A)).can_write, false);
    assert.notEqual(await writeBuild(U.A, 'a-early'), true);
  });

  await ck('a paid subscription grants access exactly to the paid period end (no grace); the builder can work', async () => {
    const end = new Date(Date.now() + 30 * 24 * H);
    const r = await apply({ user: U.A, end });
    assert.equal(r.result, 'access_granted');
    const e = await ent(U.A);
    assert.equal(e.access_state, 'paid');
    assert.equal(new Date(e.access_expires_at).getTime(), end.getTime());
    assert.equal(new Date((await db.query(`select paid_through from public.billing_subscriptions where user_id=$1`, [U.A])).rows[0].paid_through).getTime(), end.getTime());
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

  await ck('renewal waiting for payment (period advanced, invoice not yet paid): access ends at the last paid period end, not later', async () => {
    // Stripe moved the subscription into the new period 1 minute ago and keeps it "active" while the invoice is unpaid.
    const boundary = new Date(Date.now() - 60 * 1000);
    const r = await apply({ user: U.A, sub: 'sub_A2', status: 'active', start: boundary, end: new Date(Date.now() + 30 * 24 * H), paid: false });
    assert.equal(r.result, 'access_ended');
    assert.equal((await access(U.A)).can_write, false);
    assert.notEqual(await writeBuild(U.A, 'a-during-renewal'), true);
    // A renewal due in the future, invoice not yet issued as paid: access to exactly the current period end.
    const future = new Date(Date.now() + 2 * H);
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'active', start: future, end: new Date(Date.now() + 40 * 24 * H), paid: false })).result, 'access_granted');
    assert.equal(new Date((await ent(U.A)).access_expires_at).getTime(), future.getTime());
  });

  await ck('renewal payment confirmed by Stripe restores access automatically to the new paid period end, records intact', async () => {
    const end = new Date(Date.now() + 30 * 24 * H);
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'active', start: new Date(Date.now() - 60 * 1000), end, paid: true, type: 'invoice.paid' })).result, 'access_granted');
    assert.equal(new Date((await ent(U.A)).access_expires_at).getTime(), end.getTime());
    assert.equal((await access(U.A)).can_write, true);
    assert.deepEqual(await readBuilds(U.A), ['a-1', 'a-3']);
  });

  await ck('failed renewal (past_due): locked from the last paid period end with no grace; a successful retry restores access', async () => {
    // Renewal failed 2 minutes after the paid period ended: already locked (Stage A previously allowed 24 h).
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'past_due', start: new Date(Date.now() - 2 * 60 * 1000), paid: false })).result, 'access_ended');
    assert.equal((await access(U.A)).can_write, false);
    // Even if the latest invoice reads as paid while past_due, access never runs beyond a period end already passed.
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'past_due', start: new Date(Date.now() - 30 * 24 * H), end: new Date(Date.now() - 60 * 1000), paid: true })).result, 'no_access');
    assert.equal((await access(U.A)).can_write, false);
    const end = new Date(Date.now() + 30 * 24 * H);
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'active', end, paid: true, type: 'invoice.paid' })).result, 'access_granted');
    assert.equal((await access(U.A)).can_write, true);
  });

  await ck('expiry boundary: refused at the exact paid-through instant, allowed one second before', async () => {
    await db.exec('begin');
    try {
      // now() is fixed inside a transaction, so the boundary is exact.
      await db.exec(`update public.account_entitlements set access_expires_at = now() + interval '1 second' where user_id='${U.A}'`);
      await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${U.A}'`);
      const before = (await db.query('select * from public.klabs_account_access($1)', [U.A])).rows[0];
      await db.exec('reset role');
      await db.exec(`update public.account_entitlements set access_expires_at = now() where user_id='${U.A}'`);
      await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${U.A}'`);
      const at = (await db.query('select * from public.klabs_account_access($1)', [U.A])).rows[0];
      assert.deepEqual([before.access_state, before.can_write], ['paid', true]);
      assert.deepEqual([at.access_state, at.can_write], ['expired', false]);
    } finally { await db.exec('rollback'); await reset(); }
    // A paid-through time already reached grants nothing.
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', end: new Date(Date.now() - 1), paid: true })).result, 'access_ended');
    await apply({ user: U.A, sub: 'sub_A2', status: 'active', paid: true });
  });

  await ck('trialing grants nothing (Studio has no free trial)', async () => {
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'trialing', paid: true })).result, 'access_ended');
    assert.equal((await access(U.A)).can_write, false);
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'active', paid: true })).result, 'access_granted');
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
    await assert.rejects(apply({ user: U.B, paid: null }), /latest invoice is paid/);
    await assert.rejects(apply({ user: U.B, event: '' }), /event id/);
  });

  await ck('every processed event is logged with its outcome', async () => {
    const rows = (await db.query(`select result, count(*)::int c from public.stripe_events group by result order by result`)).rows;
    const by = Object.fromEntries(rows.map((r) => [r.result, r.c]));
    for (const k of ['access_granted', 'access_ended', 'owner_grant_kept', 'no_access', 'customer_mismatch', 'unknown_user', 'ignored_other_subscription']) assert.ok(by[k] > 0, k);
  });

  // ---- Stage B access controls (20261127000000_q40_stage_b_access.sql) ----
  const hidden = async (user) => {
    await as(user);
    try {
      const out = {};
      for (const t of ['builds', 'components', 'component_taxonomy', 'studio_settings', 'quote_number_counters']) out[t] = (await db.query(`select count(*)::int c from public.${t}`)).rows[0].c;
      return out;
    } finally { await reset(); }
  };
  const stored = async (user) => (await db.query(`select client_id, payload from public.builds where user_id=$1 order by client_id`, [user])).rows;

  await ck('Stage B: while paid, the builder reads their own records', async () => {
    await apply({ user: U.A, sub: 'sub_A2', status: 'active', paid: true });
    assert.deepEqual(await readBuilds(U.A), ['a-1', 'a-3']);
  });

  await ck('Stage B: at expiry the records are hidden from the builder (read lock), never deleted or changed', async () => {
    const before = await stored(U.A);
    assert.equal((await apply({ user: U.A, sub: 'sub_A2', status: 'canceled' })).result, 'access_ended');
    const seen = await hidden(U.A);
    assert.deepEqual(seen, { builds: 0, components: 0, component_taxonomy: 0, studio_settings: 0, quote_number_counters: 0 });
    assert.deepEqual(await stored(U.A), before, 'every record is still stored, unchanged');
    assert.notEqual(await writeBuild(U.A, 'a-locked'), true);
    // Payment management stays available: the builder can still read their own subscription row.
    await as(U.A);
    const own = (await db.query('select status from public.billing_subscriptions')).rows;
    await reset();
    assert.deepEqual(own, [{ status: 'canceled' }]);
  });

  await ck('Stage B: a confirmed new paid period shows the same records again, unchanged', async () => {
    const before = await stored(U.A);
    assert.equal((await apply({ user: U.A, sub: 'sub_A3', status: 'active', paid: true, type: 'invoice.paid' })).result, 'access_granted');
    assert.deepEqual(await readBuilds(U.A), ['a-1', 'a-3']);
    assert.deepEqual(await stored(U.A), before);
  });

  await ck('Stage B: the read lock follows the exact paid-through instant', async () => {
    await db.exec('begin');
    try {
      await db.exec(`update public.account_entitlements set access_expires_at = now() + interval '1 second' where user_id='${U.A}'`);
      await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${U.A}'`);
      const before = (await db.query('select count(*)::int c from public.builds')).rows[0].c;
      await db.exec('reset role');
      await db.exec(`update public.account_entitlements set access_expires_at = now() where user_id='${U.A}'`);
      await db.exec(`set local role authenticated; set local request.jwt.claim.sub='${U.A}'`);
      const at = (await db.query('select count(*)::int c from public.builds')).rows[0].c;
      assert.deepEqual([before, at], [2, 0]);
    } finally { await db.exec('rollback'); await reset(); }
  });

  await ck('Stage B: owner grants keep reading; another account never sees these records', async () => {
    assert.equal((await access(U.G)).can_write, true);
    await as(U.G);
    const g = (await db.query('select count(*)::int c from public.builds')).rows[0].c;
    await reset();
    assert.equal(g, 0, 'grandfathered account reads only its own (none here)');
    assert.equal(await writeBuild(U.G, 'g-1'), true);
    assert.deepEqual(await readBuilds(U.G), ['g-1']);
  });

  await ck('Stage B: the free trial is retired; a trial already running keeps its original end', async () => {
    const T = 'abababab-0000-4000-8000-0000000000ab';
    await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${T}', 't@example.test', now())`);
    await as(T);
    await assert.rejects(db.query('select public.start_account_trial()'), /no longer offers a free trial/);
    const a = (await db.query('select * from public.klabs_account_access($1)', [T])).rows[0];
    await reset();
    assert.deepEqual([a.access_state, a.can_write, a.trial_available], ['trial_eligible', false, false]);
    // An existing trial (started before the retirement) continues to its own end date.
    await db.exec(`update public.account_entitlements set access_state='trial', trial_started_at=now(), trial_expires_at=now()+interval '3 days' where user_id='${T}'`);
    assert.equal((await access(T)).can_write, true);
    assert.equal(await writeBuild(T, 't-1'), true);
    assert.deepEqual(await readBuilds(T), ['t-1']);
  });

  await ck('Stage B: the renewal state is recorded for messages only and never grants access', async () => {
    const past = new Date(Date.now() - 60 * 1000);
    assert.equal((await apply({ user: U.A, sub: 'sub_A3', status: 'past_due', start: past, paid: false, renewal: 'failed' })).result, 'access_ended');
    const row = async () => (await db.query(`select renewal_state from public.billing_subscriptions where user_id=$1`, [U.A])).rows[0].renewal_state;
    assert.equal(await row(), 'failed');
    assert.equal((await access(U.A)).can_write, false);
    assert.equal((await apply({ user: U.A, sub: 'sub_A3', status: 'active', start: past, paid: false, renewal: 'action_required' })).result, 'no_access');
    assert.equal(await row(), 'action_required');
    assert.equal((await access(U.A)).can_write, false);
    assert.equal((await apply({ user: U.A, sub: 'sub_A3', status: 'active', paid: true, renewal: 'pending' })).result, 'access_granted');
    assert.equal(await row(), null, 'a paid invoice clears it');
    await assert.rejects(apply({ user: U.A, sub: 'sub_A3', renewal: 'grace' }), /Unsupported renewal state/);
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
        const r = await db.query(`select public.klabs_apply_stripe_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as r`, [
          args.p_event_id, args.p_event_type, args.p_user_id, args.p_customer_id, args.p_subscription_id, args.p_status, args.p_plan, args.p_currency,
          args.p_period_start, args.p_period_end, args.p_cancel_at_period_end, args.p_latest_invoice_paid, args.p_renewal_state ?? null]);
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
    items: { data: [{ price: { id: 'price_usdA', currency: 'usd', recurring: { interval: 'year' } } }] }, latest_invoice: { id: 'in_B9', status: 'paid' }, ...over });

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

  await ck('end to end: a renewal whose invoice is not yet paid grants nothing; invoice.paid then restores access', async () => {
    stripeState = sub('active', { id: 'sub_B11', latest_invoice: { id: 'in_B11', status: 'open' } });
    assert.equal((await send({ id: 'evt_e2e_5', type: 'customer.subscription.updated', data: { object: { id: 'sub_B11' } } })).body.result, 'no_access');
    assert.equal((await access(U.B)).can_write, false);
    stripeState = sub('active', { id: 'sub_B11', latest_invoice: { id: 'in_B11', status: 'paid' } });
    assert.equal((await send({ id: 'evt_e2e_6', type: 'invoice.paid', data: { object: { subscription: 'sub_B11' } } })).body.result, 'access_granted');
    assert.equal((await access(U.B)).can_write, true);
    stripeState = sub('canceled', { id: 'sub_B11' });
    assert.equal((await send({ id: 'evt_e2e_7', type: 'customer.subscription.deleted', data: { object: { id: 'sub_B11' } } })).body.result, 'access_ended');
  });

  await ck('end to end: a subscription for a price that is not a Studio plan grants nothing', async () => {
    stripeState = sub('active', { id: 'sub_B10', items: { data: [{ price: { id: 'price_somethingelse', currency: 'nzd', recurring: { interval: 'month' } } }] } });
    assert.equal((await send({ id: 'evt_e2e_4', type: 'customer.subscription.created', data: { object: { id: 'sub_B10' } } })).body.result, 'unrecognised_price');
    assert.equal((await access(U.B)).can_write, false);
  });

  console.log(`q40 stripe subscriptions isolated: ${passed} checks passed`);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
