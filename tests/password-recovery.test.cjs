// Q43: password reset and invitation links open Set New Password in Studio, save it through Supabase Auth, and handle
// expired, invalid and already-used links. Supabase is simulated; no real account is touched.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'studio.css'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'supabase-client.js'), 'utf8');
const entry = fs.readFileSync(path.join(root, 'js', 'public-entry.js'), 'utf8');

const TOKEN = 'secret-access-token-value';
const REFRESH = 'secret-refresh-token-value';
const SESSION = { user: { id: 'user-1', email: 'builder@example.com' }, access_token: TOKEN };
const IDS = ['authEmail', 'authPassword', 'authMessage', 'authSignIn', 'authForgotPassword', 'authTogglePassword', 'authScreen', 'app',
  'authForm', 'authSignUpForm', 'authShowSignUp', 'authShowSignIn', 'signUpEmail', 'signUpPassword', 'signUpConfirm', 'authSignUp',
  'authBackHome', 'authLead', 'authNewPasswordForm', 'newPassword', 'newPasswordConfirm', 'authSetPassword', 'authCancelPassword', 'settingsSignOut'];

function harness({ hash = '', search = '', stored = {}, session = SESSION, updateUser = async () => ({ error: null }), reset = async () => ({ error: null }) } = {}) {
  const els = {};
  for (const id of IDS) {
    els[id] = { id, value: '', textContent: '', hidden: false, style: {}, attrs: {}, listeners: {}, dataset: {}, focused: 0,
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(n, f) { this.listeners[n] = f; }, focus() { this.focused += 1; } };
  }
  els.authLead.textContent = 'Sign in to sync Studio across your devices.';
  els.authNewPasswordForm.hidden = true;
  els.authSignUpForm.hidden = true;
  const calls = { updateUser: [], reset: [], signOut: [], getSession: 0, applySession: 0, showAuth: 0, replaceState: [] };
  const logs = [];
  const storage = { ...stored };
  let current = session;
  const sandbox = {
    console: { error: (...a) => logs.push(a), warn: (...a) => logs.push(a), log: (...a) => logs.push(a) },
    setTimeout, clearTimeout, URLSearchParams,
    window: {
      supabase: { createClient: () => ({ auth: {
        getSession: async () => { calls.getSession += 1; return { data: { session: current }, error: null }; },
        updateUser: async (args) => { calls.updateUser.push(args); return updateUser(args); },
        resetPasswordForEmail: async (email, options) => { calls.reset.push([email, options]); return reset(); },
        signOut: async (options) => { calls.signOut.push(options); current = null; return {}; },
        signInWithPassword: async () => ({ error: null }),
        signUp: async () => ({ data: {}, error: null }),
        onAuthStateChange: () => {},
      } }) },
      KLABS_SUPABASE: { url: 'u', publishableKey: 'k' },
      KLABS_PUBLIC_ENTRY: {
        showAuth() { calls.showAuth += 1; els.authForm.hidden = false; els.authShowSignUp.hidden = false; els.authSignUpForm.hidden = true;
          els.authNewPasswordForm.hidden = true; els.authBackHome.hidden = false; els.app.style.display = 'none'; els.authScreen.style.display = 'flex'; },
        async applySession(s) { calls.applySession += 1; if (s) els.authScreen.style.display = 'none'; },
        showHome() {}, isLoading: () => false,
      },
      sessionStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: (k) => { delete storage[k]; } },
      localStorage: { getItem: () => null },
      history: { state: null, replaceState: (s, t, url) => calls.replaceState.push(url) },
      location: { protocol: 'https:', origin: 'https://studio.klabs.co.nz', pathname: '/index.html', hash, search },
      navigator: { onLine: true },
      scrollTo() {},
    },
    document: {
      body: { classList: { add() {}, remove() {}, contains: () => false, toggle() {} } },
      getElementById: (id) => els[id] || null,
      querySelector: () => null,
      addEventListener: (n, f) => { if (n === 'DOMContentLoaded') sandbox.ready = f; },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  sandbox.ready();
  const submit = () => els.authNewPasswordForm.listeners.submit({ preventDefault() {} });
  return { els, calls, storage, logs, submit };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const RECOVERY = `#access_token=${TOKEN}&expires_in=3600&refresh_token=${REFRESH}&token_type=bearer&type=recovery`;
const INVITE = `#access_token=${TOKEN}&expires_in=3600&refresh_token=${REFRESH}&token_type=bearer&type=invite`;
const EXPIRED = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
const passwordScreen = (els) => !els.authNewPasswordForm.hidden && els.authForm.hidden && els.authShowSignUp.hidden && els.authBackHome.hidden
  && els.authScreen.style.display === 'flex';

test('markup: a dedicated Set New Password form in the sign-in screen, reusing the global auth styles', () => {
  const form = html.match(/<form id="authNewPasswordForm"[\s\S]*?<\/form>/)[0];
  assert.match(form, /<form id="authNewPasswordForm" class="auth-form" hidden novalidate>/);
  assert.equal((form.match(/autocomplete="new-password"/g) || []).length, 2);
  assert.match(form, /<button id="authSetPassword" type="submit">Save Password<\/button>/);
  assert.match(form, /<button id="authCancelPassword" class="auth-link-button" type="button">Cancel and sign out<\/button>/);
  assert.equal((form.match(/type="submit"/g) || []).length, 1);
  assert.match(html, /<p id="authLead">Sign in to sync Studio across your devices\.<\/p>/);
  // The Save button shares the Create Account rule; no new one-off rule.
  assert.match(css, /#authScreen #authSignUp,#authScreen #authSetPassword\{/);
  assert.doesNotMatch(css.replace('#authScreen #authSignUp,#authScreen #authSetPassword{', ''), /#authSetPassword|#authNewPasswordForm|#newPassword/);
  // The ordinary sign-in screen never shows it.
  assert.match(entry, /if \(newPasswordForm\) newPasswordForm\.hidden = true;/);
  assert.match(entry, /window\.KLABS_PUBLIC_ENTRY = \{[^}]*showAuth/);
});

test('Forgot password asks Supabase to return to this Studio page', async () => {
  const h = harness({ session: null });
  await settle();
  h.els.authEmail.value = ' builder@example.com ';
  await h.els.authForgotPassword.listeners.click();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.reset)), [['builder@example.com', { redirectTo: 'https://studio.klabs.co.nz/' }]]);
  assert.equal(h.els.authMessage.textContent, 'Password reset email sent.');
});

test('a valid recovery link opens Set New Password instead of Studio; only the link type is kept, never a token', async () => {
  const h = harness({ hash: RECOVERY });
  await settle();
  assert.ok(passwordScreen(h.els), 'password screen shown');
  assert.equal(h.els.authLead.textContent, 'Choose a new password for builder@example.com.');
  assert.equal(h.calls.applySession, 0, 'Studio does not open before the password is set');
  assert.ok(h.els.newPassword.focused > 0);
  assert.deepEqual(h.storage, { 'klabs-password-setup': 'recovery' });
  assert.ok(!JSON.stringify(h.storage).includes(TOKEN) && !JSON.stringify(h.logs).includes(TOKEN));
});

test('an invitation link asks the invited person to create their password', async () => {
  const h = harness({ hash: INVITE });
  await settle();
  assert.ok(passwordScreen(h.els));
  assert.equal(h.els.authLead.textContent, 'Welcome to K-Labs Studio. Create a password for builder@example.com to finish setting up your account.');
  assert.equal(h.storage['klabs-password-setup'], 'invite');
});

test('a reload in the same tab still asks for the password', async () => {
  const h = harness({ stored: { 'klabs-password-setup': 'recovery' } });
  await settle();
  assert.ok(passwordScreen(h.els));
  assert.equal(h.calls.applySession, 0);
});

test('validation: too short or not matching never reaches Supabase', async () => {
  const h = harness({ hash: RECOVERY });
  await settle();
  h.els.newPassword.value = '12345'; h.els.newPasswordConfirm.value = '12345';
  await h.submit();
  assert.equal(h.els.authMessage.textContent, 'Password must be at least 6 characters.');
  h.els.newPassword.value = 'correct horse'; h.els.newPasswordConfirm.value = 'correct house';
  await h.submit();
  assert.equal(h.els.authMessage.textContent, 'Passwords do not match.');
  assert.equal(h.calls.updateUser.length, 0);
});

test('success: saves once through Supabase Auth, clears the fields and the link state, then opens Studio', async () => {
  let release;
  const h = harness({ hash: INVITE, updateUser: () => new Promise((r) => { release = r; }) });
  await settle();
  h.els.newPassword.value = 'correct horse'; h.els.newPasswordConfirm.value = 'correct horse';
  h.submit(); h.submit();
  assert.equal(h.els.authMessage.textContent, 'Saving password...');
  assert.equal(h.els.authSetPassword.attrs['aria-busy'], 'true');
  assert.equal(h.calls.updateUser.length, 1, 'a second tap while saving is ignored');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.updateUser[0])), { password: 'correct horse' });
  release({ error: null });
  await settle();
  assert.equal(h.els.newPassword.value, ''); assert.equal(h.els.newPasswordConfirm.value, '');
  assert.deepEqual(h.storage, {});
  assert.equal(h.calls.applySession, 1, 'Studio opens through the normal access checks');
  assert.equal(h.els.authSetPassword.attrs['aria-busy'], undefined);
  assert.ok(!JSON.stringify(h.logs).includes('correct horse'), 'the password is never logged');
});

