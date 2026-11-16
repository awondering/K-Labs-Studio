// Node-level guards for subscriber-specific document branding (behaviour is covered in business-logo-browser.cjs).
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=(...p)=>fs.readFileSync(path.join(__dirname,'..',...p),'utf8');
const Logo=require('../js/business-logo.js');
const ui=read('js','ui.js');const pdf=read('js','invoice-pdf.js');const worker=read('service-worker.js');const entry=read('js','public-entry.js');const sync=read('js','settings-sync.js');

test('sanitise accepts only small raster data URLs and treats everything else as no logo',()=>{
  const ok='data:image/png;base64,iVBORw0KGgo=';
  assert.equal(Logo.sanitise(ok),ok);
  assert.equal(Logo.sanitise('data:image/jpeg;base64,/9j/4AAQ'),'data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(Logo.sanitise('data:image/webp;base64,UklGRg=='),'data:image/webp;base64,UklGRg==');
  for(const bad of [undefined,null,'',42,{},'assets/logo.svg','https://example.com/a.png','javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,PHNjcmlwdD4=','data:image/png;base64,AA" onerror="x','data:image/png;base64,'+'A'.repeat(Logo.MAX_STORED_LENGTH)]){
    assert.equal(Logo.sanitise(bad),'',String(bad).slice(0,40));
  }
});

test('the user picker accepts raster formats only',()=>{
  assert.deepEqual([...Logo.ACCEPT],['image/png','image/jpeg','image/webp']);
  assert.match(read('index.html'),/id="settingsBusinessLogoFile"[^>]*accept="image\/png,image\/jpeg,image\/webp"/);
});

test('no customer-document path falls back to K-Labs identity or fetches the shared logo',()=>{
  assert.doesNotMatch(ui,/businessProfile\.businessName\)\|\|'K-Labs'/,'no K-Labs name fallback');
  assert.doesNotMatch(pdf,/fetch\('assets\/logo\.svg'\)/,'the PDF never fetches the shared logo');
  assert.doesNotMatch(pdf,/'K-LABS STUDIO'/,'no hard-coded software attribution in the PDF');
  const markup=ui.slice(ui.indexOf('function invoiceDocumentMarkup('),ui.indexOf('function invoiceDocumentMarkup(')+3000);
  assert.doesNotMatch(markup,/<img src="assets\/logo\.svg"/,'the invoice header does not hard-code the K-Labs mark');
  assert.match(markup,/brand\.legacy\?/,'the eyebrow exists only for legacy K-Labs invoices');
});

test('new invoice snapshots carry the issuing business logo; legacy snapshots are recognised by the missing brand',()=>{
  assert.match(ui,/brand:\{logo:typeof currentBusinessLogo==='function'\?currentBusinessLogo\(\):''\}/);
  const fn=ui.slice(ui.indexOf('function invoiceBrand('),ui.indexOf('\n}',ui.indexOf('function invoiceBrand('))+2);
  const make=(profileName,accountId)=>{const ctx=vm.createContext({normalizeNameKey:(v)=>String(v||'').trim().toLowerCase(),businessLogoApi:()=>Logo,
    businessProfile:{businessName:profileName},window:{KLABS_ACCOUNT_ID:accountId}});vm.runInContext(fn,ctx);return ctx.invoiceBrand;};
  const png='data:image/png;base64,iVBORw0KGgo=';
  const brand=make('K-Labs','aaaaaaaa-0000-0000-0000-00000000000a');
  assert.equal(brand({brand:{logo:png}}).logo,png);
  assert.equal(brand({brand:{logo:''}}).logo,'');
  assert.equal(brand({brand:{logo:'assets/logo.svg'}}).logo,'','a brand block can never smuggle the shared mark');
  assert.equal(brand({businessName:'Northern Rods'}).logo,'');
  assert.equal(brand(null).logo,'');
  assert.equal(brand({businessName:'K-Labs'}).logo,'assets/logo.svg','the K-Labs account keeps its legacy invoices');
  assert.equal(brand({businessName:'K-Labs'}).legacy,true);
  // Old code stamped "K-Labs" on invoices whose profile name was blank; those must never carry the K-Labs mark for another business.
  for(const other of ['','Northern Rods Ltd','  ',undefined]){
    const b=make(other,'bbbbbbbb-0000-0000-0000-00000000000b')({businessName:'K-Labs'});
    assert.equal(b.logo,'',`profile "${other}"`);assert.equal(b.legacy,false);
  }
  const own='INV-'+'aaaaaaaa00000000000000000000000a'+'-6162';
  assert.equal(brand({businessName:'K-Labs',number:own}).legacy,true,'number embeds this account');
  const foreign='INV-'+'bbbbbbbb00000000000000000000000b'+'-6162';
  assert.equal(brand({businessName:'K-Labs',number:foreign}).legacy,false,'number embeds another account');
});

test('the module is loaded before ui.js, precached, and the settings sync keeps the logo',()=>{
  assert.ok(entry.indexOf('js/business-logo.js')>-1&&entry.indexOf('js/business-logo.js')<entry.indexOf('js/ui.js'));
  const ctx={URL,self:{registration:{scope:'https://example.test/'},addEventListener:()=>{}}};
  vm.runInNewContext(worker+';globalThis.assets=APP_SHELL_ASSETS;',ctx);
  assert.ok(ctx.assets.includes('js/business-logo.js'));
  assert.ok(fs.existsSync(path.join(__dirname,'..','js','business-logo.js')));
  assert.match(sync,/logo: window\.KLABS_BUSINESS_LOGO \? window\.KLABS_BUSINESS_LOGO\.sanitise\(source\.logo\)/);
});

test('software branding on the Studio itself and the workshop template is unchanged',()=>{
  assert.match(read('index.html'),/<strong>K-Labs Studio<\/strong>/);
  assert.match(ui,/<div class="brand">K-Labs Studio<\/div>/,'workshop Grip Wrap template keeps software branding (not a customer document)');
});
