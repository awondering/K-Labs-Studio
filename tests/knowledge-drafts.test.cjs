// Q42d draft import and checks (scripts/knowledge-drafts.cjs) on synthetic batches. The real draft store is private and
// outside this repository; `node scripts/knowledge-drafts.cjs check` validates it and scans for leaks.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const kb = require('../js/knowledge-base.js');
const d = require('../scripts/knowledge-drafts.cjs');
const fixture = require('./fixtures/knowledge-fixture.cjs');

const root = path.join(__dirname, '..');
const clone = (x) => JSON.parse(JSON.stringify(x));
const store = () => ({ schema: 1, updated: '2026-11-27', articles: clone(fixture.articles).map((a) => ({ ...a, review: { technical: 'required', source: 'fixture', batch: 'original', publicPage: false } })) });
const item = (over = {}) => ({
  id: 'what-is-a-test-question', category: 'Test topic', title: 'What is a test question?',
  summary: 'A synthetic summary sentence that is long enough to pass the publication wording rules here.',
  answer: 'A synthetic summary sentence that is long enough to pass the publication wording rules here. More placeholder detail follows.',
  caution: 'Placeholder caution.', search_phrases: ['test question', 'What is a test question'], tags: [], related_article_ids: [],
  status: 'draft', technical_review: 'required', public_page: false, source_status: 'original_ai_draft_unverified', ...over,
});
const config = (over = {}) => ({ batch: 'batch-test', updated: '2026-11-27', topicCategories: { 'Test topic': 'faqs', Repairs: 'repairs' }, merges: {}, distinct: [], additions: {}, ...over });

test('mapping: a batch item becomes a draft in the Knowledge Base article format, summary not repeated in the body', () => {
  const a = d.mapBatchArticle(item(), config());
  assert.equal(a.status, 'unverified');
  assert.equal(a.category, 'faqs');
  assert.equal(a.topic, 'Test topic');
  assert.deepEqual(a.aliases, ['test question']); // the title itself is not repeated as an alias
  assert.deepEqual(a.sections, [{ heading: 'In detail', blocks: [{ type: 'p', text: 'More placeholder detail follows.' }, { type: 'caution', text: 'Placeholder caution.' }] }]);
  assert.equal(a.review.publicPage, false);
  assert.match(a.source, /No independent source, manufacturer or bench verification yet/);
  assert.throws(() => d.mapBatchArticle(item({ category: 'Unknown' }), config()), /no category mapping/);
});

test('import refuses anything that arrives verified or public', () => {
  assert.throws(() => d.mapBatchArticle(item({ status: 'verified' }), config()), /must arrive as a draft/);
  assert.throws(() => d.mapBatchArticle(item({ public_page: true }), config()), /must arrive as a draft/);
});

test('import: new articles added; an unresolved likely duplicate stops the import', () => {
  const { store: next, report } = d.importBatch(store(), { articles: [item()] }, config());
  assert.deepEqual(report.added, ['what-is-a-test-question']);
  assert.equal(next.articles.length, 4);
  const dup = item({ id: 'how-do-i-take-off-a-test-reel-seat', title: 'How do I take off a test reel seat?', search_phrases: ['take off a test reel seat'], category: 'Repairs' });
  assert.throws(() => d.importBatch(store(), { articles: [dup] }, config()), /Unresolved likely duplicates.*fixture-seat-removal/);
  // Recorded as distinct, it is added as its own article.
  const ok = d.importBatch(store(), { articles: [dup] }, config({ distinct: [['how-do-i-take-off-a-test-reel-seat', 'fixture-seat-removal']] }));
  assert.equal(ok.report.added.length, 1);
});

test('merge: overlap folds into the existing article (aliases, original id, related links, reviewed additions) without replacing it', () => {
  const dup = item({ id: 'how-do-i-take-off-a-test-reel-seat', title: 'How do I take off a test reel seat?', search_phrases: ['take off a test reel seat'],
    category: 'Repairs', related_article_ids: ['what-is-a-test-question'] });
  const other = item();
  const cfg = config({
    merges: { 'how-do-i-take-off-a-test-reel-seat': 'fixture-seat-removal' },
    additions: { 'fixture-seat-removal': [{ section: 'When to stop', extendCaution: 'Extra merged caution.' }, { section: 'Before you start', blockType: 'list', appendItem: 'Merged point.' }] },
  });
  const once = d.importBatch(store(), { articles: [dup, other] }, cfg).store;
  const merged = once.articles.find((a) => a.id === 'fixture-seat-removal');
  assert.equal(once.articles.length, 4); // one new, one merged
  assert.equal(merged.title, fixture.articles[0].title); // existing content kept
  assert.ok(merged.aliases.includes('How do I take off a test reel seat') && merged.aliases.includes('take off a test reel seat'));
  assert.deepEqual(merged.review.aliasIds, ['how-do-i-take-off-a-test-reel-seat']);
  assert.ok(merged.related.includes('what-is-a-test-question'));
  assert.match(merged.sections[2].blocks[0].text, /Extra merged caution\.$/);
  assert.ok(merged.sections[0].blocks[1].items.includes('Merged point.'));
  // Re-running the same import changes nothing.
  const twice = d.importBatch(once, { articles: [dup, other] }, cfg).store;
  assert.deepEqual(twice, once);
  assert.deepEqual(d.validateStore(twice, kb.CATEGORIES).errors, []);
});

