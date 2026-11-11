// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
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
const functions = ['invoiceDocumentMarkup', 'refreshInvoicePreview', 'updateInvoicePreview', 'openInvoicePreview',
  'openPaymentStatement', 'printInvoicePreview'].map(extract).join('\n');
const invoice = { number: `INV-${'a'.repeat(32)}-${Buffer.from('12345678-1234-1234-1234-123456789012').toString('hex')}`, issuedDate: '2026-11-11', businessName: 'K-Labs',
  businessLines: ['Synthetic address'], customerLines: ['Synthetic customer'], buildReference: 'TEST-001',
  rod: 'Custom Fishing Rod', rodDetails: ['Blank: Northstar NS702'], currency: 'NZD', total: 115,
  tax: { name: 'GST', rate: 15, amount: 15, registration: 'GST Number: SYNTHETIC' },
  payments: [{ type: 'deposit', amount: 25, date: '2026-11-10' }] };

async function main() {
  const engine = process.env.INVOICE_BROWSER || 'chromium';
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const page = await browser.newPage({ viewport });
      await page.route('http://invoice.test/**', route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/') return route.fulfill({ contentType: 'text/html', body:
          '<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/layout.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/animations.css"><link rel="stylesheet" href="/css/studio.css"><link rel="stylesheet" href="/css/invoice-document.css"><body></body>' });
        if (pathname.startsWith('/css/') || pathname === '/assets/logo.svg') {
          return route.fulfill({ body: fs.readFileSync(path.join(root, pathname)),
            contentType: pathname.endsWith('.css') ? 'text/css' : 'image/svg+xml' });
        }
        return route.abort();
      });
      await page.goto('http://invoice.test/', { waitUntil: 'load' });
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
      }, invoice);
      await page.addScriptTag({ content: functions });
      await page.evaluate(() => openInvoicePreview());
      const sheet = page.locator('#invoicePreviewSheet');
      const paper = sheet.locator('.invoice-preview__paper');
      const stage = sheet.locator('.invoice-preview__viewport');
      await assertFits(page, paper, stage);
      assert.equal(await page.evaluate(() => window.devicePixelRatio > 0 && window.visualViewport.scale === 1), true);
      assert.equal(await sheet.locator('.invoice-preview__counter').innerText(), 'Page 1 of 1');
      for (const label of ['Total including GST', 'Total received', 'Balance owing', 'Payments received']) {
        assert.ok((await sheet.locator('.invoice-preview__columns').innerText()).toLowerCase().includes(label.toLowerCase()), label);
      }
      for (const action of ['close', 'print']) assert.equal(await sheet.locator(`[data-invoice-preview-action="${action}"]`).last().isVisible(), true);
      for (const selector of ['[data-invoice-preview-action="print"]', '[data-invoice-preview-action="zoom"]',
        '.invoice-preview__counter', '.component-sheet__close']) {
        const bounds = await sheet.locator(selector).boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 &&
          bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, selector);
      }
      assert.equal(await sheet.locator('[data-invoice-preview-action="issue"]').isHidden(), true);
      await assertControls(sheet, false);
      const onPage = await page.evaluate(() => {
        const bounds = document.querySelector('.invoice-preview__paper').getBoundingClientRect();
        return ['.invoice-document__financial', '.invoice-document__payments', '.invoice-document__footer'].every(selector => {
          const rect = document.querySelector(`.invoice-preview__columns ${selector}`).getBoundingClientRect();
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
            rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
        });
      });
      assert.equal(onPage, true, 'Totals, payments and footer must fit on the visible page');
      assert.doesNotMatch(await sheet.locator('.invoice-preview__columns').innerText(), /DRAFT — NOT ISSUED/);
      await page.evaluate(() => {
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
      await sheet.locator('[data-invoice-preview-action="print"]').click();
      await page.waitForFunction(() => window.printCalled || window.printFailure);
      assert.equal(await page.evaluate(() => window.printFailure || ''), '');
      const issuedPrint = await page.locator('iframe.invoice-preview__print-frame').evaluate(frame => frame.contentDocument.body.innerHTML);
      assert.doesNotMatch(issuedPrint, /DRAFT — NOT ISSUED/);
      assert.ok(issuedPrint.includes(invoice.number));
      await page.locator('iframe.invoice-preview__print-frame').evaluate(frame => frame.remove());
      await page.evaluate(() => { window.printCalled = false; });
      await sheet.locator('[data-invoice-preview-action="zoom"]').click();
      assert.equal(await sheet.locator('[data-invoice-preview-action="zoom"]').innerText(), 'Fit page');
      assert.ok((await paper.boundingBox()).width > viewport.width / 2);
      await sheet.locator('[data-invoice-preview-action="zoom"]').click();
      await assertFits(page, paper, stage);
      await page.evaluate(() => {
        quote.issuedInvoice.payments = [{ type: 'deposit', amount: 25, date: '2026-11-10' },
          { type: 'balance', amount: 90, date: '2026-11-11' }];
        document.querySelector('#invoicePreviewSheet').hidden = true;
        openInvoicePreview();
      });
      assert.match(await sheet.locator('.invoice-preview__columns').innerText(), /Paid in full/i);
      assert.doesNotMatch(await sheet.locator('.invoice-preview__columns').innerText(), /DRAFT — NOT ISSUED/);
      await page.evaluate(() => {
        quote.payments = Array.from({ length: 75 }, (_, i) =>
          ({ type: i === 0 ? 'deposit' : 'balance', amount: 1, date: '2026-11-10' }));
        quote.issuedInvoice.customerLines.push('long-address-'.repeat(60));
        document.querySelector('#invoicePreviewSheet').hidden = true;
        openPaymentStatement();
      });
      const count = await sheet.locator('.invoice-preview__counter').innerText();
      const total = Number(count.match(/of (\d+)/)[1]);
      assert.ok(total > 1, count);
      const visibleRows = new Set();
      const visibleCharacters = new Set();
      for (let n = 1; n <= total; n++) {
        if (n > 1) await sheet.locator('[data-invoice-preview-action="next"]').click();
        assert.equal(await sheet.locator('.invoice-preview__counter').innerText(), `Page ${n} of ${total}`);
        await assertFits(page, paper, stage);
        const rows = await page.evaluate(() => {
          const paper = document.querySelector('.invoice-preview__paper').getBoundingClientRect();
          return Array.from(document.querySelectorAll('.invoice-preview__payment-row:not(.invoice-preview__payment-row--header)'), (row, index) => {
            const rect = row.getBoundingClientRect();
            return rect.left >= paper.left - 1 && rect.right <= paper.right + 1 &&
              rect.top >= paper.top - 1 && rect.bottom <= paper.bottom + 1 ? index : -1;
          }).filter(index => index >= 0);
        });
        rows.forEach(index => visibleRows.add(index));
        const characters = await page.evaluate(() => {
          const paper = document.querySelector('.invoice-preview__paper').getBoundingClientRect();
          const text = document.querySelector('.invoice-preview__columns .invoice-document__address p:last-child').firstChild;
          const range = document.createRange();
          return Array.from({ length: text.length }, (_, index) => {
            range.setStart(text, index);
            range.setEnd(text, index + 1);
            const rect = range.getBoundingClientRect();
            return rect.left >= paper.left - 1 && rect.right <= paper.right + 1 &&
              rect.top >= paper.top - 1 && rect.bottom <= paper.bottom + 1 ? index : -1;
          }).filter(index => index >= 0);
        });
        characters.forEach(index => visibleCharacters.add(index));
      }
      assert.equal(visibleRows.size, 75, 'Every payment row must be fully visible on a navigable page');
      assert.equal(visibleCharacters.size, 'long-address-'.length * 60, 'Long customer details must not be clipped');
      assert.equal(await sheet.locator('[data-invoice-preview-action="next"]').isDisabled(), true);
      assert.equal(await sheet.locator('.invoice-preview__payment-row:not(.invoice-preview__payment-row--header)').count(), 75);
      assert.equal(await sheet.locator('[data-invoice-preview-action="print"]').isVisible(), true);
      await sheet.locator('[data-invoice-preview-action="previous"]').click();
      assert.equal(await sheet.locator('.invoice-preview__counter').innerText(), `Page ${total - 1} of ${total}`);
      await page.setViewportSize({ width: viewport.width - 30, height: viewport.height - 30 });
      await page.waitForFunction(() => {
        const paper = document.querySelector('.invoice-preview__paper').getBoundingClientRect();
        const viewport = document.querySelector('.invoice-preview__viewport').getBoundingClientRect();
        return paper.bottom <= viewport.bottom + 1 && paper.right <= viewport.right + 1;
      });
      await assertFits(page, paper, stage);
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => {
        const paper = document.querySelector('.invoice-preview__paper').getBoundingClientRect();
        const viewport = document.querySelector('.invoice-preview__viewport').getBoundingClientRect();
        return paper.bottom <= viewport.bottom + 1 && paper.right <= viewport.right + 1;
      });
      await page.evaluate(() => {
        quote.issuedInvoice = null;
        window.customerInvoicePreviewMarkup = () => invoiceDocumentMarkup(
          { ...window.syntheticInvoice, number: '', issuedDate: '' }, window.syntheticInvoice.payments, false, true);
        document.querySelector('#invoicePreviewSheet').hidden = true;
        openInvoicePreview();
      });
      assert.equal(await sheet.locator('[data-invoice-preview-action="issue"]').isVisible(), true);
      assert.equal(await sheet.locator('[data-invoice-preview-action="print"]').isVisible(), true);
      await assertControls(sheet, true);
      assert.ok((await sheet.locator('.invoice-preview__columns').innerText()).includes('DRAFT — NOT ISSUED'));
      await sheet.locator('[data-invoice-preview-action="print"]').click();
      await page.waitForFunction(() => window.printCalled || window.printFailure);
      assert.equal(await page.evaluate(() => window.printFailure || ''), '');
      const printed = await page.locator('iframe.invoice-preview__print-frame').evaluate(frame => frame.contentDocument.body.innerHTML);
      assert.match(printed, /DRAFT — NOT ISSUED/);
      assert.doesNotMatch(printed, /invoice-preview__columns|transform:|Invoice number|Issue date/);
      assert.equal(await page.evaluate(() => !!quote.issuedInvoice), false);
      await page.close();
    }
    console.log(`PASS: ${engine} MacBook and iPhone A4 fit, zoom, fixed actions and multi-page navigation.`);
  } finally { await browser.close(); }
}
async function assertControls(sheet, draft) {
  const controls = await sheet.evaluate(root => {
    const box = element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        fits: element.scrollWidth <= element.clientWidth };
    };
    const action = name => root.querySelector(`[data-invoice-preview-action="${name}"]`);
    return {
      panel: box(root.querySelector('.component-sheet__panel')),
      closeIcon: box(root.querySelector('.component-sheet__close')),
      previous: box(action('previous')), counter: box(root.querySelector('.invoice-preview__counter')),
      next: box(action('next')), zoom: box(action('zoom')),
      close: box(root.querySelector('.invoice-preview__actions [data-invoice-preview-action="close"]')),
      issue: box(action('issue')), print: box(action('print')),
      issuePrimary: action('issue').classList.contains('primary-action'),
      printSecondary: action('print').classList.contains('ghost-action')
    };
  });
  for (const name of ['closeIcon', 'previous', 'next', 'zoom', 'close', ...(draft ? ['issue'] : []), 'print']) {
    assert.ok(controls[name].width >= 44 && controls[name].height >= 44 && controls[name].fits,
      `${name}: ${JSON.stringify(controls[name])}`);
    assert.ok(controls[name].x >= controls.panel.x &&
      controls[name].x + controls[name].width <= controls.panel.x + controls.panel.width, name);
  }
  assert.equal(controls.previous.y, controls.counter.y + (controls.counter.height - controls.previous.height) / 2);
  assert.equal(controls.previous.y, controls.next.y);
  assert.ok(controls.zoom.y >= controls.previous.y + controls.previous.height);
  assert.equal(controls.close.y, controls.print.y);
  if (draft) {
    assert.equal(controls.close.y, controls.issue.y);
    assert.ok(controls.close.x + controls.close.width <= controls.issue.x);
    assert.ok(controls.issue.x + controls.issue.width <= controls.print.x);
  } else {
    assert.ok(controls.close.x + controls.close.width <= controls.print.x);
  }
  assert.ok(controls.issuePrimary && controls.printSecondary);
}
async function assertFits(page, paper, viewport) {
  const a = await paper.boundingBox();
  const b = await viewport.boundingBox();
  assert.ok(a && b && a.x >= b.x - 1 && a.y >= b.y - 1 &&
    a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1,
  JSON.stringify({ paper: a, viewport: b, size: page.viewportSize() }));
  assert.ok(Math.abs(a.width / a.height - 210 / 297) < 0.01);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
