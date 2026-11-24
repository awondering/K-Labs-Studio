// Q35 Components Size & Pricing Editor, in WebKit on the real Studio (its own screens, saving and component sync; builds
// in production SQL on PGlite, the component library's cloud table modelled in memory). Synthetic data only.
// Open a family -> every size with its Buy/Sell at once -> edit, add (range and comma list), remove, Save Changes once;
// reopen, reload, second device; existing builds keep their recorded prices; the v280 picker adds the new sizes; a new
// family is built in the same editor; the component editor opens the same editor. At 390 and 320 px, and desktop.
// Usage: PLAYWRIGHT_MODULE=... PGLITE_MODULE=... node tests/component-size-pricing-browser.cjs [shots dir]
const path = require('node:path');
const h = require('./helpers/studio-pglite-harness.cjs');
const root = path.join(__dirname, '..');
const shots = process.argv[2] || '';
const results = [];
const ck = (tag, name, ok, detail) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', `[${tag}]`, name, ok ? '' : '\n      ' + JSON.stringify(detail)); };

const CAT = 'Winding Checks';
const FAM = 'Grip Winding Checks';
const BASE = 'Aluminium Winding Check';
// Five existing sizes, each with its own prices, brand, supplier and stock.
const SIZES = { 8: [2.5, 6], 10: [2.75, 6.5], 12: [3, 7], 14: [3.25, 7.5], 16: [3.5, 8] };
const LIB = () => [
  ...Object.entries(SIZES).map(([mm, [buy, sell]]) => ({ id: `wc-${mm}`, name: `${BASE} ${mm} mm`, category: CAT, subcategory: FAM, brand: 'Fuji', supplier: 'PacBay',
    description: `Check ${mm}`, cost: buy, unitCost: buy, unitPrice: sell, stockOnHand: Number(mm) })),
  { id: 'decal-1', name: 'Custom Decal', category: 'Decals', subcategory: 'Rod Decals', cost: 4, unitCost: 4, unitPrice: 12, sizeOptions: ['Small', 'Medium', 'Large'] },
  { id: 'grip-1', name: 'EVA Grip 75 mm', category: 'Grips', subcategory: 'EVA Grips', cost: 9, unitCost: 9, unitPrice: 18 },
  // Q35 regression: one subcategory holding many distinct products, as on a real library.
  ...[['cc6', 'Fuji K Series Single Foot CC 6', 4, 9], ['cc8', 'Fuji K Series Single Foot CC 8', 4.2, 9.5], ['cc10', 'Fuji K Series Single Foot CC 10', 4.6, 10],
    ['ccset', 'Fuji K Series Single Foot CC Guide Set', 60, 120], ['kl6', 'Fuji K Series Single Foot KL 6', 5, 11], ['kt8', 'Fuji K Series Double Foot KT 8', 6, 13],
    ['tip', 'Fuji Tip Top', 3, 7], ['set', 'Fuji Complete Guide Set Spinning', 80, 160]]
    .map(([id, name, buy, sell]) => ({ id, name, category: 'Guides', subcategory: 'Fuji Guides', brand: 'Fuji', supplier: 'PacBay', cost: buy, unitCost: buy, unitPrice: sell, stockOnHand: 2,
      ...(id === 'set' ? { sizeOptions: ['7 piece', '9 piece'] } : {}) })),
];

// The account's component library in the cloud (Supabase "components" and "component_taxonomy"), in memory.
function withComponentCloud(handler, cloud) {
  return async (raw) => {
    const s = JSON.parse(raw);
    if (s.table === 'components') {
      const ins = Object.fromEntries((s.ins || []).map(([c, v]) => [c, new Set(v)]));
      const match = (row) => (s.filters || []).every(([c, v]) => row[c] === v) && Object.entries(ins).every(([c, set]) => set.has(row[c]));
      if (s.op === 'select') {
        const rows = [...cloud.rows.values()].filter(match);
        return JSON.stringify({ data: rows, count: rows.length, error: null });
      }
      if (s.op === 'upsert' || s.op === 'insert') {
        const list = Array.isArray(s.values) ? s.values : [s.values];
        list.forEach((row) => cloud.rows.set(row.client_id, { ...row, updated_at: new Date().toISOString() }));
        cloud.writes += 1;
        return JSON.stringify({ data: list, error: null });
      }
      if (s.op === 'delete') {
        const gone = [...cloud.rows.values()].filter(match);
        gone.forEach((row) => cloud.rows.delete(row.client_id));
        cloud.deletes.push(...gone.map((row) => row.client_id));
        return JSON.stringify({ data: gone, error: null });
      }
    }
    if (s.table === 'component_taxonomy') {
      if (s.op === 'select') return JSON.stringify({ data: cloud.taxonomy, error: null });
      cloud.taxonomy = { ...(Array.isArray(s.values) ? s.values[0] : s.values) };
      return JSON.stringify({ data: [cloud.taxonomy], error: null });
    }
    return handler(raw);
  };
}

