// Q33 production-regression harness: the REAL Studio (its own index.html, sign-in path, private scripts, build sync,
// financial operations and Q32 removal) in WebKit, against the REAL production SQL running in PGlite.
// Only the Supabase library is replaced, by a stand-in that sends each query to that database. Synthetic data only;
// every request outside 127.0.0.1 is refused. Several browser contexts = several devices on the same account.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE);
const { PGlite } = require(process.env.PGLITE_MODULE);
const ACCOUNT = 'aaaaaaaa-0000-4000-8000-000000000001';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

const FAKE_SUPABASE = `(function(){
  var ACCOUNT=${JSON.stringify(ACCOUNT)};
  var session={access_token:'synthetic',refresh_token:'synthetic',expires_in:3600,expires_at:4102444800,token_type:'bearer',
    user:{id:ACCOUNT,email:'builder@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',role:'authenticated'}};
  function query(state){
    var b={
      select:function(c,o){state.select=c||'*';if(o&&o.count)state.count=o.count;if(!state.op)state.op='select';return b;},
      eq:function(c,v){(state.filters=state.filters||[]).push([c,v]);return b;},
      order:function(c,o){state.order=[c,!(o&&o.ascending===false)];return b;},
      range:function(a,z){state.range=[a,z];return b;}, limit:function(n){state.limit=n;return b;},
      insert:function(r){state.op='insert';state.values=r;return b;}, upsert:function(r){state.op='upsert';state.values=r;return b;},
      update:function(r){state.op='update';state.values=r;return b;}, delete:function(){state.op='delete';return b;},
      single:function(){state.single=true;return b;}, maybeSingle:function(){state.maybe=true;return b;},
      abortSignal:function(){return b;},
      then:function(res,rej){return window.klabsDb(JSON.stringify(state)).then(function(r){return JSON.parse(r);}).then(res,rej);}
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
    rpc:function(n,p){return query({rpc:n,params:p||{}});},
    functions:{invoke:function(){return Promise.resolve({data:null,error:{message:'not available in this test'}});}},
    channel:function(){var c={on:function(){return c;},subscribe:function(){return c;},unsubscribe:function(){}};return c;},
    removeChannel:function(){}
  };
  window.supabase={createClient:function(){return client;}};
})();`;

async function createDatabase(sqlRoot) {
  const db = new PGlite();
  const sql = (file) => fs.readFileSync(path.join(sqlRoot, file), 'utf8');
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.klabs_entitlement_can_write(uuid) returns boolean language sql stable
      as $$ select $1 = auth.uid() $$;
    create table public.builds(user_id uuid not null, client_id text not null,
      build_number text not null default '', payload jsonb not null,
      updated_at timestamptz not null default now(), primary key(user_id,client_id));
    alter table public.builds enable row level security;
    create policy own_builds on public.builds to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
    grant usage on schema auth to authenticated;
    grant select,insert,update,delete on public.builds to authenticated;
  `);
  await db.exec(sql('SUPABASE-BUILD-WRITE-GUARD-DRAFT.sql'));
  await db.exec(sql('supabase/migrations/20261111000000_financial_safeguards.sql'));
  await db.exec(sql('supabase/migrations/20261120000000_financial_pricing_pending.sql'));
  await db.exec(sql('supabase/migrations/20261123000000_q32_record_removal.sql'));
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${ACCOUNT}'`);
  return db;
}

