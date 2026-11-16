/* K-Labs Thread Design Studio: decorative weaving construction engine.
   Separate from the cross-wrap engine (crosswrap.js) and from the colour-change grid. Nothing here is cross-wrapping.

   PHYSICAL MODEL (warp and weft)
   - WARP: M lines lie lengthwise along the blank, side by side round the circumference. Each line is g threads laid flat
     together and handled as one. Line j owns the angle band [j, j+1) * 2pi/M. Line 0 starts at the seam (theta = 0);
     line numbers increase in the direction the weft travels.
   - WEFT: one continuous thread wound round the blank as a helix of pitch w (one thread width per turn), exactly like a plain wrap.
     On each turn it passes OVER some warp lines (weft shows, the warp is covered) and UNDER the others (the warp is
     lifted clear and shows on top). Which lines go under on a row is the "left list" of the row (builder glossary:
     "each step indicates which threads are lifted and not wrapped over per revolution").
   - A ROW is tau turns that use the same left list (tau = round(cell width / w), which keeps cells square).
     "Do" in the glossary = repeat the previous step, so the tau turns of a row are one step.
   - The wrapped length is: start band (nA turns over every line), whole pattern repeats, finish band. The start band locks
     the warp ends; the warp tails are free until the finish band.
   - Everything the preview draws (slotAt / coverAt) and everything the workshop says (steps) is read from the same row plan
     L.unit (one pattern repeat of left lists) and the same turn numbering t = floor(z/w - theta/2pi).

   EVIDENCE: the warp/weft/left-list principle is documented (builder glossary). The two drafts use standard weaving drafts
   (2/2 twill, pointed). Line counts, band lengths, thread quantities and tension advice are engineering estimates.
   Not bench tested. See METHOD.md. */
