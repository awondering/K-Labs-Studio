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
    customerSafeText: value => String(value ?? '').trim(), specificationValue: value => String(value ?? '').trim(),
    normalizeNameKey: value => String(value || '').toLowerCase().trim(),
    isBlankCategory: category => String(category || '').toLowerCase() === 'blank',
    pendingComponentDraftRows: new Set(), customerComponentExcludedFromCopy: () => false,
    componentRowLibraryCategoryName: item => item.category, savedComponentDisplayLabel: item => item.description || item.category,
    localDateInputValue: () => '2026-11-11', activeCurrencyCode: () => 'NZD',
    roundMoney: value => Math.round(value * 100) / 100, numberOrZero: value => Number(value) || 0,
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  });
  for (const name of ['invoiceNumberForBuild', 'invoiceRodDescription', 'buildInvoiceSnapshot', 'invoiceDocumentMarkup']) {
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
  assert.match(original, /Subtotal excluding GST<\/dt><dd>100\.00 NZD/);
  assert.match(original, /GST \(15%\)<\/dt><dd>15\.00 NZD/);
  assert.match(original, /Total including GST<\/dt><dd>115\.00 NZD/);
  assert.match(original, /GST Number: REG-1/);
  assert.match(original, /90\.00 NZD/);
  assert.match(statement, /Paid in full/);
  assert.doesNotMatch(statement, /profit|margin|labour|purchase cost/i);
});
test('tax-disabled invoice omits tax breakdown and registration', () => {
  const { context } = harness(false);
  const snapshot = context.buildInvoiceSnapshot();
  const html = context.invoiceDocumentMarkup(snapshot, snapshot.payments, false);
  assert.equal(snapshot.tax, null);
  assert.doesNotMatch(html, /GST|REG-1/);
});
test('payment statement uses the immutable invoice total and current payment history', () => {
  const { context } = harness();
  const snapshot = context.buildInvoiceSnapshot();
  const saved = JSON.stringify(snapshot);
  const payments = [...snapshot.payments, { id: 'later', type: 'balance', amount: 20.25, date: '2026-11-12' }];
  const statement = context.invoiceDocumentMarkup(snapshot, payments, true);
  assert.match(statement, /Payment Statement/);
  assert.match(statement, /Total received<\/dt><dd>45\.25 NZD/);
  assert.match(statement, /Balance owing<\/dt><dd>69\.75 NZD/);
  assert.match(statement, /Balance payment<\/td><td>2026-11-12<\/td><td>20\.25 NZD/);
  assert.equal(JSON.stringify(snapshot), saved);
});
test('the preview uses the same layout without an invented invoice number or date', () => {
  const { context } = harness();
  const snapshot = context.buildInvoiceSnapshot(true);
  const html = context.invoiceDocumentMarkup(snapshot, snapshot.payments, false, true);
  assert.match(html, /class="invoice-document"/);
  assert.match(html, /data-invoice-issued="false"/);
  assert.match(html, /DRAFT — NOT ISSUED/);
  assert.doesNotMatch(html, /Invoice number|Issue date|INV-/);
  assert.equal(snapshot.number, '');
  assert.equal(snapshot.issuedDate, '');
});
test('customer details, tax labels, descriptions and payment data are escaped', () => {
  const { context } = harness();
  const snapshot = context.buildInvoiceSnapshot();
  snapshot.customerLines = ['A <script>alert(1)</script>', 'x'.repeat(500)];
  snapshot.rod = 'Rod <img src=x>';
  snapshot.tax.name = '<GST>';
  const html = context.invoiceDocumentMarkup(snapshot, [{ type: 'balance', amount: 10, date: '<date>' }], false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&lt;GST&gt;/);
  assert.match(html, /&lt;date&gt;/);
  assert.doesNotMatch(html, /<script>|<img src=x>/);
});
test('complete saved rod specifications become a concise customer-safe description', () => {
  const { context, quote } = harness();
  Object.assign(quote, {
    buildName: 'Harbour 702',
    blankMaker: 'Northstar', blankName: 'NS702', blankNotes: 'Line rating: 10–20 lb; Lure weight: 10–30 g; cost: $100',
    buildSpecifications: { layout: { rodLengthMm: 2134 }, rearGripLength: '280 mm', foreGripLength: '70 mm' },
    components: [
      { category: 'Blank', blankMaker: 'Northstar', blankName: 'NS702' },
      { category: 'Guides', description: 'Fuji K series', cost: 450, unitPrice: 800 },
      { category: 'Reel Seat', description: 'Fuji DPS', cost: 23 },
      { category: 'Labour', description: 'Private labour 200' },
    ],
  });
  const before = JSON.stringify(quote);
  const draft = context.buildInvoiceSnapshot(true);
  const issued = context.buildInvoiceSnapshot();
  assert.equal(issued.rod, 'Harbour 702');
  assert.deepEqual(Array.from(issued.rodDetails), [
    'Blank: Northstar NS702', 'Finished length 2134 mm · Line 10–20 lb · Lure 10–30 g',
    'Guides: Fuji K series · Reel seat: Fuji DPS · Grip: Rear 280 mm, Fore 70 mm',
  ]);
  assert.deepEqual(Array.from(draft.rodDetails), Array.from(issued.rodDetails));
  assert.equal(JSON.stringify(quote), before);
  const html = context.invoiceDocumentMarkup(issued, issued.payments, false);
  assert.doesNotMatch(html, /\$100|450|800|Private labour|profit|margin/i);
});
test('partial and missing specifications omit guesses, empty labels and private notes', () => {
  const { context, quote } = harness();
  quote.buildName = '';
  quote.blankMaker = 'Northstar';
  quote.blankName = 'NS702';
  quote.blankNotes = 'Line: PE 1–3; Lure: unspecified; internal cost: $150';
  quote.components = [{ category: 'Guides', description: 'margin $50' }];
  const partial = context.buildInvoiceSnapshot(true);
  assert.equal(partial.rod, 'Northstar NS702');
  assert.deepEqual(Array.from(partial.rodDetails), ['Line PE 1–3']);
  const html = context.invoiceDocumentMarkup(partial, partial.payments, false, true);
  assert.doesNotMatch(html, /Lure|Guides:|internal|150|margin/);
  quote.blankNotes = 'Line class PE3-6; 10–30 g lure rating';
  assert.deepEqual(Array.from(context.buildInvoiceSnapshot(true).rodDetails),
    ['Line PE3-6 · Lure 10–30 g']);
  quote.blankMaker = '';
  quote.blankName = '';
  quote.blankNotes = '';
  quote.components = [];
  const empty = context.buildInvoiceSnapshot(true);
  assert.equal(empty.rod, '');
  assert.deepEqual(Array.from(empty.rodDetails), []);
  assert.doesNotMatch(context.invoiceDocumentMarkup(empty, [], false, true), /Description|Custom Rod Build|undefined/);
});
test('fitted descriptions use saved component data, not a changed library label or internal amounts', () => {
  const { context, quote } = harness();
  context.savedComponentDisplayLabel = () => 'Changed library model';
  quote.components = [
    { category: 'Guides', brand: 'Fuji', variant: 'K series', description: 'Fuji K series' },
    { category: 'Reel Seat', description: 'NZD 50' },
    { category: 'Grip', description: 'Cork rear grip' },
  ];
  const snapshot = context.buildInvoiceSnapshot(true);
  assert.deepEqual(Array.from(snapshot.rodDetails), ['Guides: Fuji K series · Grip: Cork rear grip']);
  const html = context.invoiceDocumentMarkup(snapshot, snapshot.payments, false, true);
  assert.doesNotMatch(html, /Changed library model|NZD 50/);
});
test('issued descriptions are frozen for invoices and statements; legacy invoices are unchanged', () => {
  const { context, quote } = harness();
  quote.buildName = 'Original rod';
  quote.blankMaker = 'Northstar';
  quote.blankName = 'NS702';
  quote.buildSpecifications = { layout: { rodLengthMm: 2134 } };
  const snapshot = context.buildInvoiceSnapshot();
  const original = JSON.stringify(snapshot);
  quote.buildName = 'Changed rod';
  quote.blankName = 'Different blank';
  quote.buildSpecifications.layout.rodLengthMm = 2500;
  for (const statement of [false, true]) {
    const html = context.invoiceDocumentMarkup(snapshot, snapshot.payments, statement);
    assert.match(html, /Original rod/);
    assert.match(html, /Northstar NS702/);
    assert.match(html, /2134 mm/);
    assert.doesNotMatch(html, /Changed rod|Different blank|2500 mm/);
  }
  assert.equal(JSON.stringify(snapshot), original);
  const legacy = { ...snapshot, rod: 'Original legacy description' };
  delete legacy.rodDetails;
  const html = context.invoiceDocumentMarkup(legacy, legacy.payments, true);
  assert.match(html, /Original legacy description/);
  assert.doesNotMatch(html, /Northstar|2134 mm|Changed rod/);
});
