// Q24: full playback of the Components Library demonstration on the real Studio screens (WebKit).
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/components-demo-playback-browser.cjs   (DEMO_BROWSER=chromium to override)
// Serves the repository from a local HTTP server with every other request refused. Synthetic demonstration data only.
// Checks, at iPhone 13 (390) and iPhone SE (320) sizes and on a Mac: the introduction offers Build a Rod | Components
// Library; all eight chapters play to the end on Studio's own screens in about two and a half minutes; the library then
// holds the new tip top (Brand Fuji), the new Fuji family with seven generated sizes at their own Buy and Sell prices, the
// edited size and the duplicated family; the Components job holds one line per chosen size at its quantity, and its
// Components Cost and Job Price are Studio's own figures (Sell prices include GST); nothing leaves the page or reaches
// browser storage; captions are never cut off and the page never scrolls sideways; Pause holds everything and Play
// carries on; the visitor's own taps change nothing; the chapter row, Replay and Play-after-finish restart this journey
// from fresh data (Reset); Exit leaves Demo Mode.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };

const FAMILY = 'Fuji KR Spinning Guides';
const COPY = 'Fuji KR Gold Guides';
// Generated in chapter 3 at Buy 8 / Sell 14; chapter 4 prices the three largest sizes individually; chapter 5 sets size 6's
// Sell price to 13.50 and its Brand to Fuji.
const SIZES = { 30: [15, 26], 20: [12, 21], 16: [10, 18], 12: [8, 14], 10: [8, 14], 8: [8, 14], 6: [8, 13.5] };
// Chapters 6-7: the quantities chosen in the picker, then one Add to Build.
const PICKED = { 'Fuji KR Guide 6': 2, 'Fuji KR Guide 8': 2, 'Fuji KR Guide 12': 1, 'Fuji KR Guide 16': 1, 'Fuji KR Guide 20': 1, 'Fuji KR Guide 30': 1, 'Fuji KR Tip Top 5.5': 1 };
const TIP_TOP = [9, 16];
const FINISHED = /new part to priced job/;
const STOPPED = /^Demonstration paused\. Press Replay/;

function serve() {
  const outside = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const url = new URL(req.url, 'http://x');
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, outside })));
}
const money = (text) => { const m = /-?\$?\s*(-?[\d,]+(?:\.\d+)?)/.exec(String(text)); return m ? Number(m[1].replace(/,/g, '')) : NaN; };
const near = (a, b, tol = 0.006) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const state = (page) => page.evaluate(() => ({
  label: document.getElementById('demoChapterLabel')?.textContent || '',
  caption: document.getElementById('demoCaption')?.textContent || '',
  button: document.getElementById('demoPlayPauseBtn')?.textContent || '',
  writes: window.KLABS_DEMO.writeCount(),
}));

// Watches the page while it plays: every caption change is checked for being cut off, and the page for sideways scroll.
async function playToEnd(page, label, limitMs = 300000) {
  const t0 = Date.now();
  const problems = [];
  let last = '';
  for (;;) {
    const s = await state(page);
    if (s.caption !== last) {
      last = s.caption;
      const fit = await page.evaluate(() => {
        const caption = document.querySelector('.demo-player__caption');
        const r = caption.getBoundingClientRect();
        return { cut: caption.scrollHeight > caption.clientHeight + 1 || caption.scrollWidth > caption.clientWidth + 1, sideways: document.documentElement.scrollWidth > window.innerWidth + 1, height: r.height };
      });
      if (fit.cut || fit.sideways) problems.push([s.caption, fit]);
    }
    if (s.button === 'Replay' && (FINISHED.test(s.caption) || STOPPED.test(s.caption))) return { seconds: (Date.now() - t0) / 1000, caption: s.caption, problems };
    if (Date.now() - t0 > limitMs) throw new Error(`${label}: did not finish (${s.label} ${s.caption})`);
    await page.waitForTimeout(150);
  }
}

