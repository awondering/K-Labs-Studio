// Q18 Phase 2A/2B/3: full playback of the scripted demonstration on the real screens, Start -> final invoice and build summary.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/demo-playback-browser.cjs   (WebKit; DEMO_BROWSER=chromium to override)
// Serves the repository from a local HTTP server with every other request refused. Synthetic demonstration data only.
// Checks, at Mac and iPhone 13 sizes: no autoplay; every figure Studio shows while pricing, on the quote, in the payment
// status, on the invoice and on the build summary matches Studio's own quoteMaths()/depositMaths(); the parts' prices
// come from the demonstration library; courier delivery is added separately and leaves the Rod Price and Your Return unchanged;
// every document carries the DEMO watermark; the quote and invoice use local demonstration numbers with no "Connect to
// allocate" notice; the invoice balance is paid in full; Pause holds everything (and closes the write window) and Play
// carries on; the visitor's own clicks, taps and typing change nothing; sheets are never covered by the dock; the
// iPhone strip is slim; Replay (including the Pause button once finished) and the chapter controls restart without
// leaving Demo Mode. Phase 3: every tap and typed character the demonstration makes lands on a highlighted control that
// is fully in view; the courier choice, delivery total, customer total and unchanged Your Return are highlighted in view; no
// caption or player message is cut off; the Mac dock is slim. Q23: pricing by the Rod Price typed in (GST
// included), with Your Return recalculated live; shipping costs are directly below the fulfilment choices; an older cached demonstration file is refreshed once, or the visitor is returned safely; a
// step that cannot finish ends calmly in "Demonstration paused. Press Replay" and nothing changes after it.
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
const DELIVERY = { freight: 18, packaging: 12 };
// Q23: the Rod Price typed in chapter 4, GST included (was: labour 5 h at $85, a 25% margin, then a $280 profit).
const ROD_PRICE = 899;
const PARTS_COST = Object.values(PART_COSTS).reduce((a, b) => a + b, 0);
const STOPPED = /^Demonstration paused\. Press Replay/;

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
      shown: { componentsCost: v('quoteCostBeforeMargin'), rodPrice: v('quoteTotal'), rodPriceLabel: document.querySelector('#quoteTotalField > span').textContent, gst: v('quoteGst'),
        customerTotal: v('quoteCustomerTotalLine'), customerTotalHidden: document.getElementById('quoteCustomerTotalLine').hidden,
        earnings: v('quoteEstimatedEarnings'), summary: v('quotePricingSummaryValue'), headline: v('workshopBuildPricingSummaryText'), labourRate: v('quoteLabourRate'), labourHours: v('quoteLabourHours') },
      maths: { materialCost: maths.materialCost, labourCost: maths.labourCost, total: maths.total, gst: maths.gst, rodPrice: maths.subtotal - maths.freightCharge,
        earnings: maths.exclusiveRevenue - maths.materialCost - maths.freightCost, balanceOwing: maths.balanceOwing, amountReceived: maths.amountReceived,
        deliveryCost: maths.freightCost, deliveryCharge: maths.freightCharge },
      parts: quote.components.filter((c) => !componentRowIsEffectivelyEmpty(c)).map((c) => ({ name: c.category, libraryId: c.libraryComponentId || '', cost: componentRowLineCost(c) })),
      rate: quote.labourRate, hours: quote.labourHours, quoteNumber: quote.quoteNumber, prefix: businessProfile.quotePrefix,
      fulfilment: quote.fulfilmentMethod, freight: quote.freight, packaging: quote.packaging, lifecycle: currentBuildLifecycleStatus(), payments: JSON.parse(JSON.stringify(quote.payments || [])),
    };
  });
}
function checkFigures(label, f) {
  const { shown, maths } = f;
  ck(`${label}: Components Cost shown = quoteMaths() materials`, near(money(shown.componentsCost), maths.materialCost), [shown.componentsCost, maths.materialCost]);
  ck(`${label}: Rod Price shown = quoteMaths() total less delivery`, near(Number(shown.rodPrice), maths.rodPrice), [shown.rodPrice, maths.rodPrice]);
  ck(`${label}: the price is labelled Rod Price (incl. GST)`, shown.rodPriceLabel === 'Rod Price (incl. GST)', shown.rodPriceLabel);
  ck(`${label}: GST shown = quoteMaths() GST`, near(money(shown.gst), maths.gst, 0.0051), [shown.gst, maths.gst]);
  ck(`${label}: Your Return shown = quoteMaths()`, near(money(shown.earnings), maths.earnings, 0.0051), [shown.earnings, maths.earnings]);
  ck(`${label}: the customer total with delivery is shown only for Courier / Shipping, and = quoteMaths() total`,
    (f.fulfilment === 'shipping' || maths.deliveryCharge > 0) ? (!shown.customerTotalHidden && near(money(shown.customerTotal), maths.total)) : shown.customerTotalHidden, [f.fulfilment, shown.customerTotal, shown.customerTotalHidden, maths.total]);
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
  // Phase 3: every scripted (not the visitor's) tap and typed character on a Studio control, with whether that control
  // was highlighted with a visible outline and fully in view at that moment; and every highlight switched on.
  await context.addInitScript(() => {
    window.__acts = [];
    window.__highlights = [];
    window.__seatRefs = [];
    const inView = (el) => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 || r.height > 0)) return 'no size';
      const dock = document.getElementById('demoModeBar');
      const top = dock && !dock.hidden ? dock.getBoundingClientRect().bottom : 0;
      const within = (b) => r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.left >= b.left - 1 && r.right <= b.right + 1;
      if (!within({ top, bottom: innerHeight, left: 0, right: innerWidth })) return `off screen ${Math.round(r.top)}-${Math.round(r.bottom)} (visible ${Math.round(top)}-${innerHeight})`;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (/auto|scroll|hidden|clip/.test(st.overflowX + ' ' + st.overflowY) && !within(p.getBoundingClientRect())) return `clipped by ${p.id || p.className}`;
      }
      // Covered: at points across the control, something of Studio's other than the control is on top (the shield and
      // the dock are the demonstration's own layers and are ignored).
      for (const [fx, fy] of [[0.5, 0.5], [0.1, 0.2], [0.9, 0.2], [0.1, 0.8], [0.9, 0.8]]) {
        const onTop = document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy).find((n) => n.id !== 'demoShield' && !n.closest('[data-demo-player]'));
        if (!onTop || !el.contains(onTop)) return `covered by ${onTop ? (onTop.id || onTop.className || onTop.tagName) : 'nothing'}`;
      }
      return '';
    };
    const name = (el) => el.id || el.getAttribute('data-fulfilment-method') || el.getAttribute('data-layout-seat-ref') || el.getAttribute('data-choice-option') || el.getAttribute('aria-controls') || el.className || el.tagName;
    const record = (event) => {
      const el = event.target;
      if (event.isTrusted || !(el instanceof Element) || el.closest('[data-demo-player]')) return;
      const lit = el.closest('[data-demo-highlight]');
      const outline = lit ? getComputedStyle(lit) : null;
      window.__acts.push({ kind: event.type, el: name(el), lit: !!lit && outline.outlineStyle !== 'none' && parseFloat(outline.outlineWidth) >= 2, view: inView(el), y: Math.round(scrollY) });
      if (event.type === 'click' && el.matches('#quoteSpecReelSeatRef [data-layout-seat-ref]')) {
        // Studio replaces the buttons after updating the selection. Read that result after the click finishes.
        setTimeout(() => window.__seatRefs.push({
          ref: document.querySelector('#quoteSpecReelSeatRef [aria-pressed="true"]')?.getAttribute('data-layout-seat-ref'),
          position: document.getElementById('quoteSpecReelSeatPosition').value,
        }), 0);
      }
    };
    document.addEventListener('click', record, true);
    document.addEventListener('input', record, true);
    new MutationObserver((changes) => changes.forEach((c) => {
      if (c.target.hasAttribute('data-demo-highlight')) window.__highlights.push({ el: name(c.target), view: inView(c.target) });
    })).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-demo-highlight'] });
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
const waitChapter = (page, n, timeout = 120000) => page.waitForFunction((n) => (document.getElementById('demoChapterLabel').textContent || '').startsWith(`${n}/`) || (n === 11 && /Finished/.test(document.getElementById('demoChapterLabel').textContent)), n, { timeout });
// Phase 3 review change: the stopped state now reads "Demonstration paused. Press Replay..." (was "...stopped...").
const finished = (page, timeout = 300000) => page.waitForFunction(() => /from enquiry to paid in full|^Demonstration paused\. Press Replay/.test(document.getElementById('demoCaption').textContent), null, { timeout });
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
  ck(`${label}: Start shows the player with chapter 1`, (await chapterLabel(page)).startsWith('1/10 Enquiry'));
  const strip = await page.evaluate(() => Math.round(document.getElementById('demoModeBar').getBoundingClientRect().height));
  if (label === 'iphone') ck(`${label}: the strip is slim while playing (${strip} px; 2A was about 210 px)`, strip <= 110, strip);
  if (label === 'mac') ck(`${label}: the dock is slim while playing (${strip} px; 2B was about 143 px)`, strip <= 100, strip);

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
  const expectedCompletion = await page.evaluate(() => {
    const input = document.getElementById('quoteEstimatedCompletionDate');
    const today = new Date();
    const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return { type: input.type, value: input.value, saved: quote.estimatedCompletionDate,
      daysAhead: (Date.parse(input.value) - todayDay) / 86400000,
      display: formatDateDisplay(input.value, { includeTime: false }) };
  });
  ck(`${label}: Estimated Completion is saved from the native date field three weeks ahead`,
    expectedCompletion.type === 'date' && expectedCompletion.daysAhead === 21
    && expectedCompletion.value === expectedCompletion.saved, expectedCompletion);
  const rodSpec = await page.evaluate(() => {
    const styles = (el) => {
      const { width, height, left, right } = el.getBoundingClientRect();
      const { borderRadius, borderWidth, borderStyle, backgroundImage, fontSize } = getComputedStyle(el);
      return { width, height, left, right, borderRadius, borderWidth, borderStyle, backgroundImage, fontSize };
    };
    const buttons = [...document.querySelectorAll('#quoteSpecReelSeatRef button')];
    const grips = [...document.querySelectorAll('.build-details__grips input')];
    const model = rodLayoutModel();
    return {
      refs: window.__seatRefs,
      selected: buttons.filter((el) => el.getAttribute('aria-pressed') === 'true').map((el) => el.getAttribute('data-layout-seat-ref')),
      value: document.getElementById('quoteSpecReelSeatPosition').value,
      grips: grips.map((el) => el.value),
      geometry: Object.fromEntries(model.items.map(({ key, startMm, endMm }) => [key, [startMm, endMm]])),
      valid: !model.overlaps && !model.approximateOverlap && !model.exceeds,
      width: document.documentElement.clientWidth,
      buttons: buttons.map(styles),
      inputs: grips.map(styles),
    };
  });
  assert.deepEqual(rodSpec.refs, ['rear', 'centre', 'front', 'rear'].map((ref) => ({ ref, position: '' })));
  assert.deepEqual(rodSpec.selected, ['rear']);
  ck(`${label}: the reference walkthrough ends at Rear of Seat with 330 mm from the butt`, rodSpec.value === '330 mm from butt', rodSpec);
  assert.deepEqual(rodSpec.grips, ['80 mm', '75 mm', '100 mm']);
  assert.deepEqual(rodSpec.geometry, { rearGrip: [0, 80], reelSeat: [330, 460], lowerGrip: [255, 330], foreGrip: [460, 560] });
  ck(`${label}: split grips fit the model without overlap`, rodSpec.valid, rodSpec.geometry);
  // Q23 final correction: Rear / Centre / Front is a compact segmented control, not three full-width slabs. The selected
  // segment is titanium, never red; iPhone segments are 40px with a 44px hit area; Mac segments are slim and sized to content.
  const seat = rodSpec.buttons;
  const selectedSeat = await page.evaluate(() => {
    const el = document.querySelector('#quoteSpecReelSeatRef [aria-pressed="true"]');
    const s = getComputedStyle(el);
    const rgb = (c) => (c.match(/\d+(\.\d+)?/g) || []).map(Number);
    const [r, g, b] = rgb(s.borderColor);
    return { border: s.borderColor, background: s.backgroundColor, reddish: r > g + 50 && r > b + 50,
      hit: parseFloat(getComputedStyle(el, '::after').height) || 0, group: el.parentElement.getBoundingClientRect().width };
  });
  ck(`${label}: Rear / Centre / Front is a compact segmented control with a titanium (not red) selection`,
    seat.length === 3 && seat.every((c) => c.left >= 0 && c.right <= rodSpec.width && parseFloat(c.fontSize) >= 11 && c.height === seat[0].height)
      && (touch ? seat[0].height >= 40 : seat[0].height >= 30 && seat[0].height <= 36)
      && !selectedSeat.reddish && (touch || selectedSeat.group < rodSpec.width * 0.6), { seat, selectedSeat });

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

  // Chapter 4 (Q23): the Components Cost, then the Rod Price typed in, GST included. Your Return follows live; every
  // sample agrees with quoteMaths().
  await waitChapter(page, 4, 120000);
  const samples = [];
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const f = await figures(page);
    f.view = await page.evaluate(() => {
      const section = document.getElementById('workshopPricingSection');
      return { advanced: section.getAttribute('data-advanced-pricing') === 'true', method: section.getAttribute('data-pricing-method'),
        margin: document.getElementById('quoteMarginPercent').value, target: document.getElementById('quoteProfit').value,
        editable: ['quoteTotal', 'quoteProfit', 'quoteMarginPercent'].filter((id) => !document.getElementById(id).readOnly) };
    });
    samples.push(f);
    if (/couriered/.test(await page.evaluate(() => document.getElementById('demoCaption').textContent))) break;
    await page.waitForTimeout(120);
  }
  // Q23 final correction: the short Advanced Pricing moment - a 55% target margin, then a $450 target return, each
  // recalculating the Rod Price (GST included) from the parts; only the chosen field can be typed into.
  const byMargin = samples.find((s) => s.view.advanced && s.view.method === 'percent' && Number(s.view.margin) === 55);
  const byReturn = samples.find((s) => s.view.advanced && s.view.method === 'return' && Number(s.view.target) === 450);
  ck(`${label}: Advanced - a 55% target margin recalculates the Rod Price (margin on the price excl. GST)`,
    !!byMargin && near(byMargin.maths.rodPrice, PARTS_COST / 0.45 * 1.15, 0.011) && near(byMargin.maths.earnings, PARTS_COST / 0.45 * 0.55, 0.011)
      && JSON.stringify(byMargin.view.editable) === '["quoteMarginPercent"]', byMargin && { view: byMargin.view, maths: byMargin.maths });
  ck(`${label}: Advanced - a $450 target return recalculates the Rod Price; Your Return shows $450`,
    !!byReturn && near(byReturn.maths.rodPrice, (PARTS_COST + 450) * 1.15, 0.011) && near(money(byReturn.shown.earnings), 450)
      && JSON.stringify(byReturn.view.editable) === '["quoteProfit"]', byReturn && { view: byReturn.view, maths: byReturn.maths });
  ck(`${label}: back to Simple before delivery`, !samples[samples.length - 1].view.advanced, samples[samples.length - 1].view);
  const live = new Set(samples.map((s) => money(s.shown.earnings).toFixed(2)));
  ck(`${label}: Your Return changes live on screen as the rod price is typed (${live.size} different returns seen)`, live.size >= 2, [...live]);
  const mismatched = samples.filter((s) => !near(Number(s.shown.rodPrice), s.maths.rodPrice) || !near(money(s.shown.earnings), s.maths.earnings, 0.0051) || !near(money(s.shown.componentsCost), s.maths.materialCost));
  ck(`${label}: every live sample (${samples.length}) matches quoteMaths()`, mismatched.length === 0, mismatched.slice(0, 2));
  // Before delivery: the rod alone, at the Rod Price typed in.
  const rodOnly = await figures(page);
  checkFigures(`${label} rod price`, rodOnly);
  ck(`${label}: a Rod Price of $${ROD_PRICE} incl. GST was set by typing it; Your Return = price excl. GST - parts`, near(rodOnly.maths.rodPrice, ROD_PRICE) && near(rodOnly.maths.earnings, ROD_PRICE / 1.15 - PARTS_COST, 0.0051), [rodOnly.maths.rodPrice, rodOnly.maths.earnings]);
  ck(`${label}: no delivery charge yet`, near(rodOnly.maths.deliveryCharge, 0), rodOnly.maths.deliveryCharge);
  const simple = await page.evaluate(() => ({
    labourHidden: ['quoteLabourRateField', 'quoteLabourHoursField'].every((id) => document.getElementById(id).hidden),
    advancedShown: document.getElementById('quoteAdvancedPricing').getClientRects().length > 0,
    note: !document.getElementById('quoteAdvancedPricingNote').hidden,
    labourLine: !document.getElementById('quoteLegacyLabourLine').hidden,
    returnLabel: document.querySelector('#quoteEarningsSummary > span').textContent,
    returnNote: document.querySelector('#quoteEarningsSummary p').textContent,
  }));
  ck(`${label}: the simple pricing screen - no labour, margin, profit or Advanced Pricing; Your Return before overheads and income tax`,
    simple.labourHidden && !simple.advancedShown && !simple.note && !simple.labourLine && simple.returnLabel === 'Your Return' && simple.returnNote === 'Before overheads and income tax.', simple);
  await waitChapter(page, 5, 120000);
  const priced = await figures(page);
  checkFigures(`${label} pricing`, priced);
  ck(`${label}: the six parts came from the demonstration library at its prices`, priced.parts.length === 6 && priced.parts.every((p) => PART_COSTS[p.name] === p.cost && p.libraryId.startsWith('comp-')) && near(priced.maths.materialCost, PARTS_COST), priced.parts);
  ck(`${label}: no labour is added (Q23)`, near(priced.maths.labourCost, 0) && Number(priced.hours) === 0, [priced.rate, priced.hours, priced.maths.labourCost]);
  // Courier delivery: Freight + Packaging typed in, added to the price separately; Your Return is unchanged.
  ck(`${label}: courier delivery chosen, with Freight 18 and Packaging 12 typed in`, priced.fulfilment === 'shipping' && Number(priced.freight) === DELIVERY.freight && Number(priced.packaging) === DELIVERY.packaging, [priced.fulfilment, priced.freight, priced.packaging]);
  ck(`${label}: the delivery charge is quoteMaths()'s (cost ${priced.maths.deliveryCost}, charged ${priced.maths.deliveryCharge} incl. GST)`, near(priced.maths.deliveryCost, DELIVERY.freight + DELIVERY.packaging) && near(priced.maths.deliveryCharge, Math.round((DELIVERY.freight + DELIVERY.packaging) * 115) / 100), priced.maths);
  ck(`${label}: delivery is added to the price separately (rod ${rodOnly.maths.total} + delivery ${priced.maths.deliveryCharge} = ${priced.maths.total})`, near(priced.maths.total, rodOnly.maths.total + priced.maths.deliveryCharge), [rodOnly.maths.total, priced.maths.deliveryCharge, priced.maths.total]);
  const shippingLayout = await page.evaluate(() => {
    const group = document.getElementById('quoteFulfilmentGroup');
    const choices = group.querySelector('.quote-job-type__options').getBoundingClientRect();
    const fields = document.getElementById('quoteDeliveryFields');
    const amounts = [...fields.querySelectorAll('input')];
    return {
      underChoice: group.contains(fields) && !fields.hidden && choices.bottom <= fields.getBoundingClientRect().top,
      fitsScreen: amounts.every((input) => {
        const { left, right } = input.getBoundingClientRect();
        return left >= 0 && right > left && right <= document.documentElement.clientWidth;
      }),
      total: amounts[2].value,
      readOnly: amounts[2].readOnly,
    };
  });
  ck(`${label}: Freight, Packaging and the calculated Total Shipping fit under the fulfilment choice`,
    shippingLayout.underChoice && shippingLayout.fitsScreen && shippingLayout.readOnly && shippingLayout.total === '$30.00', shippingLayout);
  ck(`${label}: the Rod Price and Your Return are unchanged by delivery`, near(priced.maths.rodPrice, ROD_PRICE) && near(priced.maths.earnings, rodOnly.maths.earnings, 0.0051), [rodOnly.maths.earnings, priced.maths.earnings, priced.maths.rodPrice]);
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-3-pricing.png`) });

  // Chapter 5: the customer quote, watermarked, with the same figures.
  // Phase 3 change: the quote's last caption is now "Marked DEMO here. In Studio it's ready to send." (2B: "...marked DEMO
  // and goes nowhere...").
  await page.waitForFunction(() => /Marked DEMO here\. In Studio it's ready to send\./.test(document.getElementById('demoCaption').textContent), null, { timeout: 120000 });
  const quoteDoc = await documentShown(page, '#viewQuoteSheet');
  ck(`${label}: the customer quote is open`, quoteDoc.open && quoteDoc.title === 'Customer Quote', quoteDoc.title);
  ck(`${label}: the quote carries the DEMO watermark and banner`, quoteDoc.watermark === '"DEMO"' && /DEMONSTRATION QUOTE/.test(quoteDoc.banner || ''), [quoteDoc.watermark, quoteDoc.banner]);
  ck(`${label}: the customer quote shows Estimated Completion`,
    quoteDoc.rows.find(([name]) => name === 'Estimated Completion')?.[1] === expectedCompletion.display, quoteDoc.rows);
  const total = quoteDoc.rows.find((r) => r[0] === 'Total Price');
  ck(`${label}: the quote's Total Price = quoteMaths() total`, total && near(money(total[1]), priced.maths.total), total);
  const deliveryRow = quoteDoc.rows.find((r) => /^Delivery/.test(r[0] || '') && /\d/.test(r[1] || ''));
  ck(`${label}: the quote shows the delivery charge = quoteMaths()`, deliveryRow && near(money(deliveryRow[1]), priced.maths.deliveryCharge), deliveryRow);
  const quoteNumberRow = quoteDoc.rows.find((r) => /Quote/i.test(r[0] || '') && /\d/.test(r[1] || ''));
  ck(`${label}: the quote shows the local demonstration number`, quoteNumberRow && quoteNumberRow[1] === `${priced.prefix}1046`, quoteNumberRow);
  ck(`${label}: the quote names Jordan Ellis and the business`, /Jordan Ellis/.test(quoteDoc.text) && /Harbourline Custom Rods/.test(quoteDoc.text), quoteDoc.text.slice(0, 200));
  ck(`${label}: Open Email Draft and other outgoing controls are hidden and disabled`, quoteDoc.outgoing.every((o) => o.absent || (!o.shown && o.disabled)), quoteDoc.outgoing);
  const quoteSheet = await sheetsClear(page);
  ck(`${label}: the quote sheet title and close button are not covered by the dock`, quoteSheet.length > 0 && quoteSheet.every((s) => s.clear), quoteSheet);
  checkFigures(`${label} at the quote`, await figures(page));
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-4-quote.png`) });

  // Chapter 6, paused: the write window closes, and the visitor's taps on the quote's Close, Confirm Build, the
  // fulfilment choice and their typing change nothing. Play carries on and the director confirms the build.
  await waitChapter(page, 6, 60000);
  const refusedBefore = await page.evaluate(() => window.KLABS_DEMO.refused.length);
  await visitorPress(page, '#demoPlayPauseBtn', touch);
  // The probe: tried every 1.2 s until refused. Probes accepted before the window closes are Studio still settling (each
  // restarts the 800 ms quiet time, hence not more often); the probe's key is the only refused write the checks ignore.
  await page.waitForFunction(() => window.Store.set('klabs-demo-pause-probe', 2) === false, null, { timeout: 12000, polling: 1200 });
  const probeAtClose = await page.evaluate(() => window.Store.get('klabs-demo-pause-probe', null));
  // Self-check of the check below (DEMO_PLANT=1 only): a Studio write while paused, not the probe's - the run must fail.
  if (process.env.DEMO_PLANT) await page.evaluate(() => window.Store.set('klabs-workshop-builds:klabs-demo', []));
  ck(`${label}: while paused the write window is closed (a write is refused)`, true);
  for (const target of ['#viewQuoteCloseBtn', '#confirmBuildBtn', '[data-fulfilment-method="collection"]', '#viewQuoteSheet .component-sheet__close']) await visitorPress(page, target, touch);
  await page.keyboard.type('9');
  await page.waitForTimeout(1500);
  const pausedState = await page.evaluate(() => ({ sheet: !document.getElementById('viewQuoteSheet').hidden, lifecycle: currentBuildLifecycleStatus(), fulfilment: quote.fulfilmentMethod, button: document.getElementById('demoPlayPauseBtn').textContent }));
  ck(`${label}: paused in chapter 6, the visitor's taps on Close, Confirm Build and Customer Collection do nothing`, pausedState.sheet && pausedState.lifecycle === 'quote' && pausedState.fulfilment === 'shipping' && pausedState.button === 'Play', pausedState);
  await visitorPress(page, '#demoPlayPauseBtn', touch);
  await page.waitForFunction(() => currentBuildLifecycleStatus() === 'active', null, { timeout: 60000 });
  const accepted = await figures(page);
  ck(`${label}: Confirm Build makes the same job Active with the same quote number and price`, accepted.lifecycle === 'active' && accepted.quoteNumber === `${accepted.prefix}1046` && near(accepted.maths.total, priced.maths.total), [accepted.lifecycle, accepted.quoteNumber, accepted.maths.total]);

  // Chapter 7: the deposit, through Studio's Record Payment form. The visitor's taps and typing in the form do nothing.
  await page.waitForSelector('#quoteBalanceReceivedForm:not([hidden])', { timeout: 60000 });
  for (const target of ['[data-payment-type="balance"]', '#quoteBalanceReceivedCancel', '#quoteBalanceReceivedSave', '#quoteBalanceReceivedAmount']) await visitorPress(page, target, touch);
  await page.keyboard.type('9999');
  await page.waitForFunction(() => (quote.payments || []).length === 1, null, { timeout: 60000 });
  const deposit = await figures(page);
  ck(`${label}: the deposit of $300 is recorded (the visitor's typing in the form changed nothing)`, deposit.payments.length === 1 && deposit.payments[0].type === 'deposit' && deposit.payments[0].amount === 300, deposit.payments);
  ck(`${label}: the balance owing after the deposit = depositMaths()`, near(deposit.maths.balanceOwing, priced.maths.total - 300) && near(money(await page.evaluate(() => document.getElementById('quotePaymentBalanceOwing').textContent)), deposit.maths.balanceOwing), deposit.maths.balanceOwing);

  // Chapter 8: workshop progress on the real screens - Active Jobs, the job, private workshop notes.
  await waitChapter(page, 8, 60000);
  await page.waitForSelector('#buildsScreen.active', { timeout: 60000 });
  await visitorPress(page, '[data-nav="homeScreen"]', touch);
  await page.waitForTimeout(400);
  ck(`${label}: Jordan's job is in Active Jobs, and the visitor's tap on Home does not leave it`, await page.evaluate(() => document.getElementById('buildsScreen').classList.contains('active') && /Jordan Ellis/.test(document.getElementById('buildsScreen').innerText)));
  const activeDue = await page.locator('.saved-build-card').filter({ hasText: 'Jordan Ellis' }).locator('small').allTextContents();
  ck(`${label}: Active Jobs retains the estimated completion date`,
    activeDue.some((text) => text === `Est. completion ${expectedCompletion.display}`), activeDue);
  await page.waitForFunction(() => /Grip and reel seat fitted/.test(document.getElementById('quoteSpecBuilderNotes')?.value || ''), null, { timeout: 60000 });
  ck(`${label}: private workshop notes typed on the job`, true);

  // Chapter 9: the final payment is Studio's own balance figure; then Mark Complete.
  await waitChapter(page, 9, 60000);
  await visitorPress(page, '#toggleCurrentBuildStatusBtn', touch);
  await page.waitForTimeout(300);
  ck(`${label}: the visitor's tap on Mark Complete does nothing`, (await page.evaluate(() => currentBuildLifecycleStatus())) === 'active');
  await page.waitForFunction(() => currentBuildLifecycleStatus() === 'complete', null, { timeout: 60000 });
  const complete = await figures(page);
  ck(`${label}: the final payment is the balance owing worked out by Studio (${complete.payments[1] && complete.payments[1].amount})`, complete.payments.length === 2 && complete.payments[1].type === 'balance' && near(complete.payments[1].amount, priced.maths.total - 300), complete.payments);
  ck(`${label}: paid in full = depositMaths() (received ${complete.maths.amountReceived}, owing ${complete.maths.balanceOwing})`, near(complete.maths.amountReceived, priced.maths.total) && near(complete.maths.balanceOwing, 0), complete.maths);
  ck(`${label}: Payment Status shows PAID IN FULL`, /PAID IN FULL/.test(await page.evaluate(() => document.getElementById('quotePaymentBalanceOwing').textContent)));

  // Chapter 10: the final invoice, issued through the local stand-in, watermarked and paid in full; then the summary.
  await page.waitForFunction(() => /ready to print or send/.test(document.getElementById('demoCaption').textContent), null, { timeout: 120000 });
  const invoice = await page.evaluate(() => {
    const sheet = document.getElementById('invoicePreviewSheet');
    const doc = document.querySelector('#invoicePreviewBody .invoice-document');
    const pageEl = sheet.querySelector('.invoice-preview__page');
    const amounts = [...doc.querySelectorAll('.invoice-document__amount-row')].map((r) => [r.querySelector('dt')?.textContent.trim(), r.querySelector('dd')?.textContent.trim()]);
    const print = sheet.querySelector('[data-invoice-preview-action="print"]');
    return { open: !sheet.hidden, issued: doc.getAttribute('data-invoice-issued'), number: doc.getAttribute('data-invoice-number'), text: doc.innerText, amounts,
      watermark: getComputedStyle(pageEl, '::after').content, banner: getComputedStyle(pageEl, '::before').content, record: quote.issuedInvoice,
      print: { shown: print.getClientRects().length > 0, disabled: print.disabled }, more: document.getElementById('quoteMoreDocumentsWrap').getClientRects().length };
  });
  ck(`${label}: the final invoice is issued and open`, invoice.open && invoice.issued === 'true' && !!invoice.record, invoice.issued);
  ck(`${label}: the invoice carries the DEMO watermark and banner`, invoice.watermark === '"DEMO"' && /DEMONSTRATION INVOICE/.test(invoice.banner), [invoice.watermark, invoice.banner]);
  ck(`${label}: the invoice uses the local demonstration number INV-1046`, invoice.record.displayNumber === 'INV-1046' && /INV-1046/.test(invoice.text), invoice.record.displayNumber);
  const row = (re) => invoice.amounts.find((r) => re.test(r[0] || ''));
  ck(`${label}: invoice total = quoteMaths() total`, near(invoice.record.total, priced.maths.total) && near(money(row(/^Total including/)[1]), priced.maths.total), row(/^Total including/));
  ck(`${label}: invoice GST = quoteMaths() GST`, near(money(row(/^GST/)[1]), priced.maths.gst, 0.0051), [row(/^GST/), priced.maths.gst]);
  ck(`${label}: invoice received = both payments = the total`, near(money(row(/^Total received/)[1]), priced.maths.total) && invoice.record.payments.length === 2, row(/^Total received/));
  // Studio writes "Paid in full" (shown in capitals) in the balance row once nothing is owing.
  ck(`${label}: invoice balance = Paid in full, 0.00`, !!row(/^Paid in full$/i) && near(money(row(/^Paid in full$/i)[1]), 0) && !row(/^Balance owing$/i), invoice.amounts);
  ck(`${label}: Print / Save as PDF and More documents are hidden`, !invoice.print.shown && invoice.print.disabled && invoice.more === 0, [invoice.print, invoice.more]);
  const completed = await page.evaluate(() => ({
    estimate: quote.estimatedCompletionDate,
    actual: Date.parse(quote.completedAt),
    email: customerEmailLines().filter((line) => /^(Completed|Estimated completion):/.test(line)),
    expectedEmailLine: `Completed: ${formatCustomerEmailLongDate(quote.completedAt)}`,
  }));
  ck(`${label}: Mark Complete records an actual date without overwriting the estimate`,
    completed.estimate === expectedCompletion.value && completed.actual < Date.parse(expectedCompletion.value)
    && completed.email.length === 1 && completed.email[0] === completed.expectedEmailLine, completed);
  const invoiceSheet = await sheetsClear(page);
  ck(`${label}: the invoice sheet title and close button are not covered by the dock`, invoiceSheet.length > 0 && invoiceSheet.every((s) => s.clear), invoiceSheet);
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-5-invoice.png`) });

  await finished(page);
  const summary = await documentShown(page, '#viewQuoteSheet');
  ck(`${label}: the demonstration finishes on the completed Build Summary`, summary.open && summary.title === 'Build Summary', summary.title);
  ck(`${label}: the build summary carries the DEMO watermark and banner`, summary.watermark === '"DEMO"' && /DEMONSTRATION BUILD SUMMARY/.test(summary.banner || ''), [summary.watermark, summary.banner]);
  ck(`${label}: the Build Summary retains the original estimated completion date`,
    summary.rows.find(([name]) => name === 'Estimated Completion')?.[1] === expectedCompletion.display, summary.rows);
  const summaryAmount = (label) => money(summary.rows.find(([name]) => name === label)?.[1]);
  ck(`${label}: Build Summary shows the full price, total received and Paid in full with zero owing`,
    near(summaryAmount('Total Price'), priced.maths.total)
    && near(summaryAmount('Total Received'), priced.maths.total)
    && near(summaryAmount('Paid in full'), 0)
    && !summary.rows.some(([name]) => name === 'Balance Owing' || name === 'Deposit Received'), summary.rows);
  const end = await page.evaluate(() => ({ caption: document.getElementById('demoCaption').textContent, label: document.getElementById('demoChapterLabel').textContent,
    play: { text: document.getElementById('demoPlayPauseBtn').textContent, disabled: document.getElementById('demoPlayPauseBtn').disabled }, replay: document.getElementById('demoReplayBtn').getClientRects().length }));
  ck(`${label}: at the end the Pause button reads Replay (and the separate Replay steps aside)`, end.label === 'Finished' && end.play.text === 'Replay' && !end.play.disabled && end.replay === 0, end);
  if (label === 'iphone') {
    const endStrip = await page.evaluate(() => Math.round(document.getElementById('demoModeBar').getBoundingClientRect().height));
    ck(`${label}: the strip stays slim after the end (${endStrip} px)`, endStrip <= 110, endStrip);
  }
  const summarySheet = await sheetsClear(page);
  ck(`${label}: the summary sheet is not covered by the dock`, summarySheet.length > 0 && summarySheet.every((s) => s.clear), summarySheet);
  if (shots) await page.screenshot({ path: path.join(shots, `${label}-6-summary.png`) });

  // Phase 3: every scripted tap and typed character landed on a highlighted control that was fully in view.
  const acts = await page.evaluate(() => window.__acts);
  const unlit = acts.filter((a) => !a.lit);
  const outOfView = acts.filter((a) => a.view);
  ck(`${label}: every one of the demonstration's ${acts.length} taps and typed characters was on a highlighted control`, acts.length > 300 && unlit.length === 0, unlit.slice(0, 5));
  ck(`${label}: every one of them was on a control fully in view (below the dock, on screen, not clipped)`, outOfView.length === 0, outOfView.slice(0, 5));
  const lit = await page.evaluate(() => window.__highlights);
  // Q23: the Components Cost, Rod Price, customer total and Your Return (was: Required Profit and Margin %).
  for (const id of ['quoteCostBeforeMarginField', 'quoteTotalField', 'quoteTotal', 'quoteEarningsSummary', 'quoteFulfilmentGroup', 'shipping', 'quoteFreight', 'quotePackaging', 'quoteDeliveryTotalField', 'quoteCustomerTotalLine', 'quoteBalanceReceivedAmount']) {
    const seen = lit.filter((h) => h.el === id);
    ck(`${label}: ${id} was highlighted in full view (${seen.length}x)`, seen.length > 0 && seen.every((h) => !h.view), seen);
  }
  // Phase 3: no caption or player message is cut off - each is shown in the real caption line under its chapter label.
  const cut = await page.evaluate(() => {
    const line = document.querySelector('.demo-player__caption');
    const label = document.getElementById('demoChapterLabel');
    const text = document.getElementById('demoCaption');
    const keep = [label.textContent, text.textContent];
    const player = window.KLABS_DEMO_PLAYER;
    const items = player.journey.flatMap((c, i) => c.steps.filter((s) => s[0] === 'caption').map((s) => [`${i + 1}/${player.journey.length} ${c.title}`, s[1]]))
      // A message can show under any chapter's label, so each is tried under the longest.
      .concat(player.messages.map((m) => [player.journey.map((c, i) => `${i + 1}/${player.journey.length} ${c.title}`).sort((x, y) => y.length - x.length)[0], m]));
    const lineHeight = parseFloat(getComputedStyle(line).lineHeight);
    const out = items.map(([l, t]) => {
      label.textContent = l; text.textContent = t;
      const clipped = line.scrollHeight > line.clientHeight + 1;
      const lines = Math.round((line.scrollHeight - parseFloat(getComputedStyle(line).paddingTop) - parseFloat(getComputedStyle(line).paddingBottom)) / lineHeight);
      return { t, clipped, lines };
    });
    [label.textContent, text.textContent] = keep;
    return { count: items.length, cut: out.filter((o) => o.clipped), lines: Math.max(...out.map((o) => o.lines)) };
  });
  ck(`${label}: none of the ${cut.count} captions and messages is cut off (longest ${cut.lines} line${cut.lines === 1 ? '' : 's'})`, cut.count > 40 && cut.cut.length === 0 && cut.lines <= (label === 'mac' ? 1 : 2), cut);

  const notices = await page.evaluate(() => window.__notices);
  ck(`${label}: no "Connect to allocate" notice at any point`, notices.length === 0, notices);
  ck(`${label}: no console errors`, errors.length === 0, errors);
  ck(`${label}: nothing requested from anywhere but this site, and only reads`, offsite.length === 0, offsite);
  const refusedAfter = await page.evaluate((from) => window.KLABS_DEMO.refused.slice(from).filter((r) => r.detail !== 'klabs-demo-pause-probe'), refusedBefore);
  ck(`${label}: Studio never had a change refused while the director was working (steps 6-10)`, refusedAfter.length === 0, refusedAfter);
  const records = await page.evaluate(() => (window.Store.get('klabs-workshop-builds:klabs-demo', []) || []).map((b) => ({ name: b.customerName, type: b.recordType || 'build', status: b.buildStatus || b.lifecycleStatus || b.status || '', invoice: !!b.issuedInvoice, payments: (b.payments || []).length })));
  ck(`${label}: the only records are the director's (customer + build for Jordan Ellis, invoiced, two payments)`, records.length === 2 && records.every((r) => r.name === 'Jordan Ellis') && records.some((r) => r.invoice && r.payments === 2), records);
  ck(`${label}: the probe write refused while paused was never stored (value unchanged since the window closed)`, (await page.evaluate(() => window.Store.get('klabs-demo-pause-probe', null))) === probeAtClose
    && (await page.evaluate(() => window.KLABS_DEMO.refused.some((r) => r.detail === 'klabs-demo-pause-probe'))));
  return { context, page, errors, offsite, priced };
}

