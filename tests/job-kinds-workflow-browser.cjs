// Q33: the same workflow across job kinds. Existing records are made and paid by v277's code; a New Build is made by the release.
// Real taps and typing, real sync and financial operations (production SQL in PGlite), checked again on a second device.
const path = require('node:path'), fs = require('node:fs');
// Usage: PLAYWRIGHT_MODULE=... PGLITE_MODULE=... node tests/job-kinds-workflow-browser.cjs [shots dir]
// The existing records are made by v277's own code, taken from git (5700a16, the release before Q33) at run time.
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const repo = path.join(__dirname, '..');
const v277Root = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-v277-'));
execFileSync('sh', ['-c', `git -C "${repo}" archive 5700a16 | tar -x -C "${v277Root}"`]);

const h = require('./helpers/studio-pglite-harness.cjs');
const oldRoot = v277Root, newRoot = repo;
const label = 'job-kinds', shots = process.argv[2] || '';
const results = [];
const ck = (job, name, ok, detail) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', `[${job}]`, name, ok ? '' : '\n      ' + JSON.stringify(detail)); };
let root = oldRoot;
const money = (t) => Number(String(t || '').replace(/[^0-9.]/g, ''));
const STATE = () => {
  const $ = (id) => document.getElementById(id); const vis = (el) => !!el && el.getClientRects().length > 0;
  return { jobLabel: $('quoteRodPriceLabel')?.textContent, note: $('quoteJobPriceNote')?.textContent, job: $('quoteTotal')?.value, readOnly: $('quoteTotal')?.readOnly,
    total: $('quoteTotalPrice')?.textContent, totalVisible: vis($('quoteTotalPrice')), advancedVisible: vis($('quoteAdvancedToggle')),
    deliveryOpen: !$('quoteDeliveryPanel').hidden, deliverySummary: $('quoteDeliverySummary')?.textContent,
    received: $('quotePaymentTotalReceived')?.textContent, owing: $('quotePaymentBalanceOwing')?.textContent, formOpen: !$('quoteBalanceReceivedForm').hidden,
    formError: $('quoteBalanceReceivedError')?.textContent, docLabel: $('viewQuoteBtn')?.textContent.trim(),
    buttons: [...document.querySelectorAll('#workshopPricingSection button')].filter(vis).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
    text: $('workshopPricingSection')?.innerText || '', payments: JSON.parse(JSON.stringify(quote.payments || [])), stored: quote.finalCustomerPrice,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1 };
};
const settled = (page) => page.waitForFunction(() => !hasUnsavedQuoteChanges && !quoteAutosaveInFlight && !financialOperationInFlight
  && window.KLABS_BUILD_SYNC.getStatus() === 'synced', null, { timeout: 20000 }).then(() => true, () => false);
const JOBS = [
  { key: 'refurbishment', tab: 'quote', seed: { jobType: 'repair', status: 'quote', quoteStatus: 'quote', buildName: 'Guide replacement, 8 ft 6 wt' }, price: 460, advanced: true },
  { key: 'components', tab: 'quote', seed: { jobType: 'build', jobKind: 'components', status: 'quote', quoteStatus: 'quote', buildName: 'Components order' }, components: true },
  { key: 'active-build', tab: 'active', seed: { jobType: 'build', status: 'active', quoteStatus: 'active', buildName: '9 ft 5 wt trout rod' }, price: 897, advanced: true },
  { key: 'new-build', tab: 'quote', fresh: true, seed: { jobType: 'build', status: 'quote', quoteStatus: 'quote', buildName: '10 ft 7 wt sea-run rod' }, price: 1150, advanced: true },
];
const parts = [
  { category: 'Blank', description: '9 ft 5 wt graphite blank', cost: 320, unitPrice: 420, quantity: 1 },
  { category: 'Reel Seat', description: 'Uplocking reel seat', cost: 65, unitPrice: 85, quantity: 1 },
  { category: 'Guides', description: 'Snake guide set', cost: 55, unitPrice: 70, quantity: 2 }];

