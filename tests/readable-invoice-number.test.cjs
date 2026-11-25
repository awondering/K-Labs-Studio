// Q7: readable invoice numbers (Q-1042 -> INV-1042). Synthetic records only; nothing is issued or synced.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  const ends = [source.indexOf('\nfunction ', start + 1), source.indexOf('\nasync function ', start + 1)].filter((v) => v >= 0);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}
const ACCOUNT = 'aaaaaaaa-0000-0000-0000-000000000001';
function harness({ quoteNumber = 'Q-1042', id = 'build-1', saved = [], quoteRecords = [], listsFail = false } = {}) {
  const quote = { id, quoteNumber, buildNumber: 'BUILD-901', customerName: 'Customer', buildName: 'Rod', includeGst: true,
    payments: [{ id: 'deposit', type: 'deposit', amount: 25, date: '2026-11-10' }] };
  const fail = () => { throw new Error('storage unavailable'); };
  const context = vm.createContext({ customerIncludedParts:()=>[],customerSafeText:(v)=>String(v==null?'':v),TextEncoder, quote, console: { warn() {} }, window: { KLABS_ACCOUNT_ID: ACCOUNT },
    savedBuildRecords: listsFail ? fail : () => saved, savedQuoteRecords: listsFail ? fail : () => quoteRecords,
    businessProfile: { businessName: 'Test business', gstNumber: '' },
    depositMaths: () => ({ total: 115, gst: 15, taxRate: 15 }), quoteTaxAvailable: () => true, activeTaxName: () => 'GST',
    activeTaxRegistrationLabel: () => 'GST Number', customerQuoteBusinessLines: () => [], customerAddressLines: () => [],
    customerDocumentLabels: () => ({}), customerSafeText: (v) => String(v ?? '').trim(), specificationValue: (v) => String(v ?? '').trim(),
    normalizeNameKey: (v) => String(v || '').toLowerCase().trim(), isBlankCategory: () => false, pendingComponentDraftRows: new Set(),
    customerComponentExcludedFromCopy: () => false, componentRowLibraryCategoryName: (i) => i.category,
    localDateInputValue: () => '2026-11-19', activeCurrencyCode: () => 'NZD', roundMoney: (v) => Math.round(v * 100) / 100,
    numberOrZero: (v) => Number(v) || 0, escapeHtml: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  });
  for (const name of ['normalizeJobType', 'normalizeJobKind', 'isComponentsJob', 'invoiceNumberForBuild', 'invoiceRodDescription', 'readableInvoiceNumberForJob',
    'invoiceDisplayNumber', 'issuedInvoiceRecordsForReadableNumber', 'buildInvoiceSnapshot', 'roundMoney','numberOrZero','customerPaymentLabels','customerPaymentStatus','customerTaxName','customerTotalLabel','paidInFullAcknowledgement','invoiceDocumentMarkup']) {
    vm.runInContext(extract(name), context);
  }
  return { context, quote };
}
const internal = (id) => `INV-${ACCOUNT.replace(/-/g, '')}-${Buffer.from(id).toString('hex')}`;
const issued = (id, invoice) => ({ id, issuedInvoice: invoice });
const shownNumber = (html) => (/Invoice number<\/dt><dd>([^<]*)</.exec(html) || [])[1];

test('Q7: Q-1042 issues as INV-1042; the internal number is unchanged and still matches the server formula', () => {
  const { context } = harness();
  const invoice = context.buildInvoiceSnapshot();
  assert.equal(invoice.displayNumber, 'INV-1042');
  assert.equal(invoice.number, internal('build-1'), 'server-checked identifier unchanged');
  const html = context.invoiceDocumentMarkup(invoice, invoice.payments, false);
  assert.equal(shownNumber(html), 'INV-1042');
  assert.match(html, new RegExp(`data-invoice-number="${invoice.number}"`), 'print check still uses the internal number');
  assert.match(html, /data-invoice-file="Invoice-INV-1042"/);
  assert.doesNotMatch(html.replace(/<article[^>]*>/, ''), new RegExp(invoice.number.slice(4, 20)), 'the long number is not shown on the document');
});

test('Q7: the payment statement shows the same readable number and names its file accordingly', () => {
  const { context } = harness();
  const invoice = context.buildInvoiceSnapshot();
  const html = context.invoiceDocumentMarkup(invoice, invoice.payments, true);
  assert.equal(shownNumber(html), 'INV-1042');
  assert.match(html, /data-invoice-file="Payment-Statement-INV-1042"/);
});

test('Q7: uses the quote sequence whatever the prefix; leading zeros kept', () => {
  for (const [quoteNumber, expected] of [['Q-1042', 'INV-1042'], ['KLQ1043', 'INV-1043'], ['1044', 'INV-1044'], ['Q-0900', 'INV-0900'], ['2026-Q-77', 'INV-77']]) {
    assert.equal(harness({ quoteNumber }).context.buildInvoiceSnapshot().displayNumber, expected, quoteNumber);
  }
});

test('Q7: previously issued invoices keep their original number everywhere (no readable number is added to them)', () => {
  const { context } = harness();
  const old = { number: internal('old-job'), issuedDate: '2026-11-01', total: 100, currency: 'NZD', payments: [] };
  const before = JSON.stringify(old);
  for (const statement of [false, true]) {
    const html = context.invoiceDocumentMarkup(old, [], statement);
    assert.equal(shownNumber(html), old.number);
    assert.doesNotMatch(html, /data-invoice-file=/, 'file name unchanged (Invoice.pdf / Payment-Statement.pdf)');
  }
  assert.equal(JSON.stringify(old), before, 'the stored invoice is not modified');
  assert.equal(context.invoiceDisplayNumber({ number: 'INV-LEGACY' }), 'INV-LEGACY');
});

