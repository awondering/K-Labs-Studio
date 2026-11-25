// Q41 live regression (BUILD-902, 26 Nov 2026): an invoice issued BEFORE the payment was recorded must, when reopened,
// show the payment and the job's current components and delivery - the same as the Build Summary and the email.
// Sequence: save an Active build (one component, delivery $7.50, total $57.50) -> issue the invoice through Studio's
// Issue Invoice button (server operation, production SQL in PGlite) -> record the full payment -> reopen the invoice.
// Also checks EXISTING saved invoices: one issued by the previous release (v289, no components/delivery stored), opened
// in the release under test after a reload from the server. Synthetic data only. WebKit, iPhone 390 and desktop 1280.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... [Q41_OLD_ROOT=<v289 checkout>]
//        node tests/q41-issued-invoice-payments-browser.cjs [screenshots dir]
const path = require('node:path');
const fs = require('node:fs');
const h = require('./helpers/studio-pglite-harness.cjs');

const repo = path.join(__dirname, '..');
const oldRoot = process.env.Q41_OLD_ROOT || '';
const shots = process.argv[2] || '';
if (shots && !(fs.existsSync(shots) && fs.statSync(shots).isDirectory())) throw new Error(`Screenshots folder does not exist: ${shots}`);
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}
const settled = (p) => p.waitForFunction(() => !hasUnsavedQuoteChanges && !quoteAutosaveInFlight && !financialOperationInFlight
  && window.KLABS_BUILD_SYNC.getStatus() === 'synced', null, { timeout: 20000 }).then(() => true, () => false);

// BUILD-902's figures: one component, delivery $7.50, total $57.50. Tax off reproduces them exactly; tax on is the same
// sequence with GST.
const JOBS = [
  { id: 'build902-tax-off', tax: false, price: 50, delivery: 7.5, total: '57.50', deliveryShown: '7.50' },
  // With GST on, the $7.50 delivery is charged as $8.63 including GST.
  { id: 'build902-tax-on', tax: true, price: 50, delivery: 7.5, total: '66.13', deliveryShown: '8.63' },
];

// The builder's own settings (tax and business details), the same on every device the builder uses.
const applySettings = (p, job) => p.evaluate((job) => {
  studioSettings.taxEnabled = job.tax; studioSettings.currency = 'NZD'; saveStudioSettings();
  businessProfile = normalizeBusinessProfile({ ...businessProfile, businessName: 'K-Labs', paymentAccountName: 'K-Labs Ltd', paymentAccountNumber: '12-3456-7890123-00' });
}, job);
async function saveActiveJob(p, job, name) {
  await applySettings(p, job);
  return p.evaluate(async ({ job, name }) => {
    quote = normalizeQuote({ id: crypto.randomUUID(), customerName: name, email: 'jordan@example.test', phone: '021 555 0199',
      addressLine1: '5 River Rd', cityTown: 'Taupo', postcode: '3330', country: 'New Zealand', buildName: 'Tip repair',
      jobType: 'build', status: 'active', quoteStatus: 'active', gstRate: 15, includeGst: true,
      fulfilmentMethod: 'shipping', deliveryEntryMode: 'total', deliveryTotal: job.delivery,
      components: [{ category: 'Tip Top', description: 'Fuji tip top 5.5', cost: 8, unitPrice: 15, quantity: 1 }] });
    applyManualRodPrice(job.tax ? job.price * 1.15 : job.price);
    hasUnsavedQuoteChanges = true;
    await persistCurrentQuoteRecord(); markQuoteSaved();
    return { id: quote.id, total: depositMaths().total };
  }, { job, name });
}

async function openInvoice(p) {
  await p.evaluate(() => openInvoicePreview());
  await p.waitForFunction(() => { const s = document.getElementById('invoicePreviewSheet'); return s && !s.hidden; }, null, { timeout: 5000 });
  await p.waitForTimeout(400);
  return p.evaluate(() => document.querySelector('#invoicePreviewSheet .invoice-preview__columns').innerText);
}
const closeInvoice = (p) => p.evaluate(() => document.querySelector('#invoicePreviewSheet [data-invoice-preview-action="close"]').click());

