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

// ---------- Batch 01 (27 Nov 2026) ----------
const article = (id) => { const a = kb.ARTICLES.find((x) => x.id === id); assert.ok(a, `${id} is published`); return textOf(a); };
const has = (text, s) => assert.ok(text.includes(s), `article states: ${s}`);
const fixed = (n, d) => n.toFixed(d);

test('millimetres and inches: exact 25.4 conversion, worked examples, rounding and the Studio statements', () => {
  const t = article('how-should-i-record-measurements-in-millimetres-and-inches');
  for (const s of ['Millimetres = inches × 25.4', 'Inches = millimetres ÷ 25.4', '84 × 25.4 = 2133.6 mm', '300 ÷ 25.4 = 11.811 in',
    '1/8 in = 0.125 in = 3.175 mm', '5/16 in = 0.3125 in = 7.9375 mm', 'converts back to 299.72 mm, 0.28 mm short', '1833.6 mm from the butt']) has(t, s);
  assert.equal(7 * 12, 84);
  assert.equal(fixed(84 * 25.4, 1), '2133.6');
  assert.equal(fixed(300 / 25.4, 3), '11.811');
  assert.equal(1 / 8, 0.125); assert.equal(fixed(0.125 * 25.4, 3), '3.175');
  assert.equal(5 / 16, 0.3125); assert.equal(fixed(0.3125 * 25.4, 4), '7.9375');
  assert.equal(fixed(11.8 * 25.4, 2), '299.72'); assert.equal(fixed(300 - 11.8 * 25.4, 2), '0.28');
  assert.equal(fixed(2133.6 - 300, 1), '1833.6');
  const html = read('index.html');
  has(t, 'Settings → Measurement Units offers Metric (mm), Decimal Inches and Fractional Inches');
  for (const [v, label] of [['metric', 'METRIC \\(MM\\)'], ['decimal-inch', 'DECIMAL INCHES'], ['fractional-inch', 'FRACTIONAL INCHES']]) {
    assert.match(html, new RegExp(`data-settings-measurement-display="${v}"[^>]*>${label}<`));
  }
  has(t, 'Guide Setup lists guide positions from the tip');
  assert.match(html, /data-workshop-tool-open="guide-spacing">\s*<span class="workshop-tool-launch__title">Guide Setup<\/span>/);
  assert.match(html, /<small>Position from tip \(<span data-guide-position-unit>/);
  has(t, 'reel seat position is recorded from the butt');
  assert.match(html, /Reel Seat Position &mdash; From Butt/);
});

test('guide positions and spacing: differences, offsets and tip/butt conversion', () => {
  const t = article('how-should-i-measure-guide-positions');
  for (const s of ['Tip to guide 1: 110 mm', '235 − 110 = 125 mm', '380 − 235 = 145 mm', 'a guide 380 mm from the tip is 1720 mm from the butt']) has(t, s);
  assert.equal(235 - 110, 125); assert.equal(380 - 235, 145); assert.equal(2100 - 380, 1720);
  // One guide measured to its foot (offset e): the spacing before it gains e and the one after loses e.
  const pos = [110, 235, 380]; const e = 7; const off = [110, 235 + e, 380];
  assert.deepEqual([off[1] - off[0] - (pos[1] - pos[0]), off[2] - off[1] - (pos[2] - pos[1])], [e, -e]);
  // Spacing is the same measured from either end.
  const L = 2100; const butt = pos.map((p) => L - p);
  assert.deepEqual([butt[0] - butt[1], butt[1] - butt[2]], [pos[1] - pos[0], pos[2] - pos[1]]);
  has(t, 'Workshop → Guide Setup lists each guide\'s position measured from the tip, in the measurement units chosen in Settings.');
  assert.match(read('index.html'), /Position from tip \(<span data-guide-position-unit>mm<\/span>\)/);
  assert.match(read('js/ui.js'), /const units=measurementUnitSuffix\(\);[\s\S]{0,400}querySelectorAll\('\[data-guide-position-unit\]'\)\.forEach\(\(el\)=>\{el\.textContent=units;\}\);/);
});

test('printed template scale: width is one circumference; scale arithmetic; Thread Design Studio template text', () => {
  const t = article('how-do-i-verify-a-printed-wrap-template-is-to-scale');
  has(t, 'A template stating 37.7 mm that measures 35.8 mm was printed at 95%');
  assert.equal(fixed(35.8 / 37.7 * 100, 0), '95');
  const app = read('thread-studio/src/app.js'); const engine = read('thread-studio/src/engine.js');
  assert.match(engine, /const C = Math\.PI \* d\.diameterMm/);
  assert.match(app, /W = L\.C,/); // the outlined pattern is W wide
  assert.match(app, /<rect x="0" y="0" width="\$\{W\.toFixed\(2\)\}"/);
  assert.match(app, /Thread Design Studio · wrapping template<\/h3><p[^>]*>Rod diameter \$\{f1\(d\.diameterMm\)\} mm · circumference \$\{L\.C\.toFixed\(1\)\} mm · \$\{L\.N\} marks, \$\{L\.markSpacingMm\.toFixed\(2\)\} mm apart · print at 100% \(no scaling\)/);
  assert.match(app, /width="\$\{W\.toFixed\(2\)\}mm"/); // drawn in real millimetres
});

test('calculated vs measured: input error, unit mix-up', () => {
  const t = article('why-do-calculations-differ-from-measurements-on-the-rod');
  has(t, 'a circumference of 37.70 mm instead of 38.01 mm: 0.31 mm short');
  assert.equal(fixed(12 * Math.PI, 2), '37.70'); assert.equal(fixed(12.1 * Math.PI, 2), '38.01'); assert.equal(fixed(0.1 * Math.PI, 2), '0.31');
  has(t, '12 in is 304.8 mm, not 12 mm');
  assert.equal(fixed(12 * 25.4, 1), '304.8');
});

test('margin and markup: formulas, worked example, conversions, target price, tax', () => {
  const t = article('how-should-i-compare-component-cost-and-selling-price');
  const markup = (cost, price) => (price - cost) / cost * 100;
  const margin = (cost, price) => (price - cost) / price * 100;
  has(t, 'That is a 50% markup but a 33.3% margin');
  assert.equal(markup(40, 60), 50); assert.equal(fixed(margin(40, 60), 1), '33.3');
  has(t, 'Margin = markup ÷ (100 + markup) × 100'); has(t, 'Markup = margin ÷ (100 − margin) × 100');
  for (const [c, p] of [[40, 60], [10, 13], [25, 80]]) {
    assert.ok(Math.abs(margin(c, p) - markup(c, p) / (100 + markup(c, p)) * 100) < 1e-9);
    assert.ok(Math.abs(markup(c, p) - margin(c, p) / (100 - margin(c, p)) * 100) < 1e-9);
  }
  has(t, 'A 50% markup is a 33.3% margin, and a 50% margin needs a 100% markup');
  assert.equal(fixed(50 / 150 * 100, 1), '33.3'); assert.equal(50 / (100 - 50) * 100, 100);
  has(t, '$40 ÷ 0.6 = $66.67');
  assert.equal(fixed(40 / (1 - 40 / 100), 2), '66.67'); assert.equal(fixed(margin(40, 40 / 0.6), 6), '40.000000');
  has(t, 'a $69.00 tax-inclusive price is $60.00 before tax');
  assert.equal(fixed(69 / 1.15, 2), '60.00');
});

test('batch 01: merged questions find their one article', () => {
  for (const [q, id] of [['convert inches to millimetres', 'how-should-i-record-measurements-in-millimetres-and-inches'],
    ['prevent inconsistent measurements', 'how-should-i-record-measurements-in-millimetres-and-inches'],
    ['effective guide spacing', 'how-should-i-measure-guide-positions'], ['measure guide positions', 'how-should-i-measure-guide-positions'],
    ['template scale', 'how-do-i-verify-a-printed-wrap-template-is-to-scale'], ['markup vs margin', 'how-should-i-compare-component-cost-and-selling-price'],
    ['calculation does not match measurement', 'why-do-calculations-differ-from-measurements-on-the-rod']]) {
    assert.equal(kb.search(q)[0]?.article.id, id, q);
  }
});
