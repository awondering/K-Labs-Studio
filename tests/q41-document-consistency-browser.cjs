// Q41 Email and Document Consistency: for each kind of job the three customer outputs - the Build Summary /
// Confirmation (or Repair / Order equivalent), the customer invoice and Studio's email draft - are produced by the real
// Studio in WebKit (production SQL in PGlite), on iPhone 390 (touch) and desktop 1280, and checked against ONE source:
// depositMaths(). Covered: new build, repair, refurbishment, components order; no deposit, deposit only, partial payment,
// paid in full; tax on and off; delivery and collection; Quote -> Active -> Complete titles. Synthetic data only.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... node tests/q41-document-consistency-browser.cjs [screenshots dir]
const path = require('node:path');
const fs = require('node:fs');
const h = require('./helpers/studio-pglite-harness.cjs');

const shots = process.argv[2] || '';
if (shots && !(fs.existsSync(shots) && fs.statSync(shots).isDirectory())) throw new Error(`Screenshots folder does not exist: ${shots}`);
const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}

const BLANK = { category: 'Blank', description: '9 ft 5 wt graphite blank', cost: 320, unitPrice: 420, quantity: 1 };
const GUIDES = { category: 'Guides', description: 'Fuji KR guide set', cost: 60, unitPrice: 95, quantity: 1 };
const TIP = { category: 'Tip Top', description: 'Fuji tip top 5.5', cost: 5, unitPrice: 15, quantity: 1 };
const SEAT = { category: 'Reel Seat', description: 'Fuji reel seat', cost: 20, unitPrice: 40, quantity: 2 };
// price: the Rod / Job price (excluding delivery); delivery: delivery cost before tax (0 = collection);
// pay: payments as [type, amount | 'rest'].
const SCENARIOS = [
  { id: 'build-quote-deposit-tax-delivery', jobType: 'build', status: 'quote', tax: true, delivery: 25, deposit: 300, price: 1150, components: [BLANK, GUIDES], pay: [] },
  { id: 'build-active-deposit-paid', jobType: 'build', status: 'active', tax: true, delivery: 25, deposit: 300, price: 1150, components: [BLANK, GUIDES], pay: [['deposit', 300]] },
  { id: 'build-active-partial', jobType: 'build', status: 'active', tax: true, delivery: 25, deposit: 300, price: 1150, components: [BLANK, GUIDES], pay: [['deposit', 300], ['balance', 200]] },
  { id: 'build-active-paid-in-full', jobType: 'build', status: 'active', tax: true, delivery: 25, deposit: 300, price: 1150, components: [BLANK, GUIDES], pay: [['deposit', 300], ['balance', 'rest']] },
  { id: 'build-complete-paid-notax', jobType: 'build', status: 'complete', tax: false, delivery: 25, deposit: 0, price: 1150, components: [BLANK, GUIDES], pay: [['balance', 'rest']] },
  { id: 'repair-active-paid-collection', jobType: 'repair', status: 'active', tax: true, delivery: 0, deposit: 0, price: 180, components: [TIP], notes: 'Replace tip top\nRe-wrap two guides', pay: [['balance', 'rest']] },
  { id: 'refurb-complete-deposit-notax', jobType: 'repair', status: 'complete', tax: false, delivery: 15, deposit: 50, price: 420, components: [GUIDES], notes: 'Full refurbishment: strip and re-wrap all guides\nNew epoxy finish', pay: [['deposit', 50]] },
  { id: 'components-active-paid-tax', jobType: 'build', kind: 'components', status: 'active', tax: true, delivery: 10, deposit: 0, components: [GUIDES, SEAT], pay: [['balance', 'rest']] },
  { id: 'components-complete-unpaid-notax', jobType: 'build', kind: 'components', status: 'complete', tax: false, delivery: 10, deposit: 0, components: [GUIDES, SEAT], pay: [] },
];

// Puts one synthetic job in front of Studio (the same global record every document reads).
async function setJob(p, s) {
  return p.evaluate((s) => {
    studioSettings.taxEnabled = s.tax; studioSettings.currency = 'NZD'; saveStudioSettings();
    businessProfile = normalizeBusinessProfile({ ...businessProfile, businessName: 'K-Labs', paymentAccountName: 'K-Labs Ltd', paymentAccountNumber: '12-3456-7890123-00' });
    quote = normalizeQuote({ id: crypto.randomUUID(), customerName: 'Jordan Ellis', email: 'jordan@example.test', phone: '021 555 0199',
      addressLine1: '5 River Rd', cityTown: 'Taupo', postcode: '3330', country: 'New Zealand',
      buildName: s.jobType === 'repair' ? 'Old trout rod' : s.kind === 'components' ? '' : '9 ft 5 wt trout rod', notes: s.notes || '',
      jobType: s.jobType, jobKind: s.kind || '', status: s.status, quoteStatus: s.status, quoteNumber: 'Q-4101', gstRate: 15, includeGst: true,
      fulfilmentMethod: s.delivery ? 'shipping' : 'collection', deliveryEntryMode: 'total', deliveryTotal: s.delivery,
      depositEnabled: s.deposit > 0, depositType: 'fixed', depositValue: s.deposit, estimatedCompletionDate: '2026-12-18',
      completedAt: s.status === 'complete' ? '2026-12-10T10:00:00Z' : '', components: s.components });
    if (s.price) applyManualRodPrice(s.price);
    let paid = 0;
    const total = depositMaths().total;
    quote.payments = s.pay.map(([type, amount], i) => {
      const value = amount === 'rest' ? Math.round((total - paid) * 100) / 100 : amount;
      paid += value;
      return { id: `pay-${i}`, type, amount: value, date: '2026-11-25' };
    });
    const m = depositMaths();
    return { total: m.total, received: m.amountReceived, owing: m.balanceOwing, delivery: m.deliveryCharge, gst: Math.round(m.gst * 100) / 100,
      parts: customerIncludedParts(), title: customerDocumentLabels().title };
  }, s);
}

