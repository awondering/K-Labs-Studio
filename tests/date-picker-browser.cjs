// Q37: native date fields - the calendar closes after a date is picked, dark native styling, typed entry preserved.
// Real Studio in WebKit (Safari's engine) as an iPhone (touch, 390 px) and as a desktop window, and Chromium desktop.
// A browser's own calendar pop-up is not part of the page, so automation cannot see it open or close. What closes it
// is the field giving up focus once the date is picked (Safari keeps it open while the field stays focused); that is
// what these checks observe. Typed entry and arrow-key changes must keep the focus (nothing closes mid-entry).
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... node tests/date-picker-browser.cjs [screenshot dir]
const path = require('node:path');
const h = require('./helpers/studio-pglite-harness.cjs');

const shots = process.argv[2] || '';
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}
const root = path.join(__dirname, '..');
const PARTS = [{ category: 'Guides', description: 'Guide set', cost: 55, unitPrice: 70, quantity: 1 }];

async function openBuild(p, customer) {
  await p.evaluate(async ({ customer, parts }) => {
    clearActiveSavedBuildRef();
    quote = normalizeQuote({ customerName: customer, buildName: 'Date Test', status: 'quote', quoteStatus: 'quote', gstRate: 15, includeGst: true, jobType: 'build', components: parts });
    applyManualRodPrice(300);
    hasUnsavedQuoteChanges = true; await persistCurrentQuoteRecord(); markQuoteSaved();
  }, { customer, parts: PARTS });
  await p.evaluate(() => window.KLABS_UI.openActiveBuildsList());
  await p.locator('[data-builds-status-filter="quote"]').click();
  await p.locator('.saved-build-card__open', { hasText: customer }).first().click();
  await p.waitForTimeout(400);
  await expand(p, 'workshopBuildSpecsBody');
}
// Workshop sections open one at a time; open the one that holds the field and let it finish opening.
async function expand(p, body) {
  const head = p.locator(`[aria-controls="${body}"]`).first();
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await p.waitForTimeout(700);
}
// What a native calendar does when a day is chosen: sets the value and fires input then change on the field.
const pickFromCalendar = (p, selector, value) => p.evaluate(({ selector, value }) => {
  const field = document.querySelector(selector);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}, { selector, value });
const focused = (p, selector) => p.evaluate((s) => document.activeElement === document.querySelector(s), selector);
const settle = (p) => p.waitForTimeout(150);

