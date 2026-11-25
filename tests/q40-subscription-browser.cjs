// Q40 Stage B: the subscription interface in the REAL Studio page (WebKit), iPhone 13 and Mac sizes.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/q40-subscription-browser.cjs
// The Supabase library is replaced by a stand-in whose account access the test controls; every request outside
// 127.0.0.1 is refused (Stripe pages are recorded, never opened). Synthetic account only; no Stripe, no network.
// Checks: an account without access stops at the subscription screen (NZD/USD, monthly/annual, no trial wording,
// Studio's scripts never load); Subscribe asks the server for Checkout and only follows a Stripe Checkout address;
// returning from Checkout opens Studio only once the SERVER confirms access; Cancelled checkout says no payment was
// taken; an ended subscription is locked with Manage billing; Settings shows the plan and renewal date and opens the
// Customer Portal; at the exact paid-through time Studio covers the records and continues once the renewal is
// confirmed (no reload); a failed renewal closes Studio to the subscription screen.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };

// The stand-in reads window.__q40 (set before the page loads) and records calls in window.__q40calls.
const FAKE_SUPABASE = `(function(){
  var cfg=window.__q40||{};
  var calls=window.__q40calls=[];
  var session={access_token:'synthetic',refresh_token:'synthetic',expires_in:3600,expires_at:4102444800,token_type:'bearer',
    user:{id:'aaaaaaaa-0000-4000-8000-0000000000a1',email:'builder@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated'}};
  // Counters survive a reload (Studio reloads to the subscription screen when access ends).
  function bump(key){var n=Number(sessionStorage.getItem(key)||0)+1;sessionStorage.setItem(key,String(n));return n;}
  // Timeline mode: paid until T, unconfirmed for renewedAfter ms (renewal being charged), then renewed (or failed).
  var t0=Number(sessionStorage.getItem('q40t0')||0);if(!t0){t0=Date.now();sessionStorage.setItem('q40t0',String(t0));}
  function phase(){var tl=cfg.timeline;if(!tl)return null;var t=Date.now()-t0;return t<tl.endsIn?'paid':(tl.renewedAfter!=null&&t>=tl.endsIn+tl.renewedAfter)?'renewed':'waiting';}
  function entitlement(){
    var ph=phase();
    if(ph){var now=new Date().toISOString();
      if(ph==='paid')return {access_state:'paid',can_write:true,trial_available:false,email_verified:true,server_time:now,access_expires_at:new Date(t0+cfg.timeline.endsIn).toISOString()};
      if(ph==='renewed')return {access_state:'paid',can_write:true,trial_available:false,email_verified:true,server_time:now,access_expires_at:new Date(Date.now()+30*86400000).toISOString()};
      return {access_state:'expired',can_write:false,trial_available:false,email_verified:true,server_time:now,access_expires_at:new Date(t0+cfg.timeline.endsIn).toISOString()};}
    var polls=bump('q40polls');
    var list=cfg.entitlements||[cfg.entitlement];
    var e=list[Math.min(polls-1,list.length-1)];
    var now=new Date().toISOString();
    var out=Object.assign({trial_available:false,email_verified:true,server_time:now},e);
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
      else if(state.rpc==='klabs_account_is_blocked'||state.rpc==='klabs_is_owner')out={data:false,error:null};
      else if(state.rpc)out={data:null,error:null};
      else if(state.table==='billing_subscriptions'&&cfg.timeline){
        var ph2=phase(),base={plan:'monthly',currency:'nzd',cancel_at_period_end:false,stripe_customer_id:'cus_synthetic'};
        out={data:ph2==='renewed'?Object.assign({status:'active',renewal_state:null,paid_through:new Date(Date.now()+30*86400000).toISOString()},base)
          :ph2==='paid'?Object.assign({status:'active',renewal_state:null,paid_through:new Date(t0+cfg.timeline.endsIn).toISOString()},base)
          :Object.assign({status:cfg.timeline.fails?'past_due':'active',renewal_state:cfg.timeline.fails?'failed':'pending',paid_through:new Date(t0+cfg.timeline.endsIn).toISOString()},base),error:null};
      }
      else if(state.table==='billing_subscriptions'){
        var subs=cfg.subs||[cfg.sub||null];
        state.n=bump('q40subs');
        out={data:subs[Math.min(state.n-1,subs.length-1)],error:null};
      }
      else out={data:state.one?null:[],error:null,count:0};
      calls.push({table:state.table,rpc:state.rpc,write:!!state.write});
      return Promise.resolve(out).then(res,rej);
    };
    return b;
  }
  var client={
    auth:{
      getSession:function(){return Promise.resolve({data:{session:session},error:null});},
      getUser:function(){return Promise.resolve({data:{user:session.user},error:null});},
      onAuthStateChange:function(cb){setTimeout(function(){cb('INITIAL_SESSION',session);},0);return {data:{subscription:{unsubscribe:function(){}}}};},
      signOut:function(){return Promise.resolve({error:null});},
      refreshSession:function(){return Promise.resolve({data:{session:session},error:null});},
      signInWithPassword:function(){return Promise.resolve({data:{session:session},error:null});}
    },
    from:function(t){return query({table:t});},
    rpc:function(n){return query({rpc:n});},
    functions:{invoke:function(name,opts){
      calls.push({fn:name,body:opts&&opts.body});
      var url=name==='billing-checkout'?(cfg.checkoutUrl||'https://checkout.stripe.com/c/pay/cs_test_synthetic'):'https://billing.stripe.com/p/session/test_synthetic';
      return Promise.resolve({data:{url:url},error:null});
    }},
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
    const p = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const DAY = 24 * 3600 * 1000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

async function run() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await playwright[process.env.DEMO_BROWSER || 'webkit'].launch();
  try {
    for (const [size, viewport] of [['iPhone 13', { width: 390, height: 844 }], ['Mac', { width: 1280, height: 860 }]]) {
      const open = async (cfg, query = '') => {
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
        const outside = [];
        await context.route(/.*/, (r) => {
          const url = r.request().url();
          if (url.startsWith(base)) return r.continue();
          outside.push(url);
          return r.abort();
        });
        await context.addInitScript((c) => { window.__q40 = c; }, cfg);
        const page = await context.newPage();
        const scripts = [];
        page.on('request', (req) => { if (req.resourceType() === 'script') scripts.push(new URL(req.url()).pathname); });
        await page.goto(base + query);
        return { context, page, outside, scripts };
      };
      // Optional: Q40_SHOTS=<folder> saves screenshots of each customer screen for visual review (checks unchanged).
      const shot = async (page, name) => { if (process.env.Q40_SHOTS) await page.screenshot({ path: path.join(process.env.Q40_SHOTS, `${size.replace(/ /g, '')}-${name}.png`) }); };
      const accessScreen = (page) => page.waitForFunction(() => {
        const s = document.getElementById('accountAccessScreen');
        return s && !s.hidden && document.querySelector('#accessBillingPanel .billing-status');
      }, null, { timeout: 20000 });
      const studioOpen = (page) => page.waitForFunction(() => document.getElementById('app').style.display !== 'none'
        && !document.body.classList.contains('klabs-entry-choice') && !document.body.classList.contains('klabs-auth-resolving')
        && typeof window.KLABS_UI === 'object', null, { timeout: 30000 }).catch(async (e) => {
        console.log('DEBUG', JSON.stringify(await page.evaluate(() => ({ app: document.getElementById('app').style.display, cls: document.body.className,
          ui: typeof window.KLABS_UI, auth: document.getElementById('authMessage').textContent, access: window.KLABS_ACCESS_STATE, err: document.getElementById('accountAccessError').textContent }))));
        throw e;
      });

      // 1. A new account (no access): subscription screen, plans in NZD and USD, no trial, Studio never loads.
      {
        const t = await open({ entitlement: { access_state: 'trial_eligible', can_write: false }, sub: null });
        await accessScreen(t.page);
        const view = await t.page.evaluate(() => ({
          message: document.getElementById('accountAccessMessage').textContent,
          plans: [...document.querySelectorAll('#accessBillingPanel [data-billing-plan]')].map((b) => b.textContent.trim()),
          pressed: document.querySelector('[data-billing-currency="nzd"]').getAttribute('aria-pressed'),
          text: document.body.innerText,
          sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          manage: !!document.querySelector('#accessBillingPanel [data-billing-manage]'),
          statusHidden: document.querySelector('#accessBillingPanel .billing-status').hidden,
        }));
        ck(`${size}: a new account is offered a subscription`, /Subscribe to start working in Studio/.test(view.message), view.message);
        ck(`${size}: the offer is said once (no repeated subscription line under the heading)`, view.statusHidden === true);
        ck(`${size}: NZD plans shown by default`, view.pressed === 'true' && view.plans[0] === 'SUBSCRIBE · NZ$34 / MONTH' && view.plans[1] === 'SUBSCRIBE · NZ$299 / YEAR', view.plans);
        ck(`${size}: no trial wording anywhere`, !/7-day|seven-day|START MY.*TRIAL/i.test(view.text));
        ck(`${size}: no Manage billing before any billing account exists`, !view.manage);
        ck(`${size}: subscription screen fits the width`, !view.sideways);
        await shot(t.page, '1-subscribe-nzd');
        await t.page.click('[data-billing-currency="usd"]');
        const usd = await t.page.evaluate(() => [...document.querySelectorAll('#accessBillingPanel [data-billing-plan]')].map((b) => b.textContent.trim()));
        ck(`${size}: USD plans`, usd[0] === 'SUBSCRIBE · US$19 / MONTH' && usd[1] === 'SUBSCRIBE · US$169 / YEAR', usd);
        await shot(t.page, '1b-subscribe-usd');
        await t.page.click('[data-billing-plan="annual"]');
        await t.page.waitForFunction(() => window.__q40calls.some((c) => c.fn === 'billing-checkout'));
        await t.page.waitForTimeout(300);
        const call = await t.page.evaluate(() => window.__q40calls.find((c) => c.fn === 'billing-checkout').body);
        ck(`${size}: Subscribe asks the server for Checkout with the chosen plan and currency`, call.plan === 'annual' && call.currency === 'usd', call);
        ck(`${size}: the browser goes to Stripe Checkout`, t.outside.some((u) => u.startsWith('https://checkout.stripe.com/c/pay/cs_test_synthetic')), t.outside);
        // (Studio's files may be pre-downloaded for speed; they must never run.)
        const ran = await t.page.evaluate(() => ({ ui: typeof window.KLABS_UI, sync: typeof window.KLABS_BUILD_SYNC, access: window.KLABS_ACCESS_STATE || null }));
        ck(`${size}: Studio's private code never ran without access`, ran.ui === 'undefined' && ran.sync === 'undefined' && ran.access === null, ran);
        await t.context.close();
      }

      // 2. A server answer that is not a Stripe Checkout address is refused.
      {
        const t = await open({ entitlement: { access_state: 'trial_eligible', can_write: false }, sub: null, checkoutUrl: 'https://example.com/pay' });
        await accessScreen(t.page);
        await t.page.click('[data-billing-plan="monthly"]');
        await t.page.waitForFunction(() => document.querySelector('#accessBillingPanel .billing-error').textContent.length > 0);
        const err = await t.page.evaluate(() => document.querySelector('#accessBillingPanel .billing-error').textContent);
        ck(`${size}: a non-Stripe address is never followed`, /unexpected address/.test(err) && !t.outside.some((u) => u.startsWith('https://example.com')), { err, outside: t.outside });
        await t.context.close();
      }

      // 3. Back from Checkout: Studio opens only when the server confirms access (here on the third check).
      {
        const paid = { access_state: 'paid', can_write: true, access_expires_in: 30 * DAY };
        const t = await open({ entitlements: [{ access_state: 'trial_eligible', can_write: false }, { access_state: 'trial_eligible', can_write: false }, { access_state: 'trial_eligible', can_write: false }, paid],
          sub: { status: 'active', plan: 'monthly', currency: 'nzd', paid_through: iso(30 * DAY), cancel_at_period_end: false, renewal_state: null, stripe_customer_id: 'cus_synthetic' } }, '?checkout=success');
        await t.page.waitForFunction(() => /Confirming your payment with Stripe/.test(document.getElementById('accountAccessMessage').textContent), null, { timeout: 20000 });
        const waiting = await t.page.evaluate(() => ({ app: document.getElementById('app').style.display, query: location.search }));
        await shot(t.page, '3-confirming-payment');
        ck(`${size}: after Checkout Studio waits for the server (the address no longer claims success)`, waiting.app === 'none' && waiting.query === '', waiting);
        await studioOpen(t.page);
        ck(`${size}: Studio opens once the server confirms the payment`, true);
        await t.context.close();
      }

      // 4. Checkout cancelled.
      {
        const t = await open({ entitlement: { access_state: 'trial_eligible', can_write: false }, sub: null }, '?checkout=cancelled');
        await accessScreen(t.page);
        const message = await t.page.evaluate(() => document.getElementById('accountAccessMessage').textContent);
        await shot(t.page, '4-checkout-cancelled');
        ck(`${size}: cancelled checkout says no payment was taken`, message === 'Checkout was cancelled. No payment was taken.', message);
        await t.context.close();
      }

      // 5. An ended subscription: locked, records not loaded, plans and Manage billing offered.
      {
        const t = await open({ entitlement: { access_state: 'expired', can_write: false, access_expires_at: iso(-DAY) },
          sub: { status: 'canceled', plan: 'monthly', currency: 'nzd', paid_through: null, cancel_at_period_end: false, renewal_state: null, stripe_customer_id: 'cus_synthetic' } });
        await accessScreen(t.page);
        const view = await t.page.evaluate(() => ({ message: document.getElementById('accountAccessMessage').textContent,
          status: document.querySelector('#accessBillingPanel .billing-status').textContent,
          statusHidden: document.querySelector('#accessBillingPanel .billing-status').hidden,
          plans: document.querySelectorAll('#accessBillingPanel [data-billing-plan]').length, manage: !!document.querySelector('#accessBillingPanel [data-billing-manage]'),
          app: document.getElementById('app').style.display }));
        ck(`${size}: an ended account is locked with its records kept`, /access has ended/.test(view.message) && /records are kept safely/.test(view.message) && view.app === 'none', view);
        ck(`${size}: an ended account can subscribe again or manage billing`, view.plans === 2 && view.manage, view);
        ck(`${size}: the ended message is said once (no repeated subscription line under the heading)`, view.statusHidden === true, view);
        const locked = await t.page.evaluate(() => ({ ui: typeof window.KLABS_UI, sync: typeof window.KLABS_BUILD_SYNC,
          reads: window.__q40calls.filter((c) => ['builds', 'components', 'component_taxonomy', 'studio_settings', 'quote_number_counters'].includes(c.table)).length }));
        ck(`${size}: no records or sync requested for an ended account`, locked.ui === 'undefined' && locked.sync === 'undefined' && locked.reads === 0, locked);
        await shot(t.page, '5-ended-locked');
        await t.page.click('#accessBillingPanel [data-billing-manage]');
        await t.page.waitForTimeout(400);
        ck(`${size}: Manage billing opens the Stripe Customer Portal`, t.outside.some((u) => u.startsWith('https://billing.stripe.com/p/session/')), t.outside);
        await t.context.close();
      }

      // 6. Paid: Settings → Account shows the plan and renewal date; a cancelled plan shows its end; Manage billing.
      for (const [label, sub, expect] of [
        ['active', { status: 'active', plan: 'annual', currency: 'nzd', paid_through: '2027-11-26T03:00:00Z', cancel_at_period_end: false, renewal_state: null, stripe_customer_id: 'cus_synthetic' }, /^NZ\$299 per year\. Renews automatically on 26 November 2027\.$/],
        ['cancelled', { status: 'active', plan: 'monthly', currency: 'usd', paid_through: '2026-12-26T03:00:00Z', cancel_at_period_end: true, renewal_state: null, stripe_customer_id: 'cus_synthetic' }, /^US\$19 per month\. Cancelled — access continues until 26 December 2026, then ends\.$/],
      ]) {
        const t = await open({ entitlement: { access_state: 'paid', can_write: true, access_expires_in: 30 * DAY }, sub });
        await studioOpen(t.page);
        // Open Settings as a customer does (tap the Settings tab) and wait until it is really on screen and stays there.
        const settingsShown = () => t.page.evaluate(() => {
          const screen = document.getElementById('settingsScreen');
          return !!screen && screen.classList.contains('active') && getComputedStyle(screen).display !== 'none' && Number(getComputedStyle(screen).opacity) === 1;
        });
        for (let i = 0; i < 10; i += 1) {
          await t.page.click('.bottom-nav [data-nav="settingsScreen"]');
          await t.page.waitForTimeout(700);
          if (await settingsShown()) { await t.page.waitForTimeout(700); if (await settingsShown()) break; }
        }
        await t.page.evaluate(() => { document.getElementById('settingsAccountCard').open = true; });
        await t.page.waitForFunction(() => document.querySelector('#settingsBillingPanel .billing-status'), null, { timeout: 10000 });
        await t.page.evaluate(() => document.querySelector('.settings-billing').scrollIntoView({ block: 'center' }));
        await t.page.waitForTimeout(400);
        const visible = await t.page.evaluate(() => {
          const r = document.querySelector('#settingsBillingPanel .billing-status').getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && !!hit && !!hit.closest('#settingsBillingPanel');
        });
        ck(`${size}: ${label}: Settings is on screen with the subscription visible to the customer`, (await settingsShown()) && visible);
        const view = await t.page.evaluate(() => ({ hidden: document.querySelector('.settings-billing').hidden,
          status: document.querySelector('#settingsBillingPanel .billing-status').textContent,
          plans: document.querySelectorAll('#settingsBillingPanel [data-billing-plan]').length,
          manage: !!document.querySelector('#settingsBillingPanel [data-billing-manage]'),
          sideways: document.documentElement.scrollWidth > window.innerWidth + 1 }));
        await shot(t.page, `6-settings-${label}`);
        ck(`${size}: Settings shows the ${label} subscription`, !view.hidden && expect.test(view.status), view.status);
        ck(`${size}: ${label}: Manage billing, no second subscription offered`, view.manage && view.plans === 0, view);
        ck(`${size}: ${label}: Settings fits the width`, !view.sideways);
        await t.context.close();
      }

      // 7. At the exact paid-through time while Studio is open: records covered, renewal confirmed, Studio continues.
      {
        const t = await open({ timeline: { endsIn: 6000, renewedAfter: 5000 } });
        await studioOpen(t.page);
        await t.page.evaluate(() => { window.__q40reloaded = false; window.addEventListener('beforeunload', () => { window.__q40reloaded = true; }); });
        await t.page.waitForFunction(() => !document.getElementById('renewalCheckOverlay').hidden, null, { timeout: 15000 });
        const during = await t.page.evaluate(() => ({ canWrite: window.KLABS_CAN_WRITE(), text: document.getElementById('renewalCheckTitle').textContent,
          covered: (() => { const r = document.getElementById('renewalCheckOverlay').getBoundingClientRect(); return r.width >= window.innerWidth && r.height >= window.innerHeight; })() }));
        await shot(t.page, '7-renewal-check');
        ck(`${size}: at the paid-through time nothing can be saved and the records are covered`, during.canWrite === false && during.covered && during.text === 'Confirming your renewal…', during);
        await t.page.waitForFunction(() => document.getElementById('renewalCheckOverlay').hidden, null, { timeout: 15000 });
        const after = await t.page.evaluate(() => ({ canWrite: window.KLABS_CAN_WRITE(), reloaded: window.__q40reloaded, app: document.getElementById('app').style.display,
          expires: window.KLABS_ACCESS_STATE.access_expires_at }));
        ck(`${size}: a confirmed renewal continues Studio without a reload`, after.canWrite && !after.reloaded && after.app !== 'none' && Date.parse(after.expires) > Date.now() + 29 * DAY, after);
        await t.context.close();
      }

      // 8. At the paid-through time with a failed renewal: Studio closes to the subscription screen.
      {
        const t = await open({ timeline: { endsIn: 6000, fails: true } });
        await studioOpen(t.page);
        await t.page.waitForFunction(() => !document.getElementById('renewalCheckOverlay').hidden || document.body.classList.contains('klabs-entry-choice'), null, { timeout: 15000 });
        await t.page.waitForFunction(() => { const s = document.getElementById('accountAccessScreen'); return s && !s.hidden && document.querySelector('#accessBillingPanel .billing-status'); }, null, { timeout: 20000 });
        const view = await t.page.evaluate(() => ({ status: document.querySelector('#accessBillingPanel .billing-status').textContent, manage: !!document.querySelector('#accessBillingPanel [data-billing-manage]'), app: document.getElementById('app').style.display }));
        await shot(t.page, '8-renewal-failed');
        ck(`${size}: a failed renewal closes Studio and asks for a card update`, view.app === 'none' && /renewal payment did not go through/.test(view.status) && view.manage, view);
        await t.context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`q40 subscription browser: ${passed} checks passed`);
}
run().catch((e) => { console.error('FAIL', e); process.exit(1); });
