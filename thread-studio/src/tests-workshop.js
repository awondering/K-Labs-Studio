// Workshop-refinement tests: the views must be derived from, and agree with, the existing diamond engine.
const T = require('./engine.js'); require('./crosswrap.js'); const X = T.cross, TAU = 2 * Math.PI, fs = require('fs'), fp = require('./fingerprint.js');
const mod = (a, b) => ((a % b) + b) % b, angEq = (a, b) => Math.abs(mod(a - b + Math.PI, TAU) - Math.PI) < 1e-9;
const attr = (s, a) => { const m = s.match(new RegExp(a + '="([^"]*)"')); return m ? m[1] : null; };
const tags = (svg, re) => svg.match(re) || [];
module.exports = function (ok, near) {
  const mk = o => T.createDesign('diamonds', Object.assign({ measured: true }, o || {}));
  const SW = []; for (const dia of [4, 6.5, 8, 12.5, 25]) for (const size of [0, 1, 3, 5]) for (const bt of [3, 5, 7]) SW.push(mk({ diameterMm: dia, size, bandThreads: bt }));
  const each = f => { const bad = []; for (const d of SW) { const L = T.layout(d); for (let p = 1; p <= L.P; p++) { const r = f(d, L, p); if (r) bad.push(d.diameterMm + '/' + d.size + '/' + d.bandThreads + ' p' + p + ' ' + r); } } return bad; };

  // engine untouched: numeric fingerprint of threads, paths and coverage equals the one taken before the refinement
  (() => { const gold = JSON.parse(fs.readFileSync(__dirname + '/golden-cross.json', 'utf8')); let bad = 0; for (const k in gold) { const [dia, size, bt] = k.split('/').map(Number); if (fp(T, mk({ diameterMm: dia, size, bandThreads: bt })) !== gold[k]) bad++; }
    ok('WS0 engine output (threads, paths, marks, coverage) is identical to the pre-refinement engine for 60 designs', bad === 0 && Object.keys(gold).length === 60, bad); })();

  let bad = each((d, L, p) => { const v = X.passView(L, p), o = L.passes[p - 1].o; return v.up.id === 'P' + p + 'U' && v.back.id === 'P' + p + 'B' && v.up.offset === o && v.back.offset === -o && v.up.fam === 'R' && v.back.fam === 'L' && v.up.pass === p && v.back.pass === p && v.up.slot === L.passes[p - 1].slot ? null : 'wrong thread'; });
  ok('WS1 the active thread of step p is the calculated pass p (ids, offsets, families, colour slot)', bad.length === 0, bad.slice(0, 3));

  bad = each((d, L, p) => { const v = X.passView(L, p), pu = X.pathPoints(L, v.up), pb = X.pathPoints(L, v.back), o = v.up.offset, a0 = mod(-TAU * o * L.wv / L.S, TAU);
    if (v.start !== pu[0] && (v.start[0] !== pu[0][0] || v.start[1] !== pu[0][1])) return 'start≠path'; if (v.turn[0] !== pu[pu.length - 1][0] || v.turn[1] !== pu[pu.length - 1][1]) return 'turn≠path';
    if (v.end[0] !== pb[pb.length - 1][0]) return 'end≠path'; if (!near(v.start[0], 0, 1e-9) || !near(v.turn[0], L.lenAdj, 1e-9) || !near(v.end[0], 0, 1e-9)) return 'z ends';
    if (!angEq(v.start[1], a0) || !angEq(v.turn[1], a0) || !angEq(v.end[1], a0)) return 'angle'; if (o === 0 && !angEq(v.start[1], 0)) return 'o=0 not on A';
    if (!(v.turn[0] > v.start[0] && v.backStart[0] === v.turn[0])) return 'turn continuity'; return null; });
  ok('WS2 start, turn-around and end points equal the path coordinates, sit at the butt/tip ends at the same angle, and the back thread begins where the up thread ends', bad.length === 0, bad.slice(0, 3));

  bad = each((d, L, p) => { const v = X.passView(L, p), pu = X.pathPoints(L, v.up), pb = X.pathPoints(L, v.back); for (let i = 1; i < pu.length; i++) if (!(pu[i][0] > pu[i - 1][0] && pu[i][1] > pu[i - 1][1])) return 'up not butt→tip with turning'; for (let i = 1; i < pb.length; i++) if (!(pb[i][0] < pb[i - 1][0] && pb[i][1] > pb[i - 1][1])) return 'back not tip→butt'; return null; });
  ok('WS3 up legs run butt to tip and back legs tip to butt, with the rod turning the same way on both', bad.length === 0, bad.slice(0, 3));

  // coverAt agrees with slotAt, and the active pass is on top at its own thread
  (() => { let n = 0, miss = 0, topBad = 0, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const d of SW.filter((_, i) => i % 5 === 0)) { const L = T.layout(d);
      for (let i = 0; i < 400; i++) { const z = rnd() * L.lenAdj * 0.999, th = rnd() * TAU, mp = Math.floor(rnd() * (L.P + 3)) - 1; n++; if (L.coverAt(z, th, mp).slot !== L.slotAt(z, th, mp)) miss++; }
      for (let p = 1; p <= L.P; p++) { const v = X.passView(L, p), pb = X.pathPoints(L, v.back); for (let i = 0; i < pb.length - 1; i++) { const z = (pb[i][0] + pb[i + 1][0]) / 2, th = (pb[i][1] + pb[i + 1][1]) / 2, c = L.coverAt(z, th, p); if (z > 1e-6 && z < L.lenAdj - 1e-6) { n++; if (c.pass !== p || c.leg !== 'back') topBad++; } } } }
    ok('WS4 coverAt returns the same slot as slotAt, and the back thread of pass p is the top layer along its own path', miss === 0 && topBad === 0, { n, miss, topBad }); })();

  // diagram data matches engine coordinates
  bad = each((d, L, p) => { if (d.diameterMm !== 8 && d.diameterMm !== 25 || d.size === 5) return null; const v = X.passView(L, p), svg = X.diagramSVG(d, L, p, p), st = svg.match(/<g data-role="start"[^>]*>/)[0], tu = svg.match(/<g data-role="turn"[^>]*>/)[0];
    if (+attr(st, 'data-z') !== v.start[0] || +attr(st, 'data-theta') !== mod(v.start[1], TAU)) return 'start marker'; if (+attr(tu, 'data-z') !== v.turn[0] || !near(+attr(tu, 'data-theta'), mod(v.turn[1], TAU), 1e-9)) return 'turn marker';
    const A = tags(svg, /<circle data-mark="A" data-z="[^"]*"/g).map(s => +attr(s, 'data-z')), C = tags(svg, /<circle data-mark="C" data-z="[^"]*"/g).map(s => +attr(s, 'data-z'));
    if (JSON.stringify([...new Set(A)]) !== JSON.stringify(L.marks.A) || JSON.stringify(C) !== JSON.stringify(L.marks.C)) return 'marks';
    const ar = tags(svg, /<polygon data-role="arrow"[^>]*>/g); if (!ar.length || ar.some(a => (attr(a, 'data-leg') === 'up') !== (+attr(a, 'data-dz') === 1)) || !ar.some(a => attr(a, 'data-leg') === 'back') || ar.some(a => +attr(a, 'data-pass') !== p)) return 'arrows';
    if (!svg.includes('◀ BUTT') || !svg.includes('TIP ▶')) return 'orientation'; return null; });
  ok('WS5 diagram START/TURN markers, A and C marks and direction arrows equal the engine coordinates; butt and tip are labelled', bad.length === 0, bad.slice(0, 3));

  bad = each((d, L, p) => { if (d.diameterMm !== 8 || d.size !== 1) return null; const svg = X.diagramSVG(d, L, L.P, p), paths = svg.match(/<path data-pass="\d+" data-leg="\w+" data-state="(done|active)"/g) || [];
    const done = paths.filter(s => /done/.test(s)), act = paths.filter(s => /active/.test(s)); if (done.length !== 2 * (p - 1)) return 'done ' + done.length; if (act.length !== 4) return 'active ' + act.length;
    if (done.some(s => +attr(s, 'data-pass') >= p) || act.some(s => +attr(s, 'data-pass') !== p)) return 'wrong pass highlighted';
    for (let q = 1; q < p; q++) { const hex = T.thread(d.slots[L.passes[q - 1].slot]).hex; if (!svg.includes('data-pass="' + q + '" data-leg="up" data-state="done" d="') || !new RegExp('data-pass="' + q + '" data-leg="up" data-state="done"[^>]*stroke="' + hex + '"').test(svg)) return 'done colour ' + q; }
    const iu = svg.indexOf('data-pass="' + p + '" data-leg="up" data-state="active"'), ib = svg.lastIndexOf('data-pass="' + p + '" data-leg="back" data-state="active"'); if (!(iu >= 0 && ib > iu)) return 'layer order (back drawn over up)'; return null; });
  ok('WS6 previous passes stay in the diagram in their real colours, only pass p is active, and the back thread is drawn over the up thread', bad.length === 0, bad.slice(0, 3));

  bad = each((d, L, p) => { const rb = X.ribbon(L, p), o = L.passes[p - 1].o; for (const [row, f] of [[rb.up, 1], [rb.back, -1]]) { const a = row.filter(c => c.state === 'active'); if (a.length !== 1 || a[0].offset !== f * o) return 'active cell'; if (row.filter(c => c.state === 'done').length !== p - 1 || row.filter(c => c.state === 'todo').length !== L.P - p + (row.length - L.P)) { if (row.filter(c => c.state === 'done').length !== p - 1) return 'done count'; } }
    const v = X.passView(L, p); if (v.nbUp) { if (Math.abs(v.nbUp.offset) !== Math.abs(v.up.offset) - 1 || v.nbUp.pass >= p) return 'neighbour'; } else if (v.up.offset !== 0) return 'no neighbour'; return null; });
  ok('WS7 the band cross-section shows exactly one active cell per leg at the right offset, p−1 completed cells, and the neighbour is the adjacent earlier thread', bad.length === 0, bad.slice(0, 3));

  bad = []; (() => { const d = mk({ diameterMm: 8 }), L = T.layout(d), steps = T.steps(d).filter(s => s.kind === 'pass'); if (steps.length !== L.P) bad.push('count');
    steps.forEach(s => { const vis = [s.head].concat(s.legs.map(l => l.label + ' ' + l.action), s.chips, s.notes).join(' ');
      if (!/^PASS \d+ OF \d+ — [A-Z ]+$/.test(s.head)) bad.push('head ' + s.head); if (s.pass > 1 && (vis.length > 330 || s.legs.some(l => l.action.length > 75))) bad.push('long p' + s.pass + ' ' + vis.length);
      if (s.pass > 1 && !/edge of the/.test(s.legs[0].action)) bad.push('action p' + s.pass); if ((s.pass === 1) !== !!s.howOpen) bad.push('howOpen p' + s.pass); if (!s.how.length || s.how.join(' ') !== s.text) bad.push('how≠text'); });
    const p3 = steps[2]; if (!/^Follow the (butt|tip)-side edge of the previous \w+ thread\.$/.test(p3.legs[0].action)) bad.push('p3 wording ' + p3.legs[0].action);
    const tie = steps.filter(s => s.notes.length); if (!tie.length) bad.push('tie-in/off notes dropped'); if (!steps[0].chips.some(c => /Marks every/.test(c)) || !steps[0].chips.some(c => /turns each way/.test(c))) bad.push('measurements'); })();
  ok('WS8 pass steps are compact (head + one action per leg + measurements), later passes show only what changes, the full method stays under How to do this, and tie-in/off notes are kept', bad.length === 0, bad.slice(0, 4));

  ok('WS9 the first pass names the method, later passes name the side of the previous thread', (() => { const s = T.steps(mk()).filter(x => x.kind === 'pass'); return /Start at A 0/.test(s[0].legs[0].action) && s.slice(1).every(x => /edge of the/.test(x.legs[0].action) && /edge of the/.test(x.legs[1].action)); })());

  ok('WS10 diagram expands (big mode) from the same geometry: same markers and threads, larger viewBox', (() => { const d = mk({ diameterMm: 8 }), L = T.layout(d), a = X.diagramSVG(d, L, 4, 4), b = X.diagramSVG(d, L, 4, 4, { big: true }); return /viewBox="0 0 1000 250"/.test(b) && /viewBox="0 0 360 136"/.test(a) && tags(a, /data-state="active"/g).length === tags(b, /data-state="active"/g).length && tags(a, /<circle data-mark/g).length === tags(b, /<circle data-mark/g).length && attr(a.match(/<g data-role="start"[^>]*>/)[0], 'data-z') === attr(b.match(/<g data-role="start"[^>]*>/)[0], 'data-z'); })());
};