async function outputs(p) {
  // Build Summary / Confirmation, as opened from Job Pricing & Actions.
  await p.evaluate(() => openViewQuote());
  await p.waitForFunction(() => !document.getElementById('viewQuoteSheet').hidden, null, { timeout: 5000 });
  await p.waitForTimeout(350);
  const summary = await p.evaluate(() => document.querySelector('#viewQuoteSheet .view-quote').innerText);
  const summaryHeading = await p.evaluate(() => document.getElementById('viewQuoteSheet').innerText.split('\n').map((x) => x.trim()).filter(Boolean)[0]);
  return { summary, summaryHeading };
}

async function invoiceOutput(p) {
  await p.evaluate(() => openInvoicePreview());
  await p.waitForFunction(() => { const s = document.getElementById('invoicePreviewSheet'); return s && !s.hidden; }, null, { timeout: 5000 });
  await p.waitForTimeout(500);
  // The page the builder sees (the preview's visible copy of the invoice document).
  return p.evaluate(() => ({ text: document.querySelector('#invoicePreviewSheet .invoice-preview__columns').innerText,
    pages: document.querySelector('#invoicePreviewSheet .invoice-preview__counter').textContent.trim() }));
}

// The email Studio hands the mail app (subject and body), taken from Studio's own emailCurrentQuote.
async function emailDraft(p) {
  return p.evaluate(() => {
    const stand = { location: { href: '' } };
    new Function('window', 'options', `return (${emailCurrentQuote.toString()})(options)`)(stand, { fromPreview: true });
    const href = stand.location.href;
    const params = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    return { subject: params.get('subject') || '', body: params.get('body') || '' };
  });
}

const money = (v) => Number(v).toFixed(2);
const amountsIn = (text) => (text.match(/\d+\.\d{2}/g) || []);