(function (root) {
  'use strict';
  const T = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.THREAD;
  const TAU = Math.PI * 2, W = {}; T.weave = W;
  const mod = (a, b) => ((a % b) + b) % b, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ramp = (n, H) => { const m = mod(n, 2 * H); return m < H ? m : 2 * H - 1 - m; };   // 0..H-1 then back H-1..0: the diagonal turns about the edge between two lines

  // A design is a draft: P lines (period around), Q rows (period along), which warp colour each line has, and the left list per row.
  W.SPEC = {
    herringbone: { label: 'Woven herringbone', guide: 'herringbone weave', P: 12, Q: 4, slots: 2,
      warpSlot: () => 0, lift: (r, j) => mod(ramp(j, 6) + r, 4) < 2,
      what: '2/2 twill whose diagonal turns back every 6 lines, so the ribs zig-zag along the rod' },
    wovendiamond: { label: 'Woven diamonds', guide: 'woven diamond', P: 16, Q: 16, slots: 3,
      warpSlot: j => (mod(j, 16) === 7 || mod(j, 16) === 8) ? 2 : 0,
      lift: (r, j) => Math.abs(2 * mod(j, 16) - 15) + Math.abs(2 * mod(r, 16) - 15) <= 13,
      what: 'a diamond motif drawn by lifting the warp, with an accent colour in the two centre lines' }
  };
  W.isWeave = id => !!W.SPEC[id];

  function ranges(a) { const out = []; a.forEach(v => { const l = out[out.length - 1]; if (l && l[1] === v - 1) l[1] = v; else out.push([v, v]); }); return out; }
  const fmtR = r => r[0] === r[1] ? '' + r[0] : r[0] + '–' + r[1];
  function fmtRanges(rs, max) { max = max || 8; const s = rs.slice(0, max).map(fmtR).join(', '); return rs.length > max ? s + ' …' : s; }
  function period(row) { const M = row.length; for (let p = 1; p < M; p++) { if (M % p) continue; let ok = true; for (let j = p; j < M && ok; j++) if (row[j] !== row[j - p]) ok = false; if (ok) return p; } return M; }
  const mm = v => (Math.round(v * 10) / 10).toString();
  const metres = v => (Math.round(v / 100) / 10).toFixed(1);

  W.layout = function (d, L) {
    const C = L.C, w = L.w, text = d.pattern === 'wovenletters', custom = d.pattern === 'wovencustom', minCell = Math.max(2 * w, 0.5);
    const turns = Math.floor(d.lengthMm / w), nA = Math.max(6, Math.round(4 / w));
    let spec, P, Q, M, k = 1, g, tau, cellW;
    if (text || custom) {
      // lettering and custom designs: the 5x7 bitmap letters become a left list. Pixel x runs along the rod, pixel y round it; each pixel is s x s cells.
      const bm = text ? T.textBitmap(d.text) : T.art.bitmap(d.art), bh = bm.h, M0 = Math.max(10, Math.min(Math.round(C / (3 * w)), Math.floor(C / minCell))), smax = Math.max(1, Math.floor((M0 - 3) / bh)), s = clamp(d.size == null ? Math.min(2, smax) : d.size, 1, smax);
      const period = bh * s + 3, copies = Math.max(1, Math.floor(M0 / period)); M = copies > 1 ? copies * period : Math.max(M0, period); cellW = C / M; g = Math.max(1, Math.round(cellW / w)); tau = g;
      const off = copies > 1 ? 1 : Math.floor((M - bh * s) / 2), textRows = bm.w * s, avail = Math.max(1, Math.floor((turns - 2 * nA) / tau)), need = textRows + 4 * s;
      Q = Math.max(avail, need); const pre = Math.floor((Q - textRows) / 2); P = M;
      const lift = (r, j) => { const x = Math.floor((r - pre) / s); if (x < 0 || x >= bm.w) return false; const y = (copies > 1 ? j % period : j) - off; return y >= 0 && y < bh * s && !!bm.px(x, Math.floor(y / s)); };
      spec = { label: text ? 'Woven lettering' : 'Custom woven design', guide: text ? 'woven lettering' : 'custom woven design', P, Q, slots: 2, warpSlot: () => 0, lift };
      const spans = []; let x = 0; if (text) Array.from(T.cleanText(d.text).replace(/ +$/, '')).forEach(ch => { const wd = T.FONT[ch][0].length; spans.push({ ch, x0: x, x1: x + wd - 1 }); x += wd + 1; });
      L.text = { bm, s, copies, period, off, pre, textRows, avail, spans, pad: 2 * s, custom, bh };
      L.size = s; L.larger = s < smax ? s + 1 : null; L.smaller = s > 1 ? s - 1 : null; L.sizeLabel = text ? 'Letters ' + (bh * s * cellW).toFixed(1) + ' mm tall' : 'Design ' + (bm.w * s * tau * w).toFixed(1) + ' × ' + (bh * s * cellW).toFixed(1) + ' mm';
      L.viewHint = { z0: Math.max(0, (nA + pre * tau) * w - 3), rot: (off + bh * s / 2) / M * TAU };
      if (Q > avail) L.warnings.push({ id: 'long', level: 'warn', text: 'This ' + (text ? 'message' : 'design') + ' needs about ' + Math.ceil((2 * nA + Q * tau) * w) + ' mm of wrap and the wrapped length is ' + d.lengthMm + ' mm. Increase the wrapped length in More options, choose a smaller ' + (text ? 'letter size or shorten the message' : 'design scale or grid') + '.', fix: 'more' });
      if (!bm.text) L.warnings.push({ id: 'empty', level: 'warn', text: text ? 'Type a name or message to see it on the rod.' : 'Draw on the grid or upload artwork to see it on the rod.' });
      if (custom && d.art && d.art.report) (d.art.report.warn || []).forEach(w => L.warnings.push(w));
      const dr = text ? T.droppedChars(d.text) : []; if (dr.length) L.warnings.push({ id: 'chars', level: 'info', text: 'Left out characters the lettering can’t make: ' + dr.join(' ') });
    } else {
      spec = W.SPEC[d.pattern]; P = spec.P; Q = spec.Q;
      const kmax = Math.max(1, Math.floor(C / (P * minCell))), kDef = clamp(Math.round(C / (3 * w) / P), 1, kmax); k = d.size == null ? kDef : clamp(d.size, 1, kmax);
      M = P * k; cellW = C / M; g = Math.max(1, Math.round(cellW / w)); tau = g;
      L.size = k; L.larger = k > 1 ? k - 1 : null; L.smaller = k < kmax ? k + 1 : null; L.sizeLabel = 'Repeat ' + mm(P * cellW) + ' mm around · ' + M + ' lines';
    }
    L.spec = spec; L.M = M; L.g = g; L.tau = tau; L.cellW = cellW; L.rowMm = tau * w; L.P = P; L.Q = Q; L.fit = g * w / cellW;
    L.viewWin = 3.4;
    // the row plan: one pattern repeat of left lists. lifted[j] = true means the weft goes UNDER line j (the warp shows).
    L.unit = []; for (let r = 0; r < Q; r++) { const row = []; for (let j = 0; j < M; j++) row.push(!!spec.lift(r, j)); L.unit.push(row); }
    L.liftAt = (r, j) => L.unit[mod(r, Q)][mod(j, M)];
    L.warpAt = j => spec.warpSlot(mod(j, M));
    L.weftSlot = 1;
    // lengths in turns
    const units = text ? 1 : Math.max(1, Math.floor((turns - 2 * nA) / tau / Q)), R = units * Q, Tt = 2 * nA + R * tau;
    L.nA = nA; L.units = units; L.rows = R; L.turnsTotal = Tt; L.lenAdj = Tt * w; L.turns = Tt;
    if (!text && !custom && Tt * w > d.lengthMm + 1e-9) L.warnings.push({ id: 'long', level: 'warn', text: 'One full pattern repeat needs about ' + Math.ceil(Tt * w) + ' mm. Increase the wrapped length in More options, or make the pattern smaller.', fix: 'more' });
    if (cellW < minCell - 1e-9) L.warnings.push({ id: 'fine', level: 'warn', text: 'Each warp line would be only ' + cellW.toFixed(2) + ' mm wide. Use a larger rod size, a finer thread or a larger pattern.' });
    if (L.fit < 0.8 || L.fit > 1.25) L.warnings.push({ id: 'fit', level: 'info', text: 'Threads per line (' + g + ') fill ' + Math.round(L.fit * 100) + '% of each line, so expect ' + (L.fit < 1 ? 'small gaps between lines' : 'slight crowding') + '. A different thread size fits better.' });
    // row groups: consecutive identical left lists are one step
    L.groups = []; for (let r = 0; r < Q; r++) { const key = L.unit[r].join(''), l = L.groups[L.groups.length - 1]; if (l && l.key === key) { l.to = r; } else L.groups.push({ key, from: r, to: r }); }
    L.groups.forEach((gp, i) => { gp.stage = 3 + i; });
    L.stageWarp = 1; L.stageStart = 2; L.repeatStage = units > 1 ? 3 + L.groups.length : null; L.finishStage = units > 1 ? 4 + L.groups.length : 3 + L.groups.length;
    L.rowStage = []; L.groups.forEach(gp => { for (let r = gp.from; r <= gp.to; r++) L.rowStage[r] = gp.stage; });
    L.stageOfTurn = t => { if (t < nA) return 2; if (t >= nA + R * tau) return L.finishStage; const r = Math.floor((t - nA) / tau); return r < Q ? L.rowStage[r] : L.repeatStage; };
    // floats: longest warp float (lifted run along the rod) and longest weft-over run, in mm
    let wf = 0; for (let j = 0; j < M; j++) { let run = 0, best = 0; for (let r = 0; r < 2 * Q; r++) { if (L.liftAt(r, j)) { run++; best = Math.max(best, run); } else run = 0; } wf = Math.max(wf, best >= 2 * Q ? Infinity : best); }
    L.warpFloatMm = wf * L.rowMm;
    if (L.warpFloatMm > 12) L.warnings.push({ id: 'float', level: 'warn', text: 'Some warp lines float loose for ' + mm(L.warpFloatMm) + ' mm. Expect them to need coaxing flat.' });
    // geometry
    const locate = (z, th) => { if (z < 0) return null; th = mod(th, TAU); const t = Math.floor(z / w - th / TAU), j = Math.min(M - 1, Math.floor(th / TAU * M)); return { t, j }; };
    L.locate = locate;
    L.visibleAt = (t, j) => { if (t < nA || t >= nA + R * tau) return 1; return L.liftAt(Math.floor((t - nA) / tau), j) ? L.warpAt(j) : 1; };   // t, j -> slot actually on top
    L.slotAt = (z, th) => { const c = locate(z, th); if (!c) return -1; if (c.t < 0) return z < Tt * w + w ? L.warpAt(c.j) : -1; if (c.t >= Tt) return z < Tt * w + w ? L.warpAt(c.j) : -1; return L.visibleAt(c.t, c.j); };
    L.coverAt = (z, th, P0) => {
      const c = locate(z, th); if (!c) return { slot: -1 };
      if (c.t >= Tt && z >= Tt * w + w) return { slot: -1 };
      if (P0 === 1) return { slot: L.warpAt(c.j), pass: 1 };
      if (c.t < 0 || c.t >= Tt) return { slot: L.warpAt(c.j), pass: 0 };
      const s = L.stageOfTurn(c.t);
      if (P0 != null && s > P0) return { slot: L.warpAt(c.j), pass: 0 };
      return { slot: L.visibleAt(c.t, c.j), pass: s };
    };
    L.shadeAt = (z, th) => {
      const c = locate(z, th); if (!c) return 1; const thn = mod(th, TAU);
      const top = (c.t < 0 || c.t >= Tt) ? L.warpAt(c.j) : L.visibleAt(c.t, c.j);
      if (top === 1) { const f = z / w - thn / TAU; return 0.86 + 0.14 * Math.pow(Math.sin(Math.PI * (f - Math.floor(f))), 0.6); }
      const fj = thn / TAU * M; const edge = fj - Math.floor(fj), ft = fj * g; return (0.78 + 0.22 * Math.pow(Math.sin(Math.PI * edge), 0.45)) * (0.97 + 0.03 * Math.sin(Math.PI * (ft - Math.floor(ft))));
    };
    L.zOfTurn = t => t * w;
    // quantities (engineering estimates: 20 mm tail at each end, 10% for the weft going over and under, 15% reserve)
    const lines = {}; for (let j = 0; j < M; j++) { const s = L.warpAt(j); lines[s] = (lines[s] || 0) + 1; }
    const eachMm = L.lenAdj + 40;
    L.warpQty = Object.keys(lines).map(s => ({ slot: +s, lines: lines[s], threads: lines[s] * g, eachMm, totalMm: lines[s] * g * eachMm })).sort((a, b) => a.slot - b.slot);
    const weftMm = Tt * Math.hypot(C, w) * 1.1 + 200;
    L.weftQty = { slot: 1, turns: Tt, totalMm: weftMm, orderMm: Math.ceil(weftMm * 1.15 / 500) * 500 };
    L.threadsTotal = M * g;
    L.spools = [...new Set(L.warpQty.map(q => q.slot).concat([1]))].sort();
    L.method = { kind: 'weave', label: 'Woven · ' + M + ' warp lines × ' + g + ' threads · ' + R + ' rows', changes: 0 };
    L.evidence = { tier: 'weave', label: 'Warp-and-weft weave · principle documented, quantities estimated', bench: 'Not bench tested' };
    L.effort = Tt < 400 ? 'Moderate job' : Tt < 900 ? 'Long job' : 'Very long job';
    L.slotNames = (text ? ['Lettering', 'Background'] : custom ? ['Design', 'Background'] : ['Warp', 'Weft', 'Warp accent']).slice(0, spec.slots);
    return L;
  };

  // ---------- workshop steps ----------
  function runsOfColour(L, d) {       // colours of the first P lines as runs: "0–4 Navy, 5–6 Red, 7–11 Navy"
    const out = []; for (let j = 0; j < L.P; j++) { const s = L.warpAt(j), l = out[out.length - 1]; if (l && l.s === s) l.to = j; else out.push({ s, from: j, to: j }); }
    return out.map(r => (r.from === r.to ? r.from : r.from + '–' + r.to) + ' ' + T.thread(d.slots[r.s]).name);
  }
  W.rowText = function (L, r) {      // how one left list reads
    const row = L.unit[r], under = []; row.forEach((v, j) => { if (v) under.push(j); });
    if (!under.length) return { under, over: row.map((_, j) => j), p: L.M, text: 'Plain wrap: go over every line. Nothing is lifted on this row.', list: 'none' };
    const p = period(row), rs = ranges(under.filter(j => j < p));
    const over = [], uset = new Set(under); for (let j = 0; j < L.M; j++) if (!uset.has(j)) over.push(j);
    return { under, over, p, text: p < L.M ? 'Every ' + p + ' lines, go under ' + fmtRanges(rs) + ' and over the rest. Repeat ' + (L.M / p) + ' times round.' : 'Go under lines ' + fmtRanges(ranges(under), 10) + ' and over all the others.', list: fmtRanges(ranges(under), 40) };
  };
  W.letterInfo = function (L, from, to) {     // which part of the message these rows make
    const t = L.text; if (!t) return null; if (t.custom) { const a = Math.floor((from - t.pre) / t.s), b = Math.floor((to - t.pre) / t.s); if (b < 0 || a >= t.bm.w) return { chip: 'plain wrap', text: 'Plain wrap, no design on these rows: the weft goes over every line.' }; const c0 = Math.max(a, 0) + 1, c1 = Math.min(b, t.bm.w - 1) + 1; return { chip: 'column ' + (c0 === c1 ? c0 : c0 + '–' + c1) + ' of ' + t.bm.w, text: 'Design column ' + (c0 === c1 ? c0 : c0 + '–' + c1) + ' of ' + t.bm.w + '. Lifted lines show the design colour.' }; }
    const x0 = Math.floor((from - t.pre) / t.s), x1 = Math.floor((to - t.pre) / t.s);
    if (x1 < 0 || x0 >= t.bm.w) return { chip: 'plain wrap', text: 'Plain wrap, no lettering on these rows: the weft goes over every line.' };
    const hit = t.spans.filter(p => p.x1 >= Math.max(0, x0) && p.x0 <= Math.min(t.bm.w - 1, x1)), real = hit.filter(p => p.ch !== ' ');
    if (!real.length) return { chip: 'gap', text: 'Space between letters: plain wrap, the weft goes over every line.' };
    const p = real[0], c0 = Math.max(x0, p.x0) - p.x0 + 1, c1 = Math.min(x1, p.x1) - p.x0 + 1, wd = p.x1 - p.x0 + 1;
    return { chip: 'letter ' + real.map(q => q.ch).join(' '), text: 'Lettering: ' + (real.length > 1 ? 'letters ' + real.map(q => '“' + q.ch + '”').join(', ') : 'letter “' + p.ch + '”, column ' + (c0 === c1 ? c0 : c0 + '–' + c1) + ' of ' + wd) + '. Lifted lines show the lettering colour.' };
  };
  W.steps = function (d, L) {
    const nm = s => T.thread(d.slots[s]).name, st = [], M = L.M, w = L.w, tau = L.tau, nA = L.nA, spec = L.spec, wn = nm(1);
    const warpNames = [...new Set(L.warpQty.map(q => nm(q.slot)))];
    const spoolLines = L.warpQty.map(q => nm(q.slot) + ' warp: ' + q.lines + ' lines of ' + L.g + ' threads, each ' + Math.ceil(q.eachMm) + ' mm (' + metres(q.totalMm) + ' m in all)');
    spoolLines.push(wn + ' weft: one continuous length, about ' + metres(L.weftQty.totalMm) + ' m for ' + L.turnsTotal + ' turns. Have ' + metres(L.weftQty.orderMm) + ' m ready.');
    spoolLines.push('Cut the warp lengths first and keep them in order. Put the weft on a bobbin that feeds freely. Amounts are estimates with a reserve.');
    if (!d.measured) st.push({ kind: 'needsize', title: 'Enter your rod size', text: 'Your design needs your measured rod diameter before we can work out the lines.' });
    st.push({ kind: 'spools', title: 'Get your threads ready', lines: spoolLines, evidence: ['geometry'], slots: L.spools.slice() });
    st.push({ kind: 'marks', title: 'Mark the lines', evidence: ['geometry'], lines: ['Cut a paper strip that just wraps once around the rod (' + L.C.toFixed(1) + ' mm). Fold or mark it into ' + M + ' equal parts (' + L.cellW.toFixed(2) + ' mm each), then mark ' + M + ' points around the rod at the start of the wrap.',
      'Number the marks 0 to ' + (M - 1) + ' in the direction the weft will travel. Mark 0 is the seam, where every row starts.', 'The printed guide shows the marks in their warp colours.'] });
    // WARP
    const colRuns = runsOfColour(L, d), wArrs = ['Lines ' + colRuns.join(', ') + (M > L.P ? '. Repeat this set ' + (M / L.P) + ' times round.' : '.')];
    st.push({ kind: 'warp', stage: 1, title: 'Lay the warp lines', head: 'WARP LINES — ' + warpNames.join(' and '), slot: L.warpAt(0), zc: 0, evidence: ['documented'],
      legs: [{ dir: 'wv', arrow: '●', label: 'START', action: 'Beside mark 0, at the start of the wrap. Leave a 20 mm tail hanging off the start end.' },
        { dir: 'wv', arrow: '→', label: 'LAY', action: 'Lay ' + L.g + ' threads flat side by side for each line, straight along the blank to the far end, in order 0 to ' + (M - 1) + '.' },
        { dir: 'wv', arrow: '≡', label: 'COLOURS', action: wArrs[0] }],
      chips: [M + ' lines', L.threadsTotal + ' threads', L.lenAdj.toFixed(0) + ' mm + tails'],
      notes: ['Nothing is wrapped yet. These lines just lie along the blank.'],
      how: ['Tape the tails flat at the start end. Clip or tape the far ends so every line stays straight and in order.', 'Lines should touch but not overlap. The weft will hold them in place.', 'Check the numbering against your marks before you wrap anything.'], howOpen: true,
      next: 'Next: lock the warp in place with the start band.' });
    st.push({ kind: 'wstart', stage: 2, title: 'Start band', head: 'START BAND — ' + wn + ' weft', slot: 1, zc: nA * w / 2, evidence: ['documented'],
      legs: [{ dir: 'wv', arrow: '●', label: 'START', action: 'At mark 0, at the very start of the wrap, over the warp lines and the tails.' },
        { dir: 'wv', arrow: '→', label: 'GO', action: 'Wrap ' + nA + ' tight turns round the blank, OVER every line. Go in the numbering direction.' },
        { dir: 'wv', arrow: '↻', label: 'END', action: 'Finish at mark 0, ready for row 1. Keep the thread on its bobbin.' }],
      chips: [nA + ' turns', mm(nA * w) + ' mm'],
      notes: ['This band covers every line, so only ' + wn + ' shows here. It locks the warp ends.'],
      how: ['Tie in the weft the way you normally start a wrap: lay the tail along the blank and wrap over it.', 'Keep the turns touching and the warp lines in order.', 'Trim the start tails close to the band once it is tight.'],
      next: 'Next: row 1, ' + W.rowText(L, 0).text.toLowerCase().slice(0, 90) });
    // ROWS
    const first = nA, rowRange = (a, b) => a === b ? 'ROW ' + (a + 1) : 'ROWS ' + (a + 1) + '–' + (b + 1);
    L.groups.forEach((gp, gi) => {
      const li = W.letterInfo(L, gp.from, gp.to), rt = W.rowText(L, gp.from), n = gp.to - gp.from + 1, turnA = nA + gp.from * tau + 1, turnB = nA + (gp.to + 1) * tau, prevDone = gp.from === 0 ? 'the start band' : 'row ' + gp.from;
      const nextG = L.groups[gi + 1], nextTxt = nextG ? 'Next: ' + rowRange(nextG.from, nextG.to).toLowerCase() + '. ' + W.rowText(L, nextG.from).text.split('.')[0] + '.' : (L.units > 1 ? 'Next: repeat rows 1–' + L.Q + ' ' + (L.units - 1) + ' more time' + (L.units > 2 ? 's' : '') + '.' : 'Next: the finish band.');
      st.push({ kind: 'wrow', stage: gp.stage, title: rowRange(gp.from, gp.to) + ' of ' + L.Q, head: rowRange(gp.from, gp.to) + ' OF ' + L.Q + ' — ' + wn + ' weft', slot: 1, rowFrom: gp.from, rowTo: gp.to, rows: n, turns: n * tau, turnFrom: turnA, turnTo: turnB,
        zc: (nA + (gp.from + gp.to + 1) / 2 * tau) * w, evidence: ['documented'], under: rt.under, over: rt.over,
        legs: [{ dir: 'wv', arrow: '●', label: 'START', action: 'At mark 0, against ' + prevDone + '. The weft is already there from the last turn.' },
          { dir: 'wv', arrow: '→', label: 'GO', action: rt.text },
          { dir: 'wv', arrow: '↻', label: 'TURNS', action: n * tau + ' turns in all, same lifts every turn. Each turn sits snug against the last.' }],
        chips: [rt.under.length + ' of ' + M + ' lines under', turnA === turnB ? 'turn ' + turnA : 'turns ' + turnA + '–' + turnB].concat(li ? [li.chip] : []),
        notes: (li ? [li.text] : []).concat(['Under: the warp line stays on top. Over: the weft covers it. Lines to lift: ' + rt.list + '.']),
        how: ['Lift the lines to go under clear of the blank with a fine pick or a needle, pass the weft through beneath them, then let them drop.', 'Take the weft over every other line and bring it back to mark 0. It should arrive one thread width further along.', 'Repeat for each of the ' + n * tau + ' turns, lifting the same lines each time, and push each turn snug against the last.', 'Keep the weft tension even so the rows stay straight.'], howOpen: gi === 0,
        next: nextTxt });
    });
    if (L.units > 1) {
      const more = L.units - 1, rowsMore = more * L.Q;
      st.push({ kind: 'wrepeat', stage: L.repeatStage, title: 'Repeat the pattern', head: 'REPEAT ROWS 1–' + L.Q + ' — ' + wn + ' weft', slot: 1, zc: (nA + (L.Q + rowsMore / 2) * tau) * w, evidence: ['documented'], units: more,
        legs: [{ dir: 'wv', arrow: '●', label: 'START', action: 'At mark 0, against row ' + L.Q + '.' },
          { dir: 'wv', arrow: '→', label: 'GO', action: 'Weave rows 1 to ' + L.Q + ' again, in the same order, with the same lifts (see the chart).' },
          { dir: 'wv', arrow: '↻', label: 'REPEAT', action: more + ' more time' + (more > 1 ? 's' : '') + ': ' + rowsMore + ' rows, ' + rowsMore * tau + ' turns.' }],
        chips: [more + ' more repeat' + (more > 1 ? 's' : ''), rowsMore * tau + ' turns', mm(rowsMore * L.rowMm) + ' mm'],
        notes: ['Tick off each repeat as you finish it. The pattern comes out the same every time.'],
        how: ['Every repeat starts at row 1 at mark 0. If you lose your place, count the rows back to the last full repeat.', 'Check the pattern against the preview after each repeat.'], howOpen: true,
        next: 'Next: the finish band.' });
    }
    const zEnd = (L.turnsTotal - nA / 2) * w;
    st.push({ kind: 'wfinish', stage: L.finishStage, title: 'Finish band', head: 'FINISH BAND — ' + wn + ' weft', slot: 1, zc: zEnd, evidence: ['documented'],
      legs: [{ dir: 'wv', arrow: '●', label: 'START', action: 'At mark 0, against the last row.' },
        { dir: 'wv', arrow: '→', label: 'GO', action: 'Wrap ' + nA + ' tight turns OVER every line. This locks the far ends.' },
        { dir: 'wv', arrow: '✓', label: 'THEN', action: 'Tie off the weft. Trim the warp tails close to the band.' }],
      chips: [nA + ' turns', mm(nA * w) + ' mm'],
      notes: ['Hold the warp lines straight and in order while you wrap this band.'],
      how: ['Remove the far-end clips as you reach them, keeping the lines in order.', 'Tie off the weft the way you normally finish a wrap.', 'Trim the warp tails and weft tail, then finish the wrap your usual way.'], howOpen: true });
    st.push({ kind: 'finish', title: 'Finish', text: 'Tie off, trim the tails and finish the wrap your usual way. Compare with the preview, and note anything to adjust for next time. Not bench tested: expect to refine line counts and band lengths.', zEnd: L.lenAdj });
    return st;
  };

  // ---------- diagrams ----------
  const hex = (d, s) => T.thread(d.slots[s]).hex;
  function ring(d, L, st, big) {
    const M = L.M, cx = 110, cy = 110, ro = 84, ri = 56, step = Math.max(1, Math.ceil(M / 16)); let g = '';
    for (let j = 0; j < M; j++) {
      const a0 = -Math.PI / 2 + j / M * TAU, a1 = -Math.PI / 2 + (j + 1) / M * TAU, p = (r, a) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2);
      g += '<path data-j="' + j + '" data-slot="' + L.warpAt(j) + '" d="M' + p(ro, a0) + 'A' + ro + ' ' + ro + ' 0 0 1 ' + p(ro, a1) + 'L' + p(ri, a1) + 'A' + ri + ' ' + ri + ' 0 0 0 ' + p(ri, a0) + 'Z" fill="' + hex(d, L.warpAt(j)) + '" stroke="#000" stroke-opacity=".5" stroke-width=".6"/>';
      if (j % step === 0) { const am = (a0 + a1) / 2; g += '<text x="' + (cx + (ro + 11) * Math.cos(am)).toFixed(1) + '" y="' + (cy + (ro + 11) * Math.sin(am) + 3).toFixed(1) + '" font-size="9" text-anchor="middle" fill="#cfd2d6">' + j + '</text>'; }
    }
    if (st.kind === 'wstart' || st.kind === 'wfinish') g += '<circle data-weft="1" cx="' + cx + '" cy="' + cy + '" r="' + ((ro + ri) / 2) + '" fill="none" stroke="' + hex(d, 1) + '" stroke-width="' + (ro - ri + 6) + '" opacity=".92"/>';
    g += '<circle cx="' + cx + '" cy="' + (cy - ro - 2) + '" r="5" fill="none" stroke="#fff" stroke-width="2"/>';
    g += '<text x="' + cx + '" y="' + (cy - 4) + '" font-size="10" text-anchor="middle" fill="#cfd2d6">' + (st.kind === 'warp' ? 'Warp lines' : 'Weft over all') + '</text><text x="' + cx + '" y="' + (cy + 10) + '" font-size="9" text-anchor="middle" fill="#9aa0a6">seen from the start end</text><text x="' + cx + '" y="' + (cy + 22) + '" font-size="9" text-anchor="middle" fill="#9aa0a6">0 = seam, numbers go ↻</text>';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="wring" data-kind="' + st.kind + '" viewBox="0 0 220 220" style="' + (big ? 'width:420px;max-width:none' : 'width:100%;max-width:300px;display:block;margin:0 auto') + '" role="img" aria-label="Warp lines seen from the start end">' + g + '</svg>';
  }
  function chart(d, L, st, big) {
    const M = L.M, Q = L.Q, c = big ? 18 : 10, lm = 16, tm = 12, Wd = lm + M * c + 4, every = M > 36 ? 4 : M > 20 ? 2 : 1;
    const full = st.kind === 'wrepeat', a0 = full ? 0 : st.rowFrom, a1 = full ? Q - 1 : Math.min(st.rowTo, st.rowFrom + 5), act = [a0, a1];
    const r0 = L.text ? Math.max(0, a0 - 3) : 0, r1 = L.text ? Math.min(Q - 1, a1 + 3) : Q - 1, nr = r1 - r0 + 1; let g = '';
    for (let j = 0; j < M; j += every) g += '<text x="' + (lm + (j + 0.5) * c).toFixed(1) + '" y="' + (tm - 3) + '" font-size="' + (big ? 9 : 6.5) + '" text-anchor="middle" fill="#9aa0a6">' + j + '</text>';
    for (let r = r0; r <= r1; r++) {
      const state = full ? 'active' : r < st.rowFrom ? 'done' : r <= st.rowTo ? 'active' : 'todo', op = state === 'done' ? .5 : state === 'todo' ? .28 : 1, y = tm + (r - r0) * c;
      g += '<text x="' + (lm - 4) + '" y="' + (y + 0.65 * c).toFixed(1) + '" font-size="' + (big ? 9 : 6.5) + '" text-anchor="end" fill="#9aa0a6">' + (r + 1) + '</text>';
      for (let j = 0; j < M; j++) g += '<rect data-r="' + r + '" data-j="' + j + '" data-state="' + state + '" data-lift="' + (L.unit[r][j] ? 1 : 0) + '" data-slot="' + (L.unit[r][j] ? L.warpAt(j) : 1) + '" x="' + (lm + j * c) + '" y="' + y + '" width="' + (c - 0.8) + '" height="' + (c - 0.8) + '" fill="' + hex(d, L.unit[r][j] ? L.warpAt(j) : 1) + '" opacity="' + op + '"/>';
    }
    g += '<rect x="' + (lm - 1.5) + '" y="' + (tm + (act[0] - r0) * c - 1.5) + '" width="' + (M * c + 2.4) + '" height="' + ((act[1] - act[0] + 1) * c + 2.2) + '" fill="none" stroke="#e14a58" stroke-width="' + (big ? 2.2 : 1.6) + '" rx="2"/>';
    let H = tm + nr * c + 6;
    if (st.kind === 'wrow') {       // the weft path along this row: over = line drawn on top, under = warp on top
      const y0 = H + 8, h = big ? 26 : 16; g += '<text x="' + lm + '" y="' + (H + 5) + '" font-size="' + (big ? 10 : 7) + '" fill="#cfd2d6">This row: weft path, line 0 → ' + (M - 1) + '</text>';
      for (let j = 0; j < M; j++) {
        const lift = L.unit[st.rowFrom][j], x = lm + j * c, ln = '<line x1="' + (x - 0.4) + '" x2="' + (x + c - 0.4) + '" y1="' + (y0 + h / 2) + '" y2="' + (y0 + h / 2) + '" stroke="' + hex(d, 1) + '" stroke-width="' + (big ? 6 : 4) + '"/>', rc = '<rect data-pj="' + j + '" data-under="' + (lift ? 1 : 0) + '" x="' + x + '" y="' + (lift ? y0 - 2 : y0) + '" width="' + (c - 1.4) + '" height="' + (lift ? h + 4 : h) + '" fill="' + hex(d, L.warpAt(j)) + '" stroke="#000" stroke-opacity=".5" stroke-width=".5"/>';
        g += lift ? ln + rc : rc + ln;
      }
      for (let j = 0; j < M; j += every) g += '<text x="' + (lm + (j + 0.5) * c).toFixed(1) + '" y="' + (y0 + h + (big ? 14 : 10)) + '" font-size="' + (big ? 9 : 6.5) + '" text-anchor="middle" fill="#9aa0a6">' + j + '</text>';
      H = y0 + h + (big ? 20 : 14);
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="wchart" data-kind="' + st.kind + '" viewBox="0 0 ' + Wd + ' ' + H + '" style="' + (big ? 'width:' + Math.max(Wd * 1.0, 620) + 'px;max-width:none' : 'width:100%;display:block') + '" role="img" aria-label="Pattern chart. Each square is one line in one row; red frame is the current row.">' + g + '</svg>';
  }
  W.diagramSVG = function (d, L, st, opt) { const big = !!(opt && opt.big); return (st.kind === 'warp' || st.kind === 'wstart' || st.kind === 'wfinish') ? ring(d, L, st, big) : chart(d, L, st, big); };

  // ---------- printable marking guide ----------
  W.templateHTML = function (d) {
    const L = T.layout(d), M = L.M, c = L.cellW; let g = '', ch = '';
    for (let j = 0; j < M; j++) {
      g += '<rect x="' + (j * c).toFixed(2) + '" y="0" width="' + c.toFixed(2) + '" height="9" fill="' + hex(d, L.warpAt(j)) + '" stroke="#000" stroke-width=".15"/><line x1="' + (j * c).toFixed(2) + '" x2="' + (j * c).toFixed(2) + '" y1="-3" y2="0" stroke="#000" stroke-width=".2"/><text x="' + ((j + 0.5) * c).toFixed(2) + '" y="-4" font-size="' + Math.min(2.4, c * 0.8).toFixed(2) + '" text-anchor="middle">' + j + '</text>';
    }
    for (let r = 0; r < L.Q; r++) for (let j = 0; j < M; j++) ch += '<rect x="' + (j * c).toFixed(2) + '" y="' + (14 + r * c).toFixed(2) + '" width="' + c.toFixed(2) + '" height="' + c.toFixed(2) + '" fill="' + hex(d, L.unit[r][j] ? L.warpAt(j) : 1) + '"/>';
    return '<h3 style="font:600 12pt sans-serif;margin:0 0 4mm">Thread Design Studio · ' + L.spec.guide + ' marking guide</h3><p style="font:9pt sans-serif;margin:0 0 8mm">Rod diameter ' + mm(d.diameterMm) + ' mm · circumference ' + L.C.toFixed(1) + ' mm · ' + M + ' warp lines, ' + c.toFixed(2) + ' mm apart. Line 0 is the seam; numbers run the way the weft travels. Print at 100% (no scaling). Colours are approximate. Below: ' + (L.text ? (L.text.custom ? 'the whole design, ' : 'the whole lettering, ') : 'one pattern repeat, ') + L.Q + ' rows (each row is ' + L.tau + ' turns). Not bench tested.</p>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + L.C.toFixed(2) + 'mm" height="' + (14 + L.Q * c + 8).toFixed(2) + 'mm" viewBox="0 -8 ' + L.C.toFixed(2) + ' ' + (14 + L.Q * c + 8).toFixed(2) + '" style="overflow:visible">' + g + ch + '<rect x="0" y="0" width="' + L.C.toFixed(2) + '" height="9" fill="none" stroke="#000" stroke-width=".25"/></svg>';
  };
})(typeof self !== 'undefined' ? self : this);
