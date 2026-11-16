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

  // ---- artwork: raster -> packed source. rgba is RGBA bytes (w*h*4). Transparent pixels are '.', others a..p (16 brightness levels).
  A.srcFromRGBA = function (rgba, w, h) {
    const sc = Math.min(1, A.SRC_SIDE / Math.max(w, h)), nw = Math.max(1, Math.round(w * sc)), nh = Math.max(1, Math.round(h * sc)); let d = '';
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw)), y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh)); let aS = 0, lS = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4, al = rgba[i + 3] / 255; aS += al; lS += al * (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]); n++; }
      d += aS / n < 0.5 ? '.' : String.fromCharCode(97 + clamp(Math.floor(lS / aS / 16), 0, 15));
    }
    return { w: nw, h: nh, d };
  };
  const otsu = function (hist, total) {
    let sum = 0; for (let i = 0; i < 16; i++) sum += i * hist[i]; let wB = 0, sB = 0, best = -1, thr = 8;
    for (let t = 0; t < 16; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t + 1; } }
    return thr;                                              // levels below thr are dark
  };
  // conversion options: gh = grid height in pixels (round the rod), thr = darkness cut-off 0..100 (null = automatic), invert, crop (trim empty margins)
  A.convert = function (src, o) {
    o = Object.assign({ gh: 16, thr: null, invert: false, crop: true }, o || {});
    const W = src.w, H = src.h, d = src.d; let tr = 0; const lev = new Array(W * H), hist = new Array(16).fill(0); let opaque = 0;
    for (let i = 0; i < W * H; i++) { if (d[i] === '.') { lev[i] = -1; tr++; } else { lev[i] = d.charCodeAt(i) - 97; hist[lev[i]]++; opaque++; } }
    const hasAlpha = tr > 0.03 * W * H;
    const cut = o.thr == null ? otsu(hist, opaque || 1) : clamp(Math.round(o.thr / 100 * 16), 1, 15);
    const make = flip => { const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) { let v = lev[i] < 0 ? 0 : hasAlpha ? 1 : (lev[i] < cut ? 1 : 0); if (flip) v = 1 - v; ink[i] = v; } return ink; };
    // a dark border means a dark background: flip automatically (independent of the cut-off, so the slider never makes it jump). Invert then flips the visible result.
    let autoInverted = false; if (!hasAlpha) { let bs = 0, bn = 0; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { bs += lev[y * W + x]; bn++; } for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) { bs += lev[y * W + x]; bn++; } autoInverted = bn > 0 && bs / bn < 5; }
    let ink = make(autoInverted !== !!o.invert);
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (o.crop) { x0 = W; y0 = H; x1 = 0; y1 = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); } if (x1 <= x0) { x0 = 0; y0 = 0; x1 = W; y1 = H; } }
    const bw = x1 - x0, bh = y1 - y0, asp = bw / bh; let gh = clamp(Math.round(o.gh), A.MINH, A.MAXH), gw = Math.max(1, Math.round(gh * asp));
    if (gw > A.MAXW) { gw = A.MAXW; gh = clamp(Math.round(gw / asp), 1, A.MAXH); }
    gw = Math.max(gw, 1); gh = Math.max(gh, 1);
    let cells = []; for (let gy = 0; gy < gh; gy++) { const row = []; for (let gx = 0; gx < gw; gx++) {
      const sx0 = x0 + gx * bw / gw, sx1 = x0 + (gx + 1) * bw / gw, sy0 = y0 + gy * bh / gh, sy1 = y0 + (gy + 1) * bh / gh; let s = 0, n = 0;
      for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y++) for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x++) { s += ink[Math.min(H - 1, y) * W + Math.min(W - 1, x)]; n++; }
      row.push(s / n >= 0.5 ? 1 : 0); } cells.push(row); }
    // simplify: remove isolated single cells, fill single-cell holes
    const nb = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].reduce((a, [dx, dy]) => a + ((cells[y + dy] && cells[y + dy][x + dx]) ? 1 : 0), 0);
    let removed = 0, filled = 0; const rm = [], fl = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (cells[y][x] && nb(x, y) === 0) rm.push([x, y]); else if (!cells[y][x] && nb(x, y) === 4) fl.push([x, y]); }
    rm.forEach(([x, y]) => { cells[y][x] = 0; removed++; }); fl.forEach(([x, y]) => { cells[y][x] = 1; filled++; });
    const rows = cells.map(r => r.join('')), art = { v: 1, w: gw, h: gh, rows, edited: false };
    // detail report
    const seen = new Set(); let comps = 0; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (cells[y][x] && !seen.has(y * gw + x)) { comps++; const st = [[x, y]]; seen.add(y * gw + x); while (st.length) { const [cx, cy] = st.pop(); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; if (cells[ny] && cells[ny][nx] && !seen.has(ny * gw + nx)) { seen.add(ny * gw + nx); st.push([nx, ny]); } }); } }
    let trn = 0; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (x + 1 < gw && cells[y][x] !== cells[y][x + 1]) trn++; if (y + 1 < gh && cells[y][x] !== cells[y + 1][x]) trn++; }
    const busy = trn / (gw * gh * 2), inkN = A.ink(art), frac = inkN / (gw * gh), warn = [];
    if (!inkN) warn.push({ id: 'noart', level: 'warn', text: 'No artwork found. Try Invert, or lower the Darkness cut-off.' });
    else {
      if (comps > 10 || busy > 0.35 || removed > Math.max(3, 0.12 * inkN)) warn.push({ id: 'detail', level: 'warn', text: 'This artwork is too detailed to weave faithfully (' + comps + ' separate shapes). It has been simplified. Try a lower detail, a bolder image, or tidy it on the grid.' });
      if (frac > 0.9) warn.push({ id: 'full', level: 'warn', text: 'Almost every cell is filled. Try Invert, or raise the Darkness cut-off.' });
      if (gw * gh < 40) warn.push({ id: 'tiny', level: 'info', text: 'The pattern is very small. Increase the detail for a clearer shape.' });
    }
    return { art, report: { components: comps, busy, removed, filled, ink: inkN, fraction: frac, hasAlpha, autoInverted, cut, srcW: W, srcH: H, crop: [x0, y0, x1, y1], warn } };
  };
  // build a complete custom design's art from a source and options (what the editor stores)
  A.fromSource = function (src, conv) {
    const r = A.convert(src, conv), art = r.art; art.src = src; art.conv = Object.assign({ gh: 16, thr: null, invert: false, crop: true }, conv || {}); art.report = r.report; return art;
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
