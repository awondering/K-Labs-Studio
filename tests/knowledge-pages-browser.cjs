// Q42b public Knowledge Base pages in WebKit with JavaScript OFF (as a crawler or reader-mode sees them), at iPhone 390
// and 320 (touch) and desktop 1280. A temporary copy of the site gets the proof pages (the cross-wrap article and one
// repair article marked verified in memory only; the repository itself is not changed) and is served the way GitHub
// Pages serves it (a folder address returns its index.html). Checks: Studio's styles applied, readable article text,
// no sideways scroll, 44 px touch targets, every link and asset answers, landing -> topic -> article -> breadcrumbs; then
// with JavaScript on, the search: Studio's own search, verified articles only, highlighted, kept on Back.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... node tests/knowledge-pages-browser.cjs [screenshots dir]
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const kb = require('../js/knowledge-base.js');
const articles = require('./fixtures/knowledge-fixture.cjs');
const gen = require('../scripts/build-knowledge-pages.cjs');

const shots = process.argv[2] || '';
if (shots && !(fs.existsSync(shots) && fs.statSync(shots).isDirectory())) throw new Error(`Screenshots folder does not exist: ${shots}`);
const repo = path.join(__dirname, '..');
const PROOF = 'fixture-layout-method';
const SECOND = 'fixture-route-choice';
let passed = 0;
let failed = 0;
function ck(tag, name, ok, detail) {
  if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); }
}

function buildSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-kb-site-'));
  fs.cpSync(repo, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)(?:[\\/]|$)|knowledge-drafts\.local\.js$/.test(src.slice(repo.length)) });
  // Synthetic fixture articles (not real drafts) stand in as the verified content, in the pages and in the copy's
  // article file, so the public search matches the pages. The repository itself is not changed.
  const verified = articles.verified([PROOF, SECOND]).filter((a) => a.status === 'verified');
  gen.write(dir, gen.generate({ ...kb, ARTICLES: verified }));
  const kbFile = path.join(dir, 'js/knowledge-base.js');
  const source = fs.readFileSync(kbFile, 'utf8');
  const next = source.replace(/const ARTICLES=Object\.freeze\(\[[\s\S]*?\n  \]\);/, () => `const ARTICLES=Object.freeze(${JSON.stringify(verified)});`);
  if (next === source) throw new Error('could not place the fixture articles in the test copy');
  fs.writeFileSync(kbFile, next);
  return dir;
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.png': 'image/png', '.json': 'application/json' };
function serve(dir) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.resolve(dir, '.' + p);
    if (!f.startsWith(dir + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function measure(p, mobile) {
  return p.evaluate((mobile) => {
    const targets = [...document.querySelectorAll('a')].filter((e) => e.offsetParent && !e.closest('.knowledge-public__studio'));
    const small = targets.map((e) => ({ t: e.textContent.trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => mobile && x.h < 44);
    const body = getComputedStyle(document.body);
    const para = document.querySelector('.knowledge-article__section p, .knowledge-article li, .knowledge-public__intro p');
    return {
      overflow: document.scrollingElement.scrollWidth - window.innerWidth,
      small,
      themed: body.backgroundImage.includes('gradient') && body.color !== 'rgb(0, 0, 0)',
      fontSize: parseFloat(getComputedStyle(para).fontSize),
      h1: document.querySelector('h1')?.textContent,
      links: [...document.querySelectorAll('a[href], link[href], img[src]')].map((e) => e.getAttribute('href') || e.getAttribute('src')),
    };
  }, mobile);
}

async function run(browser, base, { tag, width, mobile }) {
  const a = articles.articles.find((x) => x.id === PROOF);
  const shot = async (p, name) => { if (shots) await p.screenshot({ path: path.join(shots, `${tag}-public-${name}.png`), fullPage: true }); };

  // 1. JavaScript OFF: what a crawler, reader mode or a slow connection sees.
  let context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, javaScriptEnabled: false });
  const bad = [];
  context.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  context.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));
  let p = await context.newPage();
  let tap = (sel) => Promise.all([p.waitForNavigation(), mobile ? p.tap(sel) : p.click(sel)]);

  await p.goto(`${base}/knowledge/`);
  let m = await measure(p, mobile);
  const landing = await p.evaluate(() => ({
    searchShown: !!document.querySelector('[data-knowledge-public-search]').offsetParent,
    topics: [...document.querySelectorAll('[aria-labelledby="knowledge-topics"] a')].map((e) => e.getAttribute('href')),
    latest: [...document.querySelectorAll('[aria-labelledby="knowledge-latest"] a')].map((e) => e.getAttribute('href')),
    titleWeight: getComputedStyle(document.querySelector('.knowledge-row__title')).fontWeight,
  }));
  ck(tag, 'row titles use Studio\'s row title weight (headings are not browser-bold)', landing.titleWeight === '400', landing.titleWeight);
  ck(tag, 'landing (no JS): heading, topics and latest articles listed, search field hidden, no drafts', m.h1 === 'Knowledge Base' && !landing.searchShown
    && landing.topics.join() === '/knowledge/category/techniques/,/knowledge/category/repairs/'
    && landing.latest.sort().join() === `/knowledge/${PROOF}/,/knowledge/${SECOND}/` && !(await p.content()).includes('fixture-seat-removal'), { h1: m.h1, ...landing });
  ck(tag, `landing: Studio styles, ${mobile ? '44 px touch targets, ' : ''}no sideways scroll`, m.themed && !m.small.length && m.overflow <= 0, m);
  await shot(p, '1-landing-nojs');

  await tap('a.knowledge-row[href="/knowledge/category/techniques/"]');
  m = await measure(p, mobile);
  const topic = await p.$$eval('.knowledge-list a', (r) => r.map((e) => e.getAttribute('href')));
  ck(tag, 'topic page: heading, intro, its article; touch targets; no sideways scroll', m.h1 === 'Techniques' && topic.join() === `/knowledge/${PROOF}/`
    && m.themed && !m.small.length && m.overflow <= 0, { m, topic });
  await shot(p, '2-topic');

  await tap(`a.knowledge-row[href="/knowledge/${PROOF}/"]`);
  m = await measure(p, mobile);
  const text = await p.evaluate(() => document.querySelector('article').innerText);
  ck(tag, 'article (no JS): title, summary, every section and step readable', m.h1 === a.title && text.includes(a.summary)
    && a.sections.every((s) => text.toUpperCase().includes(s.heading.toUpperCase()) && s.blocks.every((b) => (b.items || [b.text]).every((t) => text.includes(t)))), { h1: m.h1 });
  ck(tag, `article: reading text >= 15 px, ${mobile ? '44 px touch targets, ' : ''}no sideways scroll`, m.themed && m.fontSize >= 15 && !m.small.length && m.overflow <= 0, m);
  ck(tag, 'article: canonical is its own permanent address; date reads 27 November 2026',
    (await p.getAttribute('link[rel=canonical]', 'href')) === `https://studio.klabs.co.nz/knowledge/${PROOF}/` && text.toLowerCase().includes('27 november 2026'));
  await shot(p, '3-article');
  await tap('.knowledge-crumbs a[href="/knowledge/category/techniques/"]');
  ck(tag, 'breadcrumb topic link returns to the topic page', new URL(p.url()).pathname === '/knowledge/category/techniques/');
  await tap('.knowledge-crumbs a[href="/knowledge/"]');
  ck(tag, 'breadcrumb returns to the Knowledge Base landing', new URL(p.url()).pathname === '/knowledge/');

  const all = new Set();
  for (const u of ['/knowledge/', '/knowledge/category/techniques/', '/knowledge/category/repairs/', `/knowledge/${PROOF}/`, `/knowledge/${SECOND}/`]) {
    await p.goto(base + u);
    (await measure(p, mobile)).links.forEach((l) => all.add(l.replace('https://studio.klabs.co.nz', '')));
  }
  const status = [];
  for (const l of all) status.push([l, (await p.request.get(base + l)).status()]);
  ck(tag, `all ${all.size} internal links and assets answer 200`, status.every(([, s]) => s === 200), status.filter(([, s]) => s !== 200));
  ck(tag, 'no failed requests (no JS)', bad.length === 0, bad);
  await context.close();

  // 2. JavaScript ON: the search field appears and uses Studio's search, limited to verified articles.
  context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  p = await context.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  tap = (sel) => Promise.all([p.waitForNavigation(), mobile ? p.tap(sel) : p.click(sel)]);
  await p.goto(`${base}/knowledge/`);
  await p.waitForSelector('[data-knowledge-public-search]:not([hidden]) input');
  const field = await p.$eval('[data-knowledge-public-search] input', (e) => ({ font: parseFloat(getComputedStyle(e).fontSize), h: e.getBoundingClientRect().height, top: e.getBoundingClientRect().top }));
  ck(tag, 'search (JS): field shown near the top, 16 px text (no iPhone zoom), >= 44 px tall', field.font >= 16 && field.h >= 44 && field.top < 300, field);
  await p.fill('[data-knowledge-public-search] input', 'crosswrap');
  const found = await p.evaluate(() => ({
    status: document.querySelector('[data-knowledge-public-status]').textContent,
    rows: [...document.querySelectorAll('[data-knowledge-public-results] a')].map((e) => e.getAttribute('href')),
    marks: document.querySelectorAll('[data-knowledge-public-results] .knowledge-mark').length,
    browseHidden: [...document.querySelectorAll('[data-knowledge-public-browse]')].every((e) => !e.offsetParent),
    url: location.search,
  }));
  ck(tag, 'search "crosswrap": one result, matches marked, topics hidden, query in the address', found.status === '1 article for “crosswrap”'
    && found.rows.join() === `/knowledge/${PROOF}/` && found.marks > 0 && found.browseHidden && found.url === '?q=crosswrap', found);
  m = await measure(p, mobile);
  ck(tag, `search results: ${mobile ? '44 px touch targets, ' : ''}no sideways scroll`, !m.small.length && m.overflow <= 0, m);
  await shot(p, '4-search');
  await tap(`[data-knowledge-public-results] a[href="/knowledge/${PROOF}/"]`);
  await Promise.all([p.waitForNavigation(), p.goBack()]);
  await p.waitForSelector('[data-knowledge-public-results] a');
  ck(tag, 'Back from an article returns to the same search', (await p.$eval('[data-knowledge-public-search] input', (e) => e.value)) === 'crosswrap');
  await p.fill('[data-knowledge-public-search] input', 'reel seat');
  const reel = await p.$$eval('[data-knowledge-public-results] a', (r) => r.map((e) => e.getAttribute('href')));
  ck(tag, 'search never shows a draft ("reel seat" finds only the verified repair article)', reel.join() === `/knowledge/${SECOND}/`, reel);
  await p.fill('[data-knowledge-public-search] input', 'zzqx');
  const none = await p.$eval('[data-knowledge-public-status]', (e) => e.textContent);
  await p.fill('[data-knowledge-public-search] input', '');
  const cleared = await p.evaluate(() => [...document.querySelectorAll('[data-knowledge-public-browse]')].every((e) => !!e.offsetParent) && location.search === '');
  ck(tag, 'no match explains what to do; clearing restores topics', /^No articles match “zzqx”/.test(none) && cleared, { none, cleared });
  ck(tag, 'no page errors (JS)', errors.length === 0, errors);
  await context.close();
}

