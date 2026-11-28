// Q45: complimentary access emails from the owner-admin Edge Function core, with the email service mocked.
// No real email is ever sent: the real network is blocked for the whole file, and the handler only reaches the
// injected stand-in for the Resend API. Synthetic accounts and addresses only.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');

const ownerId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const noticeId = '33333333-3333-4333-8333-333333333333';
const FROM = 'K-Labs Studio <studio@notify.example.test>';
const END = '2026-12-31T10:59:59.999Z'; // 11:59 pm, 31 December 2026, New Zealand time
const PREV = '2026-12-01T10:59:59.999Z';

let realFetch;
before(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('real network use is not allowed in this test'); };
});
after(() => { globalThis.fetch = realFetch; });

async function harness(o = {}) {
  const { createOwnerAdminHandler } = await import('../supabase/functions/_shared/owner-admin-core.mjs');
  const calls = [];
  const sent = [];
  // The notification store, as the database functions behave (tests/q45-access-notifications-isolated.cjs).
  const store = new Map();
  const notice = (id, event, expires, previous = null) => store.set(id, { id, target_user_id: targetId, event, access_expires_at: expires, previous_expires_at: previous, status: 'pending', attempts: 0 });
  const userClient = {
    auth: { getUser: async () => ({ data: { user: o.signedIn === false ? null : { id: ownerId } }, error: o.signedIn === false ? new Error('bad token') : null }) },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'klabs_is_owner') return { data: o.isOwner !== false, error: null };
      if (name === 'admin_set_complimentary_access' || name === 'admin_revoke_builder_access') {
        if (o.changeError) return { data: null, error: { message: o.changeError } };
        const r = o.change || { event: 'granted', expires: END };
        if (!r.event) return { data: { access_state: 'complimentary', notification_id: null, notification_event: null }, error: null };
        notice(noticeId, r.event, r.expires, r.previous);
        return { data: { access_state: r.event === 'revoked' ? 'expired' : 'complimentary', notification_id: noticeId, notification_event: r.event }, error: null };
      }
      throw new Error(`unexpected user RPC ${name}`);
    }
  };
  const serviceClient = {
    async rpc(name, args) {
      calls.push({ name, args, service: true });
      const n = store.get(args.p_notification_id);
      if (name === 'klabs_claim_access_notification') {
        if (!n || !['pending', 'failed'].includes(n.status)) return { data: null, error: null };
        n.status = 'sending'; n.attempts++;
        return { data: { ...n }, error: null };
      }
      if (name === 'klabs_finish_access_notification') {
        if (!n || n.status !== 'sending') return { data: null, error: null };
        n.status = args.p_accepted ? 'accepted' : 'failed';
        n.provider_message_id = args.p_provider_message_id;
        n.last_error = args.p_error;
        return { data: { ...n }, error: null };
      }
      throw new Error(`unexpected service RPC ${name}`);
    },
    auth: { admin: { async getUserById(id) {
      calls.push({ name: 'getUserById', id });
      return { data: { user: id === targetId ? { id, email: o.email ?? 'builder@example.test' } : null }, error: null };
    } } }
  };
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, body: JSON.parse(init.body) });
    if (o.network) throw Object.assign(new Error('offline'), { name: o.network });
    const status = o.providerStatus || 200;
    return { ok: status < 300, status, json: async () => (status < 300 ? { id: `msg_${sent.length}` } : { name: 'validation_error', message: o.providerMessage || 'Rejected' }) };
  };
  const handler = createOwnerAdminHandler({
    createUserClient: () => userClient,
    serviceClient,
    publicAppUrl: 'https://studio.klabs.co.nz/',
    resendApiKey: o.apiKey === undefined ? 're_synthetic_test_key' : o.apiKey,
    accessEmailFrom: o.from === undefined ? FROM : o.from,
    fetchImpl
  });
  const send = async (body, authorization = 'Bearer verified-test-token') => {
    const res = await handler(new Request('https://edge.example.test/owner-admin', {
      method: 'POST', headers: authorization ? { Authorization: authorization, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }));
    return { status: res.status, body: await res.json() };
  };
  return { send, calls, sent, store, notice };
}

const grant = (extra = {}) => ({ action: 'set_complimentary', targetUserId: targetId, expiresAt: END, reason: 'Synthetic: workshop partner', ...extra });
const revoke = { action: 'revoke_access', targetUserId: targetId, reason: 'Synthetic: grant period complete' };