test('a rejected password (e.g. weak or same as before) shows Supabase\'s reason and can be retried', async () => {
  let n = 0;
  const h = harness({ hash: RECOVERY, updateUser: async () => (++n === 1 ? { error: { status: 422, message: 'New password should be different from the old password.' } } : { error: null }) });
  await settle();
  h.els.newPassword.value = 'same-as-before'; h.els.newPasswordConfirm.value = 'same-as-before';
  await h.submit(); await settle();
  assert.equal(h.els.authMessage.textContent, 'New password should be different from the old password.');
  assert.equal(h.storage['klabs-password-setup'], 'recovery');
  assert.ok(passwordScreen(h.els));
  h.els.newPassword.value = 'a-new-one'; h.els.newPasswordConfirm.value = 'a-new-one';
  await h.submit(); await settle();
  assert.equal(h.calls.updateUser.length, 2);
  assert.equal(h.calls.applySession, 1);
});

test('a connection failure keeps the form and says so', async () => {
  const h = harness({ hash: RECOVERY, updateUser: async () => { throw new TypeError('Failed to fetch'); } });
  await settle();
  h.els.newPassword.value = 'correct horse'; h.els.newPasswordConfirm.value = 'correct horse';
  await h.submit(); await settle();
  assert.equal(h.els.authMessage.textContent, 'Could not save the password. Check your connection and try again.');
  assert.ok(passwordScreen(h.els));
});

