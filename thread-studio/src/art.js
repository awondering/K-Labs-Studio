/* K-Labs Thread Design Studio: custom design drafts (drawn grids and converted artwork).
   A custom design is d.art = { v:1, w, h, rows:[h strings of w '0'/'1'], edited, name?, src?, conv?, report? }.
   Pixel x runs ALONG the rod, pixel y runs ROUND it (the same as lettering). weave.js turns it into the left list:
   a '1' pixel is s x s cells where the weft goes UNDER (the warp shows); a '0' pixel is where it goes OVER.
   There is no separate image: the rod preview, the chart, the steps and the printed guide all read this grid.
   Artwork import (convert) is pure: it works on a small packed raster (src), so the same conversion can be redone
   from saved data. Plain JSON throughout, ready for account storage later. */
(function (root) {
  'use strict';
  const T = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.THREAD;
  const A = {}; T.art = A;
  A.MAXW = 48; A.MAXH = 24; A.MINW = 4; A.MINH = 4; A.SRC_SIDE = 96;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  A.blank = (w, h) => ({ v: 1, w, h, rows: Array.from({ length: h }, () => '0'.repeat(w)), edited: false });
  A.get = (a, x, y) => x >= 0 && y >= 0 && x < a.w && y < a.h && a.rows[y][x] === '1';
  A.set = function (a, x, y, v) { if (x < 0 || y < 0 || x >= a.w || y >= a.h) return false; const r = a.rows[y]; if ((r[x] === '1') === !!v) return false; a.rows[y] = r.slice(0, x) + (v ? '1' : '0') + r.slice(x + 1); return true; };
  A.ink = a => a.rows.reduce((n, r) => n + (r.match(/1/g) || []).length, 0);
  A.clear = a => Object.assign({}, a, { rows: a.rows.map(r => '0'.repeat(a.w)), edited: true });
  A.resize = function (a, w, h) {            // keeps what is already drawn, anchored top-left
    w = clamp(w, A.MINW, A.MAXW); h = clamp(h, A.MINH, A.MAXH); const rows = [];
    for (let y = 0; y < h; y++) { const r = a.rows[y] || ''; rows.push((r + '0'.repeat(w)).slice(0, w)); }
    return Object.assign({}, a, { w, h, rows, edited: true });
  };
  A.mirror = function (a, axis) {            // 'x' flips along the rod, 'y' flips round it
    const rows = axis === 'x' ? a.rows.map(r => r.split('').reverse().join('')) : a.rows.slice().reverse();
    return Object.assign({}, a, { rows, edited: true });
  };
  A.valid = a => !!a && a.w >= 1 && a.h >= 1 && Array.isArray(a.rows) && a.rows.length === a.h && a.rows.every(r => typeof r === 'string' && r.length === a.w && /^[01]*$/.test(r));
  A.bitmap = function (a) { if (!A.valid(a)) a = A.blank(8, 8); return { w: a.w, h: a.h, px: (x, y) => a.rows[y][x] === '1' ? 1 : 0, text: A.ink(a) ? 'x' : '' }; };

  // ---- starting templates
  A.templates = {
    blank: () => A.blank(16, 16),
    symbol: () => { const a = A.blank(16, 16); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.abs(x - 7.5) + Math.abs(y - 7.5); if (Math.abs(d - 6.5) <= 1 || d <= 1.5) A.set(a, x, y, 1); } return a; },
    monogram: (ch) => { const g = T.FONT[(ch || 'K').toUpperCase()] || T.FONT.K, a = A.blank(14, 16); for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (g[y][x] === '1') for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) A.set(a, 2 + x * 2 + i, 1 + y * 2 + j, 1); return a; }
  };

  // ---- artwork: raster -> packed source. rgba is RGBA bytes (w*h*4). d: transparent pixels are '.', others a..p (16 brightness
  // levels). c: the colour of each pixel, 4 bits per channel in two characters of C64 ('--' where transparent). Sources saved
  // before colour was kept have no c and convert by brightness, as they always did.
  const C64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  A.srcFromRGBA = function (rgba, w, h) {
    const sc = Math.min(1, A.SRC_SIDE / Math.max(w, h)), nw = Math.max(1, Math.round(w * sc)), nh = Math.max(1, Math.round(h * sc)); let d = '', c = '';
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw)), y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh)); let aS = 0, lS = 0, rS = 0, gS = 0, bS = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4, al = rgba[i + 3] / 255; aS += al; lS += al * (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]); rS += al * rgba[i]; gS += al * rgba[i + 1]; bS += al * rgba[i + 2]; n++; }
      if (aS / n < 0.5) { d += '.'; c += '--'; continue; }
      d += String.fromCharCode(97 + clamp(Math.floor(lS / aS / 16), 0, 15));
      const q = v => clamp(Math.round(v / aS / 17), 0, 15), code = (q(rS) << 8) | (q(gS) << 4) | q(bS);
      c += C64[code >> 6] + C64[code & 63];
    }
    return { w: nw, h: nh, d, c };
  };
  // colour difference (CIE76, in Lab) of a 12-bit colour code from a reference Lab colour
  const LAB = new Map();
  const lab = code => { let v = LAB.get(code); if (v) return v; const lin = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const r = lin(((code >> 8) & 15) * 17), g = lin(((code >> 4) & 15) * 17), b = lin((code & 15) * 17);
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116, X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    v = [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; LAB.set(code, v); return v; };
  const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const WHITE = 0xFFF;
  const otsu = function (hist, total) {
    let sum = 0; for (let i = 0; i < 16; i++) sum += i * hist[i]; let wB = 0, sB = 0, best = -1, thr = 8;
    for (let t = 0; t < 16; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t + 1; } }
    return thr;                                              // levels below thr are dark
  };
  // conversion options: gh = grid height in pixels (round the rod), thr = cut-off 0..100 (null = automatic; higher keeps more as
  // pattern), invert, crop (trim empty margins), shape (transparent artwork: every visible pixel is pattern, the original rule).
  //
  // Which pixels are the design (ink):
  // - Transparent pixels are always background (Invert flips the whole result, as before).
  // - Transparent artwork: the visible colours are split in two by colour difference from white. When there are two clearly
  //   different groups (a black outline with a white fill, a white eye in a dark shape), the group nearer white is background.
  //   One colour (a plain silhouette, a white logo) stays wholly pattern. 'shape' keeps every visible pixel.
  // - Opaque artwork with a plain border (clip art on a white, coloured or dark background): pattern = colours that differ from
  //   the border colour, so a red heart on green or a yellow star on white separates by colour, not by brightness alone.
  // - Anything else (photos, gradients, sources saved without colour): brightness and the darkness cut-off, as before.
  A.convert = function (src, o) {
    o = Object.assign({ gh: 16, thr: null, invert: false, crop: true, shape: false }, o || {});
    const W = src.w, H = src.h, d = src.d, N = W * H; let tr = 0; const lev = new Array(N), hist = new Array(16).fill(0); let opaque = 0;
    for (let i = 0; i < N; i++) { if (d[i] === '.') { lev[i] = -1; tr++; } else { lev[i] = d.charCodeAt(i) - 97; hist[lev[i]]++; opaque++; } }
    const hasAlpha = tr > 0.03 * N;
    const col = typeof src.c === 'string' && src.c.length === 2 * N ? i => (C64.indexOf(src.c[2 * i]) << 6) | C64.indexOf(src.c[2 * i + 1]) : null;
    const border = []; for (let x = 0; x < W; x++) { border.push(x); if (H > 1) border.push((H - 1) * W + x); } for (let y = 1; y < H - 1; y++) { border.push(y * W); if (W > 1) border.push(y * W + W - 1); }
    const manual = o.thr == null ? null : clamp(Math.round(o.thr / 100 * 16), 1, 15);
    let mode = 'brightness', cut = 8, autoInverted = false, split = false; const ink = new Uint8Array(N);
    // colour difference from a reference, in 16 levels (0 = the same colour, 15 = 94+ apart)
    const diffLevels = ref => { const R = lab(ref), q = new Int8Array(N).fill(-1), hq = new Array(16).fill(0); for (let i = 0; i < N; i++) if (lev[i] >= 0) { q[i] = clamp(Math.floor(dE(lab(col(i)), R) / 6.25), 0, 15); hq[q[i]]++; } return { q, hq }; };
    let bgRef = null;
    if (col && !hasAlpha) {   // plain border? use its most common colour as the background
      const n = new Map(); border.forEach(i => n.set(col(i), (n.get(col(i)) || 0) + 1)); let best = -1, bc = 0; n.forEach((v, k) => { if (v > bc) { bc = v; best = k; } });
      const R = lab(best), near = border.filter(i => dE(lab(col(i)), R) < 12).length; if (near >= 0.6 * border.length) bgRef = best;
    }
    // pixels whose 4 neighbours are the same colour (so not anti-aliased edges): only these count as a real colour area
    const interior = i => { const x = i % W, y = (i / W) | 0; if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false; const c = lab(col(i)); return [i - 1, i + 1, i - W, i + W].every(j => lev[j] >= 0 && dE(lab(col(j)), c) < 10); };
    const minN = Math.max(4, 0.005 * opaque);
    // tone split: among the pattern colours, a clearly darker group with real area (outlines, eyes, mouths, lettering) is kept
    // and the lighter fills become background (on a dark background the lighter group is kept). Whole shape keeps them all.
    const toneSplit = bgL => {
      const idx = []; for (let i = 0; i < N; i++) if (ink[i]) idx.push(i); if (!idx.length) return false;
      const L = i => lab(col(i))[0], hb = new Array(16).fill(0); idx.forEach(i => hb[clamp(Math.floor(L(i) / 6.25), 0, 15)]++);
      const t = otsu(hb, idx.length); let sd = 0, nd = 0, sl = 0, nl = 0, id = 0, il = 0;
      idx.forEach(i => { const dark = Math.floor(L(i) / 6.25) < t, inn = interior(i); if (dark) { sd += L(i); nd++; if (inn) id++; } else { sl += L(i); nl++; if (inn) il++; } });
      if (!nd || !nl || id < minN || il < minN || sl / nl - sd / nd < 25) return false;
      const keepDark = Math.abs(sd / nd - bgL) >= Math.abs(sl / nl - bgL);
      idx.forEach(i => { if ((Math.floor(L(i) / 6.25) < t) !== keepDark) ink[i] = 0; });
      return true;
    };
    if (col && hasAlpha) {
      mode = 'transparent'; const { q, hq } = diffLevels(WHITE);
      let t = otsu(hq, opaque || 1), lo = 0, hi = 0, nl = 0, nh = 0; for (let k = 0; k < 16; k++) { if (k < t) { lo += k * hq[k]; nl += hq[k]; } else { hi += k * hq[k]; nh += hq[k]; } }
      split = !o.shape && nl >= minN && nh >= minN && hi / nh - lo / nl >= 4;
      if (split && manual != null) t = 16 - manual;
      cut = 16 - t; for (let i = 0; i < N; i++) ink[i] = q[i] < 0 ? 0 : (!split || q[i] >= t) ? 1 : 0;
      if (!o.shape && toneSplit(100)) split = true;
    } else if (bgRef != null) {
      mode = 'colour'; const { q, hq } = diffLevels(bgRef);
      const t = manual != null ? 16 - manual : otsu(hq, opaque || 1); cut = 16 - t;
      for (let i = 0; i < N; i++) ink[i] = q[i] >= t ? 1 : 0;
      autoInverted = lab(bgRef)[0] < 40;   // reported so the editor can say a dark background was taken as background
      if (!o.shape && toneSplit(lab(bgRef)[0])) split = true;
    } else {
      cut = manual != null ? manual : otsu(hist, opaque || 1);
      // a dark border means a dark background: flip automatically (independent of the cut-off, so the slider never makes it jump)
      if (!hasAlpha) { let bs = 0, bn = 0; border.forEach(i => { bs += lev[i]; bn++; }); autoInverted = bn > 0 && bs / bn < 5; }
      for (let i = 0; i < N; i++) { let v = lev[i] < 0 ? 0 : hasAlpha ? 1 : (lev[i] < cut ? 1 : 0); if (autoInverted) v = 1 - v; ink[i] = v; }
    }
    // colours merged into two: group the artwork's colour areas (transparency is not a colour; an opaque image's own background
    // colour is) and see whether the design or the background now holds two or more of them
    let colours = 0, mergedColours = false;
    if (col) {
      const groups = []; for (let i = 0; i < N; i++) { if (lev[i] < 0 || !interior(i)) continue; const c = lab(col(i)); let g = groups.find(k => dE(k.c, c) < 20); if (!g) groups.push(g = { c, n: 0, ink: 0 }); g.n++; if (ink[i]) g.ink++; }
      const real = groups.filter(g => g.n >= minN); colours = real.length;
      const inDesign = real.filter(g => g.ink * 2 >= g.n).length; mergedColours = inDesign >= 2 || real.length - inDesign >= 2;
    }
    if (o.invert) for (let i = 0; i < N; i++) ink[i] = 1 - ink[i];
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (o.crop) { x0 = W; y0 = H; x1 = 0; y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); } if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W; y1 = H; } }
    const bw = x1 - x0, bh = y1 - y0, asp = bw / bh; let gh = clamp(Math.round(o.gh), A.MINH, A.MAXH), gw = Math.max(1, Math.round(gh * asp));
    if (gw > A.MAXW) { gw = A.MAXW; gh = clamp(Math.round(gw / asp), 1, A.MAXH); }
    gw = Math.max(gw, 1); gh = Math.max(gh, 1);
    let cells = [], cov = []; for (let gy = 0; gy < gh; gy++) { const row = [], cr = []; for (let gx = 0; gx < gw; gx++) {
      const sx0 = x0 + gx * bw / gw, sx1 = x0 + (gx + 1) * bw / gw, sy0 = y0 + gy * bh / gh, sy1 = y0 + (gy + 1) * bh / gh; let s = 0, n = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y++) for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x++) { s += ink[Math.min(H - 1, y) * W + Math.min(W - 1, x)]; n++; }
      row.push(s / n >= 0.5 ? 1 : 0); cr.push(s / n); } cells.push(row); cov.push(cr); }
    // simplify, keeping real detail: a lone cell is removed only when nothing touches it, even at a corner (so one-cell
    // diagonal lines stay) and it is only partly covered in the artwork (a solid dot stays). A one-cell hole is filled only
    // when it is partly covered (a clear window or eye stays).
    const at = (x, y) => !!(cells[y] && cells[y][x]);
    const nb4 = (x, y) => at(x + 1, y) + at(x - 1, y) + at(x, y + 1) + at(x, y - 1), nb8 = (x, y) => nb4(x, y) + at(x + 1, y + 1) + at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1);
    let removed = 0, filled = 0; const rm = [], fl = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (cells[y][x] && nb8(x, y) === 0 && cov[y][x] < 0.75) rm.push([x, y]); else if (!cells[y][x] && nb4(x, y) === 4 && cov[y][x] > 0.25) fl.push([x, y]); }
    rm.forEach(([x, y]) => { cells[y][x] = 0; removed++; }); fl.forEach(([x, y]) => { cells[y][x] = 1; filled++; });
    const rows = cells.map(r => r.join('')), art = { v: 1, w: gw, h: gh, rows, edited: false };
    // detail lost: parts of the artwork with no matching cell anywhere near them. Pattern pixels whose cell and all 8
    // surrounding cells are background (a line or dot too fine for the grid), and background pixels whose cell and all 8
    // surrounding cells are pattern (a gap that closed up). Edges of shapes that survive are not counted.
    // (outside the grid counts as background)
    const cellOf = (x, y) => [clamp(Math.floor((x + 0.5 - x0) * gw / bw), 0, gw - 1), clamp(Math.floor((y + 0.5 - y0) * gh / bh), 0, gh - 1)];
    const allAround = (gx, gy, v) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = gx + dx, cy = gy + dy; const c = (cx < 0 || cy < 0 || cx >= gw || cy >= gh) ? 0 : cells[cy][cx]; if (c !== v) return false; } return true; };
    const regions = want => { const lost = new Uint8Array(N); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (lev[i] < 0 && want === 0 && mode !== 'brightness') continue; if (ink[i] !== want) continue; const [gx, gy] = cellOf(x, y); if (allAround(gx, gy, 1 - want)) lost[i] = 1; }
      const minPx = Math.max(3, Math.round(0.25 * (bw / gw) * (bh / gh))), seen = new Uint8Array(N); let count = 0;
      for (let i = 0; i < N; i++) if (lost[i] && !seen[i]) { let sz = 0; const st = [i]; seen[i] = 1; while (st.length) { const k = st.pop(), kx = k % W, ky = (k / W) | 0; sz++; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = kx + dx, ny = ky + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (lost[j] && !seen[j]) { seen[j] = 1; st.push(j); } } } if (sz >= minPx) count++; }
      return count; };
    const lostShapes = regions(1), lostGaps = regions(0);
    // detail report (cells touching at a corner are one shape, as in the simplify step)
    const seen = new Set(); let comps = 0; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (cells[y][x] && !seen.has(y * gw + x)) { comps++; const st = [[x, y]]; seen.add(y * gw + x); while (st.length) { const [cx, cy] = st.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; if (cells[ny] && cells[ny][nx] && !seen.has(ny * gw + nx)) { seen.add(ny * gw + nx); st.push([nx, ny]); } }); } }
    let trn = 0; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (x + 1 < gw && cells[y][x] !== cells[y][x + 1]) trn++; if (y + 1 < gh && cells[y][x] !== cells[y + 1][x]) trn++; }
    const busy = trn / (gw * gh * 2), inkN = A.ink(art), frac = inkN / (gw * gh), warn = [];
    if (!inkN) warn.push({ id: 'noart', level: 'warn', text: 'No artwork found. Try Invert, or move the Cut-off towards More.' });
    else {
      if (comps > 10 || busy > 0.35 || removed > Math.max(3, 0.12 * inkN)) warn.push({ id: 'detail', level: 'warn', text: 'This artwork is too detailed to weave faithfully (' + comps + ' separate shapes). It has been simplified. Try a lower detail, a bolder image, or tidy it on the grid.' });
      if (lostShapes || lostGaps) { const parts = []; if (lostShapes) parts.push(lostShapes + (lostShapes === 1 ? ' fine line or small shape' : ' fine lines or small shapes') + ' could not be woven at this size'); if (lostGaps) parts.push(lostGaps + (lostGaps === 1 ? ' small gap was' : ' small gaps were') + ' filled in');
        warn.push({ id: 'lost', level: 'warn', text: 'Some detail was lost: ' + parts.join(' and ') + '. Increase the Detail, use bolder artwork, or add it back on the grid.' }); }
      if (mergedColours) warn.push({ id: 'colours', level: 'warn', text: 'This artwork has ' + colours + ' colours, but a woven design has two: the design colour and the background. Some colours were merged, so the result may look different from your image. Check the grid; Whole shape, Invert and the Cut-off change which parts are kept.' });
      if (split) warn.push({ id: 'lightbg', level: 'info', text: 'Fills inside the artwork are treated as background, so outlines and details show. Choose Whole shape to fill them in.' });
      if (frac > 0.9) warn.push({ id: 'full', level: 'warn', text: 'Almost every cell is filled. Try Invert, or move the Cut-off towards Less.' });
      if (gw * gh < 40) warn.push({ id: 'tiny', level: 'info', text: 'The pattern is very small. Increase the detail for a clearer shape.' });
    }
    return { art, report: { components: comps, busy, removed, filled, lost: lostShapes + lostGaps, lostShapes, lostGaps, colours, mergedColours, ink: inkN, fraction: frac, hasAlpha, autoInverted, split, mode, cut, srcW: W, srcH: H, crop: [x0, y0, x1, y1], warn } };
  };
  // build a complete custom design's art from a source and options (what the editor stores)
  A.fromSource = function (src, conv) {
    const r = A.convert(src, conv), art = r.art; art.src = src; art.conv = Object.assign({ gh: 16, thr: null, invert: false, crop: true, shape: false }, conv || {}); art.report = r.report; return art;
  };
  // ---- saved-design library (plain list, ready to move to account storage)
  A.libUpsert = function (list, d, now) {
    const c = JSON.parse(JSON.stringify(d)); if (!c.id) c.id = 'c' + (now || Date.now()).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const rec = { id: c.id, name: c.name || 'My design', updated: now || Date.now(), design: c }, i = list.findIndex(x => x.id === c.id), out = list.slice();
    if (i >= 0) out[i] = rec; else out.unshift(rec); return out;
  };
  A.newId = () => 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
  A.libRemove = (list, id) => list.filter(x => x.id !== id);
})(typeof self !== 'undefined' ? self : this);
