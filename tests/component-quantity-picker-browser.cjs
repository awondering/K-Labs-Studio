// Components quantity & multiple-size selection, in WebKit on the real Studio with its real sync (production SQL in PGlite).
// Select a family once, set quantities (and sizes), Add to Build once; then edit, remove, reload and open on a second device.
// New Build, Refurbishment and Components jobs, at 390 and 320 px.
// Usage: PLAYWRIGHT_MODULE=... PGLITE_MODULE=... node tests/component-quantity-picker-browser.cjs [shots dir]
const path = require('node:path');
const h = require('./helpers/studio-pglite-harness.cjs');
const root = path.join(__dirname, '..');
const shots = process.argv[2] || '';
const results = [];
const ck = (tag, name, ok, detail) => { results.push(ok); console.log(ok ? 'PASS' : 'FAIL', `[${tag}]`, name, ok ? '' : '\n      ' + JSON.stringify(detail)); };
const money = (t) => Number(String(t || '').replace(/[^0-9.-]/g, ''));
const LIB = [
  { name: 'EVA Grip 75 mm', category: 'Grips', subcategory: 'EVA Grips', cost: 9, unitCost: 9, unitPrice: 18 },
  { name: 'EVA Grip 100 mm', category: 'Grips', subcategory: 'EVA Grips', cost: 11, unitCost: 11, unitPrice: 22 },
  ...[8, 10, 12, 14, 16].map((mm, i) => ({ name: `Aluminium Winding Check ${mm} mm`, category: 'Winding Checks', subcategory: 'Grip Winding Checks', cost: 2.5 + i * 0.25, unitCost: 2.5 + i * 0.25, unitPrice: 6 + i * 0.5 })),
  { name: 'Custom Decal', category: 'Decals', subcategory: 'Rod Decals', cost: 4, unitCost: 4, unitPrice: 12, sizeOptions: ['Small', 'Medium', 'Large'] },
];
const JOBS = [
  { key: 'new-build', seed: { jobType: 'build' } },
  { key: 'refurbishment', seed: { jobType: 'repair' } },
  { key: 'components', seed: { jobType: 'build', jobKind: 'components' } },
];
const LINES = () => quote.components.filter((r) => !componentRowIsEffectivelyEmpty(r))
  .map((r) => [r.category, r.selectedSize || '', componentRowQuantity(r), r.cost, r.unitPrice]);
const settled = (page) => page.waitForFunction(() => !hasUnsavedQuoteChanges && !quoteAutosaveInFlight && window.KLABS_BUILD_SYNC.getStatus() === 'synced', null, { timeout: 20000 }).then(() => true, () => false);

async function open(page, customer) {
  await page.evaluate(() => window.KLABS_UI.openActiveBuildsList());
  await page.locator('[data-builds-status-filter="quote"]').click();
  await page.locator('.saved-build-card__open', { hasText: customer }).first().click();
  await page.waitForTimeout(400);
  const head = page.locator('[aria-controls="workshopComponentsBody"]');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
}
const picker = (p) => ({
  row: (name, size = '') => p.locator(`#choicePickerList .component-sheet__row--pick[data-pick-name="${name}"][data-pick-size="${size}"]`),
  value: async (name, size = '') => (await picker(p).row(name, size).locator('.component-pick__value').textContent()).trim(),
  drill: (name) => p.locator(`#choicePickerList [data-choice-option="${name}"]`).click(),
  plus: (name, size = '') => picker(p).row(name, size).locator('[data-pick-step="1"]').click(),
  minus: (name, size = '') => picker(p).row(name, size).locator('[data-pick-step="-1"]').click(),
  choose: (name, size = '') => picker(p).row(name, size).locator('.component-sheet__option').click(),
  add: p.locator('#choicePickerAddToBuild'),
  count: async () => (await p.locator('#choicePickerAddToBuild .component-sheet__pick-count').textContent()).trim(),
});