test('related links to a merged id are pointed at the article it merged into', () => {
  const dup = item({ id: 'how-do-i-take-off-a-test-reel-seat', title: 'How do I take off a test reel seat?', search_phrases: [], category: 'Repairs' });
  const linker = item({ related_article_ids: ['how-do-i-take-off-a-test-reel-seat'] });
  const next = d.importBatch(store(), { articles: [dup, linker] }, config({ merges: { 'how-do-i-take-off-a-test-reel-seat': 'fixture-seat-removal' } })).store;
  assert.deepEqual(next.articles.find((a) => a.id === 'what-is-a-test-question').related, ['fixture-seat-removal']);
});

test('validation: duplicate ids, verified status, unknown category, broken links, markup and public flags are errors', () => {
  const bad = store();
  bad.articles.push({ ...clone(bad.articles[0]) });
  bad.articles[1].status = 'verified';
  bad.articles[2].category = 'nope';
  bad.articles[0].related = ['missing-article'];
  bad.articles[1].summary = 'Has <b>markup</b> in it';
  bad.articles[2].review.publicPage = true;
  const { errors } = d.validateStore(bad, kb.CATEGORIES);
  for (const re of [/duplicate id/, /holds unverified articles only/, /unknown category/, /related link missing-article/, /contains markup/, /publicPage must be false/]) {
    assert.ok(errors.some((e) => re.test(e)), String(re));
  }
  assert.deepEqual(d.validateStore(store(), kb.CATEGORIES).errors, []);
});

test('wording warnings flag titles and summaries outside the publication rules', () => {
  assert.deepEqual(d.wordingIssues(fixture.articles[0]), []);
  const long = { ...fixture.articles[0], title: 'x'.repeat(61), summary: 'Too short.' };
  assert.equal(d.wordingIssues(long).length, 2);
});

test('leak scan finds draft ids, titles and summaries in files; short strings are ignored', () => {
  const s = store();
  const files = { 'a.js': `x ${s.articles[0].id} y`, 'b.html': s.articles[1].title, 'c.txt': 'nothing here', 'd.txt': 'fixture' };
  const hits = d.leakScan(s, Object.keys(files), (f) => files[f]);
  assert.deepEqual(hits.map((h) => h.file).sort(), ['a.js', 'b.html']);
});

test('this repository contains no draft from the private store format: fixture-free files carry no unverified article', () => {
  // The shipped article file is verified-only and the local review file is not tracked.
  const tracked = d.repositoryFiles(root);
  assert.ok(!tracked.some((f) => /\.local\.js$/.test(f)), 'a local review file is tracked');
  assert.ok(kb.ARTICLES.every((a) => a.status === 'verified'));
});

test('local review file: a git-ignored script that sets the drafts, without review notes', () => {
  const src = d.localReviewSource(store());
  assert.match(src, /^\/\* LOCAL REVIEW ONLY/);
  const sandbox = {};
  new Function('window', src)(sandbox);
  assert.equal(sandbox.KLabsKnowledgeDrafts.length, 3);
  assert.ok(sandbox.KLabsKnowledgeDrafts.every((a) => a.status === 'unverified' && !a.review && !a.topic));
  assert.equal(d.LOCAL_FILE, 'js/knowledge-drafts.local.js');
});

test('store read/write round trip is stable and sorted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klabs-kb-store-'));
  try {
    const file = path.join(dir, 'drafts.json');
    d.writeStore(file, store());
    const first = fs.readFileSync(file, 'utf8');
    d.writeStore(file, d.readStore(file));
    assert.equal(fs.readFileSync(file, 'utf8'), first);
    assert.deepEqual(d.readStore(file).articles.map((a) => a.id), ['fixture-route-choice', 'fixture-seat-removal', 'fixture-layout-method']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the importer is generic: Node built-ins only, and no article content in it', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/knowledge-drafts.cjs'), 'utf8');
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(requires.filter((r) => !r.startsWith('node:') && !r.startsWith('./') && r !== 'path.join(ROOT, \'js/knowledge-base.js\')'), []);
  assert.doesNotMatch(src, /reel seat|cross wrap|blank/i);
});