// Issue through the real Issue Invoice button and its confirmation.
async function issueInvoice(p) {
  await openInvoice(p);
  await p.locator('#invoicePreviewSheet [data-invoice-preview-action="issue"]').click();
  const confirm = p.locator('#confirmSheetActions button', { hasText: 'Issue Invoice' });
  await confirm.waitFor({ timeout: 5000 }).catch(async () => {
    throw new Error(`no Issue confirmation; Studio showed: ${await p.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.getClientRects().length).map((d) => d.innerText.slice(0, 200)).join(' | '))}`);
  });
  await confirm.click();
  await p.waitForFunction(() => !!quote.issuedInvoice, null, { timeout: 15000 });
  await settled(p);
  await closeInvoice(p);
}

async function payInFull(p) {
  return p.evaluate(async () => {
    const m = depositMaths();
    await commitFinancialOperation('add_payment', { id: crypto.randomUUID(), type: 'balance', amount: Math.round(m.balanceOwing * 100) / 100, date: '2026-11-26' }, false, 'Payment saved');
    const after = depositMaths();
    return { received: after.amountReceived, owing: after.balanceOwing, total: after.total };
  });
}

async function summaryAndEmail(p) {
  await p.evaluate(() => openViewQuote());
  await p.waitForFunction(() => !document.getElementById('viewQuoteSheet').hidden, null, { timeout: 5000 });
  await p.waitForTimeout(300);
  const summary = await p.evaluate(() => document.querySelector('#viewQuoteSheet .view-quote').innerText);
  await p.evaluate(() => closeViewQuote());
  const email = await p.evaluate(() => customerEmailLines().join('\n'));
  return { summary, email };
}

// The invoice, the Build Summary and the email all show the CURRENT payment state, components and delivery.
function checkAllThree(tag, label, { invoice, summary, email }, job) {
  const I = invoice, S = summary, E = email;
  ck(tag, `${label}: invoice shows the payment - Total received ${job.total}, PAID IN FULL 0.00, the payment row`,
    new RegExp(`Total received\\s*${job.total.replace('.', '\\.')}`).test(I) && /PAID IN FULL\s*0\.00/i.test(I)
    && new RegExp(`Balance payment\\s*2026-11-26\\s*${job.total.replace('.', '\\.')}`).test(I), I);
  ck(tag, `${label}: invoice never says a balance is owing or that no payments are recorded`, !/balance owing|no payments recorded/i.test(I), I);
  ck(tag, `${label}: invoice lists the component and the delivery ${job.deliveryShown}`, /Components: 1 × Tip Top/i.test(I) && new RegExp(`Delivery \\(included in total\\)\\s*${job.deliveryShown.replace('.', '\\.')}`).test(I), I);
  ck(tag, `${label}: Build Summary and email say the same - received ${job.total}, Paid in full, component, delivery, no bank details`,
    [S, E].every((x) => new RegExp(`Total received\\W*\\$?${job.total.replace('.', '\\.')}`, 'i').test(x) && /Paid in full\W*\$?0\.00/i.test(x)
      && /1 × Tip Top/i.test(x) && new RegExp(`Delivery \\(included in total\\)\\W*\\$?${job.deliveryShown.replace('.', '\\.')}`, 'i').test(x) && !/bank account|balance owing/i.test(x)), { S, E });
  ck(tag, `${label}: the same total ${job.total} on all three`, [I, S, E].every((x) => x.includes(job.total)), {});
}

