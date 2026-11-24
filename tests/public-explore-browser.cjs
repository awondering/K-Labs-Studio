// Q24: the visitor's way in from the public homepage (WebKit). Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/public-explore-browser.cjs
// Serves the repository locally with every outside request refused (no account service), at iPhone 13, iPhone SE and Mac
// sizes. Checks: the homepage shows one Explore entry, EXPLORE STUDIO with no trial wording, and SIGN IN (no Discover
// K-Labs Studio); Explore Studio opens Demo Mode's choice, Build a Rod | Components Library, and each choice starts its own
// demonstration on Studio's screens; Exit demo returns to the homepage; Sign In still opens the sign-in form (with
// account creation) and Back returns home; nothing scrolls sideways.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };
const shots = process.env.EXPLORE_SHOTS || '';

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}
const visible = (page, selector) => page.evaluate((s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }, selector);

async function run() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await playwright[process.env.DEMO_BROWSER || 'webkit'].launch();
  try {
    for (const [name, viewport] of [['iPhone 13', { width: 390, height: 844 }], ['iPhone SE', { width: 320, height: 568 }], ['Mac', { width: 1280, height: 860 }]]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      await context.route(/.*/, (r) => (r.request().url().startsWith(base) ? r.continue() : r.abort()));
      const page = await context.newPage();
      const home = async () => {
        await page.goto(base);
        await page.waitForFunction(() => { const b = document.getElementById('publicExploreBtn'); return b && b.getClientRects().length > 0; }, null, { timeout: 30000 });
      };
      await home();
      const entry = await page.evaluate(() => {
        const box = document.querySelector('.home-public-entry');
        const buttons = [...box.querySelectorAll('button')].filter((b) => b.getClientRects().length > 0);
        const explore = document.getElementById('publicExploreBtn').getBoundingClientRect();
        const signIn = document.getElementById('publicSignInBtn').getBoundingClientRect();
        return { labels: buttons.map((b) => b.textContent.replace(/\s+/g, ' ').trim()), text: document.body.innerText, sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          sameWidth: Math.abs(explore.width - signIn.width) <= 1, below: signIn.top >= explore.bottom };
      });
      ck(`${name}: the homepage offers EXPLORE STUDIO, then SIGN IN - one Explore entry, no Discover`, JSON.stringify(entry.labels) === JSON.stringify(['EXPLORE STUDIO', 'SIGN IN']), entry.labels);
      ck(`${name}: no seven-day trial wording on the homepage`, !/7-day trial|seven-day trial|trial available/i.test(entry.text));
      ck(`${name}: Sign In spans the row under Explore Studio and nothing scrolls sideways`, entry.sameWidth && entry.below && !entry.sideways, entry);
      if (shots) await page.screenshot({ path: path.join(shots, `home-${viewport.width}.png`) });

      // Explore Studio -> the demonstration choice -> Build a Rod.
      await page.click('#publicExploreBtn');
      await page.waitForSelector('#demoIntro:not([hidden])', { timeout: 30000 });
      const intro = await page.evaluate(() => ({ url: window.location.search, rod: document.getElementById('demoStartBtn').textContent, components: document.getElementById('demoStartComponentsBtn').textContent, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 }));
      ck(`${name}: Explore Studio opens Demo Mode's choice, Build a Rod | Components Library`, intro.url === '?demo' && intro.rod === 'BUILD A ROD' && intro.components === 'COMPONENTS LIBRARY' && !intro.sideways, intro);
      if (shots) await page.screenshot({ path: path.join(shots, `choice-${viewport.width}.png`) });
      await page.click('#demoStartBtn');
      await page.waitForFunction(() => /^1\/10 Enquiry/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 30000 });
      await page.waitForFunction(() => document.getElementById('customerFinderSheet') && !document.getElementById('customerFinderSheet').hidden, null, { timeout: 60000 });
      ck(`${name}: Build a Rod starts the rod build demonstration on Studio's screens`, await visible(page, '[data-demo-chapter="10"]'));
      // Exit demo returns to the homepage.
      await page.click('#demoPlayerExitBtn');
      await page.waitForFunction(() => !/demo/.test(window.location.search) && document.getElementById('publicExploreBtn')?.getClientRects().length > 0, null, { timeout: 30000 });
      ck(`${name}: Exit demo returns to the homepage`, !(await page.evaluate(() => document.documentElement.classList.contains('klabs-demo'))));

      // Explore Studio -> Components Library.
      await page.click('#publicExploreBtn');
      await page.waitForSelector('#demoIntro:not([hidden])', { timeout: 30000 });
      await page.click('#demoStartComponentsBtn');
      await page.waitForFunction(() => /^1\/8 Component/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 30000 });
      await page.waitForFunction(() => { const p = document.getElementById('studioComponentsPanel'); return p && !p.hidden && p.getClientRects().length > 0; }, null, { timeout: 60000 });
      ck(`${name}: Components Library starts its demonstration in the real library`, await visible(page, '[data-demo-components-chapter="8"]'));
      await page.click('#demoPlayerExitBtn');
      await page.waitForFunction(() => !/demo/.test(window.location.search) && document.getElementById('publicExploreBtn')?.getClientRects().length > 0, null, { timeout: 30000 });

      // Sign In is unchanged: the sign-in form, account creation, and Back to the homepage.
      await page.click('#publicSignInBtn');
      await page.waitForFunction(() => getComputedStyle(document.getElementById('authScreen')).display === 'flex', null, { timeout: 10000 });
      const auth = await page.evaluate(() => ({ email: document.getElementById('authEmail').getClientRects().length > 0, signIn: document.getElementById('authSignIn').textContent.trim(), signUp: document.getElementById('authShowSignUp').getClientRects().length > 0, demo: document.documentElement.classList.contains('klabs-demo') }));
      ck(`${name}: Sign In opens the sign-in form with account creation, not the demonstration`, auth.email && auth.signIn === 'Sign In' && auth.signUp && !auth.demo, auth);
      await page.click('#authBackHome');
      await page.waitForFunction(() => getComputedStyle(document.getElementById('authScreen')).display === 'none' && document.getElementById('publicExploreBtn').getClientRects().length > 0, null, { timeout: 10000 });
      ck(`${name}: Back returns from sign-in to the homepage`, true);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`public-explore-browser: ${passed} checks passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
