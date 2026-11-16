// Custom design tests: drawn grids, artwork conversion, the weave draft they become, saving, undo/redo and instructions.
// Expected left lists are rebuilt here from d.art.rows alone, independently of weave.js.
const T = require('./engine.js'); require('./crosswrap.js'); require('./weave.js'); require('./art.js'); const A = T.art, W = T.weave, TAU = 2 * Math.PI;
module.exports = function (ok, near) {
  const mk = (art, o) => T.createDesign('wovencustom', Object.assign({ measured: true, art }, o || {}));
  const rnd = (() => { let s = 4242; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const randArt = (w, h, p) => { const a = A.blank(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rnd() < p) A.set(a, x, y, 1); return a; };
  const expected = (L, a) => { const t = L.text, s = t.s, rows = []; for (let r = 0; r < L.rows; r++) { const x = Math.floor((r - t.pre) / s), row = []; for (let j = 0; j < L.M; j++) { const jj = t.copies > 1 ? j % t.period : j, y = jj - t.off; row.push(x >= 0 && x < a.w && y >= 0 && y < a.h * s && a.rows[Math.floor(y / s)][x] === '1'); } rows.push(row); } return rows; };
  // RGBA helpers for artwork
  const img = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b, a] = f(x, y); const i = (y * w + x) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } return { d, w, h }; };
  const disc = (w, h) => img(w, h, (x, y) => (Math.hypot(x - w / 2, y - h / 2) < h * 0.4) ? [20, 20, 20, 255] : [0, 0, 0, 0]);
  const sqW = (w, h) => img(w, h, (x, y) => (x > w * .25 && x < w * .75 && y > h * .25 && y < h * .75) ? [10, 10, 10, 255] : [255, 255, 255, 255]);
  const conv = (im, o) => A.convert(A.srcFromRGBA(im.d, im.w, im.h), o);

  // ---- grid editing
  (function () {
    const a = A.blank(10, 6);
    ok('CU1 a new grid is the size asked for and valid', a.w === 10 && a.h === 6 && A.valid(a) && A.ink(a) === 0);
    ok('CU2 set/get: adding and erasing cells changes only that cell; out-of-range does nothing', (() => { const b = A.blank(10, 6); const c1 = A.set(b, 3, 2, 1), c2 = A.set(b, 3, 2, 1), g = A.get(b, 3, 2), n = A.ink(b), e = A.set(b, 3, 2, 0), oob = A.set(b, 10, 0, 1) || A.set(b, -1, 0, 1) || A.set(b, 0, 6, 1); return c1 && !c2 && g && n === 1 && e && A.ink(b) === 0 && !oob && A.valid(b); })());
    ok('CU3 clear empties the grid and keeps its size', (() => { const b = randArt(12, 9, .4), c = A.clear(b); return A.ink(c) === 0 && c.w === 12 && c.h === 9 && A.ink(b) > 0; })());
    ok('CU4 resizing keeps the drawing (top-left) and respects the limits', (() => { const b = randArt(12, 9, .4), g = A.resize(b, 20, 12), s = A.resize(b, 6, 5), lim = A.resize(b, 999, 999), lo = A.resize(b, 1, 1); return g.rows.slice(0, 9).every((r, y) => r.slice(0, 12) === b.rows[y]) && s.rows.every((r, y) => r === b.rows[y].slice(0, 6)) && lim.w === A.MAXW && lim.h === A.MAXH && lo.w === A.MINW && lo.h === A.MINH && [g, s, lim, lo].every(A.valid); })());
    ok('CU5 mirror twice is the original; mirror flips along or round the rod', (() => { const b = randArt(9, 7, .4); return JSON.stringify(A.mirror(A.mirror(b, 'x'), 'x').rows) === JSON.stringify(b.rows) && JSON.stringify(A.mirror(A.mirror(b, 'y'), 'y').rows) === JSON.stringify(b.rows) && A.mirror(b, 'x').rows[0] === b.rows[0].split('').reverse().join('') && A.mirror(b, 'y').rows[0] === b.rows[6]; })());
    ok('CU6 templates: blank is empty, symbol is mirror-symmetric, monogram is the font letter doubled', (() => { const bl = A.templates.blank(), sy = A.templates.symbol(), mo = A.templates.monogram('K'); const sym = sy.rows.every((r, y) => r === r.split('').reverse().join('') && r === sy.rows[15 - y]); let mg = true; for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) if (A.get(mo, 2 + x * 2 + i, 1 + y * 2 + j) !== (T.FONT.K[y][x] === '1')) mg = false; return A.ink(bl) === 0 && A.ink(sy) > 20 && sym && mg && [bl, sy, mo].every(A.valid); })());
    ok('CU7 an invalid grid is rejected and never crashes the layout', !A.valid({ w: 3, h: 2, rows: ['01', '010'] }) && (() => { const d = mk(A.blank(8, 8)); d.art = { w: 3, h: 2, rows: ['0'] }; return T.layout(d).rows >= 1; })());
  })();

  // ---- the drawn grid becomes the weave draft
  for (const [w, h, p, o] of [[16, 16, .35, {}], [10, 8, .5, { diameterMm: 12.5 }], [30, 12, .25, { thread: 'D', size: 1 }], [5, 5, .6, { diameterMm: 25, thread: 'E' }]]) {
    const a = randArt(w, h, p), d = mk(a, o), L = T.layout(d), exp = expected(L, a);
    ok('CU8 ' + w + 'x' + h + ': the left list is exactly the drawn grid, scaled, in every row and line', exp.every((row, r) => row.every((v, j) => v === L.unit[r][j])));
    let bad = 0; for (let i = 0; i < 12000; i++) { const z = rnd() * (L.lenAdj + 3) - 1, th = rnd() * TAU, line = Math.floor(th / TAU * L.M), t = Math.floor(z / L.w - th / TAU + 1e-12); let want; if (z < 0) want = -1; else if (t < 0 || t >= L.turnsTotal) want = z < L.turnsTotal * L.w + L.w ? 0 : -1; else if (t < L.nA || t >= L.nA + L.rows * L.tau) want = 1; else want = exp[Math.floor((t - L.nA) / L.tau)][line] ? 0 : 1; if (L.slotAt(z, th) !== want) bad++; }
    ok('CU9 ' + w + 'x' + h + ': the rod preview is the weave (independent over/under model, 12000 points)', bad <= 2, bad);
    ok('CU10 ' + w + 'x' + h + ': lines fill the circumference, margins are equal, scale fits round the blank', near(L.M * L.cellW, L.C, 1e-9) && Math.abs(L.text.pre - (L.rows - L.text.textRows - L.text.pre)) <= 1 && L.M >= h * L.size + 3 - (L.text.copies > 1 ? 0 : 0) && L.text.custom === true);
  }
  ok('CU11 drawing a cell changes the preview and the plan, nothing else moves', (() => { const a = A.templates.symbol(), b = JSON.parse(JSON.stringify(a)); A.set(b, 0, 0, 1); const L1 = T.layout(mk(a)), L2 = T.layout(mk(b)); let diff = 0; L1.unit.forEach((r, i) => r.forEach((v, j) => { if (v !== L2.unit[i][j]) diff++; })); return diff === L1.text.s * L1.text.s * (L1.text.copies) && L1.M === L2.M && L1.rows === L2.rows; })());
  ok('CU12 design scale steps one at a time, bigger scale needs more wrap, and the top scale still fits round the blank', (() => { let L = T.layout(mk(A.templates.symbol(), { size: 1 })); const sz = [L.size], len = [L.lenAdj]; while (L.larger != null) { L = T.layout(mk(A.templates.symbol(), { size: L.larger })); sz.push(L.size); len.push(L.lenAdj); } return sz.every((v, i) => v === i + 1) && len.every((v, i) => i === 0 || v > len[i - 1]) && L.M >= 16 * L.size + 3; })());
  ok('CU13 a design longer than the wrap is flagged with the length it needs; a longer wrap clears it', (() => { const a = randArt(48, 24, .4); a.rows[0] = '1' + a.rows[0].slice(1); const d = mk(a, { size: 1, lengthMm: 30 }), L = T.layout(d), ok2 = T.layout(mk(a, { size: 1, lengthMm: 600 })); return L.warnings.some(w => w.id === 'long' && /This design needs about \d+ mm/.test(w.text)) && L.lenAdj > 30 && !ok2.warnings.some(w => w.id === 'long'); })());
  ok('CU14 an empty grid warns, still gives a plain-wrap plan and steps', (() => { const L = T.layout(mk(A.blank(8, 8))); return L.warnings.some(w => w.id === 'empty') && L.unit.every(r => r.every(v => !v)) && T.steps(mk(A.blank(8, 8))).some(s => s.kind === 'wrow'); })());
  ok('CU15 a grid too tall for a small rod is flagged, never silently squashed', (() => { const L = T.layout(mk(A.blank(8, 24), { diameterMm: 4 })); return L.M >= 24 + 3 && L.warnings.some(w => w.id === 'fine'); })());
  ok('CU16 long floats from big solid blocks are warned', (() => { const a = A.blank(40, 10); for (let y = 0; y < 10; y++) for (let x = 0; x < 40; x++) A.set(a, x, y, 1); const L = T.layout(mk(a, { size: 2, diameterMm: 16, thread: 'E', lengthMm: 600 })); return L.warpFloatMm > 12 && L.warnings.some(w => w.id === 'float'); })());
  ok('CU17 colours: Design = warp (shows where the weft goes under), Background = weft; changing colours never changes the plan', (() => { const a = A.templates.symbol(), d = mk(a), d2 = mk(a); d2.slots = ['red', 'silver']; const L = T.layout(d), L2 = T.layout(d2); let ch = 0, cell = 0; for (let k = 0; k < 2000; k++) { const z = rnd() * L.lenAdj, th = rnd() * TAU; if (L.slotAt(z, th) !== L2.slotAt(z, th)) ch++; } for (let r = 0; r < L.rows; r += 3) for (let j = 0; j < L.M; j += 2) { const th = (j + .5) / L.M * TAU, t = L.nA + r * L.tau + Math.floor(L.tau / 2), z = (t + th / TAU + .5) * L.w; if (L.slotAt(z, th) !== (L.unit[r][j] ? 0 : 1)) cell++; } return ch === 0 && cell === 0 && L.slotNames.join() === 'Design,Background'; })());

  // ---- artwork conversion
  (function () {
    const s = A.srcFromRGBA(new Uint8ClampedArray(400 * 200 * 4).fill(255), 400, 200);
    ok('CU18 a large image is reduced to a packed source no bigger than 96 px a side, keeping its shape', Math.max(s.w, s.h) === 96 && Math.abs(s.w / s.h - 2) < 0.05 && s.d.length === s.w * s.h);
    const r = conv(disc(120, 120), { gh: 16 });
    ok('CU19 transparent artwork: the opaque shape becomes the pattern, transparent becomes background', A.valid(r.art) && r.report.hasAlpha && r.art.h === 16 && r.art.w === 16 && A.get(r.art, 8, 8) && !A.get(r.art, 0, 0) && !A.get(r.art, 15, 0) && r.report.ink > 150 && r.report.ink < 230);
    const q = conv(sqW(100, 100), { gh: 12, crop: false });
    ok('CU20 dark shape on white: the shape is the pattern', !q.report.hasAlpha && A.get(q.art, q.art.w >> 1, q.art.h >> 1) && !A.get(q.art, 0, 0) && q.report.fraction > 0.15 && q.report.fraction < 0.4);
    const inv = img(100, 100, (x, y) => (x > 25 && x < 75 && y > 25 && y < 75) ? [250, 250, 250, 255] : [5, 5, 5, 255]);
    const ia = conv(inv, { gh: 12, crop: false });
    ok('CU21 light shape on a dark background is inverted automatically; the Invert control flips it', ia.report.autoInverted && A.get(ia.art, 6, 6) && !A.get(ia.art, 0, 0) && (() => { const m = conv(sqW(100, 100), { gh: 12, invert: true, crop: false }); return !A.get(m.art, 6, 6) && A.get(m.art, 0, 0); })());
    const grad = img(100, 100, (x, y) => { const v = Math.round(x / 99 * 255); return [v, v, v, 255]; }), lo = conv(grad, { gh: 12, thr: 20, crop: false }), hi = conv(grad, { gh: 12, thr: 80, crop: false });
    ok('CU22 darkness cut-off: a higher cut-off keeps more of the image as pattern', hi.report.ink > lo.report.ink && lo.report.ink > 0);
    const small = img(100, 100, (x, y) => (x > 40 && x < 60 && y > 40 && y < 60) ? [0, 0, 0, 255] : [255, 255, 255, 255]);
    ok('CU23 crop to artwork trims empty margins; without it the margins are kept', (() => { const c = conv(small, { gh: 12, crop: true }), n = conv(small, { gh: 12, crop: false }); return c.report.fraction > 0.8 && n.report.fraction < 0.2; })());
    ok('CU24 size limits: width never exceeds 48 or height 24; aspect is kept', (() => { const wide = conv(img(300, 30, () => [0, 0, 0, 255].map((v, i) => i === 3 ? 255 : v)), { gh: 20 }), sq = conv(disc(120, 120), { gh: 99 }); return wide.art.w <= 48 && wide.art.h <= 24 && sq.art.h === 24 && sq.art.w === 24 && conv(disc(120, 120), { gh: 1 }).art.h === A.MINH; })());
    const noise = img(120, 120, (x, y) => { const v = ((x / 5 | 0) + (y / 5 | 0)) % 2 ? 0 : 255; return [v, v, v, 255]; }), nz = conv(noise, { gh: 24, crop: false });
    ok('CU25 over-detailed artwork is simplified and the builder is warned plainly', nz.report.warn.some(w => w.id === 'detail' && /too detailed/.test(w.text)) && A.valid(nz.art));
    ok('CU26 single specks are removed, single-cell holes filled', (() => { const sp = img(60, 60, (x, y) => ((x > 15 && x < 45 && y > 15 && y < 45) || (x === 3 && y === 3)) ? [0, 0, 0, 255] : [255, 255, 255, 255]); const c = conv(sp, { gh: 20, crop: false }); return c.report.removed >= 0 && !A.get(c.art, 1, 1) && A.get(c.art, 10, 10); })());
    ok('CU27 an empty or all-white image is reported, not turned into a placeholder', conv(img(40, 40, () => [255, 255, 255, 255]), { gh: 12 }).report.warn.some(w => w.id === 'noart') && A.ink(conv(img(40, 40, () => [255, 255, 255, 255]), { gh: 12 }).art) === 0);
    ok('CU28 conversion is deterministic and reproducible from the saved source', (() => { const a = A.fromSource(A.srcFromRGBA(disc(90, 90).d, 90, 90), { gh: 14 }), b = A.fromSource(JSON.parse(JSON.stringify(a.src)), JSON.parse(JSON.stringify(a.conv))); return JSON.stringify(a.rows) === JSON.stringify(b.rows) && a.conv.gh === 14; })());
    // converted art IS the weave draft
    const art = A.fromSource(A.srcFromRGBA(disc(120, 120).d, 120, 120), { gh: 16 }), d = mk(art), L = T.layout(d), exp = expected(L, art);
    ok('CU29 converted artwork is the real weave draft: left list = converted grid, every row and line', exp.every((row, rr) => row.every((v, j) => v === L.unit[rr][j])) && L.unit.some(r => r.some(Boolean)));
    ok('CU30 the conversion warnings reach the layout, so the editor shows them', T.layout(mk(A.fromSource(A.srcFromRGBA(noise.d, 120, 120), { gh: 24, crop: false }))).warnings.some(w => w.id === 'detail'));
    // manual refinement of the converted grid
    const ed = JSON.parse(JSON.stringify(art)); A.set(ed, 0, 0, 1); ed.edited = true; const Le = T.layout(mk(ed));
    ok('CU31 refining the converted grid by hand changes the weave draft and keeps the artwork source', Le.unit.some((r, i) => r.some((v, j) => v !== L.unit[i][j])) && !!ed.src && ed.src.d === art.src.d);
  })();

  // ---- instructions come from the same draft
  for (const [nm, art] of [['symbol', A.templates.symbol()], ['monogram', A.templates.monogram('K')], ['converted disc', A.fromSource(A.srcFromRGBA(disc(100, 100).d, 100, 100), { gh: 14 })]]) {
    const d = mk(art), L = T.layout(d), st = T.steps(d), rows = st.filter(s => s.kind === 'wrow');
    ok('CU32 ' + nm + ': row steps cover every row once, in order, with no repeat step', rows[0].rowFrom === 0 && rows[rows.length - 1].rowTo === L.rows - 1 && rows.every((s, i) => i === 0 || s.rowFrom === rows[i - 1].rowTo + 1) && !st.some(s => s.kind === 'wrepeat'));
    ok('CU33 ' + nm + ': each step lists exactly the lines the weft goes under, and turns add up', rows.every(s => { const u = []; expected(L, art)[s.rowFrom].forEach((v, j) => { if (v) u.push(j); }); return JSON.stringify(u) === JSON.stringify(s.under); }) && 2 * L.nA + rows.reduce((a, s) => a + s.turns, 0) === L.turnsTotal);
    ok('CU34 ' + nm + ': steps name the design column or plain wrap, give the thread, turns and what is next', rows.every(s => /column|plain wrap/.test(s.chips.join()) && /weft/.test(s.head) && s.legs[1].action && /turns/.test(s.legs[2].action) && s.next) && JSON.stringify(st).indexOf('undefined') < 0 && JSON.stringify(st).indexOf('NaN') < 0);
    const mid = rows.find(s => s.under.length), dg = W.diagramSVG(d, L, mid), cells = dg.match(/<rect [^>]*data-r[^>]*>/g) || [];
    ok('CU35 ' + nm + ': the enlarged chart matches the draft and marks the active rows', cells.length > 0 && cells.every(c => +c.match(/data-lift="(\d)"/)[1] === (L.unit[+c.match(/data-r="(\d+)"/)[1]][+c.match(/data-j="(\d+)"/)[1]] ? 1 : 0)) && /data-state="active"/.test(dg) && (dg.match(/data-under="1"/g) || []).length === mid.under.length);
    ok('CU36 ' + nm + ': quantities and printable guide come from the draft', L.threadsTotal === L.M * L.g && /whole design/.test(W.templateHTML(d)) && (W.templateHTML(d).match(/<text /g) || []).length === L.M && L.evidence.bench === 'Not bench tested');
  }

  // ---- saving, reopening, undo/redo
  (function () {
    const art = A.fromSource(A.srcFromRGBA(disc(100, 100).d, 100, 100), { gh: 14, thr: 40, invert: false }), d = mk(art, { name: 'Disc', diameterMm: 10.5, lengthMm: 200, thread: 'D', size: 1 }); d.slots = ['red', 'silver'];
    let list = A.libUpsert([], d, 1000); const id = list[0].id;
    ok('CU37 saving gives the design an id and stores plain JSON', list.length === 1 && /^c/.test(id) && JSON.stringify(list).length > 100 && JSON.parse(JSON.stringify(list))[0].design.art.rows.length === art.h);
    const back = JSON.parse(JSON.stringify(list))[0].design, Lb = T.layout(back), La = T.layout(d);
    ok('CU38 reopening restores colours, dimensions, scale, artwork source and conversion settings, and the identical weave', back.slots.join() === 'red,silver' && back.diameterMm === 10.5 && back.lengthMm === 200 && back.thread === 'D' && back.size === 1 && back.name === 'Disc' && back.art.src.d === art.src.d && back.art.conv.thr === 40 && JSON.stringify(Lb.unit) === JSON.stringify(La.unit));
    const d2 = JSON.parse(JSON.stringify(d)); d2.id = id; d2.name = 'Disc v2'; const l2 = A.libUpsert(list, d2, 2000), other = A.libUpsert(l2, mk(A.templates.symbol(), { name: 'Sym' }), 3000);
    ok('CU39 saving again updates in place; new designs are added first; delete removes only that one', l2.length === 1 && l2[0].name === 'Disc v2' && other.length === 2 && other[0].name === 'Sym' && A.libRemove(other, id).length === 1 && A.libRemove(other, id)[0].name === 'Sym');
    const h = new T.History(mk(A.blank(8, 8))); const a1 = JSON.parse(JSON.stringify(h.cur())); A.set(a1.art, 1, 1, 1); h.push(a1, null, 10); const a2 = JSON.parse(JSON.stringify(a1)); A.set(a2.art, 2, 2, 1); h.push(a2, null, 20);
    ok('CU40 undo and redo walk back and forward through drawn strokes, exactly', h.undo().art.rows[2][2] === '0' && h.cur().art.rows[1][1] === '1' && h.undo().art.rows[1][1] === '0' && !h.can(true) && h.redo().art.rows[1][1] === '1' && h.redo().art.rows[2][2] === '1');
    ok('CU41 a conversion change is one undo step and can be undone back to the previous conversion', (() => { const h2 = new T.History(mk(art)), n = JSON.parse(JSON.stringify(h2.cur())); n.art = A.fromSource(n.art.src, Object.assign({}, n.art.conv, { gh: 20 })); h2.push(n, 'art', 5); return h2.cur().art.h !== art.h && h2.undo().art.h === art.h; })());
  })();
};
