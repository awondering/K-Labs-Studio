// Q38: component price labels say whether Sell includes the configured tax. Tax on: "Sell (incl. GST)" (the configured
// tax name) in the component editor (add and edit), Sizes & Prices (column and Starting Sell) and the Add Component
// picker. Tax off: plain "Buy" / "Sell". Buy is never labelled as including tax (Buy is a cost set against revenue
// excluding tax). Labels only: stored prices and a build's totals are unchanged.
// Real Studio in WebKit: iPhone 390 and 320 (touch), desktop 1280.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... node tests/component-price-labels-browser.cjs [screenshot dir]
const path = require('node:path');
const h = require('./helpers/studio-pglite-harness.cjs');

const shots = process.argv[2] || '';
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}
const root = path.join(__dirname, '..');
const LIB = [
  { id: 'cc', name: 'Probe K Series CC', category: 'Guides', categoryId: 'guides', subcategory: 'Probe Guides', brand: 'Fuji', cost: 4, unitCost: 4, unitPrice: 9, sizeOptions: ['6', '8', '10'], sizePrices: { 8: { cost: 4.4, unitPrice: 9.9 } } },
  { id: 'tip', name: 'Probe Tip Top', category: 'Guides', categoryId: 'guides', subcategory: 'Probe Guides', brand: 'Fuji', cost: 3, unitCost: 3, unitPrice: 7 },
];

// The account's component library in the cloud, in memory (so component sync behaves as it does for a real account).
function withComponentCloud(base) {
  const rows = new Map();
  let taxonomy = null;
  return async (raw) => {
    const s = JSON.parse(raw);
    if (s.table === 'components') {
      const ins = Object.fromEntries((s.ins || []).map(([c, v]) => [c, new Set(v)]));
      const match = (r) => (s.filters || []).every(([c, v]) => r[c] === v) && Object.entries(ins).every(([c, set]) => set.has(r[c]));
      if (s.op === 'select') { const list = [...rows.values()].filter(match); return JSON.stringify({ data: list, count: list.length, error: null }); }
      if (s.op === 'upsert' || s.op === 'insert') { (Array.isArray(s.values) ? s.values : [s.values]).forEach((r) => rows.set(r.client_id, { ...(rows.get(r.client_id) || {}), ...r, updated_at: new Date().toISOString() })); return JSON.stringify({ data: [], error: null }); }
      if (s.op === 'delete') { [...rows.values()].filter(match).forEach((r) => rows.delete(r.client_id)); return JSON.stringify({ data: [], error: null }); }
    }
    if (s.table === 'component_taxonomy') {
      if (s.op === 'select') return JSON.stringify({ data: taxonomy, error: null });
      taxonomy = { ...(Array.isArray(s.values) ? s.values[0] : s.values) };
      return JSON.stringify({ data: [taxonomy], error: null });
    }
    return base(raw);
  };
}