(async () => {
  const db = await h.createDatabase(root);
  const handler = h.makeHandler(db, []);
  const server = await h.serveRoot(() => root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await h.playwright.webkit.launch();
  const made = [];
  try {
    for (const width of [390, 320]) {
      const A = await h.openDevice(browser, base, handler, { width });
      await h.launch(A, base);
      const p = A.page; const k = picker(p);
      await p.evaluate((LIB) => { saveComponentLibraryRecords(LIB.map((r) => ({ ...r, id: '' }))); resyncStudioComponentTaxonomyWithRecords(); refreshComponentLibraryViews(); }, LIB);
      for (const job of JOBS) {
        const tag = `${job.key}@${width}`;
        const customer = `Parts ${job.key} ${width}`;
        await p.evaluate(async ({ customer, seed }) => {
          clearActiveSavedBuildRef();
          quote = normalizeQuote({ customerName: customer, buildName: 'Parts test', status: 'quote', quoteStatus: 'quote', gstRate: 15, includeGst: true, components: [], ...seed });
          hasUnsavedQuoteChanges = true; await persistCurrentQuoteRecord(); markQuoteSaved();
        }, { customer, seed: job.seed });
        await settled(p);
        await open(p, customer);
        made.push(customer);

        // 1. One component: chosen at the default 1, raised to 2 before adding, one Add to Build.
        await p.locator('#addComponentBtn').click();
        await k.drill('Grips'); await k.drill('EVA Grips');
        const before = { grip: await k.value('EVA Grip 75 mm'), addHidden: await k.add.isHidden(), addDisabled: await k.add.isDisabled() };
        await k.choose('EVA Grip 75 mm');
        const chosen = await k.value('EVA Grip 75 mm');
        await k.plus('EVA Grip 75 mm');
        const raised = { qty: await k.value('EVA Grip 75 mm'), count: await k.count(), sheetOpen: await p.locator('#choicePickerSheet').isVisible() };
        ck(tag, 'a component shows its quantity before adding: 0, tap → 1, + → 2, Add to Build shows 2, nothing added yet',
          before.grip === '0' && !before.addHidden && before.addDisabled && chosen === '1' && raised.qty === '2' && raised.count === '2' && raised.sheetOpen
          && (await p.evaluate(LINES)).length === 0, { before, chosen, raised });
        await k.add.click(); await p.waitForTimeout(300);
        ck(tag, 'Add to Build: one line, EVA Grip 75 mm × 2 at Buy $9 / Sell $18, the library closes',
          JSON.stringify(await p.evaluate(LINES)) === JSON.stringify([['EVA Grip 75 mm', '', 2, 9, 18]]) && await p.locator('#choicePickerSheet').isHidden(), await p.evaluate(LINES));

        // 2. Several sizes from one family, and sizes of one component, all in one Add to Build.
        await p.locator('#addComponentBtn').click();
        await k.drill('Winding Checks'); await k.drill('Grip Winding Checks');
        await k.choose('Aluminium Winding Check 8 mm');
        await k.plus('Aluminium Winding Check 10 mm'); await k.plus('Aluminium Winding Check 10 mm');
        await k.plus('Aluminium Winding Check 12 mm');
        await k.plus('Aluminium Winding Check 14 mm'); await k.minus('Aluminium Winding Check 14 mm');
        if (shots) await p.screenshot({ path: path.join(shots, `${job.key}-${width}px-1-family.png`) });
        await p.locator('#choicePickerBack').click(); await p.locator('#choicePickerBack').click();
        await k.drill('Decals'); await k.drill('Rod Decals');
        await p.locator('#choicePickerList [data-pick-sizes]').click();
        await k.plus('Custom Decal', 'Medium');
        if (shots) await p.screenshot({ path: path.join(shots, `${job.key}-${width}px-2-sizes.png`) });
        await p.locator('#choicePickerBack').click();
        const summary = (await p.locator('#choicePickerList [data-pick-sizes] .component-sheet__option-meta').textContent()).trim();
        ck(tag, 'choices are kept across families and sizes (Custom Decal shows "Medium ×1"); Add to Build counts 5', summary === 'Medium ×1' && await k.count() === '5', { summary, count: await k.count() });
        await k.add.click(); await p.waitForTimeout(300);
        const expected = [
          ['Aluminium Winding Check 8 mm', '', 1, 2.5, 6], ['Aluminium Winding Check 10 mm', '', 2, 2.75, 6.5], ['Aluminium Winding Check 12 mm', '', 1, 3, 7],
          ['Custom Decal', 'Medium', 1, 4, 12], ['EVA Grip 75 mm', '', 2, 9, 18]];
        ck(tag, '8 mm ×1, 10 mm ×2, 12 mm ×1 and Decal Medium ×1 added at once, each its own line and prices; 14 mm (back to 0) not added',
          JSON.stringify(await p.evaluate(LINES)) === JSON.stringify(expected), await p.evaluate(LINES));

        // 3. Adding a component already on the build raises that line's quantity.
        await p.locator('#addComponentBtn').click();
        await k.drill('Grips'); await k.drill('EVA Grips'); await k.choose('EVA Grip 75 mm'); await k.add.click(); await p.waitForTimeout(300);
        const grips = (await p.evaluate(LINES)).filter((l) => l[0] === 'EVA Grip 75 mm');
        ck(tag, 'adding EVA Grip 75 mm again: still one line, now Qty 3', grips.length === 1 && grips[0][2] === 3, grips);

        // 4. Quantity stays editable on the line; a line can be removed.
        const rowOpen = (name) => p.locator(`#quoteComponentsList [data-component-action="open-row"][aria-label$=" for ${name}" i]`).first();
        await rowOpen('EVA Grip 75 mm').click();
        const gi = await rowOpen('EVA Grip 75 mm').getAttribute('data-component-index');
        await p.locator(`#quoteComponentsList [data-component-action="quantity-decrement"][data-component-index="${gi}"]`).click();
        await p.waitForTimeout(200);
        ck(tag, 'on the line, − takes EVA Grip 75 mm from 3 to 2', (await p.evaluate(LINES)).find((l) => l[0] === 'EVA Grip 75 mm')[2] === 2, await p.evaluate(LINES));
        await rowOpen('Aluminium Winding Check 12 mm').click();
        const ri = await rowOpen('Aluminium Winding Check 12 mm').getAttribute('data-component-index');
        await p.locator(`#quoteComponentsList [data-component-action="request-delete-row"][data-component-index="${ri}"]`).first().click();
        await p.locator('#confirmSheet [data-confirm-action="delete"]').click(); await p.waitForTimeout(300);
        const after = await p.evaluate(LINES);
        ck(tag, 'the 12 mm line is removed, the other sizes stay', !after.some((l) => l[0] === 'Aluminium Winding Check 12 mm') && after.length === 4, after);

        // 5. Costs and prices follow the quantities.
        const cost = await p.evaluate(() => ({ shown: document.getElementById('quoteCostBeforeMargin').textContent, job: document.getElementById('quoteTotal').value, readOnly: document.getElementById('quoteTotal').readOnly }));
        const expectCost = 9 * 2 + 2.5 + 2.75 * 2 + 4;
        const expectSell = 18 * 2 + 6 + 6.5 * 2 + 12;
        // Components jobs: Sell prices include GST; the Job Price is before GST (as before this change).
        const expectJob = Math.round(expectSell / 1.15 * 100) / 100;
        ck(tag, `Components Cost $${expectCost.toFixed(2)} (Buy × Qty)${job.key === 'components' ? `; Job Price ${expectJob.toFixed(2)} = Sell × Qty $${expectSell.toFixed(2)} before GST` : ''}`,
          Math.abs(money(cost.shown) - expectCost) < 0.005 && (job.key !== 'components' || (cost.readOnly && Math.abs(Number(cost.job) - expectJob) < 0.005)), cost);
        ck(tag, 'no page overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), null);
        if (shots) await p.locator('#workshopComponentsBody').screenshot({ path: path.join(shots, `${job.key}-${width}px-3-build.png`) });

        // 6. Saved and synced: the server has exactly these lines.
        ck(tag, 'saved and synced', await settled(p), null);
        const server = (await db.query(`select payload from builds where payload->>'customerName' = $1`, [customer])).rows[0].payload;
        const serverLines = server.components.filter((r) => r.category).map((r) => [r.category, r.selectedSize || '', r.quantity, r.cost, r.unitPrice]);
        ck(tag, 'the server has the same lines, quantities and prices', JSON.stringify(serverLines) === JSON.stringify(after), { serverLines, after });
      }
      const errors = A.errors.filter((e) => !/Component library cloud sync failed/.test(e));
      ck(`device@${width}`, 'no page errors (the test database has no component-library table, so that sync message is expected)', errors.length === 0, errors.slice(0, 4));
      // Reload on the same device.
      await A.page.reload(); await h.launch(A, base);
      await open(A.page, `Parts new-build ${width}`);
      const reloaded = await A.page.evaluate(LINES);
      ck(`device@${width}`, 'after a reload the New Build shows the same 4 lines', reloaded.length === 4 && reloaded.find((l) => l[0] === 'EVA Grip 75 mm')[2] === 2, reloaded);
      await A.context.close();
    }
    // A second device, which never had this component library.
    const B = await h.openDevice(browser, base, handler, { name: 'second' });
    await h.launch(B, base);
    for (const customer of made) {
      await open(B.page, customer);
      const lines = await B.page.evaluate(LINES);
      const server = (await db.query(`select payload from builds where payload->>'customerName' = $1`, [customer])).rows[0].payload;
      const serverLines = server.components.filter((r) => r.category).map((r) => [r.category, r.selectedSize || '', r.quantity, r.cost, r.unitPrice]);
      ck(`${customer}@device B`, 'same lines, quantities and prices', JSON.stringify(lines) === JSON.stringify(serverLines) && lines.length === 4, lines);
    }
    ck('device B', 'no page errors', B.errors.length === 0, B.errors.slice(0, 4));
  } catch (e) {
    ck('x', 'run completed', false, e.message.split('\n').slice(0, 3).join(' | '));
  } finally { await browser.close(); server.close(); }
  console.log(`\ncomponent quantities: ${results.filter(Boolean).length}/${results.length} checks passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
})();
