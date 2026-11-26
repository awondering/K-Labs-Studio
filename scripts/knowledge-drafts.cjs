#!/usr/bin/env node
// Q42d: draft Knowledge Base content is kept OUT of the website. GitHub Pages serves every committed file, so draft
// articles live in a private store (default ~/K-Labs-Planning/knowledge/drafts.json, in the private planning repo), never
// in this repository. Only VERIFIED articles are copied into js/knowledge-base.js, which feeds Studio and the public pages.
//
//   node scripts/knowledge-drafts.cjs import <batch.json> [--store <drafts.json>]
//        Maps a neutral content batch into the Knowledge Base article format and merges it into the store. The batch's
//        own folder holds import.json (private): { "batch", "updated", "topicCategories": {topic: category id},
//        "merges": {batch id: existing id}, "distinct": [[batch id, existing id]], "additions": {existing id: [...]}}.
//        Every item stays a draft. The import stops if a likely duplicate is not resolved in import.json.
//   node scripts/knowledge-drafts.cjs check [--store <drafts.json>]
//        Validates the store and proves zero leakage: no draft id, title or summary in any file this repository would
//        commit, nor in the generated public pages and sitemap.
//   node scripts/knowledge-drafts.cjs dev [--store <drafts.json>]
//        Writes js/knowledge-drafts.local.js (git-ignored, never deployed) so Studio on this computer shows the drafts,
//        labelled Draft, for review. Studio requests it only on a local address.
// Node built-ins only. No content lives in this file.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_STORE = path.join(os.homedir(), 'K-Labs-Planning', 'knowledge', 'drafts.json');
const LOCAL_FILE = 'js/knowledge-drafts.local.js';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BLOCK_TYPES = new Set(['p', 'caution', 'list', 'steps']);
const FILLER = /\b(delve|unlock|elevate|seamless(?:ly)?|game[- ]changer|ultimate guide|comprehensive guide|in this article|whether you're|look no further|dive into|it's important to note|in today's|navigate the|tapestry|embark)\b/i;
const STOP = new Set('a an and are as at be by can do does for from how i in is it my of on or should the to what when where which why with you your'.split(' '));

const words = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !STOP.has(w));
const unique = (list) => [...new Set(list)];
const question = (text) => String(text || '').trim().replace(/\s*\?$/, '');

// ---------- mapping ----------
// One batch item -> one Knowledge Base article (always a draft). The answer's first sentence is the summary, which
// Studio shows as "In brief", so the body carries the rest of the answer and the caution.
function mapBatchArticle(item, config) {
  const category = config.topicCategories[item.category];
  if (!category) throw new Error(`${item.id}: no category mapping for topic "${item.category}"`);
  if (item.status !== 'draft' || item.public_page !== false) throw new Error(`${item.id}: a batch item must arrive as a draft that is not public`);
  const answer = String(item.answer || '').trim();
  const rest = answer.startsWith(item.summary) ? answer.slice(item.summary.length).trim() : answer;
  const blocks = [];
  if (rest) blocks.push({ type: 'p', text: rest });
  if (item.caution) blocks.push({ type: 'caution', text: String(item.caution).trim() });
  return {
    id: item.id,
    category,
    topic: item.category,
    status: 'unverified',
    updated: config.updated,
    title: String(item.title).trim(),
    summary: String(item.summary).trim(),
    aliases: unique((item.search_phrases || []).map(question).filter((p) => p.toLowerCase() !== question(item.title).toLowerCase())),
    tags: [...(item.tags || [])],
    source: `Draft from K-Labs content ${config.batch} (original draft). No independent source, manufacturer or bench verification yet.`,
    related: [...(item.related_article_ids || [])],
    sections: blocks.length ? [{ heading: 'In detail', blocks }] : [],
    review: { technical: item.technical_review || 'required', source: item.source_status || 'unverified', batch: config.batch, publicPage: false },
  };
}

