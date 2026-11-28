// Q18 Phase 5: one demonstration. The access-routing matrix in the REAL Studio page (WebKit), iPhone 13 (390),
// iPhone SE (320) and Mac sizes. Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/explore-demo-routing-browser.cjs
// The Supabase library is replaced by a stand-in whose account access the test controls (as in
// tests/q40-subscription-browser.cjs); every request outside 127.0.0.1 is refused. Synthetic accounts only.
// Checks: a signed-out visitor's Explore Studio and a signed-in account without access (never subscribed, ended) both
// open the same scripted Demo Mode (?demo) - no separate Explore screen exists; the account screen keeps the
// subscription panel, Explore Studio and Sign Out; on the demonstration page the account's real session and stored
// records cannot be read and are left unchanged, nothing is written to browser storage and no Supabase client exists;
// Pause, Play, Replay and Exit work, and Exit returns the signed-in account to its account screen; paid, complimentary
// (dated and open-ended) and grandfathered accounts open their real Studio, never the demonstration; an unverified
// account must verify first; the public Knowledge Base opens without an account; no sideways scroll at any size.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };

// Signed in when window.__acct is set before the page loads; signed out otherwise. Records every write and sign-out.
const FAKE_SUPABASE = `(function(){
  var cfg=window.__acct||null;
  var calls=window.__acctCalls=[];
  var session=cfg?{access_token:'synthetic',refresh_token:'synthetic',expires_in:3600,expires_at:4102444800,token_type:'bearer',
    user:{id:'aaaaaaaa-0000-4000-8000-0000000000b5',email:'builder@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated'}}:null;
  function entitlement(){
    var now=new Date().toISOString();
    var out=Object.assign({trial_available:false,email_verified:true,server_time:now},cfg.entitlement);
    if(typeof out.access_expires_in==='number'){out.access_expires_at=new Date(Date.now()+out.access_expires_in).toISOString();delete out.access_expires_in;}
    return out;
  }
  function query(state){
    var b={};
    ['select','eq','neq','in','is','gt','gte','lt','lte','order','range','limit','insert','upsert','update','delete','match','filter','not','or','abortSignal'].forEach(function(k){b[k]=function(){if(['insert','upsert','update','delete'].indexOf(k)>=0)state.write=true;return b;};});
    b.single=function(){state.one=true;return b;};
    b.maybeSingle=function(){state.one=true;return b;};
    b.then=function(res,rej){
      var out;
      if(state.rpc==='get_account_entitlement')out={data:entitlement(),error:null};
      else if(state.rpc)out={data:state.rpc==='klabs_account_is_blocked'||state.rpc==='klabs_is_owner'?false:null,error:null};
      else if(state.table==='billing_subscriptions')out={data:null,error:null};
      else out={data:state.one?null:[],error:null,count:0};
      calls.push({table:state.table,rpc:state.rpc,write:!!state.write});
      return Promise.resolve(out).then(res,rej);
    };
    return b;
  }
  var client={
    auth:{
      getSession:function(){return Promise.resolve({data:{session:session},error:null});},
      getUser:function(){return Promise.resolve({data:{user:session&&session.user},error:null});},
      onAuthStateChange:function(cb){setTimeout(function(){cb('INITIAL_SESSION',session);},0);return {data:{subscription:{unsubscribe:function(){}}}};},
      signOut:function(){calls.push({signOut:true});try{sessionStorage.setItem('__signedOut',String(Number(sessionStorage.getItem('__signedOut')||0)+1));}catch(e){}return Promise.resolve({error:null});},
      refreshSession:function(){return Promise.resolve({data:{session:session},error:null});},
      signInWithPassword:function(){return Promise.resolve({data:{session:session},error:null});}
    },
    from:function(t){return query({table:t});},
    rpc:function(n){return query({rpc:n});},
    functions:{invoke:function(name){calls.push({fn:name});return Promise.resolve({data:{url:'https://checkout.stripe.com/c/pay/cs_test_synthetic'},error:null});}},
    channel:function(){var c={on:function(){return c;},subscribe:function(){return c;},unsubscribe:function(){}};return c;},
    removeChannel:function(){}
  };
  window.supabase={createClient:function(){return client;}};
})();`;

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/js/vendor/supabase-2.119.0.js') {
      res.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
      return res.end(FAKE_SUPABASE);
    }
    let p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// What a signed-in browser already holds: the account's session and a private record (synthetic values).