async function run(browser, { width, mobile }) {
  const tag = `${mobile ? 'iphone' : 'desktop'}-${width}`;
  const db = await h.createDatabase(root);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const D = await h.openDevice(browser, base, h.makeHandler(db, []), { width, mobile, name: tag });
    await h.launch(D, base);
    const p = D.page;
    for (const s of SCENARIOS) {
      const t = `${tag} ${s.id}`;
      const m = await setJob(p, s);
      const { summary, summaryHeading } = await outputs(p);
      if (shots) await p.screenshot({ path: path.join(shots, `${tag}-${s.id}-1-summary.png`) });
      await p.evaluate(() => closeViewQuote());
      const { text: invoice, pages } = await invoiceOutput(p);
      ck(t, 'the invoice fits on one A4 page (as before Q41)', pages === 'Page 1 of 1', pages);
      if (shots) await p.screenshot({ path: path.join(shots, `${tag}-${s.id}-2-invoice.png`) });
      await p.evaluate(() => { const sheet = document.getElementById('invoicePreviewSheet'); sheet.querySelector('[data-invoice-preview-action="close"]').click(); });
      await p.waitForTimeout(200);
      const mail = await emailDraft(p);
      if (shots) fs.writeFileSync(path.join(shots, `${tag}-${s.id}-3-email.txt`), `Subject: ${mail.subject}\n\n${mail.body}\n`);
      const S = summary, I = invoice, E = mail.body;
      const paidInFull = m.total > 0 && m.received > 0 && m.owing <= 0;

      // 1. The same total, received and balance figures in all three, equal to depositMaths().
      const total = money(m.total);
      ck(t, `total ${total} on the summary, the invoice and in the email`, amountsIn(S).includes(total) && amountsIn(I).includes(total) && amountsIn(E).includes(total), { total, S: amountsIn(S), I: amountsIn(I), E: amountsIn(E) });
      if (m.received > 0) {
        const recv = money(m.received);
        const label = (text) => (text.match(/(Total received|Deposit received)\W*\$?(\d+\.\d{2})/i) || []).slice(1).map((x) => x.toLowerCase());
        ck(t, `received ${recv}: the same label and amount in all three`, [S, I, E].every((x) => label(x)[1] === recv) && new Set([S, I, E].map((x) => label(x)[0])).size === 1, { S: label(S), I: label(I), E: label(E) });
      } else {
        ck(t, 'nothing received: no received line anywhere', ![S, I, E].some((x) => /(total|deposit) received\W*\$?[1-9]/i.test(x)), { S, E });
      }
      if (s.status !== 'quote') {
        const balance = (text) => (text.match(/(Balance owing|Paid in full)\W*\$?(\d+\.\d{2})/i) || []).slice(1).map((x) => x.toLowerCase());
        const want = paidInFull ? ['paid in full', '0.00'] : ['balance owing', money(m.owing)];
        ck(t, `balance: "${want[0]}" ${want[1]} in all three`, [S, I, E].every((x) => JSON.stringify(balance(x)) === JSON.stringify(want)), { want, S: balance(S), I: balance(I), E: balance(E) });
      }
      // 2. A fully paid job never suggests money is owed.
      if (paidInFull) {
        ck(t, 'paid in full: no "Balance owing/outstanding", no bank details, in any output', ![S, I, E].some((x) => /balance (owing|outstanding)|bank account|payment details/i.test(x)), { S, I, E });
      } else if (s.status !== 'quote') {
        ck(t, 'money owed: bank details on the summary and in the email', /bank account/i.test(S) && /Bank account/.test(E), { S, E });
      }
      // 3. Tax as configured; GST is never assumed.
      if (s.tax) {
        ck(t, 'tax on: the total names GST on the summary, the invoice and in the email; GST amount on the invoice',
          /total price including gst/i.test(S) && /total including gst/i.test(I) && /^Total including GST: /m.test(E) && amountsIn(I).includes(money(m.gst)), { gst: m.gst });
      } else {
        ck(t, 'tax off: no GST anywhere', ![S, I, E, mail.subject].some((x) => /\bGST\b/i.test(x)), { S, I, E });
      }
      // 4. Delivery kept separate and stated the same way.
      if (s.delivery) {
        const d = money(m.delivery);
        ck(t, `delivery ${d} shown separately ("included in total") on all three`, [S, I, E].every((x) => new RegExp(`delivery \\(included in total\\)\\W*\\$?${d.replace('.', '\\.')}`, 'i').test(x)), { d });
      } else {
        ck(t, 'collection: no delivery charge on any output', ![S, I, E].some((x) => /delivery \(included/i.test(x)), {});
      }
      // 5. Components: one heading and the same list on all three (new builds, repairs, refurbishments, orders).
      const listed = m.parts.map((x) => x.toLowerCase());
      ck(t, `Components heading and the same ${listed.length} item(s) on all three`, listed.length > 0 && [S, I, E].every((x) => /(^|\n)components(\s*\n|: )/i.test(x) && listed.every((item) => x.toLowerCase().includes(item)))
        && ![S, I, E].some((x) => /work included|what your rod includes|components included/i.test(x)), { listed });
      // 6. Each output says what it is.
      ck(t, `document title "${m.title}"`, summaryHeading.toLowerCase() === m.title.toLowerCase() || summaryHeading.toLowerCase().includes(m.title.toLowerCase()), summaryHeading);
      ck(t, 'the invoice is an invoice (draft)', /^Invoice/m.test(I) && /DRAFT/.test(I), I.slice(0, 120));
      const acknowledgement = s.status === 'active' && s.jobType === 'build' && !s.kind && paidInFull;
      ck(t, acknowledgement ? 'email: payment acknowledgement subject (Q39)' : `email subject names the document (${m.title})`,
        acknowledgement ? /Payment Received in Full/.test(mail.subject) && /^Hi Jordan,\n\nPayment has been received in full\./.test(E)
          : !/Payment Received in Full/.test(mail.subject) && !/received in full/i.test(E), mail.subject);
      if (s.kind === 'components') ck(t, 'components order: never described as a fishing rod', ![S, I, E].some((x) => /custom fishing rod|custom rod build/i.test(x)), { I: I.slice(0, 300) });
    }
    // 7. Quote -> Active -> Complete: the same job keeps its figures; only the document title changes.
    const journey = SCENARIOS[2];
    const titles = [];
    for (const status of ['quote', 'active', 'complete']) {
      const m = await setJob(p, { ...journey, status });
      titles.push([m.title, m.total]);
    }
    ck(tag, 'Quote -> Active -> Complete: Customer Quote, Build Confirmation, Build Summary; same total', JSON.stringify(titles.map((x) => x[0])) === JSON.stringify(['Customer Quote', 'Build Confirmation', 'Build Summary']) && new Set(titles.map((x) => x[1])).size === 1, titles);
    const errors = D.errors || [];
    ck(tag, 'no page errors', errors.length === 0, errors.slice(0, 3));
    await D.context.close();
  } finally {
    server.close();
  }
}

(async () => {
  const playwright = require(process.env.PLAYWRIGHT_MODULE);
  const browser = await playwright.webkit.launch();
  try {
    await run(browser, { width: 390, mobile: true });
    await run(browser, { width: 1280, mobile: false });
  } finally {
    await browser.close();
  }
  console.log(`q41 document consistency: ${passed}/${passed + failed} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