async function openFamily(p) {
  await p.locator('[data-nav="workshopScreen"]').first().click();
  await p.locator('[data-studio-action="components"]').click();
  for (let i = 0; i < 4 && (await p.locator('#studioComponentsTitle').textContent()).trim() !== 'COMPONENTS'; i++) await p.locator('#studioComponentsBackBtn').click();
  await p.locator('#studioComponentsList [data-studio-library-open-category="Guides"]').click();
  await p.locator('#studioComponentsList [data-studio-library-open-subcategory="Probe Guides"]').click();
}
const fieldLabel = (p, id) => p.evaluate((x) => document.getElementById(x)?.closest('label')?.querySelector('span')?.textContent.trim() ?? null, id);
const setTax = (p, on, name) => p.evaluate(({ on, name }) => {
  if (name) { studioSettings.taxType = 'other'; studioSettings.taxName = name; saveStudioSettings(); }
  const el = document.getElementById('settingsTaxEnabled');
  el.checked = on;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, { on, name });

async function labels(p, tag, shotTag) {
  const out = {};
  // Edit an existing component.
  await openFamily(p);
  await p.locator('#studioComponentsList [data-studio-library-open-component="Probe Tip Top"]').click();
  out.editBuy = await fieldLabel(p, 'studioComponentCost');
  out.editSell = await fieldLabel(p, 'studioComponentUnitPrice');
  out.editOverflow = await p.evaluate(() => [...document.querySelectorAll('#studioComponentDetails .quote-component-field--cost')].some((l) => l.scrollWidth > l.clientWidth + 1));
  out.editAligned = await p.evaluate(() => { const [a, b] = ['studioComponentCost', 'studioComponentUnitPrice'].map((id) => document.getElementById(id).getBoundingClientRect()); return Math.abs(a.top - b.top) < 1 && Math.abs(a.height - b.height) < 1; });
  if (shots && shotTag) await p.screenshot({ path: path.join(shots, `editor-${shotTag}.png`) });
  // Sizes & Prices on a component holding its sizes.
  await openFamily(p);
  await p.locator('#studioComponentsList [data-studio-library-open-component="Probe K Series CC"]').click();
  await p.locator('#studioComponentFamilySizesBtn').click();
  await p.locator('#studioFamilySizeSheet').waitFor({ state: 'visible' });
  out.sizesHead = await p.evaluate(() => [...document.querySelectorAll('#studioFamilySizeRows .studio-family-size__row--head span')].map((s) => s.textContent.trim()));
  out.startingBuy = await fieldLabel(p, 'studioFamilySizeBuy');
  out.startingSell = await fieldLabel(p, 'studioFamilySizeSell');
  out.sizesLayout = await p.evaluate(() => {
    const head = document.querySelector('#studioFamilySizeRows .studio-family-size__row--head');
    const [, buyHead, sellHead] = head.querySelectorAll('span');
    const sell = document.querySelector('#studioFamilySizeRows [data-family-size-field="sell"]').getBoundingClientRect();
    const panel = document.querySelector('#studioFamilySizeSheet .component-sheet__panel');
    const note = sellHead.querySelector('.component-tax-note');
    const level = (a, b) => Math.abs(a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom) < 2;
    const startBuy = document.getElementById('studioFamilySizeBuy').getBoundingClientRect();
    const startSell = document.getElementById('studioFamilySizeSell').getBoundingClientRect();
    return { headFits: sellHead.scrollWidth <= sellHead.clientWidth + 1 && buyHead.scrollWidth <= buyHead.clientWidth + 1,
      // With tax named: "(incl. GST)" on its own line under Sell (never split mid-bracket), headings level at the bottom.
      cleanBreak: note ? note.getClientRects().length === 1 && note.getBoundingClientRect().top >= sellHead.getBoundingClientRect().top + 4 : sellHead.getBoundingClientRect().height <= buyHead.getBoundingClientRect().height + 1,
      headsLevel: level(buyHead, sellHead), startingLevel: Math.abs(startBuy.top - startSell.top) < 1 && Math.abs(startBuy.height - startSell.height) < 1,
      sellUnderHead: sellHead.getBoundingClientRect().right <= sell.right + 2, sideways: panel.scrollWidth > panel.clientWidth + 1 };
  });
  out.sizesAria = await p.evaluate(() => [...document.querySelectorAll('#studioFamilySizeRows input')].slice(0, 2).map((i) => i.getAttribute('aria-label')));
  if (shots && shotTag) await p.screenshot({ path: path.join(shots, `sizes-${shotTag}.png`) });
  await p.locator('#studioFamilySizeSheet .studio-component-duplicate__actions [data-family-size-action="cancel"]').click();
  // Add a new component (same editor, add mode).
  await openFamily(p);
  await p.locator('#studioComponentsAddBtn').click();
  await p.waitForTimeout(200);
  out.addBuy = await fieldLabel(p, 'studioComponentCost');
  out.addSell = await fieldLabel(p, 'studioComponentUnitPrice');
  // The Add Component picker in a build.
  await p.evaluate(() => window.KLABS_UI.openActiveBuildsList());
  await p.locator('[data-builds-status-filter="quote"]').click();
  await p.locator('.saved-build-card__open', { hasText: 'Label Probe' }).first().click();
  await p.waitForTimeout(400);
  const head = p.locator('[aria-controls="workshopComponentsBody"]');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await p.locator('#addComponentBtn').click();
  await p.locator('#choicePickerList [data-choice-option="Guides"]').click();
  await p.locator('#choicePickerList [data-choice-option="Probe Guides"]').click();
  const meta = (sel) => p.locator(sel).first().evaluate((el) => ({ text: el.textContent.replace(/\u00a0/g, ' ').trim(), cut: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
    sellTogether: (() => { const r = document.createRange(); const t = el.firstChild; const i = t.textContent.indexOf('Sell'); if (i < 0) return true; r.setStart(t, i); r.setEnd(t, t.textContent.length); return r.getClientRects().length === 1 || [...r.getClientRects()].every((x, _, a) => Math.abs(x.top - a[0].top) < 2); })() }));
  const tip = await meta('#choicePickerList .component-sheet__row--pick[data-pick-name="Probe Tip Top"] .component-sheet__option-meta');
  out.pickerTip = tip.text;
  out.pickerFits = !tip.cut && tip.sellTogether;
  await p.locator('#choicePickerList [data-pick-sizes="cc"]').click();
  const size8 = await meta('#choicePickerList .component-sheet__row--pick[data-pick-name="Probe K Series CC"][data-pick-size="8"] .component-sheet__option-meta');
  out.pickerSize8 = size8.text;
  out.pickerFits = out.pickerFits && !size8.cut && size8.sellTogether;
  if (shots && shotTag) await p.screenshot({ path: path.join(shots, `picker-${shotTag}.png`) });
  await p.evaluate(() => closeComponentSheet());
  await p.locator('#choicePickerSheet').waitFor({ state: 'hidden' });
  return out;
}

async function run(browser, { width, mobile }) {
  const tag = `${mobile ? 'iPhone' : 'desktop'} ${width}`;
  const db = await h.createDatabase(root);
  const handler = withComponentCloud(h.makeHandler(db, []));
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const D = await h.openDevice(browser, base, handler, { width, mobile, name: tag });
    await h.launch(D, base);
    const p = D.page;
    await p.evaluate(async (lib) => {
      saveComponentLibraryRecords(lib); resyncStudioComponentTaxonomyWithRecords(); refreshComponentLibraryViews();
      clearActiveSavedBuildRef();
      quote = normalizeQuote({ customerName: 'Label Probe', buildName: 'Labels', status: 'quote', quoteStatus: 'quote', gstRate: 15, includeGst: true, jobType: 'build',
        components: [{ ...defaultComponentRow(), category: 'Probe Tip Top', libraryComponentId: 'tip', cost: 3, unitPrice: 7, quantity: 2 }] });
      applyManualRodPrice(300);
      hasUnsavedQuoteChanges = true; await persistCurrentQuoteRecord(); markQuoteSaved();
    }, LIB);
    const library = () => p.evaluate(() => JSON.stringify(componentLibraryRecords().map((r) => [r.id, r.cost, r.unitCost, r.unitPrice, r.sizePrices || null])));
    const builds = () => p.evaluate(() => JSON.stringify(savedBuildRecords().map((b) => [b.customerName, b.finalCustomerPrice, (b.components || []).map((c) => [c.cost, c.unitPrice, c.quantity])])));
    const before = { library: await library(), builds: await builds() };
    const shotTag = (s) => (width === 390 || !mobile ? `${s}-${mobile ? 'iphone' : 'desktop'}-${width}` : (width === 320 ? `${s}-iphone-320` : ''));

    // Tax on (the default, GST).
    let L = await labels(p, tag, shotTag('gst'));
    ck(tag, 'tax on: component editor (edit) - "Buy Price" and "Sell Price (incl. GST)"', L.editBuy === 'Buy Price' && L.editSell === 'Sell Price (incl. GST)', L);
    ck(tag, 'tax on: Add Component (new) - the same labels', L.addBuy === 'Buy Price' && L.addSell === 'Sell Price (incl. GST)', L);
    ck(tag, 'tax on: Sizes & Prices - Size | Buy | Sell (incl. GST); Starting Buy / Starting Sell (incl. GST)',
      JSON.stringify(L.sizesHead.slice(0, 3)) === JSON.stringify(['Size', 'Buy', 'Sell (incl. GST)']) && L.startingBuy === 'Starting Buy' && L.startingSell === 'Starting Sell (incl. GST)', L);
    ck(tag, 'tax on: size rows read "Buy Price <size>" and "Sell Price (incl. GST) <size>" to screen readers',
      /^Buy Price Probe K Series CC 6$/.test(L.sizesAria[0]) && /^Sell Price \(incl\. GST\) Probe K Series CC 6$/.test(L.sizesAria[1]), L.sizesAria);
    ck(tag, 'tax on: picker shows "Buy $3.00 · Sell (incl. GST) $7.00", per-size prices too',
      L.pickerTip.includes('Buy $3.00 · Sell (incl. GST) $7.00') && L.pickerSize8.includes('Buy $4.40 · Sell (incl. GST) $9.90'), [L.pickerTip, L.pickerSize8]);
    // The desktop component editor already places Buy and Sell in different grid rows on main (unchanged here).
    const layoutOk = (x) => !x.editOverflow && (!mobile || x.editAligned) && x.sizesLayout.headFits && x.sizesLayout.cleanBreak && x.sizesLayout.headsLevel
      && x.sizesLayout.startingLevel && x.sizesLayout.sellUnderHead && !x.sizesLayout.sideways && x.pickerFits;
    ck(tag, 'layout: labels fit; picker price never cut off and "Sell (incl. GST) $x" kept together; Buy/Sell inputs level; Sizes & Prices "(incl. GST)" on its own line, headings and Starting inputs level; nothing sideways',
      layoutOk(L), { editOverflow: L.editOverflow, editAligned: L.editAligned, sizes: L.sizesLayout, pickerFits: L.pickerFits });

    // A custom tax name.
    await setTax(p, true, 'HST');
    L = await labels(p, tag, '');
    ck(tag, 'custom tax name: "Sell Price (incl. HST)", "Sell (incl. HST)", picker "Sell (incl. HST)"',
      L.editSell === 'Sell Price (incl. HST)' && L.sizesHead[2] === 'Sell (incl. HST)' && L.startingSell === 'Starting Sell (incl. HST)' && L.pickerTip.includes('Sell (incl. HST) $7.00') && layoutOk(L), L);

    // Tax off: plain labels everywhere.
    await setTax(p, false);
    L = await labels(p, tag, shotTag('tax-off'));
    ck(tag, 'tax off: plain "Buy Price" / "Sell Price" in the editor (edit and add)', L.editBuy === 'Buy Price' && L.editSell === 'Sell Price' && L.addSell === 'Sell Price', L);
    ck(tag, 'tax off: plain Size | Buy | Sell, Starting Sell, and "Sell Price <size>"',
      JSON.stringify(L.sizesHead.slice(0, 3)) === JSON.stringify(['Size', 'Buy', 'Sell']) && L.startingSell === 'Starting Sell' && /^Sell Price Probe K Series CC 6$/.test(L.sizesAria[1]) && layoutOk(L), L);
    ck(tag, 'tax off: picker shows plain "Buy $3.00 · Sell $7.00"', L.pickerTip.includes('Buy $3.00 · Sell $7.00') && !/incl\./.test(L.pickerTip + L.pickerSize8), [L.pickerTip, L.pickerSize8]);

    // Labels only: stored component prices and saved builds unchanged.
    ck(tag, 'stored component prices and saved builds (prices, totals) unchanged by the labels', (await library()) === before.library && (await builds()) === before.builds,
      { before, after: { library: await library(), builds: await builds() } });
    const errors = D.errors.filter((e) => !/favicon/i.test(e));
    ck(tag, 'no page errors', errors.length === 0, errors);
    await D.context.close();
  } finally {
    server.close();
  }
}

(async () => {
  const browser = await h.playwright.webkit.launch();
  try {
    await run(browser, { width: 390, mobile: true });
    await run(browser, { width: 320, mobile: true });
    await run(browser, { width: 1280, mobile: false });
  } finally { await browser.close(); }
  console.log(`component price labels: ${passed}/${passed + failed} checks passed`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