test('Q7: no duplicate readable numbers in an account - an already-used sequence keeps the standard number', () => {
  const taken = [issued('other-job', { number: internal('other-job'), displayNumber: 'INV-1042' })];
  for (const records of [{ saved: taken }, { quoteRecords: taken }]) {
    const invoice = harness(records).context.buildInvoiceSnapshot();
    assert.equal(invoice.displayNumber, undefined);
    assert.equal(invoice.number, internal('build-1'));
  }
  const zeroPadded = [issued('other-job', { number: internal('other-job'), displayNumber: 'INV-01042' })];
  assert.equal(harness({ saved: zeroPadded }).context.buildInvoiceSnapshot().displayNumber, undefined, 'INV-01042 and INV-1042 count as the same');
  const free = [issued('other-job', { number: internal('other-job'), displayNumber: 'INV-1041' }),
    issued('old-job', { number: internal('old-job') }), { id: 'quote-only', quoteNumber: 'Q-1042' }];
  assert.equal(harness({ saved: free }).context.buildInvoiceSnapshot().displayNumber, 'INV-1042', 'different numbers, old invoices and un-invoiced quotes do not block');
  const self = [issued('build-1', { number: internal('build-1'), displayNumber: 'INV-1042' })];
  assert.equal(harness({ saved: self }).context.buildInvoiceSnapshot().displayNumber, 'INV-1042', 'its own record is not a duplicate');
});

test('Q7: when a safe readable number cannot be assigned the existing format is kept', () => {
  for (const quoteNumber of ['', 'DRAFT', 'Q-0', 'Q-12345678901234567890']) {
    const { context } = harness({ quoteNumber });
    const invoice = context.buildInvoiceSnapshot();
    assert.equal(invoice.displayNumber, undefined, quoteNumber);
    assert.equal(shownNumber(context.invoiceDocumentMarkup(invoice, invoice.payments, false)), internal('build-1'));
  }
  const unreadable = harness({ listsFail: true }).context.buildInvoiceSnapshot();
  assert.equal(unreadable.displayNumber, undefined, 'job list unreadable: duplicate check impossible, standard number kept');
  assert.equal(unreadable.number, internal('build-1'));
});

test('Q7: an invalid stored readable number is never shown', () => {
  const { context } = harness();
  for (const displayNumber of ['<b>1</b>', 'INV-12a', 'Q-1042', '']) {
    assert.equal(context.invoiceDisplayNumber({ number: 'INV-x', displayNumber }), 'INV-x', displayNumber);
  }
});

test('Q7: draft preview unchanged - no number, no date, no file name', () => {
  const { context } = harness();
  const draft = context.buildInvoiceSnapshot(true);
  assert.equal(draft.number, '');
  assert.equal(draft.displayNumber, undefined);
  const html = context.invoiceDocumentMarkup(draft, draft.payments, false, true);
  assert.doesNotMatch(html, /Invoice number|INV-|data-invoice-file/);
});

test('Q7: only the invoice snapshot gains displayNumber; quote numbering, totals and payments are untouched', () => {
  const { context, quote } = harness();
  const before = JSON.stringify(quote);
  const invoice = context.buildInvoiceSnapshot();
  assert.equal(JSON.stringify(quote), before, 'the job (quote number, payments) is not modified');
  assert.equal(invoice.total, 115);
  assert.deepEqual(JSON.parse(JSON.stringify(invoice.payments)), quote.payments);
  assert.match(extract('assignNextQuoteNumber'), /allocator\.allocate\(historicalQuoteSequenceFloor\(\)\)/, 'quote allocation unchanged');
});

test('Q7: PDF file name and print title use the readable number; drafts and old invoices keep their names', () => {
  const pdf = fs.readFileSync(path.join(root, 'js/invoice-pdf.js'), 'utf8');
  const line = /const name = .*;/.exec(pdf)[0];
  const name = (file, statement, draft) => new Function('file', 'statement', 'draft', `${line} return name;`)(file, statement, draft);
  assert.equal(name('Invoice-INV-1042', false, false), 'Invoice-INV-1042.pdf');
  assert.equal(name('Payment-Statement-INV-1042', true, false), 'Payment-Statement-INV-1042.pdf');
  assert.equal(name('', false, false), 'Invoice.pdf');
  assert.equal(name('', true, false), 'Payment-Statement.pdf');
  assert.equal(name('', false, true), 'Draft-Invoice.pdf');
  assert.equal(name('../x y', false, false), 'Invoice.pdf', 'unsafe file names ignored');
  assert.match(extract('printInvoicePreview'), /<title>\$\{escapeHtml\(\/\^\[A-Za-z0-9-\]\+\$\/\.test\(documentNode\.getAttribute\('data-invoice-file'\)/);
});

test('Q7: sync conflict summary shows the readable number, else the original', () => {
  const diff = fs.readFileSync(path.join(root, 'js/build-sync-diff.js'), 'utf8');
  const expr = /return `Invoice \$\{(.*?)\} \$\{value\.total/.exec(diff)[1];
  const show = (value) => new Function('value', `return ${expr};`)(value);
  assert.equal(show({ number: internal('a'), displayNumber: 'INV-1042' }), 'INV-1042');
  assert.equal(show({ number: internal('a') }), internal('a'));
  assert.equal(show({ number: internal('a'), displayNumber: '<x>' }), internal('a'));
});
