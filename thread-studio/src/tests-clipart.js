// Artwork conversion quality: representative clip art, converted by the real art.js and compared with an ideal
// conversion of the same shape at the same grid size (a cell is ink when at least half its area is ink in the drawing).
// Cases cover transparent PNGs, contrasting colours, light colours, diagonal and thin lines, outlines, small enclosed
// details and separate small dots, plus controls that already converted well. Shapes are drawn at 512 px with
// anti-aliased edges (4x4 supersampling), like exported clip art.
// Run with the suite (node tests.js), or print the comparison table: node tests-clipart.js
const T = require('./engine.js'); require('./art.js'); const A = T.art;

const BLK = [20, 20, 20], WHT = [255, 255, 255], RED = [220, 30, 30], GRN = [0, 150, 60], YEL = [250, 215, 30], BLU = [30, 70, 200], ORA = [245, 140, 20];
const star = (u, v) => { const x = u - .5, y = v - .5, r = Math.hypot(x, y), a = Math.atan2(y, x) + Math.PI / 2, seg = 2 * Math.PI / 5, k = ((a % seg) + seg) % seg - seg / 2, t = Math.abs(k) / (seg / 2); return r < .19 + .29 * (1 - t) * .95; };
const heart = (u, v) => { const x = (u - .5) * 2.4, y = (.55 - v) * 2.4; return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0; };
const r0 = (u, v) => Math.hypot(u - .5, v - .5);
const ring = (u, v, w) => r0(u, v) <= .47 && r0(u, v) >= .47 - w;
const xs = (u, v, h) => Math.abs(u - v) < h || Math.abs(u + v - 1) < h;
const triOutline = (u, v, w) => { const inside = (m) => v > .06 + m && v < .94 - m && Math.abs(u - .5) < (v - .06 - m) * .55 - m * 1.2; return inside(0) && !inside(w); };
const eye = (u, v) => Math.hypot(u - .62, v - .4) < .07;
const sqHole = (u, v) => Math.abs(u - .5) < .45 && Math.abs(v - .5) < .45 && !(Math.abs(u - .3) < .055 && Math.abs(v - .3) < .055);
const dotAndBar = (u, v) => (u > .05 && u < .95 && v > .55 && v < .95) || Math.hypot(u - .5, v - .2) < .07;
// multi-colour clip art (coloured fills with dark line work, several flat colours)
const disc = (u, v, cx, cy, r) => Math.hypot(u - cx, v - cy) < r;
const sunLine = (u, v) => r0(u, v) < .47 && r0(u, v) >= .40;
const faceFeat = (u, v) => disc(u, v, .36, .4, .06) || disc(u, v, .64, .4, .06) || (v > .62 && v < .68 && Math.abs(u - .5) < .18);
const logo3 = (u, v) => disc(u, v, .3, .35, .2) ? RED : disc(u, v, .7, .35, .2) ? BLU : disc(u, v, .5, .7, .2) ? YEL : null;
const fishE = (u, v) => (u - .5) ** 2 / .16 + (v - .5) ** 2 / .06, fishEye = (u, v) => disc(u, v, .68, .45, .045);
const leafE = (u, v) => (u - .5) ** 2 / .18 + (v - .5) ** 2 / .05, vein = (u, v) => Math.abs(v - .5) < .03;

