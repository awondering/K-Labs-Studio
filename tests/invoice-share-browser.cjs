// Run with PLAYWRIGHT_MODULE and PDFJS_MODULE pointing to installed modules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}
const functions = ['invoiceDocumentMarkup', 'refreshInvoicePreview', 'updateInvoicePreview',
  'openInvoicePreview', 'openPaymentStatement', 'printInvoicePreview'].map(extract).join('\n');
const invoice = {
  number: `INV-${'a'.repeat(32)}-${Buffer.from('12345678-1234-1234-1234-123456789012').toString('hex')}`,
  issuedDate: '2026-11-11', businessName: 'K-Labs',
  businessLines: ['Synthetic address', 'Example suburb', 'Example city', 'New Zealand', 'hello@example.test'],
  customerLines: ['Synthetic customer', 'Example company', 'Example Street', 'Example suburb', 'Example city', 'New Zealand'],
  buildReference: 'TEST-001', rod: 'Custom graphite rod', rodDetails: ['Blank: Northstar NS702'],
  currency: 'NZD', total: 115, tax: { name: 'GST', rate: 15, amount: 15, registration: 'GST Number: SYNTHETIC' },
  payments: [{ type: 'deposit', amount: 25, date: '2026-11-10' }]
};

async function main() {
  const pdfjs = await import(process.env.PDFJS_MODULE);
  const engine = process.env.INVOICE_BROWSER || 'chromium';
  const browser = await playwright[engine].launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('http://invoice.test/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/') return route.fulfill({ contentType: 'text/html', body:
        '<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/invoice-document.css"><body></body>' });
      const file = path.resolve(root, `.${pathname}`);
      if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) return route.abort();
      const type = pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.css') ? 'text/css' : 'image/svg+xml';
      return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
    });
    await page.goto('http://invoice.test/');
    await page.evaluate(data => {
      window.syntheticInvoice = data;
      window.quote = { issuedInvoice: data, payments: data.payments };
      window.$ = id => document.getElementById(id);
      window.roundMoney = n => Math.round(n * 100) / 100;
      window.numberOrZero = n => Number(n) || 0;
      window.localDateInputValue = () => '2026-11-15';
      window.escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      window.lockModalLayer = () => {};
      window.unlockModalLayer = () => {};
      window.openInfoDialog = (title, message) => { window.pdfFailure = `${title}: ${message}`; };
      Object.defineProperty(navigator, 'standalone', { value: true });
      navigator.canShare = ({ files }) => files.length === 1 && files[0].type === 'application/pdf';
      navigator.share = async ({ files }) => {
        window.sharedWithActivation = navigator.userActivation ? navigator.userActivation.isActive : null;
        window.sharedName = files[0].name;
        window.sharedBytes = Array.from(new Uint8Array(await files[0].arrayBuffer()));
      };
    }, invoice);
    await page.addScriptTag({ url: '/js/invoice-pdf.js' });
    await page.addScriptTag({ content: functions });

    async function sharedPdf() {
      const button = page.locator('[data-invoice-preview-action="print"]');
      await button.waitFor({ state: 'visible' });
      await page.waitForFunction(() => !document.querySelector('[data-invoice-preview-action="print"]').disabled);
      await button.click();
      await page.waitForFunction(() => window.sharedBytes || window.pdfFailure);
      const failure = await page.evaluate(() => window.pdfFailure || '');
      assert.equal(failure, '');
      const active = await page.evaluate(() => window.sharedWithActivation);
      if (active !== null) assert.equal(active, true, 'Sharing must start in the button gesture');
      const bytes = Uint8Array.from(await page.evaluate(() => window.sharedBytes));
      const name = await page.evaluate(() => { const name = window.sharedName; window.sharedBytes = null; return name; });
      if (process.env.INVOICE_SHARED_PDF && name === 'Invoice.pdf' && !fs.existsSync(process.env.INVOICE_SHARED_PDF)) {
        fs.writeFileSync(process.env.INVOICE_SHARED_PDF, bytes);
      }
      const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
        const pages = [];
        let images = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        const pdfPage = await pdf.getPage(i);
        const viewport = pdfPage.getViewport({ scale: 1 });
        assert.ok(Math.abs(viewport.width - 595.28) < 1 && Math.abs(viewport.height - 841.89) < 1);
          const content = await pdfPage.getTextContent();
          for (const item of content.items) {
            if (!item.str.trim()) continue;
            const x = item.transform[4], y = item.transform[5];
            assert.ok(x >= 45 && x + item.width <= viewport.width - 45 && y >= 35 && y <= viewport.height - 35,
              `Text outside the printable A4 area: ${item.str} at ${x}, ${y}`);
          }
          const operators = await pdfPage.getOperatorList();
          images += operators.fnArray.filter(fn => fn === pdfjs.OPS.paintImageXObject).length;
          pages.push(content);
        }
        return { name, pages, images, text: pages.map(p => p.items.map(item => item.str + (item.hasEOL ? '\n' : '')).join('')).join('\n') };
    }

    await page.evaluate(() => openInvoicePreview());
    let result = await sharedPdf();
    assert.equal(result.name, 'Invoice.pdf');
    assert.equal(result.pages.length, 1);
    for (const expected of ['Invoice', 'Synthetic customer', '100.00 NZD', '15.00 NZD',
      '115.00 NZD', '25.00 NZD', '90.00 NZD', 'GST Number: SYNTHETIC']) assert.ok(result.text.includes(expected), `${expected}: ${result.text}`);
    assert.ok(result.text.replace(/\s/g, '').includes(invoice.number), 'Full invoice number must be present');
    assert.doesNotMatch(result.text, /DRAFT|NOT ISSUED/);
    assert.match(result.text, /GST Number: SYNTHETIC/, 'Footer must be on the A4 page');

    await page.evaluate(() => {
      quote.issuedInvoice = null;
      window.customerInvoicePreviewMarkup = () => invoiceDocumentMarkup(
        { ...syntheticInvoice, number: '', issuedDate: '' }, syntheticInvoice.payments, false, true);
      document.querySelector('#invoicePreviewSheet').hidden = true;
      openInvoicePreview();
    });
    result = await sharedPdf();
    assert.equal(result.name, 'Draft-Invoice.pdf');
    assert.equal(result.pages.length, 1);
    assert.match(result.text, /DRAFT.*NOT ISSUED/);
    assert.doesNotMatch(result.text, /Invoice number|Issue date/);

    await page.evaluate(() => {
      quote.issuedInvoice = syntheticInvoice;
      quote.payments = Array.from({ length: 75 }, (_, i) =>
        ({ type: i === 0 ? 'deposit' : 'balance', amount: i + 1, date: '2026-11-10' }));
      document.querySelector('#invoicePreviewSheet').hidden = true;
      openPaymentStatement();
    });
    result = await sharedPdf();
    assert.equal(result.name, 'Payment-Statement.pdf');
    assert.ok(result.pages.length > 1);
    assert.match(result.text, /Payment\s+Statement/);
    assert.doesNotMatch(result.text, /DRAFT.*NOT ISSUED/);
    for (let i = 1; i <= 75; i++) assert.match(result.text, new RegExp(`(?:^|\\s)${i}\\.00 NZD(?:\\s|$)`), `Missing payment ${i}`);
    assert.match(result.text, /GST Number: SYNTHETIC/);

    await page.evaluate(() => {
      syntheticInvoice.customerLines = ['Synthetic customer', 'long-address-'.repeat(35)];
      syntheticInvoice.rodDetails = ['Description '.repeat(220)];
      quote.payments = syntheticInvoice.payments;
      document.querySelector('#invoicePreviewSheet').hidden = true;
      openInvoicePreview();
    });
    result = await sharedPdf();
    assert.ok(result.pages.length > 1, 'Long content must paginate');
    assert.ok(result.text.replace(/\s/g, '').includes('long-address-'.repeat(35)), 'Long address must not be truncated');
    assert.ok(result.text.replace(/\s/g, '').includes('Description'.repeat(220)), 'Long description must not be truncated');
    assert.match(result.text, /GST Number: SYNTHETIC/);

    await page.evaluate(() => {
      window.drawnText = [];
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(value, ...args) {
        window.drawnText.push(value);
        return original.call(this, value, ...args);
      };
      window.unicodeText = 'Synthetic 客戶 🐟 ' + '測試'.repeat(600);
      syntheticInvoice.customerLines = [window.unicodeText];
      syntheticInvoice.rodDetails = ['Blank: Northstar NS702'];
      document.querySelector('#invoicePreviewSheet').hidden = true;
      openInvoicePreview();
    });
    result = await sharedPdf();
    const unicode = await page.evaluate(() => ({ drawn: window.drawnText, text: window.unicodeText }));
    assert.ok(result.pages.length > 1, 'Long Unicode text must paginate');
    assert.ok(result.images >= unicode.drawn.length, 'Every system-font line must appear in the PDF');
    assert.equal(unicode.drawn.join(''), unicode.text);

    await page.evaluate(() => {
      navigator.canShare = () => false;
      window.downloaded = null;
      const create = URL.createObjectURL;
      URL.createObjectURL = blob => { window.downloaded = { type: blob.type, size: blob.size }; return create(blob); };
      HTMLAnchorElement.prototype.click = function() { window.downloaded.name = this.download; };
    });
    await page.locator('[data-invoice-preview-action="print"]').click();
    assert.deepEqual(await page.evaluate(() => window.downloaded && [window.downloaded.type, window.downloaded.name, window.downloaded.size > 0]),
      ['application/pdf', 'Invoice.pdf', true]);

    await page.evaluate(() => {
      navigator.canShare = () => true;
      navigator.share = () => Promise.reject(new DOMException('Cancelled', 'AbortError'));
      window.pdfFailure = '';
    });
    await page.locator('[data-invoice-preview-action="print"]').click();
    await page.waitForTimeout(20);
    assert.equal(await page.evaluate(() => window.pdfFailure), '', 'Cancelling share is not an error');
    await page.evaluate(() => { navigator.share = () => Promise.reject(new DOMException('Unavailable', 'NotAllowedError')); });
    await page.locator('[data-invoice-preview-action="print"]').click();
    await page.waitForFunction(() => window.pdfFailure);
    assert.match(await page.evaluate(() => window.pdfFailure), /could not share or save/i);

    await page.evaluate(() => {
      document.querySelector('#invoicePreviewBody .invoice-document__address p').textContent = 'Changed after preparation';
      window.pdfFailure = '';
    });
    await page.locator('[data-invoice-preview-action="print"]').click();
    assert.match(await page.evaluate(() => window.pdfFailure), /not ready/i);

    await page.route('http://invoice.test/assets/logo.svg', route => route.fulfill({ status: 503 }));
    await page.evaluate(() => {
      syntheticInvoice.customerLines = ['Synthetic customer'];
      document.querySelector('#invoicePreviewSheet').hidden = true;
      openInvoicePreview();
      window.pdfFailure = '';
    });
    await page.waitForFunction(() => !document.querySelector('[data-invoice-preview-action="print"]').disabled);
    await page.locator('[data-invoice-preview-action="print"]').click();
    assert.match(await page.evaluate(() => window.pdfFailure), /close and reopen/i);
    console.log(`PASS: ${engine} standalone PDF share: issued, draft, multipage statement and A4.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