const editor = (p) => ({
  sheet: p.locator('#studioFamilySizeSheet'),
  rows: () => p.evaluate(() => [...document.querySelectorAll('#studioFamilySizeRows .studio-family-size__row:not(.studio-family-size__row--head)')].map((row) => ({
    label: row.querySelector('strong').textContent.trim(), title: row.querySelector('strong').title,
    buy: row.querySelector('[data-family-size-field="buy"]').value, sell: row.querySelector('[data-family-size-field="sell"]').value,
    isNew: row.classList.contains('studio-family-size__row--new'), removed: row.classList.contains('studio-family-size__row--removed') }))),
  index: async (label) => (await editor(p).rows()).findIndex((r) => r.label === label),
  field: async (label, field) => p.locator(`#studioFamilySizeRows [data-family-size-index="${await editor(p).index(label)}"][data-family-size-field="${field}"]`),
  remove: async (label) => p.locator(`#studioFamilySizeRows [data-family-size-remove="${await editor(p).index(label)}"]`).click(),
  save: p.locator('#studioFamilySizeConfirm'),
  status: () => p.locator('#studioFamilySizeStatus').textContent(),
});
const library = (p) => p.evaluate((FAM) => componentLibraryRecords().filter((r) => r.subcategory === FAM)
  .map((r) => ({ id: r.id, name: r.name, buy: r.cost, unitCost: r.unitCost, sell: r.unitPrice, brand: r.brand, supplier: r.supplier, description: r.description, stock: r.stockOnHand, category: r.category }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), FAM);
async function openFamily(p, category, family) {
  await p.locator('[data-nav="workshopScreen"]').first().click();
  await p.evaluate(() => { const back = document.getElementById('studioComponentsPanel'); if (back && !back.hidden) return; });
  await p.locator('[data-studio-action="components"]').click();
  for (let i = 0; i < 4 && (await p.locator('#studioComponentsTitle').textContent()).trim() !== 'COMPONENTS'; i++) await p.locator('#studioComponentsBackBtn').click();
  await p.locator(`#studioComponentsList [data-studio-library-open-category="${category}"]`).click();
  await p.locator(`#studioComponentsList [data-studio-library-open-subcategory="${family}"]`).click();
}
// Layout: no sideways overflow, equal-height rows, the Buy and Sell columns aligned on every row, touch targets.
const layout = (p) => p.evaluate(() => {
  const panel = document.querySelector('#studioFamilySizeSheet .component-sheet__panel').getBoundingClientRect();
  const rows = [...document.querySelectorAll('#studioFamilySizeRows .studio-family-size__row:not(.studio-family-size__row--head)')];
  const at = (el) => el.getBoundingClientRect();
  const buys = rows.map((r) => at(r.querySelector('[data-family-size-field="buy"]')));
  const sells = rows.map((r) => at(r.querySelector('[data-family-size-field="sell"]')));
  const removes = rows.map((r) => at(r.querySelector('[data-family-size-remove]')));
  const heights = rows.map((r) => Math.round(at(r).height));
  const body = document.querySelector('#studioFamilySizeSheet .component-sheet__body');
  return {
    sideways: document.documentElement.scrollWidth > window.innerWidth + 1 || body.scrollWidth > body.clientWidth + 1,
    inside: rows.every((r) => at(r).right <= panel.right + 0.5 && at(r).left >= panel.left - 0.5),
    equalHeights: new Set(heights).size === 1, heights,
    buyAligned: new Set(buys.map((b) => Math.round(b.left))).size === 1 && new Set(buys.map((b) => Math.round(b.width))).size === 1,
    sellAligned: new Set(sells.map((b) => Math.round(b.left))).size === 1 && new Set(sells.map((b) => Math.round(b.width))).size === 1,
    targets: Math.min(...buys.map((b) => b.height), ...removes.map((b) => Math.min(b.height, b.width))),
    labelsFit: rows.every((r) => { const s = r.querySelector('strong'); return s.scrollWidth <= s.clientWidth + 1; }),
  };
});

(async () => {
  const db = await h.createDatabase(root);
  const cloud = { rows: new Map(), taxonomy: null, writes: 0, deletes: [] };
  const handler = withComponentCloud(h.makeHandler(db, []), cloud);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await h.playwright.webkit.launch();
  try {
    for (const width of [390, 320]) {
      const tag = `${width}`;
      cloud.rows.clear(); cloud.taxonomy = null; cloud.deletes.length = 0;
      const A = await h.openDevice(browser, base, handler, { width, name: `A${width}` });
      await h.launch(A, base);
      const p = A.page; const e = editor(p);
      const seeded = await p.evaluate(async (LIB) => {
        saveComponentLibraryRecords(LIB); resyncStudioComponentTaxonomyWithRecords(); refreshComponentLibraryViews();
        const linked = await window.KLABS_SYNC.copyToAccount();
        return { linked, status: window.KLABS_SYNC.getState().status };
      }, LIB());
      ck(tag, 'the library is linked to the account cloud', seeded.linked.ok && cloud.rows.size === LIB().length, [seeded, cloud.rows.size]);
      // An existing build whose lines recorded the 10 mm and 16 mm prices.
      const customer = `Sizes ${width}`;
      await p.evaluate(async ({ customer, BASE }) => {
        clearActiveSavedBuildRef();
        const line = (mm, cost, sell) => ({ ...defaultComponentRow(), category: `${BASE} ${mm} mm`, libraryComponentId: `wc-${mm}`, cost, unitPrice: sell, quantity: 1 });
        quote = normalizeQuote({ customerName: customer, buildName: 'Recorded prices', status: 'quote', quoteStatus: 'quote', gstRate: 15, includeGst: true, jobType: 'build',
          components: [line(10, 2.75, 6.5), line(16, 3.5, 8)] });
        hasUnsavedQuoteChanges = true; await persistCurrentQuoteRecord(); markQuoteSaved();
      }, { customer, BASE });

      // 1. Open the family: every size with its own Buy/Sell at once, in size order; nothing to save yet.
      await openFamily(p, CAT, FAM);
      const button = (await p.locator('#studioComponentsGenerateSizesBtn').textContent()).trim();
      await p.locator('#studioComponentsGenerateSizesBtn').click();
      await e.sheet.waitFor({ state: 'visible' });
      const opened = await e.rows();
      ck(tag, 'the family button reads Sizes & Prices', button === 'Sizes & Prices', button);
      ck(tag, 'opening the family lists every size with its own Buy and Sell, in size order',
        JSON.stringify(opened.map((r) => [r.label, r.buy, r.sell])) === JSON.stringify(Object.entries(SIZES).map(([mm, [b, s]]) => [`${mm} mm`, String(b), String(s)])), opened);
      ck(tag, 'the base name is the shared part of the names; Save Changes waits for a change',
        (await p.locator('#studioFamilySizeBase').inputValue()) === BASE && await e.save.isDisabled(), await p.locator('#studioFamilySizeBase').inputValue());
      const look = await layout(p);
      ck(tag, 'compact table: equal rows, aligned Buy and Sell columns, nothing cut off or sideways, touch targets >= 36 px',
        !look.sideways && look.inside && look.equalHeights && look.buyAligned && look.sellAligned && look.targets >= 36 && look.labelsFit, look);
      ck(tag, 'the range is a compact secondary option (folded away)', !(await p.locator('#studioFamilySizeFrom').isVisible()) && await p.locator('#studioFamilySizeList').isVisible());
      if (shots) await p.screenshot({ path: path.join(shots, `existing-family-${width}.png`) });

      // 2. Edit prices in place.
      await (await e.field('8 mm', 'buy')).fill('2.9');
      await (await e.field('16 mm', 'sell')).fill('8.5');
      ck(tag, 'an edit enables Save Changes', await e.save.isEnabled());

      // 3. A range 8-20 step 2: the five existing sizes are left exactly as they are; 18 and 20 mm are added at the starting prices.
      await p.locator('#studioFamilySizeSheet .studio-family-size__range > summary').click();
      await p.locator('#studioFamilySizeFrom').fill('8'); await p.locator('#studioFamilySizeTo').fill('20'); await p.locator('#studioFamilySizeStep').fill('2');
      await p.locator('#studioFamilySizeBuy').fill('4'); await p.locator('#studioFamilySizeSell').fill('9');
      await p.locator('#studioFamilySizeBuild').click();
      let rows = await e.rows();
      const kept = rows.filter((r) => !r.isNew).map((r) => [r.label, r.buy, r.sell]);
      ck(tag, 'range: existing sizes and the edits are kept; only the missing sizes are added at the starting prices',
        JSON.stringify(kept) === JSON.stringify([['8 mm', '2.9', '6'], ['10 mm', '2.75', '6.5'], ['12 mm', '3', '7'], ['14 mm', '3.25', '7.5'], ['16 mm', '3.5', '8.5']])
        && JSON.stringify(rows.filter((r) => r.isNew).map((r) => [r.label, r.buy, r.sell, r.title])) === JSON.stringify([['18 mm', '4', '9', `${BASE} 18 mm`], ['20 mm', '4', '9', `${BASE} 20 mm`]]), rows);
      ck(tag, 'range: the sizes already listed are named, not duplicated', /Already listed: 8 mm, 10 mm, 12 mm, 14 mm, 16 mm/.test(await e.status()), await e.status());
      // 4. A comma list for irregular sizes: 17 mm is added, 18 mm (already listed) is not.
      await p.locator('#studioFamilySizeList').fill('17 mm, 18 mm');
      await p.locator('#studioFamilySizeBuild').click();
      rows = await e.rows();
      ck(tag, 'comma list: adds 17 mm to the same table; 18 mm is not added twice',
        rows.filter((r) => r.label === '17 mm').length === 1 && rows.filter((r) => r.label === '18 mm').length === 1 && rows.length === 8, rows.map((r) => r.label));
      await (await e.field('20 mm', 'sell')).fill('10');
      // 5. Remove one saved size (12 mm, confirmed on save) and one new size (17 mm, gone at once).
      await e.remove('12 mm');
      await e.remove('17 mm');
      rows = await e.rows();
      ck(tag, 'removal: a saved size is marked (struck, prices locked); a new size simply goes',
        rows.find((r) => r.label === '12 mm').removed && !rows.some((r) => r.label === '17 mm'), rows);
      if (shots) await p.screenshot({ path: path.join(shots, `edited-family-${width}.png`) });
      // A missing price on a size being edited is refused and nothing is written.
      const beforeBad = JSON.stringify(await library(p));
      await (await e.field('14 mm', 'sell')).fill('');
      await e.save.click();
      ck(tag, 'a blank price is refused with the size named; nothing is saved',
        /14 mm: Sell Price is required/.test(await e.status()) && JSON.stringify(await library(p)) === beforeBad && await e.sheet.isVisible(), await e.status());
      await (await e.field('14 mm', 'sell')).fill('7.5');
      // 6. Save once: the removal is confirmed by name first.
      await e.save.click();
      await p.locator('#confirmSheet').waitFor({ state: 'visible' });
      const confirmText = await p.locator('#confirmSheetMessage').textContent();
      ck(tag, 'removing a size asks first, naming it and that builds keep their prices', new RegExp(`${BASE} 12 mm`).test(confirmText) && /keep their recorded prices/.test(confirmText), confirmText);
      await p.locator('#confirmSheet [data-confirm-action="remove"]').click();
      await e.sheet.waitFor({ state: 'hidden' });
      const saved = await library(p);
      const by = Object.fromEntries(saved.map((r) => [r.name, r]));
      ck(tag, 'one save: edited prices, two new sizes, one removal - nothing else changes',
        saved.length === 6 && !by[`${BASE} 12 mm`] && by[`${BASE} 8 mm`].buy === 2.9 && by[`${BASE} 8 mm`].unitCost === 2.9 && by[`${BASE} 8 mm`].sell === 6
        && by[`${BASE} 16 mm`].buy === 3.5 && by[`${BASE} 16 mm`].sell === 8.5 && by[`${BASE} 10 mm`].buy === 2.75 && by[`${BASE} 10 mm`].sell === 6.5
        && by[`${BASE} 14 mm`].sell === 7.5 && by[`${BASE} 18 mm`].buy === 4 && by[`${BASE} 18 mm`].sell === 9 && by[`${BASE} 20 mm`].sell === 10, saved);
      ck(tag, 'each saved size keeps its identity, brand, supplier, category, details and stock',
        ['8', '10', '14', '16'].every((mm) => { const r = by[`${BASE} ${mm} mm`]; return r.id === `wc-${mm}` && r.brand === 'Fuji' && r.supplier === 'PacBay' && r.description === `Check ${mm}` && r.stock === Number(mm) && r.category === CAT; }), saved);
      ck(tag, 'the family list shows the new prices', (await p.locator('#studioComponentsList').textContent()).includes('SELL $8.50'));

      // 7. Reopen: the saved state at once, nothing to save.
      await p.locator('#studioComponentsGenerateSizesBtn').click();
      rows = await e.rows();
      ck(tag, 'reopening shows the saved sizes and prices with nothing to save',
        JSON.stringify(rows.map((r) => [r.label, r.buy, r.sell])) === JSON.stringify([['8 mm', '2.9', '6'], ['10 mm', '2.75', '6.5'], ['14 mm', '3.25', '7.5'], ['16 mm', '3.5', '8.5'], ['18 mm', '4', '9'], ['20 mm', '4', '10']]) && await e.save.isDisabled(), rows);
      // Unsaved changes are discarded only when confirmed.
      await (await e.field('18 mm', 'buy')).fill('99');
      await p.locator('#studioFamilySizeSheet .studio-component-duplicate__actions [data-family-size-action="cancel"]').click();
      await p.locator('#confirmSheet').waitFor({ state: 'visible' });
      await p.locator('#confirmSheet [data-confirm-action="discard"]').click();
      await e.sheet.waitFor({ state: 'hidden' });
      ck(tag, 'Cancel with changes asks before discarding; nothing is saved', (await library(p)).find((r) => r.name === `${BASE} 18 mm`).buy === 4);

      // 8. Cloud: the same library reaches the account (prices updated, removal deleted, new sizes added).
      // Component sync pushes 0.7 s after a save (debounced); wait for the account to have it before reloading.
      for (let i = 0; i < 60 && !(cloud.deletes.includes('wc-12') && Number(cloud.rows.get('wc-16')?.unit_price) === 8.5); i++) await p.waitForTimeout(250);
      await p.waitForFunction(() => window.KLABS_SYNC.getState().status === 'synced', null, { timeout: 15000 }).catch(() => {});
      const cloudFam = [...cloud.rows.values()].filter((r) => r.subcategory === FAM).map((r) => [r.name, Number(r.cost), Number(r.unit_price)]).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
      ck(tag, 'component sync: the account has the saved prices, the new sizes and not the removed one',
        cloudFam.length === 6 && cloud.deletes.includes('wc-12') && JSON.stringify(cloudFam.find((r) => r[0] === `${BASE} 16 mm`)) === JSON.stringify([`${BASE} 16 mm`, 3.5, 8.5]), [cloudFam, cloud.deletes]);

      // 9. Reload (offline storage) and a second device (from the account).
      await p.reload(); await p.waitForFunction(() => window.KLABS_UI && window.KLABS_BUILD_SYNC, null, { timeout: 30000 });
      const reloaded = await library(p);
      ck(tag, 'after reload the prices and sizes are exactly as saved', JSON.stringify(reloaded) === JSON.stringify(saved), reloaded);
      const B = await h.openDevice(browser, base, handler, { width, name: `B${width}` });
      await h.launch(B, base);
      await B.page.waitForFunction((FAM) => componentLibraryRecords().filter((r) => r.subcategory === FAM).length === 6, FAM, { timeout: 15000 }).catch(() => {});
      const second = (await library(B.page)).map((r) => [r.name, r.buy, r.sell]);
      ck(tag, 'a second device gets the same sizes and prices', JSON.stringify(second) === JSON.stringify(saved.map((r) => [r.name, r.buy, r.sell])), second);
      await B.context.close();

      // 10. The existing build keeps the prices its lines recorded; Components Cost is unchanged.
      await p.evaluate(() => window.KLABS_UI.openActiveBuildsList());
      await p.locator('[data-builds-status-filter="quote"]').click();
      await p.locator('.saved-build-card__open', { hasText: customer }).first().click();
      await p.waitForTimeout(400);
      const recorded = await p.evaluate(() => ({ lines: quote.components.filter((r) => !componentRowIsEffectivelyEmpty(r)).map((r) => [r.category, Number(r.cost), Number(r.unitPrice)]), cost: quoteMaths().materialCost }));
      ck(tag, 'an existing build keeps the prices its lines recorded (16 mm still Sell 8.00 after the edit to 8.50; cost 6.25)',
        JSON.stringify(recorded.lines) === JSON.stringify([[`${BASE} 10 mm`, 2.75, 6.5], [`${BASE} 16 mm`, 3.5, 8]]) && Math.abs(recorded.cost - 6.25) < 0.001, recorded);

      // 11. The v280 picker: sizes from the family, each with its own quantity, one Add to Build, at the new prices.
      const head = p.locator('[aria-controls="workshopComponentsBody"]');
      if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
      await p.locator('#addComponentBtn').click();
      await p.locator(`#choicePickerList [data-choice-option="${CAT}"]`).click();
      await p.locator(`#choicePickerList [data-choice-option="${FAM}"]`).click();
      const pickRow = (name) => p.locator(`#choicePickerList .component-sheet__row--pick[data-pick-name="${name}"]`);
      await pickRow(`${BASE} 18 mm`).locator('.component-sheet__option').click();
      await pickRow(`${BASE} 18 mm`).locator('[data-pick-step="1"]').click();
      await pickRow(`${BASE} 8 mm`).locator('.component-sheet__option').click();
      await p.locator('#choicePickerAddToBuild').click();
      await p.locator('#choicePickerSheet').waitFor({ state: 'hidden' });
      const picked = await p.evaluate(() => ({ lines: quote.components.filter((r) => !componentRowIsEffectivelyEmpty(r)).map((r) => [r.category, componentRowQuantity(r), Number(r.cost), Number(r.unitPrice)]), cost: quoteMaths().materialCost }));
      ck(tag, 'v280 picker: two sizes, own quantities, one Add to Build, each at its own new price; Components Cost adds up',
        picked.lines.some((l) => JSON.stringify(l) === JSON.stringify([`${BASE} 18 mm`, 2, 4, 9])) && picked.lines.some((l) => JSON.stringify(l) === JSON.stringify([`${BASE} 8 mm`, 1, 2.9, 6]))
        && Math.abs(picked.cost - (6.25 + 8 + 2.9)) < 0.001, picked);

      // 12. The component editor: Sizes & Prices opens the same family editor; no second size editor; shared-price sizes kept.
      await openFamily(p, CAT, FAM);
      await p.locator(`#studioComponentsList [data-studio-library-open-component="${BASE} 10 mm"]`).click();
      const editorView = await p.evaluate(() => ({ open: !!document.getElementById('studioComponentFamilySizesBtn'), addSize: !!document.getElementById('studioComponentSizeInput'), range: !!document.querySelector('[data-size-action="generate"]') }));
      await p.locator('#studioComponentFamilySizesBtn').click();
      await e.sheet.waitFor({ state: 'visible' });
      ck(tag, 'component editor: Sizes & Prices opens the family editor; the old Add Size / Generate Range are gone',
        editorView.open && !editorView.addSize && !editorView.range && (await e.rows()).length === 6, editorView);
      await p.locator('#studioFamilySizeSheet .studio-component-duplicate__actions [data-family-size-action="cancel"]').click();
      await openFamily(p, 'Decals', 'Rod Decals');
      await p.locator('#studioComponentsList [data-studio-library-open-component="Custom Decal"]').click();
      const decal = await p.evaluate(() => ({ chips: [...document.querySelectorAll('#studioComponentSizeEditList .studio-size-chip__label')].map((c) => c.textContent), note: document.querySelector('.studio-size-section__note')?.textContent }));
      ck(tag, 'a component with shared-price sizes still lists them (removable), marked One price', JSON.stringify(decal.chips) === JSON.stringify(['Large', 'Medium', 'Small']) && decal.note === 'One price', decal);
      if (shots) await p.screenshot({ path: path.join(shots, `component-editor-${width}.png`) });

      // 12b. Regression: a subcategory of distinct products. A component opens on ITS sizes only; the family view on none.
      const everything = () => p.evaluate(() => JSON.stringify(componentLibraryRecords()));
      const untouched = await everything();
      const openComponent = async (name) => {
        await openFamily(p, 'Guides', 'Fuji Guides');
        await p.locator(`#studioComponentsList [data-studio-library-open-component="${name}"]`).click();
        await p.locator('#studioComponentFamilySizesBtn').click();
        await e.sheet.waitFor({ state: 'visible' });
        return { rows: (await e.rows()).map((r) => [r.label, r.buy, r.sell, r.title]), product: await p.evaluate(() => document.getElementById('studioFamilySizeProduct')?.textContent ?? null),
          baseLocked: await p.locator('#studioFamilySizeBase').evaluate((el) => el.readOnly) };
      };
      const closeSheet = () => p.locator('#studioFamilySizeSheet .studio-component-duplicate__actions [data-family-size-action="cancel"]').click();
      const cc = await openComponent('Fuji K Series Single Foot CC 8');
      ck(tag, 'regression: Fuji K Series Single Foot CC shows only its own sizes (6, 8, 10) - no sets, other K Series or other guides',
        JSON.stringify(cc.rows) === JSON.stringify([['6', '4', '9', 'Fuji K Series Single Foot CC 6'], ['8', '4.2', '9.5', 'Fuji K Series Single Foot CC 8'], ['10', '4.6', '10', 'Fuji K Series Single Foot CC 10']])
        && cc.product === 'Fuji K Series Single Foot CC' && cc.baseLocked, cc);
      if (shots) await p.screenshot({ path: path.join(shots, `regression-cc-family-${width}.png`) });
      await closeSheet();
      await e.sheet.waitFor({ state: 'hidden' });
      const standalone = await openComponent('Fuji Tip Top');
      await closeSheet();
      const legacy = await openComponent('Fuji Complete Guide Set Spinning');
      await closeSheet();
      const kl = await openComponent('Fuji K Series Single Foot KL 6');
      await closeSheet();
      ck(tag, 'regression: standalone, legacy shared-price and a different K Series product each open on themselves only',
        JSON.stringify(standalone.rows.map((r) => r[0])) === JSON.stringify(['Fuji Tip Top'])
        && legacy.rows.length === 1 && /Fuji Complete Guide Set Spinning\s*2 sizes/.test(legacy.rows[0][0])
        && JSON.stringify(kl.rows.map((r) => r[3])) === JSON.stringify(['Fuji K Series Single Foot KL 6']), { standalone, legacy, kl });
      await openFamily(p, 'Guides', 'Fuji Guides');
      await p.locator('#studioComponentsGenerateSizesBtn').click();
      await e.sheet.waitFor({ state: 'visible' });
      const famView = { rows: (await e.rows()).length, base: await p.locator('#studioFamilySizeBase').inputValue(), note: await e.status(), productHidden: await p.evaluate(() => { const el = document.getElementById('studioFamilySizeProduct'); return !!el && el.parentElement.hidden; }) };
      ck(tag, 'regression: the family view of a multi-product family lists no products as sizes and says how to edit one',
        famView.rows === 0 && famView.base === '' && /several products/.test(famView.note) && famView.productHidden, famView);
      await closeSheet();
      ck(tag, 'regression: opening and cancelling changed nothing in the library', (await everything()) === untouched);
      // Editing one product's sizes changes nothing else.
      await openComponent('Fuji K Series Single Foot CC 8');
      await (await e.field('8', 'sell')).fill('9.9');
      await e.save.click();
      await e.sheet.waitFor({ state: 'hidden' });
      const after = JSON.parse(await everything());
      const before = JSON.parse(untouched);
      const changed = after.filter((r) => JSON.stringify(r) !== JSON.stringify(before.find((b) => b.id === r.id))).map((r) => [r.id, r.unitPrice]);
      ck(tag, 'regression: saving CC 8 changes CC 8 only (every other component identical)', JSON.stringify(changed) === JSON.stringify([['cc8', 9.9]]) && after.length === before.length, changed);

      // 13. A new family: Add Subcategory, then the same editor - a Fuji guide comma list, priced individually, one save.
      await p.locator('#studioComponentsBackBtn').click();
      for (let i = 0; i < 3 && (await p.locator('#studioComponentsTitle').textContent()).trim() !== 'COMPONENTS'; i++) await p.locator('#studioComponentsBackBtn').click();
      await p.locator('#studioComponentsList [data-studio-library-open-category="Grips"]').click();
      await p.locator('#studioComponentsAddBtn').click();
      await p.locator('#studioLibrarySubcategoryName').fill(`Fuji KR ${width}`);
      await p.locator('[data-studio-library-action="subcategory-add"]').click();
      await p.locator('#studioComponentsGenerateSizesBtn').click();
      await e.sheet.waitFor({ state: 'visible' });
      const empty = { rows: (await e.rows()).length, base: await p.locator('#studioFamilySizeBase').inputValue() };
      await p.locator('#studioFamilySizeBase').fill(`Fuji KR Guide ${width}`);
      await p.locator('#studioFamilySizeList').fill('30, 25, 20, 16, 12, 10, 8, 6');
      await p.locator('#studioFamilySizeBuy').fill('8'); await p.locator('#studioFamilySizeSell').fill('14');
      await p.locator('#studioFamilySizeBuild').click();
      await (await e.field('30', 'buy')).fill('15'); await (await e.field('30', 'sell')).fill('26');
      await (await e.field('25', 'buy')).fill('13'); await (await e.field('25', 'sell')).fill('23');
      const fresh = await e.rows();
      if (shots) await p.screenshot({ path: path.join(shots, `new-family-${width}.png`) });
      const freshLook = await layout(p);
      await e.save.click();
      await e.sheet.waitFor({ state: 'hidden' });
      const made = await p.evaluate((fam) => componentLibraryRecords().filter((r) => r.subcategory === fam).map((r) => [r.name, r.cost, r.unitPrice]).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })), `Fuji KR ${width}`);
      ck(tag, 'new family: opens empty, comma sizes in typed order, individual prices, one save makes eight components',
        empty.rows === 0 && fresh.map((r) => r.label).join(',') === '30,25,20,16,12,10,8,6' && made.length === 8
        && JSON.stringify(made.find((r) => r[0].endsWith(' 30'))) === JSON.stringify([`Fuji KR Guide ${width} 30`, 15, 26]) && JSON.stringify(made.find((r) => r[0].endsWith(' 6'))) === JSON.stringify([`Fuji KR Guide ${width} 6`, 8, 14]), { empty, fresh, made });
      ck(tag, 'new family table: equal rows, aligned columns, nothing sideways', !freshLook.sideways && freshLook.equalHeights && freshLook.buyAligned && freshLook.sellAligned && freshLook.targets >= 36, freshLook);
      // Reopened, the family's sizes show by their size, in size order.
      await p.locator('#studioComponentsGenerateSizesBtn').click();
      const reopenedNew = await e.rows();
      ck(tag, 'reopened new family: base name recognised; sizes listed by size', (await p.locator('#studioFamilySizeBase').inputValue()) === `Fuji KR Guide ${width}` && reopenedNew.map((r) => r.label).join(',') === '6,8,10,12,16,20,25,30', reopenedNew.map((r) => r.label));
      await p.locator('#studioFamilySizeSheet .studio-component-duplicate__actions [data-family-size-action="cancel"]').click();
      ck(tag, 'no page errors', A.errors.length === 0, A.errors);
      await A.context.close();
    }
    // Desktop: the same editor at Mac size.
    const D = await h.openDevice(browser, base, handler, { width: 1280, name: 'desktop' });
    await h.launch(D, base);
    await D.page.evaluate((LIB) => { saveComponentLibraryRecords(LIB); resyncStudioComponentTaxonomyWithRecords(); refreshComponentLibraryViews(); }, LIB());
    await openFamily(D.page, CAT, FAM);
    await D.page.locator('#studioComponentsGenerateSizesBtn').click();
    await editor(D.page).sheet.waitFor({ state: 'visible' });
    const desk = await layout(D.page);
    ck('desktop', 'desktop: compact aligned table, nothing sideways', !desk.sideways && desk.equalHeights && desk.buyAligned && desk.sellAligned, desk);
    if (shots) await D.page.screenshot({ path: path.join(shots, 'existing-family-desktop.png') });
    await D.context.close();
  } finally {
    await browser.close();
    server.close();
  }
  const passed = results.filter(Boolean).length;
  console.log(`size & pricing editor: ${passed}/${results.length} checks passed`);
  process.exitCode = passed === results.length ? 0 : 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