// Likely duplicates: most of the meaningful words are shared between the new question (with its search phrases) and an
// existing article's own title. Existing aliases are left out, so merged phrases cannot change the result on a re-run.
function similarity(item, article) {
  const A = new Set(words([item.title, ...(item.search_phrases || item.aliases || [])].join(' ')));
  const B = new Set(words(article.title));
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.max(1, Math.min(A.size, B.size));
}
function detectDuplicates(items, articles, threshold = 0.6) {
  const found = [];
  for (const item of items) for (const article of articles) {
    const score = similarity(item, article);
    if (score >= threshold) found.push({ batchId: item.id, existingId: article.id, score: Math.round(score * 100) / 100 });
  }
  return found;
}

function importBatch(store, batch, config) {
  const items = batch.articles || [];
  const report = { added: [], replaced: [], merged: [], kept: [] };
  const articles = store.articles.map((a) => JSON.parse(JSON.stringify(a)));
  const byId = new Map(articles.map((a) => [a.id, a]));
  const merges = config.merges || {};
  const resolved = new Set([...Object.entries(merges).map(([b, e]) => `${b}>${e}`), ...(config.distinct || []).map(([b, e]) => `${b}>${e}`)]);
  const existingBefore = articles.filter((a) => !(a.review && a.review.batch === config.batch));
  const unresolved = detectDuplicates(items, existingBefore).filter((d) => d.batchId !== d.existingId && !resolved.has(`${d.batchId}>${d.existingId}`));
  if (unresolved.length) throw new Error(`Unresolved likely duplicates (add to merges or distinct in import.json): ${JSON.stringify(unresolved)}`);
  const ids = new Set(items.map((i) => i.id));
  if (ids.size !== items.length) throw new Error('Duplicate ids inside the batch');
  const relink = (id) => merges[id] || id;

  for (const item of items) {
    const mapped = mapBatchArticle(item, config);
    mapped.related = unique(mapped.related.map(relink)).filter((id) => id !== mapped.id);
    const target = merges[item.id];
    if (target) {
      const existing = byId.get(target);
      if (!existing) throw new Error(`${item.id}: merge target ${target} not found`);
      existing.aliases = unique([...(existing.aliases || []), question(item.title), ...mapped.aliases]).filter((p) => p.toLowerCase() !== existing.title.toLowerCase());
      existing.related = unique([...(existing.related || []), ...mapped.related]).filter((id) => id !== existing.id);
      existing.review = existing.review || { technical: 'required', source: 'unverified', batch: 'original', publicPage: false };
      existing.review.aliasIds = unique([...(existing.review.aliasIds || []), item.id]);
      const record = { batch: config.batch, id: item.id, answer: item.answer, caution: item.caution };
      existing.review.mergedFrom = [...(existing.review.mergedFrom || []).filter((m) => !(m.batch === record.batch && m.id === record.id)), record];
      report.merged.push(`${item.id} -> ${target}`);
      continue;
    }
    const current = byId.get(item.id);
    if (current && !(current.review && current.review.batch === config.batch && !current.review.edited)) {
      report.kept.push(item.id);
      continue;
    }
    if (current) { articles[articles.indexOf(current)] = mapped; report.replaced.push(item.id); } else { articles.push(mapped); report.added.push(item.id); }
    byId.set(item.id, mapped);
  }
  // Reviewed additions to existing articles from merged items (applied once; matched by their text).
  for (const [id, additions] of Object.entries(config.additions || {})) {
    const article = byId.get(id);
    if (!article) throw new Error(`additions: ${id} not found`);
    for (const add of additions) {
      const section = article.sections.find((s) => s.heading === add.section);
      if (!section) throw new Error(`additions: ${id} has no section "${add.section}"`);
      if (add.appendItem) {
        const list = section.blocks.find((b) => b.type === add.blockType);
        if (!list) throw new Error(`additions: ${id} "${add.section}" has no ${add.blockType}`);
        if (!list.items.includes(add.appendItem)) list.items.push(add.appendItem);
      } else if (add.block && !section.blocks.some((b) => b.text === add.block.text)) {
        section.blocks.push(add.block);
      } else if (add.extendCaution) {
        const caution = section.blocks.find((b) => b.type === 'caution');
        if (!caution) throw new Error(`additions: ${id} "${add.section}" has no caution`);
        if (!caution.text.includes(add.extendCaution)) caution.text = `${caution.text} ${add.extendCaution}`;
      }
    }
    article.review.edited = true;
  }
  return { store: { ...store, updated: config.updated, articles }, report };
}

