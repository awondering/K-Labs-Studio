// Q33 mandatory end-to-end regression on ONE existing-style Quote, created and paid by v277's own code, then worked
// through the release under test by real taps and typing, saved through the real sync and financial operations
// (production SQL in PGlite), reloaded, and opened on a second device.
const path = require('node:path'), fs = require('node:fs');
// Usage: PLAYWRIGHT_MODULE=... PGLITE_MODULE=... node tests/existing-quote-workflow-browser.cjs [shots dir]
// The existing records are made by v277's own code, taken from git (5700a16, the release before Q33) at run time.
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const repo = path.join(__dirname, '..');
const v277Root = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-v277-'));
execFileSync('sh', ['-c', `git -C "${repo}" archive 5700a16 | tar -x -C "${v277Root}"`]);

const h = require('./helpers/studio-pglite-harness.cjs');
const oldRoot = v277Root, newRoot = repo;
const label = 'existing-quote';
const shots = process.argv[2] || '';
const results = [];
const ck = (step, name, ok, detail) => {
  results.push({ step, name, ok: !!ok });
  console.log(ok ? 'PASS' : 'FAIL', `[${step}]`, name, ok ? '' : '\n      ' + JSON.stringify(detail));
};
let root = oldRoot;
const STATE = () => {
  const $ = (id) => document.getElementById(id); const t = (id) => ($(id) || {}).textContent;
  const vis = (el) => !!el && el.getClientRects().length > 0;
  return {
    jobLabel: t('quoteRodPriceLabel'), job: ($('quoteTotal') || {}).value, total: t('quoteTotalPrice'), gst: ($('quoteGst') || {}).value,
    deliverySummary: t('quoteDeliverySummary'), deliveryOpen: !!$('quoteDeliveryPanel') && !$('quoteDeliveryPanel').hidden,
    deliveryChoices: [...document.querySelectorAll('[data-fulfilment-method]')].filter(vis).map((b) => b.textContent.trim()),
    advancedOpen: ($('quoteAdvancedToggle') || { getAttribute: () => null }).getAttribute('aria-expanded'),
    received: t('quotePaymentTotalReceived'), owing: t('quotePaymentBalanceOwing'),
    formOpen: !!$('quoteBalanceReceivedForm') && !$('quoteBalanceReceivedForm').hidden, formError: t('quoteBalanceReceivedError'),
    amountField: ($('quoteBalanceReceivedAmount') || {}).value,
    rows: [...document.querySelectorAll('#quotePaymentHistory [data-edit-payment]')].filter(vis).map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    paymentButtons: [...document.querySelectorAll('#workshopPricingSection button')].filter(vis).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
    words: document.getElementById('workshopPricingSection')?.innerText || '',
    status: t('workshopBuildActionsStatus'), sync: window.KLABS_BUILD_SYNC.getStatus(),
    stored: quote.finalCustomerPrice, payments: JSON.parse(JSON.stringify(quote.payments || [])), method: quote.fulfilmentMethod,
  };
};
const settled = (page) => page.waitForFunction(() => !hasUnsavedQuoteChanges && !quoteAutosaveInFlight && !financialOperationInFlight
  && window.KLABS_BUILD_SYNC.getStatus() === 'synced', null, { timeout: 20000 }).then(() => true, () => false);
const dbRow = async (db) => (await db.query(`select payload, to_json(updated_at)#>>'{}' as rev from builds`)).rows;

