// Synchronisation reliability: deterministic reproductions of the confirmed Phase 1 defects plus the safety properties the fix must keep.
// Runs the real sync engine, journal and transport (tests/helpers/sync-harness.cjs). Synthetic data only.
// To see the failures on the pre-fix engine:  SYNC_SRC_DIR=/path/to/older/checkout node --test tests/sync-reliability.test.cjs
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {makeCloud,makeDevice,build,synced,sharedRow,clone,diffKeys,settle}=require('./helpers/sync-harness.cjs');
const META={savedAt:'2026-11-16T23:41:23.111Z',updatedAt:'2026-11-16T23:41:23.111Z'};
const dep={id:'p1',type:'deposit',amount:816,date:'2026-11-13'};
const pair=async(extra)=>{
  const cloud=makeCloud();const rec=build('X',{customerName:'Synthetic Customer',...extra});
  cloud.seed('U','X',rec);                       // one cloud row; both devices have synchronised it (same revision)
  const mk=async(name)=>{const d=makeDevice(cloud,'U',name);d.seedLocal(rec);await d.signIn();return d;};
  const mac=await mk('mac');const phone=await mk('phone');
  return {cloud,rec,mac,phone};
};
const noConflict=(d)=>assert.deepEqual(Object.keys(d.journal().conflicts),[],'no conflict recorded');

// ---------- RC1: viewing an unchanged build ----------
test('RC1 an unedited build that is merely open accepts the newer cloud version without a conflict',async()=>{
  const {rec,mac,phone}=await pair({payments:[]});
  mac.ui.open.add('X');
  phone.save({...rec,notes:'phone tweak',...META});await phone.flushTimers();
  await mac.sync();
  noConflict(mac);assert.equal(mac.status(),'synced');
  assert.equal(mac.record('X').notes,'phone tweak','local copy now matches the cloud');
  assert.ok(mac.ui.refreshed.some((r)=>r.id==='X'&&r.record.notes==='phone tweak'),'the open screen is refreshed with the cloud version');
  assert.equal(mac.writes(),0,'nothing is uploaded');
});
test('RC1 an open build with unsaved typing is never overwritten and never conflicts while it is only being typed',async()=>{
  const {rec,mac,phone}=await pair();
  mac.ui.open.add('X');mac.ui.unsaved.add('X');
  phone.save({...rec,notes:'phone tweak',...META});await phone.flushTimers();
  await mac.sync();
  noConflict(mac);assert.equal(mac.record('X').notes,'','typed-over local copy is left alone');
  assert.equal(mac.ui.refreshed.length,0,'the open screen is not replaced');assert.equal(mac.writes(),0);
  // The typing is then saved (a different field): both changes are kept.
  mac.ui.unsaved.delete('X');mac.save({...rec,buildName:'Mac rename',...{savedAt:'2026-11-17T00:00:00.000Z'}});await mac.flushTimers();await mac.sync();
  noConflict(mac);
  assert.equal(mac.cloudRef.get('U','X').payload.notes,'phone tweak');assert.equal(mac.cloudRef.get('U','X').payload.buildName,'Mac rename');
});