// The REAL published content, exactly as committed (generated pages + js/knowledge-base.js), served like GitHub Pages.
function realSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-kb-real-'));
  fs.cpSync(repo, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)(?:[\\/]|$)|knowledge-drafts\.local\.js$/.test(src.slice(repo.length)) });
  return dir;
}

async function runReal(browser, base, { tag, width, mobile }) {
  const shot = async (p, name) => { if (shots) await p.screenshot({ path: path.join(shots, `${tag}-real-${name}.png`), fullPage: true }); };
  for (const a of kb.ARTICLES) {
    const url = `/knowledge/${a.id}/`;
    let context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, javaScriptEnabled: false });
    const bad = [];
    context.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
    let p = await context.newPage();
    await p.goto(base + url);
    const m = await measure(p, mobile);
    const text = await p.evaluate(() => document.querySelector('article').innerText);
    const meta = await p.evaluate(() => ({
      canonical: document.querySelector('link[rel=canonical]')?.href, robots: document.querySelector('meta[name=robots]')?.content,
      title: document.title, description: document.querySelector('meta[name=description]')?.content,
      draft: !!document.querySelector('.knowledge-status, .knowledge-article__draft'),
    }));
    const every = a.sections.every((s) => text.toUpperCase().includes(s.heading.toUpperCase()) && s.blocks.every((b) => (b.items || [b.text]).every((t) => text.includes(t))));
    ck(tag, `REAL ${a.id} (no JS): title, summary and every section, step and example readable`, m.h1 === a.title && text.includes(a.summary) && every, { h1: m.h1 });
    ck(tag, 'REAL: canonical, indexable, unique title and description, no draft label', meta.canonical === `https://studio.klabs.co.nz${url}` && meta.robots === 'index, follow'
      && meta.title === `${a.title} | K-Labs Studio` && meta.description === a.summary && !meta.draft, meta);
    ck(tag, `REAL: Studio styles, reading text >= 15 px, ${mobile ? '44 px touch targets, ' : ''}no sideways scroll`, m.themed && m.fontSize >= 15 && !m.small.length && m.overflow <= 0, m);
    await shot(p, `article-${a.id}`);
    const status = [];
    for (const u of [url, '/knowledge/', `/knowledge/category/${a.category}/`, '/sitemap.xml']) {
      await p.goto(base + u);
      if (u.endsWith('/')) for (const l of (await measure(p, mobile)).links) status.push([l, (await p.request.get(base + l.replace('https://studio.klabs.co.nz', ''))).status()]);
    }
    const sitemap = await (await p.request.get(`${base}/sitemap.xml`)).text();
    ck(tag, `REAL: every link on the article, landing and topic page answers 200 (${status.length} checked); in the sitemap`,
      status.every(([, s]) => s === 200) && sitemap.includes(`<loc>https://studio.klabs.co.nz${url}</loc>`) && bad.length === 0, { bad: status.filter(([, s]) => s !== 200), failed: bad });
    await p.goto(`${base}/knowledge/category/${a.category}/`);
    ck(tag, 'REAL: listed on its topic page and the landing page (no JS)', (await p.$$eval('.knowledge-list a', (r) => r.map((e) => e.getAttribute('href')))).includes(url)
      && await (async () => { await p.goto(`${base}/knowledge/`); return (await p.$$eval('a', (r) => r.map((e) => e.getAttribute('href')))).includes(url); })());
    await context.close();

    context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
    p = await context.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`${base}/knowledge/`);
    await p.waitForSelector('[data-knowledge-public-search]:not([hidden]) input');
    const found = [];
    for (const q of [...(a.aliases || []).slice(0, 2), a.tags[0]]) {
      await p.fill('[data-knowledge-public-search] input', q);
      found.push([q, await p.$$eval('[data-knowledge-public-results] a', (r) => r.map((e) => e.getAttribute('href')))]);
    }
    // Its own questions rank it first; a shared keyword (tags[0]) must find it among the results.
    ck(tag, 'REAL search (JS): its merged questions rank it first; its keyword finds it', found.slice(0, -1).every(([, r]) => r[0] === url) && found.at(-1)[1].includes(url), found);
    await shot(p, `search-${a.id}`);
    ck(tag, 'REAL: no page errors (JS)', errors.length === 0, errors);
    await context.close();
  }
}

(async () => {
  const dir = buildSite();
  const server = await serve(dir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const real = realSite();
  const realServer = await serve(real);
  const realBase = `http://127.0.0.1:${realServer.address().port}`;
  const browser = await playwright.webkit.launch();
  try {
    for (const device of [{ tag: 'iphone-390', width: 390, mobile: true }, { tag: 'iphone-320', width: 320, mobile: true }, { tag: 'desktop-1280', width: 1280, mobile: false }]) {
      await run(browser, base, device);
      await runReal(browser, realBase, device);
    }
  } finally {
    await browser.close();
    server.close();
    realServer.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(real, { recursive: true, force: true });
  }
  console.log(`knowledge pages browser: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
