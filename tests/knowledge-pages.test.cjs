// Q42b: static public Knowledge Base pages generated from the same articles Studio shows (no browser).
// Real content: js/knowledge-base.js ships verified articles only (none yet), so nothing is published. Proof: synthetic
// fixture articles (tests/fixtures) marked verified in memory. Nothing is written to the repository by these tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const kb = require('../js/knowledge-base.js');
const gen = require('../scripts/build-knowledge-pages.cjs');
const fixture = require('./fixtures/knowledge-fixture.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PROOF = 'fixture-layout-method';
const SECOND = 'fixture-route-choice';
const DRAFT = 'fixture-seat-removal';

// The fixture articles with some marked verified (in memory only).
function verifiedCopy(ids = [PROOF, SECOND]) {
  return { ...kb, ARTICLES: fixture.verified(ids) };
}
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<head>[\s\S]*?<\/head>/, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const meta = (html, re) => (html.match(re) || [])[1];

test('real content: nothing verified yet — no pages, sitemap lists only Studio itself', () => {
  assert.equal(kb.ARTICLES.length, 0);
  const files = gen.generate(kb);
  assert.deepEqual(Object.keys(files), ['sitemap.xml']);
  assert.doesNotMatch(files['sitemap.xml'], /knowledge/);
  assert.equal(fs.existsSync(path.join(root, 'knowledge')), false, 'no public /knowledge/ folder while every article is a draft');
});

test('committed sitemap and pages match the generator exactly (run scripts/build-knowledge-pages.cjs)', () => {
  const files = gen.generate(kb);
  for (const [rel, content] of Object.entries(files)) assert.equal(read(rel), content, `${rel} is out of date`);
});

test('every article has a stable, URL-safe id and a YYYY-MM-DD updated date', () => {
  for (const a of [...kb.ARTICLES, ...fixture.articles]) {
    assert.match(a.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(a.updated, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test('proof: a verified article becomes a crawlable page with readable text, metadata and canonical URL', () => {
  const files = gen.generate(verifiedCopy([PROOF]));
  const page = files[`knowledge/${PROOF}/index.html`];
  const a = fixture.articles.find((x) => x.id === PROOF);
  assert.ok(page);
  assert.match(page, /^<!doctype html>\n<html lang="en">/);
  assert.equal(meta(page, /<title>([^<]+)<\/title>/), `${a.title} | K-Labs Studio`);
  assert.equal(meta(page, /<meta name="description" content="([^"]+)"/), gen.escapeHtml(a.summary));
  assert.equal(meta(page, /<link rel="canonical" href="([^"]+)"/), `https://studio.klabs.co.nz/knowledge/${PROOF}/`);
  assert.match(page, /<meta name="robots" content="index, follow" \/>/);
  // Readable without JavaScript: the whole article is in the HTML.
  const text = textOf(page);
  assert.ok(text.includes(a.title) && text.includes(a.summary) && text.includes(a.source));
  for (const s of a.sections) {
    assert.ok(text.includes(s.heading), s.heading);
    for (const b of s.blocks) for (const t of b.items || [b.text]) assert.ok(text.includes(t), t.slice(0, 40));
  }
  // Semantic structure: one h1, section h2s, numbered steps in an ol.
  assert.equal(page.match(/<h1\b/g).length, 1);
  assert.equal((page.match(/<h2 class="knowledge-article__heading">/g) || []).length, a.sections.length);
  assert.match(page, /<main[\s\S]*<article class="knowledge-article">[\s\S]*<\/article>[\s\S]*<\/main>/);
  assert.match(page, /<nav class="knowledge-crumbs" aria-label="Breadcrumb">/);
  // The only script is structured data, and it is valid.
  const scripts = page.match(/<script[^>]*>/g);
  assert.deepEqual(scripts, ['<script type="application/ld+json">']);
  const ld = JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const [article, crumbs] = ld['@graph'];
  assert.equal(article['@type'], 'Article');
  assert.equal(article.headline, a.title);
  assert.equal(article.dateModified, a.updated);
  assert.deepEqual(crumbs.itemListElement.map((i) => i.item), ['https://studio.klabs.co.nz/knowledge/',
    'https://studio.klabs.co.nz/knowledge/category/techniques/', `https://studio.klabs.co.nz/knowledge/${PROOF}/`]);
  // Breadcrumb links to the topic page; the date reads naturally; a link to more in the same topic closes the page.
  assert.match(page, /<a href="\/knowledge\/">Knowledge Base<\/a><span aria-hidden="true">›<\/span><a href="\/knowledge\/category\/techniques\/">Techniques<\/a>/);
  assert.match(page, /Updated <time datetime="2026-11-27">27 November 2026<\/time>/);
  assert.match(page, /<a class="knowledge-more" href="\/knowledge\/category\/techniques\/">More in Techniques ›<\/a>/);
  // No draft wording on a published page.
  assert.doesNotMatch(page, /Draft · Unverified|knowledge-status/);
});

test('titles, descriptions and canonical URLs are unique across the published pages', () => {
  const files = gen.generate(verifiedCopy());
  const pages = Object.entries(files).filter(([f]) => f.endsWith('.html'));
  assert.equal(pages.length, 5); // landing, two topic pages, two articles
  for (const re of [/<title>([^<]+)</, /<meta name="description" content="([^"]+)"/, /<link rel="canonical" href="([^"]+)"/]) {
    const values = pages.map(([, html]) => meta(html, re));
    assert.equal(new Set(values).size, values.length, String(re));
  }
});

test('internal links resolve: every href and src points at a generated page or an existing site file', () => {
  const files = gen.generate(verifiedCopy());
  const exists = (url) => {
    const p = url.replace(/^https:\/\/studio\.klabs\.co\.nz/, '');
    if (p === '/') return fs.existsSync(path.join(root, 'index.html'));
    const rel = p.slice(1);
    return files[rel] !== undefined || files[`${rel}index.html`] !== undefined || fs.existsSync(path.join(root, rel));
  };
  let count = 0;
  for (const [f, html] of Object.entries(files)) {
    if (!f.endsWith('.html')) continue;
    for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      count++;
      assert.match(url, /^(\/|https:\/\/studio\.klabs\.co\.nz\/)/, `${f}: ${url} is not a site path`);
      assert.ok(exists(url), `${f}: ${url} does not resolve`);
    }
  }
  assert.ok(count > 15);
});

test('drafts are never linked: related links and the index show verified articles only', () => {
  const files = gen.generate(verifiedCopy([PROOF, SECOND]));
  const all = Object.values(files).join('\n');
  assert.doesNotMatch(all, /fixture-seat-removal|taking off a test reel seat/i); // still a draft
  const rebuild = files[`knowledge/${SECOND}/index.html`];
  assert.doesNotMatch(rebuild, /Related articles/); // its only related article is a draft
  const index = files['knowledge/index.html'];
  assert.match(index, /href="\/knowledge\/fixture-layout-method\/"/);
  assert.match(index, /href="\/knowledge\/fixture-route-choice\/"/);
  assert.match(index, /href="\/knowledge\/category\/techniques\/"[\s\S]*?Techniques<\/h3>[\s\S]*?1 article</);
  assert.doesNotMatch(index, /FAQs|Troubleshooting|category\/faqs/); // empty topics get no row and no page
  assert.equal(files['knowledge/category/faqs/index.html'], undefined);
});

test('sitemap lists exactly Studio, the index and the verified articles, with lastmod', () => {
  const sm = gen.generate(verifiedCopy())['sitemap.xml'];
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, ['https://studio.klabs.co.nz/', 'https://studio.klabs.co.nz/knowledge/',
    'https://studio.klabs.co.nz/knowledge/category/techniques/', 'https://studio.klabs.co.nz/knowledge/category/repairs/',
    'https://studio.klabs.co.nz/knowledge/fixture-route-choice/', 'https://studio.klabs.co.nz/knowledge/fixture-layout-method/']);
  assert.equal((sm.match(/<lastmod>2026-11-27<\/lastmod>/g) || []).length, 5);
  assert.match(read('robots.txt'), /Sitemap: https:\/\/studio\.klabs\.co\.nz\/sitemap\.xml/);
});

test('text is escaped, never interpreted as markup', () => {
  const evil = verifiedCopy([PROOF]);
  evil.ARTICLES = evil.ARTICLES.map((a) => (a.id === PROOF ? { ...a, title: 'A <script>x</script> & "B"', summary: '</title><b>' } : a));
  const page = gen.generate(evil)[`knowledge/${PROOF}/index.html`];
  assert.doesNotMatch(page, /<script>x|<b>|<\/title><b>/);
  assert.match(page, /A &lt;script&gt;x&lt;\/script&gt; &amp; &quot;B&quot;/);
  assert.throws(() => gen.generate({ ...kb, ARTICLES: [{ ...fixture.articles[0], id: 'Bad Id', status: 'verified' }] }), /Invalid/);
  assert.throws(() => gen.generate({ ...kb, ARTICLES: [{ ...fixture.articles[0], id: 'category', status: 'verified' }] }), /reserved/);
});

test('write(): publishing then un-publishing removes only the pages the generator made', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-kb-pages-'));
  try {
    fs.mkdirSync(path.join(dir, 'knowledge'));
    fs.writeFileSync(path.join(dir, 'knowledge', 'keep.txt'), 'not generated');
    gen.write(dir, gen.generate(verifiedCopy()));
    assert.ok(fs.existsSync(path.join(dir, `knowledge/${PROOF}/index.html`)));
    gen.write(dir, gen.generate(kb)); // the article goes back to draft
    assert.equal(fs.existsSync(path.join(dir, `knowledge/${PROOF}`)), false);
    assert.equal(fs.existsSync(path.join(dir, 'knowledge/index.html')), false);
    assert.equal(fs.existsSync(path.join(dir, 'knowledge/category')), false, 'emptied topic folders removed');
    assert.ok(fs.existsSync(path.join(dir, 'knowledge/keep.txt')), 'unrelated file kept');
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8'), /knowledge/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generator needs nothing installed (Node built-ins only)', () => {
  const src = read('scripts/build-knowledge-pages.cjs');
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ['node:fs', 'node:path']);
});

test('one shared stylesheet: Studio and the public pages both load css/knowledge.css; studio.css has no copy', () => {
  assert.match(read('index.html'), /href="css\/studio\.css" \/>\n\s*<link rel="stylesheet" href="css\/knowledge\.css" \/>/);
  assert.match(read('service-worker.js'), /'css\/knowledge\.css'/);
  assert.doesNotMatch(read('css/studio.css'), /\.knowledge-/);
  const page = gen.generate(verifiedCopy([PROOF]))[`knowledge/${PROOF}/index.html`];
  assert.match(page, /href="\/css\/theme\.css" \/>\n\s*<link rel="stylesheet" href="\/css\/layout\.css" \/>\n\s*<link rel="stylesheet" href="\/css\/studio\.css" \/>\n\s*<link rel="stylesheet" href="\/css\/knowledge\.css" \/>/);
  assert.doesNotMatch(page, /style=|<style/);
});

// Runs the real service worker's fetch handler: Studio's offline shell is unchanged, /knowledge/ goes to the network.
test('offline: the service worker still serves Studio from its cache but leaves /knowledge/ pages to the network', () => {
  const handlers = {};
  const self = { registration: { scope: 'https://studio.klabs.co.nz/' }, addEventListener: (type, fn) => { handlers[type] = fn; }, clients: {}, skipWaiting() {} };
  const caches = { open: () => Promise.resolve({ match: () => Promise.resolve(null), put: () => Promise.resolve() }), keys: () => Promise.resolve([]), match: () => Promise.resolve(null) };
  vm.runInNewContext(read('service-worker.js'), { self, caches, URL, Promise, fetch: () => Promise.reject(new Error('offline')), console });
  const respond = (url, mode = 'navigate') => {
    let answered = false;
    handlers.fetch({ request: { method: 'GET', url, mode }, respondWith: (p) => { answered = true; p.catch(() => {}); } });
    return answered;
  };
  assert.equal(respond('https://studio.klabs.co.nz/'), true);
  assert.equal(respond('https://studio.klabs.co.nz/index.html'), true);
  assert.equal(respond('https://studio.klabs.co.nz/css/knowledge.css', 'no-cors'), true);
  assert.equal(respond('https://studio.klabs.co.nz/knowledge/'), false);
  assert.equal(respond(`https://studio.klabs.co.nz/knowledge/${PROOF}/`), false);
  assert.equal(respond('https://studio.klabs.co.nz/knowledgeable'), true); // only the /knowledge/ folder is excluded
});

test('topic pages: every published article in the topic, its intro as heading text and description, canonical, breadcrumb', () => {
  const files = gen.generate(verifiedCopy());
  const page = files['knowledge/category/techniques/index.html'];
  const c = kb.CATEGORIES.find((x) => x.id === 'techniques');
  assert.equal(meta(page, /<title>([^<]+)<\/title>/), 'Techniques | K-Labs Rod Building Knowledge Base');
  assert.equal(meta(page, /<meta name="description" content="([^"]+)"/), gen.escapeHtml(c.intro));
  assert.equal(meta(page, /<link rel="canonical" href="([^"]+)"/), 'https://studio.klabs.co.nz/knowledge/category/techniques/');
  assert.match(page, /<h1>Techniques<\/h1>/);
  assert.match(page, /<p class="knowledge-count">1 article<\/p>/);
  assert.match(page, /href="\/knowledge\/fixture-layout-method\/"/);
  assert.doesNotMatch(page, /fixture-route-choice/); // another topic
  assert.match(page, /<nav class="knowledge-crumbs" aria-label="Breadcrumb"><a href="\/knowledge\/">Knowledge Base<\/a><\/nav>/);
});

test('landing: search field hidden until JavaScript runs, topics and latest articles readable without it', () => {
  const index = gen.generate(verifiedCopy())['knowledge/index.html'];
  assert.match(index, /<form class="knowledge-public-search" role="search" action="\/knowledge\/" method="get" data-knowledge-public-search hidden>/);
  assert.match(index, /<input class="studio-components-shell__search" type="search" name="q"[^>]*aria-label="Search the Knowledge Base"/);
  assert.match(index, /<script src="\/js\/knowledge-base\.js" defer><\/script>\n\s*<script src="\/js\/knowledge-public\.js" defer><\/script>/);
  const text = textOf(index);
  for (const t of ['Topics', 'Latest articles', 'Techniques', 'Repairs', 'Fixture: laying out a test pattern']) assert.ok(text.includes(t), t);
  assert.equal(meta(index, /<title>([^<]+)<\/title>/), 'Rod Building Knowledge Base | K-Labs Studio');
});

test('public search reuses the Studio search and highlighter, shows verified articles only, text only', () => {
  const src = read('js/knowledge-public.js');
  assert.match(src, /KB\.search\(query\)\.filter\(\(r\)=>r\.article\.status==='verified'\)/);
  assert.match(src, /KB\.marked\(/);
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.equal(typeof kb.marked, 'function');
  // The Studio app does not load the public script.
  assert.doesNotMatch(read('js/public-entry.js'), /knowledge-public/);
  assert.doesNotMatch(read('index.html'), /knowledge-public\.js/);
});

test('article wording: clear, search-friendly titles and summaries; no stock filler phrases', () => {
  const titles = new Set();
  const summaries = new Set();
  const filler = /\b(delve|unlock|elevate|seamless(?:ly)?|game[- ]changer|ultimate guide|comprehensive guide|in this article|whether you're|look no further|dive into|it's important to note|in today's|navigate the|tapestry|embark)\b/i;
  for (const a of [...kb.ARTICLES, ...fixture.articles]) {
    assert.ok(a.title.length >= 20 && a.title.length <= 60, `${a.id} title length ${a.title.length}`);
    assert.ok(a.summary.length >= 70 && a.summary.length <= 160, `${a.id} summary length ${a.summary.length}`);
    assert.ok(!titles.has(a.title) && !summaries.has(a.summary), a.id);
    titles.add(a.title); summaries.add(a.summary);
    assert.doesNotMatch(JSON.stringify(a), filler, a.id);
    assert.ok(!a.summary.toLowerCase().startsWith(a.title.toLowerCase()), `${a.id}: summary repeats the title`);
  }
  for (const c of kb.CATEGORIES) assert.ok(c.intro.length >= 50 && c.intro.length <= 160, `${c.id} intro`);
});

test('Knowledge Base styles use Studio\'s global tokens only: no literal colours, radii or spacing scale of their own', () => {
  const css = read('css/knowledge.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'literal hex colour');
  assert.doesNotMatch(css, /rgba?\(\s*\d/, 'literal rgb colour');
  for (const [, value] of css.matchAll(/border-radius:([^;}]+)/g)) assert.match(value, /^(var\(--ds-radius-(sm|md|lg)\)|0 var\(--ds-radius-md\) var\(--ds-radius-md\) 0|999px)$/, value);
  for (const [, value] of css.matchAll(/(?:^|[;{])gap:([^;}]+)/g)) assert.match(value, /var\(--ds-space-\d\)/, `gap ${value}`);
  for (const token of new Set(css.match(/var\(--[a-z0-9-]+\)/g))) {
    const name = token.slice(4, -1);
    assert.ok(read('css/theme.css').includes(`${name}:`) || read('css/studio.css').includes(`${name}:`), `${name} is not a global token`);
  }
});

test('dates read naturally', () => {
  assert.equal(gen.humanDate('2026-11-27'), '27 November 2026');
  assert.equal(gen.humanDate('2027-01-05'), '5 January 2027');
});