test('grant with an end date: access saved first, then ONE email to the builder\'s own address with the exact date and Studio link', async () => {
  const h = await harness();
  const r = await h.send(grant({ email: 'attacker@example.test', to: 'attacker@example.test' }));
  assert.equal(r.status, 200);
  assert.equal(r.body.accessSaved, true);
  assert.deepEqual(r.body.notification, { id: noticeId, status: 'accepted', event: 'granted' });
  assert.match(r.body.message, /^Access saved\. The email to the builder was accepted by the email service \(this does not confirm delivery\)\.$/);
  const order = h.calls.map((c) => c.name);
  assert.ok(order.indexOf('admin_set_complimentary_access') < order.indexOf('klabs_claim_access_notification'), 'the change commits before any email');
  assert.equal(h.sent.length, 1);
  const { url, init, body } = h.sent[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer re_synthetic_test_key');
  assert.equal(init.headers['Idempotency-Key'], `klabs-access-notification-${noticeId}`);
  assert.deepEqual(body.to, ['builder@example.test'], 'the recipient comes from the account, never the request');
  assert.equal(body.from, FROM);
  assert.equal(body.subject, 'Your K-Labs Studio access is ready');
  for (const part of [body.html, body.text]) {
    assert.match(part, /11:59 pm on Thursday 31 December 2026 \(New Zealand time\)/);
    assert.match(part, /https:\/\/studio\.klabs\.co\.nz\//);
    assert.doesNotMatch(part, /Synthetic: workshop partner|attacker|re_synthetic|11111111|22222222|33333333/, 'no reason, key, IDs or request data');
  }
  assert.equal(h.store.get(noticeId).status, 'accepted');
  assert.equal(h.store.get(noticeId).provider_message_id, 'msg_1');
  const change = h.calls.find((c) => c.name === 'admin_set_complimentary_access');
  assert.deepEqual(change.args, { p_target_user_id: targetId, p_expires_at: END, p_reason: 'Synthetic: workshop partner' });
});

test('grant with no end date says access has no scheduled end date', async () => {
  const h = await harness({ change: { event: 'granted', expires: null } });
  const r = await h.send(grant({ expiresAt: null }));
  assert.equal(r.body.notification.status, 'accepted');
  assert.equal(h.calls.find((c) => c.name === 'admin_set_complimentary_access').args.p_expires_at, null);
  assert.match(h.sent[0].body.text, /Your access has no scheduled end date\./);
  assert.doesNotMatch(h.sent[0].body.text, /runs until/);
});

test('extension, end-date change and revocation each send their own email', async () => {
  const cases = [
    [{ event: 'extended', expires: END, previous: PREV }, grant(), 'Your Studio access has been extended', /It now runs until 11:59 pm on Thursday 31 December 2026 \(New Zealand time\)\./],
    [{ event: 'extended', expires: null, previous: PREV }, grant({ expiresAt: null }), 'Your Studio access has been extended', /It now has no scheduled end date\./],
    [{ event: 'expiry_changed', expires: PREV, previous: END }, grant({ expiresAt: PREV }), 'Your K-Labs Studio access end date has changed', /It now runs until 11:59 pm on Tuesday 1 December 2026 \(New Zealand time\)\. It previously ran until 11:59 pm on Thursday 31 December 2026/],
    [{ event: 'expiry_changed', expires: END, previous: null }, grant(), 'Your K-Labs Studio access end date has changed', /It previously had no scheduled end date\./],
    [{ event: 'revoked', expires: '2026-11-28T00:00:00Z', previous: END }, revoke, 'Your complimentary K-Labs Studio access has ended', /Complimentary access to K-Labs Studio for builder@example\.test has ended\.[\s\S]*Your records are kept safely\.[\s\S]*choose a subscription/],
  ];
  for (const [change, request, subject, text] of cases) {
    const h = await harness({ change });
    const r = await h.send(request);
    assert.equal(r.status, 200, subject);
    assert.equal(r.body.notification.event, change.event);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].body.subject, subject);
    assert.match(h.sent[0].body.text, text);
  }
});

test('no-op changes and non-complimentary revocations: saved, NO email, and the admin is told why', async () => {
  let h = await harness({ change: { event: null } });
  let r = await h.send(grant());
  assert.equal(r.status, 200);
  assert.equal(h.sent.length, 0);
  assert.equal(r.body.notification, null);
  assert.match(r.body.message, /^Access saved and recorded in the audit log\. No email sent: the builder's complimentary access did not change\.$/);
  h = await harness({ change: { event: null } });
  r = await h.send(revoke);
  assert.equal(h.sent.length, 0);
  assert.match(r.body.message, /No email sent: only complimentary access changes are emailed\./);
});

test('duplicates: a retry or repeated request for an email already accepted is refused and nothing is sent again', async () => {
  const h = await harness();
  await h.send(grant());
  assert.equal(h.sent.length, 1);
  const again = await h.send({ action: 'retry_access_email', notificationId: noticeId });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /already accepted .* It was not sent again\./);
  assert.equal(h.sent.length, 1);
});

