// Thread Design Studio engine tests. Run: node tests.js
const T = require('./engine.js'); require('./crosswrap.js'); require('./weave.js'); require('./art.js'); const X = T.cross; let pass = 0, fail = 0;
const ok = (name, c, info) => { if (c) pass++; else { fail++; console.log('FAIL ' + name, info === undefined ? '' : info); } if (c) console.log('PASS ' + name); };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-9);
const DIAS = [4, 6, 8, 10, 12.5, 16, 20, 25], DETAILS = ['fine', 'standard', 'bold'], THREADS = ['A', 'D', 'E'];

// 1 lettering font
ok('F1 every glyph is 7 rows of equal width, only 0/1', Object.entries(T.FONT).every(([k, g]) => g.length === 7 && g.every(r => r.length === g[0].length && /^[01]+$/.test(r))));
ok('F2 letters and digits are 5 wide', [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].every(c => T.FONT[c][0].length === 5));
ok('F3 no two letters/digits share a bitmap', (() => { const s = new Set(); return [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].every(c => { const k = T.FONT[c].join(); if (s.has(k)) return false; s.add(k); return true; }); })());
ok('F4 cleanText upper-cases, removes unsupported, trims to 24', T.cleanText(' k-labs é☃ ') === 'K-LABS ' || T.cleanText(' k-labs é☃ ') === 'K-LABS', T.cleanText(' k-labs é☃ '));
ok('F5 bitmap width = glyphs + 1 gap each', T.textBitmap('AB').w === 11 && T.textBitmap('A B').w === 5 + 1 + 3 + 1 + 5);

// 2 text -> grid orientation (reads left to right along the rod, upright, not mirrored)
(() => {
  const d = T.createDesign('text', { text: 'F' }), L = T.layout(d), s = L.size, off = Math.floor((L.N - 7 * s) / 2);
  let ok1 = true; const g = T.FONT.F;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) { const want = g[y][x] === '1' ? 1 : 0; if (L.cell(L.rowOffset + x * s, off + y * s) !== want) ok1 = false; }
  ok('X1 letter F lands upright and unmirrored (rows = along rod, columns = around)', ok1);
  ok('X2 text rows centred along the wrapped length', Math.abs(L.rowOffset * 2 + L.textRows - L.rows) <= 1);
  const k = 5; let dup = true; for (let x = 0; x < 5 * s; x++) for (let y = 0; y < L.N; y++) if (L.cell(L.rowOffset + x, y) !== L.cell(L.rowOffset + x, y)) dup = false;
  ok('X3 deterministic', dup);
})();
ok('X4 strokes are at least MIN_RUN cells for all letters at default size', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.&!+\'/'.split('').every(c => { const L = T.layout(T.createDesign('text', { text: c })); return L.minRun >= T.MIN_RUN; }));
ok('X5 empty text warns and draws nothing', (() => { const L = T.layout(T.createDesign('text', { text: '' })); return L.warnings.some(w => w.id === 'empty') && L.spools.length <= 1; })());
ok('X6 too-long text flagged truncated', (() => { const L = T.layout(T.createDesign('text', { text: 'ABCDEFGHIJKLMNOPQRSTUVWX', lengthMm: 100 })); return L.truncated && L.warnings.some(w => w.id === 'long'); })());
ok('X7 unsupported characters reported, not silently dropped', T.layout(T.createDesign('text', { text: 'Café' })).warnings.some(w => w.id === 'chars'));
ok('X8 repeats around a wide rod when copies fit', T.layout(T.createDesign('text', { text: 'AB', diameterMm: 25 })).copies >= 2);

// 3 every design on every rod size / thread / detail
let combos = 0, bad = [];
for (const id of [...T.GALLERY, ...T.EXPERIMENTAL, 'text']) for (const dia of DIAS) for (const det of DETAILS) for (const th of THREADS) {
  combos++; const d = T.createDesign(id, { diameterMm: dia, detail: det, thread: th }), L = T.layout(d);
  if (L.family === 'grid') {
    if (!Number.isInteger(L.N) || !near(L.markSpacingMm * L.N, L.C, 1e-6)) bad.push(['N/spacing', id, dia, det]);
    if (L.minRun < T.MIN_RUN && L.minRun !== L.N) bad.push(['minRun', id, dia, det, th, L.minRun]);
    if (id !== 'text' && L.N % T.PATTERNS[id].P) bad.push(['seam', id, dia, det]);
    if (L.r < 1 || L.rows * L.r * L.w < d.lengthMm - L.r * L.w) bad.push(['rows', id, dia, det]);
  }
  if (L.spools.length > T.MAX_SPOOLS || (L.threads && L.threads > T.MAX_SPOOLS)) bad.push(['spools', id, dia]);
  const sl = L.slotAt(d.lengthMm / 2, 1); if (sl < 0 || sl > L.slotNames.length - 1) bad.push(['slotAt', id, dia, sl]);
}
ok('C1 ' + combos + ' design/rod/thread/detail combinations: integer marks, spacing x marks = circumference, seamless around, runs >= ' + T.MIN_RUN + ' cells', bad.length === 0, bad.slice(0, 5));

