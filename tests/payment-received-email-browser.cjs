// Q39: the customer email for a confirmed rod build that is paid in full is a payment acknowledgement
// (subject "K-Labs — Payment Received in Full — <reference>", "Payment has been received in full.", Total /
// Total received / Balance owing in the configured currency). Unpaid and part-paid confirmations keep the
// Build Confirmation email; the Build Confirmation document, payment figures and stored record are unchanged.
// Real Studio in WebKit (production SQL in PGlite): iPhone 390 (touch) and desktop 1280. The payments are recorded
// through Studio's real financial operation; the email is taken from Studio's own Email button.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... node tests/payment-received-email-browser.cjs [shots dir]
const path = require('node:path');
const fs = require('node:fs');
const h = require('./helpers/studio-pglite-harness.cjs');

const shots = process.argv[2] || '';
const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}
const settled = (page) => page.waitForFunction(() => !hasUnsavedQuoteChanges && !quoteAutosaveInFlight && !financialOperationInFlight
  && window.KLABS_BUILD_SYNC.getStatus() === 'synced', null, { timeout: 20000 }).then(() => true, () => false);

// Tap the preview's Email button and record the draft Studio hands the mail app. WebKit reports no event for a
// mailto: navigation, so Studio's own emailCurrentQuote is run once more with a stand-in window that keeps the URL.
async function emailDraft(p) {
  await p.evaluate(() => {
    if (!window.__wrapped) {
      const original = window.emailCurrentQuote;
      window.emailCurrentQuote = function (options) {
        if (options && options.fromPreview) {
          const stand = { location: { href: '' } };
          new Function('window', 'options', `return (${original.toString()})(options)`)(stand, options);
          window.__mail.push(stand.location.href);
        }
        return original.apply(this, arguments);
      };
      window.__wrapped = true;
    }
    window.__mail = [];
  });
  await p.locator('#viewQuoteBtn').click();
  await p.waitForTimeout(400);
  const view = await p.evaluate(() => ({ open: !document.getElementById('viewQuoteSheet').hidden, text: document.getElementById('viewQuoteSheet').innerText }));
  await p.locator('#viewQuoteEmailBtn').click().catch(() => {});
  await p.waitForTimeout(500);
  const href = await p.evaluate(() => window.__mail[0] || '');
  const q = href.indexOf('?');
  const params = new URLSearchParams(href.slice(q + 1));
  if (!(await p.evaluate(() => document.getElementById('viewQuoteSheet').hidden))) await p.evaluate(() => closeViewQuote());
  await p.waitForTimeout(200);
  return { view, to: decodeURIComponent(href.slice(7, q)), subject: params.get('subject') || '', body: params.get('body') || '' };
}
const pay = (p, type, amount) => p.evaluate(async ({ type, amount }) => {
  await commitFinancialOperation('add_payment', { id: crypto.randomUUID(), type, amount, date: '2026-11-25' }, false, 'Payment saved');
}, { type, amount });

function writeDraft(tag, state, m) {
  if (!shots) return;
  fs.writeFileSync(path.join(shots, `email-${tag}-${state}.txt`), `To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}\n`);
}

