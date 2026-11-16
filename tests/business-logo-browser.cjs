// Browser checks for subscriber-specific document branding, using two isolated synthetic business accounts.
// Run with: PLAYWRIGHT_MODULE=/path/to/playwright node tests/business-logo-browser.cjs
// Serves the repository from a local HTTP server with all other network refused. Synthetic data only.
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
const A='aaaaaaaa-0000-0000-0000-00000000000a';   // synthetic account A: "K-Labs"
const B='bbbbbbbb-0000-0000-0000-00000000000b';   // synthetic account B: another rod builder

function serve(){
  const server=http.createServer((req,res)=>{
    const p=new URL(req.url,'http://x').pathname;const file=path.resolve(root,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(fs.readFileSync(file));
  });
  return new Promise((r)=>server.listen(0,'127.0.0.1',()=>r(server)));
}
async function boot(browser,base,viewport){
  const context=await browser.newContext({viewport});
  await context.route('**/*',(route)=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  const page=await context.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});
  for(const f of SCRIPTS)await page.addScriptTag({url:`${base}/js/${f}`});
  await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;document.body.classList.remove('klabs-logged-out','klabs-auth-resolving');},A);
  return {context,page,errors};
}
// Synthetic logos drawn in the browser, so no binary fixtures are needed.
const makeImage=(page,{type,w,h,color,text})=>page.evaluate(async({type,w,h,color,text})=>{
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.fillStyle='#ffffff';x.fillRect(0,0,w,h);x.fillStyle=color;x.fillRect(4,4,w-8,h-8);x.fillStyle='#fff';x.font='bold 22px sans-serif';x.fillText(text,12,h/2+8);
  const blob=await new Promise((r)=>c.toBlob(r,type,0.9));return {type:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
},{type,w,h,color,text});
const pick=async(page,img,name)=>{await page.setInputFiles('#settingsBusinessLogoFile',{name,mimeType:img.type,buffer:Buffer.from(img.bytes)});};
const profileOf=(page,acct)=>page.evaluate((a)=>JSON.parse(localStorage.getItem('klabs-business-profile:'+a)||'null'),acct);
const setProfile=(page,patch)=>page.evaluate((p)=>{Object.assign(businessProfile,p);saveBusinessProfile();syncBusinessProfileControls(true);},patch);
const switchTo=(page,acct)=>page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;reloadBusinessProfileForAccount();},acct);
const quoteDoc=(page)=>page.evaluate(()=>{Object.assign(quote,{customerName:'Synthetic Customer',quoteNumber:'Q-1',buildName:'Rod'});const d=document.createElement('div');d.innerHTML=customerQuoteSummaryMarkup();return {html:d.innerHTML,text:d.textContent,logos:[...d.querySelectorAll('img.klabs-brand-logo')].map((i)=>i.getAttribute('src'))};});
const invoiceDoc=(page,statement)=>page.evaluate((s)=>{const snap=buildInvoiceSnapshot(true);const d=document.createElement('div');d.innerHTML=invoiceDocumentMarkup(snap,snap.payments,s,true);
  return {snap,text:d.textContent,logos:[...d.querySelectorAll('.invoice-document__logo')].map((i)=>i.getAttribute('src')),eyebrow:!!d.querySelector('.invoice-document__eyebrow'),heading:d.querySelector('.invoice-document__brand span')?.textContent};},!!statement);

