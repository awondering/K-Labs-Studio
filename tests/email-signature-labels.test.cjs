const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const syncSource=fs.readFileSync(path.join(__dirname,'..','js','settings-sync.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

const profile={businessName:'Woof Rods',contactName:'Kevin',phone:'027 000 0000',email:'k@example.test',website:'www.example.test'};

function emailCtx(studioSettings){
  const c={
    quote:{customerName:'Bren Pine',quoteNumber:'Q-1',jobType:'build',payments:[],fulfilmentMethod:'collection'},
    businessProfile:profile,studioSettings,
    currentBuildLifecycleStatus:()=>'quote',
    depositMaths:()=>({total:500,depositEnabled:true,depositAmount:100,remainingBalance:400,amountReceived:0,balanceOwing:500,depositOutstanding:true,depositStillRequired:100}),
    customerIncludedParts:()=>['3 × Two Part Clear Coat'],
    customerQuoteConfirmationText:()=>'text',
    specificationValue:(v)=>String(v==null?'':v).trim(),
    normalizeNameKey:(v)=>String(v==null?'':v).trim().toLowerCase(),
    currencyWithCode:(v)=>`$${Number(v).toFixed(2)}`,
    customerFulfilmentSection:()=>null,
    businessProfileHasPaymentDetails:()=>false,
    formatCustomerEmailLongDate:()=>'1 December 2026',
  };
  vm.createContext(c);
  vm.runInContext(['normalizeJobType','activeEmailIncludeSignature','customerDocumentLabels','customerEmailSignatureLines','customerEmailLines'].map(fn).join('\n'),c);
  return c;
}

test('signature on when preference is unset (existing users) or true',()=>{
  for(const s of [{},{emailIncludeSignature:true}]){
    const text=emailCtx(s).customerEmailLines().join('\n');
    assert.match(text,/Kind regards,\nWoof Rods\nKevin\n027 000 0000/);
  }
});

test('signature off removes only the signature',()=>{
  const on=emailCtx({}).customerEmailLines();
  const off=emailCtx({emailIncludeSignature:false}).customerEmailLines();
  const idx=on.indexOf('Kind regards,');
  assert.ok(idx>0);
  assert.deepEqual(Array.from(off),Array.from(on).slice(0,idx-1));
  assert.match(off[0],/^Hi Bren,/);
  assert.ok(!off.join('\n').includes('Kind regards'));
  assert.ok(off.join('\n').includes('3 × Two Part Clear Coat'));
});

test('preference is normalized and synced as a boolean only when set',()=>{
  const c={};vm.createContext(c);
  const sandbox={window:{}};
  assert.match(fn('normalizeStudioSettings'),/emailIncludeSignature/);
  assert.match(syncSource,/emailIncludeSignature/);
  const ctx=vm.createContext({
    numberOrZero:Number,normalizeMeasurementUnits:(v)=>v,normalizeImperialDisplay:(v)=>v,normalizeDateFormat:(v)=>v,normalizeCurrency:(v)=>v||'NZD',
    normalizeTaxType:(v)=>v||'gst',normalizeTaxName:(v)=>v||''
  });
  vm.runInContext(fn('normalizeStudioSettings'),ctx);
  assert.ok(!('emailIncludeSignature' in ctx.normalizeStudioSettings({})));
  assert.ok(!('emailIncludeSignature' in ctx.normalizeStudioSettings({emailIncludeSignature:'x'})));
  assert.equal(ctx.normalizeStudioSettings({emailIncludeSignature:false}).emailIncludeSignature,false);
  assert.equal(ctx.normalizeStudioSettings({emailIncludeSignature:true}).emailIncludeSignature,true);
});

test('settings control exists, persists via saveStudioSettings and resyncs on account reload',()=>{
  assert.match(html,/Include Business Signature in Emails/);
  assert.match(html,/Turn off if your email app already adds a signature\./);
  assert.match(html,/id="settingsEmailIncludeSignature"/);
  assert.match(source,/studioSettings\.emailIncludeSignature=emailSignatureInput\.checked;\s*const ok=saveStudioSettings\(\)/);
  assert.match(fn('syncSettingsPreferenceControls'),/settingsEmailIncludeSignature/);
});

test('pricing labels and neutral headings',()=>{
  assert.ok(!/includes delivery/i.test(html));
  assert.ok(!/includes delivery/i.test(source.replace(/Delivery \(included in Total Price\)/g,'')));
  assert.match(html,/<span>Customer Price<\/span>/);
  assert.match(source,/`Customer Price \(\$\{activeCurrencyCode\(\)\}\)`/);
  assert.match(html,/quote-section__toggle-title">Job Pricing</);
  assert.match(html,/quote-section__toggle-title">Job Actions</);
  assert.ok(!/>Build Pricing</.test(html));
  assert.ok(!/>Build Actions</.test(html));
});

test('saved fulfilment method is highlighted when the job is rendered',()=>{
  assert.match(fn('renderWorkshopQuote'),/syncFulfilmentSelector\(\)/);
  const buttons=['collection','shipping'].map((m)=>{
    const attrs={};
    return {attrs,getAttribute:(k)=>k==='data-fulfilment-method'?m:attrs[k],setAttribute:(k,v)=>{attrs[k]=v;}};
  });
  const c={quote:{fulfilmentMethod:'shipping'},document:{querySelectorAll:()=>buttons},$:()=>null,fulfilmentStudioNote:()=>''};
  vm.createContext(c);
  vm.runInContext(['normalizeFulfilmentMethod','syncFulfilmentSelector'].map(fn).join('\n'),c);
  c.syncFulfilmentSelector();
  assert.equal(buttons[0].attrs['aria-pressed'],'false');
  assert.equal(buttons[1].attrs['aria-pressed'],'true');
  c.quote.fulfilmentMethod='';
  c.syncFulfilmentSelector();
  assert.equal(buttons[1].attrs['aria-pressed'],'false');
});
