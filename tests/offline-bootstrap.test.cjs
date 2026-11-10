const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const worker=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
const entry=fs.readFileSync(path.join(root,'js/public-entry.js'),'utf8');
const library='js/vendor/supabase-2.119.0.js';

test('pinned Supabase client matches the upstream npm bundle and is loaded locally',()=>{
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,library))).digest('hex');
  assert.equal(hash,'a867edbcfb029370aeec7223dd6180b560b621fbe3bc64c6584fb0369d1b7bce');
  assert.ok(html.includes(`<script src="${library}"></script>`));
  assert.doesNotMatch(html,/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/);
  assert.match(fs.readFileSync(path.join(root,'js/vendor/supabase-LICENSE.txt'),'utf8'),/MIT License/);
});

test('service worker precaches all authentication and private bootstrap scripts',()=>{
  const handlers={};
  const context={URL,self:{registration:{scope:'https://example.test/'},addEventListener:(name,fn)=>{handlers[name]=fn;}}};
  vm.runInNewContext(worker+';globalThis.assets=APP_SHELL_ASSETS;',context);
  const scripts=[...entry.matchAll(/"((?:js\/)[^"]+\.js)"/g)].map(match=>match[1]);
  const required=[library,'js/public-entry.js','js/supabase-config.js','js/supabase-client.js',...scripts];
  for(const asset of required){
    assert.ok(context.assets.includes(asset),`${asset} is not precached`);
    assert.ok(fs.existsSync(path.join(root,asset)),`${asset} does not exist`);
  }
  assert.equal(typeof handlers.install,'function');
});
