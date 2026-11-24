// Q11 (launch): Thread Design Studio in a real browser.
// - Text-to-Thread: accented letters and macrons are woven as their base capital ("Tāne Smith" -> TANE SMITH), word spacing
//   kept; characters with no letter are still reported.
// - Upload Artwork is hidden (no tile, no wording); a design already converted from an upload still opens with its controls.
// - Draw Your Own Design is unchanged: templates, tap drawing, Undo, a valid plan, autosave.
// WebKit (Safari's engine) as iPhone 390 / 320 with touch and as a 1280 desktop, then Chromium desktop.
// Usage: PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... [CHROMIUM_EXECUTABLE=...] node tests/thread-studio-launch-browser.cjs [screenshot dir]
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);

const root = path.join(__dirname, '..');
const shots = process.argv[2] || '';
let passed = 0;
let failed = 0;
const ck = (tag, name, ok, detail) => { if (ok) { passed++; console.log(`PASS [${tag}] ${name}`); } else { failed++; console.log(`FAIL [${tag}] ${name}`, '\n     ', JSON.stringify(detail)); } };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}
const inkCount = (p) => p.evaluate(() => __ts.d.art.rows.join('').split('1').length - 1);

async function run(browser, engine, { width, height, mobile }, page0) {
  const tag = `${engine} ${mobile ? 'iPhone' : 'desktop'} ${width}`;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile && engine === 'webkit', deviceScaleFactor: 2 });
  const p = await context.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const tap = (sel) => (mobile ? p.locator(sel).first().tap() : p.locator(sel).first().click());
  await p.goto(page0);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(250);
  const shot = (name) => (shots && (width !== 320) ? p.screenshot({ path: path.join(shots, `${name}-${engine}-${mobile ? 'iphone' : 'desktop'}-${width}.png`) }) : null);

  // ---- Upload Artwork hidden
  const home = await p.locator('[data-act=custom]').innerText();
  ck(tag, 'start screen: Create Your Own Design no longer mentions uploading', /Draw a logo or symbol\./.test(home) && !/upload/i.test(home), home);
  await tap('[data-act=custom]');
  await p.waitForTimeout(200);
  const custom = await p.evaluate(() => ({ text: document.getElementById('app').innerText, file: document.querySelectorAll('#file, input[type=file], .tile.upl').length,
    tiles: [...document.querySelectorAll('[data-tpl]')].map((t) => t.dataset.tpl + '|' + t.querySelector('b').textContent), over: document.documentElement.scrollWidth > innerWidth }));
  ck(tag, 'Create Your Own: no Upload Artwork tile or file picker, no upload wording', custom.file === 0 && !/upload|PNG, JPG|artwork/i.test(custom.text), custom);
  ck(tag, 'Draw Your Own: the same three starting points (blank grid, geometric symbol, monogram), no sideways overflow',
    JSON.stringify(custom.tiles) === JSON.stringify(['blank|Blank grid', 'symbol|Geometric symbol', 'monogram|Monogram']) && !custom.over, custom);
  await shot('create-your-own');

  // ---- Draw Your Own unchanged: draw by tap/click, Undo, plan, autosave
  await tap('[data-tpl=blank]');
  await p.waitForTimeout(300);
  const ink0 = await inkCount(p);
  const box = await p.locator('#gridc').boundingBox();
  const cw = box.width / await p.evaluate(() => __ts.d.art.w);
  for (let i = 2; i < 10; i++) {
    const x = box.x + (i + 0.5) * cw, y = box.y + 4.5 * cw;
    if (mobile) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
  }
  await p.waitForTimeout(150);
  const ink1 = await inkCount(p);
  ck(tag, 'Draw Your Own: tapping or clicking 8 cells draws 8 cells', ink1 - ink0 === 8, { ink0, ink1 });
  await tap('[data-act=undo]');
  await p.waitForTimeout(100);
  ck(tag, 'Draw Your Own: Undo removes the last cell', (await inkCount(p)) === ink1 - 1);
  const plan = await p.evaluate(() => ({ M: __ts.L.M, rows: __ts.L.rows, pattern: __ts.d.pattern, rod: !!document.getElementById('rod') }));
  ck(tag, 'Draw Your Own: a valid woven plan with the rod preview', plan.pattern === 'wovencustom' && plan.M > 0 && plan.rows > 0 && plan.rod, plan);
  await shot('draw-your-own');
  await p.reload();
  await p.waitForTimeout(250);
  ck(tag, 'Draw Your Own: autosave offers the drawing again after a reload', (await p.locator('.resume').count()) > 0);

  // ---- A design converted from an upload before launch still opens with its conversion controls
  await p.evaluate(() => {
    const w = 64, h = 64, rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, ink = Math.hypot(x - 32, y - 32) < 22; rgba[i] = rgba[i + 1] = rgba[i + 2] = ink ? 20 : 255; rgba[i + 3] = 255; }
    const art = THREAD.art.fromSource(THREAD.art.srcFromRGBA(rgba, w, h), { gh: 16 });
    localStorage.clear();
    localStorage.setItem('ktds.design.v1', JSON.stringify(THREAD.createDesign('wovencustom', { art, name: 'Saved upload' })));
  });
  await p.reload();
  await p.waitForTimeout(250);
  await tap('.resume');
  await p.waitForTimeout(250);
  const saved = await p.evaluate(() => ({ src: !!(__ts.d.art && __ts.d.art.src), artbox: document.querySelectorAll('#artbox').length, ink: __ts.d.art.rows.join('').split('1').length - 1 }));
  ck(tag, 'a design already converted from an upload still opens, keeping its source and conversion controls', saved.src && saved.artbox === 1 && saved.ink > 20, saved);

  // ---- Text-to-Thread: accents and macrons
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(250);
  await tap('[data-act=text]');
  await p.waitForTimeout(300);
  const lettering = async (text) => {
    await p.fill('#txt', text);
    await p.waitForTimeout(250);
    return p.evaluate(() => ({ typed: __ts.d.text, woven: __ts.L.text.bm.text, width: __ts.L.text.bm.w, spans: __ts.L.text.spans.map((s) => s.ch).join(''),
      chars: (__ts.L.warnings.find((w) => w.id === 'chars') || {}).text || '', shown: document.getElementById('app').innerText }));
  };
  const tane = await lettering('Tāne Smith');
  const plain = await lettering('TANE SMITH');
  ck(tag, '"Tāne Smith" is woven as TANE SMITH (the ā kept as A, no gap), the typed name is kept as typed',
    tane.typed === 'Tāne Smith' && tane.woven === 'TANE SMITH' && tane.spans === 'TANE SMITH' && tane.chars === '' && !/Left out/.test(tane.shown), tane);
  ck(tag, 'word spacing and letters identical to typing TANE SMITH (one column between letters, three for the space)', tane.width === plain.width && tane.width === 9 * 5 + 7 * 1 + (1 + 3 + 1), { tane: tane.width, plain: plain.width });
  const more = [];
  for (const [text, want] of [['Ngāti Whātua', 'NGATI WHATUA'], ['Hōne Heke', 'HONE HEKE'], ['Zoë & José', 'ZOE & JOSE'], ['Øyvind Ærø', 'OYVIND AERO']]) {
    const r = await lettering(text);
    more.push([text, r.woven, r.chars]);
  }
  ck(tag, 'other macrons and accents: Ngāti Whātua, Hōne Heke, Zoë & José, Øyvind Ærø all woven in full, nothing left out',
    JSON.stringify(more) === JSON.stringify([['Ngāti Whātua', 'NGATI WHATUA', ''], ['Hōne Heke', 'HONE HEKE', ''], ['Zoë & José', 'ZOE & JOSE', ''], ['Øyvind Ærø', 'OYVIND AERO', '']]), more);
  const bad = await lettering('Tāne @ #1');
  ck(tag, 'characters with no letter (@ #) are still reported on screen and not woven', bad.woven === 'TANE 1' && /@/.test(bad.chars) && /#/.test(bad.chars) && !/Ā/.test(bad.chars) && /Left out/.test(bad.shown), bad);
  await lettering('Tāne Smith');
  await shot('lettering-tane');
  const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ck(tag, 'lettering screen: no sideways overflow', !over);

  ck(tag, 'no page errors', errors.length === 0, errors);
  await context.close();
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const page0 = `${base}/thread-studio/index.html`;
  try {
    const host = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    ck('Workshop', 'the Thread Design Studio launcher describes "your own designs", not artwork uploads', /woven lettering and your own designs\./.test(host) && !/your own artwork/.test(host));
    const webkit = await playwright.webkit.launch();
    try {
      await run(webkit, 'webkit', { width: 390, height: 844, mobile: true }, page0);
      await run(webkit, 'webkit', { width: 320, height: 640, mobile: true }, page0);
      await run(webkit, 'webkit', { width: 1280, height: 900, mobile: false }, page0);
    } finally { await webkit.close(); }
    const chromium = await playwright.chromium.launch(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {});
    try {
      await run(chromium, 'chromium', { width: 1280, height: 900, mobile: false }, page0);
    } finally { await chromium.close(); }
  } finally { server.close(); }
  console.log(`thread studio launch: ${passed}/${passed + failed} checks passed`);
  if (failed) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
