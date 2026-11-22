// Q23 review fixes, browser design checks of the build screen (Rod Price, delivery, payment, documents) at Mac and iPhone 13.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright [TDS_BROWSER=webkit] node tests/build-screen-design-browser.cjs
// Serves the repository from a local HTTP server with all other network refused. Synthetic data only; nothing is saved.
// Checks, in Quote (Courier / Shipping), Active and Complete:
//  - GST: the rod figure, the customer total with delivery and the GST Amount box each say what they cover;
//  - Documents: compact secondary buttons in one row on Mac; two per row on iPhone at 44px; no lone half-width button;
//  - Record Payment and Confirm Build at a sensible width on Mac (not edge to edge);
//  - Fulfilment Method, Payment Status and Documents share one heading style;
//  - nothing at the end of the build screen is hidden behind the bottom nav bar; no horizontal overflow; no page errors.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const playwright=require(process.env.PLAYWRIGHT_MODULE);
const root=path.join(__dirname,'..');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png'};
let passed=0;
const ck=(name,cond,detail)=>{assert.ok(cond,`${name}${detail===undefined?'':' '+JSON.stringify(detail)}`);passed++;console.log('PASS',name);};
const SCRIPTS=['config.js','storage.js','guide-layout.js','thread-wrap.js','guide-train.js','thread-studio-host.js','kr-guide-layout-host.js','studio-visuals.js','navigation.js','business-logo.js','invoice-pdf.js','ui.js'];
const ACCOUNT='cccccccc-0000-0000-0000-00000000000c';   // synthetic account