// The document open in a sheet: title, watermark/banner, rows and outgoing controls.
function documentShown(page, sheetSelector) {
  return page.evaluate((selector) => {
    const sheet = document.querySelector(selector);
    const doc = sheet && sheet.querySelector('.view-quote');
    const after = doc ? getComputedStyle(doc, '::after') : null;
    const before = doc ? getComputedStyle(doc, '::before') : null;
    const rows = doc ? [...doc.querySelectorAll('.view-quote__pricing div, .view-quote__row, .view-quote__delivery div')].map((r) => [r.querySelector('span')?.textContent, r.querySelector('strong')?.textContent]) : [];
    const outgoing = ['viewQuoteEmailBtn', 'emailQuoteBtn'].map((id) => { const el = document.getElementById(id); return el ? { id, shown: el.getClientRects().length > 0, disabled: el.disabled } : { id, absent: true }; });
    return { open: !!sheet && !sheet.hidden, title: sheet && sheet.querySelector('h2')?.textContent, watermark: after && after.content, banner: before && before.content, rows, text: doc ? doc.innerText : '', outgoing };
  }, sheetSelector);
}

async function replayAndChapters(base, page, label, touch, expectedTotal) {
  console.log(`\n== Replay and chapters: ${label} ==`);
  await visitorPress(page, '#demoPlayPauseBtn', touch); // reads Replay once finished
  await page.waitForFunction(() => (document.getElementById('demoChapterLabel').textContent || '').startsWith('1/'), null, { timeout: 30000 });
  const replay = await page.evaluate(() => ({ url: location.pathname + location.search, intro: document.getElementById('demoIntro').hidden, demo: !!window.KLABS_DEMO.active,
    builds: (window.Store.get('klabs-workshop-builds:klabs-demo', []) || []).length, current: (window.Store.get('klabs-workshop-quote-current:klabs-demo', null) || {}).customerName || '' }));
  ck(`${label}: Replay restarts at chapter 1 in Demo Mode, without the introduction, from fresh data`, replay.url === '/?demo' && replay.intro === true && replay.demo && replay.builds === 0 && replay.current === '', replay);
  // On a phone the chapter row scrolls sideways: bring chapter 4 into view first, as the visitor would by swiping.
  await page.evaluate(() => { const b = document.querySelector('[data-demo-chapter="4"]'); const list = b.closest('ol'); list.scrollLeft = b.offsetLeft - list.offsetLeft - 8; });
  await visitorPress(page, '[data-demo-chapter="4"]', touch);
  await page.waitForFunction(() => /Skipping ahead to chapter 4/.test(document.getElementById('demoCaption').textContent), null, { timeout: 30000 });
  const started = Date.now();
  await waitChapter(page, 4, 60000);
  const skipSeconds = (Date.now() - started) / 1000;
  ck(`${label}: chapter 4 is reached quickly through the real screens (${skipSeconds.toFixed(1)} s)`, skipSeconds < 45);
  await finished(page);
  const after = await figures(page);
  ck(`${label}: after a chapter jump the total, quote number and paid-in-full invoice are the same`, near(after.maths.total, expectedTotal) && after.quoteNumber === `${after.prefix}1046`
    && after.payments.length === 2 && near(after.maths.balanceOwing, 0) && after.lifecycle === 'complete', [after.maths.total, expectedTotal, after.quoteNumber, after.payments.length, after.maths.balanceOwing]);
  const builds = await page.evaluate(() => (window.Store.get('klabs-workshop-builds:klabs-demo', []) || []).map((b) => `${b.recordType === 'customer' ? 'customer' : 'build'}:${b.customerName}`).sort());
  ck(`${label}: nothing carried over between runs (one customer and one build, both Jordan Ellis)`, JSON.stringify(builds) === JSON.stringify(['build:Jordan Ellis', 'customer:Jordan Ellis']), builds);
}

