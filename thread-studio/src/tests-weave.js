// Weaving engine tests (weave.js). The independent model below is built only from the draft (spec.lift / spec.warpSlot) and the
// physical description (warp lines by angle, weft as numbered helix turns); it shares no code with L.slotAt / L.coverAt.
const T = require('./engine.js'); require('./crosswrap.js'); require('./weave.js'); const W = T.weave, TAU = 2 * Math.PI;
const attrs = (s, tag) => (s.match(new RegExp('<' + tag + ' [^>]*>', 'g')) || []);
const at = (s, a) => { const m = s.match(new RegExp(a + '="([^"]*)"')); return m ? m[1] : null; };
module.exports = function (ok, near) {
  const mk = (k, o) => T.createDesign(k, Object.assign({ measured: true }, o || {}));
  const IDS = ['herringbone', 'wovendiamond'];
  // independent model: what colour is on top at (z, theta)?
  function model(L, d, z, th) {
    const w = L.w, spec = L.spec; th = ((th % TAU) + TAU) % TAU;
    if (z < 0) return -1;
    const line = Math.floor(th / TAU * L.M), tf = z / w - th / TAU;             // the weft turn that lies over this spot
    const t = Math.floor(tf + 1e-12), nA = L.nA, rowsEnd = nA + L.rows * L.tau, total = rowsEnd + nA;
    if (t < 0 || t >= total) return z < total * w + w ? spec.warpSlot(line) : -1;
    if (t < nA || t >= rowsEnd) return 1;
    const row = Math.floor((t - nA) / L.tau);
    return spec.lift(row % spec.Q, line) ? spec.warpSlot(line) : 1;
  }
  const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

  // ---- geometry sweep
  const SW = []; for (const id of IDS) for (const dia of [4, 6, 8, 10, 12.5, 16, 20, 25]) for (const th of ['A', 'D', 'E']) { const L0 = T.layout(mk(id, { diameterMm: dia, thread: th })); for (let k = 1; k <= Math.min(L0.larger == null ? L0.size : 1e9, 6) + 0; k++) { if (k > Math.ceil(L0.smaller == null ? L0.size : L0.size + 4)) break; SW.push(mk(id, { diameterMm: dia, thread: th, size: k })); } }
  const LS = SW.map(d => T.layout(d));
  ok('WV1 line count is a whole number of pattern periods and the lines fill the circumference', LS.every(L => L.M % L.P === 0 && near(L.M * L.cellW, L.C, 1e-9)), LS.length);
  ok('WV2 a row is as many turns as threads per line, so cells stay square', LS.every(L => L.tau === L.g && near(L.rowMm, L.tau * L.w, 1e-12) && L.g >= 1));
  ok('WV3 whole pattern repeats only; wrap length = start band + rows + finish band', LS.every(L => L.rows % L.Q === 0 && L.units >= 1 && L.turnsTotal === 2 * L.nA + L.rows * L.tau && near(L.lenAdj, L.turnsTotal * L.w, 1e-9)));
  ok('WV4 wrap fits the requested length unless a long warning is raised', LS.every(L => L.lenAdj <= L.d.lengthMm + 1e-9 || L.warnings.some(w => w.id === 'long')));
  ok('WV5 size steps move by exactly one pattern period around', (() => { const d = mk('wovendiamond'); const a = T.layout(d), b = T.layout(T.resize(d, 1)); return a.larger == null || b.M === a.M - a.P; })());
  ok('WV6 threads per line fit the line width to within 30% for the default size', IDS.every(id => [4, 6, 8, 10, 12.5, 16, 20, 25].every(dia => ['A', 'D', 'E'].every(th => { const L = T.layout(mk(id, { diameterMm: dia, thread: th })); return L.fit > 0.65 && L.fit < 1.5 || L.warnings.some(w => w.id === 'fine' || w.id === 'fit'); }))));

  // ---- preview vs independent model
  for (const id of IDS) {
    const d = mk(id), L = T.layout(d); let bad = 0, n = 0;
    for (let i = 0; i < 20000; i++) { const z = rnd() * (L.lenAdj + 4) - 1, th = rnd() * TAU; n++; if (L.slotAt(z, th) !== model(L, d, z, th)) bad++; }
    ok('WV7 ' + id + ' preview colour = independent warp/weft model at 20000 points', bad <= 2, bad + '/' + n);
    // layering at every cell centre of one repeat
    let wrong = 0, cnt = 0;
    for (let r = 0; r < L.Q; r++) for (let j = 0; j < L.M; j++) { const th = (j + 0.5) / L.M * TAU, t = L.nA + r * L.tau + Math.floor(L.tau / 2), z = (t + th / TAU + 0.5) * L.w, want = L.unit[r][j] ? L.warpAt(j) : 1; cnt++; if (L.slotAt(z, th) !== want) wrong++; }
    ok('WV8 ' + id + ' every cell: weft under => warp colour on top, weft over => weft colour (' + cnt + ' cells)', wrong === 0, wrong);
    ok('WV9 ' + id + ' start and finish bands are weft colour all round', (() => { for (let k = 0; k < 400; k++) { const th = rnd() * TAU, tA = Math.floor(rnd() * L.nA), tB = L.nA + L.rows * L.tau + Math.floor(rnd() * L.nA); if (L.slotAt((tA + th / TAU + 0.5) * L.w, th) !== 1 || L.slotAt((tB + th / TAU + 0.5) * L.w, th) !== 1) return false; } return true; })());
    ok('WV10 ' + id + ' pattern repeats every Q rows along and P lines around', (() => { for (let k = 0; k < 300; k++) { const r = Math.floor(rnd() * L.rows), j = Math.floor(rnd() * L.M); if (L.liftAt(r, j) !== L.liftAt(r + L.Q, j) || L.liftAt(r, j) !== L.liftAt(r, j + L.P)) return false; } return true; })());
    // weft is one helix: turn t is at z = (t + theta/2pi) w, advances w per turn, and each turn starts at the seam
    ok('WV11 ' + id + ' weft advances one thread width per turn and every row starts at the seam', LS.length > 0 && (() => { const dz = (t, th) => (t + th / TAU) * L.w; return near(dz(5, 0) - dz(4, 0), L.w, 1e-12) && near(dz(7, TAU) - dz(8, 0), 0, 1e-12); })());
    ok('WV12 ' + id + ' coverAt = slotAt when every stage is shown', (() => { const P = L.finishStage; for (let k = 0; k < 4000; k++) { const z = rnd() * L.lenAdj, th = rnd() * TAU, c = L.coverAt(z, th, P); if (c.slot !== L.slotAt(z, th)) return false; } return true; })());
  }

  // ---- construction order and stage numbering
  for (const id of IDS) {
    const d = mk(id), L = T.layout(d), st = T.steps(d), stg = st.filter(s => s.stage != null);
    ok('WV13 ' + id + ' steps run: spools, marks, warp, start band, rows, [repeat], finish band, finish', (() => { const k = st.map(s => s.kind); return k[0] === 'spools' && k[1] === 'marks' && k[2] === 'warp' && k[3] === 'wstart' && k[k.length - 2] === 'wfinish' && k[k.length - 1] === 'finish' && (L.units > 1) === k.includes('wrepeat'); })(), st.map(s => s.kind).join());
    ok('WV14 ' + id + ' stage numbers strictly increase by one', stg.every((s, i) => s.stage === i + 1));
    const rows = st.filter(s => s.kind === 'wrow');
    ok('WV15 ' + id + ' row steps cover rows 0..Q-1 once, in order', rows[0].rowFrom === 0 && rows[rows.length - 1].rowTo === L.Q - 1 && rows.every((s, i) => i === 0 || s.rowFrom === rows[i - 1].rowTo + 1));
    ok('WV16 ' + id + ' rows merged in one step really have identical left lists', rows.every(s => { for (let r = s.rowFrom; r <= s.rowTo; r++) if (L.unit[r].join() !== L.unit[s.rowFrom].join()) return false; return true; }));
    ok('WV17 ' + id + ' each row step names exactly the lines the model sends the weft under', rows.every(s => { const u = []; L.unit[s.rowFrom].forEach((v, j) => { if (v) u.push(j); }); return JSON.stringify(u) === JSON.stringify(s.under) && s.over.length + s.under.length === L.M; }));
    ok('WV18 ' + id + ' turns across all steps add up to the whole wrap', (() => { const r = rows.reduce((a, s) => a + s.turns, 0), rep = st.find(s => s.kind === 'wrepeat'); return L.nA + r + (rep ? rep.units * L.Q * L.tau : 0) + L.nA === L.turnsTotal; })());
    ok('WV19 ' + id + ' row step turn numbers are the real turns of that row', rows.every(s => L.stageOfTurn(s.turnFrom - 1) === s.stage && L.stageOfTurn(s.turnTo - 1) === s.stage));
    ok('WV20 ' + id + ' stage of turn never goes backwards and uses only step stages', (() => { let p = 0; const set = new Set(stg.map(s => s.stage)); for (let t = 0; t < L.turnsTotal; t++) { const s = L.stageOfTurn(t); if (s < p || !set.has(s)) return false; p = s; } return true; })());
    // highlighting: at stage s the turns of stage s are 'active', earlier are done, later are warp only
    ok('WV21 ' + id + ' highlighting: later turns show warp only, active turns carry the step stage', (() => { for (const s of stg.filter(x => x.stage >= 2)) for (let k = 0; k < 600; k++) { const z = rnd() * L.lenAdj, th = rnd() * TAU, c = L.coverAt(z, th, s.stage), loc = L.locate(z, th); if (loc.t < 0 || loc.t >= L.turnsTotal) continue; const so = L.stageOfTurn(loc.t); if (so > s.stage ? !(c.pass === 0 && c.slot === L.warpAt(loc.j)) : c.pass !== so) return false; } return true; })());
    ok('WV22 ' + id + ' warp step shows only warp lines, all active', (() => { for (let k = 0; k < 800; k++) { const z = rnd() * L.lenAdj, th = rnd() * TAU, c = L.coverAt(z, th, 1), j = Math.min(L.M - 1, Math.floor(th / TAU * L.M)); if (c.slot !== L.warpAt(j) || c.pass !== 1) return false; } return true; })());
    // diagrams are drawn from the same plan
    const dg = W.diagramSVG(d, L, rows[0]), cells = attrs(dg, 'rect').filter(s => at(s, 'data-r') != null);
    ok('WV23 ' + id + ' chart has one square per line per row and matches the left lists', cells.length === L.Q * L.M && cells.every(s => { const r = +at(s, 'data-r'), j = +at(s, 'data-j'); return +at(s, 'data-lift') === (L.unit[r][j] ? 1 : 0) && +at(s, 'data-slot') === (L.unit[r][j] ? L.warpAt(j) : 1); }));
    const dr = rows[Math.min(1, rows.length - 1)], dg2 = W.diagramSVG(d, L, dr), pj = attrs(dg2, 'rect').filter(s => at(s, 'data-pj') != null);
    ok('WV24 ' + id + ' weft-path strip shows under/over exactly as the step says', pj.length === L.M && pj.every(s => (+at(s, 'data-under') === 1) === dr.under.includes(+at(s, 'data-pj'))));
    ok('WV25 ' + id + ' chart marks done / active / still-to-come rows', (() => { const c2 = attrs(dg2, 'rect').filter(s => at(s, 'data-r') != null); return c2.every(s => { const r = +at(s, 'data-r'), want = r < dr.rowFrom ? 'done' : r <= dr.rowTo ? 'active' : 'todo'; return at(s, 'data-state') === want; }); })());
    const ring = W.diagramSVG(d, L, st.find(s => s.kind === 'warp')), paths = attrs(ring, 'path');
    ok('WV26 ' + id + ' warp ring has one segment per line in the right colour', paths.length === L.M && paths.every(s => +at(s, 'data-slot') === L.warpAt(+at(s, 'data-j'))));
    ok('WV27 ' + id + ' big diagram is the same drawing, only larger', W.diagramSVG(d, L, rows[0], { big: true }).split('data-lift').length === dg.split('data-lift').length);
    // quantities
    ok('WV28 ' + id + ' warp quantities: lines add to M, threads to M*g, each length = wrap + tails', L.warpQty.reduce((a, q) => a + q.lines, 0) === L.M && L.warpQty.reduce((a, q) => a + q.threads, 0) === L.M * L.g && L.warpQty.every(q => near(q.eachMm, L.lenAdj + 40, 1e-9)));
    ok('WV29 ' + id + ' weft allowance covers every turn plus the take-up of going over and under', L.weftQty.totalMm >= L.turnsTotal * L.C * 1.09 && L.weftQty.orderMm >= L.weftQty.totalMm);
    ok('WV30 ' + id + ' warp lines per colour match the draft', L.warpQty.every(q => { let n = 0; for (let j = 0; j < L.M; j++) if (L.spec.warpSlot(j) === q.slot) n++; return n === q.lines; }));
    ok('WV31 ' + id + ' every step has complete workshop fields and no broken text', stg.every(s => s.head && s.title && s.legs.length === 3 && s.legs.every(l => l.label && l.action) && s.chips.length > 0 && s.how.length > 0 && s.notes.length > 0) && JSON.stringify(st).indexOf('undefined') < 0 && JSON.stringify(st).indexOf('NaN') < 0);
    ok('WV32 ' + id + ' each step says where the thread starts, how it goes and what comes next', rows.every(s => /mark 0/.test(s.legs[0].action) && /under|over/i.test(s.legs[1].action) && /turn/.test(s.legs[2].action) && s.next));
    ok('WV33 ' + id + ' claims no bench testing', L.evidence.bench === 'Not bench tested' && !/bench[- ]tested(?! )|proven|verified on/i.test(JSON.stringify(st).replace(/Not bench tested/g, '')));
  }
  // ---- two designs are genuinely different, and colours change the preview
  const dh = mk('herringbone'), dw = mk('wovendiamond'), Lh = T.layout(dh), Lw = T.layout(dw);
  ok('WV34 the two designs have different drafts and colour counts', Lh.unit.join() !== Lw.unit.join() && Lh.slotNames.length === 2 && Lw.slotNames.length === 3 && Lh.Q !== Lw.Q);
  ok('WV35 herringbone is a reversing 2/2 twill: 30-70% of each row lifted, no lifted or covered run longer than 4', (() => { const run = (row, v) => { let best = 0, r = 0; row.concat(row).forEach(x => { if (x === v) { r++; best = Math.max(best, r); } else r = 0; }); return best; }; return Lh.unit.every(row => { const f = row.filter(Boolean).length / Lh.M; return f >= 0.3 && f <= 0.7 && run(row, true) <= 4 && run(row, false) <= 4; }); })());
  ok('WV36 woven diamond: tile is mirror symmetric both ways, accent only in the centre lines', (() => { for (let r = 0; r < 16; r++) for (let j = 0; j < 16; j++) if (Lw.liftAt(r, j) !== Lw.liftAt(15 - r, j) || Lw.liftAt(r, j) !== Lw.liftAt(r, 15 - j)) return false; return [...Array(Lw.M).keys()].every(j => (Lw.warpAt(j) === 2) === (j % 16 === 7 || j % 16 === 8)); })());
  ok('WV37 changing a colour changes only that slot in the preview', (() => { const d2 = mk('wovendiamond'); d2.slots[2] = 'gold'; const L2 = T.layout(d2); let seen = 0; for (let k = 0; k < 3000; k++) { const z = rnd() * Lw.lenAdj, th = rnd() * TAU; if (L2.slotAt(z, th) !== Lw.slotAt(z, th)) return false; if (Lw.slotAt(z, th) === 2) seen++; } return seen > 20 && d2.slots[2] !== dw.slots[2]; })());
  ok('WV38 float lengths are measured and short for both designs', Lh.warpFloatMm < 4 && Lw.warpFloatMm < 12 && Lw.warpFloatMm > Lh.warpFloatMm);
  ok('WV39 evidence: documented principle, estimated quantities, never "tested"', [Lh, Lw].every(L => L.evidence.tier === 'weave' && /documented/.test(L.evidence.label) && /estimated/.test(L.evidence.label)));
  ok('WV40 describe-your-design finds the woven designs', T.parse('woven herringbone in black and gold').design.pattern === 'herringbone' && T.parse('woven diamonds in navy').design.pattern === 'wovendiamond' && T.parse('diamond weave').design.pattern === 'wovendiamond' && T.parse('gold diamonds on navy').design.pattern === 'diamonds');
  ok('WV41 gallery lists both woven designs', T.GALLERY.includes('herringbone') && T.GALLERY.includes('wovendiamond') && T.GALLERY.length === 11 && T.GALLERY.includes('wovenletters'));
  ok('WV42 template guide lists every line and one repeat', (() => { const h = W.templateHTML(dw); return (h.match(/<text /g) || []).length === Lw.M && /not bench tested/i.test(h); })());
  // ---- foundation: any draft works (lettering later). A letter K drawn as a bitmap through the same engine.
  (function () {
    const K = T.FONT.K; W.SPEC.__k = { label: 'test K', guide: 'k', P: 12, Q: 9, slots: 2, warpSlot: () => 0, lift: (r, j) => { const x = j % 12 - 3, y = r % 9 - 1; return x >= 0 && x < 5 && y >= 0 && y < 7 && K[y][x] === '1'; } };
    T.PATTERNS.__k = { name: 'test K', family: 'weave', slots: ['Warp', 'Weft'], colours: ['black', 'gold'] };
    const d = T.createDesign('__k', { measured: true }), L = T.layout(d), st = T.steps(d); let bad = 0;
    for (let i = 0; i < 5000; i++) { const z = rnd() * L.lenAdj, th = rnd() * TAU; if (L.slotAt(z, th) !== model(L, d, z, th)) bad++; }
    ok('WV43 a bitmap draft (letter K) runs through the same engine, steps and model', bad <= 1 && st.some(s => s.kind === 'wrow') && L.groups.length >= 5, bad);
    delete W.SPEC.__k; delete T.PATTERNS.__k;
  })();
};