test('email service failure: access stays saved, the failure is recorded and reported, and Retry sends once', async () => {
  const h = await harness({ providerStatus: 422, providerMessage: 'The from address is not verified (key re_abc123 used).' });
  const r = await h.send(grant());
  assert.equal(r.status, 200, 'not an error: the access change succeeded');
  assert.equal(r.body.accessSaved, true);
  assert.equal(r.body.notification.status, 'failed');
  assert.match(r.body.message, /^Access saved\. The email to the builder was NOT sent: The email service refused the message \(HTTP 422\)/);
  assert.match(r.body.message, /Use Retry email under Access emails\.$/);
  assert.doesNotMatch(r.body.message + h.store.get(noticeId).last_error, /re_abc123/, 'provider text is cleaned of key-like values');
  assert.equal(h.store.get(noticeId).status, 'failed');
  assert.equal(h.calls.filter((c) => c.name === 'admin_set_complimentary_access').length, 1, 'never reversed or repeated');
  assert.ok(!h.calls.some((c) => c.name === 'admin_revoke_builder_access'));
});

test('retry after a failure sends with the SAME idempotency key and reports acceptance without claiming delivery', async () => {
  const h = await harness();
  h.notice(noticeId, 'granted', END);
  h.store.get(noticeId).status = 'failed';
  const r = await h.send({ action: 'retry_access_email', notificationId: noticeId });
  assert.equal(r.status, 200);
  assert.equal(r.body.message, 'The email was accepted by the email service (this does not confirm delivery).');
  assert.equal(h.sent[0].init.headers['Idempotency-Key'], `klabs-access-notification-${noticeId}`);
  assert.equal(h.store.get(noticeId).attempts, 1);
});

test('network failure, timeout, missing configuration and missing address are recorded as not sent', async () => {
  for (const [o, pattern] of [
    [{ network: 'TypeError' }, /could not be reached/],
    [{ network: 'TimeoutError' }, /did not answer in time/],
    [{ apiKey: '' }, /Email sending is not configured on the server\./],
    [{ from: '' }, /Email sending is not configured on the server\./],
    [{ email: '' }, /email address could not be found/],
  ]) {
    const h = await harness(o);
    const r = await h.send(grant());
    assert.equal(r.status, 200);
    assert.equal(r.body.accessSaved, true);
    assert.equal(r.body.notification.status, 'failed');
    assert.match(r.body.message, pattern);
    assert.equal(h.store.get(noticeId).status, 'failed');
    if (o.apiKey === '' || o.from === '' || o.email === '') assert.equal(h.sent.length, 0, 'nothing sent');
  }
});

test('a failed access change sends nothing and reports the change error', async () => {
  const h = await harness({ changeError: 'Complimentary access expiry must be in the future' });
  const r = await h.send(grant());
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'Complimentary access expiry must be in the future');
  assert.equal(h.sent.length, 0);
  assert.ok(!h.calls.some((c) => c.name === 'klabs_claim_access_notification'));
});

test('unauthorised requests change nothing and send nothing', async () => {
  for (const [o, authorization, status] of [[{}, '', 401], [{ signedIn: false }, 'Bearer forged', 401], [{ isOwner: false }, 'Bearer builder-token', 403]]) {
    for (const body of [grant(), revoke, { action: 'retry_access_email', notificationId: noticeId }]) {
      const h = await harness(o);
      h.notice(noticeId, 'granted', END);
      const r = await h.send(body, authorization);
      assert.equal(r.status, status, `${body.action} ${status}`);
      assert.equal(h.sent.length, 0);
      assert.ok(!h.calls.some((c) => /admin_set|admin_revoke|klabs_claim|klabs_finish/.test(c.name)));
      assert.equal(h.store.get(noticeId).status, 'pending');
    }
  }
});

test('invalid requests are refused before any change: bad builder ID, bad date, missing reason, bad email ID', async () => {
  const h = await harness();
  assert.equal((await h.send(grant({ targetUserId: 'not-a-uuid' }))).status, 400);
  assert.match((await h.send(grant({ expiresAt: 'soon' }))).body.error, /valid expiry date/);
  assert.match((await h.send(grant({ reason: ' ' }))).body.error, /reason/);
  assert.match((await h.send({ action: 'retry_access_email', notificationId: 'x' })).body.error, /valid access email/);
  assert.ok(!h.calls.some((c) => /admin_set|admin_revoke/.test(c.name)));
  assert.equal(h.sent.length, 0);
});