async function run(browser, { width, mobile }) {
  const tag = `${mobile ? 'iphone' : 'desktop'}-${width}`;
  const db = await h.createDatabase(root);
  const handler = h.makeHandler(db, []);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const D = await h.openDevice(browser, base, handler, { width, mobile, name: tag });
    await h.launch(D, base);
    const p = D.page;
    // The account's configured currency is AUD, so the test shows the email follows it (not a fixed NZD).
    await p.evaluate(async () => {
      studioSettings.currency = 'AUD'; saveStudioSettings();
      businessProfile = normalizeBusinessProfile({ ...businessProfile, businessName: 'K-Labs', paymentAccountName: 'K-Labs Ltd', paymentAccountNumber: '12-3456-7890123-00' });
      saveBusinessProfile();
      quote = normalizeQuote({ customerName: 'Jordan Ellis', email: 'jordan@example.test', phone: '021 555 0199',
        addressLine1: '5 River Rd', cityTown: 'Taupo', postcode: '3330', country: 'New Zealand', buildName: '9 ft 5 wt trout rod',
        jobType: 'build', status: 'active', quoteStatus: 'active', gstRate: 15, includeGst: true,
        depositEnabled: true, depositType: 'fixed', depositValue: 300, estimatedCompletionDate: '2026-12-18',
        components: [{ category: 'Blank', description: '9 ft 5 wt graphite blank', cost: 320, unitPrice: 420, quantity: 1 }] });
      applyManualRodPrice(1150);
      hasUnsavedQuoteChanges = true;
      await persistCurrentQuoteRecord(); markQuoteSaved();
    });
    ck(tag, 'confirmed build saved and synchronised', await settled(p));
    // As the builder does: open the build from the Builds list, then Job Pricing & Actions.
    await p.evaluate(() => window.KLABS_UI.openActiveBuildsList());
    await p.locator('[data-builds-status-filter="active"]').click();
    await p.locator('.saved-build-card__open', { hasText: 'Jordan Ellis' }).first().click();
    await p.waitForTimeout(500);
    const head = p.locator('[aria-controls="workshopQuoteSummaryBody"]');
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    await p.waitForTimeout(300);
    ck(tag, 'opened from the Builds list', await settled(p) && await p.evaluate(() => quote.customerName === 'Jordan Ellis'));
    const ref = await p.evaluate(() => quote.quoteNumber);
    const total = await p.evaluate(() => currencyWithCode(depositMaths().total));
    ck(tag, `total is ${total} in the configured currency (AUD)`, total === '$1150.00 AUD', total);

    // ---- Unpaid ----
    const unpaid = await emailDraft(p);
    writeDraft(tag, 'unpaid', unpaid);
    ck(tag, 'unpaid: subject is the Build Confirmation', unpaid.subject === `K-Labs Build Confirmation — ${ref}`, unpaid.subject);
    ck(tag, 'unpaid: body unchanged (confirmed wording, deposit required, payment details), no payment acknowledgement',
      /has been confirmed\. Thank you for your order\./.test(unpaid.body) && /Deposit required: \$300\.00 AUD/.test(unpaid.body)
      && /Bank account: 12-3456-7890123-00/.test(unpaid.body) && !/received in full/i.test(unpaid.body), unpaid.body);
    ck(tag, 'unpaid: the preview document is the Build Confirmation', unpaid.view.open && /BUILD CONFIRMATION/i.test(unpaid.view.text), unpaid.view.text.slice(0, 200));

    // ---- Partly paid (the deposit) ----
    await pay(p, 'deposit', 300);
    ck(tag, 'deposit recorded and synchronised', await settled(p));
    const part = await emailDraft(p);
    writeDraft(tag, 'part-paid', part);
    ck(tag, 'part-paid: subject is the Build Confirmation', part.subject === `K-Labs Build Confirmation — ${ref}`, part.subject);
    ck(tag, 'part-paid: body unchanged (Deposit received $300.00, Balance owing $850.00, payment details)',
      /has been confirmed/.test(part.body) && /Deposit received: \$300\.00 AUD\nBalance owing: \$850\.00 AUD/.test(part.body)
      && /Bank account/.test(part.body) && !/received in full/i.test(part.body), part.body);
    const partDoc = part.view.text;

    // ---- Paid in full ----
    await pay(p, 'balance', 850);
    ck(tag, 'final payment recorded and synchronised', await settled(p));
    const full = await emailDraft(p);
    writeDraft(tag, 'paid-in-full', full);
    ck(tag, 'paid in full: subject "K-Labs — Payment Received in Full — <reference>"', full.subject === `K-Labs — Payment Received in Full — ${ref}`, full.subject);
    ck(tag, 'paid in full: the body states "Payment has been received in full."', full.body.includes('Payment has been received in full.'), full.body);
    ck(tag, 'paid in full: Total, Total received and Balance owing $0.00 in AUD',
      /Total: \$1150\.00 AUD\nTotal received: \$1150\.00 AUD\nBalance owing: \$0\.00 AUD/.test(full.body), full.body);
    ck(tag, 'paid in full: build reference and customer details kept; no deposit lines or bank details',
      full.to === 'jordan@example.test' && /^Hi Jordan,/.test(full.body) && full.body.includes(`Custom Rod Build — ${ref}`)
      && /9 ft 5 wt graphite blank/i.test(full.body) && full.body.includes('5 River Rd')
      && !/Deposit (required|received)|Bank account|has been confirmed/.test(full.body), full.body);
    ck(tag, 'paid in full: the Build Confirmation document is still the Build Confirmation (documents unchanged)',
      full.view.open && /BUILD CONFIRMATION/i.test(full.view.text) && !/received in full/i.test(full.view.text), full.view.text.slice(0, 300));
    const figures = await p.evaluate(() => { const m = depositMaths(); return { total: m.total, received: m.amountReceived, owing: m.balanceOwing, payments: quote.payments.length, status: quote.quoteStatus }; });
    ck(tag, 'payment figures and record unchanged by the email (1150 / 1150 / 0, two payments, still active)',
      figures.total === 1150 && figures.received === 1150 && figures.owing === 0 && figures.payments === 2 && figures.status === 'active', figures);
    const row = (await db.query('select payload from builds')).rows[0].payload;
    ck(tag, 'stored record on the server: two payments, no email fields added', row.payments.length === 2 && !('emailSubject' in row) && row.quoteStatus === 'active', { payments: row.payments.length, keys: Object.keys(row).filter((k) => /mail/i.test(k)) });
    ck(tag, 'the part-paid document text did not change wording style (still a Build Confirmation)', /BUILD CONFIRMATION/i.test(partDoc), partDoc.slice(0, 200));
    if (shots) {
      await p.locator('#viewQuoteBtn').click(); await p.waitForTimeout(400);
      await p.locator('#viewQuoteSheet .component-sheet__panel').screenshot({ path: path.join(shots, `document-${tag}-paid-in-full.png`) });
      await p.evaluate(() => closeViewQuote());
      // The draft as a mail app would show it at this width (a plain rendering of Studio's subject and body).
      await p.setContent(`<meta name="viewport" content="width=device-width"><body style="font:15px -apple-system,Helvetica;margin:16px;white-space:pre-wrap;word-wrap:break-word"><b>To:</b> ${full.to}\n<b>Subject:</b> ${full.subject.replace(/</g, '&lt;')}\n<hr>${full.body.replace(/</g, '&lt;')}</body>`);
      await p.screenshot({ path: path.join(shots, `email-${tag}-paid-in-full.png`), fullPage: true });
    }
    await D.context.close();
  } finally {
    server.close();
  }
}

(async () => {
  const browser = await h.playwright.webkit.launch();
  try {
    await run(browser, { width: 390, mobile: true });
    await run(browser, { width: 1280, mobile: false });
  } finally {
    await browser.close();
  }
  console.log(`payment received email: ${passed}/${passed + failed} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
