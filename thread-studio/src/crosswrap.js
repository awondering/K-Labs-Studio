/* K-Labs Thread Design Studio: diamond cross-wrap geometry engine.
   Everything the preview draws and everything the workshop says comes from the thread list built here.

   MODEL (independent implementation of the documented layout; see METHOD.md for sources and evidence tiers)
   - Two opposite reference lines run along the blank: A at theta = 0 and C at theta = pi. Theta increases in the
     direction the rod is turned while the thread travels (viewed with butt on the left, tip on the right, looking
     at the side facing you, theta increases down the face).
   - A marks sit at z = k*S, C marks at z = (k + 1/2)*S, with S the crossing spacing and z measured from the start
     of the wrap.
   - An "up" thread (butt to tip) is a helix of pitch S that leans "\" on the face toward you (family R).
     A "back" thread (tip to butt) is a helix of pitch S leaning "/" (family L). Both pass through every mark,
     so they cross on the marks: an X at each mark. The rod keeps turning the same way; only the feed direction reverses.
   - A band is built outward from a centre thread, one pass (up then back) at a time, each thread laid touching the last.
     Later threads lie over earlier ones (layered, not woven).
   - One continuous thread per colour does all that colour's passes, so tie-offs = number of colours.
   Constant blank diameter is assumed. */