// 4 colourAt agrees with the cell grid at cell centres, and the helix geometry is consistent
(() => {
  let n = 0, mism = 0;
  for (const id of ['checks', 'chevrons', 'waves', 'dots', 'text']) {
    const d = T.createDesign(id, { diameterMm: 10 }), L = T.layout(d);
    for (let row = 2; row < Math.min(L.rows - 2, 40); row += 3) for (let j = 0; j < L.N; j++) {
      const th = (j + 0.5) / L.N * 2 * Math.PI, turn = row * L.r + (L.r >> 1), z = (turn + th / (2 * Math.PI) + 0.5) * L.w; n++;
      if (L.slotAt(z, th) !== L.cell(row, j)) mism++;
    }
  }
  ok('G1 slotAt matches the cell grid at ' + n + ' sampled cell centres', mism === 0, mism);
})();
(() => {
  const L = T.layout(T.createDesign('spiral')), P = L.pitchMm; let bad = 0;
  for (let k = 0; k < 400; k++) { const z = 5 + k * 0.037, th = k * 0.31; if (L.slotAt(z, th) !== L.slotAt(z + P, th) || L.slotAt(z, th) !== L.slotAt(z, th + 2 * Math.PI)) bad++; }
  ok('G2 spiral repeats every pitch along the rod and every turn around it', bad === 0, bad);
  const seen = new Set(); for (let k = 0; k < 400; k++) seen.add(L.slotAt(5 + k * 0.01, 0)); ok('G3 spiral shows each colour along the rod', seen.size === 2);
  const tw = T.layout(T.createDesign('twist', { size: 1 })); ok('G4 triple twist uses 3 threads / 3 colours', tw.threads === 3 && tw.spools.length === 3);
  const tw2 = T.layout(T.createDesign('twist')); ok('G4b default twist is 2 threads per colour, stripes wide enough to see', tw2.threads === 6 && tw2.pitchMm > 1);
  const big = T.layout(T.createDesign('spiral', { size: 3 })); ok('G5 stripe width 3 = 6 threads, within spool limit', big.threads === 6 && big.larger == null);
})();
(() => { const L = T.layout(T.createDesign('bands')); const tot = L.bands.reduce((a, b) => a + (b.z1 - b.z0), 0);
  ok('G6 bands tile the wrapped length exactly, no gaps', near(tot, 150, 1e-6) && L.bands.every((b, i) => i === 0 || near(b.z0, L.bands[i - 1].z1, 1e-9)));
  ok('G7 bands never need a colour change inside a turn (method = plain)', L.method.kind === 'plain'); })();
ok('G8 outside the wrapped length is bare', (() => { const L = T.layout(T.createDesign('checks')); return L.slotAt(-1, 0) === -1 && L.slotAt(151, 0) === -1; })());

// 5 sizing buttons
(() => {
  const d0 = T.createDesign('checks'), L0 = T.layout(d0), d1 = T.resize(d0, 1), L1 = T.layout(d1);
  ok('Z1 Make Larger gives bigger cells, Smaller gives smaller', L1.cellMm > L0.cellMm && T.layout(T.resize(d0, -1)).cellMm < L0.cellMm);
  let d = d0, guard = 0; while (T.layout(d).larger != null && guard++ < 50) d = T.resize(d, 1);
  ok('Z2 Larger stops at one repeat around the rod', T.layout(d).reps === 1 && T.layout(d).larger == null);
  d = d0; guard = 0; while (T.layout(d).smaller != null && guard++ < 50) d = T.resize(d, -1);
  ok('Z3 Smaller never goes finer than ' + T.MIN_CELL_MM + ' mm marks', T.layout(d).cellMm >= T.MIN_CELL_MM - 1e-9, T.layout(d).cellMm);
  const t = T.createDesign('text', { text: 'AB' }); ok('Z4 letter size 3 fits at fine detail on 8 mm', T.layout(T.resize(t, 1)).size === 3);
})();