async function run(browser, { width, mobile }) {
  const tag = `${mobile ? 'iphone' : 'desktop'}-${width}`;
  const db = await h.createDatabase(repo);
  let root = repo;
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const handler = h.makeHandler(db, []);
  try {
    const D = await h.openDevice(browser, base, handler, { width, mobile, name: tag });
    await h.launch(D, base);
    const p = D.page;
    for (const job of JOBS) {
      const t = `${tag} ${job.id}`;
      const saved = await saveActiveJob(p, job, `Jordan ${job.id}`);
      ck(t, `saved Active build, total ${job.total}`, saved.total.toFixed(2) === job.total && await settled(p), saved);
      await issueInvoice(p);
      const stored = (await db.query(`select payload->'issuedInvoice' as inv from builds where payload->>'id' = $1`, [saved.id])).rows[0]?.inv;
      ck(t, 'invoice issued on the server BEFORE any payment (stored with no payments)', !!stored && Array.isArray(stored.payments) && stored.payments.length === 0, stored);
      const paid = await payInFull(p);
      ck(t, 'full payment recorded: Studio shows nothing owing', paid.owing === 0 && paid.received.toFixed(2) === job.total && await settled(p), paid);
      const invoice = await openInvoice(p);
      if (shots) await p.screenshot({ path: path.join(shots, `${tag}-${job.id}-reopened-invoice.png`) });
      await closeInvoice(p);
      const { summary, email } = await summaryAndEmail(p);
      checkAllThree(t, 'reopened issued invoice', { invoice, summary, email }, job);
      const statement = await p.evaluate(async () => { openPaymentStatement(); await new Promise((r) => setTimeout(r, 300));
        const text = document.querySelector('#invoicePreviewSheet .invoice-preview__columns').innerText;
        document.querySelector('#invoicePreviewSheet [data-invoice-preview-action="close"]').click(); return text; });
      ck(t, 'Payment Statement agrees with the invoice (paid in full)', /PAID IN FULL\s*0\.00/i.test(statement) && !/balance owing/i.test(statement), statement);
      const after = (await db.query(`select payload->'issuedInvoice' as inv from builds where payload->>'id' = $1`, [saved.id])).rows[0]?.inv;
      ck(t, 'the stored issued invoice itself is unchanged (number, date, total kept; nothing rewritten)', JSON.stringify(after) === JSON.stringify(stored), {});
    }
    // An existing saved invoice reopened on another device after reload from the server.
    const D2 = await h.openDevice(browser, base, handler, { width, mobile, name: `${tag} second device` });
    await h.launch(D2, base);
    const p2 = D2.page;
    await applySettings(p2, JOBS[0]);
    await p2.evaluate(() => window.KLABS_UI.openActiveBuildsList());
    await p2.locator('.saved-build-card__open', { hasText: 'Jordan build902-tax-off' }).first().click();
    await p2.waitForTimeout(600); await settled(p2);
    const invoice2 = await openInvoice(p2);
    await closeInvoice(p2);
    const se2 = await summaryAndEmail(p2);
    checkAllThree(`${tag} reload`, 'saved invoice opened on a second device', { invoice: invoice2, ...se2 }, JOBS[0]);
    ck(tag, 'no page errors', D.errors.length === 0 && D2.errors.length === 0, [...D.errors, ...D2.errors].slice(0, 3));
    await D.context.close();
    await D2.context.close();

    // An invoice issued by the PREVIOUS release (v289: no components or delivery stored), paid afterwards, opened now.
    if (oldRoot) {
      root = oldRoot;
      const O = await h.openDevice(browser, base, handler, { width, mobile, name: `${tag} v289` });
      await h.launch(O, base);
      const old = await saveActiveJob(O.page, JOBS[0], 'Jordan legacy');
      await settled(O.page);
      await issueInvoice(O.page);
      const legacy = (await db.query(`select payload->'issuedInvoice' as inv from builds where payload->>'id' = $1`, [old.id])).rows[0]?.inv;
      ck(`${tag} v289`, 'previous release issued the invoice with no components/delivery stored and no payments', !!legacy && !('components' in legacy) && !('delivery' in legacy) && legacy.payments.length === 0, legacy);
      await O.context.close();
      root = repo;
      const N = await h.openDevice(browser, base, handler, { width, mobile, name: `${tag} after upgrade` });
      await h.launch(N, base);
      await applySettings(N.page, JOBS[0]);
      await N.page.evaluate(() => window.KLABS_UI.openActiveBuildsList());
      await N.page.locator('.saved-build-card__open', { hasText: 'Jordan legacy' }).first().click();
      await N.page.waitForTimeout(600); await settled(N.page);
      await payInFull(N.page);
      await settled(N.page);
      const invoice3 = await openInvoice(N.page);
      if (shots) await N.page.screenshot({ path: path.join(shots, `${tag}-v289-issued-reopened-invoice.png`) });
      await closeInvoice(N.page);
      const se3 = await summaryAndEmail(N.page);
      checkAllThree(`${tag} v289`, 'invoice issued by v289, paid later, reopened', { invoice: invoice3, ...se3 }, JOBS[0]);
      ck(`${tag} v289`, 'no page errors', N.errors.length === 0, N.errors.slice(0, 3));
      await N.context.close();
    }
  } finally {
    server.close();
  }
}

(async () => {
  const browser = await require(process.env.PLAYWRIGHT_MODULE).webkit.launch();
  try {
    await run(browser, { width: 390, mobile: true });
    await run(browser, { width: 1280, mobile: false });
  } finally {
    await browser.close();
  }
  console.log(`q41 issued invoice payments: ${passed}/${passed + failed} checks passed${oldRoot ? '' : ' (v289 legacy case skipped: set Q41_OLD_ROOT)'}`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
