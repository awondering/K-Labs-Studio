#!/usr/bin/env node
// Q42b/Q42c: static public Knowledge Base pages from the SAME articles Studio shows (js/knowledge-base.js).
// Run before committing a content change:   node scripts/build-knowledge-pages.cjs
// Writes, for VERIFIED articles only:
//   /knowledge/                          landing: search (with JavaScript), topics, latest articles
//   /knowledge/category/<category-id>/   every published article in a topic
//   /knowledge/<article-id>/             the article
// and sitemap.xml. Drafts (any status other than 'verified') are never published: no page, no sitemap entry, no link,
// no search result. Plain semantic HTML, readable without JavaScript; Studio's own stylesheets; nothing to install.
// tests/knowledge-pages.test.cjs fails if the committed pages or sitemap differ from what this produces.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SITE = 'https://studio.klabs.co.nz';
const SECTION = '/knowledge/';
const MANIFEST = 'knowledge/.generated-files';
const LATEST = 6;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RESERVED = new Set(['category']);

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const articleUrl = (article) => `${SECTION}${article.id}/`;
const categoryUrl = (category) => `${SECTION}category/${category.id}/`;
const published = (articles) => articles.filter((a) => a.status === 'verified');
const humanDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const jsonLd = (data) => `  <script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function head({ title, description, canonical, type }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${SITE}${canonical}" />
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="K-Labs Studio" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${SITE}${canonical}" />
  <meta name="theme-color" content="#020303" />
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/css/theme.css" />
  <link rel="stylesheet" href="/css/layout.css" />
  <link rel="stylesheet" href="/css/studio.css" />
  <link rel="stylesheet" href="/css/knowledge.css" />`;
}
const topbar = `  <header class="topbar">
    <a class="brand-lockup" href="${SECTION}">
      <img src="/assets/logo.svg" alt="K-Labs" class="brand-mark" />
      <span class="brand-copy"><strong>K-Labs Studio</strong><small>KNOWLEDGE BASE</small></span>
    </a>
  </header>`;
const footer = `    <p class="knowledge-public__studio">Written by K-Labs for rod builders. <a href="/">K-Labs Studio</a> is our custom rod building suite.</p>`;
function breadcrumbLd(trail) {
  return { '@type': 'BreadcrumbList', itemListElement: trail.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${url}` })) };
}

function articleRow(article, categories, readMinutes) {
  const category = categories.find((c) => c.id === article.category);
  return `        <a class="workshop-tool-launch workshop-tool-launch--landing knowledge-row" href="${articleUrl(article)}">
          <h3 class="workshop-tool-launch__title knowledge-row__title">${escapeHtml(article.title)}</h3>
          <span class="workshop-tool-launch__meta">${escapeHtml(article.summary)}</span>
          <span class="knowledge-row__detail">${escapeHtml(category ? category.title : '')} · ${readMinutes(article)} min read</span>
        </a>`;
}
function categoryRow(category, count) {
  return `        <a class="workshop-tool-launch workshop-tool-launch--landing knowledge-row" href="${categoryUrl(category)}">
          <h3 class="workshop-tool-launch__title knowledge-row__title">${escapeHtml(category.title)}</h3>
          <span class="workshop-tool-launch__meta">${escapeHtml(category.meta)}</span>
          <span class="knowledge-row__detail">${plural(count, 'article')}</span>
        </a>`;
}

function block(b, articleId, articleParagraph) {
  if (b.type === 'p') {
    const text = articleParagraph(articleId, b.text).map(({ text, href }) => href
      ? `<a class="knowledge-article__citation" href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
      : escapeHtml(text)).join('');
    return `        <p>${text}</p>`;
  }
  if (b.type === 'caution') return `        <p class="knowledge-article__caution"><strong>Caution. </strong>${escapeHtml(b.text)}</p>`;
  const tag = b.type === 'steps' ? 'ol' : 'ul';
  const cls = b.type === 'steps' ? 'knowledge-article__steps' : 'knowledge-article__list';
  return `        <${tag} class="${cls}">\n${b.items.map((i) => `          <li>${escapeHtml(i)}</li>`).join('\n')}\n        </${tag}>`;
}

