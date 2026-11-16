(function (root) {
  const K = typeof require !== 'undefined' ? require('./engine.js') : root.KR;
  const results = []; const near = (a, b, t = 0.005) => Math.abs(a - b) <= t;
  const T = (name, fn) => { try { const r = fn(); results.push({ name, ok: r === undefined || r === true, msg: r === false ? 'false' : '' }); } catch (e) { results.push({ name, ok: false, msg: e.message }); } };
  const A = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
  // The demonstration reference restated here as plain numbers, so the checks compare the engine with independent arithmetic (tenths of an inch).
  const DG10 = [92, 70, 60, 54, 50, 47, 44, 42, 38], STR10 = 265, IN10 = 2.54;      // gaps and stripper, in tenths of an inch; 265 + 497 = 762 = 76.2 in
  const SUFFIX10 = i => DG10.slice(i).reduce((a, b) => a + b, 0), TIP10 = i => SUFFIX10(i) * IN10;   // distance of guide i from the tip-top, mm (tip-top on the blank tip)
  const mk = (stem = 198.12) => K.createLayout(K.DEMO_REFERENCE, { bladeLenMm: 2133.6, stemFromButtMm: stem });

  T('count audit: 9 blank + tip-top = 10', () => { const c = K.counts(mk()); A(c.blank === 9 && c.tipTop === 1 && c.total === 10 && !c.differs); });
  T('roles: 1 KB, 5 KT, 3 reduction, 1 tip-top', () => { const g = mk().guides; const n = r => g.filter(x => x.role === r).length;
    A(n('choke') === 1 && n('running') === 5 && n('stripper') + n('reduction') === 3 && n('tip-top') === 1); });
  T('third reduction guide flagged unverified', () => A(mk().guides[2].unverified === true));
  T('gaps sum 49.7 in = 1262.380 mm; stem->TT 1935.480', () => { const b = K.buildReference(K.DEMO_REFERENCE);
    A(near(b.totalMm - b.fromStemMm[0], 1262.38) && near(b.totalMm, 1935.48)); });
  T('published positions from tip (mm), against independent tenths-of-an-inch arithmetic', () => { const exp = DG10.map((_, i) => TIP10(i)).concat([0]);
    A(near(exp[0], 1262.38) && near(exp[9], 0));
    mk().guides.forEach((g, i) => A(near(g.tipMm, exp[i]), 'guide ' + i)); });
  T('datum consistency: tip+stem = stem->TT, butt+tip = blank', () => { const L = mk();
    L.guides.forEach((g, i) => { A(near(K.fromStem(L, i) + g.tipMm, 1935.48)); A(near(K.fromButt(L, i) + g.tipMm, 2133.6)); }); });
  T('spacings equal published gaps x 25.4', () => { const L = mk(); K.DEMO_REFERENCE.gapsIn.forEach((g, i) => A(near(K.spacing(L, i), g * 25.4), 'gap ' + i)); });
  T('stem sits 198.12 mm from butt in fit case', () => A(near(2133.6 - 1935.48, 198.12)));
  T('choke table cross-check: 2.540 mm, flagged, not combined', () => { const x = K.crossCheck(K.DEMO_REFERENCE);
    A(near(x.deltaMm, 2.54) && !x.agrees && near(x.chainMm, 1236.98) && near(x.tableMm, 1239.52) && near(x.impliedG3In, 6.1) && x.diagramG3In === 6);
    A(near(mk().guides[3].refStemMm, 1236.98), 'layout must use the spacing diagram'); });
  T('fit case reports no geometry warning', () => A(K.geometry(mk()).fits));
  T('stem 300 mm: shortfall 101.88, TT -101.88, #9 -5.36', () => { const L = mk(300), g = K.geometry(L);
    A(!g.fits && near(g.shortfallMm, 101.88) && near(L.guides[9].tipMm, -101.88) && near(L.guides[8].tipMm, TIP10(8) - 101.88) && g.overhangs.length === 2);
    A(near(g.suggestStemFromButtMm, 198.12)); A(K.issues(L).some(x => x.type === 'range')); });
  T('nothing repositioned silently when geometry mismatches', () => { const L = mk(300); A(L.guides.every(g => g.tipMm === g.refTipMm && g.basis === 'published')); });
  T('compression preview scales the runner gaps so the tip-top lands on the tip; does not mutate', () => { const L = mk(300), p = K.compressionPreview(L);
    const chokeTip = TIP10(3) - 101.88, runnerSpan = TIP10(3), k = chokeTip / runnerSpan;     // independent derivation
    A(near(p.k, k, 1e-4) && near(p.positions[4], chokeTip - k * DG10[3] * IN10, 0.01) && near(p.positions[8], k * DG10[8] * IN10, 0.01) && near(p.positions[9], 0, 0.01));
    A(L.guides.every(g => g.basis === 'published')); });
  T('compression apply marks guides experimental, leaves #1-#4', () => { const L = mk(300); A(K.applyCompression(L).ok);
    A(L.guides[3].basis === 'published' && L.guides[4].basis === 'experimental' && near(L.guides[9].tipMm, 0, 0.01)); });
  T('edit updates both adjacent spacings', () => { const L = mk(); A(K.setPosition(L, 4, 560).ok);
    A(near(K.spacing(L, 3), TIP10(3) - 560) && near(K.spacing(L, 4), 560 - TIP10(5)) && L.guides[4].basis === 'manual'); });
  T('locked guide rejects edits; unlock allows', () => { const L = mk(); K.toggleLock(L, 5); A(!K.setPosition(L, 5, 430).ok);
    K.toggleLock(L, 5); A(K.setPosition(L, 5, 430).ok); });
  T('ordering and clearance enforced', () => { const L = mk(); A(!K.setPosition(L, 4, 700).ok); A(!K.setPosition(L, 4, 440).ok); A(!K.setPosition(L, 9, -5).ok); A(!K.setPosition(L, 4, NaN).ok); });
  T('reset guide recovers reference', () => { const L = mk(); K.setPosition(L, 4, 560); A(K.resetGuide(L, 4).ok && near(L.guides[4].tipMm, TIP10(4)) && L.guides[4].basis === 'published'); });
  T('reset all recovers reference incl. count and locks', () => { let L = mk(); K.addGuide(L); K.toggleLock(L, 0); L = K.resetAll(L);
    A(L.guides.length === 10 && !L.guides[0].locked); });
  T('add guide: count differs flagged, valid ordering', () => { const L = mk(); K.addGuide(L); const c = K.counts(L);
    A(c.blank === 10 && c.differs && c.delta === 1 && K.issues(L).length === 0 && L.guides[9].basis === 'added'); });
  T('remove guide: only running guides, min 4 blank', () => { const L = mk(); A(K.removeGuide(L).ok && K.counts(L).blank === 8);
    while (K.removeGuide(L).ok); A(K.counts(L).blank >= 4); });
  T('unit round-trip mm<->in', () => { [0, 99.06, 1236.98, 2133.6].forEach(v => A(near(K.toMm(K.fromMm(v, 'in'), 'in'), v, 1e-9))); });
  T('fractional formatting', () => { A(K.frac(27.5) === '27 1/2"' && K.frac(0.0625) === '1/16"' && K.frac(3) === '3"' && K.frac(9.9375) === '9 15/16"'); });
  T('same layout agrees across display units', () => { const L = mk(); L.guides.forEach(g => A(Math.abs(parseFloat(K.fmt(g.tipMm, 'in')) - g.tipMm / 25.4) <= 0.005)); });
  T('status reflects adjustments', () => { const L = mk(); A(K.status(L) === 'Reference start'); K.setPosition(L, 4, 560); A(/Adjusted: 1 guide/.test(K.status(L))); });

  T('independent integer check (tenths of an inch): stem->TT 762 = 1935.48 mm', () => { let p = STR10, acc = [p]; DG10.forEach(g => { p += g; acc.push(p); });
    const L = mk(); acc.forEach((v, i) => A(near(L.guides[i].refStemMm, v * 2.54, 1e-6), 'guide ' + i)); A(acc[9] === 762); });
  T('parseLength: mm, decimal in, fractional in, bad input', () => { A(near(K.parseLength('27 1/2', 'in'), 698.5) && near(K.parseLength('1/2"', 'in'), 12.7) && near(K.parseLength('5,9', 'in'), 149.86)
    && near(K.parseLength('12.5', 'mm'), 12.5) && isNaN(K.parseLength('abc', 'mm')) && isNaN(K.parseLength('', 'mm')) && isNaN(K.parseLength('1/0x', 'in'))); });
  T('rebase keeps manual, locked and added guides; published follow geometry', () => { let L = mk(); K.setPosition(L, 4, 560); K.toggleLock(L, 6); K.addGuide(L);
    const addedTip = L.guides[9].tipMm, lockedTip = L.guides[6].tipMm; L = K.rebase(L, { bladeLenMm: 2133.6, stemFromButtMm: 190 });
    A(L.guides.length === 11 && L.guides.filter(g => g.basis === 'added').length === 1 && near(L.guides.find(g => g.basis === 'added').tipMm, addedTip));
    const m = L.guides.find(g => g.basis === 'manual' && !g.locked); A(near(m.tipMm, 560) && near(m.refTipMm, TIP10(4) + 8.12));
    A(L.guides.some(g => g.locked && near(g.tipMm, lockedTip)) && near(L.guides[0].tipMm, TIP10(0) + 8.12) && L.guides[10].role === 'tip-top'); });
  T('rebase keeps removed guides removed and order valid', () => { let L = mk(); K.removeGuide(L); L = K.rebase(L, { bladeLenMm: 2140, stemFromButtMm: 200 });
    A(K.counts(L).blank === 8 && K.issues(L).filter(x => x.type !== 'range').length === 0); });
  const TRAINED = Object.assign({}, K.DEMO_REFERENCE, { train: 'a', trains: [{ id: 'a', label: 'Set A', models: ['A1', 'A2', 'A3'], note: 'Labels A' }, { id: 'b', label: 'Set B', models: ['B1', 'B2', 'B3'], note: 'Labels B' }] });
  T('reduction-train label sets come only from the reference; none are built in', () => { A(K.trainsOf(K.DEMO_REFERENCE).length === 0 && K.trainsOf(TRAINED).length === 2); const L = mk(); A(L.train === null && !K.applyTrain(L, 'a').ok); });
  T('train change is label-only: positions and bases untouched', () => { const L = K.createLayout(TRAINED, { bladeLenMm: 2133.6, stemFromButtMm: 198.12 }), before = L.guides.map(g => g.tipMm); A(L.train === 'a' && L.guides[0].model === 'A1'); K.applyTrain(L, 'b');
    A(L.guides[0].model === 'B1' && L.guides[1].model === 'B2' && L.guides[2].model === 'B3' && L.guides[2].unverified && L.train !== L.ref.train);
    A(L.guides.every((g, i) => g.tipMm === before[i] && g.basis === 'published')); A(K.resetAll(L).train === 'b'); });
  T('ring size parsed from model; no manufacturer heights invented', () => { A(K.ringMm('XY30H') === 30 && K.ringMm('XY6') === 6 && K.ringMm('AB5') === 5 && K.ringMm('QRS5.5') === 5.5 && K.ringMm('Running') === null && K.ringMm('x') === null);
    A(mk().guides.every(g => K.frameHeightMm(g) === null)); });
  T('compression unavailable once a guide has been added', () => { const L = mk(300); A(K.compressionAvailable(L)); K.addGuide(L); A(!K.compressionAvailable(L)); });

  // ---- Guide-count assessment regression tests ----
  const mkg = (blade, stem) => K.createLayout(K.DEMO_REFERENCE, { bladeLenMm: blade, stemFromButtMm: stem });
  const okLayout = L => K.validity(L).valid && K.issues(L).length === 0;
  const reduceSame = (L, M) => [0, 1, 2, 3].every(i => M.guides[i] === L.guides[i] || (M.guides[i].tipMm === L.guides[i].tipMm && M.guides[i].model === L.guides[i].model));
  T('R1 original 2133.6 / 198.1: valid, fits, no assessment needed', () => { const L = mkg(2133.6, 198.1), a = K.assess(L); A(K.validity(L).valid && K.geometry(L).fits && !a.needed && K.status(L) === 'Reference start'); });
  T('R2 stem 300: reference INVALID, status says so, 8 recommended over 9 and 7 (all geometrically valid)', () => { const L = mkg(2133.6, 300), a = K.assess(L), v = K.validity(L);
    A(!v.valid && v.issues.length === 2 && /Not a valid layout/.test(K.status(L)) && a.needed && a.recommended === 8);
    const c9 = a.candidates.find(c => c.n === 9), c8 = a.candidates.find(c => c.n === 8), c7 = a.candidates.find(c => c.n === 7);
    A(c8.status === 'valid' && c9.status === 'valid' && c7.status === 'valid', 'all geometrically valid, none rejected by spacing'); A(c8.excessPct < c9.excessPct && c9.excessPct < c7.excessPct, 'ranking by spacing outside published range'); });
  T('R2b candidate 8 is genuinely re-spaced (not a deleted guide), consistent and in range', () => { const L = mkg(2133.6, 300), c = K.candidate(L, 8), chokeTip = L.guides[3].tipMm;
    A(c.runners.length === 4 && near(chokeTip, TIP10(3) - 101.88, 0.05) && near(c.gapsMm.reduce((x, y) => x + y, 0), chokeTip, 1e-6));
    A(c.gapsMm.every((g, i) => i === 0 || g >= c.gapsMm[i - 1] - 1e-9), 'spacing widens toward the choke');
    A(c.minGapMm >= 96.52 - 1.27 && c.maxGapMm <= 137.16 + 2.54 && c.runners[0].tipMm > 90 && c.runners[3].tipMm < chokeTip - 90);
    const del = L.guides.filter((g, i) => i !== 8).map(g => g.tipMm); A(!c.runners.every((r, i) => near(r.tipMm, del[8 - 1 - i] === undefined ? -1 : del[8 - 1 - i], 1))); });
  T('R3 longer blank, stem shifted so reference fits: valid, no assessment', () => { const L = mkg(2200, 2200 - 1935.48), a = K.assess(L); A(K.geometry(L).fits && K.validity(L).valid && !a.needed); });
  T('R3b longer blank, same stem: tip-top short of tip is INVALID, never shown as valid', () => { const L = mkg(2200, 198.12), v = K.validity(L);
    A(!v.valid && /short of the tip/.test(v.reasons[0]) && K.assess(L).needed); });
  T('R4 shorter blank 2000: candidate 8 offered; applying yields a valid layout', () => { const L = mkg(2000, 198.12), a = K.assess(L); A(a.recommended === 8);
    A(K.applyCandidate(L, 8).ok && okLayout(L) && K.counts(L).blank === 8 && near(L.guides[L.guides.length - 1].tipMm, 0, 1e-6)); });
  T('R5 locked guide kept exactly; reduction train untouched', () => { const L = mkg(2133.6, 300); K.setPosition(L, 6, 215); K.toggleLock(L, 6); const before = L.guides[6], a = K.assess(L);
    A(a.recommended != null); const c = K.candidate(L, a.recommended); A(c.runners.some(r => r.guide === before && r.tipMm === 215));
    A(K.applyCandidate(L, a.recommended).ok && L.guides.includes(before) && before.tipMm === 215 && before.locked && okLayout(L) && L.guides.slice(0, 4).every(g => g.basis === 'published')); });
  T('R6 manual guide kept exactly and counted', () => { const L = mkg(2133.6, 300); K.setPosition(L, 4, 450); const g4 = L.guides[4], a = K.assess(L);
    A(a.recommended != null && K.applyCandidate(L, a.recommended).ok && L.guides.includes(g4) && g4.tipMm === 450 && g4.basis === 'manual' && okLayout(L)); });
  T('R7 preview is pure and cancellable: layout unchanged after assess/candidate', () => { const L = mkg(2133.6, 300), snap = JSON.stringify(L.guides);
    K.assess(L); K.candidate(L, 8); K.candidate(L, 9); A(JSON.stringify(L.guides) === snap && L.guides.length === 10); });
  T('R8 explicit acceptance: heuristic-tagged, valid, reset restores reference', () => { let L = mkg(2133.6, 300); A(K.applyCandidate(L, 8).ok);
    A(okLayout(L) && K.counts(L).blank === 8 && L.guides.filter(g => g.basis === 'heuristic').length === 5 && L.guides.every(g => g.tipMm >= -1e-6) && /Adjusted/.test(K.status(L)));
    for (let i = 0; i < L.guides.length - 1; i++) A(K.spacing(L, i) >= 15 && K.spacing(L, i) > 0); L = K.resetAll(L); A(L.guides.length === 10 && !K.validity(L).valid); });
  T('R8b geometrically valid but questionable (9): inspectable, labelled review, applicable only with explicit acknowledgement', () => { const L = mkg(2133.6, 300), c = K.candidate(L, 9);
    A(c.status === 'valid' && c.level === 'review' && c.review.findings.length === 1 && c.review.findings[0].type === 'tight'); const snap = JSON.stringify(L.guides);
    A(!K.applyCandidate(L, 9).ok && JSON.stringify(L.guides) === snap, 'refused without acknowledgement'); A(K.applyCandidate(L, 9, { acknowledgeReview: true }).ok && okLayout(L) && K.counts(L).blank === 9);
    A(K.spacingReview(L).level === 'review'); });
  T('R8c geometrically INVALID candidate refuses, layout untouched', () => { const L = mkg(2133.6, 300); K.setPosition(L, 8, 20); K.toggleLock(L, 8); K.setPosition(L, 7, 40); K.toggleLock(L, 7);
    const snap = JSON.stringify(L.guides), c = K.candidate(L, 5); A(c.status === 'invalid' && /exceed|under/.test(c.why) && !K.applyCandidate(L, 5).ok && JSON.stringify(L.guides) === snap); });
  T('R9 far-off geometry (stem 700): every count fits physically, none is recommended, all flagged for review', () => { const L = mkg(2133.6, 700), a = K.assess(L);
    A(a.needed && a.recommended === null && a.ranked.length === 0 && a.reviewable.length === a.candidates.length && /none is recommended/.test(a.reason));
    A(a.candidates.every(c => c.status === 'valid' && c.level === 'review' && c.review.findings.some(f => f.type === 'tight')));
    A(!K.applyCandidate(L, 6).ok); A(K.applyCandidate(L, 6, { acknowledgeReview: true }).ok && okLayout(L) && K.spacingReview(L).level === 'review'); });
  T('S1 geometric validity and spacing quality are independent: 2200/198 gets 10 though 7% under the published minimum', () => { const L = mkg(2200, 198.12), a = K.assess(L), c10 = a.candidates.find(c => c.n === 10);
    A(a.recommended === 10 && c10.status === 'valid' && c10.nLow >= 1 && c10.nHigh === 0 && c10.excessPct > 5 && c10.excessPct < 8); });
  T('S2 no 5% tolerance band anywhere: excess is measured from the exact published min/max', () => { const L = mkg(2133.6, 300), c = K.candidate(L, 8), r = c.refRange;
    A(near(r[0], 96.52, 1e-6) && near(r[1], 137.16, 1e-6) && c.nHigh === 1 && c.nLow === 0 && near(c.highWorstPct, (c.maxGapMm - r[1]) / r[1] * 100, 1e-9) && K.ENV_TOL === undefined); });
  T('S3 unusually large/small gaps are flagged per gap', () => { const L = mkg(2133.6, 300), c8 = K.candidate(L, 8), c9 = K.candidate(L, 9), c7 = K.candidate(L, 7);
    A(c8.flags.length === c8.gapsMm.length && c8.flags.filter(x => x === 'high').length === 1 && c8.flags[c8.flags.length - 1] === 'high');
    A(c9.nLow === 3 && c9.flags.slice(0, 3).every(x => x === 'low') && c9.nHigh === 0 && c7.nHigh === 3 && c7.nLow === 0 && c7.flags[0] === null); });
  T('S4 ranking = least excess, then mean closest to published, then more guides (explicit)', () => { const a = K.assess(mkg(2133.6, 300)); const r = a.ranked;
    for (let i = 0; i < r.length - 1; i++) A(r[i].excessPct <= r[i + 1].excessPct + 1e-6, 'excess order ' + i); A(a.recommended === r[0].n && r.every(c => c.status === 'valid')); });
  T('S5 locked + manual guides honoured together; counts consider them', () => { const L = mkg(2133.6, 300); K.setPosition(L, 4, 450); K.toggleLock(L, 7); const g4 = L.guides[4], g7 = L.guides[7], p7 = g7.tipMm, a = K.assess(L);
    A(a.recommended != null); a.ranked.forEach(c => A(c.runners.filter(r => r.guide).map(r => r.guide).includes(g4) && c.runners.filter(r => r.guide).map(r => r.guide).includes(g7)));
    A(K.applyCandidate(L, a.recommended).ok && g4.tipMm === 450 && g7.tipMm === p7 && g7.locked && okLayout(L)); });
  T('S6 selected reduction train is retained (labels and positions) through assessment and apply', () => { const L = K.createLayout(TRAINED, { bladeLenMm: 2133.6, stemFromButtMm: 300 }); K.applyTrain(L, 'b'); const before = L.guides.slice(0, 4).map(g => [g.model, g.tipMm]);
    K.applyCandidate(L, K.assess(L).recommended); A(L.train === 'b' && L.guides.slice(0, 4).every((g, i) => g.model === before[i][0] && g.tipMm === before[i][1])); });
  T('R9b reduction train off the blank: no candidates, explained', () => { const L = mkg(2133.6, 1200), a = K.assess(L); A(a.needed && a.recommended === null && a.candidates.length === 0 && /reduction train/.test(a.reason)); });
  T('R9c locked guide off the blank blocks candidates instead of hiding it', () => { const L = mkg(2133.6, 300); K.toggleLock(L, 8); const a = K.assess(L);
    A(a.recommended === null || K.applyCandidate(L, a.recommended).ok === false || okLayout(L)); A(K.validity(L).valid === false); });
  // ---- Phase 4: three separate assessments ----
  const ENVLO = 3.3 * 25.4, ENVHI = 6.5 * 25.4, PREC = K.PREC;
  T('Q1 three assessments are independent on every candidate', () => { const L = mkg(2133.6, 300), c8 = K.candidate(L, 8), c9 = K.candidate(L, 9), bad = K.candidate(L, 5);
    A(c8.geometric.valid && c8.review.findings.length === 0 && c8.level === 'suitable'); A(c9.geometric.valid && c9.review.findings.length > 0 && c9.level === 'review');
    K.setPosition(L, 8, 20); K.toggleLock(L, 8); K.setPosition(L, 7, 40); K.toggleLock(L, 7); const imp = K.candidate(L, 5); A(!imp.geometric.valid && imp.level === 'impossible' && !imp.review); void bad; });
  T('Q2 geometrically valid does NOT mean recommended (300 mm: 7 valid counts, 1 recommended)', () => { const a = K.assess(mkg(2133.6, 300)), valid = a.candidates.filter(c => c.status === 'valid');
    A(valid.length === 7 && a.ranked.length === 1 && a.recommended === 8 && a.reviewable.length === 6); });
  T('Q3 findings carry type, gap number, numbers and an implication', () => { const f = K.candidate(mkg(2133.6, 300), 9).review.findings[0], w = K.candidate(mkg(2133.6, 300), 7).review.findings[0];
    A(f.type === 'tight' && f.gap === 1 && near(f.valueMm, 82.3, 0.1) && near(f.boundMm, ENVLO, 1e-6) && f.implication.length > 40);
    A(w.type === 'wide' && w.gap === 4 && near(w.valueMm, 171.8, 0.1) && near(w.boundMm, ENVHI, 1e-6) && /poorly supported/.test(w.implication)); });
  T('Q4 only chart rounding precision (0.05 in) is allowed beyond the envelope; no percentage band', () => { const ref = K.DEMO_REFERENCE, ok = g => K.reviewGaps(ref, g).level === 'suitable';
    A(near(PREC, 1.27, 1e-9) && ok([ENVLO - 1.0, ENVHI + 1.0]) && !ok([ENVLO - 1.5]) && !ok([ENVHI + 1.5]) && ok([ENVLO, ENVHI])); });
  T('Q5 widening toward the tip is flagged; equal or precision-level differences are not', () => { const ref = K.DEMO_REFERENCE, r = g => K.reviewGaps(ref, g);
    const w = r([130, 100, 110]); A(w.level === 'review' && w.findings.some(f => f.type === 'widening' && f.gap === 1));
    A(r([100, 110, 130]).level === 'suitable' && r([100, 100, 100]).level === 'suitable' && r([100, 99.0]).level === 'suitable' && r([100, 98.0]).level === 'review'); });
  T('Q6 the loaded reference row itself passes the spacing check (sanity)', () => { const L = mkg(2133.6, 198.12), s = K.spacingReview(L); A(s.level === 'suitable' && s.findings.length === 0 && s.gapsMm.length === 6); });
  T('Q7 spacingReview flags a manually distorted working layout (tight + widening)', () => { const L = mkg(2133.6, 198.12); K.setPosition(L, 8, 150); const s = K.spacingReview(L);
    A(s.level === 'review' && s.findings.some(f => f.type === 'widening') && s.findings.some(f => f.type === 'wide' || f.type === 'tight')); });
  T('Q8 without envelope data the strict row range is used (documented fallback; 8 at 300 mm becomes review)', () => { const ref = Object.assign({}, K.DEMO_REFERENCE); delete ref.envelope;
    const L = K.createLayout(ref, { bladeLenMm: 2133.6, stemFromButtMm: 300 }), c = K.candidate(L, 8); A(c.level === 'review' && c.review.findings[0].type === 'wide' && near(c.review.envelope[1], 137.16, 1e-6)); });
  T('Q9 review candidates keep reduction train, locked and manual guides exactly', () => { const L = mkg(2133.6, 300); K.setPosition(L, 4, 450); K.toggleLock(L, 7); const g4 = L.guides[4], g7 = L.guides[7], p7 = g7.tipMm, red = L.guides.slice(0, 4).map(g => g.tipMm + g.model);
    const c = K.candidate(L, 9); A(c.status === 'valid'); A(K.applyCandidate(L, 9, { acknowledgeReview: true }).ok && L.guides.includes(g4) && L.guides.includes(g7) && g4.tipMm === 450 && g7.tipMm === p7 && g7.locked);
    A(L.guides.slice(0, 4).map(g => g.tipMm + g.model).join() === red.join() && okLayout(L)); });
  T('Q10 impossible: nothing applies, even with acknowledgement', () => { let L = mkg(2133.6, 1200); const a = K.assess(L); A(a.recommended === null && a.candidates.length === 0 && /reduction train/.test(a.reason) && !K.applyCandidate(L, 8, { acknowledgeReview: true }).ok);
    L = mkg(2133.6, 300); K.setPosition(L, 8, 20); K.toggleLock(L, 8); K.setPosition(L, 7, 40); K.toggleLock(L, 7); A(!K.applyCandidate(L, 5, { acknowledgeReview: true }).ok); });
  T('Q11 300 mm example rechecked: 8 suitable and recommended; 9 and 7 review; 12..10 and 6 review; gaps as stated', () => { const a = K.assess(mkg(2133.6, 300)), by = n => a.candidates.find(c => c.n === n);
    A(a.recommended === 8 && by(8).level === 'suitable' && near(by(8).minGapMm, 99.9, 0.1) && near(by(8).maxGapMm, 138.8, 0.1) && by(8).nHigh === 1);
    [9, 7, 10, 11, 12, 6].forEach(n => A(by(n).level === 'review', 'count ' + n)); A(near(by(9).minGapMm, 82.3, 0.1) && near(by(7).maxGapMm, 171.8, 0.1)); });
  T('SWEEP-EXTREME: 8 blanks x 9 stems incl. very short/long rods and far-off seats - invariants hold in every case', () => { let st = { suitable: 0, review: 0, impossible: 0, recommended: 0, noRec: 0, fit: 0 };
    [1200, 1500, 1800, 2000, 2133.6, 2400, 2700, 3000].forEach(b => [50, 150, 198.12, 300, 450, 700, 1000, 1300, 1700].forEach(s => { const L = mkg(b, s), a = K.assess(L);
      if (!a.needed) { st.fit++; A(okLayout(L)); return; }
      A(a.candidates.every(c => ['suitable', 'review', 'impossible'].includes(c.level)));
      A((a.recommended === null) === (a.ranked.length === 0) && a.ranked.every(c => c.level === 'suitable' && c.review.findings.length === 0 && c.status === 'valid'));
      for (let i = 0; i < a.ranked.length - 1; i++) A(a.ranked[i].excessPct <= a.ranked[i + 1].excessPct + 1e-6);
      a.recommended === null ? st.noRec++ : st.recommended++;
      a.candidates.forEach(c => { st[c.level]++; const M = mkg(b, s), plain = K.applyCandidate(M, c.n), M2 = mkg(b, s), ack = K.applyCandidate(M2, c.n, { acknowledgeReview: true });
        if (c.level === 'suitable') { A(plain.ok && okLayout(M) && K.spacingReview(M).level === 'suitable' && M.guides.every(g => g.tipMm >= -1e-6)); }
        else if (c.level === 'review') { A(c.status === 'valid' && c.review.findings.length > 0 && !plain.ok && ack.ok && okLayout(M2) && K.spacingReview(M2).level === 'review'); }
        else { A(!plain.ok && !ack.ok && !K.validity(M2).valid); } }); }));
    results.sweep = st; A(st.suitable > 0 && st.review > 0 && st.noRec > 0 && st.recommended > 0); });

  // ---- Builder-entered chart measurements (the only way real chart data enters the tool) ----
  const ENTRY = { unit: 'in', label: 'My 7 ft', stripper: 26.5, gaps: [9.2, 7, 6, 5.4, 5, 4.7, 4.4, 4.2, 3.8] };
  T('referenceFromEntry builds a reference from builder numbers; flagged as the builder\'s own, not verified', () => { const r = K.referenceFromEntry(ENTRY); A(r.ok && r.ref && !r.ref.demo && r.ref.gapsIn.length === 9 && r.ref.stripperIn === 26.5);
    const L = K.createLayout(r.ref, { bladeLenMm: 2133.6, stemFromButtMm: 198.12 }); A(K.counts(L).total === 10 && near(L.guides[0].tipMm, TIP10(0)) && K.validity(L).valid); });
  T('referenceFromEntry accepts millimetres and matches the same chart in inches', () => { const a = K.referenceFromEntry(ENTRY).ref, b = K.referenceFromEntry({ unit: 'mm', stripper: 26.5 * 25.4, gaps: ENTRY.gaps.map(g => g * 25.4) }).ref;
    a.gapsIn.forEach((g, i) => A(near(g, b.gapsIn[i], 1e-9))); A(near(a.stripperIn, b.stripperIn, 1e-9)); });
  T('referenceFromEntry rejects too few, non-numeric, zero/negative and too many gaps, with a reason', () => {
    [{ unit: 'in', stripper: 26, gaps: [8, 6] }, { unit: 'in', stripper: 26, gaps: [8, 'x', 5, 4] }, { unit: 'in', stripper: 26, gaps: [8, 0, 5, 4] }, { unit: 'in', stripper: 26, gaps: [8, -1, 5, 4] },
      { unit: 'in', stripper: NaN, gaps: [8, 6, 5, 4] }, { unit: 'in', stripper: 26, gaps: new Array(40).fill(4) }].forEach((e, i) => { const r = K.referenceFromEntry(e); A(!r.ok && typeof r.msg === 'string' && r.msg.length > 5, 'case ' + i); }); });
  T('entered reference is neutral: generic guide labels, no manufacturer model codes, no built-in envelope claimed as verified', () => { const r = K.referenceFromEntry(ENTRY).ref;
    A(r.guides.every(g => /^(Stripper|Reduction \d|Choke|Running|Tip-top)$/.test(g.model)) && K.trainsOf(r).length === 0 && !(r.envelope && r.envelope.verified)); });
  T('the demonstration reference is labelled invented and carries an unverified-guide flag', () => { A(K.DEMO_REFERENCE.demo === true && /invented/i.test(K.DEMO_REFERENCE.source) && K.DEMO_REFERENCE.guides.some(g => g.unverified)); });
  const failed = results.filter(r => !r.ok);
  if (typeof module !== 'undefined' && typeof require !== 'undefined' && require.main === module) {
    if (results.sweep) console.log('sweep:', JSON.stringify(results.sweep)); results.forEach(r => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.msg ? ' :: ' + r.msg : '')));
    console.log(results.length - failed.length + '/' + results.length + ' passed'); process.exit(failed.length ? 1 : 0);
  } else root.KR_TESTS = results;
})(typeof window !== 'undefined' ? window : globalThis);
