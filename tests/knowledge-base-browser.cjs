// Q42 Knowledge Base in the real Studio (WebKit; production SQL in PGlite; synthetic account): Workshop card -> category
// home -> search results -> article reader -> back, at iPhone 390 and 320 (touch) and desktop 1280. Checks touch
// targets, no sideways scrolling, the draft label, kept search on back, related links, return to Workshop, no errors.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... PGLITE_MODULE=... node tests/knowledge-base-browser.cjs [screenshots dir]
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const h = require('./helpers/studio-pglite-harness.cjs');
const fixture = require('./fixtures/knowledge-fixture.cjs');
const { localReviewSource } = require('../scripts/knowledge-drafts.cjs');

const shots = process.argv[2] || '';
if (shots && !(fs.existsSync(shots) && fs.statSync(shots).isDirectory())) throw new Error(`Screenshots folder does not exist: ${shots}`);
const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}
const KB = '#workshopToolKnowledge';

// Touch targets apply to touch devices; on desktop Studio's shared back button is 42 px by its global style.
async function layout(p, mobile) {
  return p.evaluate(({ KB, mobile }) => {
    const card = document.querySelector(KB);
    const visible = [...card.querySelectorAll('button, input')].filter((e) => e.offsetParent);
    const small = visible.map((e) => ({ t: (e.textContent || e.placeholder || '').trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }))
      .filter((x) => mobile && x.h < 44);
    return { overflow: document.scrollingElement.scrollWidth - window.innerWidth, small };
  }, { KB, mobile });
}
async function snap(p, tag, name) {
  if (shots) await p.screenshot({ path: path.join(shots, `${tag}-${name}.png`), fullPage: true });
}