async function run(browser, engine, { width, mobile }) {
  const tag = `${engine} ${mobile ? 'iPhone' : 'desktop'} ${width}`;
  const db = await h.createDatabase(root);
  const handler = h.makeHandler(db, []);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // A fixed locale, so the order of a typed date (month/day/year) does not depend on this computer's settings.
    const D = await h.openDevice(browser, base, handler, { width, mobile, name: tag, locale: 'en-US' });
    await h.launch(D, base);
    const p = D.page;
    await openBuild(p, `Date ${engine} ${width}`);
    const est = '#quoteEstimatedCompletionDate';
    const field = p.locator(est);
    await field.scrollIntoViewIfNeeded();

    // Dark native styling on every date field (Estimated Completion, payment date, owner admin expiry dates).
    const schemes = await p.evaluate(() => [...document.querySelectorAll('input[type="date"]')].map((el) => [el.id, getComputedStyle(el).colorScheme]));
    ck(tag, 'every date field asks for the dark native calendar and control (color-scheme: dark)',
      schemes.length === 4 && schemes.every(([, scheme]) => scheme === 'dark'), schemes);
    const otherScheme = await p.evaluate(() => getComputedStyle(document.getElementById('quoteNotes')).colorScheme);
    ck(tag, 'other fields unchanged (scheme only on date fields)', otherScheme === 'normal', otherScheme);
    if (shots) await field.screenshot({ path: path.join(shots, `estimated-completion-${engine}-${mobile ? 'iphone' : 'desktop'}.png`) });

    // Pick with the pointer / a tap: the field lets go of focus, so Safari closes its calendar. The date is kept and saved.
    if (mobile) await field.tap(); else await field.click({ position: { x: 8, y: 10 } });
    ck(tag, 'tapping/clicking the field focuses it (calendar opens)', await focused(p, est));
    await pickFromCalendar(p, est, '2026-12-15');
    await settle(p);
    const picked = await p.evaluate(() => ({ value: document.getElementById('quoteEstimatedCompletionDate').value, saved: quote.estimatedCompletionDate }));
    ck(tag, 'after picking a date the field lets go of focus (the calendar closes); the date is kept and saved',
      !(await focused(p, est)) && picked.value === '2026-12-15' && picked.saved === '2026-12-15', { ...picked, stillFocused: await focused(p, est) });

    // Opening it again and choosing another date works the same way.
    if (mobile) await field.tap(); else await field.click({ position: { x: 8, y: 10 } });
    await pickFromCalendar(p, est, '2026-12-20');
    await settle(p);
    ck(tag, 'a second pick closes it again and replaces the date', !(await focused(p, est)) && (await p.evaluate(() => quote.estimatedCompletionDate)) === '2026-12-20');

    // Clearing the date (the calendar's Clear/Reset) does not force it closed.
    if (mobile) await field.tap(); else await field.click({ position: { x: 8, y: 10 } });
    await pickFromCalendar(p, est, '');
    await settle(p);
    ck(tag, 'clearing the date leaves the field as it was (no forced close); the date is cleared',
      (await focused(p, est)) && (await p.evaluate(() => quote.estimatedCompletionDate || '')) === '');
    await p.evaluate(() => document.activeElement && document.activeElement.blur());

    if (!mobile && engine === 'webkit') {
      // Playwright's WebKit cannot type into the parts of a date field (nothing is entered, with or without Q37), so
      // the rule is checked directly: keys pressed in the field, then a change as typing reports it - focus stays.
      await field.click({ position: { x: 8, y: 10 } });
      await p.keyboard.press('1');
      await p.evaluate(() => { const el = document.getElementById('quoteEstimatedCompletionDate'); el.value = '2026-12-25'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
      await settle(p);
      ck(tag, 'click, then keys: a change while typing keeps the field focused (not closed mid-entry); the date is saved',
        (await focused(p, est)) && (await p.evaluate(() => quote.estimatedCompletionDate)) === '2026-12-25');
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
    }
    if (!mobile && engine === 'chromium') {
      // Typed entry: click into the field and type the date. 12/12/2026 reads the same in day/month and month/day order.
      // Chrome reports a change after each typed part; focus must stay the whole time and the typed date is saved.
      const keys = '12122026';
      await field.click({ position: { x: 8, y: 10 } });
      const focusDuring = [];
      for (const key of keys) { await p.keyboard.press(key); focusDuring.push(await focused(p, est)); }
      await settle(p);
      const typed = await p.evaluate(() => ({ value: document.getElementById('quoteEstimatedCompletionDate').value, saved: quote.estimatedCompletionDate }));
      ck(tag, 'typing a date keeps the field focused throughout and saves the typed date',
        focusDuring.every(Boolean) && typed.value === '2026-12-12' && typed.saved === '2026-12-12' && (await focused(p, est)), { focusDuring, typed });
      // Arrow keys change one part of the date: the field stays focused.
      await p.keyboard.press('ArrowUp');
      await settle(p);
      ck(tag, 'changing the date with the arrow keys keeps the field focused (and changes the date)', (await focused(p, est)) && !['', '2026-12-12'].includes(await p.evaluate(() => quote.estimatedCompletionDate || '')));
      // Mouse into the field, then type: still not closed mid-entry.
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await field.click({ position: { x: 8, y: 10 } });
      await p.keyboard.press('0'); await p.keyboard.press('1');
      await settle(p);
      ck(tag, 'clicking into the field and then typing keeps it focused (not closed mid-entry)', await focused(p, est));
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
    }

    // A date set by Studio itself (e.g. the guided demo) never moves focus.
    const programmatic = await p.evaluate(() => {
      const el = document.getElementById('quoteEstimatedCompletionDate');
      el.focus();
      el.value = '2027-01-05';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return new Promise((resolve) => setTimeout(() => resolve({ focused: document.activeElement === el, saved: quote.estimatedCompletionDate }), 100));
    });
    ck(tag, 'a date set without the pointer (keyboard or Studio itself) does not move focus', programmatic.focused && programmatic.saved === '2027-01-05', programmatic);
    await p.evaluate(() => document.activeElement && document.activeElement.blur());

    // Payment date in Record Payment: same behaviour; the payment saves with the picked date.
    await expand(p, 'workshopQuoteSummaryBody');
    await p.locator('#quoteRecordPaymentBtn').scrollIntoViewIfNeeded();
    await p.locator('#quoteRecordPaymentBtn').click();
    await p.waitForTimeout(300);
    const pay = p.locator('#quoteBalanceReceivedDate');
    if (mobile) await pay.tap(); else await pay.click({ position: { x: 8, y: 10 } });
    await pickFromCalendar(p, '#quoteBalanceReceivedDate', '2026-11-21');
    await settle(p);
    const payFocused = await focused(p, '#quoteBalanceReceivedDate');
    if (shots) await p.screenshot({ path: path.join(shots, `record-payment-${engine}-${mobile ? 'iphone' : 'desktop'}.png`) });
    await p.locator('#quoteBalanceReceivedAmount').fill('10');
    await p.locator('#quoteBalanceReceivedSave').click();
    await p.waitForTimeout(1500);
    const payments = await p.evaluate(() => (quote.payments || []).map((x) => [Number(x.amount), x.date]));
    const payError = await p.locator('#quoteBalanceReceivedError').textContent();
    ck(tag, 'payment date: picking closes it; the payment is recorded with that date',
      !payFocused && payments.some(([amount, date]) => amount === 10 && date === '2026-11-21'), { payFocused, payments, payError });

    const errors = D.errors.filter((e) => !/favicon/i.test(e));
    ck(tag, 'no page errors', errors.length === 0, errors);
    await D.context.close();
  } finally {
    server.close();
  }
}

(async () => {
  const webkit = await h.playwright.webkit.launch();
  try {
    await run(webkit, 'webkit', { width: 390, mobile: true });
    await run(webkit, 'webkit', { width: 320, mobile: true });
    await run(webkit, 'webkit', { width: 1280, mobile: false });
  } finally { await webkit.close(); }
  // CHROMIUM_EXECUTABLE: a Chromium build matching this Playwright (the WebKit browsers folder holds WebKit only).
  const chromium = await h.playwright.chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {});
  try {
    await run(chromium, 'chromium', { width: 1280, mobile: false });
  } finally { await chromium.close(); }
  console.log(`date picker: ${passed}/${passed + failed} checks passed`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