function serve(){
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://x').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
async function boot(browser,base,options){
  const context=await browser.newContext(options);
  await context.route('**/*',(route)=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  await page.evaluate(()=>localStorage.clear());
  for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
  await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');},ACCOUNT);
  return {context,page,errors};
}
// One synthetic build: $899 rod price, Courier / Shipping with $34.50 delivery charged ($18 freight, $12 packaging, + markup off).
const setState=(page,stage)=>page.evaluate((stage)=>{
  goScreen('workshopScreen');showStudioWorkflow();
  Object.assign(quote,{customerName:'Synthetic Customer',buildName:'Rod',status:stage==='complete'?'complete':'active',quoteStatus:stage});
  setQuoteFulfilmentMethod('shipping');
  for(const [id,value] of [['quoteFreight','18'],['quotePackaging','12'],['quoteTotal','899']]){
    const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  updateWorkshopSectionVisibility();updateWorkshopBuildActionsUi();updateQuoteSummary();
  expandWorkshopCollapsibleSection('workshopQuoteSummaryBody',{instant:true});
},stage);
const measure=(page)=>page.evaluate(()=>{
  const vis=(el)=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const box=(el)=>{const r=el.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom)};};
  const grid=document.querySelector('.workshop-build-actions-docs__grid');
  const docs=[...grid.children].filter(vis).map((el)=>({id:el.id,...box(el)}));
  const style=(el)=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.letterSpacing,s.color,s.textTransform].join('|');};
  const headings=[document.querySelector('#quoteFulfilmentGroup > .build-section-heading'),document.querySelector('#quotePaymentBlock > .build-section-heading'),
    document.querySelector('.workshop-build-actions-docs > .build-section-heading')];
  const t=(id)=>document.getElementById(id)?.textContent||'';
  const surface=document.querySelector('.workshop-build-actions-surface');
  const pay=document.getElementById('quoteRecordPaymentBtn');const confirm=document.getElementById('confirmBuildBtn');
  const se=document.scrollingElement;se.scrollTop=se.scrollHeight;
  const navTop=document.querySelector('.bottom-nav').getBoundingClientRect().top;
  const ends=['confirmBuildBtn','toggleCurrentBuildStatusBtn','workshopBuildActionsStatus','currentBuildActionsMenuBtn'].map((id)=>document.getElementById(id)).filter(vis);
  const lastBottom=Math.max(...ends.map((el)=>el.getBoundingClientRect().bottom));
  const rgb=(c)=>(String(c).match(/\d+(\.\d+)?/g)||[]).map(Number);
  const reddish=(c)=>{const [r,g,b,a=1]=rgb(c);return a>0.05&&r>g+50&&r>b+50;};
  const visible=(c)=>{const v=rgb(c);return v.length>=3&&(v[3]===undefined||v[3]>0.05);};
  const panel=document.getElementById('studioWorkflowPanel');
  const redSelected=[...panel.querySelectorAll('[aria-pressed="true"]')].filter(vis).filter((el)=>{const s=getComputedStyle(el);return reddish(s.borderTopColor)||reddish(s.backgroundColor);}).map((el)=>el.textContent.trim());
  const inputLookingResults=[...document.querySelectorAll('#workshopPricingSection input[readonly]')].filter(vis).filter((el)=>{
    const s=getComputedStyle(el);return visible(s.backgroundColor)||(parseFloat(s.borderTopWidth)>0&&visible(s.borderTopColor));
  }).map((el)=>el.id);
  const segments=[...panel.querySelectorAll('.ds-segmented__option,.quote-job-type__option')].filter(vis).map((el)=>{
    const r=el.getBoundingClientRect();const after=getComputedStyle(el,'::after');
    const extend=after.content&&after.content!=='none'?Math.max(0,-(parseFloat(after.top)||0)):0;
    return {text:el.textContent.trim(),h:Math.round(r.height),hit:Math.round(r.height+2*extend)};
  });
  const segmentGroups=[...panel.querySelectorAll('.ds-segmented,.quote-job-type__options')].filter(vis).map((el)=>Math.round(el.getBoundingClientRect().width));
  return {
    redSelected,inputLookingResults,segments,segmentGroups,
    gstLabelOneLine:(()=>{const el=document.getElementById('quoteTaxLabel');if(el.getClientRects().length===0)return true;/* folded away at Complete */const s=getComputedStyle(el);const line=parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.3;return el.getClientRects().length===1&&el.getBoundingClientRect().height<=line*1.5+2;})(),
    rodRed:document.getElementById('quoteTotalField').classList.contains('quote-field--active-target'),
    hint:t('quoteRodPriceHint'),total:t('quoteCustomerTotalLine'),gstLabel:t('quoteTaxLabel'),gst:document.getElementById('quoteGst').value,
    // Q23 GST cleanup: the tax row (toggle, rate chip, total) on one line, and how often the tax total appears on screen.
    taxRow:(()=>{const ids=['quoteIncludeGstField','quoteTaxRateChip','quoteGstField'];const els=ids.map((id)=>document.getElementById(id));
      if(!els.every(vis))return {shown:false};
      const mids=els.map((el)=>{const b=el.getBoundingClientRect();return b.top+b.height/2;});
      const section=document.getElementById('workshopPricingFields');
      const gst=document.getElementById('quoteGst').value;
      const text=[...section.querySelectorAll('*')].filter((el)=>vis(el)&&!el.children.length).map((el)=>el.textContent).join(' ')+' '+[...section.querySelectorAll('input')].filter(vis).map((i)=>i.value).join(' ');
      return {shown:true,oneLine:Math.max(...mids)-Math.min(...mids)<=4,chip:els[1].textContent.trim(),rateField:vis(document.getElementById('quoteTaxRateField')),
        gstTimes:text.split(gst).length-1,rowH:Math.round(document.getElementById('quoteTaxSummaryRow').getBoundingClientRect().height)};})(),
    deposit:(()=>{const el=document.getElementById('quoteDepositEnabledField');return {inPayment:!!el.closest('#quotePaymentBlock'),shown:vis(el),h:Math.round(el.getBoundingClientRect().height)};})(),
    docs,gridW:Math.round(grid.getBoundingClientRect().width),surfaceW:Math.round(surface.getBoundingClientRect().width),
    pay:vis(pay)?box(pay):null,toggle:vis(document.getElementById('toggleCurrentBuildStatusBtn'))?box(document.getElementById('toggleCurrentBuildStatusBtn')):null,confirm:vis(confirm)?box(confirm):null,
    headings:headings.map((el)=>el?style(el):null),
    clearance:Math.round(navTop-lastBottom),overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
  };
});
async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'webkit'].launch({headless:true});
  const sizes={mac:{viewport:{width:1280,height:860}},iphone:{...playwright.devices['iPhone 13']}};
  try{
    for(const [size,options] of Object.entries(sizes)){
      const {context,page,errors}=await boot(browser,base,options);
      for(const stage of ['quote','active','complete']){
        await setState(page,stage);await page.waitForTimeout(150);
        const m=await measure(page);const label=`${size} ${stage}`;
        ck(`${label}: the rod figure says it is GST on the rod`,/^NZD · GST on the rod \$\d+\.\d\d$/.test(m.hint),m.hint);
        ck(`${label}: the customer total with delivery says it includes GST without repeating the amount`,
          /^Customer total with delivery: \$[\d,]+\.\d\d incl\. GST$/.test(m.total),m.total);
        ck(`${label}: the tax total is labelled GST total, on one line`,m.gstLabel==='GST total'&&m.gstLabelOneLine,[m.gstLabel,m.gstLabelOneLine]);
        if(m.taxRow.shown){
          ck(`${label}: one compact tax row - Include GST, the 15% chip and GST total line up, with the rate field closed`,
            m.taxRow.oneLine&&m.taxRow.chip==='15%'&&!m.taxRow.rateField&&m.taxRow.rowH<=48,m.taxRow);
          ck(`${label}: the GST total appears once on the pricing screen`,m.taxRow.gstTimes===1,m.taxRow);
        }
        ck(`${label}: Deposit Required sits with the payment terms in Payment Status, compact`,m.deposit.inPayment&&(!m.deposit.shown||m.deposit.h<=48),m.deposit);
        ck(`${label}: the Rod Price is not marked red on the simple screen`,!m.rodRed,m.rodRed);
        ck(`${label}: Documents has at least two buttons`,m.docs.length>=2,m.docs);
        const rows=[...new Set(m.docs.map((d)=>d.t))].map((top)=>m.docs.filter((d)=>Math.abs(d.t-top)<4));
        if(size==='mac'){
          ck(`${label}: Documents are one row of compact buttons`,rows.length===1&&m.docs.every((d)=>d.w<=m.gridW*0.4),{rows:rows.length,docs:m.docs,gridW:m.gridW});
          ck(`${label}: Document buttons are 40px tall`,m.docs.every((d)=>d.h===40),m.docs);
          if(m.pay)ck(`${label}: Record Payment is a sensible width, not edge to edge, 40px tall`,m.pay.w<=m.surfaceW*0.5&&m.pay.h===40,[m.pay,m.surfaceW]);
          if(m.confirm)ck(`${label}: Confirm Build is a sensible width, not edge to edge, 40px tall`,m.confirm.w<=m.surfaceW*0.5&&m.confirm.h===40,[m.confirm,m.surfaceW]);
          if(m.toggle)ck(`${label}: Mark Complete is 40px tall like the other actions`,m.toggle.h===40,m.toggle);
        }else{
          ck(`${label}: Documents are two per row, and a row with one button spans the full width (no lone half-width button)`,
            rows.every((row)=>row.length===2||(row.length===1&&row[0].w>=m.gridW-1)),{rows,gridW:m.gridW});
          ck(`${label}: Document buttons are 44-48px tall`,m.docs.every((d)=>d.h>=44&&d.h<=48),m.docs);
          if(m.pay)ck(`${label}: Record Payment is at least 44px tall`,m.pay.h>=44&&m.pay.h<=48,m.pay);
        }
        ck(`${label}: Fulfilment Method, Payment Status and Documents share one heading style`,
          m.headings.every((h)=>h&&h===m.headings[0]),m.headings);
        ck(`${label}: the last controls clear the bottom nav bar by at least 16px`,m.clearance>=16,m.clearance);
        ck(`${label}: no selected state is red (segmented selections are titanium)`,m.redSelected.length===0,m.redSelected);
        ck(`${label}: calculated values read as results, not input boxes`,m.inputLookingResults.length===0,m.inputLookingResults);
        ck(`${label}: segmented controls are compact - 30-36px on Mac; 40px with a 44px hit area on iPhone`,
          m.segments.length>=2&&m.segments.every((s)=>size==='mac'?s.h>=30&&s.h<=36:s.h>=40&&s.hit>=44),m.segments);
        if(size==='mac')ck(`${label}: segmented groups are sized to content, not stretched`,m.segmentGroups.every((w)=>w<=m.surfaceW*0.75),[m.segmentGroups,m.surfaceW]);
        ck(`${label}: no horizontal overflow`,!m.overflow);
        if(process.env.BSD_SHOTS){
          await page.evaluate(()=>document.querySelector('.workshop-build-actions-surface').scrollIntoView({block:'start'}));
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-${stage}-actions.png`)});
          await page.evaluate(()=>document.getElementById('quoteTotalField').scrollIntoView({block:'start'}));
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-${stage}-pricing.png`)});
          await page.evaluate(()=>{const se=document.scrollingElement;se.scrollTop=se.scrollHeight;});
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-${stage}-bottom.png`)});
        }
      }
      // Rod specification: a compact Finished Rod Length, and Reel Seat Position — From Butt on one row with Rear / Centre / Front.
      await setState(page,'quote');await page.waitForTimeout(150);
      const spec=await page.evaluate(()=>{
        expandWorkshopCollapsibleSection('workshopBuildSpecsBody',{instant:true});
        const toggle=document.getElementById('buildRodSpecsToggle');
        if(toggle&&toggle.getClientRects().length&&toggle.getAttribute('aria-expanded')!=='true')toggle.click();
        const r=(el)=>{const b=el.getBoundingClientRect();return {t:Math.round(b.top),b:Math.round(b.bottom),l:Math.round(b.left),r:Math.round(b.right),w:Math.round(b.width),h:Math.round(b.height)};};
        const length=document.getElementById('quoteSpecFinishedRodLength');const seat=document.getElementById('quoteSpecReelSeatPosition');
        const track=document.querySelector('#quoteSpecReelSeatRef .quote-job-type__options');
        document.getElementById('buildRodSpecsPartA').scrollIntoView({block:'start'});
        return {length:r(length),seat:r(seat),track:track?r(track):null,row:r(document.querySelector('.build-details__seat-row')),
          seatLabel:document.querySelector('.build-details__seat-position > span').textContent.replace(/\s+/g,' ').trim(),
          lengthUnit:document.getElementById('quoteSpecFinishedRodLengthUnit').textContent,seatUnit:document.getElementById('quoteSpecReelSeatPositionUnit').textContent,
          refs:[...document.querySelectorAll('#quoteSpecReelSeatRef [data-layout-seat-ref]')].map((b)=>b.getAttribute('data-layout-seat-ref')),
          overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
      });
      ck(`${size}: Finished Rod Length is a compact field (${size==='mac'?'<=150px':'<=170px'}) showing its unit`,
        spec.length.w<=(size==='mac'?150:170)&&spec.length.w>=100&&spec.lengthUnit==='mm',spec.length);
      ck(`${size}: Reel Seat Position — From Butt shows its unit and keeps Rear / Centre / Front`,
        /^Reel Seat Position — From Butt mm$/.test(spec.seatLabel)&&spec.seatUnit==='mm'&&JSON.stringify(spec.refs)==='["rear","centre","front"]',spec);
      ck(`${size}: the reel seat field matches the segmented control's height`,spec.track&&Math.abs(spec.seat.h-spec.track.h)<=1,spec);
      if(size==='mac')ck(`${size}: the reel seat distance and reference sit on one row`,spec.track&&Math.abs(spec.seat.b-spec.track.b)<=1&&spec.track.l>spec.seat.r,spec);
      else ck(`${size}: the reel seat row wraps cleanly inside the card (one row when it fits)`,spec.track&&spec.track.r<=spec.row.r+1&&!spec.overflow&&(spec.track.l>spec.seat.r?Math.abs(spec.seat.b-spec.track.b)<=1:spec.track.t>=spec.seat.b),spec);
      if(process.env.BSD_SHOTS){await page.waitForTimeout(150);await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-spec.png`)});}
      // Q23 GST cleanup: the rate chip opens this build's rate (an override shows on the chip); tax off hides the tax
      // wording and amounts; Deposit Required still opens its deposit fields. Everything is put back afterwards.
      await setState(page,'quote');await page.waitForTimeout(150);
      const tax=await page.evaluate(()=>{
        const shown=(id)=>document.getElementById(id).getClientRects().length>0;
        const saved={rate:quote.gstRate,include:quote.includeGst,deposit:quote.depositEnabled};
        const out={};
        document.getElementById('quoteTaxRateChip').click();
        out.opened={field:shown('quoteTaxRateField'),expanded:document.getElementById('quoteTaxRateChip').getAttribute('aria-expanded'),label:document.getElementById('quoteTaxRateLabel').textContent};
        const rate=document.getElementById('quoteTaxRate');rate.value='20';rate.dispatchEvent(new Event('input',{bubbles:true}));
        out.override={chip:document.getElementById('quoteTaxRateChip').textContent,gst:document.getElementById('quoteGst').value,hint:document.getElementById('quoteRodPriceHint').textContent};
        rate.value=String(saved.rate);rate.dispatchEvent(new Event('input',{bubbles:true}));
        document.getElementById('quoteTaxRateChip').click();
        out.closed=!shown('quoteTaxRateField');
        const include=document.getElementById('quoteIncludeGst');include.click();
        out.off={chip:shown('quoteTaxRateChip'),total:shown('quoteGstField'),hint:document.getElementById('quoteRodPriceHint').textContent,line:document.getElementById('quoteCustomerTotalLine').textContent,toggle:shown('quoteIncludeGstField')};
        include.click();
        const dep=document.getElementById('quoteDepositEnabled');if(!dep.checked)dep.click();
        out.deposit={type:shown('quoteDepositTypeField'),value:shown('quoteDepositValueField'),inPayment:!!document.getElementById('quoteDepositValueField').closest('#quotePaymentBlock')};
        if(saved.deposit!==true)dep.click();
        out.restored=quote.gstRate===saved.rate&&quote.includeGst===saved.include&&!!quote.depositEnabled===!!saved.deposit;
        return out;
      });
      ck(`${size}: the rate chip opens this build's GST rate field`,tax.opened.field&&tax.opened.expanded==='true'&&tax.opened.label==='GST Rate (%)',tax.opened);
      ck(`${size}: a per-build rate shows on the chip and recalculates the GST`,tax.override.chip==='20% · this build'&&tax.override.gst!==''&&/GST on the rod/.test(tax.override.hint),tax.override);
      ck(`${size}: the chip closes the rate field again`,tax.closed,tax);
      ck(`${size}: with GST off, only the Include GST toggle remains - no rate, total or GST wording`,
        tax.off.toggle&&!tax.off.chip&&!tax.off.total&&tax.off.hint==='NZD'&&!/GST/.test(tax.off.line),tax.off);
      ck(`${size}: Deposit Required still opens its deposit fields, inside Payment Status`,tax.deposit.type&&tax.deposit.value&&tax.deposit.inPayment,tax.deposit);
      ck(`${size}: the tax and deposit settings are put back`,tax.restored,tax);
      if(process.env.BSD_SHOTS){
        await page.evaluate(()=>document.getElementById('quoteTaxSummaryRow').scrollIntoView({block:'center'}));
        await page.waitForTimeout(150);
        await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-tax-row.png`)});
      }
      // Simple / Advanced and the pricing method are views: switching never changes the build or writes storage.
      await setState(page,'quote');await page.waitForTimeout(150);
      const views=await page.evaluate(()=>{
        const store=()=>JSON.stringify(Object.keys(localStorage).sort().map((k)=>[k,localStorage.getItem(k)]));
        const before={quote:JSON.stringify(quote),store:store()};
        const press=(sel)=>document.querySelector(sel).click();
        const shown=(id)=>document.getElementById(id).getClientRects().length>0;
        const editable=()=>['quoteTotal','quoteProfit','quoteMarginPercent'].filter((id)=>!document.getElementById(id).readOnly&&shown(id));
        press('[data-pricing-view="advanced"]');
        // With Rod Price as the method, Target Return ($) would repeat Your Return, so only the margin result shows.
        const advanced={fields:['quoteMarginPercentField','quotePricingMethodField'].every(shown),noRepeatedReturn:!shown('quoteProfitField'),editable:editable(),
          labels:[...document.querySelectorAll('button[data-pricing-method]')].map((b)=>b.textContent.trim()),marginLabel:document.getElementById('quoteMarginPercentLabel').textContent};
        press('[data-pricing-method="percent"]');const percent=editable();
        press('[data-pricing-method="return"]');const ret=editable();
        press('[data-pricing-method="price"]');
        press('[data-pricing-view="simple"]');
        const simple={hidden:['quoteProfitField','quoteMarginPercentField','quotePricingMethodField'].every((id)=>!shown(id)),editable:editable()};
        return {advanced,percent,ret,simple,unchanged:JSON.stringify(quote)===before.quote,storeUnchanged:store()===before.store};
      });
      if(process.env.BSD_SHOTS){
        // A picture of Advanced (Target Return % chosen). Views only, so nothing changes; back to Simple afterwards.
        await page.evaluate(()=>{document.querySelector('[data-pricing-view="advanced"]').click();document.querySelector('[data-pricing-method="percent"]').click();
          document.getElementById('quoteRodPricingHead').scrollIntoView({block:'start'});});
        await page.waitForTimeout(200);
        await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-advanced-pricing.png`)});
        await page.evaluate(()=>{document.querySelector('[data-pricing-method="price"]').click();document.querySelector('[data-pricing-view="simple"]').click();});
      }
      ck(`${size}: Advanced shows the three pricing methods; each method makes only its own field editable`,
        views.advanced.fields&&JSON.stringify(views.advanced.editable)==='["quoteTotal"]'&&JSON.stringify(views.percent)==='["quoteMarginPercent"]'&&JSON.stringify(views.ret)==='["quoteProfit"]',views);
      ck(`${size}: the methods are Rod Price, Target Return $ and Target Margin %; the margin field says Target Margin`,
        JSON.stringify(views.advanced.labels)==='["Rod Price","Target Return $","Target Margin %"]'&&/^Target Margin \(% of price/.test(views.advanced.marginLabel),views.advanced);
      ck(`${size}: with Rod Price chosen, the return is not shown twice (Your Return is the result)`,views.advanced.noRepeatedReturn,views.advanced);
      ck(`${size}: back in Simple only the Rod Price is editable`,views.simple.hidden&&JSON.stringify(views.simple.editable)==='["quoteTotal"]',views.simple);
      ck(`${size}: switching Simple / Advanced and methods changes nothing saved`,views.unchanged&&views.storeUnchanged,views);
      // Payment Status: one line per payment, no repeated heading, no deposit sentence, Record Payment at its natural width.
      const pay=await page.evaluate(()=>{
        quote.payments=[{id:'p1',type:'deposit',amount:300,date:'2026-11-22'},{id:'p2',type:'balance',amount:100,date:'2026-11-29'}];
        updatePaymentBlock();
        const entries=[...document.querySelectorAll('#quotePaymentHistory .quote-payment__entry')].filter((el)=>el.getClientRects().length).map((el)=>el.textContent.replace(/\s*Correct$/,'').replace(/\s+/g,' ').trim());
        const block=document.getElementById('quotePaymentBlock');
        const btn=document.getElementById('quoteRecordPaymentBtn').getBoundingClientRect();
        const out={entries,text:block.innerText,status:document.getElementById('quoteDepositReceivedStatus').textContent,btnW:Math.round(btn.width),btnH:Math.round(btn.height),blockW:Math.round(block.getBoundingClientRect().width)};
        quote.payments=[];updatePaymentBlock();
        return out;
      });
      ck(`${size}: Payment Status lists each payment with its amount and date, with no repeated heading or deposit sentence`,
        pay.entries.length===2&&/^Deposit received ?\$300\.00/.test(pay.entries[0])&&/^Balance received ?\$100\.00/.test(pay.entries[1])&&!/payment history/i.test(pay.text)&&pay.status==='',pay);
      ck(`${size}: Record Payment is a compact secondary button at its natural width`,pay.btnW<pay.blockW*0.6&&pay.btnH>=(size==='mac'?36:44),pay);
      ck(`${size}: no page errors`,errors.length===0,errors);
      await context.close();
    }
  }finally{await browser.close();server.close();}
  console.log(`\n${passed} checks passed`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