async function run(browser, base, db, { tag, width, mobile }) {
  const D = await h.openDevice(browser, base, h.makeHandler(db, []), { width, mobile, name: tag });
  await h.launch(D, base);
  const p = D.page;
  const tap = (sel) => (mobile ? p.tap(sel) : p.click(sel));
  await tap('[data-nav="workshopLandingScreen"]');
  await p.waitForSelector('[data-workshop-tool-open="knowledge"]', { state: 'visible' });
  const order = await p.$$eval('#workshopToolsList [data-workshop-tool-open]:not([hidden])', (b) => b.map((x) => x.getAttribute('data-workshop-tool-open')));
  ck(tag, 'Knowledge Base card sits among the Workshop tools, not first', order.indexOf('knowledge') > 0, order);

  await tap('[data-workshop-tool-open="knowledge"]');
  await p.waitForSelector(`${KB}:not([hidden]) [data-knowledge-category]`);
  const home = await p.evaluate((KB) => ({
    list: document.getElementById('workshopToolsList').hidden,
    categories: [...document.querySelectorAll(`${KB} [data-knowledge-category] .workshop-tool-launch__title`)].map((e) => e.textContent),
    search: !!document.querySelector(`${KB} [data-knowledge-search]`)?.offsetParent,
    sameSearchStyle: document.querySelector(`${KB} [data-knowledge-search]`).classList.contains('studio-components-shell__search'),
    sameRowStyle: [...document.querySelectorAll(`${KB} [data-knowledge-category]`)].every((e) => e.classList.contains('workshop-tool-launch--landing')),
  }), KB);
  await p.waitForFunction((KB) => /^2 articles$/.test(document.querySelector(`${KB} [data-knowledge-category="repairs"] .knowledge-row__detail`)?.textContent || ''), KB);
  ck(tag, 'local review: drafts from the git-ignored local file appear (Repairs: 2 articles)', true);
  ck(tag, 'home: tool list hidden, search shown, five categories', home.list && home.search && home.categories.join('|') === 'FAQs|Techniques|Troubleshooting|Component Selection|Repairs', home);
  ck(tag, 'home: uses Studio\'s existing search field and Workshop row styles', home.sameSearchStyle && home.sameRowStyle, home);
  let l = await layout(p, mobile);
  ck(tag, `home: ${mobile ? 'touch targets >= 44 px, ' : ''}no sideways scroll`, !l.small.length && l.overflow <= 0, l);
  await snap(p, tag, '1-home');

  await p.fill(`${KB} [data-knowledge-search]`, 'reelseat');
  await p.waitForSelector(`${KB} [data-knowledge-article]`);
  const results = await p.evaluate((KB) => ({
    status: document.querySelector(`${KB} .knowledge-count`)?.textContent,
    first: document.querySelector(`${KB} [data-knowledge-article]`)?.getAttribute('data-knowledge-article'),
    marks: document.querySelectorAll(`${KB} .knowledge-mark`).length,
    drafts: [...document.querySelectorAll(`${KB} [data-knowledge-article] .knowledge-status`)].map((e) => e.textContent),
  }), KB);
  ck(tag, 'search "reelseat": two articles, reel-seat removal first, matches marked, each labelled Draft',
    /^2 articles/.test(results.status) && results.first === 'fixture-seat-removal' && results.marks > 0 && results.drafts.join() === 'Draft,Draft', results);
  l = await layout(p, mobile);
  ck(tag, `results: ${mobile ? 'touch targets >= 44 px, ' : ''}no sideways scroll`, !l.small.length && l.overflow <= 0, l);
  await snap(p, tag, '2-results');

  await tap(`${KB} [data-knowledge-article="fixture-seat-removal"]`);
  await p.waitForSelector(`${KB} [data-knowledge-reader]`);
  const article = await p.evaluate((KB) => ({
    title: document.querySelector(`${KB} .knowledge-article__title`)?.textContent,
    draft: document.querySelector(`${KB} [data-knowledge-draft]`)?.textContent,
    searchHidden: document.querySelector(`${KB} [data-knowledge-search-wrap]`).hidden,
    back: document.querySelector(`${KB} .knowledge-back`)?.textContent.trim(),
    steps: document.querySelectorAll(`${KB} .knowledge-article__steps li`).length,
    caution: !!document.querySelector(`${KB} .knowledge-article__caution`),
    related: [...document.querySelectorAll(`${KB} [data-knowledge-reader] [data-knowledge-article]`)].map((e) => e.getAttribute('data-knowledge-article')),
    fontSize: parseFloat(getComputedStyle(document.querySelector(`${KB} .knowledge-article__section p, ${KB} .knowledge-article li`)).fontSize),
    top: Math.round(document.querySelector(KB).getBoundingClientRect().top),
  }), KB);
  ck(tag, 'article: title, Draft · Unverified notice, steps, caution, related article, search hidden',
    article.title === 'Fixture: taking off a test reel seat' && /Draft · Unverified/.test(article.draft) && article.steps >= 6 && article.caution
    && article.related.join() === 'fixture-route-choice' && article.searchHidden, article);
  ck(tag, 'article: back says Results; reading text 15 px; opens at the top of the card', /‹\s*RESULTS$/.test(article.back) && article.fontSize >= 15 && article.top <= 120, article);
  l = await layout(p, mobile);
  ck(tag, `article: ${mobile ? 'touch targets >= 44 px, ' : ''}no sideways scroll`, !l.small.length && l.overflow <= 0, l);
  await snap(p, tag, '3-article');

  await tap(`${KB} .knowledge-back`);
  await p.waitForSelector(`${KB} [data-knowledge-article]`);
  const back = await p.evaluate((KB) => ({ query: document.querySelector(`${KB} [data-knowledge-search]`).value, rows: document.querySelectorAll(`${KB} [data-knowledge-article]`).length }), KB);
  ck(tag, 'back from article returns to the same results with the search kept', back.query === 'reelseat' && back.rows === 2, back);

  await p.fill(`${KB} [data-knowledge-search]`, '');
  await p.waitForSelector(`${KB} [data-knowledge-category="repairs"]`);
  await tap(`${KB} [data-knowledge-category="repairs"]`);
  await p.waitForSelector(`${KB} .knowledge-heading`);
  await tap(`${KB} [data-knowledge-article="fixture-route-choice"]`);
  await p.waitForSelector(`${KB} [data-knowledge-reader="fixture-route-choice"]`);
  const fromCategory = await p.evaluate((KB) => document.querySelector(`${KB} .knowledge-back`)?.textContent.trim(), KB);
  ck(tag, 'category -> article: back says Repairs', /REPAIRS$/.test(fromCategory), fromCategory);
  await tap(`${KB} [data-knowledge-reader] [data-knowledge-article="fixture-seat-removal"]`);
  await p.waitForSelector(`${KB} [data-knowledge-reader="fixture-seat-removal"]`);
  ck(tag, 'related link opens the other article', true);
  await tap(`${KB} .knowledge-back`);
  await p.waitForSelector(`${KB} .knowledge-heading`);
  const heading = await p.$eval(`${KB} .knowledge-heading`, (e) => e.textContent);
  ck(tag, 'back from the related article returns to Repairs', heading === 'Repairs', heading);

  await tap(`${KB} .workshop-tool-head [data-workshop-tool-back]`);
  await p.waitForSelector('#workshopToolsList:not([hidden])');
  const returned = await p.evaluate(() => ({ cardHidden: document.getElementById('workshopToolKnowledge').hidden, emptied: !document.getElementById('knowledgeHost').children.length }));
  ck(tag, 'Workshop back closes the Knowledge Base and returns to the tool list', returned.cardHidden && returned.emptied, returned);
  await tap('[data-workshop-tool-open="knowledge"]');
  await p.waitForSelector(`${KB}:not([hidden]) [data-knowledge-category]`);
  const reopened = await p.$eval(`${KB} [data-knowledge-search]`, (e) => e.value);
  ck(tag, 'reopening starts fresh at the category home', reopened === '', reopened);
  ck(tag, 'no page errors', D.errors.length === 0, D.errors);
  await D.context.close();
}

(async () => {
  const playwright = h.playwright;
  const db = await h.createDatabase(root);
  // A temporary copy of Studio with a synthetic local review file: drafts appear only through that git-ignored file.
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-kb-app-'));
  fs.cpSync(root, site, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)(?:[\\/]|$)/.test(src.slice(root.length)) });
  fs.writeFileSync(path.join(site, 'js/knowledge-drafts.local.js'), localReviewSource({ articles: fixture.articles }));
  const server = await h.serveRoot(() => site);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.webkit.launch();
  try {
    for (const device of [{ tag: 'iphone-390', width: 390, mobile: true }, { tag: 'iphone-320', width: 320, mobile: true }, { tag: 'desktop-1280', width: 1280, mobile: false }]) {
      await run(browser, base, db, device);
    }
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(site, { recursive: true, force: true });
  }
  console.log(`knowledge base browser: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
