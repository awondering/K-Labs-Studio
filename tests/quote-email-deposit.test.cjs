// Quote email deposit wording (F2). Runs the REAL ui.js email, deposit and pricing code on synthetic jobs.
// With Deposit Required off, a quote email must not show a $0.00 deposit or say a deposit must be received;
// it asks the customer to confirm instead. With a deposit required, the wording is unchanged.
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadRecordFunctions}=require('./helpers/job-record-loader.cjs');

const el=()=>({value:'',checked:false,hidden:false,textContent:'',classList:{contains:()=>false,toggle(){}},setAttribute(){},getAttribute:()=>null});
const c=loadRecordFunctions(['normalizeQuote','customerEmailLines'],{
  $:el,document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:el},Store:{get:(k,f)=>f,set:()=>true},
  window:{KLABS_ACCOUNT_ID:'acct'},activeAccountKey:()=>'acct',formatDateDisplay:(v)=>String(v),formatCustomerEmailLongDate:(d)=>String(d),
  businessProfile:{businessName:'Synthetic Rods',contactName:'Sam Test',phone:'000 000',email:'shop@example.invalid',
    paymentAccountName:'Synthetic Rods Ltd',paymentAccountNumber:'00-0000-0000000-00'},
});
const job=(jobType,extra={})=>({id:'build-synthetic-email',quoteNumber:'Q-EMAIL',customerName:'Pat Example',
  buildName:jobType==='repair'?'Shimano Spin 7ft':'Coastal 9ft Light Surf',jobType,quoteStatus:'quote',
  components:[{category:'Guide',description:'Fuji ring',quantity:8,unitPrice:20,cost:6}],labourRate:75,labourHours:3,
  pricingDriver:'price',priceAdjustment:0,fulfilmentMethod:'collection',depositEnabled:false,depositType:'percent',depositValue:0,
  payments:[],estimatedCompletionDate:'2026-12-15',notes:jobType==='repair'?'Rewrap guides':'',...extra});
const email=(record)=>{c.quote=c.normalizeQuote(record);return c.customerEmailLines().join('\n');};
const DEPOSIT_ON={depositEnabled:true,depositType:'percent',depositValue:30};

for(const [jobType,work] of [['repair','repair'],['build','build']]){
  test(`${jobType} quote email, Deposit Required off: no deposit line, asks the customer to confirm`,()=>{
    const text=email(job(jobType));
    assert.match(text,/^Total: \$385\.00 NZD\nEstimated completion: /m);
    assert.doesNotMatch(text,/Deposit required|Balance remaining|\$0\.00/);
    assert.doesNotMatch(text,/deposit has been received/i);
    assert.match(text,new RegExp(`\\n\\nPlease reply to confirm you would like to proceed with your ${work}\\.\\n\\nKind regards,`));
    assert.match(text,/Payment Details\nAccount name: Synthetic Rods Ltd/,'payment details stay, as before');
  });

  test(`${jobType} quote email, deposit required: existing wording unchanged`,()=>{
    const text=email(job(jobType,DEPOSIT_ON));
    assert.match(text,/^Total: \$385\.00 NZD\nDeposit required: \$115\.50 NZD\nBalance remaining: \$269\.50 NZD\nEstimated completion: /m);
    assert.match(text,new RegExp(`\\n\\nOnce the deposit has been received, your ${work} will be confirmed\\.\\n\\nKind regards,`));
    assert.doesNotMatch(text,/Please reply to confirm/);
  });

  test(`${jobType} quote email: a 0% deposit counts as no deposit required`,()=>{
    const text=email(job(jobType,{depositEnabled:true,depositType:'percent',depositValue:0}));
    assert.doesNotMatch(text,/Deposit required|deposit has been received/i);
    assert.match(text,/Please reply to confirm you would like to proceed/);
  });

  test(`${jobType} quote email, deposit required and fully received: no closing request (unchanged)`,()=>{
    const text=email(job(jobType,{...DEPOSIT_ON,payments:[{id:'p1',type:'deposit',amount:115.5,date:'2026-11-18'}]}));
    assert.match(text,/Deposit received: \$115\.50 NZD\nBalance owing: \$269\.50 NZD/);
    assert.doesNotMatch(text,/deposit has been received|Please reply to confirm/);
  });

  test(`${jobType} confirmation and completion emails are unchanged by this fix`,()=>{
    for(const quoteStatus of ['active','complete']){
      const text=email(job(jobType,{quoteStatus}));
      assert.doesNotMatch(text,/Please reply to confirm|deposit has been received/);
    }
  });
}

test('Components order emails are untouched (never deposit wording or the new request)',()=>{
  const text=email(job('build',{jobKind:'components',labourRate:0,labourHours:0}));
  assert.doesNotMatch(text,/Deposit required|deposit has been received|Please reply to confirm/);
});