const PRIVATE = { 'sb-synthetic-auth-token': '{"access_token":"synthetic-private-token"}', 'klabs-private-record-probe': '{"customer":"Private Customer Probe"}' };
const DAY = 24 * 3600 * 1000;

async function run() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await playwright[process.env.DEMO_BROWSER || 'webkit'].launch();
  try {
    for (const [size, viewport] of [['iPhone 13', { width: 390, height: 844 }], ['iPhone SE', { width: 320, height: 568 }], ['Mac', { width: 1280, height: 860 }]]) {
      const open = async (acct, query = '') => {
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
        const outside = [];
        await context.route(/.*/, (r) => { const url = r.request().url(); if (url.startsWith(base)) return r.continue(); outside.push(url); return r.abort(); });
        // The account's own stored session and record are in real browser storage before Studio loads (once per context).
        await context.addInitScript(({ acct, data }) => {
          if (acct) window.__acct = acct;
          try { if (!sessionStorage.getItem('__seeded')) { Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v)); sessionStorage.setItem('__seeded', '1'); } } catch (e) { /* demo page */ }
        }, { acct, data: PRIVATE });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => { if (/demonstration stopped/i.test(m.text())) errors.push(m.text()); });
        await page.goto(base + query);
        return { context, page, outside, errors };
      };
      const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const accessScreen = (page) => page.waitForFunction(() => { const s = document.getElementById('accountAccessScreen'); return s && !s.hidden && document.querySelector('#accessBillingPanel .billing-status'); }, null, { timeout: 20000 });
      const demoIntro = (page) => page.waitForSelector('#demoIntro:not([hidden])', { timeout: 30000 });
      // Real browser storage, read natively (the demonstration page replaces Storage methods with its in-memory overlay).
      const nativeStorage = (page) => page.evaluate(() => {
        const frame = document.createElement('iframe');
        frame.src = 'about:blank';
        document.body.appendChild(frame);
        const proto = frame.contentWindow.Storage.prototype;
        const n = Object.getOwnPropertyDescriptor(proto, 'length').get.call(localStorage);
        const out = {};
        for (let i = 0; i < n; i++) { const k = proto.key.call(localStorage, i); out[k] = proto.getItem.call(localStorage, k); }
        frame.remove();
        return out;
      });

      // 1. Signed out: Explore Studio on the homepage opens Demo Mode.
      {
        const t = await open(null);
        await t.page.waitForSelector('#publicExploreBtn', { state: 'visible', timeout: 20000 });
        await t.page.click('#publicExploreBtn');
        await demoIntro(t.page);
        const v = await t.page.evaluate(() => ({ url: location.search, choices: [...document.querySelectorAll('.demo-intro__start')].map((b) => b.textContent), explore: !!document.getElementById('exploreDemoScreen') }));
        ck(`${size}: signed out - Explore Studio opens the scripted Demo Mode`, v.url === '?demo' && v.choices.length === 3 && !v.explore && !(await sideways(t.page)) && t.errors.length === 0, [v, t.errors]);
        await t.context.close();
      }

      // 2. Signed in without access (never subscribed; ended): the account screen, then the same Demo Mode, isolated.
      for (const [label, entitlement] of [['never subscribed', { access_state: 'trial_eligible', can_write: false }], ['ended', { access_state: 'expired', can_write: false, access_expires_in: -DAY }]]) {
        const t = await open({ entitlement });
        await accessScreen(t.page);
        const screen = await t.page.evaluate(() => {
          const btn = document.getElementById('enterExploreDemoBtn');
          const r = btn.getBoundingClientRect();
          return {
            explore: btn.textContent, height: Math.round(r.height), plans: document.querySelectorAll('#accessBillingPanel [data-billing-plan]').length,
            signOut: !!document.getElementById('accessSignOutBtn')?.getClientRects().length, studioScripts: typeof window.KLABS_UI,
            oldScreen: !!document.getElementById('exploreDemoScreen'), message: document.getElementById('accountAccessMessage').textContent,
          };
        });
        ck(`${size}: ${label} - account screen keeps Subscribe, Explore Studio and Sign Out; Studio not loaded`,
          screen.explore === 'EXPLORE STUDIO' && screen.height >= 44 && screen.plans === 2 && screen.signOut && screen.studioScripts === 'undefined' && !screen.oldScreen && !(await sideways(t.page)), screen);
        const before = await nativeStorage(t.page);
        await t.page.click('#enterExploreDemoBtn');
        await demoIntro(t.page);
        const demo = await t.page.evaluate((keys) => ({
          url: location.search,
          reads: keys.map((k) => { try { return localStorage.getItem(k); } catch (e) { return 'blocked'; } }),
          sb: window.KLABS_SUPABASE_CLIENT == null ? 'none' : 'client', access: window.KLABS_ACCESS_STATE?.access_state, isolated: window.KLABS_DEMO?.isolated,
          choices: [...document.querySelectorAll('.demo-intro__start')].map((b) => b.textContent),
        }), Object.keys(PRIVATE));
        ck(`${size}: ${label} - Explore Studio opens the same scripted Demo Mode`, demo.url === '?demo' && demo.choices.join('|') === 'BUILD A ROD|COMPONENTS LIBRARY|WORKSHOP TOOLS', demo);
        ck(`${size}: ${label} - the demonstration cannot read the account's session or records and has no Supabase client`,
          demo.reads.every((v) => v === null) && demo.sb === 'none' && demo.access === 'demo' && demo.isolated === true, demo);
        if (size === 'iPhone 13') {
          // Pause and Play, then Replay (fresh data at chapter 1), on the signed-in account's demonstration.
          await t.page.click('#demoStartBtn');
          await t.page.waitForFunction(() => /^1\/10/.test(document.getElementById('demoChapterLabel').textContent), null, { timeout: 30000 });
          await t.page.waitForTimeout(2500);
          await t.page.click('#demoPlayPauseBtn');
          await t.page.waitForTimeout(1200);
          const held = await t.page.evaluate(() => [document.getElementById('demoPlayPauseBtn').textContent, window.KLABS_DEMO.writeCount()]);
          await t.page.waitForTimeout(2000);
          const still = await t.page.evaluate(() => [document.getElementById('demoPlayPauseBtn').textContent, window.KLABS_DEMO.writeCount(), document.getElementById('demoCaption').textContent]);
          ck(`${size}: ${label} - Pause holds the demonstration`, held[0] === 'Play' && held[1] === still[1] && /^Paused/.test(still[2]), [held, still]);
          await t.page.click('#demoPlayPauseBtn');
          await t.page.waitForFunction(() => document.getElementById('demoPlayPauseBtn').textContent === 'Pause', null, { timeout: 10000 });
          await t.page.click('#demoReplayBtn');
          await t.page.waitForFunction(() => /^1\/10 Enquiry/.test(document.getElementById('demoChapterLabel')?.textContent || ''), null, { timeout: 60000 });
          ck(`${size}: ${label} - Play continues and Replay restarts from chapter 1`, true);
          await t.page.click('#demoPlayerExitBtn');
        } else {
          await t.page.click('#demoIntroExitBtn');
        }
        // Exit demo returns the signed-in account to its own account screen; its stored session and records are untouched.
        await t.page.waitForFunction(() => !/demo/.test(location.search), null, { timeout: 30000 });
        await accessScreen(t.page);
        const after = await nativeStorage(t.page);
        const added = Object.keys(after).filter((k) => !(k in before));
        const changed = Object.keys(PRIVATE).filter((k) => after[k] !== before[k]);
        const calls = await t.page.evaluate(() => window.__acctCalls);
        ck(`${size}: ${label} - Exit returns to the account screen, still signed in`, !calls.some((c) => c.signOut) && (await t.page.evaluate(() => document.getElementById('enterExploreDemoBtn').getClientRects().length > 0)));
        ck(`${size}: ${label} - the account's stored session and records unchanged; the demonstration wrote nothing to browser storage`,
          changed.length === 0 && Object.keys(PRIVATE).every((k) => after[k] === PRIVATE[k]) && added.every((k) => !/demo|quote|build|customer|component/i.test(k)), { changed, added });
        ck(`${size}: ${label} - no server write, no outside request, no page error`, !calls.some((c) => c.write) && t.outside.length === 0 && t.errors.length === 0, [calls.filter((c) => c.write), t.outside, t.errors]);
        if (size === 'iPhone 13' && label === 'ended') {
          await Promise.all([t.page.waitForEvent('load', { timeout: 20000 }), t.page.click('#accessSignOutBtn')]);
          ck(`${size}: ${label} - Sign Out signs out through Supabase and reloads`, (await t.page.evaluate(() => sessionStorage.getItem('__signedOut'))) === '1');
        }
        await t.context.close();
      }

      // 3. Paid, complimentary (dated and open-ended) and grandfathered accounts open their real Studio.
      for (const [label, entitlement] of [
        ['paid', { access_state: 'paid', can_write: true, access_expires_in: 30 * DAY }],
        ['complimentary (dated)', { access_state: 'complimentary', can_write: true, access_expires_in: 30 * DAY }],
        ['complimentary (open-ended)', { access_state: 'complimentary', can_write: true, access_expires_at: null }],
        ['grandfathered', { access_state: 'grandfathered', can_write: true }],
      ]) {
        const t = await open({ entitlement });
        await t.page.waitForFunction(() => document.getElementById('app').style.display !== 'none' && !document.body.classList.contains('klabs-entry-choice')
          && !document.body.classList.contains('klabs-auth-resolving') && typeof window.KLABS_UI === 'object', null, { timeout: 30000 });
        const v = await t.page.evaluate(() => ({ url: location.search, access: document.getElementById('accountAccessScreen').hidden, demo: document.documentElement.classList.contains('klabs-demo'), state: window.KLABS_ACCESS_STATE?.access_state }));
        ck(`${size}: ${label} - opens the real Studio, not the demonstration`, v.url === '' && v.access === true && !v.demo && !(await sideways(t.page)), v);
        await t.context.close();
      }

      // 4. An unverified account verifies first (unchanged).
      {
        const t = await open({ entitlement: { access_state: 'trial_eligible', can_write: false, email_verified: false } });
        await t.page.waitForFunction(() => !document.getElementById('accountAccessScreen').hidden, null, { timeout: 20000 });
        const v = await t.page.evaluate(() => ({ choices: document.getElementById('accountAccessChoices').hidden, verify: !document.getElementById('verifyEmailContinueBtn').hidden }));
        ck(`${size}: unverified - asked to verify email before subscribing or exploring`, v.choices && v.verify, v);
        await t.context.close();
      }

      // 5. The Knowledge Base is public: it opens with no account and loads no sign-in or account script.
      {
        const t = await open(null, 'knowledge/');
        const v = await t.page.evaluate(() => ({ title: document.title, links: document.querySelectorAll('a[href*="knowledge/"], a[href^="../"], a[href^="./"]').length, scripts: [...document.scripts].filter((s) => s.src).map((s) => s.src), sb: typeof window.supabase }));
        ck(`${size}: Knowledge Base opens without an account or subscription`, /Knowledge/i.test(v.title) && v.scripts.every((src) => /\/js\/knowledge-(base|public)\.js$/.test(src)) && v.sb === 'undefined' && v.links > 0 && !(await sideways(t.page)), v);
        await t.context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`explore-demo-routing-browser: ${passed} checks passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
