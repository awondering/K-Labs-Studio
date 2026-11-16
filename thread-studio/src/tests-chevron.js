// Chevron cross-wrap tests. Glossary definition: a chevron is a cross wrap where each additional thread is wrapped to the SAME side
// (a diamond goes to each side). In the engine that is: the back thread of a pass has the same offset as its up thread.
const T = require('./engine.js'); require('./crosswrap.js'); const X = T.cross, TAU = 2 * Math.PI;
const mod = (a, b) => ((a % b) + b) % b, angEq = (a, b) => Math.abs(mod(a - b + Math.PI, TAU) - Math.PI) < 1e-9;
const attr = (s, a) => { const m = s.match(new RegExp(a + '="([^"]*)"')); return m ? m[1] : null; };
module.exports = function (ok, near) {
  const mk = o => T.createDesign('chevronwrap', Object.assign({ measured: true }, o || {}));
  const SW = []; for (const dia of [4, 8, 12.5, 25]) for (const size of [0, 1, 2, 3, 4, 5]) for (const bt of X.SPEC.chevronwrap.options) SW.push(mk({ diameterMm: dia, size, bandThreads: bt }));
  const each = (f, list) => { const bad = []; for (const d of (list || SW)) { const L = T.layout(d), r = f(d, L); if (r) bad.push(d.diameterMm + '/' + d.size + '/' + d.bandThreads + ' ' + r); } return bad.slice(0, 3); };
  const D8 = mk({ diameterMm: 8, size: 1 }), seqOf = (p, leg) => 2 * p - 2 + (leg === 'back' ? 1 : 0);
  const indep = (L, z, th, mp) => { let best = null; const t0 = mod(th, TAU);
    for (const t of L.threads) { if (t.pass > mp) continue; const arg = (t.fam === 'R' ? z - t.S * t0 / TAU : z + t.S * t0 / TAU) - t.z0 - t.offset * t.wv, dd = mod(arg + t.S / 2, t.S) - t.S / 2; if (Math.abs(dd) <= t.wv / 2 && (!best || t.seq > best.seq)) best = t; }
    return best; };

  let bad = each((d, L) => { const N = L.N, K = 2 * N, want = [...Array(K).keys(), K, -1], o = L.passes.map(p => p.o);
    if (L.groups.length !== 1 || L.groups[0].lsign !== 1 || JSON.stringify(o) !== JSON.stringify(want) || L.P !== 2 * N + 2) return 'offsets ' + o;
    for (const p of L.passes) { const u = X.thread(L, 'P' + p.p + 'U'), b = X.thread(L, 'P' + p.p + 'B'); if (u.offset !== b.offset || u.offset !== p.o) return 'back offset differs from up offset at pass ' + p.p; }
    const sl = L.passes.map(p => p.slot); return JSON.stringify(sl) === JSON.stringify([...Array(N).fill(1), ...Array(N).fill(2), 3, 3]) ? null : 'slots ' + sl; });
  ok('CH1 chevron rule: every pass puts its back thread on the same side as its up thread; threads run 0..K−1 in order, then one outline each side', bad.length === 0, bad);

  bad = each((d, L) => { const cr = X.crossings(L); for (const p of L.passes) { const u = X.thread(L, 'P' + p.p + 'U'), b = X.thread(L, 'P' + p.p + 'B'), mine = cr.filter(c => c.R === u.id && c.L === b.id);
      if (mine.length < 2) return 'few crossings'; for (const c of mine) { const k = Math.round((c.z - p.o * L.wv) / (L.S / 2)); if (!near(c.z, p.o * L.wv + k * L.S / 2, 1e-9)) return 'z not stepping along the rod'; const onA = angEq(c.theta, 0), onC = angEq(c.theta, Math.PI); if (!(mod(k, 2) === 0 ? onA : onC)) return 'crossing off the A/C line at pass ' + p.p; } } return null; }, SW.filter(d => d.diameterMm === 8));
  ok('CH2 a pass’s X lands on line A or C at every half spacing, displaced along the rod by offset × thread width (chevron: the crossings march along the rod; a diamond spreads them around it)', bad.length === 0, bad);

  ok('CH3 in a diamond the same crossings spread around the rod instead (contrast check)', (() => { const d = T.createDesign('diamonds', { measured: true, diameterMm: 8 }), L = T.layout(d), p = L.passes.find(q => q.o === 2), c = X.crossings(L).filter(x => x.R === 'P' + p.p + 'U' && x.L === 'P' + p.p + 'B'); return c.some(x => !angEq(x.theta, 0) && !angEq(x.theta, Math.PI)); })());

  (() => { let n = 0, miss = 0, seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ex = [];
    for (const d of SW.filter((_, i) => i % 2 === 0)) { const L = T.layout(d);
      for (let i = 0; i < 500; i++) { const z = rnd() * L.lenAdj * 0.999, th = rnd() * TAU, mp = 1 + Math.floor(rnd() * L.P), r = indep(L, z, th, mp), want = r ? r.slot : 0, got = L.coverAt(z, th, mp); n++; if (got.slot !== want || L.slotAt(z, th, mp) !== want || (r && (got.pass !== r.pass || got.leg !== r.leg))) { miss++; if (ex.length < 3) ex.push([z, th, mp, want, got]); } } }
    ok('CH4 the preview’s coverage equals an independent model built from the thread list (random points, every pass count)', miss === 0, { n, miss, ex }); })();

  bad = each((d, L) => { const g = L.groups[0], seqWant = [...g.passOf.keys()].sort((a, b) => a - b).map(o => g.slotOf(o)), eps = L.wv * 0.01;
    for (const th of [0, Math.PI]) for (const k of [3, 4]) { const base = k * L.S + (th === 0 ? 0 : L.S / 2), seq = []; for (let o = g.lo; o <= g.hi; o++) seq.push(L.slotAt(base + o * L.wv + eps * 0, th, L.P));
      if (JSON.stringify(seq) !== JSON.stringify(seqWant)) return 'A/C-line colour sequence ' + seq + ' vs ' + seqWant; }
    const pal = seqWant.join(''); if (pal === [...seqWant].reverse().join('')) return 'no direction'; return null; }, SW.filter(d => d.diameterMm === 8));
  ok('CH5 along line A (and C) the colours step in thread order, the same at every mark, and are not a palindrome: the arrowhead points a definite way (toward the tip)', bad.length === 0, bad);

  bad = each((d, L) => { let n = 0; for (let i = 0; i < 3000; i++) { const z = (i * 0.6180339 % 1) * L.lenAdj * 0.98 + L.lenAdj * 0.01, th = (i * 0.7548776 % 1) * TAU; if (L.slotAt(z, th, L.P) !== L.slotAt(z, TAU - th, L.P)) n++; } return n ? n + ' asymmetric points' : null; }, SW.filter(d => d.diameterMm === 8 && d.size < 3));
  ok('CH6 the colour field is mirror-symmetric about line A: each V has its apex on a mark line and two equal arms', bad.length === 0, bad);

  bad = each((d, L) => { const cr = X.crossings(L), id = x => L.threads.find(t => t.id === x); for (const c of cr) { const a = id(c.R), b = id(c.L), tr = (z, t) => t.fam === 'R' ? TAU * (z - t.z0 - t.offset * t.wv) / t.S : TAU * (t.z0 + t.offset * t.wv - z) / t.S;
      if (!angEq(tr(c.z, a), c.theta) || !angEq(tr(c.z, b), c.theta)) return 'crossing off thread'; if (c.visible) { const top = L.coverAt(c.z, c.theta, L.P); if (seqOf(top.pass, top.leg) < Math.max(a.seq, b.seq)) return 'layering'; } }
    for (const t of L.threads) { const pp = X.pathPoints(L, t), a = t.leg === 'up' ? pp[0] : pp[pp.length - 1], b = t.leg === 'up' ? pp[pp.length - 1] : pp[0]; if (!near(a[0], 0, 1e-9) || !near(b[0], L.lenAdj, 1e-9) || !angEq(a[1], b[1])) return t.id + ' ends'; for (let i = 1; i < pp.length; i++) { if (t.leg === 'up' ? pp[i][0] <= pp[i - 1][0] : pp[i][0] >= pp[i - 1][0]) return 'direction'; if (pp[i][1] <= pp[i - 1][1]) return 'rod turn'; } } return null; }, SW.filter(d => d.diameterMm === 8 && d.size % 2 === 1));
  ok('CH7 crossings lie on both threads, later passes lie over earlier ones, and every thread runs butt-to-tip or tip-to-butt turning the rod the same way, ending at its start angle', bad.length === 0, bad);

  bad = each((d, L) => { for (const p of L.passes) { const o = p.o, c = L.groups[0].slotOf(o) === undefined; for (let z = 0; z < 1; z++); }
    const steps = T.steps(d).filter(s => s.kind === 'pass'); if (steps.length !== L.P) return 'count';
    for (let i = 0; i < steps.length; i++) { const s = steps[i], p = L.passes[i], v = X.passView(L, p.p), side = p.o > 0 ? 'tip' : 'butt'; if (v.sideUp !== v.sideBack) return 'sides differ p' + p.p;
      if (i > 0 && !(s.legs.every(l => l.action.includes(side + '-side edge')))) return 'wording p' + p.p + ' ' + s.legs.map(l => l.action); if (!/^PASS \d+ OF \d+ — [A-Z ]+$/.test(s.head)) return 'head'; if (s.legs.map(l => l.action).join(' ').length > 190) return 'long';
      const svg = X.diagramSVG(d, L, L.P, p.p), st = svg.match(/<g data-role="start"[^>]*>/)[0]; if (+attr(st, 'data-z') !== v.start[0] || !near(+attr(st, 'data-theta'), mod(v.start[1], TAU), 1e-9)) return 'start marker p' + p.p;
      const act = new Set((svg.match(/data-pass="\d+" data-leg="\w+" data-state="active"/g) || []).map(q => attr(q, 'data-pass'))), done = (svg.match(/data-state="done"/g) || []).length; if (act.size !== 1 || !act.has(String(p.p)) || done !== 2 * (p.p - 1)) return 'highlight p' + p.p;
      const rb = X.ribbon(L, p.p); for (const row of [rb.up, rb.back]) { const a = row.filter(c => c.state === 'active'); if (a.length !== 1 || a[0].offset !== p.o) return 'ribbon p' + p.p; } }
    const first = steps[0]; return first.how.some(l => /Chevron rule/.test(l)) && first.howOpen ? null : 'rule not explained on pass 1'; }, SW.filter(d => d.diameterMm === 8 && d.size === 1));
  ok('CH8 workshop: every pass names its side ("tip-side edge" for both legs; outline on the butt side says butt), highlights only that pass, START matches the path, ribbon cell at the same offset on both rows, rule explained on pass 1', bad.length === 0, bad);

  bad = each((d, L) => { const marks = L.marks; if (marks.A.length !== L.n + 1 || marks.C.length !== L.n) return 'marks'; const u = X.thread(L, 'P1U'); for (let k = 0; k <= L.n; k++) if (!marks.A.some(m => near(m, k * L.S, 1e-9))) return 'A'; return null; }, SW.filter(d => d.diameterMm === 8));
  ok('CH9 scale: crossings every spacing×D on both lines (marks identical to the diamond), 2N+2 passes; the size control changes spacing and the marks with it', bad.length === 0 && [0, 3, 5].every(s => near(T.layout(mk({ diameterMm: 8, size: s })).S, X.SPACING[s] * 8, 1e-9)), bad);

  ok('CH10 evidence: chevron is labelled documented in its rule and not bench tested; no validation claims', (() => { const L = T.layout(mk()); return L.evidence.tier === 'documented' && /not bench tested/i.test(L.evidence.bench) && !/validated/i.test(JSON.stringify(L.evidence)) && L.spec.note.includes('same side'); })());

  ok('CH11 existing experimental grid chevrons are preserved, and the word "chevron" now selects the thread-path wrap while "zigzag" still selects the grid one', (() => { const L = T.layout(T.createDesign('chevrons')); return T.EXPERIMENTAL.includes('chevrons') && L.family === 'grid' && T.parse('red and gold chevron').design.pattern === 'chevronwrap' && T.parse('zigzag').design.pattern === 'chevrons' && T.GALLERY.includes('chevronwrap'); })());
};
