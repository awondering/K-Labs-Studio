// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const start = source.indexOf('function invoiceDocumentMarkup(');
const end = source.indexOf('\nfunction ', start + 1);
const printStart = source.indexOf('function printInvoicePreview(');
const printEnd = source.indexOf('\nfunction ', printStart + 1);
const context = { roundMoney: n => Math.round(n * 100) / 100, numberOrZero: n => Number(n) || 0,
  localDateInputValue: () => '2026-11-15', escapeHtml: s => String(s).replace(/&/g, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
vm.runInNewContext(source.slice(start, end), context);
const invoice = { number: 'INV-synthetic-only', issuedDate: '2026-11-11', businessName: 'K-Labs',
  businessLines: ['Synthetic address', 'hello@example.test'], customerLines: ['Synthetic customer', 'Example Street'],
  buildReference: 'TEST-001', rod: 'Custom graphite rod',
  rodDetails: ['Blank: Northstar NS702', 'Finished length 2134 mm · Line 10–20 lb · Lure 10–30 g',
    'Guides: Fuji K series · Reel seat: Fuji DPS · Grip: Rear 280 mm'],
  currency: 'NZD', total: 115,
  tax: { name: 'GST', rate: 15, amount: 15, registration: 'GST Number: SYNTHETIC' },
  payments: [{ type: 'deposit', amount: 25, date: '2026-11-10' }] };
const css = fs.readFileSync(path.join(root, 'css/invoice-document.css'));
const logo = fs.readFileSync(path.join(root, 'assets/logo.svg'));

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    let markup = '';
    await page.route('http://invoice.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/css/invoice-document.css') return route.fulfill({ contentType: 'text/css', body: css });
      if (pathname === '/assets/logo.svg') return route.fulfill({ contentType: 'image/svg+xml', body: logo });
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body:
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/css/invoice-document.css"></head><body class="invoice-print">${markup}</body></html>` });
      return route.abort();
    });
    const show = async (data, payments, statement, preview = false) => {
      markup = context.invoiceDocumentMarkup(data, payments, statement, preview);
      await page.goto('http://invoice.test/', { waitUntil: 'load' });
      assert.equal(await page.locator('.invoice-document__logo').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.equal(await page.locator('link').evaluate(link => !!link.sheet), true);
    };
    await show(invoice, invoice.payments, false);
    let text = await page.locator('article').innerText();
    for (const value of ['Invoice', '100.00 NZD', '15.00 NZD', '115.00 NZD', '25.00 NZD', '90.00 NZD', 'GST Number: SYNTHETIC']) assert.ok(text.includes(value), value);
    for (const value of invoice.rodDetails) assert.ok(text.includes(value), value);
    assert.doesNotMatch(text, /draft — not issued|profit|margin|labour|purchase cost/i);
    await page.evaluate(number => {
      const body = document.createElement('div');
      body.id = 'invoicePreviewBody';
      body.appendChild(document.querySelector('article'));
      document.body.appendChild(body);
      window.quote = { issuedInvoice: { number } };
      window.$ = id => document.getElementById(id);
      window.escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
      window.openInfoDialog = (title, message) => { window.printFailure = `${title}: ${message}`; };
      const create = document.createElement.bind(document);
      document.createElement = function(name, ...args) {
        const element = create(name, ...args);
        if (name === 'iframe') element.addEventListener('load', () => {
          element.contentWindow.print = () => { window.printCalled = true; };
        }, { once: true });
        return element;
      };
    }, invoice.number);
    await page.addScriptTag({ content: source.slice(printStart, printEnd) });
    await page.evaluate(() => printInvoicePreview());
    await page.waitForFunction(() => window.printCalled || window.printFailure);
    assert.equal(await page.evaluate(() => window.printFailure || ''), '');
    assert.equal(await page.locator('iframe').evaluate(frame =>
      !!frame.contentDocument.querySelector('link').sheet &&
      frame.contentDocument.querySelector('img').naturalWidth > 0 &&
      !frame.contentDocument.body.textContent.includes('DRAFT — NOT ISSUED')), true);
    await page.locator('iframe').evaluate(frame => frame.remove());
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1);
    const box = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    assert.ok(box && Math.abs(Number(box[1]) - 595.28) < 1 && Math.abs(Number(box[2]) - 841.89) < 1, 'Expected A4 dimensions');
    if (process.env.INVOICE_PDF) fs.writeFileSync(process.env.INVOICE_PDF, pdf);
    if (process.env.INVOICE_SCREENSHOT) {
      await page.emulateMedia({ media: 'screen' });
      await page.screenshot({ path: process.env.INVOICE_SCREENSHOT, fullPage: true });
    }
    const realistic = { ...invoice,
      number: `INV-${'a'.repeat(32)}-${Buffer.from('12345678-1234-1234-1234-123456789012').toString('hex')}`,
      businessLines: ['K-Labs Studio', '123 Example Road', 'Example Suburb', 'Example City 1234',
        'New Zealand', 'hello@example.test', 'www.example.test'],
      customerLines: ['Synthetic Customer', 'Synthetic Company', '123 Example Road', 'Example Suburb',
        'Example City 1234', 'New Zealand', 'customer@example.test'],
      payments: [
        { type: 'deposit', amount: 25, date: '2026-11-10' },
        { type: 'balance', amount: 20, date: '2026-11-11' },
      ],
    };
    await page.emulateMedia({ media: 'screen' });
    await show(realistic, realistic.payments, false);
    await page.emulateMedia({ media: 'print' });
    const realisticPdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.equal((realisticPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1,
      'A typical detailed invoice including its footer should fit on one A4 page');
    if (process.env.INVOICE_REALISTIC_PDF) fs.writeFileSync(process.env.INVOICE_REALISTIC_PDF, realisticPdf);
    await page.emulateMedia({ media: 'screen' });
    await show({ ...realistic, number: '', issuedDate: '' }, realistic.payments, false, true);
    await page.emulateMedia({ media: 'print' });
    const realisticDraftPdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.equal((realisticDraftPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1,
      'A typical detailed draft including its footer should fit on one A4 page');
    await page.emulateMedia({ media: 'screen' });
    const draft = { ...invoice, number: '', issuedDate: '' };
    await show(draft, draft.payments, false, true);
    text = await page.locator('article').innerText();
    assert.match(text, /DRAFT — NOT ISSUED/);
    for (const value of invoice.rodDetails) assert.ok(text.includes(value), value);
    assert.doesNotMatch(text, /Invoice number|Issue date|INV-/);
    await page.evaluate(() => {
      const body = document.createElement('div');
      body.id = 'invoicePreviewBody';
      body.appendChild(document.querySelector('article'));
      document.body.appendChild(body);
      window.quote = {};
      window.$ = id => document.getElementById(id);
      window.escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
      window.openInfoDialog = (title, message) => { window.printFailure = `${title}: ${message}`; };
      const create = document.createElement.bind(document);
      document.createElement = function(name, ...args) {
        const element = create(name, ...args);
        if (name === 'iframe') element.addEventListener('load', () => {
          element.contentWindow.print = () => { window.printCalled = true; };
        }, { once: true });
        return element;
      };
    });
    await page.addScriptTag({ content: source.slice(printStart, printEnd) });
    await page.evaluate(() => printInvoicePreview());
    await page.waitForFunction(() => window.printCalled || window.printFailure);
    assert.equal(await page.evaluate(() => window.printFailure || ''), '');
    const draftFrame = await page.locator('iframe').evaluate(frame => frame.contentDocument.body.innerHTML);
    assert.match(draftFrame, /DRAFT — NOT ISSUED/);
    assert.doesNotMatch(draftFrame, /Invoice number|Issue date|INV-/);
    await page.locator('iframe').evaluate(frame => frame.remove());
    await page.emulateMedia({ media: 'print' });
    const draftPdf = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.equal(draftPdf.subarray(0, 5).toString(), '%PDF-');
    if (process.env.INVOICE_DRAFT_PDF) fs.writeFileSync(process.env.INVOICE_DRAFT_PDF, draftPdf);

    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    const long = { ...invoice, number: 'INV-' + 'abcdef'.repeat(35),
      customerLines: ['Long synthetic customer name', 'long-address-'.repeat(40), 'customer@example.test'],
      rod: 'Custom rod '.repeat(30), tax: null };
    const payments = Array.from({ length: 75 }, (_, i) =>
      ({ type: i === 0 ? 'deposit' : 'balance', amount: 1, date: '2026-11-10' }));
    await show(long, payments, true);
    text = await page.locator('article').innerText();
    assert.match(text, /Payment Statement/);
    for (const value of invoice.rodDetails) assert.ok(text.includes(value), value);
    assert.match(text, /40\.00 NZD/);
    assert.doesNotMatch(text, /GST|SYNTHETIC.*Number/);
    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
      logo: getComputedStyle(document.querySelector('.invoice-document__logo')).width,
    }));
    assert.ok(dimensions.scroll <= dimensions.viewport, JSON.stringify(dimensions));
    assert.equal(dimensions.logo, '34px');
    await page.emulateMedia({ media: 'print' });
    const multipage = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.ok((multipage.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length > 1, 'Expected multiple A4 pages');
    if (process.env.INVOICE_MULTIPAGE_PDF) fs.writeFileSync(process.env.INVOICE_MULTIPAGE_PDF, multipage);
    assert.equal(await page.locator('tbody tr').count(), 75);
    await page.emulateMedia({ media: 'screen' });
    await show(long, payments, false);
    await page.emulateMedia({ media: 'print' });
    const longInvoice = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    assert.ok((longInvoice.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length > 1, 'Expected a multi-page invoice');
    if (process.env.INVOICE_MULTIPAGE_INVOICE_PDF) fs.writeFileSync(process.env.INVOICE_MULTIPAGE_INVOICE_PDF, longInvoice);
    console.log('PASS: invoice and statement render with brand assets, correct totals, responsive long content, one-page A4 and multi-page PDFs.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
