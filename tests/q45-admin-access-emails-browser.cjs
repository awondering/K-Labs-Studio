// Q45: Administration → builder → complimentary access changes and Access emails in the REAL Studio page (WebKit),
// iPhone 13 (390), iPhone SE (320) and Mac sizes. Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/q45-admin-access-emails-browser.cjs
// The Supabase library is replaced by a stand-in (synthetic owner and builder); its owner-admin function behaves as
// tests/q45-access-email.test.cjs proves the real one does. No email is sent and every request outside 127.0.0.1 is
// refused. Checks: Grant goes to the server function (never a direct database change); the admin is told the access
// was saved and whether the email was accepted (not "delivered") or not sent; Access emails lists each email with its
// status, Retry appears only for an email that was not sent and works; layout fits with 44 px touch targets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
let passed = 0;
const ck = (name, cond, detail) => { assert.ok(cond, `${name}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}`); passed++; console.log('PASS', name); };

const FAKE_SUPABASE = `(function(){
  var cfg=window.__q45||{};
  var calls=window.__q45calls=[];
  var session={access_token:'synthetic',refresh_token:'synthetic',expires_in:3600,expires_at:4102444800,token_type:'bearer',
    user:{id:'aaaaaaaa-0000-4000-8000-0000000000a1',email:'owner@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated'}};
  var builder={builder_user_id:'bbbbbbbb-0000-4000-8000-0000000000b2',email:'a.very-long.builder-address.for-layout@example-custom-rods.test',
    account_created_at:'2026-10-10T00:00:00Z',access_state:'trial_eligible',can_write:false,trial_available:false,trial_started_at:null,trial_expires_at:null,access_expires_at:null,blocked:false};
  var audit=[],notes=[];
  function query(state){
    var b={};
    ['select','eq','neq','in','is','gt','gte','lt','lte','order','range','limit','insert','upsert','update','delete','match','filter','not','or','abortSignal'].forEach(function(k){b[k]=function(){if(['insert','upsert','update','delete'].indexOf(k)>=0)state.write=true;return b;};});
    b.single=function(){state.one=true;return b;};
    b.maybeSingle=function(){state.one=true;return b;};
    b.then=function(res,rej){
      var out,r=state.rpc;
      if(r==='get_account_entitlement')out={data:{access_state:'grandfathered',can_write:true,trial_available:false,email_verified:true,server_time:new Date().toISOString()},error:null};
      else if(r==='klabs_is_owner')out={data:true,error:null};
      else if(r==='klabs_account_is_blocked')out={data:false,error:null};
      else if(r==='admin_list_builders')out={data:[Object.assign({},builder)],error:null};
      else if(r==='admin_list_access_audit')out={data:audit.slice(),error:null};
      else if(r==='admin_list_access_notifications')out={data:notes.slice(),error:null};
      else if(r)out={data:null,error:null};
      else out={data:state.one?null:[],error:null,count:0};
      calls.push({table:state.table,rpc:r,write:!!state.write});
      return Promise.resolve(out).then(res,rej);
    };
    return b;
  }
  function invoke(name,opts){
    var body=opts&&opts.body||{};
    calls.push({fn:name,action:body.action,body:body});
    var now=new Date().toISOString(),msg;
    if(body.action==='set_complimentary'){
      builder.access_state='complimentary';builder.can_write=true;builder.access_expires_at=body.expiresAt;
      audit.unshift({action:'grant_complimentary',created_at:now,reason:body.reason,admin_email:'owner@example.test'});
      var ok=cfg.providerFails!==true;
      notes.unshift({id:'cccccccc-0000-4000-8000-00000000000'+(notes.length+1),event:'granted',status:ok?'accepted':'failed',attempts:1,
        last_error:ok?null:'The email service refused the message (HTTP 422): The from address is not verified.',created_at:now,accepted_at:ok?now:null,access_expires_at:body.expiresAt});
      msg=ok?'Access saved. The email to the builder was accepted by the email service (this does not confirm delivery).'
        :'Access saved. The email to the builder was NOT sent: The email service refused the message (HTTP 422): The from address is not verified. Use Retry email under Access emails.';
      return Promise.resolve({data:{ok:true,accessSaved:true,message:msg},error:null});
    }
    if(body.action==='retry_access_email'){
      notes=notes.map(function(n){return n.id===body.notificationId?Object.assign({},n,{status:'accepted',last_error:null,accepted_at:now,attempts:n.attempts+1}):n;});
      return Promise.resolve({data:{ok:true,message:'The email was accepted by the email service (this does not confirm delivery).'},error:null});
    }
    return Promise.resolve({data:{error:'Unsupported owner administration action.'},error:null});
  }
  var client={
    auth:{
      getSession:function(){return Promise.resolve({data:{session:session},error:null});},
      getUser:function(){return Promise.resolve({data:{user:session.user},error:null});},
      onAuthStateChange:function(cb){setTimeout(function(){cb('INITIAL_SESSION',session);},0);return {data:{subscription:{unsubscribe:function(){}}}};},
      signOut:function(){return Promise.resolve({error:null});},
      refreshSession:function(){return Promise.resolve({data:{session:session},error:null});}
    },
    from:function(t){return query({table:t});},
    rpc:function(n){return query({rpc:n});},
    functions:{invoke:invoke},
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
    res.end(fs.readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function run() {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await playwright[process.env.DEMO_BROWSER || 'webkit'].launch();
  const shots = process.env.Q45_SHOTS;
  try {
    for (const [size, viewport] of [['iPhone 13', { width: 390, height: 844 }], ['iPhone SE', { width: 320, height: 568 }], ['Mac', { width: 1280, height: 860 }]]) {
      for (const providerFails of [true, false]) {
        const label = `${size} (${providerFails ? 'email service fails' : 'email accepted'})`;
        const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
        const outside = [];
        await context.route(/.*/, (r) => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); outside.push(u); return r.abort(); });
        await context.addInitScript((c) => { window.__q45 = c; }, { providerFails });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('dialog', (d) => d.accept());
        await page.goto(base);
        await page.waitForFunction(() => typeof window.KLABS_UI === 'object' && window.KLABS_ADMIN_ACCESS?.isOwner?.() === true, null, { timeout: 30000 });
        // Settings → Open Access Manager, once the owner check has settled (it runs again as the session applies).
        await page.waitForTimeout(1500);
        await page.evaluate(() => window.KLABS_NAV.goScreen('settingsScreen'));
        await page.click('#settingsAdminEntry > summary');
        await page.waitForSelector('#settingsOpenAdminBtn', { state: 'visible', timeout: 15000 });
        await page.click('#settingsOpenAdminBtn');
        await page.waitForSelector('#adminBuilderList .admin-builder-row', { timeout: 15000 });
        await page.click('#adminBuilderList .admin-builder-row');
        await page.waitForSelector('#adminComplimentaryControls:not([hidden])');
        const empty = await page.textContent('#adminNotificationStatus');
        ck(`${label}: Access emails starts empty`, empty === 'No access emails yet.', empty);
        await page.fill('#adminComplimentaryExpiry', '2026-12-31');
        await page.fill('#adminComplimentaryReason', 'Synthetic layout check');
        await page.click('#adminGrantComplimentaryBtn');
        await page.waitForFunction(() => /^Access saved\./.test(document.getElementById('adminChangeStatus').textContent), null, { timeout: 15000 });
        await page.waitForSelector('#adminNotificationList li');
        const calls = await page.evaluate(() => window.__q45calls);
        const grant = calls.find((c) => c.action === 'set_complimentary');
        ck(`${label}: Grant goes to the owner-admin server function with the chosen end date, never a direct database change`,
          grant && grant.fn === 'owner-admin' && /^2026-12-3\d|^2027-01-01/.test(grant.body.expiresAt) && !calls.some((c) => /admin_set_complimentary_access|admin_revoke_builder_access/.test(c.rpc || '')), grant);
        const v = await page.evaluate(() => {
          const li = document.querySelector('#adminNotificationList li');
          const retry = li.querySelector('.admin-notice__retry');
          const r = retry?.getBoundingClientRect();
          const box = li.getBoundingClientRect();
          return {
            status: document.getElementById('adminChangeStatus').textContent,
            title: li.querySelector('strong').textContent, detail: li.querySelector('p').textContent,
            retry: retry ? { w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 } : null,
            sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
            clipped: [...li.querySelectorAll('strong,p')].some((e) => e.scrollWidth > e.clientWidth + 1),
          };
        });
        if (shots) await page.locator('.admin-notice-section').screenshot({ path: path.join(shots, `${size.replace(/ /g, '')}-${providerFails ? 'failed' : 'accepted'}.png`) });
        if (providerFails) {
          ck(`${label}: the admin is told access was saved and the email was NOT sent, with the reason`, /^Access saved\. The email to the builder was NOT sent: .*HTTP 422.*Use Retry email under Access emails\.$/.test(v.status), v.status);
          ck(`${label}: Access emails shows the failure and a 44 px Retry inside the row`, /^Access granted · /.test(v.title) && /^Not sent: /.test(v.detail) && v.retry && v.retry.h >= 44 && v.retry.inside, v);
          await page.click('#adminNotificationList .admin-notice__retry');
          await page.waitForFunction(() => /^The email was accepted/.test(document.getElementById('adminChangeStatus').textContent), null, { timeout: 15000 });
          await page.waitForFunction(() => /^Accepted by the email service/.test(document.querySelector('#adminNotificationList li p')?.textContent || ''), null, { timeout: 15000 });
          const after = await page.evaluate(() => ({ retry: !!document.querySelector('#adminNotificationList .admin-notice__retry'), calls: window.__q45calls.filter((c) => c.action === 'retry_access_email').length }));
          ck(`${label}: Retry sends once; the email then shows as accepted and Retry disappears`, after.calls === 1 && !after.retry, after);
        } else {
          ck(`${label}: the admin is told access was saved and the email was accepted, without claiming delivery`, v.status === 'Access saved. The email to the builder was accepted by the email service (this does not confirm delivery).', v.status);
          ck(`${label}: Access emails shows it as accepted with no Retry`, /^Access granted · /.test(v.title) && /^Accepted by the email service .*Delivery is not confirmed\.$/.test(v.detail) && !v.retry, v);
        }
        ck(`${label}: fits the width, nothing clipped, no outside request, no page error`, !v.sideways && !v.clipped && outside.length === 0 && errors.length === 0, [v, outside, errors]);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`q45-admin-access-emails-browser: ${passed} checks passed`);
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