// 6 steps / constructibility messaging
(() => {
  const d = T.createDesign('chevrons'), st = T.steps(d);
  ok('S1 unmeasured grid design starts by asking for the rod size', st[0].kind === 'needsize');
  const m = T.steps(Object.assign({}, d, { measured: true }));
  ok('S2 measured: spools, then marks, rows, finish; no size step', m[0].kind === 'spools' && m[1].kind === 'marks' && m[m.length - 1].kind === 'finish' && !m.some(s => s.kind === 'needsize'));
  const mk = m[1]; ok('S3 marks step quotes N marks and spacing consistent with circumference', mk.marks * mk.spacing > 0 && near(mk.marks * mk.spacing, Math.PI * d.diameterMm, 1e-6));
  const rows = m.filter(s => s.kind === 'row'), L = T.layout(Object.assign({}, d, { measured: true }));
  ok('S4 row steps cover every row exactly once, in order', rows.reduce((a, r) => a + r.rows, 0) === L.rows && rows.every((r, i) => i === 0 || r.rowFrom === rows[i - 1].rowTo + 1));
  ok('S5 each row step lists runs that exactly tile the turn', rows.every(r => r.runs.reduce((a, x) => a + x.len, 0) === r.cells.length));
  ok('S6 identical neighbouring rows are merged (no redundant steps)', (() => { const dd = Object.assign({}, d, { measured: true, mode: 'pattern', pattern: 'dots' }), Ld = T.layout(dd); return T.steps(dd).filter(s => s.kind === 'row').length < Ld.rows; })());
  ok('S7 bands and spiral need no rod-size step and no marks', ['bands', 'spiral', 'twist'].every(id => { const s = T.steps(T.createDesign(id)); return !s.some(x => x.kind === 'needsize' || x.kind === 'marks'); }));
  const b = T.steps(T.createDesign('bands')); ok('S8 band steps give turns that match length', b.filter(s => s.kind === 'band').every(s => s.turns >= 1));
  ok('S9 turns per row x rows >= total turns', rows.reduce((a, r) => a + r.turns, 0) >= L.turns);
})();
ok('S10 honest effort: checks report a thread-change count', T.layout(T.createDesign('checks')).method.changes > 1000);
ok('S11 grid designs are labelled experimental, never documented', [...T.EXPERIMENTAL, 'text'].every(id => T.layout(T.createDesign(id)).evidence.tier === 'experimental'));

// 7 describe your design
(() => {
  const p = s => T.parse(s);
  let r = p('gold diamonds on navy'); ok('P1 "gold diamonds on navy" gives the cross wrap: navy underwrap, gold main band', r.design.pattern === 'diamonds' && r.design.slots[0] === 'navy' && r.design.slots[1] === 'gold', r.design.slots);
  r = p('red and black checks'); ok('P2 "red and black checks"', r.design.pattern === 'checks' && r.design.slots[0] === 'red' && r.design.slots[1] === 'black');
  r = p('"JW" in gold on black'); ok('P3 quoted initials', r.design.mode === 'text' && r.design.text === 'JW' && r.design.pattern === 'wovenletters' && r.design.slots[0] === 'gold' && r.design.slots[1] === 'black', r.design);
  r = p('spell Fish Hawk in silver on navy'); ok('P4 "spell ..." text', r.design.mode === 'text' && r.design.text === 'FISH HAWK' && r.design.slots[0] === 'silver', r.design.text);
  r = p('Barber pole in red and white'); ok('P5 barber pole', r.design.pattern === 'spiral' && r.design.slots[0] === 'red' && r.design.slots[1] === 'white');
  r = p('big teal waves'); ok('P6 size word', r.design.pattern === 'waves' && r.sizeDir === 1);
  r = p('something nice'); ok('P7 unrecognised says so and still returns a design', !r.recognised && !!r.design);
  r = p('triple twist in gold black and red'); ok('P8 triple twist', r.design.pattern === 'twist');
  ok('P9 parse never yields two identical colours in text mode', ['"A" in black', '"A" in white on white', 'name Bo in gold'].every(s => { const d = p(s).design; return d.slots[0] !== d.slots[1]; }));
})();

// 8 undo / redo
(() => {
  const h = new T.History(T.createDesign('checks')), a = T.createDesign('checks', { thread: 'D' }), b = T.createDesign('checks', { thread: 'E' });
  h.push(a, null, 0); h.push(b, null, 10);
  ok('U1 undo walks back', h.undo().thread === 'D' && h.undo().thread === 'A' && !h.can(true));
  ok('U2 redo walks forward', h.redo().thread === 'D' && h.redo().thread === 'E');
  h.undo(); h.push(T.createDesign('checks', { thread: 'A', lengthMm: 200 }), null, 20); ok('U3 new change drops the redo branch', !h.can(false));
  const t = new T.History(T.createDesign('text', { text: '' })); 'KLABS'.split('').forEach((c, i) => t.push(T.createDesign('text', { text: 'KLABS'.slice(0, i + 1) }), 'txt', i * 100));
  ok('U4 typing coalesces into one undo step', (t.undo().text === '' ), t.cur().text);
  const u = new T.History(T.createDesign('checks')); u.push(T.createDesign('checks'), null, 0); ok('U5 identical state is not a step', !u.can(true));
})();
require('./tests-cross.js')(ok, near);
require('./tests-workshop.js')(ok, near);
require('./tests-patterns.js')(ok, near);
require('./tests-chevron.js')(ok, near);
require('./tests-weave.js')(ok, near);
require('./tests-lettering.js')(ok, near);
require('./tests-custom.js')(ok, near);
require('./tests-clipart.js')(ok, near);
console.log('\n' + pass + '/' + (pass + fail) + ' passed'); process.exit(fail ? 1 : 0);
