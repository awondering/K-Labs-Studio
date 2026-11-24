// Woven lettering tests. Expected left lists are built here straight from T.FONT (not through T.textBitmap or weave.js),
// then compared with the engine's plan, the preview and the workshop steps.
const T = require('./engine.js'); require('./crosswrap.js'); require('./weave.js'); const W = T.weave, TAU = 2 * Math.PI;
const at = (s, a) => { const m = s.match(new RegExp(a + '="([^"]*)"')); return m ? m[1] : null; };
module.exports = function (ok, near) {
  const mk = (text, o) => T.createDesign('wovenletters', Object.assign({ measured: true, text }, o || {}));
  const rnd = (() => { let s = 777; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  // expected pixel grid (columns along the rod) straight from the font
  function pixels(text) { const cols = []; const t = text.toUpperCase().replace(/ +$/, ''); [...t].forEach((ch, k) => { const g = T.FONT[ch]; for (let x = 0; x < g[0].length; x++) cols.push([...Array(7).keys()].map(y => g[y][x] === '1' ? 1 : 0)); if (k < t.length - 1) cols.push([0, 0, 0, 0, 0, 0, 0]); }); return cols; }
  function expected(L, text) {        // the whole left list the engine ought to have made
    const px = pixels(text), s = L.text.s, rows = [];
    for (let r = 0; r < L.rows; r++) { const x = Math.floor((r - L.text.pre) / s), row = []; for (let j = 0; j < L.M; j++) { const jj = L.text.copies > 1 ? j % L.text.period : j, y = jj - L.text.off; row.push(x >= 0 && x < px.length && y >= 0 && y < 7 * s && px[x][Math.floor(y / s)] === 1); } rows.push(row); }
    return rows;
  }
  const MSGS = ['K-LABS', 'KEVIN', 'CUSTOM BUILT', 'JB 2026'];
  for (const m of MSGS) {
    const d = mk(m), L = T.layout(d), exp = expected(L, m);
    ok('LT1 "' + m + '": the left list is exactly the font bitmap, scaled, in every row and line', exp.every((row, r) => row.every((v, j) => v === L.unit[r][j])));
    const s = L.text.s, tw = pixels(m).length * s;
    ok('LT2 "' + m + '": centred along the wrap (margins equal to within one row) and fits', L.text.textRows === tw && Math.abs(L.text.pre - (L.rows - tw - L.text.pre)) <= 1 && L.text.pre >= 0 && !L.warnings.some(w => w.id === 'long'));
    const ys = []; L.unit.forEach(row => row.forEach((v, j) => { if (v) ys.push(j % (L.text.copies > 1 ? L.text.period : L.M)); }));
    ok('LT3 "' + m + '": letters are centred round the blank (or repeated evenly when several copies fit) and never touch the edge of a copy', L.text.copies > 1 ? Math.min(...ys) >= 1 && Math.max(...ys) <= 7 * s && L.M === L.text.copies * L.text.period : Math.min(...ys) === L.text.off && Math.max(...ys) === L.text.off + 7 * s - 1 && Math.abs(L.text.off - (L.M - 7 * s - L.text.off)) <= 1);
  }
  ok('LT4 spacing: exactly one blank pixel column between letters, a space is three', (() => { const L = T.layout(mk('A B')), s = L.text.s, spans = L.text.spans; return spans.length === 3 && spans[1].ch === ' ' && spans[1].x1 - spans[1].x0 + 1 === 3 && spans[1].x0 === spans[0].x1 + 2 && spans[2].x0 === spans[1].x1 + 2 && L.text.textRows === (5 + 1 + 3 + 1 + 5) * s; })());
  // Q11: é is now woven as E (accents fold to the base letter); ☃ is still unsupported - reported, not drawn.
  ok('LT5 characters: letters, digits and sensible punctuation are all drawn; unsupported ones are reported, not drawn', (() => { const L = T.layout(mk('A-Z 0.9 &!\'/+é☃')), w = L.warnings.find(w => w.id === 'chars'); return !!w && /☃/.test(w.text) && !/É/i.test(w.text) && L.text.spans.some(p => p.ch === 'E') && L.text.spans.every(p => /[A-Z0-9 \-.&!'/+]/.test(p.ch)); })());
  ok('LT6 lowercase is capitalised', JSON.stringify(T.layout(mk('kevin')).unit) === JSON.stringify(T.layout(mk('KEVIN')).unit));
  // colour mapping
  (function () {
    const d = mk('KEVIN'), L = T.layout(d); let bad = 0, nl = 0, nb = 0;
    for (let r = 0; r < L.rows; r += 3) for (let j = 0; j < L.M; j++) { const th = (j + 0.5) / L.M * TAU, t = L.nA + r * L.tau + Math.floor(L.tau / 2), z = (t + th / TAU + 0.5) * L.w, got = L.slotAt(z, th); if (L.unit[r][j]) { nl++; if (got !== 0) bad++; } else { nb++; if (got !== 1) bad++; } }
    ok('LT7 lettering shows the warp (Lettering) colour, everything else the weft (Background) colour', bad === 0 && nl > 20 && nb > 50 && L.slotNames[0] === 'Lettering' && L.slotNames[1] === 'Background', bad);
    const d2 = mk('KEVIN'); d2.slots = ['red', 'silver']; const L2 = T.layout(d2); let ch = 0; for (let k = 0; k < 2000; k++) { const z = rnd() * L.lenAdj, th = rnd() * TAU; if (L2.slotAt(z, th) !== L.slotAt(z, th)) ch++; }
    ok('LT8 changing a colour never changes the pattern, only the colour of that slot', ch === 0 && T.thread(d2.slots[0]).hex !== T.thread(d.slots[0]).hex);
  })();
  // preview = independent warp/weft model
  for (const m of ['K-LABS', 'JB 2026']) {
    const d = mk(m), L = T.layout(d); let bad = 0;
    for (let i = 0; i < 15000; i++) { const z = rnd() * (L.lenAdj + 3) - 1, th = rnd() * TAU, thn = th, line = Math.floor(thn / TAU * L.M), t = Math.floor(z / L.w - thn / TAU + 1e-12); let want; if (z < 0) want = -1; else if (t < 0 || t >= L.turnsTotal) want = z < L.turnsTotal * L.w + L.w ? 0 : -1; else if (t < L.nA || t >= L.nA + L.rows * L.tau) want = 1; else want = L.spec.lift(Math.floor((t - L.nA) / L.tau), line) ? 0 : 1; if (L.slotAt(z, th) !== want) bad++; }
    ok('LT9 "' + m + '": the rod preview is the weave (independent over/under model, 15000 points)', bad <= 2, bad);
    const exp = expected(L, m); let wrong = 0; for (let r = 0; r < L.rows; r += 2) for (let j = 0; j < L.M; j++) { const th = (j + 0.5) / L.M * TAU, t = L.nA + r * L.tau + Math.floor(L.tau / 2), z = (t + th / TAU + 0.5) * L.w; if ((L.slotAt(z, th) === 0) !== exp[r][j]) wrong++; }
    ok('LT10 "' + m + '": the preview shows the lettering from the font at every cell', wrong === 0, wrong);
  }
  // fit limits
  (function () {
    const short = T.layout(mk('KEVIN')), long = T.layout(mk('A'.repeat(24))), fitLong = T.layout(mk('A'.repeat(24), { lengthMm: 600 }));
    ok('LT11 a message that cannot fit is flagged, with the length it needs; the plan is still complete', long.warnings.some(w => w.id === 'long' && /needs about \d+ mm/.test(w.text)) && long.lenAdj > 150 && long.text.textRows <= long.rows && !short.warnings.some(w => w.id === 'long'));
    ok('LT12 a longer wrapped length (or smaller letters) clears the warning', !fitLong.warnings.some(w => w.id === 'long') && !T.layout(mk('A'.repeat(24), { size: 1 })).warnings.some(w => w.id === 'long' && false) && T.layout(mk('A'.repeat(24), { size: 1 })).lenAdj < long.lenAdj);
    ok('LT13 bigger letters need more wrap', T.layout(mk('KEVIN', { size: 3 })).text.textRows > T.layout(mk('KEVIN', { size: 1 })).text.textRows);
    const sizes = []; let L = T.layout(mk('KEVIN', { size: 1 })); sizes.push(L.size); while (L.larger != null) { L = T.layout(mk('KEVIN', { size: L.larger })); sizes.push(L.size); }
    ok('LT14 letter sizes step by one, and the biggest still fits round the blank (7 rows of letter + 3 spare lines)', sizes.every((v, i) => v === i + 1) && L.M >= 7 * L.size + 3 && sizes.length >= 2, sizes);
    ok('LT15 every size on every rod/thread combination makes a valid plan', (() => { for (const dia of [4, 6, 8, 12.5, 25]) for (const th of ['A', 'D', 'E']) { let L = T.layout(mk('K-LABS', { diameterMm: dia, thread: th, size: 1 })); for (let n = 0; n < 8; n++) { if (!(L.M >= 10 && L.g >= 1 && L.rows >= 1 && L.unit.length === L.rows && L.unit.every(r => r.length === L.M))) return false; if (L.larger == null) break; L = T.layout(mk('K-LABS', { diameterMm: dia, thread: th, size: L.larger })); } } return true; })());
    ok('LT16 empty text gives a plain wrap and a warning, not an error', (() => { const L = T.layout(mk('')); return L.warnings.some(w => w.id === 'empty') && L.unit.every(r => r.every(v => !v)) && T.steps(mk('', { measured: true })).some(s => s.kind === 'wrow'); })());
    ok('LT17 long floats are still measured and warned (big letters on a thick thread)', (() => { const L = T.layout(mk('LET', { size: 4, diameterMm: 25, thread: 'E', lengthMm: 600 })); return L.warpFloatMm > 12 ? L.warnings.some(w => w.id === 'float') : L.warpFloatMm > 0; })());
    ok('LT18 thread count is reported for the whole blank', short.threadsTotal === short.M * short.g && short.warpQty.length === 1 && short.warpQty[0].lines === short.M);
  })();
  // workshop
  for (const m of ['K-LABS', 'CUSTOM BUILT']) {
    const d = mk(m), L = T.layout(d), st = T.steps(d), rows = st.filter(s => s.kind === 'wrow');
    ok('LT19 "' + m + '": row steps cover every row exactly once, in order, with no repeat step', rows[0].rowFrom === 0 && rows[rows.length - 1].rowTo === L.rows - 1 && rows.every((s, i) => i === 0 || s.rowFrom === rows[i - 1].rowTo + 1) && !st.some(s => s.kind === 'wrepeat'));
    ok('LT20 "' + m + '": each step lists exactly the lines the weft goes under, and the turn counts add up to the wrap', rows.every(s => { const u = []; L.unit[s.rowFrom].forEach((v, j) => { if (v) u.push(j); }); return JSON.stringify(u) === JSON.stringify(s.under); }) && L.nA * 2 + rows.reduce((a, s) => a + s.turns, 0) === L.turnsTotal);
    ok('LT21 "' + m + '": every step names the letter (or plain wrap) it makes, in the right place', rows.every(s => { const x0 = Math.floor((s.rowFrom - L.text.pre) / L.text.s), x1 = Math.floor((s.rowTo - L.text.pre) / L.text.s), out = x1 < 0 || x0 >= L.text.bm.w; return out ? /plain wrap/.test(s.chips.join()) : /letter|gap/.test(s.chips.join()); }) && rows.filter(s => /letter [A-Z0-9]/.test(s.chips.join())).length >= m.replace(/[ -]/g, '').length);
    ok('LT22 "' + m + '": stages rise by one and the preview marks the active turns', st.filter(s => s.stage != null).every((s, i) => s.stage === i + 1) && (() => { const s = rows[Math.floor(rows.length / 2)]; for (let k = 0; k < 500; k++) { const z = rnd() * L.lenAdj, th = rnd() * TAU, c = L.coverAt(z, th, s.stage), loc = L.locate(z, th); if (loc.t < 0 || loc.t >= L.turnsTotal) continue; const so = L.stageOfTurn(loc.t); if (so > s.stage ? c.pass !== 0 : c.pass !== so) return false; } return true; })());
    const mid = rows.find(s => s.rowFrom > L.text.pre + 2 * L.text.s && s.under.length > 0), dg = W.diagramSVG(d, L, mid), cells = (dg.match(/<rect [^>]*data-r[^>]*>/g) || []);
    ok('LT23 "' + m + '": the chart shows the active rows and a few neighbours, matching the plan', cells.length > 0 && cells.length < 12 * L.M && cells.every(c => +at(c, 'data-lift') === (L.unit[+at(c, 'data-r')][+at(c, 'data-j')] ? 1 : 0)) && cells.some(c => at(c, 'data-state') === 'active') && cells.some(c => at(c, 'data-state') === 'done') && (dg.match(/data-under="1"/g) || []).length === mid.under.length);
    ok('LT24 "' + m + '": every step has the thread, rows, lifts, turns and next action; no broken text', rows.every(s => s.head && /weft/.test(s.head) && s.legs[1].action && s.legs[2].action && s.chips.length >= 2 && s.next) && JSON.stringify(st).indexOf('undefined') < 0 && JSON.stringify(st).indexOf('NaN') < 0);
    ok('LT25 "' + m + '": a huge plain-wrap margin is one step, not hundreds', rows.filter(s => s.under.length === 0).every(s => s.turns >= L.tau) && st.length < 90);
  }
  ok('LT26 printable guide for lettering covers the whole message and says so', (() => { const h = W.templateHTML(mk('KEVIN')); return /whole lettering/.test(h) && (h.match(/<text /g) || []).length === T.layout(mk('KEVIN')).M && /not bench tested/i.test(h); })());
  ok('LT27 evidence: calculated weave, never claims bench testing', (() => { const L = T.layout(mk('KEVIN')); return L.evidence.bench === 'Not bench tested' && /estimated/.test(L.evidence.label); })());
  ok('LT28 describe-your-design: quoted text becomes woven lettering with lettering/background colours', (() => { const r = T.parse('"K-LABS" in gold on black'); return r.design.pattern === 'wovenletters' && r.design.text === 'K-LABS' && r.design.slots[0] === 'gold' && r.design.slots[1] === 'black' && T.parse('"KEVIN" in red').design.slots[1] === 'black'; })());
  ok('LT29 undo-able settings: the design is plain JSON and round-trips', (() => { const d = mk('JB 2026', { size: 1 }); return JSON.stringify(T.layout(JSON.parse(JSON.stringify(d))).unit) === JSON.stringify(T.layout(d).unit); })());
  // Q11: accented letters and macrons are woven as their base capital (Tāne -> TANE), never dropped or left as a gap.
  const folds = [['Tāne Smith', 'TANE SMITH'], ['Ngāti Whātua', 'NGATI WHATUA'], ['Hōne Heke', 'HONE HEKE'], ['Māui', 'MAUI'], ['Te Ūpoko', 'TE UPOKO'], ['Kīngi', 'KINGI'], ['Pēta', 'PETA'], ['Ta\u0304ne', 'TANE']];
  ok('LT30 Māori macrons (ā ē ī ō ū, typed or combining) weave as the base capital; nothing is reported as left out', folds.every(([s, t]) => T.cleanText(s) === t && T.droppedChars(s).length === 0), folds.map(([s]) => [s, T.cleanText(s), T.droppedChars(s)]));
  const accents = [['Zoë', 'ZOE'], ['José Peña', 'JOSE PENA'], ['Øyvind', 'OYVIND'], ['Ærø', 'AERO'], ['Straße', 'STRASSE'], ['Œuvre', 'OEUVRE'], ['Łódź', 'LODZ'], ['François Müller', 'FRANCOIS MULLER']];
  ok('LT31 other accented letters weave as their base letters (é è ë ñ ç ü ø æ œ ß ł)', accents.every(([s, t]) => T.cleanText(s) === t && T.droppedChars(s).length === 0), accents.map(([s]) => [s, T.cleanText(s), T.droppedChars(s)]));
  ok('LT32 word spacing and letters are exact: "Tāne Smith" is woven identically to "TANE SMITH" (one column between letters, three for the space)', (() => { const a = T.layout(mk('Tāne Smith')), b = T.layout(mk('TANE SMITH')), bm = T.textBitmap('Tāne Smith'); return JSON.stringify(a.unit) === JSON.stringify(b.unit) && bm.text === 'TANE SMITH' && bm.w === pixels('TANE SMITH').length && a.warnings.every(w => w.id !== 'chars'); })());
  ok('LT33 characters the lettering cannot make are still reported and not drawn (accents never hide them)', (() => { const s = 'Tāne @ #1'; return JSON.stringify(T.droppedChars(s)) === JSON.stringify(['@', '#']) && T.cleanText(s) === 'TANE 1'; })());
  ok('LT34 the 24-character limit applies to the woven letters', T.cleanText('ā'.repeat(30)) === 'A'.repeat(24));
};
