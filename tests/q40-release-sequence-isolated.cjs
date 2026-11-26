// Q40 v292 release sequence: the OWNER can never be locked out at any step, and the four other production accounts
// get exactly the owner's decision (26 Nov 2026): normal subscription rules, a running trial honoured until it ends,
// nothing deleted or modified, no permanent grandfathering. Models production as audited on 26 Nov 2026 with
// SYNTHETIC accounts and records (no real data): the real setup scripts and migrations in PGlite, then each release
// step in order, checking at every step that the owner can read and write AND that the access state the server
// returns is one the app version live at that step accepts (an unknown state makes the app refuse to open).
// Usage: PGLITE_MODULE=... node tests/q40-release-sequence-isolated.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
const ck = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
const root = path.join(__dirname, '..');
const sql = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const STAGE_A = 'supabase/migrations/20261126000000_q40_stripe_subscriptions.sql';
const STAGE_B = 'supabase/migrations/20261127000000_q40_stage_b_access.sql';
const OWNER = 'supabase/migrations/20261128000000_q40_owner_access.sql';
const ROLLBACK = 'supabase/rollback/q40_stage_b_rollback.sql';
// States the apps accept when signing in online (js/public-entry.js). v291 = live main a5c20f1 (copied verbatim).
const APP_V291 = ['trial_eligible', 'trial', 'expired', 'grandfathered', 'complimentary', 'paid', 'offline_readonly'];
const APP_V292 = JSON.parse(fs.readFileSync(path.join(root, 'js/public-entry.js'), 'utf8').match(/const allowedStates = (\[[^\]]*\]);/)[1]);
const TABLES = ['builds', 'components', 'component_taxonomy', 'studio_settings', 'quote_number_counters'];
const H = 3600 * 1000;
// Synthetic stand-ins for the five audited accounts.
const A = {
  owner: '0e000000-0000-4000-8000-0000000000aa',      // owner role, grandfathered, many records, issued invoices
  syncRelease: '5e000000-0000-4000-8000-0000000000b1', // test account: trial expired, 2 builds, 1 issued invoice
  floridian: 'f1000000-0000-4000-8000-0000000000b2',   // unverified, trial eligible, no records
  eliowo: 'e1000000-0000-4000-8000-0000000000b3',      // verified, trial eligible, no records
  emie: 'e2000000-0000-4000-8000-0000000000b4',        // verified, trial running until tomorrow, no records
};

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
  // The owner existed before entitlements were introduced (grandfathered by the backfill), like production.
  await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${A.owner}', 'owner@example.test', now())`);
  const setup = ['SUPABASE-BUILD-SYNC.sql', 'SUPABASE-COMPONENT-SYNC.sql', 'SUPABASE-COMPONENT-SIZES.sql', 'SUPABASE-SETTINGS-SYNC.sql', 'SUPABASE-QUOTE-NUMBER-ALLOCATOR.sql'];
  const live = fs.readdirSync(path.join(root, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`).filter((f) => ![STAGE_A, STAGE_B, OWNER].includes(f));
  for (const f of [...setup, ...live]) await db.exec(sql(f));
  // Later sign-ups, as audited.
  await db.exec(`
    insert into auth.users(id, email, email_confirmed_at) values
      ('${A.syncRelease}', 'sync@example.test', now()), ('${A.floridian}', 'f@example.test', null),
      ('${A.eliowo}', 'e@example.test', now()), ('${A.emie}', 'm@example.test', now());
    insert into public.klabs_access_admins(user_id, role) values ('${A.owner}', 'owner');
    update public.account_entitlements set access_state='trial', trial_started_at=now()-interval '20 days', trial_expires_at=now()-interval '13 days' where user_id='${A.syncRelease}';
    update public.account_entitlements set access_state='trial', trial_started_at=now()-interval '6 days', trial_expires_at=now()+interval '1 day' where user_id='${A.emie}';
  `);
  const reset = () => db.exec('reset role');
  const as = async (user) => { await reset(); await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`); };
  const entitlement = async (user) => { await as(user); const e = (await db.query('select public.get_account_entitlement() as e')).rows[0].e; await reset(); return e; };
  const visible = async (user) => { await as(user); const n = (await db.query('select count(*)::int c from public.builds')).rows[0].c; await reset(); return n; };
  const stored = async () => { const out = {}; for (const t of TABLES) out[t] = (await db.query(`select user_id, count(*)::int c from public.${t} group by user_id order by user_id`)).rows; return out; };
  const ownerWrites = async (tag) => {
    await as(A.owner);
    await db.query(`insert into public.builds(user_id, client_id, payload) values ($1, $2, '{}'::jsonb)`, [A.owner, tag]);
    await db.query(`update public.builds set payload='{"ok":1}'::jsonb where user_id=$1 and client_id=$2`, [A.owner, tag]);
    await db.query(`delete from public.builds where user_id=$1 and client_id=$2`, [A.owner, tag]);
    await reset();
  };
  // The owner can read and write, and the app live at this step accepts the state the server returns.
  const ownerSafe = async (step, app) => {
    const e = await entitlement(A.owner);
    assert.equal(e.can_write, true, `${step}: owner can_write`);
    assert.equal(e.access_expires_at, null, `${step}: owner has no expiry`);
    assert.ok(app.includes(e.access_state), `${step}: the live app accepts "${e.access_state}"`);
    assert.equal(await visible(A.owner), OWNER_BUILDS, `${step}: owner sees every build`);
    await ownerWrites(`${step}-write`);
  };

  // Records, as audited (synthetic): owner 22 builds (3 invoiced) + components; sync-release 2 builds (1 invoiced).
  // Existing records are seeded as already stored (issued invoices can only be created through the server's invoice
  // operation, so the financial-safeguard triggers are paused for this setup only).
  const OWNER_BUILDS = 22;
  await db.exec('set session_replication_role = replica');
  for (let i = 1; i <= OWNER_BUILDS; i++) {
    await db.query(`insert into public.builds(user_id, client_id, payload) values ($1, $2, $3::jsonb)`,
      [A.owner, `owner-${i}`, JSON.stringify({ customerName: `Customer ${(i % 9) + 1}`, ...(i <= 3 ? { issuedInvoice: { total: 100 + i } } : {}) })]);
  }
  await db.exec(`insert into public.builds(user_id, client_id, payload) values
    ('${A.syncRelease}', 'sr-1', '{"customerName":"Test","issuedInvoice":{"total":50}}'), ('${A.syncRelease}', 'sr-2', '{"customerName":"Test"}')`);
  await db.exec('set session_replication_role = origin');
  const records = await stored();

  // ---------- Step 0: production today (live v291) ----------
  await ck('step 0 (production today, app v291): owner full access; accepted by v291', () => ownerSafe('step0', APP_V291));

  // ---------- Step 1: the three Q40 migrations, while v291 is still live ----------
  await ck('step 1a: Stage A + Stage B applied (v291 still live): owner full access, accepted by v291', async () => {
    await db.exec(sql(STAGE_A)); await db.exec(sql(STAGE_B));
    await ownerSafe('step1a', APP_V291);
  });
  await ck('step 1b: owner migration applied (v291 still live): owner full access, accepted by v291 AND v292', async () => {
    await db.exec(sql(OWNER));
    await ownerSafe('step1b-v291', APP_V291);
    await ownerSafe('step1b-v292', APP_V292);
  });
  await ck('step 1: other accounts follow normal rules - running trial kept, ended/never-started trials locked, no trial can start', async () => {
    const e = {}; for (const [k, id] of Object.entries(A)) e[k] = await entitlement(id);
    assert.equal(e.emie.can_write, true, 'running trial honoured until it ends');
    assert.equal(e.emie.access_state, 'trial');
    for (const k of ['syncRelease', 'floridian', 'eliowo']) {
      assert.equal(e[k].can_write, false, `${k} locked`);
      assert.ok(!['grandfathered', 'complimentary'].includes(e[k].access_state), `${k} not grandfathered`);
      assert.equal(e[k].trial_available, false, `${k} cannot start a trial`);
      assert.ok(APP_V292.includes(e[k].access_state), `${k}: state understood by v292 (subscription screen)`);
    }
    assert.equal(await visible(A.syncRelease), 0, 'sync-release records hidden while locked');
    await as(A.eliowo);
    await assert.rejects(db.query('select public.start_account_trial()'), /no longer offers a free trial/);
    await reset();
  });
  await ck('step 1: no account or record was modified or deleted by the migrations', async () => {
    assert.deepEqual(await stored(), records);
    const ent = (await db.query(`select user_id, access_state from public.account_entitlements order by user_id`)).rows;
    assert.deepEqual(ent.map((r) => r.access_state).sort(), ['grandfathered', 'trial', 'trial', 'trial_eligible', 'trial_eligible']);
    assert.equal((await db.query('select count(*)::int c from auth.users')).rows[0].c, 5);
  });

  // ---------- Steps 2-3: Edge Functions (no database change), then the v292 app ----------
  await ck('step 3 (v292 app live): owner full access, accepted by v292', () => ownerSafe('step3', APP_V292));

  // ---------- Live: billing events and outages can never reach the owner ----------
  await ck('live: Stripe cancellation, failed payment and ended periods for the owner change nothing', async () => {
    let n = 0;
    for (const [status, paid, end] of [['canceled', false, -H], ['past_due', false, -H], ['unpaid', false, -H], ['active', true, -24 * H]]) {
      await db.exec(`set role service_role; set request.jwt.claim.sub=''`);
      await db.query(`select public.klabs_apply_stripe_subscription($1,'customer.subscription.updated',$2,'cus_o','sub_o',$3,'monthly','nzd',$4,$5,false,$6,null)`,
        [`evt_o${++n}`, A.owner, status, new Date(Date.now() - 31 * 24 * H), new Date(Date.now() + end), paid]);
      await reset();
      await ownerSafe(`stripe-${status}`, APP_V292);
    }
  });
  await ck('live: with no Stripe events at all (outage) and the owner\'s entitlement row expired, the owner still has full access', async () => {
    await db.exec(`update public.account_entitlements set access_state='expired', access_expires_at=now()-interval '1 day' where user_id='${A.owner}'`);
    await ownerSafe('outage', APP_V292);
  });
  await ck('live: when the running trial ends, that account is locked like the others; its records are kept', async () => {
    await db.exec(`update public.account_entitlements set trial_expires_at=now()-interval '1 minute' where user_id='${A.emie}'`);
    const e = await entitlement(A.emie);
    assert.equal(e.can_write, false);
    assert.equal(e.access_state, 'expired');
    assert.deepEqual(await stored(), records);
  });
  await ck('live: a locked account that subscribes gets its records back unchanged', async () => {
    await db.exec(`set role service_role; set request.jwt.claim.sub=''`);
    await db.query(`select public.klabs_apply_stripe_subscription('evt_sr','checkout.session.completed',$1,'cus_sr','sub_sr','active','monthly','nzd',$2,$3,false,true,null)`,
      [A.syncRelease, new Date(Date.now() - H), new Date(Date.now() + 30 * 24 * H)]);
    await reset();
    assert.equal((await entitlement(A.syncRelease)).can_write, true);
    assert.equal(await visible(A.syncRelease), 2);
  });

  // ---------- Rollback (back to v291) ----------
  await ck('rollback to v291: owner full access, accepted by v291, records unchanged', async () => {
    await db.exec(sql(ROLLBACK));
    await ownerSafe('rollback', APP_V291);
    assert.deepEqual(await stored(), records);
  });
  console.log(`q40 release sequence isolated: ${passed} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