// Phase 3 review: an older cached copy of a demonstration file, and a step that cannot finish.
async function staleAndStopped(browser, base, label, contextOptions) {
  console.log(`\n== Older cached files and a stuck step: ${label} ==`);
  const directorSource = fs.readFileSync(path.join(root, 'js', 'demo-director.js'), 'utf8');
  const older = directorSource.replace(/const DEMO_BUILD = "[^"]+";/, 'const DEMO_BUILD = "build148-v100";');
  assert.notEqual(older, directorSource);
  const run = async (staleTimes) => {
    const { context, page, errors, offsite } = await boot(browser, base, contextOptions, '?demo&no-start');
    await page.close();
    let served = 0;
    await context.route('**/js/demo-director.js', (route) => {
      served += 1;
      if (served <= staleTimes) return route.fulfill({ status: 200, contentType: 'application/javascript', body: older });
      return route.continue();
    });
    const fresh = await context.newPage();
    fresh.on('pageerror', (e) => errors.push(e.message));
    await fresh.goto(`${base}/?demo`);
    return { context, page: fresh, errors, offsite, served: () => served };
  };
  // Once older: one fresh reload, then the demonstration opens with matching files.
  const once = await run(1);
  await once.page.waitForSelector('#demoIntro:not([hidden])', { timeout: 60000 });
  const opened = await once.page.evaluate(() => ({ url: location.pathname + location.search, build: window.KLABS_DEMO_PLAYER.build, data: window.KLABS_DEMO_DATA.build, guard: window.KLABS_DEMO.build }));
  ck(`${label}: an older cached demonstration file is replaced by one fresh reload, then the demonstration opens with matching files`, opened.url === '/?demo&fresh=1' && opened.build === opened.data && opened.data === opened.guard && once.served() === 2, opened);
  await once.context.close();
  // Still older after that: back to the public entry with the notice, no loop, nothing of the demonstration shown.
  const always = await run(99);
  await always.page.waitForFunction(() => location.search === '' && !document.getElementById('publicDemoUnavailable').hidden, null, { timeout: 60000 });
  await always.page.waitForTimeout(1500);
  const back = await always.page.evaluate(() => ({ url: location.pathname + location.search + location.hash, demo: window.KLABS_DEMO.active, notice: document.getElementById('publicDemoUnavailable').textContent, dock: !document.getElementById('demoModeBar').hidden }));
  ck(`${label}: still older after the fresh reload - the visitor is back on the public entry with the notice (one reload only)`, back.url === '/' && !back.demo && !back.dock && /could not open safely/.test(back.notice) && always.served() === 2, { back, served: always.served() });
  await always.context.close();
  // A step that cannot finish: the deposit's Record Payment button is missing in chapter 7.
  const stuck = await boot(browser, base, contextOptions, '?demo&chapter=7');
  await stuck.page.addStyleTag({ content: '#quoteRecordPaymentBtn { display:none !important; }' });
  await stuck.page.waitForFunction(() => /^Demonstration paused\. Press Replay/.test(document.getElementById('demoCaption').textContent), null, { timeout: 90000 });
  const stopped = await stuck.page.evaluate(() => ({ caption: document.getElementById('demoCaption').textContent, button: document.getElementById('demoPlayPauseBtn').textContent, playing: document.getElementById('demoModeBar').getAttribute('data-playing'), payments: (quote.payments || []).length }));
  await stuck.page.waitForTimeout(3000);
  const later = await stuck.page.evaluate(() => ({ payments: (quote.payments || []).length, write: window.Store.set('klabs-demo-after-stop', 1), caption: document.getElementById('demoCaption').textContent }));
  ck(`${label}: a step that cannot finish ends calmly in "Demonstration paused. Press Replay", with Replay ready`, STOPPED.test(stopped.caption) && stopped.button === 'Replay' && stopped.playing === 'false', stopped);
  ck(`${label}: after the stop nothing changes and the write window is closed`, later.payments === stopped.payments && later.write === false && STOPPED.test(later.caption), later);
  await stuck.context.close();
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
    await staleAndStopped(browser, base, 'mac', { viewport: { width: 1280, height: 860 } });
    await staleAndStopped(browser, base, 'iphone', { ...playwright.devices['iPhone 13'] });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${passed} demo playback checks passed (${process.env.DEMO_BROWSER || 'webkit'})`);
}
main().catch((error) => { console.error(error); process.exit(1); });
