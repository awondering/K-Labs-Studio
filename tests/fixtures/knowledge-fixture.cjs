// Synthetic Knowledge Base articles for automated tests only. They are deliberately NOT rod-building advice, so no real
// draft content ever needs to be committed (every file in this repository is served publicly). Shape matches the real
// article format: two related repair articles that mention a reel seat, and one technique article about a cross wrap.
'use strict';
const SOURCE = 'Synthetic test fixture. Not K-Labs advice.';
const articles = [
  {
    id: 'fixture-seat-removal',
    category: 'repairs',
    status: 'unverified',
    updated: '2026-11-27',
    title: 'Fixture: taking off a test reel seat',
    summary: 'Synthetic article that exercises the Knowledge Base reader with steps, a caution and a related link.',
    aliases: ['remove a test seat'],
    tags: ['reel seat', 'repair', 'fixture'],
    source: SOURCE,
    related: ['fixture-route-choice'],
    sections: [
      { heading: 'Before you start', blocks: [
        { type: 'p', text: 'This paragraph is placeholder text for the reader test.' },
        { type: 'list', items: ['First placeholder point.', 'Second placeholder point.'] },
      ] },
      { heading: 'Test steps', blocks: [
        { type: 'steps', items: ['Placeholder step one.', 'Placeholder step two.', 'Placeholder step three.', 'Placeholder step four.', 'Placeholder step five.', 'Placeholder step six.'] },
      ] },
      { heading: 'When to stop', blocks: [
        { type: 'caution', text: 'Placeholder caution used to check how cautions are shown.' },
      ] },
    ],
  },
  {
    id: 'fixture-route-choice',
    category: 'repairs',
    status: 'unverified',
    updated: '2026-11-27',
    title: 'Fixture: test route from the butt or the tip',
    summary: 'Synthetic article for checking related links, topic pages and how search ranks a title match first.',
    aliases: [],
    tags: ['fixture', 'repair'],
    source: SOURCE,
    related: ['fixture-seat-removal'],
    sections: [
      { heading: 'Placeholder section', blocks: [
        { type: 'p', text: 'Placeholder text that mentions a test reel seat so search finds it as a second result.' },
      ] },
    ],
  },
  {
    id: 'fixture-layout-method',
    category: 'techniques',
    status: 'unverified',
    updated: '2026-11-27',
    title: 'Fixture: laying out a test pattern',
    summary: 'Synthetic cross wrap article used to prove page generation, structured data and the public search.',
    aliases: ['plan a test pattern'],
    tags: ['cross wrap', 'fixture'],
    source: SOURCE,
    related: [],
    sections: [
      { heading: 'Marking', blocks: [
        { type: 'steps', items: ['Placeholder marking step.', 'Another placeholder marking step.'] },
        { type: 'p', text: 'Placeholder text that runs from butt to tip.' },
      ] },
      { heading: 'Laying', blocks: [
        { type: 'p', text: 'Placeholder laying text.' },
        { type: 'caution', text: 'Placeholder caution for the generated page.' },
      ] },
    ],
  },
];
// The same articles marked verified (for proving the public pages), optionally only some of them.
function verified(ids = articles.map((a) => a.id)) {
  return articles.map((a) => (ids.includes(a.id) ? { ...a, status: 'verified' } : a));
}
module.exports = { articles, verified };