function articlePage(article, all, { CATEGORIES, readMinutes, articleParagraph }) {
  const category = CATEGORIES.find((c) => c.id === article.category);
  const related = (article.related || []).map((id) => all.find((a) => a.id === id)).filter(Boolean);
  const title = `${article.title} | K-Labs Studio`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'Article', headline: article.title, description: article.summary, dateModified: article.updated,
        articleSection: category.title, mainEntityOfPage: `${SITE}${articleUrl(article)}`,
        author: { '@type': 'Organization', name: 'K-Labs' }, publisher: { '@type': 'Organization', name: 'K-Labs' } },
      breadcrumbLd([['Knowledge Base', SECTION], [category.title, categoryUrl(category)], [article.title, articleUrl(article)]]),
    ],
  };
  return `${head({ title, description: article.summary, canonical: articleUrl(article), type: 'article' })}
${jsonLd(ld)}
</head>
<body class="knowledge-public">
${topbar}
  <main class="knowledge-public__main">
    <nav class="knowledge-crumbs" aria-label="Breadcrumb"><a href="${SECTION}">Knowledge Base</a><span aria-hidden="true">›</span><a href="${categoryUrl(category)}">${escapeHtml(category.title)}</a></nav>
    <article class="knowledge-article">
      <p class="knowledge-article__kicker">${escapeHtml(category.title)} · ${readMinutes(article)} min read · Updated <time datetime="${escapeHtml(article.updated)}">${humanDate(article.updated)}</time></p>
      <h1 class="knowledge-article__title">${escapeHtml(article.title)}</h1>
      <div class="knowledge-article__brief">
        <span class="knowledge-article__label">In brief</span>
        <p>${escapeHtml(article.summary)}</p>
      </div>
${article.sections.map((s) => `      <section class="knowledge-article__section">
        <h2 class="knowledge-article__heading">${escapeHtml(s.heading)}</h2>
${s.blocks.map((b) => block(b, article.id, articleParagraph)).join('\n')}
      </section>`).join('\n')}
${related.length ? `      <section class="knowledge-article__section">
        <h2 class="knowledge-article__heading">Related articles</h2>
        <div class="knowledge-related">
${related.map((r) => `          <a class="knowledge-related__card" href="${articleUrl(r)}">${escapeHtml(r.title)}</a>`).join('\n')}
        </div>
      </section>
` : ''}    </article>
    <a class="knowledge-more" href="${categoryUrl(category)}">More in ${escapeHtml(category.title)} ›</a>
${footer}
  </main>
</body>
</html>
`;
}

function categoryPage(category, list, { CATEGORIES, readMinutes }) {
  const sorted = [...list].sort((a, b) => a.title.localeCompare(b.title));
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: category.title, description: category.intro, url: `${SITE}${categoryUrl(category)}` },
    breadcrumbLd([['Knowledge Base', SECTION], [category.title, categoryUrl(category)]]),
  ] };
  return `${head({ title: `${category.title} | K-Labs Rod Building Knowledge Base`, description: category.intro, canonical: categoryUrl(category), type: 'website' })}
${jsonLd(ld)}
</head>
<body class="knowledge-public">
${topbar}
  <main class="knowledge-public__main">
    <nav class="knowledge-crumbs" aria-label="Breadcrumb"><a href="${SECTION}">Knowledge Base</a></nav>
    <div class="knowledge-public__intro">
      <h1>${escapeHtml(category.title)}</h1>
      <p>${escapeHtml(category.intro)}</p>
    </div>
    <section class="knowledge-section" aria-label="${escapeHtml(category.title)} articles">
      <p class="knowledge-count">${plural(sorted.length, 'article')}</p>
      <div class="knowledge-list">
${sorted.map((a) => articleRow(a, CATEGORIES, readMinutes)).join('\n')}
      </div>
    </section>
${footer}
  </main>
</body>
</html>
`;
}

function indexPage(articles, { CATEGORIES, readMinutes }) {
  const description = 'Rod building techniques, repairs and answers from K-Labs: practical, step-by-step articles for custom fishing rod builders.';
  const topics = CATEGORIES.map((c) => ({ c, n: articles.filter((a) => a.category === c.id).length })).filter((t) => t.n);
  const latest = [...articles].sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title)).slice(0, LATEST);
  const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'K-Labs Rod Building Knowledge Base', description, url: `${SITE}${SECTION}` };
  return `${head({ title: 'Rod Building Knowledge Base | K-Labs Studio', description, canonical: SECTION, type: 'website' })}
${jsonLd(ld)}
  <script src="/js/knowledge-base.js" defer></script>
  <script src="/js/knowledge-public.js" defer></script>
</head>
<body class="knowledge-public">
${topbar}
  <main class="knowledge-public__main">
    <div class="knowledge-public__intro">
      <h1>Knowledge Base</h1>
      <p>${escapeHtml(description)}</p>
    </div>
    <form class="knowledge-public-search" role="search" action="${SECTION}" method="get" data-knowledge-public-search hidden>
      <input class="studio-components-shell__search" type="search" name="q" placeholder="Search articles" aria-label="Search the Knowledge Base" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" />
      <p class="knowledge-count" role="status" aria-live="polite" data-knowledge-public-status hidden></p>
    </form>
    <div class="knowledge-list" data-knowledge-public-results hidden></div>
    <section class="knowledge-section" aria-labelledby="knowledge-topics" data-knowledge-public-browse>
      <h2 class="knowledge-heading" id="knowledge-topics">Topics</h2>
      <div class="knowledge-list">
${topics.map(({ c, n }) => categoryRow(c, n)).join('\n')}
      </div>
    </section>
    <section class="knowledge-section" aria-labelledby="knowledge-latest" data-knowledge-public-browse>
      <h2 class="knowledge-heading" id="knowledge-latest">Latest articles</h2>
      <div class="knowledge-list">
${latest.map((a) => articleRow(a, CATEGORIES, readMinutes)).join('\n')}
      </div>
    </section>
${footer}
  </main>
</body>
</html>
`;
}