test('RC1 closing the build is not required: the same result when the build is not open',async()=>{
  const {rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone tweak',...META});await phone.flushTimers();await mac.sync();
  noConflict(mac);assert.equal(mac.record('X').notes,'phone tweak');assert.equal(mac.status(),'synced');
});

// ---------- RC2: stuck conflicts from older releases ----------
async function legacyConflict({localEdited=false,cloudChange={notes:'phone tweak',...META}}={}){
  const {cloud,rec,mac,phone}=await pair();
  phone.save({...rec,...cloudChange});await phone.flushTimers();
  const row=cloud.get('U','X');
  const j=mac.journal();
  if(localEdited){mac.locals.list=[{...rec,notes:'mac edit'}];}
  j.conflicts.X={id:'X',local:clone(mac.record('X')),cloud:{...row.payload,id:'X'},revision:row.updated_at,operation:'save',reason:'Versions require review.',history:[]};
  if(localEdited)j.pending.X={kind:'save',record:clone(mac.record('X')),token:'legacy-1'};
  mac.window.KLABS_BUILD_SYNC_JOURNAL.write('U',j);
  return {cloud,rec,mac,phone,row};
}
test('RC2 a stuck conflict whose local copy was never edited clears itself and archives the evidence',async()=>{
  const {mac}=await legacyConflict();
  await mac.sync();
  noConflict(mac);assert.equal(mac.status(),'synced');assert.equal(mac.record('X').notes,'phone tweak');
  const a=mac.journal().archive.filter((x)=>x.id==='X');
  assert.ok(a.length>=1&&a.some((x)=>x.choice==='auto-resolved'&&x.local&&x.cloud),'both versions are archived with the automatic resolution');
});
test('RC2 a stuck conflict clears when local and cloud have become the same',async()=>{
  const {cloud,mac,row}=await legacyConflict();
  mac.locals.list=[{...row.payload,id:'X'}];
  await mac.sync();noConflict(mac);assert.equal(mac.status(),'synced');assert.equal(mac.writes(),0);
});
test('RC2 a stuck conflict with a real local edit on the same field stays, with both versions and its original reason',async()=>{
  const {cloud,mac,row}=await legacyConflict({localEdited:true,cloudChange:{notes:'phone note',...META}});
  const j=mac.journal();j.conflicts.X.reason='This build is open. Close it before reviewing the cloud version.';mac.window.KLABS_BUILD_SYNC_JOURNAL.write('U',j);
  await mac.sync();await mac.sync();
  const c=mac.journal().conflicts.X;
  assert.ok(c,'genuine conflict preserved');assert.equal(mac.status(),'error');
  assert.equal(c.local.notes,'mac edit');assert.equal(c.cloud.notes,'phone note');
  assert.notEqual(c.reason,'Versions require review.','the generic text does not replace a recorded reason');
  assert.equal(cloud.get('U','X').payload.notes,'phone note','cloud untouched');
});
test('RC2 a legacy conflict record with missing optional fields is tolerated',async()=>{
  const {mac,row}=await legacyConflict();
  const j=mac.journal();j.conflicts.X={id:'X',local:j.conflicts.X.local,cloud:j.conflicts.X.cloud,revision:row.updated_at,reason:'old'};
  mac.window.KLABS_BUILD_SYNC_JOURNAL.write('U',j);
  await mac.sync();noConflict(mac);
});

// ---------- RC3: harmless metadata ----------
test('RC3 timestamp-only differences on both devices are not a conflict and cause no upload loop',async()=>{
  const {rec,mac,phone}=await pair();
  phone.save({...rec,...META});await phone.flushTimers();
  mac.save({...rec,savedAt:'2026-11-16T23:30:00.000Z',updatedAt:'2026-11-16T23:30:00.000Z'});
  await mac.sync();noConflict(mac);assert.equal(mac.status(),'synced');assert.deepEqual(Object.keys(mac.journal().pending),[]);
  assert.equal(mac.writes(),0);
});
test('RC3 a timestamp-only local save is not uploaded and does not leave the build pending',async()=>{
  const {rec,mac}=await pair();
  mac.save({...rec,savedAt:'2026-11-17T01:00:00.000Z',updatedAt:'2026-11-17T01:00:00.000Z'});await mac.flushTimers();
  assert.equal(mac.writes(),0);assert.equal(mac.status(),'synced');assert.deepEqual(Object.keys(mac.journal().pending),[]);
});
test('RC3 a legacy numeric id compares equal to the cloud string id',async()=>{
  const cloud=makeCloud();const rec=build(123,{});
  const d=await synced(cloud,'U','123',rec,'mac');await d.sync();
  noConflict(d);assert.equal(d.status(),'synced');assert.equal(d.writes(),0);
});

// ---------- RC4: lost acknowledgement ----------
test('RC4 an upload that lands but is never acknowledged, followed by more editing, does not conflict with itself',async()=>{
  const {cloud,rec,mac}=await pair();
  cloud.failures.dropAck=1;      // the server accepts v1, the reply is lost and the connection stays down
  mac.save({...rec,notes:'v1',savedAt:'2026-11-17T01:00:00.000Z'});await mac.flushTimers();
  assert.equal(cloud.get('U','X').payload.notes,'v1','the server accepted v1');assert.equal(mac.status(),'failed','reported as failed, never as synced');
  mac.save({...rec,notes:'v2',savedAt:'2026-11-17T01:05:00.000Z'});
  cloud.failures.network=false;await mac.sync();await mac.sync();
  noConflict(mac);assert.equal(cloud.get('U','X').payload.notes,'v2');assert.equal(mac.status(),'synced');
  assert.equal(cloud.ids('U').length,1,'no duplicate rows');
});
test('RC4 a lost acknowledgement on a brand-new build does not create a duplicate or a conflict',async()=>{
  const cloud=makeCloud();const mac=makeDevice(cloud,'U','mac');await mac.signIn();
  cloud.failures.dropAck=1;
  mac.save(build('N1',{notes:'first'}));await mac.flushTimers();
  assert.equal(cloud.ids('U').length,1);
  mac.save(build('N1',{notes:'second'}));cloud.failures.network=false;await mac.sync();await mac.sync();
  noConflict(mac);assert.equal(cloud.get('U','N1').payload.notes,'second');assert.equal(cloud.ids('U').length,1);assert.equal(mac.status(),'synced');
});
test('RC4 a lost acknowledgement with no further editing is recognised and cleared',async()=>{
  const {cloud,rec,mac}=await pair();
  cloud.failures.dropAck=1;mac.save({...rec,notes:'v1'});await mac.flushTimers();cloud.failures.network=false;await mac.sync();
  noConflict(mac);assert.equal(mac.status(),'synced');assert.deepEqual(Object.keys(mac.journal().pending),[]);
});

// ---------- genuine concurrent edits ----------
test('a real simultaneous edit of the same field is a conflict, keeps both versions and uploads nothing',async()=>{
  const {cloud,rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone'});await phone.flushTimers();
  mac.save({...rec,notes:'mac'});await mac.sync();
  const c=mac.journal().conflicts.X;
  assert.ok(c);assert.equal(mac.status(),'error');assert.equal(c.local.notes,'mac');assert.equal(c.cloud.notes,'phone');
  assert.equal(cloud.get('U','X').payload.notes,'phone');assert.equal(mac.record('X').notes,'mac','local edit preserved');
  assert.equal(mac.writes(),0);
});
test('edits to different fields on two devices are merged automatically and both survive',async()=>{
  const {cloud,rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone',...META});await phone.flushTimers();
  mac.save({...rec,buildName:'Mac rename',savedAt:'2026-11-17T00:00:00.000Z'});await mac.sync();await mac.sync();
  noConflict(mac);assert.equal(mac.status(),'synced');
  const merged=cloud.get('U','X').payload;assert.equal(merged.notes,'phone');assert.equal(merged.buildName,'Mac rename');
  assert.equal(mac.record('X').notes,'phone');assert.equal(mac.record('X').buildName,'Mac rename');
  assert.ok(mac.journal().archive.some((a)=>a.id==='X'&&a.choice==='auto-resolved'),'evidence archived');
});

// ---------- financial protection ----------
test('financial: a stale device with an ordinary edit picks up a payment recorded elsewhere and never re-sends payments',async()=>{
  const {cloud,rec,mac}=await pair({payments:[]});
  cloud.pay('U','X',dep);
  mac.save({...rec,notes:'mac note',savedAt:'2026-11-17T00:00:00.000Z'});await mac.sync();await mac.sync();
  noConflict(mac);const row=cloud.get('U','X').payload;
  assert.deepEqual(row.payments,[dep],'the server payment is kept exactly');assert.equal(row.notes,'mac note');
  assert.deepEqual(mac.record('X').payments,[dep]);
});
test('financial: a local record that carries different payments than the cloud is a conflict, never uploaded',async()=>{
  const {cloud,rec,mac}=await pair({payments:[]});
  cloud.pay('U','X',dep);
  mac.save({...rec,payments:[{id:'px',type:'deposit',amount:1,date:'2026-11-17'}],notes:'x'});await mac.sync();
  assert.ok(mac.journal().conflicts.X);assert.deepEqual(cloud.get('U','X').payload.payments,[dep]);
  assert.equal(cloud.writes.filter((w)=>w.by==='mac').length,0);
});
test('financial: an issued invoice in the cloud is never overwritten and is adopted by an unedited stale device',async()=>{
  const {cloud,rec,mac}=await pair({payments:[]});
  const row=cloud.rows('U').get('X');const inv={number:'INV-1',total:1000};
  cloud.rows('U').set('X',{...row,payload:{...row.payload,issuedInvoice:inv,...META},updated_at:cloud.stamp()});
  await mac.sync();noConflict(mac);assert.deepEqual(mac.record('X').issuedInvoice,inv);
});
test('financial: a stale device that edits a different field keeps the issued invoice; one that changes it conflicts',async()=>{
  const a=await pair({payments:[]});
  const row=a.cloud.rows('U').get('X');const inv={number:'INV-1',total:1000};
  a.cloud.rows('U').set('X',{...row,payload:{...row.payload,issuedInvoice:inv},updated_at:a.cloud.stamp()});
  a.mac.save({...a.rec,notes:'later'});await a.mac.sync();await a.mac.sync();
  noConflict(a.mac);assert.deepEqual(a.cloud.get('U','X').payload.issuedInvoice,inv);assert.equal(a.cloud.get('U','X').payload.notes,'later');
  const b=await pair({payments:[]});
  const row2=b.cloud.rows('U').get('X');
  b.cloud.rows('U').set('X',{...row2,payload:{...row2.payload,issuedInvoice:inv},updated_at:b.cloud.stamp()});
  b.mac.save({...b.rec,issuedInvoice:{number:'INV-2',total:5}});await b.mac.sync();
  assert.ok(b.mac.journal().conflicts.X);assert.deepEqual(b.cloud.get('U','X').payload.issuedInvoice,inv);
});

// ---------- offline, restart, failures ----------
test('offline edits are queued durably, survive a restart and upload once on reconnection',async()=>{
  const {cloud,rec,mac}=await pair();
  cloud.failures.network=true;
  mac.save({...rec,notes:'offline edit'});await mac.sync();
  assert.equal(mac.status(),'failed','a network failure is not a conflict');noConflict(mac);
  assert.equal(mac.journal().pending.X.record.notes,'offline edit');
  const again=mac.restart();cloud.failures.network=false;await again.signIn();await again.sync();
  assert.equal(cloud.get('U','X').payload.notes,'offline edit');assert.equal(again.status(),'synced');noConflict(again);
  assert.equal(cloud.writes.filter((w)=>w.id==='X').length,1,'uploaded exactly once');
});
test('restart or app upgrade with an unchanged build produces no pending work, no conflict and no writes',async()=>{
  const {mac}=await pair();
  const again=mac.restart();await again.signIn();await again.sync();
  assert.equal(again.status(),'synced');assert.equal(again.writes(),0);noConflict(again);
});
test('repeat synchronisation with no user changes stays quiet even when a local copy only differs in timestamps',async()=>{
  const {rec,mac}=await pair();
  mac.locals.list=[{...rec,savedAt:'2026-11-17T09:00:00.000Z',updatedAt:'2026-11-17T09:00:00.000Z'}];
  for(let i=0;i<5;i++)await mac.sync();
  assert.equal(mac.writes(),0);assert.equal(mac.status(),'synced');noConflict(mac);assert.deepEqual(Object.keys(mac.journal().pending),[]);
});
test('a degraded or expired session never removes or conflicts local builds',async()=>{
  const {cloud,mac}=await pair();
  cloud.rows('U').clear();cloud.failures.auth='JWT expired';
  await mac.sync();
  assert.deepEqual(mac.ids(),['X']);noConflict(mac);assert.equal(mac.status(),'failed');
});
test('a tab that does not own the account lock reads and writes nothing',async()=>{
  const {cloud,rec,mac}=await pair();
  let owns=false;mac.window.KLABS_BUILD_TAB_LOCK={owns:()=>owns};
  assert.throws(()=>mac.save({...rec,notes:'blocked'}));const before=cloud.writes.length;await mac.sync();
  assert.equal(cloud.writes.length,before,'nothing is written while another tab owns the account');
  owns=true;await mac.sync();                       // the edit was already on this device and is picked up once the lock is held
  assert.equal(cloud.get('U','X').payload.notes,'blocked','the edit is not lost');
});
test('switching accounts never sends one account\'s pending build to another',async()=>{
  const cloud=makeCloud();const rec=build('X',{});
  const a=await synced(cloud,'A','X',rec,'a');a.save({...rec,notes:'A edit'});
  a.window.KLABS_ACCOUNT_ID='B';await a.window.KLABS_BUILD_SYNC.onAuthStateChanged({user:{id:'B'}});await a.sync();
  assert.deepEqual(cloud.ids('B'),[],'nothing was written to account B');
});

// ---------- deletion ----------
test('delete then reconnect: a stale unedited copy is retired, not resurrected; an edited stale copy is kept for review',async()=>{
  const cloud=makeCloud();const rec=build('D1',{});
  const [desk,phone]=await sharedRow(cloud,'U','D1',rec,['desk','phone']);
  desk.del('D1');await desk.flushTimers();assert.deepEqual(cloud.ids('U'),[]);
  await phone.sync();assert.deepEqual(phone.ids(),[]);noConflict(phone);assert.ok(!phone.events.some((e)=>e.op==='insert'));
  const rec2=build('D2',{});const [d2,p2]=await sharedRow(cloud,'U','D2',rec2,['desk','phone']);
  d2.del('D2');await d2.flushTimers();p2.save({...rec2,notes:'edited offline'});await p2.sync();
  assert.ok(p2.journal().conflicts.D2);assert.equal(p2.record('D2').notes,'edited offline');assert.deepEqual(cloud.ids('U'),[]);
});

// ---------- resolution safety ----------
test('resolve: the unedited local copy can only be replaced by the cloud, never pushed over it',async()=>{
  const {cloud,mac,row}=await legacyConflict();
  // Force the legacy conflict to stay (simulate the review dialog being used before the auto reassessment ran).
  await assert.rejects(()=>mac.window.KLABS_BUILD_SYNC.resolveConflict('X','local',row.updated_at),/no changes|cloud version/i);
  assert.equal(cloud.get('U','X').payload.notes,'phone tweak');
});
test('resolve: choosing the cloud works for a build that is open but not being typed in, and is blocked while it has unsaved typing',async()=>{
  const {rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone'});await phone.flushTimers();
  mac.save({...rec,notes:'mac'});await mac.sync();
  const c=mac.journal().conflicts.X;mac.ui.open.add('X');mac.ui.unsaved.add('X');
  await assert.rejects(()=>mac.window.KLABS_BUILD_SYNC.resolveConflict('X','cloud',c.revision),/typing|unsaved|saved/i);
  mac.ui.unsaved.delete('X');
  await mac.window.KLABS_BUILD_SYNC.resolveConflict('X','cloud',c.revision);
  noConflict(mac);assert.equal(mac.record('X').notes,'phone');
  assert.ok(mac.journal().archive.some((a)=>a.id==='X'&&a.choice==='cloud'),'both versions archived');
});

// ---------- additional safety properties ----------
test('RC4 the note of what was being sent survives an app restart, so editing after the restart still does not conflict',async()=>{
  const {cloud,rec,mac}=await pair();
  cloud.failures.dropAck=1;mac.save({...rec,notes:'v1'});await mac.flushTimers();
  const again=mac.restart();again.save({...rec,notes:'v2'});cloud.failures.network=false;await again.signIn();await again.sync();
  noConflict(again);assert.equal(cloud.get('U','X').payload.notes,'v2');assert.equal(again.status(),'synced');
});
test('resolve: "keep this device" is refused when it would replace an issued invoice, even if asked directly',async()=>{
  const {cloud,rec,mac}=await pair({payments:[]});
  const row=cloud.rows('U').get('X');const inv={number:'INV-1',total:1000};
  cloud.rows('U').set('X',{...row,payload:{...row.payload,issuedInvoice:inv,notes:'cloud'},updated_at:cloud.stamp()});
  mac.save({...rec,issuedInvoice:{number:'INV-2',total:5},notes:'mine'});await mac.sync();
  const c=mac.journal().conflicts.X;assert.ok(c);
  await assert.rejects(()=>mac.window.KLABS_BUILD_SYNC.resolveConflict('X','local',c.revision),/issued invoice cannot be replaced/);
  assert.deepEqual(cloud.get('U','X').payload.issuedInvoice,inv);
});
test('merge is deferred, not forced, while the open build has typing that is not saved yet',async()=>{
  const {cloud,rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone',...META});await phone.flushTimers();
  mac.save({...rec,buildName:'Mac rename'});mac.ui.open.add('X');mac.ui.unsaved.add('X');
  await mac.sync();
  noConflict(mac);assert.equal(mac.record('X').notes,'','local copy not replaced under the user\'s hands');
  mac.ui.unsaved.delete('X');await mac.sync();await mac.sync();
  noConflict(mac);assert.equal(cloud.get('U','X').payload.notes,'phone');assert.equal(cloud.get('U','X').payload.buildName,'Mac rename');
});
test('every automatic resolution leaves both versions in the local archive',async()=>{
  const {rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone',...META});await phone.flushTimers();
  mac.save({...rec,buildName:'Mac rename'});await mac.sync();
  const auto=mac.journal().archive.filter((a)=>a.id==='X'&&a.choice==='auto-resolved');
  assert.ok(auto.length>=1&&auto.every((a)=>a.local&&a.cloud&&a.reason));
});
test('the conflict context reports whether this device made any change of its own',async()=>{
  const {rec,mac,phone}=await pair();
  phone.save({...rec,notes:'p'});await phone.flushTimers();mac.save({...rec,notes:'m'});await mac.sync();
  const ctx=mac.window.KLABS_BUILD_SYNC.getConflictContext().X;
  assert.equal(ctx.localUnedited,false);assert.equal(ctx.baseline.notes,'');
});

test('a pending deletion on a conflicted build is never cleared or reversed automatically',async()=>{
  const {mac,row}=await legacyConflict();
  mac.del('X');                                       // the builder deletes the build while it is in review
  await mac.sync();await mac.sync();
  assert.deepEqual(mac.ids(),[],'the build does not reappear on this device');
  assert.ok(mac.journal().conflicts.X,'the deletion still awaits an explicit decision');
  assert.equal(mac.cloudRef.get('U','X')?.payload.notes,'phone tweak','the cloud copy is untouched');
});

// ---------- v237 safety correction: interdependent pricing / financial fields are never merged field by field ----------
const priced=()=>({labourRate:80,labourHours:2,freight:20,packaging:5,deliveryTotal:25,blankCost:150,components:[{category:'Reel seat',description:'RS',cost:40}],
  markupPercent:0,marginPercent:25,targetProfit:300,pricingDriver:'price',finalCustomerPrice:1000,naturalCustomerPrice:1000,priceAdjustment:0,
  taxEnabled:true,includeGst:true,gstRate:15,depositEnabled:true,depositType:'percent',depositValue:20,payments:[]});
async function edits(cloudEdit,macEdit){
  const {cloud,rec,mac,phone}=await pair(priced());
  phone.save({...rec,...cloudEdit,...META});await phone.flushTimers();
  mac.save({...rec,...macEdit,savedAt:'2026-11-17T00:00:00.000Z'});await mac.sync();await mac.sync();
  return {cloud,rec,mac,phone};
}
const asConflict=(r,why)=>{
  assert.ok(r.mac.journal().conflicts.X,why+': kept as a conflict, not merged');assert.equal(r.mac.status(),'error');
  const c=r.mac.journal().conflicts.X;assert.ok(c.local&&c.cloud,'both versions preserved');
  assert.equal(r.mac.cloudRef.writes.filter((w)=>w.by==='mac').length,0,'this device uploaded nothing');
};
test('dependent fields: price changed on one device and labour hours on another are not combined',async()=>{
  asConflict(await edits({finalCustomerPrice:1200},{labourHours:5}),'price + labour');
});
test('dependent fields: a component cost change and a price change are not combined',async()=>{
  asConflict(await edits({finalCustomerPrice:1200},{components:[{category:'Reel seat',description:'RS',cost:90}]}),'price + components');
});
test('dependent fields: a deposit setting change and a price change are not combined',async()=>{
  asConflict(await edits({depositValue:30},{finalCustomerPrice:1300}),'deposit + price');
});
test('dependent fields: a tax rate change and a freight change are not combined',async()=>{
  asConflict(await edits({gstRate:10},{freight:60}),'tax + freight');
});
test('dependent fields: different pricing fields changed on both sides are a conflict even when no single field overlaps',async()=>{
  asConflict(await edits({targetProfit:400,marginPercent:30},{packaging:15,deliveryTotal:35}),'profit/margin + packaging');
});
test('dependent fields: a payment recorded elsewhere is not combined with a local pricing change',async()=>{
  const {cloud,rec,mac}=await pair(priced());
  cloud.pay('U','X',dep);
  mac.save({...rec,finalCustomerPrice:1500,savedAt:'2026-11-17T00:00:00.000Z'});await mac.sync();await mac.sync();
  assert.ok(mac.journal().conflicts.X,'kept as a conflict');assert.deepEqual(cloud.get('U','X').payload.payments,[dep]);
  assert.equal(cloud.get('U','X').payload.finalCustomerPrice,1000,'the cloud price was not overwritten');
});
test('independent fields still merge: pricing changed on one side, customer and notes on the other',async()=>{
  const {cloud,mac}=await edits({finalCustomerPrice:1200,marginPercent:30,targetProfit:420},{phone:'021 000 111',notes:'call back'});
  noConflict(mac);const row=cloud.get('U','X').payload;
  assert.equal(row.finalCustomerPrice,1200);assert.equal(row.marginPercent,30);assert.equal(row.targetProfit,420);
  assert.equal(row.phone,'021 000 111');assert.equal(row.notes,'call back');
});
test('independent fields still merge: pricing changed only on this device while another device edits notes',async()=>{
  const {cloud,mac}=await edits({notes:'phone note'},{finalCustomerPrice:1100,targetProfit:350});
  noConflict(mac);const row=cloud.get('U','X').payload;assert.equal(row.finalCustomerPrice,1100);assert.equal(row.notes,'phone note');
});
test('independent fields still merge: a payment recorded elsewhere with a local note edit (server payments kept)',async()=>{
  const {cloud,rec,mac}=await pair(priced());
  cloud.pay('U','X',dep);mac.save({...rec,notes:'later',savedAt:'2026-11-17T00:00:00.000Z'});await mac.sync();await mac.sync();
  noConflict(mac);assert.deepEqual(cloud.get('U','X').payload.payments,[dep]);assert.equal(cloud.get('U','X').payload.notes,'later');
});
test('both devices making the identical pricing change is not a conflict',async()=>{
  const {mac}=await edits({finalCustomerPrice:1200,targetProfit:400},{finalCustomerPrice:1200,targetProfit:400,notes:'x'});
  noConflict(mac);
});

// ---------- status honesty while a cloud change is waiting behind unsaved typing ----------
test('an open build with unsaved typing never reports fully synchronised while a cloud change is waiting',async()=>{
  const {cloud,rec,mac,phone}=await pair();
  mac.ui.open.add('X');mac.ui.unsaved.add('X');
  phone.save({...rec,notes:'phone',...META});await phone.flushTimers();
  await mac.sync();
  assert.notEqual(mac.status(),'synced','not "synced" while the cloud change has not been applied');
  assert.equal(mac.status(),'pending');
  assert.ok(mac.pendingTimers()>0,'a retry is scheduled');
  await assert.rejects(()=>mac.window.KLABS_BUILD_SYNC.financialOperation('X','deposit',{id:'d1',amount:1}),/Synchronise/,'no payment while out of date');
  // typing is abandoned without saving: the next retry takes the cloud version and only then reports synchronised
  mac.ui.unsaved.delete('X');await mac.flushTimers();await mac.sync();
  assert.equal(mac.status(),'synced');assert.equal(mac.record('X').notes,'phone');noConflict(mac);
});
test('status returns to synchronised after the typing is saved and merged',async()=>{
  const {cloud,rec,mac,phone}=await pair();
  mac.ui.open.add('X');mac.ui.unsaved.add('X');
  phone.save({...rec,notes:'phone',...META});await phone.flushTimers();await mac.sync();
  assert.equal(mac.status(),'pending');
  mac.ui.unsaved.delete('X');mac.save({...rec,buildName:'Mac rename',savedAt:'2026-11-17T00:00:00.000Z'});await mac.flushTimers();await mac.sync();
  assert.equal(mac.status(),'synced');assert.equal(cloud.get('U','X').payload.notes,'phone');assert.equal(cloud.get('U','X').payload.buildName,'Mac rename');
});
