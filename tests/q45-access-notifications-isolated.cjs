// Q45: complimentary access notifications in the REAL production schema (every setup script and migration, in
// release order) in an in-memory PostgreSQL (PGlite). Synthetic accounts only; no email is sent (the database only
// records what the owner-admin Edge Function will send). Usage: PGLITE_MODULE=... node tests/q45-access-notifications-isolated.cjs
// Checks: grant (dated, indefinite), extension, end-date change, revocation and restoration each record exactly one
// notification in the same transaction as the change; an unchanged request and a non-complimentary revocation
// record none; a refused or failed change records none; only the owner can change access or read notifications,
// only the service role can claim or finish them, and a claimed or accepted notification cannot be sent twice;
// existing complimentary, grandfathered and owner entitlement behaviour is unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let passed = 0;
const ck = async (name, fn) => { await fn(); passed++; console.log('PASS', name); };
const root = path.join(__dirname, '..');
const sql = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const Q45 = 'supabase/migrations/20261129000000_q45_access_notifications.sql';
const SEED = 'supabase/manual/q40_owner_seed.sql';
const O = '0e000000-0000-4000-8000-0000000000aa'; // the owner
const C = 'c0000000-0000-4000-8000-0000000000cc'; // a builder given complimentary access
const D = 'd0000000-0000-4000-8000-0000000000dd'; // a paying builder
const E = 'e0000000-0000-4000-8000-0000000000ee'; // a grandfathered builder
const DAY = 24 * 3600 * 1000;
const at = (days) => new Date(Date.now() + days * DAY).toISOString();

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
  await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${O}', 'owner@example.test', now()), ('${E}', 'e@example.test', now())`);
  const setup = ['SUPABASE-BUILD-SYNC.sql', 'SUPABASE-COMPONENT-SYNC.sql', 'SUPABASE-COMPONENT-SIZES.sql', 'SUPABASE-SETTINGS-SYNC.sql', 'SUPABASE-QUOTE-NUMBER-ALLOCATOR.sql'];
  const all = fs.readdirSync(path.join(root, 'supabase/migrations')).sort().map((f) => `supabase/migrations/${f}`);
  assert.equal(all.at(-1), Q45, 'the Q45 migration sorts last, after the Q40 owner migration');
  for (const f of [...setup, ...all.slice(0, -1)]) await db.exec(sql(f));
  await db.exec(sql(SEED).replaceAll('OWNER_USER_ID', O));
  for (const id of [C, D]) await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${id}', '${id.slice(0, 1)}@example.test', now())`);
  await db.exec(`update public.account_entitlements set access_state='paid', access_expires_at=now() + interval '30 days' where user_id='${D}'`);

  const reset = () => db.exec('reset role');
  const as = async (user) => { await reset(); await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'`); };
  const asService = async () => { await reset(); await db.exec(`set role service_role; set request.jwt.claim.sub=''`); };
  const asAnon = async () => { await reset(); await db.exec(`set role anon; set request.jwt.claim.sub=''`); };
  const q = async (who, text, args = []) => {
    if (who === 'service') await asService(); else if (who === 'anon') await asAnon(); else await as(who);
    try { return (await db.query(text, args)).rows; } finally { await db.exec('rollback').catch(() => {}); await reset(); }
  };
  const refused = async (who, text, args) => { try { await q(who, text, args); return null; } catch (e) { return e.message; } };
  const grant = (expires, who = O, target = C) => q(who, 'select public.admin_set_complimentary_access($1, $2, $3) as r', [target, expires, 'Synthetic reason']).then((r) => r[0].r);
  const revoke = (target = C, who = O) => q(who, 'select public.admin_revoke_builder_access($1, $2) as r', [target, 'Synthetic reason']).then((r) => r[0].r);
  const notices = async (target = C) => (await db.query('select * from public.klabs_access_notifications where target_user_id=$1 order by created_at, id', [target])).rows;
  const count = async () => (await db.query('select count(*)::int c from public.klabs_access_notifications')).rows[0].c;
  const latest = async (target = C) => (await notices(target)).at(-1);
  const entitlement = async (user) => (await q(user, 'select public.get_account_entitlement() as e'))[0].e;
  const iso = (v) => (v == null ? null : new Date(v).toISOString());

  const ownerBefore = await entitlement(O);
  const grandfatheredBefore = await entitlement(E);

  await ck('the Q45 migration applies after Q40 and is repeatable', async () => {
    await db.exec(sql(Q45));
    await db.exec(sql(Q45));
    assert.equal(await count(), 0);
  });

  // ---------- The four events ----------
  let first;
  await ck('grant with an end date: one "granted" notification, pending, with the exact end date, returned to the caller', async () => {
    const end = at(30);
    const r = await grant(end);
    const rows = await notices();
    assert.equal(rows.length, 1);
    first = rows[0];
    assert.equal(first.event, 'granted');
    assert.equal(first.status, 'pending');
    assert.equal(first.attempts, 0);
    assert.equal(iso(first.access_expires_at), end);
    assert.equal(first.created_by, O);
    assert.equal(r.notification_id, first.id);
    assert.equal(r.notification_event, 'granted');
    assert.equal(r.access_state, 'complimentary');
  });
  await ck('the same request again (a repeat or duplicate) changes nothing and records no second notification', async () => {
    await grant(iso(first.access_expires_at));
    const r = await grant(iso(first.access_expires_at));
    assert.equal(r.notification_id, null);
    assert.equal(r.notification_event, null);
    assert.equal((await notices()).length, 1);
  });
  await ck('a later end date: "extended", with the previous end date', async () => {
    const end = at(60);
    await grant(end);
    const n = await latest();
    assert.deepEqual([n.event, iso(n.access_expires_at), iso(n.previous_expires_at)], ['extended', end, iso(first.access_expires_at)]);
  });
  await ck('no end date: "extended" to indefinite', async () => {
    await grant(null);
    const n = await latest();
    assert.deepEqual([n.event, n.access_expires_at], ['extended', null]);
    assert.equal((await grant(null)).notification_id, null, 'indefinite again is unchanged');
  });
  await ck('an end date after indefinite: "expiry_changed" (previously no end date)', async () => {
    const end = at(20);
    await grant(end);
    const n = await latest();
    assert.deepEqual([n.event, iso(n.access_expires_at), n.previous_expires_at], ['expiry_changed', end, null]);
  });
  await ck('an earlier end date: "expiry_changed"', async () => {
    const before = await latest();
    const end = at(10);
    await grant(end);
    const n = await latest();
    assert.deepEqual([n.event, iso(n.access_expires_at), iso(n.previous_expires_at)], ['expiry_changed', end, iso(before.access_expires_at)]);
  });
  await ck('revoke complimentary access: "revoked"; access ends', async () => {
    const r = await revoke();
    const n = await latest();
    assert.equal(n.event, 'revoked');
    assert.equal(r.notification_id, n.id);
    assert.equal(r.access_state, 'expired');
    assert.equal((await entitlement(C)).can_write, false);
  });
  await ck('restoring access after it ended: "granted" again', async () => {
    await grant(at(15));
    assert.equal((await latest()).event, 'granted');
    assert.equal((await entitlement(C)).can_write, true);
  });
  await ck('granting complimentary access to a paying builder: "granted"; revoking non-complimentary access records nothing', async () => {
    await revoke(D); // paid -> expired: not complimentary, no email
    assert.equal((await notices(D)).length, 0);
    await grant(at(5), O, D);
    assert.equal((await latest(D)).event, 'granted');
  });
  const total = await count();

  // ---------- A change that does not happen sends nothing ----------
  await ck('refused changes record nothing: past end date, nothing to revoke, no reason, unknown builder', async () => {
    assert.match(await refused(O, 'select public.admin_set_complimentary_access($1, $2, $3)', [C, at(-1), 'x']), /must be in the future/);
    await revoke(C);
    const afterRevoke = await count();
    assert.match(await refused(O, 'select public.admin_revoke_builder_access($1, $2)', [C, 'x']), /no active access to revoke/);
    assert.match(await refused(O, 'select public.admin_set_complimentary_access($1, $2, $3)', [C, at(3), '  ']), /reason/);
    assert.match(await refused(O, 'select public.admin_set_complimentary_access($1, $2, $3)', ['99999999-0000-4000-8000-000000000099', at(3), 'x']), /not found/);
    assert.equal(await count(), afterRevoke);
    assert.equal(afterRevoke, total + 1);
  });
  await ck('a change rolled back after the notification was written leaves no notification', async () => {
    const before = await count();
    await as(O);
    await db.exec('begin');
    await db.query('select public.admin_set_complimentary_access($1, $2, $3)', [C, at(40), 'x']);
    await db.exec('rollback');
    await reset();
    assert.equal(await count(), before);
  });

  // ---------- Who may do what ----------
  await ck('a builder cannot change access, read, claim or finish notifications; anon cannot either', async () => {
    const before = await count();
    assert.match(await refused(C, 'select public.admin_set_complimentary_access($1, $2, $3)', [C, at(90), 'x']), /owner|permission/i);
    assert.match(await refused(C, 'select public.admin_revoke_builder_access($1, $2)', [D, 'x']), /owner|permission/i);
    assert.match(await refused(C, 'select * from public.admin_list_access_notifications($1)', [C]), /owner|permission/i);
    assert.match(await refused(C, 'select * from public.klabs_access_notifications'), /permission denied/);
    assert.match(await refused(C, 'select public.klabs_claim_access_notification($1)', [first.id]), /permission denied/);
    assert.match(await refused(C, 'select public.klabs_finish_access_notification($1, true, $2, null)', [first.id, 'x']), /permission denied/);
    assert.match(await refused(C, 'insert into public.klabs_access_notifications(target_user_id, event) values ($1, $2)', [C, 'granted']), /permission denied/);
    assert.match(await refused('anon', 'select * from public.admin_list_access_notifications($1)', [C]), /permission denied/);
    assert.match(await refused('anon', 'select public.klabs_claim_access_notification($1)', [first.id]), /permission denied/);
    assert.match(await refused(O, 'select public.klabs_claim_access_notification($1)', [first.id]), /permission denied/, 'not even the owner, from a browser');
    assert.equal(await count(), before);
  });
  await ck("the owner's list shows status and end date, newest first, without the audit reason", async () => {
    const rows = await q(O, 'select * from public.admin_list_access_notifications($1)', [C]);
    assert.equal(rows.length, (await notices()).length);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['accepted_at', 'access_expires_at', 'attempts', 'created_at', 'event', 'id', 'last_error', 'status']);
    assert.ok(new Date(rows[0].created_at) >= new Date(rows.at(-1).created_at));
  });

  // ---------- Sending exactly once ----------
  await ck('claiming: pending -> sending once; a second claim (retry or repeated request) gets nothing', async () => {
    const c1 = (await q('service', 'select public.klabs_claim_access_notification($1) as r', [first.id]))[0].r;
    assert.deepEqual([c1.status, c1.attempts, c1.target_user_id, c1.event], ['sending', 1, C, 'granted']);
    assert.equal((await q('service', 'select public.klabs_claim_access_notification($1) as r', [first.id]))[0].r, null);
  });
  await ck('a failed attempt is recorded with a short reason and may be retried (second attempt)', async () => {
    const f = (await q('service', 'select public.klabs_finish_access_notification($1, false, null, $2) as r', [first.id, 'x'.repeat(400)]))[0].r;
    assert.deepEqual([f.status, f.last_error.length], ['failed', 300]);
    const c2 = (await q('service', 'select public.klabs_claim_access_notification($1) as r', [first.id]))[0].r;
    assert.deepEqual([c2.status, c2.attempts], ['sending', 2]);
  });
  await ck('accepted is final: never claimed again; finishing twice changes nothing', async () => {
    const a = (await q('service', 'select public.klabs_finish_access_notification($1, true, $2, null) as r', [first.id, 'msg_synthetic']))[0].r;
    assert.deepEqual([a.status, a.provider_message_id, a.last_error], ['accepted', 'msg_synthetic', null]);
    assert.ok(a.accepted_at);
    assert.equal((await q('service', 'select public.klabs_claim_access_notification($1) as r', [first.id]))[0].r, null);
    assert.equal((await q('service', 'select public.klabs_finish_access_notification($1, false, null, $2) as r', [first.id, 'late']))[0].r, null);
    const row = (await db.query('select status from public.klabs_access_notifications where id=$1', [first.id])).rows[0];
    assert.equal(row.status, 'accepted');
  });
  await ck('an attempt that stopped mid-send is taken again only after 10 minutes', async () => {
    const n = (await notices())[1];
    await q('service', 'select public.klabs_claim_access_notification($1)', [n.id]);
    assert.equal((await q('service', 'select public.klabs_claim_access_notification($1) as r', [n.id]))[0].r, null);
    await db.query(`update public.klabs_access_notifications set updated_at = now() - interval '11 minutes' where id=$1`, [n.id]);
    assert.equal((await q('service', 'select public.klabs_claim_access_notification($1) as r', [n.id]))[0].r.attempts, 2);
  });

  // ---------- Existing behaviour ----------
  await ck('existing entitlements unchanged: owner and grandfathered keep permanent access; complimentary dated and indefinite work', async () => {
    const { server_time: _a, ...ownerNow } = await entitlement(O);
    const { server_time: _b, ...ownerThen } = ownerBefore;
    assert.deepEqual(ownerNow, ownerThen);
    const g = await entitlement(E);
    assert.deepEqual([g.access_state, g.can_write, g.access_expires_at], [grandfatheredBefore.access_state, true, null]);
    assert.equal(g.access_state, 'grandfathered');
    await grant(at(7));
    let c = await entitlement(C);
    assert.deepEqual([c.access_state, c.can_write], ['complimentary', true]);
    await grant(null);
    c = await entitlement(C);
    assert.deepEqual([c.access_state, c.can_write, c.access_expires_at], ['complimentary', true, null]);
    assert.equal((await notices(E)).length, 0);
  });
  await ck('the audit log still records every change (including unchanged repeats) with its reason', async () => {
    const audit = (await db.query(`select action from public.klabs_access_audit_log where target_user_id=$1 order by created_at`, [C])).rows.map((r) => r.action);
    assert.ok(audit.filter((a) => a === 'grant_complimentary' || a === 'restore_complimentary').length >= 9, audit.join());
    assert.ok(audit.includes('revoke_access'));
  });
  await ck("deleting a builder's account removes their notifications", async () => {
    await db.query('delete from auth.users where id=$1', [D]);
    assert.equal((await notices(D)).length, 0);
  });
  await ck('rollback (supabase/rollback/q45_access_notifications_rollback.sql): original functions back, access unchanged, repeatable', async () => {
    const beforeRollback = await entitlement(C);
    await db.exec(sql('supabase/rollback/q45_access_notifications_rollback.sql'));
    await db.exec(sql('supabase/rollback/q45_access_notifications_rollback.sql'));
    assert.equal((await db.query(`select to_regclass('public.klabs_access_notifications') as t`)).rows[0].t, null);
    const { server_time: _x, ...now } = await entitlement(C);
    const { server_time: _y, ...then } = beforeRollback;
    assert.deepEqual(now, then);
    const r = await grant(at(9));
    assert.equal(r.access_state, 'complimentary');
    assert.equal('notification_id' in r, false, 'the original function returns the entitlement row only');
    assert.equal((await revoke()).access_state, 'expired');
    await db.exec(sql(Q45));
    assert.equal(await count(), 0, 're-applying Q45 afterwards starts clean');
  });
  console.log(`q45 access notifications isolated: ${passed} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
