const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/ui.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const end = source.indexOf('\nfunction ', start + 1);
  const endAsync = source.indexOf('\nasync function ', start + 1);
  const ends = [end, endAsync].filter(value => value >= 0);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}
function harness(tax = true) {
  const quote = { id: 'build-😀', buildNumber: 'BUILD-901', customerName: '<Customer>',
    buildName: 'Test & rod', includeGst: tax, gstRate: 15,
    payments: [{ id: 'deposit', type: 'deposit', amount: 25, date: '2026-11-10' }] };
  const context = vm.createContext({ TextEncoder, quote, window: { KLABS_ACCOUNT_ID: 'aaaaaaaa-0000-0000-0000-000000000001' },
    businessProfile: { businessName: 'Test business', gstNumber: 'REG-1' },
    depositMaths: () => ({ total: 115, gst: tax ? 15 : 0, taxRate: 15 }),
    quoteTaxAvailable: () => tax, activeTaxName: () => 'GST', activeTaxRegistrationLabel: () => 'GST Number',
    customerQuoteBusinessLines: () => ['Business address', 'GST Number: REG-1'],
    customerAddressLines: () => ['Address'], customerDocumentLabels: () => ({ defaultRodName: 'Rod' }),
    customerSafeText: value => value, specificationValue: value => String(value ?? '').trim(),
    localDateInputValue: () => '2026-11-11', activeCurrencyCode: () => 'NZD',
    roundMoney: value => Math.round(value * 100) / 100, numberOrZero: value => Number(value) || 0,
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  });
  for (const name of ['invoiceNumberForBuild', 'buildInvoiceSnapshot', 'invoiceDocumentMarkup']) {
    vm.runInContext(extract(name), context);
  }
  return { context, quote };
}
test('invoice numbers encode the full build ID and account without collisions', () => {
  const { context } = harness();
  assert.notEqual(context.invoiceNumberForBuild('account-a', 'build-1'), context.invoiceNumberForBuild('account-a', 'build-2'));
  assert.notEqual(context.invoiceNumberForBuild('account-a', 'build-1'), context.invoiceNumberForBuild('account-b', 'build-1'));
  assert.match(context.invoiceNumberForBuild('account-a', '😀'), /f09f9880$/);
});
test('issued invoice snapshot remains unchanged while a statement reflects later payments', () => {
  const { context, quote } = harness();
  const snapshot = context.buildInvoiceSnapshot();
  const original = context.invoiceDocumentMarkup(snapshot, snapshot.payments, false);
  quote.payments.push({ id: 'balance', type: 'balance', amount: 90, date: '2026-11-11' });
  quote.customerName = 'Changed customer';
  const reprint = context.invoiceDocumentMarkup(snapshot, snapshot.payments, false);
  const statement = context.invoiceDocumentMarkup(snapshot, quote.payments, true);
  assert.equal(reprint, original);
  assert.match(original, /&lt;Customer&gt;/);
  assert.match(original, /GST included \(15%\).*15\.00 NZD/);
  assert.match(original, /GST Number: REG-1/);
  assert.match(original, /90\.00 NZD/);
  assert.match(statement, /PAID IN FULL/);
  assert.doesNotMatch(statement, /profit|margin|labour|purchase cost/i);
});
test('tax-disabled invoice omits tax breakdown and registration', () => {
  const { context } = harness(false);
  const snapshot = context.buildInvoiceSnapshot();
  const html = context.invoiceDocumentMarkup(snapshot, snapshot.payments, false);
  assert.equal(snapshot.tax, null);
  assert.doesNotMatch(html, /GST|REG-1/);
});