(function (root) {
  'use strict';
  const T = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.THREAD;
  const TAU = Math.PI * 2, X = {}; T.cross = X;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), mod = (a, b) => ((a % b) + b) % b;
  X.SPACING = [0.75, 1, 1.25, 1.5, 2, 3];   // crossing spacing as a multiple of rod diameter (index 1 = the commonly quoted "equal to the diameter")
  X.BAND_OPTIONS = [3, 5, 7];                // threads in the main band
  X.CAP_MM = 6;                              // end band width at each end (experimental sizing)
  X.ALLOWANCE = 1.2; X.TAIL_MM = 150;         // thread allowances (experimental)
  X.FILL = 0.9;                              // threads of one family may fill at most this fraction of the pitch
  X.PASS_SLOTS = { main: 1, inner: 2, outer: 3 };
  X.passOffsets = h => { const o = [0]; for (let k = 1; k <= h; k++) o.push(k, -k); o.push(h + 1, -(h + 1), h + 2, -(h + 2)); return o; };

  // ---------- designs ----------
  // A design is an ordered list of lattice groups. A group is one cross-wrap lattice: helices of pitch mult*S through the marks,
  // shifted along the rod by shift*S, laid centre thread first and outward. Offsets may skip positions (a one-thread gap leaves the
  // underwrap showing). Groups are laid in order, so later groups lie over earlier ones. The classic diamond is a single group.
  const bandOffs = h => { const o = [0]; for (let k = 1; k <= h; k++) o.push(k, -k); return o; };
  const pair = (a, slot) => [{ o: a, slot }, { o: -a, slot }];
  const run = (offs, slot) => offs.map(o => ({ o, slot }));
  X.SPEC = {
    diamonds: { label: 'Diamond cross wrap', guide: 'diamond cross-wrap', options: [3, 5, 7], defN: 5, tier: 'documented', fill: 1, build: N => { const h = (N - 1) / 2, sl = j => { const a = Math.abs(j); return a <= h ? 1 : a === h + 1 ? 2 : 3; };
      return [{ mult: 1, shift: 0, offs: X.passOffsets(h).map(o => ({ o, slot: sl(o) })) }]; } },
    doublediamond: { label: 'Double diamond', options: [3, 5], defN: 5, tier: 'experimental', fill: 1, note: 'One-thread gaps between the bands let the underwrap show as fine lines between nested outlines.',
      build: N => { const h = (N - 1) / 2, a = h + 2, b = h + 4; return [{ mult: 1, shift: 0, offs: [].concat(run(bandOffs(h), 1), pair(a, 2), pair(b, 3)) }]; } },
    chain: { label: 'Diamond chain', options: [3, 5], defN: 3, tier: 'experimental', fill: 0.5, marksBoth: true, note: 'Two interlocked lattices, half a spacing apart, so one lattice crosses in the middle of the other’s diamonds.',
      build: N => { const h = (N - 1) / 2; return [{ mult: 1, shift: 0, offs: [].concat(run(bandOffs(h), 1), pair(h + 1, 3)) }, { mult: 1, shift: 0.5, offs: [].concat(run(bandOffs(h), 2), pair(h + 1, 3)) }]; } },
    chevronwrap: { label: 'Chevron cross wrap', guide: 'chevron cross-wrap', options: [2, 3, 4], defN: 3, tier: 'documented', fill: 1,
      note: 'Each additional thread goes on the same side of the last one, so the crossings march along the rod and the colours nest into arrowheads.',
      build: N => { const K = 2 * N; return [{ mult: 1, shift: 0, same: true, offs: [].concat(Array.from({ length: K }, (_, i) => ({ o: i, slot: i < N ? 1 : 2 })), [{ o: K, slot: 3 }, { o: -1, slot: 3 }]) }]; } },
    layered: { label: 'Multi-layer diamond', options: [3, 5], defN: 3, tier: 'experimental', fill: 1, unit: 3, viewWin: 7, note: 'A banded fine lattice with a larger lattice, three times the spacing, laid over it.',
      build: N => { const h = (N - 1) / 2, sl = j => { const a = Math.abs(j); return a <= h ? 1 : a === h + 1 ? 2 : 3; };
        return [{ mult: 1, shift: 0, offs: X.passOffsets(h).map(o => ({ o, slot: sl(o) })) }, { mult: 3, shift: 0, offs: [].concat(run([0, 1, -1], 4), pair(2, 3)) }]; } }
  };
  X.specFor = d => X.SPEC[d.pattern] || X.SPEC.diamonds;
  X.optionsFor = d => X.specFor(d).options;

  X.layout = function (d, L) {
    const spec = X.specFor(d), D = d.diameterMm, w = L.w, C = L.C, si = clamp(d.size == null ? 1 : d.size, 0, X.SPACING.length - 1), S = X.SPACING[si] * D;
    const wvOf = mult => { const mm = S * mult / (Math.PI * D); return w * Math.sqrt(1 + mm * mm); }, m = S / (Math.PI * D), wv = wvOf(1);
    const want = spec.options.includes(d.bandThreads) ? d.bandThreads : spec.defN;
    const widest = N => Math.max(...spec.build(N).map(g => { const lo = Math.min(...g.offs.map(x => x.o)), hi = Math.max(...g.offs.map(x => x.o)), width = g.same ? hi - lo + 1 : 2 * Math.max(Math.abs(lo), hi) + 1; return width * wvOf(g.mult) / (g.mult * S * spec.fill); }));
    const fits = N => widest(N) <= X.FILL;
    let N = want; while (N > 3 && !fits(N)) N = N === 7 ? 5 : 3;
    if (N < want) L.warnings.push({ id: 'bandfit', level: 'info', text: 'Main band reduced to ' + N + ' threads so the bands fit at this spacing.' });
    if (!fits(N)) L.warnings.push({ id: 'nofit', level: 'warn', text: 'The bands are too wide for this spacing on this rod. Make the diamonds larger.' });
    const h = (N - 1) / 2, unit = spec.unit || 1, n = unit > 1 ? Math.max(unit, Math.floor(d.lengthMm / S / unit + 1e-9) * unit) : Math.max(2, Math.floor(d.lengthMm / S + 1e-9)), len = n * S, cap = X.CAP_MM;
    if (d.lengthMm < 2 * S) L.warnings.push({ id: 'short', level: 'warn', text: 'The wrap length is shorter than two diamonds at this size. Increase the length or make the diamonds smaller.', fix: 'more' });
    // groups -> passes -> threads
    const passes = [], threads = [], groups = [];
    spec.build(N).forEach((g0, gi) => {
      const Sg = S * g0.mult, grp = { g: gi, mult: g0.mult, S: Sg, wv: wvOf(g0.mult), z0: g0.shift * S, passOf: new Map(), slotByOff: new Map(), lsign: g0.same ? 1 : -1, J: Math.max(...g0.offs.map(x => Math.abs(x.o))), lo: Math.min(...g0.offs.map(x => x.o)), hi: Math.max(...g0.offs.map(x => x.o)), c: (Math.min(...g0.offs.map(x => x.o)) + Math.max(...g0.offs.map(x => x.o))) / 2, first: passes.length + 1 }, laid = [];
      g0.offs.forEach(({ o, slot }) => {
        const p = passes.length + 1, near = o > 0 ? Math.max(...laid.filter(x => x >= 0 && x < o), -1e9) : o < 0 ? Math.min(...laid.filter(x => x <= 0 && x > o), 1e9) : null;
        const inward = o === 0 ? null : (Math.abs(near) > 1e8 ? 0 : near), gap = inward == null ? 0 : Math.abs(o - inward) - 1;
        laid.push(o); grp.passOf.set(o, p); grp.slotByOff.set(o, slot);
        passes.push({ p, o, slot, g: gi, inward, gap, S: Sg, turns: len / Sg });
        const base = { g: gi, S: Sg, wv: grp.wv, z0: grp.z0 };
        threads.push(Object.assign({ id: 'P' + p + 'U', pass: p, leg: 'up', fam: 'R', offset: o, slot, seq: 2 * p - 2 }, base), Object.assign({ id: 'P' + p + 'B', pass: p, leg: 'back', fam: 'L', offset: grp.lsign * o, slot, seq: 2 * p - 1 }, base));
      });
      grp.slotOf = j => grp.slotByOff.get(j); groups.push(grp);
    });
    const P = passes.length, g0 = groups[0];
    Object.assign(L, { family: 'cross', S, m, wv, n, lenAdj: len, cap, N, h, J: g0.J, D, size: si, larger: si < X.SPACING.length - 1 ? si + 1 : null, smaller: si > 0 ? si - 1 : null,
      sizeLabel: 'Crossings every ' + S.toFixed(1) + ' mm', bandThreads: N, spec, groups, viewWin: spec.viewWin || null });
    L.passes = passes; L.threads = threads; L.P = P;
    L.markLabel = spec.marksBoth ? ((line, k) => k) : ((line, k) => line === 'C' ? k + 1 : k);
    L.marks = spec.marksBoth ? { A: Array.from({ length: 2 * n + 1 }, (_, k) => k * S / 2), C: Array.from({ length: 2 * n + 1 }, (_, k) => k * S / 2) }
      : { A: Array.from({ length: n + 1 }, (_, k) => k * S), C: Array.from({ length: n }, (_, k) => (k + 0.5) * S) };
    // top thread at a point: the covering thread with the highest sequence number (later threads lie over earlier ones)
    const top = (z, th, mp) => {
      const t = mod(th, TAU); let best = -1, gi = 0, pass = 0, leg = null, j = 0;
      for (const g of groups) {
        const ph = g.S * t / TAU, cR = g.c * g.wv, cL = g.lsign * cR,   // window centred on the band, so one-sided bands wider than half a pitch are not misread
          dR = mod(z - g.z0 - ph - cR + g.S / 2, g.S) - g.S / 2 + cR, dL = mod(z - g.z0 + ph - cL + g.S / 2, g.S) - g.S / 2 + cL, jR = Math.round(dR / g.wv), jL = Math.round(dL / g.wv);
        if (Math.abs(jR) <= g.J) { const p = g.passOf.get(jR); if (p <= mp && 2 * p - 2 > best) { best = 2 * p - 2; gi = g.g; pass = p; leg = 'up'; j = jR; } }
        if (Math.abs(jL) <= g.J) { const p = g.passOf.get(g.lsign * jL); if (p <= mp && 2 * p - 1 > best) { best = 2 * p - 1; gi = g.g; pass = p; leg = 'back'; j = g.lsign * jL; } }
      }
      return best < 0 ? null : { slot: groups[gi].slotOf(j), pass, leg };
    };
    // maxPass: -1 bare rod, 0 underwrap only, p = passes 1..p, P+1 = everything including the end bands
    L.slotAt = (z, th, maxPass) => {
      if (z < 0 || z >= len) return -1; const mp = maxPass == null ? P + 1 : maxPass;
      if (mp < 0) return -1; if (mp >= P + 1 && (z < cap || z >= len - cap)) return 3; if (mp < 1) return 0;
      const c = top(z, th, mp); return c ? c.slot : 0;
    };
    // Presentation helpers, read-only: which pass/leg covers a point (same rule as slotAt), and lookups the views need.
    L.passOf = g0.passOf; L.slotOf = g0.slotOf;
    L.groupOf = p => groups[passes[p - 1].g];
    L.coverAt = (z, th, maxPass) => {
      if (z < 0 || z >= len) return { slot: -1 }; const mp = maxPass == null ? P + 1 : maxPass;
      if (mp < 0) return { slot: -1 }; if (mp >= P + 1 && (z < cap || z >= len - cap)) return { slot: 3, pass: P + 1, cap: true }; if (mp < 1) return { slot: 0, pass: 0 };
      return top(z, th, mp) || { slot: 0, pass: 0 };
    };
    // thread quantities: each leg is one helix, so its length follows its own pitch
    const K = L.slotNames.length, legOf = Sg => Math.sqrt(len * len + Math.pow(len / Sg * Math.PI * D, 2)), legsBy = new Array(K).fill(0), runs = new Array(K).fill(0);
    passes.forEach((p, i) => { p.leg = legOf(p.S); legsBy[p.slot] += 2 * p.leg; if (i === 0 || passes[i - 1].slot !== p.slot) runs[p.slot]++; });
    const baseMm = len / w * Math.PI * D, capMm = 2 * cap / w * Math.PI * D, tails = 2 * X.TAIL_MM;
    L.leg = passes[0].leg; L.runs = runs;
    L.threadMm = legsBy.map((v, s) => s === 0 ? baseMm * X.ALLOWANCE : (v + runs[s] * tails + (s === 3 ? capMm : 0)) * X.ALLOWANCE);
    L.turnsPerLeg = n; L.baseTurns = Math.round(len / w); L.capTurns = Math.round(cap / w);
    L.spools = Array.from({ length: K }, (_, i) => i); L.tieOffs = runs.reduce((a, b) => a + b, 0);   // each run of a colour is one continuous thread; underwrap and end bands are plain wraps
    const colours = new Set(passes.map(p => p.slot)).size;
    L.method = { kind: 'cross', label: spec.label + ' · ' + P + ' passes · ' + colours + ' thread colours', changes: 0 };
    L.evidence = X.evidence(spec);
    return L;
  };
  X.evidence = spec => spec && spec.tier === 'experimental' ? ({ tier: 'experimental', label: 'Experimental arrangement', bench: 'Not bench tested',
    verified: 'Geometry (thread paths, crossings, layering, measurements) is checked by automated tests.',
    documented: 'Built from the documented cross-wrap method: marks, up-and-back passes crossing on the marks, tape turn-arounds, outline threads, end bands.',
    experimental: (spec.note || '') + ' This arrangement is a Studio construction, not taken from a builder source, and has not been bench tested.' }) : ({ tier: 'documented', label: 'Documented technique', bench: 'Not bench tested',
    verified: 'Geometry (thread paths, crossings, layering, measurements) is checked by automated tests.',
    documented: 'Layout from builder-published descriptions: opposite lines, marks half a spacing apart, up-and-back passes crossing on the marks, tape turn-arounds, outline threads, end bands.',
    experimental: 'Default spacing, band widths, pass order, end-band width and thread allowances are engineering choices awaiting bench testing.' });

  // thread centreline in unrolled coordinates: [z, theta] pairs, in travel order (up legs run butt to tip, back legs run tip to butt)
  X.pathPoints = function (L, t, perTurn) {
    const k = perTurn || 8, pts = [], S = t.S || L.S, z0 = t.z0 || 0, dz = S / k, o = t.offset * (t.wv || L.wv);
    for (let z = 0; z <= L.lenAdj + 1e-9; z += dz) pts.push([z, t.fam === 'R' ? TAU * (z - z0 - o) / S : TAU * (z0 + o - z) / S]);
    if (t.leg === 'back') pts.reverse();
    return pts;
  };
  // Where an R thread and an L thread meet: theta_R = 2pi(z-uR)/S_R and theta_L = 2pi(uL-z)/S_L, equal modulo 2pi.
  X.crossings = function (L) {
    const out = [], Rs = L.threads.filter(t => t.fam === 'R'), Ls = L.threads.filter(t => t.fam === 'L'), u = t => (t.z0 || 0) + t.offset * (t.wv || L.wv);
    for (const a of Rs) for (const b of Ls) {
      const ia = 1 / a.S, ib = 1 / b.S, ua = u(a), ub = u(b), kmin = Math.floor(-(ua * ia + ub * ib)) - 1, kmax = Math.ceil(L.lenAdj * (ia + ib) - (ua * ia + ub * ib)) + 1;
      for (let k = kmin; k <= kmax; k++) {
        const z = (k + ua * ia + ub * ib) / (ia + ib); if (z < 0 || z > L.lenAdj) continue;
        out.push({ z, theta: mod(TAU * (z - ua) * ia, TAU), R: a.id, L: b.id, top: a.seq > b.seq ? a.id : b.id, visible: z >= L.cap && z < L.lenAdj - L.cap });
      }
    }
    return out;
  };
  X.thread = (L, id) => L.threads.find(t => t.id === id);

  // ---------- workshop steps (all numbers come from the layout above) ----------
  const f1 = v => (Math.round(v * 10) / 10).toString();
  X.steps = function (d, L) {
    const nm = s => T.thread(d.slots[s]).name, st = [], S = L.S, side = o => o > 0 ? 'tip side' : 'butt side', m1 = v => (v / 1000).toFixed(1) + ' m';
    const DOC = ['documented'], EXP = ['experimental'], GEO = ['geometry'];
    if (!d.measured) st.push({ kind: 'needsize', pass: -1, title: 'Enter your rod size', text: 'The spacing and marks come from your measured rod diameter.', evidence: GEO });
    st.push({ kind: 'spools', pass: -1, title: 'Get your threads ready', slots: L.spools.slice(), evidence: EXP,
      text: L.spools.map(s => nm(s) + ' about ' + m1(L.threadMm[s])).join(' · ') + '. Lengths include a ' + Math.round((X.ALLOWANCE - 1) * 100) + '% allowance and ' + X.TAIL_MM + ' mm tails; they are estimates.' });
    st.push({ kind: 'base', pass: 0, slots: [0], zEnd: L.lenAdj, evidence: DOC, title: 'Wrap the underwrap',
      text: 'Wrap ' + nm(0) + ' tightly over ' + f1(L.lenAdj) + ' mm of the blank (about ' + L.baseTurns + ' turns). Builders lay an underwrap in the background colour first.' });
    st.push({ kind: 'axes', pass: 0, evidence: DOC, title: 'Find the two centre lines',
      text: 'Wrap a strip of paper or tape once around the rod, mark where it meets itself and measure it flat: about ' + f1(L.C) + ' mm. Half of that, ' + f1(L.C / 2) + ' mm, is the opposite side. Draw a straight line A along the blank, then line C exactly opposite, for ' + f1(L.lenAdj) + ' mm from the start of the wrap.' });
    st.push({ kind: 'marks', pass: 0, evidence: DOC, needsMeasured: true, title: 'Mark the crossing points', marks: L.marks, spacing: S,
      text: L.spec.marksBoth ? 'Both lines carry marks every ' + f1(S / 2) + ' mm from the start (' + (2 * L.n + 1) + ' marks on each, 0 to ' + f1(L.lenAdj) + '). Two sets of crossings use them: the first set uses A at 0, ' + f1(S) + ', … and C at ' + f1(S / 2) + ', …; the second set uses C at 0, ' + f1(S) + ', … and A at ' + f1(S / 2) + ', …. A printable guide is available.' : 'Line A: mark every ' + f1(S) + ' mm from the start (' + (L.n + 1) + ' marks, 0 to ' + f1(L.lenAdj) + '). Line C: mark every ' + f1(S) + ' mm starting ' + f1(S / 2) + ' mm from the start (' + L.n + ' marks). The marks on A and C alternate, ' + f1(S / 2) + ' mm apart along the rod.' + (L.spec.unit > 1 ? ' The large diamonds use every ' + L.spec.unit + 'rd A mark (0, ' + f1(S * L.spec.unit) + ', …) and the C marks halfway between, so no extra marks are needed.' : '') + ' A printable guide is available.' });
    st.push({ kind: 'anchors', pass: 0, evidence: DOC, title: 'Set the turn-around tape',
      text: 'At each end, inside the first and last ' + L.cap + ' mm, fold single-sided tape sticky side out around the rod. The thread turns around it at each end, then the end bands cover it. Keep the tape level so threads don’t slip as they turn.' });
    const runStart = p => p.p === 1 || L.passes[p.p - 2].slot !== p.slot, runEnd = p => p.p === L.P || L.passes[p.p].slot !== p.slot, TURN = Math.PI;
    L.passes.forEach(p => {
      const c = nm(p.slot), up = p.o, bk = L.groups[p.g].lsign * p.o, tie = runStart(p), done = runEnd(p), grp = L.groups[p.g], newLattice = p.p > 1 && p.p === grp.first, turns = Math.round(p.turns);
      const v = X.passView(L, p.p), a0 = mod(v.start[1], TAU), line = Math.min(a0, TAU - a0) < 1e-6 ? 'A' : Math.abs(a0 - TURN) < 1e-6 ? 'C' : null, from = line ? line + ' ' + L.markLabel(line, 0) : null;
      const gapTxt = gp => 'Leave a gap of ' + gp + ' thread width' + (gp > 1 ? 's' : '') + ' (the underwrap shows), then ';
      const nbName = nb => nb ? (nb.slot === p.slot ? 'previous ' + nm(nb.slot) + ' thread' : nm(nb.slot) + ' band') : '',
        follow = (side, nb) => nb && nb.gap ? 'Gap of ' + nb.gap + ' thread' + (nb.gap > 1 ? 's' : '') + ', then follow the ' + side + '-side edge of the ' + nbName(nb) + '.' : 'Follow the ' + side + '-side edge of the ' + nbName(nb) + '.';
      const lattice = grp.mult > 1 ? 'large' : 'second';
      const lines = [];
      lines.push(tie ? 'Tie in ' + c + ' with 3 or 4 turns at the butt end, under the end-band area.' : 'Keep going with the same ' + c + ' thread.');
      lines.push('Up, butt to tip (about ' + turns + ' turns): lean it like “\\” on the side facing you, butt on your left. ' + (p.p === 1 ? 'Start at A 0. It reaches C 1 after half a turn, A 1 after another half, and so on every ' + f1(S / 2) + ' mm. It must cross each mark.'
        : newLattice ? 'Start at ' + from + '. ' + (grp.mult > 1 ? 'This is the large lattice: it makes one turn every ' + f1(grp.S) + ' mm, so it crosses only every ' + f1(grp.S / 2) + ' mm, using every third A mark (0, ' + f1(grp.S) + ', …) and the C marks halfway between.' : 'It crosses the marks of the second set, every ' + f1(S / 2) + ' mm, between the marks of the first set.')
        : (p.gap ? gapTxt(p.gap) + 'lay it against the ' : 'Lay it snug against the ') + side(up) + ' edge of the “\\” threads already on the rod.'));
      lines.push('Back, tip to butt: lean it like “/”. ' + (p.p === 1 ? 'It crosses the same marks, making an X at each one.' : newLattice ? 'It crosses the same marks, making an X at each one.' : (p.gap ? gapTxt(p.gap) + 'lay it against the ' : 'Lay it snug against the ') + side(bk) + ' edge of the “/” threads already there.') + ' The back thread lies over the up thread at every crossing.');
      if (p.p === 1 && L.spec === X.SPEC.chevronwrap) lines.push('Chevron rule: every new thread goes on the same side of the last one (here, toward the tip), so the crossings move along the rod instead of spreading around it. The up and back threads of a pass lie side by side.');
      lines.push('Keep turning the rod the same way throughout; only the feed direction reverses.' + (done ? ' This is the last ' + c + ' ' + (L.runs[p.slot] > 1 ? 'pass of this run' : 'pass') + ': tie off under the end-band area.' : ''));
      const legs = [
        { dir: 'up', arrow: '→', label: 'UP', sub: 'butt to tip', action: p.p === 1 ? 'Start at A 0. Cross every mark.' : newLattice ? 'Start at ' + from + '. Cross every mark of this ' + lattice + ' set.' : follow(v.sideUp, v.nbUp) },
        { dir: 'back', arrow: '←', label: 'BACK', sub: 'tip to butt', action: p.p === 1 || newLattice ? 'Same marks, over the up thread.' : follow(v.sideBack, v.nbBack) }];
      const chips = [p.p === 1 ? 'Start at A 0' : newLattice ? 'Start at ' + from : 'Start at the butt end', turns + ' turns each way', '≈ ' + (p.leg / 1000).toFixed(2) + ' m per leg'];
      if (p.p === 1) chips.push('Marks every ' + f1(S / 2) + ' mm'); if (newLattice) chips.push(grp.mult > 1 ? 'Large diamonds · every ' + f1(grp.S / 2) + ' mm' : 'Second set of crossings');
      const notes = []; if (tie) notes.push('Tie in ' + c + ': 3–4 turns at the butt end, under the end band.'); if (done) notes.push('Last ' + c + ' pass' + (L.runs[p.slot] > 1 ? ' of this run' : '') + ': tie off under the end band.');
      st.push({ kind: 'pass', pass: p.p, slot: p.slot, slots: [p.slot], offset: p.o, evidence: p.p === 1 ? DOC : EXP, lines,
        head: 'PASS ' + p.p + ' OF ' + L.P + ' — ' + c.toUpperCase(), legs, chips, notes, how: lines, howOpen: p.p === 1,
        title: 'Pass ' + p.p + ' of ' + L.P + ' · ' + c, text: lines.join(' ') });
    });
    st.push({ kind: 'caps', pass: L.P + 1, slots: [3], evidence: EXP, title: 'Wrap the end bands',
      text: 'Wrap about ' + L.capTurns + ' turns (' + L.cap + ' mm) of ' + nm(3) + ' over each end, covering the tape, the thread turns and the tie-offs. Pack the threads together with the side of a packing tool.' });
    st.push({ kind: 'finish', pass: L.P + 1, evidence: DOC, title: 'Finish', text: 'Check each X sits on its mark, pack any gaps, trim the tails and finish the wrap your usual way.' });
    return st;
  };

  // ---------- views derived from the thread list (no separate illustration data) ----------
  // Where the active pass starts, turns and ends, and which existing thread it lies against. All numbers come from pathPoints.
  X.passView = function (L, p) {
    const pr = L.passes[p - 1], g = L.groupOf(p), up = X.thread(L, 'P' + p + 'U'), bk = X.thread(L, 'P' + p + 'B'), pu = X.pathPoints(L, up), pb = X.pathPoints(L, bk);
    const nbr = (t, sgn) => pr.inward == null ? null : { offset: sgn * pr.inward, pass: g.passOf.get(pr.inward), slot: g.slotOf(pr.inward), side: t.offset > 0 ? 'tip' : 'butt', gap: pr.gap };
    return { pass: p, group: pr.g, up, back: bk, start: pu[0], turn: pu[pu.length - 1], end: pb[pb.length - 1], backStart: pb[0],
      nbUp: nbr(up, 1), nbBack: nbr(bk, g.lsign), sideUp: up.offset > 0 ? 'tip' : 'butt', sideBack: bk.offset > 0 ? 'tip' : 'butt' };
  };
  // Cross-section of the active pass's lattice along the rod at one angle: one cell per thread position, for the "\" (up) and "/" (back) families.
  // 'gap' cells are positions this design deliberately leaves empty.
  X.ribbon = function (L, p) {
    const g = L.groupOf(p), row = fam => { const out = [], a = fam === 'L' && g.lsign < 0 ? -g.hi : g.lo, b = fam === 'L' && g.lsign < 0 ? -g.lo : g.hi; for (let j = a; j <= b; j++) { const key = fam === 'R' ? j : g.lsign * j, pp = g.passOf.get(key); out.push(pp == null ? { offset: j, pass: null, slot: 0, state: 'gap' } : { offset: j, pass: pp, slot: g.slotOf(key), state: pp < p ? 'done' : pp === p ? 'active' : 'todo' }); } return out; };
    return { up: row('R'), back: row('L') };
  };
  X.ribbonSVG = function (d, L, p) {
    const rb = X.ribbon(L, p), hex = s => T.thread(d.slots[s]).hex, n = L.groupOf(p).hi - L.groupOf(p).lo + 1, x0 = 40, cw = (360 - x0 - 6) / n; let s = '<svg viewBox="0 0 360 62" role="img" aria-label="Where this thread sits in the band, butt side on the left, tip side on the right">';
    [['up', rb.up, 4, 'UP'], ['back', rb.back, 26, 'BACK']].forEach(([nm, cells, y, lab]) => {
      s += '<text x="2" y="' + (y + 13) + '" font-size="10.5" font-weight="700" fill="#ada99d">' + lab + '</text>';
      cells.forEach((c, i) => { const x = x0 + i * cw, a = c.state === 'active';
        s += '<rect data-fam="' + (nm === 'up' ? 'R' : 'L') + '" data-offset="' + c.offset + '" data-pass="' + c.pass + '" data-state="' + c.state + '" x="' + (x + 1).toFixed(1) + '" y="' + y + '" width="' + (cw - 2).toFixed(1) + '" height="18" rx="3" fill="' + (c.state === 'todo' ? 'none' : c.state === 'gap' ? hex(0) : hex(c.slot)) + '" opacity="' + (c.state === 'done' ? 0.5 : c.state === 'gap' ? 0.35 : 1) + '" stroke="' + (a ? '#ffffff' : c.state === 'gap' ? 'none' : '#3a4247') + '" stroke-width="' + (a ? 2.4 : 1) + '"' + (c.state === 'todo' ? ' stroke-dasharray="3 2"' : '') + '/>'; });
    });
    return s + '<text x="' + x0 + '" y="59" font-size="10" fill="#6f736d">◀ butt side</text><text x="354" y="59" font-size="10" fill="#6f736d" text-anchor="end">tip side ▶</text></svg>';
  };

  // ---------- unrolled diagram of the paths (the same threads the preview uses) ----------
  // Horizontal: along the rod, butt left. Vertical: once round the rod. A is the top/bottom edge, C the dashed middle line.
  X.diagramSVG = function (d, L, upTo, hl, opt) {
    opt = opt || {}; const big = !!opt.big, W = big ? 1000 : 360, H = big ? 250 : 136, ml = big ? 44 : 40, mr = big ? 12 : 10, mt = big ? 30 : 22, mb = big ? 18 : 14;
    const px0 = ml, px1 = W - mr, py0 = mt, py1 = H - mb, zx = z => px0 + z / L.lenAdj * (px1 - px0), ty = th => py0 + th / TAU * (py1 - py0), hex = s => T.thread(d.slots[s]).hex, fs = big ? 13 : 10.5;
    const f = v => v.toFixed(1);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Thread paths unrolled: rod length across with butt on the left, once around the rod down">';
    s += '<rect x="' + px0 + '" y="' + py0 + '" width="' + (px1 - px0) + '" height="' + (py1 - py0) + '" fill="#0a0c0e" stroke="#242a2d"/>';
    s += '<line x1="' + px0 + '" x2="' + px1 + '" y1="' + py0 + '" y2="' + py0 + '" stroke="#ddd6c9" stroke-width="1.6"/><line x1="' + px0 + '" x2="' + px1 + '" y1="' + py1 + '" y2="' + py1 + '" stroke="#ddd6c9" stroke-width="1.6"/>';
    s += '<line x1="' + px0 + '" x2="' + px1 + '" y1="' + f(ty(Math.PI)) + '" y2="' + f(ty(Math.PI)) + '" stroke="#ada99d" stroke-width="1.4" stroke-dasharray="5 4"/>';
    const tooth = (t, k) => { const o = t.z0 + t.offset * t.wv, z0 = o + k * t.S, z1 = z0 + t.S, ya = t.fam === 'R' ? 0 : TAU, yb = t.fam === 'R' ? TAU : 0, at = z => ya + (yb - ya) * (z - z0) / t.S, c0 = Math.max(0, z0), c1 = Math.min(L.lenAdj, z1); return c1 <= c0 ? null : [c0, at(c0), c1, at(c1)]; };
    const pathOf = t => { let p = ''; for (let k = -2; k <= Math.ceil(L.lenAdj / t.S) + 1; k++) { const g = tooth(t, k); if (g) p += 'M' + f(zx(g[0])) + ',' + f(ty(g[1])) + ' L' + f(zx(g[2])) + ',' + f(ty(g[3])) + ' '; } return p.trim(); };
    // completed passes: actual colours, subdued
    L.threads.filter(t => t.pass < hl).forEach(t => { s += '<path data-pass="' + t.pass + '" data-leg="' + t.leg + '" data-state="done" d="' + pathOf(t) + '" fill="none" stroke="' + hex(t.slot) + '" stroke-width="' + (big ? 1.6 : 1.1) + '" opacity="0.38"/>'; });
    // active pass: dark casing then colour, up first then back so the back thread is drawn over the up thread (the real layering)
    const act = L.threads.filter(t => t.pass === hl && t.pass <= upTo).sort((a, b) => a.seq - b.seq);
    act.forEach(t => { const dash = t.leg === 'back' ? ' stroke-dasharray="' + (big ? '12 6' : '7 4') + '"' : '';
      s += '<path data-pass="' + t.pass + '" data-leg="' + t.leg + '" data-state="active" d="' + pathOf(t) + '" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="' + (big ? 8 : 6) + '" stroke-linecap="round"/>';
      s += '<path data-pass="' + t.pass + '" data-leg="' + t.leg + '" data-state="active" d="' + pathOf(t) + '" fill="none" stroke="' + hex(t.slot) + '" stroke-width="2.6"' + dash + ' stroke-linecap="round"/>'; });
    // reference marks: A filled, C hollow
    L.marks.A.forEach((z, k) => { [0, TAU].forEach(th => { s += '<circle data-mark="A" data-z="' + z + '" cx="' + f(zx(z)) + '" cy="' + f(ty(th)) + '" r="' + (big ? 4 : 2.8) + '" fill="#ddd6c9"/>'; }); if (big) s += '<text x="' + f(zx(z)) + '" y="' + (py0 - 5) + '" font-size="11" fill="#ddd6c9" text-anchor="middle">' + L.markLabel('A', k) + '</text>'; });
    L.marks.C.forEach((z, k) => { s += '<circle data-mark="C" data-z="' + z + '" cx="' + f(zx(z)) + '" cy="' + f(ty(Math.PI)) + '" r="' + (big ? 4 : 2.8) + '" fill="#0a0c0e" stroke="#ada99d" stroke-width="1.5"/>'; if (big) s += '<text x="' + f(zx(z)) + '" y="' + (ty(Math.PI) - 7) + '" font-size="11" fill="#ada99d" text-anchor="middle">' + L.markLabel('C', k) + '</text>'; });
    if (act.length && hl >= 1) {
      const v = X.passView(L, hl), col = hex(v.up.slot), th0 = mod(v.start[1], TAU), halo = 'paint-order:stroke;stroke:#060708;stroke-width:3px;stroke-linejoin:round';
      // arrows along travel (up: butt to tip; back: tip to butt)
      [v.up, v.back].forEach(t => { const dirz = t.leg === 'up' ? 1 : -1; [0.25, 0.5, 0.75].forEach(fr => { const nt = Math.max(1, Math.round(L.lenAdj / t.S)), k = Math.max(0, Math.min(nt - 1, Math.floor(nt * fr))), g = tooth(t, k + Math.ceil(-(t.z0 + t.offset * t.wv) / t.S - 1e-9)); if (!g) return;
        const mx = (zx(g[0]) + zx(g[2])) / 2, my = (ty(g[1]) + ty(g[3])) / 2; let dx = zx(g[2]) - zx(g[0]), dy = ty(g[3]) - ty(g[1]); if (t.leg === 'back') { dx = -dx; dy = -dy; } const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, sz = big ? 8 : 6, nx = -uy, ny = ux;
        s += '<polygon data-role="arrow" data-leg="' + t.leg + '" data-dz="' + dirz + '" data-pass="' + hl + '" points="' + f(mx + ux * sz) + ',' + f(my + uy * sz) + ' ' + f(mx - ux * sz * 0.6 + nx * sz * 0.7) + ',' + f(my - uy * sz * 0.6 + ny * sz * 0.7) + ' ' + f(mx - ux * sz * 0.6 - nx * sz * 0.7) + ',' + f(my - uy * sz * 0.6 - ny * sz * 0.7) + '" fill="' + col + '" stroke="#060708" stroke-width="1.4"/>'; }); });
      // markers: START ring at the butt end, TURN diamond at the tip end (same angle: both come from the up thread's path points)
      const mk = (role, z, th, shape, label, anchor) => { const x = zx(z), y = ty(th), top = th < Math.PI, ly = top ? y + (big ? 20 : 17) : y - (big ? 11 : 9), r = big ? 7.5 : 6;
        let g = '<g data-role="' + role + '" data-z="' + z + '" data-theta="' + th + '">';
        g += shape === 'ring' ? '<path d="M' + f(x - r) + ',' + f(y) + ' a' + r + ',' + r + ' 0 1,0 ' + 2 * r + ',0 a' + r + ',' + r + ' 0 1,0 ' + -2 * r + ',0" fill="#060708" stroke="#fff" stroke-width="2.2"/>' : '<path d="M' + f(x) + ',' + f(y - r - 1) + ' L' + f(x + r + 1) + ',' + f(y) + ' L' + f(x) + ',' + f(y + r + 1) + ' L' + f(x - r - 1) + ',' + f(y) + ' Z" fill="#060708" stroke="#fff" stroke-width="2.2"/>';
        return g + '<text x="' + f(x + (anchor === 'end' ? -r - 3 : r + 3)) + '" y="' + f(ly) + '" font-size="' + (big ? 13 : 10.5) + '" font-weight="800" fill="#fff" text-anchor="' + anchor + '" style="' + halo + '">' + label + '</text></g>'; };
      s += mk('start', v.start[0], th0, 'ring', 'START', 'start') + mk('turn', v.turn[0], mod(v.turn[1], TAU), 'diamond', 'TURN', 'end');
    }
    // orientation and line labels
    s += '<text x="2" y="' + (py0 + 4) + '" font-size="' + fs + '" font-weight="800" fill="#ddd6c9">A</text><text x="2" y="' + (ty(Math.PI) + 4) + '" font-size="' + fs + '" font-weight="800" fill="#ada99d">C</text><text x="2" y="' + (py1 + 4) + '" font-size="' + fs + '" font-weight="800" fill="#ddd6c9">A</text>';
    s += '<text x="' + px0 + '" y="' + (big ? 14 : 12) + '" font-size="' + fs + '" font-weight="800" fill="#ddd6c9">◀ BUTT</text><text x="' + px1 + '" y="' + (big ? 14 : 12) + '" font-size="' + fs + '" font-weight="800" fill="#ddd6c9" text-anchor="end">TIP ▶</text>';
    return s + '</svg>';
  };

  // ---------- printable marking guide (real size, from the same marks) ----------
  X.templateHTML = function (d) {
    const L = T.layout(d); if (L.family !== 'cross') return '';
    const len = Math.min(L.lenAdj, 270), x1 = 14, x2 = 44, hx = T.thread(d.slots[1]).hex; let g = '';
    L.marks.A.filter(z => z <= len + 1e-9).forEach((z, k) => { g += '<line x1="' + (x1 - 4) + '" x2="' + (x1 + 4) + '" y1="' + z.toFixed(2) + '" y2="' + z.toFixed(2) + '" stroke="#000" stroke-width=".25"/><text x="' + (x1 - 6) + '" y="' + (z + 1).toFixed(2) + '" font-size="2.6" text-anchor="end">A ' + L.markLabel('A', k) + '</text>'; });
    L.marks.C.filter(z => z <= len + 1e-9).forEach((z, k) => { g += '<line x1="' + (x2 - 4) + '" x2="' + (x2 + 4) + '" y1="' + z.toFixed(2) + '" y2="' + z.toFixed(2) + '" stroke="#000" stroke-width=".25"/><text x="' + (x2 + 6) + '" y="' + (z + 1).toFixed(2) + '" font-size="2.6">C ' + L.markLabel('C', k) + '</text>'; });
    g += '<line x1="' + x1 + '" x2="' + x1 + '" y1="0" y2="' + len.toFixed(2) + '" stroke="#000" stroke-width=".25"/><line x1="' + x2 + '" x2="' + x2 + '" y1="0" y2="' + len.toFixed(2) + '" stroke="#000" stroke-width=".25"/>';
    return '<h3 style="font:600 12pt sans-serif;margin:0 0 4mm">Thread Design Studio · ' + (L.spec.guide || L.spec.label.toLowerCase()) + ' marking guide</h3><p style="font:9pt sans-serif;margin:0 0 6mm">Rod diameter ' + f1(d.diameterMm) + ' mm · circumference ' + f1(L.C) + ' mm (half ' + f1(L.C / 2) + ') · crossings every ' + f1(L.S) + ' mm · wrap length ' + f1(L.lenAdj) + ' mm. Print at 100% (no scaling). Line A on the left, line C on the right; distances are from the start of the wrap. The guide shows the first ' + f1(len) + ' mm.</p>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="70mm" height="' + (len + 6).toFixed(1) + 'mm" viewBox="-2 -3 70 ' + (len + 6).toFixed(1) + '" style="overflow:visible">' + g + '</svg>';
  };
})(typeof self !== 'undefined' ? self : this);