async function make(page, job, customer) {
  return page.evaluate(async ({ job, customer, parts }) => {
    clearActiveSavedBuildRef(); // a new job, as Studio's New Build flow starts one
    quote = normalizeQuote({ customerName: customer, email: 'customer@example.test', addressLine1: '5 River Rd', cityTown: 'Taupo', postcode: '3330', country: 'New Zealand',
      fulfilmentChoiceRequired: true, gstRate: 15, includeGst: true, components: parts, ...job.seed });
    if (job.price) applyManualRodPrice(job.price);
    hasUnsavedQuoteChanges = true; await persistCurrentQuoteRecord(); markQuoteSaved();
    return quote.quoteNumber;
  }, { job, customer, parts });
}
async function open(page, tab, customer) {
  await page.evaluate(() => window.KLABS_UI.openActiveBuildsList());
  await page.locator(`[data-builds-status-filter="${tab}"]`).click();
  await page.locator('.saved-build-card__open', { hasText: customer }).first().click();
  await page.waitForTimeout(400);
  const head = page.locator('[aria-controls="workshopQuoteSummaryBody"]');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await page.waitForTimeout(300);
}
async function pay(page, amount) {
  await page.locator('#quoteRecordPaymentBtn').click();
  await page.locator('#quoteBalanceReceivedAmount').fill(String(amount));
  await page.locator('#quoteBalanceReceivedSave').click();
  await page.waitForFunction(() => document.getElementById('quoteBalanceReceivedForm').hidden || document.getElementById('quoteBalanceReceivedError').textContent, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

(async () => {
  const db = await h.createDatabase(newRoot);
  const handler = h.makeHandler(db, []);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await h.playwright.webkit.launch();
  try {
    // Existing records: made, opened and paid ($300) by v277.
    const seed = await h.openDevice(browser, base, handler);
    await h.launch(seed, base);
    for (const [job, width] of JOBS.filter((j) => !j.fresh).flatMap((j) => [[j, 390], ...(['components', 'refurbishment'].includes(j.key) ? [[j, 320]] : [])])) {
      const customer = `Existing ${job.key} ${width}`;
      await make(seed.page, job, customer); await settled(seed.page);
      await open(seed.page, job.tab, customer); await settled(seed.page);
      const r = await seed.page.evaluate(async () => { try { await commitFinancialOperation('add_payment', { id: crypto.randomUUID(), type: 'deposit', amount: 300, date: '2026-11-20' }, false, 'Deposit saved'); return 'ok'; } catch (e) { return e.message; } });
      const onServer = (await db.query(`select payload from builds where payload->>'customerName' = $1`, [customer])).rows[0]?.payload;
      ck(`${job.key}@${width}`, `v277 made the record and recorded $300 on the server (v277 itself said: "${r === 'ok' ? 'Deposit saved' : r}")`, onServer?.payments?.length === 1 && onServer.payments[0].amount === 300, { r, onServer: onServer?.payments });
    }
    root = newRoot;
    await seed.context.close();
    for (const width of [390, 320]) {
      const A = await h.openDevice(browser, base, handler, { width });
      await h.launch(A, base);
      const p = A.page;
      for (const job of JOBS) {
        if (width === 320 && job.key !== 'components' && job.key !== 'refurbishment') continue; // 320 px: one read-only and one editable job
        const customer = job.fresh ? `New ${width}` : `Existing ${job.key} ${width}`;
        const tag = `${job.key}@${width}`;
        if (job.fresh) { await make(p, job, customer); await settled(p); }
        await open(p, job.tab, customer);
        let s = await p.evaluate(STATE);
        const before = s.payments.length;
        ck(tag, `label "Job Price"${job.components ? ' (From Sell Prices, read-only)' : ''}, Total Price shown, no Rod Price, no Correct/Remove, no page overflow`,
          s.jobLabel === 'Job Price' && s.totalVisible && money(s.total) > 0 && !/Rod Price/i.test(s.text) && !s.buttons.some((b) => /^(Correct|Remove)/.test(b)) && !s.overflow
          && (!job.components || (s.readOnly && /From Sell Prices/.test(s.note))), { label: s.jobLabel, total: s.total, buttons: s.buttons, overflow: s.overflow, note: s.note });
        ck(tag, 'Total Price = Job Price + GST (no delivery yet)', Math.abs(money(s.total) - Math.round(Number(s.job) * 115) / 100) < 0.011, { job: s.job, total: s.total });
        // Advanced Pricing (not on Components)
        ck(tag, job.advanced ? 'Advanced Pricing is offered' : 'no Advanced Pricing on Components', s.advancedVisible === !!job.advanced, s.advancedVisible);
        if (job.advanced) {
          await p.locator('#quoteAdvancedToggle').click();
          await p.locator('[data-advanced-method="percent"]').click();
          await p.locator('#quoteAdvancedTarget').fill('40');
          await p.locator('#quoteAdvancedApply').click(); await p.waitForTimeout(300);
          s = await p.evaluate(STATE);
          ck(tag, 'Advanced Pricing: Target Margin 40% on $495 → Job Price 825.00, Total $948.75', s.job === '825.00' && s.total === '$948.75 NZD', { job: s.job, total: s.total });
        }
        // Delivery
        if (!(await p.evaluate(STATE)).deliveryOpen) await p.locator('#quoteDeliveryToggle').click();
        await p.locator('[data-fulfilment-method="shipping"]').click();
        await p.locator('#quoteFreight').fill('18'); await p.locator('#quoteFreight').press('Tab');
        await p.locator('#quotePackaging').fill('12'); await p.locator('#quotePackaging').press('Tab');
        await p.waitForTimeout(300);
        const priced = await p.evaluate(STATE);
        ck(tag, 'Courier / Shipping adds $34.50 to the Total', priced.deliverySummary === 'Courier / Shipping · $34.50' && Math.abs(money(priced.total) - (Math.round(Number(priced.job) * 115) / 100 + 34.5)) < 0.011, { job: priced.job, total: priced.total, summary: priced.deliverySummary });
        ck(tag, 'saved and synced', await settled(p), await p.evaluate(STATE));
        if (shots) await p.locator('#workshopPricingSection').screenshot({ path: path.join(shots, `${label}-${job.key}-${width}px.png`) });
        // Document
        await p.locator('#viewQuoteBtn').click(); await p.waitForTimeout(500);
        const doc = await p.evaluate(() => ({ open: !document.getElementById('viewQuoteSheet').hidden, title: document.getElementById('viewQuoteTitle')?.textContent || '', text: document.getElementById('viewQuoteBody').innerText }));
        ck(tag, `${priced.docLabel} preview opens with Total Price ${priced.total}`, doc.open && doc.text.includes(`TOTAL PRICE INCLUDING GST\n${priced.total}`) /* Q41: the total names the configured tax */, { label: priced.docLabel, open: doc.open, text: doc.text.slice(doc.text.indexOf('TOTAL'), doc.text.indexOf('TOTAL') + 80) });
        await p.evaluate(() => closeViewQuote()); await p.waitForTimeout(200);
        // Payment: add, edit, zero-remove
        await pay(p, 100);
        s = await p.evaluate(STATE);
        const added = s.payments.find((x) => x.amount === 100);
        ck(tag, 'a $100 payment saves once, the form closes, Balance Owing drops by $100',
          !s.formOpen && !s.formError && s.payments.length === before + 1 && Math.abs(money(s.owing) - (money(priced.owing) - 100)) < 0.011, { formOpen: s.formOpen, error: s.formError, payments: s.payments.length, owing: s.owing, before: priced.owing });
        if (added) {
          await p.locator(`[data-edit-payment="${added.id}"]`).click();
          await p.locator('#quoteBalanceReceivedAmount').fill('120');
          await p.locator('#quoteBalanceReceivedSave').click(); await p.waitForTimeout(1500);
          s = await p.evaluate(STATE);
          ck(tag, 'editing it to $120 changes that payment, no duplicate', !s.formOpen && s.payments.length === before + 1 && s.payments.find((x) => x.id === added.id)?.amount === 120, { payments: s.payments, error: s.formError });
          await p.locator(`[data-edit-payment="${added.id}"]`).click();
          await p.locator('#quoteBalanceReceivedAmount').fill('0');
          await p.locator('#quoteBalanceReceivedSave').click(); await p.waitForTimeout(400);
          await p.locator('#confirmSheetActions button', { hasText: 'Remove' }).click();
          await p.waitForFunction((n) => (quote.payments || []).length === n && !financialOperationInFlight, before, { timeout: 15000 }).catch(() => {});
          await p.waitForTimeout(500);
          s = await p.evaluate(STATE);
          ck(tag, '$0 → "Remove this payment?" → Remove: back to the earlier payments and balance', s.payments.length === before && s.owing === priced.owing, { payments: s.payments.length, owing: s.owing, was: priced.owing });
        }
        await settled(p);
        const row = (await db.query(`select payload from builds where payload->>'customerName' = $1`, [customer])).rows[0].payload;
        ck(tag, 'the server has the same price, delivery and payments', row.finalCustomerPrice === priced.stored && row.fulfilmentMethod === 'shipping' && row.payments.length === before, { server: { price: row.finalCustomerPrice, method: row.fulfilmentMethod, payments: row.payments.length }, stored: priced.stored });
      }
      ck(`device@${width}`, 'no page errors', A.errors.length === 0, A.errors.slice(0, 5));
      await A.context.close();
    }
    // Second device: everything as left.
    const B = await h.openDevice(browser, base, handler);
    await h.launch(B, base);
    for (const job of JOBS.filter((j) => !j.fresh)) {
      const customer = `Existing ${job.key} 390`;
      await open(B.page, job.tab, customer);
      const s = await B.page.evaluate(STATE);
      const row = (await db.query(`select payload from builds where payload->>'customerName' = $1`, [customer])).rows[0].payload;
      ck(`${job.key}@device B`, 'shows the server\'s price, delivery and payments', s.stored === row.finalCustomerPrice && s.deliverySummary === 'Courier / Shipping · $34.50' && s.payments.length === row.payments.length, { stored: s.stored, server: row.finalCustomerPrice, summary: s.deliverySummary });
    }
    ck('device B', 'no page errors', B.errors.length === 0, B.errors.slice(0, 5));
  } catch (e) {
    ck('x', 'run completed', false, e.message.split('\n').slice(0, 3).join(' | '));
  } finally { await browser.close(); server.close(); }
  console.log(`\n${label}: ${results.filter(Boolean).length}/${results.length} job-type checks passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
