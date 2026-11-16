/* K-Labs KR Concept calculator engine. Pure functions, no DOM. Positions in mm, measured from the
   blank tip end to the guide RING CENTRE projected on the blank axis. Ring-centre-to-foot offsets are
   NOT modelled (unverified); never use these numbers to mark foot placement. */
(function (root) {
  'use strict';
  const IN = 25.4, MIN_GAP = 15, FIT_TOL = 1.3; // 1.3 mm = chart precision (+/-0.05 in)
  const toMm = (v, u) => (u === 'mm' ? v : v * IN);
  const fromMm = (mm, u) => (u === 'mm' ? mm : mm / IN);
  function frac(i) {
    const neg = i < 0; let a = Math.abs(i), w = Math.floor(a), n = Math.round((a - w) * 16);
    if (n === 16) { w++; n = 0; }
    let s = ''; if (n) { let d = 16, k = n; while (k % 2 === 0) { k /= 2; d /= 2; } s = k + '/' + d; }
    return (neg ? '-' : '') + ((w || !s ? String(w) : '') + (w && s ? ' ' : '') + s) + '"';
  }
  const fmt = (mm, u) => (u === 'mm' ? mm.toFixed(1) : u === 'frac' ? frac(mm / IN) : (mm / IN).toFixed(2));

  // DEMONSTRATION values only. They are INVENTED to show how the tool works; they are not from any manufacturer chart and must not be
  // used to build a rod. No manufacturer chart data is included in this tool: the builder enters measurements from their own chart
  // (see referenceFromEntry). Same structure as a real reference: reel stem -> stripper, then the gaps toward the tip-top.
  const DEMO_REFERENCE = {
    id: 'demo', demo: true, label: 'Demonstration values (invented)',
    source: 'Invented demonstration values, not from any manufacturer chart. Enter your own chart measurements to lay out a real rod.',
    stripperIn: 26.5,                                     // reel stem -> stripper ring
    gapsIn: [9.2, 7, 6, 5.4, 5, 4.7, 4.4, 4.2, 3.8],      // stripper -> ... -> tip-top (stem to tip-top = 76.2 in, a 7 ft blank with a 7.8 in stem)
    chokeTable: { stripperIn: 26.5, chokeBeyondIn: 22.3, g2In: 9.2, g3In: 7 }, // invented cross-check, deliberately 0.1 in off the spacing chain
    sourceCount: { label: 10, includesTipTop: true },
    envelope: { minGapIn: 3.3, maxGapIn: 6.5, verified: false, definition: 'invented demonstration limits for the gaps after the choke guide', source: 'Invented demonstration limits.' },
    guides: [
      { role: 'stripper', model: 'Stripper' }, { role: 'reduction', model: 'Reduction 2' },
      { role: 'reduction', model: 'Reduction 3', unverified: true, unverifiedNote: 'third reduction guide: the model entered here is a label only and has not been verified' },
      { role: 'choke', model: 'Choke' },
      ...Array(5).fill({ role: 'running', model: 'Running' }),
      { role: 'tip-top', model: 'Tip-top' }
    ]
  };
  const MAX_ENTRY_GUIDES = 24, MIN_ENTRY_GUIDES = 5;
  // Builds a reference from the builder's own chart measurements (pure). e = { label, unit: 'mm' | 'in', stripper, gaps: [..], models?: [..],
  // chokeBeyond?, envelopeMin?, envelopeMax? } with lengths in the stated unit. Guide roles follow the KR-style train (stripper, two further
  // reduction guides, choke guide, running guides, tip-top); that role order is an assumption of this tool and is stated in the interface.
  function referenceFromEntry(e) {
    const bad = msg => ({ ok: false, msg });
    if (!e || typeof e !== 'object') return bad('Nothing entered');
    const k = e.unit === 'mm' ? 1 / IN : 1, num = v => (typeof v === 'number' ? v : parseFloat(v));
    const stripperIn = num(e.stripper) * k;
    if (!(stripperIn > 0) || !isFinite(stripperIn)) return bad('Enter the stripper distance (reel stem to the first guide) as a positive number');
    const gaps = (Array.isArray(e.gaps) ? e.gaps : []).map(num);
    if (gaps.length + 1 < MIN_ENTRY_GUIDES) return bad('Enter at least ' + (MIN_ENTRY_GUIDES - 1) + ' gaps (a stripper, two more reduction guides, a choke guide and a tip-top)');
    if (gaps.length + 1 > MAX_ENTRY_GUIDES) return bad('That is more than ' + MAX_ENTRY_GUIDES + ' guides');
    if (gaps.some(g => !(g > 0) || !isFinite(g))) return bad('Every gap must be a positive number');
    const gapsIn = gaps.map(g => +(g * k).toFixed(6)), n = gapsIn.length + 1;
    const models = Array.isArray(e.models) ? e.models.map(m => String(m).trim()) : [];
    if (models.length && models.length !== n) return bad('Enter one model per guide (' + n + ') or leave the models blank');
    const roleAt = i => (i === 0 ? 'stripper' : i < 3 ? 'reduction' : i === 3 ? 'choke' : i === n - 1 ? 'tip-top' : 'running');
    const dflt = { stripper: 'Stripper', reduction: 'Reduction', choke: 'Choke', running: 'Running', 'tip-top': 'Tip-top' };
    const guides = Array.from({ length: n }, (_, i) => { const role = roleAt(i), g = { role, model: models[i] || (role === 'reduction' ? 'Reduction ' + (i + 1) : dflt[role]) };
      if (i === 2) { g.unverified = true; g.unverifiedNote = 'third reduction guide: the model is a label you entered and has not been verified'; } return g; });
    const ref = { id: 'entered', label: String(e.label || 'My chart measurements').trim().slice(0, 60) || 'My chart measurements',
      source: 'Measurements entered by the builder from their own chart. Not verified by this tool.', stripperIn: +stripperIn.toFixed(6), gapsIn,
      sourceCount: { label: n, includesTipTop: true }, guides };
    const cb = e.chokeBeyond == null || e.chokeBeyond === '' ? null : num(e.chokeBeyond) * k;
    if (cb != null) { if (!(cb > 0) || !isFinite(cb)) return bad('The choke distance must be a positive number'); ref.chokeTable = { stripperIn: ref.stripperIn, chokeBeyondIn: +cb.toFixed(6), g2In: gapsIn[0], g3In: gapsIn[1] }; }
    const lo = e.envelopeMin == null || e.envelopeMin === '' ? null : num(e.envelopeMin) * k, hi = e.envelopeMax == null || e.envelopeMax === '' ? null : num(e.envelopeMax) * k;
    if ((lo == null) !== (hi == null)) return bad('Enter both the smallest and largest runner gap in your chart, or neither');
    if (lo != null) { if (!(lo > 0 && hi > lo) || !isFinite(hi)) return bad('The largest runner gap must be greater than the smallest'); ref.envelope = { minGapIn: +lo.toFixed(6), maxGapIn: +hi.toFixed(6), verified: false, definition: 'entered by the builder: smallest and largest runner gap in their chart', source: 'Builder-entered.' }; }
    return { ok: true, ref };
  }

  // Optional reduction-train label sets. Only a reference that supplies its own ref.trains offers them; none are built in.
  const trainsOf = ref => (ref && Array.isArray(ref.trains) ? ref.trains : []);
  const ringMm = m => { const r = /^[A-Za-z]{1,3}(\d+(?:\.\d+)?)/.exec(m || ''); return r ? parseFloat(r[1]) : null; };
  const frameHeightMm = g => (g && g.frameHeightMm != null ? g.frameHeightMm : null); // no verified manufacturer heights are held
  function parseLength(s, u) {
    s = String(s).trim().replace(/"/g, '').replace(',', '.'); if (!s) return NaN;
    const m = s.match(/^(-?)(?:(\d+(?:\.\d+)?)\s+)?(\d+)\/(\d+)$/); let v;
    if (m) { v = (m[2] ? parseFloat(m[2]) : 0) + (+m[3]) / (+m[4]); if (m[1]) v = -v; }
    else { if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN; v = parseFloat(s); }
    return u === 'mm' ? v : v * IN;
  }
  function applyTrain(L, id) {
    const t = trainsOf(L.ref).find(x => x.id === id); if (!t) return { ok: false };
    L.train = id; t.models.forEach((m, i) => { if (L.guides[i]) L.guides[i].model = m; }); return { ok: true };
  }
  function buildReference(ref) {
    const stem = [ref.stripperIn * IN];
    ref.gapsIn.forEach(g => stem.push(stem[stem.length - 1] + g * IN));
    return { fromStemMm: stem, totalMm: stem[stem.length - 1],
      blankGuides: ref.guides.length - 1, totalGuides: ref.guides.length };
  }
  function crossCheck(ref) {
    const t = ref.chokeTable, b = buildReference(ref), ci = ref.guides.findIndex(g => g.role === 'choke');
    if (!t || ci < 0) return null;
    const chain = b.fromStemMm[ci], table = (t.stripperIn + t.chokeBeyondIn) * IN;
    return { chainMm: chain, tableMm: table, deltaMm: table - chain, agrees: Math.abs(table - chain) < 0.01,
      stripperAgrees: t.stripperIn === ref.stripperIn,
      impliedG3In: +(t.chokeBeyondIn - t.g2In - t.g3In).toFixed(6), diagramG3In: ref.gapsIn[2] };
  }
  function createLayout(ref, geom, train) {
    const b = buildReference(ref), stemToTip = geom.bladeLenMm - geom.stemFromButtMm;
    const guides = ref.guides.map((g, i) => Object.assign({}, g, {
      refStemMm: b.fromStemMm[i], refTipMm: stemToTip - b.fromStemMm[i],
      tipMm: stemToTip - b.fromStemMm[i], basis: 'published', locked: false }));
    const L = { ref, geom, stemToTip, guides, refBlank: b.blankGuides, refTotalMm: b.totalMm, train: null };
    if (trainsOf(ref).length) applyTrain(L, train || ref.train || trainsOf(ref)[0].id); return L;
  }
  const label = (L, i) => (i === L.guides.length - 1 ? 'TT' : '#' + (i + 1));
  const spacing = (L, i) => (i < L.guides.length - 1 ? L.guides[i].tipMm - L.guides[i + 1].tipMm : null);
  const fromStem = (L, i) => L.stemToTip - L.guides[i].tipMm;
  const fromButt = (L, i) => L.geom.bladeLenMm - L.guides[i].tipMm;
  function geometry(L) {
    const delta = L.stemToTip - L.refTotalMm; // negative: reference runs past the blank tip
    return { deltaMm: delta, fits: Math.abs(delta) <= FIT_TOL, shortfallMm: Math.max(0, -delta),
      overhangs: L.guides.map((g, i) => ({ i, mm: g.refTipMm })).filter(o => o.mm < -1e-6),
      suggestStemFromButtMm: L.geom.bladeLenMm - L.refTotalMm };
  }
  function issues(L) {
    const out = [], n = L.guides.length;
    L.guides.forEach((g, i) => {
      if (g.tipMm < -1e-6) out.push({ i, type: 'range', msg: label(L, i) + ' is ' + (-g.tipMm).toFixed(1) + ' mm beyond the blank tip' });
      if (g.tipMm > L.geom.bladeLenMm + 1e-6) out.push({ i, type: 'range', msg: label(L, i) + ' is beyond the butt' });
      if (i < n - 1) { const s = g.tipMm - L.guides[i + 1].tipMm;
        if (s <= 0) out.push({ i, type: 'order', msg: label(L, i) + ' is not tip-side of ' + label(L, i + 1) });
        else if (s < MIN_GAP) out.push({ i, type: 'gap', msg: 'Spacing ' + label(L, i) + ' to ' + label(L, i + 1) + ' under ' + MIN_GAP + ' mm' }); }
    });
    const tt = L.guides[n - 1]; if (tt.tipMm > FIT_TOL) out.push({ i: n - 1, type: 'range', msg: 'Tip-top is ' + tt.tipMm.toFixed(1) + ' mm short of the tip; it must sit at the tip' });
    return out;
  }
  function setPosition(L, i, mm) {
    const g = L.guides[i], p = L.guides[i - 1], nx = L.guides[i + 1];
    if (!isFinite(mm)) return { ok: false, msg: 'Enter a number' };
    if (g.locked) return { ok: false, msg: label(L, i) + ' is locked' };
    if (mm < 0) return { ok: false, msg: 'Position can\u2019t be beyond the blank tip' };
    if (mm > L.geom.bladeLenMm) return { ok: false, msg: 'Position can\u2019t be beyond the butt' };
    if (p && mm > p.tipMm - MIN_GAP) return { ok: false, msg: 'Keep ' + MIN_GAP + ' mm clear of ' + label(L, i - 1) };
    if (nx && mm < nx.tipMm + MIN_GAP) return { ok: false, msg: 'Keep ' + MIN_GAP + ' mm clear of ' + label(L, i + 1) };
    g.tipMm = mm;
    g.basis = g.refTipMm != null && Math.abs(mm - g.refTipMm) < 1e-9 ? 'published' : (g.basis === 'added' ? 'added' : 'manual');
    return { ok: true };
  }
  const toggleLock = (L, i) => { L.guides[i].locked = !L.guides[i].locked; };
  function resetGuide(L, i) {
    const g = L.guides[i]; if (g.refTipMm == null) return { ok: false, msg: 'Added guides have no reference' };
    g.tipMm = g.refTipMm; g.basis = 'published'; return { ok: true };
  }
  const resetAll = L => createLayout(L.ref, L.geom, L.train);
  // Geometry change: published guides follow the new reference; manual, experimental, locked and added/removed guides are kept.
  function rebase(L, geom) {
    const N = createLayout(L.ref, geom, L.train), keep = L.guides, added = keep.filter(g => g.refStemMm == null);
    const removed = Math.max(0, L.refBlank - (keep.length - 1 - added.length));
    for (let k = 0; k < removed; k++) { const n = N.guides.length; if (N.guides[n - 2].role === 'running') N.guides.splice(n - 2, 1); }
    N.guides.forEach(g => { const o = keep.find(x => x.refStemMm != null && Math.abs(x.refStemMm - g.refStemMm) < 1e-9);
      if (o && (o.basis !== 'published' || o.locked)) { g.tipMm = o.tipMm; g.basis = o.basis; g.locked = o.locked; } });
    const tt = N.guides.pop(); added.forEach(a => N.guides.push(Object.assign({}, a)));
    N.guides.sort((a, b) => b.tipMm - a.tipMm); N.guides.push(tt); return N;
  }
  function counts(L) {
    const blank = L.guides.length - 1;
    return { blank, tipTop: 1, total: blank + 1, refBlank: L.refBlank, refTotal: L.refBlank + 1,
      differs: blank !== L.refBlank, delta: blank - L.refBlank };
  }
  function addGuide(L) { // heuristic, explicit builder action: midway between last blank guide and tip-top
    const n = L.guides.length, a = L.guides[n - 2], tt = L.guides[n - 1];
    L.guides.splice(n - 1, 0, { role: 'running', model: ((L.guides.find(x => x.role === 'running') || {}).model) || 'Running', refStemMm: null, refTipMm: null,
      tipMm: (a.tipMm + tt.tipMm) / 2, basis: 'added', locked: false });
    return { ok: true };
  }
  function removeGuide(L) {
    const n = L.guides.length, g = L.guides[n - 2];
    if (n - 1 <= 4 || g.role !== 'running') return { ok: false, msg: 'Cannot remove a reduction or choke guide' };
    if (g.locked) return { ok: false, msg: label(L, n - 2) + ' is locked' };
    L.guides.splice(n - 2, 1); return { ok: true };
  }
  // Experimental: scale runner gaps (choke -> tip-top) to fit. Preview never mutates; apply needs explicit call.
  function compressionPreview(L) {
    const ci = L.guides.findIndex(g => g.role === 'choke'), last = L.guides.length - 1;
    if (ci < 0 || L.guides.some(g => g.refTipMm == null)) return null;
    const refSpan = L.guides[ci].refTipMm - L.guides[last].refTipMm, avail = L.guides[ci].tipMm;
    const k = avail / refSpan, pos = L.guides.map((g, j) => (j > ci ? L.guides[ci].tipMm - k * (L.guides[ci].refTipMm - g.refTipMm) : null));
    const gaps = []; for (let j = ci; j < last; j++) gaps.push(k * (L.guides[j].refTipMm - L.guides[j + 1].refTipMm));
    return { k, choke: ci, positions: pos, minGapMm: Math.min(...gaps) };
  }
  const compressionAvailable = L => !!compressionPreview(L);
  function applyCompression(L) {
    const p = compressionPreview(L); if (!p) return { ok: false, msg: 'Not available' };
    if (L.guides.some((g, j) => j > p.choke && g.locked)) return { ok: false, msg: 'Unlock runner guides first' };
    L.guides.forEach((g, j) => { if (j > p.choke) { g.tipMm = p.positions[j]; g.basis = 'experimental'; } });
    return { ok: true, k: p.k };
  }
  const validity = L => { const is = issues(L); return { valid: is.length === 0, reasons: is.map(x => x.msg), issues: is }; };
  const status = L => {
    const v = validity(L); if (!v.valid) return 'Not a valid layout: ' + v.reasons[0] + (v.reasons.length > 1 ? ' (+' + (v.reasons.length - 1) + ' more)' : '');
    const m = L.guides.filter(g => g.basis !== 'published').length;
    return m ? 'Adjusted: ' + m + ' guide' + (m > 1 ? 's' : '') + ' differ from the reference' : 'Reference start';
  };

  // ---- Guide-count assessment (K-Labs heuristic, NOT a Fuji method) -------------------------------------------
  // THREE SEPARATE ASSESSMENTS per candidate guide count:
  //  A. GEOMETRIC (hard): reduction train and locked/manual guides stay put; all guides on the blank, in order, >= MIN_GAP apart.
  //     Failing = 'impossible'. Nothing else can make an impossible layout acceptable.
  //  B. SPACING QUALITY (findings): the runner gaps are checked against criteria taken from the chart data itself:
  //       tight/wide  - a gap outside the smallest..largest runner gap the chart publishes for ANY rod length
  //                     (envelope), allowing only the chart's own rounding precision (0.05 in = 1.27 mm);
  //       widening    - a gap nearer the tip larger than the next one toward the choke (every published row narrows toward the tip).
  //     No percentage tolerance is used. Each finding carries its numbers and an implication.
  //  C. SUITABILITY: 'suitable' = valid with zero findings; 'review' = valid but with findings (never recommended, may be
  //     inspected and applied only with explicit acknowledgement); 'impossible' = fails A.
  //     Only 'suitable' counts are ranked for recommendation: least deviation from this rod's own chart row, then mean gap
  //     closest to that row's mean, then more guides. Free guides are shaped like the row's gaps and scaled to fit.
  // LIMITS: the envelope is necessary, not sufficient. It says nothing about blank action, load, line or reel, and it is only
  // as good as the builder-entered row data. Without ref.envelope the strict row range is used instead.
  const COUNT_WINDOW = 3, MIN_BLANK = 5, PREC = 0.05 * IN; // PREC: chart values are rounded to 0.1 in
  const IMPLICATION = {
    tight: 'Closer than any runner gap the chart publishes: adds guides and tip weight, and may be more guides than the blank needs.',
    wide: 'Wider than any runner gap the chart publishes: the line may be poorly supported between these guides under load.',
    widening: 'Every published row narrows toward the tip; here the spacing widens toward the flexible tip section.' };
  function runnerProfile(ref) {
    const ci = ref.guides.findIndex(g => g.role === 'choke'), g = ref.gapsIn.slice(ci).map(v => v * IN);
    const tipFirst = g.slice().reverse(), tot = tipFirst.reduce((a, b) => a + b, 0); let cum = 0;
    const pts = tipFirst.map(v => { const c = (cum + v / 2) / tot; cum += v; return [c, v]; });
    const at = u => { if (u <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const [u0, v0] = pts[i - 1], [u1, v1] = pts[i]; return v0 + (v1 - v0) * (u - u0) / (u1 - u0); }
      return pts[pts.length - 1][1]; };
    const env = ref.envelope ? [ref.envelope.minGapIn * IN, ref.envelope.maxGapIn * IN] : [Math.min(...g), Math.max(...g)];
    return { at, refMin: Math.min(...g), refMax: Math.max(...g), mean: tot / g.length, envMin: env[0], envMax: env[1], envelopeFromChart: !!ref.envelope };
  }
  function reviewGaps(ref, gaps) { // gaps ordered from the tip toward the choke
    const P = runnerProfile(ref), findings = [];
    gaps.forEach((g, i) => { if (g < P.envMin - PREC - 1e-9) findings.push({ type: 'tight', gap: i + 1, valueMm: g, boundMm: P.envMin });
      else if (g > P.envMax + PREC + 1e-9) findings.push({ type: 'wide', gap: i + 1, valueMm: g, boundMm: P.envMax }); });
    for (let i = 1; i < gaps.length; i++) if (gaps[i - 1] > gaps[i] + PREC + 1e-9) findings.push({ type: 'widening', gap: i, valueMm: gaps[i - 1], boundMm: gaps[i] });
    findings.forEach(f => { f.implication = IMPLICATION[f.type]; });
    return { level: findings.length ? 'review' : 'suitable', findings, envelope: [P.envMin, P.envMax], envelopeFromChart: P.envelopeFromChart, precisionMm: PREC };
  }
  function spacingReview(L) { // same check applied to the working layout
    const gs = L.guides, ci = gs.findIndex(g => g.role === 'choke'); if (ci < 0) return null;
    const tips = gs.slice(ci).map(g => g.tipMm).reverse(); return Object.assign({ gapsMm: tips.slice(1).map((p, i) => p - tips[i]) }, reviewGaps(L.ref, tips.slice(1).map((p, i) => p - tips[i])));
  }
  function candidate(L, n) { // pure: never mutates L
    const gs = L.guides, ci = gs.findIndex(g => g.role === 'choke'), last = gs.length - 1;
    const bad = why => ({ n, status: 'invalid', level: 'impossible', geometric: { valid: false, why }, why });
    if (ci < 0) return bad('No choke guide in this layout');
    const runners = gs.slice(ci + 1, last), fixed = runners.filter(g => g.locked || g.basis === 'manual').sort((a, b) => a.tipMm - b.tipMm);
    const nRun = n - (ci + 1), free = nRun - fixed.length, tt = gs[last];
    if (nRun < 1) return bad('Needs at least one running guide');
    if (free < 0) return bad('Locked/manual guides exceed this count');
    const a = tt.locked || tt.basis === 'manual' ? tt.tipMm : 0, hi = gs[ci].tipMm, P = runnerProfile(L.ref);
    const bounds = [a, ...fixed.map(g => g.tipMm), hi];
    for (let i = 1; i < bounds.length; i++) if (bounds[i] - bounds[i - 1] < MIN_GAP) return bad('Fixed guides leave under ' + MIN_GAP + ' mm clearance');
    const lens = bounds.slice(1).map((b, i) => b - bounds[i]), q = lens.map(() => 0); // give each free guide to the widest current gap
    for (let k = 0; k < free; k++) { let s = 0; lens.forEach((l, i) => { if (l / (q[i] + 1) > lens[s] / (q[s] + 1)) s = i; }); q[s]++; }
    const run = []; // ascending from tip: {tipMm, guide|null}
    lens.forEach((len, s) => {
      const w = Array.from({ length: q[s] + 1 }, (_, j) => P.at((bounds[s] + (j + 0.5) * len / (q[s] + 1)) / hi)), sw = w.reduce((x, y) => x + y, 0);
      let p = bounds[s]; for (let j = 0; j < q[s]; j++) { p += w[j] * len / sw; run.push({ tipMm: p, guide: null }); }
      if (s < fixed.length) run.push({ tipMm: bounds[s + 1], guide: fixed[s] });
    });
    const pos = [a, ...run.map(r => r.tipMm), hi], gaps = pos.slice(1).map((p, i) => p - pos[i]);
    const minGapMm = Math.min(...gaps), maxGapMm = Math.max(...gaps), valid = minGapMm >= MIN_GAP, mean = (hi - a) / gaps.length;
    if (!valid) return Object.assign(bad('A gap would be under ' + MIN_GAP + ' mm'), { runners: run, gapsMm: gaps, minGapMm, maxGapMm });
    const low = g => (g < P.refMin - 1e-9 ? (P.refMin - g) / P.refMin * 100 : 0), high = g => (g > P.refMax + 1e-9 ? (g - P.refMax) / P.refMax * 100 : 0);
    const flags = gaps.map(g => (low(g) ? 'low' : high(g) ? 'high' : null)), review = reviewGaps(L.ref, gaps);
    return { n, status: 'valid', level: review.level, geometric: { valid: true, why: '' }, why: '', review,
      runners: run, gapsMm: gaps, flags, minGapMm, maxGapMm, meanGapMm: mean, nLow: flags.filter(x => x === 'low').length, nHigh: flags.filter(x => x === 'high').length,
      lowWorstPct: Math.max(0, ...gaps.map(low)), highWorstPct: Math.max(0, ...gaps.map(high)), excessPct: gaps.reduce((s, g) => s + low(g) + high(g), 0),
      withinPublished: flags.every(x => !x), meanDevPct: (mean / P.mean - 1) * 100, score: Math.abs(Math.log(mean / P.mean)), refRange: [P.refMin, P.refMax], refMeanMm: P.mean };
  }
  function assess(L) {
    const v = validity(L), g = geometry(L);
    if (v.valid) return { needed: false, referenceFits: g.fits, valid: true };
    const ci = L.guides.findIndex(x => x.role === 'choke'), trainBad = v.issues.filter(x => x.i <= ci);
    if (ci < 0 || trainBad.length) return { needed: true, valid: false, candidates: [], ranked: [], reviewable: [], recommended: null, reason: 'The reduction train itself doesn\u2019t fit (' + (trainBad[0] ? trainBad[0].msg : 'no choke guide') + '). Move the reel seat or adjust it manually.' };
    const lo = Math.max(MIN_BLANK, L.refBlank - COUNT_WINDOW), cands = [];
    for (let n = L.refBlank + COUNT_WINDOW; n >= lo; n--) cands.push(candidate(L, n));
    const valid = cands.filter(c => c.status === 'valid');
    const ranked = valid.filter(c => c.level === 'suitable').sort((x, y) => (Math.abs(x.excessPct - y.excessPct) > 1e-6 ? x.excessPct - y.excessPct : 0) || x.score - y.score || y.n - x.n);
    const reviewable = valid.filter(c => c.level === 'review').sort((x, y) => x.review.findings.length - y.review.findings.length || x.excessPct - y.excessPct || y.n - x.n);
    return { needed: true, valid: false, candidates: cands, ranked, reviewable, recommended: ranked[0] ? ranked[0].n : null,
      reason: ranked[0] ? '' : reviewable[0] ? 'Layouts that physically fit exist, but none has runner spacing the chart supports, so none is recommended. You can inspect them as manual-review layouts, or adjust the reel seat, guide count or positions by hand.'
        : 'No guide count between ' + lo + ' and ' + (L.refBlank + COUNT_WINDOW) + ' keeps at least ' + MIN_GAP + ' mm between neighbouring guides with the fixed guides in place. Adjust manually or move the reel seat.' };
  }
  function applyCandidate(L, n, opts) { // explicit builder action only
    const c = candidate(L, n); if (c.status !== 'valid') return { ok: false, msg: c.why || 'Candidate not acceptable' };
    if (c.level === 'review' && !(opts && opts.acknowledgeReview)) return { ok: false, msg: 'Spacing needs manual review; applying requires explicit confirmation' };
    const gs = L.guides, ci = gs.findIndex(g => g.role === 'choke'), model = (gs[ci + 1] && gs[ci + 1].model) || 'Running', backup = gs.slice();
    const run = c.runners.slice().reverse().map(r => r.guide || { role: 'running', model, refStemMm: null, refTipMm: null, tipMm: r.tipMm, basis: 'heuristic', locked: false });
    const tt = gs[gs.length - 1], ttOld = { tipMm: tt.tipMm, basis: tt.basis };
    if (!tt.locked && tt.basis !== 'manual') { tt.tipMm = 0; tt.basis = 'heuristic'; } // tip-top goes to the tip, as part of the approved candidate
    L.guides = [...gs.slice(0, ci + 1), ...run, tt];
    if (validity(L).issues.length) { L.guides = backup; tt.tipMm = ttOld.tipMm; tt.basis = ttOld.basis; return { ok: false, msg: 'Result failed validation; nothing changed' }; }
    return { ok: true, level: c.level };
  }
  const api = { IN, MIN_GAP, FIT_TOL, toMm, fromMm, frac, fmt, DEMO_REFERENCE, referenceFromEntry, trainsOf, MIN_ENTRY_GUIDES, MAX_ENTRY_GUIDES, buildReference, crossCheck, createLayout, label,
    spacing, fromStem, fromButt, geometry, issues, setPosition, toggleLock, resetGuide, resetAll, counts, addGuide,
    removeGuide, validity, candidate, assess, applyCandidate, reviewGaps, spacingReview, PREC, COUNT_WINDOW, compressionPreview, compressionAvailable, applyCompression, status, ringMm, frameHeightMm, parseLength, applyTrain, rebase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KR = api;
})(typeof window !== 'undefined' ? window : globalThis);