// each case: f(u,v) -> colour or null (transparent); ideal(u,v) -> ink?; gh = grid rows; maxDiff = allowed share of cells
// that differ from the ideal; keep = cells (x,y as fractions of the grid) that must be ink; clear = cells that must be background.
const CASES = [
  { id: 'K1', name: 'control: black star on white', f: (u, v) => star(u, v) ? BLK : WHT, ideal: star, maxDiff: .03 },
  { id: 'K2', name: 'control: black star on transparent', f: (u, v) => star(u, v) ? BLK : null, ideal: star, maxDiff: .03 },
  { id: 'K3', name: 'control: bold black X on white', f: (u, v) => xs(u, v, .085) ? BLK : WHT, ideal: (u, v) => xs(u, v, .085), maxDiff: .03 },
  { id: 'K4', name: 'transparent PNG: black outline with white fill (sticker)', f: (u, v) => ring(u, v, .06) ? BLK : r0(u, v) < .47 ? WHT : null, ideal: (u, v) => ring(u, v, .06), maxDiff: .05, clear: [[.5, .5]] },
  { id: 'K5', name: 'transparent PNG: dark shape with a small white eye', f: (u, v) => eye(u, v) ? WHT : r0(u, v) < .47 ? BLK : null, ideal: (u, v) => r0(u, v) < .47 && !eye(u, v), maxDiff: .05, clear: [[.62, .4]] },
  { id: 'K6', name: 'transparent PNG: thin triangle outline (diagonal edges)', f: (u, v) => triOutline(u, v, .035) ? BLK : null, ideal: (u, v) => triOutline(u, v, .035), maxDiff: .08, gh: 24 },
  { id: 'K7', name: 'transparent PNG: single white logo (silhouette is right)', f: (u, v) => star(u, v) ? WHT : null, ideal: star, maxDiff: .03 },
  { id: 'K8', name: 'contrasting colours: red heart on green', f: (u, v) => heart(u, v) ? RED : GRN, ideal: heart, maxDiff: .05 },
  { id: 'K9', name: 'contrasting colours: blue star on red', f: (u, v) => star(u, v) ? BLU : RED, ideal: star, maxDiff: .05 },
  { id: 'K10', name: 'light colour: yellow star on white', f: (u, v) => star(u, v) ? YEL : WHT, ideal: star, maxDiff: .05 },
  { id: 'K11', name: 'diagonal lines: thin X (4% strokes) on white', f: (u, v) => xs(u, v, .03) ? BLK : WHT, ideal: (u, v) => xs(u, v, .03), maxDiff: .05, keep: [[.06, .06], [.94, .94], [.94, .06], [.06, .94]] },
  { id: 'K12', name: 'small enclosed detail: square with a small window', f: (u, v) => sqHole(u, v) ? BLK : WHT, ideal: sqHole, maxDiff: .05, clear: [[.3, .3]] },
  { id: 'K13', name: 'small separate detail: bar with a dot above it', f: (u, v) => dotAndBar(u, v) ? BLK : WHT, ideal: dotAndBar, maxDiff: .05, keep: [[.5, .2]] },
  // multi-colour: dark outlines and details are kept by default; lighter fills become background; merged colours are reported
  { id: 'M1', name: 'multi-colour: yellow sun with black outline on white', f: (u, v) => sunLine(u, v) ? BLK : r0(u, v) < .40 ? YEL : WHT, ideal: sunLine, maxDiff: .06, clear: [[.5, .5]], colours: true },
  { id: 'M2', name: 'multi-colour: cartoon face, yellow, black eyes and mouth', f: (u, v) => r0(u, v) >= .46 ? WHT : faceFeat(u, v) ? BLK : YEL, ideal: faceFeat, maxDiff: .06, keep: [[.36, .4], [.64, .4], [.5, .65]], clear: [[.5, .52]], colours: true },
  { id: 'M3', name: 'multi-colour: cartoon face with a black outline', f: (u, v) => r0(u, v) >= .47 ? WHT : r0(u, v) >= .41 || faceFeat(u, v) ? BLK : YEL, ideal: (u, v) => (r0(u, v) < .47 && r0(u, v) >= .41) || faceFeat(u, v), maxDiff: .06, keep: [[.36, .4], [.64, .4]], clear: [[.5, .52]], colours: true },
  { id: 'M4', name: 'multi-colour: red, blue and yellow logo on white', f: (u, v) => logo3(u, v) || WHT, ideal: (u, v) => { const c = logo3(u, v); return c === RED || c === BLU; }, maxDiff: .06, keep: [[.3, .3], [.7, .3]], colours: true },
  { id: 'M5', name: 'multi-colour: red, blue and yellow logo, transparent', f: logo3, ideal: (u, v) => { const c = logo3(u, v); return c === RED || c === BLU; }, maxDiff: .06, keep: [[.3, .3], [.7, .3]], colours: true },
  { id: 'M6', name: 'multi-colour: orange fish, black outline, white eye, transparent', f: (u, v) => fishE(u, v) > 1 ? null : fishEye(u, v) ? WHT : fishE(u, v) > .7 ? BLK : ORA, ideal: (u, v) => fishE(u, v) <= 1 && fishE(u, v) > .7, maxDiff: .08, clear: [[.5, .5]], colours: true },
  { id: 'M7', name: 'multi-colour: green leaf with a yellow vein, transparent', f: (u, v) => leafE(u, v) > 1 ? null : vein(u, v) ? YEL : GRN, ideal: (u, v) => leafE(u, v) <= 1 && !vein(u, v), maxDiff: .06, clear: [[.3, .5], [.7, .5]] },   // green = design, yellow = background: nothing merged
  { id: 'M8', name: 'multi-colour: red, white and blue flag (stripes to the edge)', f: (u, v) => v < .33 ? RED : v < .66 ? WHT : BLU, ideal: (u, v) => v < .33 || v >= .66, maxDiff: .06, colours: true },
];
// detail too fine for the grid: the builder must be told it was lost
const LOST = { id: 'K14', name: 'too fine: hairline X (1% strokes) must be reported as lost', f: (u, v) => xs(u, v, .006) || r0(u, v) > .44 && r0(u, v) < .48 ? BLK : WHT };

