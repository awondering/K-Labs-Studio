// Q18 Phase 2A: full playback of the scripted demonstration on the real screens, Start -> customer quote.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/demo-playback-browser.cjs   (WebKit; DEMO_BROWSER=chromium to override)
// Serves the repository from a local HTTP server with every other request refused. Synthetic demonstration data only.
// Checks, at Mac and iPhone 13 sizes: no autoplay; every figure Studio shows while pricing and on the quote matches
// Studio's own quoteMaths(); the parts' prices come from the demonstration library; the quote carries the DEMO watermark
// and a local quote number with no "Connect to allocate" notice; Pause holds everything and Play carries on; the
// visitor's own clicks, taps and typing change nothing; sheets are never covered by the dock; Replay and the chapter
// controls restart without leaving Demo Mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };

// The parts the demonstration picks, with the demonstration library's cost prices (js/demo-data.js).
const PART_COSTS = { "7'0\" Medium Spin 6-10 kg": 168, 'Medium Spin Guide Set': 74, 'DPS 18': 28, 'EVA Split Grip': 22, 'Aluminium Winding Check 16 mm': 6, 'NCP Nylon Thread A Black': 8 };
const LABOUR = { rate: 85, hours: 5 };

function serve() {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const url = new URL(req.url, 'http://x');
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const money = (text) => { const m = /-?\$?\s*(-?[\d,]+(?:\.\d+)?)/.exec(String(text).replace(/−/g, '-')); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
const near = (a, b, tol = 0.006) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

// Everything Studio shows about the price, read from the screen, next to quoteMaths()/depositMaths() worked out by Studio.
async function figures(page) {
  return page.evaluate(() => {
    const v = (id) => { const el = document.getElementById(id); return el ? (el.value !== undefined && el.tagName === 'INPUT' ? el.value : el.textContent) : null; };
    const maths = depositMaths();
    return {
      shown: { componentsCost: v('quoteCostBeforeMargin'), customerPrice: v('quoteTotal'), profit: v('quoteProfit'), margin: v('quoteMarginPercent'), gst: v('quoteGst'),
        earnings: v('quoteEstimatedEarnings'), summary: v('quotePricingSummaryValue'), headline: v('workshopBuildPricingSummaryText'), labourRate: v('quoteLabourRate'), labourHours: v('quoteLabourHours') },
      maths: { materialCost: maths.materialCost, labourCost: maths.labourCost, total: maths.total, gst: maths.gst, rodProfit: maths.rodProfit, rodMarginPercent: maths.rodMarginPercent,
        earnings: maths.exclusiveRevenue - maths.materialCost - maths.freightCost, balanceOwing: maths.balanceOwing },
      parts: quote.components.filter((c) => !componentRowIsEffectivelyEmpty(c)).map((c) => ({ name: c.category, libraryId: c.libraryComponentId || '', cost: componentRowLineCost(c) })),
      rate: quote.labourRate, hours: quote.labourHours, quoteNumber: quote.quoteNumber, prefix: businessProfile.quotePrefix,
    };
  });
}
function checkFigures(label, f) {
  const { shown, maths } = f;
  ck(`${label}: Components Cost shown = quoteMaths() materials`, near(money(shown.componentsCost), maths.materialCost), [shown.componentsCost, maths.materialCost]);
  ck(`${label}: Customer Price shown = quoteMaths() total`, near(Number(shown.customerPrice), maths.total), [shown.customerPrice, maths.total]);
  ck(`${label}: Required Profit shown = quoteMaths() profit`, near(Number(shown.profit), maths.rodProfit, 0.0051), [shown.profit, maths.rodProfit]);
  ck(`${label}: Margin % shown = quoteMaths() margin`, near(Number(shown.margin), maths.rodMarginPercent, 0.051), [shown.margin, maths.rodMarginPercent]);
  ck(`${label}: GST shown = quoteMaths() GST`, near(money(shown.gst), maths.gst, 0.0051), [shown.gst, maths.gst]);
  ck(`${label}: Estimated Earnings shown = quoteMaths()`, near(money(shown.earnings), maths.earnings, 0.0051), [shown.earnings, maths.earnings]);
  ck(`${label}: pricing summary shown = quoteMaths() total`, near(money(shown.summary), maths.total), [shown.summary, maths.total]);
  ck(`${label}: build headline shows the same total`, shown.headline.includes(money(shown.summary).toLocaleString('en-NZ', { minimumFractionDigits: 2 })) || near(money(shown.headline.split('·')[1]), maths.total), shown.headline);
}

async function boot(browser, base, contextOptions, search = '?demo') {
  const context = await browser.newContext({ ...contextOptions, serviceWorkers: 'block' });
  const offsite = [];
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (new URL(u).origin === base && route.request().method() === 'GET') return route.continue();
    offsite.push(`${route.request().method()} ${u}`);
    return route.abort('blockedbyclient');
  });
  // Record any "Connect to allocate" notice the moment it appears, however briefly.
  await context.addInitScript(() => {
    window.__notices = [];
    new MutationObserver(() => {
      const text = document.body ? document.body.innerText : '';
      if (/Connect to allocate|Could not allocate/i.test(text)) window.__notices.push('allocate notice');
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/${search}`);
  return { context, page, errors, offsite };
}
const caption = (page) => page.evaluate(() => document.getElementById('demoCaption').textContent);
const chapterLabel = (page) => page.evaluate(() => document.getElementById('demoChapterLabel').textContent);
const waitChapter = (page, n, timeout = 120000) => page.waitForFunction((n) => (document.getElementById('demoChapterLabel').textContent || '').startsWith(`${n}/`) || (n === 6 && /Finished/.test(document.getElementById('demoChapterLabel').textContent)), n, { timeout });
const finished = (page, timeout = 240000) => page.waitForFunction(() => /Jordan's quote is ready|stopped/i.test(document.getElementById('demoCaption').textContent), null, { timeout });
const visitorPress = async (page, selector, touch) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2; const y = box.y + box.height / 2;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  return true;
};
// Any open Studio sheet's title and close button sit below the dock.
async function sheetsClear(page) {
  return page.evaluate(() => {
    const dock = document.getElementById('demoModeBar').getBoundingClientRect();
    return [...document.querySelectorAll('.component-sheet')].filter((s) => !s.hidden && s.getClientRects().length).map((s) => {
      const header = s.querySelector('.component-sheet__header');
      const close = s.querySelector('.component-sheet__close');
      const h = header ? header.getBoundingClientRect() : null;
      const c = close ? close.getBoundingClientRect() : null;
      return { id: s.id, dockBottom: Math.round(dock.bottom), headerTop: h && Math.round(h.top), closeTop: c && Math.round(c.top), clear: !!h && h.top >= dock.bottom - 0.5 && (!c || c.top >= dock.bottom - 0.5) };
    });
  });
}

async function fullPlayback(browser, base, label, contextOptions, touch, shots) {
  console.log(`\n== Full playback: ${label} ==`);
  const { context, page, errors, offsite } = await boot(browser, base, contextOptions);
  await page.waitForSelector('#demoIntro:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const idle = await page.evaluate(() => ({ screen: document.querySelector('.screen.active')?.id, sheet: !!document.querySelector('.component-sheet:not([hidden])'), player: document.getElementById('demoPlayer').hidden, label: document.getElementById('demoChapterLabel').textContent }));
  ck(`${label}: nothing plays until the visitor presses Start`, idle.player === true && idle.label === '' && !idle.sheet, idle);
  await visitorPress(page, '#demoStartBtn', touch);
  await waitChapter(page, 1, 20000);
  ck(`${label}: Start shows the player with chapter 1`, (await chapterLabel(page)).startsWith('1/5 Enquiry'));

  // Sheets stay clear of the dock: customer sheet, component library, quote.
  await page.waitForSelector('#customerFinderNewForm:not([hidden])', { timeout: 30000 });
  await page.waitForFunction(() => (document.getElementById('customerFinderNewCustomerName')?.value || '').length >= 2, null, { timeout: 30000 });
  const customerSheet = await sheetsClear(page);
  ck(`${label}: the Add Customer sheet title and close button are not covered by the dock`, customerSheet.length > 0 && customerSheet.every((s) => s.clear), customerSheet);
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-1-add-customer.png`) });

  // Visitor input during playback: clicks/taps on Studio and typing change nothing the director does not do.
  const pressedBack = await visitorPress(page, '#customerFinderNewBackBtn', touch);
  await page.keyboard.type('HACK');
  await page.keyboard.press('Escape');
  const duringVisitor = await page.evaluate(() => ({ form: !document.getElementById('customerFinderNewForm').hidden, name: document.getElementById('customerFinderNewCustomerName').value }));
  ck(`${label}: during playback the visitor's tap and typing do nothing`, pressedBack && duringVisitor.form && !/HACK/.test(duringVisitor.name), duringVisitor);

  // Chapter 1 ends with a numbered build - from the local stand-in, without any "Connect to allocate" notice.
  await waitChapter(page, 2, 120000);
  const numbered = await page.evaluate(() => ({ screen: document.querySelector('.screen.active')?.id, name: document.getElementById('quoteCustomerName').value, number: quote.quoteNumber, prefix: businessProfile.quotePrefix }));
  ck(`${label}: the new build for Jordan Ellis has a local demonstration quote number`, numbered.screen === 'workshopScreen' && numbered.name === 'Jordan Ellis' && numbered.number === `${numbered.prefix}1046`, numbered);

  // Pause during chapter 3, while parts are being picked: nothing moves until Play.
  await waitChapter(page, 3, 120000);
  await page.waitForFunction(() => quote.components.filter((c) => !componentRowIsEffectivelyEmpty(c)).length >= 1, null, { timeout: 60000 });
  await visitorPress(page, '#demoPlayPauseBtn', touch);
  const snap = () => page.evaluate(() => JSON.stringify({ parts: quote.components.map((c) => c.libraryComponentId || ''), sheet: [...document.querySelectorAll('.component-sheet')].filter((s) => !s.hidden).map((s) => s.id + (s.querySelector('h2')?.textContent || '')), hours: document.getElementById('quoteLabourHours').value, store: window.KLABS_DEMO.storeKeys().length }));
  const pausedAt = await snap();
  const pauseState = await page.evaluate(() => ({ button: document.getElementById('demoPlayPauseBtn').textContent, caption: document.getElementById('demoCaption').textContent }));
  await page.waitForTimeout(4000);
  ck(`${label}: Pause holds the demonstration still (4 s)`, (await snap()) === pausedAt && pauseState.button === 'Play' && /^Paused/.test(pauseState.caption), { pauseState });
  const pickerSheet = await sheetsClear(page);
  ck(`${label}: the component library sheet is not covered by the dock`, pickerSheet.every((s) => s.clear), pickerSheet);
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-2-paused-components.png`) });
  await visitorPress(page, '#demoPlayPauseBtn', touch);
  await page.waitForFunction((was) => JSON.stringify({ parts: quote.components.map((c) => c.libraryComponentId || '') }) !== JSON.stringify({ parts: JSON.parse(was).parts }), pausedAt, { timeout: 30000 });
  ck(`${label}: Play carries on from the same point`, (await page.evaluate(() => document.getElementById('demoPlayPauseBtn').textContent)) === 'Pause');

  // Chapter 4: live pricing. Sample the screen while the margin is typed - every sample agrees with quoteMaths().
  await waitChapter(page, 4, 120000);
  const samples = [];
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const f = await figures(page);
    samples.push(f);
    if (String(f.shown.margin).startsWith('25')) break;
    await page.waitForTimeout(150);
  }
  const live = new Set(samples.map((s) => Number(s.shown.customerPrice).toFixed(2)));
  ck(`${label}: the customer price changes live on screen as the margin is typed (${live.size} different prices seen)`, live.size >= 2, [...live]);
  const mismatched = samples.filter((s) => !near(Number(s.shown.customerPrice), s.maths.total) || !near(money(s.shown.componentsCost), s.maths.materialCost));
  ck(`${label}: every live sample (${samples.length}) matches quoteMaths()`, mismatched.length === 0, mismatched.slice(0, 2));
  await waitChapter(page, 5, 120000);
  const priced = await figures(page);
  checkFigures(`${label} pricing`, priced);
  const partsCost = Object.values(PART_COSTS).reduce((a, b) => a + b, 0);
  ck(`${label}: the six parts came from the demonstration library at its prices`, priced.parts.length === 6 && priced.parts.every((p) => PART_COSTS[p.name] === p.cost && p.libraryId.startsWith('comp-')) && near(priced.maths.materialCost, partsCost), priced.parts);
  ck(`${label}: labour is the workshop rate times the hours typed`, Number(priced.rate) === LABOUR.rate && Number(priced.hours) === LABOUR.hours && near(priced.maths.labourCost, LABOUR.rate * LABOUR.hours), [priced.rate, priced.hours, priced.maths.labourCost]);
  ck(`${label}: a 25% margin was set by typing it`, near(priced.maths.rodMarginPercent, 25, 0.01), priced.maths.rodMarginPercent);
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-3-pricing.png`) });

  // Chapter 5: the customer quote, watermarked, with the same figures.
  await finished(page);
  const end = await page.evaluate(() => {
    const sheet = document.getElementById('viewQuoteSheet');
    const doc = sheet && sheet.querySelector('.view-quote');
    const after = doc ? getComputedStyle(doc, '::after') : null;
    const before = doc ? getComputedStyle(doc, '::before') : null;
    const rows = doc ? [...doc.querySelectorAll('.view-quote__pricing div, .view-quote__row')].map((r) => [r.querySelector('span')?.textContent, r.querySelector('strong')?.textContent]) : [];
    const outgoing = ['viewQuoteEmailBtn', 'emailQuoteBtn'].map((id) => { const el = document.getElementById(id); return el ? { id, shown: el.getClientRects().length > 0, disabled: el.disabled } : { id, absent: true }; });
    return { open: !!sheet && !sheet.hidden, watermark: after && after.content, banner: before && before.content, rows, text: doc ? doc.innerText : '', outgoing,
      caption: document.getElementById('demoCaption').textContent, label: document.getElementById('demoChapterLabel').textContent, play: document.getElementById('demoPlayPauseBtn').disabled };
  });
  ck(`${label}: the demonstration finishes on the customer quote`, end.open && /Jordan's quote is ready/.test(end.caption) && end.label === 'Finished' && end.play === true, end.caption);
  ck(`${label}: the quote carries the DEMO watermark and banner`, end.watermark === '"DEMO"' && /DEMONSTRATION QUOTE/.test(end.banner || ''), [end.watermark, end.banner]);
  const total = end.rows.find((r) => r[0] === 'Total Price');
  ck(`${label}: the quote's Total Price = quoteMaths() total`, total && near(money(total[1]), priced.maths.total), total);
  const quoteNumberRow = end.rows.find((r) => /Quote/i.test(r[0] || '') && /\d/.test(r[1] || ''));
  ck(`${label}: the quote shows the local demonstration number`, quoteNumberRow && quoteNumberRow[1] === `${priced.prefix}1046`, quoteNumberRow);
  ck(`${label}: the quote names Jordan Ellis and the business`, /Jordan Ellis/.test(end.text) && /Harbourline Custom Rods/.test(end.text), end.text.slice(0, 200));
  ck(`${label}: Open Email Draft and other outgoing controls are hidden and disabled`, end.outgoing.every((o) => o.absent || (!o.shown && o.disabled)), end.outgoing);
  const quoteSheet = await sheetsClear(page);
  ck(`${label}: the quote sheet title and close button are not covered by the dock`, quoteSheet.length > 0 && quoteSheet.every((s) => s.clear), quoteSheet);
  checkFigures(`${label} at the quote`, await figures(page));
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-4-quote.png`) });

  const notices = await page.evaluate(() => window.__notices);
  ck(`${label}: no "Connect to allocate" notice at any point`, notices.length === 0, notices);
  ck(`${label}: no console errors`, errors.length === 0, errors);
  ck(`${label}: nothing requested from anywhere but this site, and only reads`, offsite.length === 0, offsite);
  const records = await page.evaluate(() => (window.Store.get('klabs-workshop-builds:klabs-demo', []) || []).map((b) => b.customerName));
  ck(`${label}: the only records are the director's (customer + build for Jordan Ellis)`, records.length === 2 && records.every((n) => n === 'Jordan Ellis'), records);
  return { context, page, errors, offsite, priced };
}

