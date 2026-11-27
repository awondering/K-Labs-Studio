// Q43 browser checks: emailed password-reset and invitation links in real WebKit with the real supabase-js. Supabase's
// server is SIMULATED by network routing (no request leaves this machine; no real account is touched).
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/password-recovery-browser.cjs [screenshot-dir]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const shots = process.argv[2] || '';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const window = {}; // read the project URL from the real config
new Function('window', fs.readFileSync(path.join(root, 'js/supabase-config.js'), 'utf8'))(window);
const SUPA = new URL(window.KLABS_SUPABASE.url).origin;

let passed = 0, failed = 0;
const ck = (tag, name, ok, detail) => { if (ok) passed++; else failed++; console.log(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${name}${ok ? '' : ' ' + JSON.stringify(detail)}`); };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
const USER = { id: '11111111-2222-3333-4444-555555555555', aud: 'authenticated', role: 'authenticated', email: 'builder@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-11-27T00:00:00Z' };
const jwt = () => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, email: USER.email, role: 'authenticated', aud: 'authenticated', exp: now() + 3600 })}.c2lnbmF0dXJl`;
const ENTITLEMENT = { access_state: 'trial_eligible', can_write: false, email_verified: true, server_time: new Date().toISOString() };

function serve() {
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const file = path.resolve(root, '.' + (p === '/' ? '/index.html' : decodeURIComponent(p)));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function open(browser, base, device, url) {
  const context = await browser.newContext({ viewport: { width: device.width, height: 844 }, isMobile: device.mobile, hasTouch: device.mobile, deviceScaleFactor: device.mobile ? 3 : 1, serviceWorkers: 'block' });
  const log = { updates: [], logouts: 0, tokens: 0, other: [], console: [], errors: [] };
  await context.route('**/*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.origin === base) return route.continue();
    if (u.origin !== SUPA) return route.abort('blockedbyclient');
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/auth/v1/user' && req.method() === 'GET') return json(200, USER);
    if (u.pathname === '/auth/v1/user' && req.method() === 'PUT') { log.updates.push(JSON.parse(req.postData() || '{}')); return json(200, USER); }
    if (u.pathname === '/auth/v1/logout') { log.logouts++; return route.fulfill({ status: 204, body: '' }); }
    if (u.pathname === '/auth/v1/token') { log.tokens++; return json(200, { access_token: jwt(), token_type: 'bearer', expires_in: 3600, expires_at: now() + 3600, refresh_token: 'simulated-refresh', user: USER }); }
    if (u.pathname === '/rest/v1/rpc/get_account_entitlement') return json(200, ENTITLEMENT);
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(200, false);
    log.other.push(`${req.method()} ${u.pathname}`);
    return json(404, {});
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => log.errors.push(String(e)));
  page.on('console', (m) => log.console.push(m.text()));
  await page.goto(base + url);
  return { context, page, log };
}

const state = (page) => page.evaluate(() => {
  const vis = (id) => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return !e.closest('[hidden]') && getComputedStyle(e).display !== 'none' && r.width > 0 && r.height > 0; };
  const st = (id) => { const s = getComputedStyle(document.getElementById(id)); return [s.backgroundImage, s.borderRadius, s.fontWeight, s.letterSpacing, s.textTransform, s.color].join('|'); };
  return {
    passwordForm: !document.getElementById('authNewPasswordForm').hidden && vis('newPassword') && vis('newPasswordConfirm') && vis('authSetPassword'),
    signInForm: vis('authEmail') && vis('authSignIn'), back: vis('authBackHome'), signUpLink: vis('authShowSignUp'),
    access: vis('accountAccessScreen'), lead: document.getElementById('authLead').textContent, message: document.getElementById('authMessage').textContent,
    focus: document.activeElement?.id || '', href: location.href, session: JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))),
    sameButton: st('authSetPassword') === st('authSignIn'),
    overflow: document.scrollingElement.scrollWidth - window.innerWidth,
    small: ['newPassword', 'newPasswordConfirm', 'authSetPassword', 'authCancelPassword'].filter((id) => vis(id) && document.getElementById(id).getBoundingClientRect().height < 44),
  };
});
const waitFor = async (page, fn, arg) => { try { await page.waitForFunction(fn, arg, { timeout: 8000 }); return true; } catch { return false; } };
const shot = async (page, tag, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${tag}-${name}.png`), fullPage: true }); };
const hashLink = (type) => `/#access_token=${jwt()}&expires_at=${now() + 3600}&expires_in=3600&refresh_token=simulated-refresh&token_type=bearer&type=${type}`;
const passwordShown = (page) => waitFor(page, () => !document.getElementById('authNewPasswordForm').hidden && document.getElementById('authScreen').style.display === 'flex');
const clean = (log, secret = '') => log.errors.length === 0 && !log.console.some((t) => /simulated-refresh|eyJ/.test(t) || (secret && t.includes(secret)));

async function run(browser, base, device) {
  const tag = device.tag;
  // 1. Recovery link -> Set New Password -> saved through Supabase Auth -> Studio's normal access flow.
  let { context, page, log } = await open(browser, base, device, hashLink('recovery'));
  let ok = await passwordShown(page);
  let s = await state(page);
  ck(tag, 'recovery link opens Set New Password (sign-in, sign-up and Back hidden)', ok && s.passwordForm && !s.signInForm && !s.back && !s.signUpLink && !s.access, s);
  ck(tag, 'recovery: names the account; focus in New password; tokens gone from the address; tab keeps only the link type',
    s.lead === `Choose a new password for ${USER.email}.` && s.focus === 'newPassword' && !/access_token|refresh_token/.test(s.href) && s.session === '{"klabs-password-setup":"recovery"}', s);
  ck(tag, `recovery: Studio button style reused; ${device.mobile ? '44 px touch targets; ' : ''}no sideways scroll`, s.sameButton && (!device.mobile || !s.small.length) && s.overflow <= 0, s);
  await shot(page, tag, '1-set-new-password');
  await page.fill('#newPassword', 'correct horse'); await page.fill('#newPasswordConfirm', 'correct house');
  await page.click('#authSetPassword');
  s = await state(page);
  ck(tag, 'mismatch is caught before Supabase', s.message === 'Passwords do not match.' && log.updates.length === 0, s);
  await page.fill('#newPasswordConfirm', 'correct horse');
  if (device.mobile) await page.tap('#authSetPassword'); else await page.press('#newPasswordConfirm', 'Enter');
  ok = await waitFor(page, () => !document.getElementById('accountAccessScreen').hidden);
  s = await state(page);
  ck(tag, `saved once through Supabase Auth (${device.mobile ? 'tap' : 'Enter'}), then Studio's access screen opens`, ok && log.updates.length === 1 && log.updates[0].password === 'correct horse' && s.access && s.session === '{}', { s, updates: log.updates.length });
  ck(tag, 'recovery: no page errors; no token or password in the console', clean(log, 'correct horse'), log);
  await shot(page, tag, '2-after-save');
  await context.close();

  // 2. Invitation link.
  ({ context, page, log } = await open(browser, base, device, hashLink('invite')));
  ok = await passwordShown(page);
  s = await state(page);
  ck(tag, 'invitation link asks the invited person to create a password', ok && s.passwordForm && s.lead === `Welcome to K-Labs Studio. Create a password for ${USER.email} to finish setting up your account.`, s);
  await page.reload();
  ok = await passwordShown(page);
  ck(tag, 'invitation: a reload in the same tab still asks for the password', ok && (await state(page)).passwordForm);
  await shot(page, tag, '3-invite');
  // Cancel ends the link sign-in on this device.
  await page.click('#authCancelPassword');
  ok = await waitFor(page, () => document.getElementById('authMessage').textContent === 'Your password was not changed.');
  s = await state(page);
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length);
  ck(tag, 'Cancel: back to Sign In, password unchanged, link sign-in removed from this device', ok && s.signInForm && !s.passwordForm && s.back && s.session === '{}' && stored === 0 && log.updates.length === 0, { s, stored });
  ck(tag, 'invitation: no page errors', clean(log), log);
  await context.close();

  // 3. Expired or already-used link.
  ({ context, page, log } = await open(browser, base, device, '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'));
  ok = await waitFor(page, () => /expired/.test(document.getElementById('authMessage').textContent));
  s = await state(page);
  ck(tag, 'expired link: Sign In with a clear message and a way to request another link; error removed from the address',
    ok && s.signInForm && !s.passwordForm && s.message === 'This link has expired or has already been used. Enter your email and choose Forgot password to get a new link. If you were invited, ask for a new invitation.'
    && s.focus === 'authEmail' && !/error/.test(s.href) && s.overflow <= 0, s);
  await shot(page, tag, '4-expired');
  ck(tag, 'expired: no page errors', clean(log), log);
  await context.close();

  // 4. Regression: ordinary Sign In still works and never shows the password form.
  ({ context, page, log } = await open(browser, base, device, '/'));
  await page.waitForSelector('#publicSignInBtn', { state: 'visible' });
  await page.click('#publicSignInBtn');
  s = await state(page);
  ck(tag, 'ordinary Sign In: unchanged screen, no Set New Password form', s.signInForm && !s.passwordForm && s.back && s.signUpLink && s.lead === 'Sign in to sync Studio across your devices.', s);
  await page.fill('#authEmail', USER.email); await page.fill('#authPassword', 'existing-password');
  await page.click('#authSignIn');
  ok = await waitFor(page, () => !document.getElementById('accountAccessScreen').hidden);
  ck(tag, 'ordinary Sign In signs in through Supabase as before', ok && log.tokens === 1 && log.updates.length === 0, log);
  ck(tag, 'sign-in: no page errors', clean(log, 'existing-password'), log);
  await context.close();
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.webkit.launch();
  try {
    for (const device of [{ tag: 'iphone-390', width: 390, mobile: true }, { tag: 'iphone-320', width: 320, mobile: true }, { tag: 'desktop-1280', width: 1280, mobile: false }]) await run(browser, base, device);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`password recovery browser: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