async function main(){
  const server=await serve();const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await playwright[process.env.TDS_BROWSER||'chromium'].launch({headless:true});
  try{
    let {context,page,errors}=await boot(browser,base,{width:390,height:844});
    await page.evaluate(()=>localStorage.clear());
    await page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;reloadBusinessProfileForAccount();},A);
    await page.evaluate(()=>{goScreen('settingsScreen');document.getElementById('settingsBusinessProfileCard').open=true;});

    // ---- Account A (K-Labs): no logo uploaded yet -> text-only heading, never a built-in mark ----
    await setProfile(page,{businessName:'K-Labs',contactName:'Synthetic Owner',email:'owner@klabs.example',phone:'021 000 000',addressLine1:'1 Test Lane',cityTown:'Testville',gstNumber:'111-111-111'});
    let q=await quoteDoc(page);
    ck('A without a logo: quote shows the business name and no logo image',q.logos.length===0&&/K-Labs/.test(q.text)&&/owner@klabs.example/.test(q.text),q.logos);
    let inv=await invoiceDoc(page);
    ck('A without a logo: invoice shows a text-only heading, no image, and no "K-Labs Studio" software attribution',inv.logos.length===0&&inv.heading==='K-Labs'&&!inv.eyebrow&&!/K-Labs Studio/.test(inv.text),inv);
    ck('Settings shows "No logo", offers Upload and hides Remove',(await page.locator('#settingsBusinessLogoPreview').textContent()).includes('No logo')&&(await page.locator('#settingsBusinessLogoChoose').textContent())==='Upload logo'&&await page.locator('#settingsBusinessLogoRemove').isHidden());
    ck('The K-Labs logo helper is hidden for non-owner accounts',await page.locator('#settingsBusinessLogoKLabs').isHidden());

    // ---- Upload (PNG), preview, storage scoped to A ----
    const pngA=await makeImage(page,{type:'image/png',w:900,h:300,color:'#861e2a',text:'K-LABS'});
    await pick(page,pngA,'klabs.png');
    await page.waitForSelector('#settingsBusinessLogoPreview img');
    const storedA=await profileOf(page,A);
    ck('Upload: preview appears, logo is a PNG data URL saved only in account A\'s profile, scaled within 480x240',/^data:image\/png;base64,/.test(storedA.logo)&&storedA.logo.length<=96000&&(await profileOf(page,B))===null,{len:storedA.logo.length});
    const dim=await page.evaluate(()=>{const i=document.querySelector('#settingsBusinessLogoPreview img');return {w:i.naturalWidth,h:i.naturalHeight};});
    ck('Large upload is downscaled (900x300 -> 480x160) preserving aspect ratio',dim.w===480&&dim.h===160,dim);
    ck('Button now says Replace and Remove is offered',(await page.locator('#settingsBusinessLogoChoose').textContent())==='Replace logo'&&await page.locator('#settingsBusinessLogoRemove').isVisible());
    q=await quoteDoc(page);inv=await invoiceDoc(page);
    ck('A: quote and invoice show A\'s uploaded logo with A\'s details',q.logos.length===1&&q.logos[0]===storedA.logo&&inv.logos.length===1&&inv.logos[0]===storedA.logo&&inv.heading==='K-Labs'&&!inv.eyebrow);
    const aSettingsPayload=await page.evaluate(()=>JSON.stringify(readStudioSettingsSyncPayload()));
    ck('The logo is part of the account\'s settings sync payload (cross-device)',JSON.parse(aSettingsPayload).businessProfile.logo===storedA.logo);

    // ---- Account B: another rod builder, completely separate ----
    await switchTo(page,B);
    await setProfile(page,{businessName:'Northern Rods Ltd',contactName:'Synthetic Builder',email:'hello@northern.example',phone:'09 555 0100',addressLine1:'9 Harbour Rd',cityTown:'Otherville',country:'New Zealand',gstNumber:'222-222-222'});
    q=await quoteDoc(page);inv=await invoiceDoc(page);
    const bText=q.text+' '+inv.text;
    ck('Account switch: B sees none of A\'s logo or K-Labs details anywhere (quote, invoice, settings preview)',!q.html.includes(storedA.logo)&&inv.logos.length===0&&!/k-labs/i.test(bText)&&!/klabs/i.test(bText)&&(await page.locator('#settingsBusinessLogoPreview img').count())===0,{q:q.logos,i:inv.logos});
    ck('B: own name, contact and address on both documents',/Northern Rods Ltd/.test(q.text)&&/hello@northern.example/.test(q.text)&&/9 Harbour Rd/.test(q.text)&&inv.heading==='Northern Rods Ltd'&&/9 Harbour Rd/.test(inv.text));
    const invB0=await invoiceDoc(page,true);
    ck('B payment statement has no K-Labs branding either',!/k-labs/i.test(invB0.text)&&invB0.logos.length===0&&!invB0.eyebrow);

    // ---- B uploads a JPEG, then replaces it with a WebP, then removes it ----
    const jpgB=await makeImage(page,{type:'image/jpeg',w:300,h:300,color:'#1f4e79',text:'NORTH'});
    await pick(page,jpgB,'north.jpg');await page.waitForSelector('#settingsBusinessLogoPreview img');
    const s1=(await profileOf(page,B)).logo;
    ck('B JPEG upload is re-encoded to a plain stored raster and shown',/^data:image\/(png|jpeg);base64,/.test(s1)&&s1!==storedA.logo);
    const webpB=await makeImage(page,{type:'image/webp',w:240,h:120,color:'#2e7d32',text:'WEBP'});
    await pick(page,webpB,'north.webp');await page.waitForFunction((old)=>{const p=JSON.parse(localStorage.getItem('klabs-business-profile:bbbbbbbb-0000-0000-0000-00000000000b'));return p.logo&&p.logo!==old;},s1);
    const s2=(await profileOf(page,B)).logo;
    ck('Replacing the logo swaps it (WebP accepted)',s2!==s1&&s2.length>0);
    ck('A\'s stored logo is untouched by B\'s changes',(await profileOf(page,A)).logo===storedA.logo);
    // A new issued-invoice snapshot carries B's logo; replacing it later must not alter the issued document.
    const issued=await page.evaluate(()=>JSON.parse(JSON.stringify(buildInvoiceSnapshot(false))));
    ck('A new invoice snapshot embeds the issuing business\'s own logo',issued.brand&&issued.brand.logo===s2);
    await page.locator('#settingsBusinessLogoRemove').click();
    ck('Remove: logo cleared from B\'s profile, preview back to "No logo", status confirms',(await profileOf(page,B)).logo===''&&(await page.locator('#settingsBusinessLogoPreview').textContent()).includes('No logo')&&/removed/i.test(await page.locator('#settingsBusinessLogoStatus').textContent()));
    const issuedHtml=await page.evaluate((snap)=>{quote.issuedInvoice=snap;const d=document.createElement('div');d.innerHTML=invoiceDocumentMarkup(quote.issuedInvoice,quote.issuedInvoice.payments,false,false);return {logos:[...d.querySelectorAll('.invoice-document__logo')].map((i)=>i.getAttribute('src')),text:d.textContent};},issued);
    ck('Already-issued invoice keeps its own snapshot logo after the profile logo is removed (never silently altered)',issuedHtml.logos.length===1&&issuedHtml.logos[0]===s2&&/Northern Rods Ltd/.test(issuedHtml.text));
    await page.evaluate(()=>{delete quote.issuedInvoice;});

    // ---- Legacy issued invoices (made before logos existed) ----
    const legacy=await page.evaluate(()=>{
      const base={number:'INV-LEGACY',issuedDate:'2026-10-01',businessLines:['x'],customerLines:['c'],buildId:'b1',currency:'NZD',total:100,tax:null,payments:[]};
      const render=(name)=>{const d=document.createElement('div');d.innerHTML=invoiceDocumentMarkup({...base,businessName:name},[],false,false);return {logo:d.querySelector('.invoice-document__logo')?.getAttribute('src')||null,eyebrow:!!d.querySelector('.invoice-document__eyebrow'),name:d.querySelector('.invoice-document__brand span').textContent,number:d.querySelector('[data-invoice-number]').getAttribute('data-invoice-number')};};
      const asBlank=render('K-Labs'); // old code stamped "K-Labs" on invoices when a subscriber's profile name was blank
      const saved=businessProfile.businessName;businessProfile.businessName='K-Labs';const klabs=render('K-Labs');const other=render('Southern Rods');businessProfile.businessName=saved;
      return {klabs,other,asBlank};});
    ck('A legacy invoice stamped K-Labs by the old blank-name fallback never shows the K-Labs mark under another business',legacy.asBlank.logo===null&&!legacy.asBlank.eyebrow);
    ck('Legacy invoice issued as K-Labs is unchanged for the K-Labs account (mark and eyebrow)',legacy.klabs.logo==='assets/logo.svg'&&legacy.klabs.eyebrow&&legacy.klabs.name==='K-Labs');
    ck('Legacy invoice issued under another business never shows the K-Labs mark or eyebrow; recorded data unchanged',legacy.other.logo===null&&!legacy.other.eyebrow&&legacy.other.name==='Southern Rods'&&legacy.other.number==='INV-LEGACY');

    // ---- Validation: bad files are refused with a clear message and nothing is stored ----
    const before=(await profileOf(page,B)).logo;
    await page.setInputFiles('#settingsBusinessLogoFile',{name:'x.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')});
    await page.waitForFunction(()=>document.getElementById('settingsBusinessLogoStatus').dataset.state==='error');
    ck('SVG is refused (script risk) with a clear message',/PNG, JPEG or WebP/.test(await page.locator('#settingsBusinessLogoStatus').textContent())&&(await profileOf(page,B)).logo===before);
    await page.setInputFiles('#settingsBusinessLogoFile',{name:'junk.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
    await page.waitForFunction(()=>/could not be read/i.test(document.getElementById('settingsBusinessLogoStatus').textContent));
    ck('A corrupt file is refused and nothing is stored',(await profileOf(page,B)).logo===before);
    await page.setInputFiles('#settingsBusinessLogoFile',{name:'big.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});
    await page.waitForFunction(()=>/5 MB/.test(document.getElementById('settingsBusinessLogoStatus').textContent));
    ck('A file over 5 MB is refused',true);
    const tiny=await makeImage(page,{type:'image/png',w:16,h:16,color:'#000',text:''});
    await pick(page,tiny,'tiny.png');await page.waitForFunction(()=>/too small/i.test(document.getElementById('settingsBusinessLogoStatus').textContent));
    ck('An image too small to print clearly is refused',(await profileOf(page,B)).logo===before);
    const noisy=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=480;c.height=240;const x=c.getContext('2d');const d=x.createImageData(480,240);for(let i=0;i<d.data.length;i++)d.data[i]=i%4===3?255:Math.floor(Math.random()*256);x.putImageData(d,0,0);const b=await new Promise((r)=>c.toBlob(r,'image/png'));return {type:'image/png',bytes:Array.from(new Uint8Array(await b.arrayBuffer()))};});
    await pick(page,noisy,'noise.png');await page.waitForFunction(()=>/too detailed|Logo saved/i.test(document.getElementById('settingsBusinessLogoStatus').textContent));
    const noisyStored=(await profileOf(page,B)).logo;
    ck('A very detailed image is either shrunk to the storage cap or refused, never stored over the limit',noisyStored.length<=96000,noisyStored.length);

    // ---- Corrupt or hostile stored values are ignored (text-only fallback) ----
    await setProfile(page,{logo:'javascript:alert(1)'});
    ck('A hostile logo value is treated as no logo',(await quoteDoc(page)).logos.length===0&&(await invoiceDoc(page)).logos.length===0);
    await setProfile(page,{logo:'data:image/png;base64,AAAA'});
    await page.evaluate(()=>{const d=document.createElement('div');d.id='probe';d.innerHTML=invoiceDocumentMarkup(buildInvoiceSnapshot(true),[],false,true);document.body.appendChild(d);});
    await page.waitForFunction(()=>!document.querySelector('#probe .invoice-document__logo'));
    ck('A logo that fails to decode is removed from the page, leaving the text heading',(await page.locator('#probe .invoice-document__brand span').textContent())==='Northern Rods Ltd');
    await page.evaluate(()=>document.getElementById('probe').remove());
    await setProfile(page,{logo:''});

    // ---- Email draft output: text only, correct identity, no K-Labs for B; neutral wording with a blank name ----
    const email=await page.evaluate(()=>{Object.assign(quote,{customerName:'Synthetic Customer',email:'c@example.com',quoteNumber:'Q-9'});let href='';
      const orig=Object.getOwnPropertyDescriptor(window.location.__proto__,'href');const lines=customerEmailLines().join('\n');
      const profile=businessProfile.businessName;businessProfile.businessName='';const blank=customerEmailLines().join('\n');businessProfile.businessName=profile;
      return {lines,blank};});
    ck('B email body names B and never K-Labs',/Northern Rods Ltd/.test(email.lines)&&!/k-labs/i.test(email.lines)&&/Hello|Hi /.test(email.lines)||/Northern Rods Ltd/.test(email.lines));
    ck('A blank business name never falls back to K-Labs wording',!/k-labs/i.test(email.blank)&&!/with\s*\./.test(email.blank),email.blank.slice(0,200));
    const coll=await page.evaluate(()=>{quote.fulfilmentMethod='collection';const s=customerFulfilmentSection();const n=businessProfile.businessName;businessProfile.businessName='';const t=customerFulfilmentSection();businessProfile.businessName=n;return {named:s.lines[0],blank:t.lines[0]};});
    ck('Collection wording uses B\'s name, or neutral wording when blank',coll.named==='Customer to collect from Northern Rods Ltd.'&&coll.blank==='Customer to collect.',coll);

    // ---- PDF: built from the document itself (own logo, or text-only), no shared image, no software attribution ----
    await setProfile(page,{logo:''});
    const pdfCapture=async(label)=>{
      await page.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<div id="pdfHost"></div><button id="pdfBtn"></button>');});
      const run=async()=>{await page.evaluate(()=>{const snap=buildInvoiceSnapshot(true);const h=document.getElementById('pdfHost');h.innerHTML=invoiceDocumentMarkup(snap,snap.payments,false,true);KLABS_INVOICE_PDF.prepare(h.firstElementChild,document.getElementById('pdfBtn'));});
        await page.waitForFunction(()=>document.getElementById('pdfBtn').textContent==='Print / Save as PDF'&&!document.getElementById('pdfBtn').disabled,null,{timeout:20000});};
      await run();   // loads the PDF libraries
      await page.evaluate(()=>{window.__defs=[];const o=pdfMake.createPdf.bind(pdfMake);pdfMake.createPdf=(d)=>{window.__defs.push(JSON.stringify(d));return o(d);};});
      await run();
      const out=await page.evaluate(()=>window.__defs[window.__defs.length-1]);
      await page.evaluate(()=>{document.getElementById('pdfHost').remove();document.getElementById('pdfBtn').remove();});
      return out;
    };
    const pdfText=await pdfCapture('text');
    ck('PDF without a logo: text-only heading with the business name, no image, no K-Labs attribution',!/"image"/.test(pdfText)&&!/"svg"/.test(pdfText)&&/Northern Rods Ltd/.test(pdfText)&&!/K-LABS STUDIO/i.test(pdfText)&&!/k-labs/i.test(pdfText));
    await setProfile(page,{logo:s2});
    const pdfLogo=await pdfCapture('logo');
    ck('PDF with a logo embeds that logo as an image (no shared logo fetched)',/"image":"data:image\/(png|jpeg)/.test(pdfLogo)&&!/"svg"/.test(pdfLogo)&&!/K-LABS STUDIO/i.test(pdfLogo));
    // Offline: the logo is local profile data, so documents and PDFs still work with the network down.
    await context.setOffline(true);
    q=await quoteDoc(page);inv=await invoiceDoc(page);
    ck('Offline: documents still show the account\'s logo from local data',q.logos[0]===s2&&inv.logos[0]===s2);
    const pdfOffline=await pdfCapture('offline');
    ck('Offline: the PDF is still generated with the logo',/"image":"data:image/.test(pdfOffline));
    await context.setOffline(false);

    // ---- Cross-device: a second browser for the same account receives the logo via the settings payload ----
    const payload=await page.evaluate(()=>readStudioSettingsSyncPayload());
    const dev2=await boot(browser,base,{width:1440,height:900});
    await dev2.page.evaluate((b)=>{localStorage.clear();window.KLABS_ACCOUNT_ID=b;reloadBusinessProfileForAccount();},B);
    await dev2.page.evaluate((p)=>applyStudioSettingsSyncPayload(p),payload);
    const onDev2=await quoteDoc(dev2.page);const invDev2=await invoiceDoc(dev2.page);
    ck('Cross-device: the second device shows the same logo and details after settings sync',onDev2.logos[0]===s2&&invDev2.logos[0]===s2&&/Northern Rods Ltd/.test(onDev2.text));
    // ...and a different account on that device sees nothing of it.
    await dev2.page.evaluate((a)=>{window.KLABS_ACCOUNT_ID=a;reloadBusinessProfileForAccount();},A);
    const aOnDev2=await quoteDoc(dev2.page);
    ck('Cross-account on one device: another account signing in there sees nothing of B (no logo, no name)',aOnDev2.logos.length===0&&!aOnDev2.html.includes(s2)&&!/Northern/.test(aOnDev2.text));
    await dev2.context.close();

    // ---- Owner-only K-Labs helper: saves the bundled mark into the owner's own profile ----
    await switchTo(page,A);await setProfile(page,{logo:''});
    await page.evaluate(()=>{window.KLABS_ADMIN_ACCESS={isOwner:()=>true};syncBusinessLogoControls();});
    ck('The owner account is offered "Use K-Labs logo"',await page.locator('#settingsBusinessLogoKLabs').isVisible());
    await page.locator('#settingsBusinessLogoKLabs').click();
    await page.waitForFunction((a)=>{const p=JSON.parse(localStorage.getItem('klabs-business-profile:'+a));return p&&p.logo;},A);
    ck('It saves a K-Labs logo into the owner\'s profile only',/^data:image\/png/.test((await profileOf(page,A)).logo)&&(await profileOf(page,B)).logo===s2);
    await page.evaluate(()=>{window.KLABS_ADMIN_ACCESS={isOwner:()=>false};syncBusinessLogoControls();});
    ck('Hidden again for non-owners',await page.locator('#settingsBusinessLogoKLabs').isHidden());

    // ---- Print path: logo failures never block printing ----
    ck('No page errors during branding checks',errors.length===0,errors);
    await context.close();
  }finally{await browser.close();server.close();}
  console.log(`PASS: ${passed} subscriber document branding checks.`);
}
main().catch((e)=>{console.error(e);process.exit(1);});
