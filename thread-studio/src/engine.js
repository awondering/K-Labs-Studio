/* K-Labs Thread Design Studio: engine (pure, no DOM).
   Model: a design is painted onto a rod by a thread helix. Position (z along the rod, theta around it) maps to the
   thread turn that covers it: turn = floor(z/w - theta/2pi) for one thread of width w.
   Three construction families, each physically distinct:
     bands  : colour depends on z only. Colour changes only BETWEEN turns. Plain wrapping.
     spiral : several threads wound side by side in one helix (L threads, pitch L*w). No cuts.
     grid   : a cell grid (N marks around x rows along). Colour changes inside a turn at marked positions
              (cut-and-restart). Checks, diamonds, chevrons, waves, dots, lettering.
   Nothing here claims a hand-wrapping bench trial has been done; see STATUS.md. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, T = {};
  const hexOf = {};
  T.THREADS = [
    ['black', 'Black', '#17171a'], ['charcoal', 'Charcoal', '#4a4d52'], ['silver', 'Silver', '#b9bcc0'], ['white', 'White', '#f1eee6'],
    ['cream', 'Cream', '#e3d3a8'], ['gold', 'Gold', '#d1a02b'], ['yellow', 'Yellow', '#f0d23a'], ['orange', 'Orange', '#e8731f'],
    ['red', 'Red', '#cc2330'], ['wine', 'Wine', '#7a1830'], ['pink', 'Pink', '#e86f9b'], ['purple', 'Purple', '#6b3fa0'],
    ['navy', 'Navy', '#14234f'], ['royal', 'Royal Blue', '#1f4fc4'], ['sky', 'Sky Blue', '#6db7e8'], ['teal', 'Teal', '#17898a'],
    ['green', 'Green', '#2e9a4a'], ['forest', 'Forest', '#17452d'], ['brown', 'Brown', '#6b4426']
  ].map(a => (hexOf[a[0]] = a[2], { id: a[0], name: a[1], hex: a[2] }));
  T.thread = id => T.THREADS.find(t => t.id === id) || T.THREADS[0];
  // Typical wrapped widths: approximate. The builder should pack ~20 turns and measure their own thread.
  T.THREAD_SIZES = [{ id: 'A', name: 'Size A', mm: 0.18 }, { id: 'D', name: 'Size D', mm: 0.25 }, { id: 'E', name: 'Size E', mm: 0.30 }];
  T.DETAIL = { fine: 1.0, standard: 1.5, bold: 2.5 };           // target mark spacing around the rod, mm
  T.MIN_CELL_MM = 1.0;                                            // finer than this is not realistic to mark by hand
  T.MIN_RUN = 2;                                                  // shortest colour run (cells) accepted
  T.MAX_SPOOLS = 6;
  T.DEFAULT_DIAMETER = 8;

  // ---------- 5x7 lettering ----------
  const G = {
    A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
    D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
    J: '00111 00010 00010 00010 00010 10010 01100', K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110',
    P: '11110 10001 10001 11110 10000 10000 10000', Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100', U: '10001 10001 10001 10001 10001 10001 01110',
    V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 11011 10001', X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
    0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
    3: '11110 00001 00001 01110 00001 00001 11110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
    6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
    9: '01110 10001 10001 01111 00001 00010 01100',
    '-': '00000 00000 00000 11111 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100', '&': '01100 10010 10100 01000 10101 10010 01101',
    '!': '00100 00100 00100 00100 00100 00000 00100', '+': '00000 00100 00100 11111 00100 00100 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
    '/': '00001 00010 00010 00100 01000 01000 10000'
  };
  T.FONT = {}; Object.keys(G).forEach(k => { T.FONT[k] = G[k].split(' '); });
  T.FONT[' '] = ['000', '000', '000', '000', '000', '000', '000'];
  // Accented letters and macrons are woven as their base capital (Tāne -> TANE, Zoë -> ZOE, Ø -> O, Æ -> AE); the
  // accent itself is too small to weave. Only characters that still have no letter are left out (and reported).
  const LIGATURES = { 'Æ': 'AE', 'Œ': 'OE', 'Ø': 'O', 'Ł': 'L', 'Đ': 'D', 'Ð': 'D', 'Þ': 'TH', 'Ħ': 'H', 'Ŧ': 'T', 'Ŋ': 'N' };
  T.foldText = s => String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ÆŒØŁĐÐÞĦŦŊ]/g, ch => LIGATURES[ch]);
  T.cleanText = s => T.foldText(s).replace(/[^A-Z0-9 \-.&!+'/]/g, ' ').replace(/\s+/g, ' ').replace(/^ +/, '').slice(0, 24);
  T.droppedChars = s => Array.from(T.foldText(s).replace(/\s+/g, ' ')).filter(ch => !/[A-Z0-9 \-.&!+'/]/.test(ch));
  T.textBitmap = function (text) {
    const t = T.cleanText(text).replace(/ +$/, ''), cols = [];
    for (let k = 0; k < t.length; k++) { const g = T.FONT[t[k]]; for (let x = 0; x < g[0].length; x++) cols.push(g.map(r => r[x] === '1' ? 1 : 0)); if (k < t.length - 1) cols.push([0, 0, 0, 0, 0, 0, 0]); }
    return { w: cols.length, h: 7, px: (x, y) => (cols[x] && cols[x][y]) ? 1 : 0, text: t };
  };

  // ---------- patterns ----------
  const PAT = {
    bands: { name: 'Racing bands', family: 'bands', slots: ['Main', 'Stripe', 'Edge'], colours: ['navy', 'gold', 'white'] },
    spiral: { name: 'Barber pole', family: 'spiral', nc: 2, slots: ['Colour 1', 'Colour 2'], colours: ['red', 'black'] },
    twist: { name: 'Triple twist', family: 'spiral', nc: 3, slots: ['Colour 1', 'Colour 2', 'Colour 3'], colours: ['gold', 'black', 'red'] },
    checks: { name: 'Checks', family: 'grid', P: 4, Q: 4, slots: ['Colour 1', 'Colour 2'], colours: ['black', 'gold'], tile: (i, j) => (((j >> 1) + (i >> 1)) & 1) },
    diamonds: { name: 'Diamond cross wrap', family: 'cross', slots: ['Underwrap', 'Main colour', 'Inner outline', 'Outer outline'], colours: ['navy', 'red', 'silver', 'black'] },
    doublediamond: { name: 'Double diamond', family: 'cross', slots: ['Underwrap', 'Core band', 'Inner frame', 'Outer frame'], colours: ['navy', 'red', 'silver', 'gold'] },
    chain: { name: 'Diamond chain', family: 'cross', slots: ['Underwrap', 'Link colour', 'Chain colour', 'Outline'], colours: ['navy', 'red', 'gold', 'black'] },
    chevronwrap: { name: 'Chevron wrap', family: 'cross', slots: ['Underwrap', 'Main colour', 'Second colour', 'Outline'], colours: ['navy', 'red', 'gold', 'black'] },
    herringbone: { name: 'Woven herringbone', family: 'weave', slots: ['Warp', 'Weft'], colours: ['black', 'gold'] },
    wovendiamond: { name: 'Woven diamonds', family: 'weave', slots: ['Warp', 'Weft', 'Warp accent'], colours: ['navy', 'silver', 'red'] },
    layered: { name: 'Multi-layer diamond', family: 'cross', slots: ['Underwrap', 'Main colour', 'Inner outline', 'Outer outline', 'Overlay'], colours: ['navy', 'red', 'silver', 'black', 'gold'] },
    wovencustom: { name: 'My design', family: 'weave', slots: ['Design', 'Background'], colours: ['gold', 'black'] },
    wovenletters: { name: 'Woven lettering', family: 'weave', slots: ['Lettering', 'Background'], colours: ['gold', 'black'] },
    chevrons: { name: 'Chevrons', family: 'grid', P: 8, Q: 8, slots: ['Colour 1', 'Colour 2'], colours: ['black', 'red'],
      tile: (i, j) => (Math.floor((i + Math.abs((j % 8) - 3.5)) / 2) & 1) },
    waves: { name: 'Waves', family: 'grid', P: 12, Q: 8, slots: ['Colour 1', 'Colour 2'], colours: ['teal', 'white'],
      tile: (i, j) => ((((i + Math.round(3 * Math.sin(TAU * (j % 12) / 12))) % 8 + 8) % 8) < 4 ? 1 : 0) },
    dots: { name: 'Polka dots', family: 'grid', P: 6, Q: 6, slots: ['Background', 'Dots'], colours: ['black', 'silver'],
      tile: (i, j) => { const a = i % 6, b = j % 6; return ((a < 2 && b < 2) || (a >= 3 && a < 5 && b >= 3 && b < 5)) ? 1 : 0; } },
    text: { name: 'Lettering', family: 'grid', slots: ['Background', 'Lettering'], colours: ['black', 'gold'] }
  };
  T.PATTERNS = PAT;
  T.GALLERY = ['diamonds', 'doublediamond', 'chain', 'layered', 'chevronwrap', 'herringbone', 'wovendiamond', 'wovenletters', 'bands', 'spiral', 'twist'];
  T.EXPERIMENTAL = ['checks', 'chevrons', 'waves', 'dots'];   // colour-change method: kept, labelled experimental
  const BAND_UNIT = [[0, 8], [1, 1.5], [2, 1], [1, 1.5]], BAND_SCALE = [0.5, 0.75, 1, 1.5, 2, 3];

  T.createDesign = function (kind, over) {
    const p = PAT[kind] || PAT.checks, text = kind === 'text' || kind === 'wovenletters';
    const d = { v: 1, mode: text ? 'text' : 'pattern', pattern: text ? kind : kind, text: kind === 'wovenletters' ? 'K-LABS' : text ? 'YOUR NAME' : '', slots: p.colours.slice(),
      size: kind === 'spiral' ? 3 : kind === 'twist' ? 2 : p.family === 'cross' ? 1 : null, bandThreads: p.family === 'cross' ? (T.cross ? T.cross.SPEC[kind].defN : 5) : undefined, detail: text ? 'fine' : 'standard', diameterMm: T.DEFAULT_DIAMETER, measured: false, lengthMm: 150, thread: 'A' };
    if (kind === 'wovencustom') { d.art = T.art.templates.blank(); d.name = 'My design'; }
    return Object.assign(d, over || {});
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  T.clone = clone;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- layout ----------
  T.layout = function (d) {
    const pat = PAT[d.mode === 'text' && d.pattern !== 'wovenletters' ? 'text' : d.pattern] || PAT.checks;
    const C = Math.PI * d.diameterMm, w = (T.THREAD_SIZES.find(s => s.id === d.thread) || T.THREAD_SIZES[0]).mm;
    const turns = Math.floor(d.lengthMm / w);
    const L = { d, C, w, len: d.lengthMm, turns, family: pat.family, warnings: [], patName: pat.name, slotNames: pat.slots };
    const norm = th => { th = th % TAU; return th < 0 ? th + TAU : th; };
    if (!d.measured) L.warnings.push({ id: 'size', level: 'info', text: 'Preview uses a standard ' + T.DEFAULT_DIAMETER + ' mm rod. Enter your measured rod size before marking.', fix: 'rodsize' });
    if (pat.family === 'cross') return T.cross.layout(d, L);
    if (pat.family === 'weave') return T.weave.layout(d, L);

    if (pat.family === 'bands') {
      const si = d.size == null ? 2 : clamp(d.size, 0, BAND_SCALE.length - 1), sc = BAND_SCALE[si];
      const unit = BAND_UNIT.map(([s, mm]) => [s, mm * sc]), ul = unit.reduce((a, b) => a + b[1], 0);
      L.size = si; L.larger = si < BAND_SCALE.length - 1 ? si + 1 : null; L.smaller = si > 0 ? si - 1 : null; L.sizeLabel = 'Repeat ' + ul.toFixed(1) + ' mm';
      // explicit band list (clipped to length)
      L.bands = []; let z0 = 0, k = 0;
      while (z0 < d.lengthMm - 1e-9) { const [s, mm] = unit[k % unit.length]; const z1 = Math.min(d.lengthMm, z0 + mm); L.bands.push({ slot: s, z0, z1, turns: Math.max(1, Math.round((z1 - z0) / w)) }); z0 = z1; k++; }
      L.slotAt = (z, th) => { if (z < 0 || z >= d.lengthMm) return -1; const u = z % ul; let a = 0; for (let q = 0; q < unit.length; q++) { a += unit[q][1]; if (u < a) return unit[q][0]; } return unit[unit.length - 1][0]; };
      L.method = { kind: 'plain', label: 'Plain wrap · colour changes only between turns', changes: L.bands.length - 1 }; L.evidence = { tier: 'standard', label: 'Standard plain wrap', bench: 'Not bench tested' };
      L.spools = [...new Set(L.bands.map(b => b.slot))].sort();
      return L;
    }
    if (pat.family === 'spiral') {
      const nc = pat.nc, mMax = Math.floor(T.MAX_SPOOLS / nc), m = d.size == null ? 1 : clamp(d.size, 1, mMax), Lt = m * nc;
      L.size = m; L.larger = m < mMax ? m + 1 : null; L.smaller = m > 1 ? m - 1 : null; L.threads = Lt; L.perColour = m;
      L.sizeLabel = Lt + ' threads wound together';
      L.slotAt = (z, th) => { if (z < 0 || z >= d.lengthMm) return -1; const u = Math.floor(z / w - Lt * norm(th) / TAU); return Math.floor((((u % Lt) + Lt) % Lt) / m); };
      L.pitchMm = Lt * w; L.spools = Array.from({ length: nc }, (_, i) => i);
      L.method = { kind: 'spiral', label: 'Spiral · wind ' + Lt + ' threads together, no cuts', changes: 0 }; L.evidence = { tier: 'basic', label: 'Basic multi-thread spiral', bench: 'Not bench tested' };
      return L;
    }
    // grid
    const cell0 = T.DETAIL[d.detail] || T.DETAIL.standard, N0 = Math.max(1, Math.round(C / cell0));
    let N, cellFn, P0 = pat.P, bm = null, s = 2, copies = 1, period = 0, off = 0;
    if (d.mode === 'text') {
      bm = T.textBitmap(d.text); const smax = Math.max(2, Math.floor((N0 - 3) / 7));
      s = clamp(d.size == null ? 2 : d.size, 2, smax); period = 7 * s + 3; copies = Math.max(1, Math.floor(N0 / period));
      N = copies > 1 ? copies * period : Math.max(N0, period); if (copies === 1) { period = N; off = Math.floor((N - 7 * s) / 2); } else off = 1;
      L.size = s; L.larger = s < smax ? s + 1 : null; L.smaller = s > 2 ? s - 1 : null; L.copies = copies;
      L.textRows = bm.w * s; L.bitmap = bm;
    } else {
      const repMax = Math.max(1, Math.floor(C / (pat.P * T.MIN_CELL_MM))), reps = clamp(d.size == null ? Math.round(N0 / pat.P) : d.size, 1, repMax);
      N = pat.P * reps; L.size = reps; L.larger = reps > 1 ? reps - 1 : null; L.smaller = reps < repMax ? reps + 1 : null; L.reps = reps;
    }
    const cellMm = C / N, r = Math.max(1, Math.round(cellMm / w)), rows = Math.ceil(turns / r);
    L.N = N; L.cellMm = cellMm; L.r = r; L.rows = rows; L.rowMm = r * w; L.markSpacingMm = cellMm;
    if (d.mode === 'text') {
      const rowOff = Math.max(0, Math.floor((rows - L.textRows) / 2)); L.rowOffset = rowOff; L.truncated = L.textRows > rows;
      cellFn = (row, j) => { const jj = copies > 1 ? j % period : j, y = jj - off; if (y < 0 || y >= 7 * s) return 0; const x = Math.floor((row - rowOff) / s); return (x >= 0 && x < bm.w && bm.px(x, Math.floor(y / s))) ? 1 : 0; };
      L.sizeLabel = 'Letters ' + (7 * s * cellMm).toFixed(1) + ' mm tall';
    } else { cellFn = (row, j) => pat.tile(row % pat.Q, j % pat.P); L.sizeLabel = 'Repeat ' + (pat.P * cellMm).toFixed(1) + ' mm'; }
    L.cell = cellFn;
    L.rowCells = row => { const a = new Array(N); for (let j = 0; j < N; j++) a[j] = cellFn(row, j); return a; };
    L.slotAt = (z, th) => { if (z < 0) return -1; th = norm(th); const t = Math.floor(z / w - th / TAU); if (t < 0 || t >= turns) return -1; return cellFn(Math.floor(t / r), Math.floor(th / TAU * N) % N); };
    // statistics over every row
    let minRun = N, changes = 0, used = new Set(), maxRows = Math.min(rows, 4000);
    for (let row = 0; row < maxRows; row++) { const rr = T.runs(L.rowCells(row)); rr.forEach(x => used.add(x.slot)); if (rr.length > 1) { changes += rr.length * r; rr.forEach(x => { if (x.len < minRun) minRun = x.len; }); } }
    L.minRun = minRun; L.spools = [...used].sort(); L.method = { kind: 'changes', label: 'Colour-change wrap · ' + changes + ' thread changes', changes };
    L.evidence = { tier: 'experimental', label: 'Experimental colour-change method', bench: 'Not bench tested' };
    L.effort = changes < 200 ? 'Quick' : changes < 800 ? 'Long job' : 'Very long job';
    if (d.mode !== 'text' && cellMm < T.MIN_CELL_MM - 1e-9) L.warnings.push({ id: 'fine', level: 'warn', text: 'Marks would be ' + cellMm.toFixed(2) + ' mm apart, too fine to mark by hand on this rod. Use a larger rod size or another pattern.' });
    if (minRun < T.MIN_RUN) L.warnings.push({ id: 'run', level: 'warn', text: 'Some colour runs are shorter than ' + T.MIN_RUN + ' marks.' });
    if (d.mode === 'text') {
      if (!bm.text) L.warnings.push({ id: 'empty', level: 'warn', text: 'Type a name or message to see it on the rod.' });
      if (L.truncated) L.warnings.push({ id: 'long', level: 'warn', text: 'That message is longer than the wrapped length. Shorten it, use a smaller letter size, or increase the wrapped length in More options.', fix: 'more' });
      const dr = T.droppedChars(d.text); if (dr.length) L.warnings.push({ id: 'chars', level: 'info', text: 'Left out characters the lettering can’t make: ' + dr.join(' ') });
    }
    return L;
  };
  T.runs = function (cells) {            // cyclic runs, starting at a colour boundary
    const n = cells.length; let st = 0;
    for (let j = 0; j < n; j++) if (cells[j] !== cells[(j - 1 + n) % n]) { st = j; break; }
    const out = []; let j = 0;
    while (j < n) { const a = (st + j) % n, sl = cells[a]; let len = 1; while (j + len < n && cells[(st + j + len) % n] === sl) len++; out.push({ slot: sl, from: a, len, to: (a + len) % n }); j += len; }
    return out;
  };

  // ---------- workshop steps ----------
  T.steps = function (d) {
    const L = T.layout(d), nm = s => T.thread(d.slots[s]).name, st = [];
    if (L.family === 'cross') return T.cross.steps(d, L);
    if (L.family === 'weave') return T.weave.steps(d, L);
    const spoolList = L.spools.map(nm);
    if (L.family === 'grid' && !d.measured) st.push({ kind: 'needsize', title: 'Enter your rod size', text: 'Your design needs your measured rod diameter before we can work out the marks.' });
    st.push({ kind: 'spools', title: 'Get your threads ready', text: spoolList.join(', '), slots: L.spools.slice() });
    if (L.family === 'grid') {
      const C = L.C;
      st.push({ kind: 'marks', title: 'Mark the rod', text: 'Cut a paper strip that just wraps once around the rod (' + C.toFixed(1) + ' mm). Fold or mark it into ' + L.N + ' equal parts (' + L.markSpacingMm.toFixed(2) + ' mm each), then mark ' + L.N + ' points around the rod at the start of the design. Number them 0 to ' + (L.N - 1) + '. A printable template is available.', marks: L.N, spacing: L.markSpacingMm, needsMeasured: true });
      let row = 0, rows = L.rows;
      while (row < rows) {
        const cells = L.rowCells(row), key = cells.join(''); let k = row + 1;
        while (k < rows && L.rowCells(k).join('') === key) k++;
        const n = k - row, rr = T.runs(cells), uniform = rr.length === 1;
        st.push({ kind: 'row', rowFrom: row + 1, rowTo: k, rows: n, turns: n * L.r, cells, runs: rr, uniform, zEnd: Math.min(d.lengthMm, k * L.r * L.w),
          title: n > 1 ? 'Rows ' + (row + 1) + '–' + k + ' of ' + rows : 'Row ' + (row + 1) + ' of ' + rows,
          text: uniform ? 'Wrap ' + n * L.r + ' turns of ' + nm(rr[0].slot) + '. No colour changes.'
            : 'Wrap ' + L.r + ' turn' + (L.r > 1 ? 's' : '') + (n > 1 ? ' for each of ' + n + ' rows (' + n * L.r + ' turns in all)' : '') + ', changing colour at the marks shown on every turn.' });
        row = k;
      }
    } else if (L.family === 'bands') {
      L.bands.forEach((b, i) => st.push({ kind: 'band', title: 'Wrap ' + nm(b.slot), text: b.turns + ' turns (about ' + (b.z1 - b.z0).toFixed(1) + ' mm), then change colour.', slot: b.slot, zEnd: b.z1, turns: b.turns, slots: [b.slot] }));
    } else {
      st.push({ kind: 'spiral', title: 'Wind ' + L.threads + ' threads together', text: 'Tie in ' + L.threads + ' threads side by side, ' + L.perColour + ' of each colour in this order: ' + Array.from({ length: L.spools.length }, (_, i) => L.perColour + ' × ' + nm(i)).join(', ') + '. Keep them flat and touching, and wind them as one band for about ' + Math.round(d.lengthMm / L.pitchMm) + ' turns (' + d.lengthMm + ' mm).', zEnd: d.lengthMm, slots: L.spools.slice() });
    }
    st.push({ kind: 'finish', title: 'Finish', text: 'Tie off, trim the tails and finish the wrap your usual way. Compare with the preview, and note anything to adjust for next time.', zEnd: d.lengthMm });
    return st;
  };

  // ---------- describe your design ----------
  const CWORDS = { black: 'black', charcoal: 'charcoal', grey: 'silver', gray: 'silver', silver: 'silver', white: 'white', cream: 'cream', ivory: 'cream', tan: 'cream', gold: 'gold', golden: 'gold',
    yellow: 'yellow', orange: 'orange', red: 'red', crimson: 'red', wine: 'wine', maroon: 'wine', burgundy: 'wine', pink: 'pink', purple: 'purple', violet: 'purple', navy: 'navy',
    blue: 'royal', royal: 'royal', sky: 'sky', teal: 'teal', green: 'green', forest: 'forest', brown: 'brown' };
  const PWORDS = [[/woven diamond|diamond weave|weave.*diamond|diamond.*weav/, 'wovendiamond'], [/herringbone|twill|tweed|woven|weav/, 'herringbone'], [/barber|candy ?cane|spiral|twist(?!.*three)|swirl|stripes? (?:that )?(?:twist|spiral)/, 'spiral'], [/triple|three[- ]colou?r (?:twist|spiral)/, 'twist'],
    [/check|chequer|checker|gingham|squares?/, 'checks'], [/double[- ]?diamond|nested diamond/, 'doublediamond'], [/diamond[- ]?chain|chain of diamonds|linked diamonds/, 'chain'], [/multi[- ]?layer|layered diamond|layered/, 'layered'], [/diamond|harlequin|argyle|cross[- ]?wrap/, 'diamonds'], [/chevron/, 'chevronwrap'], [/arrow|zig-?zag|herringbone/, 'chevrons'],
    [/wave|ripple|water/, 'waves'], [/polka|dots?|spots?/, 'dots'], [/band|stripe|racing|pinstripe|trim/, 'bands']];
  T.parse = function (input) {
    const raw = String(input || ''), s = raw.toLowerCase(), found = { colours: [], motif: null, bg: null };
    let text = null;
    const q = raw.match(/["“”']([^"“”']{1,24})["“”']/);
    if (q) text = q[1]; else { const m = raw.match(/\b(?:spell(?:ing)?|say(?:ing)?|name|initials?|text|word|message|monogram)\s+([A-Za-z0-9&.\- ]{1,24}?)(?=\s+(?:in|on|with|using|and|,)\b|[,.]|$)/i); if (m) text = m[1]; }
    let body = s.replace(/["“”'][^"“”']*["“”']/g, ' ');
    const idx = []; body.replace(/[a-z]+/g, (w, i) => { if (CWORDS[w]) idx.push([i, CWORDS[w]]); return w; });
    const cols = []; idx.forEach(([, c]) => { if (!cols.includes(c)) cols.push(c); });
    const onM = body.match(/([a-z ]*?)\bon\b(.*)/);
    let motif = null, bg = null;
    if (onM) { const f = w => { const a = w.match(/[a-z]+/g) || []; for (let i = 0; i < a.length; i++) if (CWORDS[a[i]]) return CWORDS[a[i]]; return null; }; motif = f(onM[1].split(/\bin\b/).pop()); bg = f(onM[2]); }
    let pattern = null; if (!text) for (const [re, id] of PWORDS) if (re.test(body)) { pattern = id; break; }
    if (/triple|three/.test(body) && pattern === 'spiral') pattern = 'twist';
    let sizeDir = 0; if (/\b(large|larger|bold|chunky|big|wide|thick)\b/.test(body)) sizeDir = 1; else if (/\b(small|smaller|fine|tiny|thin|delicate|narrow)\b/.test(body)) sizeDir = -1;
    const understood = []; let d, recognised = true;
    const woven = text && !/colou?r[- ]?change|experimental|painted|grid/.test(body);
    if (woven) d = T.createDesign('wovenletters', { text: T.cleanText(text) }); else if (text) d = T.createDesign('text', { text: T.cleanText(text) }); else if (pattern) d = T.createDesign(pattern); else { d = T.createDesign('diamonds'); recognised = false; }
    if (motif && bg) { d.slots[0] = bg; d.slots[1] = motif; } else if (cols.length) cols.forEach((c, i) => { if (i < d.slots.length) d.slots[i] = c; });
    if (woven) { d.slots[0] = motif || cols[0] || 'gold'; d.slots[1] = bg || (cols.length > 1 ? cols[cols.length - 1] : null) || 'black'; if (d.slots[0] === d.slots[1]) d.slots[1] = d.slots[0] === 'black' ? 'white' : 'black'; } else     if (text) { d.slots[0] = (bg || (cols.length > 1 ? cols[cols.length - 1] : null) || 'black'); d.slots[1] = motif || cols[0] || 'gold'; if (d.slots[0] === d.slots[1]) d.slots[0] = d.slots[1] === 'black' ? 'white' : 'black'; }
    if (text) understood.push('Lettering “' + d.text + '”'); else if (pattern) understood.push(PAT[pattern].name);
    understood.push(...d.slots.slice(0, PAT[d.pattern].slots.length).map(c => T.thread(c).name));
    return { design: d, understood, recognised, sizeDir, text: !!text };
  };
  T.resize = function (d, dir) { const L = T.layout(d), v = dir > 0 ? L.larger : L.smaller; if (v == null) return d; return Object.assign(clone(d), { size: v }); };

  // ---------- history (undo / redo) ----------
  T.History = function (initial) { this.s = [clone(initial)]; this.i = 0; this.key = null; this.t = 0; };
  T.History.prototype = {
    push(d, key, now) { const c = JSON.stringify(d); if (c === JSON.stringify(this.s[this.i])) return; now = now == null ? Date.now() : now;
      if (key && key === this.key && now - this.t < 1200 && this.i === this.s.length - 1) { this.s[this.i] = clone(d); this.t = now; return; }
      this.s = this.s.slice(0, this.i + 1); this.s.push(clone(d)); if (this.s.length > 100) this.s.shift(); this.i = this.s.length - 1; this.key = key || null; this.t = now; },
    can(u) { return u ? this.i > 0 : this.i < this.s.length - 1; },
    undo() { if (this.i > 0) { this.i--; this.key = null; } return clone(this.s[this.i]); },
    redo() { if (this.i < this.s.length - 1) { this.i++; this.key = null; } return clone(this.s[this.i]); },
    cur() { return clone(this.s[this.i]); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = T; else root.THREAD = T;
})(typeof self !== 'undefined' ? self : this);
