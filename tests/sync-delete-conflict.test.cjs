// Deleting a build that another device has changed must ask for review (regression from v237, 964ff88).
// Runs the real sync engine, journal and transport (tests/helpers/sync-harness.cjs). Synthetic data only.
// To see the failure on the unfixed engine:  SYNC_SRC_DIR=/path/to/older/checkout node --test tests/sync-delete-conflict.test.cjs
const assert=require('node:assert/strict');
const {test}=require('node:test');
const {makeCloud,makeDevice,build}=require('./helpers/sync-harness.cjs');
const META={savedAt:'2026-11-18T01:00:00.000Z',updatedAt:'2026-11-18T01:00:00.000Z'};

// One cloud row that both devices have synchronised (same revision).
async function pair(){
  const cloud=makeCloud();
  const rec=build('X',{customerName:'Synthetic Customer',payments:[{id:'p1',type:'deposit',amount:100,date:'2026-11-13'}]});
  cloud.seed('U','X',rec);
  const mk=async(name)=>{const d=makeDevice(cloud,'U',name);d.seedLocal(rec);await d.signIn();return d;};
  return {cloud,rec,mac:await mk('mac'),phone:await mk('phone')};
}
// The phone changes the build; the Mac (not yet aware of it) then deletes it.
async function staleDelete(){
  const env=await pair();
  env.phone.save({...env.rec,notes:'phone tweak',...META});await env.phone.flushTimers();await env.phone.sync();
  assert.equal(env.cloud.get('U','X').payload.notes,'phone tweak');
  env.mac.del('X');
  await env.mac.sync();
  return env;
}

test('deleting a build that another device changed raises a delete conflict for review (not an endless failed retry)',async()=>{
  const {cloud,mac}=await staleDelete();
  const conflict=mac.journal().conflicts.X;
  assert.ok(conflict,'the deletion is held for review');
  assert.equal(conflict.operation,'delete');
  assert.equal(conflict.cloud.notes,'phone tweak','the review shows the other device\'s version');
  assert.equal(mac.status(),'error','review needed, not a retryable failure');
  assert.equal(cloud.get('U','X').payload.notes,'phone tweak','the cloud copy (with its payments) is untouched');
  assert.equal(cloud.get('U','X').payload.payments.length,1);
  assert.deepEqual(mac.ids(),[],'the build stays deleted on this device until a decision is made');
  await mac.sync();await mac.sync();
  assert.ok(mac.journal().conflicts.X,'never cleared or reversed automatically');
  assert.ok(cloud.get('U','X'),'never deleted automatically');
});

test('review choice "keep the cloud version" restores the other device\'s version and deletes nothing',async()=>{
  const {cloud,mac}=await staleDelete();
  const conflict=mac.journal().conflicts.X;
  await mac.window.KLABS_BUILD_SYNC.resolveConflict('X','cloud',conflict.revision);
  assert.equal(mac.record('X').notes,'phone tweak');
  assert.deepEqual(Object.keys(mac.journal().conflicts),[]);
  assert.equal(cloud.get('U','X').payload.notes,'phone tweak');
  await mac.sync();
  assert.equal(mac.status(),'synced');
});

test('review choice "confirm deletion" deletes the cloud build',async()=>{
  const {cloud,mac,phone}=await staleDelete();
  const conflict=mac.journal().conflicts.X;
  await mac.window.KLABS_BUILD_SYNC.resolveConflict('X','local',conflict.revision);
  assert.equal(cloud.get('U','X'),undefined,'deleted in the cloud');
  assert.deepEqual(Object.keys(mac.journal().conflicts),[]);
  await mac.sync();
  assert.equal(mac.status(),'synced');
  await phone.sync();
  assert.deepEqual(phone.ids(),[],'the other device retires its unedited copy');
});

test('control: deleting a build nobody else changed still deletes it directly, with no review',async()=>{
  const {cloud,mac}=await pair();
  mac.del('X');
  await mac.sync();
  assert.equal(cloud.get('U','X'),undefined);
  assert.deepEqual(Object.keys(mac.journal().conflicts),[]);
  assert.equal(mac.status(),'synced');
});

test('control: a delete refused only because the device is offline stays a failed attempt, then completes',async()=>{
  const {cloud,mac}=await pair();
  mac.del('X');
  cloud.failures.network=true;
  await mac.sync();
  assert.equal(mac.status(),'failed');
  assert.deepEqual(Object.keys(mac.journal().conflicts),[]);
  cloud.failures.network=false;
  await mac.sync();
  assert.equal(cloud.get('U','X'),undefined);
  assert.equal(mac.status(),'synced');
});

// ---- v237 protections that must remain unchanged ----
test('unchanged v237 protection: "keep this device\'s version" is still refused for a SAVE conflict when this device has no changes of its own',async()=>{
  const {cloud,rec,mac,phone}=await pair();
  phone.save({...rec,notes:'phone tweak',...META});await phone.flushTimers();
  const row=cloud.get('U','X');
  const j=mac.journal();
  j.conflicts.X={id:'X',local:JSON.parse(JSON.stringify(mac.record('X'))),cloud:{...row.payload,id:'X'},revision:row.updated_at,operation:'save',reason:'Versions require review.',history:[]};
  mac.window.KLABS_BUILD_SYNC_JOURNAL.write('U',j);
  await assert.rejects(mac.window.KLABS_BUILD_SYNC.resolveConflict('X','local',row.updated_at),/no changes of its own/);
  assert.equal(cloud.get('U','X').payload.notes,'phone tweak','nothing uploaded');
});
test('a build with an issued invoice is never deleted, even by confirming a delete conflict',async()=>{
  const cloud=makeCloud();
  const rec=build('X',{customerName:'Synthetic Customer',issuedInvoice:{number:'INV-1',total:100}});
  cloud.seed('U','X',rec);
  const mk=async(name)=>{const d=makeDevice(cloud,'U',name);d.seedLocal(rec);await d.signIn();return d;};
  const mac=await mk('mac'),phone=await mk('phone');
  phone.save({...rec,notes:'phone tweak',...META});await phone.flushTimers();await phone.sync();
  mac.del('X');await mac.sync();
  const conflict=mac.journal().conflicts.X;
  assert.equal(conflict.operation,'delete');
  await assert.rejects(mac.window.KLABS_BUILD_SYNC.resolveConflict('X','local',conflict.revision),/issued invoice/);
  assert.ok(cloud.get('U','X'),'the invoiced build is kept in the cloud');
});
