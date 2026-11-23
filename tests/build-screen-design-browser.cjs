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
// One synthetic build: $780 Job Price excl. GST ($897 incl.), Courier / Shipping with $34.50 delivery charged
// ($18 freight, $12 packaging, + GST): a $931.50 total price.
const setState=(page,stage)=>page.evaluate((stage)=>{
  goScreen('workshopScreen');showStudioWorkflow();
  Object.assign(quote,{customerName:'Synthetic Customer',buildName:'Rod',status:stage==='complete'?'complete':'active',quoteStatus:stage});
  setQuoteFulfilmentMethod('shipping');
  for(const [id,value] of [['quoteFreight','18'],['quotePackaging','12'],['quoteTotal','780']]){
    const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
  }
  updateWorkshopSectionVisibility();updateWorkshopBuildActionsUi();updateQuoteSummary();
  setDeliveryPanelOpen(true);
  expandWorkshopCollapsibleSection('workshopQuoteSummaryBody',{instant:true});
},stage);
const measure=(page)=>page.evaluate(()=>{
  const vis=(el)=>!!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const box=(el)=>{const r=el.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),b:Math.round(r.bottom)};};
  const grid=document.querySelector('.workshop-build-actions-docs__grid');
  const docs=[...grid.children].filter(vis).map((el)=>({id:el.id,...box(el)}));
  const style=(el)=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.letterSpacing,s.color,s.textTransform].join('|');};
  const headings=[document.getElementById('quoteRodPricingHead'),document.querySelector('#quotePaymentBlock > .build-section-heading'),
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
    hint:t('quoteRodPriceHint'),rodLabel:t('quoteRodPriceLabel'),jobNote:t('quoteJobPriceNote'),rodShown:vis(document.getElementById('quoteTotalField')),
    docLabels:docs.map((d)=>(d.id==='quoteMoreDocumentsWrap'?document.getElementById('quoteMoreDocumentsBtn'):document.getElementById(d.id)).textContent.trim()),
    totalPrice:t('quoteTotalPrice'),totalNote:t('quoteTotalNote'),totalShown:vis(document.getElementById('quoteTotalPriceRow')),
    gstLabel:t('quoteTaxLabel'),gst:document.getElementById('quoteGst').value,
    // Q23 GST cleanup: the tax row (toggle, rate chip, total) on one line, and how often the tax total appears on screen.
    taxRow:(()=>{const ids=['quoteIncludeGstField','quoteTaxRateChip','quoteGstField'];const els=ids.map((id)=>document.getElementById(id));
      if(!els.every(vis))return {shown:false};
      const mids=els.map((el)=>{const b=el.getBoundingClientRect();return b.top+b.height/2;});
      const section=document.getElementById('workshopPricingSection');
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
        // Q33: the Job Price, with "Excl. GST" on its quiet second line and no hint; one Total price, with delivery noted once.
        if(m.rodShown)ck(`${label}: the Job Price says it excludes GST, with no extra hint line`,m.rodLabel==='Job Price'&&m.jobNote==='Excl. GST'&&m.hint==='',[m.rodLabel,m.jobNote,m.hint]);
        // Q33: the customer document by its short name, then the Invoice (at Quote the draft invoice stays in More documents,
        // as before); no separate email button - Email is in the document preview.
        ck(`${label}: Documents read ${stage==='quote'?'Quote and More documents':`${stage==='active'?'Confirmation':'Summary'} and Invoice`}`,
          m.docLabels[0]===(stage==='quote'?'Quote':stage==='active'?'Confirmation':'Summary')&&m.docLabels.includes(stage==='quote'?'More documents':'Invoice')&&!m.docLabels.some((t)=>/email/i.test(t)),m.docLabels);
        if(m.totalShown){
          ck(`${label}: one Total price including GST and delivery`,m.totalPrice==='$931.50 NZD',m.totalPrice);
          ck(`${label}: the note under the total names delivery only (GST has its own row)`,m.totalNote==='Includes delivery $34.50',m.totalNote);
        }
        ck(`${label}: the tax total is labelled GST, on one line`,m.gstLabel==='GST'&&m.gstLabelOneLine,[m.gstLabel,m.gstLabelOneLine]);
        if(m.taxRow.shown){
          ck(`${label}: one compact tax row - Include GST, the 15% chip and GST total line up, with the rate field closed`,
            m.taxRow.oneLine&&m.taxRow.chip==='15%'&&!m.taxRow.rateField&&m.taxRow.rowH<=48,m.taxRow);
          ck(`${label}: the GST total appears once on the pricing screen`,m.taxRow.gstTimes===1,m.taxRow);
        }
        ck(`${label}: Deposit requested sits with the payment terms in Payments, compact`,m.deposit.inPayment&&(!m.deposit.shown||m.deposit.h<=48),m.deposit);
        ck(`${label}: the Job Price is not marked red`,!m.rodRed,m.rodRed);
        ck(`${label}: Documents has at least two buttons`,m.docs.length>=2,m.docs);
        const rows=[...new Set(m.docs.map((d)=>d.t))].map((top)=>m.docs.filter((d)=>Math.abs(d.t-top)<4));
        if(size==='mac'){
          ck(`${label}: Documents are one row of compact buttons`,rows.length===1&&m.docs.every((d)=>d.w<=m.gridW*0.4),{rows:rows.length,docs:m.docs,gridW:m.gridW});
          ck(`${label}: Document buttons are 40px tall`,m.docs.every((d)=>d.h===40),m.docs);
          // Q33: Add Payment is the last row of the payment list (full width, 40px), not a floating button.
          if(m.pay)ck(`${label}: Add Payment is a full-width list row, 40px tall`,m.pay.w>=m.surfaceW*0.95&&m.pay.h===40,[m.pay,m.surfaceW]);
          if(m.confirm)ck(`${label}: Confirm Build is a sensible width, not edge to edge, 40px tall`,m.confirm.w<=m.surfaceW*0.5&&m.confirm.h===40,[m.confirm,m.surfaceW]);
          if(m.toggle)ck(`${label}: Mark Complete is 40px tall like the other actions`,m.toggle.h===40,m.toggle);
        }else{
          ck(`${label}: Documents are two per row, and a row with one button spans the full width (no lone half-width button)`,
            rows.every((row)=>row.length===2||(row.length===1&&row[0].w>=m.gridW-1)),{rows,gridW:m.gridW});
          ck(`${label}: Document buttons are 44-48px tall`,m.docs.every((d)=>d.h>=44&&d.h<=48),m.docs);
          if(m.pay)ck(`${label}: Add Payment is a full-width list row, 44-48px tall`,m.pay.w>=m.surfaceW*0.95&&m.pay.h>=44&&m.pay.h<=48,[m.pay,m.surfaceW]);
        }
        ck(`${label}: Pricing, Payments and Documents share one heading style`,
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
        out.override={chip:document.getElementById('quoteTaxRateChip').textContent,gst:document.getElementById('quoteGst').value,
          rodExcl:document.getElementById('quoteTotal').value,total:document.getElementById('quoteTotalPrice').textContent};
        rate.value=String(saved.rate);rate.dispatchEvent(new Event('input',{bubbles:true}));
        document.getElementById('quoteTaxRateChip').click();
        out.closed=!shown('quoteTaxRateField');
        const include=document.getElementById('quoteIncludeGst');include.click();
        out.off={chip:shown('quoteTaxRateChip'),total:shown('quoteGstField'),label:document.getElementById('quoteRodPriceLabel').textContent,jobNote:shown('quoteJobPriceNote'),
          note:document.getElementById('quoteTotalNote').textContent,rodExcl:document.getElementById('quoteTotal').value,toggle:shown('quoteIncludeGstField')};
        include.click();
        const dep=document.getElementById('quoteDepositEnabled');if(!dep.checked)dep.click();
        out.deposit={type:shown('quoteDepositTypeField'),value:shown('quoteDepositValueField'),inPayment:!!document.getElementById('quoteDepositValueField').closest('#quotePaymentBlock')};
        if(saved.deposit!==true)dep.click();
        out.restored=quote.gstRate===saved.rate&&quote.includeGst===saved.include&&!!quote.depositEnabled===!!saved.deposit
          &&document.getElementById('quoteTotal').value==='780.00';
        return out;
      });
      ck(`${size}: the rate chip opens this build's GST rate field`,tax.opened.field&&tax.opened.expanded==='true'&&tax.opened.label==='GST rate (%)',tax.opened);
      // Pricing redesign: a new rate keeps the Job Price excl. GST; only the GST and the Total price move.
      ck(`${size}: a per-build rate shows on the chip, keeps the Job Price excl. GST and recalculates the GST and total`,
        tax.override.chip==='20% · this build'&&tax.override.gst!==''&&tax.override.rodExcl==='780.00'&&tax.override.total==='$972.00 NZD',tax.override);
      ck(`${size}: the chip closes the rate field again`,tax.closed,tax);
      ck(`${size}: with GST off, only the Include GST toggle remains - no rate, total or GST wording; the Job Price stays`,
        tax.off.toggle&&!tax.off.chip&&!tax.off.total&&tax.off.label==='Job Price'&&!tax.off.jobNote&&!/GST/.test(tax.off.note)&&tax.off.rodExcl==='780.00',tax.off);
      ck(`${size}: Deposit Required still opens its deposit fields, inside Payments`,tax.deposit.type&&tax.deposit.value&&tax.deposit.inPayment,tax.deposit);
      ck(`${size}: the tax and deposit settings are put back`,tax.restored,tax);
      if(process.env.BSD_SHOTS){
        await page.evaluate(()=>document.getElementById('quoteTaxSummaryRow').scrollIntoView({block:'center'}));
        await page.waitForTimeout(150);
        await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-tax-row.png`)});
      }
      // Q33 Delivery: one row aligned with Advanced Pricing, showing the choice and its charge. Tapping it shows Collection |
      // Courier / Shipping; Collection folds it back; Courier / Shipping keeps it open for Freight and Packaging.
      await setState(page,'quote');await page.waitForTimeout(150);
      const row=await page.evaluate(()=>{
        const $id=(id)=>document.getElementById(id);
        const shown=(id)=>$id(id).getClientRects().length>0;
        const box=(id)=>{const b=$id(id).getBoundingClientRect();return {l:Math.round(b.left),r:Math.round(b.right),h:Math.round(b.height)};};
        setDeliveryPanelOpen(false);
        const out={closed:{panel:shown('quoteDeliveryPanel'),fields:shown('quoteDeliveryFields'),expanded:$id('quoteDeliveryToggle').getAttribute('aria-expanded'),
          summary:$id('quoteDeliverySummary').textContent,row:box('quoteDeliveryToggle'),advanced:box('quoteAdvancedToggle'),
          note:$id('quoteTotalNote').textContent,saved:quote.fulfilmentMethod}};
        $id('quoteDeliveryToggle').click();
        out.opened={panel:shown('quoteDeliveryPanel'),fields:shown('quoteDeliveryFields'),expanded:$id('quoteDeliveryToggle').getAttribute('aria-expanded'),
          choices:[...document.querySelectorAll('#quoteDeliveryPanel [data-fulfilment-method]')].filter((b)=>b.getClientRects().length).map((b)=>b.textContent.trim())};
        document.querySelector('[data-fulfilment-method="collection"]').click();
        out.collection={panel:shown('quoteDeliveryPanel'),summary:$id('quoteDeliverySummary').textContent,total:$id('quoteTotalPrice').textContent};
        $id('quoteDeliveryToggle').click();
        document.querySelector('[data-fulfilment-method="shipping"]').click();
        out.shipping={panel:shown('quoteDeliveryPanel'),fields:shown('quoteDeliveryFields'),summary:$id('quoteDeliverySummary').textContent,total:$id('quoteTotalPrice').textContent};
        return out;
      });
      ck(`${size}: Delivery is one row showing the choice and its charge, aligned with Advanced Pricing; no choices or fields until tapped`,
        !row.closed.panel&&!row.closed.fields&&row.closed.expanded==='false'&&row.closed.summary==='Courier / Shipping · $34.50'
          &&row.closed.row.l===row.closed.advanced.l&&row.closed.row.r===row.closed.advanced.r&&row.closed.row.h===row.closed.advanced.h
          &&row.closed.row.h>=(size==='mac'?40:44)&&row.closed.note==='Includes delivery $34.50',row.closed);
      ck(`${size}: tapping Delivery shows Collection | Courier / Shipping and the Freight and Packaging fields`,
        row.opened.panel&&row.opened.fields&&row.opened.expanded==='true'&&JSON.stringify(row.opened.choices)==='["Collection","Courier / Shipping"]',row.opened);
      ck(`${size}: choosing Collection folds Delivery back to "Collection" and removes the delivery charge`,
        !row.collection.panel&&row.collection.summary==='Collection'&&row.collection.total==='$897.00 NZD',row.collection);
      ck(`${size}: choosing Courier / Shipping keeps Delivery open with Freight and Packaging, and restores the charge`,
        row.shipping.panel&&row.shipping.fields&&row.shipping.summary==='Courier / Shipping · $34.50'&&row.shipping.total==='$931.50 NZD',row.shipping);
      // Delivery (Q28 polish, kept): Freight and Packaging sized for short amounts on one line, the delivery segments styled
      // like the other segmented controls, and Collection charging no delivery while keeping the entered amounts.
      // Pricing redesign: no separate shipping total - the Total price is the one total.
      await setState(page,'quote');await page.waitForTimeout(150);
      const ful=await page.evaluate(()=>{
        const r=(id)=>document.getElementById(id).getBoundingClientRect();
        const seg=(el)=>{const s=getComputedStyle(el);return [Math.round(el.getBoundingClientRect().height),s.borderRadius,s.backgroundColor,s.borderColor,s.color,s.fontSize,s.fontWeight].join('|');};
        toggleAdvancedPricing(); // open, to compare against the Advanced pricing method segments
        const out={
          freightW:Math.round(r('quoteFreight').width),packW:Math.round(r('quotePackaging').width),inputH:Math.round(r('quoteFreight').height),
          rowTops:['quoteFreight','quotePackaging'].map((id)=>Math.round(r(id).top)),
          noShippingTotal:!document.getElementById('quoteDeliveryTotal')&&!/Total Shipping/i.test(document.getElementById('quoteFulfilmentGroup').innerText),
          segOn:seg(document.querySelector('[data-fulfilment-method][aria-pressed="true"]')),viewOn:seg(document.querySelector('button[data-advanced-method][aria-pressed="true"]')),
          segOff:seg(document.querySelector('[data-fulfilment-method][aria-pressed="false"]')),viewOff:seg(document.querySelector('button[data-advanced-method][aria-pressed="false"]')),
          segHit:(()=>{const b=document.querySelector('[data-fulfilment-method]');const a=getComputedStyle(b,'::after');return a.content==='none'?Math.round(b.getBoundingClientRect().height):Math.round(b.getBoundingClientRect().height-2*parseFloat(a.top||0));})(),
          labels:[...document.querySelectorAll('[data-fulfilment-method]')].map((b)=>b.textContent.trim()),
        };
        toggleAdvancedPricing();
        const saved={freight:quote.freight,packaging:quote.packaging,method:quote.fulfilmentMethod};
        document.querySelector('[data-fulfilment-method="collection"]').click();
        setDeliveryPanelOpen(true); // Collection folds the row; open it again to see the fields stay hidden
        const m=quoteMaths();
        out.collection={fieldsHidden:document.getElementById('quoteDeliveryFields').hidden,deliveryCharge:m.deliveryCharge,total:document.getElementById('quoteTotalPrice').textContent,
          kept:quote.freight===saved.freight&&quote.packaging===saved.packaging,note:document.getElementById('quoteTotalNote').textContent};
        document.querySelector('[data-fulfilment-method="shipping"]').click();
        out.back={total:document.getElementById('quoteTotalPrice').textContent,method:quote.fulfilmentMethod===saved.method};
        return out;
      });
      const narrow=size==='iphone';
      ck(`${size}: Freight and Packaging are sized for short currency amounts, on one line, 44px tall`,
        ful.freightW===ful.packW&&ful.freightW>=96&&ful.freightW<=(narrow?130:160)&&ful.inputH>=(narrow?44:38)&&ful.rowTops[0]===ful.rowTops[1],ful);
      ck(`${size}: no separate shipping total`,ful.noShippingTotal,ful);
      ck(`${size}: the choice reads Collection / Courier / Shipping`,JSON.stringify(ful.labels)==='["Collection","Courier / Shipping"]',ful.labels);
      ck(`${size}: the delivery segments match the Advanced pricing segments (height, shape, titanium selection)`,
        ful.segOn===ful.viewOn&&ful.segOff===ful.viewOff,[ful.segOn,ful.viewOn,ful.segOff,ful.viewOff]);
      if(narrow)ck(`${size}: the delivery segments keep a 44px touch target`,ful.segHit>=44,ful.segHit);
      ck(`${size}: Collection charges no delivery and hides the shipping fields, keeping the entered amounts`,
        ful.collection.fieldsHidden&&ful.collection.deliveryCharge===0&&ful.collection.total==='$897.00 NZD'&&ful.collection.kept&&ful.collection.note==='',ful.collection);
      ck(`${size}: switching back to Courier / Shipping restores the delivery in the Total price`,ful.back.total==='$931.50 NZD'&&ful.back.method,ful.back);
      if(process.env.BSD_SHOTS){
        await page.evaluate(()=>document.getElementById('quoteFulfilmentGroup').scrollIntoView({block:'center'}));
        await page.waitForTimeout(150);
        await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-fulfilment.png`)});
      }
      // Advanced pricing: collapsed by default; two methods that only PROPOSE a Rod price; opening, switching and typing
      // change nothing saved; invalid input is refused in plain words; "Use this price" applies it and collapses the panel.
      await setState(page,'quote');await page.waitForTimeout(150);
      const adv=await page.evaluate(()=>{
        const store=()=>JSON.stringify(Object.keys(localStorage).sort().map((k)=>[k,localStorage.getItem(k)]));
        const shown=(id)=>document.getElementById(id).getClientRects().length>0;
        const $id=(id)=>document.getElementById(id);
        const typeIn=(value)=>{const i=$id('quoteAdvancedTarget');i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}));};
        const out={closed:!shown('quoteAdvancedPricing')&&$id('quoteAdvancedToggle').getAttribute('aria-expanded')==='false'};
        // No components yet: a margin has nothing to work from.
        const cost=rodPricingFigures(quoteMaths()).componentsCost;
        $id('quoteAdvancedToggle').click();
        document.querySelector('[data-advanced-method="percent"]').click();
        typeIn('40');
        out.noCost={cost,error:$id('quoteAdvancedError').textContent};
        document.querySelector('[data-advanced-method="return"]').click();
        $id('quoteAdvancedToggle').click();
        // A synthetic $300 blank, so a margin has a cost to work from (removed again below); the Rod price is set again
        // afterwards, so the snapshot is taken from here.
        const savedComponents=quote.components;
        quote.components=[{category:'Blank',description:'Synthetic blank',cost:300,unitCost:300,unitPrice:400,quantity:1}];
        const rodInput=$id('quoteTotal');rodInput.value='780';rodInput.dispatchEvent(new Event('input',{bubbles:true}));
        updateQuoteSummary();
        const cost2=rodPricingFigures(quoteMaths()).componentsCost;
        const before={quote:JSON.stringify(quote),store:store()};
        $id('quoteAdvancedToggle').click();
        out.open={shown:shown('quoteAdvancedPricing'),labels:[...document.querySelectorAll('button[data-advanced-method]')].map((b)=>b.textContent.trim()),
          prefilled:$id('quoteAdvancedTarget').value,targetLabel:$id('quoteAdvancedTargetLabel').textContent,applyDisabled:$id('quoteAdvancedApply').disabled,
          inputs:[...$id('quoteAdvancedPricing').querySelectorAll('input')].filter((i)=>i.getClientRects().length).length,apply:$id('quoteAdvancedApply').textContent};
        document.querySelector('[data-advanced-method="percent"]').click();
        typeIn('40');
        out.margin={label:$id('quoteAdvancedTargetLabel').textContent,proposed:$id('quoteAdvancedProposed').textContent,expected:cost2/0.6};
        typeIn('100');out.badMargin={error:$id('quoteAdvancedError').textContent,applyDisabled:$id('quoteAdvancedApply').disabled};
        document.querySelector('[data-advanced-method="return"]').click();
        typeIn('-5');out.badReturn={error:$id('quoteAdvancedError').textContent,applyDisabled:$id('quoteAdvancedApply').disabled};
        typeIn('300');
        out.ret={proposed:$id('quoteAdvancedProposed').textContent,expected:cost2+300};
        out.unchanged=JSON.stringify(quote)===before.quote&&store()===before.store;
        $id('quoteAdvancedApply').click();
        const f=rodPricingFigures(quoteMaths());
        out.applied={rod:$id('quoteTotal').value,yourReturn:Math.round(f.yourReturn*100)/100,collapsed:!shown('quoteAdvancedPricing'),
          expanded:$id('quoteAdvancedToggle').getAttribute('aria-expanded'),driver:quote.pricingDriver};
        quote.components=savedComponents;
        const total=$id('quoteTotal');total.value='780';total.dispatchEvent(new Event('input',{bubbles:true}));
        return out;
      });
      const money=(v)=>`$${Number(v).toLocaleString('en-NZ',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
      ck(`${size}: Advanced pricing is collapsed by default`,adv.closed,adv);
      ck(`${size}: it has exactly two methods, Target Return and Target Margin, opening on Target Return with the current return filled in`,
        adv.open.shown&&JSON.stringify(adv.open.labels)==='["Target Return","Target Margin"]'&&adv.open.targetLabel==='Target Return ($)'&&/^\d+\.\d\d$/.test(adv.open.prefilled)&&adv.open.applyDisabled&&adv.open.inputs===1&&adv.open.apply==='Apply',adv.open);
      ck(`${size}: with no components cost, Target Margin asks for components first`,adv.noCost.cost===0&&adv.noCost.error==='Add components first.',adv.noCost);
      ck(`${size}: Target Margin proposes cost / (1 - margin)`,adv.margin.label==='Target Margin (%)'&&adv.margin.proposed.startsWith(money(adv.margin.expected)),adv.margin);
      ck(`${size}: an impossible margin or a negative return is refused in plain words, with Apply disabled`,
        adv.badMargin.error==='Enter a margin from 0 to 99.'&&adv.badMargin.applyDisabled&&adv.badReturn.error==='Enter a return of zero or more.'&&adv.badReturn.applyDisabled,[adv.badMargin,adv.badReturn]);
      ck(`${size}: Target Return proposes cost + return`,adv.ret.proposed.startsWith(money(adv.ret.expected)),adv.ret);
      ck(`${size}: opening, switching and typing in Advanced pricing changes nothing saved`,adv.unchanged,adv);
      ck(`${size}: Apply sets the Job Price, gives exactly that return, stores no target and collapses the panel`,
        Number(adv.applied.rod)===adv.ret.expected&&adv.applied.yourReturn===300&&adv.applied.collapsed&&adv.applied.expanded==='false'&&adv.applied.driver==='price',adv.applied);
      if(process.env.BSD_SHOTS){
        await page.evaluate(()=>{toggleAdvancedPricing();document.getElementById('quoteRodPricingHead').scrollIntoView({block:'start'});});
        await page.waitForTimeout(200);
        await page.screenshot({path:path.join(process.env.BSD_SHOTS,`${size}-advanced-pricing.png`)});
        await page.evaluate(()=>toggleAdvancedPricing());
      }
      // Payments: one tappable line per payment, no repeated heading, no deposit sentence, Add payment at its natural width.
      const pay=await page.evaluate(()=>{
        quote.payments=[{id:'p1',type:'deposit',amount:300,date:'2026-11-22'},{id:'p2',type:'balance',amount:100,date:'2026-11-29'}];
        updatePaymentBlock();
        const entries=[...document.querySelectorAll('#quotePaymentHistory .quote-payment__entry')].filter((el)=>el.getClientRects().length).map((el)=>el.textContent.replace(/\s*Correct$/,'').replace(/\s+/g,' ').trim());
        const block=document.getElementById('quotePaymentBlock');
        const btn=document.getElementById('quoteRecordPaymentBtn').getBoundingClientRect();
        const top=(id)=>Math.round(document.getElementById(id).getBoundingClientRect().top);
        const out={entries,text:block.innerText,status:document.getElementById('quoteDepositReceivedStatus').textContent,btnW:Math.round(btn.width),btnH:Math.round(btn.height),blockW:Math.round(block.getBoundingClientRect().width),
          order:[top('quoteDepositEnabledField'),top('quotePaymentHistory'),top('quotePaymentReceivedRow'),top('quotePaymentBalanceRow'),top('quoteRecordPaymentBtn')],
          received:document.querySelector('#quotePaymentReceivedRow > span').textContent,owing:document.getElementById('quotePaymentBalanceLabel').textContent};
        // Tap the payment: Amount, Date, Save and Cancel only.
        document.querySelector('#quotePaymentHistory [data-edit-payment="p2"]').click();
        const form=document.getElementById('quoteBalanceReceivedForm');
        out.form={shown:form.getClientRects().length>0,buttons:[...form.querySelectorAll('button')].filter((b)=>b.getClientRects().length).map((b)=>b.textContent.trim()),
          inputs:[...form.querySelectorAll('input')].filter((i)=>i.getClientRects().length).map((i)=>i.type)};
        // Saving it as $0 asks first; Cancel keeps the payment exactly as it was.
        const amount=document.getElementById('quoteBalanceReceivedAmount');amount.value='0';
        const before=JSON.stringify(quote.payments);
        // This offline test page has no server: report removal as supported for this one step, then put it back.
        const savedSync=window.KLABS_BUILD_SYNC;
        window.KLABS_BUILD_SYNC={...(savedSync||{}),recordRemovalSupported:async()=>true};
        document.getElementById('quoteBalanceReceivedSave').click();
        return new Promise((resolve)=>setTimeout(()=>{
          window.KLABS_BUILD_SYNC=savedSync;
          const sheet=document.getElementById('confirmSheet');
          out.zero={title:document.getElementById('confirmSheetTitle')?.textContent.trim()||'',
            actions:[...document.querySelectorAll('#confirmSheetActions button')].filter((b)=>b.getClientRects().length).map((b)=>b.textContent.trim())};
          sheet?.querySelector('[data-confirm-action="cancel"]')?.click();
          out.zero.kept=JSON.stringify(quote.payments)===before;
          closeBalanceReceivedForm();quote.payments=[];updatePaymentBlock();
          resolve(out);
        },300));
      });
      ck(`${size}: Payments lists each payment with its type, date and amount, with no repeated heading, deposit sentence or audit wording`,
        pay.entries.length===2&&/^Deposit.*2026.*\$300\.00/.test(pay.entries[0])&&/^Payment.*2026.*\$100\.00/.test(pay.entries[1])&&!/payment history|correct|reason/i.test(pay.text)&&pay.status==='',pay);
      ck(`${size}: Payments reads Deposit Required, the payments, Payments Received, Balance Owing, then Add Payment`,
        pay.order.every((t,i)=>i===0||t>pay.order[i-1])&&pay.received==='Payments Received'&&pay.owing==='Balance Owing',pay.order);
      ck(`${size}: Add Payment is the last row of the list, full width`,pay.btnW>=pay.blockW-1&&pay.btnH>=(size==='mac'?40:44),pay);
      ck(`${size}: tapping a payment shows only Amount, Date, Save and Cancel (no Remove button)`,
        pay.form.shown&&JSON.stringify(pay.form.buttons)==='["Save","Cancel"]'&&JSON.stringify(pay.form.inputs)==='["number","date"]',pay.form);
      ck(`${size}: saving a payment as $0 asks "Remove this payment?" (Cancel | Remove); Cancel keeps it unchanged`,
        pay.zero.title==='Remove this payment?'&&JSON.stringify(pay.zero.actions)==='["Cancel","Remove"]'&&pay.zero.kept,pay.zero);
      ck(`${size}: no page errors`,errors.length===0,errors);
      await context.close();
    }
  }finally{await browser.close();server.close();}
  console.log(`\n${passed} checks passed`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