(async () => {
  const log = [];
  const db = await h.createDatabase(newRoot);
  const handler = h.makeHandler(db, log);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await h.playwright.webkit.launch();
  try {
    // ---------- 0. The existing Quote, made and paid by v277 ----------
    const seed = await h.openDevice(browser, base, handler, { name: 'v277 device' });
    const boot0 = await h.launch(seed, base);
    const made = await seed.page.evaluate(async () => {
      quote = normalizeQuote({ customerName: 'Jordan Ellis', email: 'jordan@example.test', phone: '021 555 0199',
        addressLine1: '5 River Rd', cityTown: 'Taupo', postcode: '3330', country: 'New Zealand', buildName: '9 ft 5 wt trout rod',
        jobType: 'build', status: 'quote', quoteStatus: 'quote', fulfilmentChoiceRequired: true, gstRate: 15, includeGst: true,
        components: [
          { category: 'Blank', description: '9 ft 5 wt graphite blank', cost: 320, unitPrice: 420, quantity: 1 },
          { category: 'Reel Seat', description: 'Uplocking reel seat', cost: 65, unitPrice: 85, quantity: 1 },
          { category: 'Guides', description: 'Snake guide set', cost: 55, unitPrice: 70, quantity: 2 }] });
      applyManualRodPrice(897); // v277: the Rod price, typed including GST
      hasUnsavedQuoteChanges = true;
      await persistCurrentQuoteRecord(); markQuoteSaved();
      return { id: quote.id, number: quote.quoteNumber, price: quote.finalCustomerPrice, method: quote.fulfilmentMethod || '' };
    });
    await settled(seed.page);
    // As the builder did: open the saved Quote from the Quotes list, then record the deposit.
    await seed.page.evaluate(() => window.KLABS_UI.openActiveBuildsList());
    await seed.page.locator('[data-builds-status-filter="quote"]').click();
    await seed.page.locator('.saved-build-card__open', { hasText: 'Jordan Ellis' }).first().click();
    await seed.page.waitForTimeout(500); await settled(seed.page);
    const deposit = await seed.page.evaluate(async () => {
      await commitFinancialOperation('add_payment', { id: crypto.randomUUID(), type: 'deposit', amount: 300, date: '2026-11-20' }, false, 'Deposit saved');
      return { payments: quote.payments, sync: KLABS_BUILD_SYNC.getStatus() };
    }).catch((e) => ({ error: e.message }));
    const rows0 = await dbRow(db);
    ck(0, `v277 made the Quote (${made.number}) at $897.00 incl. GST, no delivery chosen, and recorded a $300 deposit on the server`,
      boot0.status === 'synced' && rows0.length === 1 && rows0[0].payload.finalCustomerPrice === 897 && rows0[0].payload.payments?.length === 1
      && rows0[0].payload.payments[0].amount === 300 && !rows0[0].payload.fulfilmentMethod, { boot0, made, deposit, db: rows0.map((r) => r.payload.payments) });
    await seed.context.close();

    // ---------- the release under test ----------
    root = newRoot;
    const A = await h.openDevice(browser, base, handler, { name: 'device A' });
    const p = A.page;
    await h.launch(A, base);
    // 1. Open the existing Quote from the Quotes list, by tapping it.
    await p.evaluate(() => window.KLABS_UI.openActiveBuildsList());
    await p.locator('[data-builds-status-filter="quote"]').click();
    await p.locator('.saved-build-card__open', { hasText: 'Jordan Ellis' }).first().click();
    await p.waitForTimeout(400);
    const head = p.locator('[aria-controls="workshopQuoteSummaryBody"]');
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    await p.waitForTimeout(400);
    await p.evaluate(() => { window.__msgs = []; const el = document.getElementById('workshopBuildActionsStatus'); new MutationObserver(() => window.__msgs.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
    let s = await p.evaluate(STATE);
    ck(1, 'opened from the Quotes list: the Quote with its components and the $300 deposit', s.payments.length === 1 && s.payments[0].amount === 300 && s.rows.length === 1, s);
    if (shots) await p.locator('#workshopPricingSection').screenshot({ path: path.join(shots, `${label}-1-opened.png`) });

    // 2. Job Price and Total Price
    ck(2, 'Job Price label is "Job Price" and shows 780.00 (excl. GST); Total Price $897.00 NZD is visible',
      s.jobLabel === 'Job Price' && s.job === '780.00' && s.total === '$897.00 NZD' && !/Rod price/i.test(s.words), { jobLabel: s.jobLabel, job: s.job, total: s.total });
    ck(2, 'no Correct / Remove / correction-reason controls in the payments', !s.paymentButtons.some((b) => /^(Correct|Remove)( |$)/i.test(b)) && !/correction/i.test(s.words), s.paymentButtons);

    // 3. Change the Job Price
    await p.locator('#quoteTotal').fill('800'); await p.locator('#quoteTotal').press('Tab');
    await p.waitForTimeout(300);
    s = await p.evaluate(STATE);
    ck(3, 'Job Price 800 → Total Price $920.00 NZD, GST $120.00, Balance Owing $620.00 NZD', s.total === '$920.00 NZD' && s.gst === '$120.00' && s.owing === '$620.00 NZD', s);
    ck(3, 'saved and synchronised', await settled(p), await p.evaluate(STATE));

    // 4. Advanced Pricing: Target Return $300 → Job Price 795.00, Apply
    await p.locator('#quoteAdvancedToggle').click();
    s = await p.evaluate(STATE);
    const advVisible = await p.locator('#quoteAdvancedPricing').isVisible();
    ck(4, 'Advanced Pricing opens', s.advancedOpen === 'true' && advVisible, { advancedOpen: s.advancedOpen, advVisible });
    if (advVisible) {
      await p.locator('[data-advanced-method="return"]').click();
      await p.locator('#quoteAdvancedTarget').fill('300');
      await p.waitForTimeout(200);
      const proposed = await p.locator('#quoteAdvancedProposed').textContent();
      await p.locator('#quoteAdvancedApply').click();
      await p.waitForTimeout(300);
      s = await p.evaluate(STATE);
      ck(4, 'Target Return $300 proposes $795.00; Apply sets Job Price 795.00, Total $914.25 NZD, and folds the panel',
        proposed === '$795.00' && s.job === '795.00' && s.total === '$914.25 NZD' && s.advancedOpen === 'false', { proposed, job: s.job, total: s.total, adv: s.advancedOpen });
    }
    await settled(p);

    // 5. Delivery: open it, choose Courier / Shipping
    s = await p.evaluate(STATE);
    const wasOpen = s.deliveryOpen;
    if (!wasOpen) await p.locator('#quoteDeliveryToggle').click();
    s = await p.evaluate(STATE);
    ck(5, `Delivery shows Collection | Courier / Shipping (${wasOpen ? 'already open: no method chosen yet' : 'opened by a tap'})`,
      s.deliveryOpen && JSON.stringify(s.deliveryChoices) === '["Collection","Courier / Shipping"]', s);
    if (s.deliveryOpen) {
      await p.locator('[data-fulfilment-method="shipping"]').click();
      // 6. Freight and packaging
      await p.locator('#quoteFreight').fill('18'); await p.locator('#quoteFreight').press('Tab');
      await p.locator('#quotePackaging').fill('12'); await p.locator('#quotePackaging').press('Tab');
      await p.waitForTimeout(300);
      s = await p.evaluate(STATE);
      ck(6, 'Courier / Shipping with $18 + $12 (excl. GST) → delivery $34.50, Total $948.75 NZD, GST $123.75, summary "Courier / Shipping · $34.50"',
        s.method === 'shipping' && s.total === '$948.75 NZD' && s.gst === '$123.75' && s.deliverySummary === 'Courier / Shipping · $34.50', s);
    }
    ck(6, 'saved and synchronised', await settled(p), await p.evaluate(STATE));
    if (shots) await p.locator('#workshopPricingSection').screenshot({ path: path.join(shots, `${label}-6-priced-shipping.png`) });

    // 7. View the quote
    await p.locator('#viewQuoteBtn').click();
    await p.waitForTimeout(500);
    const preview = await p.evaluate(() => ({ open: !document.getElementById('viewQuoteSheet').hidden, text: document.getElementById('viewQuoteBody').innerText,
      info: !document.getElementById('confirmSheet')?.hidden ? document.getElementById('confirmSheet')?.innerText : '' }));
    // Q41: delivery reads "included in total" and the total names the configured tax, on every document and email.
    ck(7, 'the Quote preview opens (no "choose delivery" block) and shows delivery $34.50, Total Price $948.75 NZD, Deposit Received $300.00 NZD',
      preview.open && /DELIVERY \(INCLUDED IN TOTAL\)\n\$34\.50 NZD/.test(preview.text) && /TOTAL PRICE INCLUDING GST\n\$948\.75 NZD/.test(preview.text) && /\$300\.00 NZD/.test(preview.text), preview);
    if (shots && preview.open) await p.locator('#viewQuoteSheet .component-sheet__panel').screenshot({ path: path.join(shots, `${label}-7-quote-preview.png`) });
    // 8. The existing email draft. WebKit reports no event for a mailto: navigation, so record what Studio hands the mail
    // app: wrap Studio's own emailCurrentQuote and capture the draft it builds at that moment (the navigation still runs).
    await p.evaluate(() => { const original = window.emailCurrentQuote; window.__mail = [];
      window.emailCurrentQuote = function (options) { if (options && options.fromPreview) window.__mail.push(`mailto:${quote.email}?subject=&body=${customerEmailLines().join('\n')}`); return original.apply(this, arguments); }; });
    await p.locator('#viewQuoteEmailBtn').click().catch(() => {});
    await p.waitForTimeout(800);
    const mail = (await p.evaluate(() => window.__mail[0] || '')) || '';
    ck(8, 'Email opens the mail draft (mailto: to jordan@example.test) with Total including GST: $948.75 NZD; nothing is "sent"',
      mail.startsWith('mailto:jordan@example.test?subject=') && /Total including GST: \$948\.75 NZD/.test(mail), mail.slice(0, 400) || 'no mail draft');
    if (!(await p.evaluate(() => document.getElementById('viewQuoteSheet').hidden))) await p.evaluate(() => closeViewQuote());
    await p.waitForTimeout(300);

    // 9-10. A second payment
    await p.locator('#quoteRecordPaymentBtn').click();
    await p.locator('#quoteBalanceReceivedAmount').fill('150');
    await p.locator('#quoteBalanceReceivedDate').fill('2026-11-22');
    await p.locator('#quoteBalanceReceivedSave').click();
    await p.waitForFunction(() => document.getElementById('quoteBalanceReceivedForm').hidden || document.getElementById('quoteBalanceReceivedError').textContent, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(400);
    s = await p.evaluate(STATE);
    let rows = await dbRow(db);
    ck(10, 'Save records $150 exactly once on the server, the form closes, the new row shows, Received $450.00 / Owing $498.75',
      !s.formOpen && !s.formError && s.rows.length === 2 && rows[0].payload.payments.length === 2 && s.received === '$450.00 NZD' && s.owing === '$498.75 NZD',
      { formOpen: s.formOpen, error: s.formError, amountField: s.amountField, rows: s.rows, server: rows[0].payload.payments, received: s.received, owing: s.owing, status: s.status, sync: s.sync });
    // Saving again is a NEW payment form, empty - never the same amount still waiting.
    if (s.formOpen) {
      await p.locator('#quoteBalanceReceivedSave').click(); await p.waitForTimeout(1500);
      const again = await p.evaluate(STATE);
      ck(10, 'pressing Save again (form left open) does not duplicate', (await dbRow(db))[0].payload.payments.length === 2, { error: again.formError, server: (await dbRow(db))[0].payload.payments.length });
      await p.locator('#quoteBalanceReceivedCancel').click().catch(() => {});
    }
    await p.locator('#quoteRecordPaymentBtn').click();
    s = await p.evaluate(STATE);
    ck(10, 'Add Payment again opens a NEW form for a further payment, suggesting what is still owing ($498.75), not the $150 just saved', s.formOpen && s.amountField === '498.75', { amountField: s.amountField, formOpen: s.formOpen });
    await p.locator('#quoteBalanceReceivedCancel').click();
    if (shots) await p.locator('#workshopPricingSection').screenshot({ path: path.join(shots, `${label}-10-second-payment.png`) });

    // 11. Edit that payment (positive)
    const payId = (await dbRow(db))[0].payload.payments.find((x) => x.amount === 150)?.id;
    await p.locator(`[data-edit-payment="${payId}"]`).click();
    s = await p.evaluate(STATE);
    ck(11, 'tapping the payment opens Amount, Date, Save, Cancel (no Correct/Remove, no reason)', s.formOpen && s.amountField === '150.00'
      && !s.paymentButtons.some((b) => /^(Correct|Remove)/.test(b)) && !/reason/i.test(s.words), { amountField: s.amountField, buttons: s.paymentButtons });
    await p.locator('#quoteBalanceReceivedAmount').fill('175');
    await p.locator('#quoteBalanceReceivedSave').click();
    await p.waitForFunction(() => document.getElementById('quoteBalanceReceivedForm').hidden || document.getElementById('quoteBalanceReceivedError').textContent, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(300);
    s = await p.evaluate(STATE); rows = await dbRow(db);
    ck(11, 'the same payment becomes $175 (same id, no duplicate); form closes; Received $475.00 / Owing $473.75',
      !s.formOpen && rows[0].payload.payments.length === 2 && rows[0].payload.payments.find((x) => x.id === payId)?.amount === 175 && s.received === '$475.00 NZD' && s.owing === '$473.75 NZD',
      { error: s.formError, server: rows[0].payload.payments, received: s.received, owing: s.owing });

    // 12. Set it to zero → confirm removal
    await p.locator(`[data-edit-payment="${payId}"]`).click();
    await p.locator('#quoteBalanceReceivedAmount').fill('0');
    await p.locator('#quoteBalanceReceivedSave').click();
    await p.waitForTimeout(500);
    const dialog = await p.evaluate(() => ({ title: document.getElementById('confirmSheetTitle')?.textContent, actions: [...document.querySelectorAll('#confirmSheetActions button')].map((b) => b.textContent.trim()) }));
    ck(12, '$0 + Save asks "Remove this payment?" (Cancel | Remove)', dialog.title === 'Remove this payment?' && JSON.stringify(dialog.actions) === '["Cancel","Remove"]', dialog);
    await p.locator('#confirmSheetActions button', { hasText: 'Remove' }).click().catch(() => {});
    await p.waitForFunction(() => !financialOperationInFlight && (quote.payments || []).length === 1, null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(800);
    s = await p.evaluate(STATE); rows = await dbRow(db);
    ck(12, 'that payment is removed on the server (deposit kept); Received $300.00 / Owing $648.75; one row',
      rows[0].payload.payments.length === 1 && rows[0].payload.payments[0].amount === 300 && s.rows.length === 1 && s.received === '$300.00 NZD' && s.owing === '$648.75 NZD',
      { server: rows[0].payload.payments, rows: s.rows, received: s.received, owing: s.owing, status: s.status });
    ck(12, 'synchronised afterwards', await settled(p), await p.evaluate(STATE));

    const msgs = await p.evaluate(() => [...new Set(window.__msgs)]);
    ck(12, 'every save reported plainly: "Payment saved", "Payment removed"; never "previous build", "Could not save" or "Reopen"', msgs.includes('Payment saved — synced') && msgs.some((m) => /^Payment removed/.test(m)) && !msgs.some((m) => /previous build|Could not save|Reopen|NOT SYNCED/i.test(m)), msgs);
    // 13. Reload and verify persistence
    await h.launch(A, base);
    await p.evaluate(() => window.KLABS_UI.openActiveBuildsList());
    await p.locator('[data-builds-status-filter="quote"]').click();
    await p.locator('.saved-build-card__open', { hasText: 'Jordan Ellis' }).first().click();
    await p.waitForTimeout(400);
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    s = await p.evaluate(STATE);
    ck(13, 'after reload: Job Price 795.00, Courier / Shipping $34.50, Total $948.75 NZD, deposit only, Owing $648.75',
      s.job === '795.00' && s.deliverySummary === 'Courier / Shipping · $34.50' && s.total === '$948.75 NZD' && s.rows.length === 1 && s.owing === '$648.75 NZD', s);

    // 14. Another device, and the documents
    const B = await h.openDevice(browser, base, handler, { name: 'device B' });
    await h.launch(B, base);
    await B.page.evaluate(() => window.KLABS_UI.openActiveBuildsList());
    await B.page.locator('[data-builds-status-filter="quote"]').click();
    await B.page.locator('.saved-build-card__open', { hasText: 'Jordan Ellis' }).first().click();
    await B.page.waitForTimeout(400);
    const headB = B.page.locator('[aria-controls="workshopQuoteSummaryBody"]');
    if ((await headB.getAttribute('aria-expanded')) !== 'true') await headB.click();
    const sb = await B.page.evaluate(STATE);
    ck(14, 'device B shows the same: Job Price 795.00, Total $948.75 NZD, Received $300.00, Owing $648.75',
      sb.job === '795.00' && sb.total === '$948.75 NZD' && sb.received === '$300.00 NZD' && sb.owing === '$648.75 NZD', sb);
    await B.page.locator('#viewQuoteBtn').click(); await B.page.waitForTimeout(500);
    const qb = await B.page.evaluate(() => document.getElementById('viewQuoteBody').innerText);
    await B.page.evaluate(() => closeViewQuote());
    await B.page.evaluate(() => openInvoicePreview && openInvoicePreview()).catch(() => {});
    await B.page.locator('#quoteMoreDocumentsBtn').click().catch(() => {});
    const inv = await B.page.evaluate(async () => { const b = [...document.querySelectorAll('button')].find((x) => /^Invoice/.test(x.textContent.trim()) && x.getClientRects().length && x.id !== 'quoteMoreDocumentsBtn'); b?.click(); await new Promise((r) => setTimeout(r, 1500)); return document.getElementById('invoicePreviewBody')?.innerText.replace(/\s+/g, ' ') || ''; });
    ck(14, 'device B documents agree: quote total $948.75, invoice subtotal 825.00, GST 123.75, total 948.75, received 300.00, balance 648.75',
      /TOTAL PRICE INCLUDING GST\n\$948\.75 NZD/.test(qb) && /Subtotal excluding GST ?825\.00/.test(inv) && /GST \(15%\) ?123\.75/.test(inv) && /Total including GST ?948\.75/.test(inv) && /Balance owing ?648\.75/.test(inv),
      { quote: qb.slice(qb.indexOf('TOTAL'), qb.indexOf('TOTAL') + 120), invoice: inv.slice(inv.indexOf('Summary'), inv.indexOf('Summary') + 260) });
    ck(14, 'no page errors on either device', A.errors.length === 0 && B.errors.length === 0, { A: A.errors.slice(0, 5), B: B.errors.slice(0, 5) });
  } catch (e) {
    ck('x', 'run completed', false, e.message.split('\n').slice(0, 3).join(' | '));
  } finally { await browser.close(); server.close(); }
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${label}: ${results.length - failed.length}/${results.length} end-to-end checks passed`);
  if (process.env.E2E_LOG) fs.writeFileSync(process.env.E2E_LOG, log.join('\n'));
  process.exit(failed.length ? 1 : 0);
})();
