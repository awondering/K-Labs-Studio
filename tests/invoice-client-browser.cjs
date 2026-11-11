// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright module.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');

async function main() {
  const engine = process.env.INVOICE_BROWSER || 'chromium';
  const browser = await playwright[engine].launch({ headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      let writes = 0;
      try {
        await context.route('**/*', route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin !== 'http://studio.test') {
            if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes++;
            return route.abort('blockedbyclient');
          }
          const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
          const file = path.resolve(root, `.${pathname}`);
          if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
          const type = pathname.endsWith('.html') ? 'text/html' : pathname.endsWith('.js') ? 'application/javascript'
            : pathname.endsWith('.css') ? 'text/css' : pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
          return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
        });
        const page = await context.newPage();
        await page.goto('http://studio.test/', { waitUntil: 'load' });
        for (const file of ['config.js', 'storage.js', 'guide-layout.js', 'thread-wrap.js', 'guide-train.js',
          'studio-visuals.js', 'navigation.js', 'ui.js']) await page.addScriptTag({ url: `/js/${file}` });
        await page.evaluate(() => {
          window.KLABS_ACCOUNT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
          quote = newQuoteTemplate();
          quote.id = 'synthetic-only';
          quote.customerName = 'Synthetic Customer';
          quote.buildName = 'Synthetic Customer';
          quote.blankMaker = 'CTS';
          quote.blankName = 'CTS Synthetic Model';
          quote.components = [{ category: 'Blank', brand: 'CTS', description: 'CTS Synthetic Model',
            specifications: 'Line rating: 10–20 lb; Lure weight: 10–30 g' }];
          quote.buildSpecifications.layout = { rodLengthMm: 2134 };
          openInvoicePreview();
        });
        const sheet = page.locator('#invoicePreviewSheet');
        const text = await sheet.locator('.invoice-preview__columns').innerText();
        for (const expected of ['DRAFT — NOT ISSUED', 'Custom Fishing Rod', 'CTS Synthetic Model',
          'Finished length 2134 mm', 'Line 10–20 lb', 'Lure 10–30 g', 'Total received', 'Balance owing']) {
          assert.ok(text.toLowerCase().includes(expected.toLowerCase()), expected);
        }
        assert.doesNotMatch(text, /Invoice number|Issue date/);
        assert.equal(await sheet.locator('.invoice-preview__counter').innerText(), 'Page 1 of 1');
        const geometry = await page.evaluate(() => {
          const page = document.querySelector('.invoice-preview__paper').getBoundingClientRect();
          const area = document.querySelector('.invoice-preview__viewport').getBoundingClientRect();
          const print = document.querySelector('[data-invoice-preview-action="print"]').getBoundingClientRect();
          return { page: [page.left, page.top, page.right, page.bottom], area: [area.left, area.top, area.right, area.bottom],
            print: [print.left, print.top, print.right, print.bottom], zoom: window.visualViewport.scale };
        });
        assert.equal(geometry.zoom, 1);
        assert.ok(geometry.page[0] >= geometry.area[0] - 1 && geometry.page[1] >= geometry.area[1] - 1 &&
          geometry.page[2] <= geometry.area[2] + 1 && geometry.page[3] <= geometry.area[3] + 1, JSON.stringify(geometry));
        assert.ok(geometry.print[0] >= 0 && geometry.print[1] >= 0 &&
          geometry.print[2] <= viewport.width && geometry.print[3] <= viewport.height, JSON.stringify(geometry));
        assert.equal(await page.evaluate(() => !!quote.issuedInvoice), false);
        assert.equal(writes, 0);
      } finally { await context.close(); }
    }
    console.log(`PASS: ${engine} full client synthetic CTS draft, normal zoom, complete page and controls, no remote writes.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