function raster(f, W, H) {
  const px = new Uint8ClampedArray(W * H * 4), SS = 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const c = f((x + (i + .5) / SS) / W, (y + (j + .5) / SS) / H); if (c) { r += c[0]; g += c[1]; b += c[2]; a++; } }
    const k = (y * W + x) * 4; if (a) { px[k] = r / a; px[k + 1] = g / a; px[k + 2] = b / a; } px[k + 3] = Math.round(255 * a / (SS * SS));
  }
  return px;
}
function idealRows(ideal, gw, gh, bb) {
  const SS = 8, rows = [];
  for (let y = 0; y < gh; y++) { let r = ''; for (let x = 0; x < gw; x++) { let n = 0; for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const u = bb[0] + (bb[2] - bb[0]) * (x + (i + .5) / SS) / gw, v = bb[1] + (bb[3] - bb[1]) * (y + (j + .5) / SS) / gh; if (ideal(u, v)) n++; } r += n / (SS * SS) >= .5 ? '1' : '0'; } rows.push(r); }
  return rows;
}
const SRC = {}; const source = c => SRC[c.id] || (SRC[c.id] = A.srcFromRGBA(raster(c.f, 512, 512), 512, 512));
function measure(c) {
  const src = source(c), r = A.convert(src, { gh: c.gh || 16 }), art = r.art, [x0, y0, x1, y1] = r.report.crop, bb = [x0 / src.w, y0 / src.h, x1 / src.w, y1 / src.h];
  const id = idealRows(c.ideal, art.w, art.h, bb); let diff = 0;
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) if (art.rows[y][x] !== id[y][x]) diff++;
  // keep/clear points are given in the drawing; map them into the cropped grid
  const at = ([u, v]) => A.get(art, Math.min(art.w - 1, Math.floor((u - bb[0]) / (bb[2] - bb[0]) * art.w)), Math.min(art.h - 1, Math.floor((v - bb[1]) / (bb[3] - bb[1]) * art.h)));
  const keepOk = (c.keep || []).every(at), clearOk = (c.clear || []).every(p => !at(p));
  return { r, art, ideal: id, diff, share: diff / (art.w * art.h), keepOk, clearOk };
}
module.exports = function (ok) {
  for (const c of CASES) {
    const m = measure(c);
    const warned = m.r.report.warn.some(w => w.id === 'colours');
    ok('CA ' + c.id + ' ' + c.name + ': within ' + Math.round(c.maxDiff * 100) + '% of the ideal' + (c.keep ? ', fine detail kept' : '') + (c.clear ? ', enclosed detail kept clear' : '') + (c.colours ? ', merged colours reported' : ', no merged-colour warning'),
      m.share <= c.maxDiff && m.keepOk && m.clearOk && warned === !!c.colours, Math.round(m.share * 100) + '% differ; keep ' + m.keepOk + '; clear ' + m.clearOk + '; colours warning ' + warned);
  }
  const lost = A.convert(source(LOST), { gh: 16 });
  ok('CA ' + LOST.id + ' ' + LOST.name, lost.report.warn.some(w => w.id === 'lost' && /lost/.test(w.text)) && lost.report.lost > 0, JSON.stringify(lost.report.warn.map(w => w.id)));
  // controls and compatibility
  const sun = source(CASES.find(c => c.id === 'M1')), sunWhole = A.convert(sun, { gh: 16, shape: true }), face = source(CASES.find(c => c.id === 'M2')), faceWhole = A.convert(face, { gh: 16, shape: true });
  ok('CA K21 opaque artwork: Whole shape gives the filled silhouette (sun and face become solid discs)', A.get(sunWhole.art, 8, 8) && A.get(faceWhole.art, 8, 8) && A.ink(sunWhole.art) > 2 * A.ink(A.convert(sun, { gh: 16 }).art) && !sunWhole.report.split);
  const mc = A.convert(sun, { gh: 16 }).report.warn.find(w => w.id === 'colours');
  ok('CA K22 the merged-colour warning says how many colours the artwork has and how to choose differently', !!mc && mc.level === 'warn' && /3 colours/.test(mc.text) && /two/.test(mc.text) && /Whole shape/.test(mc.text));
  const sticker = source(CASES.find(c => c.id === 'K4')), split = A.convert(sticker, { gh: 16 }), whole = A.convert(sticker, { gh: 16, shape: true });
  ok('CA K16 transparent artwork: Whole shape brings back the filled silhouette; the default reports that light areas are background',
    split.report.split && split.report.warn.some(w => w.id === 'lightbg') && !whole.report.split && !whole.report.warn.some(w => w.id === 'lightbg') && A.ink(whole.art) > 2 * A.ink(split.art) && A.get(whole.art, 8, 8) && !A.get(split.art, 8, 8));
  const saved = A.fromSource(sticker, { gh: 14, shape: true }), back = JSON.parse(JSON.stringify(saved));
  ok('CA K17 Whole shape is saved with the conversion settings and reproduces the same grid', back.conv.shape === true && JSON.stringify(A.fromSource(back.src, back.conv).rows) === JSON.stringify(saved.rows));
  const legacy = Object.assign({}, sticker); delete legacy.c; const lr = A.convert(legacy, { gh: 16 });
  ok('CA K18 a source saved before colour was kept still converts (by brightness, transparent = the whole shape, as before)', lr.report.mode === 'brightness' && A.valid(lr.art) && A.get(lr.art, 8, 8));
  const heart = source(CASES.find(c => c.id === 'K8')), lo = A.convert(heart, { gh: 16, thr: 20 }), hi = A.convert(heart, { gh: 16, thr: 90 });
  ok('CA K19 the Cut-off still works with colour: towards More keeps more of the image as pattern', A.ink(hi.art) >= A.ink(lo.art) && lo.report.mode === 'colour');
  const blank = A.convert(A.srcFromRGBA(new Uint8ClampedArray(40 * 40 * 4).fill(255), 40, 40), { gh: 12 }), solid = A.convert(A.srcFromRGBA(raster((u, v) => u > .02 && u < .98 && v > .02 && v < .98 ? BLK : WHT, 60, 60), 60, 60), { gh: 12, crop: false });
  ok('CA K20 hints point the right way: no artwork -> towards More; almost all filled -> towards Less',
    blank.report.warn.some(w => w.id === 'noart' && /towards More/.test(w.text)) && solid.report.warn.some(w => w.id === 'full' && /towards Less/.test(w.text)));
  ok('CA K15 every case is deterministic', CASES.every(c => JSON.stringify(A.convert(source(c), { gh: c.gh || 16 }).art.rows) === JSON.stringify(measure(c).art.rows)));
};
module.exports.CASES = CASES; module.exports.measure = measure;