async function replayAndChapters(base, page, label, touch, expectedTotal) {
  console.log(`\n== Replay and chapters: ${label} ==`);
  await visitorPress(page, '#demoReplayBtn', touch);
  await page.waitForFunction(() => (document.getElementById('demoChapterLabel').textContent || '').startsWith('1/'), null, { timeout: 30000 });
  const replay = await page.evaluate(() => ({ url: location.pathname + location.search, intro: document.getElementById('demoIntro').hidden, demo: !!window.KLABS_DEMO.active,
    builds: (window.Store.get('klabs-workshop-builds:klabs-demo', []) || []).length, current: (window.Store.get('klabs-workshop-quote-current:klabs-demo', null) || {}).customerName || '' }));
  ck(`${label}: Replay restarts at chapter 1 in Demo Mode, without the introduction, from fresh data`, replay.url === '/?demo' && replay.intro === true && replay.demo && replay.builds === 0 && replay.current === '', replay);
  await visitorPress(page, '[data-demo-chapter="4"]', touch);
  await page.waitForFunction(() => /Skipping ahead to chapter 4/.test(document.getElementById('demoCaption').textContent), null, { timeout: 30000 });
  const started = Date.now();
  await waitChapter(page, 4, 60000);
  const skipSeconds = (Date.now() - started) / 1000;
  ck(`${label}: chapter 4 is reached quickly through the real screens (${skipSeconds.toFixed(1)} s)`, skipSeconds < 45);
  await finished(page);
  const after = await figures(page);
  ck(`${label}: after a chapter jump the quote total is the same`, near(after.maths.total, expectedTotal) && after.quoteNumber === `${after.prefix}1046`, [after.maths.total, expectedTotal, after.quoteNumber]);
  const builds = await page.evaluate(() => (window.Store.get('klabs-workshop-builds:klabs-demo', []) || []).map((b) => `${b.recordType === 'customer' ? 'customer' : 'build'}:${b.customerName}`).sort());
  ck(`${label}: nothing carried over between runs (one customer and one build, both Jordan Ellis)`, JSON.stringify(builds) === JSON.stringify(['build:Jordan Ellis', 'customer:Jordan Ellis']), builds);
}

async function main() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browserType = playwright[process.env.DEMO_BROWSER || 'webkit'];
  const browser = await browserType.launch();
  const shots = process.env.DEMO_SHOTS || '';
  try {
    const mac = await fullPlayback(browser, base, 'mac', { viewport: { width: 1280, height: 860 } }, false, shots);
    await replayAndChapters(base, mac.page, 'mac', false, mac.priced.maths.total);
    await mac.context.close();
    const iphone = await fullPlayback(browser, base, 'iphone', { ...playwright.devices['iPhone 13'] }, true, shots);
    await replayAndChapters(base, iphone.page, 'iphone', true, iphone.priced.maths.total);
    await iphone.context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} demo playback checks passed (${process.env.DEMO_BROWSER || 'webkit'})`);
}
main().catch((error) => { console.error(error); process.exit(1); });
