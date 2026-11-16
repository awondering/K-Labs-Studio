// Tests for Double Diamond, Diamond Chain and Multi-Layer Diamond. The coverage model below is independent of the engine's lookup
// tables: it works only from the thread list (family, pitch, shift, offset, width, sequence) and perpendicular distance on the unrolled surface.
const T = require('./engine.js'); require('./crosswrap.js'); const X = T.cross, TAU = 2 * Math.PI;
const mod = (a, b) => ((a % b) + b) % b, angEq = (a, b) => Math.abs(mod(a - b + Math.PI, TAU) - Math.PI) < 1e-9;
const attr = (s, a) => { const m = s.match(new RegExp(a + '="([^"]*)"')); return m ? m[1] : null; };
module.exports = function (ok, near) {
  const KINDS = ['doublediamond', 'chain', 'layered'], mk = (k, o) => T.createDesign(k, Object.assign({ measured: true }, o || {}));
  const SW = []; for (const k of KINDS) for (const dia of [4, 6.5, 8, 12.5, 25]) for (const size of [0, 1, 3, 5]) for (const bt of X.SPEC[k].options) SW.push(mk(k, { diameterMm: dia, size, bandThreads: bt }));
  const each = (f, list) => { const bad = []; for (const d of (list || SW)) { const L = T.layout(d), r = f(d, L); if (r) bad.push(d.pattern + ' ' + d.diameterMm + '/' + d.size + '/' + d.bandThreads + ' ' + r); } return bad.slice(0, 3); };
  const D8 = k => mk(k, { diameterMm: 8, size: 1 }), pts = (L, t) => X.pathPoints(L, t);
  const seqOf = (p, leg) => 2 * p - 2 + (leg === 'back' ? 1 : 0);
  // independent top-thread model: the highest-sequence thread within half a thread width of the point
  const indep = (L, z, th, mp) => { let best = null; const t0 = mod(th, TAU);
    for (const t of L.threads) { if (t.pass > mp) continue; const arg = t.fam === 'R' ? z - t.S * t0 / TAU - t.z0 - t.offset * t.wv : z + t.S * t0 / TAU - t.z0 - t.offset * t.wv, dd = mod(arg + t.S / 2, t.S) - t.S / 2; if (Math.abs(dd) <= t.wv / 2 && (!best || t.seq > best.seq)) best = t; }
    return best; };

  // ---- construction ----
  let bad = each((d, L) => { const abs = L.groups[0].offs; return null; }, []);
  bad = each((d, L) => { const o = L.passes.map(p => p.o), h = L.h, want = [0]; for (let k = 1; k <= h; k++) want.push(k, -k); want.push(h + 2, -(h + 2), h + 4, -(h + 4));
    if (L.groups.length !== 1 || JSON.stringify(o) !== JSON.stringify(want)) return 'offsets ' + o; const gaps = L.passes.map(p => p.gap), wg = want.map(x => Math.abs(x) > h ? 1 : 0); if (JSON.stringify(gaps) !== JSON.stringify(wg)) return 'gaps ' + gaps;
    const sl = L.passes.map(p => p.slot), ws = want.map(x => Math.abs(x) <= h ? 1 : Math.abs(x) === h + 2 ? 2 : 3); return JSON.stringify(sl) === JSON.stringify(ws) ? null : 'slots'; }, SW.filter(d => d.pattern === 'doublediamond'));
  ok('NP1 Double Diamond: core band, then a one-thread gap, inner frame, a gap, outer frame; the gaps are real empty positions', bad.length === 0, bad);

  bad = each((d, L) => { const g = L.groups; if (g.length !== 2 || g[0].S !== g[1].S || !near(g[1].z0, L.S / 2, 1e-9) || g[0].z0 !== 0) return 'groups'; if (L.marks.A.length !== 2 * L.n + 1 || L.marks.C.length !== 2 * L.n + 1) return 'marks';
    for (let k = 0; k <= 2 * L.n; k++) if (!near(L.marks.A[k], k * L.S / 2, 1e-9) || !near(L.marks.C[k], k * L.S / 2, 1e-9)) return 'mark spacing'; return L.passes.filter(p => p.g === 0).length === L.passes.filter(p => p.g === 1).length ? null : 'unequal sets'; }, SW.filter(d => d.pattern === 'chain'));
  ok('NP2 Diamond Chain: two interlocked lattices of equal pitch half a spacing apart, with marks every half spacing on both lines', bad.length === 0, bad);

  bad = each((d, L) => { const g = L.groups; if (g.length !== 2 || !near(g[1].S, 3 * L.S, 1e-9) || L.n % 3 !== 0) return 'groups/n ' + L.n; const o = L.passes.filter(p => p.g === 1).map(p => p.o); return JSON.stringify(o) === '[0,1,-1,2,-2]' ? null : 'coarse offsets ' + o; }, SW.filter(d => d.pattern === 'layered'));
  ok('NP3 Multi-Layer: a banded fine lattice plus a coarse lattice of three times the pitch; wrap length is whole large diamonds', bad.length === 0, bad);

  bad = each((d, L) => { for (let i = 0; i < L.P; i++) { const p = L.passes[i], g = L.groups[p.g]; if (p.p !== i + 1 || L.threads[2 * i].seq !== 2 * i || L.threads[2 * i + 1].seq !== 2 * i + 1) return 'seq'; if (i && L.passes[i - 1].g > p.g) return 'group order';
      if (p.o === 0) { if (p.inward !== null) return 'centre'; } else { const ip = g.passOf.get(p.inward); if (!(ip < p.p) || Math.abs(p.inward) >= Math.abs(p.o) || p.gap !== Math.abs(p.o) - Math.abs(p.inward) - 1 || Math.sign(p.inward) * Math.sign(p.o) < 0 && p.inward !== 0) return 'inward ' + p.p; } }
    const runs = L.passes.filter((p, i) => i === 0 || L.passes[i - 1].slot !== p.slot).length, steps = T.steps(d).filter(s => s.kind === 'pass'); if (L.tieOffs !== runs) return 'tieOffs ' + L.tieOffs + '/' + runs;
    if (steps.filter(s => s.notes.some(n => /^Tie in/.test(n))).length !== runs || steps.filter(s => s.notes.some(n => /tie off/.test(n))).length !== runs) return 'tie notes'; return null; });
  ok('NP4 construction order: groups in sequence, centre-out within a group, every thread lies against an earlier one, one tie-in and tie-off per run of a colour', bad.length === 0, bad);

  // ---- paths and marks ----
  bad = each((d, L) => { for (const t of L.threads) { const pp = pts(L, t), a = t.leg === 'up' ? pp[0] : pp[pp.length - 1], b = t.leg === 'up' ? pp[pp.length - 1] : pp[0]; if (!near(a[0], 0, 1e-9) || !near(b[0], L.lenAdj, 1e-9) || !angEq(a[1], b[1])) return t.id + ' ends'; for (let i = 1; i < pp.length; i++) { const dz = pp[i][0] - pp[i - 1][0], dth = pp[i][1] - pp[i - 1][1]; if (t.leg === 'up' ? dz <= 0 : dz >= 0) return t.id + ' dir'; if (dth <= 0) return t.id + ' rod turn'; } } return null; });
  ok('NP5 every thread of every new design runs butt to tip (up) or tip to butt (back), turns the rod the same way, and meets the tip and butt at the same angle', bad.length === 0, bad);

  bad = each((d, L) => { for (const g of L.groups) for (const fam of ['R', 'L']) { const t = L.threads.find(x => x.g === g.g && x.offset === 0 && x.fam === fam), u = t.z0 + 0, onA = [], onC = [];
      for (let k = -3; k <= L.n + 3; k++) { const za = u + k * g.S, zc = u + g.S / 2 + k * g.S; if (za >= -1e-9 && za <= L.lenAdj + 1e-9) onA.push(za); if (zc >= -1e-9 && zc <= L.lenAdj + 1e-9) onC.push(zc); }
      if (!onA.every(z => L.marks.A.some(m => near(m, z, 1e-9))) || !onC.every(z => L.marks.C.some(m => near(m, z, 1e-9)))) return 'centre thread of group ' + g.g + ' misses a mark'; } return null; });
  ok('NP6 the centre threads of each lattice pass exactly through marks on line A and line C (the large lattice uses every third A mark; the chain’s second set uses the other half-spaced marks)', bad.length === 0, bad);

  // ---- coverage, crossings, layering ----
  (() => { let n = 0, miss = 0, seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, ex = [];
    for (const d of SW.filter((_, i) => i % 3 === 0)) { const L = T.layout(d);
      for (let i = 0; i < 500; i++) { const z = rnd() * L.lenAdj * 0.999, th = rnd() * TAU, mp = 1 + Math.floor(rnd() * L.P), r = indep(L, z, th, mp), want = r ? r.slot : 0, got = L.coverAt(z, th, mp); n++; if (got.slot !== want || L.slotAt(z, th, mp) !== want || (r && (got.pass !== r.pass || got.leg !== r.leg))) { miss++; if (ex.length < 3) ex.push([d.pattern, z, th, mp, want, got]); } } }
    ok('NP7 the preview’s coverage (slotAt/coverAt) equals an independent model built from the thread list, at random points for every pass count', miss === 0, { n, miss, ex }); })();

  bad = each((d, L) => { for (const t of L.threads) { const pp = pts(L, t); for (let i = 0; i < pp.length - 1; i++) { const z = (pp[i][0] + pp[i + 1][0]) / 2, th = (pp[i][1] + pp[i + 1][1]) / 2; if (z < 1e-6 || z > L.lenAdj - 1e-6) continue; const c = L.coverAt(z, th, t.pass); if (c.pass !== t.pass) return t.id + ' not on its own path at z=' + z.toFixed(2); } } return null; }, SW.filter((d, i) => i % 7 === 0));
  ok('NP8 the thread drawn in the preview lies on its calculated path: points along each path are covered by that pass', bad.length === 0, bad);

  bad = each((d, L) => { const cr = X.crossings(L), id = x => L.threads.find(t => t.id === x); let cross = 0;
    for (const c of cr) { const a = id(c.R), b = id(c.L), tr = (z, t) => t.fam === 'R' ? TAU * (z - t.z0 - t.offset * t.wv) / t.S : TAU * (t.z0 + t.offset * t.wv - z) / t.S; if (!angEq(tr(c.z, a), c.theta) || !angEq(tr(c.z, b), c.theta)) return 'crossing not on both threads';
      if (a.g !== b.g) cross++; if (c.top !== (a.seq > b.seq ? a.id : b.id)) return 'top'; if (c.visible) { const mp = L.P, top = L.coverAt(c.z, c.theta, mp), s = seqOf(top.pass, top.leg); if (s < Math.max(a.seq, b.seq)) return 'layering at ' + c.R + '×' + c.L; } }
    return L.groups.length > 1 && cross === 0 ? 'no cross-lattice crossings' : null; }, [D8('chain'), D8('layered'), D8('doublediamond'), mk('chain', { diameterMm: 12.5, size: 3 }), mk('layered', { diameterMm: 6.5, size: 0 })]);
  ok('NP9 crossings, including those between the two lattices, lie on both threads and the higher-sequence thread is on top in the preview', bad.length === 0, bad);

  bad = each((d, L) => { const g0 = L.groups[0], g1 = L.groups[1], cr = X.crossings(L).filter(c => { const a = L.threads.find(t => t.id === c.R), b = L.threads.find(t => t.id === c.L); return a.g === g1.g && b.g === g1.g && a.offset === 0 && b.offset === 0; });
    const step = g1.S / 2, first = mod(g1.z0, step); for (let k = 0; k * step + first <= L.lenAdj + 1e-9; k++) { const z = first + k * step, hit = cr.find(c => near(c.z, z, 1e-6)); if (!hit) return 'missing centre crossing at ' + z; const m = Math.round((z - g1.z0) / step), onA = near(mod(hit.theta + 1e-9, TAU), 0, 1e-6) || near(mod(hit.theta, TAU), TAU, 1e-6), onC = near(hit.theta, Math.PI, 1e-6); if (!(mod(m, 2) === 0 ? onA : onC)) return 'line at ' + z; }
    return cr.length === Math.floor((L.lenAdj - first) / step + 1e-9) + 1 ? null : 'count ' + cr.length; }, SW.filter(d => d.pattern !== 'doublediamond' && d.diameterMm === 8 && d.size === 1).map(d => d));
  ok('NP10 each second lattice’s centre crossings fall on A and C alternately at its own half-pitch (chain: every half spacing from C 0; large lattice: every 1.5 spacings from A 0)', bad.length === 0, bad);

  // ---- the same views used by the workshop ----
  bad = each((d, L) => { for (let p = 1; p <= L.P; p++) { const v = X.passView(L, p), svg = X.diagramSVG(d, L, L.P, p), st = svg.match(/<g data-role="start"[^>]*>/)[0], tu = svg.match(/<g data-role="turn"[^>]*>/)[0];
      if (+attr(st, 'data-z') !== v.start[0] || !near(+attr(st, 'data-theta'), mod(v.start[1], TAU), 1e-9) || +attr(tu, 'data-z') !== v.turn[0]) return 'markers p' + p;
      const done = (svg.match(/data-state="done"/g) || []).length, act = new Set((svg.match(/data-pass="\d+" data-leg="\w+" data-state="active"/g) || []).map(s => attr(s, 'data-pass'))); if (done !== 2 * (p - 1) || act.size !== 1 || !act.has(String(p))) return 'highlight p' + p;
      const ar = svg.match(/<polygon data-role="arrow"[^>]*>/g) || []; if (!ar.length || ar.some(a => (attr(a, 'data-leg') === 'up') !== (+attr(a, 'data-dz') === 1))) return 'arrows p' + p;
      const rb = X.ribbon(L, p), g = L.groupOf(p); for (const row of [rb.up, rb.back]) { if (row.filter(c => c.state === 'active').length !== 1 || row.filter(c => c.state === 'gap').length !== 2 * g.J + 1 - L.passes.filter(q => q.g === g.g).length) return 'ribbon p' + p; } }
    return null; }, SW.filter(d => d.diameterMm === 8 && d.size === 1));
  ok('NP11 for every pass of the new designs the diagram highlights only that pass, keeps earlier passes, places START/TURN at the real path ends, points arrows along travel, and the band strip shows gaps', bad.length === 0, bad);

  bad = each((d, L) => { const s = T.steps(d), pass = s.filter(x => x.kind === 'pass'); if (pass.length !== L.P) return 'count'; const gapIdx = L.passes.map((p, i) => p.gap ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < pass.length; i++) { const txt = pass[i].legs.map(l => l.action).join(' '); if (/gap/i.test(txt) !== (L.passes[i].gap > 0)) return 'gap wording p' + (i + 1); if (pass[i].how.join(' ') !== pass[i].text) return 'how'; if (i > 0 && txt.length > 190) return 'long p' + (i + 1); if (!/^PASS \d+ OF \d+ — [A-Z ]+$/.test(pass[i].head)) return 'head'; }
    const starts = L.groups.slice(1).map(g => pass[g.first - 1].legs[0].action); const want = d.pattern === 'chain' ? /^Start at C 0\./ : /^Start at A 0\./; if (d.pattern !== 'doublediamond' && !starts.every(a => want.test(a))) return 'lattice start ' + starts; return null; }, SW.filter(d => d.diameterMm === 8));
  ok('NP12 workshop steps: compact heads and actions, gap wording only where a gap is left, each second lattice says where it starts, full method kept under How to do this', bad.length === 0, bad);

  ok('NP13 the three designs are different constructions (not recolours): different group structure, thread counts, pitch or offsets', (() => { const sig = k => { const L = T.layout(mk(k, { diameterMm: 8 })); return JSON.stringify([L.groups.map(g => [g.mult, g.z0 / L.S, g.J]), L.passes.map(p => p.gap), L.P]); }; const s = ['diamonds', ...KINDS].map(sig); return new Set(s).size === 4; })());

  ok('NP14 evidence: the new designs are labelled experimental arrangements and none claims bench validation; the classic diamond keeps its documented label', ['diamonds', ...KINDS].every(k => { const L = T.layout(mk(k)); return /not bench tested/i.test(L.evidence.bench) && (k === 'diamonds' ? L.evidence.tier === 'documented' : L.evidence.tier === 'experimental' && /Experimental/.test(L.evidence.label)) && !/validated/i.test(JSON.stringify(L.evidence)); }));

  ok('NP15 other patterns keep their previous behaviour: bands, spiral, twist and the experimental grid designs still lay out with 2–3 slots and no cross fields', ['bands', 'spiral', 'twist', 'checks', 'dots'].every(k => { const L = T.layout(mk(k)); return !L.groups && L.family !== 'cross' && L.slotNames.length <= 3 && L.evidence && L.method; }));

  ok('NP16 describing the designs in words selects them', (() => { const r = x => T.parse(x).design.pattern; return r('a double diamond in red and gold') === 'doublediamond' && r('diamond chain') === 'chain' && r('multi-layer diamond') === 'layered' && r('gold diamonds on navy') === 'diamonds'; })());
};