async function results(page) {
  return page.evaluate(() => {
    const maths = quoteMaths();
    return {
      lib: componentLibraryRecords().filter((r) => /Fuji/.test(r.name)).map((r) => ({ family: r.subcategory, category: r.category, name: r.name, brand: r.brand, cost: Number(r.cost), sell: Number(r.unitPrice) })),
      families: ensureStudioComponentTaxonomyLoaded().categories.flatMap((c) => c.subcategories.map((s) => `${c.name}/${s.name}`)),
      lines: quote.components.filter((c) => !componentRowIsEffectivelyEmpty(c)).map((c) => ({ name: c.category, qty: componentRowQuantity(c), cost: Number(c.cost), sell: Number(c.unitPrice), id: c.libraryComponentId || '' })),
      libraryIds: Object.fromEntries(componentLibraryRecords().map((r) => [r.id, `${r.subcategory}/${r.name}`])),
      jobKind: isComponentsJob(quote) ? 'components' : String(quote.jobType || ''),
      customer: quote.customerName,
      shownCost: document.getElementById('quoteCostBeforeMargin')?.textContent,
      shownJob: document.getElementById('quoteTotal')?.value,
      jobLabel: document.getElementById('quoteRodPriceLabel')?.textContent,
      materialCost: maths.materialCost,
      jobExcl: rodPricingFigures(maths).rodExclusive,
      storage: (() => { try { return window.localStorage.length; } catch (e) { return 'blocked'; } })(),
      isolated: window.KLABS_DEMO.isolated,
      sync: !!window.KLABS_SYNC || !!window.KLABS_SUPABASE_CLIENT,
    };
  });
}