// ---------- validation ----------
function textsOf(article) {
  return [article.title, article.summary, article.source, ...(article.aliases || []), ...(article.tags || []),
    ...article.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => b.items || [b.text])])];
}
function wordingIssues(article) {
  const issues = [];
  if (article.title.length < 20 || article.title.length > 60) issues.push(`title is ${article.title.length} characters (20-60 for publication)`);
  if (article.summary.length < 70 || article.summary.length > 160) issues.push(`summary is ${article.summary.length} characters (70-160 for publication)`);
  if (FILLER.test(textsOf(article).join(' '))) issues.push('stock filler phrase');
  return issues;
}
function validateStore(store, categories) {
  const errors = [];
  const warnings = [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const ids = new Map();
  const aliasOwner = new Map();
  for (const a of store.articles) {
    const where = a && a.id ? a.id : JSON.stringify(a).slice(0, 40);
    if (!a || typeof a.id !== 'string' || !SLUG.test(a.id)) { errors.push(`${where}: id must be lower-case words joined by hyphens`); continue; }
    if (ids.has(a.id)) errors.push(`${a.id}: duplicate id`);
    ids.set(a.id, a);
    if (a.status !== 'unverified') errors.push(`${a.id}: the draft store holds unverified articles only (status ${a.status})`);
    if (!a.review || a.review.publicPage !== false) errors.push(`${a.id}: review.publicPage must be false`);
    if (!categoryIds.has(a.category)) errors.push(`${a.id}: unknown category ${a.category}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.updated || '')) errors.push(`${a.id}: updated must be YYYY-MM-DD`);
    for (const f of ['title', 'summary', 'source']) if (typeof a[f] !== 'string' || !a[f].trim()) errors.push(`${a.id}: ${f} missing`);
    if (!Array.isArray(a.sections) || !a.sections.length) errors.push(`${a.id}: no sections`);
    for (const s of a.sections || []) {
      if (!s.heading) errors.push(`${a.id}: section without heading`);
      for (const b of s.blocks || []) {
        if (!BLOCK_TYPES.has(b.type)) errors.push(`${a.id}: block type ${b.type}`);
        if ((b.type === 'list' || b.type === 'steps') ? !(Array.isArray(b.items) && b.items.length) : !b.text) errors.push(`${a.id}: empty ${b.type}`);
      }
    }
    if (/<[a-z/!]/i.test(textsOf(a).join(' '))) errors.push(`${a.id}: contains markup`);
    for (const alias of a.aliases || []) {
      const key = words(alias).join(' ');
      if (aliasOwner.has(key) && aliasOwner.get(key) !== a.id) warnings.push(`alias "${alias}" is used by ${aliasOwner.get(key)} and ${a.id}`);
      aliasOwner.set(key, a.id);
    }
    for (const issue of wordingIssues(a)) warnings.push(`${a.id}: ${issue}`);
  }
  for (const a of store.articles) {
    for (const r of a.related || []) if (!ids.has(r) || r === a.id) errors.push(`${a.id}: related link ${r} does not resolve`);
    for (const alt of (a.review && a.review.aliasIds) || []) if (ids.has(alt)) errors.push(`${a.id}: merged id ${alt} is also an article`);
  }
  return { errors, warnings };
}

// ---------- leakage ----------
// Everything this repository would commit (tracked plus new files that are not ignored), and the generated public
// output, must contain no draft id, title or summary.
function repositoryFiles(root) {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
}
function leakScan(store, files, readFile) {
  const needles = [];
  for (const a of store.articles) {
    needles.push(a.id, a.title, a.summary);
    for (const alt of (a.review && a.review.aliasIds) || []) needles.push(alt);
  }
  const hits = [];
  for (const file of files) {
    const text = readFile(file);
    if (text === null) continue;
    for (const needle of needles) if (needle && needle.length >= 12 && text.includes(needle)) hits.push({ file, needle: needle.slice(0, 60) });
  }
  return hits;
}

// ---------- local review file ----------
function localReviewSource(store) {
  return `/* LOCAL REVIEW ONLY: unverified Knowledge Base drafts for Studio on this computer. Generated by
   scripts/knowledge-drafts.cjs dev from the private draft store. Git-ignored and never deployed; Studio requests it only
   on a local address. Do not commit, copy into the site or publish. */
window.KLabsKnowledgeDrafts=${JSON.stringify(store.articles.map(({ review, topic, ...article }) => article))};
`;
}

function readStore(file) {
  if (!fs.existsSync(file)) throw new Error(`No draft store at ${file}`);
  const store = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(store.articles)) throw new Error('Draft store has no articles list');
  return store;
}
function writeStore(file, store) {
  const sorted = { ...store, articles: [...store.articles].sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id)) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 1)}\n`);
}

module.exports = { DEFAULT_STORE, LOCAL_FILE, mapBatchArticle, detectDuplicates, similarity, importBatch, validateStore, wordingIssues, leakScan, repositoryFiles, localReviewSource, readStore, writeStore };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const storeFile = path.resolve(flag('--store') || process.env.KLABS_KNOWLEDGE_DRAFTS || DEFAULT_STORE);
  const [command, input] = args;
  const kb = require(path.join(ROOT, 'js/knowledge-base.js'));
  const fail = (message) => { console.error(message); process.exit(1); };
  try {
    if (command === 'import') {
      if (!input) fail('Usage: import <batch.json> [--store <drafts.json>]');
      const batch = JSON.parse(fs.readFileSync(input, 'utf8'));
      const config = JSON.parse(fs.readFileSync(path.join(path.dirname(input), 'import.json'), 'utf8'));
      const { store, report } = importBatch(readStore(storeFile), batch, config);
      const { errors, warnings } = validateStore(store, kb.CATEGORIES);
      if (errors.length) fail(`Import stopped; store unchanged. ${errors.length} error(s):\n${errors.join('\n')}`);
      writeStore(storeFile, store);
      console.log(`Imported ${config.batch}: ${report.added.length} added, ${report.replaced.length} replaced, ${report.merged.length} merged into existing (${report.merged.join('; ')}), ${report.kept.length} kept as edited. Store: ${store.articles.length} draft articles. ${warnings.length} wording warning(s) to fix before verification.`);
    } else if (command === 'check') {
      const store = readStore(storeFile);
      const { errors, warnings } = validateStore(store, kb.CATEGORIES);
      const gen = require('./build-knowledge-pages.cjs');
      const generated = gen.generate(kb);
      const files = repositoryFiles(ROOT);
      const hits = [
        ...leakScan(store, files, (f) => { try { const p = path.join(ROOT, f); return fs.statSync(p).size < 2e6 ? fs.readFileSync(p, 'utf8') : null; } catch { return null; } }),
        ...leakScan(store, Object.keys(generated), (f) => generated[f]),
      ];
      const published = kb.ARTICLES.filter((a) => a.status !== 'verified');
      console.log(`Draft store: ${store.articles.length} articles; ${errors.length} error(s); ${warnings.length} wording warning(s).`);
      console.log(`Leak scan: ${files.length} repository files and ${Object.keys(generated).length} generated files; ${hits.length} draft match(es). Unverified articles in js/knowledge-base.js: ${published.length}.`);
      for (const e of errors) console.log(`ERROR ${e}`);
      for (const h of hits) console.log(`LEAK ${h.file}: ${h.needle}`);
      if (args.includes('--warnings')) for (const w of warnings) console.log(`WARN ${w}`);
      process.exit(errors.length || hits.length || published.length ? 1 : 0);
    } else if (command === 'dev') {
      const store = readStore(storeFile);
      const { errors } = validateStore(store, kb.CATEGORIES);
      if (errors.length) fail(`Store has errors; run check. ${errors[0]}`);
      fs.writeFileSync(path.join(ROOT, LOCAL_FILE), localReviewSource(store));
      console.log(`Wrote ${LOCAL_FILE} (${store.articles.length} drafts) for local review in Studio. It is git-ignored and never deployed.`);
    } else {
      fail('Usage: node scripts/knowledge-drafts.cjs import <batch.json> | check [--warnings] | dev   [--store <drafts.json>]');
    }
  } catch (error) {
    fail(error.message);
  }
}
