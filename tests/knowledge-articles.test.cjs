// Evidence checks for VERIFIED Knowledge Base articles (the shipped js/knowledge-base.js). Calculations stated in an
// article are recomputed here; statements about Studio are checked against Studio's own code. A failing check means the
// article no longer meets the K-Labs evidence rules and must not be published.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const kb = require('../js/knowledge-base.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const textOf = (a) => [a.title, a.summary, ...a.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => b.items || [b.text])])].join('\n');
const decimals = (n) => (String(n).split('.')[1] || '').length;

test('shipped articles are verified only, and link only to verified articles', () => {
  const ids = new Set(kb.ARTICLES.map((a) => a.id));
  for (const a of kb.ARTICLES) {
    assert.equal(a.status, 'verified', a.id);
    for (const r of a.related) assert.ok(ids.has(r), `${a.id} links to unpublished ${r}`);
  }
});

test('every "x × π = y" and "x ÷ π = y" in a verified article is correct to the decimals it states', () => {
  let checked = 0;
  for (const a of kb.ARTICLES) {
    for (const [, x, op, y] of textOf(a).matchAll(/(\d+(?:\.\d+)?) ([×÷]) π = (\d+(?:\.\d+)?)/g)) {
      const value = op === '×' ? Number(x) * Math.PI : Number(x) / Math.PI;
      assert.equal(value.toFixed(decimals(y)), y, `${a.id}: ${x} ${op} π = ${y}`);
      checked++;
    }
  }
  assert.ok(checked >= 3, 'worked examples found');
});

test('diameter and circumference: formulas, rounding figures and the Studio tool statement', () => {
  const a = kb.ARTICLES.find((x) => x.id === 'how-do-i-convert-circumference-to-diameter');
  assert.ok(a, 'the first verified article is published');
  const text = textOf(a);
  // Formulas and π to the figures stated.
  assert.match(text, /Circumference = π × diameter/);
  assert.match(text, /Diameter = circumference ÷ π/);
  assert.equal(Math.PI.toFixed(5), '3.14159');
  assert.equal(Math.PI.toFixed(4), '3.1416');
  // "Using 3.14 puts every result about 0.05% out, which is 0.02 mm on the circumference of a 12 mm blank."
  assert.match(text, /about 0\.05% out, which is 0\.02 mm on the circumference of a 12 mm blank/);
  assert.equal(((1 - 3.14 / Math.PI) * 100).toFixed(2), '0.05');
  assert.equal((12 * (Math.PI - 3.14)).toFixed(2), '0.02');
  // Non-round sections: circumference ÷ π is the diameter of the circle with the same perimeter (exact by definition).
  const perimeter = 100;
  assert.equal(Math.PI * (perimeter / Math.PI), perimeter);
  // "Workshop → Diameter & Circumference converts either way ... in the measurement units chosen in Settings."
  assert.match(text, /Workshop → Diameter & Circumference converts either way/);
  const html = read('index.html');
  const ui = read('js/ui.js');
  assert.match(html, /data-workshop-tool-open="diameter">\s*<span class="workshop-tool-launch__title">Diameter &amp; Circumference<\/span>/);
  assert.match(ui, /const circumferenceMm=validDiameter\?state\.diameterMm\*Math\.PI:null;/);
  assert.match(ui, /state\.diameterMm=Number\.isFinite\(value\)\?\(source==='circumference'\?value\/Math\.PI:value\):null;/);
  assert.match(ui, /state\.unit=activeMeasurementUnits\(\);/);
  assert.match(ui, /function activeMeasurementUnits\(\)\{\n\s*return normalizeMeasurementUnits\(studioSettings&&studioSettings\.measurementUnits\);/);
  assert.match(html, /<span class="settings-disclosure__title">Measurement Units<\/span>/);
});

test('the merged duplicate question and its search phrases find the one article', () => {
  for (const q of ['convert circumference to diameter', 'calculate circumference from diameter', 'diameter circumference', 'circumference']) {
    assert.equal(kb.search(q)[0]?.article.id, 'how-do-i-convert-circumference-to-diameter', q);
  }
});