function makeHandler(db, log) {
  let quoteCounter = 1045;
  const ROW = `user_id, client_id, build_number, payload, to_json(updated_at)#>>'{}' as updated_at`;
  const where = (filters, params) => (filters || []).map(([c, v]) => {
    if (!['user_id', 'client_id', 'updated_at'].includes(c)) throw new Error('unsupported filter ' + c);
    params.push(v); return `${c} = $${params.length}${c === 'updated_at' ? '::timestamptz' : ''}`;
  }).join(' and ');
  return async (raw) => {
    const s = JSON.parse(raw);
    try {
      if (s.rpc) {
        log.push(`rpc ${s.rpc}`);
        if (s.rpc === 'get_account_entitlement') return JSON.stringify({ data: { access_state: 'paid', can_write: true, email_verified: true, trial_available: false }, error: null });
        if (s.rpc === 'klabs_account_is_blocked' || s.rpc === 'klabs_is_owner') return JSON.stringify({ data: false, error: null });
        if (s.rpc === 'allocate_quote_number') { quoteCounter = Math.max(quoteCounter + 1, Number(s.params.p_minimum_next) || 1); return JSON.stringify({ data: quoteCounter, error: null }); }
        const keys = Object.keys(s.params); const params = [];
        const args = keys.map((k) => { const v = s.params[k]; params.push(v && typeof v === 'object' ? JSON.stringify(v) : v); return `${k} => $${params.length}${v && typeof v === 'object' ? '::jsonb' : ''}`; });
        const r = await db.query(`select public.${s.rpc}(${args.join(', ')}) as result`, params);
        return JSON.stringify({ data: r.rows[0].result, error: null });
      }
      if (s.table !== 'builds') {
        log.push(`${s.op} ${s.table} (empty)`);
        if (s.op === 'select') return JSON.stringify({ data: s.maybe || s.single ? null : [], count: 0, error: null });
        return JSON.stringify({ data: Array.isArray(s.values) ? s.values : s.values ? [s.values] : [], error: null });
      }
      const params = [];
      if (s.op === 'select') {
        const w = where(s.filters, params);
        const countRow = s.count ? (await db.query(`select count(*)::int as n from builds${w ? ' where ' + w : ''}`, params)).rows[0].n : undefined;
        let q = `select ${ROW} from builds${w ? ' where ' + w : ''} order by client_id`;
        if (s.range) q += ` offset ${Number(s.range[0])} limit ${Number(s.range[1]) - Number(s.range[0]) + 1}`;
        const r = await db.query(q, params);
        log.push(`select builds -> ${r.rows.length}`);
        return JSON.stringify({ data: r.rows, count: countRow, error: null });
      }
      if (s.op === 'insert') {
        const v = s.values;
        const r = await db.query(`insert into builds(user_id, client_id, build_number, payload) values ($1,$2,$3,$4::jsonb) returning ${ROW}`,
          [v.user_id, v.client_id, v.build_number || '', JSON.stringify(v.payload)]);
        log.push(`insert builds ${v.client_id}`);
        return JSON.stringify({ data: r.rows, error: null });
      }
      if (s.op === 'update') {
        const sets = Object.entries(s.values).map(([k, v]) => {
          if (!['user_id', 'client_id', 'build_number', 'payload', 'updated_at'].includes(k)) throw new Error('unsupported column ' + k);
          params.push(k === 'payload' ? JSON.stringify(v) : v);
          return `${k} = $${params.length}${k === 'payload' ? '::jsonb' : k === 'updated_at' ? '::timestamptz' : ''}`;
        });
        const w = where(s.filters, params);
        const r = await db.query(`update builds set ${sets.join(', ')} where ${w} returning ${ROW}`, params);
        log.push(`update builds -> ${r.rows.length}`);
        return JSON.stringify({ data: r.rows, error: null });
      }
      if (s.op === 'delete') {
        const w = where(s.filters, params);
        const r = await db.query(`delete from builds where ${w} returning ${ROW}`, params);
        return JSON.stringify({ data: r.rows, error: null });
      }
      throw new Error('unsupported operation ' + s.op);
    } catch (e) {
      log.push(`ERROR ${s.rpc || s.table}: ${e.message}`);
      return JSON.stringify({ data: null, error: { code: e.code || 'XX000', message: e.message } });
    }
  };
}

function serveRoot(getRoot) {
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    const root = getRoot();
    const f = path.resolve(root, '.' + (p === '/' ? '/index.html' : decodeURIComponent(p)));
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(f));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// A device: its own browser context (own storage), signed in to the same account, through Studio's own sign-in path.
async function openDevice(browser, base, handler, { width = 390, name = 'device' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/js/vendor/supabase-')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SUPABASE });
    return route.continue();
  });
  await context.exposeFunction('klabsDb', handler);
  // Studio reloads once on 127.0.0.1 to clear development service workers; mark it done so a launch is one load.
  await context.addInitScript(() => { try { sessionStorage.setItem('klabs-local-dev-reload-done', 'true'); } catch {} });
  const page = await context.newPage();
  const device = { name, context, page, errors: [], mailto: [] };
  page.on('pageerror', (e) => device.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') device.errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (r.url().startsWith('mailto:')) device.mailto.push(r.url()); });
  page.on('framenavigated', (f) => { if (f.url().startsWith('mailto:')) device.mailto.push(f.url()); });
  return device;
}

async function launch(device, base) {
  await device.page.goto(base + '/', { waitUntil: 'load' });
  await device.page.waitForFunction(() => window.KLABS_UI && window.KLABS_BUILD_SYNC && window.KLABS_ACCOUNT_ID, null, { timeout: 30000 });
  await device.page.waitForFunction(() => ['synced', 'local', 'error'].includes(window.KLABS_BUILD_SYNC.getStatus()), null, { timeout: 30000 });
  return device.page.evaluate(() => ({ status: window.KLABS_BUILD_SYNC.getStatus(), mode: window.KLABS_BUILD_SYNC.getMode(), account: window.KLABS_ACCOUNT_ID }));
}

module.exports = { ACCOUNT, createDatabase, makeHandler, serveRoot, openDevice, launch, playwright };