function sitemap(articles, categories) {
  const urls = [{ loc: `${SITE}/` }];
  if (articles.length) {
    const newest = (list) => list.map((a) => a.updated).sort().pop();
    urls.push({ loc: `${SITE}${SECTION}`, lastmod: newest(articles) });
    for (const c of categories) {
      const list = articles.filter((a) => a.category === c.id);
      if (list.length) urls.push({ loc: `${SITE}${categoryUrl(c)}`, lastmod: newest(list) });
    }
    for (const a of articles) urls.push({ loc: `${SITE}${articleUrl(a)}`, lastmod: a.updated });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${escapeHtml(u.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')}
</urlset>
`;
}

// Everything the site should contain for these articles: { 'relative/path': content }.
function generate(kb) {
  const articles = published(kb.ARTICLES);
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  for (const c of kb.CATEGORIES) if (!slug.test(c.id) || !c.intro) throw new Error(`Category ${c.id}: needs a URL-safe id and an intro`);
  const ids = new Set();
  for (const a of articles) {
    if (!slug.test(a.id) || ids.has(a.id) || RESERVED.has(a.id)) throw new Error(`Invalid, reserved or duplicate article id: ${a.id}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.updated || '')) throw new Error(`${a.id}: updated must be YYYY-MM-DD`);
    if (!kb.CATEGORIES.some((c) => c.id === a.category)) throw new Error(`${a.id}: unknown category`);
    ids.add(a.id);
  }
  // Related links point only at published articles; a draft is never linked from a public page.
  const visible = articles.map((a) => ({ ...a, related: (a.related || []).filter((id) => ids.has(id)) }));
  const files = { 'sitemap.xml': sitemap(visible, kb.CATEGORIES) };
  if (visible.length) {
    files['knowledge/index.html'] = indexPage(visible, kb);
    for (const c of kb.CATEGORIES) {
      const list = visible.filter((a) => a.category === c.id);
      if (list.length) files[`knowledge/category/${c.id}/index.html`] = categoryPage(c, list, kb);
    }
    for (const a of visible) files[`knowledge/${a.id}/index.html`] = articlePage(a, visible, kb);
    files[MANIFEST] = Object.keys(files).filter((f) => f.startsWith('knowledge/')).concat(MANIFEST).sort().join('\n') + '\n';
  }
  return files;
}

// Writes the files; removes only pages this script itself generated earlier (listed in the manifest), and then any
// folders under knowledge/ that this left empty.
function write(root, files) {
  const manifestPath = path.join(root, MANIFEST);
  const previous = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean) : [];
  const knowledgeDir = path.join(root, 'knowledge');
  for (const rel of previous) {
    if (!rel.startsWith('knowledge/') || rel.includes('..') || files[rel] !== undefined) continue;
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    for (let dir = path.dirname(abs); dir.startsWith(knowledgeDir) && fs.existsSync(dir) && !fs.readdirSync(dir).length; dir = path.dirname(dir)) fs.rmdirSync(dir);
  }
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
}

module.exports = { SITE, SECTION, MANIFEST, generate, write, escapeHtml, humanDate };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const kb = require(path.join(root, 'js/knowledge-base.js'));
  const files = generate(kb);
  write(root, files);
  const pages = Object.keys(files).filter((f) => f.endsWith('.html'));
  const skipped = kb.ARTICLES.filter((a) => a.status !== 'verified').length;
  console.log(`Knowledge pages: ${pages.length} published (${pages.join(', ') || 'none'}); ${skipped} unverified article(s) skipped (drafts belong in the private store); sitemap.xml updated.`);
}