test('the link sign-in ended before saving: asks for a new link', async () => {
  const h = harness({ hash: RECOVERY, updateUser: async () => ({ error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' } }) });
  await settle();
  h.els.newPassword.value = 'correct horse'; h.els.newPasswordConfirm.value = 'correct horse';
  await h.submit(); await settle();
  assert.match(h.els.authMessage.textContent, /^This link has expired or has already been used\. Enter your email and choose Forgot password/);
  assert.ok(!h.els.authForm.hidden && h.els.authNewPasswordForm.hidden);
  assert.equal(h.els.newPassword.value, '');
  assert.deepEqual(h.storage, {});
});

test('an expired or already-used link: the error is removed from the address and the sign-in screen offers a new link', async () => {
  const h = harness({ hash: EXPIRED, search: '', session: null });
  await settle();
  assert.deepEqual(h.calls.replaceState, ['/index.html']);
  assert.ok(!h.els.authForm.hidden && h.els.authNewPasswordForm.hidden && h.els.authScreen.style.display === 'flex');
  assert.equal(h.els.authMessage.textContent, 'This link has expired or has already been used. Enter your email and choose Forgot password to get a new link. If you were invited, ask for a new invitation.');
  assert.ok(h.els.authEmail.focused > 0);
  assert.equal(h.calls.applySession, 0);
});

test('an invalid link (other error, or a recovery link that did not sign in) gets the not-valid message', async () => {
  const other = harness({ search: '?error=server_error&error_description=x', session: null });
  await settle();
  assert.match(other.els.authMessage.textContent, /^This link is not valid or has already been used\./);
  assert.deepEqual(other.calls.replaceState, ['/index.html']);
  const noSession = harness({ hash: RECOVERY, session: null });
  await settle();
  assert.match(noSession.els.authMessage.textContent, /^This link is not valid or has already been used\./);
  assert.deepEqual(noSession.storage, {});
});

test('a failed link on a device that is still signed in opens Studio as usual', async () => {
  const h = harness({ hash: EXPIRED });
  await settle();
  assert.equal(h.calls.applySession, 1);
});

test('Cancel ends the link sign-in on this device and leaves the password unchanged', async () => {
  const h = harness({ hash: RECOVERY });
  await settle();
  h.els.newPassword.value = 'typed';
  await h.els.authCancelPassword.listeners.click(); await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.signOut)), [{ scope: 'local' }]);
  assert.deepEqual(h.storage, {});
  assert.equal(h.els.newPassword.value, '');
  assert.ok(!h.els.authForm.hidden && h.els.authNewPasswordForm.hidden && !h.els.authBackHome.hidden);
  assert.equal(h.els.authMessage.textContent, 'Your password was not changed.');
  assert.equal(h.els.authLead.textContent, 'Sign in to sync Studio across your devices.');
  assert.equal(h.calls.updateUser.length, 0);
});

test('no link: the normal launch restores the session exactly as before', async () => {
  const h = harness();
  await settle();
  assert.equal(h.calls.applySession, 1);
  assert.equal(h.calls.replaceState.length, 0);
  assert.ok(h.els.authNewPasswordForm.hidden);
  assert.deepEqual(h.storage, {});
});

test('sign-up keeps its confirmation redirect', () => {
  assert.match(source, /const options = klabsAuthRedirectOptions\("emailRedirectTo"\);/);
  assert.match(source, /resetPasswordForEmail\(email, klabsAuthRedirectOptions\("redirectTo"\)\)/);
});