// ---- The email itself (layout shared with the Q43b authentication emails) ----
test('every access email: branded table layout, inline styles, one Studio link (button + fallback), escaped address, no tracking', async () => {
  const { buildAccessEmail, EVENTS, COLORS } = await import('../supabase/functions/_shared/access-email.mjs');
  for (const event of EVENTS) {
    const m = buildAccessEmail({ event, email: 'o\'brien+<b>@example.test', accessExpiresAt: event === 'granted' ? null : END, previousExpiresAt: PREV });
    const html = m.html;
    assert.match(html, /^<!DOCTYPE html>\n<html lang="en">/);
    assert.match(html, /<meta name="color-scheme" content="dark">/);
    assert.match(html, /style="max-width:560px;"/);
    assert.match(html, /<!--\[if mso\]><table role="presentation" width="560"/);
    assert.ok(html.includes(`<title>${m.subject}</title>`));
    assert.ok(html.includes('o&#39;brien+&lt;b&gt;@example.test') && !html.includes('<b>@'), 'address escaped');
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]);
    assert.deepEqual([...new Set(hrefs)], ['https://studio.klabs.co.nz/']);
    assert.ok(hrefs.length >= 2);
    assert.match(html, />Open K-Labs Studio<\/a>/);
    assert.doesNotMatch(html, /<script|<img|<link|@import|url\(|@font-face|<form|<iframe|javascript:|gradient/i);
    const visible = html.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(m.text + visible, /guarantee|encrypted|100%|never ask|valid for|\{\{|\}\}|undefined|null|NaN|Invalid Date/i);
    assert.ok(m.subject.length <= 55 && !/!/.test(m.subject), m.subject);
    assert.ok(html.includes(COLORS.button) && html.includes(COLORS.panel));
    for (const tag of html.replace(/<!--[\s\S]*?-->/g, '').match(/<(td|p|h1|a)\b[^>]*>/g)) if (!/^<td align="center" style="padding:40px/.test(tag)) assert.match(tag, /style="/, tag);
  }
  assert.deepEqual(EVENTS.map((e) => buildAccessEmail({ event: e, email: 'a@example.test', accessExpiresAt: END }).subject), [
    'Your K-Labs Studio access is ready', 'Your Studio access has been extended',
    'Your K-Labs Studio access end date has changed', 'Your complimentary K-Labs Studio access has ended']);
});

test('dates are exact in New Zealand time, including daylight saving changes', async () => {
  const { formatExpiry } = await import('../supabase/functions/_shared/access-email.mjs');
  assert.equal(formatExpiry('2026-12-31T10:59:59.999Z'), '11:59 pm on Thursday 31 December 2026 (New Zealand time)'); // NZDT
  assert.equal(formatExpiry('2027-06-30T11:59:59.999Z'), '11:59 pm on Wednesday 30 June 2027 (New Zealand time)'); // NZST
  assert.throws(() => formatExpiry('not a date'), /valid access expiry/);
});

test('accessible contrast (WCAG AA 4.5:1) for every text colour on its background', async () => {
  const { COLORS: C } = await import('../supabase/functions/_shared/access-email.mjs');
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const [fg, bg] of [[C.text, C.panel], [C.heading, C.panel], [C.muted, C.panel], [C.link, C.panel], [C.titanium, C.page], [C.muted, C.page], [C.buttonText, C.button]]) {
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
  }
});

test('the Edge Function reads the Resend key and sender only from server secrets, and the browser never sends email', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const index = fs.readFileSync(path.join(root, 'supabase/functions/owner-admin/index.ts'), 'utf8');
  assert.match(index, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(index, /Deno\.env\.get\("ACCESS_EMAIL_FROM"\)/);
  for (const f of fs.readdirSync(path.join(root, 'js')).filter((x) => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(root, 'js', f), 'utf8');
    assert.doesNotMatch(s, /api\.resend\.com|RESEND_API_KEY|klabs_claim_access_notification|klabs_finish_access_notification/, f);
  }
});

test('an unexpected error while emailing after the change still reports the access as saved', async () => {
  const h = await harness();
  const { createOwnerAdminHandler } = await import('../supabase/functions/_shared/owner-admin-core.mjs');
  // The notification store throws (e.g. a dropped connection) after the change has committed.
  const handler = createOwnerAdminHandler({
    createUserClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: ownerId } }, error: null }) },
      rpc: async (name) => (name === 'klabs_is_owner' ? { data: true, error: null } : { data: { access_state: 'complimentary', notification_id: noticeId, notification_event: 'granted' }, error: null })
    }),
    serviceClient: { rpc: async () => { throw new Error('connection reset'); }, auth: { admin: { getUserById: async () => ({ data: null, error: null }) } } },
    publicAppUrl: 'https://studio.klabs.co.nz/', resendApiKey: 're_synthetic', accessEmailFrom: FROM, fetchImpl: async () => { throw new Error('must not send'); }
  });
  const res = await handler(new Request('https://edge.example.test/owner-admin', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(grant()) }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.accessSaved, true);
  assert.match(body.message, /^Access saved\. The email to the builder was NOT sent: The email step stopped unexpectedly\./);
  assert.equal(h.sent.length, 0);
});
