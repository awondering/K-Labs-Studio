const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/studio-recovery-export.js'), 'utf8');

function harness(initial = {}) {
  const data = new Map(Object.entries(initial));
  const status = { textContent: '' };
  let handler, written, clicked = false, revoked = false;
  const storage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem() { throw new Error('Storage write attempted'); },
    removeItem() { throw new Error('Storage removal attempted'); }
  };
  class BlobStub {
    constructor(parts, options) { written = { text: parts.join(''), type: options.type }; }
  }
  const link = { click() { clicked = true; }, remove() {} };
  const button = { addEventListener(name, fn) { assert.equal(name, 'click'); handler = fn; } };
  const document = {
    getElementById(id) { return id === 'studioRecoveryExportBtn' ? button : status; },
    createElement(tag) { assert.equal(tag, 'a'); return link; },
    body: { appendChild(element) { assert.equal(element, link); } }
  };
  const window = {
    localStorage: storage,
    KLABS_RECOVERY_ACCOUNT: { id: 'account-a', email: 'a@example.test' },
    KLABS_UI: { readRecoveryDraft: () => ({ quote: { id: 'draft', payments: [25] }, hasUnsavedQuoteChanges: true }) },
    setTimeout(fn) { fn(); }
  };
  const context = {
    window, document, Blob: BlobStub,
    URL: { createObjectURL() { return 'blob:recovery'; }, revokeObjectURL() { revoked = true; } },
    console: { error() {} }
  };
  vm.runInNewContext(source, context);
  return { window, storage, status, link, handler: () => handler(), result: () => ({ written, clicked, revoked }), data };
}

test('downloaded JSON round-trips account records, payments, draft, pending journal and quarantined legacy data', () => {
  const values = {
    'klabs-workshop-builds:account-a': JSON.stringify([
      { id: 'build-1', payments: [{ amount: 25 }], issuedInvoice: { reference: 'i1' } },
      { id: 'customer-1', recordType: 'customer' }
    ]),
    'klabs-workshop-component-library:account-a': '[{"id":"component-1"}]',
    'klabs-studio-settings-pending:account-a': '{"rate":12}',
    'klabs-build-sync-journal:account-a': '{"pending":{"build-1":{"kind":"save"}},"conflicts":{"build-1":{"cloud":{"payments":[30]}}}}',
    'klabs-financial-operation:account-a': '{"id":"operation-1","buildId":"build-1"}',
    'klabs-financial-operation:account-b': '{"id":"other-operation"}',
    'klabs-workshop-builds': '[{"id":"unassigned"}]',
    'klabs-workshop-quote-current:local': '{"id":"anonymous"}',
    'klabs-workshop-builds:account-b': '[{"id":"other-account"}]',
    'sb-project-auth-token': '{"access_token":"secret"}'
  };
  const h = harness(values);
  h.handler();
  const { written, clicked, revoked } = h.result();
  assert.equal(clicked, true);
  assert.equal(revoked, true);
  assert.equal(written.type, 'application/json');
  const file = JSON.parse(written.text);
  assert.deepEqual(file.account, { id: 'account-a', email: 'a@example.test' });
  for (const [key, value] of Object.entries(file.accountLocalStorage)) assert.equal(value, values[key]);
  assert.deepEqual(JSON.parse(file.accountLocalStorage['klabs-workshop-builds:account-a']), JSON.parse(values['klabs-workshop-builds:account-a']));
  assert.equal(file.accountLocalStorage['klabs-build-sync-journal:account-a'], values['klabs-build-sync-journal:account-a']);
  assert.equal(file.accountLocalStorage['klabs-financial-operation:account-a'], values['klabs-financial-operation:account-a']);
  assert.equal(file.unassignedSharedLocalStorage['klabs-workshop-builds'], values['klabs-workshop-builds']);
  assert.equal(file.signedOutLocalStorage['klabs-workshop-quote-current:local'], values['klabs-workshop-quote-current:local']);
  assert.equal(file.liveDraft.quote.payments[0], 25);
  assert.ok(!written.text.includes('other-account'));
  assert.ok(!written.text.includes('other-operation'));
  assert.ok(!written.text.includes('secret'));
  assert.match(h.status.textContent, /Check Downloads or Files/);
  assert.match(file.limitations.join(' '), /pending deletion intentions/);
  assert.deepEqual(Object.fromEntries(h.data), values);
});

test('storage read errors and missing account or draft fail visibly without a download', () => {
  const h = harness();
  h.window.KLABS_RECOVERY_ACCOUNT = null;
  h.handler();
  assert.equal(h.result().clicked, false);
  assert.match(h.status.textContent, /Export failed.*account/);
  h.window.KLABS_RECOVERY_ACCOUNT = { id: 'account-a', email: 'a@example.test' };
  h.window.KLABS_UI.readRecoveryDraft = () => null;
  h.handler();
  assert.match(h.status.textContent, /Export failed.*draft/);
  h.window.KLABS_UI.readRecoveryDraft = () => ({ quote: {} });
  h.storage.getItem = () => { throw new Error('Storage unavailable'); };
  h.handler();
  assert.match(h.status.textContent, /Export failed.*Storage unavailable/);
  assert.equal(h.result().clicked, false);
});

test('export is wired to authenticated UI and cached for offline use', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const entry = fs.readFileSync(path.join(root, 'js/public-entry.js'), 'utf8');
  assert.match(html, /id="studioRecoveryExportBtn"/);
  assert.match(entry, /js\/studio-recovery-export\.js/);
  assert.match(worker, /js\/studio-recovery-export\.js/);
});
