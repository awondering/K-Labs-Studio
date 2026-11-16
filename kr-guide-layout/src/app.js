(function () {
  'use strict'; const K = KR, $ = s => document.querySelector(s), IN = K.IN;
  const S = { unit: 'mm', rod: K.DEFAULT_ROD, blade: 0, stem: 0, axle: null, spool: null, ref: K.referenceForRod(K.DEFAULT_ROD), entry: { label: '', stripper: '', gaps: '', models: '', chokeBeyond: '', envMin: '', envMax: '' }, entryMsg: '', sel: 0, prev: false, train: null, confirm: false, cand: null, msg: '', done: { st: false, cast: false } };
  let L;
  // Choosing a chart rod sets the blank to that rod length and the reel stem to the position at which the chart fits exactly (blank minus the chart's
  // stem-to-tip-top distance). That position is derived, not a Fuji figure; the builder replaces it with the real reel-seat position.
  const pickRod = id => { const r = K.CHART_RODS.find(x => x.id === id), ref = K.referenceForRod(id); S.rod = id; S.ref = ref; S.blade = r.lengthMm; S.stem = r.lengthMm - K.buildReference(ref).totalMm; S.train = null; S.entryMsg = ''; };
  pickRod(S.rod);
  const geom = () => ({ bladeLenMm: S.blade, stemFromButtMm: S.stem });
  const build = () => { L = K.createLayout(S.ref, geom(), S.train); S.train = L.train; S.sel = Math.min(S.sel, L.guides.length - 1); S.prev = false; S.cand = null; };
  const rebuild = () => { L = K.rebase(L, geom()); S.sel = Math.min(S.sel, L.guides.length - 1); S.prev = false; S.cand = null; };
  const step = () => (S.unit === 'mm' ? 1 : IN / 16);
  const inV = mm => (mm == null ? '' : S.unit === 'mm' ? mm.toFixed(1) : (mm / IN).toFixed(3));
  const parse = v => K.parseLength(v, S.unit);
  const f = mm => K.fmt(mm, S.unit);
  const BASIS = { published: 'reference', heuristic: 'calculated', experimental: 'calculated \u00b7 experimental', manual: 'adjusted', added: 'added' };
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const unitName = () => (S.unit === 'mm' ? 'mm' : 'in');
  const num = (k, mm, aria) => `<div class="num"><button type="button" data-st="-1" data-k="${k}" aria-label="Decrease ${aria}">\u2212</button><input data-k="${k}" inputmode="decimal" value="${inV(mm)}" aria-label="${aria} (${unitName()})"><button type="button" data-st="1" data-k="${k}" aria-label="Increase ${aria}">+</button></div>`;
  const val = k => (k === 'blade' ? S.blade : k === 'stem' ? S.stem : k === 'axle' ? S.axle : k === 'spool' ? S.spool : L.guides[+k.slice(1)].tipMm);
  function apply(k, mm) {
    S.msg = '';
    if (k === 'blade' || k === 'stem') { if (!(mm > 0)) { S.msg = 'Enter a positive length'; return; } S[k] = mm; rebuild(); }
    else if (k === 'axle' || k === 'spool') S[k] = isFinite(mm) ? mm : null;
    else { const i = +k.slice(1), r = K.setPosition(L, i, mm); if (!r.ok) S.msg = r.msg; }
  }
  const ROLE = { stripper: '#e14a58', reduction: '#b42736', choke: '#ada99d', running: '#7f9aa6', 'tip-top': '#ddd6c9' }, ROLE_NAME = { stripper: 'Stripper', reduction: 'Reduction', choke: 'Choke', running: 'Running', 'tip-top': 'Tip-top' };
  function svg(g, pv, cv) {
    const gs = L.guides, tips = gs.map(x => x.tipMm).concat(pv ? pv.positions.filter(p => p != null) : []);
    const minX = Math.min(0, ...tips) - 8, maxX = L.geom.bladeLenMm, X = x => 14 + (maxX - x) / (maxX - minX) * 332, y0 = 100;
    // SCHEMATIC heights: role order only. No verified manufacturer frame heights are held, so none are drawn to scale.
    const H = (x, i) => { const hv = K.frameHeightMm(x); if (hv != null) return hv; return x.role === 'stripper' ? 44 : x.role === 'reduction' ? (i === 1 ? 36 : 30) : x.role === 'choke' ? 24 : 18; };
    const R = x => Math.min(7, Math.max(2.8, 2.5 + (K.ringMm(x.model) || 4.5) * 0.18));
    let s = `<svg viewBox="0 0 360 138" role="img" aria-label="Schematic side view of blank and guide positions, tip on the right">`;
    s += `<line x1="${X(maxX)}" x2="${X(0)}" y1="${y0}" y2="${y0}" stroke="#ada99d" stroke-width="3" stroke-linecap="round"/>`;
    if (Math.min(...tips) < -1e-6) s += `<rect x="${X(0)}" y="30" width="${X(minX) - X(0)}" height="${y0 - 26}" fill="#2a1213" opacity=".6"/><text x="${X(0) + 3}" y="28" style="fill:#e14a58">off blank</text>`;
    s += `<line x1="${X(L.stemToTip)}" x2="${X(L.stemToTip)}" y1="${y0 - 8}" y2="${y0 + 8}" stroke="#4b5154" stroke-width="2"/><text x="${X(L.stemToTip) - 8}" y="${y0 + 18}">stem</text>`;
    s += `<text x="${X(maxX) - 4}" y="${y0 + 18}">butt</text><text x="${X(0) - 6}" y="${y0 + 18}">tip</text>`;
    if (pv) pv.positions.forEach((p, j) => { if (p != null) s += `<circle cx="${X(p)}" cy="${y0 - H(gs[j], j)}" r="${R(gs[j])}" fill="none" stroke="#c9a24a" stroke-dasharray="2 2"/>`; });
    if (cv && cv.runners) cv.runners.forEach(r => { if (!r.guide) s += `<circle cx="${X(r.tipMm)}" cy="${y0 - 18}" r="3.3" fill="none" stroke="#c9a24a" stroke-width="1.4" stroke-dasharray="2 2"/>`; });
    gs.forEach((x, i) => {
      const off = x.tipMm < -1e-6, on = i === S.sel, cx = X(x.tipMm), h = H(x, i), cy = y0 - h, r = R(x) + (on ? 1.2 : 0), col = off ? '#e14a58' : ROLE[x.role];
      const fill = x.role === 'tip-top' ? 'none' : col;
      s += `<g class="g${on ? ' sel' : ''}" data-i="${i}"${cv && x.role === 'running' && !x.locked && x.basis !== 'manual' ? ' opacity=".3"' : ''}><rect x="${cx - 8}" y="${cy - r - 14}" width="16" height="${h + r + 16}" fill="transparent"/>
<line x1="${cx}" x2="${cx}" y1="${cy}" y2="${y0}" stroke="${col}" stroke-width="1" ${off ? 'stroke-dasharray="2 2"' : ''}/>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${on ? '#ddd6c9' : x.role === 'tip-top' || x.role === 'choke' ? col : 'none'}" stroke-width="${on ? 1.4 : 1.2}"/>
<text x="${cx}" y="${cy - r - 4}" text-anchor="middle">${K.label(L, i).replace('#', '')}</text></g>`;
    });
    const i = S.sel;
    [[i - 1, i, 'end', -3], [i, i + 1, 'start', 3]].forEach(([p, q, an, dx]) => { if (gs[p] && gs[q]) { const x1 = X(gs[p].tipMm), x2 = X(gs[q].tipMm);
      s += `<line x1="${x1}" x2="${x2}" y1="124" y2="124" stroke="#6f736d"/><text x="${X(gs[i].tipMm) + dx}" y="135" text-anchor="${an}" style="fill:#ddd6c9">${f(gs[p].tipMm - gs[q].tipMm)}</text>`; } });
    return s + '</svg>';
  }
  function render() {
    const g = K.geometry(L), c = K.counts(L), x = K.crossCheck(S.ref), v = K.validity(L), is = v.issues, as = K.assess(L); if (!as.needed) S.cand = null; const cv = S.cand != null ? K.candidate(L, S.cand) : null, pv = S.prev && !g.fits && as.needed ? K.compressionPreview(L) : null;
    const sel = S.sel, t = L.guides[sel], un = unitName(), U = S.unit === 'frac' ? '' : ' ' + unitName();
    const rec = as.needed && as.recommended != null ? as.ranked[0] : null;
    const findTxt = fd => fd.type === 'widening' ? `Gap ${fd.gap} from the tip (${f(fd.valueMm)}${U}) is wider than gap ${fd.gap + 1} (${f(fd.boundMm)}${U}). ${fd.implication}` : `Gap ${fd.gap} from the tip is ${f(fd.valueMm)}${U}; the chart ${fd.type === 'tight' ? 'never goes below' : 'never goes above'} ${f(fd.boundMm)}${U}. ${fd.implication}`;
    const rv = L.guides.some(g => g.basis === 'heuristic') ? K.spacingReview(L) : null;
    const sum = k => `gaps ${f(k.minGapMm)}\u2013${f(k.maxGapMm)}${U} vs published ${f(k.refRange[0])}\u2013${f(k.refRange[1])}: ` + (k.withinPublished ? 'all inside the published range' : [k.nLow ? `${k.nLow} below (worst ${k.lowWorstPct.toFixed(0)}%)` : '', k.nHigh ? `${k.nHigh} above (worst ${k.highWorstPct.toFixed(0)}%)` : ''].filter(Boolean).join(', '));
    const row = i => { const q = L.guides[i], sp = K.spacing(L, i);
      return `<div class="row${i === sel ? ' sel' : ''}${q.locked ? ' lk' : ''}" data-i="${i}"><div class="id"><b class="r-${q.role}">${K.label(L, i)}</b>${is.some(z => z.i === i && z.type === 'range') ? '<i class="tag off">off blank</i>' : `<i class="tag ${q.basis}">${BASIS[q.basis] || q.basis}</i>`}<span>${q.model}${q.unverified ? ' \u00b7 ' + (q.unverifiedNote || 'unverified') : ''}</span></div>
${num('g' + i, q.tipMm, K.label(L, i) + ' position from tip')}<div class="sp">${sp == null ? '\u2014' : f(sp)}</div>
<div class="ac"><button type="button" data-lock="${i}" aria-pressed="${q.locked}">${q.locked ? 'Locked' : 'Lock'}</button><button type="button" data-reset="${i}"${q.refTipMm == null ? ' disabled' : ''}>Ref</button></div></div>`; };
    let rows = ''; for (let i = L.guides.length - 1; i >= 0; i--) rows += row(i);
    const ax = S.axle != null ? ` \u00b7 beyond axle tip <b>${f(K.fromStem(L, sel) - S.axle)}</b>` : '';
    $('#app').innerHTML = `<h1>KR Guide Layout</h1><p class="sub">${S.ref.chart ? 'Stripper, reduction train, choke point and running guides for your rod, from the Fuji KR chart.' : 'Guide layout from your own chart measurements.'}</p>
<section class="card col-a"><h2>Rod and reel</h2><div class="mut">Chart rod length</div><div class="seg wrap" role="group" aria-label="Chart rod length">${K.CHART_RODS.map(r => `<button data-rod="${esc(r.id)}" aria-pressed="${S.ref.chart && S.rod === r.id}">${r.label}</button>`).join('')}</div>
<div class="grid" style="margin-top:10px"><label class="f">Blank length${num('blade', S.blade, 'Blank length')}</label><label class="f">Reel stem from butt${num('stem', S.stem, 'Reel stem from butt')}</label></div>
<div class="seg" role="group" aria-label="Units"><button data-unit="mm" aria-pressed="${S.unit === 'mm'}">mm</button><button data-unit="in" aria-pressed="${S.unit === 'in'}">Decimal in</button><button data-unit="frac" aria-pressed="${S.unit === 'frac'}">Fractional in</button></div>
<details><summary>Optional measurements</summary><div class="grid"><label class="f">Stem to spool axle tip${num('axle', S.axle, 'Stem to spool axle tip')}</label><label class="f">Spool diameter${num('spool', S.spool, 'Spool diameter')}</label></div>
<p class="note">Choosing a rod fills in its chart length and the reel-stem position at which the chart fits exactly; replace that with your real reel-seat position. The chart uses only blank length and stem position. Axle offset adds a datum view; spool diameter isn\u2019t used yet.</p></details></section>
${g.fits && v.valid ? '' : `<section class="card warn col-a"><h2>${as.needed ? 'Reference layout does not fit' : 'Working layout differs from the reference'}</h2>
${as.needed ? `<p><b>Current:</b> ${c.blank} + tip-top \u2014 invalid geometry. ${v.reasons.slice(0, 2).join('; ')}.</p>
${rec ? `<p><b>Suggested:</b> ${rec.n} + tip-top \u2014 starting recommendation (K-Labs heuristic, not a Fuji layout).</p>
<p class="note"><b>Why ${rec.n}:</b> it fits, every runner gap is within what the chart publishes and narrows toward the tip, and it deviates least from this rod\u2019s chart row. ${sum(rec)}.${as.ranked.length > 1 ? ' Also suitable: ' + as.ranked.slice(1, 3).map(k => k.n).join(', ') + '.' : ''}${as.reviewable.length ? ' Needs manual review: ' + as.reviewable.map(k => k.n + ' (' + k.review.findings.length + ')').join(', ') + '.' : ''}</p>`
 : as.reviewable.length ? `<p><b>No recommended count.</b> ${as.reason}</p>` : `<p><b>No geometrically valid candidate.</b> ${as.reason}</p>`}
${as.candidates.length ? `<div class="bar" role="group" aria-label="Guide counts compared">${as.candidates.map(k => `<button class="btn sm" data-cand="${k.n}" aria-pressed="${S.cand === k.n}" title="${k.level === 'impossible' ? k.why : k.level === 'review' ? 'Manual review' : 'Suitable'}">${k.n}${k.n === as.recommended ? ' \u2605' : ''}${k.level === 'impossible' ? ' \u2717' : k.level === 'review' ? ' \u00b7 review' : ''}</button>`).join('')}</div>
<details><summary>Counts compared</summary>${as.candidates.map(k => `<p class="note">${k.n} + tip-top \u00b7 ${k.level === 'impossible' ? 'impossible: ' + k.why : (k.level === 'suitable' ? 'suitable. ' : 'manual review (' + k.review.findings.length + ' finding' + (k.review.findings.length > 1 ? 's' : '') + '). ') + sum(k)}</p>`).join('')}<p class="note">Three separate checks. Geometry: every guide on the blank, in order, at least ${K.MIN_GAP} mm apart. Spacing: each runner gap within the smallest\u2013largest runner gap the chart publishes for any rod (${f(as.candidates.find(k => k.review) ? as.candidates.find(k => k.review).review.envelope[0] : 0)}\u2013${f(as.candidates.find(k => k.review) ? as.candidates.find(k => k.review).review.envelope[1] : 0)}${U}, \u00b1${f(K.PREC)}${U} chart rounding) and narrowing toward the tip. Only counts passing both are recommended.</p></details>` : ''}
${cv && cv.runners ? `<p class="note"><b>${cv.n} + tip-top \u2014 ${cv.level === 'impossible' ? 'impossible' : cv.level === 'review' ? 'manual review, not recommended' : 'suitable'}</b>${cv.level === 'impossible' ? ': ' + cv.why : ' \u00b7 ' + sum(cv)}</p>
${cv.level === 'review' ? cv.review.findings.slice(0, 3).map(fd => `<p class="note">${findTxt(fd)}</p>`).join('') + (cv.review.findings.length > 3 ? `<p class="note">+${cv.review.findings.length - 3} more.</p>` : '') : ''}
${cv.status === 'valid' ? `<p class="note">Gaps from the tip: ${cv.gapsMm.map((g, i) => f(g) + (cv.flags[i] === 'high' ? '\u2191' : cv.flags[i] === 'low' ? '\u2193' : '')).join(' \u00b7 ')}${U}. \u2191 above, \u2193 below this row\u2019s published range. Reduction train and locked/manual guides unchanged.</p>` : ''}
<div class="bar"><button class="btn sm${cv.level === 'suitable' ? ' pri' : ''}" data-candapply ${cv.status === 'valid' ? '' : 'disabled'}>${cv.level === 'review' ? 'Apply ' + cv.n + ' for manual review' : 'Apply ' + cv.n + ' + tip-top'}</button><button class="btn sm" data-candcancel>Cancel preview</button></div>` : rec ? `<div class="bar"><button class="btn sm" data-cand="${rec.n}">Preview ${rec.n} + tip-top</button></div>` : ''}
<p class="note">Starting recommendation only. Changing the guide count changes blank support and tip spacing: verify by static-load and cast testing.</p>` : `<p>The working layout is valid but the chart reference needs ${f(L.refTotalMm)} from stem to tip-top and this blank gives ${f(L.stemToTip)}.</p>`}
<div class="bar"><button class="btn sm" data-fit>Set stem to ${f(g.suggestStemFromButtMm)}</button>${as.needed && K.compressionAvailable(L) ? `<button class="btn sm" data-prev>${S.prev ? 'Hide' : 'Preview'} runner-gap scaling</button>` : ''}${pv ? '<button class="btn sm pri" data-compress>Apply scaling (experimental)</button>' : ''}</div>
${pv ? `<p class="note">Experimental, not Fuji\u2019s method: runner gaps scaled by ${pv.k.toFixed(3)}, smallest gap ${f(pv.minGapMm)}. #1\u2013#4 stay put.</p>` : ''}</section>`}
<section class="card col-a"><h2>KR layout</h2><div class="sumrow">${(() => { const gs = L.guides, ci = gs.findIndex(q => q.role === 'choke'), red = gs.filter(q => q.role === 'stripper' || q.role === 'reduction'), run = gs.filter(q => q.role === 'running'), idx = q => gs.indexOf(q), bs = q => `<i class="tag ${q.basis}">${BASIS[q.basis] || q.basis}</i>`;
  const line = (cls, name, q, extra) => `<div class="sl"><span class="dot r-${cls}"></span><b>${name}</b><span>${extra}</span></div>`;
  const at = q => `${K.label(L, idx(q))} \u00b7 ${f(K.fromStem(L, idx(q)))} from stem \u00b7 ${f(q.tipMm)} from tip`;
  return line('stripper', 'Stripper', gs[0], `${gs[0].model} \u00b7 ${at(gs[0])} ${bs(gs[0])}`)
    + `<div class="sl"><span class="dot r-reduction"></span><b>Reduction train</b><span>${red.map(q => q.model).join(' \u00b7 ')}${gs[2] && gs[2].unverified ? ' (third guide unverified)' : ''}</span></div>`
    + (ci >= 0 ? line('choke', 'Choke point', gs[ci], `${gs[ci].model} \u00b7 ${at(gs[ci])} ${bs(gs[ci])}`) : '')
    + `<div class="sl"><span class="dot r-running"></span><b>Running guides</b><span>${run.length} \u00b7 spacing ${run.length ? f(Math.min(...gs.slice(ci).map((q, k, a) => (k ? a[k - 1].tipMm - q.tipMm : Infinity)))) + '\u2013' + f(Math.max(...gs.slice(ci).map((q, k, a) => (k ? a[k - 1].tipMm - q.tipMm : 0)))) + U : '\u2014'} (choke to tip-top)</span></div>`; })()}</div>
<p class="note">Tags: <b>reference</b> = the chart\u2019s own distance, <b>calculated</b> = placed by K-Labs, <b>adjusted</b> = moved by you.</p></section>
<section class="card col-b"><h2>Layout from the tip</h2>${svg(g, pv, cv)}<div class="legend">${Object.keys(ROLE).map(k => `<span><i class="dot r-${k}"></i>${ROLE_NAME[k]}</span>`).join('')}</div><p class="note">Tip on the right. Ring size is drawn to relative scale. Heights show role order only; they are not frame dimensions, because verified manufacturer heights aren\u2019t held.</p></section>
<section class="card col-b"><h2>Guides</h2>${K.trainsOf(S.ref).length ? `<div class="mut">Reduction train</div><div class="seg" role="group" aria-label="Reduction train">${K.trainsOf(S.ref).map(tr => `<button data-train="${tr.id}" aria-pressed="${L.train === tr.id}">${tr.label}</button>`).join('')}</div><p class="note">${K.trainsOf(S.ref).find(tr => tr.id === L.train).note || 'Labels only'}. Labels only: positions follow your measurements.${L.train !== S.ref.train ? ' <b style="color:var(--warn)">Differs from this reference\u2019s train.</b>' : ''}</p>` : (S.ref.chart ? '<p class="note">Guide models and ring sizes follow the chart row. The chart\u2019s distances are the reference positions; use + and \u2212 or type a value to adjust one guide without moving the others.</p>' : '<p class="note">Guide models are labels from your entry; positions follow your measurements. The tool does not verify them.</p>')}
<div class="grid" style="margin-top:10px"><div><div class="mut">Blank guides (excl. tip-top)</div><div class="num"><button data-cnt="-1" aria-label="Remove a blank guide">\u2212</button><input readonly value="${c.blank}" aria-label="Blank guide count"><button data-cnt="1" aria-label="Add a blank guide">+</button></div></div>
<div class="mut" style="align-self:end">Tip-top 1 \u00b7 total ${c.total}${c.differs ? `<br><b style="color:var(--warn)">${c.delta > 0 ? '+' : ''}${c.delta} vs reference (${c.refBlank} + tip-top)</b>` : '<br>Matches reference'}</div></div>
${S.msg ? `<p class="err" role="alert">${S.msg}</p>` : ''}
<div class="hd" style="margin-top:10px"><span>Guide</span><span>From tip (${un})</span><span>Spacing</span><span></span></div>${rows}
<p class="sel-info"><b>${K.label(L, sel)} ${t.model}</b> \u00b7 from stem <b>${f(K.fromStem(L, sel))}</b> \u00b7 from butt <b>${f(K.fromButt(L, sel))}</b>${ax}${t.refTipMm != null ? ' \u00b7 reference <b>' + f(t.refTipMm) + '</b>' : ''}</p>
${t.unverified ? '<p class="note">' + (t.role === 'reduction' ? 'This is the third reduction guide. Its model is a label only and its frame designation has not been verified: check it against the manufacturer\u2019s own data.' : 'This guide\u2019s designation is unverified.') + '</p>' : ''}
${is.filter(q => q.type !== 'range').map(q => `<p class="err">${q.msg}</p>`).join('')}
<div class="bar"><button class="btn sm${S.confirm ? ' pri' : ''}" data-resetall>${S.confirm ? 'Tap again to reset all guides' : 'Reset all to reference'}</button></div></section>
<section class="card col-a"><h2>Status</h2><p style="margin:0 0 6px${v.valid ? '' : ';color:#e14a58'}">${K.status(L)}</p>
<label class="chk"><input type="checkbox" data-done="st" ${v.valid ? '' : 'disabled'} ${S.done.st ? 'checked' : ''}>Static-load tested by builder</label><label class="chk"><input type="checkbox" data-done="cast" ${v.valid ? '' : 'disabled'} ${S.done.cast ? 'checked' : ''}>Cast tested by builder</label>
${rv ? (rv.level === 'review' ? `<p class="note" style="color:var(--warn)"><b>Manual review needed:</b> ${findTxt(rv.findings[0])}${rv.findings.length > 1 ? ' (+' + (rv.findings.length - 1) + ' more)' : ''}</p>` : '<p class="note">Runner spacing is within what the chart publishes and narrows toward the tip.</p>') : ''}
<p class="note">${S.done.st && S.done.cast ? 'Builder-attested only. The calculator can\u2019t verify results.' : 'A starting layout, not final or optimal. Verify with static-load and casting tests before wrapping.'}</p></section>
<section class="card col-b"><h2>Sources and limits</h2><p class="mut">Reference: ${S.ref.chart ? 'Fuji KR Concept chart row for ' + esc(S.rod) : 'the spacing between guides in your chart' + (S.ref.label ? ' (\u201c' + esc(S.ref.label) + '\u201d)' : '')}. The chart\u2019s choke-distance table is kept as a separate cross-check, never combined with the spacing${x ? ': ' + f(x.tableMm) + ' vs ' + f(x.chainMm) + ' from the stem' + (x.agrees ? ', in agreement' : ', ' + f(x.deltaMm) + ' apart. This layout uses the spacing diagram') : ''}.</p>
<details id="entrybox"${S.entryMsg || !S.ref.chart ? ' open' : ''}><summary>Other rod: enter your own measurements</summary>
<p class="note">For a rod not in the chart, type the distances from your own chart. They are not saved or sent anywhere; enter them again next time.</p>
<div class="grid"><label class="f">Label (optional)<input class="tin" data-e="label" value="${esc(S.entry.label)}" autocomplete="off" maxlength="60"></label><label class="f">Reel stem to first guide (${un})<input class="tin" data-e="stripper" inputmode="decimal" value="${esc(S.entry.stripper)}" autocomplete="off"></label></div>
<label class="f">Gaps from guide #1 toward the tip-top, in order (${un}), separated by spaces or commas<input class="tin" data-e="gaps" inputmode="decimal" value="${esc(S.entry.gaps)}" autocomplete="off" placeholder="one gap per guide after the first"></label>
<p class="note">The first gap is #1 to #2, and the last gap ends at the tip-top. Roles are assumed in this order: stripper, two more reduction guides, choke guide, running guides, tip-top (at least 5 guides).</p>
<label class="f">Guide models, optional (one per guide, same order, separated by commas)<input class="tin" data-e="models" value="${esc(S.entry.models)}" autocomplete="off"></label>
<div class="grid"><label class="f">Choke distance from the stem, optional cross-check (${un})<input class="tin" data-e="chokeBeyond" inputmode="decimal" value="${esc(S.entry.chokeBeyond)}" autocomplete="off"></label><span></span></div>
<div class="grid"><label class="f">Smallest runner gap in your chart, optional (${un})<input class="tin" data-e="envMin" inputmode="decimal" value="${esc(S.entry.envMin)}" autocomplete="off"></label><label class="f">Largest runner gap in your chart, optional (${un})<input class="tin" data-e="envMax" inputmode="decimal" value="${esc(S.entry.envMax)}" autocomplete="off"></label></div>
<p class="note">The smallest and largest runner gap let the tool judge a different guide count against your chart. Leave them blank and it uses the range of this rod&rsquo;s own gaps. The choke distance is only used to flag a disagreement with the spacing you entered.</p>
${S.entryMsg ? `<p class="err">${esc(S.entryMsg)}</p>` : ''}
<div class="bar"><button class="btn sm pri" data-applyentry>Use my measurements</button>${S.ref.chart ? '' : '<button class="btn sm" data-usedemo>Back to chart rod</button>'}</div>
<p class="note">${esc(S.ref.source)}</p>
<details><summary>Advanced: reference as JSON</summary><textarea id="refjson" spellcheck="false" aria-label="Reference data JSON">${JSON.stringify(S.ref, null, 1).replace(/</g, '&lt;')}</textarea>
<div class="bar"><button class="btn sm" data-applyref>Apply values</button></div></details></details></section>
<details class="about col-all"><summary>About this calculator</summary>
<p class="note">KR Guide Layout is an independent K-Labs Studio tool. It is not affiliated with or endorsed by Fuji; manufacturer names are used descriptively.${S.ref.chart ? ' The reference distances are Fuji\u2019s published KR Concept chart values, transcribed by K-Labs and not changed. The layout, guide counts, fit checks and scaling built on them are K-Labs calculations, not Fuji specifications.' : ' The reference distances are the measurements you typed in.'}</p>
<p class="note"><b>Assumptions and limits.</b> Positions are ring centres measured from the blank tip (ring offset assumed 0), so do not use them to mark foot placement. The 15 mm minimum clearance is a working assumption. Layouts are starting points and have not been bench, static-load or casting tested.</p>
<p class="note"><b>Unverified.</b> ${S.ref.chart ? 'The frame designation of the third reduction guide. ' : ''}Whether the chart measures to the ring centre or the ring base, and whether its rod length is the blank or the finished rod.</p>
<p class="note">Workshop prototype for internal testing.</p></details>`;
  }
  const A = document;
  A.addEventListener('click', e => {
    const b = e.target.closest('button,[data-i]'); if (!b) return; const d = b.dataset; if (d.resetall == null) S.confirm = false;
    if (d.st) { const k = d.k, cur = val(k) == null ? 0 : val(k); apply(k, cur + (+d.st) * step()); }
    else if (d.unit) S.unit = d.unit;
    else if (d.lock != null) K.toggleLock(L, +d.lock);
    else if (d.reset != null) { const r = K.resetGuide(L, +d.reset); S.msg = r.ok ? '' : r.msg; }
    else if (d.resetall != null) { if (!S.confirm) S.confirm = true; else { L = K.resetAll(L); S.msg = ''; S.prev = false; S.confirm = false; } }
    else if (d.cand) S.cand = +d.cand;
    else if (d.candcancel != null) S.cand = null;
    else if (d.candapply != null) { const r = K.applyCandidate(L, S.cand, { acknowledgeReview: true }); S.msg = r.ok ? '' : r.msg; S.cand = null; S.sel = Math.min(S.sel, L.guides.length - 1); }
    else if (d.train) { K.applyTrain(L, d.train); S.train = d.train; }
    else if (d.fit != null) { S.stem = L.geom.bladeLenMm - L.refTotalMm; rebuild(); }
    else if (d.prev != null) S.prev = !S.prev;
    else if (d.compress != null) { const r = K.applyCompression(L); S.msg = r.ok ? '' : r.msg; S.prev = false; }
    else if (d.cnt) { const r = +d.cnt > 0 ? K.addGuide(L) : K.removeGuide(L); S.msg = r.ok ? '' : r.msg; }
    else if (d.applyentry != null) { const E = S.entry, parseU = v => { const m = K.parseLength(v, S.unit); return isFinite(m) ? m : NaN; }, list = v => String(v).split(/[\s,;]+/).filter(Boolean);
      const gaps = list(E.gaps).map(parseU), one = v => (String(v).trim() === '' ? null : parseU(v));
      if (gaps.some(g => !isFinite(g)) || !isFinite(parseU(E.stripper))) S.entryMsg = 'Check the numbers: use plain decimals' + (S.unit === 'frac' ? ' or fractions such as 5 1/2' : '') + ' separated by spaces or commas.';
      else { const r = K.referenceFromEntry({ label: E.label, unit: 'mm', stripper: parseU(E.stripper), gaps, models: E.models.trim() ? E.models.split(',') : [], chokeBeyond: one(E.chokeBeyond), envelopeMin: one(E.envMin), envelopeMax: one(E.envMax) });
        if (!r.ok) S.entryMsg = r.msg; else { S.ref = r.ref; S.train = null; S.entryMsg = ''; build(); S.msg = ''; } } }
    else if (d.usedemo != null) { pickRod(S.rod); build(); S.msg = ''; }
    else if (d.rod != null) { pickRod(d.rod); build(); S.msg = ''; S.sel = 0; }
    else if (d.applyref != null) { try { const r = JSON.parse($('#refjson').value);
        if (!r.guides || r.gapsIn.length !== r.guides.length - 1) throw new Error('gapsIn must have one entry fewer than guides'); S.ref = r; build(); S.msg = ''; } catch (er) { S.msg = 'Reference values: ' + er.message; } }
    else if (d.i != null && !e.target.closest('input')) S.sel = +d.i; else return;
    render();
  });
  A.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.e) S.entry[t.dataset.e] = t.value; });
  A.addEventListener('change', e => { const t = e.target;
    if (t.dataset.done) { S.done[t.dataset.done] = t.checked; }
    else if (t.dataset.k) { const k = t.dataset.k; apply(k, t.value.trim() === '' && (k === 'axle' || k === 'spool') ? NaN : parse(t.value)); if (k[0] === 'g') S.sel = +k.slice(1); }
    else return; render(); });
  A.addEventListener('focusin', e => { const r = e.target.closest('.row'); if (r && +r.dataset.i !== S.sel) { S.sel = +r.dataset.i; } });
  build(); render();
})();
