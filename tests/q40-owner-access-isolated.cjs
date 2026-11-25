// Q40 owner access: the single owner account keeps permanent, unrestricted access, decided on the SERVER, before and
// after the Q40 production migrations, whatever happens to billing - and no customer can make themselves the owner.
// Real production schema (every setup script and migration, in release order) in an in-memory PostgreSQL (PGlite).
// Synthetic accounts only; no Stripe, keys or network.
// Usage: PGLITE_MODULE=... node tests/q40-owner-access-isolated.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
const ck = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
const root = path.join(__dirname, '..');
const sql = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const Q40 = ['supabase/migrations/20261126000000_q40_stripe_subscriptions.sql', 'supabase/migrations/20261127000000_q40_stage_b_access.sql'];
const OWNER_MIGRATION = 'supabase/migrations/20261128000000_q40_owner_access.sql';
const SEED = 'supabase/manual/q40_owner_seed.sql';
const O = '0e000000-0000-4000-8000-0000000000aa'; // the owner (account existed before entitlements, like production)
const C = 'c0000000-0000-4000-8000-0000000000cc'; // an ordinary customer
const D = 'd0000000-0000-4000-8000-0000000000dd'; // a second customer
const TABLES = ['builds', 'components', 'component_taxonomy', 'studio_settings', 'quote_number_counters'];
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
  await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${O}', 'owner@example.test', now())`);
  const setup = ['SUPABASE-BUILD-SYNC.sql', 'SUPABASE-COMPONENT-SYNC.sql', 'SUPABASE-COMPONENT-SIZES.sql', 'SUPABASE-SETTINGS-SYNC.sql', 'SUPABASE-QUOTE-NUMBER-ALLOCATOR.sql'];
  const all = fs.readdirSync(path.join(root, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`);
  const preQ40 = all.filter((f) => ![...Q40, OWNER_MIGRATION].includes(f));
  assert.deepEqual(all.slice(-3), [...Q40, OWNER_MIGRATION], 'the owner migration sorts after Stage B');
  for (const f of [...setup, ...preQ40]) await db.exec(sql(f));
  for (const id of [C, D]) await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${id}', '${id.slice(0, 1)}@example.test', now())`);

  const reset = () => db.exec('reset role');
  const as = async (user) => { await reset(); await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`); };
  const asService = async () => { await reset(); await db.exec(`set role service_role; set request.jwt.claim.sub=''`); };
  const attempt = async (fn) => { try { await fn(); return 'allowed'; } catch (e) { return e.message; } finally { await db.exec('rollback').catch(() => {}); await reset(); } };
  const entitlement = async (user) => { await as(user); const r = (await db.query('select public.get_account_entitlement() as e')).rows[0].e; await reset(); return r; };
  const countAll = async (user) => { await as(user); const out = {}; for (const t of TABLES) out[t] = (await db.query(`select count(*)::int c from public.${t}`)).rows[0].c; await reset(); return out; };
  const fullAccess = async (user, tag) => {
    const e = await entitlement(user);
    assert.equal(e.can_write, true, `${tag}: can_write`);
    await as(user);
    await db.query(`insert into public.builds(user_id, client_id, payload) values ($1, $2, '{"step":1}'::jsonb)`, [user, tag]);
    await db.query(`update public.builds set payload='{"step":2}'::jsonb where user_id=$1 and client_id=$2`, [user, tag]);
    const row = (await db.query(`select payload from public.builds where user_id=$1 and client_id=$2`, [user, tag])).rows[0];
    assert.deepEqual(row?.payload, { step: 2 }, `${tag}: read back`);
    await db.query(`delete from public.builds where user_id=$1 and client_id=$2`, [user, tag]);
    await reset();
    return e;
  };
  let n = 0;
  const stripe = async (o) => {
    await asService();
    try {
      return (await db.query(`select public.klabs_apply_stripe_subscription($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as r`, [
        `evt_${++n}`, o.type || 'customer.subscription.updated', o.user, `cus_${o.user.slice(0, 2)}`, `sub_${o.user.slice(0, 2)}`,
        o.status, 'monthly', 'nzd', o.start ?? new Date(Date.now() - 31 * 24 * H), o.end ?? new Date(Date.now() - H), false, o.paid ?? false, o.renewal ?? null])).rows[0].r;
    } finally { await reset(); }
  };
  const seed = (id) => db.exec(sql(SEED).replaceAll('OWNER_USER_ID', id));

  // ---------- Before Q40 (production today) ----------
  await ck('before Q40: the owner account is grandfathered with no expiry (as every pre-entitlement account)', async () => {
    const r = (await db.query(`select access_state, access_expires_at from public.account_entitlements where user_id=$1`, [O])).rows[0];
    assert.deepEqual(r, { access_state: 'grandfathered', access_expires_at: null });
  });
  await ck('the owner record is made by the manual seed script (SQL editor) and is repeatable', async () => {
    await seed(O); await seed(O);
    assert.deepEqual((await db.query('select user_id, role from public.klabs_access_admins')).rows, [{ user_id: O, role: 'owner' }]);
  });
  await ck('the seed script refuses a second, different owner and an unknown account; nothing changes', async () => {
    await assert.rejects(seed(C), /different account .* is already the owner/); await db.exec('rollback').catch(() => {});
    await assert.rejects(seed('99999999-0000-4000-8000-000000000099'), /No Supabase Auth user/); await db.exec('rollback').catch(() => {});
    await assert.rejects(db.query(`insert into public.klabs_access_admins(user_id, role) values ($1, 'owner')`, [C]), /duplicate key/);
    assert.deepEqual((await db.query('select user_id from public.klabs_access_admins')).rows, [{ user_id: O }]);
  });
  await ck('before Q40: the owner has full read/write access and keeps records', async () => {
    await fullAccess(O, 'pre-q40');
    await as(O);
    for (let i = 1; i <= 3; i++) await db.query(`insert into public.builds(user_id, client_id, payload) values ($1, $2, '{}'::jsonb)`, [O, `owner-build-${i}`]);
    await reset();
  });
  await ck('the owner migration refuses to run before Stage B (Stage B would otherwise overwrite the owner rule)', async () => {
    await assert.rejects(db.exec(sql(OWNER_MIGRATION)), /Apply 20261127000000_q40_stage_b_access\.sql first/);
    await db.exec('rollback').catch(() => {});
  });
  const before = await countAll(O);

  // ---------- The Q40 production migrations, in release order ----------
  await ck('Q40 Stage A, Stage B and the owner migration apply in order and are repeatable', async () => {
    for (const f of [...Q40, OWNER_MIGRATION]) await db.exec(sql(f));
    await db.exec(sql(OWNER_MIGRATION));
  });
  await ck('after Q40: the owner is "owner", can write, no expiry, no trial; records unchanged', async () => {
    const e = await fullAccess(O, 'post-q40');
    assert.equal(e.access_state, 'owner');
    assert.equal(e.access_expires_at, null);
    assert.equal(e.trial_available, false);
    assert.deepEqual(await countAll(O), before);
  });

  // ---------- Billing can never touch owner access ----------
  const scenarios = [
    ['a failed renewal (past_due, unpaid)', { status: 'past_due', paid: false, renewal: 'failed' }],
    ['an expired, cancelled subscription', { status: 'canceled', type: 'customer.subscription.deleted' }],
    ['an unpaid subscription', { status: 'unpaid' }],
    ['a paid period that has ended', { status: 'active', paid: true, start: new Date(Date.now() - 60 * 24 * H), end: new Date(Date.now() - 24 * H) }],
    ['incomplete_expired', { status: 'incomplete_expired' }],
  ];
  for (const [label, o] of scenarios) {
    await ck(`owner keeps full access after ${label} from Stripe`, async () => {
      await stripe({ user: O, ...o });
      assert.equal((await fullAccess(O, `stripe-${n}`)).access_state, 'owner');
    });
  }
  await ck('owner keeps full access if the entitlement row says expired, trial-ended or paid-ended - or is missing', async () => {
    for (const set of [`access_state='expired', access_expires_at=now()-interval '1 day'`,
      `access_state='trial', trial_started_at=now()-interval '20 days', trial_expires_at=now()-interval '6 days'`,
      `access_state='paid', access_expires_at=now()-interval '1 hour'`, `access_state='trial_eligible'`]) {
      await db.exec(`update public.account_entitlements set ${set}, updated_at=now() where user_id='${O}'`);
      assert.equal((await fullAccess(O, `row-${set.slice(14, 20)}`)).access_state, 'owner');
    }
    await db.exec(`delete from public.account_entitlements where user_id='${O}'`);
    assert.equal((await fullAccess(O, 'no-row')).access_state, 'owner');
    assert.deepEqual(await countAll(O), before);
  });
  await ck('the owner keeps the owner administration functions', async () => {
    await as(O);
    const rows = (await db.query(`select builder_user_id from public.admin_list_builders('', 'all', 50, 0)`)).rows.map((r) => r.builder_user_id);
    await reset();
    assert.ok(rows.includes(C) && rows.includes(D), JSON.stringify(rows));
  });

  // ---------- Customers cannot become or impersonate the owner ----------
  await ck('a customer without a subscription has no access (records hidden) - the owner rule is not a loophole', async () => {
    const e = await entitlement(C);
    assert.equal(e.can_write, false);
    assert.notEqual(e.access_state, 'owner');
    assert.match(await attempt(async () => { await as(C); await db.query(`insert into public.builds(user_id, client_id, payload) values ($1, 'x', '{}')`, [C]); }), /row-level security|violates/);
  });
  await ck('a customer cannot read, add, change or remove the owner record', async () => {
    for (const q of [`select * from public.klabs_access_admins`,
      `insert into public.klabs_access_admins(user_id, role) values ('${C}', 'owner')`,
      `update public.klabs_access_admins set user_id='${C}'`,
      `delete from public.klabs_access_admins`]) {
      assert.match(await attempt(async () => { await as(C); await db.query(q); }), /permission denied/, q);
    }
  });
  await ck('the server key (service_role) cannot add, change or remove the owner record either', async () => {
    for (const q of [`insert into public.klabs_access_admins(user_id, role) values ('${D}', 'owner')`,
      `update public.klabs_access_admins set user_id='${D}'`, `delete from public.klabs_access_admins`]) {
      assert.match(await attempt(async () => { await asService(); await db.query(q); }), /permission denied/, q);
    }
    assert.deepEqual((await db.query('select user_id from public.klabs_access_admins')).rows, [{ user_id: O }]);
  });
  await ck("a customer asking for the owner's access (by the owner's ID) gets nothing", async () => {
    await as(C);
    assert.equal((await db.query('select * from public.klabs_account_access($1)', [O])).rows.length, 0);
    await reset();
  });
  await ck('a customer cannot change entitlements or use owner administration', async () => {
    for (const q of [`update public.account_entitlements set access_state='complimentary', access_expires_at=null where user_id='${C}'`,
      `select * from public.admin_list_builders('', 'all', 50, 0)`,
      `select public.admin_set_complimentary_access('${C}'::uuid, null, 'self grant')`]) {
      assert.match(await attempt(async () => { await as(C); await db.query(q); }), /permission denied|Owner administration permission required|function .* does not exist/, q);
    }
    assert.equal((await entitlement(C)).can_write, false);
  });
  await ck("a PAYING customer gets ordinary paid access and still cannot see the owner's records", async () => {
    await stripe({ user: C, status: 'active', paid: true, start: new Date(Date.now() - H), end: new Date(Date.now() + 30 * 24 * H) });
    const e = await fullAccess(C, 'customer-paid');
    assert.equal(e.access_state, 'paid');
    assert.ok(e.access_expires_at);
    await as(C);
    assert.equal((await db.query(`select count(*)::int c from public.builds where user_id=$1`, [O])).rows[0].c, 0);
    await reset();
  });
  await ck("the owner's records are all still there, unchanged", async () => {
    assert.deepEqual(await countAll(O), before);
    await as(O);
    const ids = (await db.query(`select client_id from public.builds where user_id=$1 order by client_id`, [O])).rows.map((r) => r.client_id);
    await reset();
    assert.deepEqual(ids, ['owner-build-1', 'owner-build-2', 'owner-build-3']);
  });
  await ck('rollback (supabase/rollback/q40_stage_b_rollback.sql): the owner still has full access, records unchanged', async () => {
    // The owner's entitlement row was removed above: the worst case for the restored pre-Q40 access rules.
    await db.exec(sql('supabase/rollback/q40_stage_b_rollback.sql'));
    const e = await fullAccess(O, 'after-rollback');
    assert.equal(e.access_state, 'grandfathered');
    assert.equal(e.access_expires_at, null);
    assert.deepEqual(await countAll(O), before);
    assert.equal((await entitlement(C)).access_state, 'paid', 'customer access untouched by the rollback');
  });
  console.log(`q40 owner access isolated: ${passed} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
