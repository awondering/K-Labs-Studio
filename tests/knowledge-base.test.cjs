// Q42 Knowledge Base: shipped content rules, search, local draft review and wiring (no browser).
// Real drafts are never in this repository; search is exercised with synthetic fixture articles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const kb = require('../js/knowledge-base.js');
const fixture = require('./fixtures/knowledge-fixture.cjs');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const ids = (results) => results.map((r) => r.article.id);

test('five categories in the agreed order, each with a public intro', () => {
  assert.deepEqual(kb.CATEGORIES.map((c) => c.title), ['FAQs', 'Techniques', 'Troubleshooting', 'Component Selection', 'Repairs']);
  for (const c of kb.CATEGORIES) assert.ok(c.meta && c.intro, c.id);
});

test('the shipped article file holds verified articles only (drafts live in the private store)', () => {
  for (const a of kb.ARTICLES) assert.equal(a.status, 'verified', a.id);
  assert.doesNotMatch(read('js/knowledge-base.js'), /status:'unverified'|status:"unverified"/);
});

test('drafts for local review: added to Studio\'s articles and search, never verified ones, never duplicates', () => {
  const before = kb.articles().length;
  assert.equal(kb.useDrafts([...fixture.articles, { ...fixture.articles[0], id: 'fixture-claims-verified', status: 'verified' }]), 3);
  assert.equal(kb.articles().length, before + 3);
  assert.deepEqual(kb.ARTICLES.map((a) => a.id), kb.articles().filter((a) => a.status === 'verified').map((a) => a.id));
  kb.useDrafts([]);
  assert.equal(kb.articles().length, before);
});

test('local review file is requested only on this computer, never on the live site', () => {
  assert.equal(kb.isLocalReviewHost({ protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(kb.isLocalReviewHost({ protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(kb.isLocalReviewHost({ protocol: 'file:', hostname: '' }), true);
  assert.equal(kb.isLocalReviewHost({ protocol: 'https:', hostname: 'studio.klabs.co.nz' }), false);
  assert.equal(kb.isLocalReviewHost({ protocol: 'https:', hostname: 'klabs.co.nz' }), false);
  assert.equal(kb.isLocalReviewHost(null), false);
  const src = read('js/knowledge-base.js');
  assert.match(src, /if\(!doc \|\| !isLocalReviewHost\(typeof location!=='undefined'\?location:null\)\)\{localDrafts=Promise\.resolve\(0\);return localDrafts;\}/);
  // Git-ignored, so it can never be committed or deployed; not part of the app shell or the script list.
  assert.match(read('.gitignore'), /^\/js\/knowledge-drafts\.local\.js$/m);
  assert.doesNotMatch(read('service-worker.js'), /knowledge-drafts/);
  assert.doesNotMatch(read('js/public-entry.js'), /knowledge-drafts/);
});

test('search: spelling variants, accents, capitals and aliases find the same article', () => {
  kb.useDrafts(fixture.articles);
  try {
    const seatMatches = ids(kb.search('reel seat'));
    assert.ok(seatMatches.includes('fixture-seat-removal'));
    for (const q of ['reelseat', 'REEL SEAT', 'réel seat']) assert.deepEqual(ids(kb.search(q)), seatMatches, q);
    const crossWrapMatches = ids(kb.search('cross wrap'));
    assert.ok(crossWrapMatches.includes('fixture-layout-method'));
    assert.deepEqual(ids(kb.search('crosswrap')), crossWrapMatches);
    assert.deepEqual(ids(kb.search('remove test seat')), ['fixture-seat-removal']); // only its alias says "remove"
  } finally { kb.useDrafts([]); }
});

test('search: every word must match; title matches rank first; empty and unknown queries find nothing', () => {
  kb.useDrafts(fixture.articles);
  try {
    assert.equal(ids(kb.search('butt tip'))[0], 'fixture-route-choice'); // title match first (the layout body also says butt to tip)
    const fixtureMatches = ids(kb.search('repair')).filter((id) => id.startsWith('fixture-'));
    assert.deepEqual(fixtureMatches.sort(), ['fixture-route-choice', 'fixture-seat-removal']);
    assert.deepEqual(kb.search(''), []);
    assert.deepEqual(kb.search('   '), []);
    assert.deepEqual(kb.search('zzqx'), []);
    assert.deepEqual(kb.search('reel seat zzqx'), []);
  } finally { kb.useDrafts([]); }
});

test('reading time is at least one minute', () => {
  for (const a of fixture.articles) assert.ok(kb.readMinutes(a) >= 1);
});

test('wiring: Workshop card, tool panel, loaded before ui.js, cached offline', () => {
  const html = read('index.html');
  assert.match(html, /data-workshop-tool-open="knowledge"/);
  assert.match(html, /id="workshopToolKnowledge"[^>]*hidden/);
  assert.match(html, /id="knowledgeHost"/);
  // Placed among the tools (after Thread Design Studio), not first.
  assert.ok(html.indexOf('data-workshop-tool-open="knowledge"') > html.indexOf('data-workshop-tool-open="thread-studio"'));
  assert.ok(html.indexOf('data-workshop-tool-open="guide-spacing"') < html.indexOf('data-workshop-tool-open="knowledge"'));
  const entry = read('js/public-entry.js');
  assert.ok(entry.indexOf('"js/knowledge-base.js"') > 0 && entry.indexOf('"js/knowledge-base.js"') < entry.indexOf('"js/ui.js"'));
  assert.match(read('service-worker.js'), /'js\/knowledge-base\.js'/);
  const ui = read('js/ui.js');
  assert.match(ui, /activeTool=tool==='knowledge'\?'knowledge':/);
  assert.match(ui, /function renderKnowledgeTool\(\)/);
});

test('Demo Mode loads the Knowledge Base (it is not excluded)', () => {
  const entry = read('js/public-entry.js');
  const excluded = entry.match(/const demoExcludedScripts = new Set\(\[([\s\S]*?)\]\)/)[1];
  assert.doesNotMatch(excluded, /knowledge-base/);
});

test('renders text only: no innerHTML in the module', () => {
  assert.doesNotMatch(read('js/knowledge-base.js'), /innerHTML|insertAdjacentHTML|outerHTML/);
});
