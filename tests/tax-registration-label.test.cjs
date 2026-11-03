const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}

function harness(settings={},profile={}){
  const label={textContent:''};
  const nameInput={value:''};
  const c={
    studioSettings:settings,
    businessProfile:{gstNumber:'',contactName:'',phone:'',email:'',website:'',addressLine1:'',addressLine2:'',cityTown:'',postcode:'',country:'',...profile},
    document:{activeElement:null},
    $:(id)=>({settingsTaxRegistrationLabel:label,settingsTaxName:nameInput}[id]||null),
    specificationValue:(v)=>String(v==null?'':v).trim(),
    label,nameInput,
  };
  vm.createContext(c);
  vm.runInContext(['taxTypeInfo','normalizeTaxType','normalizeTaxName','normalizeStudioSettings','activeTaxType','activeTaxName','applyTaxNameInput',
    'taxRegistrationLabelForName','activeTaxRegistrationLabel','syncTaxIdentityControls','customerQuoteBusinessLines']
    .map(fn).join('\n').replace(/function normalizeStudioSettings[\s\S]*?\n}\n/,'function normalizeStudioSettings(s){return s;}\n'),c);
  return c;
}

const CASES=[
  ['GST','GST Number'],['gst','GST Number'],['VAT','VAT Number'],['vat','VAT Number'],['  vat  ','VAT Number'],
  ['Sales Tax','Sales Tax Number'],['HST','HST Number'],['Goods & Services','Goods & Services Number'],
  ['','Tax Registration Number'],['   ','Tax Registration Number'],[undefined,'Tax Registration Number'],
];

test('label rule covers GST, VAT, Sales Tax, custom and blank names',()=>{
  const c=harness();
  for(const [name,expected] of CASES)assert.equal(c.taxRegistrationLabelForName(name),expected,String(name));
});

test('typing in Tax Name updates the Settings label immediately, before save',()=>{
  const bind=source.slice(source.indexOf("taxNameInput.addEventListener('input'"));
  const handler=bind.slice(0,bind.indexOf('});')+3);
  assert.match(handler,/settingsTaxRegistrationLabel/);
  assert.match(handler,/taxRegistrationLabelForName\(taxNameInput\.value\)/);
});

test('saved and reloaded settings show the matching label',()=>{
  const gst=harness({taxType:'gst',taxName:''});
  gst.syncTaxIdentityControls();
  assert.equal(gst.label.textContent,'GST Number');
  const vat=harness({taxType:'vat',taxName:''});
  vat.syncTaxIdentityControls();
  assert.equal(vat.label.textContent,'VAT Number');
  const sales=harness({taxType:'sales_tax',taxName:''});
  sales.syncTaxIdentityControls();
  assert.equal(sales.label.textContent,'Sales Tax Number');
  const custom=harness({taxType:'other',taxName:'Sales Tax'});
  custom.syncTaxIdentityControls();
  assert.equal(custom.label.textContent,'Sales Tax Number');
  assert.equal(custom.nameInput.value,'Sales Tax');
  const blankOther=harness({taxType:'other',taxName:''});
  blankOther.syncTaxIdentityControls();
  assert.equal(blankOther.label.textContent,'Tax Registration Number');
});

test('applying a tax name keeps the existing stored shape and the label follows it',()=>{
  const c=harness({});
  c.applyTaxNameInput('VAT');
  assert.equal(c.activeTaxRegistrationLabel(),'VAT Number');
  c.applyTaxNameInput('Sales Tax');
  assert.deepEqual([c.studioSettings.taxType,c.studioSettings.taxName],['other','Sales Tax']);
  assert.equal(c.activeTaxRegistrationLabel(),'Sales Tax Number');
  c.applyTaxNameInput('GST');
  assert.deepEqual([c.studioSettings.taxType,c.studioSettings.taxName],['gst','']);
  assert.equal(c.activeTaxRegistrationLabel(),'GST Number');
});

test('customer documents label the registration number with the active tax name and keep the stored value',()=>{
  const number='123-456-789';
  for(const [settings,expected] of [
    [{taxType:'gst'},'GST Number'],[{taxType:'vat'},'VAT Number'],[{taxType:'sales_tax'},'Sales Tax Number'],
    [{taxType:'other',taxName:'HST'},'HST Number'],[{taxType:'other',taxName:''},'Tax Registration Number'],
  ]){
    const c=harness(settings,{gstNumber:number});
    assert.ok(c.customerQuoteBusinessLines().includes(`${expected}: ${number}`),expected);
    assert.ok(!c.customerQuoteBusinessLines().some((line)=>/GST Number/.test(line)&&expected!=='GST Number'));
    assert.equal(c.businessProfile.gstNumber,number);
  }
  assert.ok(!harness({taxType:'vat'}).customerQuoteBusinessLines().some((line)=>/Number/.test(line)),'omitted when no number is stored');
});

test('no customer-facing output or settings markup hardcodes "GST Number" outside the label rule',()=>{
  const outside=source.split('\n').filter((line)=>/GST (N|n)umber/i.test(line));
  assert.deepEqual(outside.map((l)=>l.trim()),["if(key==='gst')return 'GST Number';"]);
  assert.ok(html.includes('id="settingsTaxRegistrationLabel">GST Number</span>'));
  assert.ok(!/customerEmailLines[\s\S]{0,6000}gstNumber/.test(fn('customerEmailLines')));
  assert.ok(source.includes("TAX_REGISTRATION_FIELD={id:'settingsBusinessGstNumber',key:'gstNumber'}"),'stored key is unchanged');
});
