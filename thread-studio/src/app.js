/* K-Labs Thread Design Studio: UI. All design logic lives in engine.js. */
(function () {
  'use strict';
  const T = THREAD, TAU = Math.PI * 2, $ = (s, r) => (r || document).querySelector(s), app = $('#app');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const S = { screen: 'home', d: null, hist: null, sel: 1, view: { z0: 0, rot: 0 }, step: 0, steps: [], note: '', geom: null, L: null };
  window.__ts = S;
  // Hosted inside K-Labs Studio the host injects window.__TDS_HOST__ = {scope}; storage keys then carry the account scope (same ":<account>" convention as the Studio's builds). Standalone keeps the plain keys.
  const HOST = window.__TDS_HOST__ || null, SCOPE = HOST && HOST.scope ? ':' + HOST.scope : '';
  const KEY = 'ktds.design.v1' + SCOPE;
  const store = { get() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }, set(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { } } };
  const hexes = d => d.slots.map(id => T.thread(id).hex);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = v => (Math.round(v * 10) / 10).toString();

  // ---------- rod drawing ----------
  const rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const BARE = [38, 41, 45];
  function drawRod(cv, L, opt) {                 // opt: {z0, rot, win (mm), limitZ, h (css px)}
    const d = L.d, dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 360, ch = Math.round((opt.h || 130) * (cw > 420 ? clamp(cw / 360, 1, 2.6) : 1));   // phones keep their size; wider screens get a taller preview
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px';
    const W = cv.width, H = cv.height, win = clamp(opt.win || d.diameterMm * 3.4, 20, Math.max(20, d.lengthMm)), ppm = W / win;
    let R = d.diameterMm / 2 * ppm; const ppmUse = Math.min(ppm, (H * 0.94) / d.diameterMm); R = d.diameterMm / 2 * ppmUse; const sx = ppmUse;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), px = img.data, cy = H / 2, cols = hexes(d).map(rgb);
    const hl = opt.hl || 0, tex = L.family !== 'bands' && L.w * sx >= 3, limit = opt.limitZ == null ? Infinity : opt.limitZ;
    for (let x = 0; x < W; x++) {
      const z = opt.z0 + x / sx;
      for (let y = 0; y < H; y++) {
        let glow = false; const v = (y - cy) / R; if (v < -1 || v > 1) continue;
        const c = Math.sqrt(1 - v * v), th = Math.asin(v) + opt.rot;
        let col = BARE, sl, gain = 1;
        if (hl) { const cv2 = z > limit ? { slot: -1 } : L.coverAt(z, th, opt.pass); sl = cv2.slot; if (sl >= 0) { col = cols[sl]; if (cv2.cap || cv2.pass === 0) gain = 0.55; else if (cv2.pass < hl) gain = 0.42; else { gain = 1.12; glow = true; } } }
        else { sl = z > limit ? -1 : L.slotAt(z, th, opt.pass); if (sl >= 0) col = cols[sl]; }
        const spec = Math.exp(-Math.pow((v + 0.45) / 0.13, 2)); let sh = (0.16 + 0.84 * c + 0.2 * spec) * gain;
        if (tex && sl >= 0) sh *= L.shadeAt ? L.shadeAt(z, th) : 0.95 + 0.05 * Math.cos(TAU * (z / L.w));
        const i = (y * W + x) * 4; const add = (34 * spec + 10 * (1 - c)) * (hl && sl >= 0 && !glow ? 0.5 : 1) + (glow ? 14 : 0); px[i] = Math.min(255, col[0] * sh + add); px[i + 1] = Math.min(255, col[1] * sh + add); px[i + 2] = Math.min(255, col[2] * sh + add); px[i + 3] = 255;
      }
    }
    ctx.clearRect(0, 0, W, H); ctx.putImageData(img, 0, 0);
    return { ppm: sx / dpr, R: R / dpr, win: W / sx, z0max: Math.max(0, d.lengthMm - W / sx), dpr };
  }
  function drawStrip(cv, L, view, geom) {
    const d = L.d, dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || 360, ch = cw > 420 ? 56 : 40;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); cv.style.height = ch + 'px';
    const W = cv.width, H = cv.height, ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), px = img.data, cols = hexes(d).map(rgb);
    for (let x = 0; x < W; x++) { const z = x / W * d.lengthMm; for (let y = 0; y < H; y++) { const sl = L.slotAt(z, y / H * TAU), c = sl >= 0 ? cols[sl] : BARE, i = (y * W + x) * 4; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255; } }
    ctx.putImageData(img, 0, 0);
    if (geom) { const x0 = view.z0 / d.lengthMm * W, x1 = (view.z0 + geom.win) / d.lengthMm * W; ctx.strokeStyle = '#e14a58'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(x0 + dpr, dpr, Math.max(4, x1 - x0) - 2 * dpr, H - 2 * dpr); }
  }
  function thumb(cv, d, h) { const L = T.layout(d); drawRod(cv, L, { z0: L.viewHint ? L.viewHint.z0 : 0, rot: L.viewHint ? L.viewHint.rot : 0.5, h: h || 70, win: d.diameterMm * 7 }); }

  // ---------- navigation ----------
  function go(screen) { S.screen = screen; app.dataset.screen = screen; ({ home, gallery, describe, custom, edit, work })[screen](); window.scrollTo(0, 0); }
  function open(d, note) {
    S.d = T.clone(d); S.hist = new T.History(S.d); S.sel = 1; S.note = note || ''; store.set(S.d);
    const L = T.layout(S.d); S.view = { z0: 0, rot: 0.6 };
    if (L.family === 'grid' && S.d.mode === 'text') { const off = L.copies > 1 ? 1 : Math.floor((L.N - 7 * L.size) / 2); S.view.rot = (off + 3.5 * L.size) / L.N * TAU; S.view.z0 = Math.max(0, L.rowOffset * L.rowMm - 4); }
    if (L.viewHint) { S.view.z0 = L.viewHint.z0; S.view.rot = L.viewHint.rot; }
    go('edit');
  }
  function home() {
    const saved = store.get();
    app.innerHTML = `<h1>Thread Design Studio</h1><p class="sub">Pick a starting point. You’ll see it on the rod straight away.</p>
${saved ? `<button class="choice resume" data-act="resume"><b>Continue your design</b><span>${esc(saved.mode === 'text' ? 'Lettering “' + saved.text + '”' : saved.pattern === 'wovencustom' ? (saved.name || 'My design') : T.PATTERNS[saved.pattern].name)}</span><canvas id="rc"></canvas></button>` : ''}
<button class="choice" data-act="gallery"><b>Choose a Design</b><span>Browse beautiful, ready-to-customise patterns.</span></button>
<button class="choice" data-act="text"><b>Create from Text</b><span>Enter a name, initials or a short message.</span></button>
<button class="choice" data-act="describe"><b>Describe Your Design</b><span>Explain what you want in ordinary words.</span></button>
<button class="choice" data-act="custom"><b>Create Your Own Design</b><span>Draw a logo or symbol, or upload artwork.</span></button>${HOST ? `<button class="choice" data-act="taper"><b>Diamond Layout for a Tapered Blank</b><span>Equal-area crossing rows from the butt and tip diameters.</span></button>` : ''}`;
    if (saved) thumb($('#rc'), saved, 64);
  }
  const kindOf = id => { const L = T.layout(T.createDesign(id)); return L.family === 'cross' ? (L.evidence.tier === 'experimental' ? 'Experimental arrangement' : 'Documented method') : L.family === 'weave' ? 'Woven · not bench tested' : L.family === 'bands' ? 'Plain wrap' : L.family === 'spiral' ? 'Spiral, no cuts' : 'Experimental'; };
  const tile = id => `<button class="tile" data-pat="${id}"><canvas data-th="${id}"></canvas><b>${T.PATTERNS[id].name}</b><span>${kindOf(id)}</span></button>`;
  function gallery() {
    app.innerHTML = `<div class="top"><button class="btn" data-act="home">← Back</button></div><h1>Choose a Design</h1><p class="sub">Tap one to see it on the rod.</p><div class="tiles">${T.GALLERY.map(tile).join('')}</div>
<details style="margin-top:12px"><summary>Experimental designs</summary><div class="in"><p class="note" style="margin-top:0">These use thousands of colour changes and aren’t a recognised decorative technique. Kept for reference only.</p><div class="tiles" style="margin-top:10px">${T.EXPERIMENTAL.map(tile).join('')}</div></div></details>`;
    document.querySelectorAll('canvas[data-th]').forEach(c => thumb(c, T.createDesign(c.dataset.th), 64));
  }
  const EXAMPLES = ['Gold diamonds on navy', 'Red and black checks', '“JW” in gold on black', 'Small teal waves', 'Barber pole in red and white'];
  function describe() {
    app.innerHTML = `<div class="top"><button class="btn" data-act="home">← Back</button></div><h1>Describe Your Design</h1><p class="sub">Say it in ordinary words. Put names or initials in quotes.</p>
<textarea id="desc" placeholder="For example: gold diamonds on navy" aria-label="Describe your design"></textarea>
<div class="chips">${EXAMPLES.map(e => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
<div class="dock"><div class="in"><button class="btn pri big" data-act="show">Show Me</button></div></div>`;
  }
  function fromWords(t) {
    const r = T.parse(t); let d = r.design;
    if (r.sizeDir) { const n = T.resize(d, r.sizeDir); d = n; }
    const msg = r.recognised ? 'Here’s what I understood: ' + r.understood.join(' · ') + '.' : 'I couldn’t find a pattern in that, so here’s a starting point. Try words like stripes, checks, diamonds, spiral, chevrons, waves or dots, or put a name in quotes.';
    open(d, msg);
  }

  // ---------- custom designs: library, start screen, artwork upload ----------
  const LKEY = 'ktds.library.v1' + SCOPE;
  const lib = { get() { try { const s = localStorage.getItem(LKEY); const l = s ? JSON.parse(s) : []; return Array.isArray(l) ? l.filter(r => r && r.design && T.art.valid(r.design.art)) : []; } catch (e) { return []; } }, set(l) { try { localStorage.setItem(LKEY, JSON.stringify(l)); return true; } catch (e) { return false; } } };
  function custom() {
    const saved = lib.get(), tp = [['blank', 'Blank grid', 'Draw your own'], ['symbol', 'Geometric symbol', 'Edit as you like'], ['monogram', 'Monogram', 'A bold initial']];
    app.innerHTML = `<div class="top"><button class="btn" data-act="home">← Back</button></div><h1>Create Your Own Design</h1><p class="sub">Draw on a grid, or turn simple artwork into a weave pattern. Bold shapes work best.</p>
<div class="tiles">${tp.map(([k, n, sub]) => `<button class="tile" data-tpl="${k}"><canvas data-tp="${k}"></canvas><b>${n}</b><span>${sub}</span></button>`).join('')}
<label class="tile upl"><input type="file" id="file" accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"><b>Upload Artwork</b><span>PNG, JPG or SVG</span><em>＋</em></label></div>
${S.upErr ? `<div class="status warn">${esc(S.upErr)}</div>` : ''}
${saved.length ? `<h2 style="margin-top:18px">My Designs</h2><div class="tiles">${saved.map(r => `<div class="tilewrap"><button class="tile" data-lib="${esc(r.id)}"><canvas data-lb="${esc(r.id)}"></canvas><b>${esc(r.name)}</b><span>${r.design.art.w} × ${r.design.art.h} grid</span></button><button class="del" data-libdel="${esc(r.id)}" aria-label="Delete ${esc(r.name)}">×</button></div>`).join('')}</div>` : ''}`;
    document.querySelectorAll('canvas[data-tp]').forEach(c => thumb(c, T.createDesign('wovencustom', { art: T.art.templates[c.dataset.tp]() }), 64));
    document.querySelectorAll('canvas[data-lb]').forEach(c => { const r = saved.find(x => x.id === c.dataset.lb); if (r) thumb(c, r.design, 64); });
  }
  async function loadArt(file) {
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type) && !/\.(png|jpe?g|svg)$/i.test(file.name)) throw new Error('Please choose a PNG, JPG or SVG image.');
    if (file.size > 12e6) throw new Error('That file is too large. Please use an image under 12 MB.');
    const url = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('That image could not be read. Try a PNG, JPG or SVG.')); img.src = url; });
      const iw = img.naturalWidth || 300, ih = img.naturalHeight || 300, svg = /svg/.test(file.type) || /\.svg$/i.test(file.name), sc = svg ? 256 / Math.max(iw, ih) : Math.min(1, 512 / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * sc)), h = Math.max(1, Math.round(ih * sc));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
      return T.art.srcFromRGBA(cx.getImageData(0, 0, w, h).data, w, h);
    } finally { URL.revokeObjectURL(url); }
  }
  async function importFile(file) {
    S.upErr = '';
    try {
      const src = await loadArt(file), art = T.art.fromSource(src, { gh: 16 }), nm = (file.name || 'Artwork').replace(/\.[^.]+$/, '').slice(0, 30) || 'Artwork';
      open(T.createDesign('wovencustom', { art, name: nm }), art.report.autoInverted ? 'Artwork converted. It looked light on dark, so it was inverted. Use Invert if that’s wrong.' : 'Artwork converted to a weave pattern. Refine it on the grid.');
    } catch (e) { S.upErr = e.message || 'That image could not be used.'; if (S.screen === 'custom') custom(); }
  }
  const gridCard = () => `<section class="card" id="gridcard"><h2>Draw</h2><div class="gridwrap"><canvas id="gridc" role="img" aria-label="Pattern grid. Tap or drag to add or remove cells."></canvas></div>
<p class="mut" id="gridnote" style="margin:6px 2px"></p><div class="bar"><button class="btn sm" data-act="gclear">Clear</button><button class="btn sm" data-act="save" id="savebtn">Save to My Designs</button></div>
<details id="artbox" style="margin-top:10px"><summary>Artwork conversion</summary><div class="in"><span class="field">Cut-off</span><input type="range" id="athr" min="5" max="95" step="1" aria-label="Cut-off"><div class="mut" style="display:flex;justify-content:space-between"><span>Less</span><span id="athv"></span><span>More</span></div>
<div class="bar" style="margin-top:10px"><button class="btn sm" data-act="aauto">Auto</button><button class="btn sm" data-act="ainv" id="ainv">Invert</button><button class="btn sm" data-act="acrop" id="acrop">Crop to artwork</button><button class="btn sm" data-act="ashape" id="ashape" hidden>Whole shape</button></div>
<span class="field" style="margin-top:12px">Detail (cells round the rod)</span>${stepper('cg', 'Detail')}<p class="note" id="artnote"></p></div></details></section>`;
  // ---------- editor ----------
  const stepper = (id, label, cap) => `<div class="stp"><button data-st="${id}-" aria-label="${label} smaller">−</button><div class="val" id="v${id}"></div><button data-st="${id}+" aria-label="${label} larger">+</button></div>${cap ? `<div class="mut" style="display:flex;justify-content:space-between;margin:2px 6px 0"><span>${cap[0]}</span><span>${cap[1]}</span></div>` : ''}`;
  function edit() {
    const d = S.d, text = d.mode === 'text';
    app.innerHTML = `<div class="top"><button class="btn" data-act="home">← Back</button><div class="pair"><button class="btn" data-act="undo" id="bu">Undo</button><button class="btn" data-act="redo" id="br">Redo</button></div></div>
<section class="card stage"><canvas id="rod" tabindex="0" role="img" aria-label="Rod preview. Drag to turn or slide the rod, or use the arrow keys."></canvas><canvas id="strip" aria-label="Whole design. Tap to jump."></canvas>
<div class="viewbar"><button class="btn sm" data-act="turn">Turn the Rod</button><span class="mut">Drag the rod to turn or slide it</span></div></section>
${text ? `<section class="card"><label class="field" for="txt">Your name or message</label><input type="text" id="txt" maxlength="24" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(d.text)}"></section>` : ''}
${d.pattern === 'wovencustom' ? gridCard() : ''}
<div id="status"></div>
<section class="card"><h2>Colours</h2><div class="slots" id="slots"></div><div class="pal" id="pal"></div><div class="bar" style="margin-top:10px"><button class="btn sm" data-act="swap" id="swap">Swap Colours</button></div></section>
<section class="card"><h2 id="szh"></h2>${stepper('sz', 'Pattern', ['Smaller', 'Larger'])}</section>
<details id="more"><summary>More options</summary><div class="in">
<span class="field">Rod diameter where the design goes (mm)</span>${stepper('di', 'Rod diameter')}<div id="dm"></div>
<span class="field" style="margin-top:14px">Length to wrap (mm)</span>${stepper('ln', 'Wrapped length')}
<span class="field" style="margin-top:14px">Thread size</span><div class="seg" id="thr">${T.THREAD_SIZES.map(s => `<button data-thr="${s.id}">${s.name}</button>`).join('')}</div>
<p class="note">Typical widths only (A about 0.18 mm, D 0.25 mm, E 0.30 mm). Pack 20 turns tightly and measure yours for the best fit.</p>
<div id="bandbox"><span class="field" style="margin-top:14px">Threads in the main band</span><div class="seg" id="bnd">${T.cross.optionsFor(S.d).map(k => `<button data-bt="${k}">${k}</button>`).join('')}</div></div>
<div id="customopts"><span class="field" style="margin-top:14px">Design name</span><input type="text" id="dname" maxlength="30" autocomplete="off" value="${esc(d.name || 'My design')}"><span class="field" style="margin-top:14px">Grid width (along the rod)</span>${stepper('gw', 'Grid width')}<span class="field" style="margin-top:14px">Grid height (round the rod)</span>${stepper('gh', 'Grid height')}<div class="bar" style="margin-top:12px"><button class="btn sm" data-act="gmx">Mirror ↔</button><button class="btn sm" data-act="gmy">Mirror ↕</button></div></div>
<div id="detailbox"><span class="field" style="margin-top:14px">Mark spacing</span><div class="seg" id="det">${['fine', 'standard', 'bold'].map(k => `<button data-det="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div></div></details>
<details><summary>How this works</summary><div class="in"><p class="note" style="margin-top:0">The preview wraps one thread helix along the rod and works out which colour lands where, so what you see is what the thread will lay down.</p>
<p class="note"><b>Plain wrap</b> (bands): colours change only between turns.</p><p class="note"><b>Spiral</b>: several threads are wound side by side as one band, so there are no cuts.</p>
<p class="note"><b>Colour-change wrap</b> (checks, diamonds, lettering and so on): the rod is marked into equal parts and the colour changes at the marks on each turn. It is accurate but slow, and the status above shows how many changes it takes.</p>
<p class="note"><b>Woven designs</b>: warp lines (several threads each) lie along the blank and one weft thread is wound round it, going under the lines that should show and over the rest. The preview and the steps both come from that same list of lifts. The weaving principle is documented; line counts, band lengths and thread amounts are estimates. Not yet tested on a rod.</p><p class="note"><b>Chevron cross wrap</b>: the same up-and-back threads, but each extra thread goes on the same side of the last, so the crossings move along the rod and the colours nest into arrowheads.</p><p class="note"><b>Diamond cross wrap</b>: two sets of threads wound up and back along the blank, leaning opposite ways, crossing on marks set on two opposite lines. The preview and the steps are both drawn from the same thread paths. Geometry is checked by tests; the layout follows builder-published descriptions; spacing, band widths and end bands are experimental. Not yet tested on a rod. See METHOD.md for sources.</p>
<p class="note">Marking instructions need your measured rod diameter. Until then the preview uses a standard size. Colours on screen are approximate.</p></div></details>
<div class="dock"><div class="in"><button class="btn pri big" data-act="start">Start Wrapping</button></div></div>`;
    paint(true);
  }
  function paint(full) {
    const d = S.d, L = S.L = T.layout(d), text = d.mode === 'text';
    S.geom = drawRod($('#rod'), L, { z0: Math.max(0, S.view.z0), rot: S.view.rot, h: 150, win: d.mode === 'text' ? d.diameterMm * 4.6 : L.viewWin ? d.diameterMm * L.viewWin : null });
    if (S.view.z0 > S.geom.z0max || S.view.z0 < 0) { S.view.z0 = clamp(S.view.z0, 0, S.geom.z0max); S.geom = drawRod($('#rod'), L, { z0: S.view.z0, rot: S.view.rot, h: 150, win: d.mode === 'text' ? d.diameterMm * 4.6 : L.viewWin ? d.diameterMm * L.viewWin : null }); }
    drawStrip($('#strip'), L, S.view, S.geom);
    $('#slots').innerHTML = L.slotNames.map((n, i) => `<button class="slot" data-slot="${i}" aria-pressed="${S.sel === i}"><i style="background:${T.thread(d.slots[i]).hex}"></i>${esc(n)}</button>`).join('');
    $('#pal').innerHTML = T.THREADS.map(t => `<button data-col="${t.id}" style="background:${t.hex}" aria-label="${t.name}" title="${t.name}" aria-pressed="${d.slots[S.sel] === t.id}"></button>`).join('');
    $('#swap').style.display = L.slotNames.length > 1 ? '' : 'none';
    $('#szh').textContent = d.pattern === 'wovencustom' ? 'Design scale' : text ? 'Letter size' : L.family === 'spiral' ? 'Stripe width' : L.family === 'weave' ? 'Weave size' : L.family === 'cross' ? (d.pattern === 'chevronwrap' ? 'Chevron size' : 'Diamond size') : 'Pattern size';
    $('#vsz').innerHTML = `${esc(L.sizeLabel)}`;
    document.querySelector('[data-st="sz-"]').disabled = L.smaller == null; document.querySelector('[data-st="sz+"]').disabled = L.larger == null;
    $('#vdi').innerHTML = f1(d.diameterMm) + ' mm<small>' + (d.measured ? 'measured' : 'preview size') + '</small>';
    $('#dm').innerHTML = d.measured ? '' : `<button class="btn sm" data-act="measured" style="margin-top:8px">Use this as my measured size</button>`;
    $('#vln').innerHTML = d.lengthMm + ' mm';
    document.querySelectorAll('#thr button').forEach(b => b.setAttribute('aria-pressed', b.dataset.thr === d.thread));
    document.querySelectorAll('#det button').forEach(b => b.setAttribute('aria-pressed', b.dataset.det === d.detail));
    $('#detailbox').style.display = L.family === 'grid' ? '' : 'none'; $('#bandbox').style.display = L.family === 'cross' ? '' : 'none';
    document.querySelectorAll('#bnd button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.bt === L.bandThreads));
    const cu = d.pattern === 'wovencustom'; $('#customopts').style.display = cu ? '' : 'none'; if (cu) paintCustom(d, L);
    $('#bu').disabled = !S.hist.can(true); $('#br').disabled = !S.hist.can(false);
    const tx = $('#txt'); if (tx && tx.value !== d.text && document.activeElement !== tx) tx.value = d.text;
    let h = ''; if (S.note) h += `<div class="status"><b>${esc(S.note)}</b></div>`;
    h += `<div class="status ${L.evidence.tier === 'experimental' ? 'warn' : ''}"><b>${esc(L.method.label)}</b>${L.effort ? ' · ' + L.effort : ''}<br><span class="mut">${esc(L.evidence.label)} · ${esc(L.evidence.bench.toLowerCase())}${L.family === 'grid' ? ' · marks every ' + L.markSpacingMm.toFixed(2) + ' mm, ' + L.N + ' around' : L.family === 'weave' ? ' · ' + L.M + ' lines ' + L.cellW.toFixed(2) + ' mm apart, wrap ' + L.lenAdj.toFixed(0) + ' mm' : L.family === 'cross' ? ' · marks every ' + (L.spec.marksBoth ? L.S / 2 : L.S).toFixed(1) + ' mm, wrap ' + L.lenAdj.toFixed(0) + ' mm' : ''}</span></div>`;
    L.warnings.forEach(w => { h += `<div class="status ${w.level === 'warn' ? 'warn' : ''}">${esc(w.text)}${w.fix === 'rodsize' ? '<br><button class="btn sm" data-act="rodsize">Enter Rod Size</button>' : w.fix === 'more' ? '<br><button class="btn sm" data-act="rodsize">Open More Options</button>' : ''}</div>`; });
    $('#status').innerHTML = h;
  }
  function drawGrid() {
    const cv = $('#gridc'); if (!cv) return; const d = S.d, a = d.art, wrap = cv.parentNode, avail = wrap.clientWidth || 340, cs = clamp(Math.floor(avail / a.w), 7, 30), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.style.width = cs * a.w + 'px'; cv.style.height = cs * a.h + 'px'; cv.width = Math.round(cs * a.w * dpr); cv.height = Math.round(cs * a.h * dpr);
    const x = cv.getContext('2d'), c0 = T.thread(d.slots[0]).hex, c1 = T.thread(d.slots[1]).hex, k = cs * dpr; x.fillStyle = c1; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = c0;
    for (let j = 0; j < a.h; j++) for (let i = 0; i < a.w; i++) if (a.rows[j][i] === '1') x.fillRect(i * k, j * k, k, k);
    x.lineWidth = 1; for (let i = 0; i <= a.w; i++) { x.strokeStyle = i % 4 === 0 ? 'rgba(160,165,170,.55)' : 'rgba(160,165,170,.25)'; x.beginPath(); x.moveTo(i * k + .5, 0); x.lineTo(i * k + .5, cv.height); x.stroke(); }
    for (let j = 0; j <= a.h; j++) { x.strokeStyle = j % 4 === 0 ? 'rgba(160,165,170,.55)' : 'rgba(160,165,170,.25)'; x.beginPath(); x.moveTo(0, j * k + .5); x.lineTo(cv.width, j * k + .5); x.stroke(); }
  }
  function paintCustom(d, L) {
    drawGrid(); const a = d.art, ink = T.art.ink(a);
    $('#gridnote').textContent = a.w + ' × ' + a.h + ' cells · ' + ink + ' filled · tap or drag to add, tap a filled cell then drag to erase. Along the rod →, round the rod ↓';
    $('#vgw').innerHTML = a.w; $('#vgh').innerHTML = a.h;
    document.querySelector('[data-st="gw-"]').disabled = a.w <= T.art.MINW; document.querySelector('[data-st="gw+"]').disabled = a.w >= T.art.MAXW;
    document.querySelector('[data-st="gh-"]').disabled = a.h <= T.art.MINH; document.querySelector('[data-st="gh+"]').disabled = a.h >= T.art.MAXH;
    const ab = $('#artbox'); ab.style.display = a.src ? '' : 'none';
    if (a.src) { const cv = a.conv || {}, thr = cv.thr == null ? Math.round((a.report && a.report.cut || 8) / 16 * 100) : cv.thr; $('#athr').value = thr; $('#athv').textContent = cv.thr == null ? 'auto' : thr + '%'; $('#ainv').setAttribute('aria-pressed', !!cv.invert); $('#acrop').setAttribute('aria-pressed', cv.crop !== false); $('#ashape').hidden = !(a.report && (a.report.mode === 'transparent' || a.report.mode === 'colour')); $('#ashape').setAttribute('aria-pressed', !!cv.shape); $('#vcg').innerHTML = (cv.gh || 16) + ' cells';
      document.querySelector('[data-st="cg-"]').disabled = (cv.gh || 16) <= T.art.MINH; document.querySelector('[data-st="cg+"]').disabled = (cv.gh || 16) >= T.art.MAXH;
      $('#artnote').textContent = a.edited ? 'You have edited the grid. Changing these settings converts the artwork again and replaces those edits (Undo brings them back).' : 'Adjust these until the shape on the grid looks right, then refine it by hand.'; }
    const dn = $('#dname'); if (dn && document.activeElement !== dn && dn.value !== (d.name || 'My design')) dn.value = d.name || 'My design';
    $('#savebtn').textContent = lib.get().some(r => r.id === d.id) ? 'Saved · tap to update' : 'Save to My Designs';
  }
  function reconvert(patch) { const nd = T.clone(S.d), a = nd.art, conv = Object.assign({}, a.conv, patch); nd.art = T.art.fromSource(a.src, conv); commit(nd, 'art'); }
  function commit(nd, key) { S.d = nd; S.hist.push(nd, key); S.note = ''; store.set(nd); paint(); }
  const pin = (v, a, b, st) => clamp(Math.round(v / st) * st, a, b);

  // ---------- workshop ----------
  function work() {
    S.steps = T.steps(S.d); S.step = clamp(S.step, 0, S.steps.length - 1); drawWork();
  }
  function passHead(st, d) {
    const hx = T.thread(d.slots[st.slot]).hex, parts = st.head.split(' — ');
    return `<h3 class="stepTitle" hidden>${esc(st.title)}</h3><div class="phead"><i style="background:${hx}"></i><div><b>${esc(parts[0])}</b><b class="pc">${esc(parts[1])}</b></div></div>`;
  }
  function passBody(st, d, L) {
    const legs = st.legs.map(l => `<div class="leg ${l.dir}"><b>${l.arrow} ${l.label}</b><span>${esc(l.action)}</span></div>`).join('');
    return `${legs}<div class="chips">${st.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>${st.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
<button class="diagram" data-act="zoom" aria-label="Enlarge the thread diagram">${T.cross.diagramSVG(d, L, st.pass, st.pass)}</button>
<div class="legend"><span><u class="s"></u>up →</span><span><u class="d"></u>back ←</span><span><b class="ring"></b>start</span><span><b class="dia"></b>turn</span><span><b class="mA"></b>A</span><span><b class="mC"></b>C</span><span class="enl">tap diagram to enlarge</span></div>
<div class="ribbon" aria-label="Where this thread sits">${T.cross.ribbonSVG(d, L, st.pass)}</div>
<details class="how"${st.howOpen ? ' open' : ''}><summary>How to do this</summary>${st.how.map(l => `<p class="stepText">${esc(l)}</p>`).join('')}</details>`;
  }
  function weaveBody(st, d, L) {
    const legs = st.legs.map(l => `<div class="leg ${l.dir}"><b>${l.arrow} ${l.label}</b><span>${esc(l.action)}</span></div>`).join('');
    return `${legs}<div class="chips">${st.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>${st.notes.map(n => `<p class="note">${esc(n)}</p>`).join('')}
<button class="diagram" data-act="zoom" aria-label="Enlarge the diagram">${T.weave.diagramSVG(d, L, st)}</button>
<div class="legend">${st.kind === 'wrow' ? '<span><b class="wo"></b>weft over (covers the line)</span><span><b class="wu"></b>weft under (line shows)</span>' : st.kind === 'warp' || st.kind === 'wstart' || st.kind === 'wfinish' ? '<span><b class="ring"></b>mark 0, the seam</span>' : '<span>one square = one line in one row</span>'}<span class="enl">tap diagram to enlarge</span></div>
${st.next ? `<p class="next"><b>Next</b> ${esc(st.next.replace(/^Next:\s*/, ''))}</p>` : ''}
<details class="how"${st.howOpen ? ' open' : ''}><summary>How to do this</summary>${st.how.map(l => `<p class="stepText">${esc(l)}</p>`).join('')}</details>`;
  }
  function openZoom() {
    const d = S.d, L = T.layout(d), st = S.steps[S.step]; let z = $('#zoom'); if (!z) { z = document.createElement('div'); z.id = 'zoom'; document.body.appendChild(z); }
    z.innerHTML = `<div class="zh">${esc(st.head)}</div><div class="zs">${st.stage != null ? T.weave.diagramSVG(d, L, st, { big: true }) : T.cross.diagramSVG(d, L, st.pass, st.pass, { big: true })}</div><p class="note" style="padding:0 12px">${st.stage != null ? 'Scroll sideways. Red frame = this row; faint rows are done or still to come.' : 'Scroll sideways. Thick line = this pass; faint = done.'}</p><div class="dock"><div class="in">${S.step > 0 ? '<button class="btn big back" data-act="prev">Back</button>' : ''}<button class="btn big" data-act="unzoom">Close</button><button class="btn pri big" data-act="next">Next</button></div></div>`;
  }
  const hasDia = st => st.kind === 'pass' || st.stage != null;
  function closeZoom() { S.zoom = false; const z = $('#zoom'); if (z) z.remove(); }
  function drawWork() {
    const d = S.d, L = T.layout(d), st = S.steps[S.step], n = S.steps.length, nm = s => T.thread(d.slots[s]).name, hx = s => T.thread(d.slots[s]).hex;
    const EV = { geometry: 'Calculated', documented: 'Documented technique', experimental: 'Experimental detail' };
    const pass = st.kind === 'pass', stg = st.stage != null;
    let body = pass || stg ? passHead(st, d) : `<h3 class="stepTitle">${esc(st.title)}</h3>${st.evidence ? `<p class="mut" style="margin:-2px 0 8px">${st.evidence.map(e => EV[e]).join(' · ')}</p>` : ''}${st.lines ? st.lines.map(l => `<p class="stepText" style="margin-bottom:8px">${esc(l)}</p>`).join('') : `<p class="stepText">${esc(st.text)}</p>`}`, primary = '';
    if (st.kind === 'needsize') { body += `<div class="stp"><button data-st="di-" aria-label="Rod diameter smaller">−</button><div class="val" id="vdi"></div><button data-st="di+" aria-label="Rod diameter larger">+</button></div>`; primary = `<button class="btn pri big" data-act="usesize">Use This Measurement</button>`; }
    else primary = `<button class="btn pri big" data-act="next">${st.kind === 'finish' ? 'Done' : 'Next'}</button>`;
    if (st.slots && !pass) body += `<div class="sw">${st.slots.map(s => `<span><i style="background:${hx(s)}"></i>${esc(nm(s))}</span>`).join('')}</div>`;
    if (st.kind === 'marks') body += `<div class="bar" style="margin-top:12px"><button class="btn sm" data-act="template">Print Marking Guide</button></div>`;
    if (pass) body += passBody(st, d, L);
    if (stg) body += weaveBody(st, d, L);
    if (st.kind === 'row') {
      const N = st.cells.length, every = N > 30 ? 5 : 1;
      body += `<div class="cells" aria-label="One turn, marks 0 to ${N - 1}">${st.cells.map(s => `<i style="background:${hx(s)}"></i>`).join('')}</div><div class="marks">${st.cells.map((_, j) => `<span>${j % every === 0 ? j : ''}</span>`).join('')}</div>`;
      if (!st.uniform) body += `<div class="runs">${st.runs.map(r => `<div class="run"><i style="background:${hx(r.slot)}"></i>${esc(nm(r.slot))}<span>mark ${r.from} → ${r.to} · ${r.len}</span></div>`).join('')}</div>`;
    }
    app.innerHTML = `<div class="top"><button class="btn" data-act="design">← Back to design</button><span class="mut">Step ${S.step + 1} of ${n}</span></div><div class="prog"><i style="width:${(S.step + 1) / n * 100}%"></i></div>
<section class="card stage"><canvas id="wrod"></canvas></section><section class="card">${body}</section>
<div class="dock"><div class="in">${S.step > 0 ? '<button class="btn big back" data-act="prev">Back</button>' : ''}${primary}</div></div>`;
    const win = d.diameterMm * (L.viewWin || 3.4), wv = L.family === 'weave', cross = L.family === 'cross' || wv, lim = cross ? undefined : (st.zEnd != null ? st.zEnd : 0);
    const z0 = wv ? clamp((st.zc != null ? st.zc : L.lenAdj / 2) - win / 2, 0, Math.max(0, L.lenAdj - win)) : cross ? clamp(L.lenAdj * 0.35, 0, Math.max(0, L.lenAdj - win)) : Math.max(0, (lim || 0) - win * 0.85);
    drawRod($('#wrod'), L, { z0, rot: S.view.rot, h: pass || stg ? 104 : 120, limitZ: lim, win, pass: wv ? (stg ? st.stage : undefined) : cross ? st.pass : undefined, hl: wv ? (stg ? st.stage : 0) : pass && cross ? st.pass : 0 });
    if (S.zoom && (pass || stg)) openZoom();
    if ($('#vdi')) $('#vdi').innerHTML = f1(d.diameterMm) + ' mm<small>rod diameter</small>';
  }
  function template(d) {
    const L = T.layout(d); if (L.family !== 'grid') return '';
    const maxRows = Math.min(L.rows, Math.floor(270 / L.rowMm)), W = L.C, H = maxRows * L.rowMm, hx = d.slots.map(id => T.thread(id).hex);
    let g = ''; for (let r = 0; r < maxRows; r++) { const cells = L.rowCells(r); let j = 0; while (j < L.N) { let k = j + 1; while (k < L.N && cells[k] === cells[j]) k++; g += `<rect x="${(j * L.cellMm).toFixed(2)}" y="${(r * L.rowMm).toFixed(2)}" width="${((k - j) * L.cellMm).toFixed(2)}" height="${L.rowMm.toFixed(2)}" fill="${hx[cells[j]]}"/>`; j = k; } }
    let m = ''; for (let j = 0; j < L.N; j++) m += `<line x1="${(j * L.cellMm).toFixed(2)}" x2="${(j * L.cellMm).toFixed(2)}" y1="-3" y2="0" stroke="#000" stroke-width=".2"/><text x="${((j + 0.5) * L.cellMm).toFixed(2)}" y="-4" font-size="${Math.min(2.4, L.cellMm * 0.8).toFixed(2)}" text-anchor="middle">${j}</text>`;
    return `<h3 style="font:600 12pt sans-serif;margin:0 0 4mm">Thread Design Studio · wrapping template</h3><p style="font:9pt sans-serif;margin:0 0 8mm">Rod diameter ${f1(d.diameterMm)} mm · circumference ${L.C.toFixed(1)} mm · ${L.N} marks, ${L.markSpacingMm.toFixed(2)} mm apart · print at 100% (no scaling). Colours are approximate. Template covers the first ${(maxRows * L.rowMm).toFixed(0)} mm.</p>
<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(2)}mm" height="${(H + 8).toFixed(2)}mm" viewBox="0 -8 ${W.toFixed(2)} ${(H + 8).toFixed(2)}" style="overflow:visible">${g}${m}<rect x="0" y="0" width="${W.toFixed(2)}" height="${H.toFixed(2)}" fill="none" stroke="#000" stroke-width=".2"/></svg>`;
  }
  T.templateHTML = template;

  // ---------- events ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const D = b.dataset;
    if (D.act) return act(D.act);
    if (D.pat) return open(T.createDesign(D.pat));
    if (D.tpl) return open(T.createDesign('wovencustom', { art: T.art.templates[D.tpl]() }));
    if (D.lib) { const r = lib.get().find(x => x.id === D.lib); if (r) open(r.design); return; }
    if (D.libdel) { lib.set(T.art.libRemove(lib.get(), D.libdel)); return custom(); }
    if (D.ex) return fromWords(D.ex.replace(/[“”]/g, '"'));
    if (D.slot != null) { S.sel = +D.slot; return paint(); }
    if (D.col) { const d = T.clone(S.d), i = S.sel, j = d.slots.indexOf(D.col); if (j >= 0 && j !== i) d.slots[j] = d.slots[i]; d.slots[i] = D.col; return commit(d); }
    if (D.thr) return commit(Object.assign(T.clone(S.d), { thread: D.thr }));
    if (D.bt) return commit(Object.assign(T.clone(S.d), { bandThreads: +D.bt }));
    if (D.det) return commit(Object.assign(T.clone(S.d), { detail: D.det, size: null }));
    if (D.st) return stp(D.st);
  });
  function act(a) {
    if (a === 'home') return go('home');
    if (a === 'resume') { const s = store.get(); if (s) { S.d = s; S.hist = new T.History(s); S.sel = 1; S.note = ''; const L = T.layout(s); S.view = { z0: 0, rot: 0.6 }; if (s.mode === 'text' && L.family === 'grid') { const off = L.copies > 1 ? 1 : Math.floor((L.N - 7 * L.size) / 2); S.view.rot = (off + 3.5 * L.size) / L.N * TAU; S.view.z0 = Math.max(0, L.rowOffset * L.rowMm - 4); } if (L.viewHint) { S.view.z0 = L.viewHint.z0; S.view.rot = L.viewHint.rot; } go('edit'); } return; }
    if (a === 'taper') { try { parent.postMessage({ type: 'klabs-thread-studio', action: 'open-taper-designer' }, window.origin); } catch (e) { } return; }
    if (a === 'gallery') return go('gallery');
    if (a === 'custom') { S.upErr = ''; return go('custom'); }
    if (a === 'gclear') return commit(Object.assign(T.clone(S.d), { art: T.art.clear(S.d.art) }));
    if (a === 'gmx' || a === 'gmy') return commit(Object.assign(T.clone(S.d), { art: T.art.mirror(S.d.art, a === 'gmx' ? 'x' : 'y') }));
    if (a === 'ainv') return reconvert({ invert: !(S.d.art.conv || {}).invert });
    if (a === 'acrop') return reconvert({ crop: (S.d.art.conv || {}).crop === false });
    if (a === 'ashape') return reconvert({ shape: !(S.d.art.conv || {}).shape });
    if (a === 'aauto') return reconvert({ thr: null });
    if (a === 'save') { if (!S.d.id) S.d.id = T.art.newId(); const ok = lib.set(T.art.libUpsert(lib.get(), S.d)); store.set(S.d); S.note = ok ? 'Saved to My Designs. Find it under Create Your Own Design.' : 'Could not save: this browser’s storage is full or blocked.'; return paint(); }
    if (a === 'text') return open(T.createDesign('wovenletters'));
    if (a === 'describe') return go('describe');
    if (a === 'show') { const t = $('#desc').value.trim(); return t ? fromWords(t) : $('#desc').focus(); }
    if (a === 'undo') { if (S.hist.can(true)) { S.d = S.hist.undo(); store.set(S.d); S.note = ''; paint(); } return; }
    if (a === 'redo') { if (S.hist.can(false)) { S.d = S.hist.redo(); store.set(S.d); S.note = ''; paint(); } return; }
    if (a === 'turn') { S.view.rot += Math.PI / 2; return paint(); }
    if (a === 'swap') { const d = T.clone(S.d); [d.slots[0], d.slots[1]] = [d.slots[1], d.slots[0]]; return commit(d); }
    if (a === 'measured') return commit(Object.assign(T.clone(S.d), { measured: true }));
    if (a === 'rodsize') { const m = $('#more'); m.open = true; m.scrollIntoView({ block: 'center' }); return; }
    if (a === 'start') { S.step = 0; return go('work'); }
    if (a === 'design') return go('edit');
    if (a === 'zoom') { S.zoom = true; return openZoom(); }
    if (a === 'unzoom') return closeZoom();
    if (a === 'next') { if (S.step >= S.steps.length - 1) { closeZoom(); return go('edit'); } S.step++; if (!hasDia(S.steps[S.step])) closeZoom(); return drawWork(); }
    if (a === 'prev') { S.step = Math.max(0, S.step - 1); if (!hasDia(S.steps[S.step])) closeZoom(); return drawWork(); }
    if (a === 'usesize') { S.d = Object.assign(T.clone(S.d), { measured: true }); S.hist.push(S.d); store.set(S.d); S.steps = T.steps(S.d); S.step = 0; return drawWork(); }
    if (a === 'template') { const h = S.L.family === 'cross' ? T.cross.templateHTML(S.d) : S.L.family === 'weave' ? T.weave.templateHTML(S.d) : T.templateHTML(S.d); $('#print').innerHTML = h; if (!window.__noPrint) window.print(); return; }
  }
  function stp(k) {
    const id = k.slice(0, -1), dir = k.slice(-1) === '+' ? 1 : -1, d = T.clone(S.d);
    if (id === 'sz') return commit(T.resize(d, dir));
    if (id === 'di') { d.diameterMm = pin(d.diameterMm + dir * 0.1, 3, 30, 0.1); d.measured = false; d.size = null; if (S.screen === 'work') { S.d = d; S.hist.push(d); store.set(d); return drawWork(); } return commit(d); }
    if (id === 'gw' || id === 'gh') { d.art = T.art.resize(d.art, d.art.w + (id === 'gw' ? dir : 0), d.art.h + (id === 'gh' ? dir : 0)); d.size = null; return commit(d); }
    if (id === 'cg') return reconvert({ gh: ((S.d.art.conv || {}).gh || 16) + dir });
    if (id === 'ln') { d.lengthMm = pin(d.lengthMm + dir * 10, 30, 600, 10); return commit(d); }
  }
  document.addEventListener('input', e => {
    if (e.target.id === 'athr') return reconvert({ thr: +e.target.value });
    if (e.target.id === 'dname') { const nd = T.clone(S.d); nd.name = e.target.value.slice(0, 30); S.d = nd; S.hist.push(nd, 'name'); store.set(nd); return; }
    if (e.target.id === 'txt') { const nd = T.clone(S.d); nd.text = e.target.value; nd.size = S.d.size; commit(nd, 'txt'); }
  });
  document.addEventListener('change', e => { if (e.target.id === 'file' && e.target.files && e.target.files[0]) importFile(e.target.files[0]); });
  document.addEventListener('focusin', e => { if (e.target.id === 'txt' && (e.target.value === 'YOUR NAME' || e.target.value === 'K-LABS')) setTimeout(() => e.target.select(), 0); });
  // rod drag: slide along (x) and turn (y); a tap picks the colour under the finger
  let drag = null;
  document.addEventListener('pointerdown', e => { const c = e.target; if (c.id === 'rod') { drag = { id: 'rod', x: e.clientX, y: e.clientY, z0: S.view.z0, rot: S.view.rot, moved: false }; c.setPointerCapture(e.pointerId); } else if (c.id === 'strip') { drag = { id: 'strip' }; jump(e); c.setPointerCapture(e.pointerId); } else if (c.id === 'gridc') gridDown(e); });
  function gridCell(e) { const a = S.d.art, r = $('#gridc').getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * a.w), Math.floor((e.clientY - r.top) / r.height * a.h)]; }
  let gq = 0; const gridPaint = () => { if (!gq) gq = requestAnimationFrame(() => { gq = 0; paint(); }); };
  function gridLine(x0, y0, x1, y1, v) { let ch = false; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) ch = T.art.set(S.d.art, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), v) || ch; return ch; }
  function gridDown(e) { const [x, y] = gridCell(e), a = S.d.art; if (x < 0 || y < 0 || x >= a.w || y >= a.h) return; e.preventDefault(); drag = { id: 'grid', val: !T.art.get(a, x, y), lx: x, ly: y, changed: false, before: JSON.stringify(S.d) }; e.target.setPointerCapture(e.pointerId); if (gridLine(x, y, x, y, drag.val)) drag.changed = true; gridPaint(); }
  function jump(e) { const r = $('#strip').getBoundingClientRect(), z = (e.clientX - r.left) / r.width * S.d.lengthMm; S.view.z0 = clamp(z - S.geom.win / 2, 0, S.geom.z0max); paint(); }
  document.addEventListener('pointermove', e => {
    if (!drag) return; if (drag.id === 'strip') return jump(e);
    if (drag.id === 'grid') { const [x, y] = gridCell(e); if (gridLine(drag.lx, drag.ly, x, y, drag.val)) drag.changed = true; drag.lx = x; drag.ly = y; return gridPaint(); }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true; if (!drag.moved) return;
    S.view.z0 = clamp(drag.z0 - dx / S.geom.ppm, 0, S.geom.z0max); S.view.rot = drag.rot + dy / S.geom.R; paint();
  });
  document.addEventListener('pointerup', e => {
    if (drag && drag.id === 'grid') { if (drag.changed) { S.d.art.edited = true; S.hist.push(S.d); store.set(S.d); S.note = ''; } drag = null; return paint(); }
    if (drag && drag.id === 'rod' && !drag.moved) {
      const r = $('#rod').getBoundingClientRect(), v = (e.clientY - r.top - r.height / 2) / S.geom.R;
      if (Math.abs(v) < 1) { const z = S.view.z0 + (e.clientX - r.left) / S.geom.ppm, sl = S.L.slotAt(z, Math.asin(v) + S.view.rot); if (sl >= 0 && sl < S.L.slotNames.length) { S.sel = sl; paint(); } }
    }
    drag = null;
  });
  let rz = 0; window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (S.screen === 'edit' && S.d) paint(); else if (S.screen === 'work' && S.d) drawWork(); }); });
  // keyboard: arrows step the workshop (Back/Next) or move the rod when it has focus; Esc closes the enlarged diagram
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; const t = e.target, tag = t && t.tagName;
    if (e.key === 'Escape' && S.zoom) { closeZoom(); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (t && t.id === 'rod' && S.geom) { const k = e.key; if (k === 'ArrowLeft' || k === 'ArrowRight') S.view.z0 = clamp(S.view.z0 + (k === 'ArrowRight' ? 1 : -1) * S.geom.win * 0.08, 0, S.geom.z0max); else if (k === 'ArrowUp' || k === 'ArrowDown') S.view.rot += (k === 'ArrowDown' ? 1 : -1) * 0.25; else return; e.preventDefault(); paint(); return; }
    if (S.screen === 'work' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && tag !== 'BUTTON' && tag !== 'SUMMARY') { const b = document.querySelector(e.key === 'ArrowRight' ? '[data-act=next]' : '[data-act=prev]'); if (b) { e.preventDefault(); b.click(); } }
  });
  home();
})();
