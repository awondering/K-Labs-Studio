// Q33 production regression: a device ran v278's page with v277's ui.js (dead Delivery and Advanced Pricing rows, a blank
// Total Price, "Rod Price", old Correct/Remove buttons). The page and the code now name their release and check each other.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const ui = read('js/ui.js');
const worker = read('service-worker.js');
const guardScript = /<script>\s*(\/\* Q33 production fix[\s\S]*?)<\/script>/.exec(html)[1];

test('the page, Studio\'s code, the service worker and the demo bar all name the same release', () => {
  const shell = /var BUILD = '([^']+)';/.exec(guardScript)[1];
  assert.equal(/window\.KLABS_UI_BUILD='([^']+)';/.exec(ui)[1], shell);
  assert.equal(/const APP_SHELL_VERSION='([^']+)';/.exec(worker)[1], shell);
  assert.equal(/data-demo-build="([^"]+)"/.exec(html)[1], shell);
  assert.ok(ui.indexOf("window.KLABS_UI_BUILD=") < ui.indexOf('window.KLABS_UI={'), 'the code names its release before it installs itself');
  assert.ok(html.indexOf('var BUILD =') < html.indexOf('<script src='), 'the check is in place before any script loads');
});

function page({ sessionValue } = {}) {
  const calls = { reloads: 0, deleted: [], updates: 0, errors: [], notice: null };
  const session = new Map(sessionValue ? [['klabs-shell-recovery', sessionValue]] : []);
  const body = { appendChild(node) { calls.notice = node.textContent; } };
  const window = {};
  const sandbox = {
    window, console: { error: (m) => calls.errors.push(m) }, Promise, Date, Number, String,
    sessionStorage: { getItem: (k) => session.get(k), setItem: (k, v) => session.set(k, v) },
    caches: { keys: async () => ['klabs-studio-app-shell-build148-v278'], delete: async (k) => { calls.deleted.push(k); return true; } },
    navigator: { serviceWorker: { getRegistrations: async () => [{ update: async () => { calls.updates++; } }] } },
    location: { reload() { calls.reloads++; } },
    document: { body, getElementById: () => null, createElement: () => ({ setAttribute() {}, style: {}, textContent: '' }), addEventListener() {} },
  };
  Object.assign(window, sandbox);
  vm.createContext(window);
  vm.runInContext(guardScript, window);
  return { window, calls, session };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

test('the same release installs normally: no reload, nothing cleared', async () => {
  const p = page();
  p.window.KLABS_UI_BUILD = p.window.KLABS_SHELL_BUILD;
  p.window.KLABS_UI = { render() {} };
  await settle();
  assert.equal(p.calls.reloads, 0);
  assert.deepEqual(p.calls.deleted, []);
  assert.equal(typeof p.window.KLABS_UI.render, 'function');
});

test('older code under this page (no release named): clear the cached files, check for the update, reload once', async () => {
  const p = page();
  p.window.KLABS_UI = { render() {} }; // v277/v278 ui.js names no release
  await settle(); await settle();
  assert.deepEqual(p.calls.deleted, ['klabs-studio-app-shell-build148-v278']);
  assert.equal(p.calls.updates, 1);
  assert.equal(p.calls.reloads, 1);
  assert.match(p.calls.errors[0], /is build148-v\d+ but Studio’s code is an older release/);
});

test('if the reload did not help, it says so plainly and does not loop', async () => {
  const p = page({ sessionValue: String(Date.now() - 5000) });
  p.window.KLABS_UI_BUILD = 'build148-v277';
  p.window.KLABS_UI = {};
  await settle();
  assert.equal(p.calls.reloads, 0);
  assert.equal(p.calls.notice, 'Studio is finishing an update. Close Studio completely, then open it again.');
});
