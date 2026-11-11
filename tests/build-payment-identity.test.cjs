const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','js','ui.js'),'utf8');
function fn(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?source.length:end);
}
function harness(){
  const records=[
    {id:'first',buildNumber:'BUILD-901',savedAt:'2026-01-01',payments:[{amount:10}]},
    {id:'second',buildNumber:'BUILD-901',savedAt:'2026-01-01',payments:[{amount:20}]},
  ];
  const context=vm.createContext({
    quote:{id:'second',buildNumber:'BUILD-901'},activeSavedBuildRef:null,
    savedBuildRecords:()=>records,
    specificationValue:value=>String(value??'').trim(),
    normalizeNameKey:value=>String(value??'').trim().toLowerCase(),
  });
  vm.runInContext(fn('setActiveSavedBuildRef')+'\n'+fn('findCurrentSavedBuildTarget'),context);
  return {context,records};
}
test('duplicate build numbers resolve to the unique build ID when saving',()=>{
  const {context,records}=harness();
  context.setActiveSavedBuildRef('build',0,records[0]);
  assert.equal(context.findCurrentSavedBuildTarget().record.id,'second');
});
test('newly saved drafts use their saved reference ID despite empty draft ID',()=>{
  const {context,records}=harness();
  context.quote.id='';
  context.setActiveSavedBuildRef('build',1,records[1]);
  records.reverse();
  assert.equal(context.findCurrentSavedBuildTarget().record.id,'second');
});
test('a missing saved ID never falls back to another record with the same build number',()=>{
  const {context,records}=harness();
  context.setActiveSavedBuildRef('build',1,records[1]);
  records.pop();
  assert.equal(context.findCurrentSavedBuildTarget(),null);
});
test('a draft without a unique ID cannot overwrite a build with the same number',()=>{
  const {context}=harness();
  context.quote.id='';
  assert.equal(context.findCurrentSavedBuildTarget(),null);
});