if (require.main === module) {   // comparison table
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('case', 6) + pad('description', 66) + pad('grid', 8) + pad('cells wrong', 13) + pad('detail checks', 15) + 'colours warning');
  for (const c of CASES) { const m = measure(c), w = (m.r.report.warn || []).some(x => x.id === 'colours'); console.log(pad(c.id, 6) + pad(c.name, 66) + pad(m.art.w + 'x' + m.art.h, 8) + pad(m.diff + ' (' + Math.round(m.share * 100) + '%)', 13) + pad(c.keep || c.clear ? (m.keepOk && m.clearOk ? 'kept' : 'LOST') : '-', 15) + (w ? 'yes' : 'no') + (c.colours ? ' (expected yes)' : '')); }
  const lost = A.convert(source(LOST), { gh: 16 }).report;
  console.log(pad(LOST.id, 6) + pad(LOST.name, 66) + pad('', 8) + pad('', 13) + 'warnings: ' + (lost.warn.map(w => w.id).join(',') || 'none'));
  if (process.argv.includes('--grids')) for (const c of CASES) { const m = measure(c); console.log('\n' + c.id + ' ' + c.name + '\n  result' + ' '.repeat(Math.max(1, m.art.w - 4)) + 'ideal'); m.art.rows.forEach((row, y) => console.log('  ' + row.replace(/1/g, '#').replace(/0/g, '·') + '  ' + m.ideal[y].replace(/1/g, '#').replace(/0/g, '·'))); }
}
