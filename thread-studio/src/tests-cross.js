// Diamond cross-wrap geometry tests. Called from tests.js. The brute-force references below use a different
// formulation from the engine: perpendicular distance on the unrolled surface, and root scanning of the thread angles.
const T = require('./engine.js'); require('./crosswrap.js'); const X = T.cross, TAU = 2 * Math.PI;
const mod = (a, b) => ((a % b) + b) % b;
const angEq = (a, b) => Math.abs(mod(a - b + Math.PI, TAU) - Math.PI) < 1e-9;   // equal as angles
module.exports = function (ok, near) {
  const mk = (o) => T.createDesign('diamonds', Object.assign({ measured: true }, o || {}));
  const SWEEP = []; for (const dia of [4, 6, 8, 10, 12.5, 16, 25]) for (const size of [0, 1, 2, 3, 4, 5]) for (const bt of [3, 5, 7]) for (const th of ['A', 'D', 'E']) SWEEP.push(mk({ diameterMm: dia, size, bandThreads: bt, thread: th }));

  // ---- measurements ----
  (() => { let bad = [];
    for (const d of SWEEP) { const L = T.layout(d), mult = X.SPACING[d.size];
      if (!near(L.S, mult * d.diameterMm, 1e-9)) bad.push(['S', d.diameterMm, d.size]);
      if (!near(L.lenAdj, L.n * L.S, 1e-9) || L.lenAdj > d.lengthMm + 1e-6 && L.n > 2 || d.lengthMm - L.lenAdj >= L.S + 1e-6 && L.n > 2) bad.push(['len', d.diameterMm, d.size, L.lenAdj]);
      if (L.marks.A.length !== L.n + 1 || L.marks.C.length !== L.n) bad.push(['count']);
      if (!L.marks.A.every((z, k) => near(z, k * L.S, 1e-9)) || !L.marks.C.every((z, k) => near(z, (k + 0.5) * L.S, 1e-9))) bad.push(['pos']);
      if (!near(L.C, Math.PI * d.diameterMm, 1e-9)) bad.push(['C']);
      if (!near(L.wv, L.w * Math.sqrt(1 + Math.pow(L.S / (Math.PI * d.diameterMm), 2)), 1e-12)) bad.push(['wv']);
    }
    ok('K1 ' + SWEEP.length + ' rod/size/band/thread combinations: S = multiple of diameter, wrap length = whole spacings, A marks at k*S, C marks half a spacing between, circumference = pi*D', bad.length === 0, bad.slice(0, 4)); })();
  (() => { let bad = [];
    for (const d of SWEEP) { const L = T.layout(d); if (L.warnings.some(w => w.id === 'nofit')) continue; if ((L.N + 4) * L.wv > X.FILL * L.S + 1e-9) bad.push([d.diameterMm, d.size, L.N]); if (![3, 5, 7].includes(L.N) || L.N > d.bandThreads) bad.push(['N']); }
    ok('K2 band width never exceeds ' + X.FILL * 100 + '% of the pitch (reduced automatically, or warned)', bad.length === 0, bad.slice(0, 3));
    ok('K2b a rod too small for any band says so', T.layout(mk({ diameterMm: 3, size: 0, thread: 'E' })).warnings.some(w => w.id === 'nofit' || w.id === 'bandfit')); })();
  ok('K3 wrap length rounds down to whole spacings for lengths 60 to 600 mm', (() => { for (let len = 60; len <= 600; len += 7) { const L = T.layout(mk({ lengthMm: len })); if (L.lenAdj > len + 1e-6 || len - L.lenAdj >= L.S + 1e-6) return false; } return true; })());

  // ---- direction ----
  (() => { const L = T.layout(mk()); let ok1 = true, ok2 = true, ok3 = true;
    for (const t of L.threads) { const pts = X.pathPoints(L, t), dir = t.leg === 'up' ? 1 : -1;
      for (let i = 1; i < pts.length; i++) { const dth = pts[i][1] - pts[i - 1][1], dz = pts[i][0] - pts[i - 1][0];
        if (!(dth > 0)) ok1 = false;                               // theta increases along travel for every thread: the rod turns one way throughout
        if (Math.sign(dz) !== dir) ok2 = false;                    // up threads travel butt to tip, back threads tip to butt
      }
      const pz = X.pathPoints(L, t).map(p => p[0]); if (t.leg === 'up' ? !near(pz[0], 0) || !near(pz[pz.length - 1], L.lenAdj) : !near(pz[0], L.lenAdj) || !near(pz[pz.length - 1], 0)) ok3 = false; }
    ok('D1 every thread turns the same way while the feed direction reverses', ok1);
    ok('D2 up threads run butt to tip, back threads tip to butt, full wrap length', ok2 && ok3);
    const R = L.threads.find(t => t.id === 'P1U'), Lh = L.threads.find(t => t.id === 'P1B');
    const lean = t => { const p = X.pathPoints(L, t).filter(q => true).sort((a, b) => a[0] - b[0]); return Math.sign(p[1][1] - p[0][1]); };
    ok('D3 up threads lean "\\" (theta rises with z), back threads lean "/" (theta falls with z)', lean(R) === 1 && lean(Lh) === -1); })();
  ok('D4 pitch: one full turn per crossing spacing S', (() => { const L = T.layout(mk()), t = L.threads[0], p = X.pathPoints(L, t, 8); return near(p[8][1] - p[0][1], TAU, 1e-9) && near(p[8][0] - p[0][0], L.S, 1e-9); })());

  // ---- continuity of the thread through the turn-arounds ----
  (() => { let e1 = true, e2 = true; const L = T.layout(mk()), maxD = TAU * 2 * L.J * L.wv / L.S + 1e-9;
    for (let p = 1; p <= L.P; p++) { const up = X.pathPoints(L, X.thread(L, 'P' + p + 'U')), bk = X.pathPoints(L, X.thread(L, 'P' + p + 'B'));
      if (!near(mod(up[up.length - 1][1] - bk[0][1] + Math.PI, TAU) - Math.PI, 0, 1e-9) || !near(up[up.length - 1][0], bk[0][0])) e1 = false;   // up thread's end is the back thread's start (tip end)
      if (p < L.P) { const nu = X.pathPoints(L, X.thread(L, 'P' + (p + 1) + 'U')); const dth = Math.abs(mod(bk[bk.length - 1][1] - nu[0][1] + Math.PI, TAU) - Math.PI); if (dth > maxD) e2 = false; } }
    ok('T1 each pass is one unbroken thread: the up thread ends exactly where the back thread starts (tip end)', e1);
    ok('T2 at the butt end the next pass starts within the band width of where the last one ended (hidden under the end band)', e2); })();

  // ---- crossings ----
  (() => { const L = T.layout(mk()), cs = X.crossings(L), c0 = cs.filter(c => c.R === 'P1U' && c.L === 'P1B' && c.z >= 0 && c.z <= L.lenAdj);
    ok('X1 the first up/back threads cross exactly on the marks: A marks at theta 0, C marks at theta pi', c0.length === 2 * L.n + 1 && c0.every(c => { const k = Math.round(c.z / (L.S / 2)); return near(c.z, k * L.S / 2, 1e-9) && angEq(c.theta, k % 2 ? Math.PI : 0); }));
    ok('X2 crossing marks coincide with the mark lists (A even, C odd)', L.marks.A.every(z => c0.some(c => near(c.z, z, 1e-9) && angEq(c.theta, 0))) && L.marks.C.every(z => c0.some(c => near(c.z, z, 1e-9) && angEq(c.theta, Math.PI))));
    // brute force: scan z for sign changes of sin((thetaR - thetaL)/2)
    let bad = 0, n = 0;
    for (const [a, b] of [['P1U', 'P1B'], ['P2U', 'P3B'], ['P6U', 'P5B'], ['P9U', 'P2B']]) { const ta = X.thread(L, a), tb = X.thread(L, b), want = cs.filter(c => c.R === a && c.L === b && c.z >= 0 && c.z <= L.lenAdj).map(c => c.z).filter(z => z > 1e-9 && z < L.lenAdj - 1e-9).sort((x, y) => x - y), got = [];
      const f = z => Math.sin((TAU * (z - ta.offset * L.wv) / L.S - TAU * (tb.offset * L.wv - z) / L.S) / 2); let prev = f(0), step = L.S / 400;
      for (let z = step; z <= L.lenAdj + 1e-9; z += step) { const v = f(z); if (prev * v < 0) { let lo = z - step, hi = z; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid; } got.push((lo + hi) / 2); } prev = v; }
      n++; if (got.length !== want.length || got.some((g, i) => Math.abs(g - want[i]) > 1e-6)) bad++; }
    ok('X3b the first threads also cross exactly at both ends of the wrap (z = 0 and z = length), where the turn-arounds are', cs.some(c => c.R === 'P1U' && c.L === 'P1B' && near(c.z, 0, 1e-9)) && cs.some(c => c.R === 'P1U' && c.L === 'P1B' && near(c.z, L.lenAdj, 1e-9)));
    ok('X3 closed-form crossing positions match a brute-force root scan for ' + n + ' thread pairs', bad === 0, bad);
    ok('X4 crossings of the same pair are exactly S/2 apart along the rod', (() => { const z = cs.filter(c => c.R === 'P4U' && c.L === 'P4B').map(c => c.z).sort((a, b) => a - b); return z.every((v, i) => i === 0 || near(v - z[i - 1], L.S / 2, 1e-9)); })()); })();

  // ---- layering ----
  (() => { const L = T.layout(mk()), cs = X.crossings(L).filter(c => c.visible);
    ok('Y1 at every crossing the thread laid later is on top (back over up within a pass, later passes over earlier)', cs.every(c => { const a = X.thread(L, c.R), b = X.thread(L, c.L), top = a.seq > b.seq ? a : b; return c.top === top.id; }));
    ok('Y2 within one pass the back thread is always over the up thread', cs.filter(c => c.R.slice(1, -1) === c.L.slice(1, -1)).every(c => c.top === c.L));
    // preview consistency: the colour the preview draws at a crossing is the colour of the top thread
    let bad = 0, n = 0;
    for (const c of cs.filter(c => (c.R === 'P1U' && c.L === 'P3B') || (c.R === 'P5U' && c.L === 'P2B') || (c.R === 'P8U' && c.L === 'P9B'))) { n++; const top = X.thread(L, c.top); if (L.slotAt(c.z, c.theta) !== top.slot) bad++; }
    ok('Y3 the preview colour at ' + n + ' sampled crossings is the top thread’s colour', n > 20 && bad === 0, bad); })();

  // ---- preview versus an independent physical model ----
  (() => { const d = mk({ diameterMm: 9, size: 2 }), L = T.layout(d), R = d.diameterMm / 2, m = L.S / (Math.PI * d.diameterMm); let bad = 0, n = 0, seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 6000; i++) {
      const z = L.cap + 0.5 + rnd() * (L.lenAdj - 2 * L.cap - 1), th = rnd() * TAU, x = R * th; let best = -1, bestSeq = -1, edge = false;
      for (const t of L.threads) {
        const o = t.offset * L.wv; let dmin = 1e9;
        for (let k = -40; k <= 40; k++) { const zc = (t.fam === 'R' ? m * x + o : -m * x + o) + k * L.S - (t.fam === 'R' ? 0 : 0); dmin = Math.min(dmin, Math.abs(z - zc) / Math.sqrt(1 + m * m)); }
        if (Math.abs(dmin - L.w / 2) < 1e-6) edge = true; if (dmin <= L.w / 2 && t.seq > bestSeq) { bestSeq = t.seq; best = t.slot; } }
      if (edge) continue; n++; if (L.slotAt(z, th) !== (best < 0 ? 0 : best)) bad++;
    }
    ok('V1 preview colour = top-most thread within half a thread width, from an independent perpendicular-distance model (' + n + ' random points)', bad === 0 && n > 5000, bad); })();

  // ---- ribbon structure and colour sequence ----
  (() => { const L = T.layout(mk()), h = L.h, offs = L.passes.map(p => p.o);
    ok('B1 passes lay a centre thread first, then alternate tip/butt side outward', offs[0] === 0 && offs.slice(1, 2 * h + 1).every((o, i) => o === (i % 2 === 0 ? 1 : -1) * (Math.floor(i / 2) + 1)));
    ok('B2 the main band covers offsets -h..h once each, then one inner and one outer outline each side', (() => { const main = L.passes.filter(p => p.slot === 1).map(p => p.o).sort((a, b) => a - b); return main.length === L.N && main.every((o, i) => o === i - h) && L.passes.filter(p => p.slot === 2).every(p => Math.abs(p.o) === h + 1) && L.passes.filter(p => p.slot === 3).every(p => Math.abs(p.o) === h + 2) && L.P === L.N + 4; })());
    ok('B3 colour sequence in time: main, then inner, then outer', (() => { const sl = L.passes.map(p => p.slot); return sl.every((s, i) => i === 0 || s >= sl[i - 1]) && sl[0] === 1 && sl[sl.length - 1] === 3; })());
    ok('B4 each thread touches the last: offsets are consecutive integers (no gaps in the ribbon)', (() => { const o = L.passes.map(p => p.o).sort((a, b) => a - b); return o.every((v, i) => i === 0 || v - o[i - 1] === 1); })()); })();
  (() => { const L = T.layout(mk());
    ok('B5 slotAt stages: bare rod, underwrap only, passes so far, then end bands', L.slotAt(10, 0, -1) === -1 && L.slotAt(10, 0, 0) === 0 && (() => { let a = 0, b = 0; for (let i = 0; i < 200; i++) { const th = i * 0.37; if (L.slotAt(1 + (i % 4) * 0.9, th, L.P) === 3) a++; if (L.slotAt(1 + (i % 4) * 0.9, th) === 3) b++; if (L.slotAt(L.lenAdj - 1 - (i % 4) * 0.9, th) !== 3) return false; } return b === 200 && a < 200; })() && L.slotAt(-1, 0) === -1 && L.slotAt(L.lenAdj + 1, 0) === -1);
    let grows = true; for (let i = 0; i < 400; i++) { const z = 8 + i * 0.3, th = i * 0.7; let covered = 0; for (let p = 0; p <= L.P; p++) { const c = L.slotAt(z, th, p) !== 0; if (covered && !c) grows = false; if (c) covered = 1; } }
    ok('B6 a point once covered by a thread stays covered as passes are added (preview steps only add thread)', grows); })();

  // ---- thread quantities ----
  (() => { const L = T.layout(mk({ diameterMm: 10 })), t = L.threads[0], pts = X.pathPoints(L, t, 64), R = 5; let len3 = 0;
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dz = b[0] - a[0], dx = R * (b[1] - a[1]); len3 += Math.hypot(dz, dx); }
    ok('Q1 leg length equals the numerically integrated 3-D helix length (within 0.1%)', Math.abs(len3 - L.leg) / L.leg < 1e-3, [len3, L.leg]);
    ok('Q2 thread per colour grows with wrap length; thread per mm of wrap is the same for every rod diameter at a given spacing multiple (S is proportional to D)', T.layout(mk({ lengthMm: 300 })).threadMm[1] > T.layout(mk({ lengthMm: 150 })).threadMm[1] && (() => { const r = d => { const L = T.layout(mk({ diameterMm: d })); return L.leg / L.lenAdj; }; return near(r(14), r(8), 1e-9); })()); })();

  // ---- instructions are generated from the same geometry ----
  (() => { const d = mk(), L = T.layout(d), st = T.steps(d), passSteps = st.filter(s => s.kind === 'pass');
    ok('W1 one numbered pass step per geometry pass, in order, with the same colour and offset', passSteps.length === L.P && passSteps.every((s, i) => s.pass === L.passes[i].p && s.slot === L.passes[i].slot && s.offset === L.passes[i].o && s.title.startsWith('Pass ' + (i + 1) + ' of ' + L.P)));
    const mk4 = st.find(s => s.kind === 'marks');
    ok('W2 the marking step carries the engine’s mark lists and spacing; the text quotes the same counts and spacing', JSON.stringify(mk4.marks) === JSON.stringify(L.marks) && mk4.spacing === L.S && mk4.text.includes((L.n + 1) + ' marks') && mk4.text.includes(L.n + ' marks') && mk4.text.includes((Math.round(L.S * 10) / 10).toString()));
    ok('W3 the axes step quotes circumference and half circumference', (() => { const a = st.find(s => s.kind === 'axes'); return a.text.includes((Math.round(L.C * 10) / 10).toString()) && a.text.includes((Math.round(L.C / 2 * 10) / 10).toString()); })());
    ok('W4 sequence: threads, underwrap, lines, marks, tape, passes, end bands, finish', (() => { const k = st.map(s => s.kind).filter((v, i, a) => a.indexOf(v) === i); return k.join() === 'spools,base,axes,marks,anchors,pass,caps,finish'; })());
    ok('W5 each colour’s thread is tied in once and tied off once (tie-offs = colours)', (() => { const ties = passSteps.filter(s => /Tie in/.test(s.text)).length, offs = passSteps.filter(s => /tie off under/.test(s.text)).length; return ties === 3 && offs === 3; })());
    ok('W6 side words in the steps match the geometry: positive offset = tip side, negative = butt side', passSteps.slice(1).every(s => { const up = s.offset, bk = -s.offset, a = s.text.match(/against the (tip|butt) side edge of the “\\”/), b = s.text.match(/against the (tip|butt) side edge of the “\/”/); return a && b && a[1] === (up > 0 ? 'tip' : 'butt') && b[1] === (bk > 0 ? 'tip' : 'butt'); }));
    const svg1 = T.cross.diagramSVG(d, L, 1, 1), svg5 = T.cross.diagramSVG(d, L, 5, 5);
    ok('W7 the diagram shows every mark and the current pass’s two threads', (svg1.match(/<circle/g) || []).length === 2 * (L.n + 1) + L.n && (svg1.match(/stroke-width="2.6"/g) || []).length === 2 && (svg5.match(/stroke-width="2.6"/g) || []).length === 2);
    ok('W8 the unmeasured design starts by asking for the rod size; the measured one does not', T.steps(T.createDesign('diamonds'))[0].kind === 'needsize' && st[0].kind === 'spools');
    ok('W9 every step is tagged calculated, documented or experimental', st.every(s => Array.isArray(s.evidence) && s.evidence.every(e => ['geometry', 'documented', 'experimental'].includes(e))));
    const tp = T.cross.templateHTML(d); ok('W10 the printable guide has a tick for every A and C mark (up to 270 mm) at real-size mm units', (tp.match(/>A \d+</g) || []).length === Math.min(L.n + 1, Math.floor(270 / L.S) + 1) && (tp.match(/>C \d+</g) || []).length >= 1 && /width="70mm"/.test(tp)); })();

  // ---- honesty ----
  (() => { const L = T.layout(mk()), txt = JSON.stringify([L.evidence, L.method, T.steps(mk()).map(s => s.title + s.text)]).toLowerCase();
    ok('H1 never claims validation: every design says "not bench tested"; no "validated"/"proven"/"tested on" claims', [...T.GALLERY, ...T.EXPERIMENTAL, 'text'].every(id => /not bench tested/i.test(T.layout(T.createDesign(id)).evidence.bench)) && !/validated|proven|guarantee/.test(txt));
    ok('H2 cross wrap is tiered documented; geometry/documented/experimental statements are all present', L.evidence.tier === 'documented' && !!L.evidence.verified && !!L.evidence.documented && !!L.evidence.experimental); })();
  ok('R1 undo/redo and saved design still round-trip the cross-wrap settings', (() => { const h = new T.History(mk()); h.push(mk({ bandThreads: 7, size: 3 })); const back = h.undo(); const fwd = h.redo(); return back.bandThreads === 5 && back.size === 1 && fwd.bandThreads === 7 && fwd.size === 3 && JSON.stringify(JSON.parse(JSON.stringify(fwd))) === JSON.stringify(fwd); })());
  ok('R2 sizing: Larger widens the crossing spacing, Smaller narrows it, ends are bounded', (() => { const a = mk(), b = T.resize(a, 1), c = T.resize(a, -1); let d = a, g = 0; while (T.layout(d).larger != null && g++ < 20) d = T.resize(d, 1); return T.layout(b).S > T.layout(a).S && T.layout(c).S < T.layout(a).S && T.layout(d).larger == null; })());
};