async function run() {
  const { server, outside } = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const engine = playwright[process.env.DEMO_BROWSER || 'webkit'];
  const browser = await engine.launch();
  const open = async (viewport) => {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.route(/.*/, (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); outside.push(u); return r.abort(); });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (/demonstration stopped/i.test(m.text())) errors.push(m.text()); });
    return { context, page, errors };
  };
  try {
    for (const [name, viewport] of [['iPhone 13', { width: 390, height: 844 }], ['iPhone SE', { width: 320, height: 568 }]]) {
      const { context, page, errors } = await open(viewport);
      await page.goto(`${base}?demo`);
      await page.waitForSelector('#demoIntro:not([hidden])');
      const intro = await page.evaluate(() => ({
        rod: document.getElementById('demoStartBtn').textContent, components: document.getElementById('demoStartComponentsBtn').textContent,
        bothVisible: ['demoStartBtn', 'demoStartComponentsBtn'].every((id) => document.getElementById(id).getClientRects().length > 0),
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
      }));
      ck(`${name}: the introduction offers Build a Rod | Components Library`, intro.rod === 'BUILD A ROD' && intro.components === 'COMPONENTS LIBRARY' && intro.bothVisible && !intro.sideways, intro);
      const before = await page.evaluate(() => componentLibraryRecords().filter((r) => /Fuji/.test(r.name)).length);
      ck(`${name}: fresh demonstration data has no Fuji guides yet`, before === 0, before);
      // The visitor chooses the Components Library.
      const started = Date.now();
      await page.click('#demoStartComponentsBtn');
      const rows = await page.evaluate(() => ({
        components: !document.querySelector('[data-demo-tour-chapters="components"]').hidden,
        rod: !document.querySelector('[data-demo-chapter]').closest('ol').hidden,
      }));
      ck(`${name}: the eight-chapter Components row replaces the rod build's`, rows.components && !rows.rod, rows);

      // Pause during Generate Sizes: nothing moves and nothing is written; then Play.
      await page.waitForFunction(() => /^3\/8/.test(document.getElementById('demoChapterLabel').textContent), null, { timeout: 120000 });
      const pausedAt = Date.now();
      await page.click('#demoPlayPauseBtn');
      await page.waitForTimeout(2500);
      const held = await state(page);
      const heldSize = await page.evaluate(() => document.getElementById('studioFamilySizeList')?.value);
      await page.waitForTimeout(2500);
      const still = await state(page);
      const stillSize = await page.evaluate(() => document.getElementById('studioFamilySizeList')?.value);
      ck(`${name}: Pause holds the demonstration and its data`, held.button === 'Play' && /^Paused/.test(still.caption) && held.writes === still.writes && heldSize === stillSize, [held, still, heldSize, stillSize]);
      // The visitor's own tap on Studio changes nothing.
      await page.mouse.click(viewport.width / 2, viewport.height - 140);
      await page.waitForTimeout(500);
      ck(`${name}: the visitor's own tap changes nothing`, (await state(page)).writes === still.writes);
      await page.click('#demoPlayPauseBtn');
      const pausedFor = Date.now() - pausedAt;
      const played = await playToEnd(page, name);
      const playingSeconds = (Date.now() - started - pausedFor) / 1000;
      ck(`${name}: all eight chapters play to the end`, FINISHED.test(played.caption) && errors.length === 0, [played.caption, errors]);
      ck(`${name}: no caption is cut off and the page never scrolls sideways`, played.problems.length === 0, played.problems);
      const r = await results(page);
      // Library: the new tip top, the generated family with its own prices per size, the edit and the duplicated family.
      const tip = r.lib.find((x) => x.name === 'Fuji KR Tip Top 5.5');
      ck(`${name}: chapter 1 created the tip top with Brand Fuji and its prices`, tip && tip.brand === 'Fuji' && tip.family === 'Tip Top Guides' && tip.cost === TIP_TOP[0] && tip.sell === TIP_TOP[1], tip);
      ck(`${name}: chapter 2 created the Fuji family under Guides`, r.families.includes(`Guides/${FAMILY}`), r.families.filter((f) => /Guides/.test(f)));
      const family = r.lib.filter((x) => x.family === FAMILY);
      ck(`${name}: chapter 3 generated seven sizes, each its own component`, family.length === 7, family.map((x) => x.name));
      const priced = Object.entries(SIZES).every(([size, [cost, sell]]) => family.some((x) => x.name === `Fuji KR Guide ${size}` && x.cost === cost && x.sell === sell));
      ck(`${name}: chapter 4 kept each size's own Buy and Sell price`, priced, family);
      ck(`${name}: chapter 5 saved the edited size (Brand Fuji, Sell 13.50)`, family.some((x) => x.name === 'Fuji KR Guide 6' && x.brand === 'Fuji' && x.sell === 13.5));
      const copy = r.lib.filter((x) => x.family === COPY);
      ck(`${name}: chapter 5 duplicated the family`, copy.length === 7 && r.families.includes(`Guides/${COPY}`), copy.length);
      // Job: one line per chosen size at its quantity, from the new family (not its copy).
      const lines = Object.fromEntries(r.lines.map((l) => [l.name, l.qty]));
      ck(`${name}: chapters 6-7 added each chosen size once at its quantity`, JSON.stringify(Object.keys(lines).sort()) === JSON.stringify(Object.keys(PICKED).sort()) && Object.entries(PICKED).every(([n, q]) => lines[n] === q), r.lines);
      ck(`${name}: the guides came from the new family, not its copy`, r.lines.filter((l) => /Guide \d/.test(l.name)).every((l) => r.libraryIds[l.id] === `${FAMILY}/${l.name}`), r.lines.map((l) => r.libraryIds[l.id]));
      ck(`${name}: a Components job for the new customer`, r.customer === 'Sam Carter' && /components/i.test(String(r.jobKind)), [r.customer, r.jobKind]);
      // Figures: Studio's own, and they match the library prices.
      const cost = Object.entries(PICKED).reduce((sum, [n, q]) => sum + q * (n === 'Fuji KR Tip Top 5.5' ? TIP_TOP[0] : SIZES[n.split(' ').pop()][0]), 0);
      const sell = Object.entries(PICKED).reduce((sum, [n, q]) => sum + q * (n === 'Fuji KR Tip Top 5.5' ? TIP_TOP[1] : SIZES[n.split(' ').pop()][1]), 0);
      ck(`${name}: chapter 8 Components Cost shown = Studio's materials = Buy prices x quantities`, near(money(r.shownCost), r.materialCost) && near(r.materialCost, cost), [r.shownCost, r.materialCost, cost]);
      ck(`${name}: chapter 8 Job Price shown = Studio's figure = Sell prices (GST incl.) / 1.15`, r.jobLabel === 'Job Price' && near(Number(r.shownJob), r.jobExcl) && near(Number(r.shownJob), Math.round((sell / 1.15) * 100) / 100), [r.shownJob, r.jobExcl, sell / 1.15]);
      ck(`${name}: about two and a half minutes of playing time`, playingSeconds > 110 && playingSeconds < 190, playingSeconds);
      // Isolation: nothing reached browser storage, the network or a sync service.
      ck(`${name}: isolated - no storage, no sync, no outside requests`, r.isolated === true && !r.sync && (r.storage === 0 || r.storage === 'blocked') && outside.length === 0, [r.isolated, r.sync, r.storage, outside.slice(0, 3)]);

      if (name === 'iPhone 13') {
        // Chapter row: chapter 4 restarts this journey from fresh data; earlier chapters are worked through quickly.
        await page.click('[data-demo-components-chapter="4"]');
        await page.waitForFunction(() => /^4\/8 Prices/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 120000 });
        const jumped = await page.evaluate(() => ({ url: window.location.search, sheet: !!document.querySelector('#studioFamilySizeRows input'), lines: quote.components.filter((c) => !componentRowIsEffectivelyEmpty(c)).length }));
        ck(`${name}: a chapter button plays that chapter of the Components Library`, jumped.url === '?demo' && jumped.sheet && jumped.lines === 0, jumped);
        // Replay: back to chapter 1 with fresh data (Reset) - the Fuji guides made before are gone.
        await page.click('#demoReplayBtn');
        await page.waitForFunction(() => /^1\/8 Component/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 60000 });
        const reset = await page.evaluate(() => componentLibraryRecords().filter((r) => /Fuji/.test(r.name)).length);
        ck(`${name}: Replay restarts the Components Library from fresh data`, reset === 0, reset);
        // Exit leaves Demo Mode.
        await page.click('#demoPlayerExitBtn');
        await page.waitForFunction(() => !/demo/.test(window.location.search), null, { timeout: 30000 });
        ck(`${name}: Exit leaves Demo Mode`, !(await page.evaluate(() => document.documentElement.classList.contains('klabs-demo'))));
      } else {
        // Play-after-finish replays this journey.
        await page.click('#demoPlayPauseBtn');
        await page.waitForFunction(() => /^1\/8 Component/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 60000 });
        ck(`${name}: Replay (the Play button once finished) restarts the Components Library`, true);
      }
      await context.close();
    }
    // Mac: the introduction's two choices and the slim dock with eight chapters.
    const { context, page } = await open({ width: 1280, height: 860 });
    await page.goto(`${base}?demo&tour=components&chapter=8`);
    await page.waitForFunction(() => /^8\/8 Job price/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 180000 });
    const mac = await page.evaluate(() => ({ dock: document.getElementById('demoModeBar').getBoundingClientRect().height, chapters: [...document.querySelectorAll('[data-demo-components-chapter]')].filter((b) => b.getClientRects().length).length }));
    ck('Mac: the dock shows the eight Components chapters and stays slim', mac.chapters === 8 && mac.dock < 140, mac);
    const end = await playToEnd(page, 'Mac');
    ck('Mac: chapter 8 plays to the end', FINISHED.test(end.caption), end.caption);
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`components-demo-playback-browser: ${passed} checks passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
